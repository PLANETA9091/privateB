//
// beatrail.mjs - THE BEAT RAIL'S OWN CONTINUITY (v0.822.0)
// The v0.820.0 beat rail made the heartbeat's self-rescheduling
// setTimeout chain one setInterval with a fully wrapped tick body -
// the rail that cannot die of one missed reschedule. But the rail's
// own FIELD verdict never rode the mining surface: the distress row
// (stormcensus's hb count, the v0.409.0 line) prices the late peaks
// yet never asks whether the beat SERIES itself held - whether the
// n= increments stayed one-by-one and the ts= clock stayed on its own
// cadence, or a gap rode the log unread (the face-96 story: the beats
// stopped at n=16 ts=321s and the 46s of forming storm after them
// rode no beat at all - the starvation lens' own hole).
//
// THE READ (pure on the fleet-log lines - one parser, one truth: the
// same parseHeartbeat the storm census rides):
//   n continuity  - the n= counter must step exactly +1 per beat; a
//     skip, a repeat or a regression is the rail's own scar (a missed
//     reschedule's signature);
//   ts continuity - the ts= clock's steps read the cadence; the
//     median step is the face's own expected interval, a step past
//     3x the median is a GAP (the clock's own stall - the window the
//     beats never covered), a zero/negative step a regression;
//   unbroken      - no n scars, no gaps, no regressions - THE RAIL
//     HELD (the setInterval's own word).
//
// The tail silence (the kill ending the series - n=17 never landing)
// is NOT a gap: the log's own end is the story the exit carries, the
// mid-series read never invents a scar the emitter never wrote.
//
// Mining-surface only: zero fleet wiring, zero new log lines.
// Junk-safe end to end: junk lines ride nothing, a series too short
// to judge (0 or 1 beat) reads the honest silence.
//

import { parseHeartbeat } from './stormcensus.mjs'

/**
 * Read the beat rail's own continuity - the n= and ts= series off the
 * heartbeat lines. Pure census on parseHeartbeat, no re-parsing.
 * @param {string[]} lines one fleet-log, all lines
 * @returns {null|{beats: number, nFirst: number, nLast: number, nJumps: number, nSkipMax: number, medianStepS: number, maxStepS: number, gaps: {fromTs: number, toTs: number, gapS: number}[], tsRegress: number, unbroken: boolean}}
 */
export function beatRailContinuity (lines) {
  if (!Array.isArray(lines)) return null
  const beats = []
  for (const line of lines) {
    const hb = parseHeartbeat(line)
    if (hb && Number.isFinite(hb.n) && Number.isFinite(hb.tsS)) beats.push(hb)
  }
  if (beats.length < 2) return null
  let nJumps = 0
  let nSkipMax = 0
  let tsRegress = 0
  const steps = []
  for (let i = 1; i < beats.length; i++) {
    const dn = beats[i].n - beats[i - 1].n
    if (dn !== 1) {
      nJumps++
      if (dn > nSkipMax) nSkipMax = dn
    }
    const dt = beats[i].tsS - beats[i - 1].tsS
    if (dt <= 0) {
      tsRegress++
    } else {
      steps.push(dt)
    }
  }
  const sorted = [...steps].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  const medianStepS = sorted.length
    ? (sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2)
    : 0
  const gapFloor = medianStepS * 3 // a step past 3x the cadence = the clock's own stall
  const gaps = []
  for (let i = 1; i < beats.length; i++) {
    const dt = beats[i].tsS - beats[i - 1].tsS
    if (dt > gapFloor) gaps.push({ fromTs: beats[i - 1].tsS, toTs: beats[i].tsS, gapS: dt })
  }
  const maxStepS = steps.length ? Math.max(...steps) : 0
  const unbroken = nJumps === 0 && gaps.length === 0 && tsRegress === 0
  return {
    beats: beats.length,
    nFirst: beats[0].n,
    nLast: beats[beats.length - 1].n,
    nJumps,
    nSkipMax,
    medianStepS,
    maxStepS,
    gaps,
    tsRegress,
    unbroken
  }
}

// ONE verdict line, only when the series could judge itself (fewer
// than two beats = the honest silence - no cadence to read).
export function beatRailContinuityRow (x) {
  if (!x || !(x.beats >= 2)) return null
  const head = `the beat rail's own continuity (v0.822.0): ${x.beats} beat(s), n ${x.nFirst}->${x.nLast}`
  if (x.unbroken) {
    return `${head}, the ${x.medianStepS}s clock unbroken (max step ${x.maxStepS}s) - THE RAIL HELD (no missed reschedule rode the log)`
  }
  return `${head}, ${x.gaps.length} ts gap(s) (max ${x.gaps.length ? Math.max(...x.gaps.map(g => g.gapS)) : 0}s past the ${x.medianStepS}s clock), ${x.nJumps} n-jump(s), ${x.tsRegress} ts-regress(s) - THE RAIL'S OWN SCAR: the missed reschedule's own signature rides the log (the window the beats never covered)`
}
