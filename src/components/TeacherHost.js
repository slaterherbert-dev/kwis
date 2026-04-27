import React, { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabase'

const TIMER_SECONDS = 20
const GQ_DURATION_OPTIONS = [
  { label: '3 min', seconds: 180 },
  { label: '5 min', seconds: 300 },
  { label: '7 min', seconds: 420 },
  { label: '10 min', seconds: 600 },
]

function generatePin() {
  return String(Math.floor(100000 + Math.random() * 900000))
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export default function TeacherHost({ go, gameSession, setGameSession }) {
  const [phase, setPhase] = useState('pick') // pick | lobby | countdown | question | revealed | gq-live | final
  const [sets, setSets] = useState([])
  const [selectedSet, setSelectedSet] = useState(null)
  const [gameMode, setGameMode] = useState('classic') // classic | gold_quest
  const [gqDuration, setGqDuration] = useState(300) // seconds, default 5 min
  const [questions, setQuestions] = useState([])
  const [currentQ, setCurrentQ] = useState(0)
  const [players, setPlayers] = useState([])
  const [answers, setAnswers] = useState([])
  const [timer, setTimer] = useState(TIMER_SECONDS)
  const [countdown, setCountdown] = useState(3)
  const [gqTimeLeft, setGqTimeLeft] = useState(null)
  const [session, setSession] = useState(null)
  const timerRef = useRef(null)
  const countdownRef = useRef(null)
  const sessionRef = useRef(null)
  const pollRef = useRef(null)
  const gqTimerRef = useRef(null)

  // Keep sessionRef in sync so the timer callback never sees a stale session
  useEffect(() => { sessionRef.current = session }, [session])

  useEffect(() => {
    fetchSets()
    return () => {
      clearInterval(timerRef.current)
      clearInterval(countdownRef.current)
      clearInterval(pollRef.current)
      clearInterval(gqTimerRef.current)
    }
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
      game_mode: gameMode,
      gold_quest_duration_seconds: gameMode === 'gold_quest' ? gqDuration : null
    }]).select().single()
    setSession(data)
    setGameSession(data)
    await fetchPlayers(data.id)
    setPhase('lobby')
  }

  async function startGame() {
    if (gameMode === 'gold_quest') {
      const endsAt = new Date(Date.now() + gqDuration * 1000).toISOString()
      await supabase.from('game_sessions').update({ phase: 'question', ends_at: endsAt }).eq('id', session.id)
      setPhase('gq-live')
      setGqTimeLeft(gqDuration)

      // Countdown timer
      let t = gqDuration
      gqTimerRef.current = setInterval(() => {
        t--
        setGqTimeLeft(t)
        if (t <= 0) {
          clearInterval(gqTimerRef.current)
          gqTimerRef.current = null
          endGame()
        }
      }, 1000)

      // Poll for player progress
      pollRef.current = setInterval(() => {
        const sid = sessionRef.current?.id
        if (sid) { fetchPlayers(sid); fetchAnswers(sid) }
      }, 3000)
    } else {
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
    clearInterval(pollRef.current)
    clearInterval(gqTimerRef.current)
    gqTimerRef.current = null

    const endPhase = gameMode === 'gold_quest' ? 'gold_quest_ended' : 'ended'
    await supabase.from('game_sessions').update({ phase: endPhase, ended: true }).eq('id', session.id)
    await fetchPlayers(session.id)
    await fetchAnswers(session.id)
    setPhase('final')
  }

  async function kickPlayer(playerId) {
    await supabase.from('players').update({ kicked: true }).eq('id', playerId)
    setPlayers(prev => prev.filter(p => p.id !== playerId))
  }

  // ── CSV download (enhanced with per-student breakdown + top missed) ──
  function downloadCSV() {
    if (!players.length) return
    const isGQ = gameMode === 'gold_quest'
    const opts = ['A', 'B', 'C', 'D']

    // Per-question miss stats
    const missData = questions.map((q, qi) => {
      const qAnswers = answers.filter(a => a.question_index === qi)
      const correct = qAnswers.filter(a => a.is_correct).length
      const total = qAnswers.length || 0
      const wrong = total - correct
      const missRate = total > 0 ? Math.round(((total - correct) / total) * 100) : 0
      return { qi, question: q.question_text, correct, wrong, total, missRate }
    })

    // Top 3 missed
    const top3Missed = [...missData].sort((a, b) => b.missRate - a.missRate).slice(0, 3)

    const rows = []

    // Header
    rows.push([isGQ ? '🪙 GOLD QUEST RESULTS' : '📊 KWIS RESULTS', `Set: ${selectedSet?.name}`, `PIN: ${session?.pin}`])
    rows.push([])

    // Top 3 Missed Questions section
    rows.push(['TOP 3 MISSED QUESTIONS'])
    rows.push(['Rank', 'Question', 'Miss Rate', '# Wrong', '# Correct', '# Attempted'])
    top3Missed.forEach((m, i) => {
      rows.push([`#${i + 1}`, m.question, `${m.missRate}%`, m.wrong, m.correct, m.total])
    })
    rows.push([])

    // Per-student breakdown header
    rows.push(['STUDENT RESULTS'])
    rows.push(['Nickname', isGQ ? 'Gold' : 'Score', 'Correct', 'Wrong', 'Accuracy',
      ...questions.map((q, i) => `Q${i + 1}: ${q.question_text.slice(0, 40)}`)])

    players.forEach(p => {
      const pAnswers = answers.filter(a => a.player_id === p.id)
      const pCorrect = pAnswers.filter(a => a.is_correct).length
      const pWrong = pAnswers.length - pCorrect
      const pAcc = pAnswers.length > 0 ? `${Math.round((pCorrect / pAnswers.length) * 100)}%` : '—'
      const row = [p.nickname, p.score, pCorrect, pWrong, pAcc]
      questions.forEach((q, qi) => {
        const ans = pAnswers.find(a => a.question_index === qi)
        if (!ans) { row.push('No answer'); return }
        row.push(`${opts[ans.answer_given] || '?'} (${ans.is_correct ? '✓' : '✗'})`)
      })
      rows.push(row)
    })

    rows.push([])

    // Summary row
    rows.push(['QUESTION SUMMARY'])
    rows.push(['Question', 'Correct Answer', '# Correct', '# Wrong', 'Miss Rate'])
    questions.forEach((q, qi) => {
      const d = missData[qi]
      rows.push([q.question_text, opts[q.correct_index], d.correct, d.wrong, `${d.missRate}%`])
    })

    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `kwis-${isGQ ? 'goldquest' : 'results'}-${session?.pin}.csv`
    a.click()
  }

  // ── Derived (classic mode) ──
  const q = questions[currentQ]
  const answeredCount = answers.filter(a => a.question_index === currentQ).length
  const correctCount = answers.filter(a => a.question_index === currentQ && a.is_correct).length
  const optColors = ['var(--opt-a)', 'var(--opt-b)', 'var(--opt-c)', 'var(--opt-d)']
  const optLabels = ['A', 'B', 'C', 'D']
  const timerPct = (timer / TIMER_SECONDS) * 100
  const timerColor = timer > 10 ? 'var(--green)' : timer > 5 ? 'var(--yellow)' : 'var(--red)'
  const circumference = 2 * Math.PI * 22

  // ── Derived (gold quest) ──
  const totalQuestions = questions.length
  function playerProgress(playerId) { return answers.filter(a => a.player_id === playerId).length }
  function playerCorrect(playerId) { return answers.filter(a => a.player_id === playerId && a.is_correct).length }
  const allFinished = players.length > 0 && players.every(p => playerProgress(p.id) >= totalQuestions)
  const isGQ = gameMode === 'gold_quest'

  // GQ timer display helpers
  const gqTimerPct = gqTimeLeft !== null ? (gqTimeLeft / gqDuration) * 100 : 100
  const gqTimerColor = gqTimeLeft > 60 ? 'var(--green)' : gqTimeLeft > 30 ? 'var(--yellow, #ffaa32)' : 'var(--red)'

  // Top 3 missed (for final screen)
  const top3Missed = questions.length > 0 ? questions.map((q, qi) => {
    const qAnswers = answers.filter(a => a.question_index === qi)
    const correct = qAnswers.filter(a => a.is_correct).length
    const total = qAnswers.length || 0
    const missRate = total > 0 ? Math.round(((total - correct) / total) * 100) : 0
    return { qi, question: q.question_text, missRate, wrong: total - correct, total, correct_answer: ['A','B','C','D'][q.correct_index] }
  }).sort((a, b) => b.missRate - a.missRate).slice(0, 3) : []

  // ── PICK SET ──
  if (phase === 'pick') return (
    <div className="screen">
      <div className="container">
        <button className="back-btn" onClick={() => go('landing')}>← Home</button>
        <h1 style={{ fontSize: '1.6rem', fontWeight: 800, marginBottom: '0.5rem' }}>Host a game</h1>
        <p style={{ color: 'var(--muted)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>Pick a question set and game mode</p>

        {/* Mode picker */}
        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.75rem' }}>
          <div className="card-sm" style={{
            flex: 1, cursor: 'pointer', textAlign: 'center', padding: '1rem 0.75rem',
            border: gameMode === 'classic' ? '2px solid var(--accent)' : '',
            background: gameMode === 'classic' ? 'rgba(108,99,255,0.08)' : '',
            transition: 'all 0.2s'
          }} onClick={() => setGameMode('classic')}>
            <div style={{ fontSize: '1.5rem', marginBottom: '0.35rem' }}>📺</div>
            <p style={{ fontWeight: 700, fontSize: '0.95rem', marginBottom: '0.2rem' }}>Classic</p>
            <p style={{ fontSize: '0.75rem', color: 'var(--muted)', lineHeight: 1.4 }}>Teacher-paced with timer and live reveal</p>
          </div>
          <div className="card-sm" style={{
            flex: 1, cursor: 'pointer', textAlign: 'center', padding: '1rem 0.75rem',
            border: gameMode === 'gold_quest' ? '2px solid var(--yellow, #ffaa32)' : '',
            background: gameMode === 'gold_quest' ? 'rgba(255,170,50,0.08)' : '',
            transition: 'all 0.2s'
          }} onClick={() => setGameMode('gold_quest')}>
            <div style={{ fontSize: '1.5rem', marginBottom: '0.35rem' }}>🪙</div>
            <p style={{ fontWeight: 700, fontSize: '0.95rem', marginBottom: '0.2rem' }}>Gold Quest</p>
            <p style={{ fontSize: '0.75rem', color: 'var(--muted)', lineHeight: 1.4 }}>Self-paced with treasure chests and steals</p>
          </div>
        </div>

        {/* Gold Quest duration picker */}
        {gameMode === 'gold_quest' && (
          <div style={{ marginBottom: '1.75rem' }}>
            <p style={{ fontSize: '0.82rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.6rem' }}>
              🕐 Game duration
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {GQ_DURATION_OPTIONS.map(opt => (
                <button key={opt.seconds}
                  onClick={() => setGqDuration(opt.seconds)}
                  style={{
                    padding: '0.5rem 1.1rem',
                    borderRadius: 'var(--radius)',
                    border: gqDuration === opt.seconds ? '2px solid var(--yellow, #ffaa32)' : '1px solid var(--border)',
                    background: gqDuration === opt.seconds ? 'rgba(255,170,50,0.15)' : 'var(--surface)',
                    color: gqDuration === opt.seconds ? 'var(--yellow, #ffaa32)' : 'var(--text)',
                    fontWeight: gqDuration === opt.seconds ? 700 : 500,
                    fontSize: '0.9rem',
                    cursor: 'pointer',
                    transition: 'all 0.15s'
                  }}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Set list */}
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

  // ── LOBBY (shared for both modes) ──
  if (phase === 'lobby') return (
    <div className="screen">
      <div className="container">
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          {isGQ && <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>🪙</div>}
          <p style={{ fontSize: '0.8rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.5rem' }}>
            {isGQ ? 'Gold Quest — ' : ''}Game PIN
          </p>
          <div className="gradient-text" style={{ fontSize: '4.5rem', fontWeight: 800, fontFamily: 'Syne', letterSpacing: '0.2em' }}>{session?.pin}</div>
          <div style={{
            display: 'inline-block', marginTop: '1rem',
            padding: '0.85rem 1.75rem',
            background: 'rgba(108,99,255,0.12)',
            border: '2px solid rgba(108,99,255,0.35)',
            borderRadius: 'var(--radius)',
          }}>
            <p style={{ fontSize: '0.68rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '0.25rem' }}>Students go to</p>
            <p style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 'clamp(1.4rem, 3vw, 2.2rem)', color: 'var(--accent)', letterSpacing: '-0.5px', lineHeight: 1.1 }}>
              kwis-nine.vercel.app
            </p>
            <p style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: '0.35rem' }}>→ "Join a game" → enter the PIN above</p>
          </div>
          {isGQ && (
            <p style={{ color: 'var(--yellow, #ffaa32)', fontSize: '0.82rem', marginTop: '0.35rem' }}>
              ⏱ {GQ_DURATION_OPTIONS.find(o => o.seconds === gqDuration)?.label || formatTime(gqDuration)} game
            </p>
          )}
        </div>
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <p style={{ fontSize: '0.8rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.75rem' }}>Players joined — {players.length}</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', minHeight: 40 }}>
            {players.map(p => (
              <div key={p.id} className="chip pop-in" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', paddingRight: '0.4rem' }}>
                <span>{p.avatar} {p.nickname}</span>
                <button onClick={() => kickPlayer(p.id)} title="Remove player" style={{
                  background: 'rgba(255,71,87,0.15)', border: '1px solid rgba(255,71,87,0.3)',
                  borderRadius: 4, color: 'var(--red)', cursor: 'pointer', fontSize: '0.7rem',
                  padding: '0.1rem 0.35rem', lineHeight: 1, fontWeight: 700
                }}>✕</button>
              </div>
            ))}
            {players.length === 0 && <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>Waiting for students…</p>}
          </div>
        </div>
        <button className="btn btn-primary btn-full btn-lg" disabled={players.length < 1} onClick={startGame}>
          {isGQ ? 'Start Gold Quest' : 'Start game'} — {players.length} player{players.length !== 1 ? 's' : ''} ready
        </button>
      </div>
    </div>
  )

  // ── COUNTDOWN (classic only) ──
  if (phase === 'countdown') return (
    <div className="countdown-overlay">
      <p style={{ color: 'var(--muted)', marginBottom: '1rem' }}>Get ready!</p>
      <div className="countdown-num" key={countdown}>{countdown}</div>
    </div>
  )

  // ══════════════════════════════════════════════
  // ── GOLD QUEST LIVE DASHBOARD ──
  // ══════════════════════════════════════════════
  if (phase === 'gq-live') return (
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
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: '0.9rem', color: 'var(--yellow, #ffaa32)' }}>🪙 {p.score}</span>
                          <button onClick={() => kickPlayer(p.id)} title="Remove player" style={{
                            background: 'rgba(255,71,87,0.15)', border: '1px solid rgba(255,71,87,0.3)',
                            borderRadius: 4, color: 'var(--red)', cursor: 'pointer', fontSize: '0.7rem',
                            padding: '0.15rem 0.4rem', lineHeight: 1, fontWeight: 700
                          }}>✕</button>
                        </div>
                      </div>
                      <div style={{ height: 4, borderRadius: 2, background: 'var(--surface2)', overflow: 'hidden' }}>
                        <div style={{
                          width: `${Math.min(progPct, 100)}%`, height: '100%', borderRadius: 2,
                          background: 'var(--accent)',
                          transition: 'width 0.5s ease'
                        }} />
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.15rem' }}>
                        <span style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>{prog} answered</span>
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

            {/* Timer card */}
            <div className="card" style={{ marginBottom: '1rem', textAlign: 'center' }}>
              <p style={{ fontSize: '0.75rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.75rem' }}>Time remaining</p>
              {/* Circular timer */}
              <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: '0.5rem' }}>
                <svg width="80" height="80" viewBox="0 0 80 80">
                  <circle cx="40" cy="40" r="32" fill="none" stroke="var(--surface2)" strokeWidth="5" />
                  <circle cx="40" cy="40" r="32" fill="none" stroke={gqTimerColor} strokeWidth="5"
                    strokeDasharray={2 * Math.PI * 32}
                    strokeDashoffset={(2 * Math.PI * 32) * (1 - gqTimerPct / 100)}
                    strokeLinecap="round"
                    style={{ transform: 'rotate(-90deg)', transformOrigin: 'center', transition: 'stroke-dashoffset 1s linear, stroke 0.3s' }} />
                </svg>
                <div style={{ position: 'absolute', fontFamily: 'Syne', fontWeight: 800, fontSize: '1.1rem', color: gqTimerColor }}>
                  {gqTimeLeft !== null ? formatTime(gqTimeLeft) : '—'}
                </div>
              </div>
              {gqTimeLeft !== null && gqTimeLeft <= 60 && (
                <p style={{ fontSize: '0.75rem', color: 'var(--red)', fontWeight: 600, animation: 'pulse 1s infinite' }}>⚠ Almost out of time!</p>
              )}
            </div>

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

  // ── CLASSIC QUESTION ──
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
                  <div className="lb-name" style={{ fontSize: '0.85rem', flex: 1 }}>{p.nickname}</div>
                  <div className="lb-score" style={{ fontSize: '0.85rem' }}>{p.score.toLocaleString()}</div>
                  <button onClick={() => kickPlayer(p.id)} title="Remove player" style={{
                    background: 'rgba(255,71,87,0.15)', border: '1px solid rgba(255,71,87,0.3)',
                    borderRadius: 4, color: 'var(--red)', cursor: 'pointer', fontSize: '0.65rem',
                    padding: '0.15rem 0.35rem', lineHeight: 1, fontWeight: 700, marginLeft: '0.25rem'
                  }}>✕</button>
                </div>
              ))}
              {players.length === 0 && <p style={{ color: 'var(--muted)', fontSize: '0.82rem' }}>No scores yet</p>}
            </div>
          </div>
        </div>
      </div>
    </div>
  )

  // ── FINAL (shared for both modes) ──
  if (phase === 'final') {
    const podiumOrder = [players[1], players[0], players[2]].filter(Boolean)
    const podiumClasses = ['p2', 'p1', 'p3']
    const podiumEmojis = ['🥈', '🥇', '🥉']
    return (
      <div className="screen">
        <div className="container">
          {isGQ && <div style={{ fontSize: '1.5rem', textAlign: 'center', marginBottom: '0.25rem' }}>🪙</div>}
          <h1 className="gradient-text" style={{ fontSize: '2.5rem', fontWeight: 800, textAlign: 'center', marginBottom: '0.25rem' }}>
            {isGQ ? 'Gold Quest — Results' : 'Game over!'}
          </h1>
          <p style={{ color: 'var(--muted)', textAlign: 'center', marginBottom: '2rem', fontSize: '0.9rem' }}>{selectedSet?.name}</p>

          <div className="podium">
            {podiumOrder.map((p, i) => p && (
              <div key={p.id} className="podium-slot">
                <div className="podium-name">{p.avatar} {p.nickname}</div>
                <div className="podium-score">{isGQ ? `🪙 ${p.score.toLocaleString()}` : `${p.score.toLocaleString()} pts`}</div>
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
                <div className="lb-score">
                  {isGQ && <span style={{ color: 'var(--yellow, #ffaa32)' }}>🪙 </span>}
                  {p.score.toLocaleString()}{!isGQ && ' pts'}
                </div>
              </div>
            ))}
          </div>

          {/* Top 3 Missed Questions */}
          {isGQ && top3Missed.length > 0 && (
            <div style={{
              background: 'rgba(255,71,87,0.07)', border: '1px solid rgba(255,71,87,0.2)',
              borderRadius: 'var(--radius)', padding: '1rem 1.25rem', marginBottom: '1.5rem'
            }}>
              <p style={{ fontSize: '0.78rem', color: 'var(--red)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, marginBottom: '0.75rem' }}>
                🎯 Top 3 Most Missed Questions
              </p>
              {top3Missed.map((m, i) => (
                <div key={m.qi} style={{
                  display: 'flex', alignItems: 'flex-start', gap: '0.75rem',
                  paddingBottom: i < top3Missed.length - 1 ? '0.65rem' : 0,
                  marginBottom: i < top3Missed.length - 1 ? '0.65rem' : 0,
                  borderBottom: i < top3Missed.length - 1 ? '1px solid rgba(255,71,87,0.12)' : 'none'
                }}>
                  <div style={{
                    minWidth: 28, height: 28, borderRadius: '50%',
                    background: i === 0 ? 'rgba(255,71,87,0.2)' : 'rgba(255,71,87,0.1)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '0.75rem', fontWeight: 800, color: 'var(--red)', flexShrink: 0
                  }}>{i + 1}</div>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: '0.85rem', fontWeight: 600, lineHeight: 1.4, marginBottom: '0.2rem' }}>{m.question}</p>
                    <p style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
                      {m.missRate}% missed · {m.wrong}/{m.total} wrong · Correct answer: <strong style={{ color: 'var(--text)' }}>{m.correct_answer}</strong>
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button className="btn btn-success" onClick={downloadCSV}>⬇ Download results CSV</button>
            <button className="btn btn-primary" onClick={() => { setPhase('pick'); setSession(null); setSelectedSet(null); setGameMode('classic'); setPlayers([]); setAnswers([]); setGqTimeLeft(null) }}>Play again</button>
            <button className="btn" onClick={() => go('landing')}>Home</button>
          </div>
        </div>
      </div>
    )
  }

  return null
}
