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

// (v0.561.0) THE SHED PRICER - the wiring's tripMs, priced purely. The
// v0.560.0 plan left bankTripMs as a WIRING-MEASURED input; nothing
// prices it yet (the dusk plan's own wiring never landed - both plans
// ride the same seat-less shelf), and a pricer the wiring can call
// without a bot or a server is the second leg of the whale cure. THE
// COMPOSITE (each leg field-grounded):
//   out + back walk  - tripplan's walkBudgetMs (the OOM-capped walk
//                      budget, v0.11.2 lesson) priced TWICE: the shed
//                      delivers AND returns;
//   the climb        - endphase's DEEP_CLIMB_MS_PER_LEVEL (4200ms per
//                      level, the v0.307.0 deep-window vertical price
//                      face 36539598929) - the mid-run climb is the same
//                      vertical walk the deep window prices;
//   the chain        - smelt + deposit + goal snap, one overhead
//                      constant grounded by the measured delivered band
//                      (fleet 36286821015: the chains price 156-184s at
//                      the arm): the composite at the measured shape
//                      (30 blocks out, 20 levels up) reads 172s - inside
//                      the band, by construction.
import { walkBudgetMs } from './tripplan.mjs'
import { DEEP_CLIMB_MS_PER_LEVEL } from './endphase.mjs'

/** The chain overhead (ms): smelt + deposit + goal snap - the part of a
 *  delivered bank chain that is neither walk nor climb. Grounded by the
 *  measured band (fleet 36286821015, 156-184s at the arm): the composite
 *  at the measured shape lands mid-band with this constant. */
export const SHED_CHAIN_OVERHEAD_MS = 60000

/**
 * (v0.561.0) Price one mid-run bank trip for the shed plan - pure, no
 * bot, no server. The wiring measures the bot's distance to its bank
 * yard and its depth below ground; this module prices the trip.
 * @param {object} [p]
 * @param {number} [p.dist] straight-line distance to the bank yard
 *        (blocks) - junk floors to 0 (the walk's own floor holds)
 * @param {number} [p.climbLevels] depth below the yard level (levels,
 *        positive down) - junk floors to 0 (a surface bot has no climb)
 * @returns {number} milliseconds - the priced trip for shedPlan's
 *          bankTripMs, always at least the walk floor x2 + the chain
 */
export function shedTripMs ({ dist = 0, climbLevels = 0 } = {}) {
  const d = Number.isFinite(dist) && dist > 0 ? dist : 0
  const lv = Number.isFinite(climbLevels) && climbLevels > 0 ? climbLevels : 0
  const walk = walkBudgetMs({ dist: d }) // the out leg; the return prices the same yard
  return 2 * walk + Math.round(lv * DEEP_CLIMB_MS_PER_LEVEL) + SHED_CHAIN_OVERHEAD_MS
}

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
  // junk first: a shed is priced, never guessed - the budget is config
  // (zero is impossible - the end bank always has one). (v0.601.0) the RATE
  // leaves the junk gate - the cold-flow shape is the seed's own read below
  // (a rate of zero is no longer 'no verdict', it is the cold books).
  if (!fin(pocketUnits) || !fin(remainingMs) ||
      remainingMs < 0 || !fin(budgetMs) || budgetMs <= 0) {
    return { go: false, why: 'unknown' }
  }
  // an active trip re-reads first - never double-booked, never extended
  if (fin(tripUntil) && tripUntil > now) {
    return { go: false, why: 'holding', remainingMs: tripUntil - now }
  }
  // (v0.601.0) THE COLD-START SEED - fleet 37180720652's face: CALM storm,
  // mined=858, pockets 715u across 14 holders - and banked=46 (bank flow
  // 0.0u/s, 17 of 19 bots never armed a pass, 492u rode the write-off). The
  // deadlock: the shed prices its need from the MEASURED bank flow, the
  // flowPriceClock reads rate null on a stood-still window (<2 samples or
  // delta<=0), and the old gate returned 'unknown' - a fleet that never
  // banked can never arm the trip that would teach the flow. The dusk arm
  // (the other opener) rides the night hold (the v0.140.1 doctrine stands),
  // so a slow day that crosses the light threshold near dusk never opens
  // the books at all. THE SEED: when the flow is cold AND the pocket is
  // heavy (SHED_SEED_MIN_UNITS - F4's own proven pass was 46u, this face's
  // write-offs rode 66-120u) AND the priced trip fits the run clock, ONE
  // trip arms on the geometry alone - the books open, the measured flow
  // takes over from the second bank on. Every other shape keeps its
  // legacy verdict byte for byte (junk unknown, holding holding, light
  // light, late late); the refractory in shedTripDue bounds the seed to
  // the family cadence; the night hold in the wiring gates the sky.
  const rateLive = fin(rate) && rate > 0
  if (!rateLive) {
    if (Math.floor(pocketUnits) < SHED_SEED_MIN_UNITS) {
      return { go: false, why: 'unknown' }
    }
    if (!fin(tripMs) || tripMs < 0 ||
        remainingMs < tripMs + SHED_SAFETY_MS + SHED_SLACK_MS) {
      return { go: false, why: 'late', remainingMs, needS: null }
    }
    return { go: true, why: 'seed', untilMs: now + tripMs + SHED_SAFETY_MS, needS: null, gapS: null }
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

// (v0.564.0) THE SHED GATE - the plan and the pricer join the trip-decision
// family (bankTripDue's shape, deposit.mjs). THE SEAM: the legacy trigger
// arms on cadence + loot floor + a FLAT 240s fence (BANK_TRIP_MIN_REMAINING_MS
// - the v0.176.0 worst-case arithmetic: trip cap 300s + the 90s return must
// fit), so a WHALE pocket whose end-need outruns the end-bank budget gets the
// same 1-2 checks a light pocket gets, and a yard-near bot's fitting trip is
// refused by a fence priced for the worst case - the crater's own shape
// (fleet 37134090209: F6's 277u whale rode a timeout strand while 12 chests
// sat 10-20 blocks away; the decode read 11.7%, the fourth collapse). THE
// WIRE: shedTripDue is the GAP-DRIVEN sibling - it arms ONLY when the
// pocket's projected end need outruns the budget (shedPlan's light gate,
// the <= law), the PRICED trip (shedTripMs: out+back walk, the climb, the
// chain) fits the run clock with the safety and slack margins, and the
// cadence refractory holds (BANK_TRIP_EVERY_MS parity - the v0.306.0 churn
// law: a doomed pocket retries on the same clock as any trip, the log
// cannot storm). The legacy gate keeps its byte for byte: healthy pockets
// (light) never shed, the flat fence stays the mining loop's first read;
// the shed's only wins are the widened LATE window (priced fit replaces the
// worst case) and the gap condition (only a stranded pocket pays it). The
// wiring feeds remainingMs as the time left BEFORE the endphase's
// pre-position window owns the goal (the fence's own contract) and reuses
// lastBankAt (the refusal branch advances it - one clock, both families).

/** The shed retry cadence (ms): parity with BANK_TRIP_EVERY_MS - the churn
 *  law (v0.306.0) is a family law; a shed refusal speaks on the same clock
 *  as a legacy refusal. */
export const SHED_RETRY_MS = 150000

/** (v0.601.0) The cold-start seed's pocket floor (bankable units): a cold
 *  flow (the books never opened) arms the trip only when the pocket's own
 *  mass prices it - below the floor the legacy 'unknown' stands (the end
 *  bank covers a light pocket honestly). The field read: F4's single pass
 *  banked 46u (the only spoken arm on fleet 37180720652), the write-offs
 *  rode 66-120u - 40 is the floor under the proven pass. */
export const SHED_SEED_MIN_UNITS = 40

/**
 * (v0.564.0) Should this bot START a shed bank trip now - the gap-driven
 * sibling of bankTripDue, pure. A shed is the END-BUDGET ESCAPE: the
 * pocket would strand at the deadline (need > budget), the priced trip
 * still fits, the refractory holds. The gates, each named:
 *   unknown/holding/light/late - shedPlan's own (the junk law, the active
 *     trip, the leanness law, the priced fit); a refusal rides its why.
 *   refractory - the cadence clock (msSinceBank < SHED_RETRY_MS): the
 *     same silencer the legacy refusal branch feeds (lastBankAt).
 *   due - the trip arms: tripMs/needS/gapS/untilMs ride the read (the
 *     wiring logs the gap it is curing).
 * @param {object} [p]
 * @param {number} [p.pocketUnits] the pocket's units (non-KEEP)
 * @param {number} [p.rate] the measured bank flow (u/s) - the wiring
 *        measures (the bank-flow row's own arithmetic)
 * @param {number} [p.dist] straight-line distance to the bank yard (blocks)
 * @param {number} [p.climbLevels] depth below the yard level (levels)
 * @param {number} [p.remainingMs] run clock left BEFORE the endphase's
 *        pre-position owns the goal
 * @param {number} [p.budgetMs] the end-bank budget (endBankBudgetMs's read)
 * @param {number} [p.now] the caller's clock
 * @param {number} [p.tripUntil] the active shed trip's end (0 when none)
 * @param {number} [p.msSinceBank] since the last bank attempt/refusal
 *        (the wiring's lastBankAt read - one clock, both families)
 * @param {number} [p.everyMs] the refractory (default SHED_RETRY_MS)
 * @returns {{due:boolean, why:string, tripMs?:number, needS?:number,
 *            gapS?:number, untilMs?:number}} never throws, never lies
 */
export function shedTripDue ({
  pocketUnits = NaN,
  rate = NaN,
  dist = 0,
  climbLevels = 0,
  remainingMs = NaN,
  budgetMs = NaN,
  now = Date.now(),
  tripUntil = 0,
  msSinceBank = 0,
  everyMs = SHED_RETRY_MS
} = {}) {
  const tripMs = shedTripMs({ dist, climbLevels })
  const plan = shedPlan({ pocketUnits, rate, tripMs, remainingMs, budgetMs, now, tripUntil })
  if (!plan.go) {
    return { due: false, why: plan.why, needS: plan.needS, gapS: plan.gapS, remainingMs: plan.remainingMs }
  }
  const every = Number.isFinite(everyMs) && everyMs > 0 ? everyMs : SHED_RETRY_MS
  const since = Number.isFinite(msSinceBank) && msSinceBank > 0 ? msSinceBank : 0
  if (since < every) {
    return { due: false, why: 'refractory', tripMs, needS: plan.needS, gapS: plan.gapS }
  }
  // (v0.601.0) the plan's own why rides the due path - the seed's due trip
  // labels itself 'seed' (the cause line's own branch reads it), the
  // measured face still reads 'shed' byte for byte (shedPlan's why there)
  return { due: true, why: plan.why, tripMs, needS: plan.needS, gapS: plan.gapS, untilMs: plan.untilMs }
}
