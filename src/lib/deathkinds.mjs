// (v0.425.0) THE DEATH KIND CENSUS - the vertical-death front's mechanical
// leg. The honest death sweep (v0.389.0, deathsweep.mjs) LISTS the fleet's
// real death lines; every mine still classified them BY HAND (faces 26/27:
// 'deaths 2 (F14 drown / F4 skeleton)', 'deaths 4 drops ... 5 deaths' - the
// kind counted off the raw announce text each time). The announce payload
// already carries the server's own verdict - 'cause: server: fell from a
// high place [kind=fall] | inferred: ...' - so the classification is pure
// string work on the anatomy the sweep verified: name [tag] died -
// respawning (cause: server: <verb> [kind=<kind>[ by <attacker>]] | inferred:
// <tail>). THE FRONT (F-9, the vertical death): the fall/void family is the
// row the decompose prints - every future face counts fall/drown/mob/...
// mechanically, the fall rows name the death cell and the inference
// verdict, and 'kind=fall' never has to be re-counted by eye again.
//
// The buckets mirror the runtime's own kind= vocabulary (deathcause.mjs
// parseDeathMessage): fall, drown, mob (the ' by <attacker>' tail kept on
// the row), suffocate, lava, explosion, starve, freeze, other. The census
// NEVER re-adjudicates the server verdict (the v0.117.0 doctrine - the
// server kind stays the authority); it reads what the death handler printed.
// The vertical family = kind fall PLUS the vanilla void phrasing ('fell out
// of the world' - parseDeathMessage honest-'other's it today, but it IS a
// vertical death and the front counts it).

/** The fleet's death announce anatomy, parsed to its payload. The kind group
 * is the server's bucket word; the attacker group only exists for the mob
 * family ('kind=mob by Skeleton'); the tail group carries the lastHarm
 * inference + its verdict bracket. */
const DEATH_KIND_RE = /^F\d+ \[F\d+\] died - respawning \(cause: server: (.+) \[kind=([a-z]+)(?: by ([^\]]+))?\](?: \| inferred: (.*))?\)\s*$/

/** The death cell read out of the inference tail ('0s before death at
 * [x,y,z]'). Junk tails (no position, the empty-pocket announce) read null -
 * the row still counts, only the cell stays unprinted. */
const POS_RE = /at \[(-?\d+),(-?\d+),(-?\d+)\]/

// (v0.672.0) THE INFERRED-ONLY DEATH ROW - the unparsed-bucket class the
// run37397155884 dispute named (the lane's cross-verify): when the server
// chat line is NOT fresh at the killing tick (miner.mjs authFresh false),
// the death handler prints the RAW INFERENCE as the whole cause - the field
// witness: 'F16 [F16] died - respawning (cause: drowning (0s before death
// at [-122,48,403]))'. The census parsed only the server-verdict shape, so
// that row sank into the escape hatch and the causes row read 9 deaths
// while the death clock said 10 - THE ARC'S FIRST DISPUTE. The fix parses
// the inferred-only shape (the lastHarm vocabulary: 'drowning', 'fall/env',
// a hostile name@dist) and the stale-harm 'unknown (no hp drop...)' shape,
// counts them in the SAME buckets (the arc reads the death clock RAW) and
// keeps an inferredOnly ledger so every reader knows which rows carry NO
// server verdict (the inference stays the fallback - the v0.117.0 doctrine
// is untouched: a server-verdict row is never re-adjudicated).
const DEATH_INFERRED_RE = /^F\d+ \[F\d+\] died - respawning \(cause: ([a-z][a-z/]*)(?:@[\d.]+)? \(\d+(?:\.\d+)?s before death at \[(-?\d+),(-?\d+),(-?\d+)\]\)\)\s*$/
const DEATH_UNKNOWN_RE = /^F\d+ \[F\d+\] died - respawning \(cause: unknown \(no hp drop in the last 6s at \[(-?\d+),(-?\d+),(-?\d+)\]\)\)\s*$/

/** The lastHarm name vocabulary, mapped to the kind buckets. 'drowning' is
 * the oxygen state, 'fall/env' the gravity fallback, ANY other lowercase
 * name is a hostile entity's name (zombie, skeleton, drowned, ...) - the
 * mob family with the attacker kept on the row. */
function kindOfInferred (name) {
  if (name === 'drowning') return { kind: 'drown', attacker: null }
  if (name === 'fall/env') return { kind: 'fall', attacker: null }
  return { kind: 'mob', attacker: name }
}

/** The inference verdict bracket, named the way the death line prints it. */
function corroborationOf (tail) {
  if (typeof tail !== 'string' || !tail.length) return 'absent'
  if (/corroborates/.test(tail)) return 'corroborates'
  if (/blind to this kind/.test(tail)) return 'blind'
  if (/contradicts/.test(tail)) return 'contradicts'
  return 'unknown'
}

/** The vertical family: the server's own fall kind, or the vanilla void
 * phrasing riding the honest-'other' bucket today. */
function isVertical (kind, verb) {
  if (kind === 'fall') return true
  return kind === 'other' && typeof verb === 'string' && /\bfell out of the world\b/.test(verb)
}

/**
 * Classify the fleet's death announce lines by the server's own kind.
 * @param {string[]} lines the full fleet19.log lines
 * @returns {{total: number, byKind: Object<string, number>, byBot: Object<string, number>,
 *   vertical: Array<{bot: string, verb: string, kind: string, attacker: string|null,
 *   pos: number[]|null, corroboration: string}>, verticalCount: number, unparsed: string[]}}
 *   junk-safe: non-string rows judge nothing; an announce-shaped line the
 *   payload regex cannot parse lands in unparsed (the escape hatch - a new
 *   phrasing must surface, never vanish).
 */
export function deathKindCensus (lines) {
  const rows = Array.isArray(lines) ? lines : []
  const byKind = {}
  const byBot = {}
  const vertical = []
  const unparsed = []
  const inferredOnly = []
  let total = 0
  for (const l of rows) {
    if (typeof l !== 'string' || !l.length) continue // junk-safe: the FATAL face truncates (the v0.358.0 lesson)
    const m = DEATH_KIND_RE.exec(l)
    if (!m) {
      if (!/^F\d+ \[F\d+\] died - respawning/.test(l)) continue
      // (v0.672.0) the inferred-only shapes JOIN the census (the arc reads
      // the death clock raw); anything else still surfaces in the hatch.
      const im = DEATH_INFERRED_RE.exec(l)
      if (im) {
        const iname = im[1]
        const bot = (l.match(/^(F\d+)\b/) || [])[1] || null
        const { kind, attacker } = kindOfInferred(iname)
        const pos = [Number(im[2]), Number(im[3]), Number(im[4])]
        total++
        byKind[kind] = (byKind[kind] || 0) + 1
        if (bot) byBot[bot] = (byBot[bot] || 0) + 1
        inferredOnly.push({ bot, name: iname, kind, attacker, pos })
        if (isVertical(kind, iname)) {
          vertical.push({ bot, verb: iname, kind, attacker, pos, corroboration: 'inferred-only' })
        }
        continue
      }
      const um = DEATH_UNKNOWN_RE.exec(l)
      if (um) {
        const bot = (l.match(/^(F\d+)\b/) || [])[1] || null
        total++
        byKind.unknown = (byKind.unknown || 0) + 1
        if (bot) byBot[bot] = (byBot[bot] || 0) + 1
        inferredOnly.push({ bot, name: 'unknown', kind: 'unknown', attacker: null, pos: [Number(um[1]), Number(um[2]), Number(um[3])] })
        continue
      }
      unparsed.push(l)
      continue
    }
    const [, verb, rawKind, attacker, tail] = m
    const bot = (l.match(/^(F\d+)\b/) || [])[1] || null
    const kind = rawKind === 'mob' ? 'mob' : rawKind
    total++
    byKind[kind] = (byKind[kind] || 0) + 1
    if (bot) byBot[bot] = (byBot[bot] || 0) + 1
    if (isVertical(kind, verb)) {
      const pm = tail ? POS_RE.exec(tail) : null
      vertical.push({
        bot,
        verb,
        kind,
        attacker: attacker || null,
        pos: pm ? [Number(pm[1]), Number(pm[2]), Number(pm[3])] : null,
        corroboration: corroborationOf(tail)
      })
    }
  }
  return { total, byKind, byBot, vertical, verticalCount: vertical.length, unparsed, inferredOnly, inferredOnlyCount: inferredOnly.length }
}
