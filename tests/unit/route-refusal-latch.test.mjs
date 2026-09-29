// Tests for the route refusal latch (v0.321.0).
//
// MEASURED (fleet 36617588210, the memo's first face): F17 entered climbOut
// through its condemned column (-133,408) 21 times across chest-ascent +
// quarry-ascent + bank-trip phases - every entry refused instantly by the
// v0.319.0 wet-column memo (the memo worked, zero rotations) but the LADDER
// had no memory of its own route: 18 walk fallbacks that also died ('no
// chest in range (24 blocks from yard)'), 'bank trip: 0 (climb refused)'
// cadence after cadence, a 45s smelt-leg HOLD inside a trip that could
// never deliver - F17 banked ZERO while the fleet banked 2295.
// THE CURE: count the memo-refused climbs per bot (bot._routeRefusals); at
// 3 the ascent ladders and the bank-trip door refuse WITHOUT the climb -
// the pocket mines on. The v0.316.0 doom latch owns the final bank's own
// door, byte for byte untouched; its climbs still COUNT here.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { ROUTE_REFUSAL_LATCH_CYCLES, routeRefusalLatch } from '../../src/lib/surface.mjs'

const fleetSrc = readFileSync(new URL('../../testbed/fleet19.mjs', import.meta.url), 'utf8')
const surfaceSrc = readFileSync(new URL('../../src/lib/surface.mjs', import.meta.url), 'utf8')
const minerSrc = readFileSync(new URL('../../src/bots/miner.mjs', import.meta.url), 'utf8')

test('routeRefusalLatch: the fleet datum - F17\'s 21 refused climbs latch the route', () => {
  const v = routeRefusalLatch({ refusedCycles: 21 })
  assert.deepEqual(v, { latched: true, refused: 21 }, 'the datum latches and the echo names the count the log lines carry')
})

test('routeRefusalLatch: the honest ladder - record, confirm, condemn', () => {
  assert.equal(routeRefusalLatch({ refusedCycles: 1 }).latched, false, 'the first refusal records the column only')
  assert.equal(routeRefusalLatch({ refusedCycles: 2 }).latched, false, 'the second confirms the route - one more climb is asked')
  assert.equal(routeRefusalLatch({ refusedCycles: 3 }).latched, true, 'the third condemns the route itself')
})

test('routeRefusalLatch: past the threshold stays latched (the count never wraps)', () => {
  assert.equal(routeRefusalLatch({ refusedCycles: 10 }).latched, true)
  assert.equal(routeRefusalLatch({ refusedCycles: 100 }).latched, true)
})

test('routeRefusalLatch: the threshold overrides, junk thresholds fall to 3', () => {
  assert.equal(routeRefusalLatch({ refusedCycles: 2, latchCycles: 2 }).latched, true, 'a tighter latch condemns at 2')
  assert.equal(routeRefusalLatch({ refusedCycles: 4, latchCycles: 5 }).latched, false, 'a looser latch keeps asking')
  assert.equal(routeRefusalLatch({ refusedCycles: 3, latchCycles: NaN }).latched, true, 'NaN falls to the default 3')
  assert.equal(routeRefusalLatch({ refusedCycles: 3, latchCycles: 'junk' }).latched, true, 'junk falls to the default 3')
  assert.equal(routeRefusalLatch({ refusedCycles: 3, latchCycles: 0 }).latched, true, 'a zero threshold is junk - the default owns it')
  assert.equal(routeRefusalLatch({ refusedCycles: 3, latchCycles: -2 }).latched, true, 'a negative threshold is junk - the default owns it')
})

test('junk never latches (the body-guard law - the ninth Number(null) strike)', () => {
  assert.doesNotThrow(() => routeRefusalLatch(null), 'the null call is safe (the destructure-before-default trap)')
  assert.deepEqual(routeRefusalLatch(null), { latched: false, refused: 0 })
  assert.deepEqual(routeRefusalLatch(undefined), { latched: false, refused: 0 })
  assert.deepEqual(routeRefusalLatch({}), { latched: false, refused: 0 }, 'a missing count reads as zero refusals')
  assert.deepEqual(routeRefusalLatch({ refusedCycles: NaN }), { latched: false, refused: 0 }, 'NaN never latches')
  assert.deepEqual(routeRefusalLatch({ refusedCycles: 'junk' }), { latched: false, refused: 0 }, 'junk never latches')
  assert.deepEqual(routeRefusalLatch({ refusedCycles: -3 }), { latched: false, refused: 0 }, 'negative counts never latch')
  assert.deepEqual(routeRefusalLatch({ refusedCycles: undefined }), { latched: false, refused: 0 })
})

test('constants pin: the threshold is three climbs', () => {
  assert.equal(ROUTE_REFUSAL_LATCH_CYCLES, 3, 'first records, second confirms, third condemns')
})

test('wiring: the miner names the memo refusal (the count\'s only source)', () => {
  assert.ok(minerSrc.includes('memoRefusal: true'), 'the memo refusal carries its flag out of climbOut')
})

test('wiring: fleet19 imports the latch and counts EVERY memo-refused climb site', () => {
  assert.ok(fleetSrc.includes('routeRefusalLatch'), 'the import names the verdict')
  const counts = fleetSrc.match(/_routeRefusals = \(miner\.bot\._routeRefusals \|\| 0\) \+ 1/g) || []
  assert.ok(counts.length >= 7, `every climb site feeds the one truth (found ${counts.length}, need >= 7: hook, upfront, quarry, ensureSurface x2, final-bank x2)`)
})

test('wiring: the gate sits BEFORE the climb at all three ascent ladders', () => {
  // chestAscentHook: the latch check precedes the climbOut call
  const hookGate = fleetSrc.indexOf("chest ascent: route-latched after ${routeLatch.refused} refused climbs")
  const hookClimb = fleetSrc.indexOf('targetY: cy, force: true, maxMs: plan.climbMs')
  assert.ok(hookGate > -1 && hookClimb > hookGate, 'the doom hook refuses before funding the climb')
  // chestAscentUpfront: same order
  const upfrontGate = fleetSrc.indexOf("chest ascent (upfront): route-latched after ${routeLatch.refused} refused climbs")
  const upfrontClimb = fleetSrc.indexOf('targetY: yy, force: true, maxMs: plan.climbMs')
  assert.ok(upfrontGate > -1 && upfrontClimb > upfrontGate, 'the upfront leg refuses before funding the climb')
  // quarry ascent: same order
  const quarryGate = fleetSrc.indexOf("quarry ascent: route-latched after ${routeLatch.refused} refused climbs")
  const quarryClimb = fleetSrc.indexOf('targetY: yardGoal.y, force: true, maxMs: ascent.climbMs')
  assert.ok(quarryGate > -1 && quarryClimb > quarryGate, 'the quarry ascent refuses before funding the climb')
})

test('wiring: the bank-trip door refuses WITHOUT arming the trip', () => {
  const door = fleetSrc.indexOf("bank trip: route-latched after ${tripRouteLatch.refused} refused climbs - the route is condemned, the pocket mines on")
  assert.ok(door > -1, 'the door names the latch and the pocket truth')
  const branch = fleetSrc.indexOf('if (load && bankWanted && bankViable && !bankDefer.defer) {')
  assert.ok(door > branch, 'the door sits inside the trip branch')
  const lastBankAdvance = fleetSrc.indexOf('lastBankAt = Date.now()', door)
  const armLine = fleetSrc.indexOf('bank trip: ${tripPlanned ?', door)
  assert.ok(lastBankAdvance > -1 && lastBankAdvance < armLine, 'the cadence re-checks later (lastBankAt advances BEFORE the arm would)')
})

test('wiring: the final bank keeps its own door (the v0.316.0 doom latch untouched)', () => {
  assert.ok(fleetSrc.includes('finalBankDoomCycles++'), 'the doom latch still feeds at its own verdict point')
  assert.ok(!fleetSrc.includes('final climb: route-latched'), 'the final climb never route-latches - the doom latch owns that door')
  assert.ok(fleetSrc.includes("the final bank's climbs count, the doom latch owns the gate"), 'the counting comment names the ownership split')
})

test('wiring: the four refusal lines ride the existing filter keys (the tail doctrine)', () => {
  assert.ok(fleetSrc.includes('chest ascent: route-latched after'), 'the doom hook line rides the chest-ascent key')
  assert.ok(fleetSrc.includes('chest ascent (upfront): route-latched after'), 'the upfront line rides the same key')
  assert.ok(fleetSrc.includes('quarry ascent: route-latched after'), 'the quarry line rides its key')
  assert.ok(fleetSrc.includes('bank trip: route-latched after'), 'the door line rides the bank key')
})

test('wiring: the threshold and the shape live in surface.mjs beside the memo they judge', () => {
  assert.ok(surfaceSrc.includes('export const ROUTE_REFUSAL_LATCH_CYCLES = 3'), 'the constant is pinned in the lib')
  assert.ok(surfaceSrc.includes('export function routeRefusalLatch'), 'the verdict is a pure lib function')
  assert.ok(surfaceSrc.includes("return { latched: n >= c, refused: n }"), 'the verdict echoes the sanitized count')
})
