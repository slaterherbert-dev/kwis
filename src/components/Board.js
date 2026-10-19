import React from 'react'

// Placeholder — the real Board is the next build step.
export default function Board({ go }) {
  return (
    <div className="screen">
      <div className="container">
        <button className="back-btn" onClick={() => go('teacher-home')}>← Home</button>
        <div className="card" style={{ textAlign: 'center', padding: '3rem 2rem' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>🖥️</div>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 800, marginBottom: '0.5rem' }}>Board is on the way</h1>
          <p style={{ color: 'var(--muted)' }}>Text boxes, timer, name picker, and backgrounds are coming next.</p>
        </div>
      </div>
    </div>
  )
}
