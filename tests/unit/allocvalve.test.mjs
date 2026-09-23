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
  valveAdmits, valveTransitionLine, valveWorkerCloseLine, createAllocValve,
  stormCellPublish, stormCellApply, startAllocValve,
  STORM_CELL_MAGIC, STORM_CELL_SLOTS,
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

// ---- (v0.104.0) THE AQUIFER GATE: near is not cheap in a flooded region ----
// run93 (35835942682): the storm returned THROUGH the near exemption - the
// kill-window blackbox was all short walks (water:rescue r=1-3, relocate,
// next column alt) across the flooded quarry (24 live hazard cells, rss
// 542M -> 2626M in ~20s). While closed, a near walk whose GOAL sits in live
// hazard water is refused too; the flag comes from the hazard ledger.

test('valveAdmits: the aquifer gate - a near goal in live hazard water is refused while closed (run93 relocation class)', () => {
  assert.equal(valveAdmits({ closed: true, distanceBlocks: 5, goalHazardNear: true }), false, 'the F9 relocation into the flooded quarry: near but flooded')
  assert.equal(valveAdmits({ closed: true, distanceBlocks: 1, goalHazardNear: true }), false, 'even a 1-block step into the flooded cells waits out the closure')
  assert.equal(valveAdmits({ closed: true, distanceBlocks: 141, goalHazardNear: true }), false, 'a LONG flooded walk was already refused (v0.102.0)')
})

test('valveAdmits: the aquifer gate never touches the dry near class or an open valve', () => {
  assert.equal(valveAdmits({ closed: true, distanceBlocks: 5, goalHazardNear: false }), true, 'dry near walks flow exactly as v0.102.0')
  assert.equal(valveAdmits({ closed: true, distanceBlocks: 5 }), true, 'no flag = the legacy byte-for-byte shape')
  assert.equal(valveAdmits({ closed: false, distanceBlocks: 5, goalHazardNear: true }), true, 'an open valve is a no-op even on a flooded goal')
})

test('valveAdmits: the aquifer flag is junk-safe - only a POSITIVE true refuses', () => {
  assert.equal(valveAdmits({ closed: true, distanceBlocks: 5, goalHazardNear: undefined }), true, 'missing flag judges nothing')
  assert.equal(valveAdmits({ closed: true, distanceBlocks: 5, goalHazardNear: null }), true, 'null flag judges nothing')
  assert.equal(valveAdmits({ closed: true, distanceBlocks: 5, goalHazardNear: 'yes' }), true, 'a truthy NON-boolean never invents ledger knowledge')
  assert.equal(valveAdmits({ closed: true, distanceBlocks: 5, goalHazardNear: 1 }), true)
})

// ---- (v0.104.0) forceClose: the external verdict (the worker probe) ----

test('forceClose: the worker verdict closes with the standard semantics', () => {
  const ck = fakeClock()
  const seen = []
  const v = createAllocValve({ now: ck.now, onState: st => seen.push(st) })
  const s = v.forceClose({ rate: 183, rss: 2626, source: 'worker-probe' })
  assert.equal(s.closed, true, 'the worker verdict closes the valve')
  assert.equal(s.lastRss, 2626)
  assert.equal(s.lastRate, 183)
  assert.equal(s.lastSource, 'worker-probe', 'the snapshot names the feeder')
  assert.equal(s.strikes, 1)
  assert.equal(s.closes, 1)
  assert.equal(s.remainingMs, ALLOC_VALVE_COOLDOWN_MS_DEFAULT, 'the full cooldown remains')
  assert.equal(seen.length, 1, 'onState fired once')
  assert.equal(v.stats().workerCloses, 1, 'the worker close is counted apart')
})

test('forceClose: an already-closed valve absorbs the verdict (closes stays put)', () => {
  const ck = fakeClock()
  const v = createAllocValve({ now: ck.now })
  v.forceClose({ rate: 100, rss: 700 })
  ck.tick(1000)
  const s = v.forceClose({ rate: 200, rss: 2600 }) // a second verdict while still closed
  assert.equal(s.closed, true)
  assert.equal(s.closes, 1, 'no double close while closed')
  assert.equal(s.strikes, 1)
  assert.equal(v.stats().workerCloses, 1)
})

test('forceClose: a re-close within 60s escalates exactly like a sampled close', () => {
  const ck = fakeClock()
  const v = createAllocValve({ now: ck.now })
  v.forceClose({ rate: 100, rss: 700 })
  ck.tick(ALLOC_VALVE_COOLDOWN_MS_DEFAULT + 1) // expires, reopen
  const s = v.forceClose({ rate: 150, rss: 900 }) // the storm continues
  assert.equal(s.closed, true)
  assert.equal(s.strikes, 2)
  assert.equal(s.remainingMs, ALLOC_VALVE_ESCALATED_MS_DEFAULT, 'the escalated cooldown')
})

test('forceClose: junk numbers are clamped to 0 - the close decision was the worker\'s', () => {
  const ck = fakeClock()
  const v = createAllocValve({ now: ck.now })
  const s = v.forceClose({ rate: NaN, rss: 'junk' })
  assert.equal(s.closed, true, 'the verdict still applies')
  assert.equal(s.lastRss, 0)
  assert.equal(s.lastRate, 0)
})

// ---- the worker-probe close line ----

test('valveWorkerCloseLine: the named line carries the worker story', () => {
  const line = valveWorkerCloseLine({ st: { closed: true, lastRss: 1711, lastRate: 145, remainingMs: 12000, strikes: 1 }, tsS: 576 })
  assert.match(line, /^\[allocvalve\] CLOSED \(worker probe\): rss 1711M \(\+145MB\/s storm\) - long walks refused 12s \(strike 1, the worker's field-proven verdict applied at the funnel; short walks <= 24b still flow\) ts=576s$/)
})

// ---- the storm cell (the worker->main verdict channel) ----

function freshCell () {
  const cell = new SharedArrayBuffer(STORM_CELL_SLOTS * 4)
  new Int32Array(cell)[0] = STORM_CELL_MAGIC
  return cell
}

test('stormCellPublish: fields first, seq last, exactly the pinned layout', () => {
  const cell = freshCell()
  assert.equal(stormCellPublish({ cell, rate: 145.4, rss: 1710.6, tsS: 576.2 }), true)
  const c = new Int32Array(cell)
  assert.equal(c[0], STORM_CELL_MAGIC)
  assert.equal(c[1], 1, 'the first publish leaves seq at 1')
  assert.equal(c[2], 145)
  assert.equal(c[3], 1711)
  assert.equal(c[4], 576)
  assert.equal(stormCellPublish({ cell, rate: 183, rss: 2626, tsS: 581 }), true)
  assert.equal(new Int32Array(cell)[1], 2, 'the second publish increments seq')
})

test('stormCellPublish: junk never writes, never throws', () => {
  assert.equal(stormCellPublish({ cell: null, rate: 100, rss: 700, tsS: 1 }), false)
  assert.equal(stormCellPublish({ cell: new SharedArrayBuffer(8), rate: 100, rss: 700, tsS: 1 }), false, 'too short')
  const dead = new SharedArrayBuffer(32) // no MAGIC
  assert.equal(stormCellPublish({ cell: dead, rate: 100, rss: 700, tsS: 1 }), false)
  assert.equal(new Int32Array(dead)[1], 0, 'nothing written')
  const cell = freshCell()
  assert.equal(stormCellPublish({ cell, rate: 0, rss: 700, tsS: 1 }), false, 'rate 0 is not a verdict')
  assert.equal(stormCellPublish({ cell, rate: -5, rss: 700, tsS: 1 }), false)
  assert.equal(stormCellPublish({ cell, rate: 100, rss: NaN, tsS: 1 }), false)
  assert.equal(new Int32Array(cell)[1], 0, 'junk verdicts leave seq untouched')
})

test('stormCellApply: the newest verdict applies exactly once per seq', () => {
  const cell = freshCell()
  stormCellPublish({ cell, rate: 145, rss: 1711, tsS: 576 })
  const closes = []
  const fc = a => { closes.push(a); return { closed: true, strike: closes.length } }
  const r1 = stormCellApply({ cell, lastSeq: 0, forceClose: fc })
  assert.equal(r1.applied, true)
  assert.equal(r1.seq, 1)
  assert.equal(closes.length, 1)
  assert.equal(closes[0].rate, 145)
  assert.equal(closes[0].rss, 1711)
  assert.equal(closes[0].source, 'worker-probe')
  const r2 = stormCellApply({ cell, lastSeq: r1.seq, forceClose: fc }) // the same seq polled again
  assert.equal(r2.applied, false, 'the verdict is applied exactly once')
  assert.equal(closes.length, 1)
})

test('stormCellApply: LATEST-WINS - an unread verdict is overwritten by a newer publish', () => {
  const cell = freshCell()
  stormCellPublish({ cell, rate: 145, rss: 1711, tsS: 576 })
  stormCellPublish({ cell, rate: 183, rss: 2626, tsS: 581 })
  const closes = []
  // one read after two publishes: the cell carries seq 2 with the LATEST
  // fields - a storm channel needs the freshest verdict, not the history
  const r1 = stormCellApply({ cell, lastSeq: 0, forceClose: a => { closes.push(a); return {} } })
  assert.equal(r1.applied, true)
  assert.equal(r1.seq, 2)
  assert.equal(closes[0].rss, 2626, 'the LATEST verdict applied')
  const r2 = stormCellApply({ cell, lastSeq: r1.seq, forceClose: () => {} })
  assert.equal(r2.applied, false, 'nothing left to apply')
  // the write ORDER contract (fields first, seq last) means a reader that
  // catches the writer mid-publish reads a torn seq pair and skips - the
  // verdict stays in the cell and applies on the next poll; not unit-pinned
  // (a real race), carried by the mirror's write order and the double read.
})

test('stormCellApply: junk cells and a missing forceClose are honest no-ops', () => {
  const dead = new SharedArrayBuffer(32) // no MAGIC
  assert.equal(stormCellApply({ cell: dead, lastSeq: 0, forceClose: () => {} }).applied, false)
  assert.equal(stormCellApply({ cell: null, lastSeq: 0, forceClose: () => {} }).applied, false)
  const cell = freshCell()
  stormCellPublish({ cell, rate: 145, rss: 1711, tsS: 576 })
  assert.equal(stormCellApply({ cell, lastSeq: 0, forceClose: null }).applied, false, 'no closer, no apply')
  const noThrow = stormCellApply({ cell, lastSeq: 0, forceClose: () => { throw new Error('boom') } })
  assert.equal(noThrow.applied, false, 'a throwing closer never propagates')
})

// ---- startAllocValve: ONE VALVE, TWO FEEDERS (the run93 wiring fix) ----

test('startAllocValve: the given instance IS the fed instance (run93 D1 pin)', async () => {
  const ck = fakeClock()
  const v = createAllocValve({ now: ck.now })
  const cell = freshCell()
  stormCellPublish({ cell, rate: 145, rss: 1711, tsS: 576 })
  const lines = []
  const h = startAllocValve({ valve: v, intervalMs: 250, stormCell: cell, onLine: l => lines.push(l) })
  try {
    assert.equal(h.valve, v, 'the handle exposes the CALLER\'S valve - the ticker must feed the consulted instance')
    await new Promise(r => setTimeout(r, 800)) // one 250ms tick minimum
    assert.equal(v.consult().closed, true, 'the worker verdict closed the GIVEN valve through the ticker poll')
    assert.equal(v.stats().workerCloses, 1)
    assert.ok(lines.some(l => l.includes('CLOSED (worker probe): rss 1711M (+145MB/s storm)')), 'the named worker-probe line logged')
  } finally { h.stop() }
})

test('startAllocValve: without a valve a private one is created and still fed (the legacy shape)', async () => {
  const cell = freshCell()
  stormCellPublish({ cell, rate: 145, rss: 1711, tsS: 576 })
  const h = startAllocValve({ intervalMs: 250, stormCell: cell })
  try {
    await new Promise(r => setTimeout(r, 800))
    assert.equal(h.valve.consult().closed, true, 'the private valve closed through the poll')
  } finally { h.stop() }
})

test('startAllocValve: one close, one line - the sampled close and the poll never double-book', async () => {
  const ck = fakeClock()
  const v = createAllocValve({ now: ck.now, rateMbS: 1, floorMb: 1 }) // every 2+-sample window is a storm verdict under these knobs
  const cell = freshCell()
  stormCellPublish({ cell, rate: 145, rss: 1711, tsS: 576 })
  const lines = []
  const h = startAllocValve({ valve: v, intervalMs: 250, stormCell: cell, onLine: l => lines.push(l) })
  try {
    // tick 1: the FIRST sample alone never storms (the window needs two),
    // so the poll applies the worker verdict first; ticks 2-3: the sampled
    // storm is absorbed INSIDE the cooldown, no second close, no second line
    await new Promise(r => setTimeout(r, 900))
    assert.equal(v.consult().closed, true)
    assert.equal(v.stats().closes, 1, 'exactly one close across the ticks')
    assert.equal(v.stats().workerCloses, 1, 'the close is the worker-probe one (the poll wins the first tick)')
    assert.equal(lines.filter(l => l.includes('CLOSED')).length, 1, 'one close, one line')
    assert.ok(lines[0].includes('CLOSED (worker probe):'), 'the line names the worker-probe feeder')
  } finally { h.stop() }
})
