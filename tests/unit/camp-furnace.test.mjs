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
import fs from 'node:fs'
import { campFurnaceAction, ensureCampFurnace, usableMachines, envelopeMachines, campBuildTier, campBuildTierSecs, CAMP_BUILD_TIER_SECS, CAMP_ENVELOPE_B, FURNACE_COBBLE, TABLE_PLANKS } from '../../src/bots/tools.mjs'
import { APPROACH_THRESHOLD } from '../../src/lib/approach.mjs'
import { recordDoomedGoal, resetDoomedGoalLedger } from '../../src/lib/jobqueue.mjs'

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

// ---------------------------------------------------------------------------
// (v0.123.0) THE DOOMED-BAY FILTER - run106 (35907836654, the v0.121.0 fleet,
// SUCCESS but smelt-starved: smelted=4 fleet-wide). F12 stood at the yard bay
// with fuel in pocket and raw_iron + raw_copper to smelt while EVERY machine
// walk died 'doomed goal (ledgered 1-5s ago)' (x17 across 11 machines) - and
// the ladder STILL refused to build ('camp furnace: no build (machine near)'
// x15 fleet-wide; F15 died one budget over the same wall). Machines near must
// mean machines REACHABLE: a LIVE doomed-goal verdict does not count toward
// machinesNear, an all-doomed bay reads as empty, and the camp ladder decides
// on its own merits (wood permitting - the honest planks gate otherwise).

test('usableMachines: an all-doomed bay reads as empty (the F12 flip)', () => {
  const near = [{ position: { x: -144, y: 71, z: 384 } }, { position: { x: -142, y: 71, z: 384 } }]
  const v = usableMachines(near, () => true)
  assert.deepEqual(v, { usable: [], doomed: 2 })
})

test('usableMachines: a mixed bay keeps the live machines (the veto stands)', () => {
  const a = { position: { x: 1, y: 64, z: 1 } }
  const b = { position: { x: 9, y: 64, z: 9 } }
  const v = usableMachines([a, b], cell => cell.x === 1)
  assert.equal(v.doomed, 1)
  assert.deepEqual(v.usable, [b], 'the live machine survives the filter - the yard is still worth trying')
})

test('usableMachines: junk never dooms - a throwing consult, a positionless block, NaN coords', () => {
  const junky = [null, { position: null }, { position: { x: NaN, y: 64, z: 1 } }, { position: { x: 2, y: 64, z: 2 } }]
  const v = usableMachines(junky, () => { throw new Error('ledger exploded') })
  assert.equal(v.doomed, 0, 'a throwing doom consult judges nothing - the legacy shape byte for byte')
  assert.equal(v.usable.length, 4)
  assert.deepEqual(usableMachines('not an array', () => true), { usable: [], doomed: 0 })
})

test('ensureCampFurnace: the doomed bay no longer vetoes the build (the F12 wiring)', async () => {
  resetDoomedGoalLedger()
  try {
    recordDoomedGoal({ x: 3, y: 64, z: 3 }, Date.now(), { ttl: 15000 })
    const lines = []
    const bot = {
      entity: { position: { distanceTo: () => 2 } },
      inventory: { items: () => [{ name: 'raw_iron', count: 8 }, { name: 'cobblestone', count: 20 }] },
      findBlocks: () => [{ x: 3, y: 64, z: 3 }],
      blockAt: p => ({ name: 'furnace', position: p }),
      findBlock: () => null,
      craft: async () => {}
    }
    const r = await ensureCampFurnace(bot, { log: m => lines.push(m) })
    assert.equal(r.why, 'no table and planks 0/4', `the ladder got past the doomed machine to the honest wood gate: got '${r.why}'`)
    assert.ok(lines.some(l => /all doomed-ledgered/.test(l)), `the flip is named: ${lines.join(' | ')}`)
  } finally { resetDoomedGoalLedger() }
})

test('ensureCampFurnace: a LIVE machine near still vetoes (the legacy shape byte for byte)', async () => {
  resetDoomedGoalLedger()
  try {
    const bot = {
      entity: { position: { distanceTo: () => 2 } },
      inventory: { items: () => [{ name: 'raw_iron', count: 8 }, { name: 'cobblestone', count: 20 }] },
      findBlocks: () => [{ x: 3, y: 64, z: 3 }],
      blockAt: p => ({ name: 'furnace', position: p }),
      findBlock: () => null,
      craft: async () => {}
    }
    const r = await ensureCampFurnace(bot, { log: () => {} })
    assert.deepEqual(r, { built: false, why: 'machine near' })
  } finally { resetDoomedGoalLedger() }
})

test('wiring: the doomed-bay consult rides the SAME radius the walk funnel consults (tools.mjs pins)', () => {
  const src = fs.readFileSync(new URL('../../src/bots/tools.mjs', import.meta.url), 'utf8')
  assert.match(src, /usableMachines \(near, isDoomed\)/, 'the pure filter is exported and the executor composes it')
  assert.match(src, /nearDoomedGoal\(cell, Date\.now\(\), \{ radius: DOOMED_GOAL_RADIUS \}\)\.hit === true/, 'the consult shape matches the walk funnel\'s own')
  // (v0.163.0) the envelope gate sits BETWEEN the doomed filter and the ladder:
  // the doomed survivors meet the envelope split, the ladder reads the SPLIT list
  assert.match(src, /envelopeMachines\(machineVerdict\.usable, bot\.entity\.position\)/, 'the doomed survivors feed the envelope split')
  assert.match(src, /machinesNear: envelopeVerdict\.near\.length > 0/, 'the ladder reads the ENVELOPE-FILTERED list')
  assert.match(src, /all doomed-ledgered/, 'the flip carries a named line so the mine can count it')
  assert.match(src, /all beyond the \$\{CAMP_ENVELOPE_B\}b direct envelope/, 'the all-far flip is named so the mine can count it')
  assert.match(src, /inside the envelope keep the veto/, 'the mixed split is named so the mine can count it')
})

test('wiring: the build-fits gate skips the camp build on a thin leg (fleet19.mjs pins)', () => {
  const src = fs.readFileSync(new URL('../../testbed/fleet19.mjs', import.meta.url), 'utf8')
  assert.match(src, /CAMP_BUILD_FIT_SECS = 40/, 'the gate: 24s worst-case build + 15s smelt floor + 1s margin')
  assert.match(src, /smeltSecs < CAMP_BUILD_FIT_SECS/, 'the gate reads the SAME smeltSecs the leg spends')
  assert.match(src, /camp furnace: build skipped - the leg clock/, 'the skip is named so the mine can count it')
})

// ---------------------------------------------------------------------------
// (v0.163.0) THE ENVELOPE VETO GATE - run559 (dispatch 36073741918, the
// v0.161.0 union fleet) named the veto that starves the METAL ladder: F19
// stood 25-32b from the yard's blast furnace row with raw_iron in the pocket,
// the camp ladder refused ('machine near', the 48b scan saw the bay) and the
// SAME leg's machine walk died 'walk to furnace: timeout after 20000ms' - the
// raw_iron rode to the bank un-smelted. "Near" must mean inside the 24b
// direct envelope the walk machinery itself trusts (APPROACH_THRESHOLD).
// ---------------------------------------------------------------------------

test('camp furnace constants: CAMP_ENVELOPE_B pairs with approach.mjs APPROACH_THRESHOLD (the pair pin)', () => {
  assert.equal(CAMP_ENVELOPE_B, APPROACH_THRESHOLD, 'the veto envelope is the SAME 24b the walk ladder trusts - a machine past it cannot veto the build')
  assert.equal(CAMP_ENVELOPE_B, 24)
})

test('envelopeMachines: the F19 shape - a 25-32b bay reads as empty (the metal window flips)', () => {
  const botPos = { x: 0, y: 64, z: 0 }
  const far = [
    { name: 'blast_furnace', position: { x: 30, y: 64, z: 0 } },
    { name: 'blast_furnace', position: { x: 25.5, y: 71, z: 6 } },
    { name: 'furnace', position: { x: 0, y: 64, z: 32 } }
  ]
  const v = envelopeMachines(far, botPos)
  assert.equal(v.far, 3, 'every bay machine is beyond the direct envelope')
  assert.equal(v.near.length, 0, 'nothing keeps the veto')
  assert.ok(v.nearestD != null && v.nearestD > CAMP_ENVELOPE_B, `the nearest distance is measured and far: ${v.nearestD}`)
  assert.ok(Math.abs(v.nearestD - 27.115) < 0.01, `the nearest is the 25.5/71/6 machine (hypot(25.5,7,6)=27.115): got ${v.nearestD}`)
})

test('envelopeMachines: the yard bay keeps the legacy veto (d=5-15 inside the envelope)', () => {
  const botPos = { x: 0, y: 64, z: 0 }
  const bay = [
    { name: 'furnace', position: { x: 5, y: 64, z: 0 } },
    { name: 'blast_furnace', position: { x: 0, y: 71, z: 12 } }
  ]
  const v = envelopeMachines(bay, botPos)
  assert.equal(v.far, 0)
  assert.equal(v.near.length, 2, 'the bay bots keep the veto byte for byte')
})

test('envelopeMachines: the boundary - 24 exactly keeps the veto, 24.5 flips (the envelope edge pin)', () => {
  const botPos = { x: 0, y: 64, z: 0 }
  const atEdge = envelopeMachines([{ name: 'furnace', position: { x: 24, y: 64, z: 0 } }], botPos)
  assert.equal(atEdge.far, 0, 'd=24.0 is INSIDE the envelope (the <= cap keeps it)')
  const pastEdge = envelopeMachines([{ name: 'furnace', position: { x: 24.5, y: 64, z: 0 } }], botPos)
  assert.equal(pastEdge.far, 1, 'd=24.5 is beyond the envelope - the veto cannot anchor to it')
})

test('envelopeMachines: the mixed split - far machines named, the keeper holds the veto', () => {
  const botPos = { x: 0, y: 64, z: 0 }
  const mixed = [
    { name: 'blast_furnace', position: { x: 28, y: 64, z: 0 } },
    { name: 'furnace', position: { x: 8, y: 64, z: 0 } }
  ]
  const v = envelopeMachines(mixed, botPos)
  assert.equal(v.far, 1)
  assert.equal(v.near.length, 1)
  assert.equal(v.near[0].name, 'furnace', 'the envelope keeper is the 8b machine')
  assert.ok(Math.abs(v.nearestD - 8) < 1e-9, 'nearestD tracks the CLOSEST machine')
})

test('envelopeMachines: junk never flips - a positionless machine, a distanceTo-only bot, NaN coords, a non-array (the conservative read)', () => {
  // a non-array reads as an empty bay (the caller's usableMachines already returned)
  assert.deepEqual(envelopeMachines('not an array', { x: 0, y: 0, z: 0 }), { near: [], far: 0, nearestD: null })
  // a machine with NO measurable position still counts near - the legacy veto keeps it
  const v1 = envelopeMachines([{ name: 'furnace', position: null }], { x: 0, y: 64, z: 0 })
  assert.equal(v1.near.length, 1, 'positionless -> near (never build beside an unreadable bay)')
  assert.equal(v1.far, 0)
  // the run559-era fake bots: a distanceTo-only entity position cannot measure - all near
  const v2 = envelopeMachines([{ name: 'furnace', position: { x: 30, y: 64, z: 0 } }], { distanceTo: () => 2 })
  assert.equal(v2.near.length, 1, 'an unmeasurable bot position keeps the legacy veto')
  assert.equal(v2.far, 0)
  // NaN coords never measure
  const v3 = envelopeMachines([{ name: 'furnace', position: { x: NaN, y: 64, z: 0 } }], { x: 0, y: 64, z: 0 })
  assert.equal(v3.near.length, 1)
  assert.equal(v3.far, 0)
  // a throwing position read (a getter trap) degrades to near
  const v4 = envelopeMachines([{ name: 'furnace', get position () { throw new Error('chunk desync') } }], { x: 0, y: 64, z: 0 })
  assert.equal(v4.near.length, 1)
  assert.equal(v4.far, 0)
})

test('ensureCampFurnace: the F19 flip - a far bay lifts the veto, the ladder runs its merits (raw_iron + cobble pocket)', async () => {
  resetDoomedGoalLedger()
  try {
    const lines = []
    const bot = {
      entity: { position: { x: 0, y: 64, z: 0 } },
      inventory: { items: () => [{ name: 'raw_iron', count: 8 }, { name: 'cobblestone', count: 20 }] },
      findBlocks: () => [{ x: 30, y: 64, z: 0 }],
      blockAt: p => ({ name: 'blast_furnace', position: p }),
      findBlock: () => null,
      craft: async () => {}
    }
    const r = await ensureCampFurnace(bot, { log: m => lines.push(m) })
    assert.equal(r.why, 'no table and planks 0/4', `the ladder got PAST the far-bay veto to the honest wood gate: got '${r.why}'`)
    assert.ok(lines.some(l => /1 near machine\(s\) all beyond the 24b direct envelope/.test(l)), `the flip is named: ${lines.join(' | ')}`)
    assert.ok(lines.some(l => /nearest d=30\.0/.test(l)), `the measured distance is in the line: ${lines.join(' | ')}`)
  } finally { resetDoomedGoalLedger() }
})

test('ensureCampFurnace: the envelope keeper holds the veto byte for byte (a d=10 machine near)', async () => {
  resetDoomedGoalLedger()
  try {
    const lines = []
    const bot = {
      entity: { position: { x: 0, y: 64, z: 0 } },
      inventory: { items: () => [{ name: 'raw_iron', count: 8 }, { name: 'cobblestone', count: 20 }] },
      findBlocks: () => [{ x: 10, y: 64, z: 0 }],
      blockAt: p => ({ name: 'blast_furnace', position: p }),
      findBlock: () => null,
      craft: async () => {}
    }
    const r = await ensureCampFurnace(bot, { log: m => lines.push(m) })
    assert.deepEqual(r, { built: false, why: 'machine near' }, 'the legacy veto stands inside the envelope')
    assert.equal(lines.length, 0, `no envelope lines fire on an all-near bay: ${lines.join(' | ')}`)
  } finally { resetDoomedGoalLedger() }
})

test('ensureCampFurnace: the mixed split names the far machine and keeps the veto (the partial shape)', async () => {
  resetDoomedGoalLedger()
  try {
    const lines = []
    const bot = {
      entity: { position: { x: 0, y: 64, z: 0, distanceTo (o) { return Math.hypot(o.x - this.x, o.y - this.y, o.z - this.z) } } },
      inventory: { items: () => [{ name: 'raw_iron', count: 8 }, { name: 'cobblestone', count: 20 }] },
      findBlocks: () => [{ x: 28, y: 64, z: 0 }, { x: 8, y: 64, z: 0 }],
      blockAt: p => ({ name: 'furnace', position: p }),
      findBlock: () => null,
      craft: async () => {}
    }
    const r = await ensureCampFurnace(bot, { log: m => lines.push(m) })
    assert.deepEqual(r, { built: false, why: 'machine near' }, 'the 8b keeper holds the veto')
    assert.ok(lines.some(l => /1 near machine\(s\) beyond the 24b direct envelope \(nearest d=8\.0\) - 1 inside the envelope keep the veto/.test(l)), `the split is named: ${lines.join(' | ')}`)
  } finally { resetDoomedGoalLedger() }
})

// the light fake bot for the read-only tier mirror: the same shape the
// ensureCampFurnace mocks use (entity position with distanceTo for the
// machine sort, the inventory list, the world finders), minus craft/place.
const fakeBot = (items, { pos = { x: 0, y: 70, z: 0 } } = {}) => ({
  entity: { position: { x: pos.x, y: pos.y, z: pos.z, distanceTo () { return 2 } } },
  inventory: { items: () => items },
  findBlocks: () => [],
  findBlock: () => null
})

// ---------------------------------------------------------------------------
// (v0.165.0) THE TIERED BUILD FIT - run77 (36080097477, the honest 600s)
// measured 10 'build skipped - the leg clock (1-20s) cannot afford a 24s
// build' lines while the pockets held the materials for CHEAPER tiers (the
// run's own BUILT lines price the real builds at 8s and 13s). The gate now
// prices the CHEAPEST build the pocket can reach. campBuildTier is the
// read-only mirror of ensureCampFurnace's ladder: same reads, no side
// effects, plus the tier seconds.

test('CAMP_BUILD_TIER_SECS: the tiers are pinned, ordered, and priced', () => {
  // the order MUST be strictly increasing - the tiers mirror the ladder's
  // cost ladder (place < craft+place < table+craft+place < planks+that)
  const t = CAMP_BUILD_TIER_SECS
  assert.equal(t['place-furnace'], 6, 'a held furnace item: equip + place + verify')
  assert.equal(t['craft-furnace'], 10, 'cobble + a table in reach: craft + place')
  assert.equal(t['place-table'], 14, 'a held table: place + craft + place')
  assert.equal(t['craft-table'], 18, 'planks: craft table + place + craft + place')
  assert.equal(t['craft-planks'], 24, 'the full ladder - the v0.123.0 measured 24s')
  assert.ok(t['place-furnace'] < t['craft-furnace'] < t['place-table'] < t['craft-table'] < t['craft-planks'])
})

test('campBuildTierSecs: none costs nothing, unknown actions keep the full-ladder price', () => {
  assert.equal(campBuildTierSecs('none'), 0)
  assert.equal(campBuildTierSecs('place-furnace'), 6)
  assert.equal(campBuildTierSecs('gibberish'), 24, 'an unknown verdict prices conservatively - the gate skips rather than lies')
  assert.equal(campBuildTierSecs(undefined), 24)
})

test('campBuildTier: a held furnace item reads the 6s tier (the cheapest build)', () => {
  const bot = fakeBot([{ name: 'furnace', count: 1 }, { name: 'raw_iron', count: 5 }])
  const t = campBuildTier(bot)
  assert.equal(t.action, 'place-furnace')
  assert.equal(t.secs, 6)
  assert.match(t.why, /x1 held/)
})

test('campBuildTier: cobble + a table in reach reads the 10s tier', () => {
  const bot = fakeBot([{ name: 'raw_copper', count: 12 }, { name: 'cobblestone', count: 30 }])
  bot.findBlock = () => ({ name: 'crafting_table', position: null }) // a table within reach
  const t = campBuildTier(bot)
  assert.equal(t.action, 'craft-furnace')
  assert.equal(t.secs, 10)
})

test('campBuildTier: the table/planks/logs rungs price at 14/18/24', () => {
  // a held table item -> place-table
  let t = campBuildTier(fakeBot([{ name: 'raw_iron', count: 4 }, { name: 'cobblestone', count: 12 }, { name: 'crafting_table', count: 1 }]))
  assert.equal(t.action, 'place-table')
  assert.equal(t.secs, 14)
  // planks >= 4 -> craft-table
  t = campBuildTier(fakeBot([{ name: 'raw_iron', count: 4 }, { name: 'cobblestone', count: 12 }, { name: 'oak_planks', count: 4 }]))
  assert.equal(t.action, 'craft-table')
  assert.equal(t.secs, 18)
  // logs + a short plank stack -> the consolidation rung, the full 24s ladder
  t = campBuildTier(fakeBot([{ name: 'raw_iron', count: 4 }, { name: 'cobblestone', count: 12 }, { name: 'oak_planks', count: 2 }, { name: 'oak_log', count: 1 }]))
  assert.equal(t.action, 'craft-planks')
  assert.equal(t.secs, 24)
})

test('campBuildTier: a usable machine near keeps the veto at 0s (the executor names it)', () => {
  const bot = fakeBot([{ name: 'raw_iron', count: 9 }, { name: 'cobblestone', count: 30 }])
  bot.findBlocks = () => [{ position: { x: 0, y: 70, z: 3 } }] // a furnace 3b away, inside the envelope
  bot.blockAt = () => ({ name: 'furnace', position: { x: 0, y: 70, z: 3 } })
  const t = campBuildTier(bot)
  assert.deepEqual(t, { action: 'none', why: 'machine near', secs: 0, machinesNear: true })
})

test('campBuildTier: a machine beyond the 24b envelope cannot veto (the v0.163.0 shape rides the gate)', () => {
  // the pocket can BUILD (cobble + planks + a smeltable) but the only machine
  // the scan sees stands 40b out - beyond CAMP_ENVELOPE_B (24): the veto must
  // flip and the ladder price the build it would actually run
  const bot = fakeBot([{ name: 'raw_iron', count: 9 }, { name: 'cobblestone', count: 30 }, { name: 'oak_planks', count: 4 }])
  bot.findBlocks = () => [{ position: { x: 40, y: 80, z: 0 } }] // 40b out - beyond CAMP_ENVELOPE_B
  bot.blockAt = () => ({ name: 'furnace', position: { x: 40, y: 80, z: 0 } })
  const t = campBuildTier(bot)
  assert.equal(t.machinesNear, false, 'a 40b machine is beyond the direct envelope - the bay reads as empty')
  assert.equal(t.action, 'craft-table')
  assert.equal(t.secs, 18)
})

test('campBuildTier: nothing to smelt reads none at 0s (the gate never blocks a no-op)', () => {
  // dirt is not a SMELT_OUTPUT key - the pocket reads smelt-empty whatever else it holds
  const t = campBuildTier(fakeBot([{ name: 'dirt', count: 30 }, { name: 'oak_planks', count: 4 }]))
  assert.deepEqual(t, { action: 'none', why: 'nothing to smelt', secs: 0, machinesNear: false })
})

test('campBuildTier: junk bots degrade to the empty verdict (never throw)', () => {
  assert.deepEqual(campBuildTier(null), { action: 'none', why: 'no entity', secs: 0, machinesNear: false })
  assert.deepEqual(campBuildTier({}), { action: 'none', why: 'no entity', secs: 0, machinesNear: false })
  assert.deepEqual(campBuildTier({ entity: {} }), { action: 'none', why: 'no entity', secs: 0, machinesNear: false })
  const boom = { get entity() { throw new Error('desync') } }
  assert.deepEqual(campBuildTier(boom), { action: 'none', why: 'no entity', secs: 0, machinesNear: false })
})

test('campBuildTier: the fleet gate shape - the skip line names the tier (fleet19 source pin)', () => {
  const src = fs.readFileSync(new URL('../../testbed/fleet19.mjs', import.meta.url), 'utf8')
  assert.match(src, /campBuildTier\(miner\.bot\)/, 'the gate consults the read-only mirror')
  assert.match(src, /smeltSecs < tier\.secs \+ CAMP_BUILD_PUT_SECS/, 'the gate arithmetic is tier + the put')
  assert.match(src, /cannot afford a \$\{tier\.secs\}s \$\{tier\.action\} build \+ the \$\{CAMP_BUILD_PUT_SECS\}s put/, 'the skip line names the tier and the why rides')
  assert.doesNotMatch(src, /const CAMP_BUILD_MIN_SECS = 29/, 'the flat 29s floor is retired')
})
