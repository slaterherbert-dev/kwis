// ═══════════════════════════════════════════════════════════════
// COMEBACK COURT — the rules, in one place.
// The teacher's host screen applies these after every reveal and saves
// each player's new court. Student screens only read the result.
// ═══════════════════════════════════════════════════════════════

export const THRONE_STREAK = 5     // right answers in a row to reach the Throne
export const CLIMB_TARGET = 2      // right answers in a row to climb out of the Comeback Court
export const COMEBACK_BONUS = 300  // points for climbing out
export const THRONE_MULTIPLIER = 1.5

export const COURTS = {
  throne:   { key: 'throne',   name: 'The Throne',      short: 'Throne' },
  winners:  { key: 'winners',  name: 'Winners’ Court',  short: 'Winners' },
  comeback: { key: 'comeback', name: 'Comeback Court',  short: 'Comeback' },
}
export const COURT_ORDER = ['throne', 'winners', 'comeback'] // top to bottom

// Speed points for a right answer, same as Classic: 1,000 for instant, never below 500.
export function speedPoints(secondsLeft, totalSeconds) {
  return Math.max(500, Math.round(1000 * (secondsLeft / totalSeconds)))
}

// A player's Comeback Court state, with safe defaults for brand-new players.
export function ccStateOf(p) {
  return {
    court: p && COURTS[p.cc_court] ? p.cc_court : 'winners',
    streak: (p && p.cc_streak) || 0,
    climb: (p && p.cc_climb) || 0,
    comebacks: (p && p.cc_comebacks) || 0,
    score: (p && p.score) || 0,
    move: (p && p.cc_move) || null,
    gain: (p && p.cc_gain) || 0,
    round: p && typeof p.cc_round === 'number' ? p.cc_round : -1,
  }
}

// Works out where a player lands after one question.
//   state    from ccStateOf()
//   correct  true if they answered right (no answer counts as wrong)
//   base     their speed points for a right answer (500–1,000)
// Returns the new state, plus `move` (what happened) and `gain` (points earned).
export function nextCourtState(state, correct, base) {
  const s = { ...state }

  if (s.court === 'throne') {
    if (correct) {
      const gain = Math.round(base * THRONE_MULTIPLIER)
      return { ...s, streak: s.streak + 1, score: s.score + gain, move: 'held-throne', gain }
    }
    // A miss on the Throne only drops you one court
    return { ...s, court: 'winners', streak: 0, move: 'dethroned', gain: 0 }
  }

  if (s.court === 'winners') {
    if (correct) {
      const streak = s.streak + 1
      const crowned = streak >= THRONE_STREAK
      return { ...s, court: crowned ? 'throne' : 'winners', streak, score: s.score + base, move: crowned ? 'crowned' : 'correct', gain: base }
    }
    return { ...s, court: 'comeback', streak: 0, climb: 0, move: 'dropped', gain: 0 }
  }

  // Comeback Court
  if (correct) {
    const climb = s.climb + 1
    if (climb >= CLIMB_TARGET) {
      return {
        ...s, court: 'winners', climb: 0, streak: 0, comebacks: s.comebacks + 1,
        score: s.score + COMEBACK_BONUS, move: 'climbed', gain: COMEBACK_BONUS
      }
    }
    return { ...s, climb, move: 'climbing', gain: 0 }
  }
  return { ...s, climb: 0, move: s.climb > 0 ? 'slipped' : 'missed', gain: 0 }
}

// Which court a player was in before this move (for animations)
export function previousCourt(state) {
  switch (state.move) {
    case 'dropped': return 'winners'
    case 'dethroned': return 'throne'
    case 'crowned': return 'winners'
    case 'climbed': return 'comeback'
    default: return state.court
  }
}

// The database columns that hold a player's Comeback Court state
export function toPlayerColumns(state, round) {
  return {
    score: state.score,
    cc_court: state.court,
    cc_streak: state.streak,
    cc_climb: state.climb,
    cc_comebacks: state.comebacks,
    cc_move: state.move,
    cc_gain: state.gain,
    cc_round: round,
  }
}
