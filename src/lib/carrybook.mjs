//
// carrybook.mjs - THE DRY TRIP'S OWN ARM (v0.817.0)
//
// The famine census (v0.687.0) prices the starvation itself and the lane
// seat (v0.814.0) names WHICH lane owns the book - but the food lane's own
// CURE, the food commons walk (the plate refill ladder, the v0.524.0
// mid-field rider's own slice), ends every dry trip in ONE terminal byte
// and the byte's own split rode unnamed:
//
//   'F2 food commons: the plate stays empty (commons empty) - the next
//    trip retries'
//   'F11 food commons: the plate stays empty (no chest reached) - the next
//    trip retries'
//
// The two reasons are TWO ARMS and they price OPPOSITE cures:
//
//   'commons empty'    -> THE SHELF ARM: the trip REACHED chests and they
//                         stood bare - the tithe's own gap; the food income
//                         front prices the refill (get food INTO chests)
//   'no chest reached' -> THE REACH ARM: the trip never ARRIVED at any
//                         chest - the walk's own gap; the pathing front
//                         prices the path
//
// The terminal only (the double-book law): the mid-loop budget note
// 'budget spent (x/y units)' is NOT the terminal - a budget-dead trip
// still prints its own stays-empty terminal at return (the face-92 read:
// F2's 'budget spent (0/6 units)' rode WITH 'commons empty' on the same
// trip) - counting both would double-book the trip. One dry trip, one
// terminal, one row in the book.
//
// The census's own cells only, zero re-parsing (the v0.802.0 orphan seat's
// own law, the v0.814.0 lane seat's own shape): the book is the two arms'
// own terminal tallies. The strict-majority law: an arm owns only when it
// holds MORE than the rest of the book together - a tie owns nothing (the
// v0.784.0 kind-seat's own law; a two-arm book's only no-seat shape is the
// even split). The byte order decides the ranked tie - 'reach' 0x72 sorts
// before 'shelf' 0x73. The lone-arm face reads the seat at its own 100%
// (the singular arm's own precedent - the lone lane's, the lone famine
// noun's). The riders are the pair measure-not-owner and only 2 kinds form
// a crowd (the v0.807.0 law). Junk never invents an arm: a non-object
// census, a non-finite or non-positive count, or a zero book reads the
// honest silence (null).
//
// Mining-surface only: zero fleet wiring, zero new log lines - the byte
// already rides (the fleet19 emitter's own dry terminal). The row rides
// the decompose's own additive block beside the famine census (the branch
// law: seat XOR riders, one row never both - the climb shape, the branch
// lives at the print site).
//

// the dry-trip byte: the fleet19 emitter's own terminal, verbatim - the
// bot id rides the line head (the trip voice's own skin), the reason is
// the emitter's own two-word vocabulary, the tail is the retry's own vow
const DRY_TRIP_RE = /^([A-Za-z]\d+) food commons: the plate stays empty \((commons empty|no chest reached)\) - the next trip retries$/

/**
 * dryTripCensus(lines) - the carry drought's own terminal anatomy.
 *
 * @param {string[]|string} [lines] the face log (array or raw blob)
 * @returns {null|{shelf: number, reach: number}}
 *   the two arms' own tallies (null on junk input; the zero shape on a
 *   face with no dry terminal - the calm face never invents a drought)
 */
export function dryTripCensus (lines) {
  const src = Array.isArray(lines)
    ? lines
    : (typeof lines === 'string' ? lines.split('\n') : null)
  if (!src) return null
  const out = { shelf: 0, reach: 0 }
  for (const line of src) {
    if (typeof line !== 'string') continue
    const m = line.match(DRY_TRIP_RE)
    if (!m) continue
    if (m[2] === 'commons empty') out.shelf++
    else out.reach++
  }
  return out
}

// the arms' own cells - the census's own two tallies, the non-finite or
// non-positive cell skipped (the junk never prices), the byte order holds
// the ranked tie ('reach' 0x72 < 'shelf' 0x73)
function dryTripCells (dt) {
  if (!dt || typeof dt !== 'object') return null
  const cells = []
  if (Number.isFinite(dt.shelf) && dt.shelf > 0) cells.push(['shelf', dt.shelf])
  if (Number.isFinite(dt.reach) && dt.reach > 0) cells.push(['reach', dt.reach])
  if (cells.length === 0) return null
  const total = cells.reduce((s, [, n]) => s + n, 0)
  if (!(total > 0)) return null
  cells.sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
  return { cells, total }
}

/**
 * dryTripSeat(dt) - the dry trip's own seat.
 * @param {Object<string, number>|null} [dt] the census's own {shelf, reach}
 * @returns {null|{arm: string, owns: number, ofTrips: number,
 *   shareOfTrips: number}} the strict-majority owner, or null when no arm
 *   holds more than the rest together (the even split's own silence)
 */
export function dryTripSeat (dt) {
  const t = dryTripCells(dt)
  if (!t) return null
  const [arm, topN] = t.cells[0]
  if (topN > t.total - topN) {
    return { arm, owns: topN, ofTrips: t.total, shareOfTrips: topN / t.total * 100 }
  }
  return null
}

/**
 * dryTripRiders(dt) - the dry trip's own riders (the top-two pair when the
 * print site needs the measure-not-owner row; a lone arm is no crowd and
 * reads null).
 * @param {Object<string, number>|null} [dt] the census's own {shelf, reach}
 * @returns {null|{leader: string, leaderOwns: number, runner: string,
 *   runnerOwns: number, ofTrips: number, pairOwns: number,
 *   shareOfTrips: number, duet: string}}
 */
export function dryTripRiders (dt) {
  const t = dryTripCells(dt)
  if (!t || t.cells.length < 2) return null
  const [leader, leaderOwns] = t.cells[0]
  const [runner, runnerOwns] = t.cells[1]
  const pairOwns = leaderOwns + runnerOwns
  return {
    leader, leaderOwns, runner, runnerOwns,
    ofTrips: t.total, pairOwns,
    shareOfTrips: pairOwns / t.total * 100,
    duet: `the ${leader} x${leaderOwns} + the ${runner} x${runnerOwns}`,
  }
}

// The arm's own prose label - the seat's owner rides the census's own
// vocabulary ('the shelf' / 'the reach', the emitter's own reason words)
const ARM_WORD = { shelf: 'the shelf', reach: 'the reach' }

// The arm's own finding - the tail the row prints after the seat's name
// (the two arms price OPPOSITE cures - the words law)
function armWord (arm) {
  return arm === 'shelf'
    ? 'THE SHELF\'S OWN GAP: the chests the trip reached stood bare - the tithe\'s own front prices the refill the raw reason rode unnamed'
    : 'THE REACH\'S OWN GAP: the trip never arrived at any chest - the walk\'s own front prices the path the raw reason rode unnamed'
}

// The seat row - the byte-exact read the decompose prints beside the dry
// trip census (the branch law: the owner case leaves the companion
// unprinted). Guarded end to end; junk reads null (v0.817.0).
export function dryTripSeatRow (seat) {
  if (!seat || typeof seat !== 'object') return null
  const { arm, owns, ofTrips, shareOfTrips } = seat
  if (arm !== 'shelf' && arm !== 'reach') return null
  if (!Number.isFinite(owns) || owns <= 0) return null
  if (!Number.isFinite(ofTrips) || ofTrips <= 0) return null
  if (owns > ofTrips) return null
  if (!Number.isFinite(shareOfTrips)) return null
  const s = ofTrips === 1 ? 'dry trip' : 'dry trips'
  return `the dry trip's own arm (v0.817.0): ${ARM_WORD[arm]} owns ${owns} of ${ofTrips} ${s} (${shareOfTrips.toFixed(1)}%) - ${armWord(arm)}`
}

// The riders row - the byte-exact read for the no-owner faces (v0.817.0).
export function dryTripRidersRow (r) {
  if (!r || typeof r !== 'object') return null
  const { leader, leaderOwns, runner, runnerOwns, ofTrips, pairOwns, shareOfTrips, duet } = r
  if (leader !== 'shelf' && leader !== 'reach') return null
  if (runner !== 'shelf' && runner !== 'reach') return null
  if (leader === runner) return null
  if (!Number.isFinite(leaderOwns) || leaderOwns <= 0) return null
  if (!Number.isFinite(runnerOwns) || runnerOwns <= 0) return null
  if (!Number.isFinite(ofTrips) || ofTrips <= 0) return null
  if (!Number.isFinite(pairOwns) || pairOwns <= 0) return null
  if (pairOwns > ofTrips) return null
  if (typeof duet !== 'string' || duet === '') return null
  if (!Number.isFinite(shareOfTrips)) return null
  const s = ofTrips === 1 ? 'dry trip' : 'dry trips'
  return `the dry trip's own riders (v0.817.0): no solo arm owns the majority - ${duet} own ${pairOwns} of ${ofTrips} ${s} (${shareOfTrips.toFixed(1)}%) - THE DRY TRIP'S OWN TIE: the seat's tie law held, the arms' own crowd prices the drought the solo law refused to name`
}
