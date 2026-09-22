// (v0.77.0) THE FREEZE OSCILLOSCOPE - event-loop phase counters that survive
// a main-thread freeze, readable by the heartbeat worker through a
// SharedArrayBuffer.
//
// WHY: the blackbox (v0.62.0) names the last activity labels inside a freeze
// window and mainLate names the drift magnitude - but FOUR runs of dumps
// (run68 151s/64s, run69 43s, run71 33s, run72 3x36s, run73 53s/25s/10s/6s)
// still leave the mechanism unnamed: the labels show the gotoSafe funnel
// QUEUING AND COMPLETING walks at 0.1-5s cadence INSIDE the dead window -
// the main thread executes fleet code while its timers starve - yet the
// per-walk A* answers arrive in 0.1s, so the sync-think-window theory does
// not hold for the residual class either. What starves is the TIMERS PHASE;
// what keeps running is SOMETHING ELSE. The two candidate phases are the
// POLL (I/O callbacks: 19 bot connections' packet handlers) and the CHECK
// (setImmediate) phases, or a promise (microtask) chain that never bottoms
// out. The treatment is completely different per phase - and no dump so far
// can tell them apart.
//
// THE INSTRUMENT: two monotonic counters in a SharedArrayBuffer, written by
// the MAIN thread, read by the heartbeat WORKER (its own thread - it reads
// exactly when the main thread cannot):
//   slot 1: TIMERS - a setInterval(intervalMs) fire count. Healthy: intervalMs
//           / 250 fires per 20s beat window (~80). Starved timers phase: ~0.
//   slot 2: IMMEDIATES - a self-re-arming setImmediate fire count = the
//           number of event-loop ITERATIONS that reached the check phase.
//           Healthy: hundreds/s. Macrotask-flooded loop: huge. Hard sync
//           block: frozen at the freeze start value.
// The worker's freeze dump (bbDump) prints the per-beat-window deltas:
//   '[blackbox] main freeze ~Xs; ... ; loop: timers=3 imm=41255/20s'
// reads as: the loop iterated 41k times but the timer phase fired 3 times -
// the poll/check phases are saturated, NOT a sync spin. Both ~0 = sync
// block. timers ~80 = the loop is fine (the drift would be a lie).
//
// Zero-risk by construction: the counters are plain Int32 increments on the
// main thread (nanoseconds per fire), the immediates loop is guarded and
// stoppable, junk SABs stay harmless, and diagnostics never throw.
export const PULSE_SLOT_TIMERS = 1
export const PULSE_SLOT_IMMEDIATES = 2
export const PULSE_SAB_INT32_SLOTS = 8

/** The instrument's own SAB: 8 Int32 slots, [1]=timers, [2]=immediates. */
export function createPulseSab () {
  return new SharedArrayBuffer(PULSE_SAB_INT32_SLOTS * 4)
}

/**
 * Create the main-thread pulse writer.
 * @param {object} [opts]
 * @param {SharedArrayBuffer} [opts.sab] - from createPulseSab(); a junk sab
 *   disables the writer (the counters stay 0) instead of throwing.
 * @param {number} [opts.intervalMs=250] - the timers-phase probe period
 *   (aligned with the heartbeat probe's 250ms).
 */
export function createLoopPulse ({ sab = null, intervalMs = 250 } = {}) {
  const view = (() => {
    try {
      const v = new Int32Array(sab)
      return v.length >= PULSE_SAB_INT32_SLOTS ? v : null
    } catch { return null }
  })()
  const period = Number.isFinite(intervalMs) && intervalMs >= 25 ? intervalMs : 250
  let running = false
  let timer = null
  const tick = () => { if (running && view) view[PULSE_SLOT_TIMERS]++ }
  const immTick = () => {
    if (!running) return
    if (view) view[PULSE_SLOT_IMMEDIATES]++
    // re-arm: one fire per event-loop pass through the check phase
    setImmediate(immTick)
  }
  return {
    start () {
      if (running) return
      running = true
      timer = setInterval(tick, period)
      try { timer.unref && timer.unref() } catch { /* diagnostics never hold the process */ }
      setImmediate(immTick)
    },
    stop () {
      running = false
      try { clearInterval(timer) } catch { /* already gone */ }
    },
    /** Cumulative counters for tests and the worker mirror. */
    snapshot () {
      return {
        timers: view ? view[PULSE_SLOT_TIMERS] : 0,
        immediates: view ? view[PULSE_SLOT_IMMEDIATES] : 0,
        running
      }
    }
  }
}

/** Read the pulse counters from a worker thread (junk-safe). */
export function readPulseSab (sab) {
  try {
    const v = new Int32Array(sab)
    if (v.length < PULSE_SAB_INT32_SLOTS) return { timers: 0, immediates: 0 }
    return { timers: v[PULSE_SLOT_TIMERS], immediates: v[PULSE_SLOT_IMMEDIATES] }
  } catch { return { timers: 0, immediates: 0 } }
}

/** The dump suffix the worker appends to the blackbox freeze line. Pure:
 * pins the format the log-reading agents will parse. dtS = the observation
 * window in seconds (the heartbeat beat period). */
export function pulseLine ({ timers, immediates, dtS = 20 } = {}) {
  const t = Number.isFinite(timers) ? timers : 0
  const i = Number.isFinite(immediates) ? immediates : 0
  const w = Number.isFinite(dtS) && dtS > 0 ? Math.round(dtS) : 20
  const expected = Math.max(1, Math.round(w / 0.25)) // the timers-phase budget at the 250ms probe period
  const verdict = t >= expected * 0.5
    ? 'healthy'
    : (i > w * 50
        ? 'LOOPING - poll/check saturated, the timers phase starved (NOT a sync spin)'
        : 'NOT LOOPING - a sync block owns the thread')
  return `; loop: timers=${t} imm=${i}/${w}s (${verdict})`
}
