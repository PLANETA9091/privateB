// (v0.56.0) THE APPROACH SEGMENT - the run51 F17 cure.
//
// MEASURED (dispatch 35639593200, the v0.51 tip fleet): F17 surfaced from its
// shaft d=33..43 from the chest rows and hopped 8 chests - 7x 'No path to the
// goal!' under the WIDENED hop pathfinder (radius 48), then the walk floor ate
// the chain. A direct goal across quarried terrain needs a path longer than
// the search envelope BY CONSTRUCTION; no retry of the identical geometry can
// ever land. The cure walks ONE segment (max 20 blocks, always inside the
// global searchRadius 32) toward the chest first. These tests pin the pure
// planner and the injected-mechanism walk.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Vec3 } from 'vec3'
import {
  approachTargetPos,
  approachWalk,
  APPROACH_THRESHOLD,
  APPROACH_SEGMENT_MAX,
  APPROACH_MIN_REMAINING
} from '../../src/lib/approach.mjs'

test('planner: a close goal needs no approach (null inside the envelope)', () => {
  const from = { x: 0, y: 0, z: 0 }
  const to = { x: APPROACH_SEGMENT_MAX + APPROACH_MIN_REMAINING, y: 0, z: 0 } // exactly 28
  assert.equal(approachTargetPos({ from, to }), null, 'at maxSegment+minRemaining the direct ladder owns the walk')
  assert.equal(approachTargetPos({ from, to: { x: 10, y: 0, z: 0 } }), null, 'a short walk never approaches')
})

test('planner: the F17 geometry (d=43) yields one 20-block segment', () => {
  const seg = approachTargetPos({ from: { x: 0, y: 0, z: 0 }, to: { x: 43, y: 0, z: 0 } })
  assert.ok(seg, 'd=43 > 28 must approach')
  assert.equal(seg.x, 20, 'the segment caps at 20 blocks (inside searchRadius 32)')
  assert.equal(seg.y, 0)
  assert.equal(seg.z, 0)
  // remaining distance after the segment: 23 <= threshold 24
  assert.ok(43 - seg.x <= APPROACH_THRESHOLD)
})

test('planner: a far goal (d=100) still steps 20, not maxSegment-toward-infinity', () => {
  const seg = approachTargetPos({ from: { x: 0, y: 0, z: 0 }, to: { x: 100, y: 0, z: 0 } })
  assert.equal(seg.x, 20)
})

test('planner: junk inputs are null (no throw, no NaN coordinates)', () => {
  assert.equal(approachTargetPos({}), null)
  assert.equal(approachTargetPos({ from: { x: 0, y: 0, z: 0 } }), null)
  assert.equal(approachTargetPos({ from: { x: 0, y: 0, z: 0 }, to: { x: NaN, y: 0, z: 0 } }), null)
  assert.equal(approachTargetPos({ from: null, to: { x: 40, y: 0, z: 0 } }), null)
  const seg = approachTargetPos({ from: { x: 0, y: 0, z: 0 }, to: { x: 43, y: 0, z: 0 }, maxSegment: NaN })
  assert.equal(seg.x, 20, 'junk maxSegment falls back to the default cap')
})

function makeBot ({ x = 0.5, y = 64, z = 0.5, gotoMoves = false } = {}) {
  const bot = {
    username: 'ApproachBot',
    entity: { position: new Vec3(x, y, z) },
    gotoCalls: [],
    pathfinder: {
      goto: async goal => {
        bot.gotoCalls.push(goal)
        if (gotoMoves) bot.entity.position = new Vec3(goal.x, goal.y, goal.z)
      },
      stop: () => {}
    }
  }
  return bot
}

test('walk: a goal inside the envelope never approaches (zero segments)', async () => {
  const bot = makeBot({ x: 10, y: 64, z: 10 })
  const res = await approachWalk(bot, new Vec3(20, 64, 20)) // d ~= 17 <= 24
  assert.equal(res.segments, 0)
  assert.equal(res.walked, true)
})

test('walk: a successful raw segment brings the goal inside the envelope (F17 cure)', async () => {
  const bot = makeBot() // (0.5, 64, 0.5)
  const target = new Vec3(40, 64, 0.5) // d ~= 39.5 > 24
  const rawWalk = async (b, seg) => {
    b.entity.position = new Vec3(seg.x, seg.y, seg.z) // the raw walk lands
    return { walked: true }
  }
  const res = await approachWalk(bot, target, { rawWalk })
  assert.equal(res.segments, 1)
  assert.equal(res.walked, true, 'after one 20-block segment the goal is d ~= 19.5 <= 24')
})

test('walk: a failed raw segment falls back to the pathfinder segment', async () => {
  const bot = makeBot({ gotoMoves: true })
  const target = new Vec3(40, 64, 0.5)
  const rawWalk = async () => { throw new Error('raw walk stalled after 2000ms (d=39.5)') }
  const res = await approachWalk(bot, target, { rawWalk })
  assert.equal(res.segments, 1)
  assert.equal(res.walked, true, 'the pathfinder fallback lands the segment')
  assert.equal(bot.gotoCalls.length, 1)
})

test('walk: both mechanisms failing is honest, bounded, and never throws', async () => {
  const bot = makeBot()
  const target = new Vec3(40, 64, 0.5)
  const rawWalk = async () => { throw new Error('raw walk stalled') }
  const res = await approachWalk(bot, target, { rawWalk })
  assert.equal(res.segments, 1, 'one failed segment ends the approach')
  assert.equal(res.walked, false, 'still outside - the caller reports honestly')
})

test('walk: the segment cap bounds the loop (d=100 with 2 segments stays honest)', async () => {
  const bot = makeBot({ gotoMoves: true })
  const target = new Vec3(100.5, 64, 0.5)
  const rawWalk = async (b, seg) => {
    b.entity.position = new Vec3(seg.x, seg.y, seg.z)
    return { walked: true }
  }
  const res = await approachWalk(bot, target, { rawWalk })
  assert.equal(res.segments, 2)
  assert.equal(res.walked, false, '60 blocks remain - above the threshold, reported as-is')
})

test('walk: a bot with no entity never throws and never approaches', async () => {
  const bot = makeBot()
  bot.entity = null
  const res = await approachWalk(bot, new Vec3(40, 64, 0.5), { rawWalk: async () => ({ walked: true }) })
  assert.equal(res.segments, 0)
  assert.equal(res.walked, false)
})

test('walk: the goal position is honored even when it is a plain object', async () => {
  const bot = makeBot()
  const rawWalk = async (b, seg) => {
    b.entity.position = new Vec3(seg.x, seg.y, seg.z)
    return { walked: true }
  }
  const res = await approachWalk(bot, { x: 40, y: 64, z: 0.5 }, { rawWalk })
  assert.equal(res.walked, true, 'plain {x,y,z} goals work - no Vec3 required at the boundary')
})
