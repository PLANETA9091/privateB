/**
 * bankshed.mjs - (v0.558.0) THE WEIGHT SHED - the bank-budget gap's cure,
 * pure. The v0.200.0 pattern: the plan lands first, fully unit-tested, and
 * the wiring rides the next lane.
 *
 * MEASURED (the bank-budget gap, fleet 37125612065, the second all-green
 * fleet): 'bank budget gap: 680s needed, 300s budgeted - 380s short at
 * 1.1u/s' - a whale pocket reached the endphase and the end-bank chains
 * could not drain it inside END_BANK_BUDGET_MS; the write-off read the
 * same walk twice (F12 220u = 31.1% of an unbanked 707u crater on face
 * 36631612575, the whale-walk cure's exact target). The pocket's fate is
 * sealed LONG before the endphase: the units accumulate mid-run while the
 * only delivery window is the budgeted tail.
 *
 * THE LAW THIS MODULE OBEYS: the v0.140.1 night hold stays UNTOUCHABLE and
 * the dusk-bank plan (v0.226.0) stays the daylight twin - that plan prices
 * against the vanilla tod (the sky), this plan prices against the RUN
 * clock (the deadline); the wiring consults duskBankPlan FIRST and this
 * plan only when the sky is not the constraint (bright hours, or a run
 * whose window ignores tod). What this module owns: a bot whose pocket
 * ALREADY outruns the end-bank budget (the gap the v0.328.0 row measures)
 * should spend a voluntary goal on a bank trip while the run clock still
 * covers it - a shed, not a rescue. A trip the clock cannot cover reads
 * 'late' (the honest refusal: the endphase owns the outcome, exactly as
 * today). The wiring decides WHETHER to spend the goal (it re-reads this
 * plan each pass, the churn-wiring shape); this module decides WHEN the
 * shed fits, purely.
 *
 * THE ARITHMETIC: the projected end need is pocket/rate seconds (the same
 * ceil the flow row speaks) - at/under the budget the end bank covers the
 * pocket (the leanness law: silence is a healthy run's shape, the <= law
 * parity with bankBudgetGapRow); over it every pass inside the fit window
 * arms the shed. The fit: remaining - (trip + safety) >= slack - the trip
 * must land with run clock to spare (the return leg's variance is the
 * safety's own story; the slack keeps the bot out of the pre-position
 * window's claim, the v0.193.0 stagger's neighbor).
 */

/** The return margin (ms): the shed trip's priced end carries this much
 *  walk variance - parity with DUSK_BANK_SAFETY_MS (the same physics:
 *  the walk's own variance eats the margin, not the payload). */
export const SHED_SAFETY_MS = 15000

/** The slack floor (ms): the fit requires the trip to land this far
 *  before the run clock expires - a shed arming edge-to-edge is a shed
 *  the endphase's pre-position window claims on arrival; the slack keeps
 *  the delivery and the pre-position from sharing a breath. */
export const SHED_SLACK_MS = 30000

const fin = v => Number.isFinite(v)

/**
 * (v0.558.0) THE WEIGHT SHED - does a mid-run bank trip fit the run
 * clock before the end-bank budget gap strands the pocket, pure. The
 * gates, each named:
 *   unknown  junk inputs (non-finite pocket/rate/tripMs/remainingMs/
 *            budgetMs; rate <= 0 - a measured rate of zero cannot price
 *            a need; budget <= 0 - the end bank always has a budget,
 *            zero is impossible config; negative remaining). Never
 *            guess on junk.
 *   holding  a shed trip is ALREADY priced (tripUntil > now) - the plan
 *            re-reads it with the remaining time, never double-books or
 *            extends (the trip's own clock owns the exit; the wiring's
 *            carry-clock, the churn shape).
 *   light    pocket <= 0, or the projected end need (ceil pocket/rate)
 *            is at/under the budget - the end bank covers the pocket,
 *            the leanness law (silence is healthy). No trip.
 *   late     the run clock cannot cover trip + safety + slack - the
 *            endphase's pre-position window owns the goal anyway; the
 *            honest refusal (the endphase owns the outcome as today).
 *   go       the shed fits: priced until now + tripMs + safety, the
 *            pocket's projected need and gap ride the read (the wiring
 *            logs the gap it is curing).
 *
 * @param {object} [p]
 * @param {number} [p.pocketUnits] the bot's pocket size in units
 * @param {number} [p.rate] the MEASURED bank flow rate (u/s) - the
 *        wiring measures it (the bank-flow row's own arithmetic); an
 *        unmeasured rate never prices a shed
 * @param {number} [p.tripMs] the WIRING-MEASURED bank trip duration
 *        (ms) - undefined/junk reads late inside the fit (an unmeasured
 *        trip is never priced)
 * @param {number} [p.remainingMs] the run clock left before the
 *        endphase owns the goal (the wiring measures)
 * @param {number} [p.budgetMs] the end-bank budget (endBankBudgetMs's
 *        read)
 * @param {number} [p.now] the caller's clock
 * @param {number} [p.tripUntil] the active shed trip's end (0/undefined
 *        when none - the wiring owns the field)
 * @returns {{go:boolean, why:string, untilMs?:number, remainingMs?:number,
 *            needS?:number, gapS?:number}} a refusal reads
 *            { go:false, why }, a trip reads
 *            { go:true, why:'shed', untilMs, needS, gapS }
 */
export function shedPlan ({
  pocketUnits = NaN,
  rate = NaN,
  tripMs = NaN,
  remainingMs = NaN,
  budgetMs = NaN,
  now = Date.now(),
  tripUntil = 0
} = {}) {
  // junk first: a shed is priced, never guessed - the rate is a MEASURED
  // flow (zero or negative cannot price a need), the budget is config
  // (zero is impossible - the end bank always has one)
  if (!fin(pocketUnits) || !fin(rate) || rate <= 0 || !fin(remainingMs) ||
      remainingMs < 0 || !fin(budgetMs) || budgetMs <= 0) {
    return { go: false, why: 'unknown' }
  }
  // an active trip re-reads first - never double-booked, never extended
  if (fin(tripUntil) && tripUntil > now) {
    return { go: false, why: 'holding', remainingMs: tripUntil - now }
  }
  // the leanness law: the end bank covers the pocket (the <= law parity
  // with bankBudgetGapRow - the two rows must never disagree about the
  // arithmetic they share: same ceil on the need, same seconds)
  const needS = Math.ceil(Math.floor(pocketUnits) / rate)
  const budgetS = Math.floor(budgetMs / 1000)
  if (Math.floor(pocketUnits) <= 0 || needS <= budgetS) {
    return { go: false, why: 'light', needS }
  }
  // the fit: trip + safety + slack against the run clock - a shed that
  // lands edge-to-edge is a shed the pre-position window claims
  if (!fin(tripMs) || tripMs < 0 ||
      remainingMs < tripMs + SHED_SAFETY_MS + SHED_SLACK_MS) {
    return { go: false, why: 'late', remainingMs, needS }
  }
  return {
    go: true,
    why: 'shed',
    untilMs: now + tripMs + SHED_SAFETY_MS,
    needS,
    gapS: needS - budgetS
  }
}
