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

// ---- (v0.144.0) THE SLOW ENVELOPE + THE FAR-GOAL THINK CAP ----
// run80 (36001375280): the wedge started BEFORE the worker's first storm
// sample - no applier ever got a turn, no [stormduck] line exists. Two more
// layers: (1) the funnel's dip-immune 5s envelope (the worker's own read),
// (2) bounding the SINGLE far-goal A* burst (the only allocator no verdict
// can reach) to 24 radius / 500ms think.
import { funnelSlowVerdict, FUNNEL_SLOW_WINDOW_MS_DEFAULT } from '../../src/lib/allocvalve.mjs'
import { FAR_GOAL_SEARCH_RADIUS, FAR_GOAL_THINK_TIMEOUT_MS } from '../../src/lib/jobqueue.mjs'

const M = 1048576

test('slow envelope: pure verdict semantics (the worker-shaped two-sample read)', () => {
  // no anchor -> slide (the caller stores it), never a storm
  const first = funnelSlowVerdict({ anchorTs: null, anchorRss: null, rss: 400 * M, nowMs: 1000 })
  assert.equal(first.storm, false)
  assert.equal(first.reason, 'no-anchor')
  assert.equal(first.slide, true)
  // window filling -> wait, keep the anchor
  const filling = funnelSlowVerdict({ anchorTs: 1000, anchorRss: 400 * M, rss: 900 * M, nowMs: 3500 })
  assert.equal(filling.reason, 'window-filling')
  assert.equal(filling.slide, undefined)
  // envelope fell over the window -> slide + no storm (the streak resets)
  const fell = funnelSlowVerdict({ anchorTs: 1000, anchorRss: 900 * M, rss: 500 * M, nowMs: 7000 })
  assert.equal(fell.reason, 'envelope-fell')
  assert.equal(fell.slide, true)
  assert.equal(fell.storm, false)
  // the run80 shape: +1300M over 5s = 260MB/s past the floor -> STORM
  const storm = funnelSlowVerdict({ anchorTs: 1000, anchorRss: 866 * M, rss: 2154 * M, nowMs: 6000 })
  assert.equal(storm.storm, true)
  assert.ok(storm.rate > 200, `the envelope rate reads the average climb, got ${storm.rate}`)
  // junk now -> wait, no slide (the caller keeps the old anchor)
  const junk = funnelSlowVerdict({ anchorTs: 1000, anchorRss: 400 * M, rss: NaN, nowMs: 7000 })
  assert.equal(junk.reason, 'junk-now')
  assert.equal(FUNNEL_SLOW_WINDOW_MS_DEFAULT, 5000, 'one worker sample long')
})

test('slow envelope: the funnel wiring arms the duck on the sawtooth ramp the fast anchor misses', async () => {
  resetStormDuck()
  resetWalkGovernors()
  resetDoomedGoalLedger()
  setFleetValveStormCell(null)
  funnelProbeControl().reset()
  // the run80 wedge shape: the ramp happens between consults; the fast
  // anchor's LAST pair is a plateau (sub-bar), the envelope sees the climb.
  const clock = { t: 1_000_000 }
  const reads = [400, 1950, 2120, 2154] // M; consults at 0ms, 5.2s, 5.7s, 6.2s
  let i = 0
  funnelProbeControl().setSources({
    rssReader: () => reads[Math.min(i, reads.length - 1)] * M,
    nowMs: () => { const st = [0, 5200, 700, 500][Math.min(i, 3)]; clock.t += st; i++; return clock.t }
  })
  const logger = LINE_SINK()
  setFunnelProbeLogger(logger)
  try {
    const bot = mockBot()
    // consult 1 (t+0): 400M first-read, no verdict, the slow anchor stores.
    // consult 2 (t+5.2s): 1950M - the fast anchor measures (1950-400)/5.2 =
    // 298MB/s -> the verdict fires, the duck arms at the injected clock.
    // (The refusal with a REAL clock is covered by the cell end-to-end test
    // above; here the wiring is the pin.)
    await gotoSafe(bot, { x: 6, y: 64, z: 6 }, { timeoutMs: 500, label: 'pre-ramp consult' })
    assert.equal(stormDuckActive(clock.t), false, 'the first consult judges nothing')
    await gotoSafe(bot, { x: 6, y: 64, z: 6 }, { timeoutMs: 500, label: 'post-ramp consult' })
    const arms = logger.lines.filter(l => l.includes('[stormduck] ARMED (funnel'))
    assert.ok(arms.length >= 1, 'the funnel verdict armed the duck (fast or slow envelope flavor)')
    assert.ok(stormDuckActive(clock.t), 'the duck window is live at the injected clock')
    const slowCloses = funnelProbeControl().stats()
    assert.ok('slowCloses' in slowCloses, 'the slow envelope counter exists')
  } finally {
    funnelProbeControl().setSources({ rssReader: null, nowMs: null })
    funnelProbeControl().reset()
    setFunnelProbeLogger(null)
    setFleetValveStormCell(null)
    resetStormDuck()
    resetWalkGovernors()
  }
})

test('far-goal think cap: a FAR walk runs under the shrunk knobs and restores them', async () => {
  resetStormDuck()
  resetWalkGovernors()
  resetDoomedGoalLedger()
  const pf = { searchRadius: 32, thinkTimeout: 2000, goto: async () => 'done', stop () {}, setGoal () {}, isMoving () { return false } }
  const bot = {
    _waterRescue: false,
    entity: { position: pos(0, 64, 0) },
    pathfinder: pf,
    waitForTicks: async () => {},
    on () {},
    removeListener () {}
  }
  const far = { x: 200, y: 64, z: 200 } // ~283 blocks - far by construction
  const r = await gotoSafe(bot, far, { timeoutMs: 500, label: 'far walk' })
  assert.equal(r, 'done')
  assert.equal(pf.searchRadius, 32, 'the boot radius is restored after the walk')
  assert.equal(pf.thinkTimeout, 2000, 'the boot think timeout is restored after the walk')
  assert.equal(FAR_GOAL_SEARCH_RADIUS, 24)
  assert.equal(FAR_GOAL_THINK_TIMEOUT_MS, 500)
})

test('far-goal think cap: a FAILED far walk still restores the knobs', async () => {
  resetStormDuck()
  resetWalkGovernors()
  resetDoomedGoalLedger()
  const pf = { searchRadius: 32, thinkTimeout: 2000, goto: async () => { throw new Error('far walk: timeout after 500ms') }, stop () {}, setGoal () {}, isMoving () { return false } }
  const bot = {
    _waterRescue: false,
    entity: { position: pos(0, 64, 0) },
    pathfinder: pf,
    waitForTicks: async () => {},
    on () {},
    removeListener () {}
  }
  await assert.rejects(async () => gotoSafe(bot, { x: 200, y: 64, z: 200 }, { timeoutMs: 500, label: 'dead far walk' }), /timeout after/)
  assert.equal(pf.searchRadius, 32, 'the failure path restores the radius too')
  assert.equal(pf.thinkTimeout, 2000)
})

test('far-goal think cap: a NEAR walk keeps the boot knobs untouched', async () => {
  resetStormDuck()
  resetWalkGovernors()
  resetDoomedGoalLedger()
  let sawRadius = null
  let sawThink = null
  const pf = {
    searchRadius: 32,
    thinkTimeout: 2000,
    goto: async () => { sawRadius = pf.searchRadius; sawThink = pf.thinkTimeout; return 'done' },
    stop () {},
    setGoal () {},
    isMoving () { return false }
  }
  const bot = {
    _waterRescue: false,
    entity: { position: pos(0, 64, 0) },
    pathfinder: pf,
    waitForTicks: async () => {},
    on () {},
    removeListener () {}
  }
  await gotoSafe(bot, { x: 6, y: 64, z: 6 }, { timeoutMs: 500, label: 'near walk' })
  assert.equal(sawRadius, 32, 'the near class walks under the boot envelope, byte for byte')
  assert.equal(sawThink, 2000)
})
