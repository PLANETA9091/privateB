//
// climbcost.mjs - THE CLIMB'S PRICE (v0.694.0)
//
// The flat walk's anatomy - the OPEN FRONTS' own next step (the fire-1800
// hand-off: 'the flat walk's anatomy, the 45s gather window's own read').
// The walk's cost (v0.693.0) priced the trip's segment in FACE LINES (the
// flats burned 485..518, the cure 697) - but lines are a proxy: the walk's
// own machinery announces its REAL price in one byte shape, the climb-out
// OK line that rides INSIDE the famine→gathered window (the 29th: every
// trip has exactly one, 1:1 with the walk):
//
//   'F19 climb out (wood trip): OK +11 levels (11 steps, 32 dug, 25s)'
//
// +levels / steps / dug / SECONDS - the walk's rent in the world's own
// units, not the log's. The lens pairs each famine (the trip opens) with
// its gathered close (the trip shuts), keeps the climb line found inside
// the window, and files the cost under the trip's delivery class (the
// walk's delivery law: cured = the pocket grew, flat = it didn't move,
// negative = the trip ate its own cure). The question the face-29 read
// already begs: the flats took the SHORTER lines-span but did their
// climb cost MORE or LESS? If the climb doesn't split the classes, the
// flat walk's toll is NOT the climb - the seat is elsewhere (the gather
// window's own seconds); if the flats climb longer, the start seat's
// rent is the walk's own first leg.
//
// The honest forks: a trip that closes with the -1 sentinel (the after-
// pocket's unread byte) carries no class - its climb cost goes to the
// unread bucket (the pair exists, the mass doesn't, the v0.690.0 law);
// a trip that closes mass-readable with NO climb OK line inside is
// noClimb (the walk ran by another byte - honest silence, never a fake
// rent); a climb OK line with no pending famine is stray (outside the
// book - counted, never invented into a cost); a famine the face never
// answers is an orphan (the log cut mid-walk, the v0.690.0 law). The
// climb-fail line is the refusal's why lens' own territory (v0.691.0,
// lane isolation) - this lens reads only the OK skin.
//
// One-parser law by import: the famine/gathered regexes ride
// tripcensus.mjs (exported v0.694.0) - zero new trip regexes; the climb
// OK line's own shape is this file's only new byte.
//
// Junk-safe: non-array / non-string-blob reads null (the smeltledger
// convention); zero trips read the honest zero shape. Pure: reads,
// never mutates. Zero fleet wiring (mining-surface only, the
// v0.379/.../v0.693.0 precedent) - the fleet's own trip byte is the
// filter-key, it already rides.
//
import { WOOD_FAMINE_RE, WOOD_GATHERED_RE } from './tripcensus.mjs'

// the climb-out OK line: the walk's real rent (+levels, steps, dug, seconds)
const WOOD_CLIMB_OK_RE = /^([A-Za-z]\d+) climb out \(wood trip\): OK \+(\d+) levels \((\d+) steps, (\d+) dug, (\d+)s\)$/

const medianOf = (xs) => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2
}

const spanOf = (xs) => xs.length
  ? { min: Math.min(...xs), median: medianOf(xs), max: Math.max(...xs) }
  : null

// one metric bucket per delivery class: the four rent numbers
const freshClasses = () => ({
  cured: { levels: [], steps: [], dug: [], seconds: [] },
  flat: { levels: [], steps: [], dug: [], seconds: [] },
  negative: { levels: [], steps: [], dug: [], seconds: [] }
})

const classSpan = (c) => c && c.levels.length
  ? { n: c.levels.length, levels: spanOf(c.levels), steps: spanOf(c.steps), dug: spanOf(c.dug), seconds: spanOf(c.seconds) }
  : null

/**
 * woodClimbCost(lines) - the gather walk's real rent, per delivery class.
 *
 * @param {string[]|string} [lines] the face log (array or raw blob)
 * @returns {null|{trips: number, climbed: number,
 *   byClass: {cured: {n, levels, steps, dug, seconds}|null,
 *             flat: {n, levels, steps, dug, seconds}|null,
 *             negative: {n, levels, steps, dug, seconds}|null},
 *   unread: number, noClimb: number, stray: number, orphans: number}}
 */
export function woodClimbCost (lines) {
  const src = Array.isArray(lines)
    ? lines
    : (typeof lines === 'string' ? lines.split('\n') : null)
  if (!src) return null
  const classes = freshClasses()
  // the pending trips: famine (the before mass) waiting for the same
  // bot's gathered close; the climb cost rides inside the window
  const pending = new Map()
  let trips = 0
  let climbed = 0
  let unread = 0
  let noClimb = 0
  let stray = 0
  for (const line of src) {
    if (typeof line !== 'string') continue
    const fm = line.match(WOOD_FAMINE_RE)
    if (fm) {
      pending.set(fm[1], { before: Number(fm[2]) + Number(fm[3]) + Number(fm[4]), climb: null })
      continue
    }
    const cm = line.match(WOOD_CLIMB_OK_RE)
    if (cm) {
      const p = pending.get(cm[1])
      if (p && p.climb === null) {
        p.climb = { levels: Number(cm[2]), steps: Number(cm[3]), dug: Number(cm[4]), seconds: Number(cm[5]) }
        climbed++
      } else {
        stray++ // no pending famine (or the trip already carries its climb)
      }
      continue
    }
    const gm = line.match(WOOD_GATHERED_RE)
    if (gm) {
      const p = pending.get(gm[1])
      if (!p) continue // a gathered line without a famine is not this book's pair
      pending.delete(gm[1])
      trips++
      const s = Number(gm[2]); const pk = Number(gm[3]); const l = Number(gm[4])
      if (s < 0 || pk < 0 || l < 0) {
        unread++ // the after-pocket sentinel: the pair exists, the class doesn't
        continue
      }
      const gain = (s + pk + l) - p.before
      const cls = gain > 0 ? 'cured' : gain === 0 ? 'flat' : 'negative'
      if (p.climb) {
        classes[cls].levels.push(p.climb.levels)
        classes[cls].steps.push(p.climb.steps)
        classes[cls].dug.push(p.climb.dug)
        classes[cls].seconds.push(p.climb.seconds)
      } else {
        noClimb++ // the walk ran, its rent was never announced
      }
    }
  }
  return {
    trips,
    climbed,
    byClass: { cured: classSpan(classes.cured), flat: classSpan(classes.flat), negative: classSpan(classes.negative) },
    unread,
    noClimb,
    stray,
    orphans: pending.size
  }
}
