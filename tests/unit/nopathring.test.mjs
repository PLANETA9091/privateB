import assert from 'node:assert/strict'
import fs from 'node:fs'
import { chestNoPathRing, chestNoPathRingRow, chestNoPathRingConsistent } from '../../src/lib/chestdoor.mjs'

// The v0.860.0 lens: the door's no-path refusals' own distance bands (the
// ring's edge or the geometry - the unreachable leg's own reach question).
// The motive: the no-path class INVERTED the door two faces running
// (face 133: decide 0; face 134: no-path 23 of 24 rides = 96%, the
// decide-majority faces 128/129 named) and the refusals' own d rode
// unshaped - are the refused chests OUTSIDE the ring's honest reach (the
// v0.823.0 preflight's own law: the walk that cannot arrive should never
// rent the clock), or INSIDE it (the geometry owns the door, not the
// distance)? The bands ride the SAME hop regex the bill reads (the
// one-parser law) - close d<=10, mid 11..25, far 26+.

const HOP = (bot, x, y, z, d, msg) => `${bot} [${bot}] hop: chest at [${x},${y},${z}] d=${d} zero: chest unreachable (${msg})`
const NP = (bot, x, y, z, d) => HOP(bot, x, y, z, d, 'No path to the goal!')
const DECIDE = (bot, x, y, z, d) => HOP(bot, x, y, z, d, 'Took to long to decide on a path')

// The face-134 verbatim table (run 37886112038's own 18 no-path d values).
const FACE134 = [
  NP('F1', -117, 70, 414, 13),
  NP('F19', -117, 70, 414, 14),
  NP('F3', -117, 70, 414, 15),
  NP('F1', -117, 70, 418, 15),
  NP('F19', -117, 70, 414, 15),
  NP('F3', -120, 70, 399, 16),
  NP('F1', -121, 70, 401, 17),
  NP('F19', -125, 70, 397, 18),
  NP('F3', -117, 70, 414, 20),
  NP('F1', -130, 70, 405, 22),
  NP('F19', -120, 70, 399, 22),
  NP('F3', -117, 70, 418, 22),
  NP('F1', -131, 70, 408, 23),
  NP('F19', -117, 70, 414, 25),
  NP('F3', -140, 70, 410, 32),
  NP('F1', -150, 70, 406, 35),
  NP('F19', -155, 70, 404, 38),
  NP('F3', -160, 70, 409, 40)
]

const r = chestNoPathRing(FACE134)
assert.equal(r.n, 18, 'the fold: every no-path ride bands')
assert.equal(r.close, null, 'the close band empty = null')
assert.deepEqual(r.mid, { n: 14, min: 13, max: 25, avg: 18.4 }, 'the mid band folds')
assert.deepEqual(r.far, { n: 4, min: 32, max: 40, avg: 36.3 }, 'the far band folds')

// The verbatim row: the mid band owns 14/18 - the geometry, not the
// distance, owns the door.
assert.match(
  chestNoPathRingRow(r),
  /^the no-path ring's own reach \(v0\.860\.0\): 18 refusal\(s\) - close 0 \/ mid 14 \(d 13\.\.25 avg 18\.4\) \/ far 4 \(d 32\.\.40 avg 36\.3\) - THE MID'S OWN RING: the refusals ride inside the reach - the geometry \(water, terrain\), not the distance, owns the door$/,
  'the face-134 row verbatim'
)

// The band edges: d=10 closes, d=11 mids, d=25 mids, d=26 fars.
const edges = chestNoPathRing([NP('F1', 0, 64, 0, 10), NP('F2', 0, 64, 1, 11), NP('F3', 0, 64, 2, 25), NP('F4', 0, 64, 3, 26)])
assert.equal(edges.close.n, 1, 'd=10 rides close')
assert.equal(edges.mid.n, 2, 'd=11 and d=25 ride mid')
assert.equal(edges.far.n, 1, 'd=26 rides far')

// The far seat: a far-majority ring names the ring's edge.
const farRing = chestNoPathRing([NP('F1', 0, 64, 0, 30), NP('F2', 0, 64, 1, 35), NP('F3', 0, 64, 2, 40)])
assert.match(
  chestNoPathRingRow(farRing),
  /- THE FAR'S OWN SEAT: the refusals ride the ring's edge - the walk that cannot arrive should never rent \(the v0\.823\.0 preflight's own law\)$/,
  'the far seat'
)

// The close seat and the spread tie read honestly.
const closeRing = chestNoPathRing([NP('F1', 0, 64, 0, 4), NP('F2', 0, 64, 1, 6), NP('F3', 0, 64, 2, 8)])
assert.match(chestNoPathRingRow(closeRing), /- THE CLOSE'S OWN RING: the refusals ride the home ring - the doorstep owns the door$/, 'the close seat')
const spread = chestNoPathRing([NP('F1', 0, 64, 0, 5), NP('F2', 0, 64, 1, 15), NP('F3', 0, 64, 2, 30), NP('F4', 0, 64, 3, 32)])
assert.match(chestNoPathRingRow(spread), /- THE SPREAD IS THE SHAPE: no band owns the refusals - the tie law held$/, 'the tie law')

// The honest silences: no no-path rides, the decide family, junk, null.
assert.equal(chestNoPathRing([]), null, 'no rides = silence')
assert.equal(chestNoPathRing([DECIDE('F1', 0, 64, 0, 12)]), null, 'the decide family stays the distance lens\'s own read')
assert.equal(chestNoPathRing(['F1 [F1] digShaft: water table y=57']), null, 'a calm log = silence')
assert.equal(chestNoPathRing(null), null, 'null input')
assert.equal(chestNoPathRing(42), null, 'junk input')
assert.equal(chestNoPathRingRow(null), null, 'null ring row')
assert.equal(chestNoPathRingRow(42), null, 'junk ring row')

// The fence battery: a self-inconsistent ring never renders.
const good = chestNoPathRing(FACE134)
assert.equal(chestNoPathRingConsistent(good), true, 'the face ring is consistent')
assert.equal(chestNoPathRingConsistent({ ...good, mid: { ...good.mid, n: 13 } }), false, 'the bands\' sum break')
assert.equal(chestNoPathRingConsistent({ ...good, far: { ...good.far, avg: 99 } }), false, 'the avg > max break')
assert.equal(chestNoPathRingConsistent({ ...good, n: 0 }), false, 'the zero n break')
assert.equal(chestNoPathRingConsistent(null), false, 'null ring fence')

// The junk rows judge nothing; a mixed log still folds.
const mixed = chestNoPathRing([42, null, 'junk', NP('F5', 0, 64, 4, 18), DECIDE('F6', 0, 64, 5, 20)])
assert.equal(mixed.n, 1, 'the junk rows and the decide family judge nothing')

// ---- WIRING ----

// The decompose prints the ring beside the door's own rows.
const src = fs.readFileSync(new URL('../../scripts/fleet-mining/decompose.mjs', import.meta.url), 'utf8')
assert.match(src, /import \{ chestDoorBill, chestDoorBillRow, chestDoorDistance, chestDoorDistanceRow, chestNoPathRing, chestNoPathRingRow, chestNoPathRepeats, chestNoPathRepeatsRow, chestExcludeCandidate, chestExcludeCandidateRow, chestBudgetFloorBook, chestBudgetFloorBookRow \} from '\.\.\/\.\.\/src\/lib\/chestdoor\.mjs'/, 'the lens rides the chestdoor import band')
assert.match(src, /const cnr = chestNoPathRing\(lines\)/, 'the lens folds the face\'s own lines')
assert.match(src, /if \(cnrRow\) console\.log\(`  \$\{cnrRow\}`\)/, "the ring's own reach prints beside the door rows")

// The row's own byte lives in the lib.
const lib = fs.readFileSync(new URL('../../src/lib/chestdoor.mjs', import.meta.url), 'utf8')
assert.match(lib, /the no-path ring's own reach \(v0\.860\.0\)/, "the row's own byte lives in the lib")

console.log('nopathring.test.mjs: all green')
