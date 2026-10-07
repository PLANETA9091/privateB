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
  return { total, byKind, byBot, vertical, verticalCount: vertical.length, unparsed, inferredOnly, inferredOnlyCount: inferredOnly.length, otherVerbs, inference }
}

// (v0.783.0) THE DEATHS' OWN KIND - the death book's own kind seat. The
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

// (v0.783.0) the kind seat's own row - THE KIND'S OWN SEAT: the seat
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
  return `the deaths' own kind (v0.783.0): ${kind} owns ${owns} of ${ofDeaths} death(s) (${(shareOfDeaths * 100).toFixed(1)}%) - THE KIND'S OWN SEAT: one kind's own deaths own the book - the kind's own front prices the deaths the raw split rode unnamed`
}

// (v0.783.0) THE DEATHS' OWN KIND RIDERS - the kind seat's own
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

// (v0.783.0) the kind riders' own row - THE KIND'S OWN MIX: a measure
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
  return `the deaths' own kind riders (v0.783.0): no solo kind owns the majority - ${leader} x${leaderOwns} + ${runner} x${runnerOwns} own ${pairOwns} of ${ofDeaths} death(s) (${(shareOfDeaths * 100).toFixed(1)}%) - THE KIND'S OWN MIX: the seat's tie law held, the mix is the shape - the deaths' own crowd prices the kinds the solo law refused to name`
}
