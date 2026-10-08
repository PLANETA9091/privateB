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

// (v0.802.0) THE ORPHAN BOOK'S OWN SEAT - WHICH end class owns the
// orphan book. The owner census answers 'how many' (total), 'whose
// client died' (owners) and prints the class split (byClass), but no
// row ever said WHICH end class owns the book - the classes' own mix
// rode raw beside the owners' split. THE SEAT LAW (the census's own
// byClass cell only, zero re-parsing - the v0.800.0 sweep seat's own
// shape, the v0.679.0 owner census's own cells): the strict-majority
// law, a solo class owns the book only above half (a tie owns
// nothing); the book is the byClass cell's own sum; the unattributed
// are not ends and never ride the book (the honest fence); junk never
// invents a class (a missing or non-object census/byClass cell, a
// non-finite or non-positive counter, or a zero book reads the honest
// silence). The vocabulary is the census's own class bytes - the
// rescue end classes' own lexicographic law decides the ranked ties
// ('botGone' < 'dead' < 'timeout').
function orphanBookTally (census) {
  const byClass = census && typeof census === 'object' && !Array.isArray(census)
    ? census.byClass
    : null
  if (!byClass || typeof byClass !== 'object' || Array.isArray(byClass)) return null
  const tallies = {}
  let book = 0
  for (const [cls, n] of Object.entries(byClass)) {
    if (typeof cls !== 'string' || cls.length === 0) continue
    if (!Number.isFinite(n) || n <= 0) continue
    book += n
    tallies[cls] = (tallies[cls] || 0) + n
  }
  return book > 0 ? { tallies, book } : null
}

// (v0.802.0) the orphan book's own seat - the strict-majority law's
// verdict: the top end class owns the book only above half; a tie owns
// nothing (the honest null - the mix needs the riders, not a named
// owner). The byte order decides the scan (the class's own bytes).
export function orphanBookSeat (census) {
  const tally = orphanBookTally(census)
  if (!tally) return null
  let topOwns = 0
  let topCls = null
  for (const [cls, n] of Object.entries(tally.tallies).sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)) {
    if (n > topOwns) { topOwns = n; topCls = cls }
  }
  if (topCls === null || topOwns <= tally.book - topOwns) return null
  return { cls: topCls, owns: topOwns, ofOrphans: tally.book, shareOfOrphans: +(topOwns / tally.book).toFixed(3) }
}

// (v0.802.0) the orphan book's own row - THE ORPHAN BOOK'S OWN SEAT:
// one end class's own ends own the orphan book (the dead-client
// lane's own meter). Junk never prints a row (the honest silence's
// own row law): every field is guarded before the template speaks.
export function orphanBookSeatRow (seat) {
  if (!seat || typeof seat !== 'object') return null
  const { cls, owns, ofOrphans, shareOfOrphans } = seat
  if (typeof cls !== 'string' || !cls ||
      !Number.isFinite(owns) || owns <= 0 ||
      !Number.isFinite(ofOrphans) || ofOrphans <= 0 || owns > ofOrphans ||
      !Number.isFinite(shareOfOrphans)) return null
  return `the orphan book's own seat (v0.802.0): ${cls} owns ${owns} of ${ofOrphans} orphan end(s) (${(shareOfOrphans * 100).toFixed(1)}%) - THE ORPHAN BOOK'S OWN SEAT: one end class's own ends own the orphan book - the class's own front prices the reconnect lane the per-bot split rode unnamed`
}

// (v0.802.0) THE ORPHAN BOOK'S OWN RIDERS - the seat's own silence's
// companion. The seat names the solo end class under the
// strict-majority law; a no-majority class mix rode raw with no row
// naming the shape. THE RIDER LAW (the census's own byClass cell
// only, zero re-parsing - the seat's own precedent): a MEASURE, never
// a verdict-owner - the top two classes' concentration prices the
// shape the solo law refused to name (the seat's owner case leaves
// the companion unprinted - the decompose's own branch law). Junk
// never invents a shape: a missing or non-object census/byClass cell,
// a non-finite counter, or fewer than two counted classes reads the
// honest silence (null). The order is deterministic (count desc, then
// the class's own byte: 'botGone' < 'timeout').
export function orphanBookRiders (census) {
  const tally = orphanBookTally(census)
  if (!tally) return null
  const ranked = Object.entries(tally.tallies).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
  if (ranked.length < 2) return null
  const [leader, leaderOwns] = ranked[0]
  const [runner, runnerOwns] = ranked[1]
  const pairOwns = leaderOwns + runnerOwns
  return { leader, leaderOwns, runner, runnerOwns, ofOrphans: tally.book, pairOwns, shareOfOrphans: +(pairOwns / tally.book).toFixed(3), duet: leaderOwns === runnerOwns }
}

// (v0.802.0) the orphan riders' own row - THE ORPHAN BOOK'S OWN MIX: a
// measure of the shape, never a named owner (the seat's tie law
// holds); the pair prices the concentration the solo law refused to
// seat. Junk never prints a shape (the honest silence's own row law).
export function orphanBookRidersRow (r) {
  if (!r || typeof r !== 'object') return null
  const { leader, leaderOwns, runner, runnerOwns, ofOrphans, pairOwns, shareOfOrphans } = r
  if (typeof leader !== 'string' || !leader || typeof runner !== 'string' || !runner ||
      !Number.isFinite(leaderOwns) || leaderOwns <= 0 || !Number.isFinite(runnerOwns) || runnerOwns <= 0 ||
      !Number.isFinite(ofOrphans) || ofOrphans <= 0 || !Number.isFinite(pairOwns) || pairOwns > ofOrphans ||
      !Number.isFinite(shareOfOrphans)) return null
  return `the orphan book's own riders (v0.802.0): no solo class owns the majority - ${leader} x${leaderOwns} + ${runner} x${runnerOwns} own ${pairOwns} of ${ofOrphans} orphan end(s) (${(shareOfOrphans * 100).toFixed(1)}%) - THE ORPHAN BOOK'S OWN MIX: the seat's tie law held, the mix is the shape - the classes' own spread prices the orphan book the solo law refused to seat`
}
