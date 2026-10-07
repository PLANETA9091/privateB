// (v0.427.0) THE TRANSIT CENSUS - the rescue swim's launch lane, the water
// family's next unread block. The sentry lens (v0.422.0) read the per-pass
// sight, the frozen census (v0.426.0) the freeze family, the rescue ledger
// the end verdicts - the TRANSIT lane stayed raw: 114 launch lines and 10
// stall verdicts across the two held faces, read only by the raw counters.
// The emitter's own law (miner.mjs's transit branch):
//   launch 'water: transit toward known land (NAME) at [x,z] d=N' - the
//          map's named shore (the land ledger's own name, e.g. oak_log),
//          the planar target, the integer distance; one line per
//          transit-plan arm (re-arms re-print - the repeats ARE the story)
//   stall  'water: transit stalled (d=N after N passes - the walls own this
//          swim; the release takes over)' - the transit plan's own give-up
//          (the distance it died at, the passes it burned)
// The shore-stall line ('water: shore transit stalled (r=...)') stays the
// rescue ledger's lane byte for byte (its shoreStall key) - one parser per
// emitter, the split-of-labor law.
// THE FIELD QUESTION (the held faces' own words): every launch names the
// SAME land (oak_log - the map ledger's only shore) and the targets pin
// per-bot: F1 launched 73 times at [-134,413] (the walls class - the
// shore-pin follow-up reads d=2..3 stalls at 15-19 passes), F2 30 times at
// [-101,399], F17 10 at [-125,420]. The cure input: a per-bot pinned
// target says the WALLS own the column (the release lane's geometry); a
// shared target says the MAP points every swim at one shore (the land
// ledger's own concentration).
//
// One parser per emitter; mining-surface only: zero fleet wiring, zero new
// log lines (the v0.379.0/v0.403.0/v0.408.0/v0.421.0/v0.426.0 precedent).
//
// (v0.435.0) THE STALL DEPTH SPLIT - the pocket read the face-27 field scan
// named: F1's 10 stalls ALL died at d=2..3 after 15..19 passes - THE WALLS
// OWN THE LAST 2-3 BLOCKS, not the route. The split makes that read
// mechanical on every future face. Each stall joins the bot's MOST RECENT
// launch (the log's order is the swim's order) and is cut twice,
// independently:
//   WHERE IT DIED: pocket (d <= TRANSIT_POCKET_DEPTH, the lip walls - the
//                  range/lip cure's class) vs route (further out).
//   HOW FAR IT SWAM: ground gained = launch dist - stall dist;
//                  toTheLip (gained >= half the launch distance - the swim
//                  WORKED, the final approach refused) vs early (gained <
//                  half - the launch column or the push-back owned it, NOT
//                  the lip). A NEGATIVE gain is legal evidence (the current
//                  can push the bot back past the plan point).
// A stall with no preceding launch by that bot is UNPAIRED - counted, never
// assumed (the honest-evidence law).

const TAG = '^(F\\d+) \\[\\1\\] '

// (v0.435.0) the pocket's own depth - the face read's d=2..3 band, the
// wall-lip class the range/lip cure aims at.
export const TRANSIT_POCKET_DEPTH = 3

const TRANSIT_LAUNCH_RE = new RegExp(TAG +
  'water: transit toward known land \\(([a-z][a-z0-9_]*)\\) at \\[(-?\\d+),(-?\\d+)\\] d=(\\d+)$')

const TRANSIT_STALL_RE = new RegExp(TAG +
  'water: transit stalled \\(d=(\\d+) after (\\d+) passes - the walls own this swim; the release takes over\\)$')

/**
 * Parse one transit launch line, or null.
 * @param {string} [line]
 * @returns {null|{bot: string, land: string, x: number, z: number, dist: number}}
 */
export function parseTransitLaunch (line) {
  if (typeof line !== 'string') return null
  const m = line.match(TRANSIT_LAUNCH_RE)
  if (!m) return null
  return { bot: m[1], land: m[2], x: Number(m[3]), z: Number(m[4]), dist: Number(m[5]) }
}

/**
 * Parse one transit stall line, or null.
 * @param {string} [line]
 * @returns {null|{bot: string, dist: number, passes: number}}
 */
export function parseTransitStall (line) {
  if (typeof line !== 'string') return null
  const m = line.match(TRANSIT_STALL_RE)
  if (!m) return null
  return { bot: m[1], dist: Number(m[2]), passes: Number(m[3]) }
}

/**
 * The transit census over a whole face log (pure; the decompose field
 * read). Accepts an array of lines or a raw text blob (split on newline).
 * The targets carry per-bot attribution (the pinned-seat read: a target
 * hit by ONE bot many times is the walls class, by MANY bots the map's
 * concentration) - the planar key law (x,z) from the hot-spot lens.
 * (v0.435.0) The stalls carry the DEPTH SPLIT: pocket vs route (where it
 * died) and pairs (ground gained vs the bot's most recent launch: toTheLip
 * vs early) + unpairedN (no launch to pair - evidence, never assumed).
 * (v0.446.0) THE LAUNCH CADENCE - each target carries per-bot seqs (the
 * bot's own launch-d sequence stats {n,min,max}): face 32 proved the
 * pinned-seat claim over-broad - F19 launched 32 times at [-78,375] with
 * d descending 46..16 (the honest APPROACH, 65% closed), while face 30's
 * F8 launched 26 times at [-143,430] ALL at d=11 (the true WALLS - zero
 * progress). The repeats alone say nothing; the d-progression is the
 * truth-check, targetCadence() is its verdict.
 * @param {string[]|string} [lines] the face log
 * @returns {{launches: {n: number, byBot: {}, byLand: {}, dist: {n: number, min: number|null, max: number|null, sum: number}}, stalls: {n: number, byBot: {}, distMax: number|null, passesMax: number|null, pocketN: number, routeN: number, pairs: {n: number, gainedMin: number|null, gainedMax: number|null, gainedSum: number, toTheLipN: number, earlyN: number}, unpairedN: number}, targets: Array<{key: string, x: number, z: number, total: number, bots: {}, land: string, seqs: {[bot]: {n: number, min: number, max: number}}}> , unparsed: number}}
 */
export function transitCensus (lines) {
  const rows = Array.isArray(lines)
    ? lines
    : (typeof lines === 'string' ? lines.split('\n') : [])
  const launches = { n: 0, byBot: {}, byLand: {}, dist: { n: 0, min: null, max: null, sum: 0 } }
  const stalls = {
    n: 0, byBot: {}, distMax: null, passesMax: null,
    pocketN: 0, routeN: 0,
    pairs: { n: 0, gainedMin: null, gainedMax: null, gainedSum: 0, toTheLipN: 0, earlyN: 0 },
    unpairedN: 0
  }
  const targets = new Map()
  const lastLaunch = new Map() // (v0.435.0) bot -> its most recent launch dist (the swim's order)
  let unparsed = 0
  for (const l of rows) {
    const p = parseTransitLaunch(l)
    if (p) {
      launches.n++
      launches.byBot[p.bot] = (launches.byBot[p.bot] || 0) + 1
      launches.byLand[p.land] = (launches.byLand[p.land] || 0) + 1
      if (launches.dist.min === null || p.dist < launches.dist.min) launches.dist.min = p.dist
      if (launches.dist.max === null || p.dist > launches.dist.max) launches.dist.max = p.dist
      launches.dist.sum += p.dist
      launches.dist.n++
      const key = `${p.x},${p.z}`
      let t = targets.get(key)
      if (!t) {
        t = { key, x: p.x, z: p.z, total: 0, bots: {}, land: p.land, seqs: {} } // (v0.446.0) seqs rides the target
        targets.set(key, t)
      }
      t.total++
      t.bots[p.bot] = (t.bots[p.bot] || 0) + 1
      // (v0.446.0) the bot's own launch-d sequence (the cadence lens's fuel)
      const seq = t.seqs[p.bot] || (t.seqs[p.bot] = { n: 0, min: p.dist, max: p.dist })
      seq.n++
      if (p.dist < seq.min) seq.min = p.dist
      if (p.dist > seq.max) seq.max = p.dist
      lastLaunch.set(p.bot, p.dist)
      continue
    }
    const s = parseTransitStall(l)
    if (s) {
      stalls.n++
      stalls.byBot[s.bot] = (stalls.byBot[s.bot] || 0) + 1
      if (stalls.distMax === null || s.dist > stalls.distMax) stalls.distMax = s.dist
      if (stalls.passesMax === null || s.passes > stalls.passesMax) stalls.passesMax = s.passes
      // (v0.435.0) THE STALL DEPTH SPLIT - where it died vs how far it swam.
      if (s.dist <= TRANSIT_POCKET_DEPTH) stalls.pocketN++
      else stalls.routeN++
      const launchDist = lastLaunch.get(s.bot)
      if (launchDist === undefined) {
        stalls.unpairedN++
      } else {
        const gained = launchDist - s.dist
        stalls.pairs.n++
        stalls.pairs.gainedSum += gained
        if (stalls.pairs.gainedMin === null || gained < stalls.pairs.gainedMin) stalls.pairs.gainedMin = gained
        if (stalls.pairs.gainedMax === null || gained > stalls.pairs.gainedMax) stalls.pairs.gainedMax = gained
        if (gained >= launchDist / 2) stalls.pairs.toTheLipN++
        else stalls.pairs.earlyN++
      }
      continue
    }
    // the escape hatch: a transit-lane-shaped line every parser refused
    if (/^F\d+ \[F\d+\] water: transit/.test(l)) unparsed++
  }
  const sorted = [...targets.values()].sort((a, b) => b.total - a.total)
  return { launches, stalls, targets: sorted, unparsed }
}

// (v0.446.0) THE LAUNCH CADENCE VERDICT - the pinned-seat label's truth
// check, pure and testable. The walls keep the bot at the SAME range across
// its re-arms (face 30's F8: 26 launches, every d=11); the approach reads
// the d's DESCEND (face 32's F19: 32 launches, 46..16 - 65% of the distance
// closed). The cut: closed = (max-min)/max; closed >= 0.5 is the approach,
// below is the walls candidate. Thin evidence reads NULL, never a fake
// verdict: multi-bot targets (whose d's mix two swimmers), short runs
// (< 5 launches - the label's own bar), missing/junk seqs, max < 0. A max
// of 0 (launching AT the land) reads walls - there is no distance left to
// close, the repeats are the anomaly to name.
/**
 * @param {{total?: number, bots?: {}, seqs?: {[bot]: {n: number, min: number, max: number}}}} [t] a census target row
 * @returns {null|{verdict: 'approach'|'walls', closed: number, min: number, max: number}}
 */
export function targetCadence (t) {
  if (!t || typeof t !== 'object') return null
  const bots = Object.keys(t.bots || {})
  if (bots.length !== 1 || (t.total || 0) < 5) return null
  const seq = t.seqs && t.seqs[bots[0]]
  if (!seq || typeof seq !== 'object') return null
  if (!Number.isFinite(seq.min) || !Number.isFinite(seq.max) || seq.min < 0 || seq.max < 0 || seq.max < seq.min) return null
  const spread = seq.max - seq.min
  const closed = seq.max > 0 ? spread / seq.max : 0
  const verdict = closed >= 0.5 ? 'approach' : 'walls'
  return { verdict, closed: Math.round(closed * 100), min: seq.min, max: seq.max }
}

// (v0.783.0) THE SWIM'S OWN SPENDER - the launches' own bot bill. The
// water lane's spender axis: the transit census's own launches.byBot cell
// (zero re-parsing - the v0.779.0 byWhy / v0.780.0 totals / v0.781.0
// byStage cell law), read the way the rescue book's cast read ITS lane.
// The pin's own seat (v0.722.0) prices WHERE a bot keeps aiming (the
// target concentration); no row ever named WHO owns the swim lane itself
// (the byBot split rode raw in the 'top bots' inline). Face 76's own
// answer rode rawest: F4 rode 63 of the face's 63 launches (100.0%) -
// THE WHALE'S OWN LANE - and the lane's owner is the lever input the
// loop ledgers (v0.692.0/v0.698.0/v0.754.0) price per-face behind their
// own 50-launch bar.
// THE BILL LAW: the top bot owns the swim under the strict-majority law
// (topUnits > of - topUnits; a tie owns nothing - the storm-has-no-seat
// precedent); junk never invents a bill (a missing or empty cell, a
// non-finite or non-positive count reads the honest silence). The
// riders (measure-not-owner - the v0.780.0 riders law): the top pair
// prices the concentration the solo law refused to seat, count desc
// then the key's own byte asc; a single-class cell reads the bill or
// nothing, never a solo 'pair'. Decompose wires ONE additive branch
// beside the pin row (one row, never both - the branch law).

/**
 * The launches' own bot bill (strict-majority law) over the census's
 * launches.byBot cell.
 * @param {{}[key: string]: number} [byBot] the transit census's own cell
 * @returns {null|{bot: string, owns: number, of: number, share: number}}
 */
export function transitLaunchBill (byBot) {
  if (!(byBot && typeof byBot === 'object') || Array.isArray(byBot)) return null
  let of = 0
  let topBot = null
  let topUnits = 0
  for (const [bot, n] of Object.entries(byBot)) {
    if (!Number.isFinite(n) || n <= 0) continue
    of += n
    if (n > topUnits) { topUnits = n; topBot = bot }
  }
  if (of <= 0 || topBot === null) return null
  if (topUnits <= of - topUnits) return null
  return { bot: topBot, owns: topUnits, of, share: +(topUnits / of).toFixed(3) }
}

// (v0.783.0) the bill's own row - THE SWIM'S OWN SPENDER: the spender is
// the lever input the loop ledgers price behind their own bars. Junk
// never prints (the honest silence's own row law).
export function transitLaunchBillRow (bill) {
  if (!bill || typeof bill !== 'object') return null
  const { bot, owns, of, share } = bill
  if (typeof bot !== 'string' || !bot || !Number.isFinite(owns) || owns <= 0 ||
      !Number.isFinite(of) || of <= 0 || owns > of || !Number.isFinite(share)) return null
  return `the launches' own bill (v0.783.0): ${bot} owns ${owns} of ${of} launch(es) (${(share * 100).toFixed(1)}%) - THE SWIM'S OWN SPENDER: one bot's own re-arms own the water lane - the pin's own seat (v0.722.0) prices the aim, the bill names the spender`
}

/**
 * The launches' own riders (measure-not-owner) over the same cell.
 * @param {{}[key: string]: number} [byBot] the transit census's own cell
 * @returns {null|{leader: string, leaderOwns: number, runner: string,
 *   runnerOwns: number, of: number, pairOwns: number, share: number,
 *   tie: boolean}}
 */
export function transitLaunchRiders (byBot) {
  if (!(byBot && typeof byBot === 'object') || Array.isArray(byBot)) return null
  const ranked = Object.entries(byBot)
    .map(([bot, n]) => ({ bot, n }))
    .filter(c => Number.isFinite(c.n) && c.n > 0)
    .sort((a, b) => b.n - a.n || (a.bot < b.bot ? -1 : 1))
  if (ranked.length < 2) return null
  const of = ranked.reduce((a, c) => a + c.n, 0)
  const pairOwns = ranked[0].n + ranked[1].n
  return {
    leader: ranked[0].bot, leaderOwns: ranked[0].n,
    runner: ranked[1].bot, runnerOwns: ranked[1].n,
    of, pairOwns, share: +(pairOwns / of).toFixed(3),
    tie: ranked[0].n === ranked[1].n
  }
}

// (v0.783.0) the riders' own row - THE CROWD'S OWN SWIM: a measure of the
// shape, never a named owner (the bill's tie law holds); the pair prices
// the concentration the solo law refused to seat. Junk never prints.
export function transitLaunchRidersRow (r) {
  if (!r || typeof r !== 'object') return null
  const { leader, leaderOwns, runner, runnerOwns, of, pairOwns, share } = r
  if (typeof leader !== 'string' || !leader || typeof runner !== 'string' || !runner ||
      !Number.isFinite(leaderOwns) || leaderOwns <= 0 || !Number.isFinite(runnerOwns) || runnerOwns <= 0 ||
      !Number.isFinite(of) || of <= 0 || !Number.isFinite(pairOwns) || pairOwns > of ||
      !Number.isFinite(share)) return null
  return `the launches' own riders (v0.783.0): no solo spender owns the majority - ${leader} x${leaderOwns} + ${runner} x${runnerOwns} own ${pairOwns} of ${of} launch(es) (${(share * 100).toFixed(1)}%) - THE CROWD'S OWN SWIM: the bill's tie law held, the concentration is still real - the pair prices the re-arms the solo law refused to name`
}
