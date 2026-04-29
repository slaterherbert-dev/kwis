import React, { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { useAuth } from '../contexts/AuthContext'

const SUBJECTS = ['Economics', 'IB History', 'Civics', 'Other']

function generateCode(existingCodes = []) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code
  do {
    const rand = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
    code = `KWIS-${rand}`
  } while (existingCodes.includes(code))
  return code
}

export default function TeacherAdmin({ go }) {
  const { user, signOut } = useAuth()
  const [sets, setSets] = useState([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState('sets')
  const [activeSet, setActiveSet] = useState(null)
  const [questions, setQuestions] = useState([])
  const [showSetModal, setShowSetModal] = useState(false)
  const [showQModal, setShowQModal] = useState(false)
  const [editingQ, setEditingQ] = useState(null)
  const [setForm, setSetForm] = useState({ name: '', subject: 'Economics' })
  const [qForm, setQForm] = useState({ question_text: '', option_a: '', option_b: '', option_c: '', option_d: '', correct_index: 0, explanation: '' })
  const [saving, setSaving] = useState(false)

  // Share modal state
  const [shareTarget, setShareTarget] = useState(null)
  const [shareCode, setShareCode] = useState('')
  const [shareCopied, setShareCopied] = useState(false)
  const [showShareModal, setShowShareModal] = useState(false)

  // Import via code modal state
  const [showImportModal, setShowImportModal] = useState(false)
  const [importCode, setImportCode] = useState('')
  const [importStatus, setImportStatus] = useState(null) // null | 'loading' | 'success' | 'error'
  const [importError, setImportError] = useState('')

  // Import via CSV modal state
  const [showCSVModal, setShowCSVModal] = useState(false)
  const [csvSetName, setCsvSetName] = useState('')
  const [csvSubject, setCsvSubject] = useState('Economics')
  const [csvStatus, setCsvStatus] = useState(null) // null | 'loading' | 'success' | 'error'
  const [csvError, setCsvError] = useState('')
  const [csvPreview, setCsvPreview] = useState([]) // parsed rows before import

  useEffect(() => { fetchSets() }, [])

  async function fetchSets() {
    setLoading(true)
    const { data } = await supabase
      .from('question_sets')
      .select('*')
      .order('created_at', { ascending: false })
    setSets(data || [])
    setLoading(false)
  }

  async function fetchQuestions(setId) {
    const { data } = await supabase.from('questions').select('*').eq('set_id', setId).order('position')
    setQuestions(data || [])
  }

  async function saveSet() {
    setSaving(true)
    await supabase.from('question_sets').insert([{
      ...setForm,
      teacher_id: user.id
    }])
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

  async function handleSignOut() {
    await signOut()
    go('landing')
  }

  // --- SHARE ---
  async function openShareModal(set) {
    let code = set.share_code

    if (!code) {
      const existingCodes = sets.map(s => s.share_code).filter(Boolean)
      code = generateCode(existingCodes)

      const { error } = await supabase
        .from('question_sets')
        .update({ share_code: code })
        .eq('id', set.id)

      if (error) {
        alert('Could not generate share code. Please try again.')
        return
      }

      setSets(prev => prev.map(s => s.id === set.id ? { ...s, share_code: code } : s))
    }

    setShareTarget({ ...set, share_code: code })
    setShareCode(code)
    setShareCopied(false)
    setShowShareModal(true)
  }

  function copyShareCode() {
    navigator.clipboard.writeText(shareCode).then(() => {
      setShareCopied(true)
      setTimeout(() => setShareCopied(false), 2000)
    })
  }

  // --- IMPORT ---
  function openImportModal() {
    setImportCode('')
    setImportStatus(null)
    setImportError('')
    setShowImportModal(true)
  }

  async function importByCode() {
    const code = importCode.trim().toUpperCase()
    if (!code) return

    setImportStatus('loading')
    setImportError('')

    const { data, error } = await supabase.rpc('get_shared_set', { p_code: code })

    if (error || !data) {
      setImportStatus('error')
      setImportError('Something went wrong. Please try again.')
      return
    }

    if (data.error === 'not_found') {
      setImportStatus('error')
      setImportError(`No question set found for code "${code}". Double-check and try again.`)
      return
    }

    const { set: srcSet, questions: srcQuestions } = data

    if (srcSet.user_id === user.id) {
      setImportStatus('error')
      setImportError("That's one of your own sets — no need to import it!")
      return
    }

    const { data: newSet, error: setErr } = await supabase
      .from('question_sets')
      .insert([{
        name: srcSet.name,
        subject: srcSet.subject,
        user_id: user.id
      }])
      .select()
      .single()

    if (setErr || !newSet) {
      setImportStatus('error')
      setImportError('Failed to create question set. Please try again.')
      return
    }

    if (srcQuestions && srcQuestions.length > 0) {
      const questionCopies = srcQuestions.map(q => ({
        set_id: newSet.id,
        question_text: q.question_text,
        option_a: q.option_a,
        option_b: q.option_b,
        option_c: q.option_c,
        option_d: q.option_d,
        correct_index: q.correct_index,
        explanation: q.explanation,
        position: q.position
      }))

      const { error: qErr } = await supabase.from('questions').insert(questionCopies)

      if (qErr) {
        await supabase.from('question_sets').delete().eq('id', newSet.id)
        setImportStatus('error')
        setImportError('Failed to import questions. Please try again.')
        return
      }
    }

    setImportStatus('success')
    await fetchSets()
  }

  // --- CSV IMPORT ---
  function downloadTemplate() {
    const header = 'question_text,option_a,option_b,option_c,option_d,correct_index,explanation'
    const example1 = 'Who was the first U.S. president?,George Washington,Abraham Lincoln,Thomas Jefferson,John Adams,0,Washington served as the first president from 1789 to 1797'
    const example2 = 'What is the law of demand?,Price up = quantity up,Price up = quantity down,Price down = quantity down,No relationship between price and quantity,1,As price increases consumers buy less — inverse relationship'
    const csv = [header, example1, example2].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'kwis_question_template.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  function openCSVModal() {
    setCsvSetName('')
    setCsvSubject('Economics')
    setCsvStatus(null)
    setCsvError('')
    setCsvPreview([])
    setShowCSVModal(true)
  }

  function parseCSV(text) {
    const lines = text.trim().split('\n').map(l => l.trim()).filter(Boolean)
    if (lines.length < 2) return { error: 'File appears to be empty or only has a header row.' }

    const header = lines[0].toLowerCase().split(',').map(h => h.trim().replace(/"/g, ''))
    const required = ['question_text', 'option_a', 'option_b', 'option_c', 'option_d', 'correct_index']
    const missing = required.filter(col => !header.includes(col))
    if (missing.length > 0) return { error: `Missing required columns: ${missing.join(', ')}` }

    const rows = []
    for (let i = 1; i < lines.length; i++) {
      // Handle quoted fields with commas inside them
      const cols = []
      let current = ''
      let inQuotes = false
      for (const char of lines[i]) {
        if (char === '"') { inQuotes = !inQuotes }
        else if (char === ',' && !inQuotes) { cols.push(current.trim()); current = '' }
        else { current += char }
      }
      cols.push(current.trim())

      const row = {}
      header.forEach((h, idx) => { row[h] = (cols[idx] || '').replace(/^"|"$/g, '').trim() })

      const ci = parseInt(row.correct_index)
      if (isNaN(ci) || ci < 0 || ci > 3) return { error: `Row ${i + 1}: correct_index must be 0, 1, 2, or 3 (got "${row.correct_index}")` }
      if (!row.question_text) return { error: `Row ${i + 1}: question_text is empty` }
      if (!row.option_a || !row.option_b || !row.option_c || !row.option_d) return { error: `Row ${i + 1}: all four options are required` }

      rows.push({ ...row, correct_index: ci })
    }

    return { rows }
  }

  function handleCSVFile(e) {
    const file = e.target.files[0]
    if (!file) return
    setCsvError('')
    setCsvStatus(null)
    setCsvPreview([])
    const reader = new FileReader()
    reader.onload = (evt) => {
      const { rows, error } = parseCSV(evt.target.result)
      if (error) { setCsvError(error); return }
      setCsvPreview(rows)
    }
    reader.readAsText(file)
  }

  async function importCSV() {
    if (!csvSetName.trim() || csvPreview.length === 0) return
    setCsvStatus('loading')
    setCsvError('')

    const { data: newSet, error: setErr } = await supabase
      .from('question_sets')
      .insert([{ name: csvSetName.trim(), subject: csvSubject, user_id: user.id }])
      .select()
      .single()

    if (setErr || !newSet) {
      setCsvStatus('error')
      setCsvError('Failed to create question set. Please try again.')
      return
    }

    const questions = csvPreview.map((row, i) => ({
      set_id: newSet.id,
      question_text: row.question_text,
      option_a: row.option_a,
      option_b: row.option_b,
      option_c: row.option_c,
      option_d: row.option_d,
      correct_index: row.correct_index,
      explanation: row.explanation || '',
      position: i
    }))

    const { error: qErr } = await supabase.from('questions').insert(questions)
    if (qErr) {
      await supabase.from('question_sets').delete().eq('id', newSet.id)
      setCsvStatus('error')
      setCsvError('Failed to import questions. Please try again.')
      return
    }

    setCsvStatus('success')
    await fetchSets()
  }

  const optColors = ['var(--opt-a)', 'var(--opt-b)', 'var(--opt-c)', 'var(--opt-d)']
  const optLabels = ['A', 'B', 'C', 'D']

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

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>{user?.email}</span>
            <button className="btn" style={{ fontSize: '0.8rem', padding: '0.45rem 0.9rem' }} onClick={handleSignOut}>
              Sign out
            </button>
            {view === 'sets' && (
              <button className="btn" style={{ fontSize: '0.8rem', padding: '0.45rem 0.9rem' }} onClick={openImportModal}>
                ↓ Import code
              </button>
            )}
            {view === 'sets' && (
              <button className="btn" style={{ fontSize: '0.8rem', padding: '0.45rem 0.9rem' }} onClick={openCSVModal}>
                ↑ Import CSV
              </button>
            )}
            <button className="btn btn-primary" onClick={() => { resetQForm(); view === 'sets' ? setShowSetModal(true) : setShowQModal(true) }}>
              + {view === 'sets' ? 'New question set' : 'Add question'}
            </button>
          </div>
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
                    {s.share_code && (
                      <span style={{
                        fontSize: '0.65rem', fontFamily: 'monospace', fontWeight: 700,
                        color: 'var(--accent)', background: 'rgba(99,102,241,0.1)',
                        border: '1px solid var(--accent)', borderRadius: 6,
                        padding: '0.2rem 0.45rem', letterSpacing: '0.05em'
                      }}>
                        {s.share_code}
                      </span>
                    )}
                  </div>
                  <p style={{ fontSize: '0.8rem', color: 'var(--muted)', marginBottom: '1rem' }}>
                    Created {new Date(s.created_at).toLocaleDateString()}
                  </p>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button className="btn" style={{ flex: 1, justifyContent: 'center', fontSize: '0.85rem', padding: '0.6rem' }} onClick={() => openSet(s)}>Edit questions</button>
                    <button className="btn" style={{ fontSize: '0.85rem', padding: '0.6rem 0.9rem' }} title="Share" onClick={() => openShareModal(s)}>⤴</button>
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

      {/* SHARE MODAL */}
      {showShareModal && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setShowShareModal(false)}>
          <div className="modal">
            <h2>Share question set</h2>
            <p style={{ color: 'var(--muted)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
              Give this code to another teacher. They can import a full copy of <strong>{shareTarget?.name}</strong> into their own account.
            </p>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              background: 'var(--surface)', border: '2px solid var(--accent)',
              borderRadius: 'var(--radius)', padding: '0.9rem 1.1rem', marginBottom: '1.25rem'
            }}>
              <span style={{ fontFamily: 'monospace', fontSize: '1.5rem', fontWeight: 700, letterSpacing: '0.1em', color: 'var(--accent)' }}>
                {shareCode}
              </span>
              <button className="btn btn-primary" style={{ fontSize: '0.8rem', padding: '0.4rem 0.9rem' }} onClick={copyShareCode}>
                {shareCopied ? '✓ Copied!' : 'Copy'}
              </button>
            </div>
            <p style={{ fontSize: '0.75rem', color: 'var(--muted)', marginBottom: '1.5rem' }}>
              This code is permanent and reusable — any teacher with it can import a copy.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn" onClick={() => setShowShareModal(false)}>Done</button>
            </div>
          </div>
        </div>
      )}

      {/* IMPORT MODAL */}
      {showImportModal && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setShowImportModal(false)}>
          <div className="modal">
            <h2>Import question set</h2>

            {importStatus === 'success' ? (
              <div style={{ textAlign: 'center', padding: '1.5rem 0' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>✅</div>
                <p style={{ fontWeight: 700, marginBottom: '0.4rem' }}>Question set imported!</p>
                <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
                  It's now in your question sets, ready to edit and use.
                </p>
                <button className="btn btn-primary" onClick={() => setShowImportModal(false)}>View my sets</button>
              </div>
            ) : (
              <>
                <p style={{ color: 'var(--muted)', fontSize: '0.9rem', marginBottom: '1.25rem' }}>
                  Enter a share code from another teacher to import a full copy of their question set into your account.
                </p>
                <div className="form-group">
                  <label>Share code</label>
                  <input
                    placeholder="e.g. KWIS-4X9Z"
                    value={importCode}
                    onChange={e => { setImportCode(e.target.value.toUpperCase()); setImportStatus(null); setImportError('') }}
                    style={{ fontFamily: 'monospace', fontSize: '1.1rem', letterSpacing: '0.05em' }}
                    onKeyDown={e => e.key === 'Enter' && importStatus !== 'loading' && importByCode()}
                  />
                </div>
                {importStatus === 'error' && (
                  <p style={{ color: 'var(--red)', fontSize: '0.85rem', marginTop: '-0.5rem', marginBottom: '1rem' }}>
                    {importError}
                  </p>
                )}
                <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                  <button className="btn" onClick={() => setShowImportModal(false)}>Cancel</button>
                  <button
                    className="btn btn-primary"
                    disabled={!importCode.trim() || importStatus === 'loading'}
                    onClick={importByCode}
                  >
                    {importStatus === 'loading' ? 'Importing…' : 'Import'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
      {/* CSV IMPORT MODAL */}
      {showCSVModal && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setShowCSVModal(false)}>
          <div className="modal">
            <h2>Import questions from CSV</h2>

            {csvStatus === 'success' ? (
              <div style={{ textAlign: 'center', padding: '1.5rem 0' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>✅</div>
                <p style={{ fontWeight: 700, marginBottom: '0.4rem' }}>Questions imported!</p>
                <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
                  {csvPreview.length} question{csvPreview.length !== 1 ? 's' : ''} added to <strong>{csvSetName}</strong>.
                </p>
                <button className="btn btn-primary" onClick={() => setShowCSVModal(false)}>View my sets</button>
              </div>
            ) : (
              <>
                <p style={{ color: 'var(--muted)', fontSize: '0.9rem', marginBottom: '1.25rem' }}>
                  Upload a CSV file to bulk-import questions into a new question set.
                </p>

                {/* Download template */}
                <div style={{
                  background: 'rgba(108,99,255,0.08)', border: '1px solid rgba(108,99,255,0.2)',
                  borderRadius: 'var(--radius)', padding: '0.85rem 1rem', marginBottom: '1.25rem',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem'
                }}>
                  <div>
                    <p style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.2rem' }}>Need a template?</p>
                    <p style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>Download, fill it in, then upload below.</p>
                  </div>
                  <button className="btn" style={{ fontSize: '0.8rem', padding: '0.45rem 0.9rem', flexShrink: 0 }} onClick={downloadTemplate}>
                    ↓ Template
                  </button>
                </div>

                <div className="form-group">
                  <label>Set name</label>
                  <input
                    placeholder="e.g. Vietnam Unit Review"
                    value={csvSetName}
                    onChange={e => setCsvSetName(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label>Subject</label>
                  <select value={csvSubject} onChange={e => setCsvSubject(e.target.value)}>
                    {SUBJECTS.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>

                <div className="form-group">
                  <label>CSV file</label>
                  <input
                    type="file"
                    accept=".csv"
                    onChange={handleCSVFile}
                    style={{ padding: '0.5rem' }}
                  />
                </div>

                {/* Preview */}
                {csvPreview.length > 0 && (
                  <div style={{
                    background: 'rgba(0,229,160,0.08)', border: '1px solid rgba(0,229,160,0.25)',
                    borderRadius: 'var(--radius)', padding: '0.75rem 1rem', marginBottom: '1rem'
                  }}>
                    <p style={{ fontSize: '0.85rem', color: 'var(--green)', fontWeight: 600, marginBottom: '0.3rem' }}>
                      ✓ {csvPreview.length} question{csvPreview.length !== 1 ? 's' : ''} ready to import
                    </p>
                    <p style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>
                      First: "{csvPreview[0].question_text.slice(0, 60)}{csvPreview[0].question_text.length > 60 ? '…' : ''}"
                    </p>
                  </div>
                )}

                {csvError && (
                  <p style={{ color: 'var(--red)', fontSize: '0.85rem', marginBottom: '1rem' }}>
                    ⚠ {csvError}
                  </p>
                )}

                <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                  <button className="btn" onClick={() => setShowCSVModal(false)}>Cancel</button>
                  <button
                    className="btn btn-primary"
                    disabled={!csvSetName.trim() || csvPreview.length === 0 || csvStatus === 'loading'}
                    onClick={importCSV}
                  >
                    {csvStatus === 'loading' ? 'Importing…' : `Import ${csvPreview.length > 0 ? csvPreview.length + ' questions' : ''}`}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
