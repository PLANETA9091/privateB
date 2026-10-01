// (v0.403.0) THE SEAL DEATH LEDGER - the seal economy's third leg. The
// first leg banks (the v0.397.0 sealcensus), the second leg arrives (the
// v0.398.0 seal-stock baseline + the v0.401.0 seal roster) - the third leg
// is where the stock DIES. THE FIELD DECODE (face 23 = 36840196789, mined
// by the 1800/1738 fires): F14 arrived 0/8 seal-empty SIX times and the
// reserve never fired (the sealcensus families all empty) - but F14's own
// death drop says '~~172u lost ... (cobblestone 64, diorite 28, dirt 26,
// cobblestone 19, andesite 7, +12 more)': the seal stock EXISTED, and the
// DEATH dropped it on the ground - the pocket-level reserve (v0.396.0,
// bank-time) bypasses death entirely, and the dig-earn mechanic's promise
// ('the dig supplies the seal') cannot survive a respawn-empty reset. THE
// LEDGER reads the death-drop lines' own words: the '~Nu lost' headline,
// the named top-5 item stacks (SUMMED per name - face 23's F14 carries
// cobblestone TWICE), the '+N more' tail counted and NEVER invented (the
// fleet's own honest truncation - the tail's composition is unknown, so
// sealLost is the NAMED floor, the honest 'at least' number), the
// empty-pocket form ('pocket read empty at death (0u)') its own count.
// The seal class rides the SAME SEAL_PRIORITY list the ring and the
// reserve spend (shelter.mjs) - one list, all three arithmetics, the
// v0.396.0 co-derivation law. Mining-surface only: zero fleet wiring,
// zero new log lines - the v0.379.0 precedent.
//
// (v0.407.0) THE DEATH CLOCK LENS - the death leg gains WHEN. Face 24's
// field decode (the 1838 fire) read ALL 10 deaths inside the last ~64s of
// a 600s face - 'a deadline-pressure class?' was the open question, priced
// only by hand. The lens makes the read mechanical: every ledger death
// (drops AND the empty-pocket re-deaths - F14/F18's second deaths were
// among face 24's ten) rides the b] heartbeat's ts= clock, the same clock
// the v0.395.0 whale-feed lens reads. The clock prices the SPIRAL: the
// end-phase share (deaths in the face's final window) and the max burst
// (the densest sliding window). The clock stamps, it never invents: a
// death before the first heartbeat reads untimed and stays honestly
// unpriced - the null stays null.

import { SEAL_PRIORITY } from './shelter.mjs'

// (v0.407.0) THE DEATH CLOCK bounds - both named, both derived from the
// field read they price. The end-phase window: face 24's spiral ran ~64s,
// the run's final minute is the deadline-pressure candidate; 60 is the
// conservative read INSIDE that evidence. The burst window: half the
// end-phase window, the same octave the face's own double-deaths (F14
// back-to-back re-deaths) live in.
export const DEATH_END_PHASE_WINDOW_S = 60
export const DEATH_BURST_WINDOW_S = 30

// The heartbeat line: 'b] n=1 ts=21s rss=251M late=5ms mainLate=0ms'
// (heartbeat.mjs's own emitted form) - the same clock the v0.395.0
// whale-feed lens reads in shootercensus.mjs; the regex shape rides it.
const HB_RE = /\b\] n=\d+ ts=(\d+)s/

// The loss ledger form (verbatim face 23):
//   F14 [F14] death drop: ~172u lost at [-117,60,380] (cobblestone 64,
//     diorite 28, dirt 26, cobblestone 19, andesite 7, +12 more)
export const SEAL_DEATH_LOSS_RE = /^(F\d+) \[F\d+\] death drop: ~(\d+)u lost at \[[^\]]*\] \((.+)\)$/

// The empty-pocket form (verbatim face 23, F14's second death):
//   F14 [F14] death drop: pocket read empty at death (0u)
export const SEAL_DEATH_EMPTY_RE = /^(F\d+) \[F\d+\] death drop: pocket read empty at death \(0u\)$/

// The fleet's honest truncation: the parens carries the top-5 stacks then
// '+N more' - the tail's item names are UNNAMED (never invented).
const TAIL_RE = /\+(\d+) more$/

// The named stacks: 'name N' pairs, comma-separated. The name class is the
// minecraft snake_case vocabulary (cobbled_deepslate, raw_copper, ...).
const ITEM_RE = /([a-z_][a-z0-9_]*) (\d+)(?=,|$)/g

/**
 * Parse one death-drop line into its loss read, or null.
 * Junk-safe: non-string input and every non-death-drop shape judge NOTHING.
 * @param {string} [line] one fleet-log line
 * @returns {null|{bot: string, lost: number, named: number, tail: number, items: Object<string,number>, sealLost: number, empty: boolean}}
 */
export function parseSealDeathDrop (line) {
  if (typeof line !== 'string') return null
  const em = line.match(SEAL_DEATH_EMPTY_RE)
  if (em) {
    return { bot: em[1], lost: 0, named: 0, tail: 0, items: {}, sealLost: 0, empty: true }
  }
  const m = line.match(SEAL_DEATH_LOSS_RE)
  if (!m) return null
  const tm = m[3].match(TAIL_RE)
  const tail = tm ? Number(tm[1]) : 0
  const body = tm ? m[3].slice(0, tm.index) : m[3]
  const items = {}
  let named = 0
  let im
  ITEM_RE.lastIndex = 0
  while ((im = ITEM_RE.exec(body)) !== null) {
    const units = Number(im[2])
    if (!Number.isFinite(units)) continue
    items[im[1]] = (items[im[1]] || 0) + units
    named += units
  }
  let sealLost = 0
  for (const [name, units] of Object.entries(items)) {
    if (SEAL_PRIORITY.includes(name)) sealLost += units
  }
  return { bot: m[1], lost: Number(m[2]), named, tail, items, sealLost, empty: false }
}

/**
 * The seal death ledger over a whole face log (pure; the decompose field
 * read). Accepts an array of lines or a raw text blob (split on newline).
 * @param {string[]|string} [lines] the face log
 * @returns {{drops: number, emptyReads: number, lostTotal: number, sealLostTotal: number, byBot: Object<string,{drops: number, emptyReads: number, lost: number, sealLost: number, items: Object<string,number>}>, clock: {timed: number, untimed: number, clockEnd: number|null, firstTs: number|null, lastTs: number|null, endPhase: number, endPhaseWindowS: number, maxBurst: number, burstWindowS: number}}}
 */
export function sealDeathCensus (lines) {
  const rows = Array.isArray(lines)
    ? lines
    : (typeof lines === 'string' ? lines.split('\n') : [])
  const byBot = {}
  let drops = 0
  let emptyReads = 0
  let lostTotal = 0
  let sealLostTotal = 0
  // (v0.407.0) THE DEATH CLOCK - every ledger death (drops AND the empty
  // reads; both are deaths) rides the last hb ts seen. Junk-safe: a
  // non-string row judges nothing, and a death before the first hb stays
  // untimed (null) - the stamp never invents.
  const stamps = []
  let lastT = null
  let clockEnd = null
  for (const l of rows) {
    const hm = typeof l === 'string' ? l.match(HB_RE) : null
    if (hm) { lastT = Number(hm[1]); clockEnd = lastT }
    const p = parseSealDeathDrop(l)
    if (!p) continue
    stamps.push(lastT)
    const b = (byBot[p.bot] = byBot[p.bot] || { drops: 0, emptyReads: 0, lost: 0, sealLost: 0, items: {} })
    if (p.empty) {
      emptyReads++
      b.emptyReads++
      continue
    }
    drops++
    lostTotal += p.lost
    sealLostTotal += p.sealLost
    b.drops++
    b.lost += p.lost
    b.sealLost += p.sealLost
    for (const [name, units] of Object.entries(p.items)) {
      b.items[name] = (b.items[name] || 0) + units
    }
  }
  // (v0.407.0) the spiral arithmetic: the end-phase share prices against
  // the clock's OWN end read (the last hb in the whole log, not the last
  // death - deaths land inside the face's final minute, not at its last
  // line), the burst is the densest sliding window over the timed stamps.
  const timedTs = stamps.filter(t => t !== null).sort((a, b) => a - b)
  let maxBurst = 0
  for (let i = 0, j = 0; i < timedTs.length; i++) {
    while (timedTs[i] - timedTs[j] > DEATH_BURST_WINDOW_S) j++
    if (i - j + 1 > maxBurst) maxBurst = i - j + 1
  }
  const endPhase = clockEnd === null
    ? 0
    : timedTs.filter(t => t >= clockEnd - DEATH_END_PHASE_WINDOW_S).length
  return {
    drops,
    emptyReads,
    lostTotal,
    sealLostTotal,
    byBot,
    clock: {
      timed: timedTs.length,
      untimed: stamps.length - timedTs.length,
      clockEnd,
      firstTs: timedTs.length ? timedTs[0] : null,
      lastTs: timedTs.length ? timedTs[timedTs.length - 1] : null,
      endPhase,
      endPhaseWindowS: DEATH_END_PHASE_WINDOW_S,
      maxBurst,
      burstWindowS: DEATH_BURST_WINDOW_S
    }
  }
}
