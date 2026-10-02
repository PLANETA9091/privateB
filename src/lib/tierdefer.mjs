// (v0.463.0) THE TIER DEFER CENSUS - the tool ladder's own voice counted.
// The v0.252.0 tier-defer steer prints one verdict line per NEW deferred
// name per trip: '<bot> steer tier defer: iron_ore, copper_ore deferred -
// the pick cannot harvest the drops (the tail keeps the option, the
// upgrade rung restores the lead)'. The line is quantity-bearing (the
// deferred resource names) and nobody read it - the steer's own words
// priced the ladder's blind spot every face while the decode stayed
// blind to them (face 38: 14 lines, the wettest defer face; face 41: 5).
// One parser per emitter: TIER_DEFER_RE owns exactly that shape; the
// resource list is the join of the fresh names (split, trim, skip
// empties). Junk-safe: non-lines skipped, non-array -> null (the
// census judges nothing it was not handed). Pure: reads, never mutates.
export const TIER_DEFER_RE = /^(F\d+) steer tier defer: (.+) deferred - the pick cannot harvest the drops/i

// tierDeferCensus(lines) -> { defers, perBot, byResource } | null
//   defers     total 'steer tier defer' line count
//   perBot     { F9: 2, ... } - the deferring bots (the wooden picks' owners)
//   byResource { iron_ore: 5, copper_ore: 5, ... } - WHAT the picks could
//              not harvest (the upgrade rung's own work list)
export function tierDeferCensus (lines) {
  if (!Array.isArray(lines)) return null
  const perBot = {}
  const byResource = {}
  let defers = 0
  for (const line of lines) {
    if (typeof line !== 'string') continue
    const m = TIER_DEFER_RE.exec(line)
    if (!m) continue
    defers++
    perBot[m[1]] = (perBot[m[1]] || 0) + 1
    for (const res of m[2].split(',').map(s => s.trim()).filter(Boolean)) {
      byResource[res] = (byResource[res] || 0) + 1
    }
  }
  return { defers, perBot, byResource }
}
