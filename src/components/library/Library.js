import React, { useEffect, useMemo, useState } from 'react'
import './Library.css'

// The Activity Library: a student-facing menu of the self-contained HTML
// activities in public/. Everything on this page comes from one file,
// public/activities/activities.json, so adding an activity never needs code.
// Students open #library; #library/economics opens a course directly.

const LIST_URL = '/activities/activities.json'

function courseFromHash() {
  const parts = window.location.hash.replace('#', '').split('/')
  return parts[0] === 'library' ? parts[1] || null : null
}

function visible(a) {
  return a && a.title && a.file && !a.hidden
}

export default function Library({ go }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [courseId, setCourseId] = useState(courseFromHash())
  const [query, setQuery] = useState('')

  useEffect(() => {
    // no-cache: a change to activities.json shows up on the next visit
    fetch(LIST_URL, { cache: 'no-cache' })
      .then(r => {
        if (!r.ok) throw new Error(`The activity list could not be found (${r.status}).`)
        return r.text()
      })
      .then(text => {
        try { setData(JSON.parse(text)) }
        catch (e) { throw new Error('The activity list has a typo, often a missing comma or quotation mark. ' + e.message) }
      })
      .catch(e => setError(e.message))
  }, [])

  const courses = useMemo(() => (data?.courses || []).filter(c => c && c.id && c.name), [data])
  const active = courses.find(c => c.id === courseId) || courses[0]

  const pick = (id) => {
    setCourseId(id)
    setQuery('')
    window.history.replaceState(null, '', `#library/${id}`)
  }

  // Search looks across every course, so a student who forgot which class
  // an activity belongs to still finds it.
  const q = query.trim().toLowerCase()
  const results = useMemo(() => {
    if (!q) return null
    const out = []
    courses.forEach(c => (c.units || []).forEach(u => (u.activities || []).filter(visible).forEach(a => {
      const hay = [a.title, a.description, a.day, u.name, c.name].join(' ').toLowerCase()
      if (hay.includes(q)) out.push({ ...a, course: c.name, unit: u.name })
    })))
    return out
  }, [q, courses])

  return (
    <div className="screen lib-screen">
      <div className="container-wide">
        <header className="lib-header">
          <button className="text-link lib-back" onClick={() => go('landing')}>← Kwis</button>
          <h1 className="lib-title">Activity Library</h1>
          <p className="lib-sub">Every class activity in one place. Pick your class, then open an activity in a new tab.</p>
        </header>

        {error && (
          <div className="card lib-error" role="alert">
            <strong>The library couldn’t load.</strong>
            <p>{error}</p>
          </div>
        )}

        {!error && !data && <p className="lib-muted">Loading activities…</p>}

        {!error && data && (
          <>
            <div className="lib-controls">
              <div className="lib-tabs" role="tablist" aria-label="Classes">
                {courses.map(c => (
                  <button
                    key={c.id}
                    role="tab"
                    aria-selected={!q && active?.id === c.id}
                    className={'lib-tab' + (!q && active?.id === c.id ? ' on' : '')}
                    onClick={() => pick(c.id)}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
              <input
                className="lib-search"
                type="search"
                placeholder="Search all classes"
                value={query}
                onChange={e => setQuery(e.target.value)}
                aria-label="Search all activities"
              />
            </div>

            {results && (
              <section aria-label="Search results">
                <h2 className="lib-unit">{results.length} result{results.length === 1 ? '' : 's'} for “{query.trim()}”</h2>
                {results.length === 0
                  ? <p className="lib-muted">Nothing matches. Try one word from the activity’s title.</p>
                  : <div className="lib-grid">{results.map((a, i) => <ActivityCard key={a.file + i} a={a} where={`${a.course} · ${a.unit}`} />)}</div>}
              </section>
            )}

            {!results && active && <Course course={active} />}
          </>
        )}
      </div>
    </div>
  )
}

function Course({ course }) {
  const units = (course.units || []).map(u => ({ ...u, list: (u.activities || []).filter(visible) })).filter(u => u.list.length)
  if (!units.length) return <p className="lib-muted lib-empty">No {course.name} activities yet. Check back soon.</p>
  return units.map(u => (
    <section key={u.name} className="lib-section">
      <h2 className="lib-unit">{u.name}</h2>
      <div className="lib-grid">
        {u.list.map((a, i) => <ActivityCard key={a.file + i} a={a} />)}
      </div>
    </section>
  ))
}

function ActivityCard({ a, where }) {
  return (
    <a className="lib-card" href={a.file} target="_blank" rel="noopener noreferrer">
      <span className="lib-card-top">
        {a.day && <span className="lib-day">{a.day}</span>}
        {a.isNew && <span className="badge badge-green">New</span>}
      </span>
      <span className="lib-card-title">{a.title}</span>
      {a.description && <span className="lib-card-desc">{a.description}</span>}
      {where && <span className="lib-card-where">{where}</span>}
      <span className="lib-open">Open activity ↗</span>
    </a>
  )
}
