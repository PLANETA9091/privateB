//
// kickbill.mjs - THE KICK'S OWN CHURN (v0.717.0)
//
// The frozen census (v0.426.0) already counts the duplicate-login kick
// (the kicked-lane emitter, byBot) beside the frozen client relogs it
// sits next to - but no fold ever read the TWO churn lanes TOGETHER:
// the relog is the saver's own churn (the client ending its session,
// the v0.715.0 bill's subject), the kick is the lane's own collision
// (the server refusing the login because the old session still holds -
// the reconnect lane's price, not its choice). The 42nd face made the
// split impossible to ignore: 30 kicks against 7 relogs, and the
// populations barely overlap - F17 (11 kicks) and F9 (9) never relogged,
// while F5 and F14 relogged and were never kicked. Two churns, two
// owners, one fleet.
//
// kickBill(frozen) folds the census's EXISTING cells (the
// doorstepStormCensus signature law - the parsed cells in, one shape
// out, zero new regexes): kicks and relogs side by side, the PAIRED
// bots (both lanes' customers - the double churn), the SPLIT (kick-only
// vs relog-only - whose churn is whose), the churn total, and the
// REPEATS (the bots riding 2+ churn events of either kind - the
// v0.715.0 repeats law extended to both lanes; a single event is the
// lane doing its job, the second is the churn reproducing). A
// kick-free face reads the honest silence (null - the bill opens on
// the kick lane only; a relog-only face stays its own bill's).
//
// WHY THE PAIRING IS THE METER: the paired bot churns from BOTH sides
// (its session fights the server on every reconnect - the cure's own
// friction), the kick-only whale churns without ever freezing (the
// stale session or the duplicate spawn the fleet never closed), the
// relog-only bot is the wet family's pure customer. The bill prices
// the split per face so the churn's cure reads its own evidence.
//

/**
 * kickBill(frozen) - the duplicate-login kick's own churn bill.
 * @param {{dupKicks?: {n?: number, byBot?: Object<string, number>},
 *          relogs?: {n?: number, byBot?: Object<string, number>}}|null} [frozen]
 *   the frozenCensus result
 * @returns {null|{kicks: number, kickBots: Object<string, number>,
 *   relogs: number, churn: number, paired: {n: number, byBot: Object<string, {kicks: number, relogs: number}>},
 *   kickOnly: {n: number, bots: Object<string, number>},
 *   relogOnly: {n: number, bots: Object<string, number>},
 *   repeats: {n: number, byBot: Object<string, number>, owned: number, share: number}}}
 *   the bill (null on a kick-free face - the honest silence)
 */
export function kickBill (frozen) {
  const kN = Number(frozen && frozen.dupKicks && frozen.dupKicks.n) || 0
  if (!(kN > 0)) return null
  const kBots = (frozen && frozen.dupKicks && frozen.dupKicks.byBot) || {}
  const rN = Number(frozen && frozen.relogs && frozen.relogs.n) || 0
  const rBots = (frozen && frozen.relogs && frozen.relogs.byBot) || {}
  const churnByBot = {}
  for (const [b, k] of Object.entries(kBots)) churnByBot[b] = (churnByBot[b] || 0) + k
  for (const [b, r] of Object.entries(rBots)) churnByBot[b] = (churnByBot[b] || 0) + r
  const paired = {}
  const kickOnly = {}
  for (const [b, k] of Object.entries(kBots)) {
    if (rBots[b]) paired[b] = { kicks: k, relogs: rBots[b] }
    else kickOnly[b] = k
  }
  const relogOnly = {}
  for (const [b, r] of Object.entries(rBots)) if (!kBots[b]) relogOnly[b] = r
  const repeats = {}
  let owned = 0
  for (const [b, c] of Object.entries(churnByBot)) {
    if (c >= 2) { repeats[b] = c; owned += c }
  }
  const churnN = kN + rN
  return {
    kicks: kN,
    kickBots: { ...kBots },
    relogs: rN,
    churn: churnN,
    paired: { n: Object.keys(paired).length, byBot: paired },
    kickOnly: { n: Object.keys(kickOnly).length, bots: kickOnly },
    relogOnly: { n: Object.keys(relogOnly).length, bots: relogOnly },
    repeats: { n: Object.keys(repeats).length, byBot: repeats, owned, share: churnN > 0 ? owned / churnN : 0 }
  }
}
