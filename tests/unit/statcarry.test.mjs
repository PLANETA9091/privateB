// Stat carry across reconnects (v0.18.9): fleet #129 showed mined 854 -> 620 ->
// 120 through two server-tick storms - each reconnect recreated the miner with
// zero counters and the final report said 0.26 b/s for a 3.6 b/s run. The
// seed-then-snapshot contract here is what keeps the totals honest.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { snapshotStats, seedStats, sentryAttributionRow, CARRY_FIELDS, SWEEP_DROP_FIELDS, drownedKillContextLine, rescueEconomyDecode, RESCUE_ECONOMY_FLOOR_SHARE, RESCUE_ECONOMY_MIN_GLITCHES } from '../../src/lib/statcarry.mjs'

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
// ---- (v0.262.0) THE DROWNED-KILL SHORE CONTEXT - the mob-Drowned class ----

test('drowned-kill context: the waterline class (dry feet, water beside)', () => {
  const line = drownedKillContextLine({
    tag: 'F7', attacker: 'Drowned', feet: 'sand', head: 'sand',
    neighbors: [{ name: 'water', d: 'e' }, { name: 'stone', d: 'w' }, { name: null, d: 's' }, { name: 'sand', d: 'n' }],
    feetY: 64
  })
  assert.equal(line, 'F7 death: drowned-kill context (waterline, y 64, feet sand, head sand, water e)')
})

test('drowned-kill context: in-water (wet feet own the class over the neighbors)', () => {
  const line = drownedKillContextLine({
    tag: 'F3', attacker: 'drowned', feet: 'water', head: 'water',
    neighbors: [{ name: 'water', d: 'e' }, { name: 'water', d: 'w' }], feetY: 62
  })
  assert.equal(line, 'F3 death: drowned-kill context (in-water, y 62, feet water, head water, water e/w)')
})

test('drowned-kill context: dry-shore (the Drowned came ashore)', () => {
  const line = drownedKillContextLine({
    tag: 'F15', attacker: 'Drowned', feet: 'grass_block', head: 'air',
    neighbors: [{ name: 'grass_block', d: 'e' }, { name: 'dirt', d: 'w' }, { name: 'grass_block', d: 's' }, { name: 'dirt', d: 'n' }],
    feetY: 64
  })
  assert.equal(line, 'F15 death: drowned-kill context (dry-shore, y 64, feet grass_block, head air, water none)')
})

test('drowned-kill context: the attacker gate (only the Drowned class prints)', () => {
  const world = { feet: 'sand', head: 'sand', neighbors: [{ name: 'water', d: 'e' }], feetY: 64 }
  assert.equal(drownedKillContextLine({ tag: 'F1', attacker: 'Zombie', ...world }), null)
  assert.equal(drownedKillContextLine({ tag: 'F1', attacker: 'Witch', ...world }), null)
  assert.equal(drownedKillContextLine({ tag: 'F1', attacker: null, ...world }), null)
  assert.equal(drownedKillContextLine({ tag: 'F1', attacker: 42, ...world }), null)
  // junk-padded names never read as the class
  assert.equal(drownedKillContextLine({ tag: 'F1', attacker: 'DrownedBrute', ...world }), null)
})

test('drowned-kill context: the case-insensitive class + the doomed-to-fall twin', () => {
  for (const a of ['Drowned', 'drowned', 'DROWNED']) {
    const line = drownedKillContextLine({ tag: 'F9', attacker: a, feet: 'sand', neighbors: [], feetY: 64 })
    assert.ok(line && line.includes('dry-shore'), a)
  }
})

test('drowned-kill context: junk world is a refusal, never a fabricated class', () => {
  // every read null -> nothing to say (a null world must not read dry-shore)
  assert.equal(drownedKillContextLine({ tag: 'F1', attacker: 'Drowned' }), null)
  assert.equal(drownedKillContextLine({ tag: 'F1', attacker: 'Drowned', feet: null, head: null, neighbors: null, feetY: null }), null)
})

test('drowned-kill context: partial junk reads honestly (unknown, never a guess)', () => {
  // scan failed but the feet read: water unknown, class from the feet only
  const line = drownedKillContextLine({ tag: 'F13', attacker: 'Drowned', feet: 'sand', head: null, neighbors: null, feetY: null })
  assert.equal(line, 'F13 death: drowned-kill context (dry-shore, y ?, feet sand, head unknown, water unknown)')
  // a null neighbor slot is an unloaded chunk, not dry land: it renders nothing
  const line2 = drownedKillContextLine({ tag: 'F13', attacker: 'Drowned', feet: 'sand', neighbors: [{ name: null, d: 'e' }, { name: 'kelp', d: 'w' }], feetY: 64 })
  assert.equal(line2, 'F13 death: drowned-kill context (waterline, y 64, feet sand, head unknown, water w)')
})

test('drowned-kill context: waterlogged gravel reads its class through the wl flag', () => {
  const line = drownedKillContextLine({
    tag: 'F19', attacker: 'Drowned', feet: 'gravel', head: 'water',
    feetWaterlogged: true,
    neighbors: [{ name: 'water', d: 'n' }], feetY: 63
  })
  assert.equal(line, 'F19 death: drowned-kill context (in-water, y 63, feet gravel wl, head water, water n)')
})

test('the sweep census carry: the view survives the death (v0.293.0)', () => {
  // face 36476752446 read the mortality gap live: F7's stance step CONVERTED
  // (armed 2.4 -> landed 0.9, a legal dy-1 shake-only took) and the fleet row
  // read step=0 stepcut=0 - line 822, F7 was blown up by a Creeper minutes
  // later; the carry moved only CARRY_FIELDS + byName and the census view
  // (v0.203.0) orphaned with the instance. The view rides the carry now.
  const dead = { mined: 100, sweepDrops: { sweeps: 4, picked: 30, failed: 2, stanceStep: 1, stanceCut: 1, seal3: 3, above1: 2, aboveHigh: 1, junk: 5, bad: -1, nan: NaN } }
  const carry = snapshotStats(dead)
  assert.equal(carry.mined, 100)
  assert.deepEqual(carry.sweepDrops, { sweeps: 4, picked: 30, failed: 2, stanceStep: 1, stanceCut: 1, seal3: 3, above1: 2, aboveHigh: 1 }, 'the census view travels field-wise; junk/negative/NaN stay home')
  // a fresh miner with NO view: the seed builds the FULL zeroed shape (the
  // miner's ride does `stats.sweepDrops ?? (stats.sweepDrops = {...})` - a
  // partial view would skip the init and NaN the first sd.sweeps++)
  const fresh = {}
  seedStats(fresh, carry)
  for (const f of SWEEP_DROP_FIELDS) {
    assert.ok(Number.isFinite(fresh.sweepDrops[f]), `the seeded view is whole: ${f} is finite`)
  }
  assert.equal(fresh.sweepDrops.sweeps, 4)
  assert.equal(fresh.sweepDrops.stanceStep, 1)
  assert.equal(fresh.sweepDrops.stanceCut, 1)
  assert.equal(fresh.sweepDrops.stanceCut, 1)
  assert.equal(fresh.sweepDrops.sealNear, 0, 'untouched fields zero, not undefined (the ride += needs numbers)')
  assert.equal(fresh.sweepDrops.above1, 2, 'the height bands ride the seed like every other field (v0.294.0)')
  assert.equal(fresh.sweepDrops.aboveHigh, 1)
  // the ride continues on the seeded view and the next snapshot is absolute
  fresh.sweepDrops.sweeps += 2
  fresh.sweepDrops.stanceCut += 1
  const carry2 = snapshotStats(fresh)
  assert.equal(carry2.sweepDrops.sweeps, 6, 'absolute snapshot (seed included), never merged twice')
  assert.equal(carry2.sweepDrops.stanceCut, 2)
  // seeding onto an EXISTING view sums (the double-reconnect chain)
  seedStats(fresh, { sweepDrops: { stanceCut: 3 } })
  assert.equal(fresh.sweepDrops.stanceCut, 5)
  // junk-safe
  seedStats(fresh, { sweepDrops: 'junk' })
  seedStats(fresh, { sweepDrops: null })
  assert.equal(fresh.sweepDrops.stanceCut, 5, 'a junk view is a no-op')
  assert.deepEqual(snapshotStats({ sweepDrops: {} }), {}, 'an empty census view carries nothing')
})

test('the sweep census carry: the field list covers the miner ride (v0.293.0)', () => {
  // the lib owns the carry list; the miner owns the ride-site default init.
  // The two must agree - a field added to the ride without joining the list
  // would silently orphan again (the identity-extend discipline, pinned).
  const minerSrc = readFileSync(new URL('../../src/bots/miner.mjs', import.meta.url), 'utf8')
  const initAt = minerSrc.indexOf("stats.sweepDrops ?? (stats.sweepDrops = {")
  assert.ok(initAt > 0, 'the ride-site default init exists')
  const initEnd = minerSrc.indexOf('})', initAt)
  const init = minerSrc.slice(initAt, initEnd)
  for (const f of SWEEP_DROP_FIELDS) {
    assert.ok(init.includes(`${f}: 0`), `the ride init carries ${f}: 0 (the lib's carry list covers it)`)
  }
})

// ---------------------------------------------------------------------------
// (v0.325.0) THE RESCUE-ECONOMY DECODE - the sentry pair judged as an
// economy: fleet 36626921875 read 257 glitches/54 rescues (21.0%), fleet
// 36631612575 read 699/75 (10.7%) - the share halved unjudged. These tests
// pin the two faces, the floor boundary, the sample-mass floor, the junk
// discipline, and the wiring.
// ---------------------------------------------------------------------------

test('rescueEconomyDecode: THE TWO FACES - 21.0% stays quiet, 10.7% speaks', () => {
  assert.equal(RESCUE_ECONOMY_FLOOR_SHARE, 0.15)
  assert.equal(RESCUE_ECONOMY_MIN_GLITCHES, 100)
  // the healthy face: 54/257 = 21.0% >= the floor - the net holds, silent
  assert.equal(rescueEconomyDecode({ airGlitches: 257, rescues: 54 }), null)
  // the worsening face: 75/699 = 10.7% < the floor - the net loses ground
  const v = rescueEconomyDecode({ airGlitches: 699, rescues: 75 })
  assert.equal(v, 'rescue economy: 75 rescues for 699 air glitches = 10.7% - the net is losing ground')
})

test('rescueEconomyDecode: THE FLOOR BOUNDARY - at the floor the net holds', () => {
  // exactly at the floor: holds (the >= law)
  assert.equal(rescueEconomyDecode({ airGlitches: 100, rescues: 15 }), null)
  // one rescue under: speaks
  const v = rescueEconomyDecode({ airGlitches: 100, rescues: 14 })
  assert.equal(v, 'rescue economy: 14 rescues for 100 air glitches = 14.0% - the net is losing ground')
})

test('rescueEconomyDecode: THE SAMPLE-MASS FLOOR and the junk discipline', () => {
  // a small sample is grain, not a trend
  assert.equal(rescueEconomyDecode({ airGlitches: 30, rescues: 0 }), null)
  // zero glitches: no sample, no verdict (and never a division)
  assert.equal(rescueEconomyDecode({ airGlitches: 0, rescues: 0 }), null)
  // junk never invents an economy (the body-guard law)
  assert.equal(rescueEconomyDecode({}), null)
  assert.equal(rescueEconomyDecode(null), null)
  assert.equal(rescueEconomyDecode({ airGlitches: NaN, rescues: 5 }), null)
  assert.equal(rescueEconomyDecode({ airGlitches: 699, rescues: NaN }), null)
  assert.equal(rescueEconomyDecode({ airGlitches: null, rescues: 75 }), null)
  // negative counters are impossible data
  assert.equal(rescueEconomyDecode({ airGlitches: -5, rescues: 3 }), null)
  assert.equal(rescueEconomyDecode({ airGlitches: 699, rescues: -3 }), null)
})

test('rescueEconomyDecode: THE WIRING PIN - the report block judges the net', () => {
  const src = readFileSync(new URL('../../testbed/fleet19.mjs', import.meta.url), 'utf8')
  assert.match(src, /rescueEconomyDecode[\s\S]*?from '\.\.\/src\/lib\/statcarry\.mjs'/)
  assert.match(src, /rescueEconomyDecode\(\{\s*\n\s*airGlitches: list\.reduce/)
  assert.match(src, /if \(rescueEconomy\) console\.log\(`rescue economy decode: \$\{rescueEconomy\}`\)/)
  const sentryIdx = src.indexOf('sentryAttributionRow(list.map')
  const econIdx = src.indexOf('rescueEconomyDecode({')
  assert.ok(econIdx > sentryIdx, 'the decode rides right after the per-bot attribution row')
  assert.ok(src.includes('THE RESCUE-ECONOMY DECODE'), 'the wiring carries its own doctrine comment')
})
