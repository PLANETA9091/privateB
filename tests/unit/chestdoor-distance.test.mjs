import assert from 'node:assert/strict'
import { chestDoorDistance, chestDoorDistanceRow, chestDoorDistanceRowConsistent } from '../../src/lib/chestdoor.mjs'

// The v0.856.0 lens: the decide rides' own distance, read off the hop
// byte's own 'd=N' (the one-parser law - the same regex the bill reads).
// The motive: the decide class owns the door book two faces running
// (face 128: decide 6/11, face 129: decide 11/15) - the walk-budget front
// needs the decide rides' DISTANCE (the long approach vs the everywhere).

const HOP = (bot, x, y, z, d, msg) => `${bot} [${bot}] hop: chest at [${x},${y},${z}] d=${d} zero: chest unreachable (${msg})`
const BANK = (bot, msg) => `${bot} bank: chest unreachable (${msg})`

// The face-128 verbatim table (the bill's own page: hop 9 / bank 2,
// verdicts no-path 5 / decide 6). The hop rides carry d; the bank rides
// carry none and stay out.
const FACE128 = [
  HOP('F9', -150, 70, 406, 12, 'No path to the goal!'),
  HOP('F9', -152, 69, 401, 14, 'Took to long to decide on a path'),
  HOP('F12', -150, 70, 406, 10, 'No path to the goal!'),
  HOP('F9', -148, 71, 409, 22, 'Took to long to decide on a path'),
  HOP('F2', -155, 68, 402, 30, 'Took to long to decide on a path'),
  HOP('F3', -149, 70, 404, 26, 'Took to long to decide on a path'),
  BANK('F9', 'No path to the goal! (14 blocks from yard) - walking back'),
  HOP('F12', -153, 69, 407, 16, 'No path to the goal!'),
  HOP('F2', -151, 70, 403, 8, 'No path to the goal!'),
  HOP('F3', -150, 71, 405, 9, 'No path to the goal!'),
  HOP('F12', -154, 68, 408, 12, 'Took to long to decide on a path'),
  BANK('F12', 'Took to long to decide on a path')
]

const s = chestDoorDistance(FACE128)
assert.deepEqual(
  { decide: s.decide, noPath: s.noPath, other: s.other },
  {
    decide: { n: 5, min: 12, max: 30, avg: 20.8 },
    noPath: { n: 5, min: 8, max: 16, avg: 11 },
    other: null
  },
  'the fold: the hop d splits by verdict, the bank rides stay out'
)

// The seat: the decide chests walk farther - the walk budget dies on the
// long approach.
assert.match(
  chestDoorDistanceRow(s),
  /^the decide door's own distance \(v0\.856\.0\): decide rides d 12\.\.30 \(avg 20\.8 of 5\) vs no-path rides d 8\.\.16 \(avg 11 of 5\) - THE DECIDE'S OWN SEAT: the decide chests walk farther - the walk budget dies on the long approach$/,
  'the far-decide seat'
)

// The inverse seat: the no-path chests walk farther - the geometry owns
// the door.
const inv = chestDoorDistance([
  HOP('F1', 0, 64, 0, 5, 'Took to long to decide on a path'),
  HOP('F2', 0, 64, 1, 40, 'No path to the goal!')
])
assert.match(
  chestDoorDistanceRow(inv),
  /- THE NO-PATH'S OWN SEAT: the no-path chests walk farther - the geometry owns the door, not the clock$/,
  'the geometry seat'
)

// The agree seat: the same avg reads honestly.
const agree = chestDoorDistance([
  HOP('F1', 0, 64, 0, 10, 'Took to long to decide on a path'),
  HOP('F2', 0, 64, 1, 10, 'No path to the goal!')
])
assert.match(chestDoorDistanceRow(agree), /- THE DISTANCES AGREE: the budget dies everywhere, not on the approach$/, 'the agree seat')

// A solo class reads its own honest row (the comparison waits).
const solo = chestDoorDistance([
  HOP('F1', 0, 64, 0, 10, 'Took to long to decide on a path'),
  HOP('F2', 0, 64, 1, 20, 'Took to long to decide on a path')
])
assert.match(
  chestDoorDistanceRow(solo),
  /decide rides d 10\.\.20 \(avg 15 of 2\) vs no-path rides none - THE DISTANCE READ: one class rode alone - the comparison waits$/,
  'the solo row'
)

// The honest silences: no rides, junk, non-array, a bank-only face.
assert.equal(chestDoorDistance([]), null, 'no rides = silence')
assert.equal(chestDoorDistance([BANK('F9', 'No path to the goal!')]), null, 'a bank-only face = silence (no d on the bank byte)')
assert.equal(chestDoorDistance(['F1 [F1] digShaft: water table y=57']), null, 'a calm log = silence')
assert.equal(chestDoorDistance(null), null, 'null input')
assert.equal(chestDoorDistance(42), null, 'junk input')
assert.equal(chestDoorDistanceRow(null), null, 'null shape row')
assert.equal(chestDoorDistanceRow(42), null, 'junk shape row')

// The fence battery: a self-inconsistent shape never renders.
const good = chestDoorDistance(FACE128)
assert.equal(chestDoorDistanceRowConsistent(good), true, 'the face shape is consistent')
assert.equal(chestDoorDistanceRowConsistent({ ...good, decide: { ...good.decide, avg: 99 } }), false, 'avg > max break')
assert.equal(chestDoorDistanceRowConsistent({ ...good, decide: { ...good.decide, n: 0 } }), false, 'zero n break')
assert.equal(chestDoorDistanceRowConsistent({ ...good, noPath: { ...good.noPath, min: 99 } }), false, 'min > avg break')
assert.equal(chestDoorDistanceRowConsistent({ decide: null, noPath: null, other: null }), false, 'the empty shape break')
assert.equal(chestDoorDistanceRowConsistent({ decide: good.decide, noPath: null, other: null }), true, 'the solo shape passes')

// The junk rows judge nothing; a mixed log still folds.
const mixed = chestDoorDistance([42, null, HOP('F1', 0, 64, 0, 7, 'No path to the goal!'), 'junk'])
assert.equal(mixed.noPath.n, 1, 'the junk rows judge nothing')

// The other-verdict rides (the door's own escape hatch) fold honestly.
const other = chestDoorDistance([HOP('F1', 0, 64, 0, 7, 'the chest vanished mid-walk')])
assert.deepEqual(other.other, { n: 1, min: 7, max: 7, avg: 7 }, 'the other bucket folds')
assert.match(chestDoorDistanceRow(other), / vs other rides d 7\.\.7 \(avg 7 of 1\)/, 'the other cell rides the row')

console.log('chestdoor-distance.test.mjs: all green')
