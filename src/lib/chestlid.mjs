// (v0.859.0) THE CHEST LID'S OWN BOOK - the lid-timeout rides' own WHO+WHERE
// read.
//
// The bill (v0.852.0) folds the chest-UNREACHABLE rides per bot per chest,
// and the docket (v0.700.0) prices the door leg's aggregates - but the
// 'cannot open chest (open chest: timeout after Tms)' rides ride OUTSIDE
// the bill's regex (it requires the 'chest unreachable' wrapper) and the
// aggregates only count them by why (the hop-zero census v0.399.0:
// open-timeout=N). Nobody reads WHO rode the lid timeout, WHICH chest's
// lid died, and whether the bot came BACK to the same stuck lid.
//
// The class's own shape is the walk's own success inverted: the open call
// only fires AT the chest, so the ride itself proves the walk arrived -
// the d= rides the approach's own price, the timeout rides the lid. Face
// 133's own page (run 37882700457): 7 rides, F5 came back to the same
// chests twice ([-107,70,410] x2, [-102,70,408] x2) and the lid died
// again - the repeated column names the stuck lid.
//
// The one-parser law: the ride reads through parseHopZero (the hop-zero
// census's own exported parser, v0.399.0) filtered to the open-timeout
// class - no new grammar, no re-lexing (the HB_RE/thirdkind precedent).
//
// Pure: reads, never mutates. Zero fleet wiring (mining-surface only, the
// v0.379/.../v0.858.0 precedent). Junk-safe end to end.
//
import { parseHopZero } from './hopcensus.mjs'

/**
 * chestLidBook(lines) - the lid-timeout rides, per bot, per chest.
 *
 * @param {string[]|string|null} lines the face log (array or raw blob)
 * @returns {null|{n: number,
 *   byBot: Object<string, number>,
 *   bots: number,
 *   repeats: Array<[string, number]>,
 *   chests: Object<string, {n: number, bots: Object<string, number>}>,
 *   distinctChests: number,
 *   sharedChests: number,
 *   shared: Array<[string, {n: number, bots: Object<string, number>}]>,
 *   d: null|{n: number, min: number, max: number, avg: number},
 *   ms: number[]}} null when the face rode no lid timeout (the honest
 *   silence).
 */
export function chestLidBook (lines) {
  const list = Array.isArray(lines)
    ? lines
    : (typeof lines === 'string' ? lines.split('\n') : null)
  if (!list) return null
  const rides = []
  for (const line of list) {
    if (typeof line !== 'string') continue
    const z = parseHopZero(line)
    if (!z || !z.klass || z.klass.why !== 'open-timeout') continue
    rides.push(z)
  }
  if (rides.length === 0) return null
  const byBot = {}
  const chests = {}
  const ds = []
  const msSet = new Set()
  for (const r of rides) {
    byBot[r.bot] = (byBot[r.bot] || 0) + 1
    const key = `${r.x},${r.y},${r.z}`
    if (!chests[key]) chests[key] = { n: 0, bots: {} }
    chests[key].n++
    chests[key].bots[r.bot] = (chests[key].bots[r.bot] || 0) + 1
    if (r.dist !== null && Number.isFinite(r.dist)) ds.push(r.dist)
    if (Number.isFinite(r.klass.ms)) msSet.add(r.klass.ms)
  }
  const d = ds.length === 0
    ? null
    : {
        n: ds.length,
        min: Math.min(...ds),
        max: Math.max(...ds),
        avg: Math.round((ds.reduce((a, b) => a + b, 0) / ds.length) * 10) / 10
      }
  const ms = [...msSet].sort((a, b) => a - b)
  const shared = Object.entries(chests)
    .filter(([, c]) => Object.keys(c.bots).length > 1)
  const repeats = Object.entries(byBot)
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  return {
    n: rides.length,
    byBot,
    bots: Object.keys(byBot).length,
    repeats,
    chests,
    distinctChests: Object.keys(chests).length,
    sharedChests: shared.length,
    shared,
    d,
    ms
  }
}

/** THE CONSISTENCY FENCE - the row renders only when the book agrees with
 * itself (the v0.852.0 fence law): the bots' sum is n, the chests' sum is
 * n, each chest's bots sum to its n, the d stats obey min <= avg <= max,
 * the ms cells are finite and ordered. A self-inconsistent book never
 * renders. */
export function chestLidBookConsistent (book) {
  if (!book || typeof book !== 'object') return false
  if (!Number.isFinite(book.n) || book.n < 1) return false
  const botSum = Object.values(book.byBot || {}).reduce((a, b) => a + b, 0)
  if (botSum !== book.n) return false
  let chestSum = 0
  for (const c of Object.values(book.chests || {})) {
    if (!Number.isFinite(c.n) || c.n < 1) return false
    const s = Object.values(c.bots || {}).reduce((a, b) => a + b, 0)
    if (s !== c.n) return false
    chestSum += c.n
  }
  if (chestSum !== book.n) return false
  if (book.d !== null && book.d !== undefined) {
    if (!Number.isFinite(book.d.n) || book.d.n < 1) return false
    if (!Number.isFinite(book.d.min) || !Number.isFinite(book.d.max) ||
      !Number.isFinite(book.d.avg)) return false
    if (book.d.min > book.d.avg || book.d.avg > book.d.max) return false
  }
  if (!Array.isArray(book.ms) || book.ms.length === 0) return false
  if (!book.ms.every((v) => Number.isFinite(v))) return false
  return true
}

/** The row: 'the chest lid's own book (v0.859.0): 7 ride(s) - bots 2
 * (repeats F5=5 F2=2) - chests 5 distinct, none shared - the walk arrived
 * (d 13..44 avg 32.3 of 7) - the lid died (open timeout 10000ms x7) - THE
 * LID'S OWN CROWD: the repeats name the rider, the repeated column names
 * the stuck lid'. */
export function chestLidBookRow (book) {
  if (!chestLidBookConsistent(book)) return null
  const botCell = `bots ${book.bots}` +
    (book.repeats.length > 0
      ? ` (repeats ${book.repeats.map(([b, c]) => `${b}=${c}`).join(' ')})`
      : ', no repeats')
  const chestCell = `chests ${book.distinctChests} distinct` +
    (book.sharedChests > 0
      ? ` (shared ${book.sharedChests}: ${book.shared.map(([pos, c]) => `[${pos}] x${c.n} ${Object.keys(c.bots).sort().join('+')}`).join(', ')})`
      : ', none shared')
  const walkCell = book.d
    ? `the walk arrived (d ${book.d.min}..${book.d.max} avg ${book.d.avg} of ${book.d.n})`
    : 'the walk arrived (d unpriced)'
  const msMin = book.ms[0]
  const msMax = book.ms[book.ms.length - 1]
  const lidCell = msMin === msMax
    ? `the lid died (open timeout ${msMin}ms x${book.n})`
    : `the lid died (open timeout ${msMin}..${msMax}ms)`
  return `the chest lid's own book (v0.859.0): ${book.n} ride(s) - ${botCell} - ${chestCell} - ${walkCell} - ${lidCell} - THE LID'S OWN CROWD: the repeats name the rider, the repeated column names the stuck lid`
}
