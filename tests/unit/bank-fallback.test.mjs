// (v0.16.4) bankFallback - the deposit-failure decision table. Pure arithmetic:
// every branch is exact, no server, no bot, no timing.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bankFallback } from '../../src/lib/deposit.mjs'

test('a successful deposit is always done', () => {
  assert.equal(bankFallback({ deposited: 12, reason: 'ok', yardDist: 10 }).action, 'done')
  assert.equal(bankFallback({ deposited: 1, reason: 'chest unreachable', yardDist: null }).action, 'done')
})

test('non-range reasons never trigger a walk (the old silent zero)', () => {
  for (const reason of ['chest unreachable (timeout)', 'cannot open chest (x)', 'nothing to deposit', '', undefined]) {
    const d = bankFallback({ deposited: 0, reason, yardDist: 50 })
    assert.equal(d.action, 'none', `reason=${JSON.stringify(reason)}`)
    assert.ok(d.why, 'a none-decision must carry its why to the log')
  }
})

test('no chest in range with a known close yard -> walk', () => {
  const d = bankFallback({ deposited: 0, reason: 'no chest in range', yardDist: 217.4 })
  assert.equal(d.action, 'walk')
  assert.equal(d.dist, 217)
})

test('no chest in range but no yard known -> none with a why', () => {
  for (const yardDist of [null, undefined, NaN]) {
    const d = bankFallback({ deposited: 0, reason: 'no chest in range', yardDist })
    assert.equal(d.action, 'none')
    assert.match(d.why, /yard/i)
  }
})

test('yard beyond the walk cap -> none (a lost bot must not burn the deadline)', () => {
  const d = bankFallback({ deposited: 0, reason: 'no chest in range', yardDist: 401 })
  assert.equal(d.action, 'none')
  assert.match(d.why, /401 blocks/)
  // exactly at the cap is still too far (>= comparison): the walk would take the
  // whole timeout, only strictly-inside distances go
  assert.equal(bankFallback({ deposited: 0, reason: 'no chest in range', yardDist: 400 }).action, 'none')
  assert.equal(bankFallback({ deposited: 0, reason: 'no chest in range', yardDist: 399.6 }).action, 'walk')
})

test('case-insensitive reason match (the message lives in another module)', () => {
  assert.equal(bankFallback({ deposited: 0, reason: 'NO CHEST IN RANGE', yardDist: 30 }).action, 'walk')
  assert.equal(bankFallback({ deposited: 0, reason: 'No Chest in Range', yardDist: 30 }).action, 'walk')
})
