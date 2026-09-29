import { pocketTotals, lootLedger, writeOffRow, WRITE_OFF_MIN_UNITS, bankedCraterDecode, BANK_CRATER_FLOOR_SHARE, unaccountedMassDecode, UNACCOUNTED_FLOOR_SHARE } from '../../src/lib/pocketline.mjs'
import { test } from 'node:test'
import assert from 'node:assert'
import fs from 'node:fs'

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

// ---- (v0.302.0) THE WRITE-OFF'S FIRST LINE ----
// fleet 36517770723: pocket=1894u/265s rode the deadline unbanked while the
// aggregate ledger named nobody - F9's five refused windows + the
// budget-exhausted trip had no end-of-run echo. The row attributes the stake.

test('writeOffRow: the fleet-36517770723 datum - holders named desc by units, the noise pocket stays unnamed', () => {
  const f9 = inv([{ name: 'iron_ore', count: 200 }, { name: 'cobblestone', count: 212 }]) // 412u/2s
  const f6 = inv([{ name: 'coal', count: 308 }]) // 308u/1s
  const f2 = inv([{ name: 'dirt', count: 30 }]) // 30u - under the floor
  const line = writeOffRow([{ username: 'F9', ...f9 }, { username: 'F6', ...f6 }, { username: 'F2', ...f2 }])
  assert.strictEqual(line,
    'final write-off: F9 412u/2s, F6 308u/1s (the deadline pocket rode unbanked)',
    'the F9 datum: the two holders in desc order with units+slots, F2 under the 64u floor never named')
})

test('writeOffRow: the none-verdict prints when every pocket sits under the floor (ALWAYS-printed law)', () => {
  const f2 = inv([{ name: 'dirt', count: 63 }]) // one under the floor
  assert.strictEqual(writeOffRow([{ username: 'F2', ...f2 }]),
    `final write-off: none (every pocket under ${WRITE_OFF_MIN_UNITS} units)`)
  assert.strictEqual(writeOffRow([]),
    `final write-off: none (every pocket under ${WRITE_OFF_MIN_UNITS} units)`)
})

test('writeOffRow: junk inputs degrade to the none-verdict, never a throw', () => {
  const noneForm = `final write-off: none (every pocket under ${WRITE_OFF_MIN_UNITS} units)`
  assert.strictEqual(writeOffRow(undefined), noneForm)
  assert.strictEqual(writeOffRow(null), noneForm)
  assert.strictEqual(writeOffRow('nope'), noneForm)
  assert.strictEqual(writeOffRow([{}, { bot: {} }, { bot: { inventory: {} } }]), noneForm)
})

test('writeOffRow: the torn-window and impossible-count laws match pocketTotals', () => {
  const torn = { username: 'F4', bot: { inventory: { items: () => { throw new Error('window closed') } } } }
  const weird = inv([{ name: 'x', count: NaN }, { name: 'y', count: -5 }, { name: 'z', count: 80 }])
  const line = writeOffRow([torn, { username: 'F8', ...weird }])
  assert.strictEqual(line,
    'final write-off: F8 80u/3s (the deadline pocket rode unbanked)',
    'the torn view holds nothing, the NaN/negative counts zero out - only the honest 80u names itself')
})

test('writeOffRow: the floor is tunable and junk floors fall back to the constant', () => {
  const f2 = inv([{ name: 'dirt', count: 30 }])
  assert.match(writeOffRow([{ username: 'F2', ...f2 }], { minUnits: 10 }), /F2 30u\/1s/,
    'a lower floor names the small pocket')
  assert.match(writeOffRow([{ username: 'F2', ...f2 }], { minUnits: NaN }),
    /every pocket under 64 units/, 'a NaN floor falls back to the constant')
  assert.match(writeOffRow([{ username: 'F2', ...f2 }], { minUnits: -5 }),
    /every pocket under 64 units/, 'a negative floor falls back to the constant')
})

test('writeOffRow: the tie on units breaks by name so the row is byte-stable', () => {
  const a = inv([{ name: 'stone', count: 100 }])
  const b = inv([{ name: 'dirt', count: 100 }])
  const line = writeOffRow([{ username: 'F9', ...a }, { username: 'F6', ...b }])
  assert.strictEqual(line, 'final write-off: F6 100u/1s, F9 100u/1s (the deadline pocket rode unbanked)',
    'same units -> name order, deterministic across runs')
})

test('writeOffRow: the constants pin', () => {
  assert.strictEqual(WRITE_OFF_MIN_UNITS, 64, 'one stack - below this the pocket is noise, not a stake')
})

test('REGRESSION PIN: the write-off row rides the report block beside the loot ledger (v0.302.0)', async () => {
  const fs = await import('node:fs')
  const fleetSrc = fs.readFileSync(new URL('../../testbed/fleet19.mjs', import.meta.url), 'utf8')
  assert.ok(fleetSrc.includes("import { pocketTotals, lootLedger, writeOffRow, bankedCraterDecode, unaccountedMassDecode } from '../src/lib/pocketline.mjs'"),
    'the fleet imports the write-off row + the decodes from the pocket instrument (v0.318.0 extended the same import)')
  const ledgerIdx = fleetSrc.indexOf('loot ledger: mined=')
  const rowIdx = fleetSrc.indexOf('console.log(writeOffRow(list))')
  assert.ok(rowIdx > ledgerIdx, 'the row prints AFTER the loot ledger line - the same report-block class')
  assert.ok(fleetSrc.includes('THE WRITE-OFF\'S FIRST LINE'), 'the wiring carries its own doctrine comment')
})

// ---------------------------------------------------------------------------
// (v0.318.0) THE UNACCOUNTED-MASS DECODE - the ledger line's last column
// (unaccounted) never judged itself: fleet 36592026195 read unaccounted=1948u
// of 2713 mined (71.8%) and no line sized the leak. These tests pin the
// measured datum, the floor boundary (at the floor the leak speaks), the
// surplus clamp, the dead-run and junk disciplines, and the wiring.
// ---------------------------------------------------------------------------

test('unaccountedMassDecode: THE MEASURED MASS (fleet 36592026195: 1948u of 2713)', () => {
  const v = unaccountedMassDecode({ mined: 2713, banked: 83, smelted: 11, pocket: 671 })
  assert.ok(v && v.startsWith('unaccounted: 71.8% of the mined mass never reached the books (1948u of 2713)'), v)
  assert.match(v, /the shaft drops, the tool spend and the consolidation own the leak/)
})

test('unaccountedMassDecode: THE FLOOR - at the floor the leak speaks, below it stays quiet', () => {
  assert.equal(UNACCOUNTED_FLOOR_SHARE, 0.5)
  // exactly at the floor: half the mass gone is no grain - it speaks
  assert.ok(unaccountedMassDecode({ mined: 100, banked: 50, smelted: 0, pocket: 0 }).startsWith('unaccounted: 50.0%'))
  // one unit of accounting more: quiet
  assert.equal(unaccountedMassDecode({ mined: 100, banked: 51, smelted: 0, pocket: 0 }), null)
  // a healthy conversion (the run class that read 76.3%): quiet
  assert.equal(unaccountedMassDecode({ mined: 1000, banked: 763, smelted: 0, pocket: 0 }), null)
})

test('unaccountedMassDecode: THE SURPLUS CLAMP and the dead run', () => {
  // accounted > mined: the surplus is the ledger line's story (v0.201.0),
  // not this verdict's - clamped to zero, never a negative share
  assert.equal(unaccountedMassDecode({ mined: 100, banked: 80, smelted: 0, pocket: 50 }), null)
  // nothing exists -> nothing to name
  assert.equal(unaccountedMassDecode({ mined: 0, banked: 0, smelted: 0, pocket: 0 }), null)
})

test('unaccountedMassDecode: THE JUNK DISCIPLINE - junk never invents a mass', () => {
  // a null ledger is not a zero ledger (the Number(null)=0 seventh-strike law)
  assert.equal(unaccountedMassDecode({ mined: null, banked: 83, smelted: 11, pocket: 671 }), null)
  assert.equal(unaccountedMassDecode({ mined: 2713, banked: null, smelted: 11, pocket: 671 }), null)
  assert.equal(unaccountedMassDecode({ mined: 2713, banked: 83, smelted: null, pocket: 671 }), null)
  assert.equal(unaccountedMassDecode({ mined: 2713, banked: 83, smelted: 11, pocket: null }), null)
  assert.equal(unaccountedMassDecode({ mined: NaN, banked: 0, smelted: 0, pocket: 0 }), null)
  assert.equal(unaccountedMassDecode({ mined: '2713', banked: 0, smelted: 0, pocket: 0 }), null)
  assert.equal(unaccountedMassDecode({ mined: -5, banked: 0, smelted: 0, pocket: 0 }), null)
  assert.equal(unaccountedMassDecode(), null)
  assert.equal(unaccountedMassDecode(null), null)
})

test('unaccountedMassDecode: THE WIRING PIN - the report block sizes the gap', () => {
  const src = fs.readFileSync(new URL('../../testbed/fleet19.mjs', import.meta.url), 'utf8')
  // the import carries the decode
  assert.match(src, /unaccountedMassDecode[\s\S]*?from '\.\.\/src\/lib\/pocketline\.mjs'/)
  // the call feeds the same four columns the ledger line prints
  assert.match(src, /unaccountedMassDecode\(\{ mined: s\.mined, banked, smelted, pocket: endPk\.units \}\)/)
  // the line form: rides the report block after the crater (ALWAYS printed when it speaks)
  assert.match(src, /unaccounted mass decode: \$\{mass\}/)
  const ledgerIdx = src.indexOf('loot ledger: mined=')
  const craterIdx = src.indexOf('banked crater decode:')
  const massIdx = src.indexOf('unaccounted mass decode:')
  assert.ok(massIdx > craterIdx && craterIdx > ledgerIdx, 'the mass decode prints after the crater - the same report-block class')
  assert.ok(src.includes('THE UNACCOUNTED-MASS DECODE'), 'the wiring carries its own doctrine comment')
})

// ---------------------------------------------------------------------------
// (v0.317.0) THE BANKED-CRATER DECODE - the ledger line read banked and
// pocket side by side but never judged the pair: fleet 36592026195 measured
// banked=83 with pocket=671u at deadline (11.0% of the endgame loot reached
// chests) and no line named the crater. These tests pin the measured datum,
// the floor boundary, the dead-run and junk disciplines, and the wiring.
// ---------------------------------------------------------------------------

test('bankedCraterDecode: THE MEASURED CRATER (fleet 36592026195: banked 83 of 754u)', () => {
  const v = bankedCraterDecode({ banked: 83, pocket: 671 })
  assert.ok(v && v.startsWith('crater: 11.0% of the endgame loot reached chests (banked 83 of 754u)'), v)
  assert.match(v, /the bank chains are the bottleneck, the mines are not/)
})

test('bankedCraterDecode: THE FLOOR - half the loot landing is the honest line', () => {
  assert.equal(BANK_CRATER_FLOOR_SHARE, 0.5)
  // exactly at the floor: the banking works, silent
  assert.equal(bankedCraterDecode({ banked: 50, pocket: 50 }), null)
  // one unit below: crater
  assert.ok(bankedCraterDecode({ banked: 49, pocket: 51 }).startsWith('crater: 49.0%'))
  // comfortably green: silent (a healthy run needs no line)
  assert.equal(bankedCraterDecode({ banked: 1117, pocket: 200 }), null)
})

test('bankedCraterDecode: THE DEAD RUN and the total crater', () => {
  // nothing exists: nothing to name (a dead run reads its own way)
  assert.equal(bankedCraterDecode({ banked: 0, pocket: 0 }), null)
  // everything held, nothing banked: the total crater speaks
  assert.ok(bankedCraterDecode({ banked: 0, pocket: 500 }).startsWith('crater: 0.0%'))
})

test('bankedCraterDecode: THE JUNK DISCIPLINE - junk never invents a crater', () => {
  // the Number(null)=0 seventh strike: a null ledger would read as 0 banked = total crater
  assert.equal(bankedCraterDecode({ banked: null, pocket: null }), null)
  assert.equal(bankedCraterDecode({ banked: null, pocket: 500 }), null)
  assert.equal(bankedCraterDecode({ banked: 83, pocket: null }), null)
  assert.equal(bankedCraterDecode({ banked: NaN, pocket: 500 }), null)
  assert.equal(bankedCraterDecode({ banked: '83', pocket: 671 }), null)
  assert.equal(bankedCraterDecode({ banked: -5, pocket: 671 }), null)
  assert.equal(bankedCraterDecode(), null)
  assert.equal(bankedCraterDecode(null), null)
})

test('bankedCraterDecode: THE WIRING PIN - the report block judges the pair', () => {
  const src = fs.readFileSync(new URL('../../testbed/fleet19.mjs', import.meta.url), 'utf8')
  // the import carries the decode
  assert.match(src, /bankedCraterDecode[\s\S]*?from '\.\.\/src\/lib\/pocketline\.mjs'/)
  // the call feeds the same pair the ledger line prints
  assert.match(src, /bankedCraterDecode\(\{ banked, pocket: endPk\.units \}\)/)
  // the line form: rides the report block (ALWAYS printed when it speaks)
  assert.match(src, /banked crater decode: \$\{crater\}/)
})
