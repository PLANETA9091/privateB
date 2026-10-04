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
  // (v0.599.0) the dry read's two faces: the bare legacy form (chest null -
  // the pre-0.599.0 fleets and the torn lines stay members) and the named
  // form (the emitter's own cell - the books' dry face closes on the chest
  // it actually read, the tithe's filled chest becomes comparable)
  { re: new RegExp(OPEN_TAG + 'chest holds no fuel(?: at \\[(-?\\d+),(-?\\d+),(-?\\d+)\\])?$'), build: (m) => (m[2] != null
    ? { bot: m[1], kind: 'dry', chest: { x: Number(m[2]), y: Number(m[3]), z: Number(m[4]) } }
    : { bot: m[1], kind: 'dry' }) },
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
    // (v0.596.0) the seats: per-bot per-kind tallies (additive, the seats'
    // own grain - the class rows stay byte for byte)
    byBot: {},
    // (v0.599.0) the dry reads' own scatter: only a NAMED chest rides (the
    // bare form cannot scatter) - 'x,y,z' -> count, plus the named split
    dryNamed: 0,
    dryByChest: {},
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
      if (!c.byBot[s.bot] || typeof c.byBot[s.bot] !== 'object') {
        c.byBot[s.bot] = { n: 0, gate: 0, dry: 0, took: 0, budget: 0, nochest: 0, defer: 0, openfail: 0, walkfail: 0 }
      }
      const seat = c.byBot[s.bot]
      seat.n++
      seat[s.kind] = (seat[s.kind] || 0) + 1
      if (s.kind === 'gate') {
        c.levels.n++
        c.levels.sum += s.levels
        if (s.levels > c.levels.max) c.levels.max = s.levels
      }
      if (s.kind === 'took') c.tookUnits += s.units
      if (s.kind === 'budget') { c.budgetTaken += s.taken; c.budgetWant += s.want }
      if (s.kind === 'dry' && s.chest) {
        c.dryNamed++
        const key = `${s.chest.x},${s.chest.y},${s.chest.z}`
        c.dryByChest[key] = (c.dryByChest[key] || 0) + 1
      }
      continue
    }
    if (OUTCOME_TORN_RE.test(line)) c.unparsed++
  }
  c.bots = seenBots.size
  return c
}

// the family's half boundary (the owner maps' own shape, one number)
export const FUEL_ASK_SHARE = 0.5

// (v0.596.0) THE ASK'S SEAT GRAIN - the outcomes' own owner map. The first
// field read (fleet 37173632953) named the face MIXED (budget 43.2%, dry
// 35.1%) and priced the front but not the SEAT - the overdue owners' lesson
// (v0.592.0) rides: 'one bot's walk vs the fleet's reach, two different
// cures'. The census grows byBot (additive - the row bytes never move, the
// comparability law holds); the seat row names WHICH bot owns a death class:
// one seat -> that seat's own slice is the cure; spread -> the slice is the
// fleet's front. The deliveries (took) are not deaths - no seats to name.

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

// (v0.596.0) the death classes that name seats (the deliveries are not
// deaths - the ask ate, there is nobody to cure)
const SEAT_KINDS = ["gate", "dry", "budget", "nochest", "defer", "openfail", "walkfail"]

/**
 * The seat row: WHICH bot owns a death class of the ask's outcomes? The
 * half boundary FUEL_ASK_SHARE splits the verdicts - one seat holds the
 * half -> that seat's own slice is the cure; the deaths are spread -> the
 * slice is the fleet's front. The dominant death kind rides when none is
 * named (ties ride name-asc). The always-print law holds (every none form
 * is a verdict too).
 * @param {{byBot: Record<string, object>}|null} c a fuelCommonsCensus result
 * @param {string|null} [kind] a death class (gate|dry|budget|nochest|defer|openfail|walkfail); null reads the dominant
 * @returns {string}
 */
export function fuelCommonsOwnerRow (c, kind = null) {
  const byBot = c && typeof c.byBot === 'object' && c.byBot ? c.byBot : null
  if (!byBot || Object.keys(byBot).length === 0) return 'ask seats: none (no outcome ever spoke)'
  const names = Object.keys(byBot)
  const totals = {}
  for (const k of SEAT_KINDS) totals[k] = 0
  for (const b of names) {
    const rec = byBot[b]
    if (!rec || typeof rec !== 'object') continue
    for (const k of SEAT_KINDS) {
      const v = Number.isFinite(rec[k]) ? rec[k] : 0
      totals[k] += v > 0 ? v : 0
    }
  }
  const kindUsed = SEAT_KINDS.includes(kind) ? kind
    : SEAT_KINDS.slice().sort((a, b) => (totals[b] - totals[a]) || (a < b ? -1 : 1))[0]
  const total = totals[kindUsed]
  if (total === 0) return `ask seats (${kindUsed}): none (${names.length} bot(s) spoke, the ask never died this way)`
  const owners = []
  for (const b of names) {
    const rec = byBot[b]
    const v = rec && typeof rec === 'object' && Number.isFinite(rec[kindUsed]) ? rec[kindUsed] : 0
    if (v > 0) owners.push({ name: b, n: v })
  }
  owners.sort((a, b) => (b.n - a.n) || (a.name < b.name ? -1 : 1))
  const top = owners[0]
  const pct = ((top.n / total) * 100).toFixed(1)
  const head = `ask seats (${kindUsed}): ${owners.length} bot(s) carry ${total} death(s)`
  if (top.n / total >= FUEL_ASK_SHARE) {
    return `${head} - ${top.name} holds ${pct}% (${top.n}) - one seat owns the ask's deaths (that seat's own slice is the cure)`
  }
  return `${head} - top ${top.name}=${top.n} (${pct}%) - the deaths are spread (the slice is the fleet's front)`
}

// (v0.599.0) THE DRY READS' OWN SCATTER ROW: WHICH chest owns the dry? The
// books' three lines are the deposit ('banked N items at (x,y,z)' - the
// tithe's inflow names its chest), the ask's anchor ('chest at [x,y,z]'),
// and the dry read - the one anonymous line, until the emitter named its
// chest. Fleet 37178311099's face: the tithe banked 28 x coal into
// [-108,71,407], the asks anchored [-108,71,401] and the sibling cells,
// the grain read 'asked 4, delivered 0, dry 4' - whether the filled chest
// EVER got read is the divergence's own face, and only a named dry read
// can answer it. The half boundary FUEL_ASK_SHARE splits the verdicts -
// one chest holds the half -> that anchor's own read is the cure; the
// reads scatter -> the divergence itself is the front. The bare form's
// anonymous fleet reads its own verdict (the always-print law).
// @param {{byKind?: {dry?: number}, dryNamed?: number, dryByChest?: Record<string, number>}|null} c a fuelCommonsCensus result
// @returns {string}
export function fuelCommonsDryScatterRow (c) {
  const dry = c && c.byKind && Number.isFinite(c.byKind.dry) ? c.byKind.dry : 0
  const anonymous = `fuel commons dry reads: ${dry} dry, none named - the anonymous fleet cannot scatter (the pre-0.599.0 face)`
  const map = c && typeof c.dryByChest === 'object' && c.dryByChest ? c.dryByChest : null
  if (!map) return anonymous
  const chests = Object.entries(map)
    .map(([cell, n]) => ({ cell, n: Number.isFinite(n) ? n : 0 }))
    .filter(e => e.n > 0)
    .sort((a, b) => (b.n - a.n) || (a.cell < b.cell ? -1 : 1))
  if (chests.length === 0) return anonymous
  const total = chests.reduce((s, e) => s + e.n, 0)
  const top = chests[0]
  const pct = ((top.n / total) * 100).toFixed(1)
  const head = `fuel commons dry reads: ${total} named across ${chests.length} chest(s) (dry ${dry}) - top [${top.cell}] x${top.n} (${pct}%)`
  if (top.n / total >= FUEL_ASK_SHARE) {
    return `${head} - one chest owns the dry (that anchor's own read is the cure)`
  }
  return `${head} - the dry reads scatter (the filled chest never read is the divergence's face)`
}
