// THE UNFREEZE SWEEP (v0.65.0) - the zombie-goto kill.
//
// WHAT MEASURED (dispatch 35677752396, the v0.64.0 fleet, artifacts
// scripts/fleet-mining/run63): the v0.62.0 black box finally NAMED the
// main-thread freeze blocker -
//
//   [blackbox] main freeze ~51s; last: pf:goal deploy @+0.0s <- pf:done walk
//   @+0.0s <- pf:goal deploy @+-4.7s <- pf:done deploy @+-4.7s ...
//
// a goal labeled 'deploy' was handed to the pathfinder and its pf:done NEVER
// came - the goto never completed, never timed out (gotoSafe's withTimeout
// lives on the same timers the pathfinder is starving), and for 51 seconds
// the main thread's timers did not run at all (mainLate=51122ms). The
// mechanism: a goal the A* can never close (inside solid, beyond the loaded
// border, mid-air over a quarry) puts mineflayer-pathfinder into the
// partial-path recompute loop - each physics tick re-engages compute, each
// compute burns up to the think window of MAIN-thread time, and the recursive
// monitorMovement chain keeps Node's timers silent for the life of the loop.
// run60's 150s freeze was the same class with no witness; run63's second
// freeze (16s, 'water:rescue <- climb <- pf:queue next column') shows it
// RECURS within one run once a goal wedges. Downstream of the 51s freeze:
// the server keepalive-timed-out the fleet (39 transport losses, 32
// relogins), 20 bots died in the post-freeze chaos, and the end phase spent
// its whole 420s margin on rescues/combat instead of banks - HARD KILL.
//
// THE CURE HAS TWO EDGES:
//   1. THE SOURCE EDGE (jobqueue.mjs gotoSafe catch): when the timeout CAN
//      fire (timers alive - the partial-starvation cases), the catch used to
//      call stop() only - but stop() merely SETS a flag, and the recompute
//      loop consumes it and re-engages on the next tick. setGoal(null)
//      clears the goal slot itself: the timed-out walk owns that slot
//      (nothing else can legitimately hold it), so the zombie dies at birth.
//   2. THE POST-FREEZE EDGE (this module + the heartbeat probe hook): when
//      the timers are already dead, the ONLY live observer is the 250ms
//      main-thread lag probe - and it fires exactly ONCE per freeze, on the
//      first fire after main resumes, carrying the full drift magnitude.
//      startHeartbeat forwards that fire to onUnfreeze(drift); the fleet
//      sweep clears every pathfinder goal still held across the freeze. A
//      legitimate walk that happened to be mid-flight gets its goto rejected
//      and its caller re-plans - one re-planned walk is the cheapest thing
//      in a fleet that just lost 51-150s to a re-spiraling A*.
//
// The pure core below is the DECISION layer (which bots get swept and what
// the log says); the mechanical sweep lives in the caller (fleet19) because
// it owns the bot map. Duck-typed throughout: mocks in CI, real pathfinders
// in the fleet, bare objects never throw.

// A freeze worth sweeping: below this the probe drift is a GC pause or a
// slow sync block (the 4.5s think window itself must NOT trip the sweep -
// a legitimate deep A* lands here).
export const UNFREEZE_LATE_MS = 8000

/**
 * Pure: should THIS bot's pathfinder goal be cleared after a main-thread
 * freeze of `lateMs`? Junk-safe: a bare object, a missing pathfinder, or a
 * non-finite lateMs all refuse (the sweep must never manufacture work).
 * The goal-held check reads pf.goal (mineflayer-pathfinder's public slot);
 * a bot moving WITHOUT a readable goal is swept too (the defensive edge -
 * isMoving() true with goal unreadable is exactly the wedged shape), while a
 * standing goal-less bot is left alone (setGoal(null) there is a no-op, but
 * the log line would lie about it).
 * @param {object} [bot] a mineflayer bot (or mock)
 * @param {{lateMs?: number, threshold?: number}} [p]
 * @returns {{sweep: boolean, why: string}}
 */
export function unfreezeTarget (bot, { lateMs = 0, threshold = UNFREEZE_LATE_MS } = {}) {
  const late = Number(lateMs)
  const th = Number.isFinite(Number(threshold)) && Number(threshold) >= 0 ? Number(threshold) : UNFREEZE_LATE_MS
  if (!Number.isFinite(late) || late < th) return { sweep: false, why: 'below threshold' }
  const pf = bot?.pathfinder
  if (!pf || typeof pf.setGoal !== 'function') return { sweep: false, why: 'no pathfinder' }
  const holding = pf.goal != null
  const moving = typeof pf.isMoving === 'function' ? !!pf.isMoving() : false
  if (!holding && !moving) return { sweep: false, why: 'no goal held' }
  return { sweep: true, why: holding ? 'goal held across the freeze' : 'moving without a readable goal' }
}

/**
 * Pure: the fleet summary line the sweep prints once per freeze. The mining
 * contract: '[unfreeze] main froze ~51.0s; cleared 12 stale pathfinder
 * goal(s), left 7 clean' - the drift names the freeze, the split names the
 * blast radius (a sweep that clears 0 goals across a real freeze means the
 * goals were already consumed - the re-spiral theory needs a second look).
 * Junk stays honest: negative sweeps clamp to 0, junk lateMs prints as-is
 * via the finite guard.
 * @param {{lateMs?: number, swept?: number, skipped?: number}} p
 * @returns {string}
 */
export function unfreezeLine ({ lateMs = 0, swept = 0, skipped = 0 } = {}) {
  const late = Number(lateMs)
  const s = Number.isFinite(Number(swept)) && Number(swept) > 0 ? Math.floor(Number(swept)) : 0
  const k = Number.isFinite(Number(skipped)) && Number(skipped) > 0 ? Math.floor(Number(skipped)) : 0
  const secs = Number.isFinite(late) && late >= 0 ? (late / 1000).toFixed(1) : '?'
  return `[unfreeze] main froze ~${secs}s; cleared ${s} stale pathfinder goal(s), left ${k} clean`
}
