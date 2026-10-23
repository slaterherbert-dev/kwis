import React, { useEffect, useState } from 'react'
import WouldYouRather from './WouldYouRather'
import StandUpIf from './StandUpIf'
import LetterRush from './LetterRush'
import BackToTheBoard from './BackToTheBoard'
import { useSaved, DEFAULT_TEAMS } from './common'
import './Builders.css'

// ═══════════════════════════════════════════════════════════════
// CLASS BUILDERS — projector-only games. Students don't join anything:
// they move around the room, stand up, or write on paper.
// Nothing about students is saved; custom lists and team names are
// saved in this teacher's browser only.
// ═══════════════════════════════════════════════════════════════

const GAMES = [
  { id: 'would-you-rather', group: 'class', icon: '↔️', title: 'Would You Rather', desc: 'Two choices, two sides of the room. Students walk to their pick and defend it.', Comp: WouldYouRather },
  { id: 'stand-up-if', group: 'class', icon: '🧍', title: 'Stand Up If…', desc: 'Students stand when a prompt fits them and see what they have in common.', Comp: StandUpIf },
  { id: 'letter-rush', group: 'team', icon: '🔤', title: 'Letter Rush', desc: 'One letter, eight categories. Only answers no other team wrote score.', Comp: LetterRush },
  { id: 'back-to-the-board', group: 'team', icon: '🙈', title: 'Back to the Board', desc: 'One teammate faces away; the team gives clues for the word on screen.', Comp: BackToTheBoard },
]

function gameFromHash() {
  const sub = window.location.hash.replace('#', '').split('/')[1]
  return GAMES.some(g => g.id === sub) ? sub : null
}

export default function Builders({ go }) {
  const [gameId, setGameId] = useState(gameFromHash)
  const [es, setEs] = useSaved('spanish', false)
  const [teams, setTeams] = useSaved('teams', DEFAULT_TEAMS)
  const [isFull, setIsFull] = useState(!!document.fullscreenElement)

  // Each game gets its own address (#builders/letter-rush) so a refresh stays put
  useEffect(() => {
    const want = '#builders' + (gameId ? '/' + gameId : '')
    if (window.location.hash !== want) window.history.replaceState(null, '', want)
  }, [gameId])
  useEffect(() => {
    const onFs = () => setIsFull(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onFs)
    return () => document.removeEventListener('fullscreenchange', onFs)
  }, [])

  function toggleFull() {
    try {
      if (document.fullscreenElement) document.exitFullscreen()
      else document.documentElement.requestFullscreen()
    } catch (e) { /* not supported */ }
  }

  const game = GAMES.find(g => g.id === gameId)

  const header = (
    <header className="cb-header">
      <button className="btn" onClick={() => (game ? setGameId(null) : go('teacher-home'))}>
        {game ? '← All builders' : '← Home'}
      </button>
      <h1 className="cb-h1">{game ? <><span aria-hidden="true">{game.icon}</span> {game.title}</> : 'Class Builders'}</h1>
      <div className="cb-header-tools">
        <label className="cb-switch">
          <input type="checkbox" checked={es} onChange={e => setEs(e.target.checked)} />
          <span>Español</span>
        </label>
        <button className="btn" onClick={toggleFull}>{isFull ? 'Exit full screen' : '⛶ Full screen'}</button>
      </div>
    </header>
  )

  if (game) {
    const { Comp } = game
    return (
      <div className="screen cb-screen">
        {header}
        <Comp es={es} teams={teams} setTeams={setTeams} />
      </div>
    )
  }

  const section = (group, title, blurb) => (
    <section className="cb-section">
      <h2>{title}</h2>
      <p className="cb-section-blurb">{blurb}</p>
      <div className="tool-grid">
        {GAMES.filter(g => g.group === group).map(g => (
          <button key={g.id} className="tool-tile" onClick={() => setGameId(g.id)}>
            <span className="tool-icon" aria-hidden="true">{g.icon}</span>
            <span className="tool-title">{g.title}</span>
            <span className="tool-desc">{g.desc}</span>
          </button>
        ))}
      </div>
    </section>
  )

  return (
    <div className="screen cb-screen">
      {header}
      <p className="cb-intro">Everything runs on your projector. Students don’t need to join or log in.</p>
      {section('class', 'Class builders', 'Whole class, low stakes. Great for the first week, Mondays, or after a break.')}
      {section('team', 'Team builders', 'Small groups compete. Bring scratch paper. The scoreboard carries over between games.')}
    </div>
  )
}
