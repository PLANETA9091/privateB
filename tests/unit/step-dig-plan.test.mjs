// Gravity step planning (v0.25.0) - the climb vs sand/gravel columns.
//
// MEASURED (fleet 35538062596, master 9afe4f5): 10+ bots died at the final
// bank with 'climb out (bank): failed - stalled' and the diag signature
// 'did not rise (dug=1..3) feet=air support=gravel step=gravel head=air'
// clustered at y=42-43 (river beaches). The old climb dug each step ONCE,
// bottom-up: digging the LOWER cell of a sand/gravel column makes the UPPER
// block sink into the cell just cleared, so the step was occupied again by
// the time the bot stepped. Every retry dug one more block, the column sank
// one more - pure stall, banked=0 with full pockets.
//
// These tests pin the cure with an instant-settle gravity model (dig a cell,
// every gravity block above it sinks one): repeated stepDigPlan passes
// exhaust a finite column, one pass provably does NOT (the bug, pinned),
// and the wet/hard/unknown refusals behave exactly like the old inline scan.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Vec3 } from 'vec3'
import { stepDigPlan, STEP_MAX_PASSES, PILLAR_LEVEL_CAP } from '../../src/lib/surface.mjs'

const GRAVITY = new Set(['gravel', 'sand'])

// instant-settle world: dig(x,y,z) removes the cell and sinks every gravity
// block in the column above it by one - the vanilla behaviour, simplified
function makeWorld () {
  const cells = new Map()
  const key = (x, y, z) => `${x},${y},${z}`
  return {
    set (x, y, z, name) { if (name) cells.set(key(x, y, z), name); else cells.delete(key(x, y, z)) },
    get (x, y, z) { return cells.get(key(x, y, z)) ?? 'air' },
    dig (x, y, z) {
      cells.delete(key(x, y, z))
      for (let yy = y + 1;; yy++) {
        const b = cells.get(key(x, yy, z))
        if (!b || !GRAVITY.has(b)) break
        cells.delete(key(x, yy, z))
        cells.set(key(x, yy - 1, z), b)
      }
    }
  }
}

function readOf (world) {
  return cell => {
    const name = world.get(cell.x, cell.y, cell.z)
    if (name === 'air' || !name) return { name: 'air', boundingBox: 'empty' }
    if (name === 'water') return { name: 'water', boundingBox: 'fluid' }
    if (name === 'bedrock') return { name: 'bedrock', boundingBox: 'block' }
    return { name, boundingBox: 'block' }
  }
}

// the pass loop miner.mjs climbOut executes, lifted verbatim onto the sim world
function runPasses (world, feet, d, maxPasses = STEP_MAX_PASSES) {
  let dug = 0
  let blocked = false
  let blockedWet = false
  let passes = 0
  for (let pass = 0; pass < maxPasses; pass++) {
    const plan = stepDigPlan({ feet, d, read: readOf(world), dug })
    if (plan.blocked) { blocked = true; blockedWet = plan.blockedWet; break }
    if (plan.digs.length === 0) break
    passes++
    for (const { cell } of plan.digs) { world.dig(cell.x, cell.y, cell.z); dug++ }
  }
  return { dug, blocked, blockedWet, passes }
}

test('stepDigPlan: one pass lists the four step cells TOP-DOWN (gravity-safe order)', () => {
  const world = makeWorld()
  for (const [dx, dy] of [[0, 1], [0, 2], [1, 1], [1, 2]]) world.set(10 + dx, 40 + dy, 5, 'stone')
  const feet = new Vec3(10, 40, 5)
  const plan = stepDigPlan({ feet, d: { x: 1, z: 0 }, read: readOf(world) })
  assert.equal(plan.ok, true)
  assert.equal(plan.digs.length, 4)
  const seq = plan.digs.map(g => `${g.cell.x - feet.x},${g.cell.y - feet.y},${g.cell.z - feet.z}`)
  // head+2, head+1, step+2, step+1: gravity always sinks INTO a cell the next
  // pass re-plans, never out of one this pass already cleared
  assert.deepEqual(seq, ['0,2,0', '0,1,0', '1,2,0', '1,1,0'])
})

test('stepDigPlan: a clear step needs no digs', () => {
  const world = makeWorld()
  const feet = new Vec3(10, 40, 5)
  const plan = stepDigPlan({ feet, d: { x: 1, z: 0 }, read: readOf(world) })
  assert.equal(plan.ok, true)
  assert.equal(plan.digs.length, 0)
})

test('stepDigPlan: the landing cell is never planned for digging', () => {
  // solid floor at (d,0) plus dirt everywhere above: only the four step cells
  // may appear in digs - the floor the bot lands on must stay solid
  const world = makeWorld()
  world.set(10, 40, 5, 'stone')
  world.set(11, 40, 5, 'dirt')
  for (const [dx, dy] of [[0, 1], [0, 2], [1, 1], [1, 2]]) world.set(10 + dx, 40 + dy, 5, 'stone')
  const feet = new Vec3(10, 40, 5)
  const plan = stepDigPlan({ feet, d: { x: 1, z: 0 }, read: readOf(world) })
  assert.equal(plan.ok, true)
  for (const g of plan.digs) assert.ok(!(g.cell.x === 11 && g.cell.y === 40 && g.cell.z === 5))
})

test('stepDigPlan: water refuses the step, flagged wet', () => {
  const world = makeWorld()
  world.set(10, 42, 5, 'water') // head+2
  const feet = new Vec3(10, 40, 5)
  const plan = stepDigPlan({ feet, d: { x: 1, z: 0 }, read: readOf(world) })
  assert.equal(plan.ok, false)
  assert.equal(plan.blocked, true)
  assert.equal(plan.blockedWet, true)
})

test('stepDigPlan: unknown chunk (null read) refuses the step, NOT flagged wet', () => {
  const feet = new Vec3(10, 40, 5)
  const plan = stepDigPlan({ feet, d: { x: 1, z: 0 }, read: () => null })
  assert.equal(plan.blocked, true)
  assert.equal(plan.blockedWet, false)
})

test('stepDigPlan: bedrock refuses the step', () => {
  const world = makeWorld()
  world.set(10, 41, 5, 'bedrock') // head+1
  const feet = new Vec3(10, 40, 5)
  const plan = stepDigPlan({ feet, d: { x: 1, z: 0 }, read: readOf(world) })
  assert.equal(plan.blocked, true)
  assert.equal(plan.blockedWet, false)
})

// (v0.32.0) refusal metadata: fleet 35555025482 printed 'blocked toward X,Z
// (dug=0)' on FOUR bearings with no record of WHICH cell refused or what sat
// in it - a null chunk read, a fluid and bedrock were indistinguishable. The
// plan now carries blockedCell [dx,dy,dz] + blockedName on every refusal.
test('stepDigPlan: a refusal names the refusing cell and block (fluid)', () => {
  const world = makeWorld()
  world.set(10, 42, 5, 'water') // head+2 refuses first
  const feet = new Vec3(10, 40, 5)
  const plan = stepDigPlan({ feet, d: { x: 1, z: 0 }, read: readOf(world) })
  assert.equal(plan.blocked, true)
  assert.deepEqual(plan.blockedCell, [0, 2, 0])
  assert.equal(plan.blockedName, 'water')
  assert.equal(plan.blockedWet, true)
  assert.equal(plan.reason, 'stop')
})

test('stepDigPlan: a null read names itself - the unloaded-chunk class is visible', () => {
  const feet = new Vec3(10, 40, 5)
  const plan = stepDigPlan({ feet, d: { x: 1, z: 0 }, read: () => null })
  assert.equal(plan.blocked, true)
  assert.deepEqual(plan.blockedCell, [0, 2, 0])
  assert.equal(plan.blockedName, 'null')
  assert.equal(plan.blockedWet, false)
})

test('stepDigPlan: bedrock names its own cell (head+1) and block', () => {
  const world = makeWorld()
  world.set(10, 41, 5, 'bedrock') // head+1
  const feet = new Vec3(10, 40, 5)
  const plan = stepDigPlan({ feet, d: { x: 1, z: 0 }, read: readOf(world) })
  assert.equal(plan.blocked, true)
  assert.deepEqual(plan.blockedCell, [0, 1, 0])
  assert.equal(plan.blockedName, 'bedrock')
})

test('stepDigPlan: a step-column refusal reports the step offset, not the own column', () => {
  const world = makeWorld()
  world.set(11, 41, 5, 'water') // step+1
  const feet = new Vec3(10, 40, 5)
  const plan = stepDigPlan({ feet, d: { x: 1, z: 0 }, read: readOf(world) })
  assert.equal(plan.blocked, true)
  assert.deepEqual(plan.blockedCell, [1, 1, 0])
  assert.equal(plan.blockedName, 'water')
})

test('stepDigPlan: a clean plan carries no refusal metadata', () => {
  const world = makeWorld()
  const feet = new Vec3(10, 40, 5)
  const plan = stepDigPlan({ feet, d: { x: 1, z: 0 }, read: readOf(world) })
  assert.equal(plan.ok, true)
  assert.equal(plan.blockedCell, undefined)
  assert.equal(plan.blockedName, undefined)
})

test('stepDigPlan: junk input refuses without throwing', () => {
  assert.equal(stepDigPlan({}).blocked, true)
  assert.equal(stepDigPlan({ feet: new Vec3(0, 0, 0), d: { x: 0, z: 0 }, read: () => null }).blocked, true)
  assert.equal(stepDigPlan({ feet: new Vec3(0, 0, 0), d: null, read: () => null }).blocked, true)
})

test('THE MEASURED BUG: one pass into a gravel step column leaves it sunk', () => {
  // F1's diag: support=gravel step=gravel at a river beach. A single
  // top-down pass digs step+2 and step+1 - and the column sinks back in.
  const world = makeWorld()
  world.set(10, 40, 5, 'stone') // floor under the bot
  world.set(11, 40, 5, 'gravel') // support (landing)
  world.set(11, 41, 5, 'gravel') // step+1
  world.set(11, 42, 5, 'gravel') // step+2
  world.set(11, 43, 5, 'gravel') // column continues above the scan
  const feet = new Vec3(10, 40, 5)
  const one = stepDigPlan({ feet, d: { x: 1, z: 0 }, read: readOf(world) })
  assert.equal(one.ok, true)
  for (const { cell } of one.digs) world.dig(cell.x, cell.y, cell.z)
  // the bug: step+1 occupied AGAIN by sunk gravel - the bot cannot rise
  assert.equal(world.get(11, 41, 5), 'gravel')
})

test('THE CURE: repeated passes exhaust the column the step was dug into', () => {
  const world = makeWorld()
  world.set(10, 40, 5, 'stone')
  world.set(11, 40, 5, 'gravel')
  for (let y = 41; y <= 43; y++) world.set(11, y, 5, 'gravel') // 3-block beach band
  const r = runPasses(world, new Vec3(10, 40, 5), { x: 1, z: 0 })
  assert.equal(r.blocked, false, 'no wet/hard refusal - just repeated digging')
  assert.equal(world.get(11, 41, 5), 'air', 'step+1 clear')
  assert.equal(world.get(11, 42, 5), 'air', 'step+2 clear')
  assert.equal(world.get(11, 40, 5), 'gravel', 'the landing cell stays solid')
})

test('THE CURE: a deep 10-block sand column still exhausts within STEP_MAX_PASSES', () => {
  const world = makeWorld()
  world.set(10, 40, 5, 'stone')
  world.set(11, 40, 5, 'sand')
  for (let y = 41; y <= 50; y++) world.set(11, y, 5, 'sand') // 10 blocks
  const r = runPasses(world, new Vec3(10, 40, 5), { x: 1, z: 0 })
  assert.equal(r.blocked, false)
  assert.ok(r.dug >= 10, `the column was consumed (dug=${r.dug})`)
  assert.ok(r.passes <= STEP_MAX_PASSES, `within the pass budget (${r.passes} passes)`)
  assert.equal(world.get(11, 41, 5), 'air')
})

test('THE CURE: a wet cell inside a dry column still refuses (wet-escape preserved)', () => {
  // gravity passes must not dig THROUGH water: the v0.17.0 wet-escape policy
  // fires exactly where it did before - the column dug sideways, not up
  const world = makeWorld()
  world.set(10, 40, 5, 'stone')
  world.set(11, 40, 5, 'stone')
  world.set(11, 41, 5, 'gravel')
  world.set(11, 42, 5, 'water') // flooded band above the gravel
  const r = runPasses(world, new Vec3(10, 40, 5), { x: 1, z: 0 })
  assert.equal(r.blocked, true)
  assert.equal(r.blockedWet, true)
})

test('stepDigPlan: the global dig budget still stops a runaway climb', () => {
  const world = makeWorld()
  for (const [dx, dy] of [[0, 1], [0, 2], [1, 1], [1, 2]]) world.set(10 + dx, 40 + dy, 5, 'stone')
  const feet = new Vec3(10, 40, 5)
  const plan = stepDigPlan({ feet, d: { x: 1, z: 0 }, read: readOf(world), dug: PILLAR_LEVEL_CAP * 2 })
  assert.equal(plan.blocked, true)
  assert.equal(plan.blockedWet, false)
  assert.equal(plan.reason, 'dig budget')
})
