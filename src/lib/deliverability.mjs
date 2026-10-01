// ---------------------------------------------------------------------------
// (v0.385.0) THE DELIVERABILITY ARM - the bank-flow whale's priced lever.
//
// The whale, priced across two censuses: v0.382.0 read face 19 (36802577873)
// closing 19/19 ALIVE with a 495u pocket unbanked (both stranded holders
// zero-delivered, 'the walk never delivered', the observed 2.1u/s flow
// needing 234s PAST the deadline); v0.384.0 read the same face's four budget
// lines and made the deficit STRUCTURAL - the end-phase grants 300s (the
// v0.41.0 kill-margin clamp) against needs the flow prices at 2433-2789s:
// an 11% granted share. No final clock covers that gap by construction, so
// the only lever is EARLIER delivery: a mid-run trip fired while the clock
// can still pay for the walk.
//
// THE GATE'S TWO TERMS (both from the field, none invented):
// - 'clamp': the pocket's flow-priced need outruns the clock the end-phase
//   would grant if its chain began NOW (the caller prices that with the SAME
//   finalBankBudgetMs call the chain entry makes - the sibling law). These
//   units can never ride the final bank; a mid-run trip is the only delivery
//   lane they will ever get.
// - 'clock': the need outruns the run's remaining time - pocket/rate vs
//   time left, the 1100 fire's exact lever words. Waiting strands the pocket
//   by arithmetic, not by luck.
//
// THE SIBLING-SHAPE LAW: this gate only COMPARES - it never prices a rate.
// The need arrives from flowPriceClock (the same samples, the same tail-
// burst guard, the same margin the end-phase clock and the gap row read);
// a gate that conjured its own pace would diverge from the row that judges
// it (the v0.348.0 lesson's own shape). Junk-safe: an unpriced need refuses
// (the dead-flow law - no budget covers what no rate prices), and a limit
// that is unreadable or exhausted cannot fire its term (a zero granted
// clock means no chain may run, not that every pocket is overdue).
//
// The strict-inequality law: a need that EXACTLY fits the limit is covered
// (need > limit fires, need == limit does not) - the priced need already
// carries the v0.334.0 4s cushion, so the boundary is honest without a
// second margin stacked on it.
//
// Pure arithmetic over plain numbers so CI tests every branch without a
// server (the pocketline.mjs shape).
// ---------------------------------------------------------------------------

/**
 * The mid-run deliverability gate.
 * @param {object} [p]
 * @param {number|null} [p.needS] the flow-priced seconds the pocket needs (from flowPriceClock's needS - the sibling law; junk/<=0 refuses)
 * @param {number|null} [p.grantedS] the clock the end-phase would grant a chain begun now, in seconds (the caller prices it with finalBankBudgetMs; junk/<=0 disarms the clamp term)
 * @param {number|null} [p.timeLeftS] the run's remaining seconds (junk/<=0 disarms the clock term)
 * @returns {{go: boolean, term: 'clamp'|'clock'|null, limitS: number|null, needS: number|null}} go=true arms the mid-run bank trip; term names the field term that fired ('clamp' wins when both fire - the structural one); limitS echoes the fired limit for the cause line
 */
export function deliverableNow ({ needS = null, grantedS = null, timeLeftS = null } = {}) {
  const need = Number(needS)
  if (!Number.isFinite(need) || need <= 0) return { go: false, term: null, limitS: null, needS: Number.isFinite(need) ? need : null }
  const grant = Number(grantedS)
  const left = Number(timeLeftS)
  const clampDue = Number.isFinite(grant) && grant > 0 && need > grant
  const clockDue = Number.isFinite(left) && left > 0 && need > left
  if (clampDue) return { go: true, term: 'clamp', limitS: grant, needS: need }
  if (clockDue) return { go: true, term: 'clock', limitS: left, needS: need }
  return { go: false, term: null, limitS: null, needS: need }
}
