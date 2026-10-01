// v0.412.0 THE DROP-WALK LENS - the vein sweep's drop-walk failures, per-fail.
//
// The fleet has read the drop-walk ECONOMY at the run level since v0.185.0
// (the 'sweep drop ledger:' row's failed= split below/plane/above) and the
// smelt sweep's verdicts since v0.410.0 ('sweep: 0 collected - ...'), but the
// PER-FAIL line the miner prints at every aborted drop walk stayed unread:
//
//   F7 [F7] vein sweep: the drop walk to [-136,46,414] failed - sweep drops: timeout after 8000ms (dy 3.0, range 2)
//   F9 [F9] vein sweep: the drop walk to [-142,56,420] failed - doomed goal (ledgered 44s ago at [-143,56,419]) - sweep drops refused (dy -2.0, range 2)
//   F5 [F5] vein sweep: the drop walk to [-113,41,430] failed - fleet goal ceiling: 30 goals fleet-wide in 5s - sweep drops refused for 14s (dy -2.0, range 2)
//
// The emitter is miner.mjs's drop-walk catch: 'failed - ${e.message}
// (dy ${dyWalk.toFixed(1)}, range ${range})' - the message is the walk layer's
// own verdict (arbitrary text), but the tail is constant in the field and the
// three shapes above are the ones the faces carry. The historical budget
// moved (4000ms in the run68 era -> 8000ms since v0.288.0), so the census
// reads the ms FIELD, never the constant.
//
// The design questions the lens answers per face: WHICH dy family bleeds the
// failures (the v0.205.0 law: negative dy = the below family, positive = the
// above family, no range-2 walk sits between -0.5 and 0), WHY they bleed
// (timeout vs the doomed-goal ledger vs the fleet goal ceiling), and whether
// the timeouts ride the FULL budget (a systemic block - every timeout at the
// budget's own edge) or scatter (noise). One parser per emitter: the run-level
// ledger row belongs to drops.mjs's own counter, the smelt sweep verdicts to
// walkfail.mjs - this lens owns the per-fail line only. Junk-safe, honest
// zeros, the field's own shape pinned by the face-26 + run68 verbatims.
//
// (v0.415.0) THE DROP CLOCK - the WHEN leg. The other A* starvation families
// (hop, the tool lanes, the sweep, the bank) got their decide clocks in
// v0.413.0; this lens shipped before the clock existed (ae2cff7) and its
// fails stayed untimed. The drop lane's own currency is the FAIL (the
// budget-edge invariant: every timeout at exactly the budget's edge), so
// EVERY parsed fail stamps its line's hb moment - doomed/ceiling included
// (a ledger refusal is still an event at a moment; the byWhy split lets a
// reader correlate). The clock reads the lane's bleeding regime: a dense
// burst names the mid-face concurrent phase (the decide cohort's home), a
// spread names per-target geometry. The decide GRAND TOTAL stays untouched
// - this clock reads fails, the ledger's decide rows read refusals.
//
// (v0.418.0) THE WALKED LEG - the HOW leg. The budget-edge invariant proves
// no budget cures the lane, and the walk layer's verdict ('timeout after
// Nms') cannot say WHERE the budget burned: the decide loop and the blocked
// walk die with the SAME text. The emit site now appends the displacement
// (', walked X.X' - measured across the try at the call site, the dy
// instrument's own pattern): walked ~0 = never moved (the stuck class - an
// unstandable goal's decide loop or starved physics), walked >= 1 = moved
// but never arrived (the route class). The field is OPTIONAL - the legacy
// two-field tail parses byte-identically (walked null); the census keys the
// walked split on the TIMEOUT verdicts only (a refusal throws inside the
// 25ms pace with the bot unmoved - its walked 0.0 says nothing and would
// pollute the stuck share).

import { parseHeartbeat } from './stormcensus.mjs'
import { decideClock } from './walkfail.mjs'

// The per-fail line: bot tag required (the fleet always tags), the tail
// (dy, range) required - the emitter always carries it in the field.
// (v0.418.0) the walked field is optional (', walked X.X' - toFixed(1) text,
// integer or one-decimal); its absence reads walked null (the legacy trees).
export const DROP_WALK_FAIL_RE = /^(F\d+) \[F\d+\] vein sweep: the drop walk to \[(-?\d+),(-?\d+),(-?\d+)\] failed - (.+?) \(dy (-?(?:\d+\.?\d*|\.\d+)), range (\d+)(?:, walked (\d+(?:\.\d+)?))?\)$/

const TIMEOUT_RE = /^sweep drops: timeout after (\d+)ms$/
const DOOMED_RE = /^doomed goal \(ledgered (\d+)s ago(?: at \[(-?\d+),(-?\d+),(-?\d+)\])?\) - sweep drops refused$/
const CEILING_RE = /^fleet goal ceiling: (\d+) goals fleet-wide in (\d+)s - sweep drops refused for (\d+)s$/
const WATER_RESCUE_RE = /^water rescue in progress \(sweep drops refused\)$/
const NO_PATH_RE = /^No path to the goal!$/

/**
 * Classify the walk layer's own verdict text into the lens's buckets.
 * Returns { why, ...fields } - the captured fields ride the verdict's own
 * shape; 'other' keeps the line counted (an honest unknown, never dropped).
 */
export function classifyDropFailWhy (reason) {
  const t = typeof reason === 'string' ? reason.match(TIMEOUT_RE) : null
  if (t) return { why: 'timeout', timeoutMs: Number(t[1]) }
  const d = typeof reason === 'string' ? reason.match(DOOMED_RE) : null
  if (d) {
    return {
      why: 'doomed',
      doomedAgeS: Number(d[1]),
      doomedSpot: (d[2] !== undefined) ? { x: Number(d[2]), y: Number(d[3]), z: Number(d[4]) } : null
    }
  }
  const c = typeof reason === 'string' ? reason.match(CEILING_RE) : null
  if (c) {
    return {
      why: 'ceiling',
      ceilingGoals: Number(c[1]),
      ceilingWindowS: Number(c[2]),
      refusedS: Number(c[3])
    }
  }
  if (typeof reason === 'string' && WATER_RESCUE_RE.test(reason)) return { why: 'water-rescue' }
  // the bare no-path verdict is the walk layer's own vocabulary (the fleet's
  // shared classifyWalkWhy bucket) - the fifth field shape (face 27, F17 r1)
  if (typeof reason === 'string' && NO_PATH_RE.test(reason)) return { why: 'no-path' }
  return { why: 'other' }
}

/**
 * Parse one drop-walk failure line. Returns null on every non-match (junk,
 * the other lanes' shapes, prose). The dy reads as Number, the coordinate
 * triple as rounded ints (the emitter prints Math.round'd values).
 */
export function parseDropWalkFail (line) {
  const m = typeof line === 'string' ? line.match(DROP_WALK_FAIL_RE) : null
  if (!m) return null
  const whyFields = classifyDropFailWhy(m[5])
  return {
    bot: m[1],
    x: Number(m[2]),
    y: Number(m[3]),
    z: Number(m[4]),
    ...whyFields,
    dy: Number(m[6]),
    range: Number(m[7]),
    // (v0.418.0) the displacement the emitter measured across the failed
    // try - null on the legacy two-field tail (the stamp never invents).
    walked: (m[8] !== undefined) ? Number(m[8]) : null
  }
}

const fl = v => (Number.isFinite(v) && v > 0) ? Math.floor(v) : 0

/**
 * The census: every per-fail line into one junk-safe read.
 * - fails/byBot/byWhy: the volume split.
 * - timeouts: the budget-edge read (n, max, sum) - max == the constant says
 *   systemic, scatter says noise.
 * - doomed: the ledger's share of the refusals (with/without a spot).
 * - ceiling: the goal brake's share (the fleet-wide 30/5s cap biting sweeps).
 * - dy: the v0.205.0 family split (below dy<0 / plane dy==0 / above dy>0)
 *   plus the min/max span.
 * - range: the 1/2 histogram.
 * - timeouts.walked* (v0.418.0): the displacement split ON TIMEOUT VERDICTS
 *   ONLY - walked0 (< 1.0 block, the walkgovernor's own STALL_MIN_PROGRESS
 *   law) = the stuck class, moved1 (>= 1.0) = the route class, walkedNull =
 *   the legacy tail without the field. A refusal's walked 0.0 would pollute
 *   the stuck share (the bot never had a chance to move), so refusals stay
 *   out of the split.
 * unparsed counts lines the lens was BUILT for but the shapes escaped
 * (an honest escape hatch - never silently dropped).
 */
export function dropWalkCensus (lines) {
  const c = {
    fails: 0,
    byBot: {},
    byWhy: {},
    timeouts: { n: 0, maxMs: 0, sumMs: 0, walked0: 0, moved1: 0, walkedNull: 0, maxWalked: null },
    doomed: { n: 0, maxAgeS: 0, withSpot: 0 },
    ceiling: { n: 0, maxGoals: 0, maxRefusedS: 0 },
    dy: { min: null, max: null, below: 0, plane: 0, above: 0 },
    range: {},
    unparsed: 0
  }
  // (v0.415.0) the drop clock: every parsed fail rides the last hb ts (the
  // walkfail/bankfail v0.413.0 pattern); a fail before the first heartbeat
  // stays untimed - the stamp never invents.
  const stamps = []
  let lastT = null
  let clockEnd = null
  if (!Array.isArray(lines)) return { ...c, clock: decideClock(stamps, null) }
  for (const line of lines) {
    const hb = parseHeartbeat(line)
    if (hb) { lastT = hb.tsS; clockEnd = hb.tsS }
    const p = parseDropWalkFail(line)
    if (!p) {
      if (typeof line === 'string' && /vein sweep: the drop walk to .* failed/.test(line)) c.unparsed++
      continue
    }
    c.fails++
    stamps.push(lastT)
    c.byBot[p.bot] = (c.byBot[p.bot] || 0) + 1
    c.byWhy[p.why] = (c.byWhy[p.why] || 0) + 1
    if (p.why === 'timeout') {
      c.timeouts.n++
      c.timeouts.maxMs = Math.max(c.timeouts.maxMs, p.timeoutMs)
      c.timeouts.sumMs += p.timeoutMs
      // (v0.418.0) the walked split: < 1.0 = stuck (never really moved -
      // the walkgovernor's own progress law), >= 1.0 = moved but not
      // arrived; the legacy tail stays walkedNull. maxWalked keeps the
      // raw measurement (a float, NOT floored - it is evidence, not a count).
      if (p.walked === null) c.timeouts.walkedNull++
      else {
        if (p.walked < 1) c.timeouts.walked0++
        else c.timeouts.moved1++
        if (c.timeouts.maxWalked === null || p.walked > c.timeouts.maxWalked) c.timeouts.maxWalked = p.walked
      }
    } else if (p.why === 'doomed') {
      c.doomed.n++
      c.doomed.maxAgeS = Math.max(c.doomed.maxAgeS, p.doomedAgeS)
      if (p.doomedSpot) c.doomed.withSpot++
    } else if (p.why === 'ceiling') {
      c.ceiling.n++
      c.ceiling.maxGoals = Math.max(c.ceiling.maxGoals, p.ceilingGoals)
      c.ceiling.maxRefusedS = Math.max(c.ceiling.maxRefusedS, p.refusedS)
    }
    if (c.dy.min === null || p.dy < c.dy.min) c.dy.min = p.dy
    if (c.dy.max === null || p.dy > c.dy.max) c.dy.max = p.dy
    if (p.dy < 0) c.dy.below++
    else if (p.dy > 0) c.dy.above++
    else c.dy.plane++
    c.range[p.range] = (c.range[p.range] || 0) + 1
  }
  c.timeouts.n = fl(c.timeouts.n)
  c.timeouts.maxMs = fl(c.timeouts.maxMs)
  c.timeouts.sumMs = fl(c.timeouts.sumMs)
  c.timeouts.walked0 = fl(c.timeouts.walked0)
  c.timeouts.moved1 = fl(c.timeouts.moved1)
  c.timeouts.walkedNull = fl(c.timeouts.walkedNull)
  // maxWalked stays a raw float (null when no walked field arrived) - the
  // measurement's own precision is the read's value
  c.doomed.n = fl(c.doomed.n)
  c.doomed.maxAgeS = fl(c.doomed.maxAgeS)
  c.doomed.withSpot = fl(c.doomed.withSpot)
  c.ceiling.n = fl(c.ceiling.n)
  c.ceiling.maxGoals = fl(c.ceiling.maxGoals)
  c.ceiling.maxRefusedS = fl(c.ceiling.maxRefusedS)
  return { ...c, clock: decideClock(stamps, clockEnd) }
}
