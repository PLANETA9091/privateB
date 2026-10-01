// (v0.410.0) THE WALK-FAIL LENS's tests - the tool-lane chest walks' and
// the sweep verdicts' field read. The verbatims are the face-25 log's own
// shapes (36860108110) - the honest-anchor law: the census is anchored to
// the REAL emitters (toolupgrade/fuelbank/smelting), the junk battery
// rejects the near-misses and the hop lane's own shape (the hop-zero
// census owns that lane - one parser per lane, the v0.409.0 split law).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classifyWalkWhy, parseWalkFail, parseSweepVerdict, classifySweepReason, walkFailCensus } from '../../src/lib/walkfail.mjs'

test('walk-fail: the face-25 tool-lane verbatims parse with lane, nudge and bot', () => {
  const a = parseWalkFail('F7 fuel commons: chest walk failed after the nudge (Took to long to decide path to goal!)')
  assert.equal(a.bot, 'F7')
  assert.equal(a.lane, 'fuel commons')
  assert.equal(a.nudge, true)
  assert.equal(a.why, 'decide-timeout')

  const b = parseWalkFail('F13 iron commune: chest walk failed (Took to long to decide path to goal!)')
  assert.equal(b.lane, 'iron commune')
  assert.equal(b.nudge, false)
  assert.equal(b.why, 'decide-timeout')

  // the DOUBLED-tag variant is the field's own shape (face 25 line 594)
  const c = parseWalkFail('F14 iron commune: iron commune: chest walk failed after the nudge (No path to the goal!)')
  assert.equal(c.bot, 'F14')
  assert.equal(c.lane, 'iron commune')
  assert.equal(c.nudge, true)
  assert.equal(c.why, 'no-path')
})

test('walk-fail: the lane walk timeout captures ms; the bare emitter form reads lane bare', () => {
  const a = parseWalkFail('F7 iron commune: chest walk failed (iron commune walk @-118,404: timeout after 528ms)')
  assert.equal(a.why, 'walk-timeout')
  assert.equal(a.ms, 528)
  assert.equal(a.lane, 'iron commune')

  const bare = parseWalkFail('F4 chest walk failed (No path to the goal!)')
  assert.equal(bare.bot, 'F4')
  assert.equal(bare.lane, 'bare')
  assert.equal(bare.why, 'no-path')
})

test('walk-fail: classifyWalkWhy orders most-specific-first and junk reads other', () => {
  assert.equal(classifyWalkWhy('Took to long to decide path to goal!').why, 'decide-timeout')
  assert.equal(classifyWalkWhy('No path to the goal!').why, 'no-path')
  assert.equal(classifyWalkWhy('walk to a machine (sweep): timeout after 2623ms').why, 'walk-timeout')
  assert.equal(classifyWalkWhy('walk governor: bot churned 4 goals without progress - refused for 12s').why, 'governor-refusal')
  assert.equal(classifyWalkWhy('The goal was changed mid-walk').why, 'goal-churn')
  assert.equal(classifyWalkWhy('budget exhausted (walk floor)').why, 'budget-floor')
  assert.equal(classifyWalkWhy('something unheard of').why, 'other')
  assert.equal(classifyWalkWhy(42), null)
})

test('sweep verdict: the face-25 histogram verbatim parses both pairs with counts', () => {
  const v = parseSweepVerdict('F13 sweep: 0 collected - machine unreachable (Took to long to decide path to goal!) x6, machine unreachable (walk to a machine (sweep): timeout after 17ms) x1')
  assert.equal(v.bot, 'F13')
  assert.equal(v.pairs.length, 2)
  assert.equal(v.pairs[0].n, 6)
  assert.equal(v.pairs[1].n, 1)
  assert.deepEqual(v.junk, [])
})

test('sweep verdict: the governor prose and the defer bucket survive the pair walk', () => {
  const v = parseSweepVerdict('F5 sweep: 0 collected - machine unreachable (Took to long to decide path to goal!) x2, machine unreachable (walk governor: bot churned 4 goals without progress - walk to a machine (sweep) refused for 12s) x1, sweep deferred (the lanes hold) x1')
  assert.equal(v.pairs.length, 3)
  assert.equal(v.pairs[1].reason, 'machine unreachable (walk governor: bot churned 4 goals without progress - walk to a machine (sweep) refused for 12s)')
  assert.equal(v.pairs[2].reason, 'sweep deferred (the lanes hold)')
})

test('sweep verdict: a reason carrying a comma survives the accumulation (junk tail honest)', () => {
  const v = parseSweepVerdict('F9 sweep: 0 collected - machine unreachable (a, b reason) x2')
  assert.equal(v.pairs.length, 1)
  assert.equal(v.pairs[0].reason, 'machine unreachable (a, b reason)')
  assert.equal(v.pairs[0].n, 2)

  const j = parseSweepVerdict('F9 sweep: 0 collected - some tail without a count')
  assert.equal(j.pairs.length, 0)
  assert.equal(j.junk.length, 1)
})

test('sweep reason: the wrapper classes name themselves; busy/deferred/unknown buckets', () => {
  assert.equal(classifySweepReason('busy').why, 'busy')
  assert.equal(classifySweepReason('sweep deferred (the lanes hold)').why, 'deferred')
  assert.equal(classifySweepReason('machine unreachable (Took to long to decide path to goal!)').why, 'machine-unreachable-decide-timeout')
  assert.equal(classifySweepReason('machine unreachable (walk to a machine (sweep): timeout after 17ms)').why, 'machine-unreachable-walk-timeout')
  assert.equal(classifySweepReason('machine unreachable (something odd)').why, 'machine-unreachable-other')
  assert.equal(classifySweepReason('unknown').why, 'unknown')
  assert.equal(classifySweepReason(7).why, 'unknown')
})

test('census: the face-25 mixed stream accumulates lanes, whys and the A* starvation total', () => {
  const lines = [
    'F7 fuel commons: chest walk failed after the nudge (Took to long to decide path to goal!)',
    'F13 iron commune: chest walk failed (Took to long to decide path to goal!)',
    'F14 iron commune: iron commune: chest walk failed after the nudge (No path to the goal!)',
    'F7 iron commune: chest walk failed (iron commune walk @-118,404: timeout after 528ms)',
    'F13 sweep: 0 collected - machine unreachable (Took to long to decide path to goal!) x6, machine unreachable (walk to a machine (sweep): timeout after 17ms) x1',
    'F13 sweep: 0 collected - machine unreachable (No path to the goal!) x6, machine unreachable (walk to a machine (sweep): timeout after 460ms) x1',
    'F5 sweep: 0 collected (no machines in reach)' // the zero-harvest shape WITHOUT a histogram - not this lens's line
  ]
  const c = walkFailCensus(lines)
  assert.equal(c.walk.total, 4)
  assert.equal(c.walk.nudge, 2)
  assert.equal(c.walk.byLane['fuel commons'], 1)
  assert.equal(c.walk.byLane['iron commune'], 3)
  assert.equal(c.walk.byWhy['decide-timeout'], 2)
  assert.equal(c.walk.byWhy['no-path'], 1)
  assert.equal(c.walk.byBot.F7, 2)
  assert.deepEqual(c.walk.timeouts, [528])

  assert.equal(c.sweep.lines, 2)
  assert.equal(c.sweep.machinesUnreachable, 14)
  assert.equal(c.sweep.byWhy['machine-unreachable-decide-timeout'], 6)
  assert.equal(c.sweep.byWhy['machine-unreachable-no-path'], 6)
  assert.equal(c.sweep.byWhy['machine-unreachable-walk-timeout'], 2)
  assert.deepEqual(c.sweep.timeouts, [17, 460])
  assert.equal(c.sweep.busy, 0)

  // the fleet-wide A* starvation read: the walk-fail decides + the sweep's
  // machine-unreachable decides (the hop lane's own 42 ride the hop census)
  assert.equal(c.decideTotal, 2 + 6)
})

test('census: the junk battery rejects the hop lane, the harvest shape and the near-misses', () => {
  const c = walkFailCensus([
    'F15 [F15] hop: chest at [-113,72,398] d=10 zero: chest unreachable (Took to long to decide path to goal!)', // the hop lane - hopcensus's
    'F9 sweep: collected 7 (iron_ore:7)', // the positive harvest shape
    'F9 sweep: 0 collected (2 idle-empty machines)', // the idle-empty shape - no histogram
    'chest walk failed (no bot tag)', // the untagged tool-lane line - the fleet always tags; junk here
    'F2 chest walk succeeds (No path to the goal!)', // near-miss verb
    42,
    null,
    undefined,
    { line: 'F1 sweep: 0 collected - busy x1' }
  ])
  assert.equal(c.walk.total, 0)
  assert.equal(c.sweep.lines, 0)
  assert.equal(c.decideTotal, 0)
})

test('census: the honest zero and the honest empty anatomy', () => {
  const c = walkFailCensus(['F1 [F1] heartbeat alive', 'no lines of ours here'])
  assert.equal(c.walk.total, 0)
  assert.equal(c.walk.nudge, 0)
  assert.deepEqual(c.walk.timeouts, [])
  assert.equal(c.sweep.lines, 0)
  assert.equal(c.sweep.machinesUnreachable, 0)
  assert.equal(c.decideTotal, 0)
  const e = walkFailCensus('not an array')
  assert.equal(e.decideTotal, 0)
  assert.deepEqual(e.walk.byWhy, {})
})
