// src/pages/InvitePage.jsx
// El tester llega aquí desde su link: droidflight.app/invite/{token}
// Se valida el token y si es válido, redirige a la app principal.

import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { validateInviteToken, logAccess } from '../services/db'

const INVALID_MESSAGES = {
  deactivated:  'Este código ha sido desactivado. Contacta al administrador.',
  expired:      'Este código ha expirado. Contacta al administrador.',
  device_limit: 'Este código ha alcanzado el límite de dispositivos. Contacta al administrador.',
  not_found:    'Este link de invitación no es válido.',
}

const INVALID_TITLES = {
  deactivated:  'Acceso desactivado',
  expired:      'Link expirado',
  device_limit: 'Límite de dispositivos',
  not_found:    'Link inválido',
}

export function InvitePage() {
  const { token }  = useParams()
  const navigate   = useNavigate()
  const [status, setStatus] = useState('validating') // validating | ok | invalid
  const [reason, setReason] = useState(null)

  useEffect(() => {
    validateInviteToken(token).then(result => {
      if (result.ok) {
        // Sesión persistente: guardar en localStorage
        const code = result.shortCode || token
        localStorage.setItem('df_stored_code', code)
        localStorage.setItem('df_stored_name', result.name || '')
        if (result.expiresAt) {
          const expDate = result.expiresAt.toDate ? result.expiresAt.toDate() : new Date(result.expiresAt)
          localStorage.setItem('df_stored_expires', expDate.toISOString())
        } else {
          localStorage.removeItem('df_stored_expires')
        }

        // Sesión de pestaña
        sessionStorage.setItem('df_invite', token)
        sessionStorage.setItem('df_invite_name', result.name || '')
        sessionStorage.setItem('df_invite_code', result.shortCode || token)

        // Log de acceso (fire & forget)
        logAccess({ inviteId: result.id, code: result.shortCode || token, inviteName: result.name || '' })

        setStatus('ok')
        setTimeout(() => navigate('/'), 2000)
      } else {
        setReason(result.reason)
        setStatus('invalid')
      }
    })
  }, [token, navigate])

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', padding: 24, textAlign: 'center',
    }}>
      <div style={{ maxWidth: 300 }}>
        <div style={{ fontSize: 56, marginBottom: 20 }}>
          {status === 'validating' ? '🔍' : status === 'ok' ? '✅' : '❌'}
        </div>
        <h2 style={{ fontSize: 22, fontWeight: 600, marginBottom: 10 }}>
          {status === 'validating' ? 'Validando acceso...' :
           status === 'ok'         ? '¡Bienvenido a DroidFlight!' :
           INVALID_TITLES[reason] || 'Link inválido'}
        </h2>
        <p style={{ color: 'var(--text2)', fontSize: 15, lineHeight: 1.6 }}>
          {status === 'validating' ? 'Un momento...' :
           status === 'ok'         ? 'Redirigiendo a tus apps...' :
           INVALID_MESSAGES[reason] || INVALID_MESSAGES.not_found}
        </p>
      </div>
    </div>
  )
}
