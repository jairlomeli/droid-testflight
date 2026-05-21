// server.js — DroidFlight webhook + static frontend server
import express from 'express'
import { fileURLToPath } from 'url'
import path from 'path'
import fs from 'fs'
import admin from 'firebase-admin'
import { Timestamp } from 'firebase-admin/firestore'
import cron from 'node-cron'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
app.use(express.json({ limit: '2mb' }))

// ── Firebase Admin init ────────────────────────────────────────────────────
let db = null

function initFirebase() {
  console.log('[Firebase] Starting initialization...')

  let serviceAccount = null

  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    console.log('[Firebase] Found FIREBASE_SERVICE_ACCOUNT env var, parsing JSON...')
    try {
      serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
      console.log('[Firebase] Parsed service account for project:', serviceAccount.project_id)
    } catch (e) {
      console.error('[Firebase] Failed to parse FIREBASE_SERVICE_ACCOUNT JSON:', e.message)
      return
    }
  } else {
    const localPath = path.join(__dirname, 'serviceAccount.json')
    if (fs.existsSync(localPath)) {
      console.log('[Firebase] Loading serviceAccount.json from disk...')
      try {
        serviceAccount = JSON.parse(fs.readFileSync(localPath, 'utf8'))
        console.log('[Firebase] Loaded service account for project:', serviceAccount.project_id)
      } catch (e) {
        console.error('[Firebase] Failed to read serviceAccount.json:', e.message)
        return
      }
    } else {
      console.error('[Firebase] No service account found — set FIREBASE_SERVICE_ACCOUNT env var')
      return
    }
  }

  try {
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) })
    db = admin.firestore()
    console.log('[Firebase] Initialized successfully. Firestore ready.')
  } catch (e) {
    console.error('[Firebase] initializeApp error:', e.message)
  }
}

initFirebase()

// ── APK URL parser (mirrors src/services/db.js parseApkUrl) ───────────────
function parseApkUrl(rawUrl) {
  const url = rawUrl.trim()
  const filename = url.split('/').pop().split('?')[0]
  const m = filename.match(
    /app_(prd|stg|qa)(?:_(galaxy|spc))?_(mobile|tv)-(?:all|prd|stg|qa)-(\d+\.\d+\.\d+)-\d+_(\d+)\.apk/i
  )
  if (!m) return null
  const [, envRaw, variantRaw, platformRaw, version, buildCode] = m
  return {
    platformId:  platformRaw.toLowerCase() === 'tv' ? 'androidtv' : 'mobile',
    environment: { prd: 'Prod', stg: 'STG', qa: 'QA' }[envRaw.toLowerCase()],
    variant:     variantRaw ? { galaxy: 'Galaxy', spc: 'Special' }[variantRaw.toLowerCase()] : 'Standard',
    version,
    buildNumber: Number(buildCode),
    apkUrl:      url,
  }
}

// Extract every APK URL from anywhere in the Slack payload
function extractApkUrls(payload) {
  const text = JSON.stringify(payload)
  const matches = text.match(/https?:\/\/[^\s"<>]+\.apk/gi) || []
  // Also catch gs:// paths
  const gsMatches = text.match(/gs:\/\/[^\s"<>]+\.apk/gi) || []
  return [...new Set([...matches, ...gsMatches])]
}

// Write one build to Firestore
async function saveBuild(build, expireDays = 60) {
  const expiresAt = Timestamp.fromDate(
    new Date(Date.now() + expireDays * 24 * 60 * 60 * 1000)
  )

  await db.collection('builds').add({
    platformId:  build.platformId,
    environment: build.environment,
    variant:     build.variant,
    version:     build.version,
    buildNumber: build.buildNumber,
    apkUrl:      build.apkUrl,
    expiresAt,
    active:      true,
    createdAt:   Timestamp.now(),
  })

  // Upsert version doc — track latest expiresAt for display in tester
  const verSnap = await db.collection('versions')
    .where('platformId', '==', build.platformId)
    .where('version',    '==', build.version)
    .get()

  if (verSnap.empty) {
    await db.collection('versions').add({
      platformId: build.platformId,
      version:    build.version,
      buildCount: 1,
      expiresAt,
      createdAt:  Timestamp.now(),
    })
  } else {
    const vDoc = verSnap.docs[0]
    const current = vDoc.data().expiresAt
    const updates = { buildCount: (vDoc.data().buildCount || 0) + 1 }
    if (!current || expiresAt.toMillis() > current.toMillis()) updates.expiresAt = expiresAt
    await vDoc.ref.update(updates)
  }
}

// ── Cleanup expired builds ─────────────────────────────────────────────────
async function cleanupExpiredBuilds() {
  console.log('[Cleanup] Starting expired build cleanup...')
  const now = Timestamp.now()

  const expiredSnap = await db.collection('builds')
    .where('expiresAt', '<=', now)
    .get()

  if (expiredSnap.empty) {
    console.log('[Cleanup] No expired builds found.')
    return { deleted: 0, versionsDeleted: 0 }
  }

  const affectedVersions = new Set()
  for (const docRef of expiredSnap.docs) {
    const { platformId, version } = docRef.data()
    affectedVersions.add(`${platformId}|${version}`)
    await docRef.ref.delete()
  }

  let versionsDeleted = 0
  for (const key of affectedVersions) {
    const [platformId, version] = key.split('|')
    const remaining = await db.collection('builds')
      .where('platformId', '==', platformId)
      .where('version',    '==', version)
      .get()

    const verSnap = await db.collection('versions')
      .where('platformId', '==', platformId)
      .where('version',    '==', version)
      .get()

    if (!verSnap.empty) {
      if (remaining.empty) {
        await verSnap.docs[0].ref.delete()
        versionsDeleted++
      } else {
        // Recalculate latest expiresAt from remaining builds
        let latestExpiry = null
        for (const b of remaining.docs) {
          const exp = b.data().expiresAt
          if (exp && (!latestExpiry || exp.toMillis() > latestExpiry.toMillis())) latestExpiry = exp
        }
        await verSnap.docs[0].ref.update({ buildCount: remaining.size, ...(latestExpiry && { expiresAt: latestExpiry }) })
      }
    }
  }

  console.log(`[Cleanup] Done: ${expiredSnap.size} builds deleted, ${versionsDeleted} empty versions removed`)
  return { deleted: expiredSnap.size, versionsDeleted }
}

// ── Admin API: verifica Firebase ID token con claim admin ─────────────────
async function requireAdminToken(req, res, next) {
  const bearer = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim()
  if (!bearer) return res.status(401).json({ ok: false, error: 'No token provided' })
  try {
    const decoded = await admin.auth().verifyIdToken(bearer)
    if (!decoded.admin) return res.status(403).json({ ok: false, error: 'Not an admin' })
    req.adminUser = decoded
    next()
  } catch (e) {
    return res.status(401).json({ ok: false, error: 'Invalid or expired token' })
  }
}

function genShortCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

// POST /api/invites — crear nuevo código de invitación
app.post('/api/invites', requireAdminToken, async (req, res) => {
  if (!db) return res.status(500).json({ ok: false, error: 'Firestore not initialized' })
  const { name, platformId, expiresInDays } = req.body
  if (!name) return res.status(400).json({ ok: false, error: 'name is required' })

  const token = Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10)
  const shortCode = genShortCode()

  const data = {
    token,
    shortCode,
    name,
    platformId: platformId || null,
    active:     true,
    createdAt:  Timestamp.now(),
  }
  if (expiresInDays != null) {
    data.expiresAt = Timestamp.fromDate(
      new Date(Date.now() + Number(expiresInDays) * 24 * 60 * 60 * 1000)
    )
  }

  await db.collection('invites').add(data)
  console.log(`[Invites] Created "${name}" → ${shortCode}`)
  res.json({ ok: true, token, shortCode })
})

// POST /api/invites/:id/deactivate — desactivar un código
app.post('/api/invites/:id/deactivate', requireAdminToken, async (req, res) => {
  if (!db) return res.status(500).json({ ok: false, error: 'Firestore not initialized' })
  await db.collection('invites').doc(req.params.id).update({ active: false })
  console.log(`[Invites] Deactivated ${req.params.id}`)
  res.json({ ok: true })
})

// DELETE /api/invites/:id — eliminar permanentemente un código
app.delete('/api/invites/:id', requireAdminToken, async (req, res) => {
  if (!db) return res.status(500).json({ ok: false, error: 'Firestore not initialized' })
  await db.collection('invites').doc(req.params.id).delete()
  console.log(`[Invites] Deleted ${req.params.id}`)
  res.json({ ok: true })
})

// ── Webhook endpoint ───────────────────────────────────────────────────────
app.post('/api/webhook', async (req, res) => {
  const expectedToken = process.env.DROIDFLIGHT_WEBHOOK_TOKEN
  const auth = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim()

  if (!expectedToken || auth !== expectedToken) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' })
  }

  if (!db) {
    console.error('[Webhook] Firestore not initialized — check FIREBASE_SERVICE_ACCOUNT')
    return res.status(500).json({ ok: false, error: 'Firestore not initialized' })
  }

  const urls = extractApkUrls(req.body)
  console.log(`[Webhook] Found ${urls.length} APK URL(s):`, urls)
  if (!urls.length) {
    return res.status(400).json({ ok: false, error: 'No APK URLs found in payload' })
  }

  const builds = urls.map(parseApkUrl).filter(Boolean)
  console.log(`[Webhook] Parsed ${builds.length} valid build(s) from ${urls.length} URL(s)`)

  if (!builds.length) {
    return res.status(400).json({ ok: false, error: `Found ${urls.length} APK URL(s) but none matched the expected filename pattern (app_<env>_<platform>-all-<version>_<code>.apk)` })
  }

  const existingSnap = await db.collection('builds').get()
  const existingKeys = new Set(
    existingSnap.docs.map(d => {
      const { platformId, version, buildNumber } = d.data()
      return `${platformId}|${version}|${buildNumber}`
    })
  )

  let saved = 0, skipped = 0, errors = 0
  for (const build of builds) {
    const key = `${build.platformId}|${build.version}|${build.buildNumber}`
    if (existingKeys.has(key)) { skipped++; continue }
    try {
      await saveBuild(build)
      existingKeys.add(key)
      saved++
    } catch (e) {
      console.error(`[Webhook] saveBuild error [${key}]:`, e.message)
      errors++
    }
  }

  console.log(`[Webhook] Done: saved=${saved} skipped=${skipped} errors=${errors}`)
  res.json({ ok: true, saved, skipped, errors })
})

// ── Cleanup endpoint ───────────────────────────────────────────────────────
app.get('/api/cleanup', async (req, res) => {
  const expectedToken = process.env.DROIDFLIGHT_WEBHOOK_TOKEN
  const auth = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim()
  if (!expectedToken || auth !== expectedToken) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' })
  }
  if (!db) return res.status(500).json({ ok: false, error: 'Firestore not initialized' })
  try {
    const result = await cleanupExpiredBuilds()
    res.json({ ok: true, ...result })
  } catch (e) {
    console.error('[Cleanup] Error:', e.message)
    res.status(500).json({ ok: false, error: e.message })
  }
})

// ── Daily cron cleanup (runs at 03:00 server time) ─────────────────────────
cron.schedule('0 3 * * *', async () => {
  if (!db) return
  try { await cleanupExpiredBuilds() } catch (e) { console.error('[Cron] Cleanup error:', e.message) }
})
console.log('[Cron] Daily cleanup scheduled at 03:00')

// ── Serve static frontend ──────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'dist')))
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'))
})

const port = process.env.PORT || 3000
app.listen(port, () => console.log(`[Server] DroidFlight listening on :${port}`))
