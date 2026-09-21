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
// THE CURE: the bot digs itself out. A 45-degree DIG STAIRCASE (clear the two
// step cells diagonally up, step onto them with forward+jump - vanilla movement
// that three fleets of tunnels already proved) costs ~2 digs + 1 jump per level
// and needs NO block placement at all. The first implementation pillar-jumped
// (leap + place a block beneath at the apex); three CI fleets killed it - the
// height poll read a perfectly clear 1.12-1.20 above the fill cell and the
// server STILL rejected every placement (fleet 112 diag: 'no place (height
// 1.17, cleared=true)' x20+). Placement is server-suspect on this stack;
// digging + movement are not. The pillar policy helpers below stay exported
// (PILLAR_BLOCKS, pickPillarBlock, pillarPlacement) for the day placement is
// retried with a different transport; the mechanics in miner.mjs climbOut do
// NOT use them.
//
// This module pins the POLICY:
// - where the climb should stop (recorded shaft entry y > sky-lit cell > cap);
// - which ceilings may be dug through on the way up (fluids/undiggable stop).

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

// ---------------------------------------------------------------------------
// WET ESCAPE (v0.17.0) - the climb's answer to flooded shafts.
//
// MEASURED (fleet 2026-09-20 17:05, 8 bots x 450s, fresh world, master v0.16.2):
//   F7 stuck at y=55 the WHOLE run: 'climb diag: level at y=55 blocked toward
//   0,-1 / 1,0 / 0,1 (dug=0)' x10+ interleaved with 'drowning rescue start
//   (drowning, oxygen 20)' and 'rescue timeout (still wet)'. dug=0 on ALL
//   rotations is the signature of the cells ABOVE THE HEAD refusing (feet+1 /
//   feet+2 do not depend on the rotation d): the bot's own shaft had turned
//   into a water column (dug into an aquifer wall - the water pours down the
//   1x1 well). F5 climbed 16 levels (dug=32) and hit the same wet band at
//   y=56. The rescue cannot help (a down-flowing 1x1 waterfall pushes the bot
//   back down - vanilla swim-up loses to the flow, measured 4x 25s timeouts;
//   no shore inside the 12-block scan of a vertical shaft). The climb cannot
//   help (digging UP under water floods the staircase - the FLUIDS stop is
//   correct). Rotation cannot help (the wet cells are the ceiling above).
//   THE ONLY ESCAPE is horizontal: dig a dry 1x2 gallery sideways out from
//   under the water column, then resume the staircase from there (the gallery
//   roof is dry stone - exactly what the main loop digs).
//
// Budgets (a wet bot must never burn the whole climb): TRAVERSE_MAX_BLOCKS
// caps one gallery, TRAVERSE_MAX_MS hard-caps its wall clock (past this the
// drown sentry must win back the controls), TRAVERSE_MAX_ATTEMPTS caps how
// many galleries one climb may open before giving up honestly.
export const TRAVERSE_MAX_BLOCKS = 12
// 20s: a submerged dig can take ~6-10s (5x vanilla underwater penalty, no
// aqua affinity on any bot) - the window must fit two of them plus the steps
export const TRAVERSE_MAX_MS = 20000
export const TRAVERSE_MAX_ATTEMPTS = 2
// no-motion forward steps before a gallery is declared stalled (the tunnel
// lesson: a blocked lip never unblocks by holding forward)
export const TRAVERSE_STALL_LIMIT = 3
// (v0.29.0) 4 = a full circle of bearings. Every traverseStep refusal is
// BEARING-LOCAL (it reads only the cells along d), so a refusing gallery
// rotates to the next cardinal instead of dying on the first refusal - the
// fleet measured the cycle (F11: 'wet escape: 1 blocks walked (gap)' ->
// staircase rotate -> wet again -> a fresh escape into the SAME gap ->
// 'failed - stalled'), each cycle feeding the rescue loop's 25s 'still wet'
// timeout (68 per 600s fleet). After a full circle of refusals the pocket is
// genuinely sealed - give up honestly.
export const TRAVERSE_ROTATE_LIMIT = 4

// ---------------------------------------------------------------------------
// DEEP CLIMB PERSISTENCE (v0.18.0) - a STAGE LADDER across climbOut calls.
//
// MEASURED (fleet 2026-09-20, 17:05 + verification runs): from the y=42
// aquifer floor a climbOut meets MULTIPLE wet bands on the way up (~20 levels
// to the surface). One call opens at most TRAVERSE_MAX_ATTEMPTS galleries and
// eats PILLAR_FAIL_LIMIT fails - not enough to cross several bands - so deep
// bots ended 'climb out: failed - stalled' REPEATEDLY: every call started
// fresh (fails=0, wetTries=0) in the same wet mess, and the fleet loop
// hammered climbOut on every bank/trip decision, burning the run in a
// climb<->stall cycle (F7 produced ~nothing for 450s).
//
// THE CURE: the climb budget lives on the BOT across calls (bot._climbLedger),
// not inside one call. The ladder:
//   stage 0 - ordinary budgets (4 fails, 2 galleries, caller's bearing);
//   stage 1 - 8 fails, 4 galleries, bearing rotated 90 deg;
//   stage 2 - 12 fails, 6 galleries, bearing rotated 180 deg: one call is a
//             full escape CAMPAIGN (still wall-clock bounded by maxMs);
//   stage 3 = EXHAUSTED - climbOut refuses instantly for
//             CLIMB_EXHAUST_COOLDOWN_MS: the loop stops paying for a wall.
// Movement heals the ladder: a successful climb, levels gained, or an
// external lift (drowning rescue won elsewhere) reset to stage 0. Lateral-
// only escape work (traversed > 0, no level gained) escalates too - more
// galleries next call - but NEVER reaches exhaustion: a bot that still
// walks is not declared hopeless.
export const CLIMB_EXHAUSTED_STAGE = 3
export const CLIMB_EXHAUST_COOLDOWN_MS = 90000
// feetY at least this much above the last call's end = outside help moved us
// (a climb that gains levels reports gained > 0 itself; this catches lifts
// that happened BETWEEN calls)
export const CLIMB_RESCUE_MIN_GAIN = 2
export const CLIMB_STAGE_BUDGETS = [
  { failLimit: PILLAR_FAIL_LIMIT, wetAttempts: TRAVERSE_MAX_ATTEMPTS, rotateBy: 0 },
  { failLimit: PILLAR_FAIL_LIMIT * 2, wetAttempts: TRAVERSE_MAX_ATTEMPTS * 2, rotateBy: 1 },
  { failLimit: PILLAR_FAIL_LIMIT * 3, wetAttempts: TRAVERSE_MAX_ATTEMPTS * 3, rotateBy: 2 }
]

// Plants that only exist INSIDE a water column: digging a cell under them
// breaks the plant and the cell becomes a full water source (a gallery dug
// under kelp floods). Read through prismarine's waterlogged flag as well -
// any waterlogged solid refuses a dig the same way.
export const WET_PLANT_NAMES = ['kelp', 'kelp_plant', 'seagrass', 'tall_seagrass']

/**
 * Is this climb cell WET - i.e. digging or stepping into it releases water?
 * True for free fluids (lava too: a gallery next to lava is a death sentence,
 * same list climbableCeiling stops on), waterlogged solids and water plants.
 * A null/unknown read is NOT wet - the caller refuses it as 'unknown' instead,
 * because a missing chunk must not be dug into blindly.
 * @param {{name?: string, waterlogged?: boolean}|null|undefined} block
 * @returns {boolean}
 */
export function isWetCell (block) {
  if (!block || typeof block !== 'object') return false
  const name = typeof block.name === 'string' ? block.name : ''
  if (FLUIDS.includes(name)) return true
  if (WET_PLANT_NAMES.includes(name)) return true
  return block.waterlogged === true
}

/**
 * Plan one horizontal escape step of the wet-escape gallery.
 *
 * The bot stands in the flooded shaft at `feet` and digs toward `d` (a pure
 * cardinal, same vocabulary as the staircase). Three cells decide the step:
 *   feet-level ahead  (d.x, 0, d.z) - the cell the body will occupy
 *   head-level ahead  (d.x, 1, d.z) - the cell the head will occupy
 *   above the head    (d.x, 2, d.z) - WATERFALL GUARD: a fluid there pours
 *                                     into the gallery the moment the head
 *                                     cell is dug
 * Plus the floor ahead (d.x, -1, d.z) - GAP GUARD: stepping onto air drops
 * the bot out of its level (a flooded well has a stone floor; a cave gap is
 * not an escape, it is a new trap).
 *
 * @param {object} p
 * @param {Vec3-like} p.feet the floored feet cell the bot stands in
 * @param {{x: number, z: number}} p.d cardinal direction to dig toward
 * @param {Function} p.read (cell) => prismarine Block | null (bot.blockAt)
 * @returns {{ok: true, digs: Array<{name: string}>}|{ok: false, reason: 'wet'|'hard'|'unknown'|'gap'}}
 *   digs lists the solid cells to fastDig (feet first, head second - the
 *   tunnel order); an open passage returns ok with digs: [] and the bot just
 *   walks the step.
 */
export function traverseStep ({ feet, d, read } = {}) {
  if (!feet || !d || typeof read !== 'function') return { ok: false, reason: 'unknown' }
  if (!(Number.isFinite(d.x) && Number.isFinite(d.z) && (d.x !== 0 || d.z !== 0))) {
    return { ok: false, reason: 'unknown' }
  }
  const tryRead = (dx, dy, dz) => {
    try { return read(feet.offset(dx, dy, dz)) } catch { return null }
  }
  // GAP GUARD first: the floor the step lands on must be solid. A null floor
  // is an UNLOADED CHUNK (unknown, not a gap) and a wet floor is water to
  // land in - each gets its own honest reason.
  const floor = tryRead(d.x, -1, d.z)
  if (!floor) return { ok: false, reason: 'unknown' }
  if (isWetCell(floor)) return { ok: false, reason: 'wet' }
  if (floor.boundingBox !== 'block') return { ok: false, reason: 'gap' }
  const digs = []
  for (const [dx, dy, dz] of [[d.x, 0, d.z], [d.x, 1, d.z], [d.x, 2, d.z]]) {
    const b = tryRead(dx, dy, dz)
    const isOver = dy === 2
    if (isOver) {
      // waterfall guard: fluid above the head cell pours in when it is dug
      if (isWetCell(b)) {
        // (v0.24.0) SURFACE POOL ALLOWANCE - measured on the 04:05 diag probe:
        // a shaft-mouth pour runs down the column and POOLS on the terrain -
        // 'dy=2:water' over DRY dirt on every gallery direction while the wall
        // itself is dry. A single water cell with a DRY cell above it is that
        // finite surface film: digging the gallery under it wades at worst one
        // level and the film drains behind the bot - stalling in the well is
        // strictly worse. Everything else keeps the v0.17.0 refusal: a water
        // COLUMN (water above water - an aquifer layer keeps feeding), an
        // unknown read above (never dig blindly), lava (wading it is death),
        // water plants (breaking the cell under them turns them into sources)
        // and waterlogged solids (digging releases the water).
        const above = tryRead(dx, 3, dz)
        if (!(b.name === 'water' && above && !isWetCell(above))) {
          return { ok: false, reason: 'wet' }
        }
      }
      continue
    }
    const verdict = climbableCeiling(b)
    if (verdict === 'free') continue // open passage - walk it, dig nothing
    if (verdict === 'dig') {
      // a waterlogged solid reads as an ordinary 'dig' by name/box - but
      // digging it RELEASES the water into the gallery, so it is wet
      if (isWetCell(b)) return { ok: false, reason: 'wet' }
      digs.push(b)
      continue
    }
    // 'stop': classify WHY - wet cells allow the traverse to keep going in
    // another direction, hard cells (bedrock) or unknown reads do not
    if (!b) return { ok: false, reason: 'unknown' }
    return { ok: false, reason: isWetCell(b) ? 'wet' : 'hard' }
  }
  return { ok: true, digs }
}

/**
 * Entry decision for one climbOut call against the bot's persisted ledger
 * (v0.18.0 deep climb persistence). Pure - the caller stores the ledger.
 *
 * @param {{stage?: number, feetY?: number, at?: number}|null|undefined} ledger
 *   the ledger left by the PREVIOUS climbOut call (null on a fresh bot)
 * @param {object} [p]
 * @param {number} [p.now] wall clock (ms epoch)
 * @param {number|null} [p.feetY] the bot's current feet cell y
 * @param {boolean} [p.force] end-of-run escape hatch (v0.21.0): a mid-cooldown
 *   exhausted ladder is granted ONE stage-1 attempt instead of the refusal.
 *   Only the fleet's final bank may pass this - mid-run the cooldown exists
 *   precisely to stop the loop paying for a proven wall.
 * @returns {{refused: false, stage: number, failLimit: number, wetAttempts: number, rotateBy: number, forced?: boolean}|{refused: true, waitMs: number}}
 *   refused + waitMs: the ladder is exhausted and the cooldown is running -
 *   the caller must return immediately WITHOUT touching the ledger (a
 *   refusal that restarted the cooldown would keep a hammered bot exhausted
 *   forever).
 */
export function climbEntry (ledger, { now = Date.now(), feetY = null, force = false } = {}) {
  const stage = ledger && typeof ledger === 'object' && Number.isFinite(ledger.stage)
    ? ledger.stage
    : 0
  if (stage < CLIMB_EXHAUSTED_STAGE) {
    const b = CLIMB_STAGE_BUDGETS[stage] || CLIMB_STAGE_BUDGETS[0]
    return { refused: false, failLimit: b.failLimit, wetAttempts: b.wetAttempts, rotateBy: b.rotateBy, stage }
  }
  // exhausted: an outside lift since the last call resets the ladder even
  // mid-cooldown (the old wall is not this wall), else the cooldown must elapse
  const lifted = Number.isFinite(feetY) && Number.isFinite(ledger.feetY) &&
    feetY >= ledger.feetY + CLIMB_RESCUE_MIN_GAIN
  if (lifted) return { refused: false, failLimit: CLIMB_STAGE_BUDGETS[0].failLimit, wetAttempts: CLIMB_STAGE_BUDGETS[0].wetAttempts, rotateBy: CLIMB_STAGE_BUDGETS[0].rotateBy, stage: 0 }
  const elapsed = now - (Number.isFinite(ledger.at) ? ledger.at : 0)
  if (elapsed < CLIMB_EXHAUST_COOLDOWN_MS) {
    // (v0.21.0) force: the final bank cannot accept a refusal - the yard walk
    // would start at the shaft bottom, which is the failure it must prevent.
    // ONE stage-1 attempt (the same budget the cooldown-served path grants);
    // the ledger stays untouched, exactly like a refusal.
    if (force) {
      const b = CLIMB_STAGE_BUDGETS[1]
      return { refused: false, forced: true, failLimit: b.failLimit, wetAttempts: b.wetAttempts, rotateBy: b.rotateBy, stage: 1 }
    }
    return { refused: true, waitMs: CLIMB_EXHAUST_COOLDOWN_MS - elapsed }
  }
  // cooldown served: ONE escalated retry from a rotated bearing (stage 1) -
  // not the full ladder, the bot already proved this geometry is hostile
  const b = CLIMB_STAGE_BUDGETS[1]
  return { refused: false, failLimit: b.failLimit, wetAttempts: b.wetAttempts, rotateBy: b.rotateBy, stage: 1 }
}

/**
 * Ledger update after a climbOut call ended (v0.18.0). Pure - returns the
 * NEXT ledger; the caller stores it on the bot.
 *
 * Movement heals, persistence escalates:
 *   ok / gained > 0 / lifted >= CLIMB_RESCUE_MIN_GAIN since the previous
 *   call's end  -> stage 0 (fresh budgets next call);
 *   lateral-only work (traversed > 0, no levels) -> stage + 1, CAPPED at
 *   CLIMB_EXHAUSTED_STAGE - 1 (a bot that still walks is never 'exhausted');
 *   dead stall   -> stage + 1, topping out at CLIMB_EXHAUSTED_STAGE.
 *
 * @param {{stage?: number, feetY?: number, at?: number}|null|undefined} ledger
 * @param {object} o
 * @param {boolean} [o.ok] the climb reached its target
 * @param {number} [o.gained] levels gained by THIS call
 * @param {number} [o.traversed] horizontal escape blocks walked by THIS call
 * @param {number|null} [o.feetY] feet cell y at the call's end
 * @param {number} [o.now] wall clock (ms epoch)
 * @returns {{stage: number, feetY: number|null, at: number}}
 */
export function climbLedgerUpdate (ledger, { ok = false, gained = 0, traversed = 0, feetY = null, now = Date.now() } = {}) {
  const prevY = ledger && typeof ledger === 'object' && Number.isFinite(ledger.feetY) ? ledger.feetY : null
  const ledStage = ledger && typeof ledger === 'object' && Number.isFinite(ledger.stage) ? ledger.stage : 0
  const y = Number.isFinite(feetY) ? feetY : prevY
  const at = Number.isFinite(now) ? now : 0
  const g = Number.isFinite(gained) ? gained : 0
  const tr = Number.isFinite(traversed) ? traversed : 0
  // healed: the climb worked, moved us up, or outside help did
  if (ok || g > 0 || (prevY !== null && y !== null && y >= prevY + CLIMB_RESCUE_MIN_GAIN)) {
    return { stage: 0, feetY: y, at }
  }
  if (tr > 0) {
    // lateral escape work is real progress sideways: escalate for a bigger
    // campaign next call, but never declare a moving bot hopeless
    return { stage: Math.min(ledStage + 1, CLIMB_EXHAUSTED_STAGE - 1), feetY: y, at }
  }
  return { stage: Math.min(ledStage + 1, CLIMB_EXHAUSTED_STAGE), feetY: y, at }
}

/**
 * Did this climbOut call actually ATTEMPT anything? (v0.21.0) Pure.
 *
 * A never-tried stop - shouldStop already fired when the call entered, so the
 * main loop never ran once - must NOT touch the ledger: an ok=false gained=0
 * update counts as a dead stall and would escalate the ladder for a wall the
 * bot never saw (the hammered-refusal class the v0.18.0 contract forbids).
 * The miner passes its live counters; any nonzero counter means the climb
 * really started (a step placed, a block dug, a fail burned, a gallery opened
 * or walked).
 *
 * @param {object} [c]
 * @param {number} [c.steps] pillar steps placed
 * @param {number} [c.dug] blocks dug
 * @param {number} [c.fails] failed step attempts
 * @param {number} [c.traversed] horizontal escape blocks walked
 * @param {number} [c.wetTries] wet-escape galleries opened
 * @returns {boolean} true when the climb made at least one attempt
 */
export function climbStarted (c) {
  const o = c && typeof c === 'object' ? c : {} // junk-tolerant, like climbEntry
  const n = x => (Number.isFinite(x) && x > 0 ? x : 0)
  return Boolean(n(o.steps) || n(o.dug) || n(o.fails) || n(o.traversed) || n(o.wetTries))
}

// (v0.23.0) WALKABLE SURFACE - the F2/F5 measured waste (fleet on 3e21d58):
// 'F2 climb diag: level at y=63 did not rise (dug=60) feet=air support=grass_block
// step=air head=air' - the bot was ALREADY on the biome surface, but the entry-based
// pillarTarget demanded the stale shaft-entry level from possibly miles away, so the
// staircase kept rotating on flat grass, burned its whole fail budget and reported
// 'stalled' - the chest walk then started from a bot the climb refused to call out.
//
// The rule: full daylight at the feet cell (skyLight 15, which an UNDERGROUND cell
// can never have - a cave stays dark, so caves keep climbing) plus at least TWO
// walkable directions (a free cell at feet+1 with a solid floor at feet level).
// - 1x1 open shaft: sky-lit (skyLight falls straight down an air column) but 0
//   walkable dirs (walls all around) -> NOT a surface, the climb continues.
// - 2x2 open shaft: exactly 1 walkable dir (the second shaft column) -> continues.
// - tunnel/gallery: 0 walkable dirs at feet level -> continues.
// - open surface, including a bot standing in a 1-block hole with a grass rim
//   (F2's exact end state): 2-4 walkable dirs -> the staircase hands the bot to
//   the chest walk, whose pathfinder steps the rim trivially.
// Pure - the bot reads the cells, this function only decides.
//
// @param {object} p
// @param {boolean} [p.skyLit] true when the feet cell sees skyLight >= 15
// @param {Function} [p.probes] (dx, dz) => { free, solid } for the horizontal
//   neighbour: free = the cell at feet+1 has an empty bounding box (walkable
//   air), solid = the cell at feet level is a solid floor to walk on
// @param {number} [p.minDirs] walkable directions required (default 2)
// @returns {boolean} true = the bot stands on a walkable surface, stop climbing
export function isWalkableSurface (p) {
  const o = p && typeof p === 'object' ? p : {} // junk-tolerant, like climbEntry
  const skyLit = o.skyLit === true
  const probes = typeof o.probes === 'function' ? o.probes : null
  const minDirs = Number.isFinite(o.minDirs) && o.minDirs >= 1 ? Math.floor(o.minDirs) : 2
  if (!skyLit || !probes) return false
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]]
  let open = 0
  for (const [dx, dz] of dirs) {
    let c = null
    try { c = probes(dx, dz) } catch { c = null }
    if (c && c.free === true && c.solid === true) open++
    if (open >= minDirs) return true
  }
  return false
}

export const RISE_ASSIST_TIMEOUT_MS = 4500
export const RISE_LONGHOLD_TICKS = 32

// (v0.27.0) RISE RECOVERY - the decision after two failed raw stepUps on
// geometry the dig pass just verified clean (the fleet's 'did not rise
// (dug=0)' class: F13 dry 'feet=air support=stone step=air head=air', F17
// in-river 'feet=water support=andesite step=air'). The 24-tick same-bearing
// retry is a PROVEN dead end (v0.19.1: momentum is not the cause) and a
// rotation re-digs 2+ cells per wall - the expensive path. The repro probe
// (Task 16, sky nook, clean 1-block step) confirmed the raw mechanic fails
// ~half the pressed-jump trials: standing flush against the step face, the
// collision zeroes horizontal velocity into the wall while the jump arc needs
// it - the bot bonks the lip and slides back. The cure is variant-specific:
// DRY - hand the single step to the pathfinder ONCE (a real jump-edge
// computation: it backs off and takes the arc with speed, bounded by the
// goto timeout); WET - pathfinding inside water is flaky and an off-goal move
// loses the bearing, so one LONGER jump hold keeps swim momentum while the
// eyes clear the bank lip instead.
//
// @param {object} p
// @param {boolean} [p.feetWater] the feet cell is a fluid/wet plant (F17 variant)
// @param {Vec3-like|null} [p.stepTop] the step landing cell (feet + d, y+1);
//   null/absent means no target worth a bounded wait - rotate as before
// @returns {{kind: 'assist'|'longHold'|'rotate', stepTop?: Vec3-like,
//            timeoutMs?: number, holdTicks?: number}}
export function riseRecoveryPlan ({ feetWater = false, stepTop = null } = {}) {
  if (!stepTop || typeof stepTop.offset !== 'function') return { kind: 'rotate' }
  if (feetWater) return { kind: 'longHold', stepTop, holdTicks: RISE_LONGHOLD_TICKS }
  return { kind: 'assist', stepTop, timeoutMs: RISE_ASSIST_TIMEOUT_MS }
}

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

// ---------------------------------------------------------------------------
// GRAVITY STEP PLANNING (v0.25.0) - the climb's answer to sand/gravel columns.
//
// MEASURED (fleet 35538062596, master 9afe4f5, 19 bots x 600s): 10+ bots died
// at the final bank with 'climb out (bank): failed - stalled' and the diag
// signature 'did not rise (dug=1..3) feet=air support=gravel step=gravel
// head=air' clustered at y=42-43 (river/ocean-beach columns). The staircase
// dug each step ONCE, bottom-up: digging the LOWER cell of a sand/gravel
// column makes the UPPER cell sink into it, so the just-cleared step cell was
// occupied again by the time the bot tried to step onto it. Every retry dug
// one more block, the column sank one more, and the fail budget burned while
// the bot stood still - 'stalled' at the bank, pockets full, banked=0.
//
// THE CURE is the miner's textbook rule: RE-SCAN and RE-DIG. Gravity only
// refills cells from above; a finite column (beach bands run 2-4 blocks) is
// exhausted by repeated passes, each pass eating its top off. The scan runs
// TOP-DOWN so a sunk block always lands in a cell the NEXT pass will re-plan
// - never out of a cell already cleared this pass.
//
// Pure policy, simulated in CI with an instant-settle gravity model: a 10-block
// column clears within STEP_MAX_PASSES passes, and ONE pass provably leaves a
// sunk block standing (the measured bug, pinned so it cannot return silently).
export const STEP_MAX_PASSES = 6

/**
 * Plan ONE digging pass of a climb step.
 *
 * Four cells decide the diagonal step-up: the two above the head (feet+1,
 * feet+2) and the two above the landing cell (step+1 = feet+d at y+1,
 * step+2 = feet+d at y+2). The landing cell itself (feet+d at feet level) is
 * NOT scanned: it is the floor the bot lands on and must stay solid.
 *
 * @param {object} p
 * @param {Vec3-like} p.feet the floored feet cell the bot stands in (needs .offset)
 * @param {{x: number, z: number}} p.d cardinal direction of the step
 * @param {Function} p.read (cell) => prismarine Block | null (bot.blockAt)
 * @param {number} [p.dug] blocks already dug this climb (for the global budget)
 * @param {number} [p.maxDug] global dig budget (default PILLAR_LEVEL_CAP * 2)
 * @returns {{ok: true, digs: Array<{cell: object, block: object}>, blocked: false}
 *           |{ok: false, digs: Array, blocked: true, blockedWet: boolean, reason: string}}
 *   digs lists the solid cells to fastDig THIS pass, top-down (head+2, head+1,
 *   step+2, step+1); an already-clear step returns ok with digs: []. blocked
 *   means a fluid/undiggable/unknown cell (or the budget) refuses the step -
 *   blockedWet mirrors the old wet flag for the caller's wet-escape policy.
 */
export function stepDigPlan ({ feet, d, read, dug = 0, maxDug = PILLAR_LEVEL_CAP * 2 } = {}) {
  const empty = { ok: false, digs: [], blocked: true, blockedWet: false, reason: 'unknown' }
  if (!feet || !d || typeof read !== 'function' || typeof feet.offset !== 'function') return empty
  if (!(Number.isFinite(d.x) && Number.isFinite(d.z) && (d.x !== 0 || d.z !== 0))) return empty
  const tryRead = (dx, dy, dz) => {
    try { return read(feet.offset(dx, dy, dz)) } catch { return null }
  }
  const digs = []
  // top-down: gravity sinks INTO cells the next pass re-plans, never out of
  // a cell this pass already cleared
  for (const [dx, dy, dz] of [[0, 2, 0], [0, 1, 0], [d.x, 2, d.z], [d.x, 1, d.z]]) {
    const b = tryRead(dx, dy, dz)
    const verdict = climbableCeiling(b)
    if (verdict === 'free') continue
    if (verdict !== 'dig' || dug + digs.length >= maxDug) {
      return { ok: false, digs, blocked: true, blockedWet: isWetCell(b), reason: verdict === 'dig' ? 'dig budget' : 'stop' }
    }
    digs.push({ cell: feet.offset(dx, dy, dz), block: b })
  }
  return { ok: true, digs, blocked: false, blockedWet: false }
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
