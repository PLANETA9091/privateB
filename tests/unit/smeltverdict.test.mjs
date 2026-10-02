//
// smeltverdict.test.mjs - THE SMELT VERDICT (v0.490.0) unit tests.
// The lines are byte-verbatim from the stored faces (face 42/43
// fleet19.log) - hand-traced first, then pinned here.
//
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { smeltVerdict, SMELT_VERDICT_RE } from '../../src/lib/smeltverdict.mjs'

// Face 42's verdict window, verbatim: F17's fuel-bound exact batch and
// F4's IN-FLIGHT batch (no clip lines at all - the fuel never bound, the
// clock killed it after fueling, the fired tail is the only trace).
const FACE42_MINI = [
  't-214s alive=19/19 mined=1548 map=865p/17ch banked=0 smelted=0 pocket=1756u/247s | sand=30 gravel=30 dirt=250 stone=0',
  '[F17] fuel clips the batch: 5 x stick completes 2 of 22 x cobblestone (the rest re-smelts on the next chain)',
  '[F17] the clock clips the batch: the 82s window completes ~7 of 22 x cobblestone (the rest re-smelts on the next chain)',
  '[F17] smelting 2 x cobblestone in a furnace (fuel: 5 x stick)',
  '[F4] smelting 2 x raw_iron in a furnace (fuel: 1 x coal)',
  'F17 smelted 2 (stone:2) rescued=0',
  '[F19] fuel clips the batch: 3 x stick completes 1 of 37 x raw_copper (the rest re-smelts on the next chain)',
  '[F19] the clock clips the batch: the 37s window completes ~3 of 37 x raw_copper (the rest re-smelts on the next chain)',
  '[F19] smelting 1 x raw_copper in a furnace (fuel: 3 x stick)',
  'F4 smelted 0 () rescued=0 fired=2',
  '[F13] fuel clips the batch: 4 x stick completes 2 of 77 x cobblestone (the rest re-smelts on the next chain)',
  '[F13] the clock clips the batch: the 36s window completes ~3 of 77 x cobblestone (the rest re-smelts on the next chain)',
  '[F13] smelting 2 x cobblestone in a furnace (fuel: 4 x stick)',
  'F19 smelted 1 (copper_ingot:1) rescued=0',
  'F13 smelted 2 (stone:2) rescued=0'
]

// Face 43's verdict window, verbatim: F12's clock-bound batch (no fuel
// clip - the coal never ran out), F18's fuel-bound batch, and F9's TWO
// sand batches closed by ONE verdict (7-ish forecast sums 1 + 1 = 2).
const FACE43_MINI = [
  '[F12] the clock clips the batch: the 80s window completes ~7 of 18 x raw_copper (the rest re-smelts on the next chain)',
  '[F12] smelting 7 x raw_copper in a furnace (fuel: 3 x coal)',
  '[F18] fuel clips the batch: 5 x oak_planks completes 7 of 39 x cobblestone (the rest re-smelts on the next chain)',
  '[F18] the clock clips the batch: the 88s window completes ~8 of 39 x cobblestone (the rest re-smelts on the next chain)',
  '[F18] smelting 7 x cobblestone in a furnace (fuel: 5 x oak_planks)',
  '[F9] fuel clips the batch: 1 x oak_planks completes 1 of 15 x sand (the rest re-smelts on the next chain)',
  '[F9] the clock clips the batch: the 88s window completes ~8 of 15 x sand (the rest re-smelts on the next chain)',
  '[F9] smelting 1 x sand in a furnace (fuel: 1 x oak_planks)',
  '[F9] fuel clips the batch: 2 x oak_log completes 3 of 14 x sand (the rest re-smelts on the next chain)',
  '[F9] the clock clips the batch: the 16s window completes ~1 of 14 x sand (the rest re-smelts on the next chain)',
  '[F9] smelting 1 x sand in a furnace (fuel: 2 x oak_log)',
  'F12 smelted 7 (copper_ingot:7) rescued=0',
  'F18 smelted 7 (stone:7) rescued=0',
  'F9 smelted 2 (glass:2) rescued=0'
]

test('face 42 mini: the fuel-bound exact batch + the in-flight miss with its own fired tail', () => {
  const v = smeltVerdict(FACE42_MINI)
  assert.ok(v)
  assert.equal(v.batches, 4)
  assert.equal(v.verdicts, 4)
  assert.equal(v.openBatches, 0)
  // F17: fuel clip 2 < clock clip 7 -> fuel-bound, forecast 2, exact.
  const f17 = v.rows.find(r => r.bot === 'F17')
  assert.equal(f17.forecast, 2)
  assert.equal(f17.actual, 2)
  assert.equal(f17.exact, true)
  assert.equal(f17.batches[0].binding, 'fuel')
  assert.equal(f17.batches[0].minLawHeld, true)
  // F4: NO clip lines -> forecast = the full batch, binding none, and
  // the verdict says 0 with the fired tail - THE IN-FLIGHT MISS.
  const f4 = v.rows.find(r => r.bot === 'F4')
  assert.equal(f4.forecast, 2)
  assert.equal(f4.actual, 0)
  assert.equal(f4.fired, 2)
  assert.equal(f4.exact, false)
  assert.equal(f4.miss, 2)
  assert.equal(f4.batches[0].binding, 'none')
  assert.equal(f4.batches[0].minLawHeld, null)
  // F19/F13: fuel-bound exacts (stick fuel, floor of 1.5/2.5 per sticks).
  for (const bot of ['F19', 'F13']) {
    const r = v.rows.find(x => x.bot === bot)
    assert.equal(r.exact, true)
    assert.equal(r.batches[0].binding, 'fuel')
    assert.equal(r.fired, null)
  }
  // The window's aggregate: 4 verdicts, exact 3, miss 1, fired tail 1.
  assert.equal(v.exact, 3)
  assert.equal(v.misses.length, 1)
  assert.equal(v.overs.length, 0)
  assert.equal(v.firedTails, 1)
  assert.equal(v.actualTotal, 5)
  assert.equal(v.forecastTotal, 7)
  assert.equal(v.rescuedTotal, 0)
  // The min law: every clipped batch announced min(fuel, clock) verbatim.
  assert.deepEqual(v.minLaw, { checked: 3, held: 3 })
  // The binding split: 3 fuel + 1 none.
  assert.deepEqual(v.binding, { fuel: 3, clock: 0, tie: 0, none: 1 })
  // The fuel census (clip lines only): 12 sticks -> 5 completes.
  assert.deepEqual(v.fuelTable.stick, { n: 12, completes: 5 })
  assert.equal(v.fuelTable.coal, undefined)
})

test('face 43 mini: the clock-bound batch (no fuel clip) + the two-batch single verdict', () => {
  const v = smeltVerdict(FACE43_MINI)
  assert.ok(v)
  assert.equal(v.batches, 4)
  assert.equal(v.verdicts, 3)
  assert.equal(v.openBatches, 0)
  // F12: no fuel clip (the coal never ran out) -> clock-bound, exact.
  const f12 = v.rows.find(r => r.bot === 'F12')
  assert.equal(f12.forecast, 7)
  assert.equal(f12.actual, 7)
  assert.equal(f12.exact, true)
  assert.equal(f12.batches[0].binding, 'clock')
  assert.equal(f12.batches[0].minLawHeld, true)
  // F18: fuel 7 < clock 8 -> fuel-bound, exact.
  const f18 = v.rows.find(r => r.bot === 'F18')
  assert.equal(f18.forecast, 7)
  assert.equal(f18.actual, 7)
  assert.equal(f18.batches[0].binding, 'fuel')
  // F9: TWO open batches, ONE verdict - the forecast sums the mins
  // (1 + 1 = 2) and the verdict says 2 (glass:2).
  const f9 = v.rows.find(r => r.bot === 'F9')
  assert.equal(f9.batches.length, 2)
  assert.equal(f9.forecast, 2)
  assert.equal(f9.actual, 2)
  assert.equal(f9.exact, true)
  assert.deepEqual(f9.outputs, { glass: 2 })
  // The window's aggregate: all three verdicts exact, zero misses.
  assert.equal(v.exact, 3)
  assert.equal(v.misses.length, 0)
  assert.equal(v.actualTotal, 16)
  assert.equal(v.forecastTotal, 16)
  assert.deepEqual(v.minLaw, { checked: 4, held: 4 })
  assert.deepEqual(v.binding, { fuel: 2, clock: 2, tie: 0, none: 0 })
  // The fuel census: planks 6 -> 8, oak_log 2 -> 3, coal never clipped.
  assert.deepEqual(v.fuelTable.oak_planks, { n: 6, completes: 8 })
  assert.deepEqual(v.fuelTable.oak_log, { n: 2, completes: 3 })
  assert.equal(v.fuelTable.coal, undefined)
})

test('the both-faces aggregate: 9 batches, 8 verdicts, 8/9 exact, the one miss self-explained', () => {
  const v = smeltVerdict([...FACE42_MINI, ...FACE43_MINI])
  assert.equal(v.batches, 8)
  assert.equal(v.verdicts, 7)
  assert.equal(v.exact, 6)
  assert.equal(v.misses.length, 1)
  assert.equal(v.misses[0].bot, 'F4')
  assert.equal(v.firedTails, 1)
  assert.equal(v.actualTotal, 21)
  assert.equal(v.forecastTotal, 23)
  // The min law held on every clipped batch across both faces.
  assert.deepEqual(v.minLaw, { checked: 7, held: 7 })
  // The outputs ledger: stone 4 (face 42), copper 8, glass 2, stone 7...
  assert.equal(v.outputs.stone, 4 + 7)
  assert.equal(v.outputs.copper_ingot, 1 + 7)
  assert.equal(v.outputs.glass, 2)
})

test('the truncation edge: an open batch with no verdict stays open, an orphan clip is counted', () => {
  const v = smeltVerdict([
    '[F17] fuel clips the batch: 5 x stick completes 2 of 22 x cobblestone (the rest re-smelts on the next chain)',
    '[F17] smelting 2 x cobblestone in a furnace (fuel: 5 x stick)'
  ])
  assert.equal(v.batches, 1)
  assert.equal(v.verdicts, 0)
  assert.equal(v.openBatches, 1)
  assert.equal(v.orphanClips, 0)
  assert.equal(v.actualTotal, 0)
  // A clip whose start never came is the orphan (the announced
  // constraint with no batch to own it).
  const o = smeltVerdict(['[F9] fuel clips the batch: 1 x coal completes 8 of 30 x sand (the rest re-smelts on the next chain)'])
  assert.equal(o.orphanClips, 1)
  assert.equal(o.batches, 0)
  // The clips arrive BEFORE their start - the prelude order is the
  // live order (face 42's F17: clips at 1783-1784, the start at 1786).
  const pre = smeltVerdict([
    '[F9] fuel clips the batch: 2 x coal completes 16 of 30 x sand (the rest re-smelts on the next chain)',
    '[F9] the clock clips the batch: the 85s window completes ~7 of 30 x sand (the rest re-smelts on the next chain)',
    '[F9] smelting 7 x sand in a furnace (fuel: 2 x coal)',
    'F9 smelted 8 (glass:8) rescued=0'
  ])
  assert.equal(pre.rows[0].forecast, 7)
  assert.equal(pre.rows[0].batches[0].binding, 'clock')
  assert.equal(pre.rows[0].batches[0].minLawHeld, true)
  assert.equal(pre.orphanClips, 0)
})

test('a verdict with no seen start is unforecast (the truncation-blind class, never invented)', () => {
  const v = smeltVerdict(['F9 smelted 8 (glass:8) rescued=0'])
  assert.equal(v.verdicts, 1)
  assert.equal(v.rows[0].forecast, null)
  assert.equal(v.rows[0].exact, false)
  assert.equal(v.unforecast, 1)
  assert.equal(v.actualTotal, 8)
  assert.equal(v.forecastTotal, 0)
})

test('the verdict RE anchors: the status lines and the hold-skip line never match', () => {
  // The pulse/status skins carry 'smelted=' - never the verdict skin.
  assert.equal(SMELT_VERDICT_RE.test('t-0s alive=19/19 mined=1971 map=897p/17ch banked=0 smelted=5 pocket=1883u/254s'), false)
  assert.equal(SMELT_VERDICT_RE.test('bots=19 spawned=19 reconnects=13 tools=15 smelted=13 fights=21'), false)
  assert.equal(SMELT_VERDICT_RE.test('loot ledger: mined=1971 banked=0 smelted=13 pocket=1280u/187s accounted=1293'), false)
  // The bank's hold-skip and the camp furnace refusal are not verdicts.
  assert.equal(SMELT_VERDICT_RE.test('F9 bank: smelt hold skipped - no fuel in pocket (coal 0)'), false)
  assert.equal(SMELT_VERDICT_RE.test('F1 camp furnace: no build (nothing to smelt)'), false)
  assert.equal(SMELT_VERDICT_RE.test('F10 smelt: 0 (cobblestone@-: no fuel)'), false)
  // The refusal tail of the verdict family (no rescued) is refused.
  assert.equal(SMELT_VERDICT_RE.test('F1 smelted 2 (stone:2)'), false)
  // The live skin matches: empty parens, the fired tail, multi outputs.
  assert.ok(SMELT_VERDICT_RE.test('F4 smelted 0 () rescued=0 fired=2'))
  assert.ok(SMELT_VERDICT_RE.test('F17 smelted 2 (stone:2) rescued=0'))
  assert.ok(SMELT_VERDICT_RE.test('F9 smelted 8 (glass:8) rescued=0'))
})

test('junk / blob / zero battery', () => {
  assert.equal(smeltVerdict(null), null)
  assert.equal(smeltVerdict('a string'), null)
  assert.equal(smeltVerdict(42), null)
  const empty = smeltVerdict([])
  assert.ok(empty)
  assert.equal(empty.verdicts, 0)
  assert.equal(empty.batches, 0)
  assert.equal(empty.actualTotal, 0)
  const junk = smeltVerdict(['', 'junk line', 42, null, 'F1 smelted x (y) rescued=z'])
  assert.ok(junk)
  assert.equal(junk.verdicts, 0)
  assert.equal(junk.batches, 0)
})
