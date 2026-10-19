import React, { useState, useEffect, useRef } from 'react'

// ── Card colors (shared by every widget) ──
export const TONES = {
  pink:   { bg: '#fbd3e9', fg: '#2b1a24', label: 'Pink' },
  mint:   { bg: '#d6f5e8', fg: '#14302a', label: 'Mint' },
  yellow: { bg: '#fde7a1', fg: '#2e2508', label: 'Yellow' },
  sky:    { bg: '#cfe6fb', fg: '#0f2a40', label: 'Blue' },
  white:  { bg: '#ffffff', fg: '#1d1d26', label: 'White' },
  red:    { bg: '#9b1c1c', fg: '#fff3ea', label: 'Red' },
  ink:    { bg: '#1f2340', fg: '#f2f2ff', label: 'Navy' },
}

const TEXT_SIZES = { S: 1.15, M: 1.55, L: 2.05, XL: 2.75 } // in % of board width

// ── Sound helper: three short beeps when the timer ends ──
function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    ;[0, 0.35, 0.7].forEach(t => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.frequency.value = 880
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + t)
      gain.gain.exponentialRampToValueAtTime(0.4, ctx.currentTime + t + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.25)
      osc.connect(gain).connect(ctx.destination)
      osc.start(ctx.currentTime + t)
      osc.stop(ctx.currentTime + t + 0.3)
    })
    setTimeout(() => ctx.close(), 1500)
  } catch { /* no audio available */ }
}

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

// Editable text that doesn't lose the cursor while you type
function Editable({ value, onChange, className, placeholder }) {
  const ref = useRef(null)
  useEffect(() => {
    const el = ref.current
    if (el && document.activeElement !== el && el.innerText !== value) el.innerText = value || ''
  }, [value])
  return (
    <div
      ref={ref}
      className={className}
      contentEditable="plaintext-only"
      suppressContentEditableWarning
      spellCheck
      data-placeholder={placeholder}
      onInput={e => onChange(e.currentTarget.innerText)}
    />
  )
}

// ── TEXT ──
function TextWidget({ props, update }) {
  return (
    <div className="w-text" style={{ '--fs': TEXT_SIZES[props.size] || TEXT_SIZES.M }}>
      <Editable className="w-text-title" value={props.title} placeholder="Title"
        onChange={title => update({ title })} />
      <Editable className="w-text-body" value={props.body} placeholder="Click to type"
        onChange={body => update({ body })} />
    </div>
  )
}
function TextSettings({ props, update }) {
  return (
    <div className="ws-row">
      <span>Size</span>
      {Object.keys(TEXT_SIZES).map(s => (
        <button key={s} className={`ws-chip ${props.size === s ? 'on' : ''}`} onClick={() => update({ size: s })}>{s}</button>
      ))}
    </div>
  )
}

// ── TIMER ──
function TimerWidget({ props, update }) {
  const [left, setLeft] = useState(props.seconds * 1000)
  const [running, setRunning] = useState(false)
  const endAt = useRef(0)

  useEffect(() => { if (!running) setLeft(props.seconds * 1000) }, [props.seconds])

  useEffect(() => {
    if (!running) return
    const t = setInterval(() => {
      const ms = Math.max(0, endAt.current - Date.now())
      setLeft(ms)
      if (ms === 0) { setRunning(false); beep() }
    }, 200)
    return () => clearInterval(t)
  }, [running])

  const start = () => {
    const from = left > 0 ? left : props.seconds * 1000
    setLeft(from)
    endAt.current = Date.now() + from
    setRunning(true)
  }
  const reset = () => { setRunning(false); setLeft(props.seconds * 1000) }
  const setMinutes = m => { setRunning(false); update({ seconds: Math.max(60, Math.min(99 * 60, m * 60)) }) }

  const secs = Math.ceil(left / 1000)
  const label = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`
  const done = left === 0

  return (
    <div className={`fit w-timer ${done ? 'done' : ''}`}>
      <div className="w-timer-digits" role="timer" aria-live="off">{label}</div>
      <div className="w-row">
        {!running && <button className="w-btn" onClick={() => setMinutes(props.seconds / 60 - 1)} aria-label="One minute less">−</button>}
        <button className="w-btn w-btn-main" onClick={running ? () => setRunning(false) : start}>
          {running ? 'Pause' : done ? 'Restart' : 'Start'}
        </button>
        {!running && <button className="w-btn" onClick={() => setMinutes(props.seconds / 60 + 1)} aria-label="One minute more">+</button>}
        <button className="w-btn" onClick={reset}>Reset</button>
      </div>
      {!running && (
        <div className="w-row w-presets">
          {[1, 3, 5, 10, 15].map(m => (
            <button key={m} className="w-btn w-btn-sm" onClick={() => setMinutes(m)}>{m} min</button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── CLOCK ──
function ClockWidget() {
  const [now, setNow] = useState(new Date())
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t) }, [])
  const time = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  const [hm, ampm] = time.split(' ')
  return (
    <div className="fit w-clock">
      <div className="w-clock-time">{hm}<span className="w-clock-ampm">{ampm}</span></div>
      <div className="w-clock-date">{now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}</div>
    </div>
  )
}

// ── NAME PICKER ── (names stay in memory only; nothing is saved)
function PickerWidget() {
  const [text, setText] = useState('')
  const [editing, setEditing] = useState(true)
  const [result, setResult] = useState(null)
  const [groups, setGroups] = useState(null)
  const [groupSize, setGroupSize] = useState(3)
  const [noRepeat, setNoRepeat] = useState(true)
  const [pool, setPool] = useState([])
  const spin = useRef(null)

  const names = text.split('\n').map(n => n.trim()).filter(Boolean)
  useEffect(() => () => clearInterval(spin.current), [])

  const pick = () => {
    if (!names.length) return
    setGroups(null)
    let available = noRepeat ? pool.filter(n => names.includes(n)) : names
    if (!available.length) available = names
    const chosen = available[Math.floor(Math.random() * available.length)]
    setPool(noRepeat ? available.filter(n => n !== chosen) : names)
    if (reducedMotion()) { setResult(chosen); return }
    let ticks = 0
    clearInterval(spin.current)
    spin.current = setInterval(() => {
      ticks += 1
      if (ticks >= 12) { clearInterval(spin.current); setResult(chosen); return }
      setResult(names[Math.floor(Math.random() * names.length)])
    }, 70)
  }

  const makeGroups = () => {
    const shuffled = [...names].sort(() => Math.random() - 0.5)
    const count = Math.max(1, Math.round(shuffled.length / groupSize))
    const out = Array.from({ length: count }, () => [])
    shuffled.forEach((n, i) => out[i % count].push(n))
    setResult(null); setGroups(out)
  }

  if (editing || !names.length) {
    return (
      <div className="w-picker w-picker-edit">
        <textarea value={text} onChange={e => setText(e.target.value)}
          placeholder="Type or paste names, one per line" aria-label="Names, one per line" />
        <p className="w-note">Names aren’t saved. They clear when you leave this page.</p>
        <button className="w-btn w-btn-main" disabled={!names.length}
          onClick={() => { setEditing(false); setPool(names); setResult(null); setGroups(null) }}>
          Use {names.length || ''} name{names.length === 1 ? '' : 's'}
        </button>
      </div>
    )
  }

  return (
    <div className="w-picker">
      <div className="w-picker-stage">
        {groups ? (
          <div className="w-groups">
            {groups.map((g, i) => (
              <div key={i} className="w-group"><strong>Group {i + 1}</strong>{g.map(n => <span key={n}>{n}</span>)}</div>
            ))}
          </div>
        ) : (
          <div className="fit"><div className="w-picker-name">{result || 'Ready'}</div></div>
        )}
      </div>
      <div className="w-row">
        <button className="w-btn w-btn-main" onClick={pick}>Pick a name</button>
        <button className="w-btn" onClick={makeGroups}>Groups of</button>
        <select className="w-select" value={groupSize} onChange={e => setGroupSize(+e.target.value)} aria-label="Group size">
          {[2, 3, 4, 5, 6].map(n => <option key={n} value={n}>{n}</option>)}
        </select>
        <button className="w-btn" onClick={() => setEditing(true)}>Edit names</button>
      </div>
      <label className="w-check">
        <input type="checkbox" checked={noRepeat} onChange={e => { setNoRepeat(e.target.checked); setPool(names) }} />
        Don’t repeat until everyone’s been picked ({noRepeat ? (pool.length || names.length) : names.length} left)
      </label>
    </div>
  )
}

// ── TRAFFIC LIGHT ──
function TrafficWidget({ props, update }) {
  const lights = [['red', 'Stop'], ['yellow', 'Quiet'], ['green', 'Go']]
  return (
    <div className="fit">
      <div className="w-traffic">
        {lights.map(([c, label]) => (
          <button key={c} className={`w-light w-light-${c} ${props.active === c ? 'on' : ''}`}
            aria-pressed={props.active === c} aria-label={label}
            onClick={() => update({ active: props.active === c ? null : c })} />
        ))}
      </div>
    </div>
  )
}

// ── SOUND METER ──
function SoundWidget({ props, update }) {
  const [level, setLevel] = useState(0)
  const [state, setState] = useState('off') // off | on | denied
  const audio = useRef(null)

  const stop = () => {
    const a = audio.current
    if (!a) return
    cancelAnimationFrame(a.raf)
    a.stream.getTracks().forEach(t => t.stop())
    a.ctx.close()
    audio.current = null
    setState('off'); setLevel(0)
  }
  useEffect(() => stop, [])

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const ctx = new (window.AudioContext || window.webkitAudioContext)()
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 1024
      ctx.createMediaStreamSource(stream).connect(analyser)
      const buf = new Float32Array(analyser.fftSize)
      let smooth = 0
      const a = { stream, ctx, raf: 0 }
      const tick = () => {
        analyser.getFloatTimeDomainData(buf)
        let sum = 0
        for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i]
        const db = 20 * Math.log10(Math.sqrt(sum / buf.length) || 1e-8)
        const target = Math.max(0, Math.min(100, ((db + 60) / 55) * 100))
        smooth = smooth * 0.85 + target * 0.15
        setLevel(smooth)
        a.raf = requestAnimationFrame(tick)
      }
      audio.current = a
      setState('on')
      tick()
    } catch {
      setState('denied')
    }
  }

  const limit = props.limit
  const status = level >= limit ? 'loud' : level >= limit * 0.75 ? 'close' : 'ok'
  const words = { ok: 'Nice and quiet', close: 'Getting loud', loud: 'Too loud!' }

  if (state !== 'on') {
    return (
      <div className="fit w-sound-off">
        <button className="w-btn w-btn-main" onClick={start}>🎤 Start sound meter</button>
        {state === 'denied' && <p className="w-note">Kwis needs microphone access. Click the lock icon in the address bar and allow the microphone.</p>}
      </div>
    )
  }

  return (
    <div className={`w-sound w-sound-${status}`}>
      <div className="fit"><div className="w-sound-word">{words[status]}</div></div>
      <div className="w-meter" aria-hidden="true">
        <div className="w-meter-fill" style={{ width: `${level}%` }} />
        <div className="w-meter-limit" style={{ left: `${limit}%` }} />
      </div>
      <div className="w-row">
        <label className="w-check">Limit
          <input type="range" min="30" max="95" value={limit} onChange={e => update({ limit: +e.target.value })} />
        </label>
        <button className="w-btn w-btn-sm" onClick={stop}>Stop</button>
      </div>
    </div>
  )
}

// ── Registry: everything the toolbar can add ──
export const WIDGETS = {
  text:    { label: 'Text',          icon: '📝', size: { w: 30, h: 28 }, tone: 'yellow', defaults: { title: '', body: '', size: 'M' }, Component: TextWidget, Settings: TextSettings },
  timer:   { label: 'Timer',         icon: '⏳', size: { w: 24, h: 30 }, tone: 'white',  defaults: { seconds: 300 }, Component: TimerWidget },
  clock:   { label: 'Clock',         icon: '🕒', size: { w: 22, h: 18 }, tone: 'white',  defaults: {}, Component: ClockWidget },
  picker:  { label: 'Name picker',   icon: '🎲', size: { w: 30, h: 38 }, tone: 'sky',    defaults: {}, Component: PickerWidget },
  traffic: { label: 'Traffic light', icon: '🚦', size: { w: 10, h: 34 }, tone: 'ink',    defaults: { active: null }, Component: TrafficWidget },
  sound:   { label: 'Sound meter',   icon: '🔊', size: { w: 26, h: 26 }, tone: 'white',  defaults: { limit: 70 }, Component: SoundWidget },
}
