// Inventory overflow: when a bot's pockets fill up it walks to the nearest chest and
// banks everything except its working kit. The yard (scripts/setup-yard.mjs) keeps
// input rows of chests at spawn, so the walk-back is short for fleet bots working
// around the origin. No op, no commands - vanilla chest windows only.
import pathfinderPkg from 'mineflayer-pathfinder'
import { gotoSafe, withTimeout, waitForWaterRescueClear, walkRetryPlan } from './jobqueue.mjs'
import { PATH_PRIO_BANK } from './pathsemaphore.mjs'
import { walkBudgetMs } from './tripplan.mjs'

const { goals } = pathfinderPkg

export const CHEST_NAMES = ['chest', 'trapped_chest', 'barrel', 'ender_chest']

// Never banked: the bot needs these to keep working (and to survive the night).
// (v0.9.0) sapling is replant stock: banking it made every bot chop its next tree
// into a bare stump with nothing to plant back - the regrow loop needs the sapling
// to stay in the pocket until it is planted at a stump.
export const KEEP = [
  'pickaxe', 'shovel', 'axe', 'sword', 'hoe', 'crafting_table', 'furnace',
  'stick', 'planks', 'log', 'torch', 'bread', 'apple', 'porkchop', 'beef',
  'carrot', 'potato', 'cooked_', 'sapling'
]

// Rough fullness metric: 36 slots total (27 main + 9 hotbar); stack size 64 makes
// empty slots carry 64 units of headroom.
export function inventoryLoad (bot) {
  const items = bot.inventory.items()
  const used = items.length
  const units = items.reduce((a, i) => a + i.count, 0)
  return { slots: used, free: Math.max(0, 36 - used), units }
}

// (v0.12.0) The mid-run bank gate. The old `slots >= 30` NEVER fired in a real
// fleet: inventoryLoad().slots counts OCCUPIED STACKS, and consolidation merges
// fragmented stacks back together - the 600s fleet (35485296464) ended with
// 40-70 UNITS per bot across ~10-15 stacks, so banked=0 and smelted=0 forever.
// The gate now fires on EITHER signal: pockets fragmenting (24+ stacks) or raw
// loot mass (128 units = two full stacks of cobblestone).
export const BANK_SLOTS = 24
export const BANK_UNITS = 128

export function needsBanking (bot) {
  try {
    const load = inventoryLoad(bot)
    return load.slots >= BANK_SLOTS || load.units >= BANK_UNITS
  } catch {
    return false // an unreadable inventory must not kill the mining loop
  }
}

// (v0.33.0) MINING TRIPS - the banked=0 front.
//
// MEASURED (dispatch 35552013594, 600s on c292cf0): 14x 'final bank: 0 (budget
// exhausted)' - bots dig 100-300 blocks out and only attempt a bank at the
// deadline, when the 150s end-bank budget can never cover the walk back.
// needsBanking (slots>=24 OR units>=128) almost never fires at ~90 mined
// blocks/bot/run, so the whole loot pile rides the pockets for 600s and is
// then lost to the budget wall. The cure is the classic mining-trip cadence:
// bank EARLY, while the walk back is still affordable. Pure policy here (the
// cadence gate + the trip budget); the mechanics live in fleet19's banking
// branch, which already climbs out, walks to the yard and returns to the
// remembered column.
export const BANK_TRIP_EVERY_MS = 180000 // a planned bank trip at most every 3 min of digging
export const BANK_TRIP_MIN_UNITS = 64 // ...but only when the pockets hold a stack of loot
export const BANK_TRIP_MIN_REMAINING_MS = 330000 // never START a trip inside the last 5.5 min
export const BANK_TRIP_FLOOR_MS = 120000 // (v0.28.0) a late bank keeps the 120s mid-run cap as the floor
export const BANK_TRIP_CAP_MS = 300000 // hard ceiling - the 420s hard-kill margin is sacred

/**
 * Should this bot START a planned bank trip now? True when the pockets hold
 * enough loot (units, non-KEEP), enough digging time passed since the last
 * attempt, and the run has enough time LEFT to finish the whole trip without
 * colliding with the end-phase (trip budget <= 300s + the 90s return walk fits
 * inside minRemainingMs). Junk input = no trip (the mining loop must decide
 * fast and never on garbage).
 */
export function bankTripDue ({ units = 0, msSinceBank = 0, remainingMs = Infinity, everyMs = BANK_TRIP_EVERY_MS, minUnits = BANK_TRIP_MIN_UNITS, minRemainingMs = BANK_TRIP_MIN_REMAINING_MS } = {}) {
  const u = Number.isFinite(units) && units > 0 ? units : 0
  if (u < minUnits) return false // nothing worth the walk
  if (!Number.isFinite(remainingMs) || remainingMs < minRemainingMs) return false // too late for a full trip
  const every = Number.isFinite(everyMs) && everyMs > 0 ? everyMs : BANK_TRIP_EVERY_MS
  const since = Number.isFinite(msSinceBank) && msSinceBank > 0 ? msSinceBank : 0
  return since >= every
}

/**
 * The chain budget a planned bank trip may use. The walk there AND back is
 * dist-scaled (2x the straight distance at CHEST_WALK_PER_BLOCK_MS is the
 * measured rule - fleet #128), plus the climb out (~90s measured across
 * v0.26-v0.29 fleets) and the deposit itself (~45s for the chest hops).
 * Clamped to [floor, cap] so arithmetic on junk input can never overrun the
 * hard-kill margin.
 */
export function bankTripBudgetMs ({ yardDist = 0, floorMs = BANK_TRIP_FLOOR_MS, capMs = BANK_TRIP_CAP_MS } = {}) {
  const d = Number.isFinite(yardDist) && yardDist > 0 ? yardDist : 0
  const raw = 90000 + 45000 + 2 * d * CHEST_WALK_PER_BLOCK_MS // climb + deposit + there-and-back
  const floor = Number.isFinite(floorMs) && floorMs > 0 ? floorMs : BANK_TRIP_FLOOR_MS
  const cap = Number.isFinite(capMs) && capMs > floor ? capMs : BANK_TRIP_CAP_MS
  return Math.min(Math.max(raw, floor), cap)
}

export function findChest (bot, { maxDistance = 64, exclude = [] } = {}) {
  try {
    return bot.findBlock({
      matching: b => {
        if (!(CHEST_NAMES.includes(b.name) || /_chest$/.test(b.name))) return false
        // (v0.23.1) a chest the bot already failed to reach ('No path') is skipped:
        // the yard holds dozens of chests, one unreachable slot must not strand
        // the whole delivery
        if (exclude.length > 0 && b.position) {
          const p = typeof b.position.floored === 'function' ? b.position.floored() : b.position
          const hit = exclude.some(e => e && e.x === p.x && e.y === p.y && e.z === p.z)
          if (hit) return false
        }
        return true
      },
      maxDistance
    })
  } catch {
    return null
  }
}

// (v0.18.5) The chest walk budget, dist-scaled like mapTrip's (tripplan.walkBudgetMs).
// FLEET #128 EVIDENCE (19 bots, 600s, the first fully healthy run): 77 bank attempts,
// banked=0 - the flat timeoutMs=30000 killed every walk to a chest beyond ~25 blocks
// ('chest unreachable (Path was stopped before it could be completed!)'): the walk is
// not the straight line the distance suggests, it is shaft-mouth escape + terrain
// detours (2x the straight distance is the rule, not the exception), and the timeout
// then poisons the RETRY too (the stop races the next goto). The budget scales at
// 500 ms/block (2x the pathfinder ground speed = detour allowance), keeps the
// historical 30s floor for near chests and caps at 60s - still bounded, the
// v0.11.2/v0.6.4 OOM lesson (no open-ended walk windows) stays honoured.
export const CHEST_WALK_BASE_MS = 30000
export const CHEST_WALK_PER_BLOCK_MS = 500
export const CHEST_WALK_CAP_MS = 60000

// (v0.27.0) END-PHASE WALL CLOCK - the fleet's last unbounded loop, closed.
//
// MEASURED (dispatch 35544781892, 600s on 504f744): 17 staggered final climbs
// - 1 OK, 16 'stalled'/'timeout' - and then EVERY bot entered smeltThenBank at
// once. Inside it the deposit chain is combinatorial: depositToChests hops up
// to maxChests=8 chests, each hop walks up to 2x the dist-scaled budget, the
// yard walk retries 3x120s, and the whole chain runs twice (pre-deposit + the
// final deposit). Worst case per bot: tens of minutes - all of it SILENT (a
// failed hop only returns a reason string, nothing prints). 19 bots x doomed
// walks also re-saturated the path throttle (path=6a/6q, stale +3-5/15s), so
// every walk additionally waited 100-150s for a slot that another doomed walk
// held. Nothing finished, FLEET RESULT never printed, HARD KILL (v0.26.0) had
// to take the evidence.
//
// THE CURE is a wall-clock budget threaded down the chain: a caller with a
// deadline passes budgetMs, every hop clamps its walk into the remaining
// time, and a hop that cannot fit its floor gives up immediately with a named
// reason. Bounded chain -> Promise.all(runners) resolves -> printFinalReport
// prints with FULL evidence (fleet-report.json + worldmap save) instead of
// the hard kill's partials. floorMs: a walk with less than this left cannot
// even cross a yard - returning 'budget exhausted' beats burning it on a
// guaranteed timeout.
export const BUDGET_WALK_FLOOR_MS = 5000

/**
 * Pure clamp: the walk budget this attempt may actually use.
 * Junk-tolerant: non-finite remainingMs means UNBOUNDED (no deadline in play)
 * -> the walk's own budget passes through untouched.
 * @param {object} [p]
 * @param {number} [p.distBudget] the walk's own budget (dist-scaled or pinned)
 * @param {number} [p.remainingMs] wall clock left on the caller's budget
 * @param {number} [p.floorMs] below this the walk cannot usefully start (default BUDGET_WALK_FLOOR_MS)
 * @returns {number} ms for this walk; 0 = do not walk (report 'budget exhausted')
 */
export function effectiveWalkBudget ({ distBudget = CHEST_WALK_BASE_MS, remainingMs = Infinity, floorMs = BUDGET_WALK_FLOOR_MS } = {}) {
  const d = Number.isFinite(distBudget) && distBudget > 0 ? distBudget : CHEST_WALK_BASE_MS
  if (!Number.isFinite(remainingMs)) return d // no deadline in play - legacy behavior
  const left = remainingMs
  if (!Number.isFinite(left) || left <= 0) return 0
  const floor = Number.isFinite(floorMs) && floorMs > 0 ? floorMs : BUDGET_WALK_FLOOR_MS
  if (left < floor) return 0 // cannot usefully start - say so instead of timing out
  return Math.min(d, left)
}

export function chestWalkBudgetMs (dist) {
  return walkBudgetMs({
    dist,
    base: CHEST_WALK_BASE_MS,
    perBlock: CHEST_WALK_PER_BLOCK_MS,
    cap: CHEST_WALK_CAP_MS,
    overhead: 5000
  })
}

/**
 * Deposit everything non-essential into a chest. Steps: pick a chest (the nearest one
 * unless given), walk to it on foot, open the window, deposit item by item (a full or
 * desynced chest only costs us that one item type), close it. Never throws - the return
 * value tells the caller what happened, because a failed deposit must not kill a bot.
 *
 * (v0.18.5) The walk is rescue-aware: a bot mid-drowning used to lose the attempt
 * INSTANTLY ('chest unreachable (water rescue in progress (walk to chest refused))' -
 * fleet #128 line class) because the fail-fast gate refuses goals while the rescue
 * owns the controls. Now: the first refusal waits out ONE bounded rescue window
 * (waitForWaterRescueClear, the same treatment smeltBatch got in v0.18.2) and retries
 * once with the same budget - the rescue's 25s window is cheaper than the walk's
 * whole deposit being lost.
 */
export async function depositToChest (bot, {
  chestBlock = null,
  keep = KEEP,
  maxDistance = 64,
  log = () => {},
  timeoutMs = null, // null = dist-scaled auto budget (chestWalkBudgetMs); a number pins it (tests)
  budgetMs = null, // (v0.27.0) wall-clock cap on the WHOLE attempt (walk retries incl.) - the end-phase chain budget
  exclude = [] // (v0.23.1) chest positions already dead-ended ('No path') - skipped in the scan
} = {}) {
  const chest = chestBlock ?? findChest(bot, { maxDistance, exclude })
  if (!chest) return { deposited: 0, reason: 'no chest in range' }
  const tag = `[${bot.username ?? 'bot'}]`

  // (v0.27.0) the chain budget: a finite budgetMs > 0 sets a deadline every
  // walk must fit; an explicit <= 0 means the caller already knows the clock
  // is spent (skip without walking); junk/null = unbounded (legacy mid-run).
  const hasBudget = Number.isFinite(budgetMs)
  if (hasBudget && budgetMs <= 0) return { deposited: 0, reason: 'budget exhausted' }
  const deadline = hasBudget && budgetMs > 0 ? Date.now() + budgetMs : null
  const remaining = () => (deadline == null ? Infinity : deadline - Date.now())

  let budget = CHEST_WALK_BASE_MS
  if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
    budget = timeoutMs // explicit caller choice wins
  } else if (bot.entity?.position?.distanceTo && chest.position) {
    try { budget = chestWalkBudgetMs(bot.entity.position.distanceTo(chest.position)) } catch { /* floor stays */ }
  }

  // (v0.21.0) bank walks jump the fleet queue: a banked walk is the only one that
  // turns mined blocks into stock - under path saturation it must not wait behind
  // next-column walks (fleet v0.19.2: path=6a/10q at final-bank time, banked=0).
  // (v0.27.0) each attempt re-clamps into the remaining wall clock - a retry may
  // not restart the full budget after the first attempt already ate most of it.
  const walkOnce = async label => {
    const ms = effectiveWalkBudget({ distBudget: budget, remainingMs: remaining() })
    if (ms <= 0) throw new Error('budget exhausted (walk floor)')
    return gotoSafe(bot, new goals.GoalNear(chest.position.x, chest.position.y, chest.position.z, 2), { timeoutMs: ms, label, priority: PATH_PRIO_BANK })
  }
  // (v0.20.1) ONE retry policy for every walk-failure class: walkRetryPlan is the
  // single source of truth (the yard walk in fleet19.mjs has run it since v0.19.0).
  //   water rescue -> wait out the rescue window, then the retry (v0.18.5 behavior)
  //   Path stopped -> immediate retry - the stale-flag settle transient that fleet
  //     #128 measured 77x (banked=0, 3298 blocks stuck in pockets); the v0.20.0
  //     gotoSafe pre-clear defuses the poison at the SOURCE, this retry is the
  //     belt-and-braces layer for whatever else stops a path mid-walk
  //   timeout -> one retry (the first budget may have burned on a poisoned/stuck
  //     walk, not on real distance); still bounded: max 2 walks x 60s cap
  //   everything else (no path, ...) -> give up, the geometry is real
  let walked = false
  let lastError = null
  for (let attempt = 1; attempt <= 2 && !walked; attempt++) {
    try {
      await walkOnce(attempt === 1 ? 'walk to chest' : 'walk to chest (retry)')
      walked = true
    } catch (e) {
      lastError = e
      const plan = walkRetryPlan({ error: e, attempt, maxAttempts: 2 })
      if (plan.action === 'wait-rescue') {
        const cleared = await waitForWaterRescueClear(bot, { maxMs: plan.waitMs })
        if (!cleared) break // the rescue owns the bot longer than its own window - a stuck sentry
        continue
      }
      if (plan.action === 'immediate' || plan.action === 'timeout-retry') continue
      break // give-up: real geometry or the attempt budget is spent
    }
  }
  if (!walked) {
    const lastMsg = lastError && lastError.message ? lastError.message : 'walk failed'
    // (v0.23.1) ONE CHEST MUST NOT STRAND THE DELIVERY. FLEET EVIDENCE (3e21d58,
    // final bank): 5x 'chest unreachable (No path to the goal!)' - the NEAREST
    // chest's walk dead-ends (a pond between, a terrain rim, unloaded chunks) and
    // the whole deposit died with the loot still in pockets while the yard held
    // dozens of other chests. When the caller let US pick the chest (chestBlock
    // null) and the failure is the pathfinder's 'No path' (not a timeout, not a
    // rescue), exclude exactly that chest and scan again - once (exclude.length
    // guard): two dead chests mean the terrain is the problem, not the slot.
    // A caller who pinned chestBlock gets their failure back: their choice is final.
    if (!chestBlock && exclude.length === 0 && /No path/i.test(lastMsg) && chest.position) {
      const dead = typeof chest.position.floored === 'function' ? chest.position.floored() : chest.position
      if (dead && Number.isFinite(dead.x)) {
        // the hop is a resilience attempt: report the PRIMARY failure ('No path to
        // the nearest chest') when the second candidate also fails, and the second
        // candidate's success when it does not
        // (v0.27.0) the hop inherits the SAME wall clock, not a fresh budget
        const second = await depositToChest(bot, { keep, maxDistance, log, timeoutMs, budgetMs: remaining(), exclude: [dead] })
        if (second.deposited > 0) return second
        return { deposited: 0, reason: `chest unreachable (${lastMsg})` }
      }
    }
    return { deposited: 0, reason: `chest unreachable (${lastMsg})` }
  }

  // (v0.25.0) TWO open attempts: fleet 35538062596 F10 walked the whole way and
  // died here - 'cannot open chest (open chest: timeout after 10000ms)' - while
  // the server lagged 1.3s per event (late=1324ms under 19 bots): a slow window
  // open must not void a 60s walk. One re-look + one retry costs seconds; a lost
  // deposit costs the whole pocket.
  let window = null
  let openErr = null
  for (let attempt = 1; attempt <= 2 && !window; attempt++) {
    try {
      window = await withTimeout(bot.openChest(chest), 10000, 'open chest')
    } catch (e) {
      openErr = e
      if (attempt === 1) {
        try { await bot.lookAt(chest.position.offset(0.5, 0.5, 0.5), true) } catch { /* retry anyway */ }
      }
    }
  }
  if (!window) {
    return { deposited: 0, reason: `cannot open chest (${openErr && openErr.message ? openErr.message : 'unknown'})` }
  }

  let deposited = 0
  const skipped = []
  const countOf = name => bot.inventory.items().filter(i => i.name === name).reduce((a, i) => a + i.count, 0)
  try {
    for (const item of bot.inventory.items()) {
      if (keep.some(k => item.name.includes(k))) { skipped.push(item.name); continue }
      // VERIFIED TRANSFER (the 26.2 stack silently drops some window clicks): the only
      // truth is the inventory afterwards, so count before/after instead of trusting
      // the deposit call's resolution.
      const before = countOf(item.name)
      try {
        await withTimeout(window.deposit(item.type, null, item.count), 5000, `deposit ${item.name}`)
      } catch {
        skipped.push(item.name) // chest full or a desynced slot - keep the item, move on
        continue
      }
      const moved = before - countOf(item.name)
      if (moved > 0) deposited += moved
      else skipped.push(item.name)
    }
  } finally {
    try { window.close?.() } catch { /* already closed */ }
  }
  if (deposited > 0) log(`${tag} banked ${deposited} items at ${chest.position.floored()} (kept: ${skipped.slice(0, 4).join(', ') || 'nothing'})`)
  return { deposited, reason: deposited > 0 ? 'ok' : 'nothing to deposit' }
}

/**
 * Multi-chest continuation: keep walking to the nearest UNUSED chest while bankable
 * items remain. A single full chest then costs a walk, not the whole delivery.
 * Returns { deposited, chestsUsed, chestReport } - never throws.
 */
export async function depositToChests (bot, { maxChests = 8, findRadius = 64, keep = KEEP, log = () => {}, budgetMs = null } = {}) {
  let total = 0
  let chestsUsed = 0
  const reports = []
  const tried = [] // (v0.23.1) chest positions that refused a walk ('No path')
  // (v0.27.0) chain budget: finite > 0 = deadline for the WHOLE hop loop; <= 0 =
  // already spent (no hop at all); junk/null = unbounded (legacy mid-run calls).
  const hasBudget = Number.isFinite(budgetMs)
  if (hasBudget && budgetMs <= 0) return { deposited: 0, chestsUsed: 0, chestReport: ['budget exhausted'] }
  const deadline = hasBudget && budgetMs > 0 ? Date.now() + budgetMs : null
  const remaining = () => (deadline == null ? Infinity : deadline - Date.now())
  const bankableItems = () => {
    try {
      return bot.inventory.items().filter(i => !keep.some(k => i.name.includes(k))).reduce((a, i) => a + i.count, 0)
    } catch { return 0 }
  }
  for (let n = 0; n < maxChests && bankableItems() > 0; n++) {
    if (deadline != null && remaining() <= 0) { reports.push('budget exhausted'); break }
    const chest = findChest(bot, { maxDistance: findRadius, exclude: tried })
    if (!chest) break
    const res = await depositToChest(bot, { chestBlock: chest, keep, log, budgetMs: remaining() })
    reports.push(res.reason)
    if (res.deposited > 0) { total += res.deposited; chestsUsed++ } else {
      // (v0.23.1) FLEET EVIDENCE (3e21d58): 5x 'chest unreachable (No path to the
      // goal!)' at final bank - the NEAREST chest's walk dead-ends (a pond, a rim,
      // unloaded chunks) and the whole deposit died with the loot still in pockets.
      // (v0.25.0) THE FULL CHEST JOINS THE EXCLUSION LIST: fleet 35538062596 F18
      // walked to the yard, every click was rejected by a full chest
      // ('bank: 0 (nothing to deposit)') and the delivery died with 200+ units
      // still in the pocket while chest #2 stood empty beside it. ANY zero at a
      // reached chest with bankable items left means THIS chest is dead for us
      // (full, ghost-click desync, unopenable window) - exclude it and try the
      // next nearest, still bounded by maxChests. 'no chest in range' stays a
      // plain break: there is nothing to hop from.
      const r = String(res.reason || '')
      const chestDead = /nothing to deposit|cannot open chest|chest unreachable/i.test(r)
      if (chestDead && chest.position) {
        tried.push(chest.position.floored())
        continue
      }
      break
    }
  }
  return { deposited: total, chestsUsed, chestReport: reports }
}

// (v0.16.4) The banking chain's invisible zero, made decidable. Fleet #122 climbed
// out for 'bank' 15+ times and banked=0 forever: depositToChest returned
// 'no chest in range' (the chest warehouse sits at the yard/spawn while a 600s bot
// digs 100-300 blocks out, way beyond findChest's 64-block scan) and the caller
// swallowed the reason. This pure predicate turns a failed deposit into an action:
//   done  - the deposit worked, nothing to add
//   walk  - no chest nearby, but the yard is close enough to walk back to
//   none  - nothing sane to do (other failure reasons, no yard known, too far)
// Pure arithmetic on plain values (positions stay in the caller) so CI can test
// every branch without a server.
export function bankFallback ({ deposited = 0, reason = '', yardDist = null, maxWalkBlocks = 400 } = {}) {
  if (deposited > 0) return { action: 'done' }
  if (!/no chest/i.test(String(reason || ''))) return { action: 'none', why: reason || 'unknown reason' }
  if (yardDist == null || !Number.isFinite(yardDist)) return { action: 'none', why: 'no yard position known' }
  if (yardDist >= maxWalkBlocks) return { action: 'none', why: `yard is ${Math.round(yardDist)} blocks away (walk cap ${maxWalkBlocks})` }
  return { action: 'walk', dist: Math.round(yardDist) }
}
