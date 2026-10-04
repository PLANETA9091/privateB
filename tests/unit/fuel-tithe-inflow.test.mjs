import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fuelTitheInflowRow, CHEST_OPEN_DIG_MAX_DIST } from '../../src/lib/fuelbank.mjs'

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

// (v0.590.0) THE OPEN'S DIST LENS: the face 37169265512 chain - 'the nudge
// retry landed' then the open's 10s tax then the cover dig's 'not at the
// chest' - nothing measured the seat, so the grain could not tell the
// walk's landed lie from the chest's own refusal.

test('lens: no dist data reads the honest legacy form byte-identical (the face-37169265512 anchor)', () => {
  // the live face's own shape: attempted 4, delivered 0, dry 4, no lens rode
  const r = fuelTitheInflowRow({ attempted: 4, delivered: 0, units: 0, dry: 4 })
  assert.equal(r, 'fuel tithe inflow: attempted 4, delivered 0, dry 4 - the inflow ran dry: the skips named their lines (the commons\' source is the front)')
})

test('lens: far-only names the geometry (the walk\'s landed verdict lied)', () => {
  const r = fuelTitheInflowRow({ attempted: 4, delivered: 0, units: 0, dry: 4, far: 3 })
  assert.equal(r, 'fuel tithe inflow: attempted 4, delivered 0, dry 4 - the opens fired far 3 of 4 - the walk\'s landed verdict lied: the geometry is the front - the inflow ran dry: the skips named their lines (the commons\' source is the front)')
})

test('lens: near-only names the chest\'s own refusal (the storm\'s hand)', () => {
  const r = fuelTitheInflowRow({ attempted: 3, delivered: 0, units: 0, dry: 3, near: 2 })
  assert.equal(r, 'fuel tithe inflow: attempted 3, delivered 0, dry 3 - the opens fired near 2 of 3 - the chest refused the use: the storm\'s hand is the front - the inflow ran dry: the skips named their lines (the commons\' source is the front)')
})

test('lens: a split reads mixed honestly (no front is invented)', () => {
  const r = fuelTitheInflowRow({ attempted: 4, delivered: 0, units: 0, dry: 4, far: 1, near: 2 })
  assert.equal(r, 'fuel tithe inflow: attempted 4, delivered 0, dry 4 - the opens split far 1/near 2 of 4 - the reach reads mixed - the inflow ran dry: the skips named their lines (the commons\' source is the front)')
})

test('lens: junk dist counts floor to 0 and never invent the lens (the row never lies upward)', () => {
  // negative/NaN lens junk floors to 0 -> the honest legacy form (no lens)
  const rNeg = fuelTitheInflowRow({ attempted: 2, delivered: 0, units: 0, dry: 2, far: -1, near: NaN })
  assert.equal(rNeg, 'fuel tithe inflow: attempted 2, delivered 0, dry 2 - the inflow ran dry: the skips named their lines (the commons\' source is the front)')
  // fractional positives floor honestly (2.9 -> 2... no: 1.9 -> 1)
  const rFrac = fuelTitheInflowRow({ attempted: 2, delivered: 0, units: 0, dry: 2, far: 1.9 })
  assert.equal(rFrac, 'fuel tithe inflow: attempted 2, delivered 0, dry 2 - the opens fired far 1 of 2 - the walk\'s landed verdict lied: the geometry is the front - the inflow ran dry: the skips named their lines (the commons\' source is the front)')
})

test('lens: a delivery ignores the lens (a delivery is a delivery)', () => {
  const r = fuelTitheInflowRow({ attempted: 3, delivered: 2, units: 6, dry: 1, far: 1, near: 1 })
  assert.equal(r, 'fuel tithe inflow: attempted 3, delivered 2 (6u), dry 1 - the inflow feeds the commons (the tithe owns the refill)')
  assert.ok(!r.includes('fired'))
})

test('lens: the threshold rides the cover-dig\'s own constant (one vocabulary)', () => {
  // the lens's far/near split uses CHEST_OPEN_DIG_MAX_DIST (4) - the same
  // bound the cover dig's 'not at the chest' verdict reads; the testbed feed
  // classifies with it, the row only counts - the bound is imported there
  assert.equal(typeof CHEST_OPEN_DIG_MAX_DIST, 'number')
  assert.equal(CHEST_OPEN_DIG_MAX_DIST, 4)
})

test('lens: the wiring pins - the ledger carries far/near, both seats classify', () => {
  const fleetSrc = readFileSync(new URL('../../testbed/fleet19.mjs', import.meta.url), 'utf8')
  // the book grew the lens fields
  assert.match(fleetSrc, /const fuelTitheInflowLedger = \{ attempted: 0, delivered: 0, units: 0, dry: 0, far: 0, near: 0 \}/)
  // both seats classify the measured dist with the cover-dig's bound
  assert.match(fleetSrc, /if \(arrivalRes\.dist > CHEST_OPEN_DIG_MAX_DIST\) fuelTitheInflowLedger\.far\+\+/)
  assert.match(fleetSrc, /if \(anchorRes\.dist > CHEST_OPEN_DIG_MAX_DIST\) fuelTitheInflowLedger\.far\+\+/)
  // the seat's own exits carry the measured distance (the lens's source)
  const bankSrc = readFileSync(new URL('../../src/lib/fuelbank.mjs', import.meta.url), 'utf8')
  assert.match(bankSrc, /why: `open failed \(\$\{e\?\.message \|\| e\}\)`, dist: failDist \}/)
})
