// The integration lane's own alloc valve: the wiring pins (v0.631.0).
//
// CI 37219683279 (the v0.629.0 tree) took the integration lane's first OOM:
// the smelt bot died to a zombie-night kite storm, the job queue retried its
// no-path digs, and the heap rode the documented run92 class to 4.0 GB -
// Ineffective mark-compacts, 'tests/integration/smelting.test.mjs' FAILED,
// an environment flake dressed as a pipeline failure. The SAME sha's fleet
// flight passed, because testbed/fleet19.mjs feeds the gotoSafe funnel's
// singleton valve via startFleetValveTicker and the integration tests never
// did - the valve could not refuse a single walk it could not sample. The
// run93 lesson is structural: a PRIVATE valve instance (bare startAllocValve)
// feeds nothing the funnel consults; only the ticker feeding the SINGLETON
// protects the walks. These pins read the CALL SITES - the dead-wire class
// (the pure family passes, the field wiring omits the call) is only
// catchable at the source.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const smeltSrc = readFileSync(new URL('../../tests/integration/smelting.test.mjs', import.meta.url), 'utf8')
const prodSrc = readFileSync(new URL('../../tests/integration/productivity.test.mjs', import.meta.url), 'utf8')

test('REGRESSION PIN: the smelt lane starts the fleet valve ticker BEFORE its bot spawns', () => {
  assert.ok(smeltSrc.includes("import { withTimeout, gotoSafe, startFleetValveTicker } from '../../src/lib/jobqueue.mjs'"),
    'the ticker arrives on the static jobqueue import (a dynamic import after the spawn would leave the early walks unguarded)')
  const callAt = smeltSrc.indexOf('startFleetValveTicker({ onLine: line => log(line) })')
  assert.ok(callAt > 0, 'the ticker is called exactly in the pinned form (the onLine rides the test log - a silent close is a blind lane)')
  const spawnAt = smeltSrc.indexOf("createMiner({ host: HOST, port: PORT, username: 'SmeltTest'")
  assert.ok(spawnAt > 0, 'the smelt spawn call site is present (the pin reads a real file, not a refactored ghost)')
  assert.ok(callAt < spawnAt, 'the valve samples BEFORE the bot exists (every walk the bot ever takes must be guarded)')
})

test('REGRESSION PIN: the productivity lane starts the fleet valve ticker BEFORE its fleet spawns', () => {
  assert.ok(prodSrc.includes("const { gotoSafe, startFleetValveTicker } = await import(path.join(root, 'src', 'lib', 'jobqueue.mjs'))"),
    'the ticker arrives on the jobqueue dynamic import this lane already rides')
  const callAt = prodSrc.indexOf('startFleetValveTicker({ onLine: line => log(line) })')
  assert.ok(callAt > 0, 'the ticker is called exactly in the pinned form (the onLine rides the fleet-test log)')
  const spawnAt = prodSrc.indexOf('miners.push(createMiner({')
  assert.ok(spawnAt > 0, 'the fleet spawn loop is present (the pin reads a real file)')
  assert.ok(callAt < spawnAt, 'the valve samples BEFORE the first bot of the fleet exists (19 walks, one guard, the same law)')
})

test('REGRESSION PIN: the run93 two-instance class is structurally closed in both lanes', () => {
  // run92/run93: startAllocValve's bare form built a PRIVATE instance while the
  // funnel consulted the never-sampled singleton - zero [allocvalve] lines, the
  // OOM class killed the run again. The lanes must NEVER call the bare form.
  for (const [name, src] of [['smelting', smeltSrc], ['productivity', prodSrc]]) {
    assert.ok(!src.includes('startAllocValve('),
      `${name}: no bare startAllocValve call (a private valve feeds nothing the funnel consults - the run93 lesson)`)
    assert.equal(src.split('startFleetValveTicker({ onLine').length - 1, 1,
      `${name}: exactly one ticker call (two tickers would double-sample the singleton and forge the streak)`)
  }
})

test('REGRESSION PIN: the ticker start never holds the integration process open', () => {
  // startAllocValve unref's its own timer - the lanes' t.after ends the log
  // stream and the process must exit without a dangling interval's help. This
  // pin holds the infra side so a future valve refactor that drops the unref
  // fails HERE (the lanes' own budgets, the 390s node:test kill, must never be
  // spent waiting on a timer).
  const valveSrc = readFileSync(new URL('../../src/lib/allocvalve.mjs', import.meta.url), 'utf8')
  assert.ok(valveSrc.includes('timer.unref?.()'),
    "the valve's own ticker interval is unref'd (the lane's exit law lives in the module, the lanes only own the call form)")
})
