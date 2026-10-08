//
// fleefork.mjs - THE FLEE FORK'S OWN SEAT (v0.810.0)
//
// The flee fork's death book rode raw since v0.459.0: the decompose prints
// 'chase N / crossfire M / no-verdict-attacker K' and the dist bands
// (close/mid/far/blind) beside them, but no row ever said WHICH fork owns
// the flee death book. Face 91 (run 37722166847) named the hole: 7 flee
// deaths, chase 6 / crossfire 1 - the chased side owned the book
// (85.7%) and the ownership rode unnamed, while the band verdict's own
// 'the split is open - read the rows' passed the question by.
//
// The two forks are the cure question's own fronts: CHASED means the mob
// kept its reach - the disengage that gains ground still loses the trade
// (the re-flee front); CROSSFIRE means the exit ran into a second
// hostile's own reach (the crossfire's own front). The no-verdict-attacker
// rows (the killer token vs the last verdict's attacker never joined) are
// the fork's honest blind - they count, they never own (the v0.802.0
// orphan seat's unattributed fence).
//
// fleeForkSeat(rows) folds the flee rows' chasedDown cells only, zero
// re-parsing (the rows come from the shelterledger census - the
// v0.802.0 seat law): the book is the two named cells' own sum; the
// strict-majority law, a tie owns nothing (the storm-has-no-seat
// precedent); junk never invents a fork - a row whose chasedDown is
// neither true, false nor null is skipped and counted (the honest-skip
// law, the real rows still tally).
//
// fleeForkRiders(rows) folds the dist bands (close/mid/far + the blind
// class) over ALL flee rows - measure-not-owner (the riders price the
// death-time distance's own mix, they never own the book), >=2 classes
// only (the solo-class fence), the byte order decides the ranked ties
// ('blind' < 'close' < 'far' < 'mid'), junk never invents a band.
//

const FORK_BANDS = ['blind', 'close', 'far', 'mid'] // the byte order's own ranking

/**
 * fleeForkSeat(rows) - the chased-down fork's own seat.
 * @param {Array<{chasedDown: boolean|null}>|null} [rows] the shelterledger
 *   census's own flee rows
 * @returns {null|{chase: number, crossfire: number, noVerdict: number,
 *   total: number, owner: null|'chased'|'crossfire', units: number,
 *   share: number, word: null|string, bad: number}} the seat (null on an
 *   empty named book)
 */
export function fleeForkSeat (rows) {
  if (!Array.isArray(rows)) return null
  let chase = 0
  let crossfire = 0
  let noVerdict = 0
  let bad = 0
  for (const r of rows) {
    const v = (r && typeof r === 'object') ? r.chasedDown : undefined
    if (v === true) chase++
    else if (v === false) crossfire++
    else if (v === null) noVerdict++
    else bad++
  }
  const total = chase + crossfire
  if (!total) return null
  const owner = chase > crossfire ? 'chased' : crossfire > chase ? 'crossfire' : null
  const units = owner === 'chased' ? chase : owner === 'crossfire' ? crossfire : 0
  const word = owner === 'chased'
    ? 'the chase kept its reach - the disengage that gains ground still loses the trade (the re-flee front)'
    : owner === 'crossfire'
      ? 'the exit ran into the second hostile\'s own reach - the crossfire\'s own front'
      : null
  return { chase, crossfire, noVerdict, total, owner, units, share: +(units / total).toFixed(3), word, bad }
}

/**
 * fleeForkSeatRow(rows) - the seat's row (the prose lives only in the
 * lib). A tie reads the no-owner row (the v0.806.0 seat's own
 * else-branch law, one row never both); an empty named book reads the
 * honest silence (null).
 * @param {Array<{chasedDown: boolean|null}>|null} [rows] the flee rows
 * @returns {null|string} the row (null when the seat is null)
 */
export function fleeForkSeatRow (rows) {
  const seat = fleeForkSeat(rows)
  if (!seat) return null
  if (!seat.owner) return 'no solo fork owns the flee death book (the tie owns nothing)'
  return `${seat.owner} owns ${seat.units} of ${seat.total} flee death(s) (${(seat.share * 100).toFixed(1)}%) - THE FORK'S OWN SEAT: ${seat.word}`
}

/**
 * fleeForkRiders(rows) - the dist bands' own measure over ALL flee rows.
 * @param {Array<{distBand: string|undefined|null}>|null} [rows] the flee rows
 * @returns {null|{total: number, top: Array<{cls: string, units: number}>,
 *   sum: number, share: number, bad: number}} the riders (null under the
 *   solo-class fence or on an empty book)
 */
export function fleeForkRiders (rows) {
  if (!Array.isArray(rows)) return null
  const cells = {}
  let bad = 0
  for (const r of rows) {
    const b = (r && typeof r === 'object') ? r.distBand : undefined
    if (b === 'close' || b === 'mid' || b === 'far') cells[b] = (cells[b] || 0) + 1
    else if (b === undefined || b === null) cells.blind = (cells.blind || 0) + 1
    else bad++
  }
  const classes = Object.keys(cells)
  if (classes.length < 2) return null
  const ranked = classes.map((c) => [c, cells[c]]).sort((a, b) => b[1] - a[1] ||
    (FORK_BANDS.indexOf(a[0]) - FORK_BANDS.indexOf(b[0])))
  const total = ranked.reduce((s, [, v]) => s + v, 0)
  const top = ranked.slice(0, 2)
  const sum = top.reduce((s, [, v]) => s + v, 0)
  return { total, top: top.map(([cls, units]) => ({ cls, units })), sum, share: +(sum / total).toFixed(3), bad }
}

/**
 * fleeForkRidersRow(rows) - the riders' row - fires only when the band
 * book holds two or more classes (the solo-class fence).
 * @param {Array<{distBand: string|undefined|null}>|null} [rows] the flee rows
 * @returns {null|string} the row
 */
export function fleeForkRidersRow (rows) {
  const r = fleeForkRiders(rows)
  if (!r) return null
  const pair = r.top.map(({ cls, units }) => `${cls} x${units}`).join(' + ')
  return `${pair} own ${r.sum} of ${r.total} flee death(s) (${(r.share * 100).toFixed(1)}%) - THE BANDS' OWN MEASURE: the death-time distance rides measured, not owning (the seat's measure-not-owner law)`
}
