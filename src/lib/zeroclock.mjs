//
// zeroclock.mjs - THE ZERO CLOCK (v0.441.0)
//
// The hop zero's face-phase anatomy. The hop-zero census (v0.399.0) counts
// the classes; the open-deaf window (v0.438.0) bracketed the open-timeout
// class against the distress clock; face 29 (fleet 36920928626, the wet
// 600s face) showed the open-timeout zeros ALL bracketed 400..681s - the
// LATE face - while the budget-floor class (7 zeros, the chain budget's
// own exhaustion) asked the question this lens answers:
//
//   does a zero class bite EARLY (the machinery's own defect), MID (the
//   budgets are the lever), or LATE (the floor's EOF design working and
//   the pocket's drain being the real lever)?
//
// The read is pure and decompose-side, riding two parsers it can never
// drift from (the ride-the-parser law):
//   - hopcensus.mjs's parseHopZero for the zero lines (every class, not
//     just open-timeout - the census's own why strings pass through
//     verbatim),
//   - opendeaf.mjs's parsePulseAnchor for the ts anchors (BOTH field
//     truncations; a missing mainLate is irrelevant here - only ts rides).
//
// The phase law (the v0.435.0 unpaired lesson): a zero carries no
// timestamp, so it is bracketed by the surrounding pulse anchors (lo =
// last anchor before the line, hi = first anchor after) and classified
// into the clock's thirds by the bracket's MIDPOINT. A bracket with
// either end missing (the zero sat before the first anchor or after the
// last) reads phase 'unplaced' - counted, never assumed. Face-29
// resolution: 40 anchors over ~700s = ~17s gaps against ~233s thirds -
// the midpoint classification is honest at that density and the row
// prints the anchor count so the reader can judge it.
//
import { parseHopZero } from './hopcensus.mjs'
import { parsePulseAnchor } from './opendeaf.mjs'

// The census: feed the full fleet19.log lines.
//   anchors  - the pulse reads in log order {i, n, ts, mainLate}
//   clockEnd - the last anchor's ts (null when the face printed no anchors)
//   thirdS   - clockEnd/3 (null without a clock)
//   zeros    - every parsed hop zero in log order:
//              { i, bot, why (the census's own class string), chest, lo, hi,
//                mid, phase ('early'|'mid'|'late'|'unplaced') }
//   byClass  - why -> { n, byPhase: { early, mid, late, unplaced }, byBot }
//   wide     - brackets wider than one third (the sparse-anchor faces where
//              the midpoint classification is weakest - printed, judged)
export function zeroClockCensus (lines) {
  const rows = Array.isArray(lines) ? lines.filter((l) => typeof l === 'string') : []
  const anchors = []
  for (let i = 0; i < rows.length; i++) {
    const a = parsePulseAnchor(rows[i])
    if (a) anchors.push({ i, ...a })
  }
  const clockEnd = anchors.length ? anchors[anchors.length - 1].ts : null
  const thirdS = clockEnd !== null ? clockEnd / 3 : null
  const phaseOf = (mid) => {
    if (mid === null || thirdS === null) return 'unplaced'
    if (mid <= thirdS) return 'early'
    if (mid <= thirdS * 2) return 'mid'
    return 'late'
  }
  const zeros = []
  const byClass = {}
  let wide = 0
  for (let i = 0; i < rows.length; i++) {
    const e = parseHopZero(rows[i])
    if (!e) continue
    let lo = null; let hi = null
    for (const a of anchors) {
      if (a.i < i) lo = a.ts
      else { hi = a.ts; break }
    }
    const mid = lo !== null && hi !== null ? (lo + hi) / 2 : null
    const phase = phaseOf(mid)
    if (mid !== null && hi !== null && thirdS !== null && hi - lo > thirdS) wide++
    const why = e.klass.why
    zeros.push({
      i, bot: e.bot, why,
      chest: e.x !== null && e.z !== null ? `${e.x},${e.y},${e.z}` : null,
      lo, hi, mid, phase,
    })
    if (!byClass[why]) byClass[why] = { n: 0, byPhase: { early: 0, mid: 0, late: 0, unplaced: 0 }, byBot: {} }
    byClass[why].n++
    byClass[why].byPhase[phase]++
    byClass[why].byBot[e.bot] = (byClass[why].byBot[e.bot] || 0) + 1
  }
  return { anchors, clockEnd, thirdS, zeros, byClass, wide }
}

// The budget-floor verdict (the question that opened the lens): where does
// the chain budget's own exhaustion bite? 'late' dominance = the floor's
// EOF design bounded the spend (the pocket's drain is the lever); 'mid'
// dominance = the budgets themselves are the lever; mixed/unplaced-heavy
// = no verdict claimed.
export function budgetFloorVerdict (census) {
  const bf = census && census.byClass ? census.byClass['budget-floor'] : null
  if (!bf || bf.n === 0) return { verdict: 'none', n: 0 }
  const p = bf.byPhase
  if (p.late * 2 > bf.n) return { verdict: 'late', n: bf.n, byPhase: p }
  if (p.mid * 2 > bf.n) return { verdict: 'mid', n: bf.n, byPhase: p }
  if (p.early * 2 > bf.n) return { verdict: 'early', n: bf.n, byPhase: p }
  return { verdict: 'mixed', n: bf.n, byPhase: p }
}

// (v0.766.0) THE WALK LATTICE'S OWN CLOCK - the v0.760.0 verdict named the
// walk lattice the hop-bleed's front (face 68: no-path owned 15 of 28),
// never WHEN the lattice starves. The no-path class's own phase book under
// the budget-floor verdict's own 2:1 dominance law: LATE dominance = the
// deadline's own signature (the late face's chest ring starves the lattice
// - arm the walk lane earlier, the paths are not the defect); MID = the
// mid-run churn is the lever; EARLY = the machinery's own opening defect.
// No dominance (the mixed spread), an unplaced-heavy class, an empty or
// absent book -> the honest silence (null - the storm has no seat).
export function noPathClockVerdict (census) {
  const np = census && census.byClass ? census.byClass['no-path'] : null
  if (!np || np.n === 0) return null
  const p = np.byPhase
  if (p.late * 2 > np.n) return { verdict: 'late', n: np.n, byPhase: p }
  if (p.mid * 2 > np.n) return { verdict: 'mid', n: np.n, byPhase: p }
  if (p.early * 2 > np.n) return { verdict: 'early', n: np.n, byPhase: p }
  return null
}
