/**
 * skywalk.mjs - (v0.727.0) THE CROWDED SKY'S OWN WALK - the decide starve's
 * own hand on the walk refusals, pure.
 *
 * MEASURED (fleet 37530997515, the v0.726.0 face, the calm one): 30 commons
 * chest-walk failures and the decide weather's own row sat BESIDE each other
 * for faces - 'by why: decide-timeout=14 ...' (the walkfail census) and 'the
 * A* starved at ents 1760..3694 (median 2097) - 12/14 gauged starves sat at
 * or past half the face's ents ceiling' (the decide weather) - and no cell
 * joined them. The join names the bank chain's bottleneck: the banked
 * crater's own why is the pathfinder's crowded sky - the walk refusals'
 * heaviest class is the decide timeout, and the starves ride the crowded
 * entity sky, not the terrain.
 *
 * THE ONE-PARSER LAW BY REUSE (the v0.725.0 o2Blind precedent): zero new
 * regexes - the join reuses walkFailCensus (walkfail.mjs) and decideWeather
 * (decideweather.mjs) verbatim; the join is the only new read. Junk-safe end
 * to end: either side's zero shape reads the honest under-bar none-form.
 *
 * THE VERDICT IS A CONCENTRATION (the pinbill law), both sides barred:
 *   - the walk side: the decide-timeout refusals reach SKYWALK_MIN_REFUSALS
 *     AND own SKYWALK_WALK_SHARE of the face's walk refusals;
 *   - the sky side: the decide weather gauged starves (fails > 0), the
 *     crowded share reached SKYWALK_SKY_SHARE (the row's own half-ceiling
 *     language).
 * Below any bar the verdict stays honestly empty - the join priced, no
 * verdict invented.
 */

import { walkFailCensus } from './walkfail.mjs'
import { decideWeather } from './decideweather.mjs'

export const SKYWALK_MIN_REFUSALS = 10
export const SKYWALK_WALK_SHARE = 0.4
export const SKYWALK_SKY_SHARE = 0.5

/**
 * @param {string[]} lines - the fleet log's own lines (junk-safe)
 * @returns {{refusals: number, decideTimeouts: number, starves: number,
 *   entsMedian: number|null, crowdedN: number|null, crowdedOf: number|null,
 *   verdict: {decideTimeouts: number, of: number, share: number,
 *   starves: number, entsMedian: number, crowdedN: number, crowdedOf: number}
 *   |null}} the join's one shape: the walk side, the sky side, and the
 *   concentration verdict (null under any bar - the honest none-form).
 */
export function skyWalk (lines) {
  const rows = Array.isArray(lines) ? lines : []
  const wf = walkFailCensus(rows)
  const dw = decideWeather(rows)
  const refusals = (wf.walk && typeof wf.walk.total === 'number') ? wf.walk.total : 0
  const byWhy = (wf.walk && wf.walk.byWhy) || {}
  const decideTimeouts = byWhy['decide-timeout'] || 0
  const starves = typeof dw.fails === 'number' ? dw.fails : 0
  const entsMedian = (dw.ents && typeof dw.ents.median === 'number') ? dw.ents.median : null
  const crowdedN = (dw.crowded && typeof dw.crowded.n === 'number') ? dw.crowded.n : null
  const crowdedOf = (dw.crowded && typeof dw.crowded.of === 'number') ? dw.crowded.of : null
  const walkShareOk = refusals > 0 && (decideTimeouts / refusals) >= SKYWALK_WALK_SHARE
  const skyShareOk = starves > 0 && crowdedN != null && crowdedOf != null && crowdedOf > 0 &&
    (crowdedN / crowdedOf) >= SKYWALK_SKY_SHARE
  const verdict = (decideTimeouts >= SKYWALK_MIN_REFUSALS && walkShareOk && skyShareOk)
    ? {
        decideTimeouts,
        of: refusals,
        share: decideTimeouts / refusals,
        starves,
        entsMedian,
        crowdedN,
        crowdedOf
      }
    : null
  return { refusals, decideTimeouts, starves, entsMedian, crowdedN, crowdedOf, verdict }
}
