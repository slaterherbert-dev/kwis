import React, { memo } from 'react'
import { getMap, bannerOf, hexCenter, hexPoints, mapViewBox, HEX } from '../../lib/conquest'

// Draws the Conquest map.
//   state       { [tileId]: { owner, owner_banner, walls, is_homeland, locked_until, shield_until } }
//   myId        this student's player id (their tiles get a bright edge), optional
//   highlight   Set of tile ids that can be acted on (dashed outline), optional
//   selected    tile id that's selected, optional
//   flash       { [tileId]: 'capture' | 'hit' | ... } recent events to pulse, optional
//   labels      show landmark names (projector) or not (small screens)
//   now         current time in ms (for shields and cooldowns)
//   onTap       called with a tile id, optional

const TERRAIN_FILL = {
  plains: '#4f6b3a',
  forest: '#2f5a3c',
  mountains: '#5d5f6b',
  desert: '#a9874f',
  coast: '#b9a675',
}

// Small terrain marks so unclaimed land looks like land
function TerrainMark({ terrain, x, y }) {
  const c = 'rgba(255,255,255,0.22)'
  if (terrain === 'mountains') return <path d={`M${x - 14},${y + 9} L${x - 4},${y - 8} L${x + 3},${y + 3} L${x + 7},${y - 3} L${x + 16},${y + 9} Z`} fill={c} />
  if (terrain === 'forest') return (
    <g fill={c}>
      <path d={`M${x - 10},${y + 8} L${x - 4},${y - 6} L${x + 2},${y + 8} Z`} />
      <path d={`M${x + 1},${y + 9} L${x + 7},${y - 3} L${x + 13},${y + 9} Z`} />
    </g>
  )
  if (terrain === 'desert') return <path d={`M${x - 14},${y + 4} q7,-8 14,0 t14,0`} fill="none" stroke={c} strokeWidth="2.5" strokeLinecap="round" />
  if (terrain === 'coast') return <path d={`M${x - 12},${y + 2} q4,-5 8,0 t8,0 t8,0`} fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" />
  return <circle cx={x} cy={y} r="2.5" fill={c} />
}

function HexMap({ state, myId, highlight, selected, flash, labels = true, now = Date.now(), onTap }) {
  const { tiles } = getMap()
  const { w, h } = mapViewBox()

  return (
    <svg className="cq-map" viewBox={`0 0 ${w.toFixed(0)} ${h.toFixed(0)}`} role="img" aria-label="Conquest map">
      <defs>
        <radialGradient id="cq-sea" cx="50%" cy="45%" r="75%">
          <stop offset="0%" stopColor="#163a55" />
          <stop offset="100%" stopColor="#0a1a29" />
        </radialGradient>
      </defs>
      <rect x="0" y="0" width={w} height={h} rx="18" fill="url(#cq-sea)" />

      {/* land */}
      {tiles.map(t => {
        const s = state[t.id] || {}
        const { x, y } = hexCenter(t)
        const b = bannerOf(s.owner_banner)
        const owned = !!(s.owner && b)
        const mine = owned && myId && s.owner === myId
        const shielded = owned && s.shield_until && Date.parse(s.shield_until) > now
        const cooling = owned && s.locked_until && Date.parse(s.locked_until) > now
        const isSel = selected === t.id
        const canAct = highlight && highlight.has(t.id)
        const pulse = flash && flash[t.id]
        return (
          <g key={t.id} className={`cq-tile ${onTap ? 'tappable' : ''} ${pulse ? 'pulse pulse-' + pulse : ''}`}
            onClick={onTap ? () => onTap(t.id) : undefined}>
            <polygon points={hexPoints(x, y, HEX - 1.5)} fill={TERRAIN_FILL[t.terrain]} stroke="#0b1520" strokeWidth="3" />
            {owned && (
              <polygon points={hexPoints(x, y, HEX - 1.5)} fill={b.color} fillOpacity={mine ? 0.82 : 0.68}
                stroke={mine ? '#ffffff' : b.color} strokeWidth={mine ? 4 : 2.5} />
            )}
            {!owned && <TerrainMark terrain={t.terrain} x={x} y={y - 4} />}

            {owned && s.is_homeland && (
              <polygon points={hexPoints(x, y, HEX - 9)} fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="2.5" strokeDasharray="1 0" />
            )}
            {owned && (
              <text x={x} y={y + (labels ? 2 : 6)} textAnchor="middle" fontSize="26" dominantBaseline="middle" style={{ pointerEvents: 'none' }}>
                {b.icon}
              </text>
            )}
            {owned && s.is_homeland && (
              <path d={`M${x - 9},${y - 22} v-8 h4 v3 h3 v-3 h4 v3 h3 v-3 h4 v8 z`} fill="#fff" opacity="0.92" />
            )}
            {owned && !s.is_homeland && s.walls > 0 && (
              <g>
                {Array.from({ length: s.walls }, (_, i) => (
                  <rect key={i} x={x - (s.walls * 9) / 2 + i * 9 + 1} y={y - 30} width="7" height="9" rx="1.5" fill="#fff" opacity="0.92" />
                ))}
              </g>
            )}
            {(shielded || cooling) && (
              <polygon points={hexPoints(x, y, HEX - 5)} fill="none" stroke="#9fd3ff" strokeWidth="3" strokeDasharray="6 5" opacity="0.9" />
            )}

            {labels && t.label && (
              <text x={x} y={y + 30} textAnchor="middle" fontSize="11.5" fontWeight="700" fill="#fff"
                stroke="rgba(0,0,0,0.65)" strokeWidth="3" paintOrder="stroke" style={{ pointerEvents: 'none' }}>
                {t.label}
              </text>
            )}

            {canAct && !isSel && (
              <polygon points={hexPoints(x, y, HEX - 4)} fill="none" stroke="#ffffff" strokeWidth="2.5" strokeDasharray="7 5" opacity="0.85" />
            )}
            {isSel && (
              <polygon points={hexPoints(x, y, HEX - 3)} fill="rgba(255,255,255,0.12)" stroke="#ffffff" strokeWidth="5" />
            )}
          </g>
        )
      })}
    </svg>
  )
}

export default memo(HexMap)
