// (v0.689.0, hop lane v0.695.0) THE DECIDE WEATHER - the A* starvation's
// own sky read.
//
// The decide clock (v0.413.0) priced the starvation's clustering (the
// densest 30s window names a CPU/pressure window) but never read the SKY
// the starves sat under. The memory correlation front (the lens era's
// central thread, 8 points across faces 20..27: the rss climbs kill, the
// ents are passengers) reads the face's own ceiling; the starves' own
// weather stayed unread - the question 'does the A* starve under the
// entity climb's pressure, or on its own geometry' had no field. This
// lens joins every decide refusal (walkfail's own family: the chest-walk
// decide-timeouts + the sweep's machine-unreachable-decide-timeout
// attempts - the house's A* starvation definition, v0.410.0's own scope;
// the bank lane's refusals stay bankfail's own read) to the nearest mem
// gauge at or before the starve's own heartbeat anchor.
//
// (v0.695.0) THE HOP LANE'S SKY: the hop-zero lane (v0.399.0) carried its
// own decide-timeout zeros all along - the 30th face's hop clock priced 9
// of them, the hottest spot the BANK YARD's own chest band - but the
// weather read them not (the v0.689.0 scope was walkfail's family only).
// The hop lane's own zeros join the same sky, the same law (the last
// gauge at or before the zero's own anchor; a zero before the first
// anchored gauge stays ungauged), under a SEPARATE row - the lanes share
// the sky, never the count (the walk-fail family's fields keep their
// own shape, the v0.689.0 tests ride untouched):
//
//   the starve's ts = the last hb ts seen before its line (the
//     deathdrop stamp law - one truth, the decide clock's own anchor)
//   the gauge's ts  = the last hb ts seen before the mem: line (the
//     same law; the gauge rides its cycle's own anchor)
//   the join        = the last gauge with gaugeTs <= failTs (the
//     cadence's own ~16s staleness is the read's grain - the sky at the
//     starve, never a future sky)
//
// (v0.695.0) THE DRAINED SKY: a gauge can read ents 0 AND cols 0 - the
// face's own entity drain (the 30th's gauges read 678 -> 389 -> 116 -> 0
// across ts 601..641s while the rss HELD 452..455M). A zero joined to a
// drained gauge is the crowded-sky hypothesis's own falsifier inside the
// same face - the starve the entity climb cannot explain. The hop field
// names them (drained n/of + the drained joins' own rss band) - the
// pressure that stayed is the row's own suspect.
//
// verdict shape: decideWeather(lines) ->
//   { fails, timed, gauged, ungauged,
//     ents: {min, median, max}|null, rss: {min, median, max}|null,
//     faceEntsMax, faceRssMax, crowded: {n, of}|null,
//     hop: { zeros, gauged, ungauged,
//            ents: {min, median, max}|null, rss: {min, median, max}|null,
//            crowded: {n, of}|null,
//            drained: {n, of}|null, drainedRss: {min, median, max}|null } }
//
// crowded = the gauged starves at or past HALF the face's own anchored
// ents ceiling (the crowded-sky share); null when no gauged starve or a
// zero/absent ceiling - the share never invents itself. The sweep pair's
// n attempts all join the same sky (the decide clock's own law: the
// attempts are the cohort's currency - more attempts, more starvation
// under that sky).
//
// THE ONE-PARSER LAW held by import: parseWalkFail / parseSweepVerdict /
// classifySweepReason (walkfail.mjs), parseMemLine (memhb.mjs),
// parseHeartbeat (stormcensus.mjs), parseHopZero (hopcensus.mjs) - zero
// new regexes; the join is the only new read. Mining-surface only: zero
// fleet wiring, zero new log lines (the v0.379.0 precedent). Junk-safe
// end to end: a non-array reads the zero shape, non-string rows are
// skipped, an unanchored gauge never joins, a fail before the first
// anchored gauge stays ungauged - the stamp never invents.

import { parseHeartbeat } from './stormcensus.mjs'
import { parseMemLine } from './memhb.mjs'
import { parseWalkFail, parseSweepVerdict, classifySweepReason } from './walkfail.mjs'
import { parseHopZero } from './hopcensus.mjs'

const medianOf = (xs) => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2
}

const tripleOf = (xs) => xs.length === 0
  ? null
  : { min: Math.min(...xs), median: medianOf(xs), max: Math.max(...xs) }

/**
 * The decide weather: every A* decide starvation joined to the mem gauge
 * at or before its own anchor - the starve's own sky.
 * @param {string[]|string} [lines] the face log (array or raw blob)
 * @returns {{fails: number, timed: number, gauged: number, ungauged: number,
 *   ents: {min: number, median: number, max: number}|null,
 *   rss: {min: number, median: number, max: number}|null,
 *   faceEntsMax: number|null, faceRssMax: number|null,
 *   crowded: {n: number, of: number}|null}}
 */
export function decideWeather (lines) {
  const rows = Array.isArray(lines)
    ? lines
    : (typeof lines === 'string' ? lines.split('\n') : [])
  const gaugeTs = []
  const gaugeEnts = []
  const gaugeRss = []
  const gaugeCols = []
  let faceEntsMax = null
  let faceRssMax = null
  const failTs = []
  const hopFailTs = []
  let lastT = null
  for (const l of rows) {
    if (typeof l !== 'string') continue
    const hb = parseHeartbeat(l)
    if (hb) lastT = hb.tsS
    const mem = parseMemLine(l)
    if (mem) {
      // the gauge rides its cycle's own anchor; an unanchored gauge
      // (pre-first-hb) never joins and never prices the ceiling
      if (lastT !== null) {
        gaugeTs.push(lastT)
        gaugeEnts.push(mem.ents)
        gaugeRss.push(mem.rss)
        gaugeCols.push(mem.cols)
        if (faceEntsMax === null || mem.ents > faceEntsMax) faceEntsMax = mem.ents
        if (faceRssMax === null || mem.rss > faceRssMax) faceRssMax = mem.rss
      }
      continue
    }
    const wf = parseWalkFail(l)
    if (wf) {
      if (wf.why === 'decide-timeout') failTs.push(lastT)
      continue
    }
    const sv = parseSweepVerdict(l)
    if (sv) {
      for (const p of sv.pairs) {
        const cls = classifySweepReason(p.reason)
        if (cls.why === 'machine-unreachable-decide-timeout') {
          for (let i = 0; i < p.n; i++) failTs.push(lastT)
        }
      }
      continue
    }
    // (v0.695.0) the hop lane's own decide-timeout zeros - the same sky,
    // a separate count (the lanes share the weather, never the ledger)
    const hz = parseHopZero(l)
    if (hz && hz.klass && hz.klass.why === 'decide-timeout') {
      hopFailTs.push(lastT)
    }
  }
  const timed = failTs.filter((t) => t !== null).length
  const gaugedEnts = []
  const gaugedRss = []
  let ungauged = 0
  for (const t of failTs) {
    if (t === null) continue
    // the last gauge at or before the starve's own anchor
    let g = -1
    for (let i = 0; i < gaugeTs.length; i++) {
      if (gaugeTs[i] <= t) g = i
      else break
    }
    if (g === -1) { ungauged++; continue }
    gaugedEnts.push(gaugeEnts[g])
    gaugedRss.push(gaugeRss[g])
  }
  const gauged = gaugedEnts.length
  let crowded = null
  if (gauged > 0 && faceEntsMax !== null && faceEntsMax > 0) {
    const half = faceEntsMax / 2
    crowded = { n: gaugedEnts.filter((e) => e >= half).length, of: gauged }
  }
  // (v0.695.0) the hop lane's own join - the same gauge walk, its own book
  const hopGaugedEnts = []
  const hopGaugedRss = []
  let hopUngauged = 0
  const hopDrainedRss = []
  for (const t of hopFailTs) {
    if (t === null) continue
    let g = -1
    for (let i = 0; i < gaugeTs.length; i++) {
      if (gaugeTs[i] <= t) g = i
      else break
    }
    if (g === -1) { hopUngauged++; continue }
    hopGaugedEnts.push(gaugeEnts[g])
    hopGaugedRss.push(gaugeRss[g])
    // the drained sky: the joined gauge's own counters at zero - the
    // starve the entity climb cannot explain
    if (gaugeEnts[g] === 0 && gaugeCols[g] === 0) hopDrainedRss.push(gaugeRss[g])
  }
  const hopGauged = hopGaugedEnts.length
  let hopCrowded = null
  if (hopGauged > 0 && faceEntsMax !== null && faceEntsMax > 0) {
    const half = faceEntsMax / 2
    hopCrowded = { n: hopGaugedEnts.filter((e) => e >= half).length, of: hopGauged }
  }
  const hopDrained = hopDrainedRss.length > 0
    ? { n: hopDrainedRss.length, of: hopGauged }
    : null
  return {
    fails: failTs.length,
    timed,
    gauged,
    ungauged,
    ents: tripleOf(gaugedEnts),
    rss: tripleOf(gaugedRss),
    faceEntsMax,
    faceRssMax,
    crowded,
    hop: {
      zeros: hopFailTs.length,
      gauged: hopGauged,
      ungauged: hopUngauged,
      ents: tripleOf(hopGaugedEnts),
      rss: tripleOf(hopGaugedRss),
      crowded: hopCrowded,
      drained: hopDrained,
      drainedRss: tripleOf(hopDrainedRss)
    }
  }
}
