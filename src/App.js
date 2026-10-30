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
import ConquestStudent from './components/conquest/ConquestStudent'
import DaalderStudentLogin from './daalder/DaalderStudentLogin'
import DaalderStudentHome from './daalder/DaalderStudentHome'
import './App.css'

// Bord only downloads when a teacher opens it, so students joining
// a game on Chromebooks never load it.
const Board = lazy(() => import('./components/Board'))
const Builders = lazy(() => import('./components/builders/Builders'))
const DaalderRoster = lazy(() => import('./daalder/DaalderRoster'))
const DaalderTeacherLogin = lazy(() => import('./daalder/DaalderTeacherLogin'))
// Teacher-only screens — redirect to login if not authed
const TEACHER_SCREENS = ['teacher-home', 'admin', 'host', 'board', 'builders', 'daalder-roster']

// Teacher screens get a web address (#home, #board, ...) so they can be
// bookmarked and survive a refresh. Student screens never touch the address,
// except Daalder, which students reach at #daalder.
const SCREEN_TO_HASH = {
  'teacher-home': 'home', admin: 'sets', host: 'host', board: 'bord', builders: 'builders',
  'daalder-roster': 'daalder-roster',
}
const HASH_TO_SCREEN = {
  ...Object.fromEntries(Object.entries(SCREEN_TO_HASH).map(([s, h]) => [h, s])),
  board: 'board', // older #board bookmarks still open Bord
}
const STUDENT_HASH = { 'daalder-login': 'daalder', 'daalder-home': 'daalder' }

// "#bord/abc123" belongs to the bord screen; Bord reads the part after the slash
const hashBase = () => window.location.hash.replace('#', '').split('/')[0]

function screenFromHash() {
  return HASH_TO_SCREEN[hashBase()] || null
}

function setHash(screen) {
  const hash = SCREEN_TO_HASH[screen] || STUDENT_HASH[screen]
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

  // Daalder students have real logins too. Only non-student accounts count
  // as teachers, so a signed-in student can never open a teacher screen.
  const isStudentAccount = user?.app_metadata?.daalder_role === 'student'
  const teacher = user && !isStudentAccount ? user : null

  const [screen, setScreen] = useState('landing')
  const [gameSession, setGameSession] = useState(null)
  const [player, setPlayer] = useState(null)
  // A teacher page someone asked for before logging in (e.g. a #bord bookmark)
  const [afterLogin, setAfterLogin] = useState(null)

  // Always read the latest login state, even from an older copy of go()
  const teacherRef = useRef(teacher)
  teacherRef.current = teacher

  const show = (s) => { setScreen(s); setHash(s) }

  const go = (s) => {
    const loggedIn = !!teacherRef.current
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

  // On first load, open the page in the address bar (#board, #sets, #daalder, ...)
  useEffect(() => {
    if (loading) return
    if (hashBase() === 'daalder') {
      show(isStudentAccount ? 'daalder-home' : 'daalder-login')
      return
    }
    const fromHash = screenFromHash()
    if (!fromHash) return
    if (teacher) show(fromHash)
    else { setAfterLogin(fromHash); show('login') }
  }, [loading])

  // Right after signing in, open teacher home (or the page they asked for)
  useEffect(() => {
    if (teacher && screen === 'login') {
      show(afterLogin || 'teacher-home')
      setAfterLogin(null)
    }
  }, [teacher, screen])

  // If the teacher signs out (or the session expires), leave teacher pages
  useEffect(() => {
    if (!loading && !teacher && TEACHER_SCREENS.includes(screen)) show('landing')
  }, [teacher, loading, screen])

  // If a student's session ends, send them back to the Daalder sign-in
  useEffect(() => {
    if (!loading && !isStudentAccount && screen === 'daalder-home') show('daalder-login')
  }, [isStudentAccount, loading, screen])

  // Show nothing while Supabase checks for an existing session
  if (loading) return <Loading />

  return (
    <div className="app">
      {screen === 'landing'      && <Landing go={go} />}
      {screen === 'login' && afterLogin !== 'daalder-roster' && <LoginScreen go={go} />}
      {screen === 'login' && afterLogin === 'daalder-roster' && (
      <Suspense fallback={<Loading />}>
      <DaalderTeacherLogin onStudentPage={() => { setAfterLogin(null); show('daalder-login') }} />
      </Suspense>
      )}
      {screen === 'teacher-home' && teacher && <TeacherHome go={go} />}
      {screen === 'admin'        && teacher && <TeacherAdmin go={go} />}
      {screen === 'host'         && teacher && <TeacherHost go={go} setGameSession={setGameSession} gameSession={gameSession} />}
      {screen === 'board'        && teacher && (
        <Suspense fallback={<Loading />}><Board go={go} /></Suspense>
      )}
      {screen === 'builders'     && teacher && (
        <Suspense fallback={<Loading />}><Builders go={go} /></Suspense>
      )}
      {screen === 'daalder-roster' && teacher && (
        <Suspense fallback={<Loading />}><DaalderRoster go={go} /></Suspense>
      )}
      {screen === 'daalder-login' && <DaalderStudentLogin onSignedIn={() => show('daalder-home')} />}
      {screen === 'daalder-home'  && isStudentAccount && <DaalderStudentHome onSignOut={() => show('daalder-login')} />}
      {screen === 'student-join' && <StudentJoin go={go} setGameSession={setGameSession} setPlayer={setPlayer} />}
      {screen === 'student-lobby'&& <StudentLobby go={go} gameSession={gameSession} player={player} />}
      {screen === 'student-game' && <StudentGame go={go} gameSession={gameSession} player={player} setPlayer={setPlayer} />}
      {screen === 'student-final'&& <StudentFinal go={go} gameSession={gameSession} player={player} />}
      {screen === 'gold-quest-play' && <GoldQuestStudent go={go} gameSession={gameSession} player={player} setPlayer={setPlayer} />}
      {screen === 'ovh-play'     && <OneVsHundredStudent go={go} gameSession={gameSession} player={player} />}
      {screen === 'cc-play'      && <ComebackCourtStudent go={go} gameSession={gameSession} player={player} />}
      {screen === 'cq-play'      && <ConquestStudent go={go} gameSession={gameSession} player={player} />}
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
