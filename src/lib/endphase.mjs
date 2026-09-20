// End-of-run phase maths (v0.21.1) - the FINAL-BANK STAGGER.
//
// Measured background (fleet #131, 600s dispatch on f4f7181): the moment the
// deadline hit, all 19 bots exited their work loops and entered climbOut +
// the yard walk in the same second - 14x 'final bank: 0 (chest unreachable
// ...)' at t-0. Two compounding effects: the path throttle saturated
// ('path=6a/10q' - every walk budget burned in the queue, 100-150s waits at
// ~10-15s per walk) and 19 bots converged on one yard's chests at once.
// Spreading the final-bank starts by bot index gives each climb + walk a
// quieter throttle and yard; the run just ends a little later (bounded by
// the cap), the reporter keeps printing through the whole phase.
//
// Pure maths - fleet19 calls this with the bot's index and sleeps the
// returned delay before its final bank.

/** Slot width: one bot every 8s = the boot JOIN_SPREAD cadence mirrored at the end. */
export const FINAL_BANK_STEP_MS = 8000

/** Ceiling: bots past slot 15 share the 120s mark - a 4-bot herd beats a 19-bot stampede. */
export const FINAL_BANK_CAP_MS = 120000

/**
 * Delay before bot `index` may start its final bank. Pure, junk-tolerant
 * (negative/NaN/undefined index = 0, junk budgets = defaults), deterministic -
 * tests pin the slot math and the cap.
 *
 * @param {object} [p]
 * @param {number} [p.index] the bot's boot index (0-based)
 * @param {number} [p.stepMs] slot width (default FINAL_BANK_STEP_MS)
 * @param {number} [p.capMs] delay ceiling (default FINAL_BANK_CAP_MS)
 * @returns {number} milliseconds to wait, 0 for index 0
 */
export function finalBankDelayMs ({ index = 0, stepMs = FINAL_BANK_STEP_MS, capMs = FINAL_BANK_CAP_MS } = {}) {
  const i = Number.isFinite(index) && index > 0 ? Math.floor(index) : 0
  const step = Number.isFinite(stepMs) && stepMs > 0 ? stepMs : FINAL_BANK_STEP_MS
  const cap = Number.isFinite(capMs) && capMs >= 0 ? capMs : FINAL_BANK_CAP_MS
  return Math.min(i * step, cap)
}
