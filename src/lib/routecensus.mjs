// (v0.388.0) THE ROUTE-GATE CENSUS - the blind-tool lesson applied to the
// v0.386.0 route gate BEFORE the field needs it (the v0.371.0 shape, the
// 1130 lane's deliverability census sibling). The gate's refusals already
// print everything the field leg needs to be read - the bot, the walk
// label, the condemned waypoint, the tier that condemned it, the depth law
// that fired - but the mining tool never read them. This module is the pure
// parser (unit-pinned, the bankcensus v0.382.0 shape); decompose is its
// field read. Mining-surface only: zero fleet wiring, zero new log lines -
// the v0.379.0 precedent.
//
// THE ONE LINE (the wiring's own words, jobqueue.mjs gotoSafe):
//   route gate: <label>'s route crosses live hazard water at [x,y,z]
//   (<d>b|d?, zone envelope|point record; start depth <s>b|clean) - the
//   walk refused mid-plan, the caller rotates (no deeper than the bot
//   already stands)
// The message is THROWN - the caller's catch embeds it in its own line, so
// the parser scans for the marker wherever it lands and never assumes a
// wrapper. The fleet log carries NO per-line clock, so the rim-trap signal
// is a COUNT proxy, named as one: >= ROUTE_GATE_RIM_TRAP_REFUSALS on one
// bot is the suspect class (a transient pocket rim heals inside the 120s
// ledger TTL; a sustained burst is the every-route-out-refused shape the
// grace/cap knobs would tune).

const num = (s) => Number(s)

// The anatomy, pinned to the wiring's exact template (a wording drift in
// the gate breaks this parse loudly in tests - the sibling-shape law: the
// row and the census must read the same truth).
const ROUTE_RE = new RegExp(
  "route gate: (.+?)'s route crosses live hazard water at " +
  '\\[(-?\\d+),(-?\\d+),(-?\\d+)\\] ' +
  '\\((?:(\\d+(?:\\.\\d+)?)b|d\\?), (zone envelope|point record); ' +
  'start depth (?:(\\d+(?:\\.\\d+)?)b|clean)\\) - the walk refused mid-plan, the caller rotates'
)

// The fleet's bot tag: 'F19 [F19] message' - the refusal may ride any
// caller's line, the tag is the only stable attribution.
const BOT_TAG_RE = /(?:^|\s)(F\d+) \[\1\]/

/** The rim-trap burst threshold (count proxy - see the module head). */
export const ROUTE_GATE_RIM_TRAP_REFUSALS = 6

/**
 * Parse one log line into a route-gate refusal entry, or null.
 * Junk-safe: non-string input, a missing marker, a truncated anatomy (the
 * FATAL face truncation) and an unknown tier all judge NOTHING.
 * @param {string} [line] one fleet-log line
 * @returns {null|{bot: string|null, label: string, cell: {x:number,y:number,z:number}, d: number|null, tier: 'zone'|'point', startDepth: number|null, law: 'entry'|'dive'}}
 */
export function parseRouteGateLine (line) {
  if (typeof line !== 'string') return null
  const m = line.match(ROUTE_RE)
  if (!m) return null
  const botM = line.match(BOT_TAG_RE)
  return {
    bot: botM ? botM[1] : null,
    label: m[1],
    cell: { x: num(m[2]), y: num(m[3]), z: num(m[4]) },
    d: m[5] !== undefined ? num(m[5]) : null,
    tier: m[6] === 'zone envelope' ? 'zone' : 'point',
    startDepth: m[7] !== undefined ? num(m[7]) : null,
    // the depth law's read: a clean start means the ENTRY law fired (the
    // route walked toward water the bot was not standing in); a number
    // means the DIVE law fired (deeper than the bot already stands)
    law: m[7] !== undefined ? 'dive' : 'entry'
  }
}

/**
 * The route-gate census over a whole face log (pure; the decompose field
 * read). Accepts an array of lines or a raw text blob (split on newline).
 * @param {string[]|string} [lines] the face log
 * @returns {{refusals: number, entries: Array, byBot: Object<string,number>, byTier: {point:number,zone:number}, byLabel: Object<string,number>, cells: Array<{cell:{x:number,y:number,z:number}, count:number}>, lawMix: {entry:number,dive:number}, rimTrapSuspects: string[]}}
 */
export function routeGateCensus (lines) {
  const rows = Array.isArray(lines)
    ? lines
    : (typeof lines === 'string' ? lines.split('\n') : [])
  const entries = []
  for (const l of rows) {
    const e = parseRouteGateLine(l)
    if (e) entries.push(e)
  }
  const byBot = {}
  const byTier = { point: 0, zone: 0 }
  const byLabel = {}
  const cellCounts = new Map()
  const lawMix = { entry: 0, dive: 0 }
  for (const e of entries) {
    const botKey = e.bot ?? 'unknown'
    byBot[botKey] = (byBot[botKey] || 0) + 1
    byTier[e.tier]++
    byLabel[e.label] = (byLabel[e.label] || 0) + 1
    const ck = `${e.cell.x},${e.cell.y},${e.cell.z}`
    cellCounts.set(ck, (cellCounts.get(ck) || 0) + 1)
    lawMix[e.law]++
  }
  const cells = [...cellCounts.entries()].map(([ck, count]) => {
    const [x, y, z] = ck.split(',').map(num)
    return { cell: { x, y, z }, count }
  })
  const rimTrapSuspects = Object.entries(byBot)
    .filter(([, n]) => n >= ROUTE_GATE_RIM_TRAP_REFUSALS)
    .map(([b]) => b)
  return {
    refusals: entries.length,
    entries,
    byBot,
    byTier,
    byLabel,
    cells,
    lawMix,
    rimTrapSuspects
  }
}
