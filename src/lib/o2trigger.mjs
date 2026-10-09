//
// o2trigger.mjs - THE O2-LOW TRIGGER'S OWN WINDOW (v0.884.0)
//
// The o2-low trigger front's own pricing byte (the front the page
// lead's own row named twice on face 145: the page arrives too late
// for the typical save - fits 0 / misses 2 - so the trigger must fire
// at o2 LOW, not at the reset). The arm book (v0.880.0) prices the
// rescue STARTS' own oxygen; the page lead prices the page-vs-save
// window; the census prices the passes - NOBODY prices the WINDOW the
// o2-low trigger would have owned: the span from the bot's last
// re-crossing into the rescue band to the death line itself.
//
// THE CROSSING LAW (the descent's own entry): a crossing is the first
// numeric pass read at-or-below the band edge that follows a read
// above it (or opens the bot's stream - the descent began before the
// stream's sight). Surfacing above the edge re-arms the crossing (the
// next descent re-crosses); the LAST crossing before the death wins
// whole (the line-order law, the latest-start-wins idiom). The blind
// skins (reset(-1) / ?) judge nothing and clear nothing - the sensor's
// own death never unpins the crossing (the o2 kind 'reset' is the
// parser's own word, the reuse law).
//
// THE BAND EDGE: the sentry census's own rescueBand cell
// (rescueBand(<=10) - the decompose row's own byte; o2arm's headroom
// seat rides o2 >= 10, the census's own complement). The threshold is
// the census's own word, never invented here.
//
// THE CLOCK: the log's own adjacency (HB_RE, the one-parser law by
// reuse - the same clock sealdeath's thirds and drainthird's drops
// ride). A death before the first heartbeat stays untimed: the
// crossing's existence still prices, the window reads the honest null.
// The death resets the bot's own state (the v0.880.0 death-reset law's
// own idiom: an arm never survives the death it joined).
//
// Pure: reads, never mutates. Junk-safe: non-string rows judge
// nothing; non-array/string input reads the empty book.

import { HB_RE } from './sealdeath.mjs'
import { SENTRY_PASS_RE, parseSentryPass } from './sentry.mjs'
import { ARM_HEADROOM_MIN } from './o2arm.mjs'

// The death announce's own anchored token (deathkinds.mjs's family
// shape - the bot rides the line's own prefix; the cause stays the
// server's verdict, never re-adjudicated here).
const DEATH_RE = /^(F\d+) \[F\d+\] died - respawning/

// The census's own rescueBand edge: the trigger's own threshold
// (o2 <= 10 rides the band; the census's own cell, never forked).
export const TRIGGER_O2_MAX = ARM_HEADROOM_MIN

const emptyBook = () => ({
  deaths: 0,
  crossed: 0,
  noCrossing: 0,
  untimed: 0,
  window: { count: 0, min: null, max: null, sum: 0 },
  perDeath: []
})

/**
 * Fold the pass streams into the o2-low trigger's own per-death
 * windows. Returns the totals book (perDeath riding the bot, the ts,
 * the window in seconds or null) - never null, never invented.
 */
export function o2TriggerBook (lines) {
  const book = emptyBook()
  if (!Array.isArray(lines)) return book
  const state = {} // per bot: { crossingTs, hasCrossing, inBand }
  let lastTs = null
  const seatFor = (bot) => {
    if (!state[bot]) state[bot] = { crossingTs: null, hasCrossing: false, inBand: false }
    return state[bot]
  }
  for (const line of lines) {
    if (typeof line !== 'string') continue
    const hm = line.match(HB_RE)
    if (hm) { lastTs = Number(hm[1]); continue }
    if (SENTRY_PASS_RE.test(line)) {
      const p = parseSentryPass(line)
      if (!p) continue
      const seat = seatFor(p.bot)
      if (p.o2.kind === 'value') {
        if (p.o2.value <= TRIGGER_O2_MAX) {
          if (!seat.inBand) { seat.crossingTs = lastTs; seat.hasCrossing = true; seat.inBand = true }
        } else {
          seat.inBand = false
        }
      }
      continue
    }
    const dm = line.match(DEATH_RE)
    if (dm) {
      const bot = dm[1]
      const seat = seatFor(bot)
      book.deaths++
      const crossed = seat.hasCrossing
      const window = crossed && seat.crossingTs !== null && lastTs !== null ? Math.max(0, lastTs - seat.crossingTs) : null
      if (!crossed) book.noCrossing++
      else if (window === null) book.untimed++
      else {
        book.crossed++
        book.window.count++
        book.window.sum += window
        if (book.window.min === null || window < book.window.min) book.window.min = window
        if (book.window.max === null || window > book.window.max) book.window.max = window
      }
      book.perDeath.push({ bot, ts: lastTs, crossed, window })
      // the death reset's own law: the state never survives the death
      seat.crossingTs = null
      seat.hasCrossing = false
      seat.inBand = false
      continue
    }
  }
  return book
}

/**
 * The fence law: the sums must agree. The totals must be exactly the
 * perDeath fold's own image; the windows' sum must be the per-death
 * windows' own sum. An inconsistent book prices nothing.
 */
export function o2TriggerConsistent (book) {
  if (!book || typeof book !== 'object' || !Array.isArray(book.perDeath)) return false
  const nonNeg = (v) => Number.isInteger(v) && v >= 0
  if (![book.deaths, book.crossed, book.noCrossing, book.untimed].every(nonNeg)) return false
  if (!nonNeg(book.window.count) || !nonNeg(book.window.sum)) return false
  if (book.window.count > 0 && (book.window.min === null || book.window.max === null)) return false
  if (book.window.count === 0 && (book.window.min !== null || book.window.max !== null || book.window.sum !== 0)) return false
  let deaths = 0, crossed = 0, noCrossing = 0, untimed = 0, sum = 0, count = 0
  let min = null, max = null
  for (const d of book.perDeath) {
    if (!d || typeof d !== 'object' || typeof d.bot !== 'string') return false
    deaths++
    if (!d.crossed) noCrossing++
    else if (d.window === null) untimed++
    else {
      if (!Number.isInteger(d.window) || d.window < 0) return false
      crossed++; count++; sum += d.window
      if (min === null || d.window < min) min = d.window
      if (max === null || d.window > max) max = d.window
    }
  }
  return deaths === book.deaths && crossed === book.crossed && noCrossing === book.noCrossing &&
    untimed === book.untimed && count === book.window.count && sum === book.window.sum &&
    min === book.window.min && max === book.window.max
}

/**
 * The single-seat row (the v0.881.0 idiom): the windows' own spread,
 * the honest classes ride their own counts. An inconsistent book
 * prices nothing; a book with no deaths reads the honest silence.
 */
export function o2TriggerRow (book) {
  if (!o2TriggerConsistent(book)) return null
  if (book.deaths === 0) return null
  const parts = [`deaths ${book.deaths}`]
  if (book.window.count > 0) {
    const avg = Math.round(book.window.sum / book.window.count)
    parts.push(`crossed ${book.window.count}, window ${book.window.min}..${book.window.max}s (avg ${avg}s)`)
  }
  if (book.noCrossing > 0) parts.push(`no-crossing ${book.noCrossing}`)
  if (book.untimed > 0) parts.push(`untimed ${book.untimed}`)
  return `the o2-low trigger's own window (v0.884.0): ${parts.join(', ')} - the span the trigger would have owned from the census's own band edge (<=${TRIGGER_O2_MAX})`
}
