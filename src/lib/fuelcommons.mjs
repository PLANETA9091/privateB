// (v0.595.0) THE FUEL COMMONS ASK LENS - the commons' source strand's own
// instrument. The face's first read (fleet 37173632953, the v0.592.0 tree)
// rode THREE fleet verdicts naming the same front ('smelt fuel commons
// grain: asked 5, delivered 0, dry 5', 'fuel tithe inflow: attempted 2,
// delivered 0, dry 2', 'smelt no-fuel pantry') - and nobody's row read the
// ask's OWN lifecycle: how the fuel-commons asks died. The emitter is
// src/lib/fuelbank.mjs's resupply walk. Its outcome lines speak the ask's
// face: the gate's two refusals (the strict geometry doom 'the walk ladder
// cannot climb' and the climb-fund's clock 'the ladder may route it but the
// slice cannot fund the climb'), the chest answering empty ('chest holds no
// fuel'), the ask's own budget dying ('budget spent (t/w units)'), the
// delivery ('took N units (...) from a yard chest'), the no-chest in range,
// the anti-churn defer, the open failures, the walk failure after the nudge.
// The walk mechanics (path nudges, re-segments, the anchor read) are the
// walk's own family - NOT outcomes, this lens never claims them.
// THE FIELD READ this run: 37 outcomes across 15 bots (gate 4, dry 13,
// took 0, budget 16, walk-failed 3, open-failed 1) - the ask never ate.
// ONE PARSER PER EMITTER (the v0.409.0 law): one parser, the family's
// shapes as branches (the v0.590.0 parseVerticalAscent precedent).
// Pure functions only (the deep-strand law): this file never sees a bot.

const OPEN_TAG = '^(F\\d+) (?:\\[[A-Za-z0-9]+\\] )?fuel commons: '

// the outcome shapes, in family order (the emitter's own walk order:
// the gate first, then the chest read, then the walk, then the budget)
const SHAPES = [
  {
    // the chest-at refusal: form A (the strict doom) and form B (the
    // climb-fund's clock) share the head 'chest at [x,y,z] the yard stands
    // L levels up over Bb lateral' and split on the tail
    re: new RegExp(OPEN_TAG + 'chest at \\[(-?\\d+),(-?\\d+),(-?\\d+)\\] the yard stands (\\d+) levels up over (\\d+)b lateral - (the walk ladder cannot climb|the ladder may route it but the slice cannot fund the climb \\(the walk asks (\\d+)s, the slice holds (\\d+)s\\))(?:,| -) the ask rides \\(the tithe owns the deep resupply\\)$'),
    build: (m) => ({
      bot: m[1],
      kind: 'gate',
      cell: { x: Number(m[2]), y: Number(m[3]), z: Number(m[4]) },
      levels: Number(m[5]),
      lateral: Number(m[6]),
      gate: m[7] === 'the walk ladder cannot climb' ? 'doom' : 'clock',
      walkS: m[8] != null ? Number(m[8]) : null,
      sliceS: m[9] != null ? Number(m[9]) : null,
    }),
  },
  { re: new RegExp(OPEN_TAG + 'chest holds no fuel$'), build: (m) => ({ bot: m[1], kind: 'dry' }) },
  {
    re: new RegExp(OPEN_TAG + 'took (\\d+) units \\(([^)]*)\\) from a yard chest$'),
    build: (m) => ({ bot: m[1], kind: 'took', units: Number(m[2]), what: m[3] }),
  },
  {
    re: new RegExp(OPEN_TAG + 'budget spent \\((\\d+)\\/(\\d+) units\\)$'),
    build: (m) => ({ bot: m[1], kind: 'budget', taken: Number(m[2]), want: Number(m[3]) }),
  },
  { re: new RegExp(OPEN_TAG + 'no yard chest in range$'), build: (m) => ({ bot: m[1], kind: 'nochest' }) },
  {
    re: new RegExp(OPEN_TAG + 'the ask defers \\(this stance came up dry (\\d+)s ago - (.+)\\)$'),
    build: (m) => ({ bot: m[1], kind: 'defer', ageS: Number(m[2]) }),
  },
  {
    // the open failure: the bare form and the cover-dig form share the kind
    re: new RegExp(OPEN_TAG + 'open failed (?:after the cover dig )?\\((.+)\\)$'),
    build: (m) => ({ bot: m[1], kind: 'openfail', message: m[2] }),
  },
  {
    re: new RegExp(OPEN_TAG + 'chest walk failed after the nudge \\((.+)\\)$'),
    build: (m) => ({ bot: m[1], kind: 'walkfail', message: m[2] }),
  },
]

// the honest sweep: a line shaped like an outcome that failed the grammar
// rides unparsed (torn ages, cells and units stay visible). The walk
// mechanics and the anchor reads are NOT outcome-shaped - they never trip.
const OUTCOME_TORN_RE = /fuel commons: (chest at \[|chest holds no fuel|took |budget spent \(|no yard chest in range|the ask defers \(|open failed|chest walk failed after the nudge \()/

/**
 * Parse one fuel-commons ask outcome line.
 * @param {string} line the log line (the outer bot name is the truth; the lib's own [bot] tag is optional)
 * @returns {object|null} the outcome record, null on any non-member line
 */
export function parseFuelCommonsAsk (line) {
  if (typeof line !== 'string') return null
  for (const s of SHAPES) {
    const m = line.match(s.re)
    if (m) return s.build(m)
  }
  return null
}

/**
 * Tally the ask's outcomes over the log's lines: the kind split, the bots
 * that spoke, the gate's level ladder, the delivery's units, the budget's
 * taken/want, and the torn members. Junk lines and the walk mechanics stay
 * out (the walk's own family is not this lens's face).
 * @param {string[]} lines
 * @returns {{n: number, byKind: {gate: number, dry: number, took: number, budget: number, nochest: number, defer: number, openfail: number, walkfail: number}, bots: number, levels: {n: number, sum: number, max: number}, tookUnits: number, budgetTaken: number, budgetWant: number, unparsed: number}}
 */
export function fuelCommonsCensus (lines) {
  const c = {
    n: 0,
    byKind: { gate: 0, dry: 0, took: 0, budget: 0, nochest: 0, defer: 0, openfail: 0, walkfail: 0 },
    bots: 0,
    levels: { n: 0, sum: 0, max: 0 },
    tookUnits: 0,
    budgetTaken: 0,
    budgetWant: 0,
    unparsed: 0,
  }
  if (!Array.isArray(lines)) return c
  const seenBots = new Set()
  for (const line of lines) {
    if (typeof line !== 'string') continue
    const s = parseFuelCommonsAsk(line)
    if (s) {
      c.n++
      c.byKind[s.kind] = (c.byKind[s.kind] || 0) + 1
      seenBots.add(s.bot)
      if (s.kind === 'gate') {
        c.levels.n++
        c.levels.sum += s.levels
        if (s.levels > c.levels.max) c.levels.max = s.levels
      }
      if (s.kind === 'took') c.tookUnits += s.units
      if (s.kind === 'budget') { c.budgetTaken += s.taken; c.budgetWant += s.want }
      continue
    }
    if (OUTCOME_TORN_RE.test(line)) c.unparsed++
  }
  c.bots = seenBots.size
  return c
}

// the family's half boundary (the owner maps' own shape, one number)
export const FUEL_ASK_SHARE = 0.5

/**
 * The row: did the ask eat, and if not - which wall owns the face? The
 * verdicts are exclusive (the outcome classes are disjoint, at most one
 * class can own the half boundary). Byte-stable; the always-print law
 * holds (the none form is a verdict too).
 * @param {{n: number, byKind: Record<string, number>, bots: number, tookUnits: number}|null} c a fuelCommonsCensus result
 * @returns {string}
 */
export function fuelCommonsRow (c) {
  if (!c || !Number.isFinite(c.n) || c.n === 0) return 'fuel commons asks: none (the ask never spoke this run)'
  const k = c.byKind || {}
  const took = Number.isFinite(k.took) ? k.took : 0
  const dry = Number.isFinite(k.dry) ? k.dry : 0
  const gate = Number.isFinite(k.gate) ? k.gate : 0
  const budget = Number.isFinite(k.budget) ? k.budget : 0
  const units = Number.isFinite(c.tookUnits) ? c.tookUnits : 0
  const bots = Number.isFinite(c.bots) ? c.bots : 0
  const head = `fuel commons asks: ${c.n} outcome(s) across ${bots} bot(s) (took ${units}u from ${took} ask(s), dry ${dry}, gate ${gate}, budget ${budget})`
  const pct = (v) => ((v / c.n) * 100).toFixed(1)
  if (took > 0) return `${head} - the ask feeds its bot - the source breathes`
  if (budget / c.n >= FUEL_ASK_SHARE) return `${head} - ${budget} asks spent their own clock - the ask's budget is the front`
  if (dry / c.n >= FUEL_ASK_SHARE) return `${head} - ${dry} chests answered empty - the source is the front (the tithe owns the refill)`
  if (gate / c.n >= FUEL_ASK_SHARE) return `${head} - ${gate} asks met the walk ladder - the deep resupply's seat is priced`
  // the mixed face: the top two classes by count (ties ride name-asc), the
  // shares honest - no class owns the boundary, the cures point different ways
  const entries = [
    ['gate', gate], ['dry', dry], ['took', took], ['budget', budget],
    ['nochest', Number.isFinite(k.nochest) ? k.nochest : 0],
    ['defer', Number.isFinite(k.defer) ? k.defer : 0],
    ['openfail', Number.isFinite(k.openfail) ? k.openfail : 0],
    ['walkfail', Number.isFinite(k.walkfail) ? k.walkfail : 0],
  ].sort((a, b) => (b[1] - a[1]) || (a[0] < b[0] ? -1 : 1)).slice(0, 2)
  return `${head} - the outcomes read mixed (${entries.map(([kind, v]) => `${kind} ${pct(v)}%`).join(', ')}) - no class owns the face`
}
