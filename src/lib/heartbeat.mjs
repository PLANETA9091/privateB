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
// the main thread. The reporter annotates its own gaps inline (gapNote) so one
// log carries the whole matrix without re-reading raw timestamps.
import { Worker } from 'node:worker_threads'

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
const t0 = Date.now()
function tick () {
  if (stopped) return
  n++
  const now = Date.now()
  const late = Math.max(0, (now - t0) - n * intervalMs)
  const rssM = Math.round(process.memoryUsage().rss / 1048576)
  if (writeFd >= 0) {
    try { fs.writeSync(writeFd, '[hb] n=' + n + ' ts=' + Math.round(process.uptime()) + 's rss=' + rssM + 'M late=' + late + 'ms\\n') } catch { /* stdout closed - nothing to diagnose with */ }
  }
  try { parentPort.postMessage({ n: n, ts: now, late: late, rssMb: rssM }) } catch { /* parent gone */ }
  timer = setTimeout(tick, intervalMs)
}
timer = setTimeout(tick, intervalMs)
parentPort.on('message', m => {
  if (m === 'stop') { stopped = true; clearTimeout(timer); try { process.exit(0) } catch { /* already exiting */ } }
})
`

// The exact wire format the worker writes. Kept as a pure function so the tests
// pin the format the log-reading agents will parse (the worker builds the same
// string by hand - it cannot import from the parent bundle).
export function heartbeatLine ({ n, tsSec, rssMb, lateMs = 0 }) {
  return `[hb] n=${n} ts=${tsSec}s rss=${rssMb}M late=${lateMs}ms`
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
 * Returns { worker, stop(stopGraceMs) }. The worker is UNREF'D: a heartbeat
 * must never extend the fleet's life, even if stop() is never reached (OOM).
 */
export function startHeartbeat ({ intervalMs = 20000, WorkerCtor = Worker, onBeat = null, writeFd = 1 } = {}) {
  const hb = { stopped: false }
  hb.worker = new WorkerCtor(HEARTBEAT_WORKER_SRC, { eval: true, workerData: { intervalMs, writeFd } })
  try { hb.worker.unref?.() } catch { /* fakes may not implement it */ }
  try {
    hb.worker.on?.('message', m => {
      if (hb.stopped) return
      try { onBeat?.(m) } catch { /* diagnostics never throw into the fleet */ }
    })
  } catch { /* no listener support - the fd line still lands */ }
  try {
    hb.worker.on?.('error', () => { /* a dead heartbeat is a diagnostic loss, not a fleet failure */ })
  } catch { /* no-op */ }
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
  try { hb.worker.postMessage('stop') } catch { /* worker already gone */ }
  const t = setTimeout(() => {
    try { hb.worker.terminate?.() } catch { /* already gone */ }
  }, Math.max(0, stopGraceMs))
  try { t.unref?.() } catch { /* fakes may return a bare object */ }
  return true
}
