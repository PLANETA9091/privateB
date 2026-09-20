// Stat carry across reconnects (v0.18.9): fleet #129 showed mined 854 -> 620 ->
// 120 through two server-tick storms - each reconnect recreated the miner with
// zero counters and the final report said 0.26 b/s for a 3.6 b/s run. The
// seed-then-snapshot contract here is what keeps the totals honest.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { snapshotStats, seedStats, CARRY_FIELDS } from '../../src/lib/statcarry.mjs'

test('stat carry: seed + work + snapshot preserves totals (the storm contract)', () => {
  // attempt 1: bot mines 300, then dies
  const s1 = { mined: 300, rescues: 2, byName: { stone: 200, coal_ore: 100 } }
  const carry = snapshotStats(s1)
  assert.equal(carry.mined, 300)
  assert.deepEqual(carry.byName, { stone: 200, coal_ore: 100 })
  // attempt 2: fresh zero miner, seeded, mines 40 more
  const s2 = { mined: 0, shaftEntryY: 42, startedAt: 12345 }
  seedStats(s2, carry)
  assert.equal(s2.mined, 300, 'the fresh miner inherits the storm history')
  assert.equal(s2.shaftEntryY, 42, 'per-attempt fields are NOT carried')
  s2.mined += 40
  s2.byName.stone += 40
  const carry2 = snapshotStats(s2)
  assert.equal(carry2.mined, 340, 'absolute snapshot (seed included), never merged twice')
  assert.deepEqual(carry2.byName, { stone: 240, coal_ore: 100 })
})

test('stat carry: coordinate and timestamp fields never travel', () => {
  const stats = { mined: 5 }
  seedStats(stats, { mined: 9, shaftEntryY: 42, startedAt: 999, banked: 3 })
  assert.equal(stats.mined, 14)
  assert.equal(stats.banked, 3)
  assert.equal(stats.shaftEntryY, undefined, 'a Y coordinate must not be summed')
  assert.equal(stats.startedAt, undefined, 'a timestamp must not be summed')
  assert.ok(!CARRY_FIELDS.includes('shaftEntryY'))
  assert.ok(!CARRY_FIELDS.includes('startedAt'))
})

test('stat carry: junk inputs are safe no-ops', () => {
  assert.deepEqual(snapshotStats(null), {})
  assert.deepEqual(snapshotStats(undefined), {})
  assert.deepEqual(snapshotStats('nope'), {})
  const stats = { mined: 1 }
  assert.equal(seedStats(stats, null), stats)
  assert.equal(seedStats(stats, 'junk'), stats)
  assert.equal(seedStats(null, { mined: 1 }), null)
  // NaN/zero/negative counters are not carried
  const junk = snapshotStats({ mined: NaN, rescues: 0, claims: -3 })
  assert.deepEqual(junk, {})
})

test('stat carry: byName junk entries are filtered', () => {
  const carry = snapshotStats({ byName: { stone: 5, junk: NaN, zero: 0 } })
  assert.deepEqual(carry.byName, { stone: 5 })
})

test('stat carry: seeding creates byName when the fresh miner has none', () => {
  const stats = {}
  seedStats(stats, { byName: { stone: 7 } })
  assert.deepEqual(stats.byName, { stone: 7 })
})
