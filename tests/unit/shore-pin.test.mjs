// (v0.377.0) THE SHORE-PIN BREAK pins - the pin reads the RESCUE, not the bearing.
// Face 36792489622's F1 walked NINE blocks along a shore wall (x -133 -> -142)
// with r pinned at 1-2 the whole way: the shore bearing points ALONG the wall,
// the patrol rotates the bearing every pass, and the v0.367.0 dirPlan's
// per-bearing key reset on every rotation - the 15-pass patience never filled,
// the release starved below (0 probes), and the budget died 'still wet' with
// the tail dry (F14 25.2s, F17 26.2s). The cure: the first sight's radius and
// a dry-pass counter that never resets - at the shore (r <= 2) or making no
// margin progress for SHORE_PIN_PASSES, the swim yields to the release, the
// same one-flag-one-policy the v0.367.0 latch owns.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { shorePinned, SHORE_PIN_PASSES, SHORE_PIN_RADIUS, TRANSIT_STALL_MARGIN, transitStalled } from '../../src/lib/drowning.mjs'

const minerSrc = readFileSync(new URL('../../src/bots/miner.mjs', import.meta.url), 'utf8')
const ledgerSrc = readFileSync(new URL('../../src/lib/rescue-ledger.mjs', import.meta.url), 'utf8')

test('shorePinned: the F1 moving-bob shape (the radius arm)', () => {
  // the patrol closed to the shore early, then bobbed: r 1-2 forever
  assert.equal(shorePinned({ d0: 1, d: 1, passes: SHORE_PIN_PASSES }), true,
    'at the shore for the full patience - the shoreline owns this swim')
  assert.equal(shorePinned({ d0: 1, d: 1.4, passes: SHORE_PIN_PASSES }), true,
    'the r=1-2 oscillation is pinned (the fractional reads count)')
  assert.equal(shorePinned({ d0: 5, d: 1, passes: SHORE_PIN_PASSES }), true,
    'closed early, pinned since - the counter reads the rescue, the approach passes count too')
})

test('shorePinned: the never-closed shape (the no-arm arm)', () => {
  assert.equal(shorePinned({ d0: 7, d: 7, passes: SHORE_PIN_PASSES }), true,
    'zero closing for the patience - the walls own this swim (seven passes before the v0.367.0 latch)')
  assert.equal(shorePinned({ d0: 5, d: 4.5, passes: SHORE_PIN_PASSES }), true,
    'half a block in eight passes is not progress')
})

test('shorePinned: the healthy deep swim never arms', () => {
  assert.equal(shorePinned({ d0: 5, d: 3, passes: SHORE_PIN_PASSES }), false,
    'closing exactly the margin is progress (the transitStalled law)')
  assert.equal(shorePinned({ d0: 6, d: 3.5, passes: SHORE_PIN_PASSES }), false,
    'closing more than the margin keeps the swim')
  assert.equal(shorePinned({ d0: 5, d: 3, passes: 30 }), false,
    'a closing swim NEVER arms - patience cannot fix geometry')
})

test('shorePinned: patience first', () => {
  for (const p of [0, 1, SHORE_PIN_PASSES - 1]) {
    assert.equal(shorePinned({ d0: 1, d: 1, passes: p }), false,
      `patience ${p}: a short bob keeps the swim`)
  }
})

test('shorePinned: the junk battery', () => {
  assert.equal(shorePinned({ d0: 1, d: null, passes: 99 }), false)
  assert.equal(shorePinned({ d0: 1, d: undefined, passes: 99 }), false)
  assert.equal(shorePinned({ d0: 1, d: NaN, passes: 99 }), false)
  assert.equal(shorePinned({ d0: 1, d: 'abc', passes: 99 }), false,
    'a non-numeric radius is a wiring sickness, not a shore (the Number() discipline: only NaN/null are junk)')
  assert.equal(shorePinned({ d0: 1, d: 1, passes: NaN }), false)
  assert.equal(shorePinned({ d0: 1, d: 1, passes: 'abc' }), false,
    'a non-numeric counter is junk (the Number() discipline: NaN never condemns)')
  assert.equal(shorePinned({ d0: 1, d: 1, passes: -4 }), false)
  assert.equal(shorePinned({ d0: 1, d: 1, passes: 99, maxPasses: NaN }), true,
    'junk patience falls back to the DEFAULT (the transitStalled config discipline - junk config never widens the condemnation)')
  assert.equal(shorePinned({ d0: NaN, d: 5, passes: 99 }), false,
    'junk d0 blinds the no-arm arm only (r=5 is outside the radius)')
  assert.equal(shorePinned({ d0: null, d: 5, passes: 99 }), false)
})

test('shorePinned: junk d0 never blinds the pinned arm', () => {
  assert.equal(shorePinned({ d0: null, d: 1, passes: SHORE_PIN_PASSES }), true,
    'being at the shore condemns without d0 - the radius arm never needs the first sight')
  assert.equal(shorePinned({ d0: NaN, d: 2, passes: SHORE_PIN_PASSES }), true,
    'r exactly at the radius counts (the <= is the shore contact)')
})

test('shorePinned: the constants ride the transitStalled doctrine', () => {
  assert.equal(SHORE_PIN_PASSES, 8)
  assert.equal(SHORE_PIN_RADIUS, 2)
  assert.equal(shorePinned({ d0: 5, d: 5 - TRANSIT_STALL_MARGIN, passes: SHORE_PIN_PASSES }), false,
    'the margin is the SHARED margin - one progress doctrine, two latches')
  assert.equal(transitStalled({ d0: 1, d: 1, passes: 15 }), true,
    'the v0.367.0 latch keeps its own patience - the pin layers UNDER it, never instead of it')
})

test('shore-pin wiring: the pin gates on the SAME rescue-wide flag', () => {
  assert.ok(minerSrc.includes('let shorePin = null'),
    'the pin tracker is rescue-scoped (declared beside the latches)')
  const pinStart = minerSrc.indexOf('if (shorePinned({')
  assert.ok(pinStart > 0, 'the pin gate exists')
  const pinBlock = minerSrc.slice(pinStart, minerSrc.indexOf('if (dir && !transitStalledFlag) {', pinStart))
  assert.ok(pinBlock.includes('transitStalledFlag = true'),
    'the pin sets the SAME flag the latches set - one flag, one policy')
  assert.ok(pinBlock.includes('shorePin.logged = true'),
    'the line speaks once per rescue (the logged latch guards the call)')
})

test('shore-pin wiring: the line rides the water filter key and names the takeover', () => {
  const lineIdx = minerSrc.indexOf('shore pinned (r=')
  assert.ok(lineIdx > 0, 'the pin names itself')
  const lineEnd = minerSrc.indexOf('\n', lineIdx)
  const logCall = minerSrc.slice(minerSrc.lastIndexOf('log(', lineIdx), lineEnd)
  assert.ok(logCall.includes('water:'),
    'the line rides the existing water filter key - no new filter wiring')
  assert.ok(logCall.includes('the release takes over'),
    'the line names the takeover (the latch doctrine)')
})

test('shore-pin wiring: the pin reads the rescue, the counter never resets', () => {
  assert.equal(minerSrc.split('if (!shorePin) shorePin = {').length - 1, 1,
    'the tracker is captured ONCE per rescue (a re-capture would be the per-bearing reset again)')
  assert.equal(minerSrc.split('shorePin.passes++').length - 1, 1,
    'one counter, incremented every dry dir pass')
  const pinIdx = minerSrc.indexOf('if (!shorePin) shorePin = {')
  const dirPlanIdx = minerSrc.indexOf('if (!dirPlan || dirPlan.key !== dkey)')
  assert.ok(pinIdx > 0 && dirPlanIdx > pinIdx,
    'the pin check precedes the per-bearing plan - the rotation resets the plan, never the pin')
})

test('shore-pin wiring: the v0.367.0 latch rides byte-identical below the pin', () => {
  assert.ok(minerSrc.includes('if (dir && !transitStalledFlag) {'),
    'the dir branch gate survives (the shore-yield wiring pin)')
  assert.ok(minerSrc.includes('shore transit stalled (r='),
    'the v0.367.0 yield line survives')
  assert.ok(minerSrc.includes('await settle(8)'),
    'the healthy path keeps the settle(8) swim byte for byte')
})

test('shore-pin wiring: the ledger counts the pin (the mid-event row)', () => {
  assert.ok(ledgerSrc.includes("{ key: 'shorePin', re: /water: shore pinned/ }"),
    'the pin rides the mid-event ledger beside the stalls')
})
