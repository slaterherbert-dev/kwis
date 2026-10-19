import React, { useState, useEffect, useRef } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { listBoards, createBoard, updateBoard, deleteBoard, storageMode } from './board/storage'
import { BACKGROUNDS, bgStyle, compressImage } from './board/backgrounds'
import { WIDGETS } from './board/widgets'
import WidgetFrame from './board/WidgetFrame'
import './board/Board.css'

const LAST_BOARD_KEY = 'kwis-last-board'

// Lexend is designed for reading ease, which matters on a projector. It's
// loaded on its own so that if a network blocks Google Fonts, the Board
// still works with a fallback font.
function loadBoardFont() {
  if (document.getElementById('kwis-board-font')) return
  const link = document.createElement('link')
  link.id = 'kwis-board-font'
  link.rel = 'stylesheet'
  link.href = 'https://fonts.googleapis.com/css2?family=Lexend:wght@400;500;700&display=swap'
  document.head.appendChild(link)
}
const newId = () => Math.random().toString(36).slice(2, 10)

function makeWidget(type, place = {}, props = {}, tone) {
  const def = WIDGETS[type]
  return {
    id: newId(), type, z: 1,
    x: 50 - def.size.w / 2, y: 40 - def.size.h / 2, ...def.size, ...place,
    tone: tone || def.tone,
    props: { ...def.defaults, ...props },
  }
}

// A new board starts with the daily layout: agenda, learning target, reminder
function starterBoard() {
  return {
    bg: BACKGROUNDS[0],
    widgets: [
      makeWidget('text', { x: 3, y: 4, w: 46, h: 34 }, { title: 'Agenda', body: '1. \n2. \n3. ' }, 'pink'),
      makeWidget('text', { x: 3, y: 42, w: 46, h: 40 }, { title: 'Learning target', body: '' }, 'yellow'),
      makeWidget('text', { x: 52, y: 4, w: 45, h: 78 }, { title: 'Reminder', body: '' }, 'red'),
    ],
  }
}

export default function Board({ go }) {
  const { user } = useAuth()
  const [boards, setBoards] = useState([])
  const [currentId, setCurrentId] = useState(null)
  const [data, setData] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [save, setSave] = useState('saved') // saved | saving | error
  const [saveError, setSaveError] = useState('')
  const [selected, setSelected] = useState(null)
  const [panel, setPanel] = useState(null) // null | 'boards' | 'background'
  const [toolbarHidden, setToolbarHidden] = useState(false)
  const [bgError, setBgError] = useState('')
  const boardRef = useRef(null)
  const dirty = useRef(false)
  const latest = useRef({ id: null, data: null })
  latest.current = { id: currentId, data }

  useEffect(loadBoardFont, [])

  // ── Load boards (create the first one if there are none) ──
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { boards: list, error } = await listBoards()
      if (cancelled) return
      if (error) { setLoadError(error); return }
      let all = list
      if (!all.length) {
        const { board, error: createError } = await createBoard(user.id, 'My board', starterBoard())
        if (createError || !board) { setLoadError(createError || 'Couldn’t create your first board.'); return }
        all = [board]
      }
      let last = null
      try { last = localStorage.getItem(LAST_BOARD_KEY) } catch {}
      const open = all.find(b => b.id === last) || all[0]
      setBoards(all)
      setCurrentId(open.id)
      setData(open.data)
    })()
    return () => { cancelled = true }
  }, [user.id])

  // ── Autosave shortly after each change ──
  const change = updater => { dirty.current = true; setData(updater) }

  useEffect(() => {
    if (!dirty.current || !currentId) return
    setSave('saving')
    const t = setTimeout(async () => {
      dirty.current = false
      const { error } = await updateBoard(currentId, { data })
      setBoards(bs => bs.map(b => (b.id === currentId ? { ...b, data } : b)))
      if (error) { setSave('error'); setSaveError(error) } else { setSave('saved'); setSaveError('') }
    }, 700)
    return () => clearTimeout(t)
  }, [data, currentId])

  // Save anything pending when leaving the Board
  useEffect(() => () => {
    if (dirty.current && latest.current.id) updateBoard(latest.current.id, { data: latest.current.data })
  }, [])

  // ── Widget actions ──
  const updateWidget = (id, patch) =>
    change(d => ({ ...d, widgets: d.widgets.map(w => (w.id === id ? { ...w, ...patch } : w)) }))
  const updateProps = (id, patch) =>
    change(d => ({ ...d, widgets: d.widgets.map(w => (w.id === id ? { ...w, props: { ...w.props, ...patch } } : w)) }))
  const removeWidget = id => { change(d => ({ ...d, widgets: d.widgets.filter(w => w.id !== id) })); setSelected(null) }

  const bringToFront = id => {
    setSelected(id)
    const top = Math.max(0, ...data.widgets.map(w => w.z))
    const w = data.widgets.find(x => x.id === id)
    if (w && w.z < top) updateWidget(id, { z: top + 1 })
  }

  const addWidget = type => {
    const top = Math.max(0, ...data.widgets.map(w => w.z))
    const nudge = (data.widgets.length % 5) * 3
    const w = makeWidget(type)
    w.x = Math.min(w.x + nudge, 100 - w.w)
    w.y = Math.min(w.y + nudge, 100 - w.h)
    w.z = top + 1
    change(d => ({ ...d, widgets: [...d.widgets, w] }))
    setSelected(w.id)
  }

  // ── Board actions ──
  const openBoard = b => {
    if (dirty.current && currentId) updateBoard(currentId, { data })
    dirty.current = false
    setCurrentId(b.id); setData(b.data); setSelected(null); setPanel(null)
    try { localStorage.setItem(LAST_BOARD_KEY, b.id) } catch {}
  }

  const newBoard = async () => {
    const { board, error } = await createBoard(user.id, `Board ${boards.length + 1}`, starterBoard())
    if (error || !board) { setSave('error'); setSaveError(error || 'Couldn’t create a board.'); return }
    setBoards(bs => [...bs, board])
    openBoard(board)
  }

  const renameBoard = async (id, name) => {
    setBoards(bs => bs.map(b => (b.id === id ? { ...b, name } : b)))
    await updateBoard(id, { name: name.trim() || 'Untitled board' })
  }

  const removeBoard = async b => {
    if (boards.length === 1) return
    if (!window.confirm(`Delete “${b.name}”? This can’t be undone.`)) return
    const { error } = await deleteBoard(b.id)
    if (error) { setSave('error'); setSaveError(error); return }
    const rest = boards.filter(x => x.id !== b.id)
    setBoards(rest)
    if (b.id === currentId) openBoard(rest[0])
  }

  const setBackground = bg => change(d => ({ ...d, bg }))

  const uploadBackground = async e => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBgError('')
    try { setBackground({ type: 'image', value: await compressImage(file) }) }
    catch (err) { setBgError(err.message) }
  }

  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen()
    else document.documentElement.requestFullscreen?.()
  }

  // ── Render ──
  if (loadError) {
    return (
      <div className="screen centered">
        <div className="card" style={{ maxWidth: 420, textAlign: 'center' }}>
          <p style={{ marginBottom: '1rem' }}>{loadError}</p>
          <button className="btn" onClick={() => go('teacher-home')}>← Home</button>
        </div>
      </div>
    )
  }
  if (!data) {
    return <div className="screen centered"><div className="dot-row"><div className="dot" /><div className="dot" /><div className="dot" /></div></div>
  }

  const current = boards.find(b => b.id === currentId)
  const local = storageMode() === 'local'
  const saveLabel = save === 'saving' ? 'Saving…' : save === 'error' ? 'Not saved' : local ? 'Saved on this computer' : 'Saved'

  return (
    <div className="board-root">
      <div className="board" ref={boardRef} style={bgStyle(data.bg)}
        onPointerDown={() => { setSelected(null); setPanel(null) }}>
        {data.widgets.map(w => {
          const def = WIDGETS[w.type]
          if (!def) return null
          const { Component, Settings } = def
          return (
            <WidgetFrame key={w.id} widget={w} boardRef={boardRef}
              selected={selected === w.id}
              onSelect={() => bringToFront(w.id)}
              onChange={patch => updateWidget(w.id, patch)}
              onDelete={() => removeWidget(w.id)}
              settings={Settings && <Settings props={w.props} update={p => updateProps(w.id, p)} />}>
              <Component props={w.props} update={p => updateProps(w.id, p)} />
            </WidgetFrame>
          )
        })}
      </div>

      {toolbarHidden ? (
        <button className="bt-show" onClick={() => setToolbarHidden(false)} aria-label="Show toolbar">▲</button>
      ) : (
        <div className="bt" onPointerDown={e => e.stopPropagation()}>
          <button className="bt-btn" onClick={() => go('teacher-home')} title="Back to teacher home">
            <span className="bt-icon">🏠</span><span>Home</span>
          </button>
          <button className={`bt-btn ${panel === 'boards' ? 'on' : ''}`} onClick={() => setPanel(p => (p === 'boards' ? null : 'boards'))}>
            <span className="bt-icon">🗂️</span><span className="bt-name">{current?.name || 'Boards'}</span>
          </button>
          <span className="bt-sep" />
          {Object.entries(WIDGETS).map(([type, def]) => (
            <button key={type} className="bt-btn" onClick={() => addWidget(type)} title={`Add ${def.label.toLowerCase()}`}>
              <span className="bt-icon">{def.icon}</span><span>{def.label}</span>
            </button>
          ))}
          <span className="bt-sep" />
          <button className={`bt-btn ${panel === 'background' ? 'on' : ''}`} onClick={() => setPanel(p => (p === 'background' ? null : 'background'))}>
            <span className="bt-icon">🖼️</span><span>Background</span>
          </button>
          <button className="bt-btn" onClick={toggleFullscreen}>
            <span className="bt-icon">⛶</span><span>Full screen</span>
          </button>
          <button className="bt-btn" onClick={() => { setToolbarHidden(true); setPanel(null) }} title="Hide toolbar">
            <span className="bt-icon">▼</span><span>Hide</span>
          </button>
          <span className={`bt-save bt-save-${save}`} title={saveError || ''}>{saveLabel}</span>
        </div>
      )}

      {panel === 'boards' && (
        <div className="bp" onPointerDown={e => e.stopPropagation()}>
          <h2 className="bp-title">Your boards</h2>
          {local && <p className="bp-note">Boards are saving to this computer only. Run the setup step in Supabase to save them to Kwis.</p>}
          <ul className="bp-list">
            {boards.map(b => (
              <li key={b.id} className={b.id === currentId ? 'on' : ''}>
                {b.id === currentId ? (
                  <input className="bp-rename" value={b.name} aria-label="Board name"
                    onChange={e => setBoards(bs => bs.map(x => (x.id === b.id ? { ...x, name: e.target.value } : x)))}
                    onBlur={e => renameBoard(b.id, e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && e.currentTarget.blur()} />
                ) : (
                  <button className="bp-open" onClick={() => openBoard(b)}>{b.name}</button>
                )}
                {boards.length > 1 && (
                  <button className="bp-delete" onClick={() => removeBoard(b)} aria-label={`Delete ${b.name}`} title="Delete board">🗑</button>
                )}
              </li>
            ))}
          </ul>
          <button className="btn btn-primary btn-full" onClick={newBoard}>+ New board</button>
        </div>
      )}

      {panel === 'background' && (
        <div className="bp bp-bg" onPointerDown={e => e.stopPropagation()}>
          <h2 className="bp-title">Background</h2>
          <div className="bp-swatches">
            {BACKGROUNDS.map(bg => (
              <button key={bg.label} className={`bp-swatch ${data.bg?.value === bg.value ? 'on' : ''}`}
                style={{ background: bg.value }} onClick={() => setBackground(bg)}>
                <span>{bg.label}</span>
              </button>
            ))}
          </div>
          <div className="bp-row">
            <label className="btn bp-upload">
              Upload a photo
              <input type="file" accept="image/*" onChange={uploadBackground} hidden />
            </label>
            <label className="bp-color">
              Any color
              <input type="color" value={data.bg?.type === 'color' ? data.bg.value : '#f6efe2'}
                onChange={e => setBackground({ type: 'color', value: e.target.value })} />
            </label>
          </div>
          {bgError && <p className="bp-error">{bgError}</p>}
        </div>
      )}
    </div>
  )
}
