// Tests for the shelter policy in src/lib/shelter.mjs.
// The measured death pattern this module closes: naked bootstrap bots at night
// lose every chase (zombies pursue across the surface) AND every fight (fists
// 1-2 dmg vs a 20 hp zombie, live-measured 17 hp -> 4.3 hp with it still alive).
// A sealed 1-deep hole beats every surface mob - the policy pins WHEN the bot
// is allowed to dig in and WHAT it may spend on the seal.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  SHELTER_ROUND_MS, SHELTER_MAX_MS, SHELTER_SAFE_DIST, SEAL_PRIORITY,
  EARN_SEAL_MAX_THREAT_DIST, JUNK_DROP_PRIORITY,
  shelterDue, pickSealItem, pickJunkToDrop, earnSealDue
} from '../../src/lib/shelter.mjs'

test('shelterDue: only the measured death pattern gets the shelter', () => {
  assert.equal(shelterDue({ night: true, armed: false, threatDist: 5 }), true, 'the pattern: naked + night + close threat')
  assert.equal(shelterDue({ night: true, armed: false, threatDist: 12 }), true, '12 = the detect edge')
  assert.equal(shelterDue({ night: true, armed: false, threatDist: 12.5 }), false, 'beyond detect range: keep walking')
  assert.equal(shelterDue({ night: false, armed: false, threatDist: 5 }), false, 'daylight bots walk in the open')
  assert.equal(shelterDue({ night: true, armed: true, threatDist: 5 }), false, 'armed bots fight or flee, they do not seal')
})

test('shelterDue: junk inputs never trap the bot in a hole', () => {
  assert.equal(shelterDue({}), false, 'nothing set -> no shelter')
  assert.equal(shelterDue({ night: 'yes', armed: false, threatDist: 5 }), false, 'junk night is not night')
  assert.equal(shelterDue({ night: true, armed: 0, threatDist: 5 }), false, 'armed must be EXACTLY false (0 is not false here)')
  assert.equal(shelterDue({ night: true, armed: false, threatDist: NaN }), false, 'junk distance reads as far')
  assert.equal(shelterDue({ night: true, armed: false, threatDist: -1 }), true, 'negative = basically inside the mob')
})

// ---- v0.47.1: the DAY ENGAGED class ----
// Fleet 35605960761 (v0.46.0) measured F7/F10 dying in daylight:
// 'shelter skip (night=false armed=true threat=zombie@1.8)' then dead. A
// chewing zombie at <= 3.5 blocks is a lost fight for a tool-armed bot AND a
// lost chase; the dig-in beats both. Beyond contact, daylight mobs walk past.
test('shelterDue: the day-engaged cell (zombie already chewing) gets the shelter', () => {
  assert.equal(shelterDue({ night: false, armed: false, threatDist: 1.8 }), true, 'the measured F7/F10 cell: zombie at 1.8, day')
  assert.equal(shelterDue({ night: false, armed: false, threatDist: 3.5 }), true, 'the DAY_ENGAGE_DIST boundary is inside')
  assert.equal(shelterDue({ night: false, armed: false, threatDist: 3.6 }), false, 'beyond contact: daylight bots walk in the open')
  assert.equal(shelterDue({ night: false, armed: false, threatDist: 12 }), false, 'the detect edge in daylight is NOT a shelter case')
  assert.equal(shelterDue({ night: false, armed: true, threatDist: 1.8 }), false, 'an armed bot never seals, day or night')
  assert.equal(shelterDue({ night: false, armed: 0, threatDist: 1.8 }), false, 'armed junk stays junk')
  assert.equal(shelterDue({ night: true, armed: false, threatDist: 3.6 }), true, 'night keeps its full 12-block radius')
})

test('pickSealItem: dirt family first, craft-critical items never spent', () => {
  assert.equal(pickSealItem([{ name: 'cobblestone', count: 10 }, { name: 'dirt', count: 3 }]).name, 'dirt', 'dirt outranks cobblestone')
  assert.equal(pickSealItem([{ name: 'oak_log', count: 4 }, { name: 'cobblestone', count: 10 }]).name, 'cobblestone', 'logs are NEVER spent')
  assert.equal(pickSealItem([{ name: 'oak_log', count: 4 }, { name: 'oak_planks', count: 12 }, { name: 'stick', count: 8 }]), null, 'only craft-critical stock -> no shelter (an open hole is a death trap)')
  assert.equal(pickSealItem([{ name: 'dirt', count: 1 }]).name, 'dirt')
  assert.equal(pickSealItem([{ name: 'grass_block', count: 2 }]).name, 'grass_block', 'grass block is dirt family')
  assert.equal(pickSealItem([{ name: 'stone', count: 5 }]).name, 'stone', 'smelted stone seals too')
})

test('pickSealItem: junk inventories yield null (flee instead)', () => {
  assert.equal(pickSealItem([]), null)
  assert.equal(pickSealItem(null), null)
  assert.equal(pickSealItem(undefined), null)
  assert.equal(pickSealItem([null, 42, {}, { name: 7 }]), null)
  assert.equal(pickSealItem([{ name: 'creeper' }]), null, 'mob drops that are not sealable are ignored')
})

test('policy constants stay sane', () => {
  assert.equal(SHELTER_MAX_MS > SHELTER_ROUND_MS, true, 'at least one wait round fits the cap')
  assert.equal(SHELTER_SAFE_DIST >= 8, true, 'a zombie at the wall must keep the bot sealed')
  assert.equal(SEAL_PRIORITY[0] === 'dirt', true, 'dirt leads the priority - it is worthless to the bootstrap')
  assert.ok(!SEAL_PRIORITY.some(n => n.endsWith('_log') || n.endsWith('_planks') || n === 'stick'), 'craft-critical blocks are excluded by construction')
})

// ---- v0.50.0: EARN-THE-SEAL (the inventory-full-of-ore class) ----
// Fleet 35619512737 measured 10x 'shelter skip (no seal material)' (F18 x7,
// F3/F13/F17): a full-pocket miner cannot pick up the cobble its own digs drop,
// so it holds nothing sealable - and F3 then died to a skeleton chase at no-seal.
// The cure: drop ONE expendable item for a slot; the wall dug below respawns its
// block as a drop inside pickup range and the seal finds it in the inventory.
test('pickJunkToDrop: true junk is dropped before cheap stacked loot', () => {
  assert.equal(pickJunkToDrop([{ name: 'raw_iron', count: 12 }, { name: 'rotten_flesh', count: 3 }]).name, 'rotten_flesh', 'rotten flesh outranks ore')
  assert.equal(pickJunkToDrop([{ name: 'raw_iron', count: 12 }, { name: 'bone', count: 2 }]).name, 'bone')
  assert.equal(pickJunkToDrop([{ name: 'raw_iron', count: 12 }, { name: 'gravel', count: 9 }]).name, 'gravel')
  assert.equal(pickJunkToDrop([{ name: 'raw_gold', count: 5 }, { name: 'coal', count: 30 }]).name, 'coal', 'coal outranks raw gold')
  assert.equal(pickJunkToDrop([{ name: 'raw_copper', count: 8 }, { name: 'raw_iron', count: 12 }]).name, 'raw_copper')
})

test('pickJunkToDrop: the measured full-ore pocket gets a sacrifice, tools never', () => {
  // F18's pocket: raw iron/gold/coal stacks only - something MUST go for the slot
  const f18 = [{ name: 'raw_iron', count: 9 }, { name: 'raw_gold', count: 4 }, { name: 'coal', count: 21 }]
  assert.equal(pickJunkToDrop(f18).name, 'coal', 'the cheapest plan item pays the one-slot toll')
  // a tool/food/bootstrap-only pocket stays whole: a dead naked bot loses EVERYTHING
  const sacred = [
    { name: 'stone_pickaxe', count: 1 }, { name: 'bread', count: 6 },
    { name: 'oak_log', count: 4 }, { name: 'oak_planks', count: 12 }, { name: 'stick', count: 8 }
  ]
  assert.equal(pickJunkToDrop(sacred), null, 'tools/food/bootstrap stock are NEVER dropped')
  assert.equal(pickJunkToDrop([{ name: 'diamond', count: 2 }, { name: 'iron_pickaxe', count: 1 }]), null, 'plan-critical loot stays')
})

test('pickJunkToDrop: junk inventories yield null (skip stays honest)', () => {
  assert.equal(pickJunkToDrop([]), null)
  assert.equal(pickJunkToDrop(null), null)
  assert.equal(pickJunkToDrop(undefined), null)
  assert.equal(pickJunkToDrop([null, 42, {}, { name: 7 }]), null)
})

test('earnSealDue: the earn window fits before contact, junk never lies', () => {
  assert.equal(earnSealDue({ threatDist: 8 }), true, 'the boundary is inside (zombie ~3.2s to contact)')
  assert.equal(earnSealDue({ threatDist: 1.5 }), true, 'close counts too - the flee itself is already lost')
  assert.equal(earnSealDue({ threatDist: 8.5 }), false, 'beyond the window: RUN, do not craft')
  assert.equal(earnSealDue({ threatDist: 0 }), false, 'contact = no time for anything')
  assert.equal(earnSealDue({ threatDist: NaN }), false, 'junk distance reads as too far to earn')
  assert.equal(earnSealDue({ threatDist: -3 }), false, 'junk negative reads as no earn')
  assert.equal(EARN_SEAL_MAX_THREAT_DIST < 12, true, 'the earn window stays inside the detect radius')
  assert.ok(!JUNK_DROP_PRIORITY.some(n => n.endsWith('_pickaxe') || n.endsWith('_sword') || n === 'bread' || n.endsWith('_log') || n === 'stick'), 'the drop list never contains tools/food/bootstrap stock by construction')
})
