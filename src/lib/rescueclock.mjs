// (v0.431.0) THE RESCUE CLOCK - the rescue lane's price leg, the water
// family's next unread slice. The ledger (rescue-ledger.mjs) pairs every
// start with its terminus and counts the end classes; the transit census
// (v0.427.0) reads the launch lane; the sentry lens (v0.422.0) the per-pass
// sight. What nobody prices: WHAT THE RESCUE COSTS and WHAT THE FROZEN
// DIVE SEES - the 'in Ns' tail of every end line (the SUCCESS price:
// 'complete in 0.0s'..5.0s, the release price 'released in 5.7..10.2s';
// the ledger prices only the TIMEOUT class, its own cure's before/after)
// and the frozen standdown's own self-diagnosis - the bracket
// '[blind: N passes, 0 shore scans hit, 0 standing probes - no ground
// truth ever gathered]' whose THREE COUNTERS ride unread. Face 26/27's
// 14 brackets all read 0 shore scans / 0 probes: the frozen dive gathers
// NOTHING before the reconnect lane takes over - the blindness is now
// mechanical, not anecdotal (the F10 '0 standing probes' class).
//
// THE SOURCE READ this clock completes (the sentry lens's probes=0
// mystery, answered by the gate ladder, miner.mjs's pass loop): the
// standing-probe branch sits UNDER `if (!headWet)` and behind the
// shore-bearing, transit and release branches - the probe flies only on
// a DRY head with no shore, no land and no release yet. The field never
// produced that pocket (dry passes ride a bearing or transit; wet passes
// cannot probe - probing while head-wet would drown the bot), so
// probes=0 on all 331 pass lines is the DESIGN's constant, not a bug.
// The ground truth the rescue ever gets comes from the shore scan and
// the map - the bracket's zeros are that design's own receipt.
//
// Split-of-labor law (the gcpool/memhb precedent: same emitter, a
// different slice): the end lines are re-classified through
// rescue-ledger.mjs's OWN rescueEndClass/rescueEndSeconds exports (one
// classifier, imported - never forked); this clock adds the duration
// series per class and the blind-bracket parse. The still-wet inline
// stats ('timeout (still wet, 141 passes, 0 probes, tail ...)') stay the
// ledger's territory - the clock prices the duration only. Pure parser,
// unit-pinned; decompose is its field read; mining-surface only (zero
// fleet wiring, zero new log lines - the v0.379.0 precedent).

import { rescueEndClass, rescueEndSeconds } from './rescue-ledger.mjs'

/** The frozen standdown's self-diagnosis bracket, verbatim grammar
 * (emitter interpolation: three integer counters, the fixed tail). */
export const RESCUE_BLIND_RE = /\[blind: (\d+) passes, (\d+) shore scans hit, (\d+) standing probes - no ground truth ever gathered\]/

/**
 * Parse the blind bracket. Returns null on every non-match (the
 * bracketless standdown, the other lanes' lines, prose). The numbers are
 * the frozen episode's own counters - never re-derived, never invented.
 */
export function parseRescueBlind (line) {
  if (typeof line !== 'string') return null
  const m = line.match(RESCUE_BLIND_RE)
  if (!m) return null
  return { passes: Number(m[1]), shoreHits: Number(m[2]), probes: Number(m[3]) }
}

const SERIES = () => ({ n: 0, sum: 0, max: null })
const bumpSeries = (s, v) => {
  s.n++
  s.sum += v
  if (s.max === null || v > s.max) s.max = v
}

/**
 * The census: the ordered log stream into one junk-safe read.
 * - ends/byClass: the end lines' histogram (the clock's own window -
 *   the pairing stays the ledger's).
 * - durations: per class {n,sum,max,unpriced} - the 'in Ns' price of
 *   every termination; unpriced counts the classes whose shape carries
 *   no duration (the catch-path abort by design, a clipped tail by
 *   accident - counted, never silently averaged away).
 * - blind: the bracket's three counters as series + fullBlind (0 shore
 *   scans AND 0 probes - the gather-nothing episode) + bracketlessStanddowns
 *   (the frozen standdowns that close without a bracket - the F17 17.2s
 *   shape; the bracket prints only when the rescue gathered the numbers).
 * - unparsed: standdown lines that CARRY a 'blind:' token the grammar
 *   refuses (a bracket-shaped line escaped - counted, never dropped).
 */
export function rescueClockCensus (lines) {
  const out = {
    ends: 0,
    byClass: {},
    durations: {},
    blind: { lines: 0, passes: SERIES(), shoreHits: SERIES(), probes: SERIES(), fullBlind: 0, bracketlessStanddowns: 0 },
    unparsed: 0
  }
  if (!Array.isArray(lines)) return out
  for (const line of lines) {
    if (typeof line !== 'string') continue
    const cls = rescueEndClass(line)
    if (!cls) continue
    out.ends++
    out.byClass[cls] = (out.byClass[cls] ?? 0) + 1
    if (!out.durations[cls]) out.durations[cls] = { n: 0, sum: 0, max: null, unpriced: 0 }
    const s = rescueEndSeconds(line)
    if (s === null) out.durations[cls].unpriced++
    else bumpSeries(out.durations[cls], s)
    if (cls === 'frozenStanddown') {
      const b = parseRescueBlind(line)
      if (b) {
        out.blind.lines++
        bumpSeries(out.blind.passes, b.passes)
        bumpSeries(out.blind.shoreHits, b.shoreHits)
        bumpSeries(out.blind.probes, b.probes)
        if (b.shoreHits === 0 && b.probes === 0) out.blind.fullBlind++
      } else if (line.includes('blind:')) out.unparsed++ // a bracket the grammar refused
      else out.blind.bracketlessStanddowns++
    }
  }
  return out
}

// (v0.799.0) THE FROZEN STANDDOWN'S OWN SEAT - WHICH blind class owns the
// frozen-standdown book. The clock's own blind cell rode raw since
// v0.431.0 ('the frozen blindness: brackets 8 (passes n8, avg 14.4, max
// 16), full-blind (0 shore + 0 probes) 8 - THE FROZEN DIVE GATHERS
// NOTHING before the reconnect lane takes over, bracketless 5' - face 84,
// 37694318753, the zero-death calm: 13 frozen standdowns and no row ever
// said WHO owns the book, while the cell's own numbers carried the
// answer). THE SEAT LAW (the clock's own blind cell only, zero
// re-parsing - the v0.797.0 sight seat's own shape, the v0.792.0
// attacker seat's own law): the strict-majority law, a solo class owns
// the book only above half (a tie owns nothing); the book is the blind
// cell's own sum (fullBlind + the bracketed-sighted remainder + the
// bracketless); junk never invents a class (a missing or non-object
// census/blind cell, a non-finite or negative counter, a sighted
// remainder below zero, or a zero book reads the honest silence). THREE
// classes: 'full-blind' (the bracket's own zeros - the gather-nothing
// episode), 'sighted' (the bracket rode a shore/probe counter above
// zero), 'bracketless' (the standdown the bracket never printed - the
// F17 17.2s shape, v0.431.0's own receipt). THE FOUR-FACE MATRIX (the
// held faces, byte-exact): face 84 (37694318753) 'full-blind owns 8 of
// 13 frozen standdown(s) (61.5%)' - the bare majority, the calm face's
// 5 bracketless ride the book; face 83 (37689818269) 20 of 20 (100.0%)
// (the wet face's own whale); face 82 (37685069081) 5 of 5; face 79
// (37668633803) 4 of 4 - full-blind owns every owner case the field
// ever produced (the sighted class is the grammar's honest fence,
// unproven in the field - the bracket's zeros are the design's own
// receipt, v0.431.0's own answer).
const blindTally = (census) => {
  const b = census && typeof census === 'object' ? census.blind : null
  if (!b || typeof b !== 'object') return null
  const { lines, fullBlind, bracketlessStanddowns } = b
  for (const v of [lines, fullBlind, bracketlessStanddowns]) {
    if (!Number.isFinite(v) || v < 0) return null
  }
  const sighted = lines - fullBlind
  if (sighted < 0) return null
  const tallies = {}
  for (const [cls, n] of [['full-blind', fullBlind], ['sighted', sighted], ['bracketless', bracketlessStanddowns]]) {
    if (n > 0) tallies[cls] = n
  }
  const book = fullBlind + sighted + bracketlessStanddowns
  if (book <= 0) return null
  return { tallies, book }
}

// (v0.799.0) the seat itself - the strict-majority law on the blind
// cell's own classes (the sentrySightSeat's own shape).
export function rescueBlindSeat (census) {
  const t = blindTally(census)
  if (!t) return null
  let topUnits = 0
  let topClass = null
  for (const [cls, n] of Object.entries(t.tallies)) {
    if (n > topUnits) { topUnits = n; topClass = cls }
  }
  if (topClass === null || topUnits <= t.book - topUnits) return null
  return { blind: topClass, owns: topUnits, ofStanddowns: t.book, share: +(topUnits / t.book).toFixed(3) }
}

// (v0.799.0) the seat's own row - THE FROZEN BOOK'S OWN SEAT: the seat
// names WHICH blind class owns the frozen-standdown book; the class's
// own front prices the reconnect lane (the full-blind majority is the
// gather-nothing design's own receipt - the v0.431.0 prose priced the
// counters, the seat prices the owner). Junk never prints a seat (the
// honest silence's own row law).
export function rescueBlindSeatRow (seat) {
  if (!seat || typeof seat !== 'object') return null
  const { blind, owns, ofStanddowns, share } = seat
  if (typeof blind !== 'string' || !blind ||
      !Number.isFinite(owns) || owns <= 0 ||
      !Number.isFinite(ofStanddowns) || ofStanddowns <= 0 || owns > ofStanddowns ||
      !Number.isFinite(share)) return null
  return `the frozen standdown's own seat (v0.799.0): ${blind} owns ${owns} of ${ofStanddowns} frozen standdown(s) (${(share * 100).toFixed(1)}%) - THE FROZEN BOOK'S OWN SEAT: one blind class's own episodes own the standdown book - the class's own front prices the reconnect lane the raw split rode unnamed`
}

// (v0.799.0) THE FROZEN STANDDOWN'S OWN RIDERS - the seat's own
// silence's companion. The seat names the solo class under the
// strict-majority law; a no-majority blind mix rode raw with no row
// naming the shape. THE RIDER LAW (the clock's own blind cell only,
// zero re-parsing - the seat's own precedent): a MEASURE, never a
// verdict-owner - the top two classes' concentration prices the shape
// the solo law refused to name (the seat's owner case leaves the
// companion unprinted - the decompose's own branch law). Junk never
// invents a shape: a missing or non-object census/blind cell, a
// non-finite or negative counter, or fewer than two counted classes
// reads the honest silence (null). The order is deterministic (count
// desc, then the class's own byte: 'bracketless' < 'full-blind' <
// 'sighted').
export function rescueBlindRiders (census) {
  const t = blindTally(census)
  if (!t) return null
  const ranked = Object.entries(t.tallies).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
  if (ranked.length < 2) return null
  const [leader, leaderOwns] = ranked[0]
  const [runner, runnerOwns] = ranked[1]
  const pairOwns = leaderOwns + runnerOwns
  return { leader, leaderOwns, runner, runnerOwns, ofStanddowns: t.book, pairOwns, share: +(pairOwns / t.book).toFixed(3), duet: leaderOwns === runnerOwns }
}

// (v0.799.0) the blind riders' own row - THE FROZEN BOOK'S OWN MIX: a
// measure of the shape, never a named owner (the seat's tie law holds);
// the pair prices the concentration the solo law refused to seat. Junk
// never prints a shape (the honest silence's own row law).
export function rescueBlindRidersRow (r) {
  if (!r || typeof r !== 'object') return null
  const { leader, leaderOwns, runner, runnerOwns, ofStanddowns, pairOwns, share } = r
  if (typeof leader !== 'string' || !leader || typeof runner !== 'string' || !runner ||
      !Number.isFinite(leaderOwns) || leaderOwns <= 0 || !Number.isFinite(runnerOwns) || runnerOwns <= 0 ||
      !Number.isFinite(ofStanddowns) || ofStanddowns <= 0 || !Number.isFinite(pairOwns) || pairOwns > ofStanddowns ||
      !Number.isFinite(share)) return null
  return `the frozen standdown's own riders (v0.799.0): no solo class owns the majority - ${leader} x${leaderOwns} + ${runner} x${runnerOwns} own ${pairOwns} of ${ofStanddowns} frozen standdown(s) (${(share * 100).toFixed(1)}%) - THE FROZEN BOOK'S OWN MIX: the seat's tie law held, the mix is the shape - the classes' own crowd prices the standdown the solo law refused to name`
}
