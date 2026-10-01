// (v0.399.0) THE HOP-ZERO CENSUS - unit pins (the seal-census v0.397.0
// test shape). Every anatomy constant is VERBATIM from the face-22 log
// (36825236093, the held artifact) and the deposit.mjs emitter shapes;
// face 22's own distribution (goal-churn 8, walk-timeout 5, decide-timeout
// 4, no-path 3, open-timeout 2, brake-refusal 1, nothing-to-deposit 1) is
// the field baseline the walk-deliveries cure prices against.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseHopZero, hopCensus, classifyHopZero, HOP_ZERO_RE } from '../../src/lib/hopcensus.mjs'

// face-22 verbatims (one per class, real bots/positions/dists)
const GOAL_CHURN = 'F7 [F7] hop: chest at [-123,68,411] d=16 zero: chest unreachable (The goal was changed before it could be completed!)'
const WALK_TIMEOUT = 'F8 [F8] hop: chest at [-138,68,421] d=13 zero: chest unreachable (walk to chest (retry): timeout after 28090ms)'
const DECIDE_TIMEOUT = 'F12 [F12] hop: chest at [-143,68,411] d=23 zero: chest unreachable (Took to long to decide path to goal!)'
const NO_PATH = 'F19 [F19] hop: chest at [-133,68,411] d=4 zero: chest unreachable (No path to the goal!)'
const OPEN_TIMEOUT = 'F1 [F1] hop: chest at [-122,68,395] d=4 zero: cannot open chest (open chest: timeout after 10000ms)'
const BRAKE = 'F5 [F5] hop: chest at [-118,68,417] d=16 zero: chest unreachable (goal brake: 6 goals in 5s - walk to chest refused for 10s)'
const NOTHING = 'F9 [F9] hop: chest at [-133,68,419] zero: nothing to deposit'
// the emitter's other shapes (deposit.mjs lines 1987/2092)
const BEYOND_RADIUS = 'F3 [F3] hop: chest at [-120,68,408] d=51 zero: chest beyond the hop search radius 24 - walking home instead'
const NO_D = 'F2 [F2] hop: chest at [-103,68,417] zero: chest unreachable (No path to the goal!)'
const QUESTION_POS = 'F4 [F4] hop: chest at [?,?,?] d=9 zero: chest unreachable (No path to the goal!)'
const PATH_STOPPED = 'F6 [F6] hop: chest at [-133,68,411] d=13 zero: chest unreachable (Path was stopped before it could be completed!)'
const WATER_RESCUE = 'F11 [F11] hop: chest at [-133,68,411] d=13 zero: chest unreachable (water rescue in progress (walk to chest refused))'
const UNREACHABLE_OTHER = 'F13 [F13] hop: chest at [-133,68,411] d=13 zero: chest unreachable (some future wording)'
const BUDGET_FLOOR = 'F8 [F8] hop: chest at [-124,73,412] d=30 zero: chest unreachable (budget exhausted (walk floor))'

test('face-22 verbatims: each why class lands in its own bucket', () => {
  const c = hopCensus([GOAL_CHURN, WALK_TIMEOUT, DECIDE_TIMEOUT, NO_PATH, OPEN_TIMEOUT, BRAKE, NOTHING])
  assert.deepEqual(c.byWhy, {
    'goal-churn': 1, 'walk-timeout': 1, 'decide-timeout': 1,
    'no-path': 1, 'open-timeout': 1, 'brake-refusal': 1, 'nothing-to-deposit': 1,
  })
  assert.equal(c.total, 7)
})

test('parse: bot, coords, dist, raw why, class', () => {
  assert.deepEqual(parseHopZero(DECIDE_TIMEOUT), {
    bot: 'F12', x: -143, y: 68, z: 411, dist: 23,
    why: 'chest unreachable (Took to long to decide path to goal!)',
    klass: { why: 'decide-timeout' },
  })
})

test('timeout ms captures: open vs walk never cross (the order law)', () => {
  const c = hopCensus([OPEN_TIMEOUT, WALK_TIMEOUT, WALK_TIMEOUT])
  assert.deepEqual(c.timeouts.open, [10000])
  assert.deepEqual(c.timeouts.walk, [28090, 28090])
  assert.equal(classifyHopZero('cannot open chest (open chest: timeout after 10000ms)').why, 'open-timeout')
  assert.equal(classifyHopZero('chest unreachable (walk to chest (retry): timeout after 15000ms)').why, 'walk-timeout')
  // the open family's timeout must NOT read as a walk timeout
  assert.equal(classifyHopZero('cannot open chest (open chest: timeout after 10000ms)').ms, 10000)
})

test('beyond-radius: the radius rides the class', () => {
  const e = parseHopZero(BEYOND_RADIUS)
  assert.equal(e.klass.why, 'beyond-radius')
  assert.equal(e.klass.radius, 24)
  assert.equal(e.dist, 51)
})

test('the no-d= variant parses with dist null (the emitter skips unknown dists)', () => {
  const e = parseHopZero(NO_D)
  assert.equal(e.bot, 'F2')
  assert.equal(e.dist, null)
  assert.equal(e.klass.why, 'no-path')
  const c = hopCensus([NO_D])
  assert.equal(c.dists.n, 0)
})

test('the ?-position variant: parses, dist priced, chest NOT bucketed', () => {
  const e = parseHopZero(QUESTION_POS)
  assert.equal(e.x, null)
  assert.equal(e.z, null)
  assert.equal(e.dist, 9)
  const c = hopCensus([QUESTION_POS])
  assert.deepEqual(c.byChest, {})
  assert.equal(c.dists.n, 1)
})

test('path-stopped / water-rescue / budget-floor / unreachable-other: the named unknowns stay visible', () => {
  assert.equal(classifyHopZero('chest unreachable (Path was stopped before it could be completed!)').why, 'path-stopped')
  assert.equal(classifyHopZero('chest unreachable (water rescue in progress (walk to chest refused))').why, 'water-rescue')
  // face 23's own class: the walk FLOOR's budget dies before the chest
  const bf = classifyHopZero('chest unreachable (budget exhausted (walk floor))')
  assert.equal(bf.why, 'budget-floor')
  assert.equal(parseHopZero(BUDGET_FLOOR).dist, 30)
  assert.equal(classifyHopZero('chest unreachable (some future wording)').why, 'unreachable-other')
  // a non-unreachable stranger is 'other', never dropped
  assert.equal(classifyHopZero('some future reason entirely').why, 'other')
})

test('hot chest: byChest counts the repeat position (the delivery hazard)', () => {
  const c = hopCensus([DECIDE_TIMEOUT, GOAL_CHURN, 'F8 [F8] hop: chest at [-143,68,411] d=13 zero: chest unreachable (No path to the goal!)'])
  assert.deepEqual(c.byChest, { '-143,68,411': 2, '-123,68,411': 1 })
  assert.deepEqual(c.byBot, { F12: 1, F7: 1, F8: 1 })
})

test('dist stats: max/sum/n over the priced clauses only', () => {
  const c = hopCensus([DECIDE_TIMEOUT, WALK_TIMEOUT, NO_D, NOTHING])
  assert.deepEqual(c.dists, { n: 2, max: 23, sum: 36 })
})

test('the face-22 baseline shape: 24 zeros, the full distribution', () => {
  const c = hopCensus([
    GOAL_CHURN, GOAL_CHURN, GOAL_CHURN, GOAL_CHURN, GOAL_CHURN, GOAL_CHURN, GOAL_CHURN, GOAL_CHURN,
    WALK_TIMEOUT, WALK_TIMEOUT, WALK_TIMEOUT, WALK_TIMEOUT, WALK_TIMEOUT,
    DECIDE_TIMEOUT, DECIDE_TIMEOUT, DECIDE_TIMEOUT, DECIDE_TIMEOUT,
    NO_PATH, NO_PATH, NO_PATH,
    OPEN_TIMEOUT, OPEN_TIMEOUT,
    BRAKE, NOTHING,
  ])
  assert.equal(c.total, 24)
  assert.deepEqual(c.byWhy, {
    'goal-churn': 8, 'walk-timeout': 5, 'decide-timeout': 4,
    'no-path': 3, 'open-timeout': 2, 'brake-refusal': 1, 'nothing-to-deposit': 1,
  })
  assert.deepEqual(c.timeouts.walk, [28090, 28090, 28090, 28090, 28090])
  assert.deepEqual(c.timeouts.open, [10000, 10000])
})

test('the face-23 baseline shape: 33 zeros, budget-floor rides its own class', () => {
  const c = hopCensus([
    WALK_TIMEOUT, WALK_TIMEOUT, WALK_TIMEOUT, WALK_TIMEOUT, WALK_TIMEOUT, WALK_TIMEOUT, WALK_TIMEOUT, WALK_TIMEOUT, WALK_TIMEOUT, WALK_TIMEOUT, WALK_TIMEOUT, WALK_TIMEOUT, WALK_TIMEOUT,
    BUDGET_FLOOR, BUDGET_FLOOR, BUDGET_FLOOR, BUDGET_FLOOR, BUDGET_FLOOR, BUDGET_FLOOR, BUDGET_FLOOR, BUDGET_FLOOR, BUDGET_FLOOR,
    DECIDE_TIMEOUT, DECIDE_TIMEOUT, DECIDE_TIMEOUT,
    GOAL_CHURN, GOAL_CHURN, GOAL_CHURN,
    NO_PATH, NO_PATH,
    OPEN_TIMEOUT, OPEN_TIMEOUT,
    BEYOND_RADIUS,
  ])
  assert.equal(c.total, 33)
  assert.deepEqual(c.byWhy, {
    'walk-timeout': 13, 'budget-floor': 9, 'decide-timeout': 3,
    'goal-churn': 3, 'no-path': 2, 'open-timeout': 2, 'beyond-radius': 1,
  })
  assert.deepEqual(c.byChest['-124,73,412'], 9) // the hot chest rides the floor class
})

test('the honest zero: no zero-hops reads zeros (a clean delivery face)', () => {
  const c = hopCensus([
    'launching 19 bots for 600s -> targets sand, gravel, dirt, stone',
    'F1 [F1] hop: chest at [-143,68,411] d=23 delivered 27u (not a zero line - the shape must not match)',
    'loot ledger: mined=2116 banked=1728 smelted=34 pocket=380u/113s accounted=2142 unaccounted=0 surplus=26u conversion=101.2%',
  ])
  assert.equal(c.total, 0)
  assert.deepEqual(c.byWhy, {})
  assert.deepEqual(c.byBot, {})
  assert.deepEqual(c.byChest, {})
  assert.deepEqual(c.timeouts, { open: [], walk: [] })
  assert.deepEqual(c.dists, { n: 0, max: 0, sum: 0 })
  assert.deepEqual(c.events, [])
})

test('junk battery + anchored shape (non-strings, non-arrays, strangers)', () => {
  assert.equal(parseHopZero(null), null)
  assert.equal(parseHopZero(42), null)
  assert.equal(parseHopZero(undefined), null)
  assert.equal(parseHopZero({ bot: 'F1' }), null)
  assert.equal(parseHopZero('F1 final bank budget: flow-priced 248s'), null)
  assert.equal(parseHopZero('F1 [F1] direct deposit: 27 chest slots derived from the 63-slot view'), null)
  const junk = hopCensus([GOAL_CHURN, null, 42, { line: true }, undefined, NO_PATH])
  assert.equal(junk.total, 2)
  // the timestamped integration shape is not the production surface
  assert.ok(!HOP_ZERO_RE.test('2026-10-01T09:30:00.000Z ' + DECIDE_TIMEOUT))
})
