// (v0.425.0) THE DEATH KIND CENSUS - the vertical-death front's mechanical
// leg. The honest death sweep (v0.389.0, deathsweep.mjs) LISTS the fleet's
// real death lines; every mine still classified them BY HAND (faces 26/27:
// 'deaths 2 (F14 drown / F4 skeleton)', 'deaths 4 drops ... 5 deaths' - the
// kind counted off the raw announce text each time). The announce payload
// already carries the server's own verdict - 'cause: server: fell from a
// high place [kind=fall] | inferred: ...' - so the classification is pure
// string work on the anatomy the sweep verified: name [tag] died -
// respawning (cause: server: <verb> [kind=<kind>[ by <attacker>]] | inferred:
// <tail>). THE FRONT (F-9, the vertical death): the fall/void family is the
// row the decompose prints - every future face counts fall/drown/mob/...
// mechanically, the fall rows name the death cell and the inference
// verdict, and 'kind=fall' never has to be re-counted by eye again.
//
// The buckets mirror the runtime's own kind= vocabulary (deathcause.mjs
// parseDeathMessage): fall, drown, mob (the ' by <attacker>' tail kept on
// the row), suffocate, lava, explosion, starve, freeze, other. The census
// NEVER re-adjudicates the server verdict (the v0.117.0 doctrine - the
// server kind stays the authority); it reads what the death handler printed.
// The vertical family = kind fall PLUS the vanilla void phrasing ('fell out
// of the world' - parseDeathMessage honest-'other's it today, but it IS a
// vertical death and the front counts it).
//
// (v0.725.0) THE MISREAD'S OWN WITNESS - the confusion's own context join
// (the v0.653.0 additive law - the v0.713.0/v0.719.0 cells byte-stable).
// The v0.719.0 confusions map counts the kind join's lie per pair; the
// 47th's read named the class behind one of them: ALL THREE drown->fall
// confusions rode the death context's o2 reset(-1) skin - the sensor died
// and the water kept the bot (the v0.707.0 toll owns the skin's MASS, the
// join prices what it did to the WITNESS). The inference bill grows
// o2Blind: the confused deaths whose own death context (o2gap's grammar,
// the one-parser law by reuse) carried the reset skin. The join rides the
// log's own adjacency: the latest server-verdict death row holds the
// pending confusion; the same bot's 'death: drown context' line resolves
// it (reset counts, any other o2 skin - the mirror's 'o2 0', the dry
// read - resolves WITHOUT counting); the next death row replaces the
// pending (the context never spoke - the honest drop); the mob kind's
// 'drowned-kill context' rides another grammar and stays outside (the
// fence - the cell prices what the drown context owns). A kindAgree row's
// context resolves nothing (the join prices the LIE's witness, not the
// sensor's toll - the v0.707.0 census's own subject).

/** The fleet's death announce anatomy, parsed to its payload. The kind group
 * is the server's bucket word; the attacker group only exists for the mob
 * family ('kind=mob by Skeleton'); the tail group carries the lastHarm
 * inference + its verdict bracket. */
const DEATH_KIND_RE = /^F\d+ \[F\d+\] died - respawning \(cause: server: (.+) \[kind=([a-z]+)(?: by ([^\]]+))?\](?: \| inferred: (.*))?\)\s*$/

/** (v0.885.0) THE O2-TRIGGER KIND JOIN'S OWN READ - the death row's kind
 * parsed by the census's own RE (the one-parser law: the grammar lives
 * HERE once, the readers import - never re-spelled). Returns
 * { bot, kind, attacker } for a server-verdict row; the honest null for
 * everything else (the inferred-only family stays unkinded - the server
 * verdict is the authority, its absence is never adjudicated here). */
export function parseDeathKind (line) {
  if (typeof line !== 'string') return null
  const m = DEATH_KIND_RE.exec(line)
  if (!m) return null
  const bot = (line.match(/^(F\d+)\b/) || [])[1] || null
  return { bot, kind: m[2], attacker: m[3] || null }
}

/** The death cell read out of the inference tail ('0s before death at
 * [x,y,z]'). Junk tails (no position, the empty-pocket announce) read null -
 * the row still counts, only the cell stays unprinted. */
const POS_RE = /at \[(-?\d+),(-?\d+),(-?\d+)\]/

// (v0.672.0) THE INFERRED-ONLY DEATH ROW - the unparsed-bucket class the
// run37397155884 dispute named (the lane's cross-verify): when the server
// chat line is NOT fresh at the killing tick (miner.mjs authFresh false),
// the death handler prints the RAW INFERENCE as the whole cause - the field
// witness: 'F16 [F16] died - respawning (cause: drowning (0s before death
// at [-122,48,403]))'. The census parsed only the server-verdict shape, so
// that row sank into the escape hatch and the causes row read 9 deaths
// while the death clock said 10 - THE ARC'S FIRST DISPUTE. The fix parses
// the inferred-only shape (the lastHarm vocabulary: 'drowning', 'fall/env',
// a hostile name@dist) and the stale-harm 'unknown (no hp drop...)' shape,
// counts them in the SAME buckets (the arc reads the death clock RAW) and
// keeps an inferredOnly ledger so every reader knows which rows carry NO
// server verdict (the inference stays the fallback - the v0.117.0 doctrine
// is untouched: a server-verdict row is never re-adjudicated).
const DEATH_INFERRED_RE = /^F\d+ \[F\d+\] died - respawning \(cause: ([a-z][a-z/]*)(?:@[\d.]+)? \(\d+(?:\.\d+)?s before death at \[(-?\d+),(-?\d+),(-?\d+)\]\)\)\s*$/
const DEATH_UNKNOWN_RE = /^F\d+ \[F\d+\] died - respawning \(cause: unknown \(no hp drop in the last 6s at \[(-?\d+),(-?\d+),(-?\d+)\]\)\)\s*$/

/** The lastHarm name vocabulary, mapped to the kind buckets. 'drowning' is
 * the oxygen state, 'fall/env' the gravity fallback, ANY other lowercase
 * name is a hostile entity's name (zombie, skeleton, drowned, ...) - the
 * mob family with the attacker kept on the row. */
function kindOfInferred (name) {
  if (name === 'drowning') return { kind: 'drown', attacker: null }
  if (name === 'fall/env') return { kind: 'fall', attacker: null }
  return { kind: 'mob', attacker: name }
}

/** The inference verdict bracket, named the way the death line prints it.
 * (v0.713.0) the vocabulary grows its own named tails: the BYSTANDER (the
 * explosion's own skin - the exploder removed itself at detonation, the
 * nearest-harm scan read the next-nearest hostile; debuted on the 37th's
 * Creeper pair) and the case-insensitive contradicts (the emitter prints
 * 'CONTRADICTS' uppercase - the v0.425.0 match missed the byte, the
 * grammar corrected by its own reuse). */
function corroborationOf (tail) {
  if (typeof tail !== 'string' || !tail.length) return 'absent'
  if (/names a BYSTANDER/i.test(tail)) return 'bystander'
  if (/corroborates/.test(tail)) return 'corroborates'
  if (/blind to this kind/.test(tail)) return 'blind'
  if (/contradicts/i.test(tail)) return 'contradicts'
  return 'unknown'
}

/** The inferred tail's own name ('zombie@0.6' -> zombie, 'fall/env',
 * 'drowning') - the kind join's input (the name's own bucket vs the
 * server's kind). A tail that names nothing readable joins nothing. */
const INFERRED_NAME_RE = /^([a-z][a-z/]*)(?:@[\d.]+)?/

// (v0.725.0) the death context's own grammar - o2gap's parser imported
// (the one-parser law by reuse, the sensortoll precedent): the join
// reads the same bytes the death printed, never re-lexes them.
import { DROWN_CONTEXT_RE } from './o2gap.mjs'

// (v0.899.0) the fall's own relay rides the death clock's own constants
// (the one-constant law by reuse, the HB_RE law): the heartbeat's stamp
// names each fall's ts by the log's own adjacency and the burst window
// prices the relay's own edge - imported, never re-declared.
import { DEATH_BURST_WINDOW_S, HB_RE } from './sealdeath.mjs'

/** The vertical family: the server's own fall kind, or the vanilla void
 * phrasing riding the honest-'other' bucket today. */
function isVertical (kind, verb) {
  if (kind === 'fall') return true
  return kind === 'other' && typeof verb === 'string' && /\bfell out of the world\b/.test(verb)
}

/**
 * Classify the fleet's death announce lines by the server's own kind.
 * @param {string[]} lines the full fleet19.log lines
 * @returns {{total: number, byKind: Object<string, number>, byBot: Object<string, number>,
 *   byAttacker: Object<string, number>,
 *   vertical: Array<{bot: string, verb: string, kind: string, attacker: string|null,
 *   pos: number[]|null, corroboration: string}>, verticalCount: number, unparsed: string[],
 *   inference: {total: number, corroborates: number, blind: number, contradicts: number,
 *   bystander: number, unknown: number, absent: number, kindAgree: number,
 *   kindDisagree: number, confusions: Object<string, number>}}}
 *   junk-safe: non-string rows judge nothing; an announce-shaped line the
 *   payload regex cannot parse lands in unparsed (the escape hatch - a new
 *   phrasing must surface, never vanish).
 */
export function deathKindCensus (lines) {
  const rows = Array.isArray(lines) ? lines : []
  const byKind = {}
  const byBot = {}
  const vertical = []
  const unparsed = []
  const inferredOnly = []
  const otherVerbs = {}
  // (v0.788.0) THE MOB BOOK'S OWN ATTACKER - the server-verdict mob rows'
  // attacker tally (the v0.674.0 other-verbs precedent: add-and-tally
  // inside the census's own verdict branch, the cell the lens reads).
  // The ' by <attacker>' tail is the server's own named killer (vanilla's
  // own entity-name bytes - 'Zombie', 'Skeleton', 'Drowned'); the
  // inferred-only rows stay OUTSIDE (their name bytes are the inference's
  // own lowercase - the other capture depth; the v0.117.0 doctrine: the
  // server verdict stays the authority, the inference stays the fallback).
  const byAttacker = {}
  // (v0.713.0) THE INFERENCE'S OWN BILL - the two-way read of every
  // server-verdict row's inferred tail: the verdict bracket's own word
  // (corroborates / blind / contradicts / bystander / unknown / absent)
  // and the kind join (the inferred name's own bucket vs the server's
  // kind). The server kind stays the authority (the v0.117.0 doctrine) -
  // the bill measures the WITNESS, never re-adjudicates the verdict.
  // (v0.719.0) THE CONFUSION'S OWN PAIRS - the kind join's lie gets its
  // own map: every kindDisagree row counts its 'serverKind->inferredKind'
  // pair (the additive law - the v0.713.0 cells stay byte-stable). The
  // era's read names the witness's own blind seats: the drown kind
  // misread twice (the 42nd's zombie, the 43rd's creeper - the mob's
  // proximity poisons the water death's tail) and the explosion kind
  // misread three times (the blast's confusion splits mob vs fall).
  const inference = { total: 0, corroborates: 0, blind: 0, contradicts: 0, bystander: 0, unknown: 0, absent: 0, kindAgree: 0, kindDisagree: 0, confusions: {}, o2Blind: { n: 0, pairs: {}, bots: {} } }
  // (v0.725.0) the pending confusion - the latest server-verdict death
  // row holds its own pair (null when the kind joined or the tail was
  // silent); the same bot's drown-context line resolves it
  let pendingConf = null
  let total = 0
  for (const l of rows) {
    if (typeof l !== 'string' || !l.length) continue // junk-safe: the FATAL face truncates (the v0.358.0 lesson)
    // (v0.725.0) THE MISREAD'S OWN WITNESS - the death's own context line
    // resolves the pending confusion (the log's own adjacency: the latest
    // death row holds the pair, the same bot's drown context speaks for
    // it). The reset skin counts; any other o2 skin resolves without
    // counting; another bot's context speaks for nobody. The context line
    // never counts as a death (the face-27 law holds).
    const cm = DROWN_CONTEXT_RE.exec(l)
    if (cm) {
      if (pendingConf && pendingConf.bot === cm[1]) {
        if (cm[2] === 'reset(-1)' && pendingConf.pair) {
          inference.o2Blind.n++
          inference.o2Blind.pairs[pendingConf.pair] = (inference.o2Blind.pairs[pendingConf.pair] || 0) + 1
          inference.o2Blind.bots[pendingConf.bot] = (inference.o2Blind.bots[pendingConf.bot] || 0) + 1
        }
        pendingConf = null // the context spoke - consumed either way
      }
      continue
    }
    const m = DEATH_KIND_RE.exec(l)
    if (!m) {
      if (!/^F\d+ \[F\d+\] died - respawning/.test(l)) continue
      // (v0.672.0) the inferred-only shapes JOIN the census (the arc reads
      // the death clock raw); anything else still surfaces in the hatch.
      const im = DEATH_INFERRED_RE.exec(l)
      if (im) {
        const iname = im[1]
        const bot = (l.match(/^(F\d+)\b/) || [])[1] || null
        const { kind, attacker } = kindOfInferred(iname)
        const pos = [Number(im[2]), Number(im[3]), Number(im[4])]
        total++
        byKind[kind] = (byKind[kind] || 0) + 1
        if (bot) byBot[bot] = (byBot[bot] || 0) + 1
        inferredOnly.push({ bot, name: iname, kind, attacker, pos })
        pendingConf = { bot, pair: null } // (v0.725.0) a death row is a death row - it owns the next context
        if (isVertical(kind, iname)) {
          vertical.push({ bot, verb: iname, kind, attacker, pos, corroboration: 'inferred-only' })
        }
        continue
      }
      const um = DEATH_UNKNOWN_RE.exec(l)
      if (um) {
        const bot = (l.match(/^(F\d+)\b/) || [])[1] || null
        total++
        byKind.unknown = (byKind.unknown || 0) + 1
        if (bot) byBot[bot] = (byBot[bot] || 0) + 1
        inferredOnly.push({ bot, name: 'unknown', kind: 'unknown', attacker: null, pos: [Number(um[1]), Number(um[2]), Number(um[3])] })
        pendingConf = { bot, pair: null } // (v0.725.0) the unknown death owns the context too
        continue
      }
      unparsed.push(l)
      continue
    }
    const [, verb, rawKind, attacker, tail] = m
    const bot = (l.match(/^(F\d+)\b/) || [])[1] || null
    const kind = rawKind === 'mob' ? 'mob' : rawKind
    total++
    byKind[kind] = (byKind[kind] || 0) + 1
    // (v0.674.0) THE OTHER-VERB CENSUS: the honest-'other' bucket carries the
    // server's VERBATIM verb - the run37399670805 spear debut ('was speared
    // by Zombie' x2, kind=other) sat LUMPED in other=2 until the decode
    // read the death lines by hand. The tally surfaces every honest-'other'
    // verb BY ITS WORDS: a new vanilla phrasing names itself in the decode
    // the same face it debuts (no re-adjudication - the server's own words
    // count, the doctrine untouched; a verb rule joins deathcause.mjs on
    // the evidence the census surfaces).
    if (kind === 'other') otherVerbs[verb] = (otherVerbs[verb] || 0) + 1
    // (v0.788.0) the mob book's own attacker - the server's named killer
    // rides its own tally (the mob kind is the seat's own subject; the
    // other kinds carry no 'by' tail - the group only exists for the mob
    // family, the grammar's own fence)
    if (kind === 'mob' && attacker) byAttacker[attacker] = (byAttacker[attacker] || 0) + 1
    if (bot) byBot[bot] = (byBot[bot] || 0) + 1
    // (v0.713.0) the inference's own bill rides every server-verdict row
    const bracket = corroborationOf(tail)
    inference[bracket]++
    inference.total++
    const nm = tail ? INFERRED_NAME_RE.exec(tail) : null
    let pair = null
    if (nm) {
      const ik = kindOfInferred(nm[1]).kind
      if (ik === kind) inference.kindAgree++
      else {
        inference.kindDisagree++
        // (v0.719.0) the confusion's own pair - the kind join's lie named
        pair = `${kind}->${ik}`
        inference.confusions[pair] = (inference.confusions[pair] || 0) + 1
      }
    }
    // (v0.725.0) the latest death owns the context - the confusion rides
    pendingConf = { bot, pair }
    if (isVertical(kind, verb)) {
      const pm = tail ? POS_RE.exec(tail) : null
      vertical.push({
        bot,
        verb,
        kind,
        attacker: attacker || null,
        pos: pm ? [Number(pm[1]), Number(pm[2]), Number(pm[3])] : null,
        corroboration: corroborationOf(tail)
      })
    }
  }
  return { total, byKind, byBot, vertical, verticalCount: vertical.length, unparsed, inferredOnly, inferredOnlyCount: inferredOnly.length, otherVerbs, byAttacker, inference }
}

// (v0.784.0) THE DEATHS' OWN KIND - the death book's own kind seat. The
// v0.425.0 census priced every death's kind and the raw causes line
// printed the buckets - no row ever named WHICH kind owns the death
// book (face 77's own line rode raw: 'death causes: drown=4 fall=1' -
// the drown's majority sat unnamed while the mine read the water's
// levy by hand). THE SEAT LAW (the census's own byKind cell only, zero
// re-parsing - the v0.782.0 bill's own precedent, the cells instead of
// the events): the top kind owns the book under the strict-majority
// law (a tie owns nothing - the storm-has-no-seat precedent); the
// unnamed 'unknown' bucket stays outside (the v0.780.0 fence - a death
// nobody named a kind for closes no seat); the inferred-only rows ride
// their OWN buckets (the v0.672.0 law read the clock raw into the same
// buckets - the seat reads those buckets byte-true, no
// re-adjudication). Junk never invents a seat: a missing or non-object
// census, a non-finite or non-positive cell, or a tied spread reads
// the honest silence (null - the decompose's own guard skips the row).
// The labels are the emitter's own kind vocabulary byte-true (drown,
// fall, mob, suffocate, lava, explosion, starve, freeze, other).
const DEATH_KIND_SEAT_FENCE = new Set(['unknown'])

function deathKindTally (census) {
  if (!census || typeof census !== 'object' || Array.isArray(census)) return null
  const byKind = census.byKind
  if (!byKind || typeof byKind !== 'object' || Array.isArray(byKind)) return null
  const tallies = {}
  let total = 0
  for (const [kind, n] of Object.entries(byKind)) {
    if (DEATH_KIND_SEAT_FENCE.has(kind)) continue
    if (!Number.isFinite(n) || n <= 0) continue
    total += n
    tallies[kind] = (tallies[kind] || 0) + n
  }
  return total > 0 ? { tallies, total } : null
}

export function deathKindBill (census) {
  const t = deathKindTally(census)
  if (!t) return null
  let topUnits = 0
  let topKind = null
  for (const [kind, n] of Object.entries(t.tallies)) {
    if (n > topUnits) { topUnits = n; topKind = kind }
  }
  if (topKind === null || topUnits <= t.total - topUnits) return null
  return { kind: topKind, owns: topUnits, ofDeaths: t.total, shareOfDeaths: +(topUnits / t.total).toFixed(3) }
}

// (v0.784.0) the kind seat's own row - THE KIND'S OWN SEAT: the seat
// names WHICH kind owns the death book; the kind's own front prices
// the cure (a drown crowd is the water's own levy, an explosion crowd
// the blast's own tax, a mob crowd the siege's own win). Junk never
// prints a seat (the honest silence's own row law).
export function deathKindBillRow (bill) {
  if (!bill || typeof bill !== 'object') return null
  const { kind, owns, ofDeaths, shareOfDeaths } = bill
  if (typeof kind !== 'string' || !kind ||
      !Number.isFinite(owns) || owns <= 0 ||
      !Number.isFinite(ofDeaths) || ofDeaths <= 0 || owns > ofDeaths ||
      !Number.isFinite(shareOfDeaths)) return null
  return `the deaths' own kind (v0.784.0): ${kind} owns ${owns} of ${ofDeaths} death(s) (${(shareOfDeaths * 100).toFixed(1)}%) - THE KIND'S OWN SEAT: one kind's own deaths own the book - the kind's own front prices the deaths the raw split rode unnamed`
}

// (v0.784.0) THE DEATHS' OWN KIND RIDERS - the kind seat's own
// silence's companion. The seat names the solo kind under the
// strict-majority law; a no-majority death mix rode raw with no row
// naming the shape. THE RIDER LAW (the census's own byKind cell only,
// zero re-parsing - the seat's own precedent): a MEASURE, never a
// verdict-owner - the top two kinds' concentration prices the shape
// the solo law refused to name (the seat's owner case leaves the
// companion unprinted - the decompose's own branch law). Junk never
// invents a shape: a missing or non-object census, a non-finite or
// non-positive cell, or fewer than two kinds reads the honest silence
// (null). The order is deterministic (count desc, then the name's own
// byte: 'drown' < 'explosion' < 'fall' < 'freeze' < 'lava' < 'mob' <
// 'other' < 'starve' < 'suffocate').
export function deathKindRiders (census) {
  const t = deathKindTally(census)
  if (!t) return null
  const ranked = Object.entries(t.tallies).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
  if (ranked.length < 2) return null
  const [leader, leaderOwns] = ranked[0]
  const [runner, runnerOwns] = ranked[1]
  const pairOwns = leaderOwns + runnerOwns
  return { leader, leaderOwns, runner, runnerOwns, ofDeaths: t.total, pairOwns, shareOfDeaths: +(pairOwns / t.total).toFixed(3), duet: leaderOwns === runnerOwns }
}

// (v0.784.0) the kind riders' own row - THE KIND'S OWN MIX: a measure
// of the shape, never a named owner (the seat's tie law holds); the
// pair prices the concentration the solo law refused to seat. Junk
// never prints a shape (the honest silence's own row law).
export function deathKindRidersRow (r) {
  if (!r || typeof r !== 'object') return null
  const { leader, leaderOwns, runner, runnerOwns, ofDeaths, pairOwns, shareOfDeaths } = r
  if (typeof leader !== 'string' || !leader || typeof runner !== 'string' || !runner ||
      !Number.isFinite(leaderOwns) || leaderOwns <= 0 || !Number.isFinite(runnerOwns) || runnerOwns <= 0 ||
      !Number.isFinite(ofDeaths) || ofDeaths <= 0 || !Number.isFinite(pairOwns) || pairOwns > ofDeaths ||
      !Number.isFinite(shareOfDeaths)) return null
  return `the deaths' own kind riders (v0.784.0): no solo kind owns the majority - ${leader} x${leaderOwns} + ${runner} x${runnerOwns} own ${pairOwns} of ${ofDeaths} death(s) (${(shareOfDeaths * 100).toFixed(1)}%) - THE KIND'S OWN MIX: the seat's tie law held, the mix is the shape - the deaths' own crowd prices the kinds the solo law refused to name`
}

// (v0.788.0) THE MOB BOOK'S OWN ATTACKER - the mob kind's own attacker
// seat. The kind seat (v0.784.0) names WHICH kind owns the death book;
// the mob kind's own ' by <attacker>' tail - the server's own named
// killer - rode raw after it (face 79's own read: 'mob=9' with the
// Zombie/Skeleton/Drowned split unnamed - the mine priced the surge's
// species by hand). THE SEAT LAW (the census's own byAttacker cell only,
// zero re-parsing - the v0.674.0 add-and-tally cell, the v0.784.0 kind
// seat's own precedent): the strict-majority law, one attacker owns the
// mob book only above half (a tie owns nothing); the inferred-only rows
// stay OUTSIDE (their name bytes are the inference's own lowercase - the
// other capture depth; the v0.117.0 doctrine: the server verdict stays
// the authority). Junk never invents an attacker: a missing or
// non-object cell, a non-finite or non-positive count, or a tied spread
// reads the honest silence (null - the decompose's own guard skips the
// row). The labels are the server's own entity-name bytes byte-true
// ('Zombie', 'Skeleton', 'Drowned', ...).
function mobAttackerTally (census) {
  if (!census || typeof census !== 'object' || Array.isArray(census)) return null
  const byAttacker = census.byAttacker
  if (!byAttacker || typeof byAttacker !== 'object' || Array.isArray(byAttacker)) return null
  const tallies = {}
  let total = 0
  for (const [attacker, n] of Object.entries(byAttacker)) {
    if (!Number.isFinite(n) || n <= 0) continue
    total += n
    tallies[attacker] = (tallies[attacker] || 0) + n
  }
  return total > 0 ? { tallies, total } : null
}

export function mobAttackerBill (census) {
  const t = mobAttackerTally(census)
  if (!t) return null
  let topUnits = 0
  let topAttacker = null
  for (const [attacker, n] of Object.entries(t.tallies)) {
    if (n > topUnits) { topUnits = n; topAttacker = attacker }
  }
  if (topAttacker === null || topUnits <= t.total - topUnits) return null
  return { attacker: topAttacker, owns: topUnits, ofKills: t.total, shareOfKills: +(topUnits / t.total).toFixed(3) }
}

// (v0.788.0) the attacker seat's own row - THE ATTACKER'S OWN SEAT: the
// seat names WHICH server-named killer owns the mob book; the attacker's
// own front prices the cure (a zombie crowd is the night's own levy - the
// armor and the light lanes price it; a drowned crowd the water's). Junk
// never prints a seat (the honest silence's own row law).
export function mobAttackerBillRow (bill) {
  if (!bill || typeof bill !== 'object') return null
  const { attacker, owns, ofKills, shareOfKills } = bill
  if (typeof attacker !== 'string' || !attacker ||
      !Number.isFinite(owns) || owns <= 0 ||
      !Number.isFinite(ofKills) || ofKills <= 0 || owns > ofKills ||
      !Number.isFinite(shareOfKills)) return null
  return `the mob book's own attacker (v0.788.0): ${attacker} owns ${owns} of ${ofKills} mob kill(s) (${(shareOfKills * 100).toFixed(1)}%) - THE ATTACKER'S OWN SEAT: one server-named killer owns the mob book - the attacker's own front prices the kills the raw split rode unnamed`
}

// (v0.788.0) THE MOB BOOK'S OWN ATTACKER RIDERS - the attacker seat's own
// silence's companion. The seat names the solo killer under the
// strict-majority law; a no-majority kill mix rode raw with no row naming
// the shape. THE RIDER LAW (the census's own byAttacker cell only, zero
// re-parsing - the seat's own precedent): a MEASURE, never a verdict-owner
// - the top two killers' concentration prices the shape the solo law
// refused to name (the seat's owner case leaves the companion unprinted -
// the decompose's own branch law). Junk never invents a shape: a missing
// or non-object cell, a non-finite or non-positive count, or fewer than
// two killers reads the honest silence (null). The order is deterministic
// (count desc, then the name's own byte: 'Creeper' < 'Drowned' <
// 'Enderman' < 'Skeleton' < 'Spider' < 'Zombie').
export function mobAttackerRiders (census) {
  const t = mobAttackerTally(census)
  if (!t) return null
  const ranked = Object.entries(t.tallies).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
  if (ranked.length < 2) return null
  const [leader, leaderOwns] = ranked[0]
  const [runner, runnerOwns] = ranked[1]
  const pairOwns = leaderOwns + runnerOwns
  return { leader, leaderOwns, runner, runnerOwns, ofKills: t.total, pairOwns, shareOfKills: +(pairOwns / t.total).toFixed(3), duet: leaderOwns === runnerOwns }
}

// (v0.788.0) the attacker riders' own row - THE ATTACKER'S OWN MIX: a
// measure of the shape, never a named owner (the seat's tie law holds);
// the pair prices the concentration the solo law refused to seat. Junk
// never prints a shape (the honest silence's own row law).
export function mobAttackerRidersRow (r) {
  if (!r || typeof r !== 'object') return null
  const { leader, leaderOwns, runner, runnerOwns, ofKills, pairOwns, shareOfKills } = r
  if (typeof leader !== 'string' || !leader || typeof runner !== 'string' || !runner ||
      !Number.isFinite(leaderOwns) || leaderOwns <= 0 || !Number.isFinite(runnerOwns) || runnerOwns <= 0 ||
      !Number.isFinite(ofKills) || ofKills <= 0 || !Number.isFinite(pairOwns) || pairOwns > ofKills ||
      !Number.isFinite(shareOfKills)) return null
  return `the mob book's own attacker riders (v0.788.0): no solo killer owns the majority - ${leader} x${leaderOwns} + ${runner} x${runnerOwns} own ${pairOwns} of ${ofKills} mob kill(s) (${(shareOfKills * 100).toFixed(1)}%) - THE ATTACKER'S OWN MIX: the seat's tie law held, the mix is the shape - the mob's own crowd prices the killers the solo law refused to name`
}

// (v0.844.0) THE MISREAD'S OWN DIRECTION - the sensor-blind confusion's
// own direction seat. The v0.725.0 misread's own witness counts the
// confusions that rode the dead sensor (the death context's o2 reset(-1)
// skin) and prints the pairs raw - no row ever named WHICH direction
// owns the misread book (face 113's own line rode raw: '5 confusion(s)
// rode the dead sensor (drown->mob 4, drown->fall 1)' - the blind
// sensor's drown->mob bias sat unnamed while the mine read the shape by
// hand). THE SEAT LAW (the inference's own o2Blind cell only, zero
// re-parsing - the v0.784.0 seat's own cell precedent): the
// strict-majority law, one direction owns the misread book only above
// half (a tie owns nothing - the storm-has-no-seat precedent); a
// confusion-free or all-agree face reads the honest silence (null - the
// decompose's own guard skips the row). Junk never invents a seat: a
// missing or non-object cell, a non-finite or non-positive count, or a
// tied spread reads the honest silence (null). The labels are the kind
// join's own pair bytes byte-true ('drown->mob', 'drown->fall', ... -
// the server kind the truth rode -> the kind the inference named).
function misreadTally (o2b) {
  if (!o2b || typeof o2b !== 'object' || Array.isArray(o2b)) return null
  const pairs = o2b.pairs
  if (!pairs || typeof pairs !== 'object' || Array.isArray(pairs)) return null
  const tallies = {}
  let total = 0
  for (const [pair, n] of Object.entries(pairs)) {
    if (!Number.isFinite(n) || n <= 0) continue
    total += n
    tallies[pair] = (tallies[pair] || 0) + n
  }
  // the cell's own consistency fence - the witness's own n and the
  // pairs' own sum must agree when both speak (a self-inconsistent
  // cell invents nothing - the junk-never-invents-a-seat law)
  if (Number.isFinite(o2b.n) && o2b.n > 0 && total !== o2b.n) return null
  return total > 0 ? { tallies, total } : null
}

export function misreadDirectionBill (o2b) {
  const t = misreadTally(o2b)
  if (!t) return null
  let topUnits = 0
  let topPair = null
  for (const [pair, n] of Object.entries(t.tallies)) {
    if (n > topUnits) { topUnits = n; topPair = pair }
  }
  if (topPair === null || topUnits <= t.total - topUnits) return null
  return { direction: topPair, owns: topUnits, ofConfusions: t.total, shareOfConfusions: +(topUnits / t.total).toFixed(3) }
}

// (v0.844.0) the direction seat's own row - THE DIRECTION'S OWN SEAT:
// the seat names WHICH pair the blind sensor's own lies ride; the
// direction's own front prices the sensor lane (a drown->mob crowd is
// the dead sensor's mob bias - the rescue read a mob kill where the
// water took the bot; a drown->fall crowd the wall's own misread).
// Junk never prints a seat (the honest silence's own row law).
export function misreadDirectionBillRow (bill) {
  if (!bill || typeof bill !== 'object') return null
  const { direction, owns, ofConfusions, shareOfConfusions } = bill
  if (typeof direction !== 'string' || !direction ||
      !Number.isFinite(owns) || owns <= 0 ||
      !Number.isFinite(ofConfusions) || ofConfusions <= 0 || owns > ofConfusions ||
      !Number.isFinite(shareOfConfusions)) return null
  return `the misread's own direction (v0.844.0): ${direction} owns ${owns} of ${ofConfusions} sensor-blind confusion(s) (${(shareOfConfusions * 100).toFixed(1)}%) - THE DIRECTION'S OWN SEAT: one direction's own lies own the misread book - the direction's own front prices the blind sensor the raw split rode unnamed`
}

// (v0.844.0) THE MISREAD'S OWN DIRECTION RIDERS - the direction seat's
// own silence's companion. The seat names the solo direction under the
// strict-majority law; a no-majority confusion mix rode raw with no row
// naming the shape. THE RIDER LAW (the o2Blind cell only, zero
// re-parsing - the seat's own precedent): a MEASURE, never a
// verdict-owner - the top two directions' concentration prices the
// shape the solo law refused to name (the seat's owner case leaves the
// companion unprinted - the decompose's own branch law). Junk never
// invents a shape: a missing or non-object cell, a non-finite or
// non-positive count, or fewer than two directions reads the honest
// silence (null). The order is deterministic (count desc, then the
// pair's own byte).
export function misreadDirectionRiders (o2b) {
  const t = misreadTally(o2b)
  if (!t) return null
  const ranked = Object.entries(t.tallies).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
  if (ranked.length < 2) return null
  const [leader, leaderOwns] = ranked[0]
  const [runner, runnerOwns] = ranked[1]
  const pairOwns = leaderOwns + runnerOwns
  return { leader, leaderOwns, runner, runnerOwns, ofConfusions: t.total, pairOwns, shareOfConfusions: +(pairOwns / t.total).toFixed(3), duet: leaderOwns === runnerOwns }
}

// (v0.844.0) the direction riders' own row - THE DIRECTION'S OWN MIX: a
// measure of the shape, never a named owner (the seat's tie law holds);
// the pair prices the concentration the solo law refused to seat. Junk
// never prints a shape (the honest silence's own row law).
export function misreadDirectionRidersRow (r) {
  if (!r || typeof r !== 'object') return null
  const { leader, leaderOwns, runner, runnerOwns, ofConfusions, pairOwns, shareOfConfusions } = r
  if (typeof leader !== 'string' || !leader || typeof runner !== 'string' || !runner ||
      !Number.isFinite(leaderOwns) || leaderOwns <= 0 || !Number.isFinite(runnerOwns) || runnerOwns <= 0 ||
      !Number.isFinite(ofConfusions) || ofConfusions <= 0 || !Number.isFinite(pairOwns) || pairOwns > ofConfusions ||
      !Number.isFinite(shareOfConfusions)) return null
  return `the misread's own direction riders (v0.844.0): no solo direction owns the majority - ${leader} x${leaderOwns} + ${runner} x${runnerOwns} own ${pairOwns} of ${ofConfusions} sensor-blind confusion(s) (${(shareOfConfusions * 100).toFixed(1)}%) - THE DIRECTION'S OWN MIX: the seat's tie law held, the mix is the shape - the blind sensor's own crowd prices the directions the solo law refused to name`
}

// (v0.897.0) THE FALLS' OWN ANATOMY - the fall kind's own site book. The
// o2 trigger's kind join (v0.885.0, the lane's own file) prices WHAT the
// trigger would have paid for - and its no-crossing FALL cell has owned
// the unnamed mass three faces running (f155 fall 1, f156 fall 3, f157
// fall 3 - the largest no-crossing cell on the board); face 121's quad
// read 'THREE at the same ledge' BY HAND and face 157's F5+F3 pair sits
// one column apart (x -110/-107, z 421/418 - Chebyshev 3, dy 23 - the
// dig-shaft's own vertical). No row ever priced WHERE the falls own:
// the site's own repeat is the ledge's own case. THE BOOK LAW (the
// census's own vertical cell only, zero re-parsing - the v0.788.0
// byAttacker precedent): the SERVER-VERDICT fall rows only (the
// inferred-only rows stay OUTSIDE - their verdict is the inference's
// own, the v0.117.0 doctrine); the band's own edge is the observed
// split (the dig level y 43..44 vs the surface y 64..67 - the
// FALL_SURFACE_Y constant names its own fence); the site's own radius
// is Chebyshev on x/z against the SITE'S OWN ANCHOR (the first member's
// own x/z - no transitive drift), the observed repeats sit within 8
// (face 121's quad spans dx 8, face 157's pair 3). A blind row (the
// pos-less fall - the tail's own honest absence) counts in the book and
// judges nothing in the bands or the sites (the blind-skin idiom). Junk
// never invents a site: a missing or non-object census, a fall-less
// face, or a lying cell prices nothing (the fence below, the row's own
// guard).
const FALL_SURFACE_Y = 50
const FALL_SHAFT_CHEBYSHEV = 8
const FALL_VERB_FELL = 'fell from a high place'
const FALL_VERB_HIT = 'hit the ground too hard'

function fallAnatomyRows (census) {
  if (!census || typeof census !== 'object' || Array.isArray(census)) return null
  const vertical = Array.isArray(census.vertical) ? census.vertical : []
  return vertical.filter((r) =>
    r && typeof r === 'object' && !Array.isArray(r) &&
    r.kind === 'fall' && r.corroboration !== 'inferred-only')
}

function fallPosOf (row) {
  return Array.isArray(row.pos) && row.pos.length === 3 && row.pos.every(Number.isFinite)
    ? row.pos
    : null
}

export function fallAnatomyBook (census) {
  const rows = fallAnatomyRows(census)
  if (!rows || !rows.length) return null
  let fell = 0
  let hit = 0
  const otherVerbs = {}
  let underground = 0
  let surface = 0
  let blind = 0
  const sites = []
  for (const r of rows) {
    const verb = typeof r.verb === 'string' && r.verb ? r.verb : 'unknown'
    if (verb === FALL_VERB_FELL) fell++
    else if (verb === FALL_VERB_HIT) hit++
    else otherVerbs[verb] = (otherVerbs[verb] || 0) + 1
    const pos = fallPosOf(r)
    if (!pos) { blind++; continue }
    if (pos[1] < FALL_SURFACE_Y) underground++
    else surface++
    const site = sites.find((s) =>
      Math.max(Math.abs(s.anchor[0] - pos[0]), Math.abs(s.anchor[1] - pos[2])) <= FALL_SHAFT_CHEBYSHEV)
    if (site) site.members.push(r.bot)
    else sites.push({ anchor: [pos[0], pos[2]], members: [r.bot] })
  }
  const live = sites
    .filter((s) => s.members.length > 1)
    .sort((a, b) => a.anchor[0] - b.anchor[0] || a.anchor[1] - b.anchor[1])
  const clustered = live.reduce((n, s) => n + s.members.length, 0)
  return {
    falls: rows.length, fell, hit, otherVerbs,
    underground, surface, blind,
    clustered, unclustered: rows.length - blind - clustered,
    sites: live
  }
}

/** The anatomy's own fence: every cell integer and non-negative, the
 * verdicts' own sum rides the falls, the bands' own sum rides the falls,
 * the seats' own sum rides the cluster, and the seated bots must be a
 * sub-multiset of the positioned rows' own bots (a seat for a bot that
 * never fell lies through the mirror). The verdict and band cells are
 * byte-verified against the census's own image (the rows' own verb and
 * pos cells - the fold's own recount, never the book's word). An
 * inconsistent book prices nothing. */
export function fallAnatomyConsistent (census, book) {
  const rows = fallAnatomyRows(census)
  if (!rows || !book || typeof book !== 'object' || Array.isArray(book)) return false
  const cells = [book.falls, book.fell, book.hit, book.underground, book.surface, book.blind, book.clustered, book.unclustered]
  if (!cells.every((v) => Number.isInteger(v) && v >= 0)) return false
  if (book.falls !== rows.length) return false
  // the census's own image: the verdicts' and bands' own recount (the
  // rows' own cells - the book's word is never the authority)
  let fell = 0
  let hit = 0
  const otherVerbs = {}
  let underground = 0
  let surface = 0
  let blind = 0
  for (const r of rows) {
    const verb = typeof r.verb === 'string' && r.verb ? r.verb : 'unknown'
    if (verb === FALL_VERB_FELL) fell++
    else if (verb === FALL_VERB_HIT) hit++
    else otherVerbs[verb] = (otherVerbs[verb] || 0) + 1
    const pos = fallPosOf(r)
    if (!pos) blind++
    else if (pos[1] < FALL_SURFACE_Y) underground++
    else surface++
  }
  if (book.fell !== fell || book.hit !== hit) return false
  const ov = book.otherVerbs
  if (!ov || typeof ov !== 'object' || Array.isArray(ov)) return false
  const ovKeys = Object.keys(ov)
  const ovImage = Object.keys(otherVerbs)
  if (ovKeys.length !== ovImage.length) return false
  for (const verb of ovImage) {
    if (ov[verb] !== otherVerbs[verb]) return false
  }
  if (book.underground !== underground || book.surface !== surface || book.blind !== blind) return false
  if (book.fell + book.hit + ovImage.reduce((n, v) => n + otherVerbs[v], 0) !== book.falls) return false
  if (book.underground + book.surface + book.blind !== book.falls) return false
  if (book.clustered + book.unclustered + book.blind !== book.falls) return false
  if (!Array.isArray(book.sites)) return false
  let members = 0
  const seated = []
  for (const s of book.sites) {
    if (!s || typeof s !== 'object' || Array.isArray(s)) return false
    if (!Array.isArray(s.anchor) || s.anchor.length !== 2 || !s.anchor.every(Number.isFinite)) return false
    if (!Array.isArray(s.members) || !s.members.length) return false
    if (!s.members.every((b) => typeof b === 'string' && b.length)) return false
    members += s.members.length
    for (const b of s.members) seated.push(b)
  }
  if (members !== book.clustered) return false
  const positioned = []
  for (const r of rows) {
    if (fallPosOf(r)) positioned.push(typeof r.bot === 'string' ? r.bot : '')
  }
  if (positioned.length !== book.clustered + book.unclustered) return false
  // the seats' own radius law: every seated member's own pos must sit
  // within the shaft radius of its site's own anchor (the rows' own pos
  // cells byte-verified, each positioned row seats once - a seat for a
  // fall that rode its own ground lies through the geometry)
  const pool = rows
    .map((r) => ({ bot: typeof r.bot === 'string' ? r.bot : '', pos: fallPosOf(r) }))
    .filter((r) => r.pos)
  for (const s of book.sites) {
    for (const b of s.members) {
      const idx = pool.findIndex((r) => r.bot === b &&
        Math.max(Math.abs(s.anchor[0] - r.pos[0]), Math.abs(s.anchor[1] - r.pos[2])) <= FALL_SHAFT_CHEBYSHEV)
      if (idx < 0) return false
      pool.splice(idx, 1)
    }
  }
  // the unseated rows' own law: a positioned row left out of the seats
  // must sit OUTSIDE every live site's own radius (the walk's own
  // geometry, byte-verified against the rows' own pos cells)
  for (const r of pool) {
    for (const s of book.sites) {
      if (Math.max(Math.abs(s.anchor[0] - r.pos[0]), Math.abs(s.anchor[1] - r.pos[2])) <= FALL_SHAFT_CHEBYSHEV) return false
    }
  }
  const bytewise = (a, b) => (a < b ? -1 : a > b ? 1 : 0)
  const seatedSorted = [...seated].sort(bytewise)
  const positionedSorted = [...positioned].sort(bytewise)
  let pi = 0
  for (const b of seatedSorted) {
    while (pi < positionedSorted.length && positionedSorted[pi] !== b) pi++
    if (pi >= positionedSorted.length) return false
    pi++
  }
  return true
}

// (v0.897.0) the anatomy's own row - THE SHAFT'S OWN REPEAT: WHERE the
// falls own (the band's own split + the site's own repeat). The
// zero-class silence: only the live classes ride (a silent verdict word,
// band or site cell reads nothing); the site's own tail prints only on a
// live cluster - a cluster-free face reads the site's own silence branch
// (the branch law: one row never both). Junk never prints a row.
export function fallAnatomyRow (book) {
  if (!book || typeof book !== 'object' || Array.isArray(book)) return null
  const { falls, fell, hit, underground, surface, blind, clustered, sites } = book
  if (![falls, fell, hit, underground, surface, blind, clustered].every((v) => Number.isInteger(v) && v >= 0)) return null
  if (falls <= 0 || fell + hit > falls) return null
  const ov = book.otherVerbs
  if (!ov || typeof ov !== 'object' || Array.isArray(ov)) return null
  let otherSum = 0
  for (const n of Object.values(ov)) {
    if (!Number.isInteger(n) || n <= 0) return null
    otherSum += n
  }
  if (fell + hit + otherSum !== falls) return null
  if (underground + surface + blind !== falls) return null
  const verdict = []
  if (fell) verdict.push(`fell ${fell}`)
  if (hit) verdict.push(`hit ${hit}`)
  if (otherSum) verdict.push(`other ${otherSum}`)
  const band = []
  if (underground) band.push(`underground ${underground}`)
  if (surface) band.push(`surface ${surface}`)
  if (blind) band.push(`blind ${blind}`)
  let siteTail
  if (clustered > 0) {
    if (!Array.isArray(sites) || !sites.length) return null
    const named = sites
      .map((s) => (s && typeof s === 'object' && !Array.isArray(s) && Array.isArray(s.members)
        ? s.members.filter((b) => typeof b === 'string' && b.length).join('+')
        : ''))
      .filter(Boolean)
      .join(', ')
    if (!named) return null
    siteTail = `, clustered ${clustered} of ${falls} (${sites.length} site${sites.length === 1 ? '' : 's'}: ${named}) - THE SHAFT'S OWN REPEAT: the falls' own site prices the ledge the raw split rode unnamed - the dig-shaft's own vertical`
  } else {
    if (Array.isArray(sites) && sites.length) return null
    siteTail = ' - the site\'s own silence: every fall rode its own ground this face'
  }
  return `the falls' own anatomy (v0.897.0): falls ${falls} - ${verdict.join('/')}, ${band.join('/')}${siteTail}`
}

// (v0.898.0) THE MOB BOOK'S OWN ANATOMY - WHERE and HOW the mob kind's
// own deaths own: the verb's own split (the server's own slain/shot
// words - the melee-vs-ranged lever the raw mob bucket rode unnamed)
// + the band's own split (the same surface edge the falls priced -
// face 159's nine mob kills all rode y 61..66, the surface's own band)
// + the site's own repeat (the anchor radius law - the first member's
// x/z, no transitive drift). The book reads the LOG LINES directly (the
// o2 family's own book-only precedent - the census's vertical cell is
// the falls' own subject, the mob rows live outside it, zero census
// shape change). Server-verdict mob rows only (the inferred-only and
// junk shapes never match the server verdict - the v0.117.0 doctrine);
// the explosion kind stays OUTSIDE (its own kind rides the o2 family's
// join - the mob book's subject is the mob kind alone). A mob-less face
// reads the honest silence (the zero-class law); a pos-less mob row
// counts and judges nothing (the blind skin - the v0.897.0 law); an
// inconsistent book prices nothing (the fence rides the print - the
// v0.897.0 fence family, byte-true).
const MOB_SITE_CHEBYSHEV = 8
const MOB_VERB_SLAIN = 'was slain by'
const MOB_VERB_SHOT = 'was shot by'

function mobAnatomyRows (lines) {
  const rows = Array.isArray(lines) ? lines : []
  const out = []
  for (const l of rows) {
    if (typeof l !== 'string' || !l.length) continue
    const m = DEATH_KIND_RE.exec(l)
    if (!m) continue // the inferred-only and junk shapes stay OUTSIDE (the server verdict is the authority)
    const [, verb, rawKind, attacker, tail] = m
    if (rawKind !== 'mob') continue // the mob kind alone is the subject (the blast and the drown ride their own books)
    const bot = (l.match(/^(F\d+)\b/) || [])[1] || null
    const pm = tail ? POS_RE.exec(tail) : null
    out.push({
      bot,
      verb,
      attacker: attacker || null,
      pos: pm ? [Number(pm[1]), Number(pm[2]), Number(pm[3])] : null,
      corroboration: corroborationOf(tail)
    })
  }
  return out
}

const mobPosOf = (r) => Array.isArray(r.pos) && r.pos.length === 3 && r.pos.every(Number.isFinite)
  ? r.pos
  : null

export function mobAnatomyBook (lines) {
  const rows = mobAnatomyRows(lines)
  if (!rows.length) return null
  let slain = 0
  let shot = 0
  const otherVerbs = {}
  let underground = 0
  let surface = 0
  let blind = 0
  const sites = []
  for (const r of rows) {
    const verb = typeof r.verb === 'string' && r.verb ? r.verb : 'unknown'
    // the verb's own head rides the split (the server's own phrase 'was
    // slain by Zombie' - the attacker's own name rides the tail, the
    // head's own word is the verdict cell - the census's own image)
    if (verb.startsWith(MOB_VERB_SLAIN)) slain++
    else if (verb.startsWith(MOB_VERB_SHOT)) shot++
    else otherVerbs[verb] = (otherVerbs[verb] || 0) + 1
    const pos = mobPosOf(r)
    if (!pos) { blind++; continue }
    if (pos[1] < FALL_SURFACE_Y) underground++
    else surface++
    const site = sites.find((s) =>
      Math.max(Math.abs(s.anchor[0] - pos[0]), Math.abs(s.anchor[1] - pos[2])) <= MOB_SITE_CHEBYSHEV)
    if (site) site.members.push(r.bot)
    else sites.push({ anchor: [pos[0], pos[2]], members: [r.bot] })
  }
  const live = sites
    .filter((s) => s.members.length > 1)
    .sort((a, b) => a.anchor[0] - b.anchor[0] || a.anchor[1] - b.anchor[1])
  const clustered = live.reduce((n, s) => n + s.members.length, 0)
  return {
    mobs: rows.length, slain, shot, otherVerbs,
    underground, surface, blind,
    clustered, unclustered: rows.length - blind - clustered,
    sites: live,
    rows
  }
}

/** The mob anatomy's own fence - the v0.897.0 fence family byte-true:
 * every cell integer and non-negative, the verdicts' own sum rides the
 * mobs, the bands' own sum rides the mobs, the seats' own sum rides the
 * cluster, the seated bots a sub-multiset of the positioned rows' own
 * bots, the unseated rows OUTSIDE every live radius. The verdict and
 * band cells byte-verified against the parse's own image (the book's
 * own rows - the fold's own recount, never the book's word). An
 * inconsistent book prices nothing. */
export function mobAnatomyConsistent (book) {
  if (!book || typeof book !== 'object' || Array.isArray(book)) return false
  const rows = Array.isArray(book.rows) ? book.rows : []
  for (const r of rows) {
    if (!r || typeof r !== 'object' || Array.isArray(r)) return false
    if (r.bot !== null && typeof r.bot !== 'string') return false
    if (typeof r.verb !== 'string' || !r.verb) return false
    if (r.attacker !== null && typeof r.attacker !== 'string') return false
    if (r.pos !== null && !(Array.isArray(r.pos) && r.pos.length === 3 && r.pos.every(Number.isFinite))) return false
    if (typeof r.corroboration !== 'string' || !r.corroboration) return false
  }
  const cells = [book.mobs, book.slain, book.shot, book.underground, book.surface, book.blind, book.clustered, book.unclustered]
  if (!cells.every((v) => Number.isInteger(v) && v >= 0)) return false
  if (book.mobs !== rows.length) return false
  // the parse's own image: the verdicts' and bands' own recount
  let slain = 0
  let shot = 0
  const otherVerbs = {}
  let underground = 0
  let surface = 0
  let blind = 0
  for (const r of rows) {
    const verb = typeof r.verb === 'string' && r.verb ? r.verb : 'unknown'
    // the verb's own head rides the split (the server's own phrase 'was
    // slain by Zombie' - the attacker's own name rides the tail, the
    // head's own word is the verdict cell - the census's own image)
    if (verb.startsWith(MOB_VERB_SLAIN)) slain++
    else if (verb.startsWith(MOB_VERB_SHOT)) shot++
    else otherVerbs[verb] = (otherVerbs[verb] || 0) + 1
    const pos = mobPosOf(r)
    if (!pos) { blind++; continue }
    if (pos[1] < FALL_SURFACE_Y) underground++
    else surface++
  }
  if (book.slain !== slain || book.shot !== shot) return false
  const ov = book.otherVerbs
  if (!ov || typeof ov !== 'object' || Array.isArray(ov)) return false
  const ovKeys = Object.keys(ov)
  const ovImage = Object.keys(otherVerbs)
  if (ovKeys.length !== ovImage.length) return false
  for (const verb of ovImage) {
    if (ov[verb] !== otherVerbs[verb]) return false
  }
  if (book.underground !== underground || book.surface !== surface || book.blind !== blind) return false
  if (book.slain + book.shot + ovImage.reduce((n, v) => n + otherVerbs[v], 0) !== book.mobs) return false
  if (book.underground + book.surface + book.blind !== book.mobs) return false
  if (book.clustered + book.unclustered + book.blind !== book.mobs) return false
  if (!Array.isArray(book.sites)) return false
  let members = 0
  const seated = []
  for (const s of book.sites) {
    if (!s || typeof s !== 'object' || Array.isArray(s)) return false
    if (!Array.isArray(s.anchor) || s.anchor.length !== 2 || !s.anchor.every(Number.isFinite)) return false
    if (!Array.isArray(s.members) || !s.members.length) return false
    if (!s.members.every((b) => typeof b === 'string' && b.length)) return false
    members += s.members.length
    for (const b of s.members) seated.push(b)
  }
  if (members !== book.clustered) return false
  const positioned = []
  for (const r of rows) {
    if (mobPosOf(r)) positioned.push(typeof r.bot === 'string' ? r.bot : '')
  }
  if (positioned.length !== book.clustered + book.unclustered) return false
  const pool = rows.map((r) => ({ bot: typeof r.bot === 'string' ? r.bot : '', pos: mobPosOf(r) })).filter((r) => r.pos)
  for (const s of book.sites) {
    for (const b of s.members) {
      const idx = pool.findIndex((r) => r.bot === b &&
        Math.max(Math.abs(s.anchor[0] - r.pos[0]), Math.abs(s.anchor[1] - r.pos[2])) <= MOB_SITE_CHEBYSHEV)
      if (idx < 0) return false
      pool.splice(idx, 1)
    }
  }
  for (const r of pool) {
    for (const s of book.sites) {
      if (Math.max(Math.abs(s.anchor[0] - r.pos[0]), Math.abs(s.anchor[1] - r.pos[2])) <= MOB_SITE_CHEBYSHEV) return false
    }
  }
  const bytewise = (a, b) => (a < b ? -1 : a > b ? 1 : 0)
  const seatedSorted = [...seated].sort(bytewise)
  const positionedSorted = [...positioned].sort(bytewise)
  let pi = 0
  for (const b of seatedSorted) {
    while (pi < positionedSorted.length && positionedSorted[pi] !== b) pi++
    if (pi >= positionedSorted.length) return false
    pi++
  }
  return true
}

// (v0.898.0) the mob anatomy's own row - THE MELEE'S OWN SEAT: HOW the
// mob kills own (the verb's own split) + WHERE (the band's own split +
// the site's own repeat). The zero-class silence: only the live classes
// ride; the site's own tail prints only on a live cluster - a
// cluster-free face reads the site's own silence branch (the branch
// law: one row never both). Junk never prints a row.
export function mobAnatomyRow (book) {
  if (!book || typeof book !== 'object' || Array.isArray(book)) return null
  const { mobs, slain, shot, underground, surface, blind, clustered, sites } = book
  if (![mobs, slain, shot, underground, surface, blind, clustered].every((v) => Number.isInteger(v) && v >= 0)) return null
  if (mobs <= 0 || slain + shot > mobs) return null
  const ov = book.otherVerbs
  if (!ov || typeof ov !== 'object' || Array.isArray(ov)) return null
  let otherSum = 0
  for (const n of Object.values(ov)) {
    if (!Number.isInteger(n) || n <= 0) return null
    otherSum += n
  }
  if (slain + shot + otherSum !== mobs) return null
  if (underground + surface + blind !== mobs) return null
  const verdict = []
  if (slain) verdict.push(`slain ${slain}`)
  if (shot) verdict.push(`shot ${shot}`)
  if (otherSum) verdict.push(`other ${otherSum}`)
  const band = []
  if (underground) band.push(`underground ${underground}`)
  if (surface) band.push(`surface ${surface}`)
  if (blind) band.push(`blind ${blind}`)
  let siteTail
  if (clustered > 0) {
    if (!Array.isArray(sites) || !sites.length) return null
    const named = sites
      .map((s) => (s && typeof s === 'object' && !Array.isArray(s) && Array.isArray(s.members)
        ? s.members.filter((b) => typeof b === 'string' && b.length).join('+')
        : ''))
      .filter(Boolean)
      .join(', ')
    if (!named) return null
    siteTail = `, clustered ${clustered} of ${mobs} (${sites.length} site${sites.length === 1 ? '' : 's'}: ${named}) - THE SITE'S OWN REPEAT: the mob kills' own site prices the ground the raw mob bucket rode unnamed - the night's own gate`
  } else {
    if (Array.isArray(sites) && sites.length) return null
    siteTail = ' - the sites\' own silence: every kill rode its own ground this face - THE AMBIENT NIGHT\'S OWN SPREAD, not one gate\'s repeat'
  }
  return `the mob book's own anatomy (v0.898.0): mobs ${mobs} - ${verdict.join('/')}, ${band.join('/')}${siteTail}`
}

// (v0.899.0) THE FALL'S OWN RELAY - the TIME leg the v0.897.0 anatomy
// does not price: the first fall named the shaft and the walkers behind
// still fell into it (face 172's own cluster: 3 falls, ONE block
// [-114,43,411], one burst window - the site's own repeat rode the
// clock unpriced; the lane's own weigh-in named the front). THE BOOK
// LAW (the v0.898.0 book-only precedent - zero census shape change):
// the rows read the LOG LINES directly, server-verdict fall kind only
// (DEATH_KIND_RE never matches the inferred-only shape - the v0.117.0
// doctrine rides the grammar); the clock rides the log's own adjacency
// (the heartbeat's own stamp - the death clock's ts law by reuse: each
// fall's ts = the last heartbeat ts BEFORE its line; an untimed fall -
// no heartbeat seen yet - counts and judges nothing, the blind-skin
// idiom). THE SITE LAW rides the anatomy's own geometry (the anchor =
// the first member in line order, Chebyshev <= 8 on x/z against
// FALL_SHAFT_CHEBYSHEV, no transitive drift); the members ride the ts
// sort (the clock's own order, the bot's own name breaking the tie).
// THE RELAY LAW (the chain read - the lane's own face-172 print): each
// member rides its PRIOR member's window (gap = ts[i] - ts[i-1] <=
// DEATH_BURST_WINDOW_S, the death clock's own burst constant imported -
// the one-constant law); the first member never relays (no prior to
// ride); a gap past the window breaks the chain honestly (the walker
// arrived before the knowledge could rot, not after a death named the
// shaft). A live site = relayed >= 1; the book carries the LIVE sites
// only (the row prints the clusters the relay priced). Junk never
// invents a relay: a fall-less face prices nothing (null); the fence
// below rides the print (the v0.897.0 fence family, byte-true).
function fallRelayRows (lines) {
  const rows = Array.isArray(lines) ? lines : []
  const out = []
  let lastTs = null
  for (const l of rows) {
    if (typeof l !== 'string' || !l.length) continue // junk-safe: the FATAL face truncates (the v0.358.0 lesson)
    const hm = HB_RE.exec(l)
    if (hm) lastTs = Number(hm[1])
    const m = DEATH_KIND_RE.exec(l)
    if (!m) continue // the inferred-only and junk shapes stay OUTSIDE (the server verdict is the authority)
    const [, verb, rawKind, attacker, tail] = m
    if (rawKind !== 'fall') continue // the fall kind alone is the subject (the v0.897.0 law; the void-'other' phrasing rides its own book)
    const bot = (l.match(/^(F\d+)\b/) || [])[1] || null
    const pm = tail ? POS_RE.exec(tail) : null
    out.push({
      bot,
      verb,
      pos: pm ? [Number(pm[1]), Number(pm[2]), Number(pm[3])] : null,
      corroboration: corroborationOf(tail),
      ts: lastTs
    })
  }
  return out
}

export function fallRelayBook (lines) {
  const rows = fallRelayRows(lines)
  if (!rows.length) return null
  const positioned = rows.filter((r) => fallPosOf(r) && Number.isFinite(r.ts))
  const sites = []
  for (const r of positioned) {
    const pos = fallPosOf(r)
    const site = sites.find((s) =>
      Math.max(Math.abs(s.anchor[0] - pos[0]), Math.abs(s.anchor[1] - pos[2])) <= FALL_SHAFT_CHEBYSHEV)
    if (site) site.members.push({ bot: r.bot, ts: r.ts })
    else sites.push({ anchor: [pos[0], pos[2]], members: [{ bot: r.bot, ts: r.ts }] })
  }
  let relayed = 0
  const live = []
  for (const s of sites) {
    s.members.sort((a, b) => a.ts - b.ts || (a.bot < b.bot ? -1 : a.bot > b.bot ? 1 : 0))
    s.relayed = 0
    s.gaps = []
    for (let i = 1; i < s.members.length; i++) {
      const gap = s.members[i].ts - s.members[i - 1].ts
      if (gap <= DEATH_BURST_WINDOW_S) { s.relayed++; s.gaps.push(gap); relayed++ }
    }
    if (s.relayed > 0) live.push(s)
  }
  live.sort((a, b) => a.members[0].ts - b.members[0].ts || (a.anchor[0] - b.anchor[0]) || (a.anchor[1] - b.anchor[1]))
  return { falls: rows.length, positioned: positioned.length, relayed, relayClusters: live.length, sites: live }
}

/** The relay's own fence: every cell integer and non-negative, the
 * positioned cell rides the falls, the relayed cell rides the
 * positioned, and the mirror law byte-true: the book's live sites must
 * be exactly the walk's own live sites (the anchors, the members, the
 * relayed counts, the gaps - a mirror recount from the rows' own cells,
 * never the book's word). The unseated law rides the mirror too: a
 * positioned fall the book never seated either sits outside every live
 * site's radius or its own relay chain priced nothing (the walk
 * recomputes both - a seated fall that rode no window or an unseated
 * fall that rode one lies through the clock). An inconsistent book
 * prices nothing. */
export function fallRelayConsistent (lines, book) {
  const rows = fallRelayRows(lines)
  if (!book || typeof book !== 'object' || Array.isArray(book)) return false
  const cells = [book.falls, book.positioned, book.relayed, book.relayClusters]
  if (!cells.every((v) => Number.isInteger(v) && v >= 0)) return false
  if (book.falls !== rows.length) return false
  const positionedRows = rows.filter((r) => fallPosOf(r) && Number.isFinite(r.ts))
  if (book.positioned !== positionedRows.length) return false
  if (book.positioned > book.falls) return false
  if (book.relayed > book.positioned) return false
  if (!Array.isArray(book.sites)) return false
  // the mirror walk (the book's own law, recomputed from the rows)
  const sites = []
  for (const r of positionedRows) {
    const pos = fallPosOf(r)
    const site = sites.find((s) =>
      Math.max(Math.abs(s.anchor[0] - pos[0]), Math.abs(s.anchor[1] - pos[2])) <= FALL_SHAFT_CHEBYSHEV)
    if (site) site.members.push({ bot: r.bot, ts: r.ts })
    else sites.push({ anchor: [pos[0], pos[2]], members: [{ bot: r.bot, ts: r.ts }] })
  }
  let relayed = 0
  const live = []
  for (const s of sites) {
    s.members.sort((a, b) => a.ts - b.ts || (a.bot < b.bot ? -1 : a.bot > b.bot ? 1 : 0))
    s.relayed = 0
    s.gaps = []
    for (let i = 1; i < s.members.length; i++) {
      const gap = s.members[i].ts - s.members[i - 1].ts
      if (gap <= DEATH_BURST_WINDOW_S) { s.relayed++; s.gaps.push(gap); relayed++ }
    }
    if (s.relayed > 0) live.push(s)
  }
  live.sort((a, b) => a.members[0].ts - b.members[0].ts || (a.anchor[0] - b.anchor[0]) || (a.anchor[1] - b.anchor[1]))
  if (book.relayed !== relayed || book.relayClusters !== live.length) return false
  if (book.sites.length !== live.length) return false
  for (let i = 0; i < live.length; i++) {
    const b = book.sites[i]
    const m = live[i]
    if (!b || typeof b !== 'object' || Array.isArray(b)) return false
    if (!Array.isArray(b.anchor) || b.anchor.length !== 2 || !b.anchor.every(Number.isFinite)) return false
    if (b.anchor[0] !== m.anchor[0] || b.anchor[1] !== m.anchor[1]) return false
    if (!Array.isArray(b.members) || b.members.length !== m.members.length) return false
    for (let j = 0; j < m.members.length; j++) {
      const bm = b.members[j]
      const mm = m.members[j]
      if (!bm || typeof bm !== 'object' || Array.isArray(bm)) return false
      if (bm.bot !== mm.bot || bm.ts !== mm.ts) return false
    }
    if (!Array.isArray(b.gaps) || b.gaps.length !== m.gaps.length) return false
    for (let j = 0; j < m.gaps.length; j++) {
      if (b.gaps[j] !== m.gaps[j]) return false
    }
  }
  return true
}

// (v0.899.0) the relay's own row - THE WALKERS FELL INTO A SHAFT A
// DEATH HAD NAMED: the time leg's own print. The row prints only when
// the relay question exists (positioned >= 2 - a single positioned fall
// relays nothing by construction, the honest silence); the branch law
// (one row never both): the live clusters print the relay's own chain,
// a relay-free face reads the held branch (the knowledge relayed - no
// fall rode a prior fall's window). Junk never prints a row.
export function fallRelayRow (book) {
  if (!book || typeof book !== 'object' || Array.isArray(book)) return null
  const { falls, positioned, relayed, relayClusters, sites } = book
  if (![falls, positioned, relayed, relayClusters].every((v) => Number.isInteger(v) && v >= 0)) return null
  if (positioned > falls || relayed > positioned) return null
  if (positioned < 2) return null // the relay question needs a walker behind the first fall
  if (!Array.isArray(sites)) return null
  if (relayClusters > 0) {
    if (!sites.length || sites.length !== relayClusters) return null
    const gapWords = []
    const botWords = []
    for (const s of sites) {
      if (!s || typeof s !== 'object' || Array.isArray(s)) return null
      if (!Array.isArray(s.members) || s.members.length < 2) return null
      if (!Array.isArray(s.gaps) || !s.gaps.length) return null
      const bots = []
      for (const m of s.members) {
        if (!m || typeof m !== 'object' || Array.isArray(m)) return null
        if (typeof m.bot !== 'string' || !m.bot.length) return null
        if (!Number.isInteger(m.ts) || m.ts < 0) return null
        bots.push(m.bot)
      }
      for (const g of s.gaps) {
        if (!Number.isInteger(g) || g < 0) return null
        gapWords.push(`${g}s`)
      }
      botWords.push(bots.join('->'))
    }
    return `the fall's own relay (v0.899.0): relayed ${relayed} of ${positioned} positioned fall(s) at ${relayClusters} site${relayClusters === 1 ? '' : 's'} - THE RELAY: the first fall named the shaft and ${relayed} still fell within ${DEATH_BURST_WINDOW_S}s (gaps ${gapWords.join(', ')}; the clusters' bots ${botWords.join(', ')}) - the walkers fell into a shaft a death had named`
  }
  if (sites.length) return null // the branch law: one row never both
  return `the fall's own relay (v0.899.0): relayed 0 of ${positioned} positioned fall(s) - the relay held: no fall rode a prior fall's ${DEATH_BURST_WINDOW_S}s window`
}
