import React, { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabase'

const TIMER_SECONDS = 20

function generatePin() {
  return String(Math.floor(100000 + Math.random() * 900000))
}

export default function TeacherHost({ go, gameSession, setGameSession }) {
  const [phase, setPhase] = useState('pick') // pick | lobby | countdown | question | revealed | final
  const [sets, setSets] = useState([])
  const [selectedSet, setSelectedSet] = useState(null)
  const [questions, setQuestions] = useState([])
  const [currentQ, setCurrentQ] = useState(0)
  const [players, setPlayers] = useState([])
  const [answers, setAnswers] = useState([])
  const [timer, setTimer] = useState(TIMER_SECONDS)
  const [countdown, setCountdown] = useState(3)
  const [session, setSession] = useState(null)
  const timerRef = useRef(null)
  const countdownRef = useRef(null)
  const sessionRef = useRef(null)

  // Keep sessionRef in sync so the timer callback never sees a stale session
  useEffect(() => { sessionRef.current = session }, [session])

  useEffect(() => {
    fetchSets()
    return () => { clearInterval(timerRef.current); clearInterval(countdownRef.current) }
  }, [])

  useEffect(() => {
    if (!session) return
    const sub = supabase.channel('host-' + session.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players', filter: `session_id=eq.${session.id}` }, () => fetchPlayers(session.id))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'answers', filter: `session_id=eq.${session.id}` }, () => fetchAnswers(session.id))
      .subscribe()
    return () => supabase.removeChannel(sub)
  }, [session])

  async function fetchSets() {
    // RLS automatically filters to only this teacher's sets
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
    const { data } = await supabase.from('game_sessions').insert([{ pin, set_id: selectedSet.id, current_question: 0, phase: 'lobby' }]).select().single()
    setSession(data)
    setGameSession(data)
    await fetchPlayers(data.id)
    setPhase('lobby')
  }

  async function startGame() {
    clearInterval(countdownRef.current)
    setPhase('countdown')
    let c = 3
    setCountdown(c)
    countdownRef.current = setInterval(() => {
      c--
      setCountdown(c)
      if (c <= 0) {
        clearInterval(countdownRef.current)
        loadQuestion(0)
      }
    }, 1000)
  }

  async function loadQuestion(idx) {
    clearInterval(timerRef.current)
    timerRef.current = null
    setCurrentQ(idx)
    setTimer(TIMER_SECONDS)
    setPhase('question')
    await supabase.from('game_sessions').update({ current_question: idx, phase: 'question', revealed: false }).eq('id', sessionRef.current.id)
    let t = TIMER_SECONDS
    timerRef.current = setInterval(() => {
      t--
      setTimer(t)
      if (t <= 0) {
        clearInterval(timerRef.current)
        timerRef.current = null
        // Auto-reveal when timer expires
        autoReveal()
      }
    }, 1000)
  }

  async function autoReveal() {
    const sid = sessionRef.current?.id
    if (!sid) return
    await supabase.from('game_sessions').update({ phase: 'revealed', revealed: true }).eq('id', sid)
    await fetchAnswers(sid)
    await fetchPlayers(sid)
    setPhase('revealed')
  }

  async function revealAnswer() {
    clearInterval(timerRef.current)
    timerRef.current = null
    const sid = sessionRef.current?.id
    if (!sid) return
    await supabase.from('game_sessions').update({ phase: 'revealed', revealed: true }).eq('id', sid)
    await fetchAnswers(sid)
    await fetchPlayers(sid)
    setPhase('revealed')
  }

  async function nextQuestion() {
    const next = currentQ + 1
    if (next >= questions.length) {
      await endGame()
    } else {
      await loadQuestion(next)
    }
  }

  async function endGame() {
    clearInterval(timerRef.current)
    await supabase.from('game_sessions').update({ phase: 'ended', ended: true }).eq('id', session.id)
    await fetchPlayers(session.id)
    await fetchAnswers(session.id)
    setPhase('final')
  }

  function downloadCSV() {
    if (!players.length) return
    const rows = [['Nickname', 'Score', ...questions.map((q, i) => `Q${i + 1}: ${q.question_text.slice(0, 40)}...`)]]
    players.forEach(p => {
      const row = [p.nickname, p.score]
      questions.forEach((q, qi) => {
        const ans = answers.find(a => a.player_id === p.id && a.question_index === qi)
        if (!ans) { row.push('No answer'); return }
        const opts = ['A', 'B', 'C', 'D']
        row.push(`${opts[ans.answer_given] || '?'} (${ans.is_correct ? 'correct' : 'wrong'})`)
      })
      rows.push(row)
    })

    // Blank separator row
    rows.push([])

    // % correct per question
    const pctRow = ['% Correct', '']
    questions.forEach((q, qi) => {
      const qAnswers = answers.filter(a => a.question_index === qi)
      const correct = qAnswers.filter(a => a.is_correct).length
      const total = players.length
      const pct = total > 0 ? Math.round((correct / total) * 100) : 0
      pctRow.push(`${pct}%`)
    })
    rows.push(pctRow)

    // # who got it wrong
    const wrongRow = ['# Wrong', '']
    questions.forEach((q, qi) => {
      const qAnswers = answers.filter(a => a.question_index === qi)
      const wrong = players.length - qAnswers.filter(a => a.is_correct).length
      wrongRow.push(wrong)
    })
    rows.push(wrongRow)

    // Correct answer label
    const answerRow = ['Correct Answer', '']
    const opts = ['A', 'B', 'C', 'D']
    questions.forEach(q => answerRow.push(opts[q.correct_index]))
    rows.push(answerRow)

    const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `kwis-results-${session?.pin}.csv`; a.click()
  }

  const q = questions[currentQ]
  const answeredCount = answers.filter(a => a.question_index === currentQ).length
  const correctCount = answers.filter(a => a.question_index === currentQ && a.is_correct).length
  const optColors = ['var(--opt-a)', 'var(--opt-b)', 'var(--opt-c)', 'var(--opt-d)']
  const optLabels = ['A', 'B', 'C', 'D']
  const timerPct = (timer / TIMER_SECONDS) * 100
  const timerColor = timer > 10 ? 'var(--green)' : timer > 5 ? 'var(--yellow)' : 'var(--red)'
  const circumference = 2 * Math.PI * 22

  // ── PICK SET ──
  if (phase === 'pick') return (
    <div className="screen">
      <div className="container">
        <button className="back-btn" onClick={() => go('landing')}>← Home</button>
        <h1 style={{ fontSize: '1.6rem', fontWeight: 800, marginBottom: '0.5rem' }}>Host a game</h1>
        <p style={{ color: 'var(--muted)', marginBottom: '2rem', fontSize: '0.9rem' }}>Pick a question set to play</p>
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
          <p style={{ fontSize: '0.8rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.5rem' }}>Game PIN</p>
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
          Start game — {players.length} player{players.length !== 1 ? 's' : ''} ready
        </button>
      </div>
    </div>
  )

  // ── COUNTDOWN ──
  if (phase === 'countdown') return (
    <div className="countdown-overlay">
      <p style={{ color: 'var(--muted)', marginBottom: '1rem' }}>Get ready!</p>
      <div className="countdown-num" key={countdown}>{countdown}</div>
    </div>
  )

  // ── QUESTION ──
  if ((phase === 'question' || phase === 'revealed') && q) return (
    <div className="screen">
      <div className="container-wide">
        <div className="progress-bar"><div className="progress-fill" style={{ width: `${((currentQ) / questions.length) * 100}%` }} /></div>
        <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
          {/* LEFT COLUMN */}
          <div style={{ flex: 1, minWidth: 280 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
              <div>
                <p style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>Question {currentQ + 1} of {questions.length}</p>
                <span className="badge badge-accent">{selectedSet?.subject}</span>
              </div>
              <div className="timer-wrap">
                <svg width="56" height="56" viewBox="0 0 56 56">
                  <circle cx="28" cy="28" r="22" fill="none" stroke="var(--surface2)" strokeWidth="4" />
                  <circle cx="28" cy="28" r="22" fill="none" stroke={timerColor} strokeWidth="4"
                    strokeDasharray={circumference} strokeDashoffset={circumference * (1 - timerPct / 100)}
                    strokeLinecap="round" style={{ transform: 'rotate(-90deg)', transformOrigin: 'center', transition: 'stroke-dashoffset 1s linear, stroke 0.3s' }} />
                </svg>
                <div className="timer-text" style={{ color: timerColor }}>{timer}</div>
              </div>
            </div>

            <div className="card" style={{ marginBottom: '1rem' }}>
              <p style={{ fontSize: '1.3rem', fontWeight: 700, fontFamily: 'Syne', lineHeight: 1.4 }}>{q.question_text}</p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem', marginBottom: '1rem' }}>
              {['option_a', 'option_b', 'option_c', 'option_d'].map((opt, i) => (
                <div key={opt} style={{
                  padding: '0.9rem 1rem', borderRadius: 'var(--radius)',
                  background: phase === 'revealed'
                    ? i === q.correct_index ? `rgba(0,229,160,0.15)` : 'rgba(255,255,255,0.03)'
                    : `${optColors[i]}22`,
                  border: phase === 'revealed'
                    ? i === q.correct_index ? '2px solid var(--green)' : '1px solid var(--border)'
                    : `1px solid ${optColors[i]}55`,
                  opacity: phase === 'revealed' && i !== q.correct_index ? 0.4 : 1,
                  transition: 'all 0.3s'
                }}>
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: '0.2rem' }}>{optLabels[i]}</span>
                  <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>{q[opt]}</span>
                </div>
              ))}
            </div>

            {phase === 'revealed' && q.explanation && (
              <div style={{ background: 'rgba(0,229,160,0.08)', border: '1px solid rgba(0,229,160,0.25)', borderRadius: 'var(--radius)', padding: '0.9rem 1.1rem', fontSize: '0.88rem', lineHeight: 1.6, color: '#a0f0d8', marginBottom: '1rem' }}>
                💡 {q.explanation}
              </div>
            )}

            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              {phase === 'question' && <button className="btn" onClick={revealAnswer}>Reveal answer</button>}
              {phase === 'revealed' && currentQ < questions.length - 1 && <button className="btn btn-primary" onClick={nextQuestion}>Next question →</button>}
              {phase === 'revealed' && currentQ === questions.length - 1 && <button className="btn btn-primary" onClick={endGame}>View final results</button>}
            </div>
          </div>

          {/* RIGHT COLUMN — leaderboard */}
          <div style={{ width: 220, flexShrink: 0 }}>
            <div className="card">
              <p style={{ fontSize: '0.75rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.75rem' }}>Live standings</p>
              {phase === 'question' && (
                <div style={{ marginBottom: '0.75rem', padding: '0.6rem 0.75rem', background: 'var(--surface2)', borderRadius: 8, fontSize: '0.83rem' }}>
                  <span style={{ color: 'var(--muted)' }}>Answered </span>
                  <strong>{answeredCount}</strong><span style={{ color: 'var(--muted)' }}> / {players.length}</span>
                </div>
              )}
              {phase === 'revealed' && (
                <div style={{ marginBottom: '0.75rem', padding: '0.6rem 0.75rem', background: 'rgba(0,229,160,0.08)', border: '1px solid rgba(0,229,160,0.2)', borderRadius: 8, fontSize: '0.83rem' }}>
                  <span style={{ color: 'var(--green)' }}>✓ {correctCount} correct</span>
                  <span style={{ color: 'var(--muted)' }}> / {players.length}</span>
                </div>
              )}
              {players.slice(0, 8).map((p, i) => (
                <div key={p.id} className="lb-row">
                  <div className={`lb-rank ${i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : ''}`}>{i + 1}</div>
                  <div style={{ fontSize: '0.9rem' }}>{p.avatar}</div>
                  <div className="lb-name" style={{ fontSize: '0.85rem' }}>{p.nickname}</div>
                  <div className="lb-score" style={{ fontSize: '0.85rem' }}>{p.score.toLocaleString()}</div>
                </div>
              ))}
              {players.length === 0 && <p style={{ color: 'var(--muted)', fontSize: '0.82rem' }}>No scores yet</p>}
            </div>
          </div>
        </div>
      </div>
    </div>
  )

  // ── FINAL ──
  if (phase === 'final') {
    const top3 = players.slice(0, 3)
    const podiumOrder = [players[1], players[0], players[2]].filter(Boolean)
    const podiumClasses = ['p2', 'p1', 'p3']
    const podiumEmojis = ['🥈', '🥇', '🥉']
    return (
      <div className="screen">
        <div className="container">
          <h1 className="gradient-text" style={{ fontSize: '2.5rem', fontWeight: 800, textAlign: 'center', marginBottom: '0.25rem' }}>Game over!</h1>
          <p style={{ color: 'var(--muted)', textAlign: 'center', marginBottom: '2rem', fontSize: '0.9rem' }}>{selectedSet?.name}</p>
          <div className="podium">
            {podiumOrder.map((p, i) => p && (
              <div key={p.id} className="podium-slot">
                <div className="podium-name">{p.avatar} {p.nickname}</div>
                <div className="podium-score">{p.score.toLocaleString()} pts</div>
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
                <div className="lb-score">{p.score.toLocaleString()}</div>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button className="btn btn-success" onClick={downloadCSV}>⬇ Download results CSV</button>
            <button className="btn btn-primary" onClick={() => { setPhase('pick'); setSession(null); setSelectedSet(null) }}>Play again</button>
            <button className="btn" onClick={() => go('landing')}>Home</button>
          </div>
        </div>
      </div>
    )
  }

  return null
}
