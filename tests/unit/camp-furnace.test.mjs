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

// ---------------------------------------------------------------------------
// (v0.102.0) THE PLANK CONSOLIDATION RUNG - run91 named both killers:
//   F4 camp furnace: no build (no table and planks 3/4) - a raw_iron carrier ONE
//   plank short, while the fleet felled 200+ logs that same run;
//   F5 camp furnace: craft crafting_table: no craftable recipe variant - on FOUR
//   planks SPLIT 2 oak + 2 birch (every plank recipe exists once PER TYPE).
// A log is 4 same-type planks in the 2x2, so any single log unlocks both shapes.

test('campFurnaceAction: the consolidation rung - one plank short WITH logs crafts planks (F4 shape)', () => {
  const r = campFurnaceAction({ smeltables: 3, cobble: 12, planks: 3, tableNear: false, logs: 2, maxSameTypePlanks: 3 })
  assert.equal(r.action, 'craft-planks')
  assert.match(r.why, /2 log\(s\)/)
  assert.match(r.why, /largest same-type stack 3\/4/)
})

test('campFurnaceAction: the consolidation rung - 4 MIXED planks never reach craft-table (F5 shape)', () => {
  // the pre-v0.102.0 read said "4 planks - table first" and the craft died on the
  // per-type recipes; the honest per-type view routes to the rung instead
  const r = campFurnaceAction({ smeltables: 3, cobble: 12, planks: 4, tableNear: false, logs: 1, maxSameTypePlanks: 2 })
  assert.equal(r.action, 'craft-planks')
})

test('campFurnaceAction: a real 4-stack of ONE type skips the rung (craft-table stands)', () => {
  const r = campFurnaceAction({ smeltables: 3, cobble: 12, planks: 4, tableNear: false, logs: 6, maxSameTypePlanks: 4 })
  assert.equal(r.action, 'craft-table')
  assert.match(r.why, /4 planks - table first/)
})

test('campFurnaceAction: legacy shape - no logs input means the rung never fires (pinned verdicts stand)', () => {
  // the v0.89.0 callers/tests pass no logs: planks 3/4 must stay the honest 'none'
  assert.deepEqual(campFurnaceAction({ smeltables: 3, cobble: 12, planks: 3 }),
    { action: 'none', why: 'no table and planks 3/4' })
  // a junk logs read is a zero read - the Number(null) lesson
  assert.deepEqual(campFurnaceAction({ smeltables: 3, cobble: 12, planks: 3, logs: NaN }),
    { action: 'none', why: 'no table and planks 3/4' })
  assert.deepEqual(campFurnaceAction({ smeltables: 3, cobble: 12, planks: 3, logs: -2 }),
    { action: 'none', why: 'no table and planks 3/4' })
  // maxSameTypePlanks junk while logs exist: null = the combined-count read (4 -> table);
  // a STRING is not a count (the junk doctrine) -> reads 0 -> the safe rung fires
  assert.equal(campFurnaceAction({ smeltables: 3, cobble: 12, planks: 4, logs: 1, maxSameTypePlanks: null }).action, 'craft-table')
  assert.equal(campFurnaceAction({ smeltables: 3, cobble: 12, planks: 4, logs: 1, maxSameTypePlanks: '4' }).action, 'craft-planks')
})

test('ensureCampFurnace: the F4 cure end-to-end - 3 planks + 1 log builds the table path (light fake bot)', async () => {
  const items = [
    { name: 'raw_iron', count: 8 },
    { name: 'cobblestone', count: 20 },
    { name: 'oak_planks', count: 3 },
    { name: 'oak_log', count: 1 }
  ]
  const lines = []
  const bot = {
    entity: { position: { distanceTo: () => 2 } },
    inventory: { items: () => items },
    findBlocks: () => [],
    findBlock: () => null,
    registry: { itemsByName: { oak_planks: { id: 12 } } },
    recipesFor: () => [{}],
    craft: async () => { items.find(i => i.name === 'oak_planks').count += 4 }
  }
  const r = await ensureCampFurnace(bot, { log: m => lines.push(m) })
  // the rung fired, the consolidation LANDED (3+4=7 oak planks), and the ladder
  // moved past it to craft-table - the mock registry holds no crafting_table, so
  // the chain ends at the honest table-craft verdict, but NO LONGER one plank short
  assert.equal(r.why, 'crafting_table craft failed')
  assert.equal(items.find(i => i.name === 'oak_planks').count, 7, 'the log became 4 planks - the consolidation LANDED (the successful craft is silent, the count is the evidence)')
  assert.ok(lines.some(l => /craft-planks/.test(l) && /1 log\(s\)/.test(l)), `rung line logged: ${lines.join(' | ')}`)
  assert.ok(lines.some(l => /craft-table \(20 cobble \+ 7 planks/.test(l)), `the ladder re-read the pocket and moved on: ${lines.join(' | ')}`)
})

test('ensureCampFurnace: a failed plank craft is an honest named verdict (no recipes)', async () => {
  const bot = {
    entity: { position: { distanceTo: () => 2 } },
    inventory: { items: () => [{ name: 'raw_iron', count: 8 }, { name: 'cobblestone', count: 20 }, { name: 'oak_log', count: 2 }] },
    findBlocks: () => [],
    findBlock: () => null,
    registry: { itemsByName: { oak_planks: { id: 12 } } },
    recipesFor: () => [], // no craftable variant - the recipe gate refuses
    craft: async () => {}
  }
  const lines = []
  const r = await ensureCampFurnace(bot, { log: m => lines.push(m) })
  assert.deepEqual(r, { built: false, why: 'plank craft failed' })
  assert.ok(lines.some(l => /no craftable recipe variant/.test(l)), `the recipe miss is named: ${lines.join(' | ')}`)
})
