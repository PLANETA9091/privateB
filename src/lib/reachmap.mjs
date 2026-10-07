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
