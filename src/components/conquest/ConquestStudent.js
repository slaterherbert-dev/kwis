import React, { useEffect, useRef, useState } from 'react'
import { supabase } from '../../supabase'
import HexMap from './HexMap'
import QuestionImage from '../QuestionImage'
import { preloadImage } from '../../lib/questionImages'
import { seededShuffleIndices } from '../../lib/shuffle'
import { getMap, bannerOf, atPlace, landPlace, COSTS, MAX_WALLS, TREBUCHET_STREAK, WRONG_WAIT_SECONDS } from '../../lib/conquest'
import './Conquest.css'

// ═══════════════════════════════════════════════════════════════
// CONQUEST — STUDENT CHROMEBOOK SCREEN
// Answer questions for gold, then spend it on the map. Every move is
// checked by the database (kwis-conquest-setup.sql), so this screen
// just asks and shows what happened.
// ═══════════════════════════════════════════════════════════════

const OPT_LABELS = ['A', 'B', 'C', 'D']
const OPT_KEYS = ['option_a', 'option_b', 'option_c', 'option_d']

const ERRORS = {
  gold: 'Not enough gold yet. Answer more questions!',
  not_adjacent: 'That land isn’t next to yours.',
  taken: 'Someone just claimed that one.',
  homeland: 'Homelands can’t be captured.',
  cooldown: 'That land was just captured. Try again in a few seconds.',
  shielded: 'That player just lost land, so they’re shielded for a moment.',
  max_walls: 'That tile already has 3 walls.',
  no_trebuchet: 'You need a Trebuchet for that. Get 3 right in a row!',
  not_live: 'The game isn’t running right now.',
  empty: 'Nobody owns that land. Claim it instead!',
  own: 'That’s already yours.',
}

function shuffle(n) {
  const a = Array.from({ length: n }, (_, i) => i)
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export default function ConquestStudent({ go, gameSession, player }) {
  const { byId } = getMap()
  const [session, setSession] = useState(gameSession)
  const [questions, setQuestions] = useState([])
  const [order, setOrder] = useState([])
  const [pos, setPos] = useState(0)
  const [me, setMe] = useState(null)              // { banner, gold, streak, trebuchets, tiles }
  const [tiles, setTiles] = useState({})
  const [phase, setPhase] = useState('answer')    // answer | feedback
  const [chosen, setChosen] = useState(null)
  const [feedback, setFeedback] = useState(null)
  const [nextAt, setNextAt] = useState(0)
  const [selected, setSelected] = useState(null)
  const [toast, setToast] = useState(null)
  const [busy, setBusy] = useState(false)
  const [acting, setActing] = useState(false)
  const [now, setNow] = useState(Date.now())
  const [joinError, setJoinError] = useState('')
  const [kicked, setKicked] = useState(false)
  const myBannerRef = useRef(null)
  const toastTimer = useRef(null)

  function showToast(text, kind = '') {
    clearTimeout(toastTimer.current)
    setToast({ text, kind })
    toastTimer.current = setTimeout(() => setToast(null), 4500)
  }

  async function loadTiles() {
    const { data } = await supabase.from('cq_tiles')
      .select('tile_id, owner, owner_banner, walls, is_homeland, locked_until, shield_until')
      .eq('session_id', gameSession.id)
    const m = {}
    ;(data || []).forEach(t => { m[t.tile_id] = t })
    setTiles(m)
  }

  async function join(attempt = 0) {
    const { data, error } = await supabase.rpc('cq_join', { p_session: gameSession.id, p_player: player.id })
    if (error) { setJoinError('Couldn’t connect to the game. Check your Wi-Fi.'); setTimeout(() => join(attempt + 1), 3000); return }
    if (data && data.error === 'not_started') { setTimeout(() => join(attempt + 1), 2000); return }
    if (data && data.error) { setJoinError(data.error === 'map_full' ? 'The map is full right now.' : 'You’re not in this game. Rejoin with the PIN.'); return }
    setJoinError('')
    setMe(data)
    myBannerRef.current = data.banner
    loadTiles()
  }

  useEffect(() => {
    (async () => {
      const { data: qs } = await supabase.from('questions').select('*').eq('set_id', gameSession.set_id).order('position').order('id')
      setQuestions(qs || [])
      setOrder(shuffle((qs || []).length))
      const { data: fresh } = await supabase.from('game_sessions').select('*').eq('id', gameSession.id).single()
      if (fresh) {
        setSession(fresh)
        if (fresh.phase === 'ended' || fresh.phase === 'final') { go('student-final'); return }
      }
      join()
    })()

    const ch = supabase.channel('cq-student-' + gameSession.id + '-' + player.id)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'game_sessions', filter: `id=eq.${gameSession.id}` },
        payload => {
          setSession(payload.new)
          if (payload.new.phase === 'ended' || payload.new.phase === 'final') go('student-final')
        })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cq_tiles', filter: `session_id=eq.${gameSession.id}` },
        payload => { const t = payload.new; if (t && t.tile_id !== undefined) setTiles(prev => ({ ...prev, [t.tile_id]: t })) })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'cq_events', filter: `session_id=eq.${gameSession.id}` },
        payload => {
          const e = payload.new
          const mine = myBannerRef.current
          if (mine === null || e.target_banner !== mine) return
          const a = bannerOf(e.actor_banner)
          if (e.kind === 'capture' || e.kind === 'trebuchet-capture') {
            showToast(`⚔️ ${a.icon} ${a.name} captured ${landPlace(e.tile_id)} from you! Your land is shielded for 20 seconds.`, 'alert')
          } else if (e.kind === 'hit' || e.kind === 'trebuchet') {
            showToast(`⚠️ ${a.icon} ${a.name} broke a wall ${atPlace(e.tile_id)}!`, 'alert')
          } else if (e.kind === 'miss') {
            showToast(`🛡️ You held off ${a.icon} ${a.name} ${atPlace(e.tile_id)}.`, 'good')
          }
        })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'players', filter: `id=eq.${player.id}` },
        payload => { if (payload.new?.kicked) setKicked(true) })
      .subscribe()

    const tick = setInterval(() => setNow(Date.now()), 500)
    const poll = setInterval(loadTiles, 10000) // safety net if live updates drop
    return () => { supabase.removeChannel(ch); clearInterval(tick); clearInterval(poll); clearTimeout(toastTimer.current) }
  }, [])

  // ── Questions ──
  const qIdx = order[pos]
  const q = qIdx !== undefined ? questions[qIdx] : null
  const optOrder = q ? seededShuffleIndices(4, `${gameSession.id}-${q.id}`) : [0, 1, 2, 3]
  const endsAt = session?.ends_at ? Date.parse(session.ends_at) : null
  const over = !!endsAt && now >= endsAt

  useEffect(() => {
    const upcoming = questions[order[pos + 1]]
    if (upcoming) preloadImage(upcoming.image_url)
  }, [questions, order, pos])

  function nextQuestion() {
    setChosen(null)
    setFeedback(null)
    setPhase('answer')
    if (pos + 1 >= order.length) { setOrder(shuffle(questions.length)); setPos(0) }
    else setPos(p => p + 1)
  }

  async function answer(displayIdx) {
    if (busy || phase !== 'answer' || !q || !me || over) return
    setBusy(true)
    setChosen(displayIdx)
    const { data, error } = await supabase.rpc('cq_answer', {
      p_session: gameSession.id, p_player: player.id, p_question: q.id, p_question_index: qIdx, p_answer: optOrder[displayIdx]
    })
    setBusy(false)
    if (error || !data) { setChosen(null); showToast('Connection hiccup. Tap your answer again.', 'bad'); return }
    if (data.error === 'wait') { setChosen(null); return }
    if (data.error) { setChosen(null); showToast(ERRORS[data.error] || 'Something went wrong.', 'bad'); return }
    setMe(data)
    setFeedback({ correct: data.correct, gain: data.gain, underdog: data.underdog, newTreb: data.new_trebuchet, correctDisplay: optOrder.indexOf(data.correct_index) })
    setPhase('feedback')
    if (data.correct) setTimeout(nextQuestion, 1100)
    else setNextAt(Date.now() + WRONG_WAIT_SECONDS * 1000)
  }

  // ── Map ──
  const ownsNeighbor = id => (byId[id]?.neighbors || []).some(n => tiles[n]?.owner === player.id)
  const highlight = new Set()
  if (me && !over) {
    Object.values(tiles).forEach(t => {
      if (t.owner === player.id) return
      if (!ownsNeighbor(t.tile_id)) return
      if (!t.owner) highlight.add(t.tile_id)
      else if (!t.is_homeland) highlight.add(t.tile_id)
    })
  }

  async function act(kind, trebuchet = false) {
    if (acting || selected === null || over) return
    setActing(true)
    const fn = { claim: 'cq_claim', fortify: 'cq_fortify', attack: 'cq_attack' }[kind]
    const args = { p_session: gameSession.id, p_player: player.id, p_tile: selected }
    if (kind === 'attack') args.p_trebuchet = trebuchet
    const { data, error } = await supabase.rpc(fn, args)
    setActing(false)
    if (error || !data) { showToast('Connection hiccup. Try again.', 'bad'); return }
    if (data.error) { showToast(ERRORS[data.error] || 'That didn’t work. Try again.', 'bad'); return }
    setMe(data)
    const land = landPlace(selected)
    const dice = data.roll_a ? `🎲 You rolled ${data.roll_a}, they rolled ${data.roll_d}. ` : ''
    switch (data.result) {
      case 'claim': showToast(`🏳️ You claimed ${land}!`, 'good'); break
      case 'fortify': showToast(`🧱 Wall built (${data.walls_left} of ${MAX_WALLS}).`, 'good'); break
      case 'capture': showToast(`${dice}⚔️ You captured ${land}!`, 'good'); break
      case 'trebuchet-capture': showToast(`🪨 Your trebuchet captured ${land}!`, 'good'); break
      case 'hit': showToast(`${dice}A wall breaks! ${data.walls_left} left.`, 'good'); break
      case 'trebuchet': showToast(`🪨 Your trebuchet smashed 2 walls! ${data.walls_left} left.`, 'good'); break
      case 'miss': showToast(`${dice}They held! Try again.`, 'bad'); break
      default: break
    }
    loadTiles()
  }

  // ── Screens ──
  if (kicked) return (
    <div className="screen centered" style={{ textAlign: 'center' }}>
      <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🚫</div>
      <h2 style={{ fontFamily: 'Syne', fontSize: '1.6rem', fontWeight: 800, marginBottom: '0.5rem' }}>You were removed</h2>
      <p style={{ color: 'var(--muted)', marginBottom: '2rem', fontSize: '0.9rem' }}>Your teacher removed you from the game.</p>
      <button className="btn btn-primary" onClick={() => go('student-join')}>Rejoin →</button>
    </div>
  )

  if (!me) return (
    <div className="screen centered" style={{ textAlign: 'center' }}>
      <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>🏰</div>
      <p style={{ fontWeight: 700, marginBottom: '0.5rem' }}>{joinError || 'Finding you a homeland…'}</p>
      <div className="dot-row"><div className="dot" /><div className="dot" /><div className="dot" /></div>
    </div>
  )

  const b = bannerOf(me.banner)
  const myTiles = Object.values(tiles).filter(t => t.owner === player.id).length
  const sel = selected !== null ? tiles[selected] : null
  const selTile = selected !== null ? byId[selected] : null
  const left = endsAt ? Math.max(0, Math.ceil((endsAt - now) / 1000)) : null
  const protectedFor = t => {
    const until = Math.max(t?.shield_until ? Date.parse(t.shield_until) : 0, t?.locked_until ? Date.parse(t.locked_until) : 0)
    return until > now ? Math.ceil((until - now) / 1000) : 0
  }

  let actionPanel
  if (!sel) {
    actionPanel = <span className="cq-hint">{me.gold < COSTS.claim ? 'Answer questions to earn gold. ' : ''}Tap land with a dashed outline to claim or attack it. Tap your own land to build walls.</span>
  } else {
    const owner = bannerOf(sel.owner_banner)
    const adjacent = ownsNeighbor(selected)
    const mineTile = sel.owner === player.id
    let what, btns = null
    if (!sel.owner) {
      what = adjacent ? 'Empty land' : 'Empty land, not next to yours yet'
      if (adjacent) btns = <button className="btn btn-primary" disabled={acting || me.gold < COSTS.claim} onClick={() => act('claim')}>Claim · {COSTS.claim} 🪙</button>
    } else if (mineTile) {
      if (sel.is_homeland) what = 'Your homeland. It can’t be captured.'
      else {
        what = `Your land · ${sel.walls} of ${MAX_WALLS} walls`
        btns = <button className="btn btn-primary" disabled={acting || me.gold < COSTS.fortify || sel.walls >= MAX_WALLS} onClick={() => act('fortify')}>Build a wall · {COSTS.fortify} 🪙</button>
      }
    } else {
      const wait = protectedFor(sel)
      what = `${owner.icon} ${owner.name} · ${sel.is_homeland ? 'homeland, can’t be captured' : `${sel.walls} wall${sel.walls !== 1 ? 's' : ''}`}`
      if (!sel.is_homeland && !adjacent) what += ' · not next to your land'
      if (!sel.is_homeland && wait > 0) what += ` · protected for ${wait}s`
      if (!sel.is_homeland && adjacent) btns = (
        <>
          <button className="btn btn-primary" disabled={acting || wait > 0 || me.gold < COSTS.attack} onClick={() => act('attack')}>Attack · {COSTS.attack} 🪙</button>
          {me.trebuchets > 0 && (
            <button className="btn" disabled={acting || wait > 0 || me.gold < COSTS.attack} onClick={() => act('attack', true)}>🪨 Trebuchet · {COSTS.attack} 🪙</button>
          )}
        </>
      )
    }
    actionPanel = (
      <>
        <div>
          <div className="where">{selTile?.label || selTile?.place}</div>
          <div className="what">{what}</div>
        </div>
        {btns && <div className="btns">{btns}</div>}
      </>
    )
  }

  return (
    <div className="screen cq-screen">
      <div className="cq-student">
        {/* LEFT: who I am + questions */}
        <div>
          <div className="cq-me" style={{ '--banner': b.color }}>
            <span className="icon">{b.icon}</span>
            <div>
              <div className="name">You are the {b.name}</div>
              <div className="sub">Keep it secret! Names are revealed at the end.</div>
            </div>
            {left !== null && <div style={{ marginLeft: 'auto', fontFamily: 'Syne', fontWeight: 800, fontSize: '1.15rem' }}>{Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}</div>}
          </div>
          <div className="cq-stats">
            <div className="cq-stat cq-gold"><b>{me.gold}</b><span>gold</span></div>
            <div className="cq-stat"><b>{myTiles}</b><span>tiles</span></div>
            <div className="cq-stat"><b>{me.streak}</b><span>streak</span></div>
            <div className="cq-stat" title={`Every ${TREBUCHET_STREAK} right in a row earns one`}><b>{me.trebuchets}</b><span>🪨 trebuchets</span></div>
          </div>

          {phase === 'feedback' && feedback && (
            <div className={`cq-feedback ${feedback.correct ? 'good' : 'bad'}`} role="status">
              {feedback.correct
                ? <>Correct! +{feedback.gain} gold{feedback.underdog ? ' (underdog bonus)' : ''}{feedback.newTreb ? ' · 🪨 You earned a Trebuchet!' : ''}</>
                : <>Not quite. The answer was {OPT_LABELS[feedback.correctDisplay]}.</>}
              {!feedback.correct && q?.explanation && <p>💡 {q.explanation}</p>}
            </div>
          )}

          {q ? (
            <>
              <div className="card" style={{ padding: '0.9rem 1rem', marginBottom: '0.75rem' }}>
                <p style={{ fontFamily: 'Syne', fontWeight: 600, fontSize: '1.02rem', lineHeight: 1.45 }}>{q.question_text}</p>
              </div>
              <QuestionImage q={q} maxHeight="24vh" compact />
              <div className="cq-opts">
                {optOrder.map((origIdx, i) => {
                  let extra = ''
                  if (phase === 'feedback' && feedback) {
                    if (i === feedback.correctDisplay) extra = 'correct-reveal'
                    else if (i === chosen) extra = 'wrong-reveal'
                  } else if (i === chosen) extra = 'selected'
                  return (
                    <button key={OPT_KEYS[origIdx]} className={`opt-btn opt-${i} ${extra}`}
                      disabled={phase !== 'answer' || busy || over} onClick={() => answer(i)}>
                      <span className="opt-label-pill">{OPT_LABELS[i]}</span>
                      {q[OPT_KEYS[origIdx]]}
                    </button>
                  )
                })}
              </div>
              {phase === 'feedback' && feedback && !feedback.correct && (
                <button className="btn btn-primary btn-full" style={{ marginTop: '0.75rem' }}
                  disabled={now < nextAt} onClick={nextQuestion}>
                  {now < nextAt ? `Next question in ${Math.ceil((nextAt - now) / 1000)}…` : 'Next question'}
                </button>
              )}
            </>
          ) : (
            <p className="cq-hint">Loading questions…</p>
          )}
        </div>

        {/* RIGHT: the map */}
        <div>
          {toast && <div className={`cq-toast ${toast.kind}`} role="status">{toast.text}</div>}
          <HexMap state={tiles} myId={player.id} highlight={highlight} selected={selected}
            labels={false} now={now} onTap={id => setSelected(id === selected ? null : id)} />
          <div className="cq-action">{actionPanel}</div>
        </div>
      </div>

      {over && (
        <div className="cq-over">
          <div>
            <div style={{ fontSize: '3rem' }}>🏰</div>
            <h2 style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: '1.8rem', margin: '0.4rem 0' }}>Time’s up!</h2>
            <p style={{ color: '#d0d4e4' }}>You finished with {myTiles} tile{myTiles !== 1 ? 's' : ''}. Watch the board for the big reveal.</p>
          </div>
        </div>
      )}
    </div>
  )
}
