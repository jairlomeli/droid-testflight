// src/components/TabBar.jsx
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

const AppsIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7" rx="1.5"/>
    <rect x="14" y="3" width="7" height="7" rx="1.5"/>
    <rect x="3" y="14" width="7" height="7" rx="1.5"/>
    <rect x="14" y="14" width="7" height="7" rx="1.5"/>
  </svg>
)

const AdminIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3"/>
    <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
  </svg>
)

export function TabBar() {
  const navigate  = useNavigate()
  const location  = useLocation()
  const { isAdmin } = useAuth()

  const isApps  = !location.pathname.startsWith('/admin')
  const isAdm   = location.pathname.startsWith('/admin')

  return (
    <div className="tabs-bar">
      <button
        className={`tab-btn ${isApps ? 'active' : ''}`}
        onClick={() => navigate('/')}
      >
        <AppsIcon />
        Mis apps
      </button>
      {isAdmin && (
        <button
          className={`tab-btn ${isAdm ? 'active' : ''}`}
          onClick={() => navigate('/admin')}
        >
          <AdminIcon />
          Admin
        </button>
      )}
    </div>
  )
}
