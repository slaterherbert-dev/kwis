import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '../contexts/AuthContext'
import * as db from './board/storage'
import BordHome from './board/BordHome'
import BoardEditor, { starterBoard } from './board/BoardEditor'
import './board/Board.css'

// Lexend is designed for reading ease, which matters on a projector. It's
// loaded on its own so that if a network blocks Google Fonts, Bord still
// works with a fallback font.
function loadBoardFont() {
  if (document.getElementById('kwis-board-font')) return
  const link = document.createElement('link')
  link.id = 'kwis-board-font'
  link.rel = 'stylesheet'
  link.href = 'https://fonts.googleapis.com/css2?family=Lexend:wght@400;500;700&display=swap'
  document.head.appendChild(link)
}

// The address bar shows #bord on the deck list and #bord/<board id> on a
// board, so a refresh mid-class keeps you on the same board.
const boardIdFromHash = () => window.location.hash.split('/')[1] || null
const setBordHash = id => window.history.replaceState(null, '', id ? `#bord/${id}` : '#bord')

const byPosition = (a, b) => a.position - b.position
const nextPosition = list => (list.length ? Math.max(...list.map(x => x.position)) + 1 : 0)

export default function Board({ go }) {
  const { user } = useAuth()
  const [decks, setDecks] = useState([])
  const [boards, setBoards] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [fatal, setFatal] = useState('')
  const [openId, setOpenId] = useState(null)
  const [save, setSave] = useState({ state: 'saved', error: '' })
  const [notice, setNotice] = useState('')

  const pending = useRef(new Set()) // board ids with unsaved changes
  const boardsRef = useRef(boards)
  boardsRef.current = boards

  useEffect(loadBoardFont, [])

  // ── Load (and set up a first deck if there's nothing yet) ──
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const res = await db.loadEverything()
      if (cancelled) return
      if (res.error) { setFatal(res.error); return }
      let { decks: ds, boards: bs } = res

      if (!ds.length) {
        const { deck, error } = await db.createDeck(user.id, bs.length ? 'My boards' : 'My first deck', 0)
        if (error || !deck) { setFatal(error || 'Couldn’t create your first deck.'); return }
        ds = [deck]
      }
      // Any board without a deck goes into the first deck
      const loose = bs.filter(b => !b.deck_id || !ds.some(d => d.id === b.deck_id))
      if (loose.length) {
        await Promise.all(loose.map(b => db.updateBoard(b.id, { deck_id: ds[0].id })))
        bs = bs.map(b => (loose.includes(b) ? { ...b, deck_id: ds[0].id } : b))
      }
      // Boards that share a position (like older boards, which all start at 0)
      // get numbered in their current order so moving and duplicating work
      const fixes = []
      ds.forEach(d => {
        const inDeck = bs.filter(b => b.deck_id === d.id) // already sorted by position, then age
        if (new Set(inDeck.map(b => b.position)).size === inDeck.length) return
        inDeck.forEach((b, i) => { if (b.position !== i) fixes.push({ id: b.id, position: i }) })
      })
      if (fixes.length) {
        await Promise.all(fixes.map(f => db.updateBoard(f.id, { position: f.position })))
        bs = bs.map(b => { const f = fixes.find(x => x.id === b.id); return f ? { ...b, position: f.position } : b })
      }
      if (!bs.length) {
        const { board } = await db.createBoard(user.id, { name: 'Board 1', data: starterBoard(), deck_id: ds[0].id, position: 0 })
        if (board) bs = [board]
      }
      if (cancelled) return
      setDecks(ds)
      setBoards(bs)
      const fromHash = boardIdFromHash()
      setOpenId(bs.some(b => b.id === fromHash) ? fromHash : null)
      setLoaded(true)
    })()
    return () => { cancelled = true }
  }, [user.id])

  // ── Autosave: changed boards are saved shortly after the last edit ──
  const flush = useCallback(async () => {
    const ids = [...pending.current]
    pending.current.clear()
    if (!ids.length) return
    const results = await Promise.all(ids.map(id => {
      const b = boardsRef.current.find(x => x.id === id)
      return b ? db.updateBoard(id, { data: b.data }) : { error: null }
    }))
    const failed = results.find(r => r.error)
    setSave(failed ? { state: 'error', error: failed.error } : { state: 'saved', error: '' })
  }, [])

  useEffect(() => {
    if (!pending.current.size) return
    setSave(s => ({ ...s, state: 'saving' }))
    const t = setTimeout(flush, 700)
    return () => clearTimeout(t)
  }, [boards, flush])

  useEffect(() => () => { flush() }, [flush]) // save anything left when leaving Bord

  const changeBoardData = (id, updater) => {
    pending.current.add(id)
    setBoards(bs => bs.map(b => (b.id === id ? { ...b, data: updater(b.data) } : b)))
  }

  const report = error => { if (error) setNotice(error) }

  // ── Navigation ──
  const openBoard = board => { flush(); setOpenId(board.id); setBordHash(board.id); setNotice('') }
  const closeBoard = () => { flush(); setOpenId(null); setBordHash(null) }

  // ── Deck actions ──
  const actions = {
    openBoard,

    newDeck: async () => {
      const { deck, error } = await db.createDeck(user.id, `Deck ${decks.length + 1}`, nextPosition(decks))
      if (error || !deck) return report(error)
      setDecks(ds => [...ds, deck])
      const { board } = await db.createBoard(user.id, { name: 'Board 1', data: starterBoard(), deck_id: deck.id, position: 0 })
      if (board) setBoards(bs => [...bs, board])
    },

    renameDeck: async (deck, name) => {
      setDecks(ds => ds.map(d => (d.id === deck.id ? { ...d, name } : d)))
      report((await db.updateDeck(deck.id, { name })).error)
    },

    deleteDeck: async (deck, count) => {
      const what = count ? ` and its ${count} ${count === 1 ? 'board' : 'boards'}` : ''
      if (!window.confirm(`Delete the deck “${deck.name}”${what}? This can’t be undone.`)) return
      const { error } = await db.deleteDeck(deck.id)
      if (error) return report(error)
      setDecks(ds => ds.filter(d => d.id !== deck.id))
      setBoards(bs => bs.filter(b => b.deck_id !== deck.id))
    },

    newBoard: async deck => {
      const inDeck = boards.filter(b => b.deck_id === deck.id)
      const last = [...inDeck].sort(byPosition).pop()
      const { board, error } = await db.createBoard(user.id, {
        name: `Board ${inDeck.length + 1}`,
        data: starterBoard(last?.data?.bg), // new boards keep the deck's latest background
        deck_id: deck.id, position: nextPosition(inDeck),
      })
      if (error || !board) return report(error)
      setBoards(bs => [...bs, board])
    },

    renameBoard: async (board, name) => {
      setBoards(bs => bs.map(b => (b.id === board.id ? { ...b, name } : b)))
      report((await db.updateBoard(board.id, { name })).error)
    },

    duplicateBoard: async board => {
      // Place the copy right after the original
      const inDeck = boards.filter(b => b.deck_id === board.deck_id).sort(byPosition)
      const after = inDeck[inDeck.findIndex(b => b.id === board.id) + 1]
      const position = after ? (board.position + after.position) / 2 : board.position + 1
      const { board: copy, error } = await db.createBoard(user.id, {
        name: `${board.name} (copy)`, data: JSON.parse(JSON.stringify(board.data)), deck_id: board.deck_id, position,
      })
      if (error || !copy) return report(error)
      setBoards(bs => [...bs, copy])
    },

    moveBoard: async (board, dir) => {
      const inDeck = boards.filter(b => b.deck_id === board.deck_id).sort(byPosition)
      const i = inDeck.findIndex(b => b.id === board.id)
      const other = inDeck[i + dir]
      if (!other) return
      let [a, b] = [other.position, board.position]
      if (a === b) a = b + dir // positions can tie; break the tie
      setBoards(bs => bs.map(x => (x.id === board.id ? { ...x, position: a } : x.id === other.id ? { ...x, position: b } : x)))
      const results = await Promise.all([db.updateBoard(board.id, { position: a }), db.updateBoard(other.id, { position: b })])
      report(results.find(r => r.error)?.error)
    },

    moveToDeck: async (board, deckId) => {
      if (deckId === board.deck_id) return
      const position = nextPosition(boards.filter(b => b.deck_id === deckId))
      setBoards(bs => bs.map(b => (b.id === board.id ? { ...b, deck_id: deckId, position } : b)))
      report((await db.updateBoard(board.id, { deck_id: deckId, position })).error)
    },

    deleteBoard: async board => {
      if (!window.confirm(`Delete “${board.name}”? This can’t be undone.`)) return
      const { error } = await db.deleteBoard(board.id)
      if (error) return report(error)
      setBoards(bs => bs.filter(b => b.id !== board.id))
    },
  }

  // ── Render ──
  if (fatal) {
    return (
      <div className="screen centered">
        <div className="card" style={{ maxWidth: 460, textAlign: 'center' }}>
          <p style={{ marginBottom: '1rem', lineHeight: 1.5 }}>{fatal}</p>
          <button className="btn" onClick={() => go('teacher-home')}>← Kwis home</button>
        </div>
      </div>
    )
  }
  if (!loaded) {
    return <div className="screen centered"><div className="dot-row"><div className="dot" /><div className="dot" /><div className="dot" /></div></div>
  }

  const sortedDecks = [...decks].sort(byPosition)
  const sortedBoards = [...boards].sort(byPosition)
  const open = boards.find(b => b.id === openId)

  if (open) {
    const deck = decks.find(d => d.id === open.deck_id)
    const inDeck = sortedBoards.filter(b => b.deck_id === open.deck_id)
    const i = inDeck.findIndex(b => b.id === open.id)
    const saveLabel = save.state === 'saving' ? 'Saving…' : save.state === 'error' ? 'Not saved' : 'Saved'
    return (
      <BoardEditor
        board={open}
        deckName={deck?.name || ''}
        position={i + 1}
        total={inDeck.length}
        onPrev={() => inDeck[i - 1] && openBoard(inDeck[i - 1])}
        onNext={() => inDeck[i + 1] && openBoard(inDeck[i + 1])}
        onExit={closeBoard}
        onData={updater => changeBoardData(open.id, updater)}
        saveLabel={saveLabel}
        saveError={save.error}
      />
    )
  }

  return (
    <BordHome decks={sortedDecks} boards={sortedBoards} actions={actions}
      onKwisHome={() => go('teacher-home')} notice={notice} />
  )
}
