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
import fs from 'node:fs'
import { resetDoomedGoalLedger } from '../../src/lib/jobqueue.mjs'
import assert from 'node:assert/strict'
import { Vec3 } from 'vec3'
import {
  approachTargetPos,
  approachWalk,
  yardApproachPlan,
  YARD_APPROACH_FLOOR_MS,
  APPROACH_THRESHOLD,
  APPROACH_SEGMENT_MAX,
  APPROACH_SEGMENT_MS,
  APPROACH_MIN_REMAINING,
  PATH_GEOMETRY_RE,
  closeShotTarget
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

// (v0.124.0) THE YARD APPROACH PLAN - run107 (35915999513, NORMAL END but
// banked=13): the yard walk died 'No path to the goal!' at d=51 - 51 > the
// pathfinder's searchRadius 48, doomed BY CONSTRUCTION, x31 fleet-wide - and
// every failure doom-ledgered the chest cells (1074 funnel re-issues refused).
// The plan gates the approach segment the yard walk never had.
test('yardApproachPlan: the run107 construction - d=51 beyond the radius-48 envelope approaches', () => {
  const plan = yardApproachPlan({ yardDist: 51, remainingMs: 90000, walkMs: 30000 })
  assert.equal(plan.approach, true)
  assert.match(plan.why, /51b beyond the 24b envelope/)
  assert.equal(plan.segmentMs, APPROACH_SEGMENT_MS, 'a fat walk slice never raises the segment cap')
  assert.equal(plan.budgetMs, 90000 - YARD_APPROACH_FLOOR_MS, 'the budget is the clock minus the walk floor')
})

test('yardApproachPlan: a close yard never approaches (the legacy shape byte for byte)', () => {
  assert.equal(yardApproachPlan({ yardDist: 24, remainingMs: 90000, walkMs: 30000 }).approach, false, 'AT the threshold the direct ladder owns it')
  assert.equal(yardApproachPlan({ yardDist: 10, remainingMs: 90000, walkMs: 30000 }).why, 'inside the direct envelope')
})

test('yardApproachPlan: junk-safe - no distance, unbounded clock, thin clock, no args', () => {
  assert.equal(yardApproachPlan({ yardDist: null, remainingMs: 90000 }).approach, false)
  assert.equal(yardApproachPlan({ yardDist: 'junk', remainingMs: 90000 }).why, 'no yard distance')
  assert.equal(yardApproachPlan({ yardDist: -5, remainingMs: 90000 }).why, 'no yard distance', 'negative junk reads as no distance')
  assert.equal(yardApproachPlan({ yardDist: NaN, remainingMs: 90000 }).why, 'no yard distance')
  const unb = yardApproachPlan({ yardDist: 51, remainingMs: null })
  assert.equal(unb.approach, false, 'the unbounded legacy never approaches (the deposit chain rule)')
  assert.equal(unb.why, 'unbounded clock (legacy shape)')
  const thin = yardApproachPlan({ yardDist: 51, remainingMs: APPROACH_SEGMENT_MS + YARD_APPROACH_FLOOR_MS - 1, walkMs: 30000 })
  assert.equal(thin.approach, false, 'a clock that cannot afford a segment + the floor never starts a doomed hop with extra steps')
  assert.match(thin.why, /cannot afford/)
  assert.equal(yardApproachPlan({}).approach, false, 'no args at all')
  assert.equal(yardApproachPlan({ yardDist: 51, remainingMs: Infinity }).why, 'unbounded clock (legacy shape)', 'Infinity is the unbounded legacy too')
})

test('yardApproachPlan: the walk slice clamps the segment downward, junk reads as the cap', () => {
  const small = yardApproachPlan({ yardDist: 51, remainingMs: 90000, walkMs: 3000 })
  assert.equal(small.approach, true)
  assert.equal(small.segmentMs, 3000, 'a thin walk slice shrinks the segment, never grows it')
  assert.equal(small.budgetMs, 90000 - YARD_APPROACH_FLOOR_MS)
  const junk = yardApproachPlan({ yardDist: 51, remainingMs: 90000, walkMs: 'junk' })
  assert.equal(junk.approach, true)
  assert.equal(junk.segmentMs, APPROACH_SEGMENT_MS, 'junk walkMs reads as the segment cap (the budget clock is the real constraint)')
})

test('wiring: the yard walk consults the approach plan (fleet19.mjs pins)', () => {
  const src = fs.readFileSync(new URL('../../testbed/fleet19.mjs', import.meta.url), 'utf8')
  assert.match(src, /yardApproachPlan\(\{ yardDist: d0/, 'the yard walk consults the pure plan')
  assert.match(src, /approachWalk\(miner\.bot, yardGoal/, 'the approach walks toward the YARD, not a proxy goal')
  assert.match(src, /rawWalk: walkRawToward/, 'the raw walker is injected (the deposit chain shape)')
  assert.match(src, /yard approach: /, 'the named evidence line exists for the mine')
  assert.match(src, /if \(attempt === 1\) await yardApproach/, 'attempt 1 always consults the plan')
})

test('PATH_GEOMETRY_RE: the pathfinder geometry verdicts + the walk decision timeout, and nothing else (v0.164.0)', () => {
  assert.ok(PATH_GEOMETRY_RE.test('Took to long to decide path to goal!'), 'the think-timeout verdict')
  assert.ok(PATH_GEOMETRY_RE.test('machine unreachable (No path to the goal!)'), 'the no-path verdict, wrapped or bare')
  assert.ok(PATH_GEOMETRY_RE.test('No path to the goal!'))
  // (v0.164.0) THE WALK DECISION TIMEOUT - run559 F19 + run560 F2/F9: the
  // withTimeout belt firing past the A*'s whole clock IS a failed-START
  // geometry verdict (the v0.147.0 pin called it 'the caller's own timeout';
  // the field re-ruled: the identical re-goto re-fails deterministically).
  assert.ok(PATH_GEOMETRY_RE.test('walk to furnace: timeout after 20000ms'), 'the machine-walk timeout (run559 F19, run560 F2)')
  assert.ok(PATH_GEOMETRY_RE.test('walk to chest (retry): timeout after 15000ms'), 'the hop retry timeout (run560 F9)')
  assert.ok(PATH_GEOMETRY_RE.test('walk to a machine (sweep): timeout after 15000ms'), 'the sweep-walk label shares the shape')
  assert.ok(PATH_GEOMETRY_RE.test('iron commune walk: timeout after 1041ms'), 'the commune walk label matches (the thin slice self-skips at the nudge budget gate)')
  assert.ok(PATH_GEOMETRY_RE.test('machine unreachable (walk to furnace: timeout after 20000ms)'), 'the wrapped composite matches')
  for (const no of [
    'NoPath: no path', // the mock's generic shape - NOT the geometry class
    'raw walk timeout after 8000ms (d=8.0)', // the raw-hop abort: NO colon - deposit.mjs's deliberate non-match stands
    'open chest: timeout after 10000ms', // an INTERACTION timeout carries no walk label
    'walk (nudge retry): timeout after -1474ms', // a negative clock is never a verdict (the fuelbank fossil)
    'visit budget spent (walk slice)',
    'goal brake: 6 goals in 5s - refused for 3s',
    'doomed goal (ledgered 1s ago)',
    'water rescue in progress',
    ''
  ]) {
    assert.equal(PATH_GEOMETRY_RE.test(no), false, `not a geometry verdict: ${JSON.stringify(no)}`)
  }
})

test('wiring: the smelt + commons nudge consults PATH_GEOMETRY_RE and the proven approachWalk (v0.147.0 pins)', () => {
  const smelt = fs.readFileSync(new URL('../../src/lib/smelting.mjs', import.meta.url), 'utf8')
  assert.match(smelt, /if \(!nudgeUsed && PATH_GEOMETRY_RE\.test/, 'the nudge gates on the geometry class')
  assert.match(smelt, /approachWalk\(bot, machineBlock\.position/, 'the machine nudge walks toward the MACHINE')
  const fuel = fs.readFileSync(new URL('../../src/lib/fuelbank.mjs', import.meta.url), 'utf8')
  assert.match(fuel, /if \(!nudgeUsed && PATH_GEOMETRY_RE\.test/, 'the commons nudge gates on the same class')
  assert.match(fuel, /approachWalk\(bot, chest\.position/, 'the commons nudge walks toward the CHEST')
  const fleet = fs.readFileSync(new URL('../../testbed/fleet19.mjs', import.meta.url), 'utf8')
  assert.match(fleet, /yardSeek: async \(\) =>/, 'the fleet wires the yard-seek into the smelt leg')
})

// --------------------------------------------------- THE CLOSE SHOT (v0.157.0)
// run58 (36055223458, the v0.155.0/v0.156.0 fleet): the yard nudge machinery
// fired and immediately surrendered - 'path nudge inside the direct envelope'
// then the SAME decide re-failure x5+. The failed bot stood INSIDE the 24b
// envelope, the planner emitted ZERO segments, the start never changed. The
// close shot walks straight at the goal and stops 2 blocks short - at ANY
// distance.

test('closeShotTarget: the straight-at-goal math, stopping 2 short', () => {
  const t = closeShotTarget({ from: { x: 0, y: 64, z: 0 }, to: { x: 10, y: 64, z: 0 } })
  assert.deepEqual(t, { x: 8, y: 64, z: 0 }, 'd=10 -> walks 8, stops 2 short')
  const diag = closeShotTarget({ from: { x: 0, y: 0, z: 0 }, to: { x: 3, y: 4, z: 0 } })
  assert.ok(Math.abs(diag.x - 1.8) < 1e-9 && Math.abs(diag.y - 2.4) < 1e-9, 'd=5 -> walks 3 (60% of the line)')
})

test('closeShotTarget: too close / junk reads null (the raw ladder owns it)', () => {
  assert.equal(closeShotTarget({ from: { x: 0, y: 64, z: 0 }, to: { x: 3, y: 64, z: 0 } }), null, 'd=3 <= stop+1: no shot')
  assert.equal(closeShotTarget({ from: { x: 0, y: 64, z: 0 }, to: { x: 2.5, y: 64, z: 0 } }), null, 'd=2.5: no shot')
  assert.equal(closeShotTarget({ from: { x: NaN, y: 64, z: 0 }, to: { x: 10, y: 64, z: 0 } }), null, 'junk from')
  assert.equal(closeShotTarget({ from: null, to: { x: 10, y: 64, z: 0 } }), null, 'no from')
  const far = closeShotTarget({ from: { x: 0, y: 64, z: 0 }, to: { x: 40, y: 64, z: 0 }, stop: 5 })
  assert.deepEqual(far, { x: 35, y: 64, z: 0 }, 'a custom stop is honored')
})

test('approachWalk closeShot: a segment is emitted INSIDE the envelope and the bot moves (the run58 shape)', async () => {
  // the bot stands d=12.7 from the chest - the envelope planner would emit
  // nothing; the close shot walks it to 2 blocks short
  const bot = { entity: { position: { x: 1.5, y: 64, z: 1.5 } } }
  const shots = []
  const rawWalk = async (b, seg, { timeoutMs } = {}) => {
    shots.push({ seg, timeoutMs })
    b.entity.position = { x: seg.x, y: seg.y, z: seg.z } // the raw walk moves the bot
    return { walked: true }
  }
  const res = await approachWalk(bot, { x: 10.5, y: 64, z: 10.5 }, { closeShot: true, rawWalk, log: () => {} })
  assert.equal(shots.length, 1, 'exactly one close shot')
  assert.ok(shots[0].seg.x > 1.5 && shots[0].seg.x < 10.5, 'the segment sits on the line, short of the goal')
  assert.equal(res.walked, true, 'the goal is now inside the direct envelope')
  assert.ok(Math.abs(res.d - 2) < 0.1, `closed to ~2 blocks (got ${res.d})`)
})

test('approachWalk closeShot: no rawWalk dep still moves via the pathfinder fallback, byte-compat off', async () => {
  // closeShot=false (default): the envelope planner no-ops at d=12.7 - the
  // v0.155.0 field shape stays byte-identical for every legacy caller. THE
  // LIE THE FIELD MEASURED: walked=true (the goal is within the envelope)
  // while segments=0 - the bot never moved, the re-goto re-failed.
  let gotoCalls = 0
  const bot = { entity: { position: { x: 1.5, y: 64, z: 1.5 } }, pathfinder: { goto: async () => { gotoCalls++ } } }
  const res = await approachWalk(bot, { x: 10.5, y: 64, z: 10.5 }, { log: () => {} })
  assert.equal(res.segments, 0, 'the legacy planner refuses a close-range segment')
  assert.equal(gotoCalls, 0, 'nothing was walked')
  assert.equal(res.walked, true, 'the envelope read says walked - the run58 blind spot pinned here')
  assert.ok(Math.abs(res.d - 12.7279) < 0.01, `the bot stands where it stood (got ${res.d})`)
})

// ---------------------------------------------------------------------------
// (v0.162.0) THE HONEST CAP VERDICT - run559 (dispatch 36073741918, the
// v0.161.0 union fleet, a 300s window) caught the self-contradicting field
// line: 'F14 approach: 8 segment(s) walked in 55.9s, goal now d=33.7 (still
// outside - inside the direct envelope)' - EIGHT segments, still 33.7 blocks
// out, and the verdict claimed the direct envelope. endWhy initializes to
// 'inside the direct envelope' and only the budget/stall breaks rename it -
// a natural cap exhaust fell out with the one verdict it did NOT earn.
test('walk: a natural cap exhaust names the cap, never the direct envelope (the F14 verdict cure, v0.162.0)', async () => {
  const bot = makeBot({ gotoMoves: true })
  const target = new Vec3(100.5, 64, 0.5) // d ~= 100
  const lines = []
  const rawWalk = async (b, seg) => {
    b.entity.position = new Vec3(seg.x, seg.y, seg.z) // every segment LANDS - no stall, no budget death
    return { walked: true }
  }
  const res = await approachWalk(bot, target, { rawWalk, maxSegments: 2, log: m => lines.push(m) })
  assert.equal(res.segments, 2)
  assert.equal(res.walked, false, '60 blocks remain - still outside, honest')
  const line = lines.find(l => /approach: 2 segment\(s\) walked/.test(l))
  assert.ok(line, 'the approach line is logged')
  assert.match(line, /the segment cap spent \(2 walked, d=60\.0\)/, 'the cap is named with its count and the honest distance')
  assert.ok(!/inside the direct envelope/.test(line), 'the un-earned verdict is gone')
})

test('walk: the legacy in-envelope verdict stays byte-identical when the walk EARNED it (v0.162.0 keeps the truth)', async () => {
  const bot = makeBot({ x: 10, y: 64, z: 10 })
  const lines = []
  const res = await approachWalk(bot, new Vec3(20, 64, 20), { log: m => lines.push(m) }) // d ~= 17 <= 24, zero segments
  assert.equal(res.segments, 0)
  assert.equal(res.walked, true)
  assert.ok(!lines.some(l => /approach:/.test(l)), 'the zero-segment path logs no approach line at all - unchanged')

  const bot2 = makeBot({ gotoMoves: true })
  const lines2 = []
  const target2 = new Vec3(40, 64, 0.5) // d ~= 39.5: one 20-block segment closes to ~19.5 <= 24
  const rawWalk = async (b, seg) => {
    b.entity.position = new Vec3(seg.x, seg.y, seg.z)
    return { walked: true }
  }
  const res2 = await approachWalk(bot2, target2, { rawWalk, log: m => lines2.push(m) })
  assert.equal(res2.walked, true)
  const line2 = lines2.find(l => /approach: 1 segment\(s\) walked/.test(l))
  assert.ok(line2 && /\(inside the direct envelope\)/.test(line2), 'the EARNED envelope verdict stays')
})
