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

import { classifyWalkWhy } from './walkfail.mjs'

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
  if (/^still underground/.test(reason)) return { why: 'underground' }
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
  const zeros = { total: 0, byArm: {}, byWhy: {}, byBot: {} }
  let decide = 0
  if (!Array.isArray(lines)) return { walkBack, zeros, decideTotal: 0 }
  for (const l of lines) {
    const wb = parseBankWalkBack(l)
    if (wb) {
      walkBack.total++
      bump(walkBack.byWhy, wb.why)
      bump(walkBack.byBot, wb.bot)
      walkBack.dists.n++
      walkBack.dists.sum += wb.dist
      if (wb.dist > walkBack.dists.max) walkBack.dists.max = wb.dist
      if (wb.why === 'chest-unreachable-decide-timeout') decide++
      continue
    }
    const bz = parseBankZero(l)
    if (bz) {
      zeros.total++
      bump(zeros.byArm, bz.arm)
      bump(zeros.byWhy, bz.why)
      bump(zeros.byBot, bz.bot)
      if (bz.why === 'chest-unreachable-decide-timeout') decide++
    }
  }
  return { walkBack, zeros, decideTotal: decide }
}
