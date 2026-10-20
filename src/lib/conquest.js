// ═══════════════════════════════════════════════════════════════
// CONQUEST — rules, banners, and the map.
// The real rules are enforced by the database functions in
// kwis-conquest-setup.sql (gold, costs, dice, shields). The numbers
// here must match that file; they're used to show prices and hints.
// ═══════════════════════════════════════════════════════════════

export const COSTS = { claim: 10, fortify: 10, attack: 15 }
export const MAX_WALLS = 3
export const TREBUCHET_STREAK = 3   // every 3 right in a row earns a Trebuchet
export const COOLDOWN_SECONDS = 20  // captured tiles and shields
export const WRONG_WAIT_SECONDS = 3 // pause after a wrong answer
export const DURATION_OPTIONS = [
  { label: '8 min', seconds: 480 },
  { label: '12 min', seconds: 720 },
  { label: '15 min', seconds: 900 },
]

// ── Banners: secret identities. Banner number n → color n % 10, emblem n % 8,
//    so the first 40 players all get a different combination.
const COLORS = [
  { name: 'Crimson', hex: '#e5484d' },
  { name: 'Azure',   hex: '#3e8ef7' },
  { name: 'Jade',    hex: '#2fbf71' },
  { name: 'Gold',    hex: '#f5c542' },
  { name: 'Violet',  hex: '#9b6cff' },
  { name: 'Ember',   hex: '#ff8a3d' },
  { name: 'Teal',    hex: '#1fc7c7' },
  { name: 'Rose',    hex: '#ff6fb5' },
  { name: 'Silver',  hex: '#c3ccd6' },
  { name: 'Lime',    hex: '#a3e635' },
]
const EMBLEMS = [
  { name: 'Falcon',  icon: '🦅' },
  { name: 'Lion',    icon: '🦁' },
  { name: 'Serpent', icon: '🐍' },
  { name: 'Wolf',    icon: '🐺' },
  { name: 'Bear',    icon: '🐻' },
  { name: 'Owl',     icon: '🦉' },
  { name: 'Dragon',  icon: '🐉' },
  { name: 'Stag',    icon: '🦌' },
]

export function bannerOf(n) {
  if (n === null || n === undefined || n < 0) return null
  const c = COLORS[n % COLORS.length]
  const e = EMBLEMS[n % EMBLEMS.length]
  return { n, color: c.hex, icon: e.icon, name: `${c.name} ${e.name}`, full: `the ${c.name} ${e.name}` }
}

// ── The map: an invented continent on a hex grid ("odd rows shifted right").
//    ~ water   M mountains   F forest   P plains   D desert   B coast
const MAP_ROWS = [
  '~~~MMMMF~~~MM~~',
  '~~MMMFFFF~MMMF~',
  '~BFFFPPFFFFMFFB',
  '~BPPP~~PPPPPPB~',
  'BPPPP~PPPFFPPB~',
  '~BPPPPPPDDPPPB~',
  '~~BPPDDDDDDPB~~',
  '~~BDDDDDMDDB~~~',
  '~~~BDDMMMDB~~~~',
  '~~~~BBDDDB~~~~~',
]
export const MAP_COLS = MAP_ROWS[0].length
export const MAP_ROWS_COUNT = MAP_ROWS.length

// Landmark names, by [row, col]. Simple words, easy to read and say.
const LANDMARKS = {
  '0,5': 'Frostpeak',
  '1,11': 'Iron Hills',
  '1,3': 'Stonewatch',
  '2,7': 'Greenvale',
  '3,7': 'Twin Lakes',
  '4,10': 'Riverbend',
  '5,6': 'Crossroads',
  '5,2': 'Sunfield',
  '8,7': 'Red Canyon',
  '7,4': 'Dusty Plains',
  '9,5': 'Golden Coast',
  '4,0': 'Misty Bay',
}

const TERRAIN = { M: 'mountains', F: 'forest', P: 'plains', D: 'desert', B: 'coast' }

function neighborCells(r, c) {
  const d = r % 2 === 0
    ? [[0, 1], [0, -1], [-1, 0], [-1, -1], [1, 0], [1, -1]]
    : [[0, 1], [0, -1], [-1, 1], [-1, 0], [1, 1], [1, 0]]
  return d.map(([a, b]) => [r + a, c + b])
}

// Cube distance between two hexes (for spreading out homelands)
function hexDistance(a, b) {
  const toCube = ({ row, col }) => {
    const x = col - (row - (row & 1)) / 2
    const z = row
    return [x, z, -x - z]
  }
  const [ax, az, ay] = toCube(a)
  const [bx, bz, by] = toCube(b)
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by), Math.abs(az - bz))
}

let cached = null
export function getMap() {
  if (cached) return cached
  const tiles = []
  const byId = {}
  for (let r = 0; r < MAP_ROWS.length; r++) {
    for (let c = 0; c < MAP_COLS; c++) {
      const ch = MAP_ROWS[r][c]
      if (ch === '~') continue
      const t = { id: r * MAP_COLS + c, row: r, col: c, terrain: TERRAIN[ch], label: LANDMARKS[`${r},${c}`] || null }
      tiles.push(t)
      byId[t.id] = t
    }
  }
  tiles.forEach(t => {
    t.neighbors = neighborCells(t.row, t.col)
      .filter(([r, c]) => r >= 0 && c >= 0 && r < MAP_ROWS.length && c < MAP_COLS && MAP_ROWS[r][c] !== '~')
      .map(([r, c]) => r * MAP_COLS + c)
  })

  // Homeland order: each next homeland is as far as possible from the earlier ones
  const ranked = []
  const minDist = {}
  tiles.forEach(t => { minDist[t.id] = Infinity })
  let next = byId[0 * MAP_COLS + 5] || tiles[0]
  while (ranked.length < tiles.length) {
    ranked.push(next.id)
    let best = null
    for (const t of tiles) {
      if (ranked.includes(t.id)) continue
      minDist[t.id] = Math.min(minDist[t.id], hexDistance(t, next))
      if (!best || minDist[t.id] > minDist[best.id] || (minDist[t.id] === minDist[best.id] && t.id < best.id)) best = t
    }
    if (!best) break
    next = best
  }
  ranked.forEach((id, i) => { byId[id].spawnRank = i })

  // Every tile is described by its nearest landmark, for the live feed
  const marks = tiles.filter(t => t.label)
  tiles.forEach(t => {
    if (t.label) { t.place = t.label; return }
    let best = marks[0]
    marks.forEach(m => { if (hexDistance(t, m) < hexDistance(t, best)) best = m })
    t.place = `near ${best.label}`
  })

  cached = { tiles, byId }
  return cached
}

// What the database needs to set up a game's map
export function mapForSetup() {
  return getMap().tiles.map(t => ({ id: t.id, neighbors: t.neighbors, rank: t.spawnRank }))
}

// ── Hex drawing (pointy-top hexes)
export const HEX = 50
export function hexCenter(t) {
  const w = Math.sqrt(3) * HEX
  return { x: w * (t.col + 0.5 * (t.row & 1)) + w / 2 + 6, y: HEX * 1.5 * t.row + HEX + 6 }
}
export function hexPoints(cx, cy, size = HEX) {
  const pts = []
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i - 30)
    pts.push(`${(cx + size * Math.cos(a)).toFixed(1)},${(cy + size * Math.sin(a)).toFixed(1)}`)
  }
  return pts.join(' ')
}
export function mapViewBox() {
  const w = Math.sqrt(3) * HEX * (MAP_COLS + 0.5) + 12
  const h = HEX * 1.5 * (MAP_ROWS.length - 1) + HEX * 2 + 12
  return { w, h }
}

// ── Wording for places: "at Frostpeak" / "near Frostpeak", "Frostpeak" / "land near Frostpeak"
export function atPlace(tileId) {
  const p = getMap().byId[tileId]?.place
  if (!p) return 'somewhere'
  return p.startsWith('near ') ? p : `at ${p}`
}
export function landPlace(tileId) {
  const p = getMap().byId[tileId]?.place
  if (!p) return 'some land'
  return p.startsWith('near ') ? `land ${p}` : p
}

// ── Live feed wording
export function eventText(e) {
  const at = atPlace(e.tile_id)
  const land = landPlace(e.tile_id)
  const a = bannerOf(e.actor_banner)
  const b = bannerOf(e.target_banner)
  const A = a ? `${a.icon} ${a.name}` : 'Someone'
  const B = b ? `${b.icon} ${b.name}` : 'someone'
  const dice = e.roll_a ? `🎲 ${e.roll_a} vs ${e.roll_d}: ` : ''
  switch (e.kind) {
    case 'join':      return `${A} founded a homeland ${at}`
    case 'claim':     return `${A} claimed ${land}`
    case 'fortify':   return `${A} built a wall ${at}`
    case 'hit':       return `${dice}${A} broke a wall ${at}`
    case 'miss':      return `${dice}${B} held off ${A} ${at}`
    case 'capture':   return `⚔️ ${A} captured ${land} from ${B}!`
    case 'trebuchet': return `🪨 ${A}’s trebuchet smashed ${B}’s walls ${at}`
    case 'trebuchet-capture': return `🪨 ${A}’s trebuchet captured ${land} from ${B}!`
    default:          return `${A} made a move`
  }
}
