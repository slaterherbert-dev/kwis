import React, { useEffect, useState } from 'react'
import { COURT_ORDER, COURTS, THRONE_STREAK, CLIMB_TARGET, COMEBACK_BONUS } from '../../lib/comebackCourt'

// Crown for the Throne
export function CrownIcon({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <path d="M4 11 L10 17 L16 7 L22 17 L28 11 L26 25 H6 Z" fill="currentColor" />
      <rect x="6" y="26" width="20" height="3" rx="1.2" fill="currentColor" opacity="0.75" />
      <circle cx="4" cy="10" r="2.2" fill="currentColor" />
      <circle cx="16" cy="6" r="2.2" fill="currentColor" />
      <circle cx="28" cy="10" r="2.2" fill="currentColor" />
      <circle cx="16" cy="19.5" r="2" fill="#000" opacity="0.25" />
    </svg>
  )
}

// Shield with a star for the Winners' Court
export function ShieldIcon({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <path d="M16 3 L27 7 V15 C27 21.5 22.5 26.5 16 29 C9.5 26.5 5 21.5 5 15 V7 Z" fill="currentColor" />
      <path d="M16 10 L17.9 14 L22.2 14.4 L19 17.3 L19.9 21.5 L16 19.3 L12.1 21.5 L13 17.3 L9.8 14.4 L14.1 14 Z" fill="#000" opacity="0.28" />
    </svg>
  )
}

// Stairs with an arrow for the Comeback Court
export function StairsIcon({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <path d="M3 28 V22 H10 V16 H17 V10 H24 V28 Z" fill="currentColor" />
      <path d="M17 6 L27 6 L27 16" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M27 6 L19 14" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

export function CourtIcon({ court, size }) {
  if (court === 'throne') return <CrownIcon size={size} />
  if (court === 'comeback') return <StairsIcon size={size} />
  return <ShieldIcon size={size} />
}

// Small climb-progress dots (Comeback Court): ● ○
export function ClimbDots({ climb, target = 2 }) {
  return (
    <span className="cc-dots" aria-label={`${climb} of ${target} to climb out`}>
      {Array.from({ length: target }, (_, i) => <span key={i} className={i < climb ? 'on' : ''} />)}
    </span>
  )
}

// Student screen: three steps rising left to right, with the student's marker
// sliding from where they were to where they are now.
const STEP_INDEX = { comeback: 0, winners: 1, throne: 2 }

export function MiniStairs({ from, to, avatar }) {
  const [at, setAt] = useState(from || to)
  useEffect(() => {
    setAt(from || to)
    const t = setTimeout(() => setAt(to), 350)
    return () => clearTimeout(t)
  }, [from, to])

  const steps = [...COURT_ORDER].reverse() // comeback, winners, throne
  const i = STEP_INDEX[at] ?? 1
  return (
    <div className="cc-mini" role="img" aria-label={`You are in ${COURTS[to]?.name || ''}`}>
      {steps.map(c => (
        <div key={c} className={`cc-mini-step cc-${c} ${c === to ? 'here' : ''}`}>
          <CourtIcon court={c} size={18} />
          <span>{COURTS[c].short}</span>
        </div>
      ))}
      <div className="cc-mini-marker" style={{ left: `calc(${i} * 33.333% + 16.666%)`, bottom: `calc(${(i + 1) * 30}% + 6px)` }}>
        {avatar || '🙂'}
      </div>
    </div>
  )
}

// The three rules, as shown in the student lobby and on the projector before question 1
export function CourtRules() {
  return (
    <div className="cc-rules">
      <div className="cc-rule cc-winners">
        <ShieldIcon size={24} />
        <span>Everyone starts in the <strong>Winners’ Court</strong>. Right answers score points. Miss one and you drop down.</span>
      </div>
      <div className="cc-rule cc-comeback">
        <StairsIcon size={24} />
        <span>In the <strong>Comeback Court</strong>, get {CLIMB_TARGET} right in a row to climb back up, plus a {COMEBACK_BONUS}-point bonus.</span>
      </div>
      <div className="cc-rule cc-throne">
        <CrownIcon size={24} />
        <span>Get {THRONE_STREAK} right in a row to take <strong>the Throne</strong>. Points count 1.5× up there.</span>
      </div>
    </div>
  )
}
