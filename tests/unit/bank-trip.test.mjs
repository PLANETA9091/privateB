// (v0.33.0) The mining-trip cadence: bank EARLY, while the walk back is still
// affordable. MEASURED (dispatch 35552013594, 600s on c292cf0): needsBanking
// (slots>=24 OR units>=128) almost never fires at ~90 mined blocks/bot/run, so
// pockets rode the whole 600s to the deadline and the final bank burned its
// 150s budget on a 100-300 block walk - 14x 'final bank: 0 (budget exhausted)',
// banked=0 for the whole fleet. These tests pin the pure policy: a planned trip
// fires only when loot, cadence and remaining time all agree, and its chain
// budget scales with the yard distance inside a hard [floor, cap] clamp.
import { test, beforeEach } from 'node:test'
import { resetDoomedGoalLedger } from '../../src/lib/jobqueue.mjs'
import assert from 'node:assert/strict'
import {
  bankTripDue, bankTripBudgetMs, finalBankBudgetMs,
  BANK_TRIP_EVERY_MS, BANK_TRIP_MIN_UNITS, BANK_TRIP_MIN_REMAINING_MS,
  BANK_TRIP_FLOOR_MS, BANK_TRIP_CAP_MS, CHEST_WALK_PER_BLOCK_MS
} from '../../src/lib/deposit.mjs'

// The doomed-goal ledger (v0.72.0) is a module-level singleton in jobqueue.mjs
// (one process = one fleet). A dead verdict recorded by one test's walk must
// not refuse the next test's walks (the mocks reuse chest/furnace positions),
// so every test here starts from an empty ledger.
beforeEach(() => resetDoomedGoalLedger())

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

// (v0.176.0) THE 600s-RUN WINDOW ARITHMETIC. The planned trip's eligible window
// in a 600s run is [BANK_TRIP_EVERY_MS, 600s - BANK_TRIP_MIN_REMAINING_MS]. At
// 330s that window was 120s wide - NARROWER than one mining-loop iteration
// (~90-150s), so most bots never landed a bank-gate check inside it: fleet
// 36125422448 measured ZERO 'planned' trips (15/15 'pockets full') and
// banked=0 for the whole 600s with ~1873u rotting in pockets. The pin: the
// window must stay at least one iteration wide, so every digging bot lands
// 1-2 checks inside it.
test('bankTripDue: the 600s planned window fits at least one mining-loop iteration (the v0.176.0 floor)', () => {
  const RUN_MS = 600000
  const LOOP_ITERATION_MS = 150000 // digShaft 60-120s + the tunnel + the vein sweep - the fat end
  const windowMs = RUN_MS - BANK_TRIP_MIN_REMAINING_MS - BANK_TRIP_EVERY_MS
  assert.ok(windowMs >= LOOP_ITERATION_MS,
    `the window (${windowMs / 1000}s) must fit one loop iteration (${LOOP_ITERATION_MS / 1000}s) - fleet 36125422448: 0 planned trips when it did not`)
  // and the boundary itself stays honest: 240s remaining fires, one tick below does not
  assert.equal(bankTripDue({ units: 100, msSinceBank: BANK_TRIP_EVERY_MS, remainingMs: RUN_MS - 360000 }), true,
    'a check landed at the 360s mark (4 min left) fires the trip')
  assert.equal(bankTripDue({ units: 100, msSinceBank: BANK_TRIP_EVERY_MS, remainingMs: 239999 }), false)
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
