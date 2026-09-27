// The walled dig-around (v0.250.0): the walled seal verdict (4 pooled firings
// across two faces, every one kept the legacy standoff and the vein burned)
// is a BLOCKER, not a fate - the headroom cell is ordinary gallery stone in
// every observed firing. The pure cure gates: the plan must BE the walled
// class; the headroom box must speak 'block' (a blind box digs nothing
// blind); a headroom NAME that reads fluid vetoes the dig (the box lie
// class - 26.2 fluids carry 'empty' boxes, so 'block' + a fluid name is a
// stale/contradictory read, never a dig target).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { walledCure, sealPlan, SEAL_DIG_TIMEOUT_MS, SEAL_PLACE_TIMEOUT_MS } from '../../src/lib/surface.mjs'

test('cure: the walled class with a solid dry headroom digs', () => {
  const plan = sealPlan({ anchorBox: 'block', headroomBox: 'block' })
  assert.equal(plan.plan, 'walled')
  const c = walledCure({ plan, headroomName: 'stone', headroomBox: 'block' })
  assert.equal(c.dig, true)
  assert.match(c.why, /dig it, re-plan/)
})

test('cure: the full 26.2 shape - block names ride the dig', () => {
  const plan = sealPlan({ anchorName: 'granite', anchorBox: 'block', headroomName: 'andesite', headroomBox: 'block' })
  assert.equal(plan.plan, 'walled')
  assert.equal(walledCure({ plan, headroomName: 'andesite', headroomBox: 'block' }).dig, true)
})

test('cure: not the walled class - buildable is the crossing, not the cure', () => {
  const plan = sealPlan({ anchorBox: 'block', headroomBox: 'empty' })
  assert.equal(plan.plan, 'buildable')
  assert.equal(walledCure({ plan, headroomName: 'stone', headroomBox: 'block' }).dig, false)
})

test('cure: not the walled class - unanchored and unknown keep their own laws', () => {
  assert.equal(walledCure({ plan: { plan: 'unanchored' }, headroomName: 'stone', headroomBox: 'block' }).dig, false)
  assert.equal(walledCure({ plan: { plan: 'unknown' }, headroomName: 'stone', headroomBox: 'block' }).dig, false)
})

test('cure: a junk plan is not the walled class - never throws', () => {
  assert.equal(walledCure({ plan: null }).dig, false)
  assert.equal(walledCure({ plan: 'walled' }).dig, false)
  assert.equal(walledCure({ plan: {} }).dig, false)
})

test('cure: a bare call never throws (the body-guard law)', () => {
  assert.equal(walledCure().dig, false)
  assert.equal(walledCure(null).dig, false)
})

test('cure: a blind headroom box digs nothing blind - the honest no', () => {
  const plan = { plan: 'walled' }
  assert.equal(walledCure({ plan, headroomName: null, headroomBox: null }).dig, false)
  assert.equal(walledCure({ plan, headroomName: 'stone', headroomBox: 'empty' }).dig, false)
  assert.equal(walledCure({ plan, headroomName: 'stone', headroomBox: 'fluid' }).dig, false)
})

test('cure: the box lie class - a fluid name vetoes the dig even on a block box', () => {
  const plan = { plan: 'walled' }
  assert.equal(walledCure({ plan, headroomName: 'water', headroomBox: 'block' }).dig, false)
  assert.equal(walledCure({ plan, headroomName: 'kelp', headroomBox: 'block' }).dig, false)
  assert.equal(walledCure({ plan, headroomName: 'flowing_lava', headroomBox: 'block' }).dig, false)
})

test('cure: junk names are silent - only a REAL fluid name vetoes (the box speaks first)', () => {
  const plan = { plan: 'walled' }
  assert.equal(walledCure({ plan, headroomName: null, headroomBox: 'block' }).dig, true)
  assert.equal(walledCure({ plan, headroomName: 'not_a_block', headroomBox: 'block' }).dig, true)
  assert.equal(walledCure({ plan, headroomName: 7, headroomBox: 'block' }).dig, true)
})

test('cure: the refusal lines carry the why verbatim (the decode-ready shapes)', () => {
  assert.match(walledCure({ plan: null }).why, /not the walled class/)
  assert.match(walledCure({ plan: { plan: 'walled' }, headroomBox: null }).why, /no dig blind/)
  assert.match(walledCure({ plan: { plan: 'walled' }, headroomName: 'water', headroomBox: 'block' }).why, /box lie class/)
})

test('cure: the dig cap constant rides the place cap lesson', () => {
  assert.equal(typeof SEAL_DIG_TIMEOUT_MS, 'number')
  assert.ok(SEAL_DIG_TIMEOUT_MS > SEAL_PLACE_TIMEOUT_MS) // a dig resolves slower than a rejected place
})
