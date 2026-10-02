// (v0.415.0) THE MAP-TRIP LENS's tests - the materials plan's launch
// economics. The verbatims are the field's own shapes pinned across face 26
// (36864564525), face 27 (36870593766) and run68 (36221189568): the launch
// names its target list, the unreachable skip embeds the SAME list before
// 'unreachable', the shaft skip is the climb-owner gate's verdict. The junk
// battery rejects the smelt sweep verdicts, the bank lane and the prose -
// one parser per emitter, the v0.409.0 split law.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MAP_TRIP_RE, MAP_TRIP_SKIP_RE, classifyTripSkip, parseMapTrip, mapTripCensus, parseWorldmapTail, mapTripGap, parseResSample, tripReceipt, tripVoice, parsePulseHeader, pocketDrain, pocketDrainAttr, materialBalance, balanceReconcile } from '../../src/lib/maptrip.mjs'

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

// (v0.451.0) THE POCKET DRAIN LEDGER's tests - the pulse header's own
// banked/smelted counters vs the pocket's peak-to-end drop. The verbatims
// are face 34's own first and last pulse lines (the shape stable across
// faces 32 -> 34); the verdicts hand-counted, the junk battery honest.
test('pocket-drain: the header verbatims parse - the full anchored shape, no half-reads', () => {
  const a = parsePulseHeader('t-536s alive=19/19 mined=81 map=275p/7ch banked=0 smelted=0 pocket=64u/18s | sand=0 gravel=0 dirt=0 stone=0')
  assert.deepEqual(a, { t: 536, alive: 19, fleet: 19, mined: 81, mapPositions: 275, mapChunks: 7, banked: 0, smelted: 0, pocket: 64 })
  const b = parsePulseHeader('t-0s alive=19/19 mined=1664 map=1173p/18ch banked=816 smelted=10 pocket=404u/131s | sand=0 gravel=0 dirt=80 stone=2')
  assert.equal(b.banked, 816)
  assert.equal(b.smelted, 10)
  assert.equal(b.pocket, 404)
  // the junk battery: prose, the tail-only line (the receipt's own read),
  // a token missing, a token renamed, non-strings
  assert.equal(parsePulseHeader('t-100s alive=19/19 mined=5 | sand=0'), null)
  assert.equal(parsePulseHeader('t-100s alive=19/19 banked=0 smelted=0 pocket=1u/1s | sand=0'), null)
  assert.equal(parsePulseHeader('t-100s alive=19/19 mined=5 map=1p/1ch bank=0 smelted=0 pocket=1u/1s | sand=0'), null)
  assert.equal(parsePulseHeader('F5 map trip: sand'), null)
  assert.equal(parsePulseHeader(null), null)
  assert.equal(parsePulseHeader(42), null)
})

test('pocket-drain: the verdicts hand-counted - banked, furnace, both, unaccounted, no-drop, honest nulls', () => {
  // 'banked': the drop 340u, the bank's rise 816 - absorbed (face 34's arc)
  const f34 = [
    't-536s alive=19/19 mined=81 map=275p/7ch banked=0 smelted=0 pocket=64u/18s | sand=0 gravel=0',
    't-300s alive=19/19 mined=900 map=900p/12ch banked=816 smelted=10 pocket=744u/150s | sand=13 gravel=0',
    't-0s alive=19/19 mined=1664 map=1173p/18ch banked=816 smelted=10 pocket=404u/131s | sand=0 gravel=0'
  ]
  const pd = pocketDrain(f34)
  assert.equal(pd.samples, 3)
  assert.equal(pd.peak, 744)
  assert.equal(pd.peakT, 300)
  assert.equal(pd.drop, 340)
  assert.equal(pd.bankedDelta, 816)
  assert.equal(pd.smeltedDelta, 10)
  assert.equal(pd.verdict, 'banked')
  // 'smelted': the furnace alone covers the drop
  const f = [
    't-100s alive=19/19 mined=5 map=1p/1ch banked=0 smelted=0 pocket=10u/1s | sand=0',
    't-50s alive=19/19 mined=60 map=1p/1ch banked=0 smelted=50 pocket=5u/1s | sand=0'
  ]
  assert.equal(pocketDrain(f).verdict, 'smelted')
  // 'banked+smelted': neither alone, both together (drop 90 = 50 + 40)
  const b = [
    't-100s alive=19/19 mined=5 map=1p/1ch banked=0 smelted=0 pocket=100u/1s | sand=0',
    't-50s alive=19/19 mined=110 map=1p/1ch banked=50 smelted=40 pocket=10u/1s | sand=0'
  ]
  assert.equal(pocketDrain(b).verdict, 'banked+smelted')
  // 'unaccounted': the counters cannot explain the drop - honest silence
  const u = [
    't-100s alive=19/19 mined=5 map=1p/1ch banked=0 smelted=0 pocket=100u/1s | sand=0',
    't-50s alive=19/19 mined=110 map=1p/1ch banked=5 smelted=5 pocket=10u/1s | sand=0'
  ]
  assert.equal(pocketDrain(u).verdict, 'unaccounted')
  // 'no-drop': the pocket never fell below its peak (a monotonically
  // rising pocket - peak IS the end, drop 0)
  const n = [
    't-100s alive=19/19 mined=5 map=1p/1ch banked=0 smelted=0 pocket=10u/1s | sand=0',
    't-50s alive=19/19 mined=60 map=1p/1ch banked=0 smelted=0 pocket=50u/1s | sand=0'
  ]
  assert.equal(pocketDrain(n).verdict, 'no-drop')
  // the EOF t-0 cluster's repeats are harmless: start = first, end = last
  const e = [
    't-30s alive=19/19 mined=5 map=1p/1ch banked=0 smelted=0 pocket=10u/1s | sand=0',
    't-0s alive=19/19 mined=60 map=1p/1ch banked=45 smelted=0 pocket=50u/1s | sand=0',
    't-0s alive=19/19 mined=60 map=1p/1ch banked=45 smelted=0 pocket=5u/1s | sand=0'
  ]
  const pe = pocketDrain(e)
  assert.equal(pe.samples, 3)
  assert.equal(pe.drop, 45)
  assert.equal(pe.end, 5)
  assert.equal(pe.verdict, 'banked')
  // honest nulls: no pulse lines at all
  assert.equal(pocketDrain(['F5 map trip: sand', 'calm face']), null)
  assert.equal(pocketDrain([]), null)
  assert.equal(pocketDrain('not an array'), null)
})

// (v0.452.0) THE DRAIN ATTRIBUTION's tests - the UNACCOUNTED residual's
// legs priced from the log's own emitters (death drop ~Nu lost, climb
// bridge placed <block>), summed AFTER the peak sample's line only. The
// verbatims are faces 29/30/34's own lines; the counts hand-counted, the
// before-peak exclusion and the junk battery honest.
const hdr = (t, pocket, banked = 0, smelted = 0) =>
  `t-${t}s alive=19/19 mined=81 map=275p/7ch banked=${banked} smelted=${smelted} pocket=${pocket}u/18s | sand=0 gravel=0`

test('drain-attr: covered - the loss + placement legs cover the residual, the before-peak death drop excluded', () => {
  const lines = [
    hdr(536, 10),
    'F9 [F9] death drop: ~50u lost at [-129,52,387] (cobblestone 64, sand 8) - before the peak, the peak already reflects it',
    hdr(300, 100),
    'F10 [F10] death drop: ~114u lost at [-121,54,371] (cobblestone 64, diorite 12, cobblestone 10, andesite 6, sand 5, +8 more)',
    'F7 [F7] climb bridge: placed dirt at [-135,64,419] (support) - the step re-judges',
    'F6 [F6] climb bridge: placed cobblestone at [-117,64,383] (pit) - the step re-judges',
    hdr(0, 10)
  ]
  const a = pocketDrainAttr(lines)
  assert.equal(a.residual, 90) // drop 100-10, banked/smelted flat
  assert.equal(a.lossDelta, 114) // the before-peak 50u NEVER counted
  assert.equal(a.lossCount, 1)
  assert.equal(a.placedDelta, 2)
  assert.deepEqual(a.placedBlocks, { dirt: 1, cobblestone: 1 })
  assert.equal(a.legs, 116)
  assert.equal(a.attr, 'covered') // 116 >= 90 - a bound read, hand-counted
})

test('drain-attr: partial - the legs price part of the residual, the shortfall named', () => {
  const lines = [
    hdr(400, 100),
    'F17 [F17] death drop: ~60u lost at [-138,49,409] (diorite 23, cobblestone 16, dirt 5)',
    hdr(0, 10)
  ]
  const a = pocketDrainAttr(lines)
  assert.equal(a.residual, 90)
  assert.equal(a.legs, 60)
  assert.equal(a.attr, 'partial') // 60 < 90 - crafting/the unseen holds 30u
})

test('drain-attr: open - no priced legs after the peak (the junk battery: craft, dry placement, unavailable)', () => {
  const lines = [
    hdr(400, 100),
    'F3 [F3] craft torches: skip (no coal: sticks 5 coals 0)',
    'F8 [F8] torch: the placement did not land (dry) x1 - the streak names itself once, a landing re-arms it',
    'F2 [F2] climb bridge: unavailable (no placeable block in the pocket)',
    'F10 [F10] sword: table crafted from planks (4 planks of one type)',
    hdr(0, 10)
  ]
  const a = pocketDrainAttr(lines)
  assert.equal(a.residual, 90)
  assert.equal(a.lossDelta, 0)
  assert.equal(a.lossCount, 0)
  assert.equal(a.placedDelta, 0)
  assert.deepEqual(a.placedBlocks, {})
  assert.equal(a.attr, 'open')
})

test('drain-attr: none - the counters cover the drop, the legs never even scanned', () => {
  const lines = [
    hdr(536, 100, 0, 0),
    'F10 [F10] death drop: ~114u lost at [-121,54,371] (cobblestone 64)',
    hdr(300, 100, 0, 0),
    hdr(0, 40, 80, 0) // drop 60, banked +80 - the bank absorbed it
  ]
  const a = pocketDrainAttr(lines)
  assert.equal(a.residual, -20) // 60 - 80 - 0
  assert.equal(a.attr, 'none')
  assert.equal(a.lossDelta, 0) // no scan when nothing to attribute
  assert.equal(a.lossCount, 0)
  assert.equal(a.legs, 0)
})

test('drain-attr: the deviated shapes read nothing - one parser per emitter', () => {
  const lines = [
    hdr(400, 100),
    'F10 death drop: ~114u lost at [-121,54,371] (the bare-prefix form, no [F10])',
    'F10 [F10] death drop: 114u lost (no ~, no at)',
    'F10 [F10] death drop: ~114u lost (no coordinates)',
    'F7 climb bridge: placed dirt at [-135,64,419] (the bare-prefix placement)',
    'F7 [F7] climb bridge: placed Dirt at [-135,64,419] (uppercase deviates)',
    hdr(0, 10)
  ]
  const a = pocketDrainAttr(lines)
  assert.equal(a.residual, 90)
  assert.equal(a.lossDelta, 0)
  assert.equal(a.lossCount, 0)
  assert.equal(a.placedDelta, 0)
  assert.equal(a.attr, 'open')
})

test('drain-attr: honest nulls - no pulse lines, non-array', () => {
  assert.equal(pocketDrainAttr(['F5 map trip: sand', 'calm face']), null)
  assert.equal(pocketDrainAttr([]), null)
  assert.equal(pocketDrainAttr('not an array'), null)
})

// (v0.453.0) THE MATERIAL BALANCE's tests - does mined close the loop?
// The identity mined = d(pocket) + d(banked) + d(smelted) + leaks over the
// face's first and last pulse samples (the counters cumulative, the
// pocket's delta a legitimate sink). The 'leaky' anchor is face 34's REAL
// arc (the decompose row re-derived it live); the rest are hand-built
// self-consistent fixtures, each branch named.
test('material-balance: the real face-34 arc + the five verdicts hand-counted', () => {
  // a hand-built face whose pocket ENDS high (crafted/unbanked pile):
  // leaks go negative - the 'inflated' branch (crafting's unit inflation)
  const f35 = [
    't-531s alive=19/19 mined=90 map=280p/7ch banked=0 smelted=0 pocket=77u/19s | sand=0 gravel=0',
    't-0s alive=19/19 mined=1721 map=1201p/19ch banked=1093 smelted=7 pocket=1180u/160s | sand=13 gravel=0'
  ]
  const mb = materialBalance(f35)
  assert.equal(mb.samples, 2)
  assert.equal(mb.mined, 1631)
  assert.equal(mb.pocket, 1103)
  assert.equal(mb.banked, 1093)
  assert.equal(mb.smelted, 7)
  assert.equal(mb.leaks, 1631 - 1103 - 1093 - 7) // -572: the pocket ENDED high
  assert.equal(mb.verdict, 'inflated') // -35% of mined - crafting's inflation branch
  // a leaky face: face 34's arc (mined 1583, sinks 1166 - leaks 417 ~26%)
  const f34 = [
    't-536s alive=19/19 mined=81 map=275p/7ch banked=0 smelted=0 pocket=64u/18s | sand=0 gravel=0',
    't-0s alive=19/19 mined=1664 map=1173p/18ch banked=816 smelted=10 pocket=404u/131s | sand=0 gravel=0'
  ]
  const m34 = materialBalance(f34)
  assert.equal(m34.mined, 1583)
  assert.equal(m34.leaks, 417)
  assert.equal(m34.verdict, 'leaky')
  assert.equal(Math.round(m34.share * 1000) / 1000, Math.round(417 / 1583 * 1000) / 1000)
  // balanced: leaks exactly at the 5% boundary (inclusive)
  const b = [
    't-100s alive=19/19 mined=5 map=1p/1ch banked=0 smelted=0 pocket=10u/1s | sand=0',
    't-50s alive=19/19 mined=205 map=1p/1ch banked=180 smelted=10 pocket=10u/1s | sand=0'
  ]
  const mbb = materialBalance(b)
  assert.equal(mbb.mined, 200)
  assert.equal(mbb.leaks, 10)
  assert.equal(mbb.verdict, 'balanced') // 10/200 = 5.0% - the boundary holds
  // leaky: clearly past it
  const e6 = [
    't-100s alive=19/19 mined=5 map=1p/1ch banked=0 smelted=0 pocket=10u/1s | sand=0',
    't-50s alive=19/19 mined=225 map=1p/1ch banked=180 smelted=10 pocket=10u/1s | sand=0'
  ]
  const mbl = materialBalance(e6)
  assert.equal(mbl.leaks, 30)
  assert.equal(mbl.verdict, 'leaky') // 30/220 ~ 13.6%
  // no-flow: nothing mined (banking from the start pile reads honestly)
  const nf = [
    't-100s alive=19/19 mined=5 map=1p/1ch banked=0 smelted=0 pocket=10u/1s | sand=0',
    't-50s alive=19/19 mined=5 map=1p/1ch banked=10 smelted=0 pocket=0u/1s | sand=0'
  ]
  assert.equal(materialBalance(nf).verdict, 'no-flow')
  // honest nulls
  assert.equal(materialBalance(['F5 map trip: sand']), null)
  assert.equal(materialBalance([]), null)
  assert.equal(materialBalance('not an array'), null)
  assert.equal(materialBalance(null), null)
})

// (v0.454.0) THE POCKET KILLERS' tests - the loss leg's kind split. The
// verbatims are face 36's own died/drop pairs (mob by Drowned, mob by
// Zombie, explosion by Creeper); the pairing rule: the bot's most recent
// died line BEFORE the drop (the emitter prints them adjacent, died ->
// drop); the post-peak window only; honest unknown + pairMisses.
const died = (bot, kind) => `${bot} [${bot}] died - respawning (cause: server: was slain by ${kind.split(' by ')[1] || kind} [kind=${kind}] | inferred: noise@1.0 (the inference is blind - the server kind stays the authority))`

test('pocket-killers: the verbatim pairs split by kind - interleaved bots, last-before-drop wins', () => {
  const lines = [
    hdr(400, 100),
    died('F11', 'mob by Drowned'),
    'F11 [F11] death drop: ~45u lost at [-198,62,420] (sand 20, oak_log 8)',
    died('F2', 'mob by Zombie'),
    'F2 [F2] death drop: ~78u lost at [-83,68,405] (cobblestone 51, dirt 13)',
    died('F3', 'explosion by Creeper'),
    'F3 [F3] death drop: ~29u lost at [-113,64,455] (dirt 8, torch 4)',
    'F6 [F6] climb bridge: placed cobblestone at [-113,64,455] (pit) - the step re-judges',
    hdr(0, 10)
  ]
  const a = pocketDrainAttr(lines)
  assert.equal(a.residual, 90)
  assert.equal(a.lossDelta, 152) // 45 + 78 + 29, hand-counted
  assert.equal(a.lossCount, 3)
  assert.deepEqual(a.lossKinds, {
    'mob by Drowned': { u: 45, n: 1 },
    'mob by Zombie': { u: 78, n: 1 },
    'explosion by Creeper': { u: 29, n: 1 }
  })
  assert.equal(a.pairMisses, 0)
  assert.equal(a.placedDelta, 1) // the placement leg untouched
  assert.equal(a.legs, 153)
  assert.equal(a.attr, 'covered') // 153 >= 90
})

test('pocket-killers: the same bot dies twice - the second drop takes the SECOND kind', () => {
  const lines = [
    hdr(400, 100),
    died('F10', 'mob by Drowned'),
    'F10 [F10] death drop: ~66u lost at [-145,62,397] (dirt 19)',
    // F10 mines back up past nothing - the pocket stays below the peak
    died('F10', 'drown'),
    'F10 [F10] death drop: ~30u lost at [-121,54,371] (cobblestone 20)',
    hdr(0, 10)
  ]
  const a = pocketDrainAttr(lines)
  assert.equal(a.lossDelta, 96)
  assert.deepEqual(a.lossKinds, {
    'mob by Drowned': { u: 66, n: 1 },
    drown: { u: 30, n: 1 }
  })
  assert.equal(a.pairMisses, 0)
})

test('pocket-killers: a drop with no prior died line reads unknown + pairMisses; before-peak pairs never scanned', () => {
  const lines = [
    hdr(536, 10),
    died('F9', 'mob by Skeleton'),
    'F9 [F9] death drop: ~50u lost at [-129,52,387] (cobblestone 40) - before the peak, the peak already reflects it',
    hdr(300, 100),
    'F7 [F7] death drop: ~25u lost at [-89,68,411] (oak_planks 5) - no died line for F7 anywhere',
    hdr(0, 10)
  ]
  const a = pocketDrainAttr(lines)
  assert.equal(a.lossDelta, 25) // the before-peak 50u excluded by the window
  assert.equal(a.lossCount, 1)
  assert.deepEqual(a.lossKinds, { unknown: { u: 25, n: 1 } })
  assert.equal(a.pairMisses, 1)
})

test('pocket-killers: the v0.452.0 fields stay byte-identical on the killers fixtures; the counters-cover case skips the scan', () => {
  const lines = [
    hdr(400, 100),
    died('F4', 'mob by Skeleton'),
    'F4 [F4] death drop: ~25u lost at [-89,68,411] (oak_planks 5)',
    hdr(0, 40)
  ]
  const a = pocketDrainAttr(lines)
  // drop 60, banked 0, smelted 0 -> residual 60; legs 25 < 60
  assert.equal(a.lossDelta, 25)
  assert.equal(a.lossCount, 1)
  assert.equal(a.placedDelta, 0)
  assert.equal(a.legs, 25)
  assert.equal(a.attr, 'partial')
  // the counters cover the drop: residual <= 0 -> no scan, empty kinds
  const clean = [
    hdr(536, 100, 0, 0),
    died('F1', 'explosion by Creeper'),
    'F1 [F1] death drop: ~16u lost at [-109,68,408] (birch_planks 6)',
    hdr(0, 40, 80, 0)
  ]
  const c = pocketDrainAttr(clean)
  assert.equal(c.attr, 'none')
  assert.deepEqual(c.lossKinds, {})
  assert.equal(c.pairMisses, 0)
  assert.equal(c.lossDelta, 0)
})
// (v0.455.0) THE LENSES CONVERGE's tests - the balance's leak meets the
// event lens's whole-face legs (the same emitters' regexes, ALL lines, not
// post-peak). The covered anchor is face 36's real shape (legs 1189u vs
// leak 862u live, slack +327u - the ~Nu pricing's inflation margin; faces
// 34/35 covered too, +545/+548). The shortfall branch has NO live anchor
// yet - hand-built only, the honesty that would name an unpriced loss
// class. Every fixture hand-counted, each branch named.
test('balance-reconcile: covered - the legs meet the leak at the exact >= boundary (slack 0)', () => {
  const lines = [
    't-500s alive=19/19 mined=0 map=1p/1ch banked=0 smelted=0 pocket=10u/18s | sand=0',
    'F10 [F10] death drop: ~100u lost at [-121,54,371] (cobblestone 64)',
    'F9 [F9] death drop: ~200u lost at [-129,52,387] (sand 8)',
    'F7 [F7] climb bridge: placed dirt at [-135,64,419] (support)',
    'F7 [F7] climb bridge: placed dirt at [-136,64,419] (support)',
    'F7 [F7] climb bridge: placed cobblestone at [-117,64,383] (pit)',
    'F6 [F6] climb bridge: placed cobblestone at [-117,65,383] (pit)',
    't-0s alive=19/19 mined=400 map=9p/1ch banked=40 smelted=6 pocket=60u/131s | sand=0'
  ]
  const r = balanceReconcile(lines)
  assert.equal(r.leaks, 304) // 400 mined - (50 pocket + 40 banked + 6 smelted)
  assert.equal(r.lossDelta, 300)
  assert.equal(r.lossCount, 2)
  assert.equal(r.placedDelta, 4)
  assert.equal(r.legs, 304) // 300u of deaths + 4x 1u placements
  assert.equal(r.slack, 0) // 304 - 304: the >= boundary is inclusive
  assert.equal(r.verdict, 'covered')
  assert.equal(r.balanceVerdict, 'leaky') // 304/400 = 76% - the balance saw it too
})

test('balance-reconcile: shortfall - the leak nothing priced is named, not guessed', () => {
  // hand-built (no live anchor yet - faces 34/35/36 all covered): a face
  // whose leak nothing priced - no death drops, no climb placements
  // anywhere in the log, the leak survives
  const lines = [
    't-500s alive=19/19 mined=0 map=1p/1ch banked=0 smelted=0 pocket=0u/18s | sand=0',
    't-0s alive=19/19 mined=100 map=5p/1ch banked=40 smelted=0 pocket=10u/131s | sand=0'
  ]
  const r = balanceReconcile(lines)
  assert.equal(r.leaks, 50) // 100 mined - 50 sinks
  assert.equal(r.legs, 0)
  assert.equal(r.lossCount, 0)
  assert.equal(r.slack, -50)
  assert.equal(r.verdict, 'shortfall')
})

test('balance-reconcile: no-leak + the whole-face inclusion + honest nulls', () => {
  // inflated: the pocket ended high (crafting's unit inflation) - the
  // counters saw no leak; the legs' numbers still read (not discarded)
  const inf = [
    't-500s alive=19/19 mined=0 map=1p/1ch banked=0 smelted=0 pocket=10u/18s | sand=0',
    'F10 [F10] death drop: ~100u lost at [-121,54,371] (cobblestone 64)',
    't-0s alive=19/19 mined=90 map=9p/1ch banked=0 smelted=0 pocket=1180u/131s | sand=0'
  ]
  const ri = balanceReconcile(inf)
  assert.equal(ri.leaks, -1080) // 90 - 1170 - the sinks outran mined
  assert.equal(ri.legs, 100) // the event side still reads, honestly
  assert.equal(ri.lossCount, 1)
  assert.equal(ri.verdict, 'no-leak')
  // the whole-face inclusion: a death drop BEFORE the first pulse sample
  // (and before the peak) rides in the legs side while the drop lens's
  // post-peak scan excludes it - the two lenses' difference made explicit
  const pre = [
    'F10 [F10] death drop: ~114u lost at [-121,54,371] (cobblestone 64)',
    't-500s alive=19/19 mined=0 map=1p/1ch banked=0 smelted=0 pocket=200u/18s | sand=0',
    't-250s alive=19/19 mined=50 map=3p/1ch banked=0 smelted=0 pocket=400u/18s | sand=0',
    't-0s alive=19/19 mined=50 map=9p/1ch banked=390 smelted=0 pocket=10u/131s | sand=0'
  ]
  const a = pocketDrainAttr(pre)
  assert.equal(a.legs, 0) // the drop lens: post-peak only (the drop went to the bank)
  const rp = balanceReconcile(pre)
  assert.equal(rp.legs, 114) // the reconcile: ALL lines - the pre-sample death counts
  assert.equal(rp.lossCount, 1)
  // honest nulls
  assert.equal(balanceReconcile(['calm face']), null)
  assert.equal(balanceReconcile([]), null)
  assert.equal(balanceReconcile('not an array'), null)
  assert.equal(balanceReconcile(null), null)
})
