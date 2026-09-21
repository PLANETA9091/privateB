// Tool bootstrap: no op, no gifts - the bot chops wood and crafts its own kit.
// logs -> planks -> sticks -> crafting table -> wooden pickaxe/shovel -> stone tools.
import { Vec3 } from 'vec3'
import { gotoSafe, withTimeout } from '../lib/jobqueue.mjs'
import { surplusPlan, sticksFromPlanks } from '../lib/surplus.mjs'
import { torchCraftPlan } from '../lib/torch.mjs'

export const LOG_BLOCKS = ['oak_log', 'spruce_log', 'birch_log', 'jungle_log', 'acacia_log', 'cherry_log', 'pale_oak_log', 'dark_oak_log', 'mangrove_log', 'bamboo_block', 'crimson_stem', 'warped_stem']

const inventoryItems = bot => bot.inventory.items()
export const countItem = (bot, name) => inventoryItems(bot).filter(i => i.name === name).reduce((a, i) => a + i.count, 0)
export const countLogs = bot => LOG_BLOCKS.reduce((a, n) => a + countItem(bot, n), 0)
export const hasKind = (bot, kind) => inventoryItems(bot).some(i => i.name.includes(kind))

// 26.2 wood sets - the old list (oak..mangrove only) missed cherry/pale_oak/bamboo/
// crimson/warped, which is how a bot ended with 5 oak + 3 cherry planks and could not
// craft anything that needs 4 of a kind. Module scope: shared by ensureTools AND
// upgradeTools (mid-run stone upgrade rebuilds planks/tables the same way).
const PLANK_OF = {
  oak_log: 'oak_planks', birch_log: 'birch_planks', spruce_log: 'spruce_planks',
  jungle_log: 'jungle_planks', dark_oak_log: 'dark_oak_planks', acacia_log: 'acacia_planks',
  mangrove_log: 'mangrove_planks', cherry_log: 'cherry_planks', pale_oak_log: 'pale_oak_planks',
  bamboo_block: 'bamboo_planks', crimson_stem: 'crimson_planks', warped_stem: 'warped_planks'
}
const PLANK_TYPES = ['oak_planks', 'spruce_planks', 'birch_planks', 'jungle_planks', 'acacia_planks', 'cherry_planks', 'dark_oak_planks', 'pale_oak_planks', 'mangrove_planks', 'bamboo_planks', 'crimson_planks', 'warped_planks']

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

// (v0.30.0) FENCES for the craft/tool path: an inventory click (putAway), an equip,
// a block placement (placeBlock) or a physics wait (waitForTicks) all talk to the
// SERVER - on a stalled or dead socket those promises NEVER settle, and everything
// awaiting them hangs forever. Measured in fleet 35550036529: F13 hung inside
// sweepGridItems -> bot.putAway(slot) after 'error: write ECONNRESET' (the craft-catch
// recovery ran on the corpse of the connection), F8 hung in the placeTable pacing
// loop. Healthy calls finish far under the fences; a timeout rejects and the
// surrounding catch blocks treat it like any other failed attempt.
const EQUIP_FENCE_MS = 5000
const PLACE_FENCE_MS = 8000
const TICK_FENCE_MS = 3000
const SWEEP_FENCE_MS = 3000

// physics wait, fenced; a bot without waitForTicks has nothing to wait on
export const tickWait = (bot, n, label = 'ticks') => bot.waitForTicks
  ? withTimeout(bot.waitForTicks(n), TICK_FENCE_MS, `${label} x${n}`)
  : Promise.resolve()

// When closeWindow is not enough (the 26.2 stack sometimes keeps ghost slots), move the
// leftover grid items back into the main inventory by hand. Slot layout: table windows
// hold the 3x3 grid in slots 1..9, the player inventory window holds its 2x2 grid in
// slots 1..4. Returns how many slots were ACTUALLY emptied - every putAway is VERIFIED
// (the 26.2 stack silently drops window clicks, and an unverified sweep reported success
// while the grid stayed poisoned, so every later craft kept failing "missing ingredient"
// and the retries ate the plank stacks).
export async function sweepGridItems (bot) {
  try {
    const w = bot.currentWindow ?? bot.inventory
    if (!w) return 0
    const isInventory = w.type === 'minecraft:inventory'
    const lastGridSlot = isInventory ? 4 : 9
    let moved = 0
    for (const [slot, it] of [...w.slots.entries()]) {
      if (!it || slot < 1 || slot > lastGridSlot) continue
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          await withTimeout(bot.putAway(slot), SWEEP_FENCE_MS, 'putAway sweep')
        } catch (e) {
          // a plain error -> retry the slot; a FENCE TIMEOUT means the socket is dead
          // and no click will ever land again - burning the remaining attempts on it is
          // exactly how F13 hung (unbounded putAways, one per attempt, forever)
          if (/timeout after \d+ms/.test(e.message)) break
        }
        if (!w.slots[slot]) { moved++; break } // VERIFIED: the slot really emptied
      }
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
export async function craftUntil (bot, itemName, { times = 1, table = null, want = 1, tries = 4, log = null } = {}) {
  const have = () => countItem(bot, itemName)
  const before = have()
  for (let i = 0; i < tries && have() - before < want; i++) {
    const ok = await craft(bot, itemName, times, table, log)
    if (!ok) break // no recipe variant / hard failure - retries will not change that
    // SETTLE before judging (CI 3fd2e8a, ProdTest1): bot.craft resolves when the click
    // dance is SENT - the server's confirm/set-slot packets are still in flight. The old
    // code counted the inventory microseconds later, misclassified a LANDED craft as a
    // phantom and then the recovery close below poisoned the NEXT dance (log: four
    // phantom-recoveries in a row, 19 planks held, sticks never counted). Half a second
    // lets the window state land; a genuinely phantom craft still retries normally.
    await new Promise(resolve => setTimeout(resolve, 500))
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
// no position) - because the predicate short-circuited on distanceTo(null), two bots
// crashed with "reading 'x' of null" whenever ANOTHER bot's table was in a nearby chunk
// palette. The first fix (`b.position != null` INSIDE the matcher) stopped the crash but
// ALSO made every palette section test false, so findBlock returned null even when the
// table was 3 blocks away (measured live: sand at distance 13, findBlock(32) -> null).
// The matcher must therefore guard ONLY the distanceTo call, never the name match:
// palette blocks (position null) pass the pre-check, the real per-cursor scan re-checks
// the distance with true positions afterwards.
const reachableTable = bot => {
  const me = bot.entity?.position
  if (!me) return null
  return bot.findBlock({
    matching: b => b.name === 'crafting_table' && (b.position == null || me.distanceTo(b.position) <= TABLE_REACH),
    maxDistance: TABLE_REACH
  })
}

export async function placeTable (bot, { rounds = 8, maxMs = 22000 } = {}) {
  const find = () => {
    try { return reachableTable(bot) } catch { return null } // a throw here must not kill ensureTools
  }
  const tableCount = () => inventoryItems(bot).filter(i => i.name === 'crafting_table').reduce((a, i) => a + i.count, 0)
  const tablesAtEntry = tableCount()
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
      await withTimeout(bot.equip(tableItem, 'hand'), EQUIP_FENCE_MS, 'equip table')
      const feet = bot.entity.position.floored()
      let placed = false
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
        const cell = feet.offset(dx, 0, dz)
        const cellB = bot.blockAt(cell)
        const floorB = bot.blockAt(cell.offset(0, -1, 0))
        if (!floorB || floorB.boundingBox === 'empty' || floorB.boundingBox === 'fluid') continue
        if (cellB && cellB.boundingBox === 'empty') {
          try {
            // vanilla ignores right-clicks that arrive less than 4 game ticks apart: firing
            // all 8 neighbour attempts back-to-back made every packet after the first be
            // silently dropped - the table never appeared and the bot reported
            // 'no crafting table'. 250ms > the 200ms server throttle.
            await tickWait(bot, 5, 'placeTable pre-click')
            await withTimeout(bot.placeBlock(floorB, new Vec3(0, 1, 0)), PLACE_FENCE_MS, 'placeBlock table')
            // VERIFY PACING (CI 3fd2e8a, ProdTest1): placeBlock resolves on the SENT
            // packet, the server's block-update arrives a few ticks later. Reading the
            // chunk at once serves the stale cell, the verify fails, the round loop
            // spins on - and the table item is already consumed. Wait out the update.
            await tickWait(bot, 10, 'placeTable verify')
            const placedB = bot.blockAt(cell)
            if (placedB && placedB.name === 'crafting_table') return placedB
            placed = true
          } catch { /* next neighbour */ }
        } else if (cellB && cellB.boundingBox === 'block' && bot.fastDig) {
          // CARVE a placement cell out of the wall (beach sand, underground, a 1x1 pit:
          // measured live, a bot on a beach spent 2 full self-heal rounds with every
          // neighbour cell water or wall). fastDig, NOT bot.dig - under the rage
          // digTime=0 patch bot.dig resolves instantly WITHOUT breaking the block.
          try {
            await tickWait(bot, 5, 'placeTable carve pre')
            await withTimeout(bot.fastDig(cellB), 10000, `carve table cell ${cell}`)
            const freed = bot.blockAt(cell)
            if (freed && freed.boundingBox === 'empty') {
              await withTimeout(bot.equip(tableItem, 'hand'), EQUIP_FENCE_MS, 'equip table (carve)')
              await tickWait(bot, 5, 'placeTable carve place')
              await withTimeout(bot.placeBlock(floorB, new Vec3(0, 1, 0)), PLACE_FENCE_MS, 'placeBlock table (carve)')
              await tickWait(bot, 10, 'placeTable verify') // same verify pacing as above
              const placedB = bot.blockAt(cell)
              if (placedB && placedB.name === 'crafting_table') return placedB
              placed = true
            }
          } catch { /* next neighbour */ }
        }
      }
      if (placed) continue // a block appeared (maybe not the table) - look again (paced verifies above give it time)
      // nowhere to place (treetop / mid-air): eat the block below and fall to the terrain
      const below = bot.blockAt(bot.entity.position.floored().offset(0, -1, 0))
      if (below && below.type !== 0 && below.boundingBox !== 'fluid') {
        // fastDig when the bot has it (miner bots: bot.dig is a no-op under the
        // digTime=0 patch - the block never breaks); fenced either way
        await withTimeout(bot.fastDig ? bot.fastDig(below) : bot.dig(below), 10000, 'dig below for table placement')
        await tickWait(bot, 15, 'placeTable fall')
      } else {
        await tickWait(bot, 10, 'placeTable settle')
      }
    } catch { /* fall through to the next round */ }
  }
  // VANISH-AWARE last look (CI 3fd2e8a, ProdTest1): the loop exhausted while the place
  // packet actually LANDED server-side - the item left the inventory but the verify
  // reads kept serving the stale chunk, so the table stood next to us unseen. If the
  // item count DROPPED during the call, the table is ours and near: let the block
  // update land (1.2s), re-scan normal reach, then a little beyond it as last resort.
  const first = find()
  if (first) return first
  if (tableCount() < tablesAtEntry) {
    await new Promise(resolve => setTimeout(resolve, 1200))
    const second = find()
    if (second) return second
    try {
      const me = bot.entity?.position
      if (me) {
        const wide = bot.findBlock({
          matching: b => b.name === 'crafting_table' && (b.position == null || me.distanceTo(b.position) <= 8),
          maxDistance: 8
        })
        if (wide) return wide
      }
    } catch { /* give up below */ }
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
// (CI 35512719192, Big fleet #127, OOM): this walk was a RAW bot.pathfinder.goto -
// bypassing BOTH the gotoSafe water-rescue gate and the fleet path semaphore. The
// yard now has a water basin; F14 fell in mid-toolupgrade, the drowning rescue
// held the raw swim controls, and this loop kept re-issuing pathfinder goals
// AGAINST them every round - the v0.13.0 "pathfinder vs raw controls" fight, and
// the v0.6.4 allocation-storm signature: heap 113M -> 3550 MB in ~35 s, event
// loop starved, 19-bot fleet dead at t-400s while mining 891 blocks. Now: a
// rescue owns the bot (refuse immediately - placeTable just tries placement
// anyway), and the walk runs under gotoSafe (gate + semaphore + stop-on-timeout).
export async function relocateToSolidGround (bot, { tries = 6 } = {}) {
  // (v0.18.3) the dynamic import shape: mineflayer-pathfinder is CJS - named
  // exports live under .default. `const { goals } = await import(...)` read
  // undefined and `new goals.GoalNear` threw on EVERY round, silently caught -
  // this walk NEVER walked since birth (found while wiring the rescue gate).
  const pf = await import('mineflayer-pathfinder')
  const goals = pf.goals ?? pf.default?.goals
  for (let i = 0; i < tries; i++) {
    if (!isWetOrFloating(bot)) return true
    if (bot._waterRescue) return false // the drowning rescue owns the controls
    const angle = Math.PI * 2 * i / tries
    const here = bot.entity.position
    const tx = here.x + Math.cos(angle) * 6
    const tz = here.z + Math.sin(angle) * 6
    try {
      await gotoSafe(bot, new goals.GoalNear(tx, here.y, tz, 1), { timeoutMs: 8000, label: 'relocate walk' })
    } catch { /* next bearing */ }
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

  // 1. wood - the tool kit itself needs ~12 planks = 3 logs (4 table + 3 pickaxe +
  // 2 sticks + 1 shovel); 8 logs is SURPLUS greed for stone-tool upgrades, not a
  // requirement. The stall escape (woodplan.mjs) returns early when the forest is
  // eaten out, and the fallback below only fires when we are BELOW kit-critical 4
  // logs - a bot holding 4-7 logs must go CRAFT, not keep hunting (v0.6.9 fleet:
  // a bot with 7 logs idled ~110s inside these two phases and only then crafted).
  if (countLogs(bot) < 8 && miner?.gatherWood) {
    try {
      await miner.gatherWood({ want: 8, maxSeconds: Math.min(35, Math.max(15, timeLeft())) })
    } catch { /* the fallback below still applies */ }
    const logCounts = () => LOG_BLOCKS.map(n => `${n.replace(/_(log|stem|block)$/, '')}:${countItem(bot, n)}`).filter(s => !s.endsWith(':0')).join(' ')
    step(`logs after gatherWood: ${countLogs(bot)} (${logCounts()})`)
  }
  if (countLogs(bot) < 4 && miner) {
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
    const logCounts2 = () => LOG_BLOCKS.map(n => `${n.replace(/_(log|stem|block)$/, '')}:${countItem(bot, n)}`).filter(s => !s.endsWith(':0')).join(' ')
    step(`logs: ${countLogs(bot)} (${logCounts2()})`)
  }

  // 2. planks -> sticks -> table (all 2x2, no table needed yet)
  // Craft planks out of EVERY log type we actually hold: the old code always picked
  // the oak recipe, so a bot holding birch logs accumulated planks it could not use
  // and every craft after that silently failed. PLANK_OF/PLANK_TYPES are module-scope
  // (shared with upgradeTools).
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

// tools.mjs imports (top of file) already include withTimeout; surplus import here

/**
 * (v0.9.2) Mid-run inventory hygiene: fragmented plank types -> sticks.
 * Planks are on the deposit KEEP list, so 12-type fragmentation is permanent pocket
 * dead weight (v0.8.x fleets: 5 slots of 5-15 planks each that never add up). Sticks
 * are type-agnostic: 2 planks of one type -> 4 sticks, and every future tool tier
 * eats them. Called by the fleet loop right before the bank walk (a smaller pocket
 * makes the walk shorter or unnecessary). Bounded; never throws.
 */
export async function consolidateSurplus (bot, { log = () => {}, maxSeconds = 12, stickCap = 32 } = {}) {
  const started = Date.now()
  const step = msg => log(`[surplus] ${msg}`)
  try {
    const plan = surplusPlan({ items: inventoryItems(bot) })
    if (!plan.total) return { ok: true, sticksGained: 0, burned: 0 }
    const before = countItem(bot, 'stick')
    if (before >= stickCap) return { ok: true, sticksGained: 0, burned: 0 }
    let burned = 0
    for (const [plankName] of plan.convert) {
      while ((Date.now() - started) / 1000 < maxSeconds &&
             countItem(bot, plankName) >= 2 && countItem(bot, 'stick') < stickCap) {
        const had = countItem(bot, plankName)
        // one craft batch: 2 planks of THIS type -> 4 sticks (2x2, no table). craft()
        // already carries the 26.2 phantom-craft recovery (window close + grid sweep).
        if (!await craft(bot, 'stick', 1, null, step)) break
        // VERIFIED burn: a phantom craft that consumed nothing must not loop forever
        if (countItem(bot, plankName) === had) break
        burned += 2
      }
    }
    const gained = countItem(bot, 'stick') - before
    step(`plan total=${plan.total} (max ${sticksFromPlanks(plan.total)} sticks) -> burned ${burned} planks, gained ${gained} sticks`)
    return { ok: true, sticksGained: gained, burned }
  } catch (e) {
    step(`failed: ${e.message}`)
    return { ok: false, sticksGained: 0, burned: 0, error: e.message }
  }
}

const STONE_OR_BETTER = ['stone_pickaxe', 'iron_pickaxe', 'diamond_pickaxe', 'netherite_pickaxe', 'golden_pickaxe']
export const hasStonePickaxe = bot => inventoryItems(bot).some(i => STONE_OR_BETTER.includes(i.name))

// Torch chain (v0.10.0): surplus sticks + mined coal -> torches, so digShaft can
// light its way down instead of feeding the bots to the dark (mid-run deaths in
// the 0.8.x-0.9.x fleets were hostile mobs meeting a bot in an unlit shaft).
// The vanilla recipe is 1 coal over 1 stick - a shaped 1x2 that fits the 2x2
// grid, so no table is needed and this is safe to run anywhere between tool
// crafts. The pure policy (stick reserve, batch maths) lives in torch.mjs; this
// is the mechanics: plan -> craftUntil -> VERIFIED count. Never throws.
export async function craftTorches (bot, { log = null, reserveSticks = undefined } = {}) {
  const step = log ?? (() => {})
  try {
    const sticks = countItem(bot, 'stick')
    const coals = countItem(bot, 'coal') + countItem(bot, 'charcoal')
    const plan = torchCraftPlan({ sticks, coals, ...(reserveSticks !== undefined ? { reserveSticks } : {}) })
    if (plan.batches <= 0) {
      step(`craft torches: skip (${plan.reason}: sticks ${sticks} coals ${coals})`)
      return { ok: false, batches: 0, torches: 0, reason: plan.reason }
    }
    step(`craft torches: ${plan.batches} batch(es) -> ${plan.torches} torches (sticks ${sticks} coals ${coals})`)
    const ok = await craftUntil(bot, 'torch', { times: plan.batches, want: plan.torches, tries: 2, log: step })
    const made = countItem(bot, 'torch')
    if (!ok) step(`craft torches: craft did not land (held ${made} torch(es))`)
    return { ok, batches: plan.batches, torches: plan.torches, made }
  } catch (e) {
    step(`craft torches: failed: ${e.message}`)
    return { ok: false, batches: 0, torches: 0, error: e.message }
  }
}

/**
 * Mid-run tool upgrade: wooden kit + cobblestone -> stone kit.
 * ensureTools only upgrades during the bootstrap (when the bot has no cobblestone
 * yet), so fleet bots used to dig their WHOLE run with wooden pickaxes while holding
 * 29+ cobblestone (v0.7.1 fleet). A wooden pickaxe digs stone ~2x slower than stone,
 * and it breaks coal/iron ore WITHOUT a drop - the upgrade also unlocks the ores the
 * materials plan needs.
 *
 * Self-contained: reuses a reachable table or crafts+places a spare one from surplus
 * planks/logs, tops up sticks, then crafts stone_pickaxe (+ stone_shovel when the
 * cobblestone allows). Bounded by maxSeconds; never throws. Cheap no-op when the kit
 * is already stone or there is nothing to upgrade with.
 */
export async function upgradeTools (bot, { log = () => {}, maxSeconds = 40 } = {}) {
  const started = Date.now()
  const step = msg => log(`[upgrade] ${msg}`)
  const timeLeft = () => maxSeconds - (Date.now() - started) / 1000
  try {
    if (hasStonePickaxe(bot)) return { ok: true, kit: 'already stone+' }
    if (countItem(bot, 'cobblestone') < 3) return { ok: false, kit: 'no cobblestone' }
    // each stone tool craft eats 2 sticks
    if (countItem(bot, 'stick') < 4) await craftUntil(bot, 'stick', { want: 4, log: step })
    // stone tools are 3x3 recipes: reuse a reachable table, else craft + place a spare
    // one from surplus planks (converting logs when the planks fragmented across types)
    let table = reachableTable(bot)
    if (!table) {
      if (!hasKind(bot, 'crafting_table')) {
        const planksOfBestType = () => Math.max(0, ...PLANK_TYPES.map(n => countItem(bot, n)))
        if (planksOfBestType() < 4) {
          for (const [logName, plankName] of Object.entries(PLANK_OF)) {
            while (countItem(bot, logName) > 0 && planksOfBestType() < 6) {
              if (!await craft(bot, plankName, 1, null, step)) break
            }
          }
        }
        await craftUntil(bot, 'crafting_table', { want: 1, log: step })
      }
      if (!hasKind(bot, 'crafting_table')) return { ok: false, kit: 'no table material' }
      table = await placeTable(bot, { maxMs: 15000 })
      if (!table) return { ok: false, kit: 'no table placement' }
    }
    if (timeLeft() > 8 && !hasStonePickaxe(bot)) await craftUntil(bot, 'stone_pickaxe', { table, log: step })
    if (timeLeft() > 8 && countItem(bot, 'cobblestone') >= 4 &&
        !inventoryItems(bot).some(i => STONE_OR_BETTER.includes(i.name.replace('shovel', 'pickaxe')))) {
      await craftUntil(bot, 'stone_shovel', { table, log: step })
    }
    const kit = inventoryItems(bot).filter(i => i.name.includes('pickaxe') || i.name.includes('shovel')).map(i => i.name).join(',')
    step(`upgraded: ${kit || 'none'}`)
    return { ok: hasStonePickaxe(bot), kit }
  } catch (e) {
    step(`failed: ${e.message}`)
    return { ok: hasStonePickaxe(bot), kit: e.message }
  }
}
