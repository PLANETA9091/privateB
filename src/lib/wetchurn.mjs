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

// ---- (v0.223.0) THE WIRING SIDE - the recorder's cap and the swap pricing.
// The v0.200.0 pattern kept: anything the wiring must decide that a unit can
// pin lives here, pure; the call sites (miner.mjs records, the runner's work
// loop consults) stay thin enough for source pins to name every scalar.

/** (v0.223.0) The recorder's memory cap - the bot's OWN rescue-start log
 *  holds the last WET_CHURN_LOG_CAP stamps. The plan window needs 180s of
 *  them; the worst measured client printed 25 starts in a whole 600s run,
 *  so 64 is storm-proof headroom, not a behavioral gate (dropping the OLDEST
 *  stamp past the cap can only shrink a window the plan would have aged out
 *  anyway - honest at both ends). */
export const WET_CHURN_LOG_CAP = 64

/** (v0.223.0) The rest slice (ms) between plan re-reads - a night hold, a
 *  junk read or a too-short daylight tail rests this long, then the loop
 *  re-reads the plan (the cooldown owns the exit, the pass owns the slice). */
export const WET_CHURN_REST_MS = 5000

/** (v0.223.0) The dry-swap gather cap (ms) - one surface wood trip inside an
 *  evacuation costs at most this (the bootstrap lane's own 40s shape). */
export const WET_CHURN_WOOD_MS = 40000

/** (v0.223.0) The dry-swap gather floor (ms) - a wood trip shorter than this
 *  buys nothing (the walk machinery spends its first seconds REACHING the
 *  first tree), so a hold's short tail rests out instead of fake-gathering. */
export const WET_CHURN_WOOD_MIN_MS = 15000

/**
 * (v0.223.0) THE CHURN SWAP - what an evacuation pass does instead of the
 * wet-prone lanes, pure. The module's own law says the wiring decides WHERE;
 * this helper prices the slice, and the gates are each named:
 *   junk/empty remaining  rest (avoidance errs toward resting - a junk read
 *                          must never price a walk)
 *   night                 rest (the v0.140.1 hold owns the surface in the
 *                          dark; the caller passes daylight = !walkForbidden)
 *   daylight + a real tail  wood, capped by the hold's REMAINING time (the
 *                          cooldown owns the exit - the swap never extends it)
 *                          and by the gather cap, floored at the gather
 *                          minimum (below it the tail rests out honestly).
 * The swap NEVER gates a rescue (the plan never gates the ladder) and never
 * touches the hold's clock - it only prices THIS pass's dry work.
 *
 * @param {object} [p]
 * @param {number} [p.remainingMs] the hold's remaining time (0/junk = the
 *        arm pass's unknown tail - read rest)
 * @param {boolean} [p.daylight] the caller's walk-forbidden verdict, negated
 * @returns {{work:'wood'|'rest', maxMs:number}}
 */
export function churnSwap ({ remainingMs = 0, daylight = true } = {}) {
  if (!fin(remainingMs) || remainingMs <= 0) return { work: 'rest', maxMs: WET_CHURN_REST_MS }
  if (!daylight) return { work: 'rest', maxMs: Math.min(WET_CHURN_REST_MS, remainingMs) }
  const wood = Math.min(WET_CHURN_WOOD_MS, remainingMs)
  if (wood < WET_CHURN_WOOD_MIN_MS) return { work: 'rest', maxMs: Math.min(WET_CHURN_REST_MS, remainingMs) }
  return { work: 'wood', maxMs: wood }
}
