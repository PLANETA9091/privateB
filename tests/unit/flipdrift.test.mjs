import { test } from 'node:test'
import assert from 'node:assert/strict'
import { flipDrift } from '../../src/lib/flipdrift.mjs'
import { verdictExecution } from '../../src/lib/verdictflip.mjs'

// Face 43's live shapes verbatim (run 36970605824) - the two executed
// flips and the machinery prose their world drifted across.
const face43Mini = [
  // F17's flip - the machinery prose follows, the flee closes it
  'F17 [F17] combat: verdict flipped to flee vs spider (hp 8.3)',
  'F17 [F17] combat: shelter try vs spider (dist 1.2, sentry re-verdict)',
  'F17 [F17] combat: shelter wall miss (open field: no diggable wall, ring next, spider@1.2)',
  // F19's flip - closed by the fight lane (STOOD, never a join)
  'F19 [F19] combat: verdict flipped to flee vs spider (hp 18.7)',
  'F19 [F19] combat: pair preempt (flip) vs spider (hp 18.7, 2 in reach) - the pair trade is never taken',
  'F19 [F19] combat: fight ended vs spider (mob down, hp 18.0 -> 17.0, swings 4, weapon wooden_sword, 4 rounds)',
  // F11's flip - the shelter lane took over (SHELTERED, never a join)
  'F11 [F11] combat: verdict flipped to flee vs creeper (hp 20.0)',
  'F11 [F11] combat: sheltering from creeper (ring 8/8, proximity re-verdict)',
  // F5's flip - the open-field yield rides the episode (prose, never closes);
  // the flee closes it with a DIFFERENT threat and a drained hp
  'F5 [F5] combat: verdict flipped to flee vs spider (hp 11.0)',
  'F5 [F5] combat: open-field yield vs spider (hp 11.0 < 14 in the dark) - the flee fired before the drain',
  'F17 [F17] combat: fleeing spider (dist 4.0, hp 8.3, 2 nearby, proximity)',
  'F5 [F5] combat: fleeing zombie_villager (dist 4.8, hp 2.0, 1 nearby, proximity)',
  // F5's death AFTER its episode closed - must not steal a join
  'F5 [F5] died - respawning (cause: server: was slain by Zombie Villager [kind=mob by Zombie] | inferred: zombie_villager@0.7 (0s before death at [-152,65,407]) [the inference CONTRADICTS the server verdict])'
]

test('flipDrift reads face 43 verbatim: both executions priced, one instant one drifted', () => {
  const r = flipDrift(face43Mini)
  assert.equal(r.flips, 4)
  assert.equal(r.fled, 2)
  assert.equal(r.fledJoins, 2)
  assert.equal(r.unpricedFled, 0)
  // F17 - THE INSTANT EXECUTION: same mob, the hp untouched
  const f17 = r.rows.find(x => x.bot === 'F17')
  assert.deepEqual(
    { flipMob: f17.flipMob, execMob: f17.execMob, flipHp: f17.flipHp, execHp: f17.execHp, mobChanged: f17.mobChanged, hpDelta: f17.hpDelta },
    { flipMob: 'spider', execMob: 'spider', flipHp: 8.3, execHp: 8.3, mobChanged: false, hpDelta: 0 }
  )
  // F5 - THE DRIFTED EXECUTION: the threat AND the hp both moved
  const f5 = r.rows.find(x => x.bot === 'F5')
  assert.deepEqual(
    { flipMob: f5.flipMob, execMob: f5.execMob, flipHp: f5.flipHp, execHp: f5.execHp, mobChanged: f5.mobChanged, hpDelta: f5.hpDelta },
    { flipMob: 'spider', execMob: 'zombie_villager', flipHp: 11, execHp: 2, mobChanged: true, hpDelta: -9 }
  )
  // the book: fled = joins + unpriced
  assert.equal(r.fled, r.fledJoins + r.unpricedFled)
})

test('flipDrift prices the drift classes and the hp spread on face 43', () => {
  const r = flipDrift(face43Mini)
  assert.equal(r.mobSame, 1)
  assert.equal(r.mobChanged, 1)
  assert.equal(r.hpLost, 1)
  assert.deepEqual(r.hpDelta, { min: -9, median: -4.5, max: 0 })
})

test('flipDrift prices the prose window the world drifted across', () => {
  const r = flipDrift(face43Mini)
  // F17: flip at idx 0, flee at idx 10; F5: flip at idx 8, flee at idx 11
  const f17 = r.rows.find(x => x.bot === 'F17')
  const f5 = r.rows.find(x => x.bot === 'F5')
  assert.equal(f17.driftWindow, 10)
  assert.equal(f5.driftWindow, 3)
  assert.deepEqual(r.window, { min: 3, median: 6.5, max: 10 })
})

test('flipDrift on the live face-43 anchor lines: the instant execution repeats', () => {
  // the log's own prose window (flip @2907 -> flee @2983, 1-based) prices
  // 76 lines; this anchor fixture rides the same shapes with the prose
  // trimmed to the boundary lines the join needs
  const r = flipDrift(LIVE43)
  assert.equal(r.flips, 1)
  assert.equal(r.fledJoins, 1)
  assert.equal(r.unpricedFled, 0)
  const f17 = r.rows[0]
  assert.equal(f17.mobChanged, false)
  assert.equal(f17.hpDelta, 0)
  assert.equal(f17.driftWindow, 6) // the trimmed fixture's own indices
})

test('flipDrift on the live face-42 anchor lines: the shield takeover, no drift', () => {
  const r = flipDrift(LIVE42)
  assert.equal(r.flips, 2)
  assert.equal(r.fled, 0)
  assert.equal(r.fledJoins, 0)
  assert.equal(r.unpricedFled, 0)
  assert.equal(r.hpDelta, null)
  assert.equal(r.window, null)
  assert.deepEqual(r.rows, [])
})

test('flipDrift names the truncation-blind flight unpriced', () => {
  // the close verb was 'fleeing' but the start line's own skin never
  // landed (no 'N nearby' field) - the execution stays unpriced
  const r = flipDrift([
    'F9 [F9] combat: verdict flipped to flee vs zombie (hp 6.0)',
    'F9 [F9] combat: fleeing zombie (dist 3, hp 5, proximity)'
  ])
  assert.equal(r.flips, 1)
  assert.equal(r.fled, 1)
  assert.equal(r.fledJoins, 0)
  assert.equal(r.unpricedFled, 1)
  assert.equal(r.fled, r.fledJoins + r.unpricedFled)
  assert.equal(r.hpDelta, null)
})

test('flipDrift inherits the overwrite law: the stale flip opens honestly, never joins', () => {
  // a second flip overwrites the first - the stale one reads 'open'
  // (verdictExecution's law), the fresh one joins
  const r = flipDrift([
    'F2 [F2] combat: verdict flipped to flee vs zombie (hp 14.0)',
    'F2 [F2] combat: shelter try vs zombie (dist 2.0, proximity re-verdict)',
    'F2 [F2] combat: verdict flipped to flee vs skeleton (hp 12.0)',
    'F2 [F2] combat: fleeing skeleton (dist 5.0, hp 12.0, 1 nearby, proximity)'
  ])
  assert.equal(r.flips, 2)
  assert.equal(r.fled, 1)
  assert.equal(r.fledJoins, 1)
  assert.equal(r.unpricedFled, 0)
  assert.deepEqual(r.rows.map(x => x.execMob), ['skeleton'])
})

test('flipDrift zero law: no flips reads the honest zero shape', () => {
  const r = flipDrift(['F1 [F1] combat: fighting zombie (dist 2.0, hp 20.0, 0 nearby, proximity)'])
  assert.deepEqual(r, {
    flips: 0, fled: 0, fledJoins: 0, unpricedFled: 0,
    mobSame: 0, mobChanged: 0, hpLost: 0,
    hpDelta: null, window: null, rows: []
  })
})

test('flipDrift junk battery: null/blob/junk lines judge nothing or nothing priced', () => {
  assert.equal(flipDrift(null), null)
  assert.equal(flipDrift(undefined), null)
  assert.equal(flipDrift(42), null)
  assert.equal(flipDrift({ lines: [] }), null)
  // the raw blob form rides verdictExecution's own split
  const blob = face43Mini.join('\n')
  const r = flipDrift(blob)
  assert.equal(r.fledJoins, 2)
  // junk lines inside the array are skipped, the book holds
  const junky = flipDrift([null, 5, '', ...face43Mini, { a: 1 }])
  assert.equal(junky.flips, 4)
  assert.equal(junky.fledJoins, 2)
})

test('flipDrift rides verdictExecution - one parser per shape, zero new RE', () => {
  // the join must agree with the underlying book on the same input
  const v = verdictExecution(face43Mini)
  const r = flipDrift(face43Mini)
  assert.equal(r.flips, v.flips)
  assert.equal(r.fled, v.fled)
  assert.equal(r.rows.length, v.rows.filter(x => x.verdict === 'fled' && x.executedMob != null && x.executedHp != null).length)
})

// The live faces' verbatim anchor lines (run 36970605824 = face 43, run
// 36852437671's artifact = face 42) - the flip/flee pairs the joins ride.
const LIVE43 = [
  'F17 [F17] combat: verdict flipped to flee vs spider (hp 8.3)',
  'F17 [F17] combat: shelter try vs spider (dist 1.2, sentry re-verdict)',
  'F17 [F17] combat: shelter wall miss (open field: no diggable wall, ring next, spider@1.2)',
  'F17 [F17] combat: shelter skip (open field: ring not buildable [oo oo -o oo] vs spider@1.2)',
  'F17 [F17] combat: flee ladder 0deg -> 270deg (the threat reads the away rotation) vs spider (sentry re-verdict)',
  'F17 [F17] combat: flee ladder 90deg -> 270deg (the threat reads the away rotation) vs spider (sentry re-verdict)',
  'F17 [F17] combat: fleeing spider (dist 4.0, hp 8.3, 2 nearby, proximity)'
]
const LIVE42 = [
  'F11 [F11] combat: verdict flipped to flee vs drowned (hp 11.0)',
  'F11 [F11] combat: sheltering from drowned (ring 6/8, proximity re-verdict)',
  'F5 [F5] combat: verdict flipped to flee vs zombie (hp 20.0)',
  'F5 [F5] combat: sheltering from zombie (ring 7/8, proximity re-verdict)'
]
