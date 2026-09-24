// (v0.143.0) THE GOAL-RATE BRAKE - the re-issue cadence is the storm's rate
// knob. MEASURED (fleet leg 35994461858, the v0.142.0 STORM SURVIVAL, mined
// 2026-09-24): the end-phase flooded-region churn marched pathfinder goals at
// ~2.5+/s per walker - the blackbox ring: 'pf:goal next column @-1.0s <-
// pf:goal next column @-0.8s <- pf:done @-0.0s <- pf:queue next column alt
// @-0.0s <- pf:goal next column alt @+0.0s' - three goal-sets in 1.2s for ONE
// walk class, every one a ~90MB full-box A* explore over the flooded region,
// rss 989M -> 2114M in one 5s window (225MB/s), and the main thread froze
// SOLID right after the probe (the FATAL ring is byte-for-byte the probe's
// ring: not one main-thread note in the last 10s). THE GAP THE OLDER BREAKERS
// ALL SHARE: the stall governor (v0.74.0) and the fleet churn ceiling
// (v0.77.0) judge PROGRESS - and the flood walkers WERE progressing (1-3
// blocks per successful walk clears the churn evidence outright); the alloc
// valve (v0.102.0) judges DISTANCE - and the churn goals are NEAR (next
// column, <= 24b admitted while closed). Every breaker was blind to a walker
// that advances one column at a time through searches that outrun the GC.
//
// THE CURE: judge the RATE. An honest branch miner issues ~1 goal per 6-10s
// (walk the next column, dig it, repeat); a bot issuing BURST_LIMIT goals in
// GOAL_WINDOW_MS is not walking, it is FEEDING the pathfinder - exactly the
// run68 churn arithmetic, one abstraction higher: the governors counted
// zero-progress SETTLED walks, the brake counts ADMITTED goals regardless of
// outcome (a successful 90MB search is the MORE dangerous churn). Past the
// burst the funnel refuses new goals for GOAL_COOLDOWN_MS at zero cost (no
// queue slot, no setGoal, no A*), the caller's ladder falls through to its
// non-walk rungs (rotation, digShaft, redeploy - local work, no A*), and the
// sliding window ages the evidence out.
//
// THE FLEET CEILING (the v0.77.0 precedent): the per-bot burst leaves the
// aggregate unbounded - 19 fresh cooldowns grant 19x the burst at once. The
// fleet instance caps the whole process; BANK-priority walks consult it but
// are never refused by it (the only walks that turn mined blocks into stock
// must flow even mid-storm). Re-opening inside RECLOSE_WINDOW escalates the
// cooldown to ESCALATED_MS (the allocvalve's own escalation shape): a
// persistent storm earns progressively longer fleet-wide walk refusals, and
// the GC drains what the walk funnel stops feeding.
//
// Pure core, zero mineflayer imports: everything runs on injected numbers
// (fake clocks in tests), junk stays harmless, and the module never throws.
export const GOAL_WINDOW_MS = 5000 // the per-bot sliding window
export const GOAL_BURST_LIMIT = 6 // admitted goals inside the window that open the brake (~10x the honest branch-mine cadence)
export const GOAL_COOLDOWN_MS = 4000 // how long the open refuses new goals
export const FLEET_GOAL_WINDOW_MS = 5000
export const FLEET_GOAL_BURST_LIMIT = 30 // the honest fleet peak is ~4-6/s (19 miners + wood + bank waves); the storm class was 8-12+/s
export const FLEET_GOAL_COOLDOWN_MS = 5000
export const FLEET_GOAL_ESCALATED_MS = 20000 // a persistent storm earns a long walk refusal
export const FLEET_GOAL_RECLOSE_WINDOW_MS = 60000 // a re-open inside this window escalates

/**
 * Create one brake (one bot, or the whole fleet). All times come from the
 * caller (injectable clocks), so tests never sleep and production never
 * trusts a stray clock. Junk `now` records/consults nothing (harmless).
 */
export function createGoalBrake ({
  windowMs = GOAL_WINDOW_MS,
  burstLimit = GOAL_BURST_LIMIT,
  cooldownMs = GOAL_COOLDOWN_MS,
  escalatedMs = FLEET_GOAL_ESCALATED_MS,
  recloseWindowMs = FLEET_GOAL_RECLOSE_WINDOW_MS,
  now = () => Date.now(),
  onOpen = null
} = {}) {
  const stamps = [] // the admitted-goal timestamps inside the window (sliding)
  let openUntil = 0 // 0 = closed
  let lastOpenAt = -Infinity // the escalation clock (the allocvalve shape)
  const stats = { records: 0, refusals: 0, opens: 0, escalations: 0 }

  const prune = t => {
    while (stamps.length > 0 && t - stamps[0] > windowMs) stamps.shift()
  }

  return {
    /** Record one ADMITTED goal (call only after every consult passed - a
     * refused walk costs no A* and must not feed the very brake that caught
     * it). Junk timestamps are counted in stats but never stored (the window
     * arithmetic stays honest). */
    record (t = now()) {
      stats.records++
      if (!Number.isFinite(t) || t < 0) return
      prune(t)
      stamps.push(t)
    },

    /** Consult before issuing a goal. Returns { open, remainingMs, burst,
     * escalated } - open=true means the funnel must refuse this walk for
     * zero cost. THE OPEN HAPPENS HERE: the first consult whose window holds
     * burstLimit admissions refuses THAT goal and opens the brake in the
     * same breath (giving the spiral one more free A* is not honest). After
     * a cooldown expiry the stale window may still hold the burst - the
     * refusal continues until the evidence ages out (bounded by windowMs). */
    consult (t = now()) {
      if (!Number.isFinite(t) || t < 0) return { open: false, remainingMs: 0, burst: 0, escalated: false }
      if (openUntil > t) {
        stats.refusals++
        return { open: true, remainingMs: openUntil - t, burst: burstLimit, escalated: false }
      }
      if (openUntil !== 0 && openUntil <= t) openUntil = 0 // cooldown expired naturally
      prune(t)
      if (stamps.length >= burstLimit) {
        const escalate = (t - lastOpenAt) <= recloseWindowMs
        if (escalate) stats.escalations++
        lastOpenAt = t
        openUntil = t + (escalate ? escalatedMs : cooldownMs)
        stats.opens++
        try { if (typeof onOpen === 'function') onOpen({ burst: stamps.length, escalated: escalate }) } catch { /* a counter never breaks the gate */ }
        stats.refusals++
        return { open: true, remainingMs: openUntil - t, burst: stamps.length, escalated: escalate }
      }
      return { open: false, remainingMs: 0, burst: stamps.length, escalated: false }
    },

    stats () {
      return { ...stats, live: stamps.length, open: openUntil > 0 }
    },

    /** Test hook: forget everything (never used in production paths). */
    reset () {
      stamps.length = 0
      openUntil = 0
      lastOpenAt = -Infinity
      for (const k of Object.keys(stats)) stats[k] = 0
    }
  }
}
