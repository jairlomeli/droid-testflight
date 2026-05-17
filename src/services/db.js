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
import { db } from './firebase'

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
export const addBuild = async ({ platformId, version, buildNumber, environment, apkUrl, changelog, expireDays = 90 }) => {
  const expiresAt = Timestamp.fromDate(
    new Date(Date.now() + expireDays * 24 * 60 * 60 * 1000)
  )

  // Agrega la build
  await addDoc(collection(db, 'builds'), {
    platformId,
    version,
    buildNumber: Number(buildNumber),
    environment,
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
