// Tests for the surplus-plank consolidation policy in src/lib/surplus.mjs.
// Planks sit on the deposit KEEP list, so the 26.2 mixed-forest reality (bots chop
// oak, birch, spruce, cherry, ... in one run) left pockets permanently fragmented:
// 5 slots of 5-15 planks each that never add up to a usable stack. This pins WHAT
// converts (everything but a 12-plank dominant buffer) and WHEN it is worth a craft.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PLANK_TYPES, surplusPlan, sticksFromPlanks } from '../../src/lib/surplus.mjs'

const p = (name, count) => ({ name, count })

test('surplusPlan: junk input never crashes and never plans', () => {
  for (const items of [null, undefined, [], [null], [{}], [p('oak_log', 64)], [p('stone', 64)], [p('oak_planks', 0)], [p('oak_planks', -3)], [p('oak_planks', NaN)]]) {
    const plan = surplusPlan({ items })
    assert.deepEqual(plan.convert, [], JSON.stringify(items))
    assert.equal(plan.total, 0)
  }
})

test('surplusPlan: a small single stack stays untouched (below keepDominant)', () => {
  const plan = surplusPlan({ items: [p('oak_planks', 12)] })
  assert.deepEqual(plan.convert, [])
  assert.equal(plan.dominant, 'oak_planks')
})

test('surplusPlan: single big stack burns everything above the 12 buffer', () => {
  const plan = surplusPlan({ items: [p('oak_planks', 40)] })
  assert.deepEqual(plan.convert, [['oak_planks', 28]])
  assert.equal(plan.total, 28)
  assert.equal(plan.dominant, 'oak_planks')
})

test('surplusPlan: fragmentation merges - non-dominant types burn FULLY', () => {
  const items = [p('oak_planks', 6), p('birch_planks', 5), p('spruce_planks', 4)]
  const plan = surplusPlan({ items })
  // oak is dominant (6); keep up to 12 -> keep all 6, burn the others
  assert.deepEqual(plan.convert, [['birch_planks', 5], ['spruce_planks', 4]])
  assert.equal(plan.total, 9)
  assert.equal(plan.dominant, 'oak_planks')
})

test('surplusPlan: dominant keeps exactly keepDominant when it exceeds it', () => {
  const items = [p('oak_planks', 30), p('birch_planks', 10)]
  const plan = surplusPlan({ items })
  assert.deepEqual(plan.convert, [['oak_planks', 18], ['birch_planks', 10]])
  assert.equal(plan.total, 28)
})

test('surplusPlan: a plan worth less than minConvert planks is not worth a craft', () => {
  const plan = surplusPlan({ items: [p('oak_planks', 2), p('birch_planks', 1)] })
  assert.deepEqual(plan.convert, [], 'total burn 3 < minConvert 4')
  assert.equal(plan.total, 0, 'total is zeroed so callers can trust a single field')
  assert.equal(plan.dominant, 'oak_planks', 'dominant is still reported for the log line')
})

test('surplusPlan: minConvert boundary fires at exactly 4 burned planks', () => {
  // burn = non-dominant types + dominant excess above keepDominant(12): here oak
  // keeps its 2, birch 2 + spruce 2 burn -> exactly 4 -> the plan fires
  const plan = surplusPlan({ items: [p('oak_planks', 2), p('birch_planks', 2), p('spruce_planks', 2)] })
  assert.equal(plan.total, 4)
  assert.equal(plan.convert.length, 2)
  // one plank below the boundary: only birch burns (2 < 4) -> no plan
  const below = surplusPlan({ items: [p('oak_planks', 2), p('birch_planks', 2)] })
  assert.deepEqual(below.convert, [])
  assert.equal(below.total, 0, 'total is zeroed so callers can trust a single field')
})

test('surplusPlan: custom keepDominant (0 converts everything, 64 keeps everything)', () => {
  assert.deepEqual(surplusPlan({ items: [p('oak_planks', 20)], keepDominant: 0 }).convert, [['oak_planks', 20]])
  assert.deepEqual(surplusPlan({ items: [p('oak_planks', 20)], keepDominant: 64 }).convert, [])
})

test('surplusPlan: same type split across inventory stacks aggregates first', () => {
  // 4+6+8 = 18 merged into ONE type entry before the dominant rule applies:
  // keep 12, burn 6. (Totals below the 12 buffer burn nothing.)
  const plan = surplusPlan({ items: [p('birch_planks', 4), p('birch_planks', 6), p('birch_planks', 8)] })
  assert.deepEqual(plan.convert, [['birch_planks', 6]])
  assert.equal(plan.total, 6)
  const small = surplusPlan({ items: [p('birch_planks', 4), p('birch_planks', 6)] })
  assert.deepEqual(small.convert, [], '10 < keepDominant 12 - nothing is surplus')
})

test('surplusPlan: duplicate entries of the same type and proto-pollution names are safe', () => {
  assert.equal(surplusPlan({ items: [p('constructor', 64)] }).dominant, null)
  assert.equal(surplusPlan({ items: [p('__proto__', 64)] }).dominant, null)
})

test('sticksFromPlanks: vanilla conversion is 2 planks -> 4 sticks, whole batches only', () => {
  assert.equal(sticksFromPlanks(0), 0)
  assert.equal(sticksFromPlanks(1), 0, 'a lone plank cannot craft')
  assert.equal(sticksFromPlanks(2), 4)
  assert.equal(sticksFromPlanks(3), 4)
  assert.equal(sticksFromPlanks(28), 56)
  assert.equal(sticksFromPlanks(40), 80)
  assert.equal(sticksFromPlanks(NaN), 0)
  assert.equal(sticksFromPlanks(-5), 0)
})

test('PLANK_TYPES covers all 26.2 wood families (log -> planks name check)', () => {
  for (const t of PLANK_TYPES) assert.ok(t.endsWith('_planks'), t)
  assert.equal(PLANK_TYPES.length, 12)
})
