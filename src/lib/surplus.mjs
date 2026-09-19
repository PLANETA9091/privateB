// Surplus-plank consolidation policy (pure, unit-testable - no bot, no server).
//
// The v0.8.x fleets showed bots lugging 12 plank TYPES at once (oak + birch + spruce
// + cherry + ... fragments from whatever forest each tree belonged to). Planks are on
// the deposit KEEP list (a working bot must never lose its tool material), so the
// fragmentation is PERMANENT: 5 slots holding 5-15 planks each that will never add up
// to one usable stack, while the pocket fills up and forces bank walks.
//
// Sticks are the type-agnostic sink: 2 planks of ANY one type craft into 4 sticks
// (2x2 recipe), sticks are a tool material for every future tier (stone/iron/diamond
// all eat 2+ per tool) and the future torch chain. Merging N fragmented plank slots
// into one stick stack frees slots AND converts dead weight into tool material.
//
// Policy pinned here (the crafting itself lives in tools.mjs consolidateSurplus):
// - the DOMINANT type keeps up to `keepDominant` planks (a buffer big enough for a
//   spare crafting table + a tool on the road, no re-chop needed);
// - every other type converts FULLY;
// - a plan that would burn less than `minConvert` planks is not worth a craft
//   window round-trip - no plan.

export const PLANK_TYPES = [
  'oak_planks', 'spruce_planks', 'birch_planks', 'jungle_planks', 'acacia_planks',
  'cherry_planks', 'dark_oak_planks', 'pale_oak_planks', 'mangrove_planks',
  'bamboo_planks', 'crimson_planks', 'warped_planks'
]

/**
 * Build the conversion plan for one inventory snapshot.
 * @param {object} p
 * @param {Array<{name:string,count:number}>} p.items inventory entries (any extra
 *   fields are fine; junk entries are ignored)
 * @param {number} [p.keepDominant] planks the dominant type retains (default 12)
 * @param {number} [p.minConvert] minimum burn for the plan to be worth a craft
 * @returns {{convert: Array<[string, number]>, total: number, dominant: string|null}}
 *   convert is empty when nothing worth crafting is held.
 */
export function surplusPlan ({ items, keepDominant = 12, minConvert = 4 } = {}) {
  const perType = Object.create(null) // null-proto: hostile item names cannot shadow Object.prototype
  for (const it of items ?? []) {
    if (typeof it?.name !== 'string' || !it.name.endsWith('_planks')) continue
    const n = it.count
    if (!Number.isFinite(n) || n <= 0) continue
    perType[it.name] = (perType[it.name] ?? 0) + n
  }
  const types = Object.keys(perType)
  if (!types.length) return { convert: [], total: 0, dominant: null }
  const dominant = types.reduce((a, b) => (perType[a] >= perType[b] ? a : b))
  const convert = []
  for (const t of types) {
    const keep = t === dominant ? Math.min(perType[t], keepDominant) : 0
    const burn = perType[t] - keep
    if (burn > 0) convert.push([t, burn])
  }
  const total = convert.reduce((a, [, n]) => a + n, 0)
  if (total < minConvert) return { convert: [], total: 0, dominant }
  return { convert, total, dominant }
}

/**
 * Sticks one craft batch yields: vanilla 2 planks -> 4 sticks, so the plan's burn
 * converts at a flat 2 sticks per plank, rounded down per whole craft batch. The
 * crafter uses this as its stick target ceiling.
 */
export function sticksFromPlanks (plankCount) {
  if (!Number.isFinite(plankCount) || plankCount <= 0) return 0
  return Math.floor(plankCount / 2) * 4
}
