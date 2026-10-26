import React, { useMemo, useState } from 'react'
import { EMPIRES, ERAS, STATS, STAT_MAX } from '../../lib/longGame'
import { useSaved, useKeys, useCountdown, chime, fmtTime } from './common'
import './LongGame.css'

// ═══════════════════════════════════════════════════════════════
// THE LONG GAME — Phase 1. Projector only: each table is an empire,
// decides on paper, and the teacher clicks in its choice. Everything is
// saved in this browser, so a refresh (or the next class day) picks up
// where you left off. All the history is in src/lib/longGame.js.
// ═══════════════════════════════════════════════════════════════

const ALL = EMPIRES.map(e => e.id)
const NEW_GAME = { phase: 'setup', era: 0, inPlay: ALL, choices: {}, revealIdx: 0 }
const TIME_OPTIONS = [300, 420, 600]
const empire = id => EMPIRES.find(e => e.id === id)
const clamp = n => Math.max(0, Math.min(STAT_MAX, n))
const power = s => STATS.reduce((sum, st) => sum + s[st.key], 0)

function add(stats, effects) {
  const out = { ...stats }
  Object.entries(effects || {}).forEach(([k, v]) => { out[k] = clamp(out[k] + v) })
  return out
}

// Stats for every empire after eras 0..throughEra (events included)
function computeStats(game, throughEra) {
  const s = {}
  game.inPlay.forEach(id => { s[id] = { ...empire(id).start } })
  for (let i = 0; i <= throughEra; i++) {
    const era = ERAS[i]
    const picks = game.choices[era.n] || {}
    game.inPlay.forEach(id => {
      const c = era.cards[id]?.choices.find(ch => ch.id === picks[id])
      if (c) s[id] = add(s[id], c.effects)
    })
    era.events.forEach(ev => Object.entries(ev.effects).forEach(([id, fx]) => { if (s[id]) s[id] = add(s[id], fx) }))
  }
  return s
}

function Deltas({ effects }) {
  const list = STATS.filter(st => effects && effects[st.key])
  if (list.length === 0) return <span className="lg-delta zero">No change</span>
  return list.map(st => (
    <span key={st.key} className={`lg-delta ${effects[st.key] > 0 ? 'up' : 'down'}`}>
      {effects[st.key] > 0 ? '+' : '−'}{Math.abs(effects[st.key])} {st.label}
    </span>
  ))
}

function Frame({ kicker, title, right, children, footer }) {
  return (
    <div className="lg-root">
      <header className="lg-top">
        <div>
          {kicker && <p className="lg-kicker">{kicker}</p>}
          <h2 className="lg-top-title">{title}</h2>
        </div>
        <div className="lg-top-right">{right}</div>
      </header>
      <main className="lg-body">{children}</main>
      {footer && <footer className="lg-foot">{footer}</footer>}
    </div>
  )
}

export default function LongGame() {
  const [game, setGame] = useSaved('lg-game', NEW_GAME)
  const [seconds, setSeconds] = useSaved('lg-seconds', 420)
  const [openId, setOpenId] = useState(null)
  const timer = useCountdown(() => chime())
  const era = ERAS[game.era]
  const picks = game.choices[era.n] || {}
  const set = patch => setGame(g => ({ ...g, ...patch }))

  const before = useMemo(() => computeStats(game, game.era - 1), [game])
  const after = useMemo(() => computeStats(game, game.era), [game])

  function pick(id, choiceId) {
    setGame(g => ({ ...g, choices: { ...g.choices, [era.n]: { ...(g.choices[era.n] || {}), [id]: choiceId } } }))
  }
  function toggleEmpire(id) {
    setGame(g => {
      const on = g.inPlay.includes(id)
      if (on && g.inPlay.length <= 2) return g
      return { ...g, inPlay: on ? g.inPlay.filter(x => x !== id) : ALL.filter(x => x === id || g.inPlay.includes(x)) }
    })
  }
  function newGame() {
    if (window.confirm('Start a new game? This clears every choice and score.')) { timer.reset(0); setOpenId(null); setGame(NEW_GAME) }
  }
  const revealNext = () => (game.revealIdx + 1 < game.inPlay.length ? set({ revealIdx: game.revealIdx + 1 }) : set({ phase: 'event' }))
  const revealBack = () => set({ revealIdx: Math.max(0, game.revealIdx - 1) })
  useKeys({
    ' ': () => game.phase === 'reveal' && revealNext(),
    ArrowRight: () => game.phase === 'reveal' && revealNext(),
    ArrowLeft: () => game.phase === 'reveal' && revealBack(),
  })

  const allPicked = game.inPlay.every(id => picks[id])
  const kicker = `Era ${era.n} · ${era.years}`
  const newBtn = <button className="lg-btn ghost" onClick={newGame}>New game</button>

  // ── SETUP
  if (game.phase === 'setup') {
    const n = game.inPlay.length
    const atlantic = game.inPlay.some(id => empire(id).geo.label === 'Atlantic coast')
    return (
      <Frame kicker="Unit 3 simulation" title="The Long Game, 1450–1800"
        right={<button className="lg-btn ghost" onClick={() => set({ inPlay: ALL })} disabled={n === ALL.length}>All on</button>}
        footer={<>
          <span className="lg-foot-note">{atlantic ? 'Click an empire to turn it off or on. Every table plays one empire.' : '⚠ Turn on at least one Atlantic empire (Spain & Portugal or England & the Netherlands) so the ending works.'}</span>
          <button className="lg-btn primary" onClick={() => set({ phase: 'intro', era: 0, choices: {}, revealIdx: 0 })}>Start Era 1 with {n} empires →</button>
        </>}>
        <div className="lg-setup">
          <p className="lg-lead">Each table plays one empire for the whole unit. Every era, teams make the choice their empire really faced and defend it with evidence. Then we see what happened, and how the balance of power shifts.</p>
          <div className="lg-emp-grid">
            {EMPIRES.map(e => {
              const on = game.inPlay.includes(e.id)
              return (
                <button key={e.id} className={`lg-emp ${on ? 'on' : 'off'}`} style={{ '--emp': e.color }} aria-pressed={on} onClick={() => toggleEmpire(e.id)}>
                  <span className="lg-emp-check" aria-hidden="true">{on ? '✓' : ''}</span>
                  <span className="lg-emp-name">{e.name}</span>
                  <span className="lg-emp-geo">{e.geo.label}</span>
                  <span className="lg-emp-state">{on ? 'In play' : 'Off'}</span>
                </button>
              )
            })}
          </div>
        </div>
      </Frame>
    )
  }

  // ── ERA INTRO
  if (game.phase === 'intro') {
    return (
      <Frame kicker={kicker} title={era.title} right={newBtn}
        footer={<><span className="lg-foot-note">Hand each table its Era {era.n} decision card.</span>
          <button className="lg-btn primary" onClick={() => set({ phase: 'decide' })}>Teams decide →</button></>}>
        <div className="lg-center">
          <p className="lg-years">{era.years}</p>
          <h1 className="lg-hero">{era.title}</h1>
          <p className="lg-question">{era.question}</p>
          <p className="lg-lead">Read your empire’s card as a team. Pick one choice and write a one-sentence reason, using evidence from {era.lesson}.</p>
        </div>
      </Frame>
    )
  }

  // ── DECIDE: teacher enters each table's choice
  if (game.phase === 'decide') {
    const open = openId && era.cards[openId] ? openId : null
    const done = game.inPlay.filter(id => picks[id]).length
    const showTimer = timer.running || timer.left > 0
    const f = timer.total > 0 ? timer.left / timer.total : 1
    return (
      <Frame kicker={kicker} title={era.title}
        right={<div className="lg-timer">
          {showTimer
            ? <><span className={`lg-clock ${f < 0.2 ? 'low' : ''}`}>{fmtTime(timer.left)}</span>
                <button className="lg-btn ghost" onClick={() => (timer.running ? timer.pause() : timer.resume())}>{timer.running ? 'Pause' : 'Resume'}</button></>
            : <>{TIME_OPTIONS.map(t => <button key={t} className={`lg-btn chip ${seconds === t ? 'on' : ''}`} onClick={() => setSeconds(t)}>{t / 60} min</button>)}
                <button className="lg-btn ghost" onClick={() => timer.start(seconds)}>Start timer</button></>}
          {newBtn}
        </div>}
        footer={<><span className="lg-foot-note"><b>{done} of {game.inPlay.length}</b> tables have decided.</span>
          <button className="lg-btn primary" disabled={!allPicked} onClick={() => { timer.reset(0); setOpenId(null); set({ phase: 'reveal', revealIdx: 0 }) }}>
            {allPicked ? 'Reveal the results →' : 'Waiting for every table'}
          </button></>}>
        <div className="lg-decide">
          <div className="lg-tiles">
            {game.inPlay.map(id => {
              const e = empire(id); const c = era.cards[id]?.choices.find(ch => ch.id === picks[id])
              return (
                <button key={id} className={`lg-tile ${c ? 'done' : ''} ${open === id ? 'open' : ''}`} style={{ '--emp': e.color }} onClick={() => setOpenId(open === id ? null : id)}>
                  <span className="lg-tile-name">{e.name}</span>
                  <span className="lg-tile-status">{c ? `✓ Chose ${c.id.toUpperCase()}` : 'Click to enter choice'}</span>
                </button>
              )
            })}
          </div>
          <div className="lg-cardpanel">
            {open ? (
              <div className="lg-card" style={{ '--emp': empire(open).color }}>
                <p className="lg-kicker">Decision card</p>
                <h3 className="lg-card-name">{empire(open).name}</h3>
                <p className="lg-prompt">{era.cards[open].prompt}</p>
                <div className="lg-options">
                  {era.cards[open].choices.map(ch => (
                    <button key={ch.id} className={`lg-option ${picks[open] === ch.id ? 'on' : ''}`} onClick={() => { pick(open, ch.id); setOpenId(null) }}>
                      <span className="lg-letter">{ch.id.toUpperCase()}</span><span>{ch.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="lg-empty">
                <p className="lg-empty-big">When a table is ready, click its empire</p>
                <p>Their card and choices appear here. Click the letter they chose.</p>
              </div>
            )}
          </div>
        </div>
      </Frame>
    )
  }

  // ── REVEAL: one empire at a time, choice vs. history
  if (game.phase === 'reveal') {
    const id = game.inPlay[game.revealIdx]; const e = empire(id); const card = era.cards[id]
    const c = card.choices.find(ch => ch.id === picks[id]); const hist = card.choices.find(ch => ch.history)
    const same = c && hist && c.id === hist.id
    return (
      <Frame kicker={`${kicker} · Reveal ${game.revealIdx + 1} of ${game.inPlay.length}`} title={e.name} right={newBtn}
        footer={<><button className="lg-btn ghost" onClick={revealBack} disabled={game.revealIdx === 0}>← Back</button>
          <span className="lg-foot-note">Ask the table to read their “because…” sentence. Space or → for next.</span>
          <button className="lg-btn primary" onClick={revealNext}>{game.revealIdx + 1 < game.inPlay.length ? 'Next empire →' : 'World events →'}</button></>}>
        <div className="lg-reveal" style={{ '--emp': e.color }}>
          <section className="lg-panel">
            <p className="lg-label">Your choice</p>
            <p className="lg-big">{c ? `${c.id.toUpperCase()}. ${c.label}` : '—'}</p>
            <p className="lg-text">{c?.result}</p>
            <div className="lg-deltas"><Deltas effects={c?.effects} /></div>
          </section>
          <section className="lg-panel history">
            <p className="lg-label">What really happened <span className={`lg-badge ${same ? 'same' : 'diff'}`}>{same ? 'Same as history' : 'History went another way'}</span></p>
            <p className="lg-big">{hist ? `${hist.id.toUpperCase()}. ${hist.label}` : ''}</p>
            <p className="lg-text">{card.historyNote}</p>
          </section>
        </div>
      </Frame>
    )
  }

  // ── WORLD EVENTS
  if (game.phase === 'event') {
    return (
      <Frame kicker={kicker} title="World events" right={newBtn}
        footer={<><button className="lg-btn ghost" onClick={() => set({ phase: 'reveal', revealIdx: game.inPlay.length - 1 })}>← Back</button>
          <span />
          <button className="lg-btn primary" onClick={() => set({ phase: 'board' })}>Balance of power →</button></>}>
        <div className="lg-center">
          {era.events.map(ev => (
            <div key={ev.title} className="lg-event">
              <h1 className="lg-hero">{ev.title}</h1>
              <p className="lg-question">{ev.text}</p>
              <div className="lg-deltas center">
                {Object.entries(ev.effects).filter(([id]) => game.inPlay.includes(id)).map(([id, fx]) => (
                  <span key={id} className="lg-event-emp" style={{ '--emp': empire(id).color }}><b>{empire(id).name}</b> <Deltas effects={fx} /></span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Frame>
    )
  }

  // ── BALANCE OF POWER
  const rows = [...game.inPlay].sort((a, b) => power(after[b]) - power(after[a]))
  const top = Math.max(...rows.map(id => power(after[id])), 1) * 1.04
  const nextEra = ERAS[game.era + 1]
  return (
    <Frame kicker={kicker} title={`Balance of power, ${era.years.split('–')[1]}`} right={newBtn}
      footer={<><button className="lg-btn ghost" onClick={() => set({ phase: 'event' })}>← Back</button>
        <div className="lg-legend">{STATS.map(st => <span key={st.key}><i className={`lg-seg ${st.key}`} /> {st.label}</span>)}</div>
        {nextEra
          ? <button className="lg-btn primary" onClick={() => set({ phase: 'intro', era: game.era + 1, revealIdx: 0 })}>Start Era {nextEra.n} →</button>
          : <span className="lg-foot-note">Saved on this computer. Era {era.n + 1} comes with the next lesson.</span>}</>}>
      <div className="lg-board">
        {rows.map((id, i) => {
          const e = empire(id); const p = power(after[id]); const d = p - power(before[id])
          return (
            <div key={id} className="lg-row" style={{ '--emp': e.color }}>
              <span className="lg-rank">{i + 1}</span>
              <span className="lg-row-name">{e.name}<span className="lg-geo">{e.geo.label}</span></span>
              <span className="lg-track">
                <span className="lg-bar" style={{ width: `${(p / top) * 100}%` }}>
                  {STATS.map(st => <span key={st.key} className={`lg-seg ${st.key}`} style={{ flex: after[id][st.key] }} title={`${st.label}: ${after[id][st.key]}`}>{after[id][st.key] >= 3 ? after[id][st.key] : ''}</span>)}
                </span>
              </span>
              <span className="lg-power">{p}<span className={`lg-change ${d > 0 ? 'up' : d < 0 ? 'down' : ''}`}>{d > 0 ? '▲ ' + d : d < 0 ? '▼ ' + -d : '—'}</span></span>
            </div>
          )
        })}
      </div>
    </Frame>
  )
}
