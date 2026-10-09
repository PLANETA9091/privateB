// (v0.871.0) THE DOOMED-GOAL'S OWN CENSUS - the consult side's field read.
//
// The fleet runs TWO no-path ledgers off the same recordNoPath machinery
// (nopath.mjs) and only one of them was ever priced. The CHEST ledger
// (deposit.mjs's noPathLedger) prints its writes (the v0.866.0
// un-blinding's 'no-path ledger: chest at ...' line) and the v0.868.0
// ledgerbook prices its economy; the DOOMED-GOAL ledger (jobqueue.mjs's
// doomedGoals, the v0.72.0 consult) never prints a write - the v0.868.0
// book's own out-of-scope note ('doomed-goal = the jobqueue ledger's
// write never printed') - so the v0.70.0 law's TIMEOUT CLASS lives there
// UNMEASURED: a goto that dies with the pathfinder's calc timeout
// ('took to long') records the goal cell at NOPATH_TIMEOUT_TTL_MS = 45s
// (a clean 'No path' rides the 90s NOPATH_TTL_MS default; the machine
// goals' callerTtl rides 15s), and no fleet-filter byte ever named it.
//
// The pricing-before-wire law (the v0.473.0 rule, the v0.869.0
// exclude-candidate precedent) asks: does the 45s class need its own
// record byte? That question needs the ledger's FIELD FOOTPRINT first,
// and the ledger owns exactly ONE visible byte: the consult refusal the
// caller logs when a walk dies at the doomed-goal consult for zero cost
// (jobqueue.mjs's 'doomed goal (ledgered Ns ago at [x,y,z]) - LABEL
// refused' kernel, riding each caller's own tag/prefix). This census
// folds that kernel across ALL callers - the walk lanes the drop-walk
// lens's doomed cell never covered (the bank yard, the machine goals,
// every other gotoSafe caller).
//
// THE AGE SHADOW (the read the write byte would name): a refusal's age
// byte is the entry's ttl shadow. The machine 15s window cannot refuse
// beyond 15s - an age > 15s names an entry riding a LONG window (the
// 45s timeout class or the 90s default, the two indistinguishable at
// ages they share); an age > 45s PROVES the 90s class (a 45s entry dies
// by its own window - the proof the timeout class alone cannot buy).
// The shadow counts both bands; the write byte's own un-blinding (if
// this census prices the class material) would split them for real.
//
// THE REPEAT LAW: the doomed-goal ledger passes NO repeatTtl
// (jobqueue.mjs's recordDoomedGoal - the v0.863.0 half-life escalation
// is the CHEST ledger's own law), so a cell refusing twice means the
// FIRST entry expired and a fresh verdict recorded again - the repeat
// is the ledger's own re-record shape, never an escalation.
//
// THE APPROXIMATION (documented): the census reads the callers' logged
// refusals; the ledger's own doomedStats.refusals counter is the
// superset (a refusal whose caller never logged stays unseen - the log
// is the census's field, the counter never prints either). Mining-
// surface only: zero fleet wiring, zero new log lines (the v0.379.0
// precedent). Junk-safe end to end: a non-array reads the zero shape,
// non-string rows are skipped, the kernel matches mid-line (the caller
// prefix and the caller suffix - the drop-walk lens's ' (dy ...)'
// rider - both tolerated), the label reads non-greedy (the first
// ' refused' after the kernel ends it - no walk label contains the
// word), a botless line rides '?'.

/** The bot tag the fleet log rides (the houndcensus perBot idiom). */
const BOT_TAG_RE = /^(F\d+)\b/

/** The consult refusal's own kernel - the caller-agnostic byte every
 * doomed-goal refusal rides (jobqueue.mjs's refuse message, verbatim). */
export const DOOM_REFUSAL_RE = /doomed goal \(ledgered (\d+)s ago at \[(-?\d+),(-?\d+),(-?\d+)\]\) - (.+?) refused/

/** The machine window (CHEST_DOOM_TTL_MS, deposit.mjs) in seconds - the
 * ceiling the callerTtl class can refuse under. Beyond it rides the
 * long-window class. */
export const DOOM_MACHINE_TTL_S = 15

/** The timeout window (NOPATH_TIMEOUT_TTL_MS, nopath.mjs) in seconds -
 * beyond it the 90s default class is PROVEN (a 45s entry cannot refuse
 * past its own lifetime). */
export const DOOM_TIMEOUT_TTL_S = 45

const tripleOf = (xs) => xs.length === 0
  ? null
  : {
      min: Math.min(...xs),
      max: Math.max(...xs),
      avg: xs.reduce((a, b) => a + b, 0) / xs.length
    }

/**
 * The doomed-goal consult census: every logged refusal folded across
 * callers, with the age shadow (the long-window classes' only field
 * read) and the re-record repeat shape.
 * @param {string[]|string} [lines] the face log (array or raw blob)
 * @returns {{refusals: number, byBot: Object<string, number>,
 *   byLabel: Object<string, number>, ages: {min: number, max: number, avg: number}|null,
 *   shadow15: number, shadow45: number, cells: number, repeats: number}}
 */
export function doomGoalCensus (lines) {
  const rows = Array.isArray(lines)
    ? lines
    : (typeof lines === 'string' ? lines.split('\n') : [])
  const zero = {
    refusals: 0,
    byBot: {},
    byLabel: {},
    ages: null,
    shadow15: 0,
    shadow45: 0,
    cells: 0,
    repeats: 0
  }
  const ages = []
  const cellCounts = {}
  for (const l of rows) {
    if (typeof l !== 'string') continue
    const m = DOOM_REFUSAL_RE.exec(l)
    if (!m) continue
    const age = Number(m[1])
    const cell = `[${m[2]},${m[3]},${m[4]}]`
    const label = m[5]
    const botMatch = BOT_TAG_RE.exec(l)
    const bot = botMatch ? botMatch[1] : '?'
    zero.refusals++
    zero.byBot[bot] = (zero.byBot[bot] || 0) + 1
    zero.byLabel[label] = (zero.byLabel[label] || 0) + 1
    if (Number.isFinite(age)) {
      ages.push(age)
      // the age shadow: the machine 15s window ends at 15, the 45s
      // timeout window ends at 45 - beyond each, the longer class rides
      if (age > DOOM_MACHINE_TTL_S) zero.shadow15++
      if (age > DOOM_TIMEOUT_TTL_S) zero.shadow45++
    }
    cellCounts[cell] = (cellCounts[cell] || 0) + 1
  }
  if (zero.refusals === 0) return zero
  zero.ages = tripleOf(ages)
  zero.cells = Object.keys(cellCounts).length
  // the re-record shape: refusals beyond each cell's first - the ledger
  // has no escalation, a repeat names an expired verdict recorded anew
  zero.repeats = zero.refusals - zero.cells
  return zero
}

/**
 * The census's own row - one line, the fold's field read. The honest
 * null when nothing refused (a clean consult face prices nothing).
 * @param {object|null} [c] the doomGoalCensus fold
 * @returns {string|null} the row byte, or null
 */
export function doomGoalRow (c) {
  if (!c || typeof c !== 'object') return null
  if (!Number.isFinite(c.refusals) || c.refusals <= 0) return null
  const bots = Object.keys(c.byBot || {}).length
  const cells = Number.isFinite(c.cells) ? c.cells : 0
  const ages = c.ages && typeof c.ages === 'object' && Number.isFinite(c.ages.min)
    ? `ages ${c.ages.min}..${c.ages.max}s avg ${c.ages.avg.toFixed(1)}`
    : 'ages unparseable'
  const shadow15 = Number.isFinite(c.shadow15) ? c.shadow15 : 0
  const shadow45 = Number.isFinite(c.shadow45) ? c.shadow45 : 0
  const labels = Object.entries(c.byLabel || {})
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .map(([k, v]) => `${k} x${v}`)
    .join(', ')
  return `the doomed-goal consult: ${c.refusals} refusal(s) by ${bots} bot(s) on ${cells} cell(s) (${ages} - beyond the machine ${DOOM_MACHINE_TTL_S}s: ${shadow15}, beyond the ${DOOM_TIMEOUT_TTL_S}s window: ${shadow45}) - labels: ${labels || 'none'}`
}
