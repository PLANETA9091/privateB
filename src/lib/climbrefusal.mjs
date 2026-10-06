//
// climbrefusal.mjs - THE REFUSAL'S WHY (v0.691.0)
//
// The climb-refusal seat's own anatomy. The walk's delivery read
// (tripcensus, v0.690.0) priced the drought's seat as two-legged - the
// flat walk AND the climb refusals (the face-28 read: 4 of 5 walks never
// started, F1 owned 3) - but the refusal line 'wood trip: 0 (climb
// refused)' names no cause. The cause rides the line the climb prints
// ONE line earlier (ensureSurface's own voice, the 1:1 shape: the climb
// fails -> the trip's else branch prints the refusal):
//
//   'F1 climb out (wood trip): failed - timeout (traversed 8)'
//   'F1 wood trip: 0 (climb refused)'
//
// The census joins them per bot: the refusal's why = the bot's most
// recent unconsumed 'climb out (wood trip): failed - X' reason (the
// reason class is the text before the first parenthetical - 'timeout'
// from 'timeout (traversed 8)'; 'wet wall' / 'wet-sentinel' / 'rescue
// owns the bot' ride whole). The consumed reason is spent: a second
// refusal with no fresh fail reads unexplained (the honest hole - the
// log cut or a non-climb refusal path). Lane isolation: a 'bank'-lane
// or 'pre-position'-lane climb fail never explains a wood trip's
// refusal (each lane's why-book stays its own). climbFails inventories
// every wood-trip climb fail (joined or not) - the face's full fail
// anatomy. Junk-safe null on non-input; a refusal-free face reads the
// honest zero shape. Pure: reads, never mutates. Zero fleet wiring
// (mining-surface only, the v0.379/.../v0.690.0 precedent) - the
// fleet's own climb byte is the filter-key, it already rides.
//

// the reason class: the text before the first parenthetical detail
const reasonClass = (raw) => raw.split(' (')[0].trim()

const WOOD_REFUSED_RE = /^([A-Za-z]\d+) wood trip: 0 \(climb refused\)$/
const WOOD_CLIMB_FAIL_RE = /^([A-Za-z]\d+) climb out \(wood trip\): failed - (.+)$/

const bump = (m, k) => { m[k] = (m[k] || 0) + 1 }

/**
 * woodRefusalCensus(lines) - the climb-refusal seat's why-book.
 *
 * @param {string[]|string} [lines] the face log (array or raw blob)
 * @returns {null|{refused: {n: number, byBot: object,
 *   reasons: object, unexplained: number},
 *   climbFails: {n: number, byBot: object, reasons: object}}}
 */
export function woodRefusalCensus (lines) {
  const src = Array.isArray(lines)
    ? lines
    : (typeof lines === 'string' ? lines.split('\n') : null)
  if (!src) return null
  const refused = { n: 0, byBot: {}, reasons: {}, unexplained: 0 }
  const climbFails = { n: 0, byBot: {}, reasons: {} }
  // the per-bot pending why: the most recent unconsumed wood-trip climb
  // fail (the 1:1 pair - consumed on join, spent reasons never explain twice)
  const pendingWhy = new Map()
  for (const line of src) {
    if (typeof line !== 'string') continue
    const fm = line.match(WOOD_CLIMB_FAIL_RE)
    if (fm) {
      climbFails.n++
      bump(climbFails.byBot, fm[1])
      const why = reasonClass(fm[2])
      bump(climbFails.reasons, why)
      pendingWhy.set(fm[1], why)
      continue
    }
    const rm = line.match(WOOD_REFUSED_RE)
    if (rm) {
      refused.n++
      bump(refused.byBot, rm[1])
      const why = pendingWhy.get(rm[1])
      if (why === undefined) refused.unexplained++
      else {
        bump(refused.reasons, why)
        pendingWhy.delete(rm[1]) // the why is spent - it explains exactly one refusal
      }
    }
  }
  return { refused, climbFails }
}
