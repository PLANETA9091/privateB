// Tool bootstrap: no op, no gifts - the bot chops wood and crafts its own kit.
// logs -> planks -> sticks -> crafting table -> wooden pickaxe/shovel -> stone tools.
import { Vec3 } from 'vec3'

export const LOG_BLOCKS = ['oak_log', 'birch_log', 'spruce_log', 'jungle_log', 'dark_oak_log', 'acacia_log', 'mangrove_log']
const LOG_ITEMS = LOG_BLOCKS.map(n => n.replace('_log', '_log'))

const inventoryItems = bot => bot.inventory.items()
export const countItem = (bot, name) => inventoryItems(bot).filter(i => i.name === name).reduce((a, i) => a + i.count, 0)
export const countLogs = bot => LOG_BLOCKS.reduce((a, n) => a + countItem(bot, n), 0)
export const hasKind = (bot, kind) => inventoryItems(bot).some(i => i.name.includes(kind))

function recipeFor (bot, itemName, table) {
  const id = bot.registry.itemsByName[itemName]?.id
  if (id == null) return null
  const recipes = bot.recipesFor(id, null, 1, table ?? null)
  return recipes?.length ? recipes[0] : null
}

async function craft (bot, itemName, times, table = null) {
  const recipe = recipeFor(bot, itemName, table)
  if (!recipe) return false
  try {
    await bot.craft(recipe, times, table ?? null)
    return true
  } catch {
    return false
  }
}

// Put a crafting table on the ground in front of the bot and return the Block, or null.
async function placeTable (bot) {
  const existing = bot.findBlock({ matching: b => b.name === 'crafting_table', maxDistance: 24 })
  if (existing) return existing
  const tableItem = inventoryItems(bot).find(i => i.name === 'crafting_table')
  if (!tableItem) return null
  try {
    await bot.equip(tableItem, 'hand')
    const below = bot.blockAt(bot.entity.position.offset(0, -1, 0))
    if (below && below.boundingBox !== 'empty') {
      await bot.placeBlock(below, new Vec3(0, 1, 0))
      const placed = bot.blockAt(bot.entity.position.offset(0, -1, 0).offset(0, 1, 0))
      if (placed && placed.name === 'crafting_table') return placed
    }
  } catch { /* fall through */ }
  return bot.findBlock({ matching: b => b.name === 'crafting_table', maxDistance: 24 })
}

/**
 * Makes sure the bot holds a pickaxe and a shovel (wooden at least, stone if it can).
 * Returns { ok, kit } describing what it ended up with.
 */
export async function ensureTools (bot, { miner = null, log = () => {}, maxSeconds = 240 } = {}) {
  const started = Date.now()
  const step = msg => log(`[tools] ${msg}`)
  const timeLeft = () => maxSeconds - (Date.now() - started) / 1000

  // 1. wood (bare hands chop logs fine)
  if (countLogs(bot) < 6 && miner) {
    for (const name of LOG_BLOCKS) {
      if (countLogs(bot) >= 6 || timeLeft() < 30) break
      try {
        await miner.harvestSite(name, { want: 6 - countLogs(bot), searchRadius: 64, maxSeconds: Math.min(90, Math.max(20, timeLeft() - 20)) })
      } catch { /* try the next wood type */ }
    }
    step(`logs: ${countLogs(bot)}`)
  }

  // 2. planks -> sticks -> table (all 2x2, no table needed yet)
  const planksName = ['oak_planks', 'birch_planks', 'spruce_planks', 'jungle_planks', 'dark_oak_planks', 'acacia_planks', 'mangrove_planks']
    .find(n => recipeFor(bot, n, null))
  if (!planksName) return { ok: false, kit: 'no planks recipe' }
  let planks = planksName ? countItem(bot, planksName) : 0
  if (planks < 8) {
    for (let i = 0; i < 4 && countItem(bot, planksName) < 12; i++) await craft(bot, planksName, 1)
    planks = countItem(bot, planksName)
  }
  if (countItem(bot, 'stick') < 4) await craft(bot, 'stick', 1)
  if (!hasKind(bot, 'crafting_table')) await craft(bot, 'crafting_table', 1)
  step(`planks ${countItem(bot, planksName)} sticks ${countItem(bot, 'stick')} table ${countItem(bot, 'crafting_table')}`)

  const table = await placeTable(bot)
  if (!table) return { ok: false, kit: 'no crafting table' }

  // 3. wooden tools, then stone ones if we can mine cobblestone
  if (!hasKind(bot, 'pickaxe')) await craft(bot, 'wooden_pickaxe', 1, table)
  if (!hasKind(bot, 'shovel')) await craft(bot, 'wooden_shovel', 1, table)
  step(`wooden: pickaxe=${hasKind(bot, 'pickaxe')} shovel=${hasKind(bot, 'shovel')}`)

  if (hasKind(bot, 'pickaxe') && countItem(bot, 'cobblestone') < 4 && miner) {
    try {
      await miner.harvestSite('stone', { want: 6, searchRadius: 64, maxSeconds: Math.min(60, Math.max(20, timeLeft())) })
    } catch { /* keep the wooden kit */ }
  }
  const cobble = countItem(bot, 'cobblestone')
  if (cobble >= 3) {
    await craft(bot, 'stone_pickaxe', 1, table)
    if (cobble >= 4) await craft(bot, 'stone_shovel', 1, table)
  }
  step(`final: ${inventoryItems(bot).filter(i => i.name.includes('pickaxe') || i.name.includes('shovel') || i.name.includes('axe')).map(i => i.name).join(', ') || 'none'}`)
  return { ok: hasKind(bot, 'pickaxe'), kit: inventoryItems(bot).filter(i => i.name.includes('pickaxe')).map(i => i.name).join(',') }
}
