/**
 * swirlbill.mjs - (v0.726.0) THE INSTANT CHURN'S OWN BILL - the rescue lane's
 * zero-close loop, pure.
 *
 * MEASURED (fleet 37524391418, the v0.724.0 face, the hard-kill one): F13 rode
 * 83 drowning-rescue starts and closed 78 of them in 0.0s - the trigger said
 * 'drowning' and the lane said 'surface-safe' in the same breath, 78 times in
 * one face (the liar ladder ratcheted 81 on the same bot, the freeze gate's
 * era note), and the bot DIED of drown anyway ('rescue aborted (dead
 * mid-rescue) in 2.3s'). The face's raw counters printed the numbers
 * ('rescue complete 0.0s: 81') but no cell owned the CLASS: a rescue lane
 * that re-arms faster than it swims is a churn, not a cure - the trigger's
 * precision loss priced by the lane's own completion speed.
 *
 * THE LAWS THIS BILL OBEYS:
 *   - the pair is per-bot: an instant close joins the nearest OPEN start of
 *     the SAME bot (a start still awaiting its close); a close with no open
 *     start is the lane's own leak and counts orphan, never instant.
 *   - the verdict is a concentration, not a volume (the pinbill law): a bot
 *     whose instant closes reach SWIRL_MIN_INSTANT AND own SWIRL_SHARE of
 *     its starts reads THE INSTANT CHURN - the trigger's drowning and the
 *     lane's surface-safe in the same breath. Below either bar the cell
 *     stays honestly empty (a minority instant close is a boundary case,
 *     not a stance - the 47th's F1 3 of 16 stays out on both bars).
 *   - junk never invents (the census law): a line that neither opens a
 *     rescue nor closes one instantly reads nothing; the fold never throws.
 *   - the honest silence: zero instant closes reads instant 0 and empty
 *     verdicts - the caller prints the none-form or stays silent.
 *
 * (v0.736.0) THE CRIED-WOLF DEATH - the churn's own aftermath join (the
 * skywalk law: two lenses, one read, no re-parsing - the swirl verdicts and
 * the o2 gap's per-bot deaths are the inputs, both already parsed).
 *
 * THE 52ND IS THE MOTIVE (fleet 37549177806, the v0.733.0 tree's face): F6
 * rode 44 rescue starts and closed 43 of them in 0.0s (97.7% - the era's
 * biggest false-alarm volume, the instant churn's FIRST verdict ever after
 * two honest silences) - and died the real drowning with the trigger SILENT
 * ('rescue never', the o2 census's own class - o2 reset(-1), the sight-loss
 * wiring caught it, the window FITS, and the lane never flew). The same
 * sensor's two failures joined: it cried drowning 43 times (the lane answered
 * surface-safe in the same breath every time - the liar ladder ratcheted 44
 * beside it, zero resets) and said nothing at the one true drowning. The
 * false alarms owned the churn; the silence owned the death. Two cells held
 * one half each - no cell owned the join.
 *
 * THE LAW: the join fires only on the churn's own verdict bots (the
 * concentration bars - instant >= SWIRL_MIN_INSTANT AND share >= SWIRL_SHARE -
 * ride unchanged; a low-volume never-death stays the o2 census's own row) whose
 * drown-context death read rescueKind 'never'. The other relations stay other
 * cells' subjects: 'live' is the lane's own flight failure (the lane WAS
 * flying - the dead-in-rescue class), 'stale' is the re-entry class (the
 * v0.477.0 split owns it), and no death at all is the churn alone (the
 * v0.726.0 cell owns it - the verdict never invents a death). The fable needs
 * BOTH halves: the crying AND the silence.
 *
 * Junk-safe: non-array verdicts / non-object perBot -> the zero shape; the
 * fold never throws. Pure: reads, never mutates.
 */

export const SWIRL_MIN_INSTANT = 10
export const SWIRL_SHARE = 0.5
export const CRIED_WOLF_VERDICT = 'THE CRIED-WOLF DEATH'

const SWIRL_START_RE = /^(F\d+) \[F\d+\] water: drowning rescue start/
const SWIRL_INSTANT_RE = /^(F\d+) \[F\d+\] water: rescue complete in 0\.0s$/

/**
 * @param {string[]} lines - the fleet log's own lines (junk-safe)
 * @returns {{starts: number, instant: number, orphan: number,
 *   bots: Object<string, {starts: number, instant: number, open: number}>,
 *   verdicts: Array<{bot: string, instant: number, of: number, share: number}>}}
 *   the fold's one shape: the mass, the churn, the leak, the per-bot cells
 *   and the concentration verdicts (sorted instant desc, bot asc).
 */
export function swirlBill (lines) {
  const rows = Array.isArray(lines) ? lines : []
  const bots = {}
  let starts = 0
  let instant = 0
  let orphan = 0
  for (const l of rows) {
    if (typeof l !== 'string' || !l.length) continue
    let m = SWIRL_START_RE.exec(l)
    if (m) {
      const bot = m[1]
      const b = bots[bot] || (bots[bot] = { starts: 0, instant: 0, open: 0 })
      b.starts++
      b.open++
      starts++
      continue
    }
    m = SWIRL_INSTANT_RE.exec(l)
    if (m) {
      const bot = m[1]
      const b = bots[bot] || (bots[bot] = { starts: 0, instant: 0, open: 0 })
      if (b.open > 0) {
        b.open--
        b.instant++
        instant++
      } else {
        orphan++
      }
      continue
    }
  }
  const verdicts = []
  for (const [bot, b] of Object.entries(bots)) {
    if (b.instant >= SWIRL_MIN_INSTANT && b.starts > 0 && (b.instant / b.starts) >= SWIRL_SHARE) {
      verdicts.push({ bot, instant: b.instant, of: b.starts, share: b.instant / b.starts })
    }
  }
  verdicts.sort((a, b) => b.instant - a.instant || (a.bot < b.bot ? -1 : 1))
  return { starts, instant, orphan, bots, verdicts }
}

/**
 * (v0.736.0) criedWolf(verdicts, o2PerBot) - the churn's own aftermath join.
 *
 * @param {Array<{bot: string, instant: number, of: number, share: number}>} verdicts
 *   the swirl bill's own concentration verdicts (the bars already held)
 * @param {Object<string, {rescueKind: string}>} o2PerBot
 *   the o2 gap's per-bot drown-context deaths (rescueKind 'live'|'stale'|'never')
 * @returns {Array<{bot: string, instant: number, of: number, share: number,
 *   verdict: string}>} the cried-wolf rows (the churn's verdict order kept)
 */
export function criedWolf (verdicts, o2PerBot) {
  if (!Array.isArray(verdicts)) return []
  if (!o2PerBot || typeof o2PerBot !== 'object') return []
  const rows = []
  for (const v of verdicts) {
    if (!v || typeof v !== 'object' || typeof v.bot !== 'string') continue
    const d = o2PerBot[v.bot]
    if (d && typeof d === 'object' && d.rescueKind === 'never') {
      rows.push({ bot: v.bot, instant: v.instant, of: v.of, share: v.share, verdict: CRIED_WOLF_VERDICT })
    }
  }
  return rows
}
