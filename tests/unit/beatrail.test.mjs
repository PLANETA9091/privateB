//
// beatrail.test.mjs - THE BEAT RAIL'S OWN CONTINUITY (v0.822.0) unit
// tests. The kill-face series is byte-verbatim from the 96th's own
// face (run 37736268597, the freeze-storm kill): 16 beats, n=1..16
// stepping one-by-one, the ts= clock riding its own 20s cadence
// (21s..321s) - THE RAIL HELD through the whole face; the kill ended
// the series (n=17 never landed) and the mid-series read correctly
// invents no scar for the tail's own silence. The scar shapes ride
// synthetic series built on the same line grammar (the gap past 3x
// the cadence, the n skip, the ts regression).
//
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { beatRailContinuity, beatRailContinuityRow } from '../../src/lib/beatrail.mjs'

// The 96th's own 16 beats, byte-verbatim and in the live order (the
// rss/late fields ride the full line - the parser reads the pinned
// tail, the prefix stays free).
const HB = (n, ts, rss, late, mainLate) => `F1 [mem-hb b] n=${n} ts=${ts}s rss=${rss}M late=${late}ms mainLate=${mainLate}ms`
const FACE96_LINES = [
  HB(1, 21, 261, 6, 0),
  HB(2, 41, 338, 12, 306),
  HB(3, 61, 352, 9, 0),
  HB(4, 81, 361, 11, 45),
  HB(5, 101, 369, 14, 212),
  HB(6, 121, 374, 10, 88),
  HB(7, 141, 379, 12, 301),
  HB(8, 161, 381, 9, 0),
  HB(9, 181, 382, 15, 240),
  HB(10, 201, 383, 11, 97),
  HB(11, 221, 383, 13, 305),
  HB(12, 241, 384, 10, 0),
  HB(13, 261, 384, 12, 288),
  HB(14, 281, 384, 11, 105),
  HB(15, 301, 384, 14, 310),
  HB(16, 321, 384, 83, 859)
]

test('beatRailContinuity: the 96th\'s own 16 beats - the rail held through the kill face', () => {
  const x = beatRailContinuity(FACE96_LINES)
  assert.ok(x, 'reads the face')
  assert.equal(x.beats, 16)
  assert.equal(x.nFirst, 1)
  assert.equal(x.nLast, 16)
  assert.equal(x.nJumps, 0, 'every n stepped exactly +1')
  assert.equal(x.medianStepS, 20, "the face's own cadence")
  assert.equal(x.maxStepS, 20)
  assert.deepEqual(x.gaps, [], 'no step past 3x the cadence')
  assert.equal(x.tsRegress, 0)
  assert.equal(x.unbroken, true, 'THE RAIL HELD')
  // the kill's tail silence invents nothing (n=17 never landed - the
  // read never asks for beats the log never wrote)
})

test('beatRailContinuityRow: the byte-exact held row + the honest silences', () => {
  const row = beatRailContinuityRow(beatRailContinuity(FACE96_LINES))
  assert.equal(row, "the beat rail's own continuity (v0.822.0): 16 beat(s), n 1->16, the 20s clock unbroken (max step 20s) - THE RAIL HELD (no missed reschedule rode the log)")
  // fewer than two beats: the honest silence
  assert.equal(beatRailContinuityRow(beatRailContinuity([HB(1, 21, 261, 6, 0)])), null, 'one beat = no cadence to read')
  assert.equal(beatRailContinuityRow(beatRailContinuity(['junk'])), null)
  assert.equal(beatRailContinuityRow(null), null)
  assert.equal(beatRailContinuityRow({ beats: 1, nFirst: 1, nLast: 1 }), null)
})

test('beatRailContinuity: the scars - the gap, the n skip and the ts regression', () => {
  // the gap: one step past 3x the median cadence (the 96th's own
  // cadence 20s -> a 70s step = the window the beats never covered)
  const gapped = beatRailContinuity([
    HB(1, 21, 261, 6, 0),
    HB(2, 41, 338, 12, 306),
    HB(3, 111, 352, 9, 0), // ts 41 -> 111 = 70s, past the 60s floor
    HB(4, 131, 361, 11, 45)
  ])
  assert.equal(gapped.unbroken, false)
  assert.equal(gapped.medianStepS, 20)
  assert.equal(gapped.gaps.length, 1)
  assert.deepEqual(gapped.gaps[0], { fromTs: 41, toTs: 111, gapS: 70 })
  const gappedRow = beatRailContinuityRow(gapped)
  assert.ok(gappedRow.includes('1 ts gap(s) (max 70s past the 20s clock)'), 'the gap rides the row')
  assert.ok(gappedRow.includes("THE RAIL'S OWN SCAR"))
  // the n skip: the missed reschedule's own signature (n jumps past a beat)
  const skipped = beatRailContinuity([
    HB(1, 21, 261, 6, 0),
    HB(2, 41, 338, 12, 306),
    HB(4, 61, 352, 9, 0), // n 2 -> 4: the beat the rail never wrote
    HB(5, 81, 361, 11, 45)
  ])
  assert.equal(skipped.nJumps, 1)
  assert.equal(skipped.nSkipMax, 2)
  assert.equal(skipped.unbroken, false, 'a clean clock with a broken counter is still a scar')
  assert.ok(beatRailContinuityRow(skipped).includes('1 n-jump(s)'))
  // the ts regression: the clock walked backwards
  const regressed = beatRailContinuity([
    HB(1, 21, 261, 6, 0),
    HB(2, 41, 338, 12, 306),
    HB(3, 39, 352, 9, 0), // ts 41 -> 39: backwards
    HB(4, 59, 361, 11, 45)
  ])
  assert.equal(regressed.tsRegress, 1)
  assert.equal(regressed.unbroken, false)
  // the n regression counts too (a repeat or a decrement)
  const nBack = beatRailContinuity([
    HB(1, 21, 261, 6, 0),
    HB(2, 41, 338, 12, 306),
    HB(2, 61, 352, 9, 0), // n repeats: dn=0
    HB(3, 81, 361, 11, 45)
  ])
  assert.equal(nBack.nJumps, 1)
  assert.equal(nBack.nSkipMax, 0, 'a repeat skips nothing forward')
  assert.equal(nBack.unbroken, false)
})

test('beatRailContinuity: the junk battery - junk rides nothing, the order holds', () => {
  // junk lines and non-strings interleave - the series stays clean
  const junked = beatRailContinuity([
    null,
    7,
    'some prose line with n=5 ts=9s but no pinned tail',
    HB(1, 21, 261, 6, 0),
    undefined,
    'F2 [mem-hb b] n=bad ts=worse rss=xM late=yms mainLate=zms',
    HB(2, 41, 338, 12, 306)
  ])
  assert.equal(junked.beats, 2, 'only the pinned-tail lines ride the series')
  assert.equal(junked.unbroken, true)
  // a non-array reads null
  assert.equal(beatRailContinuity(null), null)
  assert.equal(beatRailContinuity('not an array'), null)
  assert.equal(beatRailContinuity({}), null)
})
