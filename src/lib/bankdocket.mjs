//
// bankdocket.mjs - THE BANK'S DOCKET (v0.700.0)
//
// THE SILENT BANK's own anatomy (the face-32 anomaly: 143 bank-ish
// visit-lines, 0u banked - the yield dial's worst read on record). The
// yield lens (v0.686.0) divides the pulse counters by the visit-line
// count, but a visit-line is not an outcome: the face's bank lines hide
// TWO different silences, and the cure input is whichever owns the face.
//
// The docket classifies the bank lane's own bytes into two legs:
//
//   the DOOR leg - the chest never delivered, in four skins:
//       'F7 bank: chest unreachable'                    (the walk failed)
//       'F11 food trip: 0 (no chest reached) - ...'     (no chest at all)
//       'F4 [F4] hop: chest at [-115,79,415] d=28 zero:
//        chest unreachable (Took to long to decide path to goal!)'
//            (the probe's doorstep decide-timeout - the same failure in
//             the hop probe's own skin)
//       'F2 [F2] hop: chest at [-120,79,413] d=14 zero: cannot open
//        chest (open chest: timeout after 10000ms)'     (the lid stuck)
//       'F3 [F3] hop: chest at [-105,79,413] d=51 zero: chest beyond
//        the hop search radius 48 - walking home instead' (out of reach)
//
//   the EMPTY-POCKET leg - the chest reached and open, the deposit
//   moved 0:
//       'F16 [F16] hop: chest at [-141,79,389] d=20 zero: nothing to
//        deposit'   (the zero probe - the pocket arrived empty)
//       'F4 bank: 0 (nothing to deposit)'  (the deposit byte fired,
//        carried nothing)
//
// beside the legs' witnesses: the deposit machinery's own view byte
// ('direct deposit: 27 chest slots derived from the 63-slot view'), the
// fallback byte ('bank fallback: none ...'), the plan voice ('bank
// trip: ... budget'), the why-phrase count ('nothing to deposit' rides
// across every family that carries it - the probe's, the deposit
// byte's, the fallback's), and the deposit positives (a 'bank: N' byte
// with N > 0 - mass moved).
//
// The fork speaks only when the legs read (the silence law: no bank
// bytes, no verdict):
//   pocket > door -> 'THE POCKET MET THE CHEST EMPTY: the visits and
//                     the mass lived on different clocks'
//   door > pocket -> 'THE CHEST DOOR NEVER OPENED: the walk's own
//                     failures own the silence' (the face-32 verdict:
//                     45 vs 6 - and the door's skins are decide-
//                     timeouts at the doorstep, the A* family's own
//                     ground)
//   tie           -> 'THE DOCKET SPLITS: the door and the empty pocket
//                     share the silence'
//
// Junk-safe: non-array / non-string-blob reads null (the smeltledger
// convention); a face with no bank lines reads the honest zero shape.
//
// (v0.702.0) THE DOOR'S RATE DIAL - the docket's second arg (the visit
// lane's own line count, the yield dial's denominator) grows the rate:
// the door leg's share of the lane (the 32nd: 45/143 = 31.5% - the
// approach is the bank's ceiling; the 33rd: 25/123 = 20.3% - the door
// failures halved and the bank moved 0 -> 1785u, the door is the bank's
// own thermostat). No visits, junk visits, or a legless face reads no
// rate (the honest silence - the law the yield dial already rides).
//
// (v0.703.0) THE DECIDE SKIN'S OWN COUNT - the unreachable skin splits
// by its own why-tail: 'chest unreachable (Took to long to decide path
// to goal!)' is the A* family's doorstep starvation, the bare skin is
// the walk's own verdict. door.decideTimeouts names the A* share per
// face (the 32nd: 19 of 39, the 34th: 27 of 35) - the doorstep decide
// budget's standing design input. The fire-2030 worklog's '39 of the
// 45' was the ad-hoc grep's own error (the lens corrects again: the
// marker's other 20 rides on the 32nd lived in the fuel lane's 'chest
// walk failed after the nudge' family - a door the docket does not
// classify, the next fire's front).
//
// (v0.704.0) THE FUEL LANE'S OWN DOOR - that front lands: the nudge
// walk's own verdict in the fuel lane's skin ('fuel commons: chest walk
// failed after the nudge (...)') joins the docket as its own cell, the
// bank's legs untouched (the era's rows 45/6, 25/0, 43/1 stay put).
// The why-tail names the starver: the A* doorstep's decide marker, the
// no-path verdict, the nudge-retry's own timeout ('(nudge retry):
// timeout after Nms' - the rescue-refused tail says 'nudge retry' too
// but never ': timeout after', the byte keeps them apart), and 'other'
// absorbs the rest (the 32nd's water-rescue refusal rides here). The
// era's own reads, raw-log reconciled: the 32nd 19 (decide 14, no path
// 2, retry 2, other 1), the 34th 21 (decide 17, no path 3, retry 1).
// The fire-2130 worklog's '20x/27x' was the ad-hoc grep's error again
// (the lens corrects a third time). The iron commune's bare 'chest
// walk failed' family (5 on the 32nd, 20 on the 34th) is a THIRD
// lane's door - the scope extension's own front, still unclassified.
//
// Pure: reads, never mutates. Zero fleet wiring (mining-surface only,
// the v0.379/.../v0.701.0 precedent) - the bank bytes already ride the
// filter-key.
//

/**
 * bankDocket(lines) - the bank lane's outcome docket.
 *
 * @param {string[]|string} [lines] the face log (array or raw blob)
 * @param {number} [visits] the visit lane's own line count (the yield
 *   dial's denominator) - the rate rides only on a positive finite count
 * @returns {null|{bankLines: number,
 *   door: {unreachable: number, decideTimeouts: number, noChest: number,
 *          lidTimeout: number, beyondRadius: number, total: number},
 *   pocket: {zeroProbes: number, depositZeros: number, total: number,
 *            nothingToDeposit: number},
 *   fuel: {total: number, decide: number, noPath: number,
 *          retryTimeout: number, other: number},
 *   views: number, fallbacks: number, plans: number,
 *   depositPositives: number,
 *   rate?: {visits: number, doorPct: number, pocketPct: number}}}
 */
export function bankDocket (lines, visits) {
  const src = Array.isArray(lines)
    ? lines
    : (typeof lines === 'string' ? lines.split('\n') : null)
  if (!src) return null
  const d = {
    bankLines: 0,
    door: { unreachable: 0, decideTimeouts: 0, noChest: 0, lidTimeout: 0, beyondRadius: 0, total: 0 },
    pocket: { zeroProbes: 0, depositZeros: 0, total: 0, nothingToDeposit: 0 },
    fuel: { total: 0, decide: 0, noPath: 0, retryTimeout: 0, other: 0 },
    views: 0,
    fallbacks: 0,
    plans: 0,
    depositPositives: 0
  }
  for (const line of src) {
    if (typeof line !== 'string') continue
    if (/\bbank\b|\bbanked\b/.test(line)) d.bankLines++
    // the why-phrase rides independently (the probe's, the deposit byte's
    // and the fallback's own why - counted wherever it appears)
    if (/nothing to deposit/.test(line)) d.pocket.nothingToDeposit++
    // the door leg, four skins (checked before the pocket leg - the
    // probe-wrapped door failures ride the probe's own skin)
    if (/zero: cannot open chest/.test(line)) { d.door.lidTimeout++; d.door.total++; continue }
    if (/zero: chest beyond/.test(line)) { d.door.beyondRadius++; d.door.total++; continue }
    if (/chest unreachable/.test(line)) {
      d.door.unreachable++
      // (v0.703.0) the decide skin's own count - the A* family's share of
      // the unreachable leg (the doorstep starvation's standing input)
      if (/Took to long to decide path to goal/.test(line)) d.door.decideTimeouts++
      d.door.total++
      continue
    }
    if (/no chest reached/.test(line)) { d.door.noChest++; d.door.total++; continue }
    // (v0.704.0) THE FUEL LANE'S OWN DOOR - the nudge walk's own verdict
    // in the fuel lane's skin: a door the bank's legs never classified.
    // The why-tail names the starver; the sum of the tails is the total
    // (the honest split, no residual).
    if (/chest walk failed after the nudge/.test(line)) {
      d.fuel.total++
      if (/Took to long to decide path to goal/.test(line)) d.fuel.decide++
      else if (/No path to the goal/.test(line)) d.fuel.noPath++
      else if (/\(nudge retry\): timeout after/.test(line)) d.fuel.retryTimeout++
      else d.fuel.other++
      continue
    }
    // the empty-pocket leg: the chest reached and open, the deposit moved 0
    if (/chest at \S+ d=\d+ zero: nothing to deposit/.test(line)) { d.pocket.zeroProbes++; d.pocket.total++; continue }
    const dm = line.match(/^([A-Za-z]\d+) bank: (\d+)(?: \((.+)\))?$/)
    if (dm) {
      const v = Number(dm[2])
      if (v === 0) { d.pocket.depositZeros++; d.pocket.total++ } else d.depositPositives++
      continue
    }
    // the witnesses (counted, never classified into a leg)
    if (/direct deposit: \d+ chest slots/.test(line)) d.views++
    if (/bank fallback:/.test(line)) d.fallbacks++
    if (/\bbank trip: /.test(line)) d.plans++
  }
  // (v0.702.0) THE DOOR'S RATE DIAL - the legs' share of the visit lane,
  // the bankYield rounding (x1000 round / 10 - one honest decimal). The
  // rate rides only on a positive finite count AND legs that read: a
  // visit count alone names no silence, a legless lane needs no dial.
  if (Number.isFinite(visits) && visits > 0 && (d.door.total > 0 || d.pocket.total > 0)) {
    d.rate = {
      visits,
      doorPct: Math.round((d.door.total / visits) * 1000) / 10,
      pocketPct: Math.round((d.pocket.total / visits) * 1000) / 10
    }
  }
  return d
}
