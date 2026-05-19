// server.js — DroidFlight webhook + static frontend server
import express from 'express'
import { createRequire } from 'module'
import { fileURLToPath } from 'url'
import path from 'path'
import fs from 'fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
app.use(express.json({ limit: '2mb' }))

// ── Firebase Admin init ────────────────────────────────────────────────────
// In production (Railway): set FIREBASE_SERVICE_ACCOUNT env var with the
// full JSON content of serviceAccount.json.
// Locally: reads serviceAccount.json from project root.
let db
try {
  const { initializeApp, cert } = await import('firebase-admin/app')
  const { getFirestore, Timestamp: TS } = await import('firebase-admin/firestore')

  let serviceAccount
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
  } else {
    const localPath = path.join(__dirname, 'serviceAccount.json')
    if (fs.existsSync(localPath)) {
      serviceAccount = JSON.parse(fs.readFileSync(localPath, 'utf8'))
    }
  }

  if (!serviceAccount) throw new Error('No Firebase service account found')
  initializeApp({ credential: cert(serviceAccount) })
  db = getFirestore()
  console.log('Firebase Admin initialized')

  // make Timestamp available module-wide
  global._TS = TS
} catch (e) {
  console.error('Firebase Admin init error:', e.message)
}

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

// Write one build to Firestore (same logic as importBuilds in db.js)
async function saveBuild(build, expireDays = 90) {
  const TS = global._TS
  const expiresAt = TS.fromDate(new Date(Date.now() + expireDays * 24 * 60 * 60 * 1000))

  await db.collection('builds').add({
    platformId:  build.platformId,
    environment: build.environment,
    variant:     build.variant,
    version:     build.version,
    buildNumber: build.buildNumber,
    apkUrl:      build.apkUrl,
    expiresAt,
    active:      true,
    createdAt:   TS.now(),
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
      createdAt:  TS.now(),
    })
  } else {
    const vDoc = verSnap.docs[0]
    await vDoc.ref.update({ buildCount: (vDoc.data().buildCount || 0) + 1 })
  }
}

// ── Webhook endpoint ───────────────────────────────────────────────────────
app.post('/api/webhook', async (req, res) => {
  // Auth
  const expectedToken = process.env.DROIDFLIGHT_WEBHOOK_TOKEN
  const auth = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  if (!expectedToken || auth !== expectedToken) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' })
  }

  if (!db) {
    return res.status(500).json({ ok: false, error: 'Firestore not initialized' })
  }

  // Extract and parse APK URLs from the entire payload
  const urls = extractApkUrls(req.body)
  const builds = urls.map(parseApkUrl).filter(Boolean)

  if (!builds.length) {
    return res.status(400).json({ ok: false, error: 'No APK URLs found' })
  }

  // Load existing keys to skip duplicates
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
      console.error(`Webhook saveBuild error [${key}]:`, e.message)
      errors++
    }
  }

  console.log(`Webhook processed: saved=${saved} skipped=${skipped} errors=${errors}`)
  res.json({ ok: true, saved, skipped, errors })
})

// ── Serve static frontend ──────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'dist')))
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'))
})

const port = process.env.PORT || 3000
app.listen(port, () => console.log(`DroidFlight listening on :${port}`))
