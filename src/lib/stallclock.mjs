//
// stallclock.mjs - THE STALL CLOCK (v0.508.0)
// The CI-ops instrument the fires kept rebuilding by hand. The evening
// of faces 42..44 the queue went dark for 8.5 hours and every lane
// re-derived the same verdict manually from the API: is the queue
// STARVED (no runner has picked anything up in hours - the quota-wall
// signature, cancelling fixes nothing) or just SLOW (the head will
// start in minutes - the queued-is-not-a-zombie law's own turf)? The
// worklogs carry three hand-rolled stall reads (the 0339, 0400 and
// 0430 lanes each read the API raw); this lib makes the read a
// function. It also powers the poll-before-duplicate protocol (the
// fleet-queue secession's own law - ci.yml v0.331.0): a dispatcher
// polls the clock BEFORE firing a duplicate dispatch.
//
// THE PICKUP LAW (the API's own truth, learned from face 44 AND from
// the 19:41:53Z stamp): a job's `started_at` is NOT the runner pickup
// - face 44's starved fleet job carried started_at 15:53:59Z while
// sitting QUEUED forever (GitHub sets it when the job enters the
// queue), and a job cancelled IN THE QUEUE gets BOTH started_at and
// completed_at stamped at the cancel moment (d70e891's integration job:
// queued since 15:02Z, cancelled 19:41:53Z, stamped started=completed=
// 19:41:53 - the naive read calls it a pickup 4.5 hours after the last
// real one). The honest pickup signals:
//   status 'in_progress'                 - a runner holds it NOW;
//   status 'completed' with a REAL span  - a runner held it (its
//                                          started_at is the pickup);
//   runner_name non-empty                - a runner is/was attached.
// The queue-cancel stamp (conclusion 'cancelled' with started_at ==
// completed_at to the second) is NOT a pickup - the lib refuses it.
//
// THE VERDICT (four classes, computed from a snapshot the caller
// fetched - the lib stays pure, network-free, deterministic: nowMs is
// a parameter, never Date.now()):
//   picking-up - a runner holds a job now, or the last pickup is
//                younger than freshMs (default 30 min - this repo's
//                pickups land in seconds-to-minutes; 30 silent minutes
//                is already abnormal);
//   stalled    - no runner holds anything and the last pickup is older
//                than freshMs (or unknown-but-queue-not-empty reads
//                unknown, see below);
//   unknown    - the queue is not empty but the snapshot carries no
//                pickup evidence at all (no jobs array was fetched) -
//                the lib names the gap, never guesses through it;
//   dark       - no runs (or no jobs and no runs) - nothing to read.
//
// THE QUOTA-WALL SIGNATURE (quotaWallSuspected): stalled + the queue
// holding runs for >= starveMs (default 45 min) + the last pickup
// equally old. The name is honest: the API cannot prove billing - the
// lib names the SIGNATURE (no pickup anywhere in the window while runs
// wait), not the cause. Face 44's evening read: last pickup 15:49:12Z,
// the queue holding since 19:20Z, now past midnight - signature fired.
//
// Junk-safe end to end: null/[]/junk strings/bad dates/malformed jobs
// - all read as missing evidence, never a throw.
const DEFAULT_FRESH_MS = 30 * 60_000
const DEFAULT_STARVE_MS = 45 * 60_000

export const STALL_FRESH_MS = DEFAULT_FRESH_MS
export const STALL_STARVE_MS = DEFAULT_STARVE_MS

const toMs = (v) => {
  const n = Date.parse(v)
  return Number.isFinite(n) ? n : null
}

// the pickup law - a job the runner actually took (see header)
export function jobPickedUp (job) {
  if (!job || typeof job !== 'object') return false
  if (job.status === 'in_progress') return true
  if (typeof job.runner_name === 'string' && job.runner_name.length > 0) return true
  if (job.status === 'completed') {
    // the queue-cancel stamp family: cancelled jobs need a PROVEN real
    // span to count as pickups - no readable span (the junk case) or a
    // sub-2s span (the stamp, which can straddle a second boundary)
    // reads as never-run
    if (job.conclusion === 'cancelled') {
      const s = toMs(job.started_at)
      const f = toMs(job.completed_at)
      if (s === null || f === null || f - s < 2000) return false
    }
    return true
  }
  return false
}

// the flat-jobs read: the last honest pickup + the last finish
export function pickupClock (jobs) {
  if (!Array.isArray(jobs)) return { lastPickupAtMs: null, lastFinishAtMs: null, pickedJobs: 0, inProgress: 0 }
  let lastPickupAtMs = null
  let lastFinishAtMs = null
  let pickedJobs = 0
  let inProgress = 0
  for (const job of jobs) {
    if (!job || typeof job !== 'object') continue
    if (job.status === 'in_progress') inProgress++
    if (!jobPickedUp(job)) continue // the stamp jobs' completed_at is a cancel event, not a finish
    pickedJobs++
    const started = toMs(job.started_at)
    if (started !== null && (lastPickupAtMs === null || started > lastPickupAtMs)) lastPickupAtMs = started
    const finished = toMs(job.completed_at)
    if (finished !== null && (lastFinishAtMs === null || finished > lastFinishAtMs)) lastFinishAtMs = finished
  }
  return { lastPickupAtMs, lastFinishAtMs, pickedJobs, inProgress }
}

// the one-call read. inputs:
//   runs - workflow_runs[] (status/conclusion/created_at/updated_at)
//   jobs - a flat jobs[] across the recent runs (optional; null = no
//          pickup evidence, the honest 'unknown' door)
//   nowMs - the clock (parameter, not Date.now())
//   freshMs / starveMs - the thresholds (defaults below)
export function stallClock ({ runs, jobs, nowMs, freshMs = DEFAULT_FRESH_MS, starveMs = DEFAULT_STARVE_MS } = {}) {
  if (!Array.isArray(runs)) return { verdict: 'dark' }
  const now = Number.isFinite(nowMs) ? nowMs : Date.parse(nowMs)
  if (!Number.isFinite(now)) return { verdict: 'dark' }
  const active = runs.filter(r => r && typeof r === 'object' && (r.status === 'queued' || r.status === 'pending' || r.status === 'in_progress'))
  const queueDepth = active.filter(r => r.status !== 'in_progress').length
  let oldestQueuedAgeMs = null
  for (const r of active) {
    const born = toMs(r.created_at)
    if (born === null) continue
    const age = now - born
    if (oldestQueuedAgeMs === null || age > oldestQueuedAgeMs) oldestQueuedAgeMs = age
  }
  const hasJobEvidence = Array.isArray(jobs) && jobs.length > 0
  const pc = pickupClock(jobs)
  const pickupAgeMs = pc.lastPickupAtMs !== null ? now - pc.lastPickupAtMs : null
  let verdict
  if (!hasJobEvidence) {
    verdict = active.length > 0 ? 'unknown' : 'dark'
  } else if (pc.inProgress > 0 || (pickupAgeMs !== null && pickupAgeMs <= freshMs)) {
    verdict = 'picking-up'
  } else if (active.length === 0) {
    verdict = 'dark'
  } else {
    verdict = 'stalled'
  }
  const quotaWallSuspected = verdict === 'stalled' && queueDepth >= 1 &&
    oldestQueuedAgeMs !== null && oldestQueuedAgeMs >= starveMs &&
    pickupAgeMs !== null && pickupAgeMs >= starveMs
  return {
    verdict,
    queueDepth,
    oldestQueuedAgeMs,
    inProgress: pc.inProgress,
    pickedJobs: pc.pickedJobs,
    lastPickupAtMs: pc.lastPickupAtMs,
    lastFinishAtMs: pc.lastFinishAtMs,
    pickupAgeMs,
    finishAgeMs: pc.lastFinishAtMs !== null ? now - pc.lastFinishAtMs : null,
    quotaWallSuspected
  }
}
