//
// smelthold.test.mjs - THE SMELT HOLD LEDGER (v0.491.0) unit tests.
// The lines are byte-verbatim from the stored faces (face 42/43
// fleet19.log), in the live order - hand-traced first, then pinned.
//
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { smeltHold, SMELT_HOLD_RE, SMELT_HOLD_SKIP_RE, SMELT_END_BANK_SKIP_RE, SMELT_LOCAL_FALLBACK_RE } from '../../src/lib/smelthold.mjs'
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
