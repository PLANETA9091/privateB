//
// stallclock.test.mjs - THE STALL CLOCK's pins (v0.508.0)
// The fixtures are the REAL API shapes the fires read by hand:
// face 44's flapped queue (run queued, 3 jobs success, the fleet job
// starved), d9bb393's starved gate queue, and the 19:41:53Z
// queue-cancel stamp that lied to the naive reader.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { stallClock, pickupClock, jobPickedUp, STALL_FRESH_MS, STALL_STARVE_MS } from '../../src/lib/stallclock.mjs'

const NOW = Date.parse('2026-10-02T20:39:21Z')

// face 44's job truth (CI run 36987824149, fetched 0339 fire)
const FACE44_JOBS = [
  { id: 110776783426, name: 'Integration', status: 'completed', conclusion: 'success', started_at: '2026-10-02T15:41:17Z', completed_at: '2026-10-02T15:53:59Z', runner_name: 'GitHub Actions 1000035811' },
  { id: 110776783461, name: 'Unit (24)', status: 'completed', conclusion: 'success', started_at: '2026-10-02T15:12:08Z', completed_at: '2026-10-02T15:16:47Z', runner_name: 'GitHub Actions 1000035791' },
  { id: 110776783620, name: 'Unit (22)', status: 'completed', conclusion: 'success', started_at: '2026-10-02T15:49:12Z', completed_at: '2026-10-02T15:53:50Z', runner_name: 'GitHub Actions 1000035818' },
  { id: 110914801958, name: 'Big fleet run', status: 'queued', conclusion: null, started_at: '2026-10-02T15:53:59Z', completed_at: null, runner_name: '' }
]
// d9bb393's starved gate jobs (fetched 0439 fire)
const STARVED_JOBS = [
  { id: 111000074805, status: 'queued', conclusion: null, started_at: '2026-10-02T19:41:54Z', completed_at: null, runner_name: '' },
  { id: 111000074866, status: 'queued', conclusion: null, started_at: '2026-10-02T19:41:54Z', completed_at: null, runner_name: '' }
]
// the 19:41:53Z LIE: d70e891's integration job - queued since 15:02Z,
// cancelled in the queue, stamped started == completed at the cancel moment
const QUEUE_CANCEL_STAMP = { id: 110776783630, status: 'completed', conclusion: 'cancelled', started_at: '2026-10-02T19:41:53Z', completed_at: '2026-10-02T19:41:53Z', runner_name: '' }
// the same job had picked up its three unit siblings at 15:13:44Z (real)
const REAL_UNIT = { id: 110776783631, status: 'completed', conclusion: 'success', started_at: '2026-10-02T15:13:44Z', completed_at: '2026-10-02T15:13:59Z', runner_name: 'GitHub Actions 1000035800' }

test('the pickup law: the four real shapes answer honestly', () => {
  assert.equal(jobPickedUp(FACE44_JOBS[3]), false) // queued with a started_at - the queue lie
  assert.equal(jobPickedUp(STARVED_JOBS[0]), false)
  assert.equal(jobPickedUp(QUEUE_CANCEL_STAMP), false) // the 19:41:53Z stamp - cancelled with zero span
  assert.equal(jobPickedUp(FACE44_JOBS[0]), true) // completed with a runner
  assert.equal(jobPickedUp({ status: 'in_progress', started_at: '2026-10-02T20:00:00Z', runner_name: '' }), true)
  assert.equal(jobPickedUp({ status: 'weird', runner_name: 'GitHub Actions 1' }), true) // a runner was attached
  assert.equal(jobPickedUp(null), false)
  assert.equal(jobPickedUp(42), false)
})

test('a mid-run cancel IS a pickup: the span is real, only the end was forced', () => {
  const midRun = { status: 'completed', conclusion: 'cancelled', started_at: '2026-10-02T15:20:00Z', completed_at: '2026-10-02T15:25:00Z', runner_name: '' }
  assert.equal(jobPickedUp(midRun), true) // 5 real minutes - a runner held it
  const sameSecond = { status: 'completed', conclusion: 'cancelled', started_at: '2026-10-02T19:41:53Z', completed_at: '2026-10-02T19:41:54Z', runner_name: '' }
  assert.equal(jobPickedUp(sameSecond), false) // <1s span - still the stamp
})

test('pickupClock: face 44\'s set reads the last real pickup + finish', () => {
  const pc = pickupClock(FACE44_JOBS)
  assert.equal(pc.pickedJobs, 3)
  assert.equal(pc.lastPickupAtMs, Date.parse('2026-10-02T15:49:12Z')) // unit(22), the latest honest start
  assert.equal(pc.lastFinishAtMs, Date.parse('2026-10-02T15:53:59Z')) // integration's real finish
  assert.equal(pc.inProgress, 0)
})

test('pickupClock: the stamp does not poison the finish either', () => {
  const pc = pickupClock([QUEUE_CANCEL_STAMP, REAL_UNIT])
  assert.equal(pc.pickedJobs, 1)
  assert.equal(pc.lastPickupAtMs, Date.parse('2026-10-02T15:13:44Z'))
  assert.equal(pc.lastFinishAtMs, Date.parse('2026-10-02T15:13:59Z')) // the stamp's completed_at refused
  assert.deepEqual(pickupClock('not an array'), { lastPickupAtMs: null, lastFinishAtMs: null, pickedJobs: 0, inProgress: 0 })
})

const FACE44_RUNS = [
  { id: 37062190407, status: 'pending', created_at: '2026-10-02T20:41:27Z' },
  { id: 37053488776, status: 'queued', created_at: '2026-10-02T19:20:36Z' },
  { id: 36987824149, status: 'queued', created_at: '2026-10-02T09:06:00Z' }
]

test('the 0439 fire read, reproduced: stalled + the quota-wall signature fires', () => {
  const clock = stallClock({ runs: FACE44_RUNS, jobs: [...FACE44_JOBS, ...STARVED_JOBS, QUEUE_CANCEL_STAMP], nowMs: NOW })
  assert.equal(clock.verdict, 'stalled')
  assert.equal(clock.queueDepth, 3)
  assert.equal(clock.inProgress, 0)
  assert.equal(clock.lastPickupAtMs, Date.parse('2026-10-02T15:49:12Z'))
  assert.equal(clock.pickupAgeMs, NOW - Date.parse('2026-10-02T15:49:12Z'))
  assert.equal(clock.quotaWallSuspected, true) // 4h50m without a pickup, the queue holding since 19:20Z
  // the ages the worklogs kept hand-deriving
  assert.equal(clock.oldestQueuedAgeMs, NOW - Date.parse('2026-10-02T09:06:00Z'))
})

test('picking-up: a live runner or a fresh pickup holds the verdict', () => {
  const live = stallClock({ runs: FACE44_RUNS, jobs: [{ status: 'in_progress', started_at: '2026-10-02T20:30:00Z', runner_name: '' }], nowMs: NOW })
  assert.equal(live.verdict, 'picking-up')
  assert.equal(live.quotaWallSuspected, false)
  const fresh = stallClock({
    runs: [{ status: 'queued', created_at: '2026-10-02T20:30:00Z' }],
    jobs: [{ status: 'completed', conclusion: 'success', started_at: '2026-10-02T20:20:00Z', completed_at: '2026-10-02T20:25:00Z', runner_name: 'x' }],
    nowMs: NOW
  })
  assert.equal(fresh.verdict, 'picking-up') // 19 min old pickup, inside the 30 min freshness
})

test('the unknown door: a queue with no pickup evidence is named, never guessed', () => {
  assert.equal(stallClock({ runs: FACE44_RUNS, jobs: null, nowMs: NOW }).verdict, 'unknown')
  assert.equal(stallClock({ runs: FACE44_RUNS, jobs: STARVED_JOBS, nowMs: NOW }).verdict, 'stalled') // evidence exists, it is just empty-handed
  const q = stallClock({ runs: FACE44_RUNS, jobs: STARVED_JOBS, nowMs: NOW })
  assert.equal(q.quotaWallSuspected, false) // no honest pickup age - the signature refuses to fire blind
})

test('the dark door: nothing to read', () => {
  assert.equal(stallClock({ runs: [], jobs: [], nowMs: NOW }).verdict, 'dark')
  assert.equal(stallClock({ runs: [{ status: 'completed', created_at: '2026-10-02T10:00:00Z' }], jobs: [REAL_UNIT], nowMs: NOW }).verdict, 'dark')
  assert.equal(stallClock({ runs: 'junk', nowMs: NOW }).verdict, 'dark')
  assert.equal(stallClock({ runs: FACE44_RUNS, jobs: FACE44_JOBS, nowMs: 'not a clock' }).verdict, 'dark')
})

test('the threshold boundaries pin fresh and starve exactly', () => {
  const base = { runs: [{ status: 'queued', created_at: new Date(NOW - STALL_STARVE_MS).toISOString() }], nowMs: NOW }
  const atFresh = stallClock({ ...base, jobs: [{ status: 'completed', conclusion: 'success', started_at: new Date(NOW - STALL_FRESH_MS).toISOString(), completed_at: new Date(NOW - STALL_FRESH_MS + 1000).toISOString(), runner_name: 'x' }] })
  assert.equal(atFresh.verdict, 'picking-up') // pickupAge == freshMs -> inside (<=)
  const justOver = stallClock({ ...base, jobs: [{ status: 'completed', conclusion: 'success', started_at: new Date(NOW - STALL_STARVE_MS - 1).toISOString(), completed_at: new Date(NOW - STALL_STARVE_MS).toISOString(), runner_name: 'x' }] })
  assert.equal(justOver.verdict, 'stalled')
  assert.equal(justOver.quotaWallSuspected, true) // queue age == starveMs (>=) and pickupAge == starveMs + 1 (>=)
  const youngQueue = stallClock({ runs: [{ status: 'queued', created_at: new Date(NOW - STALL_STARVE_MS - 1).toISOString() }], jobs: [{ status: 'completed', conclusion: 'success', started_at: new Date(NOW - STALL_STARVE_MS - 1).toISOString(), completed_at: new Date(NOW - STALL_STARVE_MS).toISOString(), runner_name: 'x' }], nowMs: NOW })
  assert.equal(youngQueue.quotaWallSuspected, true) // both past their lines
  const freshPickup = stallClock({ runs: [{ status: 'queued', created_at: new Date(NOW - STALL_STARVE_MS).toISOString() }], jobs: [{ status: 'completed', conclusion: 'success', started_at: new Date(NOW - 60_000).toISOString(), completed_at: new Date(NOW - 30_000).toISOString(), runner_name: 'x' }], nowMs: NOW })
  assert.equal(freshPickup.verdict, 'picking-up')
  assert.equal(freshPickup.quotaWallSuspected, false)
})

test('the junk battery: garbage reads as missing evidence, never a throw', () => {
  const clock = stallClock({
    runs: [null, 42, 'queued', { status: 123, created_at: 'garbage' }, { status: 'queued', created_at: '2026-10-02T19:20:36Z' }],
    jobs: [null, 'queued', { status: 'queued' }, { status: 'completed', conclusion: 'cancelled' }, REAL_UNIT],
    nowMs: NOW
  })
  assert.equal(clock.queueDepth, 1) // the junk entries drop out, the one valid queued run stays
  assert.equal(clock.oldestQueuedAgeMs, NOW - Date.parse('2026-10-02T19:20:36Z'))
  assert.equal(clock.pickedJobs, 1)
  assert.equal(clock.lastPickupAtMs, Date.parse('2026-10-02T15:13:44Z'))
  // the cancelled-with-no-timestamps job: no span to read - the honest refusal
  assert.equal(jobPickedUp({ status: 'completed', conclusion: 'cancelled', started_at: null, completed_at: null }), false)
  // nowMs as an ISO string works too
  assert.equal(stallClock({ runs: [], jobs: [], nowMs: '2026-10-02T20:39:21Z' }).verdict, 'dark')
})
