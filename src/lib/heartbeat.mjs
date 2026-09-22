// Worker-thread heartbeat: independent liveness evidence for the fleet process.
//
// WHY (fleet #126 + run 35518872758): the reporter went silent for 380 s while
// the log kept GROWING (338 activity lines inside the gap) - was the main
// thread's timers phase starved by a sync spin, or was the whole process
// frozen? The log cannot tell, and the treatments are completely different
// (hunt the spin vs. look at the machine/server). A WORKER thread ticks on its
// own thread and writes its line with fs.writeSync(1, ...) - file descriptors
// are shared by all threads of a process, so this is a RAW syscall on the real
// stdout fd, bypassing both the main thread's event loop AND the worker->parent
// stdout piping (which a starving main thread would leave undrained, silencing
// exactly the evidence this module exists to provide). The attribution matrix
// a human reads straight off the log:
//   [hb] lines flow while the reporter is silent -> MAIN thread starved (sync spin / CPU loop)
//   [hb] lines stop too                          -> the process or the whole machine froze/died
//   both alive but production low                -> no starvation; look server- or pathing-side
// The worker also reports how LATE its tick fired (late=ms): growing late under
// load means OS-level CPU contention; on-time [hb] with a silent reporter pins
// the main thread. (v0.48.0) mainLate=ms joins every line: a 250ms setInterval
// on the MAIN thread measures its own fire drift; the window's MAX travels to
// the worker (postMessage on each beat) and rides the NEXT [hb] line - the
// attribution matrix now prints its own magnitude (dispatch 35605960761 had
// TWO main-thread starvation windows, 50s + 209s, that the healthy worker
// could only hint at; the next storm shows mainLate=30000+ms while late=
// stays small, because a worker thread is NOT blocked by a busy main thread).
// The reporter annotates its own gaps inline (gapNote) so one
// log carries the whole matrix without re-reading raw timestamps.
import { Worker } from 'node:worker_threads'
import { installNoteSink } from './blackbox.mjs'

// Eval worker (CJS - eval workers are CommonJS by design). It must NEVER throw:
// a dead heartbeat is a diagnostic loss, not a fleet failure. Every failure path
// is swallowed; the loop reschedules with a plain relative delay so a sustained
// overload shows up as GROWING late= (catch-up scheduling would mask it).
export const HEARTBEAT_WORKER_SRC = `
const fs = require('node:fs')
const { parentPort, workerData } = require('node:worker_threads')
const intervalMs = Math.max(50, Number(workerData && workerData.intervalMs) || 20000)
const writeFd = workerData && workerData.writeFd != null ? Number(workerData.writeFd) : 1
let n = 0
let stopped = false
let timer = null
let mainLate = 0
const t0 = Date.now()
// (v0.55.0) THE STORM GUARD - off-thread teeth. run53 (35647216505): the main
// thread froze mid-drowning-rescue and allocated +3.1GB of RETAINED heap in 20s
// (158MB/s) while its own heap watchdog (main-thread setInterval) could not
// fire - sync spin + GC thrash leaves no timer phase. The worker's rss read is
// process-wide and its fs.writeSync lands frozen: the worker sees the storm and
// kills the process HONESTLY (SIGTERM, exit 143) ~30s before the unsymbolized
// OOM (exit 134) erases the story. Arithmetic mirrors src/lib/stormguard.mjs
// (the CI-tested reference; the eval worker cannot import it).
var sgRate = Math.max(5, Number(process.env.FLEET_STORM_MB_S) || 40)
var sgFloor = Math.max(100, Number(process.env.FLEET_STORM_FLOOR_MB) || 1200)
// (v0.64.0) THE STORM PROBE - two-strike response (mirrors src/lib/stormguard.mjs
// stormResponse). run61 (35674589517) measured the first-strike kill too hasty:
// rss 393M -> 1451M in one 5s window (211MB/s) with the main thread STILL
// TICKING (mainLate 1728ms, heap 106M) - a transient burst, but the SIGTERM
// erased a 376s/600s fleet. Now: first verdict SURVIVES with a probe line
// (rss story + blackbox labels); a SECOND verdict (renewed growth - a recede
// resets the streak, a plateau never re-fires) or rss >= sgCeil kills as before.
var sgCeil = Math.max(sgFloor + 200, Number(process.env.FLEET_STORM_CEIL_MB) || 3000)
var sgProbeUsed = false
var sgWin = [] // {ts, rss}
var sgTimer = null
function sgVerdict () {
  var t = Date.now()
  while (sgWin.length > 1 && t - sgWin[0].ts > 10000) sgWin.shift()
  if (sgWin.length < 2) return null
  var first = sgWin[0]
  var last = sgWin[sgWin.length - 1]
  var dtS = Math.max(1, last.ts - first.ts) / 1000
  var gain = last.rss - first.rss
  var rate = gain / dtS
  if (last.rss >= sgFloor && rate >= sgRate && gain >= sgRate * dtS * 0.5) {
    return { storm: true, rate: rate, gain: gain, rss: last.rss, first: first.rss, dtS: dtS }
  }
  return null
}
// (v0.64.0) the blackbox activity labels for the probe/FATAL lines - the SAME
// read the freeze dump uses (bbRead is hoisted; bbSab is assigned by the time
// any verdict can fire). Empty string when the ring has nothing.
function sgStory (max) {
  var ents = bbRead(max || 8)
  if (!ents.length) return ''
  var base = ents[0].tsMs
  var parts = []
  for (var k = 0; k < ents.length; k++) parts.push(ents[k].label + ' @+' + ((ents[k].tsMs - base) / 1000).toFixed(1) + 's')
  return '; last: ' + parts.join(' <- ')
}
function sgTick () {
  if (stopped) return
  try {
    var r = Math.round(process.memoryUsage().rss / 1048576)
    var t = Date.now()
    if (sgWin.length && r < sgWin[sgWin.length - 1].rss) sgWin.length = 0 // growth streak broken
    sgWin.push({ ts: t, rss: r })
    var v = sgVerdict()
    if (v && !stopped) {
      // (v0.64.0) the two-strike response, mirrored from stormguard.stormResponse:
      // junk rss -> none; rss >= sgCeil -> kill (hard ceiling); first survivable
      // verdict -> probe (write the story, SURVIVE); anything after that -> kill.
      var act = 'none'
      var why = ''
      if (v.rss >= sgCeil) { act = 'kill'; why = 'hard ceiling ' + sgCeil + 'M' } else if (!sgProbeUsed) { act = 'probe'; why = 'soft first strike' } else { act = 'kill'; why = 'second strike' }
      if (act === 'probe') {
        sgProbeUsed = true // one survival per process lifetime
        try { fs.writeSync(writeFd, '[stormguard] STORM PROBE: rss ' + v.first + 'M -> ' + v.rss + 'M (+' + Math.round(v.gain) + 'M in ' + v.dtS.toFixed(0) + 's = ' + Math.round(v.rate) + 'MB/s, mainLate ' + mainLate + 'ms' + sgStory(8) + ') - SURVIVING the first strike (run61 burst class: one window, main thread still ticking); a SECOND verdict or rss >= ' + sgCeil + 'M kills\\n') } catch { /* stdout closed */ }
      } else if (act === 'kill') {
        stopped = true // no further lines race the emergency report
        try { clearTimeout(timer); clearInterval(sgTimer) } catch { /* dying anyway */ }
        try {
          fs.writeSync(writeFd, '[stormguard] FATAL (' + why + '): rss ' + v.first + 'M -> ' + v.rss + 'M (+' + Math.round(v.gain) + 'M in ' + v.dtS.toFixed(0) + 's = ' + Math.round(v.rate) + 'MB/s >= ' + sgRate + 'MB/s at rss >= ' + sgFloor + 'M floor' + sgStory(8) + ')\\n')
          fs.writeSync(writeFd, '[stormguard] the MAIN thread is allocating itself to death while frozen (run53/35647216505 OOM class: unsymbolized exit 134, mainLate was ' + mainLate + 'ms) - emergency SIGTERM keeps the story readable (exit 143)\\n')
        } catch { /* stdout closed - kill anyway */ }
        try { process.kill(process.pid, 'SIGTERM') } catch { /* already dying */ }
      }
    }
  } catch { /* never throw from a guard */ }
}
sgTimer = setInterval(sgTick, 5000)
try { sgTimer.unref && sgTimer.unref() } catch { /* older runtimes */ }
// (v0.62.0) THE FREEZE BLACK BOX - the worker reads the shared ring DIRECTLY
// while the main thread is frozen (postMessage is dead exactly when it
// matters). Mirrors src/lib/blackbox.mjs's readSharedBlackBox + dumpLine
// arithmetic (the CI-tested reference; the eval worker cannot import ESM):
//   byte 0..3 seq, byte 4..7 capacity, entries at 8+i*16 (Int32 labelIdx,
//   Float64 ts), label area at 8+cap*16 (Int32 count, then 24B ASCII slots).
var bbSab = workerData && workerData.bb && workerData.bb.sab
var bbLastDump = 0
function bbRead (max) {
  var out = []
  try {
    var cap = new Int32Array(bbSab, 4, 1)[0]
    var seq = new Int32Array(bbSab, 0, 1)[0]
    if (!(cap > 0) || bbSab.byteLength < 8 + cap * 16 + 96 * 24) return out
    var labelArea = 8 + cap * 16
    var count = new Int32Array(bbSab, labelArea, 1)[0]
    var f64 = new Float64Array(bbSab)
    var u8 = new Uint8Array(bbSab)
    var want = max || 8
    var n = Math.min(cap, Math.max(seq, 0), want)
    for (var k = 1; k <= n; k++) {
      var i = ((seq - k) % cap + cap) % cap
      var eOff = 8 + i * 16
      var idx = new Int32Array(bbSab, eOff, 1)[0]
      var ts = f64[(eOff + 8) / 8]
      if (!(ts > 0) || idx < 0 || idx >= count || idx >= 96) continue
      var off = labelArea + 4 + idx * 24
      var label = ''
      for (var b = 0; b < 24 && u8[off + b] !== 0; b++) { var c = u8[off + b]; label += (c >= 32 && c < 127) ? String.fromCharCode(c) : '?' }
      out.push({ label: label || ('lbl#' + idx), tsMs: ts })
    }
  } catch { /* forensics never throws */ }
  return out
}
function bbDump (lateNow) {
  if (!bbSab) return
  var t = Date.now()
  if (!(lateNow >= 5000) || t - bbLastDump < 30000) return
  bbLastDump = t
  var ents = bbRead(8)
  if (!ents.length) return
  var base = ents[0].tsMs
  var parts = []
  for (var k = 0; k < ents.length; k++) parts.push(ents[k].label + ' @+' + ((ents[k].tsMs - base) / 1000).toFixed(1) + 's')
  try { fs.writeSync(writeFd, '[blackbox] main freeze ~' + Math.round(lateNow / 1000) + 's; last: ' + parts.join(' <- ') + '\\n') } catch { /* stdout closed */ }
}
function tick () {
  if (stopped) return
  n++
  const now = Date.now()
  const late = Math.max(0, (now - t0) - n * intervalMs)
  const rssM = Math.round(process.memoryUsage().rss / 1048576)
  if (writeFd >= 0) {
    try { fs.writeSync(writeFd, '[hb] n=' + n + ' ts=' + Math.round(process.uptime()) + 's rss=' + rssM + 'M late=' + late + 'ms mainLate=' + mainLate + 'ms\\n') } catch { /* stdout closed - nothing to diagnose with */ }
  }
  try { bbDump(mainLate) } catch { /* forensics never throws */ }
  try { parentPort.postMessage({ n: n, ts: now, late: late, rssMb: rssM }) } catch { /* parent gone */ }
  timer = setTimeout(tick, intervalMs)
}
timer = setTimeout(tick, intervalMs)
parentPort.on('message', m => {
  if (m === 'stop') { stopped = true; clearTimeout(timer); try { clearInterval(sgTimer) } catch { /* teardown */ }; try { process.exit(0) } catch { /* already exiting */ } }
  // (v0.48.0) the parent's main-thread lag report arrives one beat late (the
  // line is written before this message lands) - evidence, not an alarm.
  if (m && typeof m === 'object' && Number.isFinite(m.mainLateMs)) { try { mainLate = Math.max(0, Math.round(m.mainLateMs)) } catch { /* junk stays harmless */ } }
})
`

// The exact wire format the worker writes. Kept as a pure function so the tests
// pin the format the log-reading agents will parse (the worker builds the same
// string by hand - it cannot import from the parent bundle).
export function heartbeatLine ({ n, tsSec, rssMb, lateMs = 0, mainLateMs = 0 }) {
  return `[hb] n=${n} ts=${tsSec}s rss=${rssMb}M late=${lateMs}ms mainLate=${mainLateMs}ms`
}

// Pure gap annotation for the reporter: null while the gap is within tolerance
// (2.5x the interval = at most one skipped tick, normal under load), else a
// one-line explanation that carries the attribution matrix. Backwards or
// non-finite clocks stay silent - diagnostics must never lie.
export function gapNote (prevMs, nowMs, intervalMs, { tolerance = 2.5 } = {}) {
  if (!Number.isFinite(prevMs) || !Number.isFinite(nowMs) || !Number.isFinite(intervalMs) || intervalMs <= 0) return null
  if (nowMs < prevMs) return null
  const gapMs = nowMs - prevMs
  if (gapMs <= intervalMs * tolerance) return null
  return `[reporter] ${(gapMs / 1000).toFixed(0)}s gap before this tick - if [hb] lines kept flowing inside it, the MAIN thread's timers starved (sync spin); if they stopped too, the process or the machine froze`
}

/**
 * Start the heartbeat worker. Options:
 *   intervalMs  - beat period (default 20s; 600s run = 30 lines, negligible)
 *   WorkerCtor  - injectable for tests (a fake Worker)
 *   onBeat      - optional parent-side callback({n, ts, late, rssMb}); never throws
 *   writeFd     - fd the worker writeSync's to (default 1 = real stdout; tests
 *                 pass -1 for a silent postMessage-only worker)
 *   onUnfreeze  - optional (driftMs) => {} fired ONCE per main-thread freeze
 *                 when the lag probe's first post-freeze fire crosses
 *                 unfreezeLateMs (the v0.65.0 zombie-goto sweep hook)
 *   unfreezeLateMs - the drift threshold that counts as a freeze (default 8000)
 * Returns { worker, stop(stopGraceMs) }. The worker is UNREF'D: a heartbeat
 * must never extend the fleet's life, even if stop() is never reached (OOM).
 */
export const HEARTBEAT_PROBE_MS = 250

export function startHeartbeat ({ intervalMs = 20000, WorkerCtor = Worker, onBeat = null, writeFd = 1, probeMs = HEARTBEAT_PROBE_MS, blackbox = null, onUnfreeze = null, unfreezeLateMs = 8000 } = {}) {
  const hb = { stopped: false, mainLateMax: 0, probeExpected: 0 }
  hb.worker = new WorkerCtor(HEARTBEAT_WORKER_SRC, { eval: true, workerData: {
    intervalMs,
    writeFd,
    // (v0.62.0) the shared ring: the worker reads it DIRECTLY during a
    // main-thread freeze (postMessage is dead exactly when it matters) and
    // dumps the last activity labels - '[blackbox] main freeze ~Xs; last: ...'
    bb: blackbox && blackbox.sab ? { sab: blackbox.sab } : null
  } })
  // (v0.62.0) the global note sink: every module can noteGlobal('pf:goal ...')
  // from here on - call sites need zero heartbeat wiring
  try { installNoteSink(blackbox) } catch { /* diagnostics never throw into the fleet */ }
  try { hb.worker.unref?.() } catch { /* fakes may not implement it */ }
  try {
    hb.worker.on?.('message', m => {
      if (hb.stopped) return
      // (v0.48.0) hand the window's main-thread lag max to the worker (it
      // prints it one beat later) and open the next window. postMessage of an
      // OBJECT keeps 'stop' (a string) unambiguous on the worker side.
      try { hb.worker.postMessage({ mainLateMs: hb.mainLateMax }) } catch { /* fakes / gone */ }
      hb.mainLateMax = 0
      try { onBeat?.(m) } catch { /* diagnostics never throw into the fleet */ }
    })
  } catch { /* no listener support - the fd line still lands */ }
  try {
    hb.worker.on?.('error', () => { /* a dead heartbeat is a diagnostic loss, not a fleet failure */ })
  } catch { /* no-op */ }
  // (v0.48.0) THE MAIN-THREAD LAG PROBE: a 250ms interval on the MAIN thread
  // that measures its own fire drift against the expected schedule. A stalled
  // (sync-spinning) main thread fires this late - the drift IS the stall
  // magnitude, windowed to the beat. UNREF'd + guarded: diagnostics never
  // extend the fleet's life or throw into it.
  hb.probeExpected = Date.now() + probeMs
  hb.probe = setInterval(() => {
    try {
      const now = Date.now()
      const drift = Math.max(0, now - hb.probeExpected)
      if (drift > hb.mainLateMax) hb.mainLateMax = drift
      hb.probeExpected = now + probeMs
      // (v0.65.0) THE UNFREEZE HOOK: the probe is the ONLY main-thread code
      // that runs across a freeze - it cannot fire DURING the spiral (the
      // timers are the starved resource), so its first post-freeze fire
      // carries the FULL drift magnitude (run63: 51122ms). That fire is the
      // fleet's one chance to clear the pathfinder goals that re-spiral once
      // physics resumes (run60: one freeze class, 150s - the goal survived
      // the break and re-wedged). Fires at most once per freeze by
      // construction (the next fires have ~probeMs drift); the callback owns
      // its own sweep and its own logging.
      if (typeof onUnfreeze === 'function' && drift >= unfreezeLateMs) {
        try { onUnfreeze(drift) } catch { /* the sweep never kills the fleet */ }
      }
    } catch { /* never throw from a diagnostic */ }
  }, probeMs)
  try { hb.probe.unref?.() } catch { /* fakes may return a bare object */ }
  hb.stop = (stopGraceMs = 500) => stopHeartbeat(hb, stopGraceMs)
  return hb
}

/**
 * Stop the heartbeat: ask the worker to exit itself (fast, clean), then
 * terminate it after a grace period in case it is WEDGED (e.g. blocked in a
 * writeSync to a full stdout pipe). Idempotent. The grace timer is UNREF'D -
 * the shutdown path must never hang on diagnostics.
 */
export function stopHeartbeat (hb, stopGraceMs = 500) {
  if (!hb || hb.stopped) return false
  hb.stopped = true
  try { clearInterval(hb.probe) } catch { /* fakes may not implement it */ }
  try { hb.worker.postMessage('stop') } catch { /* worker already gone */ }
  const t = setTimeout(() => {
    try { hb.worker.terminate?.() } catch { /* already gone */ }
  }, Math.max(0, stopGraceMs))
  try { t.unref?.() } catch { /* fakes may return a bare object */ }
  return true
}
