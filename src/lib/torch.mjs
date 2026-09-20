// Torch policy (pure, unit-testable - no bot, no server).
//
// The v0.8.x-0.9.x fleets dug in the dark and died for it: mid-run deaths were
// traced to hostile mobs meeting a bot at the bottom of an unlit shaft (health
// drops in digShaft logs, then the hurt-retreat, then a second fall finished
// the job). The cure is the oldest mining rule there is: light every shaft.
//
// This module pins the POLICY; the mechanics live in tools.mjs (crafting) and
// miner.mjs (placement inside digShaft):
// - torches are crafted from surplus sticks + mined coal (1 stick + 1 coal ->
//   4 torches, vanilla shaped 1x2 recipe that fits the 2x2 grid, no table);
// - a torch goes into the shaft every TORCH_SPACING successful digs (a torch's
//   light level 14 spreads 7 blocks, so every 8 blocks keeps the whole column
//   above the MIN_SHAFT_LIGHT threshold that blocks hostile spawning).

// digs between torch placements down a shaft
export const TORCH_SPACING = 8
// hostile mobs need light <= 7 to spawn; staying above this blocks them
export const MIN_SHAFT_LIGHT = 7
// sticks a working bot keeps for its next tool tier - torches only burn surplus
export const RESERVED_STICKS = 2

/**
 * Torches the vanilla recipe yields for the held resources.
 * 1 stick + 1 coal -> 4 torches, so the yield is min(sticks, coals) whole
 * batches times 4. Non-finite / negative inputs count as zero (junk telemetry
 * must not poison the plan).
 * @param {number} sticks
 * @param {number} coals coal + charcoal combined
 * @returns {number}
 */
export function torchesCraftable (sticks, coals) {
  const s = Number.isFinite(sticks) ? Math.max(0, Math.floor(sticks)) : 0
  const c = Number.isFinite(coals) ? Math.max(0, Math.floor(coals)) : 0
  return Math.min(s, c) * 4
}

/**
 * Build the craft plan for one inventory snapshot. Sticks are a tool material
 * for every future tier, so the plan burns only the SURPLUS above
 * `reserveSticks`; coal has no other consumer in the fleet, so all of it is
 * torch material.
 * @param {object} p
 * @param {number} [p.sticks] stick count held
 * @param {number} [p.coals] coal + charcoal count held
 * @param {number} [p.reserveSticks] sticks kept out of the fire (default 2)
 * @returns {{batches: number, torches: number, reason: string}}
 *   batches 0 -> no craft worth doing, `reason` says why.
 */
export function torchCraftPlan ({ sticks = 0, coals = 0, reserveSticks = RESERVED_STICKS } = {}) {
  const held = Number.isFinite(sticks) ? Math.max(0, Math.floor(sticks)) : 0
  const spare = held - Math.max(0, Math.floor(reserveSticks ?? RESERVED_STICKS))
  const c = Number.isFinite(coals) ? Math.max(0, Math.floor(coals)) : 0
  const batches = Math.min(spare, c)
  if (batches <= 0) {
    return { batches: 0, torches: 0, reason: spare <= 0 ? 'no spare sticks' : 'no coal' }
  }
  return { batches, torches: batches * 4, reason: 'ok' }
}

/**
 * Should a torch go into the ground here?
 * @param {object} p
 * @param {number} [p.digsSinceTorch] successful digs since the last torch
 * @param {number} [p.spacing] digs between torches (default TORCH_SPACING)
 * @param {number|null} [p.lightLevel] block light at the placement cell when
 *   the bot can read it; null means "cannot read - fall back to the rhythm".
 * @returns {boolean}
 */
export function torchDue ({ digsSinceTorch = 0, spacing = TORCH_SPACING, lightLevel = null } = {}) {
  if (Number.isFinite(lightLevel) && lightLevel < MIN_SHAFT_LIGHT) return true
  const d = Number.isFinite(digsSinceTorch) ? Math.max(0, digsSinceTorch) : 0
  const s = Number.isFinite(spacing) && spacing > 0 ? spacing : TORCH_SPACING
  return d >= s
}

/**
 * Torch count across an inventory-shaped list (same shape tools.mjs counts).
 * @param {Array<{name: string, count: number}>|null} items
 * @returns {number}
 */
export function countTorches (items) {
  if (!Array.isArray(items)) return 0
  return items.reduce((a, it) => (it?.name === 'torch' && Number.isFinite(it.count) ? a + it.count : a), 0)
}
