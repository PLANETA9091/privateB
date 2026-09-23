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
  effectiveHp, isPoisoned, POISON_HP_BUDGET, POISON_EFFECT_ID
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
