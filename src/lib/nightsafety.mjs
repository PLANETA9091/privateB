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

// ---- v0.140.1: THE NIGHT HOLD - the two FORCED surface windows that still shot
// bots after every other lane learned to defer ----
//
// MEASURED (run554, fleet 35974993311, the v0.139.0 HARVEST SWEEP fleet, 19 bots
// x 600s, mined by the 17:54 session): deaths hit the all-time worst 16 and the
// skeleton class hit x6 - five of them in the END-PHASE final-bank wave in rapid
// succession (F2 [-96,66,396], F6 [-155,64,410], F12 [-147,64,411],
// F7 [-132,64,419], F10 [-140,64,398]; F14 [-136,64,405] followed at t-15), every
// corpse at the surface yard elevation (y 64-66), every one on a bank/climb/hop
// line, carrying pockets worth ~840 units - the biggest single slice of the run's
// unaccounted=907 and the driver of conversion 76.3. The night walk-forbidden
// window already defers map trips ("a deferred walk turns into more shaft"), but
// two lanes still FORCE bots onto the night surface:
// - the FINAL BANK (the end-phase climb + yard walk is mandatory in its lane);
// - the RESPAWN BOOTSTRAP (an empty pocket must surface-walk to the trees).
// The hold verdict: when the clock is inside the walk-forbidden window, a bot
// about to take one of those two forced surface trips holds instead - the
// final-bank pocket is lost at the hard kill either way, but the DEATH is the
// only real loss (the re-bootstrap cascade, the fight episodes, the relogins,
// the next bot's A*). Junk-safe: a missing/unreadable clock never holds (the
// legacy behavior byte for byte); a junk purpose never holds.

/** The surface trips the night hold gates. */
// (v0.185.0) THE NIGHT LANE GATE - the set grows to the two MID-RUN lanes the
// run182 fleet (36167325733, the v0.182.0 tree, 600s, NORMAL END alive=19/19)
// measured walking the night surface: 11 of the 17 deaths landed in the last
// ~17% of the log (the dusk tail, tod 12400+), x12 of them mob kills (zombie
// x6 every one at y 64-66, drowned-melee x2, enderman x1), and the two lanes
// that still FORCE bots up there were the ones the v0.140.1 hold never gated:
// - the MID-RUN BANK TRIP (planned x12 + pockets-full x21 this run): the
//   climb-out + the yard walk are the trip's own chain - a dusk start walks
//   the yard in the dark and the return walk crosses the kill window;
// - the PRE-POSITION (the last 90s window, PRE_POSITION_MIN_DIST 48): the
//   window overlaps the walk-forbidden clock (the run's dusk hit tod ~12400
//   with the deadline at ~12500), the bot climbs and walks to the yard at
//   dusk, and the v0.140.1 final-bank hold then strands it AT the dark yard -
//   F18 died at [-70,65,419] sheltering from a skeleton with a zombie@1.5
//   walking in. Hold underground instead: the bot keeps digging (a deferred
//   walk turns into more shaft), the final-bank hold owns the pocket, and
//   the DEATH is the only real loss - the doctrine the v0.140.1 hold already
//   ruled ('the pocket rides out the dark alive'). The five bots the hold
//   DID cover this run all logged 'final bank deferred: night' and all
//   survived - the held shape is the measured-safe shape.
export const SURFACE_HOLD_PURPOSES = new Set(['final-bank', 'respawn-bootstrap', 'mid-bank', 'pre-position'])

/**
 * Should a bot about to take this surface trip hold underground instead?
 * Pure policy. 'hold' only when the clock is inside the walk-forbidden window
 * AND the purpose is a measured night kill site; everything else walks.
 * @param {object} [p]
 * @param {number} [p.timeOfDay] bot.time.timeOfDay 0..23999 (junk -> 'go')
 * @param {string} [p.purpose] one of SURFACE_HOLD_PURPOSES (junk -> 'go')
 * @returns {'hold'|'go'}
 */
export function surfaceHoldVerdict ({ timeOfDay = null, purpose = null } = {}) {
  if (typeof purpose !== 'string' || !SURFACE_HOLD_PURPOSES.has(purpose)) return 'go'
  if (!Number.isFinite(timeOfDay)) return 'go'
  return walkForbidden(timeOfDay) ? 'hold' : 'go'
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
