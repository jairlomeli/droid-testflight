// src/pages/AdminPage.jsx
import { useState, useEffect } from 'react'
import { Nav } from '../components/Nav'
import { TabBar } from '../components/TabBar'
import {
  addBuild, createInvite, parseApkUrl, importBuilds, deduplicateBuilds,
  getInvites, deactivateInvite, deleteInvite, getAccessLogs, getInstallLogs,
} from '../services/db'
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

function daysLeft(expiresAt) {
  if (!expiresAt) return null
  const d = expiresAt.toDate ? expiresAt.toDate() : new Date(expiresAt)
  return Math.ceil((d - Date.now()) / 86400000)
}

function ExpiryBadge({ expiresAt }) {
  const days = daysLeft(expiresAt)
  if (days === null) return <span style={{ color: 'var(--text2)', fontSize: 12 }}>Sin caducidad</span>
  const color = days <= 0 ? '#ff3b30' : days <= 30 ? '#ff9f0a' : '#34c759'
  const label = days <= 0 ? 'Expirado' : `${days}d restantes`
  return (
    <span style={{
      fontSize: 12, fontWeight: 600, color,
      background: color + '18', borderRadius: 5, padding: '2px 8px',
      border: `1px solid ${color}44`,
    }}>
      ● {label}
    </span>
  )
}

// ─── INVITE LINKS ─────────────────────────────────────────────
function InviteSection() {
  const [invites,      setInvites]      = useState([])
  const [loading,      setLoading]      = useState(true)
  const [creating,     setCreating]     = useState(false)
  const [newName,      setNewName]      = useState('')
  const [expiry,       setExpiry]       = useState(null)
  const [deactivating, setDeactivating] = useState(false)

  const load = async () => {
    setLoading(true)
    try { setInvites(await getInvites()) } finally { setLoading(false) }
  }

  useState(() => { load() }, [])

  const generate = async () => {
    if (!newName.trim()) return
    setCreating(true)
    try {
      await createInvite({ name: newName.trim(), expiresInDays: expiry })
      setNewName('')
      await load()
    } finally {
      setCreating(false)
    }
  }

  const deactivate = async (id) => {
    if (!confirm('¿Desactivar este código? El tester ya no podrá usarlo.')) return
    await deactivateInvite(id)
    await load()
  }

  const remove = async (id) => {
    if (!confirm('¿Eliminar este código? Esta acción no se puede deshacer.')) return
    await deleteInvite(id)
    await load()
  }

  const deactivateAll = async () => {
    if (!confirm('¿Desactivar TODOS los códigos activos? Esta acción no se puede deshacer.')) return
    setDeactivating(true)
    try {
      const active = invites.filter(i => i.active)
      for (const i of active) await deactivateInvite(i.id)
      await load()
    } finally {
      setDeactivating(false)
    }
  }

  const copy = (text) => navigator.clipboard.writeText(text).catch(() => {})

  return (
    <div>
      {/* Formulario de generación */}
      <div style={{ padding: '0 16px 16px' }}>
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

      {/* Lista histórica */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', marginTop: 4 }}>
        <p className="section-label" style={{ margin: 0 }}>Todos los códigos</p>
        {invites.some(i => i.active) && (
          <button
            onClick={deactivateAll}
            disabled={deactivating}
            style={{
              fontSize: 11, padding: '4px 10px', borderRadius: 7,
              border: '1px solid #ff3b3044', background: '#ff3b3012',
              color: '#ff3b30', cursor: 'pointer',
            }}
          >
            {deactivating ? 'Desactivando…' : 'Desactivar todos'}
          </button>
        )}
      </div>

      {loading ? (
        <p style={{ padding: '0 16px', color: 'var(--text2)', fontSize: 14 }}>Cargando…</p>
      ) : invites.length === 0 ? (
        <p style={{ padding: '0 16px', color: 'var(--text2)', fontSize: 14 }}>No hay códigos generados aún.</p>
      ) : invites.map(inv => {
        const days   = daysLeft(inv.expiresAt)
        const expired = days !== null && days <= 0
        const active  = inv.active && !expired
        const url     = `${window.location.origin}/invite/${inv.token}`
        const statusColor  = active ? '#34c759' : '#ff3b30'
        const statusLabel  = !inv.active ? 'Inactivo' : expired ? 'Expirado' : 'Activo'
        const faded = !active
        const devCount = inv.deviceCount ?? 0

        return (
          <div key={inv.id} className="invite-box" style={{ opacity: faded ? 0.55 : 1, marginBottom: 10 }}>
            {/* Fila 1: nombre + estado */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span className="invite-label" style={{ margin: 0 }}>{inv.name}</span>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                {/* Contador de dispositivos */}
                <span style={{
                  fontSize: 11, fontWeight: 600,
                  color: devCount >= 4 ? '#ff9f0a' : 'var(--text2)',
                  background: devCount >= 4 ? '#ff9f0a18' : 'var(--bg3)',
                  borderRadius: 5, padding: '2px 8px',
                  border: `1px solid ${devCount >= 4 ? '#ff9f0a44' : 'var(--border)'}`,
                }}>
                  📱 {devCount}/4 dispositivos
                </span>
                <span style={{
                  fontSize: 11, fontWeight: 700, color: statusColor,
                  background: statusColor + '18', borderRadius: 5, padding: '2px 8px',
                  border: `1px solid ${statusColor}44`,
                }}>{statusLabel}</span>
              </div>
            </div>

            {/* Código corto */}
            <div style={{
              fontFamily: 'monospace', fontSize: inv.shortCode ? 20 : 13, fontWeight: 700,
              letterSpacing: inv.shortCode ? 4 : 0,
              color: inv.shortCode ? 'var(--text)' : 'var(--text2)',
              background: 'var(--bg3)', padding: '8px 14px', borderRadius: 8,
              textAlign: 'center', marginBottom: 8,
            }}>
              {inv.shortCode || 'Sin código — invitación generada antes de esta versión'}
            </div>

            {/* Caducidad */}
            <div style={{ marginBottom: 10 }}>
              <ExpiryBadge expiresAt={inv.expiresAt} />
            </div>

            {/* Botones */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {active && (
                <button className="copy-btn" onClick={() => copy(inv.shortCode)}>Copiar código</button>
              )}
              {active && (
                <button className="copy-btn" onClick={() => copy(url)}>Copiar link</button>
              )}
              {inv.active && !expired && (
                <button
                  onClick={() => deactivate(inv.id)}
                  style={{
                    fontSize: 12, padding: '5px 10px', borderRadius: 7, border: '1px solid #ff3b3044',
                    background: '#ff3b3012', color: '#ff3b30', cursor: 'pointer',
                  }}
                >
                  Desactivar
                </button>
              )}
              <button
                onClick={() => remove(inv.id)}
                style={{
                  fontSize: 12, padding: '5px 10px', borderRadius: 7, border: '1px solid #ff3b30',
                  background: '#ff3b30', color: '#fff', cursor: 'pointer',
                }}
              >
                Eliminar
              </button>
            </div>
          </div>
        )
      })}
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

// ─── ACTIVITY SECTION ─────────────────────────────────────────
function ActivitySection() {
  const [accessLogs,  setAccessLogs]  = useState([])
  const [installLogs, setInstallLogs] = useState([])
  const [loading,     setLoading]     = useState(true)

  useEffect(() => {
    Promise.all([getAccessLogs(), getInstallLogs()])
      .then(([access, installs]) => {
        setAccessLogs(access)
        setInstallLogs(installs)
      })
      .finally(() => setLoading(false))
  }, [])

  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  const accessToday  = accessLogs.filter(l => l.timestamp?.toDate?.() >= todayStart).length
  const installsToday = installLogs.filter(l => l.timestamp?.toDate?.() >= todayStart).length

  const fmt = (ts) => {
    if (!ts?.toDate) return '—'
    const d = ts.toDate()
    return d.toLocaleDateString('es', { month: 'short', day: 'numeric' }) + ' ' +
           d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })
  }

  if (loading) {
    return <p style={{ padding: '0 16px', color: 'var(--text2)', fontSize: 14 }}>Cargando...</p>
  }

  return (
    <div style={{ padding: '0 16px 24px' }}>
      {/* Contadores de hoy */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        <div style={{
          flex: 1, background: 'var(--bg2)', borderRadius: 12,
          padding: '14px 16px', textAlign: 'center',
        }}>
          <div style={{ fontSize: 30, fontWeight: 700, color: '#0a84ff' }}>{accessToday}</div>
          <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 3 }}>Accesos hoy</div>
        </div>
        <div style={{
          flex: 1, background: 'var(--bg2)', borderRadius: 12,
          padding: '14px 16px', textAlign: 'center',
        }}>
          <div style={{ fontSize: 30, fontWeight: 700, color: '#34c759' }}>{installsToday}</div>
          <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 3 }}>Descargas hoy</div>
        </div>
      </div>

      {/* Accesos recientes */}
      <p className="section-label" style={{ marginBottom: 8 }}>Accesos recientes</p>
      {accessLogs.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 16 }}>Sin registros aún.</p>
      ) : accessLogs.slice(0, 20).map(log => (
        <div key={log.id} style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '10px 12px', background: 'var(--bg2)', borderRadius: 8, marginBottom: 6,
        }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{log.inviteName || log.code || '—'}</div>
            <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>
              {log.code && <span style={{ fontFamily: 'monospace' }}>{log.code}</span>}
              {log.code && log.deviceType && ' · '}
              {log.deviceType}
            </div>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text2)', textAlign: 'right', flexShrink: 0, marginLeft: 8 }}>
            {fmt(log.timestamp)}
          </div>
        </div>
      ))}

      {/* Descargas recientes */}
      <p className="section-label" style={{ marginTop: 16, marginBottom: 8 }}>Descargas recientes</p>
      {installLogs.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--text2)' }}>Sin descargas registradas aún.</p>
      ) : installLogs.slice(0, 20).map(log => (
        <div key={log.id} style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '10px 12px', background: 'var(--bg2)', borderRadius: 8, marginBottom: 6,
        }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>
              {log.platformId} v{log.version}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>
              {log.environment}
              {log.code && <span> · <span style={{ fontFamily: 'monospace' }}>{log.code}</span></span>}
              {log.deviceType && ` · ${log.deviceType}`}
            </div>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text2)', textAlign: 'right', flexShrink: 0, marginLeft: 8 }}>
            {fmt(log.timestamp)}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── MAIN ADMIN PAGE ──────────────────────────────────────────
const TABS = [
  ['import',   'Importar'],
  ['invites',  'Links'],
  ['activity', 'Actividad'],
]

export function AdminPage() {
  const { logout } = useAuth()
  const [tab, setTab] = useState('import')

  return (
    <div className="page">
      <Nav title="Admin" />

      {/* Sub-tabs */}
      <div style={{ display: 'flex', gap: 0, margin: '16px 16px 0', background: 'var(--bg2)', borderRadius: 10, padding: 3 }}>
        {TABS.map(([id, label]) => (
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
        {tab === 'import'   ? 'Importar URLs masivas' :
         tab === 'invites'  ? 'Links de invitación' :
         'Actividad reciente'}
      </p>

      {tab === 'import'   && <ImportSection />}
      {tab === 'invites'  && <InviteSection />}
      {tab === 'activity' && <ActivitySection />}

      <div style={{ padding: '20px 16px 0' }}>
        <button className="btn-text" onClick={logout} style={{ color: 'var(--red)' }}>
          Cerrar sesión
        </button>
      </div>

      <TabBar />
    </div>
  )
}
