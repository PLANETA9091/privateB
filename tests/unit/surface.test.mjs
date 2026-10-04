// Surface policy - the pillar-jump shaft exit. Pure maths, no bot, no server.
// Background (fleet 35485296464): digShaft strands every bot at the bottom of a
// 1x1 hole; the pathfinder cannot climb out; banked=0 smelted=0 sand=0 followed.
// These tests pin the policy that miner.mjs climbOut executes.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {
  pillarTarget, climbableCeiling, pickPillarBlock, pillarPlacement,
  PILLAR_BLOCKS, UNDIGGABLE, FLUIDS,
  PILLAR_PLACE_TIMEOUT_MS, PILLAR_MAX_MS,
  PILLAR_FAIL_LIMIT, PILLAR_TICKS_TO_APEX, PILLAR_LAND_TICKS,
  CEILING_DIG_LIMIT, PILLAR_LEVEL_CAP,
  riseRecoveryPlan, RISE_ASSIST_TIMEOUT_MS, RISE_LONGHOLD_TICKS,
  CLIMB_DIG_TICKS, CLIMB_DIG_TICKS_WET, climbDigWindow,
  veinDigRefusal, VEIN_DROP_REFUSE,
  verticalDoomPlan, VERTICAL_DOOM_MIN_DY, climbTargetY,
  wetEscapeGate, wetEscapeAccount, WET_ESCAPE_WALK_CEILING, chestVerticalDoom,
  wetCeilingAscendGate, WET_CEILING_DIG_BUDGET, // (v0.300.0) the wet-ceiling ascend
  climbSurfaceShort // (v0.610.0) the altitude-demand guard
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

// ------------------------------------------------- (v0.98.0) the vein fall fence
test('veinDigRefusal: a drop of 4+ below the cell refuses (the run87 fall/env x8, F4 class)', () => {
  assert.equal(veinDigRefusal({ airBelow: 0 }), null, 'solid ground beneath - the normal dig')
  assert.equal(veinDigRefusal({ airBelow: 3 }), null, 'a 3-block hop survives')
  assert.equal(veinDigRefusal({ airBelow: 4 }), 'drop of 4 below the cell (cave?) - the ore waits for a safe angle',
    '4+ is the shaft digger\'s own sidestep line - the sweep obeys the same truth')
  assert.equal(veinDigRefusal({ airBelow: 23 }), 'drop of 23 below the cell (cave?) - the ore waits for a safe angle',
    'the F4 fall: 20+ blocks from the surface band')
})

test('veinDigRefusal: blind and junk reads refuse - a bonus sweep never gambles', () => {
  assert.ok(veinDigRefusal({ blind: true }).includes('blind'), 'the stale window refuses')
  assert.ok(veinDigRefusal({ airBelow: NaN }).includes('junk'), 'NaN refuses')
  assert.ok(veinDigRefusal({ airBelow: -1 }).includes('junk'), 'a negative drop refuses')
  assert.ok(veinDigRefusal({ airBelow: 'junk' }).includes('junk'), 'a string read refuses')
  assert.equal(veinDigRefusal({}), null, 'the bare call reads solid (0) - legacy shape for the mocks')
})

test('VEIN_DROP_REFUSE matches the shaft digger\'s sidestep threshold', () => {
  assert.equal(VEIN_DROP_REFUSE, 4, 'the dropAheadBelow >= 4 line in digShaft is the same truth')
})

// ---------------------------------------------------------------------------
// (v0.158.0) THE VERTICAL DOOM PLAN - run556 (36055223458) decoded the F6
// class: the bot stood 39 levels BELOW the yard over 2 lateral blocks and the
// walk ladder burned its whole slice ('stuck' x10, zero-delta stalls, the
// decide class x3+) on a goal no 1-jump pathfinder can route. The gate names
// that arithmetic so the chains can hand the vertical to the climb machinery.
test('verticalDoomPlan: the run556 F6 construction - 39 up over 2 lateral is doomed', () => {
  const p = verticalDoomPlan({ botY: 41, yardY: 80, lateral: 2 })
  assert.equal(p.doom, true)
  assert.equal(p.dy, 39)
  assert.equal(p.lateral, 2)
  assert.match(p.why, /39 levels up over 2b lateral/)
})

test('verticalDoomPlan: the hillside shape keeps the legacy ladder', () => {
  // lateral > dy: a staircase may exist, A* can route it - never doom
  const p = verticalDoomPlan({ botY: 58, yardY: 80, lateral: 30 })
  assert.equal(p.doom, false)
  assert.match(p.why, /the ladder may route it/)
})

test('verticalDoomPlan: the walkable band (dy below the floor) never dooms', () => {
  const p = verticalDoomPlan({ botY: 70, yardY: 80, lateral: 5 })
  assert.equal(p.doom, false, '10 levels up is a 1-jump staircase, not doom')
  const edge = verticalDoomPlan({ botY: 60, yardY: 80, lateral: 19 })
  assert.equal(edge.doom, true, 'dy 20 over lateral 19 is the doom shape')
  assert.equal(verticalDoomPlan({ botY: 80, yardY: 80, lateral: 0 }).doom, false, 'at the yard level the ladder owns it')
  assert.equal(verticalDoomPlan({ botY: 90, yardY: 80, lateral: 2 }).doom, false, 'the yard DOWNHILL is never the doom (the climb target never lowers)')
})

test('verticalDoomPlan: junk-safe - no reads, no doom (the legacy shape)', () => {
  assert.equal(verticalDoomPlan({}).doom, false, 'no args at all')
  assert.equal(verticalDoomPlan({ botY: NaN, yardY: 80, lateral: 2 }).doom, false)
  assert.equal(verticalDoomPlan({ botY: 41, yardY: null, lateral: 2 }).doom, false)
  assert.equal(verticalDoomPlan({ botY: 41, yardY: 80, lateral: 'junk' }).doom, false, 'a missing lateral read refuses to doom')
  assert.equal(verticalDoomPlan({ botY: 41, yardY: 80, lateral: -5 }).doom, false, 'a negative lateral is junk too')
})

// (v0.158.0) THE RAISED CLIMB TARGET - the shaft entry stays the default
// surface reference; the yard's level may only RAISE it. This is the gate
// climbOut consults (the F6 class: entry 44, yard 80 - the climb stopped at
// the entry and handed the walk ladder a doomed vertical).
test('climbTargetY: the yard level raises the entry; nothing ever lowers it', () => {
  assert.equal(climbTargetY({ entryY: 44, targetY: 80 }), 80, 'the yard ABOVE raises the target')
  assert.equal(climbTargetY({ entryY: 90, targetY: 80 }), 90, 'the yard below the entry keeps the entry (never lowers)')
  assert.equal(climbTargetY({ entryY: null, targetY: 80 }), 80, 'no entry record: the yard IS the reference')
  assert.equal(climbTargetY({ entryY: 44, targetY: null }), 44, 'no override: the entry byte for byte')
  assert.equal(climbTargetY({ entryY: NaN, targetY: NaN }), null, 'junk reads as no record')
  assert.equal(climbTargetY({}), null)
})

test('climbTargetY composes with pillarTarget: the F6 shape climbs toward the yard', () => {
  // entry 44, feet 41, yard 80: the legacy plan climbed 3 levels and stopped;
  // the raised plan climbs toward the yard's level (capped by maxUp)
  const legacy = pillarTarget({ feetY: 41, targetY: climbTargetY({ entryY: 44, targetY: null }) })
  assert.equal(legacy.levels, 3, 'the legacy shape byte for byte')
  const raised = pillarTarget({ feetY: 41, targetY: climbTargetY({ entryY: 44, targetY: 80 }), maxUp: 80 })
  assert.equal(raised.levels, 39, 'the raised plan takes the whole vertical')
  assert.equal(raised.targetY, 80)
})

test('wiring: the vertical doom gate rides the fleet sources (fleet19.mjs pins)', () => {
  const src = fs.readFileSync(new URL('../../testbed/fleet19.mjs', import.meta.url), 'utf8')
  assert.match(src, /verticalDoomPlan/, 'the pure gate is imported and consulted')
  assert.match(src, /the climb raises its target to the yard's level/, 'the mid-run trip names the raised climb')
  assert.match(src, /the walk ladder cannot climb, the pocket rides the next window/, 'the doomed walk skip names the ride')
  assert.match(src, /climbing toward the yard's level \(the walk ladder cannot\)/, 'the final climb names the doom handover')
  assert.match(src, /targetY: finalDoom\.doom \? yardGoal\.y : null/, 'both final climb attempts raise the target')
  assert.match(src, /!doomAtWalk\.doom/, 'the walk loop refuses to enter a doomed vertical')
})

// ------------------------------------------------ v0.159.0 THE WET-BAND LADDER
// Run15 (36063283715, the v0.157.0/v0.158.0 fleet) decoded the final-bank
// killer: the staircases WORK (F13 dug=48, +24 levels) and stall IN THE
// SURFACE WATER BAND (y=59-67) - the legacy shape spent the stage ladder's
// wetAttempts (2) on ESCAPES THAT MOVED THE BOT (F12: '2 blocks walked' then
// '5 blocks walked' - real progress, counted as walls). 12/19 final banks
// died 'still underground after 2 climb attempts'. The cure: an escape that
// walked feeds its own ladder; only a sealed pocket consumes the sealed one.
test('wetEscapeGate: the union gate - sealed room first, then the walked ladder, then the honest stop', () => {
  // the sealed ladder owns the first wetAttempts attempts (the stage shape)
  assert.deepEqual(wetEscapeGate({ wetTries: 0, wetAttempts: 2, wetWalks: 0 }),
    { escape: true, why: 'sealed-escape room (0/2)' })
  assert.equal(wetEscapeGate({ wetTries: 1, wetAttempts: 2, wetWalks: 0 }).escape, true)
  // the sealed ladder is spent: the walked ladder answers instead (THE cure)
  assert.deepEqual(wetEscapeGate({ wetTries: 2, wetAttempts: 2, wetWalks: 0 }),
    { escape: true, why: 'walked-escape room (0/4)' }, 'the walked ladder is the new room - the run15 stall class')
  assert.equal(wetEscapeGate({ wetTries: 2, wetAttempts: 2, wetWalks: 3 }).escape, true)
  // both spent: the honest stop (the climb ends, the fences own the rest)
  assert.deepEqual(wetEscapeGate({ wetTries: 2, wetAttempts: 2, wetWalks: 4 }),
    { escape: false, why: 'the wet ladder is spent (sealed 2/2, walked 4/4)' })
  assert.equal(wetEscapeGate({ wetTries: 5, wetAttempts: 2, wetWalks: 9 }).escape, false)
})

test('wetEscapeGate: junk shapes read as the legacy budget (byte-safe defaults)', () => {
  assert.equal(wetEscapeGate({}).escape, true, 'fresh climb: room exists')
  assert.equal(wetEscapeGate({ wetTries: NaN, wetWalks: NaN, wetAttempts: NaN, ceiling: NaN }).escape, true, 'junk reads as zero spent, positive budgets')
  assert.equal(wetEscapeGate({ wetTries: -3, wetWalks: -2, wetAttempts: 2, ceiling: 4 }).escape, true, 'negative counters clamp to 0')
  assert.equal(wetEscapeGate({ wetTries: 2, wetAttempts: 0, wetWalks: 4, ceiling: 0 }).escape, false, 'junk budgets fall back to the constants - both spent is both spent')
})

test('wetEscapeAccount: walked escapes feed the walked ladder, sealed ones the stage ladder (the counter split)', () => {
  // F12's field shape: a gallery that MOVED the bot is progress, not a wall
  assert.deepEqual(wetEscapeAccount({ walked: 2, wetTries: 0, wetWalks: 0 }),
    { wetTries: 0, wetWalks: 1, sealed: false })
  assert.deepEqual(wetEscapeAccount({ walked: 5, wetTries: 0, wetWalks: 1 }),
    { wetTries: 0, wetWalks: 2, sealed: false }, 'the sealed budget SURVIVES a walked escape')
  // a sealed pocket (walked=0) consumes exactly as the legacy shape did
  assert.deepEqual(wetEscapeAccount({ walked: 0, wetTries: 1, wetWalks: 0 }),
    { wetTries: 2, wetWalks: 0, sealed: true })
  assert.deepEqual(wetEscapeAccount({ walked: -1, wetTries: 0, wetWalks: 2 }),
    { wetTries: 1, wetWalks: 2, sealed: true }, 'junk/negative walked reads as sealed')
  assert.deepEqual(wetEscapeAccount({}), { wetTries: 1, wetWalks: 0, sealed: true })
})

test('wiring: the wet ladder rides the climb source (miner.mjs pins)', () => {
  const src = fs.readFileSync(new URL('../../src/bots/miner.mjs', import.meta.url), 'utf8')
  assert.match(src, /wetEscapeGate\(\{ wetTries, wetAttempts, wetWalks \}\)/, 'the gate is consulted per wet block')
  assert.match(src, /wetEscapeAccount\(\{ walked: esc\.walked, wetTries, wetWalks \}\)/, 'the account classifies the finished escape')
  assert.match(src, /let wetWalks = 0/, 'the walked counter lives beside wetTries')
  assert.match(src, /WET_ESCAPE_WALK_CEILING/, 'the ceiling bounds the walked class')
})

// --------------------------------------------- v0.159.0 THE CHEST VERTICAL GATE
// Run15: the smelt leg's yard walks ran from DEEP bots (F4 y=43, the yard
// hill y=82 - dy 39 over 5b lateral) and burned the thin leg clock on 4-5
// guaranteed refusals per ask while smelted=0. The same strict arithmetic the
// bank climbs have gated since v0.158.0 now answers before the walk starts.
test('chestVerticalDoom: the run15 anatomy dooms the walk, the walkable band and hillside stay legacy', () => {
  // F4's exact shape: bot y=43, chest y=82, lateral 5.4
  const doom = chestVerticalDoom({ botPos: { x: -101, y: 43, z: 425 }, chestPos: { x: -103, y: 82, z: 420 } })
  assert.equal(doom.doom, true, 'the yard hill over a deep bot is the doomed vertical')
  assert.match(doom.why, /39 levels up over 5b lateral/)
  // F12's shape: y=64 vs 82 = dy 18 - inside the walkable band, the walk keeps its try
  assert.equal(chestVerticalDoom({ botPos: { x: -132, y: 64, z: 414 }, chestPos: { x: -133, y: 82, z: 414 } }).doom, false,
    '18 levels up is the walkable band (the strict minDy holds)')
  // the hillside: lateral >= dy stays the legacy ladder (the strict shape)
  assert.equal(chestVerticalDoom({ botPos: { x: 0, y: 60, z: 0 }, chestPos: { x: 30, y: 80, z: 0 } }).doom, false,
    '30 lateral over 20 up may route - no doom')
  // the chest at/below the bot: never doom
  assert.equal(chestVerticalDoom({ botPos: { x: 0, y: 82, z: 0 }, chestPos: { x: 2, y: 64, z: 2 } }).doom, false)
})

test('chestVerticalDoom: the junk family reads as no doom - the legacy walk attempt runs byte for byte', () => {
  for (const junk of [null, undefined]) {
    assert.equal(chestVerticalDoom({ botPos: junk, chestPos: { x: 0, y: 82, z: 0 } }).doom, false)
    assert.equal(chestVerticalDoom({ botPos: { x: 0, y: 24, z: 0 }, chestPos: junk }).doom, false)
  }
  assert.equal(chestVerticalDoom({ botPos: { x: 0, y: NaN, z: 0 }, chestPos: { x: 0, y: 82, z: 0 } }).doom, false, 'junk y reads as no vertical read')
  assert.equal(chestVerticalDoom({}).doom, false)
})

test('wiring: the vertical gate rides the four yard walk sources (the fuelbank + toolupgrade pins)', () => {
  const bankSrc = fs.readFileSync(new URL('../../src/lib/fuelbank.mjs', import.meta.url), 'utf8')
  const toolSrc = fs.readFileSync(new URL('../../src/lib/toolupgrade.mjs', import.meta.url), 'utf8')
  assert.match(bankSrc, /import \{ chestVerticalDoom(, VERTICAL_DOOM_MIN_DY)? \} from '\.\/surface\.mjs'/, 'the doom band stays the surface law\'s own export (the v0.504.0 climb fund reuses it, no duplicated constant)')
  assert.match(bankSrc, /chestVerticalDoom\(\{ botPos: bot\?\.entity\?\.position \?\? null, chestPos: chest\.position \}\)/, 'the commons gate reads the live positions')
  assert.match(bankSrc, /the walk ladder cannot climb, the ask rides \(the tithe owns the deep resupply\)/, 'the commons skip names the ride')
  assert.match(bankSrc, /the vertical gate: \$\{doom\.why\} - the walk ladder cannot climb/, 'the tithe skip names its why')
  assert.match(toolSrc, /import \{ chestVerticalDoom \} from '\.\/surface\.mjs'/)
  assert.match(toolSrc, /the walk ladder cannot climb, the fragments ride/, 'the commune skip names the ride')
  assert.match(toolSrc, /the walk ladder cannot climb, the seed rides/, 'the seed skip names the ride')
})

// ---------------------------------------------------------------------------
// (v0.165.0) THE BRIDGE STEP - the support-less surface band, filled with the
// pocket's own cobble. run77 (36080097477, the honest 600s) measured the
// class: 42 'blocked toward X (dug=0)' diag lines with NO cell named at
// y=63-66 - the step cells are CLEAR, only the SUPPORT check refused (the
// neighbour floor is a hole or open water) - and 10 of 19 final banks died
// 'still underground' with 3072u riding in pockets (banked 128 vs the 1718
// record). run74 (36082849774, the v0.164.0 fleet) confirmed x13. bridgePlan
// is the pure gate the climbOut wiring executes: the step path clear + the
// support non-solid + a placeable pocket = fill the missing floor.
import { bridgePlan, BRIDGE_PLACE_MAX, BRIDGE_SELF_WALL_DIRS, pitDonor, PIT_DONOR_MAX, PIT_DONOR_DIRT, PIT_DONOR_STONE, PLANT_CLEAR_FAMILY, PLANT_CLEAR_MAX, fillCollidesEntity, SHADOW_EPSILON } from '../../src/lib/surface.mjs'

const cell = (x, y, z) => ({
  x, y, z,
  offset: (dx, dy, dz) => cell(x + dx, y + dy, z + dz)
})
const blk = (name, boundingBox) => ({ name, boundingBox })
const AIR = blk('air', 'empty')
const WATER = blk('water', 'fluid')
const STONE = blk('stone', 'block')
const DIRT = blk('dirt', 'block')
const GRASS = blk('grass_block', 'block')
const COBBLE_ITEM = { name: 'cobblestone', count: 64 }
const POCKET = [COBBLE_ITEM]
const PICK_ITEM = { name: 'iron_pickaxe', count: 1 }
const PICK_POCKET = [PICK_ITEM]
// a world map keyed 'x,y,z'; unreadable cells (absent) read null
const cellWorld = cells => {
  const map = new Map(Object.entries(cells))
  return c => map.get(`${c.x},${c.y},${c.z}`) ?? null
}
const D = { x: 1, z: 0 }

test('BRIDGE_PLACE_MAX: the per-climb fill budget is pinned', () => {
  assert.equal(BRIDGE_PLACE_MAX, 8)
})

test('bridgePlan: the support case - the pit floor is solid, fill the support cell against its UP face', () => {
  // feet at (10,64,20) standing on stone; ahead the support cell is AIR but the
  // pit floor under it is solid - one fill completes the step
  const read = cellWorld({
    '10,63,20': STONE, // ownFloor
    '11,65,20': AIR, '11,66,20': AIR, // the step cells - clear (dug=0)
    '11,64,20': AIR, // the support - NOT solid
    '11,63,20': STONE // the pit floor - solid
  })
  const p = bridgePlan({ feet: cell(10, 64, 20), d: D, read, items: POCKET })
  assert.equal(p.ok, true)
  assert.equal(p.kind, 'support')
  assert.deepEqual({ x: p.cell.x, y: p.cell.y, z: p.cell.z }, { x: 11, y: 64, z: 20 }, 'the fill goes into the support cell')
  assert.deepEqual({ x: p.refCell.x, y: p.refCell.y, z: p.refCell.z }, { x: 11, y: 63, z: 20 }, 'the reference is the solid pit floor')
  assert.deepEqual(p.face, { x: 0, y: 1, z: 0 }, 'placed against the UP face')
  assert.equal(p.item.name, 'cobblestone')
  assert.equal(p.placedNext, 1)
})

test('bridgePlan: the pit case - the pit is open, fill the pit level against the bot floor side', () => {
  const read = cellWorld({
    '10,63,20': STONE, // ownFloor (the bot stands on it)
    '11,65,20': AIR, '11,66,20': AIR, // the step cells clear
    '11,64,20': AIR, // the support - air
    '11,63,20': AIR // the pit - open all the way down
  })
  const p = bridgePlan({ feet: cell(10, 64, 20), d: D, read, items: POCKET })
  assert.equal(p.ok, true)
  assert.equal(p.kind, 'pit')
  assert.deepEqual({ x: p.cell.x, y: p.cell.y, z: p.cell.z }, { x: 11, y: 63, z: 20 }, 'the fill goes into the pit level')
  assert.deepEqual({ x: p.refCell.x, y: p.refCell.y, z: p.refCell.z }, { x: 10, y: 63, z: 20 }, 'the reference is the bot OWN solid floor')
  assert.deepEqual(p.face, { x: 1, y: 0, z: 0 }, 'placed against the floor side face toward d')
})

test('bridgePlan: the lake case - a water support and a water pit still bridge (water is replaceable)', () => {
  const read = cellWorld({
    '10,63,20': STONE,
    '11,65,20': AIR, '11,66,20': AIR,
    '11,64,20': WATER, // the support reads fluid - non-solid
    '11,63,20': WATER // the pit reads fluid too
  })
  const p = bridgePlan({ feet: cell(10, 64, 20), d: D, read, items: POCKET })
  assert.equal(p.ok, true, 'a water support is the same support-less class (the run77 y=63-66 band)')
  assert.equal(p.kind, 'pit', 'the fluid pit fills first, the next iteration re-judges into the support case')
  assert.deepEqual({ x: p.cell.x, y: p.cell.y, z: p.cell.z }, { x: 11, y: 63, z: 20 })
})

test('bridgePlan: a SOLID support is not the class (the dig/step ladder owns it)', () => {
  const read = cellWorld({
    '10,63,20': STONE,
    '11,65,20': AIR, '11,66,20': AIR,
    '11,64,20': STONE // support solid - the step should have proceeded
  })
  const p = bridgePlan({ feet: cell(10, 64, 20), d: D, read, items: POCKET })
  assert.equal(p.ok, false)
  assert.match(p.why, /support is already solid/)
})

test('bridgePlan: a solid STEP cell refuses - a dig refusal is never bridged over', () => {
  const read = cellWorld({
    '10,63,20': STONE,
    '11,65,20': STONE, // the step cell is solid - stepDigPlan would dig it
    '11,66,20': AIR,
    '11,64,20': AIR,
    '11,63,20': STONE
  })
  const p = bridgePlan({ feet: cell(10, 64, 20), d: D, read, items: POCKET })
  assert.equal(p.ok, false)
  assert.match(p.why, /the step cells are not clear/)
})

test('bridgePlan: a wet step cell refuses - the wet-escape ladder owns the water column', () => {
  const read = cellWorld({
    '10,63,20': STONE,
    '11,65,20': WATER, // the step cell is water - blockedWet territory
    '11,66,20': AIR,
    '11,64,20': AIR,
    '11,63,20': STONE
  })
  const p = bridgePlan({ feet: cell(10, 64, 20), d: D, read, items: POCKET })
  assert.equal(p.ok, false)
  assert.match(p.why, /the step cells are not clear/)
})

test('bridgePlan: an empty pocket cannot bridge (the legacy rotate ladder owns the level)', () => {
  const read = cellWorld({
    '10,63,20': STONE,
    '11,65,20': AIR, '11,66,20': AIR,
    '11,64,20': AIR,
    '11,63,20': STONE
  })
  const p = bridgePlan({ feet: cell(10, 64, 20), d: D, read, items: [] })
  assert.equal(p.ok, false)
  assert.match(p.why, /no placeable block/)
  assert.equal(bridgePlan({ feet: cell(10, 64, 20), d: D, read, items: null }).ok, false)
  // junk counts in the pocket read as nothing (pickPillarBlock's own junk gate)
  assert.equal(bridgePlan({ feet: cell(10, 64, 20), d: D, read, items: [{ name: 'cobblestone', count: 0 }] }).ok, false)
})

test('bridgePlan: the budget is spent - the fills stop at BRIDGE_PLACE_MAX per climb', () => {
  const read = cellWorld({
    '10,63,20': STONE,
    '11,65,20': AIR, '11,66,20': AIR,
    '11,64,20': AIR,
    '11,63,20': STONE
  })
  const p = bridgePlan({ feet: cell(10, 64, 20), d: D, read, items: POCKET, placed: BRIDGE_PLACE_MAX })
  assert.equal(p.ok, false)
  assert.match(p.why, /the bridge budget is spent \(8\/8\)/)
  // a junk placed read floors to 0 - the budget starts fresh, never refuses early
  assert.equal(bridgePlan({ feet: cell(10, 64, 20), d: D, read, items: POCKET, placed: NaN }).ok, true)
  assert.equal(bridgePlan({ feet: cell(10, 64, 20), d: D, read, items: POCKET, placed: -3 }).ok, true)
})

test('BRIDGE_SELF_WALL_DIRS: the self fill\'s wall probe order is pinned', () => {
  assert.deepEqual(BRIDGE_SELF_WALL_DIRS, [[1, 0], [-1, 0], [0, 1], [0, -1]])
})

test('bridgePlan: the support-under-self fill - the bot over its own hole fills its own floor (the v0.608.0 book\'s priced cure)', () => {
  // feet at (10,64,20); ownFloor (10,63,20) reads AIR (the bot stands over its
  // own hole - the face-37188370162 floor class) but the hole's wall at +x
  // reads stone. The v0.165.0 law refused here; the v0.610.0 cure fills the
  // SELF floor cell against the wall's side face (the pit fill's own shape
  // mirrored) - the step re-judges on the next loop with solid ground.
  const read = cellWorld({
    '10,63,20': AIR, // ownFloor - the hole the bot stands over
    '11,63,20': STONE, // the hole's wall at +x (first probe) - the reference
    '11,65,20': AIR, '11,66,20': AIR,
    '11,64,20': AIR
  })
  const p = bridgePlan({ feet: cell(10, 64, 20), d: D, read, items: POCKET })
  assert.equal(p.ok, true, 'the floor class converts to a fill, not a refusal')
  assert.equal(p.kind, 'self')
  assert.deepEqual({ x: p.cell.x, y: p.cell.y, z: p.cell.z }, { x: 10, y: 63, z: 20 }, 'the fill goes into the SELF floor cell')
  assert.deepEqual({ x: p.refCell.x, y: p.refCell.y, z: p.refCell.z }, { x: 11, y: 63, z: 20 }, 'the reference is the hole\'s wall')
  assert.deepEqual(p.face, { x: -1, y: 0, z: 0 }, 'placed against the wall\'s face pointing back into the self cell')
  assert.equal(p.item.name, 'cobblestone')
  assert.equal(p.placedNext, 1)
})

test('bridgePlan: the open void keeps the legacy refusal byte for byte (no wall, no fill)', () => {
  // the hole's every horizontal neighbour reads air/fluid/null - nothing to
  // place against: the truly airborne bot stays the rotate ladder's (the
  // legacy refusal byte for byte - the cure cannot fill against void)
  const read = cellWorld({
    '10,63,20': AIR, // ownFloor
    '11,63,20': AIR, '9,63,20': AIR, '10,63,21': WATER, '10,63,19': AIR,
    '11,65,20': AIR, '11,66,20': AIR,
    '11,64,20': AIR
  })
  const p = bridgePlan({ feet: cell(10, 64, 20), d: D, read, items: POCKET })
  assert.equal(p.ok, false)
  assert.match(p.why, /^no solid floor underfoot$/)
})

test('bridgePlan: the flooded self cell fills too (water is replaceable - the lake precedent)', () => {
  const read = cellWorld({
    '10,63,20': WATER, // ownFloor reads fluid - the flooded hole
    '11,63,20': STONE,
    '11,65,20': AIR, '11,66,20': AIR,
    '11,64,20': WATER
  })
  const p = bridgePlan({ feet: cell(10, 64, 20), d: D, read, items: POCKET })
  assert.equal(p.ok, true)
  assert.equal(p.kind, 'self')
  assert.deepEqual({ x: p.cell.x, y: p.cell.y, z: p.cell.z }, { x: 10, y: 63, z: 20 })
})

test('bridgePlan: the self fill rides the pocket and budget gates byte for byte', () => {
  const read = cellWorld({
    '10,63,20': AIR, '11,63,20': STONE,
    '11,65,20': AIR, '11,66,20': AIR, '11,64,20': AIR
  })
  const p0 = bridgePlan({ feet: cell(10, 64, 20), d: D, read, items: [] })
  assert.equal(p0.ok, false)
  assert.match(p0.why, /no placeable block/)
  const p8 = bridgePlan({ feet: cell(10, 64, 20), d: D, read, items: POCKET, placed: BRIDGE_PLACE_MAX })
  assert.equal(p8.ok, false)
  assert.match(p8.why, /the bridge budget is spent \(8\/8\)/)
})

test('bridgePlan: the wall probe order is deterministic - +x wins, the face points back', () => {
  const read = cellWorld({
    '10,63,20': AIR,
    '11,63,20': STONE, '9,63,20': STONE, '10,63,21': STONE,
    '11,65,20': AIR, '11,66,20': AIR, '11,64,20': AIR
  })
  const p = bridgePlan({ feet: cell(10, 64, 20), d: D, read, items: POCKET })
  assert.equal(p.kind, 'self')
  assert.deepEqual({ x: p.refCell.x, y: p.refCell.y, z: p.refCell.z }, { x: 11, y: 63, z: 20 }, '+x is the first probe')
  assert.deepEqual(p.face, { x: -1, y: 0, z: 0 })
})

// (v0.618.0) THE UNDERFOOT GATE - fleet 37200930827 priced the self fill's own
// timing: the target sits DIRECTLY BELOW the feet, so a falling bot's AABB
// dips into the target cell by packet time (the server keeps the block for
// entity collision). The live split: self 9 of 22 (41%) vs support 30 of 40
// (75%) - the gap is the fall; the cell grain (23 distinct, 0 repeats) says
// the bias is positional, not a doomed cell. grounded:false -> the waitGround
// verdict; the caller lands, re-plans from the grounded feet, then fills.
test('bridgePlan: the underfoot gate - an ungrounded bot waits instead of filling the cell its AABB dips into', () => {
  const read = cellWorld({
    '10,63,20': AIR, // ownFloor - the hole the bot falls over
    '11,63,20': STONE, // the wall reads solid - the fill WOULD be planned
    '11,65,20': AIR, '11,66,20': AIR,
    '11,64,20': AIR
  })
  const p = bridgePlan({ feet: cell(10, 64, 20), d: D, read, items: POCKET, grounded: false })
  assert.deepEqual(p, {
    ok: false, waitGround: true,
    why: 'the self fill waits for ground (the falling AABB dips into the target cell)'
  }, 'the waitGround verdict rides before the wall probe - the packet is never sent while falling')
  // the flooded hole gates too (the fluid self cell collides the same way)
  const wet = cellWorld({
    '10,63,20': WATER, '11,63,20': STONE,
    '11,65,20': AIR, '11,66,20': AIR, '11,64,20': WATER
  })
  const pw = bridgePlan({ feet: cell(10, 64, 20), d: D, read: wet, items: POCKET, grounded: false })
  assert.equal(pw.waitGround, true)
  assert.equal(pw.ok, false)
})

test('bridgePlan: the underfoot gate is byte for byte the legacy plan when grounded - default and explicit true', () => {
  const read = cellWorld({
    '10,63,20': AIR,
    '11,63,20': STONE,
    '11,65,20': AIR, '11,66,20': AIR,
    '11,64,20': AIR
  })
  const pDefault = bridgePlan({ feet: cell(10, 64, 20), d: D, read, items: POCKET })
  const pTrue = bridgePlan({ feet: cell(10, 64, 20), d: D, read, items: POCKET, grounded: true })
  assert.equal(pDefault.ok, true, 'no grounded param - the legacy self fill fires byte for byte')
  assert.equal(pTrue.ok, true, 'explicit grounded:true - the same plan')
  assert.equal(pDefault.kind, 'self')
  assert.equal(pTrue.kind, 'self')
  assert.deepEqual({ x: pTrue.cell.x, y: pTrue.cell.y, z: pTrue.cell.z }, { x: 10, y: 63, z: 20 })
  assert.equal('waitGround' in pDefault, false)
  assert.equal('waitGround' in pTrue, false)
})

test('bridgePlan: the underfoot gate lives only on the self branch - the lateral fills ride a falling bot untouched', () => {
  // solid ownFloor + grounded:false -> the support plan returns byte for byte
  // (the support/pit targets are lateral, never underfoot - the fall cannot
  // collide with them)
  const read = cellWorld({
    '10,63,20': STONE,
    '11,65,20': AIR, '11,66,20': AIR,
    '11,64,20': AIR,
    '11,63,20': STONE
  })
  const p = bridgePlan({ feet: cell(10, 64, 20), d: D, read, items: POCKET, grounded: false })
  assert.equal(p.ok, true)
  assert.equal(p.kind, 'support')
  assert.deepEqual(p.face, { x: 0, y: 1, z: 0 })
  assert.equal('waitGround' in p, false)
  // an unreadable self cell + grounded:false -> the legacy refusal stands
  // (no fill was coming; the chunk-desync class stays the rotate ladder's)
  const blind = cellWorld({
    '11,63,20': STONE,
    '11,65,20': AIR, '11,66,20': AIR, '11,64,20': AIR
  })
  const pb = bridgePlan({ feet: cell(10, 64, 20), d: D, read: blind, items: POCKET, grounded: false })
  assert.equal(pb.ok, false)
  assert.match(pb.why, /^no solid floor underfoot$/)
  assert.equal('waitGround' in pb, false)
})

test('bridgePlan: the underfoot gate rides after the pocket and budget gates (the gate order holds)', () => {
  const read = cellWorld({
    '10,63,20': AIR, '11,63,20': STONE,
    '11,65,20': AIR, '11,66,20': AIR, '11,64,20': AIR
  })
  const pPocket = bridgePlan({ feet: cell(10, 64, 20), d: D, read, items: [], grounded: false })
  assert.equal(pPocket.ok, false)
  assert.match(pPocket.why, /no placeable block/)
  assert.equal('waitGround' in pPocket, false, 'the empty pocket refuses before the gate speaks')
  const pBudget = bridgePlan({ feet: cell(10, 64, 20), d: D, read, items: POCKET, placed: BRIDGE_PLACE_MAX, grounded: false })
  assert.equal(pBudget.ok, false)
  assert.match(pBudget.why, /the bridge budget is spent \(8\/8\)/)
  assert.equal('waitGround' in pBudget, false, 'the spent budget refuses before the gate speaks')
})

// (v0.621.0) THE PIT DONOR - the pocket class's own cure, priced by fleet
// 37205134738: 113 of 117 bridge refusals read 'no placeable block in the
// pocket' (97%) while the bot stands IN THE PIT IT DUG. The empty pocket no
// longer refuses while the matrix can donate: ONE lateral cell at feet level
// (never the step bearing) digs, the drop auto-collects, the loop re-judges
// into the fill. The drop guarantee is the law: dirt-family bare-handed,
// stone-family only with a pick (the granite lesson: a bare hand needs 150
// ticks on stone and drops NOTHING).
test('pitDonor: the probe is deterministic - the first solid non-step lateral wins, the step bearing is excluded', () => {
  assert.deepEqual(PIT_DONOR_DIRT, ['dirt', 'grass_block'])
  assert.deepEqual(PIT_DONOR_STONE, ['stone', 'cobblestone', 'andesite', 'diorite', 'granite', 'cobbled_deepslate', 'tuff', 'netherrack'])
  assert.equal(PIT_DONOR_MAX, 2)
  // feet at (10,64,20), d = +x: the step bearing (+x) reads solid but MUST
  // never donate (digging it eats the support the climb builds toward); -x
  // reads stone and wins as the first non-step probe
  const read = cellWorld({
    '11,64,20': STONE, // the step bearing - excluded
    '9,64,20': STONE // -x - the first non-step probe
  })
  const p = pitDonor({ feet: cell(10, 64, 20), d: D, read, items: PICK_POCKET })
  assert.ok(p, 'the matrix donates')
  assert.deepEqual({ x: p.cell.x, y: p.cell.y, z: p.cell.z }, { x: 9, y: 64, z: 20 })
  assert.equal(p.name, 'stone')
})

test('pitDonor: the drop guarantee is the law - stone-family needs a pick, dirt-family never does', () => {
  const stoneWorld = cellWorld({ '9,64,20': STONE })
  assert.equal(pitDonor({ feet: cell(10, 64, 20), d: D, read: stoneWorld, items: [] }), null, 'no pick - the bare hand drops NOTHING on stone (the granite lesson)')
  assert.equal(pitDonor({ feet: cell(10, 64, 20), d: D, read: stoneWorld, items: [{ name: 'iron_pickaxe', count: 0 }] }), null, 'a junk count is no pick')
  assert.ok(pitDonor({ feet: cell(10, 64, 20), d: D, read: stoneWorld, items: PICK_POCKET }), 'a pick mines the stone-family matrix')
  const dirtWorld = cellWorld({ '9,64,20': DIRT })
  const pd = pitDonor({ feet: cell(10, 64, 20), d: D, read: dirtWorld, items: [] })
  assert.ok(pd, 'dirt drops bare-handed')
  assert.equal(pd.name, 'dirt')
  const grassWorld = cellWorld({ '10,64,19': GRASS })
  const pg = pitDonor({ feet: cell(10, 64, 20), d: { x: 1, z: 0 }, read: grassWorld, items: null })
  assert.ok(pg, 'grass_block drops dirt bare-handed (the -z probe)')
  assert.equal(pg.name, 'grass_block')
  const junk = cellWorld({ '9,64,20': WATER })
  assert.equal(pitDonor({ feet: cell(10, 64, 20), d: D, read: junk, items: PICK_POCKET }), null, 'a fluid cell donates nothing')
})

test('bridgePlan: the pit donor - the empty pocket converts to a dig verdict while the matrix holds', () => {
  // the pocket class's own face: the bot at the bridge step with NOTHING to
  // place, the shaft matrix beside at feet level. The verdict sends the
  // caller DIGGING (kind donor, item null, the fill budget untouched).
  const read = cellWorld({
    '10,63,20': STONE, // ownFloor solid - the support case's pocket face
    '11,63,20': STONE,
    '11,65,20': AIR, '11,66,20': AIR, '11,64,20': AIR,
    '9,64,20': DIRT // the -x donor
  })
  const p = bridgePlan({ feet: cell(10, 64, 20), d: D, read, items: [] })
  assert.deepEqual(p, {
    ok: true, kind: 'donor',
    cell: p.cell, donorName: 'dirt', item: null, placedNext: 0
  }, 'the donor rides before the legacy pocket refusal')
  assert.deepEqual({ x: p.cell.x, y: p.cell.y, z: p.cell.z }, { x: 9, y: 64, z: 20 })
  // the legacy byte stands when the matrix cannot donate: no pick, stone only
  const stoneOnly = cellWorld({
    '10,63,20': STONE, '11,63,20': STONE,
    '11,65,20': AIR, '11,66,20': AIR, '11,64,20': AIR,
    '9,64,20': STONE
  })
  const pl = bridgePlan({ feet: cell(10, 64, 20), d: D, read: stoneOnly, items: [] })
  assert.equal(pl.ok, false)
  assert.match(pl.why, /^no placeable block in the pocket$/)
  assert.equal('kind' in pl, false)
})

test('bridgePlan: the pit donor rides the gates - falling bots dig nothing, the cap ends the donation, the budget stays first', () => {
  const read = cellWorld({
    '10,63,20': STONE, '11,63,20': STONE,
    '11,65,20': AIR, '11,66,20': AIR, '11,64,20': AIR,
    '9,64,20': DIRT
  })
  const falling = bridgePlan({ feet: cell(10, 64, 20), d: D, read, items: [], grounded: false })
  assert.equal(falling.ok, false)
  assert.match(falling.why, /^no placeable block in the pocket$/, 'a falling bot digs nothing new')
  const capped = bridgePlan({ feet: cell(10, 64, 20), d: D, read, items: [], donors: PIT_DONOR_MAX })
  assert.equal(capped.ok, false)
  assert.match(capped.why, /^no placeable block in the pocket$/, 'the donor cap spent ends the donation')
  const oneLeft = bridgePlan({ feet: cell(10, 64, 20), d: D, read, items: [], donors: 1 })
  assert.equal(oneLeft.ok, true, 'one dig left in the cap still donates')
  const spent = bridgePlan({ feet: cell(10, 64, 20), d: D, read, items: [], placed: BRIDGE_PLACE_MAX })
  assert.equal(spent.ok, false)
  assert.match(spent.why, /the bridge budget is spent \(8\/8\)/, 'the fill budget stays the first gate')
})

// (v0.624.0) THE BELOW-FEET PROBE - the donor's own pit-maker, priced by
// fleet 37209388659 (the donor's first field flight): 0 donate lines against
// 6 legacy 'no placeable block in the pocket' refusals - the open-yard empty
// pocket has AIR at every lateral (the probe found nothing to dig); the
// diggable mass is the ground UNDER the bot. The probe rides LAST (every
// lateral byte holds) and the landing cell below it must read 'block' - one
// read covers the void and the lava floor (the bot must drop exactly ONE
// into its own pit, never past it).
test('pitDonor: the below-feet probe - the open-yard pit-maker rides LAST, the lateral bytes hold', () => {
  // the open yard: every lateral reads air, the ground underfoot is dirt
  const openYard = cellWorld({
    '11,64,20': AIR, '9,64,20': AIR, '10,64,21': AIR, '10,64,19': AIR,
    '10,63,20': DIRT, '10,62,20': STONE
  })
  const pb = pitDonor({ feet: cell(10, 64, 20), d: D, read: openYard, items: [] })
  assert.ok(pb, 'the ground underfoot donates bare-handed when the laterals are air')
  assert.deepEqual({ x: pb.cell.x, y: pb.cell.y, z: pb.cell.z }, { x: 10, y: 63, z: 20 }, 'the probe cell is the below-feet cell')
  assert.equal(pb.name, 'dirt')
  // the lateral byte holds: a diggable lateral wins BEFORE the below probe
  const lateralFirst = cellWorld({
    '11,64,20': AIR, '9,64,20': DIRT, '10,64,21': AIR, '10,64,19': AIR,
    '10,63,20': DIRT, '10,62,20': STONE
  })
  const pl = pitDonor({ feet: cell(10, 64, 20), d: D, read: lateralFirst, items: [] })
  assert.deepEqual({ x: pl.cell.x, y: pl.cell.y, z: pl.cell.z }, { x: 9, y: 64, z: 20 }, 'the lateral keeps its byte - the below probe is last')
  // the landing guard: the void (null) and the fluid both refuse the dig
  const voidBelow = cellWorld({
    '11,64,20': AIR, '9,64,20': AIR, '10,64,21': AIR, '10,64,19': AIR,
    '10,63,20': DIRT
  })
  assert.equal(pitDonor({ feet: cell(10, 64, 20), d: D, read: voidBelow, items: [] }), null, 'no landing read - the bot would fall PAST the pit')
  const lavaBelow = cellWorld({
    '11,64,20': AIR, '9,64,20': AIR, '10,64,21': AIR, '10,64,19': AIR,
    '10,63,20': DIRT, '10,62,20': WATER
  })
  assert.equal(pitDonor({ feet: cell(10, 64, 20), d: D, read: lavaBelow, items: [] }), null, 'a fluid landing refuses the dig (the lava-floor class)')
  // the drop guarantee holds below: stone needs the pick, dirt never does
  const stoneBelow = cellWorld({
    '11,64,20': AIR, '9,64,20': AIR, '10,64,21': AIR, '10,64,19': AIR,
    '10,63,20': STONE, '10,62,20': STONE
  })
  assert.equal(pitDonor({ feet: cell(10, 64, 20), d: D, read: stoneBelow, items: [] }), null, 'stone underfoot without a pick drops NOTHING (the granite lesson)')
  const ps = pitDonor({ feet: cell(10, 64, 20), d: D, read: stoneBelow, items: PICK_POCKET })
  assert.ok(ps, 'a pick mines the stone underfoot')
  assert.equal(ps.name, 'stone')
  // the below cell itself must be diggable BLOCK: a fluid underfoot donates nothing
  const fluidUnder = cellWorld({
    '11,64,20': AIR, '9,64,20': AIR, '10,64,21': AIR, '10,64,19': AIR,
    '10,63,20': WATER, '10,62,20': STONE
  })
  assert.equal(pitDonor({ feet: cell(10, 64, 20), d: D, read: fluidUnder, items: PICK_POCKET }), null, 'a fluid cell underfoot donates nothing')
})

test('bridgePlan: the below-feet donor converts the open-yard empty pocket - the landing guard keeps the legacy byte over the void and the fluid', () => {
  const openYard = cellWorld({
    '11,64,20': AIR, '9,64,20': AIR, '10,64,21': AIR, '10,64,19': AIR,
    '10,63,20': DIRT, '10,62,20': STONE
  })
  const p = bridgePlan({ feet: cell(10, 64, 20), d: D, read: openYard, items: [] })
  assert.deepEqual(p, {
    ok: true, kind: 'donor',
    cell: p.cell, donorName: 'dirt', item: null, placedNext: 0
  }, 'the open-yard empty pocket digs its own pit (the verdict rides the same donor form - the lens parses it unchanged)')
  assert.deepEqual({ x: p.cell.x, y: p.cell.y, z: p.cell.z }, { x: 10, y: 63, z: 20 })
  // the landing guard keeps the legacy byte: no landing read (the void) or a
  // fluid landing - the open yard honestly refuses, the ladder owns it
  const voidBelow = cellWorld({
    '11,64,20': AIR, '9,64,20': AIR, '10,64,21': AIR, '10,64,19': AIR,
    '10,63,20': DIRT
  })
  const pv = bridgePlan({ feet: cell(10, 64, 20), d: D, read: voidBelow, items: [] })
  assert.equal(pv.ok, false)
  assert.match(pv.why, /^no placeable block in the pocket$/, 'the void keeps the legacy byte')
  assert.equal('kind' in pv, false)
  const fluidLanding = cellWorld({
    '11,64,20': AIR, '9,64,20': AIR, '10,64,21': AIR, '10,64,19': AIR,
    '10,63,20': DIRT, '10,62,20': WATER
  })
  const pf = bridgePlan({ feet: cell(10, 64, 20), d: D, read: fluidLanding, items: [] })
  assert.equal(pf.ok, false)
  assert.match(pf.why, /^no placeable block in the pocket$/, 'the fluid landing keeps the legacy byte (the lava-floor class)')
  // the donor cap and the falling bot end the below donation exactly as the lateral's
  const capped = bridgePlan({ feet: cell(10, 64, 20), d: D, read: openYard, items: [], donors: PIT_DONOR_MAX })
  assert.equal(capped.ok, false)
  assert.match(capped.why, /^no placeable block in the pocket$/, 'the cap ends the below donation')
  const falling = bridgePlan({ feet: cell(10, 64, 20), d: D, read: openYard, items: [], grounded: false })
  assert.equal(falling.ok, false)
  assert.match(falling.why, /^no placeable block in the pocket$/, 'a falling bot digs nothing underfoot')
})

test('bridgePlan: an unreadable self cell never fills blind (the chunk-desync class)', () => {
  // a wall exists but the SELF cell read failed - the legacy refusal, never a blind fill
  const read = cellWorld({
    '11,63,20': STONE,
    '11,65,20': AIR, '11,66,20': AIR, '11,64,20': AIR
  })
  const p = bridgePlan({ feet: cell(10, 64, 20), d: D, read, items: POCKET })
  assert.equal(p.ok, false)
  assert.match(p.why, /^no solid floor underfoot$/)
})

test('bridgePlan: an unreadable neighbourhood refuses (the chunk-desync class never bridges blind)', () => {
  // ownFloor unreadable
  assert.equal(bridgePlan({ feet: cell(10, 64, 20), d: D, read: cellWorld({}), items: POCKET }).ok, false)
  // the step cells unreadable (the clear gate needs a POSITIVE empty read)
  const half = cellWorld({ '10,63,20': STONE, '11,64,20': AIR, '11,63,20': STONE })
  const p = bridgePlan({ feet: cell(10, 64, 20), d: D, read: half, items: POCKET })
  assert.equal(p.ok, false)
  assert.match(p.why, /the step cells are not clear/)
  // the pit floor unreadable (neither solid nor open) - no reference to place against
  const half2 = cellWorld({ '10,63,20': STONE, '11,65,20': AIR, '11,66,20': AIR, '11,64,20': AIR })
  const p2 = bridgePlan({ feet: cell(10, 64, 20), d: D, read: half2, items: POCKET })
  assert.equal(p2.ok, false)
  assert.match(p2.why, /the pit floor reads unknown/)
})

test('bridgePlan: junk geometry never throws (the junk doctrine)', () => {
  assert.equal(bridgePlan({}).ok, false)
  assert.equal(bridgePlan({ feet: null, d: D, read: () => STONE, items: POCKET }).ok, false)
  assert.equal(bridgePlan({ feet: cell(10, 64, 20), d: null, read: () => STONE, items: POCKET }).ok, false)
  assert.equal(bridgePlan({ feet: { x: 1, y: 1, z: 1 }, d: D, read: () => STONE, items: POCKET }).ok, false, 'a feet without .offset is junk telemetry')
  assert.equal(bridgePlan({ feet: cell(10, 64, 20), d: D, read: () => { throw new Error('chunk desync') }, items: POCKET }).ok, false)
  // a maxPlaced junk read falls back to the default cap
  const read = cellWorld({ '10,63,20': STONE, '11,65,20': AIR, '11,66,20': AIR, '11,64,20': AIR, '11,63,20': STONE })
  assert.equal(bridgePlan({ feet: cell(10, 64, 20), d: D, read, items: POCKET, maxPlaced: 0 }).ok, true, 'junk maxPlaced falls back to BRIDGE_PLACE_MAX')
})

// ---------------------------------------------------------------------------
// (v0.168.0) THE BRIDGE REFUSAL RETRY + FORENSICS. run78 (36091731878, the
// v0.167.0 union @ the honest 600s) measured the refusal class as TRANSIENT:
// 7 'server refused the (support|pit) fill' lines, 7 distinct cells (no
// repeats), 4/7 riding a pit fill placed the TICK before (the support fill's
// reference IS the just-placed block, one cell farther), and the F16 cell
// [-113,64,384] refused at ts~701s placed FINE on a later visit. bridgeFillLanded
// is the shared verify (the v0.76.0 item-leaves doctrine + the chunk read),
// bridgeRefusalDetail is the surviving refusal's forensics suffix (held /
// dist / ref / post - splitting reach refusals from stale references from
// genuine server refusals in the NEXT fleet's log).
import { bridgeFillLanded, bridgeRefusalDetail, BRIDGE_RECHECK_TICKS } from '../../src/lib/surface.mjs'

test('BRIDGE_RECHECK_TICKS: the recheck window is pinned (mirrors the climb dig stale recheck)', () => {
  assert.equal(BRIDGE_RECHECK_TICKS, 12)
})

test('bridgeFillLanded: a solid post read is a landed fill', () => {
  assert.equal(bridgeFillLanded({ postBlock: blk('cobblestone', 'block'), before: 64, after: 64 }), true)
})

test('bridgeFillLanded: the item left the pocket is the v0.76.0 truth (even with a stale chunk read)', () => {
  // the client world never applied the delta but the count dropped - LANDED
  assert.equal(bridgeFillLanded({ postBlock: blk('air', 'empty'), before: 64, after: 63 }), true)
  // a fresh chunk read with a full pocket would be a phantom without the count gate
  assert.equal(bridgeFillLanded({ postBlock: blk('air', 'empty'), before: 64, after: 64 }), false)
})

test('bridgeFillLanded: junk reads are a false, never a throw', () => {
  assert.equal(bridgeFillLanded({}), false)
  assert.equal(bridgeFillLanded({ postBlock: null, before: null, after: null }), false)
  assert.equal(bridgeFillLanded({ postBlock: { boundingBox: 42 }, before: NaN, after: 'junk' }), false)
  assert.equal(bridgeFillLanded({ postBlock: undefined, before: -Infinity, after: Infinity }), false)
  // a junk postBlock with honest counts still converts on the count gate
  assert.equal(bridgeFillLanded({ postBlock: 'junk', before: 10, after: 9 }), true)
})

test('bridgeRefusalDetail: the landed-late shape names the class', () => {
  const s = bridgeRefusalDetail({ heldName: 'cobblestone', dist: 4.83, refName: 'stone', postName: 'cobblestone', postLanded: true })
  assert.equal(s, 'held=cobblestone, 4.8b, ref=stone, post=cobblestone LANDED (late block update)')
})

test('bridgeRefusalDetail: the still-open shape names the genuine refusal', () => {
  const s = bridgeRefusalDetail({ heldName: 'cobblestone', dist: 5.21, refName: 'cobblestone', postName: 'air', postLanded: false })
  assert.equal(s, 'held=cobblestone, 5.2b, ref=cobblestone, post=air STILL OPEN (refused twice)')
})

test('bridgeRefusalDetail: a null reference read is the stale self-placed-reference signature', () => {
  const s = bridgeRefusalDetail({ heldName: 'cobblestone', dist: 4.1, refName: null, postName: 'air', postLanded: false })
  assert.match(s, /ref=null-read/)
})

test('bridgeRefusalDetail: junk inputs print placeholders instead of throwing', () => {
  assert.equal(bridgeRefusalDetail({}), 'held=n/a, d?, ref=null-read, post=? (re-read failed)')
  assert.equal(bridgeRefusalDetail({ heldName: '', dist: NaN, refName: 42, postName: null, postLanded: null }),
    'held=n/a, d?, ref=null-read, post=? (re-read failed)')
  // a true postLanded with a junk postName still names the landing
  assert.match(bridgeRefusalDetail({ postLanded: true, postName: '' }), /post=block LANDED/)
  // a false postLanded with a junk postName keeps the placeholder
  assert.match(bridgeRefusalDetail({ postLanded: false, postName: 7 }), /post=\? STILL OPEN/)
})

// (v0.636.0) THE REFERENCE RE-READ - the air-post class's discriminator. The
// class owns the refusal front (9 of 10 on the v0.632.0 face, 31 of 37 on the
// v0.634.0 face) and the face could not split the stale reference from the
// geometry/entity class; the opt-in ref-after field does, byte-safe.
test('bridgeRefusalDetail: the legacy form stays byte for byte without refAfterName', () => {
  // the F19-shaped v0.632.0 face line, verbatim
  assert.equal(bridgeRefusalDetail({ heldName: 'cobblestone', dist: 0.812, refName: 'grass_block', postName: 'air', postLanded: false }),
    'held=cobblestone, 0.8b, ref=grass_block, post=air STILL OPEN (refused twice)')
  assert.equal(bridgeRefusalDetail({ heldName: 'cobblestone', dist: 4.83, refName: 'stone', postName: 'cobblestone', postLanded: true }),
    'held=cobblestone, 4.8b, ref=stone, post=cobblestone LANDED (late block update)')
})

test('bridgeRefusalDetail: ref-after=air is the stale-reference signature (the client placed against a ghost)', () => {
  const s = bridgeRefusalDetail({ heldName: 'cobblestone', dist: 0.9, refName: 'grass_block', postName: 'air', postLanded: false, refAfterName: 'air' })
  assert.equal(s, 'held=cobblestone, 0.9b, ref=grass_block, post=air STILL OPEN (refused twice), ref-after=air')
})

test('bridgeRefusalDetail: ref-after=<same name> is the geometry/entity signature (the ref survived)', () => {
  // the self-fill shape races the bot's own box into the cell under the feet
  const s = bridgeRefusalDetail({ heldName: 'cobblestone', dist: 0.6, refName: 'stone', postName: 'air', postLanded: false, refAfterName: 'stone' })
  assert.equal(s, 'held=cobblestone, 0.6b, ref=stone, post=air STILL OPEN (refused twice), ref-after=stone')
  // a DIFFERENT name after is the correction caught mid-flight - the stale class too
  const t = bridgeRefusalDetail({ heldName: 'cobblestone', dist: 0.8, refName: 'grass_block', postName: 'air', postLanded: false, refAfterName: 'dirt' })
  assert.match(t, /, ref-after=dirt$/)
})

test('bridgeRefusalDetail: a failed ref re-read confesses null-read, junk stays safe', () => {
  assert.match(bridgeRefusalDetail({ heldName: 'dirt', dist: 1.2, refName: 'dirt', postName: 'air', postLanded: false, refAfterName: null }), /, ref-after=null-read$/)
  assert.match(bridgeRefusalDetail({ refAfterName: 42 }), /, ref-after=null-read$/)
  assert.match(bridgeRefusalDetail({ refAfterName: 'andesite' }), /, ref-after=andesite$/)
  // the legacy no-field call never grew the tail
  assert.ok(!bridgeRefusalDetail({}).includes('ref-after'))
})

// (v0.637.0) THE SELF PLANT CLEAR - the underfoot plant digs first. The
// v0.634.0 face named the hole: F1's self fill at [-87,68,407] refused twice
// on post=leaf_litter (ref=oak_log) - the family cleared the support/pit
// cells but the SELF kind never scanned its own target (the plant helpers
// lived below the self section's unconditional return). The F1-shaped face,
// the per-cell law, the scalar byte, the waitGround precedence, the family
// boundary.
test('bridgePlan: the self plant clear - the F1-shaped face digs the underfoot leaf_litter before the fill', () => {
  const LEAF = blk('leaf_litter', 'empty') // no collision - the plan reads the cell clear
  const read = cellWorld({
    '10,63,20': LEAF, // ownFloor - the plant the fill died into twice (F1's shape)
    '11,63,20': STONE // the wall the legacy fill would reference
  })
  const p = bridgePlan({ feet: cell(10, 64, 20), d: D, read, items: POCKET, plantClears: 0, plantClearCells: new Set() })
  assert.equal(p.ok, true)
  assert.equal(p.kind, 'plant-clear')
  assert.equal(p.fillKind, 'self')
  assert.equal(p.plantName, 'leaf_litter')
  assert.deepEqual({ x: p.cell.x, y: p.cell.y, z: p.cell.z }, { x: 10, y: 63, z: 20 })
  assert.equal(p.item, null)
  assert.equal(p.placedNext, 0)
})

test('bridgePlan: the self plant clear rides the per-cell law - the attempted cell falls through to the legacy self fill', () => {
  const LEAF = blk('leaf_litter', 'empty')
  const read = cellWorld({
    '10,63,20': LEAF,
    '11,63,20': STONE
  })
  const attempted = new Set(['10,63,20'])
  const p = bridgePlan({ feet: cell(10, 64, 20), d: D, read, items: POCKET, plantClears: 0, plantClearCells: attempted })
  assert.equal(p.kind, 'self', 'the attempted cell never re-rides - the wall loop and the honest refusal own the level')
  assert.deepEqual({ x: p.cell.x, y: p.cell.y, z: p.cell.z }, { x: 10, y: 63, z: 20 })
})

test('bridgePlan: the self plant clear keeps the legacy scalar byte - the no-set callers govern by the cap alone', () => {
  const LEAF = blk('leaf_litter', 'empty')
  const read = cellWorld({
    '10,63,20': LEAF,
    '11,63,20': STONE
  })
  const spent = bridgePlan({ feet: cell(10, 64, 20), d: D, read, items: POCKET, plantClears: PLANT_CLEAR_MAX, plantClearCells: null })
  assert.equal(spent.kind, 'self', 'no set + the spent scalar - the legacy byte, no clear')
  const open = bridgePlan({ feet: cell(10, 64, 20), d: D, read, items: POCKET, plantClears: 0, plantClearCells: null })
  assert.equal(open.kind, 'plant-clear', 'no set + the scalar open - the legacy cap semantics')
  assert.equal(open.fillKind, 'self')
})

test('bridgePlan: the waitGround gate precedes the self plant clear - a falling bot digs nothing', () => {
  const LEAF = blk('leaf_litter', 'empty')
  const read = cellWorld({
    '10,63,20': LEAF,
    '11,63,20': STONE
  })
  const p = bridgePlan({ feet: cell(10, 64, 20), d: D, read, items: POCKET, grounded: false, plantClears: 0, plantClearCells: new Set() })
  assert.deepEqual(p, {
    ok: false, waitGround: true,
    why: 'the self fill waits for ground (the falling AABB dips into the target cell)'
  })
})

test('bridgePlan: the self plant clear speaks only the family - a non-family plant keeps the legacy self fill', () => {
  const POPPY = blk('poppy', 'empty')
  const read = cellWorld({
    '10,63,20': POPPY,
    '11,63,20': STONE
  })
  const p = bridgePlan({ feet: cell(10, 64, 20), d: D, read, items: POCKET, plantClears: 0, plantClearCells: new Set() })
  assert.equal(p.kind, 'self', 'poppy is not the family - no clear, the legacy plan stands')
})

// (v0.638.0) THE SHADOW GATE - the entity-collision law's own pre-flight. The
// ref-after split decided the air-post class 7/7 for geometry/entity (every
// reference survived); the bot's own box leaning into the target cell is the
// one entity the bot always carries. The F12 lead-in, the self dip, the
// boundary kiss, the jump-over, the junk law.
test('fillCollidesEntity: the support lead-in - the box leaning into the target column defers, the cell center flies', () => {
  // the F12-shaped walk: feet near the +x edge of the feet cell, target beside
  assert.equal(fillCollidesEntity({ pos: { x: 10.8, y: 64, z: 20.5 }, cell: { x: 11, y: 64, z: 20 } }), true)
  assert.equal(fillCollidesEntity({ pos: { x: 10.5, y: 64, z: 20.5 }, cell: { x: 11, y: 64, z: 20 } }), false, 'the cell center never collides - the fill flies')
})

test('fillCollidesEntity: the self dip - the box dipped into the underfoot pit cell defers, the exact plane flies', () => {
  // the v0.618.0 falling class, grounded edition: the feet 0.3 BELOW the pit top
  assert.equal(fillCollidesEntity({ pos: { x: 10.5, y: 62.7, z: 20.5 }, cell: { x: 10, y: 62, z: 20 } }), true)
  // standing exactly ON the pit top plane - touch, no intersection, the packet flies
  assert.equal(fillCollidesEntity({ pos: { x: 10.5, y: 63, z: 20.5 }, cell: { x: 10, y: 62, z: 20 } }), false)
})

test('fillCollidesEntity: the boundary kiss never defers and a jump-over never defers', () => {
  // the lean is shallower than the epsilon - the packet flies as today
  assert.equal(fillCollidesEntity({ pos: { x: 10.72, y: 64, z: 20.5 }, cell: { x: 11, y: 64, z: 20 } }), false)
  // the bot well above the cell - no vertical overlap
  assert.equal(fillCollidesEntity({ pos: { x: 10.8, y: 66, z: 20.5 }, cell: { x: 11, y: 64, z: 20 } }), false)
  // the epsilon rides the export (the gate's own floor is pinned)
  assert.equal(SHADOW_EPSILON, 0.05)
})

test('fillCollidesEntity: junk geometry is a false, never a throw - the packet flies, the ladder owns it', () => {
  assert.equal(fillCollidesEntity({}), false)
  assert.equal(fillCollidesEntity({ pos: null, cell: { x: 1, y: 2, z: 3 } }), false)
  assert.equal(fillCollidesEntity({ pos: { x: NaN, y: 64, z: 20 }, cell: { x: 11, y: 64, z: 20 } }), false)
  assert.equal(fillCollidesEntity({ pos: { x: 10.5, y: 64, z: 20.5 }, cell: { x: 'junk', y: 64, z: 20 } }), false)
})

// (v0.300.0) THE WET-CEILING ASCEND - the climb's answer to the sealed water
// column. Face 36517770723: 17 climb deaths 'failed - stalled', every sampled
// diag 'blocked toward X (dug=0, wet) water (stop)' at EVERY bearing - the
// staircase stood in the flooded band with no horizontal answer. The gate
// budgets the vertical digs per climb (the rescue's v0.125.0 shape).
test('wetCeilingAscendGate: room while ascendDigs < budget, spent at the cap', () => {
  // fresh climb: the vertical answer is available
  assert.deepEqual(wetCeilingAscendGate({ ascendDigs: 0 }),
    { dig: true, why: `ascend room (0/${WET_CEILING_DIG_BUDGET})` })
  assert.equal(wetCeilingAscendGate({ ascendDigs: 2 }).dig, true)
  // the last room still digs
  assert.equal(wetCeilingAscendGate({ ascendDigs: WET_CEILING_DIG_BUDGET - 1 }).dig, true)
  // at the cap the climb ends honestly through the rotate ladder
  assert.deepEqual(wetCeilingAscendGate({ ascendDigs: WET_CEILING_DIG_BUDGET }),
    { dig: false, why: `ascend budget spent (${WET_CEILING_DIG_BUDGET}/${WET_CEILING_DIG_BUDGET})` })
  assert.equal(wetCeilingAscendGate({ ascendDigs: 9 }).dig, false)
})

test('wetCeilingAscendGate: a custom budget resizes the room (the pin keeps the shape)', () => {
  assert.equal(wetCeilingAscendGate({ ascendDigs: 4, budget: 6 }).dig, true)
  assert.equal(wetCeilingAscendGate({ ascendDigs: 6, budget: 6 }).dig, false)
  assert.equal(wetCeilingAscendGate({ ascendDigs: 0, budget: 1 }).dig, true)
  assert.equal(wetCeilingAscendGate({ ascendDigs: 1, budget: 1 }).dig, false)
})

test('wetCeilingAscendGate: junk reads never throw and never over-dig', () => {
  // junk ascendDigs reads 0 (a fresh climb) - the budget holds
  assert.equal(wetCeilingAscendGate({ ascendDigs: NaN }).dig, true)
  assert.equal(wetCeilingAscendGate({ ascendDigs: -3 }).dig, true)
  assert.equal(wetCeilingAscendGate({}).dig, true)
  // junk budget reads the constant, so a spent count over the constant refuses
  assert.equal(wetCeilingAscendGate({ ascendDigs: 4, budget: NaN }).dig, false)
  // the double-junk read (both Infinity) is a FRESH climb by the junk contract:
  // junk ascendDigs reads 0 AND junk budget reads the constant - the room holds
  assert.equal(wetCeilingAscendGate({ ascendDigs: Infinity, budget: Infinity }).dig, true)
  // a genuinely spent climb refuses even with junk text in the budget slot
  assert.equal(wetCeilingAscendGate({ ascendDigs: 12, budget: 'junk' }).dig, false)
  // fractional digs floor (3.7 spent = 3) - the 4th dig keeps its room
  assert.equal(wetCeilingAscendGate({ ascendDigs: 3.7 }).dig, true)
  assert.equal(wetCeilingAscendGate({ ascendDigs: 4.2 }).dig, false)
})

// (v0.300.0) THE WIRING PIN - the ascend rides INSIDE the blockedWet branch,
// after the wet-escape ladders and BEFORE the surface handoff: the escape
// classes keep their ladders byte for byte, the vertical digs only where the
// escapes left the pass standing wet.
test('WIRING PIN: the wet-ceiling ascend rides the blockedWet branch (v0.300.0)', () => {
  const minerSrc = fs.readFileSync(new URL('../../src/bots/miner.mjs', import.meta.url), 'utf8')
  assert.ok(minerSrc.includes('climb wet ascend: dug the ceiling'),
    'the ascend names its line (the same tag the fleet log filters)')
  assert.ok(/wetCeilingAscendGate,\s*WET_CEILING_DIG_BUDGET/.test(minerSrc),
    'the gate + the budget are imported (the wiring is live, not dead code)')
  const wetGateIdx = minerSrc.indexOf('const wetGate = wetEscapeGate({ wetTries, wetAttempts, wetWalks })')
  const escIdx = minerSrc.indexOf("if (esc.resumed) continue // fresh position - let the main loop re-judge")
  const ascIdx = minerSrc.indexOf('climb wet ascend: dug the ceiling')
  const handoffIdx = minerSrc.indexOf('(v0.37.0) SURFACE HANDOFF on the blocked path')
  assert.ok(wetGateIdx > 0, 'the wet-escape gate call exists')
  assert.ok(ascIdx > escIdx && escIdx > wetGateIdx, 'the ascend rides AFTER the escape ladders (inside the blockedWet branch)')
  assert.ok(ascIdx < handoffIdx, 'the ascend rides BEFORE the surface handoff (the dry path keeps its shape)')
  // the budget reads the CONSTANT (not a literal) and the dig falls through on failure
  assert.ok(minerSrc.includes('wetCeilingAscendGate({ ascendDigs: wetAscendDigs })'),
    'the gate consumes the per-climb counter')
  assert.ok(/catch \{ \/\* the dig lost the race: the rotate ladder owns it \*\/ \}/.test(minerSrc),
    'a lost dig falls through to the rotate ladder byte for byte')
})

// (v0.610.0) THE ALTITUDE-DEMAND GUARD - the plan-vs-ground disagreement's
// own edge. Mined face (fleet 37188370162): 'F1 chest ascent (upfront): the
// yard stands 15 levels up - funding the climb before the leg's walks' and
// 0.4ms later 'climbed +0 levels (dug 0, 0 steps) - the hop ladder is
// pre-funded'. The v0.23.0 walkable-surface probe answers 'am I stuck in a
// hole' (daylight + 2 walkable dirs) - and a quarry pit's floor is open sky -
// so the probe's yes handed a zero-gain landing to the deposit chain while
// the demanded yard still stood 15 levels up. The guard skips that verdict;
// the climb keeps its funded budgets toward the demand.
test('climbSurfaceShort: the F1 face - the yard 15 up, the pit floor open sky, gained 0 reads SHORT (the verdict must not fire)', () => {
  // feet 65 at plan time, the yard (targetY) 80 - the funded demand; the
  // instant handover read the bot still at 65 with nothing gained
  assert.equal(climbSurfaceShort({ targetY: 80, feetY: 65, gained: 0 }), true)
})

test('climbSurfaceShort: a PARTIAL rise reads SHORT (the v0.614.0 demand-closure law - the v0.609.0 rose-keeps exemption is gone)', () => {
  // the bot rose 3 of 15: the yard still stands 9 above - the handover is a
  // lie below the demand (fleet 37193219050: all three landings partial)
  assert.equal(climbSurfaceShort({ targetY: 80, feetY: 68, gained: 3 }), true)
  // a closure (the demand met within the one-level tolerance) keeps the
  // handover whatever the delta rode
  assert.equal(climbSurfaceShort({ targetY: 80, feetY: 80, gained: 15 }), false)
})

test('climbSurfaceShort: the mined partial faces byte-exact (fleet 37193219050, feet0 = 65)', () => {
  // F16 demanded 12 climbed +6 - the yard stands 6 above the 'pre-funded' walk
  assert.equal(climbSurfaceShort({ targetY: 65 + 12, feetY: 65 + 6, gained: 6 }), true)
  // F5 demanded 13 climbed +8 - the yard stands 5 above
  assert.equal(climbSurfaceShort({ targetY: 65 + 13, feetY: 65 + 8, gained: 8 }), true)
  // F10 demanded 9 climbed +1 - the yard stands 8 above (the biggest gap)
  assert.equal(climbSurfaceShort({ targetY: 65 + 9, feetY: 65 + 1, gained: 1 }), true)
})

test('climbSurfaceShort: a settled-back bot (negative gained) below the demand reads SHORT', () => {
  // gravity settled the bot one BELOW its start during the failed step
  assert.equal(climbSurfaceShort({ targetY: 80, feetY: 64, gained: -1 }), true)
})

test('climbSurfaceShort: the boundary - one level short is the verdict own ground, two is the lie', () => {
  // targetY - feetY > 1 is the guard's arithmetic; a bot within 1 of the
  // demand IS at the yard (the one-level step the walk ladder owns)
  assert.equal(climbSurfaceShort({ targetY: 80, feetY: 79, gained: 0 }), false)
  assert.equal(climbSurfaceShort({ targetY: 80, feetY: 78, gained: 0 }), true)
})

test('climbSurfaceShort: targetY null (every plain climb) keeps the legacy verdict - the v0.23.0/v0.37.0 faces byte for byte', () => {
  // the plain shaft-exit caller and the stale-entry raise (raised INSIDE
  // climbOut from stats.shaftEntryY) never pass the caller's targetY - the
  // F2 'stale entry demanded levels the terrain no longer owes' case keeps
  // its walkable-surface verdict untouched
  assert.equal(climbSurfaceShort({ targetY: null, feetY: 65, gained: 0 }), false)
  assert.equal(climbSurfaceShort({ feetY: 65, gained: 0 }), false)
})

test('climbSurfaceShort: junk reads are safe (the legacy verdict fires)', () => {
  assert.equal(climbSurfaceShort({ targetY: 'junk', feetY: 65, gained: 0 }), false)
  assert.equal(climbSurfaceShort({ targetY: 80, feetY: null, gained: 0 }), false)
  assert.equal(climbSurfaceShort({ targetY: NaN, feetY: 65 }), false)
  assert.equal(climbSurfaceShort({}), false)
  assert.equal(climbSurfaceShort(), false)
  // a junk gained is unread (the v0.614.0 law reads the geometry alone) -
  // the demand still rules
  assert.equal(climbSurfaceShort({ targetY: 80, feetY: 65, gained: 'junk' }), true)
})

test('WIRING PIN: the altitude-demand guard rides BOTH walkable-surface call sites (v0.610.0)', () => {
  const minerSrc = fs.readFileSync(new URL('../../src/bots/miner.mjs', import.meta.url), 'utf8')
  assert.ok(/climbSurfaceShort,\s*\/\/ \(v0\.610\.0\)/.test(minerSrc),
    'the guard is imported (the wiring is live, not dead code)')
  // the blocked-step site (v0.311.0's neighbor) and the rise-failure site
  // (v0.23.0's own verdict) BOTH read the guard - either path can hand the
  // instant zero-gain landing the face mined
  const guardCount = minerSrc.split('!climbSurfaceShort({ targetY,').length - 1
  assert.equal(guardCount, 2, 'the guard rides exactly the two walkable-surface verdicts')
  const blockedIdx = minerSrc.indexOf('isWalkableSurface({ skyLit: skyLitBlocked, probes: probesBlocked }) && !climbSurfaceShort({ targetY, feetY: feetBlocked.y')
  const riseIdx = minerSrc.indexOf('isWalkableSurface({ skyLit, probes }) && !climbSurfaceShort({ targetY, feetY: feetNow.y')
  assert.ok(blockedIdx > 0, 'the blocked-step verdict reads the guard')
  assert.ok(riseIdx > blockedIdx, 'the rise-failure verdict reads the guard (the later site)')
  // the guard reads the CALLER's targetY (not raisedTargetY) - the stale-entry
  // raise inside climbOut must never trigger the skip
  assert.ok(minerSrc.includes('!climbSurfaceShort({ targetY,'), 'the guard consumes the caller-owned targetY')
})

test('plant clear: the confessed groundcover digs before the fill (v0.627.0)', () => {
  const LEAF = blk('leaf_litter', 'empty') // no collision - the plan reads the cell clear
  const SGRASS = blk('short_grass', 'empty')
  // the family + the cap are pinned (the confessed kinds, the donor's own cap law)
  assert.deepEqual(PLANT_CLEAR_FAMILY, [
    'leaf_litter', 'short_grass',
    'oak_sapling', 'birch_sapling', 'spruce_sapling', 'jungle_sapling',
    'acacia_sapling', 'cherry_sapling', 'pale_oak_sapling'
  ])
  assert.equal(PLANT_CLEAR_MAX, 2)
  // the support cell holds the confessed plant - the plan sends the caller DIGGING
  const supportPlant = cellWorld({
    '10,63,20': STONE, // ownFloor
    '11,65,20': AIR, '11,66,20': AIR, // the step cells clear
    '11,64,20': LEAF, // the support cell - the plant front's own face
    '11,63,20': STONE // the pit floor solid
  })
  const p1 = bridgePlan({ feet: cell(10, 64, 20), d: D, read: supportPlant, items: POCKET })
  assert.equal(p1.ok, true)
  assert.equal(p1.kind, 'plant-clear')
  assert.equal(p1.fillKind, 'support')
  assert.equal(p1.plantName, 'leaf_litter')
  assert.deepEqual({ x: p1.cell.x, y: p1.cell.y, z: p1.cell.z }, { x: 11, y: 64, z: 20 })
  assert.equal(p1.item, null)
  assert.equal(p1.placedNext, 0, 'the clear spends no fill budget')
  // the pit cell (below lateral) holds short_grass - the pit fill's own confession
  const pitPlant = cellWorld({
    '10,63,20': STONE,
    '11,65,20': AIR, '11,66,20': AIR,
    '11,64,20': AIR,
    '11,63,20': SGRASS // the pit level - the plant sits where the fill would go
  })
  const p2 = bridgePlan({ feet: cell(10, 64, 20), d: D, read: pitPlant, items: POCKET })
  assert.equal(p2.ok, true)
  assert.equal(p2.kind, 'plant-clear')
  assert.equal(p2.fillKind, 'pit')
  assert.equal(p2.plantName, 'short_grass')
  assert.deepEqual({ x: p2.cell.x, y: p2.cell.y, z: p2.cell.z }, { x: 11, y: 63, z: 20 })
  // the cap spent keeps the legacy byte: the plan plans INTO the plant cell as today
  const capSpent = bridgePlan({ feet: cell(10, 64, 20), d: D, read: supportPlant, items: POCKET, plantClears: PLANT_CLEAR_MAX })
  assert.equal(capSpent.ok, true)
  assert.equal(capSpent.kind, 'support', 'past the cap the legacy support fill plans as always - the honest refusal owns the rest')
  assert.equal(capSpent.refCell.y, 63)
  // junk plantClears is the closed cap (never a crash, never a fresh dig budget)
  const junkCap = bridgePlan({ feet: cell(10, 64, 20), d: D, read: supportPlant, items: POCKET, plantClears: 'two' })
  assert.equal(junkCap.kind, 'support')
  // a non-confessing cell never sees the branch: air support keeps the legacy byte
  const airCase = cellWorld({
    '10,63,20': STONE,
    '11,65,20': AIR, '11,66,20': AIR,
    '11,64,20': AIR,
    '11,63,20': STONE
  })
  const p3 = bridgePlan({ feet: cell(10, 64, 20), d: D, read: airCase, items: POCKET })
  assert.equal(p3.kind, 'support')
  // the solid support keeps its own refusal (the plant check rides AFTER the solid check)
  const solidCase = cellWorld({
    '10,63,20': STONE,
    '11,65,20': AIR, '11,66,20': AIR,
    '11,64,20': STONE
  })
  const p4 = bridgePlan({ feet: cell(10, 64, 20), d: D, read: solidCase, items: POCKET })
  assert.equal(p4.ok, false)
  assert.equal(p4.why, 'the support is already solid')
})

test('plant clear: the per-cell law - the unattempted cell earns its one shot, the attempted cell never re-rides (v0.633.0)', () => {
  const LEAF = blk('leaf_litter', 'empty')
  // F9's refused-twice face (fleet 37216259817): the pit cell below-lateral
  // confesses leaf_litter, the scalar clears spent on OTHER cells
  const pitPlant = cellWorld({
    '10,63,20': STONE, // ownFloor solid (the pit fill's ref cell face)
    '11,65,20': AIR, '11,66,20': AIR, // the step cells clear
    '11,64,20': AIR, // the support cell open
    '11,63,20': LEAF // the pit cell - F9's leaf_litter at [-101,64,378]
  })
  const theCell = new Set(['11,63,20'])
  // the set WITH the key: the cell never re-rides, even past a spent scalar
  const attempted = bridgePlan({ feet: cell(10, 64, 20), d: D, read: pitPlant, items: POCKET, plantClears: PLANT_CLEAR_MAX, plantClearCells: theCell })
  assert.equal(attempted.ok, true)
  assert.equal(attempted.kind, 'pit', 'an attempted cell never re-rides - the loop guard the success-only scalar could not give')
  assert.deepEqual({ x: attempted.cell.x, y: attempted.cell.y, z: attempted.cell.z }, { x: 11, y: 63, z: 20 })
  // the scalar OPEN + the cell attempted: the set governs, the legacy pit fill
  // plans into the plant (a failed dig closes after ONE attempt)
  const scalarOpen = bridgePlan({ feet: cell(10, 64, 20), d: D, read: pitPlant, items: POCKET, plantClears: 0, plantClearCells: theCell })
  assert.equal(scalarOpen.kind, 'pit', 'the set governs: one attempt per cell, the re-plan rides the legacy path')
  // the set WITHOUT the key: the clear rides past the spent scalar (F9's cure)
  const otherCells = new Set(['9,63,20', '12,63,20'])
  const freshCell = bridgePlan({ feet: cell(10, 64, 20), d: D, read: pitPlant, items: POCKET, plantClears: PLANT_CLEAR_MAX, plantClearCells: otherCells })
  assert.equal(freshCell.ok, true)
  assert.equal(freshCell.kind, 'plant-clear', 'the spent scalar dooms no cell that never met a dig')
  assert.equal(freshCell.fillKind, 'pit')
  assert.equal(freshCell.plantName, 'leaf_litter')
  assert.deepEqual({ x: freshCell.cell.x, y: freshCell.cell.y, z: freshCell.cell.z }, { x: 11, y: 63, z: 20 })
  assert.equal(freshCell.item, null)
  assert.equal(freshCell.placedNext, 0, 'the clear spends no fill budget')
  // the array tolerance: the includes path mirrors the Set path
  const arraySpent = bridgePlan({ feet: cell(10, 64, 20), d: D, read: pitPlant, items: POCKET, plantClears: PLANT_CLEAR_MAX, plantClearCells: ['11,63,20'] })
  assert.equal(arraySpent.kind, 'pit')
  const arrayFresh = bridgePlan({ feet: cell(10, 64, 20), d: D, read: pitPlant, items: POCKET, plantClears: PLANT_CLEAR_MAX, plantClearCells: [] })
  assert.equal(arrayFresh.kind, 'plant-clear')
  // a junk set never crashes and never widens: the scalar's own byte decides
  const junkSet = bridgePlan({ feet: cell(10, 64, 20), d: D, read: pitPlant, items: POCKET, plantClears: PLANT_CLEAR_MAX, plantClearCells: 'junk' })
  assert.equal(junkSet.kind, 'pit', 'a junk set reads as no set - the spent scalar keeps the legacy byte')
  const junkSetOpen = bridgePlan({ feet: cell(10, 64, 20), d: D, read: pitPlant, items: POCKET, plantClears: 0, plantClearCells: 42 })
  assert.equal(junkSetOpen.kind, 'plant-clear', 'a junk set with the scalar open keeps the scalar-open byte')
})

test('plant clear: the sapling cell confesses - the fleet\'s own planted saplings join the family (v0.634.0)', () => {
  const OAKSAP = blk('oak_sapling', 'empty') // no collision - the plan reads the cell clear
  // F14's refused face (fleet 37222310370): the support cell holds the planter's oak_sapling,
  // the fill planned INTO it and the server refused (post=oak_sapling STILL OPEN)
  const supportSapling = cellWorld({
    '10,63,20': GRASS, // ownFloor - the mined ref=grass_block
    '11,65,20': AIR, '11,66,20': AIR, // the step cells clear
    '11,64,20': OAKSAP, // the support cell - the planter's own choice
    '11,63,20': STONE // the pit floor solid
  })
  const p1 = bridgePlan({ feet: cell(10, 64, 20), d: D, read: supportSapling, items: POCKET })
  assert.equal(p1.ok, true)
  assert.equal(p1.kind, 'plant-clear', 'the sapling cell confesses before the fill dies into it again')
  assert.equal(p1.fillKind, 'support')
  assert.equal(p1.plantName, 'oak_sapling')
  assert.deepEqual({ x: p1.cell.x, y: p1.cell.y, z: p1.cell.z }, { x: 11, y: 64, z: 20 })
  // the pit-level twin: a sapling below-lateral confesses the same way
  const pitSapling = cellWorld({
    '10,63,20': STONE,
    '11,65,20': AIR, '11,66,20': AIR,
    '11,64,20': AIR,
    '11,63,20': blk('birch_sapling', 'empty')
  })
  const p2 = bridgePlan({ feet: cell(10, 64, 20), d: D, read: pitSapling, items: POCKET })
  assert.equal(p2.kind, 'plant-clear')
  assert.equal(p2.fillKind, 'pit')
  assert.equal(p2.plantName, 'birch_sapling')
  // the per-cell law composes: an attempted sapling cell never re-rides
  const attempted = bridgePlan({ feet: cell(10, 64, 20), d: D, read: supportSapling, items: POCKET, plantClears: PLANT_CLEAR_MAX, plantClearCells: new Set(['11,64,20']) })
  assert.equal(attempted.kind, 'support', 'the attempt-once guard rides the widened family unchanged')
})
