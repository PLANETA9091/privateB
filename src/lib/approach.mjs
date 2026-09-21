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
    const seg = approachTargetPos({ from, to: targetPos })
    if (!seg) break // close enough (or unreadable): the direct ladder takes over
    let rawOk = false
    if (typeof rawWalk === 'function') {
      try {
        const r = await rawWalk(bot, seg, { timeoutMs: Math.min(slice, left) })
        rawOk = !!(r && (r.walked === true || r === true))
      } catch { /* stall/timeout: the segment ends, the pathfinder fallback runs */ }
    }
    let pathOk = false
    if (!rawOk) {
      try {
        await gotoSafe(bot, new goals.GoalNear(seg.x, seg.y, seg.z, 2), { timeoutMs: Math.min(slice, left), label: 'approach segment' })
        pathOk = true
      } catch { /* whatever the segment could not cross stays - report honestly */ }
    }
    // A resolved goal is NOT a walked segment (the run51 raw walks resolved
    // nothing but stood still): the only truth is the POSITION delta.
    const after = posOf(bot)
    const moved = !!(from && after && dist3(from, after) > 0.5)
    segmentsUsed.push(seg)
    const dNow = dist3(after, targetPos)
    if (Number.isFinite(dNow)) d = dNow
    if ((rawOk || (pathOk && moved)) && Number.isFinite(d) && d <= threshold) { endWhy = 'inside the direct envelope'; break }
    if (!moved) { endWhy = 'a segment stalled (no position delta)'; break } // one immobile segment is enough: the caller's ladder owns the rest
  }
  const ok = Number.isFinite(d) && d <= threshold
  if (segmentsUsed.length) log(`approach: ${segmentsUsed.length} segment(s) walked in ${((Date.now() - started) / 1000).toFixed(1)}s, goal now d=${Number.isFinite(d) ? d.toFixed(1) : '?'} (${ok ? 'inside the direct envelope' : `still outside - ${endWhy}`})`)
  return { walked: ok, d, segments: segmentsUsed.length }
}
