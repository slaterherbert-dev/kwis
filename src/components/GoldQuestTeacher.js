import React, { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabase'

function generatePin() {
  return String(Math.floor(100000 + Math.random() * 900000))
}

export default function GoldQuestTeacher({ go, gameSession, setGameSession }) {
  const [phase, setPhase] = useState('pick') // pick | lobby | live | final
  const [sets, setSets] = useState([])
  const [selectedSet, setSelectedSet] = useState(null)
  const [questions, setQuestions] = useState([])
  const [players, setPlayers] = useState([])
  const [answers, setAnswers] = useState([])
  const [session, setSession] = useState(null)
  const sessionRef = useRef(null)
  const pollRef = useRef(null)

  useEffect(() => { sessionRef.current = session }, [session])

  useEffect(() => {
    fetchSets()
    return () => clearInterval(pollRef.current)
  }, [])

  useEffect(() => {
    if (!session) return
    const sub = supabase.channel('gq-host-' + session.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players', filter: `session_id=eq.${session.id}` }, () => fetchPlayers(session.id))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'answers', filter: `session_id=eq.${session.id}` }, () => fetchAnswers(session.id))
      .subscribe()
    return () => supabase.removeChannel(sub)
  }, [session])

  async function fetchSets() {
    const { data } = await supabase.from('question_sets').select('*').order('subject')
    setSets(data || [])
  }

  async function fetchPlayers(sid) {
    const { data } = await supabase.from('players').select('*').eq('session_id', sid).order('score', { ascending: false })
    setPlayers(data || [])
  }

  async function fetchAnswers(sid) {
    const { data } = await supabase.from('answers').select('*').eq('session_id', sid)
    setAnswers(data || [])
  }

  async function startLobby() {
    const { data: qs } = await supabase.from('questions').select('*').eq('set_id', selectedSet.id).order('position')
    if (!qs || qs.length === 0) { alert('This question set has no questions. Add some in Admin first.'); return }
    setQuestions(qs)
    const pin = generatePin()
    const { data } = await supabase.from('game_sessions').insert([{
      pin,
      set_id: selectedSet.id,
      current_question: 0,
      phase: 'lobby',
      game_mode: 'gold_quest'
    }]).select().single()
    setSession(data)
    setGameSession(data)
    await fetchPlayers(data.id)
    setPhase('lobby')
  }

  async function startGame() {
    await supabase.from('game_sessions').update({ phase: 'question' }).eq('id', session.id)
    setPhase('live')

    // Poll for player progress while game is live
    pollRef.current = setInterval(() => {
      const sid = sessionRef.current?.id
      if (sid) {
        fetchPlayers(sid)
        fetchAnswers(sid)
      }
    }, 3000)
  }

  async function endGame() {
    clearInterval(pollRef.current)
    await supabase.from('game_sessions').update({ phase: 'ended', ended: true }).eq('id', session.id)
    await fetchPlayers(session.id)
    await fetchAnswers(session.id)
    setPhase('final')
  }

  function downloadCSV() {
    if (!players.length) return
    const opts = ['A', 'B', 'C', 'D']

    const rows = [['Nickname', 'Gold', ...questions.map((q, i) => `Q${i + 1}: ${q.question_text.slice(0, 40)}...`)]]
    players.forEach(p => {
      const row = [p.nickname, p.score]
      questions.forEach((q, qi) => {
        const ans = answers.find(a => a.player_id === p.id && a.question_index === qi)
        if (!ans) { row.push('No answer'); return }
        row.push(`${opts[ans.answer_given] || '?'} (${ans.is_correct ? 'correct' : 'wrong'})`)
      })
      rows.push(row)
    })

    rows.push([])

    const pctRow = ['% Correct', '']
    questions.forEach((q, qi) => {
      const qAnswers = answers.filter(a => a.question_index === qi)
      const correct = qAnswers.filter(a => a.is_correct).length
      const total = qAnswers.length || 1
      pctRow.push(`${Math.round((correct / total) * 100)}%`)
    })
    rows.push(pctRow)

    const answerRow = ['Correct Answer', '']
    questions.forEach(q => answerRow.push(opts[q.correct_index]))
    rows.push(answerRow)

    const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `kwis-goldquest-${session?.pin}.csv`; a.click()
  }

  // ── Derived ──
  const totalQuestions = questions.length

  // Per-player progress: how many questions they've answered
  function playerProgress(playerId) {
    return answers.filter(a => a.player_id === playerId).length
  }
  function playerCorrect(playerId) {
    return answers.filter(a => a.player_id === playerId && a.is_correct).length
  }

  const allFinished = players.length > 0 && players.every(p => playerProgress(p.id) >= totalQuestions)

  // ── PICK SET ──
  if (phase === 'pick') return (
    <div className="screen">
      <div className="container">
        <button className="back-btn" onClick={() => go('landing')}>← Home</button>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.5rem' }}>
          <span style={{ fontSize: '1.6rem' }}>🪙</span>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 800 }}>Gold Quest</h1>
        </div>
        <p style={{ color: 'var(--muted)', marginBottom: '2rem', fontSize: '0.9rem' }}>Pick a question set — students play at their own pace and hunt for gold</p>
        {sets.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
            <p style={{ color: 'var(--muted)', marginBottom: '1rem' }}>No question sets found. Create one in Admin first.</p>
            <button className="btn btn-primary" onClick={() => go('admin')}>Go to Admin</button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.5rem' }}>
            {sets.map(s => (
              <div key={s.id} className="card-sm" style={{
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                border: selectedSet?.id === s.id ? '1px solid var(--accent)' : '',
                background: selectedSet?.id === s.id ? 'rgba(108,99,255,0.08)' : ''
              }} onClick={() => setSelectedSet(s)}>
                <div>
                  <p style={{ fontWeight: 600, marginBottom: '0.2rem' }}>{s.name}</p>
                  <span className="badge badge-accent">{s.subject}</span>
                </div>
                {selectedSet?.id === s.id && <span style={{ color: 'var(--accent)', fontSize: '1.2rem' }}>✓</span>}
              </div>
            ))}
          </div>
        )}
        {selectedSet && (
          <button className="btn btn-primary btn-full btn-lg" onClick={startLobby}>
            Start lobby →
          </button>
        )}
      </div>
    </div>
  )

  // ── LOBBY ──
  if (phase === 'lobby') return (
    <div className="screen">
      <div className="container">
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>🪙</div>
          <p style={{ fontSize: '0.8rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.5rem' }}>Gold Quest — Game PIN</p>
          <div className="gradient-text" style={{ fontSize: '4.5rem', fontWeight: 800, fontFamily: 'Syne', letterSpacing: '0.2em' }}>{session?.pin}</div>
          <p style={{ color: 'var(--muted)', fontSize: '0.9rem', marginTop: '0.5rem' }}>Students go to this page → "Join a game" → enter this PIN</p>
        </div>
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <p style={{ fontSize: '0.8rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.75rem' }}>Players joined — {players.length}</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', minHeight: 40 }}>
            {players.map(p => <div key={p.id} className="chip pop-in">{p.avatar} {p.nickname}</div>)}
            {players.length === 0 && <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>Waiting for students…</p>}
          </div>
        </div>
        <button className="btn btn-primary btn-full btn-lg" disabled={players.length < 1} onClick={startGame}>
          Start Gold Quest — {players.length} player{players.length !== 1 ? 's' : ''} ready
        </button>
      </div>
    </div>
  )

  // ── LIVE DASHBOARD ──
  if (phase === 'live') return (
    <div className="screen">
      <div className="container-wide">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '1.3rem' }}>🪙</span>
            <h2 style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: '1.3rem' }}>Gold Quest — Live</h2>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <span className="badge badge-accent">{selectedSet?.subject}</span>
            <span style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>{totalQuestions} questions</span>
          </div>
        </div>

        {allFinished && (
          <div style={{
            background: 'rgba(0,229,160,0.1)', border: '1px solid rgba(0,229,160,0.3)',
            borderRadius: 'var(--radius)', padding: '0.85rem 1.1rem', marginBottom: '1rem',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem'
          }}>
            <p style={{ color: 'var(--green)', fontWeight: 600, fontSize: '0.9rem' }}>✓ All students have finished!</p>
            <button className="btn btn-primary" onClick={endGame}>End game & show results</button>
          </div>
        )}

        <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
          {/* Leaderboard */}
          <div style={{ flex: 1, minWidth: 300 }}>
            <div className="card" style={{ marginBottom: '1rem' }}>
              <p style={{ fontSize: '0.75rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.75rem' }}>Gold Leaderboard</p>
              {players.length === 0 && <p style={{ color: 'var(--muted)', fontSize: '0.82rem' }}>No scores yet</p>}
              {players.map((p, i) => {
                const prog = playerProgress(p.id)
                const correct = playerCorrect(p.id)
                const progPct = totalQuestions > 0 ? (prog / totalQuestions) * 100 : 0
                return (
                  <div key={p.id} className="lb-row" style={{ alignItems: 'center' }}>
                    <div className={`lb-rank ${i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : ''}`}>{i + 1}</div>
                    <div style={{ fontSize: '1rem' }}>{p.avatar}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.2rem' }}>
                        <span className="lb-name" style={{ fontSize: '0.85rem' }}>{p.nickname}</span>
                        <span style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: '0.9rem', color: 'var(--yellow, #ffaa32)' }}>🪙 {p.score}</span>
                      </div>
                      <div style={{ height: 4, borderRadius: 2, background: 'var(--surface2)', overflow: 'hidden' }}>
                        <div style={{
                          width: `${progPct}%`, height: '100%', borderRadius: 2,
                          background: progPct >= 100 ? 'var(--green)' : 'var(--accent)',
                          transition: 'width 0.5s ease'
                        }} />
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.15rem' }}>
                        <span style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>{prog}/{totalQuestions} answered</span>
                        <span style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>{correct} correct</span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Stats sidebar */}
          <div style={{ width: 220, flexShrink: 0 }}>
            <div className="card" style={{ marginBottom: '1rem' }}>
              <p style={{ fontSize: '0.75rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.6rem' }}>Game stats</p>

              <div style={{ marginBottom: '0.75rem' }}>
                <p style={{ fontSize: '0.78rem', color: 'var(--muted)', marginBottom: '0.2rem' }}>Players</p>
                <p style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: '1.5rem' }}>{players.length}</p>
              </div>

              <div style={{ marginBottom: '0.75rem' }}>
                <p style={{ fontSize: '0.78rem', color: 'var(--muted)', marginBottom: '0.2rem' }}>Total answers</p>
                <p style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: '1.5rem' }}>{answers.length}</p>
              </div>

              <div style={{ marginBottom: '0.75rem' }}>
                <p style={{ fontSize: '0.78rem', color: 'var(--muted)', marginBottom: '0.2rem' }}>Accuracy</p>
                <p style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: '1.5rem', color: 'var(--green)' }}>
                  {answers.length > 0 ? `${Math.round((answers.filter(a => a.is_correct).length / answers.length) * 100)}%` : '—'}
                </p>
              </div>

              <div>
                <p style={{ fontSize: '0.78rem', color: 'var(--muted)', marginBottom: '0.2rem' }}>Finished</p>
                <p style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: '1.5rem' }}>
                  {players.filter(p => playerProgress(p.id) >= totalQuestions).length}/{players.length}
                </p>
              </div>
            </div>

            <button className="btn btn-full" style={{ background: 'rgba(255,71,87,0.12)', border: '1px solid rgba(255,71,87,0.3)', color: 'var(--red)' }} onClick={endGame}>
              End game now
            </button>
          </div>
        </div>
      </div>
    </div>
  )

  // ── FINAL ──
  if (phase === 'final') {
    const podiumOrder = [players[1], players[0], players[2]].filter(Boolean)
    const podiumClasses = ['p2', 'p1', 'p3']
    const podiumEmojis = ['🥈', '🥇', '🥉']
    return (
      <div className="screen">
        <div className="container">
          <div style={{ fontSize: '1.5rem', textAlign: 'center', marginBottom: '0.25rem' }}>🪙</div>
          <h1 className="gradient-text" style={{ fontSize: '2.5rem', fontWeight: 800, textAlign: 'center', marginBottom: '0.25rem' }}>Gold Quest — Results</h1>
          <p style={{ color: 'var(--muted)', textAlign: 'center', marginBottom: '2rem', fontSize: '0.9rem' }}>{selectedSet?.name}</p>
          <div className="podium">
            {podiumOrder.map((p, i) => p && (
              <div key={p.id} className="podium-slot">
                <div className="podium-name">{p.avatar} {p.nickname}</div>
                <div className="podium-score">🪙 {p.score.toLocaleString()}</div>
                <div className={`podium-bar ${podiumClasses[i]}`}>{podiumEmojis[i]}</div>
              </div>
            ))}
          </div>
          <div className="card" style={{ marginBottom: '1.5rem' }}>
            {players.map((p, i) => (
              <div key={p.id} className="lb-row">
                <div className={`lb-rank ${i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : ''}`}>{['🥇','🥈','🥉'][i] || i + 1}</div>
                <div style={{ fontSize: '1rem' }}>{p.avatar}</div>
                <div className="lb-name">{p.nickname}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontFamily: 'Syne', fontWeight: 700, color: 'var(--yellow, #ffaa32)' }}>🪙 {p.score.toLocaleString()}</span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>{playerCorrect(p.id)}/{totalQuestions}</span>
                </div>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button className="btn btn-success" onClick={downloadCSV}>⬇ Download results CSV</button>
            <button className="btn btn-primary" onClick={() => { setPhase('pick'); setSession(null); setSelectedSet(null); setPlayers([]); setAnswers([]) }}>Play again</button>
            <button className="btn" onClick={() => go('landing')}>Home</button>
          </div>
        </div>
      </div>
    )
  }

  return null
}
