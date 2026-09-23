// Per-bot mining job queue - the fix for "bots stay put" (README: Known problem).
//
// Rules that make the fleet productive:
//   1. Only REACHABLE targets are ever attempted. Reachability is decided by an injected
//      canReach(pos) test (in miner.mjs: bot.pathfinder.getPathTo with a short budget),
//      never by "we hope the pathfinder figures it out".
//   2. Every job runs under a HARD timeout. The ready-made collect() never resolves when
//      a target turns out to be unreachable mid-flight; the timeout turns that hang into
//      a normal failed job.
//   3. Failed positions are blacklisted for a while instead of being retried forever,
//      so one bad block cannot stall the whole queue.
//
// The class itself is engine-agnostic (no mineflayer import), which makes it unit-testable
// without a Minecraft server.

import { Vec3 } from 'vec3'
import { noteGlobal } from './blackbox.mjs' // (v0.62.0) freeze forensics at the pathfinder funnel

// Rejects if the promise is still pending after `ms` milliseconds, clears the timer
// in both cases (the old inline version leaked one setTimeout per call).
export function withTimeout (promise, ms, label = 'operation') {
  let timer
  const guard = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label}: timeout after ${ms}ms`)), ms)
  })
  return Promise.race([promise, guard]).finally(() => clearTimeout(timer))
}

// Axis-aligned box test shared by miner.mjs and the tests.
export function inBox (pos, box) {
  if (!box) return false
  return pos.x >= box.min.x && pos.x <= box.max.x &&
    pos.y >= box.min.y && pos.y <= box.max.y &&
    pos.z >= box.min.z && pos.z <= box.max.z
}

const keyOf = pos => `${pos.x},${pos.y},${pos.z}`

export class MiningJobQueue {
  constructor ({
    canReach = async () => true,
    execute = async () => true,
    timeoutMs = 20000,
    blacklistMs = 60000,
    maxBlacklistMs = 30 * 60000,
    maxAttempts = 2,
    maxConsecutiveFails = 12,
    log = () => {}
  } = {}) {
    this.canReach = canReach
    this.execute = execute
    this.timeoutMs = timeoutMs
    this.blacklistMs = blacklistMs
    this.maxBlacklistMs = maxBlacklistMs
    this.maxAttempts = maxAttempts
    this.maxConsecutiveFails = maxConsecutiveFails
    this.log = log
    this.jobs = [] // { pos, meta, attempts }
    this.blacklistMap = new Map() // key -> until (epoch ms). (Named -Map- because the
    // prototype method blacklist(pos, ms) must stay callable: an instance property called
    // -blacklist- would shadow it and turn every this.blacklist(pos) into a TypeError.)
    this.stats = { queued: 0, done: 0, failed: 0, timeout: 0, unreachable: 0, blacklisted: 0 }
  }

  add (pos, meta = null) {
    const key = keyOf(pos)
    if (this.jobs.some(j => j.key === key)) return false
    this.jobs.push({ key, pos: { x: pos.x, y: pos.y, z: pos.z }, meta, attempts: 0 })
    this.stats.queued++
    return true
  }

  addMany (positions, metaOf = null) {
    let n = 0
    for (const p of positions) {
      if (this.add(p, metaOf ? metaOf(p) : null)) n++
    }
    return n
  }

  get size () {
    return this.jobs.length
  }

  isBlacklisted (pos) {
    const until = this.blacklistMap.get(keyOf(pos))
    if (until == null) return false
    if (until < Date.now()) {
      this.blacklistMap.delete(keyOf(pos))
      return false
    }
    return true
  }

  blacklist (pos, ms = this.blacklistMs) {
    const capped = Math.min(ms, this.maxBlacklistMs)
    this.blacklistMap.set(keyOf(pos), Date.now() + capped)
    this.stats.blacklisted++
  }

  // First queued job that is not blacklisted and passes canReach(). Unreachable jobs
  // stay in the queue (a later mining neighbour may open a path to them) but the scan
  // remembers how many we tried, so a fully unreachable queue does not cost O(n) scans.
  async popReachable ({ maxProbe = 10 } = {}) {
    let probes = 0
    while (this.jobs.length && probes < maxProbe) {
      const job = this.jobs.shift()
      if (this.isBlacklisted(job.pos)) continue
      probes++
      // yield between probes: canReach may run synchronous pathfinding, and back-to-back
      // probes used to block the event loop long enough for the server to time the bot out
      await new Promise(resolve => setImmediate(resolve))
      let ok = false
      try {
        ok = await this.canReach(job)
      } catch (e) {
        this.log(`canReach(${job.key}) threw: ${e.message}`)
      }
      if (ok) return job
      this.stats.unreachable++
      // keep it around for a later pass, at the back of the queue
      this.jobs.push(job)
      // every remaining job was probed and every one of them was unreachable
      if (probes >= maxProbe || probes >= this.jobs.length) break
    }
    return null
  }

  // Run the whole queue. Returns the stats object (also kept on this.stats).
  async run ({ maxJobs = Infinity, shouldStop = () => false, onProgress = null } = {}) {
    let consecutiveFails = 0
    let doneJobs = 0
    while (this.jobs.length && doneJobs < maxJobs && !shouldStop()) {
      if (this.blacklistMap.size > 1000) {
        // keep the map small: drop expired entries in bulk
        for (const [k, until] of this.blacklistMap) if (until < Date.now()) this.blacklistMap.delete(k)
      }
      const job = await this.popReachable()
      if (!job) {
        // nothing reachable right now: retrying instantly would just burn CPU
        this.log('queue: no reachable job at the moment')
        break
      }
      job.attempts++
      let ok = false
      let timedOut = false
      try {
        const r = await withTimeout(this.execute(job), this.timeoutMs, `job ${job.key}`)
        ok = r !== false // execute() may return false to signal a soft failure
      } catch (e) {
        timedOut = /timeout after/.test(e.message)
        this.log(`job ${job.key} failed: ${e.message}`)
      }
      if (ok) {
        this.stats.done++
        doneJobs++
        consecutiveFails = 0
        if (onProgress) onProgress(job, this.stats)
        continue
      }
      this.stats.failed++
      if (timedOut) this.stats.timeout++
      consecutiveFails++
      // re-queue unless we already tried this position maxAttempts times
      if (job.attempts < this.maxAttempts) this.jobs.push(job)
      else this.blacklist(job.pos)
      if (consecutiveFails >= this.maxConsecutiveFails) {
        this.log(`queue: giving up after ${consecutiveFails} consecutive failures`)
        break
      }
    }
    return this.stats
  }
}

// Hard-timeout goto wrapper. On a timeout the pathfinder is explicitly STOPPED: an
// abandoned goto used to keep its A* recomputing in the background forever, and with
// searchRadius unbounded each such zombie search retained millions of graph nodes -
// 19 bots in that state were the Big Fleet's 4 GB heap OOM (v0.6.4 investigation:
// heap 109 MB -> 3550 MB in ~35 s, 99.6 % of it live A* state, reporter starved).
//
// (v0.17.4) THE CPU CLIFF: the memory half of that fix (heap cap) stopped the OOM,
// but fleet #124 starved the same way WITHOUT memory pressure - 19 simultaneous A*
// searches oversubscribed the 2-core runner, physics and the reporter stalled for
// minutes, 15 connections died, stat counters reset. Every goto now runs under a
// fleet-wide throttle; the per-call timeout starts on ACTIVATION (queued time is
// free), and callers already treat goto as best-effort so a bounded wait is safe.
import { createPathThrottle } from './pathsemaphore.mjs'
import { recordNoPath, nearNoPath, isDeadChestVerdict, NOPATH_TIMEOUT_TTL_MS } from './nopath.mjs'
import { RESCUE_MAX_MS } from './drowning.mjs'
import { createWalkGovernor, STALL_MIN_PROGRESS, FLEET_WINDOW_MS, FLEET_CHURN_LIMIT, FLEET_COOLDOWN_MS } from './walkgovernor.mjs'
import { createAllocValve, valveAdmits, startAllocValve, ALLOC_VALVE_NEAR_BLOCKS_DEFAULT } from './allocvalve.mjs' // (v0.102.0) the A* allocation storm valve
import { PATH_PRIO_BANK } from './pathsemaphore.mjs'
const fleetPaths = createPathThrottle({ maxConcurrent: Number(process.env.PATH_MAX_CONCURRENT || 6) })
export function pathThrottleStats () { return fleetPaths.stats() }

// (v0.79.0) THE REFUSAL PACE - see gotoSafe's comment. One 25ms yield per
// refusal: invisible to legitimate callers, lethal to pathological retry
// loops whose only pacing was the walk's own duration.
export const REFUSAL_PACE_MS = 25

// (v0.72.0) THE DOOMED-GOAL LEDGER - the spiral breaker at the gotoSafe funnel.
// MEASURED (run68, dispatch 35698977810, the v0.70.0 600s fleet, HARD KILL):
// TWO main-thread freezes (mainLate 150559ms at ts=461s + 63973ms at ts=661s,
// the second inside the end phase -> the margin kill), 12 reconnects behind
// them (the server keepalive-killed the frozen transports), mined halved to
// 1508 (run67: 3100) - and the blackbox named the same funnel both times:
// 'pf:queue next column <- pf:queue walk <- pf:goal walk <- pf:done climb
// rise assi', with goal->queue->done cycles ~7.5s apart = a RE-ISSUE SPIRAL:
// a task loop whose walk goal cannot close re-issues it, and EVERY re-issue
// pays a full A* think window on the main thread. path=6a/11q at the freeze -
// the queue fed the spiral. The v0.65.0 unfreeze sweep can only act at the
// FIRST probe fire after 8s late - under a saturated queue the probe itself
// starves (the sweep fired at 151s, not at 13s). The cure is the v0.70.0
// dead-chest pattern applied to EVERY walk goal: the FIRST pathfinder dead
// verdict ('No path' = proven geometry, 'Took to long' = the A* calc timeout,
// WEAK evidence - walk budgets like 'timeout after 4500ms' are transient
// saturation and NEVER record) ledgered the goal cell fleet-wide; the
// re-issue then dies at the funnel for 0 cost (no queue slot, no A*), and the
// spiral has no fuel. One process = one fleet, so a module-level array IS the
// shared ledger (the same shape as the pathThrottle singleton above).
const doomedGoals = []
const doomedStats = { records: 0, refusals: 0, rearms: 0, absorbed: 0 }

function goalCellOf (goal) {
  if (!goal || typeof goal !== 'object') return null
  const x = Number(goal.x)
  const y = Number(goal.y)
  const z = Number(goal.z)
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null
  return { x, y, z }
}

/** Record a dead-geometry verdict for a walk goal cell (fleet-wide). Mutates
 * the singleton in place (the deposit.mjs reassign pattern). (v0.96.0) THE
 * RE-DOOM BACKOFF: a re-doom of a cell that already holds a LIVE verdict is
 * ABSORBED - the verdict keeps its ORIGINAL clock (the first failure of a
 * storm owns the expiry). MEASURED (run85): F5/F14/F16 refused seven yard
 * machines 'ledgered 1s ago' x23 - each failed walk re-recorded the cell and
 * reset the age, so the 15s machine ttl never expired. The absorbed counter
 * names the spiral in the FLEET RESULT. */
export function recordDoomedGoal (cell, now, { ttl } = {}) {
  const sink = { absorbed: 0 }
  const fresh = recordNoPath(doomedGoals, cell, now, ttl !== undefined ? { ttl, absorbStats: sink } : { absorbStats: sink })
  doomedGoals.length = 0
  for (const e of fresh) doomedGoals.push(e)
  doomedStats.records++
  doomedStats.absorbed += sink.absorbed
  return doomedGoals.length
}

/** Is this walk goal cell a LIVE doomed verdict? Same hit shape as nearNoPath. */
export function nearDoomedGoal (cell, now, opts = {}) {
  return nearNoPath(doomedGoals, cell, now, opts)
}

/** Fleet summary counters for the FLEET RESULT block. */
export function doomedGoalStats () {
  return { records: doomedStats.records, refusals: doomedStats.refusals, rearms: doomedStats.rearms, absorbed: doomedStats.absorbed, live: doomedGoals.length }
}

/** (v0.72.0) The consult match radius (XZ blocks). TIGHT on purpose: the
 * re-issue spiral re-issues the SAME computed goal cell (the task state that
 * produced it is unchanged), so radius 2 covers the same-cell retry plus a
 * small snap-wander - while a wider radius would over-skip LEGIT neighbors:
 * the run68-shaped yard rows pack chests 2 blocks apart, and the v0.65.0
 * lesson measured a radius-4 probe skipping a GOOD chest 1.41 blocks away
 * (the deposit scan therefore uses the even tighter radius 1 - see
 * deposit.mjs). A refused-neighborhood recovers by TTL in 45-90s either way. */
export const DOOMED_GOAL_RADIUS = 2

/** Test hook: empty the ledger and zero the counters (never used in prod).
 * (v0.77.0) THE FUNNEL RESET FAMILY: this hook also drops the stall-governor
 * state (the per-bot WeakMap + the fleet churn ceiling + their counters) -
 * every test file that walks through the funnel calls this in beforeEach, so
 * each test starts with a clean funnel regardless of how many stationary
 * mock walks the previous tests accumulated (the ceiling is a module
 * singleton and would otherwise leak churn evidence across a file's tests). */
export function resetDoomedGoalLedger () {
  doomedGoals.length = 0
  doomedStats.records = 0
  doomedStats.refusals = 0
  doomedStats.rearms = 0
  doomedStats.absorbed = 0
  walkGovernors = new WeakMap()
  walkGovernorStats.refusals = 0
  walkGovernorStats.opens = 0
  walkGovernorStats.fleetRefusals = 0
  walkGovernorStats.fleetOpens = 0
  try { fleetCeiling.reset() } catch { /* never fails */ }
}

// (v0.74.0) THE STALL GOVERNOR - the CHURN breaker, the per-bot sibling of the
// doomed-goal ledger above. MEASURED (run68): the spiral returned with ZERO
// pathfinder dead verdicts (0 ledger records, 0 'Took to long', 20x budget
// timeouts) and the blackbox showed goals queued AND done at a ~7.5s cadence
// INSIDE the 151s freeze - the main thread was churning, not blocked. Fuel:
// starved physics stalls every walk, each task loop escalates to ANOTHER walk,
// every re-issue pays setGoal -> resetPath -> an A* burst. The budget timeouts
// correctly never record (geometry unproven), so the ledger had nothing to
// catch. The governor judges the WALKER instead: STALL_CHURN_LIMIT settled
// walks with zero position progress inside STALL_WINDOW_MS open a per-bot
// stall - gotoSafe refuses new goals for STALL_COOLDOWN_MS at zero cost (no
// queue slot, no setGoal, no A*) and the caller's ladder falls through to its
// non-walk rungs. A real progress walk (>1 block) clears the streak; a bot
// that moves while the stall is open (rescue hauled it, gravity dropped it)
// closes the stall early - an honest governor never traps a bot that can walk.
// Per-bot by construction: one state machine per bot in a WeakMap - one wedged
// bot never strangles the fleet; 19 wedged bots each stop feeding the
// pathfinder and the storm starves.
let walkGovernors = new WeakMap()
const walkGovernorStats = { refusals: 0, opens: 0, fleetRefusals: 0, fleetOpens: 0 }

// (v0.77.0) THE FLEET CHURN CEILING - the aggregate breaker: one governor for
// the whole process (one process = one fleet). See walkgovernor.mjs for the
// evidence. Bank-priority walks consult it but are never refused by it.
const fleetCeiling = createWalkGovernor({
  windowMs: FLEET_WINDOW_MS,
  churnLimit: FLEET_CHURN_LIMIT,
  minProgress: STALL_MIN_PROGRESS,
  cooldownMs: FLEET_COOLDOWN_MS,
  onOpen: () => { walkGovernorStats.fleetOpens++ }
})

function walkGovernorFor (bot) {
  let g = walkGovernors.get(bot)
  if (!g) {
    g = createWalkGovernor({ onOpen: () => { walkGovernorStats.opens++ } })
    walkGovernors.set(bot, g)
  }
  return g
}

/** The bot's floored position, or null when unmeasurable (mocks, teardown). */
function walkPosOf (bot) {
  try {
    const p = bot && bot.entity && bot.entity.position
    return p && typeof p.floored === 'function' ? p.floored() : null
  } catch { return null }
}

/** Record one settled walk outcome into the bot's governor (never throws).
 * progress = displacement in blocks between the walk's start and end; ok =
 * whether the walk SUCCEEDED (v0.79.0: zero-progress successes are no-ops,
 * not churn fuel). */
function recordWalkOutcome (bot, startPos, ok) {
  try {
    const g = walkGovernorFor(bot)
    const endPos = walkPosOf(bot)
    let progress = null
    if (startPos && endPos && typeof startPos.distanceTo === 'function') {
      const d = startPos.distanceTo(endPos)
      if (Number.isFinite(d)) progress = d
    }
    g.recordOutcome(progress, Date.now(), { ok })
    fleetCeiling.recordOutcome(progress, Date.now(), { ok }) // the aggregate breaker feeds on every walk
  } catch { /* a governor record must never mask the walk's own result */ }
}

/** Fleet summary counters for the FLEET RESULT block. */
export function walkGovernorStatsFor () {
  return {
    refusals: walkGovernorStats.refusals,
    opens: walkGovernorStats.opens,
    fleetRefusals: walkGovernorStats.fleetRefusals,
    fleetOpens: walkGovernorStats.fleetOpens
  }
}

// (v0.102.0) THE ALLOCATION VALVE - the fleet-scoped singleton (one process =
// one fleet, the fleetCeiling shape). run92 (35829873166): the main thread
// allocated ~1.9GB in 10s (190MB/s) at ts~445s while STILL TICKING (mainLate
// 2006ms) - the pathfinder A* fed by the end-phase mass chest walks across a
// flooded region - and the worker stormguard's second-strike SIGTERM erased a
// probable NORMAL END at 510/600s. The valve watches the main thread's OWN
// rss every 1s (startAllocValve in fleet19) and gotoSafe consults it here:
// while closed, LONG walks (straight-line bot->goal > 24 blocks) are refused
// at the funnel - the A* loses its fuel, GC drains the garbage, the valve
// reopens after 12s (30s escalated). Short walks (rescues <=12, climbs, next-
// column steps) still flow - a drowning bot never waits on a memory valve.
const fleetValve = createAllocValve({})
const valveStats = { refusals: 0, nearPasses: 0, hazardRefusals: 0 }
// (v0.104.0) THE AQUIFER BOARD - fleet19 sets this at boot (the shared
// HazardLedger's near()); the closed valve's near exemption consults it so a
// near walk into live hazard water is refused too (near is not cheap in a
// flooded region - run93). Null/unset board = the v0.102.0 distance-only
// shape, byte for byte; a throwing/junk reader judges NOTHING (admits).
let fleetHazardNear = null
export function setFleetHazardNear (fn) { fleetHazardNear = typeof fn === 'function' ? fn : null }

/** Test/fleet control surface for the valve singleton. */
export function allocValveControl () {
  return {
    sample: rssMb => fleetValve.sample(rssMb),
    consult: () => fleetValve.consult(),
    forceClose: a => fleetValve.forceClose(a), // (v0.104.0) the external-verdict backstop (tests, future feeders)
    reset: () => fleetValve.reset()
  }
}

/** (v0.104.0) THE FLEET VALVE TICKER - the SINGLETON's own feeder. fleet19
 * calls this instead of startAllocValve's bare form: run93 (35835942682)
 * shipped TWO instances - the ticker fed a private valve while this module's
 * funnel consulted the never-sampled singleton, so the cure could not refuse
 * a single walk and run92's OOM class killed the run again (zero [allocvalve]
 * lines, worker second strike at rss 2626M). The ticker now feeds the SAME
 * instance gotoSafe consults. opts pass through: { intervalMs, onLine,
 * stormCell } (stormCell = the worker-probe SAB channel, the freeze-class
 * backstop feeder). */
export function startFleetValveTicker (opts = {}) {
  return startAllocValve({ valve: fleetValve, ...opts })
}

/** Fleet valve counters for the FLEET RESULT block. */
export function allocValveStatsFor () {
  const st = valveStats
  const snap = fleetValve.consult()
  return { refusals: st.refusals, nearPasses: st.nearPasses, hazardRefusals: st.hazardRefusals, closes: snap.closes, strikes: snap.strikes, closedNow: snap.closed, workerCloses: fleetValve.stats().workerCloses }
}

/** Straight-line 3D distance bot -> goal cell, or null when unmeasurable
 * (no entity, junk goal, junk position - mocks, teardown). The valve's near
 * exemption is measured on THIS: provably near, or refused while closed. */
function walkDistanceOf (bot, goal) {
  try {
    const p = bot && bot.entity && bot.entity.position
    const c = goalCellOf(goal)
    if (!p || !c) return null
    const dx = Number(p.x) - c.x
    const dy = Number(p.y) - c.y
    const dz = Number(p.z) - c.z
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz)
    return Number.isFinite(d) ? d : null
  } catch { return null }
}

/** Test hook: drop every per-bot governor (never used in prod). */
export function resetWalkGovernors () {
  walkGovernors = new WeakMap()
  walkGovernorStats.refusals = 0
  walkGovernorStats.opens = 0
  walkGovernorStats.fleetRefusals = 0
  walkGovernorStats.fleetOpens = 0
  try { fleetCeiling.reset() } catch { /* never fails */ }
  try { fleetValve.reset() } catch { /* never fails */ }
  valveStats.refusals = 0
  valveStats.nearPasses = 0
}
// (v0.20.0) THE 'Path was stopped' ROOT CAUSE, closed at the single choke point.
//
// MEASURED: fleet #128 (77 bank attempts, banked=0), the v0.19.0 yard-walk retries
// (19 walks, every one still died), the v0.19.2 final bank (12-15x 'Path was
// stopped'). The library-level trace (node_modules/mineflayer-pathfinder):
//
//   1. any goto error path calls bot.pathfinder.stop() (gotoSafe's own catch does
//      it too) which only sets a module flag: stopPathing = true;
//   2. that flag is consumed ONLY by: arriving at the next path point, a
//      resetPath() from a block update near a NON-EMPTY path, or the next
//      setGoal(). A STANDING bot (empty path - stuck against a wall, timeout
//      between A* recomputes) consumes NOTHING: GoalNear.isValid() is a constant
//      true and the base Goal.hasChanged() is a constant false, so the
//      monitorMovement stop paths never fire;
//   3. the flag therefore survives the 2-tick settle INDEFINITELY, and the NEXT
//      goto dies instantly: gotoUtil registers its 'path_stop' listener, calls
//      setGoal -> resetPath('goal_updated') -> `if (stopPathing) return stop()`
//      -> stop() emits 'path_stop' SYNCHRONOUSLY -> the fresh listener rejects
//      with 'Path was stopped before it could be completed!'.
//
// The settle window (the v0.13.0/CI 35491904900 fix) only covers the MOVING-bot
// race. The standing-bot flag is unconsumable by ticks - it must be cleared
// BEFORE the new goal: setGoal(null) while the bot is not moving runs
// resetPath -> stop(), consuming the stale flag and emitting 'path_stop' into
// EMPTY space (no goto listener is registered yet). An active walk (isMoving())
// is left untouched - the second-goto fight keeps today's semantics.
//
// The one-shot 'path_stop' spy during setGoal(null) is the precise stale-flag
// signature: it fires ONLY when stop() ran, i.e. the flag was really set.
let staleStopClears = 0
export function gotoSafeStats () { return { staleStopClears } }

function clearStaleStop (bot) {
  try {
    const pf = bot.pathfinder
    if (!pf || typeof pf.setGoal !== 'function' || typeof pf.isMoving !== 'function') return // bare mocks keep passing
    if (pf.isMoving()) return // an active walk owns the goal slot - do not disturb it
    let stale = false
    const spy = () => { stale = true }
    if (typeof bot.on === 'function') bot.on('path_stop', spy)
    try { pf.setGoal(null) } finally {
      if (typeof bot.removeListener === 'function') bot.removeListener('path_stop', spy)
    }
    if (stale) staleStopClears++
  } catch { /* diagnostics must never block the walk they precede */ }
}

export function gotoSafe (bot, goal, { timeoutMs = 25000, label = 'walk', priority = 0, doomedRearm = false, doomTtl = null } = {}) {
  // (v0.79.0) THE REFUSAL PACE - every funnel refusal costs the caller one
  // real event-loop yield before the throw. MEASURED (run73's CI integration
  // sibling, the 13:32:00 window): once the doomed-goal ledger + the governor
  // made the failure path FREE, caller loops whose only pacing was the
  // walk's own duration spun at ~5ms per cycle ('queue: no reachable job' x
  // 17836 in one run, 'batch done' + consult-throw + re-loop back to back) -
  // and a 5ms sync cycle starves the timers phase EXACTLY like an A* storm
  // did. The pace is invisible to legitimate callers (one 25ms yield per
  // refusal) and caps a pathological loop's rate at ~40 cycles/s per
  // refused walk instead of thousands.
  const refuse = async message => {
    await new Promise(r => setTimeout(r, REFUSAL_PACE_MS))
    throw new Error(message)
  }
  // (v0.13.0) drowning rescue gate: while a swim rescue is in flight the
  // pathfinder must NOT issue new goals - each one re-engages its own control
  // states and fights the raw swim controls (the same lesson as tunnel/shelter:
  // pathfinder and raw controls cannot share the bot). Every caller already
  // catches, so a refusal costs the caller one wasted attempt, not a crash.
  if (bot._waterRescue) return refuse(`water rescue in progress (${label} refused)`)
  // (v0.72.0) THE DOOMED-GOAL CONSULT - before the queue, before the A*.
  // A ledgered cell dies here for 0 cost: no queue slot, no think window, no
  // spiral fuel. The refusal message names the age so the caller's own verdict
  // log shows WHY the walk never queued.
  const gcell = goalCellOf(goal)
  if (gcell) {
    const doomed = nearDoomedGoal(gcell, Date.now(), { radius: DOOMED_GOAL_RADIUS })
    if (doomed.hit) {
      // (v0.87.0) THE YARD RE-ARM: the doomed verdict is FLEET-WIDE on the GOAL
      // cell, but the doomed geometry is the FAILED BOT'S START. Run78 measured
      // the poisoning: one bot's failed yard walk from the quarry dooms the
      // yard goal for the WHOLE fleet ('doomed goal (ledgered 55s ago at
      // [-143,73,410]) - walk to yard refused' on a bot that may stand at the
      // surface 20 blocks from the chests), every fresh failure re-records the
      // cell, and the economy hub stays blacklisted while banked halves.
      // doomedRearm is the opt-out for SHARED destinations only: the caller
      // (the yard chain) re-issues ONCE per retry with the ledger intact for
      // every other goal - the walk tries honestly from THIS bot's start, a
      // bounded A* think replaces the free refusal, and the re-arm is counted
      // so the run log shows how often the poisoning happened.
      if (doomedRearm) {
        doomedStats.rearms++
      } else {
        doomedStats.refusals++
        return refuse(`doomed goal (ledgered ${Math.round(doomed.ageMs / 1000)}s ago at [${gcell.x},${gcell.y},${gcell.z}]) - ${label} refused`)
      }
    }
  }
  // (v0.74.0) THE STALL GOVERNOR CONSULT - the churn breaker, after the
  // geometry consult, before the queue. A bot mid-stall walks nowhere right
  // now; its re-issues are pure spiral fuel. The refusal is honest and named
  // so the caller's log shows WHY the walk never queued. The early close
  // rides INSIDE consult: a bot that moved on its own (rescue, fall) walks
  // again immediately - the governor never traps a recoverable walker.
  try {
    const gov = walkGovernorFor(bot)
    // the consult itself OPENS the stall when the churn evidence is already
    // sufficient - the refusal and the open are one atomic verdict
    const verdict = gov.consult(walkPosOf(bot), Date.now())
    if (verdict.open) {
      walkGovernorStats.refusals++
      return refuse(`walk governor: bot churned ${verdict.churn} goals without progress - ${label} refused for ${Math.round(verdict.remainingMs / 1000)}s`)
    }
  } catch (e) {
    if (e && /walk governor/.test(e.message)) return refuse(e.message) // the refusal itself, paced
    /* governor failures never block the walk they precede */
  }
  // (v0.77.0) THE FLEET CHURN CEILING - the aggregate breaker, after the
  // per-bot consult. The per-bot limit leaves the fleet's AGGREGATE churn
  // burst unbounded (fresh bot objects from relogins, cooldown expiries); the
  // ceiling caps the whole process. BANK-priority walks are EXEMPT - the only
  // walks that turn mined blocks into banked stock must flow even mid-storm.
  try {
    const fv = fleetCeiling.consult(null, Date.now())
    if (fv.open && priority < PATH_PRIO_BANK) {
      walkGovernorStats.fleetRefusals++
      return refuse(`fleet churn ceiling: ${fv.churn} zero-progress walks fleet-wide - ${label} refused for ${Math.round(fv.remainingMs / 1000)}s`)
    }
  } catch (e) {
    if (e && /fleet churn ceiling/.test(e.message)) return refuse(e.message) // the refusal itself, paced
    /* the ceiling never blocks the walk it precedes */
  }
  // (v0.102.0) THE ALLOCATION VALVE CONSULT - the memory breaker, after the
  // churn breakers, before the queue. While closed, only PROVABLY near walks
  // flow (straight-line <= 24 blocks: rescues/climbs/next-columns); every
  // LONG walk is refused with the storm numbers in the message so the
  // caller's own log shows WHY. No bank-priority exemption BY DESIGN: the
  // fuel IS the long A*, and a bank walk through the flooded region is
  // exactly the walk that detonated run92 - banking pauses 12-30s, the run
  // survives. An open valve is a no-op (junk state never refuses).
  try {
    const vs = fleetValve.consult()
    if (vs && vs.closed) {
      // (v0.104.0) the aquifer board read: is this walk's GOAL in live hazard
      // water? Junk goal (goalCellOf null), unset board and a throwing reader
      // all judge NOTHING (false) - the v0.102.0 distance-only admission.
      let goalHazardNear = false
      if (fleetHazardNear) {
        try { goalHazardNear = fleetHazardNear(goalCellOf(goal)) != null } catch { goalHazardNear = false }
      }
      if (valveAdmits({ closed: true, distanceBlocks: walkDistanceOf(bot, goal), nearBlocks: ALLOC_VALVE_NEAR_BLOCKS_DEFAULT, goalHazardNear })) {
        valveStats.nearPasses++
      } else {
        valveStats.refusals++
        if (goalHazardNear) valveStats.hazardRefusals++
        return refuse(`alloc valve: closed (storm ${vs.lastRate}MB/s at rss ${vs.lastRss}M) - ${label} refused${goalHazardNear ? ' (goal in live hazard water, the aquifer gate)' : ''} for ${Math.round(vs.remainingMs / 1000)}s`)
      }
    }
  } catch (e) {
    if (e && /alloc valve/.test(e.message)) return refuse(e.message) // the refusal itself, paced
    /* the valve never blocks the walk it precedes */
  }
  // (v0.62.0) FREEZE FORENSICS: gotoSafe is THE funnel for every pathfinder
  // goal - the A* think that answers is a SYNC main-thread block (up to the
  // 4.5s think window per search) and run60's 150s freeze had no witness.
  // The ring note is one interned store; the dump names the last labels
  // before any future gap. The queue entry + the run start bracket the wait
  // ('pf:queue walk' then 'pf:goal walk') so a saturated queue and a deep
  // search leave different fingerprints.
  noteGlobal(`pf:queue ${label}`)
  // (v0.21.0) priority rides through to the fleet queue: bank walks (PATH_PRIO_BANK)
  // jump ahead of mining-column walks under saturation - a queued bank walk burns
  // its dist-scaled budget in line while a mining delay costs nothing at all.
  let walkOk = false
  return fleetPaths.run(() => {
    clearStaleStop(bot) // (v0.20.0) consume a stale stopPathing flag BEFORE the new goal registers its listeners
    noteGlobal(`pf:goal ${label}`)
    const startPos = walkPosOf(bot) // (v0.74.0) the walk's displacement feeds the stall governor
    return withTimeout(bot.pathfinder.goto(goal), timeoutMs, label)
      .then(r => { walkOk = true; return r })
      .finally(() => {
        noteGlobal(`pf:done ${label}`)
        recordWalkOutcome(bot, startPos, walkOk)
      })
  }, { priority }).catch(e => {
    try { bot.pathfinder.stop() } catch { /* already stopped / never started */ }
    // (v0.65.0) THE ZOMBIE GOAL KILL (the source edge of the unfreeze sweep):
    // stop() only SETS a flag, and an unreachable goal's recompute loop
    // CONSUMES that flag and re-engages on the next physics tick - run63
    // (dispatch 35677752396) measured the result: '[blackbox] main freeze
    // ~51s; last: pf:goal deploy @+0.0s' with pf:done never coming, 39
    // transport losses behind it. The timed-out walk OWNS the goal slot
    // (nothing else can legitimately hold it - the rescue gate refuses new
    // gotos while _waterRescue runs), so clearing the slot itself is the
    // kill the flag alone can never be.
    try {
      const pf = bot.pathfinder
      if (pf && typeof pf.setGoal === 'function') pf.setGoal(null)
    } catch { /* the flag from stop() still bounds the damage */ }
    // (v0.72.0) THE DEAD-GEOMETRY RECORD: the pathfinder's own dead verdicts
    // ('No path' proven / 'Took to long' the A* calc timeout) ledger the goal
    // cell so the fleet's re-issues die at the consult above. Walk-budget
    // timeouts ('timeout after Nms') are transient saturation, NOT geometry -
    // they never record (isDeadChestVerdict returns dead:false for them).
    // (v0.92.0) THE CALLER'S TTL: a finite doomTtl >= 0 overrides BOTH verdict
    // lifetimes - the machine walk passes MACHINE_DOOM_TTL_MS (15s) because a
    // furnace is static and known-good, its doom is saturation not geometry,
    // and a 90s blacklist killed a fresh camp furnace for a whole run (run81).
    const doomedVerdict = isDeadChestVerdict(e && e.message)
    if (doomedVerdict.dead && gcell) {
      try {
        const callerTtl = Number.isFinite(doomTtl) && doomTtl >= 0 ? { ttl: doomTtl } : null
        recordDoomedGoal(gcell, Date.now(), callerTtl ?? (doomedVerdict.timeout ? { ttl: NOPATH_TIMEOUT_TTL_MS } : {}))
      } catch { /* a ledger record must never mask the walk's own error */ }
    }
    // (CI 35491904900) stop() only SETS a flag; the library consumes it on the
    // next physics tick - or, for a standing bot, at the NEXT goto's setGoal
    // (v0.20.0: clearStaleStop above is what now actually defuses that case;
    // the settle below still covers the moving-bot tick race).
    const settle = typeof bot.waitForTicks === 'function'
      ? withTimeout(bot.waitForTicks(2), 400, 'goto settle').catch(() => { /* bot going down: rethrow below */ })
      : Promise.resolve()
    return settle.then(() => { throw e })
  })
}

// (v0.18.2) Bounded wait for the drowning-rescue interlock to clear.
//
// MEASURED (CI run 35511474490, smelting pipeline): the smelt bot dug its shaft
// into a water pocket - 'rescue start (oxygen 14)' - and placed its furnace
// anyway. The furnace walk 2 s later was refused x3 at 500 ms apart (all inside
// the rescue's 25 s window) and the whole visit aborted on 'machine unreachable'
// - while the rescue still had 23 s of window that would have cleared. The same
// interlock ate F8's final bank ('walk to yard refused').
//
// The gate itself stays FAIL-FAST on purpose (a pathfinder goal mid-swim fights
// the raw controls). This helper is for RETRYING callers: wait until the rescue
// finished (or its window expired) before burning the next attempt.
//
// @param {object} bot a mineflayer bot (or a mock with the same _waterRescue flag)
// @param {object} [p]
// @param {number} [p.maxMs] total wait ceiling - defaults to the rescue's own
//   window plus settle margin (a rescue that outlives its window is a stuck
//   sentry, and the caller's own retry bound must stop it, not this helper)
// @param {number} [p.pollMs] poll interval
// @param {Function} [p.sleep] injectable delay (tests use a fake clock)
// @returns {Promise<boolean>} true = the interlock cleared, false = still held
//   after maxMs (or the bot object was absent)
export async function waitForWaterRescueClear (bot, {
  maxMs = RESCUE_MAX_MS + 5000,
  pollMs = 1000,
  sleep = ms => new Promise(r => setTimeout(r, ms))
} = {}) {
  if (!bot) return false
  const budget = Number.isFinite(maxMs) && maxMs > 0 ? maxMs : RESCUE_MAX_MS + 5000
  const step = Number.isFinite(pollMs) && pollMs > 0 ? pollMs : 1000
  let waited = 0
  while (bot._waterRescue && waited < budget) {
    const slice = Math.min(step, budget - waited)
    await sleep(slice)
    waited += slice
  }
  return !bot._waterRescue
}

// (v0.19.0) Retry policy for the fleet's long walks (the yard bank walk).
// MEASURED (fleet run on v0.18.15, 600s): 25 yard walks, 0 arrivals, banked=0
// with 3298 blocks held in pockets - 6 walks died on the water-rescue
// interlock ('walk to yard refused' while the rescue still had >20s of
// window; waitForWaterRescueClear exists exactly for that and was never used
// here) and the rest on 'Path was stopped before it could be completed' (the
// gotoSafe settle window poisons a goto that starts inside ~50ms after a
// stop - a transient, not geometry). Both classes are RETRYABLE. A real
// 'timeout after Nms' means the walk budget ran out on real distance: one
// retry max, then hand the bot its mining loop back.
//
// @param {object} p
// @param {Error|string} [p.error] the gotoSafe rejection
// @param {number} [p.attempt] 1-based walk attempt the error came from
// @param {number} [p.maxAttempts] walk-attempt budget (wait-rescue does not
//   grant extra walks - runtime bounds stay hard)
// @returns {{action: 'wait-rescue'|'immediate'|'timeout-retry'|'give-up', waitMs?: number}}
export function walkRetryPlan ({ error, attempt = 1, maxAttempts = 3 } = {}) {
  if (!error || attempt >= maxAttempts) return { action: 'give-up' }
  const msg = error && error.message ? error.message : String(error)
  if (/water rescue/i.test(msg)) return { action: 'wait-rescue', waitMs: RESCUE_MAX_MS + 5000 }
  if (/Path was stopped/i.test(msg)) return { action: 'immediate' }
  if (/timeout after/i.test(msg)) return attempt === 1 ? { action: 'timeout-retry' } : { action: 'give-up' }
  // (v0.87.0) THE DOOMED-RETRY: a doomed verdict is one bot's start geometry
  // recorded fleet-wide on the goal cell (run78: the yard blacklisted by the
  // quarry bots' failures while surface bots stood 20 blocks from the chests).
  // The caller re-issues ONCE with doomedRearm: true - the ledger stays intact
  // for every other goal, the walk tries from THIS bot's start. Unknown to the
  // deposit chain's switch it falls through to its give-up (chest verdicts are
  // per-chest geometry and stay honest).
  if (/doomed goal/i.test(msg)) return { action: 'doomed-retry' }
  return { action: 'give-up' }
}

// A walk goal the fleet can actually reach: snap the requested column to the nearest
// STANDABLE spot (solid ground, air feet + head) around it. Raw GoalNear targets computed
// as "current position + offset" regularly landed inside unexcavated stone or inside a
// tree trunk - the pathfinder then planned toward a cell it could never occupy, which was
// one of the degenerate searches behind the Big Fleet heap OOM (v0.6.4 investigation).
//
// GoalNear.isEnd is a 3D SPHERE, so a goal ABOVE the column (my first fallback) is
// unreachable for a walker and burns the whole goto timeout: the v0.6.6 fleet run
// collapsed its tool phase to 8/19 bots because of exactly that. Order of preference
// here: the cell itself -> DOWN (falling is cheap, maxDropDown=4) -> up at most 2 (a
// walker steps/jumps 1-2 blocks; higher standable spots on the same column are e.g. a
// trunk top - "standable" but unreachable) -> a ring of neighboring columns -> the raw
// requested cell (searchRadius bounds the A*, the caller's timeout bounds the wait).
export function standGoalNear (bot, goals, x, y, z, { range = 1, maxShift = 6 } = {}) {
  const px = Math.floor(x)
  const pz = Math.floor(z)
  const py = Math.floor(y)
  const standable = (cx, yy, cz) => {
    const feet = bot.blockAt(new Vec3(cx, yy, cz))
    const head = bot.blockAt(new Vec3(cx, yy + 1, cz))
    const ground = bot.blockAt(new Vec3(cx, yy - 1, cz))
    return !!ground && ground.boundingBox !== 'empty' &&
      (!feet || feet.boundingBox === 'empty') &&
      (!head || head.boundingBox === 'empty')
  }
  if (standable(px, py, pz)) return new goals.GoalNear(px, py, pz, range)
  for (let d = 1; d <= maxShift; d++) {
    if (standable(px, py - d, pz)) return new goals.GoalNear(px, py - d, pz, range)
  }
  for (let d = 1; d <= 2; d++) {
    if (standable(px, py + d, pz)) return new goals.GoalNear(px, py + d, pz, range)
  }
  // sealed column (tree trunk, wall): the nearest standable spot NEXT to it. The goal
  // sits on the neighbor column, so the walker ends up within reach of the target.
  const ring = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]
  for (let r = 1; r <= 3; r++) {
    for (const [ox, oz] of ring) {
      const nx = px + ox * r
      const nz = pz + oz * r
      if (standable(nx, py, nz)) return new goals.GoalNear(nx, py, nz, range + 1)
      for (let d = 1; d <= 2; d++) {
        if (standable(nx, py - d, nz)) return new goals.GoalNear(nx, py - d, nz, range + 1)
        if (standable(nx, py + d, nz)) return new goals.GoalNear(nx, py + d, nz, range + 1)
      }
    }
  }
  // last resort: the requested cell itself (possibly buried). With searchRadius=32 the
  // A* stays finite, and for underground shaft-to-shaft walks digging toward the cell is
  // exactly the desired behavior (canDig=true).
  return new goals.GoalNear(px, py, pz, Math.max(range, 2))
}
