// src/App.jsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './hooks/useAuth'

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

// Verifica que el tester tenga un token válido en sessionStorage
// Si no tiene, muestra un mensaje. Puedes quitarla si quieres acceso abierto.
function TesterRoute({ children }) {
  const hasInvite = sessionStorage.getItem('df_invite')
  if (!hasInvite) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center',
        justifyContent: 'center', padding: 24, textAlign: 'center',
      }}>
        <div>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
          <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 10 }}>Acceso restringido</h2>
          <p style={{ color: 'var(--text2)', fontSize: 15, lineHeight: 1.6 }}>
            Necesitas un link de invitación para acceder.<br/>
            Contacta al administrador.
          </p>
        </div>
      </div>
    )
  }
  return children
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
