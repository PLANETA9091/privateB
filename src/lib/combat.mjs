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

// (v0.112.0) THE POISON LENS - run99 (35869329042) named the witch the new top
// mob front (3 deaths, spider x0): the splash poison drains the bar UNDER the
// verdicts' feet. F10 fled at hp 5.3 (the verdict fired, but by then the drain
// had already won - the flee bearing rotated 180deg into the water veto and the
// witch finished it at 3.7); F1 died at 8.7 with ZERO verdict lines - the raw
// read saw a fightable bar while the poison was already sinking it. The lens
// charges the expected drain of the live effect against the thresholds: the
// verdicts spend the health the NEXT seconds still own. POISON_HP_BUDGET = the
// vanilla level-1 drain over the flee/shelter decision window (~5s at 1 dmg per
// 1.25s = 4): conservative by design - the budget must push a MID bar (11-12)
// over the FLEE_HP line, not turn every scratch into a flee.
export const POISON_HP_BUDGET = 4
/** Legacy numeric poison id - stable across the flattened effect registry;
 * the registry lookup in isPoisoned outranks it when the data ships a name. */
export const POISON_EFFECT_ID = 19

/** The health the verdicts may still spend: the bar minus the live poison's
 * expected drain. Junk-safe by contract: a non-finite health passes through
 * UNCHANGED (null stays null - the shelter gate's 'never shelter on a guess'
 * refuses junk downstream), poisoned=false is the identity, and the finite
 * result is clamped into the vanilla 0..20 bar so the lens can never invent
 * health above the ceiling or below the death line. */
export function effectiveHp ({ health = 20, poisoned = false } = {}) {
  if (!Number.isFinite(health)) return health
  const base = Math.max(0, Math.min(20, health))
  if (poisoned !== true) return base
  return Math.max(0, base - POISON_HP_BUDGET)
}

/** Does this bot carry a live poison effect? Reads bot.entity.effects - the
 * mineflayer shape is a map keyed by effect id ({ id, amplifier, duration }),
 * but the read tolerates every junk shape the library hands out: a name- or
 * displayName-carrying entry matches too (registry versions differ in what
 * they populate), the poison id resolves from the bot's registry when the
 * data ships it and falls back to the legacy numeric id otherwise. No bot,
 * no entity, no effects map, junk entries - all judge NOT poisoned (false),
 * because a guessed lens must never flee a healthy bot. */
export function isPoisoned (bot) {
  if (!bot || typeof bot !== 'object') return false
  const entity = bot.entity
  if (!entity || typeof entity !== 'object') return false
  const effs = entity.effects
  if (!effs || typeof effs !== 'object') return false
  let poisonId = POISON_EFFECT_ID
  try {
    const named = bot.registry && bot.registry.effectsByName && bot.registry.effectsByName.poison
    if (named && Number.isFinite(named.id)) poisonId = named.id
  } catch { /* junk registry -> the legacy fallback id */ }
  for (const e of Object.values(effs)) {
    if (!e || typeof e !== 'object') continue
    if (Number.isFinite(e.id) && Number(e.id) === Number(poisonId)) return true
    if (typeof e.name === 'string' && e.name.toLowerCase() === 'poison') return true
    if (typeof e.displayName === 'string' && e.displayName.toLowerCase() === 'poison') return true
  }
  return false
}

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

// ---- v0.77.0: THE FLEE STALEMATE BREAKER ----
// Run73 (dispatch 35725737486, the v0.76.0 fleet, NORMAL END 19/19, artifact
// fleet19-log 10694557028) measured the funnel NO governor saw: F6 x65 + F18
// x54 'combat: fleeing zombified_piglin' lines with the distance STUCK at
// 4.0-6.8 across the whole 600s. runAway's only success criterion is
// dist > 14 after 3 hops; a chaser at the bot's own walk speed makes that
// unreachable (every hop buys 0 blocks - the log shows dist 4.0 repeated
// verbatim), so the sentry re-fired the same shelter-scan + 3-hop flee every
// ~4s: F18 mined NOTHING (pocket [empty], 0 tool re-bootstraps), F6 starved
// the wood chain behind the chase (logs=0, 'no planks recipe' x33, 'spare
// craft failed' x33), and 2 of 19 bots paid their whole run to a chase that
// physics forbids escaping. The dig-earn line even printed ('the dig supplies
// the seal') but the ring's stock gate honestly read 0 blocks - digging 8 dirt
// by hand (~6s) loses the contact race from dist 4.0, and the pit variant is
// removed on the v0.48.0 seal-face measurement. The physics-honest response
// is the KITE: run TOWARD the yard (the spawn-origin fleet hub) instead of
// radially away. A same-speed chase keeps the distance but MOVES THE FIGHT
// to where the armed pack (swords=20 at run71, F12/F15 measured fights) kills
// the chaser; a de-aggro on the way (LOS break at range) is a free win.
// Sprint is NOT the lever: there is no food chain yet, hunger-gated sprint
// starves a bot mid-chase.
//
// Policy pinned here (the mechanics live in miner.mjs defendSelf/runAway):
// - every flee episode records the threat distance at flee START; the last
//   FLEE_STALEMATE_EPISODES samples within FLEE_STALEMATE_MARGIN of each
//   other prove the hops buy nothing -> 'kite' instead of 'radial';
// - a genuine escape (threat gone, or dist > 20 after an episode) clears the
//   ledger - the breaker must never latch on a chase that was won;
// - the kite is the SAME hop machinery with a different bearing (toward the
//   yard anchor), no new control owner, no A*-heavy goals - and near the yard
//   (within KITE_ARRIVE_DIST) it dissolves into the plain radial flee: the
//   pack owns the fight there, the bot just stops leading the mob in circles.

/** Flee episodes (start-distance samples) that prove a stalemate. */
export const FLEE_STALEMATE_EPISODES = 3
/** Max spread (blocks) across the window that still reads as stuck. */
export const FLEE_STALEMATE_MARGIN = 1.5
/** The kite dissolves this close to the yard anchor (the pack's fight). */
export const KITE_ARRIVE_DIST = 8
/** Default hop length for the kite bearing (runAway's radial hop is 12). */
export const KITE_HOP_BLOCKS = 12

/**
 * Is the flee funnel in stalemate? True when the LAST N start-distance
 * samples sit within MARGIN of each other - every episode began where the
 * previous one ended, i.e. the hops bought nothing. Any junk sample inside
 * the window reads NOT proven (the breaker must never fire on a guess).
 * @param {Array<number>|null|undefined} [startDists] flee-start threat
 *   distances, oldest first, most recent last
 */
export function fleeStalemate (startDists) {
  if (!Array.isArray(startDists) || startDists.length < FLEE_STALEMATE_EPISODES) return false
  const window = startDists.slice(-FLEE_STALEMATE_EPISODES)
  let min = Infinity
  let max = -Infinity
  for (const raw of window) {
    // (the v0.75.1 lesson, re-earned) Number(null) is 0, a FINITE number - a
    // missing reading is JUNK, not a measurement of zero. Explicit null check
    // BEFORE the coercion or three lost distance reads "prove" a stalemate.
    if (raw == null) return false
    const n = Number(raw)
    if (!Number.isFinite(n) || n < 0) return false
    if (n < min) min = n
    if (n > max) max = n
  }
  return max - min <= FLEE_STALEMATE_MARGIN
}

/**
 * Radial flee or kite to the yard? The single switch the mechanics execute.
 * @param {object} [p]
 * @param {Array<number>|null|undefined} [p.startDists] flee-start distances
 */
export function fleeResponse ({ startDists = null } = {}) {
  return fleeStalemate(startDists) ? 'kite' : 'radial'
}

/**
 * One hop target toward the yard anchor, or null when the kite must NOT run:
 * a junk anchor (no spawn point read) or a bot already at the yard falls back
 * to the radial flee (near the pack the fight is theirs - no leading a mob in
 * circles on the yard platform).
 * @param {object} [p]
 * @param {number} [p.bx] bot x (junk -> null)
 * @param {number} [p.bz] bot z (junk -> null)
 * @param {number} [p.yx] yard anchor x (junk -> null)
 * @param {number} [p.yz] yard anchor z (junk -> null)
 * @param {number} [p.hop] hop length in blocks (junk -> KITE_HOP_BLOCKS)
 * @param {number} [p.arrive] the kite gives up this close to the yard
 */
export function kiteHopTarget ({ bx = 0, bz = 0, yx = 0, yz = 0, hop = KITE_HOP_BLOCKS, arrive = KITE_ARRIVE_DIST } = {}) {
  const ax = Number(bx)
  const az = Number(bz)
  const gx = Number(yx)
  const gz = Number(yz)
  if (!Number.isFinite(ax) || !Number.isFinite(az) || !Number.isFinite(gx) || !Number.isFinite(gz)) return null
  const dx = gx - ax
  const dz = gz - az
  const d = Math.hypot(dx, dz)
  if (!Number.isFinite(d) || d <= (Number.isFinite(arrive) ? arrive : KITE_ARRIVE_DIST)) return null
  const h = Number.isFinite(hop) && hop > 0 ? hop : KITE_HOP_BLOCKS
  return { x: ax + (dx / d) * h, z: az + (dz / d) * h }
}

// (v0.115.0) THE WITCH CHASE CEILING - run99's other half of the witch front.
// The poison lens (v0.113.0) disengages the drained bot, but the witch itself
// stayed un-punished: the fight loop's moving GoalFollow re-paths toward a
// retreating witch every round, dragging the bot through the splash band on
// every re-verdict (F1 died AT witch@8.7 inside that churn; F10's 180deg flee
// rotation finished the job at 3.7). The handoff names the cure: "close to
// melee through the potion range, don't chase beyond ~6". The witch hovers at
// 8-10 to throw - the melee MUST cross that band once or the drain never ends;
// but the RETREAT is chased for at most ~6 walked blocks per fight episode,
// then the follow holds and the episode breaks. The next health drop reopens
// the episode with a fresh budget (the poison tick fires the sentry every
// ~1.25s, so the swings keep landing); the lens owns the drained bar.
export const WITCH_CHASE_CEILING = 6

/**
 * One follow decision inside a witch fight episode. The close through the
 * splash band happens (the witch stands to throw - the snapshot close reaches
 * it); the cumulative walked chase is capped per episode. Junk-safe: a
 * unreadable distance never chases, a junk budget reads as unspent (the
 * walk measurement owns the truth, not the caller's guess).
 * @param {object} p
 * @param {number} [p.dist] metres to the witch (junk -> hold)
 * @param {number} [p.chased] blocks actually walked on prior follow steps this
 *   episode (junk -> 0: the first close is always affordable)
 * @returns {'reach'|'close'|'hold'} 'reach' = swing range, swing; 'close' = the
 *   follow may step; 'hold' = the budget is spent, the episode breaks
 */
export function witchFightStep ({ dist, chased = 0 } = {}) {
  if (!Number.isFinite(dist) || dist < 0) return 'hold'
  if (dist <= 3.2) return 'reach'
  const spent = Number.isFinite(chased) && chased > 0 ? chased : 0
  if (spent >= WITCH_CHASE_CEILING) return 'hold'
  return 'close'
}

// (v0.137.0) THE MELEE BUDGET - run551's fight episodes (the v0.135.0
// instrument's first field data) named the churn: F9 vs a kiting skeleton
// swung 17 times, closed ZERO times, and held hp flat for the whole 10s
// deadline - the moving GoalFollow re-paths every round against a shooter
// that retreats at the bot's own walk speed; F11 vs a drowned spent 4 failed
// closes (2.5s each) losing 9.4 hp inside one episode. The witch lane
// (v0.115.0) already owns the shape: close to the threat's STANDING cell (a
// snapshot, not a moving goal) and cap the cumulative walked chase per
// episode. meleeFightStep generalizes it to every non-witch melee: the same
// contract with its own ceiling constant (an independent tunable - the witch
// budget stays pinned by its own run99 measurement).
export const MELEE_CHASE_CEILING = 6

/**
 * One follow decision inside a general melee fight episode - the witch
 * lane's snapshot+budget shape on every non-witch threat. Junk-safe by the
 * witch contract: an unreadable distance never chases, a junk budget reads
 * as unspent (the walk measurement owns the truth).
 * @param {object} p
 * @param {number} [p.dist] metres to the threat (junk -> hold)
 * @param {number} [p.chased] blocks actually walked on prior close steps this
 *   episode (junk -> 0: the first close is always affordable)
 * @returns {'reach'|'close'|'hold'} 'reach' = swing range, swing; 'close' = the
 *   follow may step; 'hold' = the budget is spent, the episode breaks
 */
export function meleeFightStep ({ dist, chased = 0 } = {}) {
  if (!Number.isFinite(dist) || dist < 0) return 'hold'
  if (dist <= 3.2) return 'reach'
  const spent = Number.isFinite(chased) && chased > 0 ? chased : 0
  if (spent >= MELEE_CHASE_CEILING) return 'hold'
  return 'close'
}

// (v0.169.0) THE FIGHT FINISH - run78 (36091731878, the v0.167.0 union @ the
// honest 600s) named the wash: TEN fight-end lines, ZERO mob kills, the bot
// paying 4-12 hp per zombie exchange and the mob WALKING AWAY alive ('threat
// gone' at 1-3 hp). The anatomy: each swing knocks the melee threat back
// 2-3 blocks, the loop's dist > 3.2 gate reads the knockback as a fleeing
// target and CLOSES, the knockback pursuit walks the episode's meleeChased
// budget to MELEE_CHASE_CEILING in 2-3 swings ('melee chase ceiling held
// (chased 7.7b, zombie @3.4)'), and the break leaves the mob alive to
// re-engage the wounded bot later - the F14 shape (fight ended (deadline)
// hp 20.0 -> 13.8 -> died to the same Drowned @0.9 one line later). The
// finish: the knockback RETURN is waited out (a melee mob walks itself back
// into reach - no movement spent, no walked budget burned), the swing
// cadence charges FULL (the vanilla 1.9 cooldown: a swing at progress p
// lands (p^2+2p)/3 of the weapon's damage), and the melee episode runs to
// the kill (10s -> 16s gives the 5-7 full-charge cycles a zombie needs vs
// the wooden sword). The kill ledger ('mob down' exit + stats.kills) turns
// the first field kill into MINEABLE evidence.
export const MELEE_RETURN_WAIT_TICKS = 20
export const MELEE_RETURN_WINDOWS = 2
export const FIGHT_DEADLINE_MS = 16000
export const MELEE_REACH = 3.2

/**
 * The knockback return plan for one melee fight round - asked ONLY for a
 * melee-lane threat (not the witch, not RANGED_HOSTILES) that is OUT of
 * reach. After a swing the knocked threat walks back on its own; chasing
 * the knockback spends the walked budget the ceiling exists to cap and
 * re-buys the contact the knockback just bought. Junk-safe: an unreadable
 * distance or a never-swung episode always closes (the first approach is a
 * REAL chase, not a knockback return; the legacy close verdict owns the
 * unreadable read).
 * @param {object} p
 * @param {number} [p.dist] metres to the threat (junk -> 'close')
 * @param {number} [p.windows] return windows already waited on this
 *   knockback (junk -> 0: the first window is always affordable)
 * @param {boolean} [p.swung] the episode has swung at least once (false ->
 *   'close': nothing was knocked back yet)
 * @returns {'wait'|'close'} 'wait' = the threat is walking back, hold the
 *   ground one window more; 'close' = spend the close ladder. A threat at
 *   or inside MELEE_REACH answers 'wait' by doctrine (never chase a mob in
 *   reach - the swing owns it); the wiring never asks there, it swings.
 */
export function meleeReturnPlan ({ dist, windows = 0, swung = false } = {}) {
  if (!swung) return 'close'
  if (!Number.isFinite(dist) || dist < 0) return 'close'
  if (dist <= MELEE_REACH) return 'wait'
  const spent = Number.isFinite(windows) && windows > 0 ? windows : 0
  if (spent >= MELEE_RETURN_WINDOWS) return 'close'
  return 'wait'
}

// (v0.169.0) THE FULL-CHARGE SWING - the vanilla 1.9 attack cooldown table:
// a swing at cooldown progress p lands (p^2+2p)/3 of the weapon's damage,
// so the old flat 10-tick pacing vs a sword's 12.5-tick charge landed ~75%
// per swing and vs a pickaxe's 16.7-tick charge only ~51% - the wash's
// damage half. The table reads the item NAME (the fight lane equips by
// name; materials share the attack speed inside a class): ticks =
// ceil(20 / attackSpeed). sword 1.6 -> 13, axe 0.8 (the wooden floor) -> 25,
// pickaxe 1.2 -> 17, shovel 1.0 -> 20, hoe 1.0 -> 20, fists/unknown -> 5
// (the 4.0 fist speed).
export const WEAPON_COOLDOWN_DEFAULT_TICKS = 5

/**
 * The full-charge wait for one weapon swing, in ticks. Junk-safe: a
 * non-string name or a name that names no tool class reads as fists.
 * @param {string|null} [name] the equipped item name ('wooden_sword', ...)
 * @returns {number} ticks to wait before the next swing lands at charge 1.0
 */
export function cooldownTicksForWeapon (name) {
  if (typeof name !== 'string' || name.length === 0) return WEAPON_COOLDOWN_DEFAULT_TICKS
  const n = name.toLowerCase()
  if (n.endsWith('sword')) return 13
  if (n.endsWith('pickaxe')) return 17 // BEFORE the axe read: 'pickaxe' ends with 'axe'
  if (n.endsWith('axe')) return 25
  if (n.endsWith('shovel')) return 20
  if (n.endsWith('hoe')) return 20
  return WEAPON_COOLDOWN_DEFAULT_TICKS
}

// (v0.140.0) THE RANGED-FIGHT COOLDOWN - run554's skeleton cascade named the
// reopen shape: "melee chase ceiling held ... the next drop reopens it" armed
// the budget, and the next ARROW spent it again. F2's episode chain: hp 19.0
// -> 13.0 (chase ceiling, 4 swings) -> verdict flipped to flee at 7.0 ->
// shelter skip (ring incomplete 4/8) -> dead; F6/F7/F10/F12/F14 the same
// class, all surface night (y=64-66). A shooter cannot be chased down (the
// F9 17-swings-0-hits measurement) and every reopen walks the bot back INTO
// the arrow band. The cooldown: after a chase-ceiling break vs a NON-WITCH
// ranged threat the mob is refused 'fight' for RANGED_COOLDOWN_MS - the
// verdict yields 'flee' where it used to re-open the fight, the ring's arrow
// wall owns the terrain, the kite owns the open field. The witch keeps her
// v0.115.0 contract (the poison lens NEEDS the melee through the splash band;
// a cooldown would strand the drain running on a fleeing bot).
export const RANGED_COOLDOWN_MS = 10000

/**
 * The wall-clock until-timestamp for a freshly armed cooldown, or null on a
 * junk now (the caller then arms nothing - a guessed timestamp must never
 * close the fight lane forever).
 * @param {object} [p]
 * @param {number} [p.now] wall clock ms (junk -> null)
 * @param {number} [p.ms] cooldown length ms (junk -> RANGED_COOLDOWN_MS)
 */
export function rangedCooldownUntil ({ now, ms = RANGED_COOLDOWN_MS } = {}) {
  // (the Number(null) lesson, tenth strike) Number(null) is 0, a FINITE
  // number - a missing/junk now must refuse the arm, NOT read as epoch 0:
  // 0 + RANGED_COOLDOWN_MS would close a lane that was never measured. No
  // destructuring default here ON PURPOSE: `= 0` silently converts an
  // undefined now into a real timestamp (the exact arm-on-a-guess this
  // guard exists to refuse).
  if (now == null) return null
  const t = Number(now)
  if (!Number.isFinite(t) || t < 0) return null
  const d = Number.isFinite(ms) && ms > 0 ? Math.floor(ms) : RANGED_COOLDOWN_MS
  return t + d
}

/**
 * Is a cooldown window live? Junk on either side reads NOT live (an expired
 * entry and a missing entry behave identically: the fight lane is open).
 * @param {object} [p]
 * @param {number} [p.now] wall clock ms (junk -> false)
 * @param {number|null|undefined} [p.until] the armed until-timestamp
 *   (null/undefined/junk -> false)
 */
export function rangedCooldownLive ({ now = 0, until = null } = {}) {
  // (the Number(null) lesson) a junk now must OPEN the lane, not read as
  // epoch 0 - 0 < until would hold a phantom cooldown forever.
  if (now == null) return false
  const t = Number(now)
  if (!Number.isFinite(t) || !Number.isFinite(until)) return false
  return t < until
}

// (v0.137.0) THE WATER-MELEE YIELD LINE - F11's fight episode traded
// 14.7 -> 5.3 hp against a drowned and finished at the bottom of the pool:
// FLEE_HP (8) is a LAND measurement, and a bot standing in water has no
// sprint, no crits and the slower bearing - the same trade costs more, and
// the flee (when it finally fires) runs slower too. The water lens lifts the
// yield line: standing IN water the verdicts yield below WATER_FLEE_HP
// (12 = 6 hearts, 4 above the land line - the F11 episode crossed 12 after
// ~2 rounds, so the flee fires with ~6 hp of margin instead of none).
export const WATER_FLEE_HP = 12

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
 * @param {boolean} [p.poisoned=false] is a poison effect live on the bot? (v0.112.0)
 *   The witch front: the raw bar at 11-12 reads fightable while the drain is
 *   already sinking it - the flee lanes judge effectiveHp (the lens) so a
 *   poisoned mid bar disengages BEFORE the 1-hp poison bottom.
 * @param {boolean} [p.inWater=false] is the bot STANDING in water? (v0.137.0)
 *   The F11 shape: the drowned trade sank 14.7 -> 5.3 inside one episode
 *   because the land flee line never fired in time. In water the yield line
 *   lifts to WATER_FLEE_HP - junk-safe: anything but literal true reads dry
 *   (the legacy shape byte for byte).
 * @param {boolean} [p.cooldown=false] is the RANGED-FIGHT COOLDOWN live for
 *   this mob? (v0.140.0) run554's skeleton cascade: every chase-ceiling break
 *   was re-opened by the next arrow, and the reopen walked the bot back into
 *   the volley. Live cooldown + a RANGED_HOSTILES threat inside its engage
 *   range yields 'flee' where it used to return 'fight' - the shooter cannot
 *   be chased down, the ring's arrow wall and the kite own the response.
 *   Junk-safe: anything but literal true reads closed (the legacy verdicts
 *   byte for byte), and MELEE threats never consult it (a zombie at 2 blocks
 *   is still a fight).
 * @returns {'fight'|'flee'|'ignore'}
 */
export function threatVerdict ({ name = null, dist = Infinity, hp = 20, attackers = 1, dark = true, armed = true, poisoned = false, inWater = false, cooldown = false } = {}) {
  if (!name || !HOSTILE_NAMES.has(name)) return 'ignore'
  if (!Number.isFinite(dist) || dist < 0) return 'ignore'
  const health = Number.isFinite(hp) ? hp : 20
  const crowd = Number.isFinite(attackers) && attackers > 0 ? attackers : 1
  const seen = effectiveHp({ health, poisoned })
  if (name === 'creeper' && dist <= CREEPER_FLEE_RANGE) return 'flee'
  // daylight spiders are peaceful bystanders UNLESS they are already on top of us
  // (collide/provoke) - the flee decision they used to trigger wasted trips
  if (name === 'spider' && dark !== true && dist > 2.5) return 'ignore'
  if (armed !== true) return dist <= RANGED_ENGAGE_RANGE ? 'flee' : 'ignore'
  if (seen < FLEE_HP) return 'flee'
  // (v0.137.0) THE WATER-MELEE YIELD LINE: in water the same bar yields
  // earlier (the F11 lesson - the land line fired four rounds too late)
  if (inWater === true && seen < WATER_FLEE_HP) return 'flee'
  if (crowd >= SWARM_SIZE && seen < SWARM_FLEE_HP) return 'flee'
  const engage = RANGED_HOSTILES.has(name) ? RANGED_ENGAGE_RANGE : ENGAGE_RANGE
  // (v0.140.0) THE RANGED COOLDOWN: a mob inside its window is never chased -
  // the verdict yields 'flee' where it used to re-open the fight. Only the
  // RANGED classes consult it (the melee band keeps its sword answer), and
  // only when the verdict would have been 'fight' (the creeper/spider/unarmed
  // lanes above keep their own verdicts). The witch is EXCLUDED at the pure
  // layer too (defense in depth: the miner never arms her window, and this
  // lane must never strand her v0.115.0 poison-drain chase even if a future
  // call site passes a cooldown by mistake).
  if (cooldown === true && name !== 'witch' && RANGED_HOSTILES.has(name) && dist <= engage) return 'flee'
  if (dist <= engage) return 'fight'
  return 'ignore'
}
