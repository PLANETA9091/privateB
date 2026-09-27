// The tunnel zero verdict (v0.240.0): tunnel()'s three silent first-cut breaks
// get ONE classifier, and the runner's steer election gets a water-lock
// preflight. MEASURED (run36310927991, the v0.239.1 relay field debut): 13
// iron/copper steers were announced, every steered tunnel landed done=0 in the
// water-table band, the veins burned in veerSkipped, raw_iron read ZERO for the
// whole run and the famine root was invisible - the 0-block line printed with no
// gate named. Priority mirrors the loop order: fluid -> gravity roof -> names.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { tunnelZeroWhy, steerFluidLock } from '../../src/lib/surface.mjs'

test('zero verdict: fluid at the feet cell is the water-table verdict', () => {
  assert.equal(tunnelZeroWhy({ feetBox: 'fluid' }), 'fluid ahead')
})

test('zero verdict: fluid at the head cell alone is the same verdict (chest-deep water)', () => {
  assert.equal(tunnelZeroWhy({ headBox: 'fluid' }), 'fluid ahead')
})

test('zero verdict: the gravity roof refusal carries its own why', () => {
  assert.equal(tunnelZeroWhy({ roofOk: false, roofWhy: 'the roof dig refused: sand at [-1,2,0]' }), 'the roof dig refused: sand at [-1,2,0]')
})

test('zero verdict: a roof refusal without a why still names the fence', () => {
  assert.equal(tunnelZeroWhy({ roofOk: false }), 'gravity roof refused')
})

test('zero verdict: the names gate names the block it refused', () => {
  const names = ['stone', 'andesite', 'iron_ore']
  assert.equal(tunnelZeroWhy({ feetName: 'gold_ore', names }), 'names gate gold_ore')
  assert.equal(tunnelZeroWhy({ feetName: 'calcite', names }), 'names gate calcite')
})

test('zero verdict: a names-list cell is no verdict at all', () => {
  assert.equal(tunnelZeroWhy({ feetName: 'stone', names: ['stone', 'andesite'] }), null)
})

test('zero verdict: partial reads never cross-classify (each site passes only what it holds)', () => {
  // the fluid site holds only boxes - a roof refusal there is impossible
  assert.equal(tunnelZeroWhy({ feetBox: 'block', headBox: 'block' }), null)
  // the names site holds only the name list - boxes null, no fluid invented
  assert.equal(tunnelZeroWhy({ feetName: 'stone', names: ['stone'] }), null)
  // the empty read is null - the stop was tunnelStopReason's business
  assert.equal(tunnelZeroWhy({}), null)
  assert.equal(tunnelZeroWhy(null), null)
})

test('zero verdict: loop-order priority - fluid outranks roof, roof outranks names', () => {
  // a compound read resolves the way the loop would have broken: the fluid
  // check (line 2533) fires before the roof fence (2544) and the names gate
  assert.equal(tunnelZeroWhy({ feetBox: 'fluid', roofOk: false, roofWhy: 'roof' }), 'fluid ahead')
  assert.equal(tunnelZeroWhy({ roofOk: false, roofWhy: 'roof', feetName: 'gold_ore', names: ['stone'] }), 'roof')
})

test('steer fluid lock: feet or head fluid locks the steer line', () => {
  assert.equal(steerFluidLock({ feetBox: 'fluid', headBox: 'block' }), true)
  assert.equal(steerFluidLock({ feetBox: 'block', headBox: 'fluid' }), true)
  assert.equal(steerFluidLock({ feetBox: 'fluid' }), true)
})

test('steer fluid lock: dry cells, blind reads and junk never lock', () => {
  assert.equal(steerFluidLock({ feetBox: 'block', headBox: 'block' }), false)
  assert.equal(steerFluidLock({ feetBox: null, headBox: null }), false, 'a blind read (unloaded chunk) is not a lock - the tunnel owns its own fluid break')
  assert.equal(steerFluidLock({}), false)
  assert.equal(steerFluidLock(null), false)
  assert.equal(steerFluidLock({ feetBox: 'air', headBox: 'air' }), false)
})

test('zero verdict: the field matrix of run36310927991 - every steered 0-block tunnel resolves to a named gate', () => {
  // F1's iron steer at the water hazard: step-1 feet cell was fluid
  const f1 = tunnelZeroWhy({ feetBox: 'fluid', headBox: 'block' })
  assert.equal(f1, 'fluid ahead')
  assert.equal(steerFluidLock({ feetBox: 'fluid', headBox: 'block' }), true, 'the preflight would have stood off BEFORE the 0-block burn')
  // a dry steer keeps its tunnel (the preflight never fires on a dry line)
  assert.equal(steerFluidLock({ feetBox: 'block', headBox: 'block' }), false)
})
