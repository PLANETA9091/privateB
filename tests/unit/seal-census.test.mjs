// (v0.397.0) THE SEAL-RESERVE CENSUS - unit pins (the shooter-census
// v0.390.0 test shape). Every anatomy constant is VERBATIM from the
// source's own log templates (src/lib/deposit.mjs, the v0.101.0 bounded
// self-naming the four families share): the first 2 firings name
// themselves + the kept floor, the 3rd prints the rider, the rest are
// silent - the census reads what the fleet named, never invents the
// silent tail. The honest zero baseline: a face where no keep fired
// (run84a/run108 carry zero tithe lines) reads zeros, not nulls.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseSealBanked, parseSealRider, parseSealKept, parseSealKeepRider, sealCensus,
  SEAL_BANKED_RE, SEAL_RIDER_RE, SEAL_KEPT_RE, SEAL_KEEP_RIDER_RE,
} from '../../src/lib/sealcensus.mjs'

// verbatims (the deposit.mjs templates in the field's DOUBLE-TAG anatomy,
// verified against the held fleet19.log's same-emitter lines)
const SEAL_BANKED = 'F7 [F7] seal reserve: banked 6 x dirt (pocket keeps 8 seal units)'
const SEAL_BANKED_COBBLE = 'F7 [F7] seal reserve: banked 3 x cobblestone (pocket keeps 8 seal units)'
const SEAL_RIDER = 'F7 [F7] seal reserve: more firings ride the banked total'
const FUEL_BANKED = 'F2 [F2] fuel tithe: banked 3 x coal (pocket keeps 4)'
const FUEL_RIDER = 'F2 [F2] fuel tithe: more firings ride the banked total'
const COBBLE_BANKED = 'F5 [F5] cobble tithe: banked 8 x cobblestone (pocket keeps 4)'
const COBBLE_RIDER = 'F5 [F5] cobble tithe: more firings ride the banked total'
const SMELT_BANKED = 'F9 [F9] smelt tithe: banked 5 x raw_iron (pocket keeps 3)'
const SMELT_RIDER = 'F9 [F9] smelt tithe: more firings ride the banked total'
// (v0.405.0) the keep arm's verbatims (deposit.mjs's keep branch, the
// tithe's bounded shape byte-adjacent)
const SEAL_KEPT = 'F14 [F14] seal reserve: kept 6 x cobblestone (the family floor holds)'
const SEAL_KEPT_DIRT = 'F18 [F18] seal reserve: kept 4 x dirt (the family floor holds)'
const SEAL_KEEP_RIDER = 'F3 [F3] seal reserve: more keeps ride the family floor'

test('seal-reserve banked verbatim: bot, family, units, item, kept floor', () => {
  assert.deepEqual(parseSealBanked(SEAL_BANKED), {
    bot: 'F7', family: 'seal-reserve', moved: 6, name: 'dirt', kept: 8,
  })
})

test('seal-reserve cobble firing: the smelt leg overage rides the census too', () => {
  const e = parseSealBanked(SEAL_BANKED_COBBLE)
  assert.equal(e.family, 'seal-reserve')
  assert.equal(e.name, 'cobblestone')
  assert.equal(e.kept, 8)
})

test('tithe banked verbatims: the three older families parse under their own names', () => {
  assert.deepEqual(parseSealBanked(FUEL_BANKED), {
    bot: 'F2', family: 'fuel-tithe', moved: 3, name: 'coal', kept: 4,
  })
  assert.deepEqual(parseSealBanked(COBBLE_BANKED), {
    bot: 'F5', family: 'cobble-tithe', moved: 8, name: 'cobblestone', kept: 4,
  })
  assert.deepEqual(parseSealBanked(SMELT_BANKED), {
    bot: 'F9', family: 'smelt-tithe', moved: 5, name: 'raw_iron', kept: 3,
  })
})

test('rider verbatims: all four families', () => {
  assert.deepEqual(parseSealRider(SEAL_RIDER), { bot: 'F7', family: 'seal-reserve' })
  assert.deepEqual(parseSealRider(FUEL_RIDER), { bot: 'F2', family: 'fuel-tithe' })
  assert.deepEqual(parseSealRider(COBBLE_RIDER), { bot: 'F5', family: 'cobble-tithe' })
  assert.deepEqual(parseSealRider(SMELT_RIDER), { bot: 'F9', family: 'smelt-tithe' })
})

test('no cross-family collision + no stranger line parses (the anchored shapes)', () => {
  // the tithes' other lines (budget, deliverable, stale-view probe, the
  // cobble tithe's own banked line) must never read as a seal firing
  assert.equal(parseSealBanked('F1 final bank budget: flow-priced 248s (fleet bankable pocket 550u (raw 933u) at 0.3u/s needs 1654s) - the static 248s covered only the fast flows'), null)
  assert.equal(parseSealBanked('F1 bank trip: deliverable (clamp) - fleet pocket 495u at 0.3u/s needs 1654s vs 300s the final bank can never grant - the surplus must ride now - the trip fires early'), null)
  assert.equal(parseSealBanked('F1 [F1] stale-view probe: bankable read 0 but a pocket of 43 was seen 12s ago - window resynced, re-counting'), null)
  assert.equal(parseSealBanked('F1 [F1] direct deposit: 27 chest slots derived from the 63-slot view'), null)
  assert.equal(parseSealBanked(SEAL_RIDER), null)
  assert.equal(parseSealRider(SEAL_BANKED), null)
  assert.equal(parseSealBanked('launching 19 bots for 600s -> targets sand, gravel, dirt, stone'), null)
  // non-strings and the junk battery
  assert.equal(parseSealBanked(null), null)
  assert.equal(parseSealBanked(42), null)
  assert.equal(parseSealRider(undefined), null)
  assert.equal(parseSealRider({ bot: 'F1' }), null)
})

test('census aggregation: units sum, byItem, kept distribution, per-bot', () => {
  const c = sealCensus([
    SEAL_BANKED,                        // F7 seal: 6 dirt kept 8
    SEAL_BANKED_COBBLE,                 // F7 seal: 3 cobblestone kept 8
    FUEL_BANKED, FUEL_RIDER,            // F2 fuel: 3 coal, one rider
    COBBLE_BANKED, COBBLE_RIDER,        // F5 cobble: 8 cobblestone, one rider
    SMELT_BANKED,                       // F9 smelt: 5 raw_iron
  ])
  assert.equal(c['seal-reserve'].banked, 2)
  assert.equal(c['seal-reserve'].units, 9)
  assert.deepEqual(c['seal-reserve'].byItem, { dirt: 6, cobblestone: 3 })
  assert.deepEqual(c['seal-reserve'].kept, { 8: 2 })
  assert.deepEqual(c['seal-reserve'].bots, ['F7'])
  assert.equal(c['seal-reserve'].riders, 0)
  assert.equal(c['fuel-tithe'].banked, 1)
  assert.equal(c['fuel-tithe'].riders, 1)
  assert.deepEqual(c['fuel-tithe'].byItem, { coal: 3 })
  assert.equal(c['cobble-tithe'].units, 8)
  assert.equal(c['smelt-tithe'].banked, 1)
  assert.deepEqual(c['smelt-tithe'].byItem, { raw_iron: 5 })
})

test('the bounded-naming reality: 2 banked + 1 rider is ALL the log names', () => {
  // a full depositToChest call with 5 seal firings prints exactly:
  // banked, banked, rider - the 4th and 5th are silent. The census
  // reports banked=2 riders=1 and NEVER a fabricated 5.
  const c = sealCensus([
    SEAL_BANKED, SEAL_BANKED_COBBLE, SEAL_RIDER,
  ])
  assert.equal(c['seal-reserve'].banked, 2)
  assert.equal(c['seal-reserve'].riders, 1)
  assert.equal(c['seal-reserve'].events.length, 2)
  assert.deepEqual(c['seal-reserve'].events[0], {
    bot: 'F7', family: 'seal-reserve', moved: 6, name: 'dirt', kept: 8,
  })
})

test('the honest zero: absent families read zeros (the run84a/run108 baseline)', () => {
  const c = sealCensus([
    'launching 19 bots for 600s -> targets sand, gravel, dirt, stone',
    'b] n=1 ts=21s rss=242M late=6ms mainLate=0ms',
    'loot ledger: mined=3183 banked=1653 smelted=3 pocket=656u/92s accounted=2312 unaccounted=871 conversion=72.6%',
  ])
  for (const fam of Object.keys(c)) {
    assert.equal(c[fam].banked, 0)
    assert.equal(c[fam].units, 0)
    assert.equal(c[fam].riders, 0)
    assert.deepEqual(c[fam].bots, [])
    assert.deepEqual(c[fam].byItem, {})
    assert.deepEqual(c[fam].kept, {})
    assert.deepEqual(c[fam].events, [])
    // (v0.405.0) the keep arm reads the same honest zero
    assert.equal(c[fam].keeps, 0)
    assert.equal(c[fam].keepUnits, 0)
    assert.equal(c[fam].keepRiders, 0)
    assert.deepEqual(c[fam].keepByItem, {})
  }
})

test('junk battery: non-string rows skipped, array-ness enforced', () => {
  const c = sealCensus([SEAL_BANKED, null, 42, { line: true }, undefined, SEAL_RIDER])
  assert.equal(c['seal-reserve'].banked, 1)
  assert.equal(c['seal-reserve'].riders, 1)
  const junk = sealCensus('not an array')
  assert.equal(junk['seal-reserve'].banked, 0)
  assert.deepEqual(junk['seal-reserve'].bots, [])
})

test('multi-bot + multi-call accumulation: same bot twice, distinct bots kept apart', () => {
  const c = sealCensus([
    SEAL_BANKED,                       // call 1 (F7)
    'F7 [F7] seal reserve: banked 2 x dirt (pocket keeps 8 seal units)', // call 2
    'F3 [F3] seal reserve: banked 1 x dirt (pocket keeps 8 seal units)',
  ])
  assert.equal(c['seal-reserve'].banked, 3)
  assert.equal(c['seal-reserve'].units, 9)
  assert.deepEqual(c['seal-reserve'].byItem, { dirt: 9 })
  assert.deepEqual(c['seal-reserve'].bots, ['F7', 'F3'])
})

test('regex exports stay anchored (the fleet19.log has no timestamp prefix)', () => {
  assert.ok(SEAL_BANKED_RE.test(SEAL_BANKED))
  assert.ok(SEAL_RIDER_RE.test(SEAL_RIDER))
  // a timestamped single-tag variant (the integration fleet.log shape) is
  // NOT the production surface - the census keys the double-tag anatomy
  assert.ok(!SEAL_BANKED_RE.test('2026-10-01T08:35:25.183Z [F7] seal reserve: banked 6 x dirt (pocket keeps 8 seal units)'))
  // the anatomy is F-tag + bracket (the death-sweep precedent - no
  // cross-agreement backreference; the emitter guarantees the pair)
  assert.equal(parseSealBanked('F7 [F9] seal reserve: banked 6 x dirt (pocket keeps 8 seal units)').bot, 'F7')
})

// (v0.405.0) THE KEEP ARM: the reserve's silent branch self-names under
// the tithe's bounded shape; the census reads both forms. The field
// question it answers: faces 23/24 read 'seal-reserve: 0 firings' while
// the roster showed bots HOLDING 2/8 and 6/8 seals - was the keep arm
// alive? (the per-visit summary line proved intermittent on face 24 -
// 0 of 10 deposits printed it - so the keep evidence needed its own line)
test('keep verbatim: bot, family, units held, item', () => {
  assert.deepEqual(parseSealKept(SEAL_KEPT), {
    bot: 'F14', family: 'seal-reserve', held: 6, name: 'cobblestone',
  })
  assert.deepEqual(parseSealKept(SEAL_KEPT_DIRT), {
    bot: 'F18', family: 'seal-reserve', held: 4, name: 'dirt',
  })
})

test('keep rider verbatim + the banking rider never cross-parses', () => {
  assert.deepEqual(parseSealKeepRider(SEAL_KEEP_RIDER), { bot: 'F3', family: 'seal-reserve' })
  // the two bounded vocabularies stay separate: a keep line is not a
  // banked firing and vice versa (the anchored shapes)
  assert.equal(parseSealKept(SEAL_BANKED), null)
  assert.equal(parseSealBanked(SEAL_KEPT), null)
  assert.equal(parseSealKeepRider(SEAL_RIDER), null)
  assert.equal(parseSealRider(SEAL_KEEP_RIDER), null)
})

test('keep census: units held accumulate per item, riders count, bots dedup', () => {
  const c = sealCensus([
    SEAL_KEPT,                                       // F14 holds 6 cobblestone
    SEAL_KEPT_DIRT,                                  // F18 holds 4 dirt
    'F14 [F14] seal reserve: kept 2 x dirt (the family floor holds)', // F14 again
    SEAL_KEEP_RIDER,                                 // F3's 3rd keep printed the rider
    'F7 [F7] seal reserve: banked 6 x dirt (pocket keeps 8 seal units)', // the banking arm rides beside it
    'b] n=48 ts=961s rss=426M late=233ms mainLate=492ms',
  ])
  const f = c['seal-reserve']
  assert.equal(f.keeps, 3)
  assert.equal(f.keepUnits, 12)
  assert.deepEqual(f.keepByItem, { cobblestone: 6, dirt: 6 })
  assert.equal(f.keepRiders, 1)
  assert.equal(f.banked, 1)
  assert.deepEqual(f.bots, ['F14', 'F18', 'F3', 'F7'])
})

test('keep junk battery: near-miss wordings rejected, non-strings skipped', () => {
  const c = sealCensus([
    SEAL_KEPT,
    null, 42, undefined, { line: SEAL_KEPT },
    // the banking arm's 'kept' clause (pocket keeps N) must not parse as a keep
    'F7 [F7] seal reserve: banked 6 x dirt (pocket keeps 8 seal units)',
    // the tithe families never emit keep lines - a tithe-named keep is junk
    'F2 [F2] fuel tithe: kept 3 x coal (the family floor holds)',
    // a truncated / different-suffix keep is junk (the honest sweep: the
    // census reads only what the fleet actually prints)
    'F14 [F14] seal reserve: kept 6 x cobblestone',
    'F14 [F14] seal reserve: kept 6 x cobblestone (pocket keeps 8 seal units)',
  ])
  assert.equal(c['seal-reserve'].keeps, 1)
  assert.equal(c['seal-reserve'].keepUnits, 6)
  assert.equal(c['fuel-tithe'].keeps, 0)
  assert.equal(c['fuel-tithe'].keepUnits, 0)
})

test('keep regexes stay anchored (the fleet19.log has no timestamp prefix)', () => {
  assert.ok(SEAL_KEPT_RE.test(SEAL_KEPT))
  assert.ok(SEAL_KEEP_RIDER_RE.test(SEAL_KEEP_RIDER))
  assert.ok(!SEAL_KEPT_RE.test('2026-10-01T08:35:25.183Z [F14] seal reserve: kept 6 x cobblestone (the family floor holds)'))
  assert.equal(parseSealKept('F14 [F9] seal reserve: kept 6 x cobblestone (the family floor holds)').bot, 'F14')
})
