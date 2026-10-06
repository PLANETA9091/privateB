//
// relogbill.mjs - THE RELOG'S OWN LOOP BILL (v0.715.0)
//
// The frozen family owns three lenses: the frozen census (v0.426.0 - the
// relog verdicts' anatomy, byBot, the gate promise), the walk-out witness
// (v0.437.0 - the stall lines' window/displacement/rung read), and the
// enforcer itself (v0.425.0). The founding warning rode the v0.425.0
// header from day one - 'the relog lane was feeding the loop it exists to
// break' (F10's three consecutive relogs on ONE water column) - but no
// fold ever priced the LOOP per face: how many relogs came home to a
// re-freeze (the per-bot REPEATS), how many walk-out windows stalled
// (the promise's own delivery rate), how deep the ladder reached.
//
// relogBill(frozen, walkout) joins the two censuses' EXISTING cells (the
// doorstepStormCensus signature law - the parsed cells in, one shape
// out, zero new regexes): relogs (the frozen census's count), stalls
// (the witness census's stall lines - a walked-out verdict prints
// nothing, so the stalls are the promise's FAILED deliveries by shape),
// rungs (the ladder's depth split r1/r2/r3), repeats (the bots that
// relogged 2+ times - the loop's own skin) and repeatRelogs (the relogs
// those repeat bots own - the loop's share of the lane). A relog-free
// face reads the honest silence (null - the calm fleet never opens the
// bill). Junk-safe: non-object census reads the honest zero legs, a
// zero-relog face stays silent.
//
// WHY THE REPEATS ARE THE METER: a single relog is the saver doing its
// job (the v0.361.0 grace); the SECOND relog from the same bot is the
// loop's own signature - the fresh client came home to the same column,
// the v0.425.0 hole reproduced. The bill prices that share per face so
// the cure's target (the walk-out enforcement, the hold's bypass) reads
// its own evidence, not the lane's gross traffic.
//

/**
 * relogBill(frozen, walkout) - the relog lane's loop bill.
 * @param {{relogs?: {n?: number, byBot?: Object<string, number>}}|null} [frozen]
 *   the frozenCensus result
 * @param {{windows?: {n?: number, byRung?: Object<string, number>}}|null} [walkout]
 *   the walkoutWitnessCensus result
 * @returns {null|{relogs: number, stalls: number, stallRate: number|null,
 *   rungs: {r1: number, r2: number, r3: number}, repeats: number,
 *   repeatBots: Object<string, number>, repeatRelogs: number}}
 *   the bill (null on a relog-free face - the honest silence)
 */
export function relogBill (frozen, walkout) {
  const rlN = Number(frozen && frozen.relogs && frozen.relogs.n) || 0
  if (!(rlN > 0)) return null
  const rlBots = (frozen && frozen.relogs && frozen.relogs.byBot) || {}
  const win = (walkout && walkout.windows) || {}
  const stallsN = Number(win.n) || 0
  const byRung = win.byRung || {}
  const bill = {
    relogs: rlN,
    stalls: stallsN,
    stallRate: stallsN > 0 ? stallsN / rlN : 0,
    rungs: { r1: Number(byRung['1']) || 0, r2: Number(byRung['2']) || 0, r3: Number(byRung['3']) || 0 },
    repeats: 0,
    repeatBots: {},
    repeatRelogs: 0
  }
  for (const [bot, n] of Object.entries(rlBots)) {
    if (Number(n) >= 2) {
      bill.repeats++
      bill.repeatBots[bot] = Number(n)
      bill.repeatRelogs += Number(n)
    }
  }
  return bill
}
