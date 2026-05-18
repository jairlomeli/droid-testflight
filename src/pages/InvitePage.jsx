// src/pages/InvitePage.jsx
// El tester llega aquí desde su link: droidflight.app/invite/{token}
// Se valida el token y si es válido, redirige a la app principal.

import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { validateInviteToken } from '../services/db'

const INVALID_MESSAGES = {
  deactivated: 'Este código ha sido desactivado. Contacta al administrador.',
  expired:     'Este código ha expirado. Contacta al administrador.',
  not_found:   'Este link de invitación no es válido.',
}

export function InvitePage() {
  const { token }  = useParams()
  const navigate   = useNavigate()
  const [status, setStatus] = useState('validating') // validating | ok | invalid
  const [reason, setReason] = useState(null)

  useEffect(() => {
    validateInviteToken(token).then(result => {
      if (result.ok) {
        sessionStorage.setItem('df_invite', token)
        sessionStorage.setItem('df_invite_name', result.name || '')
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
           reason === 'deactivated' ? 'Acceso desactivado' :
           reason === 'expired'     ? 'Link expirado' : 'Link inválido'}
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
