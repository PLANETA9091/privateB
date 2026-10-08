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
// (v0.840.0) THE WET COLUMN'S KEPT PROMISE - the family's own completion
// read, on the SAME parser (one parser one truth, no new regex): of the
// face's own ascends, how many spent the WHOLE budget in the column
// (dig >= budget, the promise kept) and how many abandoned it early
// (dig < budget). The lens counts, it names NO cause - why the climb
// stopped short rides the emitter's own story, not this book. The real
// faces so far read kept=0 everywhere (106: max 2 of 4, 109: max 3 of 4,
// 110: max 1 of 4) - the budget always outran the climb; the row prints
// the honest count either way.
//
// (v0.842.0) THE SHORTFALL'S OWN SHAPE - the completion's own follow-up:
// kept=0 everywhere poses the reach question the kept/abandoned counts
// cannot answer - HOW SHORT does the abandoned climb fall? The deficit =
// budget - dig on the SAME parser (one parser one truth, no new regex),
// clamped at 0 (the kept class rides the completion's own law: dig >=
// budget). The histogram prints the whole shape ascending; minShort =
// the nearest miss - one dig flips it (the reach's own evidence) - and
// reads null when nothing is short (all kept).
//
// (v0.845.0) THE WASTED DIG - the shortfall's own WHY leg, priced from
// the emitter's own words (the trend law: the lens prices the class and
// names NO cause - WHY the ceiling is water rides the aquifer's own
// book). The v0.836.0 header named the water ceiling "this lane's own
// voice"; the census's names cell prints the mix raw. This lens prices
// what the mix MEANS for the dig's own purpose: the writer's shape is
// 'dig the ceiling (feet+2) and rise into the fresh cell' - a WATER cell
// is never a fresh cell (the server cannot break water; the dig
// resolves, the world is unchanged, the bot sinks back into the same
// column - face 106's F10 stepped 62 -> 61 -> 60 on three water digs,
// face 113's F13 62 -> 61 -> 60 on three more, zero rise bought). So
// water = the WASTED class (no headroom bought, the budget tick burned,
// the 6s dig window spent on nothing) and every other name = the buying
// class. The field's own weight: faces 112/113/114 rode 2/2, 4/4, 3 of 4
// water digs - the kept=0 streak's own shape. The consistency fence (the
// v0.844.0 cell's own law): water + solid must equal digs when all three
// speak - a self-inconsistent shape invents nothing. The calm verdict
// renders (the v0.423.0 lesson): an all-solid face prints 0 wasted - the
// cure's success signature, not a silence. Junk-safe: non-array reads
// null (the o2gap convention); a face with no priced dig reads the zero
// shape (the row stays silent). Pure: reads, never mutates. Zero fleet
// wiring (mining-surface only, the v0.379/.../v0.842.0 precedent).
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

/**
 * wetColumnCompletion(lines) - the wet column's kept promise (v0.840.0).
 *
 * The family's own completion read on the SAME parser (one parser one
 * truth, no new regex): an ascend KEPT the budget when its own dig
 * counter reached the budget print (dig >= budget - the column's whole
 * spend rode the climb); it ABANDONED the budget early when the climb
 * stopped short (dig < budget). The lens counts, it names NO cause.
 *
 * @param {string[]} [lines] the face log (array of lines)
 * @returns {null|{ascends: number, kept: number, abandoned: number,
 *   maxDig: number, budget: number|null}} the completion read (null on
 *   non-array; zero ascends = the zero shape, the row stays silent;
 *   budget = the faces' own print, the first one, null when unprinted)
 */
export function wetColumnCompletion (lines) {
  if (!Array.isArray(lines)) return null
  const w = { ascends: 0, kept: 0, abandoned: 0, maxDig: 0, budget: null }
  for (const line of lines) {
    const p = parseWetCeilingAscent(line)
    if (!p) continue
    w.ascends++
    if (p.dig >= p.budget) w.kept++
    else w.abandoned++
    if (p.dig > w.maxDig) w.maxDig = p.dig
    if (w.budget == null) w.budget = p.budget
  }
  return w
}

/**
 * wetColumnCompletionRow(w) - the kept promise's own byte-exact row.
 *
 * @param {Object|null} [w] a wetColumnCompletion result
 * @returns {string|null} the row (null on junk cells or the honest
 *   silence - a face with zero ascends prints nothing)
 */
export function wetColumnCompletionRow (w) {
  if (w == null || typeof w !== 'object' || Array.isArray(w)) return null
  if (!Number.isFinite(w.ascends) || w.ascends <= 0) return null
  if (!Number.isFinite(w.kept) || !Number.isFinite(w.abandoned) || !Number.isFinite(w.maxDig)) return null
  const budget = w.budget == null ? '?' : String(w.budget)
  return `the wet column's kept promise (v0.840.0): ${w.kept} of ${w.ascends} ascend(s) kept the budget (the column's whole spend), ${w.abandoned} abandoned it early, max dig ${w.maxDig} of ${budget}`
}

/**
 * wetColumnShortfall(lines) - the shortfall's own shape (v0.842.0).
 *
 * The completion's own follow-up on the SAME parser (one parser one
 * truth, no new regex): the reach question the kept/abandoned counts
 * cannot answer - HOW SHORT does the abandoned climb fall? deficit =
 * budget - dig, clamped at 0 (the kept class rides the completion's own
 * law: dig >= budget reads 0 - the mutual fence with wetColumnCompletion).
 *
 * @param {string[]} [lines] the face log (array of lines)
 * @returns {null|{ascends: number, priced: number, kept: number,
 *   hist: Object<string, number>, maxDeficit: number, minShort: number|null,
 *   budget: number|null}} the shortfall read (null on non-array; a face
 *   with zero ascends = the zero shape, the row stays silent; minShort =
 *   the smallest POSITIVE deficit, null when nothing is short; budget =
 *   the faces' own print, the first one, null when no ascend priced)
 */
export function wetColumnShortfall (lines) {
  if (!Array.isArray(lines)) return null
  const s = { ascends: 0, priced: 0, kept: 0, hist: {}, maxDeficit: 0, minShort: null, budget: null }
  for (const line of lines) {
    const p = parseWetCeilingAscent(line)
    if (!p) continue
    s.ascends++
    if (!Number.isFinite(p.dig) || !Number.isFinite(p.budget)) continue // the defensive guard - the regex is numeric-only today
    if (s.budget == null) s.budget = p.budget
    s.priced++
    const d = Math.max(0, p.budget - p.dig)
    if (d === 0) s.kept++
    s.hist[d] = (s.hist[d] || 0) + 1
    if (d > s.maxDeficit) s.maxDeficit = d
    if (d > 0 && (s.minShort == null || d < s.minShort)) s.minShort = d
  }
  return s
}

/**
 * wetColumnShortfallRow(s) - the shortfall's own byte-exact row.
 *
 * @param {Object|null} [s] a wetColumnShortfall result
 * @returns {string|null} the row (null on junk cells or the honest
 *   silence - a face with no priced ascend prints nothing; the nearest
 *   cell is absent when nothing is short, the all-kept face's own shape)
 */
export function wetColumnShortfallRow (s) {
  if (s == null || typeof s !== 'object' || Array.isArray(s)) return null
  if (!Number.isFinite(s.ascends) || s.ascends <= 0) return null
  if (!Number.isFinite(s.priced) || s.priced <= 0) return null
  const keys = Object.keys(s.hist || {}).map(Number).filter(Number.isFinite).sort((a, b) => a - b)
  if (!keys.length) return null
  const hist = keys.map(k => `${k}x${s.hist[k]}`).join(' ')
  const near = s.minShort == null ? '' : `, the nearest ${s.minShort} short`
  return `the wet column's shortfall (v0.842.0): ${s.priced} of ${s.ascends} ascend(s) priced (the budget's own reach), the deficits ${hist} (max ${s.maxDeficit}${near})`
}

/**
 * wetColumnWaste(lines) - the wasted dig's own class (v0.845.0).
 *
 * The shortfall's own WHY leg on the SAME parser (one parser one truth,
 * no new regex): the dig's purpose is 'dig the ceiling (feet+2) and rise
 * into the fresh cell' - a WATER cell is never a fresh cell (the server
 * cannot break water; the dig resolves, the world is unchanged, the bot
 * sinks back). So the digs split water (the WASTED class - no headroom
 * bought, the budget tick burned) vs solid (the buying class). The lens
 * prices the class and names NO cause - why the ceiling is water rides
 * the aquifer's own book.
 *
 * @param {string[]} [lines] the face log (array of lines)
 * @returns {null|{digs: number, water: number, solid: number}} the waste
 *   read (null on non-array; zero priced digs = the zero shape, the row
 *   stays silent; water + solid === digs holds by construction)
 */
export function wetColumnWaste (lines) {
  if (!Array.isArray(lines)) return null
  const w = { digs: 0, water: 0, solid: 0 }
  for (const line of lines) {
    const p = parseWetCeilingAscent(line)
    if (!p) continue
    w.digs++
    if (p.name === 'water') w.water++
    else w.solid++
  }
  return w
}

/**
 * wetColumnWasteRow(w) - the wasted dig's own byte-exact row.
 *
 * The calm verdict renders (the v0.423.0 lesson): an all-solid face
 * prints 0 wasted - the cure's success signature, not a silence. The
 * consistency fence (the v0.844.0 cell's own law): water + solid must
 * equal digs when all three speak.
 *
 * @param {Object|null} [w] a wetColumnWaste result
 * @returns {string|null} the row (null on junk cells or the honest
 *   silence - a face with no priced dig prints nothing)
 */
export function wetColumnWasteRow (w) {
  if (w == null || typeof w !== 'object' || Array.isArray(w)) return null
  if (!Number.isFinite(w.digs) || !Number.isFinite(w.water) || !Number.isFinite(w.solid)) return null
  if (w.digs <= 0 || w.water < 0 || w.solid < 0) return null
  if (w.water + w.solid !== w.digs) return null // the consistency fence
  return `the wet column's own waste (v0.845.0): ${w.water} of ${w.digs} dig(s) spent on water (a water cell buys no headroom - the dig's own purpose defeated), ${w.solid} on solid`
}
