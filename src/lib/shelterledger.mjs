// (v0.457.0) THE SHELTER OUTCOME LEDGER - the combat/night cure's PRICE.
// The pocket killers row (v0.454.0) NAMED the lane (face 36: the mob family
// 82% of the drain, skeletons alone 50%); the shooter census counts the
// machinery's verdicts (tries / skips / wall-misses / rings); but nothing
// ever joined a DEATH to the bot's last combat verdict - the two handoffs
// kept saying 'price the combat/night cure before any wire' and the price
// leg did not exist. This module is that join: for each combat death (the
// server kind token stays the authority - kind=mob* or kind=explosion*),
// the bot's most recent combat line BEFORE the died line names the outcome
// class the bot died in:
//
//   sheltered        - died inside an active shelter (the wall itself failed)
//   shelter-attempt  - died while the machinery was still negotiating
//                      (try / wall-miss / skip / ring - the refusal or the
//                      build was not sealed in time)
//   fight            - died trading (fighting / fight-ended)
//   flee             - died disengaging (fleeing / flee-* / verdict-flip /
//                      open-field-yield)
//   ranged           - died on the ranged cooldown arm (the chase trade)
//   other            - a combat verb outside the classes (visible, counted)
//   ambushed         - NO combat line before the death at all (the sentry
//                      never spoke)
//
// THE PAIRING LAW (verbatim reuse, no new parse shapes - the 0.455.0 rule):
// the death's PRICE is the adjacent death drop's ~Nu (DEATH_DROP_RE), each
// drop paired with the bot's most recent died line BEFORE it - the exact
// last-before-drop rule the pocket killers pinned at zero misses on 13
// real pairs; the emitter prints died -> drop adjacent, so the pairing
// survives any interleaving. A combat death with no drop reads unpriced
// (the empty pocket - honest, never guessed); a drop with no prior died
// line reads pairMisses (not this ledger's subject, still counted).
// Non-combat kinds (drown, void, fall...) are counted and excluded; a died
// line with NO kind token (the legacy cause shape) is counted as
// unparsedDeaths - honest, never forced into a class.
//
// Mining-surface only: zero fleet wiring, zero new log lines (the
// v0.379.0 precedent). Decompose is the field read; this is the pure
// join (unit-pinned, the shootercensus v0.390.0 shape).

import { parseCombatLine } from './shootercensus.mjs'
import { DIED_KIND_RE, DEATH_DROP_RE } from './maptrip.mjs'

// (v0.459.0) THE KILL DIST - the death-time killer distance, read from the
// died line's own inference tail ('inferred: skeleton@7.6 (0s before death
// at ...)'). The hp-inferrer's DISTANCE is the flee fork's only ruler; the
// inferred NAME stays unread - the server kind token is the authority and
// the name can contradict it (face 38's F8-slew-F9 line). Blind kinds
// (drown: 'the inference is blind to this kind') read null - honest, never
// guessed.
export const KILL_DIST_RE = /inferred: [a-z_]+@(\d+(?:\.\d+)?)/

// (v0.459.0) THE DIST BANDS - the flee fork's vocabulary. The bands are
// design input read from the field: close (<= 4 - melee reach, the flee
// gained NOTHING), mid (4 < d <= 8 - inside the arrow arc but out of
// melee), far (> 8 - the flee DID gain and died anyway: the arrows or the
// blast won the trade). Face 36's own read was BIMODAL - six close, three
// far, ZERO mid - the middle band exists because the mobs' two kill
// families (melee chase, ranged/blast) predict a hole there; a filled mid
// band on a future face is itself the datum.
export const DIST_BANDS = [
  { key: 'close', max: 4 },
  { key: 'mid', max: 8 },
  { key: 'far', max: Infinity }
]

export function distBand (d) {
  if (typeof d !== 'number' || !Number.isFinite(d)) return null
  for (const b of DIST_BANDS) { if (d <= b.max) return b.key }
  return 'far'
}

// The verb -> outcome class map, pinned to the shootercensus verb
// vocabulary (a wording drift there breaks BOTH modules loudly - the
// sibling-shape law). Most verbs map 1:1; the shelter family collapses
// into two classes (sealed vs still-negotiating) because that is the cure
// fork the pricing reads: the WALL failed, or the MACHINERY was too slow.
export const OUTCOME_OF_VERB = {
  sheltering: 'sheltered',
  'shelter-try': 'shelter-attempt',
  'shelter-wall-miss': 'shelter-attempt',
  'shelter-skip': 'shelter-attempt',
  'ring-try': 'shelter-attempt',
  'ring-ranged': 'shelter-attempt',
  'shelter-dig-earn': 'shelter-attempt',
  'shelter-earn': 'shelter-attempt',
  fighting: 'fight',
  'fight-ended': 'fight',
  fleeing: 'flee',
  'flee-ladder': 'flee',
  'flee-kite': 'flee',
  'flee-shore': 'flee',
  'flee-bearing': 'flee',
  'verdict-flip': 'flee',
  'open-field-yield': 'flee',
  'ranged-cooldown': 'ranged',
  'pair-preempt': 'other',
  'drift-wait': 'other',
  'critical-bar': 'other',
  'melee-ceiling': 'other',
  other: 'other'
}

// The combat-side kind prefixes (the server token's own family words):
// melee mobs and the explosion family are the combat/night lane's
// subjects; everything else parsed (drown, void, fall...) is excluded.
const COMBAT_KIND_RE = /^(mob|explosion)\b/

export const OUTCOME_CLASSES = ['sheltered', 'shelter-attempt', 'fight', 'flee', 'ranged', 'other', 'ambushed']

/**
 * The shelter outcome ledger over a face log (pure; the decompose field
 * read). Accepts an array of lines or a raw text blob (split on newline).
 * @param {string[]|string} [lines] the face log
 * @returns {null|{combatDeaths: number, otherDeaths: number, unparsedDeaths: number, unpriced: number, pairMisses: number, outcomes: Object<string,{n: number, u: number, bots: string[]}>, rows: Array<{bot: string, kind: string, outcome: string, lastVerb: string|null, attacker: string|null, u: number|null, dropped: boolean}>}}
 */
export function shelterLedger (lines) {
  const rows = Array.isArray(lines)
    ? lines
    : (typeof lines === 'string' ? lines.split('\n') : [])
  const perBot = new Map()
  const deaths = []
  let otherDeaths = 0
  let unparsedDeaths = 0
  let pairMisses = 0
  const state = bot => {
    let st = perBot.get(bot)
    if (!st) { st = { lastCombat: null, lastDied: null }; perBot.set(bot, st) }
    return st
  }
  for (let i = 0; i < rows.length; i++) {
    const line = rows[i]
    if (typeof line !== 'string') continue
    // the combat verdict - the shooter census's own parser, verbatim (the
    // death lines' inference prose never matches the marker - no
    // double-count by construction)
    const cm = parseCombatLine(line)
    if (cm && cm.bot) {
      state(cm.bot).lastCombat = { idx: i, verb: cm.verb, attacker: cm.attacker }
      continue
    }
    // the died line - the server kind token is the authority
    const km = line.match(DIED_KIND_RE)
    if (km) {
      const bot = km[1]
      const kind = km[2]
      const st = state(bot)
      if (COMBAT_KIND_RE.test(kind)) {
        // the outcome is read NOW: the most recent combat line before the
        // died line is exactly st.lastCombat at this index
        const lc = st.lastCombat
        // (v0.459.0) the flee fork's legs: the death-time killer distance
        // and the chase/crossfire split (the kind token's killer vs the
        // last verdict's attacker - the server token stays the authority,
        // the comparison is a courtesy lowercase join)
        const dm2 = line.match(KILL_DIST_RE)
        const killDist = dm2 ? Number(dm2[1]) : null
        const killer = kind.includes(' by ') ? kind.split(' by ')[1] : null
        const chasedDown = (killer && lc && lc.attacker)
          ? killer.toLowerCase() === String(lc.attacker).toLowerCase()
          : null
        const death = {
          bot,
          kind,
          outcome: lc ? (OUTCOME_OF_VERB[lc.verb] || 'other') : 'ambushed',
          lastVerb: lc ? lc.verb : null,
          attacker: lc ? lc.attacker : null,
          killDist,
          distBand: distBand(killDist),
          chasedDown,
          u: null,
          dropped: false
        }
        deaths.push(death)
        st.lastDied = { idx: i, death }
      } else {
        otherDeaths++
        // a non-combat death still OPENS the drop's pairing window (the
        // emitter prints died -> drop adjacent regardless of kind) - the
        // drop consumes it silently: the price is THIS ledger's subject
        // only, the drop is never a pairMiss just because the death was
        // the water's
        st.lastDied = { idx: i, death: null }
      }
      continue
    }
    // the legacy died shape: no kind token - counted, never classed; it
    // opens the pairing window the same way (a following drop consumes
    // silently - honest, never a miss)
    if (/^(\S+) \[\1\] died - respawning/.test(line)) {
      const bm = line.match(/^(\S+) \[\1\] died - respawning/)
      unparsedDeaths++
      state(bm[1]).lastDied = { idx: i, death: null }
      continue
    }
    // the drop - the price leg, the last-before-drop law verbatim
    const dm = line.match(DEATH_DROP_RE)
    if (dm) {
      const st = state(dm[1])
      if (st.lastDied) {
        if (st.lastDied.death) {
          st.lastDied.death.u = Number(dm[2])
          st.lastDied.death.dropped = true
        }
        st.lastDied = null
      } else {
        pairMisses++
      }
    }
  }
  const outcomes = {}
  for (const c of OUTCOME_CLASSES) outcomes[c] = { n: 0, u: 0, bots: [] }
  let unpriced = 0
  for (const d of deaths) {
    const o = outcomes[d.outcome] || outcomes.other
    o.n++
    if (d.dropped && d.u !== null) o.u += d.u
    if (!o.bots.includes(d.bot)) o.bots.push(d.bot)
    if (!d.dropped) unpriced++
  }
  for (const c of OUTCOME_CLASSES) oBots(outcomes[c])
  // (v0.459.0) the face-level band tally - every combat death with a
  // readable inference lands in exactly one band; the blind ones count in
  // unpriced (the honest bucket, named after the price leg's own honesty)
  const distBands = { close: 0, mid: 0, far: 0, unpriced: 0 }
  for (const d of deaths) {
    if (d.distBand) distBands[d.distBand]++
    else distBands.unpriced++
  }
  return {
    combatDeaths: deaths.length,
    otherDeaths,
    unparsedDeaths,
    unpriced,
    pairMisses,
    outcomes,
    distBands,
    rows: deaths
  }
}

function oBots (o) { o.bots.sort() }

// (v0.795.0) THE VERDICT BOOK'S OWN SEAT - WHICH outcome class owns the
// shelter ledger's death book. The class split row ('sheltered: 2 (2u) |
// flee: 9 (449u) | ...') counts the deaths per verdict class and the
// price's answer names the biggest PRICED mass, but no row ever said
// WHICH verdict's own deaths own the COUNT book - the raw split rode
// unnamed. THE SEAT LAW (the census's own outcomes cells only, zero
// re-parsing - the v0.784.0 kind-seat precedent, the v0.793.0 ground
// seat's own shape): the strict-majority law - a solo class owns the book
// only above half (a tie owns nothing - the v0.784.0 seat's own law); the
// names are the census's own vocabulary bytes ('sheltered' <
// 'shelter-attempt' is NOT the byte order - '-' (0x2d) < 'e' (0x65), so
// 'shelter-attempt' < 'sheltered' - the byte law's own trap); junk never
// invents a verdict (a missing or non-object ledger, a cell without a
// finite positive count, or no counted death reads the honest silence -
// null, the decompose's own guard skips the row). The class name is the
// census's own display key - the classRow's own words.
function outcomeTally (sl) {
  if (!sl || typeof sl !== 'object' || Array.isArray(sl)) return null
  if (!sl.outcomes || typeof sl.outcomes !== 'object' || Array.isArray(sl.outcomes)) return null
  const tallies = {}
  let total = 0
  for (const [cls, o] of Object.entries(sl.outcomes)) {
    if (!o || typeof o !== 'object') continue
    const n = o.n
    if (!Number.isFinite(n) || n <= 0) continue
    total += n
    tallies[cls] = (tallies[cls] || 0) + n
  }
  return total > 0 ? { tallies, total } : null
}

export function shelterOutcomeBill (sl) {
  const t = outcomeTally(sl)
  if (!t) return null
  let topOwns = 0
  let topClass = null
  for (const [cls, n] of Object.entries(t.tallies)) {
    if (n > topOwns) { topOwns = n; topClass = cls }
  }
  if (topClass === null || topOwns <= t.total - topOwns) return null
  return { outcome: topClass, owns: topOwns, ofDeaths: t.total, shareOfDeaths: +(topOwns / t.total).toFixed(3) }
}

// (v0.795.0) the verdict seat's own row - THE VERDICT'S OWN SEAT: the seat
// names WHICH class's own deaths own the ledger's count book; the class's
// own front prices the cure fork (a solo flee seat is the disengage leak's
// own count-side signature - the price's answer's own companion). Junk
// never prints a seat (the honest silence's own row law).
export function shelterOutcomeBillRow (bill) {
  if (!bill || typeof bill !== 'object') return null
  const { outcome, owns, ofDeaths, shareOfDeaths } = bill
  if (typeof outcome !== 'string' || !outcome ||
      !Number.isFinite(owns) || owns <= 0 ||
      !Number.isFinite(ofDeaths) || ofDeaths <= 0 || owns > ofDeaths ||
      !Number.isFinite(shareOfDeaths)) return null
  return `the verdict book's own seat (v0.795.0): ${outcome} owns ${owns} of ${ofDeaths} combat death(s) (${(shareOfDeaths * 100).toFixed(1)}%) - THE VERDICT'S OWN SEAT: one verdict's own deaths own the ledger - the class's own front prices the book the raw split rode unnamed`
}

// (v0.795.0) THE VERDICT BOOK'S OWN RIDERS - the verdict seat's own
// silence's companion. The seat names the solo class under the
// strict-majority law; a no-majority class mix rode raw with no row naming
// the shape. THE RIDER LAW (the census's own outcomes cells only, zero
// re-parsing - the seat's own precedent): a MEASURE, never a verdict-owner
// - the top two classes' concentration prices the shape the solo law
// refused to name (the seat's owner case leaves the companion unprinted -
// the decompose's own branch law). Junk never invents a shape: a missing
// or non-object ledger, a cell without a finite positive count, or fewer
// than two counted classes reads the honest silence (null). The order is
// deterministic (count desc, then the class's own byte: the name's own
// lexicographic law - 'fight' < 'flee' < 'other').
export function shelterOutcomeRiders (sl) {
  const t = outcomeTally(sl)
  if (!t) return null
  const ranked = Object.entries(t.tallies).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
  if (ranked.length < 2) return null
  const [leader, leaderOwns] = ranked[0]
  const [runner, runnerOwns] = ranked[1]
  const pairOwns = leaderOwns + runnerOwns
  return { leader, leaderOwns, runner, runnerOwns, ofDeaths: t.total, pairOwns, shareOfDeaths: +(pairOwns / t.total).toFixed(3), duet: leaderOwns === runnerOwns }
}

// (v0.795.0) the verdict riders' own row - THE VERDICT'S OWN MIX: a
// measure of the shape, never a named owner (the seat's tie law holds);
// the pair prices the concentration the solo law refused to seat. Junk
// never prints a shape (the honest silence's own row law).
export function shelterOutcomeRidersRow (r) {
  if (!r || typeof r !== 'object') return null
  const { leader, leaderOwns, runner, runnerOwns, ofDeaths, pairOwns, shareOfDeaths } = r
  if (typeof leader !== 'string' || !leader || typeof runner !== 'string' || !runner ||
      !Number.isFinite(leaderOwns) || leaderOwns <= 0 || !Number.isFinite(runnerOwns) || runnerOwns <= 0 ||
      !Number.isFinite(ofDeaths) || ofDeaths <= 0 || !Number.isFinite(pairOwns) || pairOwns > ofDeaths ||
      !Number.isFinite(shareOfDeaths)) return null
  return `the verdict book's own riders (v0.795.0): no solo verdict owns the majority - ${leader} x${leaderOwns} + ${runner} x${runnerOwns} own ${pairOwns} of ${ofDeaths} combat death(s) (${(shareOfDeaths * 100).toFixed(1)}%) - THE VERDICT'S OWN MIX: the seat's tie law held, the mix is the shape - the classes' own spread prices the book the solo law refused to seat`
}
