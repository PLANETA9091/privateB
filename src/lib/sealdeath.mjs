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

import { SEAL_PRIORITY } from './shelter.mjs'

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
 * @returns {{drops: number, emptyReads: number, lostTotal: number, sealLostTotal: number, byBot: Object<string,{drops: number, emptyReads: number, lost: number, sealLost: number, items: Object<string,number>}>}}
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
  for (const l of rows) {
    const p = parseSealDeathDrop(l)
    if (!p) continue
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
  return { drops, emptyReads, lostTotal, sealLostTotal, byBot }
}
