// (v0.363.0) THE FLOODED-ALCOVE SITE PICKER - the ring shapes and the widening
// trigger for placeMachine's candidate pool (tests/integration/smelting.test.mjs
// imports the same exports this file pins). All pure arithmetic on offsets and
// integers - every assertion is exact, no mocks, no timing.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { RING1_OFFSETS, RING2_OFFSETS, floodedAlcove } from '../../src/lib/placement-rings.mjs'

test('RING1_OFFSETS is the historic literal, byte-identical order (the sync law)', () => {
  // placeMachine's original inline literal: cardinals first, diagonals after -
  // the order decides which cell is tried first, so the import must render the
  // scan exactly as the pre-0.363.0 code did
  assert.deepEqual(RING1_OFFSETS, [
    [1, 0], [-1, 0], [0, 1], [0, -1],
    [1, 1], [-1, -1], [1, -1], [-1, 1]
  ])
})

test('RING2_OFFSETS holds 16 unique cells at Chebyshev distance exactly 2', () => {
  assert.equal(RING2_OFFSETS.length, 16)
  const seen = new Set()
  for (const [dx, dz] of RING2_OFFSETS) {
    assert.equal(Math.max(Math.abs(dx), Math.abs(dz)), 2, `offset [${dx},${dz}] is not on ring 2`)
    const key = `${dx},${dz}`
    assert.ok(!seen.has(key), `duplicate offset [${dx},${dz}]`)
    seen.add(key)
  }
  // no overlap with ring 1 (the widened scan must never re-burn a scanned cell)
  for (const [dx, dz] of RING1_OFFSETS) {
    assert.ok(!seen.has(`${dx},${dz}`), `ring-2 overlaps ring 1 at [${dx},${dz}]`)
  }
  // and never the feet cell itself
  assert.ok(!seen.has('0,0'), 'ring 2 contains the feet cell')
})

test('RING2_OFFSETS walks outward - nearest cells first (the euclidean order law)', () => {
  const norm = ([dx, dz]) => dx * dx + dz * dz
  for (let i = 1; i < RING2_OFFSETS.length; i++) {
    const prev = norm(RING2_OFFSETS[i - 1])
    const cur = norm(RING2_OFFSETS[i])
    assert.ok(prev <= cur, `offset ${i - 1} [${RING2_OFFSETS[i - 1]}] is farther (${prev}) than offset ${i} [${RING2_OFFSETS[i]}] (${cur})`)
  }
  // the shape mirrors ring 1: the 4 cardinal-axis cells lead, the 4 corners close
  assert.deepEqual(RING2_OFFSETS.slice(0, 4), [[2, 0], [-2, 0], [0, 2], [0, -2]])
  assert.deepEqual(RING2_OFFSETS.slice(-4), [[2, 2], [-2, -2], [2, -2], [-2, 2]])
})

test('floodedAlcove fires only on the zero-attempt signature (rejected === 0)', () => {
  // the all-skip signature: nothing tried -> widening is the only move left
  assert.equal(floodedAlcove(0), true)
  // any rejected attempt = the ring DID offer a cell -> the carve ladder's class
  assert.equal(floodedAlcove(1), false)
  assert.equal(floodedAlcove(3), false)
  assert.equal(floodedAlcove(8), false)
  assert.equal(floodedAlcove(-1), false, 'a negative counter never widens')
})

test('floodedAlcove junk battery - a broken counter never invents a widening (the body-guard law)', () => {
  const junk = [NaN, null, undefined, '0', '1', 0.5, -0.5, 1.0, Infinity, -Infinity, false, true, {}, [], [0]]
  for (const j of junk) {
    assert.equal(floodedAlcove(j), false, `junk ${String(j)} (${typeof j}) must not widen the scan`)
  }
})

test('the widening composition: an all-wet ring 1 widens, a refused attempt does not', () => {
  // CI 36752156115's anatomy, replayed as counters: 8 cells, all named-and-skipped
  // (4 fluid dry-cell skips + 4 box/floor skips) -> rejected 0 -> the picker fires
  const allWetRing1 = { skipped: 8, rejected: 0 }
  if (floodedAlcove(allWetRing1.rejected)) {
    assert.equal(RING2_OFFSETS.length, 16, 'the widened pool must add the 16 ring-2 cells')
    assert.equal(RING1_OFFSETS.length + RING2_OFFSETS.length, 24, 'the widened scan covers 24 cells')
  } else {
    assert.fail('the all-skip signature must widen')
  }
  // the gravity-refill class (CI 36174497274): the cell was ATTEMPTED and the
  // place was refused -> rejected 1 -> no widening, the carve ladder owns it
  assert.equal(floodedAlcove(1), false)
})
