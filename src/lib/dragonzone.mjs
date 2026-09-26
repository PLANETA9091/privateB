/**
 * dragonzone.mjs - (v0.220.0) THE DRAGON ZONE - the kill anchor and the
 * avoidance predicate, pure. The v0.200.0 pattern: the plan lands first,
 * fully unit-tested, and the field debut rides the next lane.
 *
 * MEASURED (the 01:00 fire's dragon-zone forensics, both era dragon kills
 * pulled to the persistent dragon-forensics/ set):
 *   run30 F6 (36229765630): 'was killed by Ender Dragon using magic' at
 *           [101,49,1] (the two-word `by` truncation era - the CAUSE line
 *           is stable across the era; v0.210.0 later fixed the `by` read).
 *   run29 F18 (36253378529): 'was killed by Ender Dragon using magic' at
 *           [99,49,1] (the fix reads clean).
 *   THE ZONE: two kills ~2 blocks apart at y=49 - a FIXED ANCHOR
 *   (~[100,49,1]), not a chase. Both hints read fall/env - the magic kill
 *   has no touch, the inferrer is structurally blind to it (the fall/env
 *   noise class again; the v0.218.0 cure covers explosion/drown, the
 *   magic-kill hint stays noise BY CONSTRUCTION and is NOT this module's
 *   evidence - the position is).
 *
 * The dragon patrols the testbed world with a kill anchor near x=100 z=1.
 * The plan: cluster the magic-kill deaths into an anchor, and name the
 * ground the fleet should not stand on. The wiring candidates ride later:
 * WorldMap target-assignment exclusion + the shelter priority on zone
 * entry. No new log forms planned (the wiring lane owns any field line).
 */

/** The cluster radius (blocks, 3D) - two kills farther apart than this
 *  form separate clusters; the two field kills (2 apart) merge. */
export const DRAGON_ZONE_CLUSTER = 8

/** The avoidance radius (blocks, horizontal) - the zone is the anchor's
 *  ground shadow; the vertical band stays the wiring lane's calibration. */
export const DRAGON_ZONE_RADIUS = 16

/** The magic-kill signature - the era-stable cause line. The `by` field
 *  truncated to 'Ender' in the early era; the CAUSE text never did. */
const MAGIC_KILL_RE = /Ender Dragon using magic/

const fin = v => Number.isFinite(v)

/**
 * Reads one death record into a magic-kill position, or null.
 * A record qualifies when its cause matches the era-stable signature and
 * its position parses with finite x/y/z. Everything else (a zombie kill,
 * a fall, a junk record, a missing pos) is not a magic kill and is
 * skipped - honest: the zone clusters ONLY the measured kill class.
 *
 * @param {unknown} d a death record: { pos:{x,y,z}, cause:string } (the
 *        fleet's death-cause shape; extra fields ride untouched)
 * @returns {{x:number,y:number,z:number}|null}
 */
function magicKillPos (d) {
  if (!d || typeof d !== 'object') return null
  if (typeof d.cause !== 'string' || !MAGIC_KILL_RE.test(d.cause)) return null
  const p = d.pos
  if (!p || typeof p !== 'object') return null
  if (!fin(p.x) || !fin(p.y) || !fin(p.z)) return null
  return { x: p.x, y: p.y, z: p.z }
}

/**
 * (v0.220.0) THE ZONE ANCHOR - clusters the 'using magic' dragon deaths
 * within DRAGON_ZONE_CLUSTER (8b, 3D) into an anchor, pure. Greedy
 * single-pass in array order (deterministic): each magic kill joins the
 * FIRST formed cluster whose running centroid sits within the cluster
 * radius, else forms its own. The winner is the LARGEST cluster (ties ->
 * the first formed - array order owns it). The anchor is the winner's
 * centroid rounded per axis (the wiring's GoalNear prices integers; the
 * two field kills 101+99 -> 100 exact).
 *
 * The gates, each named:
 *   null        no magic kills at all (no zone measured - the predicate
 *               must stay vacuous, not guess)
 *   count 1     a single magic kill names an anchor of its own (the
 *               wiring calibrates whether a lone sample acts)
 *
 * @param {Array<{pos:{x:number,y:number,z:number}, cause:string}>|null}
 *        [deaths] the run's death records (any order; array order owns
 *        the greedy pass and the tie-break)
 * @returns {{x:number,y:number,z:number,count:number}|null} the anchor
 *          (the largest cluster's rounded centroid + its member count),
 *          or null when no magic kill parses
 */
export function dragonZoneAnchor (deaths) {
  if (!Array.isArray(deaths)) return null
  const clusters = [] // each: { pts:[{x,y,z}], sx, sy, sz }
  for (const d of deaths) {
    const p = magicKillPos(d)
    if (!p) continue
    let home = null
    for (const c of clusters) {
      const n = c.pts.length
      const cx = c.sx / n; const cy = c.sy / n; const cz = c.sz / n
      if (Math.hypot(p.x - cx, p.y - cy, p.z - cz) <= DRAGON_ZONE_CLUSTER) { home = c; break }
    }
    if (home) { home.pts.push(p); home.sx += p.x; home.sy += p.y; home.sz += p.z } else {
      clusters.push({ pts: [p], sx: p.x, sy: p.y, sz: p.z })
    }
  }
  if (clusters.length === 0) return null
  let win = clusters[0]
  for (const c of clusters) if (c.pts.length > win.pts.length) win = c
  const n = win.pts.length
  return {
    x: Math.round(win.sx / n),
    y: Math.round(win.sy / n),
    z: Math.round(win.sz / n),
    count: n
  }
}

/**
 * (v0.220.0) THE ZONE PREDICATE - is a position inside the dragon zone,
 * pure. The zone is the anchor's GROUND SHADOW: the distance rides the
 * horizontal plane (dx/dz) against DRAGON_ZONE_RADIUS (16b); the vertical
 * axis stays out (a bot directly above the anchor stands in the zone's
 * shadow too - pinned) and the honest measured radius stays the wiring
 * lane's calibration. The boundary is inclusive (<= the radius reads
 * inside) - an avoidance test must err toward avoidance.
 *
 * The gates, each named:
 *   no anchor   reads false (no zone measured - no avoidance, honest)
 *   junk pos    reads false (an unparseable position is not evidence of
 *               zone presence; the wiring's own position read owns that)
 *
 * @param {{x:number,y:number,z:number}|null} [pos] the tested position
 * @param {{x:number,y:number,z:number,count?:number}|null} [anchor]
 *        the dragonZoneAnchor result (null -> false)
 * @returns {boolean} true when the position stands inside the zone
 */
export function inDragonZone (pos, anchor) {
  if (!anchor || typeof anchor !== 'object') return false
  if (!fin(anchor.x) || !fin(anchor.y) || !fin(anchor.z)) return false
  if (!pos || typeof pos !== 'object') return false
  if (!fin(pos.x) || !fin(pos.y) || !fin(pos.z)) return false
  const dx = pos.x - anchor.x
  const dz = pos.z - anchor.z
  return Math.hypot(dx, dz) <= DRAGON_ZONE_RADIUS
}

// ---- (v0.225.0) THE WIRING SIDE - the death registry's cap and the exit
// pricing. The v0.200.0 pattern kept: anything the wiring must decide that
// a unit can pin lives here, pure; the call sites (the death handler
// records, the runner's work loop consults) stay thin enough for source
// pins to name every scalar.

/** (v0.225.0) The death registry's memory cap - the fleet-shared log holds
 *  the last DRAGON_DEATH_LOG_CAP server-verb records. The zone clusters
 *  ONLY the magic-kill class (the registry carries every fresh server
 *  verdict - the non-magic causes ride harmlessly, skipped by the cluster's
 *  own read, and a future fixed-anchor class may reuse them); deaths are
 *  the run's rarest event (2 per era measured), so 128 is era-proof
 *  headroom, not a behavioral gate. */
export const DRAGON_DEATH_LOG_CAP = 128

/** (v0.225.0) The zone-exit walk's budget (ms) - one bounded gotoSafe per
 *  entry; the walk machinery owns the failure and the next pass re-reads. */
export const DRAGON_ZONE_EXIT_MS = 15000

/** (v0.225.0) The exit pad (blocks) - the goal sits this far BEYOND the
 *  radius along the away ray, so the arrival clears the zone even with the
 *  goal sphere's own tolerance. */
export const DRAGON_ZONE_EXIT_PAD = 4

/**
 * (v0.225.0) THE ZONE EXIT - where a bot standing inside the zone walks,
 * pure. The away direction rides the horizontal ray FROM the anchor TO the
 * bot (the dragon kills at the anchor - the exit walks away from it, never
 * across it); the goal sits radius + pad beyond the ANCHOR along that ray
 * (outside the zone even with the goal sphere's tolerance) and keeps the
 * bot's own y (the walk machinery prices the terrain). The gates, each
 * named:
 *   junk pos/anchor   null (the wiring stays vacuous, never guesses)
 *   degenerate ray    null (the bot stands ON the anchor - no honest away
 *                     direction exists; the wiring holds one pass and
 *                     re-reads - the measured kill class is positional,
 *                     not a chase, so a held bot is not a chased bot)
 *
 * @param {{x:number,y:number,z:number}} pos the bot's position (the wiring
 *        reads it only after inDragonZone passed, so x/z are finite)
 * @param {{x:number,y:number,z:number,count?:number}|null} anchor the
 *        dragonZoneAnchor result
 * @param {object} [o] radius/pad overrides (the constants own the defaults)
 * @returns {{x:number,y:number,z:number}|null} the exit goal, or null when
 *          no honest away ray exists
 */
export function dragonZoneExit (pos, anchor, { radius = DRAGON_ZONE_RADIUS, pad = DRAGON_ZONE_EXIT_PAD } = {}) {
  if (!anchor || typeof anchor !== 'object' || !fin(anchor.x) || !fin(anchor.z)) return null
  if (!pos || typeof pos !== 'object' || !fin(pos.x) || !fin(pos.z)) return null
  const dx = pos.x - anchor.x
  const dz = pos.z - anchor.z
  const d = Math.hypot(dx, dz)
  if (!(d > 0)) return null // degenerate: on the anchor - no honest away ray
  const r = fin(radius) && radius > 0 ? radius : DRAGON_ZONE_RADIUS
  const p = fin(pad) && pad >= 0 ? pad : DRAGON_ZONE_EXIT_PAD
  const reach = r + p
  return {
    x: anchor.x + (dx / d) * reach,
    y: fin(pos.y) ? pos.y : 0,
    z: anchor.z + (dz / d) * reach
  }
}
