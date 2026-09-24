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
  verticalDoomPlan, VERTICAL_DOOM_MIN_DY, climbTargetY
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
