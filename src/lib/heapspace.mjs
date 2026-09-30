// (v0.354.0) THE BLIND OLD-SPACE CURE - the mem line's old= has printed -1M
// on EVERY row of EVERY face since v0.55.0. The reader asked for the keys
// `name` and `size_used`, but the documented schema of
// v8.getHeapSpaceStatistics() (every Node this repo has run on - 22 and 24
// verified) is `space_name` and `space_used_size` - the find never matched,
// the -1 sentinel rode every row, and the OOM diagnosis's KEY pool
// (old_space = retained JS objects, the v0.55.0 comment's own law: "the
// old/ext/ab split says WHICH pool") stayed invisible for the whole
// campaign. The GC Pinned hunt's eyes come back here.
//
// The reader accepts BOTH schemas - the documented keys first, the legacy
// keys as a fallback (a future V8 rename degrades to the sentinel, never
// to a lie) - and keeps the -1 sentinel for a space that is genuinely
// absent (the honest unknown; the line format is stable).

/**
 * Read a heap space's used MB from v8.getHeapSpaceStatistics() output.
 * Pure, junk-safe: a junk array, a junk name or a junk element reads the
 * -1 sentinel (the honest unknown - the instrument must not invent data).
 * @param {Array<object>|null} [hs] the getHeapSpaceStatistics() array
 * @param {string|null} [wanted] the space's name (e.g. 'old_space')
 * @returns {number} used MB (rounded), or -1 when the space is absent
 */
export function heapSpaceUsedMb (hs, wanted) {
  if (!Array.isArray(hs) || typeof wanted !== 'string' || !wanted) return -1
  const s = hs.find(x => x && (x.space_name === wanted || x.name === wanted))
  if (!s) return -1
  const used = s.space_used_size ?? s.size_used // ?? not ||: a 0 reading is a REAL zero, never the sentinel
  return Number.isFinite(used) ? Math.round(used / 1048576) : -1
}
