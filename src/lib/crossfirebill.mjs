//
// crossfirebill.mjs - THE CROSSFIRE'S OWN BILL (v0.714.0)
//
// The flee ledger (v0.481.0) closes every mid-flee death with one of two
// combat outcomes: chased (the fleeing bot's own threat took it - the
// v0.712.0 chasebill priced that class's geometry) or CROSSFIRE (the bot
// died to a DIFFERENT hostile - the second hostile's kill, the exit ran
// into someone else's reach). The crossfire class stayed raw: decompose
// prints each row verbatim ('F13 fled skeleton @4 (hp 7) - died to zombie
// (the second hostile's kill)') and no fold ever answered the face-level
// questions: WHO owns the second hostile's toll (the killer's own
// split), WHAT the bots were fleeing when the exit cost them (the fled
// mob's own split), and does the crowd sensor hold (the ledger's own
// founding law: the crossfire class's sensor is the nearby count - face
// 43's both crossfire deaths fled @2 nearby while the chased deaths flew
// solo; the crowd read the exit).
//
// crossfireBill(flee) folds the flee ledger's EXISTING crossfire rows
// into that bill (the doorstepStormCensus signature law - the parsed
// cells in, one shape out, zero new regexes). The fields: byKiller (the
// second hostile's server token, the authority - the v0.117.0 doctrine),
// byMob (the fled threat), byKind (the death kind's own split - the
// explosion kind's crossfire is the flee into the blast), crowd (solo
// nearby <= 1 / crowd nearby >= 2 / unpriced - the ledger's own crowd
// keys), unpricedKiller (the server never named the second hostile -
// the honest audit row), bots. A crossfire-free face reads the honest
// silence (null - the chased bill's own law: the fleet exits clean, the
// bill never opens). Junk-safe: non-object reads null.
//

/**
 * crossfireBill(flee) - the crossfire deaths' own bill.
 * @param {{rows: Array}} [flee] the fleeLedger result
 * @returns {null|{n: number, byKiller: Object<string, number>,
 *   byMob: Object<string, number>, byKind: Object<string, number>,
 *   crowd: {solo: number, crowd: number, unpriced: number},
 *   unpricedKiller: number, bots: Object<string, number>}}
 *   the bill (null on junk or on a crossfire-free face - the honest
 *   silence)
 */
export function crossfireBill (flee) {
  if (!flee || typeof flee !== 'object' || !Array.isArray(flee.rows)) return null
  const rows = flee.rows.filter(r => r && r.outcome === 'crossfire')
  if (rows.length === 0) return null
  const bill = {
    n: rows.length,
    byKiller: {},
    byMob: {},
    byKind: {},
    crowd: { solo: 0, crowd: 0, unpriced: 0 },
    unpricedKiller: 0,
    bots: {}
  }
  const bump = (book, key) => { if (key) book[key] = (book[key] || 0) + 1 }
  for (const r of rows) {
    if (r.killer) bump(bill.byKiller, r.killer)
    else bill.unpricedKiller++
    bump(bill.byMob, r.mob)
    // the kind's own head word (the server token's family: mob /
    // explosion) - the full token rides the killer's name ('mob by
    // Zombie'), the bill's kind leg stays the family split
    bump(bill.byKind, typeof r.deathKind === 'string' ? r.deathKind.split(' by ')[0] : r.deathKind)
    if (r.bot) bill.bots[r.bot] = (bill.bots[r.bot] || 0) + 1
    const nb = r.nearby
    if (nb === null || nb === undefined || Number.isNaN(Number(nb))) bill.crowd.unpriced++
    else if (Number(nb) >= 2) bill.crowd.crowd++
    else bill.crowd.solo++
  }
  return bill
}
