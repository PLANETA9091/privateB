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
