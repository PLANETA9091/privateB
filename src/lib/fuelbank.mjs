// THE FUEL COMMONS (v0.98.0) - the yard chests fund the smelt legs.
//
// Run86's zero lines named the class three times: bots (F5/F10/F8) stood AT the
// machines with smeltables in the pocket and 'no fuel' - while OTHER bots banked
// their surplus coal into the same yard chests (coal and charcoal are NOT in the
// deposit KEEP list, so the commons exists in every real fleet run; the fleet
// mined 660 coal in run75's era). Nothing ever withdrew from it: deposit.mjs is
// deposit-only, and the smelt leg's pickFuel reads the POCKET only.
//
// THE SLICE: when smeltInventory's pickFuel comes up empty, the leg asks the
// commons BEFORE declaring 'no fuel' - the fuelResupply callback (wired in
// fleet19) walks the nearest yard chests and withdraws a MODEST slice of
// coal/charcoal (cap 6 units, coal preferred, charcoal second - both burn 8
// smelts). The leftover rides the pocket through the leg and the FINAL deposit
// (keep(false)) drains it back to the chests: bank -> withdraw -> burn-or-return
// is a self-healing loop, not a leak.
//
// The window clicks mirror deposit.mjs's hard-won lesson (Chest.deposit/withdraw
// misroute destinations on 26.2's generic_9x3: 8 of 9 moved items landed one past
// the chest range) - every move is our OWN slot arithmetic against the measured
// window view, and the verified inventory diff stays the only truth.
//
// (v0.99.0) THE SWEEP - run89 (35820546630, the commons' first field test) named
// the gap three ways: (1) 'chest holds no fuel' x10 - the yard holds ~50 chests,
// deposits fill them one at a time, the coal chest sits DEEP in the row, and
// maxChests=3 stopped at the nearest cobble - the sweep widens the scan to 8
// chests (still budget-bounded: the loop breaks on remainingMs() <= 0, the walk
// budget still scales with distance). (2) F3 logged SIX identical 'chest holds
// no fuel' lines - every invocation re-walked the SAME empty chests because the
// exclude list was per-invocation; the empty-chest memory (short TTL, per bot)
// skips known-empty chests ACROSS invocations so a repeat ask walks ONWARD.
// (3) F9's chest walks were refused 'doomed goal (ledgered 1s ago)' - other
// bots' failed bank walks poisoned the chest cells, and the commons inherited
// the veto; the first chest walk now re-arms (doomedRearm, the v0.87.0
// shared-destination semantics the bank and furnace walks already use).

// (v0.124.0) THE FUEL ANCHOR - run108 (35919773515, the v0.123.0 fleet) closed
// the loop's last open end: the TITHE now banks (F3:2, F7:8, F16:9 coal, the
// v0.100.0 inflow works) but the coal landed in three bots' NEAREST chests and
// the sweeps never found it - F8 opened 3 chests ('chest holds no fuel' x3),
// F16 banked 9 coal and LATER opened 4 empty chests itself, the fleet took 0
// from the commons while 8 'no fuel' verdicts starved smelt legs. The scatter
// IS the disease: findChest is nearest-first, so tithe coal lands wherever the
// depositing bot stands, thinly spread across ~50 chests. The cure is a
// fleet-wide deterministic FUEL CHEST: pickFuelAnchor picks the yard chest
// nearest the YARD CENTER (coordinates as the tie-break - pure, no comms,
// every bot derives the SAME anchor from the same scan). Two read/write sides
// wire it: (a) deliverFuelTithe - the pocket fuel OVER the FUEL_TITHE_BOUND
// rides to the anchor BEFORE the legacy deposit scatters it (any failure falls
// through to the exact legacy shape); (b) withdrawFuelCommons reads the anchor
// FIRST (scanYardChests + blockAt), then the nearest-first sweep. The commons'
// first open pays fuel; the inflow concentrates; the loop closes.

import pathfinderPkg from 'mineflayer-pathfinder'
import { Vec3 } from 'vec3'
import { gotoSafe, withTimeout } from './jobqueue.mjs'
import { findChest, chestSlotCount, chestWalkBudgetMs, CHEST_DOOM_TTL_MS, YARD_CHEST_RADIUS, CHEST_NAMES, chestNearYard, fuelTitheOverage, FUEL_TITHE_BOUND, walkRawToward } from './deposit.mjs'
import { fuelNeeded, countItem } from './smelting.mjs'
import { approachWalk, PATH_GEOMETRY_RE, nudgeReSegmentPlan, NUDGE_RESEGMENT_FLOOR_MS } from './approach.mjs'
import { chestVerticalDoom, VERTICAL_DOOM_MIN_DY } from './surface.mjs'

const { goals } = pathfinderPkg

// Modesty cap: one withdrawal never strips the commons. fuelNeeded('coal', 48)
// = 6 - the largest smelt plan a 600s run realistically carries.
export const FUEL_WITHDRAW_CAP = 6

// (v0.669.0) THE WITHDRAWAL FLOOR - the 1u-goal miscalibration's own named
// cure. The goal split lens (v0.475.0) asked: do the zero-delivery budgets
// ride TINY goals (raise the floor) or spread across sizes (the chain is
// the lever)? Three faces answered the same way - 24x (face 42), 25 of 34
// (face 43), 30 of 33 = 91% (face 37313831720) - the one-unit goal IS the
// miscalibration: the ask sizes the want to the smelt leg's own deficit
// (fuelNeeded('coal', need) = 1 for need <= 8), so a whole yard walk (the
// approach, the open, the climb) is armed to serve ONE coal, and the walk
// dies in decide/budget more often than it eats. The floor lifts the ask's
// WANT to a small batch so the walk's price amortizes (2 coal = 16 smelts,
// the same walk); the chest's honest stock still bounds the take (a chest
// holding 1 yields 1 - the floor is a want, never a requirement), and the
// modesty cap stays the authority (the floor never exceeds the cap; the
// food commons' full-cap precedent rides - fuel was the only deficit-sized
// ask in the fleet).
export const FUEL_WITHDRAW_FLOOR = 2

/**
 * Pure, junk-safe: the ask's goal units for a smelt need - the deficit
 * sizing raised to the withdrawal floor, capped by the modesty cap. 0 on a
 * junk ask (the caller's own guard owns the no-ask verdict).
 * @param {{itemsNeeded?: number, cap?: number, floor?: number}} opts
 * @returns {number}
 */
export function withdrawGoal ({ itemsNeeded = 0, cap = FUEL_WITHDRAW_CAP, floor = FUEL_WITHDRAW_FLOOR } = {}) {
  const need = Number(itemsNeeded)
  if (!Number.isFinite(need) || need <= 0) return 0
  const capN = Number(cap)
  const capSafe = Number.isFinite(capN) && capN > 0 ? Math.floor(capN) : FUEL_WITHDRAW_CAP
  const floorN = Number(floor)
  const floorSafe = Number.isFinite(floorN) && floorN > 0 ? Math.floor(floorN) : 0
  const want = Math.min(capSafe, Math.max(floorSafe, fuelNeeded('coal', Math.ceil(need))))
  return Number.isFinite(want) && want > 0 ? want : 0
}

// Burn priority: both yield 8 smelts/unit; coal is the deeper stock (mined),
// charcoal the renewable one (a future dedicated leg). Order is policy, not
// physics - tests pin it.
export const FUEL_COMMON_ORDER = ['coal', 'charcoal']

// (v0.99.0) How many yard chests ONE resupply ask may walk through. run89: the
// deposits fill the ~50-chest yard one chest at a time, so the fuel sits deep
// in the row; 3 nearest misses proved nothing. 8 with the SAME budget: the
// loop still breaks on remainingMs() <= 0, so a far commons costs nothing
// extra when the walk slice is already spent.
export const COMMONS_SWEEP_CHESTS = 8

// (v0.99.0) The empty-chest memory's lifetime. SHORT on purpose: the commons
// refills continuously (other bots' deposits, the final deposit's leftover
// drain-back), so a chest empty at t-200s may hold coal at t-100s - the memory
// must not outlive the world it describes.
export const COMMONS_EMPTY_TTL_MS = 90000

/** (v0.128.0) THE ANCHOR FRESH WINDOW. The 90s empty memory exists so a
 * repeat ask walks ONWARD instead of re-walking known-empty chests - but the
 * anchor is THE tithe's dedicated target, the one yard chest that REFILLS
 * between two asks (run525: the tithe's 11+7 coal landed while the sweeps
 * starved, and 0 'anchor chest is read first' lines all run). A chest this
 * bot saw empty a minute ago must not un-anchor the read: 15s (the doom
 * half-life cadence) is the honest window - fresh enough to skip a chest
 * seen empty JUST now, old enough that the tithe's refill re-opens it. */
export const ANCHOR_FRESH_EMPTY_MS = 15000

/** (v0.128.0) Pure-ish, junk-safe: the remembered-empty cells for `name`
 * observed within the last `freshMs` (the LIVE expiry contract is unchanged:
 * expired entries are pruned in place). An entry recorded at r with the full
 * ttl reads fresh iff (expiry - now) >= (fullTtl - freshMs). Unknown/junk
 * name reads as an empty array; the shape mirrors liveEmptyCells exactly. */
export function freshEmptyCells (memory, name, now, freshMs = ANCHOR_FRESH_EMPTY_MS, fullTtlMs = COMMONS_EMPTY_TTL_MS) {
  if (!memory || typeof memory !== 'object') return []
  if (typeof name !== 'string' || name.length === 0) return []
  const bucket = memory[name]
  if (!(bucket instanceof Map)) return []
  const t = Number(now)
  if (!Number.isFinite(t)) return []
  const fresh = Number.isFinite(freshMs) && freshMs >= 0 ? freshMs : ANCHOR_FRESH_EMPTY_MS
  const full = Number.isFinite(fullTtlMs) && fullTtlMs >= 0 ? fullTtlMs : COMMONS_EMPTY_TTL_MS
  const floor = full - fresh
  const out = []
  for (const [key, expiry] of bucket) {
    if (!Number.isFinite(expiry) || expiry <= t) { bucket.delete(key); continue }
    if (expiry - t < floor) continue // observed longer than freshMs ago - not the anchor's problem
    const [x, y, z] = key.split(',').map(s => Number(s))
    if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) out.push({ x, y, z })
  }
  return out
}

/** (v0.99.0) A fresh per-fleet empty-chest memory: { [botName]: Map('x,y,z' ->
 * expiryMs) }. Plain object, no clock reads at construction. */
export function newCommonsMemory () {
  return {}
}

/** Pure-ish, junk-safe: record that `cell` was opened and held no fuel for
 * `name` at `now`. Junk memory/name/cell is a no-op; re-remembering a live
 * cell refreshes its clock (the newest observation owns the expiry). */
export function rememberEmptyChest (memory, name, cell, now, ttlMs = COMMONS_EMPTY_TTL_MS) {
  if (!memory || typeof memory !== 'object') return false
  if (typeof name !== 'string' || name.length === 0) return false
  if (!cell || typeof cell !== 'object') return false
  const x = Number(cell.x)
  const y = Number(cell.y)
  const z = Number(cell.z)
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return false
  const t = Number(now)
  if (!Number.isFinite(t)) return false
  const ttl = Number.isFinite(ttlMs) && ttlMs >= 0 ? ttlMs : COMMONS_EMPTY_TTL_MS
  let bucket = memory[name]
  if (!(bucket instanceof Map)) { bucket = new Map(); memory[name] = bucket }
  bucket.set(`${Math.floor(x)},${Math.floor(y)},${Math.floor(z)}`, t + ttl)
  return true
}

/** Pure-ish, junk-safe: the LIVE remembered cells for `name` at `now` -
 * expired entries are pruned in place (the bucket never grows unbounded),
 * the returned cells are fresh plain {x,y,z} objects safe to push into a
 * findChest exclude list. Unknown/junk name reads as an empty array. */
export function liveEmptyCells (memory, name, now) {
  if (!memory || typeof memory !== 'object') return []
  if (typeof name !== 'string' || name.length === 0) return []
  const bucket = memory[name]
  if (!(bucket instanceof Map)) return []
  const t = Number(now)
  if (!Number.isFinite(t)) return []
  const out = []
  for (const [key, expiry] of bucket) {
    if (!Number.isFinite(expiry) || expiry <= t) { bucket.delete(key); continue }
    const [x, y, z] = key.split(',').map(s => Number(s))
    if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) out.push({ x, y, z })
  }
  return out
}

// (v0.506.0) THE ASK BACKOFF CORE - the dry stance's throttle. The commons
// ledger priced the repeat-ask churn (53 asks / 0 delivered / every ask's next
// line the coal skip): the climb fund (v0.504.0) stops the WALKS, the backoff
// stops the RE-ASK from a stance the sweep already proved dry - the scan+open
// churn bought a second time per leg bought nothing (geometry does not move in
// 45s). The state rides the same per-fleet commons memory object under a
// `__dry:` namespace - the empty-chest buckets (memory[name] Maps) are never
// touched, the two lanes co-exist on one object.
export const ASK_BACKOFF_TTL_MS = 45000

const dryKey = name => `__dry:${name}`

/** Pure-ish, junk-safe: remember that `name`'s ask from floored cell `pos`
 * came up dry at `now` - the stance defers re-asks until now + ttlMs. A newer
 * observation of the same stance owns the clock (overwrite). */
export function rememberDryStance (memory, name, pos, now, ttlMs = ASK_BACKOFF_TTL_MS) {
  if (!memory || typeof memory !== 'object') return false
  if (typeof name !== 'string' || name.length === 0) return false
  if (!pos || typeof pos !== 'object') return false
  const x = Number(pos.x)
  const y = Number(pos.y)
  const z = Number(pos.z)
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return false
  const t = Number(now)
  if (!Number.isFinite(t)) return false
  const ttl = Number.isFinite(ttlMs) && ttlMs >= 0 ? ttlMs : ASK_BACKOFF_TTL_MS
  memory[dryKey(name)] = { x: Math.floor(x), y: Math.floor(y), z: Math.floor(z), untilMs: t + ttl, storedAt: t }
  return true
}

/** Pure-ish, junk-safe: is `name`'s ask from cell `pos` deferred at `now`?
 * Returns { ageMs } for a LIVE dry stance at the SAME floored cell (the caller
 * names the age), false for any junk/expired/MOVED shape - an expired record is
 * pruned in place, a moved bot re-arms the ask (the vertical gate's own law:
 * the next ask runs from wherever the bot then stands). */
export function dryStanceDeferred (memory, name, pos, now) {
  if (!memory || typeof memory !== 'object') return false
  if (typeof name !== 'string' || name.length === 0) return false
  if (!pos || typeof pos !== 'object') return false
  const x = Number(pos.x)
  const y = Number(pos.y)
  const z = Number(pos.z)
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return false
  const t = Number(now)
  if (!Number.isFinite(t)) return false
  const rec = memory[dryKey(name)]
  if (!rec || typeof rec !== 'object') return false
  if (rec.x !== Math.floor(x) || rec.y !== Math.floor(y) || rec.z !== Math.floor(z)) return false
  if (!Number.isFinite(rec.untilMs) || rec.untilMs <= t) { delete memory[dryKey(name)]; return false }
  const age = t - Number(rec.storedAt)
  return { ageMs: Number.isFinite(age) && age >= 0 ? age : 0 }
}

/** Pure-ish, junk-safe: the stance DELIVERED - the backoff re-arms. Returns
 * whether a record actually existed (a second clear is an honest no-op false). */
export function clearDryStance (memory, name) {
  if (!memory || typeof memory !== 'object') return false
  if (typeof name !== 'string' || name.length === 0) return false
  const had = Object.prototype.hasOwnProperty.call(memory, dryKey(name))
  delete memory[dryKey(name)]
  return had
}

// (v0.509.0) THE REFILL TIDINGS - the deposit side of the backoff. The ask
// backoff (v0.506.0) defers a re-ask from a proven-dry stance for
// ASK_BACKOFF_TTL_MS - the honest cure for the repeat-ask churn. But the clock
// is the ONLY re-arm that doesn't need the asker itself to move or deliver:
// when the tithe lands fuel in a chest, the diggers whose stances stand within
// reach keep deferring for the FULL ttl even though the refill just arrived at
// their depth - the sweep's own clear (taken > 0) can only free the SWEEPING
// bot. The tidings close the loop: a funded chest un-defers every dry stance
// within DRY_REARM_RADIUS (the near-window scale the sub-doom gate already
// uses - anchorSubDoom's lateral bound). The radius IS the scope law: a yard
// deposit 20-37 levels above the diggers' stances fails the distance test on
// its own, no band check needed - and an over-generous re-arm costs nothing
// dishonest, the re-armed ask re-fires into the EXISTING gates (the vertical
// gate, the climb fund) which refuse a doomed walk and a fresh zero re-arms a
// fresh dry stance. Silent state hygiene (the clearDryStance law - no log
// line, no filter key). Junk-safe end to end: a null memory, a junk position
// or a junk radius touch nothing; a junk-shaped record is skipped; the chest
// buckets and the __low: lane are never read as stances. The count is the
// number of records physically cleared (an expired record counts too - it is
// state the lane no longer needs).
export const DRY_REARM_RADIUS = 24

export function rearmDryNear (memory, pos, radius = DRY_REARM_RADIUS) {
  if (!memory || typeof memory !== 'object') return 0
  if (!pos || typeof pos !== 'object') return 0
  const x = Number(pos.x)
  const y = Number(pos.y)
  const z = Number(pos.z)
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return 0
  const r = Number(radius)
  const rad = Number.isFinite(r) && r >= 0 ? r : DRY_REARM_RADIUS
  const rad2 = rad * rad
  let cleared = 0
  for (const key of Object.keys(memory)) {
    if (typeof key !== 'string' || !key.startsWith('__dry:')) continue
    const rec = memory[key]
    if (!rec || typeof rec !== 'object') continue
    const rx = Number(rec.x)
    const ry = Number(rec.y)
    const rz = Number(rec.z)
    if (!Number.isFinite(rx) || !Number.isFinite(ry) || !Number.isFinite(rz)) continue
    const dx = rx - Math.floor(x)
    const dy = ry - Math.floor(y)
    const dz = rz - Math.floor(z)
    if (dx * dx + dy * dy + dz * dz <= rad2) { delete memory[key]; cleared++ }
  }
  return cleared
}

// (v0.510.0) THE FUNDED FORGET - the tidings' sibling on the OTHER memory lane.
// The sweep pre-excludes remembered-empty chests for the full COMMONS_EMPTY_TTL_MS
// (90s) - the honest anti-churn law (run89: 'chest holds no fuel' x6, the same
// chests every time). But when the tithe lands fuel in a chest, every bot's
// emptiness claim on it becomes a LIE the sweep keeps believing: the 0.509.0
// tidings re-armed the dry stances, the ask re-fired - and the sweep still
// walked PAST the funded chest, excluded for a 90s clock nobody re-read. The
// forget closes that seam: a funded chest erases the emptiness claims within
// the SAME DRY_REARM_RADIUS reach (the two laws must agree - a re-armed ask
// whose sweep still excludes the funded chest would buy the churn the backoff
// just paid to stop). The news is for EVERYONE: the buckets are per-bot, but
// the lie is the same lie, so every name's bucket is walked. The __dry: and
// __low: lanes are never read as buckets (the keys starting with __ belong to
// other laws - the tidings' rearm owns the dry lane). Churn-safe by scope: the
// forget fires ONLY on a real deposit (delivered > 0), so the re-walk it
// enables is the walk that pays; genuinely-empty chests outside the radius
// keep their memory. The count is the number of emptiness claims physically
// erased (expired claims count too - the claim is false either way). Silent
// state hygiene (the clearDryStance law - no log line, no filter key).
export function forgetEmptyNear (memory, pos, radius = DRY_REARM_RADIUS) {
  if (!memory || typeof memory !== 'object') return 0
  if (!pos || typeof pos !== 'object') return 0
  const x = Number(pos.x)
  const y = Number(pos.y)
  const z = Number(pos.z)
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return 0
  const r = Number(radius)
  const rad = Number.isFinite(r) && r >= 0 ? r : DRY_REARM_RADIUS
  const rad2 = rad * rad
  let cleared = 0
  for (const key of Object.keys(memory)) {
    if (typeof key === 'string' && key.startsWith('__')) continue
    const bucket = memory[key]
    if (!(bucket instanceof Map)) continue
    for (const [cellKey, expiry] of bucket) {
      const [cx, cy, cz] = String(cellKey).split(',').map(s => Number(s))
      if (!Number.isFinite(cx) || !Number.isFinite(cy) || !Number.isFinite(cz)) continue
      const dx = cx - Math.floor(x)
      const dy = cy - Math.floor(y)
      const dz = cz - Math.floor(z)
      if (dx * dx + dy * dy + dz * dz <= rad2) { bucket.delete(cellKey); cleared++ }
    }
  }
  return cleared
}

// (v0.507.0) THE GRAVITY STASH CORE - the low-chest registry. The dead letter
// box's REAL cure priced twice (the commons ledger v0.502.0, the climb fund
// v0.504.0): the tithe banks the fleet's coal at a yard 20-37 levels ABOVE the
// asking diggers - no inflow ever reaches depth. The registry remembers the
// chests SEEN at digger depth (the doom band's own floor below the yard) so
// the tithe's delivery can PREFER them - the fuel moves to where the asks come
// from. The band reuses VERTICAL_DOOM_MIN_DY (the surface.mjs export, no
// duplicated constant): a chest at the floor or deeper BELOW the yard is
// descent-class (the climb fund's own law - gravity assists, the gates never
// refuse it). Lives under a __low: key on the same per-fleet commons memory
// object - the empty-chest buckets and the __dry: backoff lane are never
// touched. DISCOVERY-CONFIRMED ONLY: a cell enters from a chest actually
// OPENED (the sweep's opened-chest path) or SCANNED (the tithe's own scan) -
// the preference re-ranks scan-confirmed chests, it never injects a cell the
// walk cannot honestly target.
export const LOW_CHEST_TTL_MS = 600000
export const LOW_CHEST_CAP = 16

const lowKey = '__low:cells'

/** Pure-ish, junk-safe: remember a chest cell in the diggers' band (yardY - y
 * >= VERTICAL_DOOM_MIN_DY). A yard-level or above chest reads false (the
 * anchor's own business); junk reads false; re-remembering refreshes the
 * clock (the newest observation owns both the expiry and the insertion
 * order); the bucket caps at LOW_CHEST_CAP (the oldest cell falls off). */
export function rememberLowChest (memory, cell, yardY, now, ttlMs = LOW_CHEST_TTL_MS) {
  if (!memory || typeof memory !== 'object') return false
  if (!cell || typeof cell !== 'object') return false
  const x = Math.floor(Number(cell.x))
  const y = Math.floor(Number(cell.y))
  const z = Math.floor(Number(cell.z))
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return false
  const yy = Number(yardY)
  if (!Number.isFinite(yy)) return false
  if (yy - y < VERTICAL_DOOM_MIN_DY) return false // the diggers' band only
  const t = Number(now)
  if (!Number.isFinite(t)) return false
  const ttl = Number.isFinite(ttlMs) && ttlMs >= 0 ? ttlMs : LOW_CHEST_TTL_MS
  let bucket = memory[lowKey]
  if (!(bucket instanceof Map)) { bucket = new Map(); memory[lowKey] = bucket }
  const key = `${x},${y},${z}`
  bucket.delete(key)
  bucket.set(key, t + ttl)
  while (bucket.size > LOW_CHEST_CAP) {
    const oldest = bucket.keys().next().value
    bucket.delete(oldest)
  }
  return true
}

/** Pure-ish, junk-safe: the LIVE low cells at `now` - expired entries are
 * pruned in place, the returned cells are fresh plain {x,y,z} objects safe
 * to hand pickFuelAnchor. Junk reads an empty array. */
export function liveLowCells (memory, now) {
  if (!memory || typeof memory !== 'object') return []
  const bucket = memory[lowKey]
  if (!(bucket instanceof Map)) return []
  const t = Number(now)
  if (!Number.isFinite(t)) return []
  const out = []
  for (const [key, expiry] of bucket) {
    if (!Number.isFinite(expiry) || expiry <= t) { bucket.delete(key); continue }
    const [x, y, z] = key.split(',').map(s => Number(s))
    if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) out.push({ x, y, z })
  }
  return out
}

// (v0.124.0) THE FUEL ANCHOR CORE - a fleet-wide deterministic fuel chest.
// Pure, junk-safe, communication-free: every bot that scans the same yard
// derives the SAME anchor (distance to the yard center is the primary key,
// the floored coordinates are the tie-break), so the tithe's inflow and the
// commons' first read meet at one chest without a single chat packet.
const isChestName = name => (Array.isArray(CHEST_NAMES) && CHEST_NAMES.includes(name)) || (typeof name === 'string' && /_chest$/.test(name))

export function pickFuelAnchor (chests, yardCenter, lowCells = null) {
  if (!Array.isArray(chests)) return null
  let cx = null; let cy = null; let cz = null
  if (yardCenter && typeof yardCenter === 'object') {
    const nx = Number(yardCenter.x); const ny = Number(yardCenter.y); const nz = Number(yardCenter.z)
    if (Number.isFinite(nx) && Number.isFinite(ny) && Number.isFinite(nz)) { cx = nx; cy = ny; cz = nz }
  }
  const hasCenter = cx !== null
  // (v0.507.0) THE GRAVITY PREFERENCE: a scan-confirmed chest at digger depth
  // (a live low cell) owns the delivery BEFORE the yard's nearest - the tithe
  // moves to where the asks come from. Among the low candidates the SAME
  // nearest-center arithmetic picks (the determinism law rides inside the
  // preference); an empty registry or no scan match keeps the legacy pick
  // byte for byte (lowCells stays null - every existing caller and test).
  const lowSet = Array.isArray(lowCells) && lowCells.length > 0
    ? new Set(lowCells.filter(c => c && typeof c === 'object').map(c => `${Math.floor(Number(c.x))},${Math.floor(Number(c.y))},${Math.floor(Number(c.z))}`))
    : null
  let best = null
  let bestLow = null
  for (const p of chests) {
    if (!p || typeof p !== 'object') continue
    const x = Math.floor(Number(p.x))
    const y = Math.floor(Number(p.y))
    const z = Math.floor(Number(p.z))
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue
    const d = hasCenter
      ? (x - cx) * (x - cx) + (y - cy) * (y - cy) + (z - cz) * (z - cz)
      : 0
    if (lowSet) {
      const closerL = bestLow == null || d < bestLow.d
      const tieL = bestLow != null && d === bestLow.d &&
        (x < bestLow.x || (x === bestLow.x && (y < bestLow.y || (y === bestLow.y && z < bestLow.z))))
      if (lowSet.has(`${x},${y},${z}`) && (closerL || tieL)) bestLow = { x, y, z, d }
    }
    const closer = best == null || d < best.d
    const tie = best != null && d === best.d &&
      (x < best.x || (x === best.x && (y < best.y || (y === best.y && z < best.z))))
    if (closer || tie) best = { x, y, z, d }
  }
  const chosen = bestLow ?? best
  if (!chosen) return null
  return { x: chosen.x, y: chosen.y, z: chosen.z }
}

/** (v0.124.0) Scan the yard for chest positions - the anchor's candidate list.
 * The palette-candidate rule rides here too (a positionless probe block is a
 * CANDIDATE: the real per-block filter re-runs with true positions). Never
 * throws: a missing findBlocks, a throw, a junk return all read as an EMPTY
 * scan (the caller falls back to the legacy nearest-first shape).
 * (v0.128.0) THE SCAN RETRY: one attempt per findBlocks call was the findChest
 * v0.38.0 lesson UNLEARNED - a transient palette desync under 19-bot load threw
 * and the bare catch read an EMPTY scan, killing the anchor for that ask with
 * no line and no retry (run525: 0 'anchor chest is read first' lines all run
 * while the same loop's findChest opened chest after chest). TWO attempts, the
 * swallow names itself (bot position included, the v0.38.0 shape).
 * (v0.130.0) THE EMPTY-RETURN RETRY: run536 measured the desync's SECOND face -
 * 16/16 anchor scans returned an EMPTY ARRAY (not a throw), 0 swallow lines all
 * run, while the same loop's findChest (bot.findBlock, singular) kept finding
 * and opening yard chests in the same window - the retry above covered only the
 * THROW class, so the empty return killed the anchor silently (0 'the anchor
 * chest is read first' lines across run525/530/536: the anchor has never once
 * delivered in the field). An empty result now re-queries once; EVERY empty
 * names itself (the throw shape's 'BOTH attempts named themselves').
 * (v0.133.0) THE SINGULAR PROBE RESCUE: run546 named the retry's limits - F5
 * stood AT the yard, the anchor scans returned empty 2/2 TWICE (the tithe path
 * and the commons' anchor read), and seconds later the SAME bot's findChest
 * found and OPENED a chest ('chest holds no fuel') and the findChest-based
 * deposit banked +154. Same bot, same minute, same yard: the plural scan
 * (bot.findBlocks, count 256) lies empty while the singular find (bot.findBlock,
 * the engine's own count-1 shape) works - the field has never shown the
 * reverse. So after BOTH attempts read empty, the scan falls back to the
 * PROVEN shape: one findChest probe (the same engine path that opens yard
 * chests all run long); its chest becomes a one-cell list and the anchor
 * finally has a target. Every rescue names itself, a rescue-less empty keeps
 * the honest [], the probe's throw is swallowed (the rescue never kills the
 * scan), and the empty line now carries the bot's position + the yard distance
 * so the next mine can split the range face (bot 64+ blocks out) from the
 * engine face (empty at the yard) at a glance.
 *
 * (v0.350.0) THE PROBE RIDES FIRST - three faces named the split unanimous
 * (36700431959/36706516734/36710193486: 122 empty-return events; the singular
 * probe rescued 122/122; the second plural attempt answered 0/122 - never
 * once, not one chest). The re-query that never worked does not ride between
 * the lie and the proven shape: after attempt 1's named empty the probe runs
 * IMMEDIATELY, and the second plural attempt survives as the last resort
 * behind it (the transient-throw classes keep today's path byte for byte -
 * a throw is a different face and keeps the re-query). */
export function scanYardChests (bot, { yardCenter = null, maxDistance = 64, radius = YARD_CHEST_RADIUS, log = () => {} } = {}) {
  // (v0.350.0) THE PROBE CELL - one singular findChest probe (the field's
  // proven count-1 shape), shared by the between-attempts ride and the
  // last-resort rescue. Junk-safe: a throw or a junk position reads null and
  // the caller's honest face stands.
  const probeCell = () => {
    try {
      const rescue = findChest(bot, { maxDistance, yardCenter, yardRadius: radius, log })
      if (!rescue || !rescue.position) return null
      const x = Math.floor(Number(rescue.position.x))
      const y = Math.floor(Number(rescue.position.y))
      const z = Math.floor(Number(rescue.position.z))
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null
      return { x, y, z }
    } catch { return null }
  }
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      if (typeof bot?.findBlocks !== 'function') return []
      const raw = bot.findBlocks({
        matching: b => {
          if (!b) return false
          if (!isChestName(b.name)) return false
          if (!b.position) return true // the palette candidate rule (v0.43.0)
          return chestNearYard({ chestPos: b.position, yardCenter, radius })
        },
        maxDistance,
        count: 256
      })
      if (!Array.isArray(raw)) raw = [] // (v0.133.0) a junk return joins the empty face - the retry and the rescue both apply
      const out = []
      for (const b of raw) {
        if (!b || !b.position) continue
        const x = Math.floor(Number(b.position.x))
        const y = Math.floor(Number(b.position.y))
        const z = Math.floor(Number(b.position.z))
        if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) out.push({ x, y, z })
      }
      // (v0.130.0) the empty return is the desync's SILENT face - re-query once,
      // every empty names itself (a legit empty pays one extra bounded query;
      // the yard is known to hold dozens of chests, an empty is a lie until
      // proven twice). (v0.133.0) the empty line carries the bot's position and
      // the yard distance - run546 could not tell '64 too small from the wild'
      // from 'empty at the yard'; the next mine can.
      if (out.length === 0) {
        const at = yardWhere(bot, yardCenter)
        try { log(`fuel anchor scan returned empty (attempt ${attempt}/2)${at}${attempt === 1 ? ' - the palette empty-return class, the singular probe rides first' : ''}`) } catch { /* log never kills a scan */ }
        if (attempt === 1) {
          // (v0.350.0) THE PROBE RIDES FIRST - the field's unanimous split
          // (faces 36700431959/36706516734/36710193486: 122 empty-return
          // events; the probe rescued 122/122; the second plural attempt
          // answered 0/122): the probe runs NOW, one wasted count-256
          // re-query saved per event, and the second plural attempt rides
          // LAST (the transient-throw classes keep today's path byte for
          // byte - a throw is a different face and keeps the re-query).
          const cell = probeCell()
          if (cell) {
            try { log(`fuel anchor scan: the palette read empty x1 - the singular probe rescued the scan (chest at [${cell.x},${cell.y},${cell.z}])`) } catch { /* log never kills a scan */ }
            return [cell]
          }
          try { log('fuel anchor scan: the singular probe found nothing after the palette empty-return - the second plural attempt rides last') } catch { /* log never kills a scan */ }
          continue
        }
        break // (v0.133.0) both plural attempts read empty - fall through to the singular probe rescue
      }
      return out
    } catch (e) {
      const at = (() => {
        try {
          const p = bot?.entity?.position
          return p && Number.isFinite(p.x) ? ` at [${Math.round(p.x)},${Math.round(p.y)},${Math.round(p.z)}]` : ''
        } catch { return '' }
      })()
      try { log(`fuel anchor scan swallowed: ${e?.message || e}${at} (attempt ${attempt}/2)`) } catch { /* log never kills a scan */ }
    }
  }
  // (v0.133.0) THE SINGULAR PROBE RESCUE - the loop's last resort: both plural
  // attempts are spent (or threw) and the field says the singular shape still
  // works in that exact window (F5, run546: scans 0/0, findChest open + bank
  // +154 seconds later). One probe, the proven path; its chest is a one-cell
  // list, the anchor walk and the tithe deposit run unchanged from there.
  // (v0.350.0) the same probe already rode between the attempts - reaching
  // here means it found nothing there either; the honest empty stands.
  const cell = probeCell()
  if (cell) {
    try { log(`fuel anchor scan empty x2 - the singular probe rescued the scan (chest at [${cell.x},${cell.y},${cell.z}])`) } catch { /* log never kills a scan */ }
    return [cell]
  }
  try { log('fuel anchor scan empty x2 - the singular probe found nothing either') } catch { /* log never kills a scan */ }
  return []
}

/** (v0.133.0) Pure-ish, junk-safe: where the bot stands relative to the yard,
 * for the scan's named-empty line. '' when either position is unreadable (the
 * legacy bare shape), ' at [x,y,z] yard d=N' otherwise. */
function yardWhere (bot, yardCenter) {
  try {
    const p = bot?.entity?.position
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) return ''
    const at = ` at [${Math.round(p.x)},${Math.round(p.y)},${Math.round(p.z)}]`
    if (!yardCenter || !Number.isFinite(yardCenter.x) || !Number.isFinite(yardCenter.y) || !Number.isFinite(yardCenter.z)) return at
    const dx = p.x - yardCenter.x
    const dy = p.y - yardCenter.y
    const dz = p.z - yardCenter.z
    return `${at} yard d=${Math.round(Math.sqrt(dx * dx + dy * dy + dz * dz))}`
  } catch { return '' }
}

/** (v0.124.0) The anchor chest as a real Block for openChest, or null. The
 * remembered-empty cells (the sweep memory) are pre-excluded so the anchor
 * read never re-walks a chest this bot just saw empty.
 * (v0.128.0) the caller passes the FRESH empty cells only (freshEmptyCells,
 * ANCHOR_FRESH_EMPTY_MS) - a chest this bot saw empty a minute ago must not
 * un-anchor the read, because the anchor is the one chest the tithe REFILLS.
 * Every null exit NAMES itself (the smelt-zero honesty shape): the next run's
 * mine reads the exit distribution instead of inferring it. */

// (v0.159.0) THE CHEST COVER PLAN - the pure gate for the open-timeout cure.
// run557 (36063283715, the union composite's field test) measured the fuel
// rung's interaction layer dying under walks that NOW LAND: F12 walked to the
// anchor chest (the close shot landed the re-goto) and the open timed out x4
// (10s each = 80s of budget burned), 'budget spent (0/4 units)'; the fleet
// took ZERO fuel from chests all run while the tithe had banked 12+ coal into
// the anchor. The classic vanilla shape: a chest with a SOLID block above it
// (usually another bot standing... no - a placed/dug block) cannot open, and
// the openChest timeout is its only symptom. Junk-safe: a non-timeout error,
// a far bot, an unreadable/open/fluid cell above, or another chest above all
// stand down (the dig must never eat fleet stock or flood the yard).
export const CHEST_OPEN_DIG_MAX_DIST = 4
const OPEN_AIR_NAMES = new Set(['air', 'cave_air', 'void_air'])

export function chestCoverPlan ({ openError = '', dist = null, aboveName = null, retries = 0 } = {}) {
  if (retries > 0) return { dig: false, why: 'the cover dig is a one-shot' }
  if (!/timeout/i.test(String(openError || ''))) return { dig: false, why: 'the error is not an open timeout' }
  const d = Number.isFinite(dist) && dist >= 0 ? dist : null
  if (d == null || d > CHEST_OPEN_DIG_MAX_DIST) return { dig: false, why: 'not at the chest' }
  const name = typeof aboveName === 'string' && aboveName ? aboveName : null
  if (!name) return { dig: false, why: 'the cell above is unreadable' }
  if (OPEN_AIR_NAMES.has(name)) return { dig: false, why: 'the cell above is open - not a blocked top' }
  if (/water|lava/i.test(name)) return { dig: false, why: 'fluid above - not a diggable cover' }
  if (/chest|shulker/i.test(name)) return { dig: false, why: 'another chest sits above - never dig fleet stock' }
  return { dig: true, why: `${name} sits on the chest - the cover dig opens it` }
}

/**
 * (v0.159.0) The mechanical cover dig: read the cell above the chest, consult
 * chestCoverPlan, dig the cover, return whether the open may be retried.
 * NEVER THROWS - a failed read/dig just stands the cure down (the caller's
 * legacy shape runs unchanged).
 */
async function digChestCover (bot, chestPos, openError, log, label = 'fuel chest') {
  const dist = (() => { try { return bot.entity.position.distanceTo(new Vec3(chestPos.x, chestPos.y, chestPos.z)) } catch { return null } })()
  const aboveBlock = (() => { try { return bot.blockAt(new Vec3(chestPos.x, chestPos.y + 1, chestPos.z)) } catch { return null } })()
  const plan = chestCoverPlan({ openError: openError?.message || openError, dist, aboveName: aboveBlock ? aboveBlock.name : null })
  if (!plan.dig) {
    log(`${label}: the cover dig stands down (${plan.why})`)
    return false
  }
  const t0 = Date.now()
  try {
    await withTimeout(bot.dig(aboveBlock), 8000, 'dig the chest cover')
  } catch (e) {
    log(`${label}: the cover dig failed (${e?.message || e})`)
    return false
  }
  log(`${label}: the cover dug (${plan.why}, ${((Date.now() - t0) / 1000).toFixed(1)}s) - retrying the open`)
  return true
}

function anchorChestBlock (bot, { yardCenter, radius, maxDistance, exclude, memory = null, log = () => {} }) {
  try {
    const cells = scanYardChests(bot, { yardCenter, radius, maxDistance, log })
    const usable = cells.filter(p => !exclude.some(e => e && e.x === p.x && e.y === p.y && e.z === p.z))
    // (v0.523.0) THE ASK-SIDE GRAVITY READ: the withdraw side already FEEDS the
    // low-chest registry (the gravity discovery stamps every opened chest) - but
    // its own anchor pick never READ it: the tithe delivered deep (the
    // registry's whole point - the fuel moves to where the asks come from)
    // while the ask still walked to the yard's nearest chest, a 20-37-level
    // climb above the diggers' band the asks come from (the credited machines'
    // smelt chains run at depth - the asks come from the band). The read closes
    // the seam: the SAME scan-confirmed preference the delivery pick uses (it
    // never injects a cell the walk cannot honestly target; the determinism
    // rides inside) re-ranks the ask's anchor, and when the preference actually
    // moves the pick, the ask names it (the field data for the gravity
    // doctrine's ask half - the delivery half already logs its own pick). A
    // null memory or an empty registry reads [] - the legacy pick byte for
    // byte (every existing caller and test holds).
    const lowCells = liveLowCells(memory, Date.now())
    const legacyPick = pickFuelAnchor(usable, yardCenter)
    const anchor = pickFuelAnchor(usable, yardCenter, lowCells)
    if (anchor && legacyPick && (anchor.x !== legacyPick.x || anchor.y !== legacyPick.y || anchor.z !== legacyPick.z)) {
      log(`fuel commons: the low registry re-ranks the anchor - the diggers'-band chest [${anchor.x},${anchor.y},${anchor.z}] is read first (the tithe delivered deep; the ask meets it there)`)
    }
    if (!anchor) {
      log(`fuel commons: the anchor scan saw ${cells.length} chest(s), ${usable.length} usable after the empty memory - no anchor`)
      return null
    }
    const block = typeof bot.blockAt === 'function' ? bot.blockAt(new Vec3(anchor.x, anchor.y, anchor.z)) : null
    if (!block || !isChestName(block.name)) {
      log(`fuel commons: the anchor cell [${anchor.x},${anchor.y},${anchor.z}] reads ${block ? block.name : 'null'} - no anchor`)
      return null
    }
    return block
  } catch (e) {
    log(`fuel commons: the anchor read threw (${e?.message || e}) - no anchor`)
    return null
  }
}

/** (v0.124.0) Pure-ish: the pocket fuel OVER the tithe bound, summed across
 * the FUEL_COMMON_ORDER (coal + charcoal - exact-name matching, so 'coal_ore'
 * never tithes). Junk-safe: a dead inventory reads 0. */
export function fuelPocketOverage (bot) {
  let over = 0
  for (const name of FUEL_COMMON_ORDER) {
    let pocket = 0
    try { pocket = countItem(bot, name) } catch { pocket = 0 }
    over += fuelTitheOverage({ name, pocketCount: pocket })
  }
  return over
}

// (v0.298.0) THE SUB-DOOM BAND - the far-up anchor shape the v0.159.0 strict
// gate's own walkable-band claim misses. Face 36507990221 (the dual-v0.297.0
// tree's first field): F4 stood at [-118,54,443], the anchor chest read at
// [-117,70,407] - dy 16 over ~36b lateral (3D d 39.8) - and the strict gate
// PASSED it (dy 16 < the doom floor 20: 'inside the walkable band'; lateral
// 36 > dy: 'the ladder may route it'). The field disagreed: the decide step
// timed out ('Took to long to decide path to goal!'), the v0.155.0 nudge
// walked one segment without a position delta, the re-issue failed the same
// way, and the tithe's 15s budget died on a walk no path decision would ever
// start. The SAME bot's earlier window disagreed with the doom too - the
// anchor read from d=13, dy 5: walkable, deliverable. THE GATE: the far-up
// band (dy >= 12 up, lateral >= 24b) returns the named skip BEFORE the walk
// burns the budget - the pocket keeps its coal for a window the bot spends
// nearer or lower (the v0.159.0 honest split, one band deeper). The strict
// gate stays byte for byte (dy >= 20 mostly-up stays doom; the near-up shape
// - lateral < 24 - keeps the legacy ladder: a staircase that exists is still
// routable, and the decide class keeps its nudge machinery there). Junk-safe:
// any unreadable position reads no doom - the legacy walk attempt runs byte
// for byte.
export const ANCHOR_SUBDOOM_MIN_DY = 12
export const ANCHOR_SUBDOOM_MIN_LATERAL = 24

export function anchorSubDoom ({ botPos = null, chestPos = null } = {}) {
  try {
    if (!botPos || !chestPos) return { doom: false, why: 'no position read' }
    const y = Number.isFinite(botPos.y) ? botPos.y : null
    const cy = Number.isFinite(chestPos.y) ? chestPos.y : null
    if (y == null || cy == null) return { doom: false, why: 'no vertical read' }
    const dy = cy - y
    if (dy < ANCHOR_SUBDOOM_MIN_DY) return { doom: false, why: `dy ${Math.round(dy)} below the sub-doom floor` }
    const lateral = Math.hypot(botPos.x - chestPos.x, botPos.z - chestPos.z)
    if (!(Number.isFinite(lateral) && lateral >= ANCHOR_SUBDOOM_MIN_LATERAL)) {
      return { doom: false, why: `the anchor stands ${Math.round(dy)} up but only ${Number.isFinite(lateral) ? Math.round(lateral) : '?'}b over - the near ladder may route it` }
    }
    return {
      doom: true,
      dy: Math.round(dy),
      lateral: Math.round(lateral),
      why: `the anchor stands ${Math.round(dy)} up over ${Math.round(lateral)}b lateral`
    }
  } catch {
    return { doom: false, why: 'no position read' }
  }
}

// (v0.504.0) THE CLIMB FUND (the commons' withdraw side) - the clock-honest
// sibling of the anchor's sub-doom. The commons ledger (v0.502.0) priced the
// dead letter box: 60 ask sweeps, ZERO delivered, 49 spent 12s slices - the
// yard's chests stand 20-37 levels ABOVE the asking digger, and the strict
// doom gate (mostly-up, lateral < dy) only catches the near-vertical shapes;
// the lateral-routed band (lateral >= dy, 'the ladder may route it') walked
// anyway and the ask's thin slice never funded the climb (the arrival rate
// priced at zero). The read: a chest in the DOOM BAND (dy >= the same
// VERTICAL_DOOM_MIN_DY the geometry law owns) whose honest dist-scaled walk
// budget exceeds the ask's remaining slice is refused BEFORE the walk burns
// the clock - one named line per ask (the doom skip's shape), the chest
// excluded, the slice returned to the leg that paid for it. The strict doom
// gate stays byte for byte; this read never refuses a slice that CAN fund the
// walk (a rich clock keeps the legacy ladder) and never touches the descent
// class (a chest below reads no climb). Junk-safe: any unreadable clock or
// position read returns null - the legacy walk attempt runs byte for byte.
export function climbFundRefusal ({ dy = null, lateral = null, walkBudgetMs = null, sliceMs = null, minDy = VERTICAL_DOOM_MIN_DY } = {}) {
  const up = Number.isFinite(dy) ? dy : null
  if (up == null || up < minDy) return null // below the band: the geometry law's floor, the legacy walk rides
  const lat = Number.isFinite(lateral) && lateral >= 0 ? lateral : null
  if (lat == null) return null // no lateral read: never guess
  if (lat < up) return null // the strict doom shape - the geometry gate owns it, never a second voice
  const budget = Number.isFinite(walkBudgetMs) && walkBudgetMs > 0 ? walkBudgetMs : null
  const slice = Number.isFinite(sliceMs) && sliceMs > 0 ? sliceMs : null
  if (budget == null || slice == null) return null // no honest read of either clock: no refusal
  if (slice >= budget) return null // the slice funds the climb - the walk proceeds
  return `the yard stands ${Math.round(up)} levels up over ${Math.round(lat)}b lateral - the ladder may route it but the slice cannot fund the climb (the walk asks ${Math.round(budget / 1000)}s, the slice holds ${Math.round(slice / 1000)}s)`
}

// (v0.643.0) THE NUDGE'S OWN FLOOR - the decide-class rescue's honest split.
// The rescue path (the v0.155.0 decide-class nudge + the retry) shares ONE
// slice, and the face (fleet 37233218979, the v0.640.0 tree) measured the
// starvation: F7's nudge walked 13.0s of the 15s slice, the retry read a
// <= 2000ms window and the delivery returned '0 delivered (walk failed ...)'
// with the final leg never funded (F2: the 12.2s nudge left 2.8s for the
// decide class to eat). The nudge's doctrine only needs a CHANGED start (the
// v0.147.0 law); the final leg needs its own honest slice. The split hands
// the leg its floor FIRST and lets the nudge spend only the slice's headroom:
// a slice that cannot fund both stands the nudge down (the line names it)
// and the retry rides the whole remaining slice. Junk-safe: junk reads 0 (the
// nudge stands down, the caller's own gates keep their byte).
export const ANCHOR_NUDGE_LEG_FLOOR_MS = 6000

// (v0.651.0) THE ASK'S OWN FLOOR - the commons chest-hop ladder's twin of the
// v0.643.0 law. The ask side's path-geometry rescue (the v0.147.0 nudge + the
// same-chest retry) read the legacy Math.min(remainingMs(), 15000): a FAT
// slice handed the nudge everything, and the approach's segment - a budget,
// not a wall (the v0.156.0 lesson) - could overrun into BOTH legs' death: the
// v0.156.0 gate denies at <= 2000ms, the v0.597.0 raw hop dies at rem <= 0,
// and the chest is excluded with the rescue never priced (the delivery
// side's measured shape: F7's 13s nudge, the 2s leg - fleet 37233218979).
// THE WIRE: the split caps the nudge at the headroom above the v0.156.0
// gate's own 2000ms WHEN that headroom still funds a real walk (> 1000ms) -
// after any fat-slice nudge the gate passes and the ladder rides with clock.
// A THIN slice keeps the legacy byte (the ternary): the approach's spend is
// geometry-driven (the envelope's 3-tick segment, not the budget), the
// declared envelope is what feeds the v0.597.0 raw hop, and the gate+hop
// structure owns the thin clock honestly (the v0.156.0 named stop). The
// re-segment's second shot (the v0.355.0 falsified-envelope wire) keeps its
// legacy byte - a different seam, unmeasured - and the next face prices it.
export const ANCHOR_ASK_LEG_FLOOR_MS = 2000

export function nudgeLegSplitMs ({ remainingMs = 0, floorMs = ANCHOR_NUDGE_LEG_FLOOR_MS, capMs = 15000 } = {}) {
  const rem = Number.isFinite(remainingMs) && remainingMs > 0 ? Math.floor(remainingMs) : 0
  const floor = Number.isFinite(floorMs) && floorMs > 0 ? Math.floor(floorMs) : 0
  const cap = Number.isFinite(capMs) && capMs > 0 ? Math.floor(capMs) : 15000
  return Math.max(0, Math.min(cap, rem - floor))
}

// (v0.646.0) THE ARRIVAL REACH LAW - the walk's landed verdict and the
// geometry can disagree, and the open's own tax made the lie expensive.
// MEASURED (fleet 37237898451, the v0.642.0 face): F13's arrival seat read
// '0 delivered at arrival (open failed (open fuel anchor: timeout after
// 10000ms))' with 'the opens fired far 1 of 1 - the walk's landed verdict
// lied: the geometry is the front' - the walk resolved while the bot stood
// beyond reach, the 10s open timeout burned on a packet the server never
// had, and the cover dig refused ('not at the chest', the reach's own
// arithmetic). THE LAW: before the first open, MEASURE the bot-chest
// distance; beyond CHEST_OPEN_DIG_MAX_DIST (the codebase's own reach
// number - the cover dig already refuses past it) one bounded re-approach
// rides (the v0.147.0 moved-start machinery); still beyond - the honest
// why returns BEFORE the open (the dist feeds the far lens as before, the
// 10s tax dies). Junk-safe: a junk read rides null - no gate, the legacy
// byte (the open attempt is the floor, never a regression).
export const ANCHOR_ARRIVAL_REAPPROACH_MS = 8000

export function anchorArrivalDist ({ botPos = null, chestPos = null } = {}) {
  const read = v => (v && Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z)) ? v : null
  const b = read(botPos)
  const c = read(chestPos)
  if (!b || !c) return null
  const d = Math.sqrt((b.x - c.x) ** 2 + (b.y - c.y) ** 2 + (b.z - c.z) ** 2)
  return Number.isFinite(d) && d >= 0 ? Math.round(d) : null
}

/**
 * (v0.124.0) THE ANCHOR DELIVERY - the tithe's dedicated inflow. The pocket
 * fuel over FUEL_TITHE_BOUND rides to the fleet's ONE fuel chest BEFORE the
 * legacy deposit scatters it into the nearest chest. Never throws; any
 * failure (no scan, dead walk, dead window, ghost clicks) is NAMED and the
 * caller falls through to the exact legacy shape - the overage then rides
 * the legacy tithe into whatever chest the deposit opens. The verified
 * pocket diff (the mirror read while the window is open - the v0.73.0
 * lesson) stays the only truth.
 */
export async function deliverFuelTithe (bot, {
  yardCenter = null,
  radius = YARD_CHEST_RADIUS,
  maxDistance = 64,
  budgetMs = 15000,
  clickTimeoutMs = 5000,
  memory = null, // (v0.507.0) the shared commons memory - the low-chest registry's feed and read
  deps = {},
  log = () => {}
} = {}) {
  const sleep = deps.sleep ?? (ms => new Promise(r => setTimeout(r, ms)))
  const over = fuelPocketOverage(bot)
  if (!(over > 0)) return { delivered: 0, why: 'no overage' }
  const started = Date.now()
  const remainingMs = () => budgetMs - (Date.now() - started)
  let anchor = null
  try {
    const cells = scanYardChests(bot, { yardCenter, radius, maxDistance, log })
    // (v0.507.0) THE GRAVITY SCAN: the scan's low-band cells feed the
    // registry (band-checked inside rememberLowChest), and the live registry
    // re-ranks the pick - a scan-confirmed low chest owns the delivery before
    // the yard's nearest. The walk, the gates and the deposit ride byte for
    // byte: a descent is gravity-assisted, the vertical and sub-doom gates
    // never refuse a chest below the bot.
    for (const p of (Array.isArray(cells) ? cells : [])) rememberLowChest(memory, p, yardCenter?.y, started)
    anchor = pickFuelAnchor(cells, yardCenter, liveLowCells(memory, started))
  } catch { anchor = null }
  if (!anchor) return { delivered: 0, why: 'no anchor chest' }
  if (yardCenter && Number.isFinite(yardCenter.y) && yardCenter.y - anchor.y >= VERTICAL_DOOM_MIN_DY) {
    log(`fuel anchor: the gravity stash owns the delivery - chest at [${anchor.x},${anchor.y},${anchor.z}] stands ${Math.round(yardCenter.y - anchor.y)} levels below the yard (the diggers reach it by descent)`)
  }
  // (v0.159.0) THE VERTICAL GATE (the tithe): a chest mostly ABOVE the bot is
  // doomed by arithmetic (the run15 anatomy: the yard hill y=82 over bots at
  // y=43-64). The tithe's OWN evidence is the honest split: F18/F3 banked 4+8
  // coal when the walk was routable, while the deep asks burned their 15s
  // budget on guaranteed refusals. The skip returns before the walk - the
  // pocket keeps its coal for a window the bot spends nearer the yard.
  {
    const doom = chestVerticalDoom({ botPos: bot?.entity?.position ?? null, chestPos: anchor })
    if (doom.doom) return { delivered: 0, why: `the vertical gate: ${doom.why} - the walk ladder cannot climb` }
  }
  // (v0.298.0) THE SUB-DOOM GATE - the far-up band (dy >= 12 up, lateral
  // >= 24b) skips the walk BEFORE the decide class burns the tithe's budget;
  // the why rides the caller's existing 'fuel anchor: 0 delivered (...) -
  // the legacy scatter carries the tithe' line (the same filter key - no
  // new key). The near windows own the delivery (the F4 face read: the same
  // anchor delivered from d=13, dy 5).
  {
    const sub = anchorSubDoom({ botPos: bot?.entity?.position ?? null, chestPos: anchor })
    if (sub.doom) return { delivered: 0, why: `the sub-doom gate: ${sub.why} - the near window owns the delivery` }
  }
  let dist = (() => {
    try { return Math.round(bot.entity.position.distanceTo(new Vec3(anchor.x, anchor.y, anchor.z))) } catch { return 8 }
  })()
  try {
    // the anchor walk re-arms (the yard is THE shared destination class -
    // the v0.87.0 semantics the bank, furnace and commons walks already use)
    await gotoSafe(bot, new goals.GoalNear(anchor.x, anchor.y, anchor.z, 2), {
      timeoutMs: Math.max(2000, Math.min(chestWalkBudgetMs(dist), remainingMs())),
      label: 'fuel anchor walk', doomedRearm: true, doomTtl: CHEST_DOOM_TTL_MS
    })
  } catch (e) {
    // (v0.153.0) THE TITHE RETRY: run52 (36038887252, the v0.152.0 fleet)
    // measured the single-shot give-up: 'fuel anchor: 0 delivered (walk
    // failed (walk governor: bot churned 4 goals without progress - fuel
    // anchor walk refused for 4s))' while 35+ coal rode 2 pockets (F10:19,
    // F15:16) and the commons chest read empty ALL RUN - smelted 1 (run87:
    // 25), zero ingots, zero seeds, iron=0. The refusal is TIME-BOXED (4s)
    // and the other walk classes are start-position-dependent (the v0.148.0
    // nudge doctrine - movement is not approach, but a moved start is a NEW
    // start; a re-issue from the identical start is the deterministic
    // re-failure ONLY when nothing moved). ONE retry: wait out a time-boxed
    // refusal, then re-issue from the new start. The budget bounds the
    // second attempt like the first; a second failure reads honestly (the
    // legacy scatter still gets the real try at the next deposit window).
    const msg = String(e?.message || e)
    const refusedFor = msg.match(/refused for (\d+)s/)
    if (refusedFor) {
      const waitMs = Math.min(Number(refusedFor[1]) * 1000 + 500, Math.max(0, remainingMs()))
      if (waitMs > 0) await sleep(waitMs)
    } else if (PATH_GEOMETRY_RE.test(msg)) {
      // (v0.155.0) THE YARD DECIDE-CLASS NUDGE: run92 (36044268292, the
      // v0.153.0 field test) measured the retry re-issuing the decide class
      // from an UNMOVED start x2 - 'F3 fuel anchor: 0 delivered (walk failed
      // (Took to long to decide path to goal!))' twice, the deterministic
      // re-failure the v0.153.0 comment itself warned about ('a re-issue
      // from the identical start is the deterministic re-failure ONLY when
      // nothing moved'). The decide verdicts are about the FAILED START (the
      // v0.147.0 doctrine): before the retry, one bounded approachWalk (the
      // proven segment machinery, the fuel-commons v0.147.0 shape) CHANGES
      // the start, and the re-issue below runs from the new position. The
      // refusal class keeps its wait-out above (the window expiry is a REAL
      // change); the nudge never kills the chain.
      // (v0.643.0) THE NUDGE'S OWN FLOOR: the split reserves the final leg's
      // slice first - the face's starvation shape (the 13s nudge, the 2s leg)
      // cannot return; a starved split stands the nudge down by name and the
      // retry rides the whole remaining slice.
      const nudgeMs = nudgeLegSplitMs({ remainingMs: remainingMs(), floorMs: ANCHOR_NUDGE_LEG_FLOOR_MS })
      if (nudgeMs <= 1000) log(`fuel anchor: the nudge stands down - the slice funds the final leg first (${Math.max(0, Math.round(remainingMs()))}ms left)`)
      if (nudgeMs > 1000) {
        try {
          const n = await approachWalk(bot, { x: anchor.x, y: anchor.y, z: anchor.z }, { budgetMs: nudgeMs, closeShot: true, rawWalk: walkRawToward, log: m => log(`fuel anchor: path nudge ${m}`) }) // (v0.356.0) the raw walker wakes - the side-step ladder was dead here
          log(`fuel anchor: path nudge ${n.walked ? 'inside the direct envelope' : `closed to d=${Number.isFinite(n.d) ? n.d.toFixed(1) : '?'} - retrying from the new start`}`)
        } catch { /* the nudge never kills the chain */ }
        try { dist = Math.round(bot.entity.position.distanceTo(new Vec3(anchor.x, anchor.y, anchor.z))) } catch { /* the stale dist still bounds the retry */ }
      }
    }
    if (remainingMs() > 2000) {
      try {
        await gotoSafe(bot, new goals.GoalNear(anchor.x, anchor.y, anchor.z, 2), {
          timeoutMs: Math.max(2000, Math.min(chestWalkBudgetMs(dist), remainingMs())),
          label: 'fuel anchor walk retry', doomedRearm: true, doomTtl: CHEST_DOOM_TTL_MS
        })
      } catch (e2) {
        return { delivered: 0, why: `walk failed (${e2?.message || e2})` }
      }
    } else {
      return { delivered: 0, why: `walk failed (${msg})` }
    }
  }
  if (remainingMs() <= 0) return { delivered: 0, why: 'budget spent after walk' }
  // (v0.646.0) THE ARRIVAL REACH GATE - the walk's landed verdict gets its
  // geometry read before the open's 10s tax rides a doomed packet: beyond
  // reach one bounded re-approach rides; still beyond - the honest why
  // returns BEFORE the open (the dist feeds the far lens as before).
  {
    const arrivedDist = anchorArrivalDist({ botPos: (() => { try { return bot?.entity?.position ?? null } catch { return null } })(), chestPos: anchor })
    if (arrivedDist != null && arrivedDist > CHEST_OPEN_DIG_MAX_DIST) {
      log(`fuel anchor: the arrival lied (d=${arrivedDist} > ${CHEST_OPEN_DIG_MAX_DIST}) - one bounded re-approach rides`)
      try {
        await approachWalk(bot, { x: anchor.x, y: anchor.y, z: anchor.z }, { budgetMs: Math.min(remainingMs(), ANCHOR_ARRIVAL_REAPPROACH_MS), closeShot: true, rawWalk: walkRawToward, log: m => log(`fuel anchor: arrival re-approach ${m}`) })
      } catch { /* the re-approach never kills the chain */ }
      const dist2 = anchorArrivalDist({ botPos: (() => { try { return bot?.entity?.position ?? null } catch { return null } })(), chestPos: anchor })
      if (dist2 != null && dist2 > CHEST_OPEN_DIG_MAX_DIST) {
        return { delivered: 0, why: `anchor beyond reach (d=${dist2}) - the open never had it`, dist: dist2 }
      }
    }
  }
  let block = null
  try { block = typeof bot.blockAt === 'function' ? bot.blockAt(new Vec3(anchor.x, anchor.y, anchor.z)) : null } catch { block = null }
  if (!block || !isChestName(block.name)) return { delivered: 0, why: 'anchor block unreadable' }
  let window = null
  try {
    window = await withTimeout(bot.openChest(block), 10000, 'open fuel anchor')
  } catch (e) {
    // (v0.159.0) THE COVER DIG: the run557 F12 class - the walk lands (the
    // close shot's re-goto), the open times out, a solid block sits on the
    // chest and vanilla refuses to open it. One bounded dig of the cover,
    // then ONE honest re-open; every other shape keeps the legacy exit.
    // (v0.590.0) THE OPEN'S DIST LENS: every open-failed exit carries the
    // bot-chest distance MEASURED at the failure (the seat's own truth).
    // The face 37169265512 chain: 'the nudge retry landed' then the open's
    // 10s tax then the cover dig's 'not at the chest' - the walk's landed
    // verdict and the geometry can disagree, and nothing measured the seat.
    // The inflow grain reads it: far names the geometry, near names the
    // chest's own refusal. Junk-safe: a failed read rides null (no lens).
    const failDist = (() => { try { return Math.round(bot.entity.position.distanceTo(new Vec3(anchor.x, anchor.y, anchor.z))) } catch { return null } })()
    if (await digChestCover(bot, anchor, e, log, 'fuel anchor')) {
      try { block = typeof bot.blockAt === 'function' ? bot.blockAt(new Vec3(anchor.x, anchor.y, anchor.z)) : null } catch { block = null }
      if (block && isChestName(block.name)) {
        try {
          window = await withTimeout(bot.openChest(block), 10000, 'open fuel anchor (cover dug)')
        } catch (e2) {
          const failDist2 = (() => { try { return Math.round(bot.entity.position.distanceTo(new Vec3(anchor.x, anchor.y, anchor.z))) } catch { return null } })()
          return { delivered: 0, why: `open failed after the cover dig (${e2?.message || e2})`, dist: failDist2 }
        }
      } else {
        return { delivered: 0, why: `open failed and the anchor block vanished after the dig (${e?.message || e})`, dist: failDist }
      }
    } else {
      return { delivered: 0, why: `open failed (${e?.message || e})`, dist: failDist }
    }
  }
  try {
    const chestSlots = chestSlotCount(window)
    // the MIRROR pocket read (v0.73.0): bot.inventory goes stale while a chest
    // window is open - the window's own tail slots mirror the server truth
    const mirrorCount = name => {
      try {
        const slots = Array.isArray(window?.slots) ? window.slots : (typeof window?.slots === 'function' ? window.slots() : null)
        if (Array.isArray(slots) && chestSlots > 0 && slots.length > chestSlots) {
          return slots.slice(chestSlots).filter(s => s && s.count > 0 && s.name === name).reduce((a, s) => a + s.count, 0)
        }
      } catch { /* a dead window falls back */ }
      return countItem(bot, name)
    }
    let delivered = 0
    for (const fuelName of FUEL_COMMON_ORDER) {
      if (delivered >= over) break
      const stack = (() => {
        try { return bot.inventory.items().find(i => i.name === fuelName && i.count > 0) ?? null } catch { return null }
      })()
      if (!stack) continue
      const units = Math.min(fuelTitheOverage({ name: fuelName, pocketCount: mirrorCount(fuelName) }), over - delivered)
      if (!(units > 0)) continue
      const before = mirrorCount(fuelName)
      try {
        await withTimeout(window.deposit(stack.type, null, units), clickTimeoutMs, `anchor tithe ${fuelName}`)
      } catch { continue }
      const moved = before - mirrorCount(fuelName)
      if (moved > 0) delivered += moved
    }
    if (delivered > 0) {
      // (v0.509.0) THE REFILL TIDINGS: the funded chest carries the news - the
      // dry stances within DRY_REARM_RADIUS un-defer (the deposit side of the
      // ask backoff). The anchor IS the honest scope: a yard-high chest fails
      // the distance test against the diggers' deep stances on its own.
      // (v0.510.0) THE FUNDED FORGET: the same news reaches the OTHER lane -
      // the emptiness claims within reach are lies now, the sweeps stop
      // excluding the funded chest for a 90s clock nobody re-read.
      rearmDryNear(memory, anchor)
      forgetEmptyNear(memory, anchor)
      log(`fuel anchor: delivered ${delivered} units over the tithe bound (pocket keeps ${FUEL_TITHE_BOUND})`)
    } else log('fuel anchor: the clicks lied - nothing left the pocket (ghost clicks)')
    return { delivered, why: delivered > 0 ? 'ok' : 'ghost clicks' }
  } finally {
    try { window.close?.() } catch { /* already closed */ }
  }
}

/**
 * Pure, junk-safe: what to withdraw from ONE chest view to fuel `itemsNeeded`
 * smeltables. Returns [{ name, count }] (ordered, totals <= cap) or null when
 * the chest holds nothing useful / the ask is junk. The Number(null) family
 * lesson rides here: every numeric input is body-guarded, a junk ask yields
 * null (NOT Infinity, NOT a partial plan).
 */
export function fuelWithdrawPlan ({ itemsNeeded = 0, chestItems = null, cap = FUEL_WITHDRAW_CAP } = {}) {
  const need = Number(itemsNeeded)
  if (!Number.isFinite(need) || need <= 0) return null
  const capN = Number(cap)
  const capSafe = Number.isFinite(capN) && capN > 0 ? Math.floor(capN) : FUEL_WITHDRAW_CAP
  if (!Array.isArray(chestItems)) return null
  // (v0.669.0) the floor rides: the plan's want is the batch goal, the
  // chest's stock still bounds the take below it
  const want = withdrawGoal({ itemsNeeded: need, cap: capSafe })
  if (!(want > 0) || !Number.isFinite(want)) return null
  const plan = []
  let left = want
  for (const fuelName of FUEL_COMMON_ORDER) {
    if (left <= 0) break
    for (const s of chestItems) {
      if (left <= 0) break
      if (!s || s.name !== fuelName || !(s.count > 0)) continue
      const take = Math.min(left, Math.floor(s.count))
      if (take <= 0) continue
      // same-name rows merge into ONE entry - the caller verifies per TYPE via
      // the pocket diff, and a split entry would read as a double take
      const held = plan.find(p => p.name === fuelName)
      if (held) held.count += take
      else plan.push({ name: fuelName, count: take })
      left -= take
    }
  }
  return plan.length > 0 ? plan : null
}

/**
 * Pure, junk-safe: the click pair to move `itemType` from a chest slot (indices
 * < chestSlots) into the POCKET (indices >= chestSlots) - the mirror of
 * deposit.mjs's pickDirectSlots. An unreadable view yields null (the legacy
 * pathway keeps its semantics).
 */
export function pickWithdrawSlots ({ window, itemType, chestSlots } = {}) {
  const slots = Array.isArray(window?.slots)
    ? window.slots
    : (typeof window?.slots === 'function' ? window.slots() : null)
  if (!Array.isArray(slots) || !Number.isFinite(chestSlots) || chestSlots <= 0 || chestSlots >= slots.length) return null
  if (!Number.isFinite(itemType)) return null
  let srcIdx = -1
  for (let i = 0; i < chestSlots; i++) {
    const s = slots[i]
    if (s && s.type === itemType && s.count > 0) { srcIdx = i; break }
  }
  if (srcIdx < 0) return null
  let dstIdx = -1
  for (let i = chestSlots; i < slots.length; i++) {
    const s = slots[i]
    if (!s || s.count <= 0) { dstIdx = i; break } // an empty pocket slot
    if (s.type === itemType && s.count < (s.stackSize ?? 64)) { dstIdx = i; break } // matching pocket stack with room
  }
  if (dstIdx < 0) return null
  return { srcIdx, dstIdx }
}

/**
 * ONE fuel move by raw window clicks: lift the chest stack, drop `take` into
 * the pocket (whole stack when take >= stack count, else right-click singles),
 * return the leftover to the chest slot. Throws on any refusal - the caller's
 * verified inventory diff stays the only truth (the ghost-click doctrine).
 */
export async function withdrawStackMove (bot, window, { srcIdx, dstIdx, take, stackCount, clickTimeoutMs = 5000 } = {}) {
  const n = Number(take)
  const have = Number(stackCount)
  if (!Number.isFinite(n) || n <= 0 || !Number.isFinite(have) || have <= 0) throw new Error('junk take/stackCount')
  const click = async (idx, button, what) => {
    await withTimeout(Promise.resolve(bot.clickWindow(idx, button, 0)), clickTimeoutMs, `click ${what} slot ${idx}`)
  }
  await click(srcIdx, 0, 'chest source') // lift the whole chest stack onto the cursor
  try {
    if (n >= have) {
      await click(dstIdx, 0, 'pocket dest') // drop everything into the pocket
    } else {
      for (let i = 0; i < n; i++) await click(dstIdx, 2, 'pocket single') // right-click drops ONE per click
      await click(srcIdx, 0, 'chest return') // the leftover goes back home
    }
  } catch (e) {
    try { await click(srcIdx, 0, 'return') } catch { /* the diff reports honestly */ }
    throw e
  }
  return { moved: Math.min(n, have) }
}

/**
 * Walk the nearest yard chests and withdraw a modest fuel slice. Never throws.
 * Returns { taken, plan, chestsVisited, reason } - `taken` counts UNITS that
 * VERIFIABLY landed in the pocket (the diff, not the clicks).
 */
export async function withdrawFuelCommons (bot, {
  itemsNeeded = 0,
  maxChests = COMMONS_SWEEP_CHESTS,
  maxDistance = 48,
  yardCenter = null,
  yardRadius = YARD_CHEST_RADIUS,
  cap = FUEL_WITHDRAW_CAP,
  budgetMs = 30000,
  clickTimeoutMs = 5000,
  memory = null,
  anchorScan = true, // (v0.124.0) read the fleet's fuel anchor FIRST (then the nearest-first sweep); false = the legacy shape byte for byte
  log = () => {}
} = {}) {
  const ask = Number(itemsNeeded)
  if (!Number.isFinite(ask) || ask <= 0) return { taken: 0, plan: null, chestsVisited: 0, reason: 'nothing to fuel' }
  const started = Date.now()
  const remainingMs = () => budgetMs - (Date.now() - started)
  // (v0.597.0) THE LAST-MILE RAW HOP - the envelope's own completion. The
  // face's 16 budget deaths (fleet 37173632953) all died at the SAME seat:
  // the approach walked (7-11s of raw segments), landed INSIDE the direct
  // envelope (d=7-10), and the re-goto could not be bought - 12 floor
  // refusals below the 2000ms the pathfinder's decision costs, 2 re-segment
  // floors, 1 decide-fail after the envelope was already declared. The bot
  // stood one straight hop from a chest that held the coal. The raw walker -
  // the same machinery that just walked the approach, no pathfinder, no
  // decision tax, its own stall/net-progress/timeout aborts bounding it -
  // owns the close with whatever clock remains. One helper, three seats:
  // the nudge's floor, the falsified envelope's cheapest falsifier-test
  // (before the re-segment prices a second 15s approach), the re-segment's
  // floor. The declared gate is strict (only a DECLARED envelope rides -
  // the v0.355.0 read); a dead clock stands down honestly, and every
  // refusal keeps today's lines byte for byte. Walk mechanics, not
  // outcomes - the v0.595.0 lens never claims them.
  const lastMileRaw = async (chestPos, declared) => {
    if (!declared || remainingMs() <= 0) return false
    try {
      const r = await walkRawToward(bot, chestPos, { timeoutMs: remainingMs() })
      log(`fuel commons: the last mile landed (raw, d=${Number.isFinite(r?.d) ? r.d.toFixed(1) : '?'})`)
      return true
    } catch (eRaw) {
      log(`fuel commons: the last mile refused (${eRaw?.message || eRaw})`)
      return false
    }
  }
  // (v0.506.0) THE ASK BACKOFF: a sweep that ended DRY from THIS STANCE defers
  // the immediate re-ask - the climb fund's refusals are geometry, and geometry
  // does not move in 45s (the commons ledger's dead letter box: 53 asks, 0
  // delivered, every ask's next line the coal skip - the repeat ask bought the
  // scan+open churn twice per leg for the same zero). The gate re-arms honestly
  // on BOTH real changes: the bot stands ELSEWHERE (the vertical gate's own law
  // - 'the next ask runs from wherever the bot then stands') or the TTL expires
  // (a deposit may have landed - the tithe is the only inflow). ONE named line
  // rides the existing 'fuel commons' prefix (the 'fuel' filter key) - zero
  // filter changes. The record side sits at the sweep's single return.
  {
    const deferred = dryStanceDeferred(memory, bot?.username, (() => { try { return bot?.entity?.position ?? null } catch { return null } })(), started)
    if (deferred) {
      log(`fuel commons: the ask defers (this stance came up dry ${Math.max(1, Math.round(deferred.ageMs / 1000))}s ago - the climb owns the depth, the tithe owns the refill, the clock re-arms the ask)`)
      return { taken: 0, plan: null, chestsVisited: 0, reason: 'ask deferred (dry stance)' }
    }
  }
  // (v0.669.0) the floor rides the sweep's goal too - the budget-spent
  // verdict's want half prints the batch (the goal split's own lever)
  const wantTotal = withdrawGoal({ itemsNeeded: ask, cap: Number(cap) > 0 ? Math.floor(Number(cap)) : FUEL_WITHDRAW_CAP })
  const exclude = []
  // (v0.99.0) the sweep memory: known-empty chests are pre-excluded so a
  // repeat ask walks ONWARD instead of re-walking the same cobble (run89:
  // F3 'chest holds no fuel' x6 - the same chests, every time)
  const remembered = liveEmptyCells(memory, bot?.username, started)
  for (const cell of remembered) exclude.push(cell)
  let taken = 0
  let chestsVisited = 0
  let nudgeUsed = false // (v0.147.0) ONE path-geometry nudge per commons visit
  let nudgeShots = 0 // (v0.355.0) the shot ledger - the re-segment plan counts the ladder
  let nudgedInside = false // (v0.355.0) STRICT - only a nudge that DECLARED the envelope can falsify it
  let doomLogged = false // (v0.159.0) ONE vertical-gate line per ask
  let climbLogged = false // (v0.504.0) ONE climb-fund line per ask (the doom skip's shape, the clock-honest band)
  const planAll = []
  // (v0.124.0) THE ANCHOR FIRST READ: the tithe's delivery target is the
  // fleet's one deterministic fuel chest - when a yardCenter is known, the
  // anchor is tried as chest #0 (the same budget, the same re-arm, the same
  // memory) and the nearest-first sweep continues from #1. Run108: the sweeps
  // opened 7 nearest chests and took 0 while the tithe's 19 coal sat in three
  // OTHER bots' nearest chests - the anchor makes the first open pay. A dead
  // scan/unreadable block reads null and the legacy shape runs untouched.
  // (v0.128.0) the anchor read excludes only the FRESH empty cells
  // (freshEmptyCells, ANCHOR_FRESH_EMPTY_MS): the 90s memory keeps the sweep
  // honest (no re-walking known-empty chests) but must NOT un-anchor the
  // read - the anchor is the one chest the tithe refills between asks.
  // run525: 0 'anchor chest is read first' lines while the same loop's
  // findChest opened chest after chest - the anchor died in this exclude.
  const freshEmpty = freshEmptyCells(memory, bot?.username, started)
  const anchorBlock = (anchorScan && yardCenter)
    ? anchorChestBlock(bot, { yardCenter, radius: yardRadius, maxDistance, exclude: freshEmpty, memory, log })
    : null
  if (anchorBlock) log('fuel commons: the anchor chest is read first')
  for (let c = 0; c < maxChests; c++) {
    if (taken >= wantTotal) break
    if (remainingMs() <= 0) { log(`fuel commons: budget spent (${taken}/${wantTotal} units)`); break }
    const chest = (c === 0 && anchorBlock)
      ? anchorBlock
      : findChest(bot, { maxDistance, exclude, yardCenter, yardRadius, log })
    if (!chest) { if (c === 0) log('fuel commons: no yard chest in range'); break }
    const dist = (() => { try { return Math.round(bot.entity.position.distanceTo(chest.position)) } catch { return null } })()
    // (v0.159.0) THE VERTICAL GATE (the commons): a chest mostly ABOVE the bot
    // is doomed by arithmetic - the same strict shape the bank climbs have
    // gated since v0.158.0, now at the walk sites the smelt leg pays for. The
    // honest skip names the shape ONCE per ask (the whole yard row shares one
    // level), excludes the chest, and moves on: the thin leg clock keeps its
    // slice for the machine walk and the build, the ask rides (the tithe owns
    // the resupply near the yard; the next ask runs from wherever the bot
    // then stands).
    {
      const doom = chestVerticalDoom({ botPos: bot?.entity?.position ?? null, chestPos: chest.position })
      if (doom.doom) {
        if (!doomLogged) {
          doomLogged = true
          log(`fuel commons: chest at [${chest.position.x ?? '?'},${chest.position.y ?? '?'},${chest.position.z ?? '?'}] ${doom.why} - the walk ladder cannot climb, the ask rides (the tithe owns the deep resupply)`)
        }
        exclude.push(chest.position.floored ? chest.position.floored() : chest.position)
        continue
      }
    }
    // (v0.504.0) THE CLIMB FUND: the doom gate's lateral-routed band (lateral >= dy,
    // 'the ladder may route it') still dies on the CLOCK - the ask's thin slice never
    // funded a 20+ level climb (the commons ledger's dead letter box: 60 sweeps, 0
    // delivered, 49 spent slices). The read refuses the climb-class walk BEFORE the
    // walk burns the slice, one named line per ask, the same exclude + continue the
    // doom skip uses. The strict geometry gate above stays byte for byte.
    {
      const botPos = bot?.entity?.position
      const chestPos = chest.position
      const climb = climbFundRefusal({
        dy: (Number.isFinite(botPos?.y) && Number.isFinite(chestPos?.y)) ? chestPos.y - botPos.y : null,
        lateral: (Number.isFinite(botPos?.x) && Number.isFinite(chestPos?.x) && Number.isFinite(botPos?.z) && Number.isFinite(chestPos?.z))
          ? Math.hypot(chestPos.x - botPos.x, chestPos.z - botPos.z)
          : null,
        walkBudgetMs: chestWalkBudgetMs(dist ?? 8),
        sliceMs: remainingMs()
      })
      if (climb) {
        if (!climbLogged) {
          climbLogged = true
          log(`fuel commons: chest at [${chestPos.x ?? '?'},${chestPos.y ?? '?'},${chestPos.z ?? '?'}] ${climb} - the ask rides (the tithe owns the deep resupply)`)
        }
        exclude.push(chestPos.floored ? chestPos.floored() : chestPos)
        continue
      }
    }
    // the walk fits INSIDE the resupply slice (the smelt leg's own clock) -
    // chestWalkBudgetMs scales with distance, effectiveWalkBudget clamps into
    // what is actually left
    try {
      // (v0.99.0) the chest walk re-arms: the yard is THE shared
      // destination class (run89: F9's commons walks refused 'doomed goal
      // (ledgered 1s ago)' - other bots' failed bank walks had poisoned the
      // chest cells). Same semantics as the bank chain and the furnace walk.
      // (v0.113.0) + the CHEST DOOM HALF-LIFE: the commons was run100's starved
      // class ('ledgered 16s/11s ago' refused the resupply while the pockets
      // held raw metal) - the doom now lives 15s, not 90s.
      // (v0.135.0) THE ROW RE-ARM: doomedRearm UNCONDITIONAL (the v0.130.0
      // machine-walk shape, the v0.87.0 anchor-walk shape) - run550 measured
      // the dense row starving INSIDE a single ask: 'doomed goal (ledgered 0s
      // ago)' x40 fleet-wide, F10's sweep met it x4+ - a sibling bot's fresh
      // failure poisons the row mid-ask and chests 2..N die for free while
      // the pockets hold raw metal. The doomed verdict is fleet-wide on the
      // GOAL cell, but the failure geometry is the FAILED BOT'S START - this
      // sweep walks honestly from where IT stands. The sweep's own per-chest
      // exclude (the push after every failed walk) keeps the loop honest, the
      // doom ledger itself stays intact for every other goal class, and the
      // 15s half-life still bounds the poison.
      // (v0.231.0) THE CHEST-HOP IDENTITY (the commune's cure rides its
      // sibling ladder): the label carries the chest's coords - the same
      // single-label chest-to-chest loop shape as the iron commune, the same
      // false-positive exposure (sub-1.0-block hops read not-displaced), no
      // field catch yet but the anatomy is identical (see toolupgrade.mjs).
      await gotoSafe(bot, new goals.GoalNear(chest.position.x, chest.position.y, chest.position.z, 2), { timeoutMs: Math.min(chestWalkBudgetMs(dist ?? 8), remainingMs()), label: `fuel commons walk @${Math.round(chest.position.x)},${Math.round(chest.position.z)}`, doomedRearm: true, doomTtl: CHEST_DOOM_TTL_MS })
    } catch (e) {
      let arrived = false // (v0.147.0) the nudge retry may still land this chest
      // (v0.147.0) THE PATH-GEOMETRY NUDGE + THE SAME-CHEST RETRY: run85
      // (dispatch 36016062585, the v0.146.0 commune's first field test)
      // measured the commons itself starving on the path class - F10's ask
      // logged 'chest walk failed (Took to long to decide path to goal!)'
      // x4 then 'budget spent (0/4 units)', and SIX fleet 'no fuel' smelt
      // verdicts died behind it. The pathfinder verdicts are about the
      // FAILED START: one bounded approachWalk (the proven segment
      // machinery) changes the start, and the SAME chest gets one honest
      // re-goto before the exclude - a chest the bot can now route to
      // keeps its fuel, the ledger stays honest for the rest.
      if (!nudgeUsed && PATH_GEOMETRY_RE.test(e?.message || '')) {
        nudgeUsed = true
        // (v0.651.0) THE ASK'S OWN FLOOR: the split caps the nudge at the
        // headroom above the v0.156.0 gate's own 2000ms when that headroom
        // still funds a real walk - the fat slice can no longer overrun into
        // both legs' death; a thin slice keeps the legacy byte (the ternary)
        // and the gate+hop structure owns the thin clock honestly.
        const headroomMs = nudgeLegSplitMs({ remainingMs: remainingMs(), floorMs: ANCHOR_ASK_LEG_FLOOR_MS })
        const nudgeMs = headroomMs > 1000 ? headroomMs : Math.min(remainingMs(), 15000)
        if (nudgeMs > 1000) {
          try {
            const n = await approachWalk(bot, chest.position, { budgetMs: nudgeMs, closeShot: true, rawWalk: walkRawToward, log: m => log(`fuel commons: path nudge ${m}`) }) // (v0.356.0) the raw walker wakes - F14's stall had no side-step to fire
            nudgeShots = 1 // the first shot is spent - the re-segment plan prices the second
            nudgedInside = n.walked === true // the strict read: only a declared envelope can be falsified
            log(`fuel commons: path nudge ${n.walked ? 'inside the direct envelope' : `closed to d=${Number.isFinite(n.d) ? n.d.toFixed(1) : '?'} - retrying the same chest`}`)
            // (v0.156.0) THE NUDGE CLOCK GUARD: run555 (36049735813, the
            // v0.154.0 fleet) measured the segment OVERRUNNING its slice -
            // 'F11 fuel commons: path nudge approach: 1 segment(s) walked in
            // 8.4s' then 'chest walk failed after the nudge (fuel commons
            // walk (nudge retry): timeout after -1474ms)' - the re-goto was
            // built with a NEGATIVE timeout and died a fake death before it
            // could even try. The approach's slice is a budget, not a hard
            // per-segment wall (a segment can overrun into it), so the
            // re-goto needs its own floor: below 2s of remaining clock the
            // honest stop names the spend instead of throwing a negative
            // timeout. (The anchor walk's retry gate has held this floor
            // since v0.153.0.)
            if (remainingMs() > 2000) {
              const dist2 = (() => { try { return Math.round(bot.entity.position.distanceTo(chest.position)) } catch { return null } })()
              try {
                await gotoSafe(bot, new goals.GoalNear(chest.position.x, chest.position.y, chest.position.z, 2), { timeoutMs: Math.min(chestWalkBudgetMs(dist2 ?? 8), remainingMs()), label: `fuel commons walk @${Math.round(chest.position.x)},${Math.round(chest.position.z)} (nudge retry)`, doomedRearm: true, doomTtl: CHEST_DOOM_TTL_MS })
                // the retry landed: fall through to the open below (do NOT exclude)
                log('fuel commons: the nudge retry landed')
                arrived = true
              } catch (e2) {
                log(`fuel commons: chest walk failed after the nudge (${e2?.message || e2})`)
                // (v0.597.0) THE LAST-MILE RAW HOP: the falsified envelope's
                // cheapest falsifier-test - the straight walk the envelope
                // already proved (the face's F8 decide-fail: the re-goto died
                // deciding at d=8.1 INSIDE the envelope). A landing seats the
                // chest and the re-segment never prices; a refusal rides the
                // re-segment plan byte for byte below.
                if (await lastMileRaw(chest.position, nudgedInside)) arrived = true
                // (v0.355.0) THE FALSIFIED ENVELOPE RE-SEGMENT: the envelope's
                // verdict is a DISTANCE read, the death is a DECISION read -
                // face 11 measured the disagreement 40 times in one calm face
                // ('path nudge ... inside the direct envelope' at d=16.2, then
                // 'chest walk failed after the nudge (Took to long ...)'). When
                // the nudge DECLARED the envelope and the re-goto died the
                // geometry class anyway, the verdict is falsified - ONE more
                // start-change (the second approachWalk shot from the NEW
                // position) before the exclude. Every defer/refusal/stall falls
                // through to the exclude byte for byte (the account of record
                // law); the ladder is bounded by NUDGE_SHOT_MAX and the floor.
                const plan = arrived ? null : nudgeReSegmentPlan({ shotsUsed: nudgeShots, envelopeInside: nudgedInside, failMsg: e2?.message || String(e2 ?? ''), remainingMs: remainingMs() })
                if (arrived) {
                  // (v0.597.0) the last mile landed above - the envelope stands,
                  // the re-segment never prices (the take owns the chest now)
                } else if (!plan.retry) {
                  log(`fuel commons: envelope re-segment deferred: ${plan.why}`)
                } else {
                  nudgeShots++
                  try {
                    const n2 = await approachWalk(bot, chest.position, { budgetMs: Math.min(remainingMs(), 15000), closeShot: true, rawWalk: walkRawToward, log: m => log(`fuel commons: envelope re-segment nudge ${m}`) }) // (v0.356.0) the raw walker rides the re-segment too
                    log(`fuel commons: envelope re-segment nudge ${n2.walked ? 'inside the direct envelope' : `closed to d=${Number.isFinite(n2.d) ? n2.d.toFixed(1) : '?'} - retrying the same chest`}`)
                    if (remainingMs() > NUDGE_RESEGMENT_FLOOR_MS) {
                      const distR = (() => { try { return Math.round(bot.entity.position.distanceTo(chest.position)) } catch { return null } })()
                      try {
                        await gotoSafe(bot, new goals.GoalNear(chest.position.x, chest.position.y, chest.position.z, 2), { timeoutMs: Math.min(chestWalkBudgetMs(distR ?? 8), remainingMs()), label: `fuel commons walk @${Math.round(chest.position.x)},${Math.round(chest.position.z)} (envelope re-segment)`, doomedRearm: true, doomTtl: CHEST_DOOM_TTL_MS })
                        log('fuel commons: the envelope re-segment LANDED - the walk owns the chest now')
                        arrived = true
                      } catch (e3) {
                        log(`fuel commons: envelope re-segment stalled: ${e3?.message || e3} - the exclude owns the chest`)
                      }
                    } else {
                      log(`fuel commons: the re-segment spent the walk slice (${Math.round(remainingMs())}ms left) - the exclude owns the chest`)
                      // (v0.597.0) THE LAST-MILE RAW HOP: the second shot's own
                      // envelope declaration (n2.walked) - the same completion
                      // law at the re-segment's floor (the face's 2 re-segment
                      // floor deaths: F15, F11's 0/6).
                      if (await lastMileRaw(chest.position, n2.walked)) arrived = true
                    }
                  } catch (eRe) {
                    log(`fuel commons: envelope re-segment swallowed: ${eRe?.message || eRe} - the exclude owns the chest`)
                  }
                }
              }
            } else {
              log(`fuel commons: the nudge spent the walk slice (${Math.round(remainingMs())}ms left) - no re-goto clock`)
              // (v0.597.0) THE LAST-MILE RAW HOP: the envelope was declared and
              // the floor had no clock for the re-goto's decision - the straight
              // hop is the honest completion (the face's 12 floor-refusal deaths:
              // the bot stood d=7-10 from a chest that held the coal).
              if (await lastMileRaw(chest.position, nudgedInside)) arrived = true
            }
          } catch { /* the nudge never kills the chain */ }
        }
      }
      if (!arrived) {
        exclude.push(chest.position.floored ? chest.position.floored() : chest.position)
        continue
      }
    }
    let window = null
    try {
      window = await withTimeout(bot.openChest(chest), 10000, 'open fuel chest')
    } catch (e) {
      // (v0.159.0) THE COVER DIG (the commons edge): the same run557 F12
      // shape - a landed walk, a timed-out open, a covered chest. One dig,
      // one re-open; the legacy exclude runs when the cure stands down.
      if (await digChestCover(bot, chest.position, e, log, 'fuel commons')) {
        const block2 = (() => { try { return bot.blockAt(chest.position) } catch { return null } })()
        if (block2 && isChestName(block2.name)) {
          try {
            window = await withTimeout(bot.openChest(block2), 10000, 'open fuel chest (cover dug)')
          } catch (e2) {
            log(`fuel commons: open failed after the cover dig (${e2?.message || e2})`)
            exclude.push(chest.position.floored ? chest.position.floored() : chest.position)
            continue
          }
        } else {
          log('fuel commons: the chest block vanished after the cover dig')
          exclude.push(chest.position.floored ? chest.position.floored() : chest.position)
          continue
        }
      } else {
        log(`fuel commons: open failed (${e?.message || e})`)
        exclude.push(chest.position.floored ? chest.position.floored() : chest.position)
        continue
      }
    }
    chestsVisited++
    // (v0.507.0) THE GRAVITY DISCOVERY: an opened chest feeds the low-chest
    // registry (band-checked inside rememberLowChest) - empty and funded
    // chests alike are SUPPLY SITES the tithe's future delivery can prefer;
    // the registry only re-ranks scan-confirmed chests, it never injects a
    // cell. The yardCenter read is junk-guarded inside the remember call.
    rememberLowChest(memory, chest.position, yardCenter?.y, Date.now())
    try {
      const chestSlots = chestSlotCount(window)
      const slots = Array.isArray(window?.slots) ? window.slots : (typeof window?.slots === 'function' ? window.slots() : null)
      const chestItems = Array.isArray(slots) && chestSlots > 0
        ? slots.slice(0, chestSlots).map(s => (s && s.count > 0) ? { name: s.name, count: s.count, type: s.type, stackSize: s.stackSize } : null).filter(Boolean)
        : []
      const plan = fuelWithdrawPlan({ itemsNeeded: ask - taken, chestItems, cap: wantTotal - taken })
      if (!plan) {
        // (v0.599.0) THE DRY READ'S CHEST: the dry face names the chest it
        // read - fleet 37178311099's books never closed (the tithe banked
        // 28 x coal into [-108,71,407], the asks anchored [-108,71,401] and
        // the sibling cells, and every dry read was anonymous - whether the
        // filled chest ever got read is the divergence's own face). The
        // deposit names its chest, the anchor names its chest, the ask's
        // one anonymous line was the dry read. The bare form stays the
        // parser's torn law (fuelcommons.mjs reads both faces).
        const cell = chest.position.floored ? chest.position.floored() : chest.position
        log(`fuel commons: chest holds no fuel at [${cell.x},${cell.y},${cell.z}]`)
        exclude.push(cell)
        // (v0.99.0) remember it: ONLY a chest that was opened and READ empty
        // earns a memory entry - a walk failure is transient saturation (the
        // weak-evidence lesson) and a funded chest is the opposite of empty
        rememberEmptyChest(memory, bot?.username, cell, Date.now())
        continue
      }
      // per-TYPE pocket snapshots: the verified diff (not the clicks) is the
      // only truth - the ghost-click class has lied here before (deposit.mjs)
      // (v0.159.0) THE VERIFIED WITHDRAW RETRY: run557's F18 opened the anchor
      // that HELD the tithe's coal, the clicks resolved, the pocket never
      // received ('the clicks lied - nothing landed'), and the chest was
      // excluded with the fleet's fuel still inside - smelted=0 fleet-wide.
      // The window is still open and the stacks are still in it: ONE honest
      // re-fire of the same plan costs zero walks, then the diff stays king.
      let verified = 0
      for (let attempt = 0; attempt < 2 && verified === 0; attempt++) {
        const beforeOf = new Map(plan.map(p => [p.name, countItem(bot, p.name)]))
        for (const { name, count } of plan) {
          let moved = 0
          while (moved < count) {
            const slotsNow = Array.isArray(window?.slots) ? window.slots : (typeof window?.slots === 'function' ? window.slots() : null) || []
            const stack = slotsNow.slice(0, chestSlots).find(s => s && s.name === name && s.count > 0)
            if (!stack) break // this stack drained into pocket stacks mid-move
            const pair = pickWithdrawSlots({ window, itemType: stack.type, chestSlots })
            if (!pair) break // no pocket room left - the honest stop
            await withdrawStackMove(bot, window, { srcIdx: pair.srcIdx, dstIdx: pair.dstIdx, take: count - moved, stackCount: stack.count, clickTimeoutMs })
            moved += Math.min(count - moved, stack.count)
          }
        }
        for (const { name } of plan) {
          const got = Math.max(0, countItem(bot, name) - (beforeOf.get(name) ?? 0))
          if (got > 0) { planAll.push({ name, count: got }); verified += got }
        }
        if (verified === 0 && attempt === 0) log('fuel commons: the clicks lied (ghost clicks) - the window is still open, re-firing the same plan once')
      }
      if (verified > 0) {
        taken += verified
        log(`fuel commons: took ${verified} units (${planAll.map(p => `${p.count} x ${p.name}`).join(', ')}) from a yard chest`)
      } else {
        log('fuel commons: the clicks lied twice - nothing landed in the pocket (ghost clicks)')
      }
      if (taken >= wantTotal) break
      exclude.push(chest.position.floored ? chest.position.floored() : chest.position)
    } finally {
      try { window.close?.() } catch { /* already closed */ }
    }
  }
  // (v0.506.0) THE BACKOFF's RECORD SIDE: a sweep that ended DRY from this
  // stance remembers the stance (the next same-stance ask defers until the TTL
  // or the bot stands elsewhere); a delivery CLEARS it (the commons paid - the
  // next ask sweeps immediately). The early exits (junk ask, the deferral
  // itself) never reach here - only a real sweep writes the clock.
  if (taken > 0) clearDryStance(memory, bot?.username)
  else rememberDryStance(memory, bot?.username, (() => { try { return bot?.entity?.position ?? null } catch { return null } })(), Date.now())
  const reason = taken > 0 ? 'ok' : (chestsVisited > 0 ? 'commons empty' : 'no chest reached')
  return { taken, plan: planAll.length > 0 ? planAll : null, chestsVisited, reason }
}

// (v0.585.0) THE FUEL COMMONS' GRAIN - the supply front's own face seat. The
// no-fuel family read the POCKET (the anatomy), the MACHINE (the owner map),
// the DEPTH (the pantry) - but the commons itself, the supply's own answer,
// reads blind: the face never said whether the asks were even made, whether
// ANY coal moved, how many chest opens the sweeps paid. The grain is five
// numbers fed at the smelt leg's fuelResupply seat (the family's own feed;
// the torch lane has its own book in torchbook.mjs): asks / delivered /
// units / chests / dry. The laws: every ask counts once (delivered when
// taken > 0, dry otherwise - the early 'nothing to fuel' junk ask is an
// honest dry), chestsVisited sums only PAID opens (the increment sits after
// the successful open). The verdicts: zero asks stay lean (the supply was
// never needed - a subset of the smelt leg's own legs by construction);
// every ask dry names the source ('commons empty' vs 'no chest reached' ride
// the per-ask log lines - the grain names the front); every ask fed says the
// line holds; a mix says the dry asks name the thin chests. Junk-safe: the
// negative and non-finite floors read 0 (the row never lies upward).
export function fuelCommonsGrainRow (grain) {
  const g = (grain && typeof grain === 'object') ? grain : {}
  const clean = (v) => (Number.isFinite(v) && v > 0) ? Math.floor(v) : 0
  const a = clean(g.asks)
  const d = clean(g.delivered)
  const u = clean(g.units)
  const c = clean(g.chests)
  const w = clean(g.dry)
  if (a === 0) return null
  if (d === 0) {
    return `smelt fuel commons grain: asked ${a}, delivered 0, dry ${w} - every ask came up dry: the commons' source is the front (the tithe is the only inflow)`
  }
  if (w === 0) {
    return `smelt fuel commons grain: asked ${a}, delivered ${d} (${u}u over ${c} opens), dry 0 - every ask fed: the commons holds the supply line`
  }
  return `smelt fuel commons grain: asked ${a}, delivered ${d} (${u}u over ${c} opens), dry ${w} - the commons reads mixed: the dry asks name the thin chests`
}

// (v0.587.0) THE TITHE'S INFLOW GRAIN - the grain's twin on the INFLOW side.
// The commons' grain (v0.585.0) read the asks' answers (outflow); fleet
// 37166593085's face read 'asked 3, delivered 0, dry 3 - every ask came up
// dry: the commons' source is the front (the tithe is the only inflow)' and
// the inflow itself stayed unread: ZERO 'fuel anchor: delivered' lines rode
// the whole face while F7's real attempt failed BOTH seats ('0 delivered
// (open failed (...))' twice). The grain: three numbers fed at BOTH tithe
// seats (the arrival seat and the final-leg fallback - one function, one
// book): attempted / delivered / dry, units summed on the deliveries. THE
// LEAN LAW: 'no overage' never counts (the healthy lean is silent - a pocket
// that keeps its own fuel never asked; the reads that fire every chain stay
// invisible), so attempted = delivered + dry by construction. THE VERDICTS:
// zero attempts stay lean (the overage never rode anywhere); every attempt
// dry names the front (the skips named their lines - the per-call '0
// delivered (why)' log lines carry the why vocabulary); a delivery says the
// inflow feeds the commons. Junk-safe: the null/negative floors read 0 (the
// row never lies upward - the grain's own law).
export function fuelTitheInflowRow (flow) {
  const g = (flow && typeof flow === 'object') ? flow : {}
  const clean = (v) => (Number.isFinite(v) && v > 0) ? Math.floor(v) : 0
  const a = clean(g.attempted)
  const d = clean(g.delivered)
  const u = clean(g.units)
  const w = clean(g.dry)
  if (a === 0) return null
  if (d === 0) {
    // (v0.590.0) THE OPEN'S DIST LENS: far/near count the dry asks whose open
    // failure carried a measured distance (far past CHEST_OPEN_DIG_MAX_DIST -
    // the open fired far from the chest, the walk's landed verdict lied; near
    // - the open fired at the chest and the chest refused the use). Junk-safe:
    // negative/NaN floors to 0; a zero far+near reads the honest legacy form
    // (the blind law - no dist data, no invention). The fed form ignores the
    // lens (a delivery is a delivery).
    const far = clean(g.far)
    const near = clean(g.near)
    const lens = far + near > 0
      ? (far > 0 && near === 0)
        ? ` - the opens fired far ${far} of ${w} - the walk's landed verdict lied: the geometry is the front`
        : (near > 0 && far === 0)
          ? ` - the opens fired near ${near} of ${w} - the chest refused the use: the storm's hand is the front`
          : ` - the opens split far ${far}/near ${near} of ${w} - the reach reads mixed`
      : ''
    return `fuel tithe inflow: attempted ${a}, delivered 0, dry ${w}${lens} - the inflow ran dry: the skips named their lines (the commons' source is the front)`
  }
  return `fuel tithe inflow: attempted ${a}, delivered ${d} (${u}u), dry ${w} - the inflow feeds the commons (the tithe owns the refill)`
}
