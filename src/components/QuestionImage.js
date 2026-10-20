import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import './QuestionImage.css'

// Shows a question's picture, if it has one.
//   maxHeight  how tall the picture may get on this screen (any CSS length)
//   compact    smaller caption and margins (student screens)
// Space is reserved before the picture loads (using its saved width and height),
// so answer buttons don't jump down while students are about to tap them.
export default function QuestionImage({ q, maxHeight = '32vh', compact = false }) {
  const [status, setStatus] = useState('loading') // loading | ready | error
  const [open, setOpen] = useState(false)
  const url = q && q.image_url

  useEffect(() => { setStatus('loading'); setOpen(false) }, [url])

  useEffect(() => {
    if (!open) return
    const onKey = e => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  if (!url) return null

  const alt = q.image_alt || q.image_caption || 'Picture for this question'
  const w = q.image_width
  const h = q.image_height
  const hasSize = w > 0 && h > 0

  const frameStyle = hasSize
    ? { aspectRatio: `${w} / ${h}`, width: `min(100%, calc(${maxHeight} * ${w / h}))` }
    : { maxHeight, minHeight: status === 'loading' ? '8rem' : undefined }

  return (
    <figure className={`qimg ${compact ? 'qimg-compact' : ''}`}>
      <button type="button" className={`qimg-frame qimg-${status}`} style={frameStyle}
        onClick={() => status === 'ready' && setOpen(true)}
        aria-label={status === 'ready' ? `${alt}. Open full screen` : alt}>
        {status !== 'error' && (
          <img src={url} alt={alt} draggable={false}
            style={hasSize ? undefined : { maxHeight }}
            onLoad={() => setStatus('ready')}
            onError={() => setStatus('error')} />
        )}
        {status === 'loading' && <span className="qimg-note">Loading picture…</span>}
        {status === 'error' && (
          <span className="qimg-note">
            The picture didn’t load.{q.image_alt ? <><br />It shows: {q.image_alt}</> : null}
          </span>
        )}
        {status === 'ready' && <span className="qimg-zoom" aria-hidden="true">⤢</span>}
      </button>
      {q.image_caption && <figcaption className="qimg-caption">{q.image_caption}</figcaption>}

      {open && createPortal(
        <div className="qimg-overlay" role="dialog" aria-modal="true" aria-label="Picture, full screen"
          onClick={() => setOpen(false)}>
          <img src={url} alt={alt} />
          {q.image_caption && <p className="qimg-overlay-caption">{q.image_caption}</p>}
          <button type="button" className="btn qimg-close" autoFocus onClick={() => setOpen(false)}>Close</button>
        </div>,
        document.body
      )}
    </figure>
  )
}
