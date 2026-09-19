// Tests for the sapling replanting policy in src/lib/sapling.mjs.
// The v0.8.4 600s Big Fleet died a slow death: bots that died mid-run re-bootstrapped
// into an EATEN forest (25 recovery attempts, 3 OK - ~85s burned per failed attempt),
// while every bot carried saplings from broken canopies it never planted. The planting
// itself lives in miner.mjs chopReachable (stump cell, in reach, right after the chop);
// this file pins WHAT may be planted WHERE.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SAPLING_FOR_LOG, SOILS, saplingForLog, isPlantableSapling, plantableCell, pickSapling } from '../../src/lib/sapling.mjs'

test('saplingForLog: common overworld logs map to their own sapling', () => {
  assert.equal(saplingForLog('oak_log'), 'oak_sapling')
  assert.equal(saplingForLog('birch_log'), 'birch_sapling')
  assert.equal(saplingForLog('spruce_log'), 'spruce_sapling')
  assert.equal(saplingForLog('jungle_log'), 'jungle_sapling')
  assert.equal(saplingForLog('acacia_log'), 'acacia_sapling')
  assert.equal(saplingForLog('cherry_log'), 'cherry_sapling')
  assert.equal(saplingForLog('pale_oak_log'), 'pale_oak_sapling')
})

test('saplingForLog: logs that must NEVER be planted solo map to null', () => {
  // dark oak grows only in a 2x2 plantation - a solo placement is a dead item
  assert.equal(saplingForLog('dark_oak_log'), null)
  // mangrove regrows from a propagule, bamboo from shoots, nether from fungi
  assert.equal(saplingForLog('mangrove_log'), null)
  assert.equal(saplingForLog('bamboo_block'), null)
  assert.equal(saplingForLog('crimson_stem'), null)
  assert.equal(saplingForLog('warped_stem'), null)
})

test('saplingForLog: unknown input maps to null (no crash on 26.2 data drift)', () => {
  assert.equal(saplingForLog('palm_log'), null)
  assert.equal(saplingForLog(''), null)
  assert.equal(saplingForLog(undefined), null)
  // proto-pollution safety: inherited names must not resolve
  assert.equal(saplingForLog('toString'), null)
  assert.equal(saplingForLog('constructor'), null)
})

test('isPlantableSapling: only real, singly-growable saplings pass', () => {
  assert.equal(isPlantableSapling('oak_sapling'), true)
  assert.equal(isPlantableSapling('pale_oak_sapling'), true)
  assert.equal(isPlantableSapling('dark_oak_sapling'), false, '2x2-only, never solo')
  assert.equal(isPlantableSapling('bamboo_sapling'), false, 'shoot mechanics')
  assert.equal(isPlantableSapling('oak_log'), false)
  assert.equal(isPlantableSapling('mangrove_propagule'), false)
  assert.equal(isPlantableSapling(undefined), false)
  assert.equal(isPlantableSapling(null), false)
})

const cell = (name, boundingBox = 'empty') => ({ name, boundingBox })
const floor = (name) => ({ name, boundingBox: 'block' })

test('plantableCell: empty cell over dirt-family soil is plantable', () => {
  for (const soil of ['dirt', 'grass_block', 'podzol', 'coarse_dirt', 'rooted_dirt', 'moss_block', 'mud']) {
    assert.equal(plantableCell(cell('air'), floor(soil)).ok, true, soil)
  }
  assert.ok(SOILS.has('grass_block'))
})

test('plantableCell: wrong soil is rejected with the reason named', () => {
  assert.equal(plantableCell(cell('air'), floor('stone')).ok, false)
  assert.equal(plantableCell(cell('air'), floor('stone')).reason, 'soil stone')
  assert.equal(plantableCell(cell('air'), floor('sand')).ok, false, 'beach stumps are not farm soil')
})

test('plantableCell: water/lava floor is rejected (shoreline stumps stay unplanted)', () => {
  assert.equal(plantableCell(cell('air'), { name: 'water', boundingBox: 'fluid' }).ok, false)
  assert.equal(plantableCell(cell('air'), { name: 'lava', boundingBox: 'fluid' }).ok, false)
})

test('plantableCell: occupied cell is rejected (stump already regrown / wall / trunk)', () => {
  assert.equal(plantableCell(cell('oak_log', 'block'), floor('dirt')).ok, false)
  assert.equal(plantableCell(cell('oak_log', 'block'), floor('dirt')).reason, 'cell oak_log')
  assert.equal(plantableCell(cell('crafting_table', 'block'), floor('dirt')).ok, false)
})

test('plantableCell: cell standing IN water is rejected even over a solid floor', () => {
  assert.equal(plantableCell(cell('water', 'fluid'), floor('dirt')).ok, false)
})

test('plantableCell: null blocks (unloaded chunks) are rejected without crashing', () => {
  assert.equal(plantableCell(null, floor('dirt')).ok, false)
  assert.equal(plantableCell(cell('air'), null).ok, false)
  assert.equal(plantableCell(null, null).ok, false)
  assert.equal(plantableCell(null, null).reason, 'unloaded')
})

test('pickSapling: prefers the sapling matching the log just chopped', () => {
  const items = [{ name: 'birch_sapling', count: 2 }, { name: 'oak_sapling', count: 1 }]
  assert.equal(pickSapling(items, 'oak_log')?.name, 'oak_sapling')
  assert.equal(pickSapling(items, 'birch_log')?.name, 'birch_sapling')
  // a chopped dark oak has no solo sapling: fall back to whatever IS plantable
  assert.equal(pickSapling(items, 'dark_oak_log')?.name, 'birch_sapling')
  assert.equal(pickSapling(items, null)?.name, 'birch_sapling')
})

test('pickSapling: skips non-plantable items and returns null on nothing held', () => {
  assert.equal(pickSapling([{ name: 'dark_oak_sapling', count: 4 }, { name: 'bamboo_sapling', count: 1 }]), null)
  assert.equal(pickSapling([{ name: 'oak_log', count: 7 }]), null)
  assert.equal(pickSapling([]), null)
  assert.equal(pickSapling(null), null)
  assert.equal(pickSapling(undefined), undefined ?? null)
})

test('pickSapling: every mapped sapling is itself plantable (map self-consistency)', () => {
  for (const sap of Object.values(SAPLING_FOR_LOG)) {
    if (sap != null) assert.equal(isPlantableSapling(sap), true, sap)
  }
})
