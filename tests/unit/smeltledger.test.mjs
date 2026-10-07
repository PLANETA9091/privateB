// (v0.461.0) THE SMELT LEDGER's tests - the furnace lane's own words
// counted. Every fixture is a byte-verbatim live shape (faces 36..40:
// the START form stable, the two clip forms from face 39's F8 chain, the
// refusal family from face 40's idle lane). The clips are NOT batches -
// their asks already sat in a START line (the double-counting trap the
// split avoids). Junk judges nothing, non-array is null.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { smeltLedger, clipDebtRow, clipDebtSeat, clipDebtSeatRow, clipPaybackRow, clipDietRow, clockWindowRow, clockAskRow, fuelClipClockVerdict, fuelClipClockRow, SMELT_START_RE, SMELT_FUEL_CLIP_RE, SMELT_CLOCK_CLIP_RE, SMELT_REFUSAL_RE, SMELT_TOOK_RE } from '../../src/lib/smeltledger.mjs'

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

// ---- (v0.745.0) THE RE-SMELT SHADOW'S PAYBACK ----

test('clip-payback: the 55th\'s own chain stands alone - no later chain ever re-announced the clipped batch', () => {
  // the 55th's F4 chain byte-verbatim, and the face's own truth: the
  // next chain never came for F4's raw_copper (the 49 units sat mid-smelt)
  const lines = [
    '[F4] smelting 33 x raw_copper in a furnace (fuel: 2 x coal)',
    '[F4] fuel clips the batch: 2 x coal completes 16 of 33 x raw_copper (the rest re-smelts on the next chain)',
    '[F4] the clock clips the batch: the 17s window completes ~1 of 33 x raw_copper (the rest re-smelts on the next chain)'
  ]
  const l = smeltLedger(lines)
  assert.equal(l.clipDebt, 49)
  assert.equal(l.clipDebtReannounced, 0)
  assert.equal(l.clipDebtOpen, 49, 'the whole debt stands open - the IOU alone')
  assert.equal(l.paybackChains, 0)
  assert.equal(l.paybackUnits, 0)
  const row = clipPaybackRow(l)
  assert.ok(row)
  assert.equal(row, "the re-smelt shadow's payback: no chain ever returned for the 49 unit(s) the clips left smelting - the IOU stands alone")
})

test('clip-payback: the promised return - a later START on the same bot+item answers the debt', () => {
  const lines = [
    '[F4] smelting 33 x raw_copper in a furnace (fuel: 2 x coal)',
    '[F4] fuel clips the batch: 2 x coal completes 16 of 33 x raw_copper (the rest re-smelts on the next chain)',
    '[F4] the clock clips the batch: the 17s window completes ~1 of 33 x raw_copper (the rest re-smelts on the next chain)',
    '[F4] smelting 17 x raw_copper in a furnace (fuel: 2 x coal)'
  ]
  const l = smeltLedger(lines)
  assert.equal(l.clipDebt, 49)
  assert.equal(l.clipDebtReannounced, 49, 'the whole debt answered by the return')
  assert.equal(l.clipDebtOpen, 0)
  assert.equal(l.paybackChains, 1)
  assert.equal(l.paybackUnits, 17, 'the return chain re-announced 17 units')
  const row = clipPaybackRow(l)
  assert.equal(row, "the re-smelt shadow's payback: 1 chain(s) returned for the clipped batches (17 unit(s) re-announced of 49 owed) - 0 still unanswered")
  // the old batch fields byte-stable: both STARTs count as batches
  assert.equal(l.batches, 2)
  assert.equal(l.announced, 50)
})

test('clip-payback: the bot+item fences - the wrong bot and the wrong item never pay another\'s debt', () => {
  const lines = [
    '[F4] smelting 33 x raw_copper in a furnace (fuel: 2 x coal)',
    '[F4] fuel clips the batch: 2 x coal completes 16 of 33 x raw_copper (the rest re-smelts on the next chain)',
    '[F5] smelting 20 x raw_copper in a furnace (fuel: 2 x coal)', // another bot's chain - not F4's return
    '[F4] smelting 10 x oak_log in a furnace (fuel: 1 x coal)', // another item's chain - not raw_copper's
    '[F4] smelting 8 x raw_copper in a furnace (fuel: 2 x coal)' // THE return - bot+item both match
  ]
  const l = smeltLedger(lines)
  assert.equal(l.paybackChains, 1, 'only the bot+item match answers')
  assert.equal(l.paybackUnits, 8)
  assert.equal(l.clipDebtReannounced, 17)
  assert.equal(l.clipDebtOpen, 0)
  // the debt bookkeeping untouched by the answer (STARTs mint no debt)
  assert.equal(l.byBot.F4.clipDebt, 17)
})

test('clip-payback: the mixed face - one chain answered, one stands alone', () => {
  const lines = [
    '[F6] fuel clips the batch: 2 x oak_log completes 3 of 4 x oak_log (the rest re-smelts on the next chain)',
    '[F2] the clock clips the batch: the 21s window completes ~1 of 14 x raw_copper (the rest re-smelts on the next chain)',
    '[F6] smelting 4 x oak_log in a furnace (fuel: 2 x oak_log)' // F6's return - F2's debt stays open
  ]
  const l = smeltLedger(lines)
  assert.equal(l.clipDebt, 14, '1 (F6 oak_log, fuel 3 of 4) + 13 (F2 raw_copper, clock ~1 of 14)')
  assert.equal(l.clipDebtReannounced, 1)
  assert.equal(l.clipDebtOpen, 13)
  assert.equal(l.paybackChains, 1)
  assert.equal(l.paybackUnits, 4)
  const row = clipPaybackRow(l)
  assert.equal(row, "the re-smelt shadow's payback: 1 chain(s) returned for the clipped batches (4 unit(s) re-announced of 14 owed) - 13 still unanswered")
})

test('clip-payback: the honest silences, the order law and the junk fences', () => {
  const quiet = smeltLedger(['[F2] smelting 3 x cobblestone in a furnace (fuel: 1 x coal)'])
  assert.equal(quiet.clipDebt, 0)
  assert.equal(quiet.clipDebtReannounced, 0)
  assert.equal(quiet.clipDebtOpen, 0)
  assert.equal(quiet.paybackChains, 0)
  assert.equal(clipPaybackRow(quiet), null, 'zero clips = no row')
  assert.equal(clipPaybackRow(null), null)
  assert.equal(clipPaybackRow({}), null)
  // a START before any clip never mints a payback (the order is the law)
  const early = smeltLedger([
    '[F4] smelting 33 x raw_copper in a furnace (fuel: 2 x coal)',
    '[F4] fuel clips the batch: 2 x coal completes 16 of 33 x raw_copper (the rest re-smelts on the next chain)'
  ])
  assert.equal(early.paybackChains, 0)
  assert.equal(early.clipDebtOpen, 17)
  // junk rows never mint debts, never answer them
  const junked = smeltLedger([null, 42, 'smelting 3 x raw_copper in a furnace (fuel: 1 x coal)', '[F4] fuel clips the batch: junk'])
  assert.equal(junked.clipDebt, 0)
  assert.equal(junked.clipDebtOpen, 0)
  assert.equal(junked.paybackChains, 0)
})

// ---- (v0.747.0) THE CLIP'S OWN DIET ----

test('clip-diet: the 55th\'s own fuel clip paid in full - 2 coal, capacity 16, delivered 16 (the ask\'s own price)', () => {
  const lines = [
    '[F4] smelting 33 x raw_copper in a furnace (fuel: 2 x coal)',
    '[F4] fuel clips the batch: 2 x coal completes 16 of 33 x raw_copper (the rest re-smelts on the next chain)',
    '[F4] the clock clips the batch: the 17s window completes ~1 of 33 x raw_copper (the rest re-smelts on the next chain)'
  ]
  const l = smeltLedger(lines)
  // the old fields byte-stable beside the diet
  assert.equal(l.fuelClipCompleted, 16)
  assert.equal(l.fuelClipAsked, 33)
  // the diet's own read
  assert.equal(l.fuelClipFuel, 2)
  assert.deepEqual(l.fuelClipFuelItems, { coal: 2 })
  assert.equal(l.fuelClipCapacity, 16, '2 x fuelYieldOf(coal)=8 - the vanilla bar, never a made constant')
  const row = clipDietRow(l)
  assert.ok(row)
  assert.equal(row, "the clip's own diet: the fuel clips burned 2 fuel-unit(s) (coal 2) for 16 completed unit(s) - the vanilla capacity 16 paid 100% (the fuel died at its own capacity - the ask's own price)")
})

test('clip-diet: the 53rd\'s junk diet - two fuels, the tail unpaid (the window\'s own tax)', () => {
  const lines = [
    '[F6] fuel clips the batch: 2 x oak_log completes 3 of 4 x oak_log (the rest re-smelts on the next chain)',
    '[F2] fuel clips the batch: 3 x stick completes 1 of 2 x oak_log (the rest re-smelts on the next chain)'
  ]
  const l = smeltLedger(lines)
  assert.equal(l.fuelClipFuel, 5)
  assert.deepEqual(l.fuelClipFuelItems, { oak_log: 2, stick: 3 })
  assert.equal(l.fuelClipCapacity, 4.5, '2 x 1.5 + 3 x 0.5 - the vanilla bar')
  const row = clipDietRow(l)
  assert.equal(row, "the clip's own diet: the fuel clips burned 5 fuel-unit(s) (stick 3, oak_log 2) for 4 completed unit(s) - the vanilla capacity 4.5 paid 89% (the capacity's own tail unpaid - the window's own tax rode the same chain)")
})

test('clip-diet: face 39\'s own chain - 5 oak_log for 7 of 14 (the 93% tail)', () => {
  const lines = [
    '[F8] smelting 1 x raw_copper in a furnace (fuel: 5 x oak_log)',
    '[F8] fuel clips the batch: 5 x oak_log completes 7 of 14 x raw_copper (the rest re-smelts on the next chain)',
    '[F8] the clock clips the batch: the 21s window completes ~1 of 14 x raw_copper (the rest re-smelts on the next chain)'
  ]
  const l = smeltLedger(lines)
  assert.equal(l.fuelClipFuel, 5)
  assert.equal(l.fuelClipCapacity, 7.5)
  const row = clipDietRow(l)
  assert.equal(row, "the clip's own diet: the fuel clips burned 5 fuel-unit(s) (oak_log 5) for 7 completed unit(s) - the vanilla capacity 7.5 paid 93% (the capacity's own tail unpaid - the window's own tax rode the same chain)")
})

test('clip-diet: the honest silences, the unknown-fuel gap and the junk fences', () => {
  // clock-only faces read the honest silence (the diet is the fuel side)
  const clockOnly = smeltLedger(['[F9] the clock clips the batch: the 21s window completes ~1 of 14 x raw_copper'])
  assert.equal(clockOnly.fuelClips, 0)
  assert.equal(clockOnly.fuelClipFuel, 0)
  assert.equal(clipDietRow(clockOnly), null, 'zero fuel clips = no row')
  assert.equal(clipDietRow(null), null)
  assert.equal(clipDietRow({}), null)
  // an unknown fuel's capacity is the honest gap, never a guess
  const unknown = smeltLedger(['[F7] fuel clips the batch: 4 x mystery_fuel completes 2 of 9 x raw_copper (the rest re-smelts on the next chain)'])
  assert.equal(unknown.fuelClipFuel, 4)
  assert.equal(unknown.fuelClipCapacity, 0)
  assert.equal(clipDietRow(unknown), "the clip's own diet: the fuel clips burned 4 fuel-unit(s) (mystery_fuel 4) for 2 completed unit(s) - the vanilla capacity unreadable (unknown fuel) - the honest gap")
  // junk rows never mint a diet
  const junked = smeltLedger([null, 42, 'fuel clips the batch: 2 x coal completes 16 of 33 x raw_copper'])
  assert.equal(junked.fuelClips, 0)
  assert.equal(junked.fuelClipFuel, 0)
})

// ---- (v0.750.0) THE PLAN'S OWN MARGIN (the clock window's own correction) ----

test('clock-window: the 58th\'s six windows - 190s, 16 unit(s) put, capacity 19, 35s of the plan\'s own idle', () => {
  const lines = [
    '[F14] fuel clips the batch: 3 x oak_log completes 4 of 6 x cobblestone (the rest re-smelts on the next chain)',
    '[F1] the clock clips the batch: the 83s window completes ~7 of 36 x raw_copper (the rest re-smelts on the next chain)',
    '[F1] the clock clips the batch: the 47s window completes ~4 of 29 x raw_copper (the rest re-smelts on the next chain)',
    '[F1] the clock clips the batch: the 24s window completes ~2 of 25 x raw_copper (the rest re-smelts on the next chain)',
    '[F14] the clock clips the batch: the 18s window completes ~1 of 2 x cobblestone (the rest re-smelts on the next chain)',
    '[F1] the clock clips the batch: the 13s window completes ~1 of 23 x raw_copper (the rest re-smelts on the next chain)',
    '[F1] fuel clips the batch: 2 x coal completes 16 of 22 x raw_copper (the rest re-smelts on the next chain)',
    '[F1] the clock clips the batch: the 5s window completes ~1 of 22 x raw_copper (the rest re-smelts on the next chain)'
  ]
  const l = smeltLedger(lines)
  // the old fields byte-stable beside the window
  assert.equal(l.clockClips, 6)
  assert.equal(l.clockClipCompleted, 16)
  assert.equal(l.clockClipAsked, 137)
  assert.equal(l.clipDebtClock, 121)
  // the window's own read - integer seconds, one division at the row
  assert.equal(l.clockClipWindowSec, 190, '83+47+24+18+13+5 - the line\'s own seconds, matched and dropped before')
  // (v0.750.0) the plan's own margin: per clip max(0, W - 10 x cap)
  // 83-70=13, 47-40=7, 24-20=4, 18-10=8, 13-10=3, 5-10<0=0 -> 35
  assert.equal(l.clockClipIdleSec, 35)
  // the ~C is the plan's own cap - floor(W/11) at the emitter, verified per window
  assert.equal(7, Math.floor(83 / 11))
  assert.equal(4, Math.floor(47 / 11))
  assert.equal(2, Math.floor(24 / 11))
  assert.equal(1, Math.floor(18 / 11))
  assert.equal(1, Math.floor(13 / 11))
  assert.equal(1, Math.max(1, Math.floor(5 / 11)))
  const row = clockWindowRow(l)
  assert.ok(row)
  assert.equal(row, "the clock's own window: the clock clips burned 190s of window for 16 unit(s) put (the plan's own cap) - the vanilla capacity 19 left 35s idle (the plan's own 11s bar is the tax - the harvest's own margin)")
})

test('clock-window: the overshoot class - the plan\'s own puts outran the vanilla bar (the tail rides the next chain)', () => {
  // 20s window put 2 (the plan's cap) - the vanilla bar consumed exactly (20 - 20 = 0 idle)
  const beat = smeltLedger(['[F7] the clock clips the batch: the 20s window completes ~2 of 36 x raw_copper (the rest re-smelts on the next chain)'])
  assert.equal(beat.clockClipWindowSec, 20)
  assert.equal(beat.clockClipIdleSec, 0)
  assert.equal(clockWindowRow(beat), "the clock's own window: the clock clips burned 20s of window for 2 unit(s) put (the plan's own cap) - the vanilla capacity 2 left 0s idle (the plan's own puts outran the vanilla bar - the window's tail rides the next chain)")
  // a short window's one-item floor puts past the vanilla bar (5s put 1, bar 0.5 - the item finishes at 10s, past the window)
  const over = smeltLedger(['[F2] the clock clips the batch: the 5s window completes ~1 of 22 x raw_copper (the rest re-smelts on the next chain)'])
  assert.equal(over.clockClipWindowSec, 5)
  assert.equal(over.clockClipIdleSec, 0, '5 - 10 x 1 < 0 - floored at 0')
  assert.equal(clockWindowRow(over), "the clock's own window: the clock clips burned 5s of window for 1 unit(s) put (the plan's own cap) - the vanilla capacity 0.5 left 0s idle (the plan's own puts outran the vanilla bar - the window's tail rides the next chain)")
})

test('clock-window: the non-integer capacity renders the vanilla decimal (47s -> 4.7, 7s idle)', () => {
  const l = smeltLedger(['[F1] the clock clips the batch: the 47s window completes ~4 of 29 x raw_copper (the rest re-smelts on the next chain)'])
  assert.equal(l.clockClipWindowSec, 47)
  assert.equal(l.clockClipIdleSec, 7, '47 - 10 x 4')
  assert.equal(clockWindowRow(l), "the clock's own window: the clock clips burned 47s of window for 4 unit(s) put (the plan's own cap) - the vanilla capacity 4.7 left 7s idle (the plan's own 11s bar is the tax - the harvest's own margin)")
})

test('clock-window: the honest silences and the junk fences', () => {
  // fuel-only faces read the honest silence (the window is the clock side)
  const fuelOnly = smeltLedger(['[F4] fuel clips the batch: 2 x coal completes 16 of 33 x raw_copper (the rest re-smelts on the next chain)'])
  assert.equal(fuelOnly.clockClips, 0)
  assert.equal(fuelOnly.clockClipWindowSec, 0)
  assert.equal(fuelOnly.clockClipIdleSec, 0)
  assert.equal(clockWindowRow(fuelOnly), null, 'zero clock clips = no row')
  assert.equal(clockWindowRow(null), null)
  assert.equal(clockWindowRow({}), null)
  // junk rows never mint a window
  const junked = smeltLedger([null, 42, 'the clock clips the batch: the 21s window completes ~1 of 14 x raw_copper'])
  assert.equal(junked.clockClips, 0)
  assert.equal(junked.clockClipWindowSec, 0)
  assert.equal(junked.clockClipIdleSec, 0)
})

// ---- (v0.749.0) THE CLOCK ASK'S OWN SCALE ----

test('clock-ask: the 58th\'s own scale - the windows\' whole worth 19 = 14% of the 137 asked (the batch\'s own size owned the debt)', () => {
  const lines = [
    '[F1] the clock clips the batch: the 83s window completes ~7 of 36 x raw_copper (the rest re-smelts on the next chain)',
    '[F1] the clock clips the batch: the 47s window completes ~4 of 29 x raw_copper (the rest re-smelts on the next chain)',
    '[F1] the clock clips the batch: the 24s window completes ~2 of 25 x raw_copper (the rest re-smelts on the next chain)',
    '[F14] the clock clips the batch: the 18s window completes ~1 of 2 x cobblestone (the rest re-smelts on the next chain)',
    '[F1] the clock clips the batch: the 13s window completes ~1 of 23 x raw_copper (the rest re-smelts on the next chain)',
    '[F1] the clock clips the batch: the 5s window completes ~1 of 22 x raw_copper (the rest re-smelts on the next chain)'
  ]
  const l = smeltLedger(lines)
  // the v0.748.0 fields byte-stable beside the ask row
  assert.equal(l.clockClips, 6)
  assert.equal(l.clockClipWindowSec, 190)
  assert.equal(l.clockClipAsked, 137)
  const row = clockAskRow(l)
  assert.ok(row)
  assert.equal(row, "the clock ask's own scale: the windows' vanilla worth 19 = 14% of the 137 asked unit(s) - the batch's own size owned the debt (the windows could never have paid it)")
})

test('clock-ask: the covered ask reads the honest silence (the metronome\'s own side, the v0.748.0 row\'s read)', () => {
  // capacity 12 covers the 9 asked - the batch WAS finishable, the debt
  // is the chains' own pace: not this row's read
  const covered = smeltLedger(['[F2] the clock clips the batch: the 120s window completes ~5 of 9 x raw_copper (the rest re-smelts on the next chain)'])
  assert.equal(covered.clockClipWindowSec, 120)
  assert.equal(clockAskRow(covered), null, 'capacity >= asked = no row')
  assert.equal(clockAskRow(null), null)
  assert.equal(clockAskRow({}), null)
  // junk rows never mint an ask row
  const junked = smeltLedger([null, 42, 'the clock clips the batch: the 83s window completes ~7 of 36 x raw_copper'])
  assert.equal(junked.clockClips, 0)
  assert.equal(clockAskRow(junked), null)
})

// (v0.764.0) THE CLIP DEBT'S OWN SEAT - the v0.744.0 row priced the debt,
// never WHICH class owns it. Face 68's own cell: the six real clip lines
// (byte-verbatim, the mine's own witness: fuel 13 / clock 3 of 16) -> the
// fuel's own seat, the v0.744.0 row's bytes untouched beside it.
test('v0.764.0 the clip debt seat: face 68\'s own cell (fuel owns 13 of 16, the v0.744.0 row byte-untouched)', () => {
  const FACE68 = [
    '[F4] fuel clips the batch: 1 x birch_log completes 1 of 6 x cobblestone (the rest re-smelts on the next chain)',
    '[F17] fuel clips the batch: 2 x oak_log completes 3 of 4 x oak_log (the rest re-smelts on the next chain)',
    '[F17] the clock clips the batch: the 18s window completes ~1 of 4 x oak_log (the rest re-smelts on the next chain)',
    '[F18] fuel clips the batch: 3 x oak_log completes 4 of 6 x cobblestone (the rest re-smelts on the next chain)',
    '[F18] fuel clips the batch: 2 x stick completes 1 of 4 x oak_log (the rest re-smelts on the next chain)',
    '[F7] fuel clips the batch: 3 x stick completes 1 of 3 x oak_log (the rest re-smelts on the next chain)',
  ]
  const l = smeltLedger(FACE68)
  assert.equal(l.clipDebt, 16)
  assert.equal(l.clipDebtFuel, 13)
  assert.equal(l.clipDebtClock, 3)
  const s = clipDebtSeat(l)
  assert.deepEqual(s, { owner: 'fuel', units: 13, total: 16, shareOfDebt: 0.813 })
  assert.equal(
    clipDebtSeatRow(l),
    `the clip debt's own seat (v0.764.0): fuel owns 13 of 16 unit(s) (81.3%) - THE FUEL'S OWN DEBT: the furnace starves mid-batch - re-prime the fuel before the walk`
  )
  assert.equal(
    clipDebtRow(l),
    `the clip's own debt: the chains left 16 unit(s) smelting (fuel 13 / clock 3; oak_log 9, cobblestone 7) - the furnace still owes the harvest`
  )
})

// (v0.764.0) the clock's own seat - the 55th's own split (fuel 17 /
// clock 32 of 49: the clock ate the batch) rides the other prose. The
// why mix is face-local - the two cells are the lens's own witness.
test('v0.764.0 the clock\'s own seat (the 55th\'s split: fuel 17 / clock 32)', () => {
  const FACE55 = [
    '[F4] fuel clips the batch: 5 x oak_log completes 7 of 14 x raw_copper (the rest re-smelts on the next chain)',
    '[F8] fuel clips the batch: 4 x coal completes 2 of 12 x raw_copper (the rest re-smelts on the next chain)',
    '[F4] the clock clips the batch: the 21s window completes ~1 of 14 x raw_copper (the rest re-smelts on the next chain)',
    '[F4] the clock clips the batch: the 17s window completes ~1 of 20 x raw_copper (the rest re-smelts on the next chain)',
  ]
  const l = smeltLedger(FACE55)
  assert.equal(l.clipDebt, 49)
  assert.equal(l.clipDebtFuel, 17)
  assert.equal(l.clipDebtClock, 32)
  const s = clipDebtSeat(l)
  assert.deepEqual(s, { owner: 'clock', units: 32, total: 49, shareOfDebt: 0.653 })
  assert.equal(
    clipDebtSeatRow(l),
    `the clip debt's own seat (v0.764.0): clock owns 32 of 49 unit(s) (65.3%) - THE CLOCK'S OWN DEBT: the chain's own clock ate the batch - arm the smelt earlier`
  )
})

// (v0.764.0) the tie law (a tie owns nothing - the storm-has-no-seat
// precedent) + the junk battery: a missing/absent ledger, a non-finite
// or negative class, a zero total -> the honest silence.
test('v0.764.0 the tie owns nothing + the seat junk battery', () => {
  const TIE = [
    '[F4] fuel clips the batch: 5 x oak_log completes 7 of 14 x raw_copper (the rest re-smelts on the next chain)',
    '[F4] the clock clips the batch: the 21s window completes ~1 of 14 x raw_copper (the rest re-smelts on the next chain)',
  ]
  const tl = smeltLedger(TIE)
  assert.equal(tl.clipDebtFuel, 7)
  assert.equal(tl.clipDebtClock, 13) // not a tie at the line level - build the tie at the seat's own door
  assert.equal(clipDebtSeat({ clipDebtFuel: 5, clipDebtClock: 5 }), null)
  assert.equal(clipDebtSeatRow({ clipDebtFuel: 5, clipDebtClock: 5 }), null)
  assert.equal(clipDebtSeat(null), null)
  assert.equal(clipDebtSeat('junk'), null)
  assert.equal(clipDebtSeat({}), null)
  assert.equal(clipDebtSeat({ clipDebtFuel: 0, clipDebtClock: 0 }), null)
  assert.equal(clipDebtSeat({ clipDebtFuel: -1, clipDebtClock: 3 }), null)
  assert.equal(clipDebtSeat({ clipDebtFuel: Number.NaN, clipDebtClock: 3 }), null)
  assert.equal(clipDebtSeat({ clipDebtFuel: 3, clipDebtClock: 'x' }), null)
  assert.equal(clipDebtSeatRow(null), null)
  assert.equal(clipDebtSeatRow({}), null)
})

// (v0.764.0) the WIRING assert: the decompose mine prints the seat row
// beside the v0.744.0 debt row (the additive law - both call sites in
// the source, the seat guard reads the same one truth).
test('v0.764.0 the seat rides the decompose mine (WIRING)', async () => {
  const { readFileSync } = await import('node:fs')
  const src = readFileSync(new URL('../../scripts/fleet-mining/decompose.mjs', import.meta.url), 'utf8')
  assert.equal(src.includes('clipDebtSeatRow'), true)
  assert.equal(src.includes("the clip debt's own seat"), false) // the prose lives in the lib, never duplicated in the mine
})

// (v0.775.0) THE FUEL CLIP'S OWN CLOCK - the fuel side's own WHEN. The
// v0.764.0 seat priced WHICH class owns the clip debt; the phase book
// rides the pulse rail (the zeroclock's own bracket law: the MIDPOINT of
// lo/hi classifies into the clock's thirds, a missing end reads
// 'unplaced', a bracket wider than a third counts wide).
test('v0.775.0 the fuel clips\u2019 phase book rides the pulse rail (the bracket law)', () => {
  const lines = [
    '[F8] fuel clips the batch: 2 x coal completes 3 of 10 x raw_copper', // idx0: before any anchor -> unplaced
    'b] n=1 ts=30s rss=300M', // anchor ts=30
    '[F8] fuel clips the batch: 2 x coal completes 3 of 10 x raw_copper', // idx2: lo=30 hi=300 mid=165 <= 320 -> early
    'b] n=2 ts=300s rss=300M', // anchor ts=300
    '[F8] fuel clips the batch: 2 x coal completes 3 of 10 x raw_copper', // idx4: lo=300 hi=600 mid=450 <= 640 -> mid
    'b] n=3 ts=600s rss=300M', // anchor ts=600
    '[F8] fuel clips the batch: 2 x coal completes 3 of 10 x raw_copper', // idx6: lo=600 hi=960 mid=780 -> late; hi-lo=360 > 320 -> wide
    'b] n=4 ts=960s rss=300M', // anchor ts=960 (clockEnd, thirdS=320)
    '[F8] fuel clips the batch: 2 x coal completes 3 of 10 x raw_copper', // idx8: no hi -> unplaced
    '[F8] fuel clips the batch: 2 x coal completes 3 of 10 x raw_copper' // idx9: no hi -> unplaced
  ]
  const l = smeltLedger(lines)
  assert.equal(l.fuelClips, 6)
  assert.equal(l.clipDebtFuel, 42) // the old cells stay byte-stable beside the new one (the additive law)
  assert.deepEqual(l.fuelClipClock, { anchors: 4, clockEnd: 960, thirdS: 320, n: 6, byPhase: { early: 1, mid: 1, late: 1, unplaced: 3 }, wide: 1 })
  // a 1/1/1 spread owns nothing (the 2:1 law reads the honest silence)
  assert.equal(fuelClipClockVerdict(l), null)
})

test('v0.775.0 the verdict reads the field\u2019s own three shapes (the 2:1 dominance law)', () => {
  // the face-70 shape: 3 of 3 late (the fuel's own 100% debt face)
  const late = fuelClipClockVerdict({ fuelClipClock: { anchors: 38, clockEnd: 761, thirdS: 253.66666666666666, n: 3, byPhase: { early: 0, mid: 0, late: 3, unplaced: 0 }, wide: 0 } })
  assert.equal(late.verdict, 'late')
  assert.equal(late.n, 3)
  // the face-71 shape: 2 of 2 mid
  assert.equal(fuelClipClockVerdict({ fuelClipClock: { anchors: 31, clockEnd: 621, thirdS: 207, n: 2, byPhase: { early: 0, mid: 2, late: 0, unplaced: 0 }, wide: 0 } }).verdict, 'mid')
  // the early shape: 3 of 4
  assert.equal(fuelClipClockVerdict({ fuelClipClock: { anchors: 30, clockEnd: 900, thirdS: 300, n: 4, byPhase: { early: 3, mid: 0, late: 0, unplaced: 1 }, wide: 0 } }).verdict, 'early')
  // the face-72 shape: the 4/4 split owns nothing
  assert.equal(fuelClipClockVerdict({ fuelClipClock: { anchors: 46, clockEnd: 921, thirdS: 307, n: 8, byPhase: { early: 0, mid: 4, late: 4, unplaced: 0 }, wide: 0 } }), null)
  // the honest silences: no clips, no ledger
  assert.equal(fuelClipClockVerdict({ fuelClipClock: { anchors: 10, clockEnd: 300, thirdS: 100, n: 0, byPhase: { early: 0, mid: 0, late: 0, unplaced: 0 }, wide: 0 } }), null)
  assert.equal(fuelClipClockVerdict(null), null)
  assert.equal(fuelClipClockVerdict({}), null)
})

test('v0.775.0 the clock rows speak byte-exact and junk never prints', () => {
  const late = fuelClipClockRow({ verdict: 'late', n: 3, byPhase: { early: 0, mid: 0, late: 3, unplaced: 0 }, anchors: 38, wide: 0, thirdS: 253.66666666666666 })
  assert.equal(late, `the fuel clip's own clock (v0.775.0): the fuel clips rode LATE-dominant (3 of 3; early 0 / mid 0 / late 3 / unplaced 0, 0 wide of 38 anchor(s)) - the deadline's own signature: the furnace starves on the closing walks - re-prime the fuel before the walk`)
  const mid = fuelClipClockRow({ verdict: 'mid', n: 2, byPhase: { early: 0, mid: 2, late: 0, unplaced: 0 }, anchors: 31, wide: 0, thirdS: 207 })
  assert.equal(mid, `the fuel clip's own clock (v0.775.0): the fuel clips rode MID-dominant (2 of 2; early 0 / mid 2 / late 0 / unplaced 0, 0 wide of 31 anchor(s)) - the mid-run churn is the lever - the batch's own pace prices the priming`)
  const early = fuelClipClockRow({ verdict: 'early', n: 4, byPhase: { early: 3, mid: 0, late: 0, unplaced: 1 }, anchors: 30, wide: 0, thirdS: 300 })
  assert.equal(early, `the fuel clip's own clock (v0.775.0): the fuel clips rode EARLY-dominant (3 of 4; early 3 / mid 0 / late 0 / unplaced 1, 0 wide of 30 anchor(s)) - the opening's own defect: the priming is the front - the first chains starve the batch`)
  for (const junk of [undefined, null, 42, 'str', {}, { verdict: 'mixed', n: 4, byPhase: { early: 2, mid: 2, late: 0, unplaced: 0 }, anchors: 5, wide: 0 }, { verdict: 'late', n: -1, byPhase: { early: 0, mid: 0, late: 0, unplaced: 0 }, anchors: 5, wide: 0 }, { verdict: 'late', n: 3, byPhase: null, anchors: 5, wide: 0 }]) {
    assert.equal(fuelClipClockRow(junk), null, `the row must stay silent on ${JSON.stringify(junk)}`)
  }
})

test('v0.775.0 the clock rides the decompose mine (WIRING)', async () => {
  const { readFileSync } = await import('node:fs')
  const src = readFileSync(new URL('../../scripts/fleet-mining/decompose.mjs', import.meta.url), 'utf8')
  assert.equal(src.includes('fuelClipClockVerdict(sl)'), true)
  assert.equal(src.includes('fuelClipClockRow(fccv)'), true)
  assert.equal(src.includes("the fuel clip's own clock"), false) // the prose lives in the lib, never duplicated in the mine
  assert.equal(src.includes('the fuel clips rode LATE-dominant'), false)
})
