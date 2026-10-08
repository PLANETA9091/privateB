//
// stormstory.mjs - THE FREEZE STORM'S OWN STORY (v0.818.0)
//
// The freeze-storm FATAL byte (the heartbeat's own emitter, the
// stormguard's freezeStormVerdict leg) killed face 96 (37736268597,
// the v0.816.0 tree) mid-window: the main pulse froze 5s, rss 840M ->
// 1902M growing past the 1200M floor, and the run died at exit 143 with
// the story riding unnamed. The line's OWN tail carries the blackbox
// ring's last frames (the sgStory(8) tail - the emitter's own words):
//
//   '[stormguard] FATAL (freeze storm: main pulse frozen 5s, rss 840M ->
//    1902M growing past the 1200M floor - the closure cannot land; run
//    36292057377 spent the probe at 2271M and the ceiling SIGTERM lost
//    the race to the V8 OOM at exit 134; last: pf:spin walk @+0.0s <-
//    pf:spin walk @+-0.3s <- other @+-0.3s <- ... <- pf:spin walk @+-0.9s)'
//
// The story's frames are TWO ARMS and they price OPPOSITE cures:
//
//   'pf:spin walk' -> THE SPIN ARM: the pathfinder's own loop owned the
//                     locked main's last frames - the walk's own spin
//                     prices the breaker front
//   anything else  -> the label's own arm: the frozen main's final
//                     activity rode THIS label - the label's own front
//                     prices its cure
//
// The census's own cells only, zero re-parsing (the v0.802.0 orphan
// seat's own law, the v0.815.0 chest seat's own shape): the book is the
// story's own frame tally, pooled across the face's freeze-storm FATAL
// lines (the FATAL kills the run - a face carries one; the pool is the
// honest sum if a pathological log carries more). The strict-majority
// law: a label owns only when it holds MORE than the rest of the book
// together (topUnits * 2 > total - the v0.814.0 famine seat's own law);
// no solo majority reads the honest mix row. The byte order holds the
// ranked tie. The story-less FATAL (the ring froze before the story
// could ride - the bbRead-empty shape) reads the honest silence. Junk
// never invents a frame: a non-string line is skipped, a frame part
// without the emitter's own ' @+' separator is skipped, an empty label
// is skipped. The RSS JUMP line (the forming-storm warning) carries a
// story too but is NOT this class - the fence is the FATAL byte itself.
//

// the class's own fence - the freeze-storm FATAL byte exactly (the
// frozen-burst FATAL is a different disease, the RSS JUMP a different
// leg; neither rides this book)
const FATAL_RE = /\[stormguard\] FATAL \(freeze storm: /

// the story's own tail - everything after '; last: ' up to the line's
// own closing paren (the sgStory(8) emitter's own frame chain)
const STORY_RE = /; last: (.*)\)\s*$/

// one frame - the label up to the emitter's own ' @+' offset separator
const FRAME_RE = /^(.*?) @\+/

/**
 * stormStoryCensus(lines) - the freeze storm's own story census.
 * @param {string[]|string|null} lines the fleet log's own lines
 * @returns {null|{n: number, frames: Object<string, number>}} the census
 *   (null on a non-array non-string source; frames is a null-prototype
 *   tally - the open vocabulary's own keys)
 */
export function stormStoryCensus (lines) {
  const src = Array.isArray(lines)
    ? lines
    : (typeof lines === 'string' ? lines.split('\n') : null)
  if (!src) return null
  let n = 0
  const frames = Object.create(null)
  for (const line of src) {
    if (typeof line !== 'string') continue
    if (!FATAL_RE.test(line)) continue
    n++
    const m = line.match(STORY_RE)
    if (!m) continue
    for (const part of m[1].split(' <- ')) {
      const f = part.match(FRAME_RE)
      if (!f) continue
      const label = f[1]
      if (typeof label !== 'string' || label === '') continue
      frames[label] = (frames[label] || 0) + 1
    }
  }
  return { n, frames }
}

// the story's own cells - the census's own open-vocabulary tally, the
// non-finite or negative cell skipped and counted (the junk never
// prices), the byte order holds the ranked tie
function storyCells (frames) {
  if (!frames || typeof frames !== 'object' || Array.isArray(frames)) return null
  const cells = []
  let bad = 0
  for (const [label, count] of Object.entries(frames)) {
    if (!Number.isFinite(count) || count < 0) { bad++; continue }
    if (count === 0) continue
    cells.push([label, count])
  }
  if (!cells.length) return null
  cells.sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
  const total = cells.reduce((s, [, v]) => s + v, 0)
  if (!(total > 0)) return null
  return { cells, total, bad }
}

/**
 * stormStorySeat(frames) - the story's own seat.
 * @param {Object<string, number>|null} [frames] the census's own tally
 * @returns {null|{total: number, owner: null|string, units: number,
 *   share: number, bad: number}} the seat (null on an empty book; the
 *   owner null on the no-majority mix)
 */
export function stormStorySeat (frames) {
  const t = storyCells(frames)
  if (!t) return null
  const [topLabel, topUnits] = t.cells[0]
  // the strict-majority law: the top must hold more than the rest together
  const owns = topUnits * 2 > t.total
  const owner = owns ? topLabel : null
  const units = owns ? topUnits : 0
  return { total: t.total, owner, units, share: +(units / t.total).toFixed(3), bad: t.bad }
}

// The seat row - the byte-exact read the decompose prints beside the
// freeze-storm count (the prose lives only in the lib). The owner row
// names the label and its own front; the mix row names the honest crowd.
// Guarded end to end; junk reads null (v0.818.0).
export function stormStorySeatRow (seat) {
  if (!seat || typeof seat !== 'object') return null
  const { total, owner, units, share } = seat
  if (!Number.isFinite(total) || total <= 0) return null
  if (!Number.isFinite(share)) return null
  // the mix row rides the seat's own mix shape only (owner === null) - a
  // pathological owner reads the honest null, never the mix's own word
  if (owner === null) return 'the freeze storm\'s own story (v0.818.0): no solo label owns the story book (the mix owns nothing)'
  if (typeof owner !== 'string' || owner === '') return null
  if (!Number.isFinite(units) || units <= 0 || units > total) return null
  return `the freeze storm's own story (v0.818.0): ${owner} owns ${units} of ${total} story frame(s) (${(share * 100).toFixed(1)}%) - THE FROZEN MAIN'S OWN LAST WORD: the locked pulse's final frames rode this label (the label's own front prices the freeze)`
}
