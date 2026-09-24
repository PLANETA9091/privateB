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
import { findChest, chestSlotCount, chestWalkBudgetMs, CHEST_DOOM_TTL_MS, YARD_CHEST_RADIUS, CHEST_NAMES, chestNearYard, fuelTitheOverage, FUEL_TITHE_BOUND } from './deposit.mjs'
import { fuelNeeded, countItem } from './smelting.mjs'

const { goals } = pathfinderPkg

// Modesty cap: one withdrawal never strips the commons. fuelNeeded('coal', 48)
// = 6 - the largest smelt plan a 600s run realistically carries.
export const FUEL_WITHDRAW_CAP = 6

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

// (v0.124.0) THE FUEL ANCHOR CORE - a fleet-wide deterministic fuel chest.
// Pure, junk-safe, communication-free: every bot that scans the same yard
// derives the SAME anchor (distance to the yard center is the primary key,
// the floored coordinates are the tie-break), so the tithe's inflow and the
// commons' first read meet at one chest without a single chat packet.
const isChestName = name => (Array.isArray(CHEST_NAMES) && CHEST_NAMES.includes(name)) || (typeof name === 'string' && /_chest$/.test(name))

export function pickFuelAnchor (chests, yardCenter) {
  if (!Array.isArray(chests)) return null
  let cx = null; let cy = null; let cz = null
  if (yardCenter && typeof yardCenter === 'object') {
    const nx = Number(yardCenter.x); const ny = Number(yardCenter.y); const nz = Number(yardCenter.z)
    if (Number.isFinite(nx) && Number.isFinite(ny) && Number.isFinite(nz)) { cx = nx; cy = ny; cz = nz }
  }
  const hasCenter = cx !== null
  let best = null
  for (const p of chests) {
    if (!p || typeof p !== 'object') continue
    const x = Math.floor(Number(p.x))
    const y = Math.floor(Number(p.y))
    const z = Math.floor(Number(p.z))
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue
    const d = hasCenter
      ? (x - cx) * (x - cx) + (y - cy) * (y - cy) + (z - cz) * (z - cz)
      : 0
    const closer = best == null || d < best.d
    const tie = best != null && d === best.d &&
      (x < best.x || (x === best.x && (y < best.y || (y === best.y && z < best.z))))
    if (closer || tie) best = { x, y, z, d }
  }
  if (!best) return null
  return { x: best.x, y: best.y, z: best.z }
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
 * engine face (empty at the yard) at a glance. */
export function scanYardChests (bot, { yardCenter = null, maxDistance = 64, radius = YARD_CHEST_RADIUS, log = () => {} } = {}) {
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
        try { log(`fuel anchor scan returned empty (attempt ${attempt}/2)${at}${attempt === 1 ? ' - the palette empty-return class, re-querying' : ''}`) } catch { /* log never kills a scan */ }
        if (attempt === 1) continue
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
  // (v0.133.0) THE SINGULAR PROBE RESCUE - both plural attempts read empty and
  // the field says the singular shape still works in that exact window (F5,
  // run546: scans 0/0, findChest open + bank +154 seconds later). One probe,
  // the proven path; its chest is a one-cell list, the anchor walk and the
  // tithe deposit run unchanged from there.
  try {
    const rescue = findChest(bot, { maxDistance, yardCenter, yardRadius: radius, log })
    const cell = (() => {
      if (!rescue || !rescue.position) return null
      const x = Math.floor(Number(rescue.position.x))
      const y = Math.floor(Number(rescue.position.y))
      const z = Math.floor(Number(rescue.position.z))
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null
      return { x, y, z }
    })()
    if (cell) {
      try { log(`fuel anchor scan empty x2 - the singular probe rescued the scan (chest at [${cell.x},${cell.y},${cell.z}])`) } catch { /* log never kills a scan */ }
      return [cell]
    }
    try { log('fuel anchor scan empty x2 - the singular probe found nothing either') } catch { /* log never kills a scan */ }
  } catch { /* the rescue never kills the scan - the honest empty stands */ }
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
function anchorChestBlock (bot, { yardCenter, radius, maxDistance, exclude, log = () => {} }) {
  try {
    const cells = scanYardChests(bot, { yardCenter, radius, maxDistance, log })
    const usable = cells.filter(p => !exclude.some(e => e && e.x === p.x && e.y === p.y && e.z === p.z))
    const anchor = pickFuelAnchor(usable, yardCenter)
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
  log = () => {}
} = {}) {
  const over = fuelPocketOverage(bot)
  if (!(over > 0)) return { delivered: 0, why: 'no overage' }
  const started = Date.now()
  const remainingMs = () => budgetMs - (Date.now() - started)
  let anchor = null
  try {
    const cells = scanYardChests(bot, { yardCenter, radius, maxDistance, log })
    anchor = pickFuelAnchor(cells, yardCenter)
  } catch { anchor = null }
  if (!anchor) return { delivered: 0, why: 'no anchor chest' }
  const dist = (() => {
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
    return { delivered: 0, why: `walk failed (${e?.message || e})` }
  }
  if (remainingMs() <= 0) return { delivered: 0, why: 'budget spent after walk' }
  let block = null
  try { block = typeof bot.blockAt === 'function' ? bot.blockAt(new Vec3(anchor.x, anchor.y, anchor.z)) : null } catch { block = null }
  if (!block || !isChestName(block.name)) return { delivered: 0, why: 'anchor block unreadable' }
  let window = null
  try {
    window = await withTimeout(bot.openChest(block), 10000, 'open fuel anchor')
  } catch (e) {
    return { delivered: 0, why: `open failed (${e?.message || e})` }
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
    if (delivered > 0) log(`fuel anchor: delivered ${delivered} units over the tithe bound (pocket keeps ${FUEL_TITHE_BOUND})`)
    else log('fuel anchor: the clicks lied - nothing left the pocket (ghost clicks)')
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
  const want = Math.min(capSafe, fuelNeeded('coal', Math.ceil(need)))
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
  const wantTotal = Math.min(Number(cap) > 0 ? Math.floor(Number(cap)) : FUEL_WITHDRAW_CAP, fuelNeeded('coal', Math.ceil(ask)))
  const exclude = []
  // (v0.99.0) the sweep memory: known-empty chests are pre-excluded so a
  // repeat ask walks ONWARD instead of re-walking the same cobble (run89:
  // F3 'chest holds no fuel' x6 - the same chests, every time)
  const remembered = liveEmptyCells(memory, bot?.username, started)
  for (const cell of remembered) exclude.push(cell)
  let taken = 0
  let chestsVisited = 0
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
    ? anchorChestBlock(bot, { yardCenter, radius: yardRadius, maxDistance, exclude: freshEmpty, log })
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
      await gotoSafe(bot, new goals.GoalNear(chest.position.x, chest.position.y, chest.position.z, 2), { timeoutMs: Math.min(chestWalkBudgetMs(dist ?? 8), remainingMs()), label: 'fuel commons walk', doomedRearm: true, doomTtl: CHEST_DOOM_TTL_MS })
    } catch (e) {
      log(`fuel commons: chest walk failed (${e?.message || e})`)
      exclude.push(chest.position.floored ? chest.position.floored() : chest.position)
      continue
    }
    let window = null
    try {
      window = await withTimeout(bot.openChest(chest), 10000, 'open fuel chest')
    } catch (e) {
      log(`fuel commons: open failed (${e?.message || e})`)
      exclude.push(chest.position.floored ? chest.position.floored() : chest.position)
      continue
    }
    chestsVisited++
    try {
      const chestSlots = chestSlotCount(window)
      const slots = Array.isArray(window?.slots) ? window.slots : (typeof window?.slots === 'function' ? window.slots() : null)
      const chestItems = Array.isArray(slots) && chestSlots > 0
        ? slots.slice(0, chestSlots).map(s => (s && s.count > 0) ? { name: s.name, count: s.count, type: s.type, stackSize: s.stackSize } : null).filter(Boolean)
        : []
      const plan = fuelWithdrawPlan({ itemsNeeded: ask - taken, chestItems, cap: wantTotal - taken })
      if (!plan) {
        log('fuel commons: chest holds no fuel')
        const cell = chest.position.floored ? chest.position.floored() : chest.position
        exclude.push(cell)
        // (v0.99.0) remember it: ONLY a chest that was opened and READ empty
        // earns a memory entry - a walk failure is transient saturation (the
        // weak-evidence lesson) and a funded chest is the opposite of empty
        rememberEmptyChest(memory, bot?.username, cell, Date.now())
        continue
      }
      // per-TYPE pocket snapshots: the verified diff (not the clicks) is the
      // only truth - the ghost-click class has lied here before (deposit.mjs)
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
      let verified = 0
      for (const { name } of plan) {
        const got = Math.max(0, countItem(bot, name) - (beforeOf.get(name) ?? 0))
        if (got > 0) { planAll.push({ name, count: got }); verified += got }
      }
      if (verified > 0) {
        taken += verified
        log(`fuel commons: took ${verified} units (${planAll.map(p => `${p.count} x ${p.name}`).join(', ')}) from a yard chest`)
      } else {
        log('fuel commons: the clicks lied - nothing landed in the pocket (ghost clicks)')
      }
      if (taken >= wantTotal) break
      exclude.push(chest.position.floored ? chest.position.floored() : chest.position)
    } finally {
      try { window.close?.() } catch { /* already closed */ }
    }
  }
  const reason = taken > 0 ? 'ok' : (chestsVisited > 0 ? 'commons empty' : 'no chest reached')
  return { taken, plan: planAll.length > 0 ? planAll : null, chestsVisited, reason }
}
