// (v0.464.0) THE DEATH GROUND - the combat deaths' spatial join, the
// mob-cure's WHERE input. The shelter ledger prices HOW the combat death
// happened (the verdict join, v0.457.0); the flee fork prices WHEN-distance
// (the chase, v0.459.0); nothing ever joined the deaths to each OTHER - the
// same ground killing several bots in one face is the mob front's most
// actionable geometry (a nest harvests a radius, not a point). The join
// reads the died line's own coordinate bracket (the inference tail's
// 'at [x,y,z]' - the shape proven byte-stable across faces 36..41), combat
// kinds only (the shelter ledger's authority law: the server kind token
// says mob/explosion; the water's own kills are the o2 lane's subject, not
// a ground's). The radius is planar manhattan 12: R4 (footfall scale) never
// clusters on any held face, R24 merges distinct nests - R12 priced across
// faces 36/37/39/41: every violent face holds multi-kill grounds, the top
// grounds take 3-4 bots (face 41's [-127,397] took 4 - two skeletons' arcs
// and two drowned's chases onto one shore ground). Greedy first-fit join in
// log order (line order = time order - the emitter's own convention); the
// ground's name is its seed death's coord. The join is PLANAR (x,z) - the
// arrow arc and the chase live on the ground plane, the y rides as data.
// Mining-surface only: zero fleet wiring, zero new log lines (the 0.379.0
// precedent). Decompose is the field read; this is the pure join
// (unit-pinned, the shelterledger v0.457.0 shape).

import { DIED_KIND_RE } from './maptrip.mjs'

// the combat-side authority (the shelter ledger's own law, verbatim):
// the server kind token's family words; everything else (drown, void,
// fall...) is excluded - not this lens's subject.
const COMBAT_KIND_RE = /^(mob|explosion)\b/

// the coord join on the died line: the kind bracket then the death-place
// bracket (proven live on faces 36/37/39/41: 14/2/8/11 matches = the exact
// death counts, no context-line double-count by construction)
export const DEATH_GROUND_RE = /\[kind=(?:mob|explosion)[^\]]*\][^\[]*\[(-?\d+),(-?\d+),(-?\d+)\]/

// the killer read (the kind token's own 'by' tail - the tally names the
// ground; a bare explosion carries no killer and reads null - honest)
export const DEATH_GROUND_KILLER_RE = /\[kind=(?:mob|explosion)(?: by ([^\]]+))?\]/

// the priced radius (see the header: R4 never clusters, R24 merges nests)
export const DEATH_GROUND_RADIUS = 12

/**
 * The death ground census over a face log (pure; the decompose field
 * read). Accepts an array of lines or a raw text blob (split on newline);
 * anything else reads null (the junk convention - junk judges nothing).
 * @param {string[]|string} [lines] the face log
 * @returns {null|{combatDeaths: number, blind: number, grounds: Array<{x: number, z: number, n: number, bots: string[], killers: Object<string, number>, deaths: Array<object>}>, rows: Array<{bot: string, kind: string, killer: string|null, x: number|null, y: number|null, z: number|null, groundN: number|null}>, multiGrounds: number, singles: number}}
 */
export function deathGrounds (lines) {
  const src = Array.isArray(lines)
    ? lines
    : (typeof lines === 'string' ? lines.split('\n') : null)
  if (!src) return null
  const deaths = []
  for (const line of src) {
    if (typeof line !== 'string') continue
    const km = line.match(DIED_KIND_RE)
    if (!km) continue
    const kind = km[2]
    if (!COMBAT_KIND_RE.test(kind)) continue
    const kl = line.match(DEATH_GROUND_KILLER_RE)
    const killer = kl ? (kl[1] || null) : null
    const cm = line.match(DEATH_GROUND_RE)
    if (!cm) {
      // a combat death with no readable place - the blind bucket (honest,
      // never guessed; the inference's blindness is not a coordinate)
      deaths.push({ bot: km[1], kind, killer, x: null, y: null, z: null })
      continue
    }
    deaths.push({ bot: km[1], kind, killer, x: Number(cm[1]), y: Number(cm[2]), z: Number(cm[3]) })
  }
  const grounds = []
  let blind = 0
  for (const d of deaths) {
    if (d.x === null) { blind++; continue }
    let joined = null
    for (const g of grounds) {
      if (Math.abs(g.x - d.x) <= DEATH_GROUND_RADIUS && Math.abs(g.z - d.z) <= DEATH_GROUND_RADIUS) { joined = g; break }
    }
    if (joined) {
      joined.n++
      if (!joined.bots.includes(d.bot)) joined.bots.push(d.bot)
      if (d.killer) joined.killers[d.killer] = (joined.killers[d.killer] || 0) + 1
      joined.deaths.push(d)
    } else {
      grounds.push({ x: d.x, z: d.z, n: 1, bots: [d.bot], killers: d.killer ? { [d.killer]: 1 } : {}, deaths: [d] })
    }
    d._ground = joined || grounds[grounds.length - 1]
  }
  grounds.sort((a, b) => b.n - a.n || a.x - b.x || a.z - b.z)
  // (v0.466.0) THE CROSS-READ ROWS - each combat death with the size of the
  // ground it landed on (the ground's FINAL n - the join's own answer to
  // 'did this death share its ground?'); the blind deaths read null. The
  // rows walk the deaths in LINE order - the exact sequence the shelter
  // ledger's rows walk (the same DIED_KIND_RE anchor, the same combat-kind
  // law), so the decompose's positional join is deterministic.
  const rows = deaths.map(d => ({
    bot: d.bot, kind: d.kind, killer: d.killer, x: d.x, y: d.y, z: d.z,
    groundN: d._ground ? d._ground.n : null
  }))
  return {
    combatDeaths: deaths.length,
    blind,
    grounds,
    rows,
    multiGrounds: grounds.filter(g => g.n >= 2).length,
    singles: grounds.filter(g => g.n === 1).length
  }
}

// (v0.792.0) THE DEATH GROUND'S OWN SEAT - WHICH ground owns the combat
// death book. The census row named the grounds' counts ('ground [-140,394]
// x5 (Drowned:4 Zombie:1)' - face 81's own read: one shore nest took five
// bots) while the WHO rode raw: no row ever said WHICH ground's own deaths
// own the book (the v0.466.0 cross-read priced the SHARED share - face 81's
// 'deaths on shared grounds 12 of 17' - never the owner). THE SEAT LAW (the
// census's own ground cells only, zero re-parsing - the v0.784.0 kind-seat
// precedent, the v0.791.0 arena seat's own shape): the strict-majority law
// - a solo ground owns the book only above half (a tie owns nothing); the
// book is the grounds cells' own sum (a blind death rides no ground - the
// placed book only prices what the census placed, the blind stay the join's
// own honest outside); junk never invents a ground (a missing or non-object
// census, a grounds cell without a finite place or count, or no counted
// ground reads the honest silence - null, the decompose's own guard skips
// the row). The ground's own name is the census's own display key - the
// seed coord bracket '[x,z]' the decompose's row already speaks.
function groundTally (dg) {
  if (!dg || typeof dg !== 'object' || Array.isArray(dg)) return null
  if (!Array.isArray(dg.grounds)) return null
  const tallies = {}
  let total = 0
  for (const g of dg.grounds) {
    if (!g || typeof g !== 'object') continue
    const n = g.n
    if (!Number.isFinite(n) || n <= 0 || !Number.isFinite(g.x) || !Number.isFinite(g.z)) continue
    const key = `[${g.x},${g.z}]`
    total += n
    tallies[key] = (tallies[key] || 0) + n
  }
  return total > 0 ? { tallies, total } : null
}

export function deathGroundSeat (dg) {
  const t = groundTally(dg)
  if (!t) return null
  let topOwns = 0
  let topGround = null
  for (const [ground, n] of Object.entries(t.tallies)) {
    if (n > topOwns) { topOwns = n; topGround = ground }
  }
  if (topGround === null || topOwns <= t.total - topOwns) return null
  return { ground: topGround, owns: topOwns, ofDeaths: t.total, shareOfDeaths: +(topOwns / t.total).toFixed(3) }
}

// (v0.792.0) the ground seat's own row - THE GROUND'S OWN SEAT: the seat
// names WHICH ground owns the combat book; the nest's own geometry prices
// the mob front (a solo ground is the nest harvest's own signature - the
// cure digs there, not everywhere). Junk never prints a seat (the honest
// silence's own row law).
export function deathGroundSeatRow (seat) {
  if (!seat || typeof seat !== 'object') return null
  const { ground, owns, ofDeaths, shareOfDeaths } = seat
  if (typeof ground !== 'string' || !ground ||
      !Number.isFinite(owns) || owns <= 0 ||
      !Number.isFinite(ofDeaths) || ofDeaths <= 0 || owns > ofDeaths ||
      !Number.isFinite(shareOfDeaths)) return null
  return `the death ground's own seat (v0.792.0): ground ${ground} owns ${owns} of ${ofDeaths} combat death(s) (${(shareOfDeaths * 100).toFixed(1)}%) - THE GROUND'S OWN SEAT: one ground's own deaths own the combat book - the nest's own geometry prices the front the raw split rode unnamed`
}

// (v0.792.0) THE DEATH GROUND'S OWN RIDERS - the ground seat's own
// silence's companion. The seat names the solo ground under the
// strict-majority law; a no-majority ground mix rode raw with no row naming
// the shape. THE RIDER LAW (the census's own ground cells only, zero
// re-parsing - the seat's own precedent): a MEASURE, never a verdict-owner
// - the top two grounds' concentration prices the shape the solo law
// refused to name (the seat's owner case leaves the companion unprinted -
// the decompose's own branch law). Junk never invents a shape: a missing or
// non-object census, a grounds cell without a finite place or count, or
// fewer than two counted grounds reads the honest silence (null). The order
// is deterministic (count desc, then the ground's own byte: the key's own
// lexicographic law - '[-125,394]' < '[-140,394]').
export function deathGroundRiders (dg) {
  const t = groundTally(dg)
  if (!t) return null
  const ranked = Object.entries(t.tallies).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
  if (ranked.length < 2) return null
  const [leader, leaderOwns] = ranked[0]
  const [runner, runnerOwns] = ranked[1]
  const pairOwns = leaderOwns + runnerOwns
  return { leader, leaderOwns, runner, runnerOwns, ofDeaths: t.total, pairOwns, shareOfDeaths: +(pairOwns / t.total).toFixed(3), duet: leaderOwns === runnerOwns }
}

// (v0.792.0) the ground riders' own row - THE GROUND'S OWN MIX: a measure
// of the shape, never a named owner (the seat's tie law holds); the pair
// prices the concentration the solo law refused to seat. Junk never prints
// a shape (the honest silence's own row law).
export function deathGroundRidersRow (r) {
  if (!r || typeof r !== 'object') return null
  const { leader, leaderOwns, runner, runnerOwns, ofDeaths, pairOwns, shareOfDeaths } = r
  if (typeof leader !== 'string' || !leader || typeof runner !== 'string' || !runner ||
      !Number.isFinite(leaderOwns) || leaderOwns <= 0 || !Number.isFinite(runnerOwns) || runnerOwns <= 0 ||
      !Number.isFinite(ofDeaths) || ofDeaths <= 0 || !Number.isFinite(pairOwns) || pairOwns > ofDeaths ||
      !Number.isFinite(shareOfDeaths)) return null
  return `the death ground's own riders (v0.792.0): no solo ground owns the majority - ground ${leader} x${leaderOwns} + ground ${runner} x${runnerOwns} own ${pairOwns} of ${ofDeaths} combat death(s) (${(shareOfDeaths * 100).toFixed(1)}%) - THE GROUND'S OWN MIX: the seat's tie law held, the mix is the shape - the grounds' own geometry prices the book the solo law refused to seat`
}
