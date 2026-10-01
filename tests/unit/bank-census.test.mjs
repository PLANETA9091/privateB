// (v0.382.0) THE BANK-FLOW CENSUS - the end-phase bank lines are the walk-
// deliveries cure's priced evidence; the parser must read them byte for
// byte. Tests feed the face-19 (36802577873) verbatim lines, the junk
// battery, and the missing-block tolerance (a FATAL face truncates the end
// phase - the v0.358.0 lesson).
import { bankFlowCensus, parseSurplusItems, parseStranded, parseWriteOff, parseDoomWhy, parseDeliverable } from '../../src/lib/bankcensus.mjs'
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
