import React, { useState } from 'react'
import Landing from './components/Landing'
import TeacherAdmin from './components/TeacherAdmin'
import TeacherHost from './components/TeacherHost'
import StudentJoin from './components/StudentJoin'
import StudentLobby from './components/StudentLobby'
import StudentGame from './components/StudentGame'
import StudentFinal from './components/StudentFinal'
import './App.css'

export default function App() {
  const [screen, setScreen] = useState('landing')
  const [gameSession, setGameSession] = useState(null)
  const [player, setPlayer] = useState(null)

  const go = (s) => setScreen(s)

  return (
    <div className="app">
      {screen === 'landing' && <Landing go={go} />}
      {screen === 'admin' && <TeacherAdmin go={go} />}
      {screen === 'host' && <TeacherHost go={go} setGameSession={setGameSession} gameSession={gameSession} />}
      {screen === 'student-join' && <StudentJoin go={go} setGameSession={setGameSession} setPlayer={setPlayer} />}
      {screen === 'student-lobby' && <StudentLobby go={go} gameSession={gameSession} player={player} />}
      {screen === 'student-game' && <StudentGame go={go} gameSession={gameSession} player={player} setPlayer={setPlayer} />}
      {screen === 'student-final' && <StudentFinal go={go} gameSession={gameSession} player={player} />}
    </div>
  )
}
