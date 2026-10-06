import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { whaleWaterBill } from '../../src/lib/whalewater.mjs'

// Face 31's live shapes verbatim (run 37452538949) - the whale's return.
// F10 spent 92 launches across 5 targets (38 at [-143,405], 26 at
// [-140,413], 23 at [-143,399], 3 at [-141,402], 2 at [-161,393]),
// paid 8 stalls with EVERY paired gain 0.0, rode 0 brakes - the face's
// second whale after the 24th's F12 - and the SAME bot owns the face's
// TOP rescue-start seat (13 starts, F8's 9 the next, 5 spenders total).
const face31 = () => {
  const lines = []
  const launches = (bot, key, d, n) => {
    for (let i = 0; i < n; i++) lines.push(`${bot} [${bot}] water: transit toward known land (oak_log) at ${key} d=${d}`)
  }
  // the top target: 38 launches at d=4, 8 stalls paired at the same d
  // (every gain 0.0 - the face's own read)
  for (let i = 0; i < 38; i++) {
    lines.push('F10 [F10] water: transit toward known land (oak_log) at [-143,405] d=4')
    if (i < 8) lines.push('F10 [F10] water: transit stalled (d=4 after ' + (15 + i) + ' passes - the walls own this swim; the release takes over)')
  }
  launches('F10', '[-140,413]', 6, 26)
  launches('F10', '[-143,399]', 9, 23)
  launches('F10', '[-141,402]', 12, 3)
  launches('F10', '[-161,393]', 20, 2)
  // the rescue table verbatim: 13/9/4/3/1 across 5 spenders
  const starts = [['F10', 13, 13], ['F8', 9, 13], ['F9', 4, 14], ['F19', 3, 14], ['F18', 1, 12]]
  for (const [bot, n, o2] of starts) {
    for (let i = 0; i < n; i++) lines.push(`${bot} [${bot}] water: drowning rescue start (drowning, oxygen ${o2})`)
  }
  return lines
}

test('the 31st byte-exact: the whale rides the face\'s TOP rescue seat', () => {
  const r = whaleWaterBill(face31())
  assert.ok(r, 'the face reads')
  assert.equal(r.table.length, 5)
  assert.deepEqual(r.table, [['F10', 13], ['F8', 9], ['F9', 4], ['F19', 3], ['F18', 1]])
  assert.ok(r.whale, 'the whale verdict fires')
  assert.equal(r.whale.bot, 'F10')
  assert.equal(r.whale.launches, 92)
  assert.equal(r.whale.targets, 5)
  assert.deepEqual(r.whale.topTarget, { key: '[-143,405]', n: 38 })
  assert.equal(r.whale.stalls, 8)
  assert.equal(r.whale.brakes, 0)
  assert.deepEqual(r.whale.gains, { n: 8, min: 0, max: 0, sum: 0 })
  assert.deepEqual(r.bill, { bot: 'F10', launches: 92, starts: 13, rank: 1, spenders: 5 })
})

test('the dry whale: the zero-gain loop that never called the rescue reads rank null', () => {
  const lines = []
  for (let i = 0; i < 55; i++) lines.push('F7 [F7] water: transit toward known land (oak_log) at [-130,400] d=5')
  lines.push('F7 [F7] water: transit stalled (d=5 after 15 passes - the walls own this swim; the release takes over)')
  const r = whaleWaterBill(lines)
  assert.ok(r && r.whale, 'the whale verdict fires (55 launches, gain 0)')
  assert.ok(r.bill, 'the bill exists')
  assert.equal(r.bill.starts, 0)
  assert.equal(r.bill.rank, null, 'the dry whale is never faked to a rank')
  assert.equal(r.bill.spenders, 0)
})

test('no whale, no bill - the silence law inherits, the spenders stay data', () => {
  const lines = [
    'F3 [F3] water: transit toward known land (oak_log) at [-130,400] d=5',
    'F3 [F3] water: transit toward known land (oak_log) at [-130,400] d=5',
    'F3 [F3] water: drowning rescue start (drowning, oxygen 13)',
    'F5 [F5] water: drowning rescue start (drowning, oxygen 12)'
  ]
  const r = whaleWaterBill(lines)
  assert.ok(r, 'the face reads')
  assert.equal(r.whale, null)
  assert.equal(r.bill, null, 'no whale, no bill')
  assert.deepEqual(r.table, [['F3', 1], ['F5', 1]])
})

test('junk-safe null on non-input', () => {
  assert.equal(whaleWaterBill(null), null)
  assert.equal(whaleWaterBill(undefined), null)
  assert.equal(whaleWaterBill(42), null)
})

test('WIRING: decompose rides the whale\'s water bill beside the loop ledger', () => {
  const src = fs.readFileSync(new URL('../../scripts/fleet-mining/decompose.mjs', import.meta.url), 'utf8')
  assert.match(src, /import \{ whaleWaterBill \} from '\.\.\/\.\.\/src\/lib\/whalewater\.mjs'/)
  assert.match(src, /whaleWaterBill\(lines\)/)
  assert.match(src, /the whale's water bill \(v0\.698\.0\)/)
})
