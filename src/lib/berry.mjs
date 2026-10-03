// (v0.528.0) THE HEDGE PANTRY - the scout's first survival legs.
//
// The survival doctrine's legs (flee -> wait -> eat -> regen) were wired bot
// by bot: THE FLESH RATION (v0.511.0) armed the miner's eater, the FOOD
// COMMONS (v0.522.0) opened the yard's demand shoulder, the FAMINE TRIP
// (v0.525.0) gave the mining loop its own clock. The scout stayed legless:
// no ration (the miner's autoeat wire lives in miner.mjs only), no combat
// lane (no zombie drops - the miner's only food source), no yard visits (the
// patrol walks the surface lanes away from the commons), and the bot spawns
// with an EMPTY pocket (vanilla survival, no op, no gifts). A long patrol
// burns hunger through regen and fall damage; at hunger 0 the starvation
// clock starts and the map's only writer dies mid-run - the knowledge stream
// starves with it, and no line ever says why.
//
// THE SLICE: the scout feeds itself from the land it walks. Sweet berry
// bushes grow ON the surface lanes (taiga and friends), the harvest is a
// right-click (vanilla activate - the bush survives, age resets, NO dig:
// "a scout that digs is a miner with extra steps" holds byte for byte), and
// the drops auto-pickup (server-side, like every player's). Two legs wire:
//
//   THE EATING LEG  - the 0.511.0 ration bytes on the second bot: the same
//                     plugin, the SAME RATION_OPTS policy object (one
//                     doctrine - the banned list, the regen-floor threshold,
//                     the honest flags), enableAuto on every spawn, the
//                     eatStart/eatFinish honest read. Sweet_berries are NOT
//                     banned (the four real bans stand: pufferfish and
//                     chorus_fruit teleport, potato and spider_eye poison).
//
//   THE GATHER LEG  - the berry stop rides the scan cadence (after every
//                     scan, zero patrol-loop changes): the due gate below,
//                     one bush, one walk, one activate, the pocket delta
//                     names the harvest. Refusals stay QUIET in the field
//                     (the healthy lean is silent - the rider's own law);
//                     the fire and the failure name themselves.
//
// THE BAND LAW: SCOUT_HUNGER_BAND is REGEN_HUNGER_FLOOR itself (pinned
// cross-lib in tests) - the ration's band and the pantry's band are ONE
// band, the famine trip's own byte. Below the floor the bot cannot heal and
// the pantry arms; at or above it the scout heals itself and the stop waits.
//
// Everything here is pure (no bot imports) and unit-tested without a server.
import { REGEN_HUNGER_FLOOR } from './ration.mjs'

/** The bush the pantry harvests. Vanilla 26.2: a right-click on a mature
 *  bush (age >= 2) drops 1-3 sweet_berries and resets the age - the block
 *  survives, the lane stays walkable. */
export const BERRY_BUSH = 'sweet_berry_bush'

/** The berries' item name (the drop; the ration eats it; the pocket counts it). */
export const BERRY_ITEM = 'sweet_berries'

/** The pantry's band: REGEN_HUNGER_FLOOR itself. ONE band with the ration
 *  (eats at hunger <= 17) and the famine trip (arms below 18) - a scout at
 *  or above 18 heals itself, below 18 it gathers. */
export const SCOUT_HUNGER_BAND = REGEN_HUNGER_FLOOR

/** The pocket cap: the flesh keep's own number (deposit.mjs keeps 6). A
 *  pocket at the cap stops the gathering - the pantry is a larder, not a
 *  strip mine; the taiga keeps its hedges. */
export const BERRY_POCKET_CAP = 6

/** The detour's walk envelope (blocks): the scout's own leg step length is
 *  24 (createPatrol's stepLen cap) - a bush beyond this is off the lane. */
export const BERRY_REACH = 24

/** The findBlocks cap per stop: the eight nearest candidates are priced,
 *  the nearest MATURE one wins (the deeper-record lesson: one candidate
 *  starves the name - here one candidate starves the stop). */
export const BERRY_COUNT = 8

/** The drops' landing wait after the activate: the items fall and auto-pickup
 *  inside the same window - the pocket delta reads them (the ration's honest
 *  delta shape, one second granularity). */
export const BERRY_PICKUP_MS = 1000

/**
 * Is THIS block a harvestable bush? Returns true (mature: age >= 2), false
 * (a bush too young to give, or not a bush at all), null (a dead read: no
 * block, or the age property is missing - the honest unknown is never
 * walked for; a wasted walk is the one cost the lane cannot refund).
 */
export function matureBush (block) {
  if (!block || typeof block !== 'object') return null
  if (block.name !== BERRY_BUSH) return false
  const age = Number(block.properties?.age)
  if (!Number.isFinite(age)) return null
  return age >= 2
}

/**
 * Junk-safe pocket read: how many berries does the bot hold? Returns null
 * when the inventory is unreadable (a mock, a gone bot) - the DEAD read,
 * never a fake zero (the Number(null) lesson). An empty inventory reads 0:
 * the truth, and the pantry's own starting shape (the bot spawns with
 * nothing).
 */
export function pocketBerries (bot) {
  const items = bot?.inventory?.items?.()
  if (!Array.isArray(items)) return null
  let n = 0
  for (const it of items) {
    if (it && it.name === BERRY_ITEM) n += Number(it.count) || 0
  }
  return n
}

/**
 * Pure, junk-safe: should the berry stop fire on THIS scan tick? The laws,
 * in order:
 * (1) the hunger read is ALIVE (finite, >= 0) - a dead read never arms;
 * (2) the hunger is BELOW the band (SCOUT_HUNGER_BAND = the regen floor) -
 *     at or above, the scout heals itself and the pantry waits;
 * (3) the pocket read is ALIVE - the cap cannot be priced by a dead read;
 * (4) the pocket is BELOW the cap - a full larder needs no hedge.
 * Every refusal names its why and stays quiet at the wire (the rider's
 * own law: the healthy lean is silent).
 */
export function berryHarvestDue ({ hunger = null, pocket = null } = {}) {
  // the Number(null) strikes (the v0.516.0 lesson, the rider's own fix): a
  // null/undefined read is DEAD, never zero - Number(null) is 0, and 0 is
  // the pantry's most urgent LIVE hunger. The null check comes FIRST.
  if (hunger == null) return { due: false, why: 'the hunger read is dead' }
  const h = Number(hunger)
  if (!Number.isFinite(h) || h < 0) return { due: false, why: 'the hunger read is dead' }
  if (h >= SCOUT_HUNGER_BAND) return { due: false, why: `the scout heals (hunger ${h} at or above the band ${SCOUT_HUNGER_BAND})` }
  if (pocket == null) return { due: false, why: 'the pocket read is dead' }
  const p = Number(pocket)
  if (!Number.isFinite(p) || p < 0) return { due: false, why: 'the pocket read is dead' }
  if (p >= BERRY_POCKET_CAP) return { due: false, why: `the pocket holds (cap ${BERRY_POCKET_CAP})` }
  return { due: true }
}

/**
 * The nearest MATURE bush among the candidates (bot.findBlocks' output),
 * closest first, junk-safe: non-objects, positionless entries and immature
 * bushes are skipped, a junk `from` reads null, entries beyond maxDistance
 * are refused. Returns the winning BLOCK (the wire re-reads it live after
 * the walk - the map between findBlocks and the arrival belongs to the
 * world, not to the scan) or null.
 */
export function pickBush (blocks, from, { maxDistance = BERRY_REACH } = {}) {
  if (!Array.isArray(blocks)) return null
  if (!from || typeof from.distanceTo !== 'function') return null
  const cap = Number(maxDistance)
  let best = null
  let bestDist = Infinity
  for (const b of blocks) {
    if (!b || !b.position || typeof b.position.distanceTo !== 'function') continue
    if (matureBush(b) !== true) continue
    const d = b.position.distanceTo(from)
    if (!Number.isFinite(d) || !Number.isFinite(cap) || d > cap || d >= bestDist) continue
    best = b
    bestDist = d
  }
  return best
}

// ---- (v0.534.0) THE FAMINE WALK - the pantry's second answer ----
//
// The pantry's reach is the lane itself (BERRY_REACH 24): a scout below the
// regen floor with NO mature bush in reach quietly refused and kept walking
// - the taiga lanes feed the pantry, but a hedge-less stretch (plains,
// desert, the scanned-out lane) starves the scout at the band's own
// arithmetic: the ration needs food IN POCKET, the pocket only fills from
// bushes, and the 0.528.0 hand-away named the class ('the no-bush share -
// prices a wider lane / map berry knowledge'). THE WALK: the scan's own eye
// already passes over every bush on the lane (the memory shoulder in
// createScan records what it sees into a PRIVATE bush memory - the shared
// map stays the MINERS' resource book, bushes are the pantry's knowledge,
// never a mining target), and the stop's no-bush-in-reach refusal upgrades:
// when the memory knows a bush inside the walk envelope, the scout spends
// ONE bounded goto on it and the same honest delta names whatever the world
// gives - a full harvest, a bare bush (picked clean earlier; the zero is a
// readable zero), a young bush (age ripens - the activate gives what the
// world has), or a gone record (the memory forgets it). The walk serves the
// regen floor itself: below the band the bot cannot heal - starvation is
// the other death - so the food walk stays armed even inside the night hold
// (the reach hop's own law, one envelope longer).

/** The famine walk's envelope (blocks): the scan's own knowledge radius -
 *  the memory never knows a bush the eye could not have seen, so a walk
 *  beyond this would serve hope, not knowledge. */
export const BERRY_WALK_CAP = 48

/** The famine walk's goto timeout: the scout leg's own shape (15000) - the
 *  walk is one bounded goto, never a lane. */
export const BERRY_WALK_TIMEOUT_MS = 15000

/** The bush memory's bound: the nearest knowledge wins, the OLDEST record
 *  is forgotten first (one bounded book, never an unbounded ledger). */
export const BERRY_MEMORY_CAP = 32

/**
 * Record one bush sighting into the scout's private memory. Dedupe by
 * FLOORED cell (the same bush re-seen updates the timestamp, never grows
 * the book), junk positions are refused, the cap forgets the OLDEST record
 * first. Mutates the passed Map (the wire owns the instance, the tests pass
 * their own) and returns it. Junk memory reads as-is (the no-op).
 */
export function recordBush (memory, pos, { now = Date.now(), cap = BERRY_MEMORY_CAP } = {}) {
  if (!(memory instanceof Map)) return memory
  if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.y) || !Number.isFinite(pos.z)) return memory
  const key = `${Math.floor(pos.x)},${Math.floor(pos.y)},${Math.floor(pos.z)}`
  memory.set(key, { pos: { x: Math.floor(pos.x), y: Math.floor(pos.y), z: Math.floor(pos.z) }, at: now })
  if (memory.size > cap) {
    let oldestKey = null
    let oldestAt = Infinity
    for (const [k, v] of memory) {
      if ((v?.at ?? 0) < oldestAt) {
        oldestAt = v.at
        oldestKey = k
      }
    }
    if (oldestKey) memory.delete(oldestKey)
  }
  return memory
}

/**
 * The famine walk's target: the NEAREST remembered bush inside the walk
 * envelope. Junk-safe end to end: no memory, an empty book, a junk `here`,
 * junk entries - all read null (the walk never arms on junk). Ties keep the
 * FIRST record (deterministic - the memory's own order). Returns
 * { key, pos, dist } or null; pos is the FLOORED cell (the record's own
 * shape - the wire re-wraps it in a Vec3).
 */
export function famineWalkPlan ({ memory = null, here = null, cap = BERRY_WALK_CAP } = {}) {
  if (!(memory instanceof Map) || memory.size === 0) return null
  if (!here || !Number.isFinite(here.x) || !Number.isFinite(here.y) || !Number.isFinite(here.z)) return null
  const c = Number(cap)
  let best = null
  let bestDist = Infinity
  for (const [key, r] of memory) {
    const p = r?.pos
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) continue
    const d = Math.hypot(p.x - here.x, p.y - here.y, p.z - here.z)
    if (!Number.isFinite(d) || !Number.isFinite(c) || d > c || d >= bestDist) continue
    best = { key, pos: p, dist: d }
    bestDist = d
  }
  return best
}
