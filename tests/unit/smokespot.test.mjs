import test from 'node:test'
import assert from 'node:assert/strict'
import { pickSmokeSpot, diggableBack } from '../../src/lib/smokespot.mjs'

// THE WATER-RECLAIM LAW: face 37386244195's smoke hang, pinned as field
// reads - the dug hole watered over while the bot dug on, the old selector
// never read the hole itself, and the dig-back guard let `bot.dig(water)`
// hang to the 180s timeout. This lens pins: a fluid can never be selected,
// and only `boundingBox === 'block'` may be re-dug.

const FEET = { x: -135, y: 62, z: 392 }
const HOLE = { x: -136, y: 62, z: 393 } // the face's own dug cell, one step off the feet

const B = (boundingBox, name) => ({ boundingBox, name })
const AIR = B('empty', 'air')
const SAND = B('block', 'sand')
const WATER = B('fluid', 'water')

// A world read over a sparse map (undefined = out of reach, like blockAt null).
function world(cells) {
  const key = p => `${p.x},${p.y},${p.z}`
  const map = new Map(Object.entries(cells).map(([k, v]) => [k, v]))
  return p => map.get(key(p)) ?? null
}

test('the watered hole is refused - the hang shape, the neighbour scan rescues', () => {
  // The exact face 37386244195 read: the hole now answers water.
  const at = world({
    [`${HOLE.x},${HOLE.y},${HOLE.z}`]: WATER,      // the reclaimed hole
    [`${HOLE.x},${HOLE.y - 1},${HOLE.z}`]: SAND,   // its floor is still solid
    [`${FEET.x + 1},${FEET.y},${FEET.z}`]: AIR,    // a dry neighbour east
    [`${FEET.x + 1},${FEET.y - 1},${FEET.z}`]: SAND,
  })
  const spot = pickSmokeSpot({ feet: FEET, target: HOLE, at })
  assert.ok(spot, 'a dry neighbour must be found')
  assert.equal(spot.cell.x, FEET.x + 1, 'the spot is the dry east neighbour, never the watered hole')
  assert.equal(spot.cell.y, FEET.y)
})

test('the dry hole with a solid floor is the first choice', () => {
  const at = world({
    [`${HOLE.x},${HOLE.y},${HOLE.z}`]: AIR,
    [`${HOLE.x},${HOLE.y - 1},${HOLE.z}`]: SAND,
  })
  const spot = pickSmokeSpot({ feet: FEET, target: HOLE, at })
  assert.ok(spot)
  assert.deepEqual(spot.cell, HOLE)
  assert.equal(spot.ref.boundingBox, 'block')
  assert.deepEqual(spot.face, { x: 0, y: 1, z: 0 })
})

test('the hole where we stand is skipped - the neighbour scan takes over', () => {
  const at = world({
    [`${FEET.x},${FEET.y},${FEET.z}`]: AIR,        // the hole IS the feet cell (we fell in)
    [`${FEET.x - 1},${FEET.y},${FEET.z}`]: AIR,    // dry west neighbour
    [`${FEET.x - 1},${FEET.y - 1},${FEET.z}`]: SAND,
  })
  const spot = pickSmokeSpot({ feet: FEET, target: FEET, at })
  assert.ok(spot)
  assert.deepEqual(spot.cell, { x: FEET.x - 1, y: FEET.y, z: FEET.z })
})

test('a fluid floor is refused in the neighbour scan', () => {
  const at = world({
    [`${FEET.x + 1},${FEET.y},${FEET.z}`]: AIR,
    [`${FEET.x + 1},${FEET.y - 1},${FEET.z}`]: WATER, // water floor - no click target
  })
  assert.equal(pickSmokeSpot({ feet: FEET, target: null, at }), null)
})

test('no free cell anywhere reads null honestly', () => {
  const at = world({}) // the void - nothing to stand the block on
  assert.equal(pickSmokeSpot({ feet: FEET, target: HOLE, at }), null)
})

test('the dig-back guard: only a block may be re-dug - the water dig hangs', () => {
  assert.equal(diggableBack(SAND), true)
  assert.equal(diggableBack(WATER), false, 'a fluid answer is skipped with a WARN, never dug')
  assert.equal(diggableBack(AIR), false)
  assert.equal(diggableBack(null), false)
})
