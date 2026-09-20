// Ore-steered branch mining (v0.18.8): aim the tunnel at KNOWN ore instead of a
// blind rotation. Why this exists - fleet #128 mined iron_ore=2 in 600s while the
// shared map held 84..126 iron_ore positions (coal_ore=575): the branch-mine
// phase picks its gallery direction by rotating through E/S/W/N with a shaft
// counter, so 19 bots tunnel PAST veins the fleet already knows about. mapTrip
// cannot deliver underground ore (it walks - gotoSafe to a sealed ore cell fails
// 'unreachable' and blacklists the position), so the tunnel is the only tool
// that can reach it: the bot is already at the ore's Y band, it just has to dig
// TOWARD the record instead of a random cardinal.
//
// Geometry contract (pure, unit-testable):
//   - candidates arrive as [{ name, pos }] - the caller asks WorldMap.nearest for
//     each ore name (one nearest per name keeps the lookup cheap).
//   - yBand: the bot mines a HORIZONTAL gallery - a vein 20 levels up is another
//     shaft's business, not this tunnel's.
//   - crossTolerance: tunnel() only walks straight cardinal lines (a diagonal
//     1x2 gallery wedges the bot between the two solid corner cells - physics,
//     not pathfinding), so the steer keeps the DOMINANT axis and only accepts
//     targets whose cross-axis offset is small enough for the vein cluster
//     (3-8 blocks wide) to still touch the tunnel line.
//   - skip: positions this bot already failed to reach (bounded set, the caller's
//     failedTrips discipline) - never steer at the same wall twice.
export function pickOreTarget ({ candidates, from, reach = 48, yBand = 8, crossTolerance = 4, skip = null } = {}) {
  if (!Array.isArray(candidates) || !from || typeof from.x !== 'number') return null
  let best = null
  for (const c of candidates) {
    const p = c?.pos
    if (!p || typeof p.x !== 'number' || typeof p.y !== 'number' || typeof p.z !== 'number') continue
    if (skip && skip.has(`${p.x},${p.y},${p.z}`)) continue
    const dy = p.y - from.y
    if (Math.abs(dy) > yBand) continue
    const dx = p.x - from.x
    const dz = p.z - from.z
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
    if (dist > reach || dist < 2) continue // already inside the vein: mine, do not navigate
    // dominant axis decides the tunnel line; the cross offset must stay small
    // enough for the vein to reach it (records are single cells, veins are not)
    const horiz = Math.abs(dx) >= Math.abs(dz)
    const cross = horiz ? Math.abs(dz) : Math.abs(dx)
    if (cross > crossTolerance) continue
    const cand = { name: c.name ?? 'ore', pos: p, dist: Math.round(dist * 10) / 10, axis: horiz ? 'x' : 'z', dir: horiz ? Math.sign(dx) : Math.sign(dz), cross }
    if (!best || cand.dist < best.dist || (cand.dist === best.dist && cand.name < best.name)) best = cand
  }
  return best
}

/** Bounded skip-set discipline, identical to miner.mjs's failedTrips: drop the
 * OLDEST half when it overflows so a world of drift cannot poison steering forever. */
export function rememberSkip (set, key, { cap = 32 } = {}) {
  if (!set || typeof set.add !== 'function') return
  set.add(key)
  if (set.size > cap) {
    for (const k of [...set].slice(0, Math.ceil(cap / 2))) set.delete(k)
  }
}
