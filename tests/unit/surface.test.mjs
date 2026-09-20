// Surface policy - the pillar-jump shaft exit. Pure maths, no bot, no server.
// Background (fleet 35485296464): digShaft strands every bot at the bottom of a
// 1x1 hole; the pathfinder cannot climb out; banked=0 smelted=0 sand=0 followed.
// These tests pin the policy that miner.mjs climbOut executes.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  pillarTarget, climbableCeiling, pickPillarBlock, pillarPlacement,
  PILLAR_BLOCKS, UNDIGGABLE, FLUIDS,
  PILLAR_FAIL_LIMIT, PILLAR_TICKS_TO_APEX, PILLAR_LAND_TICKS,
  CEILING_DIG_LIMIT, PILLAR_LEVEL_CAP
} from '../../src/lib/surface.mjs'

test('pillarTarget: a recorded shaft entry y above the feet wins outright', () => {
  // the bot descended 35 levels: entry 63, feet now 28
  const p = pillarTarget({ feetY: 28, targetY: 63 })
  assert.deepEqual(p, { ok: true, targetY: 63, levels: 35, source: 'entry' })
})

test('pillarTarget: entry y caps at maxUp (a runaway record cannot burn the run)', () => {
  const p = pillarTarget({ feetY: 0, targetY: 500, maxUp: 80 })
  assert.equal(p.targetY, 80)
  assert.equal(p.levels, 80)
  assert.equal(p.source, 'entry')
})

test('pillarTarget: entry y BELOW the feet is stale (surface trip left us higher)', () => {
  // no skylight callback: falls through to the cap
  const p = pillarTarget({ feetY: 70, targetY: 28 })
  assert.equal(p.source, 'cap')
  assert.equal(p.targetY, 70 + PILLAR_LEVEL_CAP)
})

test('pillarTarget: daylight marks the surface when no entry was recorded', () => {
  // sky-lit cell 7 above the feet -> climb 7 levels
  const skyLitAt = dy => (dy >= 7 ? true : false)
  const p = pillarTarget({ feetY: 24, skyLitAt })
  assert.deepEqual(p, { ok: true, targetY: 31, levels: 7, source: 'skylight' })
})

test('pillarTarget: an already-sky-lit head cell means "surface", one level at most', () => {
  const skyLitAt = dy => true // every cell sees daylight: the bot IS outside
  const p = pillarTarget({ feetY: 63, skyLitAt })
  assert.equal(p.levels, 1)
  assert.equal(p.source, 'skylight')
})

test('pillarTarget: unknown chunk data above falls back to the cap', () => {
  const skyLitAt = dy => (dy >= 3 ? null : false) // chunk unloads at dy=3
  const p = pillarTarget({ feetY: 24, skyLitAt })
  assert.equal(p.source, 'cap')
  assert.equal(p.targetY, 24 + PILLAR_LEVEL_CAP)
})

test('pillarTarget: junk feet values do not crash the plan', () => {
  const p = pillarTarget({ feetY: NaN, targetY: 63 })
  assert.equal(p.ok, true) // NaN feet -> y0=0 -> entry 63 still valid
  assert.equal(p.targetY, 63)
})

test('climbableCeiling: air-family cells are free', () => {
  assert.equal(climbableCeiling({ name: 'air', boundingBox: 'empty' }), 'free')
  assert.equal(climbableCeiling({ name: 'torch', boundingBox: 'empty' }), 'free')
  assert.equal(climbableCeiling({ name: 'oak_sapling', boundingBox: 'empty' }), 'free')
})

test('climbableCeiling: solid mineable cells are dug through', () => {
  assert.equal(climbableCeiling({ name: 'stone', boundingBox: 'block' }), 'dig')
  assert.equal(climbableCeiling({ name: 'dirt', boundingBox: 'block' }), 'dig')
})

test('climbableCeiling: fluids stop the climb (digging under lava floods it)', () => {
  for (const f of FLUIDS) {
    assert.equal(climbableCeiling({ name: f, boundingBox: 'block' }), 'stop', f)
  }
  assert.equal(climbableCeiling({ name: 'lava', boundingBox: 'fluid' }), 'stop')
})

test('climbableCeiling: undiggable blocks stop the climb honestly', () => {
  for (const u of UNDIGGABLE) {
    assert.equal(climbableCeiling({ name: u, boundingBox: 'block' }), 'stop', u)
  }
})

test('climbableCeiling: junk telemetry stops (never a silent true)', () => {
  assert.equal(climbableCeiling(null), 'stop')
  assert.equal(climbableCeiling(undefined), 'stop')
  assert.equal(climbableCeiling('stone'), 'stop') // a string is not a block
  assert.equal(climbableCeiling({}), 'stop') // no boundingBox -> not proven free
})

test('pickPillarBlock: preference order - cobblestone beats dirt', () => {
  const items = [{ name: 'dirt', count: 64 }, { name: 'cobblestone', count: 30 }]
  assert.equal(pickPillarBlock(items).name, 'cobblestone')
})

test('pickPillarBlock: zero-count and junk entries are skipped', () => {
  const items = [
    null,
    { name: 'cobblestone', count: 0 },
    { name: 'cobblestone' }, // no count at all
    { name: 'dirt', count: 12 }
  ]
  assert.equal(pickPillarBlock(items).name, 'dirt')
})

test('pickPillarBlock: nothing placeable -> null (the caller bootstraps)', () => {
  assert.equal(pickPillarBlock([{ name: 'stick', count: 9 }, { name: 'oak_planks', count: 12 }]), null)
  assert.equal(pickPillarBlock([]), null)
  assert.equal(pickPillarBlock(null), null)
  assert.equal(pickPillarBlock('cobblestone'), null)
})

test('pickPillarBlock: the list never contains tool material', () => {
  // planks/sticks/logs keep the tool chain alive - a climb must not strip the kit
  for (const banned of ['oak_planks', 'stick', 'oak_log', 'crafting_table']) {
    assert.ok(!PILLAR_BLOCKS.includes(banned), banned)
  }
})

test('pillarPlacement: the first solid wall becomes the reference, face points back', () => {
  const walls = [
    { dx: 1, dz: 0, solid: false }, // air shaft opening
    { dx: -1, dz: 0, solid: true }, // stone wall
    { dx: 0, dz: 1, solid: true },
    { dx: 0, dz: -1, solid: false }
  ]
  const p = pillarPlacement(walls)
  assert.deepEqual(p, { dx: -1, dz: 0, face: { x: 1, y: 0, z: 0 } })
})

test('pillarPlacement: no solid wall (open platform) -> null', () => {
  const walls = [{ dx: 1, dz: 0, solid: false }, { dx: -1, dz: 0, solid: false }]
  assert.equal(pillarPlacement(walls), null)
  assert.equal(pillarPlacement([]), null)
  assert.equal(pillarPlacement(null), null)
  assert.equal(pillarPlacement('walls'), null)
  assert.equal(pillarPlacement([{ dx: NaN, dz: 0, solid: true }]), null) // junk offsets
})

test('climb constants: bounded and sane before any fleet trusts them', () => {
  assert.ok(PILLAR_FAIL_LIMIT >= 3 && PILLAR_FAIL_LIMIT <= 8)
  assert.ok(PILLAR_TICKS_TO_APEX >= 4 && PILLAR_TICKS_TO_APEX <= 8) // vanilla apex ~6 ticks
  assert.ok(PILLAR_LAND_TICKS >= 8 && PILLAR_LAND_TICKS <= 20)
  assert.ok(CEILING_DIG_LIMIT >= 4 && CEILING_DIG_LIMIT <= 20)
  assert.ok(PILLAR_LEVEL_CAP >= 64 && PILLAR_LEVEL_CAP <= 128) // y63 -> minY24 needs ~40
})
