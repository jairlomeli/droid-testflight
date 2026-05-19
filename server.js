// server.js — DroidFlight webhook + static frontend server
import express from 'express'
import { fileURLToPath } from 'url'
import path from 'path'
import fs from 'fs'
import admin from 'firebase-admin'
import { Timestamp } from 'firebase-admin/firestore'

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
    /app_(prd|stg|qa)(?:_(galaxy|spc))?_(mobile|tv)-all-(\d+\.\d+\.\d+)-\d+_(\d+)\.apk/i
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
  const matches = text.match(/(?:https?:\/\/|gs:\/\/)[^\s"\\]+\.apk/gi) || []
  return [...new Set(matches)]
}

// Write one build to Firestore
async function saveBuild(build, expireDays = 90) {
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

  // Upsert version doc
  const verSnap = await db.collection('versions')
    .where('platformId', '==', build.platformId)
    .where('version',    '==', build.version)
    .get()

  if (verSnap.empty) {
    await db.collection('versions').add({
      platformId: build.platformId,
      version:    build.version,
      buildCount: 1,
      createdAt:  Timestamp.now(),
    })
  } else {
    const vDoc = verSnap.docs[0]
    await vDoc.ref.update({ buildCount: (vDoc.data().buildCount || 0) + 1 })
  }
}

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
  console.log(`[Webhook] Found ${urls.length} APK URL(s) in payload`)
  const builds = urls.map(parseApkUrl).filter(Boolean)
  console.log(`[Webhook] Parsed ${builds.length} valid build(s)`)

  if (!builds.length) {
    return res.status(400).json({ ok: false, error: 'No APK URLs found' })
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

// ── Serve static frontend ──────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'dist')))
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'))
})

const port = process.env.PORT || 3000
app.listen(port, () => console.log(`[Server] DroidFlight listening on :${port}`))
