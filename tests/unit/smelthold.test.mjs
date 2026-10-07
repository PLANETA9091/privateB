//
// smelthold.test.mjs - THE SMELT HOLD LEDGER (v0.491.0) unit tests.
// The lines are byte-verbatim from the stored faces (face 42/43
// fleet19.log), in the live order - hand-traced first, then pinned.
//
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { test } from 'node:test'
import { smeltHold, SMELT_HOLD_RE, SMELT_HOLD_SKIP_RE, SMELT_END_BANK_SKIP_RE, SMELT_LOCAL_FALLBACK_RE, refusalSegClass, refusalSegs, smeltRefusalAnatomy, smeltRefusalSeat, smeltRefusalSeatRow, smeltRefusalRiders, smeltRefusalRidersRow, REFUSAL_SEG_CLASSES } from '../../src/lib/smelthold.mjs'
import { JUNK_COAL_FLOOR } from '../../src/lib/smelting.mjs'

// Face 42's hold lane, verbatim and in the live order: nine holds -
// four fired with yield (F17/F19/F13/F9's third), one fired-zero (F4's
// in-flight batch), two refused (F1 nothing, F3 machine), two died to
// the end-bank clock (F9's first two) - plus F19's venue-change
// fallback (prose, the hold then fired locally), two coal-0 skips and
// four standalone end-bank skips (no open hold).
const FACE42_MINI = [
  'F9 bank: holding 45s of 169s for the smelt leg',
  'F13 bank: holding 69s of 274s for the smelt leg',
  'F4 bank: holding 61s of 243s for the smelt leg',
  'F17 bank: holding 62s of 248s for the smelt leg',
  'F1 bank: holding 61s of 245s for the smelt leg',
  'F1 smelt: 0 (nothing to smelt)',
  'F9 end-bank budget spent - smelt skipped',
  'F19 bank: holding 45s of 173s for the smelt leg',
  'F3 bank: holding 45s of 152s for the smelt leg',
  'F9 bank: holding 45s of 146s for the smelt leg',
  'F16 end-bank budget spent - smelt skipped',
  '[F17] smelting 2 x cobblestone in a furnace (fuel: 5 x stick)',
  'F19 bank: yard walk failed (Took to long to decide path to goal!) - smelting locally if a furnace is near',
  '[F19] smelting 1 x raw_copper in a furnace (fuel: 3 x stick)',
  '[F13] smelting 2 x cobblestone in a furnace (fuel: 4 x stick)',
  '[F4] smelting 2 x raw_iron in a furnace (fuel: 1 x coal)',
  'F4 smelted 0 () rescued=0 fired=2',
  'F17 smelted 2 (stone:2) rescued=0',
  'F19 smelted 1 (copper_ingot:1) rescued=0',
  'F3 smelt: 0 (raw_copper@blast_furnace: machine unreachable (visit budget spent (walk slice)))',
  'F13 smelted 2 (stone:2) rescued=0',
  'F9 end-bank budget spent - smelt skipped',
  'F8 end-bank budget spent - smelt skipped',
  'F19 bank: smelt hold skipped - no fuel in pocket (coal 0)',
  'F14 end-bank budget spent - smelt skipped',
  'F9 bank: holding 62s of 248s for the smelt leg',
  'F7 end-bank budget spent - smelt skipped',
  '[F9] smelting 7 x sand in a furnace (fuel: 2 x coal)',
  'F9 smelted 8 (glass:8) rescued=0'
]

// Face 43's hold lane, verbatim: the floor signature (F8's coal 4 and
// F6's coal 6 both skipped - 6 is the JUNK_COAL_FLOOR boundary caught
// byte-verbatim: 6 > 6 is false), three fired holds (F12/F18/F9), five
// refused (all machine-class), F3's fallback-noted refusal, three
// standalone end-bank skips.
const FACE43_MINI = [
  'F8 bank: smelt hold skipped - no fuel in pocket (coal 4)',
  'F17 bank: holding 69s of 274s for the smelt leg',
  'F12 bank: holding 56s of 222s for the smelt leg',
  'F4 bank: holding 59s of 237s for the smelt leg',
  'F11 bank: smelt hold skipped - no fuel in pocket (coal 0)',
  'F6 bank: smelt hold skipped - no fuel in pocket (coal 6)',
  'F1 bank: smelt hold skipped - no fuel in pocket (coal 0)',
  '[F12] the clock clips the batch: the 80s window completes ~7 of 18 x raw_copper (the rest re-smelts on the next chain)',
  '[F12] smelting 7 x raw_copper in a furnace (fuel: 3 x coal)',
  'F18 bank: holding 62s of 248s for the smelt leg',
  'F15 bank: holding 62s of 248s for the smelt leg',
  'F3 bank: holding 45s of 149s for the smelt leg',
  'F8 smelt: 0 (raw_copper@blast_furnace: machine unreachable (Took to long to decide path to goal!))',
  'F17 smelt: 0 (cobblestone@furnace: cannot open (open furnace: timeout after 10000ms); cobblestone@furnace: machine unreachable (No path to the goal!))',
  '[F18] smelting 7 x cobblestone in a furnace (fuel: 5 x oak_planks)',
  'F12 smelted 7 (copper_ingot:7) rescued=0',
  'F9 bank: holding 62s of 248s for the smelt leg',
  'F3 bank: yard walk failed (Took to long to decide path to goal!) - smelting locally if a furnace is near',
  'F4 smelt: 0 (raw_copper@blast_furnace: machine unreachable (visit budget spent (walk slice)))',
  'F18 smelted 7 (stone:7) rescued=0',
  'F5 end-bank budget spent - smelt skipped',
  'F16 bank: holding 62s of 248s for the smelt leg',
  'F3 smelt: 0 (raw_iron@blast_furnace: machine unreachable (the yard stands 33 levels up over 26b lateral - the walk ladder cannot climb))',
  'F2 end-bank budget spent - smelt skipped',
  'F15 smelt: 0 (cobblestone@furnace: cannot open (open furnace: timeout after 10000ms))',
  '[F9] smelting 1 x sand in a furnace (fuel: 1 x oak_planks)',
  'F10 end-bank budget spent - smelt skipped',
  '[F9] smelting 1 x sand in a furnace (fuel: 2 x oak_log)',
  'F16 smelt: 0 (raw_iron@furnace: machine unreachable (No path to the goal!))',
  'F9 smelted 2 (glass:2) rescued=0'
]

test('face 42 mini: four fired holds with yield, one fired-zero, two refused, two budget-died, the fallback prose never closes', () => {
  const v = smeltHold(FACE42_MINI)
  assert.ok(v)
  assert.equal(v.holds, 9)
  assert.equal(v.holdSecs, 45 + 69 + 61 + 62 + 61 + 45 + 45 + 45 + 62)
  assert.equal(v.budgetSecs, 169 + 274 + 243 + 248 + 245 + 173 + 152 + 146 + 248)
  assert.deepEqual(v.fates, { fired: 4, firedZero: 1, refused: 2, budgetDied: 2, unresolved: 0 })
  assert.deepEqual(v.refusedWhy, { nothing: 1, machine: 1 })
  // F9's three holds: two died to the end-bank clock, the third fired 8.
  const f9 = v.rows.filter(r => r.bot === 'F9')
  assert.equal(f9.length, 3)
  assert.equal(f9[0].fate, 'budget-died')
  assert.equal(f9[1].fate, 'budget-died')
  assert.equal(f9[2].fate, 'fired')
  assert.equal(f9[2].actual, 8)
  // F4: fired but the in-flight batch yielded 0 (its own fired tail).
  const f4 = v.rows.find(r => r.bot === 'F4')
  assert.equal(f4.fate, 'fired')
  assert.equal(f4.actual, 0)
  // F19: the fallback is prose - the hold stayed open and fired locally.
  const f19 = v.rows.find(r => r.bot === 'F19')
  assert.equal(f19.fate, 'fired')
  assert.equal(f19.actual, 1)
  assert.equal(f19.fallback, true)
  // The fired holds' yield = the face's whole smelted total (13).
  assert.equal(v.firedActualTotal, 13)
  assert.equal(v.zeroYield, 1)
  assert.equal(v.fallbacks, 1)
  // The skips and the standalone end-bank deaths.
  assert.equal(v.skips, 1)
  assert.deepEqual(v.skipClasses, { 'coal-0': 1, 'below-floor': 0, 'above-floor': 0 })
  assert.equal(v.endBankStandalone, 4)
})

test('face 43 mini: the floor signature (coal 4 and the boundary coal 6 skipped), three fired, five machine-refused', () => {
  const v = smeltHold(FACE43_MINI)
  assert.ok(v)
  assert.equal(v.holds, 8)
  assert.deepEqual(v.fates, { fired: 3, firedZero: 0, refused: 5, budgetDied: 0, unresolved: 0 })
  assert.deepEqual(v.refusedWhy, { nothing: 0, machine: 5 })
  // The floor doctrine's field signature: coal 4 AND the boundary coal 6
  // both skipped (6 > JUNK_COAL_FLOOR is false - the strict inequality
  // caught byte-verbatim), zero above-floor skips.
  assert.equal(v.skips, 4)
  assert.deepEqual(v.skipClasses, { 'coal-0': 2, 'below-floor': 2, 'above-floor': 0 })
  // F3: fallback-noted, then refused (the yard ladder cannot climb).
  const f3 = v.rows.find(r => r.bot === 'F3')
  assert.equal(f3.fate, 'refused')
  assert.equal(f3.whyClass, 'machine')
  assert.equal(f3.fallback, true)
  // F9: one hold, two batches, one verdict - the hold fired 2.
  const f9 = v.rows.find(r => r.bot === 'F9')
  assert.equal(f9.fate, 'fired')
  assert.equal(f9.actual, 2)
  // The fired holds' yield = the face's whole smelted total (16).
  assert.equal(v.firedActualTotal, 16)
  assert.equal(v.fallbacks, 1)
  assert.equal(v.endBankStandalone, 3)
})

test('the both-faces aggregate: 17 holds, 7 fired with yield + 1 zero, the whole smelted yield rode a hold, the floor pin', () => {
  const v = smeltHold([...FACE42_MINI, ...FACE43_MINI])
  assert.equal(v.holds, 17)
  assert.deepEqual(v.fates, { fired: 7, firedZero: 1, refused: 7, budgetDied: 2, unresolved: 0 })
  // THE IDENTITY: the fired holds bought 29 items = the fleet's whole
  // smelted yield (13 + 16) - the hold is the smelt lane's only door.
  assert.equal(v.firedActualTotal, 29)
  // The floor constant rides imported (one truth never forked).
  assert.equal(JUNK_COAL_FLOOR, 6)
})

test('the truncation edge: a hold with no outcome stays unresolved, a skip is a leaf', () => {
  const v = smeltHold(['F17 bank: holding 62s of 248s for the smelt leg'])
  assert.equal(v.holds, 1)
  assert.equal(v.fates.unresolved, 1)
  assert.equal(v.fates.fired, 0)
  // A second hold closes the first honestly.
  const two = smeltHold([
    'F9 bank: holding 45s of 169s for the smelt leg',
    'F9 bank: holding 62s of 248s for the smelt leg'
  ])
  assert.equal(two.holds, 2)
  assert.equal(two.fates.unresolved, 2)
  assert.equal(two.rows[0].fate, 'unresolved')
})

test('the RE anchors: the sibling skins never cross-match', () => {
  // The hold RE is the reserve decision only.
  assert.ok(SMELT_HOLD_RE.test('F17 bank: holding 62s of 248s for the smelt leg'))
  assert.equal(SMELT_HOLD_RE.test('F10 bank: smelt hold skipped - no fuel in pocket (coal 0)'), false)
  assert.equal(SMELT_HOLD_RE.test('t-306s alive=19/19 mined=980 smelted=0 pocket=1166u/226s'), false)
  // The skip RE captures the coal diagnostic.
  const skip = SMELT_HOLD_SKIP_RE.exec('F6 bank: smelt hold skipped - no fuel in pocket (coal 6)')
  assert.ok(skip)
  assert.equal(skip[1], 'F6')
  assert.equal(skip[2], '6')
  assert.equal(SMELT_HOLD_SKIP_RE.test('F9 end-bank budget spent - smelt skipped'), false)
  // The end-bank and the fallback shapes.
  assert.ok(SMELT_END_BANK_SKIP_RE.test('F9 end-bank budget spent - smelt skipped'))
  const fb = SMELT_LOCAL_FALLBACK_RE.exec('F19 bank: yard walk failed (Took to long to decide path to goal!) - smelting locally if a furnace is near')
  assert.ok(fb)
  assert.equal(fb[1], 'F19')
  assert.equal(fb[2], 'Took to long to decide path to goal!')
  assert.equal(SMELT_LOCAL_FALLBACK_RE.test('F1 camp furnace: no build (nothing to smelt)'), false)
})

test('junk / blob / zero battery', () => {
  assert.equal(smeltHold(null), null)
  assert.equal(smeltHold('a string'), null)
  assert.equal(smeltHold(42), null)
  const empty = smeltHold([])
  assert.ok(empty)
  assert.equal(empty.holds, 0)
  assert.equal(empty.holdSecs, 0)
  assert.equal(empty.skips, 0)
  const junk = smeltHold(['', 'junk', 42, null, 'F1 bank: holding 45s for the smelt leg'])
  assert.ok(junk)
  assert.equal(junk.holds, 0)
})

// (v0.753.0) THE REFUSAL'S OWN ANATOMY - face 61's refusal WHY text,
// byte-verbatim from run 37583836654's fleet19.log (the first
// fully-protected face), in the live order. Fourteen refusal lines,
// five distinct voices, one 8-segment multi-skin (F19's timeout plus
// seven no-fuel retrials), one 2-segment busy pair (F12).
const FACE61_REFUSALS = [
  'F2 smelt: 0 (nothing to smelt)',
  'F2 smelt: 0 (nothing to smelt)',
  'F9 smelt: 0 (cobblestone@furnace: no fuel)',
  'F9 smelt: 0 (birch_log@furnace: machine unreachable (fleet goal ceiling: 30 goals fleet-wide in 5s - walk to furnace refused for 3s))',
  'F8 smelt: 0 (raw_iron@blast_furnace: machine unreachable (visit budget spent (walk slice)))',
  'F5 smelt: 0 (oak_log@furnace: no fuel)',
  'F5 smelt: 0 (nothing to smelt)',
  'F3 smelt: 0 (oak_log@furnace: machine unreachable (fleet goal ceiling: 30 goals fleet-wide in 5s - walk to furnace refused for 3s))',
  'F19 smelt: 0 (timeout; cobblestone@furnace: no fuel; cobblestone@furnace: no fuel; cobblestone@furnace: no fuel; cobblestone@furnace: no fuel; cobblestone@furnace: no fuel; cobblestone@furnace: no fuel; cobblestone@furnace: no fuel)',
  'F18 smelt: 0 (cobblestone@furnace: no fuel)',
  'F13 smelt: 0 (oak_log@furnace: machine unreachable (visit budget spent (walk slice)))',
  'F13 smelt: 0 (oak_log@furnace: machine unreachable (fleet goal ceiling: 30 goals fleet-wide in 5s - walk to furnace refused for 3s))',
  'F12 smelt: 0 (cobblestone@furnace: busy; oak_log@furnace: busy cold)',
  'F1 smelt: 0 (nothing to smelt)'
]

test('the refusal\'s own anatomy (v0.753.0): the segment classifier reads every face-61 voice', () => {
  // The single-voice segments.
  assert.equal(refusalSegClass('nothing to smelt'), 'nothing')
  assert.equal(refusalSegClass('cobblestone@furnace: no fuel'), 'no-fuel')
  assert.equal(refusalSegClass('raw_iron@blast_furnace: machine unreachable (visit budget spent (walk slice))'), 'unreachable')
  assert.equal(refusalSegClass('oak_log@furnace: machine unreachable (fleet goal ceiling: 30 goals fleet-wide in 5s - walk to furnace refused for 3s)'), 'unreachable')
  assert.equal(refusalSegClass('cobblestone@furnace: busy'), 'busy')
  assert.equal(refusalSegClass('oak_log@furnace: busy cold'), 'busy')
  assert.equal(refusalSegClass('timeout'), 'timeout')
  // The unknown voice reads 'other' (counted, never invented into a named class).
  assert.equal(refusalSegClass('quantum foam'), 'other')
  // The fixed vocab is the anatomy's own spine (stable shape for the row printers).
  assert.deepEqual(REFUSAL_SEG_CLASSES, ['nothing', 'no-fuel', 'busy', 'timeout', 'unreachable', 'other'])
})

test('the refusal\'s own anatomy (v0.753.0): refusalSegs splits the multi-segment machine skin', () => {
  // The bare voice.
  const bare = refusalSegs('nothing to smelt')
  assert.equal(bare.length, 1)
  assert.equal(bare[0].cls, 'nothing')
  assert.equal(bare[0].raw, 'nothing to smelt')
  // F19's 8-segment skin: one timeout + seven no-fuel retrials.
  const f19 = refusalSegs('timeout; cobblestone@furnace: no fuel; cobblestone@furnace: no fuel; cobblestone@furnace: no fuel; cobblestone@furnace: no fuel; cobblestone@furnace: no fuel; cobblestone@furnace: no fuel; cobblestone@furnace: no fuel')
  assert.equal(f19.length, 8)
  assert.equal(f19[0].cls, 'timeout')
  assert.equal(f19.slice(1).filter(p => p.cls === 'no-fuel').length, 7)
  // F12's busy pair.
  const f12 = refusalSegs('cobblestone@furnace: busy; oak_log@furnace: busy cold')
  assert.equal(f12.length, 2)
  assert.deepEqual(f12.map(p => p.cls), ['busy', 'busy'])
  // The nested parens survive the split (the greedy capture's own law).
  const f8 = refusalSegs('raw_iron@blast_furnace: machine unreachable (visit budget spent (walk slice))')
  assert.equal(f8.length, 1)
  assert.ok(f8[0].raw.endsWith('(walk slice))'))
})

test('the refusal\'s own anatomy (v0.753.0): smeltRefusalAnatomy prices face 61\'s refusal mix', () => {
  const a = smeltRefusalAnatomy(FACE61_REFUSALS)
  assert.ok(a)
  assert.equal(a.refusals, 14)
  // The mix: nothing 4 (F2 x2, F5, F1) / no-fuel 10 (F9, F5, F18 + F19's seven) /
  // unreachable 5 (F9, F8, F3, F13 x2) / busy 2 (F12) / timeout 1 (F19's head).
  assert.equal(a.segs.nothing, 4)
  assert.equal(a.segs['no-fuel'], 10)
  assert.equal(a.segs.unreachable, 5)
  assert.equal(a.segs.busy, 2)
  assert.equal(a.segs.timeout, 1)
  assert.equal(a.segs.other, 0)
  // The multi-segment skins: F19 (8 segs) and F12 (2 segs).
  assert.equal(a.multi, 2)
  // The roster: 9 distinct bots spoke (F2, F9, F8, F5, F3, F19, F18, F13, F12, F1 = 10).
  assert.equal(Object.keys(a.byBot).length, 10)
  assert.equal(a.byBot.F13, 2)
  assert.equal(a.rows.length, 14)
  // F19's row carries the whole 8-voice read in live order.
  const f19row = a.rows.find(r => r.bot === 'F19')
  assert.equal(f19row.classes.length, 8)
  assert.equal(f19row.classes[0], 'timeout')
})

test('the refusal\'s own anatomy (v0.753.0): junk battery - no anatomy from nothing', () => {
  // The WHY-text edges.
  assert.equal(refusalSegs(42), null)
  assert.equal(refusalSegs(null), null)
  assert.equal(refusalSegs(''), null)
  assert.equal(refusalSegs('   '), null)
  // The scan's edges.
  assert.equal(smeltRefusalAnatomy(null), null)
  assert.equal(smeltRefusalAnatomy('a string'), null)
  assert.equal(smeltRefusalAnatomy(42), null)
  const empty = smeltRefusalAnatomy([])
  assert.ok(empty)
  assert.equal(empty.refusals, 0)
  assert.equal(empty.multi, 0)
  assert.deepEqual(empty.segs, { nothing: 0, 'no-fuel': 0, busy: 0, timeout: 0, unreachable: 0, other: 0 })
  // Junk lines are skipped, never a crash; the yield line is NOT a refusal.
  const junk = smeltRefusalAnatomy([42, null, '', 'F1 smelt: 2 (something real)', 'junk', FACE61_REFUSALS[0]])
  assert.equal(junk.refusals, 1)
  assert.equal(junk.segs.nothing, 1)
  // The coarse lens is untouched: the v0.491.0 refusedWhy still reads {nothing, machine}
  // on the same face (the two generations coexist, the parse never forks).
  const sh = smeltHold([...FACE42_MINI])
  assert.ok(sh)
  assert.equal(sh.fates.refused, 2)
  assert.equal(sh.refusedWhy.nothing, 1)
  assert.equal(sh.refusedWhy.machine, 1)
})

// (v0.789.0) THE SMELT REFUSAL'S OWN SEGMENT - face 79's own segs cell
// through the seat: 30 refusal segments, the unreachable segment 73.3%.
const face79Anatomy = { refusals: 24, segs: { nothing: 3, 'no-fuel': 0, busy: 0, timeout: 5, unreachable: 22, other: 0 }, byBot: {}, multi: 6, rows: [] }

test('the refusal\'s own segment seat (v0.789.0): face 79\'s cell through the seat - unreachable owns 22 of 30 (73.3%)', () => {
  const s = smeltRefusalSeat(face79Anatomy)
  assert.deepEqual(s, { seg: 'unreachable', owns: 22, ofSegs: 30, share: 0.733 })
  assert.equal(smeltRefusalSeatRow(s), `the smelt refusal's own segment (v0.789.0): unreachable owns 22 of 30 refusal segment(s) (73.3%) - THE SEGMENT'S OWN SEAT: one segment's own refusals own the anatomy book - the segment's own front prices the hold the raw split rode unnamed`)
})

test('the refusal\'s own segment seat obeys the tie and the strict-majority laws (a tie owns nothing, below half owns nothing)', () => {
  // the tie - a tie owns nothing (the v0.784.0 seat law)
  assert.equal(smeltRefusalSeat({ segs: { busy: 3, timeout: 3 } }), null)
  // below half - 4 of 10 owns nothing
  assert.equal(smeltRefusalSeat({ segs: { busy: 4, timeout: 3, nothing: 3 } }), null)
  // the live face-61 corpus - no-fuel 10 of 22 (45.5%) sits BELOW half:
  // the mix the seat's own law refused to seat
  const a61 = smeltRefusalAnatomy(FACE61_REFUSALS)
  assert.equal(smeltRefusalSeat(a61), null)
  // the riders ride the no-owner cases - the byte order broke the rank tie
  // ('busy' < 'no-fuel' < 'nothing' < 'other' < 'timeout' < 'unreachable')
  const r61 = smeltRefusalRiders(a61)
  assert.deepEqual(r61, { leader: 'no-fuel', leaderOwns: 10, runner: 'unreachable', runnerOwns: 5, ofSegs: 22, pairOwns: 15, share: 0.682, duet: false })
  assert.equal(smeltRefusalRidersRow(r61), `the smelt refusal's own segment riders (v0.789.0): no solo segment owns the majority - no-fuel x10 + unreachable x5 own 15 of 22 refusal segment(s) (68.2%) - THE SEGMENT'S OWN MIX: the seat's tie law held, the mix is the shape - the segments' own spread prices the hold the solo law refused to name`)
  // the tie duet - the byte order pin ('busy' < 'timeout')
  const tieRiders = smeltRefusalRiders({ segs: { timeout: 3, busy: 3 } })
  assert.deepEqual(tieRiders, { leader: 'busy', leaderOwns: 3, runner: 'timeout', runnerOwns: 3, ofSegs: 6, pairOwns: 6, share: 1, duet: true })
})

test('the refusal\'s own segment riders is the measure-not-owner law (the owner case keeps the measure, the decompose branch decides)', () => {
  // the owner case's own measure - the riders still read (the branch law
  // lives in the decompose, the lib stays the honest measure)
  const m = smeltRefusalRiders(face79Anatomy)
  assert.deepEqual(m, { leader: 'unreachable', leaderOwns: 22, runner: 'timeout', runnerOwns: 5, ofSegs: 30, pairOwns: 27, share: 0.9, duet: false })
  // the single-segment fence - fewer than two counted segments reads the silence
  assert.equal(smeltRefusalRiders({ segs: { unreachable: 5 } }), null)
})

test('the segment seat\'s junk battery and the WIRING assert - the decompose branch rides the seat, the prose lives only in the lib', () => {
  // the junk battery - the honest silence every time
  const junk = [null, undefined, 42, 'prose', [], { segs: null }, { segs: 'x' }, { segs: {} }, { segs: { nothing: 0, timeout: 0 } }, { segs: { unreachable: -1 } }, { segs: { unreachable: NaN } }, { segs: { unreachable: Infinity } }]
  for (const j of junk) {
    assert.equal(smeltRefusalSeat(j), null)
    assert.equal(smeltRefusalRiders(j), null)
  }
  // a nameless segment never counts (the segment fence)
  assert.equal(smeltRefusalSeat({ segs: { '': 3 } }), null)
  // the rows' own junk law - the honest silence's row
  assert.equal(smeltRefusalSeatRow(null), null)
  assert.equal(smeltRefusalSeatRow({}), null)
  assert.equal(smeltRefusalSeatRow({ seg: '', owns: 1, ofSegs: 2, share: 0.5 }), null)
  assert.equal(smeltRefusalSeatRow({ seg: 'busy', owns: 3, ofSegs: 2, share: 1.5 }), null)
  assert.equal(smeltRefusalRidersRow(null), null)
  assert.equal(smeltRefusalRidersRow({}), null)
  assert.equal(smeltRefusalRidersRow({ leader: 'busy', leaderOwns: 0, runner: 'timeout', runnerOwns: 1, ofSegs: 1, pairOwns: 1, share: 1 }), null)
  // the WIRING assert - the decompose branch rides the seat, the prose
  // lives only in the lib
  const src = fs.readFileSync(new URL('../../scripts/fleet-mining/decompose.mjs', import.meta.url), 'utf8')
  assert.ok(src.includes('const srs = smeltRefusalSeat(ra)'), 'the seat rides the anatomy cells')
  assert.ok(src.includes('if (srs) console.log(`  ${smeltRefusalSeatRow(srs)}`)'), 'the owner row rides the branch')
  assert.ok(src.includes('const srr = smeltRefusalRiders(ra)'), 'the riders ride the same branch law')
  assert.ok(!src.includes("THE SEGMENT'S OWN SEAT"), 'the prose stays in the lib')
})
