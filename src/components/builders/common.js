import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'

// ── Settings saved on this computer (teacher's browser only; no student data)
export function useSaved(key, initial) {
  const [value, setValue] = useState(() => {
    try {
      const raw = localStorage.getItem('kwis-builders-' + key)
      return raw === null ? initial : JSON.parse(raw)
    } catch (e) {
      return initial
    }
  })
  useEffect(() => {
    try { localStorage.setItem('kwis-builders-' + key, JSON.stringify(value)) } catch (e) { /* ignore */ }
  }, [key, value])
  return [value, setValue]
}

function shuffled(n) {
  const a = Array.from({ length: n }, (_, i) => i)
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// ── Goes through a list in random order with no repeats until every item is used
export function useDeck(items) {
  const [order, setOrder] = useState(() => shuffled(items.length))
  const [pos, setPos] = useState(0)
  const sig = items.length + ':' + (items[0] ? JSON.stringify(items[0]).slice(0, 40) : '')
  useEffect(() => { setOrder(shuffled(items.length)); setPos(0) }, [sig]) // new list → new shuffle

  const next = useCallback(() => {
    if (pos + 1 < order.length) setPos(pos + 1)
    else { setOrder(shuffled(items.length)); setPos(0) }
  }, [pos, order.length, items.length])
  const back = useCallback(() => setPos(p => Math.max(0, p - 1)), [])

  return { item: items[order[pos]], next, back, pos, total: items.length, canBack: pos > 0 }
}

// ── Countdown that doesn't drift (based on the clock, not on counting ticks)
export function useCountdown(onDone) {
  const [endAt, setEndAt] = useState(null)      // when running
  const [pausedLeft, setPausedLeft] = useState(null)
  const [total, setTotal] = useState(0)
  const [now, setNow] = useState(Date.now())
  const doneRef = useRef(onDone)
  doneRef.current = onDone

  useEffect(() => {
    if (!endAt) return
    const t = setInterval(() => setNow(Date.now()), 200)
    return () => clearInterval(t)
  }, [endAt])

  const left = endAt ? Math.max(0, (endAt - now) / 1000) : (pausedLeft ?? total)
  useEffect(() => {
    if (endAt && now >= endAt) {
      setEndAt(null)
      setPausedLeft(0)
      if (doneRef.current) doneRef.current()
    }
  }, [now, endAt])

  return {
    left, total,
    running: !!endAt,
    start(seconds) { setTotal(seconds); setPausedLeft(null); const n = Date.now(); setNow(n); setEndAt(n + seconds * 1000) },
    pause() { if (endAt) { setPausedLeft(Math.max(0, (endAt - Date.now()) / 1000)); setEndAt(null) } },
    resume() { if (!endAt && pausedLeft > 0) { const n = Date.now(); setNow(n); setEndAt(n + pausedLeft * 1000) } },
    reset(seconds = total) { setEndAt(null); setTotal(seconds); setPausedLeft(seconds) },
  }
}

export function fmtTime(sec) {
  const s = Math.ceil(sec)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export function TimerDisplay({ left, total, big = false }) {
  const pct = total > 0 ? (left / total) * 100 : 0
  const f = total > 0 ? left / total : 1
  const color = f > 0.5 ? 'var(--green)' : f > 0.2 ? 'var(--yellow)' : 'var(--red)'
  return (
    <div className={`cb-timer ${big ? 'big' : ''}`} role="timer" aria-live="off">
      <div className="cb-timer-digits" style={{ color }}>{fmtTime(left)}</div>
      <div className="cb-timer-bar"><div style={{ width: `${pct}%`, background: color }} /></div>
    </div>
  )
}

// ── "Time's up" chime (three short tones)
export function chime() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    ;[0, 0.22, 0.44].forEach((t, i) => {
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      o.type = 'sine'
      o.frequency.value = i === 2 ? 880 : 660
      g.gain.setValueAtTime(0.0001, ctx.currentTime + t)
      g.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + t + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.2)
      o.connect(g).connect(ctx.destination)
      o.start(ctx.currentTime + t)
      o.stop(ctx.currentTime + t + 0.22)
    })
    setTimeout(() => ctx.close(), 1200)
  } catch (e) { /* no sound available */ }
}

// ── Keyboard shortcuts (ignored while typing in a box)
export function useKeys(map) {
  const ref = useRef(map)
  ref.current = map
  useEffect(() => {
    function onKey(e) {
      const tag = (e.target && e.target.tagName) || ''
      // Typing in a box: leave keys alone. A checkbox or button that still has focus
      // after a click shouldn't swallow the shortcut (Space would toggle it instead).
      const typing = (tag === 'INPUT' && !['checkbox', 'radio', 'button'].includes(e.target.type)) ||
        tag === 'TEXTAREA' || tag === 'SELECT' || e.target.isContentEditable
      if (typing) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const fn = ref.current[e.key] || ref.current[e.key.toLowerCase()]
      if (fn) { e.preventDefault(); fn() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

// ── English, with Spanish underneath when turned on
export function Bi({ item, es, className = '' }) {
  if (!item) return null
  if (typeof item === 'string') return <span className={className}>{item}</span>
  return (
    <span className={className}>
      {item.en}
      {es && item.es && item.es !== item.en && <span className="cb-es">{item.es}</span>}
    </span>
  )
}

// ── Team scoreboard
export const TEAM_COLORS = ['#6c63ff', '#e8436e', '#c9a227', '#2aaba3', '#ff8a3d', '#3e8ef7', '#2fbf71', '#9b6cff']
export const DEFAULT_TEAMS = [0, 1, 2, 3].map(i => ({ id: 't' + i, name: `Team ${i + 1}`, color: TEAM_COLORS[i], score: 0 }))

export function Scoreboard({ teams, setTeams, activeId, onSelect }) {
  const [editing, setEditing] = useState(null)
  const top = Math.max(...teams.map(t => t.score), 0)

  function change(id, d) { setTeams(ts => ts.map(t => (t.id === id ? { ...t, score: Math.max(0, t.score + d) } : t))) }
  function rename(id, name) { setTeams(ts => ts.map(t => (t.id === id ? { ...t, name: name.slice(0, 24) } : t))) }
  function addTeam() {
    setTeams(ts => {
      if (ts.length >= 8) return ts
      const used = new Set(ts.map(t => t.id))
      let n = ts.length
      while (used.has('t' + n)) n++
      return [...ts, { id: 't' + n, name: `Team ${ts.length + 1}`, color: TEAM_COLORS[ts.length % TEAM_COLORS.length], score: 0 }]
    })
  }
  function removeTeam() { setTeams(ts => (ts.length > 2 ? ts.slice(0, -1) : ts)) }
  function resetScores() {
    if (window.confirm('Reset all scores to 0?')) setTeams(ts => ts.map(t => ({ ...t, score: 0 })))
  }

  return (
    <aside className="cb-score" aria-label="Scoreboard">
      <div className="cb-score-head">
        <strong>Scoreboard</strong>
        <span className="cb-score-tools">
          <button className="cb-mini" onClick={removeTeam} disabled={teams.length <= 2} aria-label="Remove a team">−</button>
          <button className="cb-mini" onClick={addTeam} disabled={teams.length >= 8} aria-label="Add a team">+</button>
          <button className="cb-mini" onClick={resetScores}>Reset</button>
        </span>
      </div>
      {teams.map(t => (
        <div key={t.id} className={`cb-team ${activeId === t.id ? 'active' : ''}`} style={{ '--team': t.color }}
          onClick={onSelect ? () => onSelect(t.id) : undefined}>
          <span className="cb-team-dot" />
          {editing === t.id ? (
            <input className="cb-team-input" autoFocus value={t.name} aria-label="Team name"
              onClick={e => e.stopPropagation()}
              onChange={e => rename(t.id, e.target.value)}
              onBlur={() => setEditing(null)}
              onKeyDown={e => { if (e.key === 'Enter') setEditing(null) }} />
          ) : (
            <button className="cb-team-name" title="Click to rename"
              onClick={e => { e.stopPropagation(); setEditing(t.id) }}>
              {t.name}{t.score > 0 && t.score === top ? ' 👑' : ''}
            </button>
          )}
          <span className="cb-team-score">{t.score}</span>
          <button className="cb-mini" aria-label={`Take a point from ${t.name}`} onClick={e => { e.stopPropagation(); change(t.id, -1) }}>−</button>
          <button className="cb-mini plus" aria-label={`Give a point to ${t.name}`} onClick={e => { e.stopPropagation(); change(t.id, 1) }}>+1</button>
        </div>
      ))}
      <p className="cb-score-note">Click a team name to rename it.</p>
    </aside>
  )
}

// ── Editor for a teacher's own list (one item per line)
export function ListEditor({ title, help, placeholder, initial, onSave, onClose }) {
  const [text, setText] = useState(initial.join('\n'))
  const count = useMemo(() => text.split('\n').map(s => s.trim()).filter(Boolean).length, [text])
  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <h2 style={{ marginBottom: '0.4rem' }}>{title}</h2>
        <p style={{ color: 'var(--muted)', fontSize: '0.88rem', marginBottom: '0.9rem', lineHeight: 1.5 }}>{help}</p>
        <textarea className="cb-list-text" value={text} placeholder={placeholder} onChange={e => setText(e.target.value)} />
        <p style={{ color: 'var(--muted)', fontSize: '0.8rem', margin: '0.4rem 0 1rem' }}>
          {count} item{count !== 1 ? 's' : ''} · saved on this computer
        </p>
        <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'flex-end' }}>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={() => onSave(text.split('\n').map(s => s.trim()).filter(Boolean))}>Save list</button>
        </div>
      </div>
    </div>
  )
}

// ── A row of choice buttons (list picker, time picker, etc.)
export function Choices({ label, options, value, onChange }) {
  return (
    <div className="cb-choices">
      {label && <span className="cb-choices-label">{label}</span>}
      {options.map(o => (
        <button key={String(o.value)} className={`cb-chip ${value === o.value ? 'on' : ''}`} aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}
