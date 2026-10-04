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
  if (reason === 'low-o2') return "the deep yard's air is the front - the climb ran out of sky"
  return "that reason's own cure is the front"
}

// (v0.613.0) THE DEMAND-CLOSURE LENS - the upfront leg's demand rides the
// funded line ('the yard stands N levels up') and the landed line rides the
// rise ('climbed +N levels'), but no lens ever PAIRED them: a landing that
// rose less than the demand still prints 'the hop ladder is pre-funded'.
// THE FACE: fleet 37193219050 (512fbf0 = v0.610.0, the altitude-demand
// guard's first flight) - the instant '+0' face is GONE (the guard holds)
// and the timeout class is gone (0 of 11 vs 4 of 5 on face 37191475285),
// but ALL THREE landings are partial rises: F16 demanded 12 climbed +6,
// F5 demanded 13 climbed +8, F10 demanded 9 climbed +1 - the demand stands
// 5-8 levels above every 'pre-funded' walk. The census pairs each funded
// with the bot's next terminal outcome (the log interleaves bots, so the
// pairing walks per-bot order, the bankcensus stranded-pairing shape):
//   closed   - the rise met the demand (gained >= dy - 1, the 1-level
//              already-out tolerance climbSurfaceShort's own boundary)
//   partial  - the rise fell short (the gap is the demand still standing)
//   aborted  - the terminal is a failure (the demand untested; by reason)
//   condemned- the route latched before the climb
//   unrated  - the landed numbers rode '?' (the emitter's nullish fallback)
//   unresolved - a funded superseded by a re-fund with no terminal between
//   orphan   - a terminal with no funded in front (the funded rode torn)
// Mining-surface only: zero fleet wiring, zero new log lines.

// ONE always-print verdict over the demand-closure census; the bands are
// exclusive:
//   none          - the family never spoke (the none form is a verdict)
//   torn book     - terminals rode without a funding ask
//   untested      - no landing at all: the top abort class owns the face
//   unrated       - every landing rode '?' numbers - the demand unpriced
//   closes        - every priced landing met its demand
//   all partial   - every priced landing fell short: the demand stands (the
//                   biggest gap named - the 'pre-funded' walk's own lie)
//   mixed         - some closed, some short: the biggest gap still names
//                   the front
export function upfrontDemandRow (c) {
  const landings = c.closed + c.partial + c.unrated
  if (c.demanded === 0 && landings === 0 && c.aborted === 0 && c.condemned === 0 && c.orphan === 0) {
    return c.torn > 0
      ? `upfront demand book: none - the ascent never asked (${c.torn} torn line(s) rode the family's name)`
      : 'upfront demand book: none - the ascent never asked'
  }
  const head = `upfront demand book: demanded ${c.demanded}, closed ${c.closed}, partial ${c.partial}, aborted ${c.aborted} across ${c.botCount} bot(s)`
  if (c.demanded === 0) {
    return `${head} - the book reads torn - outcomes rode without a funding ask`
  }
  const gapName = c.biggestGap
    ? `the biggest gap ${c.biggestGap.gap} levels: ${c.biggestGap.bot} demanded ${c.biggestGap.dy}, climbed +${c.biggestGap.gained}`
    : null
  if (landings === 0) {
    if (c.condemned > 0 && c.aborted === 0) return `${head} - the route is condemned - the demands go untested`
    const top = topReason(c.abortReasons) || ['no read', c.aborted]
    return `${head} - the demand goes untested - ${top[0]} owns the aborts (${top[1]} of ${c.aborted}) - ${reasonThrottle(top[0])}`
  }
  if (c.partial === 0 && c.closed === 0) {
    return `${head} - the landings ride unrated numbers (?) - the demand unpriced`
  }
  if (c.partial === 0) {
    return `${head} - the landings close their demands (${c.closed} of ${landings} priced)`
  }
  if (c.closed === 0) {
    return `${head} - every landing is partial - the demand stands (${gapName})`
  }
  return `${head} - partial ${c.partial} of ${c.partial + c.closed} priced landings - ${gapName}`
}

export function upfrontDemandCensus (lines) {
  const c = {
    demanded: 0, closed: 0, partial: 0, aborted: 0, condemned: 0,
    unrated: 0, unresolved: 0, orphan: 0, torn: 0,
    abortReasons: {}, biggestGap: null,
    bots: new Set()
  }
  const pending = new Map() // bot -> {dy} (the unnamed bot rides '_')
  for (const line of lines) {
    const p = parseUpfrontAscent(line)
    if (!p) {
      if (typeof line === 'string' && UPFRONT_BOOK_TORN_RE.test(line)) c.torn++
      continue
    }
    const key = p.bot || '_'
    if (p.kind === 'funded') {
      if (pending.has(key)) c.unresolved++ // a re-fund superseded the open demand
      pending.set(key, { dy: p.dy })
      c.demanded++
      if (p.bot) c.bots.add(p.bot)
      continue
    }
    const open = pending.get(key)
    if (open) pending.delete(key)
    if (p.kind === 'landed') {
      if (!open) { c.orphan++; continue }
      if (p.gained === null) { c.unrated++; continue }
      if (p.gained >= open.dy - 1) { c.closed++; continue } // the 1-level already-out tolerance
      c.partial++
      const gap = open.dy - p.gained
      if (c.biggestGap === null || gap > c.biggestGap.gap) {
        c.biggestGap = { bot: p.bot, dy: open.dy, gained: p.gained, gap }
      }
    } else if (p.kind === 'failed') {
      if (!open) { c.orphan++; continue }
      c.aborted++
      c.abortReasons[p.reason] = (c.abortReasons[p.reason] || 0) + 1
    } else if (p.kind === 'route-latched') {
      if (!open) { c.orphan++; continue }
      c.condemned++
    }
  }
  c.botCount = c.bots.size
  return c
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
