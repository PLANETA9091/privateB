import { test } from 'node:test'
import assert from 'node:assert/strict'
import { drySideSeat, drySideSeatRow } from '../../src/lib/droughttimeline.mjs'

// The pump's own timeline's break branch (v0.738.0), priced by the seat
// law (v0.816.0): WHICH side of the first bank owns the dry book. The
// held break faces' own shapes - face 95 (run 37732286082): before 86 /
// after 25; face 92 (run 37724826492): before 48 / after 4; face 94
// (run 37729795006): before 10 / after 6. The cells are the timeline's
// own {prePrime, postPrime} fold - zero re-parsing, the v0.802.0 seat
// law; the strict-majority law (topUnits * 2 > total), a tie owns
// nothing.

test('v0.816.0: the face-95 shape byte-exact - the pump primed late, the tithe\'s own clock is the front', () => {
  const seat = drySideSeat({ prePrime: 86, postPrime: 25 })
  assert.equal(seat.total, 111, 'the book is the cells\' own sum (86+25)')
  assert.equal(seat.owner, 'before the first bank')
  assert.equal(seat.units, 86)
  assert.equal(seat.share, 0.775)
  assert.equal(seat.bad, 0)
  assert.equal(drySideSeatRow(seat), 'before the first bank owns 86 of 111 dry read(s) (77.5%) - THE DRY READ\'S OWN SIDE: the pump primed late - the tithe\'s own clock is the front (the dry reads queued before the first bank)')
})

test('v0.816.0: the face-92 and face-94 shapes byte-exact - the before law\'s 2nd and 3rd faces', () => {
  const f92 = drySideSeatRow(drySideSeat({ prePrime: 48, postPrime: 4 }))
  assert.equal(f92, 'before the first bank owns 48 of 52 dry read(s) (92.3%) - THE DRY READ\'S OWN SIDE: the pump primed late - the tithe\'s own clock is the front (the dry reads queued before the first bank)')
  const f94 = drySideSeatRow(drySideSeat({ prePrime: 10, postPrime: 6 }))
  assert.equal(f94, 'before the first bank owns 10 of 16 dry read(s) (62.5%) - THE DRY READ\'S OWN SIDE: the pump primed late - the tithe\'s own clock is the front (the dry reads queued before the first bank)')
})

test('v0.816.0: the strict-majority fence - the tie owns nothing, the after side seats on its own majority', () => {
  // the even tie reads the honest no-owner row
  assert.equal(drySideSeatRow(drySideSeat({ prePrime: 1, postPrime: 1 })), 'no solo side owns the dry book (the tie owns nothing)')
  assert.equal(drySideSeat({ prePrime: 2, postPrime: 2 }).owner, null, 'exactly-at-half owns nothing')
  // the post-majority: the delivery's own break seats after all
  const post = drySideSeatRow(drySideSeat({ prePrime: 10, postPrime: 86 }))
  assert.equal(post, 'after the first bank owns 86 of 96 dry read(s) (89.6%) - THE DRY READ\'S OWN SIDE: the delivery\'s own break - the stock sat while the sweeps starved (the inflow arrived and the yard still read dry)')
  // the solo book reads its own 100%
  const solo = drySideSeatRow(drySideSeat({ prePrime: 0, postPrime: 4 }))
  assert.equal(solo, 'after the first bank owns 4 of 4 dry read(s) (100.0%) - THE DRY READ\'S OWN SIDE: the delivery\'s own break - the stock sat while the sweeps starved (the inflow arrived and the yard still read dry)')
  // the zero cell rides silent - the book is the counted cells' own sum
  assert.equal(drySideSeat({ prePrime: 0, postPrime: 4 }).total, 4)
})

test('v0.816.0: the junk battery + the row guards + the honest silence end to end', () => {
  // junk never invents a side - skipped and counted, the real cells still tally
  assert.equal(drySideSeat({ prePrime: Number.NaN, postPrime: -2 }), null, 'an all-junk book reads the honest silence')
  const j2 = drySideSeat({ prePrime: 'junk', postPrime: 3 })
  assert.equal(j2.total, 3)
  assert.equal(j2.owner, 'after the first bank')
  assert.equal(j2.bad, 1)
  // the honest silences
  assert.equal(drySideSeat(null), null)
  assert.equal(drySideSeat('junk'), null)
  assert.equal(drySideSeat([]), null, 'an array is no cells book')
  assert.equal(drySideSeat({}), null, 'an absent book reads silence')
  assert.equal(drySideSeat({ prePrime: 0, postPrime: 0 }), null, 'a zero book reads silence')
  // the row guards: junk seats never print
  assert.equal(drySideSeatRow(null), null, 'no seat - no row')
  assert.equal(drySideSeatRow({ total: 0, owner: 'before the first bank', units: 0, share: 0, word: 'x' }), null, 'a zero total never prints')
  assert.equal(drySideSeatRow({ total: 5, owner: 'the void', units: 3, share: 0.6, word: 'x' }), null, 'an unknown label never prints')
  assert.equal(drySideSeatRow({ total: 5, owner: 'before the first bank', units: 9, share: 1.8, word: 'x' }), null, 'units beyond the book never print')
  assert.equal(drySideSeatRow({ total: 5, owner: 'before the first bank', units: 3, share: 0.6, word: '' }), null, 'a wordless seat never prints')
  // the WIRING one-truth fold: the seat's book is the timeline's own sum
  const dt = { prePrime: 86, postPrime: 25 }
  assert.equal(drySideSeat(dt).total, dt.prePrime + dt.postPrime)
})
