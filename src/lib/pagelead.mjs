//
// pagelead.mjs - THE PAGE LEAD'S OWN BOOK (v0.875.0)
//
// The re-entry price's (v0.479.0) unread half. The cue join reads a lead
// only from the controls-blind prose ('sight died Ns before death' -
// o2gap's sightDiedSecs), so every rescue-ran death rode 'sight died ?s'
// in the decompose row and the effective window (v0.480.0) priced it
// unpriced: face 142 read 'unpriced 3' of 4 - three of four deaths
// unpriced BY THE READER, not by the field. The rescue-ran mirror
// carries its OWN lead byte - '(paged Ns before death)' - the sentry's
// page lead, unread since v0.477.0 shipped the join. This book parses
// it.
//
// THE PAGE IS THE ARM EVENT (no stale floor): the v0.480.0 floor taxes
// the SNAPSHOT AGE (the sight-loss trigger arms when the age crosses
// BREATH_OWNER_STALE_MS); the page trigger arms AT the page - the o2
// event itself - so the page window is the lead, whole. The floor never
// applies here because it never forks here.
//
// THE WINDOW'S OWN PRICE: the lead is priced against the lane's own
// saves (rescue-ledger's classifier - the one classifier, never forked,
// entrywindow's own filter): fits (the lead covers the lane's WORST
// observed save - the page trigger closes with headroom), tight (covers
// the MEDIAN save - the typical rescue fits, the tail risks), misses
// (below the median - the page arrives too late for the typical save:
// the trigger must fire at o2 low, not at the reset), unpriced (no page
// lead rode, or no saves in the face - the honest blind spots).
//
// THE KIND SEAT: which mirror kind owns the deaths (rescue-ran /
// controls-blind / o2gap's other kinds / blind - no mirror joined). A
// strict majority seats; a tie reads the spread is the shape.
//
// THE JOIN LAW (o2gap's own shape): the lead joins from the LATEST
// mirror at or before the death's line index (line order is the truth;
// a later life's page never joins an earlier death, an older page never
// survives a newer pageless mirror - the latest mirror wins whole).
// The COUNTS ride the death line (a bot that drowns twice owns two
// deaths); the perDeath map stays o2gap's own last-wins shape (the
// house wart entrywindow carries) - the riders row reads the map, the
// counts never do.
//
// Reuse law: the death grammar is o2gap's DROWN_CONTEXT_RE (one parser
// per emitter - never forked); the saves ride rescue-ledger's
// rescueEndClass + rescueEndSeconds (entrywindow's own filter); the ONLY
// new byte is PAGE_LEAD_RE - the emitter's '(paged Ns before death)'
// prose, read mid-line (junk-safe: a caller prefix or a caller suffix
// never rides it). Mining-surface only: zero fleet wiring, zero new log
// lines. Junk-safe end to end: non-object o2g / non-array lines / zero
// deaths read null (the row stays silent - the v0.379.0 precedent);
// non-string lines are skipped; an inconsistent book prices nothing
// (the fence law). Pure: reads, never mutates.
//
import { DROWN_CONTEXT_RE } from './o2gap.mjs'
import { rescueEndClass, rescueEndSeconds } from './rescue-ledger.mjs'

/** The rescue-ran mirror's own page lead - the emitter's exact prose
 * (miner.mjs's death handler), read mid-line. The fraction is optional
 * (the emitter carries both forms - the v0.707.0 lesson). */
export const PAGE_LEAD_RE = /\(paged (\d+(?:\.\d+)?)s before death\)/

/** The last-breath band in seconds - every page lead under it names the
 * sentry's own lateness (the page fired at the o2 reset, the lane
 * inherits the damage window, not the air window). */
export const LAST_BREATH_MAX_S = 3

/**
 * The page lead's own book: every drown death folded with the page lead
 * the rescue-ran mirror carries, the mirror kind's own seat, and the
 * page window priced against the lane's own saves.
 *
 * @param {object|null} o2g o2Gap's own fold (the death join's grammar -
 *   one parser, never forked)
 * @param {string[]} lines the face log (array - entrywindow's own fence;
 *   a raw blob reads null, the caller splits first)
 * @returns {{deaths: number, kinds: Object<string, number>,
 *   leads: {min: number, max: number, avg: number, count: number}|null,
 *   unpaged: number, seat: {kind: string, n: number, total: number}|null,
 *   lastBreath: boolean, window: {saves: number, min: number|null,
 *   median: number|null, max: number|null, fits: number, tight: number,
 *   misses: number, unpriced: number},
 *   perDeath: Object<string, {lead: number|null, kind: string,
 *   verdict: string}>}|null}
 */
export function pageLeadBook (o2g, lines) {
  if (!o2g || typeof o2g !== 'object') return null
  if (!Array.isArray(lines)) return null
  if (!Number.isFinite(o2g.deaths) || o2g.deaths <= 0) return null
  const rows = typeof lines === 'string' ? lines.split('\n') : lines
  // the lane's cost side: the SAVED episodes' durations (the one
  // classifier - the complete classes only, entrywindow's own filter)
  const costs = []
  for (const l of rows) {
    if (typeof l !== 'string') continue
    const cls = rescueEndClass(l)
    if (cls === 'complete' || cls === 'completeStandingWet') {
      const s = rescueEndSeconds(l)
      if (s !== null) costs.push(s)
    }
  }
  costs.sort((a, b) => a - b)
  const mid = Math.floor((costs.length - 1) / 2)
  const median = costs.length
    ? (costs.length % 2 ? costs[mid] : (costs[mid] + costs[mid + 1]) / 2)
    : null
  const min = costs.length ? costs[0] : null
  const max = costs.length ? costs[costs.length - 1] : null
  // the lead join: the latest mirror's page lead at-or-before each death
  // (o2gap's own shape - the latest mirror wins whole, line order is the
  // truth)
  const lastLeadByBot = {}
  const perDeath = {}
  const kinds = {}
  const verdicts = { fits: 0, tight: 0, misses: 0, unpriced: 0 }
  const leadVals = []
  let unpaged = 0
  let deaths = 0
  for (const l of rows) {
    if (typeof l !== 'string') continue
    const botM = /^(F\d+) \[F\d+\] water: breath mirror /.exec(l)
    if (botM) {
      // the join law, whole: EVERY mirror line resets the bot's lead -
      // a page sets it, a pageless mirror clears it (the latest mirror
      // wins whole; an older page never survives a newer pageless one,
      // and a page prose outside a mirror line never rides at all)
      const pm = PAGE_LEAD_RE.exec(l)
      lastLeadByBot[botM[1]] = pm ? Number(pm[1]) : null
      continue
    }
    const dm = DROWN_CONTEXT_RE.exec(l)
    if (!dm) continue
    deaths++
    const bot = dm[1]
    const rel = o2g.perBot && o2g.perBot[bot]
    const kind = rel && rel.cue && rel.cue.why ? rel.cue.why : 'blind'
    const lead = Number.isFinite(lastLeadByBot[bot]) ? lastLeadByBot[bot] : null
    let verdict
    if (lead === null || costs.length === 0) verdict = 'unpriced'
    else if (max !== null && lead >= max) verdict = 'fits'
    else if (median !== null && lead >= median) verdict = 'tight'
    else verdict = 'misses'
    // the counts ride the DEATH LINE (the one-grammar law: a bot that
    // drowns twice owns two deaths - the perDeath map stays o2gap's own
    // last-wins shape, the house wart, but the counts never fold from it)
    verdicts[verdict]++
    if (lead !== null) leadVals.push(lead)
    if (kind === 'rescue-ran' && lead === null) unpaged++
    kinds[kind] = (kinds[kind] || 0) + 1
    perDeath[bot] = { lead, kind, verdict }
  }
  // the one-grammar law: two walks of one grammar must agree - a
  // mismatch names a forked reader and prices nothing (the fence law)
  if (deaths !== o2g.deaths) return null
  const leads = leadVals.length
    ? {
        min: Math.min(...leadVals),
        max: Math.max(...leadVals),
        avg: leadVals.reduce((a, b) => a + b, 0) / leadVals.length,
        count: leadVals.length
      }
    : null
  // the kind seat: the strict-majority law (the tie reads the spread)
  let seat = null
  const seatEntries = Object.entries(kinds).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
  if (seatEntries.length && seatEntries[0][1] * 2 > deaths) {
    seat = { kind: seatEntries[0][0], n: seatEntries[0][1], total: deaths }
  }
  const lastBreath = leads !== null && leads.max < LAST_BREATH_MAX_S
  return {
    deaths,
    kinds,
    leads,
    unpaged,
    seat,
    lastBreath,
    window: { saves: costs.length, min, median, max, ...verdicts },
    perDeath
  }
}

/**
 * The fence: an inconsistent book prices nothing (the fence law - a
 * fold that cannot prove itself is junk, not evidence). The laws: one
 * death or more; the kinds sum to the deaths; every rescue-ran death
 * either paged or honestly unpaged; the leads band honest; the verdicts
 * sum to the deaths.
 *
 * @param {object|null} [b] the pageLeadBook fold
 * @returns {boolean} true when the book may price
 */
export function pageLeadBookConsistent (b) {
  if (!b || typeof b !== 'object') return false
  if (!Number.isInteger(b.deaths) || b.deaths <= 0) return false
  const kindSum = Object.values(b.kinds || {}).reduce((a, v) => a + v, 0)
  if (kindSum !== b.deaths) return false
  if (!Number.isInteger(b.unpaged) || b.unpaged < 0) return false
  const paged = b.leads === null ? 0 : b.leads.count
  if (paged + b.unpaged !== (b.kinds['rescue-ran'] || 0)) return false
  if (b.leads !== null) {
    if (!(b.leads.min <= b.leads.max)) return false
    if (!Number.isFinite(b.leads.avg)) return false
  }
  const w = b.window
  if (!w || typeof w !== 'object') return false
  if (w.fits + w.tight + w.misses + w.unpriced !== b.deaths) return false
  return true
}

/**
 * The book's own row - one line, the fold's field read. The honest null
 * when the book is absent or inconsistent (a fold that cannot prove
 * itself prices nothing - the fence law).
 *
 * @param {object|null} [b] the pageLeadBook fold
 * @returns {string|null} the row byte, or null
 */
export function pageLeadBookRow (b) {
  if (!pageLeadBookConsistent(b)) return null
  const seatByte = b.seat
    ? `kind seat: ${b.seat.kind} owns ${b.seat.n} of ${b.seat.total} (${((b.seat.n / b.seat.total) * 100).toFixed(1)}%)`
    : 'kind seat: the spread is the shape (no strict majority)'
  let leadByte
  if (b.leads === null) {
    leadByte = 'paged: none (no page lead rode)'
  } else {
    const lawByte = b.lastBreath
      ? `, all under ${LAST_BREATH_MAX_S}s - THE LAST BREATH'S OWN PAGE: the sentry pages at the o2 reset, the lane inherits the damage window`
      : ''
    leadByte = `paged ${b.leads.min}..${b.leads.max}s avg ${b.leads.avg.toFixed(1)}s (${b.leads.count} page(s)${lawByte})`
    if (b.unpaged > 0) leadByte += `, unpaged ${b.unpaged}`
  }
  const w = b.window
  let verdictByte
  if (w.saves === 0) verdictByte = 'the page window unpriced (no lane saves in the face)'
  else if (w.misses > 0) verdictByte = 'the page arrives too late for the typical save: the trigger must fire at o2 low, not at the reset'
  else if (w.tight > 0) verdictByte = 'the page covers the typical save, the tail risks: the o2-low threshold is the lever'
  else verdictByte = 'the page covers the lane\'s worst save: the page trigger closes with headroom'
  return `the page lead's own book (v0.875.0): ${b.deaths} drown death(s) - ${seatByte} - ${leadByte} - the page window vs the lane's own saves (n ${w.saves}${w.median !== null ? `, median ${w.median}s` : ''}): fits ${w.fits} / tight ${w.tight} / misses ${w.misses} / unpriced ${w.unpriced} - ${verdictByte}`
}

/**
 * The riders row - the per-death bracket line (the house bill idiom):
 * the lead that joined and the verdict it earned, or the kind's own
 * honest no-page. Bots ride line order (the truth).
 *
 * @param {object|null} [b] the pageLeadBook fold
 * @returns {string|null} the riders byte, or null
 */
export function pageLeadBookRidersRow (b) {
  if (!pageLeadBookConsistent(b)) return null
  const bits = Object.entries(b.perDeath).map(([bot, v]) => v.lead !== null
    ? `${bot} [paged ${v.lead}s - ${v.verdict}]`
    : `${bot} [no page - ${v.kind}]`)
  return bits.length ? bits.join(' ') : null
}
