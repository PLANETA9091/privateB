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
  let total = 0
  for (const l of rows) {
    if (typeof l !== 'string' || !l.length) continue // junk-safe: the FATAL face truncates (the v0.358.0 lesson)
    const m = DEATH_KIND_RE.exec(l)
    if (!m) {
      if (/^F\d+ \[F\d+\] died - respawning/.test(l)) unparsed.push(l)
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
  return { total, byKind, byBot, vertical, verticalCount: vertical.length, unparsed }
}
