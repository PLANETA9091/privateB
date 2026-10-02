//
// flipdrift.mjs - THE EXECUTION DRIFT (v0.487.0)
//
// (SLOT COLLISION #14: 0.486.0 was taken by fire-2130's THE FIGHT COST
// LEDGER mid-fire - my lens re-versioned 0.486.0 -> 0.487.0, all markers
// moved, zero logic changes, their wire untouched.)
//
// The decision-to-flight gap, priced on the flip book's own rows.
// verdictflip.mjs (v0.485.0) reads WHO executed a flee flip and at what
// hp/mob (the fled rows carry executedHp/executedMob); this lens joins
// those executions back to the decision they came from and measures how
// far the world DRIFTED between the verdict and the flight:
//
//   flip:   'combat: verdict flipped to flee vs <mob> (hp N)'
//   flight: 'combat: fleeing <mob> (dist D, hp H, N nearby, <reason>)'
//
//   mobChanged  = flipMob !== execMob    (the threat itself moved)
//   hpDelta     = execHp - flipHp        (negative = hp lost mid-prose)
//   driftWindow = closerIdx - flipIdx    (the machinery prose lines the
//                                          world drifted across)
//
// THE FIELD READ (faces 42+43 stored artifacts, zero runner minutes,
// hand-traced then verified live): 8 flips, fled 2, both executions
// priced - the book closes 2 = 2 + 0. ONE DRIFTED EXECUTION: face 43's
// F5 flipped vs a spider at hp 11.0 and its flight executed vs a
// zombie_villager at hp 2.0 (mobChanged + hpDelta -9.0 - the threat AND
// the hp both moved while the flip's own machinery prose ran: open-field
// yield / shelter try / wall miss / skip / a shelter try RE-TARGETED at
// the new threat / wall miss) - the flight fled the RIGHT mob (the
// machinery re-read the world) but the DECISION's hp basis was stale by
// 9. face 43's F17 is the INSTANT EXECUTION: same mob, hp 8.3 -> 8.3,
// the verdict became the flight with the hp untouched (76 prose lines,
// the world stood still). face 42 fled 0 - no executions, no drift.
// n=2 faces the drift class is 1/2 of the executed flights: the design
// input is the re-verdict between the decision and the flight (pricing
// only - zero fleet changes in this wire).
//
// Junk-safe: non-array/non-string reads null (the smeltledger
// convention, via verdictExecution); a flip book with no fled rows reads
// the honest zero shape. Pure: reads, never mutates.
//

import { verdictExecution } from './verdictflip.mjs'

const round1 = n => Math.round(n * 10) / 10

const medianOf = (xs) => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2
}

/**
 * flipDrift(lines) - the execution gap's own anatomy.
 *
 * @param {string[]|string} [lines] the face log (array or raw blob)
 * @returns {null|{flips: number, fled: number, fledJoins: number,
 *   unpricedFled: number, mobSame: number, mobChanged: number,
 *   hpLost: number, hpDelta: {min, median, max}|null,
 *   window: {min, median, max}|null, rows: object[]}}
 */
export function flipDrift (lines) {
  const v = verdictExecution(lines)
  if (!v) return null
  const joins = []
  for (const r of v.rows) {
    if (r.verdict !== 'fled') continue
    // the truncation-blind flight: the close verb was 'fleeing' but the
    // start line's own skin never landed - the execution stays unpriced
    if (r.executedMob == null || r.executedHp == null) continue
    joins.push({
      bot: r.bot,
      flipMob: r.mob,
      flipHp: r.flipHp,
      execMob: r.executedMob,
      execHp: r.executedHp,
      mobChanged: r.mob !== r.executedMob,
      hpDelta: round1(r.executedHp - r.flipHp),
      driftWindow: (r.closerIdx != null && r.flipIdx != null)
        ? r.closerIdx - r.flipIdx
        : null
    })
  }
  const deltas = joins.map(j => j.hpDelta)
  const windows = joins.map(j => j.driftWindow).filter(w => w !== null)
  return {
    flips: v.flips,
    fled: v.fled,
    fledJoins: joins.length,
    unpricedFled: v.fled - joins.length,
    mobSame: joins.filter(j => !j.mobChanged).length,
    mobChanged: joins.filter(j => j.mobChanged).length,
    hpLost: deltas.filter(d => d < 0).length,
    hpDelta: deltas.length
      ? { min: Math.min(...deltas), median: medianOf(deltas), max: Math.max(...deltas) }
      : null,
    window: windows.length
      ? { min: Math.min(...windows), median: medianOf(windows), max: Math.max(...windows) }
      : null,
    rows: joins
  }
}
