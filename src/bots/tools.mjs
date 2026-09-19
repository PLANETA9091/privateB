// Tool bootstrap: no op, no gifts - the bot chops wood and crafts its own kit.
// logs -> planks -> sticks -> crafting table -> wooden pickaxe/shovel -> stone tools.
import { Vec3 } from 'vec3'
import { withTimeout } from '../lib/jobqueue.mjs'

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
  const id = bot.registry.itemsByName[itemName]?.id
  if (id == null) return false
  const recipes = bot.recipesFor(id, null, 1, table ?? null) || []
  if (!recipes.length) return false
  // A tree-fleet inventory holds MIXED plank types (oak + birch + ...); every plank
  // recipe exists once per plank type, and recipes[0] may be the variant whose plank
  // we do not have - that is why the pickaxe "never" crafted while the shovel did.
  // Try every variant before giving up.
  for (const recipe of recipes) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        // bot.craft can hang when the window desyncs - fence it with a hard timeout
        await withTimeout(bot.craft(recipe, times, table ?? null), 15000, `craft ${itemName}`)
        return true
      } catch { /* next attempt / next variant */ }
    }
  }
  return false
}

// Put a crafting table on the ground and return the Block, or null.
// Vanilla refuses a placement that intersects ANY entity hitbox: the old code placed
// the table onto the block BELOW us, i.e. into the very cell the bot stands in, and
// the server silently rejected it - the bot kept holding the table and every later
// tool craft failed with 'no crafting table'. Use a free neighbour cell instead.
//
// Treetop spawns need one more trick: on a canopy every neighbour cell has AIR below
// it, so there is nowhere to put the table. If no spot works and the block under us is
// diggable, dig it, fall towards the terrain and retry - on the ground the neighbours'
// floors are solid dirt/grass.
// A table the bot cannot reach is useless for crafting: two bots spawn ~18 blocks
// apart, so placeTable must never "reuse" the OTHER bot's table (openCraftingTable on
// an out-of-reach block hangs until the craft timeout burns the whole budget).
const TABLE_REACH = 4.5
const reachableTable = bot => bot.findBlock({
  matching: b => b.name === 'crafting_table' &&
    bot.entity.position.distanceTo(b.position) <= TABLE_REACH,
  maxDistance: TABLE_REACH
})

async function placeTable (bot, { rounds = 3 } = {}) {
  const find = () => reachableTable(bot)
  for (let round = 0; round < rounds; round++) {
    const existing = find()
    if (existing) return existing
    const tableItem = inventoryItems(bot).find(i => i.name === 'crafting_table')
    if (!tableItem) return null
    try {
      await bot.equip(tableItem, 'hand')
      const feet = bot.entity.position.floored()
      let placed = false
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
        const cell = feet.offset(dx, 0, dz)
        const cellB = bot.blockAt(cell)
        const floorB = bot.blockAt(cell.offset(0, -1, 0))
        if (cellB && cellB.boundingBox === 'empty' && floorB && floorB.boundingBox !== 'empty' && floorB.boundingBox !== 'fluid') {
          try {
            await bot.placeBlock(floorB, new Vec3(0, 1, 0))
            const placedB = bot.blockAt(cell)
            if (placedB && placedB.name === 'crafting_table') return placedB
            placed = true
          } catch { /* next neighbour */ }
        }
      }
      if (placed) continue // a block appeared (maybe not the table) - look again
      // nowhere to place (treetop / mid-air): eat the block below and fall to the terrain
      const below = bot.blockAt(bot.entity.position.floored().offset(0, -1, 0))
      if (below && below.type !== 0 && below.boundingBox !== 'fluid') {
        // bot.dig has no internal timeout - fence it (a hanging dig would freeze ensureTools)
        await withTimeout(bot.dig(below), 10000, 'dig below for table placement')
        await bot.waitForTicks(15) // fall one block
      } else {
        await bot.waitForTicks(10) // already airborne - let gravity settle us
      }
    } catch { /* fall through to the next round */ }
  }
  return find()
}

/**
 * Makes sure the bot holds a pickaxe and a shovel (wooden at least, stone if it can).
 * Returns { ok, kit } describing what it ended up with.
 */
export async function ensureTools (bot, { miner = null, log = () => {}, maxSeconds = 60 } = {}) {
  const started = Date.now()
  const step = msg => log(`[tools] ${msg}`)
  const timeLeft = () => maxSeconds - (Date.now() - started) / 1000

  // 1. wood - short budget, on foot, never a long fly-around (that used to eat minutes per bot)
  if (countLogs(bot) < 6 && miner) {
    for (const name of LOG_BLOCKS) {
      if (countLogs(bot) >= 6 || timeLeft() < 20) break
      try {
        await miner.collectArea([name, name.replace('_log', '_wood')], {
          count: 3,
          hopDistance: 14,
          perBlockTimeoutMs: 8000,
          shouldStop: () => countLogs(bot) >= 6 || timeLeft() < 15
        })
      } catch { /* next wood type */ }
    }
    step(`logs: ${countLogs(bot)}`)
  }

  // 2. planks -> sticks -> table (all 2x2, no table needed yet)
  // Craft planks out of EVERY log type we actually hold: the old code always picked
  // the oak recipe, so a bot holding birch logs accumulated planks it could not use
  // and every craft after that silently failed.
  const PLANK_OF = {
    oak_log: 'oak_planks', birch_log: 'birch_planks', spruce_log: 'spruce_planks',
    jungle_log: 'jungle_planks', dark_oak_log: 'dark_oak_planks', acacia_log: 'acacia_planks',
    mangrove_log: 'mangrove_planks'
  }
  for (const [logName, plankName] of Object.entries(PLANK_OF)) {
    for (let i = 0; i < 6 && countItem(bot, logName) > 0 && countItem(bot, plankName) < 8; i++) {
      if (!await craft(bot, plankName, 1)) break
    }
  }
  const PLANK_TYPES = ['oak_planks', 'birch_planks', 'spruce_planks', 'jungle_planks', 'dark_oak_planks', 'acacia_planks', 'mangrove_planks']
  const planksName = PLANK_TYPES.find(n => countItem(bot, n) >= 4) ?? PLANK_TYPES.find(n => recipeFor(bot, n, null))
  if (!planksName) return { ok: false, kit: 'no planks recipe' }
  const planks = PLANK_TYPES.reduce((a, n) => a + countItem(bot, n), 0)
  if (countItem(bot, 'stick') < 4) await craft(bot, 'stick', 1)
  if (!hasKind(bot, 'crafting_table')) await craft(bot, 'crafting_table', 1)
  step(`planks ${planks} sticks ${countItem(bot, 'stick')} table ${countItem(bot, 'crafting_table')}`)

  const table = await placeTable(bot)
  if (!table) return { ok: false, kit: 'no crafting table' }

  // 3. wooden tools, then stone ones if we can mine cobblestone
  if (!hasKind(bot, 'pickaxe')) await craft(bot, 'wooden_pickaxe', 1, table)
  if (!hasKind(bot, 'shovel')) await craft(bot, 'wooden_shovel', 1, table)
  step(`wooden: pickaxe=${hasKind(bot, 'pickaxe')} shovel=${hasKind(bot, 'shovel')}`)

  if (hasKind(bot, 'pickaxe') && countItem(bot, 'cobblestone') < 4 && miner) {
    try {
      await miner.digShaft(['stone', 'cobblestone', 'andesite', 'diorite', 'tuff'], {
        maxBlocks: 6,
        shouldStop: () => countItem(bot, 'cobblestone') >= 4 || timeLeft() < 15
      })
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
