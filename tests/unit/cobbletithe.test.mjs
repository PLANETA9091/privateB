// v0.254.0 THE COBBLE TITHE - the count-bounded keep for the smelt leg's
// cobblestone input. The measured face (36335496659): the smelt input keep
// held cobblestone UNBOUNDED while the smelt leg converted ~8 units per run
// and the killing band's deaths dropped 113u of cobblestone into the void.
// The tithe bound prices BOTH consumers in: the upgrade rung's 6 + the
// one-coal smelt batch's 8 = 14 - the overage banks, the consumers keep.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { COBBLE_TITHE_BOUND, cobbleTitheOverage, fuelTitheOverage } from '../../src/lib/deposit.mjs'

test('cobble tithe: the bound is rung 6 + one-coal smelt batch 8 = 14', () => {
  assert.equal(COBBLE_TITHE_BOUND, 14)
})

test('cobble tithe: overage form - pocket 200 banks 186, pocket keeps 14', () => {
  assert.equal(cobbleTitheOverage({ name: 'cobblestone', pocketCount: 200 }), 186)
  assert.equal(cobbleTitheOverage({ name: 'cobblestone', pocketCount: 113 }), 99)
  assert.equal(cobbleTitheOverage({ name: 'cobblestone', pocketCount: 64 }), 50)
})

test('cobble tithe: at or below the bound the keep stays absolute (0 overage)', () => {
  assert.equal(cobbleTitheOverage({ name: 'cobblestone', pocketCount: 14 }), 0)
  assert.equal(cobbleTitheOverage({ name: 'cobblestone', pocketCount: 8 }), 0)
  assert.equal(cobbleTitheOverage({ name: 'cobblestone', pocketCount: 1 }), 0)
})

test('cobble tithe: exact-name matching - the near-names read no tithe', () => {
  assert.equal(cobbleTitheOverage({ name: 'cobbled_deepslate', pocketCount: 200 }), 0)
  assert.equal(cobbleTitheOverage({ name: 'stone', pocketCount: 200 }), 0)
  assert.equal(cobbleTitheOverage({ name: 'cobblestone_wall', pocketCount: 200 }), 0)
  assert.equal(cobbleTitheOverage({ name: 'andesite', pocketCount: 200 }), 0)
})

test('cobble tithe: junk family reads 0 (the legacy absolute-keep shape byte for byte)', () => {
  assert.equal(cobbleTitheOverage({}), 0)
  assert.equal(cobbleTitheOverage({ name: null }), 0)
  assert.equal(cobbleTitheOverage({ name: 42 }), 0)
  assert.equal(cobbleTitheOverage({ name: 'cobblestone' }), 0)
  assert.equal(cobbleTitheOverage({ name: 'cobblestone', pocketCount: 0 }), 0)
  assert.equal(cobbleTitheOverage({ name: 'cobblestone', pocketCount: -5 }), 0)
  assert.equal(cobbleTitheOverage({ name: 'cobblestone', pocketCount: 'junk' }), 0)
  assert.equal(cobbleTitheOverage({ name: 'cobblestone', pocketCount: Number.NaN }), 0)
  assert.equal(cobbleTitheOverage(null), 0)
})

test('cobble tithe: fractional pockets floor (the tithe moves whole units)', () => {
  assert.equal(cobbleTitheOverage({ name: 'cobblestone', pocketCount: 14.9 }), 0)
  assert.equal(cobbleTitheOverage({ name: 'cobblestone', pocketCount: 20.7 }), 6)
})

test('cobble tithe: the fuel tithe shape is untouched byte for byte', () => {
  assert.equal(fuelTitheOverage({ name: 'coal', pocketCount: 38 }), 32)
  assert.equal(fuelTitheOverage({ name: 'charcoal', pocketCount: 9 }), 3)
  assert.equal(fuelTitheOverage({ name: 'coal', pocketCount: 6 }), 0)
  assert.equal(fuelTitheOverage({ name: 'cobblestone', pocketCount: 200 }), 0)
})
