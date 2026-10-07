//
// droughttimeline.mjs - THE PUMP'S OWN TIMELINE (v0.738.0)
// The dry yard's own column (their v0.737.0) priced the drought's
// DEMAND side - the located dry reads named the yard's dry side per
// chest. But the column answered the demand alone: what the fuel
// tithe's PUMP did, and WHEN it did it, stayed unread. The 53rd's own
// motive (face 37553652417): F19 banked 21 coal and F4 banked 3 coal
// INTO the yard mid-face - and the sweeps still read 92 dry chests
// across the stream. The correction the timeline makes honest: the
// drought is not always the pump's SILENCE (the 52nd's class: zero
// fuel-tithe firings, the inflow never spoke) - it can be the
// pump's PRIME arriving while the sweeps starve anyway: the stock
// sat in the yard while the dry reads rode on (the delivery's own
// break - the sweeps walk the nearest few chests and die on the last
// mile (the 53rd's 17 last-mile refusals), never reaching the primed
// one, or the tithe's chest is not the sweeps' chest).
//
// THE WIRE (two lenses, one read, no re-parsing - the v0.736.0
// skywalk law: both streams are already parsed):
//   the pump's events - sealcensus.mjs's OWN SEAL_BANKED_RE (one
//     parser per shape; this lib creates NO new RE for the sealed
//     shapes), filtered to the fuel-tithe family's coal item;
//   the yard's dry reads - commonsledger.mjs's OWN COMMONS_EMPTY_RE,
//     the located form only (the bare form carries no position - the
//     old faces' shape), the RAW stream's own population (a sweep
//     need not be open - the timeline reads the stream, not the
//     sweep's book; the ledger's in-sweep dryReads stays its own
//     column and the two populations are named, never mixed);
//   the join - each dry read's line index against the banks': the
//     reads BEFORE the first bank are the pump's silence's own (the
//     honest drought - nothing to deliver yet), the reads AFTER it
//     are the break's own (the pump had stock and the yard still
//     read dry).
//
// THE VERDICT (exclusive classes; zero dry reads = the honest zero):
//   the pump never spoke    - banks 0, dry reads present (the 52nd)
//   the pump holds          - banks present, no dry reads after the
//                             first bank (the drought ended at the prime)
//   the delivery's own break - banks present, dry reads after the
//                             first bank (the 53rd: the stock sat)
//   no drought rode this face - banks 0 and dry reads 0
//
// Pure parser, unit-pinned; decompose is its field read.
// Mining-surface only: zero fleet wiring, zero new log lines.
// Junk-safe end to end: non-string rows skipped, a face with no
// commons traffic and no tithe reads the honest zero.
//

import { COMMONS_EMPTY_RE } from './commonsledger.mjs'
import { SEAL_BANKED_RE } from './sealcensus.mjs'

/**
 * Read the pump's own timeline - the fuel-tithe coal banks' positions
 * against the yard's located dry reads. Pure census over one stream.
 * @param {string[]} lines one fleet-log, all lines
 * @returns {null|{banks: {idx: number, bot: string, units: number}[], bankShapes: string[], units: number, dryReads: number, firstBankIdx: number, prePrime: number, postPrime: number, totalLines: number}}
 */
export function droughtTimeline (lines) {
  if (!Array.isArray(lines)) return null
  const banks = []
  const dryIdx = []
  lines.forEach((line, idx) => {
    if (typeof line !== 'string') return
    const b = SEAL_BANKED_RE.exec(line)
    if (b && b[2] === 'fuel tithe' && b[4] === 'coal') {
      banks.push({ idx, bot: b[1], units: Number(b[3]) })
      return
    }
    const d = COMMONS_EMPTY_RE.exec(line)
    if (d && d[2]) dryIdx.push(idx) // the located form only - the bare form has no position to join
  })
  const firstBankIdx = banks.length ? banks[0].idx : -1
  let prePrime = 0
  let postPrime = 0
  for (const i of dryIdx) {
    if (firstBankIdx < 0 || i < firstBankIdx) prePrime++
    else postPrime++
  }
  const units = banks.reduce((s, b) => s + b.units, 0)
  const bankShapes = banks.map(b => `${b.bot} ${b.units}u @${Math.round(100 * b.idx / Math.max(lines.length, 1))}%`)
  return {
    banks, bankShapes, units,
    dryReads: dryIdx.length,
    firstBankIdx, prePrime, postPrime,
    totalLines: lines.length
  }
}

const pct = (part, whole) => whole > 0 ? Math.round(part * 100 / whole) : 0

// ONE verdict line, only when the drought has a face at all (the
// none form is honest silence - the block stays quiet on a face
// with neither a tithe nor a dry read).
export function droughtTimelineRow (t) {
  if (!t || (t.banks.length === 0 && t.dryReads === 0)) return null
  const pump = t.banks.length
    ? `the tithe banked ${t.units} coal in ${t.banks.length} firing(s) (${t.bankShapes.join(', ')} of the stream)`
    : 'the tithe never spoke this face (0 banked firing(s))'
  const reads = `the dry reads ${t.dryReads} (the raw stream's own population)`
  if (t.banks.length === 0) {
    return `the pump's own timeline: ${pump}; ${reads} - the drought is the inflow's own (the pump's silence owns it)`
  }
  if (t.postPrime === 0) {
    return `the pump's own timeline: ${pump}; ${reads} - before the first bank ${t.prePrime}, after it 0 - the pump primed and the drought ended at the first bank`
  }
  return `the pump's own timeline: ${pump}; ${reads} - before the first bank ${t.prePrime}, after it ${t.postPrime} (${pct(t.postPrime, t.dryReads)}%) - the pump primed and the yard still read dry - the delivery's own break (the stock sat while the sweeps starved)`
}
