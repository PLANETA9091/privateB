// Tests for the stall governor (v0.74.0) - the churn breaker at the gotoSafe
// funnel, the per-bot sibling of the doomed-goal ledger (v0.72.0).
// MEASURED (run68, HARD KILL): the re-issue spiral returned with ZERO
// pathfinder dead verdicts - 0 ledger records, 0 'Took to long', 20x budget
// timeouts ('timeout after Nms' - transient saturation, correctly never
// recorded) - and the blackbox showed goals queued AND done at a ~7.5s
// cadence INSIDE the 151s mainLate window: the main thread was CHURNING, not
// blocked. Fuel: starved physics stalls every walk, every task loop
// escalates to ANOTHER walk, every re-issue pays setGoal -> resetPath -> an
// A* burst. The governor judges the WALKER: churnLimit zero-progress walks
// inside the window open a per-bot stall; gotoSafe refuses for zero cost;
// real progress clears the streak; a bot that moves while stalled (rescue,
// fall) closes the open early. F8/F10 died falls INSIDE that storm window -
// this governor is the fall-prevention lever too.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  createWalkGovernor,
  STALL_WINDOW_MS, STALL_CHURN_LIMIT, STALL_MIN_PROGRESS, STALL_COOLDOWN_MS
} from '../../src/lib/walkgovernor.mjs'
import { gotoSafe, resetWalkGovernors, walkGovernorStatsFor, resetDoomedGoalLedger } from '../../src/lib/jobqueue.mjs'

// a Vec3-shaped position stub (only what the governor touches)
function pos (x, y, z) {
  return {
    x, y, z,
    floored () { return this },
    distanceTo (o) {
      const dx = this.x - o.x, dy = this.y - o.y, dz = this.z - o.z
      return Math.sqrt(dx * dx + dy * dy + dz * dz)
    }
  }
}

test('constants: the stall envelope is honest (window > cooldown, tight churn limit)', () => {
  assert.ok(STALL_WINDOW_MS > STALL_COOLDOWN_MS, 'the churn window must outlive the cooldown so a relapse re-opens without fresh evidence')
  assert.ok(STALL_COOLDOWN_MS >= 5000, 'a refusal window under 5s cannot break a 7.5s re-issue cadence')
  assert.ok(STALL_CHURN_LIMIT >= 2, 'a single stalled walk is a transient, not a stall')
  assert.ok(STALL_MIN_PROGRESS > 0 && STALL_MIN_PROGRESS <= 2, 'progress threshold: one real block, not a teleport class')
})

test('the run68 churn shape: 4 zero-progress walks open the stall, the 5th consult refuses', () => {
  const g = createWalkGovernor()
  const t0 = 1000000
  // the funnel order: consult -> walk settles -> record; the consult BEFORE
  // each stalled walk sees one less outcome than the walk count
  for (let i = 0; i < STALL_CHURN_LIMIT; i++) {
    const v = g.consult(pos(10, 64, 10), t0 + i * 100)
    assert.equal(v.open, false, `consult ${i + 1}: the stall must not open before the evidence is sufficient`)
    g.recordOutcome(0, t0 + i * 100 + 50) // the walk settled: zero displacement
  }
  const refused = g.consult(pos(10, 64, 10), t0 + STALL_CHURN_LIMIT * 100)
  assert.equal(refused.open, true, 'churnLimit zero-progress walks must open the stall at the next consult')
  assert.ok(refused.remainingMs > 0 && refused.remainingMs <= STALL_COOLDOWN_MS)
  assert.equal(g.stats().opens, 1)
  assert.equal(g.stats().refusals, 1)
})

test('a real progress walk clears the churn streak (an honest governor never strangles a working walker)', () => {
  const g = createWalkGovernor()
  const t0 = 2000000
  for (let i = 0; i < STALL_CHURN_LIMIT - 1; i++) g.recordOutcome(0, t0 + i * 100)
  g.recordOutcome(12.3, t0 + 1000) // a 12-block walk: real progress
  g.recordOutcome(0, t0 + 1100) // one more stall - streak restarted, not continued
  const v = g.consult(pos(0, 64, 0), t0 + 1200)
  assert.equal(v.open, false, '1 zero-progress walk after a progress walk must not open')
  assert.equal(g.stats().progressClears, 1)
})

test('old outcomes age out of the sliding window (the stall cannot feed on stale evidence)', () => {
  const g = createWalkGovernor()
  const t0 = 3000000
  for (let i = 0; i < STALL_CHURN_LIMIT; i++) g.recordOutcome(0, t0 + i * 100)
  const later = t0 + STALL_WINDOW_MS + 1000 // everything aged out
  const v = g.consult(pos(0, 64, 0), later)
  assert.equal(v.open, false, 'a window with no live outcomes must not open')
  assert.equal(g.stats().live, 0)
})

test('the cooldown expires but STALE churn within the window keeps refusing (drought bounded by the window)', () => {
  const g = createWalkGovernor()
  const t0 = 4000000
  for (let i = 0; i < STALL_CHURN_LIMIT; i++) g.recordOutcome(0, t0 + i * 100)
  assert.equal(g.consult(pos(0, 64, 0), t0 + 400).open, true, 'the 5th consult opens')
  const after = t0 + 400 + STALL_COOLDOWN_MS + 1 // cooldown over, evidence 12s old but < windowMs
  assert.equal(g.consult(pos(0, 64, 0), after).open, true, 'stale churn still refuses - the bot never walked meanwhile')
  const pruned = t0 + STALL_WINDOW_MS + 2000 // every outcome aged out
  assert.equal(g.consult(pos(0, 64, 0), pruned).open, false, 'the drought is bounded by the window, not forever')
})

test('the early close: a bot that moved while stalled walks again immediately', () => {
  const g = createWalkGovernor()
  const t0 = 5000000
  for (let i = 0; i < STALL_CHURN_LIMIT; i++) g.recordOutcome(0, t0 + i * 100)
  assert.equal(g.consult(pos(10, 64, 10), t0 + 500).open, true)
  // the rescue hauls the bot 8 blocks while the stall is open
  const rescued = g.consult(pos(18, 64, 10), t0 + 600)
  assert.equal(rescued.open, false, 'a moved bot is a recoverable walker - the open must clear')
  assert.equal(g.stats().earlyCloses, 1)
  assert.equal(g.stats().live, 0, 'the early close drops the churn evidence too')
})

test('unmeasurable outcomes never feed the stall (mocks and teardown stay harmless)', () => {
  const g = createWalkGovernor()
  const t0 = 6000000
  for (let i = 0; i < STALL_CHURN_LIMIT + 2; i++) g.recordOutcome(null, t0 + i * 100)
  g.recordOutcome(undefined, t0 + 900)
  g.recordOutcome(NaN, t0 + 950)
  const v = g.consult(pos(0, 64, 0), t0 + 1000)
  assert.equal(v.open, false, 'null/undefined/NaN displacement is evidence, not fuel')
  assert.equal(g.stats().records, STALL_CHURN_LIMIT + 4, 'six loop records + undefined + NaN')
  assert.equal(g.stats().live, 0)
})

test('junk-safe construction and consults (the governor never throws)', () => {
  const g = createWalkGovernor({ windowMs: NaN, churnLimit: 'x', minProgress: null, cooldownMs: -5 })
  assert.doesNotThrow(() => g.recordOutcome('junk', NaN))
  assert.doesNotThrow(() => g.consult(null, 7000000))
  assert.doesNotThrow(() => g.maybeOpen(undefined, 7000001))
  const st = g.stats()
  assert.equal(typeof st.records, 'number')
})

test('stats + reset shapes', () => {
  const g = createWalkGovernor()
  g.recordOutcome(0, 8000000)
  const st = g.stats()
  for (const k of ['records', 'refusals', 'opens', 'earlyCloses', 'progressClears', 'live', 'open']) {
    assert.ok(k in st, `stats must carry ${k}`)
  }
  g.reset()
  assert.equal(g.stats().records, 0)
  assert.equal(g.stats().live, 0)
})

test('jobqueue wiring: a stalled bot gets its walks refused at the funnel for zero cost', async () => {
  resetWalkGovernors()
  resetDoomedGoalLedger()
  let gotoCalls = 0
  const bot = {
    _waterRescue: false,
    entity: { position: pos(5, 64, 5) },
    pathfinder: { goto: async () => { gotoCalls++; return 'done' }, stop () {}, setGoal () {}, isMoving () { return false } },
    waitForTicks: async () => {},
    on () {}, removeListener () {}
  }
  const goal = { x: 100, y: 64, z: 100 } // far cell - geometry ledger must stay silent
  // four real walks that DO move the bot during the walk (healthy walker,
  // governor silent): the displacement is measured inside the walk
  for (let i = 0; i < 4; i++) {
    bot.pathfinder.goto = async () => {
      gotoCalls++
      bot.entity.position = pos(5 + (i + 1) * 3, 64, 5) // the walk moves the bot 3 blocks
      return 'done'
    }
    await gotoSafe(bot, goal, { timeoutMs: 500, label: 'healthy walk' })
  }
  assert.equal(gotoCalls, 4)
  assert.equal(walkGovernorStatsFor().opens, 0, 'a working walker never opens a stall')
  // now the bot wedges: walks settle but the position never changes
  bot.entity.position = pos(17, 64, 5)
  bot.pathfinder.goto = async () => { gotoCalls++; return 'done' } // walks settle, bot does not move
  for (let i = 0; i < 4; i++) {
    await assert.doesNotReject(() => gotoSafe(bot, goal, { timeoutMs: 500, label: 'stalled walk' }))
  }
  assert.equal(gotoCalls, 8, 'the four stalled walks still ran (the evidence was still short)')
  // the fifth walk now dies at the consult - the pathfinder is never touched
  // (the consult refusal is a SYNC throw - wrap async for assert.rejects)
  await assert.rejects(
    async () => gotoSafe(bot, goal, { timeoutMs: 500, label: 'churn re-issue' }),
    /walk governor.*without progress/,
    'the churn re-issue must be refused with the named message'
  )
  assert.equal(gotoCalls, 8, 'a refused walk never reaches the pathfinder (zero cost)')
  const wgs = walkGovernorStatsFor()
  assert.equal(wgs.opens, 1)
  assert.equal(wgs.refusals, 1)
})

test('jobqueue wiring: progress closes the stall early - a rescued walker walks again', async () => {
  resetWalkGovernors()
  resetDoomedGoalLedger()
  let gotoCalls = 0
  const bot = {
    _waterRescue: false,
    entity: { position: pos(0, 64, 0) },
    pathfinder: { goto: async () => { gotoCalls++; return 'done' }, stop () {}, setGoal () {}, isMoving () { return false } },
    waitForTicks: async () => {},
    on () {}, removeListener () {}
  }
  const goal = { x: 200, y: 64, z: 200 }
  bot.entity.position = pos(0, 64, 0)
  for (let i = 0; i < 4; i++) await gotoSafe(bot, goal, { timeoutMs: 500, label: 'stalled walk' }) // churn builds
  await assert.rejects(async () => gotoSafe(bot, goal, { timeoutMs: 500, label: 'refused' }), /walk governor/) // the 5th opens+refuses
  // a rescue hauls the bot 10 blocks while the stall is open
  bot.entity.position = pos(10, 64, 0)
  await gotoSafe(bot, goal, { timeoutMs: 500, label: 'post-rescue walk' })
  assert.equal(gotoCalls, 5, 'the moved bot must walk again (early close) - 4 stalled + 1 post-rescue')
  const wgs = walkGovernorStatsFor()
  assert.equal(wgs.opens, 1)
  assert.equal(wgs.refusals, 1)
})
