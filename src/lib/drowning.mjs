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
 * @param {{ttlMs?:number,radius?:number,yBand?:number}} [opts]
 */
export function nearWaterHazard (hazards, pos = null, now = Date.now(), { ttlMs = WATER_HAZARD_TTL_MS, radius = WATER_HAZARD_RADIUS, yBand = WATER_HAZARD_Y_BAND } = {}) {
  if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.y) || !Number.isFinite(pos.z)) return null
  let best = null
  for (const h of Array.isArray(hazards) ? hazards : []) {
    if (!h || !Number.isFinite(h.at) || now - h.at >= ttlMs) continue
    if (Math.abs(pos.y - h.y) > yBand) continue
    const d = Math.hypot(pos.x - h.x, pos.z - h.z)
    if (d <= radius && (!best || d < best.d)) best = { hazard: h, d }
  }
  return best
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

  /** Nearest live hazard within the radius/y-band of pos - { hazard, d } or null. */
  near (pos) {
    return nearWaterHazard(this.hazards, pos, this.now(), { ttlMs: this.ttlMs, radius: this.radius, yBand: this.yBand })
  }

  /** Live-entry count (expired entries are pruned lazily by record's filter). */
  get size () {
    return this.hazards.length
  }
}
