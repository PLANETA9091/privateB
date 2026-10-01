// (v0.440.0) THE PLAN TOP NAMES - the deficits board gains its voice.
//
// The deficits row (v0.417.0's clock) is anonymous by DESIGN: five slots of
// `required/have (pct%)`, the emitter printed no names, and the census could
// only read the WORST-ENTRY'S-SEAT movement (the index caveat: the NAME in
// the seat may churn between rows). Face 28 paid for the anonymity: the top
// slot sat at 157926/0 (0.0%) for the WHOLE face - THE STUCK SIGNATURE with
// no one able to say WHICH resource is stuck - and the plan's other four
// slots were equally mute. The decompose's row could only say 'the name
// churns'.
//
// THE CURE: a SECOND line rides the same tick emission (the deficits line
// stays byte-identical - the one-parser-per-emitter law gives the new
// emitter its own parser), carrying the SAME five slots with the plan's own
// resource key LEADING each entry:
//
//   `   plan top: iron_ingot 157926/0 (0.0%) stick 90000/92 (0.1%) ...`
//
// The name is the plan's resource key (what MINABLE_OF and PLAN_ALIAS_OF
// speak - [a-z_][a-z_0-9]*, always single-token; the multi-item display
// name never enters - it is a rendering, not a key). Now the stuck seat has
// a NAME, and the census reads the seat's OWN arc: did ONE resource sit in
// slot 0 all face (the named stuck signature), or did the seat change hands
// (everything is stuck - the flat board is the board's, not one resource's)?
//
// Junk-safe, honest zeros: a row that fails to tile counts unparsed and is
// EXCLUDED from the math (never a half-read board); no rows = nulls, never
// zeros that lie. The deficits line itself does NOT match here (its token
// is the other lane's).

// The named row: the 'plan top: ' token is the emitter's own (unique in the
// field); leading whitespace optional (the tee preserves the emitter's
// three spaces, junk-tolerance costs nothing the token doesn't already pin).
export const PLAN_TOP_ROW_RE = /^\s*plan top: (.+)$/

// One entry: the plan's resource key, then the deficits entry's own shape
// (req/have (pct%)) - the numbers grammar is the deficits row's, byte for
// byte, so the two boards read as ONE board on the decompose's page.
const ENTRY_RE = /([a-z_][a-z_0-9]*) (\d+)\/(\d+) \((\d+(?:\.\d+)?)%\)/g

// (v0.442.0) THE LEAK SENTINELS: a plan resource key can never be the JS
// literals `undefined` or `null` - face 30 (36926711080) caught the emitter
// printing exactly that (`plan top: undefined 157926/0 (0.0%) ...`, the res
// key missing from the materialsProgress value) and the grammar read the
// token as an honest-looking name, building a fake named stuck signature out
// of the leak. A slot named by a sentinel reads bad - counted unparsed, the
// escape hatch screams, the seat math never sees a fake name.
const LEAK_SENTINELS = new Set(['undefined', 'null'])

/**
 * Parse one plan-top row. Returns null on every non-match (junk, the
 * deficits line, the other lanes' shapes, prose). Slots ride the emitter's
 * own order (the worst at index 0 - the same sort as topDeficits).
 *
 * THE TILING LAW (the deficits parser's, inherited): the entries must TILE
 * THE TAIL (one optional space between consecutive matches, no leading or
 * trailing garbage). Any future format edge reads bad - counted unparsed,
 * never silently half-read. THE LEAK SENTINELS (v0.442.0): a slot named
 * `undefined`/`null` reads bad too - the emitter's own JS leak never
 * becomes a name (face 30's field regression, pinned in the tests).
 */
export function parsePlanTopRow (line) {
  const m = typeof line === 'string' ? line.match(PLAN_TOP_ROW_RE) : null
  if (!m) return null
  const tail = m[1]
  const slots = []
  let last = 0
  for (const e of tail.matchAll(ENTRY_RE)) {
    if (e.index !== last && e.index !== last + 1) return { bad: true, slots }
    slots.push({ res: e[1], required: Number(e[2]), have: Number(e[3]), pct: Number(e[4]) })
    last = e.index + e[0].length
  }
  if (slots.length === 0 || last !== tail.length) return { bad: true, slots }
  if (slots.some(s => LEAK_SENTINELS.has(s.res))) return { bad: true, slots }
  return { bad: false, slots }
}

/**
 * The census: the named row stream into one junk-safe read.
 * - rows: parsed rows feeding the math (half-read rows excluded).
 * - slotsPerRow min/max: the board's width drift (a spread names a format
 *   edge, the deficits clock's own caveat).
 * - seat: slot 0's NAME arc - firstName/lastName (the stuck resource's own
 *   name), distinctNames (the first-seen order), handChanges (the seat's
 *   occupancy changed count - 0 with one distinct name = THE NAMED STUCK
 *   SIGNATURE: one resource sat in slot 0 all face).
 * - byRes: per-resource arcs (n, pct first/last/min/max, have min/max) - a
 *   resource that NEVER left the board across every row is the plan's
 *   permanent resident; capped by nothing (the plan's keys are bounded by
 *   the plan's own size, ~31 in the field).
 * - unparsed: plan-top-shaped rows whose entries escaped - counted, never
 *   silently dropped.
 */
export function planTopCensus (lines) {
  const c = {
    rows: 0,
    slotsPerRow: { min: null, max: null },
    seat: {
      firstName: null, lastName: null,
      distinctNames: [], handChanges: 0
    },
    byRes: {},
    unparsed: 0
  }
  if (!Array.isArray(lines)) return c
  for (const line of lines) {
    const p = parsePlanTopRow(line)
    if (!p) continue
    if (p.bad) { c.unparsed++; continue }
    if (p.slots.length === 0) { c.unparsed++; continue }
    c.rows++
    const n = p.slots.length
    if (c.slotsPerRow.min === null || n < c.slotsPerRow.min) c.slotsPerRow.min = n
    if (c.slotsPerRow.max === null || n > c.slotsPerRow.max) c.slotsPerRow.max = n
    const s0 = p.slots[0]
    if (c.seat.firstName === null) c.seat.firstName = s0.res
    else if (s0.res !== c.seat.lastName) c.seat.handChanges++
    c.seat.lastName = s0.res
    if (!c.seat.distinctNames.includes(s0.res)) c.seat.distinctNames.push(s0.res)
    for (const s of p.slots) {
      const a = c.byRes[s.res] || (c.byRes[s.res] = { n: 0, firstPct: null, lastPct: null, minPct: null, maxPct: null, minHave: null, maxHave: null })
      a.n++
      if (a.firstPct === null) { a.firstPct = s.pct; a.minHave = s.have; a.maxHave = s.have }
      a.lastPct = s.pct
      if (a.minPct === null || s.pct < a.minPct) a.minPct = s.pct
      if (a.maxPct === null || s.pct > a.maxPct) a.maxPct = s.pct
      if (s.have < a.minHave) a.minHave = s.have
      if (s.have > a.maxHave) a.maxHave = s.have
    }
  }
  return c
}
