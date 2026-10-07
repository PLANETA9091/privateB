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

// (v0.774.0) THE CHURN'S OWN CAST - the starts' bot-level seat. The
// v0.728.0 verdict priced WHETHER the lane saved its riders (the face's
// own collective read), the v0.756.0 meter priced the churn's DENSITY,
// the calm paradox names the top spender - but only on the 0-death faces
// (the paradox's own gate), so the storm faces' cast rode raw (face 72's
// own read: 'per-bot rescue starts: F2=12 F5=12 F18=4 ...' - 48 starts
// with a duo at the top and no row naming the shape). THE BILL LAW (the
// ledger's own perBot/totals cells, zero re-parsing - the hop bill's
// v0.767.0 precedent): the top spender owns the churn under the
// strict-majority law (a tie owns nothing - the storm-has-no-seat
// precedent). Junk never invents a cast: a missing or empty per-bot
// table, a startless total, or a tied spread reads the honest silence
// (null).
export function rescueStartBill (perBot, totals) {
  const starts = totals && typeof totals === 'object' && Number.isFinite(totals.starts) ? totals.starts : 0
  if (!(perBot && typeof perBot === 'object') || starts <= 0) return null
  const byBot = {}
  for (const [bot, row] of Object.entries(perBot)) {
    if (row && typeof row === 'object' && Number.isFinite(row.starts) && row.starts > 0) byBot[bot] = row.starts
  }
  let topUnits = 0
  let topBot = null
  for (const [bot, n] of Object.entries(byBot)) {
    if (n > topUnits) { topUnits = n; topBot = bot }
  }
  if (topBot === null || topUnits <= starts - topUnits) return null
  return { bot: topBot, owns: topUnits, ofStarts: starts, shareOfStarts: +(topUnits / starts).toFixed(3) }
}

// (v0.774.0) the bill's own row - THE CHURN'S OWN SOLO SPENDER: one
// walker's own water lane owns the rescue churn; the relog bill's own
// loop (v0.715.0) prices the cast's cure (the repeat customer IS the
// loop's own skin). Junk never prints a seat (the honest silence's own
// row law).
export function rescueStartBillRow (bill) {
  if (!bill || typeof bill !== 'object') return null
  const { bot, owns, ofStarts, shareOfStarts } = bill
  if (typeof bot !== 'string' || !bot || !Number.isFinite(owns) || owns <= 0 ||
      !Number.isFinite(ofStarts) || ofStarts <= 0 || owns > ofStarts ||
      !Number.isFinite(shareOfStarts)) return null
  return `the starts' own cast (v0.774.0): ${bot} owns ${owns} of ${ofStarts} start(s) (${(shareOfStarts * 100).toFixed(1)}%) - THE CHURN'S OWN SOLO SPENDER: one walker's own water lane owns the rescue churn - the relog bill's own loop (v0.715.0) prices the cast's cure`
}

// (v0.774.0) THE CHURN'S OWN RIDERS - the bill's silence's own companion
// (the v0.770.0 riders precedent, zero re-parsing): a MEASURE, never a
// verdict-owner - the top two spenders' concentration prices the shape
// the solo law refused to name (the bill's owner case leaves the
// companion unprinted - the decompose's own branch law). The order is
// deterministic (count desc, then the name's own). Junk never invents a
// shape: a missing or empty per-bot table, a startless total, or fewer
// than two walkers reads the honest silence (null).
export function rescueStartRiders (perBot, totals) {
  const starts = totals && typeof totals === 'object' && Number.isFinite(totals.starts) ? totals.starts : 0
  if (!(perBot && typeof perBot === 'object') || starts <= 0) return null
  const ranked = Object.entries(perBot)
    .filter(([, row]) => row && typeof row === 'object' && Number.isFinite(row.starts) && row.starts > 0)
    .sort((a, b) => b[1].starts - a[1].starts || (a[0] < b[0] ? -1 : 1))
  if (ranked.length < 2) return null
  const leader = ranked[0][0]
  const runner = ranked[1][0]
  const leaderOwns = ranked[0][1].starts
  const runnerOwns = ranked[1][1].starts
  const pairOwns = leaderOwns + runnerOwns
  return { leader, leaderOwns, runner, runnerOwns, ofStarts: starts, pairOwns, shareOfStarts: +(pairOwns / starts).toFixed(3), duet: leaderOwns === runnerOwns }
}

// (v0.774.0) the riders' own row - THE DUO'S OWN SEAT: a measure of the
// shape, never a named owner (the bill's tie law holds); the pair prices
// the concentration the solo law refused to seat. Junk never prints a
// shape (the honest silence's own row law).
export function rescueStartRidersRow (r) {
  if (!r || typeof r !== 'object') return null
  const { leader, leaderOwns, runner, runnerOwns, ofStarts, pairOwns, shareOfStarts } = r
  if (typeof leader !== 'string' || !leader || typeof runner !== 'string' || !runner ||
      !Number.isFinite(leaderOwns) || leaderOwns <= 0 || !Number.isFinite(runnerOwns) || runnerOwns <= 0 ||
      !Number.isFinite(ofStarts) || ofStarts <= 0 || !Number.isFinite(pairOwns) || pairOwns > ofStarts ||
      !Number.isFinite(shareOfStarts)) return null
  return `the starts' own riders (v0.774.0): no solo spender owns the majority - ${leader} x${leaderOwns} + ${runner} x${runnerOwns} own ${pairOwns} of ${ofStarts} start(s) (${(shareOfStarts * 100).toFixed(1)}%) - THE DUO'S OWN SEAT: the bill's tie law held, the concentration is still real - the pair prices the dives the solo law refused to name`
}

// (v0.780.0) THE ENDS' OWN SEAT - the rescue book's class-level seat. The
// v0.368.0 ledger priced every END, the v0.728.0 verdict priced WHETHER the
// lane saved, the v0.774.0 cast named WHICH BOT spends the starts - no row
// ever named WHICH CLASS owns the book (face 75's own split rode raw:
// 'complete: 4  released: 20  frozen standdown: 28 / timeout: 1
// dead-in-rescue: 1' - the freeze's majority sat unnamed beside the
// dead-client class's own prose). The labels are the decompose's own
// display bytes (the END-STATE row's own words), never a fork. The
// unclosed class never joins the book: it is the FATAL-face class (the
// process died mid-rescue), not an end the lane chose - the ledger counts
// it separately and the bill keeps that fence.
export const RESCUE_END_CLASS_LABELS = {
  complete: 'complete',
  completeStandingWet: 'standing-wet complete',
  released: 'released',
  frozenStanddown: 'frozen standdown',
  timeout: 'timeout',
  dead: 'dead-in-rescue',
  botGone: 'bot-gone',
  abortedError: 'error abort'
}

// (v0.780.0) THE BILL LAW (the ledger's own totals cells, zero re-parsing
// - the v0.774.0 cast's own precedent, the class instead of the bot): the
// top class owns the book under the strict-majority law (a tie owns
// nothing - the storm-has-no-seat precedent; face 70's own split was the
// tie's first field witness: released 16 = frozen 16). Junk never invents
// a bill: a missing or empty totals table, an end-less book, or a tied
// spread reads the honest silence (null).
export function rescueEndBill (totals) {
  if (!(totals && typeof totals === 'object')) return null
  const classes = {}
  let ofEnds = 0
  for (const key of Object.keys(RESCUE_END_CLASS_LABELS)) {
    const n = totals[key]
    if (Number.isFinite(n) && n > 0) { classes[key] = n; ofEnds += n }
  }
  if (ofEnds <= 0) return null
  let topUnits = 0
  let topKey = null
  for (const [key, n] of Object.entries(classes)) {
    if (n > topUnits) { topUnits = n; topKey = key }
  }
  if (topKey === null || topUnits <= ofEnds - topUnits) return null
  return { key: topKey, label: RESCUE_END_CLASS_LABELS[topKey], owns: topUnits, ofEnds, shareOfEnds: +(topUnits / ofEnds).toFixed(3) }
}

// (v0.780.0) the bill's own row - THE CLASS'S OWN SEAT: one class's own
// closes own the rescue book. Junk never prints a seat (the honest
// silence's own row law).
export function rescueEndBillRow (bill) {
  if (!bill || typeof bill !== 'object') return null
  const { label, owns, ofEnds, shareOfEnds } = bill
  if (typeof label !== 'string' || !label || !Number.isFinite(owns) || owns <= 0 ||
      !Number.isFinite(ofEnds) || ofEnds <= 0 || owns > ofEnds ||
      !Number.isFinite(shareOfEnds)) return null
  return `the ends' own bill (v0.780.0): ${label} owns ${owns} of ${ofEnds} end(s) (${(shareOfEnds * 100).toFixed(1)}%) - THE CLASS'S OWN SEAT: one class's own closes own the rescue book - the class's own front prices the ends the raw split rode unnamed`
}

// (v0.780.0) THE ENDS' OWN RIDERS - the bill's silence's own companion
// (the v0.774.0 riders precedent, zero re-parsing): a MEASURE, never a
// verdict-owner - the top two classes' concentration prices the shape the
// solo law refused to name (the bill's owner case leaves the companion
// unprinted - the decompose's own branch law). The order is deterministic
// (count desc, then the key's own byte - 'frozenStanddown' < 'released').
// Junk never invents a shape: a missing or empty totals table, an end-less
// book, or fewer than two classes reads the honest silence (null).
export function rescueEndRiders (totals) {
  if (!(totals && typeof totals === 'object')) return null
  const ranked = Object.keys(RESCUE_END_CLASS_LABELS)
    .map(key => ({ key, label: RESCUE_END_CLASS_LABELS[key], n: totals[key] }))
    .filter(c => Number.isFinite(c.n) && c.n > 0)
    .sort((a, b) => b.n - a.n || (a.key < b.key ? -1 : 1))
  if (ranked.length < 2) return null
  const ofEnds = ranked.reduce((a, c) => a + c.n, 0)
  const pairOwns = ranked[0].n + ranked[1].n
  return { leader: ranked[0].label, leaderOwns: ranked[0].n, runner: ranked[1].label, runnerOwns: ranked[1].n, ofEnds, pairOwns, shareOfEnds: +(pairOwns / ofEnds).toFixed(3), tie: ranked[0].n === ranked[1].n }
}

// (v0.780.0) the riders' own row - THE PAIR'S OWN SEAT: a measure of the
// shape, never a named owner (the bill's tie law holds); the pair prices
// the concentration the solo law refused to seat. Junk never prints a
// shape (the honest silence's own row law).
export function rescueEndRidersRow (r) {
  if (!r || typeof r !== 'object') return null
  const { leader, leaderOwns, runner, runnerOwns, ofEnds, pairOwns, shareOfEnds } = r
  if (typeof leader !== 'string' || !leader || typeof runner !== 'string' || !runner ||
      !Number.isFinite(leaderOwns) || leaderOwns <= 0 || !Number.isFinite(runnerOwns) || runnerOwns <= 0 ||
      !Number.isFinite(ofEnds) || ofEnds <= 0 || !Number.isFinite(pairOwns) || pairOwns > ofEnds ||
      !Number.isFinite(shareOfEnds)) return null
  return `the ends' own riders (v0.780.0): no solo class owns the majority - ${leader} x${leaderOwns} + ${runner} x${runnerOwns} own ${pairOwns} of ${ofEnds} end(s) (${(shareOfEnds * 100).toFixed(1)}%) - THE PAIR'S OWN SEAT: the bill's tie law held, the concentration is still real - the pair prices the closes the solo law refused to name`
}
