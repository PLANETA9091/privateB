// (v0.417.0) THE DEFICITS CLOCK - the plan's HARVEST side. The per-tick
// deficits row (fleet19's topDeficits: '   deficits: 100/5 (5.0%) ...' - five
// anonymous required/have (pct%) slots, the worst at index 0) stayed unread
// while the map-trip lens read the LAUNCH side. These pins freeze the row
// parse, the junk policy (one parser per emitter: the plan progress row and
// the map-trip lines REJECTED) and the census's board math (the slot-0 arc,
// the stuck signature, the ranking churn).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DEFICITS_ROW_RE, parseDeficitsRow, deficitsCensus } from '../../src/lib/deficitrow.mjs'

test('row parse: the verbatim five-slot shape, the leading-whitespace variant, the float pct and the zero have', () => {
  const r = parseDeficitsRow('   deficits: 100/5 (5.0%) 80/12 (15.0%) 60/30 (50.0%) 40/8 (20.0%) 20/2 (10.0%)')
  assert.ok(r && !r.bad)
  assert.strictEqual(r.slots.length, 5)
  assert.deepEqual(r.slots[0], { required: 100, have: 5, pct: 5.0 })
  assert.deepEqual(r.slots[2], { required: 60, have: 30, pct: 50.0 })
  const bare = parseDeficitsRow('deficits: 100/0 (0.0%) 80/12 (15.0%)')
  assert.ok(bare && !bare.bad)
  assert.deepEqual(bare.slots[0], { required: 100, have: 0, pct: 0.0 })
})

test('row parse: the junk battery - the other lanes\' shapes are REJECTED', () => {
  assert.strictEqual(parseDeficitsRow('plan progress: 1/31 resources complete'), null, 'the plan progress row is its own lane')
  assert.strictEqual(parseDeficitsRow('t-120s alive=19/19 mined=100 map=2p/3ch banked=5 smelted=1 pocket=10u/2s | cobblestone:5'), null, 'the tick row is not a deficits row')
  assert.strictEqual(parseDeficitsRow('F8 map trip: gravel'), null, 'the map-trip launch line is the maptrip lens\'s')
  assert.strictEqual(parseDeficitsRow('   BotName=12[cobblestone:5, coal:3] | ...'), null, 'the per-bot detail line')
  assert.strictEqual(parseDeficitsRow('deficits:'), null, 'a bare token with no entries is not a row')
  assert.strictEqual(parseDeficitsRow(null), null)
  assert.strictEqual(parseDeficitsRow(42), null)
})

test('row parse: a half-readable row flags bad - never silently half-read', () => {
  const r = parseDeficitsRow('   deficits: 100/5 (5.0%) garbage (12%)')
  assert.ok(r && r.bad)
  assert.strictEqual(r.slots.length, 1, 'the parsed prefix survives for the escape-hatch count')
})

test('census: the three-row accumulation - drift, distinct pct, the board churn (hand-counted)', () => {
  const c = deficitsCensus([
    '   deficits: 100/5 (5.0%) 80/12 (15.0%) 60/30 (50.0%) 40/8 (20.0%) 20/2 (10.0%)',
    'deficits: 100/6 (6.0%) 80/12 (15.0%) 60/30 (50.0%) 40/8 (20.0%) 20/2 (10.0%)',
    '   deficits: 100/5 (5.0%) 80/12 (15.0%) 60/30 (50.0%) 40/8 (20.0%) 20/2 (10.0%)'
  ])
  // hand-count: rows 3, slots 5..5. Slot-0 arc: 5.0 -> 6.0 -> 5.0 - firstPct
  // 5.0, lastPct 5.0, drift 0.0; have 5 -> 5; distinct pct {5.0, 6.0} = 2 (NOT
  // the stuck signature - the seat moved twice and came back); min 5.0.
  // Boards: [5,10,15,20,50], [6,10,15,20,50], [5,10,15,20,50] - distinct 2,
  // churn 1.
  assert.strictEqual(c.rows, 3)
  assert.deepEqual(c.slotsPerRow, { min: 5, max: 5 })
  assert.deepEqual([c.board.firstPct, c.board.lastPct, c.board.driftPct], [5.0, 5.0, 0])
  assert.deepEqual([c.board.firstHave, c.board.lastHave], [5, 5])
  assert.strictEqual(c.board.distinctPct0, 2)
  assert.strictEqual(c.board.minPct0, 5.0)
  assert.strictEqual(c.distinctBoards, 2)
  assert.strictEqual(c.unparsed, 0)
})

test('census: the stuck signature - one pct value at slot 0 all face', () => {
  const c = deficitsCensus([
    '   deficits: 200/4 (2.0%) 30/10 (33.3%)',
    '   deficits: 200/4 (2.0%) 30/11 (36.6%)',
    '   deficits: 200/4 (2.0%) 30/12 (40.0%)'
  ])
  // slot-0 pct never moved (2.0) - distinctPct0 = 1 = the STUCK signature -
  // while the SECOND slot climbed (the board churned: [2,33.3], [2,33.3,36.6]
  // wait - hand-count: row1 multiset {2,33.3}, row2 {2,33.3,36.6}, row3
  // {2,33.3,36.6,40} - distinct 3. A flat arc + high churn = many stuck
  // resources, the census's own split.
  assert.strictEqual(c.rows, 3)
  assert.strictEqual(c.board.distinctPct0, 1)
  assert.deepEqual([c.board.firstPct, c.board.lastPct, c.board.driftPct], [2.0, 2.0, 0])
  assert.strictEqual(c.distinctBoards, 3)
})

test('census: a positive drift rides the have growth - the harvest clock reading', () => {
  const c = deficitsCensus([
    '   deficits: 50/2 (4.0%) 30/10 (33.3%)',
    '   deficits: 50/6 (12.0%) 30/10 (33.3%)'
  ])
  // hand-count: 4.0 -> 12.0 = drift 8.0; have 2 -> 6 (the worst slot grew by
  // 4 units across the face); min 4.0; boards distinct 2.
  assert.strictEqual(c.rows, 2)
  assert.deepEqual([c.board.firstPct, c.board.lastPct, c.board.driftPct], [4.0, 12.0, 8.0])
  assert.deepEqual([c.board.firstHave, c.board.lastHave], [2, 6])
  assert.strictEqual(c.board.minPct0, 4.0)
  assert.strictEqual(c.distinctBoards, 2)
})

test('census: the escape hatch - a half-read row counts unparsed and never feeds the board', () => {
  const c = deficitsCensus([
    '   deficits: 100/5 (5.0%) garbage (12%)',
    '   deficits: 50/2 (4.0%)'
  ])
  // hand-count: row 1 bad (excluded), row 2 feeds the board alone.
  assert.strictEqual(c.rows, 1)
  assert.strictEqual(c.unparsed, 1)
  assert.strictEqual(c.board.firstPct, 4.0)
  assert.strictEqual(c.board.lastPct, 4.0)
  assert.strictEqual(c.board.distinctPct0, 1, 'one row - one distinct pct (the stuck note would be honest for a 1-row face too)')
})

test('census: the honest zeros and the honest empty anatomy', () => {
  const c = deficitsCensus(['F1 [F1] heartbeat alive', 'calm face - no deficits here'])
  assert.strictEqual(c.rows, 0)
  assert.strictEqual(c.unparsed, 0)
  assert.strictEqual(c.board.firstPct, null)
  assert.strictEqual(c.board.driftPct, null)
  assert.strictEqual(c.board.distinctPct0, 0)
  assert.strictEqual(c.distinctBoards, 0)
  assert.deepEqual(c.slotsPerRow, { min: null, max: null })
  const e = deficitsCensus('not an array')
  assert.strictEqual(e.rows, 0)
  assert.strictEqual(e.distinctBoards, 0)
})

test('regex export: the token pins the row, the leading whitespace is optional', () => {
  assert.ok(DEFICITS_ROW_RE.test('   deficits: 1/1 (100.0%)'))
  assert.ok(DEFICITS_ROW_RE.test('deficits: 1/1 (100.0%)'))
  assert.ok(!DEFICITS_ROW_RE.test('the deficits: of the matter'), 'the token must lead - prose mentioning deficits is junk')
})
