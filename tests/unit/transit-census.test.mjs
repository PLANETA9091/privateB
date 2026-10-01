// (v0.427.0) THE TRANSIT CENSUS - unit pins. The rescue swim's launch lane:
// the toward-known-land launch (the map's named shore + the planar target +
// the integer distance) and the transit stall (the walls verdict). The
// verbatims are the fleet's own words (faces 26/27). The shore-stall line
// stays the rescue ledger's (one parser per emitter).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseTransitLaunch, parseTransitStall, transitCensus, TRANSIT_POCKET_DEPTH } from '../../src/lib/transitcensus.mjs'

test('transit-census: the face verbatim launch (F1, the walls class seat)', () => {
  const line = 'F1 [F1] water: transit toward known land (oak_log) at [-134,413] d=3'
  assert.deepEqual(parseTransitLaunch(line), { bot: 'F1', land: 'oak_log', x: -134, z: 413, dist: 3 })
})

test('transit-census: the launch distance is the emitter\'s integer (toFixed(0))', () => {
  const line = 'F2 [F2] water: transit toward known land (oak_log) at [-101,399] d=0'
  const p = parseTransitLaunch(line)
  assert.equal(p.dist, 0)
  assert.equal(Number.isInteger(p.dist), true)
})

test('transit-census: the face verbatim stall', () => {
  const line = 'F1 [F1] water: transit stalled (d=2 after 18 passes - the walls own this swim; the release takes over)'
  assert.deepEqual(parseTransitStall(line), { bot: 'F1', dist: 2, passes: 18 })
})

test('transit-census: the junk battery - the neighbor lanes\' lines never parse', () => {
  const junk = [
    'F1 [F1] water: shore transit stalled (r=1 after 9 passes - the walls own this swim; the release takes over)', // the shore lane's own stall
    'F1 [F1] water: pass 3 head=wet shore=none land=none y=48.2 o2=5 probes=0 at=[-131,45,411]', // the sentry's
    'F14 [F14] water: frozen physics (10 flat passes at y=51.2, o2=6, head WET) - standing down, the reconnect lane owns this', // the frozen census's
    'F1 [F1] water: repeat wet page at the same cell (o2 20) - standing down, the walk machinery owns the exit', // the repeat lane's
    'F9 [F9] water: rescue released (surface-safe, open water - no land known; the walk gate reopens) in 10.9s', // the rescue ledger's
    'F2 [F2] walk: timeout after 8000ms',
    'water: transit toward known land (oak_log) at [-134,413] d=3', // no bot tag
    null,
    7
  ]
  for (const j of junk) {
    assert.equal(parseTransitLaunch(j), null, `launch ${typeof j}`)
    assert.equal(parseTransitStall(j), null, `stall ${typeof j}`)
  }
})

test('transit-census: the hand-counted accumulation - the held faces\' shape in miniature', () => {
  const lines = [
    'F1 [F1] water: transit toward known land (oak_log) at [-134,413] d=3',
    'F1 [F1] water: transit toward known land (oak_log) at [-134,413] d=2',
    'F2 [F2] water: transit toward known land (oak_log) at [-101,399] d=5',
    'F1 [F1] water: transit stalled (d=2 after 18 passes - the walls own this swim; the release takes over)',
    'F1 [F1] water: transit stalled (d=3 after 16 passes - the walls own this swim; the release takes over)'
  ]
  const c = transitCensus(lines)
  assert.equal(c.launches.n, 3)
  assert.deepEqual(c.launches.byBot, { F1: 2, F2: 1 })
  assert.deepEqual(c.launches.byLand, { oak_log: 3 })
  assert.deepEqual(c.launches.dist, { n: 3, min: 2, max: 5, sum: 10 })
  assert.equal(c.stalls.n, 2)
  assert.deepEqual(c.stalls.byBot, { F1: 2 })
  assert.equal(c.stalls.distMax, 3)
  assert.equal(c.stalls.passesMax, 18)
  assert.equal(c.targets.length, 2)
  assert.equal(c.targets[0].key, '-134,413') // the pinned seat sorts first by total
  assert.equal(c.targets[0].total, 2)
  assert.deepEqual(c.targets[0].bots, { F1: 2 })
  assert.deepEqual(c.targets[1].bots, { F2: 1 })
  assert.equal(c.unparsed, 0)
  // (v0.435.0) the depth split rides the same accumulation: both stalls at
  // d<=3 are POCKET; each pairs F1's OWN last launch (d=2 - the second one)
  // so the gains are 0 and -1 (the current pushed the bot back PAST the plan
  // point - legal evidence) - both early, none to the lip, none unpaired.
  assert.equal(c.stalls.pocketN, 2)
  assert.equal(c.stalls.routeN, 0)
  assert.deepEqual(c.stalls.pairs, { n: 2, gainedMin: -1, gainedMax: 0, gainedSum: -1, toTheLipN: 0, earlyN: 2 })
  assert.equal(c.stalls.unpairedN, 0)
})

test('transit-census: the pinned-seat verdict shape - one bot owns the target, many bots share it', () => {
  const c = transitCensus([
    'F1 [F1] water: transit toward known land (oak_log) at [-134,413] d=3',
    'F1 [F1] water: transit toward known land (oak_log) at [-134,413] d=2',
    'F17 [F17] water: transit toward known land (oak_log) at [-134,413] d=4'
  ])
  const t = c.targets[0]
  assert.equal(t.total, 3)
  assert.deepEqual(t.bots, { F1: 2, F17: 1 }) // the attribution rides - the walls vs the map read
  assert.equal(Object.keys(t.bots).length > 1, true)
})

test('transit-census: the escape hatch counts a transit-lane line the grammar refused', () => {
  const c = transitCensus(['F7 [F7] water: transit toward known land (oak_log) at [-1] d=3']) // the broken target
  assert.equal(c.unparsed, 1)
  assert.equal(c.launches.n, 0)
})

test('transit-census: the honest zero - a face with no transit family reads zeros', () => {
  const c = transitCensus(['F1 [F1] walk: timeout after 8000ms', 'nothing here'])
  assert.equal(c.launches.n, 0)
  assert.equal(c.stalls.n, 0)
  assert.deepEqual(c.targets, [])
  assert.equal(c.unparsed, 0)
  assert.equal(c.stalls.pocketN, 0)
  assert.equal(c.stalls.routeN, 0)
  assert.equal(c.stalls.pairs.n, 0)
  assert.equal(c.stalls.unpairedN, 0)
})

// (v0.435.0) THE STALL DEPTH SPLIT - the pocket read the face-27 field scan
// named (F1's 10 stalls ALL at d=2..3): where it died vs how far it swam.

test('stall depth split: the lip pocket - the long swim WORKS, the final approach refuses (the F1 walls shape)', () => {
  const c = transitCensus([
    'F1 [F1] water: transit toward known land (oak_log) at [-134,413] d=20',
    'F1 [F1] water: transit stalled (d=2 after 17 passes - the walls own this swim; the release takes over)'
  ])
  assert.equal(c.stalls.n, 1)
  assert.equal(c.stalls.pocketN, 1, 'd=2 rides inside the pocket band')
  assert.equal(c.stalls.routeN, 0)
  assert.deepEqual(c.stalls.pairs, { n: 1, gainedMin: 18, gainedMax: 18, gainedSum: 18, toTheLipN: 1, earlyN: 0 })
  assert.equal(c.stalls.unpairedN, 0)
})

test('stall depth split: the pocket boundary - d=3 is pocket, d=4 is route', () => {
  const mk = d => ([
    'F1 [F1] water: transit toward known land (oak_log) at [-134,413] d=30',
    `F1 [F1] water: transit stalled (d=${d} after 15 passes - the walls own this swim; the release takes over)`
  ])
  assert.equal(transitCensus(mk(3)).stalls.pocketN, 1)
  const route = transitCensus(mk(4))
  assert.equal(route.stalls.pocketN, 0)
  assert.equal(route.stalls.routeN, 1)
})

test('stall depth split: the early stall - the swim died in its first half, NOT at the lip', () => {
  const c = transitCensus([
    'F2 [F2] water: transit toward known land (oak_log) at [-101,399] d=30',
    'F2 [F2] water: transit stalled (d=25 after 18 passes - the walls own this swim; the release takes over)'
  ])
  assert.equal(c.stalls.routeN, 1) // died far outside the pocket
  assert.deepEqual(c.stalls.pairs, { n: 1, gainedMin: 5, gainedMax: 5, gainedSum: 5, toTheLipN: 0, earlyN: 1 }, '5 < 15 - the launch column owned it')
  assert.equal(c.stalls.pocketN, 0)
})

test('stall depth split: the pairing rides the bot\'s OWN launch, never a neighbor\'s', () => {
  const c = transitCensus([
    'F1 [F1] water: transit toward known land (oak_log) at [-134,413] d=10',
    'F2 [F2] water: transit toward known land (oak_log) at [-101,399] d=30',
    'F2 [F2] water: transit stalled (d=28 after 18 passes - the walls own this swim; the release takes over)'
  ])
  // F2's stall pairs F2's d=30 launch (gained 2, early) - NOT F1's d=10.
  assert.deepEqual(c.stalls.pairs, { n: 1, gainedMin: 2, gainedMax: 2, gainedSum: 2, toTheLipN: 0, earlyN: 1 })
})

test('stall depth split: the unpaired stall - a stall with no launch before it is counted, never assumed', () => {
  const c = transitCensus([
    'F1 [F1] water: transit stalled (d=2 after 18 passes - the walls own this swim; the release takes over)'
  ])
  assert.equal(c.stalls.n, 1)
  assert.equal(c.stalls.pocketN, 1, 'the WHERE cut reads the stall alone')
  assert.equal(c.stalls.unpairedN, 1)
  assert.equal(c.stalls.pairs.n, 0)
})
