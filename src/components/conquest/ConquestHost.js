import React, { useEffect, useRef, useState } from 'react'
import { supabase } from '../../supabase'
import HexMap from './HexMap'
import { bannerOf, eventText, mapForSetup, COSTS, TREBUCHET_STREAK } from '../../lib/conquest'
import './Conquest.css'

// ═══════════════════════════════════════════════════════════════
// CONQUEST — TEACHER / PROJECTOR SCREEN
// Shows the live map, a leaderboard by banner, and a battle feed.
// Names stay hidden until the reveal at the end.
// All moves happen through database functions (kwis-conquest-setup.sql).
// ═══════════════════════════════════════════════════════════════

const SETUP_MESSAGE = 'Conquest needs a quick database update. Run kwis-conquest-setup.sql in Supabase (SQL Editor → New query → Run), then try again.'
const BIG_EVENTS = ['capture', 'trebuchet-capture']

export function ConquestRules() {
  return (
    <div className="cq-rules">
      <div className="cq-rule"><span>🪙</span><span>Answer questions to earn gold. Streaks pay more.</span></div>
      <div className="cq-rule"><span>🏳️</span><span>Claim empty land next to yours ({COSTS.claim} gold).</span></div>
      <div className="cq-rule"><span>🧱</span><span>Build walls on your land ({COSTS.fortify} gold, up to 3).</span></div>
      <div className="cq-rule"><span>🎲</span><span>Attack land next to yours ({COSTS.attack} gold). Win the dice roll to break a wall. No walls left, it’s yours.</span></div>
      <div className="cq-rule"><span>🪨</span><span>Every {TREBUCHET_STREAK} right in a row earns a Trebuchet: a sure hit that breaks 2 walls.</span></div>
      <div className="cq-rule"><span>🏰</span><span>Your homeland can’t be captured, so nobody gets knocked out.</span></div>
    </div>
  )
}

function fmt(sec) {
  const s = Math.max(0, Math.ceil(sec))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export default function ConquestHost({ session, players, duration, onEndGame }) {
  const [stage, setStage] = useState('intro') // intro | live | reveal
  const [tiles, setTiles] = useState({})
  const [events, setEvents] = useState([])
  const [flash, setFlash] = useState({})
  const [endsAt, setEndsAt] = useState(null)
  const [now, setNow] = useState(Date.now())
  const [busy, setBusy] = useState(false)
  const [finalPlayers, setFinalPlayers] = useState([])
  const [step, setStep] = useState(0)
  const finishedRef = useRef(false)

  // ── Data ──
  async function loadTiles() {
    const { data } = await supabase.from('cq_tiles')
      .select('tile_id, owner, owner_banner, walls, is_homeland, locked_until, shield_until')
      .eq('session_id', session.id)
    const m = {}
    ;(data || []).forEach(t => { m[t.tile_id] = t })
    setTiles(m)
    return m
  }

  // Latest moves for the battle feed (also a backup if live updates drop)
  async function loadEvents() {
    const { data } = await supabase.from('cq_events').select('*')
      .eq('session_id', session.id).order('id', { ascending: false }).limit(9)
    if (data) setEvents(data)
  }

  useEffect(() => {
    if (stage !== 'live') return
    const ch = supabase.channel('cq-host-' + session.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cq_tiles', filter: `session_id=eq.${session.id}` },
        payload => { const t = payload.new; if (t && t.tile_id !== undefined) setTiles(prev => ({ ...prev, [t.tile_id]: t })) })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'cq_events', filter: `session_id=eq.${session.id}` },
        payload => {
          const e = payload.new
          setEvents(prev => [e, ...prev].slice(0, 9))
          if (e.kind !== 'join') {
            setFlash(prev => ({ ...prev, [e.tile_id]: e.kind }))
            setTimeout(() => setFlash(prev => { const n = { ...prev }; delete n[e.tile_id]; return n }), 1500)
          }
        })
      .subscribe()
    const poll = setInterval(() => { loadTiles(); loadEvents() }, 8000) // safety net if live updates drop
    return () => { supabase.removeChannel(ch); clearInterval(poll) }
  }, [stage])

  // ── Clock ──
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(t)
  }, [])
  useEffect(() => {
    if (stage === 'live' && endsAt && now >= Date.parse(endsAt)) finish()
  }, [now, stage, endsAt])

  async function start() {
    setBusy(true)
    const { error } = await supabase.rpc('cq_setup', { p_session: session.id, p_tiles: mapForSetup() })
    if (error) { alert(SETUP_MESSAGE); setBusy(false); return }
    const ends = new Date(Date.now() + duration * 1000).toISOString()
    await supabase.from('game_sessions').update({ phase: 'question', ends_at: ends }).eq('id', session.id)
    setEndsAt(ends)
    await loadTiles()
    setStage('live')
    setBusy(false)
  }

  async function endNow() {
    if (!window.confirm('End the game now?')) return
    const ends = new Date().toISOString()
    await supabase.from('game_sessions').update({ ends_at: ends }).eq('id', session.id)
    finish()
  }

  async function finish() {
    if (finishedRef.current) return
    finishedRef.current = true
    setStage('reveal')
    const m = await loadTiles()
    const { data } = await supabase.from('players')
      .select('id, nickname, avatar, cq_banner, cq_gold, cq_captures, cq_comebacks, cq_walls_built')
      .eq('session_id', session.id).eq('kicked', false)
    const counts = {}
    Object.values(m).forEach(t => { if (t.owner) counts[t.owner] = (counts[t.owner] || 0) + 1 })
    const list = (data || []).filter(p => p.cq_banner !== null)
      .map(p => ({ ...p, tiles: counts[p.id] || 0 }))
      .sort((a, b) => b.tiles - a.tiles || b.cq_captures - a.cq_captures || b.cq_gold - a.cq_gold)
    setFinalPlayers(list)
    // Final score = tiles held, so the usual results screen and CSV rank correctly
    await Promise.all(list.map(p => supabase.from('players').update({ score: p.tiles }).eq('id', p.id)))
  }

  // ── Derived ──
  const holdings = {}
  Object.values(tiles).forEach(t => {
    if (t.owner_banner === null || t.owner_banner === undefined) return
    holdings[t.owner_banner] = (holdings[t.owner_banner] || 0) + 1
  })
  const board = Object.entries(holdings).map(([n, c]) => ({ b: bannerOf(Number(n)), c })).sort((a, b) => b.c - a.c)
  const most = board[0]?.c || 1
  const left = endsAt ? (Date.parse(endsAt) - now) / 1000 : duration
  const clockColor = left > 120 ? 'var(--text)' : left > 30 ? 'var(--yellow)' : 'var(--red)'

  const header = (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', marginBottom: '0.9rem', flexWrap: 'wrap' }}>
      <span style={{ fontSize: '1.6rem' }}>🏰</span>
      <h1 style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: '1.45rem' }}>Conquest</h1>
    </div>
  )

  // ── INTRO ──
  if (stage === 'intro') return (
    <div className="screen">
      <div className="container-wide cq-wide">
        {header}
        <div className="cq-host">
          <HexMap state={{}} labels now={now} />
          <div className="cq-side">
            <div className="cq-panel">
              <h3>How to play</h3>
              <ConquestRules />
            </div>
            <div className="cq-panel" style={{ fontSize: '0.9rem', color: 'var(--muted)' }}>
              {players.length} player{players.length !== 1 ? 's' : ''} ready · {Math.round(duration / 60)} minute game.
              Everyone plays under a secret banner. Names are revealed at the end.
            </div>
            <button className="btn btn-primary btn-full btn-lg" disabled={busy} onClick={start}>
              {busy ? 'Setting up the map…' : 'Start the clock'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )

  // ── LIVE ──
  if (stage === 'live') return (
    <div className="screen">
      <div className="container-wide cq-wide">
        {header}
        <div className="cq-host">
          <HexMap state={tiles} flash={flash} labels now={now} />
          <div className="cq-side">
            <div className="cq-panel">
              <div className="cq-clock" style={{ color: clockColor }}>{fmt(left)}</div>
            </div>
            <div className="cq-panel">
              <h3>Biggest empires</h3>
              {board.length === 0 && <p className="cq-hint">Waiting for players to found their homelands…</p>}
              {board.slice(0, 8).map(({ b, c }) => (
                <div key={b.n}>
                  <div className="cq-board-row">
                    <span className="cq-swatch" style={{ background: b.color }} />
                    <span>{b.icon} {b.name}</span>
                    <span className="n">{c}</span>
                  </div>
                  <div className="cq-bar" style={{ width: `calc(${(c / most) * 100}% - 1.4rem)`, background: b.color }} />
                </div>
              ))}
            </div>
            <div className="cq-panel">
              <h3>Battle feed</h3>
              <div className="cq-feed">
                {events.length === 0 && <p className="cq-hint">Moves will show up here.</p>}
                {events.map(e => (
                  <div key={e.id} className={`cq-feed-item ${BIG_EVENTS.includes(e.kind) ? 'big' : ''}`}>{eventText(e)}</div>
                ))}
              </div>
            </div>
            <button className="btn" onClick={endNow}>End the game now</button>
          </div>
        </div>
      </div>
    </div>
  )

  // ── REVEAL ──
  const top = finalPlayers.slice(0, 3)
  const comeback = [...finalPlayers].filter(p => p.cq_comebacks > 0).sort((a, b) => b.cq_comebacks - a.cq_comebacks || b.tiles - a.tiles)[0]
  const builder = [...finalPlayers].filter(p => p.cq_walls_built > 0).sort((a, b) => b.cq_walls_built - a.cq_walls_built || b.tiles - a.tiles)[0]
  const placeOrder = [0, 1, 2].filter(i => top[i]) // champion on top
  const revealOrder = [2, 1, 0].filter(i => top[i]) // 3rd first, champion last
  const shown = i => revealOrder.indexOf(i) < step
  const allPlacesShown = step >= revealOrder.length
  const awardsShown = step > revealOrder.length
  const nextLabel = !allPlacesShown
    ? `Reveal ${['the champion', '2nd place', '3rd place'][revealOrder[step]]}`
    : !awardsShown ? 'Reveal the awards' : null

  const card = (p, title, stat, isShown, key) => {
    const b = bannerOf(p.cq_banner)
    return (
      <div key={key} className={`cq-reveal ${isShown ? '' : 'hidden'}`} style={{ '--banner': b.color }}>
        <div className="place">{title}</div>
        <div className="banner">{b.icon} {b.name}</div>
        <div className="who">{isShown ? `${p.avatar || ''} ${p.nickname}` : 'was…?'}</div>
        <div className="stat">{stat}</div>
      </div>
    )
  }

  return (
    <div className="screen">
      <div className="container-wide cq-wide">
        {header}
        <div className="cq-host">
          <HexMap state={tiles} labels now={now} />
          <div className="cq-side">
            <div className="cq-panel">
              <div className="cq-clock" style={{ fontSize: '2rem' }}>Time’s up!</div>
            </div>
            {top.length === 0 && <div className="cq-panel cq-hint">Loading final results…</div>}
            {placeOrder.map(i => card(top[i], ['Champion', '2nd place', '3rd place'][i],
              `${top[i].tiles} tiles · ${top[i].cq_captures} captures`, shown(i), 'p' + i))}
            {awardsShown && comeback && card(comeback, 'Biggest Comeback', `Won back ${comeback.cq_comebacks} tiles after losing land`, true, 'cb')}
            {awardsShown && builder && card(builder, 'Master Builder', `Built ${builder.cq_walls_built} walls`, true, 'mb')}
            {nextLabel
              ? <button className="btn btn-primary btn-full btn-lg" disabled={top.length === 0} onClick={() => setStep(s => s + 1)}>{nextLabel}</button>
              : <button className="btn btn-primary btn-full btn-lg" onClick={onEndGame}>Show full results</button>}
          </div>
        </div>
      </div>
    </div>
  )
}
