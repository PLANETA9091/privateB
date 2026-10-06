//
// ascendstall.mjs - THE ASCEND'S LIVE FENCE (v0.708.0)
//
// The deep-pocket ascend's OTHER side: the stall lane's own mass. The
// v0.707.0 toll owns the reset(-1) rides (the sensor died mid-ascend and
// the dig still landed) and FENCES the live ascends out - '14 of the
// era's 16' - naming them a different front. This is that front.
//
// A live ascend ('F13 [F13] water: deep-pocket ascend - dug the ceiling
// granite at [-127,50,412] (jump stalled 3+ passes, o2 12)') is the
// sensor-INNOCENT stall: the jump sat stalled at the emitter's own
// threshold (3+ passes) on a FULL sensor, and the bot bought its way out
// with the ceiling dig. The toll's dead ascends cross-check here (the
// fence must hold: dead here == the toll's ascends, byte-identical
// families).
//
// The census keeps the stall's own floor ('jump stalled N+ passes' -
// keyed by the emitter's minimum) and the per-bot mass (the stall's
// whales: the bot that stalls is the bot whose pathing owns the front).
// The era's own reads, raw-log reconciled: the 36th 14 (13 live, 1 dead;
// F5=3 the whale), the 34th 2 (1 live, 1 dead - the toll's own ascend).
//
// Junk-safe: non-array reads null (the o2gap convention); an ascend-free
// face reads the zero shape (the row stays silent). Pure: reads, never
// mutates. Zero fleet wiring (mining-surface only, the
// v0.379/.../v0.707.0 precedent).
//

/**
 * ascendStall(lines) - the deep-pocket ascend's live-side census (the
 * stall lane's own mass).
 *
 * @param {string[]} [lines] the face log (array of lines)
 * @returns {null|{ascends: number, live: number, dead: number,
 *   minPasses: Object<string, number>,
 *   bots: Object<string, number>}} the stall census (null on non-array);
 *   dead is the fence's cross-check leg (it must equal the v0.707.0
 *   toll's ascends - byte-identical families)
 */
export function ascendStall (lines) {
  if (!Array.isArray(lines)) return null
  const stall = { ascends: 0, live: 0, dead: 0, minPasses: {}, bots: {} }
  for (const line of lines) {
    if (typeof line !== 'string') continue
    if (!/deep-pocket ascend/.test(line)) continue
    stall.ascends++
    if (/o2 reset\(-1\)/.test(line)) stall.dead++
    else stall.live++
    const bot = (line.match(/^(F\d+)\b/) || [])[1]
    if (bot) stall.bots[bot] = (stall.bots[bot] || 0) + 1
    const pm = line.match(/jump stalled (\d+)\+ passes/)
    if (pm) stall.minPasses[pm[1]] = (stall.minPasses[pm[1]] || 0) + 1
  }
  return stall
}
