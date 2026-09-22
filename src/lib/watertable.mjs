// THE WATER TABLE (v0.84.0): the aquifer ceiling memory.
//
// MEASURED (run76, dispatch 35748191786, the v0.81.0+0.82.0 fleet): the
// still-wet rescue treadmill rebounded - rescues=88 with 53 'still wet'
// timeouts, and the underground pages clustered at y=42..48 while the shaft
// floor sits at minY=42 (fleet 114's lesson moved the floor UP from 24 to 42,
// but aquifers exist ABOVE 42 too - lake-fed quarries, flooded ravines).
// F6 and F9 alone owned 19 of the 26 'water hazard ... refusing this column'
// refusals: the SAME region kept feeding the SAME bots into the SAME water,
// one rescue at a time, because nothing remembered the DEPTH of the water.
//
// The hazard ledger (v0.62.0) remembers WHERE a rescue happened (a radius
// around one cell, TTL 120s). It cannot prevent the first flood: the fluid
// guard sidesteps a column that opens into water within 4 blocks below, the
// caller rotates, and the NEXT shaft 24-32 blocks away digs down into the
// SAME aquifer - the lake is regional, the sidestep is local. The durable
// cure is a DEPTH memory: when the fleet finds water at depth y in a region,
// every future shaft in that region STOPS at y + margin and the tunnel doors
// (floor lock / ore detour, v0.81.0) turn the stopped shaft into horizontal
// mining at the dry level - which is where the ore steering lives anyway.
//
// Unlike the hazard ledger there is NO TTL: the world is rebuilt from the
// same seed every fleet run (config/world.json, seed -8201142900731514829),
// so an aquifer found at y=45 in region [1,-2] is TRUE for the whole run and
// the next one. The only bound is the region cap (LRU by last touch).

/** Region cell size (blocks) on the x/z plane. 64 keeps a lake, its feeders
 * and the surrounding quarry in one cell while leaving neighbours free. */
export const WT_REGION = 64
/** Stop this many blocks ABOVE a recorded strike. 4 matches the fluid
 * guard's scan depth: the shaft never digs the block whose below-scan could
 * touch the water. */
export const WT_MARGIN = 4
/** Maximum regions kept. Bounded amnesia, LRU by last touch: the fleet
 * mines onward and the ancient aquifer region behind it may be evicted. */
export const WT_CAP = 64

/**
 * The region key for a world position (pure). Floor-division (>> style)
 * buckets negatives correctly: x=63 -> 0, x=64 -> 1, x=-1 -> -1, x=-64 -> -1,
 * x=-65 -> -2. Junk coordinates return null - the caller skips the record.
 * @param {number} x world x
 * @param {number} z world z
 * @returns {string|null} "rx,rz" or null
 */
export function regionKeyOf (x, z) {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null
  return `${Math.floor(x / WT_REGION)},${Math.floor(z / WT_REGION)}`
}

/**
 * The descent ceiling a recorded strike imposes on THIS shaft (pure).
 * The ceiling is strikeY + margin: digShaft refuses the block whose y is at
 * or below it. A strike AT OR ABOVE the shaft entry is NOT a ceiling - a
 * surface lake (strike 63, entry 64) must never become a lid that forbids
 * all digging; the ceiling only binds when there is real descent left below
 * the entry (floor < entryY - 1). Junk in, no ceiling out.
 * @param {number|null} strikeY the y of the recorded fluid strike
 * @param {number|null} entryY the y the bot stood at when the shaft began
 * @param {{margin?:number}} [opts]
 * @returns {number|null} the lowest allowed dig y boundary (the shaft must
 *   not dig blocks with y <= ceiling), or null when no constraint applies
 */
export function shaftCeiling (strikeY, entryY, { margin = WT_MARGIN } = {}) {
  if (!Number.isFinite(strikeY) || !Number.isFinite(entryY)) return null
  const floor = Math.floor(strikeY) + Math.floor(margin)
  if (floor >= Math.floor(entryY) - 1) return null
  return floor
}

/**
 * The fleet water-table board: one bot's fluid strike immunizes the whole
 * fleet (the HazardLedger wiring - bots live in one process, fleet19 creates
 * one board and hands it to every miner). Per region the HIGHEST strike wins:
 * water above floods down, so the shallowest find is the binding constraint.
 * The pure helpers above stay pure - the board is a thin stateful wrapper,
 * unit-testable without a world.
 */
export class WaterTableBoard {
  constructor ({ margin = WT_MARGIN, cap = WT_CAP } = {}) {
    this.margin = margin
    this.cap = cap
    /** @type {Map<string, {y:number, at:number}>} region key -> strike */
    this.regions = new Map()
  }

  get size () { return this.regions.size }

  /**
   * Record a fluid strike (the y where water/lava was found below a dig).
   * Highest strike per region wins; every record touches the region for the
   * LRU cap. Junk positions are ignored (the bot may vanish mid-read).
   * @param {{x:number,y:number,z:number}|null} [pos] the strike cell
   * @param {number} [now] caller's clock (ms)
   * @returns {number} the number of regions after the write
   */
  record (pos = null, now = Date.now()) {
    if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.y) || !Number.isFinite(pos.z)) return this.size
    const key = regionKeyOf(pos.x, pos.z)
    if (!key) return this.size
    const y = Math.floor(pos.y)
    const prev = this.regions.get(key)
    if (prev) {
      if (y > prev.y) prev.y = y
      prev.at = now
    } else {
      this.regions.set(key, { y, at: now })
    }
    if (this.regions.size > this.cap) {
      let oldest = null
      for (const [k, v] of this.regions) {
        if (!oldest || v.at < this.regions.get(oldest).at) oldest = k
      }
      if (oldest != null) this.regions.delete(oldest)
    }
    return this.size
  }

  /**
   * The recorded strike y for the region containing pos, or null.
   * @param {{x:number,y:number,z:number}|null} [pos]
   * @returns {number|null}
   */
  tableFor (pos = null) {
    if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.z)) return null
    const key = regionKeyOf(pos.x, pos.z)
    if (!key) return null
    const hit = this.regions.get(key)
    return hit ? hit.y : null
  }

  /**
   * The descent ceiling for a shaft standing at pos with entry entryY.
   * Combines tableFor + shaftCeiling; null when this region has no strike
   * or the strike imposes no descent constraint (a lid, not a ceiling).
   * @param {{x:number,y:number,z:number}|null} [pos] the current dig cell
   * @param {number|null} [entryY] the shaft entry y
   * @returns {number|null}
   */
  ceilingFor (pos = null, entryY = null) {
    const strikeY = this.tableFor(pos)
    if (strikeY == null) return null
    return shaftCeiling(strikeY, entryY, { margin: this.margin })
  }
}
