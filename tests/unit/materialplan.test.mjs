// Tests for src/fleet/materialplan.mjs - the plan -> map -> trip routing policy.
// The v0.6.9 Big Fleet collected ZERO sand while the plan needed 157,926 and the
// shared map held 194 recorded sand positions: nothing connected the map to the
// diggers. mapTripTargets is that missing link; these tests pin its policy.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DROP_OF, MINABLE_OF, mapTripTargets, oreSteerOrder } from '../../src/fleet/materialplan.mjs'

const progressFrom = entries => Object.fromEntries(entries.map(([res, required, have]) => [res, { required, have, item: DROP_OF[res] ?? res }]))

test('mapTripTargets: most-deficit resource first (sand 157k beats gravel 149k beats coal 7.6k)', () => {
  const progress = progressFrom([
    ['sand', 157926, 0],
    ['gravel', 149380, 0],
    ['coal', 7668, 0]
  ])
  const mapCounts = { sand: 194, gravel: 40, coal_ore: 63 }
  assert.deepEqual(
    mapTripTargets({ progress, mapCounts }),
    ['sand', 'gravel', 'coal_ore']
  )
})

test('mapTripTargets: resources without a minable block (ink_sac, blaze_rod) are never trip targets', () => {
  const progress = progressFrom([
    ['ink_sac', 31860, 0],
    ['blaze_rod', 4142, 0],
    ['gravel', 1000, 0]
  ])
  const mapCounts = { gravel: 30 }
  assert.deepEqual(mapTripTargets({ progress, mapCounts }), ['gravel'])
})

test('mapTripTargets: a resource the map knows nothing about is skipped (no blind walks)', () => {
  const progress = progressFrom([
    ['sand', 157926, 0],
    ['gravel', 1000, 0]
  ])
  const mapCounts = { sand: 0, gravel: 5 }
  assert.deepEqual(mapTripTargets({ progress, mapCounts }), ['gravel'])
})

test('mapTripTargets: minMapCount gates tiny buckets (1-3 known positions are noise)', () => {
  const progress = progressFrom([['sand', 157926, 0]])
  assert.deepEqual(mapTripTargets({ progress, mapCounts: { sand: 3 } }), [])
  assert.deepEqual(mapTripTargets({ progress, mapCounts: { sand: 4 } }), ['sand'])
})

test('mapTripTargets: satisfied resources (deficit < minDeficit) never send bots walking', () => {
  const progress = progressFrom([
    ['sand', 100, 60], // deficit 40 < 64
    ['gravel', 1000, 0]
  ])
  const mapCounts = { sand: 50, gravel: 50 }
  assert.deepEqual(mapTripTargets({ progress, mapCounts }), ['gravel'])
})

test('mapTripTargets: stone falls back to the whole grey-stone family, deduped', () => {
  const progress = progressFrom([['stone', 6695, 0]])
  const mapCounts = { stone: 2, andesite: 10, diorite: 8, granite: 6, tuff: 5 }
  // plain stone has only 2 known positions (below minMapCount), so the family
  // fallback kicks in - all four grey stones with enough map knowledge, in
  // MINABLE_OF order
  assert.deepEqual(mapTripTargets({ progress, mapCounts }), ['andesite', 'diorite', 'granite', 'tuff'])
})

test('mapTripTargets: maxTargets caps the list', () => {
  const progress = progressFrom([
    ['sand', 157926, 0],
    ['gravel', 149380, 0],
    ['coal', 7668, 0],
    ['tuff', 4439, 0]
  ])
  const mapCounts = { sand: 100, gravel: 100, coal_ore: 100, tuff: 100 }
  assert.deepEqual(mapTripTargets({ progress, mapCounts, maxTargets: 2 }), ['sand', 'gravel'])
})

test('mapTripTargets: missing/empty inputs and undefined have-fields are safe', () => {
  assert.deepEqual(mapTripTargets({}), [])
  assert.deepEqual(mapTripTargets({ progress: null, mapCounts: null }), [])
  assert.deepEqual(
    mapTripTargets({ progress: { sand: { required: 500 } }, mapCounts: { sand: 9 } }),
    ['sand'],
    'missing "have" counts as 0 held'
  )
})

test('MINABLE_OF/DROP_OF sanity: every plan-block resource maps somewhere sensible', () => {
  assert.equal(DROP_OF.stone, 'cobblestone')
  assert.equal(DROP_OF.grass_block, 'dirt')
  assert.deepEqual(MINABLE_OF.sand, ['sand'])
  assert.ok(MINABLE_OF.coal[0].endsWith('coal_ore'))
  assert.equal(MINABLE_OF.ink_sac, undefined, 'mob-drop resources must not be minable')
})

// ---- (v0.9.3) honest plan counting: planItemsOf / planHave ----
import { ITEMS_OF, planItemsOf, planHave } from '../../src/fleet/materialplan.mjs'

test('planItemsOf: iron_ingot counts the raw ore too (one furnace away)', () => {
  assert.deepEqual(planItemsOf('iron_ingot'), ['iron_ingot', 'raw_iron'])
  assert.deepEqual(planItemsOf('deepslate'), ['cobbled_deepslate', 'deepslate'])
})

test('planItemsOf: planks covers every 26.2 wood family (no item is named just planks)', () => {
  const planks = planItemsOf('planks')
  assert.ok(planks.includes('oak_planks') && planks.includes('birch_planks') && planks.includes('pale_oak_planks'))
  assert.equal(planks.length, 12)
})

test('planItemsOf: plain resources fall back through DROP_OF to the name itself', () => {
  // stone is NOT plain fallback: it counts the drop AND the smelted product
  // (the fleet's furnaces turn cobble -> stone in bulk)
  assert.deepEqual(planItemsOf('stone'), ['cobblestone', 'stone'])
  assert.deepEqual(planItemsOf('dirt'), ['dirt'])
  assert.deepEqual(planItemsOf('ink_sac'), ['ink_sac'])
})

test('planHave: sums every counting item across the inventory snapshot', () => {
  const items = [p9('iron_ingot', 12), p9('raw_iron', 30), p9('oak_planks', 5), p9('cobblestone', 64)]
  assert.equal(planHave(items, 'iron_ingot'), 42)
  assert.equal(planHave(items, 'planks'), 5)
  assert.equal(planHave(items, 'stone'), 64, 'stone counts through DROP_OF -> cobblestone')
  assert.equal(planHave([p9('stone', 30), p9('cobblestone', 10)], 'stone'), 40, 'smelted stone and the drop count TOGETHER')
})

test('planHave: junk input is ignored, never crashes', () => {
  assert.equal(planHave(null, 'iron_ingot'), 0)
  assert.equal(planHave([null, {}, { name: 'raw_iron' }, { name: 'raw_iron', count: -2 }, { name: 'raw_iron', count: NaN }], 'iron_ingot'), 0)
  assert.equal(planHave([p9('raw_iron', 3)], 'nonexistent_resource'), 0)
})

function p9 (name, count) { return { name, count } }

test('ITEMS_OF self-check: every list holds distinct non-empty strings', () => {
  for (const [res, names] of Object.entries(ITEMS_OF)) {
    assert.ok(names.length >= 1, res)
    assert.equal(new Set(names).size, names.length, `${res} has duplicate items`)
    for (const n of names) assert.equal(typeof n, 'string')
  }
})

// (v0.81.0) oreSteerOrder: the pickOreTarget `priorities` array from the plan's own
// deficit order. run75 mined ONE iron_ore while the map held 98 iron veins and the
// plan starved for iron - the steer must aim where the plan hurts.
test('oreSteerOrder: most-deficit resource first (iron starves, coal overflows)', () => {
  // deficits: iron 4096-1=4095 > copper 2048-19=2029 > coal 7668-7000=668
  const progress = progressFrom([
    ['iron', 4096, 1],
    ['coal', 7668, 7000],
    ['copper', 2048, 19]
  ])
  const ores = ['iron_ore', 'copper_ore', 'coal_ore']
  assert.deepEqual(oreSteerOrder({ progress, ores }), ['iron_ore', 'copper_ore', 'coal_ore'])
  // a satisfied iron (deficit 1096) with a starving copper (2048) re-orders
  const progress2 = progressFrom([
    ['iron', 4096, 3000],
    ['coal', 7668, 7000],
    ['copper', 2048, 0]
  ])
  assert.deepEqual(oreSteerOrder({ progress, ores: ores })[0], 'iron_ore')
  assert.deepEqual(oreSteerOrder({ progress: progress2, ores }), ['copper_ore', 'iron_ore', 'coal_ore'])
})

test('oreSteerOrder: unknown blocks keep their input order at the tail (stable)', () => {
  const progress = progressFrom([['coal', 7668, 0]])
  const ores = ['deepslate_coal_ore', 'coal_ore', 'mystery_ore']
  // coal_ore maps to the 'coal' resource via MINABLE_OF; the others have no plan resource
  const out = oreSteerOrder({ progress, ores })
  assert.equal(out[0], 'coal_ore', 'the planned block leads')
  assert.deepEqual(out.slice(1), ['deepslate_coal_ore', 'mystery_ore'], 'unknowns keep input order at the tail')
})

test('oreSteerOrder: junk input degrades safely', () => {
  assert.deepEqual(oreSteerOrder({ ores: ['coal_ore'] }), ['coal_ore'], 'missing progress = zero deficits, input order')
  assert.deepEqual(oreSteerOrder({ progress: { coal: { required: 5, have: 0 } } }), [], 'missing ores')
  assert.deepEqual(oreSteerOrder(null), [], 'junk object')
})

// (v0.82.0) THE INGOT BRIDGE: the plan speaks ITEM names ('iron_ingot'), MINABLE_OF
// speaks raw names ('iron'). run76 steered iron 31x while coal led 117x because
// progress['iron'] was undefined -> deficit 0. The bridge reads the REAL deficit.
test('oreSteerOrder: the ingot bridge reads the plan under its ITEM name', () => {
  // the REAL plan shape: rawResources keys are 'coal' and 'iron_ingot' (no 'iron')
  const progress = {
    coal: { required: 7668, have: 37 },
    iron_ingot: { required: 2275, have: 3 }
  }
  const ores = ['iron_ore', 'copper_ore', 'coal_ore']
  // coal deficit 7631 > iron deficit 2272 > copper (no plan resource at all) 0
  assert.deepEqual(oreSteerOrder({ progress, ores }), ['coal_ore', 'iron_ore', 'copper_ore'])
})

test('oreSteerOrder: the bridge flips the run76 failure into iron leadership when coal is satisfied', () => {
  const progress = {
    coal: { required: 7668, have: 7000 },
    iron_ingot: { required: 2275, have: 3 }
  }
  assert.deepEqual(oreSteerOrder({ progress, ores: ['coal_ore', 'iron_ore'] }), ['iron_ore', 'coal_ore'])
})

test('oreSteerOrder: the raw resource name still wins when the plan carries both forms', () => {
  const progress = {
    iron: { required: 100, have: 0 },
    iron_ingot: { required: 2275, have: 3 }
  }
  assert.equal(oreSteerOrder({ progress, ores: ['iron_ore'] })[0], 'iron_ore')
  // and the deficit used the RAW entry (100), not the bridged one - direct hit first
})
