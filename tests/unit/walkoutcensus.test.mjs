// (v0.437.0) THE WALK-OUT WITNESS LENS - unit pins. The enforcer's one
// line, parsed back through the fleet's own emitters (the ROUND-TRIP law:
// the test lines are BUILT by walkoutStallLine + walkoutEscalation - the
// parser can never drift from what the field actually prints).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { walkoutStallLine, walkoutEscalation } from '../../src/lib/relogwalkout.mjs'
import { parseWalkoutStall, walkoutWitnessCensus } from '../../src/lib/walkoutcensus.mjs'

const line = (o) => walkoutStallLine({ tag: 'F10 [F10]', ...o })

test('walk-out witness: the round-trip law - rung 1 (the emitter builds the line, the parser reads it)', () => {
  const why = walkoutEscalation({ stage: 1 }).why
  const l = line({ displacement: 1.2, windowMs: 30000, why })
  assert.equal(l, 'F10 [F10] water: relog walk-out stalled (window 30s, 1.2 blocks of the 1.0 progress bar) - rung 1: the walk gates and stalls reset, the funnel admits fresh walks')
  assert.deepEqual(parseWalkoutStall(l), {
    bot: 'F10', windowS: 30, displacement: 1.2, progressBar: 1, rung: 1,
    why: 'the walk gates and stalls reset, the funnel admits fresh walks'
  })
})

test('walk-out witness: the unmeasured class rides null - never a zero lie', () => {
  const why = walkoutEscalation({ stage: 2 }).why
  const l = line({ displacement: null, windowMs: 30000, why })
  assert.match(l, /, displacement unmeasured\) - rung 2:/)
  const p = parseWalkoutStall(l)
  assert.equal(p.displacement, null)
  assert.equal(p.progressBar, null)
  assert.equal(p.rung, 2)
  assert.equal(p.windowS, 30)
})

test('walk-out witness: rung 3 - the shift exit named, the long prose tail consumed verbatim', () => {
  const why = walkoutEscalation({ stage: 3 }).why
  const l = line({ displacement: 0.4, windowMs: 45000, why })
  const p = parseWalkoutStall(l)
  assert.equal(p.rung, 3)
  assert.equal(p.why, 'the gates reset and the goal slot releases - the honest shift exit is named, the session loop owns the call (unwired: the relog loop-break and the attempt ceiling backstop it)')
})

test('walk-out witness: the junk battery - the neighbor lanes\' lines never parse', () => {
  const junk = [
    'F10 [F10] water: frozen client relog (the gate holds 30s; the fresh client walks the hazard-ledgered column out)', // the relog lane's own line
    'F10 [F10] walk: timeout after 8000ms',
    'F10 [F10] water: transit toward known land (oak_log) at [-134,413] d=3',
    'F10 water: relog walk-out stalled (window 30s, 1.2 blocks of the 3.0 progress bar) - rung 1: x', // no bracket tag
    'water: relog walk-out stalled (window 30s, 1.0 blocks of the 3.0 progress bar) - rung 1: x', // no tag at all
    'F10 [F10] water: relog walk-out verified (window 30s) - rung 1: x', // a different walk-out verdict shape
    null,
    7,
    undefined
  ]
  for (const j of junk) {
    assert.equal(parseWalkoutStall(j), null, `junk ${typeof j}`)
  }
})

test('walk-out witness: the hand-counted accumulation - the ladder reaching all three rungs', () => {
  const why1 = walkoutEscalation({ stage: 1 }).why
  const why2 = walkoutEscalation({ stage: 2 }).why
  const why3 = walkoutEscalation({ stage: 3 }).why
  const c = walkoutWitnessCensus([
    line({ tag: 'F10 [F10]', displacement: 1.2, windowMs: 30000, why: why1 }),
    line({ tag: 'F10 [F10]', displacement: 0.4, windowMs: 30000, why: why2 }),
    line({ tag: 'F10 [F10]', displacement: 0.4, windowMs: 45000, why: why3 }),
    line({ tag: 'F14 [F14]', displacement: 2.9, windowMs: 30000, why: why1 })
  ])
  assert.equal(c.windows.n, 4)
  assert.deepEqual(c.windows.byBot, { F10: 3, F14: 1 })
  assert.deepEqual(c.windows.byRung, { 1: 2, 2: 1, 3: 1 })
  assert.deepEqual(c.windows.windowS, { n: 4, min: 30, max: 45, sum: 135 })
  assert.deepEqual(c.windows.displacement, { n: 4, min: 0.4, max: 2.9, sum: 4.9, unmeasured: 0 })
  assert.equal(c.windows.barMax, 1)
  assert.equal(c.unparsed, 0)
})

test('walk-out witness: the unmeasured rows count separately and never enter the displacement series', () => {
  const why = walkoutEscalation({ stage: 1 }).why
  const c = walkoutWitnessCensus([
    line({ displacement: 0.8, windowMs: 30000, why }),
    line({ displacement: null, windowMs: 30000, why }),
    line({ displacement: null, windowMs: 30000, why })
  ])
  assert.equal(c.windows.n, 3)
  assert.equal(c.windows.displacement.unmeasured, 2)
  assert.deepEqual(c.windows.displacement, { n: 1, min: 0.8, max: 0.8, sum: 0.8, unmeasured: 2 })
})

test('walk-out witness: the escape hatch counts a walk-out-lane line the grammar refused', () => {
  const c = walkoutWitnessCensus(['F1 [F1] water: relog walk-out stalled (window junk, no numbers here)'])
  assert.equal(c.windows.n, 0)
  assert.equal(c.unparsed, 1)
})

test('walk-out witness: the honest zeros and the non-string input', () => {
  const c = walkoutWitnessCensus(['F1 [F1] heartbeat alive', 'nothing of ours'])
  assert.equal(c.windows.n, 0)
  assert.deepEqual(c.windows.byBot, {})
  assert.deepEqual(c.windows.byRung, {})
  assert.deepEqual(c.windows.windowS, { n: 0, min: null, max: null, sum: 0 })
  assert.deepEqual(c.windows.displacement, { n: 0, min: null, max: null, sum: 0, unmeasured: 0 })
  assert.equal(c.windows.barMax, null)
  assert.equal(c.unparsed, 0)
  const e = walkoutWitnessCensus('not an array')
  assert.equal(e.windows.n, 0)
  assert.equal(e.unparsed, 0)
})

test('walk-out witness: determinism - the same input reads the same census twice', () => {
  const why = walkoutEscalation({ stage: 1 }).why
  const rows = [line({ displacement: 1.2, windowMs: 30000, why })]
  const a = JSON.stringify(walkoutWitnessCensus(rows))
  const b = JSON.stringify(walkoutWitnessCensus(rows))
  assert.equal(a, b)
})
