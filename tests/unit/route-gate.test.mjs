// (v0.385.0) THE ROUTE GATE pins - the repeat-re-entry cure. Face 36802577873
// (F19 x5 + F14 x4): every release re-armed the walk, the resumed route grazed
// the flooded pocket rim again, and a NEW cell paged a NEW rescue - the walk
// pathing read the ledger at the GOAL (mapTargetFor, digShaft, the closed-
// valve aquifer read) but never along the ROUTE. The cure: routeHazardVerdict
// (pure, in drowning.mjs) scans the pathfinder's planned waypoints against the
// SAME hazardNear reader the goal gates read and vetoes APPROACH, not
// presence - a route that dives deeper into live hazard water than the bot
// already stands refuses; the escape leg and the lateral rim transit stay free.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  routeHazardVerdict,
  recordWaterHazard,
  nearWaterHazard,
  hazardZones,
  HazardLedger,
  ROUTE_SCAN_MAX_POINTS,
  ROUTE_APPROACH_GRACE_BLOCKS
} from '../../src/lib/drowning.mjs'

const NOW = 1000000
// the face-19 pocket: three fresh rim records on one flooded line (x -123..-110)
const POCKET = [
  { x: -123, y: 62, z: 379 },
  { x: -115, y: 62, z: 376 },
  { x: -110, y: 62, z: 375 }
]

// the FLEET-shaped reader: a shared HazardLedger with a frozen clock - the
// same near() closure fleet19 installs via setFleetHazardNear (cells AND the
// zone envelopes derived per call), not the bare record reader
function pocketNear () {
  const ledger = new HazardLedger({ now: () => NOW })
  for (const c of POCKET) ledger.record(c)
  return pos => ledger.near(pos)
}

test('route gate: the F19 shape - a clean start walking INTO the pocket refuses at the crossing', () => {
  const near = pocketNear()
  const route = [
    { x: -110, y: 62, z: 370 },
    { x: -110, y: 62, z: 372 },
    { x: -110, y: 62, z: 374 },
    { x: -110, y: 62, z: 375 },
    { x: -110, y: 62, z: 376 }
  ]
  const v = routeHazardVerdict({ points: route, start: { x: -110, y: 62, z: 366 }, hazardNear: near })
  assert.ok(v, 'a route from dry land into a live pocket must condemn')
  assert.equal(v.index, 1, 'the FIRST wet waypoint condemns (d 3.0 at z 372... the 4b radius reads the entry, not the shore)')
  assert.equal(v.point.x, -110)
  assert.equal(v.startDepth, null, 'the start was clean - the entry law owns the verdict')
  assert.equal(v.zone, false, 'three point records, but the cluster needs the zone build - this hit is the point tier')
})

test('route gate: the escape leg - the released rim bot walking OUT is free', () => {
  const near = pocketNear()
  // the released bot stands adjacent to its own fresh record (d ~1.4)
  const route = [
    { x: -108, y: 62, z: 374 },
    { x: -106, y: 62, z: 372 },
    { x: -104, y: 62, z: 370 },
    { x: -102, y: 62, z: 368 }
  ]
  const v = routeHazardVerdict({ points: route, start: { x: -109, y: 62, z: 376 }, hazardNear: near })
  assert.equal(v, null, 'the walk OUT of the rim must never refuse - the bot has to be able to leave')
})

test('route gate: the dive - the rim bot re-entering its own pocket refuses', () => {
  const near = pocketNear()
  const route = [
    { x: -109, y: 62, z: 376 },
    { x: -110, y: 62, z: 376 },
    { x: -110, y: 62, z: 375 },
    { x: -110, y: 61, z: 375 }
  ]
  const v = routeHazardVerdict({ points: route, start: { x: -109, y: 62, z: 376 }, hazardNear: near })
  assert.ok(v, 'the route back INTO the water must condemn')
  assert.equal(v.startDepth != null, true, 'the start stood in adjacency - the depth law, not the entry law')
  assert.ok(v.d < v.startDepth - ROUTE_APPROACH_GRACE_BLOCKS, 'the condemned waypoint is deeper than the start by more than the grace')
})

test('route gate: the zone tier - a route through the pocket envelope condemns as a zone', () => {
  const near = pocketNear()
  // the deterministic pocket geometry: three records cluster to ONE envelope
  // (center ~[-116, 376.7], radius ~11.4 with the margin) - the cell (-108,
  // 62, 371) sits inside the envelope but OUTSIDE every point record's 4b
  // radius (nearest record d ~4.47), so only the zone tier can condemn it
  let ledger = []
  for (const c of POCKET) ledger = recordWaterHazard(ledger, c, NOW)
  const zones = hazardZones(ledger, NOW)
  assert.equal(zones.length, 1, 'three records within 12b cluster into ONE zone envelope')
  assert.equal(near({ x: -101, y: 62, z: 376 }), null, 'precondition: the start stands outside every tier (the entry law owns this walk)')
  assert.equal(near({ x: -104, y: 62, z: 372 }), null, 'precondition: the first waypoint is also clean - the envelope does not reach')
  assert.equal(near({ x: -108, y: 62, z: 371 })?.zone, true, 'precondition: the fleet reader\'s zone tier fires on the condemned cell')
  const v = routeHazardVerdict({
    points: [{ x: -104, y: 62, z: 372 }, { x: -108, y: 62, z: 371 }],
    start: { x: -101, y: 62, z: 376 },
    hazardNear: near
  })
  assert.ok(v, 'a waypoint inside the envelope condemns even when the point tier is quiet')
  assert.equal(v.zone, true, 'the hit is the zone tier - the envelope owns the mouth')
  assert.equal(v.index, 1, 'the second waypoint is the condemned one')
})

test('route gate: the grace - a lateral rim transit at the start\'s own depth stays free', () => {
  const near = pocketNear()
  // the bot walks ALONG the rim, never deeper than where it stands (grace 1)
  const route = [
    { x: -112, y: 62, z: 375 },
    { x: -113, y: 62, z: 375 },
    { x: -114, y: 62, z: 375 }
  ]
  const v = routeHazardVerdict({ points: route, start: { x: -111, y: 62, z: 375 }, hazardNear: near })
  assert.equal(v, null, 'a rim transit that never dives deeper than the start is the release shape, not a re-entry')
})

test('route gate: the expired record is nobody\'s hazard - the TTL owns the veto', () => {
  let ledger = []
  for (const c of POCKET) ledger = recordWaterHazard(ledger, c, NOW)
  const staleNear = pos => nearWaterHazard(ledger, pos, NOW + 121 * 1000) // past the 120s tenure
  const route = [{ x: -110, y: 62, z: 370 }, { x: -110, y: 62, z: 375 }]
  const v = routeHazardVerdict({ points: route, start: { x: -110, y: 62, z: 366 }, hazardNear: staleNear })
  assert.equal(v, null, 'expired records never refuse - the pocket forgets, the walk resumes')
})

test('route gate: the junk battery - everything malformed judges NOTHING', () => {
  const near = pocketNear()
  assert.equal(routeHazardVerdict({}), null, 'no args at all')
  assert.equal(routeHazardVerdict({ points: null, hazardNear: near }), null, 'null points')
  assert.equal(routeHazardVerdict({ points: [], hazardNear: near }), null, 'empty points')
  assert.equal(routeHazardVerdict({ points: 'nope', hazardNear: near }), null, 'non-array points')
  assert.equal(routeHazardVerdict({ points: [{ x: -110, y: 62, z: 375 }], hazardNear: null }), null, 'no reader')
  assert.equal(routeHazardVerdict({ points: [{ x: -110, y: 62, z: 375 }], hazardNear: 'junk' }), null, 'non-function reader')
  assert.equal(routeHazardVerdict({ points: [{ x: NaN, y: 62, z: 375 }, { x: -110, y: Infinity, z: 375 }], start: { x: 0, y: 0, z: 0 }, hazardNear: near }), null, 'non-finite waypoints judge nothing')
  assert.equal(routeHazardVerdict({ points: [null, undefined], start: { x: 0, y: 0, z: 0 }, hazardNear: near }), null, 'null waypoints skip')
})

test('route gate: the throwing reader abstains the WHOLE verdict (fail-open)', () => {
  const route = [{ x: -110, y: 62, z: 370 }, { x: -110, y: 62, z: 375 }]
  assert.equal(routeHazardVerdict({ points: route, start: { x: -110, y: 62, z: 366 }, hazardNear: () => { throw new Error('ledger down') } }), null,
    'a throwing reader never invents a refusal - the goal-gate law holds one tier deeper')
})

test('route gate: the first waypoint is never a route sin (the bot\'s own cell)', () => {
  const near = pocketNear()
  // the start read is JUNK (no start passed) but the route BEGINS on the wet
  // record cell itself: index 0 must stay exempt even so - the bot's standing
  // cell is where the sentry, not the route gate, keeps the law
  const v = routeHazardVerdict({ points: [{ x: -110, y: 62, z: 375 }, { x: -200, y: 62, z: -200 }], hazardNear: near })
  assert.equal(v, null, 'a route whose only other point is clean stays clean; index 0 never judges')
})

test('route gate: the scan bound - waypoints past maxPoints never judge', () => {
  const near = pocketNear()
  const deep = { x: -110, y: 62, z: 375 }
  const big = [{ x: 0, y: 62, z: 0 }]
  for (let i = 0; i < ROUTE_SCAN_MAX_POINTS; i++) big.push({ x: 1000 + i, y: 62, z: 1000 })
  big.push(deep) // the wet waypoint sits BEYOND the cap
  const v = routeHazardVerdict({ points: big, start: { x: 0, y: 62, z: 0 }, hazardNear: near, maxPoints: 4 })
  assert.equal(v, null, 'the cap bounds the scan - the wet point past it is the caller\'s junk, not a verdict')
})

test('route gate: the zero-grace override tightens the depth law', () => {
  const near = pocketNear()
  // the start stands 1.0b from its record; index 1 sits 0.5b deep - deeper
  // than the start but inside the default grace (a two-point route: index 0
  // is the exempt standing cell)
  const route = [{ x: -111, y: 62, z: 375 }, { x: -110.5, y: 62, z: 375 }]
  const withGrace = routeHazardVerdict({ points: route, start: { x: -111, y: 62, z: 375 }, hazardNear: near })
  const zeroGrace = routeHazardVerdict({ points: route, start: { x: -111, y: 62, z: 375 }, hazardNear: near, graceBlocks: 0 })
  assert.equal(withGrace, null, 'the default grace keeps a 0.5b bob free (the pathfinder jitters)')
  assert.ok(zeroGrace, 'grace 0 condemns the same point - the knob is real')
  assert.equal(routeHazardVerdict({ points: route, start: { x: -111, y: 62, z: 375 }, hazardNear: near, graceBlocks: NaN }), null, 'junk grace reads the default')
})

// ---- (v0.385.0) THE FUNNEL WIRING - gotoSafe's route gate ----
// The pure verdict is one tier; the cure lives in the funnel: gotoSafe arms a
// path_update listener (only when the pathfinder speaks events AND the fleet
// reader is installed), scans every planned route (re-plans included), and on
// a dive stops the pathfinder, kills the goal slot and rejects with the named
// reason. Bare mocks (no .on) stay byte-identical legacy - the aquifer tests
// above that very shape pin that too.

import { gotoSafe, setFleetHazardNear, allocValveStatsFor, resetWalkGovernors } from '../../src/lib/jobqueue.mjs'

class MockPF {
  constructor () {
    this.handlers = {}
    this.stops = 0
    this.goalSets = []
    this.removed = []
    this.armed = []
  }

  on (ev, fn) { this.armed.push(ev); (this.handlers[ev] = this.handlers[ev] || []).push(fn) }

  removeListener (ev) { this.removed.push(ev) }

  emit (ev, arg) { for (const fn of this.handlers[ev] || []) fn(arg) }

  stop () { this.stops++ }

  setGoal (g) { this.goalSets.push(g) }
}

const WET_READER = pos => (pos && pos.x >= 4) ? { hazard: { x: 4, y: 64, z: 0, at: Date.now() }, d: 0.5 } : null

test('route gate wiring: a wet planned route refuses mid-plan with the named reason', async () => {
  resetWalkGovernors()
  setFleetHazardNear(WET_READER)
  try {
    const pf = new MockPF()
    const bot = {
      entity: { position: { x: 0, y: 64, z: 0 } },
      pathfinder: Object.assign(pf, {
        goto: async () => {
          await new Promise(r => setImmediate(r))
          pf.emit('path_update', { path: [{ x: 0, y: 64, z: 0 }, { x: 2, y: 64, z: 0 }, { x: 4, y: 64, z: 0 }] })
          await new Promise(() => {}) // the plan computes, the walk never arrives: the gate owns the exit
        }
      })
    }
    await assert.rejects(gotoSafe(bot, { x: 9, y: 64, z: 0 }, { timeoutMs: 3000 }), /route gate: .* crosses live hazard water at \[4,64,0\]/,
      'the refusal names the gate, the crossing cell and the reason so the log reader can count it')
    assert.ok(pf.stops >= 1, 'the gate stopped the pathfinder - the wet plan never walks')
    assert.ok(pf.goalSets.includes(null), 'the gate killed the goal slot (the zombie-kill shape)')
    assert.ok(pf.removed.includes('path_update'), 'the listener is removed even on the refusal path (no leak)')
    assert.ok(allocValveStatsFor().routeGateRefusals >= 1, 'the refusal is counted on the walk-refusal ledger')
  } finally {
    setFleetHazardNear(null)
    resetWalkGovernors()
  }
})

test('route gate wiring: a dry planned route flows untouched', async () => {
  resetWalkGovernors()
  const before = allocValveStatsFor().routeGateRefusals
  setFleetHazardNear(pos => null) // the board is wired and knows no hazards
  try {
    const pf = new MockPF()
    const bot = {
      entity: { position: { x: 0, y: 64, z: 0 } },
      pathfinder: Object.assign(pf, {
        goto: async () => {
          await new Promise(r => setImmediate(r))
          pf.emit('path_update', { path: [{ x: 0, y: 64, z: 0 }, { x: 2, y: 64, z: 0 }, { x: 4, y: 64, z: 0 }] })
          return 'walked'
        }
      })
    }
    const r = await gotoSafe(bot, { x: 4, y: 64, z: 0 }, { timeoutMs: 2000 })
    assert.equal(r, 'walked', 'a clean route walks byte-identical')
    assert.ok(pf.armed.includes('path_update'), 'the listener WAS armed (the wiring is live, the route was clean)')
    assert.ok(pf.removed.includes('path_update'), 'the listener is removed on the success path too')
    assert.equal(allocValveStatsFor().routeGateRefusals, before, 'a clean route books zero refusals')
  } finally {
    setFleetHazardNear(null)
    resetWalkGovernors()
  }
})

test('route gate wiring: a late path_update after settle is noise (the guard holds)', async () => {
  resetWalkGovernors()
  const before = allocValveStatsFor().routeGateRefusals
  setFleetHazardNear(WET_READER)
  try {
    const pf = new MockPF()
    const bot = {
      entity: { position: { x: 0, y: 64, z: 0 } },
      pathfinder: Object.assign(pf, { goto: async () => 'walked' }) // settles BEFORE any path_update
    }
    const r = await gotoSafe(bot, { x: 9, y: 64, z: 0 }, { timeoutMs: 2000 })
    assert.equal(r, 'walked')
    pf.emit('path_update', { path: [{ x: 0, y: 64, z: 0 }, { x: 4, y: 64, z: 0 }] }) // the LATE wet update
    await new Promise(r => setImmediate(r))
    await new Promise(r => setImmediate(r))
    assert.equal(allocValveStatsFor().routeGateRefusals, before, 'a late update books nothing - the walk already settled')
  } finally {
    setFleetHazardNear(null)
    resetWalkGovernors()
  }
})

test('route gate wiring: a pathfinder without events stays byte-identical legacy', async () => {
  resetWalkGovernors()
  setFleetHazardNear(WET_READER) // even a wired board cannot arm a mute pathfinder
  try {
    const bot = {
      entity: { position: { x: 0, y: 64, z: 0 } },
      pathfinder: { goto: async () => 'done', stop: () => {} }
    }
    const r = await gotoSafe(bot, { x: 9, y: 64, z: 0 }, { timeoutMs: 1000 })
    assert.equal(r, 'done', 'no .on means no route gate - the pre-gate fleet shape survives untouched')
  } finally {
    setFleetHazardNear(null)
    resetWalkGovernors()
  }
})
