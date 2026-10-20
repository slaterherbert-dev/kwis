import React, { useEffect, useRef, useState } from 'react'
import { supabase } from '../../supabase'
import QuestionImage from '../QuestionImage'
import { secondsFor, preloadImage } from '../../lib/questionImages'
import { seededShuffleIndices } from '../../lib/shuffle'
import {
  COURTS, QUESTION_SECONDS, THRONE_STREAK, CLIMB_TARGET, COMEBACK_BONUS,
  ccStateOf, previousCourt, speedPoints,
} from '../../lib/comebackCourt'
import { CourtIcon, ClimbDots, MiniStairs } from './CourtArt'
import './ComebackCourt.css'

// ═══════════════════════════════════════════════════════════════
// COMEBACK COURT — STUDENT CHROMEBOOK SCREEN
// Students only submit answers. The teacher's screen decides who moves
// between courts and saves it; this screen shows the result.
// ═══════════════════════════════════════════════════════════════

const OPT_LABELS = ['A', 'B', 'C', 'D']
const OPT_KEYS = ['option_a', 'option_b', 'option_c', 'option_d']

function statusLine(s) {
  if (s.court === 'throne') return `Points count 1.5× · streak ${s.streak}`
  if (s.court === 'comeback') return `${s.climb} of ${CLIMB_TARGET} right in a row to climb out`
  const toGo = THRONE_STREAK - s.streak
  return s.streak > 0 ? `Streak ${s.streak} · ${toGo} more for the Throne` : `${THRONE_STREAK} in a row takes the Throne`
}

function resultText(s) {
  switch (s.move) {
    case 'crowned':     return { title: 'You took the Throne!', note: 'Your points count 1.5× up here. Keep the streak alive.' }
    case 'held-throne': return { title: 'Still on the Throne', note: `Streak: ${s.streak}. Nobody’s knocking you off yet.` }
    case 'dethroned':   return { title: 'Knocked off the Throne', note: 'You’re back in the Winners’ Court and you keep every point.' }
    case 'correct':     return { title: 'Correct!', note: statusLine(s) }
    case 'dropped':     return { title: 'Down to the Comeback Court', note: `Get ${CLIMB_TARGET} right in a row to climb back up, plus a ${COMEBACK_BONUS}-point bonus.` }
    case 'climbing':    return { title: `${s.climb} of ${CLIMB_TARGET}!`, note: 'One more right answer and you’re back up.' }
    case 'climbed':     return { title: 'You climbed out!', note: 'Back in the Winners’ Court. That’s a comeback.' }
    case 'slipped':     return { title: 'Not this time', note: `Your climb restarts. ${CLIMB_TARGET} right in a row gets you out.` }
    default:            return { title: 'Not this time', note: `${CLIMB_TARGET} right in a row gets you back to the Winners’ Court.` }
  }
}

export default function ComebackCourtStudent({ go, gameSession, player }) {
  const [session, setSession] = useState(gameSession)
  const [questions, setQuestions] = useState([])
  const [me, setMe] = useState(player)
  const [currentQ, setCurrentQ] = useState(gameSession.current_question ?? 0)
  const [phase, setPhase] = useState('question') // question | revealed
  const [myAnswer, setMyAnswer] = useState(null) // display position (after shuffle)
  const [answered, setAnswered] = useState(false)
  const [timer, setTimer] = useState(QUESTION_SECONDS)
  const [timerTotal, setTimerTotal] = useState(QUESTION_SECONDS)
  const [kicked, setKicked] = useState(false)

  const timerRef = useRef(null)
  const lastQRef = useRef(-1)
  const questionsRef = useRef([])

  useEffect(() => {
    (async () => {
      const { data: qs } = await supabase.from('questions').select('*').eq('set_id', gameSession.set_id).order('position').order('id')
      questionsRef.current = qs || []
      setQuestions(qs || [])
      const { data: mine } = await supabase.from('players').select('*').eq('id', player.id).single()
      if (mine) { setMe(mine); if (mine.kicked) setKicked(true) }
      const { data: fresh } = await supabase.from('game_sessions').select('*').eq('id', gameSession.id).single()
      if (fresh) applySession(fresh, true)
    })()

    const sub = supabase.channel('cc-student-' + gameSession.id + '-' + player.id)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'game_sessions', filter: `id=eq.${gameSession.id}` },
        payload => applySession(payload.new, false))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'players', filter: `id=eq.${player.id}` },
        payload => { setMe(payload.new); if (payload.new?.kicked) setKicked(true) })
      .subscribe()

    return () => { supabase.removeChannel(sub); clearInterval(timerRef.current) }
  }, [])

  function applySession(s, isFirstLoad) {
    setSession(s)
    if (s.phase === 'ended' || s.phase === 'final') { clearInterval(timerRef.current); go('student-final'); return }
    const idx = s.current_question ?? 0

    if (s.phase === 'question' && idx !== lastQRef.current) {
      lastQRef.current = idx
      setCurrentQ(idx)
      setMyAnswer(null)
      setAnswered(false)
      setPhase('question')
      startTimer(secondsFor(questionsRef.current[idx], QUESTION_SECONDS))
      if (isFirstLoad) restoreAnswer(idx)
    } else if (s.phase === 'revealed') {
      clearInterval(timerRef.current)
      if (idx !== lastQRef.current) {
        lastQRef.current = idx
        setCurrentQ(idx)
        restoreAnswer(idx)
      }
      setPhase('revealed')
    }
  }

  // A student who rejoins mid-question sees the answer they already gave
  async function restoreAnswer(idx) {
    const { data } = await supabase.from('answers').select('answer_given')
      .eq('session_id', gameSession.id).eq('player_id', player.id).eq('question_index', idx).maybeSingle()
    if (data) {
      const q = questionsRef.current[idx]
      if (q) setMyAnswer(seededShuffleIndices(4, `${gameSession.id}-${q.id}`).indexOf(data.answer_given))
      setAnswered(true)
    }
  }

  function startTimer(seconds) {
    clearInterval(timerRef.current)
    let t = seconds
    setTimerTotal(seconds)
    setTimer(t)
    timerRef.current = setInterval(() => {
      t--
      setTimer(Math.max(0, t))
      if (t <= 0) { clearInterval(timerRef.current); timerRef.current = null }
    }, 1000)
  }

  // Load the next question's picture in the background
  useEffect(() => {
    const cur = questions[currentQ]
    const nxt = questions[currentQ + 1]
    if (cur) preloadImage(cur.image_url)
    if (nxt) preloadImage(nxt.image_url)
  }, [questions, currentQ])

  const q = questions[currentQ]
  const order = q ? seededShuffleIndices(4, `${gameSession.id}-${q.id}`) : [0, 1, 2, 3]
  const correctDisplay = q ? order.indexOf(q.correct_index) : -1
  const canAnswer = phase === 'question' && !answered && timer > 0 && !!q

  async function submit(displayIdx) {
    if (!canAnswer) return
    setAnswered(true)
    setMyAnswer(displayIdx)
    clearInterval(timerRef.current)
    const originalIdx = order[displayIdx]
    const isCorrect = originalIdx === q.correct_index
    await supabase.from('answers').insert([{
      session_id: gameSession.id,
      player_id: player.id,
      question_id: q.id,
      question_index: currentQ,
      answer_given: originalIdx,
      is_correct: isCorrect,
      // Speed points before court rules; the teacher's screen applies the court
      points_earned: isCorrect ? speedPoints(timer, timerTotal) : 0
    }])
  }

  const s = ccStateOf(me)
  const resultReady = phase === 'revealed' && s.round === currentQ
  const courtNow = s.court

  // ── KICKED ──
  if (kicked) return (
    <div className="screen centered" style={{ textAlign: 'center' }}>
      <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🚫</div>
      <h2 style={{ fontFamily: 'Syne', fontSize: '1.6rem', fontWeight: 800, marginBottom: '0.5rem' }}>You were removed</h2>
      <p style={{ color: 'var(--muted)', marginBottom: '2rem', fontSize: '0.9rem' }}>
        Your teacher removed you from the game.<br />Rejoin with a different name if needed.
      </p>
      <button className="btn btn-primary" onClick={() => go('student-join')}>Rejoin →</button>
    </div>
  )

  if (!q) return (
    <div className="screen centered">
      <div className="dot-row"><div className="dot" /><div className="dot" /><div className="dot" /></div>
    </div>
  )

  const banner = (
    <div className={`cc-banner cc-${courtNow}`}>
      <CourtIcon court={courtNow} size={28} />
      <div>
        <div className="cc-banner-name">{COURTS[courtNow].name}</div>
        <div className="cc-banner-status">
          {statusLine(s)}{courtNow === 'comeback' && <> <ClimbDots climb={s.climb} target={CLIMB_TARGET} /></>}
        </div>
      </div>
      <div className="cc-banner-score">
        {s.score.toLocaleString()}
        <div style={{ fontSize: '0.7rem', fontWeight: 600, opacity: 0.7, fontFamily: 'DM Sans, sans-serif' }}>points</div>
      </div>
    </div>
  )

  const options = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginBottom: '1rem' }}>
      {order.map((origIdx, i) => {
        let extra = ''
        if (phase === 'revealed' && i === correctDisplay) extra = 'correct-reveal'
        else if (phase === 'revealed' && i === myAnswer) extra = 'wrong-reveal'
        else if (i === myAnswer) extra = 'selected'
        return (
          <button key={OPT_KEYS[origIdx]} className={`opt-btn opt-${i} ${extra}`}
            disabled={!canAnswer} onClick={() => submit(i)}
            style={{ opacity: phase === 'revealed' && !extra ? 0.5 : 1 }}>
            <span className="opt-label-pill">{OPT_LABELS[i]}</span>
            {q[OPT_KEYS[origIdx]]}
          </button>
        )
      })}
    </div>
  )

  // ── REVEALED ──
  if (phase === 'revealed') {
    const r = resultText(s)
    return (
      <div className="screen cc" style={{ maxWidth: 500, margin: '0 auto' }}>
        {resultReady ? (
          <div className={`cc-result cc-${courtNow}`} role="status">
            <div className="cc-result-title">{r.title}</div>
            {s.gain > 0 && <div className="cc-result-gain">+{s.gain.toLocaleString()} points</div>}
            <MiniStairs from={previousCourt(s)} to={courtNow} avatar={me.avatar} />
            <div className="cc-result-note">{r.note}</div>
          </div>
        ) : (
          <div className="card" style={{ textAlign: 'center', marginBottom: '0.9rem' }}>
            <p style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: '1.2rem' }}>
              {myAnswer === null ? 'Time’s up' : myAnswer === correctDisplay ? 'You got it!' : 'Not quite'}
            </p>
            <p style={{ color: 'var(--muted)', fontSize: '0.88rem', marginTop: '0.3rem' }}>Watch the board. The courts are moving…</p>
          </div>
        )}
        <div className="card" style={{ padding: '0.9rem 1.1rem', marginBottom: '0.9rem' }}>
          <p style={{ fontFamily: 'Syne', fontWeight: 600, fontSize: '1rem', lineHeight: 1.45 }}>{q.question_text}</p>
        </div>
        {options}
        {q.explanation && (
          <p style={{ fontSize: '0.85rem', color: 'var(--muted)', lineHeight: 1.5 }}>💡 {q.explanation}</p>
        )}
      </div>
    )
  }

  // ── QUESTION ──
  const timerColor = timer > 10 ? 'var(--green)' : timer > 5 ? 'var(--yellow)' : 'var(--red)'
  return (
    <div className="screen cc" style={{ maxWidth: 500, margin: '0 auto' }}>
      {banner}
      <div style={{ height: 6, borderRadius: 3, background: 'var(--surface2)', overflow: 'hidden', marginBottom: '0.75rem' }}>
        <div style={{ height: '100%', width: `${(timer / timerTotal) * 100}%`, background: timerColor, transition: 'width 1s linear' }} />
      </div>
      <div className="card" style={{ padding: '1rem 1.1rem', marginBottom: '1rem' }}>
        <p style={{ fontFamily: 'Syne', fontWeight: 600, fontSize: '1.05rem', lineHeight: 1.45 }}>{q.question_text}</p>
      </div>
      <QuestionImage q={q} maxHeight="30vh" compact />
      {options}
      {answered && (
        <p style={{ textAlign: 'center', color: 'var(--muted)', fontSize: '0.9rem' }}>Answer locked in. Waiting for the reveal…</p>
      )}
      {!answered && timer <= 0 && (
        <p style={{ textAlign: 'center', color: 'var(--muted)', fontSize: '0.9rem' }}>Time’s up. Waiting for the reveal…</p>
      )}
    </div>
  )
}
