// THE WALK FLOOR'S OWN FIELD READ - the preflight's own tests (v0.873.0).
// The gate itself shipped v0.871.0 (ebffdc1) with the v0.872.0 re-stamp
// (3289412); face 142 (37924221081) is its first live face, in flight at
// this battery's writing - the verbatim lines below are SYNTHETIC, built
// from the deposit.mjs log template byte for byte (the v0.871.0
// precedent: pre-field tests pin the shape, the field face rides the
// next fire's artifact read). The three refusal classes are the grace
// gate's own table (yardGraceGate's why bytes); the deficit (price -
// clock) is the crater's own price read.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { walkFloorCensus, walkFloorRow, WALK_FLOOR_REFUSAL_RE } from '../../src/lib/walkfloorbook.mjs'

test('THE KERNEL PIN: the regex is the deposit.mjs template, end-anchored', () => {
  const line = 'F3 [F3] bank: chest skip (walk floor preflight: d=45 prices 52s beyond the 30s left - d=45 prices 52s beyond the grace cap (58s) - the doom guard stands)'
  const m = WALK_FLOOR_REFUSAL_RE.exec(line)
  assert.ok(m, 'the template line matches')
  assert.equal(m[1], '45', 'd reads')
  assert.equal(m[2], '52', 'the price reads')
  assert.equal(m[3], '30', 'the clock left reads')
  assert.equal(m[4], 'd=45 prices 52s beyond the grace cap (58s) - the doom guard stands', 'the tail reads to the FINAL close - the nested (58s) never truncates the body')
})

test('THE THREE CLASSES: the grace gate\'s own refusal table folds clean', () => {
  const c = walkFloorCensus([
    'F1 [F1] bank: chest skip (walk floor preflight: d=120 prices 90s beyond the 40s left - d=120 beyond the grace envelope (45) - the doom guard stands)',
    'F3 [F3] bank: chest skip (walk floor preflight: d=45 prices 52s beyond the 30s left - d=45 prices 52s beyond the grace cap (58s) - the doom guard stands)',
    'F7 [F7] bank: chest skip (walk floor preflight: d=8 prices 34s beyond the 20s left - the grace already rode (one-shot per chain))'
  ])
  assert.equal(c.refusals, 3)
  assert.equal(c.classes.envelope, 1, 'the far class the grace never funds')
  assert.equal(c.classes.graceCap, 1, 'the middle class - priced beyond the cap')
  assert.equal(c.classes.graceRode, 1, 'the repeated-walk class - the one-shot spent')
  assert.equal(c.classes.unparsed, 0)
  assert.deepEqual(c.byBot, { F1: 1, F3: 1, F7: 1 })
})

test('THE DEFICIT READ: price minus clock is the crater\'s own price', () => {
  const c = walkFloorCensus([
    'F1 [F1] bank: chest skip (walk floor preflight: d=60 prices 65s beyond the 30s left - d=60 beyond the grace envelope (45) - the doom guard stands)',
    'F2 [F2] bank: chest skip (walk floor preflight: d=30 prices 50s beyond the 45s left - d=30 prices 50s beyond the grace cap (58s) - the doom guard stands)'
  ])
  assert.equal(c.deficits.min, 5, '65-30 and 50-45 - the shortfalls')
  assert.equal(c.deficits.max, 35)
  assert.equal(c.deficits.avg, 20)
  assert.equal(c.prices.min, 50)
  assert.equal(c.clocks.max, 45)
})

test('THE NESTED-PAREN LAW: every nested close tolerated, the body never truncates', () => {
  const shapes = [
    'F1 chest skip (walk floor preflight: d=120 prices 90s beyond the 40s left - d=120 beyond the grace envelope (45) - the doom guard stands)',
    'F2 chest skip (walk floor preflight: d=8 prices 34s beyond the 20s left - the grace already rode (one-shot per chain))',
    'F3 chest skip (walk floor preflight: d=50 prices 60s beyond the 22s left - d=50 prices 60s beyond the grace cap (58s) - the doom guard stands)'
  ]
  const c = walkFloorCensus(shapes)
  assert.equal(c.refusals, 3, 'all three class skins folded')
  assert.equal(c.classes.envelope, 1)
  assert.equal(c.classes.graceCap, 1)
  assert.equal(c.classes.graceRode, 1)
})

test('THE MID-LINE KERNEL + THE BOTLESS RIDER: caller prefixes tolerated', () => {
  const c = walkFloorCensus([
    'F12 [F12] bank: yard pass 2: chest skip (walk floor preflight: d=70 prices 70s beyond the 25s left - d=70 beyond the grace envelope (45) - the doom guard stands)',
    'no tag: chest skip (walk floor preflight: d=10 prices 35s beyond the 30s left - the grace already rode (one-shot per chain))'
  ])
  assert.equal(c.refusals, 2)
  assert.deepEqual(c.byBot, { F12: 1, '?': 1 }, 'a botless line rides ? (the honest unknown)')
  assert.equal(c.classes.envelope, 1)
  assert.equal(c.classes.graceRode, 1)
})

test('THE HONEST SILENCES: the sibling skip families are NOT the preflight kernel', () => {
  const c = walkFloorCensus([
    'F1 [F1] bank: chest skip (vertical doom: the walk ladder cannot climb)',
    'F2 [F2] bank: chest skip (ledgered 4s ago at [-119,80,412] - the half-life holds)',
    'F3 [F3] bank: chest skip (full: the chest cannot take the pocket)',
    'F4 [F4] hop: chest at [-1,64,-1] d=12 zero: visit died mid-visit (budget exhausted (walk floor)) - the chain excludes it',
    'F5 [F5] bank: final bank: 0 (budget exhausted)',
    'F6 [F6] bank: chest skip (walk floor preflight-free line - d=1 prices 1s beyond the 0s left - almost but not the kernel)'
  ])
  assert.equal(c.refusals, 0, 'the vertical doom, the ledger, the full chest, the mid-visit net and the budget class all read OUTSIDE the gate\'s line')
  assert.deepEqual(c.classes, { envelope: 0, graceCap: 0, graceRode: 0, unparsed: 0 })
  assert.equal(c.dists, null)
  assert.equal(c.prices, null)
  assert.equal(c.clocks, null)
  assert.equal(c.deficits, null)
})

test('THE BREAK-LAW HONESTY: a bot refusing twice is two chain-scans broken', () => {
  const c = walkFloorCensus([
    'F1 [F1] bank: chest skip (walk floor preflight: d=60 prices 65s beyond the 30s left - d=60 beyond the grace envelope (45) - the doom guard stands)',
    'F1 [F1] bank: chest skip (walk floor preflight: d=80 prices 75s beyond the 28s left - d=80 beyond the grace envelope (45) - the doom guard stands)'
  ])
  assert.equal(c.refusals, 2, 'the chain ended, the next window started a fresh chain - both scans broke')
  assert.deepEqual(c.byBot, { F1: 2 })
  assert.equal(c.classes.envelope, 2)
})

test('THE JUNK BATTERY: every junk shape reads the zero census', () => {
  for (const junk of [null, undefined, 42, true, {}, [], ['junk'], [null, 5, ''], ['chest skip (walk floor preflight: d= prices s beyond the s left - )']]) {
    const c = walkFloorCensus(junk)
    assert.equal(c.refusals, 0, `junk ${JSON.stringify(junk)} prices nothing`)
    assert.deepEqual(c.classes, { envelope: 0, graceCap: 0, graceRode: 0, unparsed: 0 })
    assert.equal(c.dists, null)
  }
  const blob = walkFloorCensus('F1 chest skip (walk floor preflight: d=9 prices 39s beyond the 25s left - the grace already rode (one-shot per chain))\nF2 clean line')
  assert.equal(blob.refusals, 1, 'a raw blob splits on newlines')
})

test('THE ROW PIN: the census\'s own byte, verbatim', () => {
  const c = walkFloorCensus([
    'F3 [F3] bank: chest skip (walk floor preflight: d=45 prices 52s beyond the 30s left - d=45 prices 52s beyond the grace cap (58s) - the doom guard stands)',
    'F1 [F1] bank: chest skip (walk floor preflight: d=120 prices 90s beyond the 40s left - d=120 beyond the grace envelope (45) - the doom guard stands)',
    'F1 [F1] bank: chest skip (walk floor preflight: d=8 prices 34s beyond the 20s left - the grace already rode (one-shot per chain))'
  ])
  assert.equal(walkFloorRow(c), 'the walk floor\'s own preflight: 3 refusal(s) by 2 bot(s) (envelope 1 / grace-cap 1 / grace-rode 1) - d 8..120 avg 57.7, priced 34..90s avg 58.7s vs clock 20..40s avg 30.0s left - deficit 14..50s avg 28.7s - the crater\'s own price - the break law: every farther chest paid zero bytes')
})

test('THE ROW\'S HONEST NULLS: a clean face, a junk fold - nothing renders', () => {
  assert.equal(walkFloorRow(null), null)
  assert.equal(walkFloorRow(undefined), null)
  assert.equal(walkFloorRow(42), null)
  assert.equal(walkFloorRow({ refusals: 0 }), null)
  assert.equal(walkFloorRow({ refusals: 'many' }), null)
})

test('THE ROW\'S UNPARSED HONESTY: a foreign tail names itself, never hides', () => {
  const c = walkFloorCensus([
    'F1 chest skip (walk floor preflight: d=10 prices 35s beyond the 30s left - some future grace byte the book never met)'
  ])
  assert.equal(c.refusals, 1)
  assert.equal(c.classes.unparsed, 1, 'the unknown tail rides its own class')
  const row = walkFloorRow(c)
  assert.ok(row.includes('UNPARSED 1'), 'the row names the unparsed class - the book never silently swallows')
})
