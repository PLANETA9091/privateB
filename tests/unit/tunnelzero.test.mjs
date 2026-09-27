// The tunnel zero verdict (v0.240.0): tunnel()'s three silent first-cut breaks
// get ONE classifier, and the runner's steer election gets a water-lock
// preflight. MEASURED (run36310927991, the v0.239.1 relay field debut): 13
// iron/copper steers were announced, every steered tunnel landed done=0 in the
// water-table band, the veins burned in veerSkipped, raw_iron read ZERO for the
// whole run and the famine root was invisible - the 0-block line printed with no
// gate named. Priority mirrors the loop order: fluid -> gravity roof -> names.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { tunnelZeroWhy, steerFluidLock, sealCensus } from '../../src/lib/surface.mjs'

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

// (v0.242.0) THE FLUID NAME LAW - the 26.2 registry's water/lava carry
// boundingBox "empty" (water id 35, lava id 36), so the v0.241.0 box-only
// preflight fired ZERO locks while the tunnels ate 23 '[names gate water]'
// zeros (run36314614666). The NAME is the second eye.
test('fluid name law: water by name locks and classifies even with boundingBox empty (the 26.2 shape)', () => {
  // the exact field shape: blockAt returned a block named water, boundingBox empty
  assert.equal(steerFluidLock({ feetBox: 'empty', headBox: 'empty', feetName: 'water', headName: 'air' }), true, 'the v0.241.0 blind spot, now locked')
  assert.equal(tunnelZeroWhy({ feetBox: 'empty', feetName: 'water', names: ['stone', 'dirt'] }), 'fluid ahead', 'water outranks the names gate')
  assert.equal(tunnelZeroWhy({ headName: 'lava' }), 'fluid ahead', 'lava by name is the same verdict')
  assert.equal(tunnelZeroWhy({ feetName: 'kelp' }), 'fluid ahead', 'kelp is the drowning family - the dig list cannot chew it')
  assert.equal(tunnelZeroWhy({ headName: 'bubble_column' }), 'fluid ahead')
})

test('fluid name law: dry names never lock, junk never throws', () => {
  assert.equal(steerFluidLock({ feetBox: 'empty', headBox: 'empty', feetName: 'air', headName: 'cave_air' }), false)
  assert.equal(steerFluidLock({ feetName: 'stone', headName: 'dirt' }), false)
  assert.equal(steerFluidLock({ feetBox: 'empty', feetName: 'leaf_litter' }), false, 'foliage is a names-gate stop, not a fluid')
  assert.equal(tunnelZeroWhy({ feetBox: 'empty', feetName: 'water' }), 'fluid ahead')
  assert.equal(tunnelZeroWhy({ feetName: 'water', names: null }), 'fluid ahead', 'the fluid law holds even without a dig list')
})

test('fluid name law: the vendored 26.2 registry really ships water with boundingBox empty (the law\'s foundation)', async () => {
  // the fact this whole cure stands on - if the vendor data ever changes, this
  // pin names it before the field does
  const fs = await import('node:fs')
  const path = new URL('../../vendor/mcdata-26.2/data/pc/26.2/blocks.json', import.meta.url)
  const blocks = JSON.parse(fs.readFileSync(path, 'utf8'))
  const entries = Object.values(blocks)
  const water = entries.find(e => e.name === 'water')
  const lava = entries.find(e => e.name === 'lava')
  assert.ok(water, 'water exists in the 26.2 registry')
  assert.ok(lava, 'lava exists in the 26.2 registry')
  assert.equal(water.boundingBox, 'empty', 'water boundingBox is empty - the box-only check is blind by construction')
  assert.equal(lava.boundingBox, 'empty', 'lava boundingBox is empty')
  assert.equal(water.id, 35)
  assert.equal(lava.id, 36)
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

// ---- v0.244.0 THE SEAL CENSUS: the seal-and-cross frontier's arm telemetry ----
test('seal census: water plus sealable stock arms the placement cure', () => {
  assert.deepEqual(
    sealCensus({ fluidNames: ['water', null], pocket: [{ name: 'dirt', count: 3 }, { name: 'apple', count: 2 }] }),
    { fluid: 'water', sealable: true, blocks: 3, top: 'dirt' },
    'water at step 1 + dirt in pocket = the cure is real'
  )
})

test('seal census: a bare pocket keeps the frontier at bring-stock', () => {
  const c = sealCensus({ fluidNames: ['water'], pocket: [{ name: 'apple', count: 2 }, { name: 'stick', count: 7 }] })
  assert.equal(c.fluid, 'water')
  assert.equal(c.blocks, 0)
  assert.equal(c.sealable, false, 'water but no sealable block - the pocket is bare')
  assert.equal(c.top, null)
})

test('seal census: lava NEVER arms the seal (live lava burns the placement)', () => {
  const c = sealCensus({ fluidNames: ['flowing_lava'], pocket: [{ name: 'cobblestone', count: 64 }] })
  assert.equal(c.fluid, 'lava')
  assert.equal(c.blocks, 64)
  assert.equal(c.sealable, false, 'stock in pocket, but the fluid refuses the cure')
})

test('seal census: the water family classifies by name (kelp, bubble_column)', () => {
  assert.equal(sealCensus({ fluidNames: ['kelp'], pocket: [{ name: 'dirt', count: 1 }] }).fluid, 'water')
  assert.equal(sealCensus({ fluidNames: ['bubble_column'], pocket: [{ name: 'dirt', count: 1 }] }).sealable, true)
})

test('seal census: gravity blocks are excluded - a sand seal washes out', () => {
  const c = sealCensus({ fluidNames: ['water'], pocket: [{ name: 'sand', count: 10 }, { name: 'gravel', count: 6 }] })
  assert.equal(c.blocks, 0, 'sand/gravel fall - the seal cannot hold')
  assert.equal(c.sealable, false)
})

test('seal census: top names the richest stack', () => {
  const c = sealCensus({ fluidNames: ['water'], pocket: [{ name: 'dirt', count: 2 }, { name: 'cobblestone', count: 5 }, { name: 'andesite', count: 4 }] })
  assert.equal(c.blocks, 11)
  assert.equal(c.top, 'cobblestone')
})

test('seal census: junk-safe - bare calls never throw', () => {
  assert.deepEqual(sealCensus(), { fluid: null, sealable: false, blocks: 0, top: null })
  assert.deepEqual(sealCensus({ fluidName: 'water' }), { fluid: 'water', sealable: false, blocks: 0, top: null })
  assert.deepEqual(sealCensus({ fluidNames: null, pocket: 'junk' }), { fluid: null, sealable: false, blocks: 0, top: null })
})

test('seal census: the first name that classifies wins (feet junk, head lava)', () => {
  const c = sealCensus({ fluidNames: ['stone', 'flowing_lava'], pocket: [] })
  assert.equal(c.fluid, 'lava', 'a dry feet read must not mask the head fluid')
})
