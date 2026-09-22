// Tests for the v0.68.0 mid-bank budget (src/lib/deposit.mjs midBankBudgetMs).
// The run65 ledger (dispatch 35682159103): all 10 bank trips ran the flat 120s
// 'pockets full' budget and 17/23 chest hops died 'budget exhausted (walk
// floor)' - the dist-scaled planned trip never fired once. The cure gives BOTH
// paths the dist-scaled chain whenever the run can afford it and keeps the flat
// floor near the deadline. Pure arithmetic - no server, no mocks.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  midBankBudgetMs, MID_BANK_RETURN_MARGIN_MS,
  bankTripBudgetMs, BANK_TRIP_FLOOR_MS, BANK_TRIP_CAP_MS
} from '../../src/lib/deposit.mjs'

const MIN = 60000
const floor = BANK_TRIP_FLOOR_MS // 120000
const ret = MID_BANK_RETURN_MARGIN_MS // 90000

test('constants: the guard pieces agree with the trip arithmetic', () => {
  assert.equal(floor, 120000)
  assert.equal(ret, 90000)
  assert.ok(BANK_TRIP_CAP_MS > floor)
})

test('no deadline in play -> the dist-scaled budget (legacy unbounded)', () => {
  assert.equal(midBankBudgetMs({ yardDist: 200 }), bankTripBudgetMs({ yardDist: 200 }))
  assert.equal(midBankBudgetMs({ yardDist: 0 }), bankTripBudgetMs({ yardDist: 0 }))
})

test('the run65 regression: 200 blocks out, plenty of run left -> the chain can pay the walk', () => {
  // want = 90s climb + 45s deposit + 2*200*0.5s walk = 335s -> capped 300s.
  // left 400s comfortably covers chain + 90s return.
  const b = midBankBudgetMs({ yardDist: 200, remainingMs: 400 * 1000 })
  assert.equal(b, BANK_TRIP_CAP_MS)
  assert.ok(b > floor, 'the flat 120s could never cover this walk - that was the wall')
})

test('a close bot gets the deposit room the flat floor starved', () => {
  // want = 90+45+2*20*0.5 = 155s; left 400s -> the chain is 155s, not 120s.
  const b = midBankBudgetMs({ yardDist: 20, remainingMs: 400 * 1000 })
  assert.equal(b, 155000)
})

test('the return-home margin is never eaten: the chain shrinks before the walk home does', () => {
  // want 300s but only chain+return fits: left 320s -> B = 320-90 = 230s.
  const b = midBankBudgetMs({ yardDist: 200, remainingMs: 320 * 1000 })
  assert.equal(b, 230000)
  assert.ok(b + ret <= 320 * 1000)
})

test('near the deadline the flat floor semantics stay (the hard-kill margin is sacred)', () => {
  // left <= floor + return -> min(floor, left)
  const near = midBankBudgetMs({ yardDist: 200, remainingMs: floor + ret - 1000 })
  assert.equal(near, floor) // min(120000, 209000) = 120000 - the chain floor survives
  const tighter = midBankBudgetMs({ yardDist: 200, remainingMs: 100 * 1000 })
  assert.equal(tighter, 100000) // min(120s, 100s)
})

test('junk-tolerant: NaN distance reads 0, NaN remaining reads unbounded, junk floor keeps the default', () => {
  assert.equal(midBankBudgetMs({ yardDist: NaN, remainingMs: Infinity }), bankTripBudgetMs({ yardDist: 0 }))
  assert.equal(midBankBudgetMs({ yardDist: 50, remainingMs: NaN }), bankTripBudgetMs({ yardDist: 50 }))
  assert.equal(midBankBudgetMs({ yardDist: 50, remainingMs: 400 * 1000, floorMs: NaN }), bankTripBudgetMs({ yardDist: 50, floorMs: BANK_TRIP_FLOOR_MS }))
  assert.equal(midBankBudgetMs({ yardDist: 50, remainingMs: -1 }), 0)
  // junk returnMs falls back to the constant, never to 0 (a 0 margin would strand the bot)
  const junkReturn = midBankBudgetMs({ yardDist: 200, remainingMs: 350 * 1000, returnMs: NaN })
  assert.equal(junkReturn, 260000) // want 300s; left - guard(120+90) + floor = 350-210+120 = 260s
})

test('monotonicity: more remaining never shrinks the budget', () => {
  let prev = 0
  for (const left of [130, 180, 220, 260, 300, 340, 420, 520].map(x => x * 1000)) {
    const b = midBankBudgetMs({ yardDist: 250, remainingMs: left })
    assert.ok(b >= prev, `left=${left} got ${b} < prev ${prev}`)
    prev = b
  }
})
