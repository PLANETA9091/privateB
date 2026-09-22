// Wet-escape traverse policy (v0.17.0) - the climb's answer to flooded shafts.
// Pure maths over pre-read cells, no bot, no server.
//
// Measured background (fleet 2026-09-20 17:05, master v0.16.2): F7 spent the
// WHOLE 450s run at y=55 - 'blocked toward' every rotation with dug=0 (the
// cells above the head were water: the bot's own shaft had become a well),
// interleaved with drowning rescues that all timed out 'still wet'. F5
// climbed 16 levels and hit the same wet band. Rotation cannot fix a wet
// ceiling, digging up floods the staircase - the only escape is horizontal.
// These tests pin the policy miner.mjs escapeTraverse executes.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Vec3 } from 'vec3'
import {
  isWetCell, traverseStep,
  TRAVERSE_MAX_BLOCKS, TRAVERSE_MAX_MS, TRAVERSE_MAX_ATTEMPTS, TRAVERSE_STALL_LIMIT,
  TRAVERSE_ROTATE_LIMIT, CLIMB_ESCAPE_O2_FLOOR,
  WET_PLANT_NAMES, FLUIDS, UNDIGGABLE
} from '../../src/lib/surface.mjs'
import { OXYGEN_RESCUE_LEVEL, OXYGEN_CRITICAL_LEVEL } from '../../src/lib/drowning.mjs'

// A block factory that mimics the two prismarine fields the policy reads
const B = (name, opts = {}) => ({ name, boundingBox: opts.box ?? 'block', waterlogged: opts.wl ?? false })
const AIR = B('air', { box: 'empty' })
const WATER = B('water', { box: 'fluid' })
const STONE = B('stone')
const BEDROCK = B('bedrock')

// A tiny world: a map from 'x,y,z' -> block, with everything else stone
function world (cells) {
  return cell => {
    const k = `${cell.x},${cell.y},${cell.z}`
    return cells[k] !== undefined ? cells[k] : STONE
  }
}

test('isWetCell: free fluids and lava are wet', () => {
  for (const f of FLUIDS) assert.equal(isWetCell(B(f, { box: 'fluid' })), true, f)
})

test('isWetCell: water plants are wet (digging under them floods the cell)', () => {
  for (const p of WET_PLANT_NAMES) assert.equal(isWetCell(B(p, { box: 'empty' })), true, p)
})

test('isWetCell: a waterlogged solid is wet, a dry solid is not', () => {
  assert.equal(isWetCell(B('stone', { wl: true })), true)
  assert.equal(isWetCell(B('stone', { wl: false })), false)
  assert.equal(isWetCell(B('stone')), false) // flag absent: not proven wet
})

test('isWetCell: junk reads are not wet (the caller refuses unknowns instead)', () => {
  assert.equal(isWetCell(null), false)
  assert.equal(isWetCell(undefined), false)
  assert.equal(isWetCell('water'), false) // a bare string is not a block
  assert.equal(isWetCell({}), false)
})

test('traverseStep: a dry wall digs feet-then-head and is ok', () => {
  const feet = new Vec3(10, 40, 10)
  const r = traverseStep({ feet, d: { x: 1, z: 0 }, read: world({}) })
  assert.equal(r.ok, true)
  assert.equal(r.digs.length, 2) // feet-level and head-level stone
  assert.equal(r.digs[0].name, 'stone')
})

test('traverseStep: an open passage digs nothing (the bot just walks)', () => {
  const feet = new Vec3(10, 40, 10)
  const cells = {
    '11,40,10': AIR, // feet-level ahead open
    '11,41,10': AIR, // head-level ahead open
    '11,42,10': AIR // above the head open
  }
  const r = traverseStep({ feet, d: { x: 1, z: 0 }, read: world(cells) })
  assert.equal(r.ok, true)
  assert.deepEqual(r.digs, [])
})

test('traverseStep: water ahead at either body level refuses WET', () => {
  const feet = new Vec3(10, 40, 10)
  const wetFeet = traverseStep({ feet, d: { x: 1, z: 0 }, read: world({ '11,40,10': WATER }) })
  assert.deepEqual(wetFeet, { ok: false, reason: 'wet' })
  const wetHead = traverseStep({ feet, d: { x: 1, z: 0 }, read: world({ '11,41,10': WATER }) })
  assert.deepEqual(wetHead, { ok: false, reason: 'wet' })
})

test('traverseStep: WATERFALL GUARD - a water COLUMN above the head cell refuses even with a clear wall', () => {
  const feet = new Vec3(10, 40, 10)
  // (v0.24.0) the guard now only holds for a SUSTAINED column: water above water
  // (an aquifer layer keeps feeding the pour). The finite-pool case is below.
  const cells = { '11,42,10': WATER, '11,43,10': WATER }
  const r = traverseStep({ feet, d: { x: 1, z: 0 }, read: world(cells) })
  assert.deepEqual(r, { ok: false, reason: 'wet' })
})

test('traverseStep: SURFACE POOL - a single water cell over DRY air above is waded under (the measured pour pool)', () => {
  const feet = new Vec3(10, 40, 10)
  // measured (04:05 diag terrain probe): a shaft-mouth pour pools on the
  // terrain - 'dy=2:water' over dry dirt on EVERY gallery direction while the
  // wall itself is dry. Refusing all 4 sides stalls the bot in the well; wading
  // one level is strictly better.
  const cells = { '11,42,10': WATER, '11,43,10': AIR }
  const r = traverseStep({ feet, d: { x: 1, z: 0 }, read: world(cells) })
  assert.equal(r.ok, true, 'the finite film must not stall the escape')
  assert.equal(r.digs.length, 2, 'the wall itself is still dug feet-then-head')
})

test('traverseStep: SURFACE POOL - an unknown cell above the water still refuses (never dig blindly)', () => {
  const feet = new Vec3(10, 40, 10)
  // an unloaded chunk above the pool must not read as 'dry stone' - the read
  // itself returns null there and the step refuses like the original guard
  const r = traverseStep({
    feet, d: { x: 1, z: 0 },
    read: cell => {
      if (cell.x === 11 && cell.y === 42 && cell.z === 10) return WATER // the pool cell
      if (cell.x === 11 && cell.y === 43 && cell.z === 10) return null // unloaded above
      return STONE
    }
  })
  assert.deepEqual(r, { ok: false, reason: 'wet' })
})

test('traverseStep: lava over the head cell refuses even as a 1-deep pool (wading lava is death)', () => {
  const feet = new Vec3(10, 40, 10)
  const lava = B('lava', { box: 'fluid' })
  const cells = { '11,42,10': lava, '11,43,10': AIR }
  const r = traverseStep({ feet, d: { x: 1, z: 0 }, read: world(cells) })
  assert.deepEqual(r, { ok: false, reason: 'wet' })
})

test('traverseStep: kelp over the head cell refuses even with dry air above (the plant becomes a source when broken)', () => {
  const feet = new Vec3(10, 40, 10)
  const cells = { '11,42,10': B('kelp', { box: 'empty' }), '11,43,10': AIR }
  const r = traverseStep({ feet, d: { x: 1, z: 0 }, read: world(cells) })
  assert.deepEqual(r, { ok: false, reason: 'wet' })
})

test('traverseStep: a waterlogged solid over the head cell refuses even with dry air above (digging releases the water)', () => {
  const feet = new Vec3(10, 40, 10)
  const cells = { '11,42,10': B('stone', { wl: true }), '11,43,10': AIR }
  const r = traverseStep({ feet, d: { x: 1, z: 0 }, read: world(cells) })
  assert.deepEqual(r, { ok: false, reason: 'wet' })
})

test('traverseStep: a waterlogged head cell refuses (digging it releases the water)', () => {
  const feet = new Vec3(10, 40, 10)
  const r = traverseStep({ feet, d: { x: 1, z: 0 }, read: world({ '11,41,10': B('stone', { wl: true }) }) })
  assert.deepEqual(r, { ok: false, reason: 'wet' })
})

test('traverseStep: bedrock ahead refuses HARD (no escape there, rotate)', () => {
  const feet = new Vec3(10, 40, 10)
  const r = traverseStep({ feet, d: { x: 1, z: 0 }, read: world({ '11,40,10': BEDROCK }) })
  assert.deepEqual(r, { ok: false, reason: 'hard' })
})

test('traverseStep: GAP GUARD - a missing floor ahead refuses (not an escape, a new trap)', () => {
  const feet = new Vec3(10, 40, 10)
  const r = traverseStep({ feet, d: { x: 1, z: 0 }, read: world({ '11,39,10': AIR }) })
  assert.deepEqual(r, { ok: false, reason: 'gap' })
})

test('traverseStep: a WET floor ahead refuses (stepping into water is not an escape)', () => {
  const feet = new Vec3(10, 40, 10)
  const r = traverseStep({ feet, d: { x: 1, z: 0 }, read: world({ '11,39,10': WATER }) })
  assert.deepEqual(r, { ok: false, reason: 'wet' })
})

test('traverseStep: unknown (null) reads refuse - never dig into unloaded chunks', () => {
  const feet = new Vec3(10, 40, 10)
  const r = traverseStep({ feet, d: { x: 1, z: 0 }, read: () => null })
  assert.deepEqual(r, { ok: false, reason: 'unknown' })
})

test('traverseStep: kelp over the head cell refuses (the plant becomes a source when broken)', () => {
  const feet = new Vec3(10, 40, 10)
  const cells = { '11,42,10': B('kelp', { box: 'empty' }) } // world default: STONE above - a plant under stone is no pool either
  const r = traverseStep({ feet, d: { x: 1, z: 0 }, read: world(cells) })
  assert.deepEqual(r, { ok: false, reason: 'wet' })
})

test('traverseStep: works on the z axis too (d is a pure cardinal)', () => {
  const feet = new Vec3(10, 40, 10)
  const r = traverseStep({ feet, d: { x: 0, z: -1 }, read: world({}) })
  assert.equal(r.ok, true)
  assert.equal(r.digs.length, 2)
})

test('traverseStep: junk arguments refuse honestly', () => {
  assert.deepEqual(traverseStep({}), { ok: false, reason: 'unknown' })
  assert.deepEqual(traverseStep({ feet: new Vec3(1, 1, 1), d: { x: 0, z: 0 }, read: () => STONE }), { ok: false, reason: 'unknown' })
  assert.deepEqual(traverseStep({ feet: new Vec3(1, 1, 1), d: { x: NaN, z: 1 }, read: () => STONE }), { ok: false, reason: 'unknown' })
  assert.deepEqual(traverseStep({ feet: new Vec3(1, 1, 1), d: { x: 1, z: 0 }, read: 'not a function' }), { ok: false, reason: 'unknown' })
})

test('traverse budgets: bounded per climb, generous per gallery', () => {
  assert.ok(TRAVERSE_MAX_BLOCKS >= 6, 'a gallery shorter than 6 cannot out-walk a 7-block water spread')
  assert.ok(TRAVERSE_MAX_BLOCKS <= 16, 'a longer gallery burns the climb budget')
  assert.ok(TRAVERSE_MAX_MS >= 10000, 'below 10s even fast digging cannot clear a gallery')
  assert.ok(TRAVERSE_MAX_MS < 25000, 'past 25s the drown sentry must win the controls back')
  assert.ok(TRAVERSE_MAX_ATTEMPTS >= 1 && TRAVERSE_MAX_ATTEMPTS <= 3)
  assert.ok(TRAVERSE_STALL_LIMIT >= 2 && TRAVERSE_STALL_LIMIT <= 5)
  // (v0.29.0) the escape rotates through the bearings on a refusal: 4 = one
  // full circle, so every cardinal is tried at most once per gallery
  assert.ok(TRAVERSE_ROTATE_LIMIT === 4, 'a full circle, no bearing probed twice')
})

// ---- v0.85.0: THE LOW-O2 YIELD (run77 F7 'drowned@0.8' AT SURFACE, inside an escape) ----

test('the low-o2 yield floor sits between the rescue line and the death line', () => {
  // the yield must fire while the rescue lane still has air to work with:
  // ABOVE the critical line the rescue pages instantly; at/below it a surface
  // hold may already be too late. The floor belongs strictly between them.
  assert.ok(CLIMB_ESCAPE_O2_FLOOR > OXYGEN_CRITICAL_LEVEL,
    'the yield fires BEFORE the critical bar - the sentry must win with air left')
  assert.ok(CLIMB_ESCAPE_O2_FLOOR <= OXYGEN_RESCUE_LEVEL,
    'the yield never fires above the rescue line - the escape keeps its job')
  assert.ok(CLIMB_ESCAPE_O2_FLOOR === 6, 'run77 pinned: ~3s of air beats blind digging')
})

test('a wet escape plus the normal fail limit stays bounded (worst-case climbs end)', () => {
  // the loop combines: 2 traverse attempts (not fails) + PILLAR_FAIL_LIMIT(4)
  // rotation fails - a flooded bot gives up in bounded time either way
  assert.equal(TRAVERSE_MAX_ATTEMPTS, 2)
})

// ---- v0.52.0: the DRY RUN-UP TRAVERSE ----
// Fleet 35639593200 (v0.51.0) measured F1/F14 'assist did not complete
// (timeout)' + F13 '(No path to the goal!)' with diag 'feet=air
// support=diorite step=air': a bot sealed in a 1x1 well where the step cell
// is OPEN AIR yet both the raw stepUps and the goto assist fail - the
// pressed-face geometry (the v0.27.0 repro) leaves no run-up space and the
// pathfinder needs the same space. The cure re-uses the wet-escape gallery
// (traverseStep) as a DRY run-up: dig one step toward the bearing, walk in,
// re-judge from the L-mouth. These tests pin the plan the mechanic executes.
test('traverseStep as a dry run-up: the measured F1 well opens in two digs', () => {
  // the F1 diag geometry: support=diorite (feet-level solid ahead), step=air
  // (the wall is exactly ONE block high - jumpable with space, hopeless pressed)
  const feet = new Vec3(-130, 43, 395)
  const cells = {
    '-129,43,395': B('diorite'), // feet-level ahead: the support wall
    '-129,44,395': AIR,          // step cell: open air (the measured diag)
    '-129,45,395': AIR           // above the head: open (no waterfall)
  }
  const r = traverseStep({ feet, d: { x: 1, z: 0 }, read: world(cells) })
  assert.equal(r.ok, true, 'a dry 1-high wall is a legal gallery step')
  assert.equal(r.digs.length, 1, 'only the feet-level wall needs digging (head level is the open step)')
  assert.equal(r.digs[0].name, 'diorite')
})

test('traverseStep as a dry run-up: the sealed 2-high wall opens in two digs', () => {
  const feet = new Vec3(10, 40, 10)
  const r = traverseStep({ feet, d: { x: 0, z: 1 }, read: world({}) }) // all stone
  assert.equal(r.ok, true)
  assert.equal(r.digs.length, 2, 'feet + head stone both go')
})

test('traverseStep as a dry run-up: it never digs into the measured hazards', () => {
  const feet = new Vec3(10, 40, 10)
  // a gap ahead is not a run-up, it is a new trap
  assert.equal(traverseStep({ feet, d: { x: 1, z: 0 }, read: world({ '11,39,10': AIR }) }).ok, false, 'gap floor refuses')
  // lava ahead refuses even though the wall itself is diggable
  assert.equal(traverseStep({ feet, d: { x: 1, z: 0 }, read: world({ '11,40,10': B('lava', { box: 'fluid' }) }) }).ok, false, 'lava refuses')
  // an unknown read ahead (unloaded chunk) refuses - never dig blind
  const unknown = () => null
  assert.equal(traverseStep({ feet, d: { x: 1, z: 0 }, read: unknown }).ok, false, 'unknown refuses')
})
