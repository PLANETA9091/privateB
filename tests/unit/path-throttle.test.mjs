// (v0.17.4) createPathThrottle - the anti-starvation concurrency cap.
// All scheduling is driven with microtasks/deferred promises: deterministic,
// no timers, no flakiness.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createPathThrottle } from '../../src/lib/pathsemaphore.mjs'

const deferred = () => {
  let resolve
  const gate = new Promise(r => { resolve = r })
  return { gate, open: resolve }
}

test('respects the concurrency cap', async () => {
  const t = createPathThrottle({ maxConcurrent: 3 })
  const gates = Array.from({ length: 6 }, deferred)
  const results = gates.map(g => t.run(() => g.gate))
  await new Promise(r => setImmediate(r))
  assert.equal(t.stats().active, 3, 'only 3 searches run at once')
  assert.equal(t.stats().queued, 3, 'the rest wait in FIFO order')
  gates.forEach(g => g.open())
  await Promise.all(results)
  assert.equal(t.stats().active, 0)
})

test('queue drains FIFO and every caller gets its own result', async () => {
  const t = createPathThrottle({ maxConcurrent: 2 })
  const order = []
  const jobs = Array.from({ length: 5 }, (_, i) => t.run(async () => {
    order.push(i)
    return i * 10
  }))
  const values = await Promise.all(jobs)
  assert.deepEqual(values, [0, 10, 20, 30, 40])
  assert.equal(order.length, 5)
  assert.equal(t.stats().active, 0)
})

test('overflow rejects without killing the queue', async () => {
  const t = createPathThrottle({ maxConcurrent: 1, queueCap: 2 })
  const gate = deferred()
  const running = t.run(() => gate.gate)
  const q1 = t.run(() => 'q1')
  const q2 = t.run(() => 'q2')
  await assert.rejects(t.run(() => 'overflow'), /queue full/)
  assert.equal(t.stats().rejected, 1)
  gate.open()
  assert.equal(await running, undefined)
  assert.equal(await q1, 'q1')
  assert.equal(await q2, 'q2')
})

test('a throwing search rejects its own caller and frees the slot', async () => {
  const t = createPathThrottle({ maxConcurrent: 1 })
  await assert.rejects(t.run(() => { throw new Error('boom') }), /boom/)
  assert.equal(t.stats().active, 0, 'the slot must be released')
  assert.equal(await t.run(() => 'next'), 'next', 'the next search starts after a throw')
})

test('sync and async search bodies both work', async () => {
  const t = createPathThrottle({ maxConcurrent: 2 })
  assert.equal(await t.run(() => 42), 42)
  assert.equal(await t.run(async () => 'slow'), 'slow')
})

test('bad options fall back to safe defaults', async () => {
  const t = createPathThrottle({ maxConcurrent: 0, queueCap: -5 })
  const gate = deferred()
  const first = t.run(() => gate.gate)
  await new Promise(r => setImmediate(r))
  assert.equal(t.stats().max, 6, 'maxConcurrent=0 -> default 6')
  assert.equal(t.stats().active, 1)
  gate.open()
  await first
})

// (v0.21.0) Priority inside the queue: a bank walk must not sit behind a dozen
// next-column walks when the fleet saturates the throttle (fleet v0.19.2:
// path=6a/10q at final-bank time, banked=0 with 927 blocks in pockets).
test('a higher-priority caller jumps the saturated queue', async () => {
  const t = createPathThrottle({ maxConcurrent: 1 })
  const order = []
  const gate = deferred()
  const running = t.run(async () => { order.push('running'); await gate.gate })
  await new Promise(r => setImmediate(r))

  const low1 = t.run(async () => { order.push('low1') }, { priority: 0 })
  const low2 = t.run(async () => { order.push('low2') }, { priority: 0 })
  const bank = t.run(async () => { order.push('bank') }, { priority: 2 })
  assert.equal(t.stats().queued, 3, 'all three wait in line')

  gate.open()
  await Promise.all([running, low1, low2, bank])
  assert.deepEqual(order, ['running', 'bank', 'low1', 'low2'], 'the bank walk dequeues FIRST, the normals keep FIFO among themselves')
})

test('priority is per-call: default callers keep plain FIFO (backwards compatible)', async () => {
  const t = createPathThrottle({ maxConcurrent: 1 })
  const gate = deferred()
  const order = []
  const running = t.run(async () => { order.push('first'); await gate.gate })
  await new Promise(r => setImmediate(r))
  const a = t.run(async () => { order.push('a') })
  const b = t.run(async () => { order.push('b') })
  gate.open()
  await Promise.all([running, a, b])
  assert.deepEqual(order, ['first', 'a', 'b'], 'no priority passed -> today\'s FIFO behavior, byte for byte')
})

test('bad priority values fall back to the normal class', async () => {
  const t = createPathThrottle({ maxConcurrent: 1 })
  const gate = deferred()
  const order = []
  const running = t.run(async () => { order.push('run'); await gate.gate })
  await new Promise(r => setImmediate(r))
  const normal = t.run(async () => { order.push('normal') }, { priority: 0 })
  const weird = t.run(async () => { order.push('weird') }, { priority: -3 })
  const nan = t.run(async () => { order.push('nan') }, { priority: NaN })
  gate.open()
  await Promise.all([running, normal, weird, nan])
  assert.deepEqual(order, ['run', 'normal', 'weird', 'nan'], 'negative/NaN priority must not outrank the normal class')
})
