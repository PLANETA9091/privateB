// Stat carry across reconnects (v0.18.9): fleet #129 showed mined 854 -> 620 ->
// 120 through two server-tick storms - each reconnect recreated the miner with
// zero counters and the final report said 0.26 b/s for a 3.6 b/s run. The
// seed-then-snapshot contract here is what keeps the totals honest.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { snapshotStats, seedStats, sentryAttributionRow, CARRY_FIELDS, SWEEP_DROP_FIELDS, drownedKillContextLine, rescueEconomyDecode, RESCUE_ECONOMY_FLOOR_SHARE, RESCUE_ECONOMY_MIN_GLITCHES, rescueHoleRow, RESCUE_HOLE_MIN_UNRESCUED, RESCUE_HOLE_HOLD_SHARE, stormDietRow, STORM_DIET_MIN_GLITCHES, STORM_DIET_BEACH_BLOCKS, sensorLiarRow, SENSOR_LIAR_MIN_IGNORED } from '../../src/lib/statcarry.mjs'

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
  assert.match(src, /if \(rescueEconomy\) \{\s*\n\s*console\.log\(`rescue economy decode: \$\{rescueEconomy\}`\)/)
  const sentryIdx = src.indexOf('sentryAttributionRow(list.map')
  const econIdx = src.indexOf('rescueEconomyDecode({')
  assert.ok(econIdx > sentryIdx, 'the decode rides right after the per-bot attribution row')
  assert.ok(src.includes('THE RESCUE-ECONOMY DECODE'), 'the wiring carries its own doctrine comment')
})

// (v0.326.0) THE RESCUE-HOLE ROW - the economy decode judges the net, the hole
// row judges WHERE the unrescued mass lives: one walk's reach (local) or a
// saturated net (spread). The battery: the run190 face (F7's hole), the
// spread face, the half-boundary, the mass floor, the junk battery, the
// byte-stable tie, the wiring pin.
test('rescueHoleRow: THE RUN190 FACE - F7 holds the hole (local)', () => {
  assert.equal(RESCUE_HOLE_MIN_UNRESCUED, 50)
  assert.equal(RESCUE_HOLE_HOLD_SHARE, 0.5)
  // F7 g343/r8 -> 335 unrescued; F16 g12/r0 -> 12; the rest silent (347 total)
  const row = rescueHoleRow([
    { name: 'F7', stats: { airGlitches: 343, rescues: 8 } },
    { name: 'F16', stats: { airGlitches: 12, rescues: 0 } },
    { name: 'F1', stats: { airGlitches: 0, rescues: 0 } }
  ])
  assert.equal(row, 'rescue hole: local - F7 holds 335u of 347u unrescued (96.5%) - aim the cure there')
})

test('rescueHoleRow: THE SPREAD FACE - no single walk owns the leak', () => {
  // three holders: 200 + 150 + 140 = 490, the top 200 clears only 40.8%
  const row = rescueHoleRow([
    { name: 'F2', stats: { airGlitches: 250, rescues: 50 } },
    { name: 'F9', stats: { airGlitches: 170, rescues: 20 } },
    { name: 'F13', stats: { airGlitches: 140, rescues: 0 } }
  ])
  assert.equal(row, 'rescue hole: spread - top F2 holds 200u of 490u (40.8%) - no single walk owns the leak')
})

test('rescueHoleRow: THE HALF BOUNDARY and the byte-stable tie', () => {
  // exactly half is local (the >= law), and the tie breaks on name ascending
  // even when the larger-name bot comes first in the array
  const row = rescueHoleRow([
    { name: 'F9', stats: { airGlitches: 250, rescues: 0 } },
    { name: 'F2', stats: { airGlitches: 250, rescues: 0 } }
  ])
  assert.equal(row, 'rescue hole: local - F2 holds 250u of 500u unrescued (50.0%) - aim the cure there')
})

test('rescueHoleRow: THE MASS FLOOR - 49u is weather, 50u is a leak', () => {
  assert.equal(rescueHoleRow([{ name: 'F4', stats: { airGlitches: 49, rescues: 0 } }]), null)
  const row = rescueHoleRow([{ name: 'F4', stats: { airGlitches: 50, rescues: 0 } }])
  assert.equal(row, 'rescue hole: local - F4 holds 50u of 50u unrescued (100.0%) - aim the cure there')
})

test('rescueHoleRow: THE JUNK BATTERY - garbage never digs a hole', () => {
  // non-array input is no census at all
  assert.equal(rescueHoleRow(null), null)
  assert.equal(rescueHoleRow('junk'), null)
  assert.equal(rescueHoleRow(undefined), null)
  // an empty fleet has no mass to judge
  assert.equal(rescueHoleRow([]), null)
  // junk stats read g0/r0 (the silent class, the body-guard law)
  assert.equal(rescueHoleRow([
    { name: 'F1', stats: null },
    { name: 'F2', stats: { airGlitches: 'x', rescues: {} } },
    { name: 'F3' }
  ]), null)
  // negative counters are impossible data
  assert.equal(rescueHoleRow([{ name: 'F3', stats: { airGlitches: -5, rescues: -2 } }]), null)
  // rescues outcounting glitches is a carried-counter overhang, not a hole:
  // the row measures holes, not accounting disputes
  assert.equal(rescueHoleRow([{ name: 'F4', stats: { airGlitches: 10, rescues: 30 } }]), null)
  // everything rescued: no hole, no line
  assert.equal(rescueHoleRow([{ name: 'F5', stats: { airGlitches: 100, rescues: 100 } }]), null)
  // a missing name still reports its mass under '?'
  const row = rescueHoleRow([{ stats: { airGlitches: 60, rescues: 0 } }])
  assert.equal(row, 'rescue hole: local - ? holds 60u of 60u unrescued (100.0%) - aim the cure there')
})

test('rescueHoleRow: THE WIRING PIN - the hole row rides the economy verdict', () => {
  const src = readFileSync(new URL('../../testbed/fleet19.mjs', import.meta.url), 'utf8')
  assert.match(src, /rescueHoleRow[\s\S]*?from '\.\.\/src\/lib\/statcarry\.mjs'/)
  assert.match(src, /if \(rescueEconomy\) \{\s*\n\s*console\.log\(`rescue economy decode: \$\{rescueEconomy\}`\)[\s\S]*?rescueHoleRow\(list\.map/)
  const econLogIdx = src.indexOf('rescue economy decode: ${rescueEconomy}')
  const holeIdx = src.indexOf('rescueHoleRow(list.map')
  assert.ok(holeIdx > econLogIdx, 'the hole row prints after the economy verdict, inside its conditional')
  assert.ok(src.includes('THE RESCUE-HOLE ROW'), 'the wiring carries its own doctrine comment')
})

// (v0.329.0) THE STORM-DIET ROW - the hole row names WHERE, the diet row reads
// WHY: the whales' carried byName histogram judged against the beach class
// (sand/gravel/dirt/clay generate at and under the waterline - a wet
// territory's signature). The battery: the two-whale datum, the glitch floor,
// the dark-diet form, the byte-stable beach blocks, the junk battery, the
// wiring pin.
test('stormDietRow: THE TWO-WHALE DATUM - the beach share names itself', () => {
  assert.equal(STORM_DIET_MIN_GLITCHES, 100)
  assert.deepEqual([...STORM_DIET_BEACH_BLOCKS], ['sand', 'gravel', 'dirt', 'clay'])
  // face 36640056641's storm shape with constructed diets: F15 is the deep
  // beach walker, F11 the gravel bank
  const row = stormDietRow([
    { name: 'F15', stats: { airGlitches: 555, byName: { sand: 210, gravel: 45, stone: 15 } } },
    { name: 'F11', stats: { airGlitches: 421, byName: { gravel: 120, sand: 30, stone: 50 } } },
    { name: 'F3', stats: { airGlitches: 2, byName: { sand: 400 } } },
    { name: 'F9', stats: { airGlitches: 0, byName: { stone: 900 } } }
  ])
  assert.equal(row, 'storm diet: F15 94.4% beach-class (sand 210, gravel 45) | F11 75.0% beach-class (gravel 120, sand 30) - the wet territory mines the storm')
})

test('stormDietRow: THE GLITCH FLOOR - a 99-glitch bot is grain', () => {
  // no whale at the floor -> no storm class, no line
  assert.equal(stormDietRow([{ name: 'F7', stats: { airGlitches: 99, byName: { sand: 500 } } }]), null)
  // exactly at the floor the bot is a whale (the >= law)
  const row = stormDietRow([{ name: 'F7', stats: { airGlitches: 100, byName: { sand: 40 } } }])
  assert.equal(row, 'storm diet: F7 100.0% beach-class (sand 40) - the wet territory mines the storm')
})

test('stormDietRow: THE DARK DIET and the dry verdict', () => {
  // a whale with no mined mass reads dark - the honest silence is a form
  const dark = stormDietRow([{ name: 'F11', stats: { airGlitches: 421, byName: {} } }])
  assert.equal(dark, 'storm diet: F11 no mined mass this read - the wet territory mines the storm')
  // a zero-beach diet is evidence TOO: the theory is read, not convicted
  const dry = stormDietRow([{ name: 'F15', stats: { airGlitches: 555, byName: { stone: 300, coal_ore: 100 } } }])
  assert.equal(dry, 'storm diet: F15 0.0% beach-class - the wet territory mines the storm')
})

test('stormDietRow: THE BYTE-STABLE BEACH BLOCKS and the junk battery', () => {
  // equal counts break on name ascending (dirt before gravel before sand)
  const tie = stormDietRow([{ name: 'F4', stats: { airGlitches: 200, byName: { sand: 10, dirt: 10, gravel: 10, stone: 5 } } }])
  assert.equal(tie, 'storm diet: F4 85.7% beach-class (dirt 10, gravel 10) - the wet territory mines the storm')
  // non-array / empty fleet: no census, no storm
  assert.equal(stormDietRow(null), null)
  assert.equal(stormDietRow(undefined), null)
  assert.equal(stormDietRow('junk'), null)
  assert.equal(stormDietRow([]), null)
  // junk stats and junk counts never enter the diet (the body-guard law)
  assert.equal(stormDietRow([
    { name: 'F1', stats: null },
    { name: 'F2', stats: { airGlitches: NaN, byName: { sand: 5 } } },
    { name: 'F3' }
  ]), null)
  const junk = stormDietRow([{ name: 'F8', stats: { airGlitches: 300, byName: { sand: 'x', gravel: -4, dirt: 0, clay: 7.9, stone: 3 } } }])
  assert.equal(junk, 'storm diet: F8 70.0% beach-class (clay 7) - the wet territory mines the storm')
  // a missing name still reports its diet under '?'
  const anon = stormDietRow([{ stats: { airGlitches: 150, byName: { sand: 9 } } }])
  assert.equal(anon, 'storm diet: ? 100.0% beach-class (sand 9) - the wet territory mines the storm')
})

test('stormDietRow: THE WIRING PIN - the diet rides the storm class', () => {
  const src = readFileSync(new URL('../../testbed/fleet19.mjs', import.meta.url), 'utf8')
  assert.match(src, /stormDietRow[\s\S]*?from '\.\.\/src\/lib\/statcarry\.mjs'/)
  assert.match(src, /if \(stormDiet\) console\.log\(stormDiet\)/)
  const holeIdx = src.indexOf('if (rescueHole) console.log(rescueHole)')
  const dietIdx = src.indexOf('const stormDiet = stormDietRow(list.map')
  const closeIdx = src.indexOf('}\n// (v0.52.0) the server-death verdict')
  assert.ok(dietIdx > holeIdx, 'the diet row prints after the hole row it explains')
  assert.ok(closeIdx > dietIdx, 'the diet row lives inside the economy conditional')
  assert.ok(src.includes('THE STORM-DIET ROW'), 'the wiring carries its own doctrine comment')
})

// (v0.346.0) THE ABANDON CARRY - face 36700431959 printed F18's hand (log
// line 1423) and the storm row still read no hands tail: the relog after the
// hand rebuilt the miner and the v0.18.9 carry moved only CARRY_FIELDS - the
// v0.342.0 counter was born outside the list (the v0.293.0 sweepDrops
// mortality's exact shape).
test('stat carry: the abandon hand survives the respawn (the face-7 mismatch cure)', () => {
  // the hand exists pre-relog: snapshotStats must pick it up
  const carry = snapshotStats({ mined: 5, glitchAbandons: 1 })
  assert.equal(carry.glitchAbandons, 1)
  // the respawn seeds it back onto the fresh miner's stats
  const fresh = { mined: 0, glitchAbandons: 0 }
  seedStats(fresh, carry)
  assert.equal(fresh.glitchAbandons, 1, 'the report-time counter must still read the hand')
  assert.equal(fresh.mined, 5)
  // a second hand after the relog sums on top (monotone)
  const fresh2 = { glitchAbandons: 2 }
  seedStats(fresh2, { glitchAbandons: 1 })
  assert.equal(fresh2.glitchAbandons, 3)
})

test('stat carry: glitchAbandons rides CARRY_FIELDS (the storm row hands source)', () => {
  assert.ok(CARRY_FIELDS.includes('glitchAbandons'))
  // the junk gates still hold: zero and NaN never travel
  assert.deepEqual(snapshotStats({ glitchAbandons: 0 }), {})
  assert.deepEqual(snapshotStats({ glitchAbandons: NaN }), {})
  assert.deepEqual(snapshotStats({ glitchAbandons: -1 }), {})
})

// ---------------------------------------------------------------------------
// (v0.356.0) THE HONEST HOLE - the raw mass (g - r) counted the reads the net
// DISPROVED, and face 36733939481's F12 ghost is the proof: g600/r5 printed
// 'rescue hole: local - F12 holds 595u (100%) - aim the cure there' while the
// net actually HELD (4 override hands, 6 starts, 3 ladder ratchets). The
// honest mass subtracts stats.airGlitchIgnored beside the rescues; the
// sensor-liar census prices the disprovals the honest hole row hides.
// ---------------------------------------------------------------------------
test('rescueHoleRow: THE FACE-12 GHOST - the disproved reads leave the leak', () => {
  // the exact face-12 shape: g600/r5 with 594 reads disproved reads u=1 -
  // below the 50u floor the row goes silent (the ghost stops mis-aiming)
  assert.equal(rescueHoleRow([{ name: 'F12', stats: { airGlitches: 600, rescues: 5, airGlitchIgnored: 594 } }]), null)
  // a ghost beside a REAL holder: the aim moves to the honest leak
  const row = rescueHoleRow([
    { name: 'F12', stats: { airGlitches: 600, rescues: 5, airGlitchIgnored: 594 } },
    { name: 'F9', stats: { airGlitches: 120, rescues: 10, airGlitchIgnored: 0 } }
  ])
  assert.equal(row, 'rescue hole: local - F9 holds 110u of 111u unrescued (99.1%) - aim the cure there')
})

test('rescueHoleRow: THE MISSING COUNTER READS LEGACY - no invented disprovals', () => {
  // a bot whose stats predate the cure (no airGlitchIgnored field) reads
  // exactly the legacy shape - the face-12 line stands as the pin (the
  // body-guard law: a MISSING counter is zero, not a claim)
  const row = rescueHoleRow([{ name: 'F12', stats: { airGlitches: 600, rescues: 5 } }])
  assert.equal(row, 'rescue hole: local - F12 holds 595u of 595u unrescued (100.0%) - aim the cure there')
  // junk ignored counters read zero the same way
  const junk = rescueHoleRow([{ name: 'F4', stats: { airGlitches: 60, rescues: 0, airGlitchIgnored: 'x' } }])
  assert.equal(junk, 'rescue hole: local - F4 holds 60u of 60u unrescued (100.0%) - aim the cure there')
})

test('rescueHoleRow: THE IGNORED CLAMP - disprovals never dig a negative hole', () => {
  // ignored >= g clamps to zero mass (overhang junk, the carried-counter law)
  assert.equal(rescueHoleRow([{ name: 'F4', stats: { airGlitches: 100, rescues: 0, airGlitchIgnored: 150 } }]), null)
  assert.equal(rescueHoleRow([{ name: 'F4', stats: { airGlitches: 100, rescues: 30, airGlitchIgnored: 100 } }]), null)
  // negative ignored is impossible data (reads zero, the legacy shape)
  const row = rescueHoleRow([{ name: 'F4', stats: { airGlitches: 60, rescues: 0, airGlitchIgnored: -5 } }])
  assert.equal(row, 'rescue hole: local - F4 holds 60u of 60u unrescued (100.0%) - aim the cure there')
})

test('sensorLiarRow: THE FLOOR BOUNDARY - 199 disprovals are weather, 200 are a lie', () => {
  assert.equal(SENSOR_LIAR_MIN_IGNORED, 200)
  assert.equal(sensorLiarRow([{ name: 'F12', stats: { airGlitchIgnored: 199 } }]), null)
  const row = sensorLiarRow([{ name: 'F12', stats: { airGlitchIgnored: 200 } }])
  assert.equal(row, 'sensor liar census: F12 disproved 200 reads - the bar lies, the net held (the honest hole row reads clean)')
})

test('sensorLiarRow: THE BYTE-STABLE TIE and the junk battery', () => {
  // the largest disproved mass wins, ties break on name ascending
  const tie = sensorLiarRow([
    { name: 'F9', stats: { airGlitchIgnored: 300 } },
    { name: 'F2', stats: { airGlitchIgnored: 300 } }
  ])
  assert.equal(tie, 'sensor liar census: F2 disproved 300 reads - the bar lies, the net held (the honest hole row reads clean)')
  const big = sensorLiarRow([
    { name: 'F9', stats: { airGlitchIgnored: 301 } },
    { name: 'F2', stats: { airGlitchIgnored: 300 } }
  ])
  assert.equal(big, 'sensor liar census: F9 disproved 301 reads - the bar lies, the net held (the honest hole row reads clean)')
  // junk battery: non-array, empty, missing stats, junk counters, sub-floor
  assert.equal(sensorLiarRow(null), null)
  assert.equal(sensorLiarRow('junk'), null)
  assert.equal(sensorLiarRow(undefined), null)
  assert.equal(sensorLiarRow([]), null)
  assert.equal(sensorLiarRow([{ name: 'F1', stats: null }, { name: 'F2' }]), null)
  assert.equal(sensorLiarRow([{ name: 'F3', stats: { airGlitchIgnored: 'x' } }]), null)
  assert.equal(sensorLiarRow([{ name: 'F4', stats: { airGlitchIgnored: -5 } }]), null)
  // a junk counter beside a real one: the real one speaks
  const mixed = sensorLiarRow([
    { name: 'F1', stats: { airGlitchIgnored: 'x' } },
    { name: 'F2', stats: { airGlitchIgnored: 250 } }
  ])
  assert.equal(mixed, 'sensor liar census: F2 disproved 250 reads - the bar lies, the net held (the honest hole row reads clean)')
  // a custom floor rides opts (the speak floor is a knob, not a constant)
  assert.equal(sensorLiarRow([{ name: 'F5', stats: { airGlitchIgnored: 100 } }], { minIgnored: 99 }).includes('F5'), true)
})

test('stat carry: airGlitchIgnored rides CARRY_FIELDS (the honest hole source)', () => {
  assert.ok(CARRY_FIELDS.includes('airGlitchIgnored'))
  // the junk gates still hold: zero and NaN never travel
  assert.deepEqual(snapshotStats({ airGlitchIgnored: 0 }), {})
  assert.deepEqual(snapshotStats({ airGlitchIgnored: NaN }), {})
  assert.deepEqual(snapshotStats({ airGlitchIgnored: -1 }), {})
  // the relog round-trip: the disprovals survive the respawn
  const carry = snapshotStats({ mined: 7, airGlitchIgnored: 594 })
  assert.equal(carry.airGlitchIgnored, 594)
  const fresh = { mined: 0, airGlitchIgnored: 0 }
  seedStats(fresh, carry)
  assert.equal(fresh.airGlitchIgnored, 594, 'the disproved reads must outlive the relog')
})

test('THE HONEST HOLE: the wiring pins (the counter, the honest input, the census)', () => {
  // the miner counts the non-drowning critical-on-dry reads (the disproved class)
  const minerSrc = readFileSync(new URL('../../src/bots/miner.mjs', import.meta.url), 'utf8')
  assert.match(minerSrc, /if \(criticalOnDry && verdict !== 'drowning'\) stats\.airGlitchIgnored = \(stats\.airGlitchIgnored \?\? 0\) \+ 1/, 'the increment rides the sentry verdict, after it is computed')
  const incIdx = minerSrc.indexOf("if (criticalOnDry && verdict !== 'drowning') stats.airGlitchIgnored")
  const sentryIdx = minerSrc.indexOf('sentryLast = { at: now, verdict, criticalOnDry, witnessed, o2: o2raw, headWet }')
  assert.ok(incIdx > sentryIdx, 'the counter reads the verdict the mirror already computed')
  // the fleet wires the census beside the air-bar ledger and feeds the
  // economy decode the honest sum (raw - disproved)
  const fleetSrc = readFileSync(new URL('../../testbed/fleet19.mjs', import.meta.url), 'utf8')
  assert.match(fleetSrc, /sensorLiarRow[\s\S]*?from '\.\.\/src\/lib\/statcarry\.mjs'/, 'the census rides the statcarry import line')
  assert.match(fleetSrc, /airGlitches: list\.reduce\(\(a, m\) => a \+ \(m\.stats\?\.airGlitches \?\? 0\) - \(m\.stats\?\.airGlitchIgnored \?\? 0\), 0\)/, 'the economy decode reads the honest sum')
  const censusIdx = fleetSrc.indexOf('const sensorLiar = sensorLiarRow(')
  const ledgerIdx = fleetSrc.indexOf('const airBarLedger = airBarLedgerRow(')
  assert.ok(censusIdx > ledgerIdx, 'the census prints beside the ledger it completes')
  assert.ok(fleetSrc.includes('THE SENSOR-LIAR CENSUS'), 'the wiring carries its own doctrine comment')
})

// (v0.359.0) THE DRY DIET - the wet-rescue exclusion reaches the whale floor
test('stormDietRow: THE DRY DIET - an all-wet whale is the rescue, not the territory (the face-12 replay)', () => {
  // F12's shape: 600 glitches all inside the wet window, the mined mass all beach
  assert.equal(
    stormDietRow([{ name: 'F12', stats: { airGlitches: 600, wetRescueGlitches: 600, byName: { sand: 310, dirt: 180 } } }]),
    null
  )
})

test('stormDietRow: THE DRY DIET - the clamp keeps the exclusion honest', () => {
  // wet > total: clamped to the total, dry 0 drops the whale
  assert.equal(
    stormDietRow([{ name: 'F3', stats: { airGlitches: 100, wetRescueGlitches: 250, byName: { sand: 90 } } }]),
    null
  )
})

test('stormDietRow: THE DRY DIET - a mixed whale survives and names the excluded share', () => {
  const row = stormDietRow([{ name: 'F8', stats: { airGlitches: 300, wetRescueGlitches: 150, byName: { sand: 40, dirt: 30, stone: 30 } } }])
  assert.equal(row, 'storm diet: F8 70.0% beach-class (sand 40, dirt 30), wet-rescued 150 - the wet territory mines the storm')
})

test('stormDietRow: THE DRY DIET - the floor reads the dry sum from both sides', () => {
  // dry exactly the floor: stays (inclusive, the v0.329.0 law)
  const at = stormDietRow([{ name: 'F6', stats: { airGlitches: 200, wetRescueGlitches: 100, byName: { gravel: 12 } } }])
  assert.equal(at, 'storm diet: F6 100.0% beach-class (gravel 12), wet-rescued 100 - the wet territory mines the storm')
  // dry one under: grain
  assert.equal(
    stormDietRow([{ name: 'F6', stats: { airGlitches: 199, wetRescueGlitches: 100, byName: { gravel: 12 } } }]),
    null
  )
})

test('stormDietRow: THE DRY DIET - junk wet never invents an exclusion (the sync law)', () => {
  const base = { airGlitches: 120, byName: { sand: 12 } }
  const legacy = stormDietRow([{ name: 'F9', stats: { ...base } }])
  assert.equal(legacy, 'storm diet: F9 100.0% beach-class (sand 12) - the wet territory mines the storm')
  for (const junk of [0, NaN, -5, '7', null, undefined]) {
    assert.equal(stormDietRow([{ name: 'F9', stats: { ...base, wetRescueGlitches: junk } }]), legacy)
  }
})

test('stormDietRow: THE DRY DIET - the all-wet whale leaves the line, the mixed one names its share', () => {
  const row = stormDietRow([
    { name: 'F12', stats: { airGlitches: 600, wetRescueGlitches: 600, byName: { sand: 310 } } },
    { name: 'F8', stats: { airGlitches: 300, wetRescueGlitches: 150, byName: { sand: 40, dirt: 30, stone: 30 } } },
    { name: 'F2', stats: { airGlitches: 3, byName: { sand: 3 } } }
  ])
  assert.equal(row, 'storm diet: F8 70.0% beach-class (sand 40, dirt 30), wet-rescued 150 - the wet territory mines the storm')
})

test('stormDietRow: THE DRY DIET - the dark all-wet whale stays dark and silent', () => {
  assert.equal(stormDietRow([{ name: 'F11', stats: { airGlitches: 421, wetRescueGlitches: 421, byName: {} } }]), null)
})

test('stormDietRow: THE DRY DIET - the wiring pin (the fleet feed carries the stats object)', () => {
  const fleetSrc = readFileSync(new URL('../../testbed/fleet19.mjs', import.meta.url), 'utf8')
  assert.match(fleetSrc, /stormDietRow\(list\.map\(m => \(\{ name: m\.username, stats: m\.stats \}\)\)\)/, 'the diet row reads the per-bot stats (wetRescueGlitches rides inside)')
})
