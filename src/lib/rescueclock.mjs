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
