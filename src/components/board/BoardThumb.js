import React from 'react'
import { bgStyle } from './backgrounds'
import { TONES, WIDGETS } from './widgets'

// A small, non-interactive picture of a board for the Bord home page.
// It's a size container like the real board, so text scales the same way.
export default function BoardThumb({ data }) {
  return (
    <div className="thumb" style={bgStyle(data?.bg)} aria-hidden="true">
      {(data?.widgets || []).map(w => {
        const tone = TONES[w.tone] || TONES.white
        return (
          <div key={w.id} className="thumb-w"
            style={{ left: `${w.x}%`, top: `${w.y}%`, width: `${w.w}%`, height: `${w.h}%`, zIndex: w.z, background: tone.bg, color: tone.fg }}>
            {w.type === 'text' && (
              <div className="w-text" style={{ '--fs': { S: 1.15, M: 1.55, L: 2.05, XL: 2.75 }[w.props.size] || 1.55 }}>
                <div className="w-text-title">{w.props.title}</div>
                <div className="w-text-body">{w.props.body}</div>
              </div>
            )}
            {w.type === 'image' && w.props.src && <img src={w.props.src} alt="" style={{ objectFit: w.props.fit === 'fill' ? 'cover' : 'contain' }} />}
            {w.type !== 'text' && w.type !== 'image' && <span className="thumb-icon">{WIDGETS[w.type]?.icon}</span>}
          </div>
        )
      })}
    </div>
  )
}
