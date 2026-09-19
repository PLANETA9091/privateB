// Sapling replanting policy (pure, unit-testable - no bot, no server).
//
// The v0.8.4 600s Big Fleet exposed the long-run death spiral: bots die mid-run
// (mobs, falls) and the recovered ones re-bootstrap - but by then the forest around
// spawn is EATEN, so every recovery burns ~85s (gatherWood + ensureTools) hunting
// logs that no longer exist (25 recovery attempts, 3 OK; 600s rate 1.20 b/s vs 2.21
// at 300s). The fix rides in every bot's inventory: each broken canopy drops
// saplings and the chop drop-sweep already picks them up. Planting one back at the
// stump turns a chopped tree into the NEXT recovery's tree (vanilla random ticks
// grow an oak sapling in ~1-3 minutes, i.e. inside a 600s run).
//
// This module pins WHAT may be planted WHERE. The actual placement lives in
// miner.mjs chopReachable - the stump cell is empty, in reach, and the bot is
// standing right there right after the chop: the cheapest legal spot there is.
//
// Vanilla rules honoured here:
// - a sapling needs a dirt-family floor and an empty cell above it;
// - water under the cell kills the plant - shoreline stumps stay unplanted;
// - dark_oak_sapling grows ONLY in a 2x2 square: a single placement is a dead
//   item, so it is never planted solo;
// - bamboo_sapling is a shoot with its own growth block rules and mangrove
//   propagules / crimson / warped fungi are not saplings at all - excluded.

// Log block -> the sapling item that regrows it (null = must not be planted solo).
export const SAPLING_FOR_LOG = {
  oak_log: 'oak_sapling',
  birch_log: 'birch_sapling',
  spruce_log: 'spruce_sapling',
  jungle_log: 'jungle_sapling', // grows as a small tree even singly
  acacia_log: 'acacia_sapling',
  cherry_log: 'cherry_sapling',
  pale_oak_log: 'pale_oak_sapling',
  dark_oak_log: null, // vanilla: 2x2 plantation only - a solo placement never grows
  mangrove_log: null, // regrows from mangrove_propagule, not a sapling
  bamboo_block: null, // shoot mechanics, not a sapling
  crimson_stem: null, // nether fungi: crimson_fungus item, not a sapling
  warped_stem: null
}

export function saplingForLog (logName) {
  return Object.prototype.hasOwnProperty.call(SAPLING_FOR_LOG, logName)
    ? SAPLING_FOR_LOG[logName]
    : null
}

export function isPlantableSapling (itemName) {
  return typeof itemName === 'string' && itemName.endsWith('_sapling') &&
    itemName !== 'dark_oak_sapling' && itemName !== 'bamboo_sapling'
}

// Vanilla sapling survival soils (the common overworld set; mycelium and farmland
// are deliberately absent - saplings pop off there and bots would loop replanting).
export const SOILS = new Set(['dirt', 'grass_block', 'podzol', 'coarse_dirt', 'rooted_dirt', 'moss_block', 'mud'])

/**
 * Is `cell` (the spot the sapling goes into) plantable on top of `floor`?
 * Both are block descriptors ({ name, boundingBox }) or null (unloaded chunk):
 * - the cell must be empty (air or a replaceable plant - their boundingBox is 'empty');
 * - the floor must be a known sapling soil AND a solid block (not water/lava).
 * Returns { ok, reason } so the caller can log WHY a spot was rejected.
 */
export function plantableCell (cell, floor) {
  if (!cell || !floor) return { ok: false, reason: 'unloaded' }
  if (cell.boundingBox !== 'empty') return { ok: false, reason: `cell ${cell.name}` }
  if (floor.boundingBox !== 'block') return { ok: false, reason: `floor ${floor.name}` }
  if (!SOILS.has(floor.name)) return { ok: false, reason: `soil ${floor.name}` }
  return { ok: true, reason: 'ok' }
}

/**
 * Pick the sapling to plant from an inventory item list.
 * Prefers the sapling that regrows `logName` (the tree we just chopped), falls back
 * to any plantable sapling held. `items` is an array of { name, count }-like
 * inventory entries. Returns the item or null.
 */
export function pickSapling (items, logName = null) {
  const held = (items ?? []).filter(i => isPlantableSapling(i?.name))
  if (!held.length) return null
  const preferred = logName ? saplingForLog(logName) : null
  return held.find(i => i.name === preferred) ?? held[0]
}
