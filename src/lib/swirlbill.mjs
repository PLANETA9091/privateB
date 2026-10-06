/**
 * swirlbill.mjs - (v0.726.0) THE INSTANT CHURN'S OWN BILL - the rescue lane's
 * zero-close loop, pure.
 *
 * MEASURED (fleet 37524391418, the v0.724.0 face, the hard-kill one): F13 rode
 * 83 drowning-rescue starts and closed 78 of them in 0.0s - the trigger said
 * 'drowning' and the lane said 'surface-safe' in the same breath, 78 times in
 * one face (the liar ladder ratcheted 81 on the same bot, the freeze gate's
 * era note), and the bot DIED of drown anyway ('rescue aborted (dead
 * mid-rescue) in 2.3s'). The face's raw counters printed the numbers
 * ('rescue complete 0.0s: 81') but no cell owned the CLASS: a rescue lane
 * that re-arms faster than it swims is a churn, not a cure - the trigger's
 * precision loss priced by the lane's own completion speed.
 *
 * THE LAWS THIS BILL OBEYS:
 *   - the pair is per-bot: an instant close joins the nearest OPEN start of
 *     the SAME bot (a start still awaiting its close); a close with no open
 *     start is the lane's own leak and counts orphan, never instant.
 *   - the verdict is a concentration, not a volume (the pinbill law): a bot
 *     whose instant closes reach SWIRL_MIN_INSTANT AND own SWIRL_SHARE of
 *     its starts reads THE INSTANT CHURN - the trigger's drowning and the
 *     lane's surface-safe in the same breath. Below either bar the cell
 *     stays honestly empty (a minority instant close is a boundary case,
 *     not a stance - the 47th's F1 3 of 16 stays out on both bars).
 *   - junk never invents (the census law): a line that neither opens a
 *     rescue nor closes one instantly reads nothing; the fold never throws.
 *   - the honest silence: zero instant closes reads instant 0 and empty
 *     verdicts - the caller prints the none-form or stays silent.
 */

export const SWIRL_MIN_INSTANT = 10
export const SWIRL_SHARE = 0.5

const SWIRL_START_RE = /^(F\d+) \[F\d+\] water: drowning rescue start/
const SWIRL_INSTANT_RE = /^(F\d+) \[F\d+\] water: rescue complete in 0\.0s$/

/**
 * @param {string[]} lines - the fleet log's own lines (junk-safe)
 * @returns {{starts: number, instant: number, orphan: number,
 *   bots: Object<string, {starts: number, instant: number, open: number}>,
 *   verdicts: Array<{bot: string, instant: number, of: number, share: number}>}}
 *   the fold's one shape: the mass, the churn, the leak, the per-bot cells
 *   and the concentration verdicts (sorted instant desc, bot asc).
 */
export function swirlBill (lines) {
  const rows = Array.isArray(lines) ? lines : []
  const bots = {}
  let starts = 0
  let instant = 0
  let orphan = 0
  for (const l of rows) {
    if (typeof l !== 'string' || !l.length) continue
    let m = SWIRL_START_RE.exec(l)
    if (m) {
      const bot = m[1]
      const b = bots[bot] || (bots[bot] = { starts: 0, instant: 0, open: 0 })
      b.starts++
      b.open++
      starts++
      continue
    }
    m = SWIRL_INSTANT_RE.exec(l)
    if (m) {
      const bot = m[1]
      const b = bots[bot] || (bots[bot] = { starts: 0, instant: 0, open: 0 })
      if (b.open > 0) {
        b.open--
        b.instant++
        instant++
      } else {
        orphan++
      }
      continue
    }
  }
  const verdicts = []
  for (const [bot, b] of Object.entries(bots)) {
    if (b.instant >= SWIRL_MIN_INSTANT && b.starts > 0 && (b.instant / b.starts) >= SWIRL_SHARE) {
      verdicts.push({ bot, instant: b.instant, of: b.starts, share: b.instant / b.starts })
    }
  }
  verdicts.sort((a, b) => b.instant - a.instant || (a.bot < b.bot ? -1 : 1))
  return { starts, instant, orphan, bots, verdicts }
}
