// src/components/Nav.jsx
import { useNavigate } from 'react-router-dom'

export function Nav({ title, backLabel, backTo }) {
  const navigate = useNavigate()
  return (
    <div className="nav">
      {backTo && (
        <button className="nav-back" onClick={() => navigate(backTo)}>
          <svg viewBox="0 0 10 17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M8.5 1L1.5 8.5L8.5 16"/>
          </svg>
          {backLabel}
        </button>
      )}
      <span className="nav-title">{title}</span>
    </div>
  )
}

export function Chevron() {
  return (
    <span className="row-chev">
      <svg viewBox="0 0 8 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <path d="M1 1l6 6-6 6"/>
      </svg>
    </span>
  )
}

export function Spinner() {
  return <div className="spinner">Cargando...</div>
}

export function Empty({ message = 'Sin resultados' }) {
  return <div className="empty">{message}</div>
}
