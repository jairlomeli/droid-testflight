// src/pages/BuildsPage.jsx
import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { Nav, Spinner, Empty } from '../components/Nav'
import { TabBar } from '../components/TabBar'
import { getBuildsByVersion } from '../services/db'

const PLATFORM_META = {
  mobile:    { label: 'Mobile',      emoji: '📱', gradient: 'linear-gradient(135deg,#1a6ef5,#0A84FF)' },
  androidtv: { label: 'Android TV',  emoji: '📺', gradient: 'linear-gradient(135deg,#30a050,#30D158)' },
  firetv:    { label: 'Fire TV',     emoji: '🔥', gradient: 'linear-gradient(135deg,#cc4400,#FF6B2B)' },
}

function daysUntil(timestamp) {
  if (!timestamp) return 60
  const ms   = timestamp.toDate() - new Date()
  return Math.max(0, Math.round(ms / (1000 * 60 * 60 * 24)))
}

function BuildCard({ build, platform }) {
  const [status, setStatus] = useState('idle') // idle | loading | done
  const meta    = PLATFORM_META[platform] || PLATFORM_META.mobile
  const days    = daysUntil(build.expiresAt)

  const handleInstall = () => {
    // Abre la URL de descarga del APK directamente.
    // En Android, el navegador descargará el .apk y lanzará el instalador nativo.
    if (build.apkUrl) {
      setStatus('loading')
      window.location.href = build.apkUrl
      setTimeout(() => setStatus('done'), 2000)
    }
  }

  return (
    <div className="build-card">
      <div className="build-inner">
        <div
          className="build-app-icon"
          style={{ background: meta.gradient }}
        >
          {meta.emoji}
        </div>
        <div className="build-info">
          <div className="build-ver">
            {build.version} ({build.buildNumber})
          </div>
          <div className="build-exp">
            {days > 0 ? `Caduca en ${days} días` : 'Expirado'}
          </div>
        </div>
        <button
          className={`install-btn ${status !== 'idle' ? status : ''}`}
          onClick={handleInstall}
          disabled={status !== 'idle' || days === 0}
        >
          {status === 'idle'    && 'Instalar'}
          {status === 'loading' && '...'}
          {status === 'done'    && 'Instalado'}
        </button>
      </div>

      <div className="build-env">
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: build.changelog ? 6 : 0 }}>
          <span>{build.environment}</span>
          {build.variant && build.variant !== 'Standard' && (
            <span style={{
              background: build.variant === 'Special' ? '#ff9f0a22' : '#0a84ff22',
              color:      build.variant === 'Special' ? '#ff9f0a'   : '#0a84ff',
              border:     `1px solid ${build.variant === 'Special' ? '#ff9f0a' : '#0a84ff'}`,
              borderRadius: 5, padding: '1px 7px', fontSize: 11, fontWeight: 600,
            }}>
              {build.variant}
            </span>
          )}
        </div>
        {build.changelog && (
          <div style={{ whiteSpace: 'pre-line', lineHeight: 1.6 }}>
            {build.changelog}
          </div>
        )}
      </div>
    </div>
  )
}

export function BuildsPage() {
  const { platformId, version } = useParams()
  const [builds,  setBuilds]    = useState([])
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    getBuildsByVersion(platformId, version)
      .then(setBuilds)
      .finally(() => setLoading(false))
  }, [platformId, version])

  const meta = PLATFORM_META[platformId] || PLATFORM_META.mobile

  return (
    <div className="page">
      <Nav
        title={version}
        backLabel={meta.label}
        backTo={`/platform/${platformId}`}
      />

      <p className="section-label">Compilaciones</p>

      {loading ? (
        <Spinner />
      ) : builds.length === 0 ? (
        <Empty message="Sin compilaciones para esta versión." />
      ) : (
        builds.map(b => (
          <BuildCard key={b.id} build={b} platform={platformId} />
        ))
      )}

      <TabBar />
    </div>
  )
}
