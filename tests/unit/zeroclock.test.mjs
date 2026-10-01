import test from 'node:test'
import assert from 'node:assert/strict'
import { zeroClockCensus, budgetFloorVerdict } from '../../src/lib/zeroclock.mjs'

// THE ROUND-TRIP LAW: the zero lines are hopcensus's own pinned forms (the
// held face-22/28/29 verbatims), the anchors are opendeaf's own pinned
// field truncations - this lens can never drift from what the fleet prints.

const A = (n, ts, late) => `b] n=${n} ts=${ts}s rss=300M late=5ms mainLate=${late}ms`
const Z = (bot, why, coord) => {
  const d = why === 'beyond-radius' ? '' : ' d=8'
  const tail = {
    'no-path': 'chest unreachable (No path to the goal!)',
    'decide-timeout': 'chest unreachable (Took to long to decide path to goal!)',
    'open-timeout': 'cannot open chest (open chest: timeout after 10000ms)',
    'budget-floor': 'chest unreachable (budget exhausted (walk floor))',
    'walk-timeout': 'chest unreachable (walk to chest (retry): timeout after 28090ms)',
    'nothing-to-deposit': 'nothing to deposit',
    'beyond-radius': 'chest beyond the hop search radius 24 - walking home instead',
  }[why]
  return `${bot} [${bot}] hop: chest at [${coord}]${d} zero: ${tail}`
}

test('thirds classification: the same class lands in all three phases by bracket midpoint', () => {
  // anchors at 20 / 240 / 460 / 700 -> clockEnd 700, thirds 233.3s
  const lines = [
    A(1, 20, 0),
    Z('F6', 'no-path', '-136,72,405'),        // bracket [20..240], mid 130 -> early
    A(2, 240, 0),
    Z('F8', 'no-path', '-123,81,411'),        // bracket [240..460], mid 350 -> mid
    A(3, 460, 0),
    Z('F16', 'no-path', '-123,81,405'),       // bracket [460..700], mid 580 -> late
    A(4, 700, 0),
  ]
  const c = zeroClockCensus(lines)
  assert.equal(c.clockEnd, 700)
  assert.equal(c.thirdS.toFixed(1), '233.3')
  assert.deepEqual(c.byClass['no-path'].byPhase, { early: 1, mid: 1, late: 1, unplaced: 0 })
  assert.deepEqual([c.zeros[0].phase, c.zeros[1].phase, c.zeros[2].phase], ['early', 'mid', 'late'])
})

test('a bracket spanning a third boundary classifies by its midpoint', () => {
  // anchors 200..280 -> bracket width 80s, mid 240 -> just past third 1
  // (clockEnd 700, third 233.3) -> mid
  const lines = [A(1, 200, 0), Z('F6', 'no-path', '-136,72,405'), A(2, 280, 0), A(3, 700, 0)]
  const c = zeroClockCensus(lines)
  assert.equal(c.zeros[0].mid, 240)
  assert.equal(c.zeros[0].phase, 'mid')
  assert.equal(c.wide, 0) // 80s bracket < 233s third
})

test('unplaced is counted, never assumed: before the first anchor and after the last', () => {
  const lines = [
    Z('F6', 'budget-floor', '-136,72,407'),   // no anchor before -> unplaced
    A(1, 40, 0),
    Z('F8', 'budget-floor', '-123,81,403'),   // bracket [40..600], mid 320 -> mid
    A(2, 600, 0),
    Z('F16', 'budget-floor', '-117,81,387'),  // no anchor after -> unplaced
  ]
  const c = zeroClockCensus(lines)
  assert.deepEqual(c.byClass['budget-floor'].byPhase, { early: 0, mid: 1, late: 0, unplaced: 2 })
  assert.equal(c.zeros[0].mid, null)
  assert.equal(c.zeros[2].mid, null)
})

test('the class strings ride hopcensus verbatim - all six held shapes', () => {
  const lines = [
    A(1, 20, 0), A(2, 600, 0),
    Z('F6', 'no-path', '-136,72,405'),
    Z('F8', 'decide-timeout', '-123,81,411'),
    Z('F16', 'open-timeout', '-123,81,403'),
    Z('F7', 'budget-floor', '-117,81,387'),
    Z('F5', 'walk-timeout', '-131,72,407'),
    Z('F9', 'nothing-to-deposit', '-133,68,419'),
  ]
  const c = zeroClockCensus(lines)
  assert.deepEqual(Object.keys(c.byClass).sort(), ['budget-floor', 'decide-timeout', 'no-path', 'nothing-to-deposit', 'open-timeout', 'walk-timeout'])
  assert.equal(c.zeros.length, 6)
  assert.equal(c.zeros[4].why, 'walk-timeout')
})

test('no anchors -> clockEnd null and every zero unplaced', () => {
  const c = zeroClockCensus([Z('F6', 'no-path', '-136,72,405'), Z('F8', 'budget-floor', '-123,81,403')])
  assert.equal(c.clockEnd, null)
  assert.equal(c.thirdS, null)
  assert.equal(c.byClass['no-path'].byPhase.unplaced, 1)
  assert.equal(c.byClass['budget-floor'].byPhase.unplaced, 1)
})

test('a wide bracket (sparse anchors) is counted in `wide` - the reader judges', () => {
  // anchors 20..700 -> bracket 680s wide vs third 233.3s -> wide++
  const lines = [A(1, 20, 0), Z('F6', 'no-path', '-136,72,405'), A(2, 700, 0)]
  const c = zeroClockCensus(lines)
  assert.equal(c.wide, 1)
})

test('honest zeros: a clean face and a non-array never throw', () => {
  const clean = zeroClockCensus(['F9 [F9] bank visit: deposited 12'])
  assert.deepEqual(clean.zeros, [])
  assert.deepEqual(clean.byClass, {})
  assert.deepEqual(budgetFloorVerdict(clean), { verdict: 'none', n: 0 })
  const junk = zeroClockCensus(null)
  assert.equal(junk.clockEnd, null)
})

test('the budget-floor verdict: late dominance = the floor design, mid dominance = the budgets', () => {
  const late = budgetFloorVerdict(zeroClockCensus([
    A(1, 20, 0),
    Z('F6', 'budget-floor', '-136,72,405'),
    A(2, 240, 0), A(3, 460, 0),
    Z('F8', 'budget-floor', '-123,81,411'),
    Z('F16', 'budget-floor', '-123,81,403'),
    A(4, 700, 0),
  ]))
  assert.equal(late.verdict, 'late')
  assert.equal(late.n, 3)

  const mid = budgetFloorVerdict(zeroClockCensus([
    A(1, 20, 0), A(2, 240, 0),
    Z('F6', 'budget-floor', '-136,72,405'),
    Z('F8', 'budget-floor', '-136,72,407'),
    A(3, 460, 0), A(4, 700, 0),
  ]))
  assert.equal(mid.verdict, 'mid')

  const mixed = budgetFloorVerdict(zeroClockCensus([
    A(1, 20, 0), A(2, 240, 0), A(3, 460, 0), A(4, 700, 0),
    Z('F6', 'budget-floor', '-136,72,405'),
    Z('F8', 'budget-floor', '-123,81,411'),
  ]))
  assert.equal(mixed.verdict, 'mixed')
})

test('determinism: the same lines census to the same bytes', () => {
  const lines = [A(1, 20, 0), Z('F6', 'no-path', '-136,72,405'), A(2, 240, 0), Z('F8', 'budget-floor', '-123,81,403'), A(3, 700, 0)]
  assert.equal(JSON.stringify(zeroClockCensus(lines)), JSON.stringify(zeroClockCensus(lines)))
})
