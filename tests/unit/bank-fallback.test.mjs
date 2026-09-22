// (v0.16.4) bankFallback - the deposit-failure decision table. Pure arithmetic:
// every branch is exact, no server, no bot, no timing.
import { test, beforeEach } from 'node:test'
import { resetDoomedGoalLedger } from '../../src/lib/jobqueue.mjs'
import assert from 'node:assert/strict'
import { bankFallback } from '../../src/lib/deposit.mjs'

// The doomed-goal ledger (v0.72.0) is a module-level singleton in jobqueue.mjs
// (one process = one fleet). A dead verdict recorded by one test's walk must
// not refuse the next test's walks (the mocks reuse chest/furnace positions),
// so every test here starts from an empty ledger.
beforeEach(() => resetDoomedGoalLedger())

test('a successful deposit is always done', () => {
  assert.equal(bankFallback({ deposited: 12, reason: 'ok', yardDist: 10 }).action, 'done')
  assert.equal(bankFallback({ deposited: 1, reason: 'chest unreachable', yardDist: null }).action, 'done')
})

// (v0.38.0) CONTRACT CHANGE - the reached-chain zeros walk. The v0.16.4 table
// walked ONLY on 'no chest in range' and the caller hid the rest, which stranded
// F2's delivery on a zero that never said why (fleet 35566494961). The yard is
// where the chests are (dispatch 35569034780 verified 50) - a dead nearest chest,
// a dead window or an unknown junk reason all mean GO THERE. The walk is
// budget-clamped and retry-bounded, so the worst case is a bounded walk, not a
// silent stranding.
test('reached-chain zeros walk: dead chest, dead window, junk unknown (v0.38.0)', () => {
  for (const reason of [
    'chest unreachable (No path to the goal!)',
    'chest unreachable (timeout)',
    'cannot open chest (open chest: timeout after 10000ms)',
    '', undefined, 'no chest in range'
  ]) {
    const d = bankFallback({ deposited: 0, reason, yardDist: 50 })
    assert.equal(d.action, 'walk', `reason=${JSON.stringify(reason)}`)
    assert.ok(Number.isFinite(d.dist), 'a walk-decision carries its dist')
  }
})

// (v0.38.0) the two zeros a walk CANNOT fix stay home - but the caller now logs
// every none-verdict, so home no longer means invisible.
test('unfixable-by-walking zeros stay home, named (v0.38.0)', () => {
  for (const reason of ['budget exhausted', 'nothing to deposit']) {
    const d = bankFallback({ deposited: 0, reason, yardDist: 50 })
    assert.equal(d.action, 'none', `reason=${JSON.stringify(reason)}`)
    assert.equal(d.why, reason, 'the none-verdict carries the honest why')
  }
})

test('junk reasons still respect the yard gates (no yard / beyond the cap)', () => {
  for (const reason of ['', 'no chest in range', 'chest unreachable (x)']) {
    const noYard = bankFallback({ deposited: 0, reason, yardDist: null })
    assert.equal(noYard.action, 'none', `yardDist=null reason=${JSON.stringify(reason)}`)
    assert.match(noYard.why, /yard/i)
    const far = bankFallback({ deposited: 0, reason, yardDist: 500 })
    assert.equal(far.action, 'none', `yardDist=500 reason=${JSON.stringify(reason)}`)
    assert.match(far.why, /walk cap/)
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
