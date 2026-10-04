// (v0.598.0) THE TITHE LEDGER tests - the refill strand's own instrument.
// Anchors are byte-exact against the emitter grammar (fuelbank.mjs) and the
// mined faces: the feed form from fleet 37176598172 (THE FIRST TITHE
// DELIVERY EVER), the dry-all grain from fleet 37171678894 (fire 1139).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  TITHE_CAP, TITHE_DRY_SHARE,
  parseTitheInflow, parseFuelGrain,
  titheCensus, titheRow, TITHE_TORN_RE
} from '../../src/lib/titheledger.mjs'

const FEED = 'F5 fuel tithe inflow: attempted 4, delivered 1 (4u), dry 3 - the inflow feeds the commons (the tithe owns the refill)'
const DRY_BARE = 'F2 fuel tithe inflow: attempted 2, delivered 0, dry 2 - the inflow ran dry: the skips named their lines (the commons\' source is the front)'
const DRY_FAR = 'F7 fuel tithe inflow: attempted 3, delivered 0, dry 3 - the opens fired far 2 of 3 - the walk\'s landed verdict lied: the geometry is the front - the inflow ran dry: the skips named their lines (the commons\' source is the front)'
const DRY_NEAR = 'F7 fuel tithe inflow: attempted 3, delivered 0, dry 3 - the opens fired near 3 of 3 - the chest refused the use: the storm\'s hand is the front - the inflow ran dry: the skips named their lines (the commons\' source is the front)'
const DRY_SPLIT = 'F7 fuel tithe inflow: attempted 4, delivered 0, dry 4 - the opens split far 1/near 2 of 4 - the reach reads mixed - the inflow ran dry: the skips named their lines (the commons\' source is the front)'
const GRAIN_DRY_ALL = 'F9 smelt fuel commons grain: asked 5, delivered 0, dry 5 - every ask came up dry: the commons\' source is the front (the tithe is the only inflow)'
const GRAIN_FED = 'F3 smelt fuel commons grain: asked 4, delivered 4 (12u over 4 opens), dry 0 - every ask fed: the commons holds the supply line'
const GRAIN_MIXED = 'F3 smelt fuel commons grain: asked 6, delivered 3 (9u over 5 opens), dry 3 - the commons reads mixed: the dry asks name the thin chests'

test('the inflow feed form parses byte-exact (the first delivery face)', () => {
  const p = parseTitheInflow(FEED)
  assert.ok(p)
  assert.equal(p.kind, 'inflow')
  assert.equal(p.attempted, 4)
  assert.equal(p.delivered, 1)
  assert.equal(p.units, 4)
  assert.equal(p.dry, 3)
  assert.equal(p.open, null)
})

test('the inflow dry forms parse with the open lens', () => {
  const bare = parseTitheInflow(DRY_BARE)
  assert.equal(bare.attempted, 2); assert.equal(bare.dry, 2); assert.equal(bare.delivered, 0); assert.equal(bare.open, null)
  const far = parseTitheInflow(DRY_FAR)
  assert.equal(far.open, 'far'); assert.equal(far.far, 2)
  const near = parseTitheInflow(DRY_NEAR)
  assert.equal(near.open, 'near'); assert.equal(near.near, 3)
  const split = parseTitheInflow(DRY_SPLIT)
  assert.equal(split.open, 'split'); assert.equal(split.far, 1); assert.equal(split.near, 2)
})

test('the grain forms parse byte-exact (the three emitter faces)', () => {
  const dry = parseFuelGrain(GRAIN_DRY_ALL)
  assert.equal(dry.asked, 5); assert.equal(dry.delivered, 0); assert.equal(dry.dry, 5); assert.equal(dry.units, 0); assert.equal(dry.opens, 0)
  const fed = parseFuelGrain(GRAIN_FED)
  assert.equal(fed.delivered, 4); assert.equal(fed.units, 12); assert.equal(fed.opens, 4); assert.equal(fed.dry, 0)
  const mixed = parseFuelGrain(GRAIN_MIXED)
  assert.equal(mixed.asked, 6); assert.equal(mixed.delivered, 3); assert.equal(mixed.dry, 3)
})

test('the junk battery never claims the other families', () => {
  const junk = [
    'F14 fuel commons: chest holds no fuel',
    'F14 [F14] fuel commons: chest at [1,64,1] the yard stands 30 levels up over 1 lateral - the walk ladder cannot climb',
    'b] n=17 ts=600s rss=88M late=0ms mainLate=0ms',
    '[stormguard] STORM PROBE: rss 88M -> 92M (+4M in 5s = 0MB/s, mainLate 0ms',
    'F5 cached skip: no path cached at [1,64,1]',
    'F5 water commons: the pool holds 12u',
    'F5 fuel tithe inflow: the line lied',
    'smelt fuel commons grain: asked nothing'
  ]
  for (const j of junk) {
    assert.equal(parseTitheInflow(j), null, `inflow claimed junk: ${j}`)
    assert.equal(parseFuelGrain(j), null, `grain claimed junk: ${j}`)
  }
})

test('the census sums the mini-face (the additive law)', () => {
  const c = titheCensus([FEED, DRY_FAR, GRAIN_FED, 'F1 heartbeat: alive'])
  assert.equal(c.inflow.n, 2)
  assert.equal(c.inflow.attempted, 7)
  assert.equal(c.inflow.delivered, 1)
  assert.equal(c.inflow.units, 4)
  assert.equal(c.inflow.dry, 6)
  assert.equal(c.inflow.far, 1)
  assert.equal(c.inflow.bare, 1)
  assert.equal(c.inflow.maxAttempted, 4)
  assert.equal(c.grain.n, 1)
  assert.equal(c.grain.asked, 4)
  assert.equal(c.grain.opens, 4)
  assert.equal(c.unparsed, 0)
})

test('the torn sweep rides unparsed (the honest law)', () => {
  assert.ok(TITHE_TORN_RE.test('F2 fuel tithe inflow: attempted'))
  assert.ok(TITHE_TORN_RE.test('F2 smelt fuel commons grain: asked'))
  const c = titheCensus(['F2 fuel tithe inflow: attempted', 'F9 smelt fuel commons grain: asked', FEED])
  assert.equal(c.unparsed, 2)
  assert.equal(c.inflow.n, 1)
})

test('the none form is a verdict (the always-print law)', () => {
  assert.equal(titheRow(titheCensus([])), 'tithe ledger: none (the tithe never spoke this run)')
  assert.equal(titheRow(titheCensus(['b] n=1 ts=1s rss=1M late=0ms mainLate=0ms'])), 'tithe ledger: none (the tithe never spoke this run)')
})

test('the boundary pins: the half share trips, the cap splits the cures', () => {
  // dry exactly at the half, asks at the cap -> the cap is the throttle
  const atCap = titheCensus(['F2 fuel tithe inflow: attempted 4, delivered 2, dry 2 - the inflow feeds the commons (the tithe owns the refill)'])
  assert.ok(titheRow(atCap).includes('the cap is the throttle'))
  // dry at the half, asks outran the cap -> the source is the throttle
  const over = titheCensus(['F2 fuel tithe inflow: attempted 6, delivered 3, dry 3 - the inflow feeds the commons (the tithe owns the refill)'])
  assert.ok(titheRow(over).includes('the source is the throttle'))
  // dry under the half -> mixed
  const under = titheCensus(['F2 fuel tithe inflow: attempted 4, delivered 3, dry 1 - the inflow feeds the commons (the tithe owns the refill)'])
  assert.ok(titheRow(under).includes('the inflow reads mixed'))
  // never dry -> the pump holds
  const holds = titheCensus(['F2 fuel tithe inflow: attempted 4, delivered 4 (8u), dry 0 - the inflow feeds the commons (the tithe owns the refill)'])
  assert.ok(titheRow(holds).includes('the pump holds'))
  assert.equal(TITHE_CAP, 4)
  assert.equal(TITHE_DRY_SHARE, 0.5)
})

test('THE LIVE FACE VERDICT (fleet 37176598172): the cap owns the throttle', () => {
  const c = titheCensus([FEED])
  const row = titheRow(c)
  assert.equal(row, 'tithe ledger: inflow 1 line(s) attempted 4 delivered 1 (4u) dry 3, grain asked 0 delivered 0 dry 0 - the inflow read dry 75% and the asks never exceeded the cap 4 (max attempted 4) - the cap is the throttle')
})

test('the grain-only face speaks alone (the inflow silent)', () => {
  const c = titheCensus([GRAIN_DRY_ALL])
  const row = titheRow(c)
  assert.ok(row.startsWith('tithe ledger: inflow 0 line(s)'))
  assert.ok(row.includes('the commons\' source is the front'))
})

// (v0.600.0) THE FIELD-FOUND GRAIN: the fleet face 37178311099 carried the
// grain line BARE (the fleet-level report prints no bot tag) and the
// v0.598.0 prefix gate went blind - 'the tithe never spoke' while the grain
// stood in the log. The tag is optional now; the bare face is the anchor.
const FIELD_GRAIN_BARE = 'smelt fuel commons grain: asked 4, delivered 0, dry 4 - every ask came up dry: the commons\' source is the front (the tithe is the only inflow)'

test('the bare fleet-level grain parses (the field-corrected prefix law)', () => {
  const p = parseFuelGrain(FIELD_GRAIN_BARE)
  assert.ok(p, 'the bare grain line must parse')
  assert.equal(p.kind, 'grain')
  assert.equal(p.asked, 4)
  assert.equal(p.delivered, 0)
  assert.equal(p.dry, 4)
  const tagged = parseFuelGrain(GRAIN_DRY_ALL)
  assert.ok(tagged, 'the tagged grain still parses')
})

test('THE LIVE FACE VERDICT (fleet 37178311099): the bare grain speaks alone', () => {
  const c = titheCensus([FIELD_GRAIN_BARE])
  assert.equal(c.grain.n, 1)
  assert.equal(c.unparsed, 0)
  const row = titheRow(c)
  assert.equal(row, 'tithe ledger: inflow 0 line(s) attempted 0 delivered 0 (0u) dry 0, grain asked 4 delivered 0 dry 4 - the grain reads dry 100% - the commons\' source is the front')
})
