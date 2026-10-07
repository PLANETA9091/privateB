import test from 'node:test'
import assert from 'node:assert/strict'
import { zeroClockCensus, budgetFloorVerdict, noPathClockVerdict } from '../../src/lib/zeroclock.mjs'

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

// (v0.766.0) THE WALK LATTICE'S OWN CLOCK - the v0.760.0 row named the
// walk lattice the hop-bleed's front (face 68: no-path 15/28), never WHEN
// the lattice starves. Face 68's own cell: 13 of 15 no-paths rode the late
// third (early 0 / mid 2) -> LATE dominance; the decide-timeout neighbor
// (0/7/4) is mixed and must not leak into the read.
test('v0.766.0 the walk lattice clock: face 68\'s own cell (no-path LATE-dominant 13 of 15)', () => {
  const lines = [A(1, 20, 0), A(2, 240, 0)]
  for (let i = 0; i < 2; i++) lines.push(Z(`F${10 + i}`, 'no-path', `-123,70,39${i}`)) // 2 mid
  lines.push(A(3, 460, 0))
  for (let i = 0; i < 13; i++) lines.push(Z(`F${1 + i}`, 'no-path', `-12${i % 10},70,39${i % 10}`)) // 13 late
  lines.push(A(4, 700, 0))
  for (let i = 0; i < 11; i++) lines.push(Z(`F${2 + i}`, 'decide-timeout', `-14${i % 10},70,37${i % 10}`)) // the mixed neighbor rides unplaced (no anchors after)
  const c = zeroClockCensus(lines)
  const v = noPathClockVerdict(c)
  assert.equal(v.verdict, 'late')
  assert.equal(v.n, 15)
  assert.deepEqual(v.byPhase, { early: 0, mid: 2, late: 13, unplaced: 0 })
  assert.equal(budgetFloorVerdict(c).verdict, 'none') // the floor's own lane untouched
})

// (v0.766.0) the mid and the early cells - the same 2:1 law at the other
// phases (the machinery's own defect vs the mid-run churn).
test('v0.766.0 the mid and the early dominance cells', () => {
  const mid = [A(1, 20, 0), A(2, 240, 0)]
  for (let i = 0; i < 4; i++) mid.push(Z(`F${1 + i}`, 'no-path', `-13${i},70,40${i}`))
  mid.push(A(3, 460, 0))
  mid.push(Z('F9', 'no-path', '-120,70,400'))
  mid.push(A(4, 700, 0))
  const vm = noPathClockVerdict(zeroClockCensus(mid))
  assert.equal(vm.verdict, 'mid')
  assert.deepEqual(vm.byPhase, { early: 0, mid: 4, late: 1, unplaced: 0 })
  const early = [A(1, 20, 0)]
  for (let i = 0; i < 3; i++) early.push(Z(`F${1 + i}`, 'no-path', `-13${i},70,40${i}`))
  early.push(A(2, 240, 0), A(3, 700, 0))
  const ve = noPathClockVerdict(zeroClockCensus(early))
  assert.equal(ve.verdict, 'early')
  assert.equal(ve.byPhase.early, 3)
})

// (v0.766.0) the honest silences: the mixed spread (no 2:1), the empty or
// absent book, the junk census - no seat invented.
test('v0.766.0 the lattice clock\'s honest silences + junk battery', () => {
  const mixed = [A(1, 20, 0)]
  mixed.push(Z('F1', 'no-path', '-130,70,400'), Z('F2', 'no-path', '-131,70,401'))
  mixed.push(A(2, 240, 0))
  mixed.push(Z('F3', 'no-path', '-132,70,402'), Z('F4', 'no-path', '-133,70,403'))
  mixed.push(A(3, 460, 0))
  mixed.push(Z('F5', 'no-path', '-134,70,404'), Z('F6', 'no-path', '-135,70,405'), Z('F7', 'no-path', '-136,70,406'))
  mixed.push(A(4, 700, 0))
  assert.equal(noPathClockVerdict(zeroClockCensus(mixed)), null) // 2/2/3 over 7 - no dominance
  assert.equal(noPathClockVerdict(null), null)
  assert.equal(noPathClockVerdict({}), null)
  assert.equal(noPathClockVerdict({ byClass: {} }), null)
  assert.equal(noPathClockVerdict({ byClass: { 'no-path': { n: 0, byPhase: { early: 0, mid: 0, late: 0, unplaced: 0 } } } }), null)
})

// (v0.766.0) the WIRING assert: the decompose mine prints the lattice
// clock rows beside the budget-floor verdict (the section's own law - the
// prose lives in the mine, the verdict object in the lib).
test('v0.766.0 the lattice clock rides the decompose mine (WIRING)', async () => {
  const { readFileSync } = await import('node:fs')
  const src = readFileSync(new URL('../../scripts/fleet-mining/decompose.mjs', import.meta.url), 'utf8')
  assert.equal(src.includes('noPathClockVerdict'), true)
  assert.equal(src.includes("the walk lattice's own clock (v0.766.0)"), true)
})
