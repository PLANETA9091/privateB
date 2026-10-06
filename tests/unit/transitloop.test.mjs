import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { transitLoopLedger, LOOP_WHALE_LAUNCHES } from '../../src/lib/transitloop.mjs'

// Face 24's live shapes verbatim (run 37421661533) - the whale's own
// face. F12 spent 152 launches across 4 targets (86 at [-151,399], 38
// at [-150,414], 27 at [-121,406], 1 at [-117,405]), paid 13 stalls,
// ate 10 brakes, and every paired stall gained 0.0 ground - while the
// cadence row read d 6..3 closed 50% ('the repeats earned their keep').
// The ledger closes the loop: the swims bought nothing, the progress
// rode the re-arms.
const face24 = () => {
  const lines = []
  // the top target: 86 launches, the approach's own descent d 6..3
  // (the cadence row's 50% closed) - each stall re-launches at the
  // same d it stalled at (the re-arm's honest echo)
  for (let i = 0; i < 86; i++) {
    const d = i < 2 ? 6 : 3 // the face's read: d 6..3
    lines.push(`F12 [F12] water: transit toward known land (oak_log) at [-151,399] d=${d}`)
    if (i < 13) lines.push(`F12 [F12] water: transit stalled (d=${d} after ${15 + i} passes - the walls own this swim; the release takes over)`)
    if (i < 10) lines.push(`F12 [F12] water: same-target re-arm braked (oak_log at [-151,399] stalled ${i}s ago - the next proxy or the release owns this swim)`)
  }
  // the two pinned seats (the walls class - d flat) + the tail's one
  for (let i = 0; i < 38; i++) lines.push(`F12 [F12] water: transit toward known land (birch_log) at [-150,414] d=13`)
  for (let i = 0; i < 27; i++) lines.push(`F12 [F12] water: transit toward known land (gravel) at [-121,406] d=32`)
  lines.push('F12 [F12] water: transit toward known land (oak_log) at [-117,405] d=9')
  // the field's small spenders (the 24th's F2 x2, F18 x2)
  lines.push('F2 [F2] water: transit toward known land (oak_log) at [-132,400] d=8')
  lines.push('F2 [F2] water: transit toward known land (oak_log) at [-132,400] d=7')
  lines.push('F18 [F18] water: transit toward known land (oak_log) at [-90,378] d=5')
  lines.push('F18 [F18] water: transit toward known land (oak_log) at [-90,378] d=5')
  return lines
}

test('transitLoopLedger reads face 24 byte-exact: F12 spent 152 launches, paid 13 stalls, ate 10 brakes, gained 0.0 - THE WHALE', () => {
  const r = transitLoopLedger(face24())
  assert.equal(r.bots.length, 3) // F12, F2, F18 - every launcher gets a row
  const w = r.whale
  assert.ok(w, 'the whale verdict exists on the 24th')
  assert.equal(w.bot, 'F12')
  assert.equal(w.launches, 152)
  assert.equal(w.targets, 4)
  assert.deepEqual(w.topTarget, { key: '[-151,399]', n: 86 })
  assert.equal(w.stalls, 13)
  assert.equal(w.brakes, 10)
  assert.deepEqual(w.gains, { n: 13, min: 0, max: 0, sum: 0 })
  assert.equal(w.whale, true)
  // the rows sort by launches desc, ties by bot asc: the whale heads the
  // ledger, the field's small spenders ride behind (F18 < F2 lexically)
  assert.equal(r.bots[0].bot, 'F12')
  assert.equal(r.bots[1].bot, 'F18')
  assert.equal(r.bots[2].bot, 'F2')
})

test('transitLoopLedger anatomy split: the small spender stays data, the unpaired stall never fakes a gain', () => {
  const lines = [
    // F2's small loop: 2 launches, 1 stall paired (gain 8-8=0), 1 unpaired
    'F2 [F2] water: transit toward known land (oak_log) at [-132,400] d=8',
    'F2 [F2] water: transit stalled (d=8 after 9 passes - the walls own this swim; the release takes over)',
    'F2 [F2] water: transit toward known land (oak_log) at [-132,400] d=7',
    // F5's stall with NO prior launch: evidence, never a fake gain
    'F5 [F5] water: transit stalled (d=4 after 12 passes - the walls own this swim; the release takes over)',
    // F5's brake with no launches: the row exists, the count honest
    'F5 [F5] water: same-target re-arm braked (oak_log at [-143,430] stalled 32s ago - the next proxy or the release owns this swim)'
  ]
  const r = transitLoopLedger(lines)
  assert.equal(r.bots.length, 2)
  const f2 = r.bots.find(b => b.bot === 'F2')
  assert.deepEqual(f2, {
    bot: 'F2', launches: 2, targets: 1, topTarget: { key: '[-132,400]', n: 2 },
    stalls: 1, brakes: 0, gains: { n: 1, min: 0, max: 0, sum: 0 }, whale: false
  })
  const f5 = r.bots.find(b => b.bot === 'F5')
  assert.equal(f5.launches, 0)
  assert.equal(f5.stalls, 1)
  assert.equal(f5.brakes, 1)
  assert.equal(f5.gains, null) // the unpaired stall never joins the gains
  assert.equal(r.whale, null) // 2 and 0 launches - below the bar, no verdict
})

test('transitLoopLedger honest fork: the busy loop with POSITIVE gains is never the whale', () => {
  const lines = []
  // 60 launches (past the bar) whose stalls each gained ground
  // (launch d 10 -> stall d 4: +6 every swim) - the loop WORKED
  for (let i = 0; i < 60; i++) {
    lines.push(`F7 [F7] water: transit toward known land (gravel) at [-78,375] d=10`)
    lines.push(`F7 [F7] water: transit stalled (d=4 after 6 passes - the walls own this swim; the release takes over)`)
  }
  const r = transitLoopLedger(lines)
  const f7 = r.bots[0]
  assert.equal(f7.launches, LOOP_WHALE_LAUNCHES + 10)
  assert.deepEqual(f7.gains, { n: 60, min: 6, max: 6, sum: 360 })
  assert.equal(f7.whale, false)
  assert.equal(r.whale, null) // the honest fork: zero-YIELD is the verdict, busy is not
})

test('transitLoopLedger junk battery: null on non-input, the empty shape on silence, the shore lane stays out', () => {
  assert.equal(transitLoopLedger(null), null)
  assert.equal(transitLoopLedger(undefined), null)
  assert.equal(transitLoopLedger(42), null)
  // the launch-free face: the honest empty shape
  assert.deepEqual(transitLoopLedger([]), { bots: [], whale: null })
  // junk lines are dropped, never invented into rows
  const junk = transitLoopLedger([
    'garbage line',
    'F1 [F1] water: shore transit stalled (r=5)', // the shore lane: the rescue ledger's byte
    'F1 [F1] water: no map land within 64 (proxies oak_log=12)', // the map-miss byte
    42, null
  ])
  assert.deepEqual(junk, { bots: [], whale: null })
  // a raw text blob rides too (the array-or-blob law)
  const blob = transitLoopLedger('F3 [F3] water: transit toward known land (sand) at [-40,350] d=12\nF3 [F3] water: transit stalled (d=12 after 20 passes - the walls own this swim; the release takes over)')
  assert.equal(blob.bots.length, 1)
  assert.deepEqual(blob.bots[0].gains, { n: 1, min: 0, max: 0, sum: 0 })
  assert.equal(blob.whale, null) // 1 launch - below the bar
})

test('WIRING: the decompose prints the loop ledger row', () => {
  const src = fs.readFileSync(new URL('../../scripts/fleet-mining/decompose.mjs', import.meta.url), 'utf8')
  assert.match(src, /loop ledger \(v0\.692\.0\): \$\{w\.bot\} spent \$\{w\.launches\} launch/, "the whale's account prints beside the transit block")
  assert.match(src, /THE WHALE'S LEDGER: the loop bought no ground/, 'the verdict rides the row')
})
