//
// o2book.mjs - THE O2 BOOK'S OWN CLASS (v0.813.0)
//
// The o2-reset death census (v0.379.0) folds the drown contexts whose
// sensor died - the 'o2 reset(-1)' skin - and prints the form split raw
// (rescue never = the trigger itself blind, rescue active = the lane flew
// blind). But no row ever said WHICH class OWNS the book: face 91 rode the
// 1-1 tie (F4 rescue active, F3 rescue never) and the tie rode unnamed,
// while the cure wire prices off the form split - the never lane is the
// arm's own gap (the rescue stayed holstered; arming the rescue on the
// mirror's last-known o2 fixes it), the active lane is the arm's own loss
// (the rescue armed and the water kept - a different cure).
//
// o2ClassSeat(cells) prices the seat: the two named cells only (never,
// active - the census's own fold, zero re-parsing, the v0.802.0 seat law);
// the book is the cells' own sum; the strict-majority law, a tie owns
// nothing (the v0.806.0 no-owner row's own law); junk never invents a
// class - a non-finite or negative cell is skipped and counted (the bad
// cell rides the seat's own alarm, the real cells still tally), an empty
// book reads the honest silence (null).
//
// Mining-surface only: zero fleet wiring, zero new log lines - the row
// rides the decompose's census block beside the raw split.
//

/**
 * o2ClassSeat(cells) - the o2 book's own class seat.
 * @param {Object<string, number>|null} [cells] the census's own {never, active}
 * @returns {null|{total: number, owner: null|string, units: number,
 *   share: number, word: null|string, bad: number}}
 *   the seat (null on an empty book)
 */
export function o2ClassSeat (cells) {
  const c = (cells && typeof cells === 'object' && !Array.isArray(cells)) ? cells : {}
  const picked = []
  let bad = 0
  for (const k of ['never', 'active']) {
    const v = c[k]
    if (v === undefined) continue
    if (!Number.isFinite(v) || v < 0) { bad++; continue }
    if (v === 0) continue
    picked.push([k, v])
  }
  if (!picked.length) return null
  picked.sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
  const total = picked.reduce((s, [, v]) => s + v, 0)
  const [topCls, topUnits] = picked[0]
  const tie = picked.length > 1 && picked[1][1] === topUnits
  // the owner rides the census's own prose label (the v0.379.0 split row's
  // own vocabulary: 'rescue never' / 'rescue active')
  const owner = tie ? null : topCls === 'never' ? 'rescue never' : 'rescue active'
  const units = tie ? 0 : topUnits
  const word = tie
    ? null
    : topCls === 'never'
      ? 'the rescue stayed holstered - the arm\'s own gap is the front (the sensor died and the trigger never armed)'
      : 'the rescue armed and lost the trade - the water kept what the arm reached (the lane\'s own front)'
  return { total, owner, units, share: total ? +(units / total).toFixed(3) : 0, word, bad }
}

/**
 * o2ClassSeatRow(cells) - the seat's row (the prose lives only in the lib).
 * @param {Object<string, number>|null} [cells] the census's own {never, active}
 * @returns {null|string} the row (null on an empty book)
 */
export function o2ClassSeatRow (cells) {
  const seat = o2ClassSeat(cells)
  if (!seat) return null
  if (!seat.owner) return 'no solo class owns the o2 book (the tie owns nothing)'
  return `${seat.owner} owns ${seat.units} of ${seat.total} o2-reset drown(s) (${(seat.share * 100).toFixed(1)}%) - THE O2 BOOK'S OWN CLASS: ${seat.word}`
}
