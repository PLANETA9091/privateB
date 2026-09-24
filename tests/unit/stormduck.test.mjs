// Tests for THE STORM DUCK (v0.143.0) - the near exemption's ceiling.
//
// MEASURED (fleet leg 35994461858, the v0.142.0 union, mined 2026-09-24):
// the storm probe fired at rss 989M -> 2114M (+225MB/s), the grace held the
// kill at 2882M - and the hard ceiling killed at 3462M anyway, 181s/600s in.
// The valve had been CLOSED since ts=86s (queue-pressure strike 1) and the
// storm STILL ramped: the next-column steering class is a NEAR walk by
// construction (<=24b), so the closed valve's near exemption fed the storm
// forever. The lag-probe feeder never landed either (the heavy class stopped
// the event loop turning). The duck: a live storm verdict (worker cell /
// funnel's own rss arithmetic / the lag probe) shuts EVERY goal for
// STORM_DUCK_MS_DEFAULT and sweeps the in-flight goals once.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Vec3 } from 'vec3'
import {
  gotoSafe, resetWalkGovernors, resetDoomedGoalLedger, allocValveStatsFor,
  setFleetValveStormCell, setFunnelProbeLogger, funnelProbeControl,
  setFleetDuckSweeper, armStormDuck, stormDuckActive, stormDuckStats,
  resetStormDuck, stormDuckArmLine, STORM_DUCK_MS_DEFAULT
} from '../../src/lib/jobqueue.mjs'
import { STORM_CELL_MAGIC, stormCellPublish } from '../../src/lib/allocvalve.mjs'
import { PATH_PRIO_BANK } from '../../src/lib/pathsemaphore.mjs'

const pos = (x, y, z) => new Vec3(x, y, z)

function mockBot ({ x = 5, y = 64, z = 5, gotoImpl = null } = {}) {
  let gotoCalls = 0
  const bot = {
    _waterRescue: false,
    entity: { position: pos(x, y, z) },
    pathfinder: {
      goto: gotoImpl || (async () => { gotoCalls++; return 'done' }),
      stop () {},
      setGoal () {},
      isMoving () { return false }
    },
    waitForTicks: async () => {},
    on () {},
    removeListener () {}
  }
  bot.gotoCallCount = () => gotoCalls
  return bot
}

function freshCell () {
  const sab = new SharedArrayBuffer(32)
  new Int32Array(sab)[0] = STORM_CELL_MAGIC
  return sab
}

const LINE_SINK = () => { const lines = []; const fn = l => lines.push(String(l)); fn.lines = lines; return fn }

test('storm duck: defaults + fresh stats shape', () => {
  resetStormDuck()
  const s = stormDuckStats()
  assert.equal(s.arms, 0)
  assert.equal(s.active, false)
  assert.equal(s.remainingMs, 0)
  assert.equal(STORM_DUCK_MS_DEFAULT, 15000, 'the duck window sits inside the worker 20s grace')
})

test('storm duck: an arm refuses EVERY walk - near, far, bank - and counts refusals at the funnel', async () => {
  resetStormDuck()
  resetWalkGovernors()
  resetDoomedGoalLedger()
  const bot = mockBot()
  const near = { x: 6, y: 64, z: 6 } // ~1.7 blocks - the class that fed run58's storm
  // sanity: the same near walk flows BEFORE the duck (open valve, no ledger)
  await gotoSafe(bot, near, { timeoutMs: 500, label: 'near walk' })
  const before = allocValveStatsFor()
  assert.equal(before.nearPasses, 0, 'open valve - no nearPass counted')
  // arm for real (the default clock - the consult path sees it)
  const duck = armStormDuck({ source: 'unit test', rate: 200, rss: 2500 })
  assert.equal(duck.fresh, true)
  assert.ok(stormDuckActive())
  await assert.rejects(async () => gotoSafe(bot, near, { timeoutMs: 500, label: 'near walk ducked' }), /storm duck/)
  await assert.rejects(async () => gotoSafe(bot, { x: 500, y: 64, z: 500 }, { timeoutMs: 500, label: 'far walk ducked' }), /storm duck/)
  await assert.rejects(async () => gotoSafe(bot, near, { timeoutMs: 500, label: 'bank walk ducked', priority: PATH_PRIO_BANK }), /storm duck/, 'no bank exemption - the fuel IS every goal')
  const after = allocValveStatsFor()
  assert.equal(after.duckRefusals, 3)
  assert.equal(after.nearPasses, 0, 'a ducked walk must not count as a nearPass')
  assert.equal(bot.gotoCallCount(), 1, 'a ducked walk never reaches the pathfinder (zero cost)')
})

test('storm duck: expiry - the window lifts and walks flow again', async () => {
  resetStormDuck()
  resetWalkGovernors()
  resetDoomedGoalLedger()
  // fake-clock semantics first
  const duck = armStormDuck({ nowMs: 1_000_000, duckMs: 100, source: 'unit test' })
  assert.equal(duck.fresh, true)
  assert.equal(stormDuckActive(1_000_050), true)
  assert.equal(stormDuckActive(1_000_150), false, 'the window lifts exactly at nowMs + duckMs')
  // real-timer end-to-end: a 40ms duck refuses, then lifts
  armStormDuck({ duckMs: 40, source: 'unit test' })
  const bot = mockBot()
  const near = { x: 6, y: 64, z: 6 }
  await assert.rejects(async () => gotoSafe(bot, near, { timeoutMs: 500, label: 'ducked' }), /storm duck/)
  await new Promise(r => setTimeout(r, 80))
  await gotoSafe(bot, near, { timeoutMs: 500, label: 'lifted' })
  assert.equal(bot.gotoCallCount(), 1, 'after the lift the walk reaches the pathfinder again')
})

test('storm duck: seq idempotence - one verdict, one arm', () => {
  resetStormDuck()
  const first = armStormDuck({ seq: 5, source: 'worker probe' })
  assert.ok(first, 'a fresh seq arms')
  assert.equal(armStormDuck({ seq: 5, source: 'worker probe' }), null, 'the same seq never re-arms')
  assert.equal(armStormDuck({ seq: Number.NaN, source: 'worker probe' }), null, 'a junk seq never arms')
  assert.equal(armStormDuck({ seq: 'x', source: 'worker probe' }), null, 'a junk seq never arms')
  assert.ok(armStormDuck({ seq: 6, source: 'worker probe' }), 'a NEW seq arms (a second storm verdict)')
  assert.equal(stormDuckStats().arms, 2)
})

test('storm duck: the sweeper runs once per arm - the in-flight goals die at the arm', () => {
  resetStormDuck()
  let sweeps = 0
  setFleetDuckSweeper(() => { sweeps++; return 7 })
  const duck = armStormDuck({ source: 'unit test' })
  assert.equal(duck.swept, 7, 'the arm returns the sweeper count')
  assert.equal(sweeps, 1)
  assert.equal(stormDuckStats().lastSwept, 7)
  // a throwing sweeper degrades to swept 0, never throws
  setFleetDuckSweeper(() => { throw new Error('junk bot') })
  const duck2 = armStormDuck({ source: 'unit test' })
  assert.equal(duck2.swept, 0)
  setFleetDuckSweeper(null)
})

test('storm duck: the worker cell verdict arms the duck at the funnel (end-to-end through gotoSafe)', async () => {
  resetStormDuck()
  resetWalkGovernors()
  resetDoomedGoalLedger()
  const cell = freshCell()
  setFleetValveStormCell(cell)
  const logger = LINE_SINK()
  setFunnelProbeLogger(logger)
  const ok = stormCellPublish({ cell, rate: 225, rss: 2114, tsS: 100 })
  assert.equal(ok, true, 'the cell publish mirrors the worker hand-roll')
  // the FIRST consult after the publish applies the verdict: valve close + duck arm
  const bot = mockBot()
  const near = { x: 6, y: 64, z: 6 }
  await assert.rejects(async () => gotoSafe(bot, near, { timeoutMs: 500, label: 'post-verdict walk' }), /storm duck/, 'the SAME consult that applied the verdict refuses the walk')
  const armed = logger.lines.filter(l => l.includes('[stormduck] ARMED (worker probe)'))
  assert.equal(armed.length, 1, 'exactly one arm line for one verdict')
  assert.ok(armed[0].includes('rss 2114M') || armed[0].includes('rss '), 'the line carries the storm numbers')
  // a SECOND consult with no new publish re-arms nothing (seq unchanged)
  logger.lines.length = 0
  await assert.rejects(async () => gotoSafe(bot, near, { timeoutMs: 500, label: 'still ducked' }), /storm duck/)
  assert.equal(logger.lines.filter(l => l.includes('[stormduck] ARMED')).length, 0, 'no new arm without a new verdict')
  const st = allocValveStatsFor()
  assert.equal(st.duckArms, 1)
  assert.equal(st.duckRefusals, 2)
  setFleetValveStormCell(null)
  setFunnelProbeLogger(null)
  resetStormDuck()
})

test('storm duck: the funnel own rss verdict arms the duck (injected storm ramp)', async () => {
  resetStormDuck()
  resetWalkGovernors()
  resetDoomedGoalLedger()
  setFleetValveStormCell(null) // the FUNNEL verdict path, no worker cell involved
  const M = 1048576
  const clock = { t: 1_000_000 }
  const reads = [500 * M, 520 * M, 545 * M] // ~100MB/s over 200ms gaps, floor 450M crossed
  funnelProbeControl().setSources({
    rssReader: () => reads[Math.min(reads.length - 1, (clock.reads = (clock.reads || 0) + 1) - 1)],
    nowMs: () => { clock.t += 200; return clock.t }
  })
  const logger = LINE_SINK()
  setFunnelProbeLogger(logger)
  funnelProbeControl().reset()
  // walk 1: reads 500M (first-read, no verdict), walk 2: 520M vs 500M over 200ms = 100MB/s >= 80 bar -> storm.
  // The arm uses the INJECTED clock (the funnel's own nowMs), so the active
  // window is judged at that clock - the gotoSafe refusal mechanics with a
  // real clock are covered by the cell + direct-arm tests above.
  const bot = mockBot()
  await gotoSafe(bot, { x: 6, y: 64, z: 6 }, { timeoutMs: 500, label: 'ramp walk 1' })
  assert.equal(stormDuckActive(clock.t), false, 'one reading judges nothing')
  await gotoSafe(bot, { x: 6, y: 64, z: 6 }, { timeoutMs: 500, label: 'ramp walk 2' })
  assert.equal(stormDuckActive(clock.t), true, 'the funnel verdict armed the duck at the injected clock')
  assert.equal(stormDuckStats().source, 'funnel probe')
  const armed = logger.lines.filter(l => l.includes('[stormduck] ARMED (funnel probe)'))
  assert.equal(armed.length, 1)
  funnelProbeControl().setSources({ rssReader: null, nowMs: null })
  funnelProbeControl().reset()
  setFunnelProbeLogger(null)
  resetStormDuck()
})

test('storm duck: the arm line format is pinned for the mine', () => {
  const line = stormDuckArmLine({ source: 'lag probe', rate: 225.4, rss: 2114.2, swept: 12, remainingMs: 15000, tsS: 181 })
  assert.ok(line.startsWith('[stormduck] ARMED (lag probe):'))
  assert.ok(line.includes('rss 2114M (+225MB/s)'))
  assert.ok(line.includes('every pathfinder goal refused 15s'))
  assert.ok(line.includes('12 in-flight goal(s) swept'))
  assert.ok(line.includes('ts=181s'))
  // junk inputs read as zeros, never NaN
  const junk = stormDuckArmLine({ rate: NaN, rss: 'x', swept: -5, remainingMs: undefined, tsS: null })
  assert.ok(!junk.includes('NaN'), 'junk inputs never leak NaN into the line')
  assert.ok(junk.includes('rss 0M (+0MB/s)'))
})

test('storm duck: stormDuckStats reflects the live window', () => {
  resetStormDuck()
  armStormDuck({ nowMs: 2_000_000, duckMs: 5000, source: 'unit test', rate: 111, rss: 2222 })
  const s = stormDuckStats()
  assert.equal(s.arms, 1)
  assert.equal(s.source, 'unit test')
  assert.equal(s.lastSwept, 0, 'no sweeper registered - the refusal is the cure')
  assert.equal(stormDuckActive(2_004_000), true, 'active inside the fake window')
  assert.equal(stormDuckActive(2_005_000), false, 'lifted at the fake expiry')
  // remainingMs is a real-clock read: arm with the default clock and check
  resetStormDuck()
  armStormDuck({ duckMs: 15000, source: 'unit test' })
  const live = stormDuckStats()
  assert.ok(live.remainingMs > 14000 && live.remainingMs <= 15000, `a fresh real-clock arm reads ~duckMs, got ${live.remainingMs}`)
  assert.equal(live.active, true)
})
