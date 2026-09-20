// (v0.18.6) Mineflayer's entity_metadata handler sets bot.oxygenLevel from ANY
// entity's air_supply metadata - there is no self-entity guard:
//
//   if (metas.air_supply != null) { bot.oxygenLevel = ... }
//
// Every mob packet that carries air_supply overwrites the BOT's oxygen with
// that mob's air level. The fleet measured the fallout across runs: #122
// counted 173 air-bar glitches, #128 (a world with ~3000 entities) counted 783
// while bots stood bone dry - a nearby drowned broadcasts air_supply 0 and the
// bot "drowns" on land. Worse, the contact-trust classifier (v0.16.0) can only
// veto the bar on DEFINITE dry reads: a bot standing in shallow water (feet
// wet, head dry) reads 'wet' - trusted - so mob air 0 fired real rescue cycles
// through the wet branch (rescues 8 -> 72 between #122 and #128, while the
// standing-wet fix of v0.18.2 only shortened them). The fleet log proves the
// sensor itself is fine: self-entity packets DO arrive on 26.2 (oxygen decayed
// progressively 14 -> 12 during real wet rescues, a mob's value would jump).
//
// The fix is a one-line upstream patch applied by scripts/setup-26.2.mjs after
// every install: only trust air_supply metadata from the bot's OWN entity.
// This module holds the transform as a pure function so CI can unit-test it.

/** Marker left in the patched line so re-running the patch is a no-op. */
export const BREATHING_GUARD_MARKER = 'privateB v0.18.6: self-only oxygen'

/** The unguarded condition as shipped by mineflayer (unique in entities.js). */
export const UNGUARDED = 'if (metas.air_supply != null) {'

/** The guarded replacement: mob packets must not own the bot's lungs. */
export const GUARDED = `if (metas.air_supply != null && entity.id === bot.entity?.id) { // ${BREATHING_GUARD_MARKER}`

/**
 * Apply the self-only oxygen guard to mineflayer's entities.js source.
 * Returns the (possibly unchanged) source string. Idempotent: a source that
 * already carries the marker is returned as-is. Throws when the source is
 * neither guarded nor contains the expected unguarded line - a mineflayer
 * upgrade that moves the target must fail LOUD here, not silently skip.
 */
export function applyBreathingGuard (source) {
  if (typeof source !== 'string') throw new TypeError('source must be a string')
  if (source.includes(BREATHING_GUARD_MARKER)) return source
  const n = source.split(UNGUARDED).length - 1
  if (n !== 1) {
    throw new Error(`breathing guard: expected exactly 1 unguarded air_supply line, found ${n} (mineflayer drifted? inspect entities.js)`)
  }
  return source.replace(UNGUARDED, GUARDED)
}
