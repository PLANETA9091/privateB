// Tests for the flow-priced clock in src/lib/endphase.mjs (v0.345.0).
// The static 248s end-bank budget priced the HEALTHY flow it was measured on,
// and the sixth face (36697238002) convicted the static: '370s needed, 248s
// budgeted - 122s short at 2.6u/s' (the gap row's own verdict) with banked
// 1796 riding a storm - the flow variance IS the front (4.7/0.7/0.0/2.6
// across faces 3-6). The chain's entry now prices the LIVE fleet flow against
// the bot's bankable pocket and extends the floor by the flow-implied need
// (+ the v0.334.0 4s margin). The kill-margin law is not re-implemented: the
// floor only feeds finalBankBudgetMs, whose min(want, margin) construction
// the v0.41.0 note already owns - the extension moves the clock, never the
// kill.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { flowPriceClock, FLOW_PRICE_MARGIN_S, END_BANK_BUDGET_MS } from '../../src/lib/endphase.mjs'
import { bankBudgetGapRow } from '../../src/lib/pocketline.mjs'

// the sixth-face datum: flow 2.6u/s (962u banked over a 370s span), pocket 962u
const FACE6 = [{ t: 1000, banked: 834 }, { t: 1370, banked: 1796 }]

test('the margin is the v0.334.0 law\'s own number: need + 4s', () => {
  assert.equal(FLOW_PRICE_MARGIN_S, 4)
  assert.equal(END_BANK_BUDGET_MS, 248000)
})

test('the sixth-face datum: 962u at 2.6u/s prices 374s and extends the static 248s', () => {
  const c = flowPriceClock({ samples: FACE6, pocketUnits: 962 })
  assert.equal(c.rate, 2.6)
  assert.equal(c.needS, 374) // ceil(962 / 2.6) = 370, + 4 = 374
  assert.equal(c.floorMs, 374000)
  assert.equal(c.extended, true)
})

test('a covered pocket keeps the static clock (the leanness law) but still names the rate', () => {
  const c = flowPriceClock({ samples: FACE6, pocketUnits: 600 })
  assert.equal(c.rate, 2.6)
  assert.equal(c.needS, 235) // ceil(600 / 2.6) = 231, + 4
  assert.equal(c.floorMs, END_BANK_BUDGET_MS)
  assert.equal(c.extended, false)
})

test('the boundary is inclusive: a need+4 that merely MEETS the base never extends', () => {
  // ceil(634 / 2.6) = 244, + 4 = 248 == the base - static
  const c = flowPriceClock({ samples: FACE6, pocketUnits: 634 })
  assert.equal(c.extended, false)
  assert.equal(c.floorMs, END_BANK_BUDGET_MS)
  // one unit more: ceil(635 / 2.6) = 245, + 4 = 249 > 248 - the clock moves
  const c2 = flowPriceClock({ samples: FACE6, pocketUnits: 635 })
  assert.equal(c2.extended, true)
  assert.equal(c2.floorMs, 249000)
})

test('the sibling-shape law: the priced need matches the gap row\'s own need', () => {
  const c = flowPriceClock({ samples: FACE6, pocketUnits: 962 })
  const gap = bankBudgetGapRow(FACE6, { pocketUnits: 962, budgetMs: END_BANK_BUDGET_MS })
  // the gap row prints ceil(pocket/rate) WITHOUT the margin; the clock's
  // needS carries exactly the +4 - the two rows must never disagree
  assert.ok(gap.includes(`${c.needS - FLOW_PRICE_MARGIN_S}s needed`), `gap row must name ${c.needS - FLOW_PRICE_MARGIN_S}s, got: ${gap}`)
  assert.ok(gap.includes(`122s short at 2.6u/s`))
})

test('a dead or negative flow is the storm front\'s business - the clock keeps the static floor', () => {
  const dead = flowPriceClock({ samples: [{ t: 1000, banked: 500 }, { t: 1370, banked: 500 }], pocketUnits: 962 })
  assert.equal(dead.floorMs, END_BANK_BUDGET_MS)
  assert.equal(dead.rate, null)
  assert.equal(dead.needS, null)
  assert.equal(dead.extended, false)
  const neg = flowPriceClock({ samples: [{ t: 1000, banked: 900 }, { t: 1370, banked: 500 }], pocketUnits: 962 })
  assert.equal(neg.extended, false)
  assert.equal(neg.rate, null)
})

test('the junk battery: junk never prices a clock (the body-guard law)', () => {
  const junkSamples = [null, undefined, [], [{ t: 1, banked: 1 }], [{ t: 'x', banked: 1 }, { t: 2, banked: 3 }], [{ t: 1, banked: 'y' }, { t: 2, banked: 3 }], [{ t: 2, banked: 3 }, { t: 1, banked: 1 }]]
  for (const s of junkSamples) {
    const c = flowPriceClock({ samples: s, pocketUnits: 962 })
    assert.equal(c.floorMs, END_BANK_BUDGET_MS)
    assert.equal(c.extended, false)
    assert.equal(c.rate, null)
    assert.equal(c.needS, null)
  }
  for (const p of [null, undefined, NaN, 0, -5, 'junk', Infinity]) {
    const c = flowPriceClock({ samples: FACE6, pocketUnits: p })
    assert.equal(c.floorMs, END_BANK_BUDGET_MS)
    assert.equal(c.extended, false)
  }
})

test('a junk base falls back to the default budget (never a zero clock)', () => {
  for (const b of [0, -1, NaN, 'junk', null]) {
    const c = flowPriceClock({ samples: FACE6, pocketUnits: 962, baseMs: b })
    assert.equal(c.floorMs >= END_BANK_BUDGET_MS, true)
  }
  // a healthy custom base still extends past it
  const c = flowPriceClock({ samples: FACE6, pocketUnits: 962, baseMs: 300000 })
  assert.equal(c.floorMs, 374000)
  assert.equal(c.extended, true)
})

test('the fractional pocket floors before pricing (the sibling law: the counters are integers)', () => {
  // floor(962.9) = 962 first (the gap row's own arithmetic), then ceil(962 / 2.6) = 370, + 4 = 374
  const c = flowPriceClock({ samples: FACE6, pocketUnits: 962.9 })
  assert.equal(c.needS, 374)
  assert.equal(c.floorMs, 374000)
})

test('the shape is ALWAYS the four-key verdict (the always-an-object law)', () => {
  for (const args of [{}, { samples: null, pocketUnits: null }, { samples: FACE6, pocketUnits: 962 }]) {
    const c = flowPriceClock(args)
    assert.deepEqual(Object.keys(c).sort(), ['extended', 'floorMs', 'needS', 'rate'])
  }
})

test('the wiring: fleet19 prices the clock at the final-bank entry from the live window and the bankable pocket', () => {
  const src = fs.readFileSync(new URL('../../testbed/fleet19.mjs', import.meta.url), 'utf8')
  // the import rides the endphase family
  assert.match(src, /FINAL_CLIMB_RESCUE_WAIT_MS, flowPriceClock \} from '\.\.\/src\/lib\/endphase\.mjs'/)
  // the pricing reads the LIVE flow window (the same slice the rows read)
  assert.match(src, /flowPriceClock\(\{ samples: bankFlowSamples\.slice\(-BANK_FLOW_WINDOW\), pocketUnits: endPocketUnits, baseMs: END_BANK_BUDGET \}\)/)
  // the floor feeds finalBankBudgetMs - the kill-margin construction untouched
  assert.match(src, /floorMs: flowClock\.floorMs/)
  // the pocket is the BANKABLE mass (the KEEP items never ride a chest)
  assert.match(src, /\.filter\(i => !DEPOSIT_KEEP\.some\(k => i\.name\.includes\(k\)\)\)/)
})

test('the wiring: the extension speaks (rides the final bank filter-key) and a clamp names the margin', () => {
  const src = fs.readFileSync(new URL('../../testbed/fleet19.mjs', import.meta.url), 'utf8')
  // the speak guard is the extension itself (a covered pocket prints nothing)
  assert.match(src, /if \(flowClock\.extended\) \{/)
  // the line rides the 'final bank' filter-key and names the pricing
  assert.match(src, /final bank budget: flow-priced/)
  assert.match(src, /needs \$\{flowClock\.needS\}s\)/)
  assert.match(src, /the static \$\{\(END_BANK_BUDGET \/ 1000\)\.toFixed\(0\)\}s covered only the fast flows/)
  // a clamped extension names the kill margin (the law's own words)
  assert.match(src, /clamped to \$\{\(chainBudgetMs \/ 1000\)\.toFixed\(0\)\}s \(the kill margin\)/)
})
