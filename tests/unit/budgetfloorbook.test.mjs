import assert from 'node:assert/strict'
import fs from 'node:fs'
import { chestBudgetFloorBook, chestBudgetFloorBookRow, chestBudgetFloorBookConsistent } from '../../src/lib/chestdoor.mjs'

// The v0.864.0 lens: the budget-floor rides' own WHO+WHERE fold (the
// budget floor's own book). The motive: the whys lens (v0.861.0, the
// lane's) named the budget floor the door's own second seat (face 134:
// 12 of 37 = 32%) and its first live face INVERTED the door (face 136:
// budget-floor 21 of 38 = 55% - the class owns the door's majority
// now), but the fold rode verdict-aggregate only: WHICH bot's pocket
// ran dry, and WHICH chest priced the floor's death, rode unnamed.
// The distance row priced the class's own d (face 136: avg 26 vs the
// door's ~20 - the floor dies on the longer approach). The fold reads
// the SAME hop regex the bill, the ring and the repeats book read (the
// one-parser law) and bands by the ring's own ruler (the one-ruler
// law: close d<=10, mid 11..25, far 26+).

const HOP = (bot, x, y, z, d, msg) => `${bot} [${bot}] hop: chest at [${x},${y},${z}] d=${d} zero: chest unreachable (${msg})`
const BF = (bot, x, y, z, d) => HOP(bot, x, y, z, d, 'budget exhausted (walk floor)')
const NP = (bot, x, y, z, d) => HOP(bot, x, y, z, d, 'No path to the goal!')
const DECIDE = (bot, x, y, z, d) => HOP(bot, x, y, z, d, 'Took to long to decide on a path')

// The face-136 verbatim table (run 37894029206's own 20 budget-floor hop
// rides, the REAL positions byte-read from fleet19.log - every ride rode
// F19, the one bot's own floor).
const FACE136 = [
  BF('F19', -111, 71, 401, 29),
  BF('F19', -106, 71, 399, 25),
  BF('F19', -111, 71, 399, 29),
  BF('F19', -106, 71, 401, 25),
  BF('F19', -106, 71, 403, 26),
  BF('F19', -106, 71, 405, 26),
  BF('F19', -106, 71, 407, 27),
  BF('F19', -106, 71, 409, 27),
  BF('F19', -111, 71, 401, 29),
  BF('F19', -111, 71, 405, 27),
  BF('F19', -111, 71, 403, 27),
  BF('F19', -111, 71, 407, 27),
  BF('F19', -106, 71, 405, 23),
  BF('F19', -106, 71, 403, 23),
  BF('F19', -106, 71, 407, 23),
  BF('F19', -106, 71, 401, 23),
  BF('F19', -106, 71, 409, 23),
  BF('F19', -111, 71, 405, 27),
  BF('F19', -111, 71, 403, 27),
  BF('F19', -111, 71, 407, 27)
]

const book = chestBudgetFloorBook(FACE136)
assert.equal(book.n, 20, 'the fold: every budget-floor hop ride lands')
assert.deepEqual(book.byBot, { F19: 20 }, 'one bot owns every ride')
assert.equal(book.distinctChests, 11, '11 distinct chests priced the floor')
assert.deepEqual(book.d, { n: 20, min: 23, max: 29, avg: 26 }, 'the class d 23..29 avg 26 - the longer approach')
assert.deepEqual(book.bands, { close: 0, mid: 7, far: 13 }, 'the far band owns 13 of 20')
assert.equal(book.repeatChests.length, 9, '9 chests priced the floor twice')
assert.equal(book.repeatRides, 18, '18 of the 20 rides rode repeat chests')
assert.equal(book.soloRides, 2, 'two chests were priced once')

// The x2 chest with the split d: the two approaches 23 and 26 apart.
const split = book.chests['-106,71,403']
assert.equal(split.n, 2, 'the chest took 2 floor rides')
assert.deepEqual(split.bots, { F19: 2 }, 'the same bot, twice')
assert.deepEqual(split.d, { n: 2, min: 23, max: 26, avg: 24.5 }, 'the split d rides honestly')

// The far-only chest: both approaches at d 29.
const farChest = book.chests['-111,71,401']
assert.equal(farChest.n, 2)
assert.deepEqual(farChest.d, { n: 2, min: 29, max: 29, avg: 29 }, 'the far chest rides 29..29')

// The solo chests: priced once (-106,71,399 d 25, -111,71,399 d 29).
const solo = book.chests['-106,71,399']
assert.equal(solo.n, 1, 'the solo chest priced once')
assert.equal(book.chests['-111,71,399'].n, 1, 'the second solo chest priced once')

// The repeat order: the heaviest first (all n=2 here), then the widest
// bot crowd, then the position - deterministic.
assert.deepEqual(book.repeatChests.map(r => r.pos), [
  '-106,71,401', '-106,71,403', '-106,71,405', '-106,71,407', '-106,71,409',
  '-111,71,401', '-111,71,403', '-111,71,405', '-111,71,407'
], 'the repeats ride ordered')

// The verbatim row: the rider's majority names the one bot's own floor.
assert.match(
  chestBudgetFloorBookRow(book),
  /^the budget floor's own book \(v0\.864\.0\): 20 floor ride\(s\) - bots 1 \(F19=20\) - chests 11 distinct \(repeats 9: \[-106,71,401\] x2 F19 d 23\.\.25 avg 24, \[-106,71,403\] x2 F19 d 23\.\.26 avg 24\.5, \[-106,71,405\] x2 F19 d 23\.\.26 avg 24\.5, \[-106,71,407\] x2 F19 d 23\.\.27 avg 25, \[-106,71,409\] x2 F19 d 23\.\.27 avg 25, \[-111,71,401\] x2 F19 d 29\.\.29 avg 29, \[-111,71,403\] x2 F19 d 27\.\.27 avg 27, \[-111,71,405\] x2 F19 d 27\.\.27 avg 27, \[-111,71,407\] x2 F19 d 27\.\.27 avg 27\) - d 23\.\.29 avg 26 - bands close 0 \/ mid 7 \/ far 13 - THE ONE BOT'S OWN FLOOR: the floor rides F19's pocket - the personal budget, not the shared law$/,
  'the face-136 row verbatim'
)

// The far seat: no rider majority, the far band owns - the distance
// lever's own read.
const farBook = chestBudgetFloorBook([
  BF('F1', 0, 64, 0, 30), BF('F2', 0, 64, 1, 27), BF('F3', 0, 64, 2, 26)
])
assert.match(
  chestBudgetFloorBookRow(farBook),
  /- THE FAR'S OWN FLOOR: the budget dies on the far approach - the floor needs the distance in its arithmetic$/,
  'the far seat'
)

// The mid seat: no rider majority, the mid band owns.
const midBook = chestBudgetFloorBook([
  BF('F1', 0, 64, 0, 20), BF('F2', 0, 64, 1, 15), BF('F3', 0, 64, 2, 11)
])
assert.match(
  chestBudgetFloorBookRow(midBook),
  /- THE MID'S OWN FLOOR: the budget dies inside the reach - the approach's geometry owns the floor$/,
  'the mid seat'
)

// The close seat: no rider majority, the close band owns.
const closeBook = chestBudgetFloorBook([
  BF('F1', 0, 64, 0, 5), BF('F2', 0, 64, 1, 8), BF('F3', 0, 64, 2, 10)
])
assert.match(
  chestBudgetFloorBookRow(closeBook),
  /- THE CLOSE'S OWN FLOOR: the budget dies at the doorstep - the floor starves, not the walk$/,
  'the close seat'
)

// The tie law: no rider majority, no band majority - the spread.
const spreadBook = chestBudgetFloorBook([
  BF('F1', 0, 64, 0, 30), BF('F2', 0, 64, 1, 20), BF('F3', 0, 64, 2, 9), BF('F4', 0, 64, 3, 12)
])
assert.match(
  chestBudgetFloorBookRow(spreadBook),
  /- THE SPREAD IS THE SHAPE: no rider, no band owns the floor - the tie law held$/,
  'the tie law'
)

// The band edges ride the book's own ruler: d=10 closes, d=11/25 mid,
// d=26 far.
const edges = chestBudgetFloorBook([
  BF('F1', 0, 64, 0, 10), BF('F2', 0, 64, 1, 11), BF('F3', 0, 64, 2, 25), BF('F4', 0, 64, 3, 26)
])
assert.equal(edges.bands.close, 1, 'd=10 rides close')
assert.equal(edges.bands.mid, 2, 'd=11 and d=25 ride mid')
assert.equal(edges.bands.far, 1, 'd=26 rides far')

// The honest silences: no budget-floor rides, the no-path family, the
// decide family, the bank family (no position), junk, null.
assert.equal(chestBudgetFloorBook([]), null, 'no rides = silence')
assert.equal(chestBudgetFloorBook([NP('F1', 0, 64, 0, 12)]), null, 'the no-path family stays the ring\'s own read')
assert.equal(chestBudgetFloorBook([DECIDE('F1', 0, 64, 0, 12)]), null, 'the decide family stays the distance lens\'s own read')
assert.equal(chestBudgetFloorBook(['F1 bank: 0 (chest unreachable (budget exhausted (walk floor)))']), null, 'the bank byte carries no chest - silence (the bill keeps its verdict count)')
assert.equal(chestBudgetFloorBook(['F19 bank fallback: none (chest unreachable (budget exhausted (walk floor)))']), null, 'the fallback family stays with the docket')
assert.equal(chestBudgetFloorBook(['F1 [F1] digShaft: water table y=57']), null, 'a calm log = silence')
assert.equal(chestBudgetFloorBook(null), null, 'null input')
assert.equal(chestBudgetFloorBook(42), null, 'junk input')
assert.equal(chestBudgetFloorBookRow(null), null, 'null book row')
assert.equal(chestBudgetFloorBookRow(42), null, 'junk book row')

// The junk rows and the sibling verdicts judge nothing; a no-path ride
// on the SAME chest must not inflate the floor book.
const mixed = chestBudgetFloorBook([42, null, 'junk', BF('F5', 0, 64, 4, 18), NP('F6', 0, 64, 4, 20)])
assert.equal(mixed.n, 1, 'the junk rows and the sibling verdicts judge nothing')
assert.equal(mixed.chests['0,64,4'].n, 1, 'the no-path ride did not inflate the floor book')
assert.equal(mixed.distinctChests, 1, 'one chest, one floor ride')

// The fence battery: a self-inconsistent book never renders.
const good = chestBudgetFloorBook(FACE136)
assert.equal(chestBudgetFloorBookConsistent(good), true, 'the face book is consistent')
const clone = (over) => {
  const b = JSON.parse(JSON.stringify(good))
  return { ...b, ...over }
}
assert.equal(chestBudgetFloorBookConsistent(clone({ n: 19 })), false, 'the book n break')
assert.equal(chestBudgetFloorBookConsistent(clone({ distinctChests: 10 })), false, 'the distinct break')
assert.equal(chestBudgetFloorBookConsistent(clone({ repeatRides: 17 })), false, 'the ride-share break')
assert.equal(chestBudgetFloorBookConsistent(clone({ soloRides: 3 })), false, 'the solo break')
const botBreak = clone({ byBot: { F19: 19 } })
assert.equal(chestBudgetFloorBookConsistent(botBreak), false, 'the bots\' sum break')
const dBreak = clone({ d: { n: 20, min: 23, max: 29, avg: 99 } })
assert.equal(chestBudgetFloorBookConsistent(dBreak), false, 'the avg > max break')
const dnBreak = clone({ d: { n: 19, min: 23, max: 29, avg: 26 } })
assert.equal(chestBudgetFloorBookConsistent(dnBreak), false, 'the d n break')
const bandBreak = clone({ bands: { close: 1, mid: 7, far: 13 } })
assert.equal(chestBudgetFloorBookConsistent(bandBreak), false, 'the bands\' sum break')
const chestSumBreak = JSON.parse(JSON.stringify(good))
delete chestSumBreak.chests['-106,71,399']
assert.equal(chestBudgetFloorBookConsistent(chestSumBreak), false, 'the chests\' sum break')
const chestBotBreak = JSON.parse(JSON.stringify(good))
chestBotBreak.chests['-106,71,403'].bots.F19 = 1
assert.equal(chestBudgetFloorBookConsistent(chestBotBreak), false, 'the chest bots\' sum break')
const chestDBreak = JSON.parse(JSON.stringify(good))
chestDBreak.chests['-106,71,403'].d.avg = 99
assert.equal(chestBudgetFloorBookConsistent(chestDBreak), false, 'the chest avg > max break')
const repeatBreak = JSON.parse(JSON.stringify(good))
repeatBreak.repeatChests[0].n = 1
assert.equal(chestBudgetFloorBookConsistent(repeatBreak), false, 'the repeat n break')
const repeatSrcBreak = JSON.parse(JSON.stringify(good))
repeatSrcBreak.repeatChests[0].pos = '-100,71,400'
assert.equal(chestBudgetFloorBookConsistent(repeatSrcBreak), false, 'the repeat src break')
assert.equal(chestBudgetFloorBookConsistent(null), false, 'null book fence')

// ---- WIRING ----

// The decompose prints the book beside the repeats book's own rows.
const src = fs.readFileSync(new URL('../../scripts/fleet-mining/decompose.mjs', import.meta.url), 'utf8')
assert.match(src, /import \{ chestDoorBill, chestDoorBillRow, chestDoorDistance, chestDoorDistanceRow, chestNoPathRing, chestNoPathRingRow, chestNoPathRepeats, chestNoPathRepeatsRow, chestExcludeCandidate, chestExcludeCandidateRow, chestBudgetFloorBook, chestBudgetFloorBookRow \} from '\.\.\/\.\.\/src\/lib\/chestdoor\.mjs'/, 'the lens rides the chestdoor import band')
assert.match(src, /const cbfb = chestBudgetFloorBook\(lines\)/, 'the lens folds the face\'s own lines')
assert.match(src, /if \(cbfbRow\) console\.log\(`  \$\{cbfbRow\}`\)/, "the book's own print beside the repeats rows")

// The row's own byte lives in the lib.
const lib = fs.readFileSync(new URL('../../src/lib/chestdoor.mjs', import.meta.url), 'utf8')
assert.match(lib, /the budget floor's own book \(v0\.864\.0\)/, "the row's own byte lives in the lib")

console.log('budgetfloorbook.test.mjs: all green')
