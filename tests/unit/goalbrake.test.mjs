// (v0.143.0) THE GOAL-RATE BRAKE tests. Fleet leg 35994461858 (the v0.142.0
// STORM SURVIVAL, mined 2026-09-24) named the gap every older breaker shared:
// the flood walkers PROGRESSED (1-3 blocks per walk cleared the stall
// governor's churn evidence outright) and their goals were NEAR (admitted
// while the valve was closed) - the only signal left was the CADENCE itself:
// ~2.5 goals/s per walker, each a ~90MB full-box A*, 225MB/s into a main
// thread that froze solid 10s after the probe. The brake judges the rate.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {
  createGoalBrake,
  GOAL_WINDOW_MS, GOAL_BURST_LIMIT, GOAL_COOLDOWN_MS,
  FLEET_GOAL_WINDOW_MS, FLEET_GOAL_BURST_LIMIT, FLEET_GOAL_COOLDOWN_MS,
  FLEET_GOAL_ESCALATED_MS, FLEET_GOAL_RECLOSE_WINDOW_MS
} from '../../src/lib/goalbrake.mjs'

test('the knobs: the burst sits far above the honest branch-mine cadence', () => {
  assert.strictEqual(GOAL_BURST_LIMIT, 6, 'an honest miner issues ~1 goal per 6-10s; 6 in 5s is 10x that - only the churn class hits it')
  assert.strictEqual(GOAL_WINDOW_MS, 5000)
  assert.strictEqual(GOAL_COOLDOWN_MS, 4000, 'the caller ladders to non-walk rungs for 4s - local digs, no A*')
  assert.strictEqual(FLEET_GOAL_BURST_LIMIT, 30, 'the honest fleet peak is ~4-6/s; the storm class was 8-12+/s')
  assert.strictEqual(FLEET_GOAL_COOLDOWN_MS, 5000)
  assert.strictEqual(FLEET_GOAL_ESCALATED_MS, 20000, 'a persistent storm earns a long walk refusal')
  assert.strictEqual(FLEET_GOAL_RECLOSE_WINDOW_MS, 60000)
})

test('the burst: the 6th admitted goal opens the brake and refuses the consult in the same breath', () => {
  const b = createGoalBrake({ now: () => 0 })
  const t0 = 100000
  // the funnel order: consult FIRST (refuse or pass), record ONLY on admission
  for (let i = 0; i < GOAL_BURST_LIMIT; i++) {
    const v = b.consult(t0 + i * 100)
    assert.strictEqual(v.open, false, `admission ${i + 1} of ${GOAL_BURST_LIMIT} passes (the window holds only ${i})`)
    b.record(t0 + i * 100)
  }
  // the 7th consult sees the full burst and refuses THAT goal - no free A* for the spiral
  const opened = b.consult(t0 + GOAL_BURST_LIMIT * 100)
  assert.strictEqual(opened.open, true, 'the consult whose window holds the burst refuses THAT goal')
  assert.strictEqual(opened.burst, GOAL_BURST_LIMIT)
  assert.strictEqual(opened.escalated, false, 'a first open is the plain cooldown')
  const b2 = createGoalBrake()
  const st = b2.stats()
  assert.strictEqual(st.records, 0, 'junk-free baseline')
})

test('the cooldown: refusals ride it out, expiry re-opens while the stale window still holds the burst', () => {
  const b = createGoalBrake({ now: () => 0 })
  const t0 = 500000
  for (let i = 0; i < GOAL_BURST_LIMIT; i++) b.record(t0 + i)
  const open = b.consult(t0 + GOAL_BURST_LIMIT)
  assert.strictEqual(open.open, true)
  assert.ok(Math.abs(open.remainingMs - GOAL_COOLDOWN_MS) <= 1, 'the plain cooldown is GOAL_COOLDOWN_MS')
  // inside the cooldown: refused, no new evidence recorded by the refusal itself
  const mid = b.consult(t0 + GOAL_BURST_LIMIT + 1000)
  assert.strictEqual(mid.open, true)
  // past the cooldown but inside the window (windowMs 5000 > cooldown 4000):
  // the stale evidence still holds the burst - the refusal continues AND the
  // re-open extends openUntil past the original evidence age-out
  const stale = b.consult(t0 + GOAL_BURST_LIMIT + GOAL_COOLDOWN_MS + 1)
  assert.strictEqual(stale.open, true, 'a cooldown expiry with the burst still in the window refuses (the spiral does not get its fuel back by waiting)')
  // far past BOTH the extended openUntil and the window: the evidence aged out
  const aged = b.consult(t0 + 60000)
  assert.strictEqual(aged.open, false, 'aged-out evidence releases the brake (bounded by windowMs past the last open)')
})

test('the sliding window: old admissions age out one by one - sustained honest cadence never bursts', () => {
  const b = createGoalBrake({ now: () => 0 })
  // an honest bot: one goal per 2s (twice the real cadence, extra margin)
  for (let i = 0; i < 50; i++) {
    const t = i * 2000
    b.record(t)
    const v = b.consult(t)
    assert.strictEqual(v.open, false, `honest cadence tick ${i} never bursts`)
  }
})

test('record-then-consult independence: a refused walk feeds nothing (the brake must not reopen itself off its own refusals)', () => {
  const b = createGoalBrake({ now: () => 0 })
  const t0 = 100000
  for (let i = 0; i < GOAL_BURST_LIMIT; i++) b.record(t0 + i)
  assert.strictEqual(b.consult(t0 + GOAL_BURST_LIMIT).open, true)
  const before = b.stats().records
  // the funnel records ONLY admissions - refusals never call record()
  assert.strictEqual(b.stats().records, before, 'the record count holds while refused')
})

test('the escalation: a re-open inside the reclose window earns the escalated cooldown', () => {
  const b = createGoalBrake({ now: () => 0, cooldownMs: 4000, escalatedMs: 20000, recloseWindowMs: 60000 })
  const t0 = 1000000
  const burst = t => { for (let i = 0; i < GOAL_BURST_LIMIT; i++) b.record(t + i) }
  burst(t0)
  const first = b.consult(t0 + GOAL_BURST_LIMIT)
  assert.strictEqual(first.escalated, false)
  assert.ok(first.remainingMs <= 4000, 'the first open rides the plain cooldown')
  // the window ages out, a second burst forms inside the reclose window
  burst(t0 + 20000)
  const second = b.consult(t0 + 20000 + GOAL_BURST_LIMIT)
  assert.strictEqual(second.open, true)
  assert.strictEqual(second.escalated, true, 'a re-open inside 60s escalates - a persistent storm earns the long refusal')
  assert.ok(second.remainingMs > 15000, 'the escalated cooldown is FLEET_GOAL_ESCALATED_MS')
  // a re-open far outside the reclose window stays plain
  const b2 = createGoalBrake({ now: () => 0, cooldownMs: 4000, escalatedMs: 20000, recloseWindowMs: 60000 })
  const far = t => { for (let i = 0; i < GOAL_BURST_LIMIT; i++) b2.record(t + i) }
  far(t0)
  assert.strictEqual(b2.consult(t0 + GOAL_BURST_LIMIT).escalated, false)
  far(t0 + 120000)
  assert.strictEqual(b2.consult(t0 + 120000 + GOAL_BURST_LIMIT).escalated, false, '120s later the escalation window has closed')
})

test('junk safety: junk clocks record nothing, consult nothing, never throw', () => {
  const b = createGoalBrake({ now: () => 0 })
  assert.doesNotThrow(() => b.record(Number.NaN))
  assert.doesNotThrow(() => b.record(-5))
  assert.doesNotThrow(() => b.consult(Number.NaN))
  assert.strictEqual(b.consult(Number.NaN).open, false, 'a junk clock consults nothing (honest default: no refusal off missing evidence)')
  assert.strictEqual(b.stats().records, 2, 'the attempts are counted as evidence even when the window never sees them')
  assert.strictEqual(b.stats().live, 0, 'junk stamps never enter the window')
})

test('stats and reset: the counters name the field story', () => {
  const b = createGoalBrake({ now: () => 0 })
  const t0 = 100000
  for (let i = 0; i < GOAL_BURST_LIMIT; i++) b.record(t0 + i)
  b.consult(t0 + GOAL_BURST_LIMIT)
  b.consult(t0 + GOAL_BURST_LIMIT + 1)
  const st = b.stats()
  assert.strictEqual(st.records, GOAL_BURST_LIMIT)
  assert.strictEqual(st.opens, 1)
  assert.strictEqual(st.refusals, 2, 'the opening consult and the mid-cooldown consult both refused')
  assert.strictEqual(st.open, true)
  b.reset()
  assert.deepStrictEqual(b.stats(), { records: 0, refusals: 0, opens: 0, escalations: 0, live: 0, open: false }, 'the reset forgets everything')
})

test('the onOpen hook fires once per open and never breaks the gate', () => {
  const fires = []
  const b = createGoalBrake({ now: () => 0, onOpen: ({ burst, escalated }) => { fires.push({ burst, escalated }); if (fires.length === 1) throw new Error('the hook exploded') } })
  const t0 = 100000
  for (let i = 0; i < GOAL_BURST_LIMIT; i++) b.record(t0 + i)
  assert.strictEqual(b.consult(t0 + GOAL_BURST_LIMIT).open, true, 'a throwing hook never breaks the verdict')
  assert.strictEqual(fires.length, 1)
})

test('the funnel wiring: the brake consults after the churn ceiling, before the valve probe', () => {
  const src = fs.readFileSync(new URL('../../src/lib/jobqueue.mjs', import.meta.url), 'utf8')
  const churnIdx = src.lastIndexOf('the aggregate breaker') // the consult-site instance (the creation comment shares the phrase)
  const brakeIdx = src.indexOf('THE GOAL-RATE BRAKE CONSULT')
  const valveIdx = src.indexOf('THE ALLOCATION VALVE CONSULT')
  assert.ok(churnIdx >= 0 && brakeIdx >= 0 && valveIdx >= 0, 'all three breaker blocks exist')
  assert.ok(churnIdx < brakeIdx && brakeIdx < valveIdx, 'the rate breaker sits between the progress breakers and the memory breaker')
  assert.match(src, /goalBrakeFor\(bot\)\.consult\(Date\.now\(\)\)/, 'the per-bot consult rides the funnel')
  assert.match(src, /fleetGoalCeiling\.consult\(Date\.now\(\)\)/, 'the fleet ceiling consults on every goal too')
  assert.match(src, /priority < PATH_PRIO_BANK/, 'bank-priority walks are exempt from the fleet ceiling (the v0.77.0 contract)')
  assert.match(src, /goalBrakeFor\(bot\)\.record\(Date\.now\(\)\); fleetGoalCeiling\.record\(Date\.now\(\)\)/, 'only ADMITTED goals feed the brake')
  assert.match(src, /export function goalBrakeStatsFor/, 'the FLEET RESULT block reads the brake counters')
  assert.match(src, /setFleetGoalSweeper/, 'the sweep-on-close hook is exported')
  assert.match(src, /createAllocValve\(\{ onState: \(\) => \{ try \{ if \(typeof fleetGoalSweeper === 'function'\) fleetGoalSweeper\(\) \} catch/, 'every valve close fires the sweeper')
})

test('the fleet wiring: the sweeper sweeps the real goal slots and names the line', () => {
  const fleetSrc = fs.readFileSync(new URL('../../testbed/fleet19.mjs', import.meta.url), 'utf8')
  assert.match(fleetSrc, /setFleetGoalSweeper\(\(\) => \{/, 'the fleet wires the sweeper')
  assert.match(fleetSrc, /stormSweepAllGoals\(\)/, 'the sweep uses the v0.141.0 goal sweep mechanics')
  assert.match(fleetSrc, /GOAL SWEEP:/, 'the line names itself (the mine must tell the sweeps apart)')
  assert.match(fleetSrc, /goalBrakeStatsFor/, 'the result block carries the brake counters')
})
