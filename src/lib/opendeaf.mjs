//
// opendeaf.mjs - THE OPEN-DEAF WINDOW (v0.438.0)
//
// The hop lane's open-timeout zero is the delivery machinery's strangest
// failure: the bot REACHED the chest (the open probe only fires on arrival)
// and then could not OPEN it for 10 whole seconds. Face 28 (attempt 4,
// run 36901025087) produced 5 of them in one warehouse band [-141..-136,
// 72, 397..407] while the same face's allocvalve closed once on sustained
// queue pressure ([allocvalve] CLOSED ... ts=83s, OPEN ... ts=95s) and the
// heartbeat printed mainLate spikes to 800ms. The mechanism (server-tick
// starvation vs chest contention) was UNPRICED - this lens prices it.
//
// The read is pure and decompose-side: the emitters already print every
// needed token. Three grammars ride verbatim (one parser per emitter):
//   1. the heartbeat anchor - the field prints TWO forms of the same line
//      (the log's interleaved writer truncates "[hb]" to "b]" on some
//      faces):
//        b] n=3 ts=60s rss=371M late=15ms mainLate=462ms
//        [hb] n=26 ts=521s rss=418M late=129ms mainLate=437ms
//      One regex covers both (both contain "b] n=<n> ts=<t>s"). A missing
//      mainLate reads null - never a zero lie (the Number(null) lesson).
//   2. the allocvalve pair (both ts-stamped since v0.143.0):
//        [allocvalve] CLOSED: path queue 10q sustained 30s (the run101
//        feeder cut) - long walks refused 12s (strike 1; short walks <=
//        24b still flow) ts=83s
//        [allocvalve] OPEN: rss 376M after closure (strikes 1) - the
//        funnel flows again ts=95s
//   3. the hop zero line - parsed by hopcensus.mjs's own parseHopZero
//      (the ride-the-parser law: this lens can never drift from the hop
//      census's classification).
//   4. the v0.439.0 open-retry voice - depositToChest's two-attempt loop
//      (silent since v0.25.0) now prints its own anatomy, three shapes:
//        F6 [F6] deposit: open attempt 1 timed out (open chest: timeout after 10000ms) at [-136,72,407] - the v0.25.0 retry follows
//        F6 [F6] deposit: open retry won on attempt 2 at [-136,72,407] (the window opened after the retry)
//        F6 [F6] deposit: open retry lost on attempt 2 (open chest: timeout after 10000ms) at [-136,72,407] - the zero follows
//      A 'lost' must coincide with the same chest's zero (the reason tails
//      match verbatim); a 'won' is a delivery the OLD log priced as a
//      coin-flip. The retry's own ledger prices the chronic-spike burn
//      at its TRUE rate: n zeros = 2n timed-out opens, not n.
//
// The pairing law (the v0.435.0 unpaired lesson): the hop zero carries no
// timestamp, so it is bracketed by the surrounding pulse anchors (lo =
// last anchor before the line, hi = first anchor after). A bracket is a
// WINDOW, not a moment - a valve span counts as intersecting only on a
// real interval overlap, and when the face has no anchors the bracket
// reads null/null and NOTHING is claimed. An unclosed valve (a CLOSED
// with no following OPEN) cannot bound its window - it is counted, never
// intersected.
//
import { parseHopZero } from './hopcensus.mjs'

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null }

// 'b] n=3 ts=60s rss=371M late=15ms mainLate=462ms' and
// '[hb] n=26 ts=521s rss=418M late=129ms mainLate=437ms'
//   -> { n, ts, mainLate (null when the clause is absent) } or null
export function parsePulseAnchor (s) {
  const m = typeof s === 'string' ? s.match(/b\] n=(\d+) ts=(\d+)s(?:.*?mainLate=(\d+)ms)?/) : null
  if (!m) return null
  return { n: num(m[1]), ts: num(m[2]), mainLate: m[3] !== undefined ? num(m[3]) : null }
}

// '[allocvalve] CLOSED: ... - long walks refused 12s (strike 1; ...) ts=83s'
//   -> { ts, refusedS, strike } (refusedS/strike null when absent; a CLOSED
//      without a ts stamp cannot anchor a window -> null)
export function parseValveClose (s) {
  if (typeof s !== 'string' || !s.includes('[allocvalve] CLOSED:')) return null
  const ts = (s.match(/ts=(\d+)s/) || [])[1]
  if (ts === undefined) return null
  const refused = s.match(/refused (\d+)s/)
  const strike = s.match(/strike (\d+)/)
  return { ts: num(ts), refusedS: refused ? num(refused[1]) : null, strike: strike ? num(strike[1]) : null }
}

// '[allocvalve] OPEN: rss 376M after closure (strikes 1) - ... ts=95s'
//   -> { ts, strikes } (strikes null when absent; no ts -> null)
export function parseValveOpen (s) {
  if (typeof s !== 'string' || !s.includes('[allocvalve] OPEN:')) return null
  const ts = (s.match(/ts=(\d+)s/) || [])[1]
  if (ts === undefined) return null
  const strikes = s.match(/strikes? (\d+)/)
  return { ts: num(ts), strikes: strikes ? num(strikes[1]) : null }
}

// 'F6 [F6] deposit: open attempt 1 timed out (...) at [x,y,z] - the v0.25.0 retry follows'
// 'F6 [F6] deposit: open retry won on attempt 2 at [x,y,z] (the window opened after the retry)'
// 'F6 [F6] deposit: open retry lost on attempt 2 (...) at [x,y,z] - the zero follows'
//   -> { bot, kind ('cause'|'won'|'lost'), chest ('x,y,z' or null),
//        err (null on the won form) } or null
export function parseOpenRetry (s) {
  const m = typeof s === 'string'
    ? s.match(/^(F\d+) \[F\d+\] deposit: open (attempt 1 timed out|retry won on attempt 2|retry lost on attempt 2)(?: \(([^)]*)\))? at (\S+)/)
    : null
  if (!m) return null
  const kind = m[2] === 'attempt 1 timed out' ? 'cause' : m[2] === 'retry won on attempt 2' ? 'won' : 'lost'
  const coord = (v) => /^\[-?\d+,-?\d+,-?\d+\]$/.test(v) ? v.slice(1, -1) : null
  return { bot: m[1], kind, chest: coord(m[4]), err: kind === 'won' ? null : (m[3] || null) }
}

// The census: feed the full fleet19.log lines.
//   anchors   - the pulse reads in log order {i, n, ts, mainLate}
//   valve     - { closes, opens, unclosed, spans } - spans pair each CLOSED
//               with the NEXT OPEN in log order; a CLOSED with no following
//               open counts in unclosed and never spans
//   openDeaf  - the open-timeout hop zeros with their anchor brackets:
//               { i, bot, chest ('x,y,z' or null), ms, lo, hi,
//                 inValveClose, late }
//   retries   - the v0.439.0 retry voice's own ledger: {n, byKind {cause,
//               won, lost}, byBot, chests, matched} - matched is the
//               won+lost == cause consistency read (a cause with no
//               outcome = the loop died between the attempts, never
//               assumed otherwise)
//   paired    - { inValveCloseN, lateN } over the open-timeout zeros
//   lateMs    - the spike threshold used for `late` (default 400ms, the
//               face-28 spike band's floor)
export function openDeafCensus (lines, { lateMs = 400 } = {}) {
  const rows = Array.isArray(lines) ? lines.filter((l) => typeof l === 'string') : []
  const anchors = []
  const closes = []
  const opens = []
  for (let i = 0; i < rows.length; i++) {
    const a = parsePulseAnchor(rows[i])
    if (a) { anchors.push({ i, ...a }); continue }
    const c = parseValveClose(rows[i])
    if (c) { closes.push({ i, ...c }); continue }
    const o = parseValveOpen(rows[i])
    if (o) opens.push({ i, ...o })
  }
  // spans: each close pairs with the next open in log order (an open
  // consumes at most one close - the valve's own open/close discipline)
  const spans = []
  let oi = 0
  for (const c of closes) {
    while (oi < opens.length && opens[oi].i < c.i) oi++
    if (oi < opens.length && opens[oi].i > c.i) { spans.push({ close: c.ts, open: opens[oi].ts }); oi++ } else spans.push({ close: c.ts, open: null })
  }
  const unclosed = spans.filter((s) => s.open === null).length
  const retries = { n: 0, byKind: { cause: 0, won: 0, lost: 0 }, byBot: {}, chests: [], matched: null }
  const openDeaf = []
  for (let i = 0; i < rows.length; i++) {
    const r = parseOpenRetry(rows[i])
    if (r) {
      retries.n++
      retries.byKind[r.kind]++
      retries.byBot[r.bot] = (retries.byBot[r.bot] || 0) + 1
      if (r.chest && !retries.chests.includes(r.chest)) retries.chests.push(r.chest)
    }
    const e = parseHopZero(rows[i])
    if (!e || e.klass.why !== 'open-timeout') continue
    let lo = null; let loIdx = -1; let hi = null; let hiIdx = rows.length
    for (const a of anchors) {
      if (a.i < i) { lo = a.ts; loIdx = a.i } else { hi = a.ts; hiIdx = a.i; break }
    }
    const inValveClose = spans.some((s) => s.open !== null &&
      (lo === null || lo <= s.open) && (hi === null || hi >= s.close))
    const late = anchors.some((a) => a.i >= loIdx && a.i <= hiIdx &&
      a.mainLate !== null && a.mainLate >= lateMs)
    openDeaf.push({
      i, bot: e.bot,
      chest: e.x !== null && e.z !== null ? `${e.x},${e.y},${e.z}` : null,
      ms: e.klass.ms, lo, hi, inValveClose, late,
    })
  }
  const mss = openDeaf.map((e) => e.ms).filter((m) => m !== null)
  retries.matched = retries.byKind.cause > 0 ? retries.byKind.won + retries.byKind.lost === retries.byKind.cause : null
  return {
    anchors,
    valve: { closes: closes.length, opens: opens.length, unclosed, spans },
    openDeaf,
    retries,
    paired: {
      inValveCloseN: openDeaf.filter((e) => e.inValveClose).length,
      lateN: openDeaf.filter((e) => e.late).length,
    },
    lateMs,
    ms: { n: mss.length, min: mss.length ? Math.min(...mss) : 0, max: mss.length ? Math.max(...mss) : 0, sum: mss.reduce((s, m) => s + m, 0) },
  }
}
