// Tool durability watch + upgrade chain: wooden -> stone -> iron pickaxes.
//
// WHY THIS EXISTS (v0.7.4), measured against live runs:
// 1. A wooden pickaxe (59 uses) that mines IRON ORE breaks the block WITHOUT a drop -
//    vanilla needs stone tier or better for iron drops. The fleet's dig list includes
//    iron_ore, so bots with wooden picks burned real digging time for zero iron while
//    the smelting pipeline (v0.7.0) sat hungry for raw_iron.
// 2. Tools BREAK mid-run. The break itself is covered (inventory loses the item ->
//    recoveryDue fires -> ~85s full re-bootstrap: gatherWood + planks + table + kit).
//    PROACTIVE replacement is much cheaper: a stone pickaxe is 3 cobblestone + 2
//    sticks - waste material from any shaft - and keeps the yield continuous instead
//    of degrading to silent bare-handed digging until the interrupt is noticed.
// 3. Iron tools (250 uses, faster digs, diamond-tier access) close the loop:
//    mine iron with a stone pick -> smelt ingots -> better pick -> mine faster.
//    The reserve policy (kept alongside fleet19's deposit keep) holds ingots in the
//    bot's pockets until its OWN pick is iron; after that surplus ingots flow to the
//    yard chests as base stock.
//
// This module is the POLICY layer (when to upgrade, to which tier). The MECHANISM
// (phantom-safe crafting, table placement, grid sweeps) stays in src/bots/tools.mjs.
import { countItem, hasKind, craftUntil, placeTable, upgradeTools as toolsUpgradeFlow } from '../bots/tools.mjs'

// Tier ladder, worst to best. Index order IS the comparison order.
export const PICK_TIERS = ['wooden_pickaxe', 'stone_pickaxe', 'iron_pickaxe']
export const PICK_MAX_DURABILITY = { wooden_pickaxe: 59, stone_pickaxe: 131, iron_pickaxe: 250 }
export const IRON_PICK_INGOTS = 3 // iron pickaxe recipe cost
export const PICK_STICKS = 2 // every pickaxe tier needs 2 sticks

const invItems = bot => {
  try { return bot.inventory?.items() ?? [] } catch { return [] }
}

// Tier index of an item name, or -1 when it is not a pickaxe.
export function pickTierOf (name) {
  const i = PICK_TIERS.indexOf(name)
  return i
}

// The BEST pickaxe currently in the inventory: { item, tier } or null.
export function bestPickaxe (bot) {
  let best = null
  for (const item of invItems(bot)) {
    const tier = pickTierOf(item?.name)
    if (tier >= 0 && (!best || tier > best.tier)) best = { item, tier }
  }
  return best
}

// Wear state of the best pickaxe: { item, tier, left, max } - or null when there is
// no pickaxe OR the stack carries no durability data (maxDurability unknown: never
// guess, the breakage path (recoveryDue on a missing pickaxe) still covers it).
export function pickWear (bot) {
  const best = bestPickaxe(bot)
  if (!best) return null
  const max = best.item.maxDurability ?? PICK_MAX_DURABILITY[best.item.name]
  if (!Number.isFinite(max) || max <= 0) return null
  const used = best.item.durabilityUsed
  if (!Number.isFinite(used)) return null
  return { item: best.item, tier: best.tier, left: max - used, max }
}

// What COULD be crafted right now with the materials in the pockets (highest tier
// first). Sticks may be missing at check time IF planks can still produce them - the
// craft flow (upgradeTools) makes sticks from planks before crafting the pick.
function craftablePickTier (bot) {
  const sticks = countItem(bot, 'stick')
  const stickOk = sticks >= PICK_STICKS
  // ONE-TYPE semantics (v0.10.3): the vanilla pickaxe recipe needs 3 planks of the
  // SAME tree, and 2 planks of one tree make the sticks. The v0.10.2 fleet kept
  // reporting 'planks available' off the ALL-TYPES SUM while recipesFor found no
  // craftable variant ('no craftable recipe variant (ingredients missing?)' x10 in
  // run 35481439229) - the exact 6-oak + 6-birch trap the dominant-type conversion
  // in tools.mjs was built for. Summing plank types lies; the max of one type is
  // the only number the recipe cares about.
  const oneType = countMaxPlankType(bot)
  const stickOkViaPlanks = stickOk || oneType >= 2
  if (!stickOkViaPlanks) return { tier: -1, name: null, reason: 'no sticks and no planks for sticks' }
  const ingots = countItem(bot, 'iron_ingot')
  const cobble = countItem(bot, 'cobblestone')
  if (ingots >= IRON_PICK_INGOTS) return { tier: 2, name: 'iron_pickaxe', reason: 'iron available' }
  if (cobble >= 3) return { tier: 1, name: 'stone_pickaxe', reason: 'cobble available' }
  if (oneType >= 3) return { tier: 0, name: 'wooden_pickaxe', reason: 'planks available' }
  return { tier: -1, name: null, reason: 'no pickaxe materials (need 3 ingots / 3 cobble / 3 planks of ONE type)' }
}

function countMaxPlankType (bot) {
  const perType = new Map()
  for (const i of invItems(bot)) {
    if (!i || !i.name.endsWith('_planks')) continue
    perType.set(i.name, (perType.get(i.name) ?? 0) + i.count)
  }
  return perType.size ? Math.max(...perType.values()) : 0
}

/**
 * Decision: does this bot need a tool upgrade RIGHT NOW?
 * Returns { due: true, reason, target, worn } or { due: false, reason }.
 * NEVER fires for a missing pickaxe - that path belongs to the fleet's recoveryDue /
 * ensureTools full bootstrap (a naked bot needs wood first, not a bare table).
 *
 * opts: wearThreshold (uses left before proactive replacement; stone digs ~0.55s/block
 * so 12 uses ~= one short shaft of margin), cobbleReserve (do not convert the cobble a
 * future furnace/stone needs into a pickaxe while a healthy pickaxe exists).
 */
export function upgradeCheck (bot, {
  wearThreshold = 12,
  cobbleReserve = 6
} = {}) {
  const best = bestPickaxe(bot)
  if (!best) return { due: false, reason: 'no pickaxe - recovery/bootstrap path owns this' }
  const craft = craftablePickTier(bot)

  // Worn: the pickaxe will break mid-shaft soon. Any craftable tier is a valid
  // replacement (even the same tier - yield continuity beats tier pride), the BEST
  // craftable one is chosen.
  const wear = pickWear(bot)
  if (wear && wear.left < wearThreshold) {
    if (craft.tier >= 0) {
      return { due: true, reason: `worn (left=${wear.left}/${wear.max})`, target: craft.name, worn: true }
    }
    return { due: false, reason: `worn (left=${wear.left}/${wear.max}) but nothing to craft with` }
  }

  // Upgrade opportunity: a strictly better tier is craftable from current materials.
  // cobbleReserve keeps the furnace/stone budget safe when the pickaxe is still healthy.
  if (craft.tier > best.tier) {
    if (craft.tier === 1 && countItem(bot, 'cobblestone') < cobbleReserve) {
      return { due: false, reason: `stone upgrade wants ${cobbleReserve}+ cobble (have ${countItem(bot, 'cobblestone')})` }
    }
    return { due: true, reason: craft.reason, target: craft.name, worn: false }
  }
  return { due: false, reason: 'pickaxe healthy and best tier available' }
}

/**
 * Craft the upgrade. Steps: sticks (from planks) -> table -> pickaxe, all with the
 * phantom-safe helpers from tools.mjs (verified inventory counts, grid sweeps).
 * deps: test seam { craftUntil, placeTable } - real tools.mjs helpers by default.
 * Returns { ok, tier, detail } - never throws.
 *
 * DELEGATION (v0.8.0 merge): a healthy-wooden -> stone opportunity is routed through
 * the tools.mjs upgradeTools flow (the parallel agent's implementation), which also
 * handles fragmented plank types, a stone_shovel bonus and the reachable-table reuse.
 * Everything it does NOT cover (iron tier, WORN replacement where the early
 * 'already stone+' return would wrongly skip) is crafted here.
 */
export async function upgradeTools (bot, {
  log = () => {},
  maxSeconds = 45,
  deps = {}
} = {}) {
  const craft = deps.craftUntil ?? craftUntil
  const tableOf = deps.placeTable ?? placeTable
  const toolsUpgrade = deps.toolsUpgrade ?? toolsUpgradeFlow
  const started = Date.now()
  const step = msg => log(`[toolupgrade] ${msg}`)
  try {
    const check = upgradeCheck(bot)
    if (!check.due) return { ok: false, tier: null, detail: `not due: ${check.reason}` }

    // healthy wooden -> stone: the tools.mjs flow does it all (sticks, spare table,
    // stone pickaxe AND shovel from the same cobble budget)
    if (check.target === 'stone_pickaxe' && !check.worn && !deps.craftUntil) {
      const res = await toolsUpgrade(bot, { log: step, maxSeconds })
      return { ok: res.ok, tier: res.ok ? 'stone_pickaxe' : null, detail: res.kit || check.reason }
    }

    // sticks first: every tier needs 2, planks are the renewable source
    if (countItem(bot, 'stick') < PICK_STICKS) {
      const made = await craft(bot, 'stick', { want: PICK_STICKS, log: step })
      step(`sticks: ${made ? 'crafted' : 'FAILED'} (have ${countItem(bot, 'stick')})`)
      if (!made && countItem(bot, 'stick') < PICK_STICKS) {
        return { ok: false, tier: null, detail: 'cannot make sticks (no planks?)' }
      }
    }

    // a table ITEM of one's own: ensureTools leaves its placed table at the bootstrap
    // site, so a mid-run bot holds NO table and placeTable would fail forever (live
    // diag 2026-09-19: 'no crafting table placeable' at the dig site with 12 planks in
    // the pockets). The spare table is 4 planks of one type, crafted on the 2x2.
    if (!hasKind(bot, 'crafting_table')) {
      const made = await craft(bot, 'crafting_table', { want: 1, log: step })
      step(`spare table: ${made ? 'crafted' : 'FAILED'}`)
      if (!made && !hasKind(bot, 'crafting_table')) {
        return { ok: false, tier: null, detail: 'cannot make a spare table (no 4 planks of one type?)' }
      }
    }

    if (Date.now() - started > maxSeconds * 1000) return { ok: false, tier: null, detail: 'budget out before table' }
    const table = await tableOf(bot)
    if (!table) return { ok: false, tier: null, detail: 'no crafting table placeable' }

    const before = countItem(bot, check.target)
    const ok = await craft(bot, check.target, { table, want: 1, log: step })
    const rose = countItem(bot, check.target) > before
    step(`${check.target}: ${ok && rose ? 'crafted' : 'FAILED (phantom or missing mats)'} (${check.reason})`)
    return { ok: ok && rose, tier: ok && rose ? check.target : null, detail: check.reason }
  } catch (e) {
    return { ok: false, tier: null, detail: `error: ${e.message}` }
  }
}

// Deposit keep-list extension (see src/lib/deposit.mjs KEEP semantics): until the bot
// owns an iron pickaxe, its ingots and raw iron are TOOL MATERIALS, not bank stock.
// After the upgrade the surplus flows to the yard chests as base stock.
export function keepForIron (bot) {
  const hasIronPick = invItems(bot).some(i => i.name === 'iron_pickaxe')
  return hasIronPick ? [] : ['iron_ingot', 'raw_iron']
}

// ---------------------------------------------------------------- spare pickaxe
//
// The 600s fleet 35478370438 froze for its last 222s not only on the floor lock:
// 26 'no pickaxe - re-running the bootstrap' recoveries fired and 22 FAILED with
// 'no planks recipe' - a bot whose pick broke UNDERGROUND has no wood there, and a
// bare-handed bot digs stone without drops. The cheapest cure on the market: hold a
// SPARE. A stone pickaxe is 3 cobblestone + 2 sticks - shaft waste material - and a
// bot holding two picks swaps instantly when the main breaks, keeping the yield
// continuous until the next surface/bootstrap window.

/**
 * Decision: should the bot craft one more pickaxe as a spare RIGHT NOW?
 * Reads live inventory; tier comes from craftablePickTier (highest craftable first).
 * NEVER fires when the bot already holds `maxSpares` picks.
 * @returns {{due: boolean, tier: string|null, reason: string}}
 */
export function sparePickCheck (bot, { maxSpares = 2 } = {}) {
  try {
    const picks = PICK_TIERS.reduce((a, t) => a + countItem(bot, t), 0)
    if (picks >= maxSpares) return { due: false, tier: null, reason: `holds ${picks} pickaxe(s)` }
    const c = craftablePickTier(bot)
    if (c.tier < 0) return { due: false, tier: null, reason: c.reason }
    return { due: true, tier: c.name, reason: `spare (${c.reason})` }
  } catch {
    // junk inventory shapes (null items(), detached bot) must not kill the caller's loop
    return { due: false, tier: null, reason: 'inventory unreadable' }
  }
}

/**
 * Mechanism: sticks top-up from planks when the pockets have none (v0.16.2),
 * place/reuse a table, craft one spare pickaxe of the check's tier, VERIFY the
 * count rose. Never throws; an aborted plan wastes nothing (placeTable only
 * consumes a table item when it actually has one).
 * deps: test seam { craftUntil, placeTable } - real tools.mjs helpers by default.
 * @returns {Promise<{ok: boolean, tier: string|null, reason?: string, picks?: number}>}
 */
export async function craftSparePickaxe (bot, { log = null, maxSpares = 2, deps = {} } = {}) {
  const step = log ?? (() => {})
  const craftUntilFn = deps.craftUntil ?? craftUntil
  const tableOf = deps.placeTable ?? placeTable
  try {
    const chk = sparePickCheck(bot, { maxSpares })
    if (!chk.due) {
      step(`spare pick: skip (${chk.reason})`)
      return { ok: false, tier: null, reason: chk.reason }
    }
    // STICKS FIRST (v0.16.2): the check reads "planks available" as craftable when
    // one plank type >= 2, but the pickaxe recipe needs 2 sticks on top - a bot
    // with zero sticks got 'spare pick due' straight into 'no craftable recipe
    // variant' (fleet #121: F6 held 12 oak planks and 0 sticks, the spare craft
    // burned its tries on every cooldown). Same first step as upgradeTools: 2
    // planks of one type -> 4 sticks on the 2x2, no table needed. A wooden pick
    // eats 2 planks MORE into those sticks, so the one-type stack must hold 5
    // before the conversion can unlock the craft; stone/iron tiers only need 2.
    if (countItem(bot, 'stick') < PICK_STICKS) {
      const oneType = countMaxPlankType(bot)
      const enoughPlanks = chk.tier === 'wooden_pickaxe' ? oneType >= 5 : oneType >= 2
      if (!enoughPlanks) {
        step(`spare pick: skip (sticks ${countItem(bot, 'stick')} < 2, one-type planks ${oneType} cannot unlock the craft)`)
        return { ok: false, tier: chk.tier, reason: 'not enough planks to make sticks' }
      }
      const made = await craftUntilFn(bot, 'stick', { want: PICK_STICKS, tries: 2, log: step })
      if (!made && countItem(bot, 'stick') < PICK_STICKS) {
        step('spare pick: stick craft did not land')
        return { ok: false, tier: chk.tier, reason: 'no sticks and no planks for sticks' }
      }
    }
    const table = await tableOf(bot)
    if (!table) {
      step('spare pick: no table reachable or placeable')
      return { ok: false, tier: null, reason: 'no table' }
    }
    const before = PICK_TIERS.reduce((a, t) => a + countItem(bot, t), 0)
    const ok = await craftUntilFn(bot, chk.tier, { times: 1, want: 1, table, tries: 2, log: step })
    const after = PICK_TIERS.reduce((a, t) => a + countItem(bot, t), 0)
    const done = ok && after > before
    step(`spare pick: ${done ? 'OK' : 'craft did not land'} (${chk.tier}, holds ${after})`)
    return { ok: done, tier: chk.tier, picks: after }
  } catch (e) {
    return { ok: false, tier: null, reason: `error: ${e.message}` }
  }
}
