// (v0.102.0) THE ALLOCATION VALVE - the main-thread CURE for the A* allocation
// storm, layered UNDER the worker stormguard (whose job is amputation).
//
// WHAT HAPPENED (run92, dispatch 35829873166, mined 2026-09-23): the fleet ran
// healthy for 441s (rss 367-383M, mainLate 2.0-2.6s - the known CPU-starvation
// band, not the freeze class) and then the main thread ALLOCATED +931MB in one
// 5s window (186MB/s) and +969MB more in the next (194MB/s) - ~1.9GB in 10s -
// while STILL TICKING (the blackbox labels marched pf:queue/pf:goal walk to
// chest <- water:rescue <- pf:done next column alt <- climb at normal 0-5s
// cadence; mainLate at the kill was only 2006ms). That is the run53
// (35647216505) OOM class WITH the run61 (35674589517) 'still ticking' shape:
// the pathfinder's A* is the only subsystem that can allocate at 190MB/s, and
// the end-phase mass chest walks across a freshly generated flooded region
// (F7: 'water table y=55 (region strike)') fed it from 19 bots at once. The
// worker stormguard did its job exactly as designed - probe the first strike,
// SIGTERM the second - and the run died at 510/600s erasing a probable NORMAL
// END (F19 had just swept 24 ores beside the gallery).
//
// THE GAP THE VALVE CLOSES: between the first storm signature (~600M floor
// crossing) and the worker's second-strike kill there is NO mechanism that
// stops the ALLOCATION - the guard only narrates it. But the main thread was
// alive (mainLate 2006ms << freeze class), so the main thread can act: watch
// its OWN rss every 1s, and on the storm signature REFUSE NEW LONG PATHFINDER
// GOALS at the gotoSafe funnel - the A* loses its fuel, GC drains the garbage
// in seconds, and the valve reopens. The fleet pays a 12-30s walk outage and
// KEEPS THE RUN.
//
// THE LAYERING (both survive, both stay honest):
//   valve  - floor 600M, 1s sampling, CURES: cuts the fuel at the funnel;
//            short walks (<= ALLOC_VALVE_NEAR_BLOCKS, straight-line bot->goal)
//            still flow - water rescues (shore r<=12), climbs (dug overhead,
//            d~1-8), next-column mining steps (~3b) are the cheap class and a
//            drowned bot must never wait on a memory valve;
//   worker - floor 1200M, 5s sampling, two-strike, SIGTERM: the last resort
//            if the valve fails. The valve's closure drops the growth rate,
//            the worker's streak arithmetic resets on ANY rss dip, and the
//            kill never arms. If allocation CONTINUES (retained leak, not
//            garbage), the valve oscillates closed (re-close at the next
//            sample after expiry, escalated to 30s within the reclose window)
//            and the worker still kills exactly as before - the cure can
//            never mask the disease.
//
// The detector REUSES src/lib/stormguard.mjs's createStormGuard (the
// CI-tested sliding window) with the valve's own knobs - one arithmetic, two
// layers, no hand-copied divergence.
import { createStormGuard, STORM_RATE_MB_S_DEFAULT, STORM_WINDOW_MS } from './stormguard.mjs'

export const ALLOC_VALVE_FLOOR_MB_DEFAULT = 600 // healthy run92 rss was 375-383M; the worker's floor is 1200M
export const ALLOC_VALVE_COOLDOWN_MS_DEFAULT = 12000 // one closure = a bounded walk outage
export const ALLOC_VALVE_ESCALATED_MS_DEFAULT = 30000 // a re-close within the window escalates
export const ALLOC_VALVE_RECLOSE_WINDOW_MS = 60000 // two closures inside this window = a sustained storm
export const ALLOC_VALVE_NEAR_BLOCKS_DEFAULT = 24 // straight-line bot->goal: rescues/climbs/next-columns flow, chest walks stop
// (v0.104.0) THE AQUIFER GATE - run93 (35835942682) mined 2026-09-23: the
// storm came back THROUGH the near exemption. The kill-window blackbox was
// all short walks (water:rescue r=1-3, pf:goal relocate, next column alt) -
// and in a flooded quarry (24 live hazard cells, water table y=55) a short
// walk is NOT a cheap walk: the A* explores the flooded geometry and the
// storm re-armed (rss 542M -> 2626M in ~20 s, worker FATAL). Distance does
// not know water; the hazard board does. While the valve is CLOSED, a near
// walk whose GOAL sits in live hazard water is refused too - the fleet's own
// "hazard memorized" ledger (the same one digShaft and mapTargetFor read)
// names the flooded cells. The 12-30 s outage now covers the flooded class;
// the valve reopening restores it, exactly like the long-walk gate.
export const ALLOC_VALVE_AQUIFER_GATE = true // documentation constant: the near exemption is hazard-aware since v0.104.0

/**
 * Pure admission: while the valve is CLOSED, does THIS walk still flow?
 * Open valve admits everything (the consult is a no-op). Closed: only walks
 * that are PROVABLY near - an unmeasurable distance (no entity, junk goal,
 * junk position) is not provably near and is refused (honest default; the
 * caller's retry ladder handles a refused walk exactly like any other).
 * (v0.104.0) THE AQUIFER GATE: a near goal sitting in live hazard water is
 * refused while closed - near is not cheap in a flooded region (run93). The
 * flag comes from the fleet's hazard ledger; junk/missing flags judge
 * NOTHING (false = the v0.102.0 distance-only shape, byte for byte).
 * @param {{closed?: boolean, distanceBlocks?: number|null, nearBlocks?: number, goalHazardNear?: boolean}} s
 * @returns {boolean}
 */
export function valveAdmits ({ closed = false, distanceBlocks = null, nearBlocks = ALLOC_VALVE_NEAR_BLOCKS_DEFAULT, goalHazardNear = false } = {}) {
  if (!closed) return true
  // typeof gate FIRST: Number(null) is 0 and Number('') is 0 - a null distance
  // would masquerade as "0 blocks away" and be admitted (the funnel test
  // caught exactly this). Only a real finite number is measurable.
  const d = typeof distanceBlocks === 'number' ? distanceBlocks : NaN
  if (!Number.isFinite(d) || d < 0) return false
  if (d > nearBlocks) return false
  // (v0.104.0) the aquifer gate: only a POSITIVE board hit refuses - junk
  // flags never invent knowledge the ledger does not have.
  if (goalHazardNear === true) return false
  return true
}

/**
 * Pure log-line builder for the ticker's closed/open transitions (the format
 * the log-reading agents parse; kept pure so the tests pin it).
 * @param {{wasClosed?: boolean, st?: {closed?: boolean, lastRss?: number, lastRate?: number, remainingMs?: number, strikes?: number}, rssM?: number, uptimeS?: number}} a
 * @returns {string|null} null = no line (no transition)
 */
export function valveTransitionLine ({ wasClosed = false, st = {}, rssM = 0, uptimeS = 0 } = {}) {
  const closed = !!st.closed
  if (closed && !wasClosed) {
    const rss = Number.isFinite(st.lastRss) ? st.lastRss : 0
    const rate = Number.isFinite(st.lastRate) ? st.lastRate : 0
    const rem = Number.isFinite(st.remainingMs) ? Math.round(st.remainingMs / 1000) : 0
    const strikes = Number.isFinite(st.strikes) ? st.strikes : 0
    return `[allocvalve] CLOSED: rss ${rss}M (+${rate}MB/s storm) - long walks refused ${rem}s (strike ${strikes}, the A* fuel cut; short walks <= ${ALLOC_VALVE_NEAR_BLOCKS_DEFAULT}b still flow) ts=${uptimeS}s`
  }
  if (!closed && wasClosed) {
    const rss = Number.isFinite(rssM) ? Math.round(rssM) : 0
    const strikes = Number.isFinite(st.strikes) ? st.strikes : 0
    return `[allocvalve] OPEN: rss ${rss}M after closure (strikes ${strikes}) - the funnel flows again ts=${uptimeS}s`
  }
  return null
}

/**
 * The valve state machine. Feed it rss via sample() (the fleet19 ticker calls
 * it every 1s; tests call it directly with a fake clock); read it via
 * consult() (gotoSafe calls it on every walk - a pure state read, never
 * samples, never throws on junk). onState fires on every CLOSE.
 * @param {{rateMbS?: number, floorMb?: number, windowMs?: number, cooldownMs?: number, escalatedMs?: number, recloseWindowMs?: number, now?: Function, onState?: Function}} opts
 * @returns {{sample: Function, consult: Function, stats: Function, reset: Function}}
 */
export function createAllocValve ({ rateMbS = STORM_RATE_MB_S_DEFAULT, floorMb = ALLOC_VALVE_FLOOR_MB_DEFAULT, windowMs = STORM_WINDOW_MS, cooldownMs = ALLOC_VALVE_COOLDOWN_MS_DEFAULT, escalatedMs = ALLOC_VALVE_ESCALATED_MS_DEFAULT, recloseWindowMs = ALLOC_VALVE_RECLOSE_WINDOW_MS, now = () => Date.now(), onState = null } = {}) {
  const guard = createStormGuard({ rateMbS, floorMb, windowMs, now })
  const stats = { closes: 0, escalations: 0 }
  let closedUntil = 0
  let lastCloseAt = -Infinity
  let lastRate = 0
  let lastRss = 0
  let strikes = 0

  function snapshot (t) {
    const closed = t < closedUntil
    return {
      closed,
      remainingMs: Math.max(0, closedUntil - t),
      strikes,
      lastRate,
      lastRss,
      closes: stats.closes
    }
  }

  return {
    /** Feed one rss sample (MB). A storm verdict NOT while already closed
     * closes the valve for cooldownMs (escalated after a fresh reclose).
     * Junk rss never enters the window (the guard's contract). */
    sample (rssMb) {
      const t = now()
      const v = guard.sample(rssMb)
      if (v && v.storm && t >= closedUntil) {
        const escalate = (t - lastCloseAt) <= recloseWindowMs
        if (escalate) stats.escalations++
        strikes++
        stats.closes++
        lastCloseAt = t
        lastRate = v.rate
        lastRss = Number.isFinite(v.rss) ? Math.round(v.rss) : 0
        closedUntil = t + (escalate ? escalatedMs : cooldownMs)
        const snap = snapshot(t)
        if (typeof onState === 'function') {
          try { onState({ ...snap, escalated: escalate, verdict: { rate: v.rate, gain: v.gain, rss: v.rss } }) } catch { /* the valve never kills the fleet */ }
        }
        return snap
      }
      return snapshot(t)
    },
    /** The gotoSafe consult: a pure read of the current state. */
    consult () {
      return snapshot(now())
    },
    stats () {
      return { ...stats }
    },
    reset () {
      guard.reset()
      closedUntil = 0
      lastCloseAt = -Infinity
      lastRate = 0
      lastRss = 0
      strikes = 0
      stats.closes = 0
      stats.escalations = 0
    }
  }
}

/**
 * The fleet19 ticker: sample process rss every 1s on the MAIN thread (the
 * worker cannot refuse walks; only the thread that owns the funnel can),
 * emit the transition lines through onLine (fleet19 logs them; tests pass
 * null). UNREF'd - the valve must never extend the fleet's life.
 * @param {{intervalMs?: number, onLine?: Function}} opts plus createAllocValve opts
 * @returns {{valve: object, stop: Function}}
 */
export function startAllocValve ({ intervalMs = 1000, onLine = null, ...opts } = {}) {
  const valve = createAllocValve(opts)
  let wasClosed = false
  const timer = setInterval(() => {
    let rssM = 0
    try { rssM = process.memoryUsage().rss / 1048576 } catch { return }
    let st
    try { st = valve.sample(rssM) } catch { return }
    if (typeof onLine === 'function') {
      try {
        const line = valveTransitionLine({ wasClosed, st, rssM, uptimeS: Math.round(process.uptime()) })
        if (line) onLine(line)
      } catch { /* logging never kills the fleet */ }
    }
    wasClosed = !!(st && st.closed)
  }, Math.max(250, intervalMs))
  try { timer.unref?.() } catch { /* older runtimes */ }
  return {
    valve,
    stop () { try { clearInterval(timer) } catch { /* already gone */ } }
  }
}
