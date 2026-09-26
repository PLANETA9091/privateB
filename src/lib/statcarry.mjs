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
  'mapTrips', 'mapRecords', 'banked', 'planted', 'torched', 'fights',
  'climbs', 'shelters', 'rescues', 'airGlitches', 'claims', 'deaths'
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

/**
 * The FLEET RESULT's sentry attribution row (v0.195.0).
 *
 * WHY: run190 (fleet 36195869446) counted airGlitches=383 fleet-wide while the
 * fleet log carried 16 'air-bar glitch' lines - ALL F7's; 9 of 19 bots never
 * printed a single 'water:' line, and ~40 of the 383 were attributable to NO
 * bot at all (the counter is summed across carries and reconnections, the
 * rate-limited log line is per-instance). Three decode lanes burned on the
 * same question - WHICH bot holds the counter - before this row existed. The
 * report JSON's perBot carried the fields all along, but the mined surface is
 * the LOG artifact, not the JSON: the row lands the per-bot truth in the log
 * itself, next to the fleet-wide counter it attributes.
 *
 * SHAPE: one line, ALWAYS printed (the 05:00 ledger-skip lesson: an absent
 * line class is indistinguishable from a filter blind spot, so an all-zero
 * fleet prints 'all N g0/r0' instead of silence):
 *   sentry per-bot: F7 g343/r8 F16 g12/r0 | 17 g0/r0
 * g = airGlitches (the sensor-anomaly counter), r = rescues (the rescue
 * counter) - both ride the water sentry and both have burned decodes
 * (run190's blind spot #2; the rescues-56 causes class), one row covers both.
 * Bots with either counter non-zero are named in fleet order; the rest
 * collapse into the trailing silent count.
 *
 * JUNK-SAFE: a missing/junk bot entry, a missing stats object, or a
 * NaN/negative counter reads g0/r0 (the silent class) - garbage never renders
 * as NaN, never widens the row, never throws. A missing name renders '?'
 * (the bot's slot is still counted). Pure: reads, never mutates.
 */
export function sentryAttributionRow (bots = []) {
  const named = []
  let silent = 0
  for (const b of (Array.isArray(bots) ? bots : [])) {
    const s = b && typeof b === 'object' ? b.stats : null
    const g = s && Number.isFinite(s.airGlitches) && s.airGlitches > 0 ? Math.floor(s.airGlitches) : 0
    const r = s && Number.isFinite(s.rescues) && s.rescues > 0 ? Math.floor(s.rescues) : 0
    if (g > 0 || r > 0) named.push(`${b.name ?? '?'} g${g}/r${r}`)
    else silent++
  }
  if (!named.length) return `sentry per-bot: all ${silent} g0/r0`
  return `sentry per-bot: ${named.join(' ')} | ${silent} g0/r0`
}
