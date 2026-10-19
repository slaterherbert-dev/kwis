import React from 'react'
import { useAuth } from '../contexts/AuthContext'

// Student-first: the only big action is joining a game.
export default function Landing({ go }) {
  const { user } = useAuth()

  return (
    <div className="screen centered" style={{ background: 'radial-gradient(ellipse at 50% 0%, rgba(108,99,255,0.15) 0%, transparent 65%)' }}>
      <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
        <h1 className="gradient-text" style={{ fontSize: '4rem', fontWeight: 800, letterSpacing: '-2px', marginBottom: '0.25rem' }}>Kwis</h1>
        <p style={{ color: 'var(--muted)', fontSize: '1rem' }}>Live classroom review</p>
      </div>

      <button className="btn btn-primary btn-lg join-btn" onClick={() => go('student-join')}>
        🎮 Join a game
      </button>
      <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginTop: '0.85rem' }}>
        Enter the PIN from your teacher to play
      </p>

      <button className="text-link" style={{ marginTop: '3.5rem' }} onClick={() => go('teacher-home')}>
        {user ? 'Open teacher home' : 'Teacher? Sign in'}
      </button>
    </div>
  )
}
