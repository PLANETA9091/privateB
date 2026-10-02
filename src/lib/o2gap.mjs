//
// o2gap.mjs - THE RESCUE-RELATION SPLIT (v0.477.0)
//
// The o2-reset death census's (v0.379.0) missing half. The census conflates
// the rescue relation: its 'active' bucket takes BOTH the live rescue
// ('rescue active' - the lane was flying at the death tick) AND the stale
// one ('rescue Ns ago' - the lane COMPLETED and the bot went back in).
// The wirings price differently by the class: a live rescue failing at
// death is the trigger's own gap; a stale rescue is the RE-ENTRY class
// (the lane saved the bot once, the leg walked it back). Face 43 named
// the split's cost: both drown deaths read 'rescue 42s/166s ago' - STALE,
// not live - yet the census's row would print 'the lane flew blind'.
//
// The lens also joins the sentry's last-known read per death (the
// leakClock law - the last sample at or before the death's line index):
// parseSentryPass is IMPORTED (one parser per emitter - the pass line's
// owner is sentry.mjs since v0.422.0), the death-context line's grammar is
// OWNED here (its reader side had none - only decompose's inline census
// RE, the prefix-only hound match, and the renderer's own words). The
// grammar mirrors drownContextLine's renderer (statcarry.mjs): o2
// reset(-1)|N|?, feet/head name + optional ' wl' (the waterlogged flag),
// rescue active|Ns ago|never, leg (any text - the '@coords' stamp rides
// it), wet Ns|Ns@last|unknown (the v0.279.0 last-episode fallback's own
// honesty, split here too).
//
// One parser per shape; the other lanes' lines (rescue starts, rescue
// verdicts, the sentry's prose) can never masquerade - the anchor law.
// Junk-safe: non-strings skipped, non-array -> null. Zero deaths -> the
// zero shape (the row stays silent). Pure: reads, never mutates.
import { parseSentryPass } from './sentry.mjs'

export const DROWN_CONTEXT_RE = /^(F\d+) \[\1\] death: drown context \(o2 (reset\(-1\)|\?|\d+), feet ((?:unknown|[a-z_]+)(?: wl)?), head ((?:unknown|[a-z_]+)(?: wl)?), rescue (active|\d+s ago|never), leg (.+), (wet \d+s|wet \d+s@last|wet unknown)\)$/i

// o2Gap(lines) ->
//   { deaths, rescue: { live, stale, never }, wet: { live, atLast, unknown },
//     lastPass: { seen, none }, perBot } | null
//   deaths     total drown-context lines (the class's mass)
//   rescue     the relation split: live ('active' - the lane was flying),
//              stale ('Ns ago' - the lane completed, the bot re-drowned),
//              never (the trigger itself blind)
//   wet        the wet window's split: live ('wet Ns' - the tracker held
//              the window), atLast ('wet Ns@last' - the last COMPLETED
//              episode), unknown
//   lastPass   the sentry-join coverage: deaths with a prior pass line
//              (seen) vs without (none)
//   perBot     { F13: { o2, feet, head, rescueKind, rescueAgo, wetKind,
//                      wetS, leg, lastPass } }
//              lastPass = the bot's last sentry pass AT OR BEFORE the
//              death's index (the join law; a post-respawn pass never
//              joins - the face-43 F13 trap: the bot's later successful
//              rescue episode sits AFTER its death line), the sentry's
//              own { pass, head, o2: { kind, value } } shape, or null
export function o2Gap (lines) {
  if (!Array.isArray(lines)) return null
  const perBot = {}
  const rescue = { live: 0, stale: 0, never: 0 }
  const wet = { live: 0, atLast: 0, unknown: 0 }
  let deaths = 0
  let seen = 0
  let none = 0
  // the sentry's last-known read per bot (line order is the truth - the
  // pass counter may wrap across respawns, the index cannot)
  const lastPassByBot = {}
  for (const line of lines) {
    if (typeof line !== 'string') continue
    const pass = parseSentryPass(line)
    if (pass) {
      lastPassByBot[pass.bot] = pass
      continue
    }
    const m = DROWN_CONTEXT_RE.exec(line)
    if (!m) continue
    deaths++
    const bot = m[1]
    const rescueToken = m[5].toLowerCase()
    const rescueKind = rescueToken === 'active' ? 'live' : (rescueToken === 'never' ? 'never' : 'stale')
    const agoMatch = /(\d+)s ago/.exec(m[5])
    const wetToken = m[7].toLowerCase()
    const wetKind = /@last$/.test(wetToken) ? 'atLast' : (wetToken === 'wet unknown' ? 'unknown' : 'live')
    const wetSMatch = /wet (\d+)s/.exec(m[7])
    const prior = lastPassByBot[bot]
    const lastPass = prior ? { pass: prior.pass, head: prior.head, o2: prior.o2 } : null
    if (lastPass) seen++; else none++
    perBot[bot] = {
      o2: m[2],
      feet: m[3],
      head: m[4],
      rescueKind,
      rescueAgo: rescueKind === 'stale' ? Number(agoMatch[1]) : null,
      wetKind,
      wetS: wetSMatch ? Number(wetSMatch[1]) : null,
      leg: m[6],
      lastPass
    }
    rescue[rescueKind]++
    wet[wetKind]++
  }
  return { deaths, rescue, wet, lastPass: { seen, none }, perBot }
}
