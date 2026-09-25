// Wood-gathering policy helpers (pure, unit-testable - no bot, no server).
import { walkForbidden } from './nightsafety.mjs'
//
// The v0.6.9 Big Fleet exposed two ways a bot wastes its whole run on wood:
//
// 1. "7-of-8 idling": the tool kit needs ~12 planks = 3 logs, but gatherWood wants 8.
//    A bot that chopped one trunk (7 logs) and then found no forest kept hunting the
//    8th log until its FULL budget burned (fleet log: F1 held birch_log:7 from t-219s
//    to t-123s and only crafted at ~t-110s - ~110s of pure idle).
// 2. "bare-handed forever": a bot whose bootstrap failed once (logs=0 -> "no planks
//    recipe") then dug dirt-only shafts for the rest of the run because nothing ever
//    retried the bootstrap - 8/19 bots ended the v0.6.9 run without a pickaxe.
//
// This module pins the decision logic for fix 1 (the stall escape). Fix 2 lives in
// the fleet loop (testbed/fleet19.mjs): periodic re-bootstrap when there is no pickaxe,
// with its timing predicate below.

/**
 * Should the fleet loop interrupt the current shaft and re-run the tool bootstrap?
 * The v0.7.0 fleet still ended with recovered=0: the check lived ONLY between shafts
 * while one digShaft descent runs ~90s, so the remaining-time guard never saw a due
 * recovery. The fleet now evaluates this SAME predicate inside digShaft's shouldStop.
 *
 * @param {object} p
 * @param {boolean} p.hasPick does the bot hold a pickaxe right now
 * @param {number} p.msSinceLast ms since the last bootstrap attempt (initial one included)
 * @param {number} p.remainingMs ms left until the run's deadline
 * @param {number} [p.cooldownMs] minimum gap between bootstrap attempts
 * @param {number} [p.minRemainingMs] do not start a ~85s bootstrap near the deadline
 * @returns {boolean}
 */
export function recoveryDue ({ hasPick, msSinceLast, remainingMs, cooldownMs = 45000, minRemainingMs = 80000, failStreak = 0 }) {
  if (hasPick) return false
  if (!Number.isFinite(msSinceLast)) return false
  if (msSinceLast <= recoveryCooldownMs(failStreak, cooldownMs)) return false
  if (!Number.isFinite(remainingMs) || remainingMs <= minRemainingMs) return false
  return true
}

// (v0.52.0) THE HOPELESS-LOOP BRAKE. run51 (fleet 35639593200) mined: F7 lost its
// pickaxe with no sticks and no planks in the pocket, underground where no tree
// grows - and the recovery loop re-ran the full ~85s bootstrap (gatherWood <=40s
// + ensureTools <=45s of pathfinder/craft CPU) every ~60-80s for 350+ seconds,
// ALWAYS failing ('no planks recipe'). Nineteen bots' worth of that is the
// runner-CPU exhaustion that made the server time out every client at ts~270s.
// The brake: every CONSECUTIVE failed recovery stretches the cooldown, so a
// hopeless bot costs the fleet seconds, not minutes - while a bot that keeps
// failing for a DIFFERENT reason (a broken table) still retries meaningfully.
//   streak 0-1 -> 45s   2 -> 90s   3 -> 180s   4+ -> 300s (cap)
export function recoveryCooldownMs (failStreak = 0, baseMs = 45000) {
  const n = Number(failStreak)
  if (!Number.isFinite(n) || n <= 1) return baseMs
  return Math.min(baseMs * 2 ** (n - 1), baseMs * 6.67) // 300s is the practical cap at the 45s base
}

// NOTE (v0.9.1): upgradeDue was REMOVED from here. The fleet's mid-run upgrade path
// went through toolupgrade.mjs (upgradeCheck/upgradeTools, wired as upgradeDueNow in
// testbed/fleet19.mjs) since v0.7.5, and this predicate had no production caller left.
// The durability/tier decision logic it once described lives in src/lib/toolupgrade.mjs.

/**
 * Should a wood-gathering loop stop hunting and go craft with what it already holds?
 * True only when BOTH hold:
 *   - we hold at least `goodEnough` logs (enough for the whole tool kit), and
 *   - nothing has produced a new log for `stallMs` (the nearby forest is gone and
 *     even the shared WorldMap has nothing reachable).
 * `goodEnough: null` disables the escape entirely (exact old behaviour).
 *
 * @param {object} p
 * @param {number} p.logs logs currently held
 * @param {number|null} p.goodEnough log count that already covers the tool kit
 * @param {number} p.msSinceGain ms since the log count last rose
 * @param {number} p.stallMs ms of zero progress that counts as "stalled"
 * @returns {boolean}
 */
export function stalledButCraftable ({ logs, goodEnough, msSinceGain, stallMs }) {
  if (goodEnough == null) return false
  if (!Number.isFinite(logs) || logs < goodEnough) return false
  if (!Number.isFinite(msSinceGain) || msSinceGain < stallMs) return false
  return true
}

// (v0.17.1) Map-trip gate, extracted from fleet19 so CI can test the arithmetic.
// WHY NOW: fleet #122 skipped ALL 23 trips - 14x 'cannot leave the shaft' (the
// bot was underground when the 75s cadence fired) and 9x 'unreachable', where the
// walk budget (14s) was physically shorter than the distance it licensed (targets
// up to 128 blocks away need 30s+ of pathfinding+walking). A walkable-but-slow
// shore was then remembered in failedTrips - a self-inflicted blacklist.
// The gate now ALSO refuses to start a trip the run cannot finish: a trip needs
// its walk budget (45s), the harvest (40s) and the way back, so <150s remaining
// means: keep mining instead of dying mid-beach when the deadline hits.
export function tripDue ({ hasPick, emptyShafts, msSinceLast, remainingMs, cadenceMs = 75000, minRemainingMs = 150000 }) {
  if (!hasPick) return false
  if (emptyShafts !== 0) return false // bottomed-out bots: sealed-stone A*, the v0.11.2 explosion class
  if (!Number.isFinite(msSinceLast) || msSinceLast <= cadenceMs) return false
  if (!Number.isFinite(remainingMs) || remainingMs <= minRemainingMs) return false
  return true
}

// Walk budget for a map trip: the target may be up to `maxDistance` blocks away.
// The old 14s default licensed 128-block walks - mathematically impossible on
// foot (~4 blocks/s plus pathfinding thought time), so every far shore failed as
// 'unreachable'. 45s spans the licensed range with headroom for one detour.
export const TRIP_WALK_MS = 45000

// ---- v0.179.0: THE STICK FAMINE TRIP - the wood re-supply lane for tooled bots.
//
// MEASURED (run20, fleet 36131508220, the v0.177.0 fleet, 19 bots x 600s):
// 'no spare sticks: sticks 1 coals 0' x88 + 'sticks 0 coals 0' x30 - the torch
// cadence skipped ~118 times and the fleet still only placed 13 torches; 'no fuel'
// x34+ starved the smelt leg (smelted=13); the zombie x3 deaths sat in DEEP dark
// shafts (F8 y=34, F4 y=49) - the torch famine feeds the underground death class.
// The v0.137.0 sticks-for-torches cure needs >4 planks in the pocket - the famine
// bots hold NO planks either (the pocket wood is CONSUMED, not hoarded), and
// recoveryDue only fires when the PICKAXE is gone: a bot that holds its pickaxe
// but burnt through its bootstrap wood in the first ~150s has NO wood lane left
// for the rest of the run (no torches, no spare-pick sticks, no plank fuel).
//
// The cure: when the pocket's stick-equivalent supply runs dry below the floor,
// the mining loop plans ONE wood trip - climb out, gatherWood (the proven
// mechanics: map-targeted trunks, stall escape, replant), convert logs ->
// planks -> sticks, return to the column. The gates mirror the bank trip's
// discipline (a failed attempt must not retry-storm the loop) and the night
// hold's lesson (a surface walk inside the walk-forbidden window is the
// measured kill site - defer it: a deferred walk turns into more shaft).

/** Stick-equivalent supply of one pocket: sticks as-is, 2 planks -> 4 sticks,
 * 1 log -> 4 planks -> 8 sticks. Junk inputs count as zero. */
export function stickSupply ({ sticks = 0, planks = 0, logs = 0 } = {}) {
  const s = Number.isFinite(sticks) && sticks > 0 ? Math.floor(sticks) : 0
  const p = Number.isFinite(planks) && planks > 0 ? Math.floor(planks) : 0
  const l = Number.isFinite(logs) && logs > 0 ? Math.floor(logs) : 0
  return s + 2 * p + 8 * l
}

/** Below this the bot cannot feed the torch cadence, a spare pickaxe AND an
 * emergency plank fuel at once (run20's famine class reads 0-1 stick-equivalents;
 * a healthy bootstrap pocket reads 26+). */
export const STICK_FAMINE_FLOOR = 12
/** One famine trip per run segment max - a failed forest scan must not storm the
 * loop (the bank-trip cadence discipline). */
export const WOOD_TRIP_EVERY_MS = 240000
/** Climb out (~45s) + gatherWood (<=60s) + the return walk (~45s) must fit. */
export const WOOD_TRIP_MIN_REMAINING_MS = 150000

/**
 * The stick-famine verdict for one mining-loop iteration.
 * @param {object} p
 * @param {number} p.sticks sticks held
 * @param {number} p.planks planks held (all types summed)
 * @param {number} p.logs logs held (all types summed)
 * @param {boolean} p.hasPick does the bot hold a pickaxe (tool-less bots have
 *   their own recovery lane - its bootstrap already gathers wood)
 * @param {number} p.msSinceLast ms since the last famine attempt (Date.now() - 0
 *   on a fresh bot = the whole run counts as elapsed)
 * @param {number} p.remainingMs ms left until the run's deadline
 * @param {number} p.timeOfDay bot.time.timeOfDay (the night hold reads it)
 * @returns {'due'|'deferred-night'|false} 'deferred-night' ONLY when the pocket
 *   is starving but the surface walk is night-gated (the loop logs it once and
 *   keeps mining - the v0.140.1 hold shape); false = not starving or gated.
 */
export function famineDue ({ sticks, planks, logs, hasPick, msSinceLast, remainingMs, timeOfDay, cooldownMs = WOOD_TRIP_EVERY_MS, minRemainingMs = WOOD_TRIP_MIN_REMAINING_MS } = {}) {
  if (!hasPick) return false
  if (!Number.isFinite(msSinceLast) || msSinceLast <= cooldownMs) return false
  if (!Number.isFinite(remainingMs) || remainingMs <= minRemainingMs) return false
  const supply = stickSupply({ sticks, planks, logs })
  if (!Number.isFinite(supply) || supply >= STICK_FAMINE_FLOOR) return false
  // the starving pocket's surface walk is night-gated LAST (the verdict must
  // still name the famine on the next daylight iteration - the night line is
  // the loop's deferral log, not a silent swallow)
  if (typeof walkForbidden === 'function' && walkForbidden(timeOfDay)) return 'deferred-night'
  return 'due'
}
