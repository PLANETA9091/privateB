// Tests for src/fleet/materialplan.mjs - the plan -> map -> trip routing policy.
// The v0.6.9 Big Fleet collected ZERO sand while the plan needed 157,926 and the
// shared map held 194 recorded sand positions: nothing connected the map to the
// diggers. mapTripTargets is that missing link; these tests pin its policy.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DROP_OF, MINABLE_OF, mapTripTargets } from '../../src/fleet/materialplan.mjs'

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
