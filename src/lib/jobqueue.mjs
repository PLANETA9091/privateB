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
export function gotoSafe (bot, goal, { timeoutMs = 25000, label = 'walk' } = {}) {
  return withTimeout(bot.pathfinder.goto(goal), timeoutMs, label).catch(e => {
    try { bot.pathfinder.stop() } catch { /* already stopped / never started */ }
    throw e
  })
}

// A walk goal the fleet can actually reach: nudge the requested column to the nearest
// y where the bot can STAND (solid ground, air feet + head). Raw GoalNear targets computed
// as "current position + offset" regularly landed inside unexcavated stone; the pathfinder
// then dug/explored toward a goal sealed in rock - exactly the degenerate search the
// OOM run saturated the heap with. Always returns a GoalNear (the buried-column fallback
// aims above the column so the search stays finite).
export function standGoalNear (bot, goals, x, y, z, { range = 1, maxShift = 6 } = {}) {
  const px = Math.floor(x)
  const pz = Math.floor(z)
  const py = Math.floor(y)
  const standable = yy => {
    const feet = bot.blockAt(new Vec3(px, yy, pz))
    const head = bot.blockAt(new Vec3(px, yy + 1, pz))
    const ground = bot.blockAt(new Vec3(px, yy - 1, pz))
    return !!ground && ground.boundingBox !== 'empty' &&
      (!feet || feet.boundingBox === 'empty') &&
      (!head || head.boundingBox === 'empty')
  }
  for (let d = 0; d <= maxShift; d++) {
    if (standable(py + d)) return new goals.GoalNear(px, py + d, pz, range)
    if (d > 0 && standable(py - d)) return new goals.GoalNear(px, py - d, pz, range)
  }
  // nothing standable in +-maxShift (the column is buried): aim just above it so the
  // pathfinder at worst digs upward through finite rock instead of toward a sealed cell
  return new goals.GoalNear(px, py + maxShift + 1, pz, Math.max(range, 2))
}
