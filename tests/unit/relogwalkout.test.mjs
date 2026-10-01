// (v0.425.0) THE RELOG WALK-OUT ENFORCER's tests - the frozen-after-relog
// detector. The shapes are the face-36864564525 F10 lane's own (three
// consecutive frozen-while-head-wet relogs on one water column, o2=20, the
// fresh client re-paged wet and froze again). The thresholds are NOT this
// file's inventions: the window is frozenReturnGate's laddered hold (the
// budget the relog line itself announces) and the progress bar is the walk
// layer's own STALL_MIN_PROGRESS - both pins ride the tests so the one-law
// identity can never silently drift.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  RELOG_WALKOUT_MIN_PROGRESS,
  walkoutWindowMs, walkoutDisplacement, walkoutVerdict, walkoutEscalation, walkoutStallLine
} from '../../src/lib/relogwalkout.mjs'
import { frozenReturnGate } from '../../src/lib/drowning.mjs'
import { STALL_MIN_PROGRESS } from '../../src/lib/walkgovernor.mjs'

test('relog walk-out: the window IS the frozen-return gate ladder (the code owns the budget)', () => {
  // the gate's own rungs: 10s / 20s / 40s, capped at 60s - the walk-out
  // witness reads the SAME numbers the relog line prints, never a new one
  assert.equal(walkoutWindowMs({ consecutiveRelogs: 0 }), 0)
  assert.equal(walkoutWindowMs({ consecutiveRelogs: 1 }), 10000)
  assert.equal(walkoutWindowMs({ consecutiveRelogs: 2 }), 20000)
  assert.equal(walkoutWindowMs({ consecutiveRelogs: 3 }), 40000)
  assert.equal(walkoutWindowMs({ consecutiveRelogs: 4 }), 60000)
  assert.equal(walkoutWindowMs({ consecutiveRelogs: 9 }), 60000)
  // the identity holds across the whole domain, junk included
  for (const n of [0, 1, 2, 3, 4, 5, 12, 'junk', NaN, null, undefined]) {
    assert.equal(walkoutWindowMs({ consecutiveRelogs: n }), frozenReturnGate({ consecutiveRelogs: n }))
  }
})

test('relog walk-out: the progress bar IS the walk layer stall bar (one law, one number)', () => {
  assert.equal(RELOG_WALKOUT_MIN_PROGRESS, STALL_MIN_PROGRESS)
  assert.equal(RELOG_WALKOUT_MIN_PROGRESS, 1.0)
})

test('relog walk-out: displacement is pure euclidean, junk reads unmeasured', () => {
  // the 3-4-5 triangle across the axes
  assert.equal(walkoutDisplacement({ x: 0, y: 0, z: 0 }, { x: 3, y: 4, z: 0 }), 5)
  // the F10 shape: the fresh client back into the same column - zero drift
  const col = { x: -131, y: 49.4, z: 414 }
  assert.equal(walkoutDisplacement(col, col), 0)
  assert.ok(walkoutDisplacement(col, { x: -131, y: 50.2, z: 414 }) > 0)
  assert.ok(walkoutDisplacement(col, { x: -131, y: 50.2, z: 414 }) < 1)
  // junk never judges: missing points, NaN axes, garbage shapes
  assert.equal(walkoutDisplacement(null, col), null)
  assert.equal(walkoutDisplacement(col, null), null)
  assert.equal(walkoutDisplacement(undefined, undefined), null)
  assert.equal(walkoutDisplacement({ x: NaN, y: 1, z: 1 }, col), null)
  assert.equal(walkoutDisplacement(col, { x: 1, y: undefined, z: 1 }), null)
  assert.equal(walkoutDisplacement('junk', 42), null)
})

test('relog walk-out: verdict classes - walked-out at the bar, stalled under, unmeasured on junk', () => {
  // the boundary rides >= : exactly the bar is real movement (the governor's
  // own progress law - a 1.0-block displacement clears its churn streak)
  assert.equal(walkoutVerdict({ displacement: RELOG_WALKOUT_MIN_PROGRESS }), 'walked-out')
  assert.equal(walkoutVerdict({ displacement: 1.5 }), 'walked-out')
  assert.equal(walkoutVerdict({ displacement: 24.7 }), 'walked-out')
  // the stalled class: the column held the bot
  assert.equal(walkoutVerdict({ displacement: 0 }), 'stalled')
  assert.equal(walkoutVerdict({ displacement: 0.2 }), 'stalled')
  assert.equal(walkoutVerdict({ displacement: 0.99 }), 'stalled')
  // the honest zero: a lost read escalates nothing
  assert.equal(walkoutVerdict({ displacement: null }), 'unmeasured')
  assert.equal(walkoutVerdict({ displacement: NaN }), 'unmeasured')
  assert.equal(walkoutVerdict({ displacement: 'junk' }), 'unmeasured')
  assert.equal(walkoutVerdict({}), 'unmeasured')
})

test('relog walk-out: the escalation ladder - rung 1 gates, rung 2 + goal, rung 3 names the shift exit', () => {
  const r1 = walkoutEscalation({ stage: 1 })
  assert.equal(r1.stage, 1)
  assert.equal(r1.resetGates, true)
  assert.equal(r1.releaseGoal, false)
  assert.equal(r1.shiftExitNamed, false)
  assert.ok(r1.why.includes('gates'))

  const r2 = walkoutEscalation({ stage: 2 })
  assert.equal(r2.stage, 2)
  assert.equal(r2.resetGates, true)
  assert.equal(r2.releaseGoal, true)
  assert.equal(r2.shiftExitNamed, false)
  assert.ok(r2.why.includes('goal slot'))

  const r3 = walkoutEscalation({ stage: 3 })
  assert.equal(r3.stage, 3)
  assert.equal(r3.resetGates, true)
  assert.equal(r3.releaseGoal, true)
  assert.equal(r3.shiftExitNamed, true)
  assert.ok(r3.why.includes('shift exit'))
  // the rung named (iii) is the ESCAPE HATCH: the session loop owns the call
  assert.ok(r3.why.includes('unwired'))

  // the ladder caps at the named exit - a fourth stalled window is still
  // rung 3 (the session loop's jurisdiction, not a new mechanism)
  const r4 = walkoutEscalation({ stage: 4 })
  assert.equal(r4.stage, 3)
  assert.equal(r4.shiftExitNamed, true)
  const r99 = walkoutEscalation({ stage: 99 })
  assert.equal(r99.stage, 3)
  assert.equal(r99.shiftExitNamed, true)
})

test('relog walk-out: junk stage never invents a deeper rung (the gates-decide convention)', () => {
  for (const s of [NaN, null, undefined, 'junk', -3, 0]) {
    const e = walkoutEscalation({ stage: s })
    assert.equal(e.stage, 1)
    assert.equal(e.resetGates, true)
    assert.equal(e.releaseGoal, false)
    assert.equal(e.shiftExitNamed, false)
  }
  assert.deepEqual(walkoutEscalation({}).stage, 1)
})

test('relog walk-out: the stall line carries the numbers and stays OUT of the relog counter lane', () => {
  const line = walkoutStallLine({
    tag: '[F10]',
    displacement: 0.2,
    windowMs: 10000,
    why: walkoutEscalation({ stage: 1 }).why
  })
  assert.equal(
    line,
    '[F10] water: relog walk-out stalled (window 10s, 0.2 blocks of the 1.0 progress bar) - rung 1: the walk gates and stalls reset, the funnel admits fresh walks'
  )
  // the decompose relog counter counts /frozen client relog/ - this line is
  // NOT one (the v0.361.0 loop-break line's wording law, one lane deeper)
  assert.ok(!/frozen client relog/.test(line))
  // the decompose gate-hold counter counts /frozen-return gate holds/ - not ours either
  assert.ok(!/frozen-return gate holds/.test(line))
})

test('relog walk-out: the stall line renders honest reads for unmeasured and junk windows', () => {
  const unmeasured = walkoutStallLine({
    tag: '[F12]',
    displacement: null,
    windowMs: 20000,
    why: walkoutEscalation({ stage: 2 }).why
  })
  assert.ok(unmeasured.includes('displacement unmeasured'))
  assert.ok(unmeasured.includes('window 20s'))
  assert.ok(unmeasured.startsWith('[F12] water: relog walk-out stalled'))

  // a junk window renders 0s - the shape never lies about what it read
  const junk = walkoutStallLine({ tag: '[F3]', displacement: 0, windowMs: 'junk', why: 'x' })
  assert.ok(junk.includes('window 0s, 0.0 blocks'))
})

test('relog walk-out: the F10 synthetic - three relog cycles ratchet the ladder, a real walk-out forgives', () => {
  // the F10 lane's pure shadow: same column every relog, zero displacement
  // every window - the ladder must climb rung by rung, never skip, never loop
  const col = { x: -131, y: 49.4, z: 414 }
  let stage = 0
  const rungs = []
  for (let cycle = 0; cycle < 3; cycle++) {
    const windowMs = walkoutWindowMs({ consecutiveRelogs: cycle + 1 })
    assert.ok(windowMs > 0) // the gate armed a real window each time
    const displacement = walkoutDisplacement(col, col) // the client froze in place
    const verdict = walkoutVerdict({ displacement })
    assert.equal(verdict, 'stalled')
    stage += 1
    const esc = walkoutEscalation({ stage })
    rungs.push(esc)
  }
  assert.deepEqual(rungs.map(r => r.stage), [1, 2, 3])
  assert.deepEqual(rungs.map(r => r.releaseGoal), [false, true, true])
  assert.equal(rungs[2].shiftExitNamed, true)

  // the relief shape: the work loop finally walks the bot out (>= the bar)
  // - the witness stands down and the honest completion resets the stage
  const walked = walkoutVerdict({ displacement: walkoutDisplacement(col, { x: -129, y: 49.9, z: 415 }) })
  assert.equal(walked, 'walked-out')
  assert.equal(walkoutDisplacement(col, { x: -129, y: 49.9, z: 415 }) >= RELOG_WALKOUT_MIN_PROGRESS, true)
})
