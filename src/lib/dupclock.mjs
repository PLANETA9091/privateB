//
// dupclock.mjs - THE DUPLICATE'S OWN CLOCK (v0.729.0)
//
// The kick bill (v0.717.0) prices the churn's EVENTS from the fleet
// log's own cells (kicks + relogs, the pair, the split, the repeats) -
// but the fleet log has NO clock and NO join side: the KICKED line
// prints only when the kick packet reaches a living client, and the
// churn's other half (the session that TOOK OVER, the seconds between
// the losses) lives in the server log the fleet never reads. The 48th
// face made the blind spot impossible to ignore: the fleet lens printed
// 9 kicked lines, the server's clock owns 12 duplicate losses - F3 lost
// FOUR sessions in 36 seconds (21:24:36..21:25:12) and kept walking
// water between them, F19 lost three in 35s - and the fleet saw one of
// F19's three. A churn whose cadence is invisible stays uncured: the
// freeze ladder's own lesson (v0.724.0) priced the patience; this lens
// prices the re-spawn loop's own rhythm.
//
// dupClock(serverLines) parses the SERVER log's duplicate-loss bytes -
// '[HH:MM:SS] [Server thread/INFO]: <bot> lost connection: You logged
// in from another location' - and folds them per bot: the losses with
// their wall-clock stamps, the CADENCE (the gap to the bot's previous
// loss, the re-spawn loop's own clock), the BURSTS (DUP_BURST_MIN=3+
// consecutive same-bot losses each gap <= DUP_BURST_WINDOW_S=60s - the
// freeze ladder's top gate is the same patience scale, the honest echo)
// and the STORM (the busiest 60s window across ALL bots - the fleet's
// own mass re-spawn). Other loss reasons are NOT the churn (a different
// class entirely) - the lens leaves them out and counts them honestly
// as otherLosses. A loss-free server log reads the honest silence
// (null - nothing to price, the churn never ran).
//
// THE CLOCK IS MONOTONE BY CONSTRUCTION: the timestamps are HH:MM:SS
// wall clock; a face crossing midnight wraps +86400 (a 10-minute face
// never does - the carry is coded so the gap math cannot go negative
// silently). The loss order is the file's own append order.
//

export const DUP_BURST_MIN = 3
export const DUP_BURST_WINDOW_S = 60

// (v0.732.0) THE METRONOME SKIN - the 50th face (run 37539316731) showed
// the burst's own second disease: F5 lost ELEVEN sessions in 109s at a
// fixed period (gaps 17s 10s 8s 8s 13s 10s 12s 8s 10s 13s - median 10s,
// spread 2.1). The freeze ladder's patience DOUBLES (10s -> 20s -> 40s ->
// 60s, the v0.724.0 skin); this one REPEATS on a clock - a re-spawn
// timer re-creating the session every ~10s, each new login killing the
// last. Two re-spawn diseases, two cures: the ladder needs patience,
// the metronome needs its timer's owner named. A burst is METRONOMIC
// when it carries DUP_METRO_MIN losses (8+ - the 48th's 4-loss churn
// stays the plain burst) and its gaps hold within DUP_METRO_SPREAD
// (max/min <= 2.5 - a zero-gap burst has no period and never reads
// metronomic).
export const DUP_METRO_MIN = 8
export const DUP_METRO_SPREAD = 2.5

const DUP_LOSS_RE = /^\[(\d{2}):(\d{2}):(\d{2})\] \[Server thread\/INFO\]: (\S+) lost connection: You logged in from another location$/
const OTHER_LOSS_RE = /^\[\d{2}:\d{2}:\d{2}\] \[Server thread\/INFO\]: \S+ lost connection:/

function mkBurst (bot, run) {
  const gaps = []
  for (let i = 1; i < run.length; i++) gaps.push(run[i].monoS - run[i - 1].monoS)
  const sorted = [...gaps].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  const medianGapS = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
  const gmin = sorted.length ? sorted[0] : 0
  const gmax = sorted.length ? sorted[sorted.length - 1] : 0
  const periodic = run.length >= DUP_METRO_MIN && gmin > 0 && gmax / gmin <= DUP_METRO_SPREAD
  return {
    bot,
    n: run.length,
    spanS: run[run.length - 1].monoS - run[0].monoS,
    first: run[0].at,
    last: run[run.length - 1].at,
    gaps,
    medianGapS,
    periodic
  }
}

/**
 * dupClock(serverLines) - the duplicate-loss churn's own clock.
 * @param {string[]|null} [serverLines] the server log's lines (latest.log)
 * @returns {null|{losses: {n: number, byBot: Object<string, number>,
 *   first: string, last: string, cadence: Object<string, number[]>},
 *   bursts: {n: number, list: Array<{bot: string, n: number, spanS: number,
 *   first: string, last: string, gaps: number[], medianGapS: number,
 *   periodic: boolean}>},
 *   storm: {n: number, bots: number, first: string, last: string},
 *   otherLosses: number}} the clock (null on a loss-free log)
 */
export function dupClock (lines) {
  if (!Array.isArray(lines)) return null
  const losses = []
  let otherLosses = 0
  let carry = 0
  let prevS = -1
  for (const l of lines) {
    const line = typeof l === 'string' ? l : ''
    if (!OTHER_LOSS_RE.test(line)) continue
    const m = DUP_LOSS_RE.exec(line)
    if (!m) { otherLosses++; continue }
    const s = Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3])
    if (prevS >= 0 && s < prevS) carry += 86400
    prevS = s
    const monoS = s + carry
    losses.push({ bot: m[4], at: `${m[1]}:${m[2]}:${m[3]}`, monoS, gapS: null })
  }
  if (!losses.length) return null
  const byBot = {}
  for (const c of losses) byBot[c.bot] = (byBot[c.bot] || 0) + 1
  const cadence = {}
  const lastByBot = {}
  for (const c of losses) {
    const prev = lastByBot[c.bot]
    if (prev) {
      c.gapS = c.monoS - prev.monoS
      ;(cadence[c.bot] = cadence[c.bot] || []).push(c.gapS)
    }
    lastByBot[c.bot] = c
  }
  const burstList = []
  const byBotRuns = {}
  for (const c of losses) (byBotRuns[c.bot] = byBotRuns[c.bot] || []).push(c)
  for (const [bot, cells] of Object.entries(byBotRuns)) {
    let run = [cells[0]]
    for (let i = 1; i < cells.length; i++) {
      if (cells[i].gapS !== null && cells[i].gapS <= DUP_BURST_WINDOW_S) run.push(cells[i])
      else {
        if (run.length >= DUP_BURST_MIN) burstList.push(mkBurst(bot, run))
        run = [cells[i]]
      }
    }
    if (run.length >= DUP_BURST_MIN) burstList.push(mkBurst(bot, run))
  }
  burstList.sort((a, b) => b.n - a.n || (a.bot < b.bot ? -1 : 1))
  let storm = null
  let i = 0
  for (let j = 0; j < losses.length; j++) {
    while (losses[j].monoS - losses[i].monoS > DUP_BURST_WINDOW_S) i++
    const n = j - i + 1
    if (!storm || n > storm.n) {
      const bots = new Set(losses.slice(i, j + 1).map((c) => c.bot))
      storm = { n, bots: bots.size, first: losses[i].at, last: losses[j].at }
    }
  }
  return {
    losses: { n: losses.length, byBot, first: losses[0].at, last: losses[losses.length - 1].at, cadence },
    bursts: { n: burstList.length, list: burstList },
    storm,
    otherLosses
  }
}

// (v0.734.0) THE UNSEEN LOSS'S OWN COLUMN - the 51st face (run 37543519356)
// grew the delta the fleet lens never names: the server's clock owns 18
// duplicate losses, the fleet printed 14 kicked lines - 4 losses the fleet
// NEVER SAW, and the delta line counts them without naming WHO. An unseen
// loss is the churn's own blind spot: the kick packet never reached a
// living client (the dead-client class) or the session died mid-relog -
// the bot the fleet's own census is blind to is the cure's blind spot too.
// unseenLosses(serverByBot, fleetByBot) joins the server clock's per-bot
// loss map against the fleet lens's dup-kick per-bot map (frozenCensus's
// own dupKicks.byBot - the dup class only): the per-bot delta is the bot's
// unseen column. A bot the fleet counted fully never enters; a fleet count
// above the server's own clamps at zero (a kick implies a loss - the
// physics' own bound, never negative). Zero unseen reads the honest
// silence (null - the lens saw every loss, the column never invents rows).
export function unseenLosses (serverByBot, fleetByBot) {
  const fleet = fleetByBot || {}
  const byBot = {}
  let n = 0
  for (const [bot, sv] of Object.entries(serverByBot || {})) {
    const d = sv - (fleet[bot] || 0)
    if (d > 0) { byBot[bot] = d; n += d }
  }
  return n > 0 ? { n, byBot } : null
}

// (v0.735.0) THE SURPLUS KICK'S OWN SIDE - the 52nd face (run 37549177806)
// flipped the unseen column's own join: the fleet printed SIX dup kicks,
// the server's clock owns only FIVE losses - the fleet lens saw MORE than
// the server. A surplus kick is a KICKED byte whose server loss line never
// landed in the duplicate class (the pair rider's own case: F2 kicked once
// while relogging twice, the server's loss byte carried a different reason
// or none) - the mirror of the unseen loss, and the join's other bound.
// surplusKicks(fleetByBot, serverByBot) walks the same clamp symmetrically:
// the per-bot surplus is the bot's fleet-side column; a server count above
// the fleet's own clamps at zero (the clock cannot lose a kick that never
// printed); zero surplus reads the honest silence (null - the lens never
// invents a surplus). The two columns TOGETHER close the join: unseen =
// what the server owned and the fleet missed, surplus = what the fleet
// printed and the server's clock never owned.
export function surplusKicks (fleetByBot, serverByBot) {
  const server = serverByBot || {}
  const byBot = {}
  let n = 0
  for (const [bot, fk] of Object.entries(fleetByBot || {})) {
    const d = fk - (server[bot] || 0)
    if (d > 0) { byBot[bot] = d; n += d }
  }
  return n > 0 ? { n, byBot } : null
}
