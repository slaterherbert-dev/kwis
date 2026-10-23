import React, { useEffect, useMemo, useRef, useState } from 'react'
import { CATEGORIES, LETTERS } from './prompts'
import { useSaved, useKeys, useCountdown, TimerDisplay, chime, Bi, ListEditor, Choices, Scoreboard } from './common'

const COUNT_OPTIONS = [6, 8, 10].map(n => ({ label: String(n), value: n }))
const TIME_OPTIONS = [{ label: '1:30', value: 90 }, { label: '2:00', value: 120 }, { label: '3:00', value: 180 }]

function sample(list, n) {
  const a = [...list]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a.slice(0, n)
}

export default function LetterRush({ es, teams, setTeams }) {
  const [source, setSource] = useSaved('lr-source', 'general')
  const [count, setCount] = useSaved('lr-count', 8)
  const [seconds, setSeconds] = useSaved('lr-seconds', 120)
  const [custom, setCustom] = useSaved('lr-custom', [])
  const [editing, setEditing] = useState(false)

  const [phase, setPhase] = useState('setup') // setup | rolling | ready | writing | timeup | reveal | done
  const [letter, setLetter] = useState('?')
  const [cats, setCats] = useState([])
  const [revealIdx, setRevealIdx] = useState(0)
  const [round, setRound] = useState(0)
  const usedLetters = useRef([])
  const rollTimer = useRef(null)

  const timer = useCountdown(() => { chime(); setPhase('timeup') })
  useEffect(() => () => clearInterval(rollTimer.current), [])

  const pool = useMemo(() => {
    const mine = custom.map(en => ({ en }))
    if (source === 'mine') return mine
    if (source === 'socialStudies') return CATEGORIES.socialStudies
    if (source === 'mix') return [...CATEGORIES.general, ...CATEGORIES.socialStudies, ...mine]
    return CATEGORIES.general
  }, [source, custom])

  function roll() {
    if (pool.length === 0) return
    // pick a letter not used yet this session (until all have been used)
    let options = LETTERS.filter(l => !usedLetters.current.includes(l))
    if (options.length === 0) { usedLetters.current = []; options = LETTERS }
    const final = options[Math.floor(Math.random() * options.length)]
    usedLetters.current.push(final)

    setCats(sample(pool, Math.min(count, pool.length)))
    setRevealIdx(0)
    setRound(r => r + 1)
    timer.reset(seconds)
    setPhase('rolling')
    const startAt = Date.now()
    clearInterval(rollTimer.current)
    rollTimer.current = setInterval(() => {
      if (Date.now() - startAt > 1400) {
        clearInterval(rollTimer.current)
        setLetter(final)
        setPhase('ready')
      } else {
        setLetter(LETTERS[Math.floor(Math.random() * LETTERS.length)])
      }
    }, 70)
  }

  function startWriting() { timer.start(seconds); setPhase('writing') }
  function endEarly() { timer.reset(0); chime(); setPhase('timeup') }

  function primary() {
    if (phase === 'setup' || phase === 'done') roll()
    else if (phase === 'ready') startWriting()
    else if (phase === 'writing') { if (timer.running) timer.pause(); else timer.resume() }
    else if (phase === 'timeup') setPhase('reveal')
    else if (phase === 'reveal') nextReveal()
  }
  function nextReveal() {
    if (revealIdx + 1 < cats.length) setRevealIdx(i => i + 1)
    else setPhase('done')
  }
  useKeys({
    ' ': primary,
    ArrowRight: () => phase === 'reveal' && nextReveal(),
    ArrowLeft: () => phase === 'reveal' && setRevealIdx(i => Math.max(0, i - 1)),
  })

  const sourceOptions = [
    { label: 'Everyday', value: 'general' },
    { label: 'Social Studies', value: 'socialStudies' },
    { label: 'Mix', value: 'mix' },
    ...(custom.length > 0 ? [{ label: `Mine (${custom.length})`, value: 'mine' }] : []),
  ]

  const letterTile = <div className={`cb-letter ${phase === 'rolling' ? 'rolling' : ''}`} aria-label={`Letter ${letter}`}>{letter}</div>

  let main
  if (phase === 'setup') {
    main = (
      <div className="cb-setup">
        <h2 className="cb-title">Letter Rush</h2>
        <p className="cb-sub">Teams write one answer for each category, all starting with the letter. Only answers no other team wrote score a point.</p>
        <Choices label="Categories" options={sourceOptions} value={source} onChange={setSource} />
        <button className="cb-chip" style={{ marginTop: '0.5rem' }} onClick={() => setEditing(true)}>✏️ Edit my categories</button>
        <Choices label="How many" options={COUNT_OPTIONS} value={count} onChange={setCount} />
        <Choices label="Writing time" options={TIME_OPTIONS} value={seconds} onChange={setSeconds} />
        <button className="btn btn-primary btn-lg" style={{ marginTop: '1.2rem' }} disabled={pool.length === 0} onClick={roll}>🎲 Roll the letter</button>
      </div>
    )
  } else if (phase === 'rolling' || phase === 'ready' || phase === 'writing' || phase === 'timeup') {
    main = (
      <div className="cb-lr-play">
        <div className="cb-lr-left">
          {letterTile}
          {phase === 'ready' && <button className="btn btn-primary btn-lg" onClick={startWriting}>▶ Start the timer</button>}
          {(phase === 'writing' || phase === 'timeup') && <TimerDisplay left={timer.left} total={timer.total} big />}
          {phase === 'writing' && (
            <div className="cb-row">
              <button className="btn" onClick={() => (timer.running ? timer.pause() : timer.resume())}>{timer.running ? '⏸ Pause' : '▶ Resume'}</button>
              <button className="btn" onClick={endEarly}>Pencils down</button>
            </div>
          )}
        </div>
        <ol className={`cb-cats ${phase === 'rolling' ? 'dim' : ''}`}>
          {cats.map((c, i) => <li key={i}><Bi item={c} es={es} /></li>)}
        </ol>
        {phase === 'timeup' && (
          <div className="cb-banner-over" role="alert">
            <div className="cb-banner-big">✏️ Pencils down!</div>
            {es && <div className="cb-es">¡Lápices abajo!</div>}
            <button className="btn btn-primary btn-lg" onClick={() => setPhase('reveal')}>Start the reveal →</button>
          </div>
        )}
      </div>
    )
  } else if (phase === 'reveal') {
    main = (
      <div className="cb-reveal">
        <div className="cb-reveal-step">CATEGORY {revealIdx + 1} OF {cats.length}</div>
        <div className="cb-reveal-line">
          <div className="cb-letter small">{letter}</div>
          <div className="cb-reveal-cat"><Bi item={cats[revealIdx]} es={es} /></div>
        </div>
        <p className="cb-reveal-how">
          Each team reads its answer out loud. If two teams wrote the same thing, neither scores.
          Every answer nobody else had gets a point.
        </p>
        <div className="cb-nav">
          <button className="btn" disabled={revealIdx === 0} onClick={() => setRevealIdx(i => i - 1)}>← Back</button>
          <button className="btn btn-primary btn-lg" onClick={nextReveal}>{revealIdx + 1 < cats.length ? 'Next category →' : 'Finish round'}</button>
        </div>
      </div>
    )
  } else {
    main = (
      <div className="cb-setup">
        <h2 className="cb-title">Round {round} done!</h2>
        <p className="cb-sub">Check the scoreboard, then roll a new letter.</p>
        <div className="cb-row" style={{ justifyContent: 'center' }}>
          <button className="btn" onClick={() => setPhase('setup')}>Change settings</button>
          <button className="btn btn-primary btn-lg" onClick={roll}>🎲 Next round</button>
        </div>
      </div>
    )
  }

  return (
    <div className="cb-game cb-with-score">
      <div className="cb-main">{main}</div>
      <Scoreboard teams={teams} setTeams={setTeams} />
      {editing && (
        <ListEditor
          title="My Letter Rush categories"
          help="One category per line. Great for review: “A Civics term,” “A country in Africa,” “An Enlightenment thinker.”"
          placeholder={'A Civics term\nA country in Africa\nSomething from the Abbasid Caliphate'}
          initial={custom}
          onSave={list => { setCustom(list); setEditing(false); if (list.length > 0) setSource('mine') }}
          onClose={() => setEditing(false)}
        />
      )}
    </div>
  )
}
