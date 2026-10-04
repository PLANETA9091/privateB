// (v0.590.0) THE VERTICAL GATE LENS - the deep strand's own census read.
//
// WHY: fleet 37169265512's face named the seat four fires in a row and no
// row owned the read. The tithe inflow's first verdict ('attempted 4,
// delivered 0, dry 4 - the skips named their lines') rode 'the vertical
// gate: the yard stands 36/39 levels up - the walk ladder cannot climb';
// the write-off whys' third read split into timeout 513u (58.3%) and
// no-chest 293u while the per-bot rows named deep strands (F15 275u, F9
// 210u); and the end-phase log carried the strand's own mass - 79 'chest
// skip (vertical doom: ...)' lines across 11 bots, 43 clock refusals, 22
// route-latched ascents, 14 failed climbs, and 0 climbs landed - the
// v0.256.0 climb-before-skip executor never bought its route this run.
// The face dove the log by hand; this lens arms the read.
//
// THE EMITTER FAMILIES (verified verbatim against the held logs):
// deposit.mjs's hop gate (the outer bot prefix + the lib's own [bot] tag,
// the legacy no-range shape rides the same why seat):
//   F18 [F18] chest skip (vertical doom: the yard stands 27 levels up over 3b lateral - the walk ladder cannot climb)
//   F12 [F12] chest skip (vertical doom: 27-29 levels up - the walk ladder cannot climb)
// fleet19's chest ascent executor (the v0.256.0 doom hook + the v0.321.0
// latch; the v0.257.0 upfront executor is silent on refusal by design):
//   F18 chest ascent: the yard stands 27 levels up over 3b lateral - climbing toward the chest before the hop
//   F12 chest ascent: climbed +9 levels (dug 12, 9 steps) - the hop gets its route
//   F18 chest ascent: refused (the clock 38s cannot fund the 45s climb + the 30s walk floor) - the skip stands
//   F9 chest ascent: refused (no clock read) - the skip stands
//   F17 chest ascent: route-latched after 3 refused climbs - the route is condemned, the skip stands
//   F18 chest ascent: failed (wet wall) - the skip stands
//
// THE SEAT: a post-run decode instrument, mining-surface only (the
// deep-strand v0.579.0 precedent: zero fleet wiring, zero new log lines).
// ONE parser per emitter (the v0.409.0 law): the CLIMB OUT lines are
// climbout's own lens (v0.420.0), never re-parsed here.
//
// THE VERDICT: the row names the deep anchor's seat (the v0.579.0 hand-off
// - the same cure the climb tax priced) when the executor attempted climbs
// and landed none; the healthy form names the funded altitude; a
// skips-only run reads honest silence about the ascent (it never asked).
// Junk-safe end to end: non-string rows skipped, torn numbers read the
// honest null (the stamp never invents), the head-matched-but-body-escaped
// shapes counted as unparsed (the honest-sweep law: named, never dropped).

function bump (map, key, n = 1) {
  if (key == null) return
  map[key] = (map[key] ?? 0) + n
}

function num (tok) {
  return tok === '?' ? null : Number(tok)
}

// The skip emitter: the hop gate's refusal (deposit.mjs). The outer bot
// name is the truth; the lib's own [bot] tag is optional in the grammar
// (the 'bot' fallback shape parses with it consumed). The why's own
// fields ride when the range shape holds - the legacy range ('27-29')
// reads the NEAR bound (the strict gate's floor) and keeps the raw why.
export const VERTICAL_SKIP_RE = /^(F\d+) (?:\[[A-Za-z0-9]+\] )?chest skip \(vertical doom: (.+) - the walk ladder cannot climb\)$/
// the range shape rides both grammars: the modern why prefixes 'the yard
// stands ', the legacy shape (face 36346860061's '27-29 levels up') rides bare
const VERTICAL_LEVELS_RE = /(?:the yard stands )?(\d+)(?:-(\d+))? levels? up(?: over (\d+)b lateral)?$/

export function parseVerticalSkip (line) {
  if (typeof line !== 'string') return null
  const m = line.match(VERTICAL_SKIP_RE)
  if (!m) return null
  const why = m[2]
  const lv = why.match(VERTICAL_LEVELS_RE)
  return {
    bot: m[1],
    why,
    levels: lv ? Number(lv[1]) : null,
    levelsFar: lv && lv[2] !== undefined ? Number(lv[2]) : null,
    lateral: lv && lv[3] !== undefined ? Number(lv[3]) : null,
  }
}

// The ascent emitter: the executor's five shapes, most-specific-first.
// The clock refusal parses its economics (the clock the chain held vs the
// climb + walk-floor price the plan asked); the '?' fallbacks of the
// climbed shape (the emitter's own ?? prints) read the honest null.
export const VERTICAL_ASCENT_RE = /^(F\d+) chest ascent: (.+)$/

export function parseVerticalAscent (line) {
  if (typeof line !== 'string') return null
  const m = line.match(VERTICAL_ASCENT_RE)
  if (!m) return null
  const bot = m[1]
  const rest = m[2]
  let mm = rest.match(/^(.+) - climbing toward the chest before the hop$/)
  if (mm) {
    const lv = mm[1].match(VERTICAL_LEVELS_RE)
    return {
      bot, verdict: 'climbing', why: mm[1],
      levels: lv ? Number(lv[1]) : null,
      lateral: lv && lv[3] !== undefined ? Number(lv[3]) : null,
    }
  }
  mm = rest.match(/^climbed \+(\d+|\?) levels \(dug (\d+|\?), (\d+|\?) steps\) - the hop gets its route$/)
  if (mm) {
    return { bot, verdict: 'climbed', gained: num(mm[1]), dug: num(mm[2]), steps: num(mm[3]) }
  }
  mm = rest.match(/^refused \(the clock (\d+)s cannot fund the (\d+)s climb \+ the (\d+)s walk floor\) - the skip stands$/)
  if (mm) {
    return { bot, verdict: 'refused-clock', clockSecs: Number(mm[1]), climbSecs: Number(mm[2]), walkFloorSecs: Number(mm[3]) }
  }
  mm = rest.match(/^refused \((.+)\) - the skip stands$/)
  if (mm) return { bot, verdict: 'refused', why: mm[1] }
  mm = rest.match(/^route-latched after (\d+) refused climbs - the route is condemned, the skip stands$/)
  if (mm) return { bot, verdict: 'route-latched', refused: Number(mm[1]) }
  mm = rest.match(/^failed \((.+)\) - the skip stands$/)
  if (mm) return { bot, verdict: 'failed', why: mm[1] }
  // the head matched but the body escaped the grammar - the shape evolved;
  // the event rides unparsed (counted, never dropped) by the census.
  return { bot, verdict: 'unparsed', raw: rest }
}

export function verticalGateCensus (lines) {
  const out = {
    skips: { n: 0, byBot: {}, levels: { n: 0, sum: 0, max: 0 } },
    ascents: {
      climbing: { n: 0 },
      climbed: { n: 0, gainedSum: 0, gainedMax: 0 },
      refusedClock: { n: 0, clockSecs: { n: 0, sum: 0, min: 0, max: 0 }, climbSecs: 0, walkFloorSecs: 0 },
      refusedOther: { n: 0, byWhy: {} },
      routeLatched: { n: 0, refusedSum: 0 },
      failed: { n: 0, byWhy: {} },
    },
    unparsed: 0,
  }
  if (!Array.isArray(lines)) return out
  for (const l of lines) {
    if (typeof l !== 'string') continue
    const s = parseVerticalSkip(l)
    if (s) {
      out.skips.n++
      bump(out.skips.byBot, s.bot)
      if (s.levels !== null) {
        out.skips.levels.n++
        out.skips.levels.sum += s.levels
        if (s.levels > out.skips.levels.max) out.skips.levels.max = s.levels
      }
      continue
    }
    const a = parseVerticalAscent(l)
    if (!a) continue
    if (a.verdict === 'climbing') { out.ascents.climbing.n++; continue }
    if (a.verdict === 'climbed') {
      out.ascents.climbed.n++
      if (a.gained !== null) {
        out.ascents.climbed.gainedSum += a.gained
        if (a.gained > out.ascents.climbed.gainedMax) out.ascents.climbed.gainedMax = a.gained
      }
      continue
    }
    if (a.verdict === 'refused-clock') {
      const rc = out.ascents.refusedClock
      rc.n++
      rc.climbSecs = a.climbSecs // the price is the plan's own constants - constant per run, last read wins
      rc.walkFloorSecs = a.walkFloorSecs
      if (rc.clockSecs.n === 0 || a.clockSecs < rc.clockSecs.min) rc.clockSecs.min = a.clockSecs
      if (a.clockSecs > rc.clockSecs.max) rc.clockSecs.max = a.clockSecs
      rc.clockSecs.n++
      rc.clockSecs.sum += a.clockSecs
      continue
    }
    if (a.verdict === 'refused') { out.ascents.refusedOther.n++; bump(out.ascents.refusedOther.byWhy, a.why); continue }
    if (a.verdict === 'route-latched') { out.ascents.routeLatched.n++; out.ascents.routeLatched.refusedSum += a.refused; continue }
    if (a.verdict === 'failed') { out.ascents.failed.n++; bump(out.ascents.failed.byWhy, a.why); continue }
    out.unparsed++
  }
  return out
}

// The decode row: the deep strand's own census line, byte-stable. Returns
// null when the strand is quiet (no skips, no ascent lines - the leanness
// law; the caller prints nothing and no verdict is invented the data
// cannot carry). The clock-refusal clause carries the strand's own
// economics when the refusals speak; the failed clause carries the why
// breakdown (count desc, why asc - the census's tie law).
export function verticalGateRow (lines) {
  const c = verticalGateCensus(lines)
  const a = c.ascents
  const attempts = a.climbing.n + a.refusedClock.n + a.refusedOther.n + a.routeLatched.n + a.failed.n
  if (c.skips.n === 0 && attempts === 0) return null
  const parts = []
  parts.push(`${c.skips.n} skips across ${Object.keys(c.skips.byBot).length} bots`)
  if (a.refusedClock.n > 0) {
    parts.push(`${a.refusedClock.n} clock refusals (clocks ${a.refusedClock.clockSecs.min}-${a.refusedClock.clockSecs.max}s cannot fund the ${a.refusedClock.climbSecs}s+${a.refusedClock.walkFloorSecs}s)`)
  } else {
    parts.push('0 clock refusals')
  }
  parts.push(`${a.routeLatched.n} route-latched`)
  const failBits = Object.entries(a.failed.byWhy)
    .sort((x, y) => (y[1] - x[1]) || (x[0] < y[0] ? -1 : 1))
    .map(([w, n]) => `${w} ${n}`)
  parts.push(`${a.failed.n} failed ascents${failBits.length ? ` (${failBits.join(', ')})` : ''}`)
  parts.push(`${a.climbed.n} of ${a.climbing.n} climbs landed`)
  let verdict
  if (a.climbing.n === 0 && a.climbed.n === 0) verdict = 'the skips ride unpriced: no ascent ever asked'
  else if (a.climbed.n > 0) verdict = 'the ascent buys its routes: the gate re-prices from the funded altitude'
  else verdict = 'the ascent never lands: the deep anchor\'s seat is priced'
  return `vertical gate: ${parts.join(', ')} - ${verdict}`
}

// (v0.593.0) THE CACHED-SKIP GRAIN - the chest skip's own cache verdicts,
// read as one family. The face's first read (fleet 37171678894, the
// v0.589.0 tree) carried 39 'chest skip (no path cached Xs ago at ...)'
// lines against the vertical doom's 29 - a class BIGGER than the named
// strand and nobody's row read it. deposit.mjs's skip line speaks THREE
// cached verdicts beside the doom: the cache has NO answer (no path
// cached), the cache answers FULL (full cached), the cache answers DOOMED
// (doomed goal cached). Every shape carries the same economics - the
// answer's age in seconds and the cell that asked. The grain: who asked,
// how old the answers were, and whether the cache was BORN EMPTY at the
// ask (a 0s age is the builder's race - the ask landed inside the same
// think window that builds the cache, the answer never existed yet).
// ONE PARSER PER EMITTER (the v0.409.0 law): the cached family gets one
// regex of its own - the vertical doom's grammar stays parseVerticalSkip's.
// Pure functions only (the deep-strand law): this file never sees a bot.

const CACHED_SKIP_RE = /^(F\d+) (?:\[[A-Za-z0-9]+\] )?chest skip \((no path cached|full cached|doomed goal cached) (\d+)s ago at \[(-?\d+),(-?\d+),(-?\d+)\]\)$/

/**
 * Parse one chest skip's cached-verdict line.
 * @param {string} line the log line (the outer bot name is the truth; the lib's own [bot] tag is optional)
 * @returns {{bot: string, why: string, ageS: number, cell: {x: number, y: number, z: number}}|null} null on any non-member line
 */
export function parseCachedSkip (line) {
  if (typeof line !== 'string') return null
  const m = line.match(CACHED_SKIP_RE)
  if (!m) return null
  return {
    bot: m[1],
    why: m[2],
    ageS: Number(m[3]),
    cell: { x: Number(m[4]), y: Number(m[5]), z: Number(m[6]) },
  }
}

/**
 * Tally the cached-skip family over the log's lines: the why split, the
 * zero-age count (the builder's race), the oldest answer, the distinct
 * cells that asked. Junk lines and the doom grammar stay unparsed.
 * @param {string[]} lines
 * @returns {{n: number, byWhy: {'no path cached': number, 'full cached': number, 'doomed goal cached': number}, zeroAge: number, maxAgeS: number, cells: number, unparsed: number}}
 */
export function cachedSkipCensus (lines) {
  const c = { n: 0, byWhy: {}, zeroAge: 0, maxAgeS: 0, cells: 0, unparsed: 0 }
  if (!Array.isArray(lines)) return c
  const seen = new Set()
  for (const line of lines) {
    const s = parseCachedSkip(line)
    if (!s) continue
    c.n++
    c.byWhy[s.why] = (c.byWhy[s.why] || 0) + 1
    if (s.ageS === 0) c.zeroAge++
    if (s.ageS > c.maxAgeS) c.maxAgeS = s.ageS
    const k = `${s.cell.x},${s.cell.y},${s.cell.z}`
    if (!seen.has(k)) { seen.add(k); c.cells++ }
  }
  c.cells = seen.size
  // the honest sweep: a line of THIS family's three whys that failed the
  // full grammar is named unparsed - torn ages and cells stay visible
  c.unparsed = Array.isArray(lines)
    ? lines.filter(l => typeof l === 'string' && /chest skip \((?:no path cached|full cached|doomed goal cached)/.test(l) && !CACHED_SKIP_RE.test(l)).length
    : 0
  return c
}

// the family's half boundary (the owner maps' own shape, one number)
export const CACHED_ZERO_SHARE = 0.5

/**
 * The row: is the cache born empty at the asks, or does it hold answers?
 * Byte-stable; the always-print law holds (the none form is a verdict).
 * @param {{n: number, byWhy: Record<string, number>, zeroAge: number, maxAgeS: number, cells: number}|null} c a cachedSkipCensus result
 * @returns {string}
 */
export function cachedSkipRow (c) {
  if (!c || !Number.isFinite(c.n) || c.n === 0) return 'cached skips: none (no cached verdict ever skipped a chest)'
  const whys = Object.entries(c.byWhy || {})
    .sort((x, y) => (y[1] - x[1]) || (x[0] < y[0] ? -1 : 1))
    .map(([w, n]) => `${w} ${n}`)
    .join(', ')
  const head = `cached skips: ${c.n} skips across ${c.cells} cells (${whys})`
  const zero = Number.isFinite(c.zeroAge) && c.zeroAge > 0 ? c.zeroAge : 0
  if (zero / c.n >= CACHED_ZERO_SHARE) {
    return `${head} - ${zero} born empty at the ask - the builder's race is the front`
  }
  return `${head} - oldest answer ${Number.isFinite(c.maxAgeS) ? Math.floor(c.maxAgeS) : 0}s - the cache's own clock is the front`
}
