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
import { test, beforeEach } from 'node:test'
import { resetDoomedGoalLedger } from '../../src/lib/jobqueue.mjs'
import assert from 'node:assert/strict'
import { Vec3 } from 'vec3'
import {
  approachTargetPos,
  approachWalk,
  APPROACH_THRESHOLD,
  APPROACH_SEGMENT_MAX,
  APPROACH_MIN_REMAINING
} from '../../src/lib/approach.mjs'

// The doomed-goal ledger (v0.72.0) is a module-level singleton in jobqueue.mjs
// (one process = one fleet). A dead verdict recorded by one test's walk must
// not refuse the next test's walks (the mocks reuse chest/furnace positions),
// so every test here starts from an empty ledger.
beforeEach(() => resetDoomedGoalLedger())

test('planner: a close goal needs no approach (null inside the envelope)', () => {
  const from = { x: 0, y: 0, z: 0 }
  // (v0.61.0) the boundary moved 28 -> 24 (minRemaining 8 -> 4, the run58 F14
  // wall: three attempts each died on the final 28-block stretch the planner
  // refused to close) - the planner now owns everything past the threshold.
  const to = { x: APPROACH_SEGMENT_MAX + APPROACH_MIN_REMAINING, y: 0, z: 0 } // exactly 24
  assert.equal(approachTargetPos({ from, to }), null, 'at maxSegment+minRemaining (= the threshold) the direct ladder owns the walk')
  const seg25 = approachTargetPos({ from, to: { x: 25, y: 0, z: 0 } })
  assert.ok(seg25, 'd=25 is ABOVE the threshold - the planner owns it now (the run58 F14 wall)')
  assert.equal(seg25.x, 20, 'the 25-block goal gets one 20-block step: 5 remain after it')
  assert.equal(approachTargetPos({ from, to: { x: 10, y: 0, z: 0 } }), null, 'a short walk never approaches')
})

test('planner: the F17 geometry (d=43) yields one 20-block segment', () => {
  const seg = approachTargetPos({ from: { x: 0, y: 0, z: 0 }, to: { x: 43, y: 0, z: 0 } })
  assert.ok(seg, 'd=43 > 24 must approach')
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

test('walk: the segment cap bounds the loop (d=100 closes in 4 segments now)', async () => {
  const bot = makeBot({ gotoMoves: true })
  const target = new Vec3(100.5, 64, 0.5)
  const rawWalk = async (b, seg) => {
    b.entity.position = new Vec3(seg.x, seg.y, seg.z)
    return { walked: true }
  }
  const res = await approachWalk(bot, target, { rawWalk })
  assert.equal(res.segments, 4, 'the run58 arithmetic cure: 100 -> 80 -> 60 -> 40 -> 20, then inside the envelope')
  assert.equal(res.walked, true, 'the v0.56.0 cap of 2 left 60 blocks outside - the loop closes what the arithmetic allows')
})

test('walk: an explicit maxSegments still caps the loop (opt-in, the old 2-segment semantics)', async () => {
  const bot = makeBot({ gotoMoves: true })
  const target = new Vec3(100.5, 64, 0.5)
  const rawWalk = async (b, seg) => {
    b.entity.position = new Vec3(seg.x, seg.y, seg.z)
    return { walked: true }
  }
  const res = await approachWalk(bot, target, { rawWalk, maxSegments: 2 })
  assert.equal(res.segments, 2)
  assert.equal(res.walked, false, '60 blocks remain - above the threshold, reported as-is')
})

test('walk: the budgetMs clock bounds the loop and the last slice clamps to it', async () => {
  const bot = makeBot({ gotoMoves: true })
  const target = new Vec3(100.5, 64, 0.5)
  const slices = []
  const sleep = ms => new Promise(r => setTimeout(r, ms))
  const rawWalk = async (b, seg, { timeoutMs } = {}) => {
    slices.push(timeoutMs)
    await sleep(timeoutMs) // the walk consumes exactly its slice of real wall clock
    b.entity.position = new Vec3(seg.x, seg.y, seg.z)
    return { walked: true }
  }
  const res = await approachWalk(bot, target, { rawWalk, segmentMs: 20, budgetMs: 50 })
  // (v0.69.1) the boundary sliver, measured (run 35688226298 flaked: segments=4):
  // the loop admits any slice while left > 0, and after 2 full slices + a clamped
  // remainder the runner's timer overshoot vs loop overhead race can leave
  // left = 1-2ms - the design then runs one SUB-2ms sliver before the next check
  // breaks. The pin is the CLOCK BOUND, not the exact count: 2 full slices, the
  // clamped remainder, and at most one boundary sliver after it.
  assert.ok(res.segments >= 3 && res.segments <= 4, `2 full slices + a clamped remainder (+ at most one sub-ms boundary sliver) - got ${res.segments}: ${slices.join(',')}`)
  assert.equal(slices[0], 20)
  assert.equal(slices[1], 20)
  assert.ok(slices[2] > 0 && slices[2] < 20, `the third slice clamped to the remaining clock (got ${slices[2]})`)
  // (v0.70.1) the walked pin FOLLOWS the geometry instead of contradicting it:
  // 3 segments end at d=40 (outside the threshold 24), but the boundary-sliver
  // 4th segment closes to d=20 - INSIDE. v0.69.1 widened the count pin to
  // 3..4 and kept walked=false, which the 4-segment outcome falsifies; this
  // exact pair has now flaked twice (35688226298, 35695172343 both on this
  // test, once per shape). The CLOCK BOUND stays the real pin - walked
  // derives from the count deterministically.
  assert.equal(res.walked, res.segments === 4, '3 segments: outside (d=40); the sliver 4th: inside (d=20 <= 24)')
})

test('walk: a zero budget ends the loop BEFORE any segment starts', async () => {
  const bot = makeBot({ gotoMoves: true })
  const target = new Vec3(100.5, 64, 0.5)
  let calls = 0
  const rawWalk = async (b, seg) => {
    calls++
    b.entity.position = new Vec3(seg.x, seg.y, seg.z)
    return { walked: true }
  }
  const zero = await approachWalk(bot, target, { rawWalk, budgetMs: 0 })
  assert.equal(zero.segments, 0, 'budgetMs 0 is a real clock answer: no budget, no segments')
  assert.equal(calls, 0)
  assert.equal(zero.walked, false)
  const junk = await approachWalk(bot, target, { rawWalk, budgetMs: NaN })
  assert.equal(junk.segments, 4, 'junk budget falls back to the unbounded default (the cap governs, d=100 closes in 4)')
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

// (v0.62.0) the PHANTOM RAW CURE - run60: 13/13 approach chains ended
// 'stalled (no position delta)' at the same ring d=24.5-27.0 around the chests
// (F5 three separate attempts at d=24.5-24.9). A raw walk that REPORTS walked
// while the bot stood still used to eat the segment with no pathfinder try.

test('walk: a phantom raw success (reports walked, moves nothing) still gets the pathfinder', async () => {
  const bot = makeBot({ gotoMoves: true })
  const target = new Vec3(40, 64, 0.5)
  const rawWalk = async (b, seg) => {
    // the raw walker REPORTS success but the bot never moved (stalled against
    // a ledge) - the position delta is the only truth, so A* must get a shot
    return { walked: true }
  }
  const res = await approachWalk(bot, target, { rawWalk })
  assert.equal(bot.gotoCalls.length, 1, 'the pathfinder fallback ran despite the raw walked=true')
  assert.equal(res.segments, 1)
  assert.equal(res.walked, true, 'the pathfinder lands the segment the raw walker phantom-reported')
})

test('walk: phantom raw + a stalled pathfinder segment still ends the chain (anti-spin survives)', async () => {
  const bot = makeBot() // gotoMoves=false: the pathfinder resolves without moving the bot
  const target = new Vec3(40, 64, 0.5)
  const rawWalk = async () => ({ walked: true }) // phantom success
  const res = await approachWalk(bot, target, { rawWalk })
  assert.equal(res.segments, 1, 'one fully immobile segment still ends the loop')
  assert.equal(res.walked, false, 'honest: the caller ladder owns the rest')
})
