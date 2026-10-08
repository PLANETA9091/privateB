// THE WATER HAZARD BOARD tests (v0.826.0) - the memorize line's own census,
// hand-counted against the face 101 field read (37752423490): 29 memorize
// lines, 28 distinct spots, one spot memorized TWICE ([-126,62,390] - F9
// died there twice, the fleet walked back into a spot the log had already
// named), the count cell peaking at 13 live and closing at 8, four
// step-downs (11+ records expired - the 240s TTL's own work) and one step
// past +1 (5->8: the board holds records the memorize line never wrote).
// The trajectory laws (a drop names >= k expired, a step-up past +1 names
// foreign records), the honest-claim line (a repeat claims 'memorized
// before', never 'still live'), the byte-exact row and the junk convention
// all pin here.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { HAZARD_MEMORIZE_RE, parseHazardMemorize, hazardBoardCensus, hazardBoardCensusRow } from '../../src/lib/waterhazard.mjs'

// THE MINI-FACE (hand-counted): the face-101 structure in six lines - the
// +3 jump, the repeat spot, the two step-downs (a drop while ADDING, then
// the big 9->2 shed).
const MINI = [
  'F15 [F15] water: death spot memorized as a hazard at [-1,61,384] (1 live, fleet-wide)',
  'F13 [F13] water: death spot memorized as a hazard at [-2,61,391] (2 live, fleet-wide)',
  'F18 [F18] water: death spot memorized as a hazard at [-3,62,390] (5 live, fleet-wide)',
  'F9 [F9] water: death spot memorized as a hazard at [-3,62,390] (4 live, fleet-wide)',
  'F4 [F4] water: death spot memorized as a hazard at [-4,61,386] (9 live, fleet-wide)',
  'F5 [F5] water: death spot memorized as a hazard at [-5,60,382] (2 live, fleet-wide)'
]

// THE FACE 101 REPEAT PAIR VERBATIM (the log's own cells - the same spot,
// the same 10-live cell, 361 lines apart; line order = time order).
const F101_DUP = [
  'F9 [F9] water: death spot memorized as a hazard at [-126,62,390] (10 live, fleet-wide)',
  'F9 [F9] water: death spot memorized as a hazard at [-126,62,390] (10 live, fleet-wide)'
]

test('waterhazard: the face-101 anatomy - the jump, the repeat, the drops, the byte-exact row', () => {
  const c = hazardBoardCensus(MINI)
  assert.ok(c)
  assert.equal(c.memorizes, 6)
  assert.equal(c.distinctSpots, 5)
  assert.equal(c.repeatSpots, 1)
  assert.equal(c.repeatMemorizes, 1)
  assert.equal(c.peakLive, 9)
  assert.equal(c.finalLive, 2)
  assert.equal(c.drops, 2)
  assert.equal(c.dropMass, 8) // the drop cells name >= |delta| expiries each (the adds can mask more): 1 + 7 = 8+
  assert.equal(c.jumps, 2) // 2->5 and 4->9, both past +1
  assert.equal(
    hazardBoardCensusRow(c),
    "the water hazard board's own read (v0.826.0): 6 memorize(s) at 5 spot(s), 1 spot(s) memorized twice - the water took a death on a spot the board had already memorized; peaked at 9 live, closed at 2, shrank 2 time(s) (8+ record(s) expired - the 240s TTL's own work), outgrew the death-spot writes 2 time(s) - the board holds records the memorize line never wrote"
  )
})

test('waterhazard: the repeat-spot law on the real face-101 pair + the clean board + the single line', () => {
  // The real dup pair: the same spot twice - the water took a death on a
  // spot the board had already memorized (the honest claim: line order
  // only, never 'the record was still live').
  const dup = hazardBoardCensus(F101_DUP)
  assert.ok(dup)
  assert.equal(dup.memorizes, 2)
  assert.equal(dup.distinctSpots, 1)
  assert.equal(dup.repeatSpots, 1)
  assert.equal(dup.repeatMemorizes, 1)
  assert.equal(dup.peakLive, 10)
  assert.equal(dup.finalLive, 10)
  assert.equal(dup.drops, 0)
  assert.equal(dup.jumps, 0)
  const dupRow = hazardBoardCensusRow(dup)
  assert.ok(dupRow.includes('1 spot(s) memorized twice'))
  assert.ok(dupRow.includes('never shrank this face'))
  assert.ok(!dupRow.includes('outgrew'))

  // The clean monotone board: no repeats, no drops, no jumps - every
  // clause rides its own honest silence.
  const clean = hazardBoardCensus([
    'F1 [F1] water: death spot memorized as a hazard at [10,61,384] (1 live, fleet-wide)',
    'F2 [F2] water: death spot memorized as a hazard at [11,61,391] (2 live, fleet-wide)',
    'F3 [F3] water: death spot memorized as a hazard at [12,62,390] (3 live, fleet-wide)'
  ])
  assert.ok(clean)
  assert.equal(clean.repeatSpots, 0)
  assert.equal(clean.drops, 0)
  assert.equal(clean.dropMass, 0)
  assert.equal(clean.jumps, 0)
  assert.equal(clean.peakLive, 3)
  assert.equal(clean.finalLive, 3)
  const cleanRow = hazardBoardCensusRow(clean)
  assert.equal(
    cleanRow,
    "the water hazard board's own read (v0.826.0): 3 memorize(s) at 3 spot(s), every spot took its death once; peaked at 3 live, closed at 3, never shrank this face"
  )

  // The single line: peak = final = the one cell, no steps exist.
  const one = hazardBoardCensus([MINI[0]])
  assert.ok(one)
  assert.equal(one.memorizes, 1)
  assert.equal(one.distinctSpots, 1)
  assert.equal(one.peakLive, 1)
  assert.equal(one.finalLive, 1)
  assert.equal(one.drops, 0)
  assert.equal(one.jumps, 0)

  // The raw blob input (the string form) reads the same truth.
  const blob = hazardBoardCensus(MINI.join('\n'))
  assert.deepEqual(
    { ...blob },
    { ...hazardBoardCensus(MINI) }
  )

  // The parse readback: the bot, the coords, the count.
  const p = parseHazardMemorize(MINI[0])
  assert.deepEqual(p, { bot: 'F15', x: -1, y: 61, z: 384, count: 1 })
  assert.ok(HAZARD_MEMORIZE_RE.test(MINI[2]))
  assert.ok(!HAZARD_MEMORIZE_RE.test('F15 [F15] water: death spot memorized as a hazard at [-1,61,384] (1 live, per-bot)'))
})

test('waterhazard: the junk battery + the honest silences', () => {
  // The junk convention: junk judges nothing.
  assert.equal(hazardBoardCensus(null), null)
  assert.equal(hazardBoardCensus(undefined), null)
  assert.equal(hazardBoardCensus(42), null)
  assert.equal(hazardBoardCensus({}), null)
  assert.equal(hazardBoardCensus([]), null)
  assert.equal(hazardBoardCensus(['no memorize lines here', 'F1 [F1] died - respawning (cause: server: drowned)']), null)

  // The pollution lesson (the v0.389.0 sweep's own class): the prose
  // carriers walk through, the anatomy holds.
  const mixed = hazardBoardCensus([
    'F16 steer hazard defer: coal_ore@-124,59,387 held behind the ledger (d 4.4) - a death is a cost the deficit cannot repay',
    MINI[0],
    'F15 [F15] water: death spot memorized as a hazard at [bad,61,384] (1 live, fleet-wide)',
    'F15 [F15] water: death spot memorized as a hazard at [-127,61,384] (-3 live, fleet-wide)',
    MINI[3],
    null,
    7
  ])
  assert.ok(mixed)
  assert.equal(mixed.memorizes, 2) // only the two anatomy-true lines count
  assert.equal(mixed.distinctSpots, 2)
  assert.equal(mixed.repeatSpots, 0)
  assert.equal(mixed.peakLive, 4)
  assert.equal(mixed.finalLive, 4)

  // The parse's own junk laws. The anatomy is start-anchored (the
  // deathsweep's own law): a trailing suffix does not break the shape -
  // a foreign line does.
  assert.equal(parseHazardMemorize(null), null)
  assert.equal(parseHazardMemorize(undefined), null)
  assert.equal(parseHazardMemorize(42), null)
  const tail = parseHazardMemorize('F15 [F15] water: death spot memorized as a hazard at [-127,61,384] (1 live, fleet-wide) XYZ')
  assert.deepEqual(tail, { bot: 'F15', x: -127, y: 61, z: 384, count: 1 })
  assert.equal(parseHazardMemorize('the board held 4 records'), null)
  assert.equal(parseHazardMemorize('X F15 [F15] water: death spot memorized as a hazard at [-127,61,384] (1 live, fleet-wide)'), null)

  // The row guards: a null census, a junk object, a zero book.
  assert.equal(hazardBoardCensusRow(null), null)
  assert.equal(hazardBoardCensusRow(undefined), null)
  assert.equal(hazardBoardCensusRow(42), null)
  assert.equal(hazardBoardCensusRow([]), null)
  assert.equal(hazardBoardCensusRow({ memorizes: 0, distinctSpots: 0, repeatSpots: 0, repeatMemorizes: 0, peakLive: 0, finalLive: 0, drops: 0, dropMass: 0, jumps: 0 }), null)
  assert.equal(hazardBoardCensusRow({ memorizes: NaN, distinctSpots: 1, repeatSpots: 0, repeatMemorizes: 0, peakLive: 1, finalLive: 1, drops: 0, dropMass: 0, jumps: 0 }), null)
})

// (v0.828.0) THE WALK-BACK SEAT - the board's own coverage read, imported
// beside the census tests. The join is the deathground square (BOTH axis
// deltas within R12, the edge rides), the honest-claim law ('named' is
// line order only - the TTL's liveness reads nowhere), the first memorize
// rides out of the denominator by construction and a zero share is the
// gate's own silence.

import { hazardWalkBack, hazardWalkBackRow, WALKBACK_RADIUS } from '../../src/lib/waterhazard.mjs'

// THE HAND-COUNTED MINI-FACE: A [-100,61,300] first (never a walk-back);
// B [-105,61,305] dx5/dz5 within; C [-130,61,300] dx30 vs A, dx25 vs B -
// beyond; D [-142,61,300] dx12 vs C - the EDGE rides the square.
const WB_MINI = [
  'F1 [F1] water: death spot memorized as a hazard at [-100,61,300] (1 live, fleet-wide)',
  'F2 [F2] water: death spot memorized as a hazard at [-105,61,305] (2 live, fleet-wide)',
  'F3 [F3] water: death spot memorized as a hazard at [-130,61,300] (3 live, fleet-wide)',
  'F4 [F4] water: death spot memorized as a hazard at [-142,61,300] (4 live, fleet-wide)'
]

test('waterhazard walk-back: the hand-counted square join + the edge + the real dup pair', () => {
  assert.equal(WALKBACK_RADIUS, 12)
  const w = hazardWalkBack(WB_MINI)
  assert.ok(w)
  assert.equal(w.memorizes, 4)
  assert.equal(w.eligible, 3) // the first memorize never walks back
  assert.equal(w.walkBacks, 2) // B (dx5/dz5) + D (the dx12 edge rides)
  assert.equal(w.clean, 1) // C beyond on both axes
  assert.equal(
    hazardWalkBackRow(w),
    "the hazard board's own walk-back (v0.828.0): 2 of 3 death(s) landed within 12 of water an earlier death had already named - the spot-exact board named the water one death at a time and the body kept the toll"
  )

  // The real face-101 dup pair: the same spot - dist 0, the square's own
  // center - the walk-back by construction.
  const dup = hazardWalkBack(F101_DUP)
  assert.ok(dup)
  assert.equal(dup.memorizes, 2)
  assert.equal(dup.eligible, 1)
  assert.equal(dup.walkBacks, 1)
  assert.equal(dup.clean, 0)

  // The blob form reads the same truth.
  assert.deepEqual({ ...hazardWalkBack(WB_MINI.join('\n')) }, { ...hazardWalkBack(WB_MINI) })
})

test('waterhazard walk-back: the zero-share silence + the empty denominator', () => {
  // Three spots 100 apart: every eligible death is clean water - the row
  // rides NO row (the gate's own law), the read itself stays honest.
  const spread = hazardWalkBack([
    'F1 [F1] water: death spot memorized as a hazard at [0,61,0] (1 live, fleet-wide)',
    'F2 [F2] water: death spot memorized as a hazard at [100,61,0] (2 live, fleet-wide)',
    'F3 [F3] water: death spot memorized as a hazard at [200,61,0] (3 live, fleet-wide)'
  ])
  assert.ok(spread)
  assert.equal(spread.eligible, 2)
  assert.equal(spread.walkBacks, 0)
  assert.equal(spread.clean, 2)
  assert.equal(hazardWalkBackRow(spread), null)

  // The single memorize: no earlier spot exists, the denominator is empty.
  const one = hazardWalkBack([WB_MINI[0]])
  assert.ok(one)
  assert.equal(one.memorizes, 1)
  assert.equal(one.eligible, 0)
  assert.equal(one.walkBacks, 0)
  assert.equal(hazardWalkBackRow(one), null)
})

test('waterhazard walk-back: the junk battery + the row guards', () => {
  assert.equal(hazardWalkBack(null), null)
  assert.equal(hazardWalkBack(undefined), null)
  assert.equal(hazardWalkBack(42), null)
  assert.equal(hazardWalkBack([]), null)
  assert.equal(hazardWalkBack(['junk only', 'no memorize here']), null)

  // Junk lines filtered, the anatomy-true ones still seat (the census's
  // own convention, one parser one truth).
  const mixed = hazardWalkBack([
    'F16 steer hazard defer: coal_ore@-124,59,387 held behind the ledger (d 4.4)',
    WB_MINI[0],
    WB_MINI[1],
    null,
    7
  ])
  assert.ok(mixed)
  assert.equal(mixed.memorizes, 2)
  assert.equal(mixed.eligible, 1)
  assert.equal(mixed.walkBacks, 1)

  // The row guards: a null read, junk shapes, non-finite cells.
  assert.equal(hazardWalkBackRow(null), null)
  assert.equal(hazardWalkBackRow(undefined), null)
  assert.equal(hazardWalkBackRow(42), null)
  assert.equal(hazardWalkBackRow([]), null)
  assert.equal(hazardWalkBackRow({ memorizes: 2, eligible: NaN, walkBacks: 1, clean: 0 }), null)
  assert.equal(hazardWalkBackRow({ memorizes: 2, eligible: 0, walkBacks: 0, clean: 0 }), null)
  assert.equal(hazardWalkBackRow({ memorizes: 2, eligible: 1, walkBacks: 0, clean: 1 }), null)
})

// ---- (v0.830.0) THE REFUSALS' OWN READ - the v0.829.0 cure's field instrument ----
// The digShaft gate's refusal line is the veto's own voice; its printed d is
// the pre/post read: PRE-cure every record vetoed at 4 euclidean, so d > 4
// could never print - any such line is the body veto's OWN FOOTPRINT. The
// hand rows below ride the emitter's exact template byte for byte.

import { HAZARD_REFUSAL_RE, parseHazardRefusal, hazardRefusalCensus, hazardRefusalCensusRow } from '../../src/lib/waterhazard.mjs'

test('hazardRefusalCensus: the hand-counted veto book + the footprint clause byte-exact', () => {
  const lines = [
    'F9 [F9] digShaft: water hazard 3.2b away (live 5) - refusing this column, the caller rotates',
    'F3 [F3] digShaft: water hazard 12.0b away (live 9) - refusing this column, the caller rotates',
    'F17 [F17] digShaft: water hazard 17.0b away (live 9) - refusing this column, the caller rotates'
  ]
  const c = hazardRefusalCensus(lines)
  assert.deepEqual(c, { refusals: 3, maxD: 17, overFour: 2, peakLive: 9 })
  const row = hazardRefusalCensusRow(c)
  assert.equal(row, "the water hazard refusals' own read (v0.830.0): 3 refusal(s), the farthest at 17.0b, 2 wide veto(s) past the 4b spot ceiling - the zone tier (v0.84.0) rides there too and so does the v0.829.0 body veto: the line alone cannot name the tier; the board held 9 live at the loudest veto")
  const p = parseHazardRefusal(lines[0])
  assert.deepEqual(p, { bot: 'F9', d: 3.2, live: 5 })
})

test('hazardRefusalCensus: the tier law - a pre-cure face CAN read wide vetoes (the zone tier rides past 4b on every tree)', () => {
  // the face 104 negative control that taught the law LIVE: 10 of 33
  // refusals past 4b on the PRE-cure v0.828.0 tree, the farthest at 10.1b
  // (the zone tier's envelopes, v0.84.0) - so the lens claims NO
  // impossibility, it prices the wide share and the tier stays unnamed
  const lines = [
    'F9 [F9] digShaft: water hazard 10.1b away (live 19) - refusing this column, the caller rotates',
    'F12 [F12] digShaft: water hazard 4.0b away (live 8) - refusing this column, the caller rotates'
  ]
  const c = hazardRefusalCensus(lines)
  assert.deepEqual(c, { refusals: 2, maxD: 10.1, overFour: 1, peakLive: 19 })
  assert.equal(hazardRefusalCensusRow(c), "the water hazard refusals' own read (v0.830.0): 2 refusal(s), the farthest at 10.1b, 1 wide veto(s) past the 4b spot ceiling - the zone tier (v0.84.0) rides there too and so does the v0.829.0 body veto: the line alone cannot name the tier; the board held 19 live at the loudest veto")
  const clean = hazardRefusalCensus(['F9 [F9] digShaft: water hazard 4.0b away (live 8) - refusing this column, the caller rotates'])
  assert.deepEqual(clean, { refusals: 1, maxD: 4, overFour: 0, peakLive: 8 })
  assert.equal(hazardRefusalCensusRow(clean), "the water hazard refusals' own read (v0.830.0): 1 refusal(s), the farthest at 4.0b, none past the 4b spot ceiling this face; the board held 8 live at the loudest veto")
  assert.match(HAZARD_REFUSAL_RE.source, /\^\^?F\\d\+/)
})

test('hazardRefusalCensus: the junk battery + the row guards', () => {
  // the v0.389.0 pollution lesson: junk never invents a record
  for (const junk of [null, undefined, 42, {}, [], 'F9 [F9] water: hazard memorized at [-126,62,390] (5 live, fleet-wide)', 'F9 [F9] digShaft: water hazard -1.0b away (live 5) - refusing this column, the caller rotates', 'F9 [F9] digShaft: water hazard 3.2b away (live -2) - refusing this column, the caller rotates', 'x F9 [F9] digShaft: water hazard 3.2b away (live 5) - refusing this column, the caller rotates']) {
    assert.equal(parseHazardRefusal(junk), null, `junk reads null: ${JSON.stringify(junk)}`)
  }
  // the deathsweep family law: a SUFFIX never breaks the anatomy (the head
  // anchor is the law) - the emitter's own tail rides, foreign tails parse
  assert.ok(parseHazardRefusal('F9 [F9] digShaft: water hazard 3.2b away (live 5) - refusing this column, the caller rotates and more'), 'a suffixed line still parses (the start-anchored law)')
  assert.equal(hazardRefusalCensus(['not a refusal']), null, 'zero valid lines: the honest silence')
  assert.equal(hazardRefusalCensus('nope'), null, 'a blob of nothing: null')
  assert.equal(hazardRefusalCensusRow(null), null, 'a null census never prints')
  assert.equal(hazardRefusalCensusRow({ refusals: 0, maxD: 0, overFour: 0, peakLive: 0 }), null, 'a zero-refusal book never prints (the gate never spoke)')
  assert.equal(hazardRefusalCensusRow({ refusals: 2, maxD: NaN, overFour: 0, peakLive: 3 }), null, 'a junk cell never prints')
})
