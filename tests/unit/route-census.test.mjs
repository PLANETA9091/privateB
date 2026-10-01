// (v0.388.0) THE ROUTE-GATE CENSUS pins - the field read for the v0.386.0
// route gate. The census parses the gate's OWN refusal wording (the
// sibling-shape law: the row and the census must read the same truth - a
// wording drift in the wiring breaks these tests loudly BEFORE the field
// read goes blind). The fleet log carries no per-line clock, so the
// rim-trap signal is a COUNT proxy and the tests pin it as one.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseRouteGateLine, routeGateCensus, ROUTE_GATE_RIM_TRAP_REFUSALS } from '../../src/lib/routecensus.mjs'
import { routeHazardVerdict, recordWaterHazard, nearWaterHazard, HazardLedger } from '../../src/lib/drowning.mjs'
import { gotoSafe, setFleetHazardNear, resetWalkGovernors } from '../../src/lib/jobqueue.mjs'

// THE VERBATIM TEMPLATE - built from the wiring's own expression with the
// face-19 pocket's values (jobqueue.mjs line ~1256). If the gate's wording
// changes, this builder must change with it - that is the pin.
const refusalLine = (bot, label, cell, d, tier, startDepth) => {
  const dTxt = d != null ? `${Number(d).toFixed(1)}b` : 'd?'
  const tierTxt = tier === 'zone' ? 'zone envelope' : 'point record'
  const sTxt = startDepth != null ? `${Number(startDepth).toFixed(1)}b` : 'clean'
  return `${bot} [${bot}] queue: no reachable job (route gate: ${label}'s route crosses live hazard water at [${cell.x},${cell.y},${cell.z}] (${dTxt}, ${tierTxt}; start depth ${sTxt}) - the walk refused mid-plan, the caller rotates (no deeper than the bot already stands))`
}

test('route census: the verbatim wiring line parses whole (the sibling-shape pin)', () => {
  const line = refusalLine('F19', 'shore transit', { x: -110, y: 62, z: 375 }, 0.0, 'point', 1.4)
  const e = parseRouteGateLine(line)
  assert.ok(e, 'the exact wiring wording must parse')
  assert.equal(e.bot, 'F19')
  assert.equal(e.label, 'shore transit')
  assert.deepEqual(e.cell, { x: -110, y: 62, z: 375 })
  assert.equal(e.d, 0)
  assert.equal(e.tier, 'point')
  assert.equal(e.startDepth, 1.4)
  assert.equal(e.law, 'dive', 'a numbered start depth is the dive law')
})

test('route census: the zone tier + the clean start (the entry law) parse', () => {
  const line = refusalLine('F14', 'walk', { x: -108, y: 62, z: 371 }, 9.8, 'zone', null)
  const e = parseRouteGateLine(line)
  assert.ok(e)
  assert.equal(e.tier, 'zone')
  assert.equal(e.startDepth, null)
  assert.equal(e.law, 'entry', 'a clean start is the entry law')
})

test('route census: the d? and clean safety forms parse as nulls', () => {
  const line = refusalLine('F7', 'deposit run', { x: 5, y: 40, z: 200 }, null, 'point', null)
  const e = parseRouteGateLine(line)
  assert.ok(e)
  assert.equal(e.d, null)
  assert.equal(e.startDepth, null)
})

test('route census: the wrapper tolerance - the thrown message rides any caller line', () => {
  const inner = `route gate: bank run's route crosses live hazard water at [-123,62,379] (2.5b, point record; start depth clean) - the walk refused mid-plan, the caller rotates (no deeper than the bot already stands)`
  const wrapped = `F3 [F3] chest skip (walk refused: ${inner})`
  const e = parseRouteGateLine(wrapped)
  assert.ok(e, 'the parser scans for the marker, never assumes a wrapper')
  assert.equal(e.bot, 'F3')
  assert.equal(e.label, 'bank run')
})

test('route census: the junk battery - truncation, no marker, junk type, unknown tier judge NOTHING', () => {
  assert.equal(parseRouteGateLine(undefined), null)
  assert.equal(parseRouteGateLine(42), null)
  assert.equal(parseRouteGateLine('a normal walk line about something else'), null)
  assert.equal(parseRouteGateLine("F1 [F1] route gate: walk's route crosses live hazard water at [-110,62,3"), null,
    'the FATAL truncation mid-anatomy never parses')
  assert.equal(parseRouteGateLine("F1 [F1] route gate: walk's route crosses live hazard water at [-110,62,375] (2.0b, weird tier; start depth clean) - the walk refused mid-plan, the caller rotates"), null,
    'an unknown tier judges nothing (the vocabulary is the gate\'s, not the parser\'s)')
})

test('route census: a line without a bot tag attributes unknown', () => {
  const line = "route gate: walk's route crosses live hazard water at [-110,62,375] (1.0b, point record; start depth clean) - the walk refused mid-plan, the caller rotates"
  const e = parseRouteGateLine(line)
  assert.ok(e)
  assert.equal(e.bot, null)
  const c = routeGateCensus([line])
  assert.equal(c.byBot.unknown, 1, 'the unknown bucket holds unattributed refusals')
})

test('route census: the aggregates - per-bot, per-tier, per-label, cells, law mix', () => {
  const lines = [
    refusalLine('F19', 'shore transit', { x: -110, y: 62, z: 375 }, 0.0, 'point', 1.4),
    refusalLine('F19', 'shore transit', { x: -110, y: 62, z: 375 }, 0.2, 'point', 1.4),
    refusalLine('F14', 'walk', { x: -108, y: 62, z: 371 }, 9.8, 'zone', null),
    refusalLine('F2', 'bank run', { x: -123, y: 62, z: 379 }, 2.5, 'point', null),
    'b] n=3 ts=61s rss=371M late=16ms mainLate=531ms',
    'F5 [F5] digShaft: water hazard 3.1b away (live 2) - refusing this column, the caller rotates'
  ]
  const c = routeGateCensus(lines)
  assert.equal(c.refusals, 4, 'only route-gate lines count (the digShaft refusal and the status line are other classes)')
  assert.deepEqual(c.byBot, { F19: 2, F14: 1, F2: 1 })
  assert.deepEqual(c.byTier, { point: 3, zone: 1 })
  assert.deepEqual(c.byLabel, { 'shore transit': 2, walk: 1, 'bank run': 1 })
  assert.deepEqual(c.lawMix, { entry: 2, dive: 2 })
  assert.equal(c.cells.length, 3, 'three distinct cells across four refusals')
  const f19cell = c.cells.find((x) => x.cell.x === -110 && x.cell.z === 375)
  assert.equal(f19cell.count, 2, 'the same condemned cell counted twice')
})

test('route census: the rim-trap flag fires at the threshold and below it stays silent', () => {
  const one = (bot, i) => refusalLine(bot, 'walk', { x: -110, y: 62, z: 375 + (i % 3) }, 0.5, 'point', 1.0)
  const four = []
  for (let i = 0; i < ROUTE_GATE_RIM_TRAP_REFUSALS - 1; i++) four.push(one('F9', i))
  assert.deepEqual(routeGateCensus(four).rimTrapSuspects, [], 'below the threshold the bot is not a suspect')
  const six = []
  for (let i = 0; i < ROUTE_GATE_RIM_TRAP_REFUSALS; i++) six.push(one('F9', i))
  const c = routeGateCensus(six)
  assert.deepEqual(c.rimTrapSuspects, ['F9'], 'at the threshold the bot is the suspect class (the count proxy)')
})

test('route census: raw text input splits like an array', () => {
  const text = [
    refusalLine('F19', 'walk', { x: -110, y: 62, z: 375 }, 0.0, 'point', 1.4),
    '',
    'b] n=1 ts=21s rss=252M'
  ].join('\n')
  const c = routeGateCensus(text)
  assert.equal(c.refusals, 1)
})

test('route census: zero refusals read as the zero shape (the pre-gate faces stay honest)', () => {
  const c = routeGateCensus(['F1 [F1] water: rescue complete in 9.3s', 'b] n=2 ts=41s'])
  assert.equal(c.refusals, 0)
  assert.deepEqual(c.entries, [])
  assert.deepEqual(c.rimTrapSuspects, [])
  assert.deepEqual(c.byTier, { point: 0, zone: 0 })
})

// ---- THE SIBLING-SHAPE END-TO-END PIN ----
// The census must parse what the REAL gate emits - not a hand-built string.
// Run the actual gotoSafe route gate over a mock pathfinder with a wet
// planned route, catch the real error text, and feed it to the census.
test('route census: end-to-end - the real gate refusal parses (no drift between the gate and the read)', async () => {
  resetWalkGovernors()
  let caught = null
  setFleetHazardNear(pos => (pos && pos.x >= 4) ? { hazard: { x: 4, y: 64, z: 0, at: Date.now() }, d: 0.5 } : null)
  const emit = { fn: null }
  const bot = {
    entity: { position: { x: 0, y: 64, z: 0 } },
    pathfinder: {
      on (ev, fn) { emit.fn = fn },
      removeListener () {},
      stop () {},
      setGoal () {},
      goto: async () => {
        await new Promise(r => setImmediate(r))
        if (emit.fn) emit.fn({ path: [{ x: 0, y: 64, z: 0 }, { x: 4, y: 64, z: 0 }] })
        await new Promise(() => {})
      }
    }
  }
  try {
    await gotoSafe(bot, { x: 9, y: 64, z: 0 }, { timeoutMs: 2000 }).catch((e) => { caught = e })
    assert.ok(caught && /route gate:/.test(caught.message), 'the gate refused as designed')
    const line = `F11 [F11] queue: no reachable job (${caught.message})`
    const c = routeGateCensus([line])
    assert.equal(c.refusals, 1, 'the REAL wording parses - the gate and the census read one truth')
    assert.equal(c.byBot.F11, 1)
    assert.equal(c.entries[0].label, 'walk')
    assert.deepEqual(c.entries[0].cell, { x: 4, y: 64, z: 0 })
    assert.equal(c.entries[0].tier, 'point')
    assert.equal(c.entries[0].law, 'entry')
  } finally {
    setFleetHazardNear(null)
    resetWalkGovernors()
  }
})

// The pocket replay: the pure verdict's condemned cell is the census's cell,
// through the SAME ledger the fleet reads (one truth, three tiers deep).
test('route census: the pocket replay ties the verdict, the ledger and the read together', () => {
  const ledger = new HazardLedger({ now: () => 1000000 })
  for (const c of [{ x: -110, y: 62, z: 375 }]) ledger.record(c)
  const near = (pos) => ledger.near(pos)
  const v = routeHazardVerdict({
    points: [{ x: -110, y: 62, z: 370 }, { x: -110, y: 62, z: 375 }],
    start: { x: -110, y: 62, z: 366 },
    hazardNear: near
  })
  assert.ok(v, 'the verdict condemns the pocket entry')
  const line = `F19 [F19] queue: no reachable job (route gate: shore transit's route crosses live hazard water at [${v.point.x},${v.point.y},${v.point.z}] (${v.d.toFixed(1)}b, ${v.zone ? 'zone envelope' : 'point record'}; start depth ${v.startDepth != null ? `${v.startDepth.toFixed(1)}b` : 'clean'}) - the walk refused mid-plan, the caller rotates (no deeper than the bot already stands))`
  const e = parseRouteGateLine(line)
  assert.ok(e, 'the verdict-shaped line parses')
  assert.deepEqual(e.cell, { x: -110, y: 62, z: 375 })
  assert.equal(e.law, 'entry', 'the clean start reads as the entry law end to end')
})
