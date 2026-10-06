//
// sensortoll.mjs - THE SENSOR'S OWN TOLL (v0.707.0)
//
// The o2 reset(-1) skin's full mass across the family's THREE skins, in
// one census. The v0.379.0 decompose census owns the death contexts, the
// v0.479.0 cue lens owns the breath mirrors - and the deep-pocket ascend
// (the bot dug the ceiling stone while the sensor was already dead) was
// owned by NOBODY. The fire-2230 worklog named the family a lane of its
// own: the 36th's 3 drown deaths ALL rode o2 reset(-1) - the sensor died
// and the water kept the bot.
//
// The three skins (the toll counts the reset(-1) rides ONLY - the
// sensor-alive rides are the stall lane's own mass, a different front):
//
//   the DEATH CONTEXT - o2gap.mjs's own grammar (imported, the one-
//     parser law by reuse): 'F15 [F15] death: drown context (o2
//     reset(-1), feet water, head water, rescue 2s ago, leg walk, wet
//     12s)' - the death's own context; the rescue field splits never /
//     live (active) / stale (Ns ago).
//
//   the BREATH MIRROR - o2gap.mjs's own grammar (imported): 'F15 [F15]
//     water: breath mirror [rescue-ran] - ... (o2 reset(-1), head WET,
//     snapshot 2s old)' - the mirror's class tag ([why]) names who owned
//     the killing window (the rescue lane rescue-ran, the combat defense
//     controls-owned, the sentry's blindness controls-blind, ...); the
//     mirror joins the toll only when its o2 field IS reset(-1) (the
//     F13-era 'o2 ?' mirror is the escape's own story, not the sensor's).
//
//   the DEEP-POCKET ASCEND - the family's third skin, owned here (its
//     first parser): 'F15 [F15] water: deep-pocket ascend - dug the
//     ceiling stone at [-132,54,409] (jump stalled 3+ passes, o2
//     reset(-1))' - the sensor died mid-ascend and the dig still landed.
//     The era's fence: most ascends ride a LIVE sensor (14 of the era's
//     16) - those stay OUT (the stall lane, not the toll).
//
// The era's own reads, raw-log reconciled: the 32nd 3 (deaths 2 - both
// rescue never, the combat-flee leg; mirror controls-owned 1), the 34th
// 3 (death 1 - stale 4s; mirror rescue-ran 1; ascend 1), the 36th 5
// (deaths 3 - never / live / stale one each; mirror rescue-ran 1;
// ascend 1). Across the era's 6 toll deaths the rescue states ride
// never 3 / stale 2 / live 1 - the rescue lane lost the sensor window
// even flying live and arriving 2-4s before death (the v0.480.0
// effective window's own pricing ground).
//
// The other cell absorbs a future skin (the sum of the skins is the
// rides - the honest split, no residual). Junk-safe: non-array reads
// null (the o2gap convention); a clean face reads the zero shape (the
// row stays silent). Pure: reads, never mutates. Zero fleet wiring
// (mining-surface only, the v0.379/.../v0.706.0 precedent).
//
import { DROWN_CONTEXT_RE, BREATH_MIRROR_RE } from './o2gap.mjs'

/**
 * sensorToll(lines) - the o2 reset(-1) family's census across its three
 * skins.
 *
 * @param {string[]} [lines] the face log (array of lines)
 * @returns {null|{rides: number, deaths: number, mirrors: number,
 *   ascends: number, other: number,
 *   mirrorWhy: Object<string, number>,
 *   rescue: {never: number, live: number, stale: number},
 *   botRides: Object<string, number>}} the toll (null on non-array)
 */
export function sensorToll (lines) {
  if (!Array.isArray(lines)) return null
  const toll = {
    rides: 0,
    deaths: 0,
    mirrors: 0,
    ascends: 0,
    other: 0,
    mirrorWhy: {},
    rescue: { never: 0, live: 0, stale: 0 },
    botRides: {}
  }
  for (const line of lines) {
    if (typeof line !== 'string') continue
    const dm = DROWN_CONTEXT_RE.exec(line)
    if (dm && dm[2] === 'reset(-1)') {
      toll.rides++
      toll.deaths++
      const r = dm[5].toLowerCase()
      if (r === 'active') toll.rescue.live++
      else if (r === 'never') toll.rescue.never++
      else toll.rescue.stale++
      if (dm[1]) toll.botRides[dm[1]] = (toll.botRides[dm[1]] || 0) + 1
      continue
    }
    const mm = BREATH_MIRROR_RE.exec(line)
    if (mm && mm[3] === 'reset(-1)') {
      toll.rides++
      toll.mirrors++
      toll.mirrorWhy[mm[2]] = (toll.mirrorWhy[mm[2]] || 0) + 1
      if (mm[1]) toll.botRides[mm[1]] = (toll.botRides[mm[1]] || 0) + 1
      continue
    }
    if (/deep-pocket ascend/.test(line) && /o2 reset\(-1\)/.test(line)) {
      toll.rides++
      toll.ascends++
      const bot = (line.match(/^(F\d+)\b/) || [])[1]
      if (bot) toll.botRides[bot] = (toll.botRides[bot] || 0) + 1
      continue
    }
  }
  toll.other = toll.rides - toll.deaths - toll.mirrors - toll.ascends
  return toll
}
