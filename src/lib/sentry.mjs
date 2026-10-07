// (v0.422.0) THE SENTRY LENS - the drowning sentry's per-pass read, the
// water lane's first census. The fleet's log families every other lane got
// a lens for (walk-fail v0.410.0, hop v0.399.0, bank v0.404.0, drop v0.412.0,
// map-trip v0.415.0, deficits v0.417.0, hot-spot v0.419.0) - and the WATER
// family, the largest unread block in the field (331 pass lines + 182
// rescue verdicts + 101 drowning lines across face 26/27 alone), stayed
// dark. The pass line is the sentry's own heartbeat: every rescue page
// stamps what the bot sees - head state, the shore scan's verdict, the
// map's land bearing, the altitude, the air bar, the standing probes, the
// planar spot.
//
// THE FIELD SHAPES (pinned by the emitter, miner.mjs's v0.81.0 pass line +
// v0.268.0's o2SensorLabel join, not assumed):
//   F12 [F12] water: pass 4 head=dry shore=hit r=3 land=none y=62.1 o2=20
//     probes=0 at=[-151,62,396]          - the shore scan SAW land at r=3
//   F7 [F7] water: pass 0 head=wet shore=none land=n/a y=51.1 o2=3
//     probes=0 at=[-135,51,424]          - the BLIND form (wet head, no
//     shore, no land: 'no ground truth ever gathered' - F10's own words)
//   F5 [F5] water: pass 7 head=dry shore=none land=birch_log d=5 y=50.4
//     o2=19 probes=0 at=[-115,50,397]    - the LEDGERED form: the shore
//     scan came up empty but the map still names land at d=5
// The land slot's three forms are INDEPENDENT reads (emitter lines 1909-1923:
// the shore hit and the map bearing are separate scans - shore=hit keeps
// land=null, the field's 165/165 land=none-with-hit is the DRY head's own
// 'none', not a pairing law) - the census counts the combinations, never
// assumes them.
//   o2 rides o2SensorLabel (drowning.mjs): a number, the -1 sentinel as
// 'reset(-1)' (the stale-bar family), or '?' (a non-number was never a
// measurement - the v0.249.0 junk pin). All three shapes parse; only the
// numeric feeds the o2 arc.
//
// THE THRESHOLDS are the code's own, imported (one truth - the DROP CLOCK
// v0.415.0 reusing walkfail's decideClock, the same law): critical = 
// OXYGEN_CRITICAL_LEVEL (drowning.mjs, 4 - 'the critical bypass voids the
// armed hold' F6 class), rescueBand = OXYGEN_RESCUE_LEVEL (10 - the rescue
// trigger the sentry pages at). The census never invents a bucket the
// policy does not own.
//
// THE DESIGN QUESTIONS per face: how much of the sentry's life is BLIND
// (the shore-blind + land-less share - F10's '0 shore scans hit' signature,
// mechanical now), how deep the air bar dips (the o2 arc: at0/at20/critical
// - the drowning clock's own economy), whether the same planar spot eats
// pass after pass (the spots row - planar x,z, the y first-seen altitude:
// the HOT-SPOT LENS v0.419.0's own key law, joinable to its cross-lane
// read). Pure parser, unit-pinned (the walk-fail v0.410.0 shape); decompose
// is its field read. Mining-surface only: zero fleet wiring, zero new log
// lines - the v0.379.0 precedent. Junk-safe end to end: non-string rows
// skipped, a 'water: pass' line that fails the full grammar counts
// unparsed (the escape hatch - counted, never silently dropped); every
// other lane's lines (rescue verdicts, frozen physics, the deficits row,
// the hop zeros) REJECTED - one parser per emitter, the v0.409.0 law.

import { OXYGEN_CRITICAL_LEVEL, OXYGEN_RESCUE_LEVEL } from './drowning.mjs'

export const SENTRY_PASS_RE = /^(F\d+) \[\1\] water: pass (\d+) head=(wet|dry) shore=(?:hit r=(\d+)|none) land=(?:([a-z][a-z0-9_]*) d=(\d+)|(n\/a|none)) y=(-?\d+\.\d) o2=(\d+|reset\(-1\)|\?) probes=(\d+) at=\[(-?\d+),(-?\d+),(-?\d+)\]$/

/**
 * Parse one sentry pass line. Returns null on every non-match (junk, the
 * other lanes' shapes, prose, a pass line with a broken tail). Fields ride
 * the emitter's own grammar:
 *   bot, pass (int), head ('wet'|'dry'), shore ('hit'|'none'),
 *   r (int|null - the hit radius; null on shore=none),
 *   landKind ('known'|'na'|'none'), landName (string|null), landD (int|null),
 *   y (float, the emitter's own toFixed(1)),
 *   o2 {kind: 'value'|'reset'|'unknown', value: int|null},
 *   probes (int), at {x, y, z} (ints).
 */
export function parseSentryPass (line) {
  const m = typeof line === 'string' ? line.match(SENTRY_PASS_RE) : null
  if (!m) return null
  const o2Raw = m[9]
  let o2
  if (o2Raw === 'reset(-1)') o2 = { kind: 'reset', value: null }
  else if (o2Raw === '?') o2 = { kind: 'unknown', value: null }
  else o2 = { kind: 'value', value: Number(o2Raw) }
  const known = m[5] !== undefined
  return {
    bot: m[1],
    pass: Number(m[2]),
    head: m[3],
    shore: m[4] !== undefined ? 'hit' : 'none',
    r: m[4] !== undefined ? Number(m[4]) : null,
    landKind: known ? 'known' : (m[7] === 'n/a' ? 'na' : 'none'),
    landName: known ? m[5] : null,
    landD: known ? Number(m[6]) : null,
    y: Number(m[8]),
    o2,
    probes: Number(m[10]),
    at: { x: Number(m[11]), y: Number(m[12]), z: Number(m[13]) }
  }
}

function bump (map, key) {
  if (key == null) return
  map[key] = (map[key] ?? 0) + 1
}

/**
 * The census: the ordered log stream into one junk-safe read.
 * - passes/byBot/episodes (the pass-0 re-arms)/passMax.
 * - byHead: the wet/dry share.
 * - shore: hit/none counts + the hit-radius series r {n,max,sum}.
 * - sight: THE LENS'S PAYOFF - hit (the shore scan saw land), ledgered
 *   (shore blind, the map named land), blind (no shore, no land - the
 *   'no ground truth' class, F10's frozen dive signature).
 * - land: known/byLand/d-series for the ledgered form, na/none for the
 *   bare forms (counted honestly, never folded into 'known').
 * - o2: the numeric arc (min/max/sum/n + at20 + at0 + the code's own
 *   critical/rescueBand buckets via drowning.mjs's constants) + the
 *   reset/unknown sentinel counts (evidence, never folded into values).
 * - spots: the planar x,z rows (total desc, then key asc - the hotspot
 *   determinism law), y first-seen, bots named.
 * - unparsed: pass-shaped lines that failed the grammar.
 */
export function sentryCensus (lines) {
  const out = {
    passes: 0,
    byBot: {},
    episodes: 0,
    passMax: null,
    byHead: { wet: 0, dry: 0 },
    shore: { hit: 0, none: 0, r: { n: 0, max: null, sum: 0 } },
    sight: { hit: 0, ledgered: 0, blind: 0 },
    land: { known: 0, byLand: {}, d: { n: 0, max: null, sum: 0 }, na: 0, none: 0 },
    o2: { min: null, max: null, sum: 0, n: 0, at20: 0, at0: 0, critical: 0, rescueBand: 0, reset: 0, unknown: 0 },
    spots: [],
    unparsed: 0
  }
  if (!Array.isArray(lines)) return out
  const spots = new Map()
  for (const line of lines) {
    if (typeof line !== 'string') continue
    const p = parseSentryPass(line)
    if (!p) {
      if (line.includes(' water: pass ')) out.unparsed++ // the escape hatch
      continue
    }
    out.passes++
    bump(out.byBot, p.bot)
    if (p.pass === 0) out.episodes++
    if (out.passMax === null || p.pass > out.passMax) out.passMax = p.pass
    out.byHead[p.head] = (out.byHead[p.head] ?? 0) + 1
    if (p.shore === 'hit') {
      out.shore.hit++
      out.sight.hit++
      out.shore.r.n++
      out.shore.r.sum += p.r
      if (out.shore.r.max === null || p.r > out.shore.r.max) out.shore.r.max = p.r
    } else {
      out.shore.none++
      if (p.landKind === 'known') { out.sight.ledgered++ } else { out.sight.blind++ }
    }
    if (p.landKind === 'known') {
      out.land.known++
      bump(out.land.byLand, p.landName)
      out.land.d.n++
      out.land.d.sum += p.landD
      if (out.land.d.max === null || p.landD > out.land.d.max) out.land.d.max = p.landD
    } else if (p.landKind === 'na') out.land.na++
    else out.land.none++
    if (p.o2.kind === 'value') {
      const v = p.o2.value
      out.o2.n++
      out.o2.sum += v
      if (out.o2.min === null || v < out.o2.min) out.o2.min = v
      if (out.o2.max === null || v > out.o2.max) out.o2.max = v
      if (v === 20) out.o2.at20++
      if (v === 0) out.o2.at0++
      if (v <= OXYGEN_CRITICAL_LEVEL) out.o2.critical++
      if (v <= OXYGEN_RESCUE_LEVEL) out.o2.rescueBand++
    } else if (p.o2.kind === 'reset') out.o2.reset++
    else out.o2.unknown++
    const key = `${p.at.x},${p.at.z}`
    let spot = spots.get(key)
    if (!spot) { spot = { key, total: 0, bots: {}, y: null }; spots.set(key, spot) }
    spot.total++
    if (spot.y === null) spot.y = p.y
    bump(spot.bots, p.bot)
  }
  out.spots = [...spots.values()].sort((a, b) => b.total - a.total || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
  return out
}

// (v0.797.0) THE SIGHT'S OWN SEAT - WHICH sight class owns the
// ground-truth book. Face 84 (37694318753, the zero-death calm) rode the
// raw split 'sight: hit 88, ledgered 11 (oak_log:11), blind 106' - 205
// passes and no row ever said WHICH class owns the book, while the
// ground-truth prose named only the blind class's own meaning (the pass
// never saw shore or land). THE SEAT LAW (the census's own sight cell
// only, zero re-parsing - the v0.784.0 kind-seat precedent, the v0.792.0
// attacker seat's own shape): the strict-majority law - a solo class owns
// the book only above half (a tie owns nothing); the book is the sight
// cell's own sum (hit + ledgered + blind); junk never invents a class (a
// missing or non-object census/cell, a non-finite or non-positive count,
// or a zero book reads the honest silence - null). The names are the
// census's own bytes ('blind' < 'hit' < 'ledgered').
function sightTally (census) {
  if (!census || typeof census !== 'object' || Array.isArray(census)) return null
  const sight = census.sight
  if (!sight || typeof sight !== 'object' || Array.isArray(sight)) return null
  const tallies = {}
  let total = 0
  for (const [cls, n] of Object.entries(sight)) {
    if (!Number.isFinite(n) || n <= 0) continue
    total += n
    tallies[cls] = (tallies[cls] || 0) + n
  }
  return total > 0 ? { tallies, total } : null
}

export function sentrySightSeat (census) {
  const t = sightTally(census)
  if (!t) return null
  let topUnits = 0
  let topClass = null
  for (const [cls, n] of Object.entries(t.tallies)) {
    if (n > topUnits) { topUnits = n; topClass = cls }
  }
  if (topClass === null || topUnits <= t.total - topUnits) return null
  return { sight: topClass, owns: topUnits, ofPasses: t.total, share: +(topUnits / t.total).toFixed(3) }
}

// (v0.797.0) the sight seat's own row - THE SIGHT'S OWN SEAT: the seat
// names WHICH sight class owns the ground-truth book; the class's own
// front prices the cure (the blind majority is the mid-episode crowd's
// own root - the shore-scan and the map lanes price it). Junk never
// prints a seat (the honest silence's own row law).
export function sentrySightSeatRow (seat) {
  if (!seat || typeof seat !== 'object') return null
  const { sight, owns, ofPasses, share } = seat
  if (typeof sight !== 'string' || !sight ||
      !Number.isFinite(owns) || owns <= 0 ||
      !Number.isFinite(ofPasses) || ofPasses <= 0 || owns > ofPasses ||
      !Number.isFinite(share)) return null
  return `the sight's own seat (v0.797.0): ${sight} owns ${owns} of ${ofPasses} sight class(es) (${(share * 100).toFixed(1)}%) - THE SIGHT'S OWN SEAT: one sight class's own passes own the ground-truth book - the class's own front prices the water the raw split rode unnamed`
}

// (v0.797.0) THE SIGHT'S OWN RIDERS - the seat's own silence's companion.
// The seat names the solo class under the strict-majority law; a
// no-majority sight mix rode raw with no row naming the shape. THE RIDER
// LAW (the census's own sight cell only, zero re-parsing - the seat's own
// precedent): a MEASURE, never a verdict-owner - the top two classes'
// concentration prices the shape the solo law refused to name (the
// seat's owner case leaves the companion unprinted - the decompose's own
// branch law). Junk never invents a shape: a missing or non-object
// census/cell, a non-finite or non-positive count, or fewer than two
// counted classes reads the honest silence (null). The order is
// deterministic (count desc, then the class's own byte: 'blind' < 'hit'
// < 'ledgered').
export function sentrySightRiders (census) {
  const t = sightTally(census)
  if (!t) return null
  const ranked = Object.entries(t.tallies).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
  if (ranked.length < 2) return null
  const [leader, leaderOwns] = ranked[0]
  const [runner, runnerOwns] = ranked[1]
  const pairOwns = leaderOwns + runnerOwns
  return { leader, leaderOwns, runner, runnerOwns, ofPasses: t.total, pairOwns, share: +(pairOwns / t.total).toFixed(3), duet: leaderOwns === runnerOwns }
}

// (v0.797.0) the sight riders' own row - THE SIGHT'S OWN MIX: a measure
// of the shape, never a named owner (the seat's tie law holds); the pair
// prices the concentration the solo law refused to seat. Junk never
// prints a shape (the honest silence's own row law).
export function sentrySightRidersRow (r) {
  if (!r || typeof r !== 'object') return null
  const { leader, leaderOwns, runner, runnerOwns, ofPasses, pairOwns, share } = r
  if (typeof leader !== 'string' || !leader || typeof runner !== 'string' || !runner ||
      !Number.isFinite(leaderOwns) || leaderOwns <= 0 || !Number.isFinite(runnerOwns) || runnerOwns <= 0 ||
      !Number.isFinite(ofPasses) || ofPasses <= 0 || !Number.isFinite(pairOwns) || pairOwns > ofPasses ||
      !Number.isFinite(share)) return null
  return `the sight's own riders (v0.797.0): no solo class owns the majority - ${leader} x${leaderOwns} + ${runner} x${runnerOwns} own ${pairOwns} of ${ofPasses} sight class(es) (${(share * 100).toFixed(1)}%) - THE SIGHT'S OWN MIX: the seat's tie law held, the mix is the shape - the classes' own crowd prices the water the solo law refused to name`
}
