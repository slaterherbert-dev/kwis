import React, { useEffect, useState, useRef } from 'react'
import { supabase } from '../supabase'

// ═══════════════════════════════════════════════════════════════
// 1 vs. 100 — STUDENT CHROMEBOOK SCREEN
// The same screen works for the hot-seat contestant AND the Mob.
// Students only ever write their own answer. All scoring and
// eliminating happens on the teacher's host screen.
// ═══════════════════════════════════════════════════════════════

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

const MOB_SECONDS = 20
const OPT_LABELS = ['A', 'B', 'C', 'D']
const OPT_KEYS = ['option_a', 'option_b', 'option_c', 'option_d']

function money(n) { return '$' + Math.round(n || 0).toLocaleString() }

const label = { fontSize: '0.72rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.25rem' }

export default function OneVsHundredStudent({ go, gameSession, player }) {
  const [session, setSession] = useState(gameSession)
  const [questions, setQuestions] = useState([])
  const [players, setPlayers] = useState([])
  const [myAnswer, setMyAnswer] = useState(null) // ORIGINAL option index (before shuffle)
  const [timer, setTimer] = useState(MOB_SECONDS)
  const [kicked, setKicked] = useState(false)
  const timerRef = useRef(null)
  const lastQRef = useRef(null)
  const lastPhaseRef = useRef(null)

  useEffect(() => {
    (async () => {
      const { data: qs } = await supabase.from('questions').select('*').eq('set_id', gameSession.set_id).order('position')
      setQuestions(qs || [])
      await fetchPlayers()
      const { data: fresh } = await supabase.from('game_sessions').select('*').eq('id', gameSession.id).single()
      if (fresh) applySession(fresh)
    })()

    const sub = supabase.channel('ovh-student-' + gameSession.id + '-' + player.id)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'game_sessions', filter: `id=eq.${gameSession.id}` },
        (payload) => applySession(payload.new))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players', filter: `session_id=eq.${gameSession.id}` },
        () => fetchPlayers())
      // Catches "Trust the Mob," where the teacher's screen locks in the contestant's answer
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'answers', filter: `player_id=eq.${player.id}` },
        (payload) => { if (payload.new?.question_index === lastQRef.current) setMyAnswer(payload.new.answer_given) })
      .subscribe()

    return () => { supabase.removeChannel(sub); clearInterval(timerRef.current) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchPlayers() {
    const { data } = await supabase.from('players').select('*').eq('session_id', gameSession.id).order('score', { ascending: false })
    const all = data || []
    if (all.find(p => p.id === player.id)?.kicked) setKicked(true)
    setPlayers(all.filter(p => !p.kicked))
  }

  function applySession(s) {
    setSession(s)
    if (s.phase === 'ended') { clearInterval(timerRef.current); go('student-final'); return }

    // A new question starts when the index changes OR the phase flips into 'question'
    // (the very first question keeps index 0, so the index alone isn't enough).
    const prevPhase = lastPhaseRef.current
    lastPhaseRef.current = s.phase
    const newIndex = s.current_question !== lastQRef.current
    if (s.phase === 'question' && (newIndex || prevPhase !== 'question')) {
      lastQRef.current = s.current_question
      setMyAnswer(null)
      checkExistingAnswer(s.current_question)
      startTimer()
    } else if (newIndex) {
      lastQRef.current = s.current_question
      setMyAnswer(null)
      checkExistingAnswer(s.current_question)
    }
    if (s.phase !== 'question') clearInterval(timerRef.current)
  }

  // If a student rejoins mid-question, restore the answer they already gave
  async function checkExistingAnswer(qIndex) {
    const { data } = await supabase.from('answers').select('*')
      .eq('session_id', gameSession.id).eq('player_id', player.id).eq('question_index', qIndex).maybeSingle()
    if (data) setMyAnswer(data.answer_given)
  }

  function startTimer() {
    clearInterval(timerRef.current)
    let t = MOB_SECONDS
    setTimer(t)
    timerRef.current = setInterval(() => {
      t--
      setTimer(t)
      if (t <= 0) { clearInterval(timerRef.current); timerRef.current = null }
    }, 1000)
  }

  // ── Derived ──
  const phase = session?.phase
  const me = players.find(p => p.id === player.id) || player
  const hotId = session?.hot_seat_player_id
  const isContestant = hotId === player.id
  const hotSeat = players.find(p => p.id === hotId)
  const mob = players.filter(p => p.id !== hotId && p.eliminated_at !== -1)
  const mobAlive = mob.filter(p => p.eliminated_at === null)
  const myStatus = isContestant ? 'contestant'
    : me.eliminated_at === null || me.eliminated_at === undefined ? 'alive'
    : me.eliminated_at === -1 ? 'sitting' : 'out'
  const myRank = players.findIndex(p => p.id === player.id) + 1
  const pot = session?.pot || 0

  const q = questions[session?.current_question]
  const order = q ? seededShuffleIndices(4, `${gameSession.id}-${q.id}`) : [0, 1, 2, 3]
  const correctDisplay = q ? order.indexOf(q.correct_index) : -1
  const myDisplay = myAnswer !== null ? order.indexOf(myAnswer) : -1
  const iWasRight = myAnswer !== null && q && myAnswer === q.correct_index
  // Was I still alive going into this question? (eliminated_at === this question means I just got knocked out)
  const inThisQuestion = isContestant || myStatus === 'alive' || me.eliminated_at === session?.current_question
  const canAnswer = phase === 'question' && myAnswer === null && q &&
    (isContestant || (myStatus === 'alive' && timer > 0))

  async function submit(displayIdx) {
    if (!canAnswer) return
    const originalIdx = order[displayIdx]
    setMyAnswer(originalIdx)
    clearInterval(timerRef.current)
    await supabase.from('answers').insert([{
      session_id: gameSession.id,
      player_id: player.id,
      question_id: q.id,
      question_index: session.current_question,
      answer_given: originalIdx,
      is_correct: originalIdx === q.correct_index,
      points_earned: 0
    }])
  }

  // ═══════════ SCREENS ═══════════
  const wrap = (children) => (
    <div className="screen centered" style={{ textAlign: 'center', maxWidth: 500, margin: '0 auto' }}>{children}</div>
  )

  const myWinnings = (
    <div className="card-sm" style={{ display: 'inline-block', marginTop: '1.5rem', minWidth: 180 }}>
      <p style={label}>Your total winnings</p>
      <p style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: '1.6rem', color: 'var(--green)' }}>{money(me.score)}</p>
      {myRank > 0 && <p style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>#{myRank} of {players.length}</p>}
    </div>
  )

  if (kicked) return wrap(
    <>
      <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🚫</div>
      <h2 style={{ fontFamily: 'Syne', fontSize: '1.6rem', fontWeight: 800, marginBottom: '0.5rem' }}>You were removed</h2>
      <p style={{ color: 'var(--muted)', marginBottom: '2rem', fontSize: '0.9rem' }}>Your teacher removed you from the game.<br />Rejoin with a different name if needed.</p>
      <button className="btn btn-primary" onClick={() => go('student-join')}>Rejoin →</button>
    </>
  )

  // ── Waiting for the teacher to pick a contestant ──
  if (!phase || phase === 'ovh-pick' || phase === 'lobby') return wrap(
    <>
      <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>🎬</div>
      <h2 style={{ fontFamily: 'Syne', fontSize: '1.6rem', fontWeight: 800, marginBottom: '0.5rem' }}>Choosing the next contestant…</h2>
      <p style={{ color: 'var(--muted)' }}>Eyes on the board. It could be you!</p>
      <div className="dot-row" style={{ marginTop: '1.5rem' }}><div className="dot" /><div className="dot" /><div className="dot" /></div>
      {myWinnings}
    </>
  )

  // ── Intro ──
  if (phase === 'ovh-intro') {
    if (isContestant) return wrap(
      <>
        <div className="pop-in" style={{ fontSize: '4rem' }}>🔥</div>
        <h1 className="gradient-text" style={{ fontSize: '2.2rem', fontWeight: 800 }}>You're in the hot seat!</h1>
        <p style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: '1.4rem', margin: '0.75rem 0' }}>You vs. {mobAlive.length}</p>
        <p style={{ color: 'var(--muted)', lineHeight: 1.6 }}>
          Every Mob member who misses gets knocked out and grows your pot. After each correct answer, you decide:
          keep going, or take the money. One wrong answer and you lose it all.
        </p>
      </>
    )
    if (myStatus === 'sitting') return wrap(
      <>
        <div style={{ fontSize: '3rem' }}>⏳</div>
        <h2 style={{ fontFamily: 'Syne', fontSize: '1.5rem', fontWeight: 800 }}>You joined mid-round</h2>
        <p style={{ color: 'var(--muted)' }}>You'll be in the Mob next round.</p>
      </>
    )
    return wrap(
      <>
        <div style={{ fontSize: '3rem' }}>{hotSeat?.avatar}</div>
        <h1 style={{ fontFamily: 'Syne', fontSize: '2rem', fontWeight: 800 }}>{hotSeat?.nickname}</h1>
        <p style={{ fontFamily: 'Syne', fontWeight: 700, color: 'var(--muted)', margin: '0.25rem 0 1rem' }}>vs. the Mob</p>
        <div className="card-sm" style={{ border: '1px solid rgba(255,71,87,0.35)' }}>
          <p style={{ fontWeight: 700, marginBottom: '0.35rem' }}>👥 You're in the Mob</p>
          <p style={{ color: 'var(--muted)', fontSize: '0.9rem', lineHeight: 1.5 }}>
            Answer right to stay alive. If {hotSeat?.nickname} misses, everyone still standing splits the pot.
          </p>
        </div>
      </>
    )
  }

  // ── Round over ──
  if (phase === 'ovh-round-over') {
    const r = session.ovh_result
    return wrap(
      <>
        <div style={{ fontSize: '3.5rem' }}>{r === 'won' ? '🏆' : r === 'walked' ? '💰' : '💀'}</div>
        <h2 style={{ fontFamily: 'Syne', fontSize: '1.6rem', fontWeight: 800, marginBottom: '0.5rem' }}>
          {r === 'won' && `${isContestant ? 'You' : hotSeat?.nickname} beat the Mob!`}
          {r === 'walked' && `${isContestant ? 'You' : hotSeat?.nickname} took ${money(pot)}`}
          {r === 'lost' && 'The Mob wins this round!'}
        </h2>
        <p style={{ color: 'var(--muted)' }}>Next contestant coming up…</p>
        {myWinnings}
      </>
    )
  }

  // ── Question + reveal ──
  if ((phase === 'question' || phase === 'revealed') && q) {
    const revealed = phase === 'revealed'
    const result = session.ovh_result
    const survivorShare = mobAlive.length > 0 ? Math.floor(pot / mobAlive.length) : 0

    let banner = null
    if (!revealed) {
      if (myStatus === 'out') banner = { color: 'var(--muted)', text: "💀 You're out this round. Play along in your head!" }
      else if (myStatus === 'sitting') banner = { color: 'var(--muted)', text: "⏳ You joined mid-round. You're in next round." }
      else if (myAnswer !== null) banner = { color: 'var(--muted)', text: '🔒 Locked in. Watch the board…' }
      else if (!isContestant && timer <= 0) banner = { color: 'var(--red)', text: "⏰ Time's up!" }
    } else if (isContestant) {
      if (result === 'won') banner = { color: 'var(--green)', text: '🏆 YOU BEAT THE MOB! $1,000,000!' }
      else if (iWasRight) banner = { color: 'var(--green)', text: `✓ Correct! Pot: ${money(pot)}. Keep going or take the money?` }
      else banner = { color: 'var(--red)', text: myAnswer === null ? "✗ You didn't answer. Game over." : '✗ Wrong answer. Game over!' }
    } else if (inThisQuestion) {
      if (iWasRight) {
        banner = result === 'lost'
          ? { color: 'var(--green)', text: pot > 0 ? `💰 You survived! You split the pot: +${money(survivorShare)}` : '✓ You survived! (The pot was empty.)' }
          : { color: 'var(--green)', text: '✓ Still standing!' }
      } else {
        banner = { color: 'var(--red)', text: myAnswer === null ? "💀 No answer: you're knocked out!" : "💀 You've been knocked out!" }
      }
    } else {
      banner = { color: 'var(--muted)', text: 'Watching from the sidelines this round.' }
    }

    return (
      <div className="screen" style={{ maxWidth: 500, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
          <div className="card-sm" style={{ flex: 1, padding: '0.5rem 0.75rem', textAlign: 'center' }}>
            <p style={label}>{isContestant ? '🔥 You' : '🔥 Hot seat'}</p>
            <p style={{ fontWeight: 700, fontSize: '0.95rem' }}>{isContestant ? 'Contestant' : hotSeat?.nickname}</p>
          </div>
          <div className="card-sm" style={{ flex: 1, padding: '0.5rem 0.75rem', textAlign: 'center' }}>
            <p style={label}>💰 Pot</p>
            <p style={{ fontFamily: 'Syne', fontWeight: 800, color: 'var(--green)' }}>{money(pot)}</p>
          </div>
          <div className="card-sm" style={{ flex: 1, padding: '0.5rem 0.75rem', textAlign: 'center' }}>
            <p style={label}>👥 Mob</p>
            <p style={{ fontFamily: 'Syne', fontWeight: 800, color: 'var(--red)' }}>{mobAlive.length} left</p>
          </div>
        </div>

        {/* Mob timer (contestant has no clock) */}
        {!revealed && !isContestant && myStatus === 'alive' && myAnswer === null && (
          <div style={{ marginBottom: '0.75rem' }}>
            <div style={{ height: 6, borderRadius: 3, background: 'var(--surface2)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${(timer / MOB_SECONDS) * 100}%`, background: timer > 10 ? 'var(--green)' : timer > 5 ? 'var(--yellow)' : 'var(--red)', transition: 'width 1s linear' }} />
            </div>
            <p style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: '0.25rem' }}>{timer}s to answer</p>
          </div>
        )}

        <div className="card" style={{ marginBottom: '1rem', padding: '1rem 1.1rem' }}>
          <p style={{ fontFamily: 'Syne', fontWeight: 600, fontSize: '1.05rem', lineHeight: 1.45 }}>{q.question_text}</p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginBottom: '1rem' }}>
          {order.map((origIdx, i) => {
            let extra = ''
            if (revealed && i === correctDisplay) extra = 'correct-reveal'
            else if (revealed && i === myDisplay) extra = 'wrong-reveal'
            else if (i === myDisplay) extra = 'selected'
            return (
              <button key={OPT_KEYS[origIdx]} className={`opt-btn opt-${i} ${extra}`}
                disabled={!canAnswer} onClick={() => submit(i)}
                style={{ opacity: !canAnswer && !extra && myStatus !== 'alive' && !isContestant ? 0.55 : 1 }}>
                <span className="opt-label-pill">{OPT_LABELS[i]}</span>
                {q[OPT_KEYS[origIdx]]}
              </button>
            )
          })}
        </div>

        {banner && (
          <div className="pop-in" style={{
            borderRadius: 'var(--radius)', padding: '1rem 1.25rem', textAlign: 'center', fontWeight: 700,
            color: banner.color, border: '1px solid var(--border2)', background: 'var(--surface)'
          }}>
            {banner.text}
          </div>
        )}

        {revealed && q.explanation && (
          <div style={{ background: 'rgba(0,229,160,0.08)', border: '1px solid rgba(0,229,160,0.25)', borderRadius: 'var(--radius)', padding: '0.9rem 1.1rem', fontSize: '0.88rem', lineHeight: 1.6, marginTop: '0.75rem' }}>
            💡 {q.explanation}
          </div>
        )}
      </div>
    )
  }

  return wrap(<div className="dot-row"><div className="dot" /><div className="dot" /><div className="dot" /></div>)
}
