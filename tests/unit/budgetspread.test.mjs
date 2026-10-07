import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { budgetSpread, budgetGoalSplit, budgetZeroSeat, budgetZeroSeatRow, budgetZeroRiders, budgetZeroRidersRow, BUDGET_SPENT_RE } from '../../src/lib/budgetspread.mjs'

// Face 42's budget-zero lines verbatim (the two trip emitters' own words).
const face42Budgets = [
  'F9 fuel commons: budget spent (0/1 units)',
  'F12 fuel commons: budget spent (0/1 units)',
  'F11 iron commune: budget spent (0/3 units)',
  'F6 iron commune: budget spent (0/3 units)',
  'F11 fuel commons: budget spent (0/3 units)',
  'F11 fuel commons: budget spent (0/4 units)',
  'F19 fuel commons: budget spent (0/1 units)'
]

test('budgetSpread reads the live face-42 shapes: the family spreads across the fleet', () => {
  const r = budgetSpread(face42Budgets)
  assert.equal(r.zeros, 7)
  assert.equal(r.byKind.fuel, 5)
  assert.equal(r.byKind.commune, 2)
  assert.equal(r.delivered, 0)
  assert.equal(r.goal, 1 + 1 + 3 + 3 + 3 + 4 + 1)
  assert.equal(r.spreadBots, 5)
  assert.equal(r.topBot, 'F11')
  assert.equal(r.topN, 3)
  assert.deepEqual(r.perBot.F11, { zeros: 3, delivered: 0, goal: 10 })
  assert.deepEqual(r.perBot.F19, { zeros: 1, delivered: 0, goal: 1 })
})

test('budgetSpread names the top bot by line-order tie (the first at the max governs)', () => {
  const r = budgetSpread([
    'F2 fuel commons: budget spent (0/1 units)',
    'F5 fuel commons: budget spent (0/1 units)'
  ])
  assert.equal(r.topBot, 'F2')
  assert.equal(r.topN, 1)
})

test('budgetSpread reads the delivered sum honestly (the law reads, never assumes the zero)', () => {
  const r = budgetSpread(['F3 iron commune: budget spent (2/3 units)'])
  assert.equal(r.delivered, 2)
  assert.equal(r.goal, 3)
  assert.equal(r.zeros, 1)
})

test('budgetSpread never matches the near-miss emitters (the anchor law)', () => {
  assert.ok(!BUDGET_SPENT_RE.test('F9 end-bank budget spent - smelt skipped'))
  assert.ok(!BUDGET_SPENT_RE.test('F4 bank trip: planned budget 243s'))
  assert.ok(!BUDGET_SPENT_RE.test('F9 fuel commons: open failed (open fuel chest: timeout after 10000ms)'))
  assert.ok(!BUDGET_SPENT_RE.test('F15 bank trip: deferred (rescue owns the bot - the arm waits for the release, the budget never burns)'))
})

test('budgetSpread is junk-safe and nulls on non-array (the laws)', () => {
  assert.equal(budgetSpread(null), null)
  assert.equal(budgetSpread('x'), null)
  assert.deepEqual(budgetSpread([null, 7, 'garbage', 'F9 end-bank budget spent - smelt skipped']), { zeros: 0, byKind: { fuel: 0, commune: 0 }, delivered: 0, goal: 0, spreadBots: 0, topBot: null, topN: 0, perBot: {} })
})

test('budgetSpread reads zero budgets honestly (the zero law)', () => {
  const r = budgetSpread([])
  assert.deepEqual(r, { zeros: 0, byKind: { fuel: 0, commune: 0 }, delivered: 0, goal: 0, spreadBots: 0, topBot: null, topN: 0, perBot: {} })
})

// (v0.475.0) THE GOAL SPLIT - face 43's live budget-zero lines verbatim
// (the miscalibration edge repeats: 25 of 34 ride 1u goals).
const face43Budgets = [
  ...Array(25).fill('F1 fuel commons: budget spent (0/1 units)'),
  ...Array(7).fill('F8 iron commune: budget spent (0/3 units)'),
  'F11 fuel commons: budget spent (0/6 units)',
  'F6 fuel commons: budget spent (0/2 units)'
]

test('budgetGoalSplit reads the live face-43 shapes: 25 of 34 zeros ride 1u goals', () => {
  const r = budgetGoalSplit(face43Budgets)
  assert.equal(r.zeros, 34)
  assert.deepEqual(r.one, { zeros: 25, goal: 25 })
  assert.deepEqual(r.small, { zeros: 8, goal: 23 })
  assert.deepEqual(r.wide, { zeros: 1, goal: 6 })
  assert.equal(r.oneShare, 25 / 34)
})

test('budgetGoalSplit buckets by the goal law (1 -> one, 2..3 -> small, 4+ -> wide)', () => {
  const r = budgetGoalSplit([
    'F2 fuel commons: budget spent (0/1 units)',
    'F3 fuel commons: budget spent (0/2 units)',
    'F4 fuel commons: budget spent (0/3 units)',
    'F5 fuel commons: budget spent (0/4 units)'
  ])
  assert.equal(r.one.zeros, 1)
  assert.equal(r.small.zeros, 2)
  assert.equal(r.wide.zeros, 1)
  assert.equal(r.small.goal, 5)
})

test('budgetGoalSplit counts the zero-delivery class only (a delivering budget is the other story)', () => {
  const r = budgetGoalSplit([
    'F7 iron commune: budget spent (2/4 units)',
    'F9 fuel commons: budget spent (0/1 units)'
  ])
  assert.equal(r.zeros, 1)
  assert.deepEqual(r.one, { zeros: 1, goal: 1 })
  assert.deepEqual(r.wide, { zeros: 0, goal: 0 })
})

test('budgetGoalSplit never matches the near-miss emitters (the anchor law holds for the split)', () => {
  const r = budgetGoalSplit([
    'F9 end-bank budget spent - smelt skipped',
    'F4 bank trip: planned budget 243s',
    'F9 fuel commons: open failed (open fuel chest: timeout after 10000ms)'
  ])
  assert.equal(r.zeros, 0)
  assert.equal(r.oneShare, 0)
})

test('budgetGoalSplit is junk-safe and nulls on non-array (the laws)', () => {
  assert.equal(budgetGoalSplit(null), null)
  assert.equal(budgetGoalSplit(42), null)
  assert.deepEqual(budgetGoalSplit([null, 'garbage', 'F9 end-bank budget spent - smelt skipped']), { zeros: 0, one: { zeros: 0, goal: 0 }, small: { zeros: 0, goal: 0 }, wide: { zeros: 0, goal: 0 }, oneShare: 0 })
})

// (v0.787.0) THE BUDGET ZERO'S OWN LANE - face 79's own byKind cell through
// the seat: 29 zero-delivery budgets, the fuel lane owns 26 (89.7%).
const face79Spread = { zeros: 29, byKind: { fuel: 26, commune: 3 }, delivered: 0, goal: 61, spreadBots: 18, topBot: 'F10', topN: 3, perBot: {} }

test('budgetZeroSeat reads the live face-79 cell through the seat: the fuel lane owns 26 of 29 (89.7%)', () => {
  const s = budgetZeroSeat(face79Spread)
  assert.deepEqual(s, { lane: 'fuel', owns: 26, ofZeros: 29, share: 0.897 })
  assert.equal(budgetZeroSeatRow(s), `the budget zero's own lane (v0.787.0): fuel owns 26 of 29 zero-delivery budget(s) (89.7%) - THE ZERO'S OWN LANE: one lane's own budgets own the zero book - the lane's own front prices the walks the raw split rode unnamed`)
})

test('budgetZeroSeat obeys the tie law and the strict-majority law (a tie owns nothing, below half owns nothing)', () => {
  // the tie - 14/14 owns nothing (the v0.784.0 seat law)
  assert.equal(budgetZeroSeat({ zeros: 28, byKind: { fuel: 14, commune: 14 } }), null)
  // below half - 4 of 10 owns nothing
  assert.equal(budgetZeroSeat({ zeros: 10, byKind: { fuel: 4, commune: 3 } }), null)
  // the riders ride the no-owner cases - the byte order broke the rank tie
  // ('commune' < 'fuel' - the lane's own byte asc)
  const tieRiders = budgetZeroRiders({ zeros: 28, byKind: { fuel: 14, commune: 14 } })
  assert.deepEqual(tieRiders, { leader: 'commune', leaderOwns: 14, runner: 'fuel', runnerOwns: 14, ofZeros: 28, pairOwns: 28, share: 1, duet: true })
  assert.equal(budgetZeroRidersRow(tieRiders), `the budget zero's own lane riders (v0.787.0): no solo lane owns the majority - commune x14 + fuel x14 own 28 of 28 zero-delivery budget(s) (100.0%) - THE ZERO'S OWN MIX: the seat's tie law held, the mix is the shape - the zeros' own spread prices the walks the solo law refused to name`)
  // the below-half mix - the riders measure the shape, never the owner
  const mixRiders = budgetZeroRiders({ zeros: 10, byKind: { fuel: 4, commune: 3 } })
  assert.deepEqual(mixRiders, { leader: 'fuel', leaderOwns: 4, runner: 'commune', runnerOwns: 3, ofZeros: 10, pairOwns: 7, share: 0.7, duet: false })
})

test('budgetZeroRiders is the measure-not-owner law (the owner case keeps the measure, the decompose branch decides)', () => {
  // the owner case's own measure - the riders still read (the branch law
  // lives in the decompose, the lib stays the honest measure)
  const m = budgetZeroRiders(face79Spread)
  assert.deepEqual(m, { leader: 'fuel', leaderOwns: 26, runner: 'commune', runnerOwns: 3, ofZeros: 29, pairOwns: 29, share: 1, duet: false })
  // the single-lane fence - fewer than two counted lanes reads the silence
  assert.equal(budgetZeroRiders({ zeros: 5, byKind: { fuel: 5, commune: 0 } }), null)
})

test('the junk battery and the WIRING assert - the decompose branch rides the seat, the prose lives only in the lib', () => {
  // the junk battery - the honest silence every time
  const junk = [null, undefined, 42, 'prose', [], { byKind: null }, { byKind: 'x' }, { byKind: {} }, { byKind: { fuel: 0, commune: 0 }, zeros: 5 }, { zeros: 0, byKind: { fuel: 5 } }, { zeros: -1, byKind: { fuel: 5 } }, { zeros: NaN, byKind: { fuel: 5 } }]
  for (const j of junk) {
    assert.equal(budgetZeroSeat(j), null)
    assert.equal(budgetZeroRiders(j), null)
  }
  // a nameless lane never counts (the lane fence)
  assert.equal(budgetZeroSeat({ zeros: 3, byKind: { '': 3 } }), null)
  // the rows' own junk law - the honest silence's row
  assert.equal(budgetZeroSeatRow(null), null)
  assert.equal(budgetZeroSeatRow({}), null)
  assert.equal(budgetZeroSeatRow({ lane: '', owns: 1, ofZeros: 2, share: 0.5 }), null)
  assert.equal(budgetZeroSeatRow({ lane: 'fuel', owns: 3, ofZeros: 2, share: 1.5 }), null)
  assert.equal(budgetZeroRidersRow(null), null)
  assert.equal(budgetZeroRidersRow({}), null)
  assert.equal(budgetZeroRidersRow({ leader: 'fuel', leaderOwns: 0, runner: 'commune', runnerOwns: 1, ofZeros: 1, pairOwns: 1, share: 1 }), null)
  // the WIRING assert - the decompose branch rides the seat, the prose
  // lives only in the lib
  const src = fs.readFileSync(new URL('../../scripts/fleet-mining/decompose.mjs', import.meta.url), 'utf8')
  assert.ok(src.includes('const bzs = budgetZeroSeat(bs)'), 'the seat rides the budgetSpread cells')
  assert.ok(src.includes('if (bzs) console.log(`  ${budgetZeroSeatRow(bzs)}`)'), 'the owner row rides the branch')
  assert.ok(src.includes('const bzr = budgetZeroRiders(bs)'), 'the riders ride the same branch law')
  assert.ok(!src.includes("THE ZERO'S OWN LANE"), 'the prose stays in the lib')
})
