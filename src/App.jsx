// src/App.jsx
import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './hooks/useAuth'
import { validateShortCode, logAccess } from './services/db'

import { PlatformsPage } from './pages/PlatformsPage'
import { VersionsPage }  from './pages/VersionsPage'
import { BuildsPage }    from './pages/BuildsPage'
import { AdminPage }     from './pages/AdminPage'
import { LoginPage }     from './pages/LoginPage'
import { InvitePage }    from './pages/InvitePage'

// Protege la ruta /admin — solo accesible si hay sesión
function AdminRoute() {
  const { user, isAdmin } = useAuth()
  if (user === undefined) return null // cargando auth
  if (!user)    return <LoginPage />
  if (!isAdmin) return <Navigate to="/" />
  return <AdminPage />
}

function clearStoredSession() {
  localStorage.removeItem('df_stored_code')
  localStorage.removeItem('df_stored_expires')
  localStorage.removeItem('df_stored_name')
}

function saveToLocalStorage(code, name, expiresAt) {
  localStorage.setItem('df_stored_code', code)
  localStorage.setItem('df_stored_name', name || '')
  if (expiresAt) {
    const expDate = expiresAt.toDate ? expiresAt.toDate() : new Date(expiresAt)
    localStorage.setItem('df_stored_expires', expDate.toISOString())
  } else {
    localStorage.removeItem('df_stored_expires')
  }
}

// Verifica que el tester tenga un token válido.
// Soporta sesión persistente via localStorage.
function TesterRoute({ children }) {
  // 'init' | 'checking' | 'ready' | 'code'
  const [phase,    setPhase]    = useState('init')
  const [code,     setCode]     = useState('')
  const [error,    setError]    = useState('')
  const [checking, setChecking] = useState(false)

  useEffect(() => {
    // Ya tiene sesión en esta pestaña
    if (sessionStorage.getItem('df_invite')) {
      setPhase('ready')
      return
    }

    const storedCode = localStorage.getItem('df_stored_code')
    if (!storedCode) {
      setPhase('code')
      return
    }

    // Verificar expiración local primero (evita llamada a Firestore si ya expiró)
    const storedExpires = localStorage.getItem('df_stored_expires')
    if (storedExpires && new Date(storedExpires) <= new Date()) {
      clearStoredSession()
      setPhase('code')
      return
    }

    // Validar contra Firestore (sin registrar dispositivo de nuevo)
    setPhase('checking')
    validateShortCode(storedCode, { skipDeviceCheck: true })
      .then(result => {
        if (result.ok) {
          sessionStorage.setItem('df_invite', result.token || storedCode)
          sessionStorage.setItem('df_invite_name', result.name || localStorage.getItem('df_stored_name') || '')
          sessionStorage.setItem('df_invite_code', result.shortCode || storedCode)
          setPhase('ready')
        } else {
          clearStoredSession()
          setPhase('code')
        }
      })
      .catch(() => {
        // Error de red → ser permisivo, dejar entrar si la sesión local es válida
        sessionStorage.setItem('df_invite', storedCode)
        sessionStorage.setItem('df_invite_code', storedCode)
        setPhase('ready')
      })
  }, [])

  if (phase === 'init' || phase === 'checking') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: 'var(--text2)', fontSize: 15 }}>Verificando acceso...</p>
      </div>
    )
  }

  if (phase === 'ready') return children

  // ── Pantalla de entrada de código ──────────────────────────
  const handleCode = async () => {
    if (!code.trim()) return
    setChecking(true)
    setError('')
    try {
      const result = await validateShortCode(code.trim())
      if (result.ok) {
        // Guardar en localStorage para sesión persistente
        saveToLocalStorage(result.shortCode || code.trim(), result.name, result.expiresAt)

        // Guardar en sessionStorage para esta pestaña
        sessionStorage.setItem('df_invite', result.token || code.trim())
        sessionStorage.setItem('df_invite_name', result.name || '')
        sessionStorage.setItem('df_invite_code', result.shortCode || code.trim())

        // Log de acceso (fire & forget)
        logAccess({ inviteId: result.id, code: result.shortCode || code.trim(), inviteName: result.name || '' })

        window.location.reload()
      } else {
        const msgs = {
          deactivated:  'Este código ha sido desactivado. Contacta al administrador.',
          expired:      'Este código ha expirado. Contacta al administrador.',
          device_limit: 'Este código ha alcanzado el límite de dispositivos. Contacta al administrador.',
          not_found:    'Código inválido.',
        }
        setError(msgs[result.reason] || 'Código inválido.')
      }
    } catch {
      setError('Error al verificar. Intenta de nuevo.')
    } finally {
      setChecking(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', padding: 24, textAlign: 'center',
    }}>
      <div style={{ maxWidth: 320, width: '100%' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
        <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>Acceso restringido</h2>
        <p style={{ color: 'var(--text2)', fontSize: 14, lineHeight: 1.6, marginBottom: 24 }}>
          Ingresa el código que te dio el administrador,<br/>o abre tu link de invitación.
        </p>

        <input
          value={code}
          onChange={e => { setCode(e.target.value.toUpperCase()); setError('') }}
          onKeyDown={e => e.key === 'Enter' && handleCode()}
          placeholder="CÓDIGO (ej: VIX3K2)"
          maxLength={6}
          style={{
            width: '100%', boxSizing: 'border-box',
            background: 'var(--bg2)', color: 'var(--text)',
            border: `1px solid ${error ? '#ff3b30' : 'var(--border)'}`,
            borderRadius: 10, padding: '14px 16px',
            fontSize: 20, fontFamily: 'monospace', fontWeight: 700,
            letterSpacing: 6, textAlign: 'center', outline: 'none',
            marginBottom: 10, textTransform: 'uppercase',
          }}
        />
        {error && (
          <p style={{ color: '#ff3b30', fontSize: 13, marginBottom: 10 }}>{error}</p>
        )}
        <button
          onClick={handleCode}
          disabled={checking || !code.trim()}
          style={{
            width: '100%', padding: '14px', borderRadius: 10, border: 'none',
            background: '#0A84FF', color: '#fff', fontSize: 16, fontWeight: 600,
            cursor: checking ? 'wait' : 'pointer', opacity: !code.trim() ? 0.5 : 1,
            fontFamily: 'var(--sans)',
          }}
        >
          {checking ? 'Verificando...' : 'Ingresar'}
        </button>

        <p style={{ color: 'var(--text2)', fontSize: 12, marginTop: 20, lineHeight: 1.6 }}>
          ¿Tienes un link? Ábrelo directamente<br/>desde el mensaje que recibiste.
        </p>
      </div>
    </div>
  )
}

function AppRoutes() {
  return (
    <Routes>
      {/* Tester routes */}
      <Route path="/" element={<TesterRoute><PlatformsPage /></TesterRoute>} />
      <Route path="/platform/:platformId" element={<TesterRoute><VersionsPage /></TesterRoute>} />
      <Route path="/platform/:platformId/version/:version" element={<TesterRoute><BuildsPage /></TesterRoute>} />

      {/* Invite landing */}
      <Route path="/invite/:token" element={<InvitePage />} />

      {/* Admin */}
      <Route path="/admin" element={<AdminRoute />} />
      <Route path="/admin/login" element={<LoginPage />} />

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}
