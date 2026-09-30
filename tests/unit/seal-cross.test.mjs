// (v0.353.0) THE SEAL CROSS - the mover must not eat the seal it funded.
//
// MEASURED (fleet 36710193486, the ninth face - the calm): the wet shift
// armed perfectly - census ARMED, plan buildable, the seal LANDED - and the
// tunnel call ate the cure anyway: 'wet shift tunnel: 2 blocks in 3s
// (stalled)' + 'wet shift stalled (tunnel done=2 ...)' with the feet still
// at home. The raw tunnel digs every solid feet cell in its path, and the
// seal IS a solid feet cell in its path - the mover's first cut dug the
// v0.341.0 pre-seal back out, the water returned, the shift stalled home.
// The cure: the landed feetWet seal gets crossed BEFORE the tunnel rides -
// the feet stand on the seal, the walk resumes one level up, the tunnel
// digs FORWARD. Every refusal and every stall falls through to the tunnel
// byte for byte (the account of record law, the v0.344.0 swallow speaks).
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { wetShiftCrossPlan, wetShiftCrossLanded, SEAL_CROSS_ROUNDS, SEAL_CROSS_SETTLE_TICKS } from '../../src/lib/surface.mjs'

const fleetSrc = readFileSync(new URL('../../testbed/fleet19.mjs', import.meta.url), 'utf8')

test('the landed feetWet seal crosses: the plan jumps on and names the floor', () => {
  const plan = wetShiftCrossPlan({ sealed: true, feetWet: true, headBox: 'empty', headName: null })
  assert.equal(plan.cross, true)
  assert.match(plan.why, /jump on/)
  assert.match(plan.why, /one level up/)
})

test('a water seal headroom rides: the wet landing is the climb\'s own machinery', () => {
  const plan = wetShiftCrossPlan({ sealed: true, feetWet: true, headBox: 'empty', headName: 'water' })
  assert.equal(plan.cross, true, 'standing in water on the seal is physics-legal - the climb owns the wet')
})

test('an unlanded seal defers: the tunnel digs as before (the fall-through law)', () => {
  const plan = wetShiftCrossPlan({ sealed: false, feetWet: true, headBox: 'empty', headName: null })
  assert.equal(plan.cross, false)
  assert.match(plan.why, /did not land/)
  assert.match(plan.why, /tunnel digs as before/)
})

test('the head-level seal defers: the walk path was never blocked', () => {
  const plan = wetShiftCrossPlan({ sealed: true, feetWet: false, headBox: 'empty', headName: null })
  assert.equal(plan.cross, false)
  assert.match(plan.why, /walk path/)
})

test('a solid seal headroom refuses the cross (the walled class)', () => {
  const plan = wetShiftCrossPlan({ sealed: true, feetWet: true, headBox: 'block', headName: 'stone' })
  assert.equal(plan.cross, false)
  assert.match(plan.why, /headroom is solid/)
})

test('the box-lie headroom vetoes the blind cross (the second-eye law)', () => {
  const plan = wetShiftCrossPlan({ sealed: true, feetWet: true, headBox: 'block', headName: 'water' })
  assert.equal(plan.cross, false, "box 'block' + a fluid name is a stale read - never a cross stance")
  assert.match(plan.why, /box lies/)
})

test('the junk battery: no shape crosses blind (the body-guard law)', () => {
  assert.equal(wetShiftCrossPlan().cross, false, 'a bare call defers')
  assert.equal(wetShiftCrossPlan(null).cross, false, 'a junk call defers (the destructure guard)')
  assert.equal(wetShiftCrossPlan({ sealed: 'yes', feetWet: true, headBox: 'empty' }).cross, false, 'a junk seal verdict is not a landed seal (STRICT boolean)')
  assert.equal(wetShiftCrossPlan({ sealed: true, feetWet: 1, headBox: 'empty' }).cross, false, 'a truthy junk wet eye is not the wet shape (the sealCrossTarget STRICT law)')
  assert.equal(wetShiftCrossPlan({ sealed: true, feetWet: true, headBox: undefined, headName: undefined }).cross, true, 'a blind headroom read is not a refusal - the cross rides (the tunnel follows as the account of record)')
})

test('the landing verdict is exact: on the seal column, one level up', () => {
  assert.equal(wetShiftCrossLanded({ toX: 52, toY: 60, toZ: 100, cellX: 52, cellY: 59, cellZ: 100 }), true, 'the feet stand ON the seal')
  assert.equal(wetShiftCrossLanded({ toX: 50, toY: 59, toZ: 100, cellX: 52, cellY: 59, cellZ: 100 }), false, 'the feet stayed home - nothing landed')
  assert.equal(wetShiftCrossLanded({ toX: 52, toY: 59, toZ: 100, cellX: 52, cellY: 59, cellZ: 100 }), false, 'the seal level is the block\'s own level, not a landing')
  assert.equal(wetShiftCrossLanded({ toX: 52, toY: 61, toZ: 100, cellX: 52, cellY: 59, cellZ: 100 }), false, 'a overshoot is not a landing (the pillar-jump face)')
  assert.equal(wetShiftCrossLanded({ toX: 52, toY: 60, toZ: 102, cellX: 52, cellY: 59, cellZ: 100 }), false, 'a slide-off column is not a landing')
  assert.equal(wetShiftCrossLanded({ toX: NaN, toY: 60, toZ: 100, cellX: 52, cellY: 59, cellZ: 100 }), false, 'junk feet never land')
  assert.equal(wetShiftCrossLanded(), false, 'a bare call never lands')
  assert.equal(wetShiftCrossLanded(null), false, 'a junk call never lands')
})

test('the constants pin: the cross pacing is bounded (the shelter pacing law)', () => {
  assert.equal(SEAL_CROSS_ROUNDS, 2, 'two rounds - the pre-seal\'s own 2-round shape')
  assert.equal(SEAL_CROSS_SETTLE_TICKS, 10, 'the settle before the verify (the shelter\'s field-proven pacing)')
})

test('the wiring: the cross rides the landed seal inside the pre-seal gate, before the tunnel', () => {
  // the four canonical line forms ride the final-climb family
  assert.match(fleetSrc, /seal cross deferred: \$\{crossPlan\.why\}/, 'the defer form names the plan\'s why')
  assert.match(fleetSrc, /seal cross LANDED: the walk resumes from the seal's top/, 'the result form names the new stance')
  assert.match(fleetSrc, /seal cross stalled: the feet stayed home/, 'the refusal form names the rounds and the fall-through')
  assert.match(fleetSrc, /seal cross swallowed: \$\{e && e\.message \? e\.message : 'unknown throw'\}/, 'the swallow speaks (the v0.344.0 law - the account never sleeps)')
  // the plan reads the fresh head cell after the placement
  assert.match(fleetSrc, /const cHead = miner\.bot\.blockAt\(sCell\.offset\(0, 1, 0\)\)/, 'the headroom rides a FRESH read (the seal may have changed the water)')
  assert.match(fleetSrc, /wetShiftCrossPlan\(\{ sealed, feetWet, headBox: cHead\?\.boundingBox \?\? null, headName: cHead\?\.name \?\? null \}\)/, 'the plan reads the landed verdict + the wet eye + the two-eye headroom')
  // the cross verify is exact
  assert.match(fleetSrc, /wetShiftCrossLanded\(\{ toX: to\.x, toY: to\.y, toZ: to\.z, cellX: sCell\.x, cellY: sCell\.y, cellZ: sCell\.z \}\)/, 'the landing verify is the exact seal column')
  // the controls are released even on a throw (the finally law)
  assert.match(fleetSrc, /setControlState\('jump', false\)/, 'the jump control releases')
  assert.match(fleetSrc, /setControlState\('forward', false\)/, 'the forward control releases')
  // the order: the cross sits between the LANDED line and the tunnel call
  const landedIdx = fleetSrc.indexOf('seal cross LANDED')
  const tunnelIdx = fleetSrc.indexOf('wet shift tunnel:')
  assert.ok(landedIdx > 0 && tunnelIdx > landedIdx, 'the cross rides before the tunnel (the account of record follows)')
})
