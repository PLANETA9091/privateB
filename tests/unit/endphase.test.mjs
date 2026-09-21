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
import { finalBankDelayMs, FINAL_BANK_STEP_MS, FINAL_BANK_CAP_MS, FINAL_BANK_REF_DIST } from '../../src/lib/endphase.mjs'
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

// ---------------------------------------------------------------------------
// (v0.44.0) DISTANCE-ORDERED SLOTS - the end-phase walk herd cure.
//
// Fleet 35591877408 (v0.42.1) evidence: 17 walkers started in boot order, the
// far walks activated into a saturated queue (path=6a/12q) and a CPU-starved
// runner - F6 timed out at 67000ms for 37 blocks (zero path_reset events: the
// path stayed valid, the walk just crawled), then the retry was budget-
// cancelled ('end-bank budget spent'). The same fleet's QUIET mid-run walks
// took 0-5s (F10 13b -> 0s, F11 54b -> 0s, F4 47b -> 5s). Ordering the slots
// by distance - farthest first, nearest last - gives the long walks the empty
// throttle and leaves the 0-5s near walks for the quiet tail.

test('distance slots: the farthest bot banks first, a bot at the yard last', () => {
  // at/beyond the reference distance = slot 0 (immediate start)
  assert.equal(finalBankDelayMs({ index: 18, yardDist: FINAL_BANK_REF_DIST }), 0)
  assert.equal(finalBankDelayMs({ index: 18, yardDist: 130 }), 0, 'beyond the reference clamps to slot 0')
  // standing at the yard = the LAST slot (the old cap): the walk is 0s anyway
  assert.equal(finalBankDelayMs({ index: 0, yardDist: 0 }), FINAL_BANK_CAP_MS)
})

test('distance slots: monotone - delay shrinks as the bot stands farther out', () => {
  // the real fleet's distance band (dispatch 35591877408 reporters), near -> far
  const near = finalBankDelayMs({ yardDist: 10 })
  const f10 = finalBankDelayMs({ yardDist: 13 })
  const f18 = finalBankDelayMs({ yardDist: 30 })
  const f6 = finalBankDelayMs({ yardDist: 37 })
  const f4 = finalBankDelayMs({ yardDist: 47 })
  const f11 = finalBankDelayMs({ yardDist: 54 })
  const f9 = finalBankDelayMs({ yardDist: 69 })
  assert.ok(near >= f10, 'nearest waits the longest')
  assert.ok(f10 > f18, 'strictly monotone toward the yard')
  assert.ok(f18 > f6)
  assert.ok(f6 > f4)
  assert.ok(f4 > f11)
  assert.ok(f11 > f9)
  assert.ok(f9 > 0, 'the far bot still starts before the cap window ends')
  // pinned slots (step 8s, cap 120s -> 15 slots): the evidence distances land
  // on distinct early/mid slots, the near cohort shares the quiet tail
  assert.equal(f9, 16000)
  assert.equal(f11, 40000)
  assert.equal(f6, 64000)
  assert.equal(f18, 72000)
  assert.equal(f10, 104000)
  assert.equal(near, 104000, '10b and 13b share a slot - a 2-bot cohort, not a herd')
})

test('distance slots: the window and the cap are unchanged - the kill margin maths stand', () => {
  // every distance the fleet can produce stays inside the same cap the hard
  // kill was sized against (stagger cap 120s + chain 150s < 420s margin)
  for (let d = 0; d <= 200; d += 5) {
    const ms = finalBankDelayMs({ yardDist: d })
    assert.ok(Number.isFinite(ms) && ms >= 0 && ms <= FINAL_BANK_CAP_MS, `d=${d}`)
  }
  // the whole 19-bot band (0..80 blocks) compresses into the SAME window the
  // index spread used - no end phase grows past the cap
  const band = Array.from({ length: 17 }, (_, i) => finalBankDelayMs({ yardDist: 5 + i * 5 }))
  assert.ok(Math.max(...band) <= FINAL_BANK_CAP_MS)
})

test('distance slots: junk distance falls back to the legacy index spread', () => {
  for (const junk of [undefined, null, NaN, -3, '40', Infinity]) {
    const d = finalBankDelayMs({ index: 5, yardDist: junk })
    assert.equal(d, 5 * FINAL_BANK_STEP_MS, String(junk))
  }
  // junk refDist keeps the default reference; a custom one rescales the band
  assert.equal(finalBankDelayMs({ yardDist: 40, refDist: NaN }), finalBankDelayMs({ yardDist: 40 }))
  assert.equal(finalBankDelayMs({ yardDist: 40, refDist: 80 }), finalBankDelayMs({ yardDist: 40 }))
  assert.equal(finalBankDelayMs({ yardDist: 20, refDist: 40 }), 64000, 'half the reference = the mid slot (round(7.5)=8 -> 8*8000)')
})

// ---- v0.49.0: the schedule prices the STAGGER WINDOW first ----
// Fleet 35605960761 F4: entry margin 381s, chain 150s, slice 231s, stagger
// +72s - the slice ignored the stagger sleep that runs BETWEEN entry and the
// climb, so the climb's wall clock overlapped the chain's reserve by exactly
// the stagger; after the (escalated) climb overran, the re-clamp handed the
// chain ~19s and every hop died 'budget exhausted (walk floor)' with the bot
// 17 blocks from the yard, pockets full.
test('finalBankSchedule: the stagger window is priced BEFORE the slice', () => {
  // the F4 arithmetic: 381s margin - 72s stagger - 150s chain = 159s slice
  // (the old maths gave 231s - 72s of it was a lie the wall clock collected)
  assert.deepEqual(
    finalBankSchedule({ entryMarginMs: 381000, chainBudgetMs: 150000, staggerDelayMs: 72000 }),
    { climbSliceMs: 159000, climbSkipped: false }
  )
  // a late entry whose margin barely covers stagger + chain: the climb skips
  // honestly instead of borrowing from the reserve
  assert.deepEqual(
    finalBankSchedule({ entryMarginMs: 210000, chainBudgetMs: 150000, staggerDelayMs: 72000 }),
    { climbSliceMs: 0, climbSkipped: true }
  )
  // no stagger = the legacy maths exactly (backward compatibility)
  assert.deepEqual(
    finalBankSchedule({ entryMarginMs: 390000, chainBudgetMs: 150000 }),
    finalBankSchedule({ entryMarginMs: 390000, chainBudgetMs: 150000, staggerDelayMs: 0 })
  )
  // junk stagger reads as 0
  assert.deepEqual(
    finalBankSchedule({ entryMarginMs: 390000, chainBudgetMs: 150000, staggerDelayMs: NaN }),
    { climbSliceMs: 240000, climbSkipped: false }
  )
  // the invariant that protects banked>0: slice + stagger + chain <= margin
  for (const [m, s, c] of [[381000, 72000, 150000], [390000, 120000, 280000], [100000, 8000, 150000]]) {
    const r = finalBankSchedule({ entryMarginMs: m, chainBudgetMs: c, staggerDelayMs: s })
    if (!r.climbSkipped) {
      assert.ok(r.climbSliceMs + s + c <= m, `slice ${r.climbSliceMs} + stagger ${s} + chain ${c} <= margin ${m}`)
    } else {
      assert.ok(m - s - c < CLIMB_MIN_SLICE_MS, 'a skipped climb really had no room')
    }
  }
})
