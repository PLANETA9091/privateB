// The APPROACH SEGMENT walk (v0.56.0) - the cure for the doomed far hop.
//
// WHAT MEASURED (dispatch 35639593200, run51, the v0.51 tip fleet): F17 surfaced
// from its shaft ("final climb: OK +10 levels") and hopped 8 chests from
// d=33..43 - every hop failed, 7x 'No path to the goal!' under the WIDENED hop
// pathfinder (radius 48, think 4500ms), then the walk floor ate the rest and the
// whole 1118-unit fleet pocket never banked (banked=0, smelted=0, 0 'yard walk
// arrived' lines the entire run). A direct goal 33-43 blocks out across QUARRIED
// terrain needs a path longer than the hop's search envelope by construction:
// the A* either refuses ('No path') or burns its think window wandering. The
// bot STOOD 35 blocks from the chests with no way to walk a straight line to
// them, and every retry repeated the identical doomed geometry.
//
// THE CURE: break the walk into SEGMENTS. One segment at most
// APPROACH_SEGMENT_MAX blocks toward the chest leaves the remaining distance
// inside the pathfinder's comfortable envelope; the final hop then runs the
// EXISTING ladder (raw hop -> pathfinder) against a goal it can actually
// route. The segment walk itself is raw-FIRST (the walkRawToward lesson: a
// straight line on open ground needs zero A*) with a pathfinder fallback to
// the INTERMEDIATE point - a goal maxSegment away always fits the global
// searchRadius 32 envelope.
//
// This module is PURE PLANNER + INJECTED MECHANISM: it never imports
// deposit.mjs (the caller passes walkRawToward as a dep) so the deposit
// engine can use it without a cycle, and CI tests every branch with mocks.

import pathfinderPkg from 'mineflayer-pathfinder'
import { gotoSafe } from './jobqueue.mjs'

const { goals } = pathfinderPkg

// Beyond this distance a direct chest hop is doomed-by-geometry (the run51
// F17 class): approach first. Below it the existing ladder (proximate fast
// path, raw hop, pathfinder) keeps every v0.45-0.48 semantic untouched.
export const APPROACH_THRESHOLD = 24
export const APPROACH_SEGMENT_MAX = 20 // one segment always fits searchRadius 32
// (v0.61.0) 8 -> 4: the run58 evidence (dispatch 35657683920) measured THREE
// independent F14 attempts each ending 'goal now d=28.1/28.2/27.7 (still
// outside)' - with minRemaining 8 the planner stopped closing at d=28 and the
// direct ladder failed there every time (the run51 pit geometry lives well
// below the hop's 48 radius). The planner must close PAST the 24 threshold:
// the last segment steps (dist - 4), so d=28 walks to ~8 and the proximate
// fast-path / raw hop owns the final blocks it can actually see.
export const APPROACH_MIN_REMAINING = 4
export const APPROACH_SEGMENT_MS = 15000 // a 20-block raw walk ~10s + margin
// (v0.61.0) the hard safety cap: run58 measured chests d=60-75 (the F14/F16
// approach lines started at d=60+ after the end-phase walk) where the old
// cap of 2 segments (<= 40 blocks of closing) was doomed BY ARITHMETIC - the
// log itself said '2 segment(s) walked, goal now d=34.1 (still outside)'.
// 8 segments = 160 blocks of closing - more than any measured chest row -
// while the anti-spin guard (one immobile segment ends the loop) and the
// caller's budgetMs keep the loop honest in time, not in segment count.
export const APPROACH_MAX_SEGMENTS = 8

// (v0.147.0) THE PATH-GEOMETRY ERROR CLASS - the walk failures a nudge can
// actually cure. run85 (dispatch 36016062585, the v0.146.0 commune's first
// field test) decomposed the smelt collapse: of the 12 zero verdicts, 10 were
// the PATH class - 6 'no fuel' whose commons chest walks died
// 'Took to long to decide path to goal!' x4 + a 1050ms timeout, 3 machine
// walks 'Took to long to decide path to goal!', 1 'No path to the goal!'.
// Both strings are mineflayer-pathfinder's OWN verdicts, and both are
// geometry-honest: the A* explored the failed bot's START and could not
// route. Retrying the identical goto from the identical position is a
// deterministic re-failure (run85: the walk loop's 3 attempts all died on
// it) - the start must change. The nudge (approachWalk, one bounded shot)
// IS the start change; the v0.87.0 doctrine says it in one line: the doomed
// geometry is the failed bot's start, not the destination.
export const PATH_GEOMETRY_RE = /Took to long to decide path to goal!|No path to the goal!/

// (v0.157.0) THE CLOSE SHOT - the nudge's blind spot, run58's field verdict.
// MEASURED (dispatch 36055223458, the v0.155.0/v0.156.0 fleet): the yard
// nudge machinery FIRED and immediately surrendered - 'F2 fuel commons: path
// nudge inside the direct envelope' then 'chest walk failed after the nudge
// (Took to long to decide path to goal!)' x5+ (F2/F6/F9/F17), 'iron commune:
// path nudge inside the direct envelope' + the same re-failure (F2/F17/F9).
// The mechanism: the failed bot stood INSIDE the 24b approach envelope, so
// approachTargetPos returned null (its gate is `dist <= maxSegment +
// minRemaining` = 20+4), the nudge's approachWalk emitted ZERO segments, the
// start NEVER changed, and the re-goto re-failed the decide class
// deterministically - the exact disease the nudge was built to cure, alive
// at close range. The close shot keeps the doctrine honest: the start must
// change AT ANY DISTANCE. The shot walks straight at the goal and stops
// `stop` blocks short (2) - close enough that the direct ladder (the
// proximate fast path, the raw hop) owns the final blocks it can see.
// Below stop+1 the shot refuses (the raw ladder owns a 2-block walk by
// construction; a shot there would just push the bot INTO the chest).
export const CLOSE_SHOT_STOP = 2

/**
 * Pure: the point `stop` blocks short of `to` along the from->to line, or
 * null when `from` is too close for the shot to be worth anything. Junk-safe
 * like approachTargetPos (non-finite coordinates yield null).
 * @param {{from?: {x?: number, y?: number, z?: number}, to?: {x?: number, y?: number, z?: number},
 *          stop?: number}} p
 * @returns {{x: number, y: number, z: number}|null}
 */
export function closeShotTarget ({ from, to, stop = CLOSE_SHOT_STOP } = {}) {
  const fx = Number(from?.x); const fy = Number(from?.y); const fz = Number(from?.z)
  const tx = Number(to?.x); const ty = Number(to?.y); const tz = Number(to?.z)
  if (![fx, fy, fz, tx, ty, tz].every(Number.isFinite)) return null
  const dx = tx - fx; const dy = ty - fy; const dz = tz - fz
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
  const s = Number.isFinite(stop) && stop >= 0 ? stop : CLOSE_SHOT_STOP
  if (!Number.isFinite(dist) || dist <= s + 1) return null // too close: the raw ladder owns it
  const k = (dist - s) / dist
  return { x: fx + dx * k, y: fy + dy * k, z: fz + dz * k }
}

/**
 * Pure: the intermediate point one segment toward `to`, or null when `from`
 * is close enough for the direct ladder. Plain {x,y,z} (no Vec3 in the pure
 * layer so CI runs without a server). Junk-safe: any non-finite coordinate
 * or a degenerate distance yields null (no approach).
 * @param {{from?: {x?: number, y?: number, z?: number}, to?: {x?: number, y?: number, z?: number},
 *          maxSegment?: number, minRemaining?: number}} p
 * @returns {{x: number, y: number, z: number}|null}
 */
export function approachTargetPos ({ from, to, maxSegment = APPROACH_SEGMENT_MAX, minRemaining = APPROACH_MIN_REMAINING } = {}) {
  const fx = Number(from?.x); const fy = Number(from?.y); const fz = Number(from?.z)
  const tx = Number(to?.x); const ty = Number(to?.y); const tz = Number(to?.z)
  if (![fx, fy, fz, tx, ty, tz].every(Number.isFinite)) return null
  const dx = tx - fx; const dy = ty - fy; const dz = tz - fz
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
  const maxSeg = Number.isFinite(maxSegment) && maxSegment > 0 ? maxSegment : APPROACH_SEGMENT_MAX
  const minRem = Number.isFinite(minRemaining) && minRemaining >= 0 ? minRemaining : APPROACH_MIN_REMAINING
  if (!Number.isFinite(dist) || dist <= maxSeg + minRem) return null
  const step = Math.min(maxSeg, dist - minRem)
  const k = step / dist
  return { x: fx + dx * k, y: fy + dy * k, z: fz + dz * k }
}

const dist3 = (a, b) => {
  const dx = Number(a?.x) - Number(b?.x); const dy = Number(a?.y) - Number(b?.y); const dz = Number(a?.z) - Number(b?.z)
  if (![dx, dy, dz].every(Number.isFinite)) return Infinity
  return Math.sqrt(dx * dx + dy * dy + dz * dz)
}

const posOf = bot => {
  const p = bot?.entity?.position
  if (!p || !Number.isFinite(p.x)) return null
  return { x: p.x, y: p.y, z: p.z }
}

/**
 * Walk up to `maxSegments` raw/pathfinder segments toward `targetPos`, stopping
 * as soon as the remaining distance enters the direct-ladder envelope.
 * (v0.61.0) THE BUDGET LOOP: segments continue while the caller's `budgetMs`
 * wall clock lasts and every segment moves the bot - the run58 far-chest class
 * (d=60-75) needs 3-4 segments, not the v0.56.0 cap of 2. The clock, not the
 * segment count, is the honest bound: the last affordable segment's slice
 * clamps to the remaining budget, and the anti-spin rule (one immobile
 * segment ends the loop) survives unchanged.
 * NEVER THROWS: a failed segment just ends the approach (the caller's existing
 * walk ladder then reports honestly). Every control path clears its own state
 * because the raw walker (walkRawToward) owns its finally.
 * @param {object} bot a mineflayer bot (or a mock with entity.position + look/setControlState)
 * @param {{x: number, y: number, z: number}} targetPos the far goal (plain or Vec3)
 * @param {object} [opts]
 * @param {number} [opts.threshold] approach while the goal is farther than this (default APPROACH_THRESHOLD)
 * @param {number} [opts.maxSegments] hard segment cap (default APPROACH_MAX_SEGMENTS)
 * @param {number} [opts.segmentMs] per-segment budget (default APPROACH_SEGMENT_MS)
 * @param {number} [opts.budgetMs] TOTAL wall clock for the whole loop (default Infinity - the cap governs; the deposit wiring passes the chain clock minus the walk floor)
 * @param {Function} [opts.rawWalk] async (bot, pos, {timeoutMs}) => walked - injected by the caller (deposit.mjs passes walkRawToward); null skips the raw attempt
 * @param {Function} [opts.log] line sink
 * @returns {Promise<{walked: boolean, d: number|null, segments: number}>} walked=true when the goal is within the threshold
 */
export async function approachWalk (bot, targetPos, {
  threshold = APPROACH_THRESHOLD,
  maxSegments = APPROACH_MAX_SEGMENTS,
  segmentMs = APPROACH_SEGMENT_MS,
  budgetMs = Infinity,
  rawWalk = null,
  closeShot = false, // (v0.157.0) emit a straight-at-goal segment even INSIDE the envelope (the close-decide cure)
  log = () => {}
} = {}) {
  const segmentsUsed = []
  let d = dist3(posOf(bot), targetPos)
  const cap = Number.isFinite(maxSegments) && maxSegments > 0 ? maxSegments : APPROACH_MAX_SEGMENTS
  const slice = Number.isFinite(segmentMs) && segmentMs > 0 ? segmentMs : APPROACH_SEGMENT_MS
  const budget = Number.isFinite(budgetMs) && budgetMs >= 0 ? budgetMs : Infinity // 0 = no approach at all; junk = the cap governs
  const started = Date.now()
  let endWhy = 'inside the direct envelope'
  for (let n = 0; n < cap; n++) {
    const left = budget - (Date.now() - started)
    if (left <= 0) { endWhy = 'the approach clock is spent'; break }
    const from = posOf(bot)
    // (v0.157.0) THE CLOSE SHOT as a FALLBACK, not a replacement: the legacy
    // planner owns every goal outside the envelope (the far-decide segments
    // keep their v0.155.0 targets byte-identical). Only when it returns null
    // (the goal inside the envelope - the run58 blind spot where the start
    // never changed) does the close shot emit one straight segment stopping
    // `stop` blocks short. The segment moves via the loop's own pathfinder
    // fallback below (the run58 F6 evidence: the segment walk is exactly what
    // the A* CAN route when the final goal refuses - 1 segment walked in
    // 0.4s), the move check + the anti-spin rule stay the only truth.
    let seg = approachTargetPos({ from, to: targetPos })
    if (!seg && closeShot) seg = closeShotTarget({ from, to: targetPos })
    if (!seg) break // close enough (or unreadable): the direct ladder takes over
    let rawOk = false
    if (typeof rawWalk === 'function') {
      try {
        const r = await rawWalk(bot, seg, { timeoutMs: Math.min(slice, left) })
        rawOk = !!(r && (r.walked === true || r === true))
      } catch { /* stall/timeout: the segment ends, the pathfinder fallback runs */ }
    }
    // (v0.62.0) the PHANTOM RAW CURE: a raw walk can report walked=true while
    // the bot stood still (stalled against a ledge - run60 measured 13/13
    // approach chains ending 'stalled (no position delta)', most at the SAME
    // ring d=24.5-27.0 around the chests, F5 three separate attempts at
    // d=24.5-24.9: a reproducible obstacle, not random crowd crush). The old
    // flow ran the pathfinder only when raw FAILED TO REPORT - a phantom
    // success ate the segment and A* never tried, even though routing AROUND
    // an obstacle is exactly what it can do that a straight raw walk cannot.
    // The position delta is the only truth (the run51 lesson): when the raw
    // attempt produced none, the pathfinder gets the segment too.
    let after = posOf(bot)
    let moved = !!(from && after && dist3(from, after) > 0.5)
    let pathOk = false
    if (!moved) {
      try {
        await gotoSafe(bot, new goals.GoalNear(seg.x, seg.y, seg.z, 2), { timeoutMs: Math.min(slice, left), label: 'approach segment' })
        pathOk = true
      } catch { /* whatever the segment could not cross stays - report honestly */ }
      after = posOf(bot)
      moved = !!(from && after && dist3(from, after) > 0.5)
    }
    segmentsUsed.push(seg)
    const dNow = dist3(after, targetPos)
    if (Number.isFinite(dNow)) d = dNow
    if (moved && Number.isFinite(d) && d <= threshold) { endWhy = 'inside the direct envelope'; break }
    if (!moved) { endWhy = 'a segment stalled (no position delta)'; break } // one immobile segment is enough: the caller's ladder owns the rest
  }
  // (v0.162.0) THE HONEST CAP VERDICT - run559 (dispatch 36073741918, the
  // v0.161.0 union fleet, a 300s window) caught the self-contradicting line:
  // 'F14 approach: 8 segment(s) walked in 55.9s, goal now d=33.7 (still
  // outside - inside the direct envelope)' - EIGHT segments, still 33.7
  // blocks out, and the verdict claimed the direct envelope. The mechanism:
  // endWhy initializes to 'inside the direct envelope' and the only exits
  // that NAME a spend are the budget break and the stall break - when the
  // loop exhausts its segment CAP naturally it falls out with the default
  // text still set, so a cap-exhausted approach prints the one verdict it
  // did NOT earn. The field decodes read these lines - a lie here poisons
  // every downstream read. The cap-exhaust shape is unambiguous: endWhy
  // still the default (the envelope break implies d <= threshold, the other
  // breaks name themselves) AND d > threshold. Name the cap honestly.
  if (endWhy === 'inside the direct envelope' && Number.isFinite(d) && d > threshold) {
    endWhy = `the segment cap spent (${segmentsUsed.length} walked, d=${d.toFixed(1)})`
  }
  const ok = Number.isFinite(d) && d <= threshold
  if (segmentsUsed.length) log(`approach: ${segmentsUsed.length} segment(s) walked in ${((Date.now() - started) / 1000).toFixed(1)}s, goal now d=${Number.isFinite(d) ? d.toFixed(1) : '?'} (${ok ? 'inside the direct envelope' : `still outside - ${endWhy}`})`)
  return { walked: ok, d, segments: segmentsUsed.length }
}

// (v0.124.0) THE YARD APPROACH PLAN - the pure gate the fleet's yard walk
// consults before its direct ladder. run107 (35915999513, NORMAL END but
// banked=13 on 3485 mined, unaccounted 1284): the bank chains climbed out
// (F2: +14 levels, 116s of a 162s budget) and then the yard walk died
// 'chest unreachable (No path to the goal!) (51 blocks from yard)' - 51 >
// searchRadius 48, a walk doomed BY CONSTRUCTION, x31 fleet-wide, and every
// failure doom-ledgered the chest cells for 15s (1074 funnel re-issues
// refused, 5x run106's 206) so the fuel commons and the final banks starved
// behind them. The deposit chain has carried the approach segment since
// v0.56.0 (the run51 F17 cure) - the yard walk never got it. The plan keeps
// every junk shape honest: no distance / inside the envelope / the unbounded
// legacy clock (the deposit chain's own byte-identical rule - no deadline in
// play means no approach) / a clock that cannot afford one segment + the
// walk floor never start a doomed hop with extra steps.
export const YARD_APPROACH_FLOOR_MS = 5000 // matches deposit.mjs BUDGET_WALK_FLOOR_MS; the caller passes its own

export function yardApproachPlan ({
  yardDist = null,
  remainingMs = null,
  walkMs = 0,
  threshold = APPROACH_THRESHOLD,
  segmentMs = APPROACH_SEGMENT_MS,
  floorMs = YARD_APPROACH_FLOOR_MS
} = {}) {
  const d = Number.isFinite(yardDist) && yardDist > 0 ? yardDist : null
  if (d == null) return { approach: false, why: 'no yard distance' }
  if (d <= threshold) return { approach: false, why: 'inside the direct envelope' }
  // The unbounded legacy: the deposit chain skips the approach when no chain
  // clock exists - the yard walk keeps the same byte-identical rule.
  const left = Number.isFinite(remainingMs) ? remainingMs : null
  if (left == null) return { approach: false, why: 'unbounded clock (legacy shape)' }
  const seg = Number.isFinite(segmentMs) && segmentMs > 0 ? segmentMs : APPROACH_SEGMENT_MS
  const floor = Number.isFinite(floorMs) && floorMs > 0 ? floorMs : YARD_APPROACH_FLOOR_MS
  if (left < seg + floor) return { approach: false, why: 'the clock cannot afford a segment + the walk floor' }
  // The walk slice only CLAMPS the segment downward (a thin slice must not
  // start a segment it cannot pay); junk reads as the segment cap - the real
  // constraint is the budget clock, and approachWalk itself treats a 0 slice
  // as its default.
  const slice = Math.max(0, Math.min(Number.isFinite(walkMs) && walkMs > 0 ? walkMs : seg, seg))
  return {
    approach: true,
    why: `${Math.round(d)}b beyond the ${Math.round(threshold)}b envelope`,
    segmentMs: slice,
    budgetMs: Math.max(0, left - floor)
  }
}
