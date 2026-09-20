// Yard verification contract (v0.18.17): CI run 35521952724 proved the yard can
// silently half-build (only the last ~11 of 169 console commands executed -
// 0 chests, 0 machines in the world, banked=0 forever). The build is now
// verified client-side and re-sent until real. These tests pin the verdict
// math: a full build passes, a swallowed batch fails LOUD, and the minima sit
// exactly where a real build cannot miss and a lost batch cannot pass.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { YARD_EXPECTED, YARD_MINIMA, yardVerdict, tallyYardBlocks } from '../../src/lib/yardcheck.mjs'

const FULL = { ...YARD_EXPECTED }

test('yard expected counts match the buildYard layout (independently recomputed)', () => {
  // fuel: 2 singles + 1 three-wide fill row; warehouse: 5 rows x 9
  assert.equal(2 + 3, 5, 'fuel chest row')
  assert.equal(5 * 9, 45, 'warehouse rows')
  assert.equal(YARD_EXPECTED.chests, 5 + 45)
  assert.equal(YARD_EXPECTED.barrels, 9, 'output barrels')
  assert.equal(YARD_EXPECTED.furnaces, 8)
  assert.equal(YARD_EXPECTED.blastFurnaces, 4)
  assert.equal(YARD_EXPECTED.smokers, 4)
  assert.equal(YARD_MINIMA.chestsAndBarrels, 54)
  assert.equal(YARD_MINIMA.machines, 14)
})

test('verdict: a full build passes with margin', () => {
  const v = yardVerdict(FULL)
  assert.equal(v.ok, true)
  assert.match(v.detail, /chests=50/)
  assert.match(v.detail, /machines=16\/16/)
})

test('verdict: the measured CI failure (0 chests, 0 machines) fails LOUD', () => {
  const v = yardVerdict({ chests: 0, barrels: 0, furnaces: 0, blastFurnaces: 0, smokers: 0 })
  assert.equal(v.ok, false)
  assert.match(v.detail, /min 54/)
})

test('verdict: a partially swallowed batch (last commands only = lanterns, no chests) fails', () => {
  // exactly what run #130 got: zero containers, zero machines
  const v = yardVerdict(tallyYardBlocks([]))
  assert.equal(v.ok, false)
})

test('verdict: tolerates a few lost placements but not a swallowed transport', () => {
  // 4 chests + 1 barrel short, 1 machine short: still a working yard
  assert.equal(yardVerdict({ ...FULL, chests: 46, barrels: 8, furnaces: 7 }).ok, true)
  // one container under the minimum: rebuild
  assert.equal(yardVerdict({ ...FULL, chests: 45, barrels: 8 }).ok, false)
  assert.equal(yardVerdict({ ...FULL, furnaces: 5, blastFurnaces: 4, smokers: 4 }).ok, false, '13 machines < min 14')
})

test('verdict: null/undefined probes count as zero, never crash', () => {
  assert.equal(yardVerdict(null).ok, false)
  assert.equal(yardVerdict(undefined).ok, false)
  assert.equal(yardVerdict({}).ok, false)
})

test('tally: buckets the yard block names, ignores strays, handles null', () => {
  const t = tallyYardBlocks([
    'chest', 'chest', 'trapped_chest', 'barrel',
    'furnace', 'furnace', 'furnace', 'blast_furnace', 'smoker',
    'sea_lantern', 'smooth_stone', 'oak_sign'
  ])
  assert.deepEqual(t, { chests: 3, barrels: 1, furnaces: 3, blastFurnaces: 1, smokers: 1 })
  assert.deepEqual(tallyYardBlocks(null), { chests: 0, barrels: 0, furnaces: 0, blastFurnaces: 0, smokers: 0 })
  assert.deepEqual(tallyYardBlocks([]), { chests: 0, barrels: 0, furnaces: 0, blastFurnaces: 0, smokers: 0 })
})
