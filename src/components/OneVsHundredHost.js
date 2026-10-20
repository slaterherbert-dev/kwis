import React, { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabase'
import QuestionImage from './QuestionImage'
import { secondsFor, preloadImage } from '../lib/questionImages'

// ═══════════════════════════════════════════════════════════════
// 1 vs. 100 — HOST / PROJECTOR SCREEN
// One student in the hot seat vs. everyone else ("the Mob").
// The host screen does ALL the scoring and eliminating, so students
// can never un-eliminate themselves or give themselves money.
// ═══════════════════════════════════════════════════════════════

// Same shuffle as classic mode, so the projector and every Chromebook
// show the answers in the same order.
function seededShuffleIndices(n, seedStr) {
  let seed = 0
  for (let i = 0; i < seedStr.length; i++) {
    seed = (seed * 31 + seedStr.charCodeAt(i)) >>> 0
  }
  function rand() {
    seed = (seed * 1103515245 + 12345) >>> 0
    return seed / 4294967296
  }
  const arr = Array.from({ length: n }, (_, i) => i)
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

const MOB_SECONDS = 20          // how long the Mob gets to answer
const TOP_PRIZE = 1000000       // beat the whole Mob = $1,000,000
const OPT_LABELS = ['A', 'B', 'C', 'D']
const OPT_KEYS = ['option_a', 'option_b', 'option_c', 'option_d']
const OPT_COLORS = ['#6c63ff', '#e8436e', '#c9a227', '#2aaba3']
const LIFELINES = [
  { key: 'poll',  icon: '📊', name: 'Poll the Mob',  desc: 'See how the Mob is voting' },
  { key: 'ask',   icon: '🎤', name: 'Ask the Mob',   desc: 'Two Mob members explain their picks' },
  { key: 'trust', icon: '🤝', name: 'Trust the Mob', desc: "Lock in the Mob's most popular answer" },
]

function money(n) { return '$' + Math.round(n || 0).toLocaleString() }

// Pot grows by the same share for every Mob member knocked out,
// so beating the whole Mob is always $1,000,000 no matter the class size.
function potFor(eliminated, mobSize) {
  if (mobSize <= 0) return 0
  if (eliminated >= mobSize) return TOP_PRIZE
  return Math.round((TOP_PRIZE * eliminated / mobSize) / 1000) * 1000
}

const label = { fontSize: '0.72rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.3rem' }

export default function OneVsHundredHost({ session, questions, players, answers, selectedSet, fetchPlayers, kickPlayer, onEndGame }) {
  const [stage, setStage] = useState('pick') // pick | intro | question | revealed | round-over
  const [hotSeatId, setHotSeatId] = useState(null)
  const [roster, setRoster] = useState([])          // Mob member ids for THIS round
  const [pastContestants, setPastContestants] = useState([])
  const [currentQ, setCurrentQ] = useState(-1)
  const [nextQ, setNextQ] = useState(0)             // questions are never repeated across rounds
  const [pot, setPot] = useState(0)
  const [used, setUsed] = useState([])
  const [pollOpen, setPollOpen] = useState(false)
  const [askPicks, setAskPicks] = useState(null)
  const [timer, setTimer] = useState(MOB_SECONDS)
  const [reveal, setReveal] = useState(null)
  const [busy, setBusy] = useState(false)
  const timerRef = useRef(null)

  useEffect(() => () => clearInterval(timerRef.current), [])

  // Load the next question's picture in the background so it's ready in time
  useEffect(() => {
    if (questions[nextQ]) preloadImage(questions[nextQ].image_url)
  }, [questions, nextQ])

  // Anyone who joins (brand new) in the middle of a round sits out until the next round.
  useEffect(() => {
    if (!['intro', 'question', 'revealed'].includes(stage)) return
    const newcomers = players.filter(p => p.id !== hotSeatId && !roster.includes(p.id) && p.eliminated_at === null)
    if (newcomers.length > 0) {
      supabase.from('players').update({ eliminated_at: -1 }).in('id', newcomers.map(p => p.id))
        .then(() => fetchPlayers(session.id))
    }
  }, [players, stage])

  // ── Derived values ──
  const hotSeat = players.find(p => p.id === hotSeatId)
  const rosterPlayers = players.filter(p => roster.includes(p.id))
  const mobSize = rosterPlayers.length
  const mobAlive = rosterPlayers.filter(p => p.eliminated_at === null)
  const q = currentQ >= 0 ? questions[currentQ] : null
  const order = q ? seededShuffleIndices(4, `${session.id}-${q.id}`) : [0, 1, 2, 3]
  const correctDisplay = q ? order.indexOf(q.correct_index) : -1
  const curAnswers = answers.filter(a => a.question_index === currentQ)
  const contestantAnswer = curAnswers.find(a => a.player_id === hotSeatId)
  const aliveIds = new Set(mobAlive.map(p => p.id))
  const mobAnswers = curAnswers.filter(a => aliveIds.has(a.player_id))
  const questionsLeft = questions.length - nextQ
  const nameOf = (id) => players.find(p => p.id === id)?.nickname || 'Someone'

  async function addScore(playerId, amount) {
    if (!amount) return
    const { data } = await supabase.from('players').select('score').eq('id', playerId).single()
    await supabase.from('players').update({ score: (data?.score || 0) + amount }).eq('id', playerId)
  }

  // ── Round setup ──
  async function startRound(playerId) {
    if (busy) return
    setBusy(true)
    // Everyone comes back for the new round
    await supabase.from('players').update({ eliminated_at: null }).eq('session_id', session.id)
    setRoster(players.filter(p => p.id !== playerId).map(p => p.id))
    setHotSeatId(playerId)
    setPastContestants(prev => prev.includes(playerId) ? prev : [...prev, playerId])
    setPot(0); setUsed([]); setReveal(null); setPollOpen(false); setAskPicks(null)
    await supabase.from('game_sessions').update({
      hot_seat_player_id: playerId, pot: 0, lifelines_used: [], ovh_result: null, phase: 'ovh-intro'
    }).eq('id', session.id)
    await fetchPlayers(session.id)
    setStage('intro')
    setBusy(false)
  }

  function pickRandom() {
    const fresh = players.filter(p => !pastContestants.includes(p.id))
    const pool = fresh.length > 0 ? fresh : players
    if (pool.length === 0) return
    startRound(pool[Math.floor(Math.random() * pool.length)].id)
  }

  // ── Questions ──
  async function loadQuestion() {
    if (nextQ >= questions.length || busy) return
    const idx = nextQ
    setCurrentQ(idx); setNextQ(idx + 1)
    setPollOpen(false); setAskPicks(null); setReveal(null)
    await supabase.from('game_sessions').update({ current_question: idx, phase: 'question', revealed: false }).eq('id', session.id)
    setStage('question')
    clearInterval(timerRef.current)
    let t = secondsFor(questions[idx], MOB_SECONDS)
    setTimer(t)
    timerRef.current = setInterval(() => {
      t--
      setTimer(t)
      if (t <= 0) { clearInterval(timerRef.current); timerRef.current = null }
    }, 1000)
  }

  // ── Lifelines ──
  async function activateLifeline(key) {
    if (used.includes(key) || contestantAnswer || stage !== 'question') return
    if ((key === 'ask' || key === 'trust') && mobAnswers.length === 0) {
      alert('Nobody in the Mob has answered yet. Give them a few seconds.')
      return
    }
    if (key === 'poll') setPollOpen(true)
    if (key === 'ask') {
      const shuffled = [...mobAnswers].sort(() => Math.random() - 0.5)
      const first = shuffled[0]
      const second = shuffled.find(a => a.answer_given !== first.answer_given) || shuffled[1]
      setAskPicks([first, second].filter(Boolean))
    }
    if (key === 'trust') {
      const counts = [0, 0, 0, 0]
      mobAnswers.forEach(a => { counts[a.answer_given]++ })
      const top = counts.indexOf(Math.max(...counts))
      await supabase.from('answers').insert([{
        session_id: session.id, player_id: hotSeatId, question_id: q.id, question_index: currentQ,
        answer_given: top, is_correct: top === q.correct_index, points_earned: 0
      }])
    }
    const newUsed = [...used, key]
    setUsed(newUsed)
    await supabase.from('game_sessions').update({ lifelines_used: newUsed }).eq('id', session.id)
  }

  // ── Reveal: knock out the Mob, update the pot ──
  async function revealAnswer() {
    if (busy) return
    setBusy(true)
    clearInterval(timerRef.current); timerRef.current = null

    const { data: fresh } = await supabase.from('answers').select('*').eq('session_id', session.id).eq('question_index', currentQ)
    const ans = fresh || []
    const cAns = ans.find(a => a.player_id === hotSeatId)
    const contestantCorrect = !!cAns?.is_correct

    const alive = mobAlive
    const knocked = alive.filter(p => !ans.some(a => a.player_id === p.id && a.is_correct)).map(p => p.id)
    const survivorIds = alive.map(p => p.id).filter(id => !knocked.includes(id))
    if (knocked.length > 0) {
      await supabase.from('players').update({ eliminated_at: currentQ }).in('id', knocked)
    }

    const prevEliminated = mobSize - alive.length
    let newPot = pot
    let result = null
    let share = 0

    if (contestantCorrect) {
      newPot = potFor(prevEliminated + knocked.length, mobSize)
      if (survivorIds.length === 0) {
        result = 'won'
        newPot = TOP_PRIZE
        await addScore(hotSeatId, TOP_PRIZE)
      }
    } else {
      result = 'lost'
      if (survivorIds.length > 0 && pot > 0) {
        share = Math.floor(pot / survivorIds.length)
        await Promise.all(survivorIds.map(id => addScore(id, share)))
      }
    }

    setPot(newPot)
    await supabase.from('game_sessions').update({ phase: 'revealed', revealed: true, pot: newPot, ovh_result: result }).eq('id', session.id)
    setReveal({ contestantCorrect, contestantAnswered: !!cAns, knocked, survivors: survivorIds.length, result, share, potBefore: pot })
    await fetchPlayers(session.id)
    setStage('revealed')
    setBusy(false)
  }

  async function takeMoney() {
    if (busy) return
    setBusy(true)
    await addScore(hotSeatId, pot)
    await supabase.from('game_sessions').update({ ovh_result: 'walked', phase: 'ovh-round-over' }).eq('id', session.id)
    setReveal(prev => ({ ...prev, result: 'walked' }))
    await fetchPlayers(session.id)
    setStage('round-over')
    setBusy(false)
  }

  async function showRoundOver() {
    await supabase.from('game_sessions').update({ phase: 'ovh-round-over' }).eq('id', session.id)
    await fetchPlayers(session.id)
    setStage('round-over')
  }

  async function nextContestant() {
    await supabase.from('game_sessions').update({ phase: 'ovh-pick', hot_seat_player_id: null, ovh_result: null, pot: 0 }).eq('id', session.id)
    setHotSeatId(null); setRoster([]); setCurrentQ(-1); setReveal(null); setPot(0)
    setStage('pick')
  }

  // ═══════════ SHARED PIECES ═══════════
  const rejoinChip = (
    <div className="card-sm" style={{ textAlign: 'center', padding: '0.6rem 1rem', border: '1px solid rgba(108,99,255,0.3)', background: 'rgba(108,99,255,0.06)' }}>
      <p style={{ fontFamily: 'monospace', fontSize: '0.72rem', color: 'var(--muted)' }}>kwis-nine.vercel.app</p>
      <p style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: '1.3rem', letterSpacing: '0.15em', color: 'var(--accent)' }}>{session?.pin}</p>
    </div>
  )

  const leaderboard = (title, limit = 10) => (
    <div className="card">
      <p style={{ ...label, marginBottom: '0.75rem' }}>{title}</p>
      {players.slice(0, limit).map((p, i) => (
        <div key={p.id} className="lb-row">
          <div className={`lb-rank ${i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : ''}`}>{i + 1}</div>
          <div style={{ fontSize: '0.9rem' }}>{p.avatar}</div>
          <div className="lb-name" style={{ fontSize: '0.85rem', flex: 1 }}>{p.nickname}</div>
          <div className="lb-score" style={{ fontSize: '0.85rem' }}>{money(p.score)}</div>
        </div>
      ))}
      {players.length === 0 && <p style={{ color: 'var(--muted)', fontSize: '0.82rem' }}>No players</p>}
    </div>
  )

  const mobBoard = (
    <div className="card" style={{ marginTop: '1rem' }}>
      <p style={{ ...label, marginBottom: '0.75rem' }}>The Mob — {mobAlive.length} of {mobSize} still standing</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
        {rosterPlayers.map(p => {
          const out = p.eliminated_at !== null
          const justOut = reveal?.knocked?.includes(p.id) && stage === 'revealed'
          return (
            <div key={p.id} className={justOut ? 'pop-in' : ''} style={{
              padding: '0.3rem 0.6rem', borderRadius: 999, fontSize: '0.8rem',
              background: justOut ? 'rgba(255,71,87,0.2)' : out ? 'transparent' : 'var(--surface2)',
              border: justOut ? '1px solid var(--red)' : '1px solid var(--border)',
              opacity: out && !justOut ? 0.3 : 1,
              textDecoration: out ? 'line-through' : 'none',
              transition: 'all 0.4s'
            }}>
              {justOut ? '💀' : p.avatar} {p.nickname}
            </div>
          )
        })}
      </div>
    </div>
  )

  // ═══════════ PICK THE CONTESTANT ═══════════
  if (stage === 'pick') return (
    <div className="screen">
      <div className="container-wide">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
          <div>
            <p style={label}>1 vs. 100 · {selectedSet?.name}</p>
            <h1 className="gradient-text" style={{ fontSize: '2.2rem', fontWeight: 800 }}>Who's in the hot seat?</h1>
            <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>{questionsLeft} question{questionsLeft !== 1 ? 's' : ''} left in this set</p>
          </div>
          {rejoinChip}
        </div>

        <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 300 }}>
            {questionsLeft <= 0 ? (
              <div className="card" style={{ textAlign: 'center', padding: '2rem' }}>
                <p style={{ fontWeight: 700, marginBottom: '0.5rem' }}>Out of questions!</p>
                <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>End the game to see final winnings.</p>
              </div>
            ) : (
              <>
                <button className="btn btn-primary btn-lg btn-full" disabled={busy || players.length < 2} onClick={pickRandom} style={{ marginBottom: '1rem' }}>
                  🎲 Random pick
                </button>
                <p style={{ ...label, marginBottom: '0.6rem' }}>Or tap a student</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                  {players.map(p => {
                    const played = pastContestants.includes(p.id)
                    return (
                      <div key={p.id} className="chip" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', paddingRight: '0.4rem', opacity: played ? 0.5 : 1 }}>
                        <span style={{ cursor: 'pointer' }} onClick={() => players.length >= 2 && startRound(p.id)}>
                          {p.avatar} {p.nickname}{played ? ' ✓' : ''}
                        </span>
                        <button onClick={() => kickPlayer(p.id)} title="Remove player" style={{
                          background: 'rgba(255,71,87,0.15)', border: '1px solid rgba(255,71,87,0.3)', borderRadius: 4,
                          color: 'var(--red)', cursor: 'pointer', fontSize: '0.7rem', padding: '0.1rem 0.35rem', lineHeight: 1, fontWeight: 700
                        }}>✕</button>
                      </div>
                    )
                  })}
                </div>
                {pastContestants.length > 0 && (
                  <p style={{ color: 'var(--muted)', fontSize: '0.78rem', marginTop: '0.6rem' }}>✓ = already had a turn. Random pick skips them.</p>
                )}
                {players.length < 2 && <p style={{ color: 'var(--red)', fontSize: '0.85rem', marginTop: '0.6rem' }}>You need at least 2 players.</p>}
              </>
            )}
            <button className="btn btn-full" style={{ marginTop: '1.5rem', background: 'rgba(255,71,87,0.12)', border: '1px solid rgba(255,71,87,0.3)', color: 'var(--red)' }} onClick={onEndGame}>
              End game & show final winnings
            </button>
          </div>
          <div style={{ width: 280, flexShrink: 0 }}>{leaderboard('Total winnings')}</div>
        </div>
      </div>
    </div>
  )

  // ═══════════ INTRO: "ALEX vs. 27" ═══════════
  if (stage === 'intro') return (
    <div className="screen centered" style={{ textAlign: 'center' }}>
      <p style={label}>1 vs. 100</p>
      <div className="pop-in" style={{ fontSize: '4.5rem', lineHeight: 1 }}>{hotSeat?.avatar}</div>
      <h1 className="gradient-text" style={{ fontSize: 'clamp(2.5rem, 7vw, 4.5rem)', fontWeight: 800, lineHeight: 1.1 }}>{hotSeat?.nickname}</h1>
      <p style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: '1.6rem', color: 'var(--muted)', margin: '0.5rem 0' }}>vs.</p>
      <p style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 'clamp(3rem, 9vw, 6rem)', lineHeight: 1, color: 'var(--red)' }}>{mobSize}</p>
      <p style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: '1.3rem', marginBottom: '1.5rem' }}>the Mob</p>
      <p style={{ color: 'var(--muted)', maxWidth: 520, margin: '0 auto 2rem', lineHeight: 1.6 }}>
        Every Mob member who misses gets knocked out and grows the pot. Beat all {mobSize} to win {money(TOP_PRIZE)}.
        One wrong answer and the survivors split the pot.
      </p>
      <button className="btn btn-primary btn-lg" disabled={busy || questionsLeft <= 0} onClick={loadQuestion}>
        {questionsLeft > 0 ? 'First question →' : 'Out of questions'}
      </button>
    </div>
  )

  // ═══════════ QUESTION + REVEAL ═══════════
  if ((stage === 'question' || stage === 'revealed') && q) {
    const isRevealed = stage === 'revealed'
    const counts = [0, 0, 0, 0]
    mobAnswers.forEach(a => { counts[order.indexOf(a.answer_given)]++ })
    const contestantDisplay = contestantAnswer ? order.indexOf(contestantAnswer.answer_given) : -1
    const timerColor = timer > 10 ? 'var(--green)' : timer > 5 ? 'var(--yellow)' : 'var(--red)'

    return (
      <div className="screen">
        <div className="container-wide">
          {/* Scoreboard strip */}
          <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap', alignItems: 'stretch' }}>
            <div className="card-sm" style={{ flex: 1, minWidth: 160 }}>
              <p style={label}>🔥 Hot seat</p>
              <p style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: '1.4rem' }}>{hotSeat?.avatar} {hotSeat?.nickname}</p>
            </div>
            <div className="card-sm" style={{ flex: 1, minWidth: 160, border: '1px solid rgba(0,229,160,0.3)' }}>
              <p style={label}>💰 Pot</p>
              <p className="pop-in" key={pot} style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: '1.8rem', color: 'var(--green)' }}>{money(pot)}</p>
            </div>
            <div className="card-sm" style={{ flex: 1, minWidth: 160, border: '1px solid rgba(255,71,87,0.3)' }}>
              <p style={label}>👥 Mob left</p>
              <p className="pop-in" key={mobAlive.length} style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: '1.8rem', color: 'var(--red)' }}>
                {mobAlive.length}<span style={{ fontSize: '1rem', color: 'var(--muted)' }}> / {mobSize}</span>
              </p>
            </div>
            {rejoinChip}
          </div>

          <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 300 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
                <p style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>Question {currentQ + 1} of {questions.length}</p>
                {!isRevealed && (
                  <p style={{ fontFamily: 'Syne', fontWeight: 800, color: timer > 0 ? timerColor : 'var(--muted)' }}>
                    {timer > 0 ? `Mob: ${timer}s` : 'Mob locked 🔒'}
                  </p>
                )}
              </div>

              <div className="card" style={{ marginBottom: '1rem' }}>
                <p style={{ fontSize: '1.35rem', fontWeight: 700, fontFamily: 'Syne', lineHeight: 1.4 }}>{q.question_text}</p>
              </div>

              <QuestionImage q={q} maxHeight="45vh" />

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem', marginBottom: '1rem' }}>
                {order.map((origIdx, i) => {
                  const isCorrect = i === correctDisplay
                  return (
                    <div key={OPT_KEYS[origIdx]} style={{
                      padding: '0.9rem 1rem', borderRadius: 'var(--radius)', position: 'relative',
                      background: isRevealed ? (isCorrect ? 'rgba(0,229,160,0.15)' : 'rgba(255,255,255,0.03)') : `${OPT_COLORS[i]}22`,
                      border: isRevealed ? (isCorrect ? '2px solid var(--green)' : '1px solid var(--border)') : `1px solid ${OPT_COLORS[i]}66`,
                      opacity: isRevealed && !isCorrect && i !== contestantDisplay ? 0.4 : 1,
                      transition: 'all 0.3s'
                    }}>
                      <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: '0.2rem' }}>{OPT_LABELS[i]}</span>
                      <span style={{ fontSize: '0.95rem', fontWeight: 500 }}>{q[OPT_KEYS[origIdx]]}</span>
                      {isRevealed && i === contestantDisplay && (
                        <span style={{ position: 'absolute', top: 8, right: 10, fontSize: '0.75rem', fontWeight: 700, color: isCorrect ? 'var(--green)' : 'var(--red)' }}>
                          🔥 {hotSeat?.nickname}
                        </span>
                      )}
                      {pollOpen && !isRevealed && (
                        <div style={{ marginTop: '0.5rem' }}>
                          <div style={{ height: 8, borderRadius: 4, background: 'var(--surface2)', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${mobAnswers.length ? (counts[i] / mobAnswers.length) * 100 : 0}%`, background: OPT_COLORS[i], transition: 'width 0.4s' }} />
                          </div>
                          <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>{counts[i]} of the Mob</span>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Ask the Mob */}
              {askPicks && !isRevealed && (
                <div className="card-sm" style={{ marginBottom: '1rem', border: '1px solid rgba(108,99,255,0.35)' }}>
                  <p style={{ ...label, marginBottom: '0.5rem' }}>🎤 Ask the Mob — explain your pick out loud</p>
                  <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                    {askPicks.map(a => (
                      <div key={a.id} style={{ flex: 1, minWidth: 140, padding: '0.6rem 0.8rem', background: 'var(--surface2)', borderRadius: 10 }}>
                        <p style={{ fontWeight: 700 }}>{nameOf(a.player_id)}</p>
                        <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>picked <strong style={{ color: 'var(--text)' }}>{OPT_LABELS[order.indexOf(a.answer_given)]}</strong></p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* QUESTION controls */}
              {!isRevealed && (
                <>
                  <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                    {LIFELINES.map(l => {
                      const isUsed = used.includes(l.key)
                      return (
                        <button key={l.key} className="btn" disabled={isUsed || !!contestantAnswer || busy}
                          onClick={() => activateLifeline(l.key)} title={l.desc}
                          style={{ flex: 1, minWidth: 130, textDecoration: isUsed ? 'line-through' : 'none' }}>
                          {l.icon} {l.name}
                        </button>
                      )
                    })}
                  </div>
                  <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <button className="btn btn-primary btn-lg" disabled={!contestantAnswer || busy} onClick={revealAnswer}>
                      Reveal answer
                    </button>
                    <span style={{ color: contestantAnswer ? 'var(--green)' : 'var(--muted)', fontSize: '0.9rem' }}>
                      {contestantAnswer ? `✓ ${hotSeat?.nickname} locked in` : `Waiting for ${hotSeat?.nickname} to lock in…`}
                    </span>
                    <span style={{ color: 'var(--muted)', fontSize: '0.9rem', marginLeft: 'auto' }}>
                      Mob answered: <strong style={{ color: 'var(--text)' }}>{mobAnswers.length}</strong> / {mobAlive.length}
                    </span>
                  </div>
                </>
              )}

              {/* REVEAL results */}
              {isRevealed && reveal && (
                <>
                  {q.explanation && (
                    <div style={{ background: 'rgba(0,229,160,0.08)', border: '1px solid rgba(0,229,160,0.25)', borderRadius: 'var(--radius)', padding: '0.9rem 1.1rem', fontSize: '0.88rem', lineHeight: 1.6, marginBottom: '1rem' }}>
                      💡 {q.explanation}
                    </div>
                  )}
                  <div className="card pop-in" style={{
                    textAlign: 'center', marginBottom: '1rem',
                    border: `2px solid ${reveal.contestantCorrect ? 'var(--green)' : 'var(--red)'}`,
                    background: reveal.contestantCorrect ? 'rgba(0,229,160,0.08)' : 'rgba(255,71,87,0.08)'
                  }}>
                    {reveal.result === 'won' && (
                      <>
                        <p style={{ fontSize: '2.5rem' }}>🏆</p>
                        <p style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: '1.8rem' }}>{hotSeat?.nickname} BEAT THE MOB!</p>
                        <p style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: '2.2rem', color: 'var(--green)' }}>{money(TOP_PRIZE)}</p>
                      </>
                    )}
                    {reveal.result === 'lost' && (
                      <>
                        <p style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: '1.8rem', color: 'var(--red)' }}>
                          ✗ {hotSeat?.nickname} {reveal.contestantAnswered ? 'missed it!' : "didn't answer!"}
                        </p>
                        <p style={{ fontSize: '1.05rem', marginTop: '0.35rem' }}>
                          {reveal.survivors > 0 && reveal.potBefore > 0
                            ? <>{reveal.survivors} Mob survivor{reveal.survivors !== 1 ? 's' : ''} split {money(reveal.potBefore)}: <strong style={{ color: 'var(--green)' }}>{money(reveal.share)} each</strong></>
                            : reveal.survivors > 0 ? 'The pot was empty, so nobody collects this time.' : 'Nobody in the Mob survived either. No one collects!'}
                        </p>
                      </>
                    )}
                    {reveal.result === null && (
                      <>
                        <p style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: '1.8rem', color: 'var(--green)' }}>✓ Correct!</p>
                        <p style={{ fontSize: '1.05rem', marginTop: '0.35rem' }}>
                          {reveal.knocked.length} knocked out · {mobAlive.length} left · pot is now <strong style={{ color: 'var(--green)' }}>{money(pot)}</strong>
                        </p>
                        <p style={{ color: 'var(--muted)', marginTop: '0.5rem' }}>{hotSeat?.nickname}, keep going or take the money?</p>
                      </>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', justifyContent: 'center' }}>
                    {reveal.result === null && (
                      <>
                        <button className="btn btn-primary btn-lg" disabled={busy || questionsLeft <= 0} onClick={loadQuestion}>
                          {questionsLeft > 0 ? 'Keep going →' : 'Out of questions'}
                        </button>
                        <button className="btn btn-success btn-lg" disabled={busy} onClick={takeMoney}>💰 Take the money ({money(pot)})</button>
                      </>
                    )}
                    {(reveal.result === 'won' || reveal.result === 'lost') && (
                      <button className="btn btn-primary btn-lg" onClick={showRoundOver}>See round results →</button>
                    )}
                  </div>
                </>
              )}

              {mobBoard}
            </div>

            <div style={{ width: 260, flexShrink: 0 }}>{leaderboard('Total winnings', 8)}</div>
          </div>
        </div>
      </div>
    )
  }

  // ═══════════ ROUND OVER ═══════════
  if (stage === 'round-over') {
    const r = reveal?.result
    return (
      <div className="screen">
        <div className="container">
          <div className="card pop-in" style={{ textAlign: 'center', marginBottom: '1.5rem', padding: '2rem 1.5rem' }}>
            <p style={{ fontSize: '3rem', marginBottom: '0.25rem' }}>{r === 'won' ? '🏆' : r === 'walked' ? '💰' : '💀'}</p>
            <h1 className="gradient-text" style={{ fontSize: '2rem', fontWeight: 800, marginBottom: '0.5rem' }}>
              {r === 'won' && `${hotSeat?.nickname} beat the Mob!`}
              {r === 'walked' && `${hotSeat?.nickname} took the money!`}
              {r === 'lost' && `The Mob wins this round!`}
            </h1>
            <p style={{ fontSize: '1.1rem', color: 'var(--muted)' }}>
              {r === 'won' && `${money(TOP_PRIZE)} added to ${hotSeat?.nickname}'s winnings.`}
              {r === 'walked' && `${money(pot)} banked, with ${mobAlive.length} Mob member${mobAlive.length !== 1 ? 's' : ''} still standing.`}
              {r === 'lost' && (reveal?.survivors > 0 && reveal?.potBefore > 0
                ? `${reveal.survivors} survivor${reveal.survivors !== 1 ? 's' : ''} each collected ${money(reveal.share)}.`
                : `Nobody collected anything this time.`)}
            </p>
          </div>

          {leaderboard('Total winnings', 15)}

          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem', flexWrap: 'wrap' }}>
            <button className="btn btn-primary btn-lg" style={{ flex: 1 }} disabled={questionsLeft <= 0} onClick={nextContestant}>
              {questionsLeft > 0 ? 'Next contestant →' : 'Out of questions'}
            </button>
            <button className="btn btn-lg" onClick={onEndGame}>End game</button>
          </div>
        </div>
      </div>
    )
  }

  return null
}
