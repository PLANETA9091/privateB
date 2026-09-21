// PRE-POSITION (v0.36.0) - the walk home starts BEFORE the deadline.
//
// Two dispatches of evidence (35560497949 + 35562867668): bots dig 100-300
// blocks out, and the end phase burned 13-14x 'final bank: 0 (budget
// exhausted)' per run because its budget had to pay climb + smelt + the WHOLE
// walk back. The cure has two pinned halves here: the pure gate that stops
// the digging inside the last window (prePositionDue, endphase.mjs) and the
// yard-walk budget that finally scales with the distance instead of the flat
// 120s pin (yardWalkBudgetMs, deposit.mjs).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { prePositionDue, PRE_POSITION_WINDOW_MS, PRE_POSITION_MIN_DIST, END_BANK_BUDGET_CAP_MS, HARD_KILL_MARGIN_MS, finalBankBudgetMs } from '../../src/lib/endphase.mjs'
import { yardWalkBudgetMs, YARD_WALK_CAP_MS, CHEST_WALK_BASE_MS } from '../../src/lib/deposit.mjs'
import { effectiveWalkBudget } from '../../src/lib/deposit.mjs'

test('window: the gate fires only inside the last 90s', () => {
  // a far bot at t-200s keeps digging - the window is not open yet
  assert.equal(prePositionDue({ remainingMs: 200000, yardDist: 250 }), false)
  // one ms above the window: still digging
  assert.equal(prePositionDue({ remainingMs: PRE_POSITION_WINDOW_MS + 1, yardDist: 250 }), false)
  // the boundary itself opens the gate (inclusive)
  assert.equal(prePositionDue({ remainingMs: PRE_POSITION_WINDOW_MS, yardDist: 250 }), true)
  // deep inside the window: the walk home wins over one more shaft
  assert.equal(prePositionDue({ remainingMs: 45000, yardDist: 250 }), true)
  assert.equal(prePositionDue({ remainingMs: 1000, yardDist: 250 }), true)
})

test('distance: near bots keep digging (they already find chests), far bots walk', () => {
  // 47 blocks: a chest scan (64-block findChest radius) still reaches - no walk needed
  assert.equal(prePositionDue({ remainingMs: 60000, yardDist: PRE_POSITION_MIN_DIST - 1 }), false)
  assert.equal(prePositionDue({ remainingMs: 60000, yardDist: PRE_POSITION_MIN_DIST }), true)
  // the 35562867668 shape: F2 at ~250 blocks, t-89s - the exact case that
  // printed 'final bank: 0 (budget exhausted)' 13 times
  assert.equal(prePositionDue({ remainingMs: 89000, yardDist: 250 }), true)
})

test('junk: garbage remaining/dist never abandons mining', () => {
  // junk remaining must read as "no deadline knowledge" -> keep digging
  assert.equal(prePositionDue({ remainingMs: Infinity, yardDist: 250 }), false)
  assert.equal(prePositionDue({ remainingMs: NaN, yardDist: 250 }), false)
  assert.equal(prePositionDue({ remainingMs: -5000, yardDist: 250 }), false)
  assert.equal(prePositionDue({ remainingMs: 0, yardDist: 250 }), false)
  // junk dist reads as "at the yard" -> nothing to pre-position for
  assert.equal(prePositionDue({ remainingMs: 60000, yardDist: NaN }), false)
  assert.equal(prePositionDue({ remainingMs: 60000, yardDist: -3 }), false)
  assert.equal(prePositionDue({ remainingMs: 60000, yardDist: 0 }), false)
  // junk window/minDist fall back to the defaults, not to a wide-open gate
  assert.equal(prePositionDue({ remainingMs: 89000, yardDist: 250, windowMs: NaN }), true)
  assert.equal(prePositionDue({ remainingMs: 89000, yardDist: 250, windowMs: -1 }), true)
  assert.equal(prePositionDue({ remainingMs: 60000, yardDist: 30, minDistBlocks: NaN }), false)
  assert.equal(prePositionDue({ remainingMs: 60000, yardDist: 30, minDistBlocks: -5 }), false)
})

test('yard walk budget: dist-scaled at the measured 2x-detour rule', () => {
  // 0 blocks (already there) keeps the historical 30s floor
  assert.equal(yardWalkBudgetMs({ yardDist: 0 }), CHEST_WALK_BASE_MS)
  // 100 blocks: 30s base + 2*100*500ms = 130s - the flat 120s pin could
  // never carry this walk, and it is exactly the class that starved the
  // final bank in 35562867668
  assert.equal(yardWalkBudgetMs({ yardDist: 100 }), 130000)
  // 60 blocks: 30s + 60s = 90s
  assert.equal(yardWalkBudgetMs({ yardDist: 60 }), 90000)
})

test('yard walk budget: the 180s cap bounds the arithmetic, junk clamps to defaults', () => {
  // 300 blocks would want 30s + 300s = 330s - the cap says no
  assert.equal(yardWalkBudgetMs({ yardDist: 300 }), YARD_WALK_CAP_MS)
  assert.equal(yardWalkBudgetMs({ yardDist: 5000 }), YARD_WALK_CAP_MS)
  // junk dist -> the floor, never NaN
  assert.equal(yardWalkBudgetMs({ yardDist: NaN }), CHEST_WALK_BASE_MS)
  assert.equal(yardWalkBudgetMs({ yardDist: -40 }), CHEST_WALK_BASE_MS)
  // junk caps/floors fall back to the defaults
  assert.equal(yardWalkBudgetMs({ yardDist: 100, capMs: -1 }), YARD_WALK_CAP_MS)
  assert.equal(yardWalkBudgetMs({ yardDist: 100, capMs: NaN }), YARD_WALK_CAP_MS)
  assert.equal(yardWalkBudgetMs({ yardDist: 100, floorMs: 0 }), CHEST_WALK_BASE_MS)
  // a caller-chosen cap below the floor is honoured as the floor
  assert.equal(yardWalkBudgetMs({ yardDist: 100, capMs: 45000 }), 45000)
})

test('invariants: the walk budget stays inside the chain clock and the hard-kill margin', () => {
  // whatever the distance, the budget never leaves the [floor, cap] band
  for (const d of [0, 25, 48, 100, 150, 250, 400, 1200]) {
    const b = yardWalkBudgetMs({ yardDist: d })
    assert.ok(b >= CHEST_WALK_BASE_MS && b <= YARD_WALK_CAP_MS, `dist ${d} -> ${b} in band`)
  }
  // effectiveWalkBudget still clamps the walk into the caller's chain budget:
  // a 280s-wanting walk inside a 120s chain walks 120s, not 280s
  assert.equal(
    effectiveWalkBudget({ distBudget: yardWalkBudgetMs({ yardDist: 300 }), remainingMs: 120000 }),
    120000
  )
  // ...and a chain with less than the walk floor left cancels instead of timing out
  assert.equal(
    effectiveWalkBudget({ distBudget: yardWalkBudgetMs({ yardDist: 60 }), remainingMs: 3000 }),
    0
  )
  // the REAL hard-kill guarantee (the v0.34.0 construction, unchanged): the
  // walk is a PART of the chain budget - effectiveWalkBudget clamps it into
  // remaining() (the two asserts above) - so the walk cap only REALLOCATES
  // time inside the chain, it can never extend it. The chain budget itself
  // never exceeds whatever margin the bot has left:
  assert.equal(finalBankBudgetMs({ yardDist: 300, marginLeftMs: 100000 }), 100000)
  assert.ok(
    finalBankBudgetMs({ yardDist: 5000, marginLeftMs: HARD_KILL_MARGIN_MS - 30000 }) <= HARD_KILL_MARGIN_MS - 30000,
    'the chain budget clamps into the kill margin by construction'
  )
  // and the cap chain stays sane: walk cap <= chain cap, chain cap <= margin
  assert.ok(YARD_WALK_CAP_MS <= END_BANK_BUDGET_CAP_MS, 'the walk cannot want more than the chain can give')
  assert.ok(END_BANK_BUDGET_CAP_MS < HARD_KILL_MARGIN_MS, 'the chain cap sits inside the margin')
})
