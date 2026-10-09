//
// drainthird.mjs - THE DRAIN'S OWN THIRD BOOK (v0.883.0)
//
// The death drops' own u rides the clock's thirds at last. The existing
// lenses each price one face of the deadline: the end-phase tax (v0.675.0)
// prices the final 60s' UNITS, the siege thirds (v0.733.0) price the death
// COUNTS by the clock's thirds, the leak clock (v0.472.0) splits the LEAK
// share by thirds, the kind join (v0.854.0) prices WHICH KIND owns each
// third - the DROPS' OWN U never rode a third. The face-145 fold (run
// 37947835629, mined by the fire-2340 lens) prices the front: 406u of 566u
// (72%, 4 of 6 deaths) drained in the late third - the deadline's own drain
// is the u's shape, not just the deaths' count.
//
// THE JOIN rides the log's own adjacency (the death clock's v0.407.0 law by
// reuse): every 'death drop' line joins the last heartbeat's ts seen before
// it (HB_RE, the one-parser law - the same clock sealdeath's thirds ride).
// The thirds cut rides the v0.733.0 law (thirdS = clockEnd/3, t < thirdS
// strict - the boundary second belongs to the LATER third, the zero clock's
// own cut). The verdict seat rides thirdsVerdict (v0.407.0's own law - one
// verdict law, never forked) over the PLACED u sums.
//
// THE CLOCK NEVER INVENTS: a drop before the first hb stays untimed and
// rides 'unplaced' (the u stays honest in the totals, outside the seat);
// the empty-pocket form counts (a death is a death, the u stays 0); no
// clock end or zero deaths read the honest silence (null - the v0.379.0
// precedent). THE DRAIN'S OWN LEVER: the late third's u share prices the
// bank lane's own front (bank before the third turns - the dusk-bank's own
// seat). Mining-surface only: zero fleet wiring, zero new log lines - the
// v0.379.0 precedent. Pure: reads, never mutates. Junk-safe: non-string
// lines judge nothing; an inconsistent book prices nothing (the fence law).
//
import { HB_RE, SEAL_DEATH_LOSS_RE, SEAL_DEATH_EMPTY_RE, thirdsVerdict } from './sealdeath.mjs'

/**
 * The drain's own third book: every death drop's u folded into the clock's
 * own thirds.
 *
 * @param {string[]|string} [lines] the face log (a raw blob splits like the
 *   census convention)
 * @returns {null|{drops: number, emptyReads: number, lostTotal: number,
 *   clockEnd: number, thirdS: number,
 *   thirds: {early: {u: number, n: number}, mid: {u: number, n: number},
 *            late: {u: number, n: number}},
 *   unplaced: {u: number, n: number},
 *   seat: {cls: string, dom: number, dominant: boolean, share: number,
 *          counts: Object<string, number>, total: number}|null,
 *   lateUShare: number|null}} null = the honest silence (no clock end or
 *   zero deaths); lateUShare = round(100*late.u/lostTotal) (null on the
 *   zero-u face - the honest zero never divides).
 */
export function drainThirdBook (lines) {
  const rows = Array.isArray(lines)
    ? lines
    : (typeof lines === 'string' ? lines.split('\n') : [])
  if (!Array.isArray(rows)) return null
  let lastT = null
  let clockEnd = null
  let drops = 0
  let emptyReads = 0
  let lostTotal = 0
  // the drops collect first (the thirdkind law by reuse): the thirds cut
  // prices against the FACE'S OWN final clock end, never the running clock
  // a mid-walk hb would hand the early drops
  const timed = []
  for (const l of rows) {
    if (typeof l !== 'string') continue
    const hm = l.match(HB_RE)
    if (hm) { lastT = Number(hm[1]); clockEnd = lastT; continue }
    const lm = l.match(SEAL_DEATH_LOSS_RE)
    if (lm) {
      drops++
      lostTotal += Number(lm[2])
      timed.push({ u: Number(lm[2]), empty: false, ts: lastT })
      continue
    }
    const em = l.match(SEAL_DEATH_EMPTY_RE)
    if (em) {
      emptyReads++
      timed.push({ u: 0, empty: true, ts: lastT })
    }
  }
  // the honest silence: no clock end (no hb) or zero deaths prices nothing
  if (clockEnd === null || (drops + emptyReads) === 0) return null
  const thirdS = clockEnd / 3
  const thirds = { early: { u: 0, n: 0 }, mid: { u: 0, n: 0 }, late: { u: 0, n: 0 } }
  const unplaced = { u: 0, n: 0 }
  for (const r of timed) {
    if (r.ts === null) { unplaced.u += r.u; unplaced.n++; continue }
    const w = r.ts < thirdS ? 'early' : r.ts < 2 * thirdS ? 'mid' : 'late'
    thirds[w].u += r.u
    thirds[w].n++
  }
  // the verdict seat rides the placed u sums (the v0.407.0 law, never
  // forked) - the unplaced u stays outside the seat, honest in the totals
  const seat = thirdsVerdict({ early: thirds.early.u, mid: thirds.mid.u, late: thirds.late.u }, lostTotal - unplaced.u)
  const lateUShare = lostTotal > 0 ? Math.round((100 * thirds.late.u) / lostTotal) : null
  return {
    drops,
    emptyReads,
    lostTotal,
    clockEnd,
    thirdS: clockEnd / 3,
    thirds,
    unplaced,
    seat,
    lateUShare
  }
}

/**
 * The fence: an inconsistent book prices nothing (the fence law). The
 * laws: the u sums agree (early+mid+late+unplaced = lostTotal); the death
 * counts agree (the thirds' n + unplaced n = drops+emptyReads); the clock
 * finite positive; the seat's own total reads the placed u; the late share
 * prices against the lost total.
 *
 * @param {object|null} [b] the drainThirdBook fold
 * @returns {boolean} true when the book may price
 */
export function drainThirdConsistent (b) {
  if (!b || typeof b !== 'object') return false
  if (!Number.isInteger(b.drops) || b.drops < 0) return false
  if (!Number.isInteger(b.emptyReads) || b.emptyReads < 0) return false
  if (!Number.isFinite(b.lostTotal) || b.lostTotal < 0) return false
  if (!Number.isFinite(b.clockEnd) || b.clockEnd <= 0) return false
  if (!Number.isFinite(b.thirdS) || b.thirdS <= 0) return false
  const t = b.thirds
  if (!t || !t.early || !t.mid || !t.late) return false
  for (const w of ['early', 'mid', 'late']) {
    if (!Number.isFinite(t[w].u) || t[w].u < 0) return false
    if (!Number.isInteger(t[w].n) || t[w].n < 0) return false
  }
  if (!b.unplaced || !Number.isFinite(b.unplaced.u) || b.unplaced.u < 0) return false
  if (!Number.isInteger(b.unplaced.n) || b.unplaced.n < 0) return false
  const uSum = t.early.u + t.mid.u + t.late.u + b.unplaced.u
  if (uSum !== b.lostTotal) return false
  const nSum = t.early.n + t.mid.n + t.late.n + b.unplaced.n
  if (nSum !== b.drops + b.emptyReads) return false
  const placedU = t.early.u + t.mid.u + t.late.u
  if (b.seat && b.seat.total !== placedU) return false
  if (b.lostTotal > 0) {
    if (!Number.isInteger(b.lateUShare) || b.lateUShare < 0 || b.lateUShare > 100) return false
    if (b.lateUShare !== Math.round((100 * t.late.u) / b.lostTotal)) return false
  } else if (b.lateUShare !== null) return false
  return true
}

/** The seat's own lever byte - the verdict class names the bank lane's own
 * front (the dusk-bank's own seat). */
function drainLeverByte (b) {
  const cls = b.seat ? b.seat.cls : 'none'
  if (cls === 'late') return 'THE DEADLINE\'S OWN DRAIN: the drops\' own u rides the storm third - the bank lane\'s own lever prices here (bank before the third turns)'
  if (cls === 'mid') return 'THE MIDDLE\'S OWN DRAIN: the drops\' own u rides the face\'s middle - the bank lever\'s seat moved with the storm'
  if (cls === 'early') return 'THE OPENING\'S OWN DRAIN: the drops\' own u rides the face\'s opening - the bank lever\'s seat moved with the start'
  if (cls === 'spread') return 'THE DRAIN SPREADS: no third owns the drops\' own u - the lever\'s seat reads the face\'s own shape'
  if (cls === 'even') return 'THE DRAIN\'S TIE: the thirds split the drops\' own u evenly - the lever has no seat this face'
  return 'THE DRAIN\'S SILENCE: no u rode the clock - the drops rode empty pockets'
}

/**
 * The book's own row - one line, the fold's field read. The honest null
 * when the book is absent or inconsistent (the fence law).
 *
 * @param {object|null} [b] the drainThirdBook fold
 * @returns {string|null} the row byte, or null
 */
export function drainThirdRow (b) {
  if (!drainThirdConsistent(b)) return null
  const t = b.thirds
  const deaths = b.drops + b.emptyReads
  const emptyByte = b.emptyReads > 0 ? ` (${b.emptyReads} empty read(s))` : ''
  const unplacedByte = b.unplaced.u > 0 || b.unplaced.n > 0
    ? ` + unplaced ${b.unplaced.u}u (${b.unplaced.n})`
    : ''
  const shareByte = b.lateUShare === null ? 'the late share reads the honest zero' : `the late third owns ${b.lateUShare}%`
  return `the drain's own third book (v0.883.0): ~${b.lostTotal}u lost at ${deaths} death(s)${emptyByte} - early ${t.early.u}u (${t.early.n}) / mid ${t.mid.u}u (${t.mid.n}) / late ${t.late.u}u (${t.late.n})${unplacedByte} - ${shareByte} - ${drainLeverByte(b)}`
}
