// (v0.826.0) THE WATER HAZARD BOARD'S OWN FIELD READ - the memorize line's
// own census. Every water death writes ONE line into the face log: 'water:
// death spot memorized as a hazard at [x,y,z] (N live, fleet-wide)' - the
// emitter (miner.mjs) stamps the record WATER_DEATH_TTL_MS (240s) and prints
// the board's live count after the record. The board's memory drives the
// whole water program (the aquifer gate v0.104.0 reads the same ledger),
// yet the decompose side never read the memorize line back: the board's
// own growth, its own forgetting and its own repeats rode uncounted.
// Face 101 (37752423490) priced the hole live: 29 memorize lines, one spot
// memorized TWICE ([-126,62,390] - F9 died there twice, the fleet walked
// back into a spot the log had already named), the count cell jumping 5->8
// in one step (the board holds records the memorize line never wrote - the
// other record sources live), and four step-downs (the 240s TTL's own work).
// THE LAWS:
// - one parser one truth: the SAME line shape the emitter writes, read
//   back verbatim; the death lines stay the death modules' own evidence
//   (the lens needs no join - each memorize line IS a death marker, the
//   emitter writes it inside the death handler).
// - line order = time order (the whole decompose's own convention): the
//   count cell's trajectory reads the board's own life between writes.
// - the honest claims only: a repeat memorize claims 'the spot was
//   memorized before' (line order), NEVER 'the record was still live' -
//   the 240s TTL may have expired the first record between the lines and
//   the count cell alone cannot say which spot expired.
// - a count step-down of size k names >= k expired records (the board only
//   sheds via TTL); a step-up past +1 names records the memorize line
//   never wrote (one write per line is the emitter's own law).
// Mining-surface only: zero fleet wiring, zero new log lines - the
// v0.379.0 precedent.

// The memorize line's own anatomy (the emitter's own template,
// miner.mjs: `${tag} water: death spot memorized as a hazard at
// [${x},${y},${z}] (${live} live, fleet-wide)`).
export const HAZARD_MEMORIZE_RE = /^F\d+ \[F\d+\] water: death spot memorized as a hazard at \[(-?\d+),(-?\d+),(-?\d+)\] \((\d+) live, fleet-wide\)/

/**
 * One memorize line's own read. Junk in, null out (the v0.818.0 lesson -
 * junk never invents a record): a non-string, a foreign line, a negative
 * count cell all read null.
 * @param {string} [line] one face-log line
 * @returns {null|{bot: string|null, x: number, y: number, z: number, count: number}}
 */
export function parseHazardMemorize (line) {
  if (typeof line !== 'string') return null
  const m = line.match(HAZARD_MEMORIZE_RE)
  if (!m) return null
  const x = Number(m[1])
  const y = Number(m[2])
  const z = Number(m[3])
  const count = Number(m[4])
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null
  if (!Number.isFinite(count) || count < 0) return null
  const bot = (line.match(/^(F\d+)\b/) || [])[1] || null
  return { bot, x, y, z, count }
}

/**
 * The board's own census over a face log (pure; the decompose field read).
 * Accepts an array of lines or a raw text blob (split on newline); anything
 * else reads null (the junk convention - junk judges nothing). A face with
 * zero valid memorize lines reads null - the honest silence (a dry face has
 * no board read to price).
 * @param {string[]|string} [lines] the face log
 * @returns {null|{memorizes: number, distinctSpots: number, repeatSpots: number, repeatMemorizes: number, peakLive: number, finalLive: number, drops: number, dropMass: number, jumps: number}}
 */
export function hazardBoardCensus (lines) {
  const src = Array.isArray(lines)
    ? lines
    : (typeof lines === 'string' ? lines.split('\n') : null)
  if (!src) return null
  const rows = []
  for (const l of src) {
    const p = parseHazardMemorize(l)
    if (p) rows.push(p)
  }
  if (rows.length === 0) return null
  // The spots' own book: one key per coordinate triple, the line order's
  // own repeats counted as they walk.
  const seen = new Map()
  let repeatMemorizes = 0
  for (const r of rows) {
    const k = `${r.x},${r.y},${r.z}`
    if (seen.has(k)) repeatMemorizes++
    else seen.set(k, 0)
    seen.set(k, seen.get(k) + 1)
  }
  let repeatSpots = 0
  for (const n of seen.values()) {
    if (n >= 2) repeatSpots++
  }
  // The count cell's own trajectory: a step-down of size k names >= k
  // expired records (the board only sheds via TTL); a step-up past +1
  // names records the memorize line never wrote (one write per line).
  let peakLive = rows[0].count
  let drops = 0
  let dropMass = 0
  let jumps = 0
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].count > peakLive) peakLive = rows[i].count
    if (i === 0) continue
    const d = rows[i].count - rows[i - 1].count
    if (d < 0) { drops++; dropMass += -d } else if (d > 1) jumps++
  }
  const finalLive = rows[rows.length - 1].count
  return {
    memorizes: rows.length,
    distinctSpots: seen.size,
    repeatSpots,
    repeatMemorizes,
    peakLive,
    finalLive,
    drops,
    dropMass,
    jumps
  }
}

/**
 * The census's own row (the byte-exact verdict line). Guards: a null
 * census, a non-object, a zero-memorize book or any non-finite cell read
 * the honest silence null (the row never invents).
 * @param {null|object} [c] hazardBoardCensus's own read
 * @returns {null|string}
 */
export function hazardBoardCensusRow (c) {
  if (!c || typeof c !== 'object' || Array.isArray(c)) return null
  const cells = [c.memorizes, c.distinctSpots, c.repeatSpots, c.repeatMemorizes, c.peakLive, c.finalLive, c.drops, c.dropMass, c.jumps]
  if (!cells.every((n) => Number.isFinite(n))) return null
  if (c.memorizes <= 0) return null
  const repeatPart = c.repeatSpots > 0
    ? `${c.repeatSpots} spot(s) memorized twice - the water took a death on a spot the board had already memorized`
    : 'every spot took its death once'
  const ttlPart = c.drops > 0
    ? `shrank ${c.drops} time(s) (${c.dropMass}+ record(s) expired - the 240s TTL's own work)`
    : 'never shrank this face'
  const jumpPart = c.jumps > 0
    ? `, outgrew the death-spot writes ${c.jumps} time(s) - the board holds records the memorize line never wrote`
    : ''
  return `the water hazard board's own read (v0.826.0): ${c.memorizes} memorize(s) at ${c.distinctSpots} spot(s), ${repeatPart}; peaked at ${c.peakLive} live, closed at ${c.finalLive}, ${ttlPart}${jumpPart}`
}

// The priced radius (the death ground's own R12 precedent: R4 - footfall
// scale - never clusters on any held face, R24 merges distinct nests; the
// same join law, the memorize lines' own family). The join is the
// deathground square (BOTH axis deltas within R, the edge rides) - one
// distance law across the death lenses, never two.
export const WALKBACK_RADIUS = 12

/**
 * The walk-back seat (v0.827.0) - the board's own coverage read. For each
 * memorize line: does an EARLIER memorize sit within the priced square
 * (both planar axis deltas <= WALKBACK_RADIUS, the deathground join)? A
 * within death is the WALK-BACK: the log had already named this water -
 * the spot-exact board saw the pool one death at a time while the body
 * kept the toll. The honest-claim law holds: 'named' is line order only -
 * whether the earlier record was still live (the 240s TTL) reads nowhere,
 * the count cell cannot say which spot expired. The FIRST memorize is
 * never a walk-back (nothing was named before it) and rides out of the
 * denominator by construction. Junk-safe: the census's own conventions.
 * @param {string[]|string} [lines] the face log
 * @returns {null|{memorizes: number, eligible: number, walkBacks: number, clean: number}}
 */
export function hazardWalkBack (lines) {
  const src = Array.isArray(lines)
    ? lines
    : (typeof lines === 'string' ? lines.split('\n') : null)
  if (!src) return null
  const rows = []
  for (const l of src) {
    const p = parseHazardMemorize(l)
    if (p) rows.push(p)
  }
  if (rows.length === 0) return null
  let eligible = 0
  let walkBacks = 0
  for (let i = 1; i < rows.length; i++) {
    eligible++
    for (let j = 0; j < i; j++) {
      if (Math.abs(rows[j].x - rows[i].x) <= WALKBACK_RADIUS &&
          Math.abs(rows[j].z - rows[i].z) <= WALKBACK_RADIUS) {
        walkBacks++
        break
      }
    }
  }
  return {
    memorizes: rows.length,
    eligible,
    walkBacks,
    clean: eligible - walkBacks
  }
}

/**
 * The walk-back's own row (the byte-exact verdict line). Guards: a null
 * read, a junk object, an empty denominator or any non-finite cell read
 * the honest silence; a walk-back share of zero rides NO row (the gate's
 * own law - a lens that bites nothing stays silent, the census row already
 * carries the board's shape).
 * @param {null|object} [w] hazardWalkBack's own read
 * @returns {null|string}
 */
export function hazardWalkBackRow (w) {
  if (!w || typeof w !== 'object' || Array.isArray(w)) return null
  const cells = [w.memorizes, w.eligible, w.walkBacks, w.clean]
  if (!cells.every((n) => Number.isFinite(n))) return null
  if (w.eligible <= 0) return null
  if (w.walkBacks <= 0) return null
  return `the hazard board's own walk-back (v0.827.0): ${w.walkBacks} of ${w.eligible} death(s) landed within ${WALKBACK_RADIUS} of water an earlier death had already named - the spot-exact board named the water one death at a time and the body kept the toll`
}
