import React, { useState } from 'react'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import Landing from './components/Landing'
import LoginScreen from './components/LoginScreen'
import TeacherAdmin from './components/TeacherAdmin'
import TeacherHost from './components/TeacherHost'
import StudentJoin from './components/StudentJoin'
import StudentLobby from './components/StudentLobby'
import StudentGame from './components/StudentGame'
import StudentFinal from './components/StudentFinal'
import GoldQuestTeacher from './components/GoldQuestTeacher'
import GoldQuestStudent from './components/GoldQuestStudent'
import './App.css'

// Teacher-only screens — redirect to login if not authed
const TEACHER_SCREENS = ['admin', 'host', 'gold-quest-host']

function AppInner() {
  const { user, loading } = useAuth()
  const [screen, setScreen] = useState('landing')
  const [gameSession, setGameSession] = useState(null)
  const [player, setPlayer] = useState(null)

  const go = (s) => {
    // If trying to reach a teacher screen without being logged in, go to login first
    if (TEACHER_SCREENS.includes(s) && !user) {
      setScreen('login')
      return
    }
    setScreen(s)
  }

  // Show nothing while Supabase checks for an existing session
  if (loading) {
    return (
      <div className="screen centered">
        <div className="dot-row">
          <div className="dot" /><div className="dot" /><div className="dot" />
        </div>
      </div>
    )
  }

  return (
    <div className="app">
      {screen === 'landing'      && <Landing go={go} />}
      {screen === 'login'        && <LoginScreen go={go} />}
      {screen === 'admin'        && user && <TeacherAdmin go={go} />}
      {screen === 'host'         && user && <TeacherHost go={go} setGameSession={setGameSession} gameSession={gameSession} />}
      {screen === 'student-join' && <StudentJoin go={go} setGameSession={setGameSession} setPlayer={setPlayer} />}
      {screen === 'student-lobby'&& <StudentLobby go={go} gameSession={gameSession} player={player} />}
      {screen === 'student-game' && <StudentGame go={go} gameSession={gameSession} player={player} setPlayer={setPlayer} />}
      {screen === 'student-final'&& <StudentFinal go={go} gameSession={gameSession} player={player} />}
      {screen === 'gold-quest-host' && user && <GoldQuestTeacher go={go} setGameSession={setGameSession} gameSession={gameSession} />}
      {screen === 'gold-quest-play' && <GoldQuestStudent go={go} gameSession={gameSession} player={player} setPlayer={setPlayer} />}
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
