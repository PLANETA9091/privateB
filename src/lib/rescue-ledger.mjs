/**
 * The rescue end-state ledger (pure, no bot dependencies - unit-testable).
 *
 * Face 14 (the calmest face on record) mined '53 rescue starts / 27 completed'
 * and the number begged the question the tool could not answer: where do the
 * other 26 episodes go? decompose.mjs counted ONLY the 'rescue complete' end
 * line while the machinery names SEVEN more terminations in the same line
 * shape (miner.mjs's `done` ladder): the full-budget timeout (F10 x2 + F14
 * burned 25s+ each on face 14 - 'still wet, 14/44 passes, 0 probes'), the
 * surface-safe release, the frozen-physics standdown, the shallow-water
 * complete, the dead-in-rescue abort (the drowning attribution), the bot-gone
 * abort, the v0.59.0 catch-path error abort - plus episodes that never close
 * at all (a FATAL face kills the process mid-rescue; the start line is the
 * last word).
 *
 * This ledger pairs every 'water: drowning rescue start' with its terminus,
 * per bot, in file order (the log is chronological). The cure it arms is the
 * dedicated read of the rescue block: the next face's artifact names WHERE
 * the lost episodes go before any blind code change prices itself.
 *
 * Mining-surface only: zero fleet wiring, zero new log lines (the ledger
 * reads the lines the rescue block already owns - the v0.358.0/v0.360.0
 * mining precedent).
 */

/** The bot tag the fleet log rides (the decompose.mjs perBot idiom). */
const BOT_TAG_RE = /^F(\d+)\s/

/** The start line: 'water: drowning rescue start (verdict, oxygen N)'. */
export const RESCUE_START_RE = /water: drowning rescue start \(/

/**
 * The end-line classes, in match order (the `done` ladder's values verbatim,
 * then the catch-path). An end line is 'water: rescue <done> in Ns' except
 * the catch-path abort, which carries no duration. The dead class is the
 * drowning attribution; the timeout class carries the burned budget.
 */
export const RESCUE_END_CLASSES = [
  { key: 'completeStandingWet', re: /water: rescue complete \(standing wet/ },
  { key: 'complete', re: /water: rescue complete(?!d)/ },
  { key: 'released', re: /water: rescue released \(surface-safe/ },
  { key: 'frozenStanddown', re: /water: rescue standing down \(frozen physics/ },
  { key: 'timeout', re: /water: rescue timeout \(still wet/ },
  { key: 'dead', re: /water: rescue aborted \(dead/ },
  { key: 'botGone', re: /water: rescue aborted \(bot gone/ },
  { key: 'abortedError', re: /water: rescue aborted \(/ }
]

/** Mid-episode events worth counting that do NOT close an episode. */
export const RESCUE_MID_EVENTS = [
  { key: 'shoreStall', re: /water: shore transit stalled/ },
  { key: 'transitStall', re: /water: transit stalled \(d=/ },
  { key: 'blindLive', re: /water: rescue blind live/ },
  { key: 'noGroundTruth', re: /no ground truth ever gathered/ },
  { key: 'repeatWetStanddown', re: /water: repeat wet page at the same cell/ }
]

const ZERO_ENDS = () => ({
  complete: 0, completeStandingWet: 0, released: 0, frozenStanddown: 0,
  timeout: 0, dead: 0, botGone: 0, abortedError: 0, unclosed: 0
})

/**
 * Classify one log line as a rescue end (or null). Junk never invents an
 * end: only the verbatim shapes above classify (the body-guard law).
 */
export function rescueEndClass (line) {
  if (typeof line !== 'string') return null
  for (const c of RESCUE_END_CLASSES) {
    if (c.re.test(line)) return c.key
  }
  return null
}

/** The 'in Ns' duration tail of an end line (null when absent/junk). */
export function rescueEndSeconds (line) {
  if (typeof line !== 'string') return null
  const m = line.match(/ in ([\d.]+)s\b/)
  if (!m) return null
  const v = Number(m[1])
  return Number.isFinite(v) ? v : null
}

/**
 * Pair every start with its terminus, per bot, in file order.
 *
 * Returns { totals, perBot, midEvents, orphanEnds }:
 *   totals     - the fleet-wide end histogram (ZERO_ENDS shape + starts)
 *   perBot     - { F12: { starts, ...end histogram } } for every bot seen
 *   midEvents  - the mid-episode event counters (fleet-wide)
 *   orphanEnds - end lines with no open episode for that bot (truncation)
 *
 * A second start for a bot with an episode still open closes the old one as
 * unclosed (superseded) before opening the new - the relog/rebuild class.
 * An unclosed episode at EOF is the FATAL-face class (the process died
 * mid-rescue).
 */
export function rescueLedger (lines) {
  const totals = { starts: 0, ...ZERO_ENDS() }
  const perBot = {}
  const midEvents = {}
  let orphanEnds = 0
  if (!Array.isArray(lines)) return { totals, perBot, midEvents, orphanEnds }
  const open = new Map() // bot -> true while an episode is open

  const botOf = (l) => {
    const b = l.match(BOT_TAG_RE)
    return b ? 'F' + b[1] : null
  }
  const rowOf = (bot) => {
    if (!perBot[bot]) perBot[bot] = { starts: 0, ...ZERO_ENDS() }
    return perBot[bot]
  }

  for (const line of lines) {
    if (typeof line !== 'string') continue
    const mid = RESCUE_MID_EVENTS.find(e => e.re.test(line))
    if (mid) midEvents[mid.key] = (midEvents[mid.key] || 0) + 1

    if (RESCUE_START_RE.test(line)) {
      const bot = botOf(line)
      if (!bot) continue // a start without a tag names nobody - junk stays junk
      totals.starts++
      const row = rowOf(bot)
      row.starts++
      if (open.get(bot)) { // superseded: the old episode never terminated
        totals.unclosed++
        row.unclosed++
      }
      open.set(bot, true)
      continue
    }

    const end = rescueEndClass(line)
    if (!end) continue
    const bot = botOf(line)
    if (!bot || !open.get(bot)) { orphanEnds++; continue }
    totals[end]++
    rowOf(bot)[end]++
    open.set(bot, false)
  }

  for (const [bot, isOpen] of open) {
    if (isOpen) { totals.unclosed++; perBot[bot].unclosed++ }
  }

  return { totals, perBot, midEvents, orphanEnds }
}
