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
