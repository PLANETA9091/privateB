// (v0.440.0) THE PLAN TOP NAMES - the deficits board gains its voice. The
// anonymous deficits row left face 28's stuck slot (157926/0, 0.0% for the
// whole face) nameless; the named board rides the same tick emission beside
// it (the deficits line byte-identical, one parser per emitter). These pins
// freeze the named-row parse, the tiling law (the deficits parser's own,
// inherited), the junk policy (the deficits line and the other lanes'
// shapes REJECTED here) and the census's seat math (the named stuck
// signature, the hand changes, the per-resource arcs).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PLAN_TOP_ROW_RE, parsePlanTopRow, planTopCensus } from '../../src/lib/plantop.mjs'

test('row parse: the verbatim named five-slot shape (the face-28 numbers as the fixture), the leading-whitespace variant, the float pct', () => {
  const r = parsePlanTopRow('   plan top: iron_ingot 157926/0 (0.0%) stick 90000/92 (0.1%) oak_planks 31860/70 (0.2%) stone 27420/101 (0.4%) coal 10725/94 (0.9%)')
  assert.ok(r && !r.bad)
  assert.strictEqual(r.slots.length, 5)
  assert.deepEqual(r.slots[0], { res: 'iron_ingot', required: 157926, have: 0, pct: 0.0 })
  assert.deepEqual(r.slots[2], { res: 'oak_planks', required: 31860, have: 70, pct: 0.2 })
  const bare = parsePlanTopRow('plan top: dirt 100/5 (5.0%) sand 80/12 (15.0%)')
  assert.ok(bare && !bare.bad)
  assert.strictEqual(bare.slots[0].res, 'dirt')
})

test('row parse: the plan resource key grammar - digits after the leading letter, the underscore, the numeric suffix', () => {
  const r = parsePlanTopRow('plan top: iron_ingot 10/1 (10.0%) block_of_raw_copper2 20/2 (10.0%) x 30/3 (10.0%)')
  assert.ok(r && !r.bad)
  assert.strictEqual(r.slots[1].res, 'block_of_raw_copper2')
  assert.strictEqual(r.slots[2].res, 'x')
})

test('row parse: the junk battery - the deficits line and the other lanes\' shapes are REJECTED', () => {
  assert.strictEqual(parsePlanTopRow('   deficits: 157926/0 (0.0%) 149380/0 (0.0%) 31860/0 (0.0%) 27420/0 (0.0%) 10725/0 (0.0%)'), null, 'the anonymous deficits row is ITS OWN lane (byte-identical forever)')
  assert.strictEqual(parsePlanTopRow('plan progress: 1/31 resources complete'), null, 'the plan progress row is its own lane')
  assert.strictEqual(parsePlanTopRow('t-120s alive=19/19 mined=100 map=2p/3ch banked=5 smelted=1 pocket=10u/2s | cobblestone:5'), null, 'the tick row is not a plan-top row')
  assert.strictEqual(parsePlanTopRow('plan top:'), null, 'a bare token with no entries does not match (.+ needs one char)')
  const nameless = parsePlanTopRow('plan top: 157926/0 (0.0%)')
  assert.ok(nameless && nameless.bad, 'a nameless entry matches the token but fails the tiling - bad, counted unparsed, never half-read')
  assert.strictEqual(parsePlanTopRow(null), null)
  assert.strictEqual(parsePlanTopRow(42), null)
})

test('row parse: the tiling law inherited - a two-space gap or trailing garbage flags bad, the parsed prefix survives', () => {
  const gap = parsePlanTopRow('plan top: dirt 100/5 (5.0%)  sand 80/12 (15.0%)')
  assert.ok(gap && gap.bad, 'two spaces = a gap of 2+ = bad')
  const trail = parsePlanTopRow('plan top: dirt 100/5 (5.0%) sand 80/12 (15.0%) and more')
  assert.ok(trail && trail.bad)
  assert.strictEqual(trail.slots.length, 2, 'the parsed prefix survives for the escape-hatch count')
  const garbage = parsePlanTopRow('plan top: 100 dirt/5 (5.0%)')
  assert.ok(garbage && garbage.bad)
})

test('census: the named stuck signature - ONE resource held the worst seat all face (face 28\'s shape, hand-counted)', () => {
  const rows = [
    '   plan top: iron_ingot 157926/0 (0.0%) stick 90000/92 (0.1%) oak_planks 31860/70 (0.2%) stone 27420/101 (0.4%) coal 10725/94 (0.9%)',
    '   plan top: iron_ingot 157926/0 (0.0%) stick 90000/92 (0.1%) oak_planks 31860/70 (0.2%) stone 27420/101 (0.4%) coal 10725/94 (0.9%)',
    '   plan top: iron_ingot 157926/14 (0.0%) stick 90000/98 (0.1%) oak_planks 31860/70 (0.2%) stone 27420/101 (0.4%) coal 10725/94 (0.9%)'
  ]
  const c = planTopCensus(rows)
  assert.strictEqual(c.rows, 3)
  assert.strictEqual(c.seat.firstName, 'iron_ingot')
  assert.strictEqual(c.seat.lastName, 'iron_ingot')
  assert.deepEqual(c.seat.distinctNames, ['iron_ingot'])
  assert.strictEqual(c.seat.handChanges, 0)
  assert.strictEqual(c.slotsPerRow.min, 5)
  assert.strictEqual(c.slotsPerRow.max, 5)
  const iron = c.byRes.iron_ingot
  assert.strictEqual(iron.n, 3)
  assert.strictEqual(iron.firstPct, 0.0)
  assert.strictEqual(iron.lastPct, 0.0)
  assert.strictEqual(iron.maxPct, 0.0)
  assert.strictEqual(iron.maxHave, 14, 'the have arc moves even while the pct floors at 0')
})

test('census: the seat changed hands - the board is stuck, not one resource (two names, one hand change)', () => {
  const rows = [
    'plan top: iron_ingot 100/0 (0.0%) stick 90/9 (10.0%)',
    'plan top: iron_ingot 100/0 (0.0%) stick 90/9 (10.0%)',
    'plan top: stick 90/9 (10.0%) iron_ingot 100/0 (0.0%)',
    'plan top: stick 90/9 (10.0%) iron_ingot 100/0 (0.0%)'
  ]
  const c = planTopCensus(rows)
  assert.strictEqual(c.rows, 4)
  assert.strictEqual(c.seat.firstName, 'iron_ingot')
  assert.strictEqual(c.seat.lastName, 'stick')
  assert.deepEqual(c.seat.distinctNames, ['iron_ingot', 'stick'])
  assert.strictEqual(c.seat.handChanges, 1, 'one occupancy change at row 3')
  const stick = c.byRes.stick
  assert.strictEqual(stick.n, 4, 'a resource keeps its arc across seat moves - it left slot 0, not the board')
  assert.strictEqual(stick.firstPct, 10.0)
})

test('census: the per-resource arc - the min/max pct span, the have floor/ceiling, three rows hand-counted', () => {
  const rows = [
    'plan top: coal 100/0 (0.0%) dirt 50/50 (100.0%)',
    'plan top: coal 100/10 (10.0%) dirt 50/50 (100.0%)',
    'plan top: coal 100/5 (5.0%) dirt 50/50 (100.0%)'
  ]
  const c = planTopCensus(rows)
  const coal = c.byRes.coal
  assert.strictEqual(coal.minPct, 0.0)
  assert.strictEqual(coal.maxPct, 10.0)
  assert.strictEqual(coal.lastPct, 5.0)
  assert.strictEqual(coal.minHave, 0)
  assert.strictEqual(coal.maxHave, 10)
})

test('census: the honest zeros - no rows reads nulls and empty sets, never zeros that lie; junk rows count unparsed and are EXCLUDED', () => {
  const empty = planTopCensus([])
  assert.strictEqual(empty.rows, 0)
  assert.strictEqual(empty.seat.firstName, null)
  assert.deepEqual(empty.seat.distinctNames, [])
  assert.strictEqual(empty.seat.handChanges, 0)
  assert.deepEqual(empty.byRes, {})
  assert.strictEqual(empty.slotsPerRow.min, null)
  const junk = planTopCensus(['plan top:', 'not a row at all', 'plan top: 99 garbage'])
  assert.strictEqual(junk.rows, 0)
  assert.strictEqual(junk.unparsed, 1, 'only the plan-top-SHAPED row that failed to tile counts - the other lines are other lanes')
  assert.strictEqual(junk.seat.firstName, null)
  const nonArray = planTopCensus('plan top: dirt 1/1 (100.0%)')
  assert.strictEqual(nonArray.rows, 0)
})

test('the regex pin: the token is the emitter\'s own and anchors the whole grammar', () => {
  assert.ok(PLAN_TOP_ROW_RE.test('   plan top: dirt 1/1 (100.0%)'))
  assert.ok(PLAN_TOP_ROW_RE.test('plan top: dirt 1/1 (100.0%)'))
  assert.ok(!PLAN_TOP_ROW_RE.test('   deficits: 1/1 (100.0%)'))
  assert.ok(!PLAN_TOP_ROW_RE.test('the plan top: of the morning'))
})

// (v0.442.0) THE FIELD REGRESSION: face 30 (36926711080) - the named board's
// first field read printed the JS-undefined token in every seat (the res key
// never rode the materialsProgress value). The grammar matched the token as
// an honest-looking name and the decompose built a fake named stuck
// signature out of the leak. The leak sentinels read bad - counted
// unparsed, the seat math never sees a fake name.
test('field regression (face 30): the verbatim undefined-leak row reads bad, the census counts it unparsed and keeps the seat math empty', () => {
  const leak = '   plan top: undefined 157926/0 (0.0%) undefined 149380/0 (0.0%) undefined 31860/0 (0.0%) undefined 27420/0 (0.0%) undefined 10725/0 (0.0%)'
  const r = parsePlanTopRow(leak)
  assert.ok(r && r.bad, 'the tiling matched but the leak sentinels refuse the row')
  assert.strictEqual(r.slots.length, 5, 'the parsed prefix survives for the escape-hatch count')
  const c = planTopCensus([leak, leak, leak])
  assert.strictEqual(c.rows, 0, 'no fake rows feed the math')
  assert.strictEqual(c.unparsed, 3, 'every leak row counts - the escape hatch screams')
  assert.strictEqual(c.seat.firstName, null, 'no fake name in the seat')
  assert.deepEqual(c.byRes, {}, 'no fake per-resource arcs')
})

test('leak sentinels: one undefined seat poisons the whole row; the literal null too; mixed healthy+leak reads bad', () => {
  const oneLeak = parsePlanTopRow('plan top: iron_ingot 100/0 (0.0%) undefined 90/9 (10.0%) stick 80/8 (10.0%)')
  assert.ok(oneLeak && oneLeak.bad, 'a single leaked seat is enough - the row is not half-trusted')
  const nullLeak = parsePlanTopRow('plan top: null 100/0 (0.0%) dirt 50/5 (10.0%)')
  assert.ok(nullLeak && nullLeak.bad, 'null is the same leak class')
  const trailingLeak = parsePlanTopRow('plan top: iron_ingot 100/0 (0.0%) stick 80/8 (10.0%) null 70/7 (10.0%)')
  assert.ok(trailingLeak && trailingLeak.bad, 'the leak in any seat poisons the row')
  const healthy = parsePlanTopRow('plan top: undefined_ingot 100/0 (0.0%) nullstone 50/5 (10.0%)')
  assert.ok(healthy && !healthy.bad, 'a resource key CONTAINING the sentinel words is a legal key - only the EXACT tokens leak')
  assert.strictEqual(healthy.slots[0].res, 'undefined_ingot')
  assert.strictEqual(healthy.slots[1].res, 'nullstone')
})

test('census: a healthy row after leak rows still feeds the math (the leak never blinds the board that did parse)', () => {
  const rows = [
    '   plan top: undefined 157926/0 (0.0%) undefined 149380/0 (0.0%)',
    '   plan top: iron_ingot 157926/0 (0.0%) stick 90000/92 (0.1%)'
  ]
  const c = planTopCensus(rows)
  assert.strictEqual(c.rows, 1)
  assert.strictEqual(c.unparsed, 1)
  assert.strictEqual(c.seat.firstName, 'iron_ingot')
  assert.ok(c.byRes.iron_ingot, 'the healthy row\'s arcs live')
})
