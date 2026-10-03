// (v0.558.0) THE WEIGHT SHED - the bank-budget gap's cure, pure. The
// measured face: fleet 37125612065 (the second all-green fleet) read
// 'bank budget gap: 680s needed, 300s budgeted - 380s short at 1.1u/s'
// - a whale pocket reached the endphase and the budgeted tail could not
// drain it. The plan prices the mid-run shed trip against the RUN clock
// (the deadline), the dusk-bank plan's twin (which prices against the
// vanilla tod, the sky); the night hold stays untouchable.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { shedPlan, SHED_SAFETY_MS, SHED_SLACK_MS } from '../../src/lib/bankshed.mjs'
import { DUSK_BANK_SAFETY_MS } from '../../src/lib/duskbank.mjs'

const NOW = 1_000_000

test('shedPlan: junk reads unknown (never guessed)', () => {
  assert.equal(shedPlan({}).why, 'unknown')
  assert.equal(shedPlan({ pocketUnits: NaN, rate: 1, remainingMs: 1000, budgetMs: 1000 }).why, 'unknown')
  assert.equal(shedPlan({ pocketUnits: 500, rate: NaN, remainingMs: 1000, budgetMs: 1000 }).why, 'unknown')
  // a measured rate of zero (or negative) cannot price a need
  assert.equal(shedPlan({ pocketUnits: 500, rate: 0, remainingMs: 1000, budgetMs: 1000 }).why, 'unknown')
  assert.equal(shedPlan({ pocketUnits: 500, rate: -1, remainingMs: 1000, budgetMs: 1000 }).why, 'unknown')
  assert.equal(shedPlan({ pocketUnits: 500, rate: Infinity, remainingMs: 1000, budgetMs: 1000 }).why, 'unknown')
  // the run clock is a measured input - junk never prices a trip
  assert.equal(shedPlan({ pocketUnits: 500, rate: 1, remainingMs: NaN, budgetMs: 1000 }).why, 'unknown')
  assert.equal(shedPlan({ pocketUnits: 500, rate: 1, remainingMs: -1, budgetMs: 1000 }).why, 'unknown')
  // the budget is config - zero is impossible (the end bank always has one)
  assert.equal(shedPlan({ pocketUnits: 500, rate: 1, remainingMs: 1000, budgetMs: 0 }).why, 'unknown')
  assert.equal(shedPlan({ pocketUnits: 500, rate: 1, remainingMs: 1000, budgetMs: NaN }).why, 'unknown')
  assert.equal(shedPlan({ pocketUnits: Infinity, rate: 1, remainingMs: 1000, budgetMs: 1000 }).why, 'unknown')
})

test('shedPlan: an active trip re-reads as holding (never double-booked)', () => {
  const r = shedPlan({ pocketUnits: 748, rate: 1.1, tripMs: 120000, remainingMs: 400000, budgetMs: 300000, now: NOW, tripUntil: NOW + 30000 })
  assert.equal(r.why, 'holding')
  assert.equal(r.go, false)
  assert.equal(r.remainingMs, 30000)
  // an expired trip re-prices honestly (the trip's own clock owns the exit)
  const r2 = shedPlan({ pocketUnits: 748, rate: 1.1, tripMs: 120000, remainingMs: 400000, budgetMs: 300000, now: NOW, tripUntil: NOW - 1 })
  assert.equal(r2.why, 'shed')
  // junk tripUntil is no trip at all
  const r3 = shedPlan({ pocketUnits: 748, rate: 1.1, tripMs: 120000, remainingMs: 400000, budgetMs: 300000, now: NOW, tripUntil: NaN })
  assert.equal(r3.why, 'shed')
})

test('shedPlan: a covered pocket reads light (the leanness law - silence is healthy)', () => {
  // no pocket, no shed
  assert.equal(shedPlan({ pocketUnits: 0, rate: 1.1, remainingMs: 400000, budgetMs: 300000 }).why, 'light')
  assert.equal(shedPlan({ pocketUnits: -5, rate: 1.1, remainingMs: 400000, budgetMs: 300000 }).why, 'light')
  // 200u at 1.1u/s = 182s need, the 300s budget covers it
  const r = shedPlan({ pocketUnits: 200, rate: 1.1, remainingMs: 400000, budgetMs: 300000 })
  assert.equal(r.why, 'light')
  assert.equal(r.needS, 182)
  // the <= law parity with bankBudgetGapRow: need == budget is still light
  // (330u at 1.1u/s = 300s exactly)
  assert.equal(shedPlan({ pocketUnits: 330, rate: 1.1, remainingMs: 400000, budgetMs: 300000 }).why, 'light')
})

test('shedPlan: THE MEASURED FACE - the whale pocket sheds (fleet 37125612065)', () => {
  // 748u at 1.1u/s = 680s need vs the 300s budget - the field's own
  // '380s short'; the run clock still covers a 120s trip with margins
  const r = shedPlan({ pocketUnits: 748, rate: 1.1, tripMs: 120000, remainingMs: 400000, budgetMs: 300000, now: NOW })
  assert.equal(r.go, true)
  assert.equal(r.why, 'shed')
  assert.equal(r.needS, 680)
  assert.equal(r.gapS, 380)
  // priced until now + trip + safety (the walk's variance eats the margin)
  assert.equal(r.untilMs, NOW + 120000 + SHED_SAFETY_MS)
})

test('shedPlan: the fit boundary - trip + safety + slack against the run clock', () => {
  const p = { pocketUnits: 748, rate: 1.1, tripMs: 120000, budgetMs: 300000, now: NOW }
  // 120 + 15 + 30 = 165s: the exact fit sheds
  assert.equal(shedPlan({ ...p, remainingMs: 165000 }).why, 'shed')
  // one ms short reads late (the boundary exclusive)
  const r = shedPlan({ ...p, remainingMs: 164999 })
  assert.equal(r.why, 'late')
  assert.equal(r.go, false)
  assert.equal(r.remainingMs, 164999)
  assert.equal(r.needS, 680)
  // an unmeasured trip is never priced (junk tripMs reads late, not go)
  assert.equal(shedPlan({ ...p, tripMs: NaN, remainingMs: 400000 }).why, 'late')
  assert.equal(shedPlan({ ...p, tripMs: -1, remainingMs: 400000 }).why, 'late')
})

test('shedPlan: the floor law - the pocket floors before the need prices', () => {
  // 748.9u floors to 748 -> ceil(748/1.1) = 680 (the same floor the gap
  // row speaks - the two faces must never disagree about the arithmetic)
  const r = shedPlan({ pocketUnits: 748.9, rate: 1.1, tripMs: 120000, remainingMs: 400000, budgetMs: 300000, now: NOW })
  assert.equal(r.needS, 680)
  assert.equal(r.gapS, 380)
})

test('shedPlan: constants - the safety parity and the slack floor', () => {
  // the same walk physics as the dusk plan: one margin, one shape
  assert.equal(SHED_SAFETY_MS, DUSK_BANK_SAFETY_MS)
  assert.equal(SHED_SAFETY_MS, 15000)
  assert.equal(SHED_SLACK_MS, 30000)
})
