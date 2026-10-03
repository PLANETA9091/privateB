// (v0.579.0) THE DEEP-STRAND PRICER - the deep anchor's decision seat.
//
// WHY: the bank arm census's first face (fleet 37154867210) read ALL 19
// bots never arming a bank pass while 527u rode the end pockets, and the
// arrival seat stayed silent all run - the fleet never walked the yard
// mid-run. The faces before it named the shape twice (fire 0439: 35
// vertical dooms, the yard 22-31 levels up, the climb priced 92-130s;
// fire 0430: pockets rode 1.8ku unbanked): the CLIMB TAX is the bank
// cadence's real cost, and the house's queued cure is THE DEEP ANCHOR -
// a mine-floor collection chest the arrival bots drain. The cure is
// expensive (chest placement, a drain arm, a haul chain); the house law
// prices a cure before it is built (the watch shelf's own precedent).
//
// THE SEAT: a post-run decode instrument, mining-surface only (the
// hop-census v0.379.0 precedent: zero fleet wiring, zero new log lines -
// the decode fire feeds it the run's own lines and the write-off's
// stranded units). ONE vocabulary: the climb lines are read through
// climbout's OWN census (v0.420.0), never re-parsed here - the classes
// cannot split from the lens's by construction.
//
// THE PRICE: the climb tax the run actually PAID (the census's secs sum -
// successful climbs' seconds, the undefineds shape's unknown price stays
// out the same way the lens keeps it) against the write-off's stranded
// units (the deadline write-off's own number - the mass that rode the
// end pockets because the bank never wanted). The row speaks only when
// BOTH grains hold: the family's count floor (3 climbs - the owner
// family's own trip shape) and the write-off family's own units grain
// (64u). Under either, the strand stays quiet - never a verdict the
// data cannot carry (the leanness law).
//
// Junk never enters: non-array lines, torn write-off numbers, negative
// sums - the honest zero, never a guessed price.

import { climbOutCensus } from './climbout.mjs'

// The count floor (the owner family's own trip shape): under 3 climbs the
// run did not pay a TAX, it paid an accident - the row stays quiet.
export const DEEP_STRAND_MIN_CLIMBS = 3

// The units grain: the write-off family's own floor (the drop census's
// DROP_RESOLVE_MIN_UNITS reads the same family law - one grain, one
// number, the drift impossible by construction).
export const DEEP_STRAND_MIN_UNITS = 64

/**
 * The deep strand's price: the climb tax the run paid against the mass
 * the bank never wanted.
 * @param {string[]} lines - the run's own log lines (climb-out lines among them)
 * @param {{units?: number, bots?: number}|null|undefined} writeOff - the deadline write-off's stranded mass
 * @returns {{climbs: number, taxSecs: number, maxTaxSecs: number, units: number, pays: boolean}|null}
 *   null when the strand is quiet (either grain unmet or junk input)
 */
export function deepStrandPrice (lines, writeOff) {
  const census = climbOutCensus(Array.isArray(lines) ? lines : [])
  const climbs = census?.secs?.n ?? 0
  const taxSecs = census?.secs?.sum ?? 0
  const maxTaxSecs = census?.secs?.max ?? 0
  const units = writeOff && typeof writeOff === 'object'
    ? (Number.isFinite(writeOff.units) && writeOff.units > 0 ? Math.floor(writeOff.units) : 0)
    : 0
  if (!Number.isFinite(taxSecs) || taxSecs < 0) return null
  const pays = climbs >= DEEP_STRAND_MIN_CLIMBS && units >= DEEP_STRAND_MIN_UNITS
  if (!pays) return null
  return { climbs, taxSecs, maxTaxSecs, units, pays }
}

/**
 * The decode row: the deep anchor's decision line, byte-stable. Returns
 * null when the strand is quiet (the leanness law - the caller prints
 * nothing and no verdict is invented the data cannot carry).
 * @param {string[]} lines
 * @param {{units?: number}|null|undefined} writeOff
 * @returns {string|null}
 */
export function deepStrandRow (lines, writeOff) {
  const p = deepStrandPrice(lines, writeOff)
  if (!p) return null
  const worst = p.maxTaxSecs > 0 ? ` (the dearest climb ${p.maxTaxSecs}s)` : ''
  return `deep strand: ${p.climbs} climbs paid ${p.taxSecs}s of climb tax, ${p.units}u rode the write-off${worst} - the deep anchor's seat is priced`
}
