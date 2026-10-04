import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fuelCommonsGrainRow } from '../../src/lib/fuelbank.mjs'

// (v0.585.0) THE FUEL COMMONS' GRAIN - the supply front's own face seat.
// Five numbers fed at the smelt leg's fuelResupply seat; the row names the
// supply's own answer the face never read.

const face = { asks: 6, delivered: 0, units: 0, chests: 0, dry: 6 }

test('grain: zero asks stay lean (the supply was never needed)', () => {
  assert.equal(fuelCommonsGrainRow({ asks: 0, delivered: 0, units: 0, chests: 0, dry: 0 }), null)
})

test('grain: junk-safe - negative and non-finite floors read 0', () => {
  assert.equal(fuelCommonsGrainRow(null), null)
  assert.equal(fuelCommonsGrainRow({}), null)
  assert.equal(fuelCommonsGrainRow({ asks: -3, delivered: NaN, units: Infinity, chests: 'x', dry: -1 }), null)
  const r = fuelCommonsGrainRow({ asks: 4, delivered: -1, units: NaN, chests: -8, dry: 9 })
  assert.equal(r, 'smelt fuel commons grain: asked 4, delivered 0, dry 9 - every ask came up dry: the commons\' source is the front (the tithe is the only inflow)')
})

test('grain: every ask dry names the source (the face-0700 shape: dry 6/6)', () => {
  const r = fuelCommonsGrainRow(face)
  assert.equal(r, 'smelt fuel commons grain: asked 6, delivered 0, dry 6 - every ask came up dry: the commons\' source is the front (the tithe is the only inflow)')
})

test('grain: every ask fed says the line holds (byte-stable)', () => {
  const r = fuelCommonsGrainRow({ asks: 3, delivered: 3, units: 11, chests: 7, dry: 0 })
  assert.equal(r, 'smelt fuel commons grain: asked 3, delivered 3 (11u over 7 opens), dry 0 - every ask fed: the commons holds the supply line')
})

test('grain: a mix says the dry asks name the thin chests (byte-stable)', () => {
  const r = fuelCommonsGrainRow({ asks: 5, delivered: 2, units: 4, chests: 5, dry: 3 })
  assert.equal(r, 'smelt fuel commons grain: asked 5, delivered 2 (4u over 5 opens), dry 3 - the commons reads mixed: the dry asks name the thin chests')
})

test('grain: fractional junk floors honestly (2.9 asks -> 2)', () => {
  const r = fuelCommonsGrainRow({ asks: 2.9, delivered: 1.5, units: 3.2, chests: 1.1, dry: 1.4 })
  assert.equal(r, 'smelt fuel commons grain: asked 2, delivered 1 (3u over 1 opens), dry 1 - the commons reads mixed: the dry asks name the thin chests')
})

test('grain: delivered+dry === asks by the feed\'s construction (the feed law)', () => {
  // the feed counts every ask once: delivered when taken > 0, dry otherwise
  for (const [a, d] of [[1, 1], [4, 2], [9, 0]]) {
    const w = a - d
    const r = fuelCommonsGrainRow({ asks: a, delivered: d, units: d * 2, chests: d + 1, dry: w })
    assert.ok(r.startsWith(`smelt fuel commons grain: asked ${a}, delivered ${d}`))
  }
})

test('grain: the run46 pantry doctrine untouched - the row reads, it never re-prices the floors', () => {
  // the pantry said 'protected 6/0 - the floors hold their line'; the grain
  // adds the COMMONS' answer beside it, one book each, no cross-pricing
  const dry = fuelCommonsGrainRow(face)
  assert.ok(dry.includes('the commons\' source is the front'))
  assert.ok(!dry.includes('pantry'))
})
