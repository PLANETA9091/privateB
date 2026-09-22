// Surface policy - the pillar-jump shaft exit. Pure maths, no bot, no server.
// Background (fleet 35485296464): digShaft strands every bot at the bottom of a
// 1x1 hole; the pathfinder cannot climb out; banked=0 smelted=0 sand=0 followed.
// These tests pin the policy that miner.mjs climbOut executes.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  pillarTarget, climbableCeiling, pickPillarBlock, pillarPlacement,
  PILLAR_BLOCKS, UNDIGGABLE, FLUIDS,
  PILLAR_PLACE_TIMEOUT_MS, PILLAR_MAX_MS,
  PILLAR_FAIL_LIMIT, PILLAR_TICKS_TO_APEX, PILLAR_LAND_TICKS,
  CEILING_DIG_LIMIT, PILLAR_LEVEL_CAP,
  riseRecoveryPlan, RISE_ASSIST_TIMEOUT_MS, RISE_LONGHOLD_TICKS,
  CLIMB_DIG_TICKS, CLIMB_DIG_TICKS_WET, climbDigWindow
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

test('REGRESSION PIN: the run75 unbreakable dig burner - end_portal_frame is stop, never dig', () => {
  // run75 (35740810293): F9 dug=64 at ONE end_portal_frame [-158,66,408] -
  // the server can never break it (hardness -1), so the climb burned its
  // whole dig budget retrying one cell. The unbreakable structure set rides
  // UNDIGGABLE now: stepDigPlan classifies it 'stop' and the blocked path
  // ends the level attempt with the refusal named.
  assert.equal(climbableCeiling({ name: 'end_portal_frame', boundingBox: 'block' }), 'stop',
    'the exact run75 burner cell')
  assert.equal(climbableCeiling({ name: 'end_portal', boundingBox: 'block' }), 'stop')
  assert.equal(climbableCeiling({ name: 'nether_portal', boundingBox: 'block' }), 'stop')
  assert.equal(climbableCeiling({ name: 'command_block', boundingBox: 'block' }), 'stop')
  assert.equal(climbableCeiling({ name: 'structure_block', boundingBox: 'block' }), 'stop')
  assert.equal(UNDIGGABLE.includes('end_portal_frame'), true, 'the list itself carries the set')
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
  // tick 5 left the AABB overlapping the vacated cell -> server rejected every
  // placement and a 24-level climb took 241 s (fleet 35488918930). Tick 8 puts
  // the feet ~1.15 up; more than 10 wastes climb time for nothing.
  assert.ok(PILLAR_TICKS_TO_APEX >= 7 && PILLAR_TICKS_TO_APEX <= 10)
  assert.ok(PILLAR_LAND_TICKS >= 8 && PILLAR_LAND_TICKS <= 20)
  assert.ok(CEILING_DIG_LIMIT >= 4 && CEILING_DIG_LIMIT <= 20)
  assert.ok(PILLAR_LEVEL_CAP >= 64 && PILLAR_LEVEL_CAP <= 128) // y63 -> minY24 needs ~40
  assert.ok(PILLAR_PLACE_TIMEOUT_MS >= 1000 && PILLAR_PLACE_TIMEOUT_MS <= 3000)
  assert.ok(PILLAR_MAX_MS >= 45000 && PILLAR_MAX_MS <= 180000) // a climb must not eat the run
})

// (v0.23.0) isWalkableSurface - the F2/F5 measured waste: bots burning their whole
// fail budget ON the biome surface because the stale entry target demanded levels
// the terrain no longer owes. Daylight + 2 walkable directions must read "surface".
import { isWalkableSurface } from '../../src/lib/surface.mjs'

// probe factory: models (feet+dx, feet+1) free/solid per direction
const world = open => (dx, dz) => {
  const key = `${dx},${dz}`
  return open[key] || { free: false, solid: true } // default: solid wall, blocked step
}

test('walkable surface: an open field (F2 at y=63 with a grass rim) reads TRUE', () => {
  // F2's exact end state: feet air, a 1-block grass rim in front (step=air above it),
  // open field around - the climb must hand the bot to the chest walk
  const probes = world({ '1,0': { free: true, solid: true }, '-1,0': { free: true, solid: true }, '0,1': { free: true, solid: true }, '0,-1': { free: true, solid: true } })
  assert.equal(isWalkableSurface({ skyLit: true, probes }), true)
})

test('walkable surface: daylight alone is not enough - a 1x1 open shaft has 0 walkable dirs', () => {
  // skyLight falls straight down an open air column, so the shaft bottom IS sky-lit;
  // the walls all around keep it from being declared a surface
  const probes = world({}) // every direction: solid wall + blocked step
  assert.equal(isWalkableSurface({ skyLit: true, probes }), false)
})

test('walkable surface: a 2x2 open shaft has exactly 1 walkable dir - still NOT a surface', () => {
  const probes = world({ '0,1': { free: true, solid: true } }) // the second shaft column
  assert.equal(isWalkableSurface({ skyLit: true, probes }), false)
})

test('walkable surface: a tunnel/gallery (0 free dirs) keeps climbing even when sky-lit', () => {
  const probes = world({ '1,0': { free: false, solid: true }, '-1,0': { free: true, solid: false }, '0,1': { free: true, solid: false } })
  // dirs -1,0 / 0,1 have free steps but NO floor (a corridor edge) - not walkable
  assert.equal(isWalkableSurface({ skyLit: true, probes }), false)
})

test('walkable surface: a dark cell (cave) never reads as surface, however open', () => {
  const probes = world({ '1,0': { free: true, solid: true }, '-1,0': { free: true, solid: true } })
  assert.equal(isWalkableSurface({ skyLit: false, probes }), false, 'caves must keep the staircase')
})

test('walkable surface: junk inputs are safe (no probe fn, throwing probes, minDirs floor)', () => {
  assert.equal(isWalkableSurface({ skyLit: true }), false, 'no probes -> not a surface')
  assert.equal(isWalkableSurface({}), false)
  assert.equal(isWalkableSurface(null), false)
  const boom = () => { throw new Error('chunk gone') }
  assert.equal(isWalkableSurface({ skyLit: true, probes: boom }), false, 'a throwing probe must not crash the climb loop')
  // minDirs=1 lets a caller demand less (kept for tuning; the climb uses the default 2)
  const one = world({ '0,-1': { free: true, solid: true } })
  assert.equal(isWalkableSurface({ skyLit: true, probes: one, minDirs: 1 }), true)
  assert.equal(isWalkableSurface({ skyLit: true, probes: one, minDirs: 2 }), false)
})

// (v0.27.0) RISE RECOVERY - the decision after two failed raw stepUps on clean
// geometry (the 'did not rise (dug=0)' fleet class: F13 dry, F17 in-river).
test('rise recovery: no step-top cell means no bounded wait - rotate as before', () => {
  assert.deepEqual(riseRecoveryPlan({ feetWater: false, stepTop: null }), { kind: 'rotate' })
  assert.deepEqual(riseRecoveryPlan({ feetWater: true }), { kind: 'rotate' })
  assert.deepEqual(riseRecoveryPlan(), { kind: 'rotate' }, 'junk-tolerant like climbEntry')
  // a stepTop without .offset is junk telemetry, not a target
  assert.deepEqual(riseRecoveryPlan({ stepTop: { x: 1, y: 2, z: 3 } }), { kind: 'rotate' })
})

test('rise recovery: dry feet hand the step to the pathfinder (one bounded assist)', () => {
  const stepTop = { x: 5, y: 43, z: -2, offset () { return this } }
  const plan = riseRecoveryPlan({ feetWater: false, stepTop })
  assert.equal(plan.kind, 'assist')
  assert.equal(plan.stepTop, stepTop, 'the caller walks to THIS cell')
  assert.equal(plan.timeoutMs, RISE_ASSIST_TIMEOUT_MS, 'the assist is bounded, never an unbounded goto')
})

test('rise recovery: wet feet get a longer jump hold, never a water pathfind', () => {
  // F17: feet=water support=andesite step=air - pathfinding inside water is
  // flaky and an off-goal move loses the bearing; swim momentum is the cure
  const stepTop = { x: 5, y: 43, z: -2, offset () { return this } }
  const plan = riseRecoveryPlan({ feetWater: true, stepTop })
  assert.equal(plan.kind, 'longHold')
  assert.equal(plan.holdTicks, RISE_LONGHOLD_TICKS)
  assert.equal(plan.holdTicks > 24, true, 'strictly longer than the proven-dead v0.19 24-tick retry')
})

test('rise recovery: the assist timeout stays sane (bounded but usable)', () => {
  assert.equal(RISE_ASSIST_TIMEOUT_MS >= 3000, true, 'a real jump-edge computation needs headroom')
  assert.equal(RISE_ASSIST_TIMEOUT_MS <= 6000, true, 'a failed assist must not eat the fail budget - 4 fails own the climb')
})

// (v0.37.0) FLAT directions - fleet 35566494961: F2 stalled at y=64 on flat open
// ground ('blocked toward (dug=3)' on every bearing, no step UP exists in any of
// them) and 'cannot leave the shaft' gated 11 map trips. The terrace-only rule
// could not see level ground as "out"; walkFlat adds the level-ground direction.
test('walkable surface: flat open ground (F2 y=64, no step UP anywhere) reads TRUE via walkFlat', () => {
  // every bearing: headroom free, NO solid step at feet level (that is why the
  // support check blocked), ground one below (walkable flat) - the bot is OUT
  const flat = { free: true, solid: false, walkFlat: true }
  const probes = world({ '1,0': flat, '-1,0': flat, '0,1': flat, '0,-1': flat })
  assert.equal(isWalkableSurface({ skyLit: true, probes }), true)
})

test('walkable surface: an island (free steps, no floor at any level) is still NOT a surface', () => {
  // the blocked-path verdict must not hand a stranded bot to a walk it cannot start
  const island = { free: true, solid: false, walkFlat: false }
  const probes = world({ '1,0': island, '-1,0': island, '0,1': island, '0,-1': island })
  assert.equal(isWalkableSurface({ skyLit: true, probes }), false)
})

test('walkable surface: one terrace dir + one flat dir clears minDirs=2', () => {
  const probes = world({
    '1,0': { free: true, solid: true }, // terrace: the riverbank rim
    '-1,0': { free: true, solid: false, walkFlat: true } // flat: open beach
  })
  assert.equal(isWalkableSurface({ skyLit: true, probes }), true)
})

test('walkable surface: a single flat direction is not enough (2x2 shaft stays a shaft)', () => {
  const probes = world({ '0,1': { free: true, solid: false, walkFlat: true } })
  assert.equal(isWalkableSurface({ skyLit: true, probes }), false)
})

test('walkable surface: walkFlat is counted only when strictly true (old callers unaffected)', () => {
  // legacy probes never set walkFlat - a truthy junk value must not widen the gate
  const junk = { free: true, solid: false, walkFlat: 1 }
  assert.equal(isWalkableSurface({ skyLit: true, probes: world({ '1,0': junk, '-1,0': junk, '0,1': junk, '0,-1': junk }) }), false)
})

// ---------------------------------------------------------------------------
// (v0.42.0) THE FLOODED-DIG WINDOW - a wet context takes the flooded window;
// the dry window keeps the v0.39.0 contract untouched.
//
// Measured basis (fleet 35582520041): F16's dig-fail block was DIRT (15t dry)
// - only the vanilla in-water x5 / off-ground x5 multipliers can push a dirt
// cut past a 200t window. Bare-hand stone-family on-ground in water = 750t;
// the flooded window must cover that floor.
test('climbDigWindow: dry context keeps the v0.39.0 patient window', () => {
  assert.equal(climbDigWindow({}), CLIMB_DIG_TICKS)
  assert.equal(climbDigWindow({ eyeWet: false, feetWet: false }), CLIMB_DIG_TICKS)
  assert.equal(climbDigWindow({ eyeWet: 0, feetWet: null }), CLIMB_DIG_TICKS, 'junk flags read dry')
})

test('climbDigWindow: eye-wet OR feet-wet takes the flooded window', () => {
  assert.equal(climbDigWindow({ eyeWet: true }), CLIMB_DIG_TICKS_WET)
  assert.equal(climbDigWindow({ feetWet: true }), CLIMB_DIG_TICKS_WET)
  assert.equal(climbDigWindow({ eyeWet: false, feetWet: true }), CLIMB_DIG_TICKS_WET)
})

test('climbDigWindow: the flooded window covers the bare-hand stone in-water floor (750t)', () => {
  // vanilla dig-speed rules: in-water x5 on the 150t bare-hand stone cut
  assert.ok(CLIMB_DIG_TICKS_WET >= 750, `wet window ${CLIMB_DIG_TICKS_WET} must cover the 750t floor`)
  assert.ok(CLIMB_DIG_TICKS_WET > CLIMB_DIG_TICKS, 'the flooded window strictly exceeds the dry one')
  // and stays bounded: the hopeless x25 stack (3750t bare-hand stone) is
  // deliberately NOT covered - the wet escape owns that class
  assert.ok(CLIMB_DIG_TICKS_WET < 1000, `wet window ${CLIMB_DIG_TICKS_WET} must not eat the whole 90s climb on one dig`)
})

test('climbDigWindow: junk window overrides fall back to the module defaults', () => {
  assert.equal(climbDigWindow({ dryTicks: 'junk' }), CLIMB_DIG_TICKS)
  assert.equal(climbDigWindow({ eyeWet: true, wetTicks: -5 }), CLIMB_DIG_TICKS_WET)
  assert.equal(climbDigWindow({ eyeWet: true, wetTicks: NaN }), CLIMB_DIG_TICKS_WET)
  assert.equal(climbDigWindow({ dryTicks: 0 }), CLIMB_DIG_TICKS)
})
