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
/** (v0.119.0) THE FALLING-BAR LANE - run104 (35899827086) mined F3 drowning
 * at o2=2 with the head block reading DRY (the water flooded in through a dig
 * a moment before; the chunk read was still air). The verdict lanes between
 * the rescue level and the critical level all trust the block reads: o2 in
 * 5..10 with dry/unknown head cells reads 'none' until the critical ladder
 * takes over at o2<=4 - and by then the deep pocket has no shore to swim to
 * (run104 F3: rescue start at o2=2, 'shore=none', dead). THE SIGNATURE: a
 * REAL drain is a FALLING bar - the metadata counts down monotonic under
 * water; the 26.2 glitch bar is STUCK at one value or FLAPPING (the run99
 * 395x 'oxygen -1/0 on dry land' pages never descended). A bar that lost
 * AIR_FALL_MIN_DROP levels inside the history window is a genuine countdown
 * - the lanes may believe it even where the blocks lie. */
export const AIR_FALL_MIN_DROP = 2
/** How many in-domain readings the falling-bar verdict needs at minimum. */
export const AIR_FALL_MIN_READS = 3

/** (v0.127.0) THE HISTORY GUARD - the cap of the sentry's falling-bar history
 * (the same 12 the miner wiring has always used; now exported so the guard and
 * the cap ship together). */
export const O2_HISTORY_CAP = 12
/**
 * (v0.127.0) THE HISTORY GUARD (pure): may this oxygen reading enter the
 * falling-bar history that airBarFalling judges?
 *
 * run525 (35927155318) mined the poisoning: F14/F11/F15 died of drown with
 * ZERO water lines - all three were RESPAWNED clients whose air metadata reads
 * ~0 on dry land (the glitch page class), and the sentry's history pushed
 * every in-domain read, glitch 0s included. When the real drain started, the
 * history's tail led with those 0s, so airBarFalling's `first - last` read
 * NEGATIVE (0 - 8 = -8) and the falling-bar lane - the one lane built for
 * exactly this shape (fresh flood, stale dry block reads) - never fired. The
 * critical-on-dry streak lane was laddered to the cap (40 reads = 24 s of
 * fresh counting after the 20 s dry-land-proof gate) by the same bot's
 * confirmed glitch pages: the drain-to-death clock outruns it.
 *
 * THE CURE: a critical-on-dry read is the GLITCH PAGE's evidence - the liar
 * ladder already counts it - and it carries NO trend information (a stuck 0
 * has no slope). It never enters the history. A critical read on WET contact
 * (a real drain) or on UNKNOWN contact (lag, kelp, unloaded chunk) still
 * enters - those are exactly the readings the falling lane exists for. Junk
 * trust judges nothing (the read stays admissible; the domain gate below
 * still applies). Junk-safe: non-finite/negative reads are never admissible
 * (the -1 reset sentinel, NaN, +-Infinity).
 * @param {number} [o2] the raw oxygen reading
 * @param {string|null} [trust] the airBarTrust verdict for the same moment
 *   ('wet' | 'dry' | 'unknown' | junk)
 * @param {object} [p]
 * @param {number} [p.critical] the critical level (default OXYGEN_CRITICAL_LEVEL)
 * @returns {boolean} true = the read may enter the falling-bar history
 */
export function historyAdmissible (o2, trust, { critical = OXYGEN_CRITICAL_LEVEL } = {}) {
  if (!oxygenInDomain(o2)) return false
  const crit = Number.isFinite(critical) ? critical : OXYGEN_CRITICAL_LEVEL
  if (trust === 'dry' && Number(o2) <= crit) return false
  return true
}

/** (v0.129.0) THE SURFACE-RELEASE RE-ARM - how long after a surface-safe
 * release the sentry paces its re-pages. run530 (35933537636, the v0.127.0
 * fleet, SUCCESS) mined F15 floating an open lake for the whole run: 39
 * 'drowning rescue start' pages, 36 'rescue released (surface-safe, open
 * water - no land known)' - each cycle a setGoal(null) walk cancel plus
 * 2.5-5.3 s of rescue, then RESCUE_COOLDOWN_MS (3 s) re-armed the sentry and
 * the bar hovering at the rescue level (10-12) paged again. The release is
 * CORRECT (the bot lived - 19/19); the pacing is the waste: a bot the
 * release just certified surface-safe is floating, breathing, refilling -
 * not drowning. THE CURE: after a surface-safe release the sentry holds
 * rescue-level re-pages for SURFACE_REARM_MS (12 s - two full refill
 * windows); inside the window only a genuinely SINKING bar (o2 at or under
 * the critical level) pages - the drain-to-death clock (~35 s from o2 = 0)
 * outruns the remaining window with room to spare. Junk-safe: no release
 * record, a junk clock, or an expired window never hold. */
export const SURFACE_REARM_MS = 12000
/**
 * (v0.129.0) THE SURFACE-RELEASE RE-ARM (pure): should the sentry hold this
 * page because a surface-safe release just certified the bot as floating?
 * @param {object} [p]
 * @param {number|null} [p.releasedAgoMs] ms since the last surface-safe
 *   release (null/undefined = no release record)
 * @param {number} [p.oxygen] the raw oxygen read (junk/-1 read FULL - a
 *   missing bar never drives a page, so it never breaks the hold either)
 * @param {number} [p.critical] the critical level (default OXYGEN_CRITICAL_LEVEL)
 * @param {number} [p.rearmMs] the pacing window (default SURFACE_REARM_MS)
 * @returns {boolean} true = the page holds (the float owns the pacing)
 */
export function surfaceRearmHolds ({ releasedAgoMs = null, oxygen = 20, critical = OXYGEN_CRITICAL_LEVEL, rearmMs = SURFACE_REARM_MS } = {}) {
  // null/undefined both mean "no release record" - Number(null) is 0, which
  // would otherwise masquerade as a release that just happened (the wiring's
  // `releasedAgoMs ? ... : null` keeps the shape, the guard keeps the truth).
  if (releasedAgoMs == null) return false
  const ago = Number(releasedAgoMs)
  if (!Number.isFinite(ago) || ago < 0) return false
  const win = Number.isFinite(rearmMs) && rearmMs > 0 ? rearmMs : SURFACE_REARM_MS
  if (ago >= win) return false
  const crit = Number.isFinite(critical) ? critical : OXYGEN_CRITICAL_LEVEL
  const o2 = Number(oxygen)
  // only an IN-DOMAIN sinking bar breaks the hold: the -1 reset sentinel and
  // NaN read FULL (v0.64.0 semantics - a missing bar never drives a page),
  // so they never break one either.
  if (oxygenInDomain(o2) && o2 <= crit) return false
  return true
}
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
// (v0.104.0) THE DRY-LAND PROOF - run93 (35835942682) mined 2026-09-23: F9/F15
// stood DRY on the quarry rim with a bar stuck at 0; the v0.95.0 streak
// escalation paged 'drowning', the rescue broke out in 0.0 s (dry + on
// ground - no water anywhere), recorded the DRY cell as a hazard, and the
// sentry re-fired 3 s later - 45+ cycles per bot of walk-goal cancels
// (setGoal(null)) and hazard-ledger poisoning feeding the pathfinder A* that
// detonated the run (stormguard FATAL at rss 2626M). A rescue that completes
// with ZERO water contact inside DRY_PROOF_MAX_MS is the disproof of
// 'sustained drain' for that moment: the streak restarts and the next
// critical-on-dry page waits DRY_PROOF_BACKOFF_MS. A genuinely draining bot
// still outruns this: the drain-to-death clock is ~35 s from o2 = 0, the
// backoff is 20 s - and with the waterlog-state read (v0.104.0) the real
// F17 class now reads WET at airBarTrust and never touches this gate.
export const DRY_PROOF_MAX_MS = 2000
export const DRY_PROOF_BACKOFF_MS = 20000

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
export function airBarTrust ({ feet = null, head = null, feetWaterlogged = false, headWaterlogged = false } = {}) {
  if (isWaterName(feet) || isWaterName(head)) return 'wet'
  // (v0.104.0) THE WATERLOG STATE: a waterlogged stair/slab/fence reads its
  // BASE name, not water - run84a F17 drowned behind 'dry' reads while the
  // server drained a real bar (the v0.95.0 streak escalation paged a rescue
  // that broke out 0.0 s later, because the rescue's own water test read the
  // same dry names and never swam). The blockstate does not lie: a true
  // waterlogged flag IS water contact ('wet' - the rescue loop swims, the
  // sentry pages without the streak ladder). A missing/junk flag judges
  // nothing - every legacy caller (no flags) keeps its verdict byte for byte.
  if (feetWaterlogged === true || headWaterlogged === true) return 'wet'
  const dry = n => n != null && !isWaterName(n)
  if (dry(feet) && dry(head)) return 'dry'
  return 'unknown'
}

/**
 * (v0.119.0) Is the air bar genuinely DRAINING? Pure: the last readings
 * (oldest first, junk already skipped by the caller's push rule) lost at
 * least AIR_FALL_MIN_DROP levels from the window's start to its end. The
 * glitch bar is stuck or flapping - it never descends - so a falling read
 * is a real countdown even where the block reads lie (the stale-air head
 * cell of a fresh flood). A refill (resurface, metadata reset) reads as a
 * rise and resets the signature honestly.
 * @param {number[]|null|undefined} [reads] recent in-domain oxygen readings,
 *   oldest first (the caller pushes only oxygenInDomain values)
 * @param {object} [p]
 * @param {number} [p.window] judge only the last N readings (default 6)
 * @param {number} [p.drop] required loss across the window (default AIR_FALL_MIN_DROP)
 * @returns {boolean} true = the bar is draining for real
 */
export function airBarFalling (reads, { window = 6, drop = AIR_FALL_MIN_DROP } = {}) {
  if (!Array.isArray(reads)) return false
  const w = Number.isFinite(window) && window > 0 ? Math.floor(window) : 6
  const need = Number.isFinite(drop) && drop > 0 ? drop : AIR_FALL_MIN_DROP
  const tail = reads.slice(-w).filter(r => oxygenInDomain(r))
  if (tail.length < AIR_FALL_MIN_READS) return false
  const first = tail[0]
  const last = tail[tail.length - 1]
  return first - last >= need
}

/**
 * (v0.104.0) THE DRY-LAND PROOF (pure): did this rescue complete with zero
 * water contact fast enough to disprove 'sustained drain' at that moment?
 * wetPasses counts the loop's water-contact passes (feet/head water-named or
 * waterlogged-flagged); elapsedMs is the rescue's own wall clock. Only the
 * fast zero-contact shape proves dry - a long airborne flail or a frozen
 * stand-down keeps the legacy hazard record (the caller decides).
 * Junk-safe: junk inputs judge NOTHING (false = no proof, legacy path).
 * @param {{wetPasses?: number, elapsedMs?: number}} p
 * @returns {boolean}
 */
export function dryLandProof ({ wetPasses = null, elapsedMs = null } = {}) {
  const w = Number.isFinite(wetPasses) ? wetPasses : NaN
  const e = Number.isFinite(elapsedMs) ? elapsedMs : NaN
  if (!Number.isFinite(w) || w < 0) return false
  if (!Number.isFinite(e) || e < 0) return false
  return w === 0 && e <= DRY_PROOF_MAX_MS
}

/**
 * The one-look verdict. Inputs are the raw reads the bot already has:
 *   feet/head : block NAME at the feet cell / head cell (string | null when
 *               unloaded - null is NOT water)
 *   oxygen    : bot.oxygenLevel ?? 20 (never trust a missing bar with a 0)
 *   headWetMs : how long the head has been continuously submerged (caller's
 *               clock; 0 right now)
 *   dryGlitchStreak : consecutive critical-on-dry readings the caller has
 *               counted (junk -> 0 = the legacy never-believe-a-dry-glitch
 *               shape); at AIR_GLITCH_STREAK_CAP the bar is believed (run84a
 *               F17: a sustained zero on dry land was a real drowning)
 * Verdicts:
 *   'none'     - dry, nothing to do
 *   'wet'      - water contact but breathing fine (feet-only, or head just
 *                broke surface with air to spare) - monitor, no emergency
 *   'drowning' - rescue NOW
 */
export function waterVerdict ({ feet = null, head = null, feetWaterlogged = false, headWaterlogged = false, oxygen = 20, headWetMs = 0, dryGlitchStreak = 0, dryGlitchCap = AIR_GLITCH_STREAK_CAP, airHistory = null } = {}) {
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
  // (v0.104.0) the waterlog flags ride through: waterlogged contact is 'wet'
  // here - a real F17-class drain pages WITHOUT the streak ladder, and the
  // streak stays a fallback for blocks whose state is unreadable.
  if (o2 <= OXYGEN_CRITICAL_LEVEL && airBarTrust({ feet, head, feetWaterlogged, headWaterlogged }) !== 'dry') return 'drowning'
  // (v0.119.0) THE FALLING-BAR LANE: a bar at or under the rescue level that
  // is genuinely DESCENDING is a real countdown no matter what the block
  // reads say (the run104 F3 class: head flooded through a fresh dig, the
  // chunk still reads air, o2 drains 10 -> 2 with verdict 'none' the whole
  // way). The glitch bar never descends (stuck/flapping), so this lane
  // cannot re-arm the dry-land lie the liar ladder polices; it rides BELOW
  // the critical lane above and ABOVE the block-trust gates below on
  // purpose - fresh evidence outranks stale cells.
  if (o2 <= OXYGEN_RESCUE_LEVEL && airBarFalling(airHistory)) return 'drowning'
  // (v0.95.0) THE GLITCH ESCALATION: the dry out-vote is no longer ABSOLUTE -
  // a SUSTAINED critical-on-dry streak means the server is draining a real
  // air bar the block reads miss (run84a F17: 675+ ignored reads, then dead
  // of drowning). Junk streak -> 0 -> the legacy shape, byte for byte.
  const streak = Number.isFinite(dryGlitchStreak) && dryGlitchStreak > 0 ? Math.floor(dryGlitchStreak) : 0
  // (v0.117.0) the effective cap: the chronic-liar ladder raises the evidence
  // bar per CONFIRMED no-op page (glitchStreakCap); a junk cap reads the
  // legacy 8 - the escalation never locks itself out on a wiring sickness.
  const cap = Number.isFinite(dryGlitchCap) && dryGlitchCap > 0 ? Math.floor(dryGlitchCap) : AIR_GLITCH_STREAK_CAP
  if (o2 <= OXYGEN_CRITICAL_LEVEL && streak >= cap) return 'drowning'
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

// ---- v0.94.0: THE FLEE-DRY VETO ----
// Run80 (35773697160, artifact 10716448682) named the class: F5 was released
// surface-safe, then the flee verdict (drowned + creeper, hp 6.2) WALKED it
// into the flooded quarry - drowned@7.9. runAway's wet branches are water-aware
// (the shore plan + verifyShoreCell), but a hop chosen for a DRY bot - the
// radial away-vector and the yard kite - never judged its own TARGET: the
// away-vector and the yard bearing cross whatever lies ~12 blocks out, the
// flooded quarry included, and the fleet's own death memory (the hazard
// records + the v0.84.0 zone envelopes) sat unused by every flee branch.
// The veto: a flee hop target must be water-free by the live world AND
// outside the hazard ledger; a blocked bearing rotates a quarter turn (the
// order: 0, +90, -90, 180) before the original stands - a chasing mob beats
// a standstill, so all-blocked keeps the legacy hop (gotoSafe owns the walk,
// the next loop iteration's wet detection owns the arrival-wet case).

/** The streak of consecutive critical-on-dry readings after which the air bar
 * is BELIEVED despite definite dry contact (run84a: F17 spent its whole run
 * glitch-ignored - 675+ reads - and the server drowned it anyway: a SUSTAINED
 * zero bar on 'dry land' is the server draining a real air bar the feet/head
 * reads miss, not a sensor artifact). 8 consecutive sentry passes (~0.6s
 * cadence) is ~5s of sustained critical-on-dry - far past any measured glitch
 * burst, and the rescue ladder's own stand-downs (frozen verdict, repeat-page)
 * absorb the false alarms a wasted swim would cost. */
export const AIR_GLITCH_STREAK_CAP = 8

// (v0.117.0) THE CHRONIC-LIAR LADDER - run102 (35889087936) mined 2026-09-24:
// F3 read 151+ 'oxygen 0 on dry land' pages, fired 11 streak overrides, 15
// rescue starts, 10 dry-land proofs (EVERY page disproven) and 4 frozen-client
// relogs - the proof restarts the streak, but the gate window keeps COUNTING
// critical-on-dry ticks, so the stale streak (~33 reads) re-arms the page the
// moment the 20 s gate expires: a no-op rescue every ~25 s for the whole run.
// THE CURE: every dry-land proof for a critical-on-dry page CONFIRMS the bar
// lies for this bot - the FRESH streak required for the next override ladders
// up by GLITCH_LADDER_STEP per confirmation, bounded at GLITCH_LADDER_MAX
// (~24 s of sustained critical-on-dry at the 600 ms sentry cadence). A
// genuinely draining bar still outruns the ladder: run84a F17's real drain was
// 675+ sustained reads. The confirmation count resets on any WET contact (a
// bot that touches water is a new page class) and on a rescue that does NOT
// prove dry (the real-drain shape keeps the fast lane).
export const GLITCH_LADDER_STEP = 8
export const GLITCH_LADDER_MAX = 40

/** The streak cap for the override verdict after `confirmed` dry-land proofs
 * of the glitch class. Junk/zero confirmations read the legacy cap (8) - a
 * first page is always trusted at the old weight; the ladder only ever GROWS
 * the evidence bar, never past GLITCH_LADDER_MAX. */
export function glitchStreakCap (confirmed = 0) {
  const n = Number.isFinite(confirmed) && confirmed > 0 ? Math.floor(confirmed) : 0
  return Math.min(AIR_GLITCH_STREAK_CAP + n * GLITCH_LADDER_STEP, GLITCH_LADDER_MAX)
}

// (v0.195.0) THE AIR-GLITCH MAP PIN - run82 (36201371882, the v0.192.0 union)
// mined 2026-09-26: the fleet's airGlitches counter read 588 while the decode
// greps ('airGlitch') found ZERO lines - the blind spot was a SEARCH miss (the
// lines say 'air-bar', the v0.41.1 filter's 'water' keyword carried them all
// along: 25 lines, every one F3). The pin this cure adds: the counter's whole
// story rode ONE bot (the final total 578 ~= the fleet's 588) at oxygen 0 on
// dry land, 10 overrides believed the bar - and the decode could not ask WHERE
// the sensor sat broken. Both air-glitch line shapes now name the floored
// position; the legacy wording keeps its prefix byte for byte (the filter key,
// the decode greps and the run-history comparability stay valid). Junk-safe:
// a missing/NaN position reads the legacy shape with no 'at' tail.
export function airGlitchLogLine ({ kind = 'ignored', tag = '', oxygen = 0, total = 0, streak = 0, pos = null } = {}) {
  const p = pos && Number.isFinite(pos.x) && Number.isFinite(pos.y) && Number.isFinite(pos.z) ? pos : null
  const at = p ? ` at [${Math.floor(p.x)},${Math.floor(p.y)},${Math.floor(p.z)}]` : ''
  if (kind === 'override') {
    return `${tag} water: air-bar glitch override - ${Math.floor(streak)} consecutive critical-on-dry reads, believing the bar${at}`
  }
  return `${tag} water: air-bar glitch ignored (oxygen ${oxygen} on dry land${at}, ${total} total)`
}

// (v0.130.0) THE DROWNING WITNESS - run536 (35938786076, the v0.129.0 fleet)
// mined F8's death: 474 'air-bar glitch ignored' suppressions, 13 rescue
// starts, several 0.0s no-op completions whose dry-land proofs kept
// CONFIRMING the bar lies (the v0.117.0 ladder ratcheted toward its 40 cap)
// - and then the server drowned the bot anyway. A ratcheted ladder
// (cap 40 = ~50 s of fresh reads at the sentry cadence) can no longer be
// climbed by a real drain inside its ~35 s death clock: the lie history
// out-votes the truth. The honest witness the block reads cannot fake is
// DROWNING DAMAGE - vanilla hurts a bot whose air is truly gone, and a bot
// standing on real dry land takes none. So while the page class sits
// critical-on-'dry', a health decline of DROWN_CORROBORATION_HP from the
// highest health seen during the class corroborates a REAL drain: the
// witness outranks the ladder AND the 20 s gate (the caller bypasses both).
// The running max (not the class-start value) keeps regeneration honest -
// a bot that healed mid-class needs the fresh decline measured from its
// healed peak. Junk-safe end to end: a missing/flat/dead health read
// witnesses NOTHING (false - the legacy gates keep their say), and a
// critical bar that is NOT corroborated stays on the lie ladder exactly as
// before (the rim-glitch control: health flat = still a sensor lie).
export const DROWN_CORROBORATION_HP = 2

// (v0.147.0) THE WITNESS COMBAT BAND - the melee-veto radius. MEASURED (run33,
// 36004321933, the 0.144.0 union fleet): 20 deaths and a 289-rescue phantom
// flood (F3=119 + F10=114 starts, 212 'complete in 0.0s'), and the witness
// lane was the pump. Its arithmetic compares health against the CLASS MAX -
// a bot in a long combat session (hits down to hp 3-4, food regen back up)
// NEVER leaves the witness's crosshairs: 'F3 health 20 -> 4 on a 'dry'
// critical bar' repeats while F3's own death inference reads zombie@13.4 -
// the declines were a ZOMBIE'S BURSTS, not a drain (vanilla drowning is an
// unattributed 2hp/s tick; a zombie normal hit is 3hp with an owner). A
// hostile within this band owns the decline: the witness stands down (the
// legacy gates + the lie ladder keep their say - the vetted page class is
// combat's now). A REAL drain in an empty pocket (the F8 run536 shape - the
// witness's founding evidence) has nobody within the band and keeps the
// full witness + bypass. Band 8 covers the shamble-reach melee classes
// (zombie/drowned/spider close to touch); a skeleton at 14b is outside the
// band - its arrows ride the legacy gates and the ratchet, which held them
// in every run on record.
export const WITNESS_COMBAT_BAND = 8

export function drowningCorroborated ({ criticalOnDry = false, healthNow = null, healthSeenMax = null, hostileNear = false } = {}) {
  if (!criticalOnDry) return false
  if (hostileNear) return false // (v0.147.0) THE MELEE VETO - a hostile in the band owns the decline
  const now = Number(healthNow)
  const seen = Number(healthSeenMax)
  if (!Number.isFinite(now) || now <= 0) return false // dead/despawned - the death lane owns the verdict
  if (!Number.isFinite(seen) || seen <= 0) return false // no honest witness baseline
  return seen - now >= DROWN_CORROBORATION_HP
}

/** One quarter turn of an XZ bearing, counter-clockwise on the map plane:
 * (1,0) -> (0,1). turns wraps mod 4 (negative turns normalize); junk turns
 * fall back to 0. */
export function rotateBearingXZ (dx, dz, turns = 1) {
  if (!Number.isFinite(dx) || !Number.isFinite(dz)) return { x: dx, z: dz }
  let t = Number.isFinite(turns) ? Math.trunc(turns) % 4 : 0
  if (t < 0) t += 4
  // the `|| 0` on the negated slots normalizes -0 -> 0 (the negation of a 0
  // bearing component is -0, which deepStrictEqual - and the target math -
  // treat as a distinct value; a flee bearing has no signed zero)
  if (t === 0) return { x: dx || 0, z: dz || 0 }
  if (t === 1) return { x: -dz || 0, z: dx || 0 }
  if (t === 2) return { x: -dx || 0, z: -dz || 0 }
  return { x: dz || 0, z: -dx || 0 }
}

/** Is this flee hop target water by the live world, or inside the fleet's
 * hazard memory? Junk-safe end to end: non-finite coords judge NOTHING
 * (false - the caller falls back to the legacy target), a throwing sample or
 * ledger read degrades to the remaining tier, null blocks (unloaded chunks)
 * read as not-blocked (the hop tries; the wet detection owns the arrival).
 * @param {object} p
 * @param {Function|null} [p.sample] (x,y,z) -> block name string|null
 * @param {Function|null} [p.hazardNear] (pos) -> hazard record|null (the ledger's near)
 * @param {number} p.x target cell x (finite required to judge)
 * @param {number} p.y the fleeing bot's floored y (the sample plane)
 * @param {number} p.z target cell z
 * @returns {boolean} true = this bearing walks the bot into water / a known hazard
 */
export function fleeTargetBlocked ({ sample = null, hazardNear = null, x, y, z } = {}) {
  // no coordinate defaults: a destructuring default FIRES on undefined and
  // would manufacture a judgeable coordinate out of junk (the eleventh strike
  // of the Number(null) class) - and a 0 default would judge the world origin
  // as a real target. The finiteness guard alone owns every junk shape.
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return false
  // tier 1: the fleet's death memory - a live hazard record or zone envelope
  // at the target vetoes the bearing even when the world read says dry (the
  // chunks at 12 blocks out may not hold the water the fleet already died in)
  if (typeof hazardNear === 'function') {
    try {
      if (hazardNear({ x: Math.round(x), y: Math.round(y), z: Math.round(z) }) != null) return true
    } catch { /* a ledger read failure degrades to the world tier */ }
  }
  // tier 2: the live world - the target cell or its FLOOR is water (a water
  // floor under an air cell is the pool the walk steps into on arrival)
  if (typeof sample === 'function') {
    let at = null
    let floor = null
    try {
      at = sample(x, y, z)
      floor = sample(x, y - 1, z)
    } catch { return false }
    if (isWaterName(at) || isWaterName(floor)) return true
  }
  return false
}

/** Does the STRAIGHT LINE from the anchor toward this target cross water?
 * Samples the line at 25/50/75% (the target cell itself is judged separately
 * by fleeTargetBlocked), each sample probed 3 deep (y, y-1, y-2 - the flee
 * path can descend a slope into a lake whose surface reads dry at the anchor
 * plane). Run84a measured four bots dying drowned@7.8-14.4 WHILE FLEEING a
 * drowned across the quarry lakes: the target veto passed (the far shore was
 * dry) but the PATH swam. Junk-safe: a non-finite sample point or a
 * throwing/null read skips that sample - never vetoes on junk.
 * @param {object} p
 * @param {Function|null} [p.sample] (x,y,z) -> block name string|null
 * @param {number} p.ax anchor x (the fleeing bot's position)
 * @param {number} p.ay anchor y (the sample plane)
 * @param {number} p.az anchor z
 * @param {number} p.tx candidate target x
 * @param {number} p.tz candidate target z
 * @returns {boolean} true = this straight hop swims
 */
export function fleePathBlocked ({ sample = null, ax, ay, az, tx, tz } = {}) {
  if (typeof sample !== 'function') return false
  if (!Number.isFinite(ax) || !Number.isFinite(ay) || !Number.isFinite(az) ||
      !Number.isFinite(tx) || !Number.isFinite(tz)) return false
  for (const f of [0.25, 0.5, 0.75]) {
    const x = ax + (tx - ax) * f
    const z = az + (tz - az) * f
    if (!Number.isFinite(x) || !Number.isFinite(z)) continue
    const rx = Math.round(x)
    const rz = Math.round(z)
    for (const dy of [0, -1, -2]) {
      let name = null
      try {
        name = sample(rx, ay + dy, rz)
      } catch { continue }
      if (isWaterName(name)) return true
    }
  }
  return false
}

/** Pick the flee hop target: the caller's target first, then quarter-turn
 * rotations of the (target - anchor) offset (same length, deterministic
 * order 0/+90/-90/180); the first target that passes fleeTargetBlocked wins.
 * ALL candidates blocked (or the offset is junk) -> the original stands
 * (null only when the offset itself is non-finite - the caller keeps its
 * legacy target, which gotoSafe's own guards then own).
 * @param {object} p
 * @param {Function|null} [p.sample] the live-world reader (see fleeTargetBlocked)
 * @param {Function|null} [p.hazardNear] the ledger reader (see fleeTargetBlocked)
 * @param {number} p.ax anchor x (the fleeing bot's position)
 * @param {number} p.ay anchor y (floored - the sample plane)
 * @param {number} p.az anchor z
 * @param {number} p.tx the raw hop target x (radial away or kite hop)
 * @param {number} p.tz the raw hop target z
 * @returns {{x:number,z:number,turns:number}|null}
 */
export function vettedFleeTargetAbs ({ sample = null, hazardNear = null, ax, ay, az, tx, tz } = {}) {
  // no coordinate defaults (see fleeTargetBlocked): an omitted field must be
  // junk, never a silently manufactured 0 that turns into a judgeable bearing
  const odx = tx - ax
  const odz = tz - az
  if (!Number.isFinite(odx) || !Number.isFinite(odz) || !Number.isFinite(ax) || !Number.isFinite(az) || !Number.isFinite(ay)) return null
  for (const turns of [0, 1, 3, 2]) {
    const r = rotateBearingXZ(odx, odz, turns)
    const x = ax + r.x
    const z = az + r.z
    // (v0.95.0) the PATH veto rides the target veto: a dry far shore across a
    // lake is still a swim (run84a's four flee-into-water deaths). A candidate
    // must be water-free at the target AND along the straight line to it.
    if (fleeTargetBlocked({ sample, hazardNear, x, y: ay, z })) continue
    if (fleePathBlocked({ sample, ax, ay, az, tx: x, tz: z })) continue
    return { x, z, turns }
  }
  return { x: ax + odx, z: az + odz, turns: 0 }
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
/** (v0.209.0) How long a DEATH-spot record stays live (ms). Run55 (fleet
 * 36226589855) measured the exact repeat: F16 fell at [-117,42,406] and the
 * next fall death (F17) landed on the SAME cell - the death spot's "4 live"
 * count matched F16's own "4 live" exactly, which reads one way: the F16
 * record had ALREADY expired (a live F16 record would have made it 5). A
 * death spot is not a transient rescue pool - it is a structural trap (a
 * rim over a flooded quarry stays a rim) - and the reloot machinery walks a
 * respawned bot back at its own death spot inside a window measured at
 * 189s, LONGER than the 120s rescue TTL: the spot can be legally unprotected
 * while the bot is en route to it. Death tenure doubles the water TTL so
 * the trap outlives the return window; rescue records keep 120s (they ARE
 * transient - the pool drains, the bot moves on). */
export const WATER_DEATH_TTL_MS = 240000
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
 * (v0.209.0) Is this record still live? A record that carries its own `ttl`
 * (a death-spot record) outlives the ledger's default; a plain rescue record
 * reads the ledger TTL. One predicate because the same expiry law must hold
 * in THREE filters (record's prune, near's loop, zones' cluster input) - a
 * record that one filter calls dead and another calls alive is the
 * double-standard bug class this repo keeps unshipping.
 * @param {{x:number,y:number,z:number,at:number,ttl?:number}} h the record
 * @param {number} now caller's clock (ms)
 * @param {number} ttlMs the ledger's default TTL
 * @returns {boolean}
 */
export function waterHazardAlive (h, now, ttlMs) {
  return !!h && Number.isFinite(h.x) && Number.isFinite(h.y) && Number.isFinite(h.z) &&
    Number.isFinite(h.at) && now - h.at < (Number.isFinite(h.ttl) ? h.ttl : ttlMs)
}

/**
 * Record a rescue position as a water hazard (pure: returns a NEW array,
 * the caller reassigns). Expired records are pruned first; a junk position
 * (bot gone mid-rescue) prunes only. The newest record always survives the
 * cap - it is the one the bot is standing in.
 * (v0.209.0) `opts.recordTtlMs` stamps the NEW record with its own TTL (the
 * death-spot tenure): the field is written ONLY when set, so plain rescue
 * records keep the exact v0.62.0 shape and their deep pins stay untouched.
 * @param {Array<{x:number,y:number,z:number,at:number,ttl?:number}>} hazards current list
 * @param {{x:number,y:number,z:number}|null} [pos] the rescue cell (world coords)
 * @param {number} [now] caller's clock (ms)
 * @param {{ttlMs?:number,cap?:number,recordTtlMs?:number|null}} [opts]
 * @returns {Array<{x:number,y:number,z:number,at:number,ttl?:number}>} the new list
 */
export function recordWaterHazard (hazards, pos = null, now = Date.now(), { ttlMs = WATER_HAZARD_TTL_MS, cap = WATER_HAZARD_CAP, recordTtlMs = null } = {}) {
  const live = (Array.isArray(hazards) ? hazards : []).filter(h => waterHazardAlive(h, now, ttlMs))
  if (pos && Number.isFinite(pos.x) && Number.isFinite(pos.y) && Number.isFinite(pos.z)) {
    const cell = { x: Math.floor(pos.x), y: Math.floor(pos.y), z: Math.floor(pos.z), at: now }
    if (Number.isFinite(recordTtlMs) && recordTtlMs > 0) cell.ttl = recordTtlMs
    live.push(cell)
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
    if (!waterHazardAlive(h, now, ttlMs)) continue
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
  const live = (Array.isArray(hazards) ? hazards : []).filter(h => waterHazardAlive(h, now, ttlMs))
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

  /** Record a hazard cell; returns the number of live entries after the write.
   * (v0.209.0) `opts.ttlMs` stamps THIS record with its own tenure (the
   * death-spot record outlives the rescue records) - the ledger's own
   * ttlMs stays every other record's law. */
  record (pos, { ttlMs: recordTtlMs = null } = {}) {
    this.hazards = recordWaterHazard(this.hazards, pos, this.now(), { ttlMs: this.ttlMs, cap: this.cap, recordTtlMs })
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

// (v0.132.0) THE WET-FROZEN FAST WINDOW - run538 (35945938164, the union
// fleet through v0.131.0) mined FOUR drown deaths of one shape (F8 relog #5,
// F12 #3, F17 #2, F10): a bot reconnects into a deep pocket, the client
// physics wedge within a pass or two (flat y with head WET), and the freeze
// DIAGNOSIS then burns FROZEN_WINDOW=10 passes (~5-6s) of CONNECTED drowning
// before the stand-down hands the bot to the relog lane. The disconnect
// itself is safe (a disconnected entity does not tick - air and health
// freeze), so every connected second at o2 <= critical is pure vanilla
// drowning damage (~2 hp/s): the 10-pass window donates ~10 hp per cycle to
// the clock. The v0.96.0 wet-frozen relog already escalates on the FIRST wet
// verdict; this window cuts the verdict's own latency to WET_FROZEN_WINDOW=4
// passes (~2-2.5s) whenever the head is WET and the bar is at/under
// OXYGEN_CRITICAL_LEVEL - the asymmetry is honest: a false-positive relog
// costs one reconnect (air frozen during the down window, the safe lane), a
// false-negative costs 10+ hp of connected dying. The DRY class keeps the
// calibrated 10-pass window (run76's F17: 90+ flat passes, no urgency - a
// dry bot is harmless where it stands). Junk oxygen or a non-wet head reads
// the legacy window - the gates-decide convention.
export const WET_FROZEN_WINDOW = 4

export function frozenWindowFor ({ headWet = false, oxygen = null } = {}) {
  if (headWet !== true) return FROZEN_WINDOW
  // the Number(null) lesson - Number(null) is 0, which would read a MISSING
  // bar as the death clock: only a GENUINE finite number >= 0 gates the fast
  // window (null/undefined/NaN/-1 all read the legacy 10-pass window)
  if (!Number.isFinite(oxygen) || oxygen < 0) return FROZEN_WINDOW
  return oxygen <= OXYGEN_CRITICAL_LEVEL ? WET_FROZEN_WINDOW : FROZEN_WINDOW
}
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

// ---------------------------------------------------------------------------
// (v0.125.0) THE DEEP-POCKET ASCEND - the ceiling class the jump-only lane
// cannot own.
//
// MEASURED (run108, dispatch 35919773515, the v0.123.0 fleet): F7 and F11
// died the run104 F10 shape exactly - the rescue START already at o2=0 (the
// glitch bar hid the real drain until it was gone), 'shore=none', and the
// submerged branch's jump+settle produced ZERO y movement pass over pass
// (F7: pass 0 y=54.2 -> pass 7 y=54.2 flat while o2 fell 0 -> -1): a
// CEILING owned the pocket. The o2 kept FALLING, so the physics were alive
// - physicsFrozen must never condemn this bot (and did not: the frozen
// verdict needs 10 flat passes, the drown clock outran it). The human
// playbook in a flooded cave is what the lane was missing: surface to the
// ceiling and DIG UP.
//
// ascendStalled is the pure stall question (y flat for K passes = the jump
// is producing nothing); ceilingCell is the pure ceiling answer (the block
// ABOVE the head: the bot occupies floor(y) and floor(y)+1, the head is the
// +1 cell and it reads water - the ceiling is floor(y)+2). The miner's
// submerged branch asks both: stalled + a diggable ceiling block = dig,
// rise through our own hole; a failed/absent/undiggable read falls back to
// the jump-only shape byte for byte. The frozen detector still owns the
// true freeze (a dead client never digs either) and RESCUE_MAX_MS caps the
// whole lane - the dig can never extend the budget, only spend it better.

/** Flat-pass count before the submerged lane tries the ceiling dig. */
export const ASCEND_STALL_PASSES = 4
/** Per-pass y movement below which a submerged pass counts as stalled (blocks). */
export const ASCEND_STALL_EPS = 0.15
/** Ceiling digs one rescue may attempt (a thick roof climbs one block per
 * pass; the budget stops a tunnel-dig from eating the whole 25s). */
export const ASCEND_DIG_BUDGET = 8

/**
 * Did the bot's y FLATTEN across the last `minPasses` submerged passes
 * (pure)? Run108's F7 held y=54.2 through 7+ jump passes with the o2 bar
 * falling - the jump was producing nothing. Unlike physicsFrozen (all axes,
 * 10 passes, condemns the client), this watches ONLY y: a bot swimming
 * sideways along a ceiling is as stuck for the ascend as a frozen one, and
 * the K is deliberately below the frozen window so the dig gets its chance
 * before the stand-down. Junk never stalls: a null/short/NaN reading is a
 * LOST reading, not a stalled one (the Number(null) lesson - fifth strike).
 *
 * @param {object} [p]
 * @param {Array<{x:number,y:number,z:number}>|null} [p.points] per-pass positions, oldest first
 * @param {number} [p.minPasses] flat passes required (default ASCEND_STALL_PASSES)
 * @param {number} [p.epsilon] per-pass y movement floor (default ASCEND_STALL_EPS)
 * @returns {boolean} true -> the ascend is stalled, try the ceiling
 */
export function ascendStalled ({ points = null, minPasses = ASCEND_STALL_PASSES, epsilon = ASCEND_STALL_EPS } = {}) {
  const k = Number.isFinite(minPasses) && minPasses > 1 ? Math.floor(minPasses) : ASCEND_STALL_PASSES
  const e = Number.isFinite(epsilon) && epsilon >= 0 ? epsilon : ASCEND_STALL_EPS
  if (!Array.isArray(points) || points.length < k + 1) return false
  const tail = points.slice(-(k + 1))
  for (let i = 1; i < tail.length; i++) {
    const prev = tail[i - 1]
    const cur = tail[i]
    if (prev == null || cur == null || typeof prev !== 'object' || typeof cur !== 'object') return false
    if (prev.y == null || cur.y == null) return false
    const py = Number(prev.y)
    const cy = Number(cur.y)
    if (!Number.isFinite(py) || !Number.isFinite(cy)) return false
    if (Math.abs(cy - py) >= e) return false
  }
  return true
}

/**
 * The cell ABOVE the head (pure). The bot's entity position is its feet: it
 * occupies floor(y) and floor(y)+1; with the head cell reading WATER (the
 * lane only calls this submerged) the first solid above is floor(y)+2.
 * Junk positions read null - the caller keeps the jump-only shape.
 *
 * @param {{x:number,y:number,z:number}|null} [pos] entity feet position
 * @returns {{x:number,y:number,z:number}|null} the ceiling cell, or null
 */
export function ceilingCell (pos) {
  if (!pos || typeof pos !== 'object') return null
  if (pos.x == null || pos.y == null || pos.z == null) return null
  const x = Number(pos.x)
  const y = Number(pos.y)
  const z = Number(pos.z)
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null
  return { x: Math.floor(x), y: Math.floor(y) + 2, z: Math.floor(z) }
}

// ---------------------------------------------------------------------------
// (v0.87.0) THE FROZEN-CLIENT RELOG - the stand-down needs a floor.
//
// MEASURED (run79, dispatch 35766110886 on c59d9f3): F8 burned 93 stand-downs
// in ONE wet pocket [-129,47/48,406] - the frozen verdicts were TRUE (10 flat
// passes at y=48.2 with o2 FROZEN at 20: the physics really stalled), but the
// handoff they promise ("the reconnect lane owns a dead client") never
// happens, because the client is NOT dead - the socket stays healthy (no
// EPIPE, reconnects=3 fleet-wide) and the server guard only watches
// player-list losses. Nobody claims the bot; the sentry re-pages 3-5s after
// every stand-down; the rescue re-detects the same freeze; ~half the run
// burns in the cycle. The honest escalation: after N CONSECUTIVE frozen
// verdicts the water rescue force-ends the session (bot.end()) - the fleet
// session loop reconnects with a fresh client, the physics rebuild, the
// mined stats ride the carry (v0.18.9). A transient stall recovers within
// 1-2 verdicts and never reaches the threshold; a persistent one costs the
// bot ~40s of churn instead of 600s.

/** Consecutive frozen verdicts before the rescue force-hands the bot to the reconnect lane. */
export const FROZEN_RELOG_AFTER = 3

// (v0.96.0) THE WET-FROZEN RELOG - the threshold is for DRY clients only.
// MEASURED (run85, dispatch 35806079822): the 'fall/env' death class was
// DROWNING IN DISGUISE - F3 (o2 -1/0, head wet) and F19 (o2 -1) flatlined at
// the quarry-lake level y=51-56, the frozen-physics verdict stood the rescue
// down ('the reconnect lane owns a dead client'), and the SERVER kept
// ticking the drowning clock nobody was swimming against - both died within
// seconds, labeled fall/env by the respawn cause parser. The v0.87.0
// escalation exists for exactly this but waits THREE consecutive verdicts
// (~75s of rescue windows) - a head-wet bot on a real drowning clock has
// ~15s of air. A frozen verdict while HEAD-WET therefore escalates on the
// FIRST verdict: the relog is the only lane that can beat the clock (the
// fresh client rebuilds the physics, the sentry re-pages, the rescue swims
// the bot out). A DRY frozen bot is harmless where it stands - the legacy
// threshold keeps protecting it from a premature session end.

/**
 * Should a frozen-physics stand-down escalate to a forced session end (pure,
 * junk-safe)? The counter counts CONSECUTIVE frozen verdicts - the caller
 * resets it on every rescue that ends with living physics (and the per-bot
 * closure dies with the session, so a relog restarts it naturally). A bot
 * with no entity or a dead one never needs the escalation: the respawn and
 * the session loop already own those exits.
 *
 * @param {object} [p]
 * @param {number} [p.frozenStandDowns] consecutive frozen verdicts so far (junk -> 0)
 * @param {boolean} [p.hasEntity] does the bot still have an entity
 * @param {number} [p.health] the bot's health (junk -> treated as alive)
 * @param {boolean} [p.headWet] is the head under water at the verdict (junk -> false:
 *   only a boolean TRUE accelerates - the gates-decide convention)
 * @param {number} [p.threshold] verdicts required (default FROZEN_RELOG_AFTER)
 * @returns {{relog: boolean, why: string}}
 */
export function frozenRelogDecision ({ frozenStandDowns = 0, hasEntity = true, health = 20, headWet = false, threshold = FROZEN_RELOG_AFTER } = {}) {
  const t = Number.isFinite(threshold) && threshold >= 1 ? Math.floor(threshold) : FROZEN_RELOG_AFTER
  const n = Number.isFinite(frozenStandDowns) && frozenStandDowns > 0 ? Math.floor(frozenStandDowns) : 0
  if (!hasEntity) return { relog: false, why: 'no entity - the session loop already owns it' }
  if (Number.isFinite(health) && health <= 0) return { relog: false, why: 'bot dead - the respawn owns it' }
  if (n < t) {
    // (v0.96.0) THE WET-FROZEN RELOG: a head-wet frozen bot is on the
    // drowning clock - the stand-down would hand a DYING bot to a lane that
    // takes ~75s to arm. One verdict is proof enough (the bot cannot swim
    // out client-side and the server does not care about client excuses).
    if (headWet === true) return { relog: true, why: `frozen while head-wet (${n} verdict${n === 1 ? '' : 's'}) - the drowning clock owns this client` }
    return { relog: false, why: `${n}/${t} flat stand-downs` }
  }
  return { relog: true, why: `${n} consecutive frozen verdicts` }
}

// (v0.119.0) THE FROZEN-RETURN GATE - run103 (35895546754) mined 2026-09-24:
// the v0.96.0 wet-frozen relog fired 30 times fleet-wide and became a LOOP.
// F14: 12 rescue starts at the SAME column [-121,58-59,376], 12 relogs, zero
// completions - every cycle: the headWetMs clock pages at o2 12-13, the bot
// surfaces (o2 recovers 19-20), the physics FREEZE at the surface with the
// head still reading wet, the first-verdict wet relog ends the session, the
// reconnect lane drops the bot back into the SAME water column, the sentry
// re-pages within seconds - the "the rescue swims the bot out" promise fails
// when the shore scan reads none and the work loop never gets a tick before
// the re-page. THE CURE: after a frozen relog the drowning sentry HOLDS its
// non-critical pages for a laddered window (10s/20s/40s/60s per consecutive
// relog, bounded) - the fresh client gets the time the promise assumed: the
// work loop issues a walk (the hazard cell is already memorized) and the bot
// leaves the column client-side. A genuinely CRITICAL read (o2 <=
// OXYGEN_CRITICAL_LEVEL, wet or dry) bypasses immediately - the ~35s
// drain-to-death clock outranks any gate. The per-bot streak resets on an
// honest rescue completion (living physics through the whole budget).

/** The sentry hold after a bot's Nth consecutive frozen relog (pure,
 * junk-safe). 0 relogs -> 0 (no gate); junk counts read 0 - a wiring
 * sickness must never arm a hold. The doubling caps at 60s: one honest
 * walk-out window, not a residency. */
export const FROZEN_RETURN_GATE_BASE_MS = 10000
export const FROZEN_RETURN_GATE_MAX_MS = 60000

export function frozenReturnGate ({ consecutiveRelogs = 0 } = {}) {
  const n = Number.isFinite(consecutiveRelogs) && consecutiveRelogs > 0 ? Math.floor(consecutiveRelogs) : 0
  if (n === 0) return 0
  return Math.min(FROZEN_RETURN_GATE_BASE_MS * Math.pow(2, n - 1), FROZEN_RETURN_GATE_MAX_MS)
}

/** Does this drowning page BYPASS the frozen-return gate (pure)? Only a
 * genuinely critical bar does - the ~35s drain-to-death clock outranks the
 * hold; wet and dry criticals both bypass (a dry critical is the liar
 * ladder's class, which paces itself; a wet critical is a real drowning).
 * Junk oxygen never bypasses (the gates-decide convention: a lost read
 * cannot spend an emergency). */
export function frozenReturnBypass ({ oxygen = 20 } = {}) {
  const raw = Number(oxygen)
  return oxygenInDomain(raw) && raw <= OXYGEN_CRITICAL_LEVEL
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
