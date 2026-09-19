// Materials-plan helpers: turn the base's raw-resource plan (data/base-raw.json)
// and the shared WorldMap's knowledge into concrete per-bot instructions.
//
// The v0.6.9 Big Fleet collected ZERO sand even though the plan needs 157,926 and
// the shared map held 194 recorded sand positions - the fleet dug generic shafts
// and never consumed its own map. These helpers are the missing link: which
// resources are worth a proactive walk, in plan-deficit order.

import { PLANK_TYPES } from '../lib/surplus.mjs'

// Vanilla DROPS, not the block, land in the inventory: stone mines to cobblestone,
// grass_block to dirt, deepslate to cobbled_deepslate. Count those instead or every
// mined shaft shows as 0 collected (the first fleet run: stone 415 mined, 0 collected).
export const DROP_OF = {
  stone: 'cobblestone',
  deepslate: 'cobbled_deepslate',
  grass_block: 'dirt'
}

// Plan resource name -> world block names a map trip can hunt. Resources that no
// minable block provides (ink_sac = squid ink, blaze_rod / popped_chorus_fruit =
// nether/end mob drops) are absent on purpose -> the fleet never walks for them.
// Stone is craftable from ANY grey stone, so its list falls back to the family.
export const MINABLE_OF = {
  sand: ['sand'],
  gravel: ['gravel'],
  dirt: ['dirt', 'grass_block'],
  clay: ['clay'],
  deepslate: ['deepslate'],
  andesite: ['andesite'],
  diorite: ['diorite'],
  granite: ['granite'],
  tuff: ['tuff'],
  stone: ['stone', 'andesite', 'diorite', 'granite', 'tuff'],
  coal: ['coal_ore'],
  iron: ['iron_ore'],
  copper: ['copper_ore'],
  oak_log: ['oak_log'],
  birch_log: ['birch_log'],
  spruce_log: ['spruce_log']
}

// (v0.9.3) Plan resource -> EVERY inventory item that honestly counts toward it:
// the vanilla drop AND the one-step product. The v0.8.x FLEET RESULT reported
// iron_ingot have=0 while bots carried stacks of raw_iron (one furnace away), and
// planks have=0 forever because no item is literally named 'planks' - the 12
// wood families each have their own. Counting both sides of a smelt/craft step
// keeps the plan progress (and the deficit order of mapTripTargets) honest.
export const ITEMS_OF = {
  iron_ingot: ['iron_ingot', 'raw_iron'],
  deepslate: ['cobbled_deepslate', 'deepslate'],
  planks: PLANK_TYPES
}

/**
 * The item names that count toward plan resource `res`, fallback DROP_OF, fallback
 * the resource name itself. Pure.
 */
export function planItemsOf (res) {
  return ITEMS_OF[res] ?? [DROP_OF[res] ?? res]
}

/**
 * How much of plan resource `res` does an inventory snapshot hold? Sums every item
 * from planItemsOf(res). Pure: takes [{ name, count }]-like entries, ignores junk.
 */
export function planHave (items, res) {
  const names = planItemsOf(res)
  let n = 0
  for (const it of items ?? []) {
    if (it && names.includes(it.name) && Number.isFinite(it.count) && it.count > 0) n += it.count
  }
  return n
}

/**
 * Which blocks are worth a proactive map trip right now?
 *
 * A resource qualifies when ALL of these hold:
 *   - the plan lists it with a real deficit (required - have >= minDeficit),
 *   - a minable block provides it (MINABLE_OF),
 *   - the shared map holds at least minMapCount positions for one of those blocks
 *     (walking to a resource nobody has ever seen is a blind relocate, not a trip).
 *
 * Returns block names, deduplicated, most-deficit resource first - the order in
 * which a bot should try map targets. Pure: unit-testable, no bot required.
 *
 * @param {object} p
 * @param {object} p.progress { [resource]: { required, have } } (materialsProgress())
 * @param {object} p.mapCounts { [blockName]: positionCount } (WorldMap.counts())
 * @param {number} [p.minDeficit]
 * @param {number} [p.minMapCount]
 * @param {number} [p.maxTargets]
 * @returns {string[]}
 */
export function mapTripTargets ({ progress, mapCounts, minDeficit = 64, minMapCount = 4, maxTargets = 3 } = {}) {
  if (!progress || !mapCounts) return []
  const deficits = Object.entries(progress)
    .map(([res, m]) => ({ res, deficit: (m?.required ?? 0) - (m?.have ?? 0) }))
    .filter(d => d.deficit >= minDeficit)
    .sort((a, b) => b.deficit - a.deficit)
  const out = []
  for (const { res } of deficits) {
    for (const block of MINABLE_OF[res] ?? []) {
      if ((mapCounts[block] ?? 0) >= minMapCount && !out.includes(block)) out.push(block)
    }
    if (out.length >= maxTargets) break
  }
  return out
}
