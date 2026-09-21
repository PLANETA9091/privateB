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
