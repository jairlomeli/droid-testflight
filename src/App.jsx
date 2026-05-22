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
  try {
    localStorage.removeItem('df_access_code')
    localStorage.removeItem('df_access_expiry')
    localStorage.removeItem('df_access_name')
    // Limpiar claves antiguas por si acaso
    localStorage.removeItem('df_stored_code')
    localStorage.removeItem('df_stored_expires')
    localStorage.removeItem('df_stored_name')
  } catch {}
}

function saveToLocalStorage(code, name, expiresAt) {
  try {
    localStorage.setItem('df_access_code', code)
    localStorage.setItem('df_access_name', name || '')
    if (expiresAt) {
      const expDate = expiresAt.toDate ? expiresAt.toDate() : new Date(expiresAt)
      localStorage.setItem('df_access_expiry', expDate.toISOString())
    } else {
      localStorage.removeItem('df_access_expiry')
    }
  } catch {}
}

// Verifica que el tester tenga acceso.
// Sesión persistente via localStorage — sin round-trip a Firestore en el restore
// para máxima compatibilidad con TV browsers.
function TesterRoute({ children }) {
  // 'init' | 'ready' | 'code'
  const [phase,    setPhase]    = useState('init')
  const [code,     setCode]     = useState('')
  const [error,    setError]    = useState('')
  const [checking, setChecking] = useState(false)

  useEffect(() => {
    try {
      // Ya tiene sesión en esta pestaña
      if (sessionStorage.getItem('df_invite')) {
        setPhase('ready')
        return
      }

      const storedCode = localStorage.getItem('df_access_code')
        || localStorage.getItem('df_stored_code') // compatibilidad con versión anterior

      if (!storedCode) {
        setPhase('code')
        return
      }

      // Verificar expiración local
      const storedExpiry = localStorage.getItem('df_access_expiry')
        || localStorage.getItem('df_stored_expires')

      if (storedExpiry && new Date(storedExpiry) <= new Date()) {
        clearStoredSession()
        setPhase('code')
        return
      }

      // Código presente y no expirado → entrar directo sin red
      const name = localStorage.getItem('df_access_name') || localStorage.getItem('df_stored_name') || ''
      sessionStorage.setItem('df_invite',      storedCode)
      sessionStorage.setItem('df_invite_code', storedCode)
      sessionStorage.setItem('df_invite_name', name)
      setPhase('ready')
    } catch {
      setPhase('code')
    }
  }, [])

  if (phase === 'init') return null  // evita flash — se resuelve en el mismo tick

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
      background: '#F5F5F5',
    }}>
      <div style={{ maxWidth: 320, width: '100%' }}>
        {/* Ícono */}
        <div style={{
          width: 80, height: 80, borderRadius: 22,
          background: '#3DDC84',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 38, margin: '0 auto 24px',
        }}>
          🚀
        </div>

        {/* Título */}
        <h1 style={{ fontSize: 28, fontWeight: 700, margin: '0 0 8px', lineHeight: 1.2 }}>
          <span style={{ color: '#1C1C1E' }}>Droid - </span>
          <span style={{ color: '#3DDC84' }}>TestFlight</span>
        </h1>

        {/* Subtítulo */}
        <p style={{ color: '#6E6E73', fontSize: 13, margin: '0 0 32px', lineHeight: 1.5 }}>
          Distribución de APKs para testers
        </p>

        {/* Campo de código */}
        <input
          value={code}
          onChange={e => { setCode(e.target.value.toUpperCase()); setError('') }}
          onKeyDown={e => e.key === 'Enter' && handleCode()}
          placeholder="CÓDIGO DE ACCESO"
          maxLength={6}
          style={{
            width: '100%', boxSizing: 'border-box',
            background: '#ffffff', color: '#1C1C1E',
            border: `1px solid ${error ? '#ff3b30' : '#E5E5EA'}`,
            borderRadius: 12, padding: '13px 16px',
            fontSize: 20, fontFamily: 'monospace', fontWeight: 700,
            letterSpacing: 4, textAlign: 'center', outline: 'none',
            marginBottom: 10, textTransform: 'uppercase',
            caretColor: '#3DDC84',
          }}
        />
        {error && (
          <p style={{ color: '#ff3b30', fontSize: 13, marginBottom: 10 }}>{error}</p>
        )}

        {/* Botón */}
        <button
          onClick={handleCode}
          disabled={checking || !code.trim()}
          style={{
            width: '100%', padding: '14px', borderRadius: 12, border: 'none',
            background: '#3DDC84', color: '#ffffff', fontSize: 16, fontWeight: 600,
            cursor: checking ? 'wait' : 'pointer',
            opacity: !code.trim() ? 0.45 : 1,
            fontFamily: 'var(--sans)',
            transition: 'opacity 0.15s',
          }}
        >
          {checking ? 'Verificando...' : 'Ingresar'}
        </button>

        {/* Plataformas */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: 6, marginTop: 24, color: '#AEAEB2', fontSize: 12,
        }}>
          <span>Android TV</span>
          <span>·</span>
          <span>Fire TV</span>
          <span>·</span>
          <span>Mobile</span>
        </div>
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
