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
//
// (v0.420.0) THE NOPATH GOAL ROW - the no-path verdict's own detail leg.
// MEASURED (face 27, run 36870593766, the F17 anomaly): the fleet's ONLY
// no-path rode F17's terrace walk to [-122,55,408] (dy -0.4, range 1) - the
// A* PROVED the goal sphere dead beside the live water column [-126,53..54,
// 407..408], and the doomed ledger's consult (radius 2, dy 4) then refused
// the NEXT walk in the same batch ('ledgered 0s ago at [-122,53,407]')
// WITHOUT a second A* - one proof killed two of F17's three fails. The
// byWhy count (v0.414.0) named the shape but not the PLACE; the goal
// coordinate rides every fail line already, so the census keeps it now:
// dedup'd first-seen goal strings, capped at the no-path ledger's own cap
// (the fleet's NOPATH_CAP law - a face never proves 24 distinct dead
// spheres, the belt is for the absurd).
// (v0.431.0) THE ADMISSION FAMILY - the sixth why. The walked leg's stuck
// share was always going to be fed by the UNSTANDABLE-GOAL class (the goal
// is the drop's own position - no standing cell was ever consulted), and
// v0.431.0's goal admission (drops.mjs) now refuses that class BEFORE the
// goto: a goal whose isEnd ball holds no swim cell and no stand cell (the
// standGoalNear shape: solid footing, empty feet, empty head) is a PROVEN
// burn - the A* has no arrival node to plan to. The refusal rides the
// caller's own catch, so the line, the tail and the dy family are the
// legacy shapes - only the why is new: 'goal admission: no standable cell
// in the goal's arrival sphere - sweep drops refused' (paren-free - the
// nested-paren lesson). The family counts the burns the lane never paid;
// the timeouts' walked split reads the residue.

import { parseHeartbeat } from './stormcensus.mjs'
import { decideClock } from './walkfail.mjs'

// The per-fail line: bot tag required (the fleet always tags), the tail
// (dy, range) required - the emitter always carries it in the field.
// (v0.418.0) the walked field is optional (', walked X.X' - toFixed(1) text,
// integer or one-decimal); its absence reads walked null (the legacy trees).
export const DROP_WALK_FAIL_RE = /^(F\d+) \[F\d+\] vein sweep: the drop walk to \[(-?\d+),(-?\d+),(-?\d+)\] failed - (.+?) \(dy (-?(?:\d+\.?\d*|\.\d+)), range (\d+)(?:, walked (\d+(?:\.\d+)?))?\)$/

const TIMEOUT_RE = /^sweep drops: timeout after (\d+)ms$/
// (v0.431.0) the goal admission's own why - the standability gate's refusal
// fired BEFORE the goto (no budget burned, no walk issued, the bot unmoved)
const ADMISSION_RE = /^goal admission: no standable cell in the goal's arrival sphere - sweep drops refused$/
const DOOMED_RE = /^doomed goal \(ledgered (\d+)s ago(?: at \[(-?\d+),(-?\d+),(-?\d+)\])?\) - sweep drops refused$/
const CEILING_RE = /^fleet goal ceiling: (\d+) goals fleet-wide in (\d+)s - sweep drops refused for (\d+)s$/
const WATER_RESCUE_RE = /^water rescue in progress \(sweep drops refused\)$/
const NO_PATH_RE = /^No path to the goal!$/

// (v0.420.0) the goal row's belt - src/lib/nopath.mjs's own cap (the fleet
// no-path ledger never keeps more; a census must not outgrow its subject).
export const NOPATH_GOAL_CAP = 24

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
  // (v0.431.0) the admission refusal - the sixth shape (the standability
  // gate's own verdict, thrown at the call site before the goto)
  if (typeof reason === 'string' && ADMISSION_RE.test(reason)) return { why: 'admission' }
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
    // (v0.420.0) the no-path detail: the count + the dedup'd goal spheres
    // the A* proved dead (first-seen order, NOPATH_GOAL_CAP belt).
    nopath: { n: 0, goals: [] },
    admission: { n: 0 }, // (v0.431.0) the standability gate's share - the burns the lane never paid
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
    } else if (p.why === 'no-path') {
      // (v0.420.0) the goal row: the fail line's own coordinate IS the goal
      // the walk layer proved dead (the emitter prints the drop's cell) -
      // dedup'd, first-seen, capped (the newest distinct spheres survive).
      c.nopath.n++
      const g = `[${p.x},${p.y},${p.z}]`
      if (!c.nopath.goals.includes(g)) {
        c.nopath.goals.push(g)
        if (c.nopath.goals.length > NOPATH_GOAL_CAP) c.nopath.goals.shift()
      }
    } else if (p.why === 'admission') {
      // (v0.431.0) the gate's own count - the refusal fired before the goto,
      // so the walked split above never sees it (the pollution law holds)
      c.admission.n++
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
  c.nopath.n = fl(c.nopath.n)
  c.admission.n = fl(c.admission.n)
  return { ...c, clock: decideClock(stamps, clockEnd) }
}

// (v0.778.0) THE DROP-WALK'S OWN VERDICT - the book's own class seat. The
// v0.413.0 census priced the classes and the walkers, the walked leg
// (v0.418.0) split the timeout's anatomy - no row ever named WHICH class
// owns the book (face 74's own census rode the answer raw: 'by why:
// timeout=11 admission=6 doomed=3' beside 'timeouts: n=11 max=8000ms
// sum=88000ms' - the 8s rent's majority sat unnamed). THE VERDICT LAW (the
// census's own byWhy cell only, zero re-parsing - the v0.769.0 verdict's
// own precedent): the top class owns the book under the strict-majority
// law (a tie owns nothing - the storm-has-no-seat precedent). Junk never
// invents a verdict: a missing or empty tally, a non-finite or
// non-positive count, or a tied spread reads the honest silence (null -
// the decompose's own guard skips the row). The honest-refusal caveat is
// the reader's own: the admission and water-rescue classes are the
// fleet's own saves (the burns they would have paid never left the
// pocket), the doomed class is the ledger's own consult - a verdict whose
// owner is a refusal class reads the lane's honest shape, not a defect's
// seat.
export function dropWalkVerdict (byWhy) {
  const mix = (byWhy && typeof byWhy === 'object' && !Array.isArray(byWhy)) ? byWhy : {}
  const tallies = {}
  let total = 0
  for (const [why, n] of Object.entries(mix)) {
    if (typeof why !== 'string' || !why || !Number.isFinite(n) || n <= 0) continue
    total += n
    tallies[why] = (tallies[why] || 0) + n
  }
  let topUnits = 0
  let topWhy = null
  for (const [why, n] of Object.entries(tallies)) {
    if (n > topUnits) { topUnits = n; topWhy = why }
  }
  if (topWhy === null || topUnits <= total - topUnits) return null
  return { why: topWhy, owns: topUnits, ofFails: total, shareOfFails: +(topUnits / total).toFixed(3) }
}

// (v0.778.0) the verdict's own row - THE DROP'S OWN FRONT: the class
// names the lane's own front; the timeouts' own rent read (n/max/sum)
// prices the timeout's burn beside it, the walked split names the cure's
// lane. Junk never prints a verdict (the honest silence's own row law).
export function dropWalkVerdictRow (v) {
  if (!v || typeof v !== 'object') return null
  const { why, owns, ofFails, shareOfFails } = v
  if (typeof why !== 'string' || !why || !Number.isFinite(owns) || owns <= 0 ||
      !Number.isFinite(ofFails) || ofFails <= 0 || owns > ofFails ||
      !Number.isFinite(shareOfFails)) return null
  return `the drop-walk's own verdict (v0.778.0): ${why} owns ${owns} of ${ofFails} fail(s) (${(shareOfFails * 100).toFixed(1)}%) - THE DROP'S OWN FRONT: the walk layer's own verdict names the class - the honest refusals stay the fleet's own saves, the burns price the lane's cure`
}

// (v0.785.0) THE DROP-WALK'S OWN WHY RIDERS - the verdict's own
// silence's companion. The v0.778.0 verdict names the solo class under
// the strict-majority law; a no-majority why mix rode raw with no row
// naming the shape (face 76's own census read 'admission=12
// timeout=11 other=6 doomed=1' - the 40% admission sat unnamed, the
// verdict's own honest silence). THE RIDER LAW (the census's own
// byWhy cell only, zero re-parsing - the verdict's own precedent): a
// MEASURE, never a verdict-owner - the top two classes' concentration
// prices the shape the solo law refused to name (the verdict's owner
// case leaves the companion unprinted - the decompose's own branch
// law). Junk never invents a shape: a missing or non-object tally, a
// non-finite or non-positive count, or fewer than two classes reads
// the honest silence (null). The order is deterministic (count desc,
// then the name's own byte: 'admission' < 'doomed' < 'no-path' <
// 'other' < 'timeout' < 'water-rescue'). The honest-refusal caveat is
// the reader's own (the v0.778.0 verdict's own): the admission and
// water-rescue classes are the fleet's own saves - a rider pair that
// carries them prices the lane's honest shape, not a defect's seat.
export function dropWalkRiders (byWhy) {
  const mix = (byWhy && typeof byWhy === 'object' && !Array.isArray(byWhy)) ? byWhy : {}
  const tallies = {}
  let total = 0
  for (const [why, n] of Object.entries(mix)) {
    if (typeof why !== 'string' || !why || !Number.isFinite(n) || n <= 0) continue
    total += n
    tallies[why] = (tallies[why] || 0) + n
  }
  if (total <= 0) return null
  const ranked = Object.entries(tallies).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
  if (ranked.length < 2) return null
  const [leader, leaderOwns] = ranked[0]
  const [runner, runnerOwns] = ranked[1]
  const pairOwns = leaderOwns + runnerOwns
  return { leader, leaderOwns, runner, runnerOwns, ofFails: total, pairOwns, shareOfFails: +(pairOwns / total).toFixed(3), duet: leaderOwns === runnerOwns }
}

// (v0.785.0) the why riders' own row - THE DROP'S OWN MIX: a measure
// of the shape, never a named owner (the verdict's tie law holds); the
// pair prices the concentration the solo law refused to seat. Junk
// never prints a shape (the honest silence's own row law).
export function dropWalkRidersRow (r) {
  if (!r || typeof r !== 'object') return null
  const { leader, leaderOwns, runner, runnerOwns, ofFails, pairOwns, shareOfFails } = r
  if (typeof leader !== 'string' || !leader || typeof runner !== 'string' || !runner ||
      !Number.isFinite(leaderOwns) || leaderOwns <= 0 || !Number.isFinite(runnerOwns) || runnerOwns <= 0 ||
      !Number.isFinite(ofFails) || ofFails <= 0 || !Number.isFinite(pairOwns) || pairOwns > ofFails ||
      !Number.isFinite(shareOfFails)) return null
  return `the drop-walk's own why riders (v0.785.0): no solo why owns the majority - ${leader} x${leaderOwns} + ${runner} x${runnerOwns} own ${pairOwns} of ${ofFails} fail(s) (${(shareOfFails * 100).toFixed(1)}%) - THE DROP'S OWN MIX: the verdict's tie law held, the mix is the shape - the drop-walk's own crowd prices the classes the solo law refused to name`
}
