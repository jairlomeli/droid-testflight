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

// ─── VERSIONS ─────────────────────────────────────────────────
export const getVersionsByPlatform = async (platformId) => {
  const snap = await getDocs(
    query(
      collection(db, 'versions'),
      where('platformId', '==', platformId),
      orderBy('createdAt', 'desc')
    )
  )
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

// ─── BUILDS ───────────────────────────────────────────────────
export const getBuildsByVersion = async (platformId, version) => {
  const snap = await getDocs(
    query(
      collection(db, 'builds'),
      where('platformId', '==', platformId),
      where('version', '==', version),
      where('active', '==', true),
      orderBy('buildNumber', 'desc')
    )
  )
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
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
  console.log('[import] currentUser:', user?.email, 'uid:', user?.uid)
  if (user) {
    const tokenResult = await user.getIdTokenResult(true)
    console.log('[import] claims after refresh:', tokenResult.claims)
    if (!tokenResult.claims.admin) {
      throw new Error('Tu cuenta no tiene permisos de admin. Cierra sesión, vuelve a entrar e intenta de nuevo.')
    }
  } else {
    throw new Error('No hay sesión activa.')
  }

  const urls = text.match(/https?:\/\/\S+\.apk/gi) || []
  console.log('[import] URLs encontradas:', urls?.length)

  const builds = urls.map(parseApkUrl).filter(Boolean)
  console.log('[import] Builds parseadas:', builds.length, builds)

  let saved = 0
  const errors = []
  for (const b of builds) {
    try {
      console.log('[import] Guardando:', b.platformId, b.environment, b.variant, b.version, b.buildNumber)
      await addBuild({ ...b, changelog: '', expireDays })
      saved++
      console.log('[import] ✅ Guardado #', saved)
    } catch (e) {
      console.error('[import] ❌ Error en build:', b, e)
      errors.push(`${b.environment} ${b.variant} ${b.platformId} #${b.buildNumber}: ${e.message}`)
    }
  }

  console.log('[import] Resultado:', saved, 'guardados,', errors.length, 'errores')
  return { saved, errors, total: builds.length }
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
    query(collection(db, 'invites'), where('token', '==', token), where('active', '==', true))
  )
  if (snap.empty) return null
  const data = snap.docs[0].data()
  // Verifica que no haya expirado
  if (data.expiresAt && data.expiresAt.toDate() < new Date()) return null
  return { id: snap.docs[0].id, ...data }
}

export const createInvite = async ({ name, platformId, expiresInDays = 365 }) => {
  const token = Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10)
  const expiresAt = Timestamp.fromDate(
    new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
  )
  await addDoc(collection(db, 'invites'), {
    token,
    name,
    platformId: platformId || null, // null = acceso a todas las plataformas
    active: true,
    expiresAt,
    createdAt: serverTimestamp(),
  })
  return token
}
