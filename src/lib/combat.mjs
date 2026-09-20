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

/** Best melee item from an inventory item list (or null = fight with the fist).
 * @param {Array<{name?:string}>|null|undefined} items */
export function pickWeapon (items) {
  if (!Array.isArray(items)) return null
  let best = null
  let bestKey = null
  for (const item of items) {
    if (!item || typeof item.name !== 'string') continue
    const [mat, ...rest] = item.name.split('_')
    const type = rest.join('_')
    const t = WEAPON_TYPE_RANK[type]
    if (!t) continue // tools that are not weapons, armour, blocks - all skipped
    const m = WEAPON_MATERIAL_RANK[mat] ?? 0
    const key = t * 10 + m
    if (bestKey === null || key > bestKey) { best = item; bestKey = key }
  }
  return best
}

/**
 * Fight, flee, or ignore? The single decision the mechanics layer executes.
 * @param {object} p
 * @param {string|null} [p.name] hostile entity name (null/unknown -> ignore)
 * @param {number} [p.dist] metres from the bot (junk -> ignore: we cannot act on it)
 * @param {number} [p.hp] bot health 0..20
 * @param {number} [p.attackers] hostiles within DETECT_RANGE (swarm detection)
 * @returns {'fight'|'flee'|'ignore'}
 */
export function threatVerdict ({ name = null, dist = Infinity, hp = 20, attackers = 1 } = {}) {
  if (!name || !HOSTILE_NAMES.has(name)) return 'ignore'
  if (!Number.isFinite(dist) || dist < 0) return 'ignore'
  const health = Number.isFinite(hp) ? hp : 20
  const crowd = Number.isFinite(attackers) && attackers > 0 ? attackers : 1
  if (name === 'creeper' && dist <= CREEPER_FLEE_RANGE) return 'flee'
  if (health < FLEE_HP) return 'flee'
  if (crowd >= SWARM_SIZE && health < SWARM_FLEE_HP) return 'flee'
  const engage = RANGED_HOSTILES.has(name) ? RANGED_ENGAGE_RANGE : ENGAGE_RANGE
  if (dist <= engage) return 'fight'
  return 'ignore'
}
