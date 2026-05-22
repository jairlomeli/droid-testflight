// src/pages/PlatformsPage.jsx
import { useNavigate } from 'react-router-dom'
import { Nav, Chevron } from '../components/Nav'
import { TabBar } from '../components/TabBar'
import { IconDeviceMobileDown, IconDeviceTv } from '@tabler/icons-react'

const PLATFORMS = [
  {
    id:      'mobile',
    label:   'Mobile',
    sub:     'Android',
    icon:    <IconDeviceMobileDown size={28} color="#ffffff" stroke={1.6} />,
    bg:      '#3DDC84',
    border:  'none',
  },
  {
    id:      'androidtv',
    label:   'Android TV',
    sub:     'Android TV OS',
    icon:    <IconDeviceTv size={28} color="#3DDC84" stroke={1.6} />,
    bg:      '#1a1a2e',
    border:  '1.5px solid #3DDC84',
  },
]

export function PlatformsPage() {
  const navigate = useNavigate()

  return (
    <div className="page">
      <Nav title="Droid-TestFlight" />

      <p className="section-label">Plataformas</p>
      <div className="list-group">
        {PLATFORMS.map(p => (
          <div
            key={p.id}
            className="list-row"
            onClick={() => navigate(`/platform/${p.id}`)}
          >
            <div style={{
              width: 52, height: 52, borderRadius: 13, flexShrink: 0,
              background: p.bg, border: p.border,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxSizing: 'border-box',
            }}>
              {p.icon}
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
