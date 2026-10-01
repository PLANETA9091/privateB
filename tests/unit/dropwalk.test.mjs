// (v0.412.0) THE DROP-WALK LENS's tests - the vein sweep's per-fail drop-walk
// line. The verbatims are the face-26 log's own shapes (36864564525) plus the
// run68-era 4000ms form (the budget's evolution is data, not a constant) and
// the unit-test-pinned no-spot doomed form. The junk battery rejects the
// aggregate ledger row (drops.mjs's own counter), the smelt sweep verdict
// (walkfail.mjs's lane) and the prose lines - one parser per emitter, the
// v0.409.0 split law.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DROP_WALK_FAIL_RE, classifyDropFailWhy, parseDropWalkFail, dropWalkCensus } from '../../src/lib/dropwalk.mjs'

test('drop-walk: the face-26 timeout verbatim parses bot, spot, ms, dy, range', () => {
  const a = parseDropWalkFail('F7 [F7] vein sweep: the drop walk to [-136,46,414] failed - sweep drops: timeout after 8000ms (dy 3.0, range 2)')
  assert.equal(a.bot, 'F7')
  assert.deepEqual([a.x, a.y, a.z], [-136, 46, 414])
  assert.equal(a.why, 'timeout')
  assert.equal(a.timeoutMs, 8000)
  assert.equal(a.dy, 3.0)
  assert.equal(a.range, 2)

  // the run68-era form carried the OLD 4000ms budget - the field is read,
  // never the constant (v0.288.0 moved the emitter's own value)
  const b = parseDropWalkFail('F2 [F2] vein sweep: the drop walk to [-125,45,411] failed - sweep drops: timeout after 4000ms (dy 2.2, range 2)')
  assert.equal(b.timeoutMs, 4000)
  assert.equal(b.dy, 2.2)

  // range 1 with a negative dy - the below family on the tight goal
  const c = parseDropWalkFail('F2 [F2] vein sweep: the drop walk to [-129,42,408] failed - sweep drops: timeout after 4000ms (dy -0.4, range 1)')
  assert.equal(c.range, 1)
  assert.equal(c.dy, -0.4)
})

test('drop-walk: the doomed-goal form captures the age and the optional spot', () => {
  const a = parseDropWalkFail('F9 [F9] vein sweep: the drop walk to [-142,56,420] failed - doomed goal (ledgered 44s ago at [-143,56,419]) - sweep drops refused (dy -2.0, range 2)')
  assert.equal(a.bot, 'F9')
  assert.equal(a.why, 'doomed')
  assert.equal(a.doomedAgeS, 44)
  assert.deepEqual(a.doomedSpot, { x: -143, y: 56, z: 419 })

  // the no-spot variant (the unit-pinned shape - a young doom has no spot yet)
  const b = parseDropWalkFail('F14 [F14] vein sweep: the drop walk to [-136,47,415] failed - doomed goal (ledgered 5s ago) - sweep drops refused (dy -1.0, range 2)')
  assert.equal(b.why, 'doomed')
  assert.equal(b.doomedAgeS, 5)
  assert.equal(b.doomedSpot, null)
})

test('drop-walk: the fleet-goal-ceiling form captures goals, window and the refusal seconds', () => {
  const a = parseDropWalkFail('F5 [F5] vein sweep: the drop walk to [-113,41,430] failed - fleet goal ceiling: 30 goals fleet-wide in 5s - sweep drops refused for 14s (dy -2.0, range 2)')
  assert.equal(a.bot, 'F5')
  assert.equal(a.why, 'ceiling')
  assert.equal(a.ceilingGoals, 30)
  assert.equal(a.ceilingWindowS, 5)
  assert.equal(a.refusedS, 14)
})

test('drop-walk: the classifier battery - the unknown verdict stays honest as other', () => {
  assert.equal(classifyDropFailWhy('sweep drops: timeout after 8000ms').why, 'timeout')
  assert.equal(classifyDropFailWhy('doomed goal (ledgered 7s ago) - sweep drops refused').why, 'doomed')
  assert.equal(classifyDropFailWhy('fleet goal ceiling: 30 goals fleet-wide in 5s - sweep drops refused for 4s').why, 'ceiling')
  // the water-rescue form is the field's fourth shape (face 26 line 1874) -
  // the bot's own rescue holds the controls, the drop walks ride it out
  assert.equal(classifyDropFailWhy('water rescue in progress (sweep drops refused)').why, 'water-rescue')
  // the bare no-path verdict is the field's fifth shape (face 27, F17 r1)
  assert.equal(classifyDropFailWhy('No path to the goal!').why, 'no-path')
  const o = classifyDropFailWhy('some future verdict the walk layer invented')
  assert.equal(o.why, 'other')
  assert.equal(classifyDropFailWhy(null).why, 'other')
  assert.equal(classifyDropFailWhy(undefined).why, 'other')
  assert.equal(classifyDropFailWhy(42).why, 'other')
})

test('drop-walk: the regex rejects the tail-less and the malformed lines', () => {
  assert.equal(DROP_WALK_FAIL_RE.test('F14 [F14] vein sweep: the drop walk to [-136,47,415] failed - doomed goal (ledgered 5s ago) - sweep drops refused'), false)
  assert.equal(DROP_WALK_FAIL_RE.test('F7 vein sweep: the drop walk to [-136,46,414] failed - sweep drops: timeout after 8000ms (dy 3.0, range 2)'), false)
  assert.equal(DROP_WALK_FAIL_RE.test('vein sweep: 2 drop(s) in reach (2 dug)'), false)
  assert.equal(parseDropWalkFail('F7 [F7] vein sweep: the drop walk to [x,y,z] failed - sweep drops: timeout after 8000ms (dy 3.0, range 2)'), null)
  assert.equal(parseDropWalkFail(null), null)
  assert.equal(parseDropWalkFail(1234), null)
})

test('drop-walk: the junk battery - the sibling lanes and the prose stay out', () => {
  assert.equal(parseDropWalkFail('sweep drop ledger: sweeps=14 picked=66u failed=29 (below x12, plane x4, above x13) deepSkip=16 lipDig=0 supportDig=0 seal1=0 seal2=0 seal3=6 near=2 far=4 cut=0 nthick=0 nthin=0 ngap=2 step=0 stepcut=0 above1=5 aboveHigh=8'), null)
  assert.equal(parseDropWalkFail('F5 sweep: 0 collected - machine unreachable (walk to a machine (sweep): timeout after 4659ms) x1'), null)
  assert.equal(parseDropWalkFail('F7 [F7] vein sweep: +2u walked from the drops (2 dug)'), null)
  assert.equal(parseDropWalkFail('F7 [F7] vein sweep: the drop walk to [-136,46,414] failed - sweep drops: timeout after 8000ms (dy 3.0, range 2) and prose rode along'), null)
  assert.equal(parseDropWalkFail('F9 bank: chest unreachable (Took to long to decide path to goal!) (7 blocks from yard) - walking back'), null)
  assert.equal(parseDropWalkFail('F8 [F8] hop: chest at [-118,65,412] d=17 zero: chest unreachable (walk to chest (retry): timeout after 30000ms)'), null)
})

test('census: the accumulation over a mixed stream sums bots, whys, timeouts, dy families', () => {
  const lines = [
    'F7 [F7] vein sweep: the drop walk to [-136,46,414] failed - sweep drops: timeout after 8000ms (dy 3.0, range 2)',
    'F7 [F7] vein sweep: the drop walk to [-136,47,415] failed - sweep drops: timeout after 8000ms (dy 4.4, range 2)',
    'F10 [F10] vein sweep: the drop walk to [-125,45,412] failed - sweep drops: timeout after 8000ms (dy 2.0, range 2)',
    'F9 [F9] vein sweep: the drop walk to [-142,56,420] failed - doomed goal (ledgered 44s ago at [-143,56,419]) - sweep drops refused (dy -2.0, range 2)',
    'F5 [F5] vein sweep: the drop walk to [-113,41,430] failed - fleet goal ceiling: 30 goals fleet-wide in 5s - sweep drops refused for 14s (dy -2.0, range 2)',
    'F2 [F2] vein sweep: the drop walk to [-129,42,408] failed - sweep drops: timeout after 4000ms (dy -0.4, range 1)'
  ]
  const c = dropWalkCensus(lines)
  assert.equal(c.fails, 6)
  assert.deepEqual(c.byBot, { F7: 2, F10: 1, F9: 1, F5: 1, F2: 1 })
  assert.deepEqual(c.byWhy, { timeout: 4, doomed: 1, ceiling: 1 })
  assert.deepEqual(c.timeouts, { n: 4, maxMs: 8000, sumMs: 28000 })
  assert.deepEqual([c.doomed.n, c.doomed.maxAgeS, c.doomed.withSpot], [1, 44, 1])
  assert.deepEqual([c.ceiling.n, c.ceiling.maxGoals, c.ceiling.maxRefusedS], [1, 30, 14])
  assert.equal(c.dy.min, -2.0)
  assert.equal(c.dy.max, 4.4)
  assert.deepEqual([c.dy.below, c.dy.plane, c.dy.above], [3, 0, 3])
  assert.deepEqual(c.range, { 2: 5, 1: 1 })
  assert.equal(c.unparsed, 0)
})

test('census: the unknown verdict counts in fails and byWhy other - never dropped', () => {
  const c = dropWalkCensus([
    'F3 [F3] vein sweep: the drop walk to [-100,40,400] failed - some future verdict (dy 0.0, range 2)'
  ])
  assert.equal(c.fails, 1)
  assert.deepEqual(c.byWhy, { other: 1 })
  assert.equal(c.dy.plane, 1)
  assert.equal(c.timeouts.n, 0)
})

test('census: the unparsed escape hatch - a built-for line whose shape escaped', () => {
  const c = dropWalkCensus([
    'F8 [F8] vein sweep: the drop walk to [-110,41,448] failed - sweep drops: timeout after 8000ms without the dy tail',
    'F1 [F1] vein sweep: 3 drop(s) in reach (3 dug)'
  ])
  assert.equal(c.fails, 0)
  assert.equal(c.unparsed, 1)
})

test('census: the honest zeros and the honest empty anatomy', () => {
  const c = dropWalkCensus(['F1 [F1] heartbeat alive', 'calm face - no drop walks died here'])
  assert.equal(c.fails, 0)
  assert.deepEqual(c.byBot, {})
  assert.deepEqual(c.byWhy, {})
  assert.deepEqual(c.timeouts, { n: 0, maxMs: 0, sumMs: 0 })
  assert.deepEqual([c.doomed.n, c.doomed.withSpot], [0, 0])
  assert.deepEqual([c.ceiling.n, c.ceiling.maxGoals], [0, 0])
  assert.equal(c.dy.min, null)
  assert.equal(c.dy.max, null)
  assert.deepEqual([c.dy.below, c.dy.plane, c.dy.above], [0, 0, 0])
  assert.deepEqual(c.range, {})
  assert.equal(c.unparsed, 0)
  const e = dropWalkCensus('not an array')
  assert.equal(e.fails, 0)
  assert.deepEqual(e.range, {})
})
