//
// climbwet.mjs - THE WATER COLUMN'S OWN DIG (v0.836.0)
//
// The climb lane's wet-ceiling ascend family, priced by its own book.
// This is the SIBLING of the v0.835.0 deep-pocket ascend (the fire-2030
// research note conflated the two families; the v0.835.0 lens fenced this
// family out by its start anchor and retagged the conflation - THIS lens
// completes the split: the sibling now priced on its own seat).
//
// ONE PARSER ONE TRUTH: the emitter is miner.mjs's climb lane (one
// writer, the v0.300.0 WET-CEILING ASCEND port):
//   `${tag} climb wet ascend: dug the ceiling ${aceil.name} at
//    [${acell.x},${acell.y},${acell.z}] (the water column owns every
//    bearing - the vertical digs instead, ${wetAscendDigs}/${WET_CEILING_DIG_BUDGET})`
// UNLIKE the deep-pocket ascend's emitter, THIS writer has NO
// isWaterName guard - the ceiling is whatever diggable block sits at
// feet+2, and in 26.2 WATER reads diggable:true, so the water ceiling
// dominates the field (face 106: 4 of 4, face 108: 1 of 1) - the water
// ceiling IS this lane's own voice: the ladders walked into the flooded
// band and every bearing was water.
//
// The N/M cell: N = the within-episode dig counter (per climb, printed
// after the increment), M = the WET_CEILING_DIG_BUDGET print (the
// trigger's own constant, read never invented). maxDig = the deepest
// within-episode dig the face produced - the closer to the budget, the
// more desperate the climb.
//
// The y-blind COLUMN map: same x,z across different y reads = the bot's
// own descent between climbs (face 106: F10's column stepped 62 -> 61 ->
// 60 - the column's own gravity owned the ladder). The column map is the
// water's own geography: where the flooded band owns every bearing.
//
// Junk-safe: non-array reads null (the o2gap convention); an ascend-free
// face reads the zero shape (the row stays silent). Pure: reads, never
// mutates. Zero fleet wiring (mining-surface only, the
// v0.379/.../v0.835.0 precedent).
//

const WETASCEND_RE = /^(F\d+) \[F\d+\] climb wet ascend: dug the ceiling (\S+) at \[(-?\d+),(-?\d+),(-?\d+)\] \(the water column owns every bearing - the vertical digs instead, (\d+)\/(\d+)\)$/

/**
 * parseWetCeilingAscent(line) - one climb wet ascend line's own cells.
 *
 * @param {string} [line] a fleet log line
 * @returns {null|{bot: string, name: string, spot: string,
 *   column: string, dig: number, budget: number}} the dig's shape
 *   (null on junk; spot 'x,y,z'; column 'x,z' y-blind)
 */
export function parseWetCeilingAscent (line) {
  if (typeof line !== 'string') return null
  const m = line.match(WETASCEND_RE)
  if (!m) return null
  const [, bot, name, x, y, z, dig, budget] = m
  return {
    bot,
    name,
    spot: `${x},${y},${z}`,
    column: `${x},${z}`,
    dig: Number(dig),
    budget: Number(budget)
  }
}

/**
 * wetCeilingCensus(lines) - the climb wet ascend family's own census.
 *
 * @param {string[]} [lines] the face log (array of lines)
 * @returns {null|{ascends: number, names: Object<string, number>,
 *   spots: Object<string, number>, distinctSpots: number,
 *   topSpot: string|null, topSpotDigs: number,
 *   columns: Object<string, number>, distinctColumns: number,
 *   topColumn: string|null, topColumnDigs: number, maxDig: number,
 *   budget: number|null}} the census (null on non-array; zero ascends =
 *   the zero shape, the row stays silent; topSpot/topColumn byte order
 *   on a tie; budget = the faces' own print, null when unprinted)
 */
export function wetCeilingCensus (lines) {
  if (!Array.isArray(lines)) return null
  const c = {
    ascends: 0,
    names: {},
    spots: {},
    distinctSpots: 0,
    topSpot: null,
    topSpotDigs: 0,
    columns: {},
    distinctColumns: 0,
    topColumn: null,
    topColumnDigs: 0,
    maxDig: 0,
    budget: null
  }
  for (const line of lines) {
    const p = parseWetCeilingAscent(line)
    if (!p) continue
    c.ascends++
    c.names[p.name] = (c.names[p.name] || 0) + 1
    c.spots[p.spot] = (c.spots[p.spot] || 0) + 1
    c.columns[p.column] = (c.columns[p.column] || 0) + 1
    if (p.dig > c.maxDig) c.maxDig = p.dig
    if (c.budget == null) c.budget = p.budget
  }
  if (c.ascends === 0) return c
  c.distinctSpots = Object.keys(c.spots).length
  c.distinctColumns = Object.keys(c.columns).length
  // the deterministic read: max count, byte order on the tie (the same
  // answer every face, no map-order luck)
  for (const spot of Object.keys(c.spots).sort()) {
    if (c.spots[spot] > c.topSpotDigs) {
      c.topSpot = spot
      c.topSpotDigs = c.spots[spot]
    }
  }
  for (const col of Object.keys(c.columns).sort()) {
    if (c.columns[col] > c.topColumnDigs) {
      c.topColumn = col
      c.topColumnDigs = c.columns[col]
    }
  }
  return c
}

/**
 * wetCeilingCensusRow(c) - the census's own byte-exact row.
 *
 * @param {Object|null} [c] a wetCeilingCensus result
 * @returns {string|null} the row (null on junk cells or the honest
 *   silence - a face with zero ascends prints nothing)
 */
export function wetCeilingCensusRow (c) {
  if (c == null || typeof c !== 'object' || Array.isArray(c)) return null
  if (!Number.isFinite(c.ascends) || c.ascends <= 0) return null
  if (c.names == null || typeof c.names !== 'object') return null
  if (c.spots == null || typeof c.spots !== 'object') return null
  if (c.columns == null || typeof c.columns !== 'object') return null
  if (!Number.isFinite(c.distinctSpots) || !Number.isFinite(c.distinctColumns)) return null
  if (!Number.isFinite(c.maxDig) || !Number.isFinite(c.topSpotDigs) || !Number.isFinite(c.topColumnDigs)) return null
  if (c.topSpot == null || c.topColumn == null) return null
  const names = Object.keys(c.names).sort().map((k) => `${k} x${c.names[k]}`).join(', ')
  const budget = c.budget == null ? '?' : String(c.budget)
  return `the water column's own dig (v0.836.0): ${c.ascends} ascend(s) dug the ceiling (${names}), ${c.distinctSpots} spot(s) - [${c.topSpot}] owned ${c.topSpotDigs} dig(s), ${c.distinctColumns} column(s) - [${c.topColumn}] owned ${c.topColumnDigs} dig(s), max dig ${c.maxDig} of ${budget}`
}
