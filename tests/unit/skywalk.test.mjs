import { test } from 'node:test'
import assert from 'node:assert/strict'
import { skyWalk, SKYWALK_MIN_REFUSALS, SKYWALK_WALK_SHARE, SKYWALK_SKY_SHARE } from '../../src/lib/skywalk.mjs'

// THE ERA BYTE-EXACT - the 48th (run 37530997515, the calm face on the
// v0.725.0 tree) rode the join's motive: 30 commons chest-walk failures
// ('by why: decide-timeout=14 no-path=8 other=3 water-rescue=3
// walk-timeout=2') beside 'the A* starved at ents 1760..3694 (median
// 2097) - 12/14 gauged starves sat at or past half the face's ents
// ceiling'. The lines below carry the face's own byte shapes; the gauge
// anchors the sky so the join reads the verdict's own logic.

const HB = 'x b] n=42 ts=100s rss=454M late=100ms mainLate=50ms'
const GAUGE = 'mem: heap=129M/171M old=99M ext=142M ab=140M rss=455M cols=108 ents=2000 evicted=9 path=0a/0q (max 6) stale=0'
const DECIDE_FAIL = 'F7 fuel commons: chest walk failed after the nudge (Took to long to decide path to goal!)'
const DECIDE_FAIL_PLAIN = 'F7 fuel commons: chest walk failed (Took to long to decide path to goal!)'
const NOPATH_FAIL = 'F12 food commons: chest walk failed after the nudge (No path to the goal!)'
const WATER_FAIL = 'F10 iron commune: chest walk failed (water rescue in progress (iron commune walk @-134,411 refused))'
const BRAKE_FAIL = 'F5 food commons: chest walk failed (goal brake: 2 goals in 30s - food commons walk @-120,415 refused for 30s)'
const TIMEOUT_FAIL = 'F17 iron commune: chest walk failed (iron commune walk @-128,414: timeout after 4009ms)'

test('the join rides by its own bytes - the 48th\'s crowded sky verdict folds in', () => {
  // the face's own distribution: decide 14 (nudge 12 + plain 2),
  // nopath 8, water-rescue 3, goal-brake 3, walk-timeout 2 = 30
  const face = [
    HB,
    GAUGE,
    ...Array(12).fill(DECIDE_FAIL),
    ...Array(2).fill(DECIDE_FAIL_PLAIN),
    ...Array(8).fill(NOPATH_FAIL),
    ...Array(3).fill(WATER_FAIL),
    ...Array(3).fill(BRAKE_FAIL),
    ...Array(2).fill(TIMEOUT_FAIL)
  ]
  const join = skyWalk(face)
  assert.equal(join.refusals, 30)
  assert.equal(join.decideTimeouts, 14)
  assert.equal(join.starves, 14)
  assert.equal(join.entsMedian, 2000)
  assert.equal(join.crowdedN, 14)
  assert.equal(join.crowdedOf, 14)
  // the verdict: 14/30 = 46.7% at or past both bars
  assert.ok(join.verdict)
  assert.equal(join.verdict.decideTimeouts, 14)
  assert.equal(join.verdict.of, 30)
  assert.ok(Math.abs(join.verdict.share - 14 / 30) < 1e-9)
  assert.equal(join.verdict.starves, 14)
  assert.equal(join.verdict.entsMedian, 2000)
})

test('the under-bar face reads the honest none-form - the 47th\'s single water refusal', () => {
  // the 47th's own shape: one chest-walk failure (water rescue in
  // progress), zero decide timeouts - the walk side sits under the bar
  const join = skyWalk([
    HB,
    GAUGE,
    'F1 fuel commons: chest walk failed (water rescue in progress (fuel commons walk @-126,408 (nudge retry) refused))'
  ])
  assert.equal(join.refusals, 1)
  assert.equal(join.decideTimeouts, 0)
  assert.equal(join.verdict, null)
})

test('the bars hold - the concentration law, both sides', () => {
  const gauged = [GAUGE, ...Array(12).fill(DECIDE_FAIL), ...Array(4).fill(NOPATH_FAIL)]
  // exactly at the bars: 10 decide of 25 refusals is 40% -> in
  const atWalkBar = skyWalk([
    HB,
    GAUGE,
    ...Array(SKYWALK_MIN_REFUSALS).fill(DECIDE_FAIL),
    ...Array(15).fill(NOPATH_FAIL)
  ])
  assert.ok(atWalkBar.verdict)
  assert.equal(atWalkBar.decideTimeouts, SKYWALK_MIN_REFUSALS)
  assert.ok(SKYWALK_MIN_REFUSALS / 25 === SKYWALK_WALK_SHARE)
  // one under the walk share: 9 decide of 25 -> out
  const underWalk = skyWalk([HB, GAUGE, ...Array(9).fill(DECIDE_FAIL), ...Array(16).fill(NOPATH_FAIL)])
  assert.equal(underWalk.verdict, null)
  assert.equal(underWalk.decideTimeouts, 9)
  // the sky side under: the starves never gauged (no heartbeat/gauge) -
  // the cohort counts (fails = the whole cohort), the sky never prices -> out
  const ungauged = skyWalk([...Array(20).fill(DECIDE_FAIL), ...Array(4).fill(NOPATH_FAIL)])
  assert.equal(ungauged.refusals, 24)
  assert.equal(ungauged.starves, 20)
  assert.equal(ungauged.entsMedian, null)
  assert.equal(ungauged.verdict, null)
  // the sky share under: every starve rides a thin sky (the fails sit
  // between the gauges - they join the THIN sky while the face's own
  // ceiling rode the crowded one) -> out
  const thinSky = skyWalk([
    HB,
    GAUGE,
    ...Array(12).fill(DECIDE_FAIL),
    'x b] n=43 ts=800s rss=455M late=100ms mainLate=50ms',
    'mem: heap=129M/171M old=99M ext=142M ab=140M rss=455M cols=108 ents=10000 evicted=9 path=0a/0q (max 6) stale=0',
    ...Array(4).fill(NOPATH_FAIL)
  ])
  assert.equal(thinSky.verdict, null)
  assert.ok(SKYWALK_SKY_SHARE > 0.5 - 1e-9)
})

test('junk never invents - the zero shapes and the blob skin', () => {
  const empty = skyWalk([])
  assert.equal(empty.refusals, 0)
  assert.equal(empty.decideTimeouts, 0)
  assert.equal(empty.starves, 0)
  assert.equal(empty.verdict, null)
  const junk = skyWalk(null)
  assert.equal(junk.refusals, 0)
  assert.equal(junk.verdict, null)
  const blob = skyWalk([
    '',
    'x F7 fuel commons: chest walk failed after the nudge (Took to long to decide path to goal!)',
    'the A* starved at ents 1760..3694 (median 2097) - prose never joins',
    'mem: junk'
  ])
  assert.equal(blob.refusals, 0)
  assert.equal(blob.verdict, null)
})
