// THE RE-LOOT PLAN (v0.200.0): the death economy's pure core.
//
// MEASURED (run63-mined, fleet 36212235363, the v0.199.0 tree's field day):
// 4 deaths, and the v0.199.0 death-drop line named EVERY pocket at the death
// event - 'F12 death drop: ~84u lost at [-195,59,405]', 'F7 ~62u at
// [-138,52,420]', 'F7 ~48u at [-137,64,424]', 'F13 ~33u at [-89,64,379]' -
// ~227u scattered across one 600s run. THE TIMELINE IS THE INDICTMENT: the
// drops landed at t-176s and t-131s, vanilla despawn is 300s, so every stack
// SURVIVED PAST THE RUN'S END (t-176 + 300 = t+124) - nobody picked them up,
// the death-spot memory (v0.84.0) steers every bot AWAY from the corpse, and
// the ledger's unaccounted=0 hid the loss inside the conversion formula's
// slack (accounted 3045 > mined 2649: pockets count crafted/collected units
// the mined counter never tracks). The death economy cure is a WALK: the
// respawned bot returns to its OWN death spot and re-collects its own drops
// while they still exist.
//
// This module is the PURE decision surface for that walk - no bot, no
// pathfinder, no log. The wiring (a post-respawn lane that aims GoalNear at
// the plan's goal and aborts on arrival-with-no-items) is its own fire: a
// walk lane mis-wired into a 4271-line miner eats mining time (the
// sweep-drop timeout lessons), so the plan lands first, fully unit-tested,
// and the field debut rides the next lane.
//
// The fences, each named for the lesson that owns it:
//   no-spot    - junk spot/deathAt/botPos: junk never arms a walk (the
//                gates-decide convention; silence is never evidence, so the
//                refusal CARRIES its why to the log).
//   attempted  - one walk per death (the retry-storm fence, the v0.82.0
//                REPEAT_PAGE lesson: a lane that re-arms on failure burns
//                its budget re-failing at the same cell).
//   expired    - the drops despawn at deathAt + RELOOT_DESPAWN_MS (vanilla
//                300s); past that the walk digs up an empty cell.
//   no-bot     - the bot's own position unreadable: the distance cannot be
//                measured, so the budget cannot be bounded.
//   too-far    - beyond RELOOT_MAX_DIST the walk exceeds the house walk-cap
//                envelope (WALK_CAP_MS 32s / 250ms per block = 128 blocks) -
//                the v0.11.2 OOM lesson forbids an open-ended leash, and a
//                re-loot that cannot converge inside the cap is the doomed
//                class by construction.
//   no-time    - budget + margin must fit the remaining despawn window: a
//                walk that lands after the despawn is a wasted trip AND a
//                wasted walk (the dusk wire's fence (b) arithmetic).
// The margin (RELOOT_MARGIN_MS 30s) is the same overrun class the dusk wire
// carries (DUSK_BANK_MARGIN_MS): measured yard-walk overruns, detours around
// the hazards that killed the bot in the first place.

import { walkBudgetMs } from './tripplan.mjs'

/** Vanilla item despawn: drops vanish 300s after they land. */
export const RELOOT_DESPAWN_MS = 300000
/** Walk envelope: WALK_CAP_MS (32s) / WALK_PER_BLOCK_MS (250ms) = 128 blocks.
 * Past this the walk cannot converge inside the house's bounded-budget law. */
export const RELOOT_MAX_DIST = 128
/** Overrun margin: the walk must FINISH this long before the despawn (the
 * dusk wire's margin class - detours around the very hazard that killed). */
export const RELOOT_MARGIN_MS = 30000
/** GoalNear range for the walk goal: the drop may sit below the walk plane
 * or inside the freed cell (the v0.178.0 below-plane lesson) - range 2 lets
 * the gallery lip count as arrival instead of spiraling into a timeout. */
export const RELOOT_GOAL_RANGE = 2
/** (v0.207.0) The no-path retry's widened sphere: run68's two debut walks
 * (F4, F10) both died 'No path to the goal!' - the death spots sit in the
 * flooded-quarry wet columns and the dry pathfinder refuses to aim a range-2
 * sphere INTO the water. Range 8 lets a DRY rim stance inside the sphere
 * count as arrival: the pathfinder picks the closest reachable cell, the
 * magnet gets its chance, and the widened arrival read keeps the verdict
 * honest (stacks beyond the magnet are evidence, not a pickup claim). */
export const RELOOT_RETRY_RANGE = 8
/** (v0.207.0) The retry's minimum walk clock: a widened walk that cannot
 * afford this much time is honestly dead (one goto leg + the arrival read
 * cannot converge in less - the doomed-goal law: never re-arm into a
 * guaranteed spiral). */
export const RELOOT_RETRY_FLOOR_MS = 8000
/** (v0.207.0) The geometry-refusal class: the pathfinder's own dead verdicts
 * ('No path' proven, 'Took to long' the A* calc timeout - mineflayer's typo
 * included). These are GEOMETRY verdicts: a wider sphere can change their
 * answer. Everything else - the walk-budget timeout (saturation), the
 * doomed-goal ledger, the water-rescue gate - is the consult's own verdict
 * and answers the same for range 8 as for range 2. */
const NO_PATH_VERDICT_RE = /no path|took to long|took too long/i
/** (v0.208.0) The flooded-column classes the surface scanner reads. The
 * fluid class includes the swimmable plants that live IN the water column
 * (kelp, seagrass, bubble columns) - they are the water for walk purposes.
 * The air class is the surface: the first of these above the fluid is where
 * vanilla physics parks the floating drops. Anything else (a solid cap, a
 * lily pad, a junk read) seals the column and the walk stays terminal. */
const SURFACE_FLUID_RE = /water|kelp|seagrass|bubble_column/
const SURFACE_AIR_RE = /^(air|cave_air|void_air)$/
/** (v0.208.0) The surface scan's rise cap: a flooded-pit death column reads
 * fluid-then-air within this many blocks of the spot; past that the column
 * is not a flooded-pit shape (an ocean-depth edge case) and the walk stays
 * terminal - the runner's read is capped to the same bound. */
export const RELOOT_SURFACE_RISE_MAX = 32

/**
 * Should the respawned bot walk back to its own death spot to re-collect the
 * drops, and what goal/budget does that walk get? Pure, junk-safe: every
 * refusal carries a named why (silence is never evidence), and junk never
 * arms a walk.
 * @param {object} [p]
 * @param {{x:number,y:number,z:number}|null} [p.spot] the death spot (junk -> no-spot)
 * @param {number|null} [p.deathAt] ms clock of the death (junk -> no-spot)
 * @param {number} [p.now] the caller's clock (default Date.now())
 * @param {{x:number,y:number,z:number}|null} [p.botPos] the bot's current (respawn) position (junk -> no-bot)
 * @param {boolean} [p.attempted] a re-loot walk already fired for this death (-> attempted)
 * @param {number} [p.despawnMs] vanilla despawn window (default RELOOT_DESPAWN_MS)
 * @param {number} [p.maxDist] the walk-envelope radius (default RELOOT_MAX_DIST)
 * @param {number} [p.marginMs] the finish-before-despawn margin (default RELOOT_MARGIN_MS)
 * @returns {{go:boolean, why?:string, goal?:{x:number,y:number,z:number}, range?:number, dist?:number, budgetMs?:number, windowMs?:number}}
 *   a refusal reads { go:false, why }, a plan reads { go:true, goal, range, dist, budgetMs, windowMs }
 */
export function relootPlan ({
  spot = null,
  deathAt = null,
  now = Date.now(),
  botPos = null,
  attempted = false,
  despawnMs = RELOOT_DESPAWN_MS,
  maxDist = RELOOT_MAX_DIST,
  marginMs = RELOOT_MARGIN_MS
} = {}) {
  const fin = v => Number.isFinite(v)
  const spotOk = spot && fin(spot.x) && fin(spot.y) && fin(spot.z)
  if (!spotOk || !fin(deathAt)) return { go: false, why: 'no-spot' }
  if (attempted) return { go: false, why: 'attempted' }
  const despawn = fin(despawnMs) && despawnMs > 0 ? despawnMs : RELOOT_DESPAWN_MS
  const t = fin(now) ? now : Date.now()
  const windowMs = deathAt + despawn - t
  if (windowMs <= 0) return { go: false, why: 'expired' }
  const botOk = botPos && fin(botPos.x) && fin(botPos.y) && fin(botPos.z)
  if (!botOk) return { go: false, why: 'no-bot' }
  const dx = spot.x - botPos.x
  const dy = spot.y - botPos.y
  const dz = spot.z - botPos.z
  const dist = Math.hypot(dx, dy, dz)
  const cap = fin(maxDist) && maxDist > 0 ? maxDist : RELOOT_MAX_DIST
  if (dist > cap) return { go: false, why: 'too-far' }
  const budgetMs = walkBudgetMs({ dist })
  const margin = fin(marginMs) && marginMs > 0 ? marginMs : RELOOT_MARGIN_MS
  if (budgetMs + margin > windowMs) return { go: false, why: 'no-time' }
  return {
    go: true,
    goal: { x: Math.floor(spot.x), y: Math.floor(spot.y), z: Math.floor(spot.z) },
    range: RELOOT_GOAL_RANGE,
    dist,
    budgetMs,
    windowMs
  }
}

/**
 * (v0.207.0) Should a FAILED re-loot walk get its ONE widened-range retry?
 * Pure, junk-safe, countable whys. The retry is NOT a re-arm of the
 * one-walk-per-death law: it is the SAME walk continuing on a wider sphere,
 * granted exactly once, only for the pathfinder's GEOMETRY refusals (the
 * class a wider sphere can actually cure). The retry-storm law holds: the
 * retries gate refuses anything past the first grant, so the cure can never
 * chain into the re-failing loop the law was named for (the v0.82.0 lesson).
 *
 * The budget arithmetic rides the despawn window the plan priced: the retry
 * gets min(plan budget, window - elapsed - margin) and refuses when that
 * cannot afford RELOOT_RETRY_FLOOR_MS - a retry that lands after the despawn
 * is the wasted-trip class the plan's no-time fence already refuses (the
 * dusk wire's fence (c) arithmetic, carried one leg deeper).
 *
 * @param {object} [p]
 * @param {string|any} [p.message] the failed walk's error message (junk -> not-no-path)
 * @param {number} [p.retries] retries already granted (anything but 0 -> spent)
 * @param {number} [p.elapsedMs] the first walk's own clock (junk -> 0; the window fence still bounds the total)
 * @param {number} [p.budgetMs] the plan's walk budget (junk -> no-time)
 * @param {number} [p.windowMs] the plan's remaining despawn window at plan time (junk -> no-time)
 * @param {number} [p.marginMs] the finish-before-despawn margin (default RELOOT_MARGIN_MS)
 * @returns {{go:boolean, why?:string, range?:number, budgetMs?:number}}
 *   a refusal reads { go:false, why: 'spent'|'not-no-path'|'no-time' },
 *   a grant reads { go:true, range: RELOOT_RETRY_RANGE, budgetMs }
 */
export function relootRetry ({
  message = '',
  retries = 0,
  elapsedMs = 0,
  budgetMs = 0,
  windowMs = 0,
  marginMs = RELOOT_MARGIN_MS
} = {}) {
  if (retries !== 0) return { go: false, why: 'spent' }
  const msg = typeof message === 'string' ? message : ''
  if (!NO_PATH_VERDICT_RE.test(msg)) return { go: false, why: 'not-no-path' }
  const fin = v => Number.isFinite(v)
  const el = fin(elapsedMs) && elapsedMs > 0 ? elapsedMs : 0
  const bud = fin(budgetMs) && budgetMs > 0 ? budgetMs : 0
  const win = fin(windowMs) && windowMs > 0 ? windowMs : 0
  const margin = fin(marginMs) && marginMs > 0 ? marginMs : RELOOT_MARGIN_MS
  const left = win - el - margin
  const budget = Math.floor(Math.min(bud, left))
  if (!fin(budget) || budget < RELOOT_RETRY_FLOOR_MS) return { go: false, why: 'no-time' }
  return { go: true, range: RELOOT_RETRY_RANGE, budgetMs: budget }
}

/**
 * (v0.208.0) THE SURFACE GOAL - the flooded pit's own exit ramp. MEASURED
 * (run55, fleet 36226589855, the v0.207.0 retry's field debut): the chain
 * WORKED (walk -> 'No path' -> the classifier granted the range-8 retry with
 * the right budget) and the widened sphere ALSO refused - F17's death spot
 * [-117,42,406] sits at the flooded quarry bottom, and every cell within 8
 * of the bottom cell is water or pit wall below the waterline. The drops
 * themselves FLOAT: vanilla physics lifts item entities to the water
 * surface. So the reachable goal is not a wider sphere on the dead cell -
 * it is the water SURFACE above it: the first AIR cell up the death column.
 * A stance on the rim beside that cell is dry, pathfinder-legal, and within
 * magnet reach of the floating stacks.
 *
 * The scanner is pure: the runner reads the death column bottom-up (block
 * names from the spot's own y), the scanner names the surface or refuses.
 * Junk never arms a walk: a column that does not read fluid-then-air (a dry
 * land death - the spot cell reads air, its drops lie on the ground and the
 * sphere walk was the right shape; a sealed solid cap; a junk read) gets
 * null and the death stays terminal.
 *
 * @param {Array<{y:number, name:string}|null>|null} column bottom-up block
 *        reads starting AT the death spot's own y (junk -> null)
 * @returns {number|null} the y of the water surface (the first air cell
 *          above the fluid, within RELOOT_SURFACE_RISE_MAX), or null
 */
export function relootSurfaceY ({ column = null } = {}) {
  if (!Array.isArray(column) || column.length === 0) return null
  const spot = column[0]
  // the death happened IN the water: the spot cell itself must read fluid.
  // A land death's spot cell reads air - its drops do not float, refuse.
  if (!spot || typeof spot.name !== 'string' || !SURFACE_FLUID_RE.test(spot.name)) return null
  for (let i = 1; i < column.length; i++) {
    const c = column[i]
    if (!c || typeof c.name !== 'string' || !Number.isFinite(c.y)) return null
    if (SURFACE_FLUID_RE.test(c.name)) continue // still inside the fluid column
    if (SURFACE_AIR_RE.test(c.name)) {
      if (i > RELOOT_SURFACE_RISE_MAX) return null // past the rise cap - not a pit shape
      return c.y
    }
    return null // a solid cap (or a pad) seals the column - not a flooded pit
  }
  return null // the column never surfaced within the reads
}

/**
 * (v0.213.0) THE NO-SURFACE CENSUS - the scanner's refusal stops being one
 * word. MEASURED (run77, fleet 36236379977, the v0.211.0 wiring's field
 * debut): the ladder ran all three legs in the field and the surface gate
 * refused 'no-surface' - F6 drowned at y44 and the column never surfaced.
 * The decode CANNOT split the refusal's anatomy (an aquifer pool sealed by
 * stone? an unloaded chunk reading null? a land death? the ocean-depth
 * shape?), and each class wants a different cure: a sealed pool is the
 * rim-dig front, a junk read is a re-read/retry front, a land death is
 * terminal-correct forever. So the census names the refusal's own class,
 * pure, with the EXACT control flow of relootSurfaceY - the coherence law
 * holds by construction: the census returns null precisely when the
 * scanner finds a surface.
 *
 * @param {Array<{y:number, name:string}|null>|null} column bottom-up block
 *        reads starting AT the death spot's own y (junk -> 'no-column')
 * @returns {string|null} the refusal's class:
 *   'no-column'  the column read is junk or empty (the world read died)
 *   'junk-read'  a malformed entry inside the column (the UNLOADED-CHUNK
 *                class - blockAt returned null mid-column)
 *   'land'       the spot cell reads non-fluid: a dry death, the drops lie
 *                on the ground and the sphere walk was the right shape
 *   'sealed'     a solid cap (or a lily pad) closes the column above the
 *                fluid - the aquifer-pool class, the rim-dig front
 *   'deep'       air exists but past RELOOT_SURFACE_RISE_MAX (the
 *                ocean-depth shape - the rise cap holds)
 *   'no-air'     the reads ran out before any air (water to the top of the
 *                scan - the runner's capped form of the deep class)
 *   null         a surface EXISTS (the scanner's success; never a refusal)
 */
export function relootSurfaceWhy ({ column = null } = {}) {
  if (!Array.isArray(column) || column.length === 0) return 'no-column'
  const spot = column[0]
  if (!spot || typeof spot.name !== 'string' || !Number.isFinite(spot.y)) return 'junk-read'
  if (!SURFACE_FLUID_RE.test(spot.name)) return 'land'
  for (let i = 1; i < column.length; i++) {
    const c = column[i]
    if (!c || typeof c.name !== 'string' || !Number.isFinite(c.y)) return 'junk-read'
    if (SURFACE_FLUID_RE.test(c.name)) continue
    if (SURFACE_AIR_RE.test(c.name)) {
      if (i > RELOOT_SURFACE_RISE_MAX) return 'deep'
      return null // a surface exists - the scanner's success, not a refusal
    }
    return 'sealed'
  }
  return 'no-air'
}

/**
 * (v0.208.0) Should the WIDE RETRY's own refusal (the second geometry
 * verdict, the sphere class exhausted) get the surface walk? The field
 * sequence is strict and each leg names its class: the walk (range 2) ->
 * the wide retry (range 8, the v0.207.0 classifier) -> THE SURFACE WALK
 * (a different goal, not a wider sphere - the water surface above the dead
 * cell). The surface never fires before the wide retry spent its refusal
 * (retries must read exactly 1: a direct surface walk on the first 'No
 * path' would skip the cheap leg that usually suffices on dry geometry),
 * and it never chains past itself (retries 2+ refuse - three legs per
 * death is the whole ladder).
 *
 * The pricing rides the SAME plan arithmetic as the first walk (relootPlan
 * on the surface cell: the 128 envelope, the despawn window, the margin,
 * the dist-scaled budget) - the surface goal is a spot like any other, and
 * the plan's own fences (no-spot/no-bot/too-far/no-time) refuse it exactly
 * when any walk would be refused. The death record's attempted flag stays
 * untouched: every leg here lives inside the failed-walk catch, the loop
 * never re-enters, and the leg count is THIS gate's law.
 *
 * @param {object} [p]
 * @param {string|any} [p.message] the WIDE RETRY's error message (junk -> not-no-path)
 * @param {number} [p.retries] legs already fired after the walk (must be exactly 1)
 * @param {number|null} [p.surfaceY] the scanner's surface y (junk -> no-surface)
 * @param {string|null} [p.surfaceWhy] (v0.213.0) the census's own class for a
 *        refused scan (relootSurfaceWhy's verdict); when the scan refuses and
 *        a class is provided, the refusal carries it as `subWhy` beside the
 *        legacy 'no-surface' why (additive - the legacy verdicts are
 *        byte-for-byte); junk/absent reads 'unknown'
 * @param {{x:number,y:number,z:number}|null} [p.spot] the death spot (x/z ride the goal)
 * @param {number|null} [p.deathAt] the death clock (the despawn window prices from it)
 * @param {number} [p.now] the caller's clock
 * @param {{x:number,y:number,z:number}|null} [p.botPos] the bot's current stance
 * @param {number} [p.marginMs] the finish-before-despawn margin (default RELOOT_MARGIN_MS)
 * @returns {{go:boolean, why?:string, goal?:{x:number,y:number,z:number}, range?:number,
 *            dist?:number, budgetMs?:number, windowMs?:number}}
 */
export function relootSurfaceRetry ({
  message = '',
  retries = 0,
  surfaceY = null,
  surfaceWhy = null,
  spot = null,
  deathAt = null,
  now = Date.now(),
  botPos = null,
  marginMs = RELOOT_MARGIN_MS
} = {}) {
  if (retries !== 1) return { go: false, why: 'not-after-wide-retry' }
  const msg = typeof message === 'string' ? message : ''
  if (!NO_PATH_VERDICT_RE.test(msg)) return { go: false, why: 'not-no-path' }
  const fin = v => Number.isFinite(v)
  const y = fin(surfaceY) ? Math.floor(surfaceY) : null
  if (y === null) {
    return {
      go: false,
      why: 'no-surface',
      subWhy: typeof surfaceWhy === 'string' && surfaceWhy ? surfaceWhy : 'unknown'
    }
  }
  const plan = relootPlan({
    spot: spot && fin(spot.x) && fin(spot.z) ? { x: spot.x, y, z: spot.z } : null,
    deathAt,
    now,
    botPos,
    attempted: false, // the record's flag owns the LOOP lane; the leg count is this gate's law
    marginMs
  })
  if (!plan.go) return { go: false, why: plan.why }
  // (v0.217.0) THE RIM STANCE - the surface leg aims the RIM, not the cell.
  // MEASURED (run 36248025944, the v0.215.0 trident band's debut fleet): F4's
  // ladder ran the FULL three legs and the scanner WON - the surface read
  // [-110,63,467] (the death column y57 -> air at y63, six up) - and the
  // surface walk STILL died 'No path to the goal!'. The reason is the
  // v0.207.0 class carried one leg deeper: the surface cell is WET-ADJACENT
  // BY CONSTRUCTION (it is the first air above the fluid), and a GoalNear
  // range-2 sphere must find a standable cell within 2 of a cell that hangs
  // over open water - on a pool wider than ~4 blocks the rim sits past the
  // sphere and the dry pathfinder refuses the aim. v0.208.0's own design
  // intent says the arrival is the RIM: 'a stance on the rim beside that
  // cell is dry, pathfinder-legal, and within magnet reach of the floating
  // stacks'. So the surface leg derives RELOOT_RETRY_RANGE 8 - the same
  // widened sphere the wide retry earned in v0.207.0, granted at birth on
  // the leg where the wet aim is the GEOMETRY ITSELF. The dry rim inside the
  // sphere counts as arrival; the honest stack read (within 8) stays the
  // evidence ('the magnet takes what it can'). Zero new legs (three legs per
  // death is the whole ladder); the goal, the budget and the window ride the
  // plan arithmetic byte-for-byte - only the AIM widens.
  return {
    go: true,
    goal: plan.goal,
    range: RELOOT_RETRY_RANGE,
    dist: plan.dist,
    budgetMs: plan.budgetMs,
    windowMs: plan.windowMs
  }
}
