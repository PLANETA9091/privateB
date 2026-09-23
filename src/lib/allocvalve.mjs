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
//
// (v0.104.0) THE RUN93 LESSON - ONE VALVE, TWO FEEDERS. run93 (dispatch
// 35835942682, the valve's first field test) died of the EXACT run92 OOM
// class (worker second strike at rss 2626M, ts~581s, no FLEET RESULT) and
// the log carried ZERO [allocvalve] lines. Two defects, both found:
//   D1 (certain, in the code): TWO INSTANCES SHIPPED. jobqueue's funnel
//     consults its `fleetValve` singleton; fleet19's startAllocValve call
//     created and fed a PRIVATE instance (startAllocValve always built its
//     own). The ticker fed one valve, the funnel consulted the other - the
//     consulted valve was never sampled, closed:false forever, the cure
//     could not refuse a single walk. startAllocValve now accepts the
//     caller's instance ({ valve }) and jobqueue exposes
//     startFleetValveTicker - the singleton owns its ticker.
//   D2 (field-proven): the main-thread ticker is starved by the very storm
//     it cures (the FATAL line names the main thread FROZEN; mainLate
//     1034ms). The worker's 5s probe runs on its OWN thread and detected
//     both storms (run92+run93) - it is the reliable detector. A SAB cell
//     (stormCell) now carries the worker's first-strike verdict to the
//     main thread: the ticker applies it via forceClose on the first
//     post-freeze tick (refusals only matter when the funnel resumes
//     anyway), the growth is cut, GC drains, the worker's streak resets
//     on the dip and the kill never arms. The main ticker keeps its own
//     1s sampling - the faster detector when the main is healthy; the
//     worker probe is the freeze-class backstop.
import { createStormGuard, STORM_RATE_MB_S_DEFAULT, STORM_WINDOW_MS } from './stormguard.mjs'

// (v0.115.0) THE FLOOR DROP 600 -> 450 - run101 (35881462426, the v0.114.0
// fleet) measured the healthy band at 356-360M and the spike at +208MB/s:
// rss crossed 600M already INSIDE the first burst (+1039M in 5s), so the
// 600M floor armed the valve only after the burst had mostly landed. 450M
// sits 17% over the run92 healthy top (383M) - the earliest arm that cannot
// fire on a healthy run's fluctuation (the storm verdict still needs the
// SUSTAINED 40MB/s rate, and the window resets on every rss dip - a healthy
// run oscillates, a storm only climbs). The worker's kill floor stays 1200M.
export const ALLOC_VALVE_FLOOR_MB_DEFAULT = 450 // healthy run92 rss was 375-383M, run101's 356-360M; the worker's floor is 1200M
export const ALLOC_VALVE_COOLDOWN_MS_DEFAULT = 12000 // one closure = a bounded walk outage
export const ALLOC_VALVE_ESCALATED_MS_DEFAULT = 30000 // a re-close within the window escalates
export const ALLOC_VALVE_RECLOSE_WINDOW_MS = 60000 // two closures inside this window = a sustained storm
export const ALLOC_VALVE_NEAR_BLOCKS_DEFAULT = 24 // straight-line bot->goal: rescues/climbs/next-columns flow, chest walks stop
// (v0.115.0) THE QUEUE-PRESSURE ARM - run101's storm had a 60-90s WARNING the
// rss side never saw: the pathfinder queue sat at 6a/8-12q from ts=141 to the
// ts=221 kill (mined FROZEN at 92 the whole minute, mainLate 1.9-3.0s), while
// rss read a healthy 356-360M until the burst itself. A healthy run's queue
// PEAKS are momentary (run100 SUCCESS: 10-11q seen exactly once each, the
// fleet's 19 bots issuing in the same tick); a STORM's saturation is SUSTAINED
// (run101: >=10q on every visible ticker tick for 80s+). The arm closes the
// valve on the SUSTAINED shape: queued >= PATH_QUEUE_ARM_DEFAULT for
// PATH_QUEUE_SUSTAINED_TICKS_DEFAULT consecutive 1s ticks - run100's isolated
// bursts reset the streak before 30, run101's wall closes the valve ~50s
// BEFORE the burst. The close reuses the storm semantics (long walks refused,
// short walks flow, escalate on reclose) - the fuel is the same long A*.
export const PATH_QUEUE_ARM_DEFAULT = 10
export const PATH_QUEUE_SUSTAINED_TICKS_DEFAULT = 30
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

// (v0.104.0) THE STORM CELL - the worker->main verdict channel (one SAB, 8
// Int32 slots). The worker's stormguard (its own thread, 5s cadence, never
// starved by the main thread's sync A*) publishes its first-strike verdict
// here; the main ticker applies it via forceClose. Layout (Int32Array):
//   [0] MAGIC - the writer's init check (the main writes it at creation; an
//       uninitialized cell is silently skipped - degraded to no channel,
//       never to a false storm)
//   [1] SEQ   - the writer increments it LAST (fields first, seq last), the
//       reader applies only a double-read-stable snapshot, exactly once
//   [2] RATE  - MB/s of the worker's verdict
//   [3] RSS   - MB at the verdict
//   [4] TS_S  - process.uptime() seconds at the verdict (the worker and the
//       main share one process uptime - the line shows WHEN it fired, the
//       line order shows how late a frozen main applied it)
export const STORM_CELL_MAGIC = 0x53544F52 // 'STOR'
export const STORM_CELL_SLOTS = 8

/** Pure writer (the CI-tested reference; the eval worker hand-mirrors it -
 * it cannot import ESM). Fields first, seq last: a reader that catches the
 * seq mid-write simply skips the torn snapshot and applies the next one.
 * Junk numbers and a missing/uninitialized cell never throw, never write. */
export function stormCellPublish ({ cell, rate = 0, rss = 0, tsS = 0 } = {}) {
  if (!cell) return false
  try {
    const c = new Int32Array(cell)
    if (c.length < 5 || c[0] !== STORM_CELL_MAGIC) return false
    const r = Math.round(Number(rate))
    const m = Math.round(Number(rss))
    const t = Math.round(Number(tsS))
    if (!Number.isFinite(r) || r <= 0 || !Number.isFinite(m) || m <= 0 || !Number.isFinite(t) || t < 0) return false
    c[2] = r
    c[3] = m
    c[4] = t
    c[1] = c[1] + 1 // seq LAST - the publish is atomic enough for the double-read contract
    return true
  } catch { return false }
}

/** Pure reader: apply the cell's newest verdict exactly once per seq via the
 * given forceClose. Returns { applied, seq, snapshot } - applied=false on a
 * stable already-applied seq, a torn snapshot, junk numbers or a dead cell
 * (the caller just polls again on the next tick - nothing is ever lost, the
 * cell holds the LATEST verdict until a newer one overwrites it). */
export function stormCellApply ({ cell, lastSeq = 0, forceClose = null } = {}) {
  if (!cell || typeof forceClose !== 'function') return { applied: false, seq: lastSeq, snapshot: null }
  try {
    const c = new Int32Array(cell)
    if (c.length < 5 || c[0] !== STORM_CELL_MAGIC) return { applied: false, seq: lastSeq, snapshot: null }
    const s1 = c[1]
    if (s1 === lastSeq) return { applied: false, seq: lastSeq, snapshot: null }
    const rate = c[2]
    const rss = c[3]
    const tsS = c[4]
    const s2 = c[1]
    if (s1 !== s2) return { applied: false, seq: lastSeq, snapshot: null } // torn - retry next tick
    const snap = forceClose({ rate, rss, source: 'worker-probe', tsS })
    return { applied: true, seq: s1, snapshot: snap, tsS }
  } catch { return { applied: false, seq: lastSeq, snapshot: null } }
}

/** Pure log-line builder for the worker-probe close (a DIFFERENT named line
 * from the ticker's CLOSED - the log-reading agents must be able to tell
 * WHICH feeder armed the cure). Kept pure so the tests pin it. */
export function valveWorkerCloseLine ({ st = {}, tsS = 0 } = {}) {
  const rss = Number.isFinite(st.lastRss) ? st.lastRss : 0
  const rate = Number.isFinite(st.lastRate) ? st.lastRate : 0
  const rem = Number.isFinite(st.remainingMs) ? Math.round(st.remainingMs / 1000) : 0
  const strikes = Number.isFinite(st.strikes) ? st.strikes : 0
  const ts = Number.isFinite(tsS) ? tsS : 0
  return `[allocvalve] CLOSED (worker probe): rss ${rss}M (+${rate}MB/s storm) - long walks refused ${rem}s (strike ${strikes}, the worker's field-proven verdict applied at the funnel; short walks <= ${ALLOC_VALVE_NEAR_BLOCKS_DEFAULT}b still flow) ts=${ts}s`
}

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
    // (v0.115.0) the queue-pressure flavor: the sustained pathfinder saturation
    // closed the valve BEFORE any rss storm - name the pressure, not a fake rate.
    if (st.lastSource === 'queue-pressure') {
      const queued = Number.isFinite(st.lastQueued) ? st.lastQueued : 0
      const streak = Number.isFinite(st.pressureStreak) ? st.pressureStreak : 0
      return `[allocvalve] CLOSED: path queue ${queued}q sustained ${streak}s (the run101 feeder cut) - long walks refused ${rem}s (strike ${strikes}; short walks <= ${ALLOC_VALVE_NEAR_BLOCKS_DEFAULT}b still flow) ts=${uptimeS}s`
    }
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
 * forceClose (v0.104.0) applies an EXTERNAL field-proven verdict (the
 * worker probe's storm) with the same close semantics - the freeze-class
 * backstop for a main thread too starved to sample its own storm.
 * @param {{rateMbS?: number, floorMb?: number, windowMs?: number, cooldownMs?: number, escalatedMs?: number, recloseWindowMs?: number, now?: Function, onState?: Function}} opts
 * @returns {{sample: Function, consult: Function, forceClose: Function, stats: Function, reset: Function}}
 */
export function createAllocValve ({ rateMbS = STORM_RATE_MB_S_DEFAULT, floorMb = ALLOC_VALVE_FLOOR_MB_DEFAULT, windowMs = STORM_WINDOW_MS, cooldownMs = ALLOC_VALVE_COOLDOWN_MS_DEFAULT, escalatedMs = ALLOC_VALVE_ESCALATED_MS_DEFAULT, recloseWindowMs = ALLOC_VALVE_RECLOSE_WINDOW_MS, queueArm = PATH_QUEUE_ARM_DEFAULT, queueSustainedTicks = PATH_QUEUE_SUSTAINED_TICKS_DEFAULT, now = () => Date.now(), onState = null } = {}) {
  const guard = createStormGuard({ rateMbS, floorMb, windowMs, now })
  const stats = { closes: 0, escalations: 0, workerCloses: 0, queueCloses: 0 }
  let closedUntil = 0
  let lastCloseAt = -Infinity
  let lastRate = 0
  let lastRss = 0
  let lastSource = 'sample'
  let strikes = 0
  // (v0.115.0) the queue-pressure streak: consecutive samples with the
  // pathfinder queue at/above the arm. Any sub-arm sample resets it (the
  // healthy run100 shape: an isolated 10-11q burst never reaches 30).
  const qArm = Number.isFinite(queueArm) && queueArm >= 1 ? Math.floor(queueArm) : PATH_QUEUE_ARM_DEFAULT
  const qTicks = Number.isFinite(queueSustainedTicks) && queueSustainedTicks >= 1 ? Math.floor(queueSustainedTicks) : PATH_QUEUE_SUSTAINED_TICKS_DEFAULT
  let pressureStreak = 0
  let lastQueued = 0

  function snapshot (t) {
    const closed = t < closedUntil
    return {
      closed,
      remainingMs: Math.max(0, closedUntil - t),
      strikes,
      lastRate,
      lastRss,
      lastSource,
      lastQueued,
      pressureStreak,
      closes: stats.closes
    }
  }

  function doClose (t, { source, rate, rss, queued, verdict = null }) {
    const escalate = (t - lastCloseAt) <= recloseWindowMs
    if (escalate) stats.escalations++
    strikes++
    stats.closes++
    if (source === 'worker-probe') stats.workerCloses++
    if (source === 'queue-pressure') stats.queueCloses++
    lastCloseAt = t
    lastRate = Number.isFinite(rate) ? Math.round(rate) : 0
    lastRss = Number.isFinite(rss) ? Math.round(rss) : 0
    lastQueued = Number.isFinite(queued) ? Math.round(queued) : lastQueued
    lastSource = source
    closedUntil = t + (escalate ? escalatedMs : cooldownMs)
    const snap = snapshot(t)
    if (typeof onState === 'function') {
      try { onState({ ...snap, escalated: escalate, source, ...(verdict ? { verdict } : {}) }) } catch { /* the valve never kills the fleet */ }
    }
    return snap
  }

  return {
    /** Feed one rss sample (MB) - and optionally the pathfinder queue depth.
     * A storm verdict NOT while already closed closes the valve for cooldownMs
     * (escalated after a fresh reclose). Junk rss never enters the window (the
     * guard's contract). (v0.115.0) the QUEUE-PRESSURE ARM rides the same
     * sample: queued >= arm on SUSTAINED_TICKS consecutive samples closes the
     * valve with source 'queue-pressure' (the run101 feeder cut ~50s before
     * the rss burst); any sub-arm sample resets the streak. Junk queued judges
     * nothing (the streak just does not advance). */
    sample (rssMb, { queued = null } = {}) {
      const t = now()
      const v = guard.sample(rssMb)
      if (v && v.storm && t >= closedUntil) {
        return doClose(t, { source: 'sample', rate: v.rate, rss: v.rss, queued, verdict: { rate: v.rate, gain: v.gain, rss: v.rss } })
      }
      // (v0.115.0) the sustained queue-pressure arm - the earliest storm signal
      // NO reading (null/undefined - the reader absent or it threw) HOLDS the
      // streak: absence of evidence is not evidence of a drained queue. A junk
      // reading (NaN/negative) also holds. Only a FINITE reading advances or
      // resets (Number(null) is 0 - the null must never masquerade as '0 queued',
      // the funnel-test lesson).
      if (queued !== null && queued !== undefined) {
        const q = Number(queued)
        if (Number.isFinite(q) && q >= 0) {
          if (q >= qArm) {
            pressureStreak++
            lastQueued = Math.round(q)
          } else {
            pressureStreak = 0
          }
          if (pressureStreak >= qTicks && t >= closedUntil) {
            return doClose(t, { source: 'queue-pressure', rate: v && v.rate ? v.rate : 0, rss: v && v.rss ? v.rss : lastRss, queued: q })
          }
        }
      }
      return snapshot(t)
    },
    /** (v0.104.0) Apply an EXTERNAL verdict (the worker probe's storm - the
     * field-proven detector). Same close semantics as a sampled verdict:
     * the reclose window escalates, onState fires, an already-closed valve
     * absorbs it (closes stays put). Junk numbers are clamped to 0 - the
     * close decision was the WORKER's, the numbers are for the story. */
    forceClose ({ rate = 0, rss = 0, source = 'worker-probe' } = {}) {
      const t = now()
      if (t < closedUntil) return snapshot(t) // already closed - absorb
      const escalate = (t - lastCloseAt) <= recloseWindowMs
      if (escalate) stats.escalations++
      strikes++
      stats.closes++
      if (source === 'worker-probe') stats.workerCloses++
      lastCloseAt = t
      lastRate = Number.isFinite(rate) ? Math.round(rate) : 0
      lastRss = Number.isFinite(rss) ? Math.round(rss) : 0
      lastSource = source === 'worker-probe' ? 'worker-probe' : 'sample'
      closedUntil = t + (escalate ? escalatedMs : cooldownMs)
      const snap = snapshot(t)
      if (typeof onState === 'function') {
        try { onState({ ...snap, escalated: escalate, source }) } catch { /* the valve never kills the fleet */ }
      }
      return snap
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
      lastSource = 'sample'
      strikes = 0
      pressureStreak = 0
      lastQueued = 0
      stats.closes = 0
      stats.escalations = 0
      stats.workerCloses = 0
      stats.queueCloses = 0
    }
  }
}

/**
 * The fleet19 ticker: sample process rss every 1s on the MAIN thread (the
 * worker cannot refuse walks; only the thread that owns the funnel can),
 * emit the transition lines through onLine (fleet19 logs them; tests pass
 * null). UNREF'd - the valve must never extend the fleet's life.
 * (v0.104.0) TWO FEEDERS, ONE VALVE:
 *   { valve }  - feed the CALLER'S instance (run93 D1: the ticker used to
 *     build a private valve while the funnel consulted jobqueue's singleton -
 *     the consulted valve was never sampled and the cure could not fire);
 *     without it a private instance is created (the legacy shape, tests).
 *   { stormCell } - poll the worker's verdict cell every tick and apply a
 *     fresh verdict via forceClose (run93 D2: the main ticker is starved by
 *     the very storm it cures; the worker's own-thread probe is the reliable
 *     detector - run92 AND run93's storms were caught by it, never by the
 *     main sampler). A worker close logs the named
 *     '[allocvalve] CLOSED (worker probe)' line - the two feeders stay
 *     distinguishable in the mine.
 * @param {{intervalMs?: number, onLine?: Function, valve?: object, stormCell?: SharedArrayBuffer}} opts plus createAllocValve opts
 * @returns {{valve: object, stop: Function}}
 */
export function startAllocValve ({ intervalMs = 1000, onLine = null, valve = null, stormCell = null, queueDepth = null, ...opts } = {}) {
  const v = valve || createAllocValve(opts)
  let wasClosed = false
  let lastSeq = 0
  const timer = setInterval(() => {
    let rssM = 0
    try { rssM = process.memoryUsage().rss / 1048576 } catch { return }
    // (v0.115.0) the queue-pressure arm rides the same tick: the caller injects
    // the live queue depth (the jobqueue singleton owns the path semaphore -
    // the valve module cannot import it back). Junk/throwing reader = null =
    // the streak just does not advance.
    let queued = null
    if (typeof queueDepth === 'function') {
      try { queued = queueDepth() } catch { queued = null }
    }
    let st
    try { st = v.sample(rssM, { queued }) } catch { return }
    if (typeof onLine === 'function') {
      try {
        const line = valveTransitionLine({ wasClosed, st, rssM, uptimeS: Math.round(process.uptime()) })
        if (line) onLine(line)
      } catch { /* logging never kills the fleet */ }
    }
    wasClosed = !!(st && st.closed)
    // (v0.104.0) the worker-probe poll: apply a fresh verdict exactly once
    // per seq. Only when the valve is still OPEN - a same-tick sampled close
    // absorbs the verdict (one close, one line, no double-count).
    if (stormCell && !wasClosed) {
      try {
        const r = stormCellApply({ cell: stormCell, lastSeq, forceClose: a => v.forceClose(a) })
        if (r.applied) {
          lastSeq = r.seq
          wasClosed = true
          if (typeof onLine === 'function' && r.snapshot) {
            try { onLine(valveWorkerCloseLine({ st: r.snapshot, tsS: r.tsS })) } catch { /* logging never kills the fleet */ }
          }
        }
      } catch { /* the channel never kills the fleet */ }
    }
  }, Math.max(250, intervalMs))
  try { timer.unref?.() } catch { /* older runtimes */ }
  return {
    valve: v,
    stop () { try { clearInterval(timer) } catch { /* already gone */ } }
  }
}
