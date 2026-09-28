// (v0.271.0) THE ASCEND GRACE - the race the fast window silently won.
//
// Face 36378053182's ledger: F1's ladder went #1..#7 consecutive in one
// water column and bled health 20 -> 5.3 -> dead while the DEEP-POCKET
// ASCEND (the lane's own ceiling move) fired ZERO times in the
// finite-critical cycles - every field ascend line rode a NON-critical bar
// (o2=11, o2=16, o2=reset(-1) -> the legacy window's 10-pass freeze leaves
// passes 5-9 for the dig). THE ARITHMETIC: physicsFrozen(window=4) needs 4
// flat points; ascendStalled(minPasses=4) needs K+1=5. The freeze broke the
// rescue one pass BEFORE the stall could arm - a finite-critical wedge
// could never dig. THE CURE: the stall K drops to 3 (the tie - both
// verdicts arm on the same 4-point pass) and the miner's frozen block
// spends the condemned pass on the ceiling dig when ascendGraceWanted
// holds; the freeze re-verdicts next pass if the dig buys nothing.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ascendGraceWanted, ascendStalled, physicsFrozen, frozenWindowFor,
  ASCEND_STALL_PASSES, ASCEND_DIG_BUDGET, WET_FROZEN_WINDOW, FROZEN_WINDOW
} from '../../src/lib/drowning.mjs'

const flat = (n, y = 42.2) => Array.from({ length: n }, () => ({ x: -134, y, z: 407 }))
const rise = (n, y0 = 42.2, step = 0.4) => Array.from({ length: n }, (_, i) => ({ x: -134, y: y0 + i * step, z: 407 }))

test('the tie invariant: the stall arms on the SAME point count the fast freeze needs', () => {
  // the arithmetic that lost the race: the fast freeze arms at 4 points,
  // the old K=4 stall needed 5 - one pass late, exactly on the bleeding clock
  assert.equal(ASCEND_STALL_PASSES + 1, WET_FROZEN_WINDOW,
    'K+1 points must equal the fast window - the dig and the freeze arm together')
  assert.equal(ASCEND_STALL_PASSES, 3, 'the v0.271.0 tie value')
  // the wet-critical verdict still routes to the fast window
  assert.equal(frozenWindowFor({ headWet: true, oxygen: 0 }), WET_FROZEN_WINDOW)
  assert.equal(frozenWindowFor({ headWet: true, oxygen: 12 }), FROZEN_WINDOW,
    'a healthy bar keeps the legacy window')
})

test('the race pin: 4 flat points arm BOTH the grace and the fast freeze', () => {
  const pts = flat(4)
  assert.equal(ascendStalled({ points: pts }), true,
    'the stall arms at 4 points now (the old K=4 needed 5 - the decode pin)')
  assert.equal(physicsFrozen({ points: pts, window: WET_FROZEN_WINDOW }), true,
    'the fast freeze arms at the same 4 points')
  // the code order owns the pass: the grace consult runs BEFORE the break
  assert.equal(ascendGraceWanted({ headWet: true, ascendDigs: 0, points: pts }), true,
    'the grace is armed on the condemned pass - the dig owns it')
})

test('the grace fences: dry head, spent budget, junk points, short windows', () => {
  const pts = flat(4)
  // the dry bot has shores - the grace is the SUBMERGED lane's move only
  assert.equal(ascendGraceWanted({ headWet: false, ascendDigs: 0, points: pts }), false)
  assert.equal(ascendGraceWanted({ headWet: 'wet', ascendDigs: 0, points: pts }), false,
    'only a strict true reads wet (the junk law)')
  // the budget caps the tunnel-dig (the v0.125.0 law rides)
  assert.equal(ascendGraceWanted({ headWet: true, ascendDigs: ASCEND_DIG_BUDGET, points: pts }), false,
    'a spent budget reads no grace')
  assert.equal(ascendGraceWanted({ headWet: true, ascendDigs: ASCEND_DIG_BUDGET - 1, points: pts }), true,
    'the last budget dig still graces')
  // junk budget reads spent (a guessed budget must not arm a dig)
  assert.equal(ascendGraceWanted({ headWet: true, ascendDigs: 0, budget: NaN, points: pts }), true,
    'a junk budget falls to the documented default (the same law the plan rides)')
  assert.equal(ascendGraceWanted({ headWet: true, ascendDigs: 0, budget: 0, points: pts }), true,
    'a non-positive budget falls to the documented default (the ascendStalled junk-knob law, byte-true)')
  // junk points never arm a dig (a LOST reading is not a stalled one)
  assert.equal(ascendGraceWanted({ headWet: true, ascendDigs: 0, points: null }), false)
  assert.equal(ascendGraceWanted({ headWet: true, ascendDigs: 0, points: 'junk' }), false)
  assert.equal(ascendGraceWanted({ headWet: true, ascendDigs: 0, points: [] }), false)
  assert.equal(ascendGraceWanted({ headWet: true, ascendDigs: 0, points: flat(3) }), false,
    'three points are one shy of the tie - the legacy short-window law')
  assert.equal(ascendGraceWanted({ headWet: true, ascendDigs: 0, points: [...flat(3), { x: -134, y: NaN, z: 407 }] }), false,
    'a NaN y inside the window is a lost reading, not a stall')
  // a live ascent is not a stall - the grace never steals a moving pass
  assert.equal(ascendGraceWanted({ headWet: true, ascendDigs: 0, points: rise(4) }), false,
    'a rising bot has no ceiling verdict to spend')
})

test('the composed F1 shape: the dig owns the condemned pass, the freeze re-verdicts if it buys nothing', () => {
  // cycle N: the fresh client lands wet at the wedge, four flat passes at
  // o2=0 - the fast freeze and the grace arm TOGETHER
  let pts = flat(4)
  assert.equal(physicsFrozen({ points: pts, window: WET_FROZEN_WINDOW }), true)
  assert.equal(ascendGraceWanted({ headWet: true, ascendDigs: 0, points: pts }), true,
    'the F1 cycle that bled 3-5 hp now digs instead of breaking')
  // the dig WORKS: the ceiling opens, the bot rises - the y moves, the
  // freeze never re-verdicts, the rescue continues alive
  pts = [...flat(4), { x: -134, y: 42.8, z: 407 }]
  assert.equal(ascendStalled({ points: pts }), false, 'the rise breaks the stall')
  assert.equal(physicsFrozen({ points: pts, window: WET_FROZEN_WINDOW }), false,
    'a moved y is a live pass - no re-verdict, no ladder')
  // the dig BUYS NOTHING: the wedge persists - the next pass re-condemns
  pts = flat(5)
  assert.equal(physicsFrozen({ points: pts, window: WET_FROZEN_WINDOW }), true,
    'the freeze re-verdicts one pass later - the detector still owns the true freeze')
  assert.equal(ascendGraceWanted({ headWet: true, ascendDigs: 1, points: pts }), true,
    'the budget spans the grace too - the next dig may try (the thick roof climbs one block per pass)')
})

test('the ascend grace wiring: the frozen block consults the grace before the break', async () => {
  const fs = await import('node:fs')
  const src = fs.readFileSync(new URL('../../src/bots/miner.mjs', import.meta.url), 'utf8')
  // the import rides the drowning block
  assert.ok(src.includes('ascendStalled, ascendGraceWanted, ceilingCell'), 'the grace rides the drowning import')
  // the consult lives INSIDE the frozen verdict, before the bookkeeping
  const frozenIdx = src.indexOf("if (physicsFrozen({ points: passPoints, window: frozenWindow })) {")
  assert.ok(frozenIdx > 0, 'the frozen verdict block found')
  const graceIdx = src.indexOf('ascendGraceWanted({ headWet, ascendDigs, points: passPoints })')
  assert.ok(graceIdx > frozenIdx, 'the grace consult is inside the frozen block')
  const breakIdx = src.indexOf('frozenDown = true', graceIdx)
  assert.ok(breakIdx > graceIdx, 'the break follows the grace consult (the dig can preempt it)')
  // the dig reuses the lane's own fences (diggability + the timeout cap)
  assert.ok(src.includes("gceil.diggable === true"), 'only explicitly diggable ceilings are graced')
  assert.ok(src.includes("'ascend grace dig'"), 'the grace dig rides the withTimeout fence')
  assert.ok(src.includes('continue // the pass is spent on the dig'), 'a graced pass is spent - the loop re-reads fresh')
  // the lane names itself so the next mine can count the digs
  assert.ok(src.includes('ascend grace - dug the ceiling'), 'the grace line names itself')
  // the one-renderer law: the grace line labels o2 (the sentinel renders NAMED)
  assert.ok(src.includes('o2 ${o2SensorLabel(read.oxygen)}; the freeze re-verdicts'), 'the grace line rides o2SensorLabel')
})
