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
import { NIGHT_WALK_START } from './nightsafety.mjs'

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
  // (v0.888.0) THE GHOST UNITS' OWN CURE - the banked release rides the
  // seat's own units OUT of the book (the face-148 catch: F2 banked +32
  // then held for the night - the count released, the units stayed and
  // haunted the total 256 against the seats' own 224; the fence priced
  // nothing, the row went silent). The units ride the same last-wins
  // seat as the count: the book's banked census is the banked seats'
  // own image, whole.
  if (seat.verdict === 'banked') { book.banked.count--; book.banked.units -= (seat.units ?? 0) }
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

// (v0.886.0) THE FINAL BANK'S OWN HOLD CLOCK - the night-held seats' own
// tod join (the drain's own NEXT BYTE the face-146 crater named:
// night-held 7 - the hold's own clock unread since the v0.140.1 gate
// shipped). Every hold line rides the gate's own tod (NIGHT_RE, the
// family's own emitter above - never re-spelled); the gate's own edge
// is nightsafety's own NIGHT_WALK_START (the reuse law - the
// walk-forbidden clock's own constant, imported, never forked). THE
// GAP: tod - NIGHT_WALK_START = the ticks the chain turned PAST the
// walk gate - the bank-before-night lever's own price (the stagger's
// +Ns arithmetic rides the same budget: the chains must turn that much
// earlier to beat the gate). The emitter's tod=-1 skin (the bot's own
// clock missing at the hold) is the blind skin: the seat counts, the
// gap judges nothing (the v0.884.0 blind-skin idiom - the sensor's own
// absence never invents a number). The fence law: the seats must be
// exactly the perHold fold's own image - every held line lands a row,
// every gap reads tod against the gate's own constant, the sums agree;
// an inconsistent book prices nothing (the row stays silent).

const emptyHoldBook = () => ({
  held: 0,
  blind: 0,
  gap: { count: 0, min: null, max: null, sum: 0 },
  perHold: []
})

/**
 * Fold the night-held seats' own hold clock. Returns the totals book
 * (perHold riding the bot, the tod, the gate gap in ticks or null) -
 * never null, never invented.
 */
export function finalBankHoldBook (lines) {
  const book = emptyHoldBook()
  if (!Array.isArray(lines)) return book
  for (const line of lines) {
    if (typeof line !== 'string') continue
    const m = NIGHT_RE.exec(line)
    if (!m) continue
    const tod = Number(m[2])
    book.held++
    if (tod < 0) {
      book.blind++
      book.perHold.push({ bot: m[1], tod, gap: null })
      continue
    }
    const gap = tod - NIGHT_WALK_START
    book.gap.count++
    book.gap.sum += gap
    if (book.gap.min === null || gap < book.gap.min) book.gap.min = gap
    if (book.gap.max === null || gap > book.gap.max) book.gap.max = gap
    book.perHold.push({ bot: m[1], tod, gap })
  }
  return book
}

/**
 * The hold clock's own fence: the totals must be exactly the perHold
 * fold's own image; every non-blind gap must read tod against the
 * gate's own constant. An inconsistent book prices nothing.
 */
export function finalBankHoldConsistent (book) {
  if (!book || typeof book !== 'object' || !Array.isArray(book.perHold)) return false
  const nonNeg = (v) => Number.isInteger(v) && v >= 0
  if (!nonNeg(book.held) || !nonNeg(book.blind)) return false
  if (!nonNeg(book.gap.count) || !nonNeg(book.gap.sum)) return false
  if (book.gap.count > 0 && (book.gap.min === null || book.gap.max === null)) return false
  if (book.gap.count === 0 && (book.gap.min !== null || book.gap.max !== null || book.gap.sum !== 0)) return false
  if (book.held !== book.perHold.length) return false
  let held = 0, blind = 0, count = 0, sum = 0
  let min = null, max = null
  for (const h of book.perHold) {
    if (!h || typeof h !== 'object' || typeof h.bot !== 'string') return false
    if (!Number.isInteger(h.tod)) return false
    held++
    if (h.tod < 0) {
      if (h.gap !== null) return false
      blind++
      continue
    }
    if (!Number.isInteger(h.gap) || h.gap !== h.tod - NIGHT_WALK_START) return false
    count++
    sum += h.gap
    if (min === null || h.gap < min) min = h.gap
    if (max === null || h.gap > max) max = h.gap
  }
  return held === book.held && blind === book.blind && count === book.gap.count &&
    sum === book.gap.sum && min === book.gap.min && max === book.gap.max
}

/**
 * The hold clock's own row (the v0.881.0 single-seat idiom): the held
 * mass, the gate gap's own spread, the blind class rides its own
 * count. An inconsistent book prices nothing; a face with no holds
 * reads the honest silence.
 */
export function finalBankHoldRow (book) {
  if (!finalBankHoldConsistent(book)) return null
  if (book.held === 0) return null
  const parts = [`held ${book.held}`]
  if (book.gap.count > 0) {
    const avg = Math.round(book.gap.sum / book.gap.count)
    parts.push(`gate gap ${book.gap.min}..${book.gap.max} ticks (avg ${avg})`)
  }
  if (book.blind > 0) parts.push(`blind ${book.blind}`)
  return `the final bank's own hold clock (v0.886.0): ${parts.join(', ')} - the bank-before-night lever prices the walk gate's own edge (${NIGHT_WALK_START})`
}

// (v0.888.0) THE FINAL BANK'S OWN STAGGER SEAT - the flow-priced slots'
// own fates + the hold join's pushed/late split (the drain's own NEXT
// BYTE the two faces' own mass named: face 146 held 7 with ONE slot in
// play (+64s, never held), face 148 held 4 with SIX slots (+88..104s,
// none held) - the slots' own share of the gate crater was unread).
// The slots' census rides the drain book's own perBot seats (the
// STAGGER_RE fold above - never re-spelled); the fates ride the seat's
// own final verdict (the last-wins law: the slot's fate is the verdict
// it ended on - banked | zero | held | chain-error | cut). THE HOLD
// JOIN (the fire-0100 worklog's own named byte): every hold row rides
// the bot's own slot - pushed = the gap fits inside the slot's own
// seconds (gap <= slot*20 ticks: the stagger ALONE pushed the chain
// past the walk gate - the near-free lever's own seat); late = the
// chain's own legs own the residual (gap - slot*20 ticks - the
// lateness no slot reorder cures); no-stagger = the held chain rode no
// slot at all (the arm's own lateness, the slots' innocence); the
// blind skin rides the hold book's own tod=-1 (the seat counts, the
// join judges nothing - the v0.884.0 idiom). THE FENCE: the sources
// must be consistent books (the drain's + the hold's own fences); the
// join rows mirror the hold book's own rows index for index; the
// lookup rides the drain seat's own slot (never invented); the slots'
// census mirrors the drain book's own slots; the sums agree - an
// inconsistent book prices nothing (the row stays silent).

const emptyStaggerBook = () => ({
  slots: { count: 0, min: null, max: null, sum: 0 },
  fates: { banked: 0, held: 0, zero: 0, chainError: 0, cut: 0 },
  join: {
    holds: 0,
    blind: 0,
    noStagger: 0,
    pushed: { count: 0, sum: 0 },
    late: { count: 0, min: null, max: null, sum: 0 }
  },
  perSlot: [],
  perJoin: []
})

const seatSlot = (seat) => (seat && typeof seat === 'object' &&
  Number.isInteger(seat.staggerSec) && seat.staggerSec >= 0)
  ? seat.staggerSec
  : null

/**
 * Fold the final bank's own stagger seat: the flow-priced slots' own
 * fates (the drain book's own slots, the last verdict wins) + the hold
 * join's pushed/late/no-stagger split (the hold book's own rows, the
 * slots read by bot token). Returns the totals book or the empty book
 * for junk/inconsistent sources - never null, never invented.
 */
export function finalBankStaggerBook (drainBook, holdBook) {
  const book = emptyStaggerBook()
  if (!drainBook || typeof drainBook !== 'object' || !drainBook.perBot) return book
  if (!holdBook || typeof holdBook !== 'object' || !Array.isArray(holdBook.perHold)) return book
  if (!finalBankDrainConsistent(drainBook) || !finalBankHoldConsistent(holdBook)) return book
  for (const [bot, seat] of Object.entries(drainBook.perBot)) {
    const slot = seatSlot(seat)
    if (slot === null) continue
    book.slots.count++
    book.slots.sum += slot
    if (book.slots.min === null || slot < book.slots.min) book.slots.min = slot
    if (book.slots.max === null || slot > book.slots.max) book.slots.max = slot
    if (seat.verdict === 'banked') book.fates.banked++
    else if (seat.verdict === 'held') book.fates.held++
    else if (seat.verdict === 'zero') book.fates.zero++
    else if (seat.verdict === 'chain-error') book.fates.chainError++
    else book.fates.cut++
    book.perSlot.push({ bot, staggerSec: slot, verdict: seat.verdict, why: seat.why ?? null })
  }
  for (const h of holdBook.perHold) {
    if (!h || typeof h !== 'object') continue
    book.join.holds++
    const seat = Object.prototype.hasOwnProperty.call(drainBook.perBot, h.bot)
      ? drainBook.perBot[h.bot]
      : null
    const slot = seatSlot(seat)
    if (h.gap === null || !Number.isInteger(h.gap)) {
      book.join.blind++
      book.perJoin.push({ bot: h.bot, gap: h.gap ?? null, staggerSec: slot, cls: 'blind', residualTicks: null })
      continue
    }
    if (slot === null) {
      book.join.noStagger++
      book.perJoin.push({ bot: h.bot, gap: h.gap, staggerSec: null, cls: 'no-stagger', residualTicks: null })
      continue
    }
    if (h.gap <= slot * 20) {
      book.join.pushed.count++
      book.join.pushed.sum += h.gap
      book.perJoin.push({ bot: h.bot, gap: h.gap, staggerSec: slot, cls: 'pushed', residualTicks: null })
    } else {
      const residual = h.gap - slot * 20
      book.join.late.count++
      book.join.late.sum += residual
      if (book.join.late.min === null || residual < book.join.late.min) book.join.late.min = residual
      if (book.join.late.max === null || residual > book.join.late.max) book.join.late.max = residual
      book.perJoin.push({ bot: h.bot, gap: h.gap, staggerSec: slot, cls: 'late', residualTicks: residual })
    }
  }
  return book
}

/**
 * The stagger seat's own fence: the sources must be consistent books;
 * the join rows must be exactly the hold book's own rows' image (index
 * for index, the lookup riding the drain seat's own slot); the slots'
 * census must mirror the drain book's own slots; the sums must agree.
 * An inconsistent book prices nothing.
 */
export function finalBankStaggerConsistent (drainBook, holdBook, book) {
  if (!drainBook || typeof drainBook !== 'object' || !holdBook || typeof holdBook !== 'object' ||
    !book || typeof book !== 'object') return false
  if (!finalBankDrainConsistent(drainBook) || !finalBankHoldConsistent(holdBook)) return false
  if (!Array.isArray(book.perSlot) || !Array.isArray(book.perJoin)) return false
  const nonNeg = (v) => Number.isInteger(v) && v >= 0
  if (!nonNeg(book.slots.count) || !nonNeg(book.slots.sum)) return false
  if (book.slots.count > 0 && (book.slots.min === null || book.slots.max === null)) return false
  if (book.slots.count === 0 && (book.slots.min !== null || book.slots.max !== null || book.slots.sum !== 0)) return false
  if (![book.fates.banked, book.fates.held, book.fates.zero, book.fates.chainError, book.fates.cut].every(nonNeg)) return false
  if (!nonNeg(book.join.holds) || !nonNeg(book.join.blind) || !nonNeg(book.join.noStagger)) return false
  if (!nonNeg(book.join.pushed.count) || !nonNeg(book.join.pushed.sum)) return false
  if (!nonNeg(book.join.late.count) || !nonNeg(book.join.late.sum)) return false
  if (book.join.late.count > 0 && (book.join.late.min === null || book.join.late.max === null)) return false
  if (book.join.late.count === 0 && (book.join.late.min !== null || book.join.late.max !== null || book.join.late.sum !== 0)) return false
  if (book.join.holds !== holdBook.held || book.join.blind !== holdBook.blind) return false
  if (book.perJoin.length !== book.join.holds) return false
  let pushed = 0, late = 0, noStagger = 0, blind = 0, pushedSum = 0, lateSum = 0
  let lateMin = null, lateMax = null
  for (let i = 0; i < book.perJoin.length; i++) {
    const j = book.perJoin[i]
    const h = holdBook.perHold[i]
    if (!j || typeof j !== 'object' || !h || typeof h !== 'object') return false
    if (j.bot !== h.bot || j.gap !== h.gap) return false
    const seat = Object.prototype.hasOwnProperty.call(drainBook.perBot, j.bot)
      ? drainBook.perBot[j.bot]
      : null
    if (!seat) return false
    const slot = seatSlot(seat)
    if ((j.staggerSec === null || Number.isInteger(j.staggerSec)) !== true) return false
    if (j.staggerSec !== slot) return false
    if (j.cls === 'blind') {
      if (h.gap !== null || j.residualTicks !== null) return false
      blind++
      continue
    }
    if (h.gap === null) return false
    if (j.cls === 'no-stagger') {
      if (slot !== null || j.residualTicks !== null) return false
      noStagger++
      continue
    }
    if (slot === null) return false
    if (j.cls === 'pushed') {
      if (h.gap > slot * 20 || j.residualTicks !== null) return false
      pushed++
      pushedSum += h.gap
      continue
    }
    if (j.cls === 'late') {
      const residual = h.gap - slot * 20
      if (residual <= 0 || j.residualTicks !== residual) return false
      late++
      lateSum += residual
      if (lateMin === null || residual < lateMin) lateMin = residual
      if (lateMax === null || residual > lateMax) lateMax = residual
      continue
    }
    return false
  }
  if (pushed !== book.join.pushed.count || pushedSum !== book.join.pushed.sum) return false
  if (late !== book.join.late.count || lateSum !== book.join.late.sum ||
    lateMin !== book.join.late.min || lateMax !== book.join.late.max) return false
  if (noStagger !== book.join.noStagger || blind !== book.join.blind) return false
  if (pushed + late + noStagger + blind !== book.join.holds) return false
  let slots = 0, slotSum = 0, slotMin = null, slotMax = null
  const fates = { banked: 0, held: 0, zero: 0, chainError: 0, cut: 0 }
  for (const s of book.perSlot) {
    if (!s || typeof s !== 'object' || typeof s.bot !== 'string') return false
    const seat = drainBook.perBot[s.bot]
    if (!seat || typeof seat !== 'object' || !seat.armed) return false
    const slot = seatSlot(seat)
    if (slot === null || s.staggerSec !== slot) return false
    if (s.verdict !== seat.verdict || (s.why ?? null) !== (seat.why ?? null)) return false
    slots++
    slotSum += slot
    if (slotMin === null || slot < slotMin) slotMin = slot
    if (slotMax === null || slot > slotMax) slotMax = slot
    if (seat.verdict === 'banked') fates.banked++
    else if (seat.verdict === 'held') fates.held++
    else if (seat.verdict === 'zero') fates.zero++
    else if (seat.verdict === 'chain-error') fates.chainError++
    else fates.cut++
  }
  if (slots !== book.slots.count || slotSum !== book.slots.sum ||
    slotMin !== book.slots.min || slotMax !== book.slots.max) return false
  if (fates.banked !== book.fates.banked || fates.held !== book.fates.held ||
    fates.zero !== book.fates.zero || fates.chainError !== book.fates.chainError ||
    fates.cut !== book.fates.cut) return false
  if (fates.banked + fates.held + fates.zero + fates.chainError + fates.cut !== book.slots.count) return false
  return true
}

/**
 * The stagger seat's own row (the v0.881.0 single-seat idiom): the
 * slots' census + their fates, the hold join's live classes. An
 * inconsistent book prices nothing; a face with no slots and no holds
 * reads the honest silence.
 */
export function finalBankStaggerRow (drainBook, holdBook, book) {
  if (!finalBankStaggerConsistent(drainBook, holdBook, book)) return null
  if (book.slots.count === 0 && book.join.holds === 0) return null
  const parts = []
  if (book.slots.count > 0) {
    const span = book.slots.min === book.slots.max
      ? `+${book.slots.min}s`
      : `+${book.slots.min}..+${book.slots.max}s`
    parts.push(`slots ${book.slots.count} (${span})`)
    const fates = []
    if (book.fates.banked > 0) fates.push(`banked ${book.fates.banked}`)
    if (book.fates.held > 0) fates.push(`held ${book.fates.held}`)
    if (book.fates.zero > 0) fates.push(`zero ${book.fates.zero}`)
    if (book.fates.chainError > 0) fates.push(`chain-error ${book.fates.chainError}`)
    if (book.fates.cut > 0) fates.push(`cut ${book.fates.cut}`)
    if (fates.length > 0) parts.push(`fates ${fates.join(', ')}`)
  }
  if (book.join.holds > 0) {
    const j = []
    if (book.join.pushed.count > 0) j.push(`pushed ${book.join.pushed.count}`)
    if (book.join.late.count > 0) j.push(`late ${book.join.late.count} (residual ${book.join.late.min}..${book.join.late.max} ticks)`)
    if (book.join.noStagger > 0) j.push(`no-stagger ${book.join.noStagger}`)
    if (book.join.blind > 0) j.push(`blind ${book.join.blind}`)
    if (j.length > 0) parts.push(`hold join ${j.join(', ')}`)
  }
  if (parts.length === 0) return null
  return `the final bank's own stagger seat (v0.888.0): ${parts.join(' - ')} - the slots' own fates price the flow-priced path, the hold join prices the slots' own share of the gate`
}
