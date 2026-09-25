// Tests for the combat policy in src/lib/combat.mjs.
// The 2026-09-20 smelt-test measured a midday death where the digShaft health
// guard "paused descent" while a zombie hit 20 -> 14.7 -> 5.7 -> dead in 9 s -
// these tests pin the fight-or-flee decisions that layer now executes.
// v0.47.0 adds the melee-armed shelter gate regression pins.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  HOSTILE_NAMES, RANGED_HOSTILES, DETECT_RANGE, ENGAGE_RANGE, RANGED_ENGAGE_RANGE,
  CREEPER_FLEE_RANGE, FLEE_HP, SWARM_FLEE_HP, SWARM_SIZE,
  FLEE_STALEMATE_EPISODES, FLEE_STALEMATE_MARGIN, KITE_ARRIVE_DIST, KITE_HOP_BLOCKS,
  isHostileEntity, pickWeapon, pickMeleeWeapon, threatVerdict,
  fleeStalemate, fleeResponse, kiteHopTarget,
  effectiveHp, isPoisoned, POISON_HP_BUDGET, POISON_EFFECT_ID,
  WITCH_CHASE_CEILING, witchFightStep,
  MELEE_CHASE_CEILING, meleeFightStep, WATER_FLEE_HP,
  meleeReturnPlan, cooldownTicksForWeapon, MELEE_RETURN_WAIT_TICKS, MELEE_RETURN_WINDOWS,
  FIGHT_DEADLINE_MS, MELEE_REACH,
  RANGED_COOLDOWN_MS, rangedCooldownUntil, rangedCooldownLive
} from '../../src/lib/combat.mjs'
import { shelterDue } from '../../src/lib/shelter.mjs'

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

test('unarmed bots never fight: the fists-vs-zombie battle is a measured loss', () => {
  assert.equal(threatVerdict({ name: 'zombie', dist: 3, hp: 20, armed: false }), 'flee', 'naked vs a melee mob: no fight, ever')
  assert.equal(threatVerdict({ name: 'skeleton', dist: 10, hp: 20, armed: false }), 'flee', 'walking into arrows unarmed is not fighting back')
  assert.equal(threatVerdict({ name: 'zombie', dist: 14, hp: 20, armed: false }), 'ignore', 'beyond the detect edge a naked bot keeps working')
  assert.equal(threatVerdict({ name: 'zombie', dist: 3, hp: 20, armed: true }), 'fight', 'armed behaviour is unchanged')
  assert.equal(threatVerdict({ name: 'zombie', dist: 3, hp: 20 }), 'fight', 'default armed=true keeps the historical behaviour')
  assert.equal(threatVerdict({ name: 'creeper', dist: 4, hp: 20, armed: false }), 'flee', 'creepers outrank everything, armed or not')
})

test('policy constants stay in a sane relation to each other', () => {
  assert.equal(DETECT_RANGE >= RANGED_ENGAGE_RANGE, true, 'the scanner must see what the verdict engages')
  assert.equal(FLEE_HP < SWARM_FLEE_HP, true)
  assert.equal(CREEPER_FLEE_RANGE > 3, true, 'the vanilla blast radius is 3 - fleeing at <=3 would be too late')
})

// ---- v0.47.0: the melee-armed shelter gate ----
// Fleet 35599777909 (v0.46.0) measured 17 deaths with shelters=0: every dead
// bot held a pickaxe, pickWeapon counted it as a weapon, so the shelter gate
// read armed=true and the whole shelter branch was dead code for miners. A
// 3-dmg pickaxe loses the following fight the same way the measured fists do
// (17 hp -> 4.3 hp, zombie alive); only a sword (4-5 dmg) or an axe (7-9 dmg)
// is a real melee weapon.
test('pickMeleeWeapon: swords and axes are melee, tools are not', () => {
  assert.equal(pickMeleeWeapon([{ name: 'stone_pickaxe' }]), null, 'a pickaxe is a tool, not a melee weapon')
  assert.equal(pickMeleeWeapon([{ name: 'iron_shovel' }]), null)
  assert.equal(pickMeleeWeapon([{ name: 'wooden_hoe' }]), null)
  assert.equal(pickMeleeWeapon([{ name: 'stone_sword' }])?.name, 'stone_sword', 'a sword is the melee weapon')
  assert.equal(pickMeleeWeapon([{ name: 'stone_axe' }])?.name, 'stone_axe', 'an axe is a real melee weapon (7-9 dmg)')
  assert.equal(pickMeleeWeapon(null), null)
  assert.equal(pickMeleeWeapon([]), null)
  assert.equal(pickMeleeWeapon([{ name: 'dirt' }, { count: 3 }]), null, 'junk items are skipped')
})

test('pickMeleeWeapon: type and material ordering match pickWeapon semantics', () => {
  assert.equal(pickMeleeWeapon([{ name: 'wooden_sword' }, { name: 'stone_axe' }])?.name, 'wooden_sword',
    'type outranks material: sword(5) beats axe(4) even in better material')
  assert.equal(pickMeleeWeapon([{ name: 'wooden_axe' }, { name: 'golden_sword' }])?.name, 'golden_sword',
    'the golden sword outscores the wooden axe (same as pickWeapon)')
  assert.equal(pickMeleeWeapon([{ name: 'wooden_axe' }, { name: 'diamond_axe' }])?.name, 'diamond_axe',
    'material breaks ties within a type')
})

test('pickWeapon keeps counting pickaxes: the fight-equip path is unchanged', () => {
  assert.equal(pickWeapon([{ name: 'stone_pickaxe' }])?.name, 'stone_pickaxe',
    'a pickaxe still beats fists when a fight happens anyway (equip path)')
  assert.equal(pickWeapon([{ name: 'stone_pickaxe' }, { name: 'wooden_sword' }])?.name, 'wooden_sword')
})

test('REGRESSION PIN: a pickaxe-only bot is naked for shelterDue', () => {
  // the exact wiring tryShelter uses (miner.mjs v0.47.0): the shelter gate
  // must see armed=false for a pickaxe-only miner, or the 17-death class
  // (shelters=0) stays sealed
  const pickaxePocket = [{ name: 'stone_pickaxe', count: 1 }, { name: 'dirt', count: 12 }]
  assert.equal(!!pickMeleeWeapon(pickaxePocket), false, 'pickaxe-only = no melee weapon')
  assert.equal(shelterDue({ night: true, armed: !!pickMeleeWeapon(pickaxePocket), threatDist: 5 }), true,
    'a pickaxe-only miner at night with a zombie at 5 MUST shelter')
  // and the armed bot keeps the old behaviour: a sword holder fights or flees,
  // never seals (the shelter is for the naked)
  const swordPocket = [{ name: 'stone_sword', count: 1 }, { name: 'dirt', count: 12 }]
  assert.equal(shelterDue({ night: true, armed: !!pickMeleeWeapon(swordPocket), threatDist: 5 }), false)
})

// ---- v0.77.0: THE FLEE STALEMATE BREAKER (run73 F6/F18 zombified_piglin chase) ----

test('fleeStalemate: the run73 chase shape - same-speed chaser pins every flee start at ~4 blocks', () => {
  assert.equal(FLEE_STALEMATE_EPISODES, 3, 'pinned: three episodes prove the hops buy nothing')
  assert.equal(FLEE_STALEMATE_MARGIN, 1.5, 'pinned: the spread that still reads as stuck')
  assert.equal(fleeStalemate([4.0, 4.0, 4.0]), true, 'dist 4.0 repeated verbatim = the F18 signature')
  assert.equal(fleeStalemate([6.8, 5.9, 5.5]), true, 'a 1.3 spread over 3 episodes is still a chase going nowhere')
  assert.equal(fleeStalemate([4.0, 5.4, 4.0]), true, 'exactly at the margin (spread 1.4 <= 1.5) is stuck')
})

test('fleeStalemate: a chase that GAINS distance never latches, and the window is the LAST N samples', () => {
  assert.equal(fleeStalemate([4.0, 7.0, 10.0]), false, 'a real escape grows the start distances')
  assert.equal(fleeStalemate([4.0, 5.6, 4.0]), false, 'spread 1.6 > margin: not proven stuck')
  assert.equal(fleeStalemate([10.0, 4.0, 4.2, 4.4]), true,
    'the early genuine escape is OUTSIDE the window - the recent stuck run is what counts')
  assert.equal(fleeStalemate([4.0, 4.0]), false, 'fewer than N episodes = no verdict')
})

test('fleeStalemate: junk-safe - the breaker never fires on a guess', () => {
  assert.equal(fleeStalemate(null), false)
  assert.equal(fleeStalemate(undefined), false)
  assert.equal(fleeStalemate([]), false)
  assert.equal(fleeStalemate('junk'), false)
  assert.equal(fleeStalemate([4, 'x', 4]), false, 'a junk sample inside the window = not proven')
  assert.equal(fleeStalemate([4, NaN, 4]), false)
  assert.equal(fleeStalemate([4, -1, 4]), false, 'a negative distance is junk, not a reading')
  assert.equal(fleeStalemate([null, null, null]), false)
})

test('fleeResponse: the single switch the mechanics execute', () => {
  assert.equal(fleeResponse({ startDists: [4.0, 4.0, 4.0] }), 'kite', 'the stuck chase kites to the yard')
  assert.equal(fleeResponse({ startDists: [4.0, 9.0, 14.0] }), 'radial', 'a gaining chase keeps the historical radial flee')
  assert.equal(fleeResponse({ startDists: [4.0] }), 'radial', 'too few episodes = historical behaviour')
  assert.equal(fleeResponse({}), 'radial', 'no ledger = historical behaviour')
  assert.equal(fleeResponse({ startDists: 'junk' }), 'radial')
})

test('kiteHopTarget: one hop along the bearing to the yard, null near the yard or on junk', () => {
  assert.equal(KITE_ARRIVE_DIST, 8, 'pinned: the pack owns the fight this close to the yard')
  assert.equal(KITE_HOP_BLOCKS, 12, 'pinned: the same hop length the radial flee uses')
  const t = kiteHopTarget({ bx: 100, bz: 100, yx: 100, yz: 40 })
  assert.ok(t && Math.abs(t.x - 100) < 1e-9 && Math.abs(t.z - 88) < 1e-9,
    'due -z yard: the hop is 12 blocks toward it')
  const diag = kiteHopTarget({ bx: 0, bz: 0, yx: 30, yz: 40 })
  assert.ok(diag && Math.abs(Math.hypot(diag.x, diag.z) - 12) < 1e-9,
    'the hop length is exactly 12 along the bearing (50-28-96 yard)')
  assert.equal(kiteHopTarget({ bx: 100, bz: 100, yx: 104, yz: 100 }), null,
    'already within arrive distance of the yard: no kite, the pack owns it')
  assert.equal(kiteHopTarget({ bx: 100, bz: 100, yx: 108, yz: 100 }), null,
    'exactly at arrive distance: no kite')
  assert.equal(kiteHopTarget({ bx: NaN, bz: 100, yx: 0, yz: 0 }), null, 'junk bot position')
  assert.equal(kiteHopTarget({ bx: 0, bz: 0, yx: undefined, yz: 0 }), null, 'junk yard anchor -> radial fallback')
  assert.equal(kiteHopTarget({}), null, 'empty params: no anchor, no kite')
  assert.equal(kiteHopTarget({ bx: 0, bz: 0, yx: 0, yz: -100, hop: 5 }).z, -5, 'a real hop length is honoured (the default stays the pinned 12)')
})

test('REGRESSION PIN: the run73 wiring shape - unarmed verdict feeds the ledger, the kite is a different BEARING only', () => {
  // the exact defendSelf sequence vs run73 F18: pocket [empty] -> armed=false
  // -> flee verdict at dist 4.0; the SAME stuck reading must flip the response
  // to 'kite' after 3 episodes while every policy input stays identical
  const pocket = []
  const armed = !!pickWeapon(pocket)
  const v = threatVerdict({ name: 'zombified_piglin', dist: 4.0, hp: 20, attackers: 1, dark: false, armed })
  assert.equal(v, 'flee', 'unarmed + hostile at 4.0 = flee (the historical verdict is unchanged)')
  const ledger = [4.0, 4.0]
  assert.equal(fleeResponse({ startDists: ledger }), 'radial', 'two episodes: historical flee')
  ledger.push(4.0)
  assert.equal(fleeResponse({ startDists: ledger }), 'kite', 'the third stuck episode flips to the kite')
})

// (v0.112.0) THE POISON LENS - run99 (35869329042) mined the witch as the new
// top mob front: the splash poison drains the bar UNDER the verdicts' feet
// (F1 died at 8.7 with zero verdict lines; F10's flee fired at 5.3 - already
// inside the drain). The lens charges the expected drain against the flee
// thresholds so a poisoned MID bar disengages before the 1-hp poison bottom.
test('effectiveHp: the lens is the identity without poison and charges the drain with it', () => {
  assert.equal(POISON_HP_BUDGET, 4, 'the budget is the vanilla level-1 drain over the ~5s decision window')
  assert.equal(effectiveHp({ health: 12 }), 12, 'no poison: the identity')
  assert.equal(effectiveHp({ health: 12, poisoned: false }), 12, 'poisoned=false is the identity')
  assert.equal(effectiveHp({ health: 12, poisoned: true }), 8, 'poisoned 12 -> the FLEE_HP boundary exactly')
  assert.equal(effectiveHp({ health: 11.5, poisoned: true }), 7.5, 'poisoned mid bar dips under the flee line')
  assert.equal(effectiveHp({ health: 3, poisoned: true }), 0, 'the lens clamps at the death line, never negative')
  assert.equal(effectiveHp({ health: 25, poisoned: true }), 16, 'the lens clamps at the vanilla ceiling')
  assert.equal(effectiveHp({ health: 20, poisoned: true }), 16, 'full bar minus the drain')
  // junk passthrough: a non-finite health is NOT the caller's to guess
  assert.equal(effectiveHp({ health: null, poisoned: true }), null, 'null passes through null - the shelter gate refuses junk downstream')
  assert.equal(effectiveHp({ health: NaN, poisoned: false }), NaN, 'NaN passes through (Number.isFinite guard, not an implicit default)')
  assert.equal(effectiveHp({}), 20, 'empty params default to the full bar')
})

test('threatVerdict: the poison lens flips the poisoned mid bar from fight to flee (the F1/F10 class)', () => {
  // THE F10 POCKET: raw hp 11.5 vs a zombie at melee range reads 'fight' on
  // the raw bar - the exact shape that sank to the 1-hp poison bottom and died
  assert.equal(threatVerdict({ name: 'zombie', dist: 3, hp: 11.5, attackers: 1, dark: true, armed: true, poisoned: true }), 'flee', 'poisoned 11.5 = flee (the raw bar would fight)')
  assert.equal(threatVerdict({ name: 'zombie', dist: 3, hp: 11.5, attackers: 1, dark: true, armed: true, poisoned: false }), 'fight', 'unpoisoned 11.5 keeps the historical fight verdict')
  // THE EXACT BOUNDARY: poisoned 12 lenses to 8 - 8 < 8 is false, so the hp
  // lane does NOT fire; the verdict falls through to the engage check
  assert.equal(threatVerdict({ name: 'zombie', dist: 3, hp: 12, attackers: 1, dark: true, armed: true, poisoned: true }), 'fight', 'poisoned 12 sits exactly ON the flee line: the budget is conservative by design')
  assert.equal(threatVerdict({ name: 'zombie', dist: 3, hp: 11.9, attackers: 1, dark: true, armed: true, poisoned: true }), 'flee', 'poisoned 11.9 (one tick of drain) crosses it')
  // THE SWARM LANE THROUGH THE LENS: raw 17 vs 3 attackers reads fight (17 >= 14);
  // the lensed 13 dips under SWARM_FLEE_HP - a poisoned bot in a swarm is losing
  assert.equal(threatVerdict({ name: 'zombie', dist: 2, hp: 17, attackers: 3, dark: true, armed: true, poisoned: true }), 'flee', 'poisoned swarm: 17 - 4 = 13 < 14 = flee')
  assert.equal(threatVerdict({ name: 'zombie', dist: 2, hp: 17, attackers: 3, dark: true, armed: true, poisoned: false }), 'fight', 'unpoisoned swarm at 17 keeps the fight')
  // a FULL bar still fights through the lens - the budget must not turn every
  // scratch into a flee (the run97 lesson: cowardice wastes trips too)
  assert.equal(threatVerdict({ name: 'witch', dist: 10, hp: 20, attackers: 1, dark: true, armed: true, poisoned: true }), 'fight', 'poisoned full bar still engages the witch at range')
  // the lens never touches the other lanes: creeper proximity and unarmed flee
  assert.equal(threatVerdict({ name: 'creeper', dist: 5, hp: 20, attackers: 1, dark: true, armed: true, poisoned: true }), 'flee', 'creeper proximity outranks any lens state')
  assert.equal(threatVerdict({ name: 'zombie', dist: 4, hp: 20, attackers: 1, dark: true, armed: false, poisoned: true }), 'flee', 'unarmed flee unchanged')
})

test('isPoisoned: the read tolerates every junk shape mineflayer hands out', () => {
  assert.equal(isPoisoned(null), false, 'no bot')
  assert.equal(isPoisoned(undefined), false, 'undefined bot')
  assert.equal(isPoisoned('bot'), false, 'junk bot')
  assert.equal(isPoisoned({}), false, 'no entity')
  assert.equal(isPoisoned({ entity: null }), false, 'null entity')
  assert.equal(isPoisoned({ entity: {} }), false, 'entity without effects')
  assert.equal(isPoisoned({ entity: { effects: null } }), false, 'null effects map')
  assert.equal(isPoisoned({ entity: { effects: {} } }), false, 'empty effects map')
  assert.equal(isPoisoned({ entity: { effects: { 5: { id: 5, amplifier: 0, duration: 900 } } } }), false, 'an unrelated effect (speed=5) is not poison')
  // the mineflayer shape: a map keyed by effect id, entries { id, amplifier, duration }
  assert.equal(isPoisoned({ entity: { effects: { 19: { id: 19, amplifier: 0, duration: 900 } } } }), true, 'the legacy numeric id hits without a registry')
  // the registry lookup outranks the fallback (a future flattened id)
  assert.equal(isPoisoned({ registry: { effectsByName: { poison: { id: 27 } } }, entity: { effects: { 27: { id: 27, duration: 100 } } } }), true, 'the registry-resolved id hits')
  assert.equal(isPoisoned({ registry: { effectsByName: { poison: { id: 27 } } }, entity: { effects: { 19: { id: 19, duration: 100 } } } }), false, 'the fallback id does NOT hit when the registry names a different one')
  // name-shaped entries (registry versions that populate names)
  assert.equal(isPoisoned({ entity: { effects: { x: { name: 'Poison', duration: 100 } } } }), true, 'a name entry hits')
  assert.equal(isPoisoned({ entity: { effects: { x: { displayName: 'Poison', duration: 100 } } } }), true, 'a displayName entry hits')
  assert.equal(isPoisoned({ entity: { effects: { x: { name: 'Wither', duration: 100 } } } }), false, 'wither is a different drain - not this lens')
  // junk entries inside the map never crash the read
  assert.equal(isPoisoned({ entity: { effects: { a: null, b: 'junk', c: 19 } } }), false, 'junk entries are skipped, not poisoned')
  assert.equal(isPoisoned({ registry: null, entity: { effects: { 19: { id: 19 } } } }), true, 'a null registry falls back to the legacy id')
})

test('POISON_EFFECT_ID: the fallback stays the legacy numeric poison', () => {
  assert.equal(POISON_EFFECT_ID, 19, 'the legacy id - the registry lookup outranks it, the fallback must stay pinned')
})

// ---- (v0.115.0) THE WITCH CHASE CEILING - run99's other half of the witch front ----
// The lens disengages the drained bot, but the witch itself stayed un-punished:
// the fight loop's moving GoalFollow re-paths toward a retreating witch every
// round (F1 died AT witch@8.7 inside that churn; F10's drain finished the drag).
// The handoff: "close to melee through the potion range, don't chase beyond ~6".
test('witchFightStep: the close through the splash band happens, the retreat chase is capped', () => {
  assert.equal(WITCH_CHASE_CEILING, 6, 'pinned: ~6 walked blocks of chase per episode (the handoff number)')
  // THE F1 SHAPE: the witch hovers at 8.7 to throw - the close MUST happen or
  // the melee never crosses the splash band and the drain never ends
  assert.equal(witchFightStep({ dist: 8.7, chased: 0 }), 'close', 'the F1 hover distance is closed on')
  assert.equal(witchFightStep({ dist: 11.9, chased: 0 }), 'close', 'the verdict engage edge still closes (through the potion range)')
  // in swing range: no follow, and no budget spent on reach rounds
  assert.equal(witchFightStep({ dist: 3.2, chased: 0 }), 'reach')
  assert.equal(witchFightStep({ dist: 2.0, chased: 9 }), 'reach', 'reach outranks a spent budget - the swings land while they can')
  // the retreat: the CUMULATIVE walked chase gates the follow
  assert.equal(witchFightStep({ dist: 8.0, chased: 5.9 }), 'close', 'just under the ceiling: one more bounded step')
  assert.equal(witchFightStep({ dist: 8.0, chased: 6.0 }), 'hold', 'exactly at the ceiling: the chase holds (the episode breaks)')
  assert.equal(witchFightStep({ dist: 12, chased: 9 }), 'hold', 'beyond the ceiling: never chased')
  // junk safety: an unreadable distance never chases a guess; a junk budget
  // reads unspent because the walk measurement owns the truth
  assert.equal(witchFightStep({}), 'hold', 'no distance: hold')
  assert.equal(witchFightStep({ dist: NaN }), 'hold')
  assert.equal(witchFightStep({ dist: undefined, chased: 0 }), 'hold')
  assert.equal(witchFightStep({ dist: -3 }), 'hold', 'a negative distance is junk, not a reading')
  assert.equal(witchFightStep({ dist: 8, chased: NaN }), 'close', 'junk budget reads as unspent')
  assert.equal(witchFightStep({ dist: 8, chased: null }), 'close')
  assert.equal(witchFightStep({ dist: 8, chased: -4 }), 'close', 'a negative budget is junk, not debt')
})

test('REGRESSION PIN: the miner fight loop wires the witch lane (snapshot close + budget + the hold break)', async () => {
  const fs = await import('node:fs')
  const minerSrc = fs.readFileSync(new URL('../../src/bots/miner.mjs', import.meta.url), 'utf8')
  // the policy helper is consulted with the LIVE dist and the spent budget
  assert.ok(/witchFightStep\(\{ dist: cur\.dist, chased: witchChased \}\)/.test(minerSrc),
    'the loop asks witchFightStep with the live distance and the walked budget')
  // the close targets the witch's STANDING cell - a snapshot goal, never the
  // moving follow (the moving follow is the F1/F10 churn this lane exists to kill)
  assert.ok(/GoalXZ\(cur\.entity\.position\.x, cur\.entity\.position\.z\)/.test(minerSrc),
    'the witch close is a snapshot GoalXZ, not a moving GoalFollow')
  assert.ok(/closing witch/.test(minerSrc), 'the snapshot close labels itself for the run logs')
  // the budget spends the WALKED displacement (measured, not the intention)
  assert.ok(/witchChased \+= before\.distanceTo\(bot\.entity\.position\)/.test(minerSrc),
    'the budget accumulates the actual walked displacement')
  // the hold names itself - the next mine reads the lane without re-deriving it
  assert.ok(/witch chase ceiling held/.test(minerSrc),
    'the hold break logs the ceiling with the spent budget and the witch distance')
  // the budget is per-episode: declared inside the fight (reset per defendSelf call)
  assert.ok(/let witchChased = 0/.test(minerSrc), 'the budget starts at zero each episode')
})

test('REGRESSION PIN: the fight episode ends NAMED (the run550 mob-front instrument)', async () => {
  const fs = await import('node:fs')
  const minerSrc = fs.readFileSync(new URL('../../src/bots/miner.mjs', import.meta.url), 'utf8')
  // the episode records what the next mine must know: exit reason, the hp
  // traded, the swings attempted, the weapon actually held - run550's 6 mob
  // deaths left the armed-vs-naked question (the v0.47.0 lesson) unanswered
  assert.ok(/combat: fight ended vs \$\{threat\.name\} \(\$\{exit\}/.test(minerSrc),
    'the end line names the threat and the exit reason')
  assert.ok(/hp \$\{startHp\.toFixed\(1\)\} -> \$\{\(bot\.health \?\? 0\)\.toFixed\(1\)\}/.test(minerSrc),
    'the end line carries the hp trajectory (dead fights read 0, not undefined)')
  assert.ok(/swings \$\{swings\}/.test(minerSrc), 'the end line carries the swing count')
  assert.ok(/weapon \$\{weapon\?\.name \?\? 'fists'\}/.test(minerSrc),
    'the end line names the weapon - a naked fight must be visible in the log')
  assert.ok(/let swings = 0/.test(minerSrc) && /let rounds = 0/.test(minerSrc) && /let exit = 'deadline'/.test(minerSrc),
    'the counters are per-episode locals (reset each defendSelf call)')
  // the flee exit returns early with its own verdict line - the end line must
  // sit AFTER the loop, not inside the flee branch (no double logging)
  const endIdx = minerSrc.indexOf('combat: fight ended vs')
  const fleeIdx = minerSrc.indexOf("combat: verdict flipped to flee")
  assert.ok(endIdx > fleeIdx, 'the end line exists below the flee exit in the fight body')
})

test('meleeFightStep: the general melee chase is a budgeted snapshot close (the v0.137.0 F9 cure)', () => {
  // the F9 shape: a kiting skeleton held dist ~8-10 for the whole deadline -
  // 17 swings, ZERO closes. The budget must spend and then HOLD.
  assert.equal(meleeFightStep({ dist: 8.0, chased: 0 }), 'close', 'the first close is always affordable')
  assert.equal(meleeFightStep({ dist: 4.5, chased: 2.1 }), 'close', 'a closable zombie needs 1-2 blocks - the budget allows it')
  assert.equal(meleeFightStep({ dist: 5.9, chased: 5.9 }), 'close', 'just under the ceiling: one more bounded step')
  assert.equal(meleeFightStep({ dist: 6.0, chased: 6.0 }), 'hold', 'exactly at the ceiling: the chase holds (the episode breaks)')
  assert.equal(meleeFightStep({ dist: 10, chased: 9 }), 'hold', 'beyond the ceiling: never chased')
  // reach outranks a spent budget - the swings land while they can
  assert.equal(meleeFightStep({ dist: 3.2, chased: 0 }), 'reach')
  assert.equal(meleeFightStep({ dist: 2.0, chased: 9 }), 'reach', 'reach outranks a spent budget - the swings land while they can')
  // junk-safe by the witch contract
  assert.equal(meleeFightStep({}), 'hold', 'no distance: hold')
  assert.equal(meleeFightStep({ dist: NaN }), 'hold')
  assert.equal(meleeFightStep({ dist: undefined, chased: 0 }), 'hold')
  assert.equal(meleeFightStep({ dist: -3 }), 'hold', 'a negative distance is junk, not a reading')
  assert.equal(meleeFightStep({ dist: 8, chased: NaN }), 'close', 'junk budget reads as unspent')
  assert.equal(meleeFightStep({ dist: 8, chased: null }), 'close')
  assert.equal(meleeFightStep({ dist: 8, chased: -4 }), 'close', 'a negative budget is junk, not debt')
  // the witch lane keeps its own tunable (independent constants, same shape)
  assert.equal(meleeFightStep({ dist: 8.0, chased: 0 }), witchFightStep({ dist: 8.0, chased: 0 }),
    'the general lane matches the witch shape at the same budget')
  assert.equal(MELEE_CHASE_CEILING, 6, 'the ceiling mirrors the witch measurement (walked blocks per episode)')
})

test('threatVerdict: the water-melee yield line (the v0.137.0 F11 cure)', () => {
  // F11 traded 14.7 -> 5.3 vs a drowned: the land line (8) fired too late.
  // In water the yield line lifts to 12.
  assert.equal(threatVerdict({ name: 'drowned', dist: 2.0, hp: 14.7, inWater: true }), 'fight',
    'the episode may START in water at a healthy bar (14.7 > 12)')
  assert.equal(threatVerdict({ name: 'drowned', dist: 2.0, hp: 11.9, inWater: true }), 'flee',
    'crossing the water line mid-episode flips the verdict while margin remains')
  assert.equal(threatVerdict({ name: 'drowned', dist: 2.0, hp: 12.0, inWater: true }), 'fight',
    'exactly at the line: still fight (strictly below yields)')
  // the land shape is byte for byte (no inWater -> no lift)
  assert.equal(threatVerdict({ name: 'drowned', dist: 2.0, hp: 10 }), 'fight', 'land at 10 still fights (the legacy shape)')
  assert.equal(threatVerdict({ name: 'drowned', dist: 2.0, hp: 9.9, inWater: false }), 'fight', 'an explicit dry read is the legacy shape')
  assert.equal(threatVerdict({ name: 'drowned', dist: 2.0, hp: 10, inWater: 'yes' }), 'fight', 'a junk water read is DRY (never lift on a guess)')
  assert.equal(threatVerdict({ name: 'drowned', dist: 2.0, hp: 10, inWater: null }), 'fight')
  // the land FLEE_HP still binds under the water line
  assert.equal(threatVerdict({ name: 'zombie', dist: 2.0, hp: 7.9, inWater: true }), 'flee', 'under the land line the verdict flees regardless')
  // the swarm line still outranks the water line (14 > 12)
  assert.equal(threatVerdict({ name: 'zombie', dist: 2.0, hp: 13, attackers: 3, inWater: true }), 'flee',
    'a swarm in water flees on the swarm line')
  assert.equal(threatVerdict({ name: 'zombie', dist: 2.0, hp: 13, attackers: 2, inWater: true }), 'fight',
    'two attackers in water at 13 keep the fight (the water line owns the decision)')
  // WATER_FLEE_HP sits 4 above FLEE_HP (the measured margin)
  assert.equal(WATER_FLEE_HP - FLEE_HP, 4, 'the water margin covers one drowned trade round (~2 hp) twice over')
})

test('REGRESSION PIN: the fight loop wires the melee budget + the water lens (the v0.137.0 lanes)', async () => {
  const fs = await import('node:fs')
  const minerSrc = fs.readFileSync(new URL('../../src/bots/miner.mjs', import.meta.url), 'utf8')
  // the general melee lane asks the budgeted step with the walked ledger
  assert.ok(/meleeFightStep\(\{ dist: cur\.dist, chased: meleeChased \}\)/.test(minerSrc),
    'the non-witch close asks meleeFightStep with the live distance and the walked budget')
  assert.ok(/meleeChased \+= before\.distanceTo\(bot\.entity\.position\)/.test(minerSrc),
    'the melee budget accumulates the actual walked displacement')
  assert.ok(/melee chase ceiling held/.test(minerSrc), 'the melee hold names itself for the run logs')
  assert.ok(/let meleeChased = 0/.test(minerSrc), 'the melee budget starts at zero each episode')
  // the old unbounded moving follow is GONE from the general lane (the churn
  // it produced is the F9/F11 evidence) - the witch lane keeps its snapshot.
  // The constructor call is what counts (the comments mentioning the old churn
  // must stay - they are the evidence trail).
  const followCount = (minerSrc.match(/new goals\.GoalFollow/g) || []).length
  assert.ok(followCount === 0, 'no moving GoalFollow remains in the fight loop (the churn lanes are all snapshot closes)')
  // both verdict sites read the water lens
  assert.ok(/inWater: inWaterHere\(\)/.test(minerSrc), 'the verdicts consult the water lens')
  assert.ok(/function inWaterHere/.test(minerSrc), 'the water lens read exists')
})

// ---- (v0.140.0) THE RANGED-FIGHT COOLDOWN - run554's skeleton cascade ----
// F2's chain: hp 19.0 -> 13.0 (chase ceiling, 4 swings) -> verdict flipped to
// flee at 7.0 -> shelter skip (ring incomplete 4/8) -> dead. Every reopen
// walked the bot back into the volley; the cooldown closes the fight lane for
// the shooter while the arrow wall / the kite own the response.

test('rangedCooldownUntil: the armed window, junk now arms nothing', () => {
  assert.equal(rangedCooldownUntil({ now: 1000 }), 11000, 'the default is RANGED_COOLDOWN_MS')
  assert.equal(rangedCooldownUntil({ now: 1000, ms: 5000 }), 6000, 'the length is an independent tunable')
  assert.equal(rangedCooldownUntil({ now: 1000, ms: 0 }), 11000, 'a zero length falls back to the default')
  assert.equal(rangedCooldownUntil({ now: 1000, ms: -3 }), 11000, 'a negative length falls back to the default')
  assert.equal(rangedCooldownUntil({ now: -1 }), null, 'a negative now is junk, not an epoch')
  assert.equal(rangedCooldownUntil({ now: 'soon' }), null, 'a junk now arms nothing')
  assert.equal(rangedCooldownUntil({ now: null }), null)
  assert.equal(rangedCooldownUntil({ now: undefined }), null)
})

test('rangedCooldownLive: junk on either side reads NOT live (the lane opens)', () => {
  assert.equal(rangedCooldownLive({ now: 1000, until: 2000 }), true, 'inside the window')
  assert.equal(rangedCooldownLive({ now: 2000, until: 2000 }), false, 'the boundary opens the lane (a bot must not stay cooled forever)')
  assert.equal(rangedCooldownLive({ now: 3000, until: 2000 }), false, 'expired')
  assert.equal(rangedCooldownLive({ now: 1000, until: null }), false, 'no armed entry = no cooldown')
  assert.equal(rangedCooldownLive({ now: 1000, until: undefined }), false)
  assert.equal(rangedCooldownLive({ now: null, until: 2000 }), false, 'junk now never hides a live lane')
  assert.equal(rangedCooldownLive({ now: 'x', until: 2000 }), false)
})

test('threatVerdict cooldown: the shooter yields flee inside the window, the melee band never consults it', () => {
  const base = { hp: 18, attackers: 1, armed: true }
  assert.equal(threatVerdict({ ...base, name: 'skeleton', dist: 8 }), 'fight', 'no cooldown: the legacy verdict stands')
  assert.equal(threatVerdict({ ...base, name: 'skeleton', dist: 8, cooldown: true }), 'flee', 'live cooldown: the shooter is never chased')
  assert.equal(threatVerdict({ ...base, name: 'skeleton', dist: 12, cooldown: true }), 'flee', 'the whole ranged band yields')
  assert.equal(threatVerdict({ ...base, name: 'skeleton', dist: 12.5, cooldown: true }), 'ignore', 'beyond the band the legacy ignore stands')
  assert.equal(threatVerdict({ ...base, name: 'zombie', dist: 3, cooldown: true }), 'fight', 'MELEE threats never consult the cooldown')
  assert.equal(threatVerdict({ ...base, name: 'spider', dist: 4, dark: true, cooldown: true }), 'fight', 'a dark spider is a melee class here')
  assert.equal(threatVerdict({ ...base, name: 'skeleton', dist: 8, cooldown: 'yes' }), 'fight', 'junk cooldown reads closed (byte-for-byte legacy)')
  assert.equal(threatVerdict({ ...base, name: 'skeleton', dist: 8, cooldown: false }), 'fight')
  assert.equal(threatVerdict({ ...base, name: 'creeper', dist: 5, cooldown: true }), 'flee', 'the creeper lane fired before the cooldown lane anyway')
  assert.equal(threatVerdict({ ...base, name: 'witch', dist: 8, cooldown: true }), 'fight', 'the witch keeps her v0.115.0 contract - the melee through the splash band')
  assert.equal(threatVerdict({ name: 'skeleton', dist: 8, hp: 5, cooldown: true }), 'flee', 'a drained bar flees through the same lane (FLEE_HP) regardless')
})

test('REGRESSION PIN: the miner arms the cooldown at the melee break + both verdict sites consult it', async () => {
  const fs = await import('node:fs')
  const minerSrc = fs.readFileSync(new URL('../../src/bots/miner.mjs', import.meta.url), 'utf8')
  assert.ok(/armRangedCooldown\(cur\.entity\?\.id\)/.test(minerSrc), 'the chase-ceiling break arms the mob window')
  assert.ok(/ranged cooldown armed vs/.test(minerSrc), 'the arm names itself for the run decode')
  assert.ok((minerSrc.match(/cooldown: rangedCdLive\(/g) || []).length === 2, 'both verdict sites (the sentry consult + the per-round re-verdict) pass the lens')
  assert.ok(/RANGED_HOSTILES\.has\(cur\.name\) && cur\.name !== 'witch'/.test(minerSrc), 'the witch is excluded from the cooldown lane at the arm site')
})

// ---- (v0.169.0) THE FIGHT FINISH - run78's zero-kill wash ----
// run78 (36091731878, the v0.167.0 union @ the honest 600s): TEN fight-end
// lines, ZERO mob kills, the bot paying 4-12 hp per zombie exchange and the
// mob walking away alive at 1-3 hp. The anatomy: each swing knocks the melee
// threat back 2-3 blocks, the loop's dist gate reads the knockback as a
// fleeing target and CLOSES, the knockback pursuit burns the walked budget
// to the ceiling in 2-3 swings ('chased 7.7b, zombie @3.4'), and the
// deadline cuts the finish. The cure waits the return out, charges every
// swing FULL, and runs the melee episode to the kill.

test('cooldownTicksForWeapon: the vanilla 1.9 full-charge table (the wash damage half)', () => {
  assert.equal(cooldownTicksForWeapon('wooden_sword'), 13, 'sword attack speed 1.6 -> ceil(20/1.6)=13 ticks')
  assert.equal(cooldownTicksForWeapon('iron_sword'), 13, 'materials share the speed inside a class')
  assert.equal(cooldownTicksForWeapon('netherite_sword'), 13)
  assert.equal(cooldownTicksForWeapon('stone_pickaxe'), 17, 'pickaxe 1.2 -> ceil(20/1.2)=17 (the old 10-tick pacing landed ~51%)')
  assert.equal(cooldownTicksForWeapon('wooden_axe'), 25, 'the wooden axe floor 0.8 -> 25')
  assert.equal(cooldownTicksForWeapon('iron_shovel'), 20, 'shovel 1.0 -> 20')
  assert.equal(cooldownTicksForWeapon('stone_hoe'), 20, 'hoe 1.0 -> 20')
  assert.equal(cooldownTicksForWeapon(null), 5, 'fists: attack speed 4.0 -> 5')
  assert.equal(cooldownTicksForWeapon(undefined), 5)
  assert.equal(cooldownTicksForWeapon(''), 5, 'an empty name is no tool')
  assert.equal(cooldownTicksForWeapon('rotten_flesh'), 5, 'a non-tool reads as fists')
  assert.equal(cooldownTicksForWeapon(42), 5, 'junk type reads as fists')
  assert.equal(cooldownTicksForWeapon('Sword'), 13, 'the name read is case-insensitive')
})

test('meleeReturnPlan: the knockback return is waited out, not chased', () => {
  // the first approach is a REAL chase - nothing was knocked back yet
  assert.equal(meleeReturnPlan({ dist: 8, windows: 0, swung: false }), 'close')
  assert.equal(meleeReturnPlan({}), 'close', 'nothing swung: close')
  assert.equal(meleeReturnPlan({ dist: 4, swung: false }), 'close')
  // the knockback return: hold the ground one window
  assert.equal(meleeReturnPlan({ dist: 4.5, windows: 0, swung: true }), 'wait', 'a swung-out zombie at 4.5 is walking home')
  assert.equal(meleeReturnPlan({ dist: 3.3, windows: 1, swung: true }), 'wait', 'one block out and closing: one more window')
  // the windows cap: the mob is NOT coming back (kiting/stuck) - chase it
  assert.equal(meleeReturnPlan({ dist: 5.0, windows: 2, swung: true }), 'close', 'two silent windows: the return ladder is spent')
  assert.equal(meleeReturnPlan({ dist: 9, windows: 5, swung: true }), 'close')
  // junk battery
  assert.equal(meleeReturnPlan({ dist: NaN, swung: true }), 'close', 'an unreadable distance closes (the legacy verdict)')
  assert.equal(meleeReturnPlan({ dist: undefined, windows: 0, swung: true }), 'close')
  assert.equal(meleeReturnPlan({ dist: -2, swung: true }), 'close', 'a negative distance is junk, not a reading')
  assert.equal(meleeReturnPlan({ dist: Infinity, swung: true }), 'close', 'an infinite distance is junk here')
  assert.equal(meleeReturnPlan({ dist: 4, windows: NaN, swung: true }), 'wait', 'junk windows read as unspent')
  assert.equal(meleeReturnPlan({ dist: 4, windows: null, swung: true }), 'wait')
  assert.equal(meleeReturnPlan({ dist: 4, windows: -1, swung: true }), 'wait', 'a negative window count is junk, not debt')
  // the doctrine pins (the constants the field decode reads)
  assert.equal(MELEE_REACH, 3.2, 'pinned: the fight loop\'s close gate (the byte-identical threshold)')
  assert.equal(MELEE_RETURN_WAIT_TICKS, 20, 'pinned: one return window = 1s (the knocked zombie covers 2-3b in it)')
  assert.equal(MELEE_RETURN_WINDOWS, 2, 'pinned: at most 2 windows per knockback (2s, then the close ladder)')
  assert.equal(FIGHT_DEADLINE_MS, 16000, 'pinned: the melee episode runs to the kill (5-7 full-charge cycles)')
})

test('REGRESSION PIN: the fight loop wires the finish (v0.169.0)', async () => {
  const fs = await import('node:fs')
  const minerSrc = fs.readFileSync(new URL('../../src/bots/miner.mjs', import.meta.url), 'utf8')
  assert.ok(/meleeReturnPlan\(\{ dist: cur\.dist, windows: meleeReturnWindows, swung: swings > 0 \}\)/.test(minerSrc),
    'the stand-ground asks the return plan with the live distance and the knockback ledger')
  assert.ok(/mob down/.test(minerSrc), 'the kill exit names itself for the run decode')
  assert.ok(/stats\.kills\+\+/.test(minerSrc), 'the kill is counted in the stats')
  assert.ok(/kills: 0/.test(minerSrc), 'the stats carry the kill ledger from zero')
  assert.ok(/cooldownTicksForWeapon\(weapon\?\.name\)/.test(minerSrc), 'the swing cadence charges full by the equipped weapon')
  assert.ok(/meleeReturnWindows = 0 \/\/ \(v0\.169\.0\) a fresh swing starts a fresh knockback ledger/.test(minerSrc),
    'every swing resets the knockback ledger (a fresh swing starts a fresh return)')
  assert.ok(/threat\.name === 'witch' \? 10000 : FIGHT_DEADLINE_MS/.test(minerSrc),
    'the melee deadline is the named constant; the witch keeps her 10s drain contract')
  assert.ok(/Number\.isFinite\(lastTargetId\) && !bot\.entities\.has\(lastTargetId\)/.test(minerSrc),
    'the kill ledger reads the entity map (the removal IS the death)')
  const fleetSrc = fs.readFileSync(new URL('../../testbed/fleet19.mjs', import.meta.url), 'utf8')
  assert.ok(/kills=\$\{list\.reduce/.test(fleetSrc), 'the fleet report carries the kill ledger')
})
