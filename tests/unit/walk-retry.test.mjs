// walkRetryPlan (v0.19.0) - the retry policy for the fleet's long walks.
// MEASURED (fleet on v0.18.15, 600s): 25 yard walks / 0 arrivals, banked=0
// with 3298 blocks in pockets. Two retryable classes: the water-rescue
// interlock refusal (a live rescue still had >20s of window) and the
// 'Path was stopped' settle-poisoning transient. A real walk timeout is NOT
// freely retryable (real distance/budget): once, then give up.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { walkRetryPlan } from '../../src/lib/jobqueue.mjs'

test('water-rescue refusal -> wait-rescue with the rescue-window budget', () => {
  const plan = walkRetryPlan({ error: new Error('water rescue in progress (walk to yard refused)'), attempt: 1 })
  assert.equal(plan.action, 'wait-rescue')
  assert.ok(Number.isFinite(plan.waitMs) && plan.waitMs > 20000, `waitMs covers the 25s rescue window, got ${plan.waitMs}`)
})

test('Path was stopped -> immediate re-issue', () => {
  const plan = walkRetryPlan({ error: new Error('Path was stopped before it could be completed! Thus, the desired goal was not reached.'), attempt: 1 })
  assert.equal(plan.action, 'immediate')
})

test('walk timeout retries exactly once, then gives up', () => {
  const first = walkRetryPlan({ error: new Error('walk to yard: timeout after 120000ms'), attempt: 1 })
  assert.equal(first.action, 'timeout-retry')
  const second = walkRetryPlan({ error: new Error('walk to yard: timeout after 120000ms'), attempt: 2 })
  assert.equal(second.action, 'give-up')
})

test('attempt budget stops the loop - no endless rescue waits', () => {
  const plan = walkRetryPlan({ error: new Error('water rescue in progress (walk to yard refused)'), attempt: 3, maxAttempts: 3 })
  assert.equal(plan.action, 'give-up')
})

test('unknown errors give up (no blind retries)', () => {
  const plan = walkRetryPlan({ error: new Error('NoPath: goal unreachable'), attempt: 1 })
  assert.equal(plan.action, 'give-up')
})

test('missing error gives up defensively', () => {
  assert.equal(walkRetryPlan({}).action, 'give-up')
  assert.equal(walkRetryPlan({ error: null, attempt: 1 }).action, 'give-up')
})

test('string errors are tolerated (some rejections are not Error instances)', () => {
  const plan = walkRetryPlan({ error: 'Path was stopped before it could be completed!', attempt: 1 })
  assert.equal(plan.action, 'immediate')
})
