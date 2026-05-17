// src/pages/PlatformsPage.jsx
import { useNavigate } from 'react-router-dom'
import { Nav, Chevron } from '../components/Nav'
import { TabBar } from '../components/TabBar'

const PLATFORMS = [
  {
    id:       'mobile',
    label:    'Mobile',
    sub:      'Android',
    emoji:    '📱',
    gradient: 'linear-gradient(135deg, #1a6ef5, #0A84FF)',
  },
  {
    id:       'androidtv',
    label:    'Android TV',
    sub:      'Android TV OS',
    emoji:    '📺',
    gradient: 'linear-gradient(135deg, #30a050, #30D158)',
  },
  {
    id:       'firetv',
    label:    'Fire TV',
    sub:      'Amazon Fire OS',
    emoji:    '🔥',
    gradient: 'linear-gradient(135deg, #cc4400, #FF6B2B)',
  },
]

export function PlatformsPage() {
  const navigate = useNavigate()

  return (
    <div className="page">
      <Nav title="DroidFlight" />

      <p className="section-label">Plataformas</p>
      <div className="list-group">
        {PLATFORMS.map((p, i) => (
          <div
            key={p.id}
            className="list-row"
            onClick={() => navigate(`/platform/${p.id}`)}
          >
            <div
              className="row-icon"
              style={{ background: p.gradient, fontSize: 26 }}
            >
              {p.emoji}
            </div>
            <div className="row-body">
              <div className="row-name">{p.label}</div>
              <div className="row-sub">{p.sub}</div>
            </div>
            <Chevron />
          </div>
        ))}
      </div>

      <TabBar />
    </div>
  )
}
