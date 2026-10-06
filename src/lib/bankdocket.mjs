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
 *   door: {unreachable: number, noChest: number, lidTimeout: number,
 *          beyondRadius: number, total: number},
 *   pocket: {zeroProbes: number, depositZeros: number, total: number,
 *            nothingToDeposit: number},
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
    door: { unreachable: 0, noChest: 0, lidTimeout: 0, beyondRadius: 0, total: 0 },
    pocket: { zeroProbes: 0, depositZeros: 0, total: 0, nothingToDeposit: 0 },
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
    if (/chest unreachable/.test(line)) { d.door.unreachable++; d.door.total++; continue }
    if (/no chest reached/.test(line)) { d.door.noChest++; d.door.total++; continue }
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
