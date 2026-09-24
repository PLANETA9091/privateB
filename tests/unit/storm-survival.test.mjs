// (v0.141.0) THE STORM SURVIVAL tests. Fleet leg 35986122635 (the v0.140.0
// union, mined 2026-09-24) named the gap: the worker PROBED at rss 1213M and
// published into the storm cell, but every main-thread applier (the 1s
// ticker's timer phase, the funnel's between-walk consults) was deaf - the
// walks were all IN FLIGHT, the storm was made of them - so the closure never
// landed and the second strike killed at 2164M five seconds later, 521/600s
// into a probable NORMAL END. The cures, pinned here:
//   1. THE SECOND-STRIKE GRACE (stormguard.stormResponse + the worker's
//      hand-rolled mirror): a second verdict inside the grace window is HELD
//      - the closure + the goal sweep + a GC drain need a wind-down - while
//      the hard ceiling kills IMMEDIATELY (the amputation guarantee intact).
//   2. THE LAG-PROBE VALVE FEEDER (startHeartbeat onProbeFire -> fleet19):
//      the 250ms lag probe is the one main-thread cadence proven to keep
//      firing inside a storm (mainLate 959ms at the probe); the fresh cell
//      verdict applies there + every pathfinder goal is swept (the in-flight
//      recompute loops die at the source).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { stormResponse, STORM_GRACE_MS_DEFAULT, STORM_CEIL_MB_DEFAULT, STORM_PULSE_VOID_MS_DEFAULT } from '../../src/lib/stormguard.mjs'
import { startHeartbeat, HEARTBEAT_WORKER_SRC } from '../../src/lib/heartbeat.mjs'

const sleep = ms => new Promise(r => setTimeout(r, ms))

class FakeWorker {
  constructor (src, opts) {
    FakeWorker.last = this
    this.src = src
    this.opts = opts
    this.unrefed = false
    this.messages = []
    this.terminated = false
    this.listeners = new Map()
  }

  on (event, fn) {
    if (!this.listeners.has(event)) this.listeners.set(event, [])
    this.listeners.get(event).push(fn)
  }

  emit (event, arg) {
    for (const fn of this.listeners.get(event) ?? []) fn(arg)
  }

  unref () { this.unrefed = true }

  postMessage (m) { this.messages.push(m) }

  terminate () { this.terminated = true; return Promise.resolve(0) }
}

test('stormResponse grace: the knob defaults to the 20s wind-down budget', () => {
  assert.strictEqual(STORM_GRACE_MS_DEFAULT, 20000, 'four worker samples = the closure-landing window (run 576: the kill fired at 5s)')
})

test('stormResponse grace: a second verdict inside the window is HELD, after it kills', () => {
  const now = 1_000_000
  // the run 576 shape: probe at rss 1213M, second verdict 5s later (2164M) -
  // inside the 20s grace the run SURVIVES for the closure to land
  const held = stormResponse({ probeUsed: true, rssMb: 2164, probeAtMs: now - 5000, graceMs: STORM_GRACE_MS_DEFAULT, nowMs: now })
  assert.strictEqual(held.action, 'none')
  assert.strictEqual(held.reason, 'grace hold')
  assert.strictEqual(held.probeUsed, true, 'the probe stays spent - one survival per process')
  // 25s later (past the grace): the same verdict kills exactly as before
  const killed = stormResponse({ probeUsed: true, rssMb: 2164, probeAtMs: now - 25000, graceMs: STORM_GRACE_MS_DEFAULT, nowMs: now })
  assert.strictEqual(killed.action, 'kill')
  assert.strictEqual(killed.reason, 'second strike')
  // the boundary: now - at === grace is NOT inside the grace (the hold is strict)
  const edge = stormResponse({ probeUsed: true, rssMb: 2164, probeAtMs: now - STORM_GRACE_MS_DEFAULT, graceMs: STORM_GRACE_MS_DEFAULT, nowMs: now })
  assert.strictEqual(edge.action, 'kill', 'at exactly the grace the kill fires - the window is a wind-down, not a pardon')
})

test('stormResponse grace: the hard ceiling kills IMMEDIATELY, grace or not', () => {
  const now = 1_000_000
  const r = stormResponse({ probeUsed: true, rssMb: STORM_CEIL_MB_DEFAULT, probeAtMs: now - 1000, graceMs: STORM_GRACE_MS_DEFAULT, nowMs: now })
  assert.strictEqual(r.action, 'kill')
  assert.match(r.reason, /hard ceiling/, 'a terminal storm cannot outlive 3000M - the v0.55.0 amputation guarantee is byte for byte')
})

test('stormResponse grace: a junk clock keeps the old kill-at-once contract', () => {
  const now = 1_000_000
  // no probeAt (the pre-v0.141.0 callers pass none): second verdict kills
  assert.strictEqual(stormResponse({ probeUsed: true, rssMb: 2164 }).action, 'kill')
  assert.strictEqual(stormResponse({ probeUsed: true, rssMb: 2164, probeAtMs: 0, graceMs: STORM_GRACE_MS_DEFAULT, nowMs: now }).action, 'kill', 'probeAt 0 is junk - the hold never applies')
  assert.strictEqual(stormResponse({ probeUsed: true, rssMb: 2164, probeAtMs: Number.NaN, nowMs: now }).action, 'kill')
  assert.strictEqual(stormResponse({ probeUsed: true, rssMb: 2164, probeAtMs: now - 5000, graceMs: STORM_GRACE_MS_DEFAULT, nowMs: Number.NaN }).action, 'kill', 'a junk now kills honestly - the v0.55.0 amputation default')
  assert.strictEqual(stormResponse({ probeUsed: true, rssMb: 2164, probeAtMs: now - 5000, graceMs: 0, nowMs: now }).action, 'kill', 'a zero grace disables the hold')
})

test('stormResponse grace: the first strike still probes with the grace armed', () => {
  const r = stormResponse({ probeUsed: false, rssMb: 1451, probeAtMs: 999, graceMs: STORM_GRACE_MS_DEFAULT, nowMs: 1000 })
  assert.strictEqual(r.action, 'probe')
  assert.strictEqual(r.probeUsed, true)
})

// (v0.143.0) THE PULSE-VOID GRACE. Fleet leg 35994461858: the GRACE HOLD
// waited 10s for "the lag-probe closure" while the main thread was frozen
// SOLID - the FATAL's blackbox ring is byte-for-byte the probe's ring, no
// ticker mem line, no probe fire. The grace exists FOR the closure; every
// closure applier lives on the main thread; a frozen pulse is the proof the
// premise is dead. The hold becomes a VOID kill with the named reason.
test('stormResponse pulse void: the knob defaults to the 4s applier-death proof', () => {
  assert.strictEqual(STORM_PULSE_VOID_MS_DEFAULT, 4000, 'the main pulse advances every 250ms when alive; 4s frozen means no timer phase at all')
})

test('stormResponse pulse void: a frozen pulse inside the grace kills with the named reason', () => {
  const now = 1_000_000
  // the run 35994461858 shape: probe at ts=181s, the main froze right after;
  // the second verdict 5s later reads a 5s-frozen pulse -> the grace is void
  const voided = stormResponse({ probeUsed: true, rssMb: 2882, probeAtMs: now - 5000, graceMs: STORM_GRACE_MS_DEFAULT, nowMs: now, pulseFrozenMs: 5000 })
  assert.strictEqual(voided.action, 'kill')
  assert.match(voided.reason, /grace void/, 'the reason names the mechanism (the mine reads it)')
  assert.match(voided.reason, /main pulse frozen 5s/, 'the reason carries the frozen duration')
  assert.match(voided.reason, /the closure cannot land/, 'the reason states the premise: the appliers are dead')
})

test('stormResponse pulse void: a live pulse holds exactly as before (byte for byte)', () => {
  const now = 1_000_000
  const held = stormResponse({ probeUsed: true, rssMb: 2164, probeAtMs: now - 5000, graceMs: STORM_GRACE_MS_DEFAULT, nowMs: now, pulseFrozenMs: 250 })
  assert.strictEqual(held.action, 'none')
  assert.strictEqual(held.reason, 'grace hold', 'a turning main can still apply the closure - the grace serves it')
  const fresh = stormResponse({ probeUsed: true, rssMb: 2164, probeAtMs: now - 5000, graceMs: STORM_GRACE_MS_DEFAULT, nowMs: now, pulseFrozenMs: 3999 })
  assert.strictEqual(fresh.reason, 'grace hold', 'just under the void bar the hold stands (the boundary is the proof threshold, not a hair trigger)')
})

test('stormResponse pulse void: junk or absent pulse evidence never voids (never a false kill)', () => {
  const now = 1_000_000
  for (const frozen of [null, undefined, Number.NaN, -1, 'junk']) {
    const r = stormResponse({ probeUsed: true, rssMb: 2164, probeAtMs: now - 5000, graceMs: STORM_GRACE_MS_DEFAULT, nowMs: now, pulseFrozenMs: frozen })
    assert.strictEqual(r.reason, 'grace hold', `pulseFrozenMs ${String(frozen)} judges nothing - missing evidence is not a kill`)
  }
  assert.strictEqual(stormResponse({ probeUsed: true, rssMb: 2164, probeAtMs: now - 5000, graceMs: STORM_GRACE_MS_DEFAULT, nowMs: now, pulseFrozenMs: 5000, pulseVoidMs: 0 }).reason, 'grace hold', 'a zero void knob disables the void (the junk-knob kills-honestly contract does not apply here: the void is an ACCELERATION, its absence is the legacy shape)')
})

test('stormResponse pulse void: the hard ceiling still kills FIRST, frozen pulse or not', () => {
  const now = 1_000_000
  const r = stormResponse({ probeUsed: true, rssMb: STORM_CEIL_MB_DEFAULT, probeAtMs: now - 1000, graceMs: STORM_GRACE_MS_DEFAULT, nowMs: now, pulseFrozenMs: 30000 })
  assert.strictEqual(r.action, 'kill')
  assert.match(r.reason, /hard ceiling/, 'the ceiling branch precedes the grace branch - the amputation guarantee is byte for byte')
})

test('stormResponse pulse void: past the grace the clock alone still kills (the void needs no extra evidence there)', () => {
  const now = 1_000_000
  const r = stormResponse({ probeUsed: true, rssMb: 2164, probeAtMs: now - 25000, graceMs: STORM_GRACE_MS_DEFAULT, nowMs: now, pulseFrozenMs: null })
  assert.strictEqual(r.action, 'kill')
  assert.strictEqual(r.reason, 'second strike', 'the post-grace kill rides the clock, unchanged')
})

test('the worker mirror carries the grace arithmetic (the eval worker cannot import ESM)', () => {
  // the hand-rolled copy must name the knob, the clock, the hold branch and
  // the one-time GRACE HOLD line - the same contract the storm cell publish
  // mirror pins elsewhere
  assert.match(HEARTBEAT_WORKER_SRC, /FLEET_STORM_GRACE_MS/, 'the grace rides the env knob shape')
  assert.match(HEARTBEAT_WORKER_SRC, /var sgGraceMs = Number\(process\.env\.FLEET_STORM_GRACE_MS\) \|\| 20000/, 'the default is the 20s wind-down budget')
  assert.match(HEARTBEAT_WORKER_SRC, /sgProbeAt = Date\.now\(\)/, 'the grace clock starts at the probe')
  assert.match(HEARTBEAT_WORKER_SRC, /Date\.now\(\) - sgProbeAt < sgGraceMs/, 'the hold is measured against the probe moment')
  assert.match(HEARTBEAT_WORKER_SRC, /GRACE HOLD/, 'the one-time hold line names itself (the mine must read the hold)')
  assert.match(HEARTBEAT_WORKER_SRC, /act === 'hold'/, 'the hold is a distinct act - neither probe nor kill')
  // the ceiling branch must sit BEFORE the grace branch (the ceiling kills
  // regardless of the clock)
  const ceilIdx = HEARTBEAT_WORKER_SRC.indexOf('hard ceiling')
  const graceIdx = HEARTBEAT_WORKER_SRC.indexOf('grace hold')
  assert.ok(ceilIdx >= 0 && graceIdx >= 0 && ceilIdx < graceIdx, 'the ceiling verdict precedes the grace verdict in the act chain')
  // the probe line must NAME the grace (the next mine reads the story)
  assert.match(HEARTBEAT_WORKER_SRC, /s grace, or rss >= /, 'the probe line names the new kill condition')
})

test('the worker mirror carries the pulse-void arithmetic (v0.143.0)', () => {
  // the hand-rolled copy must track the pulse, name the knob, void the hold
  // with the same reason shape, and print the one-time GRACE VOID line
  assert.match(HEARTBEAT_WORKER_SRC, /var sgPulseVoidMs = Number\(process\.env\.FLEET_STORM_PULSE_VOID_MS\) \|\| 4000/, 'the void rides the env knob shape with the 4s default')
  assert.match(HEARTBEAT_WORKER_SRC, /function pulseFrozenMs \(t\)/, 'the worker tracks the main pulse itself (the closure appliers live on that thread)')
  assert.match(HEARTBEAT_WORKER_SRC, /pvLast\.sum = sum; pvLast\.at = t/, 'the frozen duration is measured from the last real advance')
  assert.match(HEARTBEAT_WORKER_SRC, /pulseFrozenMs\(Date\.now\(\)\)/, 'the tracking runs on every guard tick (the state stays current between verdicts)')
  assert.match(HEARTBEAT_WORKER_SRC, /pvFrozen >= sgPulseVoidMs/, 'the void is the frozen-duration verdict inside the grace')
  assert.match(HEARTBEAT_WORKER_SRC, /grace void: main pulse frozen/, 'the kill reason names the mechanism')
  assert.match(HEARTBEAT_WORKER_SRC, /GRACE VOID/, 'the one-time void line names itself (the GRACE HOLD precedent)')
  assert.match(HEARTBEAT_WORKER_SRC, /the grace serves a living main/, 'the void line states the premise')
  // the ceiling branch must still sit BEFORE the void branch
  const ceilIdx = HEARTBEAT_WORKER_SRC.indexOf('hard ceiling')
  const voidIdx = HEARTBEAT_WORKER_SRC.indexOf('grace void: main pulse frozen')
  assert.ok(ceilIdx >= 0 && voidIdx >= 0 && ceilIdx < voidIdx, 'the ceiling verdict precedes the void verdict in the act chain')
})

test('the fleet wiring: every valve close sweeps the goal slots (the replan loops die at the closure)', () => {
  const fleetSrc = fs.readFileSync(new URL('../../testbed/fleet19.mjs', import.meta.url), 'utf8')
  const jqSrc = fs.readFileSync(new URL('../../src/lib/jobqueue.mjs', import.meta.url), 'utf8')
  assert.match(fleetSrc, /setFleetGoalSweeper/, 'the fleet wires the sweeper hook')
  assert.match(jqSrc, /export function setFleetGoalSweeper/, 'the hook is exported from the funnel module')
  assert.match(jqSrc, /onState: \(\) =>/, 'the valve fires the sweeper on its own close transitions')
})

test('the fleet wiring: the lag-probe feeder applies the cell verdict and sweeps the goals', () => {
  const fleetSrc = fs.readFileSync(new URL('../../testbed/fleet19.mjs', import.meta.url), 'utf8')
  assert.match(fleetSrc, /onProbeFire/, 'the fleet passes the lag-probe feeder into startHeartbeat')
  assert.match(fleetSrc, /stormCellApply\(\{ cell: stormCell, lastSeq: lagProbeSeq, forceClose: a => allocValve\.valve\.forceClose\(a\) \}\)/, 'the feeder applies the worker verdict to the SINGLETON valve')
  assert.match(fleetSrc, /stormSweepAllGoals/, 'the feeder sweeps every pathfinder goal (the in-flight recompute loops die at the source)')
  assert.match(fleetSrc, /CLOSED \(lag probe\)/, 'the closure line names the feeder (the mine must tell the appliers apart)')
  assert.match(fleetSrc, /onUnfreeze, onProbeFire/, 'both hooks ride the same startHeartbeat call')
  assert.match(fleetSrc, /lagProbeApplied/, 'one worker publish per process -> one feeder application')
})

test('the fleet wiring: the heartbeat forwards every probe fire to onProbeFire (guarded)', () => {
  const hbSrc = fs.readFileSync(new URL('../../src/lib/heartbeat.mjs', import.meta.url), 'utf8')
  assert.match(hbSrc, /onProbeFire = null/, 'the opt exists with the null default')
  assert.match(hbSrc, /onProbeFire\(\{ drift \}\)/, 'the callback receives the measured drift')
  assert.match(hbSrc, /try \{ onProbeFire\(\{ drift \}\) \} catch/, 'a throwing feeder never escapes the probe')
})

test('the lag probe fires onProbeFire on every fire, with the drift, throw-proof', async () => {
  const fires = []
  const hb = startHeartbeat({
    intervalMs: 20000,
    WorkerCtor: FakeWorker,
    probeMs: 25,
    onProbeFire: ({ drift }) => fires.push(drift)
  })
  try {
    await sleep(90)
    assert.ok(fires.length >= 2, `expected >=2 probe fires in 90ms at a 25ms cadence, got ${fires.length}`)
    for (const d of fires) assert.ok(Number.isFinite(d) && d >= 0, 'the drift is a finite non-negative number')
  } finally {
    hb.stop(0)
  }
})

test('a throwing onProbeFire never escapes the probe (the fleet outlives the cure)', async () => {
  const hb = startHeartbeat({
    intervalMs: 20000,
    WorkerCtor: FakeWorker,
    probeMs: 25,
    onProbeFire: () => { throw new Error('the feeder exploded') }
  })
  try {
    await sleep(90)
    // reaching here IS the assertion: the interval callback swallowed the throw
  } finally {
    hb.stop(0)
  }
})
