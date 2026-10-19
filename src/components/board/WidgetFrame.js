import React, { useState } from 'react'
import { TONES } from './widgets'

const MIN_W = 6
const MIN_H = 8
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

// Positions and sizes are percentages of the board, so a board looks the
// same on a laptop and on the projector.
export default function WidgetFrame({ widget, boardRef, selected, onSelect, onChange, onDelete, settings, children }) {
  const [showSettings, setShowSettings] = useState(false)
  const tone = TONES[widget.tone] || TONES.white

  function startDrag(e, kind) {
    e.preventDefault()
    e.stopPropagation()
    onSelect()
    const rect = boardRef.current.getBoundingClientRect()
    const s = { px: e.clientX, py: e.clientY, x: widget.x, y: widget.y, w: widget.w, h: widget.h }
    const move = ev => {
      const dx = ((ev.clientX - s.px) / rect.width) * 100
      const dy = ((ev.clientY - s.py) / rect.height) * 100
      if (kind === 'move') onChange({ x: clamp(s.x + dx, 0, 100 - s.w), y: clamp(s.y + dy, 0, 100 - s.h) })
      else onChange({ w: clamp(s.w + dx, MIN_W, 100 - s.x), h: clamp(s.h + dy, MIN_H, 100 - s.y) })
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  return (
    <div
      className={`bw ${selected ? 'bw-selected' : ''}`}
      style={{
        left: `${widget.x}%`, top: `${widget.y}%`, width: `${widget.w}%`, height: `${widget.h}%`,
        zIndex: widget.z, '--tone-bg': tone.bg, '--tone-fg': tone.fg,
      }}
      onPointerDown={e => { e.stopPropagation(); onSelect() }}
    >
      <div className="bw-chrome">
        <button className="bw-grip" onPointerDown={e => startDrag(e, 'move')} aria-label="Drag to move" title="Drag to move">✥</button>
        <button onClick={() => setShowSettings(s => !s)} aria-label="Color and settings" aria-expanded={showSettings} title="Color and settings">🎨</button>
        <button onClick={onDelete} aria-label="Remove" title="Remove">✕</button>
      </div>

      {showSettings && selected && (
        <div className="bw-settings">
          <div className="ws-row">
            <span>Color</span>
            {Object.entries(TONES).map(([key, t]) => (
              <button key={key} className={`ws-swatch ${widget.tone === key ? 'on' : ''}`}
                style={{ background: t.bg }} aria-label={t.label} title={t.label}
                onClick={() => onChange({ tone: key })} />
            ))}
          </div>
          {settings}
        </div>
      )}

      <div className="bw-body">{children}</div>
      <div className="bw-resize" onPointerDown={e => startDrag(e, 'resize')} title="Drag to resize" />
    </div>
  )
}
