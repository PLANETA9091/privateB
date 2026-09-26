import { pocketTotals, lootLedger } from '../../src/lib/pocketline.mjs'
import { test } from 'node:test'
import assert from 'node:assert'

const inv = (items) => ({ bot: { inventory: { items: () => items } } })

test('pocketTotals: empty and broken inputs are zeros, not throws', () => {
  assert.deepStrictEqual(pocketTotals([]), { units: 0, slots: 0 })
  assert.deepStrictEqual(pocketTotals(undefined), { units: 0, slots: 0 })
  assert.deepStrictEqual(pocketTotals(null), { units: 0, slots: 0 })
  assert.deepStrictEqual(pocketTotals('nope'), { units: 0, slots: 0 })
})

test('pocketTotals: miners without a live inventory contribute zero', () => {
  // a not-yet-spawned miner (no bot) and a dead one (bot without window)
  const miners = [{}, { bot: {} }, { bot: { inventory: {} } }]
  assert.deepStrictEqual(pocketTotals(miners), { units: 0, slots: 0 })
})

test('pocketTotals: sums units across stacks and miners, counts occupied slots', () => {
  const a = inv([{ name: 'cobblestone', count: 64 }, { name: 'dirt', count: 1 }])
  const b = inv([{ name: 'cobblestone', count: 33 }])
  // units 98 over 3 slots - the shape the t- line prints as pocket=98u/3s
  assert.deepStrictEqual(pocketTotals([a, b]), { units: 98, slots: 3 })
})

test('pocketTotals: a torn window view (throwing items()) counts as zero, others still counted', () => {
  const torn = { bot: { inventory: { items: () => { throw new Error('window closed') } } } }
  const healthy = inv([{ name: 'stone', count: 12 }])
  assert.deepStrictEqual(pocketTotals([torn, healthy]), { units: 12, slots: 1 })
})

test('pocketTotals: non-finite and negative counts do not corrupt the sum', () => {
  const weird = inv([{ name: 'x', count: NaN }, { name: 'y', count: -5 }, { name: 'z', count: 7 }])
  assert.deepStrictEqual(pocketTotals([weird]), { units: 7, slots: 3 })
})

test('lootLedger: the measured fleet-35566494961 class reproduces as ~7% conversion', () => {
  // mined=1118, pocket=80, banked=0, smelted=0 -> 1038 units unaccounted
  const led = lootLedger({ mined: 1118, banked: 0, smelted: 0, pocket: 80 })
  assert.strictEqual(led.mined, 1118)
  assert.strictEqual(led.accounted, 80)
  assert.strictEqual(led.unaccounted, 1038)
  assert.ok(Math.abs(led.conversion - 80 / 1118) < 1e-12)
})

test('lootLedger: a healthy run - banked plus pocket covers the yield', () => {
  const led = lootLedger({ mined: 1000, banked: 700, smelted: 50, pocket: 250 })
  assert.strictEqual(led.unaccounted, 0)
  assert.strictEqual(led.conversion, 1)
})

test('lootLedger: negative and fractional inputs clamp to an integer floor', () => {
  const led = lootLedger({ mined: -10, banked: 3.9, smelted: -2, pocket: Infinity })
  // mined clamps to 0; Infinity floors to Infinity which then clamps unaccounted to 0
  assert.strictEqual(led.mined, 0)
  assert.ok(led.accounted >= 3)
  assert.strictEqual(led.unaccounted, 0)
})

test('lootLedger: over-accounted (units exceed mined) never reports a negative loss', () => {
  const led = lootLedger({ mined: 10, banked: 8, smelted: 0, pocket: 9 })
  assert.strictEqual(led.unaccounted, 0)
  assert.ok(led.conversion > 1) // the ledger is an instrument with grain, >1 is over-accounting
})

test('lootLedger: zero mined yields a null conversion (no divide-by-zero)', () => {
  assert.strictEqual(lootLedger({}).conversion, null)
  assert.strictEqual(lootLedger({ mined: 0, banked: 5 }).conversion, null)
})

// (v0.201.0) THE SURPLUS SIDE - the gap's other name.
test('lootLedger: surplus is explicit when accounted exceeds mined (the v0.201.0 field)', () => {
  const led = lootLedger({ mined: 10, banked: 8, smelted: 0, pocket: 9 })
  assert.strictEqual(led.surplus, 7)
  assert.strictEqual(led.unaccounted, 0)
  assert.ok(led.conversion > 1)
})

test('lootLedger: the run63-measured class - 396u of slack that read as unaccounted=0', () => {
  // fleet 36212235363: mined 2649, accounted 3045 (banked 1375 + smelted 14 +
  // pocket 1656). One decoder wrote "the ledger balances", the other "hidden
  // loss inside the formula's slack" - both read the SAME line because the
  // gap had no name. Now it does: surplus=396.
  const led = lootLedger({ mined: 2649, banked: 1375, smelted: 14, pocket: 1656 })
  assert.strictEqual(led.accounted, 3045)
  assert.strictEqual(led.surplus, 396)
  assert.strictEqual(led.unaccounted, 0)
  assert.ok(Math.abs(led.conversion - 3045 / 2649) < 1e-12)
})

test('lootLedger: the gap conservation pin - unaccounted + surplus is the full distance', () => {
  const under = lootLedger({ mined: 100, banked: 30, smelted: 20, pocket: 10 })
  assert.strictEqual(under.unaccounted, 40)
  assert.strictEqual(under.surplus, 0)
  assert.strictEqual(under.unaccounted + under.surplus, Math.abs(100 - 60))
  const over = lootLedger({ mined: 50, banked: 60, smelted: 0, pocket: 0 })
  assert.strictEqual(over.unaccounted, 0)
  assert.strictEqual(over.surplus, 10)
  assert.strictEqual(over.unaccounted + over.surplus, Math.abs(50 - 60))
})

test('lootLedger: surplus floors at zero on junk inputs (torn views never invent slack)', () => {
  assert.strictEqual(lootLedger({ mined: 10, banked: -3, pocket: -1 }).surplus, 0)
  assert.strictEqual(lootLedger({}).surplus, 0)
  const junk = lootLedger({ mined: -5, banked: -3, smelted: -1, pocket: 0 })
  assert.strictEqual(junk.mined, 0)
  assert.strictEqual(junk.surplus, 0)
})

test("REGRESSION PIN: the fleet ledger print carries the surplus term (v0.201.0)", async () => {
  const fs = await import('node:fs')
  const fleetSrc = fs.readFileSync(new URL('../../testbed/fleet19.mjs', import.meta.url), 'utf8')
  assert.ok(/unaccounted=\$\{ledger\.unaccounted\} surplus=\$\{ledger\.surplus\}u conversion=/.test(fleetSrc),
    'surplus prints ALWAYS in the loot ledger line - the 05:00 ledger-skip lesson (an absent term is a filter blind spot)')
})
