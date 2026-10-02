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
