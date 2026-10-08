//
// reachmap.mjs - THE REACH'S OWN RADIUS (v0.740.0)
// The dry yard's own column (their v0.737.0) priced the reach's
// REACHED side - the located dry reads named the chests the walk
// arrived at and found empty. But the reach's REFUSED side stayed
// unread: the 53rd's own face (run 37553652417) carried 17 last-mile
// refusals - walks that NEVER arrived, dying on the final approach -
// and the distance each walk died at rode the line unread ('raw walk
// timeout after 2402ms (d=9.1)'). The reach's map now has both sides:
// the reached-and-dry positions (the ledger's dryChests) and the
// refused distances (v0.740.0's lastMileD - the same
// COMMONS_LASTMILE_RE match, no new RE for the line shape). THE
// 53RD'S OWN MOTIVE, now priceable: 16 of the 17 refusals died at
// d=4.3-9.1 - INSIDE the direct envelope's own band (the v0.597.0
// precedent: the budget deaths landed at d=7-10) - the bot stands one
// straight hop from a chest and the raw clock cannot close it; one
// outlier died at d=15.2 (the approach's own price).
//
// THE LENS (pure on the commonsLedger result - no parsing here, the
// skywalk law: two lenses one read):
//   bands: close d<5 / mid 5-10 / far >10 (the envelope's own band
//     d=7-10 sits inside mid; 'close' = the chest at arm's reach and
//     the walk still died - geometry's own; 'far' = the walk died
//     before the envelope ever declared);
//   verdicts (exclusive):
//     no refusals          - null (the honest silence, no row)
//     refusals, no d read  - the bare class (the old faces' shape)
//     far = 0              - the walks die inside the envelope's own
//                            band (the raw clock's own price)
//     far > 0              - N walk(s) died beyond the band (the
//                            approach's own price rides with the
//                            last mile's)
//
// Pure census, unit-pinned; decompose is its field read.
// Mining-surface only: zero fleet wiring, zero new log lines.
// Junk-safe end to end: a ledger without the lastMileD column (the
// old callers) reads refusals with zero distances - the honest gap.
//

/**
 * Read the reach's own radius - the refused walks' distance map off
 * the commons ledger's totals. Pure census, no parsing.
 * @param {null|{bots: Object, totals: object, rows: object[]}} ledger commonsLedger(lines)'s own result
 * @returns {null|{refusals: number, withD: number, dMax: number, bands: {close: number, mid: number, far: number}}}
 */
export function reachRadius (ledger) {
  if (!ledger || !ledger.totals) return null
  const t = ledger.totals
  const ds = Array.isArray(t.lastMileD) ? t.lastMileD.filter(d => Number.isFinite(d)) : []
  const bands = { close: 0, mid: 0, far: 0 } // close d<5 / mid 5-10 / far >10 (the v0.597.0 envelope's own band d=7-10 sits inside mid)
  let dMax = 0
  for (const d of ds) {
    if (d > dMax) dMax = d
    if (d < 5) bands.close++
    else if (d <= 10) bands.mid++
    else bands.far++
  }
  return { refusals: t.lastMile ?? 0, withD: ds.length, dMax, bands }
}

// ONE verdict line, only when the reach refused at all (zero refusals
// = the honest silence - the block stays quiet on a face whose sweeps
// all walked home).
export function reachRadiusRow (r) {
  if (!r || r.refusals === 0) return null
  const head = `the reach's own radius: the last mile refused ${r.refusals} walk(s)`
  if (r.withD === 0) {
    return `${head}, d read on none - the bare refusals carry no distance (the old faces' shape)`
  }
  const bands = `d read on ${r.withD} of ${r.refusals} (max ${r.dMax.toFixed(1)}, bands: d<5 x${r.bands.close} / d5-10 x${r.bands.mid} / d10+ x${r.bands.far})`
  if (r.bands.far === 0) {
    return `${head}, ${bands} - the walks die inside the envelope's own band (the bot stands one straight hop from the chest, the raw clock cannot close it)`
  }
  return `${head}, ${bands} - ${r.bands.far} walk(s) died beyond the envelope's own band (d>10) - the approach's own price rides with the last mile's`
}

// (v0.742.0) THE LAST MILE'S OWN CLOCK - the radius's own twin: the
// radius priced WHERE the refused walk died (the d= bands, v0.740.0);
// the CLOCK the walk paid dying rode the same tail unread (the raw
// walker's elapsed ms: 'raw walk timeout after 2402ms' / 'raw walk:
// no net progress for 8161ms' / 'raw walk stalled after 1224ms' - the
// commonsledger's lastMileMs column, the same match, no new RE for
// the line shape). THE CURE'S OWN DATUM: the 53rd's inside-band
// deaths rode 381ms..8161ms walks (the raw clock died YOUNG - the
// envelope's own 2000ms floor could never buy the hop); the spend
// distribution prices the raw walk's own rent per face.
/**
 * Read the last mile's own clock - the refused walks' elapsed-ms map
 * off the commons ledger's totals. Pure census, no parsing.
 * @param {null|{bots: Object, totals: object, rows: object[]}} ledger commonsLedger(lines)'s own result
 * @returns {null|{refusals: number, withMs: number, msSum: number, msMax: number}}
 */
export function reachClock (ledger) {
  if (!ledger || !ledger.totals) return null
  const t = ledger.totals
  const ms = Array.isArray(t.lastMileMs) ? t.lastMileMs.filter(v => Number.isFinite(v) && v >= 0) : []
  return {
    refusals: t.lastMile ?? 0,
    withMs: ms.length,
    msSum: ms.reduce((s, v) => s + v, 0),
    msMax: ms.length ? Math.max(...ms) : 0
  }
}

// ONE verdict line, only when a clock rode at all (zero captured ms =
// the honest silence - the bare refusals' own law, no row invented).
export function reachClockRow (c) {
  if (!c || c.withMs === 0) return null
  const secs = v => (v / 1000).toFixed(1)
  return `the last mile's own clock: the refused walks spent ${secs(c.msSum)}s dying (max ${secs(c.msMax)}s across ${c.withMs} read(s)) - the raw walk's own rent`
}

// (v0.821.0) THE LAST MILE'S OWN RENT SEAT - the radius's and the
// clock's own offspring: the radius priced WHERE the refused walk
// died (the d= bands) and the clock priced WHAT the walk paid dying
// (the elapsed ms), but the two columns rode apart - which BAND's
// walks burned the clock stayed unread. The pair column (the
// commonsledger's v0.821.0 lastMilePairs - one {d, ms} record when
// the same match carried both tails, never two columns joined by
// index luck) seats the rent by the radius's own bands (close d<5 /
// mid 5-10 / far >10): the band whose ms holds the strict majority
// of the book owns the seat - the same one-law-two-words shape the
// story seat rides (v0.818.0). THE CURE'S OWN PRICE: a band that
// owns the whole rent while the delivered ledger stays 0 prices the
// preflight's own gate - the walk that cannot arrive should never
// rent the clock.
//
// Pure on the commonsLedger result - no parsing here, the skywalk
// law: two lenses one read. Mining-surface only: zero fleet wiring,
// zero new log lines. Junk-safe end to end: no pairs (the old
// callers, the bare tails, the one-sided matches) reads null - the
// honest silence.
/**
 * Seat the last mile's own rent - the paired walks' ms by the d-band.
 * @param {null|{bots: Object, totals: object, rows: object[]}} ledger commonsLedger(lines)'s own result
 * @returns {null|{pairs: number, msSum: number, bands: {close: {n: number, ms: number}, mid: {n: number, ms: number}, far: {n: number, ms: number}}, owner: null|string}}
 */
export function reachRentSeat (ledger) {
  if (!ledger || !ledger.totals) return null
  const t = ledger.totals
  const pairs = Array.isArray(t.lastMilePairs)
    ? t.lastMilePairs.filter(p => p && Number.isFinite(p.d) && Number.isFinite(p.ms) && p.ms >= 0)
    : []
  if (pairs.length === 0) return null
  const bands = { close: { n: 0, ms: 0 }, mid: { n: 0, ms: 0 }, far: { n: 0, ms: 0 } }
  let msSum = 0
  for (const p of pairs) {
    msSum += p.ms
    const band = p.d < 5 ? 'close' : (p.d <= 10 ? 'mid' : 'far') // the radius's own bands (v0.740.0)
    bands[band].n++
    bands[band].ms += p.ms
  }
  let owner = null
  for (const name of ['close', 'mid', 'far']) {
    if (bands[name].ms * 2 > msSum) owner = name // the strict majority of the rent owns the seat
  }
  return { pairs: pairs.length, msSum, bands, owner }
}

// ONE verdict line, only when a seat could form (no pairs / a zero
// book = the honest silence; a mix book - no strict majority - rides
// the mix row only for the honest owner-null shape, the story seat's
// own law).
export function reachRentSeatRow (seat) {
  if (!seat || !(seat.msSum > 0)) return null
  if (seat.owner === null) {
    return "the last mile's own rent seat (v0.821.0): no solo band owns the rent book (the mix owns nothing)"
  }
  if (!seat.bands || !Object.prototype.hasOwnProperty.call(seat.bands, seat.owner)) return null // the junk owner reads null - the seat's own law (the story seat's v0.818.0 lesson)
  const secs = v => (v / 1000).toFixed(1)
  const pct = ((seat.bands[seat.owner].ms / seat.msSum) * 100).toFixed(1)
  const tails = {
    close: "the chest at arm's reach and the walk still died - geometry's own rent",
    mid: "the envelope's own band - the raw clock's own price, the hop never bought",
    far: 'the walk died before the envelope ever declared - the preflight\'s own gate prices the never-arriving walk'
  }
  return `the last mile's own rent seat (v0.821.0): the ${seat.owner} band owns ${secs(seat.bands[seat.owner].ms)}s of ${secs(seat.msSum)}s (${pct}%) - THE RENT'S OWN SEAT: ${tails[seat.owner]}`
}

// (v0.823.0) THE PREFLIGHT GATE'S OWN PRICE - the rent seat's own
// cure. The seat named WHICH band owns the rent (v0.821.0); this lens
// prices the early refuse at that band's own lower edge: a far owner
// gates at d>10, a mid owner at d>5 - the same strict-majority owner
// the seat read, one threshold each. A close owner or a mix book (no
// solo owner) prices NO distance gate - the problem is not the walk's
// length, and one honest null beats a invented threshold. A gate that
// refuses nothing rides no row. Pure on the commonsLedger result - it
// re-reads the seat (one parser one truth: the same filter, the same
// bands). Junk-safe: no pairs / no totals / a zero book reads null.
/**
 * Price the preflight distance gate the rent seat's own owner implies.
 * @param {null|{bots: Object, totals: object, rows: object[]}} ledger commonsLedger(lines)'s own result
 * @returns {null|{gate: number, refused: number, total: number, keptMs: number, totalMs: number, owner: string}}
 */
export function reachPreflightGate (ledger) {
  if (!ledger || !ledger.totals) return null
  const seat = reachRentSeat(ledger)
  if (!seat || seat.owner === null || seat.owner === 'close') return null // the close owner's rent is not the walk's length - no gate priced
  const gate = seat.owner === 'far' ? 10 : 5
  const pairs = Array.isArray(ledger.totals.lastMilePairs)
    ? ledger.totals.lastMilePairs.filter(p => p && Number.isFinite(p.d) && Number.isFinite(p.ms) && p.ms >= 0)
    : []
  let refused = 0
  let keptMs = 0
  for (const p of pairs) {
    if (p.d > gate) { refused++; keptMs += p.ms } // the gate refuses d > gate - the same open edge the far band rides
  }
  if (refused === 0 || !(keptMs > 0)) return null // a gate that refuses nothing prices nothing
  return { gate, refused, total: pairs.length, keptMs, totalMs: seat.msSum, owner: seat.owner }
}

// ONE verdict line, only when a gate could form and bite (null / a
// zero kept rent / a junk gate - the honest silence; the gate number
// pinned to the seat's own two thresholds, the junk shape reads null).
export function reachPreflightGateRow (gate) {
  if (!gate || !(gate.keptMs > 0) || !(gate.totalMs > 0)) return null
  if (gate.gate !== 5 && gate.gate !== 10) return null // the junk gate reads null - the v0.818.0 lesson
  if (!Number.isFinite(gate.refused) || !Number.isFinite(gate.total)) return null
  const secs = v => (v / 1000).toFixed(1)
  const pct = ((gate.keptMs / gate.totalMs) * 100).toFixed(1)
  return `the preflight's own distance gate (v0.823.0): a gate at d>${gate.gate} would have refused ${gate.refused} of ${gate.total} walks and kept ${secs(gate.keptMs)}s of ${secs(gate.totalMs)}s (${pct}%) of the rent unspent - the walk that cannot arrive should never rent the clock`
}
