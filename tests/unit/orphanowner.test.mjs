// (v0.679.0) THE ORPHAN OWNER - the orphan end's per-bot attribution.
// The verbatim rows below are the 21st flight's own orphans
// (run 37413061352): F3 x4, F8 x1, F19 x3 - the dead-client class.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { orphanOwnerCensus } from '../../src/lib/orphanowner.mjs'

const F3_STANDDOWN = 'ORPHAN END: F3 [F3] water: rescue standing down (frozen physics - the walk gate reopens, the reconnect lane owns a dead client) [blind: 10 passes, 0 shore scans hit, 0 standing probes - no ground truth ever gathered] in 16.4s'
const F3_STANDDOWN_SHORT = 'ORPHAN END: F3 [F3] water: rescue standing down (frozen physics - the walk gate reopens, the reconnect lane owns a dead client) in 6.5s'
const F8_STANDDOWN = 'ORPHAN END: F8 [F8] water: rescue standing down (frozen physics - the walk gate reopens, the reconnect lane owns a dead client) in 19.4s'
const F3_TIMEOUT = 'ORPHAN END: F3 [F3] water: rescue timeout (still wet, 14 passes, 0 probes, tail wet/wet/wet) in 25.2s'
const F19_STANDDOWN = 'ORPHAN END: F19 [F19] water: rescue standing down (frozen physics - the walk gate reopens, the reconnect lane owns a dead client) [blind: 10 passes, 0 shore scans hit, 0 standing probes - no ground truth ever gathered] in 23.5s'
const F19_RELEASED = 'ORPHAN END: F19 [F19] water: rescue released (surface-safe, open water - no land known; the walk gate reopens) in 10.2s'

test('orphan-owner: the 21st flight orphan battery attributes every line', () => {
  const c = orphanOwnerCensus([
    F3_STANDDOWN,   // F3, frozenStanddown
    F8_STANDDOWN,   // F8, frozenStanddown
    F3_STANDDOWN_SHORT, // F3, frozenStanddown
    F3_TIMEOUT,     // F3, timeout
    F3_STANDDOWN_SHORT, // F3, frozenStanddown
    F19_STANDDOWN,  // F19, frozenStanddown
    F19_RELEASED,   // F19, released
    F3_TIMEOUT      // F3, timeout (the log's later repeat)
  ])
  assert.equal(c.total, 8)
  assert.deepEqual(c.owners, { F3: 5, F8: 1, F19: 2 })
  assert.deepEqual(c.byClass, { frozenStanddown: 5, timeout: 2, released: 1 })
  assert.equal(c.unattributed, 0)
})

test('orphan-owner: an untagged but classed line counts in byClass only', () => {
  const c = orphanOwnerCensus([
    'water: rescue timeout (still wet, 9 passes, 1 probes, tail dry/wet/dry) in 12.0s' // no bot tag
  ])
  assert.equal(c.total, 1)
  assert.deepEqual(c.owners, {})
  assert.deepEqual(c.byClass, { timeout: 1 })
  assert.equal(c.unattributed, 0)
})

test('orphan-owner: junk judges nothing - prose, non-strings, empty', () => {
  const c = orphanOwnerCensus([
    'the rescue stood down and the story went nowhere', // no tag, no end class -> unattributed
    null,
    42,
    undefined
  ])
  assert.equal(c.total, 0)
  assert.deepEqual(c.owners, {})
  assert.deepEqual(c.byClass, {})
  assert.equal(c.unattributed, 1) // the prose line; the non-strings are skipped, never counted
})

test('orphan-owner: non-array input returns the zero shape', () => {
  for (const bad of [null, undefined, 'a string', 42]) {
    const c = orphanOwnerCensus(bad)
    assert.deepEqual(c, { total: 0, owners: {}, byClass: {}, unattributed: 0 })
  }
})

test('orphan-owner: the raw ledger shape (no ORPHAN END decoration) attributes too', () => {
  // decompose passes the ledger's orphanEndLines verbatim - the raw log
  // lines carry the bot tag FIRST, no 'ORPHAN END: ' prefix.
  const c = orphanOwnerCensus([
    'F3 [F3] water: rescue standing down (frozen physics - the walk gate reopens, the reconnect lane owns a dead client) [blind: 10 passes, 0 shore scans hit, 0 standing probes - no ground truth ever gathered] in 16.4s',
    'F19 [F19] water: rescue timeout (still wet, 19 passes, 3 probes, tail dry/dry/dry) in 27.0s'
  ])
  assert.equal(c.total, 2)
  assert.deepEqual(c.owners, { F3: 1, F19: 1 })
  assert.deepEqual(c.byClass, { frozenStanddown: 1, timeout: 1 })
})

test('WIRING: the decompose prints the orphan owner row', () => {
  const src = fs.readFileSync(new URL('../../scripts/fleet-mining/decompose.mjs', import.meta.url), 'utf8')
  assert.match(src, /orphan owners: \$\{owners\}/, 'the owner split prints in the ledger block')
  assert.match(src, /the dead-client class names its bot/, 'the row names its class')
})

// (v0.802.0) THE ORPHAN BOOK'S OWN SEAT - WHICH end class owns the
// orphan book (the byClass cell's own majority, zero re-parsing).
import { orphanBookSeat, orphanBookSeatRow, orphanBookRiders, orphanBookRidersRow } from '../../src/lib/orphanowner.mjs'

test('orphan-book seat: the 21st flight cell through the seat law (the bare majority, byte-exact row + the measure-not-owner riders pin)', () => {
  const c = orphanOwnerCensus([
    F3_STANDDOWN, F8_STANDDOWN, F3_STANDDOWN_SHORT, F3_TIMEOUT,
    F3_STANDDOWN_SHORT, F19_STANDDOWN, F19_RELEASED, F3_TIMEOUT
  ])
  assert.deepEqual(c.byClass, { frozenStanddown: 5, timeout: 2, released: 1 })
  const seat = orphanBookSeat(c)
  assert.deepEqual(seat, { cls: 'frozenStanddown', owns: 5, ofOrphans: 8, shareOfOrphans: 0.625 })
  assert.equal(orphanBookSeatRow(seat), 'the orphan book\'s own seat (v0.802.0): frozenStanddown owns 5 of 8 orphan end(s) (62.5%) - THE ORPHAN BOOK\'S OWN SEAT: one end class\'s own ends own the orphan book - the class\'s own front prices the reconnect lane the per-bot split rode unnamed')
  const riders = orphanBookRiders(c)
  assert.deepEqual(riders, { leader: 'frozenStanddown', leaderOwns: 5, runner: 'timeout', runnerOwns: 2, ofOrphans: 8, pairOwns: 7, shareOfOrphans: 0.875, duet: false })
})

test('orphan-book tie law: a tie owns nothing, the byte order pins botGone < timeout', () => {
  const tie = { byClass: { timeout: 2, botGone: 2 } }
  assert.equal(orphanBookSeat(tie), null)
  const r = orphanBookRiders(tie)
  assert.deepEqual(r, { leader: 'botGone', leaderOwns: 2, runner: 'timeout', runnerOwns: 2, ofOrphans: 4, pairOwns: 4, shareOfOrphans: 1, duet: true })
  assert.equal(orphanBookRidersRow(r), 'the orphan book\'s own riders (v0.802.0): no solo class owns the majority - botGone x2 + timeout x2 own 4 of 4 orphan end(s) (100.0%) - THE ORPHAN BOOK\'S OWN MIX: the seat\'s tie law held, the mix is the shape - the classes\' own spread prices the orphan book the solo law refused to seat')
  const belowHalf = { byClass: { timeout: 2, botGone: 1, dead: 1 } }
  assert.equal(orphanBookSeat(belowHalf), null)
  const r2 = orphanBookRiders(belowHalf)
  assert.equal(r2.leader, 'timeout')
  assert.equal(r2.runner, 'botGone')
  assert.equal(r2.pairOwns, 3)
  assert.equal(r2.ofOrphans, 4)
  assert.equal(r2.duet, false)
})

test('orphan-book cells\'-own-sum: the unattributed never ride the book + the junk battery + the row guards', () => {
  // the unattributed are not ends - the book is the byClass cell's own sum
  const c = { total: 6, byClass: { timeout: 1 }, unattributed: 5 }
  const seat = orphanBookSeat(c)
  assert.deepEqual(seat, { cls: 'timeout', owns: 1, ofOrphans: 1, shareOfOrphans: 1 })
  assert.equal(orphanBookSeatRow(seat), 'the orphan book\'s own seat (v0.802.0): timeout owns 1 of 1 orphan end(s) (100.0%) - THE ORPHAN BOOK\'S OWN SEAT: one end class\'s own ends own the orphan book - the class\'s own front prices the reconnect lane the per-bot split rode unnamed')
  for (const junk of [null, undefined, 42, 'a string', {}, { byClass: null }, { byClass: [] }, { byClass: { timeout: -1 } }, { byClass: { timeout: 0 } }, { byClass: { timeout: NaN } }, { byClass: { '': 3 } }]) {
    assert.equal(orphanBookSeat(junk), null, `seat judges nothing on ${JSON.stringify(junk)}`)
    assert.equal(orphanBookRiders(junk), null, `riders judge nothing on ${JSON.stringify(junk)}`)
  }
  // the solo class is the seat's owner case - the riders' own fence
  assert.equal(orphanBookRiders({ byClass: { timeout: 3 } }), null)
  assert.equal(orphanBookSeatRow(null), null)
  assert.equal(orphanBookSeatRow(42), null)
  assert.equal(orphanBookSeatRow({ cls: 'timeout', owns: 0, ofOrphans: 4, shareOfOrphans: 0 }), null)
  assert.equal(orphanBookSeatRow({ cls: 'timeout', owns: 5, ofOrphans: 4, shareOfOrphans: 1.25 }), null)
  assert.equal(orphanBookRidersRow(null), null)
  assert.equal(orphanBookRidersRow({ leader: 'timeout', leaderOwns: 2, runner: 'botGone', runnerOwns: 1, ofOrphans: 4, pairOwns: 5, shareOfOrphans: 1.25 }), null)
})

test('orphan-book WIRING: the decompose branch rides the owners gate (the prose lives only in the lib)', () => {
  const src = fs.readFileSync(new URL('../../scripts/fleet-mining/decompose.mjs', import.meta.url), 'utf8')
  assert.match(src, /import \{ orphanBookSeat, orphanBookSeatRow, orphanBookRiders, orphanBookRidersRow \} from '\.\.\/\.\.\/src\/lib\/orphanowner\.mjs'/, 'the seat rides the lib import')
  assert.match(src, /const obSeat = orphanBookSeat\(oo\)/, 'the branch reads the owner census\'s own cells')
  assert.match(src, /orphanBookRiders\(oo\)/, 'the riders branch reads the same census')
  assert.ok(!src.includes("THE ORPHAN BOOK'S OWN SEAT:"), 'the prose lives only in the lib')
})
