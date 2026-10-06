//
// whalewater.mjs - THE WHALE'S WATER BILL (v0.698.0)
//
// The loop ledger (v0.692.0) prices the zero-yield swim loop per bot;
// the rescue ledger prices the rescue lane per bot - but no row joins
// them, and the 31st flight (37452538949) is the coincidence's own
// face: F10 spent 92 launches (top target [-143,405] x38) across 8
// stalls with EVERY paired gain 0.0 - the face's second whale after
// the 24th's F12 (152 launches) - and the SAME bot owns the face's
// TOP rescue-start seat (13 starts, F8's 9 the next). The loop bought
// no ground and the rescue lane's busiest customer is the whale itself.
//
// The bill joins the two existing ledgers per bot (zero new regexes -
// the one-parser law by reuse: transitLoopLedger's whale verdict and
// rescueLedger's perBot starts, both imported):
//   bill = { bot, launches, starts, rank, spenders }
//   rank 1 = the whale is the face's TOP rescue spender; null = the
//   whale never called the rescue (THE DRY WHALE - the loop bought no
//   ground and never asked for help - the honest fork, never faked to
//   rank 0).
// Silence law: no whale, no bill (the loop ledger's own law inherits);
// the rescue table still returns (the face's spenders stay data).
// Junk-safe null on non-input. Pure: reads, never mutates. Zero fleet
// wiring (mining-surface only, the v0.379/.../v0.697.0 precedent).
//

import { transitLoopLedger } from './transitloop.mjs'
import { rescueLedger } from './rescue-ledger.mjs'

/**
 * whaleWaterBill(lines) - the whale's rescue-side bill: does the
 * zero-gain swim loop own the face's rescue lane too?
 *
 * @param {string[]|string} [lines] the face log (array or raw blob)
 * @returns {null|{table: Array<[string, number]>,
 *   whale: object|null,
 *   bill: null|{bot: string, launches: number, starts: number,
 *   rank: number|null, spenders: number}}}
 */
export function whaleWaterBill (lines) {
  const src = Array.isArray(lines)
    ? lines
    : (typeof lines === 'string' ? lines.split('\n') : null)
  if (!src) return null
  const rescue = rescueLedger(src)
  const table = Object.entries(rescue.perBot || {})
    .map(([bot, r]) => [bot, r.starts || 0])
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  const ledger = transitLoopLedger(src)
  const whale = (ledger && ledger.whale) || null
  if (!whale) return { table, whale: null, bill: null }
  const starts = (rescue.perBot[whale.bot] && rescue.perBot[whale.bot].starts) || 0
  const rank = table.findIndex(([b]) => b === whale.bot) + 1
  return {
    table,
    whale,
    bill: {
      bot: whale.bot,
      launches: whale.launches,
      starts,
      rank: rank > 0 ? rank : null,
      spenders: table.length
    }
  }
}
