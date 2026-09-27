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
  const p = quarryAscentPlan({ botY: 59, yardY: 80, remainingMs: 195000 })
  assert.equal(p.ascend, true)
  assert.equal(p.dy, 21)
  assert.equal(p.climbMs, 45000)
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
  const p = quarryAscentPlan({ botY: 59, yardY: 80, remainingMs: 195000, climbMs: 'junk' })
  assert.equal(p.ascend, true)
  assert.equal(p.climbMs, 45000)
})

test('quarry ascent: the funded clock funds the climb (the chain keeps the rest)', () => {
  const p = quarryAscentPlan({ botY: 59, yardY: 80, remainingMs: 76000 })
  assert.equal(p.ascend, true)
  assert.equal(p.climbMs, 45000)
  assert.equal(quarryAscentPlan({ botY: 59, yardY: 80, remainingMs: 75000 }).ascend, true) // exactly the climb + the walk floor
  assert.equal(quarryAscentPlan({ botY: 59, yardY: 80, remainingMs: 74999 }).ascend, false) // one ms short - the honest refusal
})

test('quarry ascent: the doom gate arithmetic is untouched byte for byte', () => {
  const d = verticalDoomPlan({ botY: 59, yardY: 80, lateral: 7 })
  assert.equal(d.doom, true)
  assert.match(d.why, /21 levels up over 7b lateral/)
  const ok = verticalDoomPlan({ botY: 59, yardY: 80, lateral: 40 })
  assert.equal(ok.doom, false)
})
