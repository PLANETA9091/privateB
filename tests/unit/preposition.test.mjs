// PRE-POSITION (v0.36.0) - the walk home starts BEFORE the deadline.
//
// Two dispatches of evidence (35560497949 + 35562867668): bots dig 100-300
// blocks out, and the end phase burned 13-14x 'final bank: 0 (budget
// exhausted)' per run because its budget had to pay climb + smelt + the WHOLE
// walk back. The cure has two pinned halves here: the pure gate that stops
// the digging inside the last window (prePositionDue, endphase.mjs) and the
// yard-walk budget that finally scales with the distance instead of the flat
// 120s pin (yardWalkBudgetMs, deposit.mjs).
import { test, beforeEach } from 'node:test'
import { readFileSync } from 'node:fs'
import { resetDoomedGoalLedger } from '../../src/lib/jobqueue.mjs'
import assert from 'node:assert/strict'
import { prePositionDue, PRE_POSITION_WINDOW_MS, PRE_POSITION_MIN_DIST, END_BANK_BUDGET_CAP_MS, HARD_KILL_MARGIN_MS } from '../../src/lib/endphase.mjs'
import { yardWalkBudgetMs, YARD_WALK_CAP_MS, CHEST_WALK_BASE_MS, finalBankBudgetMs } from '../../src/lib/deposit.mjs'
import { effectiveWalkBudget } from '../../src/lib/deposit.mjs'

// The doomed-goal ledger (v0.72.0) is a module-level singleton in jobqueue.mjs
// (one process = one fleet). A dead verdict recorded by one test's walk must
// not refuse the next test's walks (the mocks reuse chest/furnace positions),
// so every test here starts from an empty ledger.
beforeEach(() => resetDoomedGoalLedger())

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
  // junk caps/floors fall back to the defaults: a junk cap never un-caps the
  // arithmetic (300 blocks still lands on the default 180s cap, not 330s) and
  // a junk floor never zeroes the walk (the honest dist arithmetic survives)
  assert.equal(yardWalkBudgetMs({ yardDist: 300, capMs: -1 }), YARD_WALK_CAP_MS)
  assert.equal(yardWalkBudgetMs({ yardDist: 300, capMs: NaN }), YARD_WALK_CAP_MS)
  assert.equal(yardWalkBudgetMs({ yardDist: 100, floorMs: 0 }), 130000)
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

// ---------------------------------------------------------------------------
// (v0.304.0) THE DEEP PRE-POSITION - the climb IS the far walk. Face
// 36525740882 (the v0.302.0 field, the write-off row's debut): 13 staggered
// final banks delivered +5 and +269 and ELEVEN zeroes - 7x 'still underground
// after N climb attempts - the chain from the shaft bottom is doomed walks'.
// The pre-position lane PROVED it delivers (F1: t-88s, 'pre-position bank:
// +191') but fired exactly twice: the gate's straight-line dist says a
// shaft-bottom bot standing under the yard is 'near' (48b read), while its
// climb out costs ~4.2s/level (the v0.294.0 measurement) - the whole legacy
// 90s window. F6 DID fire (t-48s, the slot the stagger gave it) and its
// 'climb out (pre-position): failed - stopped (traversed 3)' left 236u to
// ride the deadline. THE CURE: prePositionDue reads the vertical (yardDy) -
// a bot PRE_POSITION_UNDERGROUND_DY+ levels below the yard is deep, the deep
// read auto-qualifies the distance and opens the gate at the 150s handoff
// boundary the cadence refusal already reads. Junk dy reads 0 -> the legacy
// shallow shape byte for byte; the night hold above the call stays the
// owner in the dark (the v0.185.0 law untouched).
import { PRE_POSITION_UNDERGROUND_DY, PRE_POSITION_UNDERGROUND_WINDOW_MS } from '../../src/lib/endphase.mjs'

test('deep lane: the F6 datum - under the yard, deep, inside the 150s boundary', () => {
  // the exact class the 7 'still underground' finals named: the bot stands
  // ~8 blocks (straight-line) from the yard but 25 levels below it - the
  // legacy gate said 'near, keep digging' twice over (dist < 48 AND the 90s
  // window closed at t-140s); the deep read opens the climb home
  assert.equal(prePositionDue({ remainingMs: 140000, yardDist: 8, yardDy: 25 }), true)
  // a deeper shaft with zero horizontal offset - same verdict
  assert.equal(prePositionDue({ remainingMs: 140000, yardDist: 2, yardDy: 30 }), true)
})

test('deep lane boundary: the threshold and the 150s window are exact', () => {
  // dy 11 = a shallow cellar - the legacy shape owns it (the window closed)
  assert.equal(prePositionDue({ remainingMs: 140000, yardDist: 8, yardDy: PRE_POSITION_UNDERGROUND_DY - 1 }), false)
  // dy 12 opens the deep lane
  assert.equal(prePositionDue({ remainingMs: 140000, yardDist: 8, yardDy: PRE_POSITION_UNDERGROUND_DY }), true)
  // one ms above the deep window: still digging
  assert.equal(prePositionDue({ remainingMs: PRE_POSITION_UNDERGROUND_WINDOW_MS + 1, yardDist: 8, yardDy: 25 }), false)
  // the boundary itself opens (inclusive, the legacy convention)
  assert.equal(prePositionDue({ remainingMs: PRE_POSITION_UNDERGROUND_WINDOW_MS, yardDist: 8, yardDy: 25 }), true)
  // a deep bot inside the LEGACY window with a qualifying dist still fires
  // (the deep read never narrows the legacy lane)
  assert.equal(prePositionDue({ remainingMs: 60000, yardDist: 250, yardDy: 25 }), true)
})

test('deep lane: the legacy shallow shape stays byte for byte (no yardDy passed)', () => {
  // every legacy assertion re-run with yardDy absent (default 0 = shallow)
  assert.equal(prePositionDue({ remainingMs: 200000, yardDist: 250 }), false)
  assert.equal(prePositionDue({ remainingMs: PRE_POSITION_WINDOW_MS + 1, yardDist: 250 }), false)
  assert.equal(prePositionDue({ remainingMs: 60000, yardDist: PRE_POSITION_MIN_DIST - 1 }), false)
  assert.equal(prePositionDue({ remainingMs: 60000, yardDist: PRE_POSITION_MIN_DIST }), true)
  // a shallow bot near the yard inside the 90s window keeps digging even
  // when the caller passes a junk/negative dy
  assert.equal(prePositionDue({ remainingMs: 60000, yardDist: 8, yardDy: NaN }), false)
  assert.equal(prePositionDue({ remainingMs: 60000, yardDist: 8, yardDy: -4 }), false)
  assert.equal(prePositionDue({ remainingMs: 60000, yardDist: 8, yardDy: 0 }), false)
  // a bot ABOVE the yard (rooftop) is not deep - the climb home is downhill
  assert.equal(prePositionDue({ remainingMs: 140000, yardDist: 8, yardDy: -30 }), false)
})

test('deep lane junk: garbage window overrides fall back to the defaults', () => {
  // junk undergroundWindowMs reads the default 150s, not a wide-open gate
  assert.equal(prePositionDue({ remainingMs: 140000, yardDist: 8, yardDy: 25, undergroundWindowMs: NaN }), true)
  assert.equal(prePositionDue({ remainingMs: PRE_POSITION_UNDERGROUND_WINDOW_MS + 1, yardDist: 8, yardDy: 25, undergroundWindowMs: NaN }), false)
  assert.equal(prePositionDue({ remainingMs: 140000, yardDist: 8, yardDy: 25, undergroundWindowMs: -1 }), true)
  // junk legacy window override on a shallow bot: the legacy fallback holds
  assert.equal(prePositionDue({ remainingMs: 89000, yardDist: 250, windowMs: NaN, yardDy: 0 }), true)
})

test('deep lane constants pin: the pricing boundary is measured, not tuned', () => {
  assert.equal(PRE_POSITION_UNDERGROUND_DY, 12)
  assert.equal(PRE_POSITION_UNDERGROUND_WINDOW_MS, 150000)
})

test('deep lane wiring pin: the vertical rides the fleet call', () => {
  const fleetSrc = readFileSync(new URL('../../testbed/fleet19.mjs', import.meta.url), 'utf8')
  // the wire computes yardDy from the live positions and passes it beside yardDist
  assert.match(fleetSrc, /const yardDy = Math\.max\(0, yardGoal\.y - miner\.bot\.entity\.position\.y\)/, 'the vertical separation is computed from the live positions')
  assert.match(fleetSrc, /prePositionDue\(\{\s*\n\s*remainingMs: deadline - Date\.now\(\),\s*\n\s*yardDist: miner\.bot\.entity\.position\.distanceTo\(yardGoal\),\s*\n\s*yardDy\s*\n\s*\}\)/, 'the gate receives the vertical beside the straight-line dist')
  // the night hold stays FIRST in the wrapper (the v0.185.0 law): the dark
  // owns the bot before the deep read can ever fire
  const wrapper = fleetSrc.slice(fleetSrc.indexOf('const prePositionNow'), fleetSrc.indexOf('const prePositionNow') + 2200)
  const holdAt = wrapper.indexOf('walkForbidden(miner.bot.time?.timeOfDay)')
  const gateAt = wrapper.indexOf('prePositionDue(')
  assert.ok(holdAt > -1 && gateAt > holdAt, 'the night hold precedes the deep gate')
})
