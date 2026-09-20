// Tests for the combat policy in src/lib/combat.mjs.
// The 2026-09-20 smelt-test measured a midday death where the digShaft health
// guard "paused descent" while a zombie hit 20 -> 14.7 -> 5.7 -> dead in 9 s -
// these tests pin the fight-or-flee decisions that layer now executes.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  HOSTILE_NAMES, RANGED_HOSTILES, DETECT_RANGE, ENGAGE_RANGE, RANGED_ENGAGE_RANGE,
  CREEPER_FLEE_RANGE, FLEE_HP, SWARM_FLEE_HP, SWARM_SIZE,
  isHostileEntity, pickWeapon, threatVerdict
} from '../../src/lib/combat.mjs'

test('HOSTILE_NAMES: the mob classes the fleet actually meets are covered', () => {
  for (const name of ['zombie', 'husk', 'drowned', 'skeleton', 'stray', 'creeper', 'spider', 'cave_spider', 'witch', 'slime', 'enderman', 'phantom', 'blaze', 'wither_skeleton']) {
    assert.ok(HOSTILE_NAMES.has(name), `${name} must be hostile`)
  }
  // passive / utility mobs must NOT be in the list: fighting a cow or an iron golem
  // guard wastes the run, and villagers are the trade endpoint one day
  for (const name of ['cow', 'sheep', 'pig', 'chicken', 'villager', 'iron_golem', 'snow_golem', 'cat']) {
    assert.ok(!HOSTILE_NAMES.has(name), `${name} must NOT be hostile`)
  }
})

test('isHostileEntity: name-based, tolerant of junk entities', () => {
  assert.equal(isHostileEntity({ name: 'zombie' }), true)
  assert.equal(isHostileEntity({ name: 'creeper', position: null }), true, 'positionless entities still count')
  assert.equal(isHostileEntity({ name: 'cow' }), false)
  assert.equal(isHostileEntity({ displayName: 'Zombie' }), true, 'displayName falls back')
  assert.equal(isHostileEntity({ displayName: 'Cow' }), false)
  assert.equal(isHostileEntity(null), false)
  assert.equal(isHostileEntity(undefined), false)
  assert.equal(isHostileEntity({}), false)
  assert.equal(isHostileEntity({ name: 42 }), false)
  assert.equal(isHostileEntity('zombie'), false, 'raw strings are not entities')
})

test('pickWeapon: sword > axe > pickaxe, then material within the same type', () => {
  const sword = { name: 'wooden_sword' }
  const axe = { name: 'stone_axe' }
  const pick = { name: 'iron_pickaxe' }
  assert.equal(pickWeapon([pick, axe, sword]), sword, 'a wooden sword beats a stone axe')
  assert.equal(pickWeapon([pick, axe]), axe, 'a stone axe beats an iron pickaxe')
  assert.equal(pickWeapon([pick]), pick)
  assert.equal(pickWeapon([{ name: 'netherite_sword' }, { name: 'diamond_sword' }]).name, 'netherite_sword')
  assert.equal(pickWeapon([{ name: 'stone_sword' }, { name: 'golden_sword' }]).name, 'stone_sword')
})

test('pickWeapon: non-weapons are skipped, junk inventories yield null (fists)', () => {
  assert.equal(pickWeapon([{ name: 'stone_shovel' }, { name: 'iron_hoe' }]).name, 'stone_shovel', 'shovel > hoe')
  assert.equal(pickWeapon([{ name: 'cobblestone' }, { name: 'oak_planks' }, { name: 'dirt' }]), null, 'no weapon in the pocket')
  assert.equal(pickWeapon([]), null)
  assert.equal(pickWeapon(null), null)
  assert.equal(pickWeapon(undefined), null)
  assert.equal(pickWeapon([null, 42, {}]), null, 'junk entries never throw')
})

test('threatVerdict: creepers are always fled, never fought', () => {
  assert.equal(CREEPER_FLEE_RANGE, 7, 'pinned: outside the 3-block blast radius with run margin')
  assert.equal(threatVerdict({ name: 'creeper', dist: 4, hp: 20 }), 'flee')
  assert.equal(threatVerdict({ name: 'creeper', dist: 7, hp: 20 }), 'flee')
  assert.equal(threatVerdict({ name: 'creeper', dist: 9, hp: 20 }), 'ignore', 'far creepers are watched, not engaged')
})

test('threatVerdict: low health turns every threat into a flee', () => {
  assert.equal(FLEE_HP, 8, 'pinned: 4 hearts - one skeleton volley from death')
  assert.equal(threatVerdict({ name: 'zombie', dist: 2, hp: FLEE_HP - 0.5 }), 'flee')
  assert.equal(threatVerdict({ name: 'skeleton', dist: 11, hp: FLEE_HP - 0.5 }), 'flee')
  assert.equal(threatVerdict({ name: 'zombie', dist: 2, hp: FLEE_HP }), 'fight', 'exactly FLEE_HP still fights')
})

test('threatVerdict: a swarm at low-ish health is a lost fight', () => {
  assert.equal(SWARM_SIZE, 3)
  assert.equal(threatVerdict({ name: 'zombie', dist: 3, hp: 13, attackers: 3 }), 'flee')
  assert.equal(threatVerdict({ name: 'zombie', dist: 3, hp: SWARM_FLEE_HP, attackers: 5 }), 'fight', 'full health still fights a swarm')
  assert.equal(threatVerdict({ name: 'zombie', dist: 3, hp: 5, attackers: 1 }), 'flee', 'a single attacker does NOT get the swarm discount')
})

test('threatVerdict: melee and ranged engage ranges differ', () => {
  assert.equal(RANGED_ENGAGE_RANGE > ENGAGE_RANGE, true, 'shooters must be engaged before they shoot from free range')
  assert.equal(threatVerdict({ name: 'zombie', dist: ENGAGE_RANGE, hp: 20 }), 'fight')
  assert.equal(threatVerdict({ name: 'zombie', dist: ENGAGE_RANGE + 1, hp: 20 }), 'ignore', 'a walking zombie 6+ blocks out is not urgent')
  assert.equal(threatVerdict({ name: 'skeleton', dist: 8, hp: 20 }), 'fight', 'a skeleton at 8 is ALREADY shooting')
  assert.equal(threatVerdict({ name: 'skeleton', dist: 13, hp: 20 }), 'ignore')
  assert.ok(RANGED_HOSTILES.has('stray') && RANGED_HOSTILES.has('bogged'), 'new-era skeletons covered')
})

test('threatVerdict: junk input never picks a fight', () => {
  assert.equal(threatVerdict({}), 'ignore', 'no name')
  assert.equal(threatVerdict({ name: 'zombie' }), 'ignore', 'no distance - cannot act on it')
  assert.equal(threatVerdict({ name: 'zombie', dist: NaN }), 'ignore')
  assert.equal(threatVerdict({ name: 'zombie', dist: -3 }), 'ignore')
  assert.equal(threatVerdict({ name: 'cow', dist: 1 }), 'ignore', 'passive mobs are never threats')
  assert.equal(threatVerdict({ name: 'zombie', dist: 3, hp: NaN }), 'fight', 'junk hp assumes healthy')
  assert.equal(threatVerdict({ name: 'zombie', dist: 3, attackers: NaN }), 'fight', 'junk count assumes a lone attacker')
})

test('daylight spiders are neutral bystanders, cave/night spiders are threats', () => {
  assert.equal(threatVerdict({ name: 'spider', dist: 6, hp: 20, dark: false }), 'ignore', 'day spider wandering by')
  assert.equal(threatVerdict({ name: 'spider', dist: 6, hp: 6, dark: false }), 'ignore', 'neutral even when hurt: no threat, no flee')
  assert.equal(threatVerdict({ name: 'spider', dist: 2, hp: 20, dark: false }), 'fight', 'on top of us = provoked/colliding')
  assert.equal(threatVerdict({ name: 'spider', dist: 4, hp: 20, dark: true }), 'fight', 'dark spider is a real spider')
  assert.equal(threatVerdict({ name: 'spider', dist: 4, hp: 20 }), 'fight', 'default dark=true: the safe default fears spiders')
  assert.equal(threatVerdict({ name: 'cave_spider', dist: 4, hp: 20, dark: false }), 'fight', 'cave spiders are ALWAYS hostile (they live in the dark)')
})

test('policy constants stay in a sane relation to each other', () => {
  assert.equal(DETECT_RANGE >= RANGED_ENGAGE_RANGE, true, 'the scanner must see what the verdict engages')
  assert.equal(FLEE_HP < SWARM_FLEE_HP, true)
  assert.equal(CREEPER_FLEE_RANGE > 3, true, 'the vanilla blast radius is 3 - fleeing at <=3 would be too late')
})
