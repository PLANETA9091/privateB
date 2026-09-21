// (v0.33.0) The mining-trip cadence: bank EARLY, while the walk back is still
// affordable. MEASURED (dispatch 35552013594, 600s on c292cf0): needsBanking
// (slots>=24 OR units>=128) almost never fires at ~90 mined blocks/bot/run, so
// pockets rode the whole 600s to the deadline and the final bank burned its
// 150s budget on a 100-300 block walk - 14x 'final bank: 0 (budget exhausted)',
// banked=0 for the whole fleet. These tests pin the pure policy: a planned trip
// fires only when loot, cadence and remaining time all agree, and its chain
// budget scales with the yard distance inside a hard [floor, cap] clamp.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  bankTripDue, bankTripBudgetMs, finalBankBudgetMs,
  BANK_TRIP_EVERY_MS, BANK_TRIP_MIN_UNITS, BANK_TRIP_MIN_REMAINING_MS,
  BANK_TRIP_FLOOR_MS, BANK_TRIP_CAP_MS, CHEST_WALK_PER_BLOCK_MS
} from '../../src/lib/deposit.mjs'

test('bankTripDue: junk and empty input never trip', () => {
  assert.equal(bankTripDue(), false)
  assert.equal(bankTripDue({}), false)
  assert.equal(bankTripDue({ units: NaN, msSinceBank: 999999 }), false)
  assert.equal(bankTripDue({ units: -5, msSinceBank: 999999 }), false)
  assert.equal(bankTripDue({ units: 'junk', msSinceBank: 'junk' }), false)
})

test('bankTripDue: thin pockets are not worth the walk', () => {
  assert.equal(bankTripDue({ units: BANK_TRIP_MIN_UNITS - 1, msSinceBank: 999999 }), false)
  assert.equal(bankTripDue({ units: 0, msSinceBank: 999999 }), false)
})

test('bankTripDue: the cadence gate - a trip at most every BANK_TRIP_EVERY_MS', () => {
  const args = { units: 100, remainingMs: 500000 }
  assert.equal(bankTripDue({ ...args, msSinceBank: BANK_TRIP_EVERY_MS - 1 }), false)
  assert.equal(bankTripDue({ ...args, msSinceBank: BANK_TRIP_EVERY_MS }), true, 'exactly at the cadence line fires')
  assert.equal(bankTripDue({ ...args, msSinceBank: BANK_TRIP_EVERY_MS + 60000 }), true)
  assert.equal(bankTripDue({ ...args, msSinceBank: NaN }), false, 'junk msSinceBank = never dug = no trip')
})

test('bankTripDue: too late for a full trip - the end-phase owns the bot', () => {
  const args = { units: 100, msSinceBank: 999999 }
  assert.equal(bankTripDue({ ...args, remainingMs: BANK_TRIP_MIN_REMAINING_MS - 1 }), false)
  assert.equal(bankTripDue({ ...args, remainingMs: BANK_TRIP_MIN_REMAINING_MS }), true, 'exactly at the line fires')
  assert.equal(bankTripDue({ ...args, remainingMs: 0 }), false)
  assert.equal(bankTripDue({ ...args, remainingMs: -1000 }), false)
  assert.equal(bankTripDue({ ...args, remainingMs: NaN }), false, 'junk remaining = assume too late')
})

test('bankTripBudgetMs: a near-yard trip keeps the v0.28.0 mid-run floor', () => {
  assert.equal(bankTripBudgetMs({ yardDist: 0 }), BANK_TRIP_FLOOR_MS + 15000,
    '90s climb + 45s deposit + 0 walk = 135s')
  assert.equal(bankTripBudgetMs({ yardDist: 10 }), 90000 + 45000 + 2 * 10 * CHEST_WALK_PER_BLOCK_MS,
    'short walks add their (small) there-and-back on top of the floor')
})

test('bankTripBudgetMs: the there-and-back walk scales at the measured rate', () => {
  // 100 blocks: 90s climb + 45s deposit + 2 * 100 * 500ms = 135s + 100s = 235s
  assert.equal(bankTripBudgetMs({ yardDist: 100 }), 90000 + 45000 + 2 * 100 * CHEST_WALK_PER_BLOCK_MS)
})

test('bankTripBudgetMs: the 420s hard-kill margin is sacred - the cap holds', () => {
  assert.equal(bankTripBudgetMs({ yardDist: 300 }), BANK_TRIP_CAP_MS,
    'raw 435s for 300 blocks is clamped to the 300s ceiling')
  assert.equal(bankTripBudgetMs({ yardDist: 10000 }), BANK_TRIP_CAP_MS)
  assert.ok(BANK_TRIP_CAP_MS + 90000 <= 420000,
    'trip budget + the 90s return walk must fit the hard-kill margin')
})

test('bankTripBudgetMs: junk distance and junk clamps are tolerated', () => {
  assert.equal(bankTripBudgetMs({}), BANK_TRIP_FLOOR_MS + 15000, 'bare call = at the yard')
  assert.equal(bankTripBudgetMs({ yardDist: NaN }), BANK_TRIP_FLOOR_MS + 15000)
  assert.equal(bankTripBudgetMs({ yardDist: -40 }), BANK_TRIP_FLOOR_MS + 15000)
  assert.equal(bankTripBudgetMs({ yardDist: 0, floorMs: NaN }), BANK_TRIP_FLOOR_MS + 15000,
    'junk floor falls back to the default')
  assert.equal(bankTripBudgetMs({ yardDist: 0, capMs: 1000 }), BANK_TRIP_FLOOR_MS + 15000,
    'a cap below the floor is ignored (the default cap wins, the baseline budget stands)')
})

test('finalBankBudgetMs: a near-yard bot keeps the historical 150s floor', () => {
  assert.equal(finalBankBudgetMs({ yardDist: 0, marginLeftMs: 400000, floorMs: 150000, capMs: 280000 }), 150000)
})

test('finalBankBudgetMs: a far bot gets the distance-scaled budget up to the cap', () => {
  // 200 blocks: 90s climb + 45s deposit + 2*200*500ms = 335s raw -> the 280s cap
  assert.equal(finalBankBudgetMs({ yardDist: 200, marginLeftMs: 400000, floorMs: 150000, capMs: 280000 }), 280000)
})

test('finalBankBudgetMs: whatever hard-kill margin is left caps everything', () => {
  assert.equal(finalBankBudgetMs({ yardDist: 200, marginLeftMs: 200000, floorMs: 150000, capMs: 280000 }), 200000)
  assert.equal(finalBankBudgetMs({ yardDist: 0, marginLeftMs: 40000, floorMs: 150000, capMs: 280000 }), 40000,
    'below the floor the bot still uses what is left (a near chest may be reachable)')
})

test('finalBankBudgetMs: no margin left = refuse at once (named budget exhausted)', () => {
  assert.equal(finalBankBudgetMs({ yardDist: 0, marginLeftMs: 0 }), 0)
  assert.equal(finalBankBudgetMs({ yardDist: 0, marginLeftMs: -5 }), 0)
  assert.equal(finalBankBudgetMs({ yardDist: 0, marginLeftMs: NaN }), 0)
})
