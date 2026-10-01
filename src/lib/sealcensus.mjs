// (v0.397.0) THE SEAL-RESERVE CENSUS - the deposit-side keep families'
// field read. The v0.396.0 SEAL RESERVE gave the shelter family a carried
// seal floor (SEAL_RESERVE_BOUND, SEAL_PRIORITY-filled) and named its
// firings in the fleet log; three OLDER families name theirs in the same
// bounded shape (the v0.101.0 tithe naming): fuel tithe, cobble tithe,
// smelt tithe. Until now NO census read any of them (the blind-tool
// lesson, the v0.371.0 shape) - the field could not say how often the
// deposit keeps fired, what they banked, or what floors they held.
//
// THE BOUNDED SELF-NAMING (all four families, verified verbatim in
// src/lib/deposit.mjs): per depositToChest call the first 2 firings print
//   F1 [F1] seal reserve: banked 6 x dirt (pocket keeps 8 seal units)
//   F2 [F2] cobble tithe: banked 8 x cobblestone (pocket keeps 4)
//   F3 [F3] fuel tithe: banked 3 x coal (pocket keeps 4)
//   F4 [F4] smelt tithe: banked 5 x raw_iron (pocket keeps 3)
// the 3rd firing prints the rider
//   F1 [F1] seal reserve: more firings ride the banked total
// and every firing past the 3rd prints NOTHING. The DOUBLE-TAG anatomy
// (F7 [F7] ...) is deposit.mjs's own log shape on the field - verified
// against the held fleet19.log (run84a: 'F19 [F19] direct deposit: 27
// chest slots derived from the 63-slot view', the same emitter) - the
// fleet's line emitter prefixes the bot tag; the death sweep keys the
// same anatomy. So the census reads what
// the fleet chose to name: `banked` rows are exact (units, item, kept
// floor); a `rider` row proves a 3rd firing happened and that at least one
// more was silent - the count past the rider is UNKNOWABLE from the log
// and the census never invents it (the honest-sweep law). The seal
// reserve's kept clause carries the ' seal units' suffix - the tithes read
// bare numbers; both parse, the suffix is the family's own signature.
//
// Pure parser, unit-pinned (the rescue-ledger v0.368.0 shape); decompose
// is its field read. Mining-surface only: zero fleet wiring, zero new log
// lines - the v0.379.0 precedent. Junk-safe end to end: non-string rows
// are skipped, absent families read the honest zero.

const num = (s) => Number(s)

// The four bounded self-namers (family order pinned most-specific-last:
// the literals never collide - each name is its own alternation arm).
export const SEAL_FAMILIES = ['fuel-tithe', 'cobble-tithe', 'smelt-tithe', 'seal-reserve']

// 'F1 [F1] seal reserve: banked 6 x dirt (pocket keeps 8 seal units)'
// 'F2 [F2] fuel tithe: banked 3 x coal (pocket keeps 4)' -> the 'seal units'
// suffix is optional and family-owned.
export const SEAL_BANKED_RE = /^(F\d+) \[F\d+\] (fuel tithe|cobble tithe|smelt tithe|seal reserve): banked (\d+) x ([a-z0-9_]+) \(pocket keeps (\d+)( seal units)?\)$/

// 'F1 [F1] seal reserve: more firings ride the banked total'
export const SEAL_RIDER_RE = /^(F\d+) \[F\d+\] (fuel tithe|cobble tithe|smelt tithe|seal reserve): more firings ride the banked total$/

const famKey = (s) => s === 'fuel tithe' ? 'fuel-tithe'
  : s === 'cobble tithe' ? 'cobble-tithe'
    : s === 'smelt tithe' ? 'smelt-tithe' : 'seal-reserve'

// 'F1 [F1] seal reserve: banked 6 x dirt (pocket keeps 8 seal units)'
//   -> { bot: 'F1', family: 'seal-reserve', moved: 6, name: 'dirt', kept: 8 }
// or null (a non-string, or any other line - the anchored shapes make a
// cross-family collision impossible: a tithe line never parses as a seal
// firing and vice versa).
export function parseSealBanked (s) {
  const m = typeof s === 'string' ? s.match(SEAL_BANKED_RE) : null
  return m ? {
    bot: m[1], family: famKey(m[2]), moved: num(m[3]), name: m[4], kept: num(m[5]),
  } : null
}

// '[F1] seal reserve: more firings ride the banked total'
//   -> { bot: 'F1', family: 'seal-reserve' } or null
export function parseSealRider (s) {
  const m = typeof s === 'string' ? s.match(SEAL_RIDER_RE) : null
  return m ? { bot: m[1], family: famKey(m[2]) } : null
}

// The census: feed the full fleet19.log lines. Every family reads the
// honest zero when its lines are absent (a face where the keeps never
// fired is a REAL result - the v0.358.0 lesson: the reader must survive
// the missing block). Per family:
//   banked   - named firings (exact, capped at 2 per deposit call)
//   units    - units those firings moved into the chest
//   riders   - rider rows (each proves a 3rd firing + at least one silent)
//   bots     - every bot that fired or rode
//   byItem   - units by item name (the cobble tithe's map is cobblestone's)
//   kept     - kept-floor distribution (the floor value -> named-firing count)
//   events   - the named firings in log order (bot, moved, name, kept)
export function sealCensus (lines) {
  const rows = Array.isArray(lines) ? lines.filter((l) => typeof l === 'string') : []
  const fam = () => ({ banked: 0, units: 0, riders: 0, bots: [], byItem: {}, kept: {}, events: [] })
  const out = {
    'fuel-tithe': fam(), 'cobble-tithe': fam(), 'smelt-tithe': fam(), 'seal-reserve': fam(),
  }
  const seen = {}
  for (const l of rows) {
    const b = l.match(SEAL_BANKED_RE)
    if (b) {
      const key = famKey(b[2])
      const f = out[key]
      const bot = b[1]
      const moved = num(b[3])
      const name = b[4]
      const kept = num(b[5])
      f.banked++
      f.units += moved
      f.byItem[name] = (f.byItem[name] || 0) + moved
      f.kept[kept] = (f.kept[kept] || 0) + 1
      if (!seen[key + ':' + bot]) { seen[key + ':' + bot] = true; f.bots.push(bot) }
      f.events.push({ bot, family: key, moved, name, kept })
      continue
    }
    const r = l.match(SEAL_RIDER_RE)
    if (r) {
      const key = famKey(r[2])
      const f = out[key]
      f.riders++
      if (!seen[key + ':' + r[1]]) { seen[key + ':' + r[1]] = true; f.bots.push(r[1]) }
    }
  }
  return out
}
