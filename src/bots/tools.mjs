// Tool bootstrap: no op, no gifts - the bot chops wood and crafts its own kit.
// logs -> planks -> sticks -> crafting table -> wooden pickaxe/shovel -> stone tools.
import { Vec3 } from 'vec3'
import { withTimeout } from '../lib/jobqueue.mjs'

export const LOG_BLOCKS = ['oak_log', 'spruce_log', 'birch_log', 'jungle_log', 'acacia_log', 'cherry_log', 'pale_oak_log', 'dark_oak_log', 'mangrove_log', 'bamboo_block', 'crimson_stem', 'warped_stem']

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

// A timed-out or failed bot.craft leaves the crafting window OPEN with items sitting in
// the grid. Every subsequent craft then desyncs ("missing ingredient" while the inventory
// is full of ingredients) - this exact poisoning is how ProdTest2 lost its whole tool
// budget in one 90s window (log: craft stick timeout x2, then missing ingredient forever).
// Vanilla returns the grid items to the inventory when the window closes, so closing it
// IS the recovery. The PLAYER inventory window (2x2 crafts: sticks, planks, the table)
// poisons EXACTLY the same way, so it is included - closing it is harmless and vanilla
// empties the 2x2 grid back into the inventory. Exported for tests.
export function recoverCraftWindow (bot, log = null) {
  try {
    const w = bot.currentWindow ?? bot.inventory
    if (w) {
      ;(log ?? (() => {}))?.(`[tools] closing stale craft window (${w.type}) - grid recovery`)
      bot.closeWindow(w)
      return true
    }
  } catch { /* window already gone */ }
  return false
}

// When closeWindow is not enough (the 26.2 stack sometimes keeps ghost slots), move the
// leftover grid items back into the main inventory by hand. Slot layout: table windows
// hold the 3x3 grid in slots 1..9, the player inventory window holds its 2x2 grid in
// slots 1..4. Returns how many slots were swept.
export async function sweepGridItems (bot) {
  try {
    const w = bot.currentWindow ?? bot.inventory
    if (!w) return 0
    const isInventory = w.type === 'minecraft:inventory'
    const lastGridSlot = isInventory ? 4 : 9
    let moved = 0
    for (const [slot, it] of [...w.slots.entries()]) {
      if (!it || slot < 1 || slot > lastGridSlot) continue
      try { await bot.putAway(slot); moved++ } catch { /* stuck slot stays */ }
    }
    return moved
  } catch { return 0 }
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
        // PROACTIVE grid sweep: the 26.2 stack leaves ghost items in the 2x2/3x3 grid
        // after earlier crafts even when bot.craft resolved cleanly (v0.6.7 CI log:
        // the table craft failed "missing ingredient" on attempt0 because plank ghosts
        // were already in the grid). Sweeping an empty grid is a no-op, so doing it
        // before every dance is free and removes the whole poisoning class.
        const pre = await sweepGridItems(bot)
        if (pre) step(`craft ${itemName}: swept ${pre} stale grid slot(s) before the attempt`)
        // bot.craft can hang when the window desyncs - fence it with a hard timeout.
        // 7s: a healthy click dance takes well under 2s, so burning less budget here
        // leaves room for the retry attempts.
        await withTimeout(bot.craft(recipe, times, table ?? null), 7000, `craft ${itemName}`)
        return true
      } catch (e) {
        lastErr = e
        // one line per FAILED variant: this is how a broken craft shows up in CI logs
        step(`craft ${itemName}: variant#${recipe.delta ? recipe.delta.length : '?'} attempt${attempt} failed: ${e.message}`)
        // THE CRITICAL RECOVERY: a timed-out craft leaves the window open with the grid
        // full. Without closing it, every later craft fails with "missing ingredient"
        // no matter what the inventory holds (measured: ProdTest2 burned its whole
        // budget this way; ProdTest1 repeated it on the 2x2 sticks craft). Close +
        // sweep before the next attempt.
        recoverCraftWindow(bot, step)
        const swept = await sweepGridItems(bot)
        if (swept) step(`craft ${itemName}: swept ${swept} ghost grid slot(s) back into the inventory`)
        if (/missing ingredient|no craftable recipe/i.test(e.message)) break // other attempts of THIS variant cannot help
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
    // PHANTOM craft: bot.craft resolved, no error, and the count STILL did not rise.
    // The window state may now be desynced (client predicted a result the server never
    // produced) - reset it before the next attempt or the next dance fails on ghosts.
    if (have() - before < want) {
      recoverCraftWindow(bot, log)
      await sweepGridItems(bot)
    }
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
// WARNING (the two-bot crash, caught by diag-two-tools): mineflayer's findBlocks palette
// fast-path calls the matcher with a Block whose .position is NULL (Block.fromStateId has
// no position). Because the predicate short-circuits on `b.name === 'crafting_table'`,
// distanceTo(null) only ever fired when ANOTHER bot's table was already in a nearby
// chunk palette - so one bot always worked and two bots crashed with
// "Cannot read properties of null (reading 'x')". Never trust matcher block positions.
const reachableTable = bot => {
  const me = bot.entity?.position
  if (!me) return null
  return bot.findBlock({
    matching: b => b.name === 'crafting_table' && b.position != null && me.distanceTo(b.position) <= TABLE_REACH,
    maxDistance: TABLE_REACH
  })
}

async function placeTable (bot, { rounds = 8, maxMs = 22000 } = {}) {
  const find = () => {
    try { return reachableTable(bot) } catch { return null } // a throw here must not kill ensureTools
  }
  const started = Date.now()
  for (let round = 0; round < rounds; round++) {
    if (Date.now() - started > maxMs) break // give up in time so ensureTools can self-heal
    const existing = find()
    if (existing) return existing
    const tableItem = inventoryItems(bot).find(i => i.name === 'crafting_table')
    if (!tableItem) return null
    // Standing in water / on a 1x1 pillar / mid-slope leaves no legal neighbour cell and
    // the old code burned all 3 rounds without ever moving. Relocate first: a short walk
    // to flat-enough ground makes the neighbour cells placeable (measured: bots in a
    // river bed failed 3/3 rounds and reported "no crafting table" WITH a table item).
    if (isWetOrFloating(bot)) {
      try { await relocateToSolidGround(bot) } catch { /* try placement anyway */ }
      if (find()) continue
    }
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
            // vanilla ignores right-clicks that arrive less than 4 game ticks apart: firing
            // all 8 neighbour attempts back-to-back made every packet after the first be
            // silently dropped - the table never appeared and the bot reported
            // 'no crafting table'. 250ms > the 200ms server throttle.
            await bot.waitForTicks(5)
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

// feet or head inside fluid, or no solid block directly below us
export function isWetOrFloating (bot) {
  try {
    const p = bot.entity.position.floored()
    const feet = bot.blockAt(p)
    const head = bot.blockAt(p.offset(0, 1, 0))
    const below = bot.blockAt(p.offset(0, -1, 0))
    return !!(feet?.boundingBox === 'fluid' || head?.boundingBox === 'fluid' ||
      !below || below.boundingBox === 'empty' || below.boundingBox === 'fluid')
  } catch { return false }
}

// Walk a few blocks (pathfinder, fenced) until the bot stands on solid, dry ground.
export async function relocateToSolidGround (bot, { tries = 6 } = {}) {
  const { goals } = await import('mineflayer-pathfinder')
  for (let i = 0; i < tries; i++) {
    if (!isWetOrFloating(bot)) return true
    const angle = Math.PI * 2 * i / tries
    const here = bot.entity.position
    const tx = here.x + Math.cos(angle) * 6
    const tz = here.z + Math.sin(angle) * 6
    try {
      await withTimeout(
        bot.pathfinder.goto(new goals.GoalNear(tx, here.y, tz, 1)),
        8000, 'relocate walk'
      )
    } catch { try { bot.pathfinder.setGoal(null) } catch { /* idle */ } }
  }
  return !isWetOrFloating(bot)
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
    for (let i = 0; i < 10 && countItem(bot, logName) > 0 && countItem(bot, plankName) < 12; i++) {
      if (!await craft(bot, plankName, 1, null, step)) break
    }
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
    // Self-healing pass (v0.3.1 idea, kept in the merge): the 26.2 craft window can
    // silently eat ingredients (planks 'vanished' into a desynced grid) and vanilla
    // drops right-clicks that come too fast, so BOTH failure modes above end here with
    // the kit incomplete. Two roads: the table item exists -> just place it again
    // (slower pacing makes it land); it does not -> gather fresh wood and rebuild
    // planks/sticks/table from scratch.
    if (!hasKind(bot, 'crafting_table') && timeLeft() > 25 && miner?.gatherWood) {
      step('self-heal: rebuilding the table chain from fresh wood')
      try { await miner.gatherWood({ want: 8, maxSeconds: Math.min(40, timeLeft() - 15) }) } catch { /* work with what we have */ }
      await recoverCraftWindow(bot, step)
      await sweepGridItems(bot)
      for (const [logName, plankName] of Object.entries(PLANK_OF)) {
        const want = Math.ceil((8 - countItem(bot, plankName)) / 4)
        const times = Math.min(countItem(bot, logName), want)
        if (times > 0) await craft(bot, plankName, times, null, step)
      }
      if (countItem(bot, 'stick') < 4) await craftUntil(bot, 'stick', { want: 4, log: step })
      if (!hasKind(bot, 'crafting_table')) await craftUntil(bot, 'crafting_table', { want: 1, log: step })
    } else {
      // a stuck grid is the usual placement-blocker too
      await recoverCraftWindow(bot, step)
      await sweepGridItems(bot)
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
