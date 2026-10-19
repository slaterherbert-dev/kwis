import React, { useState, useEffect } from 'react'
import BoardThumb from './BoardThumb'

function BoardCard({ board, number, decks, isFirst, isLast, actions }) {
  const [menu, setMenu] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState(board.name)
  useEffect(() => setName(board.name), [board.name])

  const finishRename = () => {
    setRenaming(false)
    const clean = name.trim() || 'Untitled board'
    if (clean !== board.name) actions.renameBoard(board, clean)
    else setName(board.name)
  }
  const run = fn => { setMenu(false); fn() }

  return (
    <div className="bh-card">
      <button className="bh-thumb" onClick={() => actions.openBoard(board)} aria-label={`Open ${board.name}`}>
        <BoardThumb data={board.data} />
      </button>

      <div className="bh-label">
        <span className="bh-num">{number}</span>
        {renaming ? (
          <input className="bh-rename" value={name} autoFocus aria-label="Board name"
            onChange={e => setName(e.target.value)} onBlur={finishRename}
            onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { setName(board.name); setRenaming(false) } }} />
        ) : (
          <button className="bh-name" onClick={() => setRenaming(true)} title="Click to rename">{board.name}</button>
        )}
        <button className="bh-more" onClick={() => setMenu(m => !m)} aria-label={`Options for ${board.name}`} aria-expanded={menu}>⋯</button>
      </div>

      {menu && (
        <>
          <div className="bh-scrim" onClick={() => setMenu(false)} />
          <div className="bh-menu" role="menu">
            <button onClick={() => run(() => setRenaming(true))}>Rename</button>
            <button onClick={() => run(() => actions.duplicateBoard(board))}>Duplicate</button>
            <button disabled={isFirst} onClick={() => run(() => actions.moveBoard(board, -1))}>Move left</button>
            <button disabled={isLast} onClick={() => run(() => actions.moveBoard(board, 1))}>Move right</button>
            {decks.length > 1 && (
              <label className="bh-menu-select">
                Move to deck
                <select value={board.deck_id} onChange={e => run(() => actions.moveToDeck(board, e.target.value))}>
                  {decks.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </label>
            )}
            <button className="bh-danger" onClick={() => run(() => actions.deleteBoard(board))}>Delete</button>
          </div>
        </>
      )}
    </div>
  )
}

function DeckTitle({ deck, onRename }) {
  const [name, setName] = useState(deck.name)
  useEffect(() => setName(deck.name), [deck.name])
  return (
    <input className="bh-deck-name" value={name} aria-label="Deck name"
      onChange={e => setName(e.target.value)}
      onBlur={() => { const clean = name.trim() || 'Untitled deck'; setName(clean); if (clean !== deck.name) onRename(deck, clean) }}
      onKeyDown={e => e.key === 'Enter' && e.currentTarget.blur()} />
  )
}

export default function BordHome({ decks, boards, actions, onKwisHome, notice }) {
  return (
    <div className="screen bh">
      <div className="bh-wrap">
        <header className="bh-header">
          <button className="back-btn" style={{ marginBottom: 0 }} onClick={onKwisHome}>← Kwis home</button>
          <h1 className="gradient-text bh-title">Bord</h1>
          <button className="btn btn-primary" onClick={actions.newDeck}>+ New deck</button>
        </header>

        {notice && <p className="bh-notice">{notice}</p>}

        {decks.length === 0 && (
          <div className="card bh-empty">
            <p>Decks keep your boards organized, like one for Civics and one for World History.</p>
            <button className="btn btn-primary" onClick={actions.newDeck}>Make your first deck</button>
          </div>
        )}

        {decks.map(deck => {
          const inDeck = boards.filter(b => b.deck_id === deck.id)
          return (
            <section key={deck.id} className="bh-deck" aria-label={deck.name}>
              <div className="bh-deck-head">
                <DeckTitle deck={deck} onRename={actions.renameDeck} />
                <span className="bh-count">{inDeck.length} {inDeck.length === 1 ? 'board' : 'boards'}</span>
                <button className="bh-deck-delete" onClick={() => actions.deleteDeck(deck, inDeck.length)}>Delete deck</button>
              </div>
              <div className="bh-grid">
                {inDeck.map((b, i) => (
                  <BoardCard key={b.id} board={b} number={i + 1} decks={decks}
                    isFirst={i === 0} isLast={i === inDeck.length - 1} actions={actions} />
                ))}
                <button className="bh-add" onClick={() => actions.newBoard(deck)} aria-label={`Add a board to ${deck.name}`}>
                  <span>+</span>New board
                </button>
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}
