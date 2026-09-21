// Combat policy (pure, unit-testable - no bot, no server).
//
// The 2026-09-20 smelt-test measured a MIDDAY death that the existing layers did
// not prevent: a shaft opened into a cave, a zombie hit the bot
// 20 -> 14.7 -> 12.7 -> 5.7 -> dead in 9 s while the digShaft health guard just
// "paused descent" (30 idle ticks heals nothing when a mob keeps swinging - the
// guard was written for FALL damage, where waiting works). Night walks are gated
// by nightsafety.mjs and shafts are lit by torch.mjs; the missing layer is the
// MEETING itself: fight when the odds are fine, flee when they are not.
//
// Policy pinned here (the mechanics live in miner.mjs defendSelf):
// - CREEPERS are never fought: at melee range they detonate (a bot with a stone
//   pickaxe needs ~3 hits = ~2 s; the fuse is 1.5 s). Any creeper inside
//   CREEPER_FLEE_RANGE means RUN, not swing.
// - Low health means FLEE from everything: a dying bot loses the whole inventory,
//   so hp < FLEE_HP turns every threat into "distance is the only healer".
// - A SWARM at low-ish health means FLEE too: each extra attacker multiplies the
//   incoming DPS while our swings stay 1 target/s.
// - Everything else within engage range means FIGHT with the best held weapon.
//   Swords hit hardest, axes second, pickaxes are tools but still beat fists.

/** Hostile mobs the fleet actually meets (surface forests, caves, yard at night).
 * Name-based on purpose: prismarine `entity.kind` strings vary across registry
 * versions, but `entity.name` is the stable snake_case id ('zombie', 'creeper'). */
export const HOSTILE_NAMES = new Set([
  'zombie', 'zombie_villager', 'husk', 'drowned',
  'skeleton', 'stray', 'bogged',
  'spider', 'cave_spider',
  'creeper',
  'witch', 'slime', 'magma_cube', 'phantom', 'silverfish', 'endermite',
  'enderman', 'piglin', 'piglin_brute', 'zombified_piglin', 'hoglin', 'zoglin',
  'pillager', 'vindicator', 'evoker', 'vex', 'ravager', 'illusioner',
  'guardian', 'elder_guardian',
  'blaze', 'wither_skeleton', 'ghast', 'wither', 'breeze', 'warden'
])

/** Mobs that hurt from far away: closing the distance BEATS hiding in place. */
export const RANGED_HOSTILES = new Set(['skeleton', 'stray', 'bogged', 'witch', 'pillager', 'blaze', 'ghast'])

// Policy constants (all measured against vanilla 26.2 numbers):
export const DETECT_RANGE = 12       // scan radius - must see everything the verdict engages (>= RANGED_ENGAGE_RANGE)
export const ENGAGE_RANGE = 5        // melee mob this close gets fought (reach + lunge margin)
export const RANGED_ENGAGE_RANGE = 12 // a shooter at 8 blocks is ALREADY shooting
export const CREEPER_FLEE_RANGE = 7  // beyond the 3-block explosion radius, with margin to run
export const FLEE_HP = 8             // 4 hearts - one skeleton volley from death
export const SWARM_FLEE_HP = 14      // 7 hearts against 3+ attackers is losing
export const SWARM_SIZE = 3

/** Is this prismarine entity something the fleet must defend against?
 * Tolerates palette-less/junk entities (mineflayer hands those out freely). */
export function isHostileEntity (e) {
  if (!e || typeof e !== 'object') return false
  const name = typeof e.name === 'string' ? e.name : (typeof e.displayName === 'string' ? e.displayName.toLowerCase().replace(/\s+/g, '_') : null)
  if (!name) return false
  return HOSTILE_NAMES.has(name)
}

// Weapon preference: TYPE first (sword > axe > pickaxe > shovel > hoe > anything),
// then MATERIAL (netherite > diamond > iron > stone > golden > wooden). A golden
// sword outscores a wooden axe, a stone axe outscores a diamond shovel - the type
// ordering encodes melee damage, the material ordering encodes durability+damage.
const WEAPON_TYPE_RANK = { sword: 5, axe: 4, pickaxe: 3, shovel: 2, hoe: 1 }
const WEAPON_MATERIAL_RANK = { netherite: 6, diamond: 5, iron: 4, stone: 3, golden: 2, wooden: 1 }

// MELEE-capable classes only: a sword (4-5 dmg) or an axe (7-9 dmg) wins the
// following fight; a pickaxe (3 dmg), shovel (2.5) and hoe (1) are TOOLS. The
// live measurement (fists 1-2 dmg: 17 hp -> 4.3 hp, zombie alive) puts the
// 3-dmg pickaxe in the same losing class against a 20 hp zombie swinging
// 2.5/s - and fleet 35599777909 (v0.46.0) measured 17 deaths with shelters=0
// BECAUSE every dead bot held a pickaxe: the shelter gate read armed=true and
// sealed the shelter branch BY CONSTRUCTION. The shelter policy and anything
// that feeds it must ask pickMeleeWeapon, not pickWeapon.
export const MELEE_TYPE_RANK = { sword: 5, axe: 4 }

function pickByTypeRanks (items, typeRank) {
  if (!Array.isArray(items)) return null
  let best = null
  let bestKey = null
  for (const item of items) {
    if (!item || typeof item.name !== 'string') continue
    const [mat, ...rest] = item.name.split('_')
    const type = rest.join('_')
    const t = typeRank[type]
    if (!t) continue // tools that are not weapons, armour, blocks - all skipped
    const m = WEAPON_MATERIAL_RANK[mat] ?? 0
    const key = t * 10 + m
    if (bestKey === null || key > bestKey) { best = item; bestKey = key }
  }
  return best
}

/** Best melee item from an inventory item list (or null = fight with the fist).
 * @param {Array<{name?:string}>|null|undefined} items */
export function pickWeapon (items) {
  return pickByTypeRanks(items, WEAPON_TYPE_RANK)
}

/** Best MELEE weapon (sword or axe) from an inventory item list, or null when
 * the bot holds only tools - a pickaxe-only bot is NAKED for the shelter
 * policy: it loses the following fight the same way fists do.
 * @param {Array<{name?:string}>|null|undefined} items */
export function pickMeleeWeapon (items) {
  return pickByTypeRanks(items, MELEE_TYPE_RANK)
}

/**
 * Fight, flee, or ignore? The single decision the mechanics layer executes.
 * @param {object} p
 * @param {string|null} [p.name] hostile entity name (null/unknown -> ignore)
 * @param {number} [p.dist] metres from the bot (junk -> ignore: we cannot act on it)
 * @param {number} [p.hp] bot health 0..20
 * @param {number} [p.attackers] hostiles within DETECT_RANGE (swarm detection)
 * @param {boolean} [p.dark=true] is it dark at the bot (night / underground)? Safe
 *   default true: wrongly ignoring a real threat kills bots, wrongly fleeing a
 *   neutral spider only wastes a moment. Spiders are NEUTRAL in daylight (vanilla
 *   light > 7) - they wander past working bots without attacking; enderman stay
 *   hostile-listed (the stare mechanic is too risky to model blind).
 * @param {boolean} [p.armed=true] does the bot hold ANY melee weapon? Default true
 *   keeps the historical behaviour. UNARMED bots never fight: fists deal 1-2 per
 *   swing, a zombie has 20 hp and swings 2.5 back per second - the live combat
 *   logs measured unarmed fights ending 17 hp -> 4.3 hp with the zombie alive.
 *   Within RANGED_ENGAGE_RANGE a naked bot FLEES; beyond it there is no urgency.
 * @returns {'fight'|'flee'|'ignore'}
 */
export function threatVerdict ({ name = null, dist = Infinity, hp = 20, attackers = 1, dark = true, armed = true } = {}) {
  if (!name || !HOSTILE_NAMES.has(name)) return 'ignore'
  if (!Number.isFinite(dist) || dist < 0) return 'ignore'
  const health = Number.isFinite(hp) ? hp : 20
  const crowd = Number.isFinite(attackers) && attackers > 0 ? attackers : 1
  if (name === 'creeper' && dist <= CREEPER_FLEE_RANGE) return 'flee'
  // daylight spiders are peaceful bystanders UNLESS they are already on top of us
  // (collide/provoke) - the flee decision they used to trigger wasted trips
  if (name === 'spider' && dark !== true && dist > 2.5) return 'ignore'
  if (armed !== true) return dist <= RANGED_ENGAGE_RANGE ? 'flee' : 'ignore'
  if (health < FLEE_HP) return 'flee'
  if (crowd >= SWARM_SIZE && health < SWARM_FLEE_HP) return 'flee'
  const engage = RANGED_HOSTILES.has(name) ? RANGED_ENGAGE_RANGE : ENGAGE_RANGE
  if (dist <= engage) return 'fight'
  return 'ignore'
}
