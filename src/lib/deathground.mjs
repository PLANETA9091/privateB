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
 * @returns {null|{combatDeaths: number, blind: number, grounds: Array<{x: number, z: number, n: number, bots: string[], killers: Object<string, number>, deaths: Array<object>}>, multiGrounds: number, singles: number}}
 */
export function deathGrounds (lines) {
  const rows = Array.isArray(lines)
    ? lines
    : (typeof lines === 'string' ? lines.split('\n') : null)
  if (!rows) return null
  const deaths = []
  for (const line of rows) {
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
  }
  grounds.sort((a, b) => b.n - a.n || a.x - b.x || a.z - b.z)
  return {
    combatDeaths: deaths.length,
    blind,
    grounds,
    multiGrounds: grounds.filter(g => g.n >= 2).length,
    singles: grounds.filter(g => g.n === 1).length
  }
}
