// (v0.647.0) THE DEATH-DROP CENSUS - the deathdrop class's own aggregate,
// the deathsweep family's next seat (the v0.389.0 honest-sweep and the
// v0.464.0 death-ground precedents: mining-surface only, zero fleet wiring,
// zero new log lines).
//
// WHY: face 37239853197 (the v0.644.0 tree, the wet storm) priced the class
// again: 7 deaths, the v0.199.0 death-drop lines naming ~714u scattered at
// the corpse sites, the loot ledger reading unaccounted=469u - the death
// drops are the unaccounted's dominant NAMED carrier. The fleet's own
// recovery lane (the v0.201.0 re-loot walk) spoke for exactly ONE of the
// seven (F18 - the 0u empty-pocket read); the six mass piles (113/156/39/
// 218/34/154u) rode NO reloot row at all - 'the reloot lane: arms 1,
// arrivals 0 - the dropped mass sits where it fell' (the decompose read).
// The silence is uncounted: every held face prices the deaths and the
// stakes, none prices whether the lane SPOKE. This census makes the
// silence countable - the next cure's evidence seat (a wiring read needs
// its own face priced by this lens first).
//
// THE THREE SHAPES (face-pinned on 37239853197 / 37237898451 / 37235900235):
//   'F14 [F14] died - respawning (cause: server: drowned [kind=drown] | ...)'
//     - the death announce (the v0.389.0 double-tag anatomy, imported -
//     the sibling-shape law: the sweep and the census read one truth)
//   'F14 [F14] death drop: ~113u lost at [-141,60,394] (sand 29, ...)'
//   'F18 [F18] death drop: pocket read empty at death (0u)'  - the EMPTY
//     form: a counted death with no mass, its own sub-class, not a skip
//   'F14 reloot: walking to the own death spot [-141,60,394] (...)'  - the
//     lane's voice; every ladder row (no walk (unarmed|night|why), walking,
//     no-path retry, arrived, retry failed, write-off, rim dig, surface
//     retry) carries the same 'F<N> reloot: ' head - one prefix is the lane
//
// THE JOIN LAW: line order is time order (the emitter's own convention,
// the death-ground's law). A death's stake is the death-drop row that
// FOLLOWS it for the same bot (the announce and the drop ride the same
// event, the drop is the stake's only mass read). The lane's voice is the
// bot's reloot rows AFTER that drop row - an arm row from a PREVIOUS death
// (F18's earlier ladder) never counts for a later one. A mass stake with
// no lane row after it is the SILENT class - the census's own name. A 0u
// empty read joins as armed-by-shape only if the lane spoke; its mass is
// 0 either way (the empty reads are counted, never summed as losses).
//
// Mining-surface only: zero fleet wiring, zero new log lines (the
// v0.379.0 precedent). Junk-safe: non-string rows judge nothing (the
// FATAL-face truncation lesson); junk formats never match the anatomy.

// the ANNOUNCE form only - the census's death count reads the announce (the
// 'death: ' context lines are the same death's second voice, never a death:
// the v0.389.0 anatomy's own split, the count must not double-count it)
export const DEATH_ANNOUNCE_RE = /^F\d+ \[F\d+\] died - respawning/

// the death-drop line's own anatomy: the tag pair then the drop payload
// (the loss form with the coord bracket, or the pocket-read-empty form).
export const DEATH_DROP_RE = /^F\d+ \[F\d+\] death drop: /

// the loss form's mass + coord read: '~113u lost at [-141,60,394]'
export const DEATH_DROP_LOSS_RE = /^F(\d+) \[F\d+\] death drop: ~([\d,]+)u lost at \[(-?\d+),(-?\d+),(-?\d+)\]/

// the empty form: a counted death with no mass (the pocket read failed)
export const DEATH_DROP_EMPTY_RE = /^F(\d+) \[F\d+\] death drop: pocket read empty at death \(0u\)/

// the recovery lane's voice: every ladder row carries the same head
export const RELOOT_ROW_RE = /^F(\d+) reloot: /

// True when the line IS a death-drop line (either form).
export function isDeathDropLine(l) {
  return typeof l === 'string' && DEATH_DROP_RE.test(l)
}

/**
 * The death-drop census: the stakes, the lane's voice, and the silent-arm
 * join - the deathdrop class's own aggregate, mined per face.
 * @param {string[]} [lines] the full fleet19.log lines
 * @returns {{
 *   drops: Array<{bot: string, u: number, pos: {x:number,y:number,z}|null, kind: 'loss'|'empty', line: number}>,
 *   deaths: number,
 *   lostU: number,
 *   emptyReads: number,
 *   armed: {n: number, u: number, bots: string[]},
 *   silent: {n: number, u: number, bots: string[]}
 * }} the drops in log order (line = the source index); lostU sums the
 *    loss-form masses (the empty form is 0 by shape); armed/silent join
 *    each drop to the lane's voice after it (bots heaviest-first, the
 *    reader's own convention).
 *    Junk-safe: a non-array or non-string rows read an empty census.
 */
export function deathDropCensus(lines) {
  const rows = Array.isArray(lines) ? lines.filter((l) => typeof l === 'string') : []
  const drops = []
  let deaths = 0
  // pass 1: the deaths and the stakes in log order
  for (let i = 0; i < rows.length; i++) {
    const l = rows[i]
    if (DEATH_ANNOUNCE_RE.test(l)) deaths++
    if (!DEATH_DROP_RE.test(l)) continue
    const loss = l.match(DEATH_DROP_LOSS_RE)
    if (loss) {
      drops.push({
        bot: 'F' + loss[1],
        u: parseInt(loss[2].replace(/,/g, ''), 10) || 0,
        pos: { x: parseInt(loss[3], 10), y: parseInt(loss[4], 10), z: parseInt(loss[5], 10) },
        kind: 'loss',
        line: i
      })
      continue
    }
    const empty = l.match(DEATH_DROP_EMPTY_RE)
    if (empty) {
      drops.push({ bot: 'F' + empty[1], u: 0, pos: null, kind: 'empty', line: i })
    }
  }
  // pass 2: the lane's voice after each stake (line order = time order)
  const armRows = []
  for (let i = 0; i < rows.length; i++) {
    const m = rows[i].match(RELOOT_ROW_RE)
    if (m) armRows.push({ bot: 'F' + m[1], line: i })
  }
  let lostU = 0
  let emptyReads = 0
  const armedRows = []
  const silentRows = []
  for (const d of drops) {
    if (d.kind === 'empty') emptyReads++
    else lostU += d.u
    const spoke = armRows.some((a) => a.bot === d.bot && a.line > d.line)
    if (spoke) armedRows.push(d)
    else silentRows.push(d)
  }
  const tally = (list) => ({
    n: list.length,
    u: list.reduce((s, d) => s + d.u, 0),
    bots: list.slice().sort((a, b) => b.u - a.u).map((d) => d.bot)
  })
  return {
    drops,
    deaths,
    lostU,
    emptyReads,
    armed: tally(armedRows),
    silent: tally(silentRows)
  }
}
