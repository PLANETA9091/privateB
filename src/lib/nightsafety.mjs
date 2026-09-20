// Night-safety policy (pure, unit-testable - no bot, no server).
//
// The v0.8.x/v0.9.x field logs are unambiguous about WHERE the fleet loses bots:
// not in shafts (lava/fall guards handle those) but on NIGHT SURFACE WALKS and
// during naked bootstraps after dark ("night mob kill streak - 7 deaths measured",
// stripped spawn forest). A dead bot loses the whole inventory, so one avoided
// night death pays for every conservative gate here.
//
// Policy pinned below (the actions live in fleet19.mjs / tools.mjs / miner.mjs):
// - surface walks (map trips, opportunistic banking) are DEFERRED inside the night
//   walk-forbidden window - digging underground is the safest night activity, so a
//   deferred walk turns into more shaft, not idle standing;
// - torches: 1 coal + 1 stick -> 4 torches (2x2 craft, no table). Coal drops from
//   coal_ore for a WOODEN pickaxe, so every tooled bot can pay its own light bill;
// - shafts are lit every `TORCH_EVERY` dug blocks - light kills spawns inside the
//   shaft and in the caves a shaft opens into.

// Vanilla 26.2 day cycle: timeOfDay 0 = sunrise, ~12610 = dusk (mobs start spawning
// outdoors), ~23460 = dawn (spawn pressure ends). Both bounds measured against the
// vanilla clock; the walk window ADDS a margin on both sides (dusk approach and
// dawn tail) because a walk STARTED at 12300 is still running at 12610.
export const NIGHT_WALK_START = 12400
export const NIGHT_WALK_END = 23600

/**
 * Is the vanilla clock inside the night walk-forbidden window?
 * The window wraps nothing (23600 < 24000): t in [12400, 23600).
 * @param {number} timeOfDay bot.time.timeOfDay (0..23999); junk -> false (walk)
 */
export function walkForbidden (timeOfDay) {
  if (!Number.isFinite(timeOfDay)) return false
  return timeOfDay >= NIGHT_WALK_START && timeOfDay < NIGHT_WALK_END
}

/**
 * Strictly night (mobs spawn outdoors). Tighter than walkForbidden: the walk gate
 * includes the dusk/dawn margins, this one does not.
 */
export function isNight (timeOfDay) {
  if (!Number.isFinite(timeOfDay)) return false
  return timeOfDay >= 12610 && timeOfDay < 23460
}

/** Torches one craft batch yields: vanilla 1 coal + 1 stick -> 4 torches. */
export function torchesFrom ({ coal = 0, sticks = 0 } = {}) {
  const c = Number.isFinite(coal) && coal > 0 ? coal : 0
  const s = Number.isFinite(sticks) && sticks > 0 ? sticks : 0
  return Math.min(c, s) * 4
}

// A shaft lights up every N dug blocks: enough for spawn suppression without
// burning the coal budget (a 40-block shaft takes 5 torches = 1 coal + 5 sticks).
export const TORCH_EVERY = 8

/**
 * Should the bot place a shaft torch right now?
 * @param {object} p
 * @param {number} p.torchesHeld torch count in the inventory (0 -> never)
 * @param {number} p.blocksSinceTorch dug blocks since the last placed torch
 * @param {number} [p.torchEvery] interval (default TORCH_EVERY)
 */
export function torchDue ({ torchesHeld = 0, blocksSinceTorch = 0, torchEvery = TORCH_EVERY } = {}) {
  if (!Number.isFinite(torchesHeld) || torchesHeld <= 0) return false
  if (!Number.isFinite(blocksSinceTorch) || blocksSinceTorch < 0) return false
  if (!Number.isFinite(torchEvery) || torchEvery <= 0) return true
  return blocksSinceTorch >= torchEvery
}
