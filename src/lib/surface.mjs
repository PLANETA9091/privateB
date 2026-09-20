// Surface policy (pure, unit-testable - no bot, no server).
//
// WHY THIS EXISTS (fleet run 35485296464, 600s, 19 bots, mined 1770 = 2.95 b/s):
//   banked=0, smelted=0, sand=0, gravel=0 - with 38x 'map trip skipped:
//   sand,gravel unreachable' while the map held sand=110 positions. digShaft
//   puts every bot at the bottom of a 1x1 vertical shaft, and the pathfinder
//   cannot climb out of a hole it did not dig stairs into: every surface goal
//   (the yard's chests, the furnace bay, the map's sand shores) is unreachable,
//   so the entire smelt+bank+trip economy never runs.
//
// THE CURE is the oldest mining trick there is: the PILLAR JUMP. The column
// above the bot is open (the bot dug it), so it leaps, places a block beneath
// itself at the apex, lands on it, and repeats - one level per jump, no
// pathfinder, no stair excavation. When the column above IS blocked (cave
// overhang, tunnel ceiling) the same jump digs through up to a small budget of
// ceiling blocks first; fluids and undiggable blocks stop the climb honestly.
//
// This module pins the POLICY; the mechanics live in miner.mjs (climbOut):
// - where the climb should stop (recorded shaft entry y > sky-lit cell > cap);
// - which inventory item becomes the pillar (stone-family drops, never planks);
// - which wall block is the placement reference and which face vector follows;
// - which ceilings may be dug through on the way up.

// cells scanned above the head when looking for daylight / an open runway
export const SKY_SCAN_MAX = 96
// failed jump-place attempts before the climb gives up (a blocked shaft retries
// at the next level; 4 consecutive failures mean geometry changed under us)
export const PILLAR_FAIL_LIMIT = 4
// ticks from jump start to the place moment (vanilla jump: v0.42 decaying by
// (v-0.08)*0.98 per tick; by tick 5 the feet are only ~0.94 up - the AABB still
// overlaps the vacated cell and the server REJECTS the placement, burning the
// 3 s place timeout on wall after wall: measured 241 s for a 24-level climb in
// fleet 35488918930. By tick 8 the feet clear ~1.15 - safely above the cell.
export const PILLAR_TICKS_TO_APEX = 8
// ticks to wait for the fall back onto the freshly placed block
export const PILLAR_LAND_TICKS = 10
// per-attempt ceiling for one placeBlock call: a rejected placement resolves
// slow in mineflayer (it waits for a block-update event that never comes), and
// the climb tries up to 4 walls per level - 3 s each made every level ~10 s
export const PILLAR_PLACE_TIMEOUT_MS = 1500
// hard wall-clock budget for one climb: a climb that eats minutes starves the
// mining loop that called it (the 241 s climb cost F7 40% of its 600 s run)
export const PILLAR_MAX_MS = 90000
// ceiling blocks the climb may dig through before declaring itself blocked
// (caves put 1-3 stone cells over a tunnel; more than 10 is a solid wall)
export const CEILING_DIG_LIMIT = 10
// hard cap on jump-placed blocks per climb (an 80-level shaft is the deepest
// digShaft can produce from y~63 to the minY 24 floor; the cap keeps a
// runaway loop from burning the whole deadline on one climb)
export const PILLAR_LEVEL_CAP = 80

// Inventory preference for the pillar block: stone-family drops the fleet
// accumulates by the hundreds. Planks/sticks/logs are TOOL material and are
// deliberately absent - a climb must never strip a bot's kit.
export const PILLAR_BLOCKS = [
  'cobblestone', 'cobbled_deepslate', 'andesite', 'diorite', 'granite',
  'tuff', 'dirt', 'netherrack'
]

// blocks the climb never digs through (fastDig would refuse or the drop is
// worthless; lava/water stop the climb because digging under them floods it)
export const UNDIGGABLE = ['bedrock', 'barrier', 'reinforced_deepslate', 'obsidian', 'crying_obsidian']
export const FLUIDS = ['lava', 'water', 'bubble_column']

/**
 * Where should the climb stop?
 * @param {object} p
 * @param {number} [p.feetY] the bot's current feet cell y
 * @param {number|null} [p.targetY] recorded shaft entry y (digShaft stores it in
 *   stats.shaftEntryY) - the most honest "surface" reference there is
 * @param {Function} [p.skyLitAt] dy => true|false|null for "this cell sees full
 *   daylight" (skyLight >= 15); null means the chunk data is unknown
 * @param {number} [p.maxUp] hard cap on levels gained (default PILLAR_LEVEL_CAP)
 * @returns {{ok: boolean, targetY: number, levels: number, source: string}}
 *   levels <= 1 means "already at the surface" - the caller skips the climb.
 */
export function pillarTarget ({ feetY = 0, targetY = null, skyLitAt = null, maxUp = PILLAR_LEVEL_CAP } = {}) {
  const y0 = Number.isFinite(feetY) ? feetY : 0
  const cap = Number.isFinite(maxUp) && maxUp > 0 ? Math.floor(maxUp) : PILLAR_LEVEL_CAP
  // a recorded entry y ABOVE us is the ground we descended from - climb back to it
  if (Number.isFinite(targetY) && targetY > y0) {
    const levels = Math.min(Math.ceil(targetY - y0), cap)
    return { ok: true, targetY: y0 + levels, levels, source: 'entry' }
  }
  // no entry record: daylight is the surface (skyLight 15 exists only above ground)
  if (typeof skyLitAt === 'function') {
    for (let dy = 1; dy <= cap; dy++) {
      let lit
      try { lit = skyLitAt(dy) } catch { lit = null }
      if (lit === true) return { ok: true, targetY: y0 + dy, levels: dy, source: 'skylight' }
      if (lit !== false) break // null: unknown chunk above - fall back to the cap
    }
  }
  return { ok: true, targetY: y0 + cap, levels: cap, source: 'cap' }
}

/**
 * May the climb pass through this ceiling cell?
 * @param {{name?: string, boundingBox?: string}|null|undefined} block a
 *   prismarine Block (only name and boundingBox are consulted)
 * @returns {'free'|'dig'|'stop'} free = air/torch (walk through), dig = solid
 *   and mineable, stop = fluid or undiggable (the climb cannot proceed here)
 *   NOTE: anything without an explicit 'empty' bounding box is stop - unknown
 *   shapes must never be treated as passable
 */
export function climbableCeiling (block) {
  if (!block || typeof block !== 'object') return 'stop'
  const name = typeof block.name === 'string' ? block.name : ''
  if (FLUIDS.includes(name)) return 'stop'
  if (UNDIGGABLE.includes(name)) return 'stop'
  if (block.boundingBox === 'block') return 'dig'
  if (block.boundingBox === 'empty') return 'free' // air, torches, saplings, chains
  return 'stop' // fluid bounding box or unknown shape - not proven free
}

/**
 * Pick the pillar block from an inventory-shaped list, honouring PILLAR_BLOCKS
 * preference order. Junk telemetry (null items, NaN counts) is skipped, never
 * thrown on.
 * @param {Array<{name?: string, count?: number}>|null|undefined} items
 * @returns {{name: string, count: number}|null} the item to equip, or null
 */
export function pickPillarBlock (items) {
  if (!Array.isArray(items)) return null
  for (const name of PILLAR_BLOCKS) {
    const it = items.find(i => i && i.name === name && Number.isFinite(i.count) && i.count > 0)
    if (it) return it
  }
  return null
}

/**
 * Placement reference for a pillar jump: the fresh block goes into the cell the
 * bot's feet occupied before the jump, against one of the four horizontal wall
 * blocks around that cell. The face vector mineflayer expects points FROM the
 * reference block TO the filled cell - i.e. the inverse of the wall offset.
 * @param {Array<{dx: number, dz: number, solid: boolean}>|null|undefined} walls
 *   the four horizontal neighbours of the fill cell, pre-read by the caller
 * @returns {{dx: number, dz: number, face: {x: number, y: number, z: number}}|null}
 *   null when no solid wall surrounds the cell (open platforms cannot pillar)
 */
export function pillarPlacement (walls) {
  if (!Array.isArray(walls)) return null
  const wall = walls.find(w => w && Number.isFinite(w.dx) && Number.isFinite(w.dz) && w.solid === true)
  if (!wall) return null
  // 0 - x (not -x): normalizes -0 to 0 so the face vector survives deepStrictEqual
  return { dx: wall.dx, dz: wall.dz, face: { x: 0 - wall.dx, y: 0, z: 0 - wall.dz } }
}
