// Trip walk budget (pure, unit-testable - no bot, no server).
//
// WHY THIS EXISTS (fleet 2026-09-20 17:05, 8 bots x 450s): F4 climbed out of
// its shaft (climb out (trip): OK +21 levels) and the map trip to a KNOWN
// sand cluster died with 'sand,gravel unreachable' - three times in one run.
// mapTrip walked with a FLAT walkTimeoutMs=14000 while maxDistance lets the
// map hand it targets up to 128 blocks away: at the pathfinder's real ground
// speed (~4 blocks/s, more with land detours around the lakes the fixed seed
// spawns) a legitimate far target needs 30s+ - the timeout killed trips the
// claim layer had already paid for (a claim registered, then the walk timed
// out, TTL 120s keeps every other bot away from a target nobody reached).
//
// The budget scales with the straight-line distance but stays CAPPED: a
// longer timeout is also a longer A* leash, and the v0.11.2 OOM lesson (a
// sealed goal expanding the whole world, 3.4GB, process dead) forbids an
// open-ended walk window. Base, per-block rate and cap are parameters so the
// caller (mapTrip) and the tests can pin the contract independently.

/** Flat budget for near targets (the historical mapTrip default). */
export const WALK_BASE_MS = 14000
/** Milliseconds per straight-line block at pathfinder ground speed (~4 b/s). */
export const WALK_PER_BLOCK_MS = 250
/** Hard ceiling: 128 blocks (mapTrip's maxDistance) at 4 b/s exactly - the
 * OOM lesson (v0.11.2) forbids an open-ended walk window, but a cap that
 * cannot reach the radius the map PROMISES would kill every far trip. */
export const WALK_CAP_MS = 32000
/** Fixed overhead per trip: look-up, goal snap, path build, final approach. */
export const WALK_OVERHEAD_MS = 5000

/**
 * Walk budget for one map trip.
 * @param {object} p
 * @param {number} [p.dist] straight-line distance to the target (blocks)
 * @param {number} [p.base] minimum budget (default WALK_BASE_MS)
 * @param {number} [p.perBlock] budget per block of distance (default WALK_PER_BLOCK_MS)
 * @param {number} [p.cap] maximum budget (default WALK_CAP_MS)
 * @param {number} [p.overhead] fixed per-trip overhead (default WALK_OVERHEAD_MS)
 * @returns {number} milliseconds, always >= a sane floor (2s)
 */
export function walkBudgetMs ({ dist = 0, base = WALK_BASE_MS, perBlock = WALK_PER_BLOCK_MS, cap = WALK_CAP_MS, overhead = WALK_OVERHEAD_MS } = {}) {
  const num = v => (Number.isFinite(v) && v > 0 ? v : 0)
  const d = num(dist)
  const lo = Math.max(num(base), 2000) // a budget below one path build is a lie
  const hi = Math.max(num(cap), lo) // a cap below the base is a lie
  return Math.min(hi, Math.max(lo, Math.round(d * num(perBlock) + num(overhead))))
}
