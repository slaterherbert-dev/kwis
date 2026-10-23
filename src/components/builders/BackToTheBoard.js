import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../supabase'
import { WORDS } from './prompts'
import { useSaved, useDeck, useKeys, useCountdown, TimerDisplay, chime, Bi, ListEditor, Choices, Scoreboard } from './common'

const TIME_OPTIONS = [{ label: '45 sec', value: 45 }, { label: '60 sec', value: 60 }, { label: '90 sec', value: 90 }]
const OPT_KEYS = ['option_a', 'option_b', 'option_c', 'option_d']

export default function BackToTheBoard({ es, teams, setTeams }) {
  const [source, setSource] = useSaved('bb-source', 'fun')
  const [seconds, setSeconds] = useSaved('bb-seconds', 60)
  const [custom, setCustom] = useSaved('bb-custom', [])
  const [editing, setEditing] = useState(false)
  const [sets, setSets] = useState([])
  const [setId, setSetId] = useSaved('bb-set', '')
  const [setWords, setSetWords] = useState([])

  const [phase, setPhase] = useState('setup') // setup | ready | playing | summary
  const [activeId, setActiveId] = useState(null)
  const [results, setResults] = useState([])

  // Your question sets, for "From a question set"
  useEffect(() => {
    supabase.from('question_sets').select('id, name').order('name').then(({ data }) => setSets(data || []))
  }, [])
  useEffect(() => {
    if (source !== 'set' || !setId) { setSetWords([]); return }
    supabase.from('questions').select('option_a, option_b, option_c, option_d, correct_index').eq('set_id', setId)
      .then(({ data }) => {
        const seen = new Set()
        const words = []
        ;(data || []).forEach(q => {
          const w = (q[OPT_KEYS[q.correct_index]] || '').trim()
          const key = w.toLowerCase()
          if (w && w.length <= 40 && !seen.has(key)) { seen.add(key); words.push({ en: w }) }
        })
        setSetWords(words)
      })
  }, [source, setId])

  const items = useMemo(() => {
    if (source === 'mine') return custom.map(en => ({ en }))
    if (source === 'set') return setWords
    if (source === 'socialStudies') return WORDS.socialStudies
    return WORDS.fun
  }, [source, custom, setWords])
  const deck = useDeck(items)

  const active = teams.find(t => t.id === activeId) || teams[0]
  const timer = useCountdown(() => { chime(); setPhase('summary') })

  function getReady(teamId) { setActiveId(teamId); setResults([]); timer.reset(seconds); setPhase('ready') }
  function start() { deck.next(); timer.start(seconds); setPhase('playing') }
  function gotIt() {
    if (phase !== 'playing' || !deck.item) return
    setResults(r => [...r, { word: deck.item, got: true }])
    setTeams(ts => ts.map(t => (t.id === active.id ? { ...t, score: t.score + 1 } : t)))
    deck.next()
  }
  function skip() {
    if (phase !== 'playing' || !deck.item) return
    setResults(r => [...r, { word: deck.item, got: false }])
    deck.next()
  }
  function nextTeam() {
    const i = teams.findIndex(t => t.id === active.id)
    getReady(teams[(i + 1) % teams.length].id)
  }

  useKeys({
    ' ': () => (phase === 'ready' ? start() : phase === 'playing' ? gotIt() : null),
    Enter: gotIt,
    ArrowRight: gotIt,
    s: skip,
    ArrowDown: skip,
  })

  const sourceOptions = [
    { label: 'Fun words', value: 'fun' },
    { label: 'Social Studies', value: 'socialStudies' },
    { label: 'From a question set', value: 'set' },
    ...(custom.length > 0 ? [{ label: `Mine (${custom.length})`, value: 'mine' }] : []),
  ]
  const got = results.filter(r => r.got).length

  let main
  if (phase === 'setup') {
    main = (
      <div className="cb-setup">
        <h2 className="cb-title">Back to the Board</h2>
        <p className="cb-sub">One student sits with their back to the screen. Their team gives clues for each word without saying it. Every word guessed is a point.</p>
        <Choices label="Words" options={sourceOptions} value={source} onChange={setSource} />
        {source === 'set' && (
          <div className="cb-choices">
            <span className="cb-choices-label">Question set</span>
            <select className="cb-select" value={setId} onChange={e => setSetId(e.target.value)} aria-label="Question set">
              <option value="">Choose a set…</option>
              {sets.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            {setId && <span className="cb-count">{setWords.length} words (the correct answers)</span>}
          </div>
        )}
        <button className="cb-chip" style={{ marginTop: '0.5rem' }} onClick={() => setEditing(true)}>✏️ Edit my words</button>
        <Choices label="Round length" options={TIME_OPTIONS} value={seconds} onChange={setSeconds} />
        <button className="btn btn-primary btn-lg" style={{ marginTop: '1.2rem' }} disabled={items.length === 0}
          onClick={() => getReady(active.id)}>
          Start with {active.name}
        </button>
      </div>
    )
  } else if (phase === 'ready') {
    main = (
      <div className="cb-setup">
        <div className="cb-up" style={{ '--team': active.color }}>{active.name} is up!</div>
        <p className="cb-sub" style={{ fontSize: '1.2rem' }}>
          Guesser: sit with your back to the screen. Teammates: give clues, but don’t say the word!
        </p>
        <button className="btn btn-primary btn-lg" onClick={start}>▶ Start ({seconds} sec)</button>
        <p className="cb-keys">During the round: → or Enter = got it · S or ↓ = skip</p>
      </div>
    )
  } else if (phase === 'playing') {
    main = (
      <div className="cb-bb">
        <div className="cb-bb-top">
          <span className="cb-up small" style={{ '--team': active.color }}>{active.name}</span>
          <TimerDisplay left={timer.left} total={timer.total} />
          <span className="cb-count">✓ {got}</span>
        </div>
        <div className="cb-bb-word"><Bi item={deck.item} es={es} /></div>
        <div className="cb-nav">
          <button className="btn btn-lg cb-skip" onClick={skip}>Skip ↓</button>
          <button className="btn btn-primary btn-lg cb-got" onClick={gotIt}>Got it! ✓</button>
        </div>
      </div>
    )
  } else {
    main = (
      <div className="cb-setup">
        <div className="cb-up" style={{ '--team': active.color }}>⏰ Time! {active.name} got {got}</div>
        <div className="cb-results">
          {results.map((r, i) => (
            <span key={i} className={`cb-result ${r.got ? 'got' : 'skip'}`}>{r.got ? '✓' : '↷'} {r.word.en}</span>
          ))}
          {results.length === 0 && <span className="cb-hint">No words this round.</span>}
        </div>
        <div className="cb-row" style={{ justifyContent: 'center' }}>
          <button className="btn" onClick={() => setPhase('setup')}>Change settings</button>
          <button className="btn btn-primary btn-lg" onClick={nextTeam}>Next team ▶</button>
        </div>
      </div>
    )
  }

  return (
    <div className="cb-game cb-with-score">
      <div className="cb-main">{main}</div>
      <Scoreboard teams={teams} setTeams={setTeams} activeId={phase === 'setup' ? null : active.id}
        onSelect={phase === 'setup' || phase === 'summary' ? id => setActiveId(id) : undefined} />
      {editing && (
        <ListEditor
          title="My Back to the Board words"
          help="One word or phrase per line. Vocabulary from your unit works great."
          placeholder={'checks and balances\nfederalism\nveto\nimpeachment'}
          initial={custom}
          onSave={list => { setCustom(list); setEditing(false); if (list.length > 0) setSource('mine') }}
          onClose={() => setEditing(false)}
        />
      )}
    </div>
  )
}
