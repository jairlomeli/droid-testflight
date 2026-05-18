// src/App.jsx
import { useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './hooks/useAuth'
import { validateShortCode } from './services/db'

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

// Verifica que el tester tenga un token válido en sessionStorage.
// Si no tiene, muestra pantalla de acceso con código corto o link.
function TesterRoute({ children }) {
  const hasInvite = sessionStorage.getItem('df_invite')
  const [code,     setCode]     = useState('')
  const [error,    setError]    = useState('')
  const [checking, setChecking] = useState(false)

  if (hasInvite) return children

  const handleCode = async () => {
    if (!code.trim()) return
    setChecking(true)
    setError('')
    try {
      const result = await validateShortCode(code.trim())
      if (result.ok) {
        sessionStorage.setItem('df_invite', result.token || code.trim())
        sessionStorage.setItem('df_invite_name', result.name || '')
        window.location.reload()
      } else {
        const msgs = {
          deactivated: 'Este código ha sido desactivado. Contacta al administrador.',
          expired:     'Este código ha expirado. Contacta al administrador.',
          not_found:   'Código inválido.',
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

        {/* Entrada de código corto */}
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
