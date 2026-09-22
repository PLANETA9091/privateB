// (v0.74.0) THE STALL GOVERNOR - the churn breaker at the gotoSafe funnel,
// per bot. The doomed-goal ledger (v0.72.0) breaks the GEOMETRY spiral: a
// pathfinder dead verdict ('No path' / 'Took to long') ledgered the cell, the
// re-issues die for 0 cost. MEASURED (run68, dispatch 35711725877's sibling
// 35698977810, HARD KILL): the spiral came back WITHOUT a single dead verdict
// - ZERO ledger records, ZERO 'Took to long' in the whole log, 20x budget
// timeouts ('timeout after Nms') instead, and the blackbox chains showed
// goals being queued AND done at a ~7.5s cadence INSIDE the 151s freeze
// window: the main thread was CHURNING, not blocked. The fuel was the
// re-issue itself: saturation (starved physics) makes every walk stall -
// 'climb wet escape: 2 blocks walked (stalled)', 'climb rise assist: timeout
// after 4500ms' - and every task loop answers a stalled walk by escalating
// to ANOTHER walk (side-hop 'next column alt', rotate, redeploy). Each
// re-issue = setGoal -> resetPath -> a fresh A* burst on the one shared main
// thread, which deepens the starvation that stalled the walk in the first
// place. The budget timeouts never record (correctly - geometry is unproven),
// so the ledger has nothing to catch and the churn is self-sustaining.
//
// THE CURE: judge the WALKER, not the geometry. A bot that settles goal
// after goal with ZERO position progress is not walking anywhere right now -
// its task loop is feeding the pathfinder during a starvation window. After
// STALL_CHURN_LIMIT zero-progress walks inside STALL_WINDOW_MS, the governor
// OPENS for that bot: gotoSafe refuses new goals for STALL_COOLDOWN_MS at
// zero cost (no queue slot, no setGoal, no A*), and the caller's own
// escalation ladder falls through to its non-walk rungs (rotation, digShaft,
// redeploy) or simply waits its cadence out. The open closes EARLY when the
// bot's position moves on its own (a rescue hauled it out, gravity dropped
// it) - the stall condition may have cleared, and an honest governor must
// not trap a bot that can walk again. Any REAL progress walk (>1 block)
// clears the churn streak outright.
//
// Per-bot by construction: the state machine is a plain object the funnel
// keeps in a WeakMap keyed by the bot. One wedged bot never strangles the
// fleet; 19 wedged bots (run68's storm) each stop feeding the pathfinder.
//
// Pure core, zero mineflayer imports: everything runs on injected numbers
// (fake clocks in tests), junk stays harmless, and the module never throws.
export const STALL_WINDOW_MS = 30000 // the churn window (sliding, by outcome time)
export const STALL_CHURN_LIMIT = 4 // zero-progress settled walks inside the window that open the stall
export const STALL_MIN_PROGRESS = 1.0 // blocks of displacement that count as real progress
export const STALL_COOLDOWN_MS = 12000 // how long the open refuses new walks

/**
 * Create one governor (one bot). All times come from the caller (injectable
 * clocks), so tests never sleep and production never trusts a stray clock.
 * Displacement unknown (null/undefined/NaN) outcomes are IGNORED - an
 * unmeasurable walk must never feed the stall verdict.
 */
export function createWalkGovernor ({
  windowMs = STALL_WINDOW_MS,
  churnLimit = STALL_CHURN_LIMIT,
  minProgress = STALL_MIN_PROGRESS,
  cooldownMs = STALL_COOLDOWN_MS,
  onOpen = null
} = {}) {
  const outcomes = [] // { at, progress } - progress null = unmeasurable (kept but never counted)
  let openUntil = 0 // 0 = closed
  let openPos = null // the bot's position when the stall opened (for the early-close check)
  const stats = { records: 0, refusals: 0, opens: 0, earlyCloses: 0, progressClears: 0 }

  const prune = now => {
    while (outcomes.length > 0 && now - outcomes[0].at > windowMs) outcomes.shift()
  }

  return {
    /** Record one settled walk. progress = displacement in blocks, or null
     * when the funnel could not measure it (junk entity, mock). A real
     * progress walk clears the churn streak and closes an open stall's
     * streak (the cooldown itself still runs - the refusal window is short). */
    recordOutcome (progress, now) {
      stats.records++
      if (!Number.isFinite(progress)) return // unmeasurable: evidence, not fuel
      prune(now)
      outcomes.push({ at: now, progress })
      if (progress >= minProgress) {
        // real movement: the walker works - drop the churn evidence entirely
        outcomes.length = 0
        stats.progressClears++
      }
    },

    /** Consult before queuing a new goal. pos = the bot's current position
     * (or null). Returns { open, remainingMs, churn } - open=true means the
     * funnel must refuse this walk for zero cost. THE OPEN HAPPENS HERE: the
     * first consult whose window holds churnLimit zero-progress walks refuses
     * THAT walk and opens the stall in the same breath (the evidence is
     * already sufficient - giving the spiral one more free A* is not honest).
     * After a cooldown expiry the stale window may still hold the churn - the
     * refusal continues until the evidence ages out (bounded by windowMs) or
     * the bot moves (the early close below). */
    consult (pos, now) {
      // the early close: the bot MOVED on its own while the stall was open -
      // whatever wedged it may have cleared (a rescue, a fall, a shove)
      if (openUntil > now && pos && openPos &&
        typeof pos.distanceTo === 'function' && openPos.distanceTo) {
        let moved = null
        try { moved = pos.distanceTo(openPos) } catch { /* junk positions stay harmless */ }
        if (Number.isFinite(moved) && moved > minProgress) {
          openUntil = 0
          openPos = null
          outcomes.length = 0
          stats.earlyCloses++
        }
      }
      if (openUntil > now) {
        stats.refusals++
        return { open: true, remainingMs: openUntil - now, churn: churnLimit }
      }
      if (openUntil !== 0 && openUntil <= now) { // cooldown expired naturally
        openUntil = 0
        openPos = null
      }
      prune(now)
      const churn = outcomes.filter(o => Number.isFinite(o.progress) && o.progress < minProgress).length
      if (churn >= churnLimit) {
        openUntil = now + cooldownMs
        openPos = pos || null
        stats.opens++
        try { if (typeof onOpen === 'function') onOpen({ churn, cooldownMs }) } catch { /* a counter never breaks the gate */ }
        stats.refusals++
        return { open: true, remainingMs: cooldownMs, churn }
      }
      return { open: false, remainingMs: 0, churn }
    },

    /** Backwards-compat delegate (tests + future callers): same state machine
     * as consult - the open rides inside it. */
    maybeOpen (pos, now) {
      return this.consult(pos, now)
    },

    stats () {
      return { ...stats, live: outcomes.length, open: openUntil > 0 }
    },

    /** Test hook: forget everything (never used in production paths). */
    reset () {
      outcomes.length = 0
      openUntil = 0
      openPos = null
      for (const k of Object.keys(stats)) stats[k] = 0
    }
  }
}
