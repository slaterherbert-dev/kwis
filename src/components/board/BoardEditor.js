import React, { useState, useEffect, useRef } from 'react'
import { BACKGROUNDS, bgStyle, compressImage } from './backgrounds'
import { WIDGETS } from './widgets'
import WidgetFrame from './WidgetFrame'

const newId = () => Math.random().toString(36).slice(2, 10)

export function makeWidget(type, place = {}, props = {}, tone) {
  const def = WIDGETS[type]
  return {
    id: newId(), type, z: 1,
    x: 50 - def.size.w / 2, y: 40 - def.size.h / 2, ...def.size, ...place,
    tone: tone || def.tone,
    props: { ...def.defaults, ...props },
  }
}

// A new board starts with the daily layout: agenda, learning target, reminder
export function starterBoard(bg = BACKGROUNDS[0]) {
  return {
    bg,
    widgets: [
      makeWidget('text', { x: 3, y: 4, w: 46, h: 34 }, { title: 'Agenda', body: '1. \n2. \n3. ' }, 'pink'),
      makeWidget('text', { x: 3, y: 42, w: 46, h: 40 }, { title: 'Learning target', body: '' }, 'yellow'),
      makeWidget('text', { x: 52, y: 4, w: 45, h: 78 }, { title: 'Reminder', body: '' }, 'red'),
    ],
  }
}

const isTyping = el =>
  el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))

export default function BoardEditor({ board, deckName, position, total, onPrev, onNext, onExit, onData, saveLabel, saveError }) {
  const data = board.data
  const [selected, setSelected] = useState(null)
  const [panel, setPanel] = useState(false) // background panel open?
  const [toolbarHidden, setToolbarHidden] = useState(false)
  const [bgError, setBgError] = useState('')
  const boardRef = useRef(null)

  // Clear selection when switching boards
  useEffect(() => { setSelected(null); setPanel(false) }, [board.id])

  // Arrow keys / Page Up-Down (and most presentation clickers) flip boards
  useEffect(() => {
    const onKey = e => {
      if (isTyping(document.activeElement)) return
      if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); onNext() }
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); onPrev() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onNext, onPrev])

  // ── Widget actions ──
  const updateWidget = (id, patch) =>
    onData(d => ({ ...d, widgets: d.widgets.map(w => (w.id === id ? { ...w, ...patch } : w)) }))
  const updateProps = (id, patch) =>
    onData(d => ({ ...d, widgets: d.widgets.map(w => (w.id === id ? { ...w, props: { ...w.props, ...patch } } : w)) }))
  const removeWidget = id => { onData(d => ({ ...d, widgets: d.widgets.filter(w => w.id !== id) })); setSelected(null) }

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
    onData(d => ({ ...d, widgets: [...d.widgets, w] }))
    setSelected(w.id)
  }

  const setBackground = bg => onData(d => ({ ...d, bg }))
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

  return (
    <div className="board-root">
      <div className="board" ref={boardRef} style={bgStyle(data.bg)}
        onPointerDown={() => { setSelected(null); setPanel(false) }}>
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
          <button className="bt-btn" onClick={onExit} title="Back to all your decks">
            <span className="bt-icon">🗂️</span><span>Decks</span>
          </button>
          <span className="bt-sep" />
          {Object.entries(WIDGETS).map(([type, def]) => (
            <button key={type} className="bt-btn" onClick={() => addWidget(type)} title={`Add ${def.label.toLowerCase()}`}>
              <span className="bt-icon">{def.icon}</span><span>{def.label}</span>
            </button>
          ))}
          <span className="bt-sep" />
          <button className={`bt-btn ${panel ? 'on' : ''}`} onClick={() => setPanel(p => !p)}>
            <span className="bt-icon">🌄</span><span>Background</span>
          </button>
          <button className="bt-btn" onClick={toggleFullscreen}>
            <span className="bt-icon">⛶</span><span>Full screen</span>
          </button>
          <button className="bt-btn" onClick={() => { setToolbarHidden(true); setPanel(false) }} title="Hide toolbar">
            <span className="bt-icon">▼</span><span>Hide</span>
          </button>
          <span className="bt-sep" />
          <div className="bt-nav" title={`${deckName}: ${board.name}`}>
            <button onClick={onPrev} disabled={position <= 1} aria-label="Previous board">‹</button>
            <span><span className="bt-nav-name">{board.name}</span><span className="bt-nav-count">{position} / {total}</span></span>
            <button onClick={onNext} disabled={position >= total} aria-label="Next board">›</button>
          </div>
          <span className={`bt-save ${saveError ? 'bt-save-error' : ''}`} title={saveError || ''}>{saveLabel}</span>
        </div>
      )}

      {panel && (
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
