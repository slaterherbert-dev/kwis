import React, { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'

export default function LoginScreen({ go }) {
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  const { signIn, signUp } = useAuth()

  async function handleSubmit() {
    setError('')
    setMessage('')

    if (!email.trim() || !password) { setError('Please fill in all fields.'); return }
    if (mode === 'signup' && password !== confirm) { setError('Passwords do not match.'); return }
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return }

    setLoading(true)

    if (mode === 'login') {
      const { error } = await signIn(email, password)
      if (error) setError('Incorrect email or password.')
      else go('landing')
    } else {
      const { error } = await signUp(email, password)
      if (error) setError(error.message)
      else {
        setMessage('Account created! Check your email to confirm, then log in.')
        setMode('login')
        setPassword('')
        setConfirm('')
      }
    }

    setLoading(false)
  }

  return (
    <div className="screen centered" style={{
      background: 'radial-gradient(ellipse at 50% 0%, rgba(108,99,255,0.15) 0%, transparent 65%)'
    }}>
      <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <h1 className="gradient-text" style={{ fontSize: '3.5rem', fontWeight: 800, letterSpacing: '-2px', marginBottom: '0.25rem' }}>Kwis</h1>
        <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
          {mode === 'login' ? 'Sign in to your teacher account' : 'Create your teacher account'}
        </p>
      </div>

      <div className="card" style={{ width: '100%', maxWidth: 380 }}>

        {error && (
          <div style={{
            background: 'rgba(255,71,87,0.12)', border: '1px solid rgba(255,71,87,0.3)',
            borderRadius: 'var(--radius)', padding: '0.65rem 1rem',
            color: 'var(--red)', fontSize: '0.85rem', marginBottom: '1.25rem'
          }}>
            {error}
          </div>
        )}

        {message && (
          <div style={{
            background: 'rgba(0,229,160,0.1)', border: '1px solid rgba(0,229,160,0.3)',
            borderRadius: 'var(--radius)', padding: '0.65rem 1rem',
            color: 'var(--green)', fontSize: '0.85rem', marginBottom: '1.25rem'
          }}>
            {message}
          </div>
        )}

        <div className="form-group">
          <label>Email</label>
          <input
            type="email"
            placeholder="you@school.edu"
            value={email}
            onChange={e => setEmail(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            autoComplete="email"
          />
        </div>

        <div className="form-group">
          <label>Password</label>
          <input
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          />
        </div>

        {mode === 'signup' && (
          <div className="form-group">
            <label>Confirm password</label>
            <input
              type="password"
              placeholder="••••••••"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              autoComplete="new-password"
            />
          </div>
        )}

        <button
          className="btn btn-primary btn-full"
          disabled={loading}
          onClick={handleSubmit}
          style={{ marginTop: '0.25rem' }}
        >
          {loading ? 'Please wait…' : mode === 'login' ? 'Sign in →' : 'Create account →'}
        </button>

        <hr className="divider" style={{ marginTop: '1.25rem' }} />

        <p style={{ textAlign: 'center', fontSize: '0.85rem', color: 'var(--muted)' }}>
          {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
          <button
            onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(''); setMessage('') }}
            style={{
              background: 'none', border: 'none', color: 'var(--accent)',
              cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem',
              textDecoration: 'underline', fontFamily: 'inherit', padding: 0
            }}
          >
            {mode === 'login' ? 'Sign up' : 'Sign in'}
          </button>
        </p>
      </div>
    </div>
  )
}
