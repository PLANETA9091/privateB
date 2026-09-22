// Tests for the (v0.89.0) CAMP FURNACE ladder in src/bots/tools.mjs.
// Run80 (35773697160) held the v0.88.0 smelt reserve, carried raw_iron - and ended
// smelted=0 fleet-wide with ZERO output lines: the smelt leg ran where the bot
// stood, nothing within 48 was a machine, and NOTHING in the codebase ever
// crafted or placed a furnace ("smelting locally if a furnace is near" - a false
// promise since v0.19.0, THE IRON WALL's seventh run). The cure: 8 cobble + a
// table (4 planks) = a furnace anywhere. These tests pin the pure ladder and the
// ensureCampFurnace early exits with light fake bots (no server; the craft/place
// dance is placeTable's measured pacing, live-verified in CI).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { campFurnaceAction, ensureCampFurnace, FURNACE_COBBLE, TABLE_PLANKS } from '../../src/bots/tools.mjs'

test('camp furnace constants: the vanilla recipe and the table cost (pinned)', () => {
  assert.equal(FURNACE_COBBLE, 8, 'a furnace is 8 cobblestone in a ring')
  assert.equal(TABLE_PLANKS, 4, 'a crafting table is 4 planks')
})

test('campFurnaceAction: a machine already near means never build (the yard bay path)', () => {
  const r = campFurnaceAction({ smeltables: 20, machinesNear: true, cobble: 30, planks: 10, tableNear: true })
  assert.deepEqual(r, { action: 'none', why: 'machine near' }, 'the build must never fire beside an existing furnace')
})

test('campFurnaceAction: nothing to smelt means never build', () => {
  assert.deepEqual(campFurnaceAction({ smeltables: 0, machinesNear: false, cobble: 30 }),
    { action: 'none', why: 'nothing to smelt' })
})

test('campFurnaceAction: a held furnace item is placed before any craft (priority pin)', () => {
  const r = campFurnaceAction({ smeltables: 5, machinesNear: false, furnaceItem: 1, cobble: 0, planks: 0, tableNear: false })
  assert.equal(r.action, 'place-furnace')
  assert.match(r.why, /x1/)
})

test('campFurnaceAction: the cobble gate - 8 proceeds, 7 refuses (boundary pin)', () => {
  assert.equal(campFurnaceAction({ smeltables: 3, cobble: 8, tableNear: true }).action, 'craft-furnace')
  const r7 = campFurnaceAction({ smeltables: 3, cobble: 7, tableNear: true })
  assert.deepEqual(r7, { action: 'none', why: 'cobble 7/8' })
})

test('campFurnaceAction: the table ladder order - table near, then table item, then planks', () => {
  assert.equal(campFurnaceAction({ smeltables: 3, cobble: 12, tableNear: true }).action, 'craft-furnace')
  assert.equal(campFurnaceAction({ smeltables: 3, cobble: 12, tableItem: 1, tableNear: false }).action, 'place-table')
  assert.equal(campFurnaceAction({ smeltables: 3, cobble: 12, planks: 4, tableNear: false }).action, 'craft-table')
  // planks boundary: 4 exactly proceeds, 3 refuses
  assert.equal(campFurnaceAction({ smeltables: 3, cobble: 12, planks: 3 }).action, 'none')
  assert.match(campFurnaceAction({ smeltables: 3, cobble: 12, planks: 3 }).why, /planks 3\/4/)
})

test('campFurnaceAction: junk counts never reach the arithmetic (Number(null) eighth strike)', () => {
  // null/NaN/undefined/negative/string counts floor to 0 - a junk read can never
  // trigger a build nor divide the why-string
  assert.deepEqual(campFurnaceAction({ smeltables: null, cobble: 30 }),
    { action: 'none', why: 'nothing to smelt' })
  assert.deepEqual(campFurnaceAction({ smeltables: 3, cobble: NaN }),
    { action: 'none', why: 'cobble 0/8' })
  assert.deepEqual(campFurnaceAction({ smeltables: undefined, cobble: 30 }),
    { action: 'none', why: 'nothing to smelt' })
  assert.deepEqual(campFurnaceAction({ smeltables: -4, cobble: 30 }),
    { action: 'none', why: 'nothing to smelt' })
  assert.deepEqual(campFurnaceAction({ smeltables: 3, cobble: '12', planks: null }),
    { action: 'none', why: 'cobble 0/8' }, 'strings are not counts - the smelt plan supplies numbers')
  assert.deepEqual(campFurnaceAction({ smeltables: 3, cobble: -9 }),
    { action: 'none', why: 'cobble 0/8' })
  // fractional counts floor (a half-read stack is a whole stack at worst)
  assert.equal(campFurnaceAction({ smeltables: 3.7, cobble: 8.9, tableNear: true }).action, 'craft-furnace')
  assert.equal(campFurnaceAction({ smeltables: 3, cobble: 12, planks: 4.5, tableNear: false }).action, 'craft-table')
})

test('ensureCampFurnace: a machine near exits before ANY build step (light fake bot)', async () => {
  let crafted = 0
  const bot = {
    entity: { position: { distanceTo: () => 2 } },
    inventory: { items: () => [{ name: 'raw_iron', count: 8 }, { name: 'cobblestone', count: 20 }] },
    findBlocks: () => [{ x: 3, y: 64, z: 3 }],
    blockAt: p => ({ name: 'furnace', position: p }),
    findBlock: () => null,
    craft: async () => { crafted++ }
  }
  const r = await ensureCampFurnace(bot, { log: () => {} })
  assert.deepEqual(r, { built: false, why: 'machine near' })
  assert.equal(crafted, 0, 'no craft beside an existing machine')
})

test('ensureCampFurnace: nothing to smelt exits cleanly (empty pockets)', async () => {
  const bot = {
    entity: { position: { distanceTo: () => 2 } },
    inventory: { items: () => [{ name: 'oak_log', count: 5 }] }, // logs are never smelted
    findBlocks: () => [],
    findBlock: () => null
  }
  const r = await ensureCampFurnace(bot, { log: () => {} })
  assert.deepEqual(r, { built: false, why: 'nothing to smelt' })
})

test('ensureCampFurnace: the cobble gate refuses honestly (7 of 8)', async () => {
  const bot = {
    entity: { position: { distanceTo: () => 2 } },
    inventory: { items: () => [{ name: 'raw_iron', count: 3 }, { name: 'cobblestone', count: 7 }] },
    findBlocks: () => [],
    findBlock: () => null
  }
  const r = await ensureCampFurnace(bot, { log: () => {} })
  assert.deepEqual(r, { built: false, why: 'cobble 7/8' })
})

test('ensureCampFurnace: NEVER throws - a dead inventory reads as an error verdict', async () => {
  const bot = { inventory: null, entity: null }
  const r = await ensureCampFurnace(bot, { log: () => {} })
  assert.equal(r.built, false)
  assert.match(r.why, /error:|^no entity$/)
})

test('ensureCampFurnace: a throwing findBlock reads as "no table", never a crash', async () => {
  const bot = {
    entity: { position: { distanceTo: () => 2 } },
    inventory: { items: () => [{ name: 'raw_iron', count: 3 }, { name: 'cobblestone', count: 7 }, { name: 'oak_planks', count: 2 }] },
    findBlocks: () => [],
    findBlock: () => { throw new Error('palette desync') }
  }
  const r = await ensureCampFurnace(bot, { log: () => {} })
  // cobble 7/8 fires before the table check would matter - either the honest cobble
  // refusal or a caught-error verdict, but NEVER a throw
  assert.equal(r.built, false)
})
