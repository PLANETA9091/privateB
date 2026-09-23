// Tests for src/lib/allocvalve.mjs - THE ALLOCATION VALVE (v0.102.0).
//
// run92 (35829873166): the main thread allocated ~1.9GB in 10s (190MB/s) at
// ts~445s while STILL TICKING (mainLate 2006ms, the blackbox labels marching
// pf:queue/pf:goal walk to chest <- water:rescue <- next column alt <- climb
// at normal cadence) and the worker stormguard's second-strike SIGTERM erased
// a probable NORMAL END at 510/600s. The valve is the CURE layer under the
// amputation layer: cut the A* fuel at the gotoSafe funnel at the FIRST storm
// signature, let GC drain, reopen. The tests pin the detector arithmetic
// (reused from stormguard's createStormGuard), the closure/escalation state
// machine, the admission rule, and the log-line format.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  valveAdmits, valveTransitionLine, createAllocValve,
  ALLOC_VALVE_FLOOR_MB_DEFAULT, ALLOC_VALVE_COOLDOWN_MS_DEFAULT,
  ALLOC_VALVE_ESCALATED_MS_DEFAULT, ALLOC_VALVE_RECLOSE_WINDOW_MS,
  ALLOC_VALVE_NEAR_BLOCKS_DEFAULT
} from '../../src/lib/allocvalve.mjs'
import { STORM_FLOOR_MB_DEFAULT } from '../../src/lib/stormguard.mjs'

// ---- admission ----

test('valveAdmits: an open valve admits everything (the consult is a no-op)', () => {
  assert.equal(valveAdmits({ closed: false, distanceBlocks: null }), true)
  assert.equal(valveAdmits({ closed: false, distanceBlocks: 100000 }), true)
  assert.equal(valveAdmits({}), true, 'junk options read as open')
})

test('valveAdmits: a closed valve refuses far walks and admits near ones', () => {
  assert.equal(valveAdmits({ closed: true, distanceBlocks: 24, nearBlocks: 24 }), true, 'AT the bound admits (<=)')
  assert.equal(valveAdmits({ closed: true, distanceBlocks: 24.0001, nearBlocks: 24 }), false)
  assert.equal(valveAdmits({ closed: true, distanceBlocks: 141, nearBlocks: 24 }), false, 'run92 chest-walk class')
  assert.equal(valveAdmits({ closed: true, distanceBlocks: 5, nearBlocks: 24 }), true, 'the rescue/climb class flows')
})

test('valveAdmits: an unmeasurable distance is not provably near - refused while closed', () => {
  assert.equal(valveAdmits({ closed: true, distanceBlocks: null }), false)
  assert.equal(valveAdmits({ closed: true, distanceBlocks: NaN }), false)
  assert.equal(valveAdmits({ closed: true, distanceBlocks: -3 }), false)
  assert.equal(valveAdmits({ closed: true, distanceBlocks: 'junk' }), false)
})

// ---- the state machine (fake clock) ----

function fakeClock () {
  const state = { t: 1_000_000 }
  return { now: () => state.t, tick: ms => { state.t += ms } }
}

test('alloc valve: a fresh valve is open with zero strikes', () => {
  const ck = fakeClock()
  const v = createAllocValve({ now: ck.now })
  const s = v.consult()
  assert.equal(s.closed, false)
  assert.equal(s.remainingMs, 0)
  assert.equal(s.strikes, 0)
  assert.equal(s.lastRate, 0)
})

test('alloc valve: healthy growth under the rate never closes', () => {
  const ck = fakeClock()
  const v = createAllocValve({ now: ck.now })
  v.sample(500)
  ck.tick(1000)
  const s = v.sample(510) // 10MB/s << 40
  assert.equal(s.closed, false)
  assert.equal(s.strikes, 0)
})

test('alloc valve: sub-floor growth never closes (the floor is the layering)', () => {
  const ck = fakeClock()
  const v = createAllocValve({ now: ck.now, floorMb: ALLOC_VALVE_FLOOR_MB_DEFAULT })
  v.sample(100)
  ck.tick(1000)
  const s = v.sample(500) // 400MB/s >= rate BUT rss 500 < floor 600 - a burst under the floor is not a verdict
  assert.equal(s.closed, false, 'the rate alone never closes - the floor gates it')
})

test('alloc valve: the run92 signature closes (500M -> 1500M in 1s) with the story on the snapshot', () => {
  const ck = fakeClock()
  const seen = []
  const v = createAllocValve({ now: ck.now, onState: st => seen.push(st) })
  v.sample(500)
  ck.tick(1000)
  const s = v.sample(1500)
  assert.equal(s.closed, true, 'the storm signature closes the valve')
  assert.equal(s.lastRss, 1500)
  assert.equal(s.lastRate, 1000, '1000MB/s over the 1s window')
  assert.equal(s.strikes, 1)
  assert.equal(s.closes, 1)
  assert.equal(s.remainingMs, ALLOC_VALVE_COOLDOWN_MS_DEFAULT - 0, 'the full cooldown remains')
  assert.equal(seen.length, 1, 'onState fired once')
  assert.equal(seen[0].escalated, false, 'the first close is not escalated')
  assert.equal(seen[0].verdict.gain, 1000)
})

test('alloc valve: the closure expires (12s) and the funnel flows again', () => {
  const ck = fakeClock()
  const v = createAllocValve({ now: ck.now })
  v.sample(500)
  ck.tick(1000)
  v.sample(1500)
  ck.tick(ALLOC_VALVE_COOLDOWN_MS_DEFAULT - 1000)
  assert.equal(v.consult().closed, true, 'still closed inside the cooldown')
  ck.tick(1001)
  assert.equal(v.consult().closed, false, 'open again at expiry')
})

test('alloc valve: a re-close within 60s escalates to 30s', () => {
  const ck = fakeClock()
  const v = createAllocValve({ now: ck.now })
  v.sample(500)
  ck.tick(1000)
  v.sample(1500) // close 1: 12s
  ck.tick(ALLOC_VALVE_COOLDOWN_MS_DEFAULT + 1) // expires, reopen
  v.sample(1500) // the storm continues: rss still rising? The streak needs a RENEWED rise.
  ck.tick(1000)
  const s = v.sample(1600) // +100MB/s, within the 60s reclose window
  assert.equal(s.closed, true)
  assert.equal(s.strikes, 2)
  assert.equal(s.closes, 2)
  assert.equal(s.remainingMs, ALLOC_VALVE_ESCALATED_MS_DEFAULT, 'the escalated cooldown')
})

test('alloc valve: a close long after the last one is NOT escalated', () => {
  const ck = fakeClock()
  const v = createAllocValve({ now: ck.now })
  v.sample(500)
  ck.tick(1000)
  v.sample(1500)
  ck.tick(ALLOC_VALVE_RECLOSE_WINDOW_MS + ALLOC_VALVE_COOLDOWN_MS_DEFAULT) // 60s+12s: the window and the closure both passed
  v.sample(1500)
  ck.tick(1000)
  const s = v.sample(1600)
  assert.equal(s.closed, true)
  assert.equal(s.remainingMs, ALLOC_VALVE_COOLDOWN_MS_DEFAULT, 'the plain cooldown again')
})

test('alloc valve: a storm verdict DURING closure is absorbed (closes stays 1)', () => {
  const ck = fakeClock()
  const v = createAllocValve({ now: ck.now })
  v.sample(500)
  ck.tick(1000)
  v.sample(1500) // closed
  ck.tick(1000)
  const s = v.sample(2500) // still a storm verdict, still inside the cooldown
  assert.equal(s.closed, true)
  assert.equal(s.closes, 1, 'no new close while closed')
  assert.equal(s.strikes, 1)
})

test('alloc valve: junk rss never closes', () => {
  const ck = fakeClock()
  const v = createAllocValve({ now: ck.now })
  assert.equal(v.sample(NaN).closed, false)
  assert.equal(v.sample(-5).closed, false)
  assert.equal(v.sample('junk').closed, false)
  ck.tick(1000)
  v.sample(1300) // a lone good sample after junk: window has 1 entry
  assert.equal(v.consult().closed, false)
})

test('alloc valve: reset clears everything', () => {
  const ck = fakeClock()
  const v = createAllocValve({ now: ck.now })
  v.sample(500)
  ck.tick(1000)
  v.sample(1500)
  assert.equal(v.consult().closed, true)
  v.reset()
  assert.equal(v.consult().closed, false)
  assert.equal(v.consult().strikes, 0)
  assert.equal(v.stats().closes, 0)
})

// ---- the layering pin ----

test('the valve floor sits UNDER the worker stormguard floor (the cure acts before the amputation)', () => {
  assert.ok(ALLOC_VALVE_FLOOR_MB_DEFAULT < STORM_FLOOR_MB_DEFAULT, `${ALLOC_VALVE_FLOOR_MB_DEFAULT} < ${STORM_FLOOR_MB_DEFAULT}`)
  assert.ok(ALLOC_VALVE_NEAR_BLOCKS_DEFAULT > 12, 'rescues (shore r<=12) must fit inside the near bound')
})

// ---- the log-line format (what the log-reading agents parse) ----

test('valveTransitionLine: the CLOSED line carries the storm numbers', () => {
  const line = valveTransitionLine({ wasClosed: false, st: { closed: true, lastRss: 1312, lastRate: 186, remainingMs: 12000, strikes: 1 }, rssM: 1312, uptimeS: 445 })
  assert.match(line, /^\[allocvalve\] CLOSED: rss 1312M \(\+186MB\/s storm\) - long walks refused 12s \(strike 1, the A\* fuel cut; short walks <= 24b still flow\) ts=445s$/)
})

test('valveTransitionLine: the OPEN line carries the recovery', () => {
  const line = valveTransitionLine({ wasClosed: true, st: { closed: false, strikes: 1 }, rssM: 402.4, uptimeS: 458 })
  assert.match(line, /^\[allocvalve\] OPEN: rss 402M after closure \(strikes 1\) - the funnel flows again ts=458s$/)
})

test('valveTransitionLine: no transition, no line', () => {
  assert.equal(valveTransitionLine({ wasClosed: false, st: { closed: false }, rssM: 400, uptimeS: 1 }), null)
  assert.equal(valveTransitionLine({ wasClosed: true, st: { closed: true }, rssM: 1400, uptimeS: 2 }), null)
})
