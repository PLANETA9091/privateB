// (v0.415.0) THE MAP-TRIP LENS's tests - the materials plan's launch
// economics. The verbatims are the field's own shapes pinned across face 26
// (36864564525), face 27 (36870593766) and run68 (36221189568): the launch
// names its target list, the unreachable skip embeds the SAME list before
// 'unreachable', the shaft skip is the climb-owner gate's verdict. The junk
// battery rejects the smelt sweep verdicts, the bank lane and the prose -
// one parser per emitter, the v0.409.0 split law.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MAP_TRIP_RE, MAP_TRIP_SKIP_RE, classifyTripSkip, parseMapTrip, mapTripCensus, parseWorldmapTail, mapTripGap, parseResSample, tripReceipt, tripVoice } from '../../src/lib/maptrip.mjs'

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
  assert.deepEqual(c.skips, { n: 0, byWhy: {}, byBot: {}, byBotWhy: {}, unreachableTargets: {} }) // (v0.450.0) byBotWhy rides
  assert.equal(c.unparsed, 0)
  const e = mapTripCensus('not an array')
  assert.equal(e.launches, 0)
  assert.deepEqual(e.byTarget, {})
})

// (v0.445.0) THE MAP TRIP GAP - the knowledge side arrives. The worldmap
// tail parser rides the tiling law (the top-list's entries must TILE the
// tail or the whole tail reads null), and the gap composer rides the
// existing census's own numbers (no re-parse drift). The verbatim lines
// are face 31's (run114) - the round-trip law holds.

test('worldmap tail: the verbatim face-31 line parses, the tiling law holds, the junk reads null', () => {
  const w = parseWorldmapTail('worldmap: 1130 positions, 17 chunks scanned, top: coal_ore=291 oak_log=244 sand=226 copper_ore=189 birch_log=78')
  assert.deepEqual(w, { positions: 1130, chunks: 17, top: { coal_ore: 291, oak_log: 244, sand: 226, copper_ore: 189, birch_log: 78 } })
  // one entry is legal; a garbage gap breaks the tile - null, never a half-read map
  assert.deepEqual(parseWorldmapTail('worldmap: 5 positions, 2 chunks scanned, top: sand=7'), { positions: 5, chunks: 2, top: { sand: 7 } })
  assert.equal(parseWorldmapTail('worldmap: 5 positions, 2 chunks scanned, top: sand=7 junk here'), null)
  assert.equal(parseWorldmapTail('worldmap: 5 positions, 2 chunks scanned, top: sand=x'), null)
  assert.equal(parseWorldmapTail('[worldmap] autosave: merged 12 from disk, 1130 positions on file'), null, 'the autosave emitter is another lane')
  assert.equal(parseWorldmapTail(null), null)
})

test('mapTripGap: the face-31 composition hand-counted, the honest nulls when a leg is missing', () => {
  const lines = [
    'F3 map trip skipped: sand,gravel unreachable',
    'F14 map trip: sand',
    'F13 map trip skipped: cannot leave the shaft',
    'worldmap: 1130 positions, 17 chunks scanned, top: coal_ore=291 sand=226'
  ]
  const mt = mapTripCensus(lines)
  const map = parseWorldmapTail('worldmap: 1130 positions, 17 chunks scanned, top: coal_ore=291 sand=226')
  const g = mapTripGap(mt, map, 'sand')
  assert.deepEqual(g, { stuck: 'sand', mapPositions: 226, mapKnown: true, demanded: 2, unreachable: 1, shaftLocked: 1, launches: 1, stuckLaunches: 1 })
  // gravel: demanded by the unreachable embed, never launched, known to the map
  const g2 = mapTripGap(mt, map, 'gravel')
  assert.equal(g2.demanded, 1)
  assert.equal(g2.stuckLaunches, 0)
  assert.equal(g2.mapPositions, 0, 'the map\'s top-list has no gravel line - 0 positions KNOWN, the honest read')
  // the missing legs read null - the board churned (no stuck name) or no map tail
  assert.equal(mapTripGap(mt, map, null), null)
  assert.equal(mapTripGap(null, map, 'sand'), null)
  const g3 = mapTripGap(mt, null, 'sand')
  assert.equal(g3.mapKnown, false)
  assert.equal(g3.mapPositions, null, 'no map tail = the knowledge side unknown, never a zero that lies')
})

// (v0.447.0) THE TRIP RECEIPT - the delivery leg's yield. The counter tail
// parser rides the tiling law (the pairs must TILE the tail or the whole
// sample reads null); the composer rides the trip census's own parser
// (parseMapTrip - no re-parse drift). The verbatim t-lines are face 32's
// (fleet 36935489850) - the round-trip law holds.

test('res sample: the verbatim face-32 t-lines parse, the tiling law holds, the junk reads null', () => {
  const s = parseResSample('t-537s alive=19/19 mined=77 map=358p/10ch banked=0 smelted=0 pocket=63u/20s | sand=0 gravel=0 dirt=0 stone=0')
  assert.deepEqual(s, { t: 537, res: { sand: 0, gravel: 0, dirt: 0, stone: 0 } })
  assert.deepEqual(parseResSample('t-400s alive=19/19 mined=446 map=626p/13ch banked=0 smelted=0 pocket=619u/205s | sand=3 gravel=2 dirt=64 stone=0'), { t: 400, res: { sand: 3, gravel: 2, dirt: 64, stone: 0 } })
  // one pair is legal; a garbage gap breaks the tile - null, never a half-read counter
  assert.deepEqual(parseResSample('t-100s alive=1/1 | sand=7'), { t: 100, res: { sand: 7 } })
  assert.equal(parseResSample('t-100s alive=1/1 | sand=7 junk here'), null)
  assert.equal(parseResSample('t-100s alive=1/1 | sand=x'), null)
  assert.equal(parseResSample('t-100s alive=1/1 | '), null, 'an empty tail is not a counter')
  assert.equal(parseResSample('some prose line'), null)
  assert.equal(parseResSample(null), null)
})

test('tripReceipt: the hand-counted yield - the windows, the incidental verdict, the honest nulls', () => {
  const lines = [
    't-537s alive=19/19 | sand=0 gravel=0',
    'F16 map trip: sand',
    'F18 map trip skipped: sand,gravel unreachable',
    't-522s alive=19/19 | sand=0 gravel=1',
    't-507s alive=19/19 | sand=3 gravel=2',
    't-492s alive=19/19 | sand=4 gravel=2',
    'F5 map trip: sand',
    't-476s alive=19/19 | sand=9 gravel=2',
    't-461s alive=19/19 | sand=9 gravel=2'
  ]
  const r = tripReceipt(lines, 'sand')
  assert.equal(r.res, 'sand')
  assert.equal(r.samples, 6)
  assert.equal(r.launches, 2, 'the skip line is not a launch - the census parser\'s own verdict')
  assert.equal(r.resLaunches, 2)
  assert.equal(r.start, 0)
  assert.equal(r.end, 9)
  assert.equal(r.peak, 9)
  assert.deepEqual(r.firstNonzero, { t: 507 })
  assert.equal(r.firstNonzeroVsLaunch, 'after')
  assert.equal(r.windows.length, 2)
  // (v0.449.0) the default window is 6 now - the calibrated read: F16's
  // window swallows every sample after its launch (5 of them), the delta
  // accrues across 76s; F5's rides a 2-sample span of 31s.
  assert.deepEqual(r.windows[0], { bot: 'F16', before: 0, after: 9, delta: 9, span: 76, holeMax: 16 })
  assert.deepEqual(r.windows[1], { bot: 'F5', before: 4, after: 9, delta: 5, span: 31, holeMax: 16 })
  // the v0.447.0 legacy read stays available via the param: 2-sample windows
  const rLegacy = tripReceipt(lines, 'sand', 2)
  assert.deepEqual(rLegacy.windows[0], { bot: 'F16', before: 0, after: 3, delta: 3, span: 30, holeMax: 15 })
  assert.deepEqual(rLegacy.windows[1], { bot: 'F5', before: 4, after: 9, delta: 5, span: 31, holeMax: 16 })
  // the incidental leg: the pocket moved BEFORE any launch of the resource
  const lines2 = ['t-600s alive=1/1 | sand=2', 'F5 map trip: sand', 't-585s alive=1/1 | sand=2']
  const r2 = tripReceipt(lines2, 'sand')
  assert.equal(r2.firstNonzeroVsLaunch, 'before')
  // a launch of another resource: the pocket's own motion reads incidental
  const lines3 = ['t-600s alive=1/1 | sand=0', 'F5 map trip: gravel', 't-585s alive=1/1 | sand=5']
  const r3 = tripReceipt(lines3, 'sand')
  assert.equal(r3.resLaunches, 0)
  assert.equal(r3.firstNonzeroVsLaunch, 'before', 'the pocket moved with no sand launch - incidental by definition')
  assert.deepEqual(r3.windows, [])
  // a late-face launch with no following sample: the yield unknown, never fabricated
  const lines4 = ['t-600s alive=1/1 | sand=0', 'F5 map trip: sand']
  const r4 = tripReceipt(lines4, 'sand')
  assert.deepEqual(r4.windows, [{ bot: 'F5', before: 0, after: null, delta: null, span: null, holeMax: null }])
  // a pocket that never moved: the verdict says so, not a fake consistency
  const lines5 = ['t-600s alive=1/1 | sand=0', 'F5 map trip: sand', 't-585s alive=1/1 | sand=0']
  const r5 = tripReceipt(lines5, 'sand')
  assert.equal(r5.firstNonzeroVsLaunch, null)
  assert.equal(r5.firstNonzero, null)
  assert.equal(r5.windows[0].delta, 0, 'a zero delta is an honest delta')
  // the honest nulls: no samples (a pre-pulse face), no launches (the gap row's subject), junk
  assert.equal(tripReceipt(['F5 map trip: sand'], 'sand'), null)
  assert.equal(tripReceipt(['t-600s alive=1/1 | sand=0'], 'sand'), null)
  assert.equal(tripReceipt('not an array', 'sand'), null)
  assert.equal(tripReceipt(lines, ''), null)
})

// (v0.449.0) THE WINDOW CALIBRATION - face 33's field fixture. F15's sand
// launch sat between the t-367s and t-352s samples; the pocket moved 0 -> 7
// by t-240s (a ~127s yield lag the 2-sample window read as +0u) - and the
// face's pulse series carried an 82s sampling hole (t-322s -> t-240s), so
// the widened delta is a BOUND, never a timing read.
test('tripReceipt window calibration: the face-33 fixture - the widened window catches the yield the 2-sample read lost', () => {
  const lines = [
    't-367s alive=19/19 | sand=0 gravel=13',
    'F15 map trip: sand',
    't-352s alive=19/19 | sand=0 gravel=14',
    't-337s alive=19/19 | sand=0 gravel=14',
    't-322s alive=19/19 | sand=0 gravel=14',
    't-240s alive=19/19 | sand=7 gravel=14',
    't-225s alive=19/19 | sand=7 gravel=14',
    't-210s alive=19/19 | sand=7 gravel=14'
  ]
  const r = tripReceipt(lines, 'sand') // the calibrated default (6)
  assert.equal(r.firstNonzeroVsLaunch, 'after')
  assert.deepEqual(r.firstNonzero, { t: 240 })
  assert.deepEqual(r.windows[0], { bot: 'F15', before: 0, after: 7, delta: 7, span: 157, holeMax: 82 }, 'the yield the v0.447.0 window lost; the 82s hole rides honesty hardware')
  assert.equal(r.windows[0].holeMax > 45, true, 'the sampling hole crosses the trip walk budget - the bound note\'s fuel')
  // the legacy 2-sample read: the same face honestly read +0u before the calibration
  const r2 = tripReceipt(lines, 'sand', 2)
  assert.deepEqual(r2.windows[0], { bot: 'F15', before: 0, after: 0, delta: 0, span: 30, holeMax: 15 })
  // the EOF t-0 cluster: time never runs backwards, the span clamps at 0
  const lines3 = [
    't-30s alive=19/19 | sand=0',
    'F5 map trip: sand',
    't-0s alive=19/19 | sand=5',
    't-0s alive=19/19 | sand=5'
  ]
  const r3 = tripReceipt(lines3, 'sand')
  assert.deepEqual(r3.windows[0], { bot: 'F5', before: 0, after: 5, delta: 5, span: 30, holeMax: 30 })
})

// (v0.450.0) THE TRIP VOICE ROSTER's tests - the refusal side learns to
// name WHO. The verbatim shapes are the field's own (face 32's F16 sand
// launch beside F7's shaft skip and F1's unreachable list); the split is
// hand-counted, the roster sorted F-numeric (F2 before F10 - the lexical
// sort would hide it), the shaft-lock cast is the plan-side cure's fuel.
test('trip-voice: the per-bot split hand-counted - voice classes and the shaft-lock cast', () => {
  const lines = [
    'F7 map trip skipped: cannot leave the shaft',
    'F1 map trip skipped: sand,gravel unreachable',
    'F5 map trip: sand',
    'F7 map trip skipped: cannot leave the shaft',
    'F16 map trip: sand',
    'F1 map trip skipped: sand unreachable',
    'F9 map trip skipped: cannot leave the shaft'
  ]
  const mt = mapTripCensus(lines)
  // the substrate: the per-bot-per-why split the census now keeps
  assert.deepEqual(mt.skips.byBotWhy, {
    F7: { 'shaft-locked': 2 },
    F1: { unreachable: 2 },
    F9: { 'shaft-locked': 1 }
  })
  const v = tripVoice(mt)
  assert.equal(v.roster.length, 5) // F1 F5 F7 F9 F16 - five distinct voices
  const byBot = Object.fromEntries(v.roster.map(r => [r.bot, r]))
  assert.equal(byBot.F1.launches, 0)
  assert.equal(byBot.F1.skips, 2)
  assert.equal(byBot.F1.voice, 'skip-only')
  assert.equal(byBot.F5.voice, 'launcher')
  assert.equal(byBot.F5.skips, 0)
  assert.equal(byBot.F7.voice, 'skip-only')
  assert.equal(byBot.F7.byWhy['shaft-locked'], 2)
  assert.equal(byBot.F16.voice, 'launcher')
  // the shaft-lock cast: F7 and F9, sorted F-numeric
  assert.deepEqual(v.shaftRoster, ['F7', 'F9'])
})

test('trip-voice: the F-numeric sort, the mixed voice, and the honest nulls', () => {
  // the lexical sort would read F10 before F2; the roster must not
  const lines = [
    'F10 map trip: gravel',
    'F2 map trip skipped: cannot leave the shaft',
    'F2 map trip: sand'
  ]
  const v = tripVoice(mapTripCensus(lines))
  assert.deepEqual(v.roster.map(r => r.bot), ['F2', 'F10'])
  assert.equal(v.roster[0].voice, 'mixed') // refused once, left once
  assert.deepEqual(v.shaftRoster, ['F2'])
  // honest nulls: no trip voices at all, and non-object input
  assert.equal(tripVoice(mapTripCensus(['F8 decide stall: 3.2s'])), null)
  assert.equal(tripVoice(null), null)
  assert.equal(tripVoice(undefined), null)
  assert.equal(tripVoice(mapTripCensus([])), null)
})
