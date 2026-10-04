import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fuelTitheInflowRow } from '../../src/lib/fuelbank.mjs'

// (v0.587.0) THE TITHE'S INFLOW GRAIN - the grain's twin on the inflow side.
// The face 37166593085 anchor: zero 'fuel anchor: delivered' lines rode the
// whole face while F7's real attempt failed both seats on 'open failed
// (timeout)' - the inflow ran dry and no row owned the read.

test('inflow: zero attempts stay lean (the overage never rode anywhere)', () => {
  assert.equal(fuelTitheInflowRow({ attempted: 0, delivered: 0, units: 0, dry: 0 }), null)
})

test('inflow: junk-safe - null, bare and negative floors read 0 (the row never lies upward)', () => {
  assert.equal(fuelTitheInflowRow(null), null)
  assert.equal(fuelTitheInflowRow(undefined), null)
  assert.equal(fuelTitheInflowRow({}), null)
  assert.equal(fuelTitheInflowRow({ attempted: -2, delivered: NaN, units: 'x', dry: Infinity }), null)
})

test('inflow: every attempt dry names the front (the face-37166593085 shape: F7 both seats)', () => {
  const r = fuelTitheInflowRow({ attempted: 2, delivered: 0, units: 0, dry: 2 })
  assert.equal(r, 'fuel tithe inflow: attempted 2, delivered 0, dry 2 - the inflow ran dry: the skips named their lines (the commons\' source is the front)')
})

test('inflow: a delivery says the inflow feeds the commons (byte-stable)', () => {
  const r = fuelTitheInflowRow({ attempted: 5, delivered: 2, units: 9, dry: 3 })
  assert.equal(r, 'fuel tithe inflow: attempted 5, delivered 2 (9u), dry 3 - the inflow feeds the commons (the tithe owns the refill)')
})

test('inflow: all attempts fed reads the same fed form with dry 0', () => {
  const r = fuelTitheInflowRow({ attempted: 3, delivered: 3, units: 12, dry: 0 })
  assert.equal(r, 'fuel tithe inflow: attempted 3, delivered 3 (12u), dry 0 - the inflow feeds the commons (the tithe owns the refill)')
})

test('inflow: fractional junk floors honestly (2.9 -> 2)', () => {
  const r = fuelTitheInflowRow({ attempted: 2.9, delivered: 1.5, units: 3.7, dry: 1.4 })
  assert.equal(r, 'fuel tithe inflow: attempted 2, delivered 1 (3u), dry 1 - the inflow feeds the commons (the tithe owns the refill)')
})

test('inflow: the lean law holds by the feed\'s construction (attempted = delivered + dry)', () => {
  // 'no overage' never counts - every counted attempt is a delivery or a dry
  for (const [a, d] of [[1, 1], [4, 2], [9, 0]]) {
    const r = fuelTitheInflowRow({ attempted: a, delivered: d, units: d * 3, dry: a - d })
    assert.ok(r.startsWith(`fuel tithe inflow: attempted ${a}, delivered ${d}`))
  }
})

test('inflow: the two books stay separate (the outflow grain untouched)', () => {
  // the commons' grain read the asks; this row reads the tithe - one function
  // each, no cross-pricing, the family's one-book-one-seat law
  const r = fuelTitheInflowRow({ attempted: 2, delivered: 0, units: 0, dry: 2 })
  assert.ok(r.includes('the commons\' source is the front'))
  assert.ok(!r.includes('fuel commons grain'))
})
