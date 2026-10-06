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
// (v0.676.0) THE BURST SHARE threshold - a burst is 3+ deaths inside the
// burst window: a pair is a skirmish, 3+ is the storm's own signature
// (the run37407340102 face: 18 deaths, max burst 7 in 30s - the deaths
// die together; the arc counts the totals, the share prices the REGIME).
export const DEATH_BURST_MIN = 3

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
    return { bot: em[1], lost: 0, named: 0, tail: 0, items: {}, sealLost: 0, empty: true, pos: null }
  }
  const m = line.match(SEAL_DEATH_LOSS_RE)
  if (!m) return null
  // (v0.476.0) the pile's WHERE, derived from the match itself - the shape
  // (and its group indices) untouched, the capture additive.
  const pm = m[0].match(/at \[([^\]]*)\]/)
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
  return { bot: m[1], lost: Number(m[2]), named, tail, items, sealLost, empty: false, pos: pm ? pm[1] : null }
}

/**
 * The seal death ledger over a whole face log (pure; the decompose field
 * read). Accepts an array of lines or a raw text blob (split on newline).
 * @param {string[]|string} [lines] the face log
 * @returns {{drops: number, emptyReads: number, lostTotal: number, sealLostTotal: number, byBot: Object<string,{drops: number, emptyReads: number, lost: number, sealLost: number, items: Object<string,number>}>, clock: {timed: number, untimed: number, clockEnd: number|null, firstTs: number|null, lastTs: number|null, endPhase: number, endPhaseWindowS: number, maxBurst: number, burstWindowS: number, burstMin: number, burstDeaths: number, burstClusters: number, pace: number|null, spanS: number}}}
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
  // (v0.675.0) THE END-PHASE TAX - the per-death rows join the clock stamp
  // to the drop's own price (the join the clock never made: it counted the
  // end-phase DEATHS, the leak clock priced the late THIRD - neither named
  // the units lost inside the final 60s window itself). The run37399670805
  // face measured 6 of 7 drops in the late third (734u of 892u): the
  // fleet's deaths concentrate at the face's end AND carry most of the
  // lost mass - deaths the rescue/re-gather lanes cannot repay (the face
  // ends before any walk does). The stamp never invents: an untimed death
  // (pre-first-hb) stays honestly out of the tax (the clock's own law).
  const deathRows = []
  let lastT = null
  let clockEnd = null
  for (const l of rows) {
    const hm = typeof l === 'string' ? l.match(HB_RE) : null
    if (hm) { lastT = Number(hm[1]); clockEnd = lastT }
    const p = parseSealDeathDrop(l)
    if (!p) continue
    stamps.push(lastT)
    deathRows.push({ bot: p.bot, lost: p.empty ? 0 : p.lost, sealLost: p.sealLost, empty: p.empty, ts: lastT })
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
  // (v0.676.0) THE BURST SHARE - the max burst names the densest window,
  // never the storm's SIZE: a swarm face and a skirmish face can share one
  // max burst. The same sliding window marks every rider of ANY span
  // holding >= DEATH_BURST_MIN deaths; the share of marked deaths is the
  // regime's own read (the deaths die together). The clusters are the
  // maximal marked runs in time - a ts-gap beyond the window splits them
  // (the storm moved, it did not end). The clock never invents: an
  // untimed death (pre-first-hb) has no place in any window.
  const burstRider = new Array(timedTs.length).fill(false)
  for (let i = 0, j = 0; i < timedTs.length; i++) {
    while (timedTs[i] - timedTs[j] > DEATH_BURST_WINDOW_S) j++
    if (i - j + 1 > maxBurst) maxBurst = i - j + 1
    if (i - j + 1 >= DEATH_BURST_MIN) {
      for (let k = j; k <= i; k++) burstRider[k] = true
    }
  }
  let burstDeaths = 0
  let burstClusters = 0
  for (let k = 0; k < timedTs.length; k++) {
    if (!burstRider[k]) continue
    burstDeaths++
    if (k === 0 || !burstRider[k - 1] || timedTs[k] - timedTs[k - 1] > DEATH_BURST_WINDOW_S) burstClusters++
  }
  // (v0.680.0) THE SIEGE PACE - the sustained-pressure read beside the
  // burst read: deaths per clock-minute over the timed span. The 22nd
  // flight (37416742832) rode 29 mob deaths at max burst 3 - a SUSTAINED
  // siege the max burst alone underprices (the swarm that never clusters).
  // The pace is the deaths' own density: null when the span cannot price
  // it (0 or 1 timed death, or a zero span - the clock never invents).
  const spanS = timedTs.length > 1 ? timedTs[timedTs.length - 1] - timedTs[0] : 0
  const pace = spanS > 0 ? Number((timedTs.length / (spanS / 60)).toFixed(2)) : null
  const endPhase = clockEnd === null
    ? 0
    : timedTs.filter(t => t >= clockEnd - DEATH_END_PHASE_WINDOW_S).length
  // (v0.675.0) the tax: the units whose death stamped inside the final
  // endPhaseWindowS (60s) window; the empty reads price 0 by construction.
  const endPhaseLost = clockEnd === null
    ? 0
    : deathRows.reduce((s, r) => s + (r.ts !== null && r.ts >= clockEnd - DEATH_END_PHASE_WINDOW_S ? r.lost : 0), 0)
  return {
    drops,
    emptyReads,
    lostTotal,
    sealLostTotal,
    byBot,
    deathRows,
    endPhaseLost,
    clock: {
      timed: timedTs.length,
      untimed: stamps.length - timedTs.length,
      clockEnd,
      firstTs: timedTs.length ? timedTs[0] : null,
      lastTs: timedTs.length ? timedTs[timedTs.length - 1] : null,
      endPhase,
      endPhaseWindowS: DEATH_END_PHASE_WINDOW_S,
      maxBurst,
      burstWindowS: DEATH_BURST_WINDOW_S,
      burstMin: DEATH_BURST_MIN,
      burstDeaths,
      burstClusters,
      pace,
      spanS
    }
  }
}

// (v0.476.0) THE STRANDED PILES - the sweep-reach wire's price. The
// concentration held at n=3 (the shares 82%/11%/no-leak ride the biggest
// pile's 25%/80%/25%): the death pile is the leak's shape - a pile bigger
// than a pocket cannot walk home. The cure's two candidates are the
// fleet's own lanes: the reloot (the death economy's walk) and the sweep.
// THE FIELD (faces 41..43, the stored artifacts): the reloot lane spoke
// ONCE in three faces (face 43's single 'no walk (unarmed)' - the empty
// pocket bootstraps first, the read re-arms) and walked ZERO piles; the
// sweep harvests 0. The reader joins the death ledger's own parser
// (parseSealDeathDrop - no new shape) with the reloot lane's own verdicts
// and prices the wire's target: the piles, their mass, the big-pile
// class (>= BIG_PILE_U - the conservative floor INSIDE the
// concentration's own evidence: the faces' biggest piles read
// 163..507u - the v0.407.0 threshold precedent: derived from the read
// it prices), and the lane's arms/arrivals/refusals. The reader never
// invents a recovered mass: the arrival lines carry no units, so the
// price stays 'the dropped mass + the lane's walks' - the honest bound.
// Junk-safe: non-string rows judge nothing, non-array/string -> the zero
// row (the census's own convention). Pure: reads, never mutates.
export const RELOOT_REFUSAL_RE = /^(F\d+) reloot: no walk \(([^)]+)\)/i
export const RELOOT_ARM_RE = /^(F\d+) reloot: walking to the own death spot/i
export const RELOOT_ARRIVAL_RE = /^(F\d+) reloot: arrived in/i
export const BIG_PILE_U = 100

export function strandedPiles (lines) {
  const rows = Array.isArray(lines)
    ? lines
    : (typeof lines === 'string' ? lines.split('\n') : [])
  const piles = []
  let emptyReads = 0
  let arms = 0
  let pileArms = 0 // (v0.484.0) the arms that rode 'the pile arm' marker - the bypass's own voice
  let arrivals = 0
  let refusals = 0
  const refusalWhys = {}
  for (const l of rows) {
    if (typeof l !== 'string') continue
    if (RELOOT_ARM_RE.test(l)) { arms++; if (l.includes('the pile arm')) pileArms++; continue }
    if (RELOOT_ARRIVAL_RE.test(l)) { arrivals++; continue }
    const rm = l.match(RELOOT_REFUSAL_RE)
    if (rm) {
      refusals++
      const why = rm[2].split(' ')[0] // the inline census's own split law
      refusalWhys[why] = (refusalWhys[why] || 0) + 1
      continue
    }
    const p = parseSealDeathDrop(l)
    if (!p) continue
    if (p.empty) { emptyReads++; continue }
    piles.push(p)
  }
  let dropped = 0
  let biggest = null
  let bigPileUnits = 0
  for (const p of piles) {
    dropped += p.lost
    if (p.lost >= BIG_PILE_U) bigPileUnits += p.lost
    if (biggest === null || p.lost > biggest.units) biggest = { bot: p.bot, units: p.lost, pos: p.pos } // ties: the first (the line-order law)
  }
  return {
    drops: piles.length,
    emptyReads,
    dropped,
    biggest,
    bigPiles: piles.filter(p => p.lost >= BIG_PILE_U).length,
    bigPileUnits,
    topShare: dropped > 0 && biggest ? biggest.units / dropped : 0,
    arms,
    pileArms, // (v0.484.0) the pile-arm class of the arms - the bypass's field debut counter
    arrivals,
    refusals,
    refusalWhys
  }
}
