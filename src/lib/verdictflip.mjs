//
// verdictflip.mjs - THE VERDICT EXECUTION (v0.485.0)
//
// The combat lane's own decision line, priced. The emitter speaks when
// the verdict engine FLIPS a bot to the flee side:
//
//   'combat: verdict flipped to flee vs <mob> (hp N)'
//
// (byte-verbatim on faces 42/43, eight lines, one skin). The verdict is
// the INTENT; the flip episode closes when the bot's next boundary line
// lands - and the boundary law is the fleeLedger's own (one boundary
// law across the lane's lenses): a fleeing start closes FLED (the
// verdict executed as a new escape episode), a fighting / fight-ended
// line closes STOOD (the verdict reversed - the bot turned and fought),
// a sheltering line closes SHELTERED (the shelter lane took over - the
// verdict says flee, the wall answers first), a died line closes DIED
// (the escape ran out - face 42's F17 flipped at hp 7.2, ran the flee
// ladder, died anyway). Every other combat verb (shelter try / wall
// miss / skip / ring try, pair preempt, open-field yield, flee ladder /
// kite / shore / bearing, critical bar, drift wait) is the episode's
// own machinery prose - never closes, never opens (the fleeLedger
// convention, one close vocabulary).
//
// THE FIELD READ (faces 42+43 stored artifacts, zero runner minutes,
// hand-traced then verified live): 8 flips - fled 2 / sheltered 3 /
// died 1 / stood 1 / open 1. The verdict's most common fate is the
// SHIELD TAKEOVER: the shelter lane answers the flip first (3/8) - the
// same handoff the critical prelude read named (two low-hp sensors
// covering each other); only 2/8 flips opened their own escape episode,
// and the execution gap is real: face 43's F5 flipped vs a spider at hp
// 11.0 and executed its flee vs a zombie_villager at hp 2.0 (the threat
// AND the hp both changed between the decision and the flight), while
// face 43's F17 executed at the same hp it flipped at (8.3 -> 8.3).
//
// Junk-safe: non-array / non-string-blob reads null (the smeltledger
// convention); a face with no flips reads the honest zero shape. Pure:
// reads, never mutates.
//
import { DIED_KIND_RE } from './maptrip.mjs'
import { parseCombatLine } from './shootercensus.mjs'
import { FLEE_START_RE } from './fleeledger.mjs'

// the verdict flip's reader grammar (the emitter's full skin, byte-verbatim
// on faces 42/43 - exactly one shape, the bot token mirrors like the
// breath mirror's own law)
export const VERDICT_FLIP_RE = /^(F\d+) \[\1\] combat: verdict flipped to flee vs ([a-z_]+) \(hp (\d+(?:\.\d+)?)\)$/

/**
 * verdictExecution(lines) - the flip's own fate book.
 *
 * @param {string[]|string} [lines] the face log (array or raw blob)
 * @returns {null|{flips: number, fled: number, stood: number, sheltered:
 *   number, died: number, open: number, hp: {min, median, max}|null,
 *   rows: object[]}}
 */
export function verdictExecution (lines) {
  const src = Array.isArray(lines)
    ? lines
    : (typeof lines === 'string' ? lines.split('\n') : null)
  if (!src) return null
  const pending = new Map()
  const rows = []
  let flips = 0
  const close = (st, verdict, closerIdx, extra) => {
    const row = {
      bot: st.bot, mob: st.mob, flipHp: st.hp, verdict,
      flipIdx: st.idx, closerIdx: closerIdx ?? null,
      executedHp: null, executedMob: null
    }
    if (extra) Object.assign(row, extra)
    rows.push(row)
    st.pending = false
  }
  for (let i = 0; i < src.length; i++) {
    const line = src[i]
    if (typeof line !== 'string') continue
    const fm = line.match(VERDICT_FLIP_RE)
    if (fm) {
      const st = pending.get(fm[1])
      if (st && st.pending) close(st, 'open', i) // the tail law, mid-walk twin
      pending.set(fm[1], { bot: fm[1], mob: fm[2], hp: Number(fm[3]), idx: i, pending: true })
      flips++
      continue
    }
    const km = line.match(DIED_KIND_RE)
    if (km) {
      const st = pending.get(km[1])
      if (st && st.pending) close(st, 'died', i)
      continue
    }
    const cm = parseCombatLine(line)
    if (!cm || !cm.bot) continue
    const st = pending.get(cm.bot)
    if (!st || !st.pending) continue
    if (cm.verb === 'fleeing') {
      // the verdict executed as a new escape episode - the execution hp
      // prices the decision-to-flight gap (the truncation-blind flight
      // closes fled with the execution hp honestly unpriced)
      const exm = line.match(FLEE_START_RE)
      close(st, 'fled', i, exm
        ? { executedHp: Number(exm[3]), executedMob: exm[1] }
        : {})
    } else if (cm.verb === 'fighting' || cm.verb === 'fight-ended') {
      close(st, 'stood', i)
    } else if (cm.verb === 'sheltering') {
      close(st, 'sheltered', i)
    }
    // every other combat verb: the flip episode's own machinery prose -
    // never closes, never opens
  }
  for (const st of pending.values()) {
    if (st.pending) close(st, 'open', null)
  }
  const hps = rows.map(r => r.flipHp)
  const tally = { fled: 0, stood: 0, sheltered: 0, died: 0, open: 0 }
  for (const r of rows) tally[r.verdict]++
  return {
    flips,
    fled: tally.fled,
    stood: tally.stood,
    sheltered: tally.sheltered,
    died: tally.died,
    open: tally.open,
    hp: hps.length
      ? {
          min: Math.min(...hps),
          median: hps.length % 2
            ? [...hps].sort((a, b) => a - b)[(hps.length - 1) / 2]
            : (() => { const s = [...hps].sort((a, b) => a - b); return (s[hps.length / 2 - 1] + s[hps.length / 2]) / 2 })(),
          max: Math.max(...hps)
        }
      : null,
    rows
  }
}
