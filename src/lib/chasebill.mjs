//
// chasebill.mjs - THE CHASE'S OWN GEOMETRY (v0.712.0)
//
// The flee ledger (v0.481.0) prices every chase per-episode - the
// chased death carries killDelta (the inference's own join: the death
// distance minus the start distance) and the decompose prints each
// chased row with its own verdict ('THE MOB CLOSED IN' vs 'the flee
// gained, the trade lost'). But the FACE-LEVEL read never existed:
// how many of the era's escapes died to the SPEED GAP (the mob closed
// in - the escape never had a chance) and how many to the TRADE (the
// flee gained distance and the hp ran out anyway - the escape WORKED,
// the fight was lost before it began)? The flee-ground cross-read's
// verdict flipped across the era (the 37th 0/5 vs the 39th 2/3 - the
// spatial join is unstable on small samples); the geometry is the
// stable read underneath.
//
// chaseBill(flee) folds the flee ledger's EXISTING chased rows into
// that bill (the doorstepStormCensus signature law - the parsed cells
// in, one shape out, zero new regexes). The three skins: closedIn
// (killDelta < 0 - the speed gap's own verdict), gained (killDelta >
// 0 - the trade lost, the escape worked and died anyway), flat
// (killDelta === 0 - the exact re-contact, the mob never lost the
// grip); unpriced (the server-token deaths the inference never joined)
// rides as the honest audit row. A chased-free face reads the honest
// silence (null - nobody died mid-flee, the calm fleet never opens
// the bill). Junk-safe: non-object reads null.
//
// The era's own reads, raw-log reconciled: 7 chased deaths across the
// four mined faces - closedIn 4 (the 39th F13 drowned -0.7, the 37th
// F4 zombie -5.9, the 36th -0.1, the 34th -3.3), gained 2 (the 39th
// F4 skeleton +2.8, the 37th F7 zombie +13.2 - the era's spectacular
// trade lost), flat 1 (the 37th F13 zombie 0.0, the exact
// re-contact), unpriced 0. THE SPEED GAP OWNS 4 OF 7 (57%) - the
// disengage leak's own geometry: the escape lane loses to feet more
// often than to hp.
//

/**
 * chaseBill(flee) - the chased deaths' geometry bill.
 * @param {{rows: Array}} [flee] the fleeLedger result
 * @returns {null|{chased: number, gained: number, closedIn: number,
 *   flat: number, unpriced: number, bots: Object<string, number>}}
 *   the bill (null on junk or on a chased-free face - the honest
 *   silence)
 */
export function chaseBill (flee) {
  if (!flee || typeof flee !== 'object' || !Array.isArray(flee.rows)) return null
  const chased = flee.rows.filter(r => r && r.outcome === 'chased')
  if (chased.length === 0) return null
  const bill = { chased: chased.length, gained: 0, closedIn: 0, flat: 0, unpriced: 0, bots: {} }
  for (const r of chased) {
    if (r.bot) bill.bots[r.bot] = (bill.bots[r.bot] || 0) + 1
    const d = r.killDelta
    if (d === null || d === undefined || Number.isNaN(Number(d))) bill.unpriced++
    else if (Number(d) > 0) bill.gained++
    else if (Number(d) < 0) bill.closedIn++
    else bill.flat++
  }
  return bill
}
