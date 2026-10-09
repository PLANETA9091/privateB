import assert from 'node:assert/strict'
import { chestDoorDistance, chestDoorDistanceRow, chestDoorDistanceRowConsistent } from '../../src/lib/chestdoor.mjs'

// The v0.856.0 lens: the decide rides' own distance, read off the hop
// byte's own 'd=N' (the one-parser law - the same regex the bill reads).
// The motive: the decide class owns the door book two faces running
// (face 128: decide 6/11, face 129: decide 11/15) - the walk-budget front
// needs the decide rides' DISTANCE (the long approach vs the everywhere).
// The v0.858.0 guard: face 131 named the seat off n=1 vs n=1 and the
// seat contradicted face 129's fuller page - a seat needs both sides at
// n>=2 (the thin side waits for its second ride).
// The (v0.861.0) DOOR'S OWN WHYS: the bill's own blind spot repaired -
// the hop capture reads greedy (the nested-paren why bytes parse), the
// bank zero shape joins the fold, and the verdict split names the budget
// floor - so the distance shape gains the budget-floor bucket (the
// floor's own d rides the row: does the walk floor die on the long
// approach?). Face 134's own page: budget-floor d 20..40 (avg 28 of 10)
// vs no-path avg 22.3 - the floor dies on the LONGER approach.

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
  /^the decide door's own distance \(v0\.861\.0\): decide rides d 12\.\.30 \(avg 20\.8 of 5\) vs no-path rides d 8\.\.16 \(avg 11 of 5\) - THE DECIDE'S OWN SEAT: the decide chests walk farther - the walk budget dies on the long approach$/,
  'the far-decide seat'
)

// The inverse seat: the no-path chests walk farther - the geometry owns
// the door. Both sides ride n>=2 (the v0.858.0 thin-seat law: a seat
// never names off a solo ride).
const inv = chestDoorDistance([
  HOP('F1', 0, 64, 0, 5, 'Took to long to decide on a path'),
  HOP('F3', 0, 64, 2, 7, 'Took to long to decide on a path'),
  HOP('F2', 0, 64, 1, 40, 'No path to the goal!'),
  HOP('F4', 0, 64, 3, 42, 'No path to the goal!')
])
assert.match(
  chestDoorDistanceRow(inv),
  /decide rides d 5\.\.7 \(avg 6 of 2\) vs no-path rides d 40\.\.42 \(avg 41 of 2\) - THE NO-PATH'S OWN SEAT: the no-path chests walk farther - the geometry owns the door, not the clock$/,
  'the geometry seat'
)

// The agree seat: the same avg reads honestly (both sides n>=2).
const agree = chestDoorDistance([
  HOP('F1', 0, 64, 0, 10, 'Took to long to decide on a path'),
  HOP('F3', 0, 64, 2, 10, 'Took to long to decide on a path'),
  HOP('F2', 0, 64, 1, 9, 'No path to the goal!'),
  HOP('F4', 0, 64, 3, 11, 'No path to the goal!')
])
assert.match(chestDoorDistanceRow(agree), /- THE DISTANCES AGREE: the budget dies everywhere, not on the approach$/, 'the agree seat')

// (v0.858.0) THE THIN SEAT'S OWN GUARD - a seat never names off a solo
// ride. Face 131's own page (run 37877650289): decide d 40..40 (avg 40
// of 1) vs no-path d 22..22 (avg 22 of 1) named THE DECIDE'S OWN SEAT -
// the seat face 129's fuller page (n=10 vs n=4) DENIED. The thin sides
// read the sample note and the seat waits.
const thinThin = chestDoorDistance([
  HOP('F15', -115, 66, 397, 40, 'Took to long to decide on a path'),
  HOP('F3', -115, 66, 397, 22, 'No path to the goal!')
])
assert.match(
  chestDoorDistanceRow(thinThin),
  /decide rides d 40\.\.40 \(avg 40 of 1\) vs no-path rides d 22\.\.22 \(avg 22 of 1\) - THE SEAT'S OWN SAMPLE: decide n=1 vs no-path n=1 - the thin side waits for its second ride$/,
  'the face-131 thin shape'
)
assert.doesNotMatch(chestDoorDistanceRow(thinThin), /OWN SEAT/, 'a thin shape never names the seat')

// One thin side is enough to block the seat - either direction.
const thinNoPath = chestDoorDistance([
  HOP('F1', 0, 64, 0, 30, 'Took to long to decide on a path'),
  HOP('F3', 0, 64, 2, 50, 'Took to long to decide on a path'),
  HOP('F2', 0, 64, 1, 22, 'No path to the goal!')
])
assert.match(
  chestDoorDistanceRow(thinNoPath),
  /- THE SEAT'S OWN SAMPLE: decide n=2 vs no-path n=1 - the thin side waits for its second ride$/,
  'the thin no-path side blocks the seat'
)
const thinDecide = chestDoorDistance([
  HOP('F1', 0, 64, 0, 40, 'Took to long to decide on a path'),
  HOP('F2', 0, 64, 1, 10, 'No path to the goal!'),
  HOP('F4', 0, 64, 3, 12, 'No path to the goal!'),
  HOP('F5', 0, 64, 5, 14, 'No path to the goal!'),
  HOP('F6', 0, 64, 7, 16, 'No path to the goal!'),
  HOP('F7', 0, 64, 9, 18, 'No path to the goal!')
])
assert.match(
  chestDoorDistanceRow(thinDecide),
  /- THE SEAT'S OWN SAMPLE: decide n=1 vs no-path n=5 - the thin side waits for its second ride$/,
  'the far solo side does not win the seat'
)

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
assert.equal(chestDoorDistanceRowConsistent({ decide: null, noPath: null, budgetFloor: null, other: null }), false, 'the empty shape break')
assert.equal(chestDoorDistanceRowConsistent({ decide: good.decide, noPath: null, budgetFloor: null, other: null }), true, 'the solo shape passes')

// (v0.861.0) THE BUDGET FLOOR'S OWN CELL - the nested-paren rides' own d.
// The face-134 verbatim d set (the ten real budget-floor rides: F1's
// four d=20 approaches, F3's d=35/36, the d=40 pair, the d=25/24 pair):
// avg 28.0 vs the no-path 22.3 - the floor dies on the LONGER approach.
const bf = chestDoorDistance([
  HOP('F1', -122, 70, 410, 20, 'budget exhausted (walk floor)'),
  HOP('F1', -122, 70, 408, 20, 'budget exhausted (walk floor)'),
  HOP('F1', -122, 70, 412, 20, 'budget exhausted (walk floor)'),
  HOP('F1', -122, 70, 414, 20, 'budget exhausted (walk floor)'),
  HOP('F3', -122, 70, 418, 35, 'budget exhausted (walk floor)'),
  HOP('F3', -122, 70, 416, 36, 'budget exhausted (walk floor)'),
  HOP('F3', -127, 70, 418, 40, 'budget exhausted (walk floor)'),
  HOP('F3', -127, 70, 416, 40, 'budget exhausted (walk floor)'),
  HOP('F15', -152, 70, 418, 25, 'budget exhausted (walk floor)'),
  HOP('F3', -127, 70, 418, 24, 'budget exhausted (walk floor)'),
  HOP('F2', -150, 70, 406, 12, 'No path to the goal!'),
  HOP('F4', -153, 69, 407, 16, 'No path to the goal!')
])
assert.deepEqual(bf.budgetFloor, { n: 10, min: 20, max: 40, avg: 28 }, 'the floor bucket folds the nested-paren rides')
assert.deepEqual(bf.noPath, { n: 2, min: 12, max: 16, avg: 14 }, 'the no-path bucket still folds')
assert.match(
  chestDoorDistanceRow(bf),
  /vs budget-floor rides d 20\.\.40 \(avg 28 of 10\) - THE DISTANCE READ: one class rode alone - the comparison waits$/,
  'the floor cell rides the row before the seat tail (decide absent = the comparison waits)'
)
assert.match(
  chestDoorDistanceRow(bf),
  /no-path rides d 12\.\.16 \(avg 14 of 2\) vs budget-floor rides d 20\.\.40 \(avg 28 of 10\)/,
  'the floor cell sits between the no-path and other cells'
)

// The bank zero and the bank walking-back rides stay out (no d on the
// bank family's own bytes).
assert.equal(chestDoorDistance([
  'F1 bank: 0 (chest unreachable (budget exhausted (walk floor)))',
  BANK('F9', 'No path to the goal! (14 blocks from yard) - walking back')
]), null, 'a bank-only face = the honest silence (no d on the bank bytes)')

// The floor's cell is absent when the class is absent (the old faces'
// row byte rides unchanged).
const noBf = chestDoorDistance([HOP('F1', 0, 64, 0, 7, 'No path to the goal!')])
assert.equal(noBf.budgetFloor, null, 'the honest absence')
assert.doesNotMatch(chestDoorDistanceRow(noBf), /budget-floor/, 'no floor cell when the class is absent')

// The junk rows judge nothing; a mixed log still folds.
const mixed = chestDoorDistance([42, null, HOP('F1', 0, 64, 0, 7, 'No path to the goal!'), 'junk'])
assert.equal(mixed.noPath.n, 1, 'the junk rows judge nothing')

// The other-verdict rides (the door's own escape hatch) fold honestly.
const other = chestDoorDistance([HOP('F1', 0, 64, 0, 7, 'the chest vanished mid-walk')])
assert.deepEqual(other.other, { n: 1, min: 7, max: 7, avg: 7 }, 'the other bucket folds')
assert.match(chestDoorDistanceRow(other), / vs other rides d 7\.\.7 \(avg 7 of 1\)/, 'the other cell rides the row')

console.log('chestdoor-distance.test.mjs: all green')
