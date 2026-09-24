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
import { countItem, hasKind, craftUntil, craftPlanksFromLogs, placeTable, upgradeTools as toolsUpgradeFlow } from '../bots/tools.mjs'
import { findChest, chestSlotCount, chestWalkBudgetMs, CHEST_DOOM_TTL_MS, YARD_CHEST_RADIUS, depositStackDirect } from './deposit.mjs'
import { gotoSafe, withTimeout } from './jobqueue.mjs'
import { withdrawStackMove, pickWithdrawSlots } from './fuelbank.mjs'
import pathfinderPkg from 'mineflayer-pathfinder'

const { goals } = pathfinderPkg

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
  const planksFrom = deps.planksFrom ?? craftPlanksFromLogs
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
      let made = await craft(bot, 'stick', { want: PICK_STICKS, log: step })
      // (v0.106.0) THE PLANK RUNG: run94's F1 held oak_log:5 with ZERO planks -
      // the stick craft died 'no craftable recipe variant' and the upgrade lane
      // gave up while the raw material sat in the pocket. One log -> 4 same-type
      // planks on the 2x2 (no table needed), then ONE honest retry; a failed
      // conversion still returns the legacy verdict.
      if (!made && countItem(bot, 'stick') < PICK_STICKS) {
        const rung = await planksFrom(bot, { need: PICK_STICKS, log: step })
        if (rung.ok) made = await craft(bot, 'stick', { want: PICK_STICKS, log: step })
      }
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
      let made = await craft(bot, 'crafting_table', { want: 1, log: step })
      // (v0.106.0) THE PLANK RUNG at the table step: run94's F2 died 'craft
      // crafting_table: no craftable recipe variant' -> 'spare table: FAILED' -
      // the same logs-without-planks pocket shape. Convert, then ONE retry.
      if (!made && !hasKind(bot, 'crafting_table')) {
        const rung = await planksFrom(bot, { need: 4, log: step })
        if (rung.ok) made = await craft(bot, 'crafting_table', { want: 1, log: step })
      }
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
  const planksFrom = deps.planksFrom ?? craftPlanksFromLogs
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
      let oneType = countMaxPlankType(bot)
      const need = chk.tier === 'wooden_pickaxe' ? 5 : 2
      let enoughPlanks = oneType >= need
      // (v0.106.0) THE PLANK RUNG: run94's F10 (logs=3, no planks) read 'spare
      // (planks available)' at the check, then died 'no craftable recipe
      // variant' - the spare path skipped instead of converting the logs it
      // held. Convert first (wooden needs 5 same-type: 2 for sticks + 3 for the
      // pick body), then the legacy guard judges the REAL pocket.
      if (!enoughPlanks) {
        const rung = await planksFrom(bot, { need, log: step })
        if (rung.ok) oneType = countMaxPlankType(bot)
        enoughPlanks = oneType >= need
      }
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

// ---------------------------------------------------------------------------
// (v0.146.0) THE IRON COMMUNE - the withdraw leg that completes the pickaxe set.
//
// MEASURED (run49, 36008932449, the v0.145.0 composite): the ladder finally
// SMELTED iron - 'F18 smelted 11 (iron_ingot:1 copper_ingot:10)', 'F3 smelted
// 3 (iron_ingot:2 stone:1)' - the first ingots in fleet history, and the
// pickaxe count still read iron=0: the veins are THIN (raw_iron arrives 1-2
// per smelt window) and every bot's ingots strand one or two short of the
// recipe's 3, in its own pocket or in the yard chest (iron is NOT on the
// deposit KEEP list - the chest has been pooling them all along; keepForIron's
// pocket-lock doctrine was never wired and could only starve the pool anyway).
// THE CURE: the chest IS the commune. A bot holding 1-2 ingots completes the
// set from a yard chest (the withdraw machinery the fuel commons proved),
// and the upgrade flow turns the completed set into the fleet's first iron
// pickaxe. THE MOMENT: right after a smelt leg - the one point in the chain
// the bot stands yard-side with fresh ingots and the chests in reach.
//
// The pure plan first, junk-safe end to end: a junk pocket/chest reads need 0,
// a complete set reads 0 (craft, do not withdraw), the chest is never
// overdrawn past what completes the set, and a partial chest funds a partial
// withdraw (1 chest ingot toward a 2-ingot gap still lands in the pocket -
// the NEXT visit or the next bot completes it).

export function ironCommunePlan ({ pocketCount = 0, chestCount = 0, target = IRON_PICK_INGOTS } = {}) {
  const have = Number(pocketCount)
  const inChest = Number(chestCount)
  const goal = Number(target)
  if (!Number.isFinite(goal) || goal <= 0) return { need: 0 }
  if (!Number.isFinite(have) || have < 0) return { need: 0 }
  if (!Number.isFinite(inChest) || inChest <= 0) return { need: 0 }
  if (have >= goal) return { need: 0 }
  // the pocket floors before the gap: a fractional read is caller junk (real
  // stacks are integers) and the gap owes WHOLE units
  return { need: Math.min(Math.max(0, Math.floor(goal) - Math.floor(have)), Math.floor(inChest)) }
}

/** The commune's withdraw walk: complete the bot's iron_ingot set from the
 * yard chests. Same machinery family as withdrawFuelCommons (findChest ->
 * the re-arming doomed walk -> openChest -> the verified click diff -> close)
 * with the commune's plan and a tighter chest budget (3 chests, one item
 * type). Junk bot / a complete set / no chest / empty chest / ghost clicks
 * all read honestly and never throw. */
export async function withdrawIronCommune (bot, {
  yardCenter = null,
  maxDistance = 48,
  yardRadius = YARD_CHEST_RADIUS,
  budgetMs = 20000,
  clickTimeoutMs = 5000,
  log = () => {}
} = {}) {
  const held = countItem(bot, 'iron_ingot')
  if (!Number.isFinite(held) || held <= 0 || held >= IRON_PICK_INGOTS) return { taken: 0, pocketNow: held, reason: 'nothing to commune' }
  const started = Date.now()
  const remainingMs = () => budgetMs - (Date.now() - started)
  const exclude = []
  let taken = 0
  for (let c = 0; c < 3; c++) {
    if (remainingMs() <= 0) { log(`budget spent (${taken}/${IRON_PICK_INGOTS - held} units)`); break }
    const chest = findChest(bot, { maxDistance, exclude, yardCenter, yardRadius, log })
    if (!chest) { if (c === 0) log('no yard chest in range'); break }
    const dist = (() => { try { return Math.round(bot.entity.position.distanceTo(chest.position)) } catch { return null } })()
    try {
      // the re-arming doomed walk (the fuel commons shape): the yard is THE
      // shared destination class - a sibling bot's failed walk never speaks
      // for this bot's start.
      await gotoSafe(bot, new goals.GoalNear(chest.position.x, chest.position.y, chest.position.z, 2), { timeoutMs: Math.min(chestWalkBudgetMs(dist ?? 8), remainingMs()), label: 'iron commune walk', doomedRearm: true, doomTtl: CHEST_DOOM_TTL_MS })
    } catch (e) {
      log(`chest walk failed (${e?.message || e})`)
      exclude.push(chest.position.floored ? chest.position.floored() : chest.position)
      continue
    }
    let window = null
    try {
      window = await withTimeout(bot.openChest(chest), 10000, 'open commune chest')
    } catch (e) {
      log(`open failed (${e?.message || e})`)
      exclude.push(chest.position.floored ? chest.position.floored() : chest.position)
      continue
    }
    try {
      const chestSlots = chestSlotCount(window)
      const slots = Array.isArray(window?.slots) ? window.slots : (typeof window?.slots === 'function' ? window.slots() : null)
      const chestIngot = Array.isArray(slots) && chestSlots > 0
        ? slots.slice(0, chestSlots).reduce((n, s) => n + (s && s.name === 'iron_ingot' && s.count > 0 ? s.count : 0), 0)
        : 0
      const plan = ironCommunePlan({ pocketCount: countItem(bot, 'iron_ingot'), chestCount: chestIngot })
      if (!plan || plan.need <= 0) {
        log(`chest holds ${chestIngot} ingot(s) - nothing to complete here`)
        if (chestIngot <= 0) exclude.push(chest.position.floored ? chest.position.floored() : chest.position)
        continue
      }
      // per-TYPE pocket snapshots: the verified diff (not the clicks) is the
      // only truth - the ghost-click class has lied here before (deposit.mjs)
      const before = countItem(bot, 'iron_ingot')
      let moved = 0
      while (moved < plan.need) {
        const slotsNow = Array.isArray(window?.slots) ? window.slots : (typeof window?.slots === 'function' ? window.slots() : null) || []
        const stack = slotsNow.slice(0, chestSlots).find(s => s && s.name === 'iron_ingot' && s.count > 0)
        if (!stack) break // this stack drained into pocket stacks mid-move
        const pair = pickWithdrawSlots({ window, itemType: stack.type, chestSlots })
        if (!pair) break // no pocket room left - the honest stop
        await withdrawStackMove(bot, window, { srcIdx: pair.srcIdx, dstIdx: pair.dstIdx, take: plan.need - moved, stackCount: stack.count, clickTimeoutMs })
        moved += Math.min(plan.need - moved, stack.count)
      }
      const got = Math.max(0, countItem(bot, 'iron_ingot') - before)
      taken += got
      if (got > 0) log(`took ${got} iron_ingot from a yard chest - the pocket now ${countItem(bot, 'iron_ingot')}/${IRON_PICK_INGOTS}`)
      else log('the clicks lied - no ingot landed in the pocket (ghost clicks)')
      if (countItem(bot, 'iron_ingot') >= IRON_PICK_INGOTS) break
      exclude.push(chest.position.floored ? chest.position.floored() : chest.position)
    } finally {
      try { window.close?.() } catch { /* already closed */ }
    }
  }
  const pocketNow = countItem(bot, 'iron_ingot')
  const reason = taken > 0 ? 'ok' : (pocketNow >= IRON_PICK_INGOTS ? 'set complete' : 'no ingot reached the pocket')
  return { taken, pocketNow, reason }
}

// ---------------------------------------------------------------------------
// (v0.150.0) THE POOL SEED - the commune's deposit-first arm.
//
// MEASURED (run86 = 36025029805, the v0.148.0 composite, the best leg on
// record): the commune FIRED for the first time - 9 asks - and EVERY ask read
// 'chest holds 0 ingot(s)'. The pool can never seed itself: keepForIron
// pockets every iron_ingot until that bot's OWN pick is iron (no bot ever had
// one), so the deposit legs skip the fragment forever and the withdraw asks
// an always-empty chest. The chain smelts 1-2 ingots per run and every
// fragment strands in a pocket (F1's and F19's ingots rode pockets to the end
// of the run). THE CURE (the lane's named last mile): at the smelt leg's end
// - the one point the bot stands yard-side with fresh ingots and chests in
// reach - a pocket the pool CANNOT complete (pocket + chest < 3) rides the
// chest (the pool grows for the next bot's visit); a pocket the pool CAN
// complete leaves the chest untouched and the withdraw completes the set.
// Two fragments in two pockets become one pickaxe between them.
//
// The pure plan first, junk-safe end to end. The decision is ONE read: the
// combined stock (pocket + chest) against the recipe's cost.

export function ironPoolSeedPlan ({ pocketCount = 0, chestCount = 0, target = IRON_PICK_INGOTS } = {}) {
  const have = Number(pocketCount)
  const inChest = Number(chestCount)
  const goal = Number(target)
  if (!Number.isFinite(goal) || goal <= 0) return { deposit: 0, withdraw: 0 }
  if (!Number.isFinite(have) || have < 0) return { deposit: 0, withdraw: 0 }
  if (!Number.isFinite(inChest) || inChest < 0) return { deposit: 0, withdraw: 0 }
  const pocket = Math.floor(have)
  const chest = Math.floor(inChest)
  if (pocket <= 0 || pocket >= goal) return { deposit: 0, withdraw: 0 }
  // fundable: the pool completes the set THIS visit - the withdraw arm takes
  // exactly the gap (never overdrawn past the goal); the seed would only
  // waste clicks. unfundable: the WHOLE pocket rides the chest - fragments
  // scattered across pockets are invisible to the fleet, the pool is shared.
  if (pocket + chest >= goal) return { deposit: 0, withdraw: Math.min(chest, goal - pocket) }
  return { deposit: pocket, withdraw: 0 }
}

/** The commune's seed walk: deposit the pocket's iron_ingot fragments into a
 * yard chest when the pool cannot fund the set, and stand down when it can
 * (the caller's withdrawIronCommune completes it). Same machinery family as
 * withdrawIronCommune (findChest -> the re-arming doomed walk -> openChest ->
 * the verified diff -> close) with the DEPOSIT direction: whole stacks via
 * the direct clicks (depositStackDirect - the v0.72.0 cure), the MIRROR
 * pocket as the honest source of truth (the v0.73.0 stale-inventory
 * doctrine), ghost clicks report the lie and stop. Junk bot / no chest /
 * walk refusal / full chest all read honestly and never throw. */
export async function seedIronPool (bot, {
  yardCenter = null,
  maxDistance = 48,
  yardRadius = YARD_CHEST_RADIUS,
  budgetMs = 15000,
  clickTimeoutMs = 5000,
  log = () => {}
} = {}) {
  const held = countItem(bot, 'iron_ingot')
  if (!Number.isFinite(held) || held <= 0 || held >= IRON_PICK_INGOTS) return { deposited: 0, chestCount: null, action: 'nothing to seed' }
  const started = Date.now()
  const remainingMs = () => budgetMs - (Date.now() - started)
  const exclude = []
  for (let c = 0; c < 3; c++) {
    if (remainingMs() <= 0) { log('the seed budget is spent'); break }
    const chest = findChest(bot, { maxDistance, exclude, yardCenter, yardRadius, log })
    if (!chest) { if (c === 0) log('no chest in range for the pool seed'); break }
    const dist = (() => { try { return Math.round(bot.entity.position.distanceTo(chest.position)) } catch { return null } })()
    try {
      // the re-arming doomed walk (the commune/fuel-commons shape): the yard
      // is THE shared destination class - a sibling bot's failed walk never
      // speaks for this bot's start.
      await gotoSafe(bot, new goals.GoalNear(chest.position.x, chest.position.y, chest.position.z, 2), { timeoutMs: Math.min(chestWalkBudgetMs(dist ?? 8), remainingMs()), label: 'iron pool seed walk', doomedRearm: true, doomTtl: CHEST_DOOM_TTL_MS })
    } catch (e) {
      log(`chest walk failed (${e?.message || e})`)
      exclude.push(chest.position.floored ? chest.position.floored() : chest.position)
      continue
    }
    let window = null
    try {
      window = await withTimeout(bot.openChest(chest), 10000, 'open seed chest')
    } catch (e) {
      log(`open failed (${e?.message || e})`)
      exclude.push(chest.position.floored ? chest.position.floored() : chest.position)
      continue
    }
    try {
      const chestSlots = chestSlotCount(window)
      const slots = Array.isArray(window?.slots) ? window.slots : (typeof window?.slots === 'function' ? window.slots() : null)
      const chestIngot = Array.isArray(slots) && chestSlots > 0
        ? slots.slice(0, chestSlots).reduce((n, s) => n + (s && s.name === 'iron_ingot' && s.count > 0 ? s.count : 0), 0)
        : 0
      const plan = ironPoolSeedPlan({ pocketCount: countItem(bot, 'iron_ingot'), chestCount: chestIngot })
      if (plan.withdraw > 0) {
        log(`the pool funds the set (${chestIngot} in chest) - the withdraw completes it`)
        return { deposited: 0, chestCount: chestIngot, action: 'fundable' }
      }
      if (plan.deposit <= 0) {
        // the pocket guard raced to empty, or a junk read - the caller's
        // withdrawIronCommune re-reads through its own guards either way
        return { deposited: 0, chestCount: chestIngot, action: 'nothing to seed' }
      }
      // THE MIRROR POCKET is the honest source: while a chest window is open
      // the standalone bot.inventory goes stale (the v0.73.0 probe measured
      // it directly), the window's slots [chestSlots..] mirror the server's
      // player inventory exactly.
      const mirrorPocket = () => {
        const now = Array.isArray(window?.slots) ? window.slots : (typeof window?.slots === 'function' ? window.slots() : null)
        return Array.isArray(now) && chestSlots > 0 && now.length > chestSlots
          ? now.slice(chestSlots).filter(s => s && s.count > 0)
          : invItems(bot)
      }
      const countOf = name => mirrorPocket().filter(i => i.name === name).reduce((a, i) => a + i.count, 0)
      let deposited = 0
      while (deposited < plan.deposit) {
        const stack = mirrorPocket().find(i => i.name === 'iron_ingot')
        if (!stack) break // the pocket drained faster than the plan's floor
        // VERIFIED TRANSFER: the only truth is the mirror afterwards - the
        // 26.2 stack silently drops some window clicks (the ghost-click class
        // has lied here before, the deposit.mjs founding evidence)
        const before = countOf('iron_ingot')
        let done = false
        if (chestSlots > 0 && typeof bot.clickWindow === 'function') {
          try {
            await withTimeout(depositStackDirect(bot, window, { itemType: stack.type, chestSlots, clickTimeoutMs }), clickTimeoutMs * 2, 'seed deposit iron_ingot')
            done = true
          } catch { /* the legacy pathway gets the stack */ }
        }
        if (!done) {
          try {
            await withTimeout(window.deposit(stack.type, null, stack.count), clickTimeoutMs, 'seed deposit iron_ingot')
          } catch {
            log('the seed click timed out (the honest stop - the pocket keeps its ingots)')
            break
          }
        }
        const moved = before - countOf('iron_ingot')
        if (moved > 0) deposited += moved
        else { log('the seed click lied - nothing moved (ghost click, the honest stop)'); break }
      }
      if (deposited > 0) log(`seeded the pool: +${deposited} iron_ingot into a yard chest (the pocket rides the pool)`)
      return { deposited, chestCount: chestIngot, action: deposited > 0 ? 'seeded' : 'the seed never landed' }
    } finally {
      try { window.close?.() } catch { /* already closed */ }
    }
  }
  return { deposited: 0, chestCount: null, action: 'no seed landed' }
}

