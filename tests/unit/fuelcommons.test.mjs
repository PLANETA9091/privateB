// THE FUEL COMMONS ASK LENS - tests. (v0.595.0) The commons' source strand's
// own instrument: three fleet verdicts named the front ('asked 5, delivered
// 0, dry 5', the tithe inflow 'attempted 2, delivered 0, dry 2', the pantry's
// bare row) and nobody's row read the ask's own lifecycle. The live anchor
// pins the face's mini-tallies (4 gate refusals at 27-33 levels, the dry
// chest, the budget deaths, the walk failure) and the full face's mixed
// verdict (37 outcomes across 15 bots: gate 4, dry 13, took 0, budget 16,
// walk-failed 3, open-failed 1 - the ask never ate). One parser per emitter
// (the v0.409.0 law): the walk mechanics stay the walk's own family.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  parseFuelCommonsAsk, fuelCommonsCensus, fuelCommonsRow, FUEL_ASK_SHARE,
  fuelCommonsDryScatterRow,
} from '../../src/lib/fuelcommons.mjs'

// the face's own shapes, byte for byte from fleet 37173632953's log
const FACE_GATE_A = 'F14 fuel commons: chest at [-116,73,405] the yard stands 30 levels up over 1b lateral - the walk ladder cannot climb, the ask rides (the tithe owns the deep resupply)'
const FACE_GATE_A_2 = 'F7 fuel commons: chest at [-126,73,413] the yard stands 33 levels up over 1b lateral - the walk ladder cannot climb, the ask rides (the tithe owns the deep resupply)'
const FACE_BUDGET = 'F14 fuel commons: budget spent (0/1 units)'
const FACE_WALKFAIL = 'F8 fuel commons: chest walk failed after the nudge (Took to long to decide path to goal!)'
const FACE_DRY = 'F7 fuel commons: chest holds no fuel'
// the emitter's own grammar (fuelbank.mjs): form B (the climb-fund's clock),
// the delivery, the no-chest, the anti-churn defer, the open failures
const SHAPE_GATE_B = 'F5 [F5] fuel commons: chest at [-120,71,400] the yard stands 24 levels up over 30b lateral - the ladder may route it but the slice cannot fund the climb (the walk asks 45s, the slice holds 12s) - the ask rides (the tithe owns the deep resupply)'
const SHAPE_TOOK = 'F2 [F2] fuel commons: took 7 units (5 x coal, 2 x oak_planks) from a yard chest'
const SHAPE_NOCHEST = 'F9 fuel commons: no yard chest in range'
const SHAPE_DEFER = 'F3 fuel commons: the ask defers (this stance came up dry 90s ago - the climb owns the depth, the tithe owns the refill, the clock re-arms the ask)'
const SHAPE_OPENFAIL = 'F11 fuel commons: open failed (open fuel chest: timeout after 10000ms)'
const SHAPE_OPENFAIL_DIG = 'F12 [F12] fuel commons: open failed after the cover dig (chest already destroyed)'

// the mini-face fixture (the seats' own tallies ride it)
const MINI = [
  FACE_GATE_A,
  'F4 fuel commons: chest at [-116,73,415] the yard stands 27 levels up over 12b lateral - the walk ladder cannot climb, the ask rides (the tithe owns the deep resupply)',
  FACE_GATE_A_2,
  'F9 fuel commons: chest at [-130,73,389] the yard stands 31 levels up over 13b lateral - the walk ladder cannot climb, the ask rides (the tithe owns the deep resupply)',
  FACE_BUDGET,
  'F8 fuel commons: budget spent (0/1 units)',
  FACE_WALKFAIL,
  'F13 [F13] fuel commons: chest holds no fuel',
]

test('parseFuelCommonsAsk: the gate\'s doom form reads bot, cell, levels, lateral', () => {
  assert.deepEqual(parseFuelCommonsAsk(FACE_GATE_A), {
    bot: 'F14', kind: 'gate',
    cell: { x: -116, y: 73, z: 405 },
    levels: 30, lateral: 1, gate: 'doom', walkS: null, sliceS: null,
  })
})

test('parseFuelCommonsAsk: the gate\'s clock form (the climb-fund) carries walk and slice clocks', () => {
  const r = parseFuelCommonsAsk(SHAPE_GATE_B)
  assert.equal(r.bot, 'F5')
  assert.equal(r.gate, 'clock')
  assert.equal(r.levels, 24)
  assert.equal(r.lateral, 30)
  assert.equal(r.walkS, 45)
  assert.equal(r.sliceS, 12)
})

test('parseFuelCommonsAsk: the delivery, the dry chest, the no-chest, the defer, the open failures', () => {
  assert.deepEqual(parseFuelCommonsAsk(SHAPE_TOOK), { bot: 'F2', kind: 'took', units: 7, what: '5 x coal, 2 x oak_planks' })
  assert.deepEqual(parseFuelCommonsAsk(FACE_DRY), { bot: 'F7', kind: 'dry' })
  assert.deepEqual(parseFuelCommonsAsk(SHAPE_NOCHEST), { bot: 'F9', kind: 'nochest' })
  const d = parseFuelCommonsAsk(SHAPE_DEFER)
  assert.equal(d.kind, 'defer')
  assert.equal(d.ageS, 90)
  const o = parseFuelCommonsAsk(SHAPE_OPENFAIL)
  assert.equal(o.kind, 'openfail')
  assert.equal(o.message, 'open fuel chest: timeout after 10000ms')
  assert.equal(parseFuelCommonsAsk(SHAPE_OPENFAIL_DIG).kind, 'openfail', 'the cover-dig form shares the kind')
  assert.deepEqual(parseFuelCommonsAsk(FACE_WALKFAIL), { bot: 'F8', kind: 'walkfail', message: 'Took to long to decide path to goal!' })
})

test('parseFuelCommonsAsk: the budget form reads taken and want', () => {
  assert.deepEqual(parseFuelCommonsAsk(FACE_BUDGET), { bot: 'F14', kind: 'budget', taken: 0, want: 1 })
})

test('parseFuelCommonsAsk: the outer bot name is the truth, the [bot] tag optional (the v0.590.0 law)', () => {
  assert.equal(parseFuelCommonsAsk('F7 fuel commons: chest holds no fuel').bot, 'F7')
  assert.equal(parseFuelCommonsAsk('F7 [F7] fuel commons: chest holds no fuel').bot, 'F7')
  assert.equal(parseFuelCommonsAsk('F7 [iron] fuel commons: chest holds no fuel').bot, 'F7')
})

test('parseFuelCommonsAsk: the junk battery - other families and the walk mechanics never parse', () => {
  for (const junk of [null, undefined, 42, '', 'plain line',
    'F15 [F15] chest skip (no path cached 0s ago at [-127,72,382])',
    'F18 [F18] chest skip (vertical doom: the yard stands 27 levels up over 3b lateral - the walk ladder cannot climb)',
    'F4 fuel commons: the anchor chest is read first',
    'F14 fuel commons: path nudge inside the direct envelope',
    'F8 fuel commons: the nudge spent the walk slice (-124ms left) - no re-goto clock',
    'F9 fuel commons: the cover dig stands down (not at the chest)']) {
    assert.equal(parseFuelCommonsAsk(junk), null)
  }
})

test('fuelCommonsCensus: the face\'s mini-tallies ride byte for byte', () => {
  const lines = [
    FACE_GATE_A, 'F4 fuel commons: chest at [-116,73,415] the yard stands 27 levels up over 12b lateral - the walk ladder cannot climb, the ask rides (the tithe owns the deep resupply)',
    FACE_GATE_A_2, 'F9 fuel commons: chest at [-130,73,389] the yard stands 31 levels up over 13b lateral - the walk ladder cannot climb, the ask rides (the tithe owns the deep resupply)',
    FACE_BUDGET, 'F8 fuel commons: budget spent (0/1 units)',
    FACE_WALKFAIL,
    'F13 [F13] fuel commons: chest holds no fuel',
  ]
  const c = fuelCommonsCensus(lines)
  assert.equal(c.n, 8)
  assert.deepEqual(c.byKind, { gate: 4, dry: 1, took: 0, budget: 2, nochest: 0, defer: 0, openfail: 0, walkfail: 1 })
  assert.equal(c.bots, 6)
  assert.deepEqual(c.levels, { n: 4, sum: 121, max: 33 })
  assert.equal(c.tookUnits, 0)
  assert.deepEqual({ taken: c.budgetTaken, want: c.budgetWant }, { taken: 0, want: 2 })
  assert.equal(c.unparsed, 0)
})

test('fuelCommonsCensus: the delivery and the budget sums tally', () => {
  const c = fuelCommonsCensus([SHAPE_TOOK, 'F3 fuel commons: took 2 units (2 x coal) from a yard chest',
    FACE_BUDGET, 'F9 fuel commons: budget spent (4/6 units)'])
  assert.equal(c.n, 4)
  assert.equal(c.tookUnits, 9)
  assert.deepEqual({ taken: c.budgetTaken, want: c.budgetWant }, { taken: 4, want: 7 })
})

test('fuelCommonsCensus: the torn member rides unparsed (the honest sweep)', () => {
  const c = fuelCommonsCensus([
    FACE_GATE_A,
    'F1 fuel commons: chest at [-116',
    'F2 fuel commons: took units (',
    'F3 fuel commons: budget spent (0/1',
  ])
  assert.equal(c.n, 1)
  assert.equal(c.unparsed, 3)
})

test('fuelCommonsCensus: the junk battery stays zero and the walk mechanics are not outcomes', () => {
  for (const junk of [null, undefined, 'string', [], [null, 42, '', FACE_DRY.replace('fuel commons', 'water commons')]]) {
    const c = fuelCommonsCensus(junk)
    assert.equal(c.n, 0)
    assert.equal(c.unparsed, 0)
  }
  const c = fuelCommonsCensus([
    'F4 fuel commons: the anchor chest is read first',
    'F14 fuel commons: path nudge inside the direct envelope',
    'F8 fuel commons: the nudge spent the walk slice (-124ms left) - no re-goto clock',
  ])
  assert.equal(c.n, 0)
  assert.equal(c.unparsed, 0, 'the walk mechanics are the walk\'s own family - never claimed')
})

test('fuelCommonsRow: the none form is a verdict too (the always-print law)', () => {
  assert.equal(fuelCommonsRow(null), 'fuel commons asks: none (the ask never spoke this run)')
  assert.equal(fuelCommonsRow(fuelCommonsCensus([])), 'fuel commons asks: none (the ask never spoke this run)')
  assert.equal(fuelCommonsRow({ n: 0, byKind: {}, bots: 0, tookUnits: 0 }), 'fuel commons asks: none (the ask never spoke this run)')
})

test('fuelCommonsRow: a delivery names the healthy face regardless of the other classes', () => {
  const c = fuelCommonsCensus([SHAPE_TOOK, FACE_BUDGET, FACE_DRY])
  assert.equal(fuelCommonsRow(c),
    'fuel commons asks: 3 outcome(s) across 3 bot(s) (took 7u from 1 ask(s), dry 1, gate 0, budget 1) - the ask feeds its bot - the source breathes')
})

test('fuelCommonsRow: the budget at the half boundary owns the face (the ask\'s own clock)', () => {
  const lines = [FACE_BUDGET, 'F8 fuel commons: budget spent (0/1 units)',
    'F9 fuel commons: budget spent (0/1 units)', 'F10 fuel commons: budget spent (0/1 units)',
    FACE_GATE_A, FACE_GATE_A_2, FACE_WALKFAIL, FACE_DRY]
  const c = fuelCommonsCensus(lines)
  assert.equal(c.n, 8)
  assert.equal(FUEL_ASK_SHARE, 0.5)
  assert.equal(fuelCommonsRow(c),
    'fuel commons asks: 8 outcome(s) across 5 bot(s) (took 0u from 0 ask(s), dry 1, gate 2, budget 4) - 4 asks spent their own clock - the ask\'s budget is the front')
})

test('fuelCommonsRow: the dry chests above the boundary name the source', () => {
  const lines = [FACE_DRY, 'F7 [F7] fuel commons: chest holds no fuel', 'F8 fuel commons: chest holds no fuel',
    FACE_BUDGET, FACE_WALKFAIL]
  const c = fuelCommonsCensus(lines)
  assert.equal(fuelCommonsRow(c),
    'fuel commons asks: 5 outcome(s) across 3 bot(s) (took 0u from 0 ask(s), dry 3, gate 0, budget 1) - 3 chests answered empty - the source is the front (the tithe owns the refill)')
})

test('fuelCommonsRow: the gate above the boundary prices the deep resupply\'s seat (the live anchor)', () => {
  const lines = [
    FACE_GATE_A, 'F4 fuel commons: chest at [-116,73,415] the yard stands 27 levels up over 12b lateral - the walk ladder cannot climb, the ask rides (the tithe owns the deep resupply)',
    FACE_GATE_A_2, 'F9 fuel commons: chest at [-130,73,389] the yard stands 31 levels up over 13b lateral - the walk ladder cannot climb, the ask rides (the tithe owns the deep resupply)',
    FACE_BUDGET, 'F8 fuel commons: budget spent (0/1 units)',
    FACE_WALKFAIL,
    'F13 [F13] fuel commons: chest holds no fuel',
  ]
  assert.equal(fuelCommonsRow(fuelCommonsCensus(lines)),
    'fuel commons asks: 8 outcome(s) across 6 bot(s) (took 0u from 0 ask(s), dry 1, gate 4, budget 2) - 4 asks met the walk ladder - the deep resupply\'s seat is priced')
})

test('fuelCommonsRow: the real face reads mixed - no class owns it, the shares are named', () => {
  const c = {
    n: 37,
    byKind: { gate: 4, dry: 13, took: 0, budget: 16, nochest: 0, defer: 0, openfail: 1, walkfail: 3 },
    bots: 15, levels: { n: 4, sum: 121, max: 33 },
    tookUnits: 0, budgetTaken: 0, budgetWant: 17, unparsed: 0,
  }
  assert.equal(fuelCommonsRow(c),
    'fuel commons asks: 37 outcome(s) across 15 bot(s) (took 0u from 0 ask(s), dry 13, gate 4, budget 16) - the outcomes read mixed (budget 43.2%, dry 35.1%) - no class owns the face')
})

test('fuelCommonsRow: below every boundary the mixed form names the actual top two shares', () => {
  const c = fuelCommonsCensus([FACE_BUDGET, FACE_DRY, FACE_WALKFAIL, 'F9 fuel commons: no yard chest in range',
    FACE_GATE_A, FACE_GATE_A_2, SHAPE_OPENFAIL])
  assert.equal(fuelCommonsRow(c),
    'fuel commons asks: 7 outcome(s) across 5 bot(s) (took 0u from 0 ask(s), dry 1, gate 2, budget 1) - the outcomes read mixed (gate 28.6%, budget 14.3%) - no class owns the face')
})


// (v0.596.0) THE ASK'S SEAT GRAIN - the outcomes' own owner map. The first
// seat read (fleet 37173632953): the budget deaths are SPREAD (13 bots,
// top F11=3, 18.8% - the slice is the fleet's front) and the dry deaths
// ride ONE SEAT (F7 holds 8 of 13, 61.5% - that seat's own walk is the cure).
import { fuelCommonsOwnerRow } from '../../src/lib/fuelcommons.mjs'

test('fuelCommonsCensus: the seats grow byBot per kind (additive, the class rows never move)', () => {
  const c = fuelCommonsCensus(MINI)
  assert.deepEqual(c.byBot, {
    F14: { n: 2, gate: 1, dry: 0, took: 0, budget: 1, nochest: 0, defer: 0, openfail: 0, walkfail: 0 },
    F4: { n: 1, gate: 1, dry: 0, took: 0, budget: 0, nochest: 0, defer: 0, openfail: 0, walkfail: 0 },
    F7: { n: 1, gate: 1, dry: 0, took: 0, budget: 0, nochest: 0, defer: 0, openfail: 0, walkfail: 0 },
    F9: { n: 1, gate: 1, dry: 0, took: 0, budget: 0, nochest: 0, defer: 0, openfail: 0, walkfail: 0 },
    F8: { n: 2, gate: 0, dry: 0, took: 0, budget: 1, nochest: 0, defer: 0, openfail: 0, walkfail: 1 },
    F13: { n: 1, gate: 0, dry: 1, took: 0, budget: 0, nochest: 0, defer: 0, openfail: 0, walkfail: 0 },
  })
})

test('fuelCommonsOwnerRow: the dominant death kind rides when none is named (ties name-asc)', () => {
  const c = fuelCommonsCensus(MINI)
  assert.equal(fuelCommonsOwnerRow(c),
    "ask seats (gate): 4 bot(s) carry 4 death(s) - top F14=1 (25.0%) - the deaths are spread (the slice is the fleet's front)")
})

test("fuelCommonsOwnerRow: the dry seats ride ONE SEAT above the boundary (the live anchor)", () => {
  const c = fuelCommonsCensus(MINI
    .concat(Array(8).fill('F7 fuel commons: chest holds no fuel'))
    .concat(Array(5).fill('F4 fuel commons: chest holds no fuel')))
  assert.equal(c.byKind.dry, 14, 'MINI already carries one dry chest (F13) - 8 + 5 + 1')
  assert.equal(fuelCommonsOwnerRow(c, 'dry'),
    "ask seats (dry): 3 bot(s) carry 14 death(s) - F7 holds 57.1% (8) - one seat owns the ask's deaths (that seat's own slice is the cure)")
})

test('fuelCommonsOwnerRow: a one-seat budget above the boundary names the seat (the live anchor)', () => {
  const c = fuelCommonsCensus(MINI.concat(Array(3).fill('F11 fuel commons: budget spent (0/1 units)')))
  assert.equal(fuelCommonsOwnerRow(c, 'budget'),
    "ask seats (budget): 3 bot(s) carry 5 death(s) - F11 holds 60.0% (3) - one seat owns the ask's deaths (that seat's own slice is the cure)")
})

test('fuelCommonsOwnerRow: the none forms are verdicts too (the always-print law)', () => {
  assert.equal(fuelCommonsOwnerRow(null), 'ask seats: none (no outcome ever spoke)')
  assert.equal(fuelCommonsOwnerRow(fuelCommonsCensus([])), 'ask seats: none (no outcome ever spoke)')
  const c = fuelCommonsCensus(MINI)
  assert.equal(fuelCommonsOwnerRow(c, 'defer'),
    'ask seats (defer): none (6 bot(s) spoke, the ask never died this way)')
  assert.equal(fuelCommonsOwnerRow(c, 'nochest'),
    'ask seats (nochest): none (6 bot(s) spoke, the ask never died this way)')
})

test("fuelCommonsOwnerRow: the deliveries are not deaths - took falls to the dominant kind", () => {
  const c = fuelCommonsCensus([SHAPE_TOOK, FACE_BUDGET])
  assert.equal(fuelCommonsOwnerRow(c, 'took'),
    "ask seats (budget): 1 bot(s) carry 1 death(s) - F14 holds 100.0% (1) - one seat owns the ask's deaths (that seat's own slice is the cure)")
})

test('fuelCommonsOwnerRow: the junk battery - junk seats never invent owners', () => {
  const c = { byBot: { F1: null, F2: 42, F3: { budget: -5 }, F4: { budget: 2 } } }
  assert.equal(fuelCommonsOwnerRow(c, 'budget'),
    "ask seats (budget): 1 bot(s) carry 2 death(s) - F4 holds 100.0% (2) - one seat owns the ask's deaths (that seat's own slice is the cure)")
  assert.equal(fuelCommonsOwnerRow({}), 'ask seats: none (no outcome ever spoke)')
  assert.equal(fuelCommonsOwnerRow({ byBot: {} }), 'ask seats: none (no outcome ever spoke)')
})

test('fuelCommonsOwnerRow: the boundary rides FUEL_ASK_SHARE exactly (0.5 trips)', () => {
  const c = fuelCommonsCensus([FACE_BUDGET, 'F8 fuel commons: budget spent (0/1 units)'])
  assert.equal(fuelCommonsOwnerRow(c, 'budget'),
    "ask seats (budget): 2 bot(s) carry 2 death(s) - F14 holds 50.0% (1) - one seat owns the ask's deaths (that seat's own slice is the cure)")
})

// ---------------------------------------------------------------------------
// (v0.599.0) THE DRY READ'S CHEST - the books' dry face closes on the cell.
// Fleet 37178311099's face: the tithe banked 28 x coal into [-108,71,407],
// the asks anchored [-108,71,401] and the sibling cells, the grain read
// 'asked 4, delivered 0, dry 4' - and every dry read was anonymous, so
// whether the filled chest ever got read is unanswerable. The emitter names
// its chest; the parser reads both faces; the census sums the scatter.
const NAMED_A = 'F18 fuel commons: chest holds no fuel at [-108,71,407]'
const NAMED_A_TAG = 'F3 [F3] fuel commons: chest holds no fuel at [-108,71,407]'
const NAMED_B = 'F6 fuel commons: chest holds no fuel at [-138,71,409]'
const NAMED_C = 'F4 fuel commons: chest holds no fuel at [-108,71,411]'
const NAMED_NEG = 'F9 fuel commons: chest holds no fuel at [-93,40,-396]'
const TORN_NAMED = 'F18 fuel commons: chest holds no fuel at [-108,71'

test("parseFuelCommonsAsk: the named dry face reads the chest it actually read (the v0.599.0 emitter's own template)", () => {
  assert.deepEqual(parseFuelCommonsAsk(NAMED_A), {
    bot: 'F18', kind: 'dry', chest: { x: -108, y: 71, z: 407 },
  })
  assert.deepEqual(parseFuelCommonsAsk(NAMED_A_TAG), {
    bot: 'F3', kind: 'dry', chest: { x: -108, y: 71, z: 407 },
  })
  assert.deepEqual(parseFuelCommonsAsk(NAMED_NEG), {
    bot: 'F9', kind: 'dry', chest: { x: -93, y: 40, z: -396 },
  })
})

test('parseFuelCommonsAsk: the bare legacy dry face stays byte for byte (the pre-0.599.0 record shape)', () => {
  assert.deepEqual(parseFuelCommonsAsk(FACE_DRY), { bot: 'F7', kind: 'dry' })
  assert.deepEqual(parseFuelCommonsAsk('F13 [F13] fuel commons: chest holds no fuel'), { bot: 'F13', kind: 'dry' })
})

test('parseFuelCommonsAsk: the junk battery - torn and garbage cells never parse', () => {
  assert.equal(parseFuelCommonsAsk(TORN_NAMED), null)
  assert.equal(parseFuelCommonsAsk('F18 fuel commons: chest holds no fuel at [a,b,c]'), null)
  assert.equal(parseFuelCommonsAsk('F18 fuel commons: chest holds no fuel at [-108,71,407] tail'), null)
  assert.equal(parseFuelCommonsAsk(null), null)
  assert.equal(parseFuelCommonsAsk(42), null)
})

test('fuelCommonsCensus: the named dry reads sum additively (dryNamed + dryByChest), the bare form cannot scatter', () => {
  const c = fuelCommonsCensus([NAMED_A, NAMED_A_TAG, NAMED_B, FACE_DRY])
  assert.equal(c.n, 4)
  assert.equal(c.byKind.dry, 4)
  assert.equal(c.dryNamed, 3)
  assert.deepEqual(c.dryByChest, { '-108,71,407': 2, '-138,71,409': 1 })
  const bare = fuelCommonsCensus([FACE_DRY, 'F13 [F13] fuel commons: chest holds no fuel'])
  assert.equal(bare.dryNamed, 0)
  assert.deepEqual(bare.dryByChest, {})
})

test('fuelCommonsCensus: the torn named line rides unparsed (the honest sweep holds)', () => {
  const c = fuelCommonsCensus([TORN_NAMED, 'F18 fuel commons: chest holds no fuel at [a,b,c]'])
  assert.equal(c.n, 0)
  assert.equal(c.unparsed, 2)
})

test('fuelCommonsDryScatterRow: one chest holds the half - that anchor is the cure', () => {
  const c = fuelCommonsCensus([NAMED_A, NAMED_A_TAG, NAMED_B])
  assert.equal(fuelCommonsDryScatterRow(c),
    'fuel commons dry reads: 3 named across 2 chest(s) (dry 3) - top [-108,71,407] x2 (66.7%) - one chest owns the dry (that anchor\'s own read is the cure)')
})

test('fuelCommonsDryScatterRow: the boundary rides FUEL_ASK_SHARE exactly (0.5 trips, ties ride cell-asc)', () => {
  const c = fuelCommonsCensus([NAMED_B, NAMED_A])
  assert.equal(fuelCommonsDryScatterRow(c),
    'fuel commons dry reads: 2 named across 2 chest(s) (dry 2) - top [-108,71,407] x1 (50.0%) - one chest owns the dry (that anchor\'s own read is the cure)')
})

test('fuelCommonsDryScatterRow: the reads scatter - the divergence itself is the front', () => {
  const c = fuelCommonsCensus([NAMED_A, NAMED_B, NAMED_C])
  assert.equal(fuelCommonsDryScatterRow(c),
    'fuel commons dry reads: 3 named across 3 chest(s) (dry 3) - top [-108,71,407] x1 (33.3%) - the dry reads scatter (the filled chest never read is the divergence\'s face)')
})

test('fuelCommonsDryScatterRow: the none forms are verdicts too (the always-print law)', () => {
  assert.equal(fuelCommonsDryScatterRow(null),
    'fuel commons dry reads: 0 dry, none named - the anonymous fleet cannot scatter (the pre-0.599.0 face)')
  assert.equal(fuelCommonsDryScatterRow(fuelCommonsCensus([])),
    'fuel commons dry reads: 0 dry, none named - the anonymous fleet cannot scatter (the pre-0.599.0 face)')
  assert.equal(fuelCommonsDryScatterRow(fuelCommonsCensus([FACE_DRY])),
    'fuel commons dry reads: 1 dry, none named - the anonymous fleet cannot scatter (the pre-0.599.0 face)')
  assert.equal(fuelCommonsDryScatterRow({}),
    'fuel commons dry reads: 0 dry, none named - the anonymous fleet cannot scatter (the pre-0.599.0 face)')
  assert.equal(fuelCommonsDryScatterRow({ byKind: { dry: 2 }, dryNamed: 1, dryByChest: { '[-108,71,407]': 0, junk: null } }),
    'fuel commons dry reads: 2 dry, none named - the anonymous fleet cannot scatter (the pre-0.599.0 face)')
})
