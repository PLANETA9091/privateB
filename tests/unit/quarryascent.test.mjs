// v0.255.0 THE QUARRY ASCENT - the mid-run bank trip's climb decision. The
// final bank has owned its doom climb since v0.158.0; the mid-run trip only
// logged the vertical doom's refusal while the yard sat 20+ levels up (face
// 36340470441: banked 0 vs 733, 1641u rode the deadline). The plan prices the
// climb INTO the trip's clock: fund the climb slice + the walk floor, climb
// toward the yard's level, and the legacy walk runs from a level it can route.
// The doom gate stays byte for byte - the ascent buys the ladder a route.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { QUARRY_ASCENT_MIN_DY, QUARRY_ASCENT_CLIMB_MS, QUARRY_ASCENT_WALK_FLOOR_MS, quarryAscentPlan, verticalDoomPlan } from '../../src/lib/surface.mjs'

test('quarry ascent: the calibration constants carry the measured shape', () => {
  assert.equal(QUARRY_ASCENT_MIN_DY, 8)
  assert.equal(QUARRY_ASCENT_CLIMB_MS, 45000)
  assert.equal(QUARRY_ASCENT_WALK_FLOOR_MS, 30000)
})

test('quarry ascent: the face-36340470441 shape ascends (yard 80 vs dig 59, funded clock)', () => {
  // (v0.606.0) THE PER-LEVEL LAW re-prices this wall: 21 levels x 4.2s/level
  // = 88.2s - the flat 45s slice under-priced this face (the timeout class,
  // face 37183256337: 0 of 7 climbs landed). The face still ascends - the
  // funded clock now carries the wall's own price.
  const p = quarryAscentPlan({ botY: 59, yardY: 80, remainingMs: 195000 })
  assert.equal(p.ascend, true)
  assert.equal(p.dy, 21)
  assert.equal(p.climbMs, 88200, 'the slice scales with the wall (21 x 4200)')
  assert.match(p.why, /21 levels up/)
})

test('quarry ascent: below the floor the keep refuses honestly', () => {
  const p = quarryAscentPlan({ botY: 80, yardY: 84, remainingMs: 195000 })
  assert.equal(p.ascend, false)
  assert.match(p.why, /below the ascent floor/)
  assert.equal(p.dy, 4)
})

test('quarry ascent: the doom shape but a starved clock keeps the legacy refusal', () => {
  const p = quarryAscentPlan({ botY: 41, yardY: 80, remainingMs: 60000 })
  assert.equal(p.ascend, false)
  assert.match(p.why, /cannot fund/)
  assert.equal(p.dy, 39)
})

test('quarry ascent: junk family reads no ascent (the legacy shape byte for byte)', () => {
  assert.equal(quarryAscentPlan({}).ascend, false)
  assert.equal(quarryAscentPlan({ botY: null, yardY: 80, remainingMs: 195000 }).why, 'no vertical read')
  assert.equal(quarryAscentPlan({ botY: 'junk', yardY: 80, remainingMs: 195000 }).ascend, false)
  assert.equal(quarryAscentPlan({ botY: 59, yardY: null, remainingMs: 195000 }).ascend, false)
  assert.equal(quarryAscentPlan({ botY: 59, yardY: 80, remainingMs: null }).why, 'no clock read')
  assert.equal(quarryAscentPlan({ botY: 59, yardY: 80, remainingMs: 'junk' }).ascend, false)
  assert.equal(quarryAscentPlan(null).ascend, false)
  assert.equal(quarryAscentPlan({ botY: 59, yardY: 80, remainingMs: Number.NaN }).ascend, false)
})

test('quarry ascent: a junk climbMs keeps the default slice (never zero/overrun)', () => {
  // (v0.606.0) the default slice is the wall's own price now - the floor
  // constant only binds the shallow walls (dy <= 10).
  const p = quarryAscentPlan({ botY: 59, yardY: 80, remainingMs: 195000, climbMs: 'junk' })
  assert.equal(p.ascend, true)
  assert.equal(p.climbMs, 88200, 'the junk override falls through to the scaled default')
})

test('quarry ascent: the funded clock funds the climb (the chain keeps the rest)', () => {
  // (v0.606.0) the boundary re-anchors on the wall's own price: 88200ms
  // climb + 30000ms walk floor = 118200ms - the old 75s boundary priced the
  // flat slice the field doom'd (timeout 4 of 7 ascents, 0 landed).
  const p = quarryAscentPlan({ botY: 59, yardY: 80, remainingMs: 118200 })
  assert.equal(p.ascend, true)
  assert.equal(p.climbMs, 88200)
  assert.equal(quarryAscentPlan({ botY: 59, yardY: 80, remainingMs: 118199 }).ascend, false) // one ms short - the honest refusal
  assert.equal(quarryAscentPlan({ botY: 59, yardY: 80, remainingMs: 76000 }).ascend, false) // the flat-era boundary cannot fund the scaled wall
})

test('quarry ascent: the doom gate arithmetic is untouched byte for byte', () => {
  const d = verticalDoomPlan({ botY: 59, yardY: 80, lateral: 7 })
  assert.equal(d.doom, true)
  assert.match(d.why, /21 levels up over 7b lateral/)
  const ok = verticalDoomPlan({ botY: 59, yardY: 80, lateral: 40 })
  assert.equal(ok.doom, false)
})
