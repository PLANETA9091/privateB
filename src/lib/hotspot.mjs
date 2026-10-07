// (v0.419.0) THE HOT-SPOT LENS - the failure geometry's cross-lane read.
// The cure-pricing brief (the 2230 fire) named the spatial read the
// concurrency-aware decide budget's alternative: the decide clock (v0.413.0)
// prices WHEN the cohort lives, this lens prices WHERE it lives. The field
// already answered the join question on face 26 (36864564525): the tool
// lane's own walk label read 'iron commune walk @-118,412: timeout' while
// the hop lane's zeros read 'chest at [-118,65,412]' - THE SAME PLANAR
// SPOT failing in TWO lanes, and no census connected them (the walk-fail
// lens v0.410.0 drops the @coord, the hop census v0.399.0 keys chests only
// inside its own lane's byChest).
//
// THE THREE POSITION SERIES (each read by its OWN lane's existing parser -
// one parser per emitter, the v0.409.0 law; this lens only JOINS):
//   (1) THE HOP ZEROS (hopcensus.mjs parseHopZero) - the chest's absolute
//       [x,y,z]; the planar key is x,z (the y rides as the spot's first-seen
//       altitude); the '?' placeholder positions carry no bucket (the
//       no-position-no-bucket law, hopcensus's own).
//   (2) THE TOOL-LANE CHEST WALKS (walkfail.mjs parseWalkFail, v0.419.0:
//       the parser now returns the raw why so the @coord survives) - the
//       walk's own label '@x,z' inside the why text; absent coord = the
//       unpositioned bucket (never invented).
//   (3) THE BANK WALK-BACKS (bankfail.mjs parseBankWalkBack) - RELATIVE
//       dists from the yard, no absolute key: they join the row as their
//       own {n,max,sum} series, NEVER as spots (mixing relative and
//       absolute keys would forge positions the log never named).
// The sweep verdicts carry no positions at all - entirely outside this
// lens (walkfail's own lane reads them).
//
// THE SPOT ROW: per planar spot - total, byLane (hop vs the tool lanes),
// byWhy (the classified families), bots, y (null for tool-only spots).
// crossLaneSpots = spots hit by 2+ distinct lanes - THE HOT-SPOT
// SIGNATURE the lens exists for: the same geometry starving multiple
// walkers is a geometry problem (the terrain/obstruction cure's design
// input), a single-lane spot is that lane's own walk problem.
//
// Pure parser, unit-pinned (the walk-fail v0.410.0 shape); decompose is
// its field read. Mining-surface only: zero fleet wiring, zero new log
// lines - the v0.379.0 precedent. Junk-safe end to end: non-string rows
// skipped, absent positions read the honest zero.

// (v0.421.0) THE HOT-SPOT BAND - the lens's second read: the strip, not
// just the point. The field's own three-sample read (faces 26/27/23) showed
// the failures CONCENTRATING in the -12x,38x..41x band while the per-spot
// rows splintered one obstruction across ADJACENT planar keys (face 27:
// [-121,389] hop-only x5 + cross-lane [-122,389] x3 + [-123,389] x2 - one
// ground, three spots, the signature diluted). Neighboring spots within
// HOT_SPOT_BAND_RADIUS (manhattan) collapse into bands: the yard rows pack
// chests 1-2 blocks apart (toolupgrade's own breaker note), so radius 4
// chains a row without swallowing the whole yard. Union-find (single
// linkage) - a band IS an elongated structure, transitivity is the point.
// Per band: key (lexicographically smallest member), spots (member keys),
// total, byLane, byWhy, bots, crossLane (2+ distinct lanes - the strip
// starving multiple walkers, the band-level geometry signature). Spots
// with no parseable x,z key never band and never band others (the lens's
// no-position-no-bucket law). Pure: the input row is read, never written.
// WHY BANDS, not a static admission (the (a)-vs-(b) pricing): the failing
// spots are world data - findChest (deposit.mjs) hands BOTH lanes the same
// yard chest pool and the obstruction is whatever terrain this face's
// worldgen put beside it; the code has no coordinate to admit. The band
// keeps the read mechanical and the cure's design input measurable per
// face instead of hardcoding coordinates the next reset erases.

import { parseWalkFail } from './walkfail.mjs'
import { parseHopZero } from './hopcensus.mjs'
import { parseBankWalkBack } from './bankfail.mjs'

// The walk's own @x,z label - the tool lanes stamp their chest-walk fails
// with the walk's start position ('iron commune walk @-118,404: timeout
// after 528ms'). The nudge-retry variant nests it deeper
// ('fuel commons walk @-148,412 (nudge retry): timeout after 2784ms') -
// the FIRST @coord in the why is the walk's own stamp (later matches, if
// any, would be the reason's own prose).
export const HOT_SPOT_COORD_RE = /@(-?\d+),(-?\d+)/

export function parseSpotCoord (raw) {
  if (typeof raw !== 'string') return null
  const m = raw.match(HOT_SPOT_COORD_RE)
  if (!m) return null
  return { x: Number(m[1]), z: Number(m[2]) }
}

function bump (map, key, n = 1) {
  if (key == null) return
  map[key] = (map[key] ?? 0) + n
}

export function hotspotCensus (lines) {
  const spots = new Map()
  const out = {
    spots: [], crossLaneSpots: 0, spotTotal: 0,
    unpositioned: { hop: 0, walkFails: 0 },
    bankDists: { n: 0, max: 0, sum: 0 },
    totals: { hop: 0, walkFails: 0, bankWalkBacks: 0 },
  }
  if (!Array.isArray(lines)) return out
  for (const l of lines) {
    if (typeof l !== 'string') continue
    // (1) THE HOP LANE - the chest's absolute spot.
    const hz = parseHopZero(l)
    if (hz) {
      out.totals.hop++
      if (hz.x === null || hz.z === null) {
        out.unpositioned.hop++
        continue
      }
      const key = `${hz.x},${hz.z}`
      let spot = spots.get(key)
      if (!spot) { spot = { key, total: 0, byLane: {}, byWhy: {}, bots: {}, y: null }; spots.set(key, spot) }
      spot.total++
      if (spot.y === null && hz.y !== null) spot.y = hz.y
      bump(spot.byLane, 'hop')
      bump(spot.byWhy, hz.klass?.why ?? 'other')
      bump(spot.bots, hz.bot)
      continue
    }
    // (2) THE TOOL LANE CHEST WALKS - the walk's own @x,z stamp.
    const wf = parseWalkFail(l)
    if (wf) {
      out.totals.walkFails++
      const coord = parseSpotCoord(wf.raw)
      if (!coord) { out.unpositioned.walkFails++; continue }
      const key = `${coord.x},${coord.z}`
      let spot = spots.get(key)
      if (!spot) { spot = { key, total: 0, byLane: {}, byWhy: {}, bots: {}, y: null }; spots.set(key, spot) }
      spot.total++
      bump(spot.byLane, wf.lane)
      bump(spot.byWhy, wf.why)
      bump(spot.bots, wf.bot)
      continue
    }
    // (3) THE BANK WALK-BACKS - the relative series, never a spot.
    const bw = parseBankWalkBack(l)
    if (bw) {
      out.totals.bankWalkBacks++
      out.bankDists.n++
      out.bankDists.sum += bw.dist
      if (bw.dist > out.bankDists.max) out.bankDists.max = bw.dist
    }
  }
  // The spots row - total desc, then the key for determinism.
  out.spots = [...spots.values()].sort((a, b) => b.total - a.total || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
  out.spotTotal = out.spots.reduce((s, sp) => s + sp.total, 0)
  out.crossLaneSpots = out.spots.filter((sp) => Object.keys(sp.byLane).length >= 2).length
  return out
}

// The yard rows pack chests 1-2 blocks apart - radius 4 (manhattan) chains
// a row without swallowing the whole yard (the face-27 strip reads -121..-123
// at z=389 as ONE band; a yard-wide merge would hide which row).
export const HOT_SPOT_BAND_RADIUS = 4

function parseSpotKey (key) {
  if (typeof key !== 'string') return null
  const parts = key.split(',')
  if (parts.length !== 2) return null
  const x = Number(parts[0])
  const z = Number(parts[1])
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null
  return { x, z }
}

function mergeCounts (target, src) {
  if (!src || typeof src !== 'object') return target
  for (const [k, n] of Object.entries(src)) target[k] = (target[k] ?? 0) + (Number.isFinite(n) ? n : 0)
  return target
}

export function hotspotBands (spots, { radius } = {}) {
  const r = Number.isFinite(radius) && radius > 0 ? radius : HOT_SPOT_BAND_RADIUS
  const out = { bands: [], bandTotal: 0, bandSpots: 0, singleSpots: 0, spotTotal: 0, radius: r }
  if (!Array.isArray(spots)) return out
  const pts = []
  for (const sp of spots) {
    if (!sp || typeof sp !== 'object') continue
    const p = parseSpotKey(sp.key)
    if (!p) continue // no position, no band - the lens's own law
    pts.push({ sp, p })
  }
  out.spotTotal = pts.reduce((s, e) => s + (Number.isFinite(e.sp.total) ? e.sp.total : 0), 0)
  // Union-find (single linkage): two spots are band-mates when their
  // planar manhattan distance is within the radius - the chain matters.
  const parent = pts.map((_, i) => i)
  const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i] } return i }
  const union = (a, b) => { const ra = find(a); const rb = find(b); if (ra !== rb) parent[ra] = rb }
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      if (Math.abs(pts[i].p.x - pts[j].p.x) + Math.abs(pts[i].p.z - pts[j].p.z) <= r) union(i, j)
    }
  }
  const groups = new Map()
  for (let i = 0; i < pts.length; i++) {
    const root = find(i)
    if (!groups.has(root)) groups.set(root, [])
    groups.get(root).push(pts[i])
  }
  for (const members of groups.values()) {
    if (members.length < 2) { out.singleSpots++; continue } // a lone spot is not a band
    const keys = members.map((m) => m.sp.key).sort()
    const band = { key: keys[0], spots: keys, total: 0, byLane: {}, byWhy: {}, bots: {}, crossLane: false }
    for (const m of members) {
      if (Number.isFinite(m.sp.total)) band.total += m.sp.total
      mergeCounts(band.byLane, m.sp.byLane)
      mergeCounts(band.byWhy, m.sp.byWhy)
      mergeCounts(band.bots, m.sp.bots)
    }
    band.crossLane = Object.keys(band.byLane).length >= 2
    out.bands.push(band)
  }
  // total desc, then the key for determinism - the spots row's own order.
  out.bands.sort((a, b) => b.total - a.total || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
  out.bandTotal = out.bands.reduce((s, b) => s + b.total, 0)
  out.bandSpots = out.bands.reduce((s, b) => s + b.spots.length, 0)
  return out
}

// (v0.794.0) THE HOT SPOT'S OWN SEAT - WHICH spot owns the starvation
// book. The census row named the spots' counts ('spot [-110,409] y=71 x6
// (hop:5 iron commune:1)' - face 82's own read: 27 spots holding 60
// failures) while the WHO rode raw: no row ever said WHICH spot's own
// failures own the book (the v0.421.0 bands merged the neighbors, the
// v0.419.0 signature named the CROSS-LANE shape - never the owner spot).
// THE SEAT LAW (the census's own spot cells only, zero re-parsing - the
// v0.784.0 kind-seat precedent, the v0.793.0 ground seat's own geometry
// shape): the strict-majority law - a solo spot owns the book only above
// half (a tie owns nothing); the book is the spot cells' own sum (an
// unpositioned failure rides no spot - the '?' placeholder and the
// @coord-less walk-fail stay the census's own honest outside); junk never
// invents a spot (a missing or non-object census, a spot cell without a
// finite count or a key, or no counted spot reads the honest silence -
// null, the decompose's own guard skips the row). The spot's own name is
// the census's own key ('x,z' - the row's display adds the brackets the
// decompose already speaks).
function spotTally (hs) {
  if (!hs || typeof hs !== 'object' || Array.isArray(hs)) return null
  if (!Array.isArray(hs.spots)) return null
  const tallies = {}
  let total = 0
  for (const sp of hs.spots) {
    if (!sp || typeof sp !== 'object') continue
    const n = sp.total
    if (!Number.isFinite(n) || n <= 0 || typeof sp.key !== 'string' || !sp.key) continue
    total += n
    tallies[sp.key] = (tallies[sp.key] || 0) + n
  }
  return total > 0 ? { tallies, total } : null
}

export function hotSpotSeat (hs) {
  const t = spotTally(hs)
  if (!t) return null
  let topOwns = 0
  let topSpot = null
  for (const [spot, n] of Object.entries(t.tallies)) {
    if (n > topOwns) { topOwns = n; topSpot = spot }
  }
  if (topSpot === null || topOwns <= t.total - topOwns) return null
  return { spot: topSpot, owns: topOwns, ofFailures: t.total, shareOfFailures: +(topOwns / t.total).toFixed(3) }
}

// (v0.794.0) the spot seat's own row - THE SPOT'S OWN SEAT: the seat names
// WHICH spot owns the starvation book; the yard's own map prices the cure
// (a solo spot is the one yard's own walk problem - the bands price the
// strips, the seat prices the point). Junk never prints a seat (the honest
// silence's own row law).
export function hotSpotSeatRow (seat) {
  if (!seat || typeof seat !== 'object') return null
  const { spot, owns, ofFailures, shareOfFailures } = seat
  if (typeof spot !== 'string' || !spot ||
      !Number.isFinite(owns) || owns <= 0 ||
      !Number.isFinite(ofFailures) || ofFailures <= 0 || owns > ofFailures ||
      !Number.isFinite(shareOfFailures)) return null
  return `the hot spot's own seat (v0.794.0): spot [${spot}] owns ${owns} of ${ofFailures} failure(s) (${(shareOfFailures * 100).toFixed(1)}%) - THE SPOT'S OWN SEAT: one spot's own failures own the starvation book - the yard's own map prices the cure the raw split rode unnamed`
}

// (v0.794.0) THE HOT SPOT'S OWN RIDERS - the spot seat's own silence's
// companion. The seat names the solo spot under the strict-majority law; a
// no-majority spot crowd rode raw with no row naming the shape (face 82's
// own read: a 27-spot crowd - the yard starves everywhere, the top pair
// still only 10 of 60). THE RIDER LAW (the census's own spot cells only,
// zero re-parsing - the seat's own precedent): a MEASURE, never a
// verdict-owner - the top two spots' concentration prices the shape the
// solo law refused to name (the seat's owner case leaves the companion
// unprinted - the decompose's own branch law). Junk never invents a shape:
// a missing or non-object census, a spot cell without a finite count or a
// key, or fewer than two counted spots reads the honest silence (null).
// The order is deterministic (count desc, then the key's own byte:
// '-129,389' < '-140,411').
export function hotSpotRiders (hs) {
  const t = spotTally(hs)
  if (!t) return null
  const ranked = Object.entries(t.tallies).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
  if (ranked.length < 2) return null
  const [leader, leaderOwns] = ranked[0]
  const [runner, runnerOwns] = ranked[1]
  const pairOwns = leaderOwns + runnerOwns
  return { leader, leaderOwns, runner, runnerOwns, ofFailures: t.total, pairOwns, shareOfFailures: +(pairOwns / t.total).toFixed(3), duet: leaderOwns === runnerOwns }
}

// (v0.794.0) the spot riders' own row - THE SPOT'S OWN MIX: a measure of
// the shape, never a named owner (the seat's tie law holds); the pair
// prices the concentration the solo law refused to seat. Junk never prints
// a shape (the honest silence's own row law).
export function hotSpotRidersRow (r) {
  if (!r || typeof r !== 'object') return null
  const { leader, leaderOwns, runner, runnerOwns, ofFailures, pairOwns, shareOfFailures } = r
  if (typeof leader !== 'string' || !leader || typeof runner !== 'string' || !runner ||
      !Number.isFinite(leaderOwns) || leaderOwns <= 0 || !Number.isFinite(runnerOwns) || runnerOwns <= 0 ||
      !Number.isFinite(ofFailures) || ofFailures <= 0 || !Number.isFinite(pairOwns) || pairOwns > ofFailures ||
      !Number.isFinite(shareOfFailures)) return null
  return `the hot spot's own riders (v0.794.0): no solo spot owns the majority - spot [${leader}] x${leaderOwns} + spot [${runner}] x${runnerOwns} own ${pairOwns} of ${ofFailures} failure(s) (${(shareOfFailures * 100).toFixed(1)}%) - THE SPOT'S OWN MIX: the seat's tie law held, the mix is the shape - the spots' own geometry prices the book the solo law refused to seat`
}
