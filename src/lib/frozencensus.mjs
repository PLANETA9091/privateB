// (v0.426.0) THE FROZEN CENSUS - the F10 frozen-while-head-wet class's own
// read, the standing open front's measurement leg. The water lane's walk
// families got their lenses (the sentry v0.422.0 owns the per-pass sight,
// the rescue ledger owns the end verdicts, the drop-walk lens owns the walk
// fails) - but the freeze family itself stayed raw: 48 frozen physics
// verdicts, 14 frozen client relogs and 7 duplicate-login kicks across the
// two held faces (26/27), read only by hand and by the decompose's raw
// count(/frozen client relog/) counters. The class's anatomy (the emitter's
// own law, miner.mjs + drowning.mjs):
//   verdict   'water: frozen physics (N flat passes at y=Y.Y, o2=O[, head
//             WET][ - the wet-critical fast window]) - standing down, the
//             reconnect lane owns this' - the stand-down's condemning read
//             (the wet flag is THE F10 split: a DRY freeze is the bob/apex
//             class, a WET freeze is the drowning-clock class)
//   relog     'water: frozen client relog (#S consecutive)? (WHY) - ending
//             the session, the reconnect lane rebuilds the physics[; the
//             drowning sentry holds non-critical pages Hs (the frozen-return
//             gate) - o2=O health=H window=W[ - ECHO]]' - TWO ERAS: the
//             held faces predate the #S prefix and the whole gate tail
//             (byte-for-byte legacy shape), the current tree prints the
//             full form - both parse, the era never folds
//   refusal   'water: frozen-relog loop break (#S consecutive) (WHY) - the
//             session rides the freeze, the sentry re-pages and the rescue
//             re-verdicts' - the v0.361.0 grace working (worded to stay OUT
//             of the raw relog counter's lane; this census names it)
//   diagnosis 'water: freeze named CLS - WHY' - the v0.340.0 self-naming
//             verdict (STAND_DOWN_LOG_MS-throttled, so sparse by design)
//   gate      'water: frozen-return gate holds the page (Ns left) - the
//             fresh client walks the hazard-ledgered column out' - the
//             hold SURVIVING to hold a page: the relog promise met
//   exemption 'water: apex rest held (N flat passes at y=Y.Y, o2=O, head
//             dry - the lungs own the clock, the release window owns the
//             rest)' - the v0.381.0 apex-rest skip: the frozen verdict NOT
//             condemning (the honest counter-share of the verdict family)
//   churn     'KICKED: ...disconnect.duplicate_login' - the relog lane's
//             own collision (the fresh client arrives while the dead one
//             lingers; the serverguard lane owns the timeout kick, this
//             census owns the duplicate-login one)
// The o2 label rides o2SensorLabel's shapes (value / reset(-1) / ?) AND the
// legacy raw '-1' the held faces print (pre-o2SensorLabel lines for this
// emitter) - the label is kept as evidence, the maths read the domain only.
// The F10 cure input: wet vs dry split + the loop-break share say whether
// the freeze is a WET-COLUMN geometry (the relog lane feeding the loop) or
// a DRY bob class (the exemption owning it); the holds vs bypasses say
// whether the gate's promise lives.
//
// One parser per emitter; mining-surface only: zero fleet wiring, zero new
// log lines (the v0.379.0/v0.403.0/v0.408.0/v0.421.0 precedent).

const TAG = '^(F\\d+) \\[\\1\\] '
const O2 = '(reset\\(-1\\)|\\?|-?\\d+)'

// the verdict: the frozen physics stand-down (NOT the rescue end line
// 'rescue standing down (frozen physics' - that is the rescue-ledger lane)
const FROZEN_PHYSICS_RE = new RegExp(TAG +
  'water: frozen physics \\((\\d+) flat passes at y=(-?\\d+\\.\\d), o2=' + O2 +
  '(?:, head WET)?(?: - the wet-critical fast window)?\\) - standing down, the reconnect lane owns this$')

// the relog: both eras in one grammar - the #S prefix, the why split
// (head-wet saver vs legacy consecutive threshold), the gate tail
// (hold secs + o2 + health + window + the optional bypass echo) all
// optional exactly as the two tree eras print them
const FROZEN_RELOG_RE = new RegExp(TAG +
  'water: frozen client relog (?:\\(#(\\d+) consecutive\\) )?\\(' +
  '(?:frozen while head-wet \\((\\d+) verdicts?\\) - the drowning clock owns this client|(\\d+) consecutive frozen verdicts)' +
  '\\) - ending the session, the reconnect lane rebuilds the physics' +
  '(?:; the drowning sentry holds non-critical pages (\\d+)s \\(the frozen-return gate\\) - o2=' + O2 +
  ' health=(\\d+(?:\\.\\d+)?|\\?) window=(legacy|wet-critical fast|\\?)' +
  '(?: - o2=' + O2 + ' - the (critical|wet-cycler) bypass voids the armed hold on the next page \\([^)]*\\))?)?$')

// the refusal: the v0.361.0 loop break (the grace's own line)
const FROZEN_LOOP_BREAK_RE = new RegExp(TAG +
  'water: frozen-relog loop break \\(#(\\d+) consecutive\\) \\(' +
  '(?:critical lungs on a proven column \\(o2=' + O2 + ', (\\d+) relogs? deep\\) - the reconnect spends the air the rescue still owns, the session rides the freeze' +
  '|wet-relog loop proven \\((\\d+) consecutive\\) - the relog lane feeds it, the transient stall rides the grace, the legacy threshold owns the next relog)' +
  '\\) - the session rides the freeze, the sentry re-pages and the rescue re-verdicts$')

// the diagnosis: the v0.340.0 freeze self-naming (throttled, sparse)
const FREEZE_NAMED_RE = new RegExp(TAG + 'water: freeze named ([a-z][a-z-]*) - (.+)$')

// the gate hold: the page the hold actually held
const GATE_HOLD_RE = new RegExp(TAG +
  'water: frozen-return gate holds the page \\((\\d+)s left\\) - the fresh client walks the hazard-ledgered column out$')

// the exemption: the v0.381.0 apex rest (the verdict NOT condemning)
const APEX_REST_RE = new RegExp(TAG +
  'water: apex rest held \\((\\d+) flat passes at y=(-?\\d+\\.\\d), o2=' + O2 +
  ', head dry - the lungs own the clock, the release window owns the rest\\)$')

// the churn: the relog lane's own collision (the kicked-lane emitter, the
// serverguard TIMEOUT_KICK_RE's sibling for the duplicate-login verdict)
const DUP_KICK_RE = /^(F\d+) \[\1\] KICKED: .*disconnect\.duplicate_login/

/**
 * Parse one frozen physics verdict line, or null.
 * @param {string} [line]
 * @returns {null|{bot: string, passes: number, y: number, o2: string, wet: boolean, fastWindow: boolean}}
 */
export function parseFrozenPhysics (line) {
  if (typeof line !== 'string') return null
  const m = line.match(FROZEN_PHYSICS_RE)
  if (!m) return null
  return {
    bot: m[1],
    passes: Number(m[2]),
    y: Number(m[3]),
    o2: m[4],
    wet: /\bhead WET\b/.test(line),
    fastWindow: /wet-critical fast window/.test(line)
  }
}

/**
 * Parse one frozen client relog line (both tree eras), or null.
 * whyClass: 'head-wet' (the v0.96.0 saver) | 'legacy' (the threshold).
 * @param {string} [line]
 * @returns {null|{bot: string, streak: number|null, whyClass: string, verdicts: number|null, holdSec: number|null, o2: string|null, health: string|null, window: string|null, bypass: null|'critical'|'wet-cycler', era: 'current'|'legacy'}}
 */
export function parseFrozenRelog (line) {
  if (typeof line !== 'string') return null
  const m = line.match(FROZEN_RELOG_RE)
  if (!m) return null
  const current = m[5] !== undefined // the gate tail exists only on the current tree
  return {
    bot: m[1],
    streak: m[2] !== undefined ? Number(m[2]) : null,
    whyClass: m[3] !== undefined ? 'head-wet' : 'legacy',
    verdicts: m[3] !== undefined ? Number(m[3]) : (m[4] !== undefined ? Number(m[4]) : null),
    holdSec: current ? Number(m[5]) : null,
    o2: current ? m[6] : null,
    health: current ? m[7] : null,
    window: current ? m[8] : null,
    bypass: m[10] != null ? m[10] : null,
    era: current ? 'current' : 'legacy'
  }
}

/**
 * Parse one frozen-relog loop break line (the refusal), or null.
 * whyClass: 'critical-lungs' (the v0.372.0 veto) | 'loop-cap' (the v0.361.0 cap).
 * @param {string} [line]
 * @returns {null|{bot: string, streak: number, whyClass: string, o2: string|null, relogsDeep: number|null}}
 */
export function parseFrozenLoopBreak (line) {
  if (typeof line !== 'string') return null
  const m = line.match(FROZEN_LOOP_BREAK_RE)
  if (!m) return null
  return {
    bot: m[1],
    streak: Number(m[2]),
    whyClass: m[4] !== undefined ? 'critical-lungs' : 'loop-cap',
    o2: m[3] !== undefined ? m[3] : null,
    relogsDeep: m[4] !== undefined ? Number(m[4]) : null
  }
}

/**
 * Parse one freeze named line (the v0.340.0 self-diagnosis), or null.
 * @param {string} [line]
 * @returns {null|{bot: string, cls: string, why: string}}
 */
export function parseFreezeNamed (line) {
  if (typeof line !== 'string') return null
  const m = line.match(FREEZE_NAMED_RE)
  if (!m) return null
  return { bot: m[1], cls: m[2], why: m[3] }
}

/**
 * Parse one frozen-return gate hold line, or null.
 * @param {string} [line]
 * @returns {null|{bot: string, secsLeft: number}}
 */
export function parseGateHold (line) {
  if (typeof line !== 'string') return null
  const m = line.match(GATE_HOLD_RE)
  if (!m) return null
  return { bot: m[1], secsLeft: Number(m[2]) }
}

/**
 * Parse one apex rest line (the v0.381.0 exemption), or null.
 * @param {string} [line]
 * @returns {null|{bot: string, passes: number, y: number, o2: string}}
 */
export function parseApexRest (line) {
  if (typeof line !== 'string') return null
  const m = line.match(APEX_REST_RE)
  if (!m) return null
  return { bot: m[1], passes: Number(m[2]), y: Number(m[3]), o2: m[4] }
}

/**
 * Parse one duplicate-login kick line, or null (the timeout kick and every
 * other verdict stay the serverguard lane's).
 * @param {string} [line]
 * @returns {null|{bot: string}}
 */
export function parseDuplicateKick (line) {
  if (typeof line !== 'string') return null
  const m = line.match(DUP_KICK_RE)
  if (!m) return null
  return { bot: m[1] }
}

// the o2 domain read shared by the arc rows: a 'reset(-1)'/'?' label or a
// legacy raw negative is evidence, never a value - the maths read >= 0 only
function o2Value (label) {
  if (label === 'reset(-1)' || label === '?') return null
  const n = Number(label)
  return Number.isFinite(n) && n >= 0 ? n : null
}

/**
 * The frozen census over a whole face log (pure; the decompose field read).
 * Accepts an array of lines or a raw text blob (split on newline). Reads
 * the freeze family the other lenses leave alone; the rescue END line
 * ('rescue standing down (frozen physics ...') stays the rescue ledger's.
 * @param {string[]|string} [lines] the face log
 * @returns {object} the census
 */
export function frozenCensus (lines) {
  const rows = Array.isArray(lines)
    ? lines
    : (typeof lines === 'string' ? lines.split('\n') : [])
  const verdicts = { n: 0, byBot: {}, wet: 0, dry: 0, fastWindow: 0, yMin: null, yMax: null }
  const vO2 = { n: 0, sum: 0, min: null, reset: 0, unknown: 0 }
  const relogs = { n: 0, byBot: {}, why: { headWet: 0, legacy: 0 }, streakMax: null, era: { current: 0, legacy: 0 }, window: { legacy: 0, fast: 0, unknown: 0 } }
  const holds = { n: 0, min: null, max: null, sum: 0 }
  const bypass = { critical: 0, wetCycler: 0 }
  const loopBreaks = { n: 0, why: { criticalLungs: 0, loopCap: 0 } }
  const freezeNamed = { n: 0, byCls: {} }
  const gateHolds = { n: 0 }
  const apexRests = { n: 0, byBot: {} }
  const dupKicks = { n: 0, byBot: {} }
  let unparsed = 0
  for (const l of rows) {
    const vp = parseFrozenPhysics(l)
    if (vp) {
      verdicts.n++
      verdicts.byBot[vp.bot] = (verdicts.byBot[vp.bot] || 0) + 1
      if (vp.wet) verdicts.wet++; else verdicts.dry++
      if (vp.fastWindow) verdicts.fastWindow++
      if (verdicts.yMin === null || vp.y < verdicts.yMin) verdicts.yMin = vp.y
      if (verdicts.yMax === null || vp.y > verdicts.yMax) verdicts.yMax = vp.y
      const ov = o2Value(vp.o2)
      if (ov !== null) { vO2.n++; vO2.sum += ov; if (vO2.min === null || ov < vO2.min) vO2.min = ov }
      else if (vp.o2 === 'reset(-1)') vO2.reset++
      else vO2.unknown++
      continue
    }
    const rp = parseFrozenRelog(l)
    if (rp) {
      relogs.n++
      relogs.byBot[rp.bot] = (relogs.byBot[rp.bot] || 0) + 1
      relogs.why[rp.whyClass === 'head-wet' ? 'headWet' : 'legacy']++
      relogs.era[rp.era]++
      if (rp.streak !== null && (relogs.streakMax === null || rp.streak > relogs.streakMax)) relogs.streakMax = rp.streak
      if (rp.era === 'current') {
        if (rp.window === 'legacy') relogs.window.legacy++
        else if (rp.window === 'wet-critical fast') relogs.window.fast++
        else relogs.window.unknown++
        if (rp.holdSec !== null) {
          holds.n++
          holds.sum += rp.holdSec
          if (holds.min === null || rp.holdSec < holds.min) holds.min = rp.holdSec
          if (holds.max === null || rp.holdSec > holds.max) holds.max = rp.holdSec
        }
        if (rp.bypass === 'critical') bypass.critical++
        else if (rp.bypass === 'wet-cycler') bypass.wetCycler++
      }
      continue
    }
    const lb = parseFrozenLoopBreak(l)
    if (lb) {
      loopBreaks.n++
      loopBreaks.why[lb.whyClass === 'critical-lungs' ? 'criticalLungs' : 'loopCap']++
      continue
    }
    const fn = parseFreezeNamed(l)
    if (fn) {
      freezeNamed.n++
      freezeNamed.byCls[fn.cls] = (freezeNamed.byCls[fn.cls] || 0) + 1
      continue
    }
    if (parseGateHold(l)) { gateHolds.n++; continue }
    const ap = parseApexRest(l)
    if (ap) {
      apexRests.n++
      apexRests.byBot[ap.bot] = (apexRests.byBot[ap.bot] || 0) + 1
      continue
    }
    const dk = parseDuplicateKick(l)
    if (dk) {
      dupKicks.n++
      dupKicks.byBot[dk.bot] = (dupKicks.byBot[dk.bot] || 0) + 1
      continue
    }
    // the escape hatch: a freeze-lane-shaped line every parser refused
    if (/^F\d+ \[F\d+\] water: (frozen|freeze named|apex rest)/.test(l)) unparsed++
  }
  const vAvg = vO2.n > 0 ? vO2.sum / vO2.n : null
  return {
    verdicts: { ...verdicts, o2: { ...vO2, avg: vAvg } },
    relogs: { ...relogs, holds, bypass },
    loopBreaks,
    freezeNamed,
    gateHolds: gateHolds.n,
    apexRests,
    dupKicks,
    unparsed
  }
}
