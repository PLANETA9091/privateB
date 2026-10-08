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

//
// (v0.816.0) THE DRY READ'S OWN SIDE - WHICH side of the first bank
// owns the dry book. The timeline's break branch (banks present, dry
// reads after the first bank) printed the {prePrime, postPrime} split
// raw with ONE fixed prose tail - "the delivery's own break (the stock
// sat while the sweeps starved)" - while the three held break faces all
// rode the BEFORE side dominant: face 92 before 48 of 52 (92.3%),
// face 94 before 10 of 16 (62.5%), face 95 before 86 of 111 (77.5%) -
// the pump primed LATE and the honest front is the tithe's own clock,
// not the delivery's break. drySideSeat(cells) prices the seat on the
// timeline's own two cells only (zero re-parsing - the v0.802.0 seat
// law): the book is the cells' own sum; the strict-majority law
// (topUnits * 2 > total - the v0.815.0 chest seat's own law), a tie
// owns nothing; junk never invents a side - a non-finite or negative
// cell is skipped and counted, an empty book reads the honest silence
// (null). The seat rides the break's own branch only (the print site's
// gate): a drought-ended-at-the-prime face already names its front and
// a pump-silence face owns its book in the timeline's own words.
//

// the two cells' own row labels (the timeline's own before/after words)
const DRY_SIDE_CLASSES = [
  ['prePrime', 'before the first bank', 'the pump primed late - the tithe\'s own clock is the front (the dry reads queued before the first bank)'],
  ['postPrime', 'after the first bank', 'the delivery\'s own break - the stock sat while the sweeps starved (the inflow arrived and the yard still read dry)'],
]

/**
 * drySideSeat(cells) - the dry book's own side seat.
 * @param {Object<string, number>|null} [cells] the timeline's own {prePrime, postPrime}
 * @returns {null|{total: number, owner: null|string, units: number,
 *   share: number, word: null|string, bad: number}}
 *   the seat (null on an empty book)
 */
export function drySideSeat (cells) {
  const c = (cells && typeof cells === 'object' && !Array.isArray(cells)) ? cells : {}
  const picked = []
  let bad = 0
  for (const [key, label] of DRY_SIDE_CLASSES) {
    const v = c[key]
    if (v === undefined) continue
    if (!Number.isFinite(v) || v < 0) { bad++; continue }
    if (v === 0) continue
    picked.push([label, v])
  }
  if (!picked.length) return null
  picked.sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
  const total = picked.reduce((s, [, v]) => s + v, 0)
  const [topLabel, topUnits] = picked[0]
  // the strict-majority law: the top must hold more than the rest together
  const owns = topUnits * 2 > total
  const owner = owns ? topLabel : null
  const units = owns ? topUnits : 0
  const word = owns ? DRY_SIDE_CLASSES.find(([, l]) => l === topLabel)[2] : null
  return { total, owner, units, share: total ? +(units / total).toFixed(3) : 0, word, bad }
}

/**
 * drySideSeatRow(seat) - the seat's row (the prose lives only in the lib).
 * @param {null|{total: number, owner: null|string, units: number,
 *   share: number, word: null|string, bad: number}} [seat] drySideSeat's own read
 * @returns {null|string} the row (null on an empty book)
 */
export function drySideSeatRow (seat) {
  if (!seat || typeof seat !== 'object') return null
  const { total, owner, units, share, word } = seat
  if (!Number.isFinite(total) || total <= 0) return null
  if (!Number.isFinite(share)) return null
  if (!owner) return 'no solo side owns the dry book (the tie owns nothing)'
  if (typeof owner !== 'string' || !DRY_SIDE_CLASSES.some(([, l]) => l === owner)) return null
  if (!Number.isFinite(units) || units <= 0 || units > total) return null
  if (typeof word !== 'string' || !word) return null
  return `${owner} owns ${units} of ${total} dry read(s) (${(share * 100).toFixed(1)}%) - THE DRY READ'S OWN SIDE: ${word}`
}
