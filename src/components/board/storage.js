import { supabase } from '../../supabase'

// Boards live in the Supabase "boards" table. Until that table exists,
// they're kept in this browser instead so the Board still works.
const LOCAL_KEY = 'kwis-boards'
let mode = 'cloud'

const isMissingTable = (error) =>
  error && (error.code === '42P01' || error.code === 'PGRST205' ||
    /does not exist|could not find the table/i.test(error.message || ''))

function readLocal() {
  try { return JSON.parse(localStorage.getItem(LOCAL_KEY)) || [] } catch { return [] }
}
function writeLocal(boards) {
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(boards)); return null }
  catch { return 'This computer is out of space for boards. Try a smaller background image.' }
}
const newId = () => (window.crypto?.randomUUID ? window.crypto.randomUUID() : String(Date.now() + Math.random()))

export function storageMode() { return mode }

export async function listBoards() {
  const { data, error } = await supabase.from('boards').select('id, name, data').order('created_at')
  if (!error) { mode = 'cloud'; return { boards: data || [] } }
  if (isMissingTable(error)) { mode = 'local'; return { boards: readLocal() } }
  return { boards: [], error: 'Couldn’t load your boards. Check your connection and refresh.' }
}

export async function createBoard(teacherId, name, data) {
  if (mode === 'local') {
    const board = { id: newId(), name, data }
    const error = writeLocal([...readLocal(), board])
    return { board, error }
  }
  const { data: rows, error } = await supabase.from('boards')
    .insert([{ teacher_id: teacherId, name, data }]).select('id, name, data')
  return { board: rows?.[0], error: error?.message }
}

export async function updateBoard(id, patch) {
  if (mode === 'local') {
    return { error: writeLocal(readLocal().map(b => (b.id === id ? { ...b, ...patch } : b))) }
  }
  const { error } = await supabase.from('boards')
    .update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id)
  return { error: error?.message }
}

export async function deleteBoard(id) {
  if (mode === 'local') return { error: writeLocal(readLocal().filter(b => b.id !== id)) }
  const { error } = await supabase.from('boards').delete().eq('id', id)
  return { error: error?.message }
}
