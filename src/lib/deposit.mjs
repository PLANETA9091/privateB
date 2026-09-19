// Inventory overflow: when a bot's pockets fill up it walks to the nearest chest and
// banks everything except its working kit. The yard (scripts/setup-yard.mjs) keeps
// input rows of chests at spawn, so the walk-back is short for fleet bots working
// around the origin. No op, no commands - vanilla chest windows only.
import pathfinderPkg from 'mineflayer-pathfinder'
import { gotoSafe, withTimeout } from './jobqueue.mjs'

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

/**
 * Deposit everything non-essential into a chest. Steps: pick a chest (the nearest one
 * unless given), walk to it on foot, open the window, deposit item by item (a full or
 * desynced chest only costs us that one item type), close it. Never throws - the return
 * value tells the caller what happened, because a failed deposit must not kill a bot.
 */
export async function depositToChest (bot, {
  chestBlock = null,
  keep = KEEP,
  maxDistance = 64,
  log = () => {},
  timeoutMs = 30000
} = {}) {
  const chest = chestBlock ?? findChest(bot, { maxDistance })
  if (!chest) return { deposited: 0, reason: 'no chest in range' }
  const tag = `[${bot.username ?? 'bot'}]`

  try {
    await gotoSafe(bot, new goals.GoalNear(chest.position.x, chest.position.y, chest.position.z, 2), { timeoutMs, label: 'walk to chest' })
  } catch (e) {
    return { deposited: 0, reason: `chest unreachable (${e.message})` }
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
