// THE DEEP-STRAND PRICER - tests. (v0.579.0)
// One vocabulary: the climb lines are read through climbout's OWN census
// (v0.420.0) - these pins never re-parse, they feed the lens's shapes.
import test from 'node:test'
import assert from 'node:assert/strict'
import { deepStrandPrice, deepStrandRow, DEEP_STRAND_MIN_CLIMBS, DEEP_STRAND_MIN_UNITS } from '../../src/lib/deepstrand.mjs'
import { DEEP_STRAND_MIN_CLIMBS as _familyCountShape } from '../../src/lib/deepstrand.mjs'

const climb = (bot, secs, levels = 25) => `${bot} climb out (bank): OK +${levels} levels (30 steps, 5 dug, ${secs}s)`

test('the live anchor: the fire-0439 face shape prices the strand', () => {
  const lines = [climb('F9', 100), climb('F12', 92), climb('F5', 130)]
  const p = deepStrandPrice(lines, { units: 527 })
  assert.ok(p, 'the strand speaks on the face shape')
  assert.equal(p.climbs, 3)
  assert.equal(p.taxSecs, 322)
  assert.equal(p.maxTaxSecs, 130)
  assert.equal(p.units, 527)
  assert.equal(p.pays, true)
})

test('the byte form names the tax, the stranded mass and the dearest climb', () => {
  const row = deepStrandRow([climb('F9', 100), climb('F12', 92), climb('F5', 130)], { units: 527 })
  assert.equal(row, 'deep strand: 3 climbs paid 322s of climb tax, 527u rode the write-off (the dearest climb 130s) - the deep anchor\'s seat is priced')
})

test('the count grain: exactly the floor trips (>=)', () => {
  const lines = [climb('F9', 100), climb('F12', 92), climb('F5', 130)]
  assert.ok(deepStrandPrice(lines, { units: DEEP_STRAND_MIN_UNITS }), 'exactly 3 climbs and 64u pays')
  assert.equal(deepStrandPrice(lines.slice(0, 2), { units: 500 }), null, 'two climbs are an accident, not a tax')
})

test('the units grain: the write-off family\'s own floor (>=)', () => {
  const lines = [climb('F9', 100), climb('F12', 92), climb('F5', 130)]
  assert.equal(deepStrandPrice(lines, { units: DEEP_STRAND_MIN_UNITS - 1 }), null, '63u stays quiet')
  assert.ok(deepStrandPrice(lines, { units: DEEP_STRAND_MIN_UNITS }), '64u speaks')
})

test('the leanness law: a quiet strand returns null - the caller prints nothing', () => {
  assert.equal(deepStrandRow([climb('F9', 100)], { units: 527 }), null)
  assert.equal(deepStrandRow([], { units: 500 }), null)
})

test('the undefineds shape stays out of the pricing (the lens keeps the unknown price out)', () => {
  const lines = [
    climb('F9', 100), climb('F12', 92),
    'F5 climb out (bank): OK +18 levels (22 steps, 3 dug, undefineds)',
  ]
  assert.equal(deepStrandPrice(lines, { units: 500 }), null, 'two PRICED climbs - the third rode unknown')
})

test('the junk battery: torn inputs read the honest quiet', () => {
  assert.equal(deepStrandPrice(null, { units: 500 }), null)
  assert.equal(deepStrandPrice('not an array', { units: 500 }), null)
  assert.ok(deepStrandPrice([null, 42, climb('F9', 100), climb('F12', 92), climb('F5', 130)], { units: 500 }), 'junk entries are skipped, real lines still count')
  assert.equal(deepStrandPrice([climb('F9', 100), climb('F12', 92), climb('F5', 130)], null), null)
  assert.equal(deepStrandPrice([climb('F9', 100), climb('F12', 92), climb('F5', 130)], undefined), null)
  assert.equal(deepStrandPrice([climb('F9', 100), climb('F12', 92), climb('F5', 130)], { units: -5 }), null)
  assert.equal(deepStrandPrice([climb('F9', 100), climb('F12', 92), climb('F5', 130)], { units: Number.NaN }), null)
  assert.equal(deepStrandPrice([climb('F9', 100), climb('F12', 92), climb('F5', 130)], { units: Number.POSITIVE_INFINITY }), null)
  assert.equal(deepStrandPrice([climb('F9', 100), climb('F12', 92), climb('F5', 130)], 'torn'), null)
  assert.equal(deepStrandPrice([climb('F9', 100), climb('F12', 92), climb('F5', 130)], { units: 1.9 }), null, 'a fraction of a unit is nobody\'s write-off')
})

test('flooring: a fractional write-off lands on its floor when the grain holds', () => {
  const lines = [climb('F9', 100), climb('F12', 92), climb('F5', 130)]
  const p = deepStrandPrice(lines, { units: 64.7 })
  assert.ok(p, 'the grain holds')
  assert.equal(p.units, 64, 'the units land floored')
})

test('the constants route: the family grains are the exported laws', () => {
  assert.equal(DEEP_STRAND_MIN_CLIMBS, 3, 'the owner family\'s count floor shape')
  assert.equal(DEEP_STRAND_MIN_UNITS, 64, 'the write-off family\'s units grain')
  assert.equal(_familyCountShape, DEEP_STRAND_MIN_CLIMBS, 'one import, one law')
})

test('the failed climbs never price the tax (only the paid seconds speak)', () => {
  const lines = [
    climb('F9', 100), climb('F12', 92), climb('F5', 130),
    'F17 climb out (bank): failed - stalled (wait 20s)',
    'F11 climb out (bank): failed - the walk ladder cannot climb (wait 15s)',
  ]
  const p = deepStrandPrice(lines, { units: 500 })
  assert.ok(p)
  assert.equal(p.climbs, 3, 'the failures never enter the priced count')
  assert.equal(p.taxSecs, 322, 'the failures never enter the paid sum')
})
