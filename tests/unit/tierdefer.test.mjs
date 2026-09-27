// (v0.252.0) THE TIER-DEFER STEER pins - the guard's steer-side twin.
// The v0.251.0 guard stops a wooden pick from BREAKING a stone-tier ore, but
// the steer election still walks the wooden bot to the vein first (iron's
// deficit leads every election) - the guard refuses, the walk burns, the pass
// repeats. tierDeferOrder sends ores the pick cannot HARVEST to the TAIL of
// the election (stable, not excluded): coal leads for wooden picks, the tail
// keeps the option, the upgrade rung restores the lead.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { tierDeferOrder } from '../../src/fleet/materialplan.mjs'
import { ORE_TIER_TABLE } from '../../src/lib/toolupgrade.mjs'

test('tierDeferOrder: the wooden-pick shape - iron/copper defer, coal leads', () => {
  const r = tierDeferOrder(['iron_ore', 'coal_ore', 'copper_ore'], 0, ORE_TIER_TABLE)
  assert.deepEqual(r.deferred, ['iron_ore', 'copper_ore'])
  assert.deepEqual(r.order, ['coal_ore', 'iron_ore', 'copper_ore'])
})

test('tierDeferOrder: the stone pick harvests the iron band - no defer', () => {
  const r = tierDeferOrder(['iron_ore', 'coal_ore', 'copper_ore'], 1, ORE_TIER_TABLE)
  assert.deepEqual(r.deferred, [])
  assert.deepEqual(r.order, ['iron_ore', 'coal_ore', 'copper_ore'])
})

test('tierDeferOrder: the stone pick still defers the iron-tier band', () => {
  const r = tierDeferOrder(['coal_ore', 'diamond_ore'], 1, ORE_TIER_TABLE)
  assert.deepEqual(r.deferred, ['diamond_ore'])
  assert.deepEqual(r.order, ['coal_ore', 'diamond_ore'])
})

test('tierDeferOrder: bare hands defer everything the table owns', () => {
  const r = tierDeferOrder(['coal_ore', 'iron_ore'], -1, ORE_TIER_TABLE)
  assert.deepEqual(r.deferred, ['coal_ore', 'iron_ore'])
  assert.deepEqual(r.order, ['coal_ore', 'iron_ore']) // stable: the tail keeps the input order
})

test('tierDeferOrder: unknown names carry no gate (the box speaks first)', () => {
  const r = tierDeferOrder(['stone', 'mud_of_the_swamp'], -1, ORE_TIER_TABLE)
  assert.deepEqual(r.deferred, [])
  assert.deepEqual(r.order, ['stone', 'mud_of_the_swamp'])
})

test('tierDeferOrder: stable order inside both parts (the deficit order is not scrambled)', () => {
  const r = tierDeferOrder(['copper_ore', 'coal_ore', 'iron_ore', 'lapis_ore'], 0, ORE_TIER_TABLE)
  assert.deepEqual(r.order, ['coal_ore', 'copper_ore', 'iron_ore', 'lapis_ore'])
  assert.deepEqual(r.deferred, ['copper_ore', 'iron_ore', 'lapis_ore'])
})

test('tierDeferOrder: junk reads refuse safely (no throw, honest empties)', () => {
  assert.deepEqual(tierDeferOrder(null, 1, ORE_TIER_TABLE), { order: [], deferred: [] })
  assert.deepEqual(tierDeferOrder(undefined, 0, ORE_TIER_TABLE), { order: [], deferred: [] })
  assert.deepEqual(tierDeferOrder(['iron_ore'], 1, null), { order: ['iron_ore'], deferred: [] }) // no gate = no defer
  assert.deepEqual(tierDeferOrder(['iron_ore'], null, ORE_TIER_TABLE).deferred, ['iron_ore']) // junk tier reads bare hands
  assert.deepEqual(tierDeferOrder('junk', 1, ORE_TIER_TABLE), { order: [], deferred: [] })
})
