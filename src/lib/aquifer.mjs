/**
 * aquifer.mjs - (v0.832.0) THE AQUIFER'S OWN BOOK - the water table program's
 * own field instrument, the mining-surface sibling of the waterhazard lenses
 * (the v0.830.0 refusal read priced the veto's voice; NOTHING ever read the
 * aquifer board's own two voices back).
 *
 * THE EMITTERS (miner.mjs digShaft, one per book, read back verbatim):
 *   1. the strike (the board's WRITE side, v0.84.0): the fluid guard finds
 *      water/lava below the column, records the region and sidesteps -
 *      `F2 [F2] digShaft: water strike at y=50 -> water table (regions 1);
 *      fluid below (-117, 51, 398) - moving sideways` (the position is the
 *      Vec3's own parens-and-spaces form).
 *   2. the lid (the board's READ side, v0.84.0): a regional strike binds
 *      every later descent - the shaft stops above the aquifer and the
 *      tunnel owns the level -
 *      `F9 [F9] digShaft: water table y=49 (region strike) - stopping above
 *      the aquifer, the tunnel owns this level (regions 2)`.
 *   3. the give-up (the carousel's terminal, CI 35491904900): the fluid/drop
 *      sidestep loop burned its SIDESTEP_CAP 6 with no dig between -
 *      `F2 [F2] digShaft: giving up this shaft (6 fluid/drop sidesteps, no
 *      dig between) - the caller rotates`.
 *   4. the give-up (geology's terminal): the undiggable floor's own form -
 *      `F2 [F2] digShaft: giving up this shaft (3 sidesteps, undiggable
 *      floor) - the caller rotates`.
 *
 * THE TREND LAW (the v0.830.0 tier law's own house rule): the lens prices
 * the book per face and claims NO cause. The strike/lid ratio's own arc is
 * the board's maturity trend read across faces (face 104 pre-cure: 44
 * strikes, 0 lids; face 105: 21 strikes, 44 lids - the lid took the strike
 * carousel's work as the regions filled) - one face's shape alone names
 * nothing. The cure's verdict rides the trend beside the refusal lens.
 *
 * THE HONEST-CLAIM LAW: `peakRegions` is the max of the emitters' OWN
 * printed region counters (their live readback at print time) - never a
 * claim about the board's final size (the records live 120s and the log
 * never prints a final census). `maxConsec` is the max give-up counter
 * (the cap is 6) - a give-up line is the carousel's terminal verdict, not
 * a hang (the caller rotates).
 *
 * Junk-safe per the census law (junk in, null out; the v0.818.0 lesson):
 * a non-string line, a foreign head, a negative or non-finite cell all
 * read null and never break the fold. Pure: reads, never mutates.
 * Zero fleet wiring, zero new log lines - mining-surface only (the
 * v0.379.0 precedent).
 */

// The strike line (the board's write side). The name cell is the fluid's
// own (water | lava - the fluid guard's two strikes); y is the strike's
// level; regions is the emitter's live board readback; the position is the
// Vec3's parens form. Start-anchored per the deathsweep family law: a
// suffix never breaks the anatomy, a foreign head does.
export const AQUIFER_STRIKE_RE = /^F\d+ \[F\d+\] digShaft: (\w+) strike at y=(-?\d+) -> water table \(regions (\d+)\); fluid below \((-?\d+), (-?\d+), (-?\d+)\) - moving sideways$/

// The lid line (the board's read side): the regional ceiling the shaft
// stops above, with the emitter's live regions readback.
export const AQUIFER_LID_RE = /^F\d+ \[F\d+\] digShaft: water table y=(-?\d+) \(region strike\) - stopping above the aquifer, the tunnel owns this level \(regions (\d+)\)$/

// The give-up lines (the carousel's two terminals). One regex owns both
// forms - the count cell is shared, the cause clause names the book.
export const AQUIFER_GIVEUP_RE = /^F\d+ \[F\d+\] digShaft: giving up this shaft \((?:(\d+) fluid\/drop sidesteps, no dig between|(\d+) sidesteps, undiggable floor)\) - the caller rotates$/

/**
 * One strike line's own read. Junk in, null out.
 * @param {string} [line] one face-log line
 * @returns {null|{name: string, y: number, regions: number, pos: {x:number,y:number,z:number}}}
 */
export function parseAquiferStrike (line) {
  if (typeof line !== 'string') return null
  const m = line.match(AQUIFER_STRIKE_RE)
  if (!m) return null
  const name = m[1]
  const y = Number(m[2])
  const regions = Number(m[3])
  const pos = { x: Number(m[4]), y: Number(m[5]), z: Number(m[6]) }
  if (!name) return null
  if (!Number.isFinite(y) || !Number.isFinite(regions) || regions < 0) return null
  if (![pos.x, pos.y, pos.z].every(Number.isFinite)) return null
  return { name, y, regions, pos }
}

/**
 * One lid line's own read. Junk in, null out.
 * @param {string} [line] one face-log line
 * @returns {null|{y: number, regions: number}}
 */
export function parseAquiferLid (line) {
  if (typeof line !== 'string') return null
  const m = line.match(AQUIFER_LID_RE)
  if (!m) return null
  const y = Number(m[1])
  const regions = Number(m[2])
  if (!Number.isFinite(y) || !Number.isFinite(regions) || regions < 0) return null
  return { y, regions }
}

/**
 * One give-up line's own read. The cause clause names the book:
 * 'fluidDrop' (the fluid/drop carousel, cap 6) or 'floor' (the undiggable
 * floor). Junk in, null out.
 * @param {string} [line] one face-log line
 * @returns {null|{cause: 'fluidDrop'|'floor', count: number}}
 */
export function parseAquiferGiveup (line) {
  if (typeof line !== 'string') return null
  const m = line.match(AQUIFER_GIVEUP_RE)
  if (!m) return null
  const fluidDrop = m[1] != null ? Number(m[1]) : null
  const floor = m[2] != null ? Number(m[2]) : null
  if (fluidDrop != null) {
    if (!Number.isFinite(fluidDrop) || fluidDrop < 0) return null
    return { cause: 'fluidDrop', count: fluidDrop }
  }
  if (!Number.isFinite(floor) || floor < 0) return null
  return { cause: 'floor', count: floor }
}

/**
 * The aquifer's own census over a face log (pure; the decompose field
 * read). Accepts an array of lines or a raw text blob (split on newline);
 * anything else reads null. A face with zero strikes AND zero lids AND
 * zero give-ups reads null - the honest silence (a face the aquifer
 * program never spoke on has no book to price). peakRegions is the max
 * regions cell across strikes AND lids (the emitters' own readback); 0
 * when nothing printed a counter. maxConsec is the max give-up counter.
 * @param {string[]|string} [lines] the face log
 * @returns {null|{strikes: number, waterStrikes: number, lavaStrikes: number, lids: number, peakRegions: number, giveups: number, giveupsCarousel: number, giveupsFloor: number, maxConsec: number}}
 */
export function aquiferCensus (lines) {
  const src = Array.isArray(lines)
    ? lines
    : (typeof lines === 'string' ? lines.split('\n') : null)
  if (!src) return null
  let strikes = 0
  let waterStrikes = 0
  let lavaStrikes = 0
  let lids = 0
  let peakRegions = 0
  let giveups = 0
  let giveupsCarousel = 0
  let giveupsFloor = 0
  let maxConsec = 0
  for (const l of src) {
    const s = parseAquiferStrike(l)
    if (s) {
      strikes++
      if (s.name === 'water') waterStrikes++
      else if (s.name === 'lava') lavaStrikes++
      if (s.regions > peakRegions) peakRegions = s.regions
      continue
    }
    const lid = parseAquiferLid(l)
    if (lid) {
      lids++
      if (lid.regions > peakRegions) peakRegions = lid.regions
      continue
    }
    const g = parseAquiferGiveup(l)
    if (g) {
      giveups++
      if (g.cause === 'fluidDrop') giveupsCarousel++
      else giveupsFloor++
      if (g.count > maxConsec) maxConsec = g.count
    }
  }
  if (strikes === 0 && lids === 0 && giveups === 0) return null
  return { strikes, waterStrikes, lavaStrikes, lids, peakRegions, giveups, giveupsCarousel, giveupsFloor, maxConsec }
}

/**
 * The aquifer's own row (the byte-exact verdict line). Guards: a null
 * census, a non-object or any non-finite cell read the honest silence
 * null (the row never invents). The row prices the book and names NO
 * cause (the trend law): the strike/lid arc reads across faces, one
 * face's shape alone names nothing.
 * @param {null|object} [c] aquiferCensus's own read
 * @returns {null|string}
 */
export function aquiferCensusRow (c) {
  if (!c || typeof c !== 'object' || Array.isArray(c)) return null
  const cells = [c.strikes, c.waterStrikes, c.lavaStrikes, c.lids, c.peakRegions, c.giveups, c.giveupsCarousel, c.giveupsFloor, c.maxConsec]
  if (!cells.every((n) => Number.isFinite(n))) return null
  if (c.strikes <= 0 && c.lids <= 0 && c.giveups <= 0) return null
  return `the aquifer's own book (v0.832.0): ${c.strikes} strike(s) (${c.waterStrikes} water, ${c.lavaStrikes} lava) wrote the board, ${c.lids} lid(s) stopped above it, the board peaked at ${c.peakRegions} region(s), ${c.giveups} give-up(s) (${c.giveupsCarousel} carousel, ${c.giveupsFloor} floor)`
}
