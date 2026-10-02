import { test } from 'node:test'
import assert from 'node:assert/strict'
import { budgetSpread, budgetGoalSplit, BUDGET_SPENT_RE } from '../../src/lib/budgetspread.mjs'

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
