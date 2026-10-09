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
export const HB_RE = /\b\] n=\d+ ts=(\d+)s/

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
  // (v0.721.0) THE DEADLINE'S OWN STORM - the two clock reads meet. The
  // end-phase tax (v0.675.0) priced the final window's UNITS, the burst
  // share (v0.676.0) priced the storm's SIZE - neither asked whether the
  // storm itself sits inside the deadline's window. The join prices it:
  // the burst riders whose stamp lands at or past clockEnd - the
  // end-phase window. The all-inside case names THE DEADLINE'S OWN
  // STORM (the whole regime the closing minute called - face 45: all 3
  // riders at ts=781 inside the final 60s of clock end 821); the zero
  // case names the MID-FACE storm (face 42: 8 riders, 0 inside - the
  // deadline never touched it); the partial names the ride-in (face 43:
  // 7 of 8 - the storm crossed the cut). The clock never invents: no
  // bursts, no join (the burst share's own silence), no clock end, no
  // join either (an untimed-end face judges no deadline).
  let burstEndPhase = 0
  if (clockEnd !== null && burstDeaths > 0) {
    const endCut = clockEnd - DEATH_END_PHASE_WINDOW_S
    for (let k = 0; k < timedTs.length; k++) {
      if (burstRider[k] && timedTs[k] >= endCut) burstEndPhase++
    }
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
  // (v0.733.0) THE SIEGE'S OWN THIRDS - the death count's own early/mid/late
  // thirds over the face's FULL clock (the zero clock's v0.441.0 law by
  // reuse: the hop zeros' early/mid/late anatomy rides the same cut). The
  // end-phase tax (v0.675.0) prices the final 60s' UNITS, the burst share
  // (v0.676.0) prices the 30s windows, the siege pace (v0.680.0) prices the
  // timed span's density - none asked WHERE in the face's own clock the
  // deaths sat. The 51st face (run 37543519356) is the motive: 18 deaths,
  // first at ts=441 of clock end 841 - the opening THIRD took 0, the late
  // third took 16 (89%) - the storm is the deadline's own, and the calm
  // opening is the face's witness (the calm paradox v0.701.0 prices the
  // whole-calm face; this prices the calm OPENING the storm ended). The
  // boundary second belongs to the LATER third (t < thirdS strict - the
  // zero clock's own cut). The clock never invents: no clock end or no
  // timed death, no thirds (the shape stays null - the calm paradox owns
  // the zero-death face); untimed deaths (pre-first-hb) stay out of the
  // counts and ride 'unplaced' honestly.
  let thirds = null
  if (clockEnd !== null && timedTs.length > 0) {
    const thirdS = clockEnd / 3
    let early = 0
    let mid = 0
    let late = 0
    for (const t of timedTs) {
      if (t < thirdS) early++
      else if (t < 2 * thirdS) mid++
      else late++
    }
    thirds = { early, mid, late, thirdS, unplaced: stamps.length - timedTs.length }
  }
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
      burstEndPhase,
      pace,
      spanS,
      thirds
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

// (v0.843.0) THE RELOOT'S OWN PRICE - the first arrival's own mass read (the
// v0.476.0 honest bound's follow-up: face 112's 'arrivals 1' walked a pile
// home and the units rode uncounted, because the ARRIVAL line carries no
// mass - true, and still true). The join prices the walk from the lane's
// OWN words, never an invention: the arm line names the death spot ('F10
// reloot: walking to the own death spot [-114,61,367] ...'), the death
// ledger's own parser (parseSealDeathDrop - the SAME parser, one truth)
// holds the pile's own drop estimate at that cell ('~163u lost at
// [-114,61,367]'), so the arm's spot cell-matches the bot's own pile and
// the arrival credits the pile's OWN estimate. The laws: the join is
// bot-scoped (the arm says 'the OWN death spot' - a neighbor's pile at the
// same cell is never credited), the line order is the house clock (among
// the bot's own same-cell piles the LATEST at-or-before the arm owns), one
// arm pairs one arrival (the pointer clears on arrival - a second arrival
// without a new arm reads honestly unnamed), and an arm whose spot matches
// no own pile stays unnamed (the honest '?' - no pile, no price). The
// recovered number is an ESTIMATE and the row says so: it rides the death
// drop line's own '~Nu' (the loss read's own convention), not the arrival
// line (which carries stack counts only). Junk-safe: non-string rows judge
// nothing, non-array/string -> the zero shape (the census's own
// convention). Pure: reads, never mutates.
export const RELOOT_ARM_SPOT_RE = /^F\d+ reloot: walking to the own death spot \[([^\]]*)\]/ // the arm's own WHERE - the no-space bracket cell (the emitter's own format, the HOP_CLOSE_RE lesson)
export const RELOOT_ARRIVAL_TIME_RE = /^F\d+ reloot: arrived in (\d+)s/ // the walk's own seconds - additive on the same prefix RELOOT_ARRIVAL_RE tests

export function relootRecovery (lines) {
  const rows = Array.isArray(lines)
    ? lines
    : (typeof lines === 'string' ? lines.split('\n') : [])
  const pilesByBot = {} // bot -> [{ idx, pos, lost }] in line order (the empty pockets never join - no pos, no price)
  const armedByBot = {} // bot -> { pos, lost } | null - the latest named arm's pile pointer (cleared on arrival)
  let arms = 0
  let armsNamed = 0
  let armsUnnamed = 0
  let arrivals = 0
  let arrivalsNamed = 0
  let arrivalsUnnamed = 0
  let recovered = 0
  let armedEstimate = 0
  const walks = []
  rows.forEach((l, idx) => {
    if (typeof l !== 'string') return
    if (RELOOT_ARM_RE.test(l)) {
      arms++
      const bot = (l.match(/^F\d+/) || [''])[0]
      const sm = l.match(RELOOT_ARM_SPOT_RE)
      const own = (bot && pilesByBot[bot]) || []
      let pile = null
      if (sm) {
        for (const p of own) { // the LATEST own same-cell pile at-or-before the arm (the line-order law)
          if (p.idx < idx && p.pos === sm[1]) pile = p
        }
      }
      if (bot) armedByBot[bot] = pile ? { pos: pile.pos, lost: pile.lost } : null
      if (sm && pile) { armsNamed++; armedEstimate += pile.lost } else armsUnnamed++
      return
    }
    if (RELOOT_ARRIVAL_RE.test(l)) {
      arrivals++
      const bot = (l.match(/^F\d+/) || [''])[0]
      const tm = l.match(RELOOT_ARRIVAL_TIME_RE)
      const pile = (bot && armedByBot[bot]) || null
      const walk = { bot: bot || null, units: pile ? pile.lost : null, walkS: tm ? Number(tm[1]) : null }
      walks.push(walk)
      if (pile) { arrivalsNamed++; recovered += pile.lost } else arrivalsUnnamed++
      if (bot) armedByBot[bot] = null // one arm pairs one arrival - the pointer's own consumption
      return
    }
    const p = parseSealDeathDrop(l)
    if (!p || p.empty || !p.pos) return // the piles' own seat - empty pockets name nothing
    const bot = p.bot
    if (!pilesByBot[bot]) pilesByBot[bot] = []
    pilesByBot[bot].push({ idx, pos: p.pos, lost: p.lost })
  })
  return { arms, armsNamed, armsUnnamed, arrivals, arrivalsNamed, arrivalsUnnamed, recovered, armedEstimate, walks }
}

export function relootRecoveryRow (r) {
  if (!r || typeof r !== 'object' || !Number.isFinite(r.arrivals) || r.arrivals <= 0) return null
  const named = `${r.arrivalsNamed} of ${r.arrivals} named`
  const unnamedNote = r.arrivalsUnnamed > 0 ? `, ${r.arrivalsUnnamed} unnamed (the arm's own spot matched no own pile)` : ''
  return `the reloot recovery's own price (v0.843.0): ${r.arrivals} arrival(s) walked, the recovered estimate ~${r.recovered}u (${named}, the armed pile(s)' own drop estimate)${unnamedNote}`
}

// (v0.847.0) THE RELOOT REFUSAL'S OWN PRICE - the refused walk's own mass
// read (the v0.843.0 arrival price's own twin: the arrival priced the walk
// that HAPPENED, this row prices the walk the lane REFUSED). The field's
// own live class (faces 117/120: refusals 9 then 3, the unarmed grace's
// own voice) rode unpriced mass - the refusal line ('F10 reloot: no walk
// (unarmed) - the empty pocket bootstraps first, the read re-arms (a
// delay, not a verdict)') names the bot and the why but carries no spot
// and no mass - true, and still true. The join prices the refusal from
// the lane's OWN goal: the walk's goal is always the bot's OWN latest
// death spot (the emitter's own vocabulary - 'walking to the own death
// spot'), so a refusal by bot B prices B's own LATEST pile at-or-before
// the refusal line (the line-order law, the v0.843.0 precedent; no cell
// match needed - the refusal names no cell, and the latest own pile IS
// the goal the plan would arm). The mass is the pile's own drop estimate
// ('~Nu', the death drop line's own convention - one parser one truth,
// parseSealDeathDrop). THE DEDUPE LAW: one pile prices ONCE per face -
// the same pile refused twice (the grace's every-pass cadence, the
// face-36359454749 x7 anatomy) is ONE mass left sitting; the events are
// the whys' own count (strandedPiles keeps that book), the mass is the
// sitting union. Junk-safe: non-string rows judge nothing, non-array/
// string -> the zero shape; an empty pocket names nothing (the piles'
// own seat). The consistency fence (the v0.845.0 waste row's own law):
// named must sit inside [0, refusals] and unnamed must equal the gap -
// a self-inconsistent shape never renders. Pure: reads, never mutates.
export function relootRefusalPrice (lines) {
  const rows = Array.isArray(lines)
    ? lines
    : (typeof lines === 'string' ? lines.split('\n') : [])
  const pilesByBot = {} // bot -> [{ idx, pos, lost }] in line order (the empty pockets never join - no pos, no price)
  let refusals = 0
  let refusalsNamed = 0
  const pricedPiles = new Set() // the dedupe's own seat - bot + line idx keys
  let refusedMass = 0
  rows.forEach((l, idx) => {
    if (typeof l !== 'string') return
    const rm = l.match(RELOOT_REFUSAL_RE)
    if (rm) {
      refusals++
      const bot = rm[1]
      const own = pilesByBot[bot] || []
      let pile = null
      for (const p of own) { // the LATEST own pile at-or-before the refusal (the line-order law)
        if (p.idx < idx) pile = p
      }
      if (pile) {
        refusalsNamed++
        const key = `${bot}#${pile.idx}`
        if (!pricedPiles.has(key)) {
          pricedPiles.add(key)
          refusedMass += pile.lost
        }
      }
      return
    }
    const p = parseSealDeathDrop(l)
    if (!p || p.empty || !p.pos) return // the piles' own seat - empty pockets name nothing
    if (!pilesByBot[p.bot]) pilesByBot[p.bot] = []
    pilesByBot[p.bot].push({ idx, pos: p.pos, lost: p.lost })
  })
  return { refusals, refusalsNamed, refusalsUnnamed: refusals - refusalsNamed, refusedMass }
}

export function relootRefusalPriceRow (r) {
  if (!r || typeof r !== 'object' || !Number.isFinite(r.refusals) || r.refusals <= 0) return null
  if (!Number.isFinite(r.refusedMass)) return null
  if (!Number.isFinite(r.refusalsNamed) || r.refusalsNamed < 0 || r.refusalsNamed > r.refusals) return null
  if (r.refusalsUnnamed !== r.refusals - r.refusalsNamed) return null // the mutual fence: the three cells must agree
  const named = `${r.refusalsNamed} of ${r.refusals} refusal(s) priced`
  const unnamedNote = r.refusalsUnnamed > 0 ? `, ${r.refusalsUnnamed} unnamed (the own-latest read named no priced pile)` : ''
  return `the reloot refusal's own price (v0.847.0): ${named}, the refused mass ~${r.refusedMass}u (the own-latest-pile join, distinct pile(s) priced once)${unnamedNote}`
}

// (v0.850.0) THE ARMED RESCUE'S OWN PRICE - the dead-in-rescue's own mass
// read. The rescue end-state ledger (v0.368.0) counts the dead-in-rescue
// aborts; the o2 book (v0.813.0) seats the class; NEITHER prices the trade
// - the mass the armed lane watched drown stays unpriced (the armed-and-lost
// trades' own evidence: 4/4 at face 121, 3/3 at face 125). The lens joins
// every 'water: rescue aborted (dead' end to the bot's own LATEST death
// drop at-or-before it (parseSealDeathDrop - no new shape, the line-order
// law) and prices the watched mass: F10's ~72u + F13's ~203u + F14's ~66u
// (face 125) = the rescue's own price. THE DEDUPE LAW: one death prices
// ONCE per face - two aborts sharing a drop (the rescue's re-arm cadence)
// is ONE mass watched; the events are the ledger's own count (totals.dead
// keeps that book), the mass is the watched union. Junk-safe: non-string
// rows judge nothing, non-array/string -> the zero shape; a face with no
// dead-in-rescue stays silent (the row's own law). The consistency fence
// (the v0.847.0 refusal price's own law): named must sit inside [0, dead]
// and unnamed must equal the gap - a self-inconsistent shape never renders.
// Pure: reads, never mutates.
const RESCUE_DEAD_ABORT_RE = /^(F\d+) \[[^\]]*\] water: rescue aborted \(dead/
export function rescueDeadPrice (lines) {
  const rows = Array.isArray(lines)
    ? lines
    : (typeof lines === 'string' ? lines.split('\n') : [])
  const dropsByBot = {} // bot -> [{ idx, lost }] in line order (the empty pockets never join - no pos, no price)
  let dead = 0
  let deadNamed = 0
  const pricedDrops = new Set() // the dedupe's own seat - bot + line idx keys
  let watchedMass = 0
  rows.forEach((l, idx) => {
    if (typeof l !== 'string') return
    const am = l.match(RESCUE_DEAD_ABORT_RE)
    if (am) {
      dead++
      const bot = am[1]
      const own = dropsByBot[bot] || []
      let drop = null
      for (const d of own) { // the LATEST own drop at-or-before the abort (the line-order law)
        if (d.idx < idx) drop = d
      }
      if (drop) {
        deadNamed++
        const key = `${bot}#${drop.idx}`
        if (!pricedDrops.has(key)) {
          pricedDrops.add(key)
          watchedMass += drop.lost
        }
      }
      return
    }
    const p = parseSealDeathDrop(l)
    if (!p || p.empty || !p.pos) return // the piles' own seat - empty pockets name nothing
    if (!dropsByBot[p.bot]) dropsByBot[p.bot] = []
    dropsByBot[p.bot].push({ idx, lost: p.lost })
  })
  return { dead, deadNamed, deadUnnamed: dead - deadNamed, watchedMass }
}

export function rescueDeadPriceRow (r) {
  if (!r || typeof r !== 'object' || !Number.isFinite(r.dead) || r.dead <= 0) return null
  if (!Number.isFinite(r.watchedMass)) return null
  if (!Number.isFinite(r.deadNamed) || r.deadNamed < 0 || r.deadNamed > r.dead) return null
  if (r.deadUnnamed !== r.dead - r.deadNamed) return null // the mutual fence: the three cells must agree
  const named = `${r.deadNamed} of ${r.dead} dead-in-rescue priced`
  const unnamedNote = r.deadUnnamed > 0 ? `, ${r.deadUnnamed} unnamed (the own-latest read named no priced death)` : ''
  return `the armed rescue's own price (v0.850.0): ${named}, the watched mass ~${r.watchedMass}u (the own-latest-death-drop join, distinct death(s) priced once)${unnamedNote}`
}

// (v0.755.0) THE THIRDS' OWN VERDICT - the classification leaves the mining
// script and becomes the lib's own one truth. The v0.733.0 thirds lens
// (clock.thirds: early/mid/late over the face's full clock) priced the
// WHERE, but its DOMINANCE class lived inline in decompose's print row -
// unit-test-blind, and its tie branch read dishonestly (a max tie silently
// resolved late > mid > early by order, a storm seat no field face ever
// named). The extraction rides the SAME 2/3 share law the field's own
// reads were made with (the boundary second already belongs to the later
// third - the zero clock's own cut):
//
//   face 51 (run 37543519356): 0/2/16 -> late, 16 >= 12   - THE DEADLINE'S OWN THIRD
//   face 60 (the dispatch's own corpse): 0/1/2 -> late, 2 >= 2
//   face 61 (37583836654): 0/1/2 -> late, 2 >= 2          - the deadline's third again
//   face 62 (37586368766): 0/3/0 -> mid, 3 >= 2           - THE MIDDLE'S OWN STORM
//
// The verdict classes: 'late' | 'mid' | 'early' (the dominant seat, >= 2/3
// of the timed deaths), 'spread' (a unique max below the bar - the deaths
// spread across the face's clock), 'even' (a max tie - the storm has no
// seat; the tie branch the field never read now reads honestly), 'none'
// (a zero clock). Junk law: a missing/negative/non-finite third reads
// null (the clock never invents); a non-finite timed falls back to the
// thirds' own sum (the caller's count is a convenience, not a truth).
export function thirdsVerdict (thirds, timed) {
  if (!thirds || typeof thirds !== 'object') return null
  const e = thirds.early
  const m = thirds.mid
  const l = thirds.late
  if (!Number.isFinite(e) || !Number.isFinite(m) || !Number.isFinite(l)) return null
  if (e < 0 || m < 0 || l < 0) return null
  const total = Number.isFinite(timed) && timed >= 0 ? timed : e + m + l
  const counts = { early: e, mid: m, late: l }
  if (total <= 0) return { cls: 'none', dom: 0, dominant: false, share: 0, counts, total: 0 }
  const dom = Math.max(e, m, l)
  const ties = [e, m, l].filter(x => x === dom).length
  const dominant = dom >= Math.ceil((2 * total) / 3)
  const share = dom / total
  if (ties > 1) return { cls: 'even', dom, dominant, share, counts, total }
  if (!dominant) return { cls: 'spread', dom, dominant: false, share, counts, total }
  return { cls: dom === l ? 'late' : (dom === m ? 'mid' : 'early'), dom, dominant: true, share, counts, total }
}
