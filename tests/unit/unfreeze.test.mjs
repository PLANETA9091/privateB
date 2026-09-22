// Tests for the v0.65.0 UNFREEZE SWEEP (src/lib/unfreeze.mjs) - the
// post-freeze edge of the zombie-goto kill. run63 (dispatch 35677752396)
// delivered the black box's first witness: '[blackbox] main freeze ~51s;
// last: pf:goal deploy @+0.0s' with pf:done never coming - a goal the A*
// could not close re-spiralized on every physics tick and starved the main
// thread's timers for 51s (mainLate=51122ms). The heartbeat lag probe fires
// onUnfreeze with the full drift on its first post-freeze fire; the sweep
// clears every goal held across the freeze. These pins cover the pure
// decision layer (which bot gets swept, what the line says); the heartbeat
// threshold pin lives in heartbeat.test.mjs, the gotoSafe source-edge pins
// in goto-safe.test.mjs.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { UNFREEZE_LATE_MS, unfreezeTarget, unfreezeLine } from '../../src/lib/unfreeze.mjs'

const pfBot = shape => ({ pathfinder: { setGoal: () => {}, stop: () => {}, goal: null, isMoving: () => false, ...shape } })

test('unfreeze: the threshold constant is in the freeze band (the 4.5s think window must NOT trip it)', () => {
  assert.equal(UNFREEZE_LATE_MS, 8000)
  assert.ok(UNFREEZE_LATE_MS > 4500, 'a legitimate deep A* think must never be swept')
})

test('unfreeze: drift below the threshold refuses (GC pauses and slow thinks are not freezes)', () => {
  const r = unfreezeTarget(pfBot({ goal: { x: 1 } }), { lateMs: 7999 })
  assert.deepEqual(r, { sweep: false, why: 'below threshold' })
  assert.deepEqual(unfreezeTarget(pfBot({ goal: { x: 1 } }), { lateMs: 0 }), { sweep: false, why: 'below threshold' })
})

test('unfreeze: junk drift refuses (the sweep must never manufacture work)', () => {
  assert.deepEqual(unfreezeTarget(pfBot({ goal: { x: 1 } }), { lateMs: NaN }), { sweep: false, why: 'below threshold' })
  assert.deepEqual(unfreezeTarget(pfBot({ goal: { x: 1 } }), { lateMs: -5 }), { sweep: false, why: 'below threshold' })
  assert.deepEqual(unfreezeTarget(pfBot({ goal: { x: 1 } }), {}), { sweep: false, why: 'below threshold' })
})

test('unfreeze: a bot holding a goal across the freeze is swept (the run63 wedged shape)', () => {
  const bot = pfBot({ goal: { x: -158, y: 45, z: 421 } })
  const r = unfreezeTarget(bot, { lateMs: 51122 })
  assert.deepEqual(r, { sweep: true, why: 'goal held across the freeze' })
})

test('unfreeze: a moving bot with an unreadable goal is swept too (the defensive edge)', () => {
  const bot = pfBot({ goal: undefined, isMoving: () => true })
  const r = unfreezeTarget(bot, { lateMs: 16000 })
  assert.deepEqual(r, { sweep: true, why: 'moving without a readable goal' })
})

test('unfreeze: a standing goal-less bot is left alone (the log must not lie)', () => {
  const r = unfreezeTarget(pfBot({}), { lateMs: 51122 })
  assert.deepEqual(r, { sweep: false, why: 'no goal held' })
})

test('unfreeze: no pathfinder / bare object / null refuse', () => {
  assert.deepEqual(unfreezeTarget({}, { lateMs: 51122 }), { sweep: false, why: 'no pathfinder' })
  assert.deepEqual(unfreezeTarget(null, { lateMs: 51122 }), { sweep: false, why: 'no pathfinder' })
  assert.deepEqual(unfreezeTarget({ pathfinder: {} }, { lateMs: 51122 }), { sweep: false, why: 'no pathfinder' }, 'a pathfinder without setGoal is not sweepable')
})

test('unfreeze: junk threshold falls back to the constant, zero is honoured', () => {
  const bot = pfBot({ goal: { x: 1 } })
  assert.deepEqual(unfreezeTarget(bot, { lateMs: 1, threshold: 0 }), { sweep: true, why: 'goal held across the freeze' }, '0 margin is honoured (the hard-kill precedent)')
  assert.deepEqual(unfreezeTarget(bot, { lateMs: 1, threshold: NaN }), { sweep: false, why: 'below threshold' }, 'junk threshold -> the 8000 default governs')
})

test('unfreeze line: the mining contract format', () => {
  assert.equal(
    unfreezeLine({ lateMs: 51122, swept: 12, skipped: 7 }),
    '[unfreeze] main froze ~51.1s; cleared 12 stale pathfinder goal(s), left 7 clean'
  )
})

test('unfreeze line: junk stays honest (negatives clamp, junk drift prints ?)', () => {
  assert.equal(unfreezeLine({ lateMs: 0, swept: 0, skipped: 0 }), '[unfreeze] main froze ~0.0s; cleared 0 stale pathfinder goal(s), left 0 clean')
  assert.equal(unfreezeLine({ lateMs: -3, swept: -2, skipped: NaN }), '[unfreeze] main froze ~?s; cleared 0 stale pathfinder goal(s), left 0 clean')
  assert.equal(unfreezeLine({}), '[unfreeze] main froze ~0.0s; cleared 0 stale pathfinder goal(s), left 0 clean')
})

test('unfreeze: the run63 REGRESSION SHAPE - 19 bots, 12 wedged, sweep clears exactly the wedged ones', () => {
  // The fleet composition the sweep exists for: the freeze wedges only the
  // bots whose goals were mid-A* when the spiral started; the rest are clean.
  const bots = []
  for (let i = 0; i < 12; i++) bots.push(pfBot({ goal: { x: i } })) // wedged
  for (let i = 0; i < 7; i++) bots.push(pfBot({})) // clean
  let swept = 0
  let left = 0
  for (const bot of bots) {
    const v = unfreezeTarget(bot, { lateMs: 51122 })
    if (v.sweep) swept++
    else left++
  }
  assert.equal(swept, 12)
  assert.equal(left, 7)
  assert.match(unfreezeLine({ lateMs: 51122, swept, skipped: left }), /cleared 12 stale pathfinder goal\(s\), left 7 clean/)
})
