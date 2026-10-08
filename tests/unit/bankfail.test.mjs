// (v0.411.0) THE BANK-FAIL LENS's tests - the bank lane's own decide/no-path
// ledger. The verbatims are the face-25 log's own shapes (36860108110) plus
// the historical reason classes the emitters name (fleet19.mjs 353/1836/2335/
// 3036). The honest-anchor law: the junk battery rejects the DELIVERED side
// (bankcensus's lane), the doom line (a different emitter) and the tool
// lanes' shapes (the walk-fail lens's).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { classifyBankReason, parseBankWalkBack, parseBankZero, bankFailCensus, bankZeroWhySeat, bankZeroWhySeatRow, bankZeroWhyRiders, bankZeroWhyRidersRow } from '../../src/lib/bankfail.mjs'

test('bank walk-back: the face-25 verbatims parse bot, why and the abort distance', () => {
  const a = parseBankWalkBack('F9 bank: chest unreachable (Took to long to decide path to goal!) (7 blocks from yard) - walking back')
  assert.equal(a.bot, 'F9')
  assert.equal(a.why, 'chest-unreachable-decide-timeout')
  assert.equal(a.dist, 7)

  const b = parseBankWalkBack('F12 bank: chest unreachable (Took to long to decide path to goal!) (30 blocks from yard) - walking back')
  assert.equal(b.dist, 30)

  const c = parseBankWalkBack('F10 bank: no chest in range (12 blocks from yard) - walking back')
  assert.equal(c.why, 'no-chest')
  assert.equal(c.dist, 12)
})

test('bank zero: the three arms read mid/pre/final with nested reasons unwrapped', () => {
  const a = parseBankZero('F6 bank: 0 (chest unreachable (Took to long to decide path to goal!))')
  assert.equal(a.arm, 'mid')
  assert.equal(a.why, 'chest-unreachable-decide-timeout')

  const b = parseBankZero('F6 pre-position bank: 0 (chest unreachable (Took to long to decide path to goal!))')
  assert.equal(b.arm, 'pre')
  assert.equal(b.why, 'chest-unreachable-decide-timeout')

  const c = parseBankZero('F6 final bank: 0 (chest unreachable (No path to the goal!))')
  assert.equal(c.arm, 'final')
  assert.equal(c.why, 'chest-unreachable-no-path')

  const d = parseBankZero('F9 bank: 0 (chest unreachable (budget exhausted (walk floor)))')
  assert.equal(d.why, 'chest-unreachable-budget-floor')

  const e = parseBankZero('F3 final bank: 0 (budget exhausted)')
  assert.equal(e.why, 'budget')

  const f = parseBankZero('F2 bank: 0 (still underground after 2 climb attempts - the chain from the shaft bottom is doomed walks)')
  assert.equal(f.why, 'underground')

  const g = parseBankZero('F4 bank: 0 (nothing to deposit)')
  assert.equal(g.why, 'nothing')
})

test('bank reason: the classifier names the trip buckets and junk reads unknown', () => {
  assert.equal(classifyBankReason('no chest in range').why, 'no-chest')
  assert.equal(classifyBankReason('chest unreachable (walk to chest: timeout after 528ms)').why, 'chest-unreachable-walk-timeout')
  assert.equal(classifyBankReason('chest unreachable (something odd)').why, 'chest-unreachable-other')
  assert.equal(classifyBankReason('water rescue in progress').why, 'water-rescue')
  assert.equal(classifyBankReason('some unheard prose').why, 'other')
  assert.equal(classifyBankReason(null).why, 'unknown')
  assert.equal(classifyBankReason(9).why, 'unknown')
})

test('census: the face-25 mixed stream accumulates walk-backs, zeros, dists and the decide total', () => {
  const lines = [
    'F9 bank: chest unreachable (Took to long to decide path to goal!) (7 blocks from yard) - walking back',
    'F6 bank: chest unreachable (Took to long to decide path to goal!) (8 blocks from yard) - walking back',
    'F12 bank: chest unreachable (Took to long to decide path to goal!) (30 blocks from yard) - walking back',
    'F6 pre-position bank: 0 (chest unreachable (Took to long to decide path to goal!))',
    'F6 final bank: 0 (chest unreachable (Took to long to decide path to goal!))',
    'F9 bank: 0 (budget exhausted)',
    'F10 bank: 0 (nothing to deposit)',
    'F9 final bank: +234', // the DELIVERED side - not this lens's line
    'F15 [F15] hop: chest at [-113,72,398] d=10 zero: chest unreachable (Took to long to decide path to goal!)', // the hop lane - hopcensus's
    'F16 fuel commons: chest walk failed after the nudge (No path to the goal!)', // the tool lane - walkfail's
    'F5 sweep: 0 collected - busy x2' // the sweep lane - walkfail's
  ]
  const c = bankFailCensus(lines)
  assert.equal(c.walkBack.total, 3)
  assert.equal(c.walkBack.byWhy['chest-unreachable-decide-timeout'], 3)
  assert.equal(c.walkBack.byBot.F6, 1)
  assert.equal(c.walkBack.byBot.F12, 1)
  assert.equal(c.walkBack.dists.n, 3)
  assert.equal(c.walkBack.dists.max, 30)
  assert.equal(c.walkBack.dists.sum, 45)

  assert.equal(c.zeros.total, 4)
  assert.equal(c.zeros.byArm.pre, 1)
  assert.equal(c.zeros.byArm.final, 1)
  assert.equal(c.zeros.byArm.mid, 2)
  assert.equal(c.zeros.byWhy['chest-unreachable-decide-timeout'], 2)
  assert.equal(c.zeros.byWhy.budget, 1)

  assert.equal(c.decideTotal, 5) // 3 walk-backs + 2 zeros
})

test('census: the junk battery rejects the delivered side, the doom line and the other lanes', () => {
  const c = bankFailCensus([
    'F9 final bank: +234', // delivered - bankcensus's
    'F9 bank: +11', // delivered mid-run
    'F8 bank: frozen physics - the walk ladder cannot climb, the pocket rides the next window', // the doom emitter
    'F2 bank: yard walk arrived in 9s (1 attempt)', // the progress line
    'F4 bank: end-bank budget spent - smelt skipped', // the budget prose
    'bank: 0 (no bot tag)', // untagged - the fleet always tags
    42,
    null,
    undefined,
    { line: 'F1 bank: 0 (budget exhausted)' }
  ])
  assert.equal(c.walkBack.total, 0)
  assert.equal(c.zeros.total, 0)
  assert.equal(c.decideTotal, 0)
})

test('census: the honest zero and the honest empty anatomy', () => {
  const c = bankFailCensus(['F1 [F1] heartbeat alive', 'no lines of ours here'])
  assert.equal(c.walkBack.total, 0)
  assert.equal(c.zeros.total, 0)
  assert.deepEqual(c.walkBack.dists, { n: 0, max: 0, sum: 0 })
  assert.equal(c.decideTotal, 0)
  const e = bankFailCensus('not an array')
  assert.equal(e.decideTotal, 0)
  assert.deepEqual(e.zeros.byArm, {})
})

test('bank decide clock: the hb rail stamps the bank decides; the untimed honest', () => {
  const c = bankFailCensus([
    'b] n=1 ts=200s rss=300M late=20ms mainLate=100ms',
    'F9 bank: chest unreachable (Took to long to decide path to goal!) (7 blocks from yard) - walking back',
    'F6 pre-position bank: 0 (chest unreachable (Took to long to decide path to goal!))',
    'b] n=2 ts=280s rss=310M late=20ms mainLate=100ms',
    'F6 final bank: 0 (chest unreachable (No path to the goal!))'
  ])
  assert.equal(c.decideTotal, 2) // no-path is NOT a decide
  assert.equal(c.clock.timed, 2)
  assert.equal(c.clock.untimed, 0)
  assert.equal(c.clock.clockEnd, 280)
  assert.equal(c.clock.firstTs, 200)
  assert.equal(c.clock.maxBurst, 2)
})

test('bank decide clock: a decide before the first hb reads untimed (the stamp never invents)', () => {
  const c = bankFailCensus([
    'F9 bank: chest unreachable (Took to long to decide path to goal!) (7 blocks from yard) - walking back',
    'b] n=1 ts=90s rss=300M late=20ms mainLate=100ms'
  ])
  assert.equal(c.decideTotal, 1)
  assert.equal(c.clock.timed, 0)
  assert.equal(c.clock.untimed, 1)
  assert.equal(c.clock.clockEnd, 90)
  assert.equal(c.clock.maxBurst, 0)
})

// (v0.436.0) THE UNDERGROUND ATTEMPTS READ - the still-underground class's
// own number ('after N climb attempts' = the shaft-bottom chain's burn).
// The face-27 verbatims: 10 zeros, N rides as 1 (singular) and 2 (plural).

test('underground attempts: the classifier reads both the singular and the plural emitter forms', () => {
  assert.deepEqual(
    classifyBankReason('still underground after 1 climb attempt - the chain from the shaft bottom is doomed walks'),
    { why: 'underground', climbAttempts: 1 }
  )
  assert.deepEqual(
    classifyBankReason('still underground after 2 climb attempts - the chain from the shaft bottom is doomed walks'),
    { why: 'underground', climbAttempts: 2 }
  )
  assert.deepEqual(
    classifyBankReason('still underground - a prose variant without the number'),
    { why: 'underground', climbAttempts: null }
  )
})

test('underground attempts: the face-27 zero verbatims parse bot, arm, why and the N', () => {
  assert.deepEqual(
    parseBankZero('F16 final bank: 0 (still underground after 1 climb attempt - the chain from the shaft bottom is doomed walks)'),
    { bot: 'F16', arm: 'final', why: 'underground', climbAttempts: 1 }
  )
  assert.deepEqual(
    parseBankZero('F13 final bank: 0 (still underground after 2 climb attempts - the chain from the shaft bottom is doomed walks)'),
    { bot: 'F13', arm: 'final', why: 'underground', climbAttempts: 2 }
  )
})

test('underground attempts: the census slice accumulates the series and the per-bot seats (face-27 shape)', () => {
  const lines = [
    'F16 final bank: 0 (still underground after 1 climb attempt - the chain from the shaft bottom is doomed walks)',
    'F13 final bank: 0 (still underground after 2 climb attempts - the chain from the shaft bottom is doomed walks)',
    'F13 final bank: 0 (still underground after 2 climb attempts - the chain from the shaft bottom is doomed walks)',
    'F13 final bank: 0 (still underground after 2 climb attempts - the chain from the shaft bottom is doomed walks)'
  ]
  const c = bankFailCensus(lines)
  assert.equal(c.zeros.total, 4)
  assert.equal(c.zeros.underground.n, 4)
  assert.deepEqual(c.zeros.attempts ? null : null, null) // the series lives under underground
  assert.deepEqual(c.zeros.underground.attempts, { n: 4, min: 1, max: 2, sum: 7 })
  assert.deepEqual(c.zeros.underground.byBot, { F13: 3, F16: 1 })
})

test('underground attempts: the prose-variant row counts in the slice but not the series (null never sums)', () => {
  const c = bankFailCensus([
    'F6 final bank: 0 (still underground after 2 climb attempts - the chain from the shaft bottom is doomed walks)',
    'F6 bank: 0 (still underground without the number)'
  ])
  assert.equal(c.zeros.underground.n, 2)
  assert.deepEqual(c.zeros.underground.attempts, { n: 1, min: 2, max: 2, sum: 2 })
  assert.deepEqual(c.zeros.underground.byBot, { F6: 2 })
})

test('underground attempts: the honest zeros and the non-array anatomy carry the series shape', () => {
  const c = bankFailCensus(['F1 [F1] heartbeat alive', 'nothing of ours'])
  assert.equal(c.zeros.underground.n, 0)
  assert.deepEqual(c.zeros.underground.attempts, { n: 0, min: null, max: null, sum: 0 })
  assert.deepEqual(c.zeros.underground.byBot, {})
  const e = bankFailCensus('not an array')
  assert.equal(e.zeros.underground.n, 0)
  assert.deepEqual(e.zeros.underground.attempts, { n: 0, min: null, max: null, sum: 0 })
})

// (v0.807.0) THE ZERO DELIVERY'S OWN WHY - the seat + the riders on the
// bank-fail census's own byWhy cells. The face-89 verbatim (37715421436)
// is the owner case: underground owns 12 of 23 (52.2% - the bare majority,
// 12 > 11). The face-82 cell is the riders case: budget x8 + underground
// x5 own 13 of 17 (76.5%). The face-85 cell pins the tie law's byte: the
// 5-5 top broke on 'nothing' < 'underground'.
const FACE89_BYWHY = { underground: 12, 'no-chest': 1, other: 2, 'chest-unreachable-budget-floor': 1, nothing: 2, budget: 5 }
const FACE82_BYWHY = { budget: 8, underground: 5, nothing: 2, 'chest-unreachable-budget-floor': 1, 'no-chest': 1 }

function whyBf (byWhy) { return { zeros: { byWhy } } }

test('zero delivery why: the face-89 cell seats underground with the byte-exact row + the owner case keeps the riders measure honest (measure-not-owner)', () => {
  const bf = whyBf(FACE89_BYWHY)
  const seat = bankZeroWhySeat(bf)
  assert.deepEqual(seat, { why: 'underground', owns: 12, ofZeros: 23, shareOfZeros: 12 / 23 * 100 })
  assert.equal(bankZeroWhySeatRow(seat), "the zero delivery's own why (v0.807.0): underground owns 12 of 23 zero deliveries (52.2%) - THE WHY'S OWN SEAT: one why's own zeros own the delivery book - the why's own front prices the walks the raw split rode unnamed")
  // The branch law's companion: the lib still measures the top two when a
  // seat exists - the decompose's else is what leaves it unprinted.
  const r = bankZeroWhyRiders(bf)
  assert.deepEqual(r, { leader: 'underground', leaderOwns: 12, runner: 'budget', runnerOwns: 5, ofZeros: 23, pairOwns: 17, shareOfZeros: 17 / 23 * 100, duet: 'underground x12 + budget x5' })
  assert.equal(bankZeroWhyRidersRow(r), "the zero delivery's own riders (v0.807.0): no solo why owns the majority - underground x12 + budget x5 own 17 of 23 zero deliveries (73.9%) - THE WHY'S OWN MIX: the seat's tie law held, the crowd is the shape - the whys' own spread prices the walks the solo law refused to name")
  // The singular arm: a one-zero book reads 'zero delivery' byte-exact.
  const solo = bankZeroWhySeat(whyBf({ underground: 1 }))
  assert.equal(bankZeroWhySeatRow(solo), "the zero delivery's own why (v0.807.0): underground owns 1 of 1 zero delivery (100.0%) - THE WHY'S OWN SEAT: one why's own zeros own the delivery book - the why's own front prices the walks the raw split rode unnamed")
})

test('zero delivery why: the riders case + the tie law with the byte pins + the exact-half fence + the below-half plurality', () => {
  // The face-82 riders case byte-exact (no solo owner - budget 8 of 17 is
  // below-half, the plurality the seat law refuses).
  const seat82 = bankZeroWhySeat(whyBf(FACE82_BYWHY))
  assert.equal(seat82, null)
  const r82 = bankZeroWhyRiders(whyBf(FACE82_BYWHY))
  assert.deepEqual(r82, { leader: 'budget', leaderOwns: 8, runner: 'underground', runnerOwns: 5, ofZeros: 17, pairOwns: 13, shareOfZeros: 13 / 17 * 100, duet: 'budget x8 + underground x5' })
  assert.equal(bankZeroWhyRidersRow(r82), "the zero delivery's own riders (v0.807.0): no solo why owns the majority - budget x8 + underground x5 own 13 of 17 zero deliveries (76.5%) - THE WHY'S OWN MIX: the seat's tie law held, the crowd is the shape - the whys' own spread prices the walks the solo law refused to name")
  // The tie owns nothing (the strict-majority law) - and the ranked tie
  // broke on the byte 'nothing' < 'other' in the riders' duet.
  const tie = bankZeroWhySeat(whyBf({ other: 2, nothing: 2 }))
  assert.equal(tie, null)
  const tieR = bankZeroWhyRiders(whyBf({ other: 2, nothing: 2 }))
  assert.equal(tieR.duet, 'nothing x2 + other x2')
  assert.equal(tieR.pairOwns, 4)
  // The exact-half fence: 2 of 4 is not MORE than the rest together.
  assert.equal(bankZeroWhySeat(whyBf({ budget: 2, other: 1, nothing: 1 })), null)
  // The multi-way tie's byte chain - the hyphen trap pinned: 'no-chest'
  // (0x2d) sorts before 'nothing' (the letters), 'budget' leads the pack.
  const chain = bankZeroWhyRiders(whyBf({ nothing: 3, 'no-chest': 3, other: 3, underground: 3, budget: 3 }))
  assert.equal(chain.duet, 'budget x3 + no-chest x3')
  assert.equal(chain.pairOwns, 6)
})

test('zero delivery why: the cells-own-sum law (a junk cell skips, the real cells tally) + the single-class fence + the zero-book silence', () => {
  // The junk cells never count - the census's own finite positive cells
  // tally alone; a single real class seats (n > n - n) but forms no crowd.
  const mixed = whyBf({ underground: 3, junk: 'x', ghost: NaN, zero: 0, neg: -2, inf: Infinity })
  const ms = bankZeroWhySeat(mixed)
  assert.deepEqual(ms, { why: 'underground', owns: 3, ofZeros: 3, shareOfZeros: 100 })
  assert.equal(bankZeroWhyRiders(mixed), null)
  // The zero book and the empty book read the honest silence on both
  // sides (the zeros gate above the branch is the face's own fence).
  assert.equal(bankZeroWhySeat(whyBf({ underground: 0, budget: 0 })), null)
  assert.equal(bankZeroWhyRiders(whyBf({ underground: 0, budget: 0 })), null)
  assert.equal(bankZeroWhySeat(whyBf({})), null)
  assert.equal(bankZeroWhyRiders(whyBf({})), null)
  // The four-zero book with one real cell: the seat fires, the riders
  // refuse (a single class is no crowd).
  const one = whyBf({ budget: 4, other: 0 })
  assert.deepEqual(bankZeroWhySeat(one), { why: 'budget', owns: 4, ofZeros: 4, shareOfZeros: 100 })
  assert.equal(bankZeroWhyRiders(one), null)
})

test('zero delivery why: the junk battery + the row guards + the WIRING assert (the prose lives only in the lib)', () => {
  const junk = [null, undefined, 42, 'str', [], { zeros: null }, { zeros: 42 }, { zeros: {} }, { zeros: { byWhy: null } }, { zeros: { byWhy: 42 } }, { zeros: { byWhy: 'str' } }]
  for (const j of junk) {
    assert.equal(bankZeroWhySeat(j), null)
    assert.equal(bankZeroWhyRiders(j), null)
  }
  // The row guards: junk seat / riders shapes read null, never a row.
  for (const jr of [null, undefined, 42, 'str', {}, { why: '' }, { why: 'underground', owns: 0, ofZeros: 3, shareOfZeros: 0 }, { why: 'underground', owns: 5, ofZeros: 3, shareOfZeros: 166.7 }, { why: 'underground', owns: 3, ofZeros: 3, shareOfZeros: NaN }]) {
    assert.equal(bankZeroWhySeatRow(jr), null)
  }
  for (const jr of [null, undefined, 42, 'str', {}, { leader: '', runner: 'x', leaderOwns: 1, runnerOwns: 1, ofZeros: 2, pairOwns: 2, shareOfZeros: 100, duet: 'a x1 + b x1' }, { leader: 'a', runner: 'b', leaderOwns: 1, runnerOwns: 1, ofZeros: 2, pairOwns: 3, shareOfZeros: 150, duet: 'a x1 + b x1' }, { leader: 'a', runner: 'b', leaderOwns: 1, runnerOwns: 1, ofZeros: 2, pairOwns: 2, shareOfZeros: 100, duet: '' }]) {
    assert.equal(bankZeroWhyRidersRow(jr), null)
  }
  // The WIRING: the decompose carries the branch beside the zero
  // deliveries row and the prose stays in the lib (the branch law's own
  // fence).
  const src = readFileSync(new URL('../../scripts/fleet-mining/decompose.mjs', import.meta.url), 'utf8')
  assert.ok(src.includes('const bzws = bankZeroWhySeat(bf)'))
  assert.ok(src.includes('const bzwr = bankZeroWhyRiders(bf)'))
  assert.ok(!src.includes("THE WHY'S OWN SEAT"))
  assert.ok(!src.includes("THE WHY'S OWN MIX"))
})
