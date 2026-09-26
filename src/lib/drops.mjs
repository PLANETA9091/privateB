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
// stats never invents walks), the below/plane split keeps the identity
// below + plane == failed, and the row prints ALWAYS (the 05:00 ledger-skip
// lesson - an absent line class is indistinguishable from a filter blind
// spot). Zero behavior change: the walks walk exactly as before - the
// ledger only makes the economics readable at the run level, which is the
// measurement the next cure derives from (the v0.187.0 stance).

/** One bot's accumulated sweep drop-walk counters (junk floors at zero). */
export function sweepDropRecord ({ sweeps = 0, picked = 0, failed = 0, below = 0, deepSkip = 0, lipDig = 0 } = {}) {
  const fl = v => (Number.isFinite(v) && v > 0) ? Math.floor(v) : 0
  return {
    sweeps: fl(sweeps),
    picked: fl(picked),
    failed: fl(failed),
    below: fl(below),
    deepSkip: fl(deepSkip),
    lipDig: fl(lipDig)
  }
}

/**
 * The fleet-result row: the run's whole sweep drop-walk economy in one line.
 * @param {Array<object|null|undefined>} records one stats.sweepDrops per bot (junk tolerated)
 * @returns {string} 'sweep drop ledger: sweeps=N picked=Nu failed=N (below xN, plane xN) deepSkip=N lipDig=N'
 */
export function belowResidueRow (records) {
  const list = Array.isArray(records) ? records : []
  const acc = { sweeps: 0, picked: 0, failed: 0, below: 0, deepSkip: 0, lipDig: 0 }
  for (const r of list) {
    const rec = sweepDropRecord(r ?? {})
    if (rec.below > rec.failed) rec.below = rec.failed // per-record clamp: one bot's junk below never swallows the fleet's real below/plane split
    acc.sweeps += rec.sweeps
    acc.picked += rec.picked
    acc.failed += rec.failed
    acc.below += rec.below
    acc.deepSkip += rec.deepSkip
    acc.lipDig += rec.lipDig
  }
  const plane = acc.failed - acc.below
  return `sweep drop ledger: sweeps=${acc.sweeps} picked=${acc.picked}u failed=${acc.failed} (below x${acc.below}, plane x${plane}) deepSkip=${acc.deepSkip} lipDig=${acc.lipDig}`
}
