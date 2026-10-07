// THE HOT-SPOT LENS's unit pin (v0.419.0) - the failure geometry's
// cross-lane read. The verbatims are the field's own shapes: the tool
// lane's @x,z walk stamps (face 26, run 36864564525) and the hop lane's
// absolute chest coords (the hop-census v0.399.0 family). The lens's
// payoff shape is THE CROSS-LANE JOIN - the same planar spot failing in
// two lanes reads ONE spot with the geometry signature, never two
// lane-private rows.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseSpotCoord, hotspotCensus, hotspotBands, HOT_SPOT_COORD_RE, HOT_SPOT_BAND_RADIUS, hotSpotSeat, hotSpotSeatRow, hotSpotRiders, hotSpotRidersRow } from '../../src/lib/hotspot.mjs'
import fs from 'node:fs'

test('the tool-lane @coord verbatim (face 26): the nudge-retry nest, the coord, the lane, the why', () => {
  const hs = hotspotCensus([
    'F9 fuel commons: chest walk failed after the nudge (fuel commons walk @-148,412 (nudge retry): timeout after 2784ms)'
  ])
  assert.equal(hs.spots.length, 1)
  const sp = hs.spots[0]
  assert.equal(sp.key, '-148,412')
  assert.equal(sp.total, 1)
  assert.equal(sp.y, null) // the tool lanes carry no altitude - the honest null
  assert.deepEqual(sp.byLane, { 'fuel commons': 1 })
  assert.deepEqual(sp.byWhy, { 'walk-timeout': 1 })
  assert.deepEqual(sp.bots, { F9: 1 })
  assert.equal(hs.crossLaneSpots, 0)
  assert.equal(hs.spotTotal, 1)
})

test('the hop verbatim: the chest spot carries the altitude, the lane reads hop', () => {
  const hs = hotspotCensus([
    'F12 [F12] hop: chest at [-143,68,411] d=23 zero: chest unreachable (Took to long to decide path to goal!)'
  ])
  assert.equal(hs.spots.length, 1)
  const sp = hs.spots[0]
  assert.equal(sp.key, '-143,411')
  assert.equal(sp.y, 68)
  assert.deepEqual(sp.byLane, { hop: 1 })
  assert.deepEqual(sp.byWhy, { 'decide-timeout': 1 })
  assert.equal(hs.totals.hop, 1)
})

test('THE CROSS-LANE JOIN (the lens payoff, the face-26 evidence): @-118,412 tool + [-118,65,412] hop read ONE spot', () => {
  const hs = hotspotCensus([
    'F14 iron commune: chest walk failed (iron commune walk @-118,412: timeout after 528ms)',
    'F7 [F7] hop: chest at [-118,65,412] d=17 zero: chest unreachable (No path to the goal!)'
  ])
  assert.equal(hs.spots.length, 1) // TWO lanes, ONE planar spot - never two rows
  const sp = hs.spots[0]
  assert.equal(sp.key, '-118,412')
  assert.equal(sp.total, 2)
  assert.equal(sp.y, 65) // the hop sighting lends the altitude
  assert.deepEqual(sp.byLane, { 'iron commune': 1, hop: 1 })
  assert.deepEqual(sp.byWhy, { 'walk-timeout': 1, 'no-path': 1 })
  assert.equal(hs.crossLaneSpots, 1)
})

test('a single-lane spot is NOT the signature: same lane twice, cross-lane 0', () => {
  const hs = hotspotCensus([
    'F7 [F7] hop: chest at [-118,65,412] d=17 zero: chest unreachable (No path to the goal!)',
    'F9 [F9] hop: chest at [-118,65,412] d=39 zero: chest unreachable (No path to the goal!)'
  ])
  assert.equal(hs.spots.length, 1)
  assert.equal(hs.spots[0].total, 2)
  assert.deepEqual(hs.spots[0].byLane, { hop: 2 })
  assert.equal(hs.crossLaneSpots, 0)
})

test('a chest-walk fail with no @coord in the why: unpositioned, no spot invented', () => {
  const hs = hotspotCensus([
    'F2 fuel commons: chest walk failed after the nudge (No path to the goal!)'
  ])
  assert.equal(hs.spots.length, 0)
  assert.equal(hs.spotTotal, 0)
  assert.equal(hs.unpositioned.walkFails, 1)
  assert.equal(hs.totals.walkFails, 1)
})

test("the hop '?' placeholder: unpositioned (no position, no bucket - the hopcensus law)", () => {
  const hs = hotspotCensus([
    'F5 [F5] hop: chest at [?,68,?] d=4 zero: nothing to deposit'
  ])
  assert.equal(hs.spots.length, 0)
  assert.equal(hs.unpositioned.hop, 1)
  assert.equal(hs.totals.hop, 1)
})

test('the bank walk-backs ride the RELATIVE dist series - never forged into absolute spots', () => {
  const hs = hotspotCensus([
    'F9 bank: chest unreachable (Took to long to decide path to goal!) (7 blocks from yard) - walking back',
    'F10 bank: no chest in range (12 blocks from yard) - walking back',
    'F9 bank: chest unreachable (No path to the goal!) (30 blocks from yard) - walking back'
  ])
  assert.equal(hs.spots.length, 0)
  assert.deepEqual(hs.bankDists, { n: 3, max: 30, sum: 49 })
  assert.equal(hs.totals.bankWalkBacks, 3)
})

test('the accumulation hand-counted: top ordering total-desc, tie reads key-asc (deterministic)', () => {
  const hs = hotspotCensus([
    // spot A (-118,412): 3 failures (2 hop + 1 tool)
    'F7 [F7] hop: chest at [-118,65,412] d=17 zero: chest unreachable (No path to the goal!)',
    'F9 [F9] hop: chest at [-118,65,412] d=39 zero: chest unreachable (Took to long to decide path to goal!)',
    'F14 iron commune: chest walk failed (iron commune walk @-118,412: timeout after 528ms)',
    // spot B (-136,58): 2 failures (tool only)
    'F7 fuel commons: chest walk failed after the nudge (fuel commons walk @-136,58 (nudge retry): timeout after 2784ms)',
    'F13 iron commune: chest walk failed (iron commune walk @-136,58: timeout after 900ms)',
    // spot C (-148,412): 1 failure (tool only)
    'F9 fuel commons: chest walk failed after the nudge (fuel commons walk @-148,412 (nudge retry): timeout after 2784ms)'
  ])
  assert.equal(hs.spots.length, 3)
  assert.deepEqual(hs.spots.map((s) => s.key), ['-118,412', '-136,58', '-148,412'])
  assert.deepEqual(hs.spots.map((s) => s.total), [3, 2, 1])
  // TWO cross-lane spots: A joins hop+iron commune, B joins fuel commons+
  // iron commune (two distinct tool lanes are distinct walkers - the
  // signature reads the walkers, not the lane family)
  assert.equal(hs.crossLaneSpots, 2)
  assert.equal(hs.spotTotal, 6)
  // the y rides only where a hop sighting lent it
  assert.equal(hs.spots[0].y, 65)
  assert.equal(hs.spots[1].y, null)
})

test('the junk battery: non-strings, the sweep verdicts, the delivered side, the doom line - none forge a spot', () => {
  const hs = hotspotCensus([
    42, null, undefined,
    'F5 sweep: 0 collected - machine unreachable (walk to a machine (sweep): timeout after 4659ms) x1',
    'F9 final bank: +234',
    'F9 bank: chest unreachable (No path to the goal!) - the walk ladder cannot climb, the pocket rides the next window',
    'F12 hop: chest at [-143,68,411] zero: nothing to deposit', // untagged hop - NOT the hop emitter's shape (the [F12] tag is required)
    'random prose with @-100,200 planted inside'
  ])
  assert.equal(hs.spots.length, 0)
  assert.equal(hs.spotTotal, 0)
  assert.equal(hs.totals.hop, 0)
  assert.equal(hs.totals.walkFails, 0)
  assert.equal(hs.totals.bankWalkBacks, 0)
})

test('the honest zeros: empty input and non-array read the empty row shape', () => {
  for (const input of [[], undefined, null, 'not an array']) {
    const hs = hotspotCensus(input)
    assert.equal(hs.spots.length, 0)
    assert.equal(hs.spotTotal, 0)
    assert.equal(hs.crossLaneSpots, 0)
    assert.deepEqual(hs.bankDists, { n: 0, max: 0, sum: 0 })
    assert.deepEqual(hs.unpositioned, { hop: 0, walkFails: 0 })
  }
})

test('parseSpotCoord: the FIRST @coord wins, prose after it never re-stamps', () => {
  assert.deepEqual(parseSpotCoord('iron commune walk @-118,404: timeout after 528ms'), { x: -118, z: 404 })
  assert.deepEqual(parseSpotCoord('fuel commons walk @-148,412 (nudge retry): timeout after 2784ms'), { x: -148, z: 412 })
  assert.deepEqual(parseSpotCoord('a walk @1,2 past prose @3,4'), { x: 1, z: 2 })
  assert.equal(parseSpotCoord('No path to the goal!'), null)
  assert.equal(parseSpotCoord(''), null)
  assert.equal(parseSpotCoord(null), null)
  assert.equal(parseSpotCoord(42), null)
})

test('the coord regex shape: negatives and multi-digit planes read whole', () => {
  assert.ok(HOT_SPOT_COORD_RE instanceof RegExp)
  const m = 'walk @-12000,-40000: x'.match(HOT_SPOT_COORD_RE)
  assert.equal(m[1], '-12000')
  assert.equal(m[2], '-40000')
})

// ---- (v0.421.0) THE HOT-SPOT BAND - the neighbors merge ----

test('THE FACE-23 BAND (the field payoff): the z=388 strip -123..-125 reads ONE cross-lane band', () => {
  const hs = hotspotCensus([
    // [-123,388]: hop x2 + iron commune x1
    'F11 [F11] hop: chest at [-123,73,388] d=8 zero: chest unreachable (timeout after 15000ms)',
    'F17 [F17] hop: chest at [-123,73,388] d=9 zero: chest unreachable (No path to the goal!)',
    'F17 iron commune: chest walk failed (iron commune walk @-123,388: timeout after 528ms)',
    // [-125,388]: hop x2
    'F12 [F12] hop: chest at [-125,73,388] d=11 zero: chest unreachable (chest unreachable (budget exhausted (walk floor)))',
    'F11 [F11] hop: chest at [-125,73,388] d=12 zero: chest unreachable (timeout after 15000ms)',
    // [-124,388]: hop x1 - the chain link
    'F12 [F12] hop: chest at [-124,73,388] d=10 zero: chest unreachable (No path to the goal!)',
    // a far lone spot outside the strip
    'F5 [F5] hop: chest at [-139,73,414] d=20 zero: chest unreachable (Took to long to decide path to goal!)'
  ])
  const bd = hotspotBands(hs.spots)
  assert.equal(bd.radius, HOT_SPOT_BAND_RADIUS)
  assert.equal(bd.bands.length, 1)
  const band = bd.bands[0]
  assert.equal(band.key, '-123,388')
  assert.deepEqual(band.spots, ['-123,388', '-124,388', '-125,388'])
  assert.equal(band.total, 6)
  assert.deepEqual(band.byLane, { hop: 5, 'iron commune': 1 })
  assert.equal(band.crossLane, true)
  assert.equal(bd.bandTotal, 6)
  assert.equal(bd.bandSpots, 3)
  assert.equal(bd.singleSpots, 1) // [-139,414] stands alone
  assert.equal(bd.spotTotal, 7)
})

test('THE FACE-27 SIGNATURE shape: a hop-only spot beside a cross-lane spot still reads a cross-lane BAND', () => {
  const hs = hotspotCensus([
    'F15 [F15] hop: chest at [-121,80,389] d=11 zero: chest unreachable (Took to long to decide path to goal!)',
    'F18 [F18] hop: chest at [-121,80,389] d=12 zero: chest unreachable (chest unreachable (budget exhausted (walk floor)))',
    'F15 iron commune: chest walk failed (iron commune walk @-122,389: timeout after 528ms)',
    'F7 [F7] hop: chest at [-122,80,389] d=10 zero: chest unreachable (No path to the goal!)'
  ])
  const bd = hotspotBands(hs.spots)
  assert.equal(bd.bands.length, 1)
  assert.deepEqual(bd.bands[0].spots, ['-121,389', '-122,389'])
  assert.deepEqual(bd.bands[0].byLane, { hop: 3, 'iron commune': 1 })
  // THE BAND-LEVEL PAYOFF: neither point alone tells the strip's story as
  // strongly - the band unites the splintered signature.
  assert.equal(bd.bands[0].crossLane, true)
  assert.deepEqual(bd.bands[0].byWhy, { 'decide-timeout': 1, 'budget-floor': 1, 'walk-timeout': 1, 'no-path': 1 })
  assert.deepEqual(bd.bands[0].bots, { F15: 2, F18: 1, F7: 1 })
})

test('distant spots never band: manhattan beyond the radius reads singles', () => {
  const bd = hotspotBands([
    { key: '0,0', total: 3, byLane: { hop: 3 }, byWhy: { 'no-path': 3 }, bots: { F1: 3 } },
    { key: '0,5', total: 2, byLane: { hop: 2 }, byWhy: { 'no-path': 2 }, bots: { F2: 2 } },
    { key: '7,0', total: 1, byLane: { hop: 1 }, byWhy: { 'no-path': 1 }, bots: { F3: 1 } }
  ])
  assert.equal(bd.bands.length, 0)
  assert.equal(bd.singleSpots, 3)
  assert.equal(bd.bandTotal, 0)
  assert.equal(bd.bandSpots, 0)
  assert.equal(bd.spotTotal, 6)
})

test('the chain matters (single linkage): A-B 4 and B-C 4 band together, A-C 8 apart', () => {
  const bd = hotspotBands([
    { key: '0,0', total: 1, byLane: { hop: 1 }, byWhy: { 'no-path': 1 }, bots: { F1: 1 } },
    { key: '0,4', total: 1, byLane: { hop: 1 }, byWhy: { 'no-path': 1 }, bots: { F1: 1 } },
    { key: '0,8', total: 1, byLane: { hop: 1 }, byWhy: { 'no-path': 1 }, bots: { F2: 1 } }
  ])
  assert.equal(bd.bands.length, 1)
  assert.deepEqual(bd.bands[0].spots, ['0,0', '0,4', '0,8'])
  assert.equal(bd.bands[0].total, 3)
})

test('the radius override: 2 splits what 4 bands; junk radii fall back to the default', () => {
  const spots = [
    { key: '0,0', total: 1, byLane: { hop: 1 }, byWhy: { 'no-path': 1 }, bots: { F1: 1 } },
    { key: '3,0', total: 1, byLane: { hop: 1 }, byWhy: { 'no-path': 1 }, bots: { F1: 1 } }
  ]
  const wide = hotspotBands(spots, { radius: 4 })
  assert.equal(wide.bands.length, 1)
  const tight = hotspotBands(spots, { radius: 2 })
  assert.equal(tight.bands.length, 0)
  assert.equal(tight.singleSpots, 2)
  assert.equal(tight.radius, 2)
  for (const junk of [0, -1, NaN, '4', null, Infinity]) {
    assert.equal(hotspotBands(spots, { radius: junk }).radius, HOT_SPOT_BAND_RADIUS)
  }
})

test('band ordering: total desc, the tie reads key-asc (the spots row own law)', () => {
  const bd = hotspotBands([
    { key: '50,50', total: 3, byLane: { hop: 3 }, byWhy: { 'no-path': 3 }, bots: { F9: 3 } },
    { key: '51,50', total: 0, byLane: {}, byWhy: {}, bots: {} }, // the zero-total link still bands
    { key: '10,10', total: 3, byLane: { hop: 3 }, byWhy: { 'no-path': 3 }, bots: { F1: 3 } },
    { key: '11,10', total: 1, byLane: { hop: 1 }, byWhy: { 'no-path': 1 }, bots: { F1: 1 } }
  ])
  assert.deepEqual(bd.bands.map((b) => b.key), ['10,10', '50,50'])
  assert.deepEqual(bd.bands.map((b) => b.total), [4, 3])
})

test('a single-lane band is NOT the signature: crossLane false', () => {
  const bd = hotspotBands([
    { key: '-5,5', total: 2, byLane: { hop: 2 }, byWhy: { 'no-path': 2 }, bots: { F1: 1, F2: 1 } },
    { key: '-6,5', total: 1, byLane: { hop: 1 }, byWhy: { 'budget-floor': 1 }, bots: { F3: 1 } }
  ])
  assert.equal(bd.bands.length, 1)
  assert.equal(bd.bands[0].crossLane, false)
  assert.deepEqual(bd.bands[0].byLane, { hop: 3 })
})

test('the band read is PURE: a deep-frozen spots row survives untouched', () => {
  const spots = [
    Object.freeze({ key: '-1,1', total: 2, byLane: Object.freeze({ hop: 2 }), byWhy: Object.freeze({ 'no-path': 2 }), bots: Object.freeze({ F1: 2 }) }),
    Object.freeze({ key: '-1,2', total: 1, byLane: Object.freeze({ hop: 1 }), byWhy: Object.freeze({ 'no-path': 1 }), bots: Object.freeze({ F2: 1 }) })
  ]
  const bd = hotspotBands(Object.freeze(spots))
  assert.equal(bd.bands.length, 1)
  assert.equal(bd.bands[0].total, 3)
  // the merged maps are fresh objects, the inputs still hold their own counts
  assert.deepEqual(spots[0].byLane, { hop: 2 })
})

test("the band junk battery: unparseable keys never band and never band others", () => {
  const bd = hotspotBands([
    { key: 'junk', total: 5, byLane: { hop: 5 }, byWhy: { 'no-path': 5 }, bots: { F1: 5 } },
    { key: '1,2,3', total: 2, byLane: { hop: 2 }, byWhy: {}, bots: {} },
    { key: null, total: 1, byLane: {}, byWhy: {}, bots: {} },
    { total: 1, byLane: {}, byWhy: {}, bots: {} },
    42, null, undefined,
    { key: 'x,y', total: 1, byLane: { hop: 1 }, byWhy: {}, bots: {} }, // NaN planes refuse
    { key: '0,0', total: 1, byLane: { hop: 1 }, byWhy: { 'no-path': 1 }, bots: { F2: 1 } }
  ])
  assert.equal(bd.bands.length, 0)
  assert.equal(bd.singleSpots, 1) // only the real '0,0' survives to banding
  assert.equal(bd.spotTotal, 1)
  assert.equal(bd.bandTotal, 0)
})

test('the band honest zeros: empty input and non-array read the empty band shape', () => {
  for (const input of [[], undefined, null, 'not an array', 42]) {
    const bd = hotspotBands(input)
    assert.deepEqual(bd, { bands: [], bandTotal: 0, bandSpots: 0, singleSpots: 0, spotTotal: 0, radius: HOT_SPOT_BAND_RADIUS })
  }
})

// (v0.794.0) THE HOT SPOT'S OWN SEAT tests - the face 82 yard's own cell
// hand-counted (27 spots holding 60 failures: the leader [-110,409] x6,
// the x4 ties [-129,389]/[-140,411]/[-140,413], the x3 [-115,405], a tail
// of 17 x2 + 5 x1) - the riders price the pair the solo law refused to
// seat, the owner case rides the real parser's own join.
const spot = (key, total) => ({ key, total, byLane: {}, byWhy: {}, bots: {}, y: null })
const FACE82 = [
  spot('-110,409', 6),
  spot('-129,389', 4),
  spot('-140,411', 4),
  spot('-140,413', 4),
  spot('-115,405', 3),
  ...['-150,420', '-150,422', '-151,424', '-152,426', '-153,428', '-154,430', '-155,432', '-156,434', '-157,436', '-158,438', '-159,440', '-160,442', '-161,444', '-162,446', '-163,448', '-164,450', '-165,452'].map(k => spot(k, 2)),
  ...['-170,460', '-171,462', '-172,464', '-173,466', '-174,468'].map(k => spot(k, 1))
]

test('the face 82 cell through the seat law: the 27-spot crowd - the riders price the pair (the byte-exact row); the owner case rides the real parser', () => {
  // the census's own cell shape: the tally reads the spots array's own
  // totals (the sum = the face's 60 positioned failures)
  const hs = { spots: FACE82, spotTotal: 60, unpositioned: { hop: 0, walkFails: 8 } }
  assert.equal(hotSpotSeat(hs), null, '6 of 60 - below half, no solo seat')
  const r = hotSpotRiders(hs)
  assert.deepEqual(r, { leader: '-110,409', leaderOwns: 6, runner: '-129,389', runnerOwns: 4, ofFailures: 60, pairOwns: 10, shareOfFailures: 0.167, duet: false })
  assert.equal(
    hotSpotRidersRow(r),
    "the hot spot's own riders (v0.794.0): no solo spot owns the majority - spot [-110,409] x6 + spot [-129,389] x4 own 10 of 60 failure(s) (16.7%) - THE SPOT'S OWN MIX: the seat's tie law held, the mix is the shape - the spots' own geometry prices the book the solo law refused to seat"
  )
  // the owner case through the REAL parser: 3 hops at one chest + 2 at
  // another - the seat fires above half, the riders stay a MEASURE beside
  // it (the decompose's branch law leaves the companion unprinted, the
  // function's own shape never gates)
  const live = hotspotCensus([
    'F12 [F12] hop: chest at [-143,68,411] d=23 zero: chest unreachable (Took to long to decide path to goal!)',
    'F13 [F13] hop: chest at [-143,70,411] d=25 zero: chest unreachable (Took to long to decide path to goal!)',
    'F14 [F14] hop: chest at [-143,69,411] d=27 zero: chest unreachable (No path to the goal!)',
    'F15 [F15] hop: chest at [-118,65,412] d=17 zero: chest unreachable (No path to the goal!)',
    'F16 [F16] hop: chest at [-118,66,412] d=19 zero: chest unreachable (No path to the goal!)'
  ])
  const s = hotSpotSeat(live)
  assert.deepEqual(s, { spot: '-143,411', owns: 3, ofFailures: 5, shareOfFailures: 0.6 })
  assert.equal(
    hotSpotSeatRow(s),
    "the hot spot's own seat (v0.794.0): spot [-143,411] owns 3 of 5 failure(s) (60.0%) - THE SPOT'S OWN SEAT: one spot's own failures own the starvation book - the yard's own map prices the cure the raw split rode unnamed"
  )
  const rm = hotSpotRiders(live)
  assert.equal(rm.leader, '-143,411')
  assert.equal(rm.runner, '-118,412')
  assert.equal(rm.pairOwns, 5)
  assert.equal(rm.duet, false)
})

test("the tie owns nothing, the below-half fence, the duet byte order pin '-100,300' < '-300,300'", () => {
  // the tie law: 1 + 1 owns nothing solo - the riders price the duet (the
  // byte order broke the rank tie: '-100,300' < '-300,300')
  const tie = { spots: [spot('-300,300', 1), spot('-100,300', 1)], spotTotal: 2, unpositioned: { hop: 0, walkFails: 0 } }
  assert.equal(hotSpotSeat(tie), null)
  const r = hotSpotRiders(tie)
  assert.deepEqual(r, { leader: '-100,300', leaderOwns: 1, runner: '-300,300', runnerOwns: 1, ofFailures: 2, pairOwns: 2, shareOfFailures: 1, duet: true })
  assert.equal(
    hotSpotRidersRow(r),
    "the hot spot's own riders (v0.794.0): no solo spot owns the majority - spot [-100,300] x1 + spot [-300,300] x1 own 2 of 2 failure(s) (100.0%) - THE SPOT'S OWN MIX: the seat's tie law held, the mix is the shape - the spots' own geometry prices the book the solo law refused to seat"
  )
  // the below-half fence: the top spot at exactly half reads no solo seat
  const half = { spots: [spot('-200,300', 2), spot('-100,300', 1), spot('-300,300', 1)], spotTotal: 4, unpositioned: { hop: 0, walkFails: 0 } }
  assert.equal(hotSpotSeat(half), null)
  const rh = hotSpotRiders(half)
  assert.equal(rh.leader, '-200,300')
  assert.equal(rh.runner, '-100,300')
  assert.equal(rh.pairOwns, 3)
  assert.equal(rh.ofFailures, 4)
  assert.equal(rh.duet, false)
})

test("the book is the cells' own sum - the unpositioned stay outside - and the single-spot fence holds the seat row", () => {
  // the census's own counting law: an unpositioned failure rides no spot -
  // the seat reads the SPOT cells' own book, never the spotTotal counter
  // (a junk census may trail the counter - the cell keeps its own)
  const census = { spots: [spot('0,0', 3), spot('50,50', 1)], spotTotal: 99, unpositioned: { hop: 2, walkFails: 1 } }
  const s = hotSpotSeat(census)
  assert.equal(s.ofFailures, 4)
  assert.equal(s.owns, 3)
  // the single-spot fence: one counted spot reads a seat but no riders
  // (fewer than two cells - the honest silence's companion law)
  const solo = { spots: [spot('0,0', 3)], spotTotal: 3, unpositioned: { hop: 0, walkFails: 0 } }
  const soloSeat = hotSpotSeat(solo)
  assert.deepEqual(soloSeat, { spot: '0,0', owns: 3, ofFailures: 3, shareOfFailures: 1 })
  assert.equal(hotSpotRiders(solo), null)
  // the all-unpositioned face (no spots at all) reads the honest silence
  const blind = hotspotCensus([
    'F9 fuel commons: chest walk failed (fuel commons walk: timeout after 528ms)'
  ])
  assert.equal(blind.spots.length, 0)
  assert.equal(hotSpotSeat(blind), null)
  assert.equal(hotSpotRiders(blind), null)
})

test('the junk battery + the WIRING assert - the decompose branch rides the cell, the prose lives only in the lib', () => {
  // the junk battery: junk never invents a spot (the honest silence)
  assert.equal(hotSpotSeat(null), null)
  assert.equal(hotSpotSeat(undefined), null)
  assert.equal(hotSpotSeat(42), null)
  assert.equal(hotSpotSeat([1, 2]), null)
  assert.equal(hotSpotSeat({}), null)
  assert.equal(hotSpotSeat({ spots: [] }), null)
  assert.equal(hotSpotSeat({ spots: 'nope' }), null)
  assert.equal(hotSpotSeat({ spots: [null] }), null)
  assert.equal(hotSpotSeat({ spots: [{ key: '-1,1', total: 0 }] }), null)
  assert.equal(hotSpotSeat({ spots: [{ key: '', total: 1 }] }), null)
  assert.equal(hotSpotSeat({ spots: [{ key: '-1,1', total: NaN }] }), null)
  assert.equal(hotSpotSeat({ spots: [{ key: '-1,1' }] }), null)
  // a junk cell is skipped honest, the real cell beside it still seats
  assert.deepEqual(hotSpotSeat({ spots: [null, { key: '-1,1', total: 1 }] }), { spot: '-1,1', owns: 1, ofFailures: 1, shareOfFailures: 1 })
  assert.equal(hotSpotSeatRow(null), null)
  assert.equal(hotSpotSeatRow({ spot: '', owns: 1, ofFailures: 1, shareOfFailures: 1 }), null)
  assert.equal(hotSpotSeatRow({ spot: '-1,1', owns: 2, ofFailures: 1, shareOfFailures: 2 }), null)
  assert.equal(hotSpotRiders(null), null)
  assert.equal(hotSpotRiders({}), null)
  assert.equal(hotSpotRidersRow(null), null)
  assert.equal(hotSpotRidersRow({ leader: '-1,1', leaderOwns: 0, runner: '-2,2', runnerOwns: 1, ofFailures: 2, pairOwns: 1, shareOfFailures: 0.5 }), null)
  // the WIRING assert - the decompose branch rides the spots rows, the
  // prose lives only in the lib
  const src = fs.readFileSync(new URL('../../scripts/fleet-mining/decompose.mjs', import.meta.url), 'utf8')
  assert.ok(src.includes('const hss = hotSpotSeat(hs)'), 'the seat rides the census cell')
  assert.ok(src.includes('if (hss) console.log(`  ${hotSpotSeatRow(hss)}`)'), 'the owner row rides the branch')
  assert.ok(src.includes('const hsr = hotSpotRiders(hs)'), 'the riders ride the same branch law')
  assert.ok(!src.includes("THE SPOT'S OWN SEAT"), 'the prose stays in the lib')
  assert.ok(!src.includes("THE SPOT'S OWN MIX"), 'the mix prose stays in the lib')
})
