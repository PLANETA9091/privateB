//
// relogbill.test.mjs - THE RELOG'S OWN LOOP BILL (v0.715.0) unit tests.
// The face lines are byte-verbatim forms from the stored faces (the
// 41st's own loop face - F6's consecutive relogs + the walk-out stalls
// that answered them, F2's single relog), the hand-built censuses price
// the edge skins the era never rode (the promise-held face, the no-
// repeats face). The era's face-level reads (33 relogs, 26 stalled
// deliveries = 79%, the repeats owning 76%; the 41st the LOOP FACE -
// 15 relogs, 5 repeat bots owning 14/15 = 93%, the ladder's terminal
// rung reached twice) ride the decompose surface.
//
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { relogBill } from '../../src/lib/relogbill.mjs'
import { frozenCensus } from '../../src/lib/frozencensus.mjs'
import { walkoutWitnessCensus } from '../../src/lib/walkoutcensus.mjs'

// The loop's own skin through the REAL lens path (both censuses first),
// the lines byte-verbatim from the 41st's log: F6 relogged twice (the
// repeat) and both walk-out windows stalled; F2 relogged once.
const MINI = [
  'F6 [F6] water: frozen client relog (#1 consecutive) (frozen while head-wet (1 verdict) - the drowning clock owns this client) - ending the session, the reconnect lane rebuilds the physics; the drowning sentry holds non-critical pages 10s (the frozen-return gate) - o2=19 health=20 window=legacy',
  'F6 [F6] water: relog walk-out stalled (window 10s, 0.3 blocks of the 1.0 progress bar) - rung 1: the walk gates and stalls reset, the funnel admits fresh walks',
  'F6 [F6] water: frozen client relog (#2 consecutive) (frozen while head-wet (1 verdict) - the drowning clock owns this client) - ending the session, the reconnect lane rebuilds the physics; the drowning sentry holds non-critical pages 20s (the frozen-return gate) - o2=20 health=20 window=legacy',
  'F6 [F6] water: relog walk-out stalled (window 20s, 0.2 blocks of the 1.0 progress bar) - rung 2: the gates reset AND the wedged goal slot releases, the plan re-decides',
  'F2 [F2] water: frozen client relog (#1 consecutive) (frozen while head-wet (1 verdict) - the drowning clock owns this client) - ending the session, the reconnect lane rebuilds the physics; the drowning sentry holds non-critical pages 10s (the frozen-return gate) - o2=20 health=20 window=legacy'
]

test('relogBill: the loop\u2019s own skin folds through the real lens path (the 41st, byte-verbatim)', () => {
  const b = relogBill(frozenCensus(MINI), walkoutWitnessCensus(MINI))
  assert.ok(b, 'the bill opens on a relog face')
  assert.equal(b.relogs, 3)
  assert.equal(b.stalls, 2)
  assert.ok(Math.abs(b.stallRate - 2 / 3) < 1e-9, 'the stall rate rides the relogs\u2019 own denominator')
  assert.deepEqual(b.rungs, { r1: 1, r2: 1, r3: 0 })
  assert.equal(b.repeats, 1, 'F6\u2019s second relog is the loop\u2019s own signature')
  assert.deepEqual(b.repeatBots, { F6: 2 })
  assert.equal(b.repeatRelogs, 2, 'the repeats own 2 of 3 relogs')
})

test('relogBill: the honest silences (junk, empty, relog-free)', () => {
  assert.equal(relogBill(), null, 'no args')
  assert.equal(relogBill(null, null), null)
  assert.equal(relogBill('junk', null), null)
  assert.equal(relogBill({ relogs: {} }, null), null, 'no relog count - no bill')
  assert.equal(relogBill({ relogs: { n: 0, byBot: {} } }, { windows: { n: 0, byRung: {} } }), null, 'a relog-free face opens no bill')
  const noRelog = frozenCensus([
    'F10 [F10] water: frozen physics (2 flat passes at y=49.4, o2=20, head WET) - standing down, the reconnect lane owns this'
  ])
  assert.equal(relogBill(noRelog, walkoutWitnessCensus([])), null, 'a verdicts-only face stays silent - the saver never fired')
})

test('relogBill: the promise-held skin (the relogs cured, zero stalls)', () => {
  const held = frozenCensus([
    'F5 [F5] water: frozen client relog (#1 consecutive) (frozen while head-wet (1 verdict) - the drowning clock owns this client) - ending the session, the reconnect lane rebuilds the physics; the drowning sentry holds non-critical pages 40s (the frozen-return gate) - o2=20 health=20 window=legacy',
    'F9 [F9] water: frozen client relog (#1 consecutive) (frozen while head-wet (1 verdict) - the drowning clock owns this client) - ending the session, the reconnect lane rebuilds the physics; the drowning sentry holds non-critical pages 40s (the frozen-return gate) - o2=20 health=20 window=legacy'
  ])
  const b = relogBill(held, walkoutWitnessCensus([]))
  assert.ok(b, 'a relog face opens the bill even when the walk-outs cured')
  assert.equal(b.relogs, 2)
  assert.equal(b.stalls, 0, 'the stalls read zero - the promise HELD by shape')
  assert.equal(b.stallRate, 0)
  assert.deepEqual(b.rungs, { r1: 0, r2: 0, r3: 0 })
  assert.equal(b.repeats, 0, 'two single relogs are the saver doing its job')
  assert.deepEqual(b.repeatBots, {})
  assert.equal(b.repeatRelogs, 0)
})

test('relogBill: the era\u2019s own bill reads by hand (the 41st, the LOOP FACE)', () => {
  // The 41st: 15 relogs -> 10 stalled walk-outs (67%), the ladder r1 6 /
  // r2 2 / r3 2, five repeat bots (F6=5, F13=3, F2=2, F10=2, F14=2)
  // owning 14 of 15 relogs (93%) - THE RELOG FEEDS THE LOOP.
  const b = relogBill(
    { relogs: { n: 15, byBot: { F6: 5, F13: 3, F2: 2, F10: 2, F14: 2, F19: 1 } } },
    { windows: { n: 10, byRung: { 1: 6, 2: 2, 3: 2 } } }
  )
  assert.ok(b)
  assert.equal(b.relogs, 15)
  assert.equal(b.stalls, 10)
  assert.ok(Math.abs(b.stallRate - 10 / 15) < 1e-9)
  assert.deepEqual(b.rungs, { r1: 6, r2: 2, r3: 2 })
  assert.equal(b.repeats, 5)
  assert.equal(b.repeatRelogs, 14)
  assert.deepEqual(b.repeatBots, { F6: 5, F13: 3, F2: 2, F10: 2, F14: 2 })
})
