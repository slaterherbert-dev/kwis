// How long students get per question. The teacher picks this on the Host
// screen; it's saved on the game (game_sessions.question_seconds) so every
// screen in the game uses the same number. Picture questions get extra time
// on top of this (see secondsFor in questionImages.js).

export const DEFAULT_QUESTION_SECONDS = 20
export const QUESTION_SECONDS_OPTIONS = [10, 15, 20, 30]

const SAVED_KEY = 'kwis-question-seconds'

// The per-question time for a game (falls back to 20 for older games)
export function baseSeconds(session) {
  const n = session && Number(session.question_seconds)
  return n >= 5 && n <= 120 ? n : DEFAULT_QUESTION_SECONDS
}

// The teacher's last choice, remembered on this computer only
export function savedQuestionSeconds() {
  try {
    const n = Number(localStorage.getItem(SAVED_KEY))
    return QUESTION_SECONDS_OPTIONS.includes(n) ? n : DEFAULT_QUESTION_SECONDS
  } catch (e) {
    return DEFAULT_QUESTION_SECONDS
  }
}

export function saveQuestionSeconds(n) {
  try { localStorage.setItem(SAVED_KEY, String(n)) } catch (e) { /* ignore */ }
}

// Timer color by how much time is left, so short timers don't start out yellow
export function timerColorFor(left, total) {
  const f = total > 0 ? left / total : 0
  return f > 0.5 ? 'var(--green)' : f > 0.25 ? 'var(--yellow)' : 'var(--red)'
}
