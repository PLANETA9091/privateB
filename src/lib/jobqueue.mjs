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
import { createGoalBrake, GOAL_WINDOW_MS, GOAL_BURST_LIMIT, GOAL_COOLDOWN_MS, FLEET_GOAL_WINDOW_MS, FLEET_GOAL_BURST_LIMIT, FLEET_GOAL_COOLDOWN_MS, FLEET_GOAL_ESCALATED_MS, FLEET_GOAL_RECLOSE_WINDOW_MS } from './goalbrake.mjs' // (v0.143.0) the re-issue cadence brake - the storm's rate knob
import { createAllocValve, valveAdmits, startAllocValve, stormCellApply, funnelStormVerdict, funnelSlowVerdict, FUNNEL_SLOW_WINDOW_MS_DEFAULT, valveFunnelCloseLine, ALLOC_VALVE_NEAR_BLOCKS_DEFAULT } from './allocvalve.mjs' // (v0.102.0) the A* allocation storm valve; (v0.121.0) the funnel probe rides the same module; (v0.145.0) the slow envelope
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
const fleetValve = createAllocValve({ onState: () => { try { if (typeof fleetGoalSweeper === 'function') fleetGoalSweeper() } catch { /* a sweep never kills the valve's own verdict */ } } }) // (v0.143.0) the sweep-on-close rides the valve's own close transitions (the storm brake union)
const valveStats = { refusals: 0, nearPasses: 0, hazardRefusals: 0, duckRefusals: 0 }
// (v0.104.0) THE AQUIFER BOARD - fleet19 sets this at boot (the shared
// HazardLedger's near()); the closed valve's near exemption consults it so a
// near walk into live hazard water is refused too (near is not cheap in a
// flooded region - run93). Null/unset board = the v0.102.0 distance-only
// shape, byte for byte; a throwing/junk reader judges NOTHING (admits).
let fleetHazardNear = null
export function setFleetHazardNear (fn) { fleetHazardNear = typeof fn === 'function' ? fn : null }

// (v0.121.0) THE FUNNEL PROBE - the storm sentinel ON the walk funnel.
// run105 (35903689995) died with the valve never closing: BOTH feeders (the 1s
// rss ticker + the storm-cell poll inside it) live on the main thread's TIMER
// phase, and the allocation storm starves exactly that phase - while the
// funnel's own pf:goal/pf:done notes marched at 0.2s cadence THROUGH the kill
// window. The worker probed the storm and published the verdict into the cell
// - and the verdict died there: nobody on the timer side ever applied it.
// THE CURE: every gotoSafe consult first (a) polls the storm cell and applies
// a fresh worker verdict INLINE (the funnel reads the SAB directly - the
// publish survives the frozen timers), then (b) reads rss on the consult path
// and closes the valve on the funnel's own storm verdict (the pure arithmetic
// lives in allocvalve.funnelStormVerdict: floor 450M, bar 80MB/s over a real
// 150ms+ gap - the full gain, GC noise never clears it). The probe is the
// same path that marched through run105's kill window - it cannot starve
// while walks are being issued. Junk/throwing readers and a dead cell never
// block the walk they precede; the probe NEVER samples the queue arm (that
// stays the ticker's job - the funnel's gap arithmetic knows nothing of
// depth). State rides module scope: the cell wiring is boot-time (a seq reset
// would re-apply a STALE verdict - never reset the seq, only the reading and
// the counters), the prev reading is per-storm (resetWalkGovernors clears it).
let funnelPrev = null // { ts, rss } - the last REAL reading (junk reads leave it, dips replace it)
let funnelSlow = null // (v0.144.0) { ts, rss } - the dip-immune slow envelope anchor (slides every >=5s)
let funnelCell = null // the worker-probe SAB (testbed/fleet19 wires it at boot)
let funnelCellSeq = 0 // the last applied seq - NEVER reset while the cell lives (a reset re-applies a stale verdict)
let funnelLogger = null // the close lines ride the fleet's log through this (fleet19 wires console.log)
let funnelRssReader = null // test injection; default process.memoryUsage
let funnelNow = null // test injection; default Date.now
const funnelStats = { stormCloses: 0, slowCloses: 0, cellCloses: 0, reads: 0, junkReads: 0 }

/** (v0.121.0) fleet19 boot wiring: hand the funnel the SAME storm cell the
 * ticker polls. A junk/missing sab degrades to no cell (the funnel's own rss
 * verdict still works); re-setting a cell resets the seq - a NEW cell's seq
 * space starts at 0 by contract (the writer increments from whatever it finds). */
export function setFleetValveStormCell (sab) { funnelCell = sab || null; funnelCellSeq = 0 }

/** (v0.121.0) the funnel probe's close lines ride the fleet log through this. */
export function setFunnelProbeLogger (fn) { funnelLogger = typeof fn === 'function' ? fn : null }

/** Test/boot control surface for the funnel probe (the state machine is
 * module scope - one funnel per process, by construction). */
export function funnelProbeControl () {
  return {
    stats: () => ({ ...funnelStats }),
    setSources ({ rssReader = null, nowMs = null } = {}) {
      funnelRssReader = typeof rssReader === 'function' ? rssReader : null
      funnelNow = typeof nowMs === 'function' ? nowMs : null
    },
    reset () {
      funnelPrev = null
      funnelSlow = null
      funnelStats.stormCloses = 0
      funnelStats.slowCloses = 0
      funnelStats.cellCloses = 0
      funnelStats.reads = 0
      funnelStats.junkReads = 0
      // funnelCellSeq is deliberately NOT reset: the cell lives, its seq space
      // lives - a reset here would re-apply an already-applied verdict
    }
  }
}

// (v0.143.0) THE STORM DUCK - the near exemption's ceiling. MEASURED (fleet
// leg 35994461858, the v0.142.0 union, mined 2026-09-24): the storm probe
// fired at rss 989M -> 2114M (+225MB/s) with the familiar next-column
// signature (pf:goal next column alt <- pf:queue next column <- pf:done next
// column <- climb), the v0.141.0 machinery held the kill (GRACE HOLD at
// 2882M) - and the hard ceiling killed at 3462M anyway, 181s/600s in. TWO
// holes, both measured in the same log:
//   (1) the valve was closed since ts=86s (the queue-pressure arm, strike 1)
//       and the storm STILL ramped - the near exemption (<=24b "still flow")
//       is exactly the walk class the storm was made of: next-column steering
//       is a near walk BY CONSTRUCTION, so a closed valve cannot starve it;
//   (2) the lag-probe feeder (the 250ms applier that survived run 576's
//       storm at mainLate 959ms) never landed its closure - run58's heavier
//       class stopped the event loop turning at all after the probe (the
//       768ms reading predates the probe; the +1125M/5s ramp is the A* thinks
//       growing until nothing but them runs).
// THE DUCK: any live storm verdict - the worker's cell (applied at the funnel
// or the lag probe) OR the funnel's own rss arithmetic - arms a fleet-wide
// pathfinder pause: for DUCK_MS every gotoSafe consult refuses EVERY walk
// (near included, bank included - the fuel IS every goal) and the arm sweeps
// the in-flight goals (the v0.65.0 zombie-kill mechanics). The consults keep
// coming at the callers' own retry cadence (the 25ms refusal pace bounds them
// at ~40/s per bot), the A* gets zero new fuel within one think window, GC
// drains, the worker's streak resets on the dip and the second strike never
// arms. Rescues do not go through this funnel (raw swim controls) - the duck
// never traps a drowning bot. The worker's grace + ceiling stay byte for
// byte: a duck that fails to stop the growth still dies readably at 3000M.
export const STORM_DUCK_MS_DEFAULT = 15000 // the duck window: inside the worker's 20s grace, one walk-timeout cycle longer than the ~11s wind-down
// (v0.144.0) THE FAR-GOAL THINK CAP knobs (see gotoSafe). A 24-radius/500ms
// burst retains ~4x fewer nodes than the boot 32/2000 and yields 4x sooner -
// the fleet's worst single burst drops from the ~GB class (run80's +2.3GB
// wedge) to the few-hundred-MB class the GC drains between bursts.
export const FAR_GOAL_SEARCH_RADIUS = 24
export const FAR_GOAL_THINK_TIMEOUT_MS = 500
let duckUntilMs = 0
let duckArms = 0
let duckSeqApplied = -1 // the cell seq that armed the current duck (one verdict, one arm)
let duckLastSwept = 0
let duckLastSource = ''
let duckSweeper = null // fleet19 registers stormSweepAllGoals - the lib never touches the bots directly

/** Register the in-flight goal sweeper the arm calls (once per arm). */
export function setFleetDuckSweeper (fn) { duckSweeper = typeof fn === 'function' ? fn : null }

/** Arm the duck: every gotoSafe walk refused for duckMs, the sweeper runs
 * once. Idempotent per cell seq (the same verdict never re-arms); a seq-less
 * arm is the CALLER's gate - the funnel only arms seq-less when not already
 * active. Returns { fresh, swept, remainingMs, source, rate, rss } or null
 * on a duplicate seq. Junk-safe: every degenerate input still arms (the
 * storm verdicts are too expensive to lose to an arithmetic typo). */
export function armStormDuck ({ source = 'funnel probe', rate = 0, rss = 0, seq = null, nowMs = Date.now(), duckMs = STORM_DUCK_MS_DEFAULT } = {}) {
  if (seq !== null) {
    const s = Number(seq)
    if (!Number.isFinite(s) || s === duckSeqApplied) return null
    duckSeqApplied = s
  }
  const fresh = duckUntilMs <= nowMs
  duckUntilMs = nowMs + duckMs
  duckArms++
  try { duckLastSwept = duckSweeper ? (duckSweeper() | 0) : 0 } catch { duckLastSwept = 0 }
  duckLastSource = String(source || 'storm')
  const r = Number(rate)
  const m = Number(rss)
  return { fresh, swept: duckLastSwept, remainingMs: duckMs, source: duckLastSource, rate: Number.isFinite(r) ? r : 0, rss: Number.isFinite(m) ? m : 0 }
}

export function stormDuckActive (nowMs = Date.now()) { return duckUntilMs > nowMs }

export function stormDuckStats () {
  return { arms: duckArms, active: stormDuckActive(), remainingMs: Math.max(0, duckUntilMs - Date.now()), source: duckLastSource, lastSwept: duckLastSwept }
}

/** Test reset - the fleet never calls this (the duck lives once per process). */
export function resetStormDuck () { duckUntilMs = 0; duckArms = 0; duckSeqApplied = -1; duckLastSwept = 0; duckLastSource = '' }

/** Pure log-line builder for the arm (the funnel and the lag probe both
 * print it - the mine must be able to tell WHICH cadence armed the duck). */
export function stormDuckArmLine ({ source = 'storm', rate = 0, rss = 0, swept = 0, remainingMs = STORM_DUCK_MS_DEFAULT, tsS = 0 } = {}) {
  const r = Number.isFinite(rate) ? Math.round(rate) : 0
  const m = Number.isFinite(rss) ? Math.round(rss) : 0
  const sw = Number.isFinite(swept) ? Math.max(0, Math.round(swept)) : 0
  const rem = Number.isFinite(remainingMs) ? Math.max(0, Math.round(remainingMs / 1000)) : 0
  const ts = Number.isFinite(tsS) ? Math.max(0, Math.round(tsS)) : 0
  return `[stormduck] ARMED (${source}): rss ${m}M (+${r}MB/s) - every pathfinder goal refused ${rem}s, ${sw} in-flight goal(s) swept; the near exemption SHUTS (run58: the next-column class is near BY CONSTRUCTION, a closed valve cannot starve it), the A* starves within one think window; rescues flow (raw controls) ts=${ts}s`
}

/** The probe itself: cell poll + rss verdict, called on EVERY gotoSafe
 * consult before the valve's state read. Never throws, never blocks the walk
 * it precedes - every subsystem below is individually guarded. */
function funnelValveProbe () {
  // (a) the worker verdict cell poll - the run105 gap: the verdict was
  // published at ts=415s and died in the cell because the ONLY poller lived
  // on the starved timer phase. The funnel applies it inline.
  if (funnelCell) {
    try {
      const r = stormCellApply({ cell: funnelCell, lastSeq: funnelCellSeq, forceClose: a => fleetValve.forceClose(a) })
      if (r.applied) {
        funnelCellSeq = r.seq
        funnelStats.cellCloses++
        // (v0.143.0) the same verdict arms the STORM DUCK - the valve close
        // alone cannot starve the near class (run58), so the verdict shuts
        // EVERY goal for the duck window. Idempotent per seq: the lag probe
        // may have armed this verdict first, then this is a silent no-op.
        try {
          const duck = armStormDuck({ source: 'worker probe', rate: r.snapshot ? r.snapshot.lastRate : 0, rss: r.snapshot ? r.snapshot.lastRss : 0, seq: r.seq, nowMs: funnelNow ? funnelNow() : Date.now() })
          if (duck && funnelLogger) {
            let tsS = 0
            try { tsS = Math.round(process.uptime()) } catch { /* the line just reads ts=0 */ }
            try { funnelLogger(stormDuckArmLine({ source: 'worker probe', rate: duck.rate, rss: duck.rss, swept: duck.swept, remainingMs: duck.remainingMs, tsS })) } catch { /* logging never kills the fleet */ }
          }
        } catch { /* the duck never blocks the walk */ }
        if (funnelLogger && r.snapshot) {
          try { funnelLogger(valveFunnelCloseLine({ st: r.snapshot, tsS: r.tsS, who: 'cell' })) } catch { /* logging never kills the fleet */ }
        }
      }
    } catch { /* the channel never blocks the walk */ }
  }
  // (b) the funnel's own rss reading - the storm the timers never saw
  let rssM = 0
  try {
    rssM = (funnelRssReader ? funnelRssReader() : process.memoryUsage().rss) / 1048576
  } catch {
    funnelStats.junkReads++
    return // a dead reader judges nothing - the walk flows
  }
  funnelStats.reads++
  const t = funnelNow ? funnelNow() : Date.now()
  const v = funnelStormVerdict({ prevTs: funnelPrev ? funnelPrev.ts : null, prevRss: funnelPrev ? funnelPrev.rss : null, rss: rssM, nowMs: t })
  // the anchor update: everything except a junk NOW reading and a sub-gap
  // record measures from here (a dip REPLACES the anchor - the streak resets;
  // a min-gap keeps the old anchor so the rate is measured over a real gap)
  if (v.reason !== 'junk-now' && v.reason !== 'min-gap') funnelPrev = { ts: t, rss: rssM }
  // (v0.144.0) THE SLOW ENVELOPE - the dip-immune second baseline. run80's
  // ramp sawtoothed between consults: every fast-anchor read judged 'dip',
  // every anchor reset, no verdict - while the worker's 5s envelope caught
  // it. The slow anchor slides on its OWN schedule (window elapsed or the
  // envelope fell) and measures the rate across its own slides - the ramp's
  // AVERAGE crosses the bar at the first consult after the window fills.
  let sv = null
  try {
    sv = funnelSlowVerdict({ anchorTs: funnelSlow ? funnelSlow.ts : null, anchorRss: funnelSlow ? funnelSlow.rss : null, rss: rssM, nowMs: t })
    if (sv.slide) funnelSlow = { ts: t, rss: rssM }
  } catch { /* the envelope never blocks the walk */ }
  if (!v.storm && !(sv && sv.storm)) return
  const before = fleetValve.stats().closes
  const verdict = (v.storm || !(sv && sv.storm))
    ? { source: 'funnel-probe', rate: v.rate, rss: v.rss }
    : { source: 'funnel-slow', rate: sv.rate, rss: sv.rss }
  const snap = fleetValve.forceClose({ rate: verdict.rate, rss: verdict.rss, source: verdict.source })
  if (fleetValve.stats().closes > before) { // the close actually fired (an already-closed valve absorbs silently)
    funnelStats.stormCloses++
    if (verdict.source === 'funnel-slow') funnelStats.slowCloses++
    if (funnelLogger) {
      let tsS = 0
      try { tsS = Math.round(process.uptime()) } catch { /* the line just reads ts=0 */ }
      try { funnelLogger(valveFunnelCloseLine({ st: snap, tsS, who: verdict.source === 'funnel-slow' ? 'slow envelope' : 'storm' })) } catch { /* logging never kills the fleet */ }
    }
  }
  // (v0.143.0) the funnel's own verdict arms the duck too - gated on !active
  // so a sustained storm extends the window only after expiry (one arm per
  // verdict era, no spam at the 40/s consult cadence). An already-closed
  // valve does NOT skip this: the storm is live evidence, the near class
  // must shut even when the close itself was absorbed.
  if (!stormDuckActive(t)) {
    try {
      const duck = armStormDuck({ source: verdict.source === 'funnel-slow' ? 'funnel slow envelope' : 'funnel probe', rate: verdict.rate, rss: verdict.rss, seq: null, nowMs: t })
      if (duck && funnelLogger) {
        let tsS = 0
        try { tsS = Math.round(process.uptime()) } catch { /* the line just reads ts=0 */ }
        try { funnelLogger(stormDuckArmLine({ source: duck.source, rate: duck.rate, rss: duck.rss, swept: duck.swept, remainingMs: duck.remainingMs, tsS })) } catch { /* logging never kills the fleet */ }
      }
    } catch { /* the duck never blocks the walk */ }
  }
}

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
  // (v0.115.0) the queue-pressure arm rides the fleet ticker: the singleton
  // semaphore's live queue depth feeds the valve's sample - the sustained
  // saturation (run101: 8-12q for 80s+ while rss still read healthy) closes
  // the valve BEFORE the A* allocation burst, not after it.
  return startAllocValve({
    valve: fleetValve,
    queueDepth: () => {
      const s = fleetPaths.stats()
      return s && Number.isFinite(s.queued) ? s.queued : null
    },
    ...opts
  })
}

/** Fleet valve counters for the FLEET RESULT block. */
export function allocValveStatsFor () {
  const st = valveStats
  const snap = fleetValve.consult()
  const fs = funnelProbeControl().stats()
  const ds = stormDuckStats()
  return { refusals: st.refusals, nearPasses: st.nearPasses, hazardRefusals: st.hazardRefusals, duckRefusals: st.duckRefusals, duckArms: ds.arms, duckActive: ds.active, closes: snap.closes, strikes: snap.strikes, closedNow: snap.closed, workerCloses: fleetValve.stats().workerCloses, queueCloses: fleetValve.stats().queueCloses, funnelCloses: fleetValve.stats().funnelCloses, funnelCellCloses: fs.cellCloses, funnelSlowCloses: fs.slowCloses }
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

// (v0.143.0) THE GOAL-RATE BRAKE - the rate knob the progress-judged governors
// and the distance-judged valve all lack. Fleet leg 35994461858: the flood
// walkers PROGRESSED (1-3 blocks per walk cleared the churn evidence) and
// their goals were NEAR (admitted while the valve was closed) - the only
// signal left is the cadence itself: ~2.5 goals/s per walker, each a ~90MB
// full-box A*, 225MB/s, the main thread frozen solid 10s after the probe.
// See goalbrake.mjs for the arithmetic. The brake instances live here (the
// funnel is the one choke point every re-issue shares); per-bot in the
// WeakMap, the fleet ceiling a module singleton - the walkgovernor shape.
let goalBrakes = new WeakMap()
const goalBrakeStats = { refusals: 0, opens: 0, fleetRefusals: 0, fleetOpens: 0 }
const fleetGoalCeiling = createGoalBrake({
  windowMs: FLEET_GOAL_WINDOW_MS,
  burstLimit: FLEET_GOAL_BURST_LIMIT,
  cooldownMs: FLEET_GOAL_COOLDOWN_MS,
  escalatedMs: FLEET_GOAL_ESCALATED_MS,
  recloseWindowMs: FLEET_GOAL_RECLOSE_WINDOW_MS,
  onOpen: () => { goalBrakeStats.fleetOpens++ }
})

function goalBrakeFor (bot) {
  let g = goalBrakes.get(bot)
  if (!g) {
    g = createGoalBrake({ onOpen: () => { goalBrakeStats.opens++ } })
    goalBrakes.set(bot, g)
  }
  return g
}

/** Fleet summary counters for the FLEET RESULT block. */
export function goalBrakeStatsFor () {
  return {
    refusals: goalBrakeStats.refusals,
    opens: goalBrakeStats.opens,
    fleetRefusals: goalBrakeStats.fleetRefusals,
    fleetOpens: goalBrakeStats.fleetOpens
  }
}

// (v0.143.0) THE SWEEP-ON-CLOSE HOOK - the replan loops die at the closure,
// not at the lag-probe's next fire. Fleet leg 35994461858: the worker's GRACE
// HOLD waited 10s for a closure that could never land - the main thread was
// frozen solid (the FATAL ring is byte-for-byte the probe's ring) - and the
// v0.141.0 goal sweep only rode the lag-probe feeder, whose probe was dead
// with everything else. The valve's appliers that DO survive (the funnel
// consults marched through the whole kill window in run105; the 1s ticker in
// the turning phase) now sweep every pathfinder goal slot on EVERY close: the
// library's block-update replan loops re-engage from the goal slot (the
// v0.65.0 zombie-kill mechanics), so clearing the slots at the close starves
// the replan storm in the same breath the walk funnel stops feeding it.
// fleet19 wires the actual sweep (the bots map lives there); a null/junk hook
// degrades to the v0.142.0 shape byte for byte.
let fleetGoalSweeper = null
export function setFleetGoalSweeper (fn) { fleetGoalSweeper = typeof fn === 'function' ? fn : null }

/** Test hook: drop every per-bot governor (never used in prod). */
export function resetWalkGovernors () {
  walkGovernors = new WeakMap()
  walkGovernorStats.refusals = 0
  walkGovernorStats.opens = 0
  walkGovernorStats.fleetRefusals = 0
  walkGovernorStats.fleetOpens = 0
  try { fleetCeiling.reset() } catch { /* never fails */ }
  goalBrakes = new WeakMap()
  goalBrakeStats.refusals = 0
  goalBrakeStats.opens = 0
  goalBrakeStats.fleetRefusals = 0
  goalBrakeStats.fleetOpens = 0
  try { fleetGoalCeiling.reset() } catch { /* never fails */ }
  try { fleetValve.reset() } catch { /* never fails */ }
  try { funnelProbeControl().reset() } catch { /* (v0.121.0) the probe reset never fails */ }
  valveStats.refusals = 0
  valveStats.nearPasses = 0
  valveStats.duckRefusals = 0
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
  // (v0.143.0) THE GOAL-RATE BRAKE CONSULT - the rate breaker, after the
  // progress breakers, before the memory breaker. A bot past its burst (6
  // admitted goals in 5s) is FEEDING the pathfinder, not walking: the refusal
  // is zero-cost and named so the caller's log shows WHY. Bank-priority walks
  // are exempt from the FLEET ceiling only (the v0.77.0 contract) - a bot
  // bursting goals at 6/5s is refused even on a bank errand (one walk per
  // bank visit never bursts; only the churn does).
  try {
    const gbv = goalBrakeFor(bot).consult(Date.now())
    if (gbv.open) {
      goalBrakeStats.refusals++
      return refuse(`goal brake: ${gbv.burst} goals in ${Math.round(GOAL_WINDOW_MS / 1000)}s - ${label} refused for ${Math.round(gbv.remainingMs / 1000)}s`)
    }
  } catch (e) {
    if (e && /goal brake/.test(e.message)) return refuse(e.message) // the refusal itself, paced
    /* the brake never blocks the walk it precedes */
  }
  try {
    const fgv = fleetGoalCeiling.consult(Date.now())
    if (fgv.open && priority < PATH_PRIO_BANK) {
      goalBrakeStats.fleetRefusals++
      return refuse(`fleet goal ceiling: ${fgv.burst} goals fleet-wide in ${Math.round(FLEET_GOAL_WINDOW_MS / 1000)}s - ${label} refused for ${Math.round(fgv.remainingMs / 1000)}s`)
    }
  } catch (e) {
    if (e && /fleet goal ceiling/.test(e.message)) return refuse(e.message) // the refusal itself, paced
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
  try { funnelValveProbe() } catch { /* (v0.121.0) the probe never blocks the walk it precedes */ }
  // (v0.143.0) THE STORM DUCK CONSULT - after the probe (the probe must keep
  // measuring + arming even while the duck refuses everything), before the
  // valve consult (a ducked walk must not count as a nearPass). While the
  // duck is live EVERY walk is refused - near included, bank included: the
  // fuel IS every goal (run58's storm rode the near exemption to 3462M
  // through a valve that had been closed for 95s). The refusal is paced by
  // the same 25ms yield, so the callers' retry loops cost nothing.
  if (duckUntilMs > Date.now()) {
    valveStats.duckRefusals++
    return refuse(`storm duck: fleet-wide pathfinder pause ${Math.max(0, Math.round((duckUntilMs - Date.now()) / 1000))}s left - ${label} refused (a live storm verdict shut the near exemption; every walk waits out the wind-down)`)
  }
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
        // (v0.115.0) the pressure flavor names the sustained queue, not a fake rate
        const cause = vs.lastSource === 'queue-pressure'
          ? `path queue ${vs.lastQueued}q sustained`
          : `storm ${vs.lastRate}MB/s at rss ${vs.lastRss}M`
        return refuse(`alloc valve: closed (${cause}) - ${label} refused${goalHazardNear ? ' (goal in live hazard water, the aquifer gate)' : ''} for ${Math.round(vs.remainingMs / 1000)}s`)
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
  // (v0.143.0) THE ADMISSION RECORD - only an ADMITTED goal feeds the brake
  // (a refused walk costs no A* and must not reopen the very breaker that
  // caught it). One record per bot instance + one for the fleet ceiling.
  try { goalBrakeFor(bot).record(Date.now()); fleetGoalCeiling.record(Date.now()) } catch { /* a brake record never blocks the walk it feeds */ }
  noteGlobal(`pf:queue ${label}`)
  // (v0.21.0) priority rides through to the fleet queue: bank walks (PATH_PRIO_BANK)
  // jump ahead of mining-column walks under saturation - a queued bank walk burns
  // its dist-scaled budget in line while a mining delay costs nothing at all.
  let walkOk = false
  // (v0.144.0) THE FAR-GOAL THINK CAP - bound the SINGLE burst that no verdict
  // can reach. MEASURED (fleet leg 36001375280, mined run80/): rss 365M ->
  // 2154M -> 3102M in ~10s with the blackbox ring FROZEN on the pre-ramp
  // notes - the wedge started BEFORE the worker's first storm sample, so the
  // funnel, the lag probe and the duck never got a turn (the duck was armed
  // by NOTHING - there is no [stormduck] line in the log). The allocator was
  // one A* burst whose envelope is the GOAL DISTANCE: searchRadius bounds
  // detours beyond the straight-line estimate, so a far goal explores a
  // corridor that long, and the boot thinkTimeout 2000 lets one burst retain
  // millions of nodes (~GB) before yielding. The cap: for goals farther than
  // the near bound, shrink BOTH knobs around the goto (the deposit.mjs
  // per-walk precedent) - a 500ms/24r burst allocates ~4x less and yields 4x
  // sooner, the dynamic pathing walks the partial path and re-plans closer,
  // and a wedged loop still surfaces between bursts for the appliers. Near
  // goals keep the boot defaults byte for byte. Restored in finally - a dead
  // walk never leaves its bot's pathfinder crippled.
  const farGoal = walkDistanceOf(bot, goal)
  const capThink = Number.isFinite(farGoal) && farGoal > ALLOC_VALVE_NEAR_BLOCKS_DEFAULT
  return fleetPaths.run(() => {
    clearStaleStop(bot) // (v0.20.0) consume a stale stopPathing flag BEFORE the new goal registers its listeners
    noteGlobal(`pf:goal ${label}`)
    const startPos = walkPosOf(bot) // (v0.74.0) the walk's displacement feeds the stall governor
    let prevRadius
    let prevThink
    const pf = bot.pathfinder
    if (capThink && pf) {
      try {
        prevRadius = pf.searchRadius
        prevThink = pf.thinkTimeout
        pf.searchRadius = FAR_GOAL_SEARCH_RADIUS
        pf.thinkTimeout = FAR_GOAL_THINK_TIMEOUT_MS
      } catch { /* bare mocks - the walk below still runs */ }
    }
    const restore = () => {
      if (!capThink || !pf) return
      try { if (prevRadius !== undefined) pf.searchRadius = prevRadius } catch { /* mocks */ }
      try { if (prevThink !== undefined) pf.thinkTimeout = prevThink } catch { /* mocks */ }
    }
    return withTimeout(bot.pathfinder.goto(goal), timeoutMs, label)
      .then(r => { walkOk = true; return r })
      .finally(() => {
        restore()
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
