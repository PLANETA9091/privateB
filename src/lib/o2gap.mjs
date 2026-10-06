//
// o2gap.mjs - THE RESCUE-RELATION SPLIT (v0.477.0) + THE RE-ENTRY PRICE (v0.479.0)
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
// (v0.479.0) THE RE-ENTRY PRICE - the wiring pricing's standing reader (the
// fire-1838 handoff): the sight-loss wiring candidate ('arm the rescue on
// sight-loss + head water', fire-1638's own words) now has its price read.
// The breath mirror line's READER grammar is OWNED here (its reader side
// had none - the emitter is miner.mjs's death handler, the mirror classes
// live in drowning.mjs's breathMirror; neither exported a parser). The
// grammar mirrors the emitter's own words byte for byte: the class tag
// [why] (controls-blind | rescue-ran | controls-owned | dry-backoff |
// surface-hold | frozen-gate | no-page), the optional ' - note' prose
// (the notes carry their own parentheses - the tail census anchors), and
// the tail census with the emitter's EXACTLY TWO head skins ('head WET'
// or 'head dry/unknown' - the emitter's ternary; anything else refuses,
// the anchor law) + 'snapshot Ns old|none'.
// (v0.707.0) THE GRAMMAR CORRECTED BY ITS OWN REUSE: the snapshot's
// fraction was written REQUIRED (\d+(?:\.\d+)s) while the emitter's own
// words carry BOTH forms ('snapshot 2s old' AND 'snapshot 2.6s old' -
// the 36th rides both on one face) - the reader was tighter than the
// emitter, and every integer-snapshot mirror was invisible to the cue
// lens (the era's three reset(-1) mirrors ALL rode integers: 1s / 0s /
// 2s). The toll's reuse (sensortoll.mjs imports this RE) surfaced the
// gap; the fraction is optional now - the emitter's grammar, byte for
// byte. The v0.479.0/v0.480.0 pricing can only GAIN the mirrors it was
// blind to (never lose one - the RE grew, never shrank).
// Per death the mirror joins AT OR BEFORE the death's line index (the
// leakClock law - the same join the sentry pass rides; the mirror prints
// in the death handler so the pair is adjacent in practice, but the law
// is the law - a later life's mirror never joins an earlier death). The
// price verdict per death: cue + head WET -> 'wired' (the sight-loss+
// head-water trigger would have fired), cue + head dry/unknown ->
// 'cueOnly' (the cue was there, the head-water half missed it - the
// wider sight-loss-only candidate's case), no cue -> 'blind' (the sensor
// gap - no wiring on this evidence saves it). The lead time ('sight died
// Ns before death', the controls-blind note's own words) is the wiring's
// available reaction window. The mirror census (mirrors total) rides
// beside the deaths - the honest scope (the emitter is death-time, but
// the count is read, never assumed).
//
// One parser per shape; the other lanes' lines (rescue starts, rescue
// verdicts, the sentry's prose) can never masquerade - the anchor law.
// Junk-safe: non-strings skipped, non-array -> null. Zero deaths -> the
// zero shape (the row stays silent). Pure: reads, never mutates.
import { parseSentryPass } from './sentry.mjs'

export const DROWN_CONTEXT_RE = /^(F\d+) \[\1\] death: drown context \(o2 (reset\(-1\)|\?|\d+), feet ((?:unknown|[a-z_]+)(?: wl)?), head ((?:unknown|[a-z_]+)(?: wl)?), rescue (active|\d+s ago|never), leg (.+), (wet \d+s|wet \d+s@last|wet unknown)\)$/i

export const BREATH_MIRROR_RE = /^(F\d+) \[\1\] water: breath mirror \[([a-z-]+)\](?: - .*)? \(o2 ([^,]*), (head WET|head dry\/unknown), snapshot (\d+(?:\.\d+)?s old|none)\)$/i

// o2Gap(lines) ->
//   { deaths, rescue: { live, stale, never }, wet: { live, atLast, unknown },
//     lastPass: { seen, none }, cue: { wired, cueOnly, blind }, mirrors,
//     perBot } | null
//   deaths     total drown-context lines (the class's mass)
//   rescue     the relation split: live ('active' - the lane was flying),
//              stale ('Ns ago' - the lane completed, the bot re-drowned),
//              never (the trigger itself blind)
//   wet        the wet window's split: live ('wet Ns' - the tracker held
//              the window), atLast ('wet Ns@last' - the last COMPLETED
//              episode), unknown
//   lastPass   the sentry-join coverage: deaths with a prior pass line
//              (seen) vs without (none)
//   cue        (v0.479.0) the re-entry price: wired (the sight-loss +
//              head-water trigger would have fired), cueOnly (the cue
//              rode head dry/unknown - the wider trigger's case), blind
//              (no mirror joined - the sensor gap)
//   mirrors    total breath-mirror lines read (the cue census's own side)
//   perBot     { F13: { o2, feet, head, rescueKind, rescueAgo, wetKind,
//                      wetS, leg, lastPass, cue, cueKind } }
//              lastPass = the bot's last sentry pass AT OR BEFORE the
//              death's index (the join law; a post-respawn pass never
//              joins - the face-43 F13 trap: the bot's later successful
//              rescue episode sits AFTER its death line), the sentry's
//              own { pass, head, o2: { kind, value } } shape, or null
//              cue = the bot's last mirror AT OR BEFORE the death (the
//              same join law): { why, o2, head ('WET'|'dry/unknown'),
//              snapshot, sightDiedSecs (the controls-blind note's lead
//              time - the wiring's reaction window; null on the classes
//              that carry no sight-loss prose) } or null; cueKind =
//              'wired' | 'cueOnly' | 'blind'
export function o2Gap (lines) {
  if (!Array.isArray(lines)) return null
  const perBot = {}
  const rescue = { live: 0, stale: 0, never: 0 }
  const wet = { live: 0, atLast: 0, unknown: 0 }
  const cue = { wired: 0, cueOnly: 0, blind: 0 }
  let deaths = 0
  let seen = 0
  let none = 0
  let mirrors = 0
  // the sentry's last-known read per bot (line order is the truth - the
  // pass counter may wrap across respawns, the index cannot)
  const lastPassByBot = {}
  // (v0.479.0) the mirror's last-known cue per bot - the same law
  const mirrorByBot = {}
  for (const line of lines) {
    if (typeof line !== 'string') continue
    const pass = parseSentryPass(line)
    if (pass) {
      lastPassByBot[pass.bot] = pass
      continue
    }
    const mm = BREATH_MIRROR_RE.exec(line)
    if (mm) {
      mirrors++
      const sightMatch = /sight died (\d+)s before death/.exec(line)
      mirrorByBot[mm[1]] = {
        why: mm[2],
        o2: mm[3],
        head: mm[4].replace(/^head /, ''),
        snapshot: mm[5],
        sightDiedSecs: sightMatch ? Number(sightMatch[1]) : null
      }
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
    // (v0.479.0) the re-entry price: the mirror's cue at or before the
    // death - the wiring's own evidence, priced per death
    const priorMirror = mirrorByBot[bot]
    const cueObj = priorMirror
      ? { why: priorMirror.why, o2: priorMirror.o2, head: priorMirror.head, snapshot: priorMirror.snapshot, sightDiedSecs: priorMirror.sightDiedSecs }
      : null
    const cueKind = cueObj ? (cueObj.head.toLowerCase() === 'wet' ? 'wired' : 'cueOnly') : 'blind'
    cue[cueKind]++
    perBot[bot] = {
      o2: m[2],
      feet: m[3],
      head: m[4],
      rescueKind,
      rescueAgo: rescueKind === 'stale' ? Number(agoMatch[1]) : null,
      wetKind,
      wetS: wetSMatch ? Number(wetSMatch[1]) : null,
      leg: m[6],
      lastPass,
      cue: cueObj,
      cueKind
    }
    rescue[rescueKind]++
    wet[wetKind]++
  }
  return { deaths, rescue, wet, lastPass: { seen, none }, cue, mirrors, perBot }
}
