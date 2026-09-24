// Tests for the walk-goal helpers in src/lib/jobqueue.mjs.
// The Big Fleet OOM (v0.6.4 investigation) traced back to pathfinder goals computed as
// "current position + offset" that landed inside unexcavated stone, plus abandoned gotos
// whose A* kept recomputing in the background. gotoSafe must stop the pathfinder on
// failure; standGoalNear must snap walk targets to standable columns.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { gotoSafe, standGoalNear, gotoSafeStats, resetStormDuck } from '../../src/lib/jobqueue.mjs'
import { Vec3 } from 'vec3'

const goals = {
  GoalNear: class {
    constructor (x, y, z, range) { this.x = x; this.y = y; this.z = z; this.range = range; this.kind = 'GoalNear' }
  }
}

// A flat world: solid up to y=63 inclusive (ground top at 63), air from 64 up.
function flatBot () {
  return {
    blockAt (p) {
      const solid = p.y <= 63
      return solid
        ? { boundingBox: 'block' }
        : { boundingBox: 'empty' }
    }
  }
}

// A world where the requested column is fully buried between y=55 and y=75.
function buriedBot () {
  return {
    blockAt (p) {
      if (p.y <= 54) return { boundingBox: 'block' }
      if (p.y <= 75) return { boundingBox: 'block' } // sealed column
      return { boundingBox: 'empty' }
    }
  }
}

test('standGoalNear: a clear column keeps the requested y', () => {
  const g = standGoalNear(flatBot(), goals, 100.7, 64, 200.2, { range: 1 })
  assert.equal(g.x, 100)
  assert.equal(g.y, 64)
  assert.equal(g.z, 200)
  assert.equal(g.range, 1)
})

test('standGoalNear: a buried column prefers DOWN (falling is cheap), then the last-resort cell', () => {
  // flat world: solid ground top at 61, pure air above. The requested y=64 has no ground
  // anywhere above (nothing to stand ON), so the helper must step DOWN to the surface.
  const bot = { blockAt: p => (p.y <= 61 ? { boundingBox: 'block' } : { boundingBox: 'empty' }) }
  const g = standGoalNear(bot, goals, 5, 64, 5, { range: 1, maxShift: 4 })
  assert.equal(g.y, 62) // ground 61, feet 62, head 63
})

test('standGoalNear: a sealed (trunk) column snaps to a standable NEIGHBOR', () => {
  // ground top 63 everywhere, trunk occupies column (10,10) at 64..68
  const bot = {
    blockAt (p) {
      const trunk = p.x === 10 && p.z === 10 && p.y >= 64 && p.y <= 68
      return { boundingBox: (trunk || p.y <= 63) ? 'block' : 'empty' }
    }
  }
  const g = standGoalNear(bot, goals, 10, 64, 10, { range: 1 })
  // the trunk column itself is sealed up to its top (68); "standable" at 69 would be a
  // trunk TOP - unreachable for a walker. The ring finds the grass right next to it.
  assert.notEqual(g.y, 69)
  assert.ok(Math.abs(g.x - 10) + Math.abs(g.z - 10) >= 1, 'goal moved off the trunk column')
  assert.equal(g.y, 64) // neighbor ground top, feet at 64
  assert.equal(g.range, 2)
})

test('standGoalNear: a fully buried column falls back to the requested cell (never aims high)', () => {
  // buriedBot: sealed 0..75 (requested 64 +- everything the helper scans) -> last resort
  const g = standGoalNear(buriedBot(), goals, 10, 64, 10, { range: 1, maxShift: 6 })
  assert.equal(g.y, 64)
  assert.equal(g.range, 2)

  // truly sealed forever: solid at every y the helper can reach
  const sealedBot = { blockAt: () => ({ boundingBox: 'block' }) }
  const g2 = standGoalNear(sealedBot, goals, 0, 64, 0, { range: 1, maxShift: 6 })
  assert.equal(g2.y, 64)
  assert.ok(g2.range >= 2)
})

test('standGoalNear: unloaded chunks (blockAt null) count as standable air, ground still required', () => {
  const bot = { blockAt: p => (p.y === 63 ? { boundingBox: 'block' } : null) }
  const g = standGoalNear(bot, goals, 0, 64, 0, { range: 2 })
  assert.equal(g.y, 64)
})

test('gotoSafe: resolves when the pathfinder finishes', async () => {
  let stopped = 0
  const bot = { pathfinder: { goto: () => Promise.resolve('done'), stop: () => { stopped++ } } }
  const r = await gotoSafe(bot, { x: 1 }, { timeoutMs: 500 })
  assert.equal(r, 'done')
  assert.equal(stopped, 0)
})

test('gotoSafe: timeout rejects AND stops the pathfinder (no zombie A*)', async () => {
  let stopped = 0
  const bot = {
    pathfinder: {
      goto: () => new Promise(() => {}), // never settles: the mineflayer-pathfinder corner case
      stop: () => { stopped++ }
    }
  }
  await assert.rejects(gotoSafe(bot, { x: 1 }, { timeoutMs: 25 }), /timeout/)
  assert.equal(stopped, 1)
})

test('gotoSafe: a rejected goto also stops the pathfinder', async () => {
  let stopped = 0
  const bot = {
    pathfinder: {
      goto: () => Promise.reject(new Error('no path')),
      stop: () => { stopped++ }
    }
  }
  await assert.rejects(gotoSafe(bot, { x: 1 }, { timeoutMs: 500 }), /no path/)
  assert.equal(stopped, 1)
})

test('gotoSafe: stop() itself throwing never masks the original error', async () => {
  const bot = {
    pathfinder: {
      goto: () => new Promise(() => {}),
      stop: () => { throw new Error('stop exploded') }
    }
  }
  await assert.rejects(gotoSafe(bot, { x: 1 }, { timeoutMs: 25 }), /timeout/)
})

test('gotoSafe returns real Vec3 compatibility: goal objects pass through untouched', async () => {
  let received = null
  const bot = { pathfinder: { goto: async g => { received = g }, stop: () => {} } }
  const goal = new Vec3(1, 2, 3)
  await gotoSafe(bot, goal, { timeoutMs: 500 })
  assert.equal(received, goal)
})

// (v0.20.0) The library-level trace: a stop() on a STANDING bot (empty path) leaves
// stopPathing=true unconsumed, and the NEXT goto dies instantly at its own setGoal
// ('Path was stopped before it could be completed!'). gotoSafe must pre-clear the
// flag with setGoal(null) while the bot is not moving.
test('gotoSafe: pre-clears a stale stopPathing flag before the new goal (standing bot)', async () => {
  let staleFlag = true // a previous timeout's stop() on a standing bot: nothing consumed it
  const setGoalCalls = []
  const gotoCalls = []
  const bot = {
    pathfinder: {
      isMoving: () => false,
      // the library contract: setGoal -> resetPath -> `if (stopPathing) return stop()`
      // -> stop() emits 'path_stop' synchronously and clears the flag
      setGoal: g => {
        setGoalCalls.push(g)
        if (staleFlag) { staleFlag = false; bot.emit('path_stop') }
      },
      // gotoUtil's own setGoal(goal) is INSIDE the library; this mock keeps the
      // two seams separate: goto() receives the real goal, setGoal() sees only
      // the pre-clear's null
      goto: async g => { gotoCalls.push(g); return 'walked' }
    },
    _handlers: {},
    on (ev, fn) { (this._handlers[ev] = this._handlers[ev] || []).push(fn) },
    removeListener (ev, fn) { this._handlers[ev] = (this._handlers[ev] || []).filter(f => f !== fn) },
    emit (ev, ...a) { for (const fn of this._handlers[ev] || []) fn(...a) }
  }
  const before = gotoSafeStats().staleStopClears
  const r = await gotoSafe(bot, { x: 1 }, { timeoutMs: 500 })
  assert.equal(r, 'walked', 'the next goto SURVIVES the stale flag - the poisoning chain is broken')
  assert.deepEqual(setGoalCalls, [null], 'the pre-clear runs setGoal(null) exactly once, BEFORE goto()')
  assert.deepEqual(gotoCalls, [{ x: 1 }], 'the real goal reaches the pathfinder untouched')
  assert.equal(gotoSafeStats().staleStopClears, before + 1, 'the synchronous path_stop during the pre-clear is the stale-flag signature')
})

test('gotoSafe: no stale flag -> the pre-clear is harmless (no path_stop, counter flat)', async () => {
  const bot = {
    pathfinder: {
      isMoving: () => false,
      setGoal: () => { /* no stopPathing set: resetPath alone, no stop() */ },
      goto: async () => 'walked'
    },
    _handlers: {},
    on (ev, fn) { (this._handlers[ev] = this._handlers[ev] || []).push(fn) },
    removeListener (ev, fn) { this._handlers[ev] = (this._handlers[ev] || []).filter(f => f !== fn) },
    emit (ev, ...a) { for (const fn of this._handlers[ev] || []) fn(...a) }
  }
  const before = gotoSafeStats().staleStopClears
  await gotoSafe(bot, { x: 1 }, { timeoutMs: 500 })
  assert.equal(gotoSafeStats().staleStopClears, before, 'a clean bot must not inflate the stale counter')
})

test('gotoSafe: an ACTIVE walk is never disturbed by the pre-clear', async () => {
  let setGoalCalls = 0
  const bot = {
    pathfinder: {
      isMoving: () => true, // a walk is in flight (the second-goto fight keeps old semantics)
      setGoal: () => { setGoalCalls++ },
      goto: async () => 'walked'
    }
  }
  await gotoSafe(bot, { x: 1 }, { timeoutMs: 500 })
  assert.equal(setGoalCalls, 0, 'setGoal(null) would kill the active goal - it must not run')
})

test('gotoSafe: a bare mock without setGoal/isMoving keeps passing (degradation guard)', async () => {
  const bot = { pathfinder: { goto: async () => 'ok', stop: () => {} } }
  const r = await gotoSafe(bot, { x: 1 }, { timeoutMs: 500 })
  assert.equal(r, 'ok')
})

test('gotoSafe: a throwing setGoal(null) never blocks the real walk', async () => {
  const bot = {
    pathfinder: {
      isMoving: () => false,
      setGoal: () => { throw new Error('resetPath exploded') },
      goto: async () => 'walked'
    }
  }
  const r = await gotoSafe(bot, { x: 1 }, { timeoutMs: 500 })
  assert.equal(r, 'walked', 'diagnostics are best-effort; the walk proceeds')
})

// (v0.65.0) THE ZOMBIE GOAL KILL: a timeout's stop() only SETS a flag - the
// unreachable goal's recompute loop consumes it and re-engages on the next
// tick (run63: 'main freeze ~51s; last: pf:goal deploy @+0.0s', pf:done
// never came, 39 transport losses behind the freeze). The catch must clear
// the goal SLOT itself, after the flag-setting stop().
test('gotoSafe: a timeout clears the goal slot (setGoal(null) after stop())', async () => {
  const calls = []
  const bot = {
    pathfinder: {
      goal: { x: 1 }, // the wedged slot: the A* can never close this goal
      goto: () => new Promise(() => {}),
      stop: () => { calls.push('stop') },
      setGoal: g => { calls.push(['setGoal', g]) }
    }
  }
  await assert.rejects(gotoSafe(bot, { x: 1 }, { timeoutMs: 25 }), /timeout/)
  assert.equal(calls[0], 'stop', 'stop() first: the flag is set before the slot clears')
  assert.deepEqual(calls[1], ['setGoal', null], 'then setGoal(null): the re-spiral loses its goal')
})

test('gotoSafe: a rejected goto also clears the goal slot (No path failures too)', async () => {
  const calls = []
  const bot = {
    pathfinder: {
      goto: () => Promise.reject(new Error('No path to the goal!')),
      stop: () => { calls.push('stop') },
      setGoal: g => { calls.push(['setGoal', g]) }
    }
  }
  await assert.rejects(gotoSafe(bot, { x: 1 }, { timeoutMs: 500 }), /No path/)
  assert.equal(calls[0], 'stop')
  assert.deepEqual(calls[1], ['setGoal', null], 'a refused walk leaves an empty slot behind')
})

test('gotoSafe: the goal-slot clear survives a pathfinder without setGoal (bare mock)', async () => {
  const bot = { pathfinder: { goto: () => new Promise(() => {}), stop: () => {} } }
  await assert.rejects(gotoSafe(bot, { x: 1 }, { timeoutMs: 25 }), /timeout/)
  // no throw from the catch path: the typeof guard skipped the clear, the timeout still surfaced
})

// (v0.102.0) THE ALLOCATION VALVE at the funnel: while closed, LONG walks
// (straight-line bot->goal > 24 blocks) are refused honestly with the storm
// numbers; short walks (rescues/climbs/next-columns) flow; an unmeasurable
// distance is not provably near and is refused. The default-OPEN valve must
// leave every test above untouched (no consult behavior while open).
import { allocValveControl, allocValveStatsFor, resetWalkGovernors } from '../../src/lib/jobqueue.mjs'

test('alloc valve at the funnel: a closed valve refuses a LONG walk with the storm numbers', async () => {
  resetWalkGovernors()
  const vc = allocValveControl()
  vc.sample(500)
  vc.sample(1500) // the run92 signature (real clock, dt<1s -> rate 1000MB/s >= 40 at rss >= 600)
  assert.equal(vc.consult().closed, true, 'the singleton is closed')
  const bot = {
    entity: { position: { x: 0, y: 64, z: 0 } },
    pathfinder: { goto: async () => 'done', stop: () => {} }
  }
  await assert.rejects(gotoSafe(bot, { x: 100, y: 64, z: 100 }, { timeoutMs: 500 }), /alloc valve: closed/)
  assert.ok(allocValveStatsFor().refusals >= 1, 'the refusal is counted')
  resetWalkGovernors()
})

test('alloc valve at the funnel: a NEAR walk still flows (the rescue/climb class)', async () => {
  resetWalkGovernors()
  const vc = allocValveControl()
  vc.sample(500)
  vc.sample(1500)
  const bot = {
    entity: { position: { x: 0, y: 64, z: 0 } },
    pathfinder: { goto: async () => 'done', stop: () => {} }
  }
  const r = await gotoSafe(bot, { x: 3, y: 64, z: 4 }, { timeoutMs: 500 }) // d = 5 <= 24
  assert.equal(r, 'done', 'a drowning bot never waits on a memory valve')
  assert.ok(allocValveStatsFor().nearPasses >= 1, 'the near pass is counted')
  resetWalkGovernors()
})

test('alloc valve at the funnel: an unmeasurable distance is refused while closed', async () => {
  resetWalkGovernors()
  const vc = allocValveControl()
  vc.sample(500)
  vc.sample(1500)
  const bot = { pathfinder: { goto: async () => 'done', stop: () => {} } } // no entity.position
  await assert.rejects(gotoSafe(bot, { x: 100, y: 64, z: 100 }, { timeoutMs: 500 }), /alloc valve: closed/)
  resetWalkGovernors()
})

test('alloc valve at the funnel: resetWalkGovernors reopens the valve and zeroes the counters (test hygiene)', () => {
  const vc = allocValveControl()
  vc.sample(500)
  vc.sample(1500)
  assert.equal(vc.consult().closed, true)
  resetWalkGovernors()
  resetStormDuck() // (v0.143.0) the duck rides its own reset - the valve hygiene does not lift it
  assert.equal(allocValveControl().consult().closed, false)
  assert.deepEqual(allocValveStatsFor(), { refusals: 0, nearPasses: 0, hazardRefusals: 0, duckRefusals: 0, duckArms: 0, duckActive: false, closes: 0, strikes: 0, closedNow: false, workerCloses: 0, queueCloses: 0, funnelCloses: 0, funnelCellCloses: 0 })
})

// ---- (v0.104.0) THE AQUIFER GATE at the funnel ----
// run93 (35835942682): the storm returned THROUGH the near exemption - the
// kill window was all SHORT walks (relocations, next-column alts) across the
// flooded quarry. While closed, the near exemption consults the fleet hazard
// board (setFleetHazardNear): a near goal in live hazard water is refused
// with its own named clause; a missing/throwing/junk-null board judges
// NOTHING (the v0.102.0 distance-only shape).

import { setFleetHazardNear, startFleetValveTicker } from '../../src/lib/jobqueue.mjs'
import { stormCellPublish, STORM_CELL_MAGIC } from '../../src/lib/allocvalve.mjs'

test('alloc valve at the funnel: a NEAR walk into live hazard water is refused while closed (the aquifer gate)', async () => {
  resetWalkGovernors()
  const vc = allocValveControl()
  vc.sample(500)
  vc.sample(1500) // closed
  setFleetHazardNear(pos => (pos && pos.x === 3 && pos.z === 4) ? { hazard: { x: 3, y: 64, z: 4, at: Date.now() }, d: 0.5 } : null)
  try {
    const bot = {
      entity: { position: { x: 0, y: 64, z: 0 } },
      pathfinder: { goto: async () => 'done', stop: () => {} }
    }
    await assert.rejects(gotoSafe(bot, { x: 3, y: 64, z: 4 }, { timeoutMs: 500 }), /aquifer gate/, 'the refusal names the gate so the log reader can count it')
    const st = allocValveStatsFor()
    assert.ok(st.refusals >= 1 && st.hazardRefusals >= 1, 'the aquifer refusal is counted separately')
  } finally {
    setFleetHazardNear(null)
    resetWalkGovernors()
  }
})

test('alloc valve at the funnel: a NEAR walk on a DRY goal flows while closed even with the board wired', async () => {
  resetWalkGovernors()
  const vc = allocValveControl()
  vc.sample(500)
  vc.sample(1500)
  setFleetHazardNear(() => null) // a wired board that knows no hazards
  try {
    const bot = {
      entity: { position: { x: 0, y: 64, z: 0 } },
      pathfinder: { goto: async () => 'done', stop: () => {} }
    }
    const r = await gotoSafe(bot, { x: 3, y: 64, z: 4 }, { timeoutMs: 500 })
    assert.equal(r, 'done', 'the v0.102.0 near class is untouched by the gate')
  } finally {
    setFleetHazardNear(null)
    resetWalkGovernors()
  }
})

test('alloc valve at the funnel: a throwing or junk-answer board judges NOTHING (admits near)', async () => {
  resetWalkGovernors()
  const vc = allocValveControl()
  vc.sample(500)
  vc.sample(1500)
  const bot = {
    entity: { position: { x: 0, y: 64, z: 0 } },
    pathfinder: { goto: async () => 'done', stop: () => {} }
  }
  setFleetHazardNear(() => { throw new Error('board on fire') })
  try {
    const r = await gotoSafe(bot, { x: 3, y: 64, z: 4 }, { timeoutMs: 500 })
    assert.equal(r, 'done', 'a throwing reader never refuses a walk the distance gate would admit')
  } finally {
    setFleetHazardNear(null)
  }
  setFleetHazardNear('junk') // non-function: the setter nulls it
  try {
    const r = await gotoSafe(bot, { x: 3, y: 64, z: 4 }, { timeoutMs: 500 })
    assert.equal(r, 'done', 'a non-function board is the unset board')
  } finally {
    setFleetHazardNear(null)
    resetWalkGovernors()
  }
})

// (v0.104.0) THE RUN93 WIRING REGRESSION TEST: run93 (35835942682) shipped
// TWO valve instances - the fleet19 ticker fed a private one while the
// funnel consulted jobqueue's never-sampled singleton: the cure could not
// refuse a single walk (zero [allocvalve] lines) and run92's OOM class
// killed the run again. startFleetValveTicker is the fix: the ticker feeds
// the SINGLETON, and the worker's probe verdict rides the storm cell. This
// test pins the WHOLE chain end to end: publish -> ticker poll -> singleton
// closed -> gotoSafe refuses the long walk.
test('the fleet valve ticker feeds the CONSULTED singleton: publish -> poll -> closed -> the funnel refuses (run93 regression pin)', async () => {
  resetWalkGovernors()
  const cell = new SharedArrayBuffer(32)
  new Int32Array(cell)[0] = STORM_CELL_MAGIC
  stormCellPublish({ cell, rate: 183, rss: 2626, tsS: 581 }) // the run93 worker verdict
  const h = startFleetValveTicker({ intervalMs: 250, stormCell: cell, onLine: null })
  try {
    await new Promise(r => setTimeout(r, 800)) // one 250ms tick minimum
    const snap = allocValveControl().consult()
    assert.equal(snap.closed, true, 'the SINGLETON is closed - the ticker fed the consulted instance')
    assert.equal(snap.lastSource, 'worker-probe')
    const bot = {
      entity: { position: { x: 0, y: 64, z: 0 } },
      pathfinder: { goto: async () => 'done', stop: () => {} }
    }
    await assert.rejects(gotoSafe(bot, { x: 100, y: 64, z: 100 }, { timeoutMs: 500 }), /alloc valve: closed/, 'the cure refuses the long walk at the funnel')
    assert.ok(allocValveStatsFor().refusals >= 1)
    assert.equal(allocValveStatsFor().workerCloses, 1, 'the close is booked to the worker-probe feeder')
  } finally {
    h.stop()
    resetWalkGovernors()
  }
})

test('the fleet valve ticker: a forceClose through the control surface also closes the singleton (the backstop path)', () => {
  resetWalkGovernors()
  allocValveControl().forceClose({ rate: 145, rss: 1711 })
  assert.equal(allocValveControl().consult().closed, true)
  assert.equal(allocValveControl().consult().lastSource, 'worker-probe')
  resetWalkGovernors()
})

// ---- (v0.121.0) THE FUNNEL PROBE at the funnel ----
// run105 (35903689995, the v0.119.0 fleet) died of the run92 OOM class with
// the valve NEVER closing: both feeders (the 1s rss ticker + the storm-cell
// poll inside it) live on the main thread's TIMER phase, and the storm
// starves exactly that phase - while the funnel's pf notes marched through
// the kill window. The worker published the verdict into the cell and it
// died there. The cure: the funnel polls the cell and carries its own rss
// verdict on EVERY consult - the one path that cannot starve while walks
// are being issued. These blocks pin the whole wiring WITHOUT any ticker.
import { setFleetValveStormCell, setFunnelProbeLogger, funnelProbeControl } from '../../src/lib/jobqueue.mjs'

test('funnel probe: the worker verdict published into the cell is applied at the funnel with NO ticker alive (the run105 regression pin)', async () => {
  resetWalkGovernors()
  resetStormDuck() // (v0.143.0) the applied verdict now also ARMS the duck - isolate it per test
  const cell = new SharedArrayBuffer(32)
  new Int32Array(cell)[0] = STORM_CELL_MAGIC
  stormCellPublish({ cell, rate: 223, rss: 1750, tsS: 415 }) // the run105 first-strike verdict
  setFleetValveStormCell(cell)
  const lines = []
  setFunnelProbeLogger(l => lines.push(l))
  try {
    const bot = {
      entity: { position: { x: 0, y: 64, z: 0 } },
      pathfinder: { goto: async () => 'done', stop: () => {} }
    }
    // NO startFleetValveTicker call - in run105 the ticker starved; the funnel
    // is the only witness. The FIRST consult must apply the verdict inline.
    // (v0.143.0) the same verdict ARMS THE DUCK, and the duck consult sits
    // BEFORE the valve consult - the first refusal now names the duck (the
    // strictest form of the same cure: every goal refused, not just long).
    await assert.rejects(gotoSafe(bot, { x: 100, y: 64, z: 100 }, { timeoutMs: 500 }), /storm duck/, 'the armed duck refuses the walk the valve would have refused')
    assert.equal(allocValveControl().consult().lastSource, 'worker-probe', 'the close still rides the worker verdict')
    assert.equal(funnelProbeControl().stats().cellCloses, 1, 'the cell apply is booked')
    assert.ok(lines.length >= 2, 'both lines rode the fleet log')
    assert.ok(lines[0].includes('[stormduck] ARMED (worker probe)'), 'the arm line rides FIRST (the duck is the strictest refusal)')
    assert.ok(lines.some(l => l.includes('CLOSED (funnel probe)')), 'the named close line rode the fleet log')
    assert.ok(lines.some(l => l.includes('the worker verdict rss 1750M (+223MB/s)')), 'the line names the verdict numbers')
    // with the duck lifted, the SAME verdict's valve close still refuses the long walk (the v0.102.0 contract, unchanged)
    resetStormDuck()
    await assert.rejects(gotoSafe(bot, { x: 100, y: 64, z: 100 }, { timeoutMs: 500 }), /alloc valve: closed/, 'the valve close from the same verdict still refuses long walks')
  } finally {
    setFleetValveStormCell(null)
    setFunnelProbeLogger(null)
    resetWalkGovernors()
    resetStormDuck()
  }
})

test('funnel probe: the funnel\'s own rss storm closes the valve on the consult path (the timers never needed)', async () => {
  resetWalkGovernors()
  resetStormDuck() // (v0.143.0) hygiene - a leaked duck from a sibling test would pre-empt the valve refusals
  const clock = { t: 1000 }
  let rssM = 449
  funnelProbeControl().setSources({ rssReader: () => rssM * 1048576, nowMs: () => clock.t })
  const lines = []
  setFunnelProbeLogger(l => lines.push(l))
  try {
    const bot = {
      entity: { position: { x: 0, y: 64, z: 0 } },
      pathfinder: { goto: async () => 'done', stop: () => {} }
    }
    // walk 1: rss 449 - the anchor is recorded, the walk flows
    const r = await gotoSafe(bot, { x: 30, y: 64, z: 40 }, { timeoutMs: 500 })
    assert.equal(r, 'done', 'a healthy rss never refuses')
    // the kill window: 449 -> 1750 over a real 5s gap (the run105 shape)
    rssM = 1750
    clock.t = 6000
    await assert.rejects(gotoSafe(bot, { x: 100, y: 64, z: 100 }, { timeoutMs: 500 }), /alloc valve: closed/, 'the funnel saw the storm the starved timers could not')
    assert.equal(funnelProbeControl().stats().stormCloses, 1, 'the funnel close is booked')
    assert.ok(lines.some(l => l.includes('CLOSED (funnel probe): rss 1750M')), 'the storm line rode the fleet log')
  } finally {
    funnelProbeControl().setSources({})
    setFunnelProbeLogger(null)
    resetWalkGovernors()
    resetStormDuck()
  }
})

test('funnel probe: a sub-gap jump records without a verdict and keeps the anchor (the GC-noise pin)', async () => {
  resetWalkGovernors()
  resetStormDuck()
  const clock = { t: 1000 }
  let rssM = 449
  funnelProbeControl().setSources({ rssReader: () => rssM * 1048576, nowMs: () => clock.t })
  try {
    const bot = {
      entity: { position: { x: 0, y: 64, z: 0 } },
      pathfinder: { goto: async () => 'done', stop: () => {} }
    }
    await gotoSafe(bot, { x: 30, y: 64, z: 40 }, { timeoutMs: 500 }) // anchor at rss 449, t=1000
    // 50ms later rss reads 1750 - GC noise territory, the min-gap refuses to judge
    rssM = 1750
    clock.t = 1050
    const r = await gotoSafe(bot, { x: 34, y: 64, z: 40 }, { timeoutMs: 500 })
    assert.equal(r, 'done', 'a sub-gap spike never closes')
    assert.equal(funnelProbeControl().stats().stormCloses, 0)
    // the anchor was KEPT (min-gap never rewrites it): the real 5s gap still catches the storm
    clock.t = 6000
    await assert.rejects(gotoSafe(bot, { x: 100, y: 64, z: 100 }, { timeoutMs: 500 }), /alloc valve: closed/, 'the rate over the real gap still fires')
    assert.equal(funnelProbeControl().stats().stormCloses, 1)
  } finally {
    funnelProbeControl().setSources({})
    resetWalkGovernors()
    resetStormDuck()
  }
})

test('funnel probe: a throwing rss reader judges nothing - the walk flows (the junk contract)', async () => {
  resetWalkGovernors()
  resetStormDuck()
  funnelProbeControl().setSources({ rssReader: () => { throw new Error('reader on fire') } })
  try {
    const bot = {
      entity: { position: { x: 0, y: 64, z: 0 } },
      pathfinder: { goto: async () => 'done', stop: () => {} }
    }
    const r = await gotoSafe(bot, { x: 100, y: 64, z: 100 }, { timeoutMs: 500 })
    assert.equal(r, 'done', 'a dead reader never blocks the walk it precedes')
    assert.ok(funnelProbeControl().stats().junkReads >= 1, 'the junk read is counted')
    assert.equal(funnelProbeControl().stats().stormCloses, 0)
  } finally {
    funnelProbeControl().setSources({})
    resetWalkGovernors()
    resetStormDuck()
  }
})

test('funnel probe: resetWalkGovernors keeps the cell seq - an applied verdict is never re-applied (the stale-seq pin)', async () => {
  resetWalkGovernors()
  resetStormDuck()
  const cell = new SharedArrayBuffer(32)
  new Int32Array(cell)[0] = STORM_CELL_MAGIC
  stormCellPublish({ cell, rate: 183, rss: 2626, tsS: 581 })
  setFleetValveStormCell(cell)
  try {
    const bot = {
      entity: { position: { x: 0, y: 64, z: 0 } },
      pathfinder: { goto: async () => 'done', stop: () => {} }
    }
    await assert.rejects(gotoSafe(bot, { x: 100, y: 64, z: 100 }, { timeoutMs: 500 }), /storm duck/, 'the applied verdict arms the duck, the duck refuses first')
    assert.equal(funnelProbeControl().stats().cellCloses, 1)
    resetWalkGovernors() // the test hygiene reset - the counter zeroes, the SEQ must not
    resetStormDuck() // (v0.143.0) lift the duck the same way the window would expire
    assert.equal(allocValveControl().consult().closed, false, 'the valve reopens')
    const r = await gotoSafe(bot, { x: 100, y: 64, z: 100 }, { timeoutMs: 500 })
    assert.equal(r, 'done', 'the stale verdict is not re-applied - the seq space lives with the cell')
    assert.equal(funnelProbeControl().stats().cellCloses, 0, 'the reset zeroed the counter and the walk re-applied NOTHING (a seq reset here would have closed the valve again)')
  } finally {
    setFleetValveStormCell(null)
    resetWalkGovernors()
    resetStormDuck()
  }
})
