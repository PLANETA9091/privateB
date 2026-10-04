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
import { finalBankSchedule, finalClimbNeedMs, climbRetryPlan, bankClimbRetry, CLIMB_MIN_SLICE_MS } from '../../src/lib/endphase.mjs'

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
test('finalBankSchedule: the climb gets what the chain does not need (the crumb faces restated v0.635.0 - the shape grew the borrowed field, the values stand)', () => {
  assert.equal(CLIMB_MIN_SLICE_MS, 15000, 'the minimum climb slice is pinned - the fleet skip line prints it')
  // the measured shape: 390s margin at deadline, a 433-block bot's chain wants
  // the 280s cap -> the climb slice is 110s (>= the 15s minimum, it may run)
  assert.deepEqual(finalBankSchedule({ entryMarginMs: 390000, chainBudgetMs: 280000 }), { climbSliceMs: 110000, climbSkipped: false, climbBorrowedMs: 0 })
  // a near-yard bot's chain (the 150s floor) leaves a fat climb slice
  assert.deepEqual(finalBankSchedule({ entryMarginMs: 390000, chainBudgetMs: 150000 }), { climbSliceMs: 240000, climbSkipped: false, climbBorrowedMs: 0 })
})

test('finalBankSchedule: the crumb borrow - the face\'s five zero-banks fund their climb (v0.635.0)', () => {
  // MEASURED (fleet 37222310370, the v0.632.0 face, 'banked crater decode:
  // 20.7%'): F2/F6/F15 (chain 300s, stagger 88/80/88s), F7 (chain 161s,
  // stagger 56s), F18 (chain 300s, stagger 40s) - the legacy subtraction
  // handed the final climb 0-1s, 'climb skipped' x5, and the chains burned
  // their FULL reserve on walk-to-chest timeouts from shaft mouths and read
  // banked=0 anyway. The old doctrine ('a doomed underground staircase is
  // worth less than the walk home') is refuted by the face: the walk home
  // from underground is worth ZERO. The climb's min slice now borrows from
  // the chain reserve whenever real wall clock exists beyond the stagger.
  // the F2-shaped face: margin 388s, stagger 88s, chain 300s -> raw 0 -> the
  // climb gets its 15s minimum, borrowed whole from the chain reserve
  assert.deepEqual(finalBankSchedule({ entryMarginMs: 388000, chainBudgetMs: 300000, staggerDelayMs: 88000 }), { climbSliceMs: 15000, climbSkipped: false, climbBorrowedMs: 15000 })
  // the F6-shaped face: the legacy read 'slice 1s < min' - now funded
  assert.deepEqual(finalBankSchedule({ entryMarginMs: 381000, chainBudgetMs: 300000, staggerDelayMs: 80000 }), { climbSliceMs: 15000, climbSkipped: false, climbBorrowedMs: 14000 })
  // the F7-shaped face: a thinner chain (161s) - the raw crumbs (0s) still borrow
  assert.deepEqual(finalBankSchedule({ entryMarginMs: 217000, chainBudgetMs: 161000, staggerDelayMs: 56000 }), { climbSliceMs: 15000, climbSkipped: false, climbBorrowedMs: 15000 })
  // the partial-crumb face: raw 12s just under the min - the borrow tops up 3s
  assert.deepEqual(finalBankSchedule({ entryMarginMs: 20000, chainBudgetMs: 8000 }), { climbSliceMs: 15000, climbSkipped: false, climbBorrowedMs: 3000 })
  // the crumb face that already funds the climb borrows NOTHING (the legacy byte)
  assert.deepEqual(finalBankSchedule({ entryMarginMs: 30000, chainBudgetMs: 8000 }), { climbSliceMs: 22000, climbSkipped: false, climbBorrowedMs: 0 })
})

// ---------------------------------------------------------------------------
// (v0.638.0) THE NEED-PRICED CLIMB - min != need. The v0.636.0 face (fleet
// 37228589272, the crumb borrow's first field flight) moved the failure class
// INSIDE the funded slice: F8 'final climb: the yard stands 21 levels up over
// 20b lateral' then 'failed - timeout (fenced at 34s - the chain keeps its
// reserve)' - the borrow funds the FLAT min while the yard's wall has the
// v0.294.0 measured price (4.2s/level, the same number the v0.604.0
// quarry-ascent per-level law already prices). The need prices the slice, the
// borrow funds the need, and a junk/absent need reads the v0.635.0 laws byte
// for byte.
test('finalClimbNeedMs: the yard wall prices at the v0.294.0 per-level law', () => {
  // F8's own face: 21 levels -> 21 * 4200 = 88.2s (the fence that starved it read 34s)
  assert.equal(finalClimbNeedMs({ dy: 21 }), 88200)
  // the doom threshold (VERTICAL_DOOM_MIN_DY = 20) prices 84s
  assert.equal(finalClimbNeedMs({ dy: 20 }), 84000)
  // a fractional dy rounds honestly
  assert.equal(finalClimbNeedMs({ dy: 21.4 }), 88200, 'round(21.4) = 21')
  assert.equal(finalClimbNeedMs({ dy: 21.5 }), 92400, 'round(21.5) = 22')
  // the min floor: a shallow wall never prices below the guaranteed slice
  assert.equal(finalClimbNeedMs({ dy: 1 }), CLIMB_MIN_SLICE_MS)
  // junk laws: no wall, no need (the caller keeps the legacy min laws)
  for (const junk of [null, undefined, NaN, 0, -3, '21', Infinity]) {
    assert.equal(finalClimbNeedMs({ dy: junk }), null, String(junk))
  }
})

test('finalBankSchedule: the borrow funds the NEED, not the min (v0.638.0)', () => {
  // the F8-shaped face: raw 34s crumbs (the clamp's 300s chain ate the rest),
  // the yard 21 levels up (need 88.2s) -> the slice prices the wall, the
  // borrow tops up 54.2s from the chain reserve
  assert.deepEqual(
    finalBankSchedule({ entryMarginMs: 334000, chainBudgetMs: 300000, climbNeedMs: 88200 }),
    { climbSliceMs: 88200, climbSkipped: false, climbBorrowedMs: 54200 }
  )
  // the crumbs already fund the need: the legacy byte (borrow 0, the full raw)
  assert.deepEqual(
    finalBankSchedule({ entryMarginMs: 390000, chainBudgetMs: 280000, climbNeedMs: 88200 }),
    { climbSliceMs: 110000, climbSkipped: false, climbBorrowedMs: 0 }
  )
  // the best-shot branch: the room cannot fund the full need but can fund the
  // min - the whole room rides (the underground chain bought ZERO every face;
  // the caller's finalBudget re-clamp owns the wall truth)
  assert.deepEqual(
    finalBankSchedule({ entryMarginMs: 50000, chainBudgetMs: 30000, climbNeedMs: 88200 }),
    { climbSliceMs: 50000, climbSkipped: false, climbBorrowedMs: 30000 }
  )
  // the stagger prices first in the need form too (the v0.49.0 law holds)
  assert.deepEqual(
    finalBankSchedule({ entryMarginMs: 388000, chainBudgetMs: 300000, staggerDelayMs: 88000, climbNeedMs: 88200 }),
    { climbSliceMs: 88200, climbSkipped: false, climbBorrowedMs: 88200 }
  )
})

test('finalBankSchedule: a junk or absent need reads the v0.635.0 laws byte for byte', () => {
  // the absent need: the v0.635.0 face re-reads EXACTLY (the F2-shaped face)
  assert.deepEqual(
    finalBankSchedule({ entryMarginMs: 388000, chainBudgetMs: 300000, staggerDelayMs: 88000 }),
    { climbSliceMs: 15000, climbSkipped: false, climbBorrowedMs: 15000 }
  )
  // a junk need: the same byte as absent, every flavor
  for (const junk of [null, undefined, NaN, 0, -88200, '88200', Infinity]) {
    assert.deepEqual(
      finalBankSchedule({ entryMarginMs: 388000, chainBudgetMs: 300000, staggerDelayMs: 88000, climbNeedMs: junk }),
      { climbSliceMs: 15000, climbSkipped: false, climbBorrowedMs: 15000 },
      String(junk)
    )
  }
  // a need below the min floors at the min: the v0.635.0 byte
  assert.deepEqual(
    finalBankSchedule({ entryMarginMs: 388000, chainBudgetMs: 300000, staggerDelayMs: 88000, climbNeedMs: 5000 }),
    { climbSliceMs: 15000, climbSkipped: false, climbBorrowedMs: 15000 }
  )
  // the thin-margin law stands in the need form: no room, no borrow, the skip
  assert.deepEqual(
    finalBankSchedule({ entryMarginMs: 10000, chainBudgetMs: 20000, climbNeedMs: 88200 }),
    { climbSliceMs: 0, climbSkipped: true, climbBorrowedMs: 0 }
  )
  // the funded invariants in the need form: the slice never exceeds the room;
  // the funded pair respects it
  const r = finalBankSchedule({ entryMarginMs: 334000, chainBudgetMs: 300000, climbNeedMs: 88200 })
  assert.ok(r.climbSliceMs <= 334000, 'the slice never exceeds the room')
  assert.ok(r.climbSliceMs + (300000 - r.climbBorrowedMs) <= 334000, 'the funded pair respects the room')
})

test('finalBankSchedule: no room, no borrow - the thin-margin law stands', () => {
  // the room itself below the minimum: a 15s staircase cannot fit, the legacy
  // skip rides (the borrow never invents wall clock the margin does not have)
  assert.deepEqual(finalBankSchedule({ entryMarginMs: 10000, chainBudgetMs: 20000 }), { climbSliceMs: 0, climbSkipped: true, climbBorrowedMs: 0 })
  // the stagger overdrawing the margin: same law
  assert.deepEqual(finalBankSchedule({ entryMarginMs: 30000, chainBudgetMs: 8000, staggerDelayMs: 25000 }), { climbSliceMs: 0, climbSkipped: true, climbBorrowedMs: 0 })
  // the room exactly the minimum funds the climb at the exact minimum
  assert.deepEqual(finalBankSchedule({ entryMarginMs: 15000, chainBudgetMs: 280000 }), { climbSliceMs: 15000, climbSkipped: false, climbBorrowedMs: 15000 })
})

test('finalBankSchedule: junk margins collapse to zero, junk chain gives the climb everything (restated v0.635.0)', () => {
  assert.deepEqual(finalBankSchedule({}), { climbSliceMs: 0, climbSkipped: true, climbBorrowedMs: 0 })
  assert.deepEqual(finalBankSchedule({ entryMarginMs: -5, chainBudgetMs: NaN }), { climbSliceMs: 0, climbSkipped: true, climbBorrowedMs: 0 })
  assert.deepEqual(finalBankSchedule({ entryMarginMs: 100000, chainBudgetMs: NaN }), { climbSliceMs: 100000, climbSkipped: false, climbBorrowedMs: 0 })
  assert.equal(finalBankSchedule({ entryMarginMs: NaN, chainBudgetMs: 0 }).climbSkipped, true)
  // the wall-clock invariant, FUNDED form: climbSlice + (chain - borrow) <=
  // entryMargin - stagger (the chain's UNFUNDED number may overlap the slice;
  // the caller's own finalBudget re-clamp owns that wall truth - the v0.49.0
  // overrun class cannot return through the borrow)
  const s = finalBankSchedule({ entryMarginMs: 50000, chainBudgetMs: 45000 })
  assert.equal(s.climbBorrowedMs, 10000, 'raw 5s borrows 10s to fund the 15s minimum')
  assert.ok(s.climbSliceMs + (45000 - s.climbBorrowedMs) <= 50000, 'the funded pair respects the margin')
  const t = finalBankSchedule({ entryMarginMs: 388000, chainBudgetMs: 300000, staggerDelayMs: 88000 })
  assert.ok(t.climbSliceMs + (300000 - t.climbBorrowedMs) <= 388000 - 88000, 'the funded pair respects the margin minus the stagger')
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
    { climbSliceMs: 159000, climbSkipped: false, climbBorrowedMs: 0 }
  )
  // a late entry whose margin barely covers stagger + chain (raw 0s): the
  // v0.635.0 crumb borrow funds the climb from the reserve - the face's five
  // zero-banks priced the old skip as 300s of doomed walks and banked=0; the
  // chain keeps the room the climb did not take (138s - 15s = 123s of wall)
  assert.deepEqual(
    finalBankSchedule({ entryMarginMs: 210000, chainBudgetMs: 150000, staggerDelayMs: 72000 }),
    { climbSliceMs: 15000, climbSkipped: false, climbBorrowedMs: 15000 }
  )
  // no stagger = the legacy maths exactly (backward compatibility)
  assert.deepEqual(
    finalBankSchedule({ entryMarginMs: 390000, chainBudgetMs: 150000 }),
    finalBankSchedule({ entryMarginMs: 390000, chainBudgetMs: 150000, staggerDelayMs: 0 })
  )
  // junk stagger reads as 0
  assert.deepEqual(
    finalBankSchedule({ entryMarginMs: 390000, chainBudgetMs: 150000, staggerDelayMs: NaN }),
    { climbSliceMs: 240000, climbSkipped: false, climbBorrowedMs: 0 }
  )
  // the invariants that protect banked>0 (v0.635.0 funded form): the slice never
  // exceeds the room (the climb never invents wall clock); a funded climb gets
  // at least the minimum; when the chain fits the room the funded pair (slice +
  // chain - borrow) respects it - the overdraw class (the flow-price clamp's
  // own shape) rides the caller's finalBudget re-clamp, the wall truth it has
  // always owned
  for (const [m, s, c] of [[381000, 72000, 150000], [390000, 120000, 280000], [100000, 8000, 150000]]) {
    const r = finalBankSchedule({ entryMarginMs: m, chainBudgetMs: c, staggerDelayMs: s })
    const room = Math.max(0, m - s)
    assert.ok(r.climbSliceMs <= room, `slice ${r.climbSliceMs} never exceeds the room ${room}`)
    if (!r.climbSkipped) {
      assert.ok(r.climbSliceMs >= CLIMB_MIN_SLICE_MS, 'a funded climb gets at least the minimum')
      if (c <= room) assert.ok(r.climbSliceMs + (c - r.climbBorrowedMs) <= room, 'the funded pair respects the room')
    } else {
      assert.ok(room - c < CLIMB_MIN_SLICE_MS, 'a skipped climb really had no room')
    }
  }
})

// ---- v0.50.0: the final-climb retry ----
// Fleet 35630279913 (v0.49.0): 13 fast 'stalled' climbs, then 13 underground
// chains burned their whole 150s reserve on pre-deposit walks to chests 27
// blocks away AT THE YARD SURFACE - a shaft-bottom bot cannot walk there. The
// escalation ladder (climbEntry: 2x budgets + rotated bearing) is the built-in
// cure; the retry policy gates it to the slice the failed attempt left.
test('climbRetryPlan: stalled/timeout retry inside the remaining slice', () => {
  assert.deepEqual(climbRetryPlan({ attempts: 1, reason: 'stalled', sliceLeftMs: 120000 }),
    { retry: true, maxMs: 120000, why: 'escalated retry after stalled' })
  assert.equal(climbRetryPlan({ attempts: 1, reason: 'timeout (fenced at 90s - the chain keeps its reserve)', sliceLeftMs: 60000 }).retry, true,
    'the fenced timeout retries - the escalated attempt rotates the bearing')
  assert.equal(climbRetryPlan({ attempts: 1, reason: 'stalled', sliceLeftMs: 120000 }).maxMs, 120000,
    'the retry fence is the slice the failed attempt left')
})

test('climbRetryPlan: the classes that must never retry', () => {
  assert.equal(climbRetryPlan({ attempts: 1, reason: 'exhausted', sliceLeftMs: 120000 }).retry, false,
    'the ledger cooldown would refuse the retry instantly - burn nothing')
  assert.equal(climbRetryPlan({ attempts: 1, reason: 'stopped', sliceLeftMs: 120000 }).retry, false,
    'shouldStop already fired - no wall clock left')
  assert.equal(climbRetryPlan({ attempts: 2, reason: 'stalled', sliceLeftMs: 120000 }).retry, false,
    'the attempt cap')
  assert.equal(climbRetryPlan({ attempts: 5, reason: 'stalled', sliceLeftMs: 120000 }).retry, false)
  assert.equal(climbRetryPlan({ attempts: 1, reason: 'stalled', sliceLeftMs: 5000 }).retry, false,
    'a 5s slice cannot usefully start a second climb')
  assert.equal(climbRetryPlan({ attempts: 1, reason: 'stalled', sliceLeftMs: NaN }).retry, false, 'junk slice refuses')
  assert.equal(climbRetryPlan({ attempts: 1, reason: 'no entity', sliceLeftMs: 120000 }).retry, false,
    'unknown reasons stay honest: no blind retries')
})

test('climbRetryPlan: the fence arithmetic keeps the chain reserve intact', () => {
  // the invariant: attempt1 real time + retry fence <= the granted slice,
  // so both attempts together can never starve the chain the way the
  // un-fenced escalation did (F4)
  const slice = 159000 // the v0.49.0 F4-arithmetic slice
  const attempt1Ms = 90000
  const plan = climbRetryPlan({ attempts: 1, reason: 'stalled', sliceLeftMs: slice - attempt1Ms })
  if (plan.retry) assert.ok(attempt1Ms + plan.maxMs <= slice, 'the total climb time stays inside the slice')
  // a fast fail (36s stalls, the measured class) leaves the retry nearly the whole slice
  const fast = climbRetryPlan({ attempts: 1, reason: 'stalled', sliceLeftMs: slice - 36000 })
  assert.equal(fast.retry, true)
  assert.equal(fast.maxMs, slice - 36000)
})

// ---- v0.154.0: THE BANK CLIMB RETRY (the mid-run trip's climb decision) ----
// run108 + run84a fleet logs: 'climb out (bank): failed - stalled' x16 +
// 'timeout' x7, every one a dead bank trip whose pockets rode to the next
// cadence window (F3 in run85: 3 of 4 trips dead at the climb, ~20x
// fleet-wide). The escalation ladder (a failed call records stage+1, the
// next call inherits 2x budgets + a rotated bearing) is the built-in cure -
// the same mechanism the final bank's retry has used since v0.50.0. The
// fence is the TRIP's remaining chain clock; the single-shot legacy stays
// for callers that pass none.
test('bankClimbRetry: the stall shape arms the retry inside the chain clock', () => {
  // the run108 shape: a PILLAR_MAX_MS (90s) stall inside a flat 120s trip -
  // 30s of chain left, above the 20s floor: retry, fenced to those 30s
  const r = bankClimbRetry({ chainLeftMs: 120000, spentMs: 90000, reason: 'stalled' })
  assert.equal(r.retry, true)
  assert.equal(r.maxMs, 30000, 'the fence is the slice the failed attempt left')
  assert.match(r.why, /fenced to 30s of the 30s the chain has left/)
  // the timeout shape: a fast fence inside a dist-scaled trip - the pillar
  // cap (90s) bounds the retry, not the chain
  const fast = bankClimbRetry({ chainLeftMs: 180000, spentMs: 60000, reason: 'timeout (fenced at 45s)' })
  assert.equal(fast.retry, true)
  assert.equal(fast.maxMs, 90000, 'the historical PILLAR_MAX_MS caps the fence')
  assert.match(fast.why, /of the 120s the chain has left/)
})

test('bankClimbRetry: the classes that must never retry (the owner lanes)', () => {
  // 'rescue owns the bot' x23 in the local logs - a live rescue owns the
  // controls; re-issuing the climb under it re-dives the bot (the v0.70.0 gate)
  assert.equal(bankClimbRetry({ chainLeftMs: 120000, spentMs: 90000, reason: 'rescue owns the bot' }).retry, false)
  // 'low-o2' - the wet escape yielded at the air floor; the rescue lane owns the air
  assert.equal(bankClimbRetry({ chainLeftMs: 120000, spentMs: 90000, reason: 'low-o2' }).retry, false)
  // the ledger cooldown would refuse the retry instantly
  assert.equal(bankClimbRetry({ chainLeftMs: 120000, spentMs: 90000, reason: 'exhausted' }).retry, false)
  // 'stopped' - shouldStop already fired
  assert.equal(bankClimbRetry({ chainLeftMs: 120000, spentMs: 90000, reason: 'stopped' }).retry, false)
  assert.equal(bankClimbRetry({ chainLeftMs: 120000, spentMs: 90000, reason: 'no entity' }).retry, false,
    'unknown reasons stay honest')
})

test('bankClimbRetry: the thin chain skips the retry, the clock bounds everything', () => {
  // 85s of a flat 100s trip spent - 15s left < the 20s floor: the retry would
  // starve the deposit walk exactly like the run65 un-fenced shape
  const thin = bankClimbRetry({ chainLeftMs: 100000, spentMs: 85000, reason: 'stalled' })
  assert.equal(thin.retry, false)
  assert.match(thin.why, /slice left 15s < min 20s/)
  // the invariant: attempt1 real time + the retry fence never exceed the chain
  const chain = 150000
  const spent = 90000
  const r = bankClimbRetry({ chainLeftMs: chain, spentMs: spent, reason: 'stalled' })
  if (r.retry) assert.ok(spent + r.maxMs <= chain, 'the total climb time stays inside the trip chain')
})

test('bankClimbRetry: no chain clock = the single-shot legacy stays byte-identical', () => {
  // the 'trip' and 'pre-position' call sites pass nothing - no retry, and
  // the harness skips the block entirely (no new log lines, no behavior shift)
  for (const junk of [undefined, null, 0, -5, NaN, '120000']) {
    const r = bankClimbRetry({ chainLeftMs: junk, spentMs: 90000, reason: 'stalled' })
    assert.equal(r.retry, false, `junk chain clock (${junk}) refuses`)
    assert.match(r.why, /no chain clock \(the single-shot legacy stays\)/)
  }
  // junk spent reads as 0 - the full chain is the slice
  const r = bankClimbRetry({ chainLeftMs: 120000, spentMs: NaN, reason: 'stalled' })
  assert.equal(r.retry, true)
  assert.equal(r.maxMs, 90000, '120s of chain, no spend recorded - the pillar cap bounds it')
  // the attempt cap passes through from climbRetryPlan
  assert.equal(bankClimbRetry({ chainLeftMs: 120000, spentMs: 1000, reason: 'stalled', attempts: 2 }).retry, false)
})

// (v0.296.0) THE FINAL CLIMB PATIENCE - the final climb waits out a live water
// rescue before burning an attempt. MEASURED (face 36499444700, the combined
// v0.295.0 tree's first field flight): 8 final climbs failed ('rescue owns the
// bot' x2, 'low-o2' x1, 'stalled' x3, 'timeout' x2) and the 8 'still
// underground' verdicts ate the end-phase pockets - banked=805 was the FIRST
// delivery since the deep era began, ~1672u still rode the pockets at t-0.
// The wet band (the water table y=60-62 under the y=76 yard) owns the columns
// the final climb must pass; a rescue held at climb start makes the attempt a
// BURN (the owner gate refuses at entry, the ownership class never retries -
// the v0.50.0 policy). The v0.295.0 arm gate's doctrine reaches the final
// phase: BOTH attempts wait the bounded measured window first.
import { FINAL_CLIMB_RESCUE_WAIT_MS } from '../../src/lib/endphase.mjs'
import { readFileSync } from 'node:fs'

test('FINAL_CLIMB_RESCUE_WAIT_MS: the measured window + settle margin (the wet machinery owns ~25s)', () => {
  assert.equal(FINAL_CLIMB_RESCUE_WAIT_MS, 30000)
  assert.ok(FINAL_CLIMB_RESCUE_WAIT_MS > 25000, 'above the measured ~25s rescue window (the wait clears an honest rescue)')
  assert.ok(FINAL_CLIMB_RESCUE_WAIT_MS < CLIMB_MIN_SLICE_MS * 3, 'far below the climb floor x3 (the wait can never eat the slice economy)')
})

test('REGRESSION PIN: both final climb attempts wait out the rescue before burning (the dead-wire class)', () => {
  const src = readFileSync(new URL('../../testbed/fleet19.mjs', import.meta.url), 'utf8')
  // attempt 1: the wait rides BEFORE the fence clock (the slice starts post-wait)
  const wait1 = src.indexOf('if (miner.bot?._waterRescue === true) {')
  // (v0.638.0) the fence reads the slice the schedule granted - the
  // need-priced wall the chain lent; the historical PILLAR cap left the FINAL
  // fence (it re-starved the need at dy >= 22), mid-run climbs keep theirs
  const fence1 = src.indexOf('const climbFenceMs = schedule.climbSliceMs')
  assert.ok(wait1 > -1 && fence1 > wait1, 'attempt 1 waits before its fence clock starts')
  assert.ok(fence1 > -1, 'the final fence reads the granted slice (the v0.638.0 need-priced wall)')
  // attempt 2 (the retry): the same patience rides
  const wait2 = src.indexOf('if (miner.bot?._waterRescue === true) {', wait1 + 1)
  const retryFence = src.indexOf('const retryFenceAt = Date.now() + retryPlan.maxMs')
  assert.ok(wait2 > -1 && retryFence > wait2, 'the retry waits before its fence clock starts')
  assert.ok(src.split('waitForWaterRescueClear(miner.bot, { maxMs: FINAL_CLIMB_RESCUE_WAIT_MS })').length - 1 === 2, 'both attempt sites ride the SAME bounded constant')
  // the strict ownership read (=== true - the owner gate's own strictness, junk never waits)
  assert.match(src, /miner\.bot\?\._waterRescue === true/, 'the LIVE ownership flag reads strict')
  // the class names itself in the existing 'final climb' filter key
  assert.ok(src.includes('waited out the wet rescue ('), 'the waited-out form names itself')
  assert.ok(src.includes('the attempt proceeds (the owner gate rules)'), 'the held-past form names the honest fallthrough')
  // the constant is imported (the import regex carries it)
  assert.match(src, /FINAL_CLIMB_RESCUE_WAIT_MS\s*[,}]/, 'the constant rides the endphase import')
})

// ---------------------------------------------------------------------------
// (v0.334.0) THE PRICED CLOCK - the default chain budget obeys the gap row.
// Face 36660134341 (the eight-instrument face's first leg) read:
//   'bank budget gap: 164s needed, 150s budgeted - 14s short at 6.4u/s'
// The flow cures (2.2 -> 6.4u/s) made the pocket CLEARABLE - the clock, not
// the walkers, became the binding constraint. The cure is priced: 180s.
import { END_BANK_BUDGET_MS, END_BANK_BUDGET_CAP_MS, endBankBudgetMs } from '../../src/lib/endphase.mjs'

test('END_BANK_BUDGET_MS: the priced clock covers the face 36660134341 need with margin', () => {
  assert.equal(END_BANK_BUDGET_MS, 248000, 'v0.339.0: the third face\'s gap row (36679076372) priced the need at 244s and the clock rides it - the collision-era one-truth note stands (the integer was cron30\'s at 0.334.0, cron38 extends it at 0.339.0 with the same need+4s law)')
  assert.ok(END_BANK_BUDGET_MS > 164000, 'the face\'s measured need (164s) must fit inside the clock')
})

test('END_BANK_BUDGET_MS: the stagger arithmetic still lands inside the hard-kill margin', () => {
  // the sizing law (v0.27.0): worst chain end = stagger cap 120s + budget
  assert.ok(120000 + END_BANK_BUDGET_MS < HARD_KILL_MARGIN_MS,
    'deadline + 120s + 248s = 368s < the 420s hard-kill margin - natural finish preserved (v0.339.0 re-proves the law at the new clock)')
  assert.ok(END_BANK_BUDGET_MS <= END_BANK_BUDGET_CAP_MS,
    'the default must ride under the distance-scaled cap (280s)')
})

test('endBankBudgetMs: the default resolution rides the priced constant', () => {
  assert.equal(endBankBudgetMs({}), 248000)
  assert.equal(endBankBudgetMs({ env: '' }), 248000)
  assert.equal(endBankBudgetMs({ env: 'junk' }), 248000)
  assert.equal(endBankBudgetMs({ env: '200000' }), 200000, 'the env override still wins')
})
