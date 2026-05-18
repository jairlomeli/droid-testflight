// src/services/db.js
// Todas las operaciones con Firestore
//
// ESTRUCTURA EN FIRESTORE:
//
// platforms (collection)
//   └── {platformId}          (doc: "mobile" | "androidtv" | "firetv")
//         name: "Mobile"
//         icon: "📱"
//         order: 1
//
// versions (collection)
//   └── {versionId}           (doc auto-id)
//         platformId: "mobile"
//         version: "5.0.1"
//         buildCount: 3
//         createdAt: timestamp
//
// builds (collection)
//   └── {buildId}             (doc auto-id)
//         platformId: "mobile"
//         version: "5.0.1"
//         buildNumber: 3201
//         environment: "Prod"  // "Prod" | "STG" | "QA"
//         apkUrl: "https://github.com/.../releases/download/..."
//         changelog: "- Fix crash\n- Mejora de rendimiento"
//         expiresAt: timestamp
//         createdAt: timestamp
//         active: true

import {
  collection, doc, getDocs, addDoc, updateDoc, deleteDoc,
  query, where, orderBy, serverTimestamp, Timestamp
} from 'firebase/firestore'
import { db, auth } from './firebase'

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
  const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }))
  // Sort in JS to avoid needing composite indexes
  return docs.sort((a, b) => b.buildNumber - a.buildNumber)
}

// ─── ADMIN: ADD BUILD ─────────────────────────────────────────
export const addBuild = async ({ platformId, version, buildNumber, environment, variant = 'Standard', apkUrl, changelog, expireDays = 90 }) => {
  const expiresAt = Timestamp.fromDate(
    new Date(Date.now() + expireDays * 24 * 60 * 60 * 1000)
  )

  // Agrega la build
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

  // Verifica si ya existe la versión, si no la crea
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
      createdAt: serverTimestamp(),
    })
  } else {
    // Incrementa el contador
    const verDoc = verSnap.docs[0]
    await updateDoc(doc(db, 'versions', verDoc.id), {
      buildCount: (verDoc.data().buildCount || 0) + 1,
    })
  }
}

// ─── ADMIN: PARSE & IMPORT BULK URLs ──────────────────────────
// Parsea una URL de APK y extrae plataforma, ambiente, variante, versión y build number.
// Formato esperado:
//   app_{env}[_{variant}]_{platform}-all-{version}-{buildNum}_{buildCode}.apk
export function parseApkUrl(rawUrl) {
  const url = rawUrl.trim()
  const filename = url.split('/').pop().split('?')[0]
  const m = filename.match(
    /app_(prd|stg|qa)(?:_(galaxy|spc))?_(mobile|tv)-all-(\d+\.\d+\.\d+)-\d+_(\d+)\.apk/i
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

export async function importBuilds(text, expireDays = 90) {
  // Force token refresh so Firestore rules see the admin claim
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

  // Carga claves existentes para prevenir duplicados en tiempo de importación
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
      existingKeys.add(key) // evita duplicar si el texto tiene la misma URL dos veces
      saved++
    } catch (e) {
      errors.push(`${b.environment} ${b.variant} ${b.platformId} #${b.buildNumber}: ${e.message}`)
    }
  }

  return { saved, skipped, errors, total: builds.length }
}

// ─── ADMIN: DEDUP BUILDS ──────────────────────────────────────
// Elimina builds duplicadas dejando solo 1 por (platformId + version + buildNumber).
// Recalcula buildCount en la colección versions.
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
      // Conserva el primero, elimina el resto
      for (const b of builds.slice(1)) {
        await deleteDoc(doc(db, 'builds', b._docId))
        deleted++
      }
    }
  }

  // Recalcula buildCount en versions
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
// Los links de invitación son simplemente tokens guardados en Firestore.
// Un tester accede con: droidflight.app/invite/{token}

export const validateInviteToken = async (token) => {
  const snap = await getDocs(
    query(collection(db, 'invites'), where('token', '==', token))
  )
  if (snap.empty) return { ok: false, reason: 'not_found' }
  const data = snap.docs[0].data()
  if (!data.active) return { ok: false, reason: 'deactivated' }
  if (data.expiresAt && data.expiresAt.toDate() < new Date()) return { ok: false, reason: 'expired' }
  return { ok: true, id: snap.docs[0].id, ...data }
}

// Genera un código corto memorable de 6 caracteres (sin chars ambiguos)
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
  // null = sin caducidad (nunca expira)
  if (expiresInDays != null) {
    data.expiresAt = Timestamp.fromDate(
      new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
    )
  }

  await addDoc(collection(db, 'invites'), data)
  return { token, shortCode }
}

export const validateShortCode = async (code) => {
  const snap = await getDocs(
    query(collection(db, 'invites'), where('shortCode', '==', code.toUpperCase().trim()))
  )
  if (snap.empty) return { ok: false, reason: 'not_found' }
  const data = snap.docs[0].data()
  if (!data.active) return { ok: false, reason: 'deactivated' }
  if (data.expiresAt && data.expiresAt.toDate() < new Date()) return { ok: false, reason: 'expired' }
  return { ok: true, id: snap.docs[0].id, ...data }
}

export const getInvites = async () => {
  const snap = await getDocs(
    query(collection(db, 'invites'), orderBy('createdAt', 'desc'))
  )
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

export const deactivateInvite = async (id) => {
  await updateDoc(doc(db, 'invites', id), { active: false })
}
