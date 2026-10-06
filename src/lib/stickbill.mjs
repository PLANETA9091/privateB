//
// stickbill.mjs - THE STICK ECONOMY'S OWN BILL (v0.711.0)
//
// One commodity, four lanes, one bill. The stick drought kept surfacing
// as a SIDE cell in everyone else's book - the recovery's mid-fails
// ('no sticks and no planks for sticks', the v0.492.0 stick-drought
// class), the armory's stick-misses ('stick craft did not land', the
// v0.494.0 legs), the craft storm's own stick refusals ('F2 craft
// stick: storm cooldown 3969ms left (3 consecutive timeouts) -
// refusing', the v0.478.0 ledger's byItem), and the torch lane's
// stick-dry economy (the v0.137.0/v0.180.0 rescue rungs + the stick
// floor's skips) - and the gather drought kept the family hot three
// faces running without the bill ever being totalled. This is the
// total: doorstepStormCensus's own move (v0.706.0) applied to the
// stick economy - fold the four lanes' EXISTING cells into one toll,
// name the self-rescued share (the torch rungs: the drought's answered
// skin - the lane cures itself by the plank/logs conversion), leave
// the rest as the bill's hard core (the misses and refusals the
// economy could not answer in-lane).
//
// Pure reuse (one-parser law by sums, zero new regexes - every cell
// was already in hand); a stick-free face reads the honest silence
// (null - the row stays absent, the calm fleet never opens the bill).
// Junk-safe end to end: non-array reads null, non-string rows are the
// downstream lenses' own law. Mining-surface only: zero fleet wiring,
// zero new log lines (the v0.379/.../v0.710.0 precedent).
//
// The era's own reads, raw-log reconciled: the 37th 99 voices
// (bootstrap 7 / armory 2 / storm 2 / torch 88, self-rescued 53 by
// 53 rungs); the 36th 96 (7 / 0 / 0 / 89, self-rescued 55). The
// torch lane owns the bill's mass - the everyday stick economy runs
// through the torch; the hard core (the misses that starved a tool)
// rides the other three lanes.
//

import { toolRecovery } from './toolrecovery.mjs'
import { armoryCensus } from './armorycensus.mjs'
import { stormRefusalLedger } from './stormrefusal.mjs'
import { torchBook } from './torchbook.mjs'

/**
 * stickBill(lines) - the stick economy's four lanes folded into one bill.
 * @param {string[]} [lines] the face log (array of lines)
 * @returns {null|{lanes: Array<{lane: string, total: number}>,
 *   total: number, selfRescued: number, plankRungs: number,
 *   logsRung: number, stickSkips: number}} the bill (null on non-array
 *   or on a stick-free face - the honest silence)
 */
export function stickBill (lines) {
  if (!Array.isArray(lines)) return null
  const t = toolRecovery(lines)
  const a = armoryCensus(lines)
  const s = stormRefusalLedger(lines)
  const b = torchBook(lines)
  const bootstrap = (t && t.midFailClasses && t.midFailClasses['stick-drought']) || 0
  const armory = (((a && a.sword && a.sword.stickMisses) || 0) +
    ((a && a.spare && a.spare.stickMisses) || 0))
  const storm = (s && s.byItem && s.byItem.stick) || 0
  const plankRungs = (b && b.totals && b.totals.plankRungs) || 0
  const logsRungs = (b && b.totals && b.totals.logsRungs) || 0
  const stickSkips = (b && b.totals && b.totals.stickSkips) || 0
  const torch = plankRungs + logsRungs + stickSkips
  const total = bootstrap + armory + storm + torch
  if (!(total > 0)) return null
  return {
    lanes: [
      { lane: "the bootstrap's", total: bootstrap },
      { lane: "the armory's", total: armory },
      { lane: "the storm's", total: storm },
      { lane: "the torch's", total: torch }
    ],
    total,
    selfRescued: plankRungs + logsRungs,
    plankRungs, logsRungs, stickSkips
  }
}
