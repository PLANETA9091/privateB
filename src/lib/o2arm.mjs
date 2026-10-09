//
// o2arm.mjs - THE ARM-O2'S OWN BOOK (v0.878.0)
//
// The rescue lane's own arm depth. The start line carries the emitter's
// oxygen byte - 'F1 [F1] water: drowning rescue start (drowning,
// oxygen N)' - unread since the rescue-ledger shipped (v0.368.0 counted
// the start CLASSES; the o2 census (v0.422.0) counted the PASSES' o2 -
// the starts' own air never rode a book). The o2-low threshold front's
// own price read (the v0.473.0 law: price before any wire): the arm's
// own band names the trigger's seat, the fatal arm names the lane's
// own loss.
//
// THE BANDS (the sentry census's own edges, never forked): blind (the
// oxygen byte rode -1 - the sensor died before the arm, the o2 census's
// own reset skin) / critical (o2 <= 4 - the census's critical band's
// own edge) / band (5..9 - the inside of the census's rescueBand) /
// headroom (o2 >= 10 - at-or-past the rescueBand's own edge).
//
// THE JOIN LAW (o2gap's own shape): the LATEST start at-or-before the
// death's line index joins (line order is the truth; a later life's
// arm never joins an earlier death; a newer start resets the older arm
// whole - the latest start wins). THE DEATH RESET: an arm never
// survives the death it joined - a later death with no new start rides
// unarmed (the lane's own reset owns the gap, the honest null).
//
// THE COUNTS RIDE THE DEATH LINE (the pagelead law): a bot that drowns
// twice owns two deaths; the perDeath map stays last-wins (o2gap's own
// house wart) - the riders row reads the map, the counts never do.
//
// THE VERDICT SEATS (per death): blind (the arm rode the sensor's own
// death - the trigger's constant is moot while the arm rides blind, the
// sensor's health is the front) / critical (the lane armed at the
// damage window - the constant must ride higher, the o2-low front's own
// lever) / band (the constant has the seat - the lane's own execution
// prices the loss) / headroom (the arm rode with air - the execution
// owns the loss, the constant is not the lever) / unarmed (no arm since
// the last death - the trigger itself never fired for this drowning).
//
// Reuse law: the death grammar is o2gap's DROWN_CONTEXT_RE (one parser
// per emitter - never forked); the ONLY new byte is ARM_O2_RE - the
// start line's own oxygen, read whole-anchored (junk-safe: a caller
// prefix or a caller suffix never rides it). Mining-surface only: zero
// fleet wiring, zero new log lines. Junk-safe end to end: non-object
// o2g / non-array lines / zero deaths read null (the row stays silent -
// the v0.379.0 precedent); non-string lines are skipped; an
// inconsistent book prices nothing (the fence law). Pure: reads, never
// mutates.
//
import { DROWN_CONTEXT_RE } from './o2gap.mjs'

/** The rescue start's own oxygen byte - the emitter's exact line, read
 * whole-anchored. The blind skin rides -1 (the sensor's own death
 * before the arm). */
export const ARM_O2_RE = /^(F\d+) \[\1\] water: drowning rescue start \(drowning, oxygen (-1|\d+)\)$/

/** The sentry census's own critical edge (o2 <= 4). */
export const ARM_CRITICAL_MAX = 4

/** The sentry census's own rescueBand edge (o2 >= 10 = headroom). */
export const ARM_HEADROOM_MIN = 10

/**
 * The arm's own band - the sentry census's own edges, never forked.
 *
 * @param {number|null} o2 the start's oxygen (null = the blind -1 byte)
 * @returns {'blind'|'critical'|'band'|'headroom'}
 */
export function armBand (o2) {
  if (o2 === null) return 'blind'
  if (o2 <= ARM_CRITICAL_MAX) return 'critical'
  if (o2 < ARM_HEADROOM_MIN) return 'band'
  return 'headroom'
}

/**
 * The arm-o2's own book: every rescue start's oxygen folded into the
 * band census (the trigger's own arm depth), every drown death joined
 * with the latest start's own arm (the fatal arm).
 *
 * @param {object|null} o2g o2Gap's own fold (the death join's grammar -
 *   one parser, never forked)
 * @param {string[]} lines the face log (array - entrywindow's own fence;
 *   a raw blob reads null, the caller splits first)
 * @returns {{starts: number, blindArms: number,
 *   bands: {blind: number, critical: number, band: number, headroom: number},
 *   spread: {min: number, max: number, avg: number, count: number}|null,
 *   perBot: Object<string, number>,
 *   seat: {band: string, n: number, total: number}|null,
 *   deaths: number,
 *   verdicts: {blind: number, critical: number, band: number,
 *   headroom: number, unarmed: number},
 *   perDeath: Object<string, {o2: number|null, band: string}>}|null}
 */
export function o2ArmBook (o2g, lines) {
  if (!o2g || typeof o2g !== 'object') return null
  if (!Array.isArray(lines)) return null
  if (!Number.isFinite(o2g.deaths) || o2g.deaths <= 0) return null
  // the arm side: the latest start wins whole (line order is the truth)
  const armByBot = {}
  const perBot = {}
  const bands = { blind: 0, critical: 0, band: 0, headroom: 0 }
  const o2Vals = []
  let starts = 0
  let blindArms = 0
  // the death side: the counts ride the death line (the pagelead law)
  const perDeath = {}
  const verdicts = { blind: 0, critical: 0, band: 0, headroom: 0, unarmed: 0 }
  let deaths = 0
  for (const l of lines) {
    if (typeof l !== 'string') continue
    const sm = ARM_O2_RE.exec(l)
    if (sm) {
      const bot = sm[1]
      const blind = sm[2] === '-1'
      const o2 = blind ? null : Number(sm[2])
      const band = armBand(o2)
      armByBot[bot] = { o2, band }
      perBot[bot] = (perBot[bot] || 0) + 1
      starts++
      bands[band]++
      if (o2 !== null) o2Vals.push(o2)
      if (blind) blindArms++
      continue
    }
    const dm = DROWN_CONTEXT_RE.exec(l)
    if (!dm) continue
    deaths++
    const bot = dm[1]
    // the join law: the latest start at-or-before the death (line
    // order); THE DEATH RESET: the arm never survives the death it
    // joined - a later death with no new start rides unarmed
    const arm = armByBot[bot] || null
    const band = arm ? arm.band : 'unarmed'
    verdicts[band]++
    perDeath[bot] = { o2: arm ? arm.o2 : null, band }
    delete armByBot[bot]
  }
  // the one-grammar law: two walks of one grammar must agree - a
  // mismatch names a forked reader and prices nothing (the fence law)
  if (deaths !== o2g.deaths) return null
  const spread = o2Vals.length
    ? {
        min: Math.min(...o2Vals),
        max: Math.max(...o2Vals),
        avg: o2Vals.reduce((a, b) => a + b, 0) / o2Vals.length,
        count: o2Vals.length
      }
    : null
  // the arm seat: the strict-majority law (the tie reads the spread)
  let seat = null
  const seatEntries = Object.entries(bands).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
  if (seatEntries.length && starts > 0 && seatEntries[0][1] * 2 > starts) {
    seat = { band: seatEntries[0][0], n: seatEntries[0][1], total: starts }
  }
  return {
    starts,
    blindArms,
    bands,
    spread,
    perBot,
    seat,
    deaths,
    verdicts,
    perDeath
  }
}

/**
 * The fence: an inconsistent book prices nothing (the fence law - a
 * fold that cannot prove itself is junk, not evidence). The laws: one
 * death or more; the bands sum to the starts; the blind census agrees
 * two ways; the verdicts sum to the deaths; the spread band honest;
 * every rider's band a legal verdict band.
 *
 * @param {object|null} [b] the o2ArmBook fold
 * @returns {boolean} true when the book may price
 */
export function o2ArmBookConsistent (b) {
  if (!b || typeof b !== 'object') return false
  if (!Number.isInteger(b.deaths) || b.deaths <= 0) return false
  if (!Number.isInteger(b.starts) || b.starts < 0) return false
  if (!Number.isInteger(b.blindArms) || b.blindArms < 0) return false
  const bandSum = Object.values(b.bands || {}).reduce((a, v) => a + v, 0)
  if (bandSum !== b.starts) return false
  if ((b.bands || {}).blind !== b.blindArms) return false
  const verdictSum = Object.values(b.verdicts || {}).reduce((a, v) => a + v, 0)
  if (verdictSum !== b.deaths) return false
  if (b.spread !== null) {
    if (!(b.spread.min <= b.spread.max)) return false
    if (!Number.isFinite(b.spread.avg)) return false
  }
  for (const v of Object.values(b.perDeath || {})) {
    if (!v || typeof v !== 'object') return false
    if (!(v.band in b.verdicts)) return false
  }
  return true
}

/**
 * The book's own row - one line, the fold's field read. The honest null
 * when the book is absent or inconsistent (a fold that cannot prove
 * itself prices nothing - the fence law).
 *
 * @param {object|null} [b] the o2ArmBook fold
 * @returns {string|null} the row byte, or null
 */
export function o2ArmBookRow (b) {
  if (!o2ArmBookConsistent(b)) return null
  const seatByte = b.seat
    ? `arm seat: ${b.seat.band} owns ${b.seat.n} of ${b.seat.total} (${((b.seat.n / b.seat.total) * 100).toFixed(1)}%)`
    : 'arm seat: the spread is the shape (no strict majority)'
  let spreadByte
  if (b.spread === null) {
    spreadByte = 'no numeric arm rode' + (b.blindArms > 0 ? ` (blind arms ${b.blindArms})` : '')
  } else {
    spreadByte = `o2 ${b.spread.min}..${b.spread.max} avg ${b.spread.avg.toFixed(1)} (${b.spread.count} numeric arm(s)${b.blindArms > 0 ? `, blind ${b.blindArms}` : ''})`
  }
  const v = b.verdicts
  let verdictByte
  if (v.unarmed > 0) verdictByte = 'a death rode with no arm since the last death - the lane\'s own reset owns the gap'
  else if (v.blind > 0) verdictByte = 'the blind arm prices nothing - the sensor\'s own seat owns the lane (the sensor\'s health is the front, the trigger\'s constant is moot while the arm rides blind)'
  else if (v.critical > 0) verdictByte = 'the lane armed at the damage window - the trigger\'s constant must ride higher (the o2-low front\'s own lever)'
  else if (v.band > 0) verdictByte = 'the lane armed inside the band - the constant has the seat, the lane\'s own execution prices the loss'
  else verdictByte = 'the arms rode with headroom - the lane\'s own execution owns the losses (the constant is not the lever)'
  return `the rescue arm's own o2 book (v0.878.0): ${b.starts} arm(s) - ${spreadByte} - ${seatByte} - the fatal arm(s): blind ${v.blind} / critical ${v.critical} / band ${v.band} / headroom ${v.headroom} / unarmed ${v.unarmed} - ${verdictByte}`
}

/**
 * The riders row - the per-death bracket line (the house bill idiom):
 * the arm that joined and the band it rode, or the honest no-arm. Bots
 * ride line order (the truth); the map stays last-wins (o2gap's own
 * house wart - the counts never fold from it).
 *
 * @param {object|null} [b] the o2ArmBook fold
 * @returns {string|null} the riders byte, or null
 */
export function o2ArmBookRidersRow (b) {
  if (!o2ArmBookConsistent(b)) return null
  const bits = Object.entries(b.perDeath).map(([bot, v]) => {
    if (v.band === 'unarmed') return `${bot} [no arm - unarmed]`
    return `${bot} [arm o2 ${v.o2 === null ? -1 : v.o2} - ${v.band}]`
  })
  return bits.length ? bits.join(' ') : null
}
