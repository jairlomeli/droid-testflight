// src/pages/AdminPage.jsx
import { useState } from 'react'
import { Nav } from '../components/Nav'
import { TabBar } from '../components/TabBar'
import { addBuild, createInvite } from '../services/db'
import { useAuth } from '../hooks/useAuth'

const PLATFORMS = [
  { id: 'mobile',    label: 'Mobile'     },
  { id: 'androidtv', label: 'Android TV' },
  { id: 'firetv',   label: 'Fire TV'    },
]

const ENVS = ['Prod', 'STG', 'QA', 'Dev']

// ─── INFO BOX ─────────────────────────────────────────────────
function InfoBox({ children }) {
  return <div className="info-banner">{children}</div>
}

// ─── PUBLISH FORM ─────────────────────────────────────────────
function PublishForm() {
  const [form, setForm]     = useState({
    platformId:  'mobile',
    version:     '',
    buildNumber: '',
    environment: 'Prod',
    apkUrl:      '',
    changelog:   '',
    expireDays:  '90',
  })
  const [status, setStatus] = useState('idle') // idle | saving | ok | error
  const [error,  setError]  = useState('')

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }))

  const handleSubmit = async () => {
    if (!form.version || !form.buildNumber || !form.apkUrl) {
      setError('Completa versión, número de build y URL del APK.')
      return
    }
    setStatus('saving')
    setError('')
    try {
      await addBuild({
        platformId:  form.platformId,
        version:     form.version.trim(),
        buildNumber: Number(form.buildNumber),
        environment: form.environment,
        apkUrl:      form.apkUrl.trim(),
        changelog:   form.changelog.trim(),
        expireDays:  Number(form.expireDays) || 90,
      })
      setStatus('ok')
      setForm(f => ({ ...f, version: '', buildNumber: '', apkUrl: '', changelog: '' }))
      setTimeout(() => setStatus('idle'), 3000)
    } catch (e) {
      setError(e.message)
      setStatus('idle')
    }
  }

  return (
    <div className="admin-form">
      <InfoBox>
        Sube el APK a GitHub Releases y pega aquí la URL directa de descarga.{'\n'}
        Formato: github.com/usuario/repo/releases/download/v1.0/app.apk
      </InfoBox>

      <div className="form-group">
        <label className="form-label">Plataforma</label>
        <select
          className="form-select"
          value={form.platformId}
          onChange={e => set('platformId', e.target.value)}
        >
          {PLATFORMS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
      </div>

      <div className="form-2col">
        <div className="form-group">
          <label className="form-label">Versión</label>
          <input
            className="form-input"
            placeholder="5.0.1"
            value={form.version}
            onChange={e => set('version', e.target.value)}
          />
        </div>
        <div className="form-group">
          <label className="form-label">Build #</label>
          <input
            className="form-input"
            type="number"
            placeholder="3201"
            value={form.buildNumber}
            onChange={e => set('buildNumber', e.target.value)}
          />
        </div>
      </div>

      <div className="form-2col">
        <div className="form-group">
          <label className="form-label">Ambiente</label>
          <select
            className="form-select"
            value={form.environment}
            onChange={e => set('environment', e.target.value)}
          >
            {ENVS.map(env => <option key={env}>{env}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Expira (días)</label>
          <input
            className="form-input"
            type="number"
            value={form.expireDays}
            onChange={e => set('expireDays', e.target.value)}
          />
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">URL del APK (GitHub Releases)</label>
        <input
          className="form-input"
          type="url"
          placeholder="https://github.com/usuario/repo/releases/download/v5.0.1/app-prod.apk"
          value={form.apkUrl}
          onChange={e => set('apkUrl', e.target.value)}
        />
      </div>

      <div className="form-group">
        <label className="form-label">Changelog (opcional)</label>
        <textarea
          className="form-textarea"
          placeholder={"- Fix de crash en login\n- Mejora de rendimiento\n- Nueva pantalla de perfil"}
          value={form.changelog}
          onChange={e => set('changelog', e.target.value)}
        />
      </div>

      {error && (
        <p style={{ color: 'var(--red)', fontSize: 13, marginBottom: 12 }}>{error}</p>
      )}

      <button
        className="btn-primary"
        onClick={handleSubmit}
        disabled={status === 'saving'}
      >
        {status === 'saving' ? 'Publicando...' :
         status === 'ok'     ? '✓ Publicado correctamente' :
         'Publicar compilación'}
      </button>
    </div>
  )
}

// ─── INVITE LINKS ─────────────────────────────────────────────
function InviteSection() {
  const [links,  setLinks]  = useState([])
  const [creating, setCreating] = useState(false)
  const [newName,  setNewName]  = useState('')

  const generate = async () => {
    if (!newName.trim()) return
    setCreating(true)
    const token = await createInvite({ name: newName.trim() })
    const url   = `${window.location.origin}/invite/${token}`
    setLinks(l => [...l, { name: newName.trim(), url }])
    setNewName('')
    setCreating(false)
  }

  const copy = (url) => {
    navigator.clipboard.writeText(url).catch(() => {})
  }

  return (
    <div>
      <div style={{ padding: '0 16px 12px' }}>
        <div style={{ display: 'flex', gap: 10 }}>
          <input
            className="form-input"
            placeholder="Nombre del tester o grupo"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && generate()}
            style={{ flex: 1 }}
          />
          <button
            className="btn-primary"
            style={{ width: 'auto', padding: '12px 18px' }}
            onClick={generate}
            disabled={creating}
          >
            Generar
          </button>
        </div>
      </div>

      {links.map((l, i) => (
        <div key={i} className="invite-box">
          <div className="invite-inner">
            <div style={{ minWidth: 0 }}>
              <div className="invite-label">{l.name}</div>
              <div className="invite-link" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {l.url}
              </div>
            </div>
            <button className="copy-btn" onClick={() => copy(l.url)}>Copiar</button>
          </div>
        </div>
      ))}

      {links.length === 0 && (
        <p style={{ padding: '0 16px', color: 'var(--text2)', fontSize: 14 }}>
          Los links generados aparecerán aquí.
        </p>
      )}
    </div>
  )
}

// ─── MAIN ADMIN PAGE ──────────────────────────────────────────
export function AdminPage() {
  const { logout } = useAuth()
  const [tab, setTab] = useState('publish') // publish | invites

  return (
    <div className="page">
      <Nav title="Admin" />

      {/* Sub-tabs */}
      <div style={{ display: 'flex', gap: 0, margin: '16px 16px 0', background: 'var(--bg2)', borderRadius: 10, padding: 3 }}>
        {[['publish', 'Publicar'], ['invites', 'Links']].map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            style={{
              flex: 1,
              padding: '8px',
              borderRadius: 8,
              border: 'none',
              cursor: 'pointer',
              fontSize: 14,
              fontWeight: tab === id ? 600 : 400,
              background: tab === id ? 'var(--bg3)' : 'transparent',
              color: tab === id ? 'var(--text)' : 'var(--text2)',
              fontFamily: 'var(--sans)',
              transition: 'all 0.15s',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <p className="section-label" style={{ marginTop: 20 }}>
        {tab === 'publish' ? 'Nueva compilación' : 'Links de invitación'}
      </p>

      {tab === 'publish' ? <PublishForm /> : <InviteSection />}

      <div style={{ padding: '20px 16px 0' }}>
        <button className="btn-text" onClick={logout} style={{ color: 'var(--red)' }}>
          Cerrar sesión
        </button>
      </div>

      <TabBar />
    </div>
  )
}
