// (v0.62.0) THE FLEET NO-PATH LEDGER - the A*-exhaustion storm killer.
//
// MEASURED (dispatch 35668657935, the v0.61.0 fleet): the end phase burned on
// unreachable chest hops - 16x 'chest unreachable (No path to the goal!)' with
// F4 alone trying 6 chests and F5 trying 5, several of the SAME chests from
// DIFFERENT bots ('No path' at d=21-31, inside the radius-32 search box, on
// quarried terrain where the path would have to leave the box by
// construction). Every 'No path' is a FULL synchronous A* exhaustion (the
// pathfinder's think window, 4.5s of main-thread block) and the fleet lives in
// ONE Node process: 19 bots re-deciding the same doomed geometry froze each
// other's raw walks, digs and physics - the run60 'still underground' x13 /
// 'segment stalled' x13 end-phase mush is that cascade's signature.
//
// The ledger records the cells that answered 'No path' so the whole fleet
// skips them for a window instead of re-paying the A* each time. It is an
// ARRAY passed by reference through fleet19 -> createMiner -> depositToChests
// (one process, so one shared array reaches every bot; the ClaimBoard pattern
// without the broadcast). Record side: deposit.mjs, on a /No path/ exit.
// Skip side: the depositToChests chest loop, BEFORE the doomed hop.
//
// Same discipline as src/lib/drowning.mjs (the water memory): pure functions,
// a NEW array per record, prune-then-append, the cap keeps the newest entries
// (the freshest verdicts are the ones a re-terrain would invalidate first).

/** A NoPath verdict lives this long. 90s: the end-phase chains re-scan every
 * few seconds, so 90s covers a whole chain attempt while a genuinely
 * re-routable chest (another bot dug a bridge) is back inside two. */
export const NOPATH_TTL_MS = 90000

/** XZ distance (blocks, straight line) under which a scan-hit counts as the
 * same chest: findChest returns BLOCK positions, the fleet re-reads them from
 * live memory - the same chest always floors to the same cell, but the caller
 * may pass a slightly different standable cell near it. */
export const NOPATH_RADIUS = 4

/** Y tolerance: chest rows are flat (same y); this only covers a bot reading
 * the chest from a staircase above/below. */
export const NOPATH_DY = 4

/** Cap: 19 bots x 11 warehouse chests is ~200 cells worst case, but a run
 * sees a handful of dead ones; 24 keeps the newest verdicts (drowning.mjs
 * cap parity). */
export const NOPATH_CAP = 24

/** (v0.70.0) How long a TIMEOUT verdict lives. MEASURED (run67, dispatch
 * 35692049905, the v0.69.1 600s fleet): 24x 'chest unreachable (Took to long
 * to decide path to goal!)' on the same y=69-72 lake-bottom chests - the
 * no-path ledger only recorded /No path/i, so every bot re-paid the walk AND
 * the full A* exhaustion for the same dead geometry, and those exhaustions
 * are exactly the fuel of the run's one 44s main-thread freeze (the blackbox
 * named 'pf:goal walk to chest' in the blocker chain). A timeout is WEAKER
 * evidence than a clean 'No path' (a stalled main thread can time out a
 * reachable chest), so its verdict lives HALF as long: long enough to cover
 * the end-phase chain that keeps re-finding the chest, short enough that a
 * load-flaked verdict expires before it starves a real delivery. */
export const NOPATH_TIMEOUT_TTL_MS = 45000

/**
 * (v0.70.0) Parse a chest-walk failure message into a dead-chest verdict.
 * Pure, junk-safe. Two dead shapes exist:
 *  - /No path/i          - the pathfinder PROVED the geometry (strong, 90s)
 *  - /took to long/i     - the pathfinder's calc timeout (weak, 45s)
 * Everything else (rescues, budget exhaustion, 'Path was stopped') is NOT a
 * dead-chest verdict - those exits are transient state, not geometry.
 * @param {string|null} [msg] the caught error's message
 * @returns {{dead: boolean, timeout: boolean}} dead=true means the chest may
 *   be ledgered; timeout=true selects the short TTL.
 */
export function isDeadChestVerdict (msg) {
  const s = typeof msg === 'string' ? msg : ''
  if (/No path/i.test(s)) return { dead: true, timeout: false }
  if (/took to long/i.test(s)) return { dead: true, timeout: true }
  return { dead: false, timeout: false }
}

function floorCell (cell) {
  if (!cell || typeof cell !== 'object') return null
  const x = Math.floor(Number(cell.x))
  const y = Math.floor(Number(cell.y))
  const z = Math.floor(Number(cell.z))
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null
  return { x, y, z }
}

function distXZ (a, b) {
  const dx = a.x - b.x
  const dz = a.z - b.z
  return Math.sqrt(dx * dx + dz * dz)
}

/**
 * Record a 'No path' verdict for `cell`. Pure: returns a NEW array (the
 * input is never mutated), prunes dead entries first, appends the new one,
 * and the cap keeps the NEWEST (prune-then-append, then drop from the front).
 * Junk-tolerant: a junk cell or a non-array input returns a usable array.
 * @param {Array<{x:number,y:number,z:number,at:number}>} [entries] the shared ledger (may be junk)
 * @param {Vec3-like|null} cell the chest block position (floored inside)
 * @param {number} now Date.now() at the verdict
 * @param {object} [p]
 * @param {number} [p.ttl] entry lifetime ms (default NOPATH_TTL_MS)
 * @param {number} [p.cap] max live entries (default NOPATH_CAP)
 * @returns {Array} the new ledger
 */
export function recordNoPath (entries, cell, now, { ttl = NOPATH_TTL_MS, cap = NOPATH_CAP } = {}) {
  const prev = Array.isArray(entries) ? entries : []
  const t = Number.isFinite(now) ? now : 0
  const life = Number.isFinite(ttl) && ttl >= 0 ? ttl : NOPATH_TTL_MS
  const keep = Number.isFinite(cap) && cap > 0 ? Math.floor(cap) : NOPATH_CAP
  // (v0.70.0) per-entry lifetime: each entry carries the ttl IT was recorded
  // with (a 45s timeout verdict expires on its own clock while a 90s 'No
  // path' verdict beside it stays live); entries without one (pre-v0.70.0
  // shapes, junk) fall back to the caller's ttl.
  const fresh = prev.filter(e => {
    if (!e || !Number.isFinite(e.at)) return false
    const eLife = Number.isFinite(e.ttl) && e.ttl >= 0 ? e.ttl : life
    return t - e.at < eLife
  })
  const f = floorCell(cell)
  if (!f) return fresh
  fresh.push({ x: f.x, y: f.y, z: f.z, at: t, ttl: life })
  return fresh.length > keep ? fresh.slice(fresh.length - keep) : fresh
}

/**
 * Is this cell a LIVE NoPath verdict? Pure. Junk-safe: a junk cell, a junk
 * ledger or a junk now reads as no hit (a chest must never be skipped on
 * garbage - the skip costs the deposit, the hop only costs CPU).
 * @param {Array} [entries] the shared ledger
 * @param {Vec3-like|null} cell the chest block position
 * @param {number} now Date.now()
 * @param {object} [p]
 * @param {number} [p.ttl] entry lifetime ms (default NOPATH_TTL_MS)
 * @param {number} [p.radius] XZ hit radius blocks (default NOPATH_RADIUS)
 * @param {number} [p.dy] Y tolerance blocks (default NOPATH_DY)
 * @returns {{hit: boolean, ageMs: number}} ageMs is the freshest matching
 *   entry's age (0 for no hit)
 */
export function nearNoPath (entries, cell, now, { ttl = NOPATH_TTL_MS, radius = NOPATH_RADIUS, dy = NOPATH_DY } = {}) {
  const miss = { hit: false, ageMs: 0 }
  const prev = Array.isArray(entries) ? entries : []
  const f = floorCell(cell)
  if (!f) return miss
  const t = Number.isFinite(now) ? now : 0
  const life = Number.isFinite(ttl) && ttl >= 0 ? ttl : NOPATH_TTL_MS
  const r = Number.isFinite(radius) && radius >= 0 ? radius : NOPATH_RADIUS
  const yTol = Number.isFinite(dy) && dy >= 0 ? dy : NOPATH_DY
  let best = miss
  for (const e of prev) {
    if (!e || !Number.isFinite(e.at) || !Number.isFinite(e.x) || !Number.isFinite(e.y) || !Number.isFinite(e.z)) continue
    const age = t - e.at
    // (v0.70.0) honor the entry's own ttl first (the timeout verdict's 45s);
    // entries without one ride the caller's ttl as before.
    const eLife = Number.isFinite(e.ttl) && e.ttl >= 0 ? e.ttl : life
    if (age < 0 || age >= eLife) continue
    if (Math.abs(e.y - f.y) > yTol) continue
    if (distXZ(e, f) > r) continue
    if (!best.hit || age < best.ageMs) best = { hit: true, ageMs: age }
  }
  return best
}
