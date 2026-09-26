// Stat carry across reconnects (v0.18.9): fleet #129 showed mined 854 -> 620 ->
// 120 through two server-tick storms - each reconnect recreated the miner with
// zero counters and the final report said 0.26 b/s for a 3.6 b/s run. The
// seed-then-snapshot contract here is what keeps the totals honest.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { snapshotStats, seedStats, sentryAttributionRow, CARRY_FIELDS } from '../../src/lib/statcarry.mjs'

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

// (v0.195.0) THE SENTRY ATTRIBUTION ROW - run190's blind spot #2: the
// airGlitches counter read 383 fleet-wide while the log carried 16 lines, all
// from ONE bot. The row makes the counter attributable in the mined surface.
test('sentry attribution: the run190 class - one loud bot, the rest silent', () => {
  const row = sentryAttributionRow([
    { name: 'F1', stats: { mined: 149 } }, // busy bot, no sentry events
    { name: 'F7', stats: { airGlitches: 343, rescues: 8 } },
    { name: 'F8', stats: {} },
    { name: 'F16', stats: { airGlitches: 12 } }
  ])
  assert.equal(row, 'sentry per-bot: F7 g343/r8 F16 g12/r0 | 2 g0/r0')
})

test('sentry attribution: all-zero still prints the row (the filter-blind-spot lesson)', () => {
  assert.equal(sentryAttributionRow([{ name: 'F1', stats: { mined: 5 } }, { name: 'F2', stats: {} }]), 'sentry per-bot: all 2 g0/r0')
  assert.equal(sentryAttributionRow([]), 'sentry per-bot: all 0 g0/r0', 'an empty fleet prints the row too - silence is never evidence')
})

test('sentry attribution: rescues alone name the bot (the rescues-56 decode class)', () => {
  const row = sentryAttributionRow([{ name: 'F3', stats: { rescues: 12 } }, { name: 'F4', stats: { mined: 9 } }])
  assert.equal(row, 'sentry per-bot: F3 g0/r12 | 1 g0/r0')
})

test('sentry attribution: junk is silent, never NaN, never a crash', () => {
  assert.equal(sentryAttributionRow(), 'sentry per-bot: all 0 g0/r0')
  assert.equal(sentryAttributionRow(null), 'sentry per-bot: all 0 g0/r0')
  assert.equal(sentryAttributionRow('junk'), 'sentry per-bot: all 0 g0/r0')
  const row = sentryAttributionRow([
    null, // a junk slot
    { name: 'F2' }, // no stats object
    { name: 'F4', stats: { airGlitches: NaN } },
    { name: 'F5', stats: { rescues: -3 } },
    { stats: { airGlitches: 7 } }, // missing name
    { name: 'F9', stats: { airGlitches: 2.7 } } // fractional junk floors
  ])
  assert.equal(row, 'sentry per-bot: ? g7/r0 F9 g2/r0 | 4 g0/r0')
})

test('sentry attribution: the row always opens with the mining key', () => {
  assert.ok(sentryAttributionRow([]).startsWith('sentry per-bot:'))
  assert.ok(sentryAttributionRow([{ name: 'F1', stats: { airGlitches: 5 } }]).startsWith('sentry per-bot:'))
})
