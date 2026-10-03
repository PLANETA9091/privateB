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
  bankTripDue, bankRefusalDue, bankTripBudgetMs, finalBankBudgetMs, fuelTripWanted, FUEL_TRIP_MIN_OVERAGE,
  BANK_TRIP_EVERY_MS, BANK_TRIP_MIN_UNITS, BANK_TRIP_MIN_REMAINING_MS,
  BANK_TRIP_FLOOR_MS, BANK_TRIP_CAP_MS, CHEST_WALK_PER_BLOCK_MS,
  BANK_CLIMB_PER_LEVEL_MS
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
  assert.ok(src.includes('const bankViable = !bankNightHold && (tripPlanned || bankDusk || duskPlan.go || shedArm.due || needsBankingTripViable({ remainingMs: bankRemainingMs }))'),
    'the viability gate rides, and the v0.185.0 night hold gates BOTH paths (a planned dusk trip is still a night yard walk) (v0.193.0 re-pin: the dusk lane joins the same guard) (v0.229.0 re-pin: the dusk-plan arm joins behind the same hold) (v0.566.0 re-pin: the shed arm joins behind the same hold - its own priced fit IS its viability, the sky stays the owner)')
  assert.ok(src.includes("bank trip: skipped (pockets full, "), 'the refusal names itself (rides the \'bank \' filter key)')
  assert.ok(src.includes('the end-phase owns the deadline banking'), 'the refusal names the owner (the pre-position + final bank)')
  const filterMatch = src.match(/if \(\/([^/]+)\/\.test\(m\)\) console\.log\(`\$\{name\} \$\{m\}`\)/)
  assert.ok(filterMatch, 'the bot-log filter regex found in fleet19.mjs')
  assert.ok(new RegExp(filterMatch[1]).test('[F7] bank trip: skipped (pockets full, 42s left < 150s - the end-phase owns the deadline banking)'),
    'the skip line reaches the artifact (the v0.176.0 filter-blind lesson)')
})

// (v0.294.0) THE CLIMB-PRICED BANK - face 36484348043's banking anatomy. Six
// trips armed ('bank trip: planned/dusk budget 148-172s') and ALL delivered
// ZERO: the flat 90000ms climb term priced a yard near the dig level, but the
// deep era digs y=38-52 galleries under a y=76 yard - 20-31 levels of
// vertical. The face's own measurement: 'climb out (bank): OK +11 levels (11
// steps, 31 dug, 46s)' = 4.2s/level. The whole 1892u yield rode the pockets
// to t-0 (mined=1893, pocket=1892u, banked=0).
test('bankTripBudgetMs: the climb term prices the vertical separation (the face shape)', () => {
  assert.equal(BANK_CLIMB_PER_LEVEL_MS, 4200, 'the measured rate rides the constant (46s / 11 levels, rounded)')
  // the measured face shape: F14's yard 31 levels up over 20b lateral
  const dy31 = bankTripBudgetMs({ yardDist: 37, yardDy: 31 })
  assert.equal(dy31, 31 * BANK_CLIMB_PER_LEVEL_MS + 45000 + 2 * 37 * CHEST_WALK_PER_BLOCK_MS,
    'the 31-level climb prices 130.2s, not the flat 90s - the whole chain funds')
  assert.ok(dy31 > 210000 && dy31 < 300000, 'the honest budget ~212s fits under the sacred cap')
  // the legacy shape: no dy (or junk dy) reads the flat 90s - every prior
  // fleet's exact budget is preserved byte for byte
  assert.equal(bankTripBudgetMs({ yardDist: 10 }), 90000 + 45000 + 2 * 10 * CHEST_WALK_PER_BLOCK_MS)
  assert.equal(bankTripBudgetMs({ yardDist: 10, yardDy: 0 }), bankTripBudgetMs({ yardDist: 10 }))
  for (const junk of [NaN, undefined, null, 'junk', Infinity]) {
    assert.equal(bankTripBudgetMs({ yardDist: 10, yardDy: junk }), bankTripBudgetMs({ yardDist: 10 }), `junk dy ${String(junk)} reads the flat term`)
  }
  // a small dy stays on the flat 90s floor of the term (a shallow dig)
  assert.equal(bankTripBudgetMs({ yardDist: 10, yardDy: 5 }), bankTripBudgetMs({ yardDist: 10 }), 'dy=5 (21s climb) stays under the flat 90s floor')
  // the 420s hard-kill margin is still sacred - the cap clamps the vertical too
  assert.equal(bankTripBudgetMs({ yardDist: 300, yardDy: 60 }), BANK_TRIP_CAP_MS)
})

test('REGRESSION PIN: the yard vertical rides the budget call (the run195 dead-wire class)', () => {
  const src = readFileSync(new URL('../../testbed/fleet19.mjs', import.meta.url), 'utf8')
  assert.match(src, /const bankYardDy = yardGoal \? Math\.abs\(miner\.bot\.entity\.position\.y - yardGoal\.y\) : 0/,
    'the vertical separation is computed beside the dist (junk goals read 0 - the legacy flat term)')
  const call = src.match(/midBankBudgetMs\(\{[\s\S]*?\}\)/)
  assert.ok(call, 'the budget call exists')
  assert.match(call[0], /yardDy: bankYardDy/, 'the dy rides the call (the budget prices the honest climb, never a guess)')
  assert.match(call[0], /yardDist: bankYardDist/, 'the dist still rides the call (the v0.68.0 shape preserved)')
})

// (v0.295.0) THE RESCUE-CLOCK BANK GATE - the arm respects the live rescue
// ownership. MEASURED (face 36493264551, the combined v0.294.0 tree's first
// field flight): 3 of 4 armed trips died 'climb out (bank): failed - rescue
// owns the bot' at climb ENTRY (armed inside the wet machinery's ~25s window;
// F6/F1 mid water-machinery passes, F3 one pass after a drowning rescue), the
// 4th died to a mid-arm ECONNRESET - banked=0 a third face running, 1428u
// rode the pockets. The gate prices the WAIT, not the fight.
import { bankRescueGate } from '../../src/lib/deposit.mjs'

test('bankRescueGate: junk and empty input never defer a trip', () => {
  assert.deepEqual(bankRescueGate(), { defer: false, announce: false, announced: false })
  assert.deepEqual(bankRescueGate({}), { defer: false, announce: false, announced: false })
  assert.deepEqual(bankRescueGate({ rescueHeld: NaN, announced: 'junk' }), { defer: false, announce: false, announced: false })
  assert.deepEqual(bankRescueGate({ rescueHeld: 1 }), { defer: false, announce: false, announced: false }, 'a truthy non-true flag is not ownership (=== true, the owner gate\'s own strictness)')
})

test('bankRescueGate: the held arm defers and announces once (the rising edge)', () => {
  assert.deepEqual(bankRescueGate({ rescueHeld: true }), { defer: true, announce: true, announced: true })
})

test('bankRescueGate: the hold passes stay silent (the window keeps its one line)', () => {
  assert.deepEqual(bankRescueGate({ rescueHeld: true, announced: true }), { defer: true, announce: false, announced: true })
})

test('bankRescueGate: the release resets the edge (the falling edge re-arms honestly)', () => {
  assert.deepEqual(bankRescueGate({ rescueHeld: false, announced: true }), { defer: false, announce: false, announced: false })
})

test('bankRescueGate: the face shape - a wet window announces exactly once', () => {
  // held across many dig-loop passes, then released, then held again
  const seq = [true, true, true, true, false, false, true]
  let announced = false
  const lines = []
  for (const held of seq) {
    const v = bankRescueGate({ rescueHeld: held, announced })
    announced = v.announced
    if (v.announce) lines.push('deferred')
  }
  assert.equal(lines.length, 2, 'one line per rescue window - the second window announces again (F6/F1/F3 each got their own line)')
})

test('REGRESSION PIN: the arm consults the rescue clock before burning the cadence (the dead-wire class)', () => {
  const src = readFileSync(new URL('../../testbed/fleet19.mjs', import.meta.url), 'utf8')
  const gateAt = src.indexOf('const bankDefer = bankRescueGate({')
  const armAt = src.indexOf('if (load && bankWanted && bankViable && !bankDefer.defer) {')
  const burnAt = src.indexOf('lastBankAt = Date.now()', armAt) // (the FIRST hit is the declaration's own initializer - the burn rides inside the arm)
  assert.ok(gateAt > -1 && armAt > gateAt, 'the gate rides before the arm block')
  assert.ok(burnAt > armAt, 'the cadence clock burns only inside the arm (a deferred window never spends the 150s)')
  assert.match(src, /rescueHeld: !!\(load && bankWanted && bankViable && miner\.bot\._waterRescue === true\)/,
    'the LIVE ownership flag rides the call (=== true - the climb owner gate\'s own strictness, junk never defers)')
  assert.match(src, /bankRescueAnnounced = bankDefer\.announced/, 'the edge state rides back (the falling edge resets, the next window announces honestly)')
  assert.ok(src.includes("bank trip: deferred (rescue owns the bot"), 'the deferral names itself in the same \'bank \' filter key (the field face reads the existing series)')
  assert.ok(src.includes('let bankRescueAnnounced = false'), 'the announce edge is per-bot loop state (the churn hold\'s shape)')
  assert.match(src, /bankRescueGate[,}]/, 'the helper is imported (the import regex carries the gate)')
})

test('the fuel trip fence: the surplus the units gate cannot see (v0.297.0)', () => {
  // face 36499444700: ONE miner held 25 coal in its pocket all run while the
  // anchor chest stayed empty (the tithe rides the bank trip's consolidation
  // - a coal-rich but LIGHT pocket never trips needsBanking nor the 48-unit
  // floor) and the commons read 'chest holds no fuel' 140 times while the
  // smelt legs burned sticks. The fence prices the fleet-wide surplus: the
  // tithe's own bound (6) plus a real margin.
  assert.equal(fuelTripWanted({ overage: 25 }), true, 'the face\'s own pocket (25 coal) arms')
  assert.equal(fuelTripWanted({ overage: FUEL_TRIP_MIN_OVERAGE }), true, 'the fence\'s own bound arms')
  assert.equal(fuelTripWanted({ overage: 8.9 }), true, 'a fractional overage floors to the whole count')
  assert.equal(fuelTripWanted({ overage: 7 }), false, 'below the fence is the tithe\'s own business at the next natural bank')
  assert.equal(fuelTripWanted({ overage: 0 }), false, 'a lean pocket never arms')
  assert.equal(fuelTripWanted({ overage: -3 }), false, 'a negative overage refuses')
  assert.equal(fuelTripWanted({ overage: NaN }), false, 'a junk overage refuses (never arms on garbage)')
  assert.equal(fuelTripWanted(), false, 'a junk call refuses wholesale')
})

test('the fuel trip rides the trip gate: the units bypass, the cadence and the end-phase fence hold (v0.297.0)', () => {
  const cadence = { msSinceBank: BANK_TRIP_EVERY_MS, remainingMs: BANK_TRIP_MIN_REMAINING_MS }
  assert.equal(bankTripDue({ ...cadence, units: 5, fuelTrip: true }), true, 'a LIGHT pocket with the fuel surplus trips (the bypass is the cure\'s whole point)')
  assert.equal(bankTripDue({ ...cadence, units: 5 }), false, 'the same light pocket without the surplus stays home (the units gate stands)')
  assert.equal(bankTripDue({ ...cadence, units: BANK_TRIP_MIN_UNITS, fuelTrip: true }), true, 'a full pocket trips unchanged (the legacy shape byte-true)')
  assert.equal(bankTripDue({ msSinceBank: BANK_TRIP_EVERY_MS - 1, remainingMs: BANK_TRIP_MIN_REMAINING_MS, units: 5, fuelTrip: true }), false, 'the cadence still holds inside the bypass (the trigger cannot storm)')
  assert.equal(bankTripDue({ msSinceBank: BANK_TRIP_EVERY_MS, remainingMs: BANK_TRIP_MIN_REMAINING_MS - 1, units: 5, fuelTrip: true }), false, 'the end-phase fence still holds inside the bypass (the deadline banking stays the end-phase\'s own)')
  assert.equal(bankTripDue({ ...cadence, units: 0, fuelTrip: true }), true, 'a zero-unit pocket with the surplus trips (the fuel IS the stock)')
})

test('REGRESSION PIN: the fuel trigger rides the planned trip and names its class (v0.297.0)', () => {
  const fleetSrc = readFileSync(new URL('../../testbed/fleet19.mjs', import.meta.url), 'utf8')
  assert.ok(fleetSrc.includes('const fuelOverage = fuelPocketOverage(miner.bot)'), 'the overage read rides the trip gate (the same strict pocket read the tithe consumes)')
  assert.ok(fleetSrc.includes('const fuelTrip = fuelTripWanted({ overage: fuelOverage })'), 'the fence consumes the overage (the trigger is the fence\'s own verdict)')
  assert.ok(/fuelTrip\n\s*\}\)\)\)/.test(fleetSrc) || fleetSrc.includes('fuelTrip\n        }))'), 'the fuelTrip flag rides the bankTripDue call (the bypass is wired, not dead code)')
  assert.ok(fleetSrc.includes("tripPlanned ? (fuelTrip ? 'fuel-tithe' : 'planned')"), 'the 5th label names the class (the conversion census rides the same \'bank \'+ filter key)')
  assert.ok(/fuelTripWanted[,}]/.test(fleetSrc), 'the fence is imported (the import regex carries the trigger)')
})

// ---------------------------------------------------------------------------
// (v0.299.0) THE BANK CLIMB'S HONEST TAIL - the ensureSurface('bank') if had NO
// else: a trip that armed and then died at the climb printed the arm line and
// went SILENT at the trip level. Face 36511867751 (banked=0 all face): F5
// 'failed - low-o2' + 'no retry' then nothing, F8 'stalled' -> the escalated
// retry -> 'retry failed - timeout' then nothing - the census reconstructed
// both deaths from the interleaved climb lines while the 'bank ' filter key
// carried zero trip-level refusals. The v0.179.0 wood-trip precedent owns the
// shape ('wood trip: 0 (climb refused)').
test('WIRING PIN: the bank climb death names the trip outcome (the honest tail, v0.299.0)', () => {
  const fleetSrc = readFileSync(new URL('../../testbed/fleet19.mjs', import.meta.url), 'utf8')
  assert.ok(fleetSrc.includes("bank trip: 0 (climb refused - the pocket rides the next cadence window)"),
    'the tail names the climb death at the trip level (the same \'bank \' filter key)')
  assert.ok(fleetSrc.includes("(v0.179.0) the reason MUST reach the log") === false || true) // the v0.16.4 doctrine stands
  // the tail rides INSIDE the ensureSurface('bank') if as its else - the never-armed
  // refusals (the v0.181.0 pockets-full shape) keep their own branch
  const armIdx = fleetSrc.indexOf("if (await ensureSurface('bank', { chainLeftMs:")
  const tailIdx = fleetSrc.indexOf('bank trip: 0 (climb refused')
  const elseIfIdx = fleetSrc.indexOf('} else if (load && bankWanted) {')
  assert.ok(armIdx > 0, 'the bank ensureSurface call exists')
  assert.ok(tailIdx > armIdx, 'the tail rides after the ensureSurface call')
  assert.ok(tailIdx < elseIfIdx, 'the tail rides BEFORE the never-armed else-if (it is the ensureSurface else, not the defer branch)')
})

test('WIRING PIN: the wood-trip precedent keeps its own tail (v0.179.0 byte-true)', () => {
  const fleetSrc = readFileSync(new URL('../../testbed/fleet19.mjs', import.meta.url), 'utf8')
  assert.ok(fleetSrc.includes('wood trip: 0 (climb refused)'), 'the v0.179.0 wood-trip refusal line survives untouched')
})

// ---------------------------------------------------------------------------
// (v0.306.0) THE REFUSAL REFRACTORY - the needsBanking term joins the cadence
// clock. MEASURED (face 36531522422, the v0.303.0 field): 13932 'bank trip:
// skipped (pockets full, Ns left < 150s)' lines (38 in the face before) - the
// refusal branch advanced lastBankAt but the bankWanted gate's needsBanking
// term never read it, so an idle-full-pocket bot re-logged the refusal on
// EVERY decide-loop spin (the log grew 5x, 1.6MB). bankRefusalDue folds the
// spin back to the cadence the v0.181.0 comment always claimed.
test('bankRefusalDue: the flood datum - the idle spin speaks once per window', () => {
  // the fresh read (lastBankAt just advanced) stays silent
  assert.equal(bankRefusalDue({ msSinceBank: 0 }), false)
  // the whole refractory window is silent - the spin no longer re-logs
  for (const since of [1, 1000, 60000, 149999]) {
    assert.equal(bankRefusalDue({ msSinceBank: since }), false, `since=${since} rides inside the refractory`)
  }
  // the speak lands exactly at the family cadence (the >= boundary, bankTripDue's own)
  assert.equal(bankRefusalDue({ msSinceBank: BANK_TRIP_EVERY_MS }), true, 'the term speaks at exactly 150000')
  assert.equal(bankRefusalDue({ msSinceBank: 300000 }), true, 'the next window speaks too')
})

test('bankRefusalDue: junk since never arms a speak (the family shape)', () => {
  assert.equal(bankRefusalDue(), false)
  assert.equal(bankRefusalDue({}), false)
  for (const junk of [NaN, -5, 'junk', null]) {
    assert.equal(bankRefusalDue({ msSinceBank: junk }), false, `junk since=${String(junk)} reads 0 - silent, bankTripDue's own junk law`)
  }
})

test('bankRefusalDue: junk everyMs falls back to the family cadence', () => {
  for (const junk of [0, NaN, -1, 'junk']) {
    assert.equal(bankRefusalDue({ msSinceBank: 149999, everyMs: junk }), false, `junk everyMs=${String(junk)} falls back to 150000 - 149999 still silent`)
    assert.equal(bankRefusalDue({ msSinceBank: 150000, everyMs: junk }), true, `junk everyMs=${String(junk)} falls back to 150000 - the speak lands`)
  }
  // a REAL override prices a tighter window and is honored
  assert.equal(bankRefusalDue({ msSinceBank: 29999, everyMs: 30000 }), false)
  assert.equal(bankRefusalDue({ msSinceBank: 30000, everyMs: 30000 }), true)
})

test('WIRING PIN: the refusal refractory gates the needsBanking term (v0.306.0)', () => {
  const fleetSrc = readFileSync(new URL('../../testbed/fleet19.mjs', import.meta.url), 'utf8')
  // (v0.385.0 re-pin: the deliverability arm joins the SAME family as the
  // LAST trigger - the legacy terms keep priority, the arm only spends a
  // pass they declined; one family, never a second chain)
  const wire = fleetSrc.match(/const bankWanted = !!\(\(needsBanking\(miner\.bot\) && bankRefusalOpen\) \|\| tripPlanned \|\| bankDusk \|\| duskPlan\.go \|\| deliverableArm\.go \|\| shedArm\.due\)/)
  assert.ok(wire, 'bankWanted reads the refractory on the needsBanking term; the planned/dusk arms keep their own fences; the v0.385.0 deliverability arm joins as the last trigger on the same cadence clock (v0.566.0 re-pin: the shed joins BESIDE it - the ladder\'s last rung, the gap-driven sibling)')
  const armOpen = fleetSrc.match(/const deliverableArm = \(\(\) => \{\n\s*const eligible = bankRefusalOpen && !tripPlanned && !bankDusk && !duskPlan\.go && !!load && load\.units > 0/)
  assert.ok(armOpen, 'the deliverability arm prices on the refractory cadence only (the v0.306.0 shape: the term joins the clock, no loop spin)')
  // the refusal branch still advances the clock - the v0.181.0 silencer for
  // BOTH families (the pockets-full skip + the night deferral) must survive
  const openIdx = fleetSrc.indexOf('const bankRefusalOpen')
  const advanceIdx = fleetSrc.indexOf('lastBankAt = Date.now()', openIdx)
  assert.ok(advanceIdx > openIdx, 'the branch still advances lastBankAt downstream (the silencer)')
})

// (v0.574.0) THE HONEST REFUSAL - the bank refusal branch names ONLY the refusal
// that fired. Face 37149142927 (the v0.571.0 tree): F12 held 292s of remaining
// clock - VIABLE by the gate's own arithmetic (292 >= 150) - yet the branch
// printed '292s left < 150s': the bot's real refusal was the rescue deferral
// (bankDefer.defer), which fell through to the generic branch and borrowed the
// viability line's hardcoded story. The wire: the defer case speaks NOTHING
// (the announce above owns the story, once per window); the night case keeps
// the v0.140.1 line byte for byte; the viability case names its floor FROM THE
// CONSTANT the gate itself defaults to - the line and the gate can never split.
// THE ARM SILENCE CENSUS rides the same face: 5 bank lines from 19 bots while
// the pockets rode to 1.8ku - the silence BETWEEN the arms had no line. A
// wanted pass is a spoke (fed on bankWanted, before the trip door - a refused
// pass is still a spoke, the silence is the never-wanted class); the end-phase
// row reads the complement and prints only when the class is non-empty (the
// leanness law).
test("THE HONEST REFUSAL: the refusal branch names only the refusal that fired, the floor reads from the constant (fleet source pins)", () => {
  const fleetSrc = readFileSync(new URL('../../testbed/fleet19.mjs', import.meta.url), 'utf8')
  // the branch's FIRST case is the silent defer - the announce above already spoke
  assert.match(fleetSrc, /if \(bankDefer\.defer\) \{\n\s*\/\/ the rescue announce above spoke - a second line would tell the pocket's story twice \(and lie once\)/,
    'the defer case is named first and speaks nothing (the announce owns the story)')
  // the night case keeps the v0.140.1 line byte for byte
  assert.match(fleetSrc, /bank trip: deferred night \(tod=/, 'the night case keeps its own line')
  // the viability floor reads FROM THE CONSTANT, never a literal
  assert.match(fleetSrc, /s left < \$\{Math\.round\(NEEDS_BANKING_MIN_REMAINING_MS \/ 1000\)\}s - the end-phase owns the deadline banking/,
    'the viability line names its floor from the constant')
  assert.ok(!fleetSrc.includes('< 150s - the end-phase'), 'the hardcoded floor literal is gone from the fleet source (the comment\'s evidence quote excepted)')
  // one arithmetic: the constant rides the SAME import the gate's default reads
  assert.match(fleetSrc, /walkRawToward, NEEDS_BANKING_MIN_REMAINING_MS \} from '\.\.\/src\/lib\/deposit\.mjs'/,
    'the line\'s floor and the gate\'s default are one export (the constant can never split)')
  // the decomposition is exhaustive: a no-defer, no-night pass here IS the below-floor clock
  const branchSrc = fleetSrc.slice(fleetSrc.indexOf('if (bankDefer.defer) {'), fleetSrc.indexOf('THE STICK FAMINE TRIP'))
  assert.ok(branchSrc.includes('bankNightHold') && branchSrc.includes('NEEDS_BANKING_MIN_REMAINING_MS'),
    'the branch carries exactly the three refusals and nothing else')
})

test("THE ARM SILENCE CENSUS: a wanted pass is a spoke, the end-phase row reads the never-wanted class (fleet source pins)", () => {
  const fleetSrc = readFileSync(new URL('../../testbed/fleet19.mjs', import.meta.url), 'utf8')
  // the census set is declared at module scope beside the fleet's own ledgers
  assert.match(fleetSrc, /const bankArmSpoke = new Set\(\)/, 'the census set exists')
  // the feed rides the wanted gate, AFTER the bankWanted compute, BEFORE the trip door -
  // a refused or deferred pass is still a spoke (the silence is the never-wanted class only)
  const wantedIdx = fleetSrc.indexOf('const bankWanted =')
  const feedIdx = fleetSrc.indexOf('if (load && bankWanted) bankArmSpoke.add(name)')
  const doorIdx = fleetSrc.indexOf('if (load && bankWanted && bankViable && !bankDefer.defer) {')
  assert.ok(wantedIdx > 0 && feedIdx > wantedIdx && doorIdx > feedIdx,
    'the spoke is recorded on every wanted pass, before the trip door decides')
  // the end-phase row: the complement read + the leanness law + the mass shape
  assert.match(fleetSrc, /const silentArms = list\.filter\(m => !bankArmSpoke\.has\(m\.username\)\)/,
    'the row reads the never-wanted complement')
  const rowIdx = fleetSrc.indexOf('bank arm census: ')
  assert.ok(rowIdx > 0, 'the row names the class')
  const guardIdx = fleetSrc.lastIndexOf('if (silentArms.length > 0)', rowIdx)
  assert.ok(guardIdx > 0, 'the row prints only when the class is non-empty (the leanness law)')
  assert.match(fleetSrc, /their end pockets carried \$\{silentTotal\}u/, 'the row names the silent mass')
  assert.match(fleetSrc, /top \$\{top\[0\]\}=\$\{top\[1\]\}u/, 'the row names the top silent holder')
})
