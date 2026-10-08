import { test } from 'node:test'
import assert from 'node:assert/strict'
import { o2ClassSeat, o2ClassSeatRow } from '../../src/lib/o2book.mjs'

// The o2-reset drown census's own form split (v0.379.0), priced by the
// seat law: face 91 (run 37722166847) rode the 1-1 tie (F4 rescue active,
// F3 rescue never) and the tie rode unnamed; face 92 (run 37724826492)
// carried 3 o2-reset drowns. The cells are the census's own {never, active}
// fold - zero re-parsing, the v0.802.0 seat law.

test('v0.813.0: the tie law through the face-91 shape - rescue never 1 / rescue active 1 owns nothing', () => {
  const seat = o2ClassSeat({ never: 1, active: 1 })
  assert.equal(seat.total, 2)
  assert.equal(seat.owner, null, 'the tie owns nothing')
  assert.equal(seat.units, 0)
  assert.equal(seat.word, null)
  assert.equal(seat.bad, 0)
  assert.equal(o2ClassSeatRow({ never: 1, active: 1 }), 'no solo class owns the o2 book (the tie owns nothing)')
})

test('v0.813.0: the never majority byte-exact - the arm\'s own gap is the front', () => {
  const row = o2ClassSeatRow({ never: 2, active: 0 })
  assert.equal(row, 'rescue never owns 2 of 2 o2-reset drown(s) (100.0%) - THE O2 BOOK\'S OWN CLASS: the rescue stayed holstered - the arm\'s own gap is the front (the sensor died and the trigger never armed)')
  // the zero cell rides silent - the book is the cells' own sum
  const seat = o2ClassSeat({ never: 2, active: 0 })
  assert.equal(seat.total, 2)
  assert.equal(seat.share, 1)
})

test('v0.813.0: the active majority byte-exact + the junk battery - non-finite/negative cells skipped and counted, the empty book reads the honest silence', () => {
  const row = o2ClassSeatRow({ never: 1, active: 3 })
  assert.equal(row, 'rescue active owns 3 of 4 o2-reset drown(s) (75.0%) - THE O2 BOOK\'S OWN CLASS: the rescue armed and lost the trade - the water kept what the arm reached (the lane\'s own front)')
  // the junk law: junk never invents a class
  const j = o2ClassSeat({ never: Number.NaN, active: 2, ghost: -1 })
  assert.equal(j.total, 2)
  assert.equal(j.owner, 'rescue active')
  assert.equal(j.bad, 1, 'the nan counted, never priced; the unknown key never enters the book')
  // the honest silences
  assert.equal(o2ClassSeat({ never: -1, active: 0 }), null, 'a negative-only book reads silence (bad counted)')
  assert.equal(o2ClassSeat({ never: 0, active: 0 }), null, 'a zero book reads silence')
  assert.equal(o2ClassSeat(null), null)
  assert.equal(o2ClassSeat('junk'), null)
  assert.equal(o2ClassSeatRow(null), null, 'no cells - no row')
  assert.equal(o2ClassSeat({}), null, 'an absent book reads silence')
})

test('v0.813.0: the WIRING one-truth fold - the seat\'s book is the census\'s own split sum, the ranked byte pin holds', () => {
  // the book is the cells' own sum (the WIRING fold against the census's own line)
  const seat = o2ClassSeat({ never: 2, active: 1 })
  assert.equal(seat.total, 3)
  assert.equal(seat.owner, 'rescue never')
  assert.equal(seat.units, 2)
  assert.equal(seat.share, 0.667)
  // the tie-break byte pin: 2-2 through the ranked tie reads never first ('never' < 'active')
  const bp = o2ClassSeat({ active: 2, never: 2 })
  assert.equal(bp.owner, null, '2-2 is a tie - the byte never invents an owner')
  // the share's own arithmetic rides the row's percent
  const row = o2ClassSeatRow({ never: 2, active: 1 })
  assert.ok(row.startsWith('rescue never owns 2 of 3 o2-reset drown(s) (66.7%)'))
})
