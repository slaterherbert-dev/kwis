import React, { useEffect, useMemo, useState } from 'react'
import { STAND_UP_IF } from './prompts'
import { useSaved, useDeck, useKeys, Bi, ListEditor } from './common'

export default function StandUpIf({ es }) {
  const [custom, setCustom] = useSaved('stand-custom', [])
  const [source, setSource] = useSaved('stand-source', 'builtin')
  const [editing, setEditing] = useState(false)
  const [sitting, setSitting] = useState(false) // brief "sit back down" between prompts

  const customItems = useMemo(() => custom.map(line => ({ en: line.replace(/^stand up if\s*/i, '') })), [custom])
  const items = source === 'mine' && customItems.length > 0 ? customItems
    : source === 'both' ? [...STAND_UP_IF, ...customItems]
    : STAND_UP_IF
  const deck = useDeck(items)

  function next() {
    setSitting(true)
    deck.next()
  }
  useEffect(() => {
    if (!sitting) return
    const t = setTimeout(() => setSitting(false), 1300)
    return () => clearTimeout(t)
  }, [sitting])

  useKeys({ ' ': next, ArrowRight: next, ArrowLeft: deck.back })

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

      <div className="cb-stand" aria-live="polite">
        {sitting ? (
          <div className="cb-stand-sit">
            <div className="cb-stand-icon" aria-hidden="true">🪑</div>
            <div className="cb-stand-lead">Everyone sit back down…</div>
            {es && <div className="cb-es">Todos siéntense…</div>}
          </div>
        ) : (
          <>
            <div className="cb-stand-icon" aria-hidden="true">🧍</div>
            <div className="cb-stand-lead">Stand up if…{es && <span className="cb-es">Ponte de pie si…</span>}</div>
            <Bi item={deck.item} es={es} className="cb-stand-text" />
          </>
        )}
      </div>

      <div className="cb-nav">
        <button className="btn" disabled={!deck.canBack} onClick={deck.back}>← Back</button>
        <button className="btn btn-primary btn-lg" onClick={next}>Next prompt →</button>
      </div>
      <p className="cb-keys">Shortcut: Space or → for the next prompt</p>

      {editing && (
        <ListEditor
          title="My Stand Up If prompts"
          help="One prompt per line. Just write the ending; “Stand up if…” is added for you."
          placeholder={'you finished the reading\nyou can name all three branches of government'}
          initial={custom}
          onSave={list => { setCustom(list); setEditing(false); if (list.length > 0) setSource('mine') }}
          onClose={() => setEditing(false)}
        />
      )}
    </div>
  )
}
