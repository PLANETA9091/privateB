import assert from 'node:assert/strict'
import fs from 'node:fs'
import { chestLidBook, chestLidBookRow, chestLidBookConsistent } from '../../src/lib/chestlid.mjs'

// The v0.859.0 lens: the lid-timeout rides' own WHO+WHERE fold, read
// through parseHopZero (the one-parser law - the hop-zero census's own
// exported grammar, filtered to the open-timeout class). The motive: the
// bill (v0.852.0) requires the 'chest unreachable' wrapper, so the
// 'cannot open chest' rides rode outside it - the docket counted them by
// aggregate only (face 133: lid timeouts 7). The ride's own shape proves
// the walk arrived (the open call fires AT the chest) - the d rides the
// approach, the timeout rides the lid.

// The face-133 verbatim table (run 37882700457's own lid rides: F2 x2,
// F5 x5 with the same-column repeats).
const FACE133 = [
  'F2 [F2] hop: chest at [-138,70,384] d=19 zero: cannot open chest (open chest: timeout after 10000ms)',
  'F2 [F2] hop: chest at [-140,70,384] d=13 zero: cannot open chest (open chest: timeout after 10000ms)',
  'F5 [F5] hop: chest at [-102,70,410] d=44 zero: cannot open chest (open chest: timeout after 10000ms)',
  'F5 [F5] hop: chest at [-107,70,410] d=37 zero: cannot open chest (open chest: timeout after 10000ms)',
  'F5 [F5] hop: chest at [-102,70,408] d=38 zero: cannot open chest (open chest: timeout after 10000ms)',
  'F5 [F5] hop: chest at [-107,70,410] d=37 zero: cannot open chest (open chest: timeout after 10000ms)',
  'F5 [F5] hop: chest at [-102,70,408] d=38 zero: cannot open chest (open chest: timeout after 10000ms)'
]

const b = chestLidBook(FACE133)
assert.equal(b.n, 7, 'the fold: every lid ride counts')
assert.deepEqual(b.byBot, { F2: 2, F5: 5 }, 'the bots fold')
assert.equal(b.bots, 2, 'the bot count')
assert.deepEqual(b.repeats, [['F5', 5], ['F2', 2]], 'the repeats name the rider (count desc)')
assert.equal(b.distinctChests, 5, 'the chests fold: 5 distinct')
assert.equal(b.sharedChests, 0, 'none shared across bots')
assert.deepEqual(b.d, { n: 7, min: 13, max: 44, avg: 32.3 }, 'the walk arrived (the approach priced)')
assert.deepEqual(b.ms, [10000], 'the lid clock folds')

// The verbatim row.
assert.match(
  chestLidBookRow(b),
  /^the chest lid's own book \(v0\.859\.0\): 7 ride\(s\) - bots 2 \(repeats F5=5 F2=2\) - chests 5 distinct, none shared - the walk arrived \(d 13\.\.44 avg 32\.3 of 7\) - the lid died \(open timeout 10000ms x7\) - THE LID'S OWN CROWD: the repeats name the rider, the repeated column names the stuck lid$/,
  'the face-133 row verbatim'
)

// A shared chest (two bots stuck on the same lid) names the dead column.
const shared = chestLidBook([
  'F1 [F1] hop: chest at [-100,70,400] d=8 zero: cannot open chest (open chest: timeout after 10000ms)',
  'F2 [F2] hop: chest at [-100,70,400] d=9 zero: cannot open chest (open chest: timeout after 10000ms)'
])
assert.equal(shared.sharedChests, 1, 'the shared lid folds')
assert.match(
  chestLidBookRow(shared),
  /chests 1 distinct \(shared 1: \[-100,70,400\] x2 F1\+F2\)/,
  'the shared cell names the dead lid'
)

// A ride without d= stays honest (the approach unpriced rides the fold).
const noD = chestLidBook([
  'F3 [F3] hop: chest at [-105,70,402] zero: cannot open chest (open chest: timeout after 10000ms)',
  'F3 [F3] hop: chest at [-106,70,403] d=11 zero: cannot open chest (open chest: timeout after 10000ms)'
])
assert.equal(noD.d.n, 1, 'only the priced d folds')
assert.match(chestLidBookRow(noD), /the walk arrived \(d 11\.\.11 avg 11 of 1\)/, 'the priced cell carries its own n')

// The honest silences: no lid rides, the bill's own family, junk, null.
assert.equal(chestLidBook([]), null, 'no rides = silence')
assert.equal(
  chestLidBook(['F9 [F9] hop: chest at [-155,70,404] d=9 zero: chest unreachable (No path to the goal!)']),
  null,
  'the chest-unreachable family stays the bill\'s own book'
)
assert.equal(chestLidBook(['F1 [F1] digShaft: water table y=57']), null, 'a calm log = silence')
assert.equal(chestLidBook(null), null, 'null input')
assert.equal(chestLidBook(42), null, 'junk input')
assert.equal(chestLidBookRow(null), null, 'null book row')
assert.equal(chestLidBookRow(42), null, 'junk book row')

// The fence battery: a self-inconsistent book never renders.
const good = chestLidBook(FACE133)
assert.equal(chestLidBookConsistent(good), true, 'the face book is consistent')
assert.equal(chestLidBookConsistent({ ...good, byBot: { F2: 2, F5: 4 } }), false, 'the bots\' sum break')
assert.equal(
  chestLidBookConsistent({ ...good, chests: { ...good.chests, '-102,70,408': { n: 1, bots: { F5: 1 } } } }),
  false,
  'the chests\' sum break'
)
assert.equal(
  chestLidBookConsistent({ ...good, d: { n: 7, min: 99, max: 44, avg: 32.3 } }),
  false,
  'the d order break'
)
assert.equal(chestLidBookConsistent({ ...good, ms: [] }), false, 'the empty ms break')
assert.equal(chestLidBookConsistent(null), false, 'null book fence')

// The junk rows judge nothing; a mixed log still folds.
const mixed = chestLidBook([
  42,
  null,
  'junk',
  'F7 [F7] hop: chest at [-101,70,401] d=6 zero: cannot open chest (open chest: timeout after 10000ms)'
])
assert.equal(mixed.n, 1, 'the junk rows judge nothing')

// The multi-ms lid clock reads its range honestly.
const multiMs = chestLidBook([
  'F4 [F4] hop: chest at [-111,70,405] d=21 zero: cannot open chest (open chest: timeout after 10000ms)',
  'F4 [F4] hop: chest at [-112,70,406] d=22 zero: cannot open chest (open chest: timeout after 15000ms)'
])
assert.match(chestLidBookRow(multiMs), /the lid died \(open timeout 10000\.\.15000ms\)/, 'the mixed clock range')

// ---- WIRING ----

// The decompose prints the lid book beside the door's own rows.
const src = fs.readFileSync(new URL('../../scripts/fleet-mining/decompose.mjs', import.meta.url), 'utf8')
assert.match(src, /import \{ chestLidBook, chestLidBookRow \} from '\.\.\/\.\.\/src\/lib\/chestlid\.mjs'/, 'the lens rides the import band')
assert.match(src, /const clb = chestLidBook\(lines\)/, 'the lens folds the face\'s own lines')
assert.match(src, /if \(clbRow\) console\.log\(`  \$\{clbRow\}`\)/, "the lid's own crowd prints beside the door rows")

// The one-parser law: the lens reads through the hop-zero census's own
// parser, no new grammar.
const lib = fs.readFileSync(new URL('../../src/lib/chestlid.mjs', import.meta.url), 'utf8')
assert.match(lib, /import \{ parseHopZero \} from '\.\/hopcensus\.mjs'/, 'the ride grammar is the census\'s own')
assert.match(lib, /the chest lid's own book \(v0\.859\.0\)/, "the row's own byte lives in the lib")

console.log('chestlid.test.mjs: all green')
