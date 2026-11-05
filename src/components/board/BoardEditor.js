import React, { useState, useEffect, useRef } from 'react'
import { BACKGROUNDS, bgStyle, compressImage } from './backgrounds'
import { WIDGETS } from './widgets'
import WidgetFrame from './WidgetFrame'
import { htmlToText } from './richText'

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

// Widgets in stacking order, bottom first. Ties go by list order, which is
// also how the browser draws them.
const byLayer = widgets =>
  widgets.map((w, i) => ({ w, i })).sort((a, b) => (a.w.z || 0) - (b.w.z || 0) || a.i - b.i).map(x => x.w)

// A short name for each widget in the Layers list
function layerName(w) {
  const def = WIDGETS[w.type]
  if (w.type === 'text') {
    const words = (w.props.titleHtml != null ? htmlToText(w.props.titleHtml) : w.props.title || '').trim() ||
      (w.props.bodyHtml != null ? htmlToText(w.props.bodyHtml) : w.props.body || '').trim().split('\n')[0]
    return words ? words.slice(0, 40) : 'Empty text box'
  }
  if (w.type === 'image') return w.props.caption ? `Image: ${w.props.caption.slice(0, 30)}` : w.props.src ? 'Image' : 'Empty image'
  return def?.label || w.type
}

const isTyping = el =>
  el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))

export default function BoardEditor({ board, deckName, position, total, onPrev, onNext, onExit, onData, saveLabel, saveError }) {
  const data = board.data
  const [selected, setSelected] = useState(null)
  const [panel, setPanel] = useState(null) // 'bg' | 'layers' | null
  const [toolbarHidden, setToolbarHidden] = useState(false)
  const [bgError, setBgError] = useState('')
  const boardRef = useRef(null)

  // Clear selection when switching boards
  useEffect(() => { setSelected(null); setPanel(null) }, [board.id])

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

  // Change which widget sits on top. Dragging or resizing a widget brings it
  // to the front; just clicking into it (to type) leaves it where it is.
  // action: 'front' | 'back' | 'up' (one step) | 'down' (one step)
  const moveLayer = (id, action) => onData(d => {
    const stack = byLayer(d.widgets)
    const from = stack.findIndex(w => w.id === id)
    if (from < 0) return d
    const last = stack.length - 1
    const to = { front: last, back: 0, up: Math.min(last, from + 1), down: Math.max(0, from - 1) }[action]
    if (to === from) return d // already there; nothing to save
    const [item] = stack.splice(from, 1)
    stack.splice(to, 0, item)
    // Renumber 1, 2, 3… so the layers stay tidy
    const zOf = new Map(stack.map((w, i) => [w.id, i + 1]))
    return { ...d, widgets: d.widgets.map(w => ({ ...w, z: zOf.get(w.id) })) }
  })

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
        onPointerDown={() => { setSelected(null); setPanel(null) }}>
        {data.widgets.map(w => {
          const def = WIDGETS[w.type]
          if (!def) return null
          const { Component, Settings, Tools } = def
          return (
            <WidgetFrame key={w.id} widget={w} boardRef={boardRef}
              selected={selected === w.id}
              onSelect={() => setSelected(w.id)}
              onChange={patch => updateWidget(w.id, patch)}
              onDelete={() => removeWidget(w.id)}
              onLayer={action => moveLayer(w.id, action)}
              tools={Tools && <Tools />}
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
          <button className={`bt-btn ${panel === 'layers' ? 'on' : ''}`} onClick={() => setPanel(p => (p === 'layers' ? null : 'layers'))}
            title="See every item, find hidden ones, and choose what's on top">
            <span className="bt-icon">📚</span><span>Layers</span>
          </button>
          <button className={`bt-btn ${panel === 'bg' ? 'on' : ''}`} onClick={() => setPanel(p => (p === 'bg' ? null : 'bg'))}>
            <span className="bt-icon">🌄</span><span>Background</span>
          </button>
          <button className="bt-btn" onClick={toggleFullscreen}>
            <span className="bt-icon">⛶</span><span>Full screen</span>
          </button>
          <button className="bt-btn" onClick={() => { setToolbarHidden(true); setPanel(null) }} title="Hide toolbar">
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

      {panel === 'layers' && (
        <div className="bp" onPointerDown={e => e.stopPropagation()}>
          <h2 className="bp-title">Layers</h2>
          {data.widgets.length === 0 ? (
            <p className="bp-hint">Nothing on this board yet.</p>
          ) : (
            <>
              <p className="bp-hint">Top of the list is in front. Click an item to select it.</p>
              <ol className="bp-list bp-layers">
                {byLayer(data.widgets).reverse().map((w, i, arr) => (
                  <li key={w.id} className={selected === w.id ? 'on' : ''}>
                    <button className="bp-open" onClick={() => setSelected(w.id)}>
                      <span className="bp-layer-icon">{WIDGETS[w.type]?.icon}</span>{layerName(w)}
                    </button>
                    <button className="bp-step" onClick={() => moveLayer(w.id, 'up')} disabled={i === 0}
                      aria-label={`Move ${layerName(w)} forward`} title="Move forward one layer">↑</button>
                    <button className="bp-step" onClick={() => moveLayer(w.id, 'down')} disabled={i === arr.length - 1}
                      aria-label={`Move ${layerName(w)} backward`} title="Move back one layer">↓</button>
                  </li>
                ))}
              </ol>
            </>
          )}
        </div>
      )}

      {panel === 'bg' && (
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
