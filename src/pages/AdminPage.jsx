// src/pages/AdminPage.jsx
import { useState } from 'react'
import { Nav } from '../components/Nav'
import { TabBar } from '../components/TabBar'
import { addBuild, createInvite, parseApkUrl, importBuilds, deduplicateBuilds } from '../services/db'
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

const EXPIRY_OPTIONS = [
  { label: 'Sin caducidad', value: null },
  { label: '30 días',       value: 30   },
  { label: '90 días',       value: 90   },
  { label: '6 meses',       value: 180  },
  { label: '1 año',         value: 365  },
]

// ─── INVITE LINKS ─────────────────────────────────────────────
function InviteSection() {
  const [links,    setLinks]    = useState([])
  const [creating, setCreating] = useState(false)
  const [newName,  setNewName]  = useState('')
  const [expiry,   setExpiry]   = useState(null) // días o null

  const generate = async () => {
    if (!newName.trim()) return
    setCreating(true)
    try {
      const { token, shortCode } = await createInvite({ name: newName.trim(), expiresInDays: expiry })
      const url = `${window.location.origin}/invite/${token}`
      setLinks(l => [...l, { name: newName.trim(), url, shortCode }])
      setNewName('')
    } finally {
      setCreating(false)
    }
  }

  const copy = (text) => navigator.clipboard.writeText(text).catch(() => {})

  return (
    <div>
      <div style={{ padding: '0 16px 16px' }}>
        {/* Nombre */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
          <input
            className="form-input"
            placeholder="Nombre del tester o grupo"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && generate()}
            style={{ flex: 1 }}
          />
        </div>

        {/* Caducidad + botón */}
        <div style={{ display: 'flex', gap: 10 }}>
          <select
            className="form-select"
            value={expiry ?? ''}
            onChange={e => setExpiry(e.target.value === '' ? null : Number(e.target.value))}
            style={{ flex: 1 }}
          >
            {EXPIRY_OPTIONS.map(o => (
              <option key={String(o.value)} value={o.value ?? ''}>{o.label}</option>
            ))}
          </select>
          <button
            className="btn-primary"
            style={{ width: 'auto', padding: '12px 20px' }}
            onClick={generate}
            disabled={creating || !newName.trim()}
          >
            {creating ? '...' : 'Generar'}
          </button>
        </div>
      </div>

      {links.length === 0 ? (
        <p style={{ padding: '0 16px', color: 'var(--text2)', fontSize: 14 }}>
          Los links generados aparecerán aquí.
        </p>
      ) : (
        links.map((l, i) => (
          <div key={i} className="invite-box">
            <div className="invite-label" style={{ marginBottom: 8 }}>{l.name}</div>

            {/* Código corto */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{
                fontFamily: 'monospace', fontSize: 22, fontWeight: 700, letterSpacing: 4,
                color: 'var(--text)', background: 'var(--bg3)',
                padding: '6px 14px', borderRadius: 8, flex: 1, textAlign: 'center',
              }}>
                {l.shortCode}
              </span>
              <button className="copy-btn" onClick={() => copy(l.shortCode)}>Copiar código</button>
            </div>

            {/* Link largo */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div className="invite-link" style={{
                flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                fontSize: 12, color: 'var(--text2)',
              }}>
                {l.url}
              </div>
              <button className="copy-btn" onClick={() => copy(l.url)}>Copiar link</button>
            </div>
          </div>
        ))
      )}
    </div>
  )
}

// ─── IMPORT SECTION ───────────────────────────────────────────
const ENV_COLOR = { Prod: '#34c759', STG: '#ff9f0a', QA: '#0a84ff' }
const PLATFORM_LABEL = { mobile: 'Mobile', androidtv: 'Android TV', firetv: 'Fire TV' }

function ImportSection() {
  const [text,      setText]      = useState('')
  const [preview,   setPreview]   = useState(null)
  const [status,    setStatus]    = useState('idle') // idle | importing | done | error
  const [error,     setError]     = useState('')
  const [result,    setResult]    = useState(null)
  const [dedupMsg,  setDedupMsg]  = useState('')
  const [deduping,  setDeduping]  = useState(false)

  const doDedup = async () => {
    if (!confirm('¿Eliminar builds duplicadas? Esta acción no se puede deshacer.')) return
    setDeduping(true)
    setDedupMsg('')
    try {
      const deleted = await deduplicateBuilds()
      setDedupMsg(`✅ ${deleted} duplicada${deleted !== 1 ? 's' : ''} eliminada${deleted !== 1 ? 's' : ''}. Contadores actualizados.`)
    } catch (e) {
      setDedupMsg(`❌ Error: ${e.message}`)
    } finally {
      setDeduping(false)
    }
  }

  const analyze = () => {
    const builds = (text.match(/https?:\/\/\S+\.apk/gi) || [])
      .map(parseApkUrl).filter(Boolean)
    setPreview(builds)
    setStatus('idle')
    setError('')
  }

  const doImport = async () => {
    if (!preview?.length) return
    setStatus('importing')
    setError('')
    setResult(null)
    try {
      const res = await importBuilds(text)
      setResult(res)
      setStatus('done')
      if (res.saved > 0) {
        setText('')
        setPreview(null)
      }
    } catch (e) {
      console.error('[doImport] Error:', e)
      setError(e.message)
      setStatus('idle')
    }
  }

  // Agrupa preview por plataforma → ambiente → variante
  const grouped = preview ? preview.reduce((acc, b) => {
    const key = `${PLATFORM_LABEL[b.platformId] || b.platformId} — v${b.version}`
    if (!acc[key]) acc[key] = []
    acc[key].push(b)
    return acc
  }, {}) : null

  return (
    <div style={{ padding: '0 16px 24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <p style={{ fontSize: 13, color: 'var(--text2)', margin: 0 }}>
          Pega el bloque de URLs copiado de GCS. La app detecta plataforma, ambiente y variante automáticamente.
        </p>
        <button
          onClick={doDedup}
          disabled={deduping}
          style={{
            flexShrink: 0, marginLeft: 10,
            background: 'var(--bg3)', color: 'var(--text2)',
            border: '1px solid var(--border)', borderRadius: 8,
            padding: '6px 12px', fontSize: 12, cursor: 'pointer',
          }}
        >
          {deduping ? 'Limpiando…' : '🧹 Limpiar duplicados'}
        </button>
      </div>
      {dedupMsg && (
        <p style={{ fontSize: 13, marginBottom: 10, color: dedupMsg.startsWith('✅') ? '#34c759' : 'var(--red)' }}>
          {dedupMsg}
        </p>
      )}

      <textarea
        style={{
          width: '100%', minHeight: 180, boxSizing: 'border-box',
          background: 'var(--bg2)', color: 'var(--text)',
          border: '1px solid var(--border)', borderRadius: 10,
          padding: '10px 12px', fontSize: 13, fontFamily: 'monospace',
          resize: 'vertical', outline: 'none',
        }}
        placeholder={'Release:\nhttps://storage.cloud.google.com/...app_prd_mobile-all-4.44.1-041726_6400.apk (6400)\n...'}
        value={text}
        onChange={e => { setText(e.target.value); setPreview(null) }}
      />

      <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
        <button
          className="btn-primary"
          style={{ flex: 1, background: 'var(--bg3)', color: 'var(--text)' }}
          onClick={analyze}
          disabled={!text.trim()}
        >
          Analizar
        </button>
        <button
          className="btn-primary"
          style={{ flex: 1 }}
          onClick={doImport}
          disabled={!preview?.length || status === 'importing'}
        >
          {status === 'importing' ? 'Importando...' :
           status === 'done'      ? '✓ Importado' :
           `Importar ${preview?.length ? `(${preview.length})` : ''}`}
        </button>
      </div>

      {error && (
        <div style={{ background: '#ff3b3022', border: '1px solid var(--red)', borderRadius: 8, padding: '10px 12px', marginTop: 10 }}>
          <p style={{ color: 'var(--red)', fontSize: 13, margin: 0, fontWeight: 600 }}>Error</p>
          <p style={{ color: 'var(--red)', fontSize: 13, margin: '4px 0 0' }}>{error}</p>
        </div>
      )}

      {result && (
        <div style={{
          background: result.saved > 0 ? '#34c75922' : '#ff3b3022',
          border: `1px solid ${result.saved > 0 ? '#34c759' : 'var(--red)'}`,
          borderRadius: 8, padding: '10px 12px', marginTop: 10,
        }}>
          <p style={{ fontSize: 13, fontWeight: 600, margin: 0, color: result.saved > 0 ? '#34c759' : result.skipped === result.total ? '#ff9f0a' : 'var(--red)' }}>
            {result.saved > 0
              ? `✅ ${result.saved} build${result.saved !== 1 ? 's' : ''} guardada${result.saved !== 1 ? 's' : ''}${result.skipped ? `, ${result.skipped} ya existían (ignoradas)` : ''}`
              : result.skipped === result.total
              ? `⏭ Todas las builds ya existían — nada nuevo que importar`
              : '❌ No se guardó ninguna build'}
          </p>
          {result.errors.length > 0 && (
            <ul style={{ margin: '6px 0 0', paddingLeft: 16 }}>
              {result.errors.map((e, i) => (
                <li key={i} style={{ color: 'var(--red)', fontSize: 12 }}>{e}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {grouped && Object.keys(grouped).length === 0 && (
        <p style={{ color: 'var(--red)', fontSize: 13, marginTop: 12 }}>
          No se encontraron URLs de APK reconocibles en el texto.
        </p>
      )}

      {grouped && Object.entries(grouped).map(([group, builds]) => (
        <div key={group} style={{ marginTop: 16 }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>{group}</p>
          {builds.map((b, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 10px', background: 'var(--bg2)',
              borderRadius: 8, marginBottom: 4, fontSize: 13,
            }}>
              <span style={{
                background: ENV_COLOR[b.environment] + '22',
                color: ENV_COLOR[b.environment],
                borderRadius: 5, padding: '2px 7px', fontWeight: 600, fontSize: 12,
              }}>
                {b.environment}
              </span>
              {b.variant !== 'Standard' && (
                <span style={{
                  background: '#8e8e9322', color: 'var(--text2)',
                  borderRadius: 5, padding: '2px 7px', fontSize: 12,
                }}>
                  {b.variant}
                </span>
              )}
              <span style={{ color: 'var(--text2)', marginLeft: 'auto' }}>#{b.buildNumber}</span>
            </div>
          ))}
        </div>
      ))}
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
        {[['publish', 'Publicar'], ['import', 'Importar'], ['invites', 'Links']].map(([id, label]) => (
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
        {tab === 'publish' ? 'Nueva compilación' :
         tab === 'import'  ? 'Importar URLs masivas' : 'Links de invitación'}
      </p>

      {tab === 'publish' ? <PublishForm /> :
       tab === 'import'  ? <ImportSection /> : <InviteSection />}

      <div style={{ padding: '20px 16px 0' }}>
        <button className="btn-text" onClick={logout} style={{ color: 'var(--red)' }}>
          Cerrar sesión
        </button>
      </div>

      <TabBar />
    </div>
  )
}
