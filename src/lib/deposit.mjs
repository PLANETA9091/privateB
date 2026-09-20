// Inventory overflow: when a bot's pockets fill up it walks to the nearest chest and
// banks everything except its working kit. The yard (scripts/setup-yard.mjs) keeps
// input rows of chests at spawn, so the walk-back is short for fleet bots working
// around the origin. No op, no commands - vanilla chest windows only.
import pathfinderPkg from 'mineflayer-pathfinder'
import { gotoSafe, withTimeout, waitForWaterRescueClear } from './jobqueue.mjs'
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

export function findChest (bot, { maxDistance = 64 } = {}) {
  try {
    return bot.findBlock({
      matching: b => CHEST_NAMES.includes(b.name) || /_chest$/.test(b.name),
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
  timeoutMs = null // null = dist-scaled auto budget (chestWalkBudgetMs); a number pins it (tests)
} = {}) {
  const chest = chestBlock ?? findChest(bot, { maxDistance })
  if (!chest) return { deposited: 0, reason: 'no chest in range' }
  const tag = `[${bot.username ?? 'bot'}]`

  let budget = CHEST_WALK_BASE_MS
  if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
    budget = timeoutMs // explicit caller choice wins
  } else if (bot.entity?.position?.distanceTo && chest.position) {
    try { budget = chestWalkBudgetMs(bot.entity.position.distanceTo(chest.position)) } catch { /* floor stays */ }
  }

  const walkOnce = async label => gotoSafe(bot, new goals.GoalNear(chest.position.x, chest.position.y, chest.position.z, 2), { timeoutMs: budget, label })
  try {
    await walkOnce('walk to chest')
  } catch (e) {
    if (!/water rescue/i.test(String(e?.message))) {
      return { deposited: 0, reason: `chest unreachable (${e.message})` }
    }
    // the drowning rescue owns the bot right now - wait it out (bounded), then try once
    const cleared = await waitForWaterRescueClear(bot)
    if (!cleared) return { deposited: 0, reason: `chest unreachable (${e.message})` }
    try {
      await walkOnce('walk to chest (rescue cleared)')
    } catch (e2) {
      return { deposited: 0, reason: `chest unreachable (${e2.message})` }
    }
  }

  let window
  try {
    window = await withTimeout(bot.openChest(chest), 10000, 'open chest')
  } catch (e) {
    return { deposited: 0, reason: `cannot open chest (${e.message})` }
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
export async function depositToChests (bot, { maxChests = 8, findRadius = 64, keep = KEEP, log = () => {} } = {}) {
  let total = 0
  let chestsUsed = 0
  const reports = []
  const bankableItems = () => {
    try {
      return bot.inventory.items().filter(i => !keep.some(k => i.name.includes(k))).reduce((a, i) => a + i.count, 0)
    } catch { return 0 }
  }
  for (let n = 0; n < maxChests && bankableItems() > 0; n++) {
    const chest = findChest(bot, { maxDistance: findRadius })
    if (!chest) break
    const res = await depositToChest(bot, { chestBlock: chest, keep, log })
    reports.push(res.reason)
    if (res.deposited > 0) { total += res.deposited; chestsUsed++ } else break // same chest again = no progress
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
