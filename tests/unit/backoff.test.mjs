// (v0.16.3) reconnectDelayMs - the anti-herd backoff. All pure arithmetic:
// rand is injected, so every assertion is exact (no flaky timing tests).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { reconnectDelayMs, fleetSpread } from '../../src/lib/backoff.mjs'

test('attempt 0 with neutral rand returns base + phase only', () => {
  // rand=0.5 hits the centre of the jitter band -> exactly the exponential value
  assert.equal(reconnectDelayMs({ attempt: 0, index: 0, rand: () => 0.5 }), 2000)
  assert.equal(reconnectDelayMs({ attempt: 1, index: 0, rand: () => 0.5 }), 4000)
  assert.equal(reconnectDelayMs({ attempt: 3, index: 0, rand: () => 0.5 }), 16000)
})

test('grows exponentially with consecutive failures and caps at capMs', () => {
  for (let n = 0; n <= 4; n++) {
    const d = reconnectDelayMs({ attempt: n, index: 0, rand: () => 0.5 })
    assert.equal(d, Math.min(30000, 2000 * 2 ** n), `attempt=${n}`)
  }
  // beyond the cap it stays at the cap (phase 0 bot)
  assert.equal(reconnectDelayMs({ attempt: 9, index: 0, rand: () => 0.5 }), 30000)
})

test('jitter stays inside the +/- band around the exponential value', () => {
  const center = 8000 // attempt 2
  for (let i = 0; i < 500; i++) {
    const d = reconnectDelayMs({ attempt: 2, index: 0, rand: Math.random })
    assert.ok(d >= center - 2000 && d <= center + 2000, `delay ${d} outside [6000,10000]`)
  }
})

test('per-bot phases are distinct and spread across the phase window', () => {
  // 19 bots, attempt 0, neutral rand: golden-ratio phases must not collide
  const spread = fleetSpread({ attempt: 0, count: 19 })
  assert.equal(spread.length, 19)
  assert.equal(new Set(spread).size, 19, 'phase collision: two bots share a delay')
  // the window must actually cover seconds, not collapse into a few ms
  const min = Math.min(...spread)
  const max = Math.max(...spread)
  assert.ok(max - min >= 3000, `spread too narrow: ${min}..${max}`)
})

test('floor and ceiling hold for every sampled delay', () => {
  for (let attempt = 0; attempt < 12; attempt++) {
    for (let index = 0; index < 25; index++) {
      const d = reconnectDelayMs({ attempt, index, rand: Math.random })
      assert.ok(d >= 750, `delay ${d} below floor`)
      assert.ok(d <= 34000, `delay ${d} above cap+phase`)
    }
  }
})

test('bad inputs fall back to safe defaults instead of NaN/Infinity', () => {
  assert.equal(reconnectDelayMs({ attempt: NaN, rand: () => 0.5 }), 2000)
  assert.equal(reconnectDelayMs({ attempt: -5, rand: () => 0.5 }), 2000)
  assert.equal(reconnectDelayMs({ attempt: 1.9, rand: () => 0.5 }), 4000) // floors to 1
  assert.equal(reconnectDelayMs({ baseMs: -1, rand: () => 0.5 }), 2000)
  assert.equal(reconnectDelayMs({ jitter: 5, rand: () => 0.5 }), 2000) // clamped to 1 -> still centre
  assert.equal(reconnectDelayMs({ rand: 'not a function' }), 2000) // falls back to Math.random path
})

test('zero phase span gives identical delays for all bots (degenerate but safe)', () => {
  const spread = fleetSpread({ attempt: 0, count: 19, phaseSpanMs: 0 })
  assert.equal(new Set(spread).size, 1, 'without phase all neutral bots must match')
})

test('storm math: herd of 19 reconnects over a window, never all at once', () => {
  // worst case from fleet #122: every bot fails 3 times in a row. The OLD code
  // woke all 19 after exactly 3000 ms; the new delays must cover a much wider
  // window so the server digests one login at a time.
  const spread = fleetSpread({ attempt: 2, count: 19 })
  const min = Math.min(...spread)
  const max = Math.max(...spread)
  assert.ok(max - min >= 3500, `storm window too narrow: ${min}..${max}`)
  // and no single bot waits longer than cap + phase
  assert.ok(max <= 34000)
})
