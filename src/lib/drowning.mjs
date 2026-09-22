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
/** (v0.64.0) The 26.2 metadata RESET sentinel, measured live in run60 (fleet
 * 35668657935): immediately after 'rescue complete' AND after 'died - respawning'
 * the air_supply metadata arrives as -1 - a value OUTSIDE the 0..20 sensor domain.
 * run60 counted 395 of these fleet-wide ('oxygen -1 on dry land', bursts of 250+
 * on F2), every single one within seconds of a rescue/death event. The old read
 * path treated -1 as a FINITE critical reading, so waterVerdict saw o2=-1 <= 4
 * with wet/unknown post-rescue reads and paged the rescue AGAIN - the re-dive
 * chain mechanic behind run58's F16 4-rescue loop, surviving every memory cure.
 * A negative bar is never a real reading: out-of-domain values read as FULL
 * (same policy as NaN), and a genuinely submerged bot still pages through the
 * headWetMs clock (HEAD_SUBMERGED_RESCUE_MS), which needs no bar at all. */
export const OXYGEN_RESET_SENTINEL = -1
/** Is this oxygen value a REAL sensor reading (finite, inside the 0..20 domain)?
 * The reset sentinel (-1), NaN, undefined and +-Infinity all read false: none of
 * them may drive a rescue decision or a death-cause label. */
export function oxygenInDomain (raw) {
  return Number.isFinite(raw) && raw >= 0
}
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
  // (v0.64.0) oxygenInDomain gates the read: NaN/undefined AND the -1 reset
  // sentinel (measured post-rescue/post-death in run60) all read as FULL - a
  // false critical bar would swim-loop a bot standing in the shallows it just
  // climbed out of. Real submersion still pages via the headWetMs clock below.
  const o2 = oxygenInDomain(raw) ? raw : 20
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

/**
 * The rescue-loop EXIT policy (pure).
 *
 * CI run 35511474490 measured the poisoned case: a smelt-test bot dug into an
 * aquifer, the rescue fired, and the loop then treaded for the FULL
 * RESCUE_MAX_MS (25 s) - feet in water on the flooded-shaft floor, head dry,
 * shoreDirection null (a 1x1 hole has walls, not beaches). The whole window
 * held bot._waterRescue true, so the fleet walk-gate refused every goal
 * ("water rescue in progress (walk to furnace refused)") and the smelt phase
 * died. The insight: a swim rescue owns the bot only while DROWNING is
 * possible. Head dry + STANDING means the air bar is recovering and the bot
 * can walk out on its own legs - shallow water is not drowning. Raw swimming
 * can never leave a 1x1 hole anyway.
 *
 *   headWet  - the head cell reads water: keep swimming (the F1/F3 shape)
 *   shore    - shoreDirection result: a swim plan exists, keep going
 *   onGround - the bot STANDS (measured AFTER releasing the jump control and
 *              settling physics - holding jump never lets onGround settle)
 * A renewed submersion re-fires the rescue after RESCUE_COOLDOWN_MS, so
 * ending early on a standing bot costs no safety.
 * Returns true only when the rescue must hand the bot back NOW.
 */
export function rescueDone ({ headWet = false, shore = null, onGround = false } = {}) {
  if (headWet) return false
  if (shore) return false
  return !!onGround
}

// ---- v0.80.0: THE OPEN-WATER TRANSIT ----
// Run74 (dispatch 35733236816, the v0.78.0 fleet, NORMAL END 19/19) measured
// the rescue machinery eating itself in open water: 79 rescue starts, 56
// 'rescue timeout (still wet) in ~25.0s' - F7 x23 + F10 x18 starts (F7 burned
// ~575s of its 600s run inside rescue locks, F10 ~450s; the bank trips F11/F15
// watched their 14s/28s budgets die while bot._waterRescue gated every fleet
// walk - banked=0 at pockets 911u). Every start carried HEALTHY oxygen (12-20)
// and the verdict came from the headWetMs clock: the rescue releases the jump
// control to run the standing-wet test, the bot SINKS (mineflayer physics has
// no buoyancy without jump), the head re-submerges, 5s later the clock re-pages
// - a treadmill the rescue cannot win. The structural gap: shoreDirection
// scans 12 raw blocks; a lake wider than that returns null FOREVER, so the
// loop has NO plan - it treads against its own physics until the budget dies.
//
// The cure is transit, not escape, in two layers:
// - while the rescue holds the bot and the head is DRY at the surface, swim
//   toward the nearest KNOWN land (the fleet WorldMap: tree logs stand on
//   land, sand/gravel line shores - map.nearest gives a bearing the raw
//   12-block scan cannot). Each settle swims ~1-2 blocks; across re-fire
//   cycles the transit CONVERGES on land, and once the shore scan sees a
//   beach the proven shore-swim path finishes the job.
// - when NO land is known at all, a surface-safe bot (head dry long enough,
//   air at/above the rescue line) is released: the walk gate reopens NOW, the
//   pathfinder's liquidCost plans routes out of water the raw scan cannot,
//   and a re-submersion re-pages through the headWetMs clock as before.
//   Compare the old exit: the same bot in the same water was released by the
//   TIMEOUT 25s later - the release is strictly earlier, never less safe.

/** The head must have been continuously dry this long before a release. */
export const SURFACE_SAFE_DRY_MS = 1500
/** The transit re-scans the shore and the map bearing every N settled ticks. */
export const TRANSIT_RESCAN_TICKS = 8
/** Map buckets that stand on (or line) dry land, best proxy first. */
export const LAND_PROXIES = ['oak_log', 'birch_log', 'spruce_log', 'sand', 'gravel']
/** Max map lookup distance for a land bearing (blocks). */
export const TRANSIT_MAP_RANGE = 128

/**
 * May the rescue hand a bot standing at the surface back to the work loop?
 * True only when NO shore is in scan (a plan exists -> keep swimming), the
 * head has been dry for SURFACE_SAFE_DRY_MS (not bobbing under), and the air
 * bar is at/above the rescue line (a real reading, in-domain; junk reads as
 * full - the clock carries the decision). A drowning bot NEVER releases.
 * @param {object} [p]
 * @param {number} [p.headDryMs] how long the head has been continuously dry
 * @param {number} [p.oxygen] bot.oxygenLevel (junk -> full, the clock decides)
 * @param {object|null} [p.shore] a shoreDirection hit (any plan -> false)
 */
export function surfaceSafeRelease ({ headDryMs = 0, oxygen = 20, shore = null } = {}) {
  if (shore) return false
  const dry = Number(headDryMs)
  if (!Number.isFinite(dry) || dry < SURFACE_SAFE_DRY_MS) return false
  const o2 = oxygenInDomain(oxygen) ? Number(oxygen) : 20
  return o2 >= OXYGEN_RESCUE_LEVEL
}

// ---- v0.81.0: THE SURFACE-STABILITY RELEASE + THE RESCUE BLACKBOX ----
// Run75 (35740810293) measured the v0.80.0 release UNREACHABLE: 23 'rescue
// timeout (still wet)' lines and ZERO 'rescue released' - F4 burned SEVEN
// back-to-back 25s budgets at one flooded cell [-131,48,398] and neither the
// transit nor the release ever logged a line. The mechanism: the loop's own
// standing probe releases the jump control, the bot sinks (no buoyancy), the
// head re-submerges, and headDrySince resets - in water whose surface bobs
// the head, a CONTINUOUS 1500ms dry stretch can never accumulate. The
// windowed read below is the bobbing-tolerant gate; the constants feed the
// per-pass blackbox that names which branch ate every rescue budget.

/** Standing-probe budget: how often the open-water branch may release the jump to test for footing before it must hold the surface instead. */
export const STANDING_PROBE_BUDGET = 3
/** The stability window reads this many recent pass records. */
export const STABILITY_WINDOW = 8
/** At least this share of the window must be head-dry. */
export const STABILITY_MIN_DRY_SHARE = 0.75
/** The last N reads must ALL be dry (dry now, not mid-drag under). */
export const STABILITY_TAIL_DRY = 3
/** The rescue keeps at most this many pass records (the window reads the tail). */
export const RESCUE_READS_CAP = 24
/** The blackbox pass line prints at most this often (per rescue). */
export const PASS_LOG_INTERVAL_MS = 2000
/** ...and at most this many times per rescue (the log must survive 19 bots). */
export const PASS_LOG_MAX_PER_RESCUE = 10

/**
 * May a bobbing-at-the-surface bot be released although no CONTINUOUS dry
 * stretch exists? (v0.81.0, pure.) Run75 proved the continuous clock alone
 * is defeated by the loop's own probe-sink cycle: headDryMs resets every
 * submersion and the release starves while the bot bobs at the surface with
 * a recovering air bar. The windowed verdict: over the last STABILITY_WINDOW
 * pass records, MOSTLY dry (share >= dryShare) with the TAIL dry (the head
 * is dry NOW - a bot being dragged under reads wet to the end) is as safe
 * as the continuous clock. Junk never releases: a non-boolean wet flag is a
 * LOST reading, not a dry one - the window stays unproven (the v0.75.1
 * Number(null) lesson, now earned three times, lives in every gate).
 *
 * @param {object} [p]
 * @param {Array<{wet: boolean, atMs: number}>|null} [p.reads] pass records, oldest first
 * @param {number} [p.minReads] window fill floor (default STABILITY_WINDOW)
 * @param {number} [p.dryShare] minimum dry share (default STABILITY_MIN_DRY_SHARE)
 * @param {number} [p.tailDry] trailing dry reads required (default STABILITY_TAIL_DRY)
 * @returns {boolean} true -> the rescue may hand the bot back
 */
export function surfaceStability ({ reads = null, minReads = STABILITY_WINDOW, dryShare = STABILITY_MIN_DRY_SHARE, tailDry = STABILITY_TAIL_DRY } = {}) {
  const min = Number.isFinite(minReads) && minReads > 0 ? Math.floor(minReads) : STABILITY_WINDOW
  if (!Array.isArray(reads) || reads.length < min) return false
  const window = reads.slice(-min)
  let dry = 0
  for (const raw of window) {
    if (raw == null || typeof raw !== 'object' || typeof raw.wet !== 'boolean') return false
    if (!raw.wet) dry++
  }
  if (dry / window.length < (Number.isFinite(dryShare) ? dryShare : STABILITY_MIN_DRY_SHARE)) return false
  const tail = Number.isFinite(tailDry) && tailDry >= 0 ? Math.floor(tailDry) : STABILITY_TAIL_DRY
  for (let i = window.length - tail; i < window.length; i++) {
    if (window[i].wet) return false
  }
  return true
}

/**
 * The combined open-water release decision (pure): the v0.80.0 continuous
 * dry clock OR the v0.81.0 stability window OR (v0.82.0) the bobbing tier -
 * all behind the same gates (no shore plan exists, air at/above the rescue
 * line). A drowning bot never releases on any path; junk oxygen reads as
 * full (the clocks decide). Keeping the combination pure keeps the wiring a
 * one-call branch.
 *
 * @param {object} [p]
 * @param {number} [p.headDryMs] continuous dry clock (the v0.80.0 path)
 * @param {number} [p.oxygen] bot.oxygenLevel (junk -> full)
 * @param {object|null} [p.shore] a shoreDirection hit (any plan -> false)
 * @param {Array<{wet: boolean, atMs: number}>|null} [p.reads] pass records (the v0.81.0 window + the v0.82.0 bobbing tier)
 * @returns {boolean} true -> release the bot to the walk gate
 */
export function openWaterRelease ({ headDryMs = 0, oxygen = 20, shore = null, reads = null } = {}) {
  if (shore) return false
  const o2 = oxygenInDomain(oxygen) ? Number(oxygen) : 20
  if (o2 < OXYGEN_RESCUE_LEVEL) return false
  return surfaceSafeRelease({ headDryMs, oxygen: o2, shore: null }) ||
    surfaceStability({ reads }) ||
    bobbingRelease({ reads, oxygen: o2 })
}

/**
 * The unit XZ bearing toward a known land position (pure). Null when any
 * coordinate is junk (the rescue keeps its old behavior) or the land is
 * closer than 2 blocks (the shore scan owns the last meters).
 * @param {object} [p]
 * @param {number} [p.hx] bot x (junk -> null)
 * @param {number} [p.hz] bot z (junk -> null)
 * @param {number} [p.lx] land x (junk -> null)
 * @param {number} [p.lz] land z (junk -> null)
 * @returns {{dx:number,dz:number,dist:number}|null} unit bearing + distance
 */
export function transitBearing ({ hx = null, hz = null, lx = null, lz = null } = {}) {
  // (the v0.75.1 lesson, third strike) a MISSING coordinate activates the
  // default null and Number(null) is 0 - a FINITE phantom land point at the
  // world origin. Explicit null/undefined check BEFORE the coercion; a legit
  // 0 coordinate passes (0 == null is false).
  if (hx == null || hz == null || lx == null || lz == null) return null
  const bx = Number(hx)
  const bz = Number(hz)
  const tx = Number(lx)
  const tz = Number(lz)
  if (!Number.isFinite(bx) || !Number.isFinite(bz) || !Number.isFinite(tx) || !Number.isFinite(tz)) return null
  const dx = tx - bx
  const dz = tz - bz
  const d = Math.hypot(dx, dz)
  if (!Number.isFinite(d) || d < 2) return null
  return { dx: dx / d, dz: dz / d, dist: d }
}

/** digShaft fluid scan set: what may NEVER open under a shaft we are about to
 * dig. Lava kills, water drowns (a shaft punched into an aquifer floods, the
 * bot sinks into a 1x1 well with water walls - no shore, no climb). */
export const SHAFT_FLUID_NAMES = new Set(['lava', 'flowing_lava', 'water', 'bubble_column'])

// ---- v0.51.0: the WATER-FLEE cure ----
// Fleet 35610870878 (the parallel agent's 22:53 section) measured F13 dying to
// a DROWNED flee-chase at hp 4.0 ('fleeing drowned@1.3, hp 4.0'), F16 dying
// post-rescue, F17 in water - 3 of 8 deaths in the water class. The flee's
// raw away-vector (miner.mjs runAway) ignores terrain: fleeing a drowned that
// came FROM the water points DEEPER into the column the drowned owns (it swims
// faster than a surface-swimming bot and never drowns), and the chase is lost
// before it starts. The one winning move against an aquatic hostile in water
// is the SHORE: on land the drowned walks at zombie speed and the bot regains
// its ground mobility. A land threat (zombie) must NOT pull the bot onto a
// shore that may be behind the zombie - the away-vector stays correct there
// (gotoSafe's liquidCost=8 already prefers land detours for the path itself).

/** Hostiles that own the water column (vanilla 26.2): faster than a swimming
 * bot, immune to drowning. Guardians live in ocean monuments (not yet mined),
 * kept in the set so the cure covers the deep-sea mining candidate too. */
export const AQUATIC_HOSTILES = new Set(['drowned', 'guardian', 'elder_guardian'])

/**
 * Which way should a fleeing bot run when the fight reaches water?
 *   'shore' - wet feet (or a submerged head) + an AQUATIC threat + a known
 *             shore: the hop target is the nearest shore cell. On land the
 *             aquatic threat loses its speed and drowning immunity.
 *   'away'  - everything else: the historical raw away-vector (a land mob is
 *             outrun on land; gotoSafe's liquidCost keeps the PATH on land).
 * A submerged head forces 'shore' for ANY threat when a shore is known - the
 * bot is seconds from drowning and the rescue sentry may be mid-cooldown.
 * @param {object} p
 * @param {string|null} [p.threatName] hostile entity name (junk -> 'away')
 * @param {boolean} [p.feetWet] the feet cell reads water
 * @param {boolean} [p.headWet] the head cell reads water (drowning imminent)
 * @param {{dx:number,dz:number,step:number}|null} [p.shore] shoreDirection result
 * @returns {{kind:'shore',dx:number,dz:number,step:number}|{kind:'away'}}
 */
export function fleePlan ({ threatName = null, feetWet = false, headWet = false, shore = null } = {}) {
  const aquatic = typeof threatName === 'string' && AQUATIC_HOSTILES.has(threatName)
  const wantsLand = aquatic || headWet === true
  if (wantsLand && shore && Number.isFinite(shore.dx) && Number.isFinite(shore.dz)) {
    const step = shore.step === 1 ? 1 : 0
    return { kind: 'shore', dx: shore.dx, dz: shore.dz, step }
  }
  return { kind: 'away' }
}

// ---- v0.59.0: the WATER MEMORY ----
// Fleet 35657683920 (the v0.58.1 tip, NORMAL END) flipped the death map: 7 of
// 10 deaths were DROWNINGS, all clustered in one lake region (x -99..-155,
// z 386..424), and the rescue machinery itself reported the loop: F16 completed
// FOUR rescues in a row (2.2-3.4s each) and died in the fifth cycle - after
// every rescue the work loop issued the next dig goal straight back into the
// same flooded column, because NOTHING remembered the water. F4 burned a full
// RESCUE_MAX_MS (25.1s, 'still wet'), re-fired, died later. F1's rescue fired
// at oxygen 0 (a re-dive consequence: a completed rescue, then back in). The
// water is real and persistent - a lake does not dry in a run - so the cure is
// memory: every rescue records WHERE it happened, and the dig planner refuses
// to send the bot back into a live hazard cell (the escalation ladder moves
// the bot instead: the shaft gives up, the caller rotates, the hops go 24-32
// blocks out). Bounded like every other memory in this repo: a TTL, a cap,
// and re-records on every new rescue keep it honest.

/** How long a recorded hazard stays live (ms). 120s covers the immediate
 * re-dive window (the measured F16 loop spanned ~10s) while keeping the set
 * bounded; a fresh rescue re-records and re-arms the window anyway. */
export const WATER_HAZARD_TTL_MS = 120000
/** XZ radius (blocks) around a rescue cell that stays suspect. 4 covers the
 * flooded column plus the banks a sideways sidestep would reach. */
export const WATER_HAZARD_RADIUS = 4
/** Vertical band (blocks, |dy|) a hazard covers. A rescue at y=45 marks
 * y=37..53: digging up or down the same column is the same water. */
export const WATER_HAZARD_Y_BAND = 8
/** Maximum live hazards kept. Bounded amnesia - the oldest record is dropped
 * first (the fleet mines onward; the ancient lake is behind it). */
export const WATER_HAZARD_CAP = 24

/**
 * Record a rescue position as a water hazard (pure: returns a NEW array,
 * the caller reassigns). Expired records are pruned first; a junk position
 * (bot gone mid-rescue) prunes only. The newest record always survives the
 * cap - it is the one the bot is standing in.
 * @param {Array<{x:number,y:number,z:number,at:number}>} hazards current list
 * @param {{x:number,y:number,z:number}|null} [pos] the rescue cell (world coords)
 * @param {number} [now] caller's clock (ms)
 * @param {{ttlMs?:number,cap?:number}} [opts]
 * @returns {Array<{x:number,y:number,z:number,at:number}>} the new list
 */
export function recordWaterHazard (hazards, pos = null, now = Date.now(), { ttlMs = WATER_HAZARD_TTL_MS, cap = WATER_HAZARD_CAP } = {}) {
  const live = (Array.isArray(hazards) ? hazards : []).filter(h =>
    h && Number.isFinite(h.x) && Number.isFinite(h.y) && Number.isFinite(h.z) &&
    Number.isFinite(h.at) && now - h.at < ttlMs
  )
  if (pos && Number.isFinite(pos.x) && Number.isFinite(pos.y) && Number.isFinite(pos.z)) {
    live.push({ x: Math.floor(pos.x), y: Math.floor(pos.y), z: Math.floor(pos.z), at: now })
  }
  return live.slice(-cap)
}

/**
 * Is `pos` inside a live hazard? Returns the nearest live hit as
 * { hazard, d } (d = XZ distance in blocks) or null. A position outside the
 * XZ radius OR outside the y-band is clean; expired records never fire.
 * @param {Array} hazards current list
 * @param {{x:number,y:number,z:number}|null} [pos] the candidate dig/goal cell
 * @param {number} [now] caller's clock (ms)
 * @param {{ttlMs?:number,radius?:number,yBand?:number,zones?:Array|null,zoneYBand?:number}} [opts]
 */
export function nearWaterHazard (hazards, pos = null, now = Date.now(), { ttlMs = WATER_HAZARD_TTL_MS, radius = WATER_HAZARD_RADIUS, yBand = WATER_HAZARD_Y_BAND, zones = null, zoneYBand = HAZARD_ZONE_Y_BAND } = {}) {
  if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.y) || !Number.isFinite(pos.z)) return null
  let best = null
  for (const h of Array.isArray(hazards) ? hazards : []) {
    if (!h || !Number.isFinite(h.at) || now - h.at >= ttlMs) continue
    if (Math.abs(pos.y - h.y) > yBand) continue
    const d = Math.hypot(pos.x - h.x, pos.z - h.z)
    if (d <= radius && (!best || d < best.d)) best = { hazard: h, d }
  }
  // (v0.84.0) ZONE TIER: a cluster envelope fires where no single record does.
  // The run77 rim walk is the shape: records sit at the flooded bottom
  // (y 42-53) inside radius 4 of each other, the candidate stands on the rim
  // (y 56-61) - |58-48|=10 > yBand 8 and XZ 6 > radius 4, so every member is
  // clean while the whole pit is a death trap. Junk zone fields are skipped
  // BEFORE any arithmetic (the Number(null) lesson, sixth strike: Number(null)
  // is 0 and FINITE, a null r would swallow the whole map as hazard).
  if (Array.isArray(zones)) {
    for (const z of zones) {
      if (!z || !Number.isFinite(z.x) || !Number.isFinite(z.y) || !Number.isFinite(z.z) ||
        !Number.isFinite(z.r) || z.r <= 0) continue
      if (Math.abs(pos.y - z.y) > zoneYBand) continue
      const d = Math.hypot(pos.x - z.x, pos.z - z.z)
      if (d <= z.r && (!best || d < best.d)) best = { hazard: z, d, zone: true }
    }
  }
  return best
}

// ---- v0.84.0: THE HAZARD ZONE ----
// Run77 (35755975607, 2c93d6a): the stand-down trio WORKED (still-wet
// timeouts 53 -> 3, first surface-safe releases ever, frozen-client episodes
// 2-17s) - and the freed seconds bought a new headline: >= 8 'fall/env'
// deaths clustered in ONE flooded quarry [-100..-149, 47-56, 368-411] plus
// one drowned (F7). The ledger knew about that quarry - 65 rescues recorded
// it - but the knowledge never connected:
//   * radius 4 vs a ~50x43 quarry: 24 capped point-records with holes the
//     walk machinery paths straight through;
//   * yBand 8 vs a rim at y 56-61 over a bottom at y 42-53: the rim is
//     OUTSIDE every record's band, so mapTargetFor vetoes nothing and the
//     pathfinder happily routes across the quarry mouth (fall/env at the
//     bottom 0s later);
//   * the death spot itself was NEVER recorded - a dead bot left no memory,
//     the next bot walked the same rim into the same pit.
// The cure is CLUSTER MEMORY: hazardZones single-links the live records
// (greedy, XZ distance) into envelopes that near() consults alongside the
// point records. A zone spans the pit's whole depth (its own y-band), grows
// a margin beyond its outermost member, and the death spot joins the ledger
// (miner wiring) so a fall poisons its own pit for the whole fleet. The
// point tier keeps the fine-grained early warning; the zone tier is what a
// WIDE hazard looks like to 19 bots.

/** XZ distance (blocks) under which two live records join one cluster. */
export const HAZARD_ZONE_MERGE_DIST = 12
/** Live records in a cluster before it becomes a zone (a lone pocket stays a point). */
export const HAZARD_ZONE_MIN_COUNT = 2
/** Envelope padding (blocks) beyond the outermost cluster member. */
export const HAZARD_ZONE_MARGIN = 4
/** Vertical half-band (blocks, |dy|) a zone covers. A quarry spans y 42-61
 * from a bottom-anchored cluster - the point band (8) missed the rim; the
 * zone band (16) owns the whole mouth. */
export const HAZARD_ZONE_Y_BAND = 16

/**
 * Cluster live hazards into zone envelopes (pure: returns a NEW array, the
 * caller passes it back into nearWaterHazard's `zones`). Greedy single
 * linkage over XZ distance: each record joins the first cluster it touches,
 * else founds its own. Clusters under minCount stay invisible (points already
 * cover them); junk/expired records prune silently first.
 * @param {Array<{x:number,y:number,z:number,at:number}>} hazards current list
 * @param {number} [now] caller's clock (ms)
 * @param {{ttlMs?:number,mergeDist?:number,minCount?:number,margin?:number}} [opts]
 * @returns {Array<{x:number,y:number,z:number,r:number,count:number}>} zones (centroid + envelope radius)
 */
export function hazardZones (hazards, now = Date.now(), {
  ttlMs = WATER_HAZARD_TTL_MS,
  mergeDist = HAZARD_ZONE_MERGE_DIST,
  minCount = HAZARD_ZONE_MIN_COUNT,
  margin = HAZARD_ZONE_MARGIN
} = {}) {
  const live = (Array.isArray(hazards) ? hazards : []).filter(h =>
    h && Number.isFinite(h.x) && Number.isFinite(h.y) && Number.isFinite(h.z) &&
    Number.isFinite(h.at) && now - h.at < ttlMs
  )
  const clusters = []
  for (const h of live) {
    let home = null
    for (const c of clusters) {
      const d = Math.hypot(h.x - c.cx, h.z - c.cz)
      if (d <= mergeDist) { home = c; break }
    }
    if (home) {
      home.members.push(h)
      home.cx = home.members.reduce((s, m) => s + m.x, 0) / home.members.length
      home.cz = home.members.reduce((s, m) => s + m.z, 0) / home.members.length
    } else {
      clusters.push({ members: [h], cx: h.x, cz: h.z })
    }
  }
  const zones = []
  for (const c of clusters) {
    if (c.members.length < minCount) continue
    const cy = c.members.reduce((s, m) => s + m.y, 0) / c.members.length
    const r = Math.max(...c.members.map(m => Math.hypot(m.x - c.cx, m.z - c.cz))) + margin
    zones.push({ x: c.cx, y: cy, z: c.cz, r, count: c.members.length })
  }
  return zones
}

/**
 * Re-verify a shore cell against the LIVE world right before a flee hop
 * commits to it (pure). shoreDirection scans once; by the time the pathfinder
 * goal is issued the palette may have changed or the cell may never have been
 * what the ring scan thought. Same contract as shoreDirection's shoreAt, but
 * `cell` is the STANDING cell (the flee's GoalBlock target): ground at y-1,
 * two passable air cells above (a wall or a tree there is not a shore a
 * swimming bot can climb onto).
 * @param {(x:number,y:number,z:number)=>string|null} sample block-name reader
 * @param {{x:number,y:number,z:number,step?:number}} cell standing cell
 * @returns {boolean}
 */
export function verifyShoreCell (sample, cell) {
  if (typeof sample !== 'function' || !cell ||
    !Number.isFinite(cell.x) || !Number.isFinite(cell.y) || !Number.isFinite(cell.z)) return false
  const isAir = n => n != null && AIR_NAMES.has(n)
  const isLand = n => n != null && !WATER_NAMES.has(n) && !AIR_NAMES.has(n)
  const groundY = Math.floor(cell.y) - 1
  if (!isLand(sample(cell.x, groundY, cell.z))) return false
  if (!isAir(sample(cell.x, groundY + 1, cell.z))) return false
  if (!isAir(sample(cell.x, groundY + 2, cell.z))) return false
  return true
}

/**
 * The FLEET hazard ledger (v0.62.0): the per-bot `waterHazards` array of v0.60.0
 * is invisible to the other 18 bots - run58's lake drowned SEVEN different bots
 * in the same region, and run59 logged 42x 'refusing this column', which means
 * 42 walks the fleet paid to reach water it could have avoided BEFORE leaving.
 * A ledger instance shared by reference (same wiring as the ClaimBoard: bots
 * live in one process, fleet19 creates one and hands it to every miner) makes
 * one bot's rescue immunize the whole fleet. The pure functions above stay pure
 * - the ledger is a thin stateful wrapper over them with an injectable clock,
 * so expiry, radius and cap are all unit-testable without sleeping.
 */
export class HazardLedger {
  constructor ({ ttlMs = WATER_HAZARD_TTL_MS, radius = WATER_HAZARD_RADIUS, yBand = WATER_HAZARD_Y_BAND, cap = WATER_HAZARD_CAP, now = () => Date.now() } = {}) {
    this.ttlMs = ttlMs
    this.radius = radius
    this.yBand = yBand
    this.cap = cap
    this.now = typeof now === 'function' ? now : () => Date.now()
    this.hazards = []
  }

  /** Record a hazard cell; returns the number of live entries after the write. */
  record (pos) {
    this.hazards = recordWaterHazard(this.hazards, pos, this.now(), { ttlMs: this.ttlMs, cap: this.cap })
    return this.hazards.length
  }

  /** Nearest live hazard within the radius/y-band of pos - { hazard, d } or null.
   * (v0.84.0) the pos is ALSO checked against the zone envelopes derived from
   * the live records on every call: the ledger holds up to cap points, the
   * zones are derived (never stored), so expiry and cap rotate both tiers
   * together. This is the one gate mapTargetFor's wetTrip and digShaft's
   * in-place guard both read - a zone here vetoes walks and columns fleet-wide. */
  near (pos) {
    const zones = hazardZones(this.hazards, this.now(), { ttlMs: this.ttlMs })
    return nearWaterHazard(this.hazards, pos, this.now(), { ttlMs: this.ttlMs, radius: this.radius, yBand: this.yBand, zones })
  }

  /** Live-entry count (expired entries are pruned lazily by record's filter). */
  get size () {
    return this.hazards.length
  }
}

// ---- v0.82.0: THE STAND-DOWN TRIO ----
// Run76 (35748191786, the record run: 4322 @ 7.20 b/s) named the two rescue-
// eating branches its blackbox was built to catch. The fleet still hit a
// record THROUGH them: 92 rescue starts / 53 still-wet timeouts ate ~1325s.
//
// (1) THE FROZEN CLIENT - F17 burned 14 back-to-back 25s budgets at ONE cell
//     [-100,42,377]: the pass blackbox shows a FLAT y (42.2 +- 0.2) across
//     90+ passes with jump held and a STALE oxygen bar (20 while head-wet for
//     the whole budget - a real submersion drains it in ~15s). Physics are
//     not ticking and the block reads are stale: no swim can help a bot whose
//     client is dead. The rescue must NAME it and stand down - the reconnect
//     lane owns a dead client, the rescue owns living water.
// (2) THE REPEAT WET PAGE - F9 burned 25 starts (its whole 600s run) at one
//     flooded pocket [-115,48/49,392]: each rescue ends still-wet, the watch
//     re-pages 3s (cooldown) + 5s (head-wet clock) later, the rescue has
//     nothing new to try, 25s more. A rescue that JUST failed at the same
//     cell with healthy air must stand down and hand the bot to the walk/
//     rotation machinery - which is the only lane that can actually move it.
// (3) THE STALLED TRANSIT + THE BOBBING TIER - F9's dry passes steered at an
//     oak_log d=7 that NEVER shrank (the shaft walls own the swim) and the
//     land branch SHADOWS the release below it; a bobbing head (dry/wet/dry,
//     y 48.2-50.2) also never fills the v0.81.0 stability window (last-3-dry
//     + 75% share is unreachable for a bobber). The transit gets a progress
//     latch; the release gets an oxygen-gated bobbing tier.

/** The frozen-physics window: this many consecutive flat passes condemn the physics. */
export const FROZEN_WINDOW = 10
/** Total drift under this (blocks, per axis) across the window = frozen. */
export const FROZEN_EPS = 0.5
/** A page within this window after a still-wet end at the same cell is a repeat. */
export const REPEAT_PAGE_WINDOW_MS = 90000
/** Full rescues allowed per repeat episode before the stand-down owns the page. */
export const REPEAT_PAGE_ALLOW = 1
/** The stand-down log rate limit (the frozen/repeat lines must survive 19 bots). */
export const STAND_DOWN_LOG_MS = 15000
/** The bobbing release window: this many recent pass records examined. */
export const BOB_WINDOW = 10
/** Dry reads required inside the window (the head DOES reach the air line). */
export const BOB_MIN_DRY = 2
/** Oxygen at/above this (the healthy band run76 measured as 12-20) + the dry reads = surface-safe. */
export const BOB_RELEASE_O2 = 15
/** The transit progress latch: this many passes without closing the distance... */
export const TRANSIT_STALL_PASSES = 15
/** ...by this margin (blocks) = the walls own the swim. */
export const TRANSIT_STALL_MARGIN = 2

/**
 * Did the bot's position FLATLINE across the last `window` pass records
 * (pure)? Run76's F17 sat at [-100,42.2,377] for 90+ passes with jump held:
 * mineflayer physics were not ticking, so no swim, transit or release can
 * ever fire - the honest verdict is to stop spending the 25s budget and let
 * the reconnect lane work. Per-axis drift <= eps across the window condemns
 * it. Junk never condemns: a null/short/NaN reading is a LOST reading, not a
 * frozen one (the Number(null) lesson - fifth strike - lives here too).
 *
 * @param {object} [p]
 * @param {Array<{x:number,y:number,z:number}>|null} [p.points] per-pass positions, oldest first
 * @param {number} [p.window] pass count required (default FROZEN_WINDOW)
 * @param {number} [p.eps] per-axis drift floor (default FROZEN_EPS)
 * @returns {boolean} true -> the physics are frozen, stand down
 */
export function physicsFrozen ({ points = null, window = FROZEN_WINDOW, eps = FROZEN_EPS } = {}) {
  const w = Number.isFinite(window) && window > 1 ? Math.floor(window) : FROZEN_WINDOW
  const e = Number.isFinite(eps) && eps >= 0 ? eps : FROZEN_EPS
  if (!Array.isArray(points) || points.length < w) return false
  const tail = points.slice(-w)
  let minX = Infinity, maxX = -Infinity
  let minY = Infinity, maxY = -Infinity
  let minZ = Infinity, maxZ = -Infinity
  for (const raw of tail) {
    if (raw == null || typeof raw !== 'object') return false
    // (the v0.75.1 lesson, fifth strike) a MISSING coordinate activates the
    // default null and Number(null) is 0 - a FINITE phantom at the origin
    // that would read as a frozen bot for a walking one. Explicit null check
    // BEFORE the coercion.
    if (raw.x == null || raw.y == null || raw.z == null) return false
    const x = Number(raw.x), y = Number(raw.y), z = Number(raw.z)
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return false
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
    if (z < minZ) minZ = z
    if (z > maxZ) maxZ = z
  }
  return (maxX - minX) <= e && (maxY - minY) <= e && (maxZ - minZ) <= e
}

/**
 * May a BOBBING-at-the-surface bot be released (pure, the v0.82.0 third
 * tier)? Run76's F9 toggles head dry/wet while bobbing y 48.2-50.2 in a
 * flooded shaft: the continuous clock resets on every dip and the stability
 * window's tail (last-3-dry) never fills - both v0.80/v0.81 tiers starve
 * forever. The bobbing evidence: within the last `window` pass records the
 * head reached air `minDry` times, and the air bar sits in the healthy band
 * (>= o2Floor - the bot demonstrably CAN breathe there and is not drowning).
 * Junk discipline: a non-boolean wet flag is a LOST reading, not a dry one;
 * junk oxygen reads as full (the repo convention - the gates decide).
 *
 * @param {object} [p]
 * @param {Array<{wet:boolean}>|null} [p.reads] pass records, oldest first
 * @param {number} [p.oxygen] bot.oxygenLevel (junk -> full)
 * @param {number} [p.window] records examined (default BOB_WINDOW)
 * @param {number} [p.minDry] dry reads required (default BOB_MIN_DRY)
 * @param {number} [p.o2Floor] healthy-air floor (default BOB_RELEASE_O2)
 * @returns {boolean} true -> release the bot to the walk gate
 */
export function bobbingRelease ({ reads = null, oxygen = 20, window = BOB_WINDOW, minDry = BOB_MIN_DRY, o2Floor = BOB_RELEASE_O2 } = {}) {
  const raw = Number(oxygen)
  const o2 = oxygenInDomain(raw) ? raw : 20
  if (o2 < (Number.isFinite(o2Floor) ? o2Floor : BOB_RELEASE_O2)) return false
  const w = Number.isFinite(window) && window > 0 ? Math.floor(window) : BOB_WINDOW
  if (!Array.isArray(reads) || reads.length < 1) return false
  let dry = 0
  for (const r of reads.slice(-w)) {
    if (r == null || typeof r !== 'object' || typeof r.wet !== 'boolean') continue
    if (!r.wet) dry++
  }
  return dry >= (Number.isFinite(minDry) ? Math.floor(minDry) : BOB_MIN_DRY)
}

/**
 * Has the map transit STALLED (pure, the v0.82.0 progress latch)? Run76's
 * F9 steered at an oak_log d=7 that never shrank for 60+ passes - the bot
 * was bobbing in a flooded SHAFT and the walls own the swim. Same-distance
 * steering for `maxPasses` passes without closing `margin` blocks condemns
 * the plan: the caller drops it and the release policy takes over. Junk
 * distances never condemn (the Number(null) hole would turn a missing d0
 * into 0 and condemn EVERY swim).
 *
 * @param {object} [p]
 * @param {number|null} [p.d0] distance when the target was picked (null -> false)
 * @param {number|null} [p.d] distance now (null -> false)
 * @param {number} [p.passes] passes steered at this target
 * @param {number} [p.maxPasses] patience (default TRANSIT_STALL_PASSES)
 * @param {number} [p.margin] progress required (default TRANSIT_STALL_MARGIN)
 * @returns {boolean} true -> the transit is stalled, drop the plan
 */
export function transitStalled ({ d0 = null, d = null, passes = 0, maxPasses = TRANSIT_STALL_PASSES, margin = TRANSIT_STALL_MARGIN } = {}) {
  if (d0 == null || d == null) return false
  const a = Number(d0), b = Number(d)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false
  const p = Number(passes)
  if (!Number.isFinite(p)) return false
  const mp = Number.isFinite(maxPasses) ? Math.floor(maxPasses) : TRANSIT_STALL_PASSES
  const m = Number.isFinite(margin) ? margin : TRANSIT_STALL_MARGIN
  return p >= mp && b > a - m
}
