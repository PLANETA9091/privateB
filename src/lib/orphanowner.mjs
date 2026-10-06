// (v0.679.0) THE ORPHAN OWNER - the orphan end's per-bot attribution.
// The rescueLedger counts orphan ends (end lines with no open episode
// for that bot) FLEET-WIDE and prints their verbatim lines, but never
// names WHO owns them. The 21st flight (37413061352, the first clean
// face since the memory storm) rode 8 orphan ends - F3 x4, F8 x1, F19
// x3 - and the same face's drown=4 deaths all carried 'o2 reset(-1)':
// the orphans are the DEAD-CLIENT class (the stand-down's own words:
// 'the reconnect lane owns a dead client'), and the owner bot is the
// reconnect lane's subject. The fleet-wide 8 answers 'how many'; the
// owner split answers 'WHOSE client died' - the code front names its
// bot mechanically instead of a hand grep.
//
// One classifier, never forked: the end classes ride rescue-ledger.mjs's
// own rescueEndClass export. Pure parser, unit-pinned; decompose is its
// field read; mining-surface only (zero fleet wiring, zero new log
// lines - the v0.379.0 precedent).

import { rescueEndClass } from './rescue-ledger.mjs'

/** The bot tag anywhere in the line (both the raw log shape 'F3 [F3]
 * water: ...' and the decompose-decorated shape 'ORPHAN END: F3 ...'). */
const BOT_TAG_RE = /\bF\d+\b/

/**
 * Attribute the orphan end lines to their bots and end classes (pure).
 * Accepts the rescueLedger's orphanEndLines array (verbatim raw lines:
 * 'F3 [F3] water: rescue ...') or the decompose-decorated shapes ('ORPHAN
 * END: F3 ...') - the classifier decides, the tag rides anywhere. A line
 * that is not a rescue end at all (prose) is unattributed - never
 * invented; non-string input judges NOTHING.
 * @param {string[]} [orphanEndLines] the verbatim orphan end lines
 * @returns {{total: number, owners: Object<string, number>, byClass: Object<string, number>, unattributed: number}}
 */
export function orphanOwnerCensus (orphanEndLines) {
  const owners = {}
  const byClass = {}
  let total = 0
  let unattributed = 0
  if (!Array.isArray(orphanEndLines)) return { total, owners, byClass, unattributed }
  for (const l of orphanEndLines) {
    if (typeof l !== 'string') continue
    const cls = rescueEndClass(l)
    if (!cls) {
      unattributed++
      continue
    }
    total++
    byClass[cls] = (byClass[cls] || 0) + 1
    const bot = l.match(BOT_TAG_RE)
    if (bot) owners[bot[0]] = (owners[bot[0]] || 0) + 1
  }
  return { total, owners, byClass, unattributed }
}
