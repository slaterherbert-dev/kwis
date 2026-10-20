import React, { useState, useEffect, useRef, Suspense, lazy } from 'react'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import Landing from './components/Landing'
import LoginScreen from './components/LoginScreen'
import TeacherHome from './components/TeacherHome'
import TeacherAdmin from './components/TeacherAdmin'
import TeacherHost from './components/TeacherHost'
import StudentJoin from './components/StudentJoin'
import StudentLobby from './components/StudentLobby'
import StudentGame from './components/StudentGame'
import StudentFinal from './components/StudentFinal'
import GoldQuestStudent from './components/GoldQuestStudent'
import OneVsHundredStudent from './components/OneVsHundredStudent'
import ComebackCourtStudent from './components/comeback/ComebackCourtStudent'
import './App.css'

// Bord only downloads when a teacher opens it, so students joining
// a game on Chromebooks never load it.
const Board = lazy(() => import('./components/Board'))

// Teacher-only screens — redirect to login if not authed
const TEACHER_SCREENS = ['teacher-home', 'admin', 'host', 'board']

// Teacher screens get a web address (#home, #board, ...) so they can be
// bookmarked and survive a refresh. Student screens never touch the address.
const SCREEN_TO_HASH = { 'teacher-home': 'home', admin: 'sets', host: 'host', board: 'bord' }
const HASH_TO_SCREEN = {
  ...Object.fromEntries(Object.entries(SCREEN_TO_HASH).map(([s, h]) => [h, s])),
  board: 'board', // older #board bookmarks still open Bord
}

// "#bord/abc123" belongs to the bord screen; Bord reads the part after the slash
const hashBase = () => window.location.hash.replace('#', '').split('/')[0]

function screenFromHash() {
  return HASH_TO_SCREEN[hashBase()] || null
}

function setHash(screen) {
  const hash = SCREEN_TO_HASH[screen]
  if (hash && HASH_TO_SCREEN[hashBase()] === screen) return // already there; keep any #bord/<board>
  const url = hash ? `#${hash}` : window.location.pathname + window.location.search
  // replaceState (not a new history entry) so the browser Back button can't
  // pull a teacher out of a running game.
  window.history.replaceState(null, '', url)
}

function Loading() {
  return (
    <div className="screen centered">
      <div className="dot-row">
        <div className="dot" /><div className="dot" /><div className="dot" />
      </div>
    </div>
  )
}

function AppInner() {
  const { user, loading } = useAuth()
  const [screen, setScreen] = useState('landing')
  const [gameSession, setGameSession] = useState(null)
  const [player, setPlayer] = useState(null)
  // A teacher page someone asked for before logging in (e.g. a #bord bookmark)
  const [afterLogin, setAfterLogin] = useState(null)

  // Always read the latest login state, even from an older copy of go()
  const userRef = useRef(user)
  userRef.current = user

  const show = (s) => { setScreen(s); setHash(s) }

  const go = (s) => {
    const loggedIn = !!userRef.current
    // Logged-in teachers' "Home" buttons lead to the teacher home page
    if (s === 'landing' && loggedIn) s = 'teacher-home'

    // If trying to reach a teacher screen without being logged in, go to login first
    if (TEACHER_SCREENS.includes(s) && !loggedIn) {
      setAfterLogin(s)
      show('login')
      return
    }
    show(s)
  }

  // On first load, open the page in the address bar (#board, #sets, ...)
  useEffect(() => {
    if (loading) return
    const fromHash = screenFromHash()
    if (!fromHash) return
    if (user) show(fromHash)
    else { setAfterLogin(fromHash); show('login') }
  }, [loading])

  // Right after signing in, open teacher home (or the page they asked for)
  useEffect(() => {
    if (user && screen === 'login') {
      show(afterLogin || 'teacher-home')
      setAfterLogin(null)
    }
  }, [user, screen])

  // If the teacher signs out (or the session expires), leave teacher pages
  useEffect(() => {
    if (!loading && !user && TEACHER_SCREENS.includes(screen)) show('landing')
  }, [user, loading, screen])

  // Show nothing while Supabase checks for an existing session
  if (loading) return <Loading />

  return (
    <div className="app">
      {screen === 'landing'      && <Landing go={go} />}
      {screen === 'login'        && <LoginScreen go={go} />}
      {screen === 'teacher-home' && user && <TeacherHome go={go} />}
      {screen === 'admin'        && user && <TeacherAdmin go={go} />}
      {screen === 'host'         && user && <TeacherHost go={go} setGameSession={setGameSession} gameSession={gameSession} />}
      {screen === 'board'        && user && (
        <Suspense fallback={<Loading />}><Board go={go} /></Suspense>
      )}
      {screen === 'student-join' && <StudentJoin go={go} setGameSession={setGameSession} setPlayer={setPlayer} />}
      {screen === 'student-lobby'&& <StudentLobby go={go} gameSession={gameSession} player={player} />}
      {screen === 'student-game' && <StudentGame go={go} gameSession={gameSession} player={player} setPlayer={setPlayer} />}
      {screen === 'student-final'&& <StudentFinal go={go} gameSession={gameSession} player={player} />}
      {screen === 'gold-quest-play' && <GoldQuestStudent go={go} gameSession={gameSession} player={player} setPlayer={setPlayer} />}
      {screen === 'ovh-play'     && <OneVsHundredStudent go={go} gameSession={gameSession} player={player} />}
      {screen === 'cc-play'      && <ComebackCourtStudent go={go} gameSession={gameSession} player={player} />}
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  )
}
