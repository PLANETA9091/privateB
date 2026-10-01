// (v0.415.0) THE MAP-TRIP LENS's tests - the materials plan's launch
// economics. The verbatims are the field's own shapes pinned across face 26
// (36864564525), face 27 (36870593766) and run68 (36221189568): the launch
// names its target list, the unreachable skip embeds the SAME list before
// 'unreachable', the shaft skip is the climb-owner gate's verdict. The junk
// battery rejects the smelt sweep verdicts, the bank lane and the prose -
// one parser per emitter, the v0.409.0 split law.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MAP_TRIP_RE, MAP_TRIP_SKIP_RE, classifyTripSkip, parseMapTrip, mapTripCensus } from '../../src/lib/maptrip.mjs'

test('map-trip: the launch verbatims parse bot and target list', () => {
  const a = parseMapTrip('F8 map trip: gravel')
  assert.equal(a.bot, 'F8')
  assert.equal(a.kind, 'launch')
  assert.deepEqual(a.targets, ['gravel'])

  // the multi-target launch shape (face 26 line 936 'F13 map trip: sand' is
  // single; the materialplan's deficit order can name several)
  const b = parseMapTrip('F13 map trip: sand,gravel')
  assert.deepEqual(b.targets, ['sand', 'gravel'])

  const c = parseMapTrip('F18 map trip: sand')
  assert.equal(c.bot, 'F18')
  assert.equal(c.kind, 'launch')
})

test('map-trip: the unreachable skip embeds its own target list', () => {
  const a = parseMapTrip('F1 map trip skipped: sand,gravel unreachable')
  assert.equal(a.bot, 'F1')
  assert.equal(a.kind, 'skip')
  assert.equal(a.why, 'unreachable')
  assert.deepEqual(a.targets, ['sand', 'gravel'])

  // the single-target unreachable (the plan's order can starve one resource)
  const b = parseMapTrip('F9 map trip skipped: sand unreachable')
  assert.deepEqual(b.targets, ['sand'])
  assert.equal(b.why, 'unreachable')
})

test('map-trip: the shaft-locked skip is the climb-owner gate verdict', () => {
  const a = parseMapTrip('F7 map trip skipped: cannot leave the shaft')
  assert.equal(a.bot, 'F7')
  assert.equal(a.kind, 'skip')
  assert.equal(a.why, 'shaft-locked')
  assert.equal(a.targets, undefined)
})

test('map-trip: the classifier battery - the unknown reason stays honest as other', () => {
  assert.equal(classifyTripSkip('sand,gravel unreachable').why, 'unreachable')
  assert.equal(classifyTripSkip('cannot leave the shaft').why, 'shaft-locked')
  assert.equal(classifyTripSkip('some future gate verdict').why, 'other')
  assert.equal(classifyTripSkip(null).why, 'other')
  assert.equal(classifyTripSkip(undefined).why, 'other')
  assert.equal(classifyTripSkip(42).why, 'other')
})

test('map-trip: the regexes reject the malformed and the truncated lines', () => {
  assert.equal(MAP_TRIP_RE.test('F8 map trip:'), false)
  assert.equal(MAP_TRIP_RE.test('map trip: gravel'), false)
  assert.equal(MAP_TRIP_RE.test('F8 map trip: gravel unreachable'), false)
  assert.equal(MAP_TRIP_SKIP_RE.test('F1 map trip skipped:'), false)
  assert.equal(MAP_TRIP_SKIP_RE.test('F1 map trip skipped: '), false)
  assert.equal(parseMapTrip(null), null)
  assert.equal(parseMapTrip(1234), null)
})

test('map-trip: the junk battery - the sibling lanes and the prose stay out', () => {
  assert.equal(parseMapTrip('F5 sweep: 0 collected - machine unreachable (walk to a machine (sweep): timeout after 4659ms) x1'), null)
  assert.equal(parseMapTrip('F12 tunnel: 0 blocks (branch mine at the floor, steered, floor lock)'), null)
  assert.equal(parseMapTrip('plan progress: 1/31 resources complete'), null)
  assert.equal(parseMapTrip('F9 bank: chest unreachable (Took to long to decide path to goal!) (7 blocks from yard) - walking back'), null)
  // a built-for line with an unknown tail is NOT dropped - it counts as an
  // honest 'other' skip (the never-lose-a-line law)
  const t = parseMapTrip('F2 map trip skipped: cannot leave the shaft (extra tail)')
  assert.equal(t.kind, 'skip')
  assert.equal(t.why, 'other')
  const u = parseMapTrip('F1 map trip skipped: sand,gravel unreachable and prose rode along')
  assert.equal(u.kind, 'skip')
  assert.equal(u.why, 'other')
})

test('census: the accumulation over a mixed stream sums launches, skips, starved targets', () => {
  const lines = [
    'F8 map trip: gravel',
    'F5 map trip: gravel',
    'F13 map trip: sand',
    'F15 map trip: sand',
    'F12 map trip: sand',
    'F18 map trip: sand',
    'F1 map trip: sand',
    'F9 map trip: sand',
    'F1 map trip: sand',
    'F1 map trip skipped: sand,gravel unreachable',
    'F9 map trip skipped: sand,gravel unreachable',
    'F4 map trip skipped: sand,gravel unreachable',
    'F17 map trip skipped: sand,gravel unreachable',
    'F11 map trip skipped: sand,gravel unreachable',
    'F14 map trip skipped: sand,gravel unreachable',
    'F16 map trip skipped: sand,gravel unreachable',
    'F2 map trip skipped: sand,gravel unreachable',
    'F7 map trip skipped: cannot leave the shaft',
    'F2 map trip skipped: cannot leave the shaft',
    'F9 map trip skipped: cannot leave the shaft',
    'F6 map trip skipped: cannot leave the shaft'
  ]
  const c = mapTripCensus(lines)
  assert.equal(c.launches, 9)
  assert.deepEqual(c.byTarget, { gravel: 2, sand: 7 })
  assert.deepEqual(c.byBot, { F8: 1, F5: 1, F13: 1, F15: 1, F12: 1, F18: 1, F1: 2, F9: 1 })
  assert.equal(c.skips.n, 12)
  assert.deepEqual(c.skips.byWhy, { unreachable: 8, 'shaft-locked': 4 })
  assert.deepEqual(c.skips.unreachableTargets, { sand: 8, gravel: 8 })
  assert.equal(c.skips.byBot.F1, 1)
  assert.equal(c.unparsed, 0)
})

test('census: the unknown skip counts in skips and byWhy other - never dropped', () => {
  const c = mapTripCensus(['F3 map trip skipped: some future gate verdict'])
  assert.equal(c.skips.n, 1)
  assert.deepEqual(c.skips.byWhy, { other: 1 })
  assert.deepEqual(c.skips.unreachableTargets, {})
})

test('census: the unparsed escape hatch - a built-for line whose shape escaped', () => {
  const c = mapTripCensus(['F8 map trip: 12 sand', 'F1 [F1] vein sweep: 3 drop(s) in reach'])
  assert.equal(c.launches, 0)
  assert.equal(c.unparsed, 1)
})

test('census: the other-skips sum into byWhy other - the unknown tail never lost', () => {
  const c = mapTripCensus(['F2 map trip skipped: cannot leave the shaft (extra tail)'])
  assert.equal(c.skips.n, 1)
  assert.deepEqual(c.skips.byWhy, { other: 1 })
  assert.deepEqual(c.skips.byBot, { F2: 1 })
})

test('census: the honest zeros and the honest empty anatomy', () => {
  const c = mapTripCensus(['F1 [F1] heartbeat alive', 'calm face - no trips either way'])
  assert.equal(c.launches, 0)
  assert.deepEqual(c.byTarget, {})
  assert.deepEqual(c.byBot, {})
  assert.deepEqual(c.skips, { n: 0, byWhy: {}, byBot: {}, unreachableTargets: {} })
  assert.equal(c.unparsed, 0)
  const e = mapTripCensus('not an array')
  assert.equal(e.launches, 0)
  assert.deepEqual(e.byTarget, {})
})
