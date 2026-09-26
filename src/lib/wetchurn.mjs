/**
 * wetchurn.mjs - (v0.222.0) THE WET CHURN GOVERNOR - the after-storm
 * evacuation plan, pure. The v0.200.0 pattern: the plan lands first,
 * fully unit-tested, and the wiring rides the next lane.
 *
 * MEASURED (the wet-delivery storm, 2 field samples 2-straight):
 *   run32 (36255794232, the v0.218.0 debut): rescues=74 fleet-wide with
 *     F9+F19 printing 44 rescue starts (the deep flooded quarry keeps
 *     re-drowning the same two bots); airGlitches=0.
 *   run33 (36257829576, the v0.219.0 debut): rescues=88 (growing),
 *     airGlitches=1413 (a blowout from 0). THE SENTRY NAMES THE STORM
 *     BOTS: F9 g653/r19 + F19 g598/r17 = 1251 of 1413 glitches - THE
 *     SAME TWO BOTS 2-straight; F11 g0/r12 (12 rescues, ZERO glitches).
 *     The clients degrade mid-storm: F9 'frozen physics (4 flat passes
 *     at y=52.5, o2=4, head WET)' and 'frozen while head-wet (1
 *     verdict) - the drowning clock owns this client'.
 *
 * THE LAW THIS MODULE OBEYS: the rescue machinery is UNTOUCHABLE (0
 * losses across the whole storm - the ladder is airtight even at 2.4x
 * the calm cadence). The governor never caps a rescue, never defers a
 * save. What it owns is the AFTER-STORM stance: a bot the water keeps
 * re-drowning (its own rescue history, not the fleet's) should spend
 * its NEXT goal on dry ground for a cooldown window - an evacuation,
 * not a restriction. The wiring decides WHERE (the shelter priority or
 * a dry target swap); this module decides WHEN, purely.
 */

/** The churn window (ms) - the bot's OWN rescue history is read inside
 *  this sliding window only (storm series, not lifetime totals). */
export const WET_CHURN_WINDOW_MS = 180000

/** The evacuation cap - when the bot's own rescues inside the window
 *  reach this count, the next goal reads dry. Inclusive at the cap
 *  (avoidance errs toward resting, the inDragonZone convention). */
export const WET_CHURN_RESCUE_CAP = 6

/** The cooldown (ms) - how long the evacuation stance holds before the
 *  bot reads its churn fresh. Shorter than the despawn economics: the
 *  bot returns to work, the window re-reads honestly. */
export const WET_CHURN_COOLDOWN_MS = 90000

const fin = v => Number.isFinite(v)

/** Reads one rescue event into a timestamp, or null (junk is skipped
 *  honestly - a number, or a record carrying `at`). */
function eventAt (e) {
  if (typeof e === 'number' && fin(e)) return e
  if (e && typeof e === 'object' && fin(e.at)) return e.at
  return null
}

/**
 * (v0.222.0) THE CHURN READ - the bot's own rescue load inside the
 * sliding window, pure. Junk events are skipped (not evidence); the
 * count is inclusive of the window edge.
 *
 * @param {Array<number|{at:number}>|null} [events] the bot's OWN rescue
 *        timestamps (ms; any order - a rescue log need not be sorted)
 * @param {number} [now] the caller's clock
 * @returns {{count:number, windowMs:number}} the churn read
 */
export function wetRescueLoad (events, now = Date.now()) {
  const windowMs = WET_CHURN_WINDOW_MS
  if (!Array.isArray(events) || !fin(now)) return { count: 0, windowMs }
  let count = 0
  for (const e of events) {
    const at = eventAt(e)
    if (at === null) continue
    if (at <= now && now - at <= windowMs) count++
  }
  return { count, windowMs }
}

/**
 * (v0.222.0) THE CHURN PLAN - does this bot's next goal read dry, pure.
 * The gates, each named:
 *   no-history   the bot has no rescues in the window - no churn, the
 *                governor stays vacuous (honest: no evacuation on a
 *                silent bot)
 *   under-cap    the churn reads below the cap - the bot works on
 *   holding      an evacuation is ALREADY active (evacUntil > now) -
 *                the plan re-reads it with the remaining time, it never
 *                double-books or extends (the cooldown owns the exit)
 *   go           the churn reads at/above the cap - the next goal
 *                evacuates until now + WET_CHURN_COOLDOWN_MS
 *
 * A rescue DURING an evacuation is still a rescue (the machinery is
 * untouchable): the plan never gates the ladder - it only prices the
 * next voluntary goal. The wiring re-reads this plan on each goal.
 *
 * @param {object} [p]
 * @param {Array<number|{at:number}>|null} [p.rescueEvents] the bot's OWN
 *        rescue timestamps (ms, any order)
 * @param {number} [p.now] the caller's clock
 * @param {number} [p.evacUntil] the active evacuation's end (0/undefined
 *        when none - the wiring owns the field)
 * @returns {{go:boolean, why:string, untilMs?:number, count:number,
 *            remainingMs?:number}} a refusal reads { go:false, why:
 *            'no-history'|'under-cap'|'holding', count, remainingMs? },
 *            an evacuation reads { go:true, why:'churn', untilMs, count }
 */
export function wetChurnPlan ({
  rescueEvents = null,
  now = Date.now(),
  evacUntil = 0
} = {}) {
  const load = wetRescueLoad(rescueEvents, now)
  if (fin(evacUntil) && evacUntil > now) {
    return { go: false, why: 'holding', count: load.count, remainingMs: evacUntil - now }
  }
  if (load.count === 0) return { go: false, why: 'no-history', count: 0 }
  if (load.count < WET_CHURN_RESCUE_CAP) {
    return { go: false, why: 'under-cap', count: load.count }
  }
  return { go: true, why: 'churn', untilMs: now + WET_CHURN_COOLDOWN_MS, count: load.count }
}
