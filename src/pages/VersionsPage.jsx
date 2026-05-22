// src/pages/VersionsPage.jsx
import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Nav, Chevron, Spinner, Empty } from '../components/Nav'
import { TabBar } from '../components/TabBar'
import { getVersionsByPlatform } from '../services/db'

const PLATFORM_LABELS = {
  mobile:    'Mobile',
  androidtv: 'Android TV',
  firetv:    'Fire TV',
}

function daysLeft(timestamp) {
  if (!timestamp) return null
  const ms = timestamp.toDate ? timestamp.toDate() - new Date() : new Date(timestamp) - new Date()
  return Math.ceil(ms / (1000 * 60 * 60 * 24))
}

function ExpiryBadge({ expiresAt }) {
  const days = daysLeft(expiresAt)
  if (days === null) return null
  if (days <= 0) return (
    <span style={{ fontSize: 11, fontWeight: 600, color: '#ff3b30', background: '#ff3b3018', borderRadius: 5, padding: '1px 6px', border: '1px solid #ff3b3044' }}>
      Expirado
    </span>
  )
  const color = days <= 7 ? '#ff3b30' : days <= 30 ? '#ff9f0a' : '#34c759'
  return (
    <span style={{ fontSize: 11, fontWeight: 600, color, background: color + '18', borderRadius: 5, padding: '1px 6px', border: `1px solid ${color}44` }}>
      {days}d
    </span>
  )
}

export function VersionsPage() {
  const { platformId } = useParams()
  const navigate       = useNavigate()
  const [versions, setVersions] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    getVersionsByPlatform(platformId)
      .then(setVersions)
      .catch(e => { console.error('getVersionsByPlatform error:', e); setError(e.message) })
      .finally(() => setLoading(false))
  }, [platformId])

  const label = PLATFORM_LABELS[platformId] || platformId

  return (
    <div className="page">
      <Nav title={label} backLabel="Droid-TestFlight" backTo="/" />

      <p className="section-label">Versiones</p>

      {loading ? (
        <Spinner />
      ) : error ? (
        <Empty message={`Error: ${error}`} />
      ) : versions.length === 0 ? (
        <Empty message="Sin versiones disponibles aún." />
      ) : (
        <div className="list-group">
          {versions.map(v => (
            <div
              key={v.id}
              className="ver-row"
              onClick={() => navigate(`/platform/${platformId}/version/${v.version}`)}
            >
              <div>
                <div className="ver-num">{v.version}</div>
                <div className="ver-count" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {v.buildCount} {v.buildCount === 1 ? 'compilación' : 'compilaciones'}
                  <ExpiryBadge expiresAt={v.expiresAt} />
                </div>
              </div>
              <Chevron />
            </div>
          ))}
        </div>
      )}

      <TabBar />
    </div>
  )
}
