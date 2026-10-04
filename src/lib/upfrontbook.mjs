// (v0.607.0) THE UPFRONT BOOK - the chest ascent upfront leg's own outcome
// ledger (the mining-surface precedent, zero wiring; the walkfail book's
// v0.601.0 shape). THE FACE: fleet 37184982755 (ae8ab88 = v0.602.0) carried
// the upfront family's lines unparsed - the v0.257.0 executor (fleet19's
// chestAscentUpfront, one call site, five shapes verified verbatim against
// the held logs) prints the climb's funding, landing, failure and latch,
// and no lens read them (verticalgate owns 'chest ascent:' - the DOOM
// family, a DIFFERENT emitter; climbout owns 'climb out (arm):' - the
// machinery's own family; the v0.409.0 one-parser-per-emitter law keeps
// each in its own lens).
//
// THE EMITTER FAMILY (fleet19.mjs chestAscentUpfront, byte for byte):
//   F2 chest ascent (upfront): the yard stands 16 levels up - the climb buys the walk its route - funding the climb before the leg's walks
//   F9 chest ascent (upfront): climbed +3 levels (dug 5, 2 steps) - the hop ladder is pre-funded
//   F2 chest ascent (upfront): failed (timeout) - the leg walks from here
//   F19 chest ascent (upfront): failed (stalled) - the leg walks from here
//   F2 chest ascent (upfront): route-latched after 3 refused climbs - the route is condemned, the leg walks the whole route
// The landed numbers may ride '?' (the emitter's own nullish fallback) and
// the failed reason is the executor's own interpolation - a THROW rides the
// same parens and may nest ('failed (some error (nested) here) - ...'), so
// the capture runs greedy to the LAST paren (the walkfail book's lesson).
//
// THE READ THE FACE DEMANDED: face 37184982755's upfront leg landed 7
// climbs and FIVE of them rode +0 levels - 'climbed +0 levels (dug 0,
// 0 steps)' - and the lens said 'the landed verdict lies'. THE FIELD
// CORRECTED THE READ (face 37188370162 + miner.mjs's climbOut contract):
// a zero-gain ok has TWO shapes. The 'already out (...) ' return (dug 0,
// steps 0) is the HONEST no-op - the target was met before the climb, the
// chain may walk. The 'walkable surface' return with digs and no rise is
// the wet wall's graceful exit - THE LIE (the chain walks believing the
// ladder is pre-funded while the bot stands at the dig floor). v0.609.0
// splits the census: zeroDigGain counts the lie, alreadyOut counts the
// honest no-op, the row names whichever owns the face, and the wiring
// (fleet19's both executors) re-classifies the lie as 'failed (zero-gain)'.
//
// Pure parser, mining-surface only: zero fleet wiring, zero new log lines
// (the v0.379.0 precedent). Junk-safe end to end: non-string rows, foreign
// families ('chest ascent:' doom lines, 'climb out' machinery lines) and
// riven lines never parse into a member - the riven rides the torn sweep
// (the v0.595.0 honest-sweep law).

const TAG_OPT = '(?:F\\d+ (?:\\[[A-Za-z0-9]+\\] )?)?'
export const UPFRONT_LAND_SHARE = 0.5

export const UPFRONT_RE = new RegExp('^' + TAG_OPT + 'chest ascent \\(upfront\\): (.+)$')

const FUNDED_RE = /^the yard stands (\d+) levels up - the climb buys the walk its route - funding the climb before the leg's walks$/
const LANDED_RE = /^climbed \+(\d+|\?) levels \(dug (\d+|\?), (\d+|\?) steps\) - the hop ladder is pre-funded$/
const FAILED_RE = /^failed \((.*)\) - the leg walks from here$/
const LATCHED_RE = /^route-latched after (\d+) refused climbs - the route is condemned, the leg walks the whole route$/

// The torn sweep: a line that STARTS like a member but failed the full
// grammar rides unparsed (the honest sweep - the v0.595.0 law).
export const UPFRONT_BOOK_TORN_RE = /chest ascent \(upfront\): /

const num = s => (s === '?' ? null : Number(s))

export function parseUpfrontAscent (line) {
  if (typeof line !== 'string') return null
  const m = UPFRONT_RE.exec(line.trim())
  if (!m) return null
  const b = line.match(/^F(\d+) /)
  const bot = b ? `F${b[1]}` : null
  const body = m[1]
  let p = FUNDED_RE.exec(body)
  if (p) return { kind: 'funded', bot, dy: Number(p[1]) }
  p = LANDED_RE.exec(body)
  if (p) return { kind: 'landed', bot, gained: num(p[1]), dug: num(p[2]), steps: num(p[3]) }
  p = FAILED_RE.exec(body)
  if (p) return { kind: 'failed', bot, reason: p[1].trim() }
  p = LATCHED_RE.exec(body)
  if (p) return { kind: 'route-latched', bot, refused: Number(p[1]) }
  return null
}

export function upfrontAscentCensus (lines) {
  const c = {
    funded: 0, landed: 0, zeroGain: 0, zeroDigGain: 0, alreadyOut: 0,
    failed: 0, latched: 0, torn: 0,
    gainedSum: 0, dugSum: 0, stepsSum: 0, maxDy: null, failures: {},
    bots: new Set()
  }
  for (const line of lines) {
    const p = parseUpfrontAscent(line)
    if (p) {
      if (p.bot) c.bots.add(p.bot)
      if (p.kind === 'funded') {
        c.funded++
        if (c.maxDy === null || p.dy > c.maxDy) c.maxDy = p.dy
      } else if (p.kind === 'landed') {
        c.landed++
        if (p.gained === null || p.dug === null || p.steps === null) continue
        c.gainedSum += p.gained
        c.dugSum += p.dug
        c.stepsSum += p.steps
        if (p.gained === 0) {
          c.zeroGain++
          if (p.dug > 0 || p.steps > 0) c.zeroDigGain++ // the lie: digs were burned, no rise
          else c.alreadyOut++ // the honest no-op: nothing dug, nothing stepped
        }
      } else if (p.kind === 'failed') {
        c.failed++
        c.failures[p.reason] = (c.failures[p.reason] || 0) + 1
      } else if (p.kind === 'route-latched') {
        c.latched++
      }
      continue
    }
    if (typeof line === 'string' && UPFRONT_BOOK_TORN_RE.test(line)) c.torn++
  }
  c.botCount = c.bots.size
  return c
}

const pct = (part, whole) => whole > 0 ? Math.round(part * 100 / whole) : 0
const topReason = failures => Object.entries(failures).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0]

// The failure class's own throttle reading (the emitter's reason vocabulary:
// timeout / stalled / wet wall / zero-gain ride the climbOut machinery's
// classes - zero-gain joins the family through the v0.609.0 wiring guard).
const reasonThrottle = reason => {
  if (reason === 'timeout') return 'the funded clock burns dry - the per-level price reads short'
  if (reason === 'stalled') return 'the stall owns the climb - the wall refuses the dig'
  if (reason === 'wet wall') return 'the wet wall owns the climb - the geometry is the front'
  if (reason === 'zero-gain') return "the ok-without-rise is the front - the climb's ok hides a no-rise wall"
  return "that reason's own cure is the front"
}

// ONE always-print verdict; the bands are exclusive:
//   none          - the family never spoke (the none form is a verdict)
//   condemned     - latched legs, no climb asked (the route refused pre-ask)
//   torn book     - outcomes rode without a funding ask (the riven face)
//   never lands   - funded climbs, zero landings: the top failure class owns
//   zero-gain lie - over the half of the landings DUG and rose nothing: the
//                   landed verdict lies (the wet wall's graceful exit)
//   already-out   - over the half of the landings were honest no-ops: the
//                   ground called the climbs already-out - the plan's vertical
//                   read and the ground disagree
//   lands         - over the half of the funded climbs rose: the funding lands
//   misses        - landings under the half (and both zero shapes under the
//                   half): the top failure class owns the misses
export function upfrontAscentRow (c) {
  const total = c.funded + c.landed + c.failed + c.latched
  if (total === 0) {
    return c.torn > 0
      ? `upfront ascent book: none - the ascent never asked (${c.torn} torn line(s) rode the family's name)`
      : 'upfront ascent book: none - the ascent never asked'
  }
  const head = `upfront ascent book: funded ${c.funded}, landed ${c.landed}, failed ${c.failed}, latched ${c.latched} across ${c.botCount} bot(s)`
  if (c.funded === 0) {
    if (c.landed === 0 && c.failed === 0) return `${head} - the route is condemned - no climb asked`
    return `${head} - the book reads torn - outcomes rode without a funding ask`
  }
  if (c.landed === 0) {
    const top = topReason(c.failures) || ['no read', c.failed]
    return `${head} - the funding never lands - ${top[0]} owns the failures (${top[1]} of ${c.failed}) - ${reasonThrottle(top[0])}`
  }
  if (pct(c.zeroDigGain, c.landed) >= 50) {
    return `${head} - the zero-gain climb is the face - ${c.zeroDigGain} of ${c.landed} landed climbs dug and rose no levels - the landed verdict lies - the climb reports ok and rises nothing`
  }
  if (pct(c.alreadyOut, c.landed) >= 50) {
    return `${head} - the ground called the climbs already-out - ${c.alreadyOut} of ${c.landed} landed climbs dug nothing and rose nothing - the plan's vertical read and the ground disagree`
  }
  if (pct(c.landed, c.funded) >= 50) {
    return `${head} - the funding lands - ${c.landed} of ${c.funded} funded climbs rose ${c.gainedSum} levels`
  }
  const top = topReason(c.failures) || ['no read', c.failed]
  return `${head} - the landings fall under the half - ${top[0]} owns the misses (${top[1]} of ${c.failed}) - ${reasonThrottle(top[0])}`
}
