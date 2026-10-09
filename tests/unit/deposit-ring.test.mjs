// THE DEPOSIT RING'S OWN FOLD - the swap voice's own tests (v0.875.0).
// The emitter's line is deposit.mjs's own byte (the v0.23.1 swap's own
// voice, riding the 'deposit' filter-key since the fleet's first faces);
// face 142's read priced the crater at its deepest (banked 0 of 1738u)
// while the swap's own voice rode unfolded. The verbatim lines below are
// SYNTHETIC, built from the deposit.mjs log template byte for byte (the
// v0.873.0 precedent: pre-field tests pin the shape, the field face rides
// the next fire's artifact read). The repeats are PER CHEST across bots
// (the chestNoPathRepeats law - the swap list's own signal).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { depositRingFold, depositRingFoldConsistent, depositRingFoldRow, DEPOSIT_RING_REFUSAL_RE } from '../../src/lib/deposit.mjs'

const refusalLine = (bot, chest, msg) =>
  `${bot} [${bot}] deposit: the nearest chest [${chest}] refused (${msg}) - the next chest in the ring takes the walk (the v0.23.1 swap's own voice)`

test('THE KERNEL PIN: the regex is the deposit.mjs template, end-anchored', () => {
  const line = refusalLine('F15', '-144,80,393', 'No path to the goal!')
  const m = DEPOSIT_RING_REFUSAL_RE.exec(line)
  assert.ok(m, 'the template line matches')
  assert.equal(m[1], '-144', 'x reads')
  assert.equal(m[2], '80', 'y reads')
  assert.equal(m[3], '393', 'z reads')
  assert.equal(m[4], 'No path to the goal!', 'the why reads')
})

test('THE NESTED-PAREN LAW: the why keeps its own parens - the body runs to the tail', () => {
  const f = depositRingFold([refusalLine('F9', '-113,70,398', 'budget exhausted (walk floor)')])
  assert.ok(f, 'the fold prices the line')
  assert.equal(f.n, 1, 'one refusal')
  assert.equal(f.truncated, 0, 'nothing truncated')
  assert.deepEqual(Object.keys(f.whys), ['budget exhausted (walk floor)'], 'the nested paren rides whole - the v0.873.0 end-anchored law')
  assert.equal(f.whySeat, 'budget exhausted (walk floor)', 'the seat names the why byte-identical')
})

test('THE WHO SEAT: the fleet tag names the bot, a botless line rides ?', () => {
  const f = depositRingFold([
    refusalLine('F15', '-144,80,393', 'No path to the goal!'),
    'deposit: the nearest chest [-144,80,393] refused (timed out) - the next chest in the ring takes the walk (the v0.23.1 swap\'s own voice)'
  ])
  assert.equal(f.n, 2, 'both refusals land')
  assert.equal(f.byBot.F15, 1, 'the tagged bot counts once')
  assert.equal(f.byBot['?'], 1, 'the botless line rides the honest ? seat')
  assert.deepEqual(f.chests['-144,80,393'].bots, ['?', 'F15'], 'the chest cell keeps both walkers sorted')
})

test('THE RING BOOK: multi-bot multi-chest folds, the top chest reads', () => {
  const f = depositRingFold([
    refusalLine('F9', '-113,70,398', 'No path to the goal!'),
    refusalLine('F15', '-144,80,393', 'No path to the goal!'),
    refusalLine('F15', '-144,80,393', 'No path to the goal!'),
    refusalLine('F3', '-155,70,404', 'budget exhausted (walk floor)')
  ])
  assert.equal(f.n, 4, 'four refusals')
  assert.deepEqual(f.byBot, { F3: 1, F9: 1, F15: 2 }, 'the bots ride their counts')
  assert.equal(f.chests['-144,80,393'].n, 2, 'the swap candidate chest counts twice')
  assert.deepEqual(f.chests['-144,80,393'].bots, ['F15'], 'the chest bot set dedupes')
  assert.equal(f.whySeat, 'No path to the goal!', 'the majority why owns the seat')
  assert.deepEqual(f.repeats, [{ chest: '-144,80,393', n: 2, bots: ['F15'] }], 'the per-chest repeat joins - the swap list\'s own signal')
})

test('THE TIE LAW: no majority why reads the spread - the row still renders', () => {
  const f = depositRingFold([
    refusalLine('F9', '-113,70,398', 'No path to the goal!'),
    refusalLine('F3', '-155,70,404', 'timed out')
  ])
  assert.equal(f.whySeat, null, 'the tie reads null - the honest spread')
  assert.ok(depositRingFoldConsistent(f), 'the tie is consistent')
  const row = depositRingFoldRow(f)
  assert.ok(row.includes('THE SPREAD IS THE SHAPE (the tie law held)'), 'the row names the spread')
})

test('THE TRUNCATED HONESTY: a kernel-prefix line failing the parse counts truncated', () => {
  const f = depositRingFold([
    refusalLine('F9', '-113,70,398', 'No path to the goal!'),
    'F9 [F9] deposit: the nearest chest [-113,70,398] refused (No path to the goal!) - the next chest in the ring takes'
  ])
  assert.equal(f.n, 1, 'only the full line prices')
  assert.equal(f.truncated, 1, 'the truncated line rides the honesty cell')
})

test('THE HONEST SILENCES: a clean face prices nothing; receipts and junk never fold', () => {
  assert.equal(depositRingFold([]), null, 'an empty face prices nothing')
  assert.equal(depositRingFold([
    'F9 [F9] deposit: banked 173u at [-113,70,398] (the pocket\'s own receipt)',
    'F15 [F15] deposit: the pocket holds 44u - nothing to deposit',
    'water: death spot memorized as a hazard at [-126,62,390] (3 live, fleet-wide)',
    42,
    null
  ]), null, 'the affordable path, the other deposit voices and the junk rows stay silent')
})

test('THE JUNK BATTERY: non-array, coords-free and tail-free shapes never fold', () => {
  assert.equal(depositRingFold(null), null, 'null reads nothing')
  assert.equal(depositRingFold('a raw blob'), null, 'non-array reads nothing')
  assert.equal(depositRingFold(['deposit: the nearest chest refused (no coords) - the next chest in the ring takes the walk (the v0.23.1 swap\'s own voice)']), null, 'a coords-free line is silence')
  assert.equal(depositRingFold([refusalLine('F9', '-113,70,398', 'No path').replace(' (the v0.23.1 swap\'s own voice)', '')]), null, 'a tail-free line is silence - the kernel prefix alone prices nothing')
})

test('THE FENCE BATTERY: lies refused', () => {
  const good = depositRingFold([refusalLine('F9', '-113,70,398', 'No path to the goal!')])
  assert.ok(depositRingFoldConsistent(good), 'the honest book passes')
  assert.equal(depositRingFoldConsistent(null), false, 'null refused')
  assert.equal(depositRingFoldConsistent({}), false, 'the empty shape refused')
  assert.equal(depositRingFoldConsistent({ ...good, n: 0 }), false, 'a zero-refusal book refused')
  assert.equal(depositRingFoldConsistent({ ...good, truncated: -1 }), false, 'a negative truncated cell refused')
  assert.equal(depositRingFoldConsistent({ ...good, byBot: {} }), false, 'a botless book refused')
  assert.equal(depositRingFoldConsistent({ ...good, chests: {} }), false, 'a chestless book refused')
  const badCell = depositRingFold([refusalLine('F9', '-113,70,398', 'No path to the goal!')])
  badCell.chests['-113,70,398'] = { n: 0, bots: [] }
  assert.equal(depositRingFoldConsistent(badCell), false, 'an empty chest cell refused')
  assert.equal(depositRingFoldConsistent({ ...good, whys: {} }), false, 'a whyless book refused')
  assert.equal(depositRingFoldConsistent({ ...good, repeats: [{ chest: '-113,70,398', n: 1, bots: ['F9'] }] }), false, 'a sub-2 repeat refused - repeats are per-chest n>=2')
})

test('THE ROW BYTES: the verdict line rides verbatim', () => {
  const f = depositRingFold([
    refusalLine('F15', '-144,80,393', 'No path to the goal!'),
    refusalLine('F9', '-144,80,393', 'No path to the goal!'),
    refusalLine('F3', '-144,80,393', 'No path to the goal!'),
    refusalLine('F3', '-144,80,393', 'No path to the goal!')
  ])
  assert.equal(depositRingFoldRow(f), 'the deposit ring\'s own fold (v0.875.0): 4 refusal(s) by 3 bot(s) (F15+F3+F9), 1 chest(s), top [-144,80,393] x4 - the why\'s seat: "No path to the goal!" - repeats 1', 'the row rides its exact bytes')
  assert.equal(depositRingFoldRow(null), null, 'a null book renders nothing')
  assert.equal(depositRingFoldRow({ n: 1 }), null, 'a junk book renders nothing')
})

test('THE WIRING PINS: the decompose print site rides beside the preflight book\'s own', () => {
  const dec = readFileSync(new URL('../../scripts/fleet-mining/decompose.mjs', import.meta.url), 'utf8')
  assert.match(dec, /import \{ depositRingFold, depositRingFoldRow \} from '\.\.\/\.\.\/src\/lib\/deposit\.mjs'/, 'the fold rides its own import band (the fire-1030/1500 precedent - the band grows with the list)')
  assert.match(dec, /const drf = depositRingFold\(lines\)/, 'the fold reads the face')
  assert.match(dec, /const drfRow = depositRingFoldRow\(drf\)/, 'the row renders')
  const lib = readFileSync(new URL('../../src/lib/deposit.mjs', import.meta.url), 'utf8')
  assert.match(lib, /\(v0\.875\.0\) THE DEPOSIT RING'S OWN FOLD/, 'the lib rides its own version stamp')
})
