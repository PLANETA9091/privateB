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
export const SEAL_PRIORITY = [
  'dirt', 'grass_block', 'coarse_dirt', 'podzol', 'rooted_dirt', 'mud',
  'cobblestone', 'cobbled_deepslate', 'andesite', 'diorite', 'granite', 'tuff', 'stone'
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
