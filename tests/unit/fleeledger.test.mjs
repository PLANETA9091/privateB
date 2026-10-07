import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { fleeLedger, FLEE_START_RE, FLEE_KILL_RE, STUCK_REFLEE_U, fleeOutcomeBill, fleeOutcomeBillRow, fleeOutcomeRiders, fleeOutcomeRidersRow } from '../../src/lib/fleeledger.mjs'
import { distBand } from '../../src/lib/shelterledger.mjs'

// Face 43's live shapes verbatim (run 36970605824) - the twelve flee
// episodes' starts and their own boundary lines (hand-traced: the
// inter-episode machinery prose is omitted - it never closes an episode).
const face43Mini = [
  // F17's pre-episode fight (not a flee - must not open anything)
  'F17 [F17] combat: fighting skeleton (dist 11.4, hp 10.3, 1 nearby, sentry)',
  // F2 x3 - the creeper chase, two reflees then the face's tail
  'F2 [F2] combat: fleeing creeper (dist 6.2, hp 16.8, 3 nearby, proximity)',
  // F18 x3 - the same creeper, closed by standing to a skeleton fight
  'F18 [F18] combat: fleeing creeper (dist 6.2, hp 20.0, 3 nearby, proximity)',
  'F19 [F19] combat: fighting spider (dist 3.0, hp 20.0, 2 nearby, proximity)',
  'F5 [F5] combat: fighting spider (dist 5.0, hp 11.0, 2 nearby, proximity)',
  'F11 [F11] combat: sheltering from creeper (ring 8/8, proximity re-verdict)',
  // F17's doomed flee - closed by the creeper blast (the inference names
  // a BYSTANDER skeleton: the crossfire class, the kill dist unpriced)
  'F17 [F17] combat: fleeing spider (dist 4.0, hp 8.3, 2 nearby, proximity)',
  'F19 [F19] combat: fight ended vs spider (mob down, hp 18.0 -> 17.0, swings 4, weapon wooden_sword, 4 rounds)',
  'F2 [F2] combat: fleeing creeper (dist 6.4, hp 17.0, 1 nearby, proximity)',
  'F18 [F18] combat: fleeing creeper (dist 6.5, hp 20.0, 1 nearby, proximity)',
  'F19 [F19] combat: fighting zombie (dist 4.6, hp 17.0, 1 nearby, proximity)',
  'F15 [F15] combat: fleeing zombie_villager (dist 6.0, hp 2.5, 2 nearby, proximity)',
  'F2 [F2] combat: fleeing creeper (dist 4.5, hp 17.0, 1 nearby, proximity)',
  'F18 [F18] combat: fleeing creeper (dist 4.5, hp 20.0, 1 nearby, proximity)',
  'F17 [F17] died - respawning (cause: server: was blown up by Creeper [kind=explosion by Creeper] | inferred: skeleton@12.5 (0s before death at [-127,64,431]) [the inference names a BYSTANDER - the exploder removed itself at detonation, the nearest-harm scan read the next-nearest hostile (a real witness, not the killer; the server killer stays the authority)])',
  'F19 [F19] combat: fight ended vs zombie (mob down, hp 17.0 -> 9.0, swings 7, weapon wooden_sword, 7 rounds)',
  // F5's doomed flee - chased down (the inference JOINS the threat:
  // zombie_villager@0.7 after fleeing @4.8 - THE MOB CLOSED IN)
  'F5 [F5] combat: fleeing zombie_villager (dist 4.8, hp 2.0, 1 nearby, proximity)',
  'F5 [F5] died - respawning (cause: server: was slain by Zombie Villager [kind=mob by Zombie] | inferred: zombie_villager@0.7 (0s before death at [-152,65,407]) [the inference CONTRADICTS the server verdict - the nearest harm was not the killer (the server kind stays the authority)])',
  'F15 [F15] combat: fleeing zombie_villager (dist 6.1, hp 2.5, 1 nearby, proximity)',
  // F16's doomed flee - the CROSSFIRE (fled a creeper, the skeleton's
  // arrow took the trade - the fire-1638 ARROWS read's start-side shape)
  'F16 [F16] combat: fleeing creeper (dist 6.7, hp 19.0, 2 nearby, proximity)',
  'F19 [F19] combat: fleeing skeleton (dist 11.5, hp 5.0, 1 nearby, sentry)',
  // F18's episode-3 closer: the bot STOOD (fought a skeleton, mob down)
  'F18 [F18] combat: fighting skeleton (dist 7.7, hp 16.0, 1 nearby, sentry)',
  'F18 [F18] combat: fight ended vs skeleton (mob down, hp 16.0 -> 12.8, swings 6, weapon wooden_sword, 6 rounds)',
  'F16 [F16] died - respawning (cause: server: was shot by Skeleton [kind=mob by Skeleton] | inferred: skeleton@8.9 (0s before death at [-132,64,407]) [the inference corroborates the server verdict])'
]

test('fleeLedger reads face 43 verbatim: 12 starts, the book closes 12/12', () => {
  const r = fleeLedger(face43Mini)
  assert.equal(r.starts, 12)
  assert.equal(r.reflee, 5)
  assert.equal(r.stood, 1)
  assert.equal(r.sheltered, 0)
  assert.equal(r.chased, 1)
  assert.equal(r.crossfire, 2)
  assert.equal(r.diedOther, 0)
  assert.equal(r.open, 3)
  // THE BOOK LAW: every start closes exactly once
  assert.equal(r.reflee + r.stood + r.sheltered + r.chased + r.crossfire + r.diedOther + r.open, r.starts)
})

test('the doomed flees carry the chase geometry: chased with delta, crossfire without', () => {
  const r = fleeLedger(face43Mini)
  const chased = r.rows.filter(x => x.outcome === 'chased')
  assert.equal(chased.length, 1)
  assert.equal(chased[0].bot, 'F5')
  assert.equal(chased[0].mob, 'zombie_villager')
  assert.equal(chased[0].dist, 4.8)
  assert.equal(chased[0].killDist, 0.7)
  assert.equal(chased[0].killDelta, -4.1)
  const cross = r.rows.filter(x => x.outcome === 'crossfire')
  assert.equal(cross.length, 2)
  // F17: fled a spider, the creeper's blast took it (the inference named
  // a bystander - no kill dist is priced, the class is honest)
  const f17 = cross.find(x => x.bot === 'F17')
  assert.equal(f17.mob, 'spider')
  assert.equal(f17.killer, 'Creeper')
  assert.equal(f17.killDist, null)
  assert.equal(f17.killDelta, null)
  // F16: fled a creeper, the skeleton's arrow took it (the fire-1638
  // ARROWS read - the second hostile's kill, start-side)
  const f16 = cross.find(x => x.bot === 'F16')
  assert.equal(f16.mob, 'creeper')
  assert.equal(f16.killer, 'Skeleton')
  assert.equal(f16.killDist, null)
})

test('the start-side bands price the doom share: face 43 close 1/1, mid 2/10, far 0/1', () => {
  const r = fleeLedger(face43Mini)
  assert.deepEqual(
    { close: r.bands.close, mid: r.bands.mid, far: r.bands.far, unpriced: r.bands.unpriced },
    { close: { starts: 1, died: 1 }, mid: { starts: 10, died: 2 }, far: { starts: 1, died: 0 }, unpriced: { starts: 0, died: 0 } }
  )
  // the band ruler is the flee fork's own - imported, never forked
  assert.equal(distBand(4.0), 'close')
  assert.equal(distBand(11.5), 'far')
})

test('the crowd price (v0.482.0): face 43 solo 1/7 died, crowd 2/5 died - the crossfire sensor is the start line\'s own census', () => {
  const r = fleeLedger(face43Mini)
  // nearby 0-1: F18 x2 (1), F2 x2 (1), F5 (1), F15 (1), F19 (1) - the
  // chased death (F5) is the solo lane's only doom; nearby 2+: F2 (3),
  // F18 (3), F17 (2), F15 (2), F16 (2) - BOTH crossfire deaths flew
  // crowded (the second hostile already counted at the flight decision)
  assert.deepEqual(
    { solo: r.crowd.solo, crowd: r.crowd.crowd, unpriced: r.crowd.unpriced },
    { solo: { starts: 7, died: 1 }, crowd: { starts: 5, died: 2 }, unpriced: { starts: 0, died: 0 } }
  )
  // the crossfire class never flew solo on this face
  const cross = r.rows.filter(x => x.outcome === 'crossfire')
  assert.deepEqual(cross.map(x => x.nearby), [2, 2])
  // the book law holds on the crowd split too
  assert.equal(r.crowd.solo.starts + r.crowd.crowd.starts + r.crowd.unpriced.starts, r.starts)
})

test('the crowd price on face 42: every start flew solo - the chased doom is solo\'s own', () => {
  const r = fleeLedger(face42Mini)
  assert.deepEqual(
    { solo: r.crowd.solo, crowd: r.crowd.crowd, unpriced: r.crowd.unpriced },
    { solo: { starts: 3, died: 1 }, crowd: { starts: 0, died: 0 }, unpriced: { starts: 0, died: 0 } }
  )
})

test('the chase progress: reflee deltas priced, the stuck signature counted', () => {
  const r = fleeLedger(face43Mini)
  const deltas = r.rows.filter(x => x.outcome === 'reflee').map(x => x.refleeDelta)
  assert.deepEqual(deltas, [0.2, 0.3, -1.9, -2, 0.1])
  // F2 6.2->6.4 (+0.2), F18 6.2->6.5 (+0.3), F15 6.0->6.1 (+0.1) - the
  // mob kept pace (the run73 stuck signature); the two -2.0 closes are
  // the mob CLOSING IN
  assert.equal(r.stuckReflees, 3)
  assert.equal(STUCK_REFLEE_U, 1.0)
})

test('hp at flee start: the flee-too-late read (min 2.0, median 16.9, max 20.0)', () => {
  const r = fleeLedger(face43Mini)
  assert.equal(r.hp.min, 2.0)
  assert.equal(r.hp.median, 16.9)
  assert.equal(r.hp.max, 20.0)
  assert.equal(r.kiteStarts, 0)
})

test('perBot counts every episode; the reasons ride as data', () => {
  const r = fleeLedger(face43Mini)
  assert.deepEqual(r.perBot, { F2: 3, F18: 3, F17: 1, F15: 2, F5: 1, F16: 1, F19: 1 })
  const f19 = r.rows.find(x => x.bot === 'F19')
  assert.equal(f19.mob, 'skeleton')
  assert.equal(f19.reason, 'sentry')
  assert.equal(f19.outcome, 'open')
})

// Face 42's live shapes (run 36967273918) - the chased-by-SERVER-token
// leg: the explosion kind's inference is blind by construction, the
// server killer token is the authority
const face42Mini = [
  'F4 [F4] combat: fleeing creeper (dist 6.7, hp 5.8, 1 nearby, proximity)',
  'F10 [F10] combat: fleeing creeper (dist 5.7, hp 20.0, 1 nearby, proximity)',
  'F4 [F4] died - respawning (cause: server: was blown up by Creeper [kind=explosion by Creeper] | inferred: fall/env (0s before death at [-140,64,406]) [the inference is blind to this kind - the hint is noise by construction (the server kind stays the authority)])',
  'F13 [F13] combat: fleeing zombie (dist 6.8, hp 6.7, 1 nearby, proximity)',
  'F10 [F10] combat: fight ended vs zombie (mob down, hp 20.0 -> 20.0, swings 1, weapon wooden_sword, 1 rounds)'
]

test('fleeLedger reads face 42 verbatim: the chased class joins on the server killer token', () => {
  const r = fleeLedger(face42Mini)
  assert.equal(r.starts, 3)
  assert.equal(r.chased, 1)
  assert.equal(r.stood, 1)
  assert.equal(r.open, 1)
  const f4 = r.rows.find(x => x.bot === 'F4')
  assert.equal(f4.outcome, 'chased')
  assert.equal(f4.killer, 'Creeper')
  // the inference is blind to explosions - the kill dist stays unpriced
  assert.equal(f4.killDist, null)
  assert.equal(f4.killDelta, null)
  const f10 = r.rows.find(x => x.bot === 'F10')
  assert.equal(f10.outcome, 'stood')
  assert.equal(f10.exit, 'mob down')
})

test('the kite flag and the mid-episode machinery prose never close an episode', () => {
  const r = fleeLedger([
    'F7 [F7] combat: fleeing zombie (dist 5.0, hp 12.0, 1 nearby, proximity, kite)',
    // the flee family's own mid-course lines - episode-internal
    'F7 [F7] combat: flee bearing rotated 90deg (water/hazard vetoes the yard target) vs zombie (proximity)',
    'F7 [F7] combat: flee kite hop toward the yard (-120,390) vs zombie (proximity)',
    // the shelter machinery's refusals - still internal
    'F7 [F7] combat: shelter skip (open field: ring stock 0/8, threat@5.0 beyond the earn edge - the nwins)',
    'F7 [F7] combat: critical bar (seen < 8) - the shelter scan is refused, the drain outruns it',
    'F7 [F7] combat: verdict flipped to flee vs zombie (hp 9.0)',
    // the shelter LANDS - the only shelter-side closer
    'F7 [F7] combat: sheltering from zombie (ring 8/8, proximity)'
  ])
  assert.equal(r.starts, 1)
  assert.equal(r.sheltered, 1)
  assert.equal(r.kiteStarts, 1)
  assert.equal(r.rows[0].kite, true)
  assert.equal(r.rows[0].reason, 'proximity')
})

test('a flee closed by a non-combat death reads died-other (the episode still closes)', () => {
  const r = fleeLedger([
    'F9 [F9] combat: fleeing drowned (dist 3.5, hp 14.0, 1 nearby, proximity)',
    'F9 [F9] died - respawning (cause: server: drowned [kind=drown] | inferred: fall/env (0s before death at [-142,61,391]) [the inference is blind to this kind - the hint is noise by construction (the server kind stays the authority)])'
  ])
  assert.equal(r.starts, 1)
  assert.equal(r.diedOther, 1)
  assert.equal(r.chased, 0)
  assert.equal(r.crossfire, 0)
  // the non-combat death never counts into the bands' died share
  assert.deepEqual(r.bands.close, { starts: 1, died: 0 })
})

test('the truncation window: a flee verb with a cut body opens data-blind', () => {
  const r = fleeLedger([
    'F3 [F3] combat: fleeing creeper (dist 4',
    'F3 [F3] combat: fighting skeleton (dist 6.0, hp 10.0, 1 nearby, sentry)'
  ])
  assert.equal(r.starts, 1)
  assert.equal(r.rows[0].mob, null)
  assert.equal(r.rows[0].dist, null)
  assert.equal(r.rows[0].band, null)
  assert.equal(r.rows[0].outcome, 'stood')
  // the unpriced band carries it
  assert.deepEqual(r.bands.unpriced, { starts: 1, died: 0 })
  // the crowd census is data-blind too - the honest unpriced bucket
  assert.deepEqual(r.crowd.unpriced, { starts: 1, died: 0 })
  assert.equal(r.hp, null)
})

test('the RE shapes anchor the emitter (the sibling-shape law)', () => {
  const start = 'F2 [F2] combat: fleeing creeper (dist 6.2, hp 16.8, 3 nearby, proximity)'
  const m = start.match(FLEE_START_RE)
  assert.equal(m[1], 'creeper')
  assert.equal(m[2], '6.2')
  assert.equal(m[3], '16.8')
  assert.equal(m[4], '3')
  assert.equal(m[5], 'proximity')
  const kill = 'F5 [F5] died - respawning (cause: server: x [kind=mob by Zombie] | inferred: zombie_villager@0.7 (0s before death at [-152,65,407]) [x])'
  const km = kill.match(FLEE_KILL_RE)
  assert.equal(km[1], 'zombie_villager')
  assert.equal(km[2], '0.7')
})

test('junk reads null (the smeltledger convention), the raw blob reads the array', () => {
  assert.equal(fleeLedger(null), null)
  assert.equal(fleeLedger(undefined), null)
  assert.equal(fleeLedger(42), null)
  assert.equal(fleeLedger({ lines: [] }), null)
  const blob = face42Mini.join('\n')
  const fromBlob = fleeLedger(blob)
  const fromArray = fleeLedger(face42Mini)
  assert.equal(fromBlob.starts, fromArray.starts)
  assert.equal(fromBlob.chased, fromArray.chased)
  assert.equal(fromBlob.open, fromArray.open)
})

test('the zero law: a face with no flees reads the honest zero shape', () => {
  const r = fleeLedger([
    'F1 [F1] combat: fight ended vs zombie (mob down, hp 20.0 -> 20.0, swings 1, weapon wooden_pickaxe, 1 rounds)',
    'F2 [F2] mem: rss=251M'
  ])
  assert.equal(r.starts, 0)
  assert.equal(r.reflee, 0)
  assert.equal(r.chased, 0)
  assert.equal(r.open, 0)
  assert.equal(r.hp, null)
  assert.deepEqual(r.crowd, { solo: { starts: 0, died: 0 }, crowd: { starts: 0, died: 0 }, unpriced: { starts: 0, died: 0 } })
  assert.deepEqual(r.perBot, {})
  assert.deepEqual(r.rows, [])
})

// (v0.798.0) THE FLEE BOOK'S OWN SEAT - WHICH outcome owns the escape
// lane's success book. The census's own outcome counters only, zero
// re-parsing; the strict-majority law, a tie owns nothing; junk never
// invents an outcome.
test("the flee book's own seat - the face-84 cell through the seat law with the byte-exact row + the crowd's measure-not-owner law", () => {
  // face 84's own shape: open 1 of 1 - the solo seat fires
  const solo = { starts: 1, reflee: 0, stood: 0, sheltered: 0, chased: 0, crossfire: 0, diedOther: 0, open: 1 }
  const seat = fleeOutcomeBill(solo)
  assert.deepEqual(seat, { outcome: 'open', owns: 1, ofFlees: 1, shareOfFlees: 1 })
  assert.equal(
    fleeOutcomeBillRow(seat),
    "the flee book's own seat (v0.798.0): open owns 1 of 1 flee episode(s) (100.0%) - THE FLEE'S OWN SEAT: one outcome's own closes own the escape book - the outcome's own front prices the churn the raw split rode unnamed"
  )
  // the crowd shape (face 81's own counters): reflee 14 + chased 6 of 29
  // - the top at 14/29 is below half, no solo seat; the riders measure
  // the storm's own re-arm gravity
  const storm = { starts: 29, reflee: 14, stood: 2, sheltered: 1, chased: 6, crossfire: 3, diedOther: 0, open: 3 }
  assert.equal(fleeOutcomeBill(storm), null, '14 of 29 is below half - the re-arm gravity stays unseated')
  const sr = fleeOutcomeRiders(storm)
  assert.deepEqual(sr, { leader: 'reflee', leaderOwns: 14, runner: 'chased', runnerOwns: 6, ofFlees: 29, pairOwns: 20, shareOfFlees: 0.69, duet: false })
  assert.equal(
    fleeOutcomeRidersRow(sr),
    "the flee book's own riders (v0.798.0): no solo outcome owns the majority - reflee x14 + chased x6 own 20 of 29 flee episode(s) (69.0%) - THE FLEE'S OWN MIX: the seat's tie law held, the mix is the shape - the outcomes' own spread prices the churn the solo law refused to seat"
  )
  // the count tie breaks on the outcome's own byte: face 82's shape
  // (stood x3 + the tied x2s) - 'chased' < 'crossfire' < 'reflee'
  const tied = { starts: 10, reflee: 2, stood: 3, sheltered: 1, chased: 2, crossfire: 2, diedOther: 0, open: 0 }
  const tr = fleeOutcomeRiders(tied)
  assert.equal(tr.leader, 'stood')
  assert.equal(tr.runner, 'chased', "the x2 tie breaks on the byte - 'chased' < 'crossfire' < 'reflee'")
  assert.equal(tr.pairOwns, 5)
  assert.equal(tr.duet, false)
})

test("the tie law - a tie owns nothing - and the duet byte pin 'chased' < 'open' + the fences", () => {
  // face 83's own counters: chased 2 + open 2 of 4 - the tie owns
  // nothing, the duet prices the shape
  const tie = { starts: 4, reflee: 0, stood: 0, sheltered: 0, chased: 2, crossfire: 0, diedOther: 0, open: 2 }
  assert.equal(fleeOutcomeBill(tie), null, 'the tie owns nothing - the seat stays silent')
  const r = fleeOutcomeRiders(tie)
  assert.deepEqual(r, { leader: 'chased', leaderOwns: 2, runner: 'open', runnerOwns: 2, ofFlees: 4, pairOwns: 4, shareOfFlees: 1, duet: true })
  assert.equal(
    fleeOutcomeRidersRow(r),
    "the flee book's own riders (v0.798.0): no solo outcome owns the majority - chased x2 + open x2 own 4 of 4 flee episode(s) (100.0%) - THE FLEE'S OWN MIX: the seat's tie law held, the mix is the shape - the outcomes' own spread prices the churn the solo law refused to seat"
  )
  // the exact-half fence: the top at exactly half reads no solo seat
  const half = { reflee: 2, stood: 0, sheltered: 0, chased: 0, crossfire: 0, diedOther: 0, open: 2 }
  assert.equal(fleeOutcomeBill(half), null)
  const rh = fleeOutcomeRiders(half)
  assert.equal(rh.leader, 'open', "the zero cells never tally - the tie is open vs reflee, 'open' < 'reflee'")
  assert.equal(rh.runner, 'reflee')
  assert.equal(rh.duet, true)
  // the below-half plurality fence: the top class under half never seats
  const plural = { reflee: 3, stood: 0, sheltered: 0, chased: 2, crossfire: 2, diedOther: 0, open: 0 }
  assert.equal(fleeOutcomeBill(plural), null, '3 of 7 is below half - the plurality stays unseated')
  // the below-half SOLO seat fence: a top at exactly 2 of 5 never seats
  const under = { reflee: 0, stood: 0, sheltered: 0, chased: 2, crossfire: 0, diedOther: 0, open: 3 }
  const us = fleeOutcomeBill(under)
  assert.deepEqual(us, { outcome: 'open', owns: 3, ofFlees: 5, shareOfFlees: 0.6 }, '3 of 5 is above half - the seat fires')
})

test("the cells' own sum law + the single-class fence + the zero-book silence", () => {
  // a junk counter is skipped honest, the finite cells beside it still
  // tally (the book is the seven's own sum - never the starts counter)
  const mixed = { starts: 99, reflee: 2, stood: 'x', sheltered: null, chased: NaN, crossfire: -1, diedOther: 0, open: 1 }
  const ms = fleeOutcomeBill(mixed)
  assert.deepEqual(ms, { outcome: 'reflee', owns: 2, ofFlees: 3, shareOfFlees: 0.667 })
  // the single-class fence: one counted outcome reads a seat but no
  // riders (fewer than two cells - the honest silence's companion law)
  const only = { reflee: 2, stood: 0, sheltered: 0, chased: 0, crossfire: 0, diedOther: 0, open: 0 }
  assert.deepEqual(fleeOutcomeBill(only), { outcome: 'reflee', owns: 2, ofFlees: 2, shareOfFlees: 1 })
  assert.equal(fleeOutcomeRiders(only), null)
  // the zero-book face reads the honest silence both ways
  const zero = { reflee: 0, stood: 0, sheltered: 0, chased: 0, crossfire: 0, diedOther: 0, open: 0 }
  assert.equal(fleeOutcomeBill(zero), null)
  assert.equal(fleeOutcomeRiders(zero), null)
  assert.deepEqual(fleeOutcomeBill({ starts: 0 }), null)
})

test('the junk battery + the WIRING assert - the decompose branch rides the cell, the prose lives only in the lib', () => {
  // the junk battery: junk never invents an outcome (the honest silence)
  assert.equal(fleeOutcomeBill(null), null)
  assert.equal(fleeOutcomeBill(undefined), null)
  assert.equal(fleeOutcomeBill(42), null)
  assert.equal(fleeOutcomeBill([1, 2]), null)
  assert.equal(fleeOutcomeBill({}), null)
  assert.equal(fleeOutcomeBill({ reflee: 'nope', open: NaN }), null)
  assert.equal(fleeOutcomeBillRow(null), null)
  assert.equal(fleeOutcomeBillRow({ outcome: '', owns: 1, ofFlees: 1, shareOfFlees: 1 }), null)
  assert.equal(fleeOutcomeBillRow({ outcome: 'open', owns: 2, ofFlees: 1, shareOfFlees: 2 }), null)
  assert.equal(fleeOutcomeRiders(null), null)
  assert.equal(fleeOutcomeRiders({}), null)
  assert.equal(fleeOutcomeRidersRow(null), null)
  assert.equal(fleeOutcomeRidersRow({ leader: 'open', leaderOwns: 0, runner: 'reflee', runnerOwns: 1, ofFlees: 2, pairOwns: 1, shareOfFlees: 0.5 }), null)
  // the WIRING assert - the decompose branch rides the flee episodes row,
  // the prose lives only in the lib
  const src = fs.readFileSync(new URL('../../scripts/fleet-mining/decompose.mjs', import.meta.url), 'utf8')
  assert.ok(src.includes('const fob = fleeOutcomeBill(fl)'), 'the seat rides the census cell')
  assert.ok(src.includes('if (fob) console.log(`  ${fleeOutcomeBillRow(fob)}`)'), 'the owner row rides the branch')
  assert.ok(src.includes('const forr = fleeOutcomeRiders(fl)'), 'the riders ride the same branch law')
  assert.ok(!src.includes("THE FLEE'S OWN SEAT"), 'the prose stays in the lib')
  assert.ok(!src.includes("THE FLEE'S OWN MIX"), 'the mix prose stays in the lib')
})
