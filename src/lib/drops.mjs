// Drop-collection targets (v0.173.0): the pure pick that turns a DUG block into
// a COLLECTED item. Why this exists - run74's F13 vein sweep logged '9 ores dug
// beside the gallery' while its pocket read ZERO coal at every snapshot: the
// sweep digs in place (reach 4.5) but an ore's drop lands INSIDE the freed cell,
// 2-4 blocks from the bot and often behind the dug face, and Minecraft only
// auto-picks items that touch the collector (~1.5 blocks). The fleet ledger
// counted coal_ore=175 mined while the pockets held ~23 - the ore-detour's
// conversion died between the dig and the pocket, and the fuel front (torches,
// furnace) starved at exactly that link. The two surface diggers (sweep,
// chopReachable) already walk their item entities after the batch; the
// underground vein sweep was the only digger that never did.
//
// Contract (pure, unit-testable):
//   - entities: mineflayer's bot.entities - the PLAIN OBJECT index (numeric keys,
//     the v0.172.0 lesson: never a Map, never .has()) or any iterable of
//     entity-likes. Anything else yields [].
//   - from: the collector's position; entries without a numeric position, a
//     non-'item' name, or a non-finite distance are skipped, never thrown.
//   - nearest first: the closest drop is the walk the bot is already facing;
//     a capped list keeps the walk bounded like the surface precedents (slice 8).
export const SWEEP_DROP_REACH = 8 // drops from swept cells sit <=4.5 away; scatter + fall gives margin
export const SWEEP_DROP_CAP = 8 // the same per-batch cap sweep() and chopReachable use
// (v0.186.0) THE PROBE HALF-STEP: 8000 -> 4000. MEASURED (fleet 36181152847, the
// v0.185.0 union run): x28 drop walks died 'timeout after 8000ms' - ~224s of the
// 24s-per-sweep fences burned by walks that NEVER converged - and only 8 of the
// 28 were below-plane (the v0.178/v0.182 classes); 20 were FLAT range-1 walks to
// drops within REACH 8, where the house walk arithmetic (500ms/block with the 2x
// detour inside it - the CHEST_WALK rule) prices the worst honest walk at ~4s.
// An 8s timeout only
// ever served walks that were geometrically doomed at their stance (a stall, a
// sealed face) - and it ate a THIRD of the batch fence per doomed probe. The 4s
// probe keeps the full-detour geometry covered, lets the 24s SWEEP_DROP_TOTAL_MS
// fence fit 6 probes instead of 3 (the converging-walk chances per batch DOUBLE),
// and a walk cut at 4s leaves the drop for the next sweep - the v0.182.0
// re-classify doctrine (a later sweep at a different stance may reach it); the
// item despawn (300s) is ample. The same 2x-detour arithmetic as v0.18.5's
// CHEST_WALK: bounded, never open-ended.
export const SWEEP_DROP_TIMEOUT_MS = 4000 // one drop's walk budget - a sealed gallery fails faster
export const SWEEP_DROP_TOTAL_MS = 24000 // the whole drop-walk budget - a bonus, never a clock burn

// (v0.178.0) THE DROP GOAL RANGE - the below-plane drops get the forgiving goal.
// MEASURED (fleet 36131508220, the v0.177.0 run): 44 sweeps / 267 ores dug /
// 32 '+Nu walked from the drops' - the v0.173.0 harvest CONVERTS (the run64
// 'zero walks' record stands corrected as the filter artifact the v0.176.0
// lane called it) - but 52 drop walks still failed, and x33 of them were
// 'sweep drops: timeout after 8000ms'. An 8s budget for a 2-8 block walk in
// the bot's own gallery is not slowness - the pathfinder never CONVERGED.
// The shape: an ore's drop falls INTO the freed cell (or down the fresh
// shaft) 1-2 blocks BELOW the walk plane, and GoalNear's isEnd is a 3D
// sphere (dx^2+dy^2+dz^2 <= range^2): range 1 demands a standable cell
// within 1.0 of the drop's CENTER, but the only standable cells are the
// gallery lip ABOVE (dy -1.5..-2.5, 3D dist ~1.8-2.2) - every recompute
// lands partial and the walk spirals into the timeout, and the same cells
// re-fail on the next sweep (F16 [-114,40,380] then [-114,42,377]).
// THE CURE: a drop resting BELOW the walk plane (dy < DROP_GOAL_BELOW_DY)
// walks with range 2 - the lip beside/above the drop counts as arrival
// (3D dist ~1.8 <= 2), the spiral dies, and a still-unpicked drop rides the
// next pass (galleries are revisited; the despawn clock is 5 min). At/above
// the plane keeps range 1 byte-identical - a flat gallery converges INTO the
// magnet. The above-plane ledge class was deferred unmeasured that day - the
// wide goal would end the walk farther from the drop for no measured gain.
// Junk input = the legacy 1 - a missing read never widens a goal.
export const DROP_GOAL_PLANE = 1 // the legacy tight goal (the walk INTO the magnet)
export const DROP_GOAL_BELOW = 2 // the below-plane goal (the lip counts as arrival)
// (v0.191.0) THE FENCE-EDGE BELOW FAMILY - the v0.178.0 fence re-derived on
// the run190 measurement. MEASURED (fleet 36195869446, the v0.190.0 union run):
// 59 drop-walk failures, and the range-1 family carries a class the v0.178.0
// sample never held: dy -1.0 x9 timeouts + x1 'No path to the goal!' + x1
// doomed-ledged, dy -0.7 x3 - TWELVE walks on SEVEN bots (F12/F19/F6/F13/F2/
// F15/F1) in disjoint cells. The geometry re-derived from GoalNear's source
// (the constructor floors the goal, isEnd is a 3D ball of radius `range` around
// that floored cell): the drop rests in the cell ONE BELOW the walk plane - the
// ore dug through the gallery floor's face, the item's entity lift reads
// -0.7..-1.0 relative to the bot's feet - and its column is SEALED FROM ABOVE
// by the very floor the bot stands on, so the range-1 ball holds only the goal
// cell itself (every plane stance reads dist sqrt(lateral^2 + 1^2) >= sqrt(2)
// > 1.0) and NO standable cell - the walk spirals EXACTLY the v0.178.0 shape,
// one fence-row lower than the sample that calibrated -1. THE CURE: the fence
// edge moves -1 -> -0.5 (the midpoint of the measured gap between the flat
// family's dy >= 0 reads and the one-below cell's -0.7): the -0.7/-1.0 classes
// join the BELOW lip sphere (the plane floor beside the sealed column is a
// legal arrival, dist sqrt(1^2 + 1^2) <= 2), and a still-unpicked arrival arms
// the v0.187.0 dig-down - whose family fence reads THIS constant too, so the
// chain the v0.187.0 design awaited (converge on the lip, then close the last
// mile by digging) finally opens its window for the most common below class.
// The flat family (dy >= -0.5: the measured 0.0 x9 + the doomed 0.3 read)
// keeps the legacy tight goal; the deep fence (-2.0 edge) and the above fence
// (dy > 0) are untouched. Junk dy = the legacy PLANE.
export const DROP_GOAL_BELOW_DY = -0.5 // the plane fence: below this the drop rests a cell UNDER the walk plane (the one-below class, v0.191.0; was -1 - the run190 fence-edge class sat exactly at the old edge)

// (v0.189.0) THE ABOVE-PLANE LEDGE GOAL - the v0.178.0 sphere arithmetic
// MIRRORED UP, now measured. MEASURED (fleet 36191851635, the v0.188.0
// triple-union run, the (dy, range) instrument's field debut): 47 drop-walk
// failures split x42 'plane(>=-1) on range 1' vs x5 below - and the plane
// family's dy values are OVERWHELMINGLY ABOVE the walk plane: dy +1.0 x6,
// +1.2, +2.0 x3, +2.1, +4.0 (the ore face's upper blocks and the ledge drops
// - an ore dug at head height drops an item that rests ON the ledge the bot
// cannot stand on). THE SAME SPHERE AS v0.178.0, MIRRORED: GoalNear range 1
// demands a standable cell within 1.0 of the drop's center, but a drop
// resting 1+ ABOVE the walk plane has its own cell at HEAD HEIGHT against
// the gallery ceiling (the cell above it is CEILING - not standable) and the
// adjacent floor lip reads 3D dist sqrt(lateral^2 + 1.3^2) ~ 1.6 > 1.0 -
// every recompute lands partial, the walk spirals into the (now 4s) timeout.
// THE CURE: a drop resting ABOVE the walk plane (dy > DROP_GOAL_ABOVE_DY)
// walks range 2 - the floor beside/below the ledge is a legal arrival
// (3D dist ~1.3-1.6 <= 2.0) AND the drop at torso/head height overlaps the
// bot's own body column, so the ~1.5 pickup magnet covers it ON ARRIVAL
// (the below class needed the v0.187.0 dig-down for its last mile; the
// above class's last mile is the bot's own bbox). The dy exactly 0.0 flat
// family keeps the legacy range 1 (its measured timeouts ride the budget/
// brake class - the goal geometry converges flat drops into the magnet).
// Junk dy = the legacy PLANE - a missing read never widens a goal.
export const DROP_GOAL_ABOVE = 2 // the above-plane goal (the ledge floor counts as arrival - the same wide sphere)
export const DROP_GOAL_ABOVE_DY = 0 // the ledge fence: strictly above the walk plane

// THE DEEP FENCE (v0.182.0): the range-2 lip sphere is a 3D ball of radius 2 -
// a drop resting 2+ BELOW the walk plane (3D dist >= 2.0 from EVERY standable
// lip cell) can never satisfy it, and the walk is a guaranteed 8s recompute
// spiral. MEASURED (fleet 36161088876, the v0.181.0 run): the below-plane
// residue line named x10 'the drop rests deeper than the lip' while the
// timeout class hit x41 (43 sweeps - ~1 dead walk per sweep); the same class
// measured x3 in the v0.180.0 run. Those drops were NEVER collected by the
// walk (it always timed out) - skipping the walk costs nothing the fleet was
// actually getting and returns the 8s per dead walk to the batch fence (the
// 24s SWEEP_DROP_TOTAL_MS fits 3 live walks instead of 2 live + 1 spiral).
// The verdict: dy < DROP_GOAL_DEEP_DY walks NOTHING (the drop waits for the
// despawn exactly as the doomed walk left it - and a later sweep at a
// different stance may reclassify it into the lip sphere). dy exactly -2.0
// stays in the BELOW class (the sphere edge, sqrt(4+0) = 2.0 <= 2.0 still
// converges on a perfectly-understood cell); junk dy = the legacy PLANE (a
// missing read never skips a walk).
export const DROP_GOAL_DEEP_DY = -2 // the deep fence: strictly below this the lip sphere cannot reach
export const DROP_GOAL_SKIP = 0 // the skip verdict: no walk at all (the range the GoalNear must never see)

export function dropGoalRange ({ dy = 0 } = {}) {
  const d = Number.isFinite(dy) ? dy : 0
  if (d < DROP_GOAL_DEEP_DY) return DROP_GOAL_SKIP
  if (d > DROP_GOAL_ABOVE_DY) return DROP_GOAL_ABOVE
  return d < DROP_GOAL_BELOW_DY ? DROP_GOAL_BELOW : DROP_GOAL_PLANE
}

// (v0.187.0) THE LIP DIG-DOWN - the range-2 arrival's LAST MILE. MEASURED
// (fleet 36181152847, the v0.183.0+0.184.0+0.185.0 triple-union run): the
// harvest converted (21 '+Nu walked' lines, 264 ores dug by 34 sweeps) but
// 11 sweeps still ended 'the drop walks picked nothing (pocket delta 0)' -
// and x8 of them logged ZERO failed walks. The walks CONVERGED and the
// pocket gained NOTHING: a BELOW-class walk arrives on the lip (the
// v0.178.0 cure's legal arrival, 3D dist ~1.8-2.0 <= 2.0) but the pickup
// magnet only reaches ~1.5 (the v0.173.0 reading) - the drop sits OUTSIDE
// the magnet exactly where the wide goal parked the bot. The v0.178.0 cure
// traded the spiral for the lip arrival; the last 0.5-1.0 of 3D distance
// never closed. THE CURE: after a BELOW-class walk CONVERGES with the drop
// still un-picked, dig the ONE solid block the bot stands on (the lip's
// floor over the drop's hole) - the bot drops 1-2 into the hole, the drop
// is at its feet, the magnet sweeps it. The guards are all measured-class
// fences, never new physics:
//   - the drop must be in the BELOW family (the plane class converges INTO
//     the magnet already, and the v0.189.0 ABOVE class parks the bot BESIDE a
//     drop that is UP - a dig-under there would open the gallery floor for
//     nothing; the family reads the dy, not the range number: ABOVE and BELOW
//     share the wide 2, so a range-only check would arm the dig for ledges);
//   - the fall column must measure 1..2 air cells (dropAheadBelow's own
//     probe - the below class IS a 1-2 deep freed cell; 0 = a sealed floor,
//     3+ = the deep class the v0.182.0 fence already refuses to walk, and a
//     zero-read window reports the WORST (3) so blind probes never dig -
//     the v0.86.0 stale-window lesson);
//   - the column must read DRY (a fluid strike refuses - water counts as
//     empty to the bounding-box probe, so the wet read is its own guard);
//   - the drop must still sit inside the lip sphere (dy >= the deep fence).
// Every input must be MEASURED: a junk/missing read refuses the dig (a
// missing read never arms an action - the junk-dy-keeps-legacy doctrine,
// inverted for an actuator).
export const LIP_DIG_MAX_AIR = 2 // the fall the dig-under may buy (the below class is a 1-2 deep freed cell)

export function lipDigWanted ({ range, airBelow, fluidBelow, dy } = {}) {
  if (range !== DROP_GOAL_BELOW) return false
  if (!Number.isFinite(airBelow)) return false
  const a = Math.floor(airBelow)
  if (a < 1 || a > LIP_DIG_MAX_AIR) return false
  if (fluidBelow !== false) return false // an unmeasured wet guard is a blind dig (the v0.86.0 lesson)
  if (!Number.isFinite(dy)) return false
  // (v0.189.0) the family fence: ABOVE and BELOW share the wide range 2, so
  // the dig-under is fenced to the BELOW dy family itself - a drop AT/ABOVE
  // the walk plane never buys a dig-under (the v0.189.0 ledge arrivals park
  // the bot BESIDE an UP drop; opening the floor there is unmeasured waste).
  if (dy >= DROP_GOAL_BELOW_DY) return false
  if (dy < DROP_GOAL_DEEP_DY) return false
  return true
}

// (v0.206.0) THE LIP REFUSAL INSTRUMENT - the mirror of lipDigWanted that NAMES
// the guard that said no. Field record: lipDig=0 in every fleet row so far
// (run68 + the 13:30 row) while the below family kept failing - and the code
// anatomy says the gate CANNOT open for a standing bot: gotoSafe only ends on a
// standable cell (solid under the feet), so dropAheadBelow(feet) reads air 0 and
// the a < 1 guard refuses - the dig is structurally starved, not unlucky. But
// WHICH guard wins in the field (the sealed floor, the wet column, the plane
// arrival, or zero below-family convergences starving the block itself) is a
// MEASUREMENT question, and the v0.187.0 law holds: the next cure derives from
// measurement, not speculation. Returns the refusal REASON for a lip candidate,
// or null when the dig is wanted (or when this is not a lip candidate at all -
// a non-BELOW range never enters the lane, so it has no refusal to name). The
// reason strings are the refusal class names the fleet log will count.
export function lipDigRefusal ({ range, airBelow, fluidBelow, dy } = {}) {
  if (range !== DROP_GOAL_BELOW) return null
  if (!Number.isFinite(airBelow)) return 'unmeasured air'
  if (Math.floor(airBelow) < 1) return 'sealed floor'
  if (Math.floor(airBelow) > LIP_DIG_MAX_AIR) return 'the fall reads too deep'
  if (fluidBelow === true) return 'wet column'
  if (fluidBelow !== false) return 'unmeasured wet guard'
  if (!Number.isFinite(dy)) return 'unmeasured dy'
  if (dy >= DROP_GOAL_BELOW_DY) return 'arrival at the plane'
  if (dy < DROP_GOAL_DEEP_DY) return 'the lip sphere cannot reach'
  return null
}

// (v0.263.0) THE SUPPORT DIG-DOWN - the above-family FAILED walk's last mile,
// the lip dig-down MIRRORED UP. MEASURED (face 36359454749 attempt 2, the
// trio's second flight): the ledger read 'failed=94 (below x28, plane x30,
// above x36) lipDig=0' - the ABOVE family is the largest failing bucket, and
// the v0.189.0 wide goal did not save it: an above walk that times out buys
// ZERO (4s of spiral, the drop rides the despawn on its ledge) - the same
// guaranteed-loss shape the v0.182.0 deep skip named for the below family.
// The lip dig fires only on a CONVERGED below arrival, so a run where the
// below walks never converge (x28 failures) starves lipDig at exactly the
// link the dig-down exists to close - while the ABOVE failures pile up
// unconverted. THE CURE: when an ABOVE-family walk FAILS, dig the ONE solid
// block the DROP rests on (its support, the cell under the drop) - the drop
// falls 1-2 down its own column, passes the bot's plane, and the ~1.5 magnet
// sweeps it mid-fall or it lands at the bot's stance where the plane/below
// families converge on the NEXT pass (the v0.182.0 re-classify doctrine -
// either way strictly better than the ledge despawn). The dig never opens
// the bot's own footing: dy >= 1 pins the support at the bot's feet level or
// ABOVE (a drop resting on the bot's own floor reads dy < 1 - the plane
// class, the walk families' own cures own it). Every guard is a measured
// fence, never new physics:
//   - the drop must be in the MEASURED ledge class (dy 1..3 - the v0.189.0
//     failure sample held +1.0 x6 / +1.2 / +2.0 x3 / +2.1 with one +4.0
//     outlier; beyond the cap the fall lands unmeasured);
//   - the support must read a solid, non-fluid block (junk refuses);
//   - the fall column under the support must measure 1..2 air cells (the
//     LIP_DIG_MAX_AIR window mirrored up; 0 = sealed under the ledge, 3+ =
//     an open shaft the probe cannot see the bottom of - the landing is
//     unknown, a zero-read window reports the WORST, the v0.86.0 lesson);
//   - the column must read DRY (the same wet guard the lip rides);
//   - the bot must stand within SUPPORT_DIG_REACH of the fall column
//     (horizontal) - a far stance's shake drops the item where the magnet
//     never reaches, the exact buy-nothing the cure exists to end.
// Junk law: a missing read never arms a dig - the same inversion of the
// junk-dy-keeps-legacy doctrine the lip dig rode.
export const SUPPORT_DIG_MAX_AIR = 2 // the fall the support dig may buy (the lip window mirrored up)
export const SUPPORT_DIG_MIN_DY = 1 // the drop rests a full cell UP - the measured ledge class
export const SUPPORT_DIG_MAX_DY = 3 // the ledge cap - beyond it the fall lands unmeasured
export const SUPPORT_DIG_REACH = 2 // the horizontal stand-off the fall must pass inside the magnet

export function supportDigWanted ({ dy, supportSolid, airBelow, fluidBelow, distXZ } = {}) {
  if (!Number.isFinite(dy)) return false
  if (dy < SUPPORT_DIG_MIN_DY) return false
  if (dy > SUPPORT_DIG_MAX_DY) return false
  if (supportSolid !== true) return false
  if (!Number.isFinite(airBelow)) return false
  const a = Math.floor(airBelow)
  if (a < 1 || a > SUPPORT_DIG_MAX_AIR) return false
  if (fluidBelow !== false) return false // an unmeasured wet guard is a blind dig (the v0.86.0 lesson)
  if (!Number.isFinite(distXZ) || distXZ < 0 || distXZ > SUPPORT_DIG_REACH) return false
  return true
}

// (v0.263.0) THE SUPPORT REFUSAL INSTRUMENT - the mirror of supportDigWanted
// that NAMES the guard that said no. The support-read classes (no read / air /
// fluid) name themselves in the caller BEFORE this gate (the v0.259.0 cover
// shape) - a solid support falls through to here. Returns the refusal REASON
// for an above-family candidate, or null when the dig is wanted (or when this
// is not a support candidate at all - the family fence is the caller's dy
// check, so a sub-ledge dy has its refusal named here as 'below the ledge
// class' only when the caller still consults).
export function supportDigRefusal ({ dy, supportSolid, airBelow, fluidBelow, distXZ } = {}) {
  if (!Number.isFinite(dy)) return 'unmeasured dy'
  if (dy < SUPPORT_DIG_MIN_DY) return 'below the ledge class'
  if (dy > SUPPORT_DIG_MAX_DY) return 'the ledge reads too high'
  if (supportSolid !== true) return 'unmeasured support'
  if (!Number.isFinite(airBelow)) return 'unmeasured air'
  if (Math.floor(airBelow) < 1) return 'sealed under the ledge'
  if (Math.floor(airBelow) > SUPPORT_DIG_MAX_AIR) return 'the fall reads open'
  if (fluidBelow === true) return 'wet column'
  if (fluidBelow !== false) return 'unmeasured wet guard'
  if (!Number.isFinite(distXZ) || distXZ < 0) return 'unmeasured stand-off'
  if (distXZ > SUPPORT_DIG_REACH) return 'outside the stand-off'
  return null
}

// (v0.267.0) THE SEAL DEPTH READ - face 36369215771's census decoded the
// support dig-down's zero-firing: ALL 30 refusals read air=0 below the
// support - the SEALED POCKET is the world's dominant shape (15x sealed +
// 7x high-and-sealed + the dy 3.0/4.0 timeouts sealed too). The single-cell
// shake buys nothing there (the drop re-wedges one cell lower) and the fence
// refused every candidate HONESTLY. The cure's variant choice needs the
// seal's depth: a THIN seal (1-2 solid cells then air) converts with the
// deep shake (dig the support and the seal, the drop lands measured); a
// THICK one (3+ solid, the probe's cap) leaves only the ledge cut. This read
// instruments the class BEFORE any variant ships - the v0.259.0 cover-anchor
// cadence (telemetry -> decode -> cure).
//
/**
 * How deep is the seal under a support cell (pure, junk-honest)? Takes the
 * per-cell verdicts for the column BELOW the support (S-1..S-3, the probe's
 * cap): 'solid' | 'air' | 'fluid' | null. Returns the leading solid run
 * (1..cap) - the dig count the deep shake would need - or null when the face
 * itself is not solid (not a seal - the caller's class gate should have
 * refused earlier) or the first read is junk (a lost read claims no depth).
 * A junk cell DEEPER in the run stops the count honestly (a partial read is
 * a shallower measured seal, never a guessed one).
 * @param {Array<string|null>} cells the column verdicts, face first
 * @returns {number|null} 1..cells.length, or null
 */
export function sealedColumnDepth (cells) {
  if (!Array.isArray(cells) || cells.length === 0) return null
  let depth = 0
  for (const c of cells) {
    if (c === 'solid') { depth++; continue }
    break
  }
  return depth >= 1 ? depth : null
}

// (v0.273.0) THE SEAL REACH SPLIT - the histogram's first field read (face
// 36378053182: seal1=0 seal2=0 seal3=18) measured the sealed class, but the
// refusal order names the seal BEFORE the stand-off check, so the probe also
// counts candidates the dig can never own (the field's own row opened with
// 'air 0, dist 3.0, seal 3' - dist 3.0 is outside SUPPORT_DIG_REACH 2). The
// ledge-cut design brief needs the split: a NEAR seal is the dig family's
// candidate (the cut converts it); a FAR one needs a stance change first (a
// walk-adjacent cure, a different front). Pure, junk-honest: a non-finite or
// negative distance claims no bucket, a junk reach refuses the call - a lost
// read never arms a count.
/**
 * Which side of the support-dig stand-off does a sealed candidate sit on?
 * @param {number} distXZ the measured horizontal stand-off to the drop
 * @param {number} [reach] the dig family's reach cap (default SUPPORT_DIG_REACH)
 * @returns {'near'|'far'|null} null when any input is junk (never counted)
 */
export function sealReachBucket (distXZ, reach = SUPPORT_DIG_REACH) {
  if (!Number.isFinite(distXZ) || distXZ < 0) return null
  if (!Number.isFinite(reach) || reach < 0) return null
  return distXZ <= reach ? 'near' : 'far'
}

// (v0.277.0) THE CUT TARGET SPLIT - the near bucket's own divide. The reach
// split's first field read (face 36387892453: near=4 far=11) proved the
// ledge-cut brief STANDS - the near candidates EXIST - but the brief's next
// question is unanswered: WHICH near candidates does the cut own? A near
// THICK seal (depth >= 2) is the cut's target (the dig family stood off it,
// a stance change is the cure); a near THIN seal (depth 1) is the dig
// family's own missed candidate (its refusal reason is the anomaly to
// decode - the dig should have converted it without any cut). Pure,
// junk-honest: a far/junk distance claims no target (the reach split's
// law carried), a junk depth (null/0/non-integer) claims no target - a
// lost read never arms a count.
/**
 * Which cure does a NEAR sealed candidate demand?
 *
 * (v0.281.0) THE CUT REACH GAP - the split now mirrors the cut's OWN fence.
 * Face 36402553113's first histogram read 'near=3 far=10 cut=0 nthick=3
 * nthin=0' with ZERO 'ledge cut' lines: the split counted 3 cut targets and
 * the cut took none - the structural mismatch was the REACH: the split read
 * 'cut' at distXZ <= SUPPORT_DIG_REACH (2) while the cut's own fence
 * (ledgeCutWanted) refuses past LEDGE_CUT_REACH (1.5) - the lip dig's
 * measured magnet radius, not a tunable. Candidates in the 1.5-2.0 band
 * counted as targets and died silent. The divide is honest now: a thick
 * near seal INSIDE the cut's own radius reads 'cut' (the cut owns it), a
 * thick near seal in the gap band reads 'gap' (the stance side owns the
 * last half block - the candidate the far-front's stance change starts
 * from), the thin law unchanged. Junk cutReach refuses the call (a junk
 * config counts nothing - the honest refusal).
 *
 * @param {number} distXZ the measured horizontal stand-off to the drop
 * @param {number|null} sealDepth the measured seal depth (sealedColumnDepth's 1..3)
 * @param {number} [reach] the dig family's reach cap (default SUPPORT_DIG_REACH)
 * @param {number} [cutReach] the ledge cut's own fence (default LEDGE_CUT_REACH)
 * @returns {'cut'|'thin'|'gap'|null} 'cut' = inside the cut's own radius, 'gap' = thick but the cut's fence refuses, 'thin' = the dig family's missed candidate, null = junk or far (never counted)
 */
export function sealCutClass (distXZ, sealDepth, reach = SUPPORT_DIG_REACH, cutReach = LEDGE_CUT_REACH) {
  if (sealReachBucket(distXZ, reach) !== 'near') return null
  if (!Number.isInteger(sealDepth) || sealDepth < 1) return null
  if (sealDepth < 2) return 'thin'
  if (!Number.isFinite(cutReach) || cutReach < 0) return null
  return distXZ <= cutReach ? 'cut' : 'gap'
}

// (v0.260.0) THE ALREADY-THERE FAST PATH - the skip verdict that spares the
// funnel a zero-displacement instant done. MEASURED (face 36344554956, the
// v0.256.0-era fleet): the run's named drop-walk failures carried x16
// 'spin breaker: sweep drops re-issued 2x inside the 10s window after its
// own pf:done - sweep drops refused for 30s' against x22 honest timeouts -
// 29% of the named failures were the breaker, not the geometry - while the
// sweep ledger read failed=77 (above x44, below x21, plane x12) and the
// coal famine held (coal_ore dug, smelted=0, torches skipped 'no coal:
// coals 0'). THE ANATOMY: a vein's drops land in each other's goal spheres
// (the wide range-2 families overlap by construction; a flat range-1
// cluster is no better) - the FIRST walk approaches the cluster and lands
// with real displacement, and the NEXT targets' walks start from a stance
// ALREADY inside their goal's isEnd: the pathfinder completes instantly,
// the bot never moves, and the funnel books a fast not-displaced 'sweep
// drops' done - the exact fingerprint the v0.227.0 breaker was built to
// read as the run53 famine churn (two consecutive zero-displacement
// re-issues of the same label inside the 10s window open the 30s hold).
// The breaker's discriminator (displacement) cannot distinguish 'churn
// that arrived nowhere' from 'a cluster whose next drop is 1 block up' - a
// vein mined RICHLY is booked as a spin, the hold refuses the whole
// remaining cluster for 30s, and the drops ride the despawn: the harvest
// is punished exactly for succeeding. THE CURE: the walk is only issued
// when the bot stands OUTSIDE the goal's own arrival test (GoalNear.isEnd
// - the pathfinder's own verdict, the same arithmetic the funnel would
// have settled on): an already-satisfied goal skips to the landed path
// with zero funnel participation (no queue slot, no think window, no A*
// plan, no spin book entry), and the walks that DO issue now start outside
// their arrival test, so a landed walk displaces - the honest evidence the
// breaker's discriminator wants - and the holds never open. Junk
// discipline: a missing/unreadable isEnd, a junk position, or a
// truthy-but-not-true verdict NEVER skips a walk - the legacy issue byte
// for byte (a missing read never skips an action). The skip is honest
// work, not a failure: the bot is inside the arrival test, the ~1.5
// pickup magnet is the last mile the walk would not have shortened, and
// the v0.187.0 lip dig-down still reads the dy family on the landed path.
export function dropWalkSkipped (isEnd, pos) {
  if (typeof isEnd !== 'function') return false
  if (!pos || typeof pos !== 'object') return false
  if (typeof pos.x !== 'number' || typeof pos.y !== 'number' || typeof pos.z !== 'number') return false
  if (!Number.isFinite(pos.x) || !Number.isFinite(pos.y) || !Number.isFinite(pos.z)) return false
  try { return isEnd(pos) === true } catch { return false }
}

export function dropTargets (entities, from, { maxDistance = SWEEP_DROP_REACH, cap = SWEEP_DROP_CAP } = {}) {
  if (!entities || typeof entities !== 'object') return []
  if (!from || typeof from.x !== 'number' || typeof from.y !== 'number' || typeof from.z !== 'number') return []
  if (!Number.isFinite(from.x) || !Number.isFinite(from.y) || !Number.isFinite(from.z)) return []
  const list = Array.isArray(entities) ? entities : Object.values(entities)
  const out = []
  for (const e of list) {
    if (!e || typeof e !== 'object') continue
    if (e.name !== 'item') continue
    const p = e.position
    if (!p || typeof p.x !== 'number' || typeof p.y !== 'number' || typeof p.z !== 'number') continue
    const dx = p.x - from.x
    const dy = p.y - from.y
    const dz = p.z - from.z
    if (!Number.isFinite(dx) || !Number.isFinite(dy) || !Number.isFinite(dz)) continue
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
    if (!Number.isFinite(dist) || dist > maxDistance) continue
    out.push({ x: p.x, y: p.y, z: p.z, dist })
  }
  out.sort((a, b) => a.dist - b.dist)
  const n = Number.isFinite(cap) && cap > 0 ? Math.min(Math.floor(cap), out.length) : out.length
  const picked = []
  for (let i = 0; i < n; i++) picked.push({ x: out[i].x, y: out[i].y, z: out[i].z })
  return picked
}

// (v0.203.0) THE SWEEP DROP LEDGER - the run-level row the sweep never had.
//
// WHY: the sweep's drop-walk counters (belowFails / skipDeep / lipDigs /
// dropFails / picked) lived and died as per-sweep log lines - the fleet
// RESULT had no aggregation, so the below-plane residue ('the drop rests
// deeper than the lip') had NO day-scale trend to read and the v0.187.0
// open question ('the failure family is UNMEASURED - the next decode splits
// the class') stayed open: the failed walks split into the below class (the
// v0.178.0 wide-goal residue) and the PLANE class (flat walks that failed
// for unknown reasons - water holes, sealed cells, goal brakes), and only
// their SUM was ever printed, capped at 2 named events per sweep.
//
// The ledger is pure and junk-safe: every counter floors at zero (a torn
// stats never invents walks), the triage split keeps the identity
// below + plane + above == failed, and the row prints ALWAYS (the 05:00 ledger-skip
// lesson - an absent line class is indistinguishable from a filter blind
// spot). Zero behavior change: the walks walk exactly as before - the
// ledger only makes the economics readable at the run level, which is the
// measurement the next cure derives from (the v0.187.0 stance).
//
// (v0.205.0) THE LEDGER TRIAGE - the wide-2 family splits by the dy sign.
// run68 (fleet 36221189568, the row's day 2) exposed the pollution:
// DROP_GOAL_ABOVE and DROP_GOAL_BELOW are the SAME NUMBER (both the wide
// range 2), so the miner's `range === DROP_GOAL_BELOW` failure gate counted
// the ABOVE-family timeouts into the below bucket - the row claimed
// 'below x82' while its own dy instrument's printed sample read ABOVE-heavy
// (dy +1.0..+3.0 timeouts x19 vs below x5). The 13:30 lane's 'below x74 vs
// plane x11 - the plane >> below hypothesis REFUTED' read the polluted
// bucket. The miner now splits the family at the failure site (the walk's
// own dy sign: negative = the below family, positive = the above family; no
// range-2 walk can sit between -0.5 and 0 - that is the PLANE fence's land),
// and the row carries the third term. The wire shape survives: the 'below x'
// and 'plane x' tokens keep their positions, the identity extends.

/** One bot's accumulated sweep drop-walk counters (junk floors at zero). */
export function sweepDropRecord ({ sweeps = 0, picked = 0, failed = 0, below = 0, above = 0, deepSkip = 0, lipDig = 0, supportDig = 0, seal1 = 0, seal2 = 0, seal3 = 0, sealNear = 0, sealFar = 0, ledgeCut = 0, sealCutTargets = 0, sealNearThin = 0, sealCutGap = 0, stanceStep = 0, stanceCut = 0 } = {}) {
  const fl = v => (Number.isFinite(v) && v > 0) ? Math.floor(v) : 0
  return {
    sweeps: fl(sweeps),
    picked: fl(picked),
    failed: fl(failed),
    below: fl(below),
    above: fl(above),
    deepSkip: fl(deepSkip),
    lipDig: fl(lipDig),
    // (v0.263.0) the support dig-down joins the row - a new tail token, the
    // v0.205.0 precedent (the existing tokens keep their positions, the
    // identity extends)
    supportDig: fl(supportDig),
    // (v0.267.0) THE SEAL DEPTH HISTOGRAM joins the row - the sealed pocket's
    // measured depth split (the decode lead for the deep-shake variant: a thin
    // seal converts, a thick one needs the ledge cut)
    seal1: fl(seal1),
    seal2: fl(seal2),
    seal3: fl(seal3),
    // (v0.273.0) THE SEAL REACH SPLIT joins the row - the histogram's own
    // field read proved the class all-thick, the stand-off split now tells
    // the ledge-cut brief WHICH seals the dig family can even own (near) vs
    // the ones a stance change owns first (far)
    sealNear: fl(sealNear),
    sealFar: fl(sealFar),
    // (v0.275.0) THE LEDGE CUT joins the row - the sealed class's first
    // conversions (the near bucket's behavior cure: the seal column's top
    // dy-1 cells + the support, the drop lands on the bot's own layer)
    ledgeCut: fl(ledgeCut),
    // (v0.277.0) THE CUT TARGET SPLIT joins the row - the near bucket's own
    // divide: nthick = the near THICK seals (the ledge cut's targets),
    // nthin = the dig family's own missed near-thin candidates (the
    // anomaly the decode needs)
    sealCutTargets: fl(sealCutTargets),
    sealNearThin: fl(sealNearThin),
    // (v0.281.0) THE CUT REACH GAP joins the row - the thick near seals the
    // cut's own 1.5 fence refuses (the 1.5-2.0 band the first histogram
    // exposed: nthick=3 cut=0 with zero attempt lines); the stance side
    // owns the last half block, the row keeps the class visible
    sealCutGap: fl(sealCutGap),
    // (v0.283.0) THE STANCE STEP joins the row - the gap band's behavior
    // cure: stanceStep = the reposition walks taken (the cure's own census),
    // stanceCut = the cuts the step bought (the conversions - the band's
    // first field proof). The gap and the step COMPOSE: ngap counts the
    // candidates, step/stepcut count the answer
    stanceStep: fl(stanceStep),
    stanceCut: fl(stanceCut)
  }
}

/**
 * The fleet-result row: the run's whole sweep drop-walk economy in one line.
 * @param {Array<object|null|undefined>} records one stats.sweepDrops per bot (junk tolerated)
 * @returns {string} 'sweep drop ledger: sweeps=N picked=Nu failed=N (below xN, plane xN, above xN) deepSkip=N lipDig=N supportDig=N seal1=N seal2=N seal3=N near=N far=N cut=N nthick=N nthin=N ngap=N step=N stepcut=N'
 */
export function belowResidueRow (records) {
  const list = Array.isArray(records) ? records : []
  const acc = { sweeps: 0, picked: 0, failed: 0, below: 0, above: 0, deepSkip: 0, lipDig: 0, supportDig: 0, seal1: 0, seal2: 0, seal3: 0, sealNear: 0, sealFar: 0, ledgeCut: 0, sealCutTargets: 0, sealNearThin: 0, sealCutGap: 0, stanceStep: 0, stanceCut: 0 }
  for (const r of list) {
    const rec = sweepDropRecord(r ?? {})
    // per-record clamp: one bot's junk below/above never swallows the fleet's
    // real split - below claims its floor of failed first, above claims the
    // rest, the remainder is the plane class (the identity holds by design)
    if (rec.below > rec.failed) rec.below = rec.failed
    if (rec.above > rec.failed - rec.below) rec.above = Math.max(0, rec.failed - rec.below)
    acc.sweeps += rec.sweeps
    acc.picked += rec.picked
    acc.failed += rec.failed
    acc.below += rec.below
    acc.above += rec.above
    acc.deepSkip += rec.deepSkip
    acc.lipDig += rec.lipDig
    acc.supportDig += rec.supportDig
    acc.seal1 += rec.seal1
    acc.seal2 += rec.seal2
    acc.seal3 += rec.seal3
    acc.sealNear += rec.sealNear
    acc.sealFar += rec.sealFar
    acc.ledgeCut += rec.ledgeCut
    acc.sealCutTargets += rec.sealCutTargets
    acc.sealNearThin += rec.sealNearThin
    acc.sealCutGap += rec.sealCutGap
    acc.stanceStep += rec.stanceStep
    acc.stanceCut += rec.stanceCut
  }
  const plane = Math.max(0, acc.failed - acc.below - acc.above)
  return `sweep drop ledger: sweeps=${acc.sweeps} picked=${acc.picked}u failed=${acc.failed} (below x${acc.below}, plane x${plane}, above x${acc.above}) deepSkip=${acc.deepSkip} lipDig=${acc.lipDig} supportDig=${acc.supportDig} seal1=${acc.seal1} seal2=${acc.seal2} seal3=${acc.seal3} near=${acc.sealNear} far=${acc.sealFar} cut=${acc.ledgeCut} nthick=${acc.sealCutTargets} nthin=${acc.sealNearThin} ngap=${acc.sealCutGap} step=${acc.stanceStep} stepcut=${acc.stanceCut}`
}

// (v0.275.0) THE LEDGE CUT - the sealed class's first behavior cure. The
// split's first field read (face 36387892453: near=4 far=11) proved the
// NEAR bucket is real: sealed drops the bot legally stands beside, which
// every dig variant so far refused HONESTLY (the v0.263.0 fence needs an
// air column to shake into; the seal has none). THE CUT'S ARITHMETIC: dig
// the seal column's TOP dy-1 cells (S-1..S-(dy-1)), then the support - the
// drop falls the cut column and lands ON THE BOT'S OWN LAYER (y = bot.y
// exactly), where the pickup magnet owns it. THE FENCE, every guard a
// measured law:
//   - dy stays the ledge class (SUPPORT_DIG_MIN_DY..SUPPORT_DIG_MAX_DY):
//     the cut is an above-family cure, nothing else;
//   - sealDepth >= dy: the column's floor S-dy must read SOLID or the drop
//     falls past the cut into an unmeasured depth (the v0.86.0 lesson - a
//     zero-read window reports the WORST); a thin seal under a high ledge
//     is refused honestly (the landing is unmeasured);
//   - fluidBelow === false: the same dry guard every dig family rides (a
//     wet cut drains the drop into fluid - the reachability dies there);
//   - distXZ <= LEDGE_CUT_REACH (1.5, INSIDE the v0.263.0 stand-off): the
//     lip dig's own field lesson (fleet 36181152847) measured the range-2
//     arrival OUTSIDE the magnet - the cut's landing is level, so its 3D
//     distance is exactly distXZ, and 1.5 is the honest magnet radius.
// Junk law: a lost read never arms a cut (a finite-only gate) - the refusal
// classes keep their telemetry, the cut only ever ADDS conversions.
export const LEDGE_CUT_REACH = 1.5

/**
 * Should the sealed support become a ledge cut (pure, junk-honest)? Returns
 * the dig count (dy - 1: the seal cells to dig BEFORE the support shake) or
 * null when any guard refuses. A null is an honest refusal - the caller's
 * telemetry keeps the class visible either way.
 * @param {object} [p]
 * @param {number} [p.dy] the drop's height over the bot (the ledge class 1..3)
 * @param {number} [p.distXZ] the horizontal stand-off to the fall column
 * @param {number|null} [p.sealDepth] the v0.267.0 probe's read (1..3, null = no read)
 * @param {boolean} [p.fluidBelow] the wet guard read (true/undefined refuses)
 * @param {number} [p.reach] the stand-off cap (injected for the tests)
 * @returns {number|null} the seal-cell dig count (0 when dy === 1), or null
 */
export function ledgeCutWanted ({ dy, distXZ, sealDepth, fluidBelow, reach = LEDGE_CUT_REACH } = {}) {
  if (!Number.isFinite(dy) || dy < SUPPORT_DIG_MIN_DY || dy > SUPPORT_DIG_MAX_DY) return null
  if (!Number.isFinite(sealDepth) || sealDepth < dy) return null
  if (fluidBelow !== false) return null
  if (!Number.isFinite(distXZ) || distXZ < 0 || distXZ > reach) return null
  return dy - 1
}

// (v0.280.0) THE CUT REFUSAL NAME - the refusal form of the four-canonical-forms
// law. Face 36402553113 read nthick=3 + cut=0 with ZERO 'ledge cut' lines: the
// probe counted the near-thick candidates, the cut's fences refused them, and
// the tree could not say WHY - the decode died between the two counters (the
// probe's near bucket rides SUPPORT_DIG_REACH 2 while the cut's own magnet cap
// is LEDGE_CUT_REACH 1.5, so a 1.5-2.0 stand-off reads 'cut' at the probe and
// refuses at the cut - the likeliest silent class on the face). Mirrors
// ledgeCutWanted's fence ORDER - the same gate, the name of the FIRST fence
// that fires; null = the cut would arm (not a refusal - the caller only asks
// after a null cut). Pure, junk-honest: a junk read names its fence, never
// arms a cut.
/**
 * Why did the sealed support refuse the ledge cut? (pure, junk-honest)
 * @param {object} [p] ledgeCutWanted's own parameter shape
 * @returns {string|null} the refusing fence's name, or null when the cut would arm
 */
export function ledgeCutRefusal ({ dy, distXZ, sealDepth, fluidBelow, reach = LEDGE_CUT_REACH } = {}) {
  if (!Number.isFinite(dy) || dy < SUPPORT_DIG_MIN_DY || dy > SUPPORT_DIG_MAX_DY) return 'the dy reads out of class'
  if (!Number.isFinite(sealDepth) || sealDepth < dy) return 'the seal floor reads unmeasured'
  if (fluidBelow !== false) return 'the column reads wet'
  if (!Number.isFinite(distXZ) || distXZ < 0 || distXZ > reach) return 'the stand-off exceeds the magnet'
  return null
}

// (v0.283.0) THE STANCE STEP - the gap band's first behavior cure. Face
// 36411203362's refusal census read the stand-off fence 4/4 (zero other
// fence names): the 1.5-2.0 band IS the cut=0 mystery's field shape, and
// the 0.281.0 brief named the cure - a stance change, NOT a wider magnet
// (the magnet law stands). The atomic step: the minimum WHOLE blocks to
// walk toward the fall column so the stand-off re-enters the magnet (the
// whole 1.5-2.5 band reads 1 - the field's candidates sat at 1.8-2.0).
// Junk-honest: a lost read steps nothing; a stance already inside the
// magnet steps nothing (null = the cut arms, or the refusal belongs to a
// fence no walk can cure - the dy class, the unmeasured floor, the wet
// column). @param {number} distXZ the horizontal stand-off to the column
// @param {number} [reach] the cut's own magnet cap (injected for the tests)
// @returns {number|null} the whole-block step count, or null
export function stanceStepBlocks (distXZ, reach = LEDGE_CUT_REACH) {
  if (!Number.isFinite(distXZ) || distXZ < 0) return null
  if (distXZ <= reach) return null
  return Math.ceil(distXZ - reach)
}
