import assert from 'node:assert/strict'
import fs from 'node:fs'
import { chestNoPathRepeats, chestNoPathRepeatsRow, chestNoPathRepeatsConsistent, chestExcludeCandidate, chestExcludeCandidateRow } from '../../src/lib/chestdoor.mjs'

// The v0.862.0 lens: the no-path refusals' own per-chest repeat fold (the
// stuck chest's own book). The motive: the ring (v0.860.0) banded the
// refusals' d and named the geometry the door's owner (face 134: mid 14
// of 18) - but the fold rode band-aggregate only: WHICH chest refused,
// and WHICH chest refused AGAIN, rode unnamed. The exclude front's own
// question rode with it: a chest that refuses no-path TWICE is the
// exclude machinery's own candidate (the v0.853.0 swap voice's
// exclude-one-candidate bound - the twice-refused chest should never
// re-rent its walk), while a chest refused once is the ring's noise.
// The refusal's own d rides the walk the chest rented - the repeats'
// ride-share prices the cure BEFORE the fleet wiring. The fold reads the
// SAME hop regex the bill and the ring read (the one-parser law) and
// bands by the ring's own ruler (the one-ruler law).

const HOP = (bot, x, y, z, d, msg) => `${bot} [${bot}] hop: chest at [${x},${y},${z}] d=${d} zero: chest unreachable (${msg})`
const NP = (bot, x, y, z, d) => HOP(bot, x, y, z, d, 'No path to the goal!')
const DECIDE = (bot, x, y, z, d) => HOP(bot, x, y, z, d, 'Took to long to decide on a path')

// The face-134 verbatim table (run 37886112038's own 18 no-path hop
// rides, the REAL positions byte-read from fleet19.log).
const FACE134 = [
  NP('F1', -117, 70, 410, 23),
  NP('F1', -122, 70, 410, 22),
  NP('F3', -117, 70, 418, 38),
  NP('F7', -153, 70, 392, 13),
  NP('F3', -122, 70, 418, 35),
  NP('F3', -127, 70, 418, 40),
  NP('F1', -117, 70, 414, 17),
  NP('F15', -157, 70, 408, 15),
  NP('F15', -152, 70, 408, 15),
  NP('F3', -117, 70, 414, 32),
  NP('F15', -147, 70, 408, 18),
  NP('F19', -117, 70, 418, 15),
  NP('F19', -122, 70, 416, 16),
  NP('F19', -127, 70, 416, 20),
  NP('F19', -117, 70, 414, 14),
  NP('F1', -117, 70, 408, 22),
  NP('F1', -122, 70, 410, 25),
  NP('F1', -117, 70, 414, 22)
]

const book = chestNoPathRepeats(FACE134)
assert.equal(book.n, 18, 'the fold: every no-path ride lands')
assert.equal(book.distinctChests, 13, '13 distinct chests rode the refusal')
assert.equal(book.repeatChests.length, 3, '3 chests refused twice or more')
assert.equal(book.repeatRides, 8, '8 of the 18 walks rented on repeats')
assert.equal(book.soloRides, 10, '10 walks rode solo chests')

// The x4 chest: the CROSS-BOT repeat - three bots, one stuck chest, the
// exclude machinery's own first candidate. Bands split mid+far.
const stuck = book.chests['-117,70,414']
assert.equal(stuck.n, 4, 'the stuck chest took 4 rides')
assert.deepEqual(stuck.bots, { F1: 2, F3: 1, F19: 1 }, 'the stuck chest\'s own bots')
assert.deepEqual(stuck.d, { n: 4, min: 14, max: 32, avg: 21.3 }, 'the stuck chest\'s own d')
assert.deepEqual(stuck.bands, { close: 0, mid: 3, far: 1 }, 'the stuck chest\'s own bands')
assert.equal(stuck.bandCell, 'mid+far', 'the split band names both rulers')

// The x2 shared chest: F3 and F19 both refused, 15 and 38 apart - the
// band split rides honestly.
const shared = book.chests['-117,70,418']
assert.equal(shared.n, 2)
assert.deepEqual(shared.bots, { F3: 1, F19: 1 })
assert.deepEqual(shared.d, { n: 2, min: 15, max: 38, avg: 26.5 })
assert.equal(shared.bandCell, 'mid+far', 'the split band')

// The same-bot repeat: F1 came BACK to the same chest and was refused
// again - the memory hole, not the geometry.
const rewalk = book.chests['-122,70,410']
assert.equal(rewalk.n, 2)
assert.deepEqual(rewalk.bots, { F1: 2 }, 'the same bot, twice')
assert.deepEqual(rewalk.d, { n: 2, min: 22, max: 25, avg: 23.5 })
assert.equal(rewalk.bandCell, 'mid', 'the single band')

// The repeat order: the heaviest chest first, then the widest bot crowd,
// then the position - deterministic.
assert.deepEqual(book.repeatChests.map(r => r.pos), ['-117,70,414', '-117,70,418', '-122,70,410'], 'the repeats ride ordered')

// The verbatim row: 8 of 18 rented on repeats (44%) - under the majority
// line, the candidates seat reads.
assert.match(
  chestNoPathRepeatsRow(book),
  /^the no-path repeats' own book \(v0\.862\.0\): 18 refusal\(s\) on 13 distinct chest\(s\) - repeats 3 \(\[-117,70,414\] x4 F1\+F19\+F3 d 14\.\.32 avg 21\.3 mid\+far, \[-117,70,418\] x2 F19\+F3 d 15\.\.38 avg 26\.5 mid\+far, \[-122,70,410\] x2 F1 d 22\.\.25 avg 23\.5 mid\) - walks rented on repeats 8 of 18 \(44%\) - THE EXCLUDE'S OWN CANDIDATES: the twice-refused chest re-rents its walk - the cross-bot repeat names the swap list, the same-bot repeat names the memory hole$/,
  'the face-134 row verbatim'
)

// The rent seat: a majority of the walks rented on repeats names the
// exclude machinery's own front.
const rentBook = chestNoPathRepeats([
  NP('F1', 0, 64, 0, 12), NP('F1', 0, 64, 0, 14), NP('F2', 0, 64, 1, 30)
])
assert.match(
  chestNoPathRepeatsRow(rentBook),
  /- THE REPEAT'S OWN RENT: the majority of the walks rented on chests that had already refused - the exclude machinery's own front$/,
  'the rent seat'
)

// The honest once: every chest refused once - the ring's noise owns.
const onceBook = chestNoPathRepeats([NP('F1', 0, 64, 0, 12), NP('F2', 0, 64, 1, 15)])
assert.equal(onceBook.repeatChests.length, 0, 'no repeats')
assert.equal(onceBook.repeatRides, 0, 'no rented walks')
assert.match(
  chestNoPathRepeatsRow(onceBook),
  /- repeats none \(every chest refused once\) - walks rented on repeats 0 of 2 \(0%\) - THE HONEST ONCE: the ring's noise owns, the repeats wait for their second face$/,
  'the honest once'
)

// The band edges ride the chest cells: d=10 closes, d=11/25 mid, d=26 far.
const edges = chestNoPathRepeats([
  NP('F1', 0, 64, 0, 10), NP('F2', 0, 64, 1, 11), NP('F3', 0, 64, 2, 25), NP('F4', 0, 64, 3, 26)
])
assert.equal(edges.chests['0,64,0'].bandCell, 'close', 'd=10 rides close')
assert.equal(edges.chests['0,64,1'].bandCell, 'mid', 'd=11 rides mid')
assert.equal(edges.chests['0,64,2'].bandCell, 'mid', 'd=25 rides mid')
assert.equal(edges.chests['0,64,3'].bandCell, 'far', 'd=26 rides far')

// The honest silences: no no-path rides, the decide family, the bank
// family, junk, null.
assert.equal(chestNoPathRepeats([]), null, 'no rides = silence')
assert.equal(chestNoPathRepeats([DECIDE('F1', 0, 64, 0, 12)]), null, 'the decide family stays the distance lens\'s own read')
assert.equal(chestNoPathRepeats(['F1 bank: chest unreachable (No path to the goal!) (32 blocks from yard) - walking back']), null, 'the bank byte carries no chest - silence')
assert.equal(chestNoPathRepeats(['F1 [F1] digShaft: water table y=57']), null, 'a calm log = silence')
assert.equal(chestNoPathRepeats(null), null, 'null input')
assert.equal(chestNoPathRepeats(42), null, 'junk input')
assert.equal(chestNoPathRepeatsRow(null), null, 'null book row')
assert.equal(chestNoPathRepeatsRow(42), null, 'junk book row')

// The junk rows and the decide family judge nothing; a decide ride on
// the SAME chest must not inflate the chest's refusal count.
const mixed = chestNoPathRepeats([42, null, 'junk', NP('F5', 0, 64, 4, 18), DECIDE('F6', 0, 64, 4, 20)])
assert.equal(mixed.n, 1, 'the junk rows and the decide family judge nothing')
assert.equal(mixed.chests['0,64,4'].n, 1, 'the decide ride did not inflate the chest')
assert.equal(mixed.distinctChests, 1, 'one chest, one refusal')

// The fence battery: a self-inconsistent book never renders.
const good = chestNoPathRepeats(FACE134)
assert.equal(chestNoPathRepeatsConsistent(good), true, 'the face book is consistent')
const clone = (over) => {
  const b = JSON.parse(JSON.stringify(good))
  return { ...b, ...over }
}
assert.equal(chestNoPathRepeatsConsistent(clone({ n: 17 })), false, 'the book n break')
assert.equal(chestNoPathRepeatsConsistent(clone({ distinctChests: 12 })), false, 'the distinct break')
assert.equal(chestNoPathRepeatsConsistent(clone({ repeatRides: 7 })), false, 'the ride-share break')
assert.equal(chestNoPathRepeatsConsistent(clone({ soloRides: 9 })), false, 'the solo break')
const botBreak = JSON.parse(JSON.stringify(good))
botBreak.chests['-117,70,414'].bots.F1 = 1
assert.equal(chestNoPathRepeatsConsistent(botBreak), false, 'the bots\' sum break')
const dBreak = JSON.parse(JSON.stringify(good))
dBreak.chests['-117,70,414'].d.avg = 99
assert.equal(chestNoPathRepeatsConsistent(dBreak), false, 'the avg > max break')
const dnBreak = JSON.parse(JSON.stringify(good))
dnBreak.chests['-117,70,414'].d.n = 3
assert.equal(chestNoPathRepeatsConsistent(dnBreak), false, 'the d n break')
const bandBreak = JSON.parse(JSON.stringify(good))
bandBreak.chests['-117,70,414'].bands.mid = 2
assert.equal(chestNoPathRepeatsConsistent(bandBreak), false, 'the bands\' sum break')
const chestSumBreak = JSON.parse(JSON.stringify(good))
delete chestSumBreak.chests['-122,70,410']
assert.equal(chestNoPathRepeatsConsistent(chestSumBreak), false, 'the chests\' sum break')
const repeatBreak = JSON.parse(JSON.stringify(good))
repeatBreak.repeatChests[0].n = 2
assert.equal(chestNoPathRepeatsConsistent(repeatBreak), false, 'the repeat n break')
assert.equal(chestNoPathRepeatsConsistent(null), false, 'null book fence')

// ---- THE EXCLUDE'S OWN CANDIDATE LIST (v0.869.0) ----

// The face-134 book prices its TOP repeat: the x4 stuck chest, the
// cross-bot crowd - THE SWAP LIST'S OWN CHEST. The bound: 3 repeats rode
// the face, the list prices exactly ONE (the exclude-one-candidate law).
const cand = chestExcludeCandidate(book)
assert.ok(cand, 'the face-134 book prices its candidate')
assert.equal(cand.pos, '-117,70,414', 'the heaviest chest rides as the top')
assert.equal(cand.n, 4, 'the candidate keeps the book\'s own count')
assert.equal(cand.kind, 'swap-list', 'the cross-bot crowd names the swap list')
assert.equal(cand.why, "3 bots paid the same door - the v0.23.1 swap's next-chest ring prices it out", 'the swap-list why')
assert.match(
  chestExcludeCandidateRow(cand),
  /^the exclude's own candidate \(v0\.869\.0\): \[-117,70,414\] x4 F1\+F19\+F3 d 14\.\.32 avg 21\.3 mid\+far - THE SWAP LIST'S OWN CHEST: 3 bots paid the same door - the v0\.23\.1 swap's next-chest ring prices it out$/,
  'the swap-list row verbatim (the bots ride sorted)'
)

// The same-bot repeat: one bot came BACK - the MEMORY HOLE'S OWN CHEST.
const holeBook = chestNoPathRepeats([NP('F1', 0, 64, 0, 12), NP('F1', 0, 64, 0, 14), NP('F2', 0, 64, 1, 30)])
const hole = chestExcludeCandidate(holeBook)
assert.equal(hole.pos, '0,64,0', 'the same-bot repeat rides as the top')
assert.equal(hole.kind, 'memory-hole', 'the solo crowd names the memory hole')
assert.equal(hole.why, 'F1 came BACK to the refused chest - the private loop, the TTL\'s own class', 'the memory-hole why')
assert.match(
  chestExcludeCandidateRow(hole),
  /- THE MEMORY HOLE'S OWN CHEST: F1 came BACK to the refused chest - the private loop, the TTL's own class$/,
  'the memory-hole seat'
)

// The bound: a face that names many has not priced any - exactly one
// candidate rides, the book's own order decides which.
assert.equal(book.repeatChests.length, 3, 'the face rode 3 repeats')
assert.equal(cand.pos, book.repeatChests[0].pos, 'the top rides, the rest stay the honest spread')

// The honest silences: the clean face prices nothing, the inconsistent
// book prices nothing (the fence law), junk prices nothing.
assert.equal(chestExcludeCandidate(onceBook), null, 'the honest once prices nothing')
assert.equal(chestExcludeCandidate(clone({ n: 17 })), null, 'the inconsistent book prices nothing')
assert.equal(chestExcludeCandidate(null), null, 'null book')
assert.equal(chestExcludeCandidate(42), null, 'junk book')

// The row's own junk law: junk, unknown kind, sub-repeat n, missing
// cells, a botless crowd - all render nothing.
assert.equal(chestExcludeCandidateRow(null), null, 'null cand row')
assert.equal(chestExcludeCandidateRow(42), null, 'junk cand row')
assert.equal(chestExcludeCandidateRow({ ...cand, kind: 'junk' }), null, 'unknown kind')
assert.equal(chestExcludeCandidateRow({ ...cand, n: 1 }), null, 'a sub-repeat n renders nothing')
assert.equal(chestExcludeCandidateRow({ ...cand, pos: '' }), null, 'a missing pos renders nothing')
assert.equal(chestExcludeCandidateRow({ ...cand, d: { ...cand.d, avg: NaN } }), null, 'a junk d renders nothing')
assert.equal(chestExcludeCandidateRow({ ...cand, bandCell: '' }), null, 'a missing band cell renders nothing')
assert.equal(chestExcludeCandidateRow({ ...cand, bots: {} }), null, 'a botless crowd renders nothing')

// ---- WIRING ----

// The decompose prints the book beside the ring's own rows.
const src = fs.readFileSync(new URL('../../scripts/fleet-mining/decompose.mjs', import.meta.url), 'utf8')
assert.match(src, /import \{ chestDoorBill, chestDoorBillRow, chestDoorDistance, chestDoorDistanceRow, chestNoPathRing, chestNoPathRingRow, chestNoPathRepeats, chestNoPathRepeatsRow, chestExcludeCandidate, chestExcludeCandidateRow, chestBudgetFloorBook, chestBudgetFloorBookRow \} from '\.\.\/\.\.\/src\/lib\/chestdoor\.mjs'/, 'the lens rides the chestdoor import band')
assert.match(src, /const cnrp = chestNoPathRepeats\(lines\)/, 'the lens folds the face\'s own lines')
assert.match(src, /if \(cnrpRow\) console\.log\(`  \$\{cnrpRow\}`\)/, "the book's own repeats print beside the ring rows")
// (v0.869.0) the candidate's own print site rides the book's block
assert.match(src, /const cnrpCand = chestExcludeCandidate\(cnrp\)/, 'the lens prices the book\'s own top repeat')
assert.match(src, /if \(cnrpCandRow\) console\.log\(`  \$\{cnrpCandRow\}`\)/, 'the candidate\'s own row prints beside the book')

// The row's own byte lives in the lib.
const lib = fs.readFileSync(new URL('../../src/lib/chestdoor.mjs', import.meta.url), 'utf8')
assert.match(lib, /the no-path repeats' own book \(v0\.862\.0\)/, "the row's own byte lives in the lib")
// (v0.869.0) the candidate list's own bytes live in the lib beside the book
assert.match(lib, /\(v0\.869\.0\) THE EXCLUDE'S OWN CANDIDATE LIST/, 'the list\'s own docstring lives in the lib')
assert.match(lib, /the exclude's own candidate \(v0\.869\.0\)/, "the candidate row's own byte lives in the lib")

console.log('nopathrepeats.test.mjs: all green')
