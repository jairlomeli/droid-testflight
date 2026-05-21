// src/services/db.js
// Todas las operaciones con Firestore
//
// ESTRUCTURA EN FIRESTORE:
//
// platforms (collection)
//   └── {platformId}          (doc: "mobile" | "androidtv" | "firetv")
//
// versions (collection)
//   └── {versionId}           (doc auto-id)
//
// builds (collection)
//   └── {buildId}             (doc auto-id)
//
// invites (collection)
//   └── {inviteId}            (doc auto-id)
//         ...
//         devices/ (subcollection)
//           └── {fingerprint} (doc per device)
//
// accessLogs (collection)
//   └── {logId}               (doc auto-id)
//
// installLogs (collection)
//   └── {logId}               (doc auto-id)

import {
  collection, doc, getDocs, addDoc, updateDoc, deleteDoc, setDoc,
  query, where, orderBy, serverTimestamp, Timestamp, limit
} from 'firebase/firestore'
import { db, auth } from './firebase'

// ─── DEVICE FINGERPRINT ───────────────────────────────────────
// Combinación de userAgent + resolución + timezone → hash hex de 16 chars
export function getDeviceFingerprint() {
  const raw = `${navigator.userAgent}|${screen.width}x${screen.height}|${Intl.DateTimeFormat().resolvedOptions().timeZone}`
  let h1 = 5381, h2 = 0
  for (let i = 0; i < raw.length; i++) {
    const c = raw.charCodeAt(i)
    h1 = ((h1 << 5) + h1 + c) >>> 0
    h2 = (h2 * 31 + c) >>> 0
  }
  return `${h1.toString(16).padStart(8, '0')}${h2.toString(16).padStart(8, '0')}`
}

function detectDeviceType() {
  const ua = navigator.userAgent
  if (/TV|television|smart-tv|SmartTV|BRAVIA|webOS|Tizen/i.test(ua)) return 'TV'
  if (/Mobi|Android|iPhone|iPad/i.test(ua)) return 'Mobile'
  return 'Desktop'
}

// Verifica y registra el dispositivo en la subcolección del invite.
// Retorna { ok: true } si se permite, { ok: false, reason: 'device_limit' } si alcanzó el límite.
async function checkAndRegisterDevice(inviteDocId) {
  const fp = getDeviceFingerprint()
  const devicesRef = collection(db, 'invites', inviteDocId, 'devices')
  const devSnap = await getDocs(devicesRef)

  // Dispositivo ya registrado → dejarlo entrar sin contar como nuevo
  if (devSnap.docs.some(d => d.id === fp)) return { ok: true }

  // Límite de 4 dispositivos
  if (devSnap.size >= 4) return { ok: false, reason: 'device_limit' }

  // Registrar nuevo dispositivo
  await setDoc(doc(db, 'invites', inviteDocId, 'devices', fp), {
    registeredAt: serverTimestamp(),
    userAgent:    navigator.userAgent.slice(0, 200),
    deviceType:   detectDeviceType(),
  })
  return { ok: true }
}

// ─── PLATFORMS ────────────────────────────────────────────────
export const getPlatforms = async () => {
  const snap = await getDocs(query(collection(db, 'platforms'), orderBy('order')))
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

// Compara dos strings de versión semántica: "5.0.1" > "4.46.0" > "4.44.2"
function compareSemverDesc(a, b) {
  const pa = String(a).split('.').map(Number)
  const pb = String(b).split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    const diff = (pb[i] ?? 0) - (pa[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

// ─── VERSIONS ─────────────────────────────────────────────────
export const getVersionsByPlatform = async (platformId) => {
  const snap = await getDocs(
    query(collection(db, 'versions'), where('platformId', '==', platformId))
  )
  const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }))
  return docs.sort((a, b) => compareSemverDesc(a.version, b.version))
}

// ─── BUILDS ───────────────────────────────────────────────────
export const getBuildsByVersion = async (platformId, version) => {
  const snap = await getDocs(
    query(
      collection(db, 'builds'),
      where('platformId', '==', platformId),
      where('version', '==', version),
      where('active', '==', true),
    )
  )
  const now = Date.now()
  const docs = snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(b => {
      if (!b.expiresAt) return true
      return b.expiresAt.toDate().getTime() > now
    })
  return docs.sort((a, b) => b.buildNumber - a.buildNumber)
}

// ─── ADMIN: ADD BUILD ─────────────────────────────────────────
export const addBuild = async ({ platformId, version, buildNumber, environment, variant = 'Standard', apkUrl, changelog, expireDays = 60 }) => {
  const expiresAt = Timestamp.fromDate(
    new Date(Date.now() + expireDays * 24 * 60 * 60 * 1000)
  )

  await addDoc(collection(db, 'builds'), {
    platformId,
    version,
    buildNumber: Number(buildNumber),
    environment,
    variant,
    apkUrl,
    changelog,
    expiresAt,
    active: true,
    createdAt: serverTimestamp(),
  })

  const verSnap = await getDocs(
    query(
      collection(db, 'versions'),
      where('platformId', '==', platformId),
      where('version', '==', version)
    )
  )

  if (verSnap.empty) {
    await addDoc(collection(db, 'versions'), {
      platformId,
      version,
      buildCount: 1,
      expiresAt,
      createdAt: serverTimestamp(),
    })
  } else {
    const verDoc = verSnap.docs[0]
    const currentExpiry = verDoc.data().expiresAt
    const updates = { buildCount: (verDoc.data().buildCount || 0) + 1 }
    if (!currentExpiry || expiresAt.toMillis() > currentExpiry.toMillis()) updates.expiresAt = expiresAt
    await updateDoc(doc(db, 'versions', verDoc.id), updates)
  }
}

// ─── ADMIN: PARSE & IMPORT BULK URLs ──────────────────────────
export function parseApkUrl(rawUrl) {
  const url = rawUrl.trim()
  const filename = url.split('/').pop().split('?')[0]
  const m = filename.match(
    /app_(prd|stg|qa)(?:_(galaxy|spc))?_(mobile|tv)-(?:all|prd|stg|qa)-(\d+\.\d+\.\d+)-\d+_(\d+)\.apk/i
  )
  if (!m) return null
  const [, envRaw, variantRaw, platformRaw, version, buildCode] = m
  return {
    platformId:  platformRaw === 'tv' ? 'androidtv' : 'mobile',
    environment: { prd: 'Prod', stg: 'STG', qa: 'QA' }[envRaw],
    variant:     variantRaw ? { galaxy: 'Galaxy', spc: 'Special' }[variantRaw] : 'Standard',
    version,
    buildNumber: Number(buildCode),
    apkUrl:      url,
  }
}

export async function importBuilds(text, expireDays = 60) {
  const user = auth.currentUser
  if (user) {
    const tokenResult = await user.getIdTokenResult(true)
    if (!tokenResult.claims.admin) {
      throw new Error('Tu cuenta no tiene permisos de admin. Cierra sesión, vuelve a entrar e intenta de nuevo.')
    }
  } else {
    throw new Error('No hay sesión activa.')
  }

  const builds = (text.match(/https?:\/\/\S+\.apk/gi) || [])
    .map(parseApkUrl).filter(Boolean)

  const existingSnap = await getDocs(collection(db, 'builds'))
  const existingKeys = new Set(
    existingSnap.docs.map(d => {
      const { platformId, version, buildNumber } = d.data()
      return `${platformId}|${version}|${buildNumber}`
    })
  )

  let saved = 0, skipped = 0
  const errors = []
  for (const b of builds) {
    const key = `${b.platformId}|${b.version}|${b.buildNumber}`
    if (existingKeys.has(key)) {
      skipped++
      continue
    }
    try {
      await addBuild({ ...b, changelog: '', expireDays })
      existingKeys.add(key)
      saved++
    } catch (e) {
      errors.push(`${b.environment} ${b.variant} ${b.platformId} #${b.buildNumber}: ${e.message}`)
    }
  }

  return { saved, skipped, errors, total: builds.length }
}

// ─── ADMIN: DEDUP BUILDS ──────────────────────────────────────
export async function deduplicateBuilds() {
  const snap = await getDocs(collection(db, 'builds'))
  const all  = snap.docs.map(d => ({ _docId: d.id, ...d.data() }))

  const groups = {}
  for (const b of all) {
    const key = `${b.platformId}|${b.version}|${b.buildNumber}`
    if (!groups[key]) groups[key] = []
    groups[key].push(b)
  }

  let deleted = 0
  for (const builds of Object.values(groups)) {
    if (builds.length > 1) {
      for (const b of builds.slice(1)) {
        await deleteDoc(doc(db, 'builds', b._docId))
        deleted++
      }
    }
  }

  const [vSnap, bSnap] = await Promise.all([
    getDocs(collection(db, 'versions')),
    getDocs(collection(db, 'builds')),
  ])
  const remaining = bSnap.docs.map(d => d.data())
  for (const vDoc of vSnap.docs) {
    const { platformId, version } = vDoc.data()
    const count = remaining.filter(b => b.platformId === platformId && b.version === version).length
    await updateDoc(doc(db, 'versions', vDoc.id), { buildCount: count })
  }

  return deleted
}

// ─── ADMIN: DEACTIVATE BUILD ──────────────────────────────────
export const deactivateBuild = async (buildId) => {
  await updateDoc(doc(db, 'builds', buildId), { active: false })
}

// ─── INVITE LINKS ─────────────────────────────────────────────

export const validateInviteToken = async (token) => {
  const snap = await getDocs(
    query(collection(db, 'invites'), where('token', '==', token))
  )
  if (snap.empty) return { ok: false, reason: 'not_found' }
  const data = snap.docs[0].data()
  if (!data.active) return { ok: false, reason: 'deactivated' }
  if (data.expiresAt && data.expiresAt.toDate() < new Date()) return { ok: false, reason: 'expired' }

  const devCheck = await checkAndRegisterDevice(snap.docs[0].id)
  if (!devCheck.ok) return devCheck

  return { ok: true, id: snap.docs[0].id, ...data }
}

function genShortCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

export const createInvite = async ({ name, platformId, expiresInDays = null }) => {
  const token     = Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10)
  const shortCode = genShortCode()

  const data = {
    token,
    shortCode,
    name,
    platformId:  platformId || null,
    active:      true,
    createdAt:   serverTimestamp(),
  }
  if (expiresInDays != null) {
    data.expiresAt = Timestamp.fromDate(
      new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
    )
  }

  await addDoc(collection(db, 'invites'), data)
  return { token, shortCode }
}

// options.skipDeviceCheck = true cuando se restaura sesión desde localStorage
export const validateShortCode = async (code, { skipDeviceCheck = false } = {}) => {
  const snap = await getDocs(
    query(collection(db, 'invites'), where('shortCode', '==', code.toUpperCase().trim()))
  )
  if (snap.empty) return { ok: false, reason: 'not_found' }
  const data = snap.docs[0].data()
  if (!data.active) return { ok: false, reason: 'deactivated' }
  if (data.expiresAt && data.expiresAt.toDate() < new Date()) return { ok: false, reason: 'expired' }

  if (!skipDeviceCheck) {
    const devCheck = await checkAndRegisterDevice(snap.docs[0].id)
    if (!devCheck.ok) return devCheck
  }

  return { ok: true, id: snap.docs[0].id, ...data }
}

// Devuelve invites con deviceCount desde la subcolección
export const getInvites = async () => {
  const snap = await getDocs(
    query(collection(db, 'invites'), orderBy('createdAt', 'desc'))
  )
  const invites = snap.docs.map(d => ({ id: d.id, ...d.data() }))
  const withCounts = await Promise.all(
    invites.map(async inv => {
      const devSnap = await getDocs(collection(db, 'invites', inv.id, 'devices'))
      return { ...inv, deviceCount: devSnap.size }
    })
  )
  return withCounts
}

export const deactivateInvite = async (id) => {
  await updateDoc(doc(db, 'invites', id), { active: false })
}

// ─── ACCESS LOGS ──────────────────────────────────────────────

export const logAccess = async ({ inviteId, code, inviteName }) => {
  try {
    await addDoc(collection(db, 'accessLogs'), {
      inviteId:    inviteId || null,
      code:        code || null,
      inviteName:  inviteName || null,
      userAgent:   navigator.userAgent.slice(0, 200),
      deviceType:  detectDeviceType(),
      timestamp:   serverTimestamp(),
    })
  } catch {
    // No bloquear el flujo si el log falla
  }
}

export const logInstall = async ({ buildId, version, environment, platformId }) => {
  try {
    await addDoc(collection(db, 'installLogs'), {
      buildId:     buildId || null,
      version:     version || null,
      environment: environment || null,
      platformId:  platformId || null,
      code:        sessionStorage.getItem('df_invite_code') || null,
      userAgent:   navigator.userAgent.slice(0, 200),
      deviceType:  detectDeviceType(),
      timestamp:   serverTimestamp(),
    })
  } catch {
    // No bloquear el flujo si el log falla
  }
}

export const getAccessLogs = async () => {
  const snap = await getDocs(
    query(collection(db, 'accessLogs'), orderBy('timestamp', 'desc'), limit(100))
  )
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

export const getInstallLogs = async () => {
  const snap = await getDocs(
    query(collection(db, 'installLogs'), orderBy('timestamp', 'desc'), limit(100))
  )
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}
