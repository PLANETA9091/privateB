// Tests for the doomed-goal ledger in src/lib/jobqueue.mjs (v0.72.0).
// MEASURED (run68, dispatch 35698977810, the v0.70.0 600s fleet, HARD KILL):
// two main-thread freezes (mainLate 150559ms + 63973ms), the blackbox naming
// the gotoSafe funnel with goal->queue->done cycles ~7.5s apart - a RE-ISSUE
// SPIRAL: task loops re-issuing walk goals whose A* can never close, every
// re-issue a full think window on the one shared main thread, path=6a/11q
// feeding it. The ledger kills the fuel: the FIRST dead verdict ledgered, the
// re-issues die at the consult for 0 cost. The verdict shapes are the
// pathfinder's own: 'No path to the goal!' (proven, 90s) and 'Took to long to
// decide path to goal!' (the A* calc timeout, weak, 45s); walk-budget
// timeouts ('timeout after Nms') are transient saturation and never record.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  gotoSafe, recordDoomedGoal, nearDoomedGoal, doomedGoalStats, resetDoomedGoalLedger
} from '../../src/lib/jobqueue.mjs'

// isolated geometry per test: each test owns a unique y-floor so the shared
// module singleton never crosses verdicts between tests
const FLOOR = 900 // far above any real world geometry

function mockBot ({ gotoError = null, gotoResult = 'done' } = {}) {
  const calls = { goto: 0, stop: 0, setGoal: 0 }
  const bot = {
    _waterRescue: false,
    pathfinder: {
      goto () {
        calls.goto++
        return gotoError ? Promise.reject(new Error(gotoError)) : Promise.resolve(gotoResult)
      },
      stop () { calls.stop++ },
      setGoal () { calls.setGoal++ }
    },
    waitForTicks: () => Promise.resolve()
  }
  return { bot, calls }
}

test('doomed-goal ledger: the run68 spiral shape - the FIRST dead verdict ledgered, the re-issue is refused for 0 cost', async () => {
  resetDoomedGoalLedger()
  const cell = { x: -121, y: FLOOR + 1, z: 400 } // a run68-shaped lake-bottom column
  const { bot, calls } = mockBot({ gotoError: 'No path to the goal!' })
  // attempt 1: the A* pays its full verdict, the catch records the cell
  await assert.rejects(() => gotoSafe(bot, { x: cell.x, y: cell.y, z: cell.z }, { timeoutMs: 500, label: 'next column' }), /No path/)
  assert.equal(calls.goto, 1)
  assert.equal(doomedGoalStats().records, 1, 'the verdict recorded')
  // the re-issue (the same task loop, 7.5s later): refused BEFORE the queue
  await assert.rejects(
    async () => gotoSafe(bot, { x: cell.x, y: cell.y, z: cell.z }, { timeoutMs: 500, label: 'next column' }),
    /doomed goal \(ledgered \d+s ago/
  )
  assert.equal(calls.goto, 1, 'the pathfinder NEVER ran again - the spiral fuel is gone')
  assert.equal(doomedGoalStats().refusals, 1)
  // a DIFFERENT bot (the fleet shares the module singleton) hits the same ledger
  const { bot: bot2, calls: calls2 } = mockBot()
  await assert.rejects(async () => gotoSafe(bot2, { x: cell.x, y: cell.y, z: cell.z }, { timeoutMs: 500 }), /doomed goal/)
  assert.equal(calls2.goto, 0)
})

test('doomed-goal ledger: the A* calc timeout records at the WEAK 45s ttl', async () => {
  resetDoomedGoalLedger()
  const cell = { x: -156, y: FLOOR + 2, z: 410 }
  const { bot } = mockBot({ gotoError: 'Took to long to decide path to goal!' })
  await assert.rejects(() => gotoSafe(bot, { x: cell.x, y: cell.y, z: cell.z }, { timeoutMs: 500 }), /Took to long/)
  const hit = nearDoomedGoal(cell, Date.now())
  assert.equal(hit.hit, true)
  assert.ok(hit.ageMs < 5000, 'fresh verdict')
  resetDoomedGoalLedger()
  // the ttl rides the entry: recorded via recordDoomedGoal with the weak ttl
  recordDoomedGoal(cell, Date.now(), { ttl: 45000 })
  assert.equal(nearDoomedGoal(cell, Date.now() + 44000).hit, true)
  assert.equal(nearDoomedGoal(cell, Date.now() + 46000).hit, false, 'the weak verdict expires at 45s')
})

test('doomed-goal ledger: walk-budget timeouts are NOT geometry - they never record', async () => {
  resetDoomedGoalLedger()
  const cell = { x: -103, y: FLOOR + 3, z: 383 }
  const { bot, calls } = mockBot({ gotoError: 'climb rise assist: timeout after 4500ms' })
  await assert.rejects(() => gotoSafe(bot, { x: cell.x, y: cell.y, z: cell.z }, { timeoutMs: 500 }), /timeout after 4500ms/)
  assert.equal(calls.goto, 1)
  assert.equal(doomedGoalStats().records, 0, 'saturation is not a death sentence - the retry stays legal')
  assert.equal(nearDoomedGoal(cell, Date.now()).hit, false)
  // the same for a rescue interlock and a stopped path - transient state
  const { bot: b2 } = mockBot({ gotoError: 'water rescue in progress (walk refused)' })
  await assert.rejects(() => gotoSafe(b2, { x: cell.x, y: FLOOR + 4, z: cell.z }, { timeoutMs: 500 }), /water rescue/)
  assert.equal(doomedGoalStats().records, 0)
})

test('doomed-goal ledger: the consult radius is TIGHT (2) - a good chest 3 blocks away stays walkable, junk goals never consult', async () => {
  resetDoomedGoalLedger()
  // the v0.65.0 lesson, re-proven for goals: yard rows pack chests 2 blocks
  // apart, so a doomed verdict for chest A's goal cell must NOT refuse chest B's
  // walk (the deposit test 'a failed hop names its chest...' pins the same
  // geometry from the scan side). DOOMED_GOAL_RADIUS=2 covers the same-cell
  // re-issue and a small snap-wander, nothing more.
  recordDoomedGoal({ x: 500, y: FLOOR + 5, z: 500 }, Date.now())
  assert.equal(nearDoomedGoal({ x: 500, y: FLOOR + 5, z: 500 }, Date.now(), { radius: 2 }).hit, true, 'the same cell refuses')
  assert.equal(nearDoomedGoal({ x: 501, y: FLOOR + 5, z: 501 }, Date.now(), { radius: 2 }).hit, true, 'd=1.4 within radius 2 (snap wander)')
  assert.equal(nearDoomedGoal({ x: 503, y: FLOOR + 5, z: 500 }, Date.now(), { radius: 2 }).hit, false, 'd=3 (chest B) does NOT match')
  assert.equal(nearDoomedGoal({ x: 510, y: FLOOR + 5, z: 500 }, Date.now(), { radius: 2 }).hit, false, 'd=10 outside')
  assert.equal(nearDoomedGoal({ x: 500, y: FLOOR + 30, z: 500 }, Date.now(), { radius: 2 }).hit, false, 'dy=25 outside the y band')
  // junk goals: no crash, no consult, no record
  const { bot, calls } = mockBot({ gotoError: 'No path to the goal!' })
  const recordsBefore = doomedGoalStats().records
  await assert.rejects(() => gotoSafe(bot, { x: NaN, y: 64, z: 0 }, { timeoutMs: 500 }), /No path/)
  await assert.rejects(() => gotoSafe(bot, null, { timeoutMs: 500 }), /No path/)
  assert.equal(doomedGoalStats().records, recordsBefore, 'junk goals record nothing (the manual radius record is the only one)')
  assert.equal(calls.goto, 2, 'junk goals still walked (the A* owns its own verdict)')
})

test('doomed-goal ledger: the water-rescue gate still outranks everything (unchanged polarity)', async () => {
  resetDoomedGoalLedger()
  const { bot } = mockBot()
  bot._waterRescue = true
  await assert.rejects(async () => gotoSafe(bot, { x: 1, y: 64, z: 1 }, { timeoutMs: 500 }), /water rescue in progress/)
  // and a doomed consult never fires for a rescue-gated bot: the rescue throws first
  assert.equal(doomedGoalStats().refusals, 0)
})

// -------------------------------------------------- v0.92.0 the machine doom ttl
test('doomed-goal ledger: the caller ttl - a machine cell verdict lives 15s, not 45/90 (run81: 15 machines refused ledgered-1s-ago, a fresh camp furnace killed for the run)', async () => {
  resetDoomedGoalLedger()
  const cell = { x: -130, y: FLOOR + 10, z: 380 }
  const { bot } = mockBot({ gotoError: 'Took to long to decide path to goal!' })
  // the machine walk records with the caller's short ttl
  await assert.rejects(() => gotoSafe(bot, { x: cell.x, y: cell.y, z: cell.z }, { timeoutMs: 500, label: 'walk to furnace', doomTtl: 15000 }), /Took to long/)
  assert.equal(nearDoomedGoal(cell, Date.now() + 14000).hit, true, 'live inside the 15s window - the spiral breaker still works')
  assert.equal(nearDoomedGoal(cell, Date.now() + 16000).hit, false, 'dead at 16s - the next chain finds the static machine walkable again')
  // the default verdict would still be live at 16s (45s) - the override is real
  resetDoomedGoalLedger()
  await assert.rejects(() => gotoSafe(bot, { x: cell.x, y: cell.y, z: cell.z }, { timeoutMs: 500, label: 'walk to furnace' }), /Took to long/)
  assert.equal(nearDoomedGoal(cell, Date.now() + 16000).hit, true, 'no caller ttl = the legacy 45s timeout verdict')
})

test('doomed-goal ledger: the caller ttl overrides the STRONG 90s No path verdict too (the machine is static, its geometry changes under the diggers)', async () => {
  resetDoomedGoalLedger()
  const cell = { x: -126, y: FLOOR + 11, z: 381 }
  const { bot } = mockBot({ gotoError: 'No path to the goal!' })
  await assert.rejects(() => gotoSafe(bot, { x: cell.x, y: cell.y, z: cell.z }, { timeoutMs: 500, label: 'walk to furnace', doomTtl: 15000 }), /No path/)
  assert.equal(nearDoomedGoal(cell, Date.now() + 14000).hit, true)
  assert.equal(nearDoomedGoal(cell, Date.now() + 16000).hit, false, 'a proven No path on a machine cell still expires in 15s')
  // junk ttls fall back to the legacy lifetimes (negative / NaN / junk)
  resetDoomedGoalLedger()
  await assert.rejects(() => gotoSafe(bot, { x: cell.x, y: cell.y, z: cell.z }, { timeoutMs: 500, label: 'walk to furnace', doomTtl: -5 }), /No path/)
  assert.equal(nearDoomedGoal(cell, Date.now() + 16000).hit, true, 'a negative ttl is junk - the legacy 90s stands')
  resetDoomedGoalLedger()
  await assert.rejects(() => gotoSafe(bot, { x: cell.x, y: cell.y, z: cell.z }, { timeoutMs: 500, label: 'walk to furnace', doomTtl: NaN }), /No path/)
  assert.equal(nearDoomedGoal(cell, Date.now() + 16000).hit, true, 'a NaN ttl is junk - the legacy 90s stands')
})

// ---------------------------------------------- v0.96.0 THE RE-DOOM BACKOFF
test('doomed-goal ledger: the re-doom backoff - a storm of machine failures cannot out-pace the 15s ttl anymore (run85: F5/F14/F16 refused seven yard machines ledgered-1s-ago x23)', async () => {
  resetDoomedGoalLedger()
  const cell = { x: -135, y: FLOOR + 12, z: 382 }
  const { bot } = mockBot({ gotoError: 'Took to long to decide path to goal!' })
  // the first failure records the 15s verdict through the funnel
  await assert.rejects(() => gotoSafe(bot, { x: cell.x, y: cell.y, z: cell.z }, { timeoutMs: 500, label: 'walk to furnace', doomedRearm: true, doomTtl: 15000 }), /Took to long/)
  assert.equal(doomedGoalStats().records, 1)
  assert.equal(doomedGoalStats().absorbed, 0)
  // the storm: every rearmed re-failure inside the window is ABSORBED - the
  // counter names it, and the entry is NOT refreshed ('ledgered 1s ago'
  // cannot recur: the age keeps running from the FIRST failure)
  await assert.rejects(() => gotoSafe(bot, { x: cell.x, y: cell.y, z: cell.z }, { timeoutMs: 500, label: 'walk to furnace', doomedRearm: true, doomTtl: 15000 }), /Took to long/)
  await assert.rejects(() => gotoSafe(bot, { x: cell.x, y: cell.y, z: cell.z }, { timeoutMs: 500, label: 'walk to furnace', doomedRearm: true, doomTtl: 15000 }), /Took to long/)
  assert.equal(doomedGoalStats().records, 3, 'every failure still counts as an attempt to record')
  assert.equal(doomedGoalStats().absorbed, 2, 'the FLEET RESULT names the absorbed re-dooms')
  // direct pin: the absorbed verdict expires on schedule even mid-storm
  resetDoomedGoalLedger()
  recordDoomedGoal(cell, 9000000, { ttl: 15000 })
  recordDoomedGoal(cell, 9001000, { ttl: 15000 })
  recordDoomedGoal(cell, 9002000, { ttl: 15000 })
  assert.equal(nearDoomedGoal(cell, 9014999).hit, true)
  assert.equal(nearDoomedGoal(cell, 9015100).hit, false, 'the ttl expires DESPITE three re-dooms (the run85 spiral is dead)')
  // and past the expiry the next failure records a FRESH verdict again
  recordDoomedGoal(cell, 9016000, { ttl: 15000 })
  assert.equal(nearDoomedGoal(cell, 9016500).hit, true, 're-terrain recovery intact')
})
