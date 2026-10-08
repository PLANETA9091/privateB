import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dryTripCensus, dryTripSeat, dryTripRiders, dryTripSeatRow, dryTripRidersRow } from '../../src/lib/carrybook.mjs'

// The carry drought's own walk book (v0.817.0): the food commons walk's
// own dry terminal, 'the plate stays empty (REASON) - the next trip
// retries', splits into TWO ARMS - the shelf (commons empty: reached
// chests stood bare, the tithe's own gap) and the reach (no chest
// reached: the walk never arrived, the pathing front). Face 92 (run
// 37724826492) carried 15 dry terminals: shelf 9 / reach 6 - the debut
// face's own thin seat. The terminal only: the mid-loop 'budget spent'
// note is NOT the terminal (a budget-dead trip still prints its own
// stays-empty terminal at return - counting both would double-book).

test('v0.817.0: the face-92 verbatim through the parser + the byte-exact seat row - the shelf owns 9 of 15', () => {
  // the face's own bytes, verbatim (the tags, the parens, the prose)
  const lines = [
    'F2 food commons: the plate stays empty (no chest reached) - the next trip retries',
    'F19 food commons: the plate stays empty (commons empty) - the next trip retries',
    'F1 food commons: the plate stays empty (commons empty) - the next trip retries',
    'F6 food commons: the plate stays empty (no chest reached) - the next trip retries',
    'F2 food commons: budget spent (0/6 units)',
    'F2 food commons: chest holds no food',
    'F17 food commons: chest walk failed (Took to long to decide path to goal!)',
    'F16 food commons: chest at [-118,72,385] the yard stands 24 levels up over 3b lateral - the walk ladder cannot climb, the plate rides (the tithe owns the refill)'
  ]
  const c = dryTripCensus(lines)
  assert.equal(c.shelf, 2, 'only the commons-empty terminals price the shelf')
  assert.equal(c.reach, 2, 'only the no-chest-reached terminals price the reach')
  // the double-book law: the budget note, the arrived-bare line, the walk
  // fail and the ladder line are NOT terminals - none of them prices
  // (the census counted exactly the two + two above)
  // the seat through the face's own split (shelf 9 / reach 6, the debut read)
  const seat = dryTripSeat({ shelf: 9, reach: 6 })
  assert.equal(seat.arm, 'shelf')
  assert.equal(seat.owns, 9)
  assert.equal(seat.ofTrips, 15)
  const row = dryTripSeatRow(seat)
  assert.equal(row, 'the dry trip\'s own arm (v0.817.0): the shelf owns 9 of 15 dry trips (60.0%) - THE SHELF\'S OWN GAP: the chests the trip reached stood bare - the tithe\'s own front prices the refill the raw reason rode unnamed')
})

test('v0.817.0: the even-split tie byte-exact with the byte pin reach < shelf - the tie owns nothing, the riders measure', () => {
  const seat = dryTripSeat({ shelf: 3, reach: 3 })
  assert.equal(seat, null, 'the even split owns nothing')
  const r = dryTripRiders({ shelf: 3, reach: 3 })
  assert.equal(r.leader, 'reach', 'the ranked tie: \'reach\' 0x72 sorts before \'shelf\' 0x73')
  assert.equal(r.runner, 'shelf')
  assert.equal(r.pairOwns, 6)
  assert.equal(r.ofTrips, 6)
  assert.equal(r.duet, 'the reach x3 + the shelf x3')
  const row = dryTripRidersRow(r)
  assert.equal(row, 'the dry trip\'s own riders (v0.817.0): no solo arm owns the majority - the reach x3 + the shelf x3 own 6 of 6 dry trips (100.0%) - THE DRY TRIP\'S OWN TIE: the seat\'s tie law held, the arms\' own crowd prices the drought the solo law refused to name')
})

test('v0.817.0: the lone-arm faces read the seat at their own 100% - the singular noun and the reach\'s own word', () => {
  // the shelf-only face (the face-85 shape: 18/0 - here 3/0, the same arm)
  const sRow = dryTripSeatRow(dryTripSeat({ shelf: 3, reach: 0 }))
  assert.equal(sRow, 'the dry trip\'s own arm (v0.817.0): the shelf owns 3 of 3 dry trips (100.0%) - THE SHELF\'S OWN GAP: the chests the trip reached stood bare - the tithe\'s own front prices the refill the raw reason rode unnamed')
  assert.equal(dryTripRiders({ shelf: 3, reach: 0 }), null, 'a lone arm is no crowd - the riders stay silent')
  // the reach-only face (the face-90 shape: 0/7 - here 1/0, the singular noun)
  const rRow = dryTripSeatRow(dryTripSeat({ shelf: 0, reach: 1 }))
  assert.equal(rRow, 'the dry trip\'s own arm (v0.817.0): the reach owns 1 of 1 dry trip (100.0%) - THE REACH\'S OWN GAP: the trip never arrived at any chest - the walk\'s own front prices the path the raw reason rode unnamed')
})

test('v0.817.0: the junk battery + the row guards + the honest silence end to end', () => {
  // the census's own junk law: junk input reads null, a clean face reads
  // the zero shape, non-string lines judge nothing
  assert.equal(dryTripCensus(null), null)
  assert.equal(dryTripCensus(42), null)
  assert.equal(dryTripCensus({}), null)
  assert.deepEqual(dryTripCensus(['F2 food commons: took 6 units (6 x bread) from a yard chest']), { shelf: 0, reach: 0 }, 'the cured trip is not a dry terminal')
  assert.deepEqual(dryTripCensus([null, 5, 'junk']), { shelf: 0, reach: 0 })
  // the seat's junk law: junk never invents an arm
  assert.equal(dryTripSeat(null), null)
  assert.equal(dryTripSeat('junk'), null)
  assert.equal(dryTripSeat({}), null)
  assert.equal(dryTripSeat({ shelf: 0, reach: 0 }), null, 'a zero book reads silence')
  assert.equal(dryTripSeat({ shelf: Number.NaN, reach: 0 }), null)
  // the negative cell is SKIPPED (the famine lane's own law) - the reach 3
  // alone reads the seat at its own 100% (the lone arm's precedent)
  const lone = dryTripSeat({ shelf: -2, reach: 3 })
  assert.equal(lone.arm, 'reach')
  assert.equal(lone.ofTrips, 3)
  // the row guards: a forged seat never prints
  assert.equal(dryTripSeatRow(null), null)
  assert.equal(dryTripSeatRow({ arm: 'ghost', owns: 1, ofTrips: 1, shareOfTrips: 100 }), null)
  assert.equal(dryTripSeatRow({ arm: 'shelf', owns: 0, ofTrips: 1, shareOfTrips: 0 }), null)
  assert.equal(dryTripSeatRow({ arm: 'shelf', owns: 2, ofTrips: 1, shareOfTrips: 200 }), null, 'owns > ofTrips is a forged book')
  assert.equal(dryTripRidersRow(null), null)
  assert.equal(dryTripRidersRow({ leader: 'reach', leaderOwns: 1, runner: 'reach', runnerOwns: 1, ofTrips: 2, pairOwns: 2, shareOfTrips: 100, duet: 'x' }), null, 'the pair must be two arms')
  // the riders fn is the measure-not-owner - it ALWAYS measures the pair
  // (the majority face prints the seat row only: the XOR lives at the
  // print site, the climb shape)
  const measure = dryTripRiders({ shelf: 9, reach: 6 })
  assert.equal(measure.leader, 'shelf')
  assert.equal(measure.runner, 'reach')
  assert.equal(measure.pairOwns, 15)
})
