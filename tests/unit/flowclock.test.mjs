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
import { flowPriceClock, FLOW_PRICE_MARGIN_S, END_BANK_BUDGET_MS, FLOW_BURST_DELTA_SHARE, FLOW_BURST_SPAN_SHARE } from '../../src/lib/endphase.mjs'
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

test('the shape is ALWAYS the four-key verdict plus the burst name (the always-an-object law)', () => {
  for (const args of [{}, { samples: null, pocketUnits: null }, { samples: FACE6, pocketUnits: 962 }]) {
    const c = flowPriceClock(args)
    assert.deepEqual(Object.keys(c).sort(), ['burst', 'extended', 'floorMs', 'needS', 'rate'])
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

// ---------------------------------------------------------------------------
// (v0.347.0) THE BURST-PRICED CLOCK - the eighth face (36706516734) convicted
// the window rate itself: banked stood at 0 for the whole mining phase, then
// rode a deposit wave 0 -> 1214u (928u of it inside the last 26s). At the
// chain's entry the window read ~4.0u/s - the WAVE's pace - every bot's
// pocket priced 'covered', the extension never fired (0 flow-priced lines),
// and the chains crawled at 1.9u/s: '447s needed, 248s budgeted - 199s
// short'. The tail-burst guard prices the need on the EX-BURST remainder.

// the eighth-face datum: the 15s-tick window the chain entries actually saw
// (rel t = 300 - the log's t-Xs), the wave 286 -> 1214 inside the last 42s
const FACE8 = []
for (let t = 0; t <= 150; t += 15) FACE8.push({ t, banked: 0 })
FACE8.push(
  { t: 165, banked: 0 }, { t: 181, banked: 219 }, { t: 196, banked: 286 },
  { t: 212, banked: 286 }, { t: 227, banked: 286 }, { t: 242, banked: 286 },
  { t: 258, banked: 286 }, { t: 274, banked: 674 }, { t: 289, banked: 979 },
  { t: 300, banked: 1214 }
)

const EX_BURST_RATE = 286 / 258 // the head span's rate: the honest crawl proxy

test('the burst shares are the guard\'s own constants', () => {
  assert.equal(FLOW_BURST_DELTA_SHARE, 0.6)
  assert.equal(FLOW_BURST_SPAN_SHARE, 0.4)
})

test('the eighth-face datum: the wave is not a rate - the guard prices the ex-burst crawl', () => {
  const c = flowPriceClock({ samples: FACE8, pocketUnits: 105 }) // F15\'s own pocket
  // the naive window rate 1214/300 = 4.05 would price the 105u pocket at
  // 30s (covered) - the exact face-8 lie. The ex-burst head (286u over 258s)
  // prices it at 99s - still covered, but HONESTLY.
  assert.equal(c.burst.spanS, 42)
  assert.equal(c.burst.delta, 928)
  assert.ok(Math.abs(c.burst.share - 928 / 1214) < 1e-9)
  assert.ok(Math.abs(c.rate - EX_BURST_RATE) < 1e-9)
  assert.equal(c.needS, 99) // ceil(105 / (286/258)) = 95, + 4
  assert.equal(c.floorMs, END_BANK_BUDGET_MS)
  assert.equal(c.extended, false) // the leanness law: a covered pocket speaks nothing
})

test('the inversion: a big pocket extends on the ex-burst rate where the naive read said covered', () => {
  const c = flowPriceClock({ samples: FACE8, pocketUnits: 300 })
  // the naive rate 4.05 would read ceil(300/4.05)+4 = 79s (covered, static) -
  // the guard reads ceil(300/(286/258))+4 = 275s - the extension fires
  assert.equal(c.extended, true)
  assert.equal(c.needS, 275)
  assert.equal(c.floorMs, 275000)
  assert.ok(Math.abs(c.rate - EX_BURST_RATE) < 1e-9)
})

test('the dead remainder: a window that is ALL wave keeps the static floor (the dead-flow law)', () => {
  const c = flowPriceClock({ samples: [{ t: 0, banked: 0 }, { t: 285, banked: 0 }, { t: 300, banked: 900 }], pocketUnits: 962 })
  assert.equal(c.extended, false)
  assert.equal(c.floorMs, END_BANK_BUDGET_MS)
  assert.equal(c.rate, null)
  assert.equal(c.needS, null)
  assert.equal(c.burst.delta, 900)
  assert.equal(c.burst.rate, undefined) // no head rate exists
})

test('the span boundary is inclusive: a tail at exactly 40% of the span trips', () => {
  const c = flowPriceClock({ samples: [{ t: 0, banked: 0 }, { t: 180, banked: 0 }, { t: 300, banked: 700 }], pocketUnits: 962 })
  assert.equal(c.burst.spanS, 120)
  assert.equal(c.burst.delta, 700)
})

test('the delta boundary is strict: a tail at exactly 60% of the delta is NOT a burst', () => {
  const c = flowPriceClock({ samples: [{ t: 0, banked: 0 }, { t: 299, banked: 400 }, { t: 300, banked: 1000 }], pocketUnits: 962 })
  assert.equal(c.burst, null)
  // the v0.345.0 path stands untouched: rate 1000/300, the need prices on it
  assert.ok(Math.abs(c.rate - 1000 / 300) < 1e-9)
  assert.equal(c.needS, 293) // ceil(962 / (1000/300)) = 289, + 4
  assert.equal(c.extended, true)
})

test('the passthrough law: a smooth window prices exactly as v0.345.0', () => {
  const ramp = [{ t: 0, banked: 0 }, { t: 75, banked: 300 }, { t: 150, banked: 600 }, { t: 225, banked: 900 }, { t: 300, banked: 1214 }]
  const c = flowPriceClock({ samples: ramp, pocketUnits: 962 })
  assert.equal(c.burst, null)
  assert.ok(Math.abs(c.rate - 1214 / 300) < 1e-9)
  assert.equal(c.needS, 242) // ceil(962 / (1214/300)) = 238, + 4
  assert.equal(c.floorMs, END_BANK_BUDGET_MS)
  assert.equal(c.extended, false)
  // the extended leg is byte-identical too
  const c2 = flowPriceClock({ samples: ramp, pocketUnits: 2000 })
  assert.equal(c2.extended, true)
  assert.equal(c2.needS, 499) // ceil(2000 / (1214/300)) = 495, + 4
  assert.equal(c2.floorMs, 499000)
  assert.equal(c2.burst, null)
})

test('the sibling filter: the clock now filters junk exactly like the gap row', () => {
  // junk leading, two good samples trailing - the gap row prices the good
  // tail; the clock must read the same truth (the same filter, the same
  // verdict)
  const mixed = [null, { t: 'x', banked: 1 }, { t: 1000, banked: 834 }, { t: 1370, banked: 1796 }]
  const c = flowPriceClock({ samples: mixed, pocketUnits: 962 })
  assert.equal(c.rate, 2.6)
  assert.equal(c.needS, 374)
  assert.equal(c.extended, true)
  assert.equal(c.burst, null)
  const gap = bankBudgetGapRow(mixed, { pocketUnits: 962, budgetMs: END_BANK_BUDGET_MS })
  assert.ok(gap.includes('370s needed'))
})

test('the granted-budget row: the gap row judges the GRANTED clock, not the static constant', () => {
  const gap = bankBudgetGapRow(FACE6, { pocketUnits: 962, budgetMs: 280000 })
  assert.ok(gap.includes('370s needed, 280s budgeted - 90s short at 2.6u/s'), `got: ${gap}`)
})

test('the wiring: the granted clock rides the chain entries and the row reads it', () => {
  const src = fs.readFileSync(new URL('../../testbed/fleet19.mjs', import.meta.url), 'utf8')
  // the tracker is declared beside the samples it complements
  assert.match(src, /let grantedChainBudgetMs = 0/)
  // the max update rides the chain entry (the fleet's most generous chain)
  assert.match(src, /if \(Number\.isFinite\(chainBudgetMs\) && chainBudgetMs > grantedChainBudgetMs\) grantedChainBudgetMs = chainBudgetMs/)
  // the row judges the granted truth, the static constant only when nothing was granted
  assert.match(src, /budgetMs: grantedChainBudgetMs > 0 \? grantedChainBudgetMs : END_BANK_BUDGET/)
})

test('the wiring: a tripped burst guard names itself on the speak line', () => {
  const src = fs.readFileSync(new URL('../../testbed/fleet19.mjs', import.meta.url), 'utf8')
  // the burst note rides the extension speak (a covered pocket speaks nothing)
  assert.match(src, /the tail burst \(\$\{flowClock\.burst\.spanS\}s, \$\{flowClock\.burst\.delta\}u, \$\{Math\.round\(flowClock\.burst\.share \* 100\)\}% of the window's delta\) is not a rate - priced at the ex-burst \$\{flowClock\.rate\.toFixed\(1\)\}u\/s/)
  // the note rides BETWEEN the static line and the clamp note (the order law)
  assert.match(src, /covered only the fast flows\$\{burstNote\}\$\{clamped/)
})
