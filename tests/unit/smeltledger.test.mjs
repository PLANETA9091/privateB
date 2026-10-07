// (v0.461.0) THE SMELT LEDGER's tests - the furnace lane's own words
// counted. Every fixture is a byte-verbatim live shape (faces 36..40:
// the START form stable, the two clip forms from face 39's F8 chain, the
// refusal family from face 40's idle lane). The clips are NOT batches -
// their asks already sat in a START line (the double-counting trap the
// split avoids). Junk judges nothing, non-array is null.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { smeltLedger, clipDebtRow, clipPaybackRow, clipDietRow, clockWindowRow, clockAskRow, SMELT_START_RE, SMELT_FUEL_CLIP_RE, SMELT_CLOCK_CLIP_RE, SMELT_REFUSAL_RE, SMELT_TOOK_RE } from '../../src/lib/smeltledger.mjs'

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

// ---- (v0.748.0) THE CLOCK'S OWN WINDOW ----

test('clock-window: the 58th\'s six windows - 190s for 16 completed, capacity 19, paid 84% (the idle\'s own tax)', () => {
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
  const row = clockWindowRow(l)
  assert.ok(row)
  assert.equal(row, "the clock's own window: the clock clips burned 190s of window for 16 completed unit(s) - the vanilla capacity 19 paid 84% (the furnace idled inside the window - the idle's own tax rode the same windows)")
})

test('clock-window: the vanilla metronome held - paid in full and the short-window overshoot', () => {
  // a window that delivered everything vanilla allows (20s -> capacity 2, delivered 2)
  const beat = smeltLedger(['[F7] the clock clips the batch: the 20s window completes ~2 of 36 x raw_copper (the rest re-smelts on the next chain)'])
  assert.equal(beat.clockClipWindowSec, 20)
  assert.equal(clockWindowRow(beat), "the clock's own window: the clock clips burned 20s of window for 2 completed unit(s) - the vanilla capacity 2 paid 100% (the furnace kept the vanilla beat - the window was its own metronome)")
  // a short window can overshoot - a unit mid-flight at window open finishes inside it (5s -> capacity 0.5, delivered 1)
  const over = smeltLedger(['[F2] the clock clips the batch: the 5s window completes ~1 of 22 x raw_copper (the rest re-smelts on the next chain)'])
  assert.equal(over.clockClipWindowSec, 5)
  assert.equal(clockWindowRow(over), "the clock's own window: the clock clips burned 5s of window for 1 completed unit(s) - the vanilla capacity 0.5 paid 200% (the furnace kept the vanilla beat - the window was its own metronome)")
})

test('clock-window: the non-integer capacity renders the vanilla decimal (47s -> 4.7, paid 85%)', () => {
  const l = smeltLedger(['[F1] the clock clips the batch: the 47s window completes ~4 of 29 x raw_copper (the rest re-smelts on the next chain)'])
  assert.equal(l.clockClipWindowSec, 47)
  assert.equal(clockWindowRow(l), "the clock's own window: the clock clips burned 47s of window for 4 completed unit(s) - the vanilla capacity 4.7 paid 85% (the furnace idled inside the window - the idle's own tax rode the same windows)")
})

test('clock-window: the honest silences and the junk fences', () => {
  // fuel-only faces read the honest silence (the window is the clock side)
  const fuelOnly = smeltLedger(['[F4] fuel clips the batch: 2 x coal completes 16 of 33 x raw_copper (the rest re-smelts on the next chain)'])
  assert.equal(fuelOnly.clockClips, 0)
  assert.equal(fuelOnly.clockClipWindowSec, 0)
  assert.equal(clockWindowRow(fuelOnly), null, 'zero clock clips = no row')
  assert.equal(clockWindowRow(null), null)
  assert.equal(clockWindowRow({}), null)
  // junk rows never mint a window
  const junked = smeltLedger([null, 42, 'the clock clips the batch: the 21s window completes ~1 of 14 x raw_copper'])
  assert.equal(junked.clockClips, 0)
  assert.equal(junked.clockClipWindowSec, 0)
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
