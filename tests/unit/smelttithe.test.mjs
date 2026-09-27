// v0.258.0 THE SMELT TITHE - the count-bounded keep for the input keep's
// remaining bulk riders (sand/clay_ball). The measured faces (36346860061 +
// 36350568199): the v0.91.0 input keep is substring-based, so sand rode the
// pocket UNBOUNDED (end pockets 44-71u per bot, death drops 19/13u more) -
// the metals lead the smelt order and the sand leg rarely fires. The bound is
// the one-coal smelt batch (8 smelts per coal unit, no tool rung on sand) -
// the overage banks, the leg keeps its batch, the chest is the death-proof
// pool. Exact-name matching: the tithe never rides the substring matcher.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { SMELT_TITHE_BOUNDS, smeltTitheOverage, cobbleTitheOverage, fuelTitheOverage } from '../../src/lib/deposit.mjs'

test('smelt tithe: the bounds map is the one-coal smelt batch for both riders', () => {
  assert.equal(SMELT_TITHE_BOUNDS.sand, 8)
  assert.equal(SMELT_TITHE_BOUNDS.clay_ball, 8)
  assert.deepEqual(Object.keys(SMELT_TITHE_BOUNDS).sort(), ['clay_ball', 'sand'])
})

test('smelt tithe: overage form - the measured end pockets bank their overage', () => {
  assert.equal(smeltTitheOverage({ name: 'sand', pocketCount: 71 }), 63)
  assert.equal(smeltTitheOverage({ name: 'sand', pocketCount: 54 }), 46)
  assert.equal(smeltTitheOverage({ name: 'sand', pocketCount: 44 }), 36)
  assert.equal(smeltTitheOverage({ name: 'clay_ball', pocketCount: 20 }), 12)
})

test('smelt tithe: at or below the bound the keep stays absolute (0 overage)', () => {
  assert.equal(smeltTitheOverage({ name: 'sand', pocketCount: 8 }), 0)
  assert.equal(smeltTitheOverage({ name: 'sand', pocketCount: 7 }), 0)
  assert.equal(smeltTitheOverage({ name: 'sand', pocketCount: 1 }), 0)
  assert.equal(smeltTitheOverage({ name: 'clay_ball', pocketCount: 8 }), 0)
})

test('smelt tithe: exact-name matching - the substring family reads no tithe', () => {
  assert.equal(smeltTitheOverage({ name: 'sandstone', pocketCount: 200 }), 0)
  assert.equal(smeltTitheOverage({ name: 'red_sand', pocketCount: 200 }), 0)
  assert.equal(smeltTitheOverage({ name: 'red_sandstone', pocketCount: 200 }), 0)
  assert.equal(smeltTitheOverage({ name: 'clay', pocketCount: 200 }), 0)
  assert.equal(smeltTitheOverage({ name: 'bricks', pocketCount: 200 }), 0)
  assert.equal(smeltTitheOverage({ name: 'glass', pocketCount: 200 }), 0)
})

test('smelt tithe: unlisted input-keep names stay absolute byte for byte', () => {
  assert.equal(smeltTitheOverage({ name: 'netherrack', pocketCount: 200 }), 0)
  assert.equal(smeltTitheOverage({ name: 'chorus_fruit', pocketCount: 200 }), 0)
  assert.equal(smeltTitheOverage({ name: 'kelp', pocketCount: 200 }), 0)
  assert.equal(smeltTitheOverage({ name: 'raw_copper', pocketCount: 200 }), 0)
  assert.equal(smeltTitheOverage({ name: 'stone', pocketCount: 200 }), 0)
})

test('smelt tithe: junk family reads 0 (the legacy absolute-keep shape byte for byte)', () => {
  assert.equal(smeltTitheOverage({}), 0)
  assert.equal(smeltTitheOverage({ name: null }), 0)
  assert.equal(smeltTitheOverage({ name: 42 }), 0)
  assert.equal(smeltTitheOverage({ name: 'sand' }), 0)
  assert.equal(smeltTitheOverage({ name: 'sand', pocketCount: 0 }), 0)
  assert.equal(smeltTitheOverage({ name: 'sand', pocketCount: -5 }), 0)
  assert.equal(smeltTitheOverage(null), 0)
  assert.equal(smeltTitheOverage(undefined), 0)
  assert.equal(smeltTitheOverage(42), 0)
  assert.equal(smeltTitheOverage('sand'), 0)
})

test('smelt tithe: fractional pockets floor before the bound arithmetic', () => {
  assert.equal(smeltTitheOverage({ name: 'sand', pocketCount: 8.9 }), 0)
  assert.equal(smeltTitheOverage({ name: 'sand', pocketCount: 20.7 }), 12)
  assert.equal(smeltTitheOverage({ name: 'clay_ball', pocketCount: 9.5 }), 1)
})

test('smelt tithe: the fuel and cobble tithes stay byte for byte untouched', () => {
  assert.equal(fuelTitheOverage({ name: 'coal', pocketCount: 20 }), 14)
  assert.equal(fuelTitheOverage({ name: 'coal_ore', pocketCount: 20 }), 0)
  assert.equal(cobbleTitheOverage({ name: 'cobblestone', pocketCount: 113 }), 99)
  assert.equal(cobbleTitheOverage({ name: 'cobbled_deepslate', pocketCount: 113 }), 0)
})
