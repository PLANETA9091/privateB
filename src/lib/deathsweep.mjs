// (v0.389.0) THE HONEST DEATH SWEEP - the decompose DEATHS block swept a
// keyword bucket (/died|death|slain|drowned|.../) behind a two-term
// exclusion (/drowning rescue|water:/) and the prose lines walked straight
// through: face 19 (36802577873, ZERO deaths) printed a fake death row
// entry from the steer hazard defer's own words ('a death is a cost the
// deficit cannot repay') - the substring-pollution class the 1030 fire
// named ('hound census polluted by the fleet-wide substring'), one
// exclusion away from the hazard memorize lines' '(N live, fleet-wide)'
// and the breath mirror's 'sight died Ns before death' (today held only by
// the water: prefix - the mirror is the o2 census's evidence, not a death).
// THE FIX (the anatomy law - the sibling-shape lesson: the sweep and the
// census must read one truth): the fleet's real death lines have a
// double-tag anatomy, verified across every held artifact with deaths -
// the announce 'F16 [F16] died - respawning (cause: ...)' and the context
// 'F16 [F16] death: drown context (...)' (face 15: F6, F13; face 18: F16,
// F11). The sweep keys on that anatomy; the OLD keyword bucket survives
// only as the AUDIT list (keywordOnly): the lines the old sweep would
// have printed that the anatomy rejects - the pollution becomes visible
// and counted instead of printed as fake deaths or silently dropped.
// Mining-surface only: zero fleet wiring, zero new log lines - the
// v0.379.0 precedent.

// The fleet's death anatomy: name [tag] then the death payload. The
// single-tag prose lines (steer hazard defer, the worklog-comment style)
// and the sensor prose (water:) never match.
const DEATH_LINE_RE = /^F\d+ \[F\d+\] (died - respawning|death: )/

// The old sweep's keyword bucket + exclusions, kept verbatim as the audit
// lens: a keywordOnly line is one the OLD tool printed as a death.
const KEYWORD_RE = /died|death|slain|drowned|suffocat|fell from|hit the ground|blew up|magic/i
const OLD_EXCLUSION_RE = /drowning rescue|water:/

// True when the line IS a fleet death line (the announce or the context).
export function isDeathLine(l) {
  return typeof l === 'string' && DEATH_LINE_RE.test(l)
}

// The sweep: feed the full fleet19.log lines. deaths = the anatomy-true
// death lines in order; byBot / byKind aggregate them (kind: announce for
// 'died - respawning', context for 'death: '); keywordOnly = the prose
// carriers the old keyword sweep would have printed (the pollution audit).
// Junk-safe: non-string rows judge nothing (a FATAL face truncates - the
// v0.358.0 lesson).
export function deathSweep(lines) {
  const rows = Array.isArray(lines) ? lines.filter((l) => typeof l === 'string') : []
  const deaths = []
  const byBot = {}
  const byKind = { announce: 0, context: 0 }
  const keywordOnly = []
  for (const l of rows) {
    const m = l.match(DEATH_LINE_RE)
    if (m) {
      deaths.push(l)
      byKind[m[1].startsWith('died') ? 'announce' : 'context']++
      const bot = (l.match(/^(F\d+)\b/) || [])[1]
      if (bot) byBot[bot] = (byBot[bot] || 0) + 1
    } else if (KEYWORD_RE.test(l) && !OLD_EXCLUSION_RE.test(l)) {
      keywordOnly.push(l)
    }
  }
  return { deaths, byBot, byKind, keywordOnly }
}
