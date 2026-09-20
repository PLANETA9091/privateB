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
import { RESCUE_MAX_MS } from './drowning.mjs'
const fleetPaths = createPathThrottle({ maxConcurrent: Number(process.env.PATH_MAX_CONCURRENT || 6) })
export function pathThrottleStats () { return fleetPaths.stats() }

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

export function gotoSafe (bot, goal, { timeoutMs = 25000, label = 'walk' } = {}) {
  // (v0.13.0) drowning rescue gate: while a swim rescue is in flight the
  // pathfinder must NOT issue new goals - each one re-engages its own control
  // states and fights the raw swim controls (the same lesson as tunnel/shelter:
  // pathfinder and raw controls cannot share the bot). Every caller already
  // catches, so a refusal costs the caller one wasted attempt, not a crash.
  if (bot._waterRescue) throw new Error(`water rescue in progress (${label} refused)`)
  return fleetPaths.run(() => {
    clearStaleStop(bot) // (v0.20.0) consume a stale stopPathing flag BEFORE the new goal registers its listeners
    return withTimeout(bot.pathfinder.goto(goal), timeoutMs, label)
  }).catch(e => {
    try { bot.pathfinder.stop() } catch { /* already stopped / never started */ }
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
