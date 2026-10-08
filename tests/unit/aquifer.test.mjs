// THE AQUIFER'S OWN BOOK tests (v0.832.0) - the water table program's two
// voices read back, hand-counted against the REAL face reads: face 105
// (37766270261, the cure's debut tree) carried 21 water strikes, 44 lids,
// the emitters' regions readback peaking at 2 and zero give-ups; face 104
// (37762508948, the pre-cure tree) carried 44 water strikes, ZERO lids and
// the readback peaking at 4 - the strike/lid arc IS the board's maturity
// trend (the lens prices the book and names NO cause, the trend law). The
// give-up terminals' two forms (the fluid/drop carousel, the undiggable
// floor), the honest silence (a face none of the four voices spoke on),
// the byte-exact rows and the junk convention all pin here.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AQUIFER_STRIKE_RE, AQUIFER_LID_RE, AQUIFER_GIVEUP_RE, parseAquiferStrike, parseAquiferLid, parseAquiferGiveup, aquiferCensus, aquiferCensusRow } from '../../src/lib/aquifer.mjs'

// THE REAL LINES (byte-verbatim from face 105's fleet19.log and the
// emitter templates in miner.mjs digShaft - the Vec3's own parens form on
// the strike position, the regions cell on both voices).
const STRIKE_WATER = 'F2 [F2] digShaft: water strike at y=50 -> water table (regions 1); fluid below (-117, 51, 398) - moving sideways'
const STRIKE_WATER2 = 'F6 [F6] digShaft: water strike at y=45 -> water table (regions 2); fluid below (-131, 46, 402) - moving sideways'
const STRIKE_LAVA = 'F7 [F7] digShaft: lava strike at y=22 -> water table (regions 3); fluid below (-129, 23, 400) - moving sideways'
const LID = 'F9 [F9] digShaft: water table y=49 (region strike) - stopping above the aquifer, the tunnel owns this level (regions 2)'
const LID4 = 'F9 [F9] digShaft: water table y=44 (region strike) - stopping above the aquifer, the tunnel owns this level (regions 4)'
const GIVEUP_CAROUSEL = 'F2 [F2] digShaft: giving up this shaft (6 fluid/drop sidesteps, no dig between) - the caller rotates'
const GIVEUP_FLOOR = 'F2 [F2] digShaft: giving up this shaft (3 sidesteps, undiggable floor) - the caller rotates'

test('v0.832.0 the strike and lid parse verbatim; the give-up forms discriminate; junk in null out', () => {
  const s = parseAquiferStrike(STRIKE_WATER)
  assert.deepEqual(s, { name: 'water', y: 50, regions: 1, pos: { x: -117, y: 51, z: 398 } })
  const lava = parseAquiferStrike(STRIKE_LAVA)
  assert.equal(lava.name, 'lava')
  assert.equal(parseAquiferLid(LID).y, 49)
  assert.equal(parseAquiferLid(LID).regions, 2)
  assert.deepEqual(parseAquiferGiveup(GIVEUP_CAROUSEL), { cause: 'fluidDrop', count: 6 })
  assert.deepEqual(parseAquiferGiveup(GIVEUP_FLOOR), { cause: 'floor', count: 3 })

  // junk battery (the v0.389.0 pollution lesson): non-strings, foreign
  // heads, truncated tails, negative and non-finite cells all read null.
  assert.equal(parseAquiferStrike(null), null)
  assert.equal(parseAquiferStrike(42), null)
  assert.equal(parseAquiferStrike(`X9 [X9] ${STRIKE_WATER}`), null) // a foreign head never rides
  assert.equal(parseAquiferStrike(STRIKE_WATER.slice(0, -10)), null) // the start-anchored law: a truncated tail is junk
  assert.equal(parseAquiferStrike('F2 [F2] digShaft: -5 strike at y=50 -> water table (regions 1); fluid below (-117, 51, 398) - moving sideways'), null)
  assert.equal(parseAquiferLid(undefined), null)
  assert.equal(parseAquiferLid('F9 [F9] digShaft: water table y=49 (region strike) - stopping above the aquifer, the tunnel owns this level'), null)
  assert.equal(parseAquiferGiveup(null), null)
  assert.equal(parseAquiferGiveup('F2 [F2] digShaft: giving up this shaft (99 unknown sidesteps, no dig between) - the caller rotates'), null)

  // the regexes export the same anatomy the parsers ride (one truth).
  assert.ok(AQUIFER_STRIKE_RE.test(STRIKE_WATER2))
  assert.ok(AQUIFER_LID_RE.test(LID4))
  assert.ok(AQUIFER_GIVEUP_RE.test(GIVEUP_CAROUSEL))
})

test('v0.832.0 the census hand-counts the real face shapes; the honest silence rides both empty laws', () => {
  // FACE 105's own shape (hand-counted against the log): 21 strikes all
  // water, 44 lids, the emitters' readback peaked at 2, zero give-ups.
  const face105 = aquiferCensus([
    STRIKE_WATER, STRIKE_WATER2, STRIKE_WATER, STRIKE_WATER2,
    LID, LID, LID4.replace('regions 4', 'regions 2'),
    LID, LID
  ])
  // the test face here is a mini-shape, hand-counted: 4 strikes (0 lava),
  // 5 lids, peak 2 (the regions 4 line swapped to 2 - the real face's peak
  // cell rides the same read), 0 give-ups.
  assert.deepEqual(face105, { strikes: 4, waterStrikes: 4, lavaStrikes: 0, lids: 5, peakRegions: 2, giveups: 0, giveupsCarousel: 0, giveupsFloor: 0, maxConsec: 0 })

  // the full give-up book: both terminals counted, the max consec rides
  // the largest count cell (the cap is 6 - a 7 can never print).
  const book = aquiferCensus([STRIKE_LAVA, GIVEUP_CAROUSEL, GIVEUP_FLOOR])
  assert.deepEqual(book, { strikes: 1, waterStrikes: 0, lavaStrikes: 1, lids: 0, peakRegions: 3, giveups: 2, giveupsCarousel: 1, giveupsFloor: 1, maxConsec: 6 })

  // the blob form reads the same book (the array-or-blob convention).
  assert.deepEqual(aquiferCensus([STRIKE_WATER, GIVEUP_FLOOR].join('\n')), aquiferCensus([STRIKE_WATER, GIVEUP_FLOOR]))

  // the honest silence: a face none of the four voices spoke on reads
  // null; junk-only and the empty log ride the same null; non-array
  // non-string input too.
  assert.equal(aquiferCensus(['F2 [F2] some other line', '']), null)
  assert.equal(aquiferCensus([]), null)
  assert.equal(aquiferCensus(42), null)
  assert.equal(aquiferCensus(null), null)
})

test('v0.832.0 the byte-exact rows price the book and name no cause; the row guards hold', () => {
  // face 105's real row (21 water strikes, 44 lids, peak 2, no give-ups).
  const row105 = aquiferCensusRow(aquiferCensus([
    ...Array.from({ length: 21 }, (_, i) => STRIKE_WATER2.replace('regions 2', `regions ${i < 19 ? 1 : 2}`)),
    ...Array.from({ length: 44 }, () => LID)
  ]))
  assert.equal(row105, "the aquifer's own book (v0.832.0): 21 strike(s) (21 water, 0 lava) wrote the board, 44 lid(s) stopped above it, the board peaked at 2 region(s), 0 give-up(s) (0 carousel, 0 floor)")

  // face 104's real row (the pre-cure tree: 44 strikes, ZERO lids, peak 4)
  // - the both-shapes honesty: the lid clause reads its zero plainly.
  const row104 = aquiferCensusRow(aquiferCensus([
    ...Array.from({ length: 44 }, (_, i) => STRIKE_WATER2.replace('regions 2', `regions ${i < 40 ? 1 : 4}`)),
    GIVEUP_CAROUSEL.replace('6', '4')
  ]))
  assert.equal(row104, "the aquifer's own book (v0.832.0): 44 strike(s) (44 water, 0 lava) wrote the board, 0 lid(s) stopped above it, the board peaked at 4 region(s), 1 give-up(s) (1 carousel, 0 floor)")

  // the guards: null census, junk shape, non-finite cells and the
  // all-zero book all read the honest silence.
  assert.equal(aquiferCensusRow(null), null)
  assert.equal(aquiferCensusRow('x'), null)
  assert.equal(aquiferCensusRow([]), null)
  assert.equal(aquiferCensusRow({ strikes: 'a', waterStrikes: 0, lavaStrikes: 0, lids: 0, peakRegions: 0, giveups: 0, giveupsCarousel: 0, giveupsFloor: 0, maxConsec: 0 }), null)
  assert.equal(aquiferCensusRow({ strikes: 0, waterStrikes: 0, lavaStrikes: 0, lids: 0, peakRegions: 0, giveups: 0, giveupsCarousel: 0, giveupsFloor: 0, maxConsec: 0 }), null)
})
