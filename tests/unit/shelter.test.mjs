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
  RING_BLOCKS_NEEDED, RING_SIDE_NORMALS, RING_PLACE_ROUNDS, RING_RETRY_TICKS,
  RING_DIG_EARN_OK, RING_EARN_MAX_DIGS,
  shelterDue, pickSealItem, pickJunkToDrop, earnSealDue,
  ringCellClass, ringSideBuildable, ringFeasible, ringBlocksNeeded,
  ringSideOrder, countSealBlocks, emptySlotCount, ringDigEarnSupply
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
  assert.equal(pickSealItem([{ name: 'oak_log', count: 4 }, { name: 'cobblestone', count: 10 }]).name, 'cobblestone', 'stone family outranks the bootstrap stock')
  // (v0.58.0) PIN FLIPPED BY RUN57's EVIDENCE: the old pin said a logs+planks
  // pocket yields null ('an open hole is a death trap') - fleet 35652259509
  // measured the reverse: F3 (oak_log:12+oak_planks:8) died to a 5-zombie
  // horde and F14 (oak_log:8+oak_planks:7) to a zombie pair, both after
  // 'shelter skip (no seal material, nothing expendable to drop)'. The
  // bootstrap pocket IS the death trap now; planks rank before logs (a plank
  // is a quarter log of craft stock), sticks stay protected.
  assert.equal(pickSealItem([{ name: 'oak_log', count: 4 }, { name: 'oak_planks', count: 12 }, { name: 'stick', count: 8 }]).name, 'oak_planks', 'the run57 bootstrap pocket seals (planks first)')
  assert.equal(pickSealItem([{ name: 'oak_log', count: 12 }]).name, 'oak_log', 'a logs-only pocket seals with a log (F3\'s exact pocket)')
  assert.equal(pickSealItem([{ name: 'birch_log', count: 2 }, { name: 'stick', count: 8 }]).name, 'birch_log', 'birch seals too')
  assert.equal(pickSealItem([{ name: 'stick', count: 8 }]), null, 'sticks alone stay protected (nothing built from a shelter made of sticks)')
  assert.equal(pickSealItem([{ name: 'dirt', count: 1 }]).name, 'dirt')
  assert.equal(pickSealItem([{ name: 'grass_block', count: 2 }]).name, 'grass_block', 'grass block is dirt family')
  assert.equal(pickSealItem([{ name: 'stone', count: 5 }]).name, 'stone', 'smelted stone seals too')
  assert.equal(pickSealItem([{ name: 'oak_planks', count: 2 }, { name: 'dirt', count: 9 }]).name, 'dirt', 'planks rank AFTER the dirt/stone families - dirt is spent first')
})

test('pickJunkToDrop: leaf_litter leads (v0.58.0), craft stock never drops', () => {
  assert.equal(pickJunkToDrop([{ name: 'leaf_litter', count: 5 }, { name: 'rotten_flesh', count: 2 }]).name, 'leaf_litter', 'pure clutter drops before mob loot')
  assert.equal(pickJunkToDrop([{ name: 'oak_planks', count: 8 }, { name: 'oak_sapling', count: 2 }]), null, 'saplings and planks are protected - the earn path stays honest')
  assert.equal(pickJunkToDrop([{ name: 'stick', count: 6 }]), null)
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
  // (v0.58.0) PIN FLIPPED BY RUN57's EVIDENCE: the old pin excluded every
  // *_log/*_planks from SEAL_PRIORITY 'by construction' - run57 measured that
  // construction killing two bots (F3 oak_log:12+planks:8, F14 oak_log:8+
  // planks:7, both 'shelter skip (no seal material)' then dead). The bootstrap
  // pocket now seals; planks still rank AFTER logs' own stone-family elders,
  // sticks stay excluded (nothing is built from sticks), and dirt still leads.
  assert.ok(!SEAL_PRIORITY.includes('stick'), 'sticks stay excluded (nothing is built from a wall of sticks)')
  assert.ok(SEAL_PRIORITY.includes('oak_planks') && SEAL_PRIORITY.includes('oak_log'), 'the run57 bootstrap pocket is seal material now')
  assert.ok(SEAL_PRIORITY.indexOf('oak_planks') > SEAL_PRIORITY.indexOf('stone'), 'planks rank after the stone family - craft stock is spent last')
  assert.ok(SEAL_PRIORITY.indexOf('oak_log') > SEAL_PRIORITY.indexOf('oak_planks'), 'a log is a quarter of craft value more than a plank - planks first')
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

// ---- v0.59.0: THE OPEN-FIELD RING (variant 3) ----
// Fleet 35657683920 (run58, v0.58.1, NORMAL END 19/19) measured SIX 'shelter
// try' lines that fell through the wall variant SILENTLY and fled: F1
// zombie@5.6, F1 drowned@1.3 (dead 6 log lines later), F17 zombie@2.4, F5
// zombie@1.9, F17 zombie@3.5, F15 drowned@6.5 - ALL open terrain, while the
// surviving pockets read cobblestone:29+dirt:4, cobblestone:106+granite:14,
// cobblestone:102. The seal stock was THERE; the terrain had no wall to dig
// into. The cure builds the 2-high ring instead: ground-below as the foot
// reference, the fresh foot block as the head reference, all four sides
// closable BEFORE the first placement, away-from-threat first.
test('ringCellClass: three states, junk reads as blocked', () => {
  assert.equal(ringCellClass('empty'), 'empty')
  assert.equal(ringCellClass('solid'), 'solid')
  assert.equal(ringCellClass('blocked'), 'blocked')
  assert.equal(ringCellClass(undefined), 'blocked', 'an unreadable cell never gets built on')
  assert.equal(ringCellClass('air'), 'blocked', 'unknown strings are blocked')
  assert.equal(ringCellClass(''), 'blocked')
})

test('ringSideBuildable: flat open ground closes, cliffs and mobs do not', () => {
  assert.equal(ringSideBuildable({ foot: 'empty', head: 'empty', groundSolid: true }), true, 'the open-field side: ground below, two air cells')
  assert.equal(ringSideBuildable({ foot: 'empty', head: 'empty', groundSolid: false }), false, 'a cliff side has no foot reference - never buildable')
  assert.equal(ringSideBuildable({ foot: 'solid', head: 'solid', groundSolid: false }), true, 'a pre-walled side is already done')
  assert.equal(ringSideBuildable({ foot: 'solid', head: 'empty', groundSolid: false }), true, 'a solid foot block IS the head reference')
  assert.equal(ringSideBuildable({ foot: 'empty', head: 'solid', groundSolid: true }), true, 'a head block with air under it still closes (the foot fills first)')
  assert.equal(ringSideBuildable({ foot: 'blocked', head: 'empty', groundSolid: true }), false, 'a mob in the foot cell rejects the placement')
  assert.equal(ringSideBuildable({ foot: 'empty', head: 'blocked', groundSolid: true }), false, 'a mob in the head cell rejects the placement')
  assert.equal(ringSideBuildable({}), false, 'junk side reads as not buildable')
  assert.equal(ringSideBuildable({ foot: 'empty', head: 'empty', groundSolid: 'yes' }), false, 'ground junk is not solid ground')
})

test('ringFeasible: ALL four sides must close - one gap is a door', () => {
  const open = () => ({ foot: 'empty', head: 'empty', groundSolid: true })
  assert.equal(ringFeasible([open(), open(), open(), open()]), true, 'the run58 open field: flat ground all around is closable')
  assert.equal(ringFeasible([open(), open(), open(), { foot: 'empty', head: 'empty', groundSolid: false }]), false, 'one cliff side = one walk-in door = never start the build')
  assert.equal(ringFeasible([open(), open(), open(), { foot: 'blocked', head: 'empty', groundSolid: true }]), false, 'one mob-occupied side blocks the whole ring')
  assert.equal(ringFeasible([open(), open(), open()]), false, 'three sides is not a ring')
  assert.equal(ringFeasible(null), false, 'junk world reads as not feasible')
  assert.equal(ringFeasible('flat'), false, 'string junk reads as not feasible')
})

test('ringBlocksNeeded: pre-walled cells are free, junk costs the full ring', () => {
  const open = { foot: 'empty', head: 'empty', groundSolid: true }
  assert.equal(ringBlocksNeeded([open, open, open, open]), 8, 'a flat open field costs all 8')
  assert.equal(ringBlocksNeeded([{ foot: 'solid', head: 'solid' }, open, open, open]), 6, 'one pre-walled side saves 2')
  assert.equal(ringBlocksNeeded(null), 8, 'junk sides read as the full cost')
  assert.equal(RING_BLOCKS_NEEDED, 8, 'the constant pins the full ring cost')
})

test('ringSideOrder: the threat side builds last, junk bearing keeps canonical', () => {
  // score = normal . bearing, ascending: the sides pointing AWAY from the
  // threat (most negative score) build first, the side the threat stands on
  // builds last; index order breaks score ties.
  assert.deepEqual(ringSideOrder({ threatDx: 5, threatDz: 0 }), [1, 2, 3, 0], 'threat east: -x first, +x last')
  assert.deepEqual(ringSideOrder({ threatDx: -5, threatDz: 0 }), [0, 2, 3, 1], 'threat west: +x first, -x last')
  assert.deepEqual(ringSideOrder({ threatDx: 0, threatDz: 5 }), [3, 0, 1, 2], 'threat at +z: -z first, +z last')
  assert.deepEqual(ringSideOrder({ threatDx: 0, threatDz: -5 }), [2, 0, 1, 3], 'threat at -z: +z first, -z last')
  assert.deepEqual(ringSideOrder({ threatDx: 3, threatDz: 3 }), [1, 3, 0, 2], 'diagonal threat: both opposed sides first (index tie order)')
  assert.deepEqual(ringSideOrder({}), [0, 1, 2, 3], 'zero bearing keeps the canonical +x,-x,+z,-z order')
  assert.deepEqual(ringSideOrder({ threatDx: NaN, threatDz: undefined }), [0, 1, 2, 3], 'junk bearing is a zero bearing')
  assert.equal(RING_SIDE_NORMALS.length, 4, 'four lateral sides')
})

test('countSealBlocks: the run58 survivor pockets can all build a ring', () => {
  // F2's measured pocket: cobblestone:29 birch_log:8 dirt:4 -> 41
  assert.equal(countSealBlocks([{ name: 'cobblestone', count: 29 }, { name: 'birch_log', count: 8 }, { name: 'dirt', count: 4 }]), 41, 'F2 closes a ring twice over')
  // F6's measured pocket: cobblestone:106 granite:14 diorite:14 -> all stone family
  assert.equal(countSealBlocks([{ name: 'cobblestone', count: 106 }, { name: 'granite', count: 14 }, { name: 'diorite', count: 14 }]), 134, 'F6 is a walking wall')
  // F17's measured pocket: stick:2 oak_planks:2 smooth_stone:1 -> planks only (2)
  assert.equal(countSealBlocks([{ name: 'stick', count: 2 }, { name: 'oak_planks', count: 2 }, { name: 'smooth_stone', count: 1 }]), 2, 'sticks and smooth stone are not seal stock')
  assert.equal(countSealBlocks([{ name: 'stone_pickaxe', count: 1 }, { name: 'bread', count: 6 }]), 0, 'a tool-only pocket builds nothing')
  assert.equal(countSealBlocks(null), 0)
  assert.equal(countSealBlocks([]), 0)
  assert.equal(countSealBlocks([42, { name: 7 }]), 0, 'junk items count as nothing')
})

test('REGRESSION PIN (run58 F1): open field + rich pocket must be ring-feasible', () => {
  // F1 died to a drowned@0.7 six log lines after 'shelter try vs drowned
  // (dist 1.3)' fell through the wall variant silently. The same bot carried
  // cobblestone+dirt earlier in the run. The cure must accept EXACTLY this
  // world: flat open ground, all cells air, a full stock, threat anywhere.
  const f1Pocket = [{ name: 'cobblestone', count: 29 }, { name: 'dirt', count: 4 }, { name: 'birch_log', count: 8 }]
  const openField = () => ({ foot: 'empty', head: 'empty', groundSolid: true })
  assert.equal(countSealBlocks(f1Pocket) >= RING_BLOCKS_NEEDED, true, 'the stock gate passes')
  assert.equal(ringFeasible([openField(), openField(), openField(), openField()]), true, 'the world gate passes - the ring builds where no wall exists')
  assert.equal(ringSideBuildable(openField()), true, 'every side closes')
})

// ---- v0.68.0: THE PRE-FIGHT SHELTER + THE DIG-EARN BYPASS + RING PATIENCE ----
// run64 (dispatch 35682136264) mined 34 shelter lines: 12x 'no seal material,
// nothing expendable to drop' (the biggest slice), ring incomplete 0/8 + 2/8
// + 2/8 at zombie 0.6-2.5, ring not buildable [xo] + [.. -o], and exactly ONE
// success (F10: the wall variant sheltered from a zombie at 1.3 - proof the
// close race is winnable by the FAST variant only).

test('emptySlotCount: the dig-earn bypass counts FREE cells, junk-safe', () => {
  // the measured F17-class pocket: tools + food, 13+ free slots, no junk
  const slots = new Array(36).fill(null)
  slots[0] = { name: 'stone_pickaxe' }
  slots[1] = { name: 'bread', count: 6 }
  assert.equal(emptySlotCount(slots), 34, '34 free cells - the dig drop has somewhere to land')
  const full = Array.from({ length: 36 }, (_, i) => ({ name: `block${i}` }))
  assert.equal(emptySlotCount(full), 0, 'a full pocket earns the OLD way (toss) or not at all')
  assert.equal(emptySlotCount([null, undefined, { name: 'x' }, null]), 3, 'null and undefined both read empty')
  assert.equal(emptySlotCount(null), 0, 'junk -> 0: never dig-earn on a guess')
  assert.equal(emptySlotCount('nope'), 0, 'junk -> 0')
  assert.equal(emptySlotCount([]), 0, 'an empty ARRAY is not free slots - it is no information')
})

test('REGRESSION PIN (run64 F12): the pre-fight window was shelter-due all along', () => {
  // F12 met the zombie at dist 1.6 with hp 17.0 and the FIGHT verdict swung
  // first (tryShelter was never consulted); 4 seconds later the re-verdict
  // sheltered at hp 5 - too late for every variant. The policy matrix ALREADY
  // answered the first moment: melee-naked + night + threat in reach = shelter.
  assert.equal(shelterDue({ night: true, armed: false, threatDist: 1.6 }), true, 'the first-sight moment was due')
  assert.equal(shelterDue({ night: true, armed: false, threatDist: 4.4 }), true, 'F11-class: the ring had 4.4 blocks of room, not 0.6')
  assert.equal(shelterDue({ night: true, armed: false, threatDist: 0.6 }), true, 'even 0.6 is due - nothing else wins there either')
  // the armed bot keeps the v0.67.0 deal: the sword fight is the winner
  assert.equal(shelterDue({ night: true, armed: true, threatDist: 1.6 }), false, 'armed fights, it does not seal')
})

test('ring patience constants: the sealWaitUnseal pacing, pinned', () => {
  // run64 measured the single 4-tick retry losing to a mob grazing the build
  // zone ('ring incomplete 0/8..2/8' x3); sealWaitUnseal has always used
  // 2 rounds x 6 ticks and it SHELTERED (run63 shelters=3). The ring now
  // inherits exactly that patience.
  assert.equal(RING_PLACE_ROUNDS, 2, 'two rounds per cell, like the seal')
  assert.equal(RING_RETRY_TICKS, 6, '6 ticks between rounds, like the seal')
  assert.ok(RING_RETRY_TICKS > 4, 'strictly more patient than the old single retry')
})

// ---- v0.91.0: THE HONEST RING STOCK + THE RING DIG-EARN ----
// run80 (v0.88.0 fleet) mined the biggest single shelter refusal:
// 'need 8 wall blocks, have 4' - and shelters=0 ALL RUN while mob deaths
// became the majority class (zombie x2 + skeleton x2 of 6). Two defects:
// the gate compared stock to the WORST-CASE constant 8 before the terrain
// was read (the build only spends ringBlocksNeeded - every natural solid
// cell is a free cell), and the ring had no dig-earn (the wall variant has
// had one since v0.50.0).

test('REGRESSION PIN (run80): the honest gate passes the measured refusal shape', () => {
  // the exact measured line: 'need 8 wall blocks, have 4'. The same bot next
  // to terrain that already supplies two full sides (a boulder, a house wall)
  // needs only 4 placements - the old gate refused on the constant, the
  // honest gate lets the build start.
  const have4 = [{ name: 'dirt', count: 4 }]
  const halfWalled = [
    { foot: 'solid', head: 'solid' },
    { foot: 'solid', head: 'solid' },
    { foot: 'empty', head: 'empty', groundSolid: true },
    { foot: 'empty', head: 'empty', groundSolid: true }
  ]
  const needed = ringBlocksNeeded(halfWalled)
  assert.equal(needed, 4, 'two pre-walled sides leave exactly 4 placements')
  assert.equal(countSealBlocks(have4) >= needed, true, 'the measured 4-block pocket SEALS this ring - the old gate refused it')
  // and the old worst-case shape for contrast: the constant stays 8
  assert.equal(RING_BLOCKS_NEEDED, 8, 'the worst case is still the worst case - it is just no longer the gate')
})

test('ringDigEarnSupply: the measured deficit is earnable, bounded and junk-safe', () => {
  const dirt4 = ['dirt', 'dirt', 'grass_block', 'stone']
  assert.equal(ringDigEarnSupply({ stock: 4, needed: 8, diggableGrounds: dirt4 }), 4, 'the measured shape: have 4, need 8, four diggable grounds -> 4 digs')
  assert.equal(ringDigEarnSupply({ stock: 6, needed: 8, diggableGrounds: dirt4 }), 2, 'bounded by the deficit, not by the grounds')
  assert.equal(ringDigEarnSupply({ stock: 0, needed: 8, diggableGrounds: Array(8).fill('dirt') }), RING_EARN_MAX_DIGS, 'capped by RING_EARN_MAX_DIGS - an earn beyond 4 digs loses the race on any terrain')
  assert.equal(ringDigEarnSupply({ stock: 8, needed: 8, diggableGrounds: dirt4 }), 0, 'no deficit, no earn')
  assert.equal(ringDigEarnSupply({ stock: 9, needed: 8, diggableGrounds: dirt4 }), 0, 'surplus stock earns nothing')
})

test('ringDigEarnSupply: only grounds whose DROP is seal material earn', () => {
  assert.equal(ringDigEarnSupply({ stock: 4, needed: 8, diggableGrounds: ['sand', 'gravel', 'oak_log'] }), 0, 'gravity columns and trunks never earn - the measured shelter walls never dig those')
  assert.equal(ringDigEarnSupply({ stock: 4, needed: 8, diggableGrounds: [null, undefined, 42, 'dirt', '', 'stone'] }), 2, 'junk entries are skipped, real grounds still count')
  assert.equal(ringDigEarnSupply({ stock: 4, needed: 8, diggableGrounds: 'dirt' }), 0, 'a bare string is not a grounds list')
  assert.equal(ringDigEarnSupply({ stock: 4, needed: 8 }), 0, 'no grounds array -> no earn (never dig on a guess)')
})

test('ringDigEarnSupply: junk stock and junk need read as zero', () => {
  assert.equal(ringDigEarnSupply({}), 0, 'nothing set -> nothing earned')
  assert.equal(ringDigEarnSupply({ stock: NaN, needed: 8, diggableGrounds: ['dirt'] }), 0, 'NaN stock is no stock')
  assert.equal(ringDigEarnSupply({ stock: -3, needed: 8, diggableGrounds: ['dirt'] }), 0, 'negative stock is no stock')
  assert.equal(ringDigEarnSupply({ stock: 4, needed: NaN, diggableGrounds: ['dirt'] }), 0, 'junk need -> no earn')
  assert.equal(ringDigEarnSupply({ stock: 4, needed: 0, diggableGrounds: ['dirt'] }), 0, 'a zero need has no deficit')
  assert.equal(ringDigEarnSupply(null), 0, 'null input -> zero')
  assert.equal(ringDigEarnSupply({ stock: 4.9, needed: 8, diggableGrounds: ['dirt', 'dirt', 'dirt', 'dirt'] }), 4, 'fractional stock floors (4.9 held blocks is 4 whole ones)')
})

test('RING_DIG_EARN_OK / RING_EARN_MAX_DIGS: the policy surfaces, pinned', () => {
  assert.equal(RING_DIG_EARN_OK.has('grass_block'), true, 'grass drops dirt - the priority seal')
  assert.equal(RING_DIG_EARN_OK.has('stone'), true, 'stone drops cobblestone - a pickaxe holder digs it in ~1.2s')
  assert.equal(RING_DIG_EARN_OK.has('cobbled_deepslate'), true, 'deepslate grounds earn their cobble')
  assert.equal(RING_DIG_EARN_OK.has('sand'), false, 'gravity columns stay out')
  assert.equal(RING_DIG_EARN_OK.has('gravel'), false, 'gravel stays out')
  assert.equal(RING_DIG_EARN_OK.has('oak_log'), false, 'trunks stay out')
  for (const name of RING_DIG_EARN_OK) {
    assert.equal(SEAL_PRIORITY.includes(name === 'grass_block' || name === 'podzol' ? 'dirt' : name === 'stone' ? 'cobblestone' : name === 'deepslate' ? 'cobbled_deepslate' : name), true, `${name}'s dig drop is SEAL_PRIORITY material`)
  }
  assert.equal(RING_EARN_MAX_DIGS, 4, 'the measured deficit class + the race arithmetic: 4 fist digs ~3s vs a zombie at the 8-block earn edge ~3.2s')
})
