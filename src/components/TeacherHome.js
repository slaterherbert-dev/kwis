import React from 'react'
import { useAuth } from '../contexts/AuthContext'

// Every teacher tool gets one entry here. To add a tool later, add a line.
const TOOLS = [
  { screen: 'host',  icon: '📺', title: 'Host a game',   desc: 'Pick a question set and game mode, get a PIN, and run it live.' },
  { screen: 'admin', icon: '📝', title: 'Question sets', desc: 'Create, edit, share, and import question sets from CSV.' },
  { screen: 'board', icon: '🖥️', title: 'Board',         desc: 'Your classroom display: agenda, timer, name picker, and more.', isNew: true },
]

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

export default function TeacherHome({ go }) {
  const { user, signOut } = useAuth()

  return (
    <div className="screen">
      <div className="container-wide">
        <header className="home-header">
          <span className="gradient-text home-wordmark">Kwis</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span className="home-email">{user?.email}</span>
            <button className="btn" onClick={signOut}>Sign out</button>
          </div>
        </header>

        <h1 className="home-greeting">{greeting()}</h1>
        <p style={{ color: 'var(--muted)', marginBottom: '2rem' }}>What are we doing today?</p>

        <div className="tool-grid">
          {TOOLS.map(t => (
            <button key={t.screen} className="tool-tile" onClick={() => go(t.screen)}>
              <span className="tool-icon" aria-hidden="true">{t.icon}</span>
              <span className="tool-title">
                {t.title}
                {t.isNew && <span className="badge badge-green" style={{ marginLeft: '0.5rem' }}>New</span>}
              </span>
              <span className="tool-desc">{t.desc}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
