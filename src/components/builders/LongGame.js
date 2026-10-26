import React, { useMemo, useState } from 'react'
import { EMPIRES, ERAS, STATS, STAT_MAX } from '../../lib/longGame'
import { useSaved, useKeys, useCountdown, TimerDisplay, chime, Choices } from './common'
import './LongGame.css'

// ═══════════════════════════════════════════════════════════════
// THE LONG GAME — Phase 1. Projector only: each table is an empire,
// decides on paper, and the teacher clicks in its choice. Everything is
// saved in this browser, so a refresh (or the next class day) picks up
// where you left off. All the history is in src/lib/longGame.js.
// ═══════════════════════════════════════════════════════════════

const NEW_GAME = { phase: 'setup', era: 0, inPlay: EMPIRES.map(e => e.id), choices: {}, revealIdx: 0 }
const TIME_OPTIONS = [{ label: '5:00', value: 300 }, { label: '7:00', value: 420 }, { label: '10:00', value: 600 }]
const empire = id => EMPIRES.find(e => e.id === id)
const clamp = n => Math.max(0, Math.min(STAT_MAX, n))
const power = s => STATS.reduce((sum, st) => sum + s[st.key], 0)

function add(stats, effects) {
  const out = { ...stats }
  Object.entries(effects || {}).forEach(([k, v]) => { out[k] = clamp(out[k] + v) })
  return out
}

// Stats for every empire after eras [0 .. throughEra], counting events only for finished eras
function computeStats(game, throughEra, withEventsOfLast = true) {
  const s = {}
  game.inPlay.forEach(id => { s[id] = { ...empire(id).start } })
  for (let i = 0; i <= throughEra; i++) {
    const era = ERAS[i]
    const picks = game.choices[era.n] || {}
    game.inPlay.forEach(id => {
      const c = era.cards[id]?.choices.find(ch => ch.id === picks[id])
      if (c) s[id] = add(s[id], c.effects)
    })
    if (i < throughEra || withEventsOfLast) {
      era.events.forEach(ev => Object.entries(ev.effects).forEach(([id, fx]) => { if (s[id]) s[id] = add(s[id], fx) }))
    }
  }
  return s
}

function Deltas({ effects }) {
  const list = STATS.filter(st => effects && effects[st.key])
  if (list.length === 0) return <span className="lg-delta zero">No change</span>
  return list.map(st => (
    <span key={st.key} className={`lg-delta ${effects[st.key] > 0 ? 'up' : 'down'}`}>
      {effects[st.key] > 0 ? '+' : ''}{effects[st.key]} {st.label}
    </span>
  ))
}

export default function LongGame() {
  const [game, setGame] = useSaved('lg-game', NEW_GAME)
  const [seconds, setSeconds] = useSaved('lg-seconds', 420)
  const [openId, setOpenId] = useState(null)
  const timer = useCountdown(() => chime())
  const era = ERAS[game.era]
  const picks = game.choices[era.n] || {}
  const set = patch => setGame(g => ({ ...g, ...patch }))

  const before = useMemo(() => (game.era === 0 ? computeStats(game, -1) : computeStats(game, game.era - 1)), [game])
  const after = useMemo(() => computeStats(game, game.era), [game])

  function pick(id, choiceId) {
    setGame(g => ({ ...g, choices: { ...g.choices, [era.n]: { ...(g.choices[era.n] || {}), [id]: choiceId } } }))
  }
  function toggleEmpire(id) {
    setGame(g => {
      const on = g.inPlay.includes(id)
      if (on && g.inPlay.length <= 2) return g
      return { ...g, inPlay: on ? g.inPlay.filter(x => x !== id) : EMPIRES.map(e => e.id).filter(x => x === id || g.inPlay.includes(x)) }
    })
  }
  function newGame() {
    if (window.confirm('Start a new game? This clears every choice and score.')) { timer.reset(0); setGame(NEW_GAME) }
  }
  const revealNext = () => (game.revealIdx + 1 < game.inPlay.length ? set({ revealIdx: game.revealIdx + 1 }) : set({ phase: 'event' }))
  const revealBack = () => set({ revealIdx: Math.max(0, game.revealIdx - 1) })
  useKeys({
    ' ': () => game.phase === 'reveal' && revealNext(),
    ArrowRight: () => game.phase === 'reveal' && revealNext(),
    ArrowLeft: () => game.phase === 'reveal' && revealBack(),
  })

  const allPicked = game.inPlay.every(id => picks[id])

  // ── SETUP
  if (game.phase === 'setup') {
    return (
      <div className="cb-setup">
        <h2 className="cb-title">The Long Game, 1450–1800</h2>
        <p className="cb-sub">Each table plays one empire for the whole unit. Every era, teams make the choice their empire really faced and defend it with evidence. Watch how the balance of power shifts.</p>
        <span className="cb-choices-label" style={{ marginTop: '1rem' }}>Empires in play (one per table)</span>
        <div className="lg-pickers">
          {EMPIRES.map(e => (
            <button key={e.id} className={`cb-chip ${game.inPlay.includes(e.id) ? 'on' : ''}`} aria-pressed={game.inPlay.includes(e.id)}
              style={{ '--emp': e.color }} onClick={() => toggleEmpire(e.id)}>
              <span className="lg-dot" /> {e.name}
            </button>
          ))}
        </div>
        <p className="cb-hint" style={{ marginTop: '0.6rem' }}>{game.inPlay.length} empires. Fewer tables? Turn some off; keep at least one Atlantic empire so the ending works.</p>
        <button className="btn btn-primary btn-lg" style={{ marginTop: '1.2rem' }} onClick={() => set({ phase: 'intro', era: 0, choices: {}, revealIdx: 0 })}>▶ Start Era 1</button>
      </div>
    )
  }

  const eraHead = (
    <div className="lg-era-head">
      <span className="lg-era-tag">Era {era.n} · {era.years}</span>
      <span className="lg-era-name">{era.title}</span>
      <button className="cb-chip lg-new" onClick={newGame}>New game</button>
    </div>
  )

  // ── ERA INTRO
  if (game.phase === 'intro') {
    return (
      <div className="cb-game">
        {eraHead}
        <div className="lg-intro">
          <p className="lg-intro-years">{era.years}</p>
          <h2 className="lg-intro-title">{era.title}</h2>
          <p className="lg-intro-q">{era.question}</p>
          <p className="cb-hint">Read your empire’s card as a team. Pick one choice and write a one-sentence reason using evidence from {era.lesson}.</p>
          <button className="btn btn-primary btn-lg" onClick={() => set({ phase: 'decide' })}>Teams decide →</button>
        </div>
      </div>
    )
  }

  // ── DECIDE: teacher enters each table's choice
  if (game.phase === 'decide') {
    const open = openId && era.cards[openId] ? openId : null
    return (
      <div className="cb-game">
        {eraHead}
        <div className="cb-toolbar">
          <Choices label="Decision time" options={TIME_OPTIONS} value={seconds} onChange={setSeconds} />
          {timer.running || timer.left > 0
            ? <button className="btn" onClick={() => (timer.running ? timer.pause() : timer.resume())}>{timer.running ? '⏸ Pause' : '▶ Resume'}</button>
            : <button className="btn" onClick={() => timer.start(seconds)}>▶ Start timer</button>}
          <span className="cb-count">{Object.keys(picks).filter(id => game.inPlay.includes(id)).length} of {game.inPlay.length} decided</span>
        </div>
        {(timer.running || timer.left > 0) && <TimerDisplay left={timer.left} total={timer.total} />}
        <div className="lg-grid">
          {game.inPlay.map(id => {
            const e = empire(id); const c = era.cards[id]?.choices.find(ch => ch.id === picks[id])
            return (
              <button key={id} className={`lg-tile ${picks[id] ? 'done' : ''} ${open === id ? 'open' : ''}`} style={{ '--emp': e.color }} onClick={() => setOpenId(open === id ? null : id)}>
                <span className="lg-tile-name">{e.name}</span>
                <span className="lg-tile-status">{c ? '✓ Choice ' + c.id.toUpperCase() : 'Waiting…'}</span>
              </button>
            )
          })}
        </div>
        {open && (
          <div className="lg-card" style={{ '--emp': empire(open).color }}>
            <h3>{empire(open).name}</h3>
            <p className="lg-prompt">{era.cards[open].prompt}</p>
            <div className="lg-options">
              {era.cards[open].choices.map(ch => (
                <button key={ch.id} className={`lg-option ${picks[open] === ch.id ? 'on' : ''}`} onClick={() => { pick(open, ch.id); setOpenId(null) }}>
                  <span className="lg-letter">{ch.id.toUpperCase()}</span>{ch.label}
                </button>
              ))}
            </div>
            <p className="cb-hint">Click the choice this table made. Their reasons stay on paper.</p>
          </div>
        )}
        <div className="cb-nav">
          <button className="btn btn-primary btn-lg" disabled={!allPicked} onClick={() => { timer.reset(0); setOpenId(null); set({ phase: 'reveal', revealIdx: 0 }) }}>
            {allPicked ? 'Reveal the results →' : 'Waiting for every table'}
          </button>
        </div>
      </div>
    )
  }

  // ── REVEAL: one empire at a time, choice vs. history
  if (game.phase === 'reveal') {
    const id = game.inPlay[game.revealIdx]; const e = empire(id); const card = era.cards[id]
    const c = card.choices.find(ch => ch.id === picks[id]); const hist = card.choices.find(ch => ch.history)
    const same = c && hist && c.id === hist.id
    return (
      <div className="cb-game">
        {eraHead}
        <div className="lg-reveal" style={{ '--emp': e.color }}>
          <p className="lg-reveal-count">{game.revealIdx + 1} of {game.inPlay.length}</p>
          <h2 className="lg-reveal-name">{e.name}</h2>
          <div className="lg-reveal-cols">
            <div className="lg-panel">
              <p className="lg-label">Your choice</p>
              <p className="lg-big">{c ? c.label : '—'}</p>
              <p>{c?.result}</p>
              <div className="lg-deltas"><Deltas effects={c?.effects} /></div>
            </div>
            <div className="lg-panel history">
              <p className="lg-label">What really happened {same ? <span className="lg-badge same">Same as history</span> : <span className="lg-badge diff">History went another way</span>}</p>
              <p className="lg-big">{hist?.label}</p>
              <p>{card.historyNote}</p>
            </div>
          </div>
        </div>
        <div className="cb-nav">
          <button className="btn" onClick={revealBack} disabled={game.revealIdx === 0}>← Back</button>
          <button className="btn btn-primary btn-lg" onClick={revealNext}>{game.revealIdx + 1 < game.inPlay.length ? 'Next empire →' : 'World events →'}</button>
        </div>
        <p className="cb-keys">Space or → for next</p>
      </div>
    )
  }

  // ── WORLD EVENTS
  if (game.phase === 'event') {
    return (
      <div className="cb-game">
        {eraHead}
        {era.events.map(ev => (
          <div key={ev.title} className="lg-event">
            <p className="lg-label">World event</p>
            <h2 className="lg-intro-title">{ev.title}</h2>
            <p className="lg-intro-q">{ev.text}</p>
            <div className="lg-deltas">
              {Object.entries(ev.effects).filter(([id]) => game.inPlay.includes(id)).map(([id, fx]) => (
                <span key={id} className="lg-event-emp" style={{ '--emp': empire(id).color }}><b>{empire(id).name}</b> <Deltas effects={fx} /></span>
              ))}
            </div>
          </div>
        ))}
        <div className="cb-nav">
          <button className="btn" onClick={() => set({ phase: 'reveal', revealIdx: game.inPlay.length - 1 })}>← Back</button>
          <button className="btn btn-primary btn-lg" onClick={() => set({ phase: 'board' })}>Balance of power →</button>
        </div>
      </div>
    )
  }

  // ── BALANCE OF POWER
  const rows = [...game.inPlay].sort((a, b) => power(after[b]) - power(after[a]))
  const top = Math.max(...rows.map(id => power(after[id])), 1)
  const nextEra = ERAS[game.era + 1]
  return (
    <div className="cb-game">
      {eraHead}
      <h2 className="lg-intro-title" style={{ textAlign: 'center' }}>Balance of power after {era.years.split('–')[1]}</h2>
      <div className="lg-board">
        {rows.map((id, i) => {
          const e = empire(id); const p = power(after[id]); const d = p - power(before[id])
          return (
            <div key={id} className="lg-row" style={{ '--emp': e.color }}>
              <span className="lg-rank">{i + 1}</span>
              <span className="lg-row-name">{e.name}<span className="lg-geo" title={e.geo.note}>{e.geo.label}</span></span>
              <span className="lg-bar" style={{ width: `${(p / top) * 100}%` }}>
                {STATS.map(st => <span key={st.key} className={`lg-seg ${st.key}`} style={{ flex: after[id][st.key] }} title={`${st.label}: ${after[id][st.key]}`} />)}
              </span>
              <span className="lg-power">{p}<span className={`lg-change ${d > 0 ? 'up' : d < 0 ? 'down' : ''}`}>{d > 0 ? '▲' + d : d < 0 ? '▼' + -d : '–'}</span></span>
            </div>
          )
        })}
      </div>
      <div className="lg-legend">{STATS.map(st => <span key={st.key}><i className={`lg-seg ${st.key}`} /> {st.label}</span>)}</div>
      <div className="cb-nav">
        <button className="btn" onClick={() => set({ phase: 'event' })}>← Back</button>
        {nextEra
          ? <button className="btn btn-primary btn-lg" onClick={() => set({ phase: 'intro', era: game.era + 1, revealIdx: 0 })}>Start Era {nextEra.n} →</button>
          : <span className="cb-hint">Era {era.n + 1} arrives with the next lesson. Your game is saved on this computer.</span>}
      </div>
    </div>
  )
}
