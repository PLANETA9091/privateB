//
// fueldiet.test.mjs - THE FUEL DIET'S OWN BILL (v0.666.0)
// The intent side's fuel economics split by the emitter's own window law.
// The docstring's own face rides verbatim (the hand trace against the
// real log); the honest zero, the junk battery and the one-truth pins
// hold the book.
//
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fuelDiet, coalEquivalent } from '../../src/lib/fueldiet.mjs'
import { SMELT_START_RE } from '../../src/lib/smeltledger.mjs'
import { METAL_INPUTS, fuelYieldOf } from '../../src/lib/smelting.mjs'

test('v0.666.0 the fuel diet book: the docstring own face splits the windows and prices the bill', () => {
  // face 37279622224's start set, condensed line for line (15 starts)
  const lines = [
    '[F6] smelting 7 x cobblestone in a furnace (fuel: 13 x coal)',
    '[F10] smelting 2 x oak_log in a furnace (fuel: 4 x stick)',
    '[F7] smelting 1 x oak_log in a furnace (fuel: 2 x stick)',
    '[F17] smelting 4 x oak_log in a furnace (fuel: 3 x oak_log)',
    '[F14] smelting 7 x raw_copper in a blast_furnace (fuel: 1 x coal)',
    '[F8] smelting 6 x raw_copper in a blast_furnace (fuel: 2 x coal)',
    '[F4] smelting 3 x oak_log in a furnace (fuel: 2 x oak_log)',
    '[F11] smelting 2 x sand in a furnace (fuel: 4 x stick)',
    '[F14] smelting 3 x raw_copper in a blast_furnace (fuel: 2 x oak_log)',
    '[F8] smelting 3 x raw_copper in a blast_furnace (fuel: 1 x coal)',
    '[F14] smelting 2 x raw_copper in a blast_furnace (fuel: 18 x stick)',
    '[F14] smelting 1 x raw_copper in a furnace (fuel: 14 x stick)',
    '[F17] smelting 1 x oak_log in a furnace (fuel: 1 x birch_log)',
    '[F14] smelting 1 x raw_copper in a furnace (fuel: 12 x stick)',
    '[F4] smelting 1 x oak_log in a furnace (fuel: 2 x stick)'
  ]
  const d = fuelDiet(lines)
  assert.ok(d && d.starts === 15, 'the book reads every start')
  // the metal window: 7 raw_copper batches, fuel 50u (stick 44 / coal 4 /
  // oak_log 2), capacity = 44*0.5 + 4*8 + 2*1.5 = 22 + 32 + 3 = 57
  assert.equal(d.metal.batches, 7)
  assert.equal(d.metal.items.raw_copper, 23)
  assert.equal(d.metal.fuel, 50)
  assert.equal(d.metal.fuelItems.stick, 44)
  assert.equal(d.metal.fuelItems.coal, 4)
  assert.equal(d.metal.fuelItems.oak_log, 2)
  assert.equal(Math.round(d.metal.capacity * 10) / 10, 57)
  assert.equal(coalEquivalent(d.metal.capacity), 8)
  // the junk window: 8 batches, fuel 31u (coal 13 - the cobblestone
  // batch's own touch / stick 12 / oak_log 5 / birch_log 1), capacity =
  // 13*8 + 12*0.5 + 5*1.5 + 1*1.5 = 104 + 6 + 7.5 + 1.5 = 119
  assert.equal(d.junk.batches, 8)
  assert.equal(d.junk.fuel, 31)
  assert.equal(d.junk.fuelItems.coal, 13)
  assert.equal(d.junk.fuelItems.stick, 12)
  assert.equal(d.junk.fuelItems.oak_log, 5)
  assert.equal(d.junk.fuelItems.birch_log, 1)
  assert.equal(Math.round(d.junk.capacity * 10) / 10, 119)
  // the mismatch grain: the metal sat in a plain furnace x2, both F14's
  assert.equal(d.metalMismatch.count, 2)
  assert.equal(d.metalMismatch.bots.F14, 2)
})

test('v0.666.0 the window law is the emitter own verdict - raw_copper is metal, the commons are junk', () => {
  assert.ok(METAL_INPUTS.has('raw_copper'), 'the one truth pins raw_copper metal')
  const lines = [
    '[F1] smelting 4 x raw_iron in a blast_furnace (fuel: 1 x coal)',
    '[F2] smelting 4 x sand in a furnace (fuel: 2 x stick)'
  ]
  const d = fuelDiet(lines)
  assert.equal(d.metal.batches, 1)
  assert.equal(d.junk.batches, 1)
})

test('v0.666.0 the honest zero: no starts read silence, the junk never enters', () => {
  const lines = [
    '[F3] smelt: 0 (nothing to smelt)',
    '[F4] smelted 2 (stone:2) rescued=0',
    '[F5] took 2 x stone (2/2)',
    '[F6] fuel clips the batch: 3 x coal completes 1 of 4 x sand'
  ]
  const d = fuelDiet(lines)
  assert.equal(d.starts, 0)
  assert.equal(d.metal.batches, 0)
  assert.equal(d.junk.batches, 0)
  assert.equal(d.metalMismatch.count, 0)
  assert.equal(fuelDiet([]).starts, 0)
  assert.equal(fuelDiet('not an array'), null)
  assert.equal(fuelDiet(null), null)
})

test('v0.666.0 the unknown fuel never invents capacity - the units still count', () => {
  const lines = [
    '[F8] smelting 4 x raw_copper in a blast_furnace (fuel: 2 x unobtainium)',
    '[F8] smelting 1 x raw_copper in a blast_furnace (fuel: 1 x coal)'
  ]
  const d = fuelDiet(lines)
  assert.equal(d.metal.fuel, 3)
  assert.equal(d.metal.fuelItems.unobtainium, 2)
  // the unknown burns 0 capacity; the coal carries 8
  assert.equal(Math.round(d.metal.capacity * 10) / 10, 8)
  assert.equal(coalEquivalent(d.metal.capacity), 1)
})

test('v0.666.0 the coal-equivalent arithmetic rides the vanilla table, never a made constant', () => {
  assert.equal(fuelYieldOf('coal'), 8, 'the one truth: coal 8/u')
  assert.equal(coalEquivalent(0), 0)
  assert.equal(coalEquivalent(-4), 0)
  assert.equal(coalEquivalent(Number.NaN), 0)
  assert.equal(coalEquivalent(Infinity), 0)
  assert.equal(coalEquivalent(1), 1)
  assert.equal(coalEquivalent(8), 1)
  assert.equal(coalEquivalent(9), 2, 'a fractional tail never finishes an item')
})

test('v0.666.0 the one-truth pins: the diet reads the emitter own start line and yield table', () => {
  const line = '[F9] smelting 2 x raw_copper in a blast_furnace (fuel: 16 x stick)'
  const m = line.match(SMELT_START_RE)
  assert.ok(m, 'the ledger own regex reads the start line whole')
  assert.equal(m[3], 'raw_copper')
  assert.equal(m[6], 'stick')
  assert.equal(fuelYieldOf('stick'), 0.5)
  const d = fuelDiet([line])
  assert.equal(d.metal.fuelItems.stick, 16)
  assert.equal(d.metal.capacity, 8)
  assert.equal(coalEquivalent(8), 1, 'the 16 sticks carried what 1 coal carries')
})
