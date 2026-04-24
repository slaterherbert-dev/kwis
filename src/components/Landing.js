import React from 'react'

export default function Landing({ go }) {
  return (
    <div className="screen centered" style={{ background: 'radial-gradient(ellipse at 50% 0%, rgba(108,99,255,0.15) 0%, transparent 65%)' }}>
      <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
        <h1 className="gradient-text" style={{ fontSize: '4rem', fontWeight: 800, letterSpacing: '-2px', marginBottom: '0.25rem' }}>Kwis</h1>
        <p style={{ color: 'var(--muted)', fontSize: '1rem' }}>Live classroom review — owned by you, forever free</p>
      </div>

      <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap', justifyContent: 'center' }}>
        <div className="card" style={{ width: 220, cursor: 'pointer', transition: 'all 0.2s' }}
          onClick={() => go('admin')}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.transform = 'translateY(-4px)'; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = ''; e.currentTarget.style.transform = ''; }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>⚙️</div>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '0.4rem' }}>Admin</h3>
          <p style={{ fontSize: '0.83rem', color: 'var(--muted)', lineHeight: 1.5 }}>Manage question sets and create new content</p>
        </div>

        <div className="card" style={{ width: 220, cursor: 'pointer', transition: 'all 0.2s' }}
          onClick={() => go('host')}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.transform = 'translateY(-4px)'; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = ''; e.currentTarget.style.transform = ''; }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>📺</div>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '0.4rem' }}>Host a game</h3>
          <p style={{ fontSize: '0.83rem', color: 'var(--muted)', lineHeight: 1.5 }}>Pick a question set, get a PIN, run the game</p>
        </div>

        <div className="card" style={{ width: 220, cursor: 'pointer', transition: 'all 0.2s' }}
          onClick={() => go('student-join')}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent2)'; e.currentTarget.style.transform = 'translateY(-4px)'; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = ''; e.currentTarget.style.transform = ''; }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>🎮</div>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '0.4rem' }}>Join a game</h3>
          <p style={{ fontSize: '0.83rem', color: 'var(--muted)', lineHeight: 1.5 }}>Enter the PIN from your teacher to play</p>
          <div style={{
            marginTop: '0.85rem',
            padding: '0.5rem 0.6rem',
            background: 'rgba(108,99,255,0.1)',
            border: '1px solid rgba(108,99,255,0.25)',
            borderRadius: 8,
          }}>
            <p style={{ fontSize: '0.65rem', color: 'var(--muted)', marginBottom: '0.15rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Go to</p>
            <p style={{ fontSize: '0.95rem', fontWeight: 800, fontFamily: 'Syne', color: 'var(--accent)', letterSpacing: '-0.3px', lineHeight: 1.2 }}>
              kwis-nine.vercel.app
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
