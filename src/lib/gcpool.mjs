// (v0.421.0) THE GC POOL LENS - the GC Pinned hunt's own eyes. The hunt is
// the standing open front born of run53 (35647216505): the process OOMed
// with mu=0.013 - the V8 OOM's own memory-utilization read said only 1.3%
// of the heap was live JS, so the memory the GC could not account for was
// OUTSIDE the live-JS accounting (the pinned/external class). The v0.354.0
// blind-old-space cure (heapspace.mjs) returned the pool split to the
// fleet's mem gauge and left the hunt its law: "the old/ext/ab split says
// WHICH pool". The split has flowed on every face since - and nobody read
// it: the mem-hb lens (v0.408.0) owns the ceilings/eviction read (rss/heap
// maxima, evicted velocity, path/stale) and the storm census (v0.409.0)
// owns the heartbeat's freeze clock - the POOLS stayed unread. This lens
// is that read, per the split-of-labor law (one read per emitter): the
// same mem gauge lines, a different slice.
//
// The pool semantics (Node's process.memoryUsage() + v8.getHeapSpaceStatistics()
// as the emitter consumes them, testbed/fleet19.mjs's gauge line):
//   old = old_space used (retained JS objects - the leak class)
//   ext = external memory (native, off-heap, GC-tracked refs)
//   ab  = ArrayBuffer backing store (the GC-pinned class proper: chunk
//         bytes, packet buffers - collectible ONLY when every ref drops)
//   rss = the resident total the pools ride in
// The read beside the decompose's freeze clocks: a freeze face with FLAT
// pools points AWAY from GC-pinned; ext/ab velocity AT the freeze names
// the pool. Mining-surface only: zero fleet wiring, zero new log lines
// (the v0.379.0/v0.403.0/v0.408.0 precedent).

// The mem gauge line's own shape (the emitter's verbatim; the pools carry
// the optional -1 sentinel - heapspace.mjs keeps it for a genuinely absent
// space, so the lens must never mistake the honest unknown for a reading).
const GC_POOL_RE = /^ *mem: heap=(-?\d+)M\/(-?\d+)M old=(-?\d+)M ext=(-?\d+)M ab=(-?\d+)M rss=(-?\d+)M cols=\d+ ents=\d+ evicted=\d+ path=\d+a\/\d+q \(max \d+\) stale=\d+$/

/**
 * Parse one mem-gauge line into the POOL read, or null.
 * Junk-safe: non-string input and every non-gauge shape judge NOTHING.
 * A -1 pool field (the honest-unknown sentinel) reads as null, never a
 * number - the census counts it, the maths skip it.
 * @param {string} [line] one fleet-log line
 * @returns {null|{heapUsed: number|null, heapLimit: number|null, old: number|null, ext: number|null, ab: number|null, rss: number|null}}
 */
export function parseGcPoolLine (line) {
  if (typeof line !== 'string') return null
  const m = line.match(GC_POOL_RE)
  if (!m) return null
  const f = (i) => {
    const n = Number(m[i])
    return n >= 0 ? n : null // the -1 sentinel is the honest unknown
  }
  return { heapUsed: f(1), heapLimit: f(2), old: f(3), ext: f(4), ab: f(5), rss: f(6) }
}

/**
 * The GC pool census over a whole face log (pure; the decompose field
 * read). Accepts an array of lines or a raw text blob (split on newline).
 * Reads the pools the other lenses leave alone - the ceilings live in the
 * mem-hb lens, the freeze clock in the storm census.
 * @param {string[]|string} [lines] the face log
 * @returns {{reads: number, unknowns: number, pools: {old: {max: number|null, last: number|null}, ext: {max: number|null, last: number|null}, ab: {max: number|null, last: number|null}}, jump: {old: number, ext: number, ab: number}, pinnedShareMax: number, headroomMin: number|null}}
 */
export function gcPoolCensus (lines) {
  const rows = Array.isArray(lines)
    ? lines
    : (typeof lines === 'string' ? lines.split('\n') : [])
  let reads = 0
  let unknowns = 0
  const pools = {
    old: { max: null, last: null },
    ext: { max: null, last: null },
    ab: { max: null, last: null }
  }
  const jump = { old: 0, ext: 0, ab: 0 }
  let pinnedShareMax = 0
  let headroomMin = null
  for (const l of rows) {
    const p = parseGcPoolLine(l)
    if (!p) continue
    reads++
    for (const k of ['old', 'ext', 'ab']) {
      const v = p[k]
      if (v === null) { unknowns++; continue }
      const pool = pools[k]
      if (pool.last !== null) {
        const step = v - pool.last
        if (step > jump[k]) jump[k] = step // the sharpest pool climb between gauges
      }
      if (pool.max === null || v > pool.max) pool.max = v
      pool.last = v
    }
    // the pinned share: the external classes' slice of the resident total
    // (a derived per-gauge ratio, not a ceiling read - the rss ceiling
    // itself is the mem-hb lens's)
    if (p.rss !== null && p.rss > 0 && p.ext !== null && p.ab !== null) {
      const share = Math.round((p.ext + p.ab) / p.rss * 100)
      if (share > pinnedShareMax) pinnedShareMax = share
    }
    // the V8 headroom: how close the heap accounting came to its own
    // reserve (heapTotal is the emitter's "limit" field - the reserved
    // total, not the process OOM wall; honest only when both read)
    if (p.heapUsed !== null && p.heapLimit !== null) {
      const room = p.heapLimit - p.heapUsed
      if (headroomMin === null || room < headroomMin) headroomMin = room
    }
  }
  return { reads, unknowns, pools, jump, pinnedShareMax, headroomMin }
}
