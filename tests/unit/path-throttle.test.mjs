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
