// Wood-gathering policy helpers (pure, unit-testable - no bot, no server).
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
export function recoveryDue ({ hasPick, msSinceLast, remainingMs, cooldownMs = 45000, minRemainingMs = 80000 }) {
  if (hasPick) return false
  if (!Number.isFinite(msSinceLast) || msSinceLast <= cooldownMs) return false
  if (!Number.isFinite(remainingMs) || remainingMs <= minRemainingMs) return false
  return true
}

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
