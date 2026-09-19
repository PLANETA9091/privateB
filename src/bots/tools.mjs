// Tool bootstrap: no op, no gifts - the bot chops wood and crafts its own kit.
// logs -> planks -> sticks -> crafting table -> wooden pickaxe/shovel -> stone tools.
import { Vec3 } from 'vec3'
import { withTimeout } from '../lib/jobqueue.mjs'

export const LOG_BLOCKS = ['oak_log', 'spruce_log', 'birch_log', 'jungle_log', 'acacia_log', 'cherry_log', 'pale_oak_log', 'dark_oak_log', 'mangrove_log', 'bamboo_block', 'crimson_stem', 'warped_stem']
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

// The patched 26.2 crafting occasionally leaves ingredients stuck in the 2x2 craft
// grid of the player inventory window. Those items are invisible to
// bot.inventory.items() (that is how planks 'vanished': oak 12 -> oak 0) and starve
// every later craft with 'missing ingredient'. Click whatever is in the grid back.
async function returnGridItems (bot) {
  try {
    const inv = bot.inventory
    for (let slot = 1; slot <= 4; slot++) {
      if (!inv.slots[slot]) continue
      for (let dest = 9; dest <= 44; dest++) {
        if (!inv.slots[dest]) { await bot.moveSlotItem(slot, dest); break }
      }
    }
  } catch { /* window quirk - best effort */ }
}

async function craft (bot, itemName, times, table = null, log = null) {
  const id = bot.registry.itemsByName[itemName]?.id
  if (id == null) return false
  const recipes = bot.recipesFor(id, null, 1, table ?? null) || []
  if (!recipes.length) {
    // recipesFor pre-filters by ingredient availability: empty means "no variant is
    // craftable with what we hold" - log it, this silent path cost hours of debugging
    ;(log ?? (() => {}))?.(`craft ${itemName}: no craftable recipe variant (ingredients missing?)`)
    return false
  }
  // A tree-fleet inventory holds MIXED plank types (oak + birch + ...); every plank
  // recipe exists once per plank type, and recipes[0] may be the variant whose plank
  // we do not have - that is why the pickaxe "never" crafted while the shovel did.
  // Try every variant before giving up.
  const step = log ?? (() => {})
  let lastErr = null
  for (const recipe of recipes) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        // bot.craft can hang when the window desyncs - fence it with a hard timeout
        await withTimeout(bot.craft(recipe, times, table ?? null), 15000, `craft ${itemName}`)
        return true
      } catch (e) {
        await returnGridItems(bot)
        lastErr = e
        // one line per FAILED variant: this is how a broken craft shows up in CI logs
        step(`craft ${itemName}: variant#${recipe.delta ? recipe.delta.length : '?'} attempt${attempt} failed: ${e.message}`)
      }
    }
  }
  if (lastErr) step(`craft ${itemName}: all ${recipes.length} variant(s) failed, last: ${lastErr.message}`)
  return false
}

// Crafting on the patched 26.2 stack is occasionally PHANTOM: bot.craft resolves,
// no error is thrown, and the item still never shows up in the inventory. The only
// trustworthy check is the inventory itself, so keep crafting until the count rises.
async function craftUntil (bot, itemName, { times = 1, table = null, want = 1, tries = 4, log = null } = {}) {
  const have = () => countItem(bot, itemName)
  const before = have()
  for (let i = 0; i < tries && have() - before < want; i++) {
    const ok = await craft(bot, itemName, times, table, log)
    if (!ok) break // no recipe variant / hard failure - retries will not change that
  }
  return have() - before >= want
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

async function placeTable (bot, { rounds = 8, maxMs = 22000 } = {}) {
  const find = () => reachableTable(bot)
  const started = Date.now()
  for (let round = 0; round < rounds; round++) {
    if (Date.now() - started > maxMs) break // give up in time so ensureTools can self-heal
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
            // vanilla ignores right-clicks that arrive less than 4 game ticks apart: the
            // old loop fired all 8 neighbour attempts back-to-back (~120ms apart, this
            // run: 16 attempts in 1.9s) and every packet after the first was silently
            // dropped - the table never appeared and the bot reported 'no crafting table'
            await bot.waitForTicks(5) // 250ms > the 200ms server throttle
            await bot.placeBlock(floorB, new Vec3(0, 1, 0))
            const placedB = bot.blockAt(cell)
            if (placedB && placedB.name === 'crafting_table') return placedB
            placed = true
          } catch { /* next neighbour */ }
        }
      }
      if (placed) continue // a block appeared (maybe not the table) - look again
      // nowhere to place (treetop / mid-air): eat the block below and fall towards
      // the terrain. A canopy is 10+ blocks deep - 3 rounds never reached the ground,
      // so this loops until we actually stand on something solid (or rounds run out).
      const under = bot.blockAt(bot.entity.position.floored().offset(0, -1, 0))
      if (under && under.type !== 0 && under.boundingBox !== 'fluid' && /leaves/.test(under.name)) {
        // leaves under our feet: dig (fastDig is 3x faster than an honest dig)
        try { await withTimeout(bot.fastDig ? bot.fastDig(under) : bot.dig(under), 5000, 'dig leaves below') } catch { /* fall anyway */ }
        await bot.waitForTicks(12)
      } else if (under && under.type !== 0 && under.boundingBox !== 'fluid') {
        break // solid non-leaf ground and still no spot -> stop retrying
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
  const plankCounts = () => PLANK_TYPES.map(n => `${n.replace('_planks', '')}:${countItem(bot, n)}`).join(' ')

  // 1. wood - the tool chain needs ~10 planks' worth of stock (4 table + 3 pickaxe +
  // 2 sticks + 1 shovel) and plank stacks FRAGMENT (each craft output is its own
  // 4-stack, the stick craft eats 2 from one of them), so target 8 logs: gatherWood
  // eats whole trunks and is much faster than the per-block collectArea fallback.
  if (countLogs(bot) < 8 && miner?.gatherWood) {
    try {
      await miner.gatherWood({ want: 8, maxSeconds: Math.min(60, Math.max(15, timeLeft())) })
    } catch { /* the fallback below still applies */ }
    const logCounts = () => LOG_BLOCKS.map(n => `${n.replace(/_(log|stem|block)$/, '')}:${countItem(bot, n)}`).filter(s => !s.endsWith(':0')).join(' ')
    step(`logs after gatherWood: ${countLogs(bot)} (${logCounts()})`)
  }
  if (countLogs(bot) < 8 && miner) {
    for (const name of LOG_BLOCKS) {
      if (countLogs(bot) >= 8 || timeLeft() < 20) break
      try {
        await miner.collectArea([name, name.replace('_log', '_wood')], {
          count: 3,
          hopDistance: 14,
          perBlockTimeoutMs: 8000,
          shouldStop: () => countLogs(bot) >= 8 || timeLeft() < 15
        })
      } catch { /* next wood type */ }
    }
    const logCounts2 = () => LOG_BLOCKS.map(n => `${n.replace(/_(log|stem|block)$/, '')}:${countItem(bot, n)}`).filter(s => !s.endsWith(':0')).join(' ')
    step(`logs: ${countLogs(bot)} (${logCounts2()})`)
  }

  // 2. planks -> sticks -> table (all 2x2, no table needed yet)
  // Craft planks out of EVERY log type we actually hold: the old code always picked
  // the oak recipe, so a bot holding birch logs accumulated planks it could not use
  // and every craft after that silently failed.
  const PLANK_OF = {
    oak_log: 'oak_planks', birch_log: 'birch_planks', spruce_log: 'spruce_planks',
    jungle_log: 'jungle_planks', dark_oak_log: 'dark_oak_planks', acacia_log: 'acacia_planks',
    mangrove_log: 'mangrove_planks', cherry_log: 'cherry_planks', pale_oak_log: 'pale_oak_planks',
    bamboo_block: 'bamboo_planks', crimson_stem: 'crimson_planks', warped_stem: 'warped_planks'
  }
  // Convert the DOMINANT log type first: the whole tool kit (4 table + 3 pickaxe +
  // 1 shovel + 2 sticks) needs 10 planks of ONE type. Mixed types were exactly how a
  // bot ended with 6 + 6 and could not craft anything 3-or-4-of-a-kind.
  const dominantLog = Object.entries(PLANK_OF)
    .sort((a, b) => countItem(bot, b[0]) - countItem(bot, a[0]))[0]
  for (const [logName, plankName] of [dominantLog, ...Object.entries(PLANK_OF).filter(([l]) => l !== dominantLog[0])]) {
    await returnGridItems(bot)
    const logs = countItem(bot, logName)
    const want = Math.ceil((12 - countItem(bot, plankName)) / 4)
    const times = Math.min(logs, want)
    if (times > 0) await craft(bot, plankName, times, null, step) // one window session
  }
  // 26.2 wood sets - the old list (oak..mangrove only) missed cherry/pale_oak/bamboo/
  // crimson/warped, which is how a bot ended with 5 oak + 3 cherry planks and could not
  // craft anything that needs 4 of a kind
  const PLANK_TYPES = ['oak_planks', 'spruce_planks', 'birch_planks', 'jungle_planks', 'acacia_planks', 'cherry_planks', 'dark_oak_planks', 'pale_oak_planks', 'mangrove_planks', 'bamboo_planks', 'crimson_planks', 'warped_planks']
  const planksName = PLANK_TYPES.find(n => countItem(bot, n) >= 4) ?? PLANK_TYPES.find(n => recipeFor(bot, n, null))
  if (!planksName) return { ok: false, kit: 'no planks recipe' }
  const planks = PLANK_TYPES.reduce((a, n) => a + countItem(bot, n), 0)
  if (countItem(bot, 'stick') < 4) await craftUntil(bot, 'stick', { want: 4, log: step })
  if (!hasKind(bot, 'crafting_table')) {
    // sticks just consumed planks of one type - make sure SOME type still has the 4
    // the table needs, converting logs if it does not
    if (!PLANK_TYPES.some(n => countItem(bot, n) >= 4)) {
      for (const [logName, plankName] of Object.entries(PLANK_OF)) {
        while (countItem(bot, logName) > 0 && countItem(bot, plankName) < 4 && countItem(bot, plankName) < 12) {
          if (!await craft(bot, plankName, 1, null, step)) break
        }
      }
    }
    await craftUntil(bot, 'crafting_table', { want: 1, log: step })
  }
  step(`planks ${planks} (${plankCounts()}) sticks ${countItem(bot, 'stick')} table ${countItem(bot, 'crafting_table')}`)

  let table = await placeTable(bot)
  if (!table) {
    // Self-healing pass: the 26.2 craft window can silently eat ingredients (planks
    // 'vanished' into a desynced grid) and vanilla drops right-clicks that come too
    // fast, so BOTH failure modes above end here with the kit incomplete. Two roads:
    // the table item exists -> just place it again (slower pacing makes it land);
    // it does not -> gather fresh wood and rebuild planks/sticks/table from scratch.
    if (!hasKind(bot, 'crafting_table') && timeLeft() > 25 && miner?.gatherWood) {
      step('self-heal: rebuilding the table chain from fresh wood')
      try { await miner.gatherWood({ want: 8, maxSeconds: Math.min(40, timeLeft() - 15) }) } catch { /* work with what we have */ }
      await returnGridItems(bot)
      for (const [logName, plankName] of Object.entries(PLANK_OF)) {
        const want = Math.ceil((8 - countItem(bot, plankName)) / 4)
        const times = Math.min(countItem(bot, logName), want)
        if (times > 0) await craft(bot, plankName, times, null, step)
      }
      if (countItem(bot, 'stick') < 4) await craftUntil(bot, 'stick', { want: 4, log: step })
      if (!hasKind(bot, 'crafting_table')) await craftUntil(bot, 'crafting_table', { want: 1, log: step })
    } else {
      await returnGridItems(bot) // a stuck grid is the usual placement-blocker too
    }
    table = await placeTable(bot)
    step(`self-heal: table ${table ? 'placed' : 'STILL missing'}`)
  }
  if (!table) return { ok: false, kit: 'no crafting table' }

  // 3. wooden tools, then stone ones if we can mine cobblestone. The pickaxe needs 3
  // planks of ONE type and the table already ate 4 of the best type - convert more
  // logs when nothing is left with enough.
  const planksOfBestType = () => Math.max(0, ...PLANK_TYPES.map(n => countItem(bot, n)))
  if (planksOfBestType() < 3) {
    for (const [logName, plankName] of Object.entries(PLANK_OF)) {
      while (countItem(bot, logName) > 0 && planksOfBestType() < 6) {
        if (!await craft(bot, plankName, 1, null, step)) break
      }
    }
  }
  if (!hasKind(bot, 'pickaxe')) await craftUntil(bot, 'wooden_pickaxe', { table, log: step })
  if (!hasKind(bot, 'shovel')) await craftUntil(bot, 'wooden_shovel', { table, log: step })
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
    await craftUntil(bot, 'stone_pickaxe', { table, log: step })
    if (cobble >= 4) await craftUntil(bot, 'stone_shovel', { table, log: step })
  }
  step(`final: ${inventoryItems(bot).filter(i => i.name.includes('pickaxe') || i.name.includes('shovel') || i.name.includes('axe')).map(i => i.name).join(', ') || 'none'}`)
  return { ok: hasKind(bot, 'pickaxe'), kit: inventoryItems(bot).filter(i => i.name.includes('pickaxe')).map(i => i.name).join(',') }
}
