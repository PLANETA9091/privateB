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
// This module is the CI-tested reference implementation of the detector. The
// eval worker cannot import it (the worker source is a string, CJS, no
// imports) - the worker carries a hand-rolled copy of the same arithmetic,
// exactly like heartbeatLine's wire format. The tests below pin BOTH the
// module and the numbers the worker must reproduce.
export const STORM_RATE_MB_S_DEFAULT = 40 // same knob as the main-thread heap watchdog
export const STORM_FLOOR_MB_DEFAULT = 1200 // healthy run53 rss was 367M; OOM cliff 3584M
export const STORM_WINDOW_MS = 10000 // two 5s samples minimum before a verdict

/**
 * Pure sliding-window storm detector.
 * @param {{rateMbS?: number, floorMb?: number, windowMs?: number, now?: Function}} opts
 * @returns {{sample: Function, reset: Function, window: Function}}
 */
export function createStormGuard ({ rateMbS = STORM_RATE_MB_S_DEFAULT, floorMb = STORM_FLOOR_MB_DEFAULT, windowMs = STORM_WINDOW_MS, now = () => Date.now() } = {}) {
  const win = [] // {ts, rss} inside the window
  let warnedAt = 0

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
      if (win.length && t <= win[win.length - 1].ts - windowMs) win.length = 0 // clock went backwards - fresh window
      if (win.length && r < win[win.length - 1].rss) win.length = 0 // RSS dropped: growth streak broken, start over
      win.push({ ts: t, rss: r })
      return verdict(t)
    },
    reset () { win.length = 0 },
    window () { return win.length }
  }
}
