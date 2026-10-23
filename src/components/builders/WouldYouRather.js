import React, { useMemo, useState } from 'react'
import { WOULD_YOU_RATHER } from './prompts'
import { useSaved, useDeck, useKeys, Bi, ListEditor } from './common'

// Custom lines look like:  Live on the moon / Live under the sea
function parseCustom(lines) {
  return lines.map(line => {
    const parts = line.split(/\s*[/|]\s*/)
    if (parts.length < 2) return null
    if (!parts[0] || !parts[1]) return null
    return { a: { en: parts[0] }, b: { en: parts.slice(1).join(' / ') } }
  }).filter(Boolean)
}

export default function WouldYouRather({ es }) {
  const [custom, setCustom] = useSaved('wyr-custom', [])
  const [source, setSource] = useSaved('wyr-source', 'builtin')
  const [editing, setEditing] = useState(false)

  const customItems = useMemo(() => parseCustom(custom), [custom])
  const items = source === 'mine' && customItems.length > 0 ? customItems
    : source === 'both' ? [...WOULD_YOU_RATHER, ...customItems]
    : WOULD_YOU_RATHER
  const deck = useDeck(items)
  useKeys({ ' ': deck.next, ArrowRight: deck.next, ArrowLeft: deck.back })

  const p = deck.item
  return (
    <div className="cb-game">
      <div className="cb-toolbar">
        <div className="cb-choices">
          <span className="cb-choices-label">Prompts</span>
          <button className={`cb-chip ${source === 'builtin' ? 'on' : ''}`} onClick={() => setSource('builtin')}>Built-in</button>
          <button className={`cb-chip ${source === 'mine' ? 'on' : ''}`} disabled={customItems.length === 0} onClick={() => setSource('mine')}>Mine ({customItems.length})</button>
          <button className={`cb-chip ${source === 'both' ? 'on' : ''}`} disabled={customItems.length === 0} onClick={() => setSource('both')}>Both</button>
          <button className="cb-chip" onClick={() => setEditing(true)}>✏️ Edit my prompts</button>
        </div>
        <span className="cb-count">{deck.pos + 1} of {deck.total}</span>
      </div>

      <h2 className="cb-kicker">Would you rather…{es && <span className="cb-es">¿Qué preferirías…?</span>}</h2>
      {p && (
        <div className="cb-wyr">
          <div className="cb-wyr-side left">
            <div className="cb-wyr-dir">⬅ This side of the room</div>
            <Bi item={p.a} es={es} className="cb-wyr-text" />
          </div>
          <div className="cb-wyr-or">or</div>
          <div className="cb-wyr-side right">
            <div className="cb-wyr-dir">This side of the room ➡</div>
            <Bi item={p.b} es={es} className="cb-wyr-text" />
          </div>
        </div>
      )}

      <div className="cb-nav">
        <button className="btn" disabled={!deck.canBack} onClick={deck.back}>← Back</button>
        <button className="btn btn-primary btn-lg" onClick={deck.next}>Next prompt →</button>
      </div>
      <p className="cb-keys">Shortcut: Space or → for the next prompt</p>

      {editing && (
        <ListEditor
          title="My Would You Rather prompts"
          help="One prompt per line. Put a slash between the two choices, like: Live on the moon / Live under the sea"
          placeholder={'Live on the moon / Live under the sea\nMeet George Washington / Meet Cleopatra'}
          initial={custom}
          onSave={list => { setCustom(list); setEditing(false); if (parseCustom(list).length > 0) setSource('mine') }}
          onClose={() => setEditing(false)}
        />
      )}
    </div>
  )
}
