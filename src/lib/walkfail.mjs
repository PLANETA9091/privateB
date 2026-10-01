// (v0.410.0) THE WALK-FAIL LENS - the A* starvation census's fleet-wide leg.
// The hop-zero census (v0.399.0) reads the HOP lane only: face 25 attempt 2
// (36860108110) priced decide-timeout=42 of 65 hop zeros - but the SAME
// 'Took to long to decide path to goal!' starvation walks the OTHER lanes
// unread: the tool lanes' own chest walks and the smelt sweep's per-machine
// verdicts. Face 25's log carries 79 decide lines; the hop lane owns 42 -
// the other 37 rode in shapes nobody parsed. This lens reads them.
//
// THE TWO EMITTER FAMILIES (verified verbatim against the face-25 log and
// the emitters' own code):
//   (1) THE TOOL LANE CHEST WALKS (toolupgrade.mjs 'iron commune:' /
//       'pool seed:', fuelbank.mjs 'fuel commons:') - the lane prefix is the
//       emitter's own context; the log wrapper prepends the bot tag; the
//       doubled-tag variant is REAL (face 25 line 594: the lane prefix rode
//       twice). Shapes:
//         F7 fuel commons: chest walk failed after the nudge (Took to long to decide path to goal!)
//         F13 iron commune: chest walk failed (Took to long to decide path to goal!)
//         F14 iron commune: iron commune: chest walk failed after the nudge (No path to the goal!)
//         F7  iron commune: chest walk failed (iron commune walk @-118,404: timeout after 528ms)
//   (2) THE SWEEP VERDICT (smelting.mjs sweepCensusLine, the v0.197.0 census
//       line) - the zero-harvest shape rides a reason HISTOGRAM where each
//       pair is '<reason> xN' joined by ', ':
//         F13 sweep: 0 collected - machine unreachable (Took to long to decide path to goal!) x6, machine unreachable (walk to a machine (sweep): timeout after 17ms) x1
//       The histogram's reasons can nest wrappers ('machine unreachable
//       (walk governor: ... refused for 12s)') and can carry the sweep's own
//       defer bucket ('sweep deferred (the lanes hold) x1').
//
// THE WHY CLASSIFIER (the inner why, shared by both families) - ordered
// most-specific-first so the timeout ms capture never crosses the decide /
// no-path shapes; unknown lands in 'other', never dropped (the
// honest-sweep law). Pure parser, unit-pinned (the hop-census v0.399.0
// shape); decompose is its field read. Mining-surface only: zero fleet
// wiring, zero new log lines - the v0.379.0 precedent. Junk-safe end to
// end: non-string rows skipped, absent classes read the honest zero.

import { parseHeartbeat } from './stormcensus.mjs'

const num = (s) => Number(s)

// (v0.413.0) THE DECIDE CLOCK's window - the death clock's own 30s law
// (the v0.407.0 burst window): the hb cadence is the fleet's shared rail,
// the densest sliding window reads the cohort's clustering against it.
export const DECIDE_BURST_WINDOW_S = 30

// The decide stamps' clock arithmetic (the death clock's shape, the
// v0.407.0 precedent): the densest sliding window over the timed stamps;
// an untimed stamp (a refusal before the first hb) stays honestly out of
// every window - the stamp never invents.
export function decideClock (stamps, clockEnd) {
  const timedTs = stamps.filter(t => t !== null).sort((a, b) => a - b)
  let maxBurst = 0
  for (let i = 0, j = 0; i < timedTs.length; i++) {
    while (timedTs[i] - timedTs[j] > DECIDE_BURST_WINDOW_S) j++
    const w = i - j + 1
    if (w > maxBurst) maxBurst = w
  }
  return {
    timed: timedTs.length,
    untimed: stamps.length - timedTs.length,
    clockEnd: clockEnd ?? null,
    firstTs: timedTs.length ? timedTs[0] : null,
    lastTs: timedTs.length ? timedTs[timedTs.length - 1] : null,
    maxBurst,
    burstWindowS: DECIDE_BURST_WINDOW_S
  }
}

// The inner why vocabulary - ORDER IS SEMANTIC (the ms capture must not
// swallow the decide/no-path verbatims, and the governor's prose refusal
// names itself before the generic other).
export function classifyWalkWhy (why) {
  if (typeof why !== 'string') return null
  if (/^Took to long to decide/.test(why)) return { why: 'decide-timeout' }
  if (/^No path/.test(why)) return { why: 'no-path' }
  let m
  if ((m = why.match(/timeout after (\d+)ms/))) return { why: 'walk-timeout', ms: num(m[1]) }
  if (/walk governor:/.test(why)) return { why: 'governor-refusal' }
  if (/The goal was changed/.test(why)) return { why: 'goal-churn' }
  if (/Path was stopped/.test(why)) return { why: 'path-stopped' }
  if (/budget exhausted/.test(why)) return { why: 'budget-floor' }
  if (/water rescue/.test(why)) return { why: 'water-rescue' }
  return { why: 'other' }
}

// The tool-lane chest-walk failure. The lane prefix chain is optional and
// repeatable (the doubled-tag variant is the field's own shape); the lane
// is the LAST prefix segment. A bare emitter line (no prefix at all) reads
// lane 'bare' - the honest read of toolupgrade's own unlabeled log call.
export const WALK_FAIL_RE = /^(F\d+) ((?:[a-z][a-z ]*?: )*)chest walk failed( after the nudge)? \(([^)]*)\)$/

export function parseWalkFail (line) {
  if (typeof line !== 'string') return null
  const m = line.match(WALK_FAIL_RE)
  if (!m) return null
  const bot = m[1]
  const prefixes = m[2].trim()
  const lane = prefixes ? prefixes.replace(/:$/, '').split(':').map(s => s.trim()).pop() : 'bare'
  const nudge = Boolean(m[3])
  const cls = classifyWalkWhy(m[4])
  return { bot, lane, nudge, ...cls }
}

// The sweep verdict's histogram - pairs '<reason> xN' joined by ', '. The
// pair walk accumulates comma-split pieces until one ends with the xN
// tail, so a reason carrying ', ' survives (the junk piece that never
// closes counts unparsed - never invented, never dropped).
export const SWEEP_VERDICT_RE = /^(F\d+) sweep: 0 collected - (.+)$/

export function parseSweepVerdict (line) {
  if (typeof line !== 'string') return null
  const m = line.match(SWEEP_VERDICT_RE)
  if (!m) return null
  const bot = m[1]
  const hist = m[2]
  const pairs = []
  const junk = []
  let buf = ''
  for (const piece of hist.split(', ')) {
    buf = buf ? `${buf}, ${piece}` : piece
    const pm = buf.match(/^(.*) x(\d+)$/)
    if (pm) {
      pairs.push({ reason: pm[1], n: num(pm[2]) })
      buf = ''
    }
  }
  if (buf) junk.push(buf)
  return { bot, pairs, junk }
}

// The histogram's pair reason - the wrapper the sweep's own census line
// built. 'machine unreachable (<inner>)' unwraps into classifyWalkWhy; the
// sweep's own buckets name themselves.
export function classifySweepReason (reason) {
  if (typeof reason !== 'string') return { why: 'unknown' }
  if (reason === 'busy') return { why: 'busy' }
  if (reason === SWEEP_DEFER_REASON_VALUE) return { why: 'deferred' }
  let m = reason.match(/^machine unreachable \((.*)\)$/)
  if (m) {
    const inner = classifyWalkWhy(m[1])
    return { why: inner ? `machine-unreachable-${inner.why}` : 'machine-unreachable-other', ms: inner?.ms }
  }
  if (reason === 'unknown') return { why: 'unknown' }
  return { why: 'other' }
}

// The smelting sweep's own defer bucket (the v0.228.0 SWEEP_DEFER_REASON's
// field shape) - pinned here by value so the lens stays dependency-free.
const SWEEP_DEFER_REASON_VALUE = 'sweep deferred (the lanes hold)'

function bump (map, key, n = 1) {
  if (key == null) return
  map[key] = (map[key] ?? 0) + n
}

export function walkFailCensus (lines) {
  const walk = { total: 0, nudge: 0, byLane: {}, byWhy: {}, byBot: {}, timeouts: [] }
  const sweep = { lines: 0, machinesUnreachable: 0, byWhy: {}, byBot: {}, busy: 0, deferred: 0, unparsed: 0, timeouts: [] }
  let decide = 0
  // (v0.413.0) the decide clock: every decide refusal rides the last hb ts
  // (a sweep pair's n attempts ALL stamp at their line's moment - the
  // emitter emitted them between two heartbeats; the burst reads attempt
  // density, the cohort's clustering question's own currency).
  const stamps = []
  let lastT = null
  let clockEnd = null
  if (!Array.isArray(lines)) return { walk, sweep, decideTotal: 0, clock: decideClock(stamps, null) }
  for (const l of lines) {
    const hb = parseHeartbeat(l)
    if (hb) { lastT = hb.tsS; clockEnd = hb.tsS }
    const wf = parseWalkFail(l)
    if (wf) {
      walk.total++
      if (wf.nudge) walk.nudge++
      bump(walk.byLane, wf.lane)
      bump(walk.byWhy, wf.why)
      if (wf.bot) bump(walk.byBot, wf.bot)
      if (wf.why === 'walk-timeout' && Number.isFinite(wf.ms)) walk.timeouts.push(wf.ms)
      if (wf.why === 'decide-timeout') { decide++; stamps.push(lastT) }
      continue
    }
    const sv = parseSweepVerdict(l)
    if (sv) {
      sweep.lines++
      if (sv.bot) bump(sweep.byBot, sv.bot)
      for (const p of sv.pairs) {
        const cls = classifySweepReason(p.reason)
        if (cls.why === 'busy') { sweep.busy += p.n; continue }
        if (cls.why === 'deferred') { sweep.deferred += p.n; continue }
        if (cls.why === 'unknown' || cls.why === 'other') { sweep.unparsed += p.n; continue }
        bump(sweep.byWhy, cls.why, p.n)
        if (cls.why.startsWith('machine-unreachable-')) sweep.machinesUnreachable += p.n
        if (cls.why === 'machine-unreachable-decide-timeout') {
          decide += p.n
          for (let i = 0; i < p.n; i++) stamps.push(lastT)
        }
        if (cls.why === 'machine-unreachable-walk-timeout' && Number.isFinite(cls.ms)) {
          for (let i = 0; i < p.n; i++) sweep.timeouts.push(cls.ms)
        }
      }
      sweep.unparsed += sv.junk.length
    }
  }
  return { walk, sweep, decideTotal: decide, clock: decideClock(stamps, clockEnd) }
}
