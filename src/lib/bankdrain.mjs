//
// bankdrain.mjs - THE FINAL BANK'S OWN DRAIN (v0.882.0)
//
// The late-third drain's own book. The end-phase machinery has priced
// its PIECES for a hundred fires: the stagger maths (endphase.mjs
// v0.21.1), the zero lines' why ledger (bankfail.mjs v0.411.0), the
// night hold's own gate (nightsafety.mjs), the report block's
// write-off (bankcensus.mjs) - and NOBODY prices the DRAIN as one
// fold: what the fleet held into the deadline, which verdict each
// armed bot's chain rode, and how many armed chains never reported
// (the cut). Face 143's loudest read (deaths 7/8 late, the pocket
// peak at t-0, the fuel clips late-dominant) named the front; face
// 145's own log carried the shape (13 staggered arms, verdicts
// scattered: banked 4, still-underground 9, night-held 2, one honest
// 'nothing to deposit', one dooms-latched).
//
// THE REUSE LAW (one parser per emitter - never forked): the zero
// verdicts' reason grammar is bankfail's own classifier
// (classifyBankReason since v0.411.0 - the underground class's own
// climbAttempts read included), imported and never re-spelled here;
// the night hold is nightsafety's own gate's line shape; the stagger
// is endphase's maths' print. The book owns only the FOLD: the
// per-bot verdict join across the final-bank emitter family.
//
// THE FOLD LAW (line order is the truth, the house law): a bot's
// LATEST verdict wins whole (the o2arm last-wins idiom) - a latched
// bot that re-arms and banks rides banked, a night hold releases when
// a later verdict rides (the hold is the gate's own word, never the
// terminal). The CUT is the honest class: an armed bot (the stagger
// line printed) with NO verdict line at all - the run ended mid-chain
// (the v0.24.0 chain-error precedent priced its own seat; the silent
// end prices the cut). A verdict without a prior stagger is evidence,
// never dropped - the book counts it, the fence never invents an arm.
//
// Pure: reads, never mutates. Junk-safe: non-string rows judge
// nothing; non-array/string input reads the empty book.

import { classifyBankReason } from './bankfail.mjs'

// The stagger arm: 'F2 final bank: staggered +56s'
const STAGGER_RE = /^(F\d+) final bank: staggered \+(\d+)s$/

// The night hold: 'F12 final bank deferred: night (tod=12959) - the
// pocket rides out the dark alive (the v0.140.1 night hold)'
const NIGHT_RE = /^(F\d+) final bank deferred: night \(tod=(-?\d+)\)/

// The delivered verdict: 'F7 final bank: +13'
const BANKED_RE = /^(F\d+) final bank: \+(\d+)$/

// The zero verdict: 'F9 final bank: 0 (still underground after 2 climb
// attempts - ...)' - the line shape is bankfail's own BANK_ZERO_RE's
// final-bank arm; the reason rides classifyBankReason (the reuse law).
const ZERO_RE = /^(F\d+) final bank: 0 \((.+)\)$/

// The chain error: 'F3 final bank chain error: Cannot read properties...'
// (the v0.24.0 catch's own byte - a climb that dies mid-air names its
// killer; the drain books the error, the message stays the killer's).
const CHAIN_ERR_RE = /^(F\d+) final bank chain error: (.+)$/

// The dooms-latched fate: the chain's own refusal seat - the reason
// prefix is the latch's own word ('dooms-latched after N failed
// shaft-bottom climb cycles - the chain is refused, the clock mines
// on'), priced by the fold (the latch is a DRAIN fate, distinct from
// the walk lanes' whys classifyBankReason owns).
const LATCHED_RE = /^dooms-latched after (\d+) failed/

// The underground attempts count (the bankfail classifier's own cell,
// re-read here only for the fold's seat: how many climb attempts the
// write-off paid across the face).

const emptyBook = () => ({
  bots: 0,
  armed: 0,
  banked: { count: 0, units: 0 },
  nothing: 0,
  underground: { count: 0, climbs: 0 },
  latched: 0,
  budget: 0,
  unreachable: 0,
  nochest: 0,
  waterrescue: 0,
  otherzero: 0,
  nightHeld: 0,
  chainError: 0,
  cut: 0,
  perBot: {}
})

// The per-bot verdict seat: { armed, staggerSec, verdict, why, units,
// climbs, tod }. The verdict vocabulary: 'banked' | 'zero' | 'held' |
// 'chain-error' | null (armed, no verdict = the cut).
function seatFor (book, bot) {
  if (!book.perBot[bot]) {
    book.perBot[bot] = { armed: false, staggerSec: null, verdict: null, why: null, units: 0, climbs: null, tod: null }
    book.bots++
  }
  return book.perBot[bot]
}

function armTotal (book, seat, verdict, why, units, climbs, tod) {
  // The top-level totals ride the seat's OWN last verdict (the fold's
  // last-wins law): a re-armed bot's old class gives way - the counts
  // are the verdicts' census, never the lines' (a bot that rode zero
  // then banked is one banked, not one of each).
  if (seat.verdict === 'banked') book.banked.count--
  else if (seat.verdict === 'zero') {
    if (seat.why === 'nothing') book.nothing--
    else if (seat.why === 'underground') { book.underground.count--; book.underground.climbs -= (seat.climbs ?? 0) }
    else if (seat.why === 'latched') book.latched--
    else if (seat.why === 'budget') book.budget--
    else if (seat.why === 'unreachable') book.unreachable--
    else if (seat.why === 'nochest') book.nochest--
    else if (seat.why === 'waterrescue') book.waterrescue--
    else book.otherzero--
  } else if (seat.verdict === 'held') book.nightHeld--
  else if (seat.verdict === 'chain-error') book.chainError--
  seat.verdict = verdict
  seat.why = why
  seat.units = units
  seat.climbs = climbs
  seat.tod = tod
  if (verdict === 'banked') { book.banked.count++; book.banked.units += units }
  else if (verdict === 'zero') {
    if (why === 'nothing') book.nothing++
    else if (why === 'underground') { book.underground.count++; book.underground.climbs += climbs }
    else if (why === 'latched') book.latched++
    else if (why === 'budget') book.budget++
    else if (why === 'unreachable') book.unreachable++
    else if (why === 'nochest') book.nochest++
    else if (why === 'waterrescue') book.waterrescue++
    else book.otherzero++
  } else if (verdict === 'held') book.nightHeld++
  else if (verdict === 'chain-error') book.chainError++
}

// The reason's own drain seat (the fold's vocabulary rides the
// classifier's own whys; the latched prefix is the drain's own fate).
function drainSeat (reason) {
  if (typeof reason !== 'string') return { why: 'other' }
  const latched = reason.match(LATCHED_RE)
  if (latched) return { why: 'latched', climbs: Number(latched[1]) }
  const cls = classifyBankReason(reason)
  const why = cls.why
  if (why === 'nothing' || why === 'underground' || why === 'budget' || why === 'water-rescue') {
    return { why, climbs: cls.climbAttempts ?? null }
  }
  if (typeof why === 'string' && why.startsWith('chest-unreachable')) return { why: 'unreachable', climbs: null }
  if (why === 'no-chest') return { why: 'nochest', climbs: null }
  return { why: 'other', climbs: null }
}

/**
 * Fold the final-bank emitter family into the per-bot drain verdicts.
 * Returns the totals book (perBot keyed by bot token) or the empty
 * book for junk input - never null, never invented.
 */
export function finalBankDrainBook (lines) {
  const book = emptyBook()
  if (!Array.isArray(lines)) return book
  for (const line of lines) {
    if (typeof line !== 'string') continue
    let m = line.match(STAGGER_RE)
    if (m) {
      const seat = seatFor(book, m[1])
      if (!seat.armed) { seat.armed = true; book.armed++ }
      seat.staggerSec = Number(m[2])
      continue
    }
    m = line.match(NIGHT_RE)
    if (m) {
      const seat = seatFor(book, m[1])
      armTotal(book, seat, 'held', 'night', 0, null, Number(m[2]))
      continue
    }
    m = line.match(BANKED_RE)
    if (m) {
      const seat = seatFor(book, m[1])
      armTotal(book, seat, 'banked', null, Number(m[2]), null, null)
      continue
    }
    m = line.match(ZERO_RE)
    if (m) {
      const seat = seatFor(book, m[1])
      const ds = drainSeat(m[2])
      armTotal(book, seat, 'zero', ds.why, 0, ds.climbs, null)
      continue
    }
    m = line.match(CHAIN_ERR_RE)
    if (m) {
      const seat = seatFor(book, m[1])
      armTotal(book, seat, 'chain-error', null, 0, null, null)
      continue
    }
  }
  // The cut's own price: armed seats with no verdict line at all.
  for (const bot of Object.keys(book.perBot)) {
    const seat = book.perBot[bot]
    if (seat.armed && seat.verdict === null) book.cut++
  }
  return book
}

/**
 * The fence law: the sums must agree. The top-level census must be
 * exactly the perBot fold's own image (the verdicts' census, the
 * banked units' sum, the climbs' sum, the cut's count). An
 * inconsistent book prices nothing - the row stays silent.
 */
export function finalBankDrainConsistent (book) {
  if (!book || typeof book !== 'object' || !book.perBot) return false
  const zero = (v) => Number.isInteger(v) && v >= 0
  if (![book.bots, book.armed, book.nothing, book.latched, book.budget, book.unreachable, book.nochest, book.waterrescue, book.otherzero, book.nightHeld, book.chainError, book.cut].every(zero)) return false
  if (!zero(book.banked.count) || !zero(book.banked.units) || !zero(book.underground.count) || !zero(book.underground.climbs)) return false
  let bots = 0, armed = 0, bankedN = 0, bankedU = 0, nothing = 0, ugN = 0, ugC = 0
  let latched = 0, budget = 0, unreachable = 0, nochest = 0, waterrescue = 0, otherzero = 0
  let held = 0, err = 0, cut = 0
  for (const seat of Object.values(book.perBot)) {
    if (!seat || typeof seat !== 'object') return false
    bots++
    if (seat.armed) armed++
    if (seat.verdict === 'banked') { bankedN++; bankedU += seat.units }
    else if (seat.verdict === 'zero') {
      if (seat.why === 'nothing') nothing++
      else if (seat.why === 'underground') { ugN++; ugC += seat.climbs }
      else if (seat.why === 'latched') latched++
      else if (seat.why === 'budget') budget++
      else if (seat.why === 'unreachable') unreachable++
      else if (seat.why === 'nochest') nochest++
      else if (seat.why === 'waterrescue') waterrescue++
      else otherzero++
    } else if (seat.verdict === 'held') held++
    else if (seat.verdict === 'chain-error') err++
    else if (seat.armed) cut++
  }
  return bots === book.bots && armed === book.armed && bankedN === book.banked.count &&
    bankedU === book.banked.units && nothing === book.nothing && ugN === book.underground.count &&
    ugC === book.underground.climbs && latched === book.latched && budget === book.budget &&
    unreachable === book.unreachable && nochest === book.nochest && waterrescue === book.waterrescue &&
    otherzero === book.otherzero && held === book.nightHeld && err === book.chainError && cut === book.cut
}

/**
 * The single-seat row (the v0.881.0 idiom: one row, the zero classes
 * stay off - the honest silence names the classes that never fired).
 * The fence law: an inconsistent book prices nothing.
 */
export function finalBankDrainRow (book) {
  if (!finalBankDrainConsistent(book)) return null
  const parts = []
  if (book.armed > 0) parts.push(`armed ${book.armed}`)
  if (book.banked.count > 0) {
    const pct = book.armed > 0 ? ` (${Math.round((book.banked.count / book.armed) * 100)}%)` : ''
    parts.push(`banked ${book.banked.count} +${book.banked.units}u${pct}`)
  }
  if (book.nothing > 0) parts.push(`nothing ${book.nothing}`)
  if (book.underground.count > 0) parts.push(`underground ${book.underground.count} (climbs ${book.underground.climbs})`)
  if (book.latched > 0) parts.push(`latched ${book.latched}`)
  if (book.budget > 0) parts.push(`budget ${book.budget}`)
  if (book.unreachable > 0) parts.push(`unreachable ${book.unreachable}`)
  if (book.nochest > 0) parts.push(`no-chest ${book.nochest}`)
  if (book.waterrescue > 0) parts.push(`water-rescue ${book.waterrescue}`)
  if (book.otherzero > 0) parts.push(`other-zero ${book.otherzero}`)
  if (book.nightHeld > 0) parts.push(`night-held ${book.nightHeld}`)
  if (book.chainError > 0) parts.push(`chain-error ${book.chainError}`)
  if (book.cut > 0) parts.push(`cut ${book.cut}`)
  if (parts.length === 0) return null
  return `the final bank's own drain (v0.882.0): ${parts.join(', ')} - the cut prices the chains the clock ended first`
}
