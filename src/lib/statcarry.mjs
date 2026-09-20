// Per-bot stat survival across reconnects (v0.18.9).
//
// WHY: fleet19's runBot loop recreates the miner on every reconnect (a kick or
// an ECONNRESET ends the old bot object), and the fresh miner starts with ZERO
// counters. The reporter reads miner.stats directly, so every server-tick storm
// REWROTE HISTORY: fleet #129 (f75042c) showed mined 854 -> 620 -> 120 across
// two storms and reported 0.26 blocks/s for a run whose real pace before the
// first storm was 3.6 b/s. Diagnosing sessions kept reading the final number
// and burning time on a production crash that never happened.
//
// The fix is a per-bot CARRY: when an attempt ends, snapshot the counters that
// accumulated so far; when the next miner is created, seed those counters back
// in. Only MONOTONE counters travel (see CARRY_FIELDS - shaftEntryY is a
// coordinate and startedAt is a timestamp; neither may be summed) plus the
// byName mined-block histogram, merged additively.
export const CARRY_FIELDS = [
  'mined', 'failed', 'skipped', 'flyFails', 'hookCalls', 'hookFails',
  'mapTrips', 'mapRecords', 'planted', 'torched', 'fights', 'climbs',
  'shelters', 'rescues', 'airGlitches', 'claims', 'deaths'
]

/**
 * Absolute snapshot of the carry-able counters of `stats` (the miner's live
 * object, already seeded from the previous carry): returns a plain
 * { field: number, byName: { block: number } } or {} when there is nothing.
 * Pure: reads, never mutates.
 */
export function snapshotStats (stats) {
  if (!stats || typeof stats !== 'object') return {}
  const out = {}
  for (const f of CARRY_FIELDS) {
    const v = stats[f]
    if (Number.isFinite(v) && v > 0) out[f] = v
  }
  const byName = stats.byName
  if (byName && typeof byName === 'object') {
    const merged = {}
    for (const [k, v] of Object.entries(byName)) {
      if (Number.isFinite(v) && v > 0) merged[k] = v
    }
    if (Object.keys(merged).length) out.byName = merged
  }
  return out
}

/**
 * Seed `stats` (a fresh miner's counters) with the previous carry. MUTATES
 * stats in place and returns it. Idempotent-safe by construction: the caller
 * seeds a NEW miner exactly once, then snapshots that miner's totals at
 * attempt end (seed-then-snapshot, never merge-into-merged twice).
 */
export function seedStats (stats, carry) {
  if (!stats || typeof stats !== 'object') return stats
  if (!carry || typeof carry !== 'object') return stats
  for (const f of CARRY_FIELDS) {
    const v = carry[f]
    if (Number.isFinite(v) && v > 0) stats[f] = (stats[f] ?? 0) + v
  }
  const byName = carry.byName
  if (byName && typeof byName === 'object') {
    stats.byName = stats.byName ?? {}
    for (const [k, v] of Object.entries(byName)) {
      if (Number.isFinite(v) && v > 0) stats.byName[k] = (stats.byName[k] ?? 0) + v
    }
  }
  return stats
}
