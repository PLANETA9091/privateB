//
// assistledger.mjs - THE ASSIST LEDGER (v0.499.0)
// The pounce handoff's own aftermath - the ring-aftermath twin on the
// pounce book. The v0.498.0 POUNCE BOOK priced the decline probe's
// anatomy and stopped at the handoff tails: 'the assist ladder owns
// it' (the stall) and 'the ladder owns the level' (the guard) - an
// OWNERSHIP CLAIM nobody had read. THE WIRE: join every pounce
// handoff forward to the bot's next climb-lane boundary and price the
// claim (zero fleet changes, pure census - the ringafter v0.493.0
// precedent):
//   the handoffs: the guard declines ('the guard declined (wet feet|
//   the cap spent)') and the stalls ('did not rise ... - the assist
//   ladder owns it') - detected via pouncebook.mjs's OWN exported REs
//   (one parser per shape: this lib creates NO new RE for the pounce
//   skins; the reuse is the ringafter's import law, tightened - the
//   RE constants themselves);
//   the boundaries (this lib owns the boundary grammar - no lib
//   parsed these as a census):
//     rose      - '<bot> [<bot>] climb: walkable surface at y=N
//                 (+M levels, dug=D) - the walk takes over ...' - THE
//                 LADDER DELIVERED: the level rose through the walk,
//                 the M levels captured (the ownership claim TRUE);
//     attemptOk - the attempt's own verdict OK first ('climb out
//                 (ctx): OK ...' via climbout's CLIMB_OUT_RE - one
//                 parser; or 'final climb: OK ...') - the rise landed
//                 inside the machinery without a walkable line;
//     died      - the attempt's verdict failed first (the why head
//                 captured: low-o2 / wet wall / timeout / stalled ...)
//                 - THE CLAIM'S PRICE: the ladder owned the level and
//                 the attempt died anyway;
//     open      - the face's tail: the ownership still unresolved.
//   The transparent prose (never a boundary, the shelterladder
//   machinery law): 'final climb: the yard stands ...' (the attempt
//   opener), 'final climb: no retry (...)' (the retry gate - the
//   verdict rides the NEXT line), the climb diag / chest-skip lines
//   (other lanes), and the pounce probe lines themselves (a later
//   level's probe never closes an earlier handoff). A boundary closes
//   EVERY pending handoff of that bot (the F3 law: two handoffs - a
//   wet guard and a stall on different levels - rode to the SAME
//   final-climb death and both read it honestly).
//
// THE BOOK LAW: handoffs = rose + attemptOk + died + open.
//
// THE FIELD READ (faces 42+43, hand-traced line by line then
// live-verified): 8 handoffs, book 8/8 - rose 3 (F16 +1, F18 +26,
// F1 +27: the walks took over and two whole attempts finished OK) /
// died 5 (timeout 3 - two under the 90s fence's 'the chain keeps its
// reserve', wet wall 1, low-o2 1) / attemptOk 0 / open 0. THE
// HANDOFF'S PRICE: the ladder's ownership died 5/8 - the claim is
// true at the rose class but the wet levels' ownership is a death
// sentence at the fence (the longHold lane grinds into the 90s
// budget); when the walk delivers, it delivers YARD-SCALE (+26/+27).
// Split: the guards 5 -> rose 2 / died 3; the stalls 3 -> rose 1 /
// died 2. The F3 pair's shared boundary: the attempt-tail collapse.
//
// Pure parser, unit-pinned; decompose is its field read.
// Mining-surface only: zero fleet wiring, zero new log lines.
// Junk-safe end to end: non-string rows skipped, a face with no
// pounce handoffs reads the honest zero.
//

import { POUNCE_GUARD_RE, POUNCE_STALL_RE } from './pouncebook.mjs'
import { CLIMB_OUT_RE } from './climbout.mjs'

// ---- the boundary: the walk delivers ----
// 'F16 [F16] climb: walkable surface at y=63 (+1 levels, dug=0) - the walk takes over (blocked step)'
export const WALKABLE_RISE_RE =
  /^(\S+) \[\1\] climb: walkable surface at y=(-?\d+) \(\+(\d+) levels, dug=(\d+)\) - the walk takes over/

// ---- the boundary: the final climb's own verdict ----
// 'F18 final climb: failed - low-o2' / 'F1 final climb: OK +27 levels (8 steps, 29 dug, 1 traversed, undefineds)'
// ('no retry (...)' and 'the yard stands ...' never match - transparent)
export const FINAL_CLIMB_RE = /^(\S+) final climb: (OK|failed)(?:(?: - | )+(.*))?$/

/**
 * The failed why's class head: 'timeout (fenced at 90s ...)' ->
 * 'timeout', 'wet wall' -> 'wet wall', 'low-o2' -> 'low-o2'.
 * @param {string} why the raw why tail
 * @returns {string} the head before the first paren/bracket detail
 */
export function whyClass (why) {
  const w = String(why ?? '').trim()
  return w.split(' (')[0].split(' [')[0].trim()
}

function zeroBot () {
  return {
    handoffs: 0, guardWet: 0, guardCap: 0, stalls: 0,
    rose: 0, roseLevels: 0, attemptOk: 0, died: 0, open: 0,
    diedWhys: {}
  }
}

/**
 * Read the pounce handoff's aftermath - what the assist ladder's
 * ownership bought. Pure census: joins each pounce handoff forward
 * to the bot's next climb-lane boundary (the ringafter law).
 * @param {string[]} lines one fleet-log, all lines
 * @returns {null|{bots: Object<string,object>, totals: object, rows: object[]}}
 */
export function assistLedger (lines) {
  if (!Array.isArray(lines)) return null
  const bots = {}
  const rows = []
  const pending = [] // { bot, kind, sub, idx }
  const bump = (bot, fn) => {
    const b = bots[bot] || (bots[bot] = zeroBot())
    fn(b)
  }
  const close = (bot, idx, fill) => {
    for (let i = 0; i < pending.length; i++) {
      if (pending[i].bot !== bot) continue
      const h = pending.splice(i, 1)[0]
      i--
      fill(h)
    }
  }
  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx]
    if (typeof line !== 'string') continue
    let m = POUNCE_GUARD_RE.exec(line)
    if (m) {
      const wet = m[2] === 'wet feet'
      bump(m[1], b => { if (wet) b.guardWet++; else b.guardCap++ })
      pending.push({ bot: m[1], kind: 'guard', sub: m[2], idx, line })
      continue
    }
    m = POUNCE_STALL_RE.exec(line)
    if (m) {
      bump(m[1], b => { b.stalls++ })
      pending.push({ bot: m[1], kind: 'stall', sub: null, idx, line })
      continue
    }
    m = WALKABLE_RISE_RE.exec(line)
    if (m) {
      const levels = Number(m[3])
      close(m[1], idx, h => {
        bump(m[1], b => { b.rose++; b.roseLevels += levels })
        rows.push({ ...h, cls: 'rose', levels })
      })
      continue
    }
    m = CLIMB_OUT_RE.exec(line)
    if (m) {
      const tail = String(m[3] ?? '')
      if (/^OK/.test(tail)) {
        close(m[1], idx, h => {
          bump(m[1], b => { b.attemptOk++ })
          rows.push({ ...h, cls: 'attemptOk', detail: tail })
        })
      } else if (/failed/.test(tail)) {
        const why = whyClass(tail.replace(/^.*?failed - /, ''))
        close(m[1], idx, h => {
          bump(m[1], b => { b.died++; b.diedWhys[why] = (b.diedWhys[why] ?? 0) + 1 })
          rows.push({ ...h, cls: 'died', why })
        })
      }
      continue
    }
    m = FINAL_CLIMB_RE.exec(line)
    if (m) {
      if (m[2] === 'OK') {
        close(m[1], idx, h => {
          bump(m[1], b => { b.attemptOk++ })
          rows.push({ ...h, cls: 'attemptOk', detail: String(m[3] ?? '') })
        })
      } else {
        const why = whyClass(String(m[3] ?? ''))
        close(m[1], idx, h => {
          bump(m[1], b => { b.died++; b.diedWhys[why] = (b.diedWhys[why] ?? 0) + 1 })
          rows.push({ ...h, cls: 'died', why })
        })
      }
    }
  }
  // the tail: ownership still unresolved - the honest open
  for (const h of pending) {
    bump(h.bot, b => { b.open++ })
    rows.push({ ...h, cls: 'open' })
  }
  rows.sort((a, b) => a.idx - b.idx)
  // the book law per bot, then the totals
  for (const b of Object.values(bots)) {
    b.handoffs = b.guardWet + b.guardCap + b.stalls
  }
  const totals = zeroTotals()
  for (const b of Object.values(bots)) {
    for (const k of ['handoffs', 'guardWet', 'guardCap', 'stalls', 'rose', 'roseLevels', 'attemptOk', 'died', 'open']) {
      totals[k] += b[k]
    }
    for (const [w, n] of Object.entries(b.diedWhys)) {
      totals.diedWhys[w] = (totals.diedWhys[w] ?? 0) + n
    }
  }
  return { bots, totals, rows }
}

function zeroTotals () {
  const t = zeroBot()
  t.diedWhys = {}
  return t
}
