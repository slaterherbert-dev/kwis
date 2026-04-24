import React, { useEffect, useState } from 'react'
import { supabase } from '../supabase'

export default function StudentLobby({ go, gameSession, player }) {
  const [playerCount, setPlayerCount] = useState(1)

  useEffect(() => {
    if (!gameSession) return
    const sub = supabase.channel('lobby-student-' + gameSession.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players', filter: `session_id=eq.${gameSession.id}` }, async () => {
        const { count } = await supabase.from('players').select('*', { count: 'exact', head: true }).eq('session_id', gameSession.id)
        setPlayerCount(count || 1)
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'game_sessions', filter: `id=eq.${gameSession.id}` }, (payload) => {
        if (payload.new.phase === 'question' || payload.new.phase === 'countdown') {
          if (payload.new.game_mode === 'gold_quest') {
            go('gold-quest-play')
          } else {
            go('student-game')
          }
        }
      })
      .subscribe()
    return () => supabase.removeChannel(sub)
  }, [gameSession])

  if (!player) return null

  return (
    <div className="screen centered" style={{ textAlign: 'center' }}>
      <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'linear-gradient(135deg, var(--accent), var(--accent2))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem', margin: '0 auto 1rem' }}>
        {player.avatar}
      </div>
      <h2 style={{ fontFamily: 'Syne', fontSize: '2rem', fontWeight: 800, marginBottom: '0.5rem' }}>{player.nickname}</h2>
      <p style={{ color: 'var(--muted)', marginBottom: '2rem' }}>You're in! Waiting for the teacher to start…</p>
      <div className="dot-row" style={{ marginBottom: '2rem' }}>
        <div className="dot" /><div className="dot" /><div className="dot" />
      </div>
      <div className="card-sm" style={{ display: 'inline-block' }}>
        <span style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>Players joined: </span>
        <strong style={{ fontFamily: 'Syne', fontSize: '1.2rem' }}>{playerCount}</strong>
      </div>
    </div>
  )
}
