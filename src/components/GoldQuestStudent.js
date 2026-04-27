import React, { useEffect, useState, useRef } from 'react'
import { supabase } from '../supabase'

// ── Chest table ──
const CHEST_TABLE = [
  { type: 'gold',     amount: 1,  weight: 18, label: '+1 gold',    emoji: '🪙' },
  { type: 'gold',     amount: 2,  weight: 20, label: '+2 gold',    emoji: '🪙' },
  { type: 'gold',     amount: 3,  weight: 14, label: '+3 gold',    emoji: '💰' },
  { type: 'gold',     amount: 5,  weight: 7,  label: '+5 gold',    emoji: '💎' },
  { type: 'gold',     amount: 10, weight: 3,  label: '+10 gold!',  emoji: '👑' },
  { type: 'steal',    amount: 0,  weight: 10, label: 'Steal!',     emoji: '🏴‍☠️' },
  { type: 'swap',     amount: 0,  weight: 6,  label: 'Swap!',      emoji: '🔄' },
  { type: 'multiply', amount: 0,  weight: 5,  label: '2x Gold!',   emoji: '✨' },
  { type: 'punish',   amount: 0,  weight: 7,  label: '-10% Gold',  emoji: '💀' },
  { type: 'nothing',  amount: 0,  weight: 10, label: 'Empty...',   emoji: '💨' },
]

function pickReward(excludeTypes = []) {
  const pool = CHEST_TABLE.filter(r => !excludeTypes.includes(r.type))
  const totalWeight = pool.reduce((s, r) => s + r.weight, 0)
  let roll = Math.random() * totalWeight
  for (const r of pool) {
    roll -= r.weight
    if (roll <= 0) return { ...r }
  }
  return { ...pool[0] }
}

// Max 1 empty chest per draw of 3
function generateChests() {
  const c1 = pickReward()
  const c2 = pickReward(c1.type === 'nothing' ? ['nothing'] : [])
  const c3 = pickReward((c1.type === 'nothing' || c2.type === 'nothing') ? ['nothing'] : [])
  return [c1, c2, c3]
}

function shuffleArray(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function formatTimeLeft(ms) {
  if (ms <= 0) return '0:00'
  const totalSec = Math.ceil(ms / 1000)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

const CHEST_COLORS = [
  { bg: 'rgba(255,170,50,0.15)',  border: 'rgba(255,170,50,0.45)',  glow: 'rgba(255,170,50,0.3)' },
  { bg: 'rgba(108,99,255,0.15)',  border: 'rgba(108,99,255,0.45)',  glow: 'rgba(108,99,255,0.3)' },
  { bg: 'rgba(0,229,160,0.15)',   border: 'rgba(0,229,160,0.45)',   glow: 'rgba(0,229,160,0.3)' },
]

export default function GoldQuestStudent({ go, gameSession, player }) {
  const [questions, setQuestions]         = useState([])
  const [shuffledOrder, setShuffledOrder] = useState([])
  const [currentIdx, setCurrentIdx]       = useState(0)
  const [phase, setPhase]                 = useState('question')
  const [myAnswer, setMyAnswer]           = useState(null)
  const [answered, setAnswered]           = useState(false)
  const [gold, setGold]                   = useState(0)
  const goldRef                           = useRef(0)
  const [chests, setChests]               = useState([])
  const [pickedChest, setPickedChest]     = useState(null)
  const [chestResult, setChestResult]     = useState(null)
  const [actionTarget, setActionTarget]   = useState(null)
  const [notifications, setNotifications] = useState([])
  const [rank, setRank]                   = useState(null)
  const [streak, setStreak]               = useState(0)
  const [gameLocked, setGameLocked]       = useState(false)
  const [timeLeft, setTimeLeft]           = useState(null)
  const [endsAt, setEndsAt]               = useState(null)
  const [finalPlayers, setFinalPlayers]   = useState([])
  const [kicked, setKicked]               = useState(false)
  const timerRef = useRef(null)

  useEffect(() => { goldRef.current = gold }, [gold])

  useEffect(() => {
    loadQuestions()
    loadSessionTimer()

    const sub = supabase.channel('gq-student-' + gameSession.id)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'game_sessions', filter: `id=eq.${gameSession.id}` }, (payload) => {
        const s = payload.new
        if (s.phase === 'ended' || s.phase === 'gold_quest_ended') {
          setGameLocked(true)
          clearInterval(timerRef.current)
          loadFinalStandings()
        }
        if (s.ends_at) setEndsAt(s.ends_at)
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'players', filter: `id=eq.${player.id}` }, (payload) => {
        if (payload.new?.kicked) {
          setGameLocked(true)
          setKicked(true)
        }
      })
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'steal_notifications',
        filter: `victim_id=eq.${player.id}`
      }, (payload) => {
        const n = payload.new
        const id = Date.now()
        const isSwap = n.amount < 0
        const msg = isSwap
          ? `${n.thief_avatar} ${n.thief_nickname} swapped gold with you!`
          : `${n.thief_avatar} ${n.thief_nickname} stole ${n.amount} gold from you!`
        setNotifications(prev => [...prev, { id, msg }])
        setTimeout(() => setNotifications(prev => prev.filter(x => x.id !== id)), 4000)
        supabase.from('players').select('score').eq('id', player.id).single().then(({ data }) => {
          if (data) { setGold(data.score); goldRef.current = data.score }
        })
      })
      .subscribe()

    return () => {
      supabase.removeChannel(sub)
      clearInterval(timerRef.current)
    }
  }, [])

  useEffect(() => {
    if (!endsAt) return
    clearInterval(timerRef.current)
    function tick() {
      const ms = new Date(endsAt) - Date.now()
      setTimeLeft(Math.max(ms, 0))
      if (ms <= 0) clearInterval(timerRef.current)
    }
    tick()
    timerRef.current = setInterval(tick, 500)
    return () => clearInterval(timerRef.current)
  }, [endsAt])

  async function loadSessionTimer() {
    const { data } = await supabase.from('game_sessions').select('ends_at').eq('id', gameSession.id).single()
    if (data && data.ends_at) setEndsAt(data.ends_at)
  }

  async function loadQuestions() {
    const { data } = await supabase.from('questions').select('*').eq('set_id', gameSession.set_id).order('position')
    const qs = data || []
    setQuestions(qs)
    setShuffledOrder(shuffleArray(qs.map((_, i) => i)))
  }

  async function loadFinalStandings() {
    const { data } = await supabase.from('players').select('*').eq('session_id', gameSession.id).order('score', { ascending: false })
    setFinalPlayers(data || [])
    setPhase('final-standings')
  }

  async function submitAnswer(idx) {
    if (answered || gameLocked) return
    setAnswered(true)
    setMyAnswer(idx)
    const qIdx = shuffledOrder[currentIdx]
    const q = questions[qIdx]
    if (!q) return
    const isCorrect = idx === q.correct_index
    await supabase.from('answers').insert([{
      session_id: gameSession.id, player_id: player.id, question_id: q.id,
      question_index: qIdx, answer_given: idx, is_correct: isCorrect, points_earned: 0
    }])
    if (isCorrect) {
      setStreak(s => s + 1)
      setChests(generateChests())
      setPickedChest(null)
      setChestResult(null)
      setActionTarget(null)
      setTimeout(() => setPhase('chests'), 600)
    } else {
      setStreak(0)
      setPhase('wrong')
    }
  }

  async function pickChestOption(idx) {
    if (pickedChest !== null || gameLocked) return
    setPickedChest(idx)
    const reward = { ...chests[idx] }
    const currentGold = goldRef.current
    let newGold = currentGold
    let target = null

    if (reward.type === 'gold') {
      newGold = currentGold + reward.amount

    } else if (reward.type === 'steal') {
      const { data: others } = await supabase.from('players')
        .select('*').eq('session_id', gameSession.id).neq('id', player.id)
        .gt('score', 0).order('score', { ascending: false })
      if (others && others.length > 0) {
        const victim = others[0]
        const stealAmt = Math.min(Math.max(1, Math.floor(victim.score * 0.3)), 5)
        newGold = currentGold + stealAmt
        target = { nickname: victim.nickname, avatar: victim.avatar, amount: stealAmt }
        reward.label = `Stole ${stealAmt} gold from ${victim.avatar} ${victim.nickname}!`
        await supabase.from('players').update({ score: victim.score - stealAmt }).eq('id', victim.id)
        await supabase.from('steal_notifications').insert([{
          session_id: gameSession.id, victim_id: victim.id,
          thief_nickname: player.nickname, thief_avatar: player.avatar, amount: stealAmt
        }])
      } else {
        newGold = currentGold + 1
        reward.type = 'gold'; reward.label = '+1 gold (no targets!)'; reward.emoji = '🪙'
      }

    } else if (reward.type === 'swap') {
      const { data: others } = await supabase.from('players')
        .select('*').eq('session_id', gameSession.id).neq('id', player.id)
        .order('score', { ascending: false })
      if (others && others.length > 0 && others[0].score > currentGold) {
        const victim = others[0]
        newGold = victim.score
        target = { nickname: victim.nickname, avatar: victim.avatar, amount: victim.score }
        reward.label = `Swapped with ${victim.avatar} ${victim.nickname}! +${victim.score - currentGold} gold`
        await supabase.from('players').update({ score: currentGold }).eq('id', victim.id)
        await supabase.from('steal_notifications').insert([{
          session_id: gameSession.id, victim_id: victim.id,
          thief_nickname: player.nickname, thief_avatar: player.avatar, amount: -1
        }])
      } else {
        newGold = currentGold + 2
        reward.type = 'gold'; reward.label = '+2 gold (no richer targets!)'; reward.emoji = '🪙'
      }

    } else if (reward.type === 'multiply') {
      newGold = currentGold > 0 ? currentGold * 2 : 2
      reward.label = currentGold > 0 ? `2x — ${currentGold} to ${newGold} gold!` : '+2 gold'

    } else if (reward.type === 'punish') {
      const loss = Math.max(1, Math.floor(currentGold * 0.1))
      newGold = Math.max(0, currentGold - loss)
      reward.label = `-${loss} gold (-10%)`
    }

    setGold(newGold)
    goldRef.current = newGold
    setActionTarget(target)
    setChestResult(reward)
    await supabase.from('players').update({ score: newGold }).eq('id', player.id)

    const { data: allPlayers } = await supabase.from('players')
      .select('score').eq('session_id', gameSession.id).order('score', { ascending: false })
    if (allPlayers) {
      const myRank = allPlayers.findIndex(p => p.score <= newGold) + 1 || allPlayers.length
      setRank(myRank)
    }
    setPhase('reveal')
  }

  function nextQuestion() {
    if (gameLocked) return
    const next = currentIdx + 1
    if (next >= questions.length) {
      setShuffledOrder(shuffleArray(questions.map((_, i) => i)))
      setCurrentIdx(0)
    } else {
      setCurrentIdx(next)
    }
    setMyAnswer(null)
    setAnswered(false)
    setPhase('question')
  }

  const qIdx = shuffledOrder[currentIdx]
  const q = questions[qIdx]
  const optLabels = ['A', 'B', 'C', 'D']
  const optKeys   = ['option_a', 'option_b', 'option_c', 'option_d']
  const totalDuration = gameSession.gold_quest_duration_seconds ? gameSession.gold_quest_duration_seconds * 1000 : null
  const timerPct  = (totalDuration && timeLeft !== null) ? (timeLeft / totalDuration) * 100 : 100
  const timerColor = timeLeft === null ? 'var(--accent)' : timeLeft > 60000 ? 'var(--accent)' : timeLeft > 30000 ? 'var(--yellow, #ffaa32)' : 'var(--red)'

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

  if (!q && phase !== 'final-standings') return (
    <div className="screen centered">
      <div className="dot-row"><div className="dot" /><div className="dot" /><div className="dot" /></div>
    </div>
  )

  // ── FINAL STANDINGS ──
  if (phase === 'final-standings') {
    const myEntry = finalPlayers.find(p => p.id === player.id)
    const myFinalRank = finalPlayers.findIndex(p => p.id === player.id) + 1
    const podiumOrder = [finalPlayers[1], finalPlayers[0], finalPlayers[2]].filter(Boolean)
    const podiumClasses = ['p2', 'p1', 'p3']
    const podiumEmojis  = ['🥈', '🥇', '🥉']
    return (
      <div className="screen" style={{ maxWidth: 500, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '1.5rem', paddingTop: '1rem' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '0.4rem' }}>🪙</div>
          <h1 className="gradient-text" style={{ fontSize: '2rem', fontWeight: 800, fontFamily: 'Syne', marginBottom: '0.25rem' }}>Gold Quest Over!</h1>
          <p style={{ color: 'var(--muted)', fontSize: '0.88rem' }}>Final standings</p>
        </div>
        {myEntry && (
          <div style={{
            background: myFinalRank === 1 ? 'rgba(255,170,50,0.15)' : 'rgba(108,99,255,0.1)',
            border: myFinalRank === 1 ? '2px solid rgba(255,170,50,0.5)' : '1px solid var(--accent)',
            borderRadius: 'var(--radius)', padding: '1rem 1.25rem', marginBottom: '1.5rem', textAlign: 'center'
          }}>
            <p style={{ fontSize: '0.82rem', color: 'var(--muted)', marginBottom: '0.3rem' }}>Your result</p>
            <p style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: '1.8rem', color: 'var(--yellow, #ffaa32)' }}>🪙 {myEntry.score.toLocaleString()} gold</p>
            <p style={{ fontSize: '0.9rem', color: 'var(--muted)', marginTop: '0.25rem' }}>
              {myFinalRank === 1 ? '🏆 You won!' : myFinalRank === 2 ? '🥈 Runner-up!' : myFinalRank === 3 ? '🥉 Third place!' : `Rank #${myFinalRank}`}
            </p>
          </div>
        )}
        {podiumOrder.length >= 2 && (
          <div className="podium" style={{ marginBottom: '1.25rem' }}>
            {podiumOrder.map((p, i) => p && (
              <div key={p.id} className="podium-slot">
                <div className="podium-name" style={{ fontSize: '0.8rem' }}>{p.avatar} {p.nickname}</div>
                <div className="podium-score" style={{ fontSize: '0.8rem' }}>🪙 {p.score.toLocaleString()}</div>
                <div className={`podium-bar ${podiumClasses[i]}`}>{podiumEmojis[i]}</div>
              </div>
            ))}
          </div>
        )}
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <p style={{ fontSize: '0.75rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.75rem' }}>Full leaderboard</p>
          {finalPlayers.map((p, i) => (
            <div key={p.id} className="lb-row" style={{
              background: p.id === player.id ? 'rgba(108,99,255,0.07)' : 'transparent',
              borderRadius: 6, padding: '0.1rem 0.3rem', margin: '0 -0.3rem'
            }}>
              <div className={`lb-rank ${i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : ''}`}>{['🥇','🥈','🥉'][i] || i + 1}</div>
              <div style={{ fontSize: '1rem' }}>{p.avatar}</div>
              <div className="lb-name">{p.nickname}{p.id === player.id ? ' (you)' : ''}</div>
              <div className="lb-score" style={{ color: 'var(--yellow, #ffaa32)' }}>🪙 {p.score.toLocaleString()}</div>
            </div>
          ))}
        </div>
        <button className="btn btn-primary btn-full" onClick={() => go('landing')}>Back to home</button>
      </div>
    )
  }

  // ── Chest reveal colors ──
  const revealBg     = !chestResult ? '' : chestResult.type === 'nothing' ? 'rgba(136,136,170,0.1)' : chestResult.type === 'punish' ? 'rgba(255,71,87,0.12)' : chestResult.type === 'multiply' ? 'rgba(0,229,160,0.12)' : chestResult.type === 'swap' ? 'rgba(108,99,255,0.12)' : chestResult.type === 'steal' ? 'rgba(255,71,87,0.12)' : 'rgba(255,170,50,0.12)'
  const revealBorder = !chestResult ? '' : chestResult.type === 'nothing' ? 'var(--border)' : chestResult.type === 'punish' ? 'rgba(255,71,87,0.35)' : chestResult.type === 'multiply' ? 'rgba(0,229,160,0.35)' : chestResult.type === 'swap' ? 'rgba(108,99,255,0.35)' : chestResult.type === 'steal' ? 'rgba(255,71,87,0.35)' : 'rgba(255,170,50,0.4)'
  const revealColor  = !chestResult ? '' : chestResult.type === 'nothing' ? 'var(--muted)' : chestResult.type === 'punish' ? 'var(--red)' : chestResult.type === 'multiply' ? 'var(--green)' : chestResult.type === 'swap' ? 'var(--accent)' : chestResult.type === 'steal' ? 'var(--red)' : 'var(--yellow, #ffaa32)'

  // ── MAIN GAME ──
  return (
    <div style={{
      minHeight: '100dvh', display: 'flex', flexDirection: 'column',
      maxWidth: 520, margin: '0 auto', padding: '0.75rem 1rem 1rem', boxSizing: 'border-box'
    }}>

      {/* Notification toasts */}
      <div style={{ position: 'fixed', top: '0.75rem', left: '50%', transform: 'translateX(-50%)', zIndex: 999, display: 'flex', flexDirection: 'column', gap: '0.4rem', width: '90%', maxWidth: 400 }}>
        {notifications.map(n => (
          <div key={n.id} style={{
            background: 'rgba(255,71,87,0.95)', color: '#fff',
            padding: '0.65rem 1.1rem', borderRadius: 'var(--radius)',
            fontWeight: 700, fontSize: '0.9rem', textAlign: 'center',
            boxShadow: '0 4px 20px rgba(255,71,87,0.4)', animation: 'pop-in 0.3s ease'
          }}>{n.msg}</div>
        ))}
      </div>

      {/* Header */}
      <div style={{ marginBottom: '0.75rem' }}>
        {endsAt && (
          <div style={{ marginBottom: '0.6rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Time left</span>
              <span style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: '0.95rem', color: timerColor, transition: 'color 0.3s' }}>
                {timeLeft !== null ? formatTimeLeft(timeLeft) : '—'}
              </span>
            </div>
            <div style={{ height: 6, borderRadius: 3, background: 'var(--surface2)', overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: 3, width: `${Math.max(timerPct, 0)}%`,
                background: timerColor, transition: 'width 0.5s linear, background 0.3s'
              }} />
            </div>
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>Q{currentIdx + 1}</div>
          <div style={{
            fontFamily: 'Syne', fontWeight: 800, fontSize: '1.15rem', color: 'var(--yellow, #ffaa32)',
            padding: '0.25rem 0.75rem', background: 'rgba(255,170,50,0.1)',
            borderRadius: 'var(--radius)', border: '1px solid rgba(255,170,50,0.25)'
          }}>🪙 {gold.toLocaleString()}</div>
          <div style={{ fontSize: '0.82rem', color: 'var(--muted)', fontWeight: 600 }}>{rank ? `#${rank}` : '—'}</div>
        </div>
      </div>

      {/* QUESTION + ANSWERS */}
      {(phase === 'question' || phase === 'wrong') && q && (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
          <div style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius)', padding: '1rem 1.1rem', marginBottom: '0.85rem'
          }}>
            <p style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: '1.1rem', lineHeight: 1.45, margin: 0 }}>
              {q.question_text}
            </p>
          </div>

          {/* 2x2 grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.55rem', marginBottom: '0.85rem' }}>
            {optKeys.map((key, i) => {
              let extra = ''
              if (answered) {
                if (i === q.correct_index) extra = 'correct-reveal'
                else if (i === myAnswer && i !== q.correct_index) extra = 'wrong-reveal'
              }
              return (
                <button key={key} className={`opt-btn opt-${i} ${extra}`}
                  disabled={answered}
                  onClick={() => submitAnswer(i)}
                  style={{ minHeight: 72, fontSize: '1rem', padding: '0.7rem 0.75rem', textAlign: 'left' }}>
                  <span className="opt-label-pill">{optLabels[i]}</span>
                  {q[key]}
                </button>
              )
            })}
          </div>

          {phase === 'wrong' && (
            <div style={{ marginTop: 'auto' }}>
              <div style={{
                borderRadius: 'var(--radius)', padding: '0.9rem 1.1rem',
                background: 'rgba(255,71,87,0.12)', border: '1px solid rgba(255,71,87,0.3)',
                marginBottom: '0.65rem'
              }}>
                <p style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--red)', marginBottom: q.explanation ? '0.4rem' : 0 }}>
                  Not quite — no gold this round
                </p>
                {q.explanation && (
                  <p style={{ fontSize: '0.85rem', color: 'var(--muted)', lineHeight: 1.5, margin: 0 }}>💡 {q.explanation}</p>
                )}
              </div>
              <p style={{ fontSize: '0.82rem', color: 'var(--muted)', marginBottom: '0.5rem' }}>
                Correct answer: <strong style={{ color: 'var(--text)' }}>{optLabels[q.correct_index]}</strong>
              </p>
              <button className="btn btn-primary btn-full" onClick={nextQuestion}>Next question →</button>
            </div>
          )}
        </div>
      )}

      {/* CHEST PICK */}
      {phase === 'chests' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', textAlign: 'center' }}>
          <div style={{
            borderRadius: 'var(--radius)', padding: '0.85rem 1.1rem',
            background: 'rgba(0,229,160,0.12)', border: '1px solid rgba(0,229,160,0.35)', marginBottom: '1rem'
          }}>
            <p style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--green)', margin: 0 }}>Correct!</p>
            {streak > 1 && <p style={{ fontSize: '0.85rem', color: 'var(--green)', marginTop: '0.2rem', margin: 0 }}>🔥 {streak} in a row!</p>}
          </div>
          <p style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: '1.3rem', marginBottom: '1.1rem' }}>Pick a chest!</p>
          <div style={{ display: 'flex', gap: '0.85rem', justifyContent: 'center', flex: 1, alignItems: 'center' }}>
            {chests.map((_, i) => (
              <button key={i} onClick={() => pickChestOption(i)} disabled={pickedChest !== null}
                style={{
                  width: 110, height: 120, borderRadius: 'var(--radius)',
                  background: CHEST_COLORS[i].bg, border: `2px solid ${CHEST_COLORS[i].border}`,
                  cursor: pickedChest !== null ? 'default' : 'pointer',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  gap: '0.4rem', transition: 'all 0.2s', fontSize: '2.5rem',
                  boxShadow: pickedChest === null ? `0 0 24px ${CHEST_COLORS[i].glow}` : 'none',
                  transform: pickedChest === null ? 'scale(1)' : pickedChest === i ? 'scale(1.08)' : 'scale(0.9)',
                  opacity: pickedChest !== null && pickedChest !== i ? 0.35 : 1,
                }}>
                <span>🎁</span>
                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--muted)' }}>{i + 1}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* CHEST REVEAL */}
      {phase === 'reveal' && chestResult && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', textAlign: 'center' }}>
          <div style={{
            borderRadius: 'var(--radius)', padding: '1.5rem',
            background: revealBg, border: `1px solid ${revealBorder}`,
            marginBottom: '0.85rem', flex: 1, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center'
          }}>
            <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>{chestResult.emoji}</div>
            <p style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: '1.35rem', color: revealColor, margin: 0 }}>
              {chestResult.label}
            </p>
            {(chestResult.type === 'steal' || chestResult.type === 'swap') && actionTarget && (
              <p style={{ fontSize: '0.88rem', color: 'var(--muted)', marginTop: '0.4rem', margin: '0.4rem 0 0' }}>
                {chestResult.type === 'swap' ? 'Swapped with' : 'From'} {actionTarget.avatar} {actionTarget.nickname}
              </p>
            )}
          </div>
          <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'center', marginBottom: '0.85rem' }}>
            {chests.map((c, i) => (
              <div key={i} style={{
                flex: 1, padding: '0.4rem 0.5rem', borderRadius: 8, fontSize: '0.78rem',
                background: i === pickedChest ? 'rgba(255,170,50,0.15)' : 'rgba(136,136,170,0.07)',
                border: i === pickedChest ? '1px solid rgba(255,170,50,0.4)' : '1px solid var(--border)',
                fontWeight: i === pickedChest ? 700 : 400,
                color: i === pickedChest ? 'var(--yellow, #ffaa32)' : 'var(--muted)', textAlign: 'center'
              }}>
                {c.emoji}<br />{c.label}
              </div>
            ))}
          </div>
          <button className="btn btn-primary btn-full" onClick={nextQuestion}>Next question →</button>
        </div>
      )}
    </div>
  )
}
