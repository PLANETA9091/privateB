// (v0.390.0) THE BANKABLE POCKET - the crafted-class surplus cure's pricing
// half, unit-pinned. Face 19 (36802577873) priced the whale: the end pocket
// 495u held crafted-class 191u (38.6%) the deposit's KEEP list can NEVER
// bank, while the bank-flow rate counts only BANKED units - the flow pricing
// divided units-that-never-bank by a rate-that-only-banks (the v0.349.0 KEEP
// nuance, the scope law's named price). The cure: pocketTotals splits the
// sum with the deposit's own predicate (the KEEP list passed in, one list
// both sides), the pricing joins read the bankable part, the raw stays the
// slot truth. Junk-safe end to end (the pocketline law: impossible data
// zeroed, a torn view holds nothing).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { pocketTotals } from '../../src/lib/pocketline.mjs'
import { KEEP as DEPOSIT_KEEP } from '../../src/lib/deposit.mjs'

// the deposit's own list rides the test: ONE list both sides (the sibling
// law) - the split must read the classes the deposit actually keeps.
test('the KEEP list is the one the deposit filters with (the one-list law)', () => {
  assert.ok(Array.isArray(DEPOSIT_KEEP))
  for (const k of ['stick', 'planks', 'log', 'torch', 'pickaxe', 'cooked_']) {
    assert.ok(DEPOSIT_KEEP.includes(k), `the KEEP list must keep the ${k} class`)
  }
})

test('the split: KEEP-class kit stays kept, loot rides bankable (face 19 shapes)', () => {
  // a face-19-shaped end pocket: crafted-class surplus + mined cargo
  const items = [
    { name: 'stick', count: 5 },
    { name: 'oak_planks', count: 4 },
    { name: 'torch', count: 3 },
    { name: 'oak_log', count: 2 },
    { name: 'cobblestone', count: 40 },
    { name: 'coal', count: 12 },
    { name: 'dirt', count: 8 }
  ]
  const r = pocketTotals([{ bot: { inventory: { items: () => items } } }], { keep: DEPOSIT_KEEP })
  assert.equal(r.units, 74)
  assert.equal(r.slots, 7)
  assert.equal(r.kept, 14) // stick 5 + planks 4 + torch 3 + log 2
  assert.equal(r.bankable, 60)
  assert.equal(r.units, r.bankable + r.kept) // the split always balances
})

test('the substring classes match the deposit predicate byte for byte', () => {
  const items = [
    { name: 'wooden_pickaxe', count: 1 }, // 'pickaxe' class
    { name: 'stone_shovel', count: 1 }, // 'shovel' class
    { name: 'cooked_beef', count: 3 }, // 'cooked_' class
    { name: 'crafting_table', count: 1 }, // 'crafting_table' class
    { name: 'birch_planks', count: 6 }, // 'planks' class
    { name: 'sapling', count: 2 } // 'sapling' class
  ]
  const r = pocketTotals([{ bot: { inventory: { items: () => items } } }], { keep: DEPOSIT_KEEP })
  assert.equal(r.kept, 14)
  assert.equal(r.bankable, 0)
})

test('the default keep=[] reads bankable===units (byte-identical legacy)', () => {
  const items = [{ name: 'stick', count: 5 }, { name: 'cobblestone', count: 40 }]
  const legacy = pocketTotals([{ bot: { inventory: { items: () => items } } }])
  assert.equal(legacy.units, 45)
  assert.equal(legacy.bankable, 45)
  assert.equal(legacy.kept, 0)
  assert.equal(legacy.slots, 2)
})

test('junk is judged nothing: torn views, impossible counts, junk keep lists', () => {
  // a torn window view holds nothing this tick (the pocketline law)
  assert.deepEqual(
    { units: pocketTotals(null).units, bankable: pocketTotals(null).bankable, kept: pocketTotals(null).kept },
    { units: 0, bankable: 0, kept: 0 }
  )
  // impossible counts zeroed, never corrupting either side of the split
  const torn = [{ bot: { inventory: { items: () => [{ name: 'stone', count: NaN }, { name: 'dirt', count: -5 }, { name: 'cobblestone', count: 9 }, { count: 4 }, { name: 'stick' }] } } }]
  const r = pocketTotals(torn, { keep: DEPOSIT_KEEP })
  assert.equal(r.units, 13) // NaN + negative + the count-less stick are impossible data (zeroed); the nameless 4-unit item is countable legacy data
  assert.equal(r.kept, 0) // a nameless item matches no KEEP class - un-KEEP-able by construction
  assert.equal(r.bankable, 13)
  // a junk keep list reads legacy (fail-open: no list = everything bankable)
  const junkKeep = pocketTotals([{ bot: { inventory: { items: () => [{ name: 'stick', count: 5 }] } } }], { keep: 'stick' })
  assert.equal(junkKeep.bankable, 5)
  // a non-string or empty class never matches (a hostile class cannot eat the split)
  const hostile = pocketTotals([{ bot: { inventory: { items: () => [{ name: 'cobblestone', count: 9 }] } } }], { keep: [null, '', 7] })
  assert.equal(hostile.kept, 0)
  assert.equal(hostile.bankable, 9)
})

test('the fleet sum: every live miner joins the split (the wiring denominator shape)', () => {
  const bots = [
    { bot: { inventory: { items: () => [{ name: 'cobblestone', count: 30 }, { name: 'stick', count: 4 }] } } },
    null,
    { bot: { inventory: { items: () => [{ name: 'iron_ore', count: 12 }, { name: 'oak_planks', count: 8 }] } } },
    { noBot: true }
  ]
  const r = pocketTotals(bots, { keep: DEPOSIT_KEEP })
  assert.equal(r.units, 54)
  assert.equal(r.kept, 12)
  assert.equal(r.bankable, 42)
})

// the wiring pins (the flowclock shape): the pricing joins read the bankable
// sum with the deposit's own list; the gap row reads the same class of sum.
test('the wiring: the two pricing joins and the gap row read the bankable sum with DEPOSIT_KEEP', () => {
  const src = fs.readFileSync(new URL('../../testbed/fleet19.mjs', import.meta.url), 'utf8')
  // the deliverability arm prices the bankable fleet pocket
  assert.match(src, /const fleetPk = pocketTotals\(\[\.\.\.bots\.values\(\)\]\.map\(e => e\.miner\)\.filter\(Boolean\), \{ keep: DEPOSIT_KEEP \}\)/)
  assert.match(src, /pocketUnits: fleetPk\.bankable, baseMs: END_BANK_BUDGET/)
  // the cause line names the bankable pocket and carries the raw (the honest-line law)
  assert.match(src, /fleet bankable pocket \$\{dl\.fleetUnits\}u \(raw \$\{dl\.fleetRaw\}u\)/)
  // the final-bank clock prices the bankable fleet pocket
  assert.match(src, /pocketUnits: fleetPocketUnits\.bankable, baseMs: END_BANK_BUDGET/)
  // the gap row reads the same class of sum (the sibling-shape law through the cure)
  assert.match(src, /const endPkBankable = pocketTotals\(list, \{ keep: DEPOSIT_KEEP \}\)\.bankable/)
  assert.match(src, /pocketUnits: endPkBankable,/)
  // the old raw-denominator shapes must not return
  assert.doesNotMatch(src, /pocketTotals\(\[\.\.\.bots\.values\(\)\]\.map\(e => e\.miner\)\.filter\(Boolean\)\)\.units/)
})
