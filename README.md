# 🚀 DroidFlight — Guía de instalación completa

TestFlight para Android. Distribuye APKs a testers en celulares, Android TV y Fire TV.

---

## 📁 Estructura del proyecto

```
droidflight/
├── src/
│   ├── services/
│   │   ├── firebase.js     ← Configuración de Firebase
│   │   └── db.js           ← Todas las operaciones con Firestore
│   ├── hooks/
│   │   └── useAuth.js      ← Autenticación
│   ├── pages/
│   │   ├── PlatformsPage.jsx  ← Pantalla 1: Mobile / Android TV / Fire TV
│   │   ├── VersionsPage.jsx   ← Pantalla 2: Lista de versiones (5.0.1, 4.46.0...)
│   │   ├── BuildsPage.jsx     ← Pantalla 3: Compilaciones con botón Instalar
│   │   ├── AdminPage.jsx      ← Panel de admin: publicar builds + links
│   │   ├── LoginPage.jsx      ← Login de admin
│   │   └── InvitePage.jsx     ← Landing del link de invitación
│   ├── components/
│   │   ├── Nav.jsx
│   │   └── TabBar.jsx
│   ├── App.jsx             ← Rutas
│   ├── main.jsx
│   └── index.css           ← Estilos (tema oscuro como TestFlight)
├── firestore.rules         ← Reglas de seguridad de Firestore
├── firebase.json           ← Config de hosting
└── package.json
```

---

## ⚙️ PASO 1 — Crear proyecto en Firebase

1. Ve a https://console.firebase.google.com
2. Clic en **Agregar proyecto** → nombre: `droidflight`
3. Desactiva Google Analytics (opcional)
4. Una vez creado, clic en **"</> Web"** para agregar una app web
5. Nombre: `droidflight-web` → clic en **Registrar app**
6. Copia el objeto `firebaseConfig` que aparece

---

## ⚙️ PASO 2 — Configurar Firebase en el código

Abre `src/services/firebase.js` y reemplaza los valores:

```js
const firebaseConfig = {
  apiKey:            "AIzaSy...",        // ← Tu valor
  authDomain:        "droidflight.firebaseapp.com",
  projectId:         "droidflight",
  storageBucket:     "droidflight.appspot.com",
  messagingSenderId: "123456789",
  appId:             "1:123:web:abc123",
}
```

---

## ⚙️ PASO 3 — Activar Firestore

1. En Firebase Console → **Firestore Database**
2. Clic en **Crear base de datos**
3. Selecciona **Modo producción**
4. Elige la región más cercana (ej: `us-central1`)
5. Ve a la pestaña **Reglas** y pega el contenido de `firestore.rules`

---

## ⚙️ PASO 4 — Activar Authentication

1. En Firebase Console → **Authentication** → **Comenzar**
2. En la pestaña **Sign-in method** → activa **Correo electrónico/Contraseña**
3. Crea tu usuario admin:
   - Ve a la pestaña **Usuarios** → **Agregar usuario**
   - Correo y contraseña de tu elección

---

## ⚙️ PASO 5 — Marcar usuario como admin

Para que el panel de Admin funcione, necesitas agregar un custom claim `admin: true`
al usuario que creaste. Hay dos formas:

### Opción A — Firebase Admin SDK (recomendada)
Crea un script `set-admin.js`:

```js
const admin = require('firebase-admin')
const serviceAccount = require('./serviceAccountKey.json') // Descarga desde Firebase Console → Configuración → Cuentas de servicio

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) })

admin.auth().getUserByEmail('tu@correo.com').then(user => {
  admin.auth().setCustomUserClaims(user.uid, { admin: true })
  console.log('✓ Admin configurado')
})
```

Ejecuta: `node set-admin.js`

### Opción B — Rápida (solo para pruebas)
En `src/hooks/useAuth.js`, cambia temporalmente:
```js
setIsAdmin(true) // ← Siempre admin, solo para probar
```
⚠️ Recuerda revertirlo antes de publicar.

---

## ⚙️ PASO 6 — GitHub Releases (almacenamiento de APKs)

1. Crea una cuenta en https://github.com si no tienes
2. Crea un repositorio: `droidflight-releases` (puede ser privado)
3. Para subir un APK:
   - En tu repo → **Releases** → **Create a new release**
   - Tag: `v5.0.1-build-3201`
   - Adjunta el archivo `.apk`
   - Publica el release
4. Haz clic derecho en el archivo adjunto → **Copiar enlace**
   La URL tendrá este formato:
   `https://github.com/usuario/repo/releases/download/v5.0.1-build-3201/app-prod.apk`
5. Esa URL es la que pegas en el panel Admin de DroidFlight

---

## 🚀 PASO 7 — Instalar y correr localmente

```bash
cd droidflight
npm install
npm run dev
```

Abre http://localhost:5173

---

## 🌐 PASO 8 — Deploy en Firebase Hosting (gratis)

```bash
# Instala Firebase CLI si no lo tienes
npm install -g firebase-tools

# Login
firebase login

# Inicializa en la carpeta del proyecto
firebase init hosting
# → Selecciona tu proyecto droidflight
# → Public directory: dist
# → Single page app: Yes
# → No sobreescribas index.html

# Build y deploy
npm run build
firebase deploy
```

Tu app quedará en: `https://droidflight.web.app`

---

## 📱 PASO 9 — Cómo lo usa un tester

### En celular Android:
1. Recibe el link: `https://droidflight.web.app/invite/abc123`
2. Lo abre en el navegador de su celular
3. Toca **Instalar** en la versión que quiere
4. Android descarga el APK y lanza el instalador
5. La primera vez le pedirá permiso para instalar desde fuentes desconocidas (es normal)

### En Android TV:
1. Abre el navegador integrado
2. Escribe la URL o usa un código QR
3. Navega con el control remoto
4. Selecciona **Instalar**

### En Fire TV:
1. Abre el navegador **Silk** (preinstalado)
2. Mismos pasos que Android TV

---

## 🔄 Flujo diario de trabajo

```
1. Compilas tu APK en Android Studio
2. Subes el .apk a GitHub Releases → copias la URL
3. Abres droidflight.web.app/admin
4. Seleccionas plataforma, versión, ambiente (Prod/STG/QA)
5. Pegas la URL → publicar
6. El tester abre su link → ve la nueva versión → instala
```

---

## 🛡️ Seguridad

- Los links de invitación expiran (por defecto 1 año, configurable)
- Las compilaciones expiran a los 90 días
- El panel Admin requiere login con Firebase Auth
- Solo usuarios con `claim admin:true` pueden publicar builds
- Las reglas de Firestore impiden escritura sin autenticación admin

---

## ❓ Preguntas frecuentes

**¿Funciona en iOS?**
No. Los APKs son exclusivos de Android. Para iOS usa TestFlight.

**¿Hay límite de APKs?**
GitHub Releases tiene límite de 2GB por archivo y 5GB por release. Para APKs normales (30-100MB) no tendrás problemas.

**¿Puedo usar otro almacenamiento?**
Sí. Cualquier URL pública directa funciona: Google Drive (con enlace directo), AWS S3, Cloudflare R2, etc.

**¿Fire TV puede instalar APKs?**
Sí. Fire TV permite instalar apps fuera de Amazon Appstore activando "Apps de fuentes desconocidas" en Configuración → Mis dispositivos → Opciones de desarrollador.
