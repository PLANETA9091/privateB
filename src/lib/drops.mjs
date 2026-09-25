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
// magnet, and the above-plane ledge class is not measured yet (the wide
// goal would end the walk farther from the drop for no measured gain).
// Junk input = the legacy 1 - a missing read never widens a goal.
export const DROP_GOAL_PLANE = 1 // the legacy tight goal (the walk INTO the magnet)
export const DROP_GOAL_BELOW = 2 // the below-plane goal (the lip counts as arrival)
export const DROP_GOAL_BELOW_DY = -1 // the plane fence: strictly below the walk plane

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
  return d < DROP_GOAL_BELOW_DY ? DROP_GOAL_BELOW : DROP_GOAL_PLANE
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
