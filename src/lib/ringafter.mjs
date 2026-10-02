//
// ringafter.mjs - THE RING AFTERMATH (v0.493.0)
//
// What the ring landing bought. The shield ladder's own book (v0.489.0)
// stops at the ringed close - the 'sheltering from <mob>' line closes
// the episode and the story ends there. Nothing read what the landing
// then bought: did the shield hold, did the mob walk through it, did
// the bot re-ask the same question? The aftermath joins each ringed
// row forward to the bot's next boundary line:
//
//   died                        -> diedInShelter  (the ring did not save
//                                                  the bot - THE SIEVE
//                                                  when the wall was
//                                                  incomplete)
//   shelter try (same mob)      -> reShelter (same)  (the ring is a
//                                                  pause, not an end -
//                                                  the siege chain's
//                                                  link)
//   shelter try (another mob)   -> reShelter (moved) (the threat changed
//                                                  while sheltered)
//   fighting / fleeing /
//   fight-ended                 -> laneReturn     (the bot came out of
//                                                  the shelter into a
//                                                  lane - the ring ended
//                                                  on the bot's own
//                                                  terms)
//   the face's tail             -> heldTail       (the honest truncation
//                                                  - the ring held
//                                                  through the window
//                                                  end)
//
// THE COMPLETENESS LAW (the field read's spine): the one ringed-then-
// died rode an INCOMPLETE wall - face 42's F11 sheltered behind an
// arrow wall at cells 2/8 and the drowned walked the 6-cell gap to kill
// at 0.7 twelve lines later; every full-ring landing (ring 8/8) held or
// re-sheltered - nobody died behind a closed ring. n=2: the wall's
// completeness is the survival axis, and the try's own prose does not
// certify the landing (the drowned's ring try walked out as an 'arrow
// wall', the landing counted cells 2/8 - the landing's own cell count
// is the truth, never the try's ambition).
//
// THE SIEGE READ: consecutive same-mob rings for one bot - face 43's
// F11 rang the same creeper THREE times (ringed -> re-shelter -> ringed
// -> re-shelter -> ringed -> tail): the ring pauses the argument, the
// re-scan re-opens it, and only the mob's own departure (unseen at this
// n) or the window's end closes it. The re-scan tax's ringed-side twin:
// the scan re-asks after the ring too.
//
// THE FIELD READ (faces 42+43 stored artifacts, zero runner minutes,
// hand-traced then verified live): 5 ringed - died-in-shelter 1 (the
// 2/8 sieve) / re-shelter 2 (both same-mob, the creeper siege's links)
// / lane-return 0 / held-tail 2; full rings 4 / incomplete 1; deaths
// full 0 / incomplete 1. The book law: ringed = diedInShelter +
// reShelter + laneReturn + heldTail.
//
// Junk-safe: non-array / non-string-blob reads null (the smeltledger
// convention); a face with no ringed episode reads the honest zero
// shape. Pure: reads, never mutates. One parser per shape: the episode
// book is shelterLadder's own rows (this lib never re-walks the ladder
// grammar), the bot lines route via parseCombatLine (shootercensus) and
// DIED_KIND_RE (maptrip); this lib owns only the forward walk, the
// landing-wall cell read and the aftermath classes.
//

import { DIED_KIND_RE } from './maptrip.mjs'
import { parseCombatLine } from './shootercensus.mjs'
import { shelterLadder } from './shieldledger.mjs'

// the landing's own wall read - the 'sheltering' line's body carries the
// cell count ('ring 8/8' / 'arrow wall, cells 2/8'); the try's 'full
// ring' prose is ambition, the landing's count is the truth
function wallOf (line) {
  const kind = /arrow wall/.test(line) ? 'arrowwall' : 'ring'
  const m = line.match(/\b(?:ring|cells) (\d+)\/(\d+)/)
  if (!m) return { kind, cells: null, complete: null }
  const n = Number(m[1])
  const d = Number(m[2])
  return { kind, cells: [n, d], complete: n === d }
}

/**
 * ringAfter(lines) - what the ring landing bought.
 *
 * @param {string[]|string} [lines] the face log (array or raw blob)
 * @returns {null|{ringed: number, diedInShelter: number, reShelter: number,
 *   reShelterSame: number, reShelterMoved: number, laneReturn: number,
 *   heldTail: number, sieges: {chains: number, max: number},
 *   complete: {full: number, incomplete: number},
 *   deathsByWall: {full: number, incomplete: number}, rows: object[]}}
 */
export function ringAfter (lines) {
  const src = Array.isArray(lines)
    ? lines
    : (typeof lines === 'string' ? lines.split('\n') : null)
  if (!src) return null
  const ladder = shelterLadder(src)
  if (!ladder) return null
  const rows = []
  for (const r of ladder.rows) {
    if (r.outcome !== 'ringed') continue
    const wall = wallOf(src[r.closerIdx])
    const row = {
      bot: r.bot, mob: r.mob, openIdx: r.openIdx, closerIdx: r.closerIdx,
      wall, aftermath: 'heldTail', gapLines: null, reMob: null, reDist: null
    }
    for (let i = r.closerIdx + 1; i < src.length; i++) {
      const line = src[i]
      if (typeof line !== 'string') continue
      const km = line.match(DIED_KIND_RE)
      if (km && km[1] === r.bot) {
        row.aftermath = 'diedInShelter'
        row.gapLines = i - r.closerIdx
        break
      }
      const cm = parseCombatLine(line)
      if (!cm || cm.bot !== r.bot) continue
      if (cm.verb === 'shelter-try') {
        row.aftermath = 'reShelter'
        row.reMob = cm.attacker
        row.reDist = cm.dist
        row.gapLines = i - r.closerIdx
        break
      }
      if (cm.verb === 'fighting' || cm.verb === 'fleeing' || cm.verb === 'fight-ended') {
        row.aftermath = 'laneReturn'
        row.gapLines = i - r.closerIdx
        break
      }
      // every other combat verb: the shelter's own machinery or unrelated
      // prose - the aftermath keeps walking (the ringed episode is already
      // closed, the ladder's own grammar governs anything that opens anew)
    }
    rows.push(row)
  }
  const tally = { diedInShelter: 0, reShelter: 0, laneReturn: 0, heldTail: 0 }
  let reShelterSame = 0
  let reShelterMoved = 0
  const complete = { full: 0, incomplete: 0 }
  const deathsByWall = { full: 0, incomplete: 0 }
  for (const r of rows) {
    tally[r.aftermath]++
    if (r.aftermath === 'reShelter') {
      if (r.reMob === r.mob) reShelterSame++
      else reShelterMoved++
    }
    if (r.wall.complete === true) complete.full++
    else if (r.wall.complete === false) complete.incomplete++
    if (r.aftermath === 'diedInShelter') {
      if (r.wall.complete === true) deathsByWall.full++
      else if (r.wall.complete === false) deathsByWall.incomplete++
    }
  }
  // the siege read: the bot's consecutive ringed rows on the same mob
  // (open order) - a run of 2+ is the ring's pause-not-end signature
  let chains = 0
  let maxRun = 0
  const byBot = new Map()
  for (const r of rows) {
    if (!byBot.has(r.bot)) byBot.set(r.bot, [])
    byBot.get(r.bot).push(r)
  }
  for (const list of byBot.values()) {
    let run = 0
    for (let k = 1; k < list.length; k++) {
      if (list[k].mob === list[k - 1].mob) {
        run++
        if (run === 1) chains++
        if (run + 1 > maxRun) maxRun = run + 1
      } else {
        run = 0
      }
    }
  }
  return {
    ringed: rows.length,
    diedInShelter: tally.diedInShelter,
    reShelter: tally.reShelter,
    reShelterSame,
    reShelterMoved,
    laneReturn: tally.laneReturn,
    heldTail: tally.heldTail,
    sieges: { chains, max: maxRun },
    complete,
    deathsByWall,
    rows
  }
}
