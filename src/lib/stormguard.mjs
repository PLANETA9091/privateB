// The OFF-THREAD storm guard (v0.55.0) - teeth for the heartbeat worker.
//
// WHAT HAPPENED (fleet 35647216505, run53, mined 2026-09-22): the fleet died in
// the worst way its log can die - `FATAL ERROR: Reached heap limit` (exit 134)
// with an UNSYMBOLIZED native stack. The timeline, mined from the artifacts:
// mainLate 1.0-1.7s the whole run (the known CPU-starvation class), F1's second
// drowning rescue starts (oxygen 12, head submerged) - and the main thread goes
// SILENT. Between heartbeat n=8 (rss=367M, ts=161s) and n=9 (rss=3520M, ts=181s)
// the process gained +3150MB of RETAINED V8 heap (~158MB/s; the GC log shows
// 3.5GB of live old-space, mu=0.013 - live objects, not garbage). The main
// thread's own heap watchdog (v0.18.3) NEVER FIRED: it lives on the thread it
// guards, and a sync spin + GC thrash leaves no timer phase for it to run in.
// The main thread froze inside something, allocated gigabytes, and the only
// witness was the HEARTBEAT WORKER - whose fs.writeSync and
// process.memoryUsage().rss keep working while the main thread is wedged
// (proven: n=8/n=9 landed during the freeze, and the worker's rss read matched
// the process-wide value; RSS is an OS-level process metric).
//
// THE DESIGN: the worker already sees everything the storm needs (rss at
// process scope, on its own thread). Give it teeth:
//   - sample RSS every 5s off-thread;
//   - storm = sustained growth >= rate threshold (FLEET_STORM_MB_S, the SAME
//     knob the main-thread watchdog uses, default 40MB/s) over the window,
//     AND rss past the floor (FLEET_STORM_FLOOR_MB, default 1200M - run53's
//     healthy rss was 367M; a healthy 19-bot run never gets near the floor);
//   - on storm: writeSync the emergency lines (raw fd - they land even frozen),
//     then process.kill(process.pid, 'SIGTERM') - from a worker that kills the
//     WHOLE process (exit 143, distinct from the OOM's 134) ~30s BEFORE the
//     thrash would have erased the story. The run is lost either way; exit 143
//     keeps the log readable, the CI budget bounded, and the next session gets
//     an attributed storm instead of an unsymbolized stack.
//
// (v0.64.0) THE STORM PROBE - kill-on-first-sight was measured too hasty: run61
// (dispatch 35674589517, mined 2026-09-22) died to the SAME verdict arithmetic
// (rss 393M -> 1451M in 5s = 211MB/s) while the main thread was STILL TICKING
// (mainLate 1451-1728ms, far under the 5s freeze class, heap small at 106M,
// path=2a/0q) - the burst ended within the very window the guard sampled, and
// the SIGTERM erased a fleet that was 376s/600s in and producing valid data.
// The response is now TWO-STRIKE: the FIRST verdict SURVIVES - the worker
// writes the probe line (rss story + the blackbox activity labels, the same
// read the freeze dump uses) and the run goes on; a SECOND verdict (renewed
// growth - the streak arithmetic already resets on a recede, so a plateau
// never re-fires) or rss past the HARD CEILING (FLEET_STORM_CEIL_MB, default
// 3000M - run53's terminal storm passed 3GB) kills exactly as before. A
// terminal storm now dies 5-10s later than v0.55.0, WITH the probe story in
// the log; a transient burst finishes the run and pays data instead of death.
//
// This module is the CI-tested reference implementation of the detector. The
// eval worker cannot import it (the worker source is a string, CJS, no
// imports) - the worker carries a hand-rolled copy of the same arithmetic,
// exactly like heartbeatLine's wire format. The tests below pin BOTH the
// module and the numbers the worker must reproduce.
export const STORM_RATE_MB_S_DEFAULT = 40 // same knob as the main-thread heap watchdog
export const STORM_FLOOR_MB_DEFAULT = 1200 // healthy run53 rss was 367M; OOM cliff 3584M
export const STORM_WINDOW_MS = 10000 // two 5s samples minimum before a verdict
export const STORM_CEIL_MB_DEFAULT = 3000 // the hard ceiling: run53's terminal storm passed 3GB

// (v0.141.0) THE SECOND-STRIKE GRACE. MEASURED (fleet leg 35986122635, the
// v0.140.0 union, mined 2026-09-24): the probe fired at rss 379M -> 1213M
// (10:36:16) and the second strike killed at 1213M -> 2164M only 5s later
// (10:36:21) - while mainLate read just 959ms and the worker verdict PUBLISHED
// into the storm cell at the probe had NOT YET LANDED: every main-thread
// applier (the 1s ticker, the funnel consults - the blackbox ring shows the
// last pf notes 0.0s before the probe, then silence) was busy inside the very
// in-flight A* the storm was made of. The two-strike design's own survival
// path ("the applied closure cuts the A* fuel, GC drains, the streak resets
// on the dip and the second strike never arms") needs the closure to LAND:
// a lag-probe fire (~250ms cadence even starved), the in-flight walks winding
// down (one timeout cycle, ~11s measured in the same log), a GC drain. 5s is
// shorter than that wind-down; every storm since run92 died 510-521/600s -
// 80-90s before a probable NORMAL END - with the closure still in flight.
// THE GRACE: a second verdict inside GRACE_MS after the probe is HELD (the
// run survives; fresh verdicts keep being evaluated every sample), the hard
// ceiling kills IMMEDIATELY as before - a terminal storm cannot outlive
// 3000M, so the amputation guarantee is byte-for-byte intact. The grace only
// matters for shapes that stay under the ceiling - exactly the recoverable
// class. Default 20000ms = four worker samples = the wind-down budget.
export const STORM_GRACE_MS_DEFAULT = 20000 // probe -> kill: the closure-landing window

// (v0.143.0) THE PULSE-VOID GRACE. MEASURED (fleet leg 35994461858, the
// v0.142.0 STORM SURVIVAL, mined 2026-09-24): the probe fired at rss 989M ->
// 2114M (+225MB/s, mainLate 768ms - the main was still turning), the worker
// published the verdict into the cell and the GRACE HOLD line waited 10s for
// "the lag-probe closure" - which could NEVER land: the main thread froze
// SOLID right after the probe (the FATAL's blackbox ring is byte-for-byte
// the probe's ring - not one main-thread note in the last 10s; no ticker
// mem line, no probe fire, no beat). The grace exists FOR the closure, and
// every closure applier (the ticker, the funnel consults, the lag-probe
// feeder) lives on the main thread - a frozen main means the grace is
// waiting for the dead. THE CURE: the worker already reads the main's
// loop-pulse counters (the 250ms main-thread cadence, the freeze
// oscilloscope's own signal) - when the pulse has not advanced for
// PULSE_VOID_MS inside the grace, the hold becomes a VOID: the kill fires
// with the named reason instead of waiting out a window that cannot help.
// The hard ceiling keeps killing FIRST regardless (byte for byte); a live
// pulse (the appliers alive, the closure still landing) holds exactly as
// before; a junk/absent pulse reading holds too (never a false kill).

export const STORM_PULSE_VOID_MS_DEFAULT = 4000 // a main pulse frozen this long cannot run any applier

/**
 * (v0.64.0) The two-strike response policy, pure so the tests pin it and the
 * eval worker can mirror the arithmetic by hand. Given the CURRENT verdict's
 * rss and whether the soft probe was already spent:
 *   'probe' - first strike at a survivable rss: write the story, keep running
 *   'kill'  - second strike, or the hard ceiling (the machine is dying anyway)
 *   'none'  - junk rss (the caller just keeps sampling)
 * (v0.141.0) the grace: probeAtMs (the probe's wall clock) + graceMs hold a
 * second verdict for the closure-landing window; the ceiling kills regardless.
 * A junk probeAtMs (0/NaN - the caller has no clock) keeps the old contract:
 * second verdict kills at once.
 * (v0.143.0) the void: pulseFrozenMs (how long the main's loop pulse has not
 * advanced) >= pulseVoidMs turns the HOLD into a kill named 'grace void' -
 * the closure appliers all live on the frozen main, so waiting is a lie.
 * Junk/null pulseFrozenMs (no pulse sab, no reading) keeps the hold byte for
 * byte - never a false kill off missing evidence.
 *
 * @param {{probeUsed?: boolean, rssMb?: number, ceilMb?: number, probeAtMs?: number|null, graceMs?: number, nowMs?: number, pulseFrozenMs?: number|null, pulseVoidMs?: number}} s
 * @returns {{action: 'probe'|'kill'|'none', probeUsed: boolean, reason: string}}
 */
export function stormResponse ({ probeUsed = false, rssMb = 0, ceilMb = STORM_CEIL_MB_DEFAULT, probeAtMs = null, graceMs = STORM_GRACE_MS_DEFAULT, nowMs = 0, pulseFrozenMs = null, pulseVoidMs = STORM_PULSE_VOID_MS_DEFAULT } = {}) {
  const rss = Number(rssMb)
  if (!Number.isFinite(rss) || rss <= 0) return { action: 'none', probeUsed, reason: 'junk rss' }
  if (rss >= ceilMb) return { action: 'kill', probeUsed, reason: 'hard ceiling ' + Math.round(ceilMb) + 'M' }
  if (!probeUsed) return { action: 'probe', probeUsed: true, reason: 'soft first strike' }
  // (v0.141.0) the grace hold - every operand must be FINITE for the hold to
  // apply (a junk clock kills honestly, the v0.55.0 amputation default)
  const at = Number(probeAtMs)
  const grace = Number(graceMs)
  const now = Number(nowMs)
  if (Number.isFinite(at) && at > 0 && Number.isFinite(grace) && grace > 0 && Number.isFinite(now) && now - at < grace) {
    // (v0.143.0) THE PULSE-VOID CHECK - the hold's premise is a main thread
    // alive enough to apply the closure. A frozen pulse >= voidMs is the
    // proof the premise is dead; the kill fires with the named reason. The
    // void is measured only INSIDE the grace (the second-strike kill after
    // the grace needs no extra evidence - the clock alone buries it).
    const frozen = Number(pulseFrozenMs)
    const voidMs = Number(pulseVoidMs)
    if (Number.isFinite(frozen) && frozen >= 0 && Number.isFinite(voidMs) && voidMs > 0 && frozen >= voidMs) {
      return { action: 'kill', probeUsed, reason: 'grace void: main pulse frozen ' + Math.round(frozen / 1000) + 's - the closure cannot land' }
    }
    return { action: 'none', probeUsed, reason: 'grace hold' }
  }
  return { action: 'kill', probeUsed, reason: 'second strike' }
}

/**
 * Pure sliding-window storm detector.
 * @param {{rateMbS?: number, floorMb?: number, windowMs?: number, now?: Function}} opts
 * @returns {{sample: Function, reset: Function, window: Function}}
 */
export function createStormGuard ({ rateMbS = STORM_RATE_MB_S_DEFAULT, floorMb = STORM_FLOOR_MB_DEFAULT, windowMs = STORM_WINDOW_MS, now = () => Date.now() } = {}) {
  const win = [] // {ts, rss} inside the window
  let warnedAt = -Infinity // -Infinity: the FIRST sub-floor warn fires at once, the rate limit only stops spam

  function verdict (t = now()) { // one clock read per sample - a double read would skew the prune
    while (win.length > 1 && t - win[0].ts > windowMs) win.shift()
    if (win.length < 2) return { storm: false, warn: false, rate: 0, gain: 0, rss: win.length ? win[win.length - 1].rss : 0 }
    const first = win[0]
    const last = win[win.length - 1]
    const dtMs = Math.max(1, last.ts - first.ts)
    const gain = last.rss - first.rss
    const rate = gain / (dtMs / 1000) // MB/s over the window
    const rssOk = last.rss >= floorMb
    const rateOk = rate >= rateMbS && gain >= rateMbS * (dtMs / 1000) * 0.5 // sustained, not a one-sample spike
    const storm = rssOk && rateOk
    // a sub-floor storm is still worth a (rate-limited) line: visibility without the kill
    const warn = !storm && rateOk && !rssOk && last.rss > 0 && t - warnedAt >= 15000
    if (warn) warnedAt = t
    return { storm, warn, rate: Math.round(rate * 10) / 10, gain: Math.round(gain), rss: last.rss }
  }

  return {
    sample (rssMb) {
      const t = now()
      const r = Number(rssMb)
      if (!Number.isFinite(r) || r < 0) return verdict(t) // junk never enters the window
      if (win.length && t < win[win.length - 1].ts) win.length = 0 // ANY backwards motion corrupts rate arithmetic - fresh window
      if (win.length && r < win[win.length - 1].rss) win.length = 0 // RSS dropped: growth streak broken, start over
      win.push({ ts: t, rss: r })
      return verdict(t)
    },
    reset () { win.length = 0 },
    window () { return win.length }
  }
}
