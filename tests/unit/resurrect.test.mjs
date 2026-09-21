// The SERVER RESURRECTION (v0.56.0) - policy pins + the guard's revive() bridge.
//
// The run49/run51 evidence chain: a dead JVM used to mean an honest exit 14
// (v0.52.0) - correct, but wasteful when the death was infra (the world dir
// survives a reboot, the bots' backoff already re-enters a returned server).
// The policy must say WHY on every quit, grant exactly one boot per run, and
// demand real runway; the guard must re-arm cleanly after a successful reboot
// (a fresh boot is a NEW server - the old losses are stale evidence).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resurrectPlan, RESURRECT_MAX, RESURRECT_FLOOR_MS } from '../../src/lib/resurrect.mjs'
import { createServerGuard } from '../../src/lib/serverguard.mjs'

const FLOOR = RESURRECT_FLOOR_MS // 180000

test('mid-run death with runway and budget: restart', () => {
  const plan = resurrectPlan({ remainingMs: 300000, restartsUsed: 0 })
  assert.equal(plan.action, 'restart')
  assert.equal(plan.remainingMs, 300000)
  assert.equal(plan.maxRestarts, RESURRECT_MAX)
})

test('second death: no restarts left - the honest funeral stands', () => {
  const plan = resurrectPlan({ remainingMs: 300000, restartsUsed: 1 })
  assert.equal(plan.action, 'quit')
  assert.match(plan.why, /no restarts left/)
  assert.match(plan.why, /flapping/)
})

test('late death: the runway is shorter than the boot floor', () => {
  const plan = resurrectPlan({ remainingMs: FLOOR - 1000, restartsUsed: 0 })
  assert.equal(plan.action, 'quit')
  assert.match(plan.why, /runway/)
  // the exact boundary: the floor itself IS enough
  assert.equal(resurrectPlan({ remainingMs: FLOOR, restartsUsed: 0 }).action, 'restart')
})

test('junk runway never acts - a junk clock must not boot-loop the run', () => {
  for (const junk of [undefined, null, NaN, Infinity, -1, 0, '600000']) {
    const plan = resurrectPlan({ remainingMs: junk, restartsUsed: 0 })
    assert.equal(plan.action, 'quit', `remainingMs=${String(junk)} must quit`)
    assert.match(plan.why, /runway/)
  }
})

test('junk restartsUsed reads as none spent; negative never grants extra boots', () => {
  assert.equal(resurrectPlan({ remainingMs: 300000, restartsUsed: undefined }).action, 'restart')
  assert.equal(resurrectPlan({ remainingMs: 300000, restartsUsed: null }).action, 'restart')
  assert.equal(resurrectPlan({ remainingMs: 300000, restartsUsed: -3 }).action, 'restart', 'negative junk reads as 0, not as a hidden budget')
  assert.equal(resurrectPlan({ remainingMs: 300000, restartsUsed: '1' }).action, 'quit', 'numeric strings coerce - 1 spent means none left')
})

test('maxRestarts override: a 0 budget disables the feature entirely', () => {
  const plan = resurrectPlan({ remainingMs: 300000, restartsUsed: 0, maxRestarts: 0 })
  assert.equal(plan.action, 'quit')
  assert.match(plan.why, /no restarts left/)
})

test('revive(): the guard re-arms after a successful reboot - a fresh boot is a NEW server', () => {
  let t = 0
  const guard = createServerGuard({ total: 19, now: () => t })
  for (let i = 0; i < 12; i++) { t += 1000; guard.recordLoss() }
  t += 1000
  guard.recordProbe('refused') // the JVM is gone -> DEAD
  assert.equal(guard.dead, true)
  guard.revive('jvm restart')
  assert.equal(guard.dead, false, 'the rebooted JVM is not the dead one')
  assert.equal(guard.suspect, false)
  assert.equal(guard.lossesInWindow, 0, 'the old losses proved the OLD process dead - stale evidence')
})

test('revive(): history survives on purpose; a second death still fires', () => {
  let t = 0
  const guard = createServerGuard({ total: 4, now: () => t })
  for (let i = 0; i < 3; i++) { t += 1000; guard.recordLoss() }
  t += 1000
  guard.recordProbe('refused')
  assert.equal(guard.dead, true)
  assert.equal(guard.totalLosses, 3)
  guard.revive('jvm restart')
  assert.equal(guard.totalLosses, 3, 'the report tells the whole story including the death')
  assert.equal(guard.revives, 1)
  // the new JVM dies too: fresh burst -> fresh verdict (the runner's budget
  // bounds HOW MANY times this can loop, not the guard)
  for (let i = 0; i < 3; i++) { t += 1000; guard.recordLoss() }
  assert.equal(guard.suspect, true, 'a fresh burst re-arms SUSPECT against the new JVM')
  t += 1000
  guard.recordProbe('refused')
  assert.equal(guard.dead, true, 'the second death is a verdict again')
  assert.equal(guard.revives, 1, 'revive only counts real reboots')
})

test('revive(): relogins still clear a fresh SUSPECT (the normal wave path is intact)', () => {
  let t = 0
  const guard = createServerGuard({ total: 19, now: () => t })
  for (let i = 0; i < 12; i++) { t += 1000; guard.recordLoss() }
  guard.recordProbe('refused')
  guard.revive('jvm restart')
  t += 5000
  guard.recordRelogin()
  assert.equal(guard.revives, 1)
  // and a burst after the relogin is judged on its own evidence
  for (let i = 0; i < 12; i++) { t += 1000; guard.recordLoss() }
  assert.equal(guard.suspect, true)
})
