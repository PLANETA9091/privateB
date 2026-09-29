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

// (v0.235.0) THE FREEZE-STORM EARLY KILL. MEASURED (fleet 36292057377, the
// v0.234.0 tree, mined 2026-09-27): the fleet ran healthy to t~163s (rss
// 356-367M, mainLate 1.9-2.5s - the long-think band, queue 6a/4-11q - the
// semaphore full, the queue oscillating INSIDE the healthy run100 shape, the
// v0.115.0 queue-pressure arm honestly blind here), then the main thread
// entered a ~65s SYNC LOCK: the lag probe stopped firing (mainLate froze at
// exactly 2190ms across four [hb] beats - the stale postMessage value), the
// blackbox ring froze with it (the probe and the FATAL printed byte-for-byte
// the SAME ring - its entries predated the kill by a minute), and the rss sat
// FLAT at 367M for 60s of lock before the burst: 367 -> 1154 -> 2271 -> 3094M
// in the last ~10s (223MB/s). The two-strike design spent its free probe at
// 2271M (the probe line read mainLate 2190ms as if the main were turning -
// the value was 60s stale) and the hard-ceiling SIGTERM at 3094M LOST the
// race to the V8 OOM (exit 134, the story erased). THE EVIDENCE WAS LIVE FOR
// 60s: the worker's pulse-void read (v0.143.0) saw the main's loop pulse
// frozen past the void threshold on EVERY guard tick - but the void check
// lives only INSIDE the grace (the second verdict's path), and the first
// verdict was 40s away. THE CURE: the freeze-storm check runs on EVERY guard
// tick BEFORE the two-strike policy - when the main pulse has been frozen >=
// the void threshold (the v0.143.0 premise: every closure applier lives on
// the main thread) AND the rss is past the storm floor AND strictly GROWING
// over the previous sample (a FLAT frozen rss is the recoverable freeze
// class - run63's 51s freeze resolved and the fleet continued), the kill
// fires IMMEDIATELY with the named reason. No free probe on a dead premise;
// the SIGTERM lands ~800M and ~5s ahead of the ceiling point (exit 143, the
// story readable). The ceiling keeps killing the TURNING class byte for byte
// (a live pulse means the grace + closure path is alive); the amputation
// bound is untouched - the freeze-storm kill only ever fires no later than
// the ceiling would. Junk/absent pulse evidence never kills (the v0.143.0
// law: never a false kill off missing evidence).
export const STORM_FREEZE_VOID_MS_DEFAULT = STORM_PULSE_VOID_MS_DEFAULT // one frozen-pulse premise, one number

/**
 * (v0.235.0) The freeze-storm verdict, pure so the tests pin it and the eval
 * worker can mirror the arithmetic by hand. Given the CURRENT rss, the
 * PREVIOUS sample's rss (growth is measured over exactly one guard tick -
 * the window's own dip reset keeps honest pairs), and how long the main's
 * loop pulse has been frozen:
 *   kill  - the pulse frozen >= the void threshold, rss past the floor, and
 *           strictly growing: the closure cannot land, amputate now
 *   none  - every other shape, each with a named reason the log carries
 * Junk rss never kills; junk/absent pulse evidence never kills; the floor
 * and the growth are BOTH required (a flat frozen main at 367M is the
 * recoverable class this cure must never touch).
 * @param {{rssMb?: number, prevRssMb?: number, pulseFrozenMs?: number|null, floorMb?: number, pulseVoidMs?: number}} s
 * @returns {{kill: boolean, reason: string}}
 */
export function freezeStormVerdict ({ rssMb = 0, prevRssMb = 0, pulseFrozenMs = null, floorMb = STORM_FLOOR_MB_DEFAULT, pulseVoidMs = STORM_FREEZE_VOID_MS_DEFAULT } = {}) {
  const r = Number(rssMb)
  if (!Number.isFinite(r) || r <= 0) return { kill: false, reason: 'junk rss' }
  // the null/undefined check comes FIRST: Number(null) is 0 and 0 is finite -
  // an absent pulse reading would masquerade as 'frozen 0ms' and read
  // 'pulse alive' (the valveAdmits masquerade lesson, byte for byte)
  if (pulseFrozenMs === null || pulseFrozenMs === undefined) return { kill: false, reason: 'no pulse evidence' }
  const frozen = Number(pulseFrozenMs)
  const voidMs = Number(pulseVoidMs)
  if (!Number.isFinite(frozen) || frozen < 0 || !Number.isFinite(voidMs) || voidMs <= 0) return { kill: false, reason: 'no pulse evidence' }
  if (frozen < voidMs) return { kill: false, reason: 'pulse alive' }
  const floor = Number(floorMb)
  if (!Number.isFinite(floor) || floor <= 0 || r < floor) return { kill: false, reason: 'under floor' }
  const pr = Number(prevRssMb)
  if (!Number.isFinite(pr) || pr <= 0 || r <= pr) return { kill: false, reason: 'not growing' }
  return { kill: true, reason: 'freeze storm: main pulse frozen ' + Math.round(frozen / 1000) + 's, rss ' + Math.round(pr) + 'M -> ' + Math.round(r) + 'M growing past the ' + Math.round(floor) + 'M floor - the closure cannot land' }
}

// (v0.311.0) THE SUB-FLOOR JUMP WATCH - the forming-storm leg the kill lines
// never name. MEASURED (fleet 36560130936, the 1930 fire's post-mortem): rss
// sat FLAT at 386M for 420s, then jumped 386 -> 925M in ONE guard window
// (~27MB/s) while the main was still ticking (mainLate 1415 -> 2549ms) - and
// NO line named it: every verdict band starts at the 1200M floor (the
// freeze-storm kill, the two-strike probe, the valve's 450M/80MB/s fast
// anchor all price RATE past a floor), the funnel probe had no consults to
// ride (pathfinder 4a/0q - moderate, no queue), and the next line was the
// FATAL at 984 -> 2006M. The post-mortem was left holding three rss numbers
// and ZERO jump labels. THE CURE (worker-side, the writeSync-while-frozen
// doctrine): the guard's own 5s streak window already holds the honest pairs
// (the dip reset keeps growth measured over one tick); when ONE step gains
// >= STORM_JUMP_GAIN_MB while still BELOW the floor, write ONE named jump
// line carrying sgStory(8) - the ring is still ALIVE at this point (the main
// ticks at 2.5s lateness), so the labels are the allocator's phase, the
// evidence the FATAL can never have. Once per growth streak (the dip resets
// the flag with the window); a step past the floor is the kill lines' band -
// the watch never doubles their coverage; a stale step (> 25s - a starved
// worker, not a storm leg) reads named and silent.
export const STORM_JUMP_GAIN_MB_DEFAULT = 150 // one guard-tick step: 5x the healthy band's width (356-386M), 3.5x under the datum's +539M
export const STORM_JUMP_MAX_STEP_MS = 25000 // one tick is 5s; 5 ticks of silence is a dead clock, not a storm leg

/**
 * (v0.311.0) The sub-floor jump verdict, pure so the tests pin it and the
 * eval worker can mirror the arithmetic by hand. Given the CURRENT rss, the
 * PREVIOUS sample's rss (the streak's own dip reset keeps honest pairs), and
 * the wall-clock step between the two samples:
 *   jump  - one step gained >= gainMb while rss still below the floor: the
 *           forming-storm leg, name it while the main still ticks
 *   none  - every other shape, each with a named reason the caller stays
 *           silent on (sub jump / past floor / recede / stale step / junk)
 * Junk rss never jumps; a step longer than maxStepMs never jumps (the
 * v0.235.0 flat-freeze class samples CONTINUE on the worker thread - only a
 * genuinely dead worker clock produces a stale step, and a dead clock's
 * reading is not evidence).
 * @param {{rssMb?: number, prevRssMb?: number, stepMs?: number|null, floorMb?: number, gainMb?: number, maxStepMs?: number}} s
 * @returns {{jump: boolean, reason: string, rate: number}}
 */
export function rssJumpVerdict ({ rssMb = 0, prevRssMb = 0, stepMs = null, floorMb = STORM_FLOOR_MB_DEFAULT, gainMb = STORM_JUMP_GAIN_MB_DEFAULT, maxStepMs = STORM_JUMP_MAX_STEP_MS } = {}) {
  const r = Number(rssMb)
  if (!Number.isFinite(r) || r <= 0) return { jump: false, reason: 'junk rss', rate: 0 }
  const pr = Number(prevRssMb)
  if (!Number.isFinite(pr) || pr <= 0) return { jump: false, reason: 'no prior', rate: 0 }
  if (r < pr) return { jump: false, reason: 'recede', rate: 0 }
  // the null/undefined check comes FIRST: Number(null) is 0 and 0 is finite -
  // an absent step would masquerade as a 0ms step and read 'junk step' into
  // what is really missing evidence (the freezeStormVerdict pulse masquerade
  // lesson, byte for byte)
  if (stepMs === null || stepMs === undefined) return { jump: false, reason: 'no step clock', rate: 0 }
  const step = Number(stepMs)
  if (!Number.isFinite(step) || step <= 0) return { jump: false, reason: 'junk step', rate: 0 }
  if (step > Number(maxStepMs)) return { jump: false, reason: 'stale step', rate: 0 }
  const floor = Number(floorMb)
  if (Number.isFinite(floor) && floor > 0 && r >= floor) return { jump: false, reason: 'past floor', rate: 0 }
  const gain = r - pr
  const bar = Number(gainMb)
  if (!Number.isFinite(bar) || bar <= 0 || gain < bar) return { jump: false, reason: 'sub jump', rate: 0 }
  const rate = Math.round((gain / (step / 1000)) * 10) / 10
  return { jump: true, reason: 'rss jump ' + Math.round(pr) + 'M -> ' + Math.round(r) + 'M (+' + Math.round(gain) + 'M in ' + Math.round(step / 1000) + 's = ' + rate + 'MB/s, below the ' + Math.round(floor) + 'M floor - the forming-storm leg the kill lines never name)', rate }
}

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
