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

export function VersionsPage() {
  const { platformId } = useParams()
  const navigate       = useNavigate()
  const [versions, setVersions] = useState([])
  const [loading,  setLoading]  = useState(true)

  useEffect(() => {
    getVersionsByPlatform(platformId)
      .then(setVersions)
      .finally(() => setLoading(false))
  }, [platformId])

  const label = PLATFORM_LABELS[platformId] || platformId

  return (
    <div className="page">
      <Nav title={label} backLabel="DroidFlight" backTo="/" />

      <p className="section-label">Versiones</p>

      {loading ? (
        <Spinner />
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
                <div className="ver-count">
                  {v.buildCount} {v.buildCount === 1 ? 'compilación' : 'compilaciones'}
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
