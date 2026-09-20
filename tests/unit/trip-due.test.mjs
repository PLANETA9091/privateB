// (v0.17.1) tripDue - the map-trip gate. Pure arithmetic, all branches exact.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { tripDue, TRIP_WALK_MS } from '../../src/lib/woodplan.mjs'

const base = { hasPick: true, emptyShafts: 0, msSinceLast: 76000, remainingMs: 300000 }

test('a healthy tooled surface bot with cadence elapsed and time left trips', () => {
  assert.equal(tripDue(base), true)
})

test('no pick never trips', () => {
  assert.equal(tripDue({ ...base, hasPick: false }), false)
})

test('bottomed-out bots never trip (the sealed-stone A* explosion class)', () => {
  assert.equal(tripDue({ ...base, emptyShafts: 1 }), false)
  assert.equal(tripDue({ ...base, emptyShafts: 3 }), false)
})

test('cadence not elapsed never trips', () => {
  assert.equal(tripDue({ ...base, msSinceLast: 75000 }), false) // exactly at cadence: not due
  assert.equal(tripDue({ ...base, msSinceLast: 74999 }), false)
  assert.equal(tripDue({ ...base, msSinceLast: 75001 }), true)
  assert.equal(tripDue({ ...base, msSinceLast: NaN }), false)
})

test('the run must be able to FINISH a trip (walk 45s + harvest 40s + return)', () => {
  assert.equal(tripDue({ ...base, remainingMs: 150000 }), false) // exactly at the floor: not due
  assert.equal(tripDue({ ...base, remainingMs: 149999 }), false)
  assert.equal(tripDue({ ...base, remainingMs: 150001 }), true)
  assert.equal(tripDue({ ...base, remainingMs: NaN }), false)
})

test('the walk budget spans the licensed trip distance', () => {
  // ~4 blocks/s on foot plus pathfinding thought time: 45s must cover the
  // 128-block maxDistance licence with headroom - the 14s default could not
  // (9x 'unreachable' in fleet #122 were timeout-blacklisted walkable shores)
  const maxTripDistance = 128
  assert.ok(TRIP_WALK_MS / 1000 * 4 > maxTripDistance, `walk budget too short: ${TRIP_WALK_MS}ms`)
  assert.ok(TRIP_WALK_MS > 14000, 'the fix must exceed the old impossible budget')
})
