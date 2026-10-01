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
export const STORM_COOLDOWN_RE = /^F\d+ \[F\d+\] craft ([a-z_][a-z0-9_]*): storm cooldown (\d+)ms left \((\d+) consecutive timeouts\) - refusing$/

// The stormguard's two euthanasia forms (heartbeat.mjs, both exit-143):
//   '[stormguard] the MAIN thread is locked while allocating (run53/... OOM
//     class; mainLate read 2731ms but the pulse has been frozen 55s - the
//     reading was stale) - every closure applier lives on the locked main;
//     emergency SIGTERM keeps the story readable (exit 143)'
//   '[stormguard] the MAIN thread is allocating itself to death while frozen
//     (run53/... OOM class: unsymbolized exit 134, mainLate was 2731ms) -
//     emergency SIGTERM keeps the story readable (exit 143)'
export const OOM_LOCK_RE = /^\[stormguard\] the MAIN thread is (locked while allocating|allocating itself to death while frozen) \(run53\/\d+ OOM class/

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
 * @param {string} [line] one fleet-log line
 * @returns {null|{bot: string, item: string, waitMs: number, consecutive: number}}
 */
export function parseStormCooldown (line) {
  if (typeof line !== 'string') return null
  const botM = line.match(/^F\d+ \[F\d+\]/)
  const m = line.match(STORM_COOLDOWN_RE)
  if (!m || !botM) return null
  return { bot: botM[0].slice(0, botM[0].indexOf(' ')), item: m[1], waitMs: Number(m[2]), consecutive: Number(m[3]) }
}

/**
 * The mem-heartbeat census over a whole face log (pure; the decompose
 * field read). Accepts an array of lines or a raw text blob (split on
 * newline).
 * @param {string[]|string} [lines] the face log
 * @returns {{reads: number, rssMax: number|null, heapUsedMax: number|null, heapLimitLast: number|null, colsMax: number|null, entsMax: number|null, staleMax: number|null, evicted: {max: number|null, first: number|null, last: number|null, peakJump: number, resets: number}, path: {peakActive: number, peakQueue: number, pathMax: number|null}, stormCooldowns: number, stormByBot: Object<string,{count: number, maxConsecutive: number}>, oomLocks: number}}
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
  for (const l of rows) {
    const p = parseMemLine(l)
    if (p) {
      reads++
      if (rssMax === null || p.rss > rssMax) rssMax = p.rss
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
  }
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
    oomLocks
  }
}
