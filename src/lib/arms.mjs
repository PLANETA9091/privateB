// Melee arms policy + craft flow: wooden / stone / iron swords.
//
// WHY THIS EXISTS (v0.67.0), measured against the v0.66.0 fleet (dispatch
// 35682136264, artifacts scripts/fleet-mining/run64):
// - 15 deaths, 10 of them zombie bites at point-blank (d 0.3-2.5) right after
//   failed open-field shelters ('no diggable wall' x5, 'ring incomplete' x3,
//   'ring not buildable' x2) - and ZERO 'sword' mentions in the whole log:
//   the fleet fights with FISTS and pickaxes.
// - The v0.47.0 measurements hold: an unarmed fight ends 17 hp -> 4.3 hp with
//   the zombie still alive at 4.3 hp. A wooden sword deals 4 dmg per swing:
//   the same zombie dies in 5 swings and the bot walks away. The fight loop
//   (10s deadline, ~2 swings/s) closes a sword kill in ~3s; a fist "kill"
//   needs 10-20s - past the deadline, past the bot's hp.
// - The material is already in every pocket: 2 planks + 1 stick - the exact
//   bootstrap stream. The sword rides the tool chain; NO new gathering step.
//
// Combat integration needs NO changes in combat.mjs: pickWeapon ranks the
// sword (MELEE rank 5) above every tool, so the fight path equips it, and
// tryShelter's pickMeleeWeapon gate flips an armed bot from the doomed
// open-field shelter attempt to the fight it can now win.
//
// The policy layer (when to craft, which tier) lives HERE; the mechanism
// (phantom-safe craft, grid sweeps) stays in src/bots/tools.mjs, like
// toolupgrade.mjs before it.
import { countItem, hasKind, craftUntil, placeTable } from '../bots/tools.mjs'

// Best first. Index order IS the priority order of the tier pick.
export const SWORD_TIERS = ['iron_sword', 'stone_sword', 'wooden_sword']
export const SWORD_STICKS = 1 // every sword tier needs 1 stick

// Vanilla table recipes: 2 material + 1 stick in a column. The wooden tier's
// "material" is planks of ONE type (the v0.10.3 one-type semantics - summed
// plank types lie to the recipe).
export const SWORD_MATERIAL_COST = { iron_sword: 2, stone_sword: 2, wooden_sword: 2 }

// Reserves: the sword must not eat the pickaxe budget. 3 cobble = a spare
// stone pickaxe (sparePickCheck has no reserve - this one does); +1 margin.
// 3 ingots = the iron pickaxe recipe keepForIron holds for the upgrade chain.
export const COBBLE_RESERVE = 4
export const INGOT_RESERVE = 3
// (v0.305.0) The table rung's plank floor: the vanilla crafting table is 4
// planks of ONE type in the 2x2 grid (no table needed - that is the point).
export const SWORD_TABLE_PLANKS = 4
export const STICK_CRAFT_PLANKS = 2 // 2 planks of one type -> 4 sticks (2x2 grid)

const invItems = bot => {
  try { return bot.inventory?.items() ?? [] } catch { return [] }
}

// Largest plank stack of a single type (oak_planks 2 + birch_planks 5 -> 5).
function countMaxPlankType (bot) {
  const perType = new Map()
  for (const i of invItems(bot)) {
    if (!i || !i.name.endsWith('_planks')) continue
    perType.set(i.name, (perType.get(i.name) ?? 0) + i.count)
  }
  return perType.size ? Math.max(...perType.values()) : 0
}

export function countSwords (bot) {
  return SWORD_TIERS.reduce((a, t) => a + countItem(bot, t), 0)
}

// Can the stick requirement be unlocked from the pockets? sticks >= 1 covers
// it directly; 2 planks of one type craft 4 sticks.
function stickOk (bot, sticks, oneType) {
  return sticks >= SWORD_STICKS || oneType >= STICK_CRAFT_PLANKS
}

/**
 * Decision: does this bot need a sword RIGHT NOW?
 * Tier pick: the FIRST (best) tier whose materials clear their reserve. The
 * wooden tier is the workhorse - planks flow through every bootstrap.
 * opts: maxSwords (hold one), cobbleReserve / ingotReserve (pickaxe budget).
 * NEVER throws on junk inventories - a detached bot must not kill the caller.
 * @returns {{due: boolean, tier: string|null, reason: string}}
 */
export function swordCheck (bot, {
  maxSwords = 1,
  cobbleReserve = COBBLE_RESERVE,
  ingotReserve = INGOT_RESERVE
} = {}) {
  try {
    const swords = countSwords(bot)
    if (swords >= maxSwords) return { due: false, tier: null, reason: `holds ${swords} sword(s)` }
    const sticks = countItem(bot, 'stick')
    const oneType = countMaxPlankType(bot)
    if (!stickOk(bot, sticks, oneType)) {
      return { due: false, tier: null, reason: 'no stick and no planks for a stick' }
    }
    const ingots = countItem(bot, 'iron_ingot')
    const cobble = countItem(bot, 'cobblestone')
    if (ingots >= SWORD_MATERIAL_COST.iron_sword + ingotReserve) {
      return { due: true, tier: 'iron_sword', reason: 'iron available' }
    }
    if (cobble >= SWORD_MATERIAL_COST.stone_sword + cobbleReserve) {
      return { due: true, tier: 'stone_sword', reason: 'cobble available' }
    }
    if (oneType >= SWORD_MATERIAL_COST.wooden_sword + (sticks >= SWORD_STICKS ? 0 : STICK_CRAFT_PLANKS)) {
      return { due: true, tier: 'wooden_sword', reason: 'planks available' }
    }
    return { due: false, tier: null, reason: 'no sword materials (need 2 ingots / 2 cobble+reserve / 2 planks of ONE type)' }
  } catch {
    return { due: false, tier: null, reason: 'inventory unreadable' }
  }
}

/**
 * Mechanism: sticks top-up from planks when the pockets have none, place/reuse
 * a table, craft the check's tier, VERIFY the count rose. Never throws; an
 * aborted plan wastes nothing (placeTable only consumes a table item when it
 * actually has one; the stick craft needs no table).
 * deps: test seam { craftUntil, placeTable } - real tools.mjs helpers by default.
 * @returns {Promise<{ok: boolean, tier: string|null, reason?: string, swords?: number}>}
 */
export async function craftSword (bot, { log = null, maxSwords = 1, deps = {} } = {}) {
  const step = log ?? (() => {})
  const craftUntilFn = deps.craftUntil ?? craftUntil
  const tableOf = deps.placeTable ?? placeTable
  try {
    const chk = swordCheck(bot, { maxSwords })
    if (!chk.due) {
      step(`sword: skip (${chk.reason})`)
      return { ok: false, tier: null, reason: chk.reason }
    }
    // STICKS FIRST: the check already proved the conversion is affordable, but
    // the craft still needs the item in the pocket (mirrors craftSparePickaxe).
    const sticks = countItem(bot, 'stick')
    if (sticks < SWORD_STICKS) {
      const made = await craftUntilFn(bot, 'stick', { want: SWORD_STICKS, tries: 2, log: step })
      if (!made && countItem(bot, 'stick') < SWORD_STICKS) {
        step('sword: stick craft did not land')
        return { ok: false, tier: chk.tier, reason: 'no sticks and no planks for sticks' }
      }
    }
    const table = await tableOf(bot)
    if (!table) {
      // (v0.305.0) THE SWORD'S TABLE RUNG - face 36525740882 (the v0.302.0
      // field) measured the class: 6x 'sword: failed (no table)' (F2 x4, F9,
      // F10, F11) while swordCheck read 'cobble available'/'planks available'
      // - F9's failure landed between its second death and the zombie that
      // killed it (the pickaxe fight the kitless bot then lost). placeTable
      // returns null the moment the pocket holds no crafting_table ITEM (it
      // finds or places, never crafts) - but 4 planks of ONE type craft the
      // table in the 2x2 grid, no table needed. The pure plan (swordTablePlan)
      // reads the pocket; when the rung fires, the proven craftUntil call
      // crafts the table (the tools.mjs camp lane's own shape, line 875) and
      // placeTable retries ONCE. The mixed-stack trap stays named (a log is 4
      // same-type planks; 4 split planks craft nothing - the v0.102.0 lesson).
      // A refused/failed rung keeps the legacy failure line byte for byte.
      const plan = swordTablePlan({ tableItem: tableItemCount(bot), maxSameTypePlanks: countMaxPlankType(bot) })
      if (plan.craftTable) {
        const made = await craftUntilFn(bot, 'crafting_table', { times: 1, want: 1, tries: 2, log: step })
        if (made) {
          step(`sword: table crafted from planks (${plan.why})`)
          const retried = await tableOf(bot)
          if (retried) { return await finishSword(bot, { chk, craftUntilFn, table: retried, step }) }
        }
      }
      step('sword: no table reachable or placeable')
      return { ok: false, tier: null, reason: 'no table' }
    }
    return await finishSword(bot, { chk, craftUntilFn, table, step })
  } catch (e) {
    return { ok: false, tier: null, reason: `error: ${e.message}` }
  }
}

/** Crafting-table items held in the pocket (junk-safe read). */
function tableItemCount (bot) {
  try { return invItems(bot).filter(i => i && i.name === 'crafting_table').reduce((a, i) => a + (i.count ?? 1), 0) } catch { return 0 }
}

/**
 * (v0.305.0) THE SWORD'S TABLE PLAN - the pure half of the table rung. The
 * sword lane died 'no table' while the pocket held the sword's OWN materials:
 * placeTable finds or places a table item, never crafts one, and 4 planks of
 * ONE type craft the table in the 2x2 grid (no table needed - the vanilla
 * recipe). Pure, junk-tolerant: junk/negative reads = 0, a held table item
 * defers to placeTable (it owns find-or-place), a mixed plank pocket (the
 * largest single-type stack below the floor) refuses honestly - 4 split
 * planks craft nothing (the v0.102.0 camp lesson byte for byte).
 * @param {object} [p]
 * @param {number} [p.tableItem] crafting_table items held but not placed
 * @param {number} [p.maxSameTypePlanks] the LARGEST single plank-type stack
 * @returns {{craftTable: boolean, why: string}}
 */
export function swordTablePlan ({ tableItem = 0, maxSameTypePlanks = 0 } = {}) {
  const jit = v => (Number.isFinite(v) && v > 0 ? Math.floor(v) : 0)
  if (jit(tableItem) > 0) return { craftTable: false, why: 'table item held - placeTable owns it' }
  const maxSame = jit(maxSameTypePlanks)
  if (maxSame >= SWORD_TABLE_PLANKS) return { craftTable: true, why: `${maxSame} planks of one type` }
  return { craftTable: false, why: `no table item and largest same-type plank stack ${maxSame}/${SWORD_TABLE_PLANKS}` }
}

/** The sword craft tail shared by the direct and the table-rung paths. */
async function finishSword (bot, { chk, craftUntilFn, table, step }) {
  const before = countSwords(bot)
  const ok = await craftUntilFn(bot, chk.tier, { times: 1, want: 1, table, tries: 2, log: step })
  const after = countSwords(bot)
  const done = ok && after > before
  step(`sword: ${done ? 'OK' : 'craft did not land'} (${chk.tier}, holds ${after})`)
  return { ok: done, tier: chk.tier, swords: after }
}
