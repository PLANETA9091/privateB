// The FINAL-BANK STAGGER (v0.21.1) - end-of-run slot maths.
//
// Fleet #131 evidence: all 19 bots entered climbOut + the yard walk in the
// same second at the deadline - 14x 'final bank: 0' at t-0, the path throttle
// saturated at 6a/10q and every walk budget burned in the queue. The stagger
// spreads the final-bank starts by bot index. These tests pin the slot math:
// deterministic spacing, the cap that folds the tail into one bounded herd,
// and junk tolerance matching the rest of the lib.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { finalBankDelayMs, FINAL_BANK_STEP_MS, FINAL_BANK_CAP_MS } from '../../src/lib/endphase.mjs'
import { finalBankSchedule, CLIMB_MIN_SLICE_MS } from '../../src/lib/endphase.mjs'

test('slots: deterministic index spacing, bot 0 banks immediately', () => {
  assert.equal(finalBankDelayMs({ index: 0 }), 0)
  assert.equal(finalBankDelayMs({ index: 1 }), FINAL_BANK_STEP_MS)
  assert.equal(finalBankDelayMs({ index: 2 }), 2 * FINAL_BANK_STEP_MS)
  assert.equal(finalBankDelayMs({ index: 5 }), 5 * FINAL_BANK_STEP_MS)
  // slot 14 is the last pure-spread slot; from slot 15 the raw ladder
  // (15x8s = 120s) touches the cap and the tail folds onto it
  assert.equal(finalBankDelayMs({ index: 14 }), 14 * FINAL_BANK_STEP_MS)
  assert.equal(finalBankDelayMs({ index: 18 }), FINAL_BANK_CAP_MS)
  // below-default step moves the cap boundary out: 30 slots fit before 120s
  assert.equal(finalBankDelayMs({ index: 18, stepMs: 4000 }), 18 * 4000)
})

test('cap: the tail folds onto the ceiling - a bounded herd, not an unbounded tail', () => {
  // slots 0..15 spread out; everything past 15 shares the cap
  const slots = [0, 3, 8, 14, 15, 16, 17, 18].map(i => finalBankDelayMs({ index: i }))
  assert.equal(slots[0], 0)
  assert.ok(slots[3] < slots[4], 'monotone up to the cap boundary')
  for (const s of slots.slice(4)) {
    assert.ok(s <= FINAL_BANK_CAP_MS, `slot ${s} respects the cap`)
  }
  // boundary maths: slot 15 = the last uncapped slot, 16+ = the cap
  assert.equal(finalBankDelayMs({ index: 15 }), FINAL_BANK_CAP_MS)
  assert.equal(finalBankDelayMs({ index: 16 }), FINAL_BANK_CAP_MS)
  assert.equal(finalBankDelayMs({ index: 18 }), FINAL_BANK_CAP_MS)
})

test('junk: bad index/budgets degrade to sane defaults, never NaN or a negative sleep', () => {
  for (const junk of [undefined, null, -7, NaN, '3', 2.9]) {
    const d = finalBankDelayMs({ index: junk })
    assert.ok(Number.isFinite(d) && d >= 0, String(junk))
  }
  // a fractional index floors (slot 2.9 behaves as slot 2)
  assert.equal(finalBankDelayMs({ index: 2.9 }), 2 * FINAL_BANK_STEP_MS)
  // junk budgets keep the defaults; a zero cap is honored (immediate phase)
  assert.equal(finalBankDelayMs({ index: 4, stepMs: NaN }), 4 * FINAL_BANK_STEP_MS)
  assert.equal(finalBankDelayMs({ index: 4, stepMs: -1 }), 4 * FINAL_BANK_STEP_MS)
  assert.equal(finalBankDelayMs({ index: 18, capMs: 0 }), 0)
  // a below-default step scales the whole ladder down
  assert.equal(finalBankDelayMs({ index: 3, stepMs: 1000 }), 3000)
})

test('shape: the whole 19-bot schedule stays inside the cap and is strictly below it for the spread', () => {
  // the fleet contract: no bot waits past the cap, and the spread portion is
  // dense enough (8s) that at most ~7 walks overlap a 60s walk budget
  const sched = Array.from({ length: 19 }, (_, i) => finalBankDelayMs({ index: i }))
  assert.equal(sched[0], 0)
  assert.ok(sched.every(d => d <= FINAL_BANK_CAP_MS))
  const distinct = new Set(sched).size
  assert.ok(distinct >= 16, `the cap must not collapse the schedule (${distinct} distinct slots)`)
})

// ------------------------------------------------------ HARD KILL (v0.26.0)
// Dispatch 35541442371: the whole end-phase chain stalled and the process
// never exited - the CI job was cancelled before any artifact upload. The
// kill timer must fire at runSeconds + margin, junk-tolerantly.
import { hardKillDelayMs, HARD_KILL_MARGIN_MS } from '../../src/lib/endphase.mjs'

test('hardKillDelayMs: 600s run kills at deadline + margin', () => {
  assert.equal(hardKillDelayMs({ runSeconds: 600 }), 600000 + HARD_KILL_MARGIN_MS)
})

test('hardKillDelayMs: honours custom run lengths and a zero margin', () => {
  assert.equal(hardKillDelayMs({ runSeconds: 300, marginMs: 0 }), 300000)
  assert.equal(hardKillDelayMs({ runSeconds: 900, marginMs: 1000 }), 901000)
})

test('hardKillDelayMs: junk inputs fall back to the fleet defaults', () => {
  assert.equal(hardKillDelayMs({}), 600000 + HARD_KILL_MARGIN_MS)
  assert.equal(hardKillDelayMs({ runSeconds: NaN }), 600000 + HARD_KILL_MARGIN_MS)
  assert.equal(hardKillDelayMs({ runSeconds: -5, marginMs: NaN }), 600000 + HARD_KILL_MARGIN_MS)
  assert.equal(hardKillDelayMs({ runSeconds: 600, marginMs: -1 }), 600000 + HARD_KILL_MARGIN_MS)
})

// ---------------------------------------------------------------------------
// (v0.41.0) END-PHASE MARGIN SCHEDULING - the chain is priced BEFORE the climb.
// Fleet 35580596054: F1's climb stalled ~85s, then the chain - priced AFTER it -
// burned ~195s more on doomed wilderness hops. The chain's needs now RESERVE
// their slice at entry; the climb gets only the remainder.
test('finalBankSchedule: the climb gets what the chain does not need', () => {
  assert.equal(CLIMB_MIN_SLICE_MS, 15000, 'the minimum climb slice is pinned - the fleet skip line prints it')
  // the measured shape: 390s margin at deadline, a 433-block bot's chain wants
  // the 280s cap -> the climb slice is 110s (>= the 15s minimum, it may run)
  assert.deepEqual(finalBankSchedule({ entryMarginMs: 390000, chainBudgetMs: 280000 }), { climbSliceMs: 110000, climbSkipped: false })
  // a near-yard bot's chain (the 150s floor) leaves a fat climb slice
  assert.deepEqual(finalBankSchedule({ entryMarginMs: 390000, chainBudgetMs: 150000 }), { climbSliceMs: 240000, climbSkipped: false })
})

test('finalBankSchedule: a thin margin skips the climb, the chain keeps the clock', () => {
  // margin ~= chain: no climb slice left - a doomed underground staircase is
  // worth less than the walk home
  assert.deepEqual(finalBankSchedule({ entryMarginMs: 20000, chainBudgetMs: 20000 }), { climbSliceMs: 0, climbSkipped: true })
  // below the minimum slice the climb is skipped too (it cannot usefully start)
  assert.deepEqual(finalBankSchedule({ entryMarginMs: 30000, chainBudgetMs: 280000 }), { climbSliceMs: 0, climbSkipped: true })
  assert.equal(finalBankSchedule({ entryMarginMs: 20000, chainBudgetMs: 8000 }).climbSkipped, true, '12s slice < the 15s minimum')
  assert.equal(finalBankSchedule({ entryMarginMs: 30000, chainBudgetMs: 8000 }).climbSkipped, false, '22s slice >= the minimum - the climb may run')
})

test('finalBankSchedule: junk margins collapse to zero, junk chain gives the climb everything', () => {
  assert.deepEqual(finalBankSchedule({}), { climbSliceMs: 0, climbSkipped: true })
  assert.deepEqual(finalBankSchedule({ entryMarginMs: -5, chainBudgetMs: NaN }), { climbSliceMs: 0, climbSkipped: true })
  assert.deepEqual(finalBankSchedule({ entryMarginMs: 100000, chainBudgetMs: NaN }), { climbSliceMs: 100000, climbSkipped: false })
  assert.equal(finalBankSchedule({ entryMarginMs: NaN, chainBudgetMs: 0 }).climbSkipped, true)
  // the wall-clock invariant: climbSlice + chainBudget <= entryMargin (up to junk)
  const s = finalBankSchedule({ entryMarginMs: 50000, chainBudgetMs: 45000 })
  assert.ok(s.climbSliceMs + 45000 <= 50000)
})
