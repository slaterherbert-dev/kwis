import React, { useEffect, useState, useRef } from 'react'
import { supabase } from '../supabase'

// ── Chest reward logic ──
const CHEST_TABLE = [
  { type: 'gold', amount: 1, weight: 20, label: '+1 gold', emoji: '🪙' },
  { type: 'gold', amount: 2, weight: 25, label: '+2 gold', emoji: '🪙' },
  { type: 'gold', amount: 3, weight: 18, label: '+3 gold', emoji: '💰' },
  { type: 'gold', amount: 5, weight: 8, label: '+5 gold', emoji: '💎' },
  { type: 'gold', amount: 10, weight: 3, label: '+10 gold!', emoji: '👑' },
  { type: 'steal', amount: 0, weight: 12, label: 'Steal!', emoji: '🏴‍☠️' },
  { type: 'nothing', amount: 0, weight: 14, label: 'Empty…', emoji: '💨' },
]

function pickReward() {
  const totalWeight = CHEST_TABLE.reduce((s, r) => s + r.weight, 0)
  let roll = Math.random() * totalWeight
  for (const r of CHEST_TABLE) {
    roll -= r.weight
    if (roll <= 0) return { ...r }
  }
  return { ...CHEST_TABLE[0] }
}

function generateChests() {
  return [pickReward(), pickReward(), pickReward()]
}

function shuffleArray(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

const CHEST_COLORS = [
  { bg: 'rgba(255,170,50,0.15)', border: 'rgba(255,170,50,0.45)', glow: 'rgba(255,170,50,0.3)' },
  { bg: 'rgba(108,99,255,0.15)', border: 'rgba(108,99,255,0.45)', glow: 'rgba(108,99,255,0.3)' },
  { bg: 'rgba(0,229,160,0.15)', border: 'rgba(0,229,160,0.45)', glow: 'rgba(0,229,160,0.3)' },
]

export default function GoldQuestStudent({ go, gameSession, player, setPlayer }) {
  const [session, setSession] = useState(gameSession)
  const [questions, setQuestions] = useState([])
  const [shuffledOrder, setShuffledOrder] = useState([])
  const [currentIdx, setCurrentIdx] = useState(0)
  const [phase, setPhase] = useState('question') // question | wrong | chests | reveal | done | final-standings
  const [myAnswer, setMyAnswer] = useState(null)
  const [answered, setAnswered] = useState(false)
  const [gold, setGold] = useState(0)
  const [chests, setChests] = useState([])
  const [pickedChest, setPickedChest] = useState(null)
  const [chestResult, setChestResult] = useState(null)
  const [stolenFrom, setStolenFrom] = useState(null)
  const [stolenAlert, setStolenAlert] = useState(null)
  const [rank, setRank] = useState(null)
  const [streak, setStreak] = useState(0)
  // Final standings state
  const [finalPlayers, setFinalPlayers] = useState([])
  const pollRef = useRef(null)

  useEffect(() => {
    loadQuestions()

    const sub = supabase.channel('gq-student-' + gameSession.id)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'game_sessions', filter: `id=eq.${gameSession.id}` }, (payload) => {
        const s = payload.new
        setSession(s)
        if (s.phase === 'ended' || s.phase === 'gold_quest_ended') {
          loadFinalStandings()
        }
      })
      .subscribe()

    pollRef.current = setInterval(checkForSteals, 3000)

    return () => {
      supabase.removeChannel(sub)
      clearInterval(pollRef.current)
    }
  }, [])

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

  async function checkForSteals() {
    const { data } = await supabase.from('players').select('score').eq('id', player.id).single()
    if (data && data.score < gold) {
      setStolenAlert({ amount: gold - data.score })
      setGold(data.score)
      setTimeout(() => setStolenAlert(null), 3000)
    }
  }

  async function submitAnswer(idx) {
    if (answered) return
    setAnswered(true)
    setMyAnswer(idx)

    const qIdx = shuffledOrder[currentIdx]
    const q = questions[qIdx]
    if (!q) return

    const isCorrect = idx === q.correct_index

    await supabase.from('answers').insert([{
      session_id: gameSession.id,
      player_id: player.id,
      question_id: q.id,
      question_index: qIdx,
      answer_given: idx,
      is_correct: isCorrect,
      points_earned: 0
    }])

    if (isCorrect) {
      setStreak(s => s + 1)
      setChests(generateChests())
      setPickedChest(null)
      setChestResult(null)
      setStolenFrom(null)
      setTimeout(() => setPhase('chests'), 800)
    } else {
      setStreak(0)
      setPhase('wrong')
    }
  }

  async function pickChestOption(idx) {
    if (pickedChest !== null) return
    setPickedChest(idx)
    const reward = chests[idx]

    let goldDelta = 0
    let stealTarget = null

    if (reward.type === 'gold') {
      goldDelta = reward.amount
    } else if (reward.type === 'steal') {
      const { data: others } = await supabase.from('players')
        .select('*')
        .eq('session_id', gameSession.id)
        .neq('id', player.id)
        .gt('score', 0)
      if (others && others.length > 0) {
        const victim = others[Math.floor(Math.random() * others.length)]
        const stealAmount = Math.min(Math.max(1, Math.floor(victim.score * 0.3)), 5)
        goldDelta = stealAmount
        stealTarget = victim
        await supabase.from('players').update({ score: victim.score - stealAmount }).eq('id', victim.id)
        setStolenFrom({ nickname: victim.nickname, avatar: victim.avatar, amount: stealAmount })
        reward.label = `Stole ${stealAmount} gold!`
      } else {
        goldDelta = 1
        reward.type = 'gold'
        reward.label = '+1 gold'
        reward.emoji = '🪙'
      }
    }

    const newGold = gold + goldDelta
    setGold(newGold)
    setChestResult(reward)

    await supabase.from('players').update({ score: newGold }).eq('id', player.id)

    const { data: allPlayers } = await supabase.from('players').select('score').eq('session_id', gameSession.id).order('score', { ascending: false })
    const myRank = (allPlayers || []).findIndex(p => p.score <= newGold) + 1 || allPlayers?.length || 1
    setRank(myRank)

    setPhase('reveal')
  }

  function nextQuestion() {
    const next = currentIdx + 1
    if (next >= questions.length) {
      // Loop — reshuffle and restart instead of ending
      setShuffledOrder(shuffleArray(questions.map((_, i) => i)))
      setCurrentIdx(0)
    } else {
      setCurrentIdx(next)
    }
    setMyAnswer(null)
    setAnswered(false)
    setPhase('question')
  }

  // ── Derived state ──
  const qIdx = shuffledOrder[currentIdx]
  const q = questions[qIdx]
  const optLabels = ['A', 'B', 'C', 'D']
  const optKeys = ['option_a', 'option_b', 'option_c', 'option_d']
  const progress = questions.length > 0 ? (currentIdx / questions.length) * 100 : 0

  // ── Loading ──
  if (!q && phase !== 'final-standings') return (
    <div className="screen centered">
      <div className="dot-row"><div className="dot" /><div className="dot" /><div className="dot" /></div>
    </div>
  )

  // ── FINAL STANDINGS (teacher ended the game) ──
  if (phase === 'final-standings') {
    const myEntry = finalPlayers.find(p => p.id === player.id)
    const myFinalRank = finalPlayers.findIndex(p => p.id === player.id) + 1
    const podiumOrder = [finalPlayers[1], finalPlayers[0], finalPlayers[2]].filter(Boolean)
    const podiumClasses = ['p2', 'p1', 'p3']
    const podiumEmojis = ['🥈', '🥇', '🥉']

    return (
      <div className="screen" style={{ maxWidth: 500, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '1.5rem', paddingTop: '1rem' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '0.4rem' }}>🪙</div>
          <h1 className="gradient-text" style={{ fontSize: '2rem', fontWeight: 800, fontFamily: 'Syne', marginBottom: '0.25rem' }}>
            Gold Quest Over!
          </h1>
          <p style={{ color: 'var(--muted)', fontSize: '0.88rem' }}>Final standings</p>
        </div>

        {/* Your result callout */}
        {myEntry && (
          <div style={{
            background: myFinalRank === 1 ? 'rgba(255,170,50,0.15)' : 'rgba(108,99,255,0.1)',
            border: myFinalRank === 1 ? '2px solid rgba(255,170,50,0.5)' : '1px solid var(--accent)',
            borderRadius: 'var(--radius)', padding: '1rem 1.25rem', marginBottom: '1.5rem', textAlign: 'center'
          }}>
            <p style={{ fontSize: '0.82rem', color: 'var(--muted)', marginBottom: '0.3rem' }}>Your result</p>
            <p style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: '1.8rem', color: 'var(--yellow, #ffaa32)' }}>
              🪙 {myEntry.score.toLocaleString()} gold
            </p>
            <p style={{ fontSize: '0.9rem', color: 'var(--muted)', marginTop: '0.25rem' }}>
              {myFinalRank === 1 ? '🏆 You won!' : myFinalRank === 2 ? '🥈 Runner-up!' : myFinalRank === 3 ? '🥉 Third place!' : `Rank #${myFinalRank}`}
            </p>
          </div>
        )}

        {/* Podium */}
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

        {/* Full leaderboard */}
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

        <button className="btn btn-primary btn-full" onClick={() => go('landing')}>
          Back to home
        </button>
      </div>
    )
  }

  // ── DONE (finished all questions before timer ran out) ──
  if (phase === 'done') return (
    <div className="screen centered" style={{ maxWidth: 420, margin: '0 auto', textAlign: 'center' }}>
      <div style={{ fontSize: '3.5rem', marginBottom: '0.5rem' }}>🏆</div>
      <h2 className="gradient-text" style={{ fontSize: '1.8rem', fontWeight: 800, fontFamily: 'Syne', marginBottom: '0.5rem' }}>All done!</h2>
      <div className="card" style={{ marginBottom: '1.25rem', padding: '1.5rem' }}>
        <p style={{ fontSize: '2.2rem', fontWeight: 800, fontFamily: 'Syne', color: 'var(--yellow, #ffaa32)' }}>
          🪙 {gold.toLocaleString()} gold
        </p>
        {rank && <p style={{ color: 'var(--muted)', fontSize: '0.9rem', marginTop: '0.35rem' }}>Current rank: #{rank}</p>}
      </div>
      <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>Waiting for the teacher to end the game…</p>
      <div className="dot-row" style={{ marginTop: '1rem' }}>
        <div className="dot" /><div className="dot" /><div className="dot" />
      </div>
    </div>
  )

  return (
    <div className="screen" style={{ maxWidth: 500, margin: '0 auto' }}>
      <div className="progress-bar"><div className="progress-fill" style={{ width: `${progress}%` }} /></div>

      {/* Stolen alert toast */}
      {stolenAlert && (
        <div style={{
          position: 'fixed', top: '1rem', left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(255,71,87,0.95)', color: '#fff', padding: '0.75rem 1.5rem',
          borderRadius: 'var(--radius)', fontWeight: 700, fontSize: '0.95rem', zIndex: 999,
          boxShadow: '0 4px 20px rgba(255,71,87,0.4)', animation: 'pop-in 0.3s ease'
        }}>
          🏴‍☠️ Someone stole {stolenAlert.amount} gold from you!
        </div>
      )}

      {/* Header — gold + progress */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
        <div style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>Q{currentIdx + 1} / {questions.length}</div>
        <div className="card-sm" style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: '1rem', padding: '0.35rem 0.85rem', color: 'var(--yellow, #ffaa32)' }}>
          🪙 {gold.toLocaleString()}
        </div>
        <div style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>{rank ? `#${rank}` : '—'}</div>
      </div>

      {/* ── QUESTION PHASE ── */}
      {(phase === 'question' || phase === 'wrong') && (
        <>
          <div className="card" style={{ marginBottom: '1.1rem', padding: '1rem 1.1rem' }}>
            <p style={{ fontFamily: 'Syne', fontWeight: 600, fontSize: '1.05rem', lineHeight: 1.45 }}>{q.question_text}</p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginBottom: '1rem' }}>
            {optKeys.map((key, i) => {
              let extra = ''
              if (answered) {
                if (i === q.correct_index) extra = 'correct-reveal'
                else if (i === myAnswer && i !== q.correct_index) extra = 'wrong-reveal'
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

          {/* Wrong answer feedback */}
          {phase === 'wrong' && (
            <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
              <div style={{
                borderRadius: 'var(--radius)', padding: '1rem 1.25rem',
                background: 'rgba(255,71,87,0.12)', border: '1px solid rgba(255,71,87,0.3)',
                marginBottom: '0.75rem'
              }}>
                <p style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--red)' }}>✗ Not quite — no gold this round</p>
                {q.explanation && (
                  <p style={{ fontSize: '0.85rem', color: 'var(--muted)', marginTop: '0.5rem', lineHeight: 1.5 }}>💡 {q.explanation}</p>
                )}
              </div>
              {streak === 0 && (
                <p style={{ fontSize: '0.82rem', color: 'var(--muted)', marginBottom: '0.5rem' }}>
                  The correct answer was <strong>{optLabels[q.correct_index]}</strong>
                </p>
              )}
              <button className="btn btn-primary" onClick={nextQuestion} style={{ marginTop: '0.25rem' }}>
                Next question →
              </button>
            </div>
          )}
        </>
      )}

      {/* ── CHEST PICK PHASE ── */}
      {phase === 'chests' && (
        <div style={{ textAlign: 'center' }}>
          <div style={{
            borderRadius: 'var(--radius)', padding: '1rem 1.25rem',
            background: 'rgba(0,229,160,0.12)', border: '1px solid rgba(0,229,160,0.35)',
            marginBottom: '1.25rem'
          }}>
            <p style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--green)' }}>✓ Correct!</p>
            {streak > 1 && <p style={{ fontSize: '0.85rem', color: 'var(--green)', marginTop: '0.25rem' }}>🔥 {streak} in a row!</p>}
          </div>

          <p style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: '1.15rem', marginBottom: '1rem' }}>
            Pick a chest!
          </p>

          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', marginBottom: '1rem' }}>
            {chests.map((_, i) => (
              <button key={i} onClick={() => pickChestOption(i)} disabled={pickedChest !== null}
                style={{
                  width: 100, height: 110, borderRadius: 'var(--radius)',
                  background: CHEST_COLORS[i].bg, border: `2px solid ${CHEST_COLORS[i].border}`,
                  cursor: pickedChest !== null ? 'default' : 'pointer',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  gap: '0.35rem', transition: 'all 0.2s', fontSize: '2.2rem',
                  boxShadow: pickedChest === null ? `0 0 20px ${CHEST_COLORS[i].glow}` : 'none',
                  transform: pickedChest === null ? 'scale(1)' : pickedChest === i ? 'scale(1.08)' : 'scale(0.92)',
                  opacity: pickedChest !== null && pickedChest !== i ? 0.4 : 1,
                }}>
                <span>🎁</span>
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--muted)' }}>{i + 1}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── CHEST REVEAL PHASE ── */}
      {phase === 'reveal' && chestResult && (
        <div style={{ textAlign: 'center' }}>
          <div style={{
            borderRadius: 'var(--radius)', padding: '1.5rem',
            background: chestResult.type === 'nothing' ? 'rgba(136,136,170,0.1)' : chestResult.type === 'steal' ? 'rgba(255,71,87,0.12)' : 'rgba(255,170,50,0.12)',
            border: `1px solid ${chestResult.type === 'nothing' ? 'var(--border)' : chestResult.type === 'steal' ? 'rgba(255,71,87,0.35)' : 'rgba(255,170,50,0.4)'}`,
            marginBottom: '1rem'
          }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>{chestResult.emoji}</div>
            <p style={{
              fontFamily: 'Syne', fontWeight: 800, fontSize: '1.4rem',
              color: chestResult.type === 'nothing' ? 'var(--muted)' : chestResult.type === 'steal' ? 'var(--red)' : 'var(--yellow, #ffaa32)'
            }}>
              {chestResult.label}
            </p>
            {chestResult.type === 'steal' && stolenFrom && (
              <p style={{ fontSize: '0.88rem', color: 'var(--muted)', marginTop: '0.4rem' }}>
                Stole from {stolenFrom.avatar} {stolenFrom.nickname}
              </p>
            )}
            {chestResult.amount >= 5 && chestResult.type === 'gold' && (
              <p style={{ fontSize: '0.82rem', color: 'var(--muted)', marginTop: '0.3rem' }}>Jackpot! 🎉</p>
            )}
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', marginBottom: '1rem' }}>
            {chests.map((c, i) => (
              <div key={i} style={{
                padding: '0.4rem 0.7rem', borderRadius: 8, fontSize: '0.78rem',
                background: i === pickedChest ? 'rgba(255,170,50,0.2)' : 'rgba(136,136,170,0.08)',
                border: i === pickedChest ? '1px solid rgba(255,170,50,0.4)' : '1px solid var(--border)',
                fontWeight: i === pickedChest ? 700 : 400,
                color: i === pickedChest ? 'var(--yellow, #ffaa32)' : 'var(--muted)'
              }}>
                {c.emoji} {c.label}
              </div>
            ))}
          </div>

          <button className="btn btn-primary" onClick={nextQuestion}>
            {currentIdx + 1 >= questions.length ? 'Finish!' : 'Next question →'}
          </button>
        </div>
      )}
    </div>
  )
}
