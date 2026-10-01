// (v0.418.0) THE HOT-SPOT LENS - the failure geometry's cross-lane read.
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
//   (2) THE TOOL-LANE CHEST WALKS (walkfail.mjs parseWalkFail, v0.418.0:
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
