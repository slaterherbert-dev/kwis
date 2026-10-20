import React, { useEffect, useState } from 'react'
import { supabase } from '../supabase'

export default function StudentFinal({ go, gameSession, player }) {
  const [rank, setRank] = useState(null)
  const [total, setTotal] = useState(null)
  const [finalScore, setFinalScore] = useState(player?.score || 0)
  const [comebacks, setComebacks] = useState(0)

  useEffect(() => {
    async function fetchFinal() {
      const isCC = gameSession?.game_mode === 'comeback_court'
      const { data } = await supabase.from('players').select(isCC ? 'id, score, cc_comebacks' : 'id, score').eq('session_id', gameSession.id).order('score', { ascending: false })
      if (!data) return
      setTotal(data.length)
      const myIdx = data.findIndex(p => p.id === player.id)
      setRank(myIdx + 1)
      setFinalScore(data[myIdx]?.score || 0)
      if (isCC) setComebacks(data[myIdx]?.cc_comebacks || 0)
    }
    fetchFinal()
  }, [])

  const rankEmoji = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : '🎮'
  const isOVH = gameSession?.game_mode === 'one_vs_100'
  const message = rank === 1 ? 'You won!' : rank <= 3 ? 'Top 3 — nice work!' : 'Good effort!'

  return (
    <div className="screen centered" style={{ textAlign: 'center' }}>
      <div style={{ fontSize: '4rem', marginBottom: '0.5rem' }}>{rankEmoji}</div>
      <h1 className="gradient-text" style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '0.25rem' }}>{message}</h1>
      <p style={{ color: 'var(--muted)', marginBottom: '1.5rem' }}>{player?.nickname}</p>

      <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', marginBottom: '2rem', flexWrap: 'wrap' }}>
        <div className="card-sm" style={{ textAlign: 'center', minWidth: 110 }}>
          <p style={{ fontSize: '0.75rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.25rem' }}>Final rank</p>
          <p style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: '2rem' }} className="gradient-text">#{rank || '—'}</p>
          {total && <p style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>of {total}</p>}
        </div>
        <div className="card-sm" style={{ textAlign: 'center', minWidth: 110 }}>
          <p style={{ fontSize: '0.75rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.25rem' }}>{isOVH ? 'Winnings' : 'Score'}</p>
          <p style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: '2rem' }}>{isOVH ? '$' : ''}{finalScore.toLocaleString()}</p>
          <p style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>{isOVH ? 'total' : 'points'}</p>
        </div>
      </div>

      {comebacks > 0 && (
        <p style={{ fontWeight: 700, marginBottom: '1rem' }}>
          You climbed out of the Comeback Court {comebacks} time{comebacks !== 1 ? 's' : ''}. That’s resilience.
        </p>
      )}
      <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>Nice work reviewing today's material!</p>
    </div>
  )
}
