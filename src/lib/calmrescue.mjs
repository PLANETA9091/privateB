//
// calmrescue.mjs - THE CALM PARADOX (v0.701.0)
//
// The 33rd flight (37461703252) is the lens era's first ZERO-DEATH face
// ('death causes: none', combat 0 lines, hound presence 0) - and its
// rescue lane churned at FULL speed: 35 drowning-rescue starts (F12=9
// the top seat), 22 released, 1 timeout orphan, 4 frozen physics
// standdowns. The water lane's cost is DEATH-INDEPENDENT: the churn
// rides the frozen dives and the wet strands, not the death clock -
// the 14-era face read '53 rescue starts / 27 completed' on a calm
// face too (the rescue-ledger's own header). No row ever named the
// paradox: every face's rescue read sat beside a death row that
// seemed to explain it.
//
// calmRescueParadox(lines) joins the death census's total (deathkinds)
// to the rescue ledger's per-bot starts (rescue-ledger) - zero new
// regexes, the one-parser law by reuse:
//   deaths > 0  -> no paradox (the churn has its explainers - the
//                  honest silence, never a fake verdict)
//   starts < CALM_RESCUE_FLOOR -> no paradox (the calm face's quiet
//                  lane stays data - a stranded bot's 2-3 starts is
//                  not churn)
//   else        -> the paradox: {starts, top, spenders, ends} - the
//                  water lane runs on its own clock.
// Junk-safe null on non-input. Pure: reads, never mutates. Zero fleet
// wiring (mining-surface only, the v0.379/.../v0.700.0 precedent).
//

import { rescueLedger } from './rescue-ledger.mjs'
import { deathKindCensus } from './deathkinds.mjs'
import { sealDeathCensus } from './sealdeath.mjs'

// THE PARADOX'S BAR - sustained churn, not a single strand: ten starts
// is the lane running its own program (the 33rd's 35, the 14-era's 53);
// below the bar the calm face's quiet lane stays data.
export const CALM_RESCUE_FLOOR = 10

/**
 * calmRescueParadox(lines) - the death-free face's full-speed water
 * lane: the churn the death clock never metered.
 *
 * @param {string[]|string} [lines] the face log (array or raw blob)
 * @returns {null|{deaths: number, starts: number,
 *   table: Array<[string, number]>|null,
 *   paradox: null|{starts: number, top: [string, number]|null,
 *   spenders: number, ends: {complete: number, released: number,
 *   frozenStanddown: number, timeout: number, unclosed: number}}}}
 */
export function calmRescueParadox (lines) {
  const src = Array.isArray(lines)
    ? lines
    : (typeof lines === 'string' ? lines.split('\n') : null)
  if (!src) return null
  const deaths = deathKindCensus(src).total
  const rescue = rescueLedger(src)
  const starts = (rescue.totals && rescue.totals.starts) || 0
  if (deaths > 0 || starts < CALM_RESCUE_FLOOR) {
    return { deaths, starts, table: null, paradox: null }
  }
  const table = Object.entries(rescue.perBot || {})
    .map(([bot, r]) => [bot, r.starts || 0])
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  return {
    deaths: 0,
    starts,
    table,
    paradox: {
      starts,
      top: table[0] || null,
      spenders: table.length,
      ends: {
        complete: rescue.totals.complete || 0,
        released: rescue.totals.released || 0,
        frozenStanddown: rescue.totals.frozenStanddown || 0,
        timeout: rescue.totals.timeout || 0,
        unclosed: rescue.totals.unclosed || 0
      },
      // (v0.756.0) the churn's own meter - the paradox's clock leg (the
      // density the row always named but never priced); null on a
      // clockless face (the meter's own silence).
      meter: meterFrom(src, starts)
    }
  }
}

// (v0.756.0) the meter's own join: the face's hb clock (sealDeathCensus's
// clockEnd) prices the churn's density - the one-parser law by reuse, no
// new regexes, no second walk of the rescue shapes.
function meterFrom (src, starts) {
  const clockEndS = sealDeathCensus(src).clock.clockEnd
  const density = churnDensity(starts, clockEndS)
  if (density === null) return null
  return { clockEndS, density, scale: CHURN_METER_SCALE_S }
}

// (v0.756.0) THE CHURN'S OWN METER - the paradox's clock leg arrives. The
// v0.701.0 row named the meter's law ("the water lane churns on its own
// clock, the deaths are not its meter") but priced no density: 35 starts
// on the 33rd, 53 on the 14-era face, 24 on face 63 (37589681027, the
// anatomy tree's first face, 0 deaths over a 721s clock) - raw counts,
// never per-clock. The meter rides the face's OWN heartbeat clock
// (sealDeathCensus's clockEnd - the last hb's ts, the death clock's own
// end read; reused, zero new regexes): starts per CHURN_METER_SCALE_S
// (100s - the pace row's own unit style), 2 decimals (the siege pace's
// own rounding law). Face 63's maiden read: 24 starts over 721s =
// 3.33 starts/100s. Junk law: a non-finite/negative start count, a
// zero/non-finite clock end (the clock never invents - no division by
// zero, the honest null), or a non-positive scale reads null; the
// paradox without a clock (a pre-hb face) carries meter: null and the
// row prints without the tail (the meter's own silence).
export const CHURN_METER_SCALE_S = 100

export function churnDensity (starts, clockEndS, { scale = CHURN_METER_SCALE_S } = {}) {
  if (!Number.isFinite(starts) || starts < 0) return null
  if (!Number.isFinite(clockEndS) || clockEndS <= 0) return null
  if (!Number.isFinite(scale) || scale <= 0) return null
  return Number(((starts / clockEndS) * scale).toFixed(2))
}
