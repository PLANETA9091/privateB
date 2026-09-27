// Tests for the climb rise assist's doomed-goal re-arm (v0.232.0).
//
// MEASURED (fleet 36284626465, the 0.231.0 field face, COMPLETED SUCCESS but
// banked=0 with pocket 1763u/3000u+ stranded underground): F14 mid-climb at
// y=53-54 (dug=7, the staircase moving) read 'climb rise assist: assist did
// not complete (goto: doomed goal (ledgered 5s ago at [-114,53,406]) - climb
// rise assist refused)' - the doomed ledger's 2-block verdict radius ate the
// climb machinery's own bounded assist, the climb stalled ('climb out:
// failed - stalled'), and the bank chain died at the shaft bottom while the
// pockets grew. The ledger's verdict models a WALK's start geometry; the
// assist's goal is the step cell the climb's OWN dig pass just verified
// clean - fresh ground truth the ledger cannot have - so the assist walks
// with doomedRearm: true (the v0.87.0 honesty valve, counted in
// doomedStats.rearms, the ledger itself untouched).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  gotoSafe, recordDoomedGoal, doomedGoalStats, resetDoomedGoalLedger, DOOMED_GOAL_RADIUS
} from '../../src/lib/jobqueue.mjs'

const minerSrc = readFileSync(new URL('../../src/bots/miner.mjs', import.meta.url), 'utf8')

// isolated geometry per test: each test owns a unique y-floor so the shared
// module singleton never crosses verdicts between tests
const FLOOR = 1100 // far above any real world geometry

function mockBot ({ gotoError = null } = {}) {
  const calls = { goto: 0, stop: 0, setGoal: 0 }
  const bot = {
    _waterRescue: false,
    pathfinder: {
      goto () {
        calls.goto++
        return gotoError ? Promise.reject(new Error(gotoError)) : Promise.resolve('done')
      },
      stop () { calls.stop++ },
      setGoal () { calls.setGoal++ }
    },
    waitForTicks: () => Promise.resolve()
  }
  return { bot, calls }
}

test('REGRESSION PIN: the rise assist call carries the re-arm (the run195 dead-wire class - only the call site can prove it)', () => {
  const call = minerSrc.match(/gotoSafe\(bot, new goals\.GoalBlock\(recovery\.stepTop\.[\s\S]*?\)\)/)
  assert.ok(call, 'the rise assist call site exists in the climb recovery block')
  assert.match(call[0], /label:\s*'climb rise assist'/, 'the assist label rides the call (the field face names it)')
  assert.match(call[0], /doomedRearm:\s*true/, 'the re-arm option rides the SAME call (a flag defined but not passed is the dead-wire class)')
})

test('REGRESSION PIN: the re-arm widens nothing - the ledger radius, record and refusal rules are untouched', () => {
  assert.equal(DOOMED_GOAL_RADIUS, 2, 'the consult radius stays TIGHT 2 (the v0.72.0 ledger governs every other walk byte for byte)')
  const consult = minerSrc.includes('climb rise assist') && minerSrc.split('doomedRearm: true').length >= 2
  assert.ok(consult, 'the miner carries exactly the assist-side flag (no other climb call grew the option this fire)')
})

test('doomed-goal ledger: the re-arm BYPASSES the refusal for the assist - the pathfinder runs where the plain walk died', async () => {
  resetDoomedGoalLedger()
  const cell = { x: -114, y: FLOOR, z: 406 } // the F14 field face's cell shape
  // a stale walk verdict sits on the cell (the failed walk that poisoned the shaft)
  recordDoomedGoal(cell, Date.now(), { ttl: 90000 })
  // WITHOUT the flag: the plain walk dies at the consult, the pathfinder never runs
  const plain = mockBot()
  await assert.rejects(
    async () => gotoSafe(plain.bot, { x: cell.x, y: cell.y, z: cell.z }, { timeoutMs: 500, label: 'some walk' }),
    /doomed goal \(ledgered \d+s ago/
  )
  assert.equal(plain.calls.goto, 0, 'the ledger still refuses plain walks for 0 cost (the run68 spiral cure is intact)')
  // WITH the flag (the climb assist's shape): the consult yields, the pathfinder runs, the walk lands
  const armed = mockBot()
  await gotoSafe(armed.bot, { x: cell.x, y: cell.y, z: cell.z }, { timeoutMs: 500, label: 'climb rise assist', doomedRearm: true })
  assert.equal(armed.calls.goto, 1, 'the re-arm buys the one honest attempt (the dig-verified step cell gets its bounded A* think)')
  assert.equal(doomedGoalStats().rearms >= 1, true, 'the re-arm is COUNTED (the FLEET RESULT names the frequency)')
})

test('doomed-goal ledger: a genuinely dead step cell still fails honestly through the re-arm (the rotate ladder owns it)', async () => {
  resetDoomedGoalLedger()
  const cell = { x: -119, y: FLOOR + 3, z: 415 }
  const { bot, calls } = mockBot({ gotoError: 'No path to the goal!' })
  // first attempt through the re-arm: the pathfinder RUNS (the consult yielded), the A* pays its verdict
  await assert.rejects(
    async () => gotoSafe(bot, { x: cell.x, y: cell.y, z: cell.z }, { timeoutMs: 500, label: 'climb rise assist', doomedRearm: true }),
    /No path/
  )
  assert.equal(calls.goto, 1, 'the re-arm is not a free pass - the dead geometry still costs its verdict')
  assert.equal(doomedGoalStats().records, 1, 'the verdict still records (the ledger learns from the re-armed failure too)')
})
