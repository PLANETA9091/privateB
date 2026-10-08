//
// deeppocket.mjs - THE DEEP-POCKET ASCEND'S OWN SHAPE (v0.835.0)
//
// The deep-pocket ascend's SHAPE lens. The lane's other seats already own:
// the v0.707.0 sensortoll owns the reset(-1) toll (the count only), the
// v0.708.0 ascendstall owns the live/dead split + the per-bot stall mass.
// UNOWNED until this lens: the dig's own shape - WHICH block the ceiling
// was, WHERE the pocket sits, HOW DEEP the lid ran, WHAT the o2 read when
// the bot bought its way out.
//
// ONE PARSER ONE TRUTH: the emitter is miner.mjs's submerged branch (one
// writer):
//   `${tag} water: deep-pocket ascend - dug the ceiling ${ceil.name} at
//    [${tgt.x},${tgt.y},${tgt.z}]${plan.offset > 0 ? ` through a
//    ${plan.offset}-cell lid` : ''} (jump stalled ${ASCEND_STALL_PASSES}+
//    passes${plan.offset > 0 ? `; ${plan.why}` : ''}, o2
//    ${o2SensorLabel(read.oxygen)})`
// The guard upstream (`isWaterName(ceil.name) !== true`) means WATER CAN
// NEVER RIDE THIS LINE - the water ceiling is the SIBLING lane's own voice
// (miner.mjs's 'climb wet ascend: dug the ceiling water at ...', a
// different family; this lens fences it out - the start anchor owns the
// fence). The fire-2030 research note conflated the two families; THIS
// header is the honest retag: the deep-pocket ascend's hostility signal
// is the ceiling NAME spread + the spot REPEATS (face 106: F8 bought out
// of the same pocket [-141,53,417] FOUR times - the pocket owns the bot,
// not the other way round), never a water ceiling.
//
// The lid clause and the why clause ride TOGETHER (both gated on
// plan.offset > 0), and the only why a dig can print is lidScanPlan's own
// reachable string ('the lid is N water cell(s) - the ceiling reads
// diggable at +N') - the refuse whys never dig, so they never log.
//
// The o2 cell reads o2SensorLabel's three shapes (the STRICT gate, no
// coercion): numeric ('6'), the reset sentinel ('reset(-1)' - the
// v0.707.0 toll's own family, dead), the junk label ('?' - a non-number
// was never a measurement). Numeric parse rides /^\d+$/ per the research
// contract; the sentinel NEVER invents a number (junk in null out).
//
// Junk-safe: non-array reads null (the o2gap convention); an ascend-free
// face reads the zero shape (the row stays silent). Pure: reads, never
// mutates. Zero fleet wiring (mining-surface only, the
// v0.379/.../v0.832.0 precedent).
//

const DEEPPOCKET_RE = /^(F\d+) \[F\d+\] water: deep-pocket ascend - dug the ceiling (\S+) at \[(-?\d+),(-?\d+),(-?\d+)\](?: through a (\d+)-cell lid)? \(jump stalled (\d+)\+ passes(?:; (.*?))?, o2 (reset\(-1\)|\d+|\?)\)$/

/**
 * parseDeepPocketAscent(line) - one ascend line's own cells.
 *
 * @param {string} [line] a fleet log line
 * @returns {null|{bot: string, name: string, spot: string,
 *   lid: number, why: string|null, stall: number, o2: number|null,
 *   o2Raw: string, dead: boolean}} the dig's shape (null on junk; lid 0
 *   = the legacy probe's own ceiling; o2 null = the sentinel or the junk
 *   label, dead only on the reset sentinel)
 */
export function parseDeepPocketAscent (line) {
  if (typeof line !== 'string') return null
  const m = line.match(DEEPPOCKET_RE)
  if (!m) return null
  const [, bot, name, x, y, z, lid, stall, why, o2Raw] = m
  const numeric = /^\d+$/.test(o2Raw)
  return {
    bot,
    name,
    spot: `${x},${y},${z}`,
    lid: lid != null ? Number(lid) : 0,
    why: why != null && why.length > 0 ? why : null,
    stall: Number(stall),
    o2: numeric ? Number(o2Raw) : null,
    o2Raw,
    dead: o2Raw === 'reset(-1)'
  }
}

/**
 * deepPocketCensus(lines) - the deep-pocket ascend's own shape census.
 *
 * @param {string[]} [lines] the face log (array of lines)
 * @returns {null|{ascends: number, names: Object<string, number>,
 *   spots: Object<string, number>, distinctSpots: number,
 *   topSpot: string|null, topSpotDigs: number, o2Floor: number|null,
 *   numericReads: number, deadReads: number, lidDigs: number,
 *   maxLid: number, whys: Object<string, number>}} the shape census
 *   (null on non-array; zero ascends = the zero shape, the row stays
 *   silent; topSpot byte-order on a tie; o2Floor over NUMERIC reads
 *   only - the sentinel never prices the floor)
 */
export function deepPocketCensus (lines) {
  if (!Array.isArray(lines)) return null
  const c = {
    ascends: 0,
    names: {},
    spots: {},
    distinctSpots: 0,
    topSpot: null,
    topSpotDigs: 0,
    o2Floor: null,
    numericReads: 0,
    deadReads: 0,
    lidDigs: 0,
    maxLid: 0,
    whys: {}
  }
  for (const line of lines) {
    const p = parseDeepPocketAscent(line)
    if (!p) continue
    c.ascends++
    c.names[p.name] = (c.names[p.name] || 0) + 1
    c.spots[p.spot] = (c.spots[p.spot] || 0) + 1
    if (p.o2 != null) {
      c.numericReads++
      if (c.o2Floor == null || p.o2 < c.o2Floor) c.o2Floor = p.o2
    }
    if (p.dead) c.deadReads++
    if (p.lid > 0) {
      c.lidDigs++
      if (p.lid > c.maxLid) c.maxLid = p.lid
    }
    if (p.why != null) c.whys[p.why] = (c.whys[p.why] || 0) + 1
  }
  if (c.ascends === 0) return c
  c.distinctSpots = Object.keys(c.spots).length
  // the repeat whale: max count, byte order on the tie (the deterministic
  // read - the same answer every face, no map-order luck)
  for (const spot of Object.keys(c.spots).sort()) {
    if (c.spots[spot] > c.topSpotDigs) {
      c.topSpot = spot
      c.topSpotDigs = c.spots[spot]
    }
  }
  return c
}

/**
 * deepPocketCensusRow(c) - the shape census's own byte-exact row.
 *
 * @param {Object|null} [c] a deepPocketCensus result
 * @returns {string|null} the row (null on junk cells or the honest
 *   silence - a face with zero ascends prints nothing)
 */
export function deepPocketCensusRow (c) {
  if (c == null || typeof c !== 'object' || Array.isArray(c)) return null
  if (!Number.isFinite(c.ascends) || c.ascends <= 0) return null
  if (c.names == null || typeof c.names !== 'object') return null
  if (c.spots == null || typeof c.spots !== 'object') return null
  if (!Number.isFinite(c.distinctSpots) || !Number.isFinite(c.numericReads)) return null
  if (!Number.isFinite(c.deadReads) || !Number.isFinite(c.lidDigs) || !Number.isFinite(c.maxLid)) return null
  if (c.topSpot == null || !Number.isFinite(c.topSpotDigs)) return null
  const names = Object.keys(c.names).sort().map((k) => `${k} x${c.names[k]}`).join(', ')
  const floor = c.o2Floor == null
    ? 'unavailable'
    : String(c.o2Floor)
  return `the deep-pocket ascend's own book (v0.835.0): ${c.ascends} ascend(s) dug the ceiling (${names}), ${c.distinctSpots} spot(s) - [${c.topSpot}] owned ${c.topSpotDigs} dig(s), o2 floor ${floor} over ${c.numericReads} numeric reading(s), ${c.lidDigs} lid dig(s) (deepest ${c.maxLid}), ${c.deadReads} dead read(s)`
}
