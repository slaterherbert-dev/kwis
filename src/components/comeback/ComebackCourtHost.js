import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { supabase } from '../../supabase'
import QuestionImage from '../QuestionImage'
import { secondsFor, preloadImage } from '../../lib/questionImages'
import { seededShuffleIndices } from '../../lib/shuffle'
import { baseSeconds, timerColorFor } from '../../lib/timing'
import {
  COURTS, COURT_ORDER, THRONE_STREAK, CLIMB_TARGET,
  ccStateOf, nextCourtState, toPlayerColumns,
} from '../../lib/comebackCourt'
import { CourtIcon, CrownIcon, StairsIcon, ClimbDots, CourtRules } from './CourtArt'
import './ComebackCourt.css'

// ═══════════════════════════════════════════════════════════════
// COMEBACK COURT — TEACHER / PROJECTOR SCREEN
// This screen runs the game: it starts each question, and after each reveal
// it applies the court rules for every player and saves the results.
// Students only submit answers.
// ═══════════════════════════════════════════════════════════════

const OPT_LABELS = ['A', 'B', 'C', 'D']
const OPT_KEYS = ['option_a', 'option_b', 'option_c', 'option_d']
const OPT_COLORS = ['var(--opt-a)', 'var(--opt-b)', 'var(--opt-c)', 'var(--opt-d)']
const DRAMATIC_PAUSE_MS = 1400 // show the right answer first, then move the courts

const RULE_LINE = {
  throne: '1.5× points. A miss drops you one court.',
  winners: `${THRONE_STREAK} in a row takes the Throne.`,
  comeback: `${CLIMB_TARGET} in a row climbs back up.`,
}

const UP_MOVES = ['climbed']
const DOWN_MOVES = ['dropped', 'dethroned']

export default function ComebackCourtHost({ session, questions, players, answers, onEndGame }) {
  const QUESTION_SECONDS = baseSeconds(session) // teacher's choice for this game
  const [stage, setStage] = useState('intro') // intro | question | revealed | finale
  const [currentQ, setCurrentQ] = useState(-1)
  const [timer, setTimer] = useState(QUESTION_SECONDS)
  const [timerTotal, setTimerTotal] = useState(QUESTION_SECONDS)
  const [ccMap, setCcMap] = useState({})     // player id → court state (this screen is the source of truth)
  const [revealInfo, setRevealInfo] = useState(null)
  const [moved, setMoved] = useState(false)  // courts updated for the current reveal

  const timerRef = useRef(null)
  const rosterRef = useRef(new Set())        // players present when the question started
  const processedRef = useRef(new Set())     // question indexes already scored
  const ccMapRef = useRef({})
  const playersRef = useRef(players)
  playersRef.current = players

  useEffect(() => () => clearInterval(timerRef.current), [])

  const stateOf = p => ccMap[p.id] || ccStateOf(p)

  // ── Smooth sliding: when a chip changes place, animate it from where it was ──
  const chipRefs = useRef({})
  const lastRects = useRef({})
  useLayoutEffect(() => {
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    for (const [id, el] of Object.entries(chipRefs.current)) {
      // A chip that left the screen (staircase hidden during a question) starts fresh next time
      if (!el) { delete lastRects.current[id]; delete chipRefs.current[id]; continue }
      const now = el.getBoundingClientRect()
      const before = lastRects.current[id]
      lastRects.current[id] = now
      if (!before || reduce || !el.animate) continue
      const dx = before.left - now.left
      const dy = before.top - now.top
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
        el.animate(
          [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }],
          { duration: 900, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' }
        )
      }
    }
  })

  // ── Questions ──
  async function loadQuestion(idx) {
    clearInterval(timerRef.current)
    const q = questions[idx]
    if (!q) return
    rosterRef.current = new Set(playersRef.current.map(p => p.id))
    const seconds = secondsFor(q, QUESTION_SECONDS)
    if (questions[idx + 1]) preloadImage(questions[idx + 1].image_url)
    setCurrentQ(idx)
    setTimerTotal(seconds)
    setTimer(seconds)
    setRevealInfo(null)
    setMoved(false)
    setStage('question')
    await supabase.from('game_sessions').update({ current_question: idx, phase: 'question', revealed: false }).eq('id', session.id)
    let t = seconds
    timerRef.current = setInterval(() => {
      t--
      setTimer(t)
      if (t <= 0) {
        clearInterval(timerRef.current)
        timerRef.current = null
        reveal(idx)
      }
    }, 1000)
  }

  async function reveal(idx) {
    if (processedRef.current.has(idx)) return
    processedRef.current.add(idx)
    clearInterval(timerRef.current)
    timerRef.current = null
    setStage('revealed')
    await supabase.from('game_sessions').update({ phase: 'revealed', revealed: true }).eq('id', session.id)

    const q = questions[idx]
    const { data } = await supabase.from('answers')
      .select('player_id, answer_given, is_correct, points_earned')
      .eq('session_id', session.id).eq('question_index', idx)
    const rows = data || []
    const byPlayer = {}
    rows.forEach(a => { if (!byPlayer[a.player_id]) byPlayer[a.player_id] = a })
    const dist = [0, 0, 0, 0]
    rows.forEach(a => { if (a.answer_given >= 0 && a.answer_given <= 3) dist[a.answer_given]++ })
    const inGame = playersRef.current.filter(p => rosterRef.current.has(p.id))
    const correctCount = inGame.filter(p => byPlayer[p.id]?.is_correct).length
    setRevealInfo({ dist, correctCount, total: inGame.length, q })

    await new Promise(r => setTimeout(r, DRAMATIC_PAUSE_MS))

    // Apply the court rules to everyone who was in the game when the question started
    const nextMap = { ...ccMapRef.current }
    const updates = []
    for (const p of inGame) {
      const before = nextMap[p.id] || ccStateOf(p)
      const a = byPlayer[p.id]
      const correct = !!(a && a.is_correct && a.answer_given === q.correct_index)
      const base = correct ? Math.min(1000, Math.max(500, a.points_earned || 500)) : 0
      const after = { ...nextCourtState(before, correct, base), round: idx }
      nextMap[p.id] = after
      updates.push(supabase.from('players').update(toPlayerColumns(after, idx)).eq('id', p.id))
    }
    ccMapRef.current = nextMap
    setCcMap(nextMap)
    setMoved(true)
    await Promise.all(updates)
  }

  function next() {
    if (currentQ + 1 < questions.length) loadQuestion(currentQ + 1)
    else setStage('finale')
  }

  // ── Derived ──
  const q = currentQ >= 0 ? questions[currentQ] : null
  const order = q ? seededShuffleIndices(4, `${session.id}-${q.id}`) : [0, 1, 2, 3]
  const correctDisplay = q ? order.indexOf(q.correct_index) : -1
  const answeredCount = answers.filter(a => a.question_index === currentQ && rosterRef.current.has(a.player_id)).length
  const rosterSize = players.filter(p => rosterRef.current.has(p.id)).length

  const byCourt = { throne: [], winners: [], comeback: [] }
  players.forEach(p => {
    const s = stateOf(p)
    ;(byCourt[s.court] || byCourt.winners).push({ p, s })
  })
  COURT_ORDER.forEach(c => byCourt[c].sort((a, b) => b.s.score - a.s.score || a.p.nickname.localeCompare(b.p.nickname)))

  const roundMoves = players.map(p => stateOf(p)).filter(s => s.round === currentQ && moved)
  const countMoves = names => roundMoves.filter(s => names.includes(s.move)).length

  const timerColor = timerColorFor(timer, timerTotal)

  // ── Pieces ──
  // Each court gets wider as more students land in it
  const width = c => (c === 'winners' ? 1.3 : 0.85) + byCourt[c].length / 8
  const staircase = (
    <div className="cc-stairs" style={{ gridTemplateColumns: `${width('comeback')}fr ${width('winners')}fr ${width('throne')}fr` }}>
      {['comeback', 'winners', 'throne'].map(court => (
        <section key={court} className={`cc-step cc-${court}`} aria-label={COURTS[court].name}>
          <div className="cc-step-head">
            <CourtIcon court={court} size={30} />
            <div>
              <div className="cc-step-name">{COURTS[court].name}</div>
              <div className="cc-step-rule">{RULE_LINE[court]}</div>
            </div>
            <span className="cc-step-count">{byCourt[court].length}</span>
          </div>
          <div className="cc-chips">
            {byCourt[court].length === 0 && (
              <span className="cc-empty">{court === 'throne' ? 'Nobody yet' : court === 'comeback' ? 'Empty for now' : 'Empty'}</span>
            )}
            {byCourt[court].map(({ p, s }) => {
              const fresh = moved && s.round === currentQ
              const cls = !fresh ? '' : s.move === 'crowned' ? 'crowned' : UP_MOVES.includes(s.move) ? 'moved-up' : DOWN_MOVES.includes(s.move) ? 'moved-down' : ''
              return (
                <span key={p.id} ref={el => { chipRefs.current[p.id] = el }} className={`cc-chip ${cls}`}>
                  <span aria-hidden="true">{p.avatar}</span>
                  {p.nickname}
                  {court === 'comeback' && <ClimbDots climb={s.climb} target={CLIMB_TARGET} />}
                  {cls === 'moved-up' && <span className="cc-chip-badge">↑</span>}
                  {cls === 'moved-down' && <span className="cc-chip-badge">↓</span>}
                  {cls === 'crowned' && <span className="cc-chip-badge">♛</span>}
                </span>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )

  const header = (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
      <span style={{ color: 'var(--cc-gold)' }}><CrownIcon size={26} /></span>
      <h1 style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: '1.4rem' }}>Comeback Court</h1>
      {q && stage !== 'finale' && (
        <span style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>Question {currentQ + 1} of {questions.length}</span>
      )}
    </div>
  )

  // ── INTRO ──
  if (stage === 'intro') return (
    <div className="screen cc">
      <div className="container-wide cc-wide">
        {header}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 1fr) 2.4fr', gap: '1.25rem', alignItems: 'start' }}>
          <div>
            <CourtRules />
            <button className="btn btn-primary btn-full btn-lg" style={{ marginTop: '1rem' }} onClick={() => loadQuestion(0)}>
              Start question 1
            </button>
            <p style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: '0.6rem' }}>
              {questions.length} questions. No answer counts as a miss.
            </p>
          </div>
          {staircase}
        </div>
      </div>
    </div>
  )

  // ── QUESTION ──
  if (stage === 'question' && q) return (
    <div className="screen cc">
      <div className="container-wide cc-wide">
        {header}
        <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 320 }}>
            <div className="card" style={{ marginBottom: '1rem' }}>
              <p style={{ fontSize: '1.35rem', fontWeight: 700, fontFamily: 'Syne', lineHeight: 1.4 }}>{q.question_text}</p>
            </div>
            <QuestionImage q={q} maxHeight="42vh" />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
              {order.map((origIdx, i) => (
                <div key={OPT_KEYS[origIdx]} style={{
                  padding: '0.9rem 1rem', borderRadius: 'var(--radius)',
                  background: `color-mix(in srgb, ${OPT_COLORS[i]} 14%, transparent)`,
                  border: `1px solid color-mix(in srgb, ${OPT_COLORS[i]} 45%, transparent)`,
                }}>
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: '0.2rem' }}>{OPT_LABELS[i]}</span>
                  <span style={{ fontSize: '1rem', fontWeight: 500 }}>{q[OPT_KEYS[origIdx]]}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ width: 280, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div className="card-sm" style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: '3rem', color: timerColor, lineHeight: 1 }}>{timer}</div>
              <div style={{ height: 6, borderRadius: 3, background: 'var(--surface2)', overflow: 'hidden', marginTop: '0.6rem' }}>
                <div style={{ height: '100%', width: `${(timer / timerTotal) * 100}%`, background: timerColor, transition: 'width 1s linear' }} />
              </div>
              <p style={{ fontSize: '0.9rem', color: 'var(--muted)', marginTop: '0.6rem' }}>
                <strong style={{ color: 'var(--text)' }}>{answeredCount}</strong> of {rosterSize} answered
              </p>
            </div>
            <div className="cc-counts">
              {COURT_ORDER.map(c => (
                <div key={c} className={`cc-count cc-${c}`}>
                  <CourtIcon court={c} size={22} />
                  <span>{COURTS[c].name}</span>
                  <strong>{byCourt[c].length}</strong>
                </div>
              ))}
            </div>
            <button className="btn btn-primary btn-full" onClick={() => reveal(currentQ)}>Reveal answer</button>
          </div>
        </div>
      </div>
    </div>
  )

  // ── REVEALED ──
  if (stage === 'revealed' && q) return (
    <div className="screen cc">
      <div className="container-wide cc-wide">
        {header}
        <div className="cc-reveal-strip">
          <div className="cc-answer">
            <p style={{ fontSize: '0.8rem', color: 'var(--green)', fontWeight: 700 }}>Correct answer</p>
            <p style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: '1.35rem', marginTop: '0.15rem' }}>
              {OPT_LABELS[correctDisplay]}. {q[OPT_KEYS[q.correct_index]]}
            </p>
            {q.explanation && <p style={{ fontSize: '0.9rem', color: 'var(--muted)', marginTop: '0.35rem', lineHeight: 1.5 }}>{q.explanation}</p>}
          </div>
          <div className="cc-summary">
            {revealInfo && (
              <span className="cc-summary-item">✓ {revealInfo.correctCount} of {revealInfo.total} correct</span>
            )}
            {moved && countMoves(['dropped']) > 0 && (
              <span className="cc-summary-item" style={{ color: 'var(--cc-ember)' }}>↓ {countMoves(['dropped'])} to the Comeback Court</span>
            )}
            {moved && countMoves(['climbed']) > 0 && (
              <span className="cc-summary-item" style={{ color: '#5ee6a8' }}>↑ {countMoves(['climbed'])} climbed out</span>
            )}
            {moved && countMoves(['crowned']) > 0 && (
              <span className="cc-summary-item" style={{ color: 'var(--cc-gold)' }}>♛ {countMoves(['crowned'])} crowned</span>
            )}
            {moved && countMoves(['dethroned']) > 0 && (
              <span className="cc-summary-item" style={{ color: 'var(--cc-ember)' }}>{countMoves(['dethroned'])} knocked off the Throne</span>
            )}
          </div>
        </div>

        {staircase}

        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
          <button className="btn" onClick={() => setStage('finale')}>End game</button>
          <button className="btn btn-primary btn-lg" disabled={!moved} onClick={next}>
            {currentQ + 1 < questions.length ? `Next question (${currentQ + 2} of ${questions.length})` : 'See the winners'}
          </button>
        </div>
      </div>
    </div>
  )

  // ── FINALE ──
  const standings = players.map(p => ({ p, s: stateOf(p) })).sort((a, b) => b.s.score - a.s.score)
  const top3 = standings.slice(0, 3)
  const bestComeback = [...standings]
    .filter(x => x.s.comebacks > 0)
    .sort((a, b) => b.s.comebacks - a.s.comebacks || b.s.score - a.s.score)[0]

  return (
    <div className="screen cc">
      <div className="container-wide cc-wide">
        {header}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
          {top3.map(({ p, s }, i) => (
            <div key={p.id} className={`cc-award ${i === 0 ? 'cc-throne' : 'cc-winners'}`}>
              <div style={{ color: 'var(--court)' }}>{i === 0 ? <CrownIcon size={44} /> : <CourtIcon court="winners" size={36} />}</div>
              <div className="cc-award-title">{['Champion', 'Second place', 'Third place'][i]}</div>
              <div className="cc-award-name">{p.avatar} {p.nickname}</div>
              <div className="cc-award-note">{s.score.toLocaleString()} points</div>
            </div>
          ))}
          <div className="cc-award cc-comeback">
            <div style={{ color: 'var(--court)' }}><StairsIcon size={40} /></div>
            <div className="cc-award-title">Best Comeback</div>
            {bestComeback ? (
              <>
                <div className="cc-award-name">{bestComeback.p.avatar} {bestComeback.p.nickname}</div>
                <div className="cc-award-note">Climbed out {bestComeback.s.comebacks} time{bestComeback.s.comebacks !== 1 ? 's' : ''}</div>
              </>
            ) : (
              <div className="cc-award-note" style={{ marginTop: '0.6rem' }}>Nobody needed a comeback this game.</div>
            )}
          </div>
        </div>
        {staircase}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
          <button className="btn btn-primary btn-lg" onClick={onEndGame}>Show full results</button>
        </div>
      </div>
    </div>
  )
}
