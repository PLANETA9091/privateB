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

/** (v0.44.0) Distance reference: a bot this far from the yard (or farther)
 * takes the FIRST slot; a bot standing at the yard takes the LAST one. The
 * fleet's dig band lands 10-70 blocks out, so 80 puts the whole observed
 * range on the early slots without collapsing them into one stampede. */
export const FINAL_BANK_REF_DIST = 80

/**
 * Delay before bot `index` may start its final bank. Pure, junk-tolerant
 * (negative/NaN/undefined index = 0, junk budgets = defaults), deterministic -
 * tests pin the slot math and the cap.
 *
 * (v0.44.0) DISTANCE-ORDERED SLOTS: when the caller knows the bot's distance
 * to the yard, the delay no longer follows the boot index (which has zero
 * correlation with distance). MEASURED (fleet 35591877408, v0.42.1): the
 * end-phase yard walks crawled - F6 timed out at 67000ms for 37 blocks, F19
 * at 56389ms, F11 at 66468ms, each followed by 'end-bank budget spent - yard
 * walk cancelled' - while the throttle held path=6a/12q: 17 walkers started
 * in boot order, so far walks (index 5-18 = 40-120s delays) activated into a
 * saturated queue AND a CPU-starved runner. The same fleet's QUIET mid-run
 * walks took 0-5s (F10 13b -> 0s, F11 54b -> 0s, F4 47b -> 5s). Ordering the
 * slots by distance - the FARTHEST bot first, near bots last - gives the
 * long walks the empty throttle (each finishes in tens of seconds instead of
 * crawling), and by the time the near bots' slots open their walks are 0-5s
 * jobs the 6 slots churn instantly. The total window and the cap are
 * UNCHANGED, so the hard-kill margin maths (stagger cap 120s + chain 150s <
 * 420s margin) stand untouched.
 *
 * @param {object} [p]
 * @param {number} [p.index] the bot's boot index (0-based) - legacy ordering without a distance
 * @param {number} [p.yardDist] straight-line distance to the yard, blocks (null/undefined/junk = legacy index ordering)
 * @param {number} [p.stepMs] slot width (default FINAL_BANK_STEP_MS)
 * @param {number} [p.capMs] delay ceiling (default FINAL_BANK_CAP_MS)
 * @param {number} [p.refDist] distance that takes the first slot (default FINAL_BANK_REF_DIST)
 * @returns {number} milliseconds to wait, 0 for the farthest bots
 */
export function finalBankDelayMs ({ index = 0, yardDist = null, stepMs = FINAL_BANK_STEP_MS, capMs = FINAL_BANK_CAP_MS, refDist = FINAL_BANK_REF_DIST } = {}) {
  const step = Number.isFinite(stepMs) && stepMs > 0 ? stepMs : FINAL_BANK_STEP_MS
  const cap = Number.isFinite(capMs) && capMs >= 0 ? capMs : FINAL_BANK_CAP_MS
  // legacy path: no usable distance -> the boot-index spread (pre-v0.44.0 behavior)
  const d = Number.isFinite(yardDist) && yardDist >= 0 ? yardDist : null
  if (d == null) {
    const i = Number.isFinite(index) && index > 0 ? Math.floor(index) : 0
    return Math.min(i * step, cap)
  }
  const ref = Number.isFinite(refDist) && refDist > 0 ? refDist : FINAL_BANK_REF_DIST
  // slot 0 for a bot at >= refDist, the last slot for a bot at the yard;
  // linear in between - two bots at the same distance may share a slot (a
  // 2-3 bot cohort beats the 17-walker herd either way)
  const slots = Math.floor(cap / step)
  const frac = Math.min(d / ref, 1)
  const slot = Math.round((1 - frac) * slots)
  return Math.min(slot * step, cap)
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

// ---------------------------------------------------------------------------
// END-BANK BUDGET (v0.27.0) - the chain inside the margin gets its own clock.
//
// MEASURED (dispatch 35544781892, 600s on 504f744, the first run the hard kill
// SAVED): after 16/17 final climbs failed ('stalled'/'timeout'), every bot
// entered smeltThenBank and the log went heartbeat-only for the whole 420s
// margin - mined frozen at 1258, path=6a/6q circulating, stale +3-5/15s, ZERO
// 'final bank' lines. The chain is combinatorial (see deposit.mjs v0.27.0
// note: 8-chest hops x walk retries x the yard walk x 2 deposit passes) and
// every step was individually budgeted while the CHAIN was not - so the run
// never reached printFinalReport and the evidence stayed partial (no
// fleet-report.json, no worldmap save).
//
// THE CURE: the final bank chain gets a wall-clock budget (default 168s).
// Budget sizing: stagger cap 120s runs BEFORE the chain, so the worst chain
// end is deadline + 120s + 168s = 288s < the 420s hard-kill margin - the
// process now finishes NATURALLY (full report) with the kill as a pure
// safety net, and each bot's doomed walks give up with a named reason
// instead of churning the path queue.
//
// (v0.334.0) 150s -> 168s: the ten-legged face (36660134341, the v0.331.0
// tree) priced the end bank at 6.4u/s (the flow row - 3x the 2.2u/s datum)
// and the gap row spoke its first leg: '164s needed, 150s budgeted - 14s
// short' with a 1044u pocket stranded unbanked. The chains now ALMOST fit
// the clock - the budget was sized when the flow was 2.2u/s and the pocket
// need was unmeasurable; at 6.4u/s the same 150s no longer covers the
// measured 164s need. 168s = the need + a 4s margin, still 132s under the
// cap (280s) and 132s under the kill margin's worst-chain arithmetic.
//
// (v0.339.0) 168s -> 248s: the third face (36679076372, the v0.337.0 tree)
// priced the clock again: '244s needed, 168s budgeted - 76s short at 4.7u/s'
// with a 1137u pocket stranded - the flow varies run to run (6.4, then the
// storm's 0.0, now 4.7u/s) and the need rode the pocket (1137u) against the
// flow. The same move as v0.334.0 at the new datum: 248s = the need + a 4s
// margin; the worst chain end is deadline + 120s + 248s = 368s < the 420s
// kill margin (52s of headroom left). The budget prices the HEALTHY-flow
// case only - the storm case (face 36669231548: flow 0.0u/s, an unbounded
// need) is the storm front's business (v0.337.0's abandonment), not the
// clock's: no static budget covers a dead flow.
/** Default wall-clock budget for one bot's whole final bank chain. */
export const END_BANK_BUDGET_MS = 248000

/** (v0.34.0) Ceiling for the distance-scaled final bank budget: a far bot may
 * use up to 280s of chain - the runtime margin clamp (RUN_KILL_AT based) keeps
 * the 420s hard-kill margin intact regardless. */
export const END_BANK_BUDGET_CAP_MS = 280000

/** (v0.296.0) THE FINAL CLIMB PATIENCE - the bounded wait a final climb spends
 * on a LIVE water rescue before attempting. MEASURED (face 36499444700, the
 * combined v0.295.0 tree's first field flight): 8 final climbs failed
 * ('rescue owns the bot' x2, 'low-o2' x1, 'stalled' x3, 'timeout' x2) and the
 * 8 'still underground' verdicts ate the end-phase pockets - banked=805 was
 * the FIRST delivery since the deep era began, ~1672u still rode the pockets
 * at t-0. The wet band (the water table y=60-62 under the y=76 yard) owns the
 * shaft columns the final climb must pass, and a rescue held at climb start
 * makes the attempt a BURN (the climb's owner gate refuses at entry, the
 * ownership class never retries). The wet machinery's own window measured
 * ~25s (the drowning-rescue passes), so 30s waits it out with a settle
 * margin; a rescue that outlives the wait is a stuck sentry - the attempt
 * proceeds and the owner gate rules (the caller's own retry bound stops it,
 * the waitForWaterRescueClear contract). */
export const FINAL_CLIMB_RESCUE_WAIT_MS = 30000

/**
 * Parse the FLEET_END_BUDGET_MS env value. Pure, junk-tolerant: unset, empty,
 * junk, zero or negative -> the default budget (an env of 0 reads as 'unset':
 * the deposit chain treats finite <= 0 as 'already spent', which would
 * silently kill every final bank if honoured).
 * @param {object} [p]
 * @param {string|number} [p.env] raw env value (default: unset -> default budget)
 * @param {number} [p.def] default budget ms (default END_BANK_BUDGET_MS)
 * @returns {number} budget in ms (finite, > 0)
 */
export function endBankBudgetMs ({ env = undefined, def = END_BANK_BUDGET_MS } = {}) {
  const d = Number.isFinite(def) && def > 0 ? def : END_BANK_BUDGET_MS
  if (env === undefined || env === null || env === '') return d
  const n = Number(env)
  return Number.isFinite(n) && n > 0 ? n : d
}

// ---------------------------------------------------------------------------
// PRE-POSITION (v0.36.0) - the walk home starts BEFORE the deadline.
//
// MEASURED (dispatches 35560497949 + 35562867668, 600s): bots dig 100-300
// blocks out; at t-0 the dist-scaled final bank budget (v0.34.0) still burned
// 13-14x 'final bank: 0 (budget exhausted)' per run, because the chain must
// first WALK the whole way back (2*dist*500ms is the measured detour rule)
// out of a budget that also has to pay climb + smelt + the chest hops. The
// walk back is not an end-phase cost at all - it is mining time spent going
// the wrong way. The v0.35.0 tunnel budget un-stuck the work loop, so the
// loop can afford one more gate: inside the last window the bot STOPS
// DIGGING and walks TOWARD the yard on mining time. The end-phase then
// starts near the yard - a short walk the existing budget covers - and a
// successful early bank leaves the pockets empty, so the final bankable
// check skips the chain entirely.
/** The walk home starts this long before the deadline. */
export const PRE_POSITION_WINDOW_MS = 90000

/** Bots nearer than this already find chests in range (findChest scans 64 blocks). */
export const PRE_POSITION_MIN_DIST = 48

/**
 * (v0.304.0) A bot this many levels BELOW the yard is deep: the climb out
 * alone costs ~50s at the measured 4.2s/level (the v0.294.0 climb pricing),
 * more than half the legacy window - the straight-line dist says "near the
 * yard" while the climb says "far".
 */
export const PRE_POSITION_UNDERGROUND_DY = 12

/**
 * (v0.304.0) The deep bot's window: the 150s handoff boundary the cadence
 * refusal already reads (NEEDS_BANKING_MIN_REMAINING_MS) - below it the
 * cadence trip refuses and the end-phase owns the deadline banking, so the
 * deep bot's climb home starts exactly where the ownership handoff happens.
 *
 * (v0.307.0) The boundary is the deep window's FLOOR now: the flat 150s fit
 * the dy~25 shafts, but the deeper bottoms price past it - the window grows
 * with the honest climb (see DEEP_CLIMB_MS_PER_LEVEL / DEEP_WINDOW_MARGIN).
 */
export const PRE_POSITION_UNDERGROUND_WINDOW_MS = 150000

/**
 * (v0.307.0) The measured climb price per level - the v0.294.0 datum (46s /
 * 11 levels, rounded) that deposit.mjs's BANK_CLIMB_PER_LEVEL_MS rides too.
 * The two pins must move together: one measurement, two consumers (the bank
 * trip's budget and the deep pre-position's window).
 */
export const DEEP_CLIMB_MS_PER_LEVEL = 4200

/**
 * (v0.307.0) The deep window's vertical multiplier. Face 36539598929 (the
 * v0.305.0 field): 8 deep pre-position firings - 4 delivered (+799) and 4x
 * 'budget exhausted'; the exhausted pockets (F16 207u, F19 171u, F7 239u,
 * F10 133u = 750u) rode the write-off row (7 holders/1273u). The anatomy:
 * the honest vertical alone prices dy*4.2s (dy 29 = 122s), and the wet
 * bands' rescue windows (rescues=79 that face, ~25s each), the yard walk
 * and the deposit passes all ride ON TOP of the climb - the flat 150s
 * could not carry the deep bottoms. Doubling the vertical absorbs the
 * wet machinery + the walk + the deposit (dy 29 -> 243.6s, ~30s spare over
 * the ~212s honest cost).
 */
export const DEEP_WINDOW_MARGIN = 2

/**
 * (v0.307.0) The deep window's ceiling - the junk-dy guard. Honest shafts
 * read dy 12-35 (the field read 27-29, the deepest freeze y=29.2); a
 * corrupted 100-level read would otherwise open the gate for the whole
 * run (100*8400 = 840s). dy 36+ clamps here; a caller's undergroundWindowMs
 * override wider than the cap is honoured (the cap guards the price, not
 * the caller's intent).
 */
export const DEEP_WINDOW_MAX_MS = 300000

/**
 * Should this bot stop digging and walk home now? True when the run is
 * inside the pre-position window AND the bot is far enough from the yard
 * for the walk to matter. Pure, junk-tolerant: junk/negative remaining =
 * false (a bot must never abandon mining on garbage), junk dist = 0 ->
 * false (a near bot has nothing to pre-position for).
 *
 * (v0.304.0) THE DEEP LANE: a bot yardDy+ levels below the yard is deep -
 * the climb IS the far walk (the v0.294.0 law: the dy prices the honest
 * climb), so the deep bot auto-qualifies the distance and gets the wider
 * underground window (F6's t-48s climb out read 'failed - stopped
 * (traversed 3)' and 236u rode the deadline; the same climb from t-150s
 * fits). Junk/negative yardDy reads 0 -> the legacy shallow shape byte for
 * byte; the night hold above the call stays the owner in the dark.
 *
 * (v0.307.0) THE DY-PRICED DEEP WINDOW: the deep window is no longer flat -
 * it is max(150s, dy * 4.2s * 2) capped at 300s. The flat 150s fit dy~25
 * but the deeper bottoms exhausted (4 of 8 deep firings 'budget exhausted',
 * 750u rode the write-off); the priced window opens the deep climb early
 * enough for the climb + the wet bands + the walk + the deposit to fit
 * before the deadline. The dy<=17 shafts keep the flat boundary byte for
 * byte (the priced shape sits under 150s there); the deep read still never
 * narrows the legacy shallow lane.
 * @param {object} [p]
 * @param {number} [p.remainingMs] ms left before the deadline
 * @param {number} [p.yardDist] straight-line distance to the yard, blocks
 * @param {number} [p.yardDy] vertical separation below the yard, levels (default 0 - the legacy shallow shape)
 * @param {number} [p.windowMs] window width (default PRE_POSITION_WINDOW_MS)
 * @param {number} [p.minDistBlocks] minimum distance worth walking (default PRE_POSITION_MIN_DIST)
 * @param {number} [p.undergroundWindowMs] deep-lane window width (default PRE_POSITION_UNDERGROUND_WINDOW_MS)
 * @returns {boolean}
 */
export function prePositionDue ({ remainingMs = Infinity, yardDist = 0, yardDy = 0, windowMs = PRE_POSITION_WINDOW_MS, minDistBlocks = PRE_POSITION_MIN_DIST, undergroundWindowMs = PRE_POSITION_UNDERGROUND_WINDOW_MS } = {}) {
  if (!Number.isFinite(remainingMs) || remainingMs <= 0) return false
  const d = Number.isFinite(yardDist) && yardDist > 0 ? yardDist : 0
  const m = Number.isFinite(minDistBlocks) && minDistBlocks >= 0 ? minDistBlocks : PRE_POSITION_MIN_DIST
  // (v0.304.0) the deep read: junk/negative dy = 0 -> shallow, the legacy
  // shape untouched; a junk window override falls back to the default.
  const dy = Number.isFinite(yardDy) && yardDy > 0 ? yardDy : 0
  const deep = dy >= PRE_POSITION_UNDERGROUND_DY
  const w = Number.isFinite(windowMs) && windowMs > 0 ? windowMs : PRE_POSITION_WINDOW_MS
  const uw = Number.isFinite(undergroundWindowMs) && undergroundWindowMs > 0 ? undergroundWindowMs : PRE_POSITION_UNDERGROUND_WINDOW_MS
  // (v0.307.0) THE DY-PRICED DEEP WINDOW: the flat 150s boundary is the
  // floor - the window grows with the honest climb (dy * 4.2s, the v0.294.0
  // measurement) doubled for the wet bands + the walk + the deposit, capped
  // against a corrupted dy read. The dy<=17 shafts read exactly the flat
  // boundary (12*8400=100.8s, 17*8400=142.8s both sit under it); a caller
  // override wider than the cap survives (the cap guards the price, not the
  // intent); the deep read never narrows anything.
  const uwEff = Math.min(
    Math.max(uw, Math.round(dy * DEEP_CLIMB_MS_PER_LEVEL * DEEP_WINDOW_MARGIN)),
    Math.max(uw, DEEP_WINDOW_MAX_MS)
  )
  if (remainingMs > (deep ? uwEff : w)) return false
  // the deep bot auto-qualifies the distance: the climb IS the far walk
  return deep ? true : d >= m
}

// ---------------------------------------------------------------------------
// (v0.41.0) END-PHASE MARGIN SCHEDULING - the chain is priced BEFORE the climb.
//
// MEASURED (fleet 35580596054, v0.40.0, 600s, the first NORMAL END): banked=0,
// 14/14 fallback whys 'budget exhausted'. F1's chain is the anatomy:
//   stagger 0s -> the final climb STALLED ~85s (bare-hand ceiling digs, the
//   v0.39.0 patient window never fit the off-ground 5x dig penalty) -> the
//   chain budget then priced whatever margin was left -> the PRE-DEPOSIT
//   burned ~195s on doomed wilderness-chest hops -> 'none (budget exhausted)'
//   at deadline+281s. The margin was not walk-starved, it was
//   SCHEDULING-starved: the climb spent the margin before the chain was
//   priced, and the chain then burned what was left underground.
//
// THE CURE (pure half - the fleet half lives in fleet19's end phase): price
// the chain budget from the margin AT END-PHASE ENTRY (before the stagger and
// the climb spend any of it), and give the climb only what the chain does not
// need: climbSlice = entryMargin - chainBudget. A climb that cannot afford its
// minimum slice is SKIPPED - an underground bot's chain is worthless (the yard
// filter + walk refusals name it in seconds) and a surface bot needs no climb.
// The wall clock is still king: the caller re-clamps the chain budget into the
// margin that is actually left after the stagger + climb, so the hard-kill
// margin can never be outrun - by construction, same as v0.34.0.
/** Below this the climb cannot usefully start - the chain keeps the slice instead. */
export const CLIMB_MIN_SLICE_MS = 15000

/**
 * The final climb's own wall price - the v0.604.0 per-level law reaches the
 * final bank. MEASURED (fleet 37228589272, the v0.636.0 face, the crumb
 * borrow's first field flight): 'climb skipped' fell 10 -> 0 and the crater
 * read 42.7% (was 20.7%) - the v0.635.0 borrow landed - but the surviving
 * failure class moved INSIDE the funded slice: F8 'final climb: the yard
 * stands 21 levels up over 20b lateral' then 'failed - timeout (fenced at
 * 34s - the chain keeps its reserve)'. The borrow funds the FLAT min (15s)
 * while the yard's wall has a measured price - the v0.294.0 bank law's own
 * 4.2s/level (DEEP_CLIMB_MS_PER_LEVEL), the same number the v0.604.0
 * quarry-ascent law already prices (max(floor, dy * 4200)). A 21-level yard
 * cannot land in 34s by arithmetic. Pure, junk-safe: a junk/negative/zero dy
 * reads NO need (null - the caller keeps the legacy min laws); the min stays
 * the floor (a shallow wall never prices below the slice the schedule
 * already guarantees).
 *
 * (v0.641.0) THE DEEP-WINDOW MARGIN - the price carries the variance the
 * deep window already prices. MEASURED (fleet 37233218979, the v0.640.0
 * face, banked=0 - the first zero-delivery face of the era, the yard 22
 * levels up over 2-7b lateral, every delivery leg severed by the vertical
 * doom): the need lines FIRED (4 need-priced climbs: 84-160s funded) and
 * the fences became the wall - F17 'need 160s (38 levels)' then 'timeout
 * (fenced at 160s)' with the staircase LIVE at the cut (dug=39+, the diag
 * lines riding) - 4.2s/level priced the doom column at ZERO variance while
 * the wet bands, the dig-heavy stone and the gravity settles ate the
 * difference. The deep window (v0.307.0) already owns this law: 'the window
 * grows with the honest climb (dy * 4.2s) doubled for the wet bands + the
 * walk', capped by DEEP_WINDOW_MAX_MS. The same margin reaches the final
 * climb: need = min(DEEP_WINDOW_MAX_MS, max(min, dy * 4200 * 2)). The
 * asymmetry is doctrine-clean: the MID-RUN ascent keeps its x1 (the v0.604.0
 * refusal is honest - the trip spends real mining clock, a doom trip is the
 * v0.181.0 class), the FINAL climb borrows from the worthless-underground-
 * chain reserve (the v0.50.0 doctrine) - its only cost is the fence, and a
 * fence that cuts a live staircase at the central price is the v0.640.0
 * face's own refutation.
 * @param {object} [p]
 * @param {number} [p.dy] levels from the bot's feet up to the yard's level (yardY - botY)
 * @returns {number|null} the climb's need in ms (>= CLIMB_MIN_SLICE_MS), or null when the wall is unreadable
 */
export function finalClimbNeedMs ({ dy = null } = {}) {
  if (!Number.isFinite(dy) || dy <= 0) return null
  const priced = Math.round(dy) * DEEP_CLIMB_MS_PER_LEVEL * DEEP_WINDOW_MARGIN
  return Math.min(DEEP_WINDOW_MAX_MS, Math.max(CLIMB_MIN_SLICE_MS, priced))
}

/**
 * Split the end-phase entry margin between the chain (reserved) and the climb
 * (what remains). Pure, junk-tolerant: junk/negative margins collapse to 0, a
 * junk chain budget reads as 0 (the climb gets everything - the caller's own
 * re-clamp still protects the wall clock).
 * @param {object} [p]
 * @param {number} [p.entryMarginMs] wall clock left before the safety line, measured at end-phase entry
 * @param {number} [p.chainBudgetMs] the chain's reserved budget (finalBankBudgetMs at entry)
 * @param {number} [p.staggerDelayMs] the stagger sleep the caller runs BETWEEN entry and the climb
 *   (default 0). (v0.49.0) FLEET 35605960761 F4: the slice ignored this window -
 *   entry margin 381s, chain 150s, slice 231s, stagger +72s - the climb's wall
 *   clock overlapped the chain's reserve by exactly the stagger, and after the
 *   (escalated) climb overran, the re-clamp handed the chain ~19s: every hop
 *   'budget exhausted (walk floor)', banked=0 with the bot 17 blocks from the
 *   yard, pockets full. The slice now prices the stagger FIRST.
 * @param {number} [p.minClimbSliceMs] below this the climb is skipped (default CLIMB_MIN_SLICE_MS)
 * @param {number|null} [p.climbNeedMs] (v0.638.0) the climb's OWN price - the yard's wall
 *   priced by finalClimbNeedMs (dy * 4200, the v0.294.0 measurement), passed
 *   only when the vertical doom stands. The borrow funds the NEED, not the
 *   flat min: raw >= need -> the legacy byte; room >= need -> slice = need
 *   (the borrow tops up to the wall's price); room < need but >= min -> the
 *   best shot (slice = room - the doctrine already owns the trade: the
 *   underground chain bought ZERO every face, a funded attempt is the only
 *   road to banked>0). Junk/absent need reads as the min - the v0.635.0 laws
 *   byte for byte.
 * @returns {{climbSliceMs: number, climbSkipped: boolean, climbBorrowedMs: number}}
 */
export function finalBankSchedule ({ entryMarginMs = 0, chainBudgetMs = 0, staggerDelayMs = 0, minClimbSliceMs = CLIMB_MIN_SLICE_MS, climbNeedMs = null } = {}) {
  const m = Number.isFinite(entryMarginMs) && entryMarginMs > 0 ? entryMarginMs : 0
  const c = Number.isFinite(chainBudgetMs) && chainBudgetMs > 0 ? chainBudgetMs : 0
  const s = Number.isFinite(staggerDelayMs) && staggerDelayMs > 0 ? staggerDelayMs : 0
  const min = Number.isFinite(minClimbSliceMs) && minClimbSliceMs >= 0 ? minClimbSliceMs : CLIMB_MIN_SLICE_MS
  // (v0.635.0) THE CRUMB BORROW - the climb's minimum slice is funded from the
  // chain reserve when the margin's crumbs starve it. MEASURED (fleet
  // 37222310370, the v0.632.0 face, the 'banked crater decode: 20.7%' verdict):
  // ALL FIVE zero-banks rode ONE class - the flow-price clamp handed the CHAIN
  // 161-300s (F2/F15/F18 300s, F7 161s), the stagger ate 40-88s, and the
  // legacy subtraction (m - s - c) handed the final climb 0-1s: 'climb skipped
  // (slice 0s/1s < min 15s)' x5, then the chains burned their full reserve on
  // walk-to-chest timeouts from shaft mouths (d=6-23, walk 15s x2 per chest,
  // raw hop stalls) and read banked=0 anyway - 300s of chain bought ZERO
  // banked for every underground bot. The v0.50.0 doctrine already names the
  // truth ('an underground bot's chain is worthless'); the arithmetic now
  // respects it: when the crumbs (raw = m - s - c) fall below the min slice
  // but real wall clock exists beyond the stagger (room = m - s >= min), the
  // climb's min slice BORROWS from the chain reserve - slice = min, borrow =
  // slice - raw. The caller's own finalBudget re-clamp
  // (min(chainBudgetMs, wall clock left)) owns the wall truth, so the borrow
  // cannot resurrect the v0.49.0 overrun class: the chain simply starts with
  // the wall clock the climb actually left - and a funded climb is the ONLY
  // step that turns the doomed underground walks into flat yard walks.
  // Legacy faces stay byte-identical: raw >= min (the crumbs already fund the
  // climb) returns raw with borrow 0; the room itself below the min (or the
  // stagger overdrawing the margin) keeps the legacy skip - no room, no
  // borrow, the thin-margin law stands.
  // (v0.638.0) THE NEED, not the min: when the caller prices the wall
  // (climbNeedMs, the v0.604.0 per-level law's own shape), the borrow funds
  // the NEED. The v0.636.0 face (fleet 37228589272) moved the failure class
  // INSIDE the funded slice: F8's 21-level yard, fenced at 34s, read timeout
  // by arithmetic - min != need. The need floors at the min (a shallow wall
  // never prices below the guaranteed slice); a junk/absent need reads as the
  // min (the v0.635.0 laws byte for byte). The best-shot branch (room < need
  // but >= min) funds the whole room - the underground chain bought ZERO
  // every face, the funded attempt is the only road to banked>0, and the
  // caller's finalBudget re-clamp still owns the wall truth (the v0.49.0
  // overrun class cannot return through either borrow).
  const need = Number.isFinite(climbNeedMs) && climbNeedMs > 0 ? Math.max(min, Math.round(climbNeedMs)) : min
  const room = Math.max(0, m - s)
  const raw = Math.max(0, room - c)
  if (raw >= need) return { climbSliceMs: raw, climbSkipped: false, climbBorrowedMs: 0 }
  if (room >= need) return { climbSliceMs: need, climbSkipped: false, climbBorrowedMs: need - raw }
  if (need > min && room >= min) return { climbSliceMs: room, climbSkipped: false, climbBorrowedMs: room - raw }
  return { climbSliceMs: raw, climbSkipped: true, climbBorrowedMs: 0 }
}

// ---------------------------------------------------------------------------
// (v0.50.0) THE FINAL-CLIMB RETRY - a failed climb hands the slice BACK to
// the climb, not to a doomed underground chain.
//
// MEASURED (fleet 35630279913, v0.49.0, the first HARD KILL since the v0.40.x
// hang class): 13 bots' final climbs failed 'stalled' FAST (36-100s, the
// failLimit, not the fence), every bot still at its shaft bottom - and the
// chain then burned its whole 150s reserve on pre-deposit walks to chests 27
// blocks AWAY AT THE YARD SURFACE: raw walks stalled into stone, pathfinder
// walks cannot route out of a 1x1 shaft, 120s of silence per bot, the smelt
// gate read 0 remaining ('end-bank budget spent - smelt skipped'), the final
// deposit refused on the walk floor, banked=0 - and the process ground past
// deadline+420s into the hard kill. An underground bot's chain is worthless
// (the v0.41.0 note said it; the code kept feeding it). The escalation ladder
// (climbEntry) exists for exactly this wall: attempt 2 inherits 2x budgets
// and a ROTATED bearing.
/** Below this a retry attempt cannot usefully start. */
export const CLIMB_RETRY_MIN_SLICE_MS = 20000

/**
 * After a failed final climb: retry inside the slice, or give up honestly?
 * Pure, junk-safe. Retries on 'stalled' and 'timeout' (the escalated attempt
 * rotates the bearing and multiplies the budgets - the measured cure for a
 * proven wall); never on 'exhausted' (the ledger cooldown would refuse the
 * retry instantly) or 'stopped' (no wall clock left). The retry's fence is
 * the slice the failed attempt left: total climb time can never exceed the
 * slice, so the chain's reserve survives both attempts by construction.
 * @param {object} [p]
 * @param {number} [p.attempts] climb attempts already made (0-based count before this decision)
 * @param {string} [p.reason] the failed attempt's reason ('stalled'|'timeout'|...)
 * @param {number} [p.sliceLeftMs] wall clock left of the climb slice (junk -> 0)
 * @param {number} [p.maxAttempts] hard cap (default 2)
 * @param {number} [p.minRetrySliceMs] below this the retry cannot start (default CLIMB_RETRY_MIN_SLICE_MS)
 * @returns {{retry: boolean, maxMs: number, why: string}}
 */
export function climbRetryPlan ({ attempts = 0, reason = '', sliceLeftMs = 0, maxAttempts = 2, minRetrySliceMs = CLIMB_RETRY_MIN_SLICE_MS } = {}) {
  const done = Number.isFinite(attempts) && attempts > 0 ? Math.floor(attempts) : 0
  const max = Number.isFinite(maxAttempts) && maxAttempts > 0 ? Math.floor(maxAttempts) : 2
  if (done >= max) return { retry: false, maxMs: 0, why: `attempt cap (${done} made)` }
  const left = Number.isFinite(sliceLeftMs) && sliceLeftMs > 0 ? sliceLeftMs : 0
  if (left < (Number.isFinite(minRetrySliceMs) && minRetrySliceMs > 0 ? minRetrySliceMs : CLIMB_RETRY_MIN_SLICE_MS)) {
    return { retry: false, maxMs: 0, why: `slice left ${Math.round(left / 1000)}s < min ${Math.round(CLIMB_RETRY_MIN_SLICE_MS / 1000)}s` }
  }
  const r = String(reason || '')
  if (/exhausted/i.test(r)) return { retry: false, maxMs: 0, why: 'ledger exhausted - a retry would refuse instantly' }
  if (/stopped/i.test(r)) return { retry: false, maxMs: 0, why: 'no wall clock left (shouldStop)' }
  if (/stalled|timeout/i.test(r)) return { retry: true, maxMs: left, why: `escalated retry after ${r}` }
  return { retry: false, maxMs: 0, why: `no retry for '${r || 'unknown'}'` }
}

/**
 * (v0.154.0) THE BANK CLIMB RETRY - the mid-run bank trip's climb decision,
 * the sibling of climbRetryPlan (the final bank's, v0.50.0).
 *
 * MEASURED (run108 + run84a fleet logs, and the run85 autopsy the 23:54 lane
 * ranked front (a)): the mid-run bank trip's ensureSurface is SINGLE-SHOT -
 * 'climb out (bank): failed - stalled' x16 + 'timeout' x7 across the two
 * local logs, F3's 3-of-4 bank trips dead at the climb in run85 (~20x
 * fleet-wide). Every dead trip left the pockets riding to the next cadence
 * window (or the deadline): the deposit chain never ran. The escalation
 * ladder is the built-in cure - a failed call records stage+1 on the bot
 * (climbLedgerUpdate), so the NEXT climbOut inherits 2x budgets and a
 * ROTATED bearing (the same mechanism the final bank's retry has used
 * since v0.50.0). 'rescue owns the bot' and 'low-o2' must NEVER retry (a
 * live lane owns the bot; the air owns the wet escape) - climbRetryPlan
 * already refuses both; 'exhausted' refuses too (the ledger cooldown).
 *
 * The fence is the TRIP's remaining chain clock, not the deadline: the
 * caller passes chainLeftMs (the bank trip's budget minus everything spent
 * so far); the failed attempt's own spend comes off first, and the retry
 * cannot start below climbRetryPlan's floor (20s). The returned maxMs is
 * pre-fenced by the historical PILLAR_MAX_MS (90s) so the harness can pass
 * it straight to climbOut. No chain clock (junk/0) = the single-shot legacy
 * stays byte-identical ('trip' and 'pre-position' keep their shape).
 *
 * Pure, junk-safe. @param {object} [p]
 * @param {number} [p.chainLeftMs] the trip chain's remaining wall clock (junk/0 -> single-shot legacy)
 * @param {number} [p.spentMs] wall clock the failed attempt 1 already burned
 * @param {string} [p.reason] attempt 1's failure reason ('stalled'|'timeout'|...)
 * @param {number} [p.attempts] climb attempts already made (default 1 - the failed trip climb)
 * @param {number} [p.pillarMaxMs] the climb's historical fence (default 90000 = PILLAR_MAX_MS)
 * @param {number} [p.minRetrySliceMs] below this the retry cannot start (default CLIMB_RETRY_MIN_SLICE_MS)
 * @returns {{retry: boolean, maxMs: number, why: string}}
 */
export function bankClimbRetry ({ chainLeftMs = 0, spentMs = 0, reason = '', attempts = 1, pillarMaxMs = 90000, minRetrySliceMs = CLIMB_RETRY_MIN_SLICE_MS } = {}) {
  const left = Number.isFinite(chainLeftMs) && chainLeftMs > 0 ? chainLeftMs : 0
  if (left <= 0) return { retry: false, maxMs: 0, why: 'no chain clock (the single-shot legacy stays)' }
  const spent = Number.isFinite(spentMs) && spentMs > 0 ? spentMs : 0
  const sliceLeft = Math.max(0, left - spent)
  const plan = climbRetryPlan({ attempts, reason, sliceLeftMs: sliceLeft, minRetrySliceMs })
  if (!plan.retry) return { retry: false, maxMs: 0, why: plan.why }
  const cap = Number.isFinite(pillarMaxMs) && pillarMaxMs > 0 ? pillarMaxMs : 90000
  const maxMs = Math.min(cap, plan.maxMs)
  return { retry: true, maxMs, why: `${plan.why}, fenced to ${Math.round(maxMs / 1000)}s of the ${Math.round(sliceLeft / 1000)}s the chain has left` }
}

// ---------------------------------------------------------------------------
// (v0.316.0) THE SHAFT-BOTTOM DOOM LATCH - the doomed final-bank chain stops
// paying retries it has already priced. MEASURED (fleet 36592026195, the
// four-instrument face, mined 2713 @ 4.52 b/s the richest dig ever):
// banked=83 - and the anatomy is ONE class: every bot's final bank read 0,
// 17 verdicts rode 'still underground after 1-2 climb attempts - the chain
// from the shaft bottom is doomed walks', and F9 alone printed the SAME
// verdict SEVEN times (log lines 1766->2514) - each reconnect re-entry
// re-slept the stagger, re-spent two fenced climbOut calls on the same
// shaft bottom, and re-earned the identical zero. The verdict text itself
// prices the chain ('doomed walks', the v0.27.0 doctrine); the retry loop
// was the only part still paying for it. THE CURE: count each bot's failed
// final-bank climb cycles (the 'still underground' verdict site -
// climbAttempts > 0 by construction, so a respawned-at-yard bot can never
// feed the latch); from the third entry the chain is refused at the door -
// no stagger sleep, no climb spend, no path churn - the verdict names the
// latch and the clock goes back to the dig (the pockets ride the deadline
// either way; the difference is the ten doomed climb calls an F9-class bot
// stops paying).
export const FINAL_BANK_DOOM_LATCH_CYCLES = 2

// (v0.351.0) THE ONE-SHOT RE-ARM - face 36710193486 (the ninth, calm) priced
// the latch's own tail: F16 latched at 2 failed climb cycles and its chain
// was refused for the REST of the run ('final bank: 0 (dooms-latched ...)'
// five verdicts deep) while the pocket grew unbanked - the doom evidence was
// never re-tested. The latch now carries ONE re-arm: the first latched
// verdict opens this cooldown; once it is paid, the door opens for exactly
// one more cycle. A still-doomed bottom re-latches terminally (the re-arm is
// spent either way - the v0.316.0 storm's ten doomed climb calls stay
// impossible: one extra cycle, never a second). A proven climb un-dooms the
// bottom entirely (the wiring resets the count on cr.ok - the evidence was
// refuted, the latch rides fresh).
export const FINAL_BANK_DOOM_REARM_MS = 120000

/**
 * The shaft-bottom doom latch (pure, junk-safe).
 * @param {object} [p]
 * @param {number} [p.failedCycles] failed final-bank climb cycles recorded for this bot (junk/negative -> never latches, the body-guard law)
 * @param {number} [p.latchCycles] the refusal threshold (default FINAL_BANK_DOOM_LATCH_CYCLES = 2)
 * @param {boolean} [p.rearmed] the one-shot re-arm already rode for this bot (no second re-arm, ever)
 * @param {number} [p.latchAt] the epoch ms of the latch's first verdict (0/undefined/junk -> the cooldown never opened, no re-arm)
 * @param {number} [p.now] the current epoch ms (junk -> no re-arm, the terminal latch stands)
 * @param {number} [p.rearmMs] the re-arm cooldown (default FINAL_BANK_DOOM_REARM_MS; junk/<=0 -> no re-arm)
 * @returns {{latched: boolean, failed: number, rearmGranted: boolean}}
 */
export function finalBankDoomLatch (opts = {}) {
  // (the Number(null) lesson, eighth strike) the BODY guard, not a
  // destructuring default: junk never latches - missing evidence is not a doom.
  const { failedCycles = 0, latchCycles = FINAL_BANK_DOOM_LATCH_CYCLES, rearmed = false, latchAt = 0, now = 0, rearmMs = FINAL_BANK_DOOM_REARM_MS } = opts || {}
  const n = Number(failedCycles)
  if (!Number.isFinite(n) || n < 0) return { latched: false, failed: 0, rearmGranted: false }
  const c = Number.isFinite(latchCycles) && latchCycles > 0 ? Math.floor(latchCycles) : FINAL_BANK_DOOM_LATCH_CYCLES
  const latchedBase = n >= c
  // (v0.351.0) THE ONE-SHOT RE-ARM: latched && not yet spent && the cooldown
  // is verifiably paid (a positive latch timestamp, a finite now, a positive
  // rearm window). Junk in any clock keeps the terminal latch - missing
  // evidence is not a re-arm, the same body-guard law that owns the count.
  let rearmGranted = false
  if (latchedBase && !rearmed) {
    const t0 = Number(latchAt)
    const t = Number(now)
    const ms = Number(rearmMs)
    if (Number.isFinite(t0) && t0 > 0 && Number.isFinite(t) && Number.isFinite(ms) && ms > 0 && t >= t0 + ms) rearmGranted = true
  }
  return { latched: latchedBase && !rearmGranted, failed: n, rearmGranted }
}

// ---------------------------------------------------------------------------
// (v0.345.0) THE FLOW-PRICED CLOCK - the static end-bank budget priced the
// HEALTHY flow it was measured on, and the field convicted the static: face
// 36697238002 (the sixth face) read flow 2.6u/s against the static 248s and
// the gap row named the shortage exactly ('370s needed, 248s budgeted - 122s
// short at 2.6u/s'). The flow variance IS the front (4.7 / 0.7 / 0.0 / 2.6
// across faces 3-6 - the zero-bank theory died on face 6: banked 1796 ON a
// storm), so the clock now reads the LIVE bank flow at the chain's entry and
// extends the floor to the flow-implied need. The v0.334.0 law rides: need +
// a 4s margin. The dead-flow case stays the storm front's business, not the
// clock's (a 0.0u/s flow prices an unbounded need - no static budget covers
// it, the endphase v0.34.0 note's own law). The kill-margin law is NOT
// re-implemented here: the floor only feeds finalBankBudgetMs, whose
// min(want, margin) construction the v0.41.0 note already owns ('the margin
// cannot be outrun, same construction as v0.34.0') - the extension can move
// the clock, never the kill.
//
// Sibling-shape law: the rate is the SAME arithmetic as bankBudgetGapRow's
// (same sample filter, same unrounded rate, the same ceil on the need - the
// row that prices the shortage and the clock that pays it must never
// disagree).
//
// (v0.348.0) THE BURST-PRICED CLOCK - the eighth face (36706516734) convicted
// the window rate itself: the fleet's banked counter stood at 0 for the whole
// mining phase, then rode a deposit wave 0 -> 1214u across t-119s -> t-0
// (928u of it inside the LAST 26s). At the chain's entry the 20-sample window
// therefore read ~4.0u/s - the WAVE's pace, not the chains' crawl - and every
// bot's pocket priced 'covered' (a 105u pocket at 4u/s is 31s), so the
// extension never fired (0 'flow-priced' lines) and the chains then crawled
// at the report-time 1.9u/s: '447s needed, 248s budgeted - 199s short'. The
// row and the clock never saw the same truth - the sibling-shape law's own
// field violation. THE CURE: the tail-burst guard. A terminal tail that owns
// > FLOW_BURST_DELTA_SHARE of the window's delta while spanning <=
// FLOW_BURST_SPAN_SHARE of the window's time is NOT a rate (a 26s wave is not
// a 300s pace); the clock prices the need on the EX-BURST remainder's rate
// (the head span - the closest honest proxy for the chain's crawl), and a
// dead remainder keeps the static floor (the dead-flow law: no budget covers
// a dead flow). The guard shares the gap row's sample filter byte for byte
// (v0.345.0 claimed 'same sample filter' but never actually filtered - the
// filter debt is paid here too). A smooth window prices exactly as v0.345.0
// (the passthrough law); a mid-window burst is NOT this guard's business (the
// tail is where the entry-time wave lives by construction - the chains' own
// deposits land in the window's tail).
/** The v0.334.0 margin: the priced need always carries a 4s cushion. */
export const FLOW_PRICE_MARGIN_S = 4
/** The tail must own MORE than this share of the window's delta to be a burst. */
export const FLOW_BURST_DELTA_SHARE = 0.6
/** ...while spanning AT MOST this share of the window's time (inclusive). */
export const FLOW_BURST_SPAN_SHARE = 0.4

/**
 * Price the end-bank floor from the LIVE bank flow (pure, junk-safe).
 * @param {object} [p]
 * @param {Array<{t: number, banked: number}>} [p.samples] the fleet's bank-flow samples (t in seconds; junk/short -> the static clock)
 * @param {number|null} [p.pocketUnits] the pocket this chain must carry (junk/<=0 -> the static clock)
 * @param {number} [p.baseMs] the static floor to extend (default END_BANK_BUDGET_MS; junk/<=0 -> END_BANK_BUDGET_MS)
 * @returns {{floorMs: number, rate: number|null, needS: number|null, extended: boolean, burst: {spanS: number, delta: number, share: number, rate: number}|null}} extended=false reads the static clock (the leanness law: a covered pocket speaks nothing); burst names the tripped tail guard (null = a smooth window)
 */
export function flowPriceClock ({ samples = [], pocketUnits = null, baseMs = END_BANK_BUDGET_MS } = {}) {
  const base = (Number.isFinite(baseMs) && baseMs > 0) ? baseMs : END_BANK_BUDGET_MS
  const pocket = Number(pocketUnits)
  if (!Number.isFinite(pocket) || Math.floor(pocket) <= 0) return { floorMs: base, rate: null, needS: null, extended: false, burst: null }
  if (!Array.isArray(samples) || samples.length < 2) return { floorMs: base, rate: null, needS: null, extended: false, burst: null }
  // the gap row's own filter, byte for byte (the sibling law): junk dropped,
  // a non-monotone t cannot make a window, the counters floor to integers
  const good = []
  for (const s of (Array.isArray(samples) ? samples : [])) {
    const t = s?.t
    const b = s?.banked
    if (!Number.isFinite(t) || t < 0 || !Number.isFinite(b) || b < 0) continue
    if (good.length > 0 && t <= good[good.length - 1].t) continue // a non-monotone t cannot make a window
    good.push({ t: Math.floor(t), b: Math.floor(b) })
  }
  if (good.length < 2) return { floorMs: base, rate: null, needS: null, extended: false, burst: null }
  const span = good[good.length - 1].t - good[0].t
  if (!(span > 0)) return { floorMs: base, rate: null, needS: null, extended: false, burst: null }
  const delta = good[good.length - 1].b - good[0].b
  const rate = delta / span
  // a stood-still or negative flow is the storm front's business - the clock
  // keeps the static floor (no budget covers a dead flow)
  if (!(rate > 0)) return { floorMs: base, rate: null, needS: null, extended: false, burst: null }
  // (v0.348.0) THE TAIL-BURST WALK: accumulate trailing segments from the end
  // and stop at the SMALLEST tail that trips the guard (a wave is a wave, the
  // first tail that owns it is the honest one). No trip -> the v0.345.0 path.
  let tailSpan = 0
  let tailDelta = 0
  let burst = null
  for (let i = good.length - 1; i > 0; i--) {
    tailSpan += good[i].t - good[i - 1].t
    tailDelta += good[i].b - good[i - 1].b
    if (tailDelta > FLOW_BURST_DELTA_SHARE * delta && tailSpan <= FLOW_BURST_SPAN_SHARE * span) {
      const headSpan = span - tailSpan
      const headDelta = delta - tailDelta
      burst = { spanS: tailSpan, delta: tailDelta, share: tailDelta / delta }
      if (headSpan > 0 && headDelta > 0) burst.rate = headDelta / headSpan
      break
    }
  }
  if (burst) {
    // the dead remainder: the window's whole story is the wave - the head has
    // no honest rate, so no budget covers the need (the dead-flow law)
    if (burst.rate == null) return { floorMs: base, rate: null, needS: null, extended: false, burst }
    const needS = Math.ceil(Math.floor(pocket) / burst.rate) + FLOW_PRICE_MARGIN_S
    const needMs = needS * 1000
    if (!(needMs > base)) return { floorMs: base, rate: burst.rate, needS, extended: false, burst }
    return { floorMs: needMs, rate: burst.rate, needS, extended: true, burst }
  }
  const needS = Math.ceil(Math.floor(pocket) / rate) + FLOW_PRICE_MARGIN_S
  const needMs = needS * 1000
  if (!(needMs > base)) return { floorMs: base, rate, needS, extended: false, burst: null }
  return { floorMs: needMs, rate, needS, extended: true, burst: null }
}
