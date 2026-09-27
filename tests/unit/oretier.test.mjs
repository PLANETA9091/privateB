// (v0.251.0) THE ORE-TIER GUARD pins - the WOODEN-PICK CLASS cure.
// Run36332307784 measured the famine's new root: iron_ore 9 mined with NO
// drops (raw_iron 0 all run), end picks wooden=23/stone=7/iron=0 - below the
// vanilla minimum tier the block still breaks but yields nothing, so the
// wooden-pick class burns the map's known iron veins for nothing. The guard
// table names each ore's minimum pickaxe tier; the gate leaves tier-blocked
// cells whole (the vein stays on the map for the upgraded pick to come back).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ORE_TIER_TABLE, oreTierRequired, bestPickTier, oreTierGuardLine, bestPickaxe } from '../../src/lib/toolupgrade.mjs'

const botWith = items => ({ inventory: { items: () => items } })

test('oreTierRequired: the vanilla 26.2 table reads the measured bands', () => {
  assert.equal(ORE_TIER_TABLE.coal_ore, 0) // wooden rides coal
  assert.equal(ORE_TIER_TABLE.iron_ore, 1) // the measured class - stone tier
  assert.equal(ORE_TIER_TABLE.deepslate_iron_ore, 1) // the deepslate twin rides the same gate
  assert.equal(ORE_TIER_TABLE.copper_ore, 1)
  assert.equal(ORE_TIER_TABLE.diamond_ore, 2) // the iron band
  assert.equal(ORE_TIER_TABLE.deepslate_diamond_ore, 2)
})

test('oreTierRequired: unknown/junk names carry no gate (the box speaks first)', () => {
  assert.equal(oreTierRequired('stone'), null)
  assert.equal(oreTierRequired('mud_of_the_swamp'), null)
  assert.equal(oreTierRequired(null), null)
  assert.equal(oreTierRequired(undefined), null)
  assert.equal(oreTierRequired(42), null)
})

test('bestPickTier: the best stack wins, no pickaxe reads -1 (bare hands)', () => {
  assert.equal(bestPickTier(botWith([{ name: 'stone_pickaxe' }, { name: 'wooden_pickaxe' }])), 1)
  assert.equal(bestPickTier(botWith([{ name: 'iron_pickaxe' }])), 2)
  assert.equal(bestPickTier(botWith([{ name: 'wooden_pickaxe' }])), 0)
  assert.equal(bestPickTier(botWith([{ name: 'dirt' }, { name: 'cobblestone' }])), -1)
  assert.equal(bestPickTier(botWith([])), -1)
  assert.equal(bestPickTier({}), -1) // no inventory object at all
})

test('bestPickaxe: null on an empty pocket (the guard reads bare hands)', () => {
  assert.equal(bestPickaxe(botWith([])), null)
  assert.equal(bestPickaxe({}), null)
})

test('oreTierGuardLine: the wooden-pick iron-block shape (the measured class)', () => {
  const line = oreTierGuardLine({ tag: 'F7', blocked: { iron_ore: 3, copper_ore: 1 }, pickTier: 0, pickName: 'wooden_pickaxe' })
  assert.equal(line, 'F7 vein sweep: ore tier guard - 3 iron_ore, 1 copper_ore left for a stone pick (have wooden_pickaxe)')
})

test('oreTierGuardLine: the stone-pick diamond-block shape reads the iron band', () => {
  const line = oreTierGuardLine({ tag: 'F2', blocked: { diamond_ore: 2 }, pickTier: 1, pickName: 'stone_pickaxe' })
  assert.equal(line, 'F2 vein sweep: ore tier guard - 2 diamond_ore left for an iron pick (have stone_pickaxe)')
})

test('oreTierGuardLine: no pickaxe reads bare hands; a missing name falls to the tier word', () => {
  const line = oreTierGuardLine({ tag: 'F9', blocked: { coal_ore: 4 }, pickTier: -1, pickName: null })
  assert.equal(line, 'F9 vein sweep: ore tier guard - 4 coal_ore left for a wooden pick (have bare hands)')
  const nameless = oreTierGuardLine({ tag: 'F9', blocked: { iron_ore: 1 }, pickTier: 1, pickName: null })
  assert.equal(nameless, 'F9 vein sweep: ore tier guard - 1 iron_ore left for a stone pick (have a stone pick)')
})

test('oreTierGuardLine: junk reads refuse to null (nothing to say, no throw)', () => {
  assert.equal(oreTierGuardLine({}), null)
  assert.equal(oreTierGuardLine({ blocked: {} }), null)
  assert.equal(oreTierGuardLine({ blocked: { iron_ore: 0 } }), null) // zero counts stay silent
  assert.equal(oreTierGuardLine({ blocked: null }), null)
  assert.equal(oreTierGuardLine({ blocked: 'junk' }), null)
  assert.equal(oreTierGuardLine(null), null)
})
