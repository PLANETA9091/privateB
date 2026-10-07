// (v0.390.0) THE SHOOTER-BAND CENSUS - the blind-tool lesson applied to the
// combat layer's own print (the v0.371.0 shape; the v0.382.0 bank-flow,
// v0.387.0 deliverable and v0.388.0 route-gate census siblings). The combat
// layer already prints its whole anatomy on every engagement - the bot, the
// verb (fighting / fleeing / shelter / ring / yield / verdict flip), the
// attacker, the priced distance - face 15 (36760275928) alone carried 668
// combat lines across 5 attackers - but the mining tool read only three
// ad-hoc substrings (flee-shore, fight ended, open-field yield) and the
// ranged band the mobs actually kill from (the arrow wall, the ranged ring,
// the cooldown that out-trades a chase) was never structured. This module is
// the pure parser (unit-pinned, the routecensus v0.388.0 shape); decompose
// is its field read. Mining-surface only: zero fleet wiring, zero new log
// lines - the v0.379.0 precedent.
//
// THE ANATOMY (verbatim from face 15, the fleet's own words):
//   F9 [F9] combat: shelter ring ranged mode: the full ring is refused,
//     the arrow wall owns it vs skeleton@2.8
//   F9 [F9] combat: sheltering from skeleton (arrow wall, cells 6/8,
//     proximity re-verdict)
//   F1 [F1] combat: ranged cooldown armed vs skeleton (10s) - the chase
//     never wins the arrow trade
//   F12 [F12] combat: verdict flipped to flee vs zombie (hp 12.3)
//   F9 [F9] combat: shelter try vs skeleton (dist 2.8, proximity re-verdict)
//   F15 [F15] combat: shelter skip (open field: ring not buildable
//     [-o -o -o -o], no arrow wall either vs drowned@6.9)
// The verb vocabulary is pinned to the layer's emitted forms (a wording
// drift breaks the tests loudly - the sibling-shape law); UNKNOWN verbs are
// never judged: they land in otherVerbs, visible and counted (the
// honest-sweep law - never silently dropped). The deathsweep (v0.389.0)
// owns the death lines; this census keys on the combat marker only, so the
// shooter inference inside a death line ('inferred: skeleton@14.7') never
// double-counts.
//
// (v0.394.0) THE HONEST WALL MISS - the fleet's wall-scan verdict line
// renamed from 'shelter skip (open field: no diggable wall, ...)' to
// 'shelter wall miss (open field: no diggable wall, ring next, ...)': the
// line is a ROUTE MARKER (the ring attempt follows and may SUCCEED - the
// success line 'sheltering from ...' follows it), naming it a skip made the
// census double-count one shelter attempt as two skips (face 15: 150 skips
// over 76 tries). The miss is its own verb + its own count
// (shelter.wallMiss); the SKIP_REASON_RES 'no-diggable-wall' key stays for
// the HISTORICAL faces (they parse byte-identical). The terrain cure's
// pricing now reads the wall-miss row, not a skip why.
//
// (v0.395.0) THE WHALE-FEED LENS - the line count said the whale carries
// the face (face 15: F2 = 287 of 668), the cross said its SHAPE (the
// shelter/flee economy); only the TEMPO was unread. The [hb] heartbeat's
// ts= rides in the same log - the census timestamps every combat line
// with it (elapsed seconds, ~20s cadence) and splits each bot's stream
// into SESSIONS: an explicit end verb ('fight ended' / 'open-field
// yield') or a silence > 45s starts the next session. THE FIELD READ
// (live before commit): F2's 287 lines are THREE sessions - one of 278.
// THE WHALE IS A SIEGE - one continuous open-field engagement for
// essentially the whole run, not churned micro-bouts; the shelter cure
// must break siege PERSISTENCE (density/mobility), not just single
// attempts. F12 the same shape an octave down (79 lines / 3, max 53).
//
// (v0.398.0) THE SEAL-STOCK BASELINE - the combat side of the v0.396.0
// seal reserve's before/after read. The skip whys name 'ring-stock' but
// never said HOW MUCH stock the bot walked in with - the parens carries
// it ('ring stock 0/2, ground earns nothing'); the a84d6d2 measurement
// was hand-grepped (face 15: 40 of 43 ring-stock skips read stock ZERO
// - pairs 0/2 x26, 0/8 x6, 0/1 x4, 0/7 x2, 0/6 x1, 0/7-after-digging-1
// x1). The census captures the have/need pairs mechanically: every
// shelter-skip whose whys include 'ring-stock' contributes one
// have/need pair (the SKIP_REASON_RES key guarantees the shape - the
// why regex IS 'ring stock \\d+/\\d+'), zeroHave counts the arrivals at
// seal-zero. THE BASELINE (LIVE, the artifact re-downloaded and re-read
// - the a84d6d2 hand count was off by one): face 15 reads seen 43,
// zeroHave 41 (95%) - pairs 0/2=27, 0/8=6, 0/1=4, 0/7=3, 7/8=2, 0/6=1;
// the 7/8 arrivals are the reserve's own confirmation: a bot carrying
// SEVEN still cannot ring (the bound must be the FULL 8). The
// post-reserve faces must walk the zeroHave share DOWN; the row is the
// field verdict's own metric.
//
// (v0.400.0) THE SIEGE VERDICT - the whale-feed sessions named the siege
// read but left the DIFFUSION question unanswerable by the tool: does
// every mob face carry a siege bot, or was face 15's F2 a one-off? The
// verdict is mechanical off the sessions the lens already builds: a bot
// whose LONGEST session reaches SIEGE_MIN_SESSION_LEN carries THE SIEGE.
// THE OBSERVED SEPARATION (live, face 15): the churn octave F12 tops out
// at max 53 lines in one session; the siege F2 runs 278 - the gap is
// wide, and 120 sits conservatively past the churn octave (a fighter
// churning micro-bouts never stacks 120 lines in ONE session at the
// observed shapes) while staying under half the known siege. The
// threshold is a NAMED constant, not a magic number - the next face's
// read either confirms the separation or the tests say loudly it moved.

const num = (s) => Number(s)

// The fleet's bot tag: 'F19 [F19] message' - the combat lines are emitted
// with it, the tag is the only stable attribution (the routecensus shape).
const BOT_TAG_RE = /(?:^|\s)(F\d+) \[\1\]/

// The combat layer's own marker - the body is everything after it.
const MARKER_RE = /\bcombat: (.+)$/

// The attacker vocabulary (face 15's five + face 83's enderman) + the
// priced forms. The layer emits FOUR attacker shapes (all verbatim face
// 15 / face 83):
//   'vs skeleton@2.8'          - the priced vs form (most verbs)
//   ', skeleton@2.8)'          - the bare @ form (shelter skip's prose)
//   'sheltering from skeleton' - the from form
//   'fighting drowned' / 'fleeing skeleton' - the bare engagement form
//
// (v0.796.0) THE ENDERMAN'S OWN GRAMMAR - the sixth name joins the four
// alternations. Face 83 (37689818269, the enderman's debut face) rode
// TWO server-verbatim kills ('was slain by Enderman' x2 - the death
// book's own attacker mix 'Zombie x3 + Enderman x2 own 5 of 6 mob
// kill(s)' (83.3%)) while the encounter book's raw split named only
// 'drowned=23 zombie=31' - FOURTEEN combat lines ('fighting enderman
// (dist 5.0...)', 'fleeing enderman (dist 6.7...)', 'drift return wait
// vs enderman (@5.0)', 'shelter wall miss (open field: ...
// enderman@6.7)', 'vs enderman (proximity)') rode the census UNNAMED - 14 of
// the face's 27 unattributed lines, the pressure's own front blind to
// the killer the death book had named. The widening rides the v0.765.0
// spaced-@ precedent: the held faces 79/81/82 carry zero enderman
// lines - their reads stay byte-identical; face 83's own cell grows the
// enderman key and the seat's denominator re-prices honestly (the solo
// seat 'zombie 31 of 54 (57.4%)' becomes the riders 'zombie x31 +
// drowned x23 own 54 of 68 (79.4%)' - the mix the solo law refused
// while the enderman rode invisible). The seat itself stays name-blind
// - the grammar's fence is these four alternations and nothing else.
const ATTACKER_VS_RE = /vs (drowned|skeleton|zombie|spider|creeper|enderman)(?:@(\d+(?:\.\d+)?))?/
// (v0.765.0) the SPACED @ form - face 68's melee ceiling line rode
// 'drowned @3.3' (a single space before the @); the @ price is real, the
// space is the emitter's own prose. The optional space keeps every prior
// face byte-identical (the unspaced form is the overwhelmingly common one).
const ATTACKER_AT_RE = /(drowned|skeleton|zombie|spider|creeper|enderman) ?@(\d+(?:\.\d+)?)/
const ATTACKER_FROM_RE = /from (drowned|skeleton|zombie|spider|creeper|enderman)\b/
const ATTACKER_BARE_RE = /^(?:fighting|fleeing) (drowned|skeleton|zombie|spider|creeper|enderman)\b/
const DIST_RE = /\(dist (\d+(?:\.\d+)?)/

// The attacker read: the four shapes in priority order (vs first - the
// priced form carries its own dist; the bare @ form is the fallback that
// still prices; from/bare are unpriced attributions).

// The ranged band - the shooter mechanics the mobs kill from (mechanical
// keys only, named as the class): the arrow wall, the ranged ring, the
// ranged cooldown. The NEGATION prose ('no arrow wall either') is not a
// ranged event - the lookbehind keeps the honest read.
const RANGED_KEYS = [
  ['ringRangedRefused', /^shelter ring ranged mode:/],
  ['cooldownArmed', /^ranged cooldown armed/]
]
const ARROW_WALL_RE = /(?<!no )arrow wall/

// (v0.391.0) THE SHELTER-SKIP WHY TAXONOMY - the biggest verb class (face
// 15: skips=150, 22% of the face's combat lines) never said WHY it skipped
// to the mining tool - but the layer already prints the why in the parens
// prose. The reason vocabulary is the layer's own words (verbatim face 15):
//   shelter skip (open field: ring stock 0/2, ground earns nothing)
//   shelter skip (open field: no diggable wall, drowned@5.1)
//   shelter skip (open field: ring not buildable [oo xo oo oo] vs zombie@0.7)
//   shelter skip (open field: ring not buildable [-o -o -o -o], no arrow
//     wall either vs drowned@6.9)
//   shelter skip (open field: ring incomplete 6/8)
//   shelter skip (open field: arrow wall incomplete [empty/empty] vs
//     skeleton@5.0)
//   shelter skip (night=true armed=true hp=20 attackers=4 poison=off
//     threat=skeleton@3.1) - the NIGHT-context form, full telemetry
//   shelter skip (0,1: step-in incomplete) / (-1,0: cells not free) - the
//     CELL-specific forms
// A skip can carry MULTIPLE reasons - each fragment counts (the
// co-occurrence census); a skip with no known fragment lands in 'unknown'
// (the honest-sweep law - never judged, never dropped). The split is the
// shelter cure's design input: ring-stock prices INVENTORY, no-diggable-wall
// prices TERRAIN/TOOL, ring-not-buildable prices the PATTERN.
export const SKIP_REASON_RES = [
  ['ring-stock', /ring stock \d+\/\d+/],
  ['ground-earns-nothing', /ground earns nothing/],
  ['no-diggable-wall', /no diggable wall/],
  ['ring-not-buildable', /ring not buildable/],
  ['no-arrow-wall', /no arrow wall/],
  ['ring-incomplete', /ring incomplete \d+\/\d+/],
  ['arrow-wall-incomplete', /arrow wall incomplete/],
  ['night-context', /night=true/],
  ['step-in-incomplete', /step-in incomplete/],
  ['cells-not-free', /cells not free/]
]

// (v0.398.0) the ring-stock pair - the skip prose's own 'ring stock N/M'
// (have/need); the 'ring-stock' why key guarantees the shape matches.
const RING_STOCK_RE = /ring stock (\d+)\/(\d+)/
//
// (v0.401.0) THE SEAL ROSTER - the per-bot dimension the verdict needs:
// the reserve (v0.396.0) keeps 8 seal units home at BANK time; a bot that
// still arrives seal-empty AFTER the reserve names where the cure missed
// (a below-floor pocket, a family the reserve never saw, a bank that ran
// before the reserve gate). ringStock.byBot carries each bot's own
// seen/zeroHave pair - the roster of seal-empty arrivals, the face-23
// read's first question ('did the reserve miss anyone?').

/**
 * Parse one skip body (the text after 'combat: shelter skip ') into its
 * reason keys - a skip with several fragments returns several keys.
 * Junk-safe: non-string input judges NOTHING (empty array).
 * @param {string} [body] the skip line's body prose
 * @returns {string[]} the reason keys (possibly empty)
 */
export function parseSkipWhys (body) {
  if (typeof body !== 'string') return []
  const whys = []
  for (const [key, re] of SKIP_REASON_RES) {
    if (re.test(body)) whys.push(key)
  }
  return whys
}

// (v0.395.0) the whale-feed split rules - pinned and exported so the
// decompose row prints its own rule and the tests pin the behavior.
export const SESSION_END_VERBS = ['fight-ended', 'open-field-yield']
export const SESSION_GAP_S = 45

// (v0.400.0) THE SIEGE VERDICT bound - a bot's longest session reaching
// this many lines names the SIEGE bot (the churn octave F12 maxes at 53,
// the siege F2 runs 278; 120 is the conservative mid-gap read).
export const SIEGE_MIN_SESSION_LEN = 120

// The heartbeat line: '[hb] n=1 ts=21s rss=251M late=5ms mainLate=0ms'
const HB_RE = /\[hb\] n=\d+ ts=(\d+)s/

// The verb vocabulary, pinned to the layer's emitted forms - MOST SPECIFIC
// FIRST (prefix collisions are real: 'shelter ring ...' before 'shelter
// ...', 'flee ladder|kite|toward shore|bearing' before 'fleeing').
const VERBS = [
  ['ranged-cooldown', /^ranged cooldown armed/],
  ['ring-ranged', /^shelter ring ranged mode:/],
  ['ring-try', /^shelter ring try/],
  ['shelter-dig-earn', /^shelter dig-earn/],
  ['shelter-earn', /^shelter earn/],
  // (v0.394.0) the wall-scan verdict - BEFORE 'shelter skip' in the family
  // order (most-specific-first); the two prefixes never collide ('shelter
  // skip' does not match a 'shelter wall miss' body and vice versa), the
  // position is the family reading order.
  ['shelter-wall-miss', /^shelter wall miss/],
  ['shelter-skip', /^shelter skip/],
  ['shelter-try', /^shelter try/],
  ['sheltering', /^sheltering from/],
  ['verdict-flip', /^verdict flipped to flee/],
  ['pair-preempt', /^pair preempt/],
  ['drift-wait', /^drift return wait/],
  ['open-field-yield', /^open-field yield/],
  ['fight-ended', /^fight ended/],
  ['fighting', /^fighting /],
  ['flee-ladder', /^flee ladder/],
  ['flee-kite', /^flee kite hop/],
  ['flee-shore', /^flee toward shore/],
  ['flee-bearing', /^flee bearing rotated/],
  ['fleeing', /^fleeing /],
  ['critical-bar', /^critical bar/],
  ['melee-ceiling', /^melee chase ceiling held/],
  // (v0.765.0) THE MELEE COOLDOWN'S OWN SEAT - face 68 (37610367304) drifted
  // the vocabulary a second time: 'melee cooldown armed vs drowned (10s)'
  // rode beside the seated 'melee chase ceiling held' and the honest sweep
  // printed its stranger name (UNKNOWN verbs: melee=1). The form is the
  // ranged cooldown's melee sibling (the melee chase's own re-arm voice -
  // the ceiling break never idles vs a closing killer); it gets its own
  // seat the same way, most-specific-first order held (the prefixes never
  // collide: 'ranged cooldown armed' and 'melee cooldown armed' are
  // distinct fronts).
  ['melee-cooldown', /^melee cooldown armed/]
]

/**
 * Parse one log line into a combat-band entry, or null.
 * Junk-safe: non-string input, a missing marker and a truncated body (the
 * FATAL face truncation) all judge NOTHING - a marker with an unknown verb
 * still lands (verb 'other'), never silently dropped.
 * @param {string} [line] one fleet-log line
 * @returns {null|{bot: string|null, verb: string, attacker: string|null, dist: number|null, ranged: boolean}}
 */
export function parseCombatLine (line) {
  if (typeof line !== 'string') return null
  const m = line.match(MARKER_RE)
  if (!m) return null
  const body = m[1]
  const botM = line.match(BOT_TAG_RE)
  let attacker = null
  let dist = null
  const vsM = body.match(ATTACKER_VS_RE)
  const atM = body.match(ATTACKER_AT_RE)
  const fromM = body.match(ATTACKER_FROM_RE)
  const bareM = body.match(ATTACKER_BARE_RE)
  if (vsM) { attacker = vsM[1]; if (vsM[2] !== undefined) dist = num(vsM[2]) }
  else if (atM) { attacker = atM[1]; dist = num(atM[2]) }
  else if (fromM) attacker = fromM[1]
  else if (bareM) attacker = bareM[1]
  if (dist === null) {
    const dM = body.match(DIST_RE)
    if (dM) dist = num(dM[1])
  }
  let verb = 'other'
  for (const [key, re] of VERBS) {
    if (re.test(body)) { verb = key; break }
  }
  let ranged = ARROW_WALL_RE.test(body)
  for (const [, re] of RANGED_KEYS) {
    if (re.test(body)) { ranged = true; break }
  }
  return {
    bot: botM ? botM[1] : null,
    verb,
    attacker,
    dist,
    ranged
  }
}

/**
 * The shooter-band census over a whole face log (pure; the decompose field
 * read). Accepts an array of lines or a raw text blob (split on newline).
 * @param {string[]|string} [lines] the face log
 * @returns {{total: number, entries: Array, byBot: Object<string,number>, byBotVerb: Object<string,Object<string,number>>, byAttacker: Object<string,number>, byVerb: Object<string,number>, otherVerbs: Object<string,number>, ranged: {events: number, arrowWall: number, ringRangedRefused: number, cooldownArmed: number, byAttacker: Object<string,number>}, verdictFlips: number, shelter: {tries: number, skips: number, ringTries: number, wallMiss: number}, skipWhys: Object<string,number>, ringStock: {seen: number, zeroHave: number, pairs: Object<string,number>, byBot: Object<string,{seen: number, zeroHave: number}>}, sessions: {gapS: number, endVerbs: string[], siegeMinLen: number, byBot: Object<string,{sessions: number, maxLen: number}>, siegeByBot: Object<string,number>}, withDist: number, maxDist: number|null}}
 */
export function shooterCensus (lines) {
  const rows = Array.isArray(lines)
    ? lines
    : (typeof lines === 'string' ? lines.split('\n') : [])
  const entries = []
  const raws = []
  const ts = []
  let lastT = null
  for (const l of rows) {
    // (v0.395.0) the [hb] heartbeat's ts= is the log's own clock (elapsed
    // seconds) - every combat line rides the last one seen. Junk-safe: a
    // non-string row judges nothing (parseCombatLine guards its own side).
    const hm = typeof l === 'string' ? l.match(HB_RE) : null
    if (hm) lastT = Number(hm[1])
    const e = parseCombatLine(l)
    if (e) { entries.push(e); raws.push(l); ts.push(lastT) }
  }
  const byBot = {}
  const byBotVerb = {}
  const byAttacker = {}
  const byVerb = {}
  const otherVerbs = {}
  const skipWhys = {}
  // (v0.398.0) the seal-stock baseline counters - have/need pairs off the
  // skip prose, the v0.396.0 reserve's before/after metric
  const ringStockPairs = {}
  let ringStockSeen = 0
  let ringStockZero = 0
  // (v0.401.0) the seal roster - per-bot seen/zeroHave, the cure's blind
  // spot detector
  const ringStockByBot = {}
  const rangedByAttacker = {}
  let arrowWall = 0
  let ringRangedRefused = 0
  let cooldownArmed = 0
  let verdictFlips = 0
  let tries = 0
  let skips = 0
  let ringTries = 0
  // (v0.394.0) the wall-scan verdict count - the route marker the ring
  // attempt follows; the terrain class of the shelter cure reads THIS now
  let wallMiss = 0
  let withDist = 0
  let maxDist = null
  entries.forEach((e, i) => {
    const raw = raws[i]
    const botKey = e.bot ?? 'unknown'
    byBot[botKey] = (byBot[botKey] || 0) + 1
    // (v0.393.0) THE COMBAT-WHALE LENS - byBot and byVerb alone cannot see
    // the whale's SHAPE (face 15: F2=287 lines is 43% of the face, but of
    // WHICH verbs?). The bot x verb cross is the decode tool.
    const vMap = (byBotVerb[botKey] = byBotVerb[botKey] || {})
    vMap[e.verb] = (vMap[e.verb] || 0) + 1
    if (e.verb === 'other') {
      // the honest-sweep law: the unknown verb stays visible - key on the
      // raw first tokens so a drift prints its own name
      const m = raw.match(MARKER_RE)
      const key = m ? (m[1].match(/^[a-z-]+/) ?? ['?'])[0] : '?'
      otherVerbs[key] = (otherVerbs[key] || 0) + 1
    }
    byVerb[e.verb] = (byVerb[e.verb] || 0) + 1
    if (e.attacker) byAttacker[e.attacker] = (byAttacker[e.attacker] || 0) + 1
    if (e.ranged) {
      if (ARROW_WALL_RE.test(raw)) arrowWall++
      if (e.attacker) rangedByAttacker[e.attacker] = (rangedByAttacker[e.attacker] || 0) + 1
    }
    if (e.verb === 'ring-ranged') ringRangedRefused++
    if (e.verb === 'ranged-cooldown') cooldownArmed++
    if (e.verb === 'verdict-flip') verdictFlips++
    if (e.verb === 'shelter-try') tries++
    if (e.verb === 'shelter-wall-miss') wallMiss++
    if (e.verb === 'shelter-skip') {
      skips++
      // (v0.391.0) the why split - the parens prose carries the reasons
      const body = raw.match(MARKER_RE)
      const whys = parseSkipWhys(body ? body[1] : '')
      if (whys.length === 0) skipWhys.unknown = (skipWhys.unknown || 0) + 1
      for (const w of whys) skipWhys[w] = (skipWhys[w] || 0) + 1
      // (v0.398.0) the seal-stock pair - the 'ring-stock' why guarantees
      // the 'ring stock N/M' shape; zeroHave prices the seal-empty arrival
      if (whys.includes('ring-stock')) {
        const sm = (body ? body[1] : '').match(RING_STOCK_RE)
        if (sm) {
          ringStockSeen++
          const bb = (ringStockByBot[botKey] = ringStockByBot[botKey] || { seen: 0, zeroHave: 0 })
          bb.seen++
          if (num(sm[1]) === 0) {
            ringStockZero++
            bb.zeroHave++
          }
          const pk = `${sm[1]}/${sm[2]}`
          ringStockPairs[pk] = (ringStockPairs[pk] || 0) + 1
        }
      }
    }
    if (e.verb === 'ring-try') ringTries++
    if (e.dist !== null) {
      withDist++
      if (maxDist === null || e.dist > maxDist) maxDist = e.dist
    }
  })
  // (v0.395.0) THE WHALE-FEED LENS - the session walk (in-log order): a
  // bot's stream splits on an explicit end verb or a > 45s silence (two+
  // missed heartbeats - a continuous fighter's lines never stray that far
  // apart). The split answers WHAT FEEDS the whale: churn (many short
  // sessions) vs SIEGE (one long one - face 15's F2: 287 lines, one of 278).
  const byBotSessions = {}
  {
    const st = {}
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i]
      const t = ts[i]
      const b = e.bot ?? 'unknown'
      const s = (st[b] = st[b] || { sessions: 1, cur: 0, maxLen: 0, lastT: null, prevVerb: null })
      const endSplit = s.prevVerb !== null && SESSION_END_VERBS.includes(s.prevVerb)
      const gapSplit = s.lastT !== null && t !== null && t - s.lastT > SESSION_GAP_S
      if (endSplit || gapSplit) {
        if (s.cur > s.maxLen) s.maxLen = s.cur
        s.sessions++
        s.cur = 0
      }
      s.cur++
      s.lastT = t
      s.prevVerb = e.verb
    }
    for (const b of Object.keys(st)) {
      if (st[b].cur > st[b].maxLen) st[b].maxLen = st[b].cur
      byBotSessions[b] = { sessions: st[b].sessions, maxLen: st[b].maxLen }
    }
  }
  // (v0.400.0) THE SIEGE VERDICT - the diffusion read off the sessions the
  // lens already built: every bot whose longest session reaches the bound
  // is a siege carrier; an EMPTY map is the honest zero (no siege bot on
  // the face - faces 17/18/19 read exactly this).
  const siegeByBot = {}
  for (const [b, s] of Object.entries(byBotSessions)) {
    if (s.maxLen >= SIEGE_MIN_SESSION_LEN) siegeByBot[b] = s.maxLen
  }
  const rangedEvents = entries.filter((e) => e.ranged).length
  return {
    total: entries.length,
    entries,
    byBot,
    byBotVerb,
    byAttacker,
    byVerb,
    otherVerbs,
    ranged: {
      events: rangedEvents,
      arrowWall,
      ringRangedRefused,
      cooldownArmed,
      byAttacker: rangedByAttacker
    },
    verdictFlips,
    shelter: { tries, skips, ringTries, wallMiss },
    skipWhys,
    ringStock: { seen: ringStockSeen, zeroHave: ringStockZero, pairs: ringStockPairs, byBot: ringStockByBot },
    sessions: { gapS: SESSION_GAP_S, endVerbs: SESSION_END_VERBS, siegeMinLen: SIEGE_MIN_SESSION_LEN, byBot: byBotSessions, siegeByBot },
    withDist,
    maxDist
  }
}

// (v0.792.0) THE ENCOUNTER BOOK'S OWN ATTACKER - WHICH attacker owns the
// combat pressure. Face 81 (37678241663, the pressure storm) rode the raw
// split 'combat lines: 201 (attackers: drowned=22 zombie=116 creeper=10
// skeleton=9 spider=2)' - 159 named touches across 201 lines and no row
// ever said WHO owns the pressure, while the death book's own species
// (v0.788.0) already had its seat. THE SEAT LAW (the census's own
// byAttacker cell only, zero re-parsing - the v0.674.0 add-and-tally
// cell, the v0.788.0 attacker seat's own precedent): the strict-majority
// law, one attacker owns the pressure only above half (a tie owns
// nothing). The names are the combat prose's own lowercase bytes
// ('creeper' < 'drowned' < 'skeleton' < 'spider' < 'zombie') - the other
// capture depth from the death book's server-verbatim species ('Drowned'
// etc.); this lens never joins the two books (the death book's cell
// prices the kills, this one the touches). Junk never invents an
// attacker: a missing or non-object cell, a non-finite or non-positive
// count, or a tied spread reads the honest silence (null - the
// decompose's own guard skips the row).
function shooterAttackerTally (census) {
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

export function shooterAttackerBill (census) {
  const t = shooterAttackerTally(census)
  if (!t) return null
  let topUnits = 0
  let topAttacker = null
  for (const [attacker, n] of Object.entries(t.tallies)) {
    if (n > topUnits) { topUnits = n; topAttacker = attacker }
  }
  if (topAttacker === null || topUnits <= t.total - topUnits) return null
  return { attacker: topAttacker, owns: topUnits, ofLines: t.total, shareOfLines: +(topUnits / t.total).toFixed(3) }
}

// (v0.792.0) the attacker seat's own row - THE PRESSURE'S OWN SEAT: the
// seat names WHICH prose-named attacker owns the encounter book; the
// pressure's own front prices the cure (a zombie crowd is the night's
// own melee levy - the armor and the light lanes price it; the death
// book's own seat (v0.788.0) names the killer that converts). Junk never
// prints a seat (the honest silence's own row law).
export function shooterAttackerBillRow (bill) {
  if (!bill || typeof bill !== 'object') return null
  const { attacker, owns, ofLines, shareOfLines } = bill
  if (typeof attacker !== 'string' || !attacker ||
      !Number.isFinite(owns) || owns <= 0 ||
      !Number.isFinite(ofLines) || ofLines <= 0 || owns > ofLines ||
      !Number.isFinite(shareOfLines)) return null
  return `the encounter book's own attacker (v0.792.0): ${attacker} owns ${owns} of ${ofLines} attacker line(s) (${(shareOfLines * 100).toFixed(1)}%) - THE PRESSURE'S OWN SEAT: one attacker's own touches own the combat book - the pressure's own front prices the encounters the raw split rode unnamed`
}

// (v0.792.0) THE ENCOUNTER BOOK'S OWN ATTACKER RIDERS - the seat's own
// silence's companion. The seat names the solo attacker under the
// strict-majority law; a no-majority pressure mix rode raw with no row
// naming the shape. THE RIDER LAW (the census's own byAttacker cell
// only, zero re-parsing - the seat's own precedent): a MEASURE, never a
// verdict-owner - the top two attackers' concentration prices the shape
// the solo law refused to name (the seat's owner case leaves the
// companion unprinted - the decompose's own branch law). Junk never
// invents a shape: a missing or non-object cell, a non-finite or
// non-positive count, or fewer than two attackers reads the honest
// silence (null). The order is deterministic (count desc, then the
// name's own byte: 'creeper' < 'drowned' < 'skeleton' < 'spider' <
// 'zombie').
export function shooterAttackerRiders (census) {
  const t = shooterAttackerTally(census)
  if (!t) return null
  const ranked = Object.entries(t.tallies).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
  if (ranked.length < 2) return null
  const [leader, leaderOwns] = ranked[0]
  const [runner, runnerOwns] = ranked[1]
  const pairOwns = leaderOwns + runnerOwns
  return { leader, leaderOwns, runner, runnerOwns, ofLines: t.total, pairOwns, shareOfLines: +(pairOwns / t.total).toFixed(3), duet: leaderOwns === runnerOwns }
}

// (v0.792.0) the attacker riders' own row - THE PRESSURE'S OWN MIX: a
// measure of the shape, never a named owner (the seat's tie law holds);
// the pair prices the concentration the solo law refused to seat. Junk
// never prints a shape (the honest silence's own row law).
export function shooterAttackerRidersRow (r) {
  if (!r || typeof r !== 'object') return null
  const { leader, leaderOwns, runner, runnerOwns, ofLines, pairOwns, shareOfLines } = r
  if (typeof leader !== 'string' || !leader || typeof runner !== 'string' || !runner ||
      !Number.isFinite(leaderOwns) || leaderOwns <= 0 || !Number.isFinite(runnerOwns) || runnerOwns <= 0 ||
      !Number.isFinite(ofLines) || ofLines <= 0 || !Number.isFinite(pairOwns) || pairOwns > ofLines ||
      !Number.isFinite(shareOfLines)) return null
  return `the encounter book's own attacker riders (v0.792.0): no solo attacker owns the majority - ${leader} x${leaderOwns} + ${runner} x${runnerOwns} own ${pairOwns} of ${ofLines} attacker line(s) (${(shareOfLines * 100).toFixed(1)}%) - THE PRESSURE'S OWN MIX: the seat's tie law held, the mix is the shape - the encounters' own crowd prices the attackers the solo law refused to name`
}
