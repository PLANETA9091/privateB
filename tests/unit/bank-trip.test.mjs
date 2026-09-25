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

// ---- (v0.181.0) THE DOOMED TRIP GATE ----
// MEASURED (fleet 36148566518, the v0.180.0 run): banked=0 with 11 trips fired -
// the 9 needsBanking trips started at budgets 120/61/45/17/13/9s (every one a
// doomed chain: the climb alone measures ~90s), each failed climb exhausted the
// ledger that then refused the wood famine trips ('wood trip: 0 (climb refused)'
// x3 - torched=1 with 104 torches crafted, the dark wet shafts fed the drown
// deaths). The pockets-full path now obeys its own viability gate; the PLANNED
// path's 240s gate (bankTripDue) stays byte-identical.
import { needsBankingTripViable, NEEDS_BANKING_MIN_REMAINING_MS } from '../../src/lib/deposit.mjs'
import { readFileSync } from 'node:fs'

test('needsBankingTripViable: the run180 doomed-clock class refuses (the cascade breaker)', () => {
  for (const remaining of [9000, 13000, 17000, 45000, 61000, 120000]) {
    assert.equal(needsBankingTripViable({ remainingMs: remaining }), false,
      `${remaining / 1000}s left is a doomed chain - the climb alone is ~90s and the walk never fits`)
  }
})

test('needsBankingTripViable: the 150s boundary and the viable side', () => {
  assert.equal(needsBankingTripViable({ remainingMs: 149999 }), false, 'one ms under the floor refuses')
  assert.equal(needsBankingTripViable({ remainingMs: NEEDS_BANKING_MIN_REMAINING_MS }), true, 'exactly the floor is viable')
  assert.equal(needsBankingTripViable({ remainingMs: 151000 }), true, 'above the floor is viable')
  assert.equal(needsBankingTripViable({ remainingMs: 240000 }), true, 'the planned window stays untouched')
  assert.equal(NEEDS_BANKING_MIN_REMAINING_MS, 150000, 'the floor = the climb (~90s) + a 60s deposit slice (the end-bank scale)')
})

test('needsBankingTripViable: junk/absent remaining clock returns VIABLE (a missing read never widens a refusal)', () => {
  for (const junk of [NaN, undefined, null, 'x', {}]) {
    assert.equal(needsBankingTripViable({ remainingMs: junk }), true, `remaining=${String(junk)} -> the legacy shape (viable)`)
  }
  assert.equal(needsBankingTripViable(), true, 'no argument at all -> viable')
  assert.equal(needsBankingTripViable({ remainingMs: Infinity }), true, 'no deadline in play -> viable')
  assert.equal(needsBankingTripViable({ remainingMs: -5000 }), false, 'a PAST deadline is the most doomed clock of all')
})

test('needsBankingTripViable: junk minRemainingMs falls back to the constant (no zero-floor escape)', () => {
  assert.equal(needsBankingTripViable({ remainingMs: 100000, minRemainingMs: NaN }), false, 'junk floor -> the 150s constant, not a free pass')
  assert.equal(needsBankingTripViable({ remainingMs: 100000, minRemainingMs: 0 }), false, 'zero floor -> the 150s constant')
  assert.equal(needsBankingTripViable({ remainingMs: 100000, minRemainingMs: -5 }), false, 'negative floor -> the 150s constant')
})

test("REGRESSION PIN: the fleet gate refuses the pockets-full trip, advances the cadence, and keeps mining", async () => {
  const src = readFileSync(new URL('../../testbed/fleet19.mjs', import.meta.url), 'utf8')
  assert.ok(src.includes('needsBankingTripViable'), 'the fleet imports and consults the viability gate')
  assert.ok(src.includes('const bankViable = tripPlanned || needsBankingTripViable({ remainingMs: bankRemainingMs })'),
    'the PLANNED path rides the gate untouched (tripPlanned short-circuits viable)')
  assert.ok(src.includes("bank trip: skipped (pockets full, "), 'the refusal names itself (rides the \'bank \' filter key)')
  assert.ok(src.includes('the end-phase owns the deadline banking'), 'the refusal names the owner (the pre-position + final bank)')
  const filterMatch = src.match(/if \(\/([^/]+)\/\.test\(m\)\) console\.log\(`\$\{name\} \$\{m\}`\)/)
  assert.ok(filterMatch, 'the bot-log filter regex found in fleet19.mjs')
  assert.ok(new RegExp(filterMatch[1]).test('[F7] bank trip: skipped (pockets full, 42s left < 150s - the end-phase owns the deadline banking)'),
    'the skip line reaches the artifact (the v0.176.0 filter-blind lesson)')
})
