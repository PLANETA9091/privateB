// (v0.411.0) THE BANK-FAIL LENS's tests - the bank lane's own decide/no-path
// ledger. The verbatims are the face-25 log's own shapes (36860108110) plus
// the historical reason classes the emitters name (fleet19.mjs 353/1836/2335/
// 3036). The honest-anchor law: the junk battery rejects the DELIVERED side
// (bankcensus's lane), the doom line (a different emitter) and the tool
// lanes' shapes (the walk-fail lens's).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classifyBankReason, parseBankWalkBack, parseBankZero, bankFailCensus } from '../../src/lib/bankfail.mjs'

test('bank walk-back: the face-25 verbatims parse bot, why and the abort distance', () => {
  const a = parseBankWalkBack('F9 bank: chest unreachable (Took to long to decide path to goal!) (7 blocks from yard) - walking back')
  assert.equal(a.bot, 'F9')
  assert.equal(a.why, 'chest-unreachable-decide-timeout')
  assert.equal(a.dist, 7)

  const b = parseBankWalkBack('F12 bank: chest unreachable (Took to long to decide path to goal!) (30 blocks from yard) - walking back')
  assert.equal(b.dist, 30)

  const c = parseBankWalkBack('F10 bank: no chest in range (12 blocks from yard) - walking back')
  assert.equal(c.why, 'no-chest')
  assert.equal(c.dist, 12)
})

test('bank zero: the three arms read mid/pre/final with nested reasons unwrapped', () => {
  const a = parseBankZero('F6 bank: 0 (chest unreachable (Took to long to decide path to goal!))')
  assert.equal(a.arm, 'mid')
  assert.equal(a.why, 'chest-unreachable-decide-timeout')

  const b = parseBankZero('F6 pre-position bank: 0 (chest unreachable (Took to long to decide path to goal!))')
  assert.equal(b.arm, 'pre')
  assert.equal(b.why, 'chest-unreachable-decide-timeout')

  const c = parseBankZero('F6 final bank: 0 (chest unreachable (No path to the goal!))')
  assert.equal(c.arm, 'final')
  assert.equal(c.why, 'chest-unreachable-no-path')

  const d = parseBankZero('F9 bank: 0 (chest unreachable (budget exhausted (walk floor)))')
  assert.equal(d.why, 'chest-unreachable-budget-floor')

  const e = parseBankZero('F3 final bank: 0 (budget exhausted)')
  assert.equal(e.why, 'budget')

  const f = parseBankZero('F2 bank: 0 (still underground after 2 climb attempts - the chain from the shaft bottom is doomed walks)')
  assert.equal(f.why, 'underground')

  const g = parseBankZero('F4 bank: 0 (nothing to deposit)')
  assert.equal(g.why, 'nothing')
})

test('bank reason: the classifier names the trip buckets and junk reads unknown', () => {
  assert.equal(classifyBankReason('no chest in range').why, 'no-chest')
  assert.equal(classifyBankReason('chest unreachable (walk to chest: timeout after 528ms)').why, 'chest-unreachable-walk-timeout')
  assert.equal(classifyBankReason('chest unreachable (something odd)').why, 'chest-unreachable-other')
  assert.equal(classifyBankReason('water rescue in progress').why, 'water-rescue')
  assert.equal(classifyBankReason('some unheard prose').why, 'other')
  assert.equal(classifyBankReason(null).why, 'unknown')
  assert.equal(classifyBankReason(9).why, 'unknown')
})

test('census: the face-25 mixed stream accumulates walk-backs, zeros, dists and the decide total', () => {
  const lines = [
    'F9 bank: chest unreachable (Took to long to decide path to goal!) (7 blocks from yard) - walking back',
    'F6 bank: chest unreachable (Took to long to decide path to goal!) (8 blocks from yard) - walking back',
    'F12 bank: chest unreachable (Took to long to decide path to goal!) (30 blocks from yard) - walking back',
    'F6 pre-position bank: 0 (chest unreachable (Took to long to decide path to goal!))',
    'F6 final bank: 0 (chest unreachable (Took to long to decide path to goal!))',
    'F9 bank: 0 (budget exhausted)',
    'F10 bank: 0 (nothing to deposit)',
    'F9 final bank: +234', // the DELIVERED side - not this lens's line
    'F15 [F15] hop: chest at [-113,72,398] d=10 zero: chest unreachable (Took to long to decide path to goal!)', // the hop lane - hopcensus's
    'F16 fuel commons: chest walk failed after the nudge (No path to the goal!)', // the tool lane - walkfail's
    'F5 sweep: 0 collected - busy x2' // the sweep lane - walkfail's
  ]
  const c = bankFailCensus(lines)
  assert.equal(c.walkBack.total, 3)
  assert.equal(c.walkBack.byWhy['chest-unreachable-decide-timeout'], 3)
  assert.equal(c.walkBack.byBot.F6, 1)
  assert.equal(c.walkBack.byBot.F12, 1)
  assert.equal(c.walkBack.dists.n, 3)
  assert.equal(c.walkBack.dists.max, 30)
  assert.equal(c.walkBack.dists.sum, 45)

  assert.equal(c.zeros.total, 4)
  assert.equal(c.zeros.byArm.pre, 1)
  assert.equal(c.zeros.byArm.final, 1)
  assert.equal(c.zeros.byArm.mid, 2)
  assert.equal(c.zeros.byWhy['chest-unreachable-decide-timeout'], 2)
  assert.equal(c.zeros.byWhy.budget, 1)

  assert.equal(c.decideTotal, 5) // 3 walk-backs + 2 zeros
})

test('census: the junk battery rejects the delivered side, the doom line and the other lanes', () => {
  const c = bankFailCensus([
    'F9 final bank: +234', // delivered - bankcensus's
    'F9 bank: +11', // delivered mid-run
    'F8 bank: frozen physics - the walk ladder cannot climb, the pocket rides the next window', // the doom emitter
    'F2 bank: yard walk arrived in 9s (1 attempt)', // the progress line
    'F4 bank: end-bank budget spent - smelt skipped', // the budget prose
    'bank: 0 (no bot tag)', // untagged - the fleet always tags
    42,
    null,
    undefined,
    { line: 'F1 bank: 0 (budget exhausted)' }
  ])
  assert.equal(c.walkBack.total, 0)
  assert.equal(c.zeros.total, 0)
  assert.equal(c.decideTotal, 0)
})

test('census: the honest zero and the honest empty anatomy', () => {
  const c = bankFailCensus(['F1 [F1] heartbeat alive', 'no lines of ours here'])
  assert.equal(c.walkBack.total, 0)
  assert.equal(c.zeros.total, 0)
  assert.deepEqual(c.walkBack.dists, { n: 0, max: 0, sum: 0 })
  assert.equal(c.decideTotal, 0)
  const e = bankFailCensus('not an array')
  assert.equal(e.decideTotal, 0)
  assert.deepEqual(e.zeros.byArm, {})
})
