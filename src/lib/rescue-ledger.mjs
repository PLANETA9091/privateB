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
 * (v0.728.0) THE SAVED FACE's drown-kind byte - the server verdict's own
 * kind field (the deathcensus.mjs grammar, verbatim: 'server: drowned
 * [kind=drown]'). The full death-line shape is the fence: a prose line
 * quoting the kind (the anatomy sweep's keyword carriers) never counts,
 * and the mob-by-Drowned kill ('[kind=mob by Drowned]' - the hound won)
 * rides another grammar and stays outside (the o2Blind fence law).
 */
export const DROWN_DEATH_RE = /^F\d+ \[F\d+\] died - respawning .*\[kind=drown\]/

/**
 * (v0.728.0) THE SAVED FACE's volume bar - the starts the verdict's claim
 * needs: the lane genuinely flew at fleet scale. The era's saved faces
 * clear it with margin (the 46th's 23, the 48th's 45, the lib's own
 * face-14 throughline's 53); below it the sparse calm is the weather's
 * own, not the lane's proof (the bars never invent).
 */
export const SAVED_MIN_STARTS = 20

/** (v0.728.0) The verdict's own name (the shape the decompose prints). */
export const SAVED_VERDICT = 'THE SAVED FACE'

// (v0.731.0) THE RELEASE'S OWN TOLL - the hound's own bytes imported (the
// one-parser law by reuse, the o2gap grammar import precedent): the join
// rides the hound census's own anchored kill shape + the arena byte, never
// a fork. The ANCHORED shape leads: a prose sample quoting the arena fails
// the anchor and never counts.
import { KILL_RE, KILL_DRY_SHORE_RE } from './houndcensus.mjs'

/**
 * (v0.731.0) The release toll's own bar - the released kills the verdict's
 * claim needs: two lives is a toll, one is the hound's own boundary case
 * (the mass row still names it; the bars never invent).
 */
export const RELEASE_TOLL_MIN_KILLS = 2

/** (v0.731.0) The toll verdict's own name (the shape the decompose prints). */
export const RELEASE_TOLL_VERDICT = "THE RELEASE'S TOLL"

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
  { key: 'shorePin', re: /water: shore pinned/ },
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
 * Returns { totals, perBot, midEvents, orphanEnds, orphanEndLines,
 * unclosedLines, timeoutSecondsByBot }:
 *   totals     - the fleet-wide end histogram (ZERO_ENDS shape + starts)
 *   perBot     - { F12: { starts, ...end histogram } } for every bot seen
 *   midEvents  - the mid-episode event counters (fleet-wide)
 *   orphanEnds - end lines with no open episode for that bot (truncation)
 *
 * (v0.370.0) THE FORENSICS RETURNS - the counts name the anomaly, the lines
 * name its story: orphanEndLines carries the verbatim orphan end lines and
 * unclosedLines the verbatim start lines of the episodes that never closed
 * (the superseded rebuild starts and the EOF-open FATAL-face starts), each
 * capped at 12 entries so a whale face cannot balloon the readout; and
 * timeoutSecondsByBot attributes the timeout budget to the bot that burned
 * it (the shore-yield cure's before/after read is per-bot, not fleet-wide).
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
  // (v0.728.0) THE SAVED FACE's own count - the drown-kind deaths the face
  // rode while its starts flew (fleet-wide; the verdict is the face's own,
  // not a bot's). The fence lives in the regex, not here.
  let drownDeaths = 0
  // (v0.731.0) THE RELEASE'S OWN TOLL's state - the per-bot rescue-end
  // state machine (the release's own aftermath): 'open' while an episode
  // runs, the end class when it closes. A dry-shore hound kill joins the
  // release only when the bot's LATEST rescue end was the release - the
  // lane's own 'surface-safe' declaration delivered the bot to the hound's
  // arena. The open state never joins (the kill mid-episode is the
  // episode's own price - the dead-in-rescue class); the absent state
  // never joins (a kill before any rescue line names nobody's save).
  const rescueEndState = new Map() // bot -> 'open' | end-class
  let dryShoreKills = 0
  let releasedKills = 0
  const releasedKillBots = {}
  const orphanEndLines = []
  const unclosedLines = []
  const timeoutSecondsByBot = {}
  const LINE_CAP = 12 // the forensics arrays stay bounded on a whale face
  const pushCapped = (arr, line) => { if (arr.length < LINE_CAP) arr.push(line) }
  if (!Array.isArray(lines)) {
    return { totals, perBot, midEvents, orphanEnds, orphanEndLines, unclosedLines, timeoutSecondsByBot, saved: savedCell(totals.starts, drownDeaths), releasedKills: releaseTollCell(dryShoreKills, releasedKills, releasedKillBots) }
  }
  const open = new Map() // bot -> true while an episode is open
  const openStartLine = new Map() // bot -> the verbatim start line of its open episode

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
    // (v0.728.0) the drown-kind death line counts where it stands - the
    // death shape collides with no start/end/mid grammar (the line's own
    // byte is unique), so the count rides the loop's top without stealing
    // a classification.
    if (DROWN_DEATH_RE.test(line)) drownDeaths++
    // (v0.731.0) the hound's arena byte - the dry-shore kill's own join:
    // the kill always counts in the arena mass; the release join fires
    // only when the bot's latest rescue end was the release (the state
    // machine above the fold - open and absent never join). The anchored
    // kill shape leads (the prose fence), the arena byte names the class.
    if (KILL_RE.test(line) && KILL_DRY_SHORE_RE.test(line)) {
      dryShoreKills++
      const killBot = botOf(line)
      if (killBot && rescueEndState.get(killBot) === 'released') {
        releasedKills++
        releasedKillBots[killBot] = (releasedKillBots[killBot] || 0) + 1
      }
    }
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
        pushCapped(unclosedLines, openStartLine.get(bot) ?? '(start line unavailable)')
      }
      open.set(bot, true)
      openStartLine.set(bot, line)
      rescueEndState.set(bot, 'open') // (v0.731.0) the episode owns the bot until it closes
      continue
    }

    const end = rescueEndClass(line)
    if (!end) continue
    const bot = botOf(line)
    if (!bot || !open.get(bot)) {
      orphanEnds++
      pushCapped(orphanEndLines, line)
      continue
    }
    totals[end]++
    rowOf(bot)[end]++
    rescueEndState.set(bot, end) // (v0.731.0) the close's own class is the bot's state
    if (end === 'timeout') {
      const s = rescueEndSeconds(line)
      if (s != null) timeoutSecondsByBot[bot] = (timeoutSecondsByBot[bot] || 0) + s
    }
    open.set(bot, false)
  }

  for (const [bot, isOpen] of open) {
    if (isOpen) {
      totals.unclosed++
      perBot[bot].unclosed++
      pushCapped(unclosedLines, openStartLine.get(bot) ?? '(start line unavailable)')
    }
  }

  return { totals, perBot, midEvents, orphanEnds, orphanEndLines, unclosedLines, timeoutSecondsByBot, saved: savedCell(totals.starts, drownDeaths), releasedKills: releaseTollCell(dryShoreKills, releasedKills, releasedKillBots) }
}

/**
 * (v0.728.0) THE SAVED FACE - the starts' own collective verdict, the cell
 * the end histogram never held: the ledger prices every END, the calm
 * paradox (v0.701.0) prices the 0-DEATH face's lane churn - but the busy
 * face's water win (deaths rode, none of them drown) had no owner. The
 * verdict answers one question: did the water lane lose a rider this face?
 *   - starts >= SAVED_MIN_STARTS && drownDeaths === 0 -> THE SAVED FACE
 *     (the volume proved the lane flew, the zero proved it landed).
 *   - drownDeaths > 0 -> not saved (verdict null; the deaths' own bills -
 *     the o2Blind join, the seal ledger, the toll - own that read).
 *   - below the bar with zero deaths -> the honest silence (the sparse
 *     calm proves nothing - the bars never invent).
 * The server kind stays the authority (the shelterledger law): the 47th's
 * three drown deaths rode misread inference tails (fall/env) and still
 * count - the kind byte is the verdict's own grain.
 */
function savedCell (starts, drownDeaths) {
  return {
    starts,
    drownDeaths,
    verdict: starts >= SAVED_MIN_STARTS && drownDeaths === 0 ? SAVED_VERDICT : null
  }
}

/**
 * (v0.731.0) THE RELEASE'S OWN TOLL - the release's own aftermath, the cell
 * the arena census never held: the hound census prices the ARENA (dry-shore
 * 3 / in-water 0 on the 49th), the rescue ledger prices every END - no cell
 * asked whether the lane's own save delivered the bot to the hound. The
 * 49th is the motive (run 37535680746): F12 and F13 died the hound's
 * dry-shore kill with the release ('surface-safe, open water - no land
 * known') as their latest rescue end - the lane declared them safe and the
 * shore took them; F16's kill rode a COMPLETE (the shallows' own exit, not
 * the release's declaration) and stays outside the join honestly.
 *   - releasedKills: the dry-shore kills whose bot's latest rescue end was
 *     the release (the state machine: a new episode opens the state, the
 *     close's class replaces it; the open state and the absent state never
 *     join - the episode's own price and the pre-rescue kill name nobody's
 *     save).
 *   - dryShoreKills: the arena's whole mass (the join's own denominator -
 *     the hound census's own byte, imported one-parser).
 *   - verdict: releasedKills >= RELEASE_TOLL_MIN_KILLS reads THE RELEASE'S
 *     TOLL (two lives is a toll); one kill stays the boundary case the
 *     mass row names; zero reads the honest silence.
 */
function releaseTollCell (dryShoreKills, releasedKills, releasedKillBots) {
  return {
    dryShoreKills,
    releasedKills,
    byBot: { ...releasedKillBots },
    verdict: releasedKills >= RELEASE_TOLL_MIN_KILLS ? RELEASE_TOLL_VERDICT : null
  }
}
