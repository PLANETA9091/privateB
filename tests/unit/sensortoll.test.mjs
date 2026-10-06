import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sensorToll } from '../../src/lib/sensortoll.mjs'

// The era's live shapes verbatim - the reset(-1) skin's mass across the
// family's THREE skins: the death contexts (the v0.379.0 census's own
// ground), the breath mirrors (the v0.479.0 cue lens's), and the
// deep-pocket ascends (owned by nobody until this toll).
const face32 = [
  'F14 [F14] water: breath mirror [controls-owned] - the combat defense owned the controls at the killing tick - the flee context owned the tick (o2 reset(-1), head WET, snapshot 1s old)',
  'F14 [F14] death: drown context (o2 reset(-1), feet water, head water, rescue never, leg combat flee, wet 0s)',
  'F13 [F13] death: drown context (o2 reset(-1), feet water, head water, rescue never, leg combat flee, wet unknown)'
]
const face34 = [
  'F5 [F5] water: deep-pocket ascend - dug the ceiling stone at [-118,49,402] (jump stalled 3+ passes, o2 reset(-1))',
  'F5 [F5] water: breath mirror [rescue-ran] - the rescue lane owned the death window (paged 4.4s before death) - its own timeline lines own the failure (o2 reset(-1), head WET, snapshot 0s old)',
  'F5 [F5] death: drown context (o2 reset(-1), feet water, head water, rescue 4s ago, leg unknown, wet 4s)'
]
const face36 = [
  'F15 [F15] water: deep-pocket ascend - dug the ceiling stone at [-132,54,409] (jump stalled 3+ passes, o2 reset(-1))',
  'F15 [F15] water: breath mirror [rescue-ran] - the rescue lane owned the death window (paged 2s before death) - its own timeline lines own the failure (o2 reset(-1), head WET, snapshot 2s old)',
  'F15 [F15] death: drown context (o2 reset(-1), feet water, head water, rescue 2s ago, leg walk, wet 12s)',
  'F2 [F2] death: drown context (o2 reset(-1), feet water, head water, rescue never, leg deploy, wet 21s)',
  'F14 [F14] death: drown context (o2 reset(-1), feet water, head water, rescue active, leg deploy, wet 3s)'
]

test("the sensor's toll: the era's reads byte-exact (the 32nd 3, the 34th 3, the 36th 5)", () => {
  const r32 = sensorToll(face32)
  assert.deepEqual(r32.rescue, { never: 2, live: 0, stale: 0 })
  assert.deepEqual(r32.mirrorWhy, { 'controls-owned': 1 })
  assert.deepEqual({ rides: r32.rides, deaths: r32.deaths, mirrors: r32.mirrors, ascends: r32.ascends, other: r32.other }, { rides: 3, deaths: 2, mirrors: 1, ascends: 0, other: 0 })
  assert.deepEqual(r32.botRides, { F14: 2, F13: 1 })

  const r34 = sensorToll(face34)
  assert.deepEqual(r34.rescue, { never: 0, live: 0, stale: 1 })
  assert.deepEqual(r34.mirrorWhy, { 'rescue-ran': 1 })
  assert.deepEqual({ rides: r34.rides, deaths: r34.deaths, mirrors: r34.mirrors, ascends: r34.ascends, other: r34.other }, { rides: 3, deaths: 1, mirrors: 1, ascends: 1, other: 0 })
  assert.deepEqual(r34.botRides, { F5: 3 })

  const r36 = sensorToll(face36)
  assert.deepEqual(r36.rescue, { never: 1, live: 1, stale: 1 })
  assert.deepEqual(r36.mirrorWhy, { 'rescue-ran': 1 })
  assert.deepEqual({ rides: r36.rides, deaths: r36.deaths, mirrors: r36.mirrors, ascends: r36.ascends, other: r36.other }, { rides: 5, deaths: 3, mirrors: 1, ascends: 1, other: 0 })
  assert.deepEqual(r36.botRides, { F15: 3, F2: 1, F14: 1 })
  // the era's six toll deaths: the rescue lane lost the window even live
  const era = [r32, r34, r36]
  assert.equal(era.reduce((s, r) => s + r.deaths, 0), 6)
  assert.equal(era.reduce((s, r) => s + r.rescue.never, 0), 3)
  assert.equal(era.reduce((s, r) => s + r.rescue.stale, 0), 2)
  assert.equal(era.reduce((s, r) => s + r.rescue.live, 0), 1)
})

test("the sensor's toll: the family fence keeps the sensor-alive rides OUT, the honest zero, the junk battery", () => {
  // the sensor-alive near-misses are the stall lane's own mass, NOT the
  // toll: the ascends riding a live o2 (14 of the era's 16), the mirrors
  // riding 'o2 ?' or a value, the pass lines' o2=N reads
  const fenceLines = [
    'F13 [F13] water: deep-pocket ascend - dug the ceiling granite at [-127,50,412] (jump stalled 3+ passes, o2 12)',
    'F15 [F15] water: deep-pocket ascend - dug the ceiling stone at [-132,54,409] (jump stalled 3+ passes, o2 7)',
    'F2 [F2] water: breath mirror [controls-blind] - the wet-escape climb owned the controls but the sentry\'s sight died 22s before death - the o2 burned unwatched while the owner failed (the F14 36566021862 class: the snapshot was the blindness evidence) (o2 17, head WET, snapshot 22s old)',
    'F14 [F14] water: breath mirror [rescue-ran] - the rescue lane owned the death window (paged 2.6s before death) - its own timeline lines own the failure (o2 0, head WET, snapshot 2.6s old)',
    'F13 [F13] water: breath mirror [controls-owned] - the wet-escape climb owned the controls at the killing tick - the escape failed, its own lines own the story (o2 ?, head dry/unknown, snapshot none)',
    'F2 [F2] water: pass 0 head=wet shore=none land=n/a y=49.3 o2=15 probes=0 at=[-134,49,414]'
  ]
  const fence = sensorToll(fenceLines)
  assert.deepEqual(fence, {
    rides: 0, deaths: 0, mirrors: 0, ascends: 0, other: 0,
    mirrorWhy: {}, rescue: { never: 0, live: 0, stale: 0 }, botRides: {}
  })
  // a mixed face: the toll rides beside the fence, nothing crosses
  const mixed = sensorToll([...face36, ...fenceLines])
  assert.equal(mixed.rides, 5)
  assert.equal(mixed.botRides.F15, 3)
  // a clean face reads the honest zero shape; junk-safe (the o2gap law)
  assert.equal(sensorToll(['F1 [F1] combat: fighting zombie (dist 2.0, hp 20.0, 0 nearby, proximity)']).rides, 0)
  assert.equal(sensorToll(42), null)
  assert.equal(sensorToll(undefined), null)
  assert.equal(sensorToll('not an array'), null) // non-array reads null - the o2gap convention (arrays are the log's shape)
  // junk lines inside a live face are skipped, never invented
  const j = sensorToll([face32[1], 123, null, 'death: drown context (o2 reset(-1))'])
  assert.equal(j.deaths, 1)
  assert.equal(j.rides, 1)
})
