// src/services/firebase.js
// ─────────────────────────────────────────────────────────────
// INSTRUCCIONES DE CONFIGURACIÓN:
// 1. Ve a https://console.firebase.google.com
// 2. Crea un proyecto llamado "droidflight"
// 3. Agrega una app Web
// 4. Copia los valores de firebaseConfig y pégalos aquí
// 5. Activa Firestore Database (modo producción)
// 6. Activa Authentication → Email/Password
// ─────────────────────────────────────────────────────────────

import { initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'
import { getAuth } from 'firebase/auth'

const firebaseConfig = {
  apiKey: "AIzaSyDC6Rrm0seqpVe6V-v_C_s_2BteRpHF8bA",
  authDomain: "droidflight-956ac.firebaseapp.com",
  projectId: "droidflight-956ac",
  storageBucket: "droidflight-956ac.firebasestorage.app",
  messagingSenderId: "365806344481",
  appId: "1:365806344481:web:837fe99a05b5156d15c660"
}

const app  = initializeApp(firebaseConfig)

export const db   = getFirestore(app)
export const auth = getAuth(app)
export default app
