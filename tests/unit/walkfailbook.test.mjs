// (v0.601.0) THE WALKFAIL BOOK tests - the fuel commons walkfail class' msg
// ledger. Anchors byte-exact from the faces: the spike face 37180720652
// (15x took-to-decide + 3x no-path + 1x nudge-retry) and the fire-1200 face
// (the walkfail seed lines).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  WALKFAIL_SHARE, parseWalkFailBook,
  walkFailBookCensus, walkFailBookRow, WALKFAIL_BOOK_TORN_RE
} from '../../src/lib/walkfailbook.mjs'

const TOOK = 'F2 fuel commons: chest walk failed after the nudge (Took to long to decide path to goal!)'
const NOPATH = 'F7 fuel commons: chest walk failed after the nudge (No path to the goal!)'
const RETRY = 'F1 fuel commons: chest walk failed after the nudge (iron commune walk @-12,7 (nudge retry))'

test('the three face msgs parse byte-exact (the nested paren rides whole)', () => {
  const t = parseWalkFailBook(TOOK)
  assert.equal(t.bot, 'F2')
  assert.equal(t.msg, 'Took to long to decide path to goal!')
  const n = parseWalkFailBook(NOPATH)
  assert.equal(n.msg, 'No path to the goal!')
  const r = parseWalkFailBook(RETRY)
  assert.equal(r.bot, 'F1')
  assert.equal(r.msg, 'iron commune walk @-12,7 (nudge retry)')
})

test('the junk battery never claims the sibling families', () => {
  const junk = [
    'F14 fuel commons: chest holds no fuel',
    'F14 [F14] fuel commons: chest at [1,64,1] the yard stands 30 levels up over 1 lateral - the walk ladder cannot climb',
    'F5 fuel commons: budget spent (0/1 units)',
    'F5 fuel commons: the ask defers (this stance came up dry 90s ago - hold)',
    'F9 bank: chest unreachable (Took to long to decide path to goal!) (12 blocks from yard) - walking back',
    'F5 chest walk failed after the nudge no parens',
    'smelt fuel commons grain: asked 4, delivered 0, dry 4'
  ]
  for (const j of junk) assert.equal(parseWalkFailBook(j), null, `claimed junk: ${j}`)
})

test('the census sums the spike face (the additive law)', () => {
  const lines = [TOOK, TOOK, NOPATH, RETRY, 'F5 heartbeat: alive']
  const c = walkFailBookCensus(lines)
  assert.equal(c.n, 4)
  assert.equal(c.botCount, 3)
  assert.equal(c.byMsg['Took to long to decide path to goal!'], 2)
  assert.equal(c.byMsg['No path to the goal!'], 1)
  assert.equal(c.byMsg['iron commune walk @-12,7 (nudge retry)'], 1)
  assert.equal(c.unparsed, 0)
})

test('the torn sweep rides unparsed (the honest law)', () => {
  assert.ok(WALKFAIL_BOOK_TORN_RE.test('F2 fuel commons: chest walk failed after the nudge (Took to long'))
  const c = walkFailBookCensus(['F2 fuel commons: chest walk failed after the nudge (Took to long', TOOK])
  assert.equal(c.unparsed, 1)
  assert.equal(c.n, 1)
})

test('the none form is a verdict (the always-print law)', () => {
  assert.equal(walkFailBookRow(walkFailBookCensus([])), 'walkfail book: none (no ask walk failed this run)')
})

test('the boundary pins: the decision clock and the net split the fronts', () => {
  // took-to-decide owns the half -> the decision clock
  const clock = walkFailBookCensus([TOOK, TOOK, NOPATH, RETRY])
  assert.ok(walkFailBookRow(clock).includes('the decision clock is the front'))
  // no-path owns the half -> the net
  const net = walkFailBookCensus([NOPATH, NOPATH, TOOK, RETRY])
  assert.ok(walkFailBookRow(net).includes('the net itself is the front'))
  // under the half -> mixed
  const mixed = walkFailBookCensus([TOOK, NOPATH, RETRY])
  assert.ok(walkFailBookRow(mixed).includes('no msg owns the face'))
  assert.equal(WALKFAIL_SHARE, 0.5)
})

test('THE LIVE FACE SHARES (fleet 37180720652): the decision clock owns the spike', () => {
  // the face's msg census: 15x took-to-decide + 3x no-path + 1x nudge-retry
  // (19 lines); the bots ride synthetic distinct names - the pin is the
  // msg shares and the verdict, the face's bot map rides the next read.
  const lines = [
    ...Array.from({ length: 15 }, (_, i) => TOOK.replace('F2 ', `F${i + 1} `)),
    NOPATH.replace('F7 ', 'F16 '),
    NOPATH.replace('F7 ', 'F17 '),
    NOPATH.replace('F7 ', 'F18 '),
    RETRY
  ]
  const c = walkFailBookCensus(lines)
  assert.equal(c.n, 19)
  assert.equal(c.botCount, 18)
  const row = walkFailBookRow(c)
  assert.equal(row, 'walkfail book: 19 failed walk(s) across 18 bot(s) - top msg "Took to long to decide path to goal!" (79%) - the decision clock is the front')
})
