// (v0.382.0) THE BANK-FLOW CENSUS - the end-phase bank lines are the walk-
// deliveries cure's priced evidence; the parser must read them byte for
// byte. Tests feed the face-19 (36802577873) verbatim lines, the junk
// battery, and the missing-block tolerance (a FATAL face truncates the end
// phase - the v0.358.0 lesson).
import { bankFlowCensus, parseSurplusItems, parseStranded, parseWriteOff, parseDoomWhy, parseDeliverable, parsePrePositionCensus, craterSeatSplit, writeOffBill, writeOffBillRow, writeOffRiders, writeOffRidersRow } from '../../src/lib/bankcensus.mjs'
import assert from 'node:assert'
import { test } from 'node:test'

const F19 = [
  'F8 direct deposit: 27 chest slots derived from the 63-slot view',
  'F8 final bank: +26',
  'blocks mined: 1011 in ~300s = 3.37 blocks/s (202/min)',
  'loot ledger: mined=1011 banked=754 smelted=2 pocket=495u/168s accounted=1251 unaccounted=0 surplus=240u conversion=123.7%',
  'final write-off: F1 102u/15s, F13 65u/14s (the deadline pocket rode unbanked)',
  'bank attribution: top F14 99u, F10 97u, F9 84u; stranded: F1 0u/102u pocket, F13 0u/65u pocket - the walk never delivered',
  'final bank doom census: spread - top F1 carries 1 of 5 failed climb cycles (20.0%) - the strand is a fleet-wide climb tax',
  'final bank doom why: local - stalled carries 4 of 5 failed climb cycles (80.0%) - one class owns the tax',
  'pocket anatomy: spread across 19 holders, top F1 102u = 20.6% of 495u - the chains own the crater\'s face, no single walk cures it',
  'surplus face: crafted-class 191u of 495u pocket (38.6%), top stick 96u, oak_planks 70u, torch 12u - the mined counter never saw these units (surplus 240u)',
  'bank flow: 2.1u/s (banked +611u over 288s) - the 495u pocket needs 234s past the deadline',
  'F8 final bank budget: flow-priced 2771s (fleet pocket 933u at 0.3u/s needs 2771s) - the static 248s covered only the fast flows - the tail burst (78s, 118u, 67% of the window\'s delta) is not a rate - priced at the ex-burst 0.3u/s - clamped to 300s (the kill margin)',
  'F19 final bank budget: flow-priced 2789s (fleet pocket 939u at 0.3u/s needs 2789s) - the static 248s covered only the fast flows - the tail burst (78s, 118u, 67% of the window\'s delta) is not a rate - priced at the ex-burst 0.3u/s - clamped to 300s (the kill margin)',
  'F6 final bank budget: flow-priced 2599s (fleet pocket 875u at 0.3u/s needs 2599s) - the static 248s covered only the fast flows - the tail burst (78s, 118u, 67% of the window\'s delta) is not a rate - priced at the ex-burst 0.3u/s - clamped to 300s (the kill margin)',
  'F11 final bank budget: flow-priced 2433s (fleet pocket 819u at 0.3u/s needs 2433s) - the static 248s covered only the fast flows - the tail burst (93s, 206u, 78% of the window\'s delta) is not a rate - priced at the ex-burst 0.3u/s - clamped to 300s (the kill margin)',
  'worldmap: 840 positions, 16 chunks scanned, top: oak_log=259 sand=194 coal_ore=193 copper_ore=80 birch_log=55',
]

test('loot ledger parsed (the accounting spine)', () => {
  const c = bankFlowCensus(F19)
  assert.deepEqual(c.loot, { mined: 1011, banked: 754, smelted: 2, pocketUnits: 495, pocketSeconds: 168, accounted: 1251, unaccounted: 0, surplus: 240, conversionPct: 123.7 })
})

test('pocket anatomy parsed (the crater\'s face holder)', () => {
  const c = bankFlowCensus(F19)
  assert.equal(c.pocket.holders, 19)
  assert.equal(c.pocket.topBot, 'F1')
  assert.equal(c.pocket.topUnits, 102)
  assert.equal(c.pocket.topPct, 20.6)
  assert.equal(c.pocket.pocketUnits, 495)
  assert.match(c.pocket.tail, /no single walk cures it$/)
})

test('surplus face parsed - the crafted-class split (the mined counter never saw these)', () => {
  const c = bankFlowCensus(F19)
  assert.equal(c.surplus.craftedUnits, 191)
  assert.equal(c.surplus.pocketUnits, 495)
  assert.equal(c.surplus.craftedPct, 38.6)
  assert.equal(c.surplus.surplusUnits, 240)
  assert.deepEqual(c.surplus.top, [{ item: 'stick', units: 96 }, { item: 'oak_planks', units: 70 }, { item: 'torch', units: 12 }])
})

test('bank flow parsed - the delivery pricing (234s past the deadline)', () => {
  const c = bankFlowCensus(F19)
  assert.equal(c.flow.rateUPerS, 2.1)
  assert.equal(c.flow.bankedDelta, 611)
  assert.equal(c.flow.windowS, 288)
  assert.equal(c.flow.pocketUnits, 495)
  assert.equal(c.flow.secondsPastDeadline, 234)
})

test('flow-priced budgets: four bots, ALL clamped, the granted clock 300s vs need 2789s', () => {
  const c = bankFlowCensus(F19)
  assert.equal(c.budgets.length, 4)
  assert.equal(c.budgetAgg.count, 4)
  assert.equal(c.budgetAgg.clamped, 4)
  assert.equal(c.budgetAgg.grantedMaxS, 300)
  assert.equal(c.budgetAgg.maxNeedsS, 2789)
  assert.equal(c.budgetAgg.staticS, 248)
  assert.equal(c.budgetAgg.grantedSharePct, 11)
  assert.equal(c.budgets[0].bot, 'F8')
  assert.equal(c.budgets[0].flowPricedS, 2771)
  assert.deepEqual(c.budgets[0].burst, { spanS: 78, deltaU: 118, pct: 67, exBurstRate: 0.3 })
  assert.equal(c.budgets[0].grantedS, 300)
  assert.equal(c.budgets[0].clamped, true)
  assert.equal(c.budgets[3].bot, 'F11')
  assert.deepEqual(c.budgets[3].burst, { spanS: 93, deltaU: 206, pct: 78, exBurstRate: 0.3 })
})

test('the fantasy covered form never parses (the leanness law: a covered pocket speaks nothing)', () => {
  const c = bankFlowCensus(['F8 final bank budget: flow-priced 2771s (fleet pocket 933u at 0.3u/s needs 2771s) - the static 248s covered only the fast flows - the tail burst (78s, 118u, 67% of the window\'s delta) is not covered'])
  assert.deepEqual(c.budgets, [])
  assert.equal(c.budgetAgg, null)
})

test('stranded pockets: both zero-delivered - the walk never delivered', () => {
  const c = bankFlowCensus(F19)
  assert.equal(c.attribution.topRaw, 'F14 99u, F10 97u, F9 84u')
  assert.deepEqual(c.attribution.stranded, [{ bot: 'F1', deliveredU: 0, pocketU: 102 }, { bot: 'F13', deliveredU: 0, pocketU: 65 }])
  assert.equal(c.attribution.strandedZeroDelivered, 2)
})

test('write-off entries parsed (the parenthetical dropped)', () => {
  const c = bankFlowCensus(F19)
  assert.deepEqual(c.writeOff, [{ bot: 'F1', units: 102, seconds: 15 }, { bot: 'F13', units: 65, seconds: 14 }])
})

test('doom why: the stalled class owns the tax (80%)', () => {
  const c = bankFlowCensus(F19)
  assert.deepEqual(c.doom.why, { whyClass: 'stalled', carried: 4, total: 5, pct: 80 })
  assert.match(c.doom.censusRaw, /fleet-wide climb tax$/)
})

test('missing block tolerance: a FATAL face truncation yields nulls and empties', () => {
  const c = bankFlowCensus(['F1 [F1] water: pass 0 head=wet shore=none', 'boom'])
  assert.equal(c.loot, null)
  assert.equal(c.pocket, null)
  assert.equal(c.surplus, null)
  assert.equal(c.flow, null)
  assert.deepEqual(c.budgets, [])
  assert.equal(c.budgetAgg, null)
  assert.equal(c.attribution, null)
  assert.deepEqual(c.writeOff, [])
  assert.equal(c.doom, null)
})

test('junk battery: non-strings and wrong shapes never throw', () => {
  const c = bankFlowCensus([null, undefined, 42, 'loot ledger: mined=x', 'pocket anatomy: no', 'bank flow: -'])
  assert.equal(c.loot, null)
  assert.equal(c.flow, null)
  assert.deepEqual(bankFlowCensus([]).writeOff, [])
  assert.deepEqual(bankFlowCensus(undefined).surplus, null)
})

test('the Number(null) lesson: partial lines do not parse as entries', () => {
  assert.deepEqual(parseSurplusItems('stick 96u, junk, oak_planks 70u'), [{ item: 'stick', units: 96 }, { item: 'oak_planks', units: 70 }])
  assert.deepEqual(parseStranded('F1 0u/102u pocket, F9 - the walk never delivered'), [{ bot: 'F1', deliveredU: 0, pocketU: 102 }])
  assert.deepEqual(parseWriteOff('F1 102u/15s, F2 junk'), [{ bot: 'F1', units: 102, seconds: 15 }])
  assert.deepEqual(parseWriteOff('F1 102u/15s (tail)'), [{ bot: 'F1', units: 102, seconds: 15 }])
  assert.equal(parseDoomWhy('no class owns it'), null)
})

test('the smooth-window form: no burst note, no clamp - the granted clock is null (the share reads null)', () => {
  const c = bankFlowCensus(['F8 final bank budget: flow-priced 240s (fleet pocket 70u at 0.3u/s needs 240s) - the static 248s covered only the fast flows'])
  assert.equal(c.budgets[0].burst, null)
  assert.equal(c.budgets[0].grantedS, null)
  assert.equal(c.budgets[0].clamped, false)
  assert.equal(c.budgetAgg.clamped, 0)
  assert.equal(c.budgetAgg.grantedMaxS, null)
  assert.equal(c.budgetAgg.grantedSharePct, null)
})

test('a clamp without a burst note parses (the v0.345.0 smooth window can still hit the margin)', () => {
  const c = bankFlowCensus(['F8 final bank budget: flow-priced 2771s (fleet pocket 933u at 0.3u/s needs 2771s) - the static 248s covered only the fast flows - clamped to 280s (the kill margin)'])
  assert.equal(c.budgets[0].burst, null)
  assert.equal(c.budgets[0].grantedS, 280)
  assert.equal(c.budgets[0].clamped, true)
  assert.equal(c.budgetAgg.grantedSharePct, 10)
})

test('last line wins: a later ledger print supersedes the earlier', () => {
  const c = bankFlowCensus(['loot ledger: mined=10 banked=5 smelted=0 pocket=5u/2s accounted=5 unaccounted=0 surplus=0u conversion=100%', 'loot ledger: mined=1011 banked=754 smelted=2 pocket=495u/168s accounted=1251 unaccounted=0 surplus=240u conversion=123.7%'])
  assert.equal(c.loot.mined, 1011)
})

// (v0.387.0) THE DELIVERABLE CENSUS - the v0.385.0 arm's cause line, the
// priced numbers verbatim from the fleet19.mjs print template. Face 19's
// verbatim battery doubles as the pre-arm baseline (the null IS the
// baseline - the tree predates the arm).
const CLAMP_LINE = 'F3 bank trip: deliverable (clamp) - fleet pocket 495u at 0.3u/s needs 1654s vs 300s the final bank can never grant - the surplus must ride now - the trip fires early'
const CLOCK_LINE = 'F5 bank trip: deliverable (clock) - fleet pocket 120u at 0.5u/s needs 240s vs 1800s the run cannot drain in the time left - the trip fires early'

test('deliverable cause line parsed - the clamp term (the structural one)', () => {
  assert.deepEqual(parseDeliverable(CLAMP_LINE), { bot: 'F3', term: 'clamp', pocketU: 495, rateUPerS: 0.3, needS: 1654, limitS: 300, tail: 'the final bank can never grant - the surplus must ride now' })
})

test('deliverable cause line parsed - the clock term (the temporal one)', () => {
  assert.deepEqual(parseDeliverable(CLOCK_LINE), { bot: 'F5', term: 'clock', pocketU: 120, rateUPerS: 0.5, needS: 240, limitS: 1800, tail: 'the run cannot drain in the time left' })
})

test('the gate\'s own ? prints parse as nulls (the partial-entry law)', () => {
  const q = parseDeliverable('F7 bank trip: deliverable (clock) - fleet pocket 80u at ?u/s needs ?s vs ?s the run cannot drain in the time left - the trip fires early')
  assert.deepEqual(q, { bot: 'F7', term: 'clock', pocketU: 80, rateUPerS: null, needS: null, limitS: null, tail: 'the run cannot drain in the time left' })
})

test('deliverable aggregate: the events count, the term split, the worst priced deficit', () => {
  const c = bankFlowCensus([CLAMP_LINE, CLOCK_LINE, 'F9 bank trip: deliverable (clamp) - fleet pocket 60u at 1.2u/s needs 50s vs 30s the final bank can never grant - the surplus must ride now - the trip fires early'])
  assert.equal(c.deliverable.fires, 3)
  assert.equal(c.deliverable.clampFires, 2)
  assert.equal(c.deliverable.clockFires, 1)
  assert.deepEqual(c.deliverable.bots, ['F3', 'F5', 'F9'])
  assert.equal(c.deliverable.maxNeedS, 1654)
  assert.equal(c.deliverable.minLimitS, 30)
  assert.equal(c.deliverable.worstDeficitS, 1354)
  assert.equal(c.deliverable.events.length, 3)
})

// (v0.390.0) THE BANKABLE FORMS - the wiring's new verbatim templates ride
// beside the legacy forms (the optional-prefix alternation, the capture grid
// unchanged): 'fleet bankable pocket Nu (raw Mu)' lands the priced pocket in
// the same group, the raw rides the line visibly.
const BANKABLE_BUDGET_LINE = 'F8 final bank budget: flow-priced 1834s (fleet bankable pocket 550u (raw 933u) at 0.3u/s needs 1834s) - the static 248s covered only the fast flows - the tail burst (78s, 118u, 67% of the window\'s delta) is not a rate - priced at the ex-burst 0.3u/s - clamped to 300s (the kill margin)'
const BANKABLE_DELIVERABLE_LINE = 'F3 bank trip: deliverable (clamp) - fleet bankable pocket 304u (raw 495u) at 0.3u/s needs 1014s vs 300s the final bank can never grant - the surplus must ride now - the trip fires early'

test('the bankable budget form parses with the capture grid unchanged (the priced pocket lands in m[3])', () => {
  const c = bankFlowCensus([BANKABLE_BUDGET_LINE])
  assert.equal(c.budgets.length, 1)
  assert.equal(c.budgets[0].bot, 'F8')
  assert.equal(c.budgets[0].flowPricedS, 1834)
  assert.equal(c.budgets[0].pocketUnits, 550)
  assert.equal(c.budgets[0].rateUPerS, 0.3)
  assert.equal(c.budgets[0].needsS, 1834)
  assert.equal(c.budgets[0].staticS, 248)
  assert.deepEqual(c.budgets[0].burst, { spanS: 78, deltaU: 118, pct: 67, exBurstRate: 0.3 })
  assert.equal(c.budgets[0].grantedS, 300)
  assert.equal(c.budgets[0].clamped, true)
})

test('the bankable deliverable form parses - the raw rides the line, the priced pocket parses', () => {
  assert.deepEqual(parseDeliverable(BANKABLE_DELIVERABLE_LINE), { bot: 'F3', term: 'clamp', pocketU: 304, rateUPerS: 0.3, needS: 1014, limitS: 300, tail: 'the final bank can never grant - the surplus must ride now' })
})

test('the legacy face-19 verbatim forms still parse after the alternation (both faces readable forever)', () => {
  const c = bankFlowCensus(F19)
  assert.equal(c.budgets.length, 4)
  assert.equal(c.budgets[0].pocketUnits, 933)
  assert.equal(c.budgets[3].pocketUnits, 819)
  assert.deepEqual(parseDeliverable(CLAMP_LINE), { bot: 'F3', term: 'clamp', pocketU: 495, rateUPerS: 0.3, needS: 1654, limitS: 300, tail: 'the final bank can never grant - the surplus must ride now' })
})

test('the 6th label form never parses as an event (the $ anchor: the cause line ends at the trip fires early)', () => {
  assert.equal(parseDeliverable('F3 bank trip: deliverable budget 300s'), null)
  assert.equal(parseDeliverable(CLAMP_LINE + ' now'), null)
  assert.equal(parseDeliverable('F3 bank trip: deliverable (clamp) - fleet pocket 495u'), null)
  assert.equal(parseDeliverable('F3 bank trip: planned budget 300s - the trip fires early'), null)
  assert.equal(parseDeliverable(null), null)
  assert.equal(parseDeliverable(42), null)
})

test('face-19 baseline: the pre-arm tree speaks nothing (deliverable null)', () => {
  const c = bankFlowCensus(F19)
  assert.equal(c.deliverable, null)
})

test('the missing-block tolerance covers the deliverable field', () => {
  const c = bankFlowCensus(['boom'])
  assert.equal(c.deliverable, null)
})

// (v0.612.0) THE WHY TAIL - the emitter's v0.553.0 row rides the class
// ('F16 214u/16s timeout') and the v0.382.0 anchored regex dropped every
// suffixed entry: the mining read saw 141u of fleet 37191475285's 552u
// crater (25.5%) and lost ALL reasons. The tail rides the emitter's own
// token law; the bare form stays byte-equal.
test('write-off why tail: the mined face parses WHOLE (fleet 37191475285, 4 of 4 entries)', () => {
  const entries = parseWriteOff('F16 214u/16s timeout, F17 141u/25s, F10 131u/19s doom-latched, F2 66u/16s timeout (the deadline pocket rode unbanked)')
  assert.deepEqual(entries, [
    { bot: 'F16', units: 214, seconds: 16, why: 'timeout' },
    { bot: 'F17', units: 141, seconds: 25 },
    { bot: 'F10', units: 131, seconds: 19, why: 'doom-latched' },
    { bot: 'F2', units: 66, seconds: 16, why: 'timeout' },
  ])
})

test('write-off why tail: the bare form stays byte-equal (the why key rides only when present)', () => {
  assert.deepEqual(parseWriteOff('F1 102u/15s, F13 65u/14s (the deadline pocket rode unbanked)'), [{ bot: 'F1', units: 102, seconds: 15 }, { bot: 'F13', units: 65, seconds: 14 }])
  // the v0.553.0 night face: the why rides a single clean token
  assert.deepEqual(parseWriteOff('F15 205u/12s night'), [{ bot: 'F15', units: 205, seconds: 12, why: 'night' }])
})

test('write-off why tail: dirty tails are junk lines, not reads (the emitter own token law)', () => {
  // the emitter filters to /^[a-z0-9-]+$/ - a dirty tail cannot come from it
  assert.deepEqual(parseWriteOff('F1 102u/15s TIMEOUT!'), [])
  assert.deepEqual(parseWriteOff('F1 102u/15s wet wall'), []) // multi-word is not one token
  // the dash sits INSIDE the emitter's own class - a '-' tail would ride the
  // row itself, so the parser mirrors it honestly (junk in, junk out)
  assert.deepEqual(parseWriteOff('F1 102u/15s -'), [{ bot: 'F1', units: 102, seconds: 15, why: '-' }])
})

test('write-off why mass: the census aggregates the crater per class (the v0.583.0 unnamed law)', () => {
  const c = bankFlowCensus([
    'loot ledger: mined=3226 banked=1982 smelted=57 pocket=791u/139s accounted=2830 unaccounted=396 surplus=0u conversion=87.7%',
    'final write-off: F16 214u/16s timeout, F17 141u/25s, F10 131u/19s doom-latched, F2 66u/16s timeout (the deadline pocket rode unbanked)',
  ])
  assert.equal(c.writeOff.length, 4)
  assert.deepEqual(c.writeOffWhys, { units: 552, byClass: { timeout: 280, unnamed: 141, 'doom-latched': 131 } })
})

test('write-off why mass: tolerance stays honest (no write-off line reads null, the bare row reads the unnamed bucket)', () => {
  assert.equal(bankFlowCensus(['boom']).writeOffWhys, null)
  assert.deepEqual(bankFlowCensus([]).writeOffWhys, null)
  const bare = bankFlowCensus(['final write-off: F1 102u/15s (the deadline pocket rode unbanked)'])
  assert.deepEqual(bare.writeOffWhys, { units: 102, byClass: { unnamed: 102 } })
})

// ---- (v0.645.0) THE PRE-POSITION'S OWN CENSUS - the seat's conversion row ----
// Face 37239853197 (the v0.644.0 fleet): the walk-home seat armed 10 bots,
// landed 3 (+378u: F2 +114, F4 +187, F12 +77), and the failed class rode the
// deadline (F19's 231u whale) while the arm census still read the seat's bots
// 'never armed'. The wiring now speaks the row; the parser reads it byte for
// byte (the blind-tool lesson's own shape).

test('pre-position census parsed (the seat\'s own conversion, the fed face)', () => {
  const e = parsePrePositionCensus('pre-position census: armed 10, landed 3 (+378u), failed 3 (top why: chest unreachable x2) - the seat\'s own delivery, first priced')
  assert.deepEqual(e, { armed: 10, landed: 3, landedUnits: 378, failed: 3, topWhy: 'chest unreachable', topWhyCount: 2 })
})

test('pre-position census: the bare failed face (no top why rides)', () => {
  const e = parsePrePositionCensus('pre-position census: armed 2, landed 1 (+114u), failed 1 - the seat\'s own delivery, first priced')
  assert.deepEqual(e, { armed: 2, landed: 1, landedUnits: 114, failed: 1 })
})

test('pre-position census: the all-landed face (failed 0, no top why)', () => {
  const e = parsePrePositionCensus('pre-position census: armed 3, landed 3 (+378u), failed 0 - the seat\'s own delivery, first priced')
  assert.deepEqual(e, { armed: 3, landed: 3, landedUnits: 378, failed: 0 })
})

test('pre-position census: junk reads null (the parser never invents)', () => {
  assert.equal(parsePrePositionCensus(null), null)
  assert.equal(parsePrePositionCensus(42), null)
  assert.equal(parsePrePositionCensus(undefined), null)
  assert.equal(parsePrePositionCensus('pre-position census: armed x, landed 3 (+1u), failed 0 - the seat\'s own delivery, first priced'), null)
  // the arm census row is a different family - never a pre-position read
  assert.equal(parsePrePositionCensus('bank arm census: 12 bot(s) never armed a bank pass - their end pockets carried 633u (top F19=227u) - the arms\' silence is the face\'s own read'), null)
  // the imagined suffix is a junk line (the anatomy law)
  assert.equal(parsePrePositionCensus('pre-position census: armed 10, landed 3 (+378u), failed 3 (top why: chest unreachable x2) - the seat\'s own delivery, first priced BOOM'), null)
})

// ---- (v0.648.0) THE CLIMB-OUT'S OWN SPLIT - the tail rides the anatomy ----
// Face 37243173708 (the v0.645.0 fleet): the census spoke for the first time
// ('armed 17, landed 0 (+0u), failed 42 (top why: surface refused x31)') and
// the split had to be hand-mined from the climb-out lines (stalled x17 is
// the front, the wet x10 the second - the two fronts price different cures).
// The row now carries the split itself ('; climb-outs: ...' inside the
// top-why parens); the parser reads both forms forever.

test('pre-position census: the climb-out split rides the fed face (the storm anatomy verbatim)', () => {
  const e = parsePrePositionCensus('pre-position census: armed 17, landed 0 (+0u), failed 42 (top why: surface refused x31; climb-outs: stalled x17, wet-sentinel x5, low-o2 x4, timeout x2, rescue x1, stopped x1, wet wall x1) - the seat\'s own delivery, first priced')
  assert.deepEqual(e, {
    armed: 17, landed: 0, landedUnits: 0, failed: 42,
    topWhy: 'surface refused', topWhyCount: 31,
    climbOuts: [
      { kind: 'stalled', count: 17 },
      { kind: 'wet-sentinel', count: 5 },
      { kind: 'low-o2', count: 4 },
      { kind: 'timeout', count: 2 },
      { kind: 'rescue', count: 1 },
      { kind: 'stopped', count: 1 },
      { kind: 'wet wall', count: 1 }
    ]
  })
})

test('pre-position census: the tail-less face parses exactly as before (the capture grid unchanged)', () => {
  const e = parsePrePositionCensus('pre-position census: armed 17, landed 0 (+0u), failed 42 (top why: surface refused x31) - the seat\'s own delivery, first priced')
  assert.deepEqual(e, { armed: 17, landed: 0, landedUnits: 0, failed: 42, topWhy: 'surface refused', topWhyCount: 31 })
  assert.ok(!('climbOuts' in e), 'no climb refusals, no tail key (the healthy silence)')
  // the split beside a non-climb top why rides the same shape (the front named, the climb priced beside it)
  const e2 = parsePrePositionCensus('pre-position census: armed 4, landed 1 (+60u), failed 8 (top why: chest unreachable x5; climb-outs: stalled x3) - the seat\'s own delivery, first priced')
  assert.deepEqual(e2, {
    armed: 4, landed: 1, landedUnits: 60, failed: 8,
    topWhy: 'chest unreachable', topWhyCount: 5,
    climbOuts: [{ kind: 'stalled', count: 3 }]
  })
})

test('pre-position census: the malformed tail is a junk line (the parser never invents)', () => {
  // an entry without its xN count is junk - the whole row reads null
  assert.equal(parsePrePositionCensus('pre-position census: armed 17, landed 0 (+0u), failed 42 (top why: surface refused x31; climb-outs: stalled 17) - the seat\'s own delivery, first priced'), null)
  // a semicolon inside the top-why text cannot ride (the emitter\'s vocabulary never carries one)
  assert.equal(parsePrePositionCensus('pre-position census: armed 17, landed 0 (+0u), failed 42 (top why: surface; refused x31) - the seat\'s own delivery, first priced'), null)
  // an imagined tail suffix is junk (the anatomy law)
  assert.equal(parsePrePositionCensus('pre-position census: armed 17, landed 0 (+0u), failed 42 (top why: surface refused x31; climb-outs: stalled x17) - the seat\'s own delivery, first priced BOOM'), null)
  // a truncated tail (no closing paren before the row\'s own suffix) is junk
  assert.equal(parsePrePositionCensus('pre-position census: armed 17, landed 0 (+0u), failed 42 (top why: surface refused x31; climb-outs: stalled x17 BOOM'), null)
})

// (v0.682.0) THE CRATER VERDICT RIDE - the fleet's own v0.317.0 decode
// printed the verdict; the mining lens carries it now. Byte-exact: the
// 23rd flight's (37419141731) real crater line - the bank silence's NAME.
test('bank-census: the crater verdict rides verbatim (the 23rd flight byte-exact)', () => {
  const c = bankFlowCensus([
    'loot ledger: mined=985 banked=0 smelted=1 pocket=761u/54s accounted=762 unaccounted=223 surplus=0u conversion=77.4%',
    'banked crater decode: crater: 0.0% of the endgame loot reached chests (banked 0 of 761u) - the bank chains are the bottleneck, the mines are not'
  ])
  assert.deepEqual(c.crater, {
    sharePct: 0, banked: 0, mass: 761,
    tail: 'the bank chains are the bottleneck, the mines are not'
  })
})

test('bank-census: the crater verdict - the last line wins, junk never invents', () => {
  // two craters in one face: the later print carries the fuller count
  const c = bankFlowCensus([
    'banked crater decode: crater: 11.0% of the endgame loot reached chests (banked 83 of 754u) - the bank chains are the bottleneck, the mines are not',
    'banked crater decode: crater: 4.2% of the endgame loot reached chests (banked 30 of 714u) - the bank chains are the bottleneck, the mines are not'
  ])
  assert.equal(c.crater.sharePct, 4.2)
  assert.equal(c.crater.banked, 30)
  assert.equal(c.crater.mass, 714)
  // a healthy share prints nothing fleet-side -> the census reads null (honest silence, never invented)
  const healthy = bankFlowCensus(['loot ledger: mined=100 banked=60 smelted=0 pocket=40u/3s accounted=100 unaccounted=0 surplus=0u conversion=100.0%'])
  assert.equal(healthy.crater, null)
  // junk battery: a renamed decode, a truncated pair, a non-string - all null
  const junk = bankFlowCensus([
    'banked crater decode: craterface: 0.0% of the endgame loot reached chests (banked 0 of 761u) - no',
    'banked crater decode: crater: 0.0% of the endgame loot reached chests (banked 0 of ) - no',
    42, null
  ])
  assert.equal(junk.crater, null)
})

// (v0.686.0) THE BANK YIELD DIAL - the mass each visit-line carried: the
// ratio that moved between faces 23/24/25 (0.0 -> 2.8 -> 11.3). Pure
// arithmetic over the two existing counters; the silence law holds.

import { bankYield } from '../../src/lib/bankcensus.mjs'

test('bank yield: the 24th byte-exact - the partial heal priced (316u over 112 visit-lines)', () => {
  assert.deepEqual(bankYield(316, 112), { banked: 316, visits: 112, rateUPerVisit: 2.8, silent: false })
})

test('bank yield: the 25th byte-exact - the alive bank priced (1768u over 156 visit-lines)', () => {
  assert.deepEqual(bankYield(1768, 156), { banked: 1768, visits: 156, rateUPerVisit: 11.3, silent: false })
})

test('bank yield: banked 0 over a live lane is the finding, not silence (the 23rd shape)', () => {
  assert.deepEqual(bankYield(0, 120), { banked: 0, visits: 120, rateUPerVisit: 0, silent: true })
})

test('bank yield: no bank lane (or junk) reads null - the rate never invents itself', () => {
  assert.equal(bankYield(5, 0), null)
  assert.equal(bankYield(null, 10), null)
  assert.equal(bankYield(316, -1), null)
  assert.equal(bankYield('316', 112), null)
})

test('WIRING: the decompose prints the bank yield row beside the visit count', () => {
  const src = fs.readFileSync(new URL('../../scripts/fleet-mining/decompose.mjs', import.meta.url), 'utf8')
  assert.match(src, /bank yield: \$\{bankYieldRow\.rateUPerVisit\}u\/visit/, "the dial prints in the BANK / DEPOSIT block")
  assert.match(src, /THE SILENT BANK/, "the 23rd's own finding names itself")
})

import fs from 'node:fs'
import { readFile } from 'node:fs/promises'

// (v0.758.0) THE CRATER'S OWN SEATS - face 63's own cell: the write-off
// carried 905u of the 1216u unbanked mass (the 2/3 bar crossed -> the
// failed-walks seat), night owns the failed mass under the strict-majority
// law, the fleet's own why tail agreed (67.6%).
test('v0.758.0 the crater seat: face 63\'s own cell (the failed walks own the crater, night owns the failed mass)', () => {
  const FACE63 = [
    'loot ledger: mined=1558 banked=494 smelted=18 pocket=1216u/224s accounted=1728 unaccounted=0 surplus=170u conversion=110.9%',
    'banked crater decode: crater: 28.9% of the endgame loot reached chests (banked 494 of 1710u) - the bank chains are the bottleneck, the mines are not',
    'final write-off: F9 177u/16s night, F16 166u/14s timeout, F15 140u/14s night, F6 127u/10s wet-sentinel, F3 113u/15s night, F18 99u/16s night, F12 83u/16s night (the deadline pocket rode unbanked)',
    'bank flow: 1.7u/s (banked +482u over 288s) - the 1216u pocket needs 727s past the deadline',
  ]
  const c = bankFlowCensus(FACE63)
  const s = craterSeatSplit(c)
  assert.equal(s.unbanked, 1216)
  assert.equal(s.writeOff.sum, 905)
  assert.equal(s.writeOff.rows, 7)
  assert.equal(s.writeOffShare, 0.744)
  assert.equal(s.cls, 'failed-walks')
  assert.deepEqual(s.topWhy, { cls: 'night', units: 612, shareOfWriteOff: 0.676 })
  assert.equal(s.heldPocket, 1216)
  assert.equal(s.deadlineSeconds, 727)
})

// (v0.758.0) the WIRING assert: bankFlowCensus computes seatSplit with the
// same one truth; face 64's own read is the honest silence (no crater
// decode line rode the log - banked 1224 of 2423, the decode held it).
test('v0.758.0 the seat rides the census return additively (WIRING) + face 64\'s honest silence', () => {
  const FACE63 = [
    'loot ledger: mined=1558 banked=494 smelted=18 pocket=1216u/224s accounted=1728 unaccounted=0 surplus=170u conversion=110.9%',
    'banked crater decode: crater: 28.9% of the endgame loot reached chests (banked 494 of 1710u) - the bank chains are the bottleneck, the mines are not',
    'final write-off: F9 177u/16s night, F16 166u/14s timeout (the deadline pocket rode unbanked)',
  ]
  const c = bankFlowCensus(FACE63)
  assert.deepEqual(c.seatSplit, craterSeatSplit(c))
  const FACE64 = [
    'loot ledger: mined=2423 banked=1224 smelted=55 pocket=1115u/218s accounted=2394 unaccounted=29 surplus=0u conversion=98.8%',
    'bank flow: 3.8u/s (banked +1087u over 285s) - the 1115u pocket needs 293s past the deadline',
  ]
  const c64 = bankFlowCensus(FACE64)
  assert.equal(c64.crater, null)
  assert.equal(c64.seatSplit, null)
})

// (v0.758.0) the open-pocket seat (the mass mostly never attempted) + the
// tie law (a tie owns nothing - the storm-has-no-seat precedent).
test('v0.758.0 the open-pocket seat + the tie owns nothing', () => {
  const LINES = [
    'loot ledger: mined=1000 banked=200 smelted=0 pocket=800u/50s accounted=1000 unaccounted=0 surplus=0u conversion=100.0%',
    'banked crater decode: crater: 20.0% of the endgame loot reached chests (banked 200 of 1000u) - the chains never came',
    'final write-off: F1 50u/10s night, F2 50u/10s timeout (the deadline pocket rode unbanked)',
  ]
  const s = craterSeatSplit(bankFlowCensus(LINES))
  assert.equal(s.cls, 'open-pocket')
  assert.equal(s.topWhy, null)
  assert.equal(s.deadlineSeconds, null)
})

// (v0.758.0) the junk battery: the seats never invent from junk, the junk
// write-off rows are counted and skipped (never priced, never dropped
// silently at the seat read).
test('v0.758.0 the seat junk battery', () => {
  assert.equal(craterSeatSplit(null), null)
  assert.equal(craterSeatSplit('junk'), null)
  assert.equal(craterSeatSplit({}), null)
  assert.equal(craterSeatSplit({ crater: { sharePct: 28.9, banked: 494, mass: 1710 } }), null)
  assert.equal(craterSeatSplit({ crater: { banked: 1710, mass: 1710 }, loot: { pocketUnits: 0 } }), null)
  assert.equal(craterSeatSplit({ crater: { banked: -1, mass: 1710 }, loot: {} }), null)
  assert.equal(craterSeatSplit({ crater: { banked: 494, mass: 'x' }, loot: {} }), null)
  const s = craterSeatSplit({
    crater: { sharePct: 20, banked: 200, mass: 1000 },
    loot: { pocketUnits: 800 },
    flow: { secondsPastDeadline: Number.NaN },
    writeOff: [{ bot: 'F1', units: 700, why: 'night' }, { bot: 'F2', units: Number.NaN }, null, 'junk', { bot: 'F3', units: -5 }],
  })
  assert.equal(s.writeOff.sum, 700)
  assert.equal(s.writeOff.rows, 1)
  assert.equal(s.writeOff.badRows, 4)
  assert.equal(s.cls, 'failed-walks')
  assert.equal(s.deadlineSeconds, null)
})

// (v0.777.0) THE WRITE-OFF'S OWN CAST - the write-off book's bot-level seat.
// The census's own writeOff cells are the book (zero re-parsing); the bill's
// strict-majority law, the riders' top-two measure, the junk battery.

test("v0.777.0 the write-off's own cast: the bill's solo owner fires under the strict-majority law", () => {
  // face 72's own printed book (run 37632243441): F9 154u/17s, F7 64u/17s
  const book = [{ bot: 'F9', units: 154, seconds: 17 }, { bot: 'F7', units: 64, seconds: 17 }]
  const bill = writeOffBill(book)
  assert.deepEqual(bill, { bot: 'F9', units: 154, total: 218, share: 0.706 })
  assert.equal(
    writeOffBillRow(bill),
    "the write-off's own cast (v0.777.0): F9 owns 154 of 218u (70.6%) - THE POCKET'S OWN SOLO SPENDER: one bot's own pocket carried the deadline's collection - the crater's own seat (v0.758.0) prices the mass, the cast names its owner"
  )
})

test("v0.777.0 face 73's own cell: the five-holder book reads the riders' measure (the bill's tie law held)", () => {
  // face 73's own printed book (run 37639051812): F2 261u/19s, F5 154u/19s,
  // F11 120u/13s, F19 106u/14s, F7 106u/14s - 747u, no solo majority.
  const book = [
    { bot: 'F2', units: 261, seconds: 19 }, { bot: 'F5', units: 154, seconds: 19 },
    { bot: 'F11', units: 120, seconds: 13 }, { bot: 'F19', units: 106, seconds: 14 },
    { bot: 'F7', units: 106, seconds: 14 },
  ]
  assert.equal(writeOffBill(book), null) // 261 <= 747-261 - the tie law held
  const riders = writeOffRiders(book)
  assert.deepEqual(riders, { leader: 'F2', leaderUnits: 261, runner: 'F5', runnerUnits: 154, total: 747, pairUnits: 415, share: 0.556 })
  assert.equal(
    writeOffRidersRow(riders),
    "the write-off's own riders (v0.777.0): no solo holder owns the majority - F2 x261u + F5 x154u own 415 of 747u (55.6%) - THE DUO'S OWN SEAT: the bill's tie law held, the concentration is still real - the pair prices the pockets the solo law refused to name"
  )
})

test("v0.777.0 the deterministic order rides the real census: units desc, then the name's own", () => {
  // face 68's own printed book (run 37610367304): F2 171u, F19 70u, F17 67u,
  // F14 64u - the runner-up tie (F19 70 vs F17 67) is units-decided; the
  // byte-wise pin needs an equal pair: F17 67 == a synthetic F7 67? no - the
  // pin is the name's own when units tie: 'F17' < 'F7' byte-wise.
  const book = [{ bot: 'F7', units: 100, seconds: 15 }, { bot: 'F17', units: 100, seconds: 15 }, { bot: 'F2', units: 50, seconds: 15 }]
  assert.equal(writeOffBill(book), null) // the tied spread owns nothing
  const riders = writeOffRiders(book)
  assert.deepEqual(riders, { leader: 'F17', leaderUnits: 100, runner: 'F7', runnerUnits: 100, total: 250, pairUnits: 200, share: 0.8 })
  // face 70's own crowd (run 37624132784): the bill's silence held on seven holders
  const crowd = [
    { bot: 'F10', units: 181, seconds: 17 }, { bot: 'F13', units: 178, seconds: 15 }, { bot: 'F18', units: 166, seconds: 16 },
    { bot: 'F1', units: 143, seconds: 17 }, { bot: 'F19', units: 134, seconds: 16 }, { bot: 'F3', units: 132, seconds: 19 },
    { bot: 'F17', units: 96, seconds: 18 },
  ]
  assert.equal(writeOffBill(crowd), null) // 181 <= 1030-181
  assert.deepEqual(writeOffRiders(crowd), { leader: 'F10', leaderUnits: 181, runner: 'F13', runnerUnits: 178, total: 1030, pairUnits: 359, share: 0.349 })
})

test("v0.777.0 junk never invents the cast: the empty books, the malformed rows", () => {
  assert.equal(writeOffBill(null), null)
  assert.equal(writeOffBill(undefined), null)
  assert.equal(writeOffBill([]), null)
  assert.equal(writeOffBill('junk'), null)
  assert.equal(writeOffBill([{ bot: 'F1', units: 0 }, { bot: 'F2', units: -5 }, { bot: 'F3', units: Number.NaN }, null, 'junk']), null) // the dead cells never cast
  const solo = writeOffBill([{ bot: 'F1', units: 5 }]) // the solo holder IS the strict majority (5 > 5-5)
  assert.deepEqual(solo, { bot: 'F1', units: 5, total: 5, share: 1 })
  assert.equal(writeOffRiders([{ bot: 'F1', units: 5 }]), null) // fewer than two holders
  assert.equal(writeOffBillRow(null), null)
  assert.equal(writeOffBillRow({ bot: 'F1' }), null) // the malformed cell
  assert.equal(writeOffBillRow({ bot: 'F1', units: 10, total: 5, share: 2 }), null) // the units outran the book
  assert.equal(writeOffRidersRow(null), null)
  assert.equal(writeOffRidersRow({ leader: 'F1' }), null)
  assert.equal(writeOffRidersRow({ leader: 'F1', leaderUnits: 2, runner: 'F2', runnerUnits: 1, total: 1, pairUnits: 3, share: 3 }), null) // the pair outran the book
})

test("v0.777.0 the write-off's own cast rides the decompose mine (WIRING)", async () => {
  const src = await readFile(new URL('../../scripts/fleet-mining/decompose.mjs', import.meta.url), 'utf8')
  assert.ok(src.includes('writeOffBill, writeOffBillRow, writeOffRiders, writeOffRidersRow')) // the import
  assert.ok(src.includes('writeOffBill(bankCensus.writeOff)')) // the census's own cells, zero re-parsing
  const branch = src.indexOf('const woRow = woBill ? writeOffBillRow(woBill) : writeOffRidersRow(writeOffRiders(bankCensus.writeOff))')
  assert.ok(branch > 0) // the branch law's own shape: one row, never both
  const guard = src.indexOf("if (bankCensus.writeOff.length) {", src.indexOf('final write-off:'))
  assert.ok(guard > 0 && guard < branch) // the seat rides the book's own guard
})
