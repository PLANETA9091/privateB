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
  WET_PLANT_NAMES, FLUIDS, UNDIGGABLE
} from '../../src/lib/surface.mjs'

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

test('traverseStep: WATERFALL GUARD - fluid above the head cell refuses even with a clear wall', () => {
  const feet = new Vec3(10, 40, 10)
  const cells = { '11,42,10': WATER } // clear feet+head, water above
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
  const cells = { '11,42,10': B('kelp', { box: 'empty' }) }
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
})

test('a wet escape plus the normal fail limit stays bounded (worst-case climbs end)', () => {
  // the loop combines: 2 traverse attempts (not fails) + PILLAR_FAIL_LIMIT(4)
  // rotation fails - a flooded bot gives up in bounded time either way
  assert.equal(TRAVERSE_MAX_ATTEMPTS, 2)
})
