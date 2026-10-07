//
// fleeledger.mjs - THE FLEE SURVIVAL LEDGER (v0.481.0)
//
// The escape lane's own episode anatomy - the flee START side's outcome
// book. The three existing combat lenses each read a different window of
// the same story: the shelter ledger (v0.457.0) reads HOW a death happened
// (the death joined to the bot's last combat verdict), the flee fork
// (v0.459.0) reads the death-time killer distance (the chase-vs-arrows
// fork on the DIED line's inference), the death ground (v0.464.0) reads
// WHERE (the deaths joined to each other). Nobody ever joined a flee
// START to its own terminus - the escape lane's own success rate, the
// start-side geometry, the chase's progress between consecutive flee
// lines: all unpriced. This ledger walks the lines once and pairs every
// 'combat: fleeing <mob> (dist D, hp H, N nearby, <reason>[, kite])'
// start with its bot's next episode-boundary line:
//
//   chased      - the bot DIED mid-flee and the death's own witness names
//                 the flee's threat (the inference tail's 'inferred:
//                 <mob>@dist' when it corroborates, else the server kind
//                 token's 'by <Killer>' - the authority law, the
//                 shelterledger's chasedDown convention). The chased case
//                 carries killDist/killDelta when (and only when) the
//                 inference itself joins - the inference is the chase's
//                 geometry witness; the server token carries no distance.
//   crossfire   - the bot DIED mid-flee to a DIFFERENT hostile (the
//                 second-hostile class: face 43's F16 fled a creeper and
//                 took a skeleton's arrow at 8.9 - the fire-1638 ARROWS
//                 read's start-side shape)
//   died-other  - the bot died mid-flee to a non-combat kind (the water's
//                 own kills are the o2 lane's subject - the deathground
//                 authority law; the episode still closes, honestly)
//   reflee      - the bot's NEXT flee start closed this episode (the
//                 chase continued). refleeDelta = closer dist - start
//                 dist (positive = the bot gained, negative = the mob
//                 closed in); |delta| <= STUCK_REFLEE_U names a STUCK
//                 chase (the run73 F6/F18 x65/x54 stuck-at-4.0 signature
//                 the kite switch exists for - priced here as data)
//   stood       - the bot's next fighting / fight-ended line closed the
//                 episode (the lane switched to the fight lane; the
//                 fight-ended exit word rides as data)
//   sheltered   - the bot's next 'sheltering from' line closed it (the
//                 escape landed in shelter)
//   open        - the face's tail took it (EOF with no boundary line -
//                 the honest unnamed)
//
// The episode-internal lines (flee ladder/kite/shore/bearing, shelter
// skip/wall-miss/earn/ring, critical-bar, verdict-flip, open-field-yield,
// pair-preempt, drift-wait, ranged-cooldown) never close and never open -
// they are the episodes' own machinery prose, and the shootercensus verb
// vocabulary (parseCombatLine, imported - one parser per shape) routes
// them out by verb.
//
// The start side's own price: bands (distBand imported from
// shelterledger.mjs - the flee fork's own ruler, never forked) x died
// share (chased + crossfire - the mob-family kills), hp at start
// (min/median/max - the flee-too-late read), the crowd (nearby max),
// kite starts (the stalemate switch's own flag). The book law: starts =
// reflee + stood + sheltered + chased + crossfire + diedOther + open,
// every start closes exactly once.
//
// v0.482.0 THE CROWD PRICE - the crowd dimension's own died share. The
// bands read the DISTANCE at flee start; the start line also carries its
// own crowd census ('N nearby' - the hostiles around at the moment of
// the flight decision), and the crossfire class's sensor is exactly that
// count: face 43's both crossfire deaths (F17 fled a spider @2 nearby,
// F16 fled a creeper @2 nearby) flew with a SECOND hostile already
// counted, while the chased deaths flew solo - the crowd read the
// survival fork's verdict line asks for ('the disengage must read the
// crowd, not just the chase') is priced by splitting the starts into
// solo (nearby <= 1) vs crowd (nearby >= 2) and reading each side's
// died share. Same died law as the bands (chased + crossfire - the
// mob-family kills); the truncation window's data-blind starts (nearby
// null) read the honest unpriced bucket.
//
// Junk-safe: non-array / non-string-blob reads null (the smeltledger
// convention); zero starts read the honest zero shape (the row prints
// the calm face - face 40's own shape). Pure: reads, never mutates.
//
import { DIED_KIND_RE } from './maptrip.mjs'
import { parseCombatLine } from './shootercensus.mjs'
import { distBand } from './shelterledger.mjs'

// the combat-side authority (the deathground + shelterledger family's
// own law, verbatim): the server kind token's family words; everything
// else is died-other for this lens.
const COMBAT_KIND_RE = /^(mob|explosion)\b/

// the flee start's full data shape (the emitter's own body, miner.mjs's
// flee line - byte-verified live on faces 42/43: the reason is free text
// to the paren, the kite flag rides the tail ', kite)')
export const FLEE_START_RE = /combat: fleeing ([a-z_]+) \(dist (\d+(?:\.\d+)?), hp (\d+(?:\.\d+)?), (\d+) nearby, ([^)]*)\)/

// the inference tail's NAME + distance (KILL_DIST_RE's shape in
// shelterledger.mjs with the name captured - the name is this lens's
// chase-join key, the death-side lens deliberately leaves it unread; the
// same emitter, a different slice - the rescueclock precedent)
export const FLEE_KILL_RE = /inferred: ([a-z_]+)@(\d+(?:\.\d+)?)/

// the server kind token's killer tail ('mob by Zombie' -> 'Zombie')
export const FLEE_KILLER_RE = /\[kind=(?:mob|explosion) by ([^\]]+)\]/

// the stuck-chase ruler (the run73 signature: the flee distances STUCK -
// the mob kept pace; one decimal, absolute)
export const STUCK_REFLEE_U = 1.0

// the fight-ended exit word (the first token after the paren)
const FIGHT_EXIT_RE = /fight ended vs [a-z_]+ \(([^,)]+)/

const OUTCOMES = ['reflee', 'stood', 'sheltered', 'chased', 'crossfire', 'died-other', 'open']

function median (arr) {
  if (!arr.length) return null
  const s = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

const round1 = n => Math.round(n * 10) / 10

/**
 * fleeLedger(lines) - the escape lane's own episode book.
 *
 * @param {string[]|string} [lines] the face log (array or raw blob)
 * @returns {null|{starts: number, reflee: number, stood: number,
 *   sheltered: number, chased: number, crossfire: number, diedOther:
 *   number, open: number, stuckReflees: number, kiteStarts: number,
 *   hp: {min, median, max}|null, bands: Object<string, {starts, died}>,
 *   crowd: {solo: {starts, died}, crowd: {starts, died}, unpriced:
 *   {starts, died}},
 *   perBot: Object<string, number>, rows: object[]}}
 */
export function fleeLedger (lines) {
  const src = Array.isArray(lines)
    ? lines
    : (typeof lines === 'string' ? lines.split('\n') : null)
  if (!src) return null
  const lanes = new Map()
  const rows = []
  const close = (ep, outcome, closerIdx, extra) => {
    const row = {
      bot: ep.bot, mob: ep.mob, dist: ep.dist, band: ep.band, hp: ep.hp,
      nearby: ep.nearby, reason: ep.reason, kite: ep.kite, idx: ep.idx,
      outcome, closerIdx: closerIdx ?? null,
      refleeDelta: null, killDist: null, killDelta: null,
      killer: null, deathKind: null, exit: null
    }
    if (extra) Object.assign(row, extra)
    rows.push(row)
    ep.closed = true
  }
  for (let i = 0; i < src.length; i++) {
    const line = src[i]
    if (typeof line !== 'string') continue
    // the died line - it closes the bot's open episode (any kind; the
    // class reads the server kind token, the authority)
    const km = line.match(DIED_KIND_RE)
    if (km) {
      const st = lanes.get(km[1])
      if (st && st.open && !st.open.closed) {
        const ep = st.open
        const kind = km[2]
        const combat = COMBAT_KIND_RE.test(kind)
        const killerM = line.match(FLEE_KILLER_RE)
        const killer = killerM ? killerM[1] : null
        const infM = line.match(FLEE_KILL_RE)
        // the chase's witness: the inference's own name when it joins the
        // flee's threat, else the server killer token (the authority -
        // the explosion kind's inference is blind by construction)
        const infJoins = !!(infM && ep.mob && infM[1] === ep.mob)
        const killerJoins = !!(killer && ep.mob && killer.toLowerCase() === ep.mob)
        const chased = infJoins || killerJoins
        const extra = { killer, deathKind: kind }
        if (chased && infJoins) {
          extra.killDist = Number(infM[2])
          extra.killDelta = round1(Number(infM[2]) - ep.dist)
        }
        close(ep, combat ? (chased ? 'chased' : 'crossfire') : 'died-other', i, extra)
      }
      continue
    }
    const cm = parseCombatLine(line)
    if (!cm || !cm.bot) continue
    let st = lanes.get(cm.bot)
    if (!st) { st = { open: null }; lanes.set(cm.bot, st) }
    if (cm.verb === 'fleeing') {
      if (st.open && !st.open.closed) {
        // the chase's progress: the closer IS this new fleeing line -
        // its own dist prices the delta (positive = the bot gained)
        const nm = line.match(FLEE_START_RE)
        const closerDist = nm ? Number(nm[2]) : null
        close(st.open, 'reflee', i, {
          refleeDelta: (closerDist !== null && st.open.dist !== null)
            ? round1(closerDist - st.open.dist)
            : null
        })
      }
      const fm = line.match(FLEE_START_RE)
      if (fm) {
        const reasonRaw = fm[5]
        st.open = {
          bot: cm.bot, mob: fm[1], dist: Number(fm[2]), band: distBand(Number(fm[2])),
          hp: Number(fm[3]), nearby: Number(fm[4]),
          reason: reasonRaw.replace(/, kite$/, ''),
          kite: /, kite$/.test(reasonRaw), idx: i, closed: false
        }
      } else {
        // the truncation window - the verb spoke, the body did not
        // survive (the FATAL face truncation's own shape): the episode
        // opens data-blind, the band reads unpriced
        st.open = {
          bot: cm.bot, mob: null, dist: null, band: null, hp: null,
          nearby: null, reason: null, kite: false, idx: i, closed: false
        }
      }
    } else if ((cm.verb === 'fighting' || cm.verb === 'fight-ended') && st.open && !st.open.closed) {
      const exM = line.match(FIGHT_EXIT_RE)
      close(st.open, 'stood', i, { exit: cm.verb === 'fight-ended' && exM ? exM[1] : null })
    } else if (cm.verb === 'sheltering' && st.open && !st.open.closed) {
      close(st.open, 'sheltered', i)
    }
    // every other combat verb: the episodes' own machinery prose -
    // never closes, never opens
  }
  for (const st of lanes.values()) {
    if (st.open && !st.open.closed) close(st.open, 'open', null)
  }
  // the book
  const tally = { starts: rows.length, reflee: 0, stood: 0, sheltered: 0, chased: 0, crossfire: 0, 'died-other': 0, open: 0 }
  for (const r of rows) tally[r.outcome]++
  let stuckReflees = 0
  let kiteStarts = 0
  for (const r of rows) {
    if (r.outcome === 'reflee' && r.refleeDelta !== null && Math.abs(r.refleeDelta) <= STUCK_REFLEE_U) stuckReflees++
    if (r.kite) kiteStarts++
  }
  // the bands x died share (chased + crossfire - the mob-family kills)
  const bands = { close: { starts: 0, died: 0 }, mid: { starts: 0, died: 0 }, far: { starts: 0, died: 0 }, unpriced: { starts: 0, died: 0 } }
  for (const r of rows) {
    const b = bands[r.band || 'unpriced']
    b.starts++
    if (r.outcome === 'chased' || r.outcome === 'crossfire') b.died++
  }
  // the crowd x died share (v0.482.0): the start line's own census -
  // solo (nearby <= 1) vs crowd (nearby >= 2); the crossfire class's
  // sensor is the second hostile already counted at the flight decision
  const crowd = { solo: { starts: 0, died: 0 }, crowd: { starts: 0, died: 0 }, unpriced: { starts: 0, died: 0 } }
  for (const r of rows) {
    const key = r.nearby === null ? 'unpriced' : (r.nearby >= 2 ? 'crowd' : 'solo')
    crowd[key].starts++
    if (r.outcome === 'chased' || r.outcome === 'crossfire') crowd[key].died++
  }
  const hps = rows.filter(r => r.hp !== null).map(r => r.hp)
  const perBot = {}
  for (const r of rows) perBot[r.bot] = (perBot[r.bot] || 0) + 1
  return {
    starts: tally.starts,
    reflee: tally.reflee,
    stood: tally.stood,
    sheltered: tally.sheltered,
    chased: tally.chased,
    crossfire: tally.crossfire,
    diedOther: tally['died-other'],
    open: tally.open,
    stuckReflees,
    kiteStarts,
    hp: hps.length
      ? { min: Math.min(...hps), median: median(hps), max: Math.max(...hps) }
      : null,
    bands,
    crowd,
    perBot,
    rows
  }
}

export { OUTCOMES as FLEE_OUTCOMES }

// (v0.798.0) THE FLEE BOOK'S OWN SEAT - WHICH outcome owns the escape
// lane's success book. The survival ledger's own split row ('reflee 14 /
// stood 2 / ... - book 29/29') counts the episodes per outcome class and
// the survival fork prices the mid-flee deaths, but no row ever said
// WHICH outcome's own closes own the episode book - the raw split rode
// unnamed. THE SEAT LAW (the census's own outcome counters only, zero
// re-parsing - the v0.784.0 kind-seat precedent, the v0.795.0 verdict
// seat's own shape): the strict-majority law - a solo outcome owns the
// book only above half (a tie owns nothing); the names are the census's
// own vocabulary bytes ('chased' < 'crossfire' < 'died-other' < 'open' <
// 'reflee' < 'sheltered' < 'stood'); junk never invents an outcome (a
// missing or non-object ledger, a non-finite counter, or a zero book
// reads the honest silence - null, the decompose's own guard skips the
// row).
const FLEE_BOOK_CELLS = [
  ['reflee', 'reflee'],
  ['stood', 'stood'],
  ['sheltered', 'sheltered'],
  ['chased', 'chased'],
  ['crossfire', 'crossfire'],
  ['died-other', 'diedOther'],
  ['open', 'open']
]

function fleeOutcomeTally (fl) {
  if (!fl || typeof fl !== 'object' || Array.isArray(fl)) return null
  const tallies = {}
  let total = 0
  for (const [cls, field] of FLEE_BOOK_CELLS) {
    const n = fl[field]
    if (!Number.isFinite(n) || n <= 0) continue
    total += n
    tallies[cls] = (tallies[cls] || 0) + n
  }
  return total > 0 ? { tallies, total } : null
}

export function fleeOutcomeBill (fl) {
  const t = fleeOutcomeTally(fl)
  if (!t) return null
  let topOwns = 0
  let topOutcome = null
  for (const [cls, n] of Object.entries(t.tallies)) {
    if (n > topOwns) { topOwns = n; topOutcome = cls }
  }
  if (topOutcome === null || topOwns <= t.total - topOwns) return null
  return { outcome: topOutcome, owns: topOwns, ofFlees: t.total, shareOfFlees: +(topOwns / t.total).toFixed(3) }
}

// (v0.798.0) the flee seat's own row - THE FLEE'S OWN SEAT: the seat
// names WHICH outcome's own closes own the escape book; the outcome's own
// front prices the churn (a solo reflee seat is the re-arm loop's own
// signature - the survival fork's own companion). Junk never prints a
// seat (the honest silence's own row law).
export function fleeOutcomeBillRow (bill) {
  if (!bill || typeof bill !== 'object') return null
  const { outcome, owns, ofFlees, shareOfFlees } = bill
  if (typeof outcome !== 'string' || !outcome ||
      !Number.isFinite(owns) || owns <= 0 ||
      !Number.isFinite(ofFlees) || ofFlees <= 0 || owns > ofFlees ||
      !Number.isFinite(shareOfFlees)) return null
  return `the flee book's own seat (v0.798.0): ${outcome} owns ${owns} of ${ofFlees} flee episode(s) (${(shareOfFlees * 100).toFixed(1)}%) - THE FLEE'S OWN SEAT: one outcome's own closes own the escape book - the outcome's own front prices the churn the raw split rode unnamed`
}

// (v0.798.0) THE FLEE BOOK'S OWN RIDERS - the flee seat's own silence's
// companion. The seat names the solo outcome under the strict-majority
// law; a no-majority outcome mix rode raw with no row naming the shape.
// THE RIDER LAW (the census's own outcome counters only, zero re-parsing
// - the seat's own precedent): a MEASURE, never a verdict-owner - the top
// two outcomes' concentration prices the shape the solo law refused to
// name (the seat's owner case leaves the companion unprinted - the
// decompose's own branch law). Junk never invents a shape: a missing or
// non-object ledger, a non-finite counter, or fewer than two counted
// outcomes reads the honest silence (null). The order is deterministic
// (count desc, then the outcome's own byte: the name's own lexicographic
// law - 'chased' < 'reflee').
export function fleeOutcomeRiders (fl) {
  const t = fleeOutcomeTally(fl)
  if (!t) return null
  const ranked = Object.entries(t.tallies).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
  if (ranked.length < 2) return null
  const [leader, leaderOwns] = ranked[0]
  const [runner, runnerOwns] = ranked[1]
  const pairOwns = leaderOwns + runnerOwns
  return { leader, leaderOwns, runner, runnerOwns, ofFlees: t.total, pairOwns, shareOfFlees: +(pairOwns / t.total).toFixed(3), duet: leaderOwns === runnerOwns }
}

// (v0.798.0) the flee riders' own row - THE FLEE'S OWN MIX: a measure of
// the shape, never a named owner (the seat's tie law holds); the pair
// prices the concentration the solo law refused to seat. Junk never
// prints a shape (the honest silence's own row law).
export function fleeOutcomeRidersRow (r) {
  if (!r || typeof r !== 'object') return null
  const { leader, leaderOwns, runner, runnerOwns, ofFlees, pairOwns, shareOfFlees } = r
  if (typeof leader !== 'string' || !leader || typeof runner !== 'string' || !runner ||
      !Number.isFinite(leaderOwns) || leaderOwns <= 0 || !Number.isFinite(runnerOwns) || runnerOwns <= 0 ||
      !Number.isFinite(ofFlees) || ofFlees <= 0 || !Number.isFinite(pairOwns) || pairOwns > ofFlees ||
      !Number.isFinite(shareOfFlees)) return null
  return `the flee book's own riders (v0.798.0): no solo outcome owns the majority - ${leader} x${leaderOwns} + ${runner} x${runnerOwns} own ${pairOwns} of ${ofFlees} flee episode(s) (${(shareOfFlees * 100).toFixed(1)}%) - THE FLEE'S OWN MIX: the seat's tie law held, the mix is the shape - the outcomes' own spread prices the churn the solo law refused to seat`
}
