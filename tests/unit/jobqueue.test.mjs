// MiningJobQueue + withTimeout: the anti-stall core of the fleet.
// These tests encode the exact failure modes from README "Known problem":
// a job that never finishes must be fenced by a timeout, unreachable targets
// must not be attempted, and failed positions must be blacklisted.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MiningJobQueue, withTimeout, inBox } from '../../src/lib/jobqueue.mjs'

const sleep = ms => new Promise(r => setTimeout(r, ms))
const P = (x, y, z) => ({ x, y, z })

test('withTimeout resolves a fast operation and clears its timer', async () => {
  const t0 = Date.now()
  const v = await withTimeout(sleep(20).then(() => 'ok'), 5000, 'fast')
  assert.equal(v, 'ok')
  assert.ok(Date.now() - t0 < 4000)
})

test('withTimeout rejects a slow operation instead of hanging forever', async () => {
  await assert.rejects(
    withTimeout(sleep(500).then(() => 'late'), 30, 'slow-op'),
    /slow-op: timeout after 30ms/
  )
})

test('inBox', () => {
  const box = { min: P(0, 0, 0), max: P(10, 20, 10) }
  assert.ok(inBox(P(5, 10, 5), box))
  assert.ok(!inBox(P(11, 10, 5), box))
  assert.ok(!inBox(P(5, 10, 5), null))
})

test('queue executes only jobs the reachability test accepts', async () => {
  const executed = []
  const q = new MiningJobQueue({
    canReach: async job => job.pos.x < 10, // only x<10 reachable
    execute: async job => { executed.push(job.pos) },
    timeoutMs: 1000
  })
  q.addMany([P(1, 64, 1), P(50, 64, 50), P(2, 64, 2), P(60, 64, 60)])
  await q.run()
  assert.deepEqual(executed, [P(1, 64, 1), P(2, 64, 2)])
  assert.equal(q.stats.done, 2)
})

test('a job whose execute() never resolves is fenced by the timeout', async () => {
  const q = new MiningJobQueue({
    canReach: async () => true,
    execute: async () => new Promise(() => {}), // the collect() hang from the README
    timeoutMs: 30,
    blacklistMs: 50,
    maxAttempts: 1,
    maxConsecutiveFails: 5
  })
  q.add(P(1, 64, 1))
  const t0 = Date.now()
  await q.run()
  assert.ok(Date.now() - t0 < 2000, 'run() must not hang')
  assert.equal(q.stats.timeout, 1)
  assert.equal(q.stats.done, 0)
})

test('failed positions are blacklisted and skipped on the next pass', async () => {
  let failFirst = true
  const executed = []
  const q = new MiningJobQueue({
    canReach: async () => true,
    execute: async job => {
      executed.push(job.pos)
      if (failFirst && job.pos.x === 1) throw new Error('boom')
      return true
    },
    timeoutMs: 1000,
    blacklistMs: 60000,
    maxAttempts: 1
  })
  q.add(P(1, 64, 1))
  q.add(P(2, 64, 2))
  failFirst = true
  await q.run()
  assert.equal(q.stats.failed, 1)
  assert.equal(q.stats.blacklisted, 1)
  // second run: x=1 is blacklisted now, so only x=2 executes
  const before = executed.length
  q.add(P(1, 64, 1))
  q.add(P(2, 64, 2))
  failFirst = false
  await q.run()
  // x=1 never executed again (blacklisted), x=2 was already done but a fresh queue
  // does not know that - it runs again; the key assertion is that x=1 stays excluded
  assert.ok(!executed.slice(before).some(p => p.x === 1 && p.y === 64))
})

test('blacklist expires after blacklistMs', async () => {
  const q = new MiningJobQueue({ timeoutMs: 100, blacklistMs: 20 })
  q.blacklist(P(1, 1, 1), 20)
  assert.ok(q.isBlacklisted(P(1, 1, 1)))
  await sleep(30)
  assert.ok(!q.isBlacklisted(P(1, 1, 1)))
})

test('run() honors shouldStop', async () => {
  const executed = []
  const q = new MiningJobQueue({
    canReach: async () => true,
    execute: async job => { await sleep(25); executed.push(job.pos) },
    timeoutMs: 1000
  })
  q.addMany([P(1, 1, 1), P(2, 2, 2), P(3, 3, 3)])
  let stop = false
  setTimeout(() => { stop = true }, 30)
  await q.run({ shouldStop: () => stop })
  assert.ok(executed.length < 3, `expected an early stop, executed ${executed.length}`)
})

test('run() gives up after maxConsecutiveFails instead of burning the whole queue', async () => {
  const q = new MiningJobQueue({
    canReach: async () => true,
    execute: async () => { throw new Error('nope') },
    timeoutMs: 1000,
    maxAttempts: 1,
    maxConsecutiveFails: 3
  })
  q.addMany([P(1, 1, 1), P(2, 2, 2), P(3, 3, 3), P(4, 4, 4), P(5, 5, 5)])
  await q.run()
  assert.equal(q.stats.failed, 3)
})

test('execute() returning false counts as a failure', async () => {
  const q = new MiningJobQueue({
    canReach: async () => true,
    execute: async () => false,
    timeoutMs: 1000,
    maxAttempts: 1
  })
  q.add(P(1, 1, 1))
  await q.run()
  assert.equal(q.stats.done, 0)
  assert.equal(q.stats.failed, 1)
})

test('duplicates are not queued twice', () => {
  const q = new MiningJobQueue({ timeoutMs: 100 })
  assert.ok(q.add(P(1, 2, 3)))
  assert.ok(!q.add(P(1, 2, 3)))
  assert.equal(q.size, 1)
})

test('canReach throwing is treated as unreachable, not fatal', async () => {
  const executed = []
  const q = new MiningJobQueue({
    canReach: async () => { throw new Error('pathfinder exploded') },
    execute: async job => { executed.push(job.pos) },
    timeoutMs: 1000
  })
  q.add(P(1, 1, 1))
  await q.run()
  assert.equal(executed.length, 0)
  assert.equal(q.stats.done, 0)
})

test('blacklist map is pruned when it grows large', async () => {
  const q = new MiningJobQueue({
    canReach: async () => true,
    execute: async () => true,
    timeoutMs: 100,
    blacklistMs: 5
  })
  for (let i = 0; i < 1200; i++) q.blacklist(P(i, 0, 0), 1) // all expire in 1ms
  await sleep(15)
  q.add(P(1, 1, 1)) // one job so the run loop (and its prune branch) executes
  await q.run()
  assert.ok(q.blacklistMap.size < 1200, `prune did not shrink the map: ${q.blacklistMap.size}`)
})
