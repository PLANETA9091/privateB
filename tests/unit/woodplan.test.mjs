// Tests for the wood-gathering policy in src/lib/woodplan.mjs.
// The v0.6.9 Big Fleet wasted bots two ways: a bot holding 7/8 logs idled ~110s
// hunting the last log of an eaten-out forest (the kit needs only 3 logs), and
// 7 bots with logs=0 dug dirt bare-handed for the whole run because nothing ever
// retried their failed bootstrap. The stall-escape decision is pinned here; the
// re-bootstrap loop lives in testbed/fleet19.mjs and is exercised by the CI fleet.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { stalledButCraftable, recoveryDue } from '../../src/lib/woodplan.mjs'

test('stall escape: below goodEnough logs the bot keeps gathering (never crafts a kit from 3 logs)', () => {
  assert.equal(stalledButCraftable({ logs: 0, goodEnough: 4, msSinceGain: 999999, stallMs: 25000 }), false)
  assert.equal(stalledButCraftable({ logs: 3, goodEnough: 4, msSinceGain: 999999, stallMs: 25000 }), false)
})

test('stall escape: enough logs AND stalled -> stop gathering and go craft', () => {
  assert.equal(stalledButCraftable({ logs: 7, goodEnough: 4, msSinceGain: 26000, stallMs: 25000 }), true)
  assert.equal(stalledButCraftable({ logs: 4, goodEnough: 4, msSinceGain: 30000, stallMs: 25000 }), true)
})

test('stall escape: enough logs but progress is fresh -> keep going', () => {
  assert.equal(stalledButCraftable({ logs: 7, goodEnough: 4, msSinceGain: 0, stallMs: 25000 }), false)
  assert.equal(stalledButCraftable({ logs: 7, goodEnough: 4, msSinceGain: 24999, stallMs: 25000 }), false)
})

test('stall escape: boundary equality fires (>= semantics on both checks)', () => {
  assert.equal(stalledButCraftable({ logs: 4, goodEnough: 4, msSinceGain: 25000, stallMs: 25000 }), true)
})

test('stall escape: goodEnough null disables the escape entirely (exact old behaviour)', () => {
  assert.equal(stalledButCraftable({ logs: 8, goodEnough: null, msSinceGain: 999999, stallMs: 25000 }), false)
})

test('stall escape: non-finite inputs are defensive-false (never a crash in the hot loop)', () => {
  assert.equal(stalledButCraftable({ logs: NaN, goodEnough: 4, msSinceGain: 999999, stallMs: 25000 }), false)
  assert.equal(stalledButCraftable({ logs: 7, goodEnough: 4, msSinceGain: NaN, stallMs: 25000 }), false)
  assert.equal(stalledButCraftable({ logs: undefined, goodEnough: 4, msSinceGain: 999999, stallMs: 25000 }), false)
})

test('gatherWood loop accounting: lastGain resets exactly when the log count rises', () => {
  // Mirrors the loop bookkeeping in miner.mjs gatherWood: a chop that produces logs
  // must reset the stall clock, otherwise bots would quit mid-forest.
  let logs = 0
  let lastGain = 1000
  let prevLogs = logs
  const chop = (newLogs, now) => { logs = newLogs; if (logs > prevLogs) { lastGain = now; prevLogs = logs } }
  const stalled = now => stalledButCraftable({ logs: prevLogs, goodEnough: 4, msSinceGain: now - lastGain, stallMs: 25000 })

  chop(7, 2000) // one trunk eaten: 7 logs
  assert.equal(stalled(26000), false, 'fresh progress 24s ago - keep hunting')
  assert.equal(stalled(27001), true, 'stalled >25s with 7 logs - escape fires')
  chop(8, 27002) // the 8th log lands exactly then
  assert.equal(stalled(51000), false, 'the gain reset the clock - escape must not fire')
})

test('recoveryDue: no pickaxe + cooldown elapsed + enough runway -> recover', () => {
  assert.equal(recoveryDue({ hasPick: false, msSinceLast: 46000, remainingMs: 120000 }), true)
})

test('recoveryDue: a bot holding a pickaxe never needs recovery', () => {
  assert.equal(recoveryDue({ hasPick: true, msSinceLast: 999999, remainingMs: 120000 }), false)
})

test('recoveryDue: cooldown not yet elapsed -> keep digging', () => {
  assert.equal(recoveryDue({ hasPick: false, msSinceLast: 45000, remainingMs: 120000 }), false, 'boundary: <= cooldown')
  assert.equal(recoveryDue({ hasPick: false, msSinceLast: 1000, remainingMs: 120000 }), false)
})

test('recoveryDue: too close to the deadline -> never start a ~85s bootstrap', () => {
  assert.equal(recoveryDue({ hasPick: false, msSinceLast: 46000, remainingMs: 80000 }), false, 'boundary: <= minRemaining')
  assert.equal(recoveryDue({ hasPick: false, msSinceLast: 46000, remainingMs: 10000 }), false)
})

test('recoveryDue: the v0.7.0 failure mode is now covered (due mid-shaft, 135s left)', () => {
  // v0.7.0: the initial bootstrap burned ~115s, the first between-shaft check ran at
  // ~65s remaining and the guard blocked it -> recovered=0 forever. Mid-shaft checks
  // with the same clock now fire while there is still runway.
  assert.equal(recoveryDue({ hasPick: false, msSinceLast: 160000, remainingMs: 135000 }), true)
})

// NOTE (v0.9.1): woodplan.upgradeDue was removed - the fleet's mid-run upgrade path
// went through toolupgrade.mjs upgradeCheck (testbed/fleet19.mjs upgradeDueNow) since
// v0.7.5, and the old predicate had no production caller left. The tier logic it
// described lives on in tests/unit/toolupgrade.test.mjs.
