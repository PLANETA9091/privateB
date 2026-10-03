// (v0.363.0) THE FLOODED-ALCOVE SITE PICKER - the ring shapes and the widening
// trigger for placeMachine's candidate pool (tests/integration/smelting.test.mjs
// imports the same exports this file pins). All pure arithmetic on offsets and
// integers - every assertion is exact, no mocks, no timing.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { RING1_OFFSETS, RING2_OFFSETS, floodedAlcove, carvedCellIsDry, carvedCellFlooded, FLUID_NAME_RE } from '../../src/lib/placement-rings.mjs'

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

test('carvedCellIsDry: the flooded-carve read (CI 36854765641) - water reads empty like air, the NAME splits them', () => {
  // the carve classes: air in its three vanilla flavors certifies the carve
  assert.equal(carvedCellIsDry({ boundingBox: 'empty', name: 'air' }), true)
  assert.equal(carvedCellIsDry({ boundingBox: 'empty', name: 'cave_air' }), true)
  assert.equal(carvedCellIsDry({ boundingBox: 'empty', name: 'void_air' }), true)
  // THE FLOOD CLASS (the law's own reason): the same empty box, a fluid name -
  // the carve opened the pond's wall, the box-only verify read the flood as a
  // carved alcove, the bot drowned in it and the rescue's y-drift carried every
  // later scan away (CI 36854765641). Each refusal classifier shape rides:
  assert.equal(carvedCellIsDry({ boundingBox: 'empty', name: 'water' }), false)
  assert.equal(carvedCellIsDry({ boundingBox: 'empty', name: 'flowing_water' }), false)
  assert.equal(carvedCellIsDry({ boundingBox: 'empty', name: 'lava' }), false)
  assert.equal(carvedCellIsDry({ boundingBox: 'empty', name: 'kelp' }), false)
  assert.equal(carvedCellIsDry({ boundingBox: 'empty', name: 'seagrass' }), false)
  assert.equal(carvedCellIsDry({ boundingBox: 'empty', name: 'tall_seagrass' }), false)
  assert.equal(carvedCellIsDry({ boundingBox: 'empty', name: 'bubble_column' }), false)
  // the gravity refill (CI 36174497274's class): solid again - not a carve,
  // the ladder re-digs it
  assert.equal(carvedCellIsDry({ boundingBox: 'block', name: 'gravel' }), false)
  assert.equal(carvedCellIsDry({ boundingBox: 'block', name: 'sand' }), false)
  assert.equal(carvedCellIsDry({ boundingBox: 'block', name: 'air' }), false, 'a solid box is solid whatever the name says')
  // the floor check stays the caller's (carveAlcove refuses floor-gap walls
  // before the dig) - the verdict certifies the CELL only
})

test('carvedCellIsDry junk battery - a broken read never certifies a carve (the body-guard law)', () => {
  for (const j of [null, undefined, NaN, 'air', 42, {}, [], ['air'], { boundingBox: 'empty' }, { name: 'air' }, { boundingBox: 'empty', name: '' }, { boundingBox: 'empty', name: 7 }, { boundingBox: 'block' }, { boundingBox: null, name: 'air' }]) {
    assert.equal(carvedCellIsDry(j), false, `junk ${JSON.stringify(j) ?? String(j)} must not read as carved`)
  }
})

// ---------------------------------------------------------------------------
// (v0.573.0) THE LATE-FLOOD READ - the carved-dry cell turned fluid after the
// carve's own 3-tick verify. The measured face: CI 37149135060 carved the
// alcove DRY at 19:59:49.3 and the scan read water at 19:59:50.9 - 1.6s
// later, after carveAlcove had already spoken - the caller burned all three
// carve attempts on the same wet wall.
// ---------------------------------------------------------------------------
test('carvedCellFlooded: THE LIVE ANCHOR - the 1.6s flood reads as flooded', () => {
  // the same cell that verified dry 3 ticks earlier read water at the scan
  assert.equal(carvedCellFlooded({ name: 'water' }), true)
  // the full wet column rides the shared list
  assert.equal(carvedCellFlooded({ name: 'flowing_water' }), true)
  assert.equal(carvedCellFlooded({ name: 'lava' }), true)
  assert.equal(carvedCellFlooded({ name: 'kelp' }), true)
  assert.equal(carvedCellFlooded({ name: 'seagrass' }), true)
  assert.equal(carvedCellFlooded({ name: 'bubble_column' }), true)
})

test('carvedCellFlooded: the non-flood classes stay the caller\'s own branches', () => {
  // air: the carve held - no handoff (the pre-0.573.0 fall-through)
  assert.equal(carvedCellFlooded({ name: 'air' }), false)
  // the gravity refill (CI 36174497274's class) stays the ladder's own class
  assert.equal(carvedCellFlooded({ name: 'gravel' }), false)
  assert.equal(carvedCellFlooded({ name: 'stone' }), false)
  assert.equal(carvedCellFlooded({ name: 'crafting_table' }), false)
  // the name is the law: a solid-boxed water read still names the wet column
  assert.equal(carvedCellFlooded({ boundingBox: 'block', name: 'water' }), true)
})

test('carvedCellFlooded junk battery - a broken read never fires the handoff (the body-guard law)', () => {
  for (const j of [null, undefined, NaN, 'water', 42, {}, [], ['water'], { name: '' }, { name: 7 }, { boundingBox: 'empty' }]) {
    assert.equal(carvedCellFlooded(j), false, `junk ${JSON.stringify(j) ?? String(j)} must not read as flooded`)
  }
})

test('ONE WET COLUMN, ONE LIST: the two laws share FLUID_NAME_RE and can never split', () => {
  // the dry-carve law and the late-flood read agree on every wet name
  for (const name of ['water', 'flowing_water', 'lava', 'kelp', 'seagrass', 'bubble_column']) {
    assert.equal(carvedCellIsDry({ boundingBox: 'empty', name }), false, `${name} must not read dry`)
    assert.equal(carvedCellFlooded({ name }), true, `${name} must read flooded`)
  }
  // air: dry AND not flooded - the two laws' clean split
  assert.equal(carvedCellIsDry({ boundingBox: 'empty', name: 'air' }), true)
  assert.equal(carvedCellFlooded({ name: 'air' }), false)
  // the export IS the regex both bodies test - the drift is impossible by construction
  for (const name of ['water', 'lava', 'kelp', 'seagrass', 'bubble']) {
    assert.ok(FLUID_NAME_RE.test(name), `${name} rides the shared list`)
  }
})

test('carvedCellFlooded: THE WIRING PIN - the handoff rides both carve ladders', () => {
  const src = readFileSync(new URL('../../tests/integration/smelting.test.mjs', import.meta.url), 'utf8')
  assert.ok(src.includes('carvedCellFlooded'), 'the integration test imports the late-flood read')
  // both ladders name the late flood and take the SAME relocate handoff
  const firstIdx = src.indexOf('the carved cell flooded late')
  const secondIdx = src.indexOf('the carved cell flooded late', firstIdx + 1)
  assert.ok(firstIdx > -1, 'the table flow names the late flood')
  assert.ok(secondIdx > firstIdx, 'the furnace flow names it too (the mirror law)')
  assert.equal(src.match(/carvedCellFlooded\(bot\.blockAt\(carve\.cell\)\)/g)?.length, 2, 'both handoffs read THE carved cell')
})
