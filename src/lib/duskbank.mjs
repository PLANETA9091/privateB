/**
 * duskbank.mjs - (v0.226.0) THE DUSK-BANK PLAN - the night-hold delivery
 * gap's pricing, pure. The v0.200.0 pattern: the plan lands first, fully
 * unit-tested, and the wiring rides the next lane.
 *
 * MEASURED (the night-hold delivery gap, 2 field samples):
 *   run33 (36257829576, the v0.219.0 debut): 6 deferred final banks - the
 *     pockets rode out the night, banked read 617 against an 898 mined.
 *   run67 (36266420267, the v0.222.0 debut): 16 of 18 final banks deferred
 *     night (tod=12438..12575) - pocket 2111u/253s rode the dark alive,
 *     banked=615 against mined=2591 (conversion 105.7% but the delivery
 *     number its shadow). The deferrals land AT the dusk threshold: the
 *     bots reach the final-bank scan after the hold already owns the sky.
 *
 * THE LAW THIS MODULE OBEYS: the v0.140.1 night hold is a SURVIVAL lane
 * (0 losses riding out the dark) and stays UNTOUCHABLE - this plan never
 * un-defers a deferred bank, never sends a bot toward night, never gates
 * the hold. What it owns is the BEFORE-DUSK stance: a bot carrying a heavy
 * pocket while the daylight budget still covers a bounded bank trip
 * (measured by the wiring, plus a safety margin) should spend its next
 * voluntary goal on that trip - a delivery, not a rescue. A trip the
 * budget cannot cover reads 'no-time' (the honest refusal: the hold owns
 * the outcome, exactly as today). The wiring decides WHETHER to spend the
 * goal (it re-reads this plan each pass, the churn-wiring shape); this
 * module decides WHEN the trip fits, purely.
 *
 * THE CLOCK: vanilla tod ticks (0 = 06:00, 12000 = 18:00 sunset, the
 * measured hold threshold ~12400, 24000 = the next 06:00). One tick is
 * 50ms. The trip budget is an INPUT (the wiring measures the walk; the
 * plan never guesses an unmeasured trip - junk tripMs reads no-time).
 */

/** The vanilla tick in ms - the tod-to-clock conversion. */
export const TICK_MS = 50

/** The pricing window opens at 17:00 (tod 10800): 1600 ticks of usable
 *  daylight = 80s of trip budget at the window's open. Earlier than this
 *  the regular bank cadence owns the goal (the plan never preempts it). */
export const DUSK_BANK_START_TICKS = 10800

/** The hold's threshold (tod 12400): the measured deferral face (run67
 *  deferred at 12438..12575, all >= this line). At/after it the v0.140.1
 *  hold owns everything - the plan reads 'night' and never competes. */
export const DUSK_BANK_NIGHT_TICKS = 12400

/** The heavy-pocket floor (units): below it a dusk trip spends more time
 *  walking than the payload is worth - the pocket rides the night the way
 *  the hold already runs it. The measured deferred pockets carried 2111u. */
export const DUSK_BANK_MIN_UNITS = 256

/** The return margin (ms): the trip's priced end must land this far
 *  before the hold's threshold - the math never parks a bot AT the sky
 *  line, the walk's own variance eats the margin, not the daylight. */
export const DUSK_BANK_SAFETY_MS = 15000

const fin = v => Number.isFinite(v)

/**
 * (v0.226.0) THE DUSK-BANK PLAN - does a bounded bank trip fit before
 * the night hold owns the sky, pure. The gates, each named:
 *   unknown     junk inputs (non-finite tod/pocket, tod outside the
 *               vanilla 0..23999 domain) - never guess on junk
 *   holding     a dusk trip is ALREADY priced (tripUntil > now) - the
 *               plan re-reads it with the remaining time, never
 *               double-books or extends (the trip's own clock owns the
 *               exit; the wiring's carry-clock, the churn shape)
 *   no-pocket   the pocket reads below DUSK_BANK_MIN_UNITS - the trip
 *               costs more than the payload; the night ride is cheaper
 *   night       tod at/after DUSK_BANK_NIGHT_TICKS - the v0.140.1 hold
 *               owns the sky, the plan never competes with survival
 *   daylight    tod before DUSK_BANK_START_TICKS - the regular bank
 *               cadence owns the bright hours, no preemption
 *   no-time     inside the window but the measured trip plus the safety
 *               margin overruns the daylight budget (or the trip is
 *               unmeasured junk) - the honest refusal, the hold owns it
 *   go          the trip fits: priced until now + tripMs + safety,
 *               always SAFETY_MS clear of the threshold
 *
 * @param {object} [p]
 * @param {number} [p.tod] the vanilla time-of-day ticks (0..23999)
 * @param {number} [p.pocketUnits] the bot's pocket size in units
 * @param {number} [p.bankTripMs] the WIRING-MEASURED bank trip duration
 *        (ms) - undefined/junk reads no-time inside the window (an
 *        unmeasured trip is never priced)
 * @param {number} [p.now] the caller's clock
 * @param {number} [p.tripUntil] the active dusk trip's end (0/undefined
 *        when none - the wiring owns the field)
 * @returns {{go:boolean, why:string, untilMs?:number, remainingMs?:number}}
 *            a refusal reads { go:false, why }, a trip reads
 *            { go:true, why:'dusk', untilMs, remainingMs }
 */
export function duskBankPlan ({
  tod = NaN,
  pocketUnits = NaN,
  bankTripMs = NaN,
  now = Date.now(),
  tripUntil = 0
} = {}) {
  // junk first: the vanilla tod domain is 0..23999 (24000 wraps to the
  // next morning's 0) - anything outside reads unknown, never guessed
  if (!fin(tod) || tod < 0 || tod >= 24000 || !fin(pocketUnits)) {
    return { go: false, why: 'unknown' }
  }
  // an active trip re-reads first - never double-booked, never extended
  if (fin(tripUntil) && tripUntil > now) {
    return { go: false, why: 'holding', remainingMs: tripUntil - now }
  }
  if (pocketUnits < DUSK_BANK_MIN_UNITS) return { go: false, why: 'no-pocket' }
  // the hold's sky: at/after the threshold the survival lane owns it all
  if (tod >= DUSK_BANK_NIGHT_TICKS) return { go: false, why: 'night' }
  // the bright hours: the regular cadence owns them, no preemption
  if (tod < DUSK_BANK_START_TICKS) return { go: false, why: 'daylight' }
  // the dusk window: the daylight budget decides, inclusive at the safe
  // edge (trip + safety == remaining still lands the bot SAFETY clear)
  const remainingMs = (DUSK_BANK_NIGHT_TICKS - tod) * TICK_MS
  if (!fin(bankTripMs) || bankTripMs < 0) return { go: false, why: 'no-time', remainingMs }
  if (bankTripMs + DUSK_BANK_SAFETY_MS > remainingMs) {
    return { go: false, why: 'no-time', remainingMs }
  }
  return {
    go: true,
    why: 'dusk',
    untilMs: now + bankTripMs + DUSK_BANK_SAFETY_MS,
    remainingMs
  }
}
