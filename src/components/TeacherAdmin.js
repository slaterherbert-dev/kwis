import React, { useState, useEffect } from 'react'
import { supabase } from '../supabase'

const SUBJECTS = ['Economics', 'IB History', 'Civics', 'Other']
const ADMIN_PASSWORD = 'kwis2024'

export default function TeacherAdmin({ go }) {
  const [authed, setAuthed] = useState(false)
  const [pw, setPw] = useState('')
  const [pwError, setPwError] = useState(false)
  const [sets, setSets] = useState([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState('sets') // 'sets' | 'questions'
  const [activeSet, setActiveSet] = useState(null)
  const [questions, setQuestions] = useState([])
  const [showSetModal, setShowSetModal] = useState(false)
  const [showQModal, setShowQModal] = useState(false)
  const [editingQ, setEditingQ] = useState(null)
  const [setForm, setSetForm] = useState({ name: '', subject: 'Economics' })
  const [qForm, setQForm] = useState({ question_text: '', option_a: '', option_b: '', option_c: '', option_d: '', correct_index: 0, explanation: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => { if (authed) fetchSets() }, [authed])

  async function fetchSets() {
    setLoading(true)
    const { data } = await supabase.from('question_sets').select('*').order('created_at', { ascending: false })
    setSets(data || [])
    setLoading(false)
  }

  async function fetchQuestions(setId) {
    const { data } = await supabase.from('questions').select('*').eq('set_id', setId).order('position')
    setQuestions(data || [])
  }

  async function saveSet() {
    setSaving(true)
    await supabase.from('question_sets').insert([setForm])
    setShowSetModal(false)
    setSetForm({ name: '', subject: 'Economics' })
    await fetchSets()
    setSaving(false)
  }

  async function deleteSet(id) {
    if (!window.confirm('Delete this question set and all its questions?')) return
    await supabase.from('question_sets').delete().eq('id', id)
    fetchSets()
  }

  async function openSet(set) {
    setActiveSet(set)
    await fetchQuestions(set.id)
    setView('questions')
  }

  async function saveQuestion() {
    setSaving(true)
    const payload = { ...qForm, set_id: activeSet.id, correct_index: parseInt(qForm.correct_index), position: questions.length }
    if (editingQ) {
      await supabase.from('questions').update(payload).eq('id', editingQ.id)
    } else {
      await supabase.from('questions').insert([payload])
    }
    setShowQModal(false)
    resetQForm()
    await fetchQuestions(activeSet.id)
    setSaving(false)
  }

  async function deleteQuestion(id) {
    if (!window.confirm('Delete this question?')) return
    await supabase.from('questions').delete().eq('id', id)
    fetchQuestions(activeSet.id)
  }

  function openEditQ(q) {
    setEditingQ(q)
    setQForm({ question_text: q.question_text, option_a: q.option_a, option_b: q.option_b, option_c: q.option_c, option_d: q.option_d, correct_index: q.correct_index, explanation: q.explanation || '' })
    setShowQModal(true)
  }

  function resetQForm() {
    setQForm({ question_text: '', option_a: '', option_b: '', option_c: '', option_d: '', correct_index: 0, explanation: '' })
    setEditingQ(null)
  }

  const optColors = ['var(--opt-a)', 'var(--opt-b)', 'var(--opt-c)', 'var(--opt-d)']
  const optLabels = ['A', 'B', 'C', 'D']

  if (!authed) return (
    <div className="screen centered">
      <div className="card" style={{ width: '100%', maxWidth: 360, textAlign: 'center' }}>
        <h2 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: '0.5rem' }}>Admin access</h2>
        <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginBottom: '1.5rem' }}>Enter your admin password to manage question sets</p>
        <div className="form-group">
          <input type="password" placeholder="Password" value={pw}
            onChange={e => setPw(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && (pw === ADMIN_PASSWORD ? setAuthed(true) : setPwError(true))} />
          <div className={`error-msg ${pwError ? 'show' : ''}`}>Incorrect password</div>
        </div>
        <button className="btn btn-primary btn-full" onClick={() => pw === ADMIN_PASSWORD ? (setAuthed(true), setPwError(false)) : setPwError(true)}>Enter</button>
        <button className="back-btn" style={{ marginTop: '1rem', marginBottom: 0 }} onClick={() => go('landing')}>← Back to home</button>
      </div>
    </div>
  )

  return (
    <div className="screen">
      <div className="container-wide">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            {view === 'questions' && (
              <button className="back-btn" style={{ marginBottom: 0 }} onClick={() => setView('sets')}>← Question sets</button>
            )}
            {view === 'sets' && (
              <button className="back-btn" style={{ marginBottom: 0 }} onClick={() => go('landing')}>← Home</button>
            )}
            <h1 className="gradient-text" style={{ fontSize: '1.6rem', fontWeight: 800 }}>
              {view === 'sets' ? 'Question sets' : activeSet?.name}
            </h1>
            {view === 'questions' && <span className="badge badge-accent">{activeSet?.subject}</span>}
          </div>
          <button className="btn btn-primary" onClick={() => { resetQForm(); view === 'sets' ? setShowSetModal(true) : setShowQModal(true) }}>
            + {view === 'sets' ? 'New question set' : 'Add question'}
          </button>
        </div>

        {/* SETS VIEW */}
        {view === 'sets' && (
          loading ? <p style={{ color: 'var(--muted)' }}>Loading…</p> :
          sets.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
              <p style={{ color: 'var(--muted)', marginBottom: '1rem' }}>No question sets yet. Create your first one!</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
              {sets.map(s => (
                <div key={s.id} className="card" style={{ cursor: 'pointer' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                    <div>
                      <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.3rem' }}>{s.name}</h3>
                      <span className="badge badge-accent">{s.subject}</span>
                    </div>
                  </div>
                  <p style={{ fontSize: '0.8rem', color: 'var(--muted)', marginBottom: '1rem' }}>
                    Created {new Date(s.created_at).toLocaleDateString()}
                  </p>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button className="btn" style={{ flex: 1, justifyContent: 'center', fontSize: '0.85rem', padding: '0.6rem' }} onClick={() => openSet(s)}>Edit questions</button>
                    <button className="btn btn-danger" style={{ fontSize: '0.85rem', padding: '0.6rem 0.9rem' }} onClick={() => deleteSet(s.id)}>🗑</button>
                  </div>
                </div>
              ))}
            </div>
          )
        )}

        {/* QUESTIONS VIEW */}
        {view === 'questions' && (
          <div>
            {questions.length === 0 ? (
              <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
                <p style={{ color: 'var(--muted)' }}>No questions yet. Add your first question!</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {questions.map((q, i) => (
                  <div key={q.id} className="card-sm" style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                    <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: '1.1rem', color: 'var(--muted)', minWidth: 28, paddingTop: '2px' }}>{i + 1}</div>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontWeight: 600, marginBottom: '0.5rem', lineHeight: 1.4 }}>{q.question_text}</p>
                      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                        {['option_a', 'option_b', 'option_c', 'option_d'].map((opt, oi) => (
                          <span key={opt} style={{
                            fontSize: '0.78rem', padding: '0.2rem 0.6rem', borderRadius: 8,
                            background: oi === q.correct_index ? 'rgba(0,229,160,0.15)' : 'var(--surface2)',
                            border: `1px solid ${oi === q.correct_index ? 'rgba(0,229,160,0.4)' : 'var(--border)'}`,
                            color: oi === q.correct_index ? 'var(--green)' : 'var(--muted)'
                          }}>
                            {optLabels[oi]}. {q[opt]}
                          </span>
                        ))}
                      </div>
                      {q.explanation && <p style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: '0.4rem', fontStyle: 'italic' }}>{q.explanation}</p>}
                    </div>
                    <div style={{ display: 'flex', gap: '0.4rem', flexShrink: 0 }}>
                      <button className="btn" style={{ padding: '0.45rem 0.75rem', fontSize: '0.8rem' }} onClick={() => openEditQ(q)}>Edit</button>
                      <button className="btn btn-danger" style={{ padding: '0.45rem 0.75rem', fontSize: '0.8rem' }} onClick={() => deleteQuestion(q.id)}>🗑</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* NEW SET MODAL */}
      {showSetModal && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setShowSetModal(false)}>
          <div className="modal">
            <h2>New question set</h2>
            <div className="form-group">
              <label>Set name</label>
              <input placeholder="e.g. Econ — Government & the Economy" value={setForm.name} onChange={e => setSetForm({ ...setForm, name: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Subject</label>
              <select value={setForm.subject} onChange={e => setSetForm({ ...setForm, subject: e.target.value })}>
                {SUBJECTS.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button className="btn" onClick={() => setShowSetModal(false)}>Cancel</button>
              <button className="btn btn-primary" disabled={!setForm.name || saving} onClick={saveSet}>{saving ? 'Saving…' : 'Create set'}</button>
            </div>
          </div>
        </div>
      )}

      {/* NEW / EDIT QUESTION MODAL */}
      {showQModal && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && (setShowQModal(false), resetQForm())}>
          <div className="modal">
            <h2>{editingQ ? 'Edit question' : 'Add question'}</h2>
            <div className="form-group">
              <label>Question</label>
              <textarea placeholder="Enter the question text…" value={qForm.question_text} onChange={e => setQForm({ ...qForm, question_text: e.target.value })} />
            </div>
            {['option_a', 'option_b', 'option_c', 'option_d'].map((opt, i) => (
              <div className="form-group" key={opt}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ display: 'inline-block', width: 18, height: 18, borderRadius: '50%', background: optColors[i], fontSize: '0.65rem', textAlign: 'center', lineHeight: '18px', color: 'white', fontWeight: 700 }}>{optLabels[i]}</span>
                  Option {optLabels[i]} {i === parseInt(qForm.correct_index) && <span className="badge badge-green">Correct</span>}
                </label>
                <input placeholder={`Option ${optLabels[i]}`} value={qForm[opt]} onChange={e => setQForm({ ...qForm, [opt]: e.target.value })} />
              </div>
            ))}
            <div className="form-group">
              <label>Correct answer</label>
              <select value={qForm.correct_index} onChange={e => setQForm({ ...qForm, correct_index: e.target.value })}>
                {optLabels.map((l, i) => <option key={i} value={i}>Option {l}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Explanation (shown after reveal)</label>
              <textarea placeholder="Why is this the correct answer?" value={qForm.explanation} onChange={e => setQForm({ ...qForm, explanation: e.target.value })} />
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button className="btn" onClick={() => { setShowQModal(false); resetQForm(); }}>Cancel</button>
              <button className="btn btn-primary" disabled={!qForm.question_text || !qForm.option_a || saving} onClick={saveQuestion}>{saving ? 'Saving…' : editingQ ? 'Save changes' : 'Add question'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
