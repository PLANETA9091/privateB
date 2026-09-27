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
//   - priorities (v0.81.0): an ordered array of ore names, earlier = more plan-
//     urgent. THE IRON PRIORITY: distance-only election lets 660 known coal
//     records out-elect 98 iron records forever (run75: 12 iron steers yielded
//     ONE iron_ore while the plan starved for it) - the plan's deficit order
//     (materialplan.oreSteerOrder) must beat raw distance. Election becomes
//     (tier, dist, name): a known iron vein within reach beats ANY nearer coal.
//     null/absent keeps the legacy distance-only shape (backward compatibility).
//   - hazardNear (v0.253.0): (pos) -> hazard record|null - the shared HazardLedger's
//     `near` reader. THE KILLING BAND: run36335496659 measured 15/15 deaths in one
//     strip (z 384..426) while the ledger held 24 live fleet-wide death spots - the
//     flee/dig/wet-trip sides all honor the ledger, the APPROACH side walked bots
//     deficit-first INTO the band (F13 drowned on its 5th relog there). The cure:
//     a candidate inside the band loses to EVERY clean candidate (a death is a
//     cost class the deficit cannot repay) - but is NOT excluded: when no clean
//     candidate exists the best near-hazard one still elects (the tail keeps the
//     option; the ledger's TTL decays the danger). The band ranks above the tier
//     law; the geometry gates (yBand/cross/reach/skip) still own the filter first -
//     a cell the geometry refused never reads the ledger. A throwing/junk reader
//     reads NO gate (the read must never break the election).
export function pickOreTarget (opts = {}) {
  // (v0.81.0) the BODY guard, not a destructuring default: pickOreTarget(null)
  // would throw on the destructure itself (the Number(null) lesson, fourth strike)
  const { candidates, from, reach = 48, yBand = 8, crossTolerance = 4, skip = null, priorities = null, hazardNear = null } = opts || {}
  if (!Array.isArray(candidates) || !from || typeof from.x !== 'number') return null
  // (v0.253.0) the hazard reader: junk-safe by contract - a throw or a broken
  // reader reads NO gate (false), the ledger's `near` returns the record or null.
  const hzOf = p => {
    if (typeof hazardNear !== 'function') return false
    try { return hazardNear({ x: Math.round(p.x), y: Math.round(p.y), z: Math.round(p.z) }) != null } catch { return false }
  }
  const tierOf = Array.isArray(priorities)
    ? name => { const i = priorities.indexOf(name); return i === -1 ? Infinity : i }
    : () => 0
  // (v0.253.0) the two-band election: clean candidates and near-hazard candidates
  // rank separately, the clean band always leads, the tier/dist/name law stands
  // INSIDE each band. hzHeld carries the best displaced near-hazard candidate
  // (the decode reads the defer's cost directly); the tail elect carries hz:true.
  const hzBetter = (a, b) => {
    const ta = tierOf(a.name)
    const tb = tierOf(b.name)
    return ta < tb || (ta === tb && (a.dist < b.dist || (a.dist === b.dist && a.name < b.name)))
  }
  let bestClean = null
  let bestHz = null
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
    if (hzOf(p)) { if (!bestHz || hzBetter(cand, bestHz)) bestHz = cand }
    else if (!bestClean || hzBetter(cand, bestClean)) bestClean = cand
  }
  const best = bestClean ?? bestHz
  if (!best) return null
  return bestClean && bestHz
    ? { ...best, hz: false, hzHeld: { name: bestHz.name, pos: bestHz.pos, dist: bestHz.dist } }
    : { ...best, hz: !bestClean, hzHeld: null }
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
