// Surface policy (pure, unit-testable - no bot, no server).
//
// (v0.242.0) THE FLUID NAME LAW's second eye lives here: isWaterName is the
// drowning law's canonical water family, SHAFT_FLUID_NAMES carries the shaft's
// lava family - the tunnel first-cut refuses BOTH (water drowns the gallery,
// lava ends it). drowning.mjs imports nothing from this file, so the edge is
// acyclic.
import { isWaterName, SHAFT_FLUID_NAMES, oxygenInDomain } from './drowning.mjs'

/** The tunnel's fluid-family predicate: the water family (kelp/seagrass/bubble
 * column included - the dig list cannot chew them and the step-in drowns) plus
 * the shaft lava family (flowing or source, the gallery ends there). */
export const tunnelFluidName = n => isWaterName(n) || SHAFT_FLUID_NAMES.has(n)
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
// (v0.159.0) THE WET-BAND LADDER. Run15 (36063283715, the v0.157.0/v0.158.0
// fleet) decoded the final-bank killer precisely: the staircases WORK (F13
// dug=48, +24 levels from y=41) and then stall IN THE SURFACE WATER BAND
// (y=59-67): the step cells read water ('stop'), the wet-escape gallery
// walks 2-5 blocks of proven dry stone under the lake bed, the staircase
// re-judges into the NEXT water column, and the legacy accounting spends the
// stage ladder's wetAttempts (2) on ESCAPES THAT MOVED THE BOT - real
// progress, counted as walls. 12/19 final banks died 'still underground
// after 2 climb attempts' with dug=24-48 on the clock. The cure splits the
// two escape classes: an escape that WALKED (moved the bot out of the trap
// it was in) no longer consumes the sealed-pocket budget - only a walked=0
// escape (a genuinely sealed pocket) does. The walked class gets its own
// hard ceiling so a pathological wet maze still ends the climb honestly
// (the maxMs + failLimit fences never moved).
export const WET_ESCAPE_WALK_CEILING = 4

/**
 * Should the climb open another wet-escape gallery? The union gate (pure,
 * junk-tolerant): a sealed-class attempt has room while wetTries < attempts
 * (the stage ladder's shape, byte for byte), a walked-class attempt has room
 * while wetWalks < ceiling. The caller classifies the escape AFTER it runs
 * (wetEscapeAccount) - the gate only decides whether one more may start.
 * @param {object} [p]
 * @param {number} [p.wetTries] sealed escapes spent so far (default 0)
 * @param {number} [p.wetAttempts] the stage ladder's sealed budget (default TRAVERSE_MAX_ATTEMPTS)
 * @param {number} [p.wetWalks] walked escapes spent so far (default 0)
 * @param {number} [p.ceiling] walked-class cap (default WET_ESCAPE_WALK_CEILING)
 * @returns {{escape: boolean, why: string}}
 */
export function wetEscapeGate ({
  wetTries = 0,
  wetAttempts = TRAVERSE_MAX_ATTEMPTS,
  wetWalks = 0,
  ceiling = WET_ESCAPE_WALK_CEILING
} = {}) {
  const tries = Number.isFinite(wetTries) && wetTries >= 0 ? Math.floor(wetTries) : 0
  const walks = Number.isFinite(wetWalks) && wetWalks >= 0 ? Math.floor(wetWalks) : 0
  const att = Number.isFinite(wetAttempts) && wetAttempts > 0 ? Math.floor(wetAttempts) : TRAVERSE_MAX_ATTEMPTS
  const cap = Number.isFinite(ceiling) && ceiling > 0 ? Math.floor(ceiling) : WET_ESCAPE_WALK_CEILING
  if (tries < att) return { escape: true, why: `sealed-escape room (${tries}/${att})` }
  if (walks < cap) return { escape: true, why: `walked-escape room (${walks}/${cap})` }
  return { escape: false, why: `the wet ladder is spent (sealed ${tries}/${att}, walked ${walks}/${cap})` }
}

// (v0.300.0) THE WET-CEILING ASCEND - the climb's answer to the sealed water
// column. MEASURED (face 36517770723, the v0.299.0 tree's first field, the
// economy RECOVERED banked=446 after three banked=0 faces): 17 climb deaths
// read 'failed - stalled' and every sampled diag line is the same shape -
// 'blocked toward -1,0 (dug=0, wet) water (stop)' at EVERY bearing (F1 y=46,
// F5 y=51, F12 y=60): the staircase climbed INTO the flooded band, all four
// cardinal step cells read water, the wet-escape galleries walked and
// re-judged into the next water column, and the rotate ladder spent its
// fails standing in the same column. The rescue lane solved this exact shape
// long ago (the v0.125.0 deep-pocket ascend: 'the jump is producing nothing
// and the head is WET - a ceiling owns the pocket: surface to the ceiling
// and dig up'). The climb never got the sibling: its blockedWet branch ends
// at the rotate ladder. The cure digs the ceiling (feet+2) when the wet
// blocked verdict stands - one vertical block re-judges the whole column
// (the water above falls into the dug cell, the staircase's next scan reads
// it, and the escape ladders own whatever remains). BUDGETED: a per-climb
// cap (default 4) bounds the digs so a pathological ceiling stack ends the
// climb honestly inside the existing maxMs + failLimit fences - the same
// shape the rescue's ASCEND_DIG_BUDGET (3) and the wet-escape walked ladder
// (WET_ESCAPE_WALK_CEILING, 4) already use. The gate is PURE: the caller
// reads the block, runs the dig, and names its line.
export const WET_CEILING_DIG_BUDGET = 4

/**
 * Should this climb's wet-blocked pass try the ceiling dig? Pure, junk-safe:
 * room while ascendDigs < budget. The caller alone decides WHEN to consult
 * (the blockedWet branch after the wet-escape ladders), which blocks are
 * diggable, and how the dig failure falls through to the rotate ladder.
 * @param {object} [p]
 * @param {number} [p.ascendDigs] ceiling digs spent so far this climb (default 0)
 * @param {number} [p.budget] per-climb cap (default WET_CEILING_DIG_BUDGET)
 * @returns {{dig: boolean, why: string}}
 */
export function wetCeilingAscendGate ({
  ascendDigs = 0,
  budget = WET_CEILING_DIG_BUDGET
} = {}) {
  const digs = Number.isFinite(ascendDigs) && ascendDigs >= 0 ? Math.floor(ascendDigs) : 0
  const cap = Number.isFinite(budget) && budget > 0 ? Math.floor(budget) : WET_CEILING_DIG_BUDGET
  if (digs >= cap) return { dig: false, why: `ascend budget spent (${digs}/${cap})` }
  return { dig: true, why: `ascend room (${digs}/${cap})` }
}

/**
 * Classify a finished wet-escape and advance the matching counter (pure,
 * junk-tolerant). walked > 0 means the gallery MOVED the bot out of the water
 * it was trapped in - the next water column is a NEW trap, not the same wall,
 * so the sealed budget survives; walked <= 0 (a sealed pocket) consumes the
 * sealed ladder exactly as the legacy shape did.
 * @param {object} [p]
 * @param {number} [p.walked] blocks the gallery walked
 * @param {number} [p.wetTries] sealed escapes spent so far
 * @param {number} [p.wetWalks] walked escapes spent so far
 * @returns {{wetTries: number, wetWalks: number, sealed: boolean}}
 */
export function wetEscapeAccount ({ walked = 0, wetTries = 0, wetWalks = 0 } = {}) {
  const moved = Number.isFinite(walked) && walked > 0
  const tries = Number.isFinite(wetTries) && wetTries >= 0 ? Math.floor(wetTries) : 0
  const walks = Number.isFinite(wetWalks) && wetWalks >= 0 ? Math.floor(wetWalks) : 0
  return moved
    ? { wetTries: tries, wetWalks: walks + 1, sealed: false }
    : { wetTries: tries + 1, wetWalks: walks, sealed: true }
}

// (v0.29.0) 4 = a full circle of bearings. Every traverseStep refusal is
// BEARING-LOCAL (it reads only the cells along d), so a refusing gallery
// rotates to the next cardinal instead of dying on the first refusal - the
// fleet measured the cycle (F11: 'wet escape: 1 blocks walked (gap)' ->
// staircase rotate -> wet again -> a fresh escape into the SAME gap ->
// 'failed - stalled'), each cycle feeding the rescue loop's 25s 'still wet'
// timeout (68 per 600s fleet). After a full circle of refusals the pocket is
// genuinely sealed - give up honestly.
export const TRAVERSE_ROTATE_LIMIT = 4

// (v0.85.0) THE LOW-O2 YIELD: _climbEscape owns the controls and the drown
// sentry yields to it (the escape IS the way out) - so an escape that stalls
// under a wet ceiling drains the bar with nobody watching. Run77 measured the
// death: F7 'drowned@0.8' at [-191,61,471], at SURFACE level, inside a wet
// escape whose digs kept refusing (the sentry never fired while
// _climbEscape was up). Below this floor the escape stops being the way out
// - with ~3s of air left, the rescue lane's surface-hold (jump at the air
// line) beats blind digging. The escape returns 'low-o2' and the climb hands
// the bot back: the sentry re-owns it on the next tick and pages the rescue.
export const CLIMB_ESCAPE_O2_FLOOR = 6

/**
 * (v0.379.0) THE WET-SENTINEL WATCH - the climb's o2 watch as ONE pure gate.
 * Two yield arms, the escape's own air doctrine:
 *   - 'low-o2'       (v0.85.0, byte-identical) an in-domain bar at or under
 *                    CLIMB_ESCAPE_O2_FLOOR - the escape stops being the way
 *                    out, the rescue lane's surface-hold beats blind digging.
 *   - 'wet-sentinel' (v0.379.0, new) an OUT-OF-DOMAIN bar (the -1 reset
 *                    sentinel, NaN, junk) at a WITNESSED wet head. Face
 *                    36799188224's F16 drowned inside a running escape: the
 *                    sentinel disarmed the in-domain watch (oxygenInDomain(-1)
 *                    is false), the sentry's climb gate froze the wet clock
 *                    ('rescue never', 'wet 0s@last' at a feet-water head-water
 *                    death), and the lungs burned unwatched - the o2-RESET
 *                    death class the 0900 fire named, the climb-lane variant.
 *                    A broken sensor over a witnessed flood is not air: the
 *                    head's block read is the ground truth, the escape yields.
 * The v0.64.0 burst grace survives untouched: a sentinel burst on DRY land
 * (the post-respawn/post-rescue class, 395 reads measured) never yields -
 * only the head's water witness condemns, junk o2 alone never does.
 *
 * @param {object} [p]
 * @param {number|null} [p.oxygen] the live bar read (bot.oxygenLevel; junk
 *   reads out-of-domain and is condemned only by the witness arm)
 * @param {boolean} [p.headWet] the head cell's water witness (isWaterName of
 *   the blockAt read; STRICT true - junk witness never condemns)
 * @param {number} [p.floor] the yield floor (junk -> CLIMB_ESCAPE_O2_FLOOR)
 * @returns {{yield: boolean, reason: 'low-o2'|'wet-sentinel'|null, o2: number|null}}
 *   yield=false carries the in-domain o2 (null when junk) for the caller's log
 */
export function climbO2Watch ({ oxygen = null, headWet = false, floor = CLIMB_ESCAPE_O2_FLOOR } = {}) {
  const f = Number.isFinite(floor) && floor >= 0 ? floor : CLIMB_ESCAPE_O2_FLOOR
  if (oxygenInDomain(oxygen)) {
    if (oxygen <= f) return { yield: true, reason: 'low-o2', o2: oxygen }
    return { yield: false, reason: null, o2: oxygen }
  }
  if (headWet === true) return { yield: true, reason: 'wet-sentinel', o2: null }
  return { yield: false, reason: null, o2: null }
}

// ---------------------------------------------------------------------------
// (v0.98.0) THE VEIN FALL FENCE. run87 (35813478393) fell/env x8 (a record),
// and the smoking gun is F4's last line: 'vein sweep: 8 ores dug beside the
// gallery' then death at [-114,43,420] - veinSweep digs ANY ore within reach
// with NO drop check, while the shaft digger itself refuses exactly these
// cells (dropAheadBelow >= 4 -> sidestep, v0.86.0 stale-window refusal). An
// ore hanging over a cave is not worth the fall: the bonus sweep must obey
// the same terrain truth the digger respects. Pure decision, CI-testable.
export const VEIN_DROP_REFUSE = 4

/** Pure: why this vein cell must NOT be dug (null = dig it). Junk-safe: a
 * blind read (zero real block reads under the cell - the stale window) and a
 * junk/negative drop both refuse - a bonus sweep never gambles on a read it
 * cannot trust. The feet-support cell with solid ground beneath reads 0 and
 * stays allowed (the normal 1-block descent mechanic). */
export function veinDigRefusal ({ airBelow = 0, blind = false } = {}) {
  if (blind === true) return 'blind read (stale window) - a bonus sweep never digs blind'
  const a = Number(airBelow)
  if (!Number.isFinite(a) || a < 0) return 'junk drop read - refuse'
  if (a >= VEIN_DROP_REFUSE) return `drop of ${a} below the cell (cave?) - the ore waits for a safe angle`
  return null
}

// ---------------------------------------------------------------------------
// (v0.429.0) THE TUNNEL STEP FENCE - the walking lane's own vertical truth.
// MEASURED (face 27, 36870593766): F14 'fell from a high place' [kind=fall]
// at [-132,45,405] - the ONLY fall death across faces 26+27 - while the
// tunnel's raw one-block step (v0.10.4 lesson 2) was the fleet's LAST motion
// primitive without the dropAheadBelow fence: the shaft digger sidesteps
// (dropAheadBelow >= 4 + the v0.86.0 stale-window refusal), the vein sweep
// fenced its cells (v0.98.0 THE VEIN FALL FENCE above), the support dig and
// the lip dig probe theirs (v0.267.0/v0.206.0), the wet-escape's
// traverseStep carries the GAP GUARD - the tunnel dug the step cell ahead
// and held forward 'let gravity handle the drop' at ANY depth. The fence
// probes the floor under the step cell BEFORE any dig: a 4+ drop (fall
// damage begins at 4 - the shaft's own threshold), a fluid strike under it,
// or a blind read refuses the iteration and the caller rotates - the
// fluidAhead break's own shape, the verdict rides zeroWhy when the gallery
// reads zero. Pure decision, CI-testable.
export function tunnelStepRefusal ({ airBelow = 0, blind = false, fluidBelow = false } = {}) {
  if (blind === true) return 'blind read (stale window) - a tunnel never steps blind'
  if (fluidBelow === true) return 'fluid below the step cell - the step waits for solid ground'
  const a = Number(airBelow)
  if (!Number.isFinite(a) || a < 0) return 'junk drop read - refuse'
  if (a >= VEIN_DROP_REFUSE) return `drop of ${a} below the step cell (cave?) - the gallery waits for a floored bearing`
  return null
}

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
// walkable directions:
//   terrace - a free cell at feet+1 with a solid floor at feet level (a one-block
//             step up in front: the bank shape the v0.23.0 fleet measured)
//   flat    - (v0.37.0) the level-ground shape the same fleet's F2 then stalled
//             on at y=64: front feet-level cell EMPTY (no wall), feet+1 free
//             (headroom), feet-1 SOLID (ground to walk on). The old terrace-only
//             rule could not see flat open terrain as "out" - the support check
//             blocked every bearing (no step UP exists) and the climb burned its
//             fails on a bot that was already standing outside ('cannot leave
//             the shaft' 11x in 35566494961, every bank/map trip gated behind
//             that climb).
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
// @param {Function} [p.probes] (dx, dz) => { free, solid, walkFlat } for the
//   horizontal neighbour: free = the cell at feet+1 has an empty bounding box
//   (walkable air), solid = the cell at feet level is a solid floor to walk on,
//   walkFlat = feet-level front cell empty + feet+1 free + feet-1 solid (level
//   ground). A direction counts when terrace OR flat holds; the extra field is
//   optional - callers that only report {free, solid} keep the v0.23.0 behaviour.
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
    if (!c) continue
    const terrace = c.free === true && c.solid === true
    const flat = c.walkFlat === true // (v0.37.0) optional - old callers keep the terrace-only rule
    if (terrace || flat) open++
    if (open >= minDirs) return true
  }
  return false
}

// (v0.610.0) THE ALTITUDE-DEMAND GUARD - the plan-vs-ground disagreement's
// own edge, mined on fleet 37188370162: 'F1 chest ascent (upfront): the yard
// stands 15 levels up - funding the climb' and 0.4ms later 'climbed +0 levels
// (dug 0, 0 steps) - the hop ladder is pre-funded'. The v0.23.0 walkable-surface
// probe answers ONE question - 'am I stuck in a hole/shaft?' (daylight + 2
// walkable dirs) - and a quarry pit's floor is OPEN SKY: the probe's yes is
// true while the yard the caller demanded still stands 15 levels up. The
// verdict then hands a zero-gain landing to the deposit chain (v0.609.0 had
// to re-classify it downstream - 'failed (zero-gain)' - AFTER the funded
// clock was written off as a landing). The cure is upstream and surgical:
// when the CALLER demanded an altitude (its own targetY - not the stale
// shaft-entry raise inside climbOut, so every plain shaft-exit and the
// v0.23.0/v0.37.0 stale-entry faces keep their verdict byte for byte) that
// still stands more than one level above the bot's feet, the surface
// handover is a lie below the demand - skipped, and the climb keeps its own
// funded budgets (the fail ladder, the maxMs fence) toward the demanded
// level: an honest rise or an honest stall, never a fake landing.
//
// (v0.614.0) THE DEMAND-CLOSURE LAW - the v0.610.0 guard exempted every
// climb that ROSE (gained > 0 kept the handover; the v0.609.0 landed pins
// rode byte for byte and 'the partial-rise re-price owns another face, with
// field data'). THE FIELD DATA CAME: fleet 37193219050 (512fbf0 = v0.610.0,
// the guard's first flight) landed THREE climbs and ALL THREE are partial
// rises - F16 demanded 12 climbed +6, F5 demanded 13 climbed +8, F10
// demanded 9 climbed +1 - the demand stands 5-8 levels above every
// 'pre-funded' walk (the demand-closure lens priced it: 'every landing is
// partial'). A rise that leaves the yard still more than one level above is
// NOT a landing - the exemption is gone, the geometry rules alone: the
// demanded altitude standing above the bot bars the handover, rise or no
// rise. A closure (t - f <= 1, the one-level step the walk ladder owns)
// keeps the handover whatever the delta; the 'already out' return never
// consults the guard. The gained argument stays in the signature for the
// wiring's byte-stability (both call sites pass it) - the law no longer
// reads it. Junk-safe: an unreadable target or feet keeps the legacy
// verdict.
//
// @param {object} p
// @param {number|null} [p.targetY] the CALLER's demanded altitude (the yard's
//   level on the ascent legs; null on every plain climb - the guard stays off)
// @param {number|null} [p.feetY] the bot's current feet cell y (the handover read)
// @param {number} [p.gained] accepted for the wiring's byte-stability - the
//   demand-closure law reads the geometry alone
// @returns {boolean} true = the demanded altitude is still > 1 above the bot
//   - the walkable-surface verdict must NOT fire, however far the climb rose
export function climbSurfaceShort ({ targetY = null, feetY = null, gained = 0 } = {}) {
  const t = Number.isFinite(targetY) ? targetY : null
  const f = Number.isFinite(feetY) ? feetY : null
  if (t == null || f == null) return false // junk keeps the legacy verdict
  return t - f > 1 // the demanded altitude still stands above the bot - rise or no rise
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
// (v0.81.0) the unbreakable structure set joined: run75 (35740810293) measured
// F9 dug=64 at ONE end_portal_frame [-158,66,408] - the server can never break
// it (hardness -1), so every retry was a whole climb dig budget burned on one
// cell. Portals/commands/jigsaws are the same class: stop, never dig.
export const UNDIGGABLE = ['bedrock', 'barrier', 'reinforced_deepslate', 'obsidian', 'crying_obsidian',
  'end_portal_frame', 'end_portal', 'end_gateway', 'nether_portal',
  'command_block', 'chain_command_block', 'repeating_command_block',
  'structure_block', 'jigsaw', 'moving_piston']
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

// (v0.158.0) THE VERTICAL DOOM PLAN - the pure gate for the walk ladder's
// one truly hopeless geometry. run556 (36055223458, the v0.156.0 fleet)
// decoded F6's whole arc: the bot stood at [-113,41,419] with the yard
// chests at [-115,80,418] - TWO blocks lateral, THIRTY-NINE levels up - and
// every yard-walk attempt died the path classes ('Took to long to decide
// path to goal!' x3+, 'raw walk stalled after 2029ms (d=37.8)', 'stuck' x10,
// 7 chest hops 'chest unreachable (budget exhausted (walk floor))'): a
// 1-jump pathfinder cannot route a mostly-vertical goal, and the raw walk's
// straight-line segment toward a goal that is nearly straight UP walks INTO
// the ceiling - the zero-delta stalls are CORRECT geometry, not a wedge.
// The same shape killed F10 ('still underground after 2 climb attempts -
// the chain from the shaft bottom is doomed walks') and F17 (the hop died
// the decide class at d=8). The cure has two edges: the climb machinery
// (which CAN dig a staircase up) gets the yard's level as its target, and
// the walk ladder stops burning its slice on attempts doomed by arithmetic.
// Junk-safe: any non-finite input reads as no doom (the legacy shape).
export const VERTICAL_DOOM_MIN_DY = 20

export function verticalDoomPlan ({ botY = null, yardY = null, lateral = null, minDy = VERTICAL_DOOM_MIN_DY } = {}) {
  const dy = Number.isFinite(botY) && Number.isFinite(yardY) ? yardY - botY : null
  if (dy == null) return { doom: false, why: 'no vertical read' }
  if (dy < (Number.isFinite(minDy) && minDy > 0 ? minDy : VERTICAL_DOOM_MIN_DY)) return { doom: false, why: `the yard stands ${Math.round(dy)} levels up - inside the walkable band` }
  const lat = Number.isFinite(lateral) && lateral >= 0 ? lateral : null
  if (lat == null) return { doom: false, why: 'no lateral read' }
  // The strict shape: the goal is MOSTLY up (lateral < vertical). A hillside
  // walk (lateral > dy) keeps the legacy ladder - A* can route a staircase
  // that exists; a goal 2 blocks over and 39 up has no staircase to find.
  if (lat >= dy) return { doom: false, why: `the yard stands ${Math.round(dy)} levels up over ${Math.round(lat)}b lateral - the ladder may route it` }
  return {
    doom: true,
    dy: Math.round(dy),
    lateral: Math.round(lat),
    why: `the yard stands ${Math.round(dy)} levels up over ${Math.round(lat)}b lateral`
  }
}

// (v0.255.0) THE QUARRY ASCENT - the mid-run bank trip's climb decision, the
// cure for THE QUARRY-SEVERED YARD (face 36340470441: banked 0 vs 733 - the
// dig floor sank to y~59 while the yard sits y~80; the vertical doom gate
// refused the walk x7+ per bot, the smelt leg / commune / fuel anchor all
// starved behind the same wall, 1641u rode the deadline). The final bank has
// owned its doom climb since v0.158.0 - the MID-RUN trip only logged the
// refusal and let the pocket ride. THE CURE: when the yard stands MOSTLY UP
// (the same strict doom arithmetic) and the trip's clock can fund a climb
// slice PLUS the walk floor, the trip climbs to the yard's level FIRST (the
// climb machinery digs toward the yard - the same shape the final climb
// uses), then the legacy walk runs from a level the ladder can actually
// route. The doom gate stays byte for byte (it is honest - the ascent gives
// the ladder a route instead of loosening the gate). Junk-safe: a junk
// position, a junk clock or a below-floor dy reads no ascent - the legacy
// refusal shape byte for byte.
export const QUARRY_ASCENT_MIN_DY = 8
export const QUARRY_ASCENT_CLIMB_MS = 45000 // one climb slice FLOOR: ~4 levels of staircase + the settle
export const QUARRY_ASCENT_WALK_FLOOR_MS = 30000 // the walk needs real clock after the climb
// (v0.604.0) THE PER-LEVEL LAW - the climb slice scales with the wall it digs.
// Face 37183256337 (the v0.600.0 flight): '7 failed ascents (timeout 4, wet
// wall 3), 0 of 7 climbs landed' - the flat 45s slice priced a FOUR-level
// staircase while the deep era's yards stand 20-31 levels up, and every
// funded-but-doomed slice burned its chain clock and landed nothing. The
// measured price is the v0.294.0 bank law's own number (~4.2s/level,
// 'climb out (bank): OK +11 levels ... 46s'). The demand now reads the wall:
// climbMs = max(45s floor, dy * 4200). A shallow chest (dy <= 10) keeps the
// legacy slice byte for byte; a deep wall is either funded FULLY (the upfront
// leg's fat clock - the climb can now outlive its old fence and LAND) or
// refused honestly (the thin doom-time clock - the refusal's why names the
// real price). The wet-wall geometry class is not this cure's face - the
// timeout class is.
export const QUARRY_ASCENT_PER_LEVEL_MS = 4200

export function quarryAscentPlan (p = {}) {
  const q = p && typeof p === 'object' ? p : {}
  const botY = q && typeof q === 'object' ? q.botY : null
  const yardY = q && typeof q === 'object' ? q.yardY : null
  const dy = Number.isFinite(botY) && Number.isFinite(yardY) ? yardY - botY : null
  if (dy == null || dy < (Number.isFinite(QUARRY_ASCENT_MIN_DY) ? QUARRY_ASCENT_MIN_DY : 8)) {
    return { ascend: false, why: dy == null ? 'no vertical read' : `dy ${Math.round(dy)} below the ascent floor`, dy: dy == null ? null : Math.round(dy) }
  }
  // (v0.604.0) the slice reads the wall: the flat 45s stays the shallow floor,
  // a deep dy scales (an explicit climbMs override still wins - the junk-safe
  // legacy door). dy is >= MIN_DY here, the rounding only prices junk-adjacent
  // fractional reads honestly.
  const cm = Number.isFinite(q.climbMs) && q.climbMs > 0 ? Math.floor(q.climbMs) : Math.max(QUARRY_ASCENT_CLIMB_MS, Math.round(dy) * QUARRY_ASCENT_PER_LEVEL_MS)
  const wf = Number.isFinite(q.walkFloorMs) && q.walkFloorMs >= 0 ? Math.floor(q.walkFloorMs) : QUARRY_ASCENT_WALK_FLOOR_MS
  const rem = Number.isFinite(q.remainingMs) ? Math.floor(q.remainingMs) : null
  if (rem == null) return { ascend: false, why: 'no clock read', dy: Math.round(dy) }
  if (rem < cm + wf) return { ascend: false, why: `the clock ${Math.round(rem / 1000)}s cannot fund the ${Math.round(cm / 1000)}s climb + the ${Math.round(wf / 1000)}s walk floor`, dy: Math.round(dy) }
  return { ascend: true, why: `the yard stands ${Math.round(dy)} levels up - the climb buys the walk its route`, dy: Math.round(dy), climbMs: Math.min(cm, rem) }
}

// (v0.159.0) THE CHEST VERTICAL GATE - the shared wiring helper for the yard
// chest walks (the commons, the tithe, the commune, the pool seed). Run15
// measured the class the bank climbs' gate (v0.158.0) never covered: the smelt
// leg's walks run from DEEP bots (F4 y=43, the yard hill y=82 - dy 39 over 5b
// lateral) and burn the thin leg clock on 4-5 guaranteed refusals per ask
// ('chest unreachable (Took to long to decide path to goal!)' x15+ while
// smelted=0; the commune's nudges closed to d=39.4 with the segment stalled).
// The same strict verticalDoomPlan arithmetic now gates the chest walks
// themselves. Junk-safe: any unreadable position reads as no doom - the
// legacy walk attempt runs byte for byte.
export function chestVerticalDoom ({ botPos = null, chestPos = null } = {}) {
  try {
    if (!botPos || !chestPos) return { doom: false, why: 'no position read' }
    const y = Number.isFinite(botPos.y) ? botPos.y : null
    const cy = Number.isFinite(chestPos.y) ? chestPos.y : null
    if (y == null || cy == null) return { doom: false, why: 'no vertical read' }
    return verticalDoomPlan({
      botY: y,
      yardY: cy,
      lateral: Math.hypot(botPos.x - chestPos.x, botPos.z - chestPos.z)
    })
  } catch {
    return { doom: false, why: 'no position read' }
  }
}

// (v0.158.0) THE RAISED CLIMB TARGET - climbOut's targetY override as a pure
// gate. The shaft entry level (stats.shaftEntryY) stays the default surface
// reference; the yard's level may only RAISE it (a climb that stops at a
// low entry level hands the walk ladder a doomed vertical - the F6 class).
// A target at/below the entry (the yard downhill) and junk shapes keep the
// entry record byte for byte.
export function climbTargetY ({ entryY = null, targetY = null } = {}) {
  const entry = Number.isFinite(entryY) ? entryY : null
  const target = Number.isFinite(targetY) ? targetY : null
  if (target == null) return entry
  if (entry == null) return target
  return target > entry ? target : entry
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

// ---------------------------------------------------------------------------
// THE CLIMB'S PATIENT DIG WINDOW (v0.39.0) - mobility outlives the tool.
//
// MEASURED (fleet 35572106504, master c7c3a2b, 19 bots x 600s): 25+ diag lines
// of 'blocked toward X,Z (dug=N) dig failed at [,,] granite/stone/andesite'
// (F1 y=53 x7, F14 y=43 x9, F4 y=42 x4, F13, F10, F17) - the dig failing is
// the climb's top refusal shape, and every one of those bots had a broken or
// never-crafted pickaxe (F1's stone_pickaxe broke after 100+ mined; F14's
// inventory never held one). The server validates vanilla dig times, and the
// fastDig equip step (requireHarvest) silently gives up when no pickaxe exists
// - a bare hand digs stone-family in 7.5s = 150 ticks, over the plain 100-tick
// window. fastDig returned false at dug=0 on every retry: the staircase could
// not cut a single cell, the climb burned its budget standing still, and the
// bank chain never ran ('cannot leave the shaft' 12x, banked=0).
//
// THE CURE is what the wet-escape traverse already does (its own measured
// 200-tick window, v0.13.0): give the climb's step digs the same patient
// window. A pickless bot now finishes the bare-hand cut at ~150 ticks - slow
// (7.5s/block, no drops: bare stone yields nothing) but the STAIRCASE MOVES,
// and a bot that reaches the surface can bank, craft and re-arm. A pick bot
// finishes at 23-46 ticks and the window changes nothing for it. 200 = 150
// (bare-hand stone) + settle/latency margin, matching the escapeTraverse
// precedent; deepslate bare-hand (750t) stays hopeless by design - the tool
// pipeline, not the climb, owns that class.
export const CLIMB_DIG_TICKS = 200

// ---------------------------------------------------------------------------
// THE FLOODED-DIG WINDOW (v0.42.0) - the vanilla multiplier beats the patient
// window exactly when the shaft is wet.
//
// MEASURED (fleet 35582520041, master 4304f32, the first run with v0.39.0's
// 200-tick window): 8x 'dig failed at [x,y,z] granite/diorite/stone/dirt'
// with dug=0 - and F16's failing block is DIRT, which a bare hand cuts in
// 0.75s = 15 ticks. A 200-tick window cannot fail a dry dirt dig, so the
// window was not the binding constraint: the server multiplies the dig time
// x5 when the digger is in water and another x5 when off the ground
// (vanilla's dig-speed rules). A flooded shaft bottom turns bare-hand dirt
// into 375t (25s under the x25 stack) and stone-family into 750t-3750t - the
// 200t window returns false, the climb rotates, fails again, and burns its
// whole budget: 6x 'final climb: failed - stalled/timeout' and every one of
// those bots never surfaced to bank.
//
// THE CURE has two halves. (1) The climb sizes its dig window from the
// environment: a wet context (eye OR feet in fluid - the eye read matches
// mineflayer's own digTime approximation, the feet read catches the vanilla
// bounding-box rule it misses) takes the flooded window. 800t = 40s covers
// the common flooded floors: bare-hand stone-family on-ground x5 = 750t, a
// pick x5 = 115t (the plain 100t window refused THAT class too - the fastdig
// note measured it), dirt x25 = 375t. (2) The hopeless x25 stack (bare-hand
// stone-family while swimming = 3750t) deliberately exceeds it: the dig fails
// at 40s and the caller routes a wet dig-failure to the WET ESCAPE (walk out
// from under the water) instead of a rotate-fail loop - the v0.17.0 policy,
// which the dig-fail path could never reach before (it did not set
// blockedWet).
export const CLIMB_DIG_TICKS_WET = 800

/**
 * Dig window (ticks) for one climb step dig, from the bot's wet context.
 * Pure, junk-tolerant: junk/absent flags read dry (the v0.39.0 window).
 * @param {object} [p]
 * @param {boolean} [p.eyeWet] the block at the bot's eye level is fluid
 * @param {boolean} [p.feetWet] the block at the bot's feet is fluid
 * @param {number} [p.dryTicks] dry window (default CLIMB_DIG_TICKS)
 * @param {number} [p.wetTicks] flooded window (default CLIMB_DIG_TICKS_WET)
 * @returns {number} maxTicks for fastDig
 */
export function climbDigWindow ({ eyeWet = false, feetWet = false, dryTicks = CLIMB_DIG_TICKS, wetTicks = CLIMB_DIG_TICKS_WET } = {}) {
  const dry = Number.isFinite(dryTicks) && dryTicks > 0 ? dryTicks : CLIMB_DIG_TICKS
  const wet = Number.isFinite(wetTicks) && wetTicks > 0 ? wetTicks : CLIMB_DIG_TICKS_WET
  return eyeWet === true || feetWet === true ? wet : dry
}

// ---------------------------------------------------------------------------
// (v0.309.0) THE STILL-THERE RE-ARM - the client's wet read is a suspect, the
// server's dig price is the honest one.
//
// MEASURED (fleet 36547556739, the 0.307.0+0.308.0 face, COMPLETED SUCCESS
// but 3 of 4 zero-banks rode 'still underground after 2 climb attempts'):
// F1's end-phase burned both climb attempts on ONE flooded-band cell class -
// 6x 'climb diag: ... dig failed at [...] diorite (held=wooden_pickaxe,
// airborne, post=diorite STILL THERE (server never broke it))' - and 261u
// rode the write-off row. The heartbeat cadence prices each failed dig at
// ~20s (= the DRY 200t window at the relogged client's half-rate tick clock),
// while wooden-pick diorite under the vanilla wet x5 + airborne x5 stack
// needs ~562 SERVER progress ticks: the dig ran the dry window and the spam
// could never cover the server's own price. The v0.42.0 wet window EXISTS
// (800t covers the 562t stack) but it was never offered: the eye/feet wet
// read (bot.entity.position.offset cells, ONE read per step attempt, on a
// client that had just relogged) saw the air pocket the bot stands in and
// took the dry window - while the server priced the dig from the digger's
// own (desynced or bounding-box-wet) state. Two reads, two verdicts, the
// dig died in the gap.
//
// THE CURE is not a wider read (the eye/feet geometry is honest; the
// desync is not client-visible) - it is the SECOND ATTEMPT: when a climb
// dig's stale recheck says the block is STILL THERE (postLanded === false,
// the v0.76.0 verdict for 'the server never broke it') and the dig ran the
// DRY window, re-arm the SAME cell once at the flooded window (800t). The
// server's x25 stack (~562t for a pick on stone-family) completes inside it;
// a bare-hand hopeless stack (3750t) still fails at 40s and keeps the
// v0.42.0 wet-escape route untouched. A dig that already ran the wet window
// never re-arms (the refusal is a genuine server verdict, not a window
// misprice - and no infinite loops), and a non-false postLanded (the
// stale-read class, or an unknown read) re-arms nowhere: the stale class
// owns its recovery, the unknown class has no evidence the server held the
// cell. Junk digWindow reads as the dry window (the conservative honest
// price: the F1 log line carries no window field); junk rearmTicks falls to
// the 800 default.
export const CLIMB_REARM_TICKS = CLIMB_DIG_TICKS_WET

/**
 * The still-there re-arm window (ticks) for one failed climb dig, or 0.
 * Pure, junk-tolerant.
 * @param {object} [p]
 * @param {number} [p.digWindow] the window the failed dig ran (ticks)
 * @param {boolean|null} [p.postLanded] the stale recheck's verdict - only the
 *   strict false ('server never broke it') re-arms
 * @param {number} [p.rearmTicks] the flooded re-arm window (default
 *   CLIMB_REARM_TICKS)
 * @returns {number} maxTicks for the re-arm fastDig, or 0 (no re-arm)
 */
export function climbRearmTicks (opts = {}) {
  // (the Number(null) lesson, fifth strike) the BODY guard, not a destructuring
  // default: climbRearmTicks(null) would throw on the destructure itself.
  const { digWindow = null, postLanded = null, rearmTicks = CLIMB_REARM_TICKS } = opts || {}
  if (postLanded !== false) return 0
  const ran = Number.isFinite(digWindow) ? digWindow : CLIMB_DIG_TICKS
  const wet = Number.isFinite(rearmTicks) && rearmTicks > 0 ? rearmTicks : CLIMB_DIG_TICKS_WET
  if (ran >= wet) return 0
  return wet
}

// ---------------------------------------------------------------------------
// (v0.311.0) THE WELL POUNCE - the manual back-off the rise ladder lacks.
//
// MEASURED (fleet 36566021862, the double-0.309.0 + 0.310.0 face, the FIRST
// full 600s survival since the OOM season: alive=19/19, mined=2361 @ 3.94 b/s,
// banked=1117): the climb chain is now THE banked killer - 9 of 19 bots ended
// 'still underground after N climb attempts' and the deadline write-off rode
// 1120u unbanked. The climb diag census splits the loss: 41 wet-wall lines
// (dug=0, the flooded levels the server prices shut) and 10 'did not rise'
// lines of which 8 read the SAME signature: feet=air support=stone step=air
// head=air - the v0.27.0 1x1 WELL: the bot stands fine, faces a 1-high step
// with open air above, and the raw stepUp fails because pressed against the
// step face the collision zeroes horizontal velocity while the jump arc needs
// it. The ladder's cures all miss the well: the assist goto needs the
// pathfinder's run-up the well cannot offer (NoPath, v0.52.0's own words),
// the traverse gallery digs an L the well's guards often refuse, the rotate
// re-digs 2+ cells per bearing and burns the fail budget on geometry ONE
// back-step would break. The pathfinder's own jump-edge trick names the cure
// (v0.27.0's comment: 'backs off, jumps with speed') - the pounce performs it
// by hand: release forward, BACK up a few ticks (breaks the face press, opens
// the collision), then forward+jump the long hold at the same bearing. No
// digs, no pathfinder, no guards beyond the signature itself; the well floor
// behind the bot is the shaft floor the bot is standing on. Pure, junk-tolerant.
// ---------------------------------------------------------------------------

export const CLIMB_POUNCE_BACK_TICKS = 4
export const CLIMB_POUNCE_JUMP_TICKS = 24

/**
 * The well-pounce plan (back/jump ticks) for a failed climb rise, or null.
 * Fires only on the FULL well signature - support solid at feet level toward
 * the bearing, step open above it, head clearance open - the 8/10 fleet
 * signature; anything else stays with the existing ladder. Pure, junk-tolerant.
 * @param {object} [p]
 * @param {boolean|null} [p.supportSolid] the feet-level block toward d is solid
 * @param {boolean|null} [p.stepOpen] the block above the support is empty
 * @param {boolean|null} [p.headOpen] the clearance above the bot's head is empty
 * @param {number} [p.back] the back-off hold (default CLIMB_POUNCE_BACK_TICKS)
 * @param {number} [p.jump] the forward+jump hold (default CLIMB_POUNCE_JUMP_TICKS)
 * @returns {{back: number, jump: number}|null} the pounce plan, or null
 */
export function climbPouncePlan (opts = {}) {
  // (the Number(null) lesson, sixth strike) the BODY guard, not a destructuring
  // default: climbPouncePlan(null) would throw on the destructure itself.
  const {
    supportSolid = null, stepOpen = null, headOpen = null,
    back = CLIMB_POUNCE_BACK_TICKS, jump = CLIMB_POUNCE_JUMP_TICKS
  } = opts || {}
  if (supportSolid !== true || stepOpen !== true || headOpen !== true) return null
  const bt = Number.isFinite(back) && back > 0 ? back : CLIMB_POUNCE_BACK_TICKS
  const jt = Number.isFinite(jump) && jump > 0 ? jump : CLIMB_POUNCE_JUMP_TICKS
  return { back: bt, jump: jt }
}

// ---------------------------------------------------------------------------
// (v0.312.0) THE WET-WALL YIELD - the honest early exit the wet band lacks.
//
// MEASURED (fleet 36566021862, the first full-survival face): 47 wet-blocked
// rotations on just 8 distinct bot-levels - F6 y=48 x12, F4 y=51 x12, F12
// y=57 x9, F7 y=51 x8 - each level re-probing the SAME water cell 8-12 times
// until the 89s/90s fence killed the attempt ('F12 final climb: failed -
// timeout [stage 2]' right after three consecutive identical wet diags on
// the same bearing). The wet machinery (the v0.17.0 gallery, the v0.159.0
// ladder, the v0.300.0 ascend) runs FIRST and owns the crossing - the
// v0.159.0 comment already says the band 'gets crossed by repeated galleries,
// instead of one' - but once the escape and ascend budgets are spent, the
// rotate ladder keeps grinding a column where EVERY bearing reads water and
// rotation can provably change nothing (water is rotation-independent). The
// fence reserve that was meant for the REST of the bank chain dies there.
// THE CURE: count the wet-blocked rotations per level (reset on every real
// rise); when a full bearing sweep has read wet with ZERO dry walls seen at
// this level, yield the climb honestly - the v0.85.0 low-o2 handoff shape,
// an ok=false reason return every caller already handles - instead of
// burning the fence to its timeout. A single dry bearing keeps the rotate
// ladder working (dry walls are diggable material). Junk never yields (the
// conservative honest price: the status-quo ladder keeps the level).
// ---------------------------------------------------------------------------

export const WET_WALL_YIELD_ROTATIONS = 4

/**
 * The wet-wall yield verdict for a climb level's blocked rotations.
 * Pure, junk-tolerant: yields only on a FINITE count of wet rotations at or
 * past the sweep threshold with ZERO finite dry rotations at the same level.
 * @param {object} [p]
 * @param {number} [p.wetRotations] wet-blocked rotations at this level
 * @param {number} [p.dryRotations] dry-blocked (diggable) rotations here
 * @param {number} [p.threshold] the sweep size (default WET_WALL_YIELD_ROTATIONS)
 * @returns {{yield: boolean, reason: string}} the verdict
 */
export function wetWallYield (opts = {}) {
  // (the Number(null) lesson, seventh strike) the BODY guard, not a
  // destructuring default: wetWallYield(null) would throw on the destructure.
  const { wetRotations = null, dryRotations = null, threshold = WET_WALL_YIELD_ROTATIONS } = opts || {}
  if (!Number.isFinite(wetRotations) || !Number.isFinite(dryRotations)) return { yield: false, reason: '' }
  if (wetRotations < 0 || dryRotations < 0) return { yield: false, reason: '' }
  const th = Number.isFinite(threshold) && threshold > 0 ? threshold : WET_WALL_YIELD_ROTATIONS
  if (wetRotations < th) return { yield: false, reason: '' }
  if (dryRotations > 0) return { yield: false, reason: '' }
  return { yield: true, reason: 'wet wall' }
}

// ---------------------------------------------------------------------------
// (v0.319.0) THE WET-COLUMN DOOM MEMO - the yield's verdict must outlive the
// climb that wrote it.
//
// MEASURED (fleet 36606754498, the v0.316.0 doom-latch face): 7 wet-wall
// yields and the seam the 0138 handoff priced is real - F15 condemned y=57
// ('no dry bearing owns this column') and the final-bank ladder's very next
// climb re-probed the SAME column from the same shaft bottom, ground 4 MORE
// wet rotations and yielded again (F18 y=45 the same shape twice). The yield
// says the column is rotation-doomed, but nothing remembers it, so the chain
// pays for the same water twice.
// THE CURE: a per-bot memo (a plain Map on the bot) records the condemned
// column at the yield point; climbOut checks it at entry and refuses FAST
// with the SAME 'wet wall' reason every retry gate already handles (fleet19's
// 'no retry for wet wall' composes untouched, the v0.316.0 doom latch still
// counts the attempt). The tolerance gate keeps the memo honest: water is
// static, so the column is condemned at its yield level and BELOW (a climb
// starting there must pass through); a bot standing ABOVE the water climbs
// free. Junk never condemns and never blocks (the body-guard law). The cap
// bounds the book (32 columns is ~5x the six unique ones this face produced;
// the oldest column evicts first - Map insertion order is the queue).
// ---------------------------------------------------------------------------

export const WET_COLUMN_MEMO_CAP = 32
export const WET_COLUMN_MEMO_TOLERANCE = 1

/**
 * Record a condemned column in the memo (mutates the Map in place).
 * Junk-tolerant: a non-Map memo or any non-finite coordinate leaves the
 * book untouched - junk never condemns.
 * @param {Map} memo the bot's memo book (the wiring creates it lazily)
 * @param {object} [p]
 * @param {number} [p.x] floored column x
 * @param {number} [p.z] floored column z
 * @param {number} [p.y] the yield level
 * @param {number} [p.wetRotations] the wet rotations the verdict cost
 * @param {number} [p.dryRotations] the dry rotations seen (0 at a yield)
 * @param {number} [p.cap] the book's size cap (default WET_COLUMN_MEMO_CAP)
 * @returns {Map} the same memo, for call-site clarity
 */
export function wetColumnMemoCondemn (memo, opts = {}) {
  if (!(memo instanceof Map)) return memo
  const { x, z, y, wetRotations = 0, dryRotations = 0, cap = WET_COLUMN_MEMO_CAP } = opts || {}
  if (!Number.isFinite(x) || !Number.isFinite(z) || !Number.isFinite(y)) return memo
  if (!Number.isFinite(cap) || cap <= 0) return memo
  const key = `${Math.floor(x)},${Math.floor(z)}`
  while (memo.size >= cap && !memo.has(key)) memo.delete(memo.keys().next().value)
  memo.set(key, {
    y: Math.floor(y),
    wet: Math.max(0, Math.floor(wetRotations) || 0),
    dry: Math.max(0, Math.floor(dryRotations) || 0)
  })
  return memo
}

/**
 * The memo's verdict for a climb about to start in a column. Pure,
 * junk-tolerant: blocks only on a KNOWN column at a level that must pass
 * through the condemned water (feet at or below memoY + tolerance).
 * @param {Map} memo the bot's memo book
 * @param {object} [p]
 * @param {number} [p.x] floored column x
 * @param {number} [p.z] floored column z
 * @param {number} [p.y] the climb's starting level
 * @param {number} [p.tolerance] levels above memoY still blocked (default
 *   WET_COLUMN_MEMO_TOLERANCE)
 * @returns {{blocked: boolean, record: {y: number, wet: number, dry: number}|null}}
 */
export function wetColumnMemoBlocked (memo, opts = {}) {
  const none = { blocked: false, record: null }
  if (!(memo instanceof Map)) return none
  const { x, z, y, tolerance = WET_COLUMN_MEMO_TOLERANCE } = opts || {}
  if (!Number.isFinite(x) || !Number.isFinite(z) || !Number.isFinite(y)) return none
  const record = memo.get(`${Math.floor(x)},${Math.floor(z)}`) || null
  if (!record || !Number.isFinite(record.y)) return none
  const tol = Number.isFinite(tolerance) && tolerance >= 0 ? tolerance : WET_COLUMN_MEMO_TOLERANCE
  if (Math.floor(y) > record.y + tol) return none
  return { blocked: true, record }
}

// ---------------------------------------------------------------------------
// (v0.327.0) THE WET-SHIFT FINAL CLIMB - the memo turned the wet wall from a
// life sentence into a navigation problem.
//
// MEASURED (fleet 36631612575, the three-instrument face): the whale F12
// held 220u = 31.1% of the unbanked 707u at the deadline ('pocket anatomy:
// whale ... one walk owns the crater's face') and died UNDERGROUND - the
// mid-run bank climb stalled twice, the pre-position climb stopped at stage
// 1, and the final climb's single attempt hit the wet wall at y=60 ('climb
// wet-wall yield: 4 wet rotations vs 0 dry ... the fence reserve returns to
// the chain') whose no-retry gate then ended the chain. The no-retry law is
// right about the COLUMN: re-grinding a condemned column pays the same water
// twice (the v0.316.0 doctrine, and the v0.319.0 memo refuses the re-entry
// anyway) - but the law says nothing about the NEIGHBOR column. Water is
// local: a wet band owns columns, not the world. THE CURE: when the final
// climb dies on 'wet wall', read the memo's condemned set and shift the
// climb entry LATERALLY (WET_SHIFT_BLOCKS, the first memo-clean cardinal
// bearing, the yard's way preferred) - the fresh column gets the attempt,
// funded by the fence reserve the yield already returned to the chain. A
// shift is not a retry: the retry re-asks the same column (the gates refuse
// it, the memo refuses it harder); the shift moves the bot and asks a
// different column. The mover is the tunnel (the gallery machine - its
// guards: the fluid stop, the gravity roof fence, the named zero verdicts);
// the driver re-reads the LANDED column and re-checks it against the memo
// (the tunnel's z-bearing normalization is diagonal - long-standing gallery
// behavior, not redefined here - so the plan's target is advisory and the
// landed feet are the one truth). Junk never plans a shift (the body-guard
// law); a neighbor condemned at or above the feet level is not clean (the
// tolerance arithmetic rides wetColumnMemoBlocked itself); every neighbor
// condemned stays home ('no dry column in reach' is a verdict too).
// ---------------------------------------------------------------------------

export const WET_SHIFT_BLOCKS = 2
// the shift must fund the tunnel AND a fenced climb (PILLAR_MAX_MS-class):
// a thinner slice buys a climb the fence kills at the wall clock anyway
export const WET_SHIFT_MIN_SLICE_MS = 90000
export const WET_SHIFT_TUNNEL_MAX_MS = 15000

/**
 * Plan a lateral shift for a wet-wall-dead final climb (pure, junk-safe).
 * @param {Map|null} memo the bot's wet-column memo (the condemned set)
 * @param {object} [p]
 * @param {number} [p.x] the failed climb's feet x
 * @param {number} [p.z] the failed climb's feet z
 * @param {number} [p.y] the failed climb's feet y
 * @param {number} [p.preferX] the preferred bearing's x component (the yard's way - it earns the first roll when it maps to a cardinal)
 * @param {number} [p.preferZ] the preferred bearing's z component
 * @param {number} [p.shiftBlocks] the lateral distance (default WET_SHIFT_BLOCKS = 2)
 * @returns {{shift: boolean, bearing: {x: number, z: number}|null, tx: number|null, tz: number|null, why: string}}
 */
export function wetShiftPlan (memo, opts = {}) {
  const none = { shift: false, bearing: null, tx: null, tz: null, why: '' }
  if (!(memo instanceof Map)) return { ...none, why: 'no wet memo - the shift needs the condemned set' }
  const { x, z, y, preferX = null, preferZ = null, shiftBlocks = WET_SHIFT_BLOCKS } = opts || {}
  if (!Number.isFinite(x) || !Number.isFinite(z) || !Number.isFinite(y)) {
    return { ...none, why: 'junk feet - the shift cannot plan' }
  }
  const blocks = (Number.isFinite(shiftBlocks) && shiftBlocks > 0) ? Math.floor(shiftBlocks) : WET_SHIFT_BLOCKS
  const cardinals = [
    { x: 1, z: 0 },
    { x: -1, z: 0 },
    { x: 0, z: 1 },
    { x: 0, z: -1 }
  ]
  // the preferred bearing (the yard's way) earns the first roll; the rest
  // keep the fixed cardinal order so the plan stays byte-stable
  let ordered = cardinals
  if (Number.isFinite(preferX) || Number.isFinite(preferZ)) {
    const px = Math.sign(preferX) || 0
    const pz = Math.sign(preferZ) || 0
    const pref = cardinals.find(c => c.x === px && c.z === pz)
    if (pref) ordered = [pref, ...cardinals.filter(c => c !== pref)]
  }
  const fx = Math.floor(x)
  const fz = Math.floor(z)
  for (const c of ordered) {
    const tx = fx + c.x * blocks
    const tz = fz + c.z * blocks
    const verdict = wetColumnMemoBlocked(memo, { x: tx, z: tz, y })
    if (!verdict.blocked) {
      return { shift: true, bearing: { x: c.x, z: c.z }, tx, tz, why: `shifting ${blocks}b to the fresh column ${tx},${tz} (the condemned column stays condemned)` }
    }
  }
  return { ...none, why: 'every neighbor column is condemned too - the shift stays home' }
}

// ---------------------------------------------------------------------------
// (v0.353.0) THE SEAL CROSS - the mover must not eat the seal it funded.
//
// MEASURED (fleet 36710193486, the ninth face - the calm): a wet shift armed
// perfectly - the pre-seal census ARMED, the plan buildable, the seal LANDED -
// and then the tunnel call ate the cure: 'wet shift tunnel: 2 blocks in 3s
// (stalled)' + 'wet shift stalled (tunnel done=2 ...)' with the feet still at
// home. The raw tunnel loop (the gallery machine) digs every solid feet cell
// in its path - and the seal IS a solid feet cell in its path: the v0.341.0
// pre-seal filled the step-1 fluid cell with cobblestone, the tunnel's first
// cut dug that exact cell back out, the water returned, and the shift stalled
// home having spent a landed seal and ~3s for nothing. The v0.341.0 comment's
// own law named the intent ('a landed seal turns the gate's fluid into a
// floor and the tunnel walks') - but the raw tunnel does not walk on floors,
// it digs them.
// THE CURE: when the seal landed on the feetWet shape, the wiring crosses
// BEFORE the tunnel call - jump onto the seal (the shelter's proven pacing:
// bounded rounds, a settle before the verify), the walk resumes one level up,
// and the tunnel digs FORWARD from the seal's top instead of re-digging the
// cell it stands on. The headroom law: the seal's head cell must be passable
// for the cross to land (a solid headroom is a wall the bot cannot enter -
// the walledCure class); a fluid headroom rides (standing in water on the
// seal is the climb's own wet machinery, the crossing is physics-legal); a
// box-lie headroom (box 'block' + a fluid name) refuses blind (the v0.250.0
// second-eye law). Junk never crosses (the body-guard law); the landing
// verdict is exact (the feet stand ON the seal column, one level up - a
// halfway hop or a slide-off is NOT a landing: the tunnel follows as the
// account of record, the v0.344.0 law - every refusal and every stall falls
// through byte for byte).
// ---------------------------------------------------------------------------

export const SEAL_CROSS_ROUNDS = 2
export const SEAL_CROSS_SETTLE_TICKS = 10

/**
 * Should the wet shift cross onto its own landed seal before the tunnel
 * rides (pure, junk-safe)?
 * @param {object} [p]
 * @param {boolean} [p.sealed] the pre-seal's own verify verdict (sealLanded)
 * @param {boolean} [p.feetWet] the seal aimed at the step-1 feet cell (the
 *   head-level seal leaves the walk path clear - the tunnel digs as before)
 * @param {string|null} [p.headBox] the seal's head cell boundingBox (fresh
 *   read, after the placement)
 * @param {string|null} [p.headName] the seal's head cell name (the second
 *   eye - the box lie class vetoes)
 * @returns {{cross: boolean, why: string}}
 */
export function wetShiftCrossPlan (p = {}) {
  const { sealed = false, feetWet = false, headBox = null, headName = null } = p || {} // the body-guard law (the walledCure shape)
  if (sealed !== true) return { cross: false, why: 'the seal did not land - the tunnel digs as before' }
  if (feetWet !== true) return { cross: false, why: 'the head-level seal left the walk path clear - the tunnel digs as before' }
  if (headBox === 'block') {
    if (typeof headName === 'string' && headName && tunnelFluidName(headName)) {
      return { cross: false, why: 'the seal headroom box lies (block + a fluid name) - no blind cross' }
    }
    return { cross: false, why: 'the seal headroom is solid - the cross cannot land' }
  }
  return { cross: true, why: 'the seal holds the step-1 floor - jump on, the walk resumes one level up' }
}

/**
 * Did the cross land (pure, junk-safe)? The exact verdict: the feet stand ON
 * the seal column - same x/z, one level up (a halfway hop, a slide-off or a
 * swim-past is NOT a landing - the tunnel follows as the account of record
 * and its own stall line speaks).
 * @param {object} [p]
 * @param {number} [p.toX] the feet x after the cross (floored)
 * @param {number} [p.toY] the feet y after the cross (floored)
 * @param {number} [p.toZ] the feet z after the cross (floored)
 * @param {number} [p.cellX] the seal cell x (floored, the block's own level)
 * @param {number} [p.cellY] the seal cell y
 * @param {number} [p.cellZ] the seal cell z (floored)
 * @returns {boolean}
 */
export function wetShiftCrossLanded (p = {}) {
  const { toX, toY, toZ, cellX, cellY, cellZ } = p || {} // the body-guard law
  if (![toX, toY, toZ, cellX, cellY, cellZ].every(Number.isFinite)) return false
  return toX === cellX && toZ === cellZ && toY === cellY + 1
}

// ---------------------------------------------------------------------------
// (v0.321.0) THE ROUTE REFUSAL LATCH - a bank route the memo keeps refusing
// is not asked again; the third refusal condemns the ROUTE, not just the
// climb.
//
// MEASURED (fleet 36617588210, the memo's first face): F17 entered climbOut
// through its condemned column (-133,408) 21 times across chest-ascent +
// quarry-ascent + bank-trip phases - every entry refused instantly (the
// memo worked, zero rotations) but the LADDER had no memory of its own
// route: 21 attempts, 18 walk fallbacks that also died ('no chest in
// range (24 blocks from yard)'), 'bank trip: 0 (climb refused)' cadence
// after cadence, a 45s smelt-leg HOLD inside a trip that could never
// deliver - F17 banked ZERO while the fleet banked 2295. The wasted route
// clock is the hard-kill margin's food.
// THE CURE: count the memo-refused climbs per bot (bot._routeRefusals - the
// bot object carries it across the deposit-leg and main-loop scopes, the
// _climbLedger precedent); at ROUTE_REFUSAL_LATCH_CYCLES the ascent ladders
// and the bank-trip door refuse WITHOUT the climb - the pocket mines on
// (the v0.316.0 doom latch owns the final bank's own door, byte for byte
// untouched; its climbs still COUNT here - one truth per bot). The
// threshold prices the honest ladder: first refusal records the column,
// second confirms the route (water is static, one cell never justifies a
// second grind), third condemns the route itself.
// ---------------------------------------------------------------------------

export const ROUTE_REFUSAL_LATCH_CYCLES = 3

/**
 * The route verdict for a bot about to fund another climb through its
 * bank route. Pure, junk-tolerant: latches only on a FINITE count at or
 * past the threshold; junk never latches (the body-guard law).
 * @param {object} [p]
 * @param {number} [p.refusedCycles] memo-refused climbs this bot has paid
 * @param {number} [p.latchCycles] the threshold (default ROUTE_REFUSAL_LATCH_CYCLES)
 * @returns {{latched: boolean, refused: number}} the verdict (refused echoes
 *   the sanitized count the log lines name)
 */
export function routeRefusalLatch (opts = {}) {
  // (the Number(null) lesson, ninth strike) the BODY guard, not a
  // destructuring default: routeRefusalLatch(null) would throw on the
  // destructure.
  const { refusedCycles = 0, latchCycles = ROUTE_REFUSAL_LATCH_CYCLES } = opts || {}
  const n = Number(refusedCycles)
  if (!Number.isFinite(n) || n < 0) return { latched: false, refused: 0 }
  const c = Number.isFinite(latchCycles) && latchCycles > 0 ? Math.floor(latchCycles) : ROUTE_REFUSAL_LATCH_CYCLES
  return { latched: n >= c, refused: n }
}

// ---------------------------------------------------------------------------
// (v0.76.0) THE DIG FORENSICS - a fastDig false carries TWO OPPOSITE meanings
// and the climb has treated them identically since v0.11.3.
//
// MEASURED (fleet 35721411276, master 25dff26, the v0.75.0 overhead-face
// fleet): the face cure moved the FLEET (banked=187 vs 74, climbs=11 vs 4,
// mined 2437 @ 4.06 b/s - F7 walked out at +22 levels on dug=68) but the
// overhead class SURVIVED: 52 of 55 dig failures still name the ceiling cell
// at feet+2 (3 at feet+1 = the same cell after a gravity sink), F18 held a
// STONE PICKAXE and still stalled at y=45 on dug=11 - and run71's F3 cell
// [-111,44,421] had refused the whole 600s across every bearing and retry.
// Meanwhile F7's climb dug OVERHEAD CELLS SUCCESSFULLY all the way up. Same
// packets, same server, opposite outcomes - so the refusal is NOT a protocol
// constant; it is per-cell state. The two candidate mechanisms separate by
// ONE observation nobody logs today: what does the client world say about the
// cell RIGHT AFTER the failed window?
//   (a) STALE CLIENT READ: the server broke the block but the client world
//       never applied the update (a lagging/lost section delta under 19-bot
//       CPU contention) - blockAt keeps returning the old stone forever, the
//       plan re-reads it as solid, the dig 'fails' again, the stair stalls
//       for the rest of the run (the F3/F18 signature: one cell, all
//       bearings, every retry).
//   (b) SERVER REFUSAL: the server never accepted the dig (reach/LOS/face
//       validation on the overhead cell) - the block is genuinely still
//       stone, rotation cannot help, the stair is doomed from that cell.
// THE CURE has two halves. (1) THE STALE-READ RECHECK: after a failed window,
// settle 12 ticks and re-read the cell - if the block is GONE the dig DID
// land; count it (mined++ with drops the server already spawned) and let the
// stair proceed instead of rotating into the same phantom. A genuine refusal
// still re-reads solid and refuses exactly as before - zero risk to class
// (b). (2) THE FORENSICS LINE: the surviving refusal logs held item, ground
// state and the post-settle read, so the NEXT session can split (a)-residual
// from (b) with no new theory. Pure helpers, junk-safe: mocks and headless
// callers never throw.

/** Pure: did the dig LAND, i.e. is the cell now empty? null (unloaded read)
 * and type-0 (air) both count as landed; anything else is still standing.
 * Junk-tolerant: never throws, junk reads refuse (a false negative only
 * costs the recheck, never a phantom success). */
export function isDigLanded (block) {
  if (block == null) return true
  try { return block.type === 0 } catch { return false }
}

// ---------------------------------------------------------------------------
// (v0.165.0) THE BRIDGE STEP - the support-less surface band, filled with the
// pocket's own cobble.
//
// MEASURED (run77 = 36080097477, the v0.163.0 fleet at the honest 600s; run74
// = 36082849774, the v0.164.0 fleet, same window): the final climb's dominant
// killer is no longer a dig refusal - 42 diag lines in run77 (13 in run74)
// read 'blocked toward X (dug=0)' with NO cell named, clustered at y=63-66,
// the surface water band. The missing suffix IS the anatomy: stepDigPlan
// returned 0 digs (all four step cells read empty) and no fastDig failed, so
// the only remaining blocked source is the SUPPORT check - the floor cell at
// (feet+d) is not solid (an air hole or open water). The bot stands at
// surface level on a one-cell lip with every horizontal neighbour at its own
// level open - the walkable-surface handoff (v0.37.0) refuses too (no
// walkable direction), the rotate ladder burns the fail budget on the same
// four holes, and the climb dies 'stalled': 10 of 19 final banks in run77
// ended 'still underground' with 3072u riding in pockets (banked 128 vs the
// 1718 record; run74: 5 of 19, banked 1160).
//
// THE CURE is the miner's bridge: when the step path is CLEAR and only the
// floor is missing, PLACE a block. The transport is the camp build's measured
// standing placement (v0.163.0's 'BUILT ... in 8s/13s'), NOT the pillar-jump's
// airborne self-cell shape that fleet 112 proved server-suspect: the reference
// block is always solid ground (the bot's own floor, or the pit floor under
// the support), the bot stands still, and the target cell never overlaps the
// bot's AABB. Two fills cover both geometries: 'support' (the pit floor is
// solid - fill the support cell against its UP face) and 'pit' (the pit is
// open - fill the pit level against the bot's own floor's side face; the next
// loop iteration re-judges the same bearing into the 'support' case). The
// v0.76.0 lesson governs the wiring's verify: the packet's truth is the ITEM
// LEAVING THE INVENTORY, not the client chunk read.
//
// Budget: BRIDGE_PLACE_MAX fills per climb (each ~1.5s at PILLAR_PLACE_TIMEOUT_MS,
// bounded by the climb's maxMs fence like every other spend). Junk-safe: any
// unreadable cell refuses - the legacy rotate ladder owns the level.
export const BRIDGE_PLACE_MAX = 8

// (v0.610.0) THE SUPPORT-UNDER-SELF FILL - the wall probe order for the self
// fill, deterministic, first match wins: +x, -x, +z, -z. The placement face
// rides the wall's own side normal pointing BACK into the self cell (the pit
// fill's side-face shape, mirrored).
export const BRIDGE_SELF_WALL_DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]]

export function bridgePlan ({ feet, d, read, items = null, placed = 0, maxPlaced = BRIDGE_PLACE_MAX } = {}) {
  const done = Number.isFinite(placed) && placed > 0 ? Math.floor(placed) : 0
  const cap = Number.isFinite(maxPlaced) && maxPlaced > 0 ? Math.floor(maxPlaced) : BRIDGE_PLACE_MAX
  if (done >= cap) return { ok: false, why: `the bridge budget is spent (${done}/${cap})` }
  const item = pickPillarBlock(items)
  if (!item) return { ok: false, why: 'no placeable block in the pocket' }
  if (!feet || !d || typeof feet.offset !== 'function' || typeof read !== 'function') {
    return { ok: false, why: 'no geometry read' }
  }
  const rd = cell => { try { return read(cell) } catch { return null } }
  const ownFloor = rd(feet.offset(0, -1, 0))
  if (!ownFloor || ownFloor.boundingBox !== 'block') {
    // (v0.610.0) THE SUPPORT-UNDER-SELF FILL - the v0.608.0 book's priced cure,
    // measured on face 37188370162: the floor class owned 54% of 125 refusals
    // ('the bot stands over its own hole') and every one burned the rotate
    // ladder's fail budget while the pocket held cobble. The bridge's own
    // support geometry applies to the SELF cell: the self floor cell reads
    // empty or fluid (the lake precedent - water is replaceable) and a hole
    // WALL reads solid -> fill the self floor against the wall's side face
    // (the pit fill's side-face shape; the target cell sits BELOW the feet -
    // it never overlaps the bot's AABB, the standing-placement transport
    // holds). The step re-judges on the next loop with solid ground underfoot.
    // No wall / an unreadable or junk self cell -> the legacy refusal byte for
    // byte (the truly open void and the chunk-desync class stay the rotate
    // ladder's). Call-site contract (v0.165.0): the bridge runs only when the
    // step path is clear - the fill converts the floor class, the dig ladder
    // had its chance.
    if (ownFloor && (ownFloor.boundingBox === 'empty' || ownFloor.boundingBox === 'fluid')) {
      for (const w of BRIDGE_SELF_WALL_DIRS) {
        const wall = rd(feet.offset(w[0], -1, w[1]))
        if (wall && wall.boundingBox === 'block') {
          // (the -0 lesson) 0 - w[n], never -w[n]: a mirrored zero must read
          // +0 - the deep pins and the Vec3 wire both distinguish -0
          return {
            ok: true, kind: 'self',
            cell: feet.offset(0, -1, 0), refCell: feet.offset(w[0], -1, w[1]),
            face: { x: 0 - w[0], y: 0, z: 0 - w[1] }, item, placedNext: done + 1
          }
        }
      }
    }
    return { ok: false, why: 'no solid floor underfoot' }
  }
  const step = rd(feet.offset(d.x, 1, d.z))
  const step2 = rd(feet.offset(d.x, 2, d.z))
  const clear = b => !!b && b.boundingBox === 'empty'
  if (!clear(step) || !clear(step2)) return { ok: false, why: 'the step cells are not clear (the dig ladder owns this level)' }
  const support = rd(feet.offset(d.x, 0, d.z))
  if (support && support.boundingBox === 'block') return { ok: false, why: 'the support is already solid' }
  const below = rd(feet.offset(d.x, -1, d.z))
  if (below && below.boundingBox === 'block') {
    return {
      ok: true, kind: 'support',
      cell: feet.offset(d.x, 0, d.z), refCell: feet.offset(d.x, -1, d.z),
      face: { x: 0, y: 1, z: 0 }, item, placedNext: done + 1
    }
  }
  if (below && (below.boundingBox === 'empty' || below.boundingBox === 'fluid')) {
    return {
      ok: true, kind: 'pit',
      cell: feet.offset(d.x, -1, d.z), refCell: feet.offset(0, -1, 0),
      face: { x: d.x, y: 0, z: d.z }, item, placedNext: done + 1
    }
  }
  return { ok: false, why: 'the pit floor reads unknown' }
}

// (v0.168.0) THE BRIDGE REFUSAL RETRY - run78 (36091731878, the v0.167.0 union
// @ the honest 600s) measured the refusal class as TRANSIENT, not permanent
// geometry: 7 'server refused the (support|pit) fill' lines, 7 distinct cells
// (no repeats), 4 of 7 riding a pit fill placed the TICK before (the support
// fill's reference IS the just-placed block, one cell farther from the bot),
// and the F16 cell [-113,64,384] refused at ts~701s placed FINE on a later
// visit. The recheck window (ticks) mirrors the climb dig's stale recheck: a
// late block update or a lost place packet converts on the re-look instead of
// burning the rotate ladder's fail budget.
export const BRIDGE_RECHECK_TICKS = 12

/** (v0.168.0) Pure: the bridge fill's own verify - the placement landed iff
 * the target cell reads solid OR the item left the inventory (the v0.76.0
 * doctrine governs: the packet's truth is the ITEM LEAVING THE INVENTORY,
 * never the client chunk read alone; a stale client world with a dropped item
 * is a LANDED fill the same way a fresh chunk read with a full pocket is a
 * phantom). Junk-safe: junk reads are false, never a throw. */
export function bridgeFillLanded ({ postBlock = null, before = null, after = null } = {}) {
  try {
    if (postBlock && postBlock.boundingBox === 'block') return true
    if (Number.isFinite(before) && Number.isFinite(after) && after < before) return true
  } catch { /* junk geometry is a false, not a crash */ }
  return false
}

/** (v0.168.0) Pure: the forensics suffix for a SURVIVING bridge refusal -
 * what the bot held, how far the fill cell sits (the reach suspect: the
 * two-fill's second fill is always ~1 block farther than the first, and the
 * vanilla server's place reach is finite), what the REFERENCE block read at
 * place time (a null/missing read is the stale self-placed-reference suspect:
 * 4 of run78's 7 refusals used a reference placed the tick before), and what
 * the post-retry re-read says. Splits (a) reach refusals (d large), (b) stale
 * reference (ref=null-read), (c) genuine server refusals (post STILL OPEN) in
 * the NEXT fleet's log without a new theory. Junk-safe: placeholders instead
 * of throws - the dig refusal's digRefusalDetail doctrine at the bridge's own
 * geometry. */
export function bridgeRefusalDetail ({ heldName = null, dist = null, refName = null, postName = null, postLanded = null } = {}) {
  const held = typeof heldName === 'string' && heldName ? heldName : 'n/a'
  const d = Number.isFinite(dist) ? `${dist.toFixed(1)}b` : 'd?'
  const ref = typeof refName === 'string' && refName ? refName : 'null-read'
  let post
  if (postLanded === true) post = `post=${typeof postName === 'string' && postName ? postName : 'block'} LANDED (late block update)`
  else if (postLanded === false) post = `post=${typeof postName === 'string' && postName ? postName : '?'} STILL OPEN (refused twice)`
  else post = 'post=? (re-read failed)'
  return `held=${held}, ${d}, ref=${ref}, ${post}`
}

/** Pure: the forensics suffix for a SURVIVING dig refusal - what the bot held,
 * whether it stood on ground, and what the post-settle re-read says. Every
 * field is optional; junk reads print 'n/a'/'?' placeholders instead of
 * throwing. The line exists to split stale-client (a) from server-refusal
 * (b) in the next fleet's log, without a new theory. */
export function digRefusalDetail ({ heldName = null, onGround = null, postName = null, postLanded = null } = {}) {
  const held = typeof heldName === 'string' && heldName ? heldName : 'n/a'
  const ground = onGround === true ? 'grounded' : (onGround === false ? 'airborne' : 'ground?')
  let post
  if (postLanded === true) post = `post=${typeof postName === 'string' && postName ? postName : 'air'} LANDED (stale client read)`
  else if (postLanded === false) post = `post=${typeof postName === 'string' && postName ? postName : '?'} STILL THERE (server never broke it)`
  else post = 'post=? (re-read failed)'
  return `held=${held}, ${ground}, ${post}`
}

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
 *           |{ok: false, digs: Array, blocked: true, blockedWet: boolean, reason: string,
 *              blockedCell?: number[], blockedName?: string}}
 *   digs lists the solid cells to fastDig THIS pass, top-down (head+2, head+1,
 *   step+2, step+1); an already-clear step returns ok with digs: []. blocked
 *   means a fluid/undiggable/unknown cell (or the budget) refuses the step -
 *   blockedWet mirrors the old wet flag for the caller's wet-escape policy.
 *   (v0.32.0) a refusal also names its cell: blockedCell is the refusing
 *   offset [dx,dy,dz] and blockedName the block name there ('null' for an
 *   unloaded/unknown read) - the fleet's 'blocked toward X,Z (dug=0)' diag
 *   lines never said WHICH cell refused or what sat in it, and four bearings
 *   of dug=0 refusals were indistinguishable from four different causes.
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
      return { ok: false, digs, blocked: true, blockedWet: isWetCell(b), reason: verdict === 'dig' ? 'dig budget' : 'stop',
        blockedCell: [dx, dy, dz], blockedName: b && b.name ? b.name : 'null' }
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

// (v0.35.0) TUNNEL WALL-CLOCK BUDGET - the 390-second silent tunnel.
//
// MEASURED (fleet dispatch 35562867668, d66ef6a): F2 entered a steered branch
// tunnel at ~t-400s and the call did not return until the deadline - 390 s for
// ONE block. The loop had no wall clock: `stalls < 4` is the only non-progress
// exit, and the two skeletons harrying the bot ("combat: fighting skeleton ...
// 2 nearby") SHOVED it every physics second - each shove resets the stall
// counter (moved=true), so a bot that is chased around an open pocket never
// accumulates stalls and never digs either. Every one of those 390 s was also
// stolen from the v0.33/v0.34 bank-trip gate that sits AFTER the tunnel call
// in the fleet loop - the trips never fired because the loop never got there.
//
// The guard is deliberately DUAL:
//   - maxMs: a hard wall clock no harassment can defeat (60 s is ~4x a healthy
//     12-block tunnel; the wet-escape TRAVERSE_MAX_MS precedent is 20 s);
//   - diglessIters: loop iterations since the last successful dig - a tunnel
//     that keeps stepping into air/refused cells without cutting anything is
//     already dead, mobs or no mobs (8 iterations at ~12-14 ticks each is
//     well under 20 s of honest non-progress).
// The caller keeps its rotation policy; the ONLY behavior change is that the
// tunnel now ENDS and says why instead of eating the rest of the run.
export const TUNNEL_MAX_MS = 60000
export const TUNNEL_DIGLESS_LIMIT = 8

/**
 * Pure stop decision for the raw branch tunnel loop (src/bots/miner.mjs).
 * Order matters and mirrors the loop: a finished tunnel is never 'stalled',
 * an external stop always wins over accounting, and the budget check runs
 * BEFORE the stall check (a chased bot accumulates no stalls but does burn
 * wall clock).
 * @param {{done?: number, maxBlocks?: number, stalls?: number, stallLimit?: number,
 *   diglessIters?: number, diglessLimit?: number, elapsedMs?: number, maxMs?: number,
 *   stopRequested?: boolean, alive?: boolean}} s
 * @returns {string|null} 'no entity' | 'shouldStop' | 'budget' | 'digless' |
 *   'stalled' | null (null = keep digging)
 */
export function tunnelStopReason ({ done = 0, maxBlocks = 12, stalls = 0, stallLimit = 4, diglessIters = 0, diglessLimit = TUNNEL_DIGLESS_LIMIT, elapsedMs = 0, maxMs = TUNNEL_MAX_MS, stopRequested = false, alive = true } = {}) {
  if (!alive) return 'no entity'
  if (stopRequested) return 'shouldStop'
  if (done >= maxBlocks) return null // the healthy exit - no reason to report
  const safeMaxMs = Number.isFinite(maxMs) && maxMs > 0 ? maxMs : TUNNEL_MAX_MS
  if (elapsedMs >= safeMaxMs) return 'budget'
  const safeDigless = Number.isFinite(diglessLimit) && diglessLimit > 0 ? diglessLimit : TUNNEL_DIGLESS_LIMIT
  if (diglessIters >= safeDigless) return 'digless'
  const safeStall = Number.isFinite(stallLimit) && stallLimit > 0 ? stallLimit : 4
  if (stalls >= safeStall) return 'stalled'
  return null
}

// ---- v0.240.0: THE TUNNEL ZERO VERDICT ----
// (v0.242.0) THE FLUID NAME LAW appended below - MEASURED (run36314614666, the
// v0.241.0 field): the preflight fired ZERO water-locks while the tunnels ate 23
// '[names gate water]' zeros, because the 26.2 registry gives water/lava
// boundingBox "empty" (water id 35, lava id 36 - verified in the vendored
// blocks.json), so EVERY boundingBox==='fluid' read is blind to 26.2 fluids.
// The law: a cell is fluid when its boundingBox says so OR its NAME is the
// drowning law's water family (drowning.mjs WATER_NAMES / isWaterName - kelp,
// seagrass, bubble_column included, the v0.241.0 blind spot's exact shape).
// MEASURED (run36310927991, the v0.239.1 relay field debut): 13 iron/copper
// steers were announced, every steered tunnel landed done=0 in the water-table
// band, and the veins burned in veerSkipped - raw_iron read ZERO for the whole
// run, the relay (v0.239.0) never saw a fragment, and the famine root was
// INVISIBLE because tunnel()'s first-cut breaks are all silent (the fluid break,
// the gravity roof fence, the names gate). tunnelStopReason names the ACCOUNTING
// stops (budget/digless/stalled) but the silent breaks end the loop without a
// word. One classifier, one source of truth: the caller passes the cell reads it
// already holds and the verdict names the gate. Priority mirrors the loop order
// (fluid 2533 -> roof 2544 -> names 2550) so a compound read resolves the way the
// loop would have broken.
/**
 * Pure zero-verdict classifier for the raw branch tunnel loop (src/bots/miner.mjs).
 * Each break site passes only the reads it holds; the classifier fills the rest
 * with nulls, so a site's call cannot cross-classify.
 * (v0.242.0) THE FLUID NAME LAW: the fluid branch reads NAMES too - the 26.2
 * registry's water/lava carry boundingBox "empty" (water id 35, lava id 36), so
 * a name-blind fluid branch let 23 water feet cells reach the names gate as
 * '[names gate water]' (run36314614666) while the truth was a plain fluid break.
 * isWaterName is the drowning law's canonical water family (kelp, seagrass and
 * bubble_column included) - a fluid-family name outranks the names gate.
 * @param {{feetBox?: string|null, headBox?: string|null, feetName?: string|null,
 *   headName?: string|null, names?: string[]|null, roofOk?: boolean|null,
 *   roofWhy?: string|null}} r
 * @returns {string|null} 'fluid ahead' | the roof's own why | 'names gate <block>'
 *   | null (no silent break holds - the stop was tunnelStopReason's business)
 */
export function tunnelZeroWhy (r = {}) {
  const { feetBox = null, headBox = null, feetName = null, headName = null, names = null, roofOk = null, roofWhy = null } = r || {} // (the v0.81.0 body-guard law: pickOreTarget(null) threw on the destructure itself)
  if (feetBox === 'fluid' || headBox === 'fluid' || tunnelFluidName(feetName) || tunnelFluidName(headName)) return 'fluid ahead'
  if (roofOk === false) return roofWhy || 'gravity roof refused'
  if (Array.isArray(names) && feetName && !names.includes(feetName)) return `names gate ${feetName}`
  return null
}

/**
 * The steer preflight behind the runner's water-locked stand-off (v0.240.0): the
 * step-1 cell ALONG the steer axis is fluid (feet or head), so the gallery's first
 * cut is the water-table break - the vein sits behind live water and the steered
 * tunnel can only land done=0 there. The runner stands off (the blind rotation
 * owns the pass) instead of burning a 0-block steered tunnel at the wall.
 * (v0.242.0) THE FLUID NAME LAW: the 26.2 registry's water boundingBox is
 * "empty" (water id 35, lava id 36 - run36314614666 measured the v0.241.0
 * preflight firing ZERO locks while the tunnels ate 23 '[names gate water]'
 * zeros), so the box check alone is blind; the NAME is the law's second eye
 * (isWaterName - the drowning family, kelp/seagrass/bubble_column included).
 * @param {{feetBox?: string|null, headBox?: string|null, feetName?: string|null,
 *   headName?: string|null}} r
 * @returns {boolean} true = the steer line opens on fluid, the vein is water-locked
 *   from this stance
 */
export function steerFluidLock (r = {}) {
  const { feetBox = null, headBox = null, feetName = null, headName = null } = r || {} // the body-guard law - a null read is a dry read, never a throw
  return feetBox === 'fluid' || headBox === 'fluid' || tunnelFluidName(feetName) || tunnelFluidName(headName)
}

// ---- v0.244.0: THE SEAL CENSUS LAW ----
// run36317889503 (the v0.242.0 field face) woke the water-lock preflight: 7
// firings, every one on the metal/coal ladder's ore, each ending 'the blind
// rotation owns this pass' - and the famine stayed at the ore THREE runs
// straight (the census 11x 'chest holds 0 ingot(s) + 0 raw_iron'). The decode
// named the frontier: the next cure must make the ore REACHABLE (the
// seal-and-cross class - a block placed into the step-1 fluid cell turns the
// water table into a floor). But a fleet-wide cure needs the field's first
// answer: HOW OFTEN does the standing bot even carry a sealable block when
// the lock fires? The relay saga's canon: telemetry before cure. sealCensus
// is the pure arm of that answer - given the fluid name and the bot's pocket
// names it verdicts water (sealable, the classic dirt-into-water floor) vs
// lava (never armed - a mis-placed block in live lava burns the bot's feet
// and the ore behind it) and counts the sealable stock (SEAL_BLOCK_NAMES:
// the common dig yields - dirt, cobblestone, deepslate family, stone, the
// granites; sand excluded: it falls, the seal washes out; gravel excluded
// for the same gravity reason). Pure, junk-safe (null names = a bare pocket,
// never a throw); the fleet wiring reads inventory.items() name/count pairs
// straight into it. The field line arms the next fire's decision: blocks in
// pocket -> the placement cure is real; bare pocket -> the cure must FIRST
// bring stock (the torch-famine class - the material must ride with the bot).
const SEAL_BLOCK_NAMES = new Set([
  'dirt', 'coarse_dirt', 'grass_block', 'cobblestone', 'stone', 'deepslate',
  'cobbled_deepslate', 'diorite', 'granite', 'andesite', 'tuff', 'netherrack',
  'sandstone', 'mud'
])

/**
 * The seal-and-cross arm census (v0.244.0): CAN this water-locked stance be
 * cured by placing a block into the step-1 fluid cell, and with what stock?
 * @param {{fluidName?: string|null, fluidNames?: Array<string|null>|null,
 *   pocket?: Array<{name?: string, count?: number>}|null}} r
 *   fluidName(s) - the step-1 fluid block's name(s) (the law's second eye
 *   already named them); the first name that classifies wins; pocket - the
 *   bot's inventory items (name/count pairs), null-safe
 * @returns {{fluid: 'water'|'lava'|null, sealable: boolean, blocks: number,
 *   top: string|null}} fluid null = not a tunnel fluid (caller never counts
 *   this); lava = a seal is NOT armed (live lava burns the placement);
 *   water + blocks>0 = the placement cure is real, top names the richest
 *   sealable stack; blocks 0 = the pocket is bare - the cure must bring stock
 */
export function sealCensus (r = {}) {
  const { fluidName = null, fluidNames = null, pocket = null } = r || {} // the body-guard law
  let fluid = null
  for (const n of [...(Array.isArray(fluidNames) ? fluidNames : []), fluidName]) {
    if (n == null) continue
    if (isWaterName(n)) { fluid = 'water'; break }
    if (SHAFT_FLUID_NAMES.has(n)) { fluid = 'lava'; break }
  }
  if (fluid === null) return { fluid: null, sealable: false, blocks: 0, top: null }
  const stock = new Map()
  let blocks = 0
  for (const it of Array.isArray(pocket) ? pocket : []) {
    const n = it && typeof it.name === 'string' ? it.name : null
    const c = it && Number.isFinite(it.count) ? it.count : (n ? 1 : 0)
    if (n && SEAL_BLOCK_NAMES.has(n) && c > 0) {
      stock.set(n, (stock.get(n) ?? 0) + c)
      blocks += c
    }
  }
  let top = null
  for (const [n, c] of stock) if (top === null || c > (stock.get(top) ?? 0)) top = n
  return { fluid, sealable: fluid === 'water' && blocks > 0, blocks, top }
}

// ---- v0.245.0: THE SEAL GEOMETRY LAW ----
// The census (v0.244.0) answered the canon's first question - DOES the bot
// carry sealable stock when the lock fires - but the placement cure has a
// second precondition the census cannot see: GEOMETRY. A block placed into
// the step-1 fluid cell needs (a) an ANCHOR - a solid face adjacent to the
// target cell the placement clicks (the tunnel floor under the fluid is the
// natural one; a fluid or air cell below offers no face and the class moves
// to pillar-up territory), and (b) HEADROOM - the cell the bot's body needs
// after hopping the new seal (a solid cell above the seal makes the seal a
// WALL, not a floor - the dig-around class, not the cross). sealPlan is the
// pure arm of that answer: given the anchor and headroom reads it verdicts
// 'buildable' (anchor solid + headroom clear - the dirt-into-water floor the
// frontier wants), 'unanchored' (no face to click against), 'walled' (the
// seal becomes a wall) and 'unknown' (a blind read - the chunk was not
// loaded; the field line says so instead of inventing geometry). The eyes
// follow the v0.242.0 FLUID NAME LAW: the box is the first eye, the name the
// second (the 26.2 registry ships water with boundingBox 'empty', so a fluid
// anchor hides behind an 'empty' box and only the name unmasks it); a fluid
// headroom name is CLEAR (the hop lands swimming, the breathing program owns
// it) while a named non-fluid with a blind box is SOLID (conservative - the
// field line reads 'walled' and the next decode can soften it with data).
// Lava never reaches here in the wiring (the census refuses it first and the
// placement burns, not seals) - the geometry stays fluid-agnostic by
// construction. Junk-safe: bare calls, null reads and junk never throw.
/**
 * The seal-and-cross geometry verdict (v0.245.0): CAN the standing bot place
 * a block into the step-1 fluid cell from where it stands?
 * @param {{anchorName?: string|null, anchorBox?: string|null,
 *   headroomName?: string|null, headroomBox?: string|null}} r
 *   anchor - the block BELOW the fluid cell (the placement face the bot
 *   clicks); headroom - the cell ABOVE the fluid cell (the bot's body after
 *   the hop). Box is the first eye, name the second (the 26.2 law).
 * @returns {{plan: 'buildable'|'walled'|'unanchored'|'unknown',
 *   anchor: boolean, headroom: boolean}} plan 'buildable' = the seal-and-cross
 *   is real geometry from this stance; 'unanchored' = no face to click
 *   (pillar-up class); 'walled' = the seal makes a wall (dig-around class);
 *   'unknown' = a blind read - the field line reports it, never invents.
 */
export function sealPlan (r = {}) {
  const { anchorName = null, anchorBox = null, headroomName = null, headroomBox = null } = r || {} // the body-guard law
  let anchor = null // true = a solid face to click, false = open (fluid/air), null = unreadable
  if (anchorBox === 'block') anchor = true
  else if (anchorBox === 'empty') anchor = false
  else if (typeof anchorName === 'string' && anchorName) anchor = !tunnelFluidName(anchorName) // the second eye - a fluid anchor hides behind a blind box
  let headroom = null // true = the body fits after the hop, false = solid, null = unreadable
  if (headroomBox === 'block') headroom = false
  else if (headroomBox === 'empty') headroom = true
  else if (typeof headroomName === 'string' && headroomName) headroom = tunnelFluidName(headroomName) // a wet headroom is passable - the hop lands swimming
  if (anchor === null || headroom === null) return { plan: 'unknown', anchor: anchor === true, headroom: headroom === true }
  if (!anchor) return { plan: 'unanchored', anchor: false, headroom }
  if (!headroom) return { plan: 'walled', anchor: true, headroom: false }
  return { plan: 'buildable', anchor: true, headroom: true }
}

// ---- v0.247.0: THE SEAL-AND-CROSS CROSSING ----
// run36323193851 (the census debut, mined by the 2230 lane) answered the canon's
// first question with a shout: 16/16 water-locked firings were ARMED (bare 0,
// lava 0, top cobblestone/granite/andesite - the material RIDES with the bot).
// The geometry face answers the second. THE CANON IS SATISFIED: the placement
// cure ships - gated ON the two telemetry arms, never around them. The crossing
// is the shelter's proven seal pattern (sealWaitUnseal, field-proven pacing:
// 5 ticks before the click, 10 before the verify) pointed at the step-1 fluid
// cell instead of the shelter entrance: equip the richest sealable stack, place
// against the anchor's top face, verify the cell went solid, and on a landed
// seal the steered line RESUMES (the vein is reachable - the stand-off never
// fires, the vein never burns). Two pure arms keep the wiring honest:
// sealCrossTarget - the placement geometry (feet-level fluid: the target is the
// step-1 feet cell, the anchor is the floor below it; head-level fluid: the
// target is the step-1 head cell, the anchor is the solid feet cell under it -
// in BOTH cases the face is the anchor's UP face, one shape, one law);
// sealLanded - the verify (the cell stopped reading fluid: the box speaks
// first, the name is the second eye per the v0.242.0 law; a blind read is
// NOT a landed seal - one attempt per firing, the next firing re-reads).
// SEAL_PLACE_TIMEOUT_MS caps one placeBlock call at 3s (the PILLAR lesson:
// a rejected placement resolves slow in mineflayer - it waits for a
// block-update event that never comes); two rounds with the shelter's pause
// between (the entity-occupied-cell rejection the shelter measured live).
export const SEAL_PLACE_TIMEOUT_MS = 3000

// SEAL_DIG_TIMEOUT_MS caps one dig of the walled headroom at 8s (the same
// PILLAR lesson shapes it: a dig that resolves slow must not eat the pass).
// A picked stone-family headroom lands in ~1s; the cap exists for the
// surprise-hard classes (the legacy standoff owns those - the vein waits
// out the amnesia cap, the pass keeps moving).
export const SEAL_DIG_TIMEOUT_MS = 8000

/**
 * Should the walled seal dig its headroom first (pure, the v0.250.0 THE
 * WALLED DIG-AROUND)? The geometry face + the crossing face pooled the
 * walled evidence (4 firings: 3 walled in the geometry face's split, 1 in
 * the crossing face - every one kept the legacy standoff byte for byte and
 * the vein burned). The walled verdict reads: anchor solid (a face to
 * click), headroom SOLID (the seal becomes a wall the bot cannot enter).
 * But a solid headroom is a BLOCKER, not a fate: the headroom cell is
 * ordinary gallery stone in every observed firing - dig it, re-plan, and
 * the buildable seal may follow. The gates (the two-eye law, the v0.242.0
 * canon): the plan must BE the walled class; the headroom box must speak
 * 'block' (a blind box digs nothing blind - the honest no); a headroom
 * NAME that reads fluid vetoes the dig (the box lie class - 26.2 fluids
 * carry 'empty' boxes, so 'block' + a fluid name is a stale/contradictory
 * read, never a dig target). Junk discipline: the body-guard `r || {}`;
 * a junk/missing plan is not the walled class; junk names are silent (the
 * box speaks first, the name is the second eye - only a REAL fluid name
 * vetoes).
 *
 * @param {object} [r]
 * @param {{plan?: string}|null} [r.plan] the sealPlan verdict (its .plan
 *   field must read exactly 'walled')
 * @param {string|null} [r.headroomName] the headroom cell's block name
 * @param {string|null} [r.headroomBox] the headroom cell's boundingBox
 * @returns {{dig: boolean, why: string}} the cure decision + the decode
 *   ready why (the refusal lines print it verbatim)
 */
export function walledCure (r) {
  const { plan = null, headroomName = null, headroomBox = null } = r || {} // the body-guard law
  if (!plan || plan.plan !== 'walled') {
    return { dig: false, why: 'not the walled class' }
  }
  if (headroomBox !== 'block') {
    return { dig: false, why: 'the headroom box does not speak solid - no dig blind' }
  }
  if (typeof headroomName === 'string' && headroomName && tunnelFluidName(headroomName)) {
    return { dig: false, why: 'the headroom name reads fluid - the box lie class, no dig' }
  }
  return { dig: true, why: 'the headroom is solid and dry - dig it, re-plan, and the buildable seal may follow' }
}

// (v0.369.0) THE ANCHOR DROP - the unanchored seal earns its floor.
//
// MEASURED (face 36733939481, face 12): the wet shift armed, the census
// ARMED, and the pre-seal plan refused the class the canon never cured:
// 'anchor open, headroom solid - the seal is unanchored' - zero cross lines,
// the LANDED leg starved. Face 12's OTHER read starved it deeper: the wet
// shifts that never even armed died at the tunnel gate (done=0 fluid-ahead)
// or the budget - but the UNANCHORED class is the one the cross arms can
// never survive, and it is a BLOCKER, not a fate (the v0.250.0 walled
// lesson): the anchor cell below the target is OPEN (a fluid or air column
// - the flooded step's floor is the water itself), and the HOME column owns
// a solid cell at the anchor's own level - the floor the bot stands on.
// That cell is face-adjacent to the anchor (the bearing is single-axis by
// construction - the four canonical shifts), so the bot can CLICK its face
// and land a sealable block INTO the anchor cell: the column grows a floor,
// the anchor goes solid, and the seal re-plans - 'buildable' rides the
// existing placement, the cross gets its chance, the LANDED leg unstarves.
// The gates (the two-eye law): the plan must BE the unanchored class; a
// solid anchorBox contradicts the plan (the box lie class - no blind drop);
// a solid anchor NAME contradicts it too (the second eye - only a REAL
// solid name vetoes; a fluid name rides, a blind name rides - air and
// water both take the placement). Junk never drops (the body-guard law).
// One drop round, ANCHOR_DROP_TIMEOUT_MS capped (the PILLAR lesson); the
// verify is sealLanded on the anchor cell (the honest read, never guess);
// every refusal falls through to the gate keeping the cell byte for byte.

/** The anchor drop's place cap: one placeBlock call (the SEAL_PLACE law - a rejected placement resolves slow). */
export const ANCHOR_DROP_TIMEOUT_MS = 3000

/**
 * Should the unanchored seal drop its own anchor first (pure, junk-safe)?
 * @param {object} [r]
 * @param {{plan?: string}|null} [r.plan] the sealPlan verdict (its .plan
 *   field must read exactly 'unanchored')
 * @param {string|null} [r.anchorName] the anchor cell's block name (the
 *   second eye)
 * @param {string|null} [r.anchorBox] the anchor cell's boundingBox (the
 *   first eye)
 * @returns {{drop: boolean, why: string}} the drop decision + the decode
 *   ready why (the log lines print it verbatim)
 */
export function anchorDrop (r = {}) {
  const { plan = null, anchorName = null, anchorBox = null } = r || {} // the body-guard law
  if (!plan || plan.plan !== 'unanchored') {
    return { drop: false, why: 'not the unanchored class' }
  }
  if (anchorBox === 'block') {
    return { drop: false, why: 'the anchor box speaks solid - the plan lied, no blind drop' }
  }
  if (typeof anchorName === 'string' && anchorName && !tunnelFluidName(anchorName)) {
    return { drop: false, why: 'the anchor name reads solid - the second eye vetoes the drop' }
  }
  return { drop: true, why: 'the anchor cell is open - drop a block into it, the seal re-plans on a floor' }
}

/**
 * The crossing's placement geometry (v0.247.0): which cells does the seal
 * touch, from the runner's stand position?
 * @param {{feetWet?: boolean}} r feetWet = the fluid cell sits at feet level
 *   (the runner's own classification, the same eye the wiring already reads)
 * @returns {{targetDy: number, anchorDy: number, face: {x: number, y: number, z: number}}}
 *   targetDy/anchorDy are relative to the step-1 column (steerStep applied by
 *   the caller); face is the anchor face the placement clicks - always UP.
 */
export function sealCrossTarget (r = {}) {
  const { feetWet = false } = r || {} // the body-guard law - a bare call reads the head-level shape
  const targetDy = feetWet === true ? 0 : 1 // STRICT: only a true boolean is a wet eye - junk reads the documented bare-call shape
  return { targetDy, anchorDy: targetDy - 1, face: { x: 0, y: 1, z: 0 } }
}

/**
 * Did the seal land (v0.247.0)? The verify after the placement: the target
 * cell stopped being fluid.
 * @param {{afterName?: string|null, afterBox?: string|null}} r the cell read
 *   AFTER the placement attempt (blockAt on the target cell)
 * @returns {boolean} true = the cell reads solid (box 'block', or a blind box
 *   with a non-fluid name - the second eye); false = still fluid/air, or a
 *   blind read (never guess a landed seal)
 */
export function sealLanded (r = {}) {
  const { afterName = null, afterBox = null } = r || {} // the body-guard law
  if (afterBox === 'block') return true
  if (afterBox === 'empty') return false
  if (typeof afterName === 'string' && afterName) return !tunnelFluidName(afterName)
  return false
}

// ---- v0.70.0: THE CLIMB-RESCUE OWNERSHIP GATE ----
// MEASURED (run67, dispatch 35692049905, the v0.69.1 600s fleet): the blackbox
// freeze dump read 'climb @+0.0s <- water:rescue @+-1.9s' - a climbOut STARTED
// 1.9s into a live rescue. Two owners held the same bot: the rescue swam the
// controls while the staircase loop dug and jumped underneath it - the v0.62.0
// digShaft dual-owner class, one level up. The polarity is already fixed by
// v0.17.0: a wet-escape traverse (bot._climbEscape) makes the SENTRY yield
// because the escape IS the way out. This gate is the mirror edge: a LIVE
// rescue (bot._waterRescue) makes the CLIMB yield - the rescue's shore swim or
// standing-wet policy owns the exit, and a climb that fights it re-dives the
// bot into the very column the rescue is leaving. Pure so the matrix is
// pinnable; the wiring is one refusal at climbOut entry (the 'exhausted'
// refusal shape the callers already handle).
/**
 * Who owns the bot right now? Pure, junk-safe.
 * @param {{waterRescue?: boolean, climbEscape?: boolean}} s live ownership flags
 * @returns {{refuse: boolean, reason: string}} refuse=true means the caller
 *   must NOT start a climb (the rescue owns the controls); reason names it for
 *   the caller's log line.
 */
export function climbOwnerGate (s = {}) {
  const waterRescue = s && s.waterRescue
  const climbEscape = s && s.climbEscape
  if (waterRescue === true && climbEscape !== true) {
    return { refuse: true, reason: 'rescue owns the bot' }
  }
  return { refuse: false, reason: '' }
}
