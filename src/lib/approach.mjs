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
export const APPROACH_MIN_REMAINING = 8 // leave the last blocks to the normal ladder
export const APPROACH_SEGMENT_MS = 15000 // a 20-block raw walk ~10s + margin

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
 * NEVER THROWS: a failed segment just ends the approach (the caller's existing
 * walk ladder then reports honestly). Every control path clears its own state
 * because the raw walker (walkRawToward) owns its finally.
 * @param {object} bot a mineflayer bot (or a mock with entity.position + look/setControlState)
 * @param {{x: number, y: number, z: number}} targetPos the far goal (plain or Vec3)
 * @param {object} [opts]
 * @param {number} [opts.threshold] approach while the goal is farther than this (default APPROACH_THRESHOLD)
 * @param {number} [opts.maxSegments] hard segment cap (default 2)
 * @param {number} [opts.segmentMs] per-segment budget (default APPROACH_SEGMENT_MS)
 * @param {Function} [opts.rawWalk] async (bot, pos, {timeoutMs}) => walked - injected by the caller (deposit.mjs passes walkRawToward); null skips the raw attempt
 * @param {Function} [opts.log] line sink
 * @returns {Promise<{walked: boolean, d: number|null, segments: number}>} walked=true when the goal is within the threshold
 */
export async function approachWalk (bot, targetPos, {
  threshold = APPROACH_THRESHOLD,
  maxSegments = 2,
  segmentMs = APPROACH_SEGMENT_MS,
  rawWalk = null,
  log = () => {}
} = {}) {
  const segmentsUsed = []
  let d = dist3(posOf(bot), targetPos)
  const cap = Number.isFinite(maxSegments) && maxSegments > 0 ? maxSegments : 2
  const slice = Number.isFinite(segmentMs) && segmentMs > 0 ? segmentMs : APPROACH_SEGMENT_MS
  for (let n = 0; n < cap; n++) {
    const from = posOf(bot)
    const seg = approachTargetPos({ from, to: targetPos })
    if (!seg) break // close enough (or unreadable): the direct ladder takes over
    let rawOk = false
    if (typeof rawWalk === 'function') {
      try {
        const r = await rawWalk(bot, seg, { timeoutMs: slice })
        rawOk = !!(r && (r.walked === true || r === true))
      } catch { /* stall/timeout: the segment ends, the pathfinder fallback runs */ }
    }
    let pathOk = false
    if (!rawOk) {
      try {
        await gotoSafe(bot, new goals.GoalNear(seg.x, seg.y, seg.z, 2), { timeoutMs: slice, label: 'approach segment' })
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
    if ((rawOk || (pathOk && moved)) && Number.isFinite(d) && d <= threshold) break
    if (!moved) break // one immobile segment is enough: the caller's ladder owns the rest
  }
  const ok = Number.isFinite(d) && d <= threshold
  if (segmentsUsed.length) log(`approach: ${segmentsUsed.length} segment(s) walked, goal now d=${Number.isFinite(d) ? d.toFixed(1) : '?'} (${ok ? 'inside the direct envelope' : 'still outside - the ladder reports honestly'})`)
  return { walked: ok, d, segments: segmentsUsed.length }
}
