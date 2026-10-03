import { pocketTotals, lootLedger, writeOffRow, WRITE_OFF_MIN_UNITS, bankedCraterDecode, BANK_CRATER_FLOOR_SHARE, unaccountedMassDecode, UNACCOUNTED_FLOOR_SHARE, pocketAnatomyRow, POCKET_WHALE_SHARE, surplusFaceRow, isCraftedClassName, SURPLUS_FACE_TOP, bankFlowRow, BANK_FLOW_MIN_SAMPLES, BANK_FLOW_DISPLAY_FLOOR, bankAttributionRow, BANK_ATTRIBUTION_TOP, bankBudgetGapRow, BANK_GAP_MIN_BUDGET_MS, doomCensusRow, DOOM_CENSUS_MIN_CYCLES, DOOM_CENSUS_LOCAL_SHARE, climbWhyClass, doomWhyRow, doomOwnerRow, whyBookToken } from '../../src/lib/pocketline.mjs'
import { test } from 'node:test'
import assert from 'node:assert'
import fs from 'node:fs'

const inv = (items) => ({ bot: { inventory: { items: () => items } } })

test('pocketTotals: empty and broken inputs are zeros, not throws', () => {
  // (v0.390.0) the bankable split rides the shape additively (default keep=[]
  // reads bankable===units, kept 0 - byte-identical legacy sums)
  const zeros = { units: 0, slots: 0, bankable: 0, kept: 0 }
  assert.deepStrictEqual(pocketTotals([]), zeros)
  assert.deepStrictEqual(pocketTotals(undefined), zeros)
  assert.deepStrictEqual(pocketTotals(null), zeros)
  assert.deepStrictEqual(pocketTotals('nope'), zeros)
})

test('pocketTotals: miners without a live inventory contribute zero', () => {
  // a not-yet-spawned miner (no bot) and a dead one (bot without window)
  const miners = [{}, { bot: {} }, { bot: { inventory: {} } }]
  assert.deepStrictEqual(pocketTotals(miners), { units: 0, slots: 0, bankable: 0, kept: 0 })
})

test('pocketTotals: sums units across stacks and miners, counts occupied slots', () => {
  const a = inv([{ name: 'cobblestone', count: 64 }, { name: 'dirt', count: 1 }])
  const b = inv([{ name: 'cobblestone', count: 33 }])
  // units 98 over 3 slots - the shape the t- line prints as pocket=98u/3s
  assert.deepStrictEqual(pocketTotals([a, b]), { units: 98, slots: 3, bankable: 98, kept: 0 })
})

test('pocketTotals: a torn window view (throwing items()) counts as zero, others still counted', () => {
  const torn = { bot: { inventory: { items: () => { throw new Error('window closed') } } } }
  const healthy = inv([{ name: 'stone', count: 12 }])
  assert.deepStrictEqual(pocketTotals([torn, healthy]), { units: 12, slots: 1, bankable: 12, kept: 0 })
})

test('pocketTotals: non-finite and negative counts do not corrupt the sum', () => {
  const weird = inv([{ name: 'x', count: NaN }, { name: 'y', count: -5 }, { name: 'z', count: 7 }])
  assert.deepStrictEqual(pocketTotals([weird]), { units: 7, slots: 3, bankable: 7, kept: 0 })
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
  assert.ok(fleetSrc.includes("import { pocketTotals, lootLedger, writeOffRow, bankedCraterDecode, unaccountedMassDecode, pocketAnatomyRow, surplusFaceRow, bankFlowRow, bankBudgetGapRow, bankAttributionRow, doomCensusRow, climbWhyClass, doomWhyRow, doomOwnerRow, whyBookToken } from '../src/lib/pocketline.mjs'"),
    'the fleet imports the write-off row + the decodes from the pocket instrument (v0.328.0 rode the same import, v0.330.0 joins it, v0.556.0 adds whyBookToken - the third refuse class feeds the book, v0.563.0 adds doomOwnerRow - the crater census map)')
  const ledgerIdx = fleetSrc.indexOf('loot ledger: mined=')
  const rowIdx = fleetSrc.indexOf('console.log(writeOffRow(list, { whys: finalBankWhys }))') // (v0.553.0) the why ledger rides the row
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

// ---------------------------------------------------------------------------
// (v0.320.0) THE POCKET-ANATOMY ROW - the write-off row named the holders but
// never judged their SHAPE: fleet 36606754498 read pocket=1349u across 8
// stakes (top F14 182u = 13.5%) with the cure differing by shape - a whale
// pocket is one walk from the yard, a spread pocket is the chains' failure.
// These tests pin the measured datum, the whale boundary, the none-form, the
// junk discipline, and the wiring.
// ---------------------------------------------------------------------------

test('pocketAnatomyRow: THE MEASURED SHAPE (fleet 36606754498: top 182u of 1349u, 8 stakes)', () => {
  const mk = (name, units) => ({ username: name, bot: { inventory: { items: () => [{ count: units }] } } })
  const miners = [mk('F14', 182), mk('F3', 179), mk('F15', 152), mk('F5', 141), mk('F7', 121), mk('F1', 117), mk('F8', 116), mk('F13', 110)]
  const v = pocketAnatomyRow(miners, { total: 1349 })
  assert.ok(v.startsWith('pocket anatomy: spread across 8 holders, top F14 182u = 13.5% of 1349u'), v)
  assert.match(v, /the chains own the crater's face, no single walk cures it/)
})

test('pocketAnatomyRow: THE WHALE BOUNDARY - a quarter of the unbanked mass is one walk', () => {
  assert.equal(POCKET_WHALE_SHARE, 0.25)
  const mk = (name, units) => ({ username: name, bot: { inventory: { items: () => [{ count: units }] } } })
  // exactly at the floor: the whale speaks (>= law, the crater decode's mirror)
  const at = pocketAnatomyRow([mk('F9', 250), mk('F3', 250), mk('F5', 250), mk('F7', 250)], { total: 1000 })
  assert.ok(at.startsWith('pocket anatomy: whale F3 250u = 25.0% of the unbanked 1000u (4 holders)'), at) // the tie at 250u breaks by name - F3 is byte-first
  assert.match(at, /one walk owns the crater's face/)
  // one unit of concentration less: spread
  const below = pocketAnatomyRow([mk('F9', 249), mk('F3', 249), mk('F5', 248), mk('F7', 248)], { total: 1000 })
  assert.match(below, /^pocket anatomy: spread across 4 holders, top F3 249u = 24.9%/) // one tenth under the floor: spread
})

test('pocketAnatomyRow: THE NONE-FORM and the junk total', () => {
  // an empty fleet still gets its verdict (the 05:00 ledger-skip lesson)
  assert.equal(pocketAnatomyRow([], { total: 1349 }), 'pocket anatomy: none (no pocket exists at the deadline)')
  assert.equal(pocketAnatomyRow(), 'pocket anatomy: none (no pocket exists at the deadline)')
  assert.equal(pocketAnatomyRow(null), 'pocket anatomy: none (no pocket exists at the deadline)')
  // a junk total falls back to the holders' sum - never a divided-by-zero
  const mk = (name, units) => ({ username: name, bot: { inventory: { items: () => [{ count: units }] } } })
  const v = pocketAnatomyRow([mk('F1', 300), mk('F3', 100)], { total: NaN })
  assert.ok(v.startsWith('pocket anatomy: whale F1 300u = 75.0% of the unbanked 400u (2 holders)'), v)
  assert.equal(pocketAnatomyRow([mk('F1', 300), mk('F3', 100)], { total: null }), v.replace('75.0', '75.0'))
})

test('pocketAnatomyRow: THE JUNK DISCIPLINE - torn views and impossible counts hold nothing', () => {
  const torn = { username: 'F2', bot: { inventory: { items: () => { throw new Error('torn window') } } } }
  const junk = { username: 'F6', bot: { inventory: { items: () => [{ count: NaN }, { count: -5 }, { count: 90 }] } } }
  const v = pocketAnatomyRow([torn, junk], { total: 90 })
  assert.ok(v.startsWith('pocket anatomy: whale F6 90u = 100.0% of the unbanked 90u (1 holder)'), v)
  // non-array miners and missing inventories read as empty pockets
  assert.equal(pocketAnatomyRow('junk', { total: 5 }), 'pocket anatomy: none (no pocket exists at the deadline)')
  assert.equal(pocketAnatomyRow([{ username: 'F8' }], { total: 5 }), 'pocket anatomy: none (no pocket exists at the deadline)')
})

test('pocketAnatomyRow: THE WIRING PIN - the report block judges the shape', () => {
  const src = fs.readFileSync(new URL('../../testbed/fleet19.mjs', import.meta.url), 'utf8')
  assert.match(src, /pocketAnatomyRow[\s\S]*?from '\.\.\/src\/lib\/pocketline\.mjs'/)
  assert.match(src, /pocketAnatomyRow\(list, \{ total: endPk\.units \}\)/)
  const rowIdx = src.indexOf('console.log(writeOffRow(list))')
  const anatomyIdx = src.indexOf('pocketAnatomyRow(list')
  assert.ok(anatomyIdx > rowIdx, 'the anatomy row prints AFTER the write-off row - the same report-block class')
  assert.ok(src.includes('THE POCKET-ANATOMY ROW'), 'the wiring carries its own doctrine comment')
})

// ---------------------------------------------------------------------------
// (v0.322.0) THE SURPLUS-FACE ROW - the ledger's surplus column never had a
// FACE: fleet 36617588210 (THE LANDMARK) read surplus=531u with the inflow
// hypothesized as crafted units the mined counter never tracks - unmeasured
// by name. These tests pin the classification law, the landmark datum, the
// byte-stable top flows, the none-form, the junk discipline, and the wiring.
// ---------------------------------------------------------------------------

test('isCraftedClassName: THE CLASSIFICATION LAW - conservative on purpose', () => {
  // the exact names the fleet only crafts
  for (const n of ['stick', 'torch', 'ladder', 'chest', 'crafting_table', 'furnace', 'charcoal']) {
    assert.equal(isCraftedClassName(n), true, n)
  }
  // the suffix families (every planks and every ingot)
  for (const n of ['oak_planks', 'birch_planks', 'iron_ingot', 'gold_ingot', 'copper_ingot']) {
    assert.equal(isCraftedClassName(n), true, n)
  }
  // mined-class on this fleet's books: mined AND craftable stays OUT, mob drops stay OUT
  for (const n of ['coal_block', 'cobblestone', 'stone', 'dirt', 'sand', 'gravel', 'iron_ore', 'blaze_rod', 'rotten_flesh']) {
    assert.equal(isCraftedClassName(n), false, n)
  }
  // junk names are never crafted-class
  assert.equal(isCraftedClassName(''), false)
  assert.equal(isCraftedClassName(null), false)
  assert.equal(isCraftedClassName(undefined), false)
  assert.equal(isCraftedClassName(42), false)
})

test('surplusFaceRow: THE LANDMARK DATUM - the surplus gets a face by name', () => {
  assert.equal(SURPLUS_FACE_TOP, 3)
  const mk = (name, items) => ({ username: name, bot: { inventory: { items: () => items } } })
  // the landmark's pocket shape, crafted inflow visible: sticks, planks, an ingot
  const miners = [
    mk('F1', [{ name: 'stick', count: 64 }, { name: 'cobblestone', count: 100 }]),
    mk('F3', [{ name: 'oak_planks', count: 40 }, { name: 'iron_ingot', count: 21 }, { name: 'dirt', count: 200 }]),
    mk('F5', [{ name: 'torch', count: 33 }])
  ]
  const v = surplusFaceRow(miners, { surplus: 531 })
  assert.ok(v.startsWith('surplus face: crafted-class 158u of 458u pocket (34.5%), top stick 64u, oak_planks 40u, torch 33u'), v)
  assert.match(v, /the mined counter never saw these units/)
  assert.match(v, /\(surplus 531u\)/, 'the ledger surplus rides as the note')
})

test('surplusFaceRow: THE PURE-MINED FORM - no crafted flows, no invented face', () => {
  const mk = (name, items) => ({ username: name, bot: { inventory: { items: () => items } } })
  const v = surplusFaceRow([mk('F9', [{ name: 'cobblestone', count: 300 }])], { surplus: 396 })
  assert.equal(v, 'surplus face: crafted-class 0u of 300u pocket - the pocket is pure mined-class mass, the surplus\'s face is not in the pockets (surplus 396u)')
  // no surplus read -> no note (junk never invents a claim)
  const v2 = surplusFaceRow([mk('F9', [{ name: 'stone', count: 12 }])], { surplus: null })
  assert.equal(v2, 'surplus face: crafted-class 0u of 12u pocket - the pocket is pure mined-class mass, the surplus\'s face is not in the pockets')
})

test('surplusFaceRow: THE NONE-FORM - an empty pocket is a verdict too', () => {
  assert.equal(surplusFaceRow([], { surplus: 531 }), 'surplus face: none (no pocket exists at the deadline)')
  assert.equal(surplusFaceRow(), 'surplus face: none (no pocket exists at the deadline)')
  assert.equal(surplusFaceRow(null), 'surplus face: none (no pocket exists at the deadline)')
  assert.equal(surplusFaceRow('junk'), 'surplus face: none (no pocket exists at the deadline)')
  assert.equal(surplusFaceRow([{ username: 'F8' }]), 'surplus face: none (no pocket exists at the deadline)')
})

test('surplusFaceRow: THE JUNK DISCIPLINE - torn views, impossible counts, nameless stacks', () => {
  const torn = { username: 'F2', bot: { inventory: { items: () => { throw new Error('torn window') } } } }
  const junk = { username: 'F6', bot: { inventory: { items: () => [{ count: NaN }, { count: -5 }, { name: 'stick', count: 7 }] } } }
  const v = surplusFaceRow([torn, junk], { surplus: 100 })
  assert.ok(v.startsWith('surplus face: crafted-class 7u of 7u pocket (100.0%), top stick 7u'), v)
  // a nameless stack reads unclassified mined-class - the total stays consistent
  const nameless = { username: 'F4', bot: { inventory: { items: () => [{ count: 5 }, { name: 'iron_ingot', count: 3 }] } } }
  const v2 = surplusFaceRow([nameless])
  assert.ok(v2.startsWith('surplus face: crafted-class 3u of 8u pocket (37.5%), top iron_ingot 3u'), v2)
  assert.match(v2, /the mined counter never saw these units$/, 'no surplus note without a surplus read')
})

test('surplusFaceRow: THE WIRING PIN - the report block names the face', () => {
  const src = fs.readFileSync(new URL('../../testbed/fleet19.mjs', import.meta.url), 'utf8')
  assert.match(src, /surplusFaceRow[\s\S]*?from '\.\.\/src\/lib\/pocketline\.mjs'/)
  assert.match(src, /surplusFaceRow\(list, \{ surplus: ledger\.surplus \}\)/)
  const anatomyIdx = src.indexOf('pocketAnatomyRow(list')
  const faceIdx = src.indexOf('surplusFaceRow(list')
  assert.ok(faceIdx > anatomyIdx, 'the face row prints AFTER the anatomy row - the same report-block class')
  assert.ok(src.includes('THE SURPLUS-FACE ROW'), 'the wiring carries its own doctrine comment')
})

// ---------------------------------------------------------------------------
// (v0.323.0) THE BANK-FLOW ROW - the crater's FEASIBILITY was never priced:
// fleet 36626921875 (the first pocket-anatomy face) read crater 41.3% with
// the pocket sitting ~1639u through the endgame while banked crept
// 1117->1154 across the final ~75s - a flow no line ever measured. These
// tests pin the measured datum, the stood-still form, the Infinity guard,
// the junk discipline, and the wiring.
// ---------------------------------------------------------------------------

test('bankFlowRow: THE MEASURED FLOW (fleet 36626921875 tail: +37u over 75s)', () => {
  assert.equal(BANK_FLOW_MIN_SAMPLES, 2)
  const v = bankFlowRow([{ t: 0, banked: 1117 }, { t: 75, banked: 1154 }], { pocketUnits: 1639 })
  assert.ok(v.startsWith('bank flow: 0.5u/s (banked +37u over 75s)'), v)
  assert.match(v, /the 1639u pocket needs 3323s past the deadline$/, 'the pocket read prices the flow')
})

test('bankFlowRow: the living flow without a pocket read and the pocket-junk law', () => {
  const v = bankFlowRow([{ t: 10, banked: 5 }, { t: 70, banked: 65 }])
  assert.equal(v, 'bank flow: 1.0u/s (banked +60u over 60s)')
  const v2 = bankFlowRow([{ t: 10, banked: 5 }, { t: 70, banked: 65 }], { pocketUnits: 'junk' })
  assert.equal(v2, v)
  const v3 = bankFlowRow([{ t: 10, banked: 5 }, { t: 70, banked: 65 }], { pocketUnits: 0 })
  assert.equal(v3, v)
})

test('bankFlowRow: THE STOOD-STILL FORM - a dead chain owes no seconds (the Infinity guard)', () => {
  const v = bankFlowRow([{ t: 0, banked: 100 }, { t: 60, banked: 100 }], { pocketUnits: 500 })
  assert.equal(v, 'bank flow: 0.0u/s (banked +0u over 60s) - the chains stood still')
  // a NEGATIVE delta (the counter drift correction) is still a still chain - no tail
  const v2 = bankFlowRow([{ t: 0, banked: 100 }, { t: 30, banked: 90 }], { pocketUnits: 500 })
  assert.equal(v2, 'bank flow: 0.0u/s (banked +-10u over 30s) - the chains stood still')
})

// ---------------------------------------------------------------------------
// (v0.559.0) THE DISPLAY FLOOR LAW - the trickle joins the stood-still class.
// Fleet 37128927104's face read 'bank flow: 0.0u/s (banked +4u over 285s) -
// the 883u pocket needs 62914s past the deadline': the tail priced at a
// hidden 0.014u/s the face itself displayed as 0.0 - a number claiming a
// precision the row denies (the phantom pricing). A rate the face reads as
// '0.0' never prices a tail again; the gap row routes by the SAME floor
// constant, so the siblings can never split on the class (the sibling-shape
// law, kept by construction).
// ---------------------------------------------------------------------------

test('bankFlowRow: THE TRICKLE CLASS (fleet 37128927104: +4u over 285s) - a phantom rate never prices a tail', () => {
  assert.equal(BANK_FLOW_DISPLAY_FLOOR, 0.05)
  // the live datum: the window moved +4u in 285s (0.014u/s) - the old tail
  // priced 'needs 62914s past the deadline' at the rate the face hides
  const v = bankFlowRow([{ t: 0, banked: 933 }, { t: 285, banked: 937 }], { pocketUnits: 883 })
  assert.equal(v, 'bank flow: 0.0u/s (banked +4u over 285s) - the chains stood still')
  assert.ok(!v.includes('needs'), 'the phantom pricing is dead - the face never prices a rate it displays as 0.0')
  // the boundary: a rate AT the floor displays 0.1 and prices honestly
  const b = bankFlowRow([{ t: 0, banked: 0 }, { t: 100, banked: 5 }], { pocketUnits: 100 })
  assert.ok(b.startsWith('bank flow: 0.1u/s (banked +5u over 100s)'), b)
  assert.match(b, /needs 2000s past the deadline$/, 'the floor rate prices - only the trickle is still')
})

test('bankFlowRow: THE NONE-FORM and the junk discipline', () => {
  // fewer than two valid samples is a verdict too (the 05:00 ledger-skip lesson)
  assert.equal(bankFlowRow([]), 'bank flow: none (no cadence series this read)')
  assert.equal(bankFlowRow([{ t: 5, banked: 10 }]), 'bank flow: none (no cadence series this read)')
  assert.equal(bankFlowRow('junk'), 'bank flow: none (no cadence series this read)')
  assert.equal(bankFlowRow(), 'bank flow: none (no cadence series this read)')
  // impossible data skipped: non-finite and negative t/banked
  const v = bankFlowRow([{ t: NaN, banked: 5 }, { t: -3, banked: 5 }, { t: 10, banked: NaN }, { t: 20, banked: -7 }, { t: 30, banked: 40 }, { t: 90, banked: 70 }])
  assert.equal(v, 'bank flow: 0.5u/s (banked +30u over 60s)')
  // a non-monotone t cannot make a window (equal and decreasing t skipped)
  const v2 = bankFlowRow([{ t: 10, banked: 5 }, { t: 10, banked: 9 }, { t: 8, banked: 9 }, { t: 70, banked: 65 }])
  assert.equal(v2, 'bank flow: 1.0u/s (banked +60u over 60s)')
  // sub-second samples floor into the same tick - no zero-span window
  const v3 = bankFlowRow([{ t: 10.2, banked: 5 }, { t: 10.9, banked: 9 }, { t: 70.1, banked: 65 }])
  assert.equal(v3, 'bank flow: 1.0u/s (banked +60u over 60s)')
})

test('bankFlowRow: THE WIRING PIN - the report block prices the flow', () => {
  const src = fs.readFileSync(new URL('../../testbed/fleet19.mjs', import.meta.url), 'utf8')
  assert.match(src, /bankFlowRow[\s\S]*?from '\.\.\/src\/lib\/pocketline\.mjs'/)
  assert.match(src, /const bankFlowSamples = \[\]/)
  assert.match(src, /bankFlowSamples\.push\(\{ t: Date\.now\(\) \/ 1000, banked \}\)/)
  assert.match(src, /bankFlowRow\(bankFlowSamples\.slice\(-BANK_FLOW_WINDOW\), \{ pocketUnits: endPk\.units \}\)/)
  const faceIdx = src.indexOf('surplusFaceRow(list')
  const flowIdx = src.indexOf('bankFlowRow(bankFlowSamples')
  assert.ok(flowIdx > faceIdx, 'the flow row prints AFTER the surplus-face row - the same report-block class')
  assert.ok(src.includes('THE BANK-FLOW ROW'), 'the wiring carries its own doctrine comment')
})

// ---------------------------------------------------------------------------
// (v0.324.0) THE BANK-ATTRIBUTION ROW - banked was a fleet number with no
// NAMES: fleet 36631612575 healed the crater but the anatomy row flipped to
// WHALE F12 (220u = 31.1% of the unbanked 707u) - the same bot the no-chest
// front names. These tests pin the face datum, the stranded-only form, the
// floor law, the junk discipline, and the wiring.
// ---------------------------------------------------------------------------

test('bankAttributionRow: THE FACE DATUM - the whale names itself stranded', () => {
  assert.equal(BANK_ATTRIBUTION_TOP, 3)
  const mk = (name, banked, items) => ({ username: name, stats: { banked }, bot: { inventory: { items: () => items } } })
  // fleet 36631612575's shape: three whales held 435u while the fleet banked 1378u
  const miners = [
    mk('F3', 300, [{ name: 'cobblestone', count: 111 }]),
    mk('F5', 250, [{ name: 'dirt', count: 5 }]),
    mk('F7', 180, [{ name: 'sand', count: 12 }]),
    mk('F12', 0, [{ name: 'cobblestone', count: 220 }]),
    mk('F9', 0, [{ name: 'gravel', count: 90 }])
  ]
  const v = bankAttributionRow(miners)
  assert.ok(v.startsWith('bank attribution: top F3 300u, F5 250u, F7 180u'), v)
  assert.match(v, /; stranded: F12 0u\/220u pocket, F9 0u\/90u pocket - the walk never delivered$/, v)
})

test('bankAttributionRow: THE STRANDED-ONLY FORM - a fleet that never deposited', () => {
  const mk = (name, banked, items) => ({ username: name, stats: { banked }, bot: { inventory: { items: () => items } } })
  const v = bankAttributionRow([mk('F12', 0, [{ name: 'dirt', count: 220 }]), mk('F6', 0, [{ name: 'sand', count: 104 }])])
  assert.equal(v, 'bank attribution: none deposited - stranded with pockets: F12 220u, F6 104u')
})

test('bankAttributionRow: THE NONE-FORM and the floor law', () => {
  const mk = (name, banked, items) => ({ username: name, stats: { banked }, bot: { inventory: { items: () => items } } })
  assert.equal(bankAttributionRow([]), 'bank attribution: none (no banked units this run)')
  assert.equal(bankAttributionRow(), 'bank attribution: none (no banked units this run)')
  assert.equal(bankAttributionRow(null), 'bank attribution: none (no banked units this run)')
  // a healthy lean pocket under the floor is not stranded (the v0.181.0 shape)
  const v = bankAttributionRow([mk('F3', 500, [{ name: 'dirt', count: 3 }]), mk('F9', 0, [{ name: 'sand', count: 63 }])])
  assert.equal(v, 'bank attribution: top F3 500u')
  // the floor is inclusive at the write-off floor (64u = one stack strands)
  const v2 = bankAttributionRow([mk('F3', 500, []), mk('F9', 0, [{ name: 'sand', count: 64 }])])
  assert.match(v2, /; stranded: F9 0u\/64u pocket - the walk never delivered$/)
  // a custom floor is honored
  const v3 = bankAttributionRow([mk('F9', 0, [{ name: 'sand', count: 100 }])], { minUnits: 128 })
  assert.equal(v3, 'bank attribution: none (no banked units this run)')
})

test('bankAttributionRow: THE JUNK DISCIPLINE - torn views and impossible counters', () => {
  const torn = { username: 'F2', stats: { banked: 30 }, bot: { inventory: { items: () => { throw new Error('torn window') } } } }
  const junk = { username: 'F6', stats: { banked: NaN }, bot: { inventory: { items: () => [{ count: NaN }, { count: -5 }, { name: 'stick', count: 70 }] } } }
  const v = bankAttributionRow([torn, junk])
  assert.ok(v.startsWith('bank attribution: top F2 30u'), v)
  assert.match(v, /; stranded: F6 0u\/70u pocket - the walk never delivered$/, 'a junk banked counter reads zero - never a phantom depositor')
  // missing stats and missing inventories read zero/empty pockets
  const bare = { username: 'F8' }
  assert.equal(bankAttributionRow([bare]), 'bank attribution: none (no banked units this run)')
  // the tie breaks byte-stable by name
  const a = { username: 'F1', stats: { banked: 100 }, bot: { inventory: { items: () => [] } } }
  const b = { username: 'F3', stats: { banked: 100 }, bot: { inventory: { items: () => [] } } }
  assert.match(bankAttributionRow([b, a]), /^bank attribution: top F1 100u, F3 100u/)
})

test('bankAttributionRow: THE WIRING PIN - the report block names the walkers', () => {
  const src = fs.readFileSync(new URL('../../testbed/fleet19.mjs', import.meta.url), 'utf8')
  assert.match(src, /bankAttributionRow[\s\S]*?from '\.\.\/src\/lib\/pocketline\.mjs'/)
  assert.match(src, /console\.log\(bankAttributionRow\(list, \{ whys: finalBankWhys \}\)\)/) // (v0.554.0) the why ledger rides the attribution row
  const rowIdx = src.indexOf('console.log(writeOffRow(list, { whys: finalBankWhys }))')
  const attrIdx = src.indexOf('console.log(bankAttributionRow(list, { whys: finalBankWhys }))')
  const anatomyIdx = src.indexOf('pocketAnatomyRow(list')
  assert.ok(attrIdx > rowIdx, 'the attribution row prints AFTER the write-off row')
  assert.ok(anatomyIdx > attrIdx, 'the anatomy row still prints AFTER the attribution row')
  assert.ok(src.includes('THE BANK-ATTRIBUTION ROW'), 'the wiring carries its own doctrine comment')
})

// ---------------------------------------------------------------------------
// (v0.328.0) THE BANK-BUDGET GAP ROW - the flow row prices the pocket's NEED
// ('needs 322s past the deadline', face 36640056641) but the budget side never
// printed. These tests pin the face datum (322s vs the v0.27.0 150s clock),
// the covered-silence law, the <= boundary, the sibling arithmetic (the two
// rows must never disagree), and the wiring.
// ---------------------------------------------------------------------------
test('bankBudgetGapRow: THE FACE DATUM - 322s of need vs the 150s clock', () => {
  assert.equal(BANK_GAP_MIN_BUDGET_MS, 0)
  // fleet 36640056641's tail: +622u over 285s = 2.2u/s, the 702u pocket
  const samples = [{ t: 0, banked: 995 }, { t: 285, banked: 1617 }]
  const v = bankBudgetGapRow(samples, { pocketUnits: 702, budgetMs: 150000 })
  assert.equal(v, 'bank budget gap: 322s needed, 150s budgeted - 172s short at 2.2u/s - the end bank chains outran the clock')
})

test('bankBudgetGapRow: THE SIBLING ARITHMETIC - the gap row agrees with the flow row', () => {
  // the need the gap row computes must equal the seconds the flow row prints
  const samples = [{ t: 0, banked: 995 }, { t: 285, banked: 1617 }]
  const flow = bankFlowRow(samples, { pocketUnits: 702 })
  const gap = bankBudgetGapRow(samples, { pocketUnits: 702, budgetMs: 300000 })
  assert.match(flow, /the 702u pocket needs 322s past the deadline/)
  assert.match(gap, /322s needed/)
  assert.equal(gap, 'bank budget gap: 322s needed, 300s budgeted - 22s short at 2.2u/s - the end bank chains outran the clock')
  // a huge budget converts ms to seconds honestly - and covers the pocket (the <= law, silence)
  assert.equal(bankBudgetGapRow(samples, { pocketUnits: 702, budgetMs: 9990000 }), null)
})

test('bankBudgetGapRow: THE TRICKLE IS THE FLOW ROW\'S STORY (fleet 37128927104) - the same floor routes both siblings', () => {
  // the live datum: 0.014u/s priced '42379s short at 0.0u/s' - the phantom
  // echo of a rate the face never showed. The trickle returns null (the
  // still verdict is the flow row's story - its own doc's law).
  const trickle = [{ t: 0, banked: 933 }, { t: 285, banked: 937 }]
  assert.equal(bankBudgetGapRow(trickle, { pocketUnits: 883, budgetMs: 300000 }), null)
  // the sibling law holds at the floor: at 0.05u/s the gap speaks
  const live = [{ t: 0, banked: 0 }, { t: 100, banked: 5 }]
  const v = bankBudgetGapRow(live, { pocketUnits: 100, budgetMs: 1000000 })
  assert.equal(v, 'bank budget gap: 2000s needed, 1000s budgeted - 1000s short at 0.1u/s - the end bank chains outran the clock')
})

test('bankBudgetGapRow: THE COVERED SILENCE and the <= boundary', () => {
  const samples = [{ t: 0, banked: 995 }, { t: 285, banked: 1617 }]
  // a lean pocket fits the clock: 327u needs ceil(327*285/622)=150s - covered, silent
  assert.equal(bankBudgetGapRow(samples, { pocketUnits: 327, budgetMs: 150000 }), null)
  // one unit more: 151s needed - the scandal prints with the exact shortage
  const v = bankBudgetGapRow(samples, { pocketUnits: 328, budgetMs: 150000 })
  assert.equal(v, 'bank budget gap: 151s needed, 150s budgeted - 1s short at 2.2u/s - the end bank chains outran the clock')
  // a zero budget is a real config edge, priced honestly
  const z = bankBudgetGapRow(samples, { pocketUnits: 702, budgetMs: 0 })
  assert.equal(z, 'bank budget gap: 322s needed, 0s budgeted - 322s short at 2.2u/s - the end bank chains outran the clock')
})

test('bankBudgetGapRow: THE JUNK BATTERY - garbage never prices a clock', () => {
  const samples = [{ t: 0, banked: 995 }, { t: 285, banked: 1617 }]
  // impossible config
  assert.equal(bankBudgetGapRow(samples, { pocketUnits: 702, budgetMs: -1 }), null)
  assert.equal(bankBudgetGapRow(samples, { pocketUnits: 702, budgetMs: NaN }), null)
  assert.equal(bankBudgetGapRow(samples, { pocketUnits: 702, budgetMs: null }), null)
  // no pocket, no need to price
  assert.equal(bankBudgetGapRow(samples, { pocketUnits: null, budgetMs: 150000 }), null)
  assert.equal(bankBudgetGapRow(samples, { pocketUnits: 0, budgetMs: 150000 }), null)
  assert.equal(bankBudgetGapRow(samples, { pocketUnits: NaN, budgetMs: 150000 }), null)
  assert.equal(bankBudgetGapRow(samples, { pocketUnits: -5, budgetMs: 150000 }), null)
  // no series / stood still / empty: the flow row's story, told there
  assert.equal(bankBudgetGapRow([], { pocketUnits: 702, budgetMs: 150000 }), null)
  assert.equal(bankBudgetGapRow(null, { pocketUnits: 702, budgetMs: 150000 }), null)
  assert.equal(bankBudgetGapRow([{ t: 5, banked: 100 }], { pocketUnits: 702, budgetMs: 150000 }), null)
  assert.equal(bankBudgetGapRow([{ t: 0, banked: 100 }, { t: 10, banked: 100 }], { pocketUnits: 702, budgetMs: 150000 }), null)
  assert.equal(bankBudgetGapRow([{ t: 0, banked: 110 }, { t: 10, banked: 100 }], { pocketUnits: 702, budgetMs: 150000 }), null)
  // junk samples ride the sibling filter: a junk entry is skipped, not fatal
  const mixed = [{ t: 'x', banked: 1 }, { t: 0, banked: 995 }, { t: 285, banked: 1617 }]
  const v = bankBudgetGapRow(mixed, { pocketUnits: 702, budgetMs: 150000 })
  assert.equal(v, 'bank budget gap: 322s needed, 150s budgeted - 172s short at 2.2u/s - the end bank chains outran the clock')
})

test('bankBudgetGapRow: THE WIRING PIN - the gap row prices the granted clock', () => {
  const src = fs.readFileSync(new URL('../../testbed/fleet19.mjs', import.meta.url), 'utf8')
  assert.match(src, /bankBudgetGapRow[\s\S]*?from '\.\.\/src\/lib\/pocketline\.mjs'/)
  // (v0.349.0) the pin caught up with the granted clock it pins: the judged
  // budget is the GRANTED truth (the max chainBudgetMs the fleet's chain
  // entries paid), the static constant only when no chain ever entered -
  // the v0.348.0 wiring's own shape, byte for byte
  // (v0.390.0) the row prices the BANKABLE end pocket - the same class of sum
  // the flow clock prices (the sibling-shape law through the cure); the raw
  // endPk stays the ledger's slot truth
  assert.match(src, /const endPkBankable = pocketTotals\(list, \{ keep: DEPOSIT_KEEP \}\)\.bankable/)
  assert.match(src, /const bankGap = bankBudgetGapRow\(bankFlowSamples\.slice\(-BANK_FLOW_WINDOW\), \{ pocketUnits: endPkBankable, budgetMs: grantedChainBudgetMs > 0 \? grantedChainBudgetMs : END_BANK_BUDGET \}\)/)
  assert.match(src, /if \(bankGap\) console\.log\(bankGap\)/, 'the silence law: a covered pocket prints nothing, never the word null')
  const flowIdx = src.indexOf('const bankFlow = bankFlowRow(bankFlowSamples')
  const gapIdx = src.indexOf('const bankGap = bankBudgetGapRow(bankFlowSamples')
  assert.ok(gapIdx > flowIdx, 'the gap row prints right after the flow row it prices')
  assert.match(src, /const END_BANK_BUDGET = endBankBudgetMs/, 'the budget priced is the fleet\'s own clock')
  assert.ok(src.includes('THE BANK-BUDGET GAP ROW'), 'the wiring carries its own doctrine comment')
})

// ---------------------------------------------------------------------------
// (v0.330.0) THE FINAL-BANK DOOM CENSUS - the attribution row names the
// stranded ('the walk never delivered'), the census reads their WHY: the
// failed shaft-bottom climb cycles the v0.316.0 doom latch counted. Face
// 36592026195: F9 printed the identical 'still underground' verdict 7x, each
// re-entry re-paying two fenced climbs on the same bottom - and the report
// never summed it.

test('doomCensusRow: the F9 datum - a latched bot owns the strand (local form)', () => {
  // face 36592026195's shape: F9 latched (7 failed cycles), F2 paid two
  const entries = [{ name: 'F9', cycles: 7 }, { name: 'F2', cycles: 2 }]
  assert.strictEqual(doomCensusRow(entries),
    'final bank doom census: local - F9 carries 7 of 9 failed climb cycles (77.8%) - the shaft bottom owns the strand',
    'the F9 datum: local - one shaft bottom owns the strand, the cure is a climb fix there')
})

test('doomCensusRow: the spread form - the climb tax is fleet-wide', () => {
  const entries = [{ name: 'F1', cycles: 2 }, { name: 'F2', cycles: 2 }, { name: 'F3', cycles: 2 }]
  assert.strictEqual(doomCensusRow(entries),
    'final bank doom census: spread - top F1 carries 2 of 6 failed climb cycles (33.3%) - the strand is a fleet-wide climb tax',
    'no single shaft bottom owns it - the cure is the climb policy, not one cell')
})

test('doomCensusRow: the grain floor - the latch\'s own trip point (3 cycles)', () => {
  assert.strictEqual(DOOM_CENSUS_MIN_CYCLES, 3, 'the floor is the doom latch\'s own trip point')
  // under the floor: two scattered failures are weather
  assert.strictEqual(doomCensusRow([{ name: 'F9', cycles: 2 }]), null)
  assert.strictEqual(doomCensusRow([{ name: 'F9', cycles: 1 }, { name: 'F2', cycles: 1 }]), null)
  // exactly the floor: one full latch's worth speaks - 2+1 sums to the floor
  assert.strictEqual(doomCensusRow([{ name: 'F9', cycles: 2 }, { name: 'F2', cycles: 1 }]),
    'final bank doom census: local - F9 carries 2 of 3 failed climb cycles (66.7%) - the shaft bottom owns the strand')
  // a single latched bot reads local at 100%
  assert.strictEqual(doomCensusRow([{ name: 'F9', cycles: 3 }]),
    'final bank doom census: local - F9 carries 3 of 3 failed climb cycles (100.0%) - the shaft bottom owns the strand')
})

test('doomCensusRow: the half boundary is inclusive, byte-stable ties name asc', () => {
  // exactly 50.0% counts as local (>=, the hole row's boundary law)
  assert.strictEqual(doomCensusRow([{ name: 'F9', cycles: 2 }, { name: 'F4', cycles: 2 }]),
    'final bank doom census: local - F4 carries 2 of 4 failed climb cycles (50.0%) - the shaft bottom owns the strand')
  // byte-stable tie at 1=1=1: F2 wins the name-asc tie-break over F3/F9
  assert.strictEqual(doomCensusRow([{ name: 'F9', cycles: 1 }, { name: 'F2', cycles: 1 }, { name: 'F3', cycles: 1 }]),
    'final bank doom census: spread - top F2 carries 1 of 3 failed climb cycles (33.3%) - the strand is a fleet-wide climb tax')
})

test('doomCensusRow: the junk battery - junk counts never enter the census', () => {
  assert.strictEqual(doomCensusRow(null), null)
  assert.strictEqual(doomCensusRow('junk'), null)
  assert.strictEqual(doomCensusRow(42), null)
  assert.strictEqual(doomCensusRow([]), null, 'a healthy run: no failed cycles, no census')
  // junk entries skipped, not fatal: NaN, negative, zero, missing, null
  assert.strictEqual(doomCensusRow([{ name: 'F9', cycles: NaN }, { name: 'F2', cycles: -1 }, { cycles: 0 }, null, { name: 'F4' }]), null)
  // a junk zero rides beside real mass: filtered, the mass still prices
  assert.strictEqual(doomCensusRow([{ name: 'F9', cycles: NaN }, { name: 'F3', cycles: 3 }]),
    'final bank doom census: local - F3 carries 3 of 3 failed climb cycles (100.0%) - the shaft bottom owns the strand')
  // fractional cycles floor to the ledger's integer grain: 2.9 -> 2, 0.5 -> 0
  assert.strictEqual(doomCensusRow([{ name: 'F9', cycles: 2.9 }, { name: 'F2', cycles: 0.5 }]), null)
  assert.strictEqual(doomCensusRow([{ name: 'F9', cycles: 2.9 }, { name: 'F2', cycles: 1.5 }]),
    'final bank doom census: local - F9 carries 2 of 3 failed climb cycles (66.7%) - the shaft bottom owns the strand')
  // a missing name never blocks the census
  assert.strictEqual(doomCensusRow([{ cycles: 4 }]),
    'final bank doom census: local - ? carries 4 of 4 failed climb cycles (100.0%) - the shaft bottom owns the strand')
})

test('doomCensusRow: THE WIRING PIN - the census rides the attribution block (v0.330.0)', () => {
  const src = fs.readFileSync(new URL('../../testbed/fleet19.mjs', import.meta.url), 'utf8')
  assert.match(src, /doomCensusRow[\s\S]*?from '\.\.\/src\/lib\/pocketline\.mjs'/)
  assert.ok(src.includes('const doomCensus = doomCensusRow([...finalBankDoomByBot].map(([name, cycles]) => ({ name, cycles })))'),
    'the census reads the fleet\'s own doom ledger')
  assert.match(src, /if \(doomCensus\) console\.log\(doomCensus\)/, 'the silence law: the nullable census never prints the word null')
  const attrIdx = src.indexOf('console.log(bankAttributionRow(list))')
  const censusIdx = src.indexOf('const doomCensus = doomCensusRow(')
  assert.ok(censusIdx > attrIdx, 'the census prints right after the attribution row it explains')
  assert.match(src, /finalBankDoomByBot\.set\(name, \(finalBankDoomByBot\.get\(name\) \|\| 0\) \+ 1\)/,
    'the failed climb cycle feeds the ledger at the doom latch\'s increment site')
  assert.ok(src.includes('THE FINAL-BANK DOOM CENSUS'), 'the wiring carries its own doctrine comment')
})

// ---------------------------------------------------------------------------
// (v0.336.0) THE DOOM-WHY ROW - the census names WHO carries the failed
// climb cycles (per walker), the why row names WHY each cycle failed (per
// failure class). Face 36660134341 (the ten-legged face): 7 failed cycles
// split stalled 3 (F17/F7/F9), wet wall 3 (F15/F14/F5), low-o2 1 (F9's
// first cycle - the oxygen class the instrument never named before) - the
// tax has two heads, and neither is a whale, so the cure is fleet-wide.
// ---------------------------------------------------------------------------

test('climbWhyClass: the face\'s own taxonomy - the decorated reasons classify by keyword', () => {
  // the real reason strings face 36660134341 printed at the doom site
  assert.strictEqual(climbWhyClass('stalled'), 'stalled')
  assert.strictEqual(climbWhyClass('wet wall'), 'wet wall')
  assert.strictEqual(climbWhyClass('low-o2'), 'low-o2')
  assert.strictEqual(climbWhyClass('timeout (fenced at 90s - the chain keeps its reserve)'), 'timeout')
  assert.strictEqual(climbWhyClass('exhausted'), 'exhausted')
  assert.strictEqual(climbWhyClass('stopped'), 'stopped')
  // decorated / case-wrapped forms ride the same include
  assert.strictEqual(climbWhyClass('timeout (fenced at 104s)'), 'timeout')
  assert.strictEqual(climbWhyClass('Wet Wall'), 'wet wall')
  // junk never crashes the classifier - it names the class 'other'
  assert.strictEqual(climbWhyClass(undefined), 'other')
  assert.strictEqual(climbWhyClass(null), 'other')
  assert.strictEqual(climbWhyClass(''), 'other')
  assert.strictEqual(climbWhyClass(42), 'other')
  // (v0.556.0) RE-AIMED: the unreachable/no-path reasons were 'other' - the
  // chain-refuse faces (fleet 37125612065) named them as the third refuse
  // class, so the taxonomy grew. Root cause first: the decorated form
  // carries BOTH 'unreachable' and 'exhausted' - the chest was unreachable,
  // the burned budget is the messenger (fleet 37125612065's F14 reason).
  assert.strictEqual(climbWhyClass('chest unreachable (No path to the goal!)'), 'unreachable')
  assert.strictEqual(climbWhyClass('chest unreachable (budget exhausted (walk floor))'), 'unreachable')
  assert.strictEqual(climbWhyClass('No path to the goal! (51 blocks from yard)'), 'unreachable')
  // the bare exhaustion (F11's live reason) keeps its own class
  assert.strictEqual(climbWhyClass('budget exhausted'), 'exhausted')
  // (v0.558.0) THE SENTINEL CLASS - the wet family's second member. Fleet
  // 37121182189's face read 'other carries 2 of 4 (50.0%)' while both cycles
  // were F15's 'wet-sentinel' refusals - the o2-watch guard the mover's own
  // classifier names since v0.379.0 (climbout.mjs). A known family never
  // rides 'other': the tax names its owner or the row lies by omission.
  assert.strictEqual(climbWhyClass('wet-sentinel'), 'wet-sentinel')
  // the decorated form (surface.mjs's yield reason may reach the doom site
  // wrapped in a fence note) rides the same include
  assert.strictEqual(climbWhyClass('wet-sentinel (o2 watch armed at depth)'), 'wet-sentinel')
  // case-wrapped: the classifier lowercases first
  assert.strictEqual(climbWhyClass('Wet-Sentinel'), 'wet-sentinel')
  // family adjacency: the older wet member keeps its class (no shadowing)
  assert.strictEqual(climbWhyClass('wet wall (shift refused)'), 'wet wall')
})

// ---------------------------------------------------------------------------
// (v0.556.0) THE WHY-BOOK TOKEN - the third refuse class's bridge. The
// strand faces (write-off + attribution) read the book through a token law
// (/^[a-z0-9-]+$/); the taxonomy's spaced classes ('wet wall') and the
// named-nothing ('other') must never ride a strand by token accident or
// drop off it by omission. Fleet 37125612065: F14 68u and F11 rode their
// write-off line unnamed because only the latch and the night hold fed the
// book - the chain's own refusals (budget exhausted, chest unreachable)
// were the third class.
// ---------------------------------------------------------------------------

test('whyBookToken: the taxonomy reshapes to the token law (spaced classes hyphenate)', () => {
  assert.strictEqual(whyBookToken('exhausted'), 'exhausted')
  assert.strictEqual(whyBookToken('unreachable'), 'unreachable')
  assert.strictEqual(whyBookToken('wet wall'), 'wet-wall', 'a KNOWN class never drops off the strand by token accident')
  assert.strictEqual(whyBookToken('low-o2'), 'low-o2')
  // (v0.558.0) the sentinel class is born token-law-clean (dashes allowed):
  // the class string and the strand token are the same bytes
  assert.strictEqual(whyBookToken('wet-sentinel'), 'wet-sentinel')
})

test('whyBookToken: the named-nothing and junk never ride', () => {
  assert.strictEqual(whyBookToken('other'), null, 'a named-nothing is the legacy silence by another name')
  assert.strictEqual(whyBookToken(''), null)
  assert.strictEqual(whyBookToken(null), null)
  assert.strictEqual(whyBookToken(undefined), null)
  assert.strictEqual(whyBookToken(42), null)
  assert.strictEqual(whyBookToken('Wet Wall'), null, 'uppercase fails the law (climbWhyClass lowercases first - the helper never trusts it)')
})

test('THE THIRD REFUSE CLASS rides its own refuse sites (the wiring)', () => {
  const fleetSrc = fs.readFileSync(new URL('../../testbed/fleet19.mjs', import.meta.url), 'utf8')
  // site B: the chain's own refusal - the feed rides BEFORE the print in the
  // same else branch (window-searched: the nearest print is the same block)
  const printIdx = fleetSrc.indexOf('console.log(`${name} final bank: 0 (${res.reason})`)')
  const chainFeedIdx = fleetSrc.indexOf('const chainTok = whyBookToken(climbWhyClass(res.reason))')
  assert.ok(chainFeedIdx > -1, 'the chain-refuse feed exists')
  assert.ok(printIdx > chainFeedIdx, 'the feed rides BEFORE the verdict print - the class is known AT the refusal')
  assert.ok(fleetSrc.slice(chainFeedIdx - 1200, chainFeedIdx).includes('THE THIRD REFUSE CLASS'), 'the feed carries its own doctrine comment')
  // site A: the still-underground branch - the climb class joins the book
  const climbFeedIdx = fleetSrc.indexOf('const climbTok = whyBookToken(whyCls)')
  assert.ok(climbFeedIdx > -1, 'the climb-doomed feed exists')
  assert.ok(climbFeedIdx > fleetSrc.indexOf('finalBankDoomWhy.set(whyCls'), 'the climb feed rides beside the doom-why census feed (the same class, one computation)')
})

test('doomWhyRow: the face datum - the tax splits two ways, neither head a whale (spread form)', () => {
  // face 36660134341's exact distribution, byte-stable ties class asc
  const entries = [{ cls: 'stalled', cycles: 3 }, { cls: 'wet wall', cycles: 3 }, { cls: 'low-o2', cycles: 1 }]
  assert.strictEqual(doomWhyRow(entries),
    'final bank doom why: spread - stalled 3, wet wall 3, low-o2 1 of 7 failed climb cycles - the tax splits 3 ways')
})

test('doomWhyRow: the local form - one class owns the tax', () => {
  // wet wall 4 of 7 = 57.1% crosses the half boundary
  assert.strictEqual(doomWhyRow([{ cls: 'wet wall', cycles: 4 }, { cls: 'stalled', cycles: 2 }, { cls: 'low-o2', cycles: 1 }]),
    'final bank doom why: local - wet wall carries 4 of 7 failed climb cycles (57.1%) - one class owns the tax')
  assert.strictEqual(doomWhyRow([{ cls: 'stalled', cycles: 3 }]),
    'final bank doom why: local - stalled carries 3 of 3 failed climb cycles (100.0%) - one class owns the tax')
})

test('doomWhyRow: the grain floor is the census\'s own trip point, byte-stable ties class asc', () => {
  assert.strictEqual(DOOM_CENSUS_MIN_CYCLES, 3, 'the floor stays the doom latch\'s own trip point')
  // under the floor: silent (the leanness law)
  assert.strictEqual(doomWhyRow([{ cls: 'stalled', cycles: 2 }]), null)
  assert.strictEqual(doomWhyRow([{ cls: 'stalled', cycles: 1 }, { cls: 'wet wall', cycles: 1 }]), null)
  // at the floor: it speaks
  assert.strictEqual(doomWhyRow([{ cls: 'stalled', cycles: 2 }, { cls: 'wet wall', cycles: 1 }]),
    'final bank doom why: local - stalled carries 2 of 3 failed climb cycles (66.7%) - one class owns the tax')
  // the half boundary is inclusive: 2 of 4 = 50.0% is local
  assert.strictEqual(doomWhyRow([{ cls: 'wet wall', cycles: 2 }, { cls: 'stalled', cycles: 2 }]),
    'final bank doom why: local - stalled carries 2 of 4 failed climb cycles (50.0%) - one class owns the tax')
})

test('doomWhyRow: the junk battery - junk classes never enter the tax', () => {
  assert.strictEqual(doomWhyRow(null), null)
  assert.strictEqual(doomWhyRow('junk'), null)
  assert.strictEqual(doomWhyRow(42), null)
  assert.strictEqual(doomWhyRow([]), null, 'a healthy run: no failed cycles, no why row')
  // junk entries skipped, not fatal: NaN, negative, zero, missing, null
  assert.strictEqual(doomWhyRow([{ cls: 'stalled', cycles: NaN }, { cls: 'wet wall', cycles: -1 }, { cycles: 0 }, null, { cls: 'stalled' }]), null)
  // a junk zero rides beside real mass: filtered, the mass still prices
  assert.strictEqual(doomWhyRow([{ cls: 'stalled', cycles: NaN }, { cls: 'wet wall', cycles: 3 }]),
    'final bank doom why: local - wet wall carries 3 of 3 failed climb cycles (100.0%) - one class owns the tax')
  // fractional cycles floor to the ledger's integer grain: 2.9 -> 2, 0.5 -> 0
  assert.strictEqual(doomWhyRow([{ cls: 'stalled', cycles: 2.9 }, { cls: 'wet wall', cycles: 0.5 }]), null)
  assert.strictEqual(doomWhyRow([{ cls: 'stalled', cycles: 2.9 }, { cls: 'wet wall', cycles: 1.5 }]),
    'final bank doom why: local - stalled carries 2 of 3 failed climb cycles (66.7%) - one class owns the tax')
  // a missing class never blocks the row
  assert.strictEqual(doomWhyRow([{ cycles: 4 }]),
    'final bank doom why: local - ? carries 4 of 4 failed climb cycles (100.0%) - one class owns the tax')
})

test('doomWhyRow: THE WIRING PIN - the why row rides the census block (v0.336.0)', () => {
  const src = fs.readFileSync(new URL('../../testbed/fleet19.mjs', import.meta.url), 'utf8')
  assert.match(src, /doomWhyRow[\s\S]*?from '\.\.\/src\/lib\/pocketline\.mjs'/)
  assert.ok(src.includes('const finalBankDoomWhy = new Map()'), 'the why ledger lives beside the census ledger')
  // the classifier feeds the why ledger at the census's own increment site
  const censusFeed = src.indexOf('finalBankDoomByBot.set(name,')
  const whyFeed = src.indexOf('finalBankDoomWhy.set(whyCls,')
  assert.ok(whyFeed > 0 && whyFeed - censusFeed < 400, 'the why ledger feeds at the census\'s own increment site')
  assert.ok(src.includes('climbWhyClass(cr.reason)'), 'the classifier reads the climb\'s own reason')
  const censusIdx = src.indexOf('const doomCensus = doomCensusRow(')
  const whyIdx = src.indexOf('const doomWhy = doomWhyRow(')
  assert.ok(whyIdx > censusIdx, 'the why row prints right after the census it explains')
  assert.match(src, /if \(doomWhy\) console\.log\(doomWhy\)/, 'the why row obeys the same leanness law')
  assert.match(src, /if \(bankFlow\) console\.log\(bankFlow\)/, 'the silence law rides the flow row')
  assert.ok(src.includes('THE DOOM-WHY ROW'), 'the wiring carries its own doctrine comment')
})

// ---- (v0.553.0) THE WRITE-OFF'S WHY ----
// fleet 37121182189: 'final write-off: F15 205u/12s, F10 128u/10s, F12 72u/16s
// (the deadline pocket rode unbanked)' while the REAL why ('final bank
// deferred: night', the v0.140.1 hold) sat 3400 lines upstream - the
// face-reader dived the log to learn the doctrine owned the strand. The row
// reads the class now: the why rides the verdict (the honest-line law).

test('writeOffRow: opt-in law - the legacy call stays byte-identical with no whys', () => {
  const f9 = inv([{ name: 'iron_ore', count: 200 }, { name: 'cobblestone', count: 212 }]) // 412u/2s
  const legacy = writeOffRow([{ username: 'F9', ...f9 }])
  assert.strictEqual(legacy,
    'final write-off: F9 412u/2s (the deadline pocket rode unbanked)',
    'no whys -> the 0.302.0 byte form')
  assert.strictEqual(writeOffRow([{ username: 'F9', ...f9 }], {}),
    'final write-off: F9 412u/2s (the deadline pocket rode unbanked)',
    'empty opts -> the same byte form')
  assert.strictEqual(writeOffRow([{ username: 'F9', ...f9 }], { whys: null }),
    'final write-off: F9 412u/2s (the deadline pocket rode unbanked)',
    'null whys -> the same byte form')
})

test('writeOffRow: the why rides the holder - night strand reads its class on the face', () => {
  const f15 = inv([{ name: 'iron_ore', count: 205 }]) // the 37121182189 whale
  const f10 = inv([{ name: 'coal', count: 128 }])
  const whys = new Map([['F15', 'night'], ['F10', 'night']])
  assert.strictEqual(writeOffRow([{ username: 'F15', ...f15 }, { username: 'F10', ...f10 }], { whys }),
    'final write-off: F15 205u/1s night, F10 128u/1s night (the deadline pocket rode unbanked)',
    'the doctrine names itself on the face - no log dive')
})

test('writeOffRow: mixed classes - the doom-latched strand names itself beside the unexplained one', () => {
  const f7 = inv([{ name: 'iron_ore', count: 100 }])
  const f4 = inv([{ name: 'dirt', count: 80 }])
  const whys = { F4: 'doom-latched' } // plain-object book shape
  assert.strictEqual(writeOffRow([{ username: 'F7', ...f7 }, { username: 'F4', ...f4 }], { whys }),
    'final write-off: F7 100u/1s, F4 80u/1s doom-latched (the deadline pocket rode unbanked)',
    'a holder with no why keeps the legacy form; the object book works like the Map')
})

test('writeOffRow: whys for non-holders never phantom, junk whys never ride', () => {
  const f2 = inv([{ name: 'dirt', count: 30 }]) // under the floor
  const f9 = inv([{ name: 'iron_ore', count: 200 }, { name: 'cobblestone', count: 212 }])
  assert.strictEqual(writeOffRow([{ username: 'F9', ...f9 }, { username: 'F2', ...f2 }],
    { whys: new Map([['F2', 'night']]) }),
    'final write-off: F9 412u/2s (the deadline pocket rode unbanked)',
    'a why for a holder under the 64u floor stays unnamed')
  const junk = new Map([['F9', ''], ['x', 'has space'], ['y', 42], ['z', null]])
  assert.strictEqual(writeOffRow([{ username: 'F9', ...f9 }], { whys: junk }),
    'final write-off: F9 412u/2s (the deadline pocket rode unbanked)',
    'empty/junk token values degrade to the legacy form (the junk law)')
  assert.strictEqual(writeOffRow([{ username: 'F9', ...f9 }], { whys: 'night' }),
    'final write-off: F9 412u/2s (the deadline pocket rode unbanked)',
    'a string book is not a book - ignored, legacy form')
  assert.strictEqual(writeOffRow([{ username: 'F9', ...f9 }], { whys: new Map([['F9', 'doom-latched']]) }),
    'final write-off: F9 412u/2s doom-latched (the deadline pocket rode unbanked)',
    'the clean token form rides (dash allowed, lowercase enforced by the token law)')
})

test('writeOffRow: THE WIRING PIN - the why ledger feeds the defer sites and rides the report row (v0.553.0)', () => {
  const src = fs.readFileSync(new URL('../../testbed/fleet19.mjs', import.meta.url), 'utf8')
  assert.ok(src.includes('const finalBankWhys = new Map()'), 'the why ledger lives beside the fleet ledgers')
  const nightFeed = src.indexOf("finalBankWhys.set(name, 'night')")
  const doomFeed = src.indexOf("finalBankWhys.set(name, 'doom-latched')")
  assert.ok(nightFeed > 0 && doomFeed > 0, 'both refuse classes feed the ledger')
  // the log line rides WITHIN the same block as the feed (the class is known at
  // the refusal, not reconstructed) - window search, not indexOf: the string
  // also appears in earlier doctrine comments
  assert.ok(src.slice(nightFeed, nightFeed + 400).includes('final bank deferred: night'),
    'the night feed rides its own defer site')
  assert.ok(src.slice(doomFeed, doomFeed + 400).includes('dooms-latched after'),
    'the doom feed rides its own latch site')
  assert.ok(src.includes("writeOffRow(list, { whys: finalBankWhys })"),
    'the report row reads the ledger (the single write-off site)')
})

// ---- (v0.554.0) THE ATTRIBUTION'S HONEST TAIL ----
// fleet 37121182189: the attribution row read 'stranded: F15 0u/205u pocket,
// F10 0u/128u pocket, F12 0u/72u pocket - the walk never delivered' while the
// night hold REFUSED the walks outright - the tail lied for the held class.
// The same why book writeOffRow reads now rides the attribution row too.

test('bankAttributionRow: opt-in law - no whys keeps the legacy byte form', () => {
  const mk = (name, banked, items) => ({ username: name, stats: { banked }, bot: { inventory: { items: () => items } } })
  const miners = [mk('F7', 277, [{ name: 'dirt', count: 5 }]), mk('F15', 0, [{ name: 'iron_ore', count: 205 }])]
  const legacy = 'bank attribution: top F7 277u; stranded: F15 0u/205u pocket - the walk never delivered'
  assert.equal(bankAttributionRow(miners), legacy, 'no whys -> the 0.324.0 byte form')
  assert.equal(bankAttributionRow(miners, {}), legacy, 'empty opts -> the same bytes')
  assert.equal(bankAttributionRow(miners, { whys: null }), legacy, 'null whys -> the same bytes')
})

test('bankAttributionRow: the strand rode the hold - a fully-explained strand names its classes', () => {
  const mk = (name, banked, items) => ({ username: name, stats: { banked }, bot: { inventory: { items: () => items } } })
  const miners = [
    mk('F7', 277, [{ name: 'dirt', count: 5 }]),
    mk('F15', 0, [{ name: 'iron_ore', count: 205 }]),
    mk('F10', 0, [{ name: 'coal', count: 128 }]),
    mk('F12', 0, [{ name: 'sand', count: 72 }])
  ]
  const whys = new Map([['F15', 'night'], ['F10', 'night'], ['F12', 'night']])
  assert.equal(bankAttributionRow(miners, { whys }),
    'bank attribution: top F7 277u; stranded: F15 0u/205u pocket night, F10 0u/128u pocket night, F12 0u/72u pocket night - the strand rode night',
    'the doctrine names itself on the face: the walks were never armed')
})

test('bankAttributionRow: mixed classes and multi-class tails stay byte-stable', () => {
  const mk = (name, banked, items) => ({ username: name, stats: { banked }, bot: { inventory: { items: () => items } } })
  const miners = [
    mk('F7', 277, [{ name: 'dirt', count: 5 }]),
    mk('F15', 0, [{ name: 'iron_ore', count: 205 }]),
    mk('F4', 0, [{ name: 'dirt', count: 80 }]),
    mk('F9', 0, [{ name: 'cobblestone', count: 70 }])
  ]
  const whys = new Map([['F15', 'night'], ['F4', 'night'], ['F9', 'doom-latched']])
  assert.equal(bankAttributionRow(miners, { whys }),
    'bank attribution: top F7 277u; stranded: F15 0u/205u pocket night, F4 0u/80u pocket night, F9 0u/70u pocket doom-latched - the strand rode doom-latched+night',
    'distinct classes alphabetical, +joined (byte-stable regardless of holder order)')
})

test('bankAttributionRow: a partial why book keeps the legacy tail, the held holder names itself', () => {
  const mk = (name, banked, items) => ({ username: name, stats: { banked }, bot: { inventory: { items: () => items } } })
  const miners = [mk('F7', 277, [{ name: 'dirt', count: 5 }]), mk('F15', 0, [{ name: 'iron_ore', count: 205 }]), mk('F9', 0, [{ name: 'cobblestone', count: 70 }])]
  assert.equal(bankAttributionRow(miners, { whys: new Map([['F15', 'night']]) }),
    'bank attribution: top F7 277u; stranded: F15 0u/205u pocket night, F9 0u/70u pocket - the walk never delivered (the held strands name their why)',
    'the unexplained strand keeps the walk verdict; the held one rides its token')
})

test('bankAttributionRow: junk whys never land and the stranded-only form keeps its shape', () => {
  const mk = (name, banked, items) => ({ username: name, stats: { banked }, bot: { inventory: { items: () => items } } })
  const miners = [mk('F7', 277, [{ name: 'dirt', count: 5 }]), mk('F15', 0, [{ name: 'iron_ore', count: 205 }])]
  assert.equal(bankAttributionRow(miners, { whys: new Map([['F15', 'has space'], ['F15', '']]) }),
    'bank attribution: top F7 277u; stranded: F15 0u/205u pocket - the walk never delivered',
    'junk tokens degrade to the legacy form (the token law)')
  assert.equal(bankAttributionRow([mk('F12', 0, [{ name: 'dirt', count: 220 }])], { whys: { F12: 'night' } }),
    'bank attribution: none deposited - stranded with pockets: F12 220u night',
    'the stranded-only form keeps its legacy shape, the why rides as a suffix')
  assert.equal(bankAttributionRow([mk('F12', 0, [{ name: 'dirt', count: 220 }])]),
    'bank attribution: none deposited - stranded with pockets: F12 220u',
    'without whys the stranded-only form is byte-identical to 0.324.0')
})

test('bankAttributionRow: THE WIRING PIN - the report row reads the same why ledger (v0.554.0)', () => {
  const src = fs.readFileSync(new URL('../../testbed/fleet19.mjs', import.meta.url), 'utf8')
  const woIdx = src.indexOf('console.log(writeOffRow(list, { whys: finalBankWhys }))')
  const baIdx = src.indexOf('console.log(bankAttributionRow(list, { whys: finalBankWhys }))')
  assert.ok(woIdx > 0 && baIdx > woIdx, 'the attribution row rides the report block AFTER the write-off row, both read finalBankWhys')
  assert.ok(src.includes("THE ATTRIBUTION'S HONEST TAIL"), 'the wiring carries its own doctrine comment')
})

// ---- (v0.557.0) THE THIRD WHY CLASS - the collision composition ----
// fleet 37125612065's live face (the first WHY-tagged run) left F14 68u/11s
// unexplained while the log held 'F14 final bank: 0 (chest unreachable (budget
// exhausted (walk floor)))'. BOTH lanes fed the chain-refusal why at the same
// seat (collision #47): the lane's 0.556.0 classifier won - root cause first,
// F14's reason reads 'unreachable' (the exhaustion is the messenger, not the
// cause). These pins hold the COMPOSITION: reason -> climbWhyClass ->
// whyBookToken -> the face rows.

test('writeOffRow: the F14 datum reads explained - the chain-refusal composition rides the strand', () => {
  const f14 = inv([{ name: 'iron_ore', count: 68 }])
  const reason = 'chest unreachable (budget exhausted (walk floor))'
  const tok = whyBookToken(climbWhyClass(reason))
  assert.equal(tok, 'unreachable', 'root cause first: the burned budget is the messenger, the unreachable chest is the class')
  assert.strictEqual(writeOffRow([{ username: 'F14', ...f14 }], { whys: new Map([['F14', tok]]) }),
    'final write-off: F14 68u/1s unreachable (the deadline pocket rode unbanked)',
    'the third class rides the holder through the token law (dash allowed)')
  const f13 = inv([{ name: 'coal', count: 155 }])
  const f2 = inv([{ name: 'dirt', count: 169 }])
  const book = new Map([['F2', 'doom-latched'], ['F13', 'night'], ['F14', tok]])
  assert.strictEqual(bankAttributionRow(
    [{ username: 'F2', stats: { banked: 0 }, ...f2 }, { username: 'F13', stats: { banked: 0 }, ...f13 }, { username: 'F14', stats: { banked: 0 }, ...f14 }],
    { whys: book }),
    'bank attribution: none deposited - stranded with pockets: F2 169u doom-latched, F13 155u night, F14 68u unreachable',
    'all three measured classes ride one face (the 37125612065 strand anatomy)')
})

test('writeOffRow: THE WIRING PIN - the chain-refusal feed rides the chain-failure site (v0.557.0 composition)', () => {
  const src = fs.readFileSync(new URL('../../testbed/fleet19.mjs', import.meta.url), 'utf8')
  const feedIdx = src.indexOf("finalBankWhys.set(name, chainTok)")
  assert.ok(feedIdx > 0, 'the chain refusal feeds the why ledger through the classifier')
  const chainIdx = src.indexOf('const res = await smeltThenBank(miner, { yardGoal, budgetMs: finalBudget })')
  const verdictIdx = src.indexOf('final bank: 0 (${res.reason})')
  assert.ok(chainIdx > 0 && feedIdx > chainIdx && feedIdx < verdictIdx,
    'the feed sits between the chain call and its zero-deposit line (the class known AT the refusal)')
  assert.ok(src.includes('whyBookToken(climbWhyClass(res.reason))'),
    'the composition rides: the chain reason classifies, the token law reshapes, other never rides')
})

// ---- (v0.563.0) THE DOOM-OWNER ROW - the crater census map ----
// fleet 37130962121's live face: 'final bank doom why: local - stalled
// carries 14 of 27 failed climb cycles (51.9%) - one class owns the tax'
// beside 'final bank doom census: spread - top F12 carries 3 of 27 (11.1%)'.
// The face named the top walker OVERALL and the dominant CLASS overall - and
// never read who owns the stalled 14. The cure differs by shape: a top owner
// at half the class is that walker's own path, a spread is the fleet-wide
// grind (the pocket-anatomy lesson, one grain deeper).

test('doomOwnerRow: the live shape - the why row\u0027s dominant class names its top walker', () => {
  const owners = [
    { cls: 'stalled', name: 'F5', cycles: 4 },
    { cls: 'stalled', name: 'F12', cycles: 3 },
    { cls: 'stalled', name: 'F8', cycles: 3 },
    { cls: 'stalled', name: 'F2', cycles: 2 },
    { cls: 'stalled', name: 'F9', cycles: 2 },
    { cls: 'wet wall', name: 'F1', cycles: 6 },
    { cls: 'low-o2', name: 'F17', cycles: 4 },
    { cls: 'timeout', name: 'F8', cycles: 3 }
  ]
  assert.strictEqual(doomOwnerRow(owners),
    "final bank doom owner: stalled's top walker F5 4 of 14 (28.6% of the class) - the class spreads across the walkers - the cure stays fleet-wide",
    'the join grain: the why row\u0027s dominant class read at the census\u0027s walker grain')
})

test('doomOwnerRow: one walker at the half boundary owns the class', () => {
  const owners = [
    { cls: 'stalled', name: 'F3', cycles: 6 },
    { cls: 'stalled', name: 'F7', cycles: 3 },
    { cls: 'stalled', name: 'F9', cycles: 3 },
    { cls: 'wet wall', name: 'F1', cycles: 5 },
    { cls: 'low-o2', name: 'F17', cycles: 3 }
  ]
  assert.strictEqual(doomOwnerRow(owners),
    "final bank doom owner: stalled's top walker F3 6 of 12 (50.0% of the class) - one walker owns the class - the cure is that walker's own path",
    'the half boundary mirrors the census law (at DOOM_CENSUS_LOCAL_SHARE the shape turns local)')
})

test('doomOwnerRow: THE SIBLING PIN - the dominant class agrees with the why row', () => {
  const whyEntries = [{ cls: 'stalled', cycles: 14 }, { cls: 'wet wall', cycles: 6 }, { cls: 'low-o2', cycles: 4 }, { cls: 'timeout', cycles: 3 }]
  const split = { stalled: [['F5', 4], ['F12', 3], ['F8', 3], ['F2', 2], ['F9', 2]], 'wet wall': [['F1', 6]], 'low-o2': [['F17', 4]], timeout: [['F8', 3]] }
  const owners = []
  for (const [cls, ws] of Object.entries(split)) for (const [name, cycles] of ws) owners.push({ cls, name, cycles })
  const ownerCls = doomOwnerRow(owners).match(/^final bank doom owner: ([a-z0-9 -]+)'s top walker/)
  const whyCls = doomWhyRow(whyEntries).match(/^final bank doom why: local - ([a-z0-9 -]+) carries/)
  assert.ok(ownerCls && whyCls, 'both siblings read their class out loud')
  assert.equal(ownerCls[1], whyCls[1], 'one taxonomy, two grains - the class never splits between the siblings')
  const tie = [{ cls: 'wet wall', name: 'F1', cycles: 3 }, { cls: 'stalled', name: 'F5', cycles: 3 }]
  assert.ok(doomOwnerRow(tie).startsWith("final bank doom owner: stalled's top walker"),
    'byte-stable ties: the class tie breaks alphabetically (the why row\u0027s own law)')
})

test('doomOwnerRow: the leanness and junk law', () => {
  assert.equal(doomOwnerRow([]), null, 'no cycles - no row (the leanness law)')
  assert.equal(doomOwnerRow([{ cls: 'stalled', name: 'F5', cycles: 2 }]), null, 'under the grain floor - silent (DOOM_CENSUS_MIN_CYCLES)')
  assert.equal(doomOwnerRow([{ cls: 'stalled', name: 'F5', cycles: 0 }, { cls: 'wet wall', name: 'F1', cycles: -3 }, { cls: 'low-o2', name: 'F17', cycles: NaN }]), null, 'junk cycles never enter the map (the body-guard law)')
  assert.equal(doomOwnerRow(null), null, 'not an array - null')
  assert.ok(doomOwnerRow([{ cls: '  ', name: 'F5', cycles: 3 }, { cls: 'stalled', name: '   ', cycles: 3 }]).startsWith("final bank doom owner: ?'s top walker F5 3 of 3"),
    'junk names and classes read ? - the count is the truth')
})

test('fleet19: THE WIRING PIN - the owner map feeds at the why ledger\u0027s own seat', () => {
  const src = fs.readFileSync(new URL('../../testbed/fleet19.mjs', import.meta.url), 'utf8')
  const whyFeed = src.indexOf('finalBankDoomWhy.set(whyCls, (finalBankDoomWhy.get(whyCls) || 0) + 1)')
  const ownerFeed = src.indexOf("finalBankDoomOwner.set(ownerKey, (finalBankDoomOwner.get(ownerKey) || 0) + 1)")
  const ownerDecl = src.indexOf('const finalBankDoomOwner = new Map()')
  const ownerPrint = src.indexOf('if (doomOwner) console.log(doomOwner)')
  assert.ok(ownerDecl > 0, 'the composite ledger exists')
  assert.ok(whyFeed > 0 && ownerFeed > whyFeed, 'the owner feed sits with the why feed (one seat, one increment)')
  assert.ok(src.includes("const ownerKey = whyCls + '|' + name"), 'the join grain is CLASS|WALKER - the class known AT the failure')
  assert.ok(ownerPrint > ownerFeed, 'the map feeds at the climb seat, the row prints in the report block')
  assert.ok(src.includes('doomOwnerRow([...finalBankDoomOwner]'), 'the report reads the composite ledger, never a second source')
})
