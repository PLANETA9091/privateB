// v0.260.0 THE ALREADY-THERE FAST PATH - the skip verdict that spares the
// funnel a zero-displacement instant done. THE MEASUREMENT (face
// 36344554956): the run's named drop-walk failures carried x16 'spin
// breaker: sweep drops re-issued 2x inside the 10s window after its own
// pf:done' against x22 honest timeouts - 29% of the failures were the
// breaker, not the geometry - while the sweep ledger read failed=77 (above
// x44, below x21, plane x12) and the coal famine held (coal_ore dug,
// smelted=0, torches skipped 'no coal: coals 0'). THE ANATOMY: a vein's
// drops land in each other's goal spheres - one landed walk parks the bot
// inside the NEXT targets' isEnd, those walks complete instantly with ZERO
// displacement, and two of them open the v0.227.0 spin breaker's 30s hold
// on the whole 'sweep drops' label: a rich vein booked as churn, the
// remaining cluster refused while the drops despawned. THE CURE: the walk
// only issues when the bot stands OUTSIDE the goal's own arrival test; an
// already-satisfied goal skips to the landed path with zero funnel
// participation. Junk discipline: a missing/unreadable isEnd, a junk
// position, or a truthy-but-not-true verdict NEVER skips a walk.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { dropWalkSkipped, DROP_GOAL_PLANE, DROP_GOAL_BELOW, DROP_GOAL_ABOVE, DROP_GOAL_DEEP_DY } from '../../src/lib/drops.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const minerSrc = readFileSync(join(here, '../../src/bots/miner.mjs'), 'utf8')

// A GoalNear-shaped arrival test: the same 3D-ball arithmetic mineflayer's
// GoalNear.isEnd runs (floored-center-less; the raw position form the funnel
// settles on). Used across the pins as the honest isEnd stand-in.
const goalAt = (x, y, z, range) => (pos) => {
  const dx = x - pos.x
  const dy = y - pos.y
  const dz = z - pos.z
  return dx * dx + dy * dy + dz * dz <= range * range
}

test('v0.260.0 the already-there verdict: inside the arrival test skips the walk', () => {
  // the bot stands 1.1 from a drop under a range-2 goal - the wide sphere's
  // legal arrival (the face's dominant dy +1.0 / range 2 cluster shape)
  const isEnd = goalAt(10, 45, 408, 2)
  assert.equal(dropWalkSkipped(isEnd, { x: 10.3, y: 44.0, z: 407.9 }), true, 'inside the 3D ball = the walk would be a zero-displacement instant done')
})

test('v0.260.0 the already-there verdict: outside the arrival test keeps the walk', () => {
  const isEnd = goalAt(10, 44, 408, 1)
  assert.equal(dropWalkSkipped(isEnd, { x: 13, y: 44, z: 408 }), false, '3 blocks flat of a range-1 goal - the honest walk issues')
  assert.equal(dropWalkSkipped(isEnd, { x: 10, y: 41, z: 408 }), false, '3 below - outside even the wide sphere, the walk (or the deep skip upstream) rules')
})

test('v0.260.0 junk discipline: a missing or unreadable isEnd NEVER skips a walk', () => {
  assert.equal(dropWalkSkipped(undefined, { x: 1, y: 2, z: 3 }), false, 'no test - no skip')
  assert.equal(dropWalkSkipped(null, { x: 1, y: 2, z: 3 }), false, 'null test - no skip')
  assert.equal(dropWalkSkipped(42, { x: 1, y: 2, z: 3 }), false, 'a non-function verdict is not a verdict')
  assert.equal(dropWalkSkipped(() => true, null), false, 'junk position - no skip')
  assert.equal(dropWalkSkipped(() => true, undefined), false, 'missing position - no skip')
  assert.equal(dropWalkSkipped(() => true, { x: 1, y: 2 }), false, 'a partial position is junk - no skip')
  assert.equal(dropWalkSkipped(() => true, { x: NaN, y: 2, z: 3 }), false, 'NaN x - no skip')
  assert.equal(dropWalkSkipped(() => true, { x: Infinity, y: 2, z: 3 }), false, 'non-finite x - no skip')
})

test('v0.260.0 junk discipline: a throwing isEnd never skips (and never throws)', () => {
  assert.equal(dropWalkSkipped(() => { throw new Error('mock geometry') }, { x: 1, y: 2, z: 3 }), false, 'a read that cannot answer refuses the skip - the legacy issue byte for byte')
})

test('v0.260.0 junk discipline: the verdict must be EXACTLY true (no truthy leakage)', () => {
  assert.equal(dropWalkSkipped(() => 1, { x: 1, y: 2, z: 3 }), false, 'truthy-not-true - no skip (a mock coercion never widens the fast path)')
  assert.equal(dropWalkSkipped(() => 'yes', { x: 1, y: 2, z: 3 }), false, 'a string is not a verdict')
})

test('v0.260.0 the skip is honest work: the caller counts and names it', () => {
  assert.match(minerSrc, /if \(dropWalkSkipped\(\(p\) => goal\.isEnd\(p\), bot\.entity\.position\)\) \{/, 'the fast path consults the goal at the bot position')
  assert.match(minerSrc, /landed = true\n            skipWalks\+\+/, 'the skip lands the target AND counts - an already-there drop is not a failure')
  assert.match(minerSrc, /if \(skipWalks > 0\) log\(`\$\{tag\} vein sweep: \$\{skipWalks\} drop\(s\) already inside the goal - the zero-displacement walk spared \(the instant done the spin book reads as churn\)`\)/, 'the honest instrument line names the skip')
})

test('v0.260.0 wiring: the walk issues INSIDE the else - the skipped target never touches the funnel', () => {
  const fastIdx = minerSrc.indexOf('dropWalkSkipped((p) => goal.isEnd(p), bot.entity.position)')
  assert.ok(fastIdx > -1, 'the fast path exists in the drop loop')
  const goalIdx = minerSrc.indexOf('const goal = new goals.GoalNear(d.x, d.y, d.z, range)', fastIdx - 400)
  assert.ok(goalIdx > -1 && goalIdx < fastIdx, 'the goal is built BEFORE the verdict - one goal, one construction, no re-build drift')
  const gotoIdx = minerSrc.indexOf('await gotoSafe(bot, goal, { timeoutMs: SWEEP_DROP_TIMEOUT_MS, label: \'sweep drops\' })', fastIdx)
  assert.ok(gotoIdx > fastIdx, 'the legacy walk rides the SAME goal object (the skip and the issue share the arithmetic)')
  const elseIdx = minerSrc.indexOf('} else {', fastIdx)
  assert.ok(elseIdx > fastIdx && elseIdx < gotoIdx, 'the walk sits inside the else of the skip - a skipped target never reaches gotoSafe')
  assert.ok(!/await gotoSafe\(bot, new goals\.GoalNear\(/.test(minerSrc.slice(fastIdx, gotoIdx + 400)), 'the inline GoalNear construction is gone - the verdict and the walk read the same goal')
})

test('v0.260.0 wiring: the failure instrument and the lip dig-down survive the restructure', () => {
  const gotoIdx = minerSrc.indexOf("await gotoSafe(bot, goal, { timeoutMs: SWEEP_DROP_TIMEOUT_MS, label: 'sweep drops' })")
  const catchIdx = minerSrc.indexOf('} catch (e) {', gotoIdx)
  const dyIdx = minerSrc.indexOf('the DY INSTRUMENT', catchIdx)
  assert.ok(dyIdx > catchIdx, 'the dy instrument still names the failed walks')
  const triageIdx = minerSrc.indexOf('if (range === DROP_GOAL_BELOW) {', catchIdx)
  assert.ok(triageIdx > catchIdx, 'the v0.205.0 ledger triage still splits the wide-2 family')
  const lipIdx = minerSrc.indexOf('if (landed && dyWalk < DROP_GOAL_BELOW_DY && dyWalk >= DROP_GOAL_DEEP_DY) {', catchIdx)
  assert.ok(lipIdx > catchIdx, 'the lip dig-down still reads the dy family on the landed path - the skip lands into the same downstream')
})

test('v0.260.0 wiring: the import carries the new verdict', () => {
  assert.match(minerSrc, /import \{ dropTargets, dropGoalRange, dropWalkSkipped, aboveBandOf, lipDigWanted/, 'the miner imports the fast path from the pure lib')
})

test('v0.260.0 the goal fences are UNTOUCHED - the cure adds a skip, not a geometry', () => {
  assert.equal(DROP_GOAL_PLANE, 1, 'the tight goal stays')
  assert.equal(DROP_GOAL_BELOW, 2, 'the below lip sphere stays (the v0.178.0 cure)')
  assert.equal(DROP_GOAL_ABOVE, 2, 'the above ledge sphere stays (the v0.189.0 cure)')
  assert.equal(DROP_GOAL_DEEP_DY, -2, 'the deep fence stays (the v0.182.0 skip)')
})
