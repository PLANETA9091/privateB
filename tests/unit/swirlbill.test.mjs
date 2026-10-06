import { test } from 'node:test'
import assert from 'node:assert/strict'
import { swirlBill, SWIRL_MIN_INSTANT, SWIRL_SHARE } from '../../src/lib/swirlbill.mjs'

// THE ERA BYTE-EXACT - the 47th (run 37524391418, the hard-kill face on the
// v0.722.0 tree) rode the instant churn: F13 83 drowning-rescue starts with
// 78 closes in 0.0s (the trigger's drowning and the lane's surface-safe in
// the same breath, the liar ladder ratcheting 81 beside it) and the bot DIED
// of drown anyway ('rescue aborted (dead mid-rescue) in 2.3s'). F1's 16
// starts closed 3 instantly - the honest boundary the bars keep out. The
// lines below carry the face's own bytes.

const F13_START = 'F13 [F13] water: drowning rescue start (drowning, oxygen 3)'
const F13_START_NEG = 'F13 [F13] water: drowning rescue start (drowning, oxygen -1)'
const F13_INSTANT = 'F13 [F13] water: rescue complete in 0.0s'
const F13_SLOW = 'F13 [F13] water: rescue complete in 1.9s'
const F1_START = 'F1 [F1] water: drowning rescue start (drowning, oxygen 12)'
const F1_INSTANT = 'F1 [F1] water: rescue complete in 0.0s'
const F1_SLOW = 'F1 [F1] water: rescue complete in 8.6s'

test('the churn rides by its own bytes - the 47th\'s F13 swirl folds with the verdict, F1 stays honestly out', () => {
  // F13's own face counts: 83 starts, 78 instant closes, 1 slow close,
  // plus the standdown/abort tails (they ride other shapes - the bill
  // reads only the start/instant pair)
  const face = [
    ...Array.from({ length: 83 }, (_, i) => (i % 3 === 1 ? F13_START_NEG : F13_START)),
    ...Array(78).fill(F13_INSTANT),
    F13_SLOW,
    // F1's own mix: 16 starts, 3 instant, the rest real swims
    ...Array.from({ length: 16 }, () => F1_START),
    ...Array(3).fill(F1_INSTANT),
    ...Array.from({ length: 5 }, (_, i) => F1_SLOW.replace('8.6', String(3 + i * 4)) ),
    'F13 [F13] water: rescue aborted (dead mid-rescue - the hazard stays at the death spot) [blind: 3 passes, 0 shore scans hit, 0 standing probes - no ground truth ever gathered] in 2.3s'
  ]
  const bill = swirlBill(face)
  assert.equal(bill.starts, 99)
  assert.equal(bill.instant, 81)
  assert.equal(bill.orphan, 0)
  assert.equal(bill.bots.F13.starts, 83)
  assert.equal(bill.bots.F13.instant, 78)
  assert.equal(bill.bots.F1.starts, 16)
  assert.equal(bill.bots.F1.instant, 3)
  // the verdict names the churn's own bot only - F13 78/83 = 94.0%
  assert.equal(bill.verdicts.length, 1)
  assert.equal(bill.verdicts[0].bot, 'F13')
  assert.equal(bill.verdicts[0].instant, 78)
  assert.equal(bill.verdicts[0].of, 83)
  assert.ok(Math.abs(bill.verdicts[0].share - 78 / 83) < 1e-9)
})

test('the pair is per-bot - interleaved starts and closes never cross', () => {
  const face = [
    F13_START, F1_START, F13_INSTANT, F1_INSTANT, F13_START, F13_INSTANT, F1_START, F1_INSTANT
  ]
  const bill = swirlBill(face)
  assert.equal(bill.starts, 4)
  assert.equal(bill.instant, 4)
  assert.equal(bill.orphan, 0)
  assert.equal(bill.bots.F13.starts, 2)
  assert.equal(bill.bots.F13.instant, 2)
  assert.equal(bill.bots.F1.starts, 2)
  assert.equal(bill.bots.F1.instant, 2)
})

test('the close without an open start is the lane\'s own leak - orphan counts, instant never', () => {
  const bill = swirlBill([F13_INSTANT, F13_INSTANT, F1_START, F1_INSTANT, F1_INSTANT])
  assert.equal(bill.instant, 1) // only F1's first close joined its own open start
  assert.equal(bill.orphan, 3) // the two F13 closes plus F1's second close had no open start
  assert.equal(bill.bots.F13.instant, 0)
  assert.equal(bill.bots.F1.instant, 1)
  assert.equal(bill.verdicts.length, 0)
})

test('the bars hold - the concentration law, not a volume', () => {
  // exactly at both bars: 10 instant of 20 starts (share 0.5) -> verdict in
  const atBar = swirlBill([...Array(20).fill(F13_START), ...Array(SWIRL_MIN_INSTANT).fill(F13_INSTANT)])
  assert.equal(atBar.verdicts.length, 1)
  // one under the volume bar: 9 instant of 20 starts -> out
  const underVolume = swirlBill([...Array(20).fill(F13_START), ...Array(9).fill(F13_INSTANT)])
  assert.equal(underVolume.verdicts.length, 0)
  assert.equal(underVolume.instant, 9)
  // under the share bar: 12 instant spread over 30 starts -> out
  const underShare = swirlBill([...Array(30).fill(F13_START), ...Array(12).fill(F13_INSTANT)])
  assert.equal(underShare.verdicts.length, 0)
  assert.ok(12 / 30 < SWIRL_SHARE)
})

test('junk never invents - the honest silences and the blob skin', () => {
  const bill = swirlBill([
    '',
    'F13 fuel anchor scan: the palette read empty x1 - the singular probe rescued the scan (chest at [-126,71,418])',
    'F13 [F13] water: rescue blind live (pass 3, air=10, no ground truth yet - the climb flies on buoyancy alone)',
    'F13 [F13] water: rescue standing down (frozen physics - the walk gate reopens, the reconnect lane owns a dead client) [blind: 10 passes, 0 shore scans hit, 0 standing probes - no ground truth ever gathered] in 6.1s',
    // the blob skin: the start shape embedded behind a prefix must not open
    'x F13 [F13] water: drowning rescue start (drowning, oxygen 3)',
    // the release skin: a close that is not instant stays out of the churn
    'F13 [F13] water: rescue released (surface-safe, open water - no land known; the walk gate reopens) in 7.4s'
  ])
  assert.equal(bill.starts, 0)
  assert.equal(bill.instant, 0)
  assert.equal(bill.orphan, 0)
  assert.deepEqual(bill.verdicts, [])
  // the empty face reads the same silence
  const empty = swirlBill([])
  assert.equal(empty.instant, 0)
  assert.deepEqual(empty.verdicts, [])
  // non-array junk never throws
  const junk = swirlBill(null)
  assert.equal(junk.starts, 0)
})
