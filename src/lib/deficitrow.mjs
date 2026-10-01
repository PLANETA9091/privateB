// (v0.417.0) THE DEFICITS CLOCK - the materials plan's HARVEST side.
//
// The plan economy's two clocks: the map-trip lens (v0.415.0) read the LAUNCH
// side (16-32% of the plan's walk asks even leave), and the per-tick DEFICITS
// row - '   deficits: 100/5 (5.0%) 80/12 (15.0%) ...' (fleet19's topDeficits,
// riding the tick row's cadence since the plan existed) - stayed UNREAD. The
// row is the harvest side's own clock: five anonymous slots (required/have
// (pct%), the emitter prints NO resource names), the worst entry at index 0.
//
// THE DESIGN QUESTIONS the lens answers per face: does the worst slot's pct
// MOVE across the face (a drift near zero on the board's top = the stuck
// signature - the launch starvation's harvest-side confirmation: the fleet
// cannot harvest what the map never targets), how deep the board dips (the
// min slot-0 pct), and how much the ranking CHURNS (distinct pct-multisets -
// a flat multiset count means the board froze in one shape).
//
// THE INDEX CAVEAT (honest): the row is anonymous, so slot 0's arc is the
// WORST-ENTRY'S-SEAT movement - the NAME in the seat may churn between rows.
// A flat slot-0 arc with high board churn reads 'many stuck resources' (the
// seat changed hands because everything is stuck); a flat arc with LOW churn
// reads 'one resource stuck all face'. The census reports both legs so the
// decompose's read can split them. Junk-safe, honest zeros: a row whose
// entries fail to parse counts unparsed and is EXCLUDED from the board math
// (the clock never reads a half-read row). One parser per emitter: the plan
// progress row and the map-trip lines belong to their own lanes - REJECTED
// here.

// The per-tick row: the 'deficits: ' token is the emitter's own (unique in
// the field); leading whitespace optional (the tee preserves the emitter's
// three spaces, junk-tolerance costs nothing the token doesn't already pin).
export const DEFICITS_ROW_RE = /^\s*deficits: (.+)$/

const ENTRY_RE = /(\d+)\/(\d+) \((\d+(?:\.\d+)?)%\)/g

/**
 * Parse one deficits row. Returns null on every non-match (junk, the other
 * lanes' shapes, prose). Slots ride the emitter's own order (the worst at
 * index 0 - topDeficits sorts by required-minus-have descending).
 *
 * THE FIELD SHAPE (pinned by the emitter, not assumed): the entries carry a
 * space INSIDE them ('100/5 (5.0%)') and join with ' ' - a naive split(' ')
 * shreds every entry, and the tiling walk must TOLERATE THE ONE JOIN SPACE
 * between consecutive matches (a gap of 2+ still reads bad). The parse walks
 * ENTRY_RE matchAll and demands the matches TILE THE TAIL (one optional
 * space between, no trailing garbage): any future format edge reads bad -
 * counted unparsed, never silently half-read.
 */
export function parseDeficitsRow (line) {
  const m = typeof line === 'string' ? line.match(DEFICITS_ROW_RE) : null
  if (!m) return null
  const tail = m[1]
  const slots = []
  let last = 0
  for (const e of tail.matchAll(ENTRY_RE)) {
    if (e.index !== last && e.index !== last + 1) return { bad: true, slots }
    slots.push({ required: Number(e[1]), have: Number(e[2]), pct: Number(e[3]) })
    last = e.index + e[0].length
  }
  if (slots.length === 0 || last !== tail.length) return { bad: true, slots }
  return { bad: false, slots }
}

const r1 = v => Math.round(v * 10) / 10

/**
 * The census: the ordered row stream into one junk-safe read.
 * - rows: parsed rows feeding the board math (half-read rows excluded).
 * - slotsPerRow min/max: the board's width drift (the plan's resource count
 *   is stable in the field; a spread names a format edge).
 * - board: the slot-0 arc - first/last pct + drift, first/last have, the
 *   distinct slot-0 pct count (1 = the STUCK signature), the deepest dip.
 * - distinctBoards: the pct-multiset churn (the ranking moved).
 * - unparsed: rows the lens was BUILT for whose entries escaped - counted,
 *   never silently dropped.
 */
export function deficitsCensus (lines) {
  const c = {
    rows: 0,
    slotsPerRow: { min: null, max: null },
    board: {
      firstPct: null, lastPct: null, driftPct: null,
      firstHave: null, lastHave: null,
      distinctPct0: 0, minPct0: null
    },
    distinctBoards: 0,
    unparsed: 0
  }
  if (!Array.isArray(lines)) return c
  const pct0s = new Set()
  const boards = new Set()
  for (const line of lines) {
    const p = parseDeficitsRow(line)
    if (!p) continue
    if (p.bad) { c.unparsed++; continue }
    if (p.slots.length === 0) { c.unparsed++; continue }
    c.rows++
    const n = p.slots.length
    if (c.slotsPerRow.min === null || n < c.slotsPerRow.min) c.slotsPerRow.min = n
    if (c.slotsPerRow.max === null || n > c.slotsPerRow.max) c.slotsPerRow.max = n
    const s0 = p.slots[0]
    if (c.board.firstPct === null) { c.board.firstPct = s0.pct; c.board.firstHave = s0.have }
    c.board.lastPct = s0.pct
    c.board.lastHave = s0.have
    pct0s.add(s0.pct)
    if (c.board.minPct0 === null || s0.pct < c.board.minPct0) c.board.minPct0 = s0.pct
    boards.add(p.slots.map(s => s.pct).sort((a, b) => a - b).join(','))
  }
  if (c.board.firstPct !== null) c.board.driftPct = r1(c.board.lastPct - c.board.firstPct)
  c.board.distinctPct0 = pct0s.size
  c.distinctBoards = boards.size
  return c
}
