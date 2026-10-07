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

// (v0.741.0) THE SHUTDOWN'S OWN FENCE - the server log's non-dup loss class
// (the graceful 'Disconnected' byte) is NOT one thing: mid-run it is the
// freeze-relog lane's own server-side echo (the 55th face: F1 relogged
// three times and the server owned exactly three Disconnected bytes for
// F1, F2 3/3 the same) - but at the deadline the fleet stops and EVERY
// bot drops at once (the 55th: 18 bots in one second, F13's drain byte a
// second later), a mass the churn never touched. The fence arms on SHAPE:
// a wall-clock second carrying ECHO_SHUTDOWN_MIN or more DISTINCT bots'
// non-dup losses is the shutdown's own mass, and once armed the fence
// stays armed - every later loss is the stop's own drain (the mass is
// monotone, nothing meaningful follows it). The bytes before the mass are
// the relog lane's own echo, priced per bot against the fleet's freeze
// relogs (the join in decompose's print - the skywalk law, the lib stays
// pure on the server log's own bytes).
export const ECHO_SHUTDOWN_MIN = 5

const DUP_LOSS_RE = /^\[(\d{2}):(\d{2}):(\d{2})\] \[Server thread\/INFO\]: (\S+) lost connection: You logged in from another location$/
const OTHER_LOSS_RE = /^\[\d{2}:\d{2}:\d{2}\] \[Server thread\/INFO\]: \S+ lost connection:/
// (v0.741.0) the echo's who-byte - the same loss-line shape, the NON-dup
// reason clause (the negative lookahead keeps the dup class out; one
// parser per shape - the dup parser owns its clause, this owns the rest)
const OTHER_LOSS_WHO_RE = /^\[(\d{2}):(\d{2}):(\d{2})\] \[Server thread\/INFO\]: (\S+) lost connection: (?!You logged in from another location).+$/

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
 *   otherLosses: number,
 *   echo: {n: number, byBot: Object<string, number>, midrunN: number,
 *   midrunByBot: Object<string, number>, shutdownN: number,
 *   shutdownByBot: Object<string, number>}}} the clock (null on a
 *   loss-free log; echo is the v0.741.0 additive tail - the non-dup
 *   losses' own fold, zero-shaped when the class never rode)
 */
export function dupClock (lines) {
  if (!Array.isArray(lines)) return null
  const losses = []
  const others = [] // (v0.741.0) the echo's own bytes, collected in the same walk
  let otherLosses = 0
  let carry = 0
  let prevS = -1
  for (const l of lines) {
    const line = typeof l === 'string' ? l : ''
    if (!OTHER_LOSS_RE.test(line)) continue
    const m = DUP_LOSS_RE.exec(line)
    if (!m) {
      otherLosses++
      const om = OTHER_LOSS_WHO_RE.exec(line)
      if (om) others.push({ bot: om[4], at: `${om[1]}:${om[2]}:${om[3]}`, monoS: Number(om[1]) * 3600 + Number(om[2]) * 60 + Number(om[3]) + carry })
      continue
    }
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
  // (v0.741.0) THE RELOG'S OWN ECHO - the non-dup losses' own fold, split
  // by the shutdown's fence (ECHO_SHUTDOWN_MIN distinct bots in one second
  // arms it; once armed every later loss is the stop's own drain). The
  // mid-run bytes are the freeze-relog lane's server-side echo; the mass
  // is the deadline's own. Additive tail - the clock's older fields stay
  // byte-stable beside it.
  const echoByBot = {}
  for (const o of others) echoByBot[o.bot] = (echoByBot[o.bot] || 0) + 1
  const bySecond = new Map()
  for (const o of others) {
    const cells = bySecond.get(o.monoS)
    if (cells) cells.push(o.bot)
    else bySecond.set(o.monoS, [o.bot])
  }
  const midrunBots = []
  const shutdownBots = []
  let armed = false
  for (const monoS of [...bySecond.keys()].sort((a, b) => a - b)) {
    const cells = bySecond.get(monoS)
    if (!armed && new Set(cells).size >= ECHO_SHUTDOWN_MIN) armed = true
    ;(armed ? shutdownBots : midrunBots).push(...cells)
  }
  const fold = (arr) => {
    const map = {}
    for (const b of arr) map[b] = (map[b] || 0) + 1
    return map
  }
  return {
    losses: { n: losses.length, byBot, first: losses[0].at, last: losses[losses.length - 1].at, cadence },
    bursts: { n: burstList.length, list: burstList },
    storm,
    otherLosses,
    echo: {
      n: others.length,
      byBot: echoByBot,
      midrunN: midrunBots.length,
      midrunByBot: fold(midrunBots),
      shutdownN: shutdownBots.length,
      shutdownByBot: fold(shutdownBots)
    }
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

// (v0.739.0) THE BURST'S OWN DOOR - the 54th face (run 37557552795) grew
// the metronome's own near-miss: F1 lost ELEVEN sessions in 81s
// (01:55:27..01:56:48) and the whole-gap spread (15/5 = 3.0) failed the
// metronome's bar - but the burst's own anatomy is a clock behind a door:
// the FIRST gap (15s) is the lead-in - the re-spawn cycle's warm-up - and
// the TAIL (9 gaps: 5..9s, median 7s, spread 1.8) locks the fixed period
// the metronome skin exists to name. The whole-gap spread never sees past
// the door: the widest ride precedes the lock, so the bar prices the
// lead-in's noise and misses the timer entirely - the read fell back to
// the plain burst row and the re-spawn rhythm stayed unnamed. burstDoor()
// walks the clock's OWN burst list (the v0.736.0 skywalk law - two lenses,
// one read, no re-parsing): a NON-periodic burst at the metronome's own
// volume bar (n >= DUP_METRO_MIN) whose TAIL (gaps[1..], the door's own
// aftermath, 2+ gaps) holds within DUP_METRO_SPREAD reads the door - the
// lead-in's width, the tail's clock. THE FENCES: a periodic burst stays
// the metronome's own row (the clock named whole - the door adds nothing);
// a noisy tail (spread past the bar) stays the plain burst (no clock
// anywhere - the silence never invents one); the lead-in must be the
// burst's own widest gap (the door's own story - the widest ride PRECEDES
// the lock; by the two bars above it must, and the guard keeps the story
// explicit). Junk-safe: non-arrays, non-objects and gap-less cells read
// the honest silence (null).
export function burstDoor (burstList) {
  if (!Array.isArray(burstList)) return null
  const doors = []
  for (const b of burstList) {
    if (!b || typeof b !== 'object') continue
    if (b.periodic) continue
    const gaps = Array.isArray(b.gaps) ? b.gaps.filter((g) => Number.isFinite(g) && g > 0) : []
    if (gaps.length + 1 < DUP_METRO_MIN) continue
    const tail = gaps.slice(1)
    if (tail.length < 2) continue
    const tmin = Math.min(...tail)
    const tmax = Math.max(...tail)
    if (tmax / tmin > DUP_METRO_SPREAD) continue
    if (gaps[0] < Math.max(...gaps)) continue
    const sorted = [...tail].sort((a, b) => a - b)
    const mid = Math.floor(sorted.length / 2)
    const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
    doors.push({
      bot: b.bot,
      n: b.n,
      spanS: b.spanS,
      leadInS: gaps[0],
      tailN: tail.length,
      tailMedianS: median,
      tailMinS: tmin,
      tailMaxS: tmax
    })
  }
  return doors.length ? { n: doors.length, list: doors } : null
}
