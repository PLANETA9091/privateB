//
// criticalprelude.mjs - THE CRITICAL PRELUDE (v0.483.0)
//
// The combat lane's own low-hp sensor, priced. The emitter speaks once
// the hp bar crosses into the critical zone:
//
//   'combat: critical bar (seen < 8) - the shelter scan is refused, the
//    drain outruns it'
//
// (byte-verbatim on faces 42/43, six lines, one skin). The prose names
// the sensor's own verdict: the shelter scan is REFUSED at this hp - the
// escape lane has to act on what the bar already said. This lens joins
// each critical bar to its bot's NEXT flee start (the prelude join - the
// fleeClock's forward twin: the breath mirror joins at-or-before the
// death, the prelude joins the flight the bar announced) and prices:
//
//   - the join cover: how many bars found their flee (the tail bar with
//     no following flee reads unjoined - face 42's F17 bar, the honest
//     tail)
//   - the prelude cover: how many flee starts rode a bar (a flee's
//     prelude = its bot's last bar sits AFTER the bot's previous flee
//     start - the bar belongs to THIS flight, not the story before it)
//   - the critical-zone cover: flees at hp < CRITICAL_HP (the bar's own
//     threshold mirrored) and how many of them rode the prelude - the
//     sensor-gap count is this lens's blind-lane twin (the o2 lane's
//     cueKind law: the sensor that should have spoken and did not)
//
// THE FIELD READ (faces 42+43 stored artifacts, zero runner minutes,
// hand-traced then verified live): 6 bars, 5 joined (face 42's F17 tail
// the one honest unjoined); the critical-zone flees 6, covered 5 - and
// the ONE gap (face 43's F5, fleeing a zombie_villager at hp 2.0) rode
// the OTHER prelude instead: its previous line is 'combat: shelter skip
// (open field: ring incomplete 7/8)' - the two low-hp preludes hand off
// to each other, the critical bar is not the doom's discriminator, it is
// the drain zone's own flight announcement.
//
// Junk-safe: non-array / non-string-blob reads null (the smeltledger
// convention); a face with no bars reads the honest zero shape. Pure:
// reads, never mutates.
//
import { parseCombatLine } from './shootercensus.mjs'
import { FLEE_START_RE } from './fleeledger.mjs'

// the bar's own threshold, mirrored (the emitter's 'seen < 8' - the
// critical zone the flee-at read prices against)
export const CRITICAL_HP = 8

// the critical bar's reader grammar (the emitter's full skin, byte-verbatim
// on faces 42/43 - exactly one shape, the bot token mirrors like the
// breath mirror's own law)
export const CRITICAL_BAR_RE = /^(F\d+) \[\1\] combat: critical bar \(seen < 8\) - the shelter scan is refused, the drain outruns it$/

/**
 * criticalPrelude(lines) - the critical bar's own flight announcement book.
 *
 * @param {string[]|string} [lines] the face log (array or raw blob)
 * @returns {null|{bars: number, joinedBars: number, unjoinedBars: number,
 *   fleeStarts: number, prelude: {with: number, without: number},
 *   criticalFlees: number, covered: number, gap: number, rows: object[]}}
 */
export function criticalPrelude (lines) {
  const src = Array.isArray(lines)
    ? lines
    : (typeof lines === 'string' ? lines.split('\n') : null)
  if (!src) return null
  // per-bot state: the last bar's index, the previous flee start's index
  // (the prelude window's floor), whether the last bar already joined
  const bots = new Map()
  const state = bot => {
    let st = bots.get(bot)
    if (!st) { st = { lastBarIdx: null, lastFleeIdx: null, barJoined: false }; bots.set(bot, st) }
    return st
  }
  const rows = []
  let bars = 0
  let fleeStarts = 0
  let withPrelude = 0
  let criticalFlees = 0
  let covered = 0
  for (let i = 0; i < src.length; i++) {
    const line = src[i]
    if (typeof line !== 'string') continue
    const bm = line.match(CRITICAL_BAR_RE)
    if (bm) {
      bars++
      const st = state(bm[1])
      st.lastBarIdx = i
      st.barJoined = false
      continue
    }
    const cm = parseCombatLine(line)
    if (!cm || !cm.bot || cm.verb !== 'fleeing') continue
    const fm = line.match(FLEE_START_RE)
    if (!fm) continue // the truncation window - the flight opens data-blind, no hp to price
    fleeStarts++
    const st = state(cm.bot)
    // the flee's prelude: the bot's last bar sits AFTER the bot's previous
    // flee start - the bar announced THIS flight, not the story before it
    const hasPrelude = st.lastBarIdx !== null && st.lastBarIdx > (st.lastFleeIdx ?? -1)
    const hp = Number(fm[3])
    if (hasPrelude) {
      withPrelude++
      st.lastFleeIdx = i
      if (!st.barJoined) {
        // the bar joins the flight it announced (each bar joins at most
        // one flee - the first follower)
        rows.push({ bot: cm.bot, barIdx: st.lastBarIdx, fleeIdx: i, hp, gapLines: i - st.lastBarIdx })
        st.barJoined = true
      }
      if (hp < CRITICAL_HP) covered++
    }
    if (hp < CRITICAL_HP) criticalFlees++
  }
  return {
    bars,
    joinedBars: rows.length,
    unjoinedBars: bars - rows.length,
    fleeStarts,
    prelude: { with: withPrelude, without: fleeStarts - withPrelude },
    criticalFlees,
    covered,
    gap: criticalFlees - covered,
    rows
  }
}
