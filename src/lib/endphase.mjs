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

// ---------------------------------------------------------------------------
// HARD KILL (v0.26.0) - the run's last-resort exit guarantee.
//
// MEASURED (dispatch 35541442371, 600s on e8f0ce1): the fleet mined 1240
// blocks, hit its deadline, walked the whole end-phase chain - 17 'final
// climb' lines, 16 staggered delays - and then EVERY bot stalled inside the
// final smelt/bank visits at once: from 22:45:49 to the 23:11 cancel the log
// held NOTHING but the heartbeat worker's lines. The 6-slot path throttle
// kept circulating (stale +3 per 15s = new activations), yet no walk ever
// completed and no bot line ever printed: the runners never returned, FLEET
// RESULT never printed, the CI job burned 40 minutes and was cancelled
// BEFORE any artifact upload - the whole run's evidence lost.
//
// THE CURE is structural, not another walk fix: a wall-clock kill timer that
// fires at runSeconds + a margin wide enough for the legitimate end-phase
// (stagger cap 120s + climb 90s + bounded bank walks + smelt budget). Past
// that point the process owes the CI nothing but its partial evidence: print
// the kill line and exit, so the job ends and the fleet19.log artifact lands.
// unref'd: a healthy process that finishes early must not be held open.
/** Margin past the run deadline before the hard kill fires. */
export const HARD_KILL_MARGIN_MS = 420000

/**
 * Delay from process start until the hard kill fires. Pure, junk-tolerant:
 * junk runSeconds = 600 (the fleet default), junk/negative margin = the
 * default margin, 0 margin is honoured (kill exactly at the deadline).
 * @param {object} [p]
 * @param {number} [p.runSeconds] the fleet run length in seconds (default 600)
 * @param {number} [p.marginMs] extra wall clock for the end phase (default HARD_KILL_MARGIN_MS)
 * @returns {number} milliseconds from process start to the kill
 */
export function hardKillDelayMs ({ runSeconds = 600, marginMs = HARD_KILL_MARGIN_MS } = {}) {
  const s = Number.isFinite(runSeconds) && runSeconds > 0 ? runSeconds : 600
  const m = Number.isFinite(marginMs) && marginMs >= 0 ? marginMs : HARD_KILL_MARGIN_MS
  return s * 1000 + m
}
