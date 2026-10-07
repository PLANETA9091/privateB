// (v0.427.0) THE TRANSIT CENSUS - unit pins. The rescue swim's launch lane:
// the toward-known-land launch (the map's named shore + the planar target +
// the integer distance) and the transit stall (the walls verdict). The
// verbatims are the fleet's own words (faces 26/27). The shore-stall line
// stays the rescue ledger's (one parser per emitter).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseTransitLaunch, parseTransitStall, transitCensus, targetCadence, TRANSIT_POCKET_DEPTH, transitLaunchBill, transitLaunchBillRow, transitLaunchRiders, transitLaunchRidersRow } from '../../src/lib/transitcensus.mjs'

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

// (v0.446.0) THE LAUNCH CADENCE - the repeats alone say nothing; the
// d-progression is the truth. Face 32's field lesson: the decompose's
// 'THE PINNED SEAT (the walls class)' label rode the single-bot repeat
// alone and mislabeled F19's honest 32-launch approach (d 46..16) - while
// face 30's F8 (26 launches, every d=11) was the real walls. The seqs ride
// every target; targetCadence() cuts the verdict; thin evidence reads null.

test('launch cadence: the face-32 approach fixture - F19\'s launches descend, the repeats earned their keep', () => {
  const lines = [
    'F19 [F19] water: transit toward known land (oak_log) at [-78,375] d=46',
    'F19 [F19] water: transit toward known land (oak_log) at [-78,375] d=45',
    'F19 [F19] water: transit toward known land (oak_log) at [-78,375] d=44',
    'F19 [F19] water: transit toward known land (oak_log) at [-78,375] d=20',
    'F19 [F19] water: transit toward known land (oak_log) at [-78,375] d=17',
    'F19 [F19] water: transit toward known land (oak_log) at [-78,375] d=16'
  ]
  const c = transitCensus(lines)
  assert.equal(c.targets.length, 1)
  assert.deepEqual(c.targets[0].seqs, { F19: { n: 6, min: 16, max: 46 } })
  assert.deepEqual(targetCadence(c.targets[0]), { verdict: 'approach', closed: 65, min: 16, max: 46 }, '30 of 46 closed = 65%')
})

test('launch cadence: the face-30 walls fixture - F8\'s flat d=11 x26 re-arms keep the walls label', () => {
  const lines = []
  for (let i = 0; i < 26; i++) lines.push('F8 [F8] water: transit toward known land (oak_log) at [-143,430] d=11')
  const c = transitCensus(lines)
  assert.deepEqual(c.targets[0].seqs, { F8: { n: 26, min: 11, max: 11 } })
  assert.deepEqual(targetCadence(c.targets[0]), { verdict: 'walls', closed: 0, min: 11, max: 11 }, 'zero spread = zero progress = the walls')
})

test('launch cadence: the 50% cut - closed exactly half reads approach, just under reads walls', () => {
  const mk = (ds) => ds.map(d => `F1 [F1] water: transit toward known land (oak_log) at [-134,413] d=${d}`)
  const half = transitCensus(mk([10, 10, 5, 5, 5])) // spread 5 of max 10 = exactly 0.5
  assert.equal(targetCadence(half.targets[0]).verdict, 'approach', 'the boundary rides the approach side')
  const under = transitCensus(mk([10, 10, 6, 6, 6])) // spread 4 of 10 = 0.4
  assert.equal(targetCadence(under.targets[0]).verdict, 'walls')
})

test('launch cadence: thin evidence reads null - multi-bot, short runs, junk, and the d=0 anomaly', () => {
  const mkBot = (bot, d) => `${bot} [${bot}] water: transit toward known land (oak_log) at [-134,413] d=${d}`
  // multi-bot: the d's mix two swimmers - no verdict
  const mixed = transitCensus([mkBot('F1', 10), mkBot('F1', 20), mkBot('F17', 8), mkBot('F17', 9), mkBot('F1', 12)])
  assert.equal(targetCadence(mixed.targets[0]), null)
  // short run: 4 launches is under the label's own bar
  const short = transitCensus([mkBot('F1', 10), mkBot('F1', 9), mkBot('F1', 8), mkBot('F1', 7)])
  assert.equal(targetCadence(short.targets[0]), null)
  // junk target rows (hand-built, no seqs / non-object / inconsistent)
  assert.equal(targetCadence(null), null)
  assert.equal(targetCadence('junk'), null)
  assert.equal(targetCadence({ total: 9, bots: { F1: 9 } }), null, 'no seqs leg')
  assert.equal(targetCadence({ total: 9, bots: { F1: 9 }, seqs: { F1: { n: 9, min: 'junk', max: 3 } } }), null, 'junk min')
  assert.equal(targetCadence({ total: 9, bots: { F1: 9 }, seqs: { F1: { n: 9, min: 5, max: 3 } } }), null, 'max < min is impossible evidence')
  // d=0: launching AT the land - no distance left to close, the anomaly reads walls
  const atLand = transitCensus([mkBot('F2', 0), mkBot('F2', 0), mkBot('F2', 0), mkBot('F2', 0), mkBot('F2', 0)])
  assert.deepEqual(targetCadence(atLand.targets[0]), { verdict: 'walls', closed: 0, min: 0, max: 0 })
})

test('launch cadence: the seqs are per-bot at a shared target - never mixed', () => {
  const mkBot = (bot, d) => `${bot} [${bot}] water: transit toward known land (oak_log) at [-101,399] d=${d}`
  const c = transitCensus([
    mkBot('F1', 40), mkBot('F1', 35), mkBot('F1', 30), mkBot('F1', 25), mkBot('F1', 20), // F1 descends
    mkBot('F2', 7), mkBot('F2', 7), mkBot('F2', 7), mkBot('F2', 7), mkBot('F2', 7) // F2 flat
  ])
  assert.equal(c.targets[0].total, 10)
  assert.deepEqual(c.targets[0].seqs, { F1: { n: 5, min: 20, max: 40 }, F2: { n: 5, min: 7, max: 7 } })
  // the target is multi-bot: no verdict at target level (the mixing law)
  assert.equal(targetCadence(c.targets[0]), null)
})

// (v0.782.0) THE SWIM'S OWN SPENDER - the launches' own bot bill. The
// census's own launches.byBot cell (zero re-parsing), the strict-majority
// law (a tie owns nothing), the riders measure-not-owner (the v0.780.0
// riders law), the decompose's one-additive-branch wiring.

test('launch bill: the face-76 field cell through the seat - F4 owns the whole lane', () => {
  const lines = []
  for (let i = 0; i < 62; i++) lines.push('F4 [F4] water: transit toward known land (birch_log) at [-129,433] d=30')
  lines.push('F4 [F4] water: transit toward known land (sand) at [-159,412] d=58')
  const c = transitCensus(lines)
  assert.deepEqual(c.launches.byBot, { F4: 63 })
  const bill = transitLaunchBill(c.launches.byBot)
  assert.deepEqual(bill, { bot: 'F4', owns: 63, of: 63, share: 1 })
  assert.equal(transitLaunchBillRow(bill), "the launches' own bill (v0.782.0): F4 owns 63 of 63 launch(es) (100.0%) - THE SWIM'S OWN SPENDER: one bot's own re-arms own the water lane - the pin's own seat (v0.722.0) prices the aim, the bill names the spender")
  assert.equal(transitLaunchRiders(c.launches.byBot), null, 'a single-class cell never seats a solo pair')
  assert.equal(transitLaunchRidersRow(null), null)
})

test('launch bill: the tie law + the near-tie edge - face 70\'s own 17:15 shape reads the riders, not a bill', () => {
  // face 70's own cell: F9 17 vs F6 15 - the majority missing by ONE,
  // the strict law's honest edge (17 <= 34 - 17)
  const nearTie = { F9: 17, F6: 15, F15: 2 }
  assert.equal(transitLaunchBill(nearTie), null)
  const r = transitLaunchRiders(nearTie)
  assert.deepEqual({ leader: r.leader, leaderOwns: r.leaderOwns, runner: r.runner, runnerOwns: r.runnerOwns, of: r.of, tie: r.tie }, { leader: 'F9', leaderOwns: 17, runner: 'F6', runnerOwns: 15, of: 34, tie: false })
  assert.equal(transitLaunchRidersRow(r), "the launches' own riders (v0.782.0): no solo spender owns the majority - F9 x17 + F6 x15 own 32 of 34 launch(es) (94.1%) - THE CROWD'S OWN SWIM: the bill's tie law held, the concentration is still real - the pair prices the re-arms the solo law refused to name")
  // the TRUE tie owns nothing on both sides of the branch
  const tie = { F2: 5, F8: 5 }
  assert.equal(transitLaunchBill(tie), null)
  const rt = transitLaunchRiders(tie)
  assert.equal(rt.tie, true)
  assert.equal(rt.share, 1, 'the pair owns the whole lane when the cell is the pair')
})

test('launch bill: the close majority - face 75\'s own 41-of-79 shape seats F6', () => {
  const cell = { F6: 41, F9: 17, F16: 9, F7: 6, F8: 6 }
  const bill = transitLaunchBill(cell)
  assert.deepEqual(bill, { bot: 'F6', owns: 41, of: 79, share: 0.519 })
  assert.equal(transitLaunchBillRow(bill), "the launches' own bill (v0.782.0): F6 owns 41 of 79 launch(es) (51.9%) - THE SWIM'S OWN SPENDER: one bot's own re-arms own the water lane - the pin's own seat (v0.722.0) prices the aim, the bill names the spender")
  // the branch law lives in the WIRING (decompose: if (bill) ... else
  // riders) - the riders stay a pure cell read, never branch-aware
  // (the v0.780.0 riders law's own shape)
  const riders = transitLaunchRiders(cell)
  assert.deepEqual({ leader: riders.leader, leaderOwns: riders.leaderOwns, runner: riders.runner, runnerOwns: riders.runnerOwns, of: riders.of }, { leader: 'F6', leaderOwns: 41, runner: 'F9', runnerOwns: 17, of: 79 })
})

test('launch bill: the junk battery - the silence never invents a spender', () => {
  const junkCells = [null, undefined, 'junk', 42, [], ['', ''], { F4: 0 }, { F4: -2 }, { F4: 'x' }, { F4: NaN }, { F4: Infinity }, {}]
  for (const j of junkCells) {
    assert.equal(transitLaunchBill(j), null, `bill ${JSON.stringify(j)}`)
    assert.equal(transitLaunchRiders(j), null, `riders ${JSON.stringify(j)}`)
  }
  assert.equal(transitLaunchBillRow(null), null)
  assert.equal(transitLaunchBillRow('junk'), null)
  assert.equal(transitLaunchBillRow({ bot: 'F4', owns: 5, of: 9, share: NaN }), null, 'junk share never prints')
  assert.equal(transitLaunchBillRow({ bot: 'F4', owns: 12, of: 9, share: 1 }), null, 'owns > of is impossible evidence')
  assert.equal(transitLaunchRidersRow({ leader: 'F4', leaderOwns: 5, runner: 'F8', runnerOwns: 3, of: 9, pairOwns: 12, share: 1 }), null, 'pairOwns > of never prints')
  assert.equal(transitLaunchRidersRow({ leader: 'F4', leaderOwns: 0, runner: 'F8', runnerOwns: 3, of: 9, pairOwns: 3, share: 0.333 }), null, 'zero-count leaders are junk')
  // the mixed junk cell: the junk keys drop, the real counts still price
  const mixed = { F4: 10, junk: -3, F8: 2, gone: NaN }
  assert.deepEqual(transitLaunchBill(mixed), { bot: 'F4', owns: 10, of: 12, share: 0.833 })
})
