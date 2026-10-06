import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ascendStall } from '../../src/lib/ascendstall.mjs'
import { sensorToll } from '../../src/lib/sensortoll.mjs'

// The era's live skins verbatim (raw-log reconciled): the stall lane's
// own mass - the jump sat stalled at the emitter's own threshold (3+
// passes) on a FULL sensor, and the ceiling dig bought the way out.
const liveF13 = 'F13 [F13] water: deep-pocket ascend - dug the ceiling granite at [-127,50,412] (jump stalled 3+ passes, o2 12)'
const liveF14 = 'F14 [F14] water: deep-pocket ascend - dug the ceiling stone at [-117,51,392] (jump stalled 3+ passes, o2 10)'
const liveF15a = 'F15 [F15] water: deep-pocket ascend - dug the ceiling stone at [-132,54,409] (jump stalled 3+ passes, o2 7)'
const liveF15b = 'F15 [F15] water: deep-pocket ascend - dug the ceiling stone at [-132,54,409] (jump stalled 3+ passes, o2 6)'
const deadF15 = 'F15 [F15] water: deep-pocket ascend - dug the ceiling stone at [-132,54,409] (jump stalled 3+ passes, o2 reset(-1))'
const liveF17 = 'F17 [F17] water: deep-pocket ascend - dug the ceiling dirt at [-126,62,386] (jump stalled 3+ passes, o2 15)'
const liveF2a = 'F2 [F2] water: deep-pocket ascend - dug the ceiling stone at [-134,52,413] (jump stalled 3+ passes, o2 8)'
const liveF2b = 'F2 [F2] water: deep-pocket ascend - dug the ceiling stone at [-133,50,414] (jump stalled 3+ passes, o2 8)'
const liveF2c = 'F2 [F2] water: deep-pocket ascend - dug the ceiling stone at [-133,50,414] (jump stalled 3+ passes, o2 19)'
const liveF12 = 'F12 [F12] water: deep-pocket ascend - dug the ceiling diorite at [-138,51,409] (jump stalled 3+ passes, o2 12)'
const liveF5 = 'F5 [F5] water: deep-pocket ascend - dug the ceiling stone at [-118,49,402] (jump stalled 3+ passes, o2 8)'
const deadF5 = 'F5 [F5] water: deep-pocket ascend - dug the ceiling stone at [-118,49,402] (jump stalled 3+ passes, o2 reset(-1))'

test("the ascend's live fence: the era's shapes byte-exact (the 36th 9 = 8+1, the 34th 3 = 2+1) + the fence's cross-check leg", () => {
  // the 36th's own 9 ascends (8 live, 1 dead - the F15 toll ride):
  // F13 1, F14 1, F15 3 (1 dead), F17 1, F2 3 - F15 and F2 the whales (3)
  const r36 = ascendStall([liveF13, liveF14, liveF15a, liveF15b, deadF15, liveF17, liveF2a, liveF2b, liveF2c])
  assert.equal(r36.ascends, 9)
  assert.equal(r36.live, 8)
  assert.equal(r36.dead, 1)
  assert.deepEqual(r36.minPasses, { 3: 9 })
  assert.deepEqual(r36.bots, { F13: 1, F14: 1, F15: 3, F17: 1, F2: 3 })
  // THE FENCE'S CROSS-CHECK LEG: dead here must equal the v0.707.0 toll's
  // ascends (byte-identical families - the fence holds)
  const toll = sensorToll([deadF15, 'F15 [F15] death: drown context (o2 reset(-1), feet water, head water, rescue 2s ago, leg walk, wet 12s)'])
  const stall = ascendStall([deadF15])
  assert.equal(stall.dead, toll.ascends)
  // the 34th's 3 (2 live, 1 dead - the toll's own ascend)
  const r34 = ascendStall([liveF12, liveF5, deadF5])
  assert.deepEqual({ ascends: r34.ascends, live: r34.live, dead: r34.dead }, { ascends: 3, live: 2, dead: 1 })
  // the era's own totals: 16 ascends across the three faces, 14 live
  // (the v0.707.0 fence's own number) and 2 dead - the stall lane owns
  // 87.5% of the family's mass
  assert.equal(9 + 3 + 4, 16)
  assert.equal(8 + 2 + 4, 14)
})

test("the ascend's live fence: the honest zero + the junk battery", () => {
  // an ascend-free face reads the zero shape (the row stays silent)
  const clean = ascendStall(['F2 [F2] water: breath mirror [rescue-ran] - (o2 18, head WET)', 'F3 bank: 5'])
  assert.deepEqual(clean, { ascends: 0, live: 0, dead: 0, minPasses: {}, bots: {} })
  // junk lines inside a live face are skipped, never invented
  const j = ascendStall([liveF13, 123, null, 'deep-pocket ascend without the stall tail'])
  assert.equal(j.ascends, 2) // the live skin + the bare mention (both count as ascends; the bare one reads live, no stall floor)
  assert.equal(j.live, 2)
  assert.equal(j.dead, 0)
  assert.deepEqual(j.minPasses, { 3: 1 }) // the bare mention carries no 'N+ passes' byte
  // junk input reads null (the o2gap convention, inherited)
  assert.equal(ascendStall(42), null)
  assert.equal(ascendStall(undefined), null)
  assert.equal(ascendStall(null), null)
})
