// (v0.408.0) THE MEM-HB LENS - the OOM precursors, mechanical. FACE 25
// attempt 1 (36857777922, the v0.406.0 tree) died the run53 OOM class at
// launch: the main thread froze 55s while allocating, the stormguard's
// SIGTERM kept the story readable (exit 143). The 1938 fire priced the
// trigger BY HAND off the dying log's own mem gauges: pathfinder queue
// pressure (path=6a/10q) with chunk evictions climbing 216 -> 788 across
// ~2 minutes (cols ~2000, ents ~2000-2400). THE LENS makes that read
// mechanical for every face: the fleet's own mem heartbeat
// (testbed/fleet19.mjs's gauge line, ~60 reads per face) carries the
// precursors as fields - rss/heap ceilings, cols/ents population, the
// evicted partial sum (the guards' live eviction debt - its honest reads
// are MAX, PEAK JUMP and RESETS, see the semantics note below), the
// pathfinder active/queue pair, the stale count. One failure does not convict the
// re-price - but the NEXT face must not need a hand grep to answer
// 'did the eviction velocity spike?'. The distress companions ride the
// same census: the tools.mjs storm cooldown ('craft <item>: storm
// cooldown Nms left (N consecutive timeouts) - refusing') and the
// stormguard's two euthanasia forms (heartbeat.mjs's locked-while-
// allocating and allocating-itself-to-death, both exit-143 named).
// Mining-surface only: zero fleet wiring, zero new log lines - the
// v0.379.0/v0.403.0 precedent.

// THE FIELD'S OWN SEMANTICS (discovered by the lens's first live read, the
// honest-correction ride): emitter fleet19.mjs sums s.evicted over the LIVE
// pathfinder guards - and guards are RECREATED at respawn/relog, so the
// fleet-wide number is a PARTIAL SUM that drifts DOWN when a guard is
// replaced, not a monotonic run counter (face 24 read '237 -> 0' with 10
// resets - one per death's guard refresh). The honest precursors are
// therefore: MAX (the deepest live eviction debt any gauge saw), PEAK JUMP
// (the sharpest climb between gauges - the velocity spike), and RESETS
// (guard-replacement drops; face 24's ten ride its ten deaths).
export const MEM_HB_RE = /^ *mem: heap=(\d+)M\/(\d+)M old=(\d+)M ext=(\d+)M ab=(\d+)M rss=(\d+)M cols=(\d+) ents=(\d+) evicted=(\d+) path=(\d+)a\/(\d+)q \(max (\d+)\) stale=(\d+)$/

// The tools.mjs storm cooldown (the craft storm's own refusal, the
// emitter's verbatim shape): 'F12 [F12] craft wooden_pickaxe: storm
// cooldown 45000ms left (3 consecutive timeouts) - refusing'
// (v0.478.0) THE THREE SKINS, ONE EMITTER: the refusal line is printed by
// tools.mjs craft() through the CALLER's own log function - three skins on
// live data (face 43, run 36970605824):
//   'F13 [F13] craft oak_planks: ...'            (the fleet-tagged caller)
//   'F13 [toolupgrade] [upgrade] craft stone_pickaxe: ...' (the upgrade lane)
//   'F13 craft stone_pickaxe: ...'               (the plain craft callers)
// The old RE owned only the tagged skin - face 43 read 1 of its 5 refusals
// (THE UNDERCOUNT: the mem census's stormCooldowns row was honest for the
// tagged skin only). The tail anchors the shape (the 'storm cooldown Nms
// left (N consecutive timeouts) - refusing' tail is unique to this one
// emitter); the middle tags are the caller's log skin, so the RE accepts
// zero-or-more bracket tags and the parser names the skin per read.
export const STORM_COOLDOWN_RE = /^F\d+(?: \[[^\]]+\])* craft ([a-z_][a-z0-9_]*): storm cooldown (\d+)ms left \((\d+) consecutive timeouts\) - refusing$/

// The stormguard's two euthanasia forms (heartbeat.mjs, both exit-143):
//   '[stormguard] the MAIN thread is locked while allocating (run53/... OOM
//     class; mainLate read 2731ms but the pulse has been frozen 55s - the
//     reading was stale) - every closure applier lives on the locked main;
//     emergency SIGTERM keeps the story readable (exit 143)'
//   '[stormguard] the MAIN thread is allocating itself to death while frozen
//     (run53/... OOM class: unsymbolized exit 134, mainLate was 2731ms) -
//     emergency SIGTERM keeps the story readable (exit 143)'
export const OOM_LOCK_RE = /^\[stormguard\] the MAIN thread is (locked while allocating|allocating itself to death while frozen) \(run53\/\d+ OOM class/

// (v0.677.0) THE FREEZE-STORM FATAL - the storm the gauge cadence misses
// lives BETWEEN the gauges. The 20th flight (37409860732) read FLAT gauges
// (~382M across 8 samples, the census's honest rssMax 383M) and died
// between them: the FATAL's own words carry the numbers the gauges never
// sampled - 'rss 385M -> 1212M growing past the 1200M floor'. The census
// prices that gap from the FATAL's own read, never invented:
//   '[stormguard] FATAL (freeze storm: main pulse frozen 5s, rss 385M ->
//     1212M growing past the 1200M floor - the closure cannot land; run
//     36292057377 spent the probe at 2271M ... ; last: pf:... <- pf:...)'
export const FREEZE_STORM_RE = /^\[stormguard\] FATAL \(freeze storm: main pulse frozen (\d+)s, rss (\d+)M -> (\d+)M growing past the (\d+)M floor/

// (v0.677.0) THE RSS JUMP storm threshold - a climb of >= 100M between
// consecutive gauges (~15s apart on the emitter's clock) is the storm
// class; the run53-class deaths ride +827M in ONE gap (the FATAL's own
// read). A calm face's gauge-to-gauge climbs live in the single digits.
export const RSS_JUMP_STORM_M = 100

// (v0.678.0) THE ENTITY CLIMB storm threshold - the memory storm's
// candidate DRIVER read beside the rss jump. The 20th flight's ents
// climbed 2023 -> 2691 (+30%) across its gauges while rss stayed flat -
// the mob storm's entities preceded the memory storm the FATAL named.
// A climb of >= 50 ents between consecutive gauges is the driver class;
// a calm face's spawn/despawn churn lives in the single digits.
export const ENT_JUMP_STORM_N = 50

/**
 * Parse one mem-gauge line into its precursor read, or null.
 * Junk-safe: non-string input and every non-gauge shape judge NOTHING.
 * @param {string} [line] one fleet-log line
 * @returns {null|{heapUsed: number, heapLimit: number, old: number, ext: number, ab: number, rss: number, cols: number, ents: number, evicted: number, pathActive: number, pathQueue: number, pathMax: number, stale: number}}
 */
export function parseMemLine (line) {
  if (typeof line !== 'string') return null
  const m = line.match(MEM_HB_RE)
  if (!m) return null
  const n = (i) => Number(m[i])
  return {
    heapUsed: n(1), heapLimit: n(2), old: n(3), ext: n(4), ab: n(5),
    rss: n(6), cols: n(7), ents: n(8), evicted: n(9),
    pathActive: n(10), pathQueue: n(11), pathMax: n(12), stale: n(13)
  }
}

/**
 * Parse one storm-cooldown refusal into its read, or null.
 * Junk-safe: non-string input and every non-craft storm shape judge
 * NOTHING (the anchor is the emitter's own 'craft <item>:' prefix).
 * (v0.478.0) The bot token is the line's FIRST token (the three-skin law:
 * the plain and upgrade skins carry no [F#] self-tag after the bot - the
 * old extraction saw only the tagged skin); the skin names which caller's
 * log the refusal rode ('tagged' / 'upgrade' / 'plain' / 'other').
 * @param {string} [line] one fleet-log line
 * @returns {null|{bot: string, item: string, waitMs: number, consecutive: number, skin: string}}
 */
export function parseStormCooldown (line) {
  if (typeof line !== 'string') return null
  const botM = line.match(/^F\d+/)
  const m = line.match(STORM_COOLDOWN_RE)
  if (!m || !botM) return null
  let skin = 'other'
  if (/^F\d+ \[F\d+\] craft/.test(line)) skin = 'tagged'
  else if (/^F\d+ \[toolupgrade\] \[upgrade\] craft/.test(line)) skin = 'upgrade'
  else if (/^F\d+ craft/.test(line)) skin = 'plain'
  return { bot: botM[0], item: m[1], waitMs: Number(m[2]), consecutive: Number(m[3]), skin }
}

/**
 * The mem-heartbeat census over a whole face log (pure; the decompose
 * field read). Accepts an array of lines or a raw text blob (split on
 * newline).
 * @param {string[]|string} [lines] the face log
 * @returns {{reads: number, rssMax: number|null, heapUsedMax: number|null, heapLimitLast: number|null, colsMax: number|null, entsMax: number|null, staleMax: number|null, evicted: {max: number|null, first: number|null, last: number|null, peakJump: number, resets: number}, path: {peakActive: number, peakQueue: number, pathMax: number|null}, stormCooldowns: number, stormByBot: Object<string,{count: number, maxConsecutive: number}>, oomLocks: number, rssJump: {max: number, storms: number, marginM: number|null}, entJump: {max: number, storms: number}, freezeStorm: {frozenS: number, from: number, to: number, floor: number}|null}}
 */
export function memHbCensus (lines) {
  const rows = Array.isArray(lines)
    ? lines
    : (typeof lines === 'string' ? lines.split('\n') : [])
  let reads = 0
  let rssMax = null
  let heapUsedMax = null
  let heapLimitLast = null
  let colsMax = null
  let entsMax = null
  let staleMax = null
  let evMax = null
  let evFirst = null
  let evLast = null
  let peakJump = 0
  let resets = 0
  let peakActive = 0
  let peakQueue = 0
  let pathMax = null
  const stormByBot = {}
  let stormCooldowns = 0
  let oomLocks = 0
  // (v0.677.0) THE RSS JUMP - the gauge-to-gauge climb read (the storm
  // between the gauges, as far as the gauges themselves saw it) + the
  // freeze-storm FATAL's own numbers (the gap the cadence missed).
  let rssPrev = null
  let rssJumpMax = 0
  let rssStorms = 0
  // (v0.678.0) THE ENTITY CLIMB - the same gauge-to-gauge read over ents:
  // the population climb is the memory storm's candidate driver, priced
  // even when the rss gauges stay flat (the 20th flight's shape).
  let entsPrev = null
  let entJumpMax = 0
  let entStorms = 0
  let freezeStorm = null
  for (const l of rows) {
    const p = parseMemLine(l)
    if (p) {
      reads++
      if (rssMax === null || p.rss > rssMax) rssMax = p.rss
      // (v0.677.0) the sharpest climb between consecutive gauges; a
      // NEGATIVE delta is a GC drop - counted, never folded into any climb
      if (rssPrev !== null) {
        const rj = p.rss - rssPrev
        if (rj > rssJumpMax) rssJumpMax = rj
        if (rj >= RSS_JUMP_STORM_M) rssStorms++
      }
      rssPrev = p.rss
      // (v0.678.0) the sharpest ents climb between consecutive gauges; a
      // NEGATIVE delta is despawn churn - counted, never folded into any
      // climb (the rss jump's own GC-drop law, mirrored)
      if (entsPrev !== null) {
        const ej = p.ents - entsPrev
        if (ej > entJumpMax) entJumpMax = ej
        if (ej >= ENT_JUMP_STORM_N) entStorms++
      }
      entsPrev = p.ents
      if (heapUsedMax === null || p.heapUsed > heapUsedMax) heapUsedMax = p.heapUsed
      heapLimitLast = p.heapLimit
      if (colsMax === null || p.cols > colsMax) colsMax = p.cols
      if (entsMax === null || p.ents > entsMax) entsMax = p.ents
      if (staleMax === null || p.stale > staleMax) staleMax = p.stale
      if (evFirst === null) evFirst = p.evicted
      // the partial-sum's honest reads: MAX = the deepest live eviction
      // debt; the sharpest per-gauge climb prices the velocity spike (the
      // mem cadence rides the fleet's own gauge heartbeat, 15s per the
      // emitter's setInterval); a NEGATIVE jump is a guard replacement -
      // counted, never folded into any climb
      if (evMax === null || p.evicted > evMax) evMax = p.evicted
      if (evLast !== null) {
        const diff = p.evicted - evLast
        if (diff < 0) resets++
        else if (diff > peakJump) peakJump = diff
      }
      evLast = p.evicted
      if (p.pathActive > peakActive) peakActive = p.pathActive
      if (p.pathQueue > peakQueue) peakQueue = p.pathQueue
      pathMax = p.pathMax
      continue
    }
    const s = parseStormCooldown(l)
    if (s) {
      stormCooldowns++
      const b = (stormByBot[s.bot] = stormByBot[s.bot] || { count: 0, maxConsecutive: 0 })
      b.count++
      if (s.consecutive > b.maxConsecutive) b.maxConsecutive = s.consecutive
      continue
    }
    if (typeof l === 'string' && OOM_LOCK_RE.test(l)) oomLocks++
    // (v0.677.0) the freeze-storm FATAL - the process dies with it, so the
    // FIRST read is the read (a face carries at most one)
    const fsm = typeof l === 'string' ? l.match(FREEZE_STORM_RE) : null
    if (fsm && freezeStorm === null) {
      freezeStorm = { frozenS: Number(fsm[1]), from: Number(fsm[2]), to: Number(fsm[3]), floor: Number(fsm[4]) }
    }
  }
  // (v0.683.0) THE STORM MARGIN - the near-miss read: how much headroom the
  // face's sharpest climb left below the storm line. The 24th flight
  // (37421661533) read max +80M against the 100M line - the margin was 20M
  // while the 20th flight's killer storm lived ENTIRELY between gauges the
  // cadence never sampled. A thin margin is not safety: it is the size of
  // the blind spot the next blow-up may spend. The margin prices the
  // near-miss class only (a storm face is convicted by the STORM count; a
  // climbless face has no margin story) - honest silence otherwise.
  const rssMarginM = rssJumpMax > 0 && rssStorms === 0 ? RSS_JUMP_STORM_M - rssJumpMax : null
  return {
    reads,
    rssMax,
    heapUsedMax,
    heapLimitLast,
    colsMax,
    entsMax,
    staleMax,
    evicted: {
      max: evMax,
      first: evFirst,
      last: evLast,
      peakJump,
      resets
    },
    path: { peakActive, peakQueue, pathMax },
    stormCooldowns,
    stormByBot,
    oomLocks,
    rssJump: { max: rssJumpMax, storms: rssStorms, marginM: rssMarginM },
    entJump: { max: entJumpMax, storms: entStorms },
    freezeStorm
  }
}
