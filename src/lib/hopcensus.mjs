// (v0.399.0) THE HOP-ZERO CENSUS - the walk-deliveries class's field leg.
// The hop walk is the deposit chain's shortest delivery (the bot stands at
// the chest and clicks) - when even the HOP delivers zero, the delivery
// machinery is bleeding where it is cheapest. Face 22 (36825236093) bled
// 24 zero-hops in one 600s run; until now NO census read the class (the
// blind-tool lesson, the v0.371.0 shape) - the lines rode in the log
// unread while the walk-deliveries cure stayed on the fronts list.
//
// THE LINE (verified verbatim in src/lib/deposit.mjs and against the held
// face-22 log; the DOUBLE-TAG anatomy is deposit.mjs's own log shape on
// the field - the v0.397.0 seal-census precedent):
//   F12 [F12] hop: chest at [-143,68,411] d=23 zero: chest unreachable (Took to long to decide path to goal!)
//   F8  [F8]  hop: chest at [-138,68,411] d=13 zero: chest unreachable (walk to chest (retry): timeout after 28090ms)
//   F1  [F1]  hop: chest at [-120,68,408] zero: chest beyond the hop search radius 24 - walking home instead
//   F5  [F5]  hop: chest at [-122,68,395] d=4 zero: cannot open chest (open chest: timeout after 10000ms)
//   F9  [F9]  hop: chest at [-133,68,419] d=4 zero: nothing to deposit
// The position may read '?' placeholders (an unreadable chest position
// prints '?' per slot); the d= clause is optional (the emitter skips it
// when the hop distance is unknown).
//
// THE WHY CLASSES (face 22's own distribution: goal-churn 8, walk-timeout
// 5, decide-timeout 4, no-path 3, open-timeout 2, brake-refusal 1,
// nothing-to-deposit 1; face 23 added the budget-floor class - 'chest
// unreachable (budget exhausted (walk floor))', 9 zeros, the walk FLOOR's
// own budget dying before the chest - distinct from the timeout family:
// the budget arithmetic refused/ran out, no timer fired) - ordered
// most-specific-first so the timeout ms captures never cross (the
// open-timeout's own timeout must not read as a walk timeout); unknown
// lands in unreachable-other (a chest-unreachable wrapper no rule named)
// or other (any other zero reason), never dropped (the honest-sweep law).
//
// Pure parser, unit-pinned (the seal-census v0.397.0 shape); decompose is
// its field read. Mining-surface only: zero fleet wiring, zero new log
// lines - the v0.379.0 precedent. Junk-safe end to end: non-string rows
// skipped, absent class reads the honest zero.

const num = (s) => Number(s)

export const HOP_ZERO_RE = /^(F\d+) \[F\d+\] hop: chest at \[([^,\]]*),([^,\]]*),([^,\]]*)\](?: d=(\d+))? zero: (.+)$/

// The why vocabulary - ORDER IS SEMANTIC (most-specific-first; the ms
// captures must not cross the open/walk families).
export function classifyHopZero (why) {
  if (typeof why !== 'string') return null
  let m
  if ((m = why.match(/^nothing to deposit/))) return { why: 'nothing-to-deposit' }
  if ((m = why.match(/^chest full/))) return { why: 'chest-full' }
  if ((m = why.match(/^cannot open chest \(open chest: timeout after (\d+)ms\)/))) return { why: 'open-timeout', ms: num(m[1]) }
  if ((m = why.match(/^chest beyond the hop search radius (\d+)/))) return { why: 'beyond-radius', radius: num(m[1]) }
  if (/chest unreachable \(budget exhausted \(walk floor\)\)/.test(why)) return { why: 'budget-floor' }
  if (/chest unreachable \(Took to long to decide/.test(why)) return { why: 'decide-timeout' }
  if ((m = why.match(/chest unreachable \(walk to chest.*timeout after (\d+)ms\)/))) return { why: 'walk-timeout', ms: num(m[1]) }
  if (/chest unreachable \(goal brake:/.test(why)) return { why: 'brake-refusal' }
  if (/chest unreachable \(The goal was changed/.test(why)) return { why: 'goal-churn' }
  if (/chest unreachable \(No path to the goal/.test(why)) return { why: 'no-path' }
  if (/chest unreachable \(Path was stopped/.test(why)) return { why: 'path-stopped' }
  if (/chest unreachable \(water rescue/.test(why)) return { why: 'water-rescue' }
  if (/^chest unreachable/.test(why)) return { why: 'unreachable-other' }
  return { why: 'other' }
}

// 'F12 [F12] hop: chest at [-143,68,411] d=23 zero: chest unreachable (...)'
//   -> { bot, x, y, z, dist (null when the d= clause is absent or the slot
//        is '?'), why (raw), klass ({why, ms?, radius?}) } or null
export function parseHopZero (s) {
  const m = typeof s === 'string' ? s.match(HOP_ZERO_RE) : null
  if (!m) return null
  const coord = (v) => /^\-?\d+$/.test(v) ? num(v) : null
  return {
    bot: m[1],
    x: coord(m[2]), y: coord(m[3]), z: coord(m[4]),
    dist: m[5] !== undefined ? num(m[5]) : null,
    why: m[6],
    klass: classifyHopZero(m[6]),
  }
}

// The census: feed the full fleet19.log lines. The honest zero when the
// face never zero-hopped (a clean delivery face is a REAL result - the
// v0.358.0 lesson). Per bucket:
//   total    - every zero-hop line
//   byWhy    - class -> count
//   byBot    - bot -> count
//   byChest  - 'x,y,z' -> count (a HOT chest is a delivery hazard; the
//              '?' placeholder positions are skipped - no position, no
//              bucket)
//   timeouts - { open: [ms...], walk: [ms...] } (the captured budgets -
//              a 28s walk timeout against a 15s budget is the budget's
//              own lie, visible here)
//   dists    - { n, max, sum } over the priced d= clauses
//   events   - the parsed lines in log order
export function hopCensus (lines) {
  const rows = Array.isArray(lines) ? lines.filter((l) => typeof l === 'string') : []
  const out = {
    total: 0, byWhy: {}, byBot: {}, byChest: {},
    timeouts: { open: [], walk: [] }, dists: { n: 0, max: 0, sum: 0 }, events: [],
  }
  for (const l of rows) {
    const e = parseHopZero(l)
    if (!e) continue
    out.total++
    out.byWhy[e.klass.why] = (out.byWhy[e.klass.why] || 0) + 1
    out.byBot[e.bot] = (out.byBot[e.bot] || 0) + 1
    if (e.x !== null && e.z !== null) {
      const key = `${e.x},${e.y},${e.z}`
      out.byChest[key] = (out.byChest[key] || 0) + 1
    }
    if (e.klass.why === 'open-timeout') out.timeouts.open.push(e.klass.ms)
    if (e.klass.why === 'walk-timeout') out.timeouts.walk.push(e.klass.ms)
    if (e.dist !== null) { out.dists.n++; out.dists.sum += e.dist; if (e.dist > out.dists.max) out.dists.max = e.dist }
    out.events.push(e)
  }
  return Object.assign(out, { bleed: hopZeroBleed(out.byWhy) }) // (v0.760.0) the bleed rides additively - the hop-zero's own split
}

// (v0.760.0) THE HOP-ZERO'S OWN BLEED - the zero-hop total's honest split.
// The v0.399.0 census counted every zero the same way; face 66's lane read
// 61 zeros with 6 of them 'nothing-to-deposit' - the machinery worked, the
// pocket was empty: not a delivery bleed, the delivery chain was never
// asked. THE BLEED LAW (the byWhy cells only, zero re-parsing - the
// v0.758.0 seat precedent): 'nothing-to-deposit' is the honest non-defect
// (the hop had nothing to move); every other class is the bleed. The top
// bleed why rides beside the split under the strict-majority law (a tie
// owns nothing - the storm-has-no-seat precedent) with the lever table's
// own front (the write-off levers' law - one table, the fallback honest).
// Junk never invents a bleed: a missing/empty mix reads the honest
// zero-shape; negative/non-finite counts are skipped and counted (the
// count's own junk law - never priced, never silently dropped).
export const HOP_ZERO_LEVERS = {
  'decide-timeout': 'the decider\'s own clock is the front',
  'walk-timeout': 'the walk budget is the front',
  'open-timeout': 'the chest open\'s reach is the front',
  'no-path': 'the walk lattice is the front',
  'goal-churn': 'the storm\'s own churn is the front',
  'budget-floor': 'the walk floor\'s budget is the front',
  'brake-refusal': 'the brake\'s own gate is the front',
  'unreachable-other': 'the class\'s own detail is the front',
  'other': 'the class\'s own detail is the front',
}

export function hopZeroBleed (byWhy) {
  const mix = (byWhy && typeof byWhy === 'object' && !Array.isArray(byWhy)) ? byWhy : {}
  let total = 0
  let honest = 0
  let bad = 0
  const bleedWhys = {}
  for (const [cls, n] of Object.entries(mix)) {
    if (!Number.isFinite(n) || n < 0) { bad++; continue }
    total += n
    if (cls === 'nothing-to-deposit') { honest += n; continue }
    bleedWhys[cls] = n
  }
  const bleed = total - honest
  let topUnits = 0
  let topCls = null
  for (const [cls, n] of Object.entries(bleedWhys)) {
    if (n > topUnits) { topUnits = n; topCls = cls }
  }
  const topWhy = topCls !== null && topUnits > bleed - topUnits
    ? { cls: topCls, units: topUnits, shareOfBleed: +(topUnits / bleed).toFixed(3), lever: HOP_ZERO_LEVERS[topCls] || 'the class\'s own detail is the front' }
    : null
  return { total, bleed, honest, bleedShare: total > 0 ? +(bleed / total).toFixed(3) : 0, topWhy, bad }
}
