import React, { useEffect, useState, useRef } from 'react'
import { supabase } from '../supabase'

const TIMER_SECONDS = 20

export default function StudentGame({ go, gameSession, player, setPlayer }) {
  const [session, setSession] = useState(gameSession)
  const [questions, setQuestions] = useState([])
  const [currentQ, setCurrentQ] = useState(0)
  const [phase, setPhase] = useState('question')
  const [myAnswer, setMyAnswer] = useState(null)
  const [pointsEarned, setPointsEarned] = useState(0)
  const [score, setScore] = useState(player?.score || 0)
  const [rank, setRank] = useState(null)
  const [timer, setTimer] = useState(TIMER_SECONDS)
  const [answered, setAnswered] = useState(false)
  const timerRef = useRef(null)
  const lastQRef = useRef(-1)

  useEffect(() => {
    fetchQuestions()
    const sub = supabase.channel('student-game-' + gameSession.id)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'game_sessions', filter: `id=eq.${gameSession.id}` }, (payload) => {
        handleSessionUpdate(payload.new)
      })
      .subscribe()
    return () => { supabase.removeChannel(sub); clearInterval(timerRef.current) }
  }, [])

  async function fetchQuestions() {
    const { data } = await supabase.from('questions').select('*').eq('set_id', gameSession.set_id).order('position')
    setQuestions(data || [])
  }

  function handleSessionUpdate(newSession) {
    setSession(newSession)
    if (newSession.phase === 'ended') { go('student-final'); return }
    if (newSession.phase === 'question' && newSession.current_question !== lastQRef.current) {
      lastQRef.current = newSession.current_question
      setCurrentQ(newSession.current_question)
      setMyAnswer(null)
      setAnswered(false)
      setPointsEarned(0)
      setPhase('question')
      startTimer()
    }
    if (newSession.phase === 'revealed') {
      setPhase('revealed')
      clearInterval(timerRef.current)
    }
  }

  function startTimer() {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    let t = TIMER_SECONDS
    setTimer(t)
    timerRef.current = setInterval(() => {
      t--
      setTimer(t)
      if (t <= 0) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }, 1000)
  }

  async function submitAnswer(idx) {
    if (answered) return
    setAnswered(true)
    setMyAnswer(idx)
    clearInterval(timerRef.current)

    const q = questions[currentQ]
    if (!q) return
    const isCorrect = idx === q.correct_index
    const pts = isCorrect ? Math.max(500, Math.round(1000 * (timer / TIMER_SECONDS))) : 0
    setPointsEarned(pts)

    const newScore = score + pts
    setScore(newScore)

    await supabase.from('answers').insert([{
      session_id: gameSession.id,
      player_id: player.id,
      question_id: q.id,
      question_index: currentQ,
      answer_given: idx,
      is_correct: isCorrect,
      points_earned: pts
    }])

    await supabase.from('players').update({ score: newScore }).eq('id', player.id)

    // Fetch rank
    const { data: allPlayers } = await supabase.from('players').select('score').eq('session_id', gameSession.id).order('score', { ascending: false })
    const myRank = (allPlayers || []).findIndex(p => p.score <= newScore) + 1 || allPlayers?.length || 1
    setRank(myRank)
  }

  const q = questions[currentQ]
  const optLabels = ['A', 'B', 'C', 'D']
  const optKeys = ['option_a', 'option_b', 'option_c', 'option_d']
  const timerPct = (timer / TIMER_SECONDS) * 100
  const timerColor = timer > 10 ? 'var(--green)' : timer > 5 ? 'var(--yellow)' : 'var(--red)'
  const circumference = 2 * Math.PI * 22

  if (!q) return (
    <div className="screen centered">
      <div className="dot-row"><div className="dot" /><div className="dot" /><div className="dot" /></div>
    </div>
  )

  return (
    <div className="screen" style={{ maxWidth: 500, margin: '0 auto' }}>
      <div className="progress-bar"><div className="progress-fill" style={{ width: `${(currentQ / questions.length) * 100}%` }} /></div>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
        <div style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>Q{currentQ + 1} / {questions.length}</div>
        <div className="card-sm" style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: '1rem', padding: '0.35rem 0.85rem' }}>{score.toLocaleString()} pts</div>
        <div style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>{rank ? `#${rank}` : '—'}</div>
      </div>

      {/* Timer + Question */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', marginBottom: '1.25rem' }}>
        <div className="timer-wrap" style={{ flexShrink: 0 }}>
          <svg width="56" height="56" viewBox="0 0 56 56">
            <circle cx="28" cy="28" r="22" fill="none" stroke="var(--surface2)" strokeWidth="4" />
            <circle cx="28" cy="28" r="22" fill="none" stroke={timerColor} strokeWidth="4"
              strokeDasharray={circumference} strokeDashoffset={circumference * (1 - timerPct / 100)}
              strokeLinecap="round" style={{ transform: 'rotate(-90deg)', transformOrigin: 'center', transition: 'stroke-dashoffset 1s linear' }} />
          </svg>
          <div className="timer-text" style={{ color: timerColor }}>{timer}</div>
        </div>
        <div className="card" style={{ flex: 1, padding: '1rem 1.1rem' }}>
          <p style={{ fontFamily: 'Syne', fontWeight: 600, fontSize: '1.05rem', lineHeight: 1.45 }}>{q.question_text}</p>
        </div>
      </div>

      {/* Options */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginBottom: '1rem' }}>
        {optKeys.map((key, i) => {
          let extra = ''
          if (answered) {
            if (i === q.correct_index && phase === 'revealed') extra = 'correct-reveal'
            else if (i === myAnswer && i !== q.correct_index && phase === 'revealed') extra = 'wrong-reveal'
            else if (i === myAnswer) extra = 'selected'
          }
          return (
            <button key={key} className={`opt-btn opt-${i} ${extra}`}
              disabled={answered}
              onClick={() => submitAnswer(i)}>
              <span className="opt-label-pill">{optLabels[i]}</span>
              {q[key]}
            </button>
          )
        })}
      </div>

      {/* Feedback */}
      {answered && !pointsEarned && myAnswer !== null && phase !== 'revealed' && (
        <div style={{ textAlign: 'center', color: 'var(--muted)', fontSize: '0.9rem', marginBottom: '0.75rem' }}>
          ⏳ Waiting for teacher to reveal…
        </div>
      )}

      {answered && phase === 'revealed' && (
        <div style={{
          borderRadius: 'var(--radius)', padding: '1rem 1.25rem', textAlign: 'center',
          background: myAnswer === q.correct_index ? 'rgba(0,229,160,0.12)' : 'rgba(255,71,87,0.12)',
          border: `1px solid ${myAnswer === q.correct_index ? 'rgba(0,229,160,0.35)' : 'rgba(255,71,87,0.3)'}`,
          marginBottom: '0.75rem'
        }}>
          <p style={{ fontWeight: 700, fontSize: '1.1rem', color: myAnswer === q.correct_index ? 'var(--green)' : 'var(--red)', marginBottom: myAnswer === q.correct_index ? '0.25rem' : 0 }}>
            {myAnswer === q.correct_index ? '✓ Correct!' : '✗ Not quite'}
          </p>
          {myAnswer === q.correct_index && pointsEarned > 0 && (
            <p className="score-float" style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: '1.5rem', color: 'var(--green)' }}>+{pointsEarned} pts</p>
          )}
        </div>
      )}

      {phase === 'revealed' && q.explanation && (
        <div style={{ background: 'rgba(0,229,160,0.08)', border: '1px solid rgba(0,229,160,0.25)', borderRadius: 'var(--radius)', padding: '0.9rem 1.1rem', fontSize: '0.88rem', lineHeight: 1.6, color: '#a0f0d8', marginBottom: '0.75rem' }}>
          💡 {q.explanation}
        </div>
      )}

      {!answered && phase === 'revealed' && (
        <div style={{ borderRadius: 'var(--radius)', padding: '1rem', textAlign: 'center', background: 'rgba(136,136,170,0.1)', border: '1px solid var(--border)', color: 'var(--muted)' }}>
          ⏰ Time's up — didn't answer in time
        </div>
      )}
    </div>
  )
}
