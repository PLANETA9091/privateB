// Inventory overflow: when a bot's pockets fill up it walks to the nearest chest and
// banks everything except its working kit. The yard (scripts/setup-yard.mjs) keeps
// input rows of chests at spawn, so the walk-back is short for fleet bots working
// around the origin. No op, no commands - vanilla chest windows only.
import pathfinderPkg from 'mineflayer-pathfinder'
import { gotoSafe, withTimeout } from './jobqueue.mjs'

const { goals } = pathfinderPkg

export const CHEST_NAMES = ['chest', 'trapped_chest', 'barrel', 'ender_chest']

// Never banked: the bot needs these to keep working (and to survive the night).
export const KEEP = [
  'pickaxe', 'shovel', 'axe', 'sword', 'hoe', 'crafting_table', 'furnace',
  'stick', 'planks', 'log', 'torch', 'bread', 'apple', 'porkchop', 'beef',
  'carrot', 'potato', 'cooked_'
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
  try {
    for (const item of bot.inventory.items()) {
      if (keep.some(k => item.name.includes(k))) { skipped.push(item.name); continue }
      try {
        await withTimeout(window.deposit(item.type, null, item.count), 5000, `deposit ${item.name}`)
        deposited += item.count
      } catch {
        skipped.push(item.name) // chest full or a desynced slot - keep the item, move on
      }
    }
  } finally {
    try { window.close?.() } catch { /* already closed */ }
  }
  if (deposited > 0) log(`${tag} banked ${deposited} items at ${chest.position.floored()} (kept: ${skipped.slice(0, 4).join(', ') || 'nothing'})`)
  return { deposited, reason: deposited > 0 ? 'ok' : 'nothing to deposit' }
}
