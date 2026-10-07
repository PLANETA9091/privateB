// (v0.461.0) THE SMELT LEDGER's tests - the furnace lane's own words
// counted. Every fixture is a byte-verbatim live shape (faces 36..40:
// the START form stable, the two clip forms from face 39's F8 chain, the
// refusal family from face 40's idle lane). The clips are NOT batches -
// their asks already sat in a START line (the double-counting trap the
// split avoids). Junk judges nothing, non-array is null.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { smeltLedger, clipDebtRow, SMELT_START_RE, SMELT_FUEL_CLIP_RE, SMELT_CLOCK_CLIP_RE, SMELT_REFUSAL_RE, SMELT_TOOK_RE } from '../../src/lib/smeltledger.mjs'

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

// (v0.462.0) THE HARVEST LEG's tests - the smelted counter's own emitter
// twin, read. The took shape is byte-verbatim face 39/40 (the (k/batch)
// progress tail anchors it - the inventory lane's takes carry no tail);
// the join's both halves: the words' collected vs the counter's smelted
// delta (face 39 live: 19 lines of 1u = 19u vs +19u - the identity held,
// verified in the decompose row's own numbers).
test('smelt-ledger: the harvest leg - the took lines join the counter to the words', () => {
  // face 39's F2 chain verbatim: 3 takes of 1 ingot each, then a 1/1
  const lines = [
    '[F2] took 1 x copper_ingot (1/3)',
    '[F18] took 1 x stone (1/1)',
    '[F2] took 1 x copper_ingot (2/3)',
    '[F2] took 1 x copper_ingot (3/3)',
    '[F13] took 1 x copper_ingot (1/5)'
  ]
  const l = smeltLedger(lines)
  assert.equal(l.tooks, 5)
  assert.equal(l.collected, 5) // 5 lines of 1u each
  assert.equal(l.tookItems.copper_ingot, 4)
  assert.equal(l.tookItems.stone, 1)
  assert.equal(l.byBot.F2.collected, 3)
  assert.equal(l.byBot.F13.collected, 1)
  assert.equal(l.batches, 0) // the harvest leg never inflates the batch count
  // the multi-unit take (the shape allows N > 1) and the anchor law
  assert.equal(SMELT_TOOK_RE.test('[F2] took 4 x stone (2/5)'), true)
  assert.equal(SMELT_TOOK_RE.test('F2 took 1 x stone (1/1)'), false) // the bracket is part of the shape
  assert.equal(SMELT_TOOK_RE.test('[F2] took 1 x stone'), false) // no progress tail - the inventory lane's take
  const l2 = smeltLedger(['[F2] took 4 x stone (2/5)'])
  assert.equal(l2.collected, 4)
  assert.equal(l2.tookItems.stone, 4)
})

// ---- (v0.744.0) THE CLIP'S OWN DEBT ----

test('clip-debt: the 55th\'s own two clips - F4\'s raw_copper chain owed 49 units (live byte-verbatim shapes)', () => {
  const lines = [
    '[F4] smelting 33 x raw_copper in a furnace (fuel: 2 x coal)',
    '[F4] fuel clips the batch: 2 x coal completes 16 of 33 x raw_copper (the rest re-smelts on the next chain)',
    '[F4] the clock clips the batch: the 17s window completes ~1 of 33 x raw_copper (the rest re-smelts on the next chain)'
  ]
  const l = smeltLedger(lines)
  assert.equal(l.fuelClips, 1)
  assert.equal(l.clockClips, 1)
  // the old fields byte-stable beside the debt
  assert.equal(l.fuelClipCompleted, 16)
  assert.equal(l.fuelClipAsked, 33)
  assert.equal(l.clockClipCompleted, 1)
  assert.equal(l.clockClipAsked, 33)
  // the debt's own read: 17 fuel + 32 clock = 49 raw_copper
  assert.equal(l.clipDebt, 49)
  assert.equal(l.clipDebtFuel, 17)
  assert.equal(l.clipDebtClock, 32)
  assert.deepEqual(l.clipDebtItems, { raw_copper: 49 })
  assert.equal(l.byBot.F4.clipDebt, 49)
  const row = clipDebtRow(l)
  assert.ok(row)
  assert.equal(row, "the clip's own debt: the chains left 49 unit(s) smelting (fuel 17 / clock 32; raw_copper 49) - the furnace still owes the harvest")
})

test('clip-debt: the 53rd\'s own junk-diet clips - two bots, two items, the oak_log join', () => {
  const lines = [
    '[F6] fuel clips the batch: 2 x oak_log completes 3 of 4 x oak_log (the rest re-smelts on the next chain)',
    '[F2] fuel clips the batch: 3 x stick completes 1 of 2 x oak_log (the rest re-smelts on the next chain)'
  ]
  const l = smeltLedger(lines)
  assert.equal(l.clipDebt, 2, '1 + 1 - the two chains\' own deficits')
  assert.equal(l.clipDebtFuel, 2)
  assert.equal(l.clipDebtClock, 0)
  assert.deepEqual(l.clipDebtItems, { oak_log: 2 }, 'both bots\' debts join on the item')
  assert.equal(l.byBot.F6.clipDebt, 1)
  assert.equal(l.byBot.F2.clipDebt, 1)
  const row = clipDebtRow(l)
  assert.ok(row)
  assert.equal(row, "the clip's own debt: the chains left 2 unit(s) smelting (fuel 2 / clock 0; oak_log 2) - the furnace still owes the harvest")
})

test('clip-debt: the honest silences and the junk fences', () => {
  // no clips: the row stays silent, the fields read zero
  const quiet = smeltLedger(['[F2] smelting 3 x cobblestone in a furnace (fuel: 1 x coal)'])
  assert.equal(quiet.clipDebt, 0)
  assert.equal(clipDebtRow(quiet), null, 'zero clips = no row')
  assert.equal(clipDebtRow(null), null)
  assert.equal(clipDebtRow({}), null)
  // junk and non-string rows judge nothing
  const junked = smeltLedger([null, 42, 'fuel clips the batch: 2 x coal completes 16 of 33 x raw_copper', '[F4] fuel clips the batch: junk'])
  assert.equal(junked.clipDebt, 0)
  // the clip line without its bot prefix does not match (the bracketed
  // shape is the emitter's own)
  const bare = smeltLedger(['[F9] the clock clips the batch: the 21s window completes ~1 of 14 x raw_copper'])
  assert.equal(bare.clockClips, 1)
  assert.equal(bare.clipDebt, 13)
  assert.equal(bare.byBot.F9.clipDebt, 13)
})
