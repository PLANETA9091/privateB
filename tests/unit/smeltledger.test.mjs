// (v0.461.0) THE SMELT LEDGER's tests - the furnace lane's own words
// counted. Every fixture is a byte-verbatim live shape (faces 36..40:
// the START form stable, the two clip forms from face 39's F8 chain, the
// refusal family from face 40's idle lane). The clips are NOT batches -
// their asks already sat in a START line (the double-counting trap the
// split avoids). Junk judges nothing, non-array is null.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { smeltLedger, SMELT_START_RE, SMELT_FUEL_CLIP_RE, SMELT_CLOCK_CLIP_RE, SMELT_REFUSAL_RE } from '../../src/lib/smeltledger.mjs'

test('smelt-ledger: the batches, the fuel and the per-bot/per-item split (live face 36/39 shapes)', () => {
  const lines = [
    '[F8] smelting 6 x cobblestone in a furnace (fuel: 4 x oak_log)',
    '[F13] smelting 1 x raw_copper in a blast_furnace (fuel: 1 x coal)',
    '[F15] smelting 1 x cobblestone in a furnace (fuel: 4 x stick)',
    't-0s alive=19/19 mined=405 map=432p/9ch banked=21 smelted=0 pocket=433u/157s | sand=1 gravel=0 dirt=38 stone=0'
  ]
  const l = smeltLedger(lines)
  assert.equal(l.batches, 3)
  assert.equal(l.announced, 8) // 6 + 1 + 1 - the words' own sum
  assert.equal(l.items.cobblestone, 7)
  assert.equal(l.items.raw_copper, 1)
  assert.equal(l.furnaces.furnace, 2)
  assert.equal(l.furnaces.blast_furnace, 1)
  assert.equal(l.fuel, 9) // 4 + 1 + 4
  assert.equal(l.fuelItems.oak_log, 4)
  assert.equal(l.fuelItems.stick, 4)
  assert.equal(l.fuelItems.coal, 1)
  assert.equal(l.byBot.F8.batches, 1)
  assert.equal(l.byBot.F8.announced, 6)
  assert.equal(l.byBot.F15.fuel, 4)
  assert.equal(l.refusals, 0)
})

test('smelt-ledger: the clips are NOT batches - the chain\'s own throughput losses, completed/asked split', () => {
  // face 39's F8 chain verbatim: the batch announced, then the fuel and
  // the clock each clipped it (the rest re-smelts on the next chain)
  const lines = [
    '[F8] smelting 1 x raw_copper in a furnace (fuel: 5 x oak_log)',
    '[F8] fuel clips the batch: 5 x oak_log completes 7 of 14 x raw_copper (the rest re-smelts on the next chain)',
    '[F8] the clock clips the batch: the 21s window completes ~1 of 14 x raw_copper (the rest re-smelts on the next chain)'
  ]
  const l = smeltLedger(lines)
  assert.equal(l.batches, 1) // the clip lines never add batches
  assert.equal(l.announced, 1) // only the START's N counts here
  assert.equal(l.fuelClips, 1)
  assert.equal(l.fuelClipCompleted, 7)
  assert.equal(l.fuelClipAsked, 14)
  assert.equal(l.clockClips, 1)
  assert.equal(l.clockClipCompleted, 1)
  assert.equal(l.clockClipAsked, 14)
  assert.equal(l.byBot.F8.clips, 2)
  assert.equal(l.byBot.F8.batches, 1)
})

test('smelt-ledger: the refusal family by why (live face 40 idle shapes)', () => {
  const lines = [
    'F2 smelt: 0 (nothing to smelt)',
    'F6 smelt: 0 (nothing to smelt)',
    'F2 smelt: 0 (cobblestone@-: no fuel)',
    'F2 bank: smelt hold skipped - no fuel in pocket (coal 0)'
  ]
  const l = smeltLedger(lines)
  assert.equal(l.refusals, 3) // the hold-skip line is another lane's shape - not read here
  assert.equal(l.refusalWhys['nothing to smelt'], 2)
  assert.equal(l.refusalWhys['cobblestone@-: no fuel'], 1)
  assert.equal(l.batches, 0)
  assert.equal(l.byBot.F2.refusals, 2)
  assert.equal(l.byBot.F6.refusals, 1)
})

test('smelt-ledger: the regex anchors stay byte-verbatim - junk judges nothing, honest nulls', () => {
  // the article is 'a' in the live vocabulary - 'an' never shipped
  assert.equal(SMELT_START_RE.test('[F13] smelting 1 x raw_copper in an oven (fuel: 1 x coal)'), false)
  assert.equal(SMELT_START_RE.test('F13 smelting 1 x raw_copper in a furnace (fuel: 1 x coal)'), false) // the bracket is part of the shape
  assert.equal(SMELT_FUEL_CLIP_RE.test('[F8] fuel clips the batch: 5 x oak_log completes 7 of 14 x raw_copper (the rest re-smelts on the next chain)'), true)
  assert.equal(SMELT_CLOCK_CLIP_RE.test('[F8] the clock clips the batch: the 21s window completes ~1 of 14 x raw_copper (the rest re-smelts on the next chain)'), true)
  assert.equal(SMELT_REFUSAL_RE.test('F2 smelt: 0 (nothing to smelt)'), true)
  assert.equal(SMELT_REFUSAL_RE.test('[F2] smelt: 0 (nothing to smelt)'), false)
  const l = smeltLedger(['calm face', null, 42, 'F2 smelt: 0 (nothing to smelt)'])
  assert.equal(l.refusals, 1)
  assert.equal(l.batches, 0)
  assert.equal(smeltLedger('not an array'), null)
  assert.equal(smeltLedger(null), null)
})
