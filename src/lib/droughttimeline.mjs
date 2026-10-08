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

//
// (v0.824.0) THE ANSWER'S OWN SIZE - the tithe's own answer against
// the asks' own hunger. The pump's own book priced the tithe's CLOCK
// twice (the v0.738.0 timeline's before/after positions, the
// v0.816.0 side's strict-majority owner) but never the ANSWER'S OWN
// SIZE: the asks' hunger rode in the commons ledger's own cells
// (t.asks asks, t.askCoal coal asked - torchbook's own
// TORCH_RESUPPLY_RE, one parser) and the tithe's answer rode in the
// timeline's own cells (banks, units), and the two numbers never
// met. Face 100 (run 37749215341, the v0.822.0 tree): asks 39 (78
// coal asked), still-dry 39 - every ask's answer read zero - while
// the tithe banked 9 coal in ONE firing: the answer is 11.5% of the
// hunger, and the drought's own arithmetic rode unnamed. THE HOLE
// THE FACE NAMED: the clocks (which side of the bank the dry reads
// queue on) and the owners (which side owns the book) are priced;
// WHAT THE PUMP'S ANSWER WAS WORTH against the demand the asks rode
// is the drought's own arithmetic - the inflow's own size front.
// titheAnswerSize(asked, banked) prices the share on the two cells
// only (zero re-parsing - the v0.802.0 seat law, the v0.816.0
// cells' own law). Junk never invents an answer: a non-finite or
// negative cell reads the honest silence (null), and a hungerless
// face (asks 0 / askCoal 0) has no size to price - the print site's
// gate keeps the row beside the asks' own line, where the hunger is
// already on the record. The verdict words: the share >= 100% - the
// tithe met the ask's hunger this face (the drought is not the
// size); the share 0 - the firing answered nothing the asks rode
// (the answer's own zero); otherwise the fraction - the tithe's
// answer is a fraction of the ask's hunger, the inflow's own size
// is the drought's own arithmetic.
//

/**
 * titheAnswerSize(asked, banked) - the answer's own size read.
 * @param {number} asked the asks' own hunger (the commons ledger's askCoal cell)
 * @param {number} banked the tithe's own answer (the timeline's units cell)
 * @returns {null|{asked: number, banked: number, share: number}}
 *   the read (null on junk or a hungerless face)
 */
export function titheAnswerSize (asked, banked) {
  const a = Number(asked)
  const b = Number(banked)
  if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b < 0) return null
  return { asked: a, banked: b, share: +(b / a).toFixed(3) }
}

/**
 * titheAnswerSizeRow(read) - the answer's own size row (the prose
 * lives only in the lib).
 * @param {null|{asked: number, banked: number, share: number}} [read] titheAnswerSize's own read
 * @returns {null|string} the row (null on junk)
 */
export function titheAnswerSizeRow (read) {
  if (!read || typeof read !== 'object' || Array.isArray(read)) return null
  const { asked, banked, share } = read
  if (!Number.isFinite(asked) || asked <= 0) return null
  if (!Number.isFinite(banked) || banked < 0) return null
  if (!Number.isFinite(share)) return null
  const pct = (share * 100).toFixed(1)
  const head = `${banked}u banked against ${asked}u asked (${pct}%)`
  if (share >= 1) return `${head} - THE ANSWER'S OWN SIZE: the tithe met the ask's hunger this face (the drought is not the size)`
  if (share <= 0) return `${head} - THE ANSWER'S OWN SIZE: the firing answered nothing the asks rode (the answer's own zero)`
  return `${head} - THE ANSWER'S OWN SIZE: the tithe's answer is a fraction of the ask's hunger - the inflow's own size is the drought's own arithmetic`
}

//
// (v0.827.0) THE TITHE FAMILY'S OWN VOICE - WHICH lane owns the
// deposit family's own firings. The pump's own book priced the fuel
// tithe's clock (the v0.738.0 timeline), its side (the v0.816.0
// owner) and its answer's size against the hunger (the v0.824.0
// share) - but the fuel tithe is ONE LANE of the deposit family the
// SEAL_BANKED_RE already parses (the fuel tithe / the cobble tithe /
// the smelt tithe / the seal reserve - one RE, one lane column,
// zero new parsing), and the family's own voice never rode a seat.
// Face 102 (run 37756117031, the v0.825.0 runtime's debut) named the
// hole: the cobble tithe fired 9 time(s) and the smelt tithe 5 while
// the fuel tithe held 0 - the deposit system's own lanes banked
// everything else while the yard's fuel inflow starved (the
// fleet-status banked counter moved 1366u through the family). The
// three-face census: 34 family firing(s) across faces 96/100/102,
// the fuel tithe spoke ONE (face 100's 9u answer, 5.9%) - the
// drought's inflow gap is the fuel lane's own trigger, not the
// banking's own. titheFamilyCensus counts the RE's own lane column
// (firings = the trigger's own voice - dimensionless across the
// lanes' materials; units ride per lane for the next lens); the seat
// rides the strict-majority law on the firings (the event-seating
// precedent - the v0.800.0 sweep book's own law), a tie owns
// nothing, junk never invents a lane, an empty family reads the
// honest silence (null). The row's fuel rider prices the fuel lane's
// own share beside the family's voice: the zero firing(s) word (the
// drought's inflow gap is the fuel lane's own trigger) or the count.
//

/**
 * titheFamilyCensus(lines) - the deposit family's own firings per lane.
 * @param {string[]} lines one fleet-log, all lines
 * @returns {null|{lanes: Object<string, {firings: number, units: number}>, total: number}}
 *   the census (null on an empty family)
 */
export function titheFamilyCensus (lines) {
  if (!Array.isArray(lines)) return null
  const lanes = {}
  let total = 0
  lines.forEach((line) => {
    if (typeof line !== 'string') return
    const m = SEAL_BANKED_RE.exec(line)
    if (!m) return
    const lane = m[2]
    const l = lanes[lane] || (lanes[lane] = { firings: 0, units: 0 })
    l.firings++
    l.units += Number(m[3])
    total++
  })
  if (!total) return null
  return { lanes, total }
}

/**
 * titheFamilySeat(census) - the family voice's own seat (the
 * strict-majority law on the firings, a tie owns nothing).
 * @param {null|{lanes: Object<string, {firings: number, units: number}>, total: number}} [census] titheFamilyCensus's own read
 * @returns {null|{total: number, owner: null|string, firings: number, share: number, fuelFirings: number}}
 *   the seat (null on an empty book)
 */
export function titheFamilySeat (census) {
  if (!census || typeof census !== 'object' || Array.isArray(census)) return null
  const lanes = (census.lanes && typeof census.lanes === 'object' && !Array.isArray(census.lanes)) ? census.lanes : {}
  const picked = []
  for (const lane of Object.keys(lanes)) {
    const l = lanes[lane]
    if (!l || typeof l !== 'object') continue
    const f = l.firings
    if (!Number.isFinite(f) || f <= 0) continue
    picked.push([lane, f])
  }
  if (!picked.length) return null
  picked.sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
  const total = picked.reduce((s, [, v]) => s + v, 0)
  const [topLane, topFirings] = picked[0]
  // the strict-majority law: the top lane's voice must hold more than the rest together
  const owns = topFirings * 2 > total
  const fuel = lanes['fuel tithe'] && lanes['fuel tithe'].firings
  const fuelFirings = (Number.isFinite(fuel) && fuel > 0) ? fuel : 0
  return { total, owner: owns ? topLane : null, firings: owns ? topFirings : 0, share: total ? +((owns ? topFirings : 0) / total).toFixed(3) : 0, fuelFirings }
}

/**
 * titheFamilySeatRow(seat) - the family voice's own row (the prose
 * lives only in the lib).
 * @param {null|{total: number, owner: null|string, firings: number, share: number, fuelFirings: number}} [seat] titheFamilySeat's own read
 * @returns {null|string} the row (null on junk)
 */
export function titheFamilySeatRow (seat) {
  if (!seat || typeof seat !== 'object' || Array.isArray(seat)) return null
  const { total, owner, firings, share, fuelFirings } = seat
  if (!Number.isFinite(total) || total <= 0) return null
  let head
  if (owner === null) {
    head = 'no solo lane owns the family\'s voice (the tie owns nothing)'
  } else {
    if (typeof owner !== 'string' || !owner) return null
    if (!Number.isFinite(firings) || firings <= 0 || firings > total) return null
    if (!Number.isFinite(share)) return null
    head = `the ${owner} owns ${firings} of ${total} family firing(s) (${(share * 100).toFixed(1)}%) - THE TITHE FAMILY'S OWN VOICE: one lane's own voice owns the family's book`
  }
  const f = Number.isFinite(fuelFirings) ? fuelFirings : 0
  const fuel = f === 0
    ? 'the fuel tithe 0 firing(s) beside the family\'s own voice - the drought\'s inflow gap is the fuel lane\'s own trigger'
    : `the fuel tithe ${f} of ${total} firing(s) (${(f * 100 / total).toFixed(1)}%) beside the family's own voice`
  return `${head} - ${fuel}`
}
