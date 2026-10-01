// (v0.409.0) THE STORM EVENT CENSUS - the stormguard verdicts', the
// allocvalve transitions' and the heartbeat distress' field read. THE SPLIT
// OF LABOR (the v0.408.0 collision lesson): the mem gauge's precursor
// fields (rss/heap ceilings, cols/ents population, the evicted partial
// sum's max/jump/resets, the path pair, the stale max, the storm cooldowns
// and the two euthanasia forms) are OWNED by src/lib/memhb.mjs - one
// parser per emitter, never two truths for one line. This census reads the
// three emitters the lens does not:
//
//   1. THE STORMGUARD'S RATE VERDICTS (heartbeat.mjs's worker, v0.55.0 +
//      v0.64.0): the first strike SURVIVES as a probe - '[stormguard]
//      STORM PROBE: rss A M -> B M (+D M in Ws = RMB/s, mainLate Lms;
//      last: ...) - SURVIVING the first strike (...)' - and the second
//      strike / hard ceiling kills - '[stormguard] FATAL (hard ceiling
//      3000M): rss A M -> B M (+D M in Ws = RMB/s ...)'. Both name the
//      storm's OWN numbers (the gain, the rate, the mainLate at the
//      verdict) - the evidence the gauge's 15s cadence can miss.
//
//   2. THE ALLOCVALVE'S TRANSITIONS (v0.102.0, flavors through v0.121.0):
//      every closure names its feeder - '[allocvalve] CLOSED: rss ..M
//      (+..MB/s storm) - long walks refused Ns (strike K, the A* fuel cut;
//      ...) ts=Ts', the v0.115.0 queue-pressure flavor ('CLOSED: path
//      queue Nq sustained Ms (the run101 feeder cut) - ..'), the applied
//      flavors ('CLOSED (funnel probe)', 'CLOSED (worker probe)', 'CLOSED
//      (funnel slow envelope)') - and the reopen ('OPEN: rss ..M after
//      closure (strikes N) - the funnel flows again ts=Ts'). Nobody read
//      the valve's field behavior before: how often the fuel cut armed,
//      WHICH feeder armed it, how long the walks were refused.
//
//   3. THE HEARTBEAT DISTRESS (the worker's own line, the death clock's
//      ts= rail): 'b] n=N ts=Ns rss=..M late=..ms mainLate=..ms' - the
//      late/mainLate peaks are the starvation story the verdicts ride.
//
// Pure parser, unit-pinned (the sealcensus v0.397.0 shape); decompose is
// its field read, alongside the mem-hb lens' precursors block. The
// allocvalve flavors are pinned by ROUND-TRIP through the valve's own
// pure line builders (the builders ARE the emitters). Mining-surface only:
// zero fleet wiring, zero new log lines. Junk-safe end to end: non-string
// rows are skipped, a face with no storm events reads the honest zero
// (the calm-face verdict is itself the read the OOM front needs).

const num = (s) => Number(s)

// The heartbeat worker's line (the death clock's ts= clock, the same rail):
// the prefix varies, the tail shape is pinned - 'b] n=N ts=Ns rss=..M
// late=..ms mainLate=..ms'.
const HB_RE = /b\] n=(\d+) ts=(\d+)s rss=(\d+)M late=(\d+)ms mainLate=(\d+)ms/
export function parseHeartbeat (line) {
  if (typeof line !== 'string') return null
  const m = HB_RE.exec(line)
  if (!m) return null
  return { n: num(m[1]), tsS: num(m[2]), rssM: num(m[3]), lateMs: num(m[4]), mainLateMs: num(m[5]) }
}

// The stormguard's FIRST strike survives (the v0.64.0 probe) - the rate
// story rides the line.
const STORM_PROBE_RE = /\[stormguard\] STORM PROBE: rss (\d+)M -> (\d+)M \(\+(\d+)M in (\d+)s = (\d+)MB\/s, mainLate (\d+)ms/
export function parseStormProbe (line) {
  if (typeof line !== 'string') return null
  const m = STORM_PROBE_RE.exec(line)
  if (!m) return null
  return {
    fromM: num(m[1]), toM: num(m[2]), gainM: num(m[3]), windowS: num(m[4]),
    rateMBs: num(m[5]), mainLateMs: num(m[6]), kind: 'probe'
  }
}

// The second strike / hard ceiling kills. The parenthetical is the
// verdict's own reason text - captured verbatim, never classified (the log
// already named it).
const STORM_FATAL_RE = /\[stormguard\] FATAL \(([^)]*)\): rss (\d+)M -> (\d+)M \(\+(\d+)M in (\d+)s = (\d+)MB\/s/
export function parseStormFatal (line) {
  if (typeof line !== 'string') return null
  const m = STORM_FATAL_RE.exec(line)
  if (!m) return null
  return {
    reason: m[1], fromM: num(m[2]), toM: num(m[3]), gainM: num(m[4]),
    windowS: num(m[5]), rateMBs: num(m[6]), kind: 'fatal'
  }
}

// The allocvalve's closures. The common tail is pinned across every
// flavor: 'long walks refused Ns (strike K' + 'ts=Ts'. The flavor
// classifier reads the line's own words:
//   queue-pressure  'CLOSED: path queue Nq sustained Ms (the run101 feeder cut)'
//   worker-verdict  'CLOSED (worker probe)' / 'the worker verdict .. applied'
//   slow-envelope   'CLOSED (funnel slow envelope)'
//   funnel          'CLOSED (funnel probe)'
//   ticker          the plain 'CLOSED: rss ..M (+..MB/s storm)' transition
const VALVE_CLOSE_RE = /\[allocvalve\] CLOSED.*long walks refused (\d+)s \(strike (\d+)/
const VALVE_CLOSE_RSS_RE = /rss (\d+)M \(\+(\d+)MB\/s/
const VALVE_CLOSE_TS_RE = /ts=(\d+)s/
export function parseValveClose (line) {
  if (typeof line !== 'string') return null
  const m = VALVE_CLOSE_RE.exec(line)
  if (!m) return null
  let flavor = 'ticker'
  const q = /path queue (\d+)q sustained (\d+)s/.exec(line)
  if (q) flavor = 'queue-pressure'
  else if (/worker verdict|worker probe/.test(line)) flavor = 'worker-verdict'
  else if (/slow envelope/.test(line)) flavor = 'slow-envelope'
  else if (/funnel probe/.test(line)) flavor = 'funnel'
  const r = VALVE_CLOSE_RSS_RE.exec(line)
  const t = VALVE_CLOSE_TS_RE.exec(line)
  return {
    flavor, refusedS: num(m[1]), strike: num(m[2]),
    rssM: r ? num(r[1]) : null, rateMBs: r ? num(r[2]) : null,
    queueQueued: q ? num(q[1]) : null, queueSustainedS: q ? num(q[2]) : null,
    tsS: t ? num(t[1]) : null, kind: 'valve-close'
  }
}

// The reopen: 'OPEN: rss XM after closure (strikes N) - the funnel flows
// again ts=Ts'.
const VALVE_OPEN_RE = /\[allocvalve\] OPEN: rss (\d+)M after closure \(strikes (\d+)\)/
export function parseValveOpen (line) {
  if (typeof line !== 'string') return null
  const m = VALVE_OPEN_RE.exec(line)
  if (!m) return null
  return { rssM: num(m[1]), strikes: num(m[2]), kind: 'valve-open' }
}

/**
 * The census. One pass, encounter order = time order. Every field is the
 * honest read of the named lines; a face with none reads the honest zero.
 * rss.peakM is the max ANY of these emitters named (the gauge's cadence can
 * miss a 5s storm entirely); rss.firstM/lastM are the hb series' bookends.
 * @param {string[]} lines
 */
export function stormCensus (lines) {
  const c = {
    hb: { count: 0, timed: 0, maxLateMs: null, maxMainLateMs: null },
    rss: { firstM: null, peakM: null, lastM: null },
    valve: {
      closures: 0, opens: 0, maxRefusedS: null, peakCloseRssM: null,
      byFlavor: {}
    },
    storms: { probes: 0, fatals: 0, peakStormRssM: null, peakRateMBs: null }
  }
  if (!Array.isArray(lines)) return c
  for (const line of lines) {
    const hb = parseHeartbeat(line)
    if (hb) {
      c.hb.count++
      c.hb.timed++
      if (c.hb.maxLateMs === null || hb.lateMs > c.hb.maxLateMs) c.hb.maxLateMs = hb.lateMs
      if (c.hb.maxMainLateMs === null || hb.mainLateMs > c.hb.maxMainLateMs) c.hb.maxMainLateMs = hb.mainLateMs
      if (c.rss.firstM === null) c.rss.firstM = hb.rssM
      c.rss.lastM = hb.rssM
      if (c.rss.peakM === null || hb.rssM > c.rss.peakM) c.rss.peakM = hb.rssM
      continue
    }
    const probe = parseStormProbe(line)
    if (probe) {
      c.storms.probes++
      if (c.storms.peakStormRssM === null || probe.toM > c.storms.peakStormRssM) c.storms.peakStormRssM = probe.toM
      if (c.storms.peakRateMBs === null || probe.rateMBs > c.storms.peakRateMBs) c.storms.peakRateMBs = probe.rateMBs
      if (c.rss.peakM === null || probe.toM > c.rss.peakM) c.rss.peakM = probe.toM
      continue
    }
    const fatal = parseStormFatal(line)
    if (fatal) {
      c.storms.fatals++
      if (c.storms.peakStormRssM === null || fatal.toM > c.storms.peakStormRssM) c.storms.peakStormRssM = fatal.toM
      if (c.storms.peakRateMBs === null || fatal.rateMBs > c.storms.peakRateMBs) c.storms.peakRateMBs = fatal.rateMBs
      if (c.rss.peakM === null || fatal.toM > c.rss.peakM) c.rss.peakM = fatal.toM
      continue
    }
    const close = parseValveClose(line)
    if (close) {
      c.valve.closures++
      c.valve.byFlavor[close.flavor] = (c.valve.byFlavor[close.flavor] || 0) + 1
      if (c.valve.maxRefusedS === null || close.refusedS > c.valve.maxRefusedS) c.valve.maxRefusedS = close.refusedS
      if (close.rssM !== null && (c.valve.peakCloseRssM === null || close.rssM > c.valve.peakCloseRssM)) c.valve.peakCloseRssM = close.rssM
      if (close.rssM !== null && (c.rss.peakM === null || close.rssM > c.rss.peakM)) c.rss.peakM = close.rssM
      continue
    }
    const open = parseValveOpen(line)
    if (open) c.valve.opens++
  }
  return c
}
