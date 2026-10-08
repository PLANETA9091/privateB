import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fleeForkSeat, fleeForkSeatRow, fleeForkRiders, fleeForkRidersRow } from '../../src/lib/fleefork.mjs'

// (v0.810.0) THE FLEE FORK'S OWN SEAT - the chased-down fork priced. The
// fixtures carry the shelterledger census's own row shape (chasedDown
// true/false/null, distBand 'close'|'mid'|'far'|null) - zero re-parsing,
// the cells' own law.

// the face-91 compact (run 37722166847): 7 flee deaths - chase 6 /
// crossfire 1; bands close 2 / mid 2 / far 2 / blind 1. Every chased case
// read 'the flee gained, the trade lost' (deltas +3.2 +1.6 +6.4 ...).
const F91 = [
  { chasedDown: true, distBand: 'close' },
  { chasedDown: true, distBand: 'mid' },
  { chasedDown: true, distBand: 'far' },
  { chasedDown: true, distBand: 'far' },
  { chasedDown: true, distBand: 'close' },
  { chasedDown: true, distBand: 'mid' },
  { chasedDown: false, distBand: null }, // the crossfire: F11 fled spider, died to Skeleton
]

test('v0.810.0 the face-91 fork: the chased side owns the book, the bands byte-exact', () => {
  const seat = fleeForkSeat(F91)
  assert.deepEqual(
    { chase: seat.chase, crossfire: seat.crossfire, noVerdict: seat.noVerdict, total: seat.total },
    { chase: 6, crossfire: 1, noVerdict: 0, total: 6 + 1 },
    'the book is the two named cells\' own sum',
  )
  assert.equal(seat.owner, 'chased')
  assert.equal(seat.share, 0.857)
  const row = fleeForkSeatRow(F91)
  assert.equal(row, 'chased owns 6 of 7 flee death(s) (85.7%) - THE FORK\'S OWN SEAT: the chase kept its reach - the disengage that gains ground still loses the trade (the re-flee front)')
  const r = fleeForkRiders(F91)
  assert.deepEqual(r.top, [{ cls: 'close', units: 2 }, { cls: 'far', units: 2 }], 'the three-way 2-2-2 tie broke by the byte order (close < far < mid)')
  assert.equal(r.total, 7)
  assert.equal(r.sum, 4)
  assert.equal(r.share, 0.571)
  const rrow = fleeForkRidersRow(F91)
  assert.equal(rrow, 'close x2 + far x2 own 4 of 7 flee death(s) (57.1%) - THE BANDS\' OWN MEASURE: the death-time distance rides measured, not owning (the seat\'s measure-not-owner law)')
})

test('v0.810.0 the crossfire owner + the no-verdict fence: the blind fork counts, never owns', () => {
  const rows = [
    { chasedDown: true, distBand: 'mid' },
    { chasedDown: false, distBand: 'close' },
    { chasedDown: false, distBand: 'far' },
    { chasedDown: false, distBand: null },
    { chasedDown: null, distBand: 'mid' }, // the no-verdict-attacker rows
    { chasedDown: null, distBand: 'mid' },
  ]
  const seat = fleeForkSeat(rows)
  assert.equal(seat.total, 4, 'the no-verdict rows never count into the book (the unattributed fence)')
  assert.equal(seat.noVerdict, 2, 'the blind fork counts honest')
  assert.equal(seat.owner, 'crossfire')
  const row = fleeForkSeatRow(rows)
  assert.equal(row, 'crossfire owns 3 of 4 flee death(s) (75.0%) - THE FORK\'S OWN SEAT: the exit ran into the second hostile\'s own reach - the crossfire\'s own front')
})

test('v0.810.0 the seat law: the tie owns nothing, the junk never invents, the honest silences', () => {
  assert.equal(fleeForkSeatRow([
    { chasedDown: true, distBand: 'close' },
    { chasedDown: false, distBand: 'mid' },
    { chasedDown: null, distBand: 'far' },
  ]), 'no solo fork owns the flee death book (the tie owns nothing)')
  const junk = fleeForkSeat([
    { chasedDown: true, distBand: 'close' },
    { chasedDown: 'yes', distBand: 'close' }, // the junk row
    { chasedDown: undefined, distBand: 'close' }, // the junk row
    { chasedDown: false, distBand: 'mid' },
    'not-a-row',
  ])
  assert.equal(junk.total, 2, 'the junk rows are skipped, the real rows still tally')
  assert.equal(junk.bad, 3, 'the junk is counted - never priced, never silently dropped')
  assert.equal(junk.owner, null, '1-1 reads the tie')
  assert.equal(fleeForkSeat(null), null)
  assert.equal(fleeForkSeat([]), null, 'an empty book judges nothing')
  assert.equal(fleeForkSeat([{ chasedDown: null }, { chasedDown: 'x' }]), null, 'a no-verdict-only book owns nothing - the honest silence')
  assert.equal(fleeForkSeatRow(null), null)
  // the riders' fences: the solo-class fence, the junk bands, the byte order
  const blindClose = fleeForkRiders([{ distBand: 'close' }, { distBand: null }])
  assert.deepEqual(blindClose.top, [{ cls: 'blind', units: 1 }, { cls: 'close', units: 1 }], 'the blind is the bands\' own honest class - and the byte order ranks it first')
  assert.equal(fleeForkRiders([{ distBand: 'close' }, { distBand: 'close' }]), null, 'a lone class\'s measure is the seat row\'s own story')
  const junkBands = fleeForkRiders([{ distBand: 'unknown' }, { distBand: 'close' }, { distBand: 'mid' }])
  assert.equal(junkBands.bad, 1, 'the junk bands are skipped and counted')
  assert.deepEqual(junkBands.top.map(({ cls }) => cls), ['close', 'mid'])
  assert.equal(fleeForkRiders(null), null)
  assert.equal(fleeForkRidersRow([]), null)
})

test('v0.810.0 the WIRING: the seat and the riders fold to one truth', () => {
  const rows = [
    { chasedDown: true, distBand: 'far' },
    { chasedDown: true, distBand: null },
    { chasedDown: false, distBand: 'close' },
    { chasedDown: null, distBand: 'mid' },
  ]
  const seat = fleeForkSeat(rows)
  const riders = fleeForkRiders(rows)
  assert.equal(riders.total, rows.length, 'the bands\' book is ALL the flee rows (the blind counts)')
  assert.equal(seat.total + seat.noVerdict + seat.bad, rows.length, 'the fork\'s named book + the blind fork + the junk reconcile to the row count (the twin-reconcile shape)')
  assert.equal(seat.owner, 'chased')
  assert.ok(fleeForkSeatRow(rows).startsWith('chased owns 2 of 3 flee death(s) (66.7%)'))
  assert.ok(fleeForkRidersRow(rows).startsWith('blind x1 + close x1 own 2 of 4 flee death(s) (50.0%)'), 'the 1-1-1-1 four-way tie broke by the byte order (blind < close < far < mid)')
})
