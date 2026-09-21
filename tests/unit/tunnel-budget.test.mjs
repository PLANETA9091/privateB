import { test } from 'node:test'
import assert from 'node:assert/strict'
import { tunnelStopReason, TUNNEL_MAX_MS, TUNNEL_DIGLESS_LIMIT } from '../../src/lib/surface.mjs'

// (v0.35.0) The tunnel wall-clock budget: fleet dispatch 35562867668 measured F2
// inside ONE tunnel call for 390 s with ONE block dug - two skeletons reset the
// stall counter by shoving, so `stalls < 4` never fired, and the bank-trip gate
// after the tunnel call in the fleet loop starved for the rest of the run.
// The stop decision is extracted here so the regression is pinned as a matrix:
// whatever harasses the bot, elapsed wall clock and dig-less iterations END the call.

test('tunnelStopReason: the healthy exit (done) is null - never reported as a failure', () => {
  assert.equal(tunnelStopReason({ done: 12, maxBlocks: 12, stalls: 0, diglessIters: 0, elapsedMs: 5000 }), null)
  // done wins over every accounting limit: a finished tunnel is not 'stalled'
  assert.equal(tunnelStopReason({ done: 12, maxBlocks: 12, stalls: 99, diglessIters: 99, elapsedMs: TUNNEL_MAX_MS * 10 }), null)
})

test('tunnelStopReason: the measured regression - moving but never digging dies on the budget, not on stalls', () => {
  // F2's shape: shoved every second (stalls reset to 0), 390 s elapsed, 1 block
  assert.equal(tunnelStopReason({ done: 1, maxBlocks: 12, stalls: 0, diglessIters: 3, elapsedMs: 390000 }), 'budget')
  // the same shape inside the budget but past the dig-less limit ends too - the
  // wall clock is the backstop, the dig-less counter is the fast exit
  assert.equal(tunnelStopReason({ done: 0, maxBlocks: 12, stalls: 0, diglessIters: TUNNEL_DIGLESS_LIMIT, elapsedMs: 15000 }), 'digless')
})

test('tunnelStopReason: budget bounds and junk inputs stay safe', () => {
  assert.equal(tunnelStopReason({ done: 0, elapsedMs: TUNNEL_MAX_MS - 1 }), null)
  assert.equal(tunnelStopReason({ done: 0, elapsedMs: TUNNEL_MAX_MS }), 'budget')
  // junk maxMs / diglessLimit fall back to the exported constants, never to 0/Infinity traps
  assert.equal(tunnelStopReason({ done: 0, elapsedMs: 1000, maxMs: 0 }), null)
  assert.equal(tunnelStopReason({ done: 0, elapsedMs: TUNNEL_MAX_MS, maxMs: null }), 'budget')
  assert.equal(tunnelStopReason({ done: 0, elapsedMs: 1000, diglessIters: TUNNEL_DIGLESS_LIMIT, diglessLimit: -3 }), 'digless')
  assert.equal(tunnelStopReason({ done: 0, elapsedMs: 1000, stalls: 4, stallLimit: null }), 'stalled')
})

test('tunnelStopReason: stalls still end a stationary tunnel (the old contract)', () => {
  assert.equal(tunnelStopReason({ done: 0, maxBlocks: 12, stalls: 4, diglessIters: 1, elapsedMs: 5000 }), 'stalled')
  assert.equal(tunnelStopReason({ done: 0, maxBlocks: 12, stalls: 3, diglessIters: 1, elapsedMs: 5000 }), null)
})

test('tunnelStopReason: external stop and a dead bot win over all accounting', () => {
  assert.equal(tunnelStopReason({ done: 0, elapsedMs: 1, stopRequested: true }), 'shouldStop')
  assert.equal(tunnelStopReason({ done: 0, elapsedMs: 1, alive: false }), 'no entity')
  // even past the budget, shouldStop is the reported reason (it fired first in the loop order)
  assert.equal(tunnelStopReason({ done: 0, elapsedMs: 999999, stopRequested: true }), 'shouldStop')
})

test('tunnelStopReason: check order - budget before digless before stalls', () => {
  // all three exhausted at once: the budget is the reported reason (it is the
  // strongest claim about WHAT harassed the bot)
  assert.equal(
    tunnelStopReason({ done: 0, stalls: 9, diglessIters: 99, elapsedMs: TUNNEL_MAX_MS + 1 }),
    'budget'
  )
  assert.equal(
    tunnelStopReason({ done: 0, stalls: 9, diglessIters: 99, elapsedMs: TUNNEL_MAX_MS - 1 }),
    'digless'
  )
})

test('constants: the budget is generous for a healthy 12-block tunnel but far under the measured 390 s', () => {
  assert.ok(TUNNEL_MAX_MS >= 30000 && TUNNEL_MAX_MS <= 120000, `TUNNEL_MAX_MS=${TUNNEL_MAX_MS} outside the sane band`)
  assert.ok(TUNNEL_DIGLESS_LIMIT >= 4 && TUNNEL_DIGLESS_LIMIT <= 20, `TUNNEL_DIGLESS_LIMIT=${TUNNEL_DIGLESS_LIMIT} outside the sane band`)
  assert.ok(TUNNEL_MAX_MS < 390000 - 60000, 'the budget must be far below the measured 390 s hole')
})
