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

const TAG = '^(F\\d+) \\[\\1\\] '

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
 * @param {string[]|string} [lines] the face log
 * @returns {{launches: {n: number, byBot: {}, byLand: {}, dist: {n: number, min: number|null, max: number|null, sum: number}}, stalls: {n: number, byBot: {}, distMax: number|null, passesMax: number|null}, targets: Array<{key: string, x: number, z: number, total: number, bots: {}, land: string}>, unparsed: number}}
 */
export function transitCensus (lines) {
  const rows = Array.isArray(lines)
    ? lines
    : (typeof lines === 'string' ? lines.split('\n') : [])
  const launches = { n: 0, byBot: {}, byLand: {}, dist: { n: 0, min: null, max: null, sum: 0 } }
  const stalls = { n: 0, byBot: {}, distMax: null, passesMax: null }
  const targets = new Map()
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
        t = { key, x: p.x, z: p.z, total: 0, bots: {}, land: p.land }
        targets.set(key, t)
      }
      t.total++
      t.bots[p.bot] = (t.bots[p.bot] || 0) + 1
      continue
    }
    const s = parseTransitStall(l)
    if (s) {
      stalls.n++
      stalls.byBot[s.bot] = (stalls.byBot[s.bot] || 0) + 1
      if (stalls.distMax === null || s.dist > stalls.distMax) stalls.distMax = s.dist
      if (stalls.passesMax === null || s.passes > stalls.passesMax) stalls.passesMax = s.passes
      continue
    }
    // the escape hatch: a transit-lane-shaped line every parser refused
    if (/^F\d+ \[F\d+\] water: transit/.test(l)) unparsed++
  }
  const sorted = [...targets.values()].sort((a, b) => b.total - a.total)
  return { launches, stalls, targets: sorted, unparsed }
}
