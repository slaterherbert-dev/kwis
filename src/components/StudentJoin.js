import React, { useState } from 'react'
import { supabase } from '../supabase'

const AVATARS = ['😎','🦊','🐼','🦁','🐯','🦋','🌟','🎯','🔥','⚡','🦅','🎲','🏆','🎸','🚀','🌊','🦄','🍕','👾','🤖']

export default function StudentJoin({ go, setGameSession, setPlayer }) {
  const [pin, setPin] = useState('')
  const [nickname, setNickname] = useState('')
  const [pinError, setPinError] = useState('')
  const [nickError, setNickError] = useState('')
  const [loading, setLoading] = useState(false)

  async function joinGame() {
    setPinError(''); setNickError('')
    if (!nickname.trim()) { setNickError('Enter a nickname'); return }
    if (pin.length !== 6) { setPinError('PIN must be 6 digits'); return }
    setLoading(true)

    const { data: session } = await supabase.from('game_sessions').select('*').eq('pin', pin).single()
    if (!session) { setPinError('PIN not found — ask your teacher'); setLoading(false); return }
    if (session.phase !== 'lobby') { setPinError('Game already started — ask your teacher'); setLoading(false); return }

    const { data: existing } = await supabase.from('players').select('id').eq('session_id', session.id).eq('nickname', nickname.trim())
    if (existing && existing.length > 0) { setNickError('That nickname is taken — pick another'); setLoading(false); return }

    const avatar = AVATARS[Math.floor(Math.random() * AVATARS.length)]
    const { data: player } = await supabase.from('players').insert([{
      session_id: session.id, nickname: nickname.trim(), score: 0, avatar
    }]).select().single()

    setGameSession(session)
    setPlayer(player)
    setLoading(false)
    go('student-lobby')
  }

  return (
    <div className="screen centered" style={{ background: 'radial-gradient(ellipse at 50% 0%, rgba(255,107,157,0.1) 0%, transparent 60%)' }}>

      {/* ── Big URL banner — visible on projector ── */}
      <div style={{
        width: '100%',
        maxWidth: 480,
        textAlign: 'center',
        marginBottom: '2rem',
        padding: '1.1rem 1.5rem',
        background: 'rgba(108,99,255,0.12)',
        border: '2px solid rgba(108,99,255,0.35)',
        borderRadius: 'var(--radius)',
      }}>
        <p style={{
          fontSize: '0.72rem',
          color: 'var(--muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.12em',
          marginBottom: '0.3rem'
        }}>Open this website on your device</p>
        <p style={{
          fontFamily: 'Syne',
          fontWeight: 800,
          fontSize: 'clamp(1.6rem, 5vw, 2.4rem)',
          color: 'var(--accent)',
          letterSpacing: '-0.5px',
          lineHeight: 1.1,
        }}>
          kwis-nine.vercel.app
        </p>
      </div>

      <div className="card" style={{ width: '100%', maxWidth: 380 }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1.5rem' }}>Join a game</h2>
        <div className="form-group">
          <label>Game PIN</label>
          <input type="text" inputMode="numeric" placeholder="6-digit PIN" maxLength={6}
            value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
            onKeyDown={e => e.key === 'Enter' && joinGame()}
            style={{ fontSize: '1.5rem', letterSpacing: '0.2em', textAlign: 'center' }} />
          <div className={`error-msg ${pinError ? 'show' : ''}`}>{pinError}</div>
        </div>
        <div className="form-group">
          <label>Nickname</label>
          <input type="text" placeholder="e.g. EconKing23" maxLength={20}
            value={nickname} onChange={e => setNickname(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && joinGame()} />
          <div className={`error-msg ${nickError ? 'show' : ''}`}>{nickError}</div>
        </div>
        <button className="btn btn-primary btn-full" disabled={loading} onClick={joinGame}>
          {loading ? 'Joining…' : 'Join game →'}
        </button>
      </div>
      <button className="back-btn" style={{ marginTop: '1.5rem' }} onClick={() => go('landing')}>← Back</button>
    </div>
  )
}
