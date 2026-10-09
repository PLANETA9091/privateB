// (v0.873.0) THE WALK FLOOR'S OWN FIELD READ - the preflight's own book.
//
// The v0.871.0 walk floor preflight (deposit.mjs's walkFloorPreflight, the
// v0.872.0 re-stamp) prices every chest visit's walk BEFORE the visit rides:
// the same ruler (chestWalkBudgetMs at the live distance), the same floor
// (effectiveWalkBudget against the chain's remaining clock), the same grace
// peek (yardGraceGate with the chain holder's one-shot state). A refusal is
// named at the scan's own level, riding the 'chest skip' filter-key family,
// and the loop BREAKS - the scan is nearest-first and the ruler is
// monotonic in d, so a chest the clock cannot fund dooms every farther one
// (the v0.45.0 far-chest skip's own break law). The affordable path prints
// NOTHING (the legacy visit runs byte for byte) - the refusal line is the
// gate's ONLY visible byte, and this book folds it.
//
// THE THREE REFUSAL CLASSES = the grace gate's own refusal table
// (yardGraceGate's why bytes, the only tails a refusal can carry):
//   grace-rode  - 'the grace already rode (one-shot per chain)': the chain
//                 spent its one-shot earlier and the clock cannot fund the
//                 floor alone - the REPEATED-WALK class (the chain came
//                 back and the floor got poorer).
//   envelope    - 'd=N beyond the grace envelope (N) - the doom guard
//                 stands': the distance is beyond the grace's far envelope
//                 - the class the grace never funds at any clock.
//   grace-cap   - 'd=N prices Ns beyond the grace cap (Ns) - the doom
//                 guard stands': the far walk priced by its own ruler
//                 lands beyond the grace cap - the MIDDLE class (a fatter
//                 cap or an earlier pass would fund it).
//
// THE DEFICIT READ (the crater's own price): each refusal names the price
// and the clock left - price minus clock is how much the chain was SHORT
// by, the walk-budget front's field read (face 138's budget-floor book
// named the front; this book prices its size every face).
//
// THE BREAK-LAW HONESTY: one refusal = one chain's chest scan ended at the
// gate. A bot can refuse twice in a face legally (the chain ends, the
// bank fallback or the next window starts a fresh chain) - the count is
// chain-scans broken, never unique chains claimed.
//
// THE APPROXIMATION (documented): the census reads the logged refusals;
// the affordable rides are invisible by design (the pass prints no line -
// the v0.871.0 honest-silence precedent), so the book prices the refusal
// side only. The gate's own counters never print either. Mining-surface
// only: zero fleet wiring, zero new log lines. Junk-safe end to end: a
// non-array reads the zero shape, non-string rows are skipped, the kernel
// matches mid-line (any caller prefix tolerated), the body is END-ANCHORED
// (the grace why carries its own parentheses - 'beyond the grace cap (58s)'
// - so the body reads to the line's final close, never the first), a
// botless line rides '?'.

/** The bot tag the fleet log rides (the doomledger perBot idiom). */
const BOT_TAG_RE = /^(F\d+)\b/

/** The preflight refusal's own kernel - the deposit.mjs scan-level line,
 * verbatim template: 'chest skip (walk floor preflight: <why>)'. The body
 * is end-anchored: the grace why nests its own parentheses, so the
 * non-greedy body must run to the line's FINAL close, not the first. */
export const WALK_FLOOR_REFUSAL_RE = /chest skip \(walk floor preflight: d=(\d+) prices (\d+)s beyond the (\d+)s left - (.*?)\)\s*$/

const tripleOf = (xs) => xs.length === 0
  ? null
  : {
      min: Math.min(...xs),
      max: Math.max(...xs),
      avg: xs.reduce((a, b) => a + b, 0) / xs.length
    }

/**
 * The walk floor preflight census: every logged scan-level refusal folded
 * across bots, with the grace gate's own class table and the deficit
 * (price - clock) read.
 * @param {string[]|string} [lines] the face log (array or raw blob)
 * @returns {{refusals: number, classes: {envelope: number, graceCap: number,
 *   graceRode: number, unparsed: number}, byBot: Object<string, number>,
 *   dists: {min: number, max: number, avg: number}|null,
 *   prices: {min: number, max: number, avg: number}|null,
 *   clocks: {min: number, max: number, avg: number}|null,
 *   deficits: {min: number, max: number, avg: number}|null}}
 */
export function walkFloorCensus (lines) {
  const rows = Array.isArray(lines)
    ? lines
    : (typeof lines === 'string' ? lines.split('\n') : [])
  const zero = {
    refusals: 0,
    classes: { envelope: 0, graceCap: 0, graceRode: 0, unparsed: 0 },
    byBot: {},
    dists: null,
    prices: null,
    clocks: null,
    deficits: null
  }
  const dists = []
  const prices = []
  const clocks = []
  const deficits = []
  for (const l of rows) {
    if (typeof l !== 'string') continue
    const m = WALK_FLOOR_REFUSAL_RE.exec(l)
    if (!m) continue
    const d = Number(m[1])
    const pricedS = Number(m[2])
    const clockS = Number(m[3])
    const tail = m[4]
    zero.refusals++
    if (/the grace already rode/.test(tail)) zero.classes.graceRode++
    else if (/beyond the grace envelope/.test(tail)) zero.classes.envelope++
    else if (/beyond the grace cap/.test(tail)) zero.classes.graceCap++
    else zero.classes.unparsed++
    const botMatch = BOT_TAG_RE.exec(l)
    const bot = botMatch ? botMatch[1] : '?'
    zero.byBot[bot] = (zero.byBot[bot] || 0) + 1
    if (Number.isFinite(d)) dists.push(d)
    if (Number.isFinite(pricedS)) prices.push(pricedS)
    if (Number.isFinite(clockS)) clocks.push(clockS)
    if (Number.isFinite(pricedS) && Number.isFinite(clockS)) deficits.push(pricedS - clockS)
  }
  if (zero.refusals === 0) return zero
  zero.dists = tripleOf(dists)
  zero.prices = tripleOf(prices)
  zero.clocks = tripleOf(clocks)
  zero.deficits = tripleOf(deficits)
  return zero
}

/**
 * The census's own row - one line, the fold's field read. The honest
 * null when nothing refused (a clean face prices nothing - the gate
 * passed every chest to the legacy visit).
 * @param {object|null} [c] the walkFloorCensus fold
 * @returns {string|null} the row byte, or null
 */
export function walkFloorRow (c) {
  if (!c || typeof c !== 'object') return null
  if (!Number.isFinite(c.refusals) || c.refusals <= 0) return null
  const bots = Object.keys(c.byBot || {}).length
  const k = c.classes || {}
  const classes = `envelope ${Number.isFinite(k.envelope) ? k.envelope : 0} / grace-cap ${Number.isFinite(k.graceCap) ? k.graceCap : 0} / grace-rode ${Number.isFinite(k.graceRode) ? k.graceRode : 0}${k.unparsed > 0 ? ` / UNPARSED ${k.unparsed}` : ''}`
  const span = (t, unit) => t && typeof t === 'object' && Number.isFinite(t.min)
    ? `${t.min}..${t.max}${unit} avg ${t.avg.toFixed(1)}${unit}`
    : 'unparseable'
  const deficits = c.deficits && typeof c.deficits === 'object' && Number.isFinite(c.deficits.min)
    ? `deficit ${c.deficits.min}..${c.deficits.max}s avg ${c.deficits.avg.toFixed(1)}s - the crater's own price`
    : 'deficit unparseable'
  return `the walk floor's own preflight: ${c.refusals} refusal(s) by ${bots} bot(s) (${classes}) - d ${span(c.dists, '')}, priced ${span(c.prices, 's')} vs clock ${span(c.clocks, 's')} left - ${deficits} - the break law: every farther chest paid zero bytes`
}
