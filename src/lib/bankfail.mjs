// (v0.411.0) THE BANK-FAIL LENS - the bank lane's own decide/no-path ledger.
// The walk-fail lens (v0.410.0) read the tool lanes' chest walks and the
// smelt sweep's verdicts; the BANK lane - the delivery machinery's heaviest
// walker - stayed unread. Face 25 attempt 2 (36860108110) carried 13 bank
// decide refusals: 10 walk-backs ('bank: chest unreachable (Took to long
// to decide path to goal!) (7 blocks from yard) - walking back' - the bot
// ABANDONS the chest and walks home, a whole trip's opportunity cost),
// 2 mid-run zeros and 1 pre-position + 1 final zero. The A* starvation's
// fleet-wide read is incomplete without this lane.
//
// THE FOUR EMITTERS (verified verbatim in testbed/fleet19.mjs - lines
// 353, 1834/1836, 2335, 3034/3036):
//   F9 bank: chest unreachable (Took to long to decide path to goal!) (7 blocks from yard) - walking back
//   F10 bank: no chest in range (12 blocks from yard) - walking back
//   F6  bank: 0 (chest unreachable (Took to long to decide path to goal!))
//   F6  pre-position bank: 0 (chest unreachable (Took to long to decide path to goal!))
//   F6  final bank: 0 (chest unreachable (No path to the goal!))
//   F9  final bank: +234  (the DELIVERED side - bankcensus's lane, NOT ours)
// The zero reasons can nest ('chest unreachable (budget exhausted (walk
// floor))') and carry the trip's own prose ('still underground after 2
// climb attempts - ...'). The doom line ('bank: ... - the walk ladder
// cannot climb, the pocket rides the next window') is a DIFFERENT emitter
// - out of this lens's scope (one parser per emitter, the v0.409.0 law).
//
// Pure parser, unit-pinned (the walk-fail v0.410.0 shape); decompose is
// its field read. Mining-surface only: zero fleet wiring, zero new log
// lines - the v0.379.0 precedent. Junk-safe end to end: non-string rows
// skipped, absent classes read the honest zero.

import { classifyWalkWhy, decideClock } from './walkfail.mjs'
import { parseHeartbeat } from './stormcensus.mjs'

// The bank reason vocabulary - the wrapper first (the inner why is the
// fleet's shared walk vocabulary), then the trip's own named buckets.
export function classifyBankReason (reason) {
  if (typeof reason !== 'string') return { why: 'unknown' }
  let m = reason.match(/^chest unreachable \((.*)\)$/)
  if (m) {
    const inner = classifyWalkWhy(m[1])
    return { why: inner ? `chest-unreachable-${inner.why}` : 'chest-unreachable-other', ms: inner?.ms }
  }
  if (reason === 'no chest in range') return { why: 'no-chest' }
  if (reason === 'nothing to deposit') return { why: 'nothing' }
  if (/^budget exhausted/.test(reason)) return { why: 'budget' }
  // (v0.436.0) THE UNDERGROUND ATTEMPTS READ - the still-underground class's
  // own number: 'after N climb attempts' is the shaft-bottom chain's burn
  // rate (how many climb attempts the write-off paid). The face-27
  // underground=21 class rides this prose - the N was dropped since v0.411.0
  // while the why alone cannot aim the shaft-bottom cure (a 1-attempt
  // write-off is the chain REFUSING early, a 2-attempt one the ladder
  // FAILING twice). Absent N (a prose variant the emitter changed) reads
  // null - evidence, never invented.
  {
    const ug = reason.match(/^still underground after (\d+) climb attempts?/)
    if (ug) return { why: 'underground', climbAttempts: Number(ug[1]) }
    if (/^still underground/.test(reason)) return { why: 'underground', climbAttempts: null }
  }
  if (/water rescue/.test(reason)) return { why: 'water-rescue' }
  return { why: 'other' }
}

// The walk-back refusal: the bot never reached the chest and pays the walk
// home. The dist from yard prices the abort's cost (a 7-block abort is a
// different disease than a 30-block one).
export const BANK_WALK_BACK_RE = /^(F\d+) bank: (.+) \((\d+) blocks from yard\) - walking back$/

export function parseBankWalkBack (line) {
  if (typeof line !== 'string') return null
  const m = line.match(BANK_WALK_BACK_RE)
  if (!m) return null
  const cls = classifyBankReason(m[2])
  return { bot: m[1], dist: Number(m[3]), ...cls }
}

// The zero-delivery verdicts - the mid-run arm ('bank: 0 (...)'), the
// pre-position arm and the final bank. The reason captures to the LAST ')'
// (the nested wrappers are the field's own shape).
export const BANK_ZERO_RE = /^(F\d+) (pre-position bank|final bank|bank): 0 \((.+)\)$/

export function parseBankZero (line) {
  if (typeof line !== 'string') return null
  const m = line.match(BANK_ZERO_RE)
  if (!m) return null
  const arm = m[2] === 'bank' ? 'mid' : (m[2] === 'pre-position bank' ? 'pre' : 'final')
  const cls = classifyBankReason(m[3])
  return { bot: m[1], arm, ...cls }
}

function bump (map, key, n = 1) {
  if (key == null) return
  map[key] = (map[key] ?? 0) + n
}

export function bankFailCensus (lines) {
  const walkBack = { total: 0, byWhy: {}, byBot: {}, dists: { n: 0, max: 0, sum: 0 } }
  // (v0.436.0) the zeros carry the still-underground slice: the attempts
  // series (the shaft-bottom chain's burn) + per-bot attribution (ONE bot
  // owning the slice is the pinned underground doom - the same seat law the
  // transit pocket and the hot-spot bands read).
  const zeros = {
    total: 0, byArm: {}, byWhy: {}, byBot: {},
    underground: { n: 0, attempts: { n: 0, min: null, max: null, sum: 0 }, byBot: {} }
  }
  let decide = 0
  // (v0.413.0) the decide clock - the walk-fail lens's own rail (the last
  // hb ts stamps every bank decide refusal; the death clock's shape).
  const stamps = []
  let lastT = null
  let clockEnd = null
  if (!Array.isArray(lines)) return { walkBack, zeros, decideTotal: 0, clock: decideClock(stamps, null) }
  for (const l of lines) {
    const hb = parseHeartbeat(l)
    if (hb) { lastT = hb.tsS; clockEnd = hb.tsS }
    const wb = parseBankWalkBack(l)
    if (wb) {
      walkBack.total++
      bump(walkBack.byWhy, wb.why)
      bump(walkBack.byBot, wb.bot)
      walkBack.dists.n++
      walkBack.dists.sum += wb.dist
      if (wb.dist > walkBack.dists.max) walkBack.dists.max = wb.dist
      if (wb.why === 'chest-unreachable-decide-timeout') { decide++; stamps.push(lastT) }
      continue
    }
    const bz = parseBankZero(l)
    if (bz) {
      zeros.total++
      bump(zeros.byArm, bz.arm)
      bump(zeros.byWhy, bz.why)
      bump(zeros.byBot, bz.bot)
      // (v0.436.0) the underground slice - the attempts series rides the
      // row's own number when the emitter printed it.
      if (bz.why === 'underground') {
        zeros.underground.n++
        bump(zeros.underground.byBot, bz.bot)
        const a = bz.climbAttempts
        if (Number.isInteger(a)) {
          zeros.underground.attempts.n++
          zeros.underground.attempts.sum += a
          if (zeros.underground.attempts.min === null || a < zeros.underground.attempts.min) zeros.underground.attempts.min = a
          if (zeros.underground.attempts.max === null || a > zeros.underground.attempts.max) zeros.underground.attempts.max = a
        }
      }
      if (bz.why === 'chest-unreachable-decide-timeout') { decide++; stamps.push(lastT) }
    }
  }
  return { walkBack, zeros, decideTotal: decide, clock: decideClock(stamps, clockEnd) }
}

// (v0.807.0) THE ZERO DELIVERY'S OWN WHY - WHICH why owns the zero-delivery
// book. The zero deliveries row (v0.411.0) prints the byWhy split raw and
// the underground slice (v0.436.0) prices the climb attempts, but no row
// ever said WHICH why's own zeros own the book - the whys' own mix rode
// unnamed while the shaft gate's tax stayed a per-face number (the
// v0.801.0 trip ask seat named the trip lane's side; the delivery side
// rode raw beside it).
//
// The census's own byWhy cells only, zero re-parsing (the v0.802.0 orphan
// seat's own law, the v0.803.0 ask seat's own shape). The book is the
// cells' own sum - a junk cell never counts and the real cells still
// tally (the v0.795.0 honest-skip law). The strict-majority law: the top
// why owns only when it holds MORE than the rest of the book together - a
// tie owns nothing (the v0.784.0 kind-seat's own law). The riders are
// measure-not-owner: the top-two concentration prices the crowd when the
// solo law refuses, and only >= 2 classes form a crowd (the v0.803.0 ask
// seat's own shape). Junk never invents a why: a non-object census or
// byWhy cell, a non-finite or non-positive counter, or a zero book reads
// the honest silence (null). The byte order (lexicographic) decides the
// ranked ties - 'budget' < 'chest-unreachable-*' < 'no-chest' <
// 'nothing' < 'other' < 'underground' < 'water-rescue' (the byte trap:
// the hyphen 0x2d sorts before any letter).
function bankZeroWhyTally (bf) {
  if (!bf || typeof bf !== 'object') return null
  const z = bf.zeros
  if (!z || typeof z !== 'object') return null
  const byWhy = z.byWhy
  if (!byWhy || typeof byWhy !== 'object') return null
  const cells = []
  for (const [why, n] of Object.entries(byWhy)) {
    if (Number.isFinite(n) && n > 0) cells.push([why, n])
  }
  if (cells.length === 0) return null
  const total = cells.reduce((s, [, n]) => s + n, 0)
  if (!(total > 0)) return null
  cells.sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
  return { cells, total }
}

// The why's own seat - the strict-majority owner of the zero-delivery
// book, or null when no why holds more than the rest together (v0.807.0).
export function bankZeroWhySeat (bf) {
  const t = bankZeroWhyTally(bf)
  if (!t) return null
  const [why, topN] = t.cells[0]
  if (topN > t.total - topN) {
    return { why, owns: topN, ofZeros: t.total, shareOfZeros: topN / t.total * 100 }
  }
  return null
}

// The seat row - the byte-exact read the decompose prints beside the zero
// deliveries row (the branch law: the owner case leaves the companion
// unprinted). Guarded end to end; junk reads null (v0.807.0).
export function bankZeroWhySeatRow (seat) {
  if (!seat || typeof seat !== 'object') return null
  const { why, owns, ofZeros, shareOfZeros } = seat
  if (typeof why !== 'string' || why === '') return null
  if (!Number.isFinite(owns) || owns <= 0) return null
  if (!Number.isFinite(ofZeros) || ofZeros <= 0) return null
  if (owns > ofZeros) return null
  if (!Number.isFinite(shareOfZeros)) return null
  const s = ofZeros === 1 ? 'zero delivery' : 'zero deliveries'
  return `the zero delivery's own why (v0.807.0): ${why} owns ${owns} of ${ofZeros} ${s} (${shareOfZeros.toFixed(1)}%) - THE WHY'S OWN SEAT: one why's own zeros own the delivery book - the why's own front prices the walks the raw split rode unnamed`
}

// The why's own riders - the top-two concentration when the solo law
// refuses to seat (measure-not-owner; a single class is no crowd and
// reads null, v0.807.0).
export function bankZeroWhyRiders (bf) {
  const t = bankZeroWhyTally(bf)
  if (!t || t.cells.length < 2) return null
  const [leader, leaderOwns] = t.cells[0]
  const [runner, runnerOwns] = t.cells[1]
  const pairOwns = leaderOwns + runnerOwns
  return {
    leader, leaderOwns, runner, runnerOwns,
    ofZeros: t.total, pairOwns,
    shareOfZeros: pairOwns / t.total * 100,
    duet: `${leader} x${leaderOwns} + ${runner} x${runnerOwns}`
  }
}

// The riders row - the byte-exact read for the no-owner faces (v0.807.0).
export function bankZeroWhyRidersRow (r) {
  if (!r || typeof r !== 'object') return null
  const { leader, leaderOwns, runner, runnerOwns, ofZeros, pairOwns, shareOfZeros, duet } = r
  if (typeof leader !== 'string' || leader === '') return null
  if (typeof runner !== 'string' || runner === '') return null
  if (!Number.isFinite(leaderOwns) || leaderOwns <= 0) return null
  if (!Number.isFinite(runnerOwns) || runnerOwns <= 0) return null
  if (!Number.isFinite(ofZeros) || ofZeros <= 0) return null
  if (!Number.isFinite(pairOwns) || pairOwns <= 0) return null
  if (pairOwns > ofZeros) return null
  if (typeof duet !== 'string' || duet === '') return null
  if (!Number.isFinite(shareOfZeros)) return null
  const s = ofZeros === 1 ? 'zero delivery' : 'zero deliveries'
  return `the zero delivery's own riders (v0.807.0): no solo why owns the majority - ${duet} own ${pairOwns} of ${ofZeros} ${s} (${shareOfZeros.toFixed(1)}%) - THE WHY'S OWN MIX: the seat's tie law held, the crowd is the shape - the whys' own spread prices the walks the solo law refused to name`
}
