// Shelter policy (pure, unit-testable - no bot, no server).
//
// The worklog's surviving candidate: "night SHELTER for naked bootstrap bots -
// dig-in-and-seal when mobs close in (the 7-death streak remains unhandled)".
// The measured facts behind it:
// - naked bots at night lose every chase: a fleeing bot outwalks nothing, zombies
//   chase across the whole surface, and a dead bot loses the whole inventory;
// - the v0.11.0 multi-hop flee helps ARMED bots; a FIST bot cannot win the
//   following fight either (fists 1-2 dmg vs 20 zombie hp, measured live
//   17 hp -> 4.3 hp with the zombie still alive);
// - a sealed 1-deep hole is unbeatable by vanilla surface mobs: zombies path to
//   the entrance and swing at dirt forever. The bot walks out after they give up
//   or after the cap - the nightsafety walk gate keeps the surface walks gated
//   anyway, so a sheltered wait is almost never wasted time.
//
// Policy pinned here (the mechanics live in miner.mjs tryShelter):
// - SHELTER only for UNARMED bots AT NIGHT with a threat within 12 blocks.
//   Armed bots fight or flee; a daylight bot walks away in the open.
// - NO seal material -> NO shelter: an open hole is a death trap (mobs path
//   into it), so without a block to seal with we fall back to the flee.
// - Seal material priority: dirt-family first (worthless for crafting), then
//   common stone-family; logs/planks/saplings/sticks are NEVER spent - the
//   bootstrap needs every log and plank it owns.

/** How long the bot stays sealed per wait round (ms) before re-checking threats. */
export const SHELTER_ROUND_MS = 2000
/** Hard cap on a whole shelter episode (ms) - then unseal regardless. */
export const SHELTER_MAX_MS = 60000
/** Hostiles within this distance keep the bot sealed. */
export const SHELTER_SAFE_DIST = 8

// ---- v0.50.0: EARN-THE-SEAL (the inventory-full-of-ore class) ----
// Fleet 35619512737 (v0.48.1) measured 10x 'shelter skip (no seal material)'
// (F18 x7, F3/F13/F17) - a full-pocket miner cannot PICK UP the cobble its own
// digs drop, so it holds nothing sealable while the threat closes in; F3 then
// died to a skeleton flee-chase at no-seal (hp 4.0). One freed slot is enough:
// the shelter wall dug below respawns its block as a drop INSIDE vanilla pickup
// range (~1.5 blocks), the freed slot swallows it, and the seal finds the block
// in the inventory.
//
// The earn's ONLY extra cost over a normal shelter dig-in is one toss (~0.3 s):
// the wall dig + step-in are the shelter's own steps. A mob at ~2.5 b/s closes
// 8 blocks in ~3.2 s - the toss + dig window fits; beyond that means RUN.
export const EARN_SEAL_MAX_THREAT_DIST = 8

/** Drop-for-a-slot priority: true junk first, then the cheapest stacked loot.
 * NEVER dropped: any tool or weapon (pickaxes, swords, axes, shovels, hoes),
 * food the fleet cooks or eats (bread, cooked meats, apples), bootstrap stock
 * (logs, planks, sticks), and the high-value plan items (diamond, emerald).
 * (v0.58.0) leaf_litter leads: run57's pockets held it on F2/F4/F5 while those
 * same bots skipped or died - pure ground clutter in this fleet's plan (nothing
 * plants, crafts or smelts it), the cheapest slot-freer there is. */
export const JUNK_DROP_PRIORITY = [
  'leaf_litter',
  'rotten_flesh', 'spider_eye', 'bone', 'wheat_seeds', 'seeds',
  'gravel', 'sand', 'flint',
  'redstone', 'coal', 'lapis_lazuli',
  'raw_copper', 'raw_iron', 'raw_gold'
]

/** The cheapest held item worth trading for one inventory slot, or null when
 * the bot carries nothing expendable (a tool-only pocket stays whole - a dead
 * naked bot loses EVERYTHING, one dropped coal is the cheaper loss).
 * @param {Array<{name?:string, count?:number}>|null|undefined} items */
export function pickJunkToDrop (items) {
  if (!Array.isArray(items)) return null
  const held = new Map()
  for (const item of items) {
    if (!item || typeof item.name !== 'string') continue
    const n = Number.isFinite(item.count) && item.count > 0 ? item.count : 1
    held.set(item.name, (held.get(item.name) ?? 0) + n)
  }
  for (const name of JUNK_DROP_PRIORITY) {
    if ((held.get(name) ?? 0) > 0) return { name, count: held.get(name) }
  }
  return null
}

/** Is the threat far enough that the earn attempt fits before contact?
 * @param {object} p
 * @param {number} [p.threatDist] metres to the nearest hostile (junk -> false) */
export function earnSealDue ({ threatDist = Infinity } = {}) {
  return Number.isFinite(threatDist) && threatDist > 0 && threatDist <= EARN_SEAL_MAX_THREAT_DIST
}

// Blocks worth digging INTO (shelter walls): never a gravity column (the smelt
// test measured a sand stratum refilling carved cells in <1 s), never fluid,
// never undiggable.
export const SHELTER_WALL_OK = new Set([
  'dirt', 'grass_block', 'coarse_dirt', 'podzol', 'rooted_dirt', 'mud',
  'stone', 'cobblestone', 'andesite', 'diorite', 'granite', 'tuff',
  'cobbled_deepslate', 'deepslate', 'oak_log', 'birch_log', 'spruce_log'
])

// Seal material priority (first held item wins). Dirt family before stone:
// dirt is worthless to the bootstrap, cobblestone feeds the furnace chain.
// (v0.58.0) THE BOOTSTRAP POCKET JOINS THE SEAL: fleet 35652259509 (run57,
// NORMAL END, 19/19 alive) measured F3 dying to a 5-zombie horde and F14 to a
// zombie pair with 'shelter skip (no seal material, nothing expendable to
// drop)' while their pockets read F3=oak_log:12+oak_planks:8 and F14=oak_log:8
// +oak_planks:7 - the freshly re-bootstrapped miner (drowning respawn ->
// gatherWood -> walk out) carries ONLY logs and planks until its first dig,
// and a horde that finds it in that window hits a pocket the seal refused.
// Logs are ALREADY accepted shelter-wall material (SHELTER_WALL_OK) and the
// seal uses the same placement machinery, so a plank/log block seals exactly
// like dirt; they rank LAST (after the stone family) because per-unit value
// (a plank = a quarter log of craft stock) still beats dying - the module's
// own rule since v0.48.1: a dead naked bot loses EVERYTHING.
export const SEAL_PRIORITY = [
  'dirt', 'grass_block', 'coarse_dirt', 'podzol', 'rooted_dirt', 'mud',
  'cobblestone', 'cobbled_deepslate', 'andesite', 'diorite', 'granite', 'tuff', 'stone',
  'oak_planks', 'birch_planks', 'spruce_planks', 'oak_log', 'birch_log', 'spruce_log'
]

/**
 * Should the bot dig in and seal instead of fleeing? The measured death
 * patterns get the shelter: a NAKED (melee-naked) bot with a threat close
 * enough to matter. Two classes:
 * - NIGHT: any threat within 12 (the surface mob class - zombies chase across
 *   the whole surface, the chase is lost before it starts);
 * - (v0.47.1) DAY, ENGAGED: fleet 35605960761 measured F7/F10 dying in
 *   daylight to a zombie at 1.8 blocks - 'shelter skip (night=false
 *   armed=true threat=zombie@1.8)' then dead. A chewing zombie at <= 3.5
 *   blocks is a lost fight for a tool-armed bot AND a lost chase (same speed,
 *   already in swing range); the dig-in beats both. Daylight mobs beyond
 *   contact keep walking past - no shelter for shadows.
 * @param {object} p
 * @param {boolean} [p.night] night by the vanilla clock (junk -> false)
 * @param {boolean} [p.armed] does the bot hold a REAL melee weapon (sword/axe)?
 *   (junk -> true: shelter is for the melee-naked)
 * @param {number} [p.threatDist] metres to the nearest hostile (junk -> far)
 */
export const DAY_ENGAGE_DIST = 3.5

export function shelterDue ({ night = false, armed = true, threatDist = Infinity } = {}) {
  if (armed !== false) return false
  if (!Number.isFinite(threatDist) || threatDist > 12) return false
  if (night === true) return true
  if (threatDist <= DAY_ENGAGE_DIST) return true
  return false
}

/**
 * First sealable item from an inventory item list, by SEAL_PRIORITY. Returns
 * null when nothing safe is held (the caller then refuses to shelter).
 * @param {Array<{name?:string, count?:number}>|null|undefined} items
 */
export function pickSealItem (items) {
  if (!Array.isArray(items)) return null
  const held = new Map()
  for (const item of items) {
    if (!item || typeof item.name !== 'string') continue
    const n = Number.isFinite(item.count) && item.count > 0 ? item.count : 1
    held.set(item.name, (held.get(item.name) ?? 0) + n)
  }
  for (const name of SEAL_PRIORITY) {
    if ((held.get(name) ?? 0) > 0) return { name, count: held.get(name) }
  }
  return null
}

// ---- v0.59.0: THE OPEN-FIELD RING (variant 3) ----
// Fleet 35657683920 (run58, v0.58.1, NORMAL END 19/19) measured SIX 'shelter
// try' lines that all fell through the wall variant SILENTLY (the loop found
// no diggable wall and the function returned false without a word) and then
// fled: F1 zombie@5.6, F1 drowned@1.3 (died 6 log lines later), F17 zombie@2.4,
// F5 zombie@1.9, F17 zombie@3.5, F15 drowned@6.5. ALL open terrain - and the
// survivors' pockets read cobblestone:29+dirt:4, cobblestone:106+granite:14,
// cobblestone:102 ... the seal material was THERE, the terrain just had no
// wall to dig into. The PIT variant stays removed (v0.48.0 measured the seal
// placement impossible in open field), but the same placement machinery works
// in the OTHER direction: instead of digging a hole, BUILD a 2-high ring of
// blocks in the four lateral cells around the bot's own cell. Every placement
// has a solid face-neighbour in open field - the ground below the foot cell
// (face up), then the fresh foot block below the head cell (face up). A
// complete 2-high ring cannot be walked into by vanilla surface mobs: a
// zombie jumps 1, not 2; creepers cannot reach the bot to detonate; melee
// drowned beach on the wall. The bot then waits the same SHELTER_MAX_MS /
// SHELTER_SAFE_DIST round the dig-in wait uses, and digs ONE column open to
// walk out.
// Policy pinned here (the mechanics live in miner.mjs tryRingShelter):
// - the ring is the FALLBACK after the wall dig-in finds no wall (digging is
//   faster than building - 2 digs + 1 placement vs 8 placements);
// - ALL four sides must be buildable before the first placement: a single
//   gap is a walk-in door (a zombie jumps the 1-high foot block and drops
//   in), and a mob standing in a target cell rejects the placement;
// - the build order runs the sides pointing AWAY from the threat first, so
//   the last (risky) placements happen on the side the mob reaches last;
// - an incomplete ring never waits - the bot flees and the half-ring still
//   slows the chase.

/** Cells per ring side: one at foot level, one at head level. */
export const RING_CELLS_PER_SIDE = 2
/** A full ring: 4 lateral sides x (foot + head). */
export const RING_BLOCKS_NEEDED = 8
/** The four lateral sides in canonical order: +x, -x, +z, -z. */
export const RING_SIDE_NORMALS = [
  { dx: 1, dz: 0 }, { dx: -1, dz: 0 }, { dx: 0, dz: 1 }, { dx: 0, dz: -1 }
]

/**
 * Normalize one observed cell to the three-state class the ring planner
 * works with: 'empty' (air - a placement can fill it), 'solid' (a block is
 * already there - the cell is done), 'blocked' (an entity occupies it, or the
 * world read failed - placements into entity-occupied cells are rejected by
 * the server and an unreadable cell must never be built on).
 * @param {string} [cls] 'empty' | 'solid' | 'blocked' (junk -> 'blocked')
 */
export function ringCellClass (cls) {
  return cls === 'empty' || cls === 'solid' ? cls : 'blocked'
}

/**
 * Can one lateral SIDE be closed into a 2-high column? The side reads:
 * - foot/head: the ringCellClass of the two stacked cells next to the bot;
 * - groundSolid: is the block under the foot cell solid (the placement
 *   reference for the foot block in open field - without it the foot cell
 *   has no face to place against)?
 * The foot part needs a block or a placement reference; the head part needs
 * a block or emptiness (the fresh foot block becomes the head's reference -
 * it only exists when the foot part can be made solid first).
 * @param {object} [side]
 * @param {string} [side.foot] 'empty' | 'solid' | 'blocked'
 * @param {string} [side.head] 'empty' | 'solid' | 'blocked'
 * @param {boolean} [side.groundSolid] solid ground under the foot cell
 */
export function ringSideBuildable (side = {}) {
  const foot = ringCellClass(side.foot)
  const head = ringCellClass(side.head)
  const footOk = foot === 'solid' || (side.groundSolid === true && foot === 'empty')
  if (!footOk) return false
  return head === 'solid' || head === 'empty'
}

/**
 * The whole ring (4 sides) must be closable BEFORE the first placement: a
 * single unbuilt gap is a walk-in door, so a partial build must not buy the
 * wait. Junk input reads as not feasible.
 * @param {Array<object>} [sides] 4 side reads (ringSideBuildable shape)
 */
export function ringFeasible (sides) {
  if (!Array.isArray(sides) || sides.length < 4) return false
  return sides.every(s => ringSideBuildable(s))
}

/**
 * How many of the 8 cells still need a placement (pre-solid cells are free).
 * Junk sides read as the full cost (build nothing on a guess).
 * @param {Array<object>} [sides] 4 side reads (ringSideBuildable shape)
 */
export function ringBlocksNeeded (sides) {
  if (!Array.isArray(sides)) return RING_BLOCKS_NEEDED
  let n = 0
  for (const s of sides) {
    if (ringCellClass(s.foot) === 'empty') n++
    if (ringCellClass(s.head) === 'empty') n++
  }
  return n
}

/**
 * Placement order for the four sides: the side pointing AWAY from the threat
 * first, so the placements that happen while the mob is closest are the ones
 * nearest the bot's protected side. Sides keep the RING_SIDE_NORMALS indexes
 * (+x, -x, +z, -z); the score is the side's outward normal dotted with the
 * bot->threat bearing, ascending (most negative = most opposed to the threat
 * = away from it) - stable on ties so a zero bearing keeps the canonical
 * order.
 * @param {object} [p]
 * @param {number} [p.threatDx] bot->threat bearing x (junk -> 0)
 * @param {number} [p.threatDz] bot->threat bearing z (junk -> 0)
 */
export function ringSideOrder ({ threatDx = 0, threatDz = 0 } = {}) {
  const dx = Number.isFinite(threatDx) ? threatDx : 0
  const dz = Number.isFinite(threatDz) ? threatDz : 0
  return RING_SIDE_NORMALS
    .map((n, i) => ({ i, score: n.dx * dx + n.dz * dz }))
    .sort((a, b) => a.score - b.score || a.i - b.i)
    .map(x => x.i)
}

/**
 * Total blocks held that the SEAL_PRIORITY accepts (the ring spends the same
 * stock the dig-in seal does, just up to 8 of it). Junk -> 0.
 * @param {Array<{name?:string, count?:number}>|null|undefined} items
 */
export function countSealBlocks (items) {
  if (!Array.isArray(items)) return 0
  const held = new Map()
  for (const item of items) {
    if (!item || typeof item.name !== 'string') continue
    const n = Number.isFinite(item.count) && item.count > 0 ? item.count : 1
    held.set(item.name, (held.get(item.name) ?? 0) + n)
  }
  let total = 0
  for (const name of SEAL_PRIORITY) total += held.get(name) ?? 0
  return total
}

// ---- v0.68.0: THE PRE-FIGHT SHELTER + THE DIG-EARN BYPASS + RING PATIENCE ----
// run64 (dispatch 35682136264, the v0.66.0 fleet, NORMAL END 19/19, artifacts
// mined 2026-09-22) logged 34 shelter lines with FOUR failure shapes:
// (d) 12x 'no seal material, nothing expendable to drop' - the biggest slice.
//     The v0.50.0 earn assumes the FULL pocket (toss junk to free ONE slot so
//     the dig drop can land), but the measured refusals are the OPPOSITE
//     shape: tool-only pockets (F17 x5 around its respawns, F11/F6/F12/F13)
//     with 13+ FREE slots and nothing the junk list accepts. The refusal is
//     wrong there: the wall variant digs its own niche, the dug blocks drop
//     INSIDE pickup range, a free slot swallows one, and sealWaitUnseal
//     re-reads the inventory - the dig IS the earn. A toss is only needed
//     when NO slot exists.
// (structural) defendSelf consulted tryShelter only on the FLEE verdict - the
//     FIGHT verdict swung first, so the melee-naked bot spent its 17-20 hp
//     window on the measured losing fist fight (v0.47.0: 17 hp -> 4.3 hp,
//     zombie alive) and re-verdicted into the shelter at hp 5 with the zombie
//     at 0.6-2.2 - ranges the ring can never outbuild (run64: ring 0/8, 2/8,
//     2/8 there). F10 proved the wall variant WINS the close race (sheltered
//     from a zombie at 1.3). The shelter now runs BEFORE the first swing for
//     a bot without a real melee weapon.
// (a) 'ring incomplete' = ONE placement retry (4 ticks) per cell; a mob
//     grazing the build zone for longer walked the build dead. The seal's own
//     pacing (sealWaitUnseal: 2 rounds x 6 ticks) is the proven patience -
//     the ring adopts it as RING_PLACE_ROUNDS / RING_RETRY_TICKS.

/** Free (null) cells in an inventory slot array. The caller slices the range
 * it means (mineflayer's bot.inventory.slots includes craft/armor/offhand
 * cells - the miner passes the main+hotbar range). Junk -> 0: never dig-earn
 * on a guess.
 * @param {Array<unknown>} [slots] slot cells, empty = null/undefined */
export function emptySlotCount (slots) {
  if (!Array.isArray(slots)) return 0
  let n = 0
  for (const s of slots) if (s == null) n++
  return n
}

/** Placement rounds per ring cell (the sealWaitUnseal patience). */
export const RING_PLACE_ROUNDS = 2
/** Ticks between placement rounds - a mob grazing a build cell moves off
 * within ~0.3-1 s, the single 4-tick retry of run64 did not cover it. */
export const RING_RETRY_TICKS = 6
