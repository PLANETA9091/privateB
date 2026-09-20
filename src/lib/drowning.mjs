/**
 * Drowning policy (pure, no bot dependencies - unit-testable).
 *
 * Fleet 900 s run (v0.11.3 era) measured two mid-run drownings (F1, F3, server
 * log "drowned") with the same shape every time: a bot walks into water (the
 * pathfinder charges liquidCost=1 per water block - crossing a lake is FREE),
 * sinks - vanilla physics has no swim-up without a held jump key - and the air
 * bar runs out while the work loop keeps issuing pathfinder goals that fight
 * every manual control state. A paused bot was a dead bot in combat; a sinking
 * bot is a dead bot here.
 *
 * Two layers, matching the combat stack's design:
 *   - prevention: the pathfinder movements get a real liquidCost (wiring), so
 *     paths PREFER land detours and casual lake crossings stop being free;
 *   - rescue: a fast sentry detects head-submersion / air loss and runs a raw
 *     controls swim (the tunnel + shelter lesson: pathfinder fails under
 *     adverse conditions - mob shoving there, buoyancy here).
 *
 * Everything decision-shaped lives here; miner.mjs owns the reads and the
 * controls.
 */

/** Blocks that read as "this cell is water" on 26.2. Kelp/seagrass are
 * water-content blocks (boundingBox 'empty', name != water) and MUST count,
 * or a kelp forest reads as dry air. bubble_column is the soul-sand updraft. */
export const WATER_NAMES = new Set([
  'water', 'flowing_water', 'bubble_column', 'kelp', 'kelp_plant', 'seagrass', 'tall_seagrass'
])

/** Air-family names for the shore scan (a column over air is an overhang, not land). */
export const AIR_NAMES = new Set(['air', 'cave_air', 'void_air'])

/** bot.oxygenLevel is 0..20 (metadata air_supply / 15). Rescue at half air:
 * vanilla drowns at air=0 (15 s under), half air leaves ~7.5 s of margin and
 * still filters out the surface-bobbing false positives. */
export const OXYGEN_RESCUE_LEVEL = 10
/** Below this the rescue fires even when the block reads disagree with the air
 * bar (kelp-covered eyes, stale metadata): the air bar is the ground truth. */
export const OXYGEN_CRITICAL_LEVEL = 4
/** Metadata fallback: if oxygenLevel never updates on this version, a bot whose
 * head has been under for this long drowns anyway - rescue on the clock. */
export const HEAD_SUBMERGED_RESCUE_MS = 5000
/** Rate limit for the air-bar glitch diagnostic log in the sentry (ms). The
 * glitch itself is counted every time; the log line would otherwise spam the
 * fleet log once per sentry tick on a bot with a broken bar. */
export const AIR_GLITCH_LOG_MS = 30000
/** One rescue attempt's budget (bounded like runAway/shelter - never a hang). */
export const RESCUE_MAX_MS = 25000
/** Shore scan radius (blocks). 12 keeps the sample grid at 25x25 reads max. */
export const SHORE_MAX_RADIUS = 12
/** After a rescue, the sentry waits this long before re-firing (a bot treading
 * in a flooded shaft re-triggers otherwise every 5 s and starves the work loop). */
export const RESCUE_COOLDOWN_MS = 3000

export function isWaterName (name) {
  return typeof name === 'string' && WATER_NAMES.has(name)
}

/**
 * Contact-trust classifier for the air-bar override (v0.16.0).
 *
 * The fleet measured (run #120, 19 bots, 600 s) 140 rescue starts with ZERO
 * real drownings: on 26.2 bot.oxygenLevel can read ~0 while the bot is bone
 * dry, and the old "the bar overrides dry reads" policy turned every such
 * tick into a rescue - each one cancelled the walk goal the work loop had
 * just issued, so the fake rescues were productivity poison, not insurance.
 *
 * The bar is still believed when the bot is wet or a read is missing
 * (unloaded chunks, kelp lag) - but two DEFINITE dry reads (stone feet, air
 * head) now out-vote it: the glitch is logged and counted, not swum on.
 * Verdicts: 'wet' - water contact, 'dry' - both cells definitely not water,
 * 'unknown' - any read missing.
 */
export function airBarTrust ({ feet = null, head = null } = {}) {
  if (isWaterName(feet) || isWaterName(head)) return 'wet'
  const dry = n => n != null && !isWaterName(n)
  if (dry(feet) && dry(head)) return 'dry'
  return 'unknown'
}

/**
 * The one-look verdict. Inputs are the raw reads the bot already has:
 *   feet/head : block NAME at the feet cell / head cell (string | null when
 *               unloaded - null is NOT water)
 *   oxygen    : bot.oxygenLevel ?? 20 (never trust a missing bar with a 0)
 *   headWetMs : how long the head has been continuously submerged (caller's
 *               clock; 0 right now)
 * Verdicts:
 *   'none'     - dry, nothing to do
 *   'wet'      - water contact but breathing fine (feet-only, or head just
 *                broke surface with air to spare) - monitor, no emergency
 *   'drowning' - rescue NOW
 */
export function waterVerdict ({ feet = null, head = null, oxygen = 20, headWetMs = 0 } = {}) {
  const raw = Number(oxygen)
  const o2 = Number.isFinite(raw) ? raw : 20 // NaN/undefined/junk air bar reads as FULL - a false 0 would swim-loop a dry bot
  const headWet = isWaterName(head)
  const feetWet = isWaterName(feet)
  // The air bar overrides everything except DEFINITE dry contact (v0.16.0):
  // at critical air we still act on wet or unknown reads (lag, kelp over the
  // eyes, stale chunk data - better a wasted swim than a silent drown), but
  // the fleet measured 140 rescue starts on bone-dry bots - on 26.2 the
  // oxygen metadata can read ~0 on land. Two definite dry reads out-vote the
  // bar; the wiring counts the glitch so the next fleet run tells us whether
  // the sensor or the water table was lying.
  if (o2 <= OXYGEN_CRITICAL_LEVEL && airBarTrust({ feet, head }) !== 'dry') return 'drowning'
  if (!headWet && !feetWet) return 'none'
  if (headWet) {
    if (o2 <= OXYGEN_RESCUE_LEVEL) return 'drowning'
    if (headWetMs >= HEAD_SUBMERGED_RESCUE_MS) return 'drowning'
  }
  return 'wet'
}

/**
 * Nearest-shore scan (pure): `sample(x, y, z)` returns a block NAME or null
 * (unknown / unloaded - never trusted). `center` is the bot's feet CELL
 * (integers, y = the swim level). A shore cell is, at the swim level:
 *   step 0 - ground below (y-1), air at y and y+1 (walk out)
 *   step 1 - ground AT y, air at y+1 and y+2 (one-block bank: jump out)
 * Water columns never count (kelp/seagrass floor is filtered by name), air
 * below never counts (overhang), unknown never counts.
 * Returns { dx, dz, dist, step } with dx/dz relative to center, or null.
 * Deterministic: rings out from r=1, ring order is fixed (E row scan first).
 */
export function shoreDirection (sample, center, { maxRadius = SHORE_MAX_RADIUS } = {}) {
  if (typeof sample !== 'function' || !center) return null
  const cx = Math.floor(center.x)
  const cy = Math.floor(center.y)
  const cz = Math.floor(center.z)
  const isAir = n => n == null ? false : AIR_NAMES.has(n)
  const isLand = n => n != null && !WATER_NAMES.has(n) && !AIR_NAMES.has(n)
  const ring = r => {
    // fixed order: the E/W columns first (dx = ±r) with dz spreading 0, ±1,
    // ±2... - the cell most directly ahead comes before the diagonals; then
    // the N/S rows the same way. Deterministic and heading-friendly.
    const spread = n => { const out = [0]; for (let i = 1; i <= n; i++) { out.push(-i); out.push(i) } return out }
    const cells = []
    for (const dz of spread(r - 1)) { cells.push([-r, dz]); cells.push([r, dz]) }
    for (const dx of spread(r)) { cells.push([dx, -r]); cells.push([dx, r]) }
    return cells
  }
  const shoreAt = (x, z, groundY, step) => {
    const ground = sample(x, groundY, z)
    if (!isLand(ground)) return false
    // the two cells above the ground must be passable AIR (a wall / tree there
    // is not a shore we can walk onto while swimming)
    if (!isAir(sample(x, groundY + 1, z))) return false
    if (!isAir(sample(x, groundY + 2, z))) return false
    return true
  }
  for (let r = 1; r <= maxRadius; r++) {
    for (const [dx, dz] of ring(r)) {
      const x = cx + dx
      const z = cz + dz
      if (shoreAt(x, z, cy - 1, 0)) return { dx, dz, dist: r, step: 0 }
      if (shoreAt(x, z, cy, 1)) return { dx, dz, dist: r, step: 1 }
    }
  }
  return null
}

/** digShaft fluid scan set: what may NEVER open under a shaft we are about to
 * dig. Lava kills, water drowns (a shaft punched into an aquifer floods, the
 * bot sinks into a 1x1 well with water walls - no shore, no climb). */
export const SHAFT_FLUID_NAMES = new Set(['lava', 'flowing_lava', 'water', 'bubble_column'])
