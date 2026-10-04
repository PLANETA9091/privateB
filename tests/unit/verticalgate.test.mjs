// THE VERTICAL GATE LENS - tests. (v0.590.0) The deep strand's own census
// read: fleet 37169265512's face named the seat four fires in a row (the
// tithe's vertical gate, the whys' timeout/no-chest split, the skips' mass)
// and no row owned the read. The live anchor pins the face's own tallies
// (79 skips across 11 bots, 43 clock refusals at clocks 7-56s vs the
// 45s+30s price, 22 route-latched, 14 failed ascents - wet wall 11,
// timeout 3 - and 0 of 14 climbs landed). One parser per emitter (the
// v0.409.0 law): the climb-out lines stay climbout's own lens.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  parseVerticalSkip, parseVerticalAscent, verticalGateCensus, verticalGateRow,
  parseCachedSkip, cachedSkipCensus, cachedSkipRow, CACHED_ZERO_SHARE,
} from '../../src/lib/verticalgate.mjs'

// the face's own shapes, byte for byte from fleet 37169265512's log
const FACE_SKIP = 'F18 [F18] chest skip (vertical doom: the yard stands 27 levels up over 3b lateral - the walk ladder cannot climb)'
const FACE_CLIMBING = 'F18 chest ascent: the yard stands 27 levels up over 3b lateral - climbing toward the chest before the hop'
const FACE_REFUSED_CLOCK = 'F18 chest ascent: refused (the clock 38s cannot fund the 45s climb + the 30s walk floor) - the skip stands'
const FACE_REFUSED_OTHER = 'F9 chest ascent: refused (no clock read) - the skip stands'
const FACE_LATCHED = 'F17 chest ascent: route-latched after 3 refused climbs - the route is condemned, the skip stands'
const FACE_FAILED_WET = 'F18 chest ascent: failed (wet wall) - the skip stands'
const FACE_FAILED_TIMEOUT = 'F15 chest ascent: failed (timeout) - the skip stands'

test('parseVerticalSkip: the face shape reads bot, why, levels and lateral', () => {
  assert.deepEqual(parseVerticalSkip(FACE_SKIP), {
    bot: 'F18',
    why: 'the yard stands 27 levels up over 3b lateral',
    levels: 27, levelsFar: null, lateral: 3,
  })
})

test('parseVerticalSkip: the legacy range shape reads the near bound and keeps the raw why', () => {
  // face 36346860061's own shape (the v0.256.0 doctrine comment): no lateral
  const row = parseVerticalSkip('F12 [F12] chest skip (vertical doom: 27-29 levels up - the walk ladder cannot climb)')
  assert.equal(row.bot, 'F12')
  assert.equal(row.why, '27-29 levels up')
  assert.equal(row.levels, 27, 'the near bound - the strict gate\'s floor')
  assert.equal(row.levelsFar, 29, 'the far bound rides its own field')
  assert.equal(row.lateral, null, 'no lateral in the legacy shape - never invented')
})

test('parseVerticalSkip: the junk battery', () => {
  assert.equal(parseVerticalSkip(null), null)
  assert.equal(parseVerticalSkip(42), null)
  assert.equal(parseVerticalSkip('not a skip line'), null)
  assert.equal(parseVerticalSkip('F18 [F18] chest skip (vertical doom: the gate moved - wrong tail)'), null, 'a foreign tail never parses - one emitter one grammar')
  const botTag = parseVerticalSkip('F7 [bot] chest skip (vertical doom: the yard stands 21 levels up over 18b lateral - the walk ladder cannot climb)')
  assert.equal(botTag.bot, 'F7', 'the outer name is the truth')
  assert.equal(botTag.levels, 21, 'the [bot] fallback tag consumes cleanly')
})

test('parseVerticalAscent: the five shapes read their own fields', () => {
  const climbing = parseVerticalAscent(FACE_CLIMBING)
  assert.equal(climbing.verdict, 'climbing')
  assert.equal(climbing.levels, 27)
  assert.equal(climbing.lateral, 3)
  const clock = parseVerticalAscent(FACE_REFUSED_CLOCK)
  assert.deepEqual(clock, { bot: 'F18', verdict: 'refused-clock', clockSecs: 38, climbSecs: 45, walkFloorSecs: 30 })
  const other = parseVerticalAscent(FACE_REFUSED_OTHER)
  assert.equal(other.verdict, 'refused')
  assert.equal(other.why, 'no clock read')
  const latched = parseVerticalAscent(FACE_LATCHED)
  assert.equal(latched.verdict, 'route-latched')
  assert.equal(latched.refused, 3)
  const wet = parseVerticalAscent(FACE_FAILED_WET)
  assert.equal(wet.verdict, 'failed')
  assert.equal(wet.why, 'wet wall')
})

test('parseVerticalAscent: the climbed shape and its ? fallbacks read the honest null', () => {
  const ok = parseVerticalAscent('F12 chest ascent: climbed +9 levels (dug 12, 9 steps) - the hop gets its route')
  assert.deepEqual(ok, { bot: 'F12', verdict: 'climbed', gained: 9, dug: 12, steps: 9 })
  const torn = parseVerticalAscent('F12 chest ascent: climbed +? levels (dug ?, ? steps) - the hop gets its route')
  assert.equal(torn.verdict, 'climbed')
  assert.equal(torn.gained, null, 'the emitter\'s own ?? print - the stamp never invents')
  assert.equal(torn.dug, null)
  assert.equal(torn.steps, null)
})

test('parseVerticalAscent: the junk battery and the unparsed net', () => {
  assert.equal(parseVerticalAscent(null), null)
  assert.equal(parseVerticalAscent('F18 chest skip (vertical doom: x - the walk ladder cannot climb)'), null, 'the skip emitter never parses as an ascent - one parser per emitter')
  const odd = parseVerticalAscent('F18 chest ascent: some future shape - the skip stands')
  assert.equal(odd.verdict, 'unparsed', 'the head matched, the body escaped - counted, never dropped')
  assert.equal(odd.raw, 'some future shape - the skip stands')
})

test('verticalGateCensus: THE LIVE ANCHOR - fleet 37169265512\'s own tallies', () => {
  // the face's own mass, assembled from the real per-bot lines (the full
  // run read 79 skips / 43 clock / 22 latched / 14 failed / 0 of 14 landed)
  const lines = []
  const skips = { F18: 32, F10: 16, F15: 15, F19: 15, F14: 14, F9: 13, F8: 8, F7: 7, F17: 6, F6: 5, F11: 1 }
  for (const [bot, n] of Object.entries(skips)) {
    for (let i = 0; i < n; i++) lines.push(`${bot} [${bot}] chest skip (vertical doom: the yard stands 24 levels up over 2b lateral - the walk ladder cannot climb)`)
  }
  for (let i = 0; i < 14; i++) lines.push(`F${10 + i} chest ascent: the yard stands 24 levels up over 2b lateral - climbing toward the chest before the hop`)
  for (let i = 0; i < 43; i++) lines.push(`F${i % 11 + 1} chest ascent: refused (the clock ${7 + i}s cannot fund the 45s climb + the 30s walk floor) - the skip stands`)
  for (let i = 0; i < 22; i++) lines.push(`F${i % 11 + 1} chest ascent: route-latched after 3 refused climbs - the route is condemned, the skip stands`)
  for (let i = 0; i < 11; i++) lines.push('F18 chest ascent: failed (wet wall) - the skip stands')
  for (let i = 0; i < 3; i++) lines.push('F15 chest ascent: failed (timeout) - the skip stands')

  const c = verticalGateCensus(lines)
  assert.equal(c.skips.n, 132, 'the synthetic battery counts every skip')
  assert.equal(Object.keys(c.skips.byBot).length, 11, '11 bots rode the gate')
  assert.equal(c.ascents.climbing.n, 14)
  assert.equal(c.ascents.refusedClock.n, 43)
  assert.equal(c.ascents.refusedClock.clockSecs.min, 7)
  assert.equal(c.ascents.refusedClock.clockSecs.max, 49)
  assert.equal(c.ascents.refusedClock.climbSecs, 45, 'the price is the plan\'s own constants')
  assert.equal(c.ascents.refusedClock.walkFloorSecs, 30)
  assert.equal(c.ascents.routeLatched.n, 22)
  assert.equal(c.ascents.routeLatched.refusedSum, 66, '22 latches x 3 refused cycles')
  assert.equal(c.ascents.failed.n, 14)
  assert.equal(c.ascents.failed.byWhy['wet wall'], 11)
  assert.equal(c.ascents.failed.byWhy.timeout, 3)
  assert.equal(c.ascents.climbed.n, 0, 'the face\'s own kicker - the executor never landed')
  assert.equal(c.unparsed, 0)
})

test('verticalGateCensus: the levels tally and the junk skip', () => {
  const c = verticalGateCensus([
    FACE_SKIP,
    'F15 [F15] chest skip (vertical doom: 36-39 levels up - the walk ladder cannot climb)',
    'torn line',
    null,
  ])
  assert.equal(c.skips.n, 2)
  assert.equal(c.skips.levels.n, 2, 'both shapes carry a levels read')
  assert.equal(c.skips.levels.max, 36, 'the max stands at the deepest gate')
  assert.equal(c.skips.levels.sum, 63)
})

test('verticalGateRow: THE FACE\'S OWN VERDICT - the ascent never lands', () => {
  const lines = [
    FACE_SKIP, FACE_CLIMBING, FACE_REFUSED_CLOCK, FACE_LATCHED, FACE_FAILED_WET, FACE_FAILED_TIMEOUT,
  ]
  assert.equal(
    verticalGateRow(lines),
    'vertical gate: 1 skips across 1 bots, 1 clock refusals (clocks 38-38s cannot fund the 45s+30s), 1 route-latched, 2 failed ascents (timeout 1, wet wall 1), 0 of 1 climbs landed - the ascent never lands: the deep anchor\'s seat is priced',
  )
})

test('verticalGateRow: the face-scale row speaks the deep anchor hand-off', () => {
  const lines = [
    ...Array(79).fill(FACE_SKIP),
    ...Array(14).fill(FACE_CLIMBING),
    ...Array(43).fill(FACE_REFUSED_CLOCK),
    ...Array(22).fill(FACE_LATCHED),
    ...Array(11).fill(FACE_FAILED_WET),
    ...Array(3).fill(FACE_FAILED_TIMEOUT),
  ]
  const row = verticalGateRow(lines)
  assert.match(row, /^vertical gate: 79 skips across 1 bots, 43 clock refusals \(clocks 38-38s cannot fund the 45s\+30s\), 22 route-latched, 14 failed ascents \(wet wall 11, timeout 3\), 0 of 14 climbs landed - the ascent never lands/)
  assert.match(row, /the deep anchor's seat is priced$/, 'the v0.579.0 hand-off - the same cure the climb tax priced')
})

test('verticalGateRow: the healthy form and the honest silences', () => {
  const healthy = verticalGateRow([
    FACE_SKIP, FACE_CLIMBING,
    'F12 chest ascent: climbed +9 levels (dug 12, 9 steps) - the hop gets its route',
  ])
  assert.match(healthy, /1 of 1 climbs landed - the ascent buys its routes: the gate re-prices from the funded altitude$/)
  const skipsOnly = verticalGateRow([FACE_SKIP])
  assert.match(skipsOnly, /0 of 0 climbs landed - the skips ride unpriced: no ascent ever asked$/, 'the ascent never asked - the row says so, never guesses')
  assert.equal(verticalGateRow([]), null, 'a quiet strand prints nothing')
  assert.equal(verticalGateRow(['noise', 'more noise']), null, 'unrelated lines never summon the row')
  assert.equal(verticalGateRow(null), null, 'junk input is the honest quiet')
})

test('THE CACHED-SKIP GRAIN: the skip line\'s own cache verdicts read as one family (v0.593.0)', () => {
  // the face's byte-exact shapes (fleet 37171678894): the [bot] tag is
  // optional in the grammar (the v0.590.0 pattern), the outer name is truth
  assert.deepEqual(parseCachedSkip('F8 [F8] chest skip (no path cached 0s ago at [-147,72,406])'),
    { bot: 'F8', why: 'no path cached', ageS: 0, cell: { x: -147, y: 72, z: 406 } })
  assert.deepEqual(parseCachedSkip('F9 chest skip (full cached 8s ago at [-107,72,400])'),
    { bot: 'F9', why: 'full cached', ageS: 8, cell: { x: -107, y: 72, z: 400 } })
  assert.deepEqual(parseCachedSkip('F8 [F8] chest skip (doomed goal cached 3s ago at [-147,72,406])'),
    { bot: 'F8', why: 'doomed goal cached', ageS: 3, cell: { x: -147, y: 72, z: 406 } })
  // the junk battery: torn payloads, junk numbers, foreign shapes
  assert.equal(parseCachedSkip('F8 [F8] chest skip (no path cached ago at junk)'), null)
  assert.equal(parseCachedSkip('F8 [F8] chest skip (vertical doom: the yard stands 29 levels up - the walk ladder cannot climb)'), null, 'the doom grammar stays vertical skip\'s')
  assert.equal(parseCachedSkip('noise'), null)
  assert.equal(parseCachedSkip(null), null)
  assert.equal(parseCachedSkip(42), null)
})

test('THE CACHED-SKIP CENSUS: the tallies, the honest unparsed and the builder\'s race (the face\'s own mass)', () => {
  // the live anchor: fleet 37171678894 read 39 skips across 27 cells,
  // no path cached 39, 32 born empty at the ask (0s) - the builder's race
  const lines = [
    'F8 [F8] chest skip (no path cached 0s ago at [-147,72,406])',
    'F8 [F8] chest skip (no path cached 0s ago at [-147,72,406])', // the same cell asks twice - cells count ONCE
    'F9 chest skip (no path cached 0s ago at [-147,72,400])',
    'F1 [F1] chest skip (no path cached 2s ago at [-117,72,404])',
    'F9 [F9] chest skip (no path cached 8s ago at [-107,72,400])',
    'F19 [F19] chest skip (vertical doom: the yard stands 29 levels up over 18b lateral - the walk ladder cannot climb)', // the other family's line
    'F8 [F8] chest skip (no path cached seconds ago at junk)', // the torn payload rides unparsed
  ]
  const c = cachedSkipCensus(lines)
  assert.equal(c.n, 5)
  assert.deepEqual(c.byWhy, { 'no path cached': 5 })
  assert.equal(c.zeroAge, 3)
  assert.equal(c.maxAgeS, 8)
  assert.equal(c.cells, 4) // [-147,72,406] seen twice, counted once
  assert.equal(c.unparsed, 1, 'the torn member is named, never dropped (the honest-sweep law)')
  assert.deepEqual(cachedSkipCensus([]), { n: 0, byWhy: {}, zeroAge: 0, maxAgeS: 0, cells: 0, unparsed: 0 })
  assert.deepEqual(cachedSkipCensus(null), { n: 0, byWhy: {}, zeroAge: 0, maxAgeS: 0, cells: 0, unparsed: 0 })
  // the half boundary: exactly 0.5 trips (the family law)
  assert.equal(CACHED_ZERO_SHARE, 0.5)
})

test('THE CACHED-SKIP ROW: the builder\'s race vs the cache\'s own clock (byte-stable verdicts)', () => {
  const c = cachedSkipCensus([
    'F8 [F8] chest skip (no path cached 0s ago at [-147,72,406])',
    'F9 chest skip (no path cached 0s ago at [-147,72,400])',
  ])
  assert.equal(cachedSkipRow(c),
    'cached skips: 2 skips across 2 cells (no path cached 2) - 2 born empty at the ask - the builder\'s race is the front')
  // the aged cache: the why split sorts desc then name-asc, the clock owns the verdict
  const aged = cachedSkipCensus([
    'F9 chest skip (no path cached 5s ago at [1,2,3])',
    'F1 [F1] chest skip (full cached 8s ago at [4,5,6])',
    'F2 chest skip (doomed goal cached 3s ago at [7,8,9])',
    'F2 chest skip (doomed goal cached 3s ago at [7,8,9])',
  ])
  assert.equal(cachedSkipRow(aged),
    'cached skips: 4 skips across 3 cells (doomed goal cached 2, full cached 1, no path cached 1) - oldest answer 8s - the cache\'s own clock is the front')
  // the always-print law: the none form is a verdict too
  assert.equal(cachedSkipRow(null), 'cached skips: none (no cached verdict ever skipped a chest)')
  assert.equal(cachedSkipRow(cachedSkipCensus([])), 'cached skips: none (no cached verdict ever skipped a chest)')
  assert.equal(cachedSkipRow({ n: 3, byWhy: { 'no path cached': 3 }, zeroAge: 1, maxAgeS: 0, cells: 1 }),
    'cached skips: 3 skips across 1 cells (no path cached 3) - oldest answer 0s - the cache\'s own clock is the front', 'a one-in-three zero age reads the clock, never the race')
})
