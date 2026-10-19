import { supabase } from '../../supabase'

// Bord data lives in two Supabase tables: board_decks and boards.
// Each board belongs to a deck and has a position (its order in the deck).

const SETUP_MESSAGE = 'Bord needs a quick database update. Run decks-setup.sql in Supabase (SQL Editor → New query → Run), then refresh this page.'

const needsSetup = error =>
  error && (['42P01', '42703', 'PGRST204', 'PGRST205'].includes(error.code) ||
    /does not exist|could not find/i.test(error.message || ''))

const friendly = error => (needsSetup(error) ? SETUP_MESSAGE : error?.message || 'Something went wrong. Check your connection and try again.')

const BOARD_FIELDS = 'id, name, data, deck_id, position'
const DECK_FIELDS = 'id, name, position'

export async function loadEverything() {
  const [decks, boards] = await Promise.all([
    supabase.from('board_decks').select(DECK_FIELDS).order('position').order('created_at'),
    supabase.from('boards').select(BOARD_FIELDS).order('position').order('created_at'),
  ])
  const error = decks.error || boards.error
  if (error) return { error: friendly(error), needsSetup: needsSetup(error) }
  return { decks: decks.data || [], boards: boards.data || [] }
}

export async function createDeck(teacherId, name, position) {
  const { data, error } = await supabase.from('board_decks')
    .insert([{ teacher_id: teacherId, name, position }]).select(DECK_FIELDS)
  return { deck: data?.[0], error: error && friendly(error) }
}

export async function updateDeck(id, patch) {
  const { error } = await supabase.from('board_decks').update(patch).eq('id', id)
  return { error: error && friendly(error) }
}

export async function deleteDeck(id) {
  const { error } = await supabase.from('board_decks').delete().eq('id', id)
  return { error: error && friendly(error) }
}

export async function createBoard(teacherId, fields) {
  const { data, error } = await supabase.from('boards')
    .insert([{ teacher_id: teacherId, ...fields }]).select(BOARD_FIELDS)
  return { board: data?.[0], error: error && friendly(error) }
}

export async function updateBoard(id, patch) {
  const { error } = await supabase.from('boards')
    .update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id)
  return { error: error && friendly(error) }
}

export async function deleteBoard(id) {
  const { error } = await supabase.from('boards').delete().eq('id', id)
  return { error: error && friendly(error) }
}
