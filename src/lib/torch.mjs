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
 * @param {number} [p.reserveCoals] coals kept out of the fire for the METAL
 *   window (default 0 = the legacy byte-for-byte plan). (v0.165.0) run562
 *   (dispatch 36082849774, the v0.164.0 fleet) measured the old 'coal has no
 *   other consumer' doctrine FALSE at the smelt leg: F3 held raw_copper:18 and
 *   F6 raw_copper:25 the WHOLE run while their smelt legs died
 *   'raw_copper@-: no fuel' - the torch fire had eaten the coal (F10 crafted
 *   19 torches = 19 coal), pickFuel's metal window wants COAL FIRST, and the
 *   anchor/commons chests stayed empty ('chest holds no fuel' x35). The metal
 *   window's smelt needs 1 coal per 8 items; the reserve keeps that much coal
 *   out of the torch fire while raw metal rides in the pocket.
 * @returns {{batches: number, torches: number, reason: string}}
 *   batches 0 -> no craft worth doing, `reason` says why.
 */
export function torchCraftPlan ({ sticks = 0, coals = 0, reserveSticks = RESERVED_STICKS, reserveCoals = 0 } = {}) {
  const held = Number.isFinite(sticks) ? Math.max(0, Math.floor(sticks)) : 0
  const spare = held - Math.max(0, Math.floor(reserveSticks ?? RESERVED_STICKS))
  const c = Number.isFinite(coals) ? Math.max(0, Math.floor(coals)) : 0
  const rc = Number.isFinite(reserveCoals) ? Math.max(0, Math.floor(reserveCoals)) : 0
  const burnable = Math.max(0, c - rc)
  const batches = Math.min(spare, burnable)
  if (batches <= 0) {
    return { batches: 0, torches: 0, reason: spare <= 0 ? 'no spare sticks' : 'no coal' }
  }
  return { batches, torches: batches * 4, reason: 'ok' }
}

// (v0.165.0) THE METAL FUEL RESERVE CAP - one coal smelts 8 items (vanilla
// fuelValue 1600 / 200 per item), so the reserve for a raw-metal pile is
// ceil(count / 8), capped at METAL_FUEL_CAP coals (a full stack's worth of
// smelts - the pocket never hordes more than that for the furnace).
export const METAL_FUEL_CAP = 8

/** Pure: coals kept out of the torch fire while `metalCount` raw-metal items
 * ride in the pocket (the metal window's pickFuel burns coal FIRST). Junk-safe:
 * non-finite / negative counts read as zero - a junk telemetry read must never
 * hoard coal. Floors the input first (a fractional count is not a smelt), then
 * ceils the division (a partial coal still buys the last smelts). */
export function metalFuelReserve (metalCount) {
  const c = Number.isFinite(metalCount) ? Math.max(0, Math.floor(metalCount)) : 0
  if (c <= 0) return 0
  return Math.min(METAL_FUEL_CAP, Math.ceil(c / 8))
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

// (v0.137.0) THE DRY-POCKET RESTOCK - run551's craft famine: torches are
// crafted ONCE per shaft entry ('stocking stays shaft-entry-owned'), and the
// 405-skip entry ledger shows the pocket rarely funds BOTH sides at that one
// moment ('no spare sticks' x252, 'no coal' x153) - while the tunnel lane
// STEERS to coal_ore mid-run, so the coal arrives AFTER the entry craft
// window closed. The mid-lane restock re-attempts the craft when the
// placement rhythm fires on a pocket holding ZERO torches AND the CURRENT
// snapshot funds at least one batch. Silent by contract: the entry lane owns
// the loud skip lines - the restock must not log-spam every torchDue on a
// genuinely stick-poor bot (the placement ledger's 'dry' class counts the
// remainder the restock cannot fix). Junk-safe: a junk torch count reads as
// ZERO? No - as HELD (a guessed dry pocket must not trigger a craft; the
// next rhythm round re-asks with a fresh read).
export function torchRestockWanted ({ torches = 0, sticks = 0, coals = 0, reserveSticks } = {}) {
  if (!Number.isFinite(torches) || torches < 0) return false
  const held = Math.floor(torches)
  if (held > 0) return false
  return torchCraftPlan({ sticks, coals, ...(reserveSticks !== undefined ? { reserveSticks } : {}) }).batches > 0
}

// The base wall-candidate order around the head cell (dx, dz pairs), shared by
// every torch lane: the two x walls, then the two z walls. Deterministic so a
// test can pin the order and a field log can name the wall that took the torch.
export const TORCH_WALL_BASE_DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]]

/**
 * Wall-candidate directions for ONE torch placement, with the lane's travel
 * direction EXCLUDED (v0.107.0 the tunnel-torch rhythm). A torch attached to
 * the wall the next cut eats pops into an item the very next iteration - the
 * wasted pickup and re-place cost more light than they buy. The shaft lane
 * digs DOWN, so its candidates keep the full base set (travel is -y, never a
 * wall here); the tunnel lane digs ALONG d, so d's wall is the dig face.
 * Junk-safe: a missing / non-finite / junk d judges nothing and returns the
 * full base set - the placement proceeds exactly like the v0.10.0 shaft shape.
 * @param {object} p
 * @param {{x: number, z: number}|null} [p.d] the lane's unit travel direction
 * @returns {Array<[number, number]>} ordered [dx, dz] wall candidates
 */
export function torchWallDirs ({ d = null } = {}) {
  const dx = Number(d?.x)
  const dz = Number(d?.z)
  if (!Number.isFinite(dx) || !Number.isFinite(dz)) return TORCH_WALL_BASE_DIRS.map(c => [...c])
  return TORCH_WALL_BASE_DIRS.filter(c => !(c[0] === dx && c[1] === dz)).map(c => [...c])
}
