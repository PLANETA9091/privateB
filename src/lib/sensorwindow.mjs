//
// sensorwindow.mjs - THE SENSOR WINDOW'S OWN BOOK (v0.881.0)
//
// The sensor-health front's own next byte. The o2 census (v0.422.0)
// counts the blind reads (the reset(-1) pass lines), the sensor toll
// (v0.707.0) counts the reset(-1) rides across the family's three
// skins - and NOBODY prices the WINDOW: how long the sensor stayed
// dead, in the stream's own reads, and where it ended. Face 144's own
// read (the honest zero: 0 blind pass lines on 128) prices the class's
// rarity; the frozen-physics/relog lane's own faces price the mass.
// The window is the lane's own shape: a maximal run of consecutive
// blind reads in one bot's line-order stream - the run's read count is
// its price, the pass span (from..to) is its clock.
//
// THE REUSE LAW (one parser per emitter - never forked): the pass
// stream's own grammar is parseSentryPass (sentry.mjs since v0.422.0,
// imported); the blind skin is the o2 kind 'reset' - the parser's own
// word, never re-spelled here. The stream is the line order (the
// house law: line order is the truth); a bot's stream is its own
// (the per-bot split rides the parser's own bot byte).
//
// THE WINDOW LAW: a maximal run of consecutive blind reads (kind
// 'reset') in one bot's stream; any numeric or unknown read ends the
// window (the sensor spoke again - the window closed); a NEW blind
// read opens the next window. The run's read count is the price; the
// pass indices (the emitter's own pass clock, first..last) are the
// span. The fleet's longest window is the single seat (the
// strict-majority law's own honesty: one seat, the tie reads the
// earliest - the fold's own order, bot lex then line order).
//
// Junk-safe end to end: non-array lines -> null; zero reads -> null
// (the row stays silent - the v0.379.0 law); non-string lines
// skipped; non-matching lines skipped (the parser's own null). Pure:
// reads, never mutates.
//
import { parseSentryPass } from './sentry.mjs'

/**
 * The sensor window's own book: the blind reads' own windows folded
 * per bot from the sentry pass stream.
 *
 * @param {string[]} lines the face log (array - entrywindow's own
 *   fence; a raw blob reads null, the caller splits first)
 * @returns {{bots: number, reads: number, blind: number, unknown: number,
 *   windows: number,
 *   longest: {bot: string, reads: number, from: number, to: number}|null,
 *   perBot: Object<string, {reads: number, blind: number,
 *   windows: number, longestRun: number}>}|null}
 */
export function sensorWindowsBook (lines) {
  if (!Array.isArray(lines)) return null
  // the per-bot stream: the reads ride the line order (the house law)
  const perBot = {}
  let reads = 0
  let blind = 0
  let unknown = 0
  let windows = 0
  // the longest window's own seat (the single-seat law)
  let longest = null
  for (const l of lines) {
    if (typeof l !== 'string') continue
    const p = parseSentryPass(l)
    if (!p || !p.bot) continue
    const bot = p.bot
    const cell = perBot[bot] || (perBot[bot] = { reads: 0, blind: 0, windows: 0, longestRun: 0, run: 0, runFrom: 0 })
    cell.reads++
    reads++
    if (p.o2 && p.o2.kind === 'reset') {
      // the blind read: the window opens or grows (the run law)
      if (cell.run === 0) {
        cell.run = 1
        cell.runFrom = p.pass
        cell.windows++
        windows++
      } else {
        cell.run++
      }
      if (cell.run > cell.longestRun) cell.longestRun = cell.run
      if (!longest || cell.run > longest.reads) {
        longest = { bot, reads: cell.run, from: cell.runFrom, to: p.pass }
      }
      cell.blind++
      blind++
    } else {
      // the sensor spoke (numeric or unknown) - the window closes
      if (p.o2 && p.o2.kind === 'unknown') unknown++
      cell.run = 0
    }
  }
  if (reads <= 0) return null
  // the honest per-bot shape: the run internals never ride the book
  const clean = {}
  for (const bot of Object.keys(perBot).sort()) {
    const c = perBot[bot]
    clean[bot] = { reads: c.reads, blind: c.blind, windows: c.windows, longestRun: c.longestRun }
  }
  return {
    bots: Object.keys(clean).length,
    reads,
    blind,
    unknown,
    windows,
    longest,
    perBot: clean
  }
}

/**
 * The fence: a book that cannot prove itself prices nothing (the
 * fence law). The laws: the sums agree (the fold's own arithmetic),
 * the longest's own reads equal the named bot's longestRun (the seat
 * rides the fold's own words).
 */
export function sensorWindowsConsistent (b) {
  if (!b || typeof b !== 'object') return false
  if (!b.perBot || typeof b.perBot !== 'object') return false
  let reads = 0
  let blind = 0
  let windows = 0
  for (const bot of Object.keys(b.perBot)) {
    const c = b.perBot[bot]
    if (!c || typeof c !== 'object') return false
    reads += c.reads || 0
    blind += c.blind || 0
    windows += c.windows || 0
  }
  if (reads !== b.reads || blind !== b.blind || windows !== b.windows) return false
  if (b.longest) {
    const c = b.perBot[b.longest.bot]
    if (!c || c.longestRun !== b.longest.reads) return false
  } else if (b.blind > 0) return false
  return true
}

/**
 * The row: the book's own byte (the pagelead law: one line, the
 * counts ride it). Inconsistent or absent books price nothing (the
 * fence law - the row stays silent).
 */
export function sensorWindowsRow (b) {
  if (!b || !sensorWindowsConsistent(b)) return null
  const pct = b.reads > 0 ? Math.round((100 * b.blind) / b.reads) : 0
  const longestByte = b.longest
    ? `the longest ${b.longest.bot} ${b.longest.reads} read(s) (pass ${b.longest.from}..${b.longest.to})`
    : 'the longest none'
  const botsByte = Object.keys(b.perBot)
    .map((bot) => {
      const c = b.perBot[bot]
      return `${bot} ${c.reads}/${c.blind} (run ${c.longestRun})`
    })
    .join(', ')
  return `the sensor window's own book (v0.881.0): ${b.reads} read(s) - blind ${b.blind} (${pct}%) - ${b.windows} window(s) - ${longestByte} - per-bot: ${botsByte}`
}
