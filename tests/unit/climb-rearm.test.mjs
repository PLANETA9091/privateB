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
  gotoSafe, recordDoomedGoal, doomedGoalStats, resetDoomedGoalLedger, DOOMED_GOAL_RADIUS,
  ASSIST_BURST_SEARCH_RADIUS, ASSIST_BURST_THINK_TIMEOUT_MS
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

// ---------------------------------------------------------------------------
// (v0.358.0) THE ASSIST BURST CAP - face 13 (36740244530, exit 143) stormguard-
// FATAL'd on a NEAR goal: the climb rise assist's step cell sits 1-2 blocks
// out, the v0.144.0 far-goal cap (distance-keyed) never applied, and the boot
// 32/2000 burst ran on open-water geometry - the swimmable frontier exploded,
// rss 425M -> 1753M in one burst, the main locked 5s, every closure applier
// dead on the locked thread. The assist now rides caller-explicit burst knobs
// (the far-cap's proven 24/500 pair) - radius 24 is an order of magnitude
// past any legal 1-2 block jump, so the cap only kills the pathological
// flood-fill, and the swap restores in gotoSafe's finally (the deposit law).
// ---------------------------------------------------------------------------
test('THE ASSIST BURST CAP: the explicit knobs bound the burst and restore on resolve', async () => {
  resetDoomedGoalLedger()
  assert.equal(ASSIST_BURST_SEARCH_RADIUS, 24, 'the far-cap PROVEN radius (one burst shape, one law)')
  assert.equal(ASSIST_BURST_THINK_TIMEOUT_MS, 500, 'the far-cap PROVEN think (the v0.144.0 math: ~4x fewer nodes, 4x sooner yield)')
  const seen = {}
  const bot = {
    _waterRescue: false,
    pathfinder: {
      searchRadius: 32,
      thinkTimeout: 2000,
      goto () {
        seen.radius = bot.pathfinder.searchRadius
        seen.think = bot.pathfinder.thinkTimeout
        return Promise.resolve('done')
      },
      stop () {},
      setGoal () {}
    },
    waitForTicks: () => Promise.resolve()
  }
  await gotoSafe(bot, { x: 10, y: FLOOR + 7, z: 10 }, { timeoutMs: 500, label: 'burst probe', burstRadius: ASSIST_BURST_SEARCH_RADIUS, burstThinkMs: ASSIST_BURST_THINK_TIMEOUT_MS })
  assert.equal(seen.radius, 24, 'the burst radius is the capped pair DURING the walk')
  assert.equal(seen.think, 500, 'the burst think is the capped pair DURING the walk')
  assert.equal(bot.pathfinder.searchRadius, 32, 'the boot radius is restored after the resolve (the crippled-pathfinder class)')
  assert.equal(bot.pathfinder.thinkTimeout, 2000, 'the boot think is restored after the resolve')
})

test('THE ASSIST BURST CAP: the restore survives the rejection (a dead walk never cripples the bot)', async () => {
  resetDoomedGoalLedger()
  const seen = {}
  const bot = {
    _waterRescue: false,
    pathfinder: {
      searchRadius: 32,
      thinkTimeout: 2000,
      goto () {
        seen.radius = bot.pathfinder.searchRadius
        return Promise.reject(new Error('No path to the goal!'))
      },
      stop () {},
      setGoal () {}
    },
    waitForTicks: () => Promise.resolve()
  }
  await assert.rejects(
    async () => gotoSafe(bot, { x: 11, y: FLOOR + 7, z: 10 }, { timeoutMs: 500, label: 'burst probe reject', burstRadius: 24, burstThinkMs: 500 }),
    /No path/
  )
  assert.equal(seen.radius, 24, 'the cap rode the failing walk too')
  assert.equal(bot.pathfinder.searchRadius, 32, 'the boot radius is restored after the reject')
  assert.equal(bot.pathfinder.thinkTimeout, 2000, 'the boot think is restored after the reject')
})

test('THE ASSIST BURST CAP: junk knobs read uncapped - a missing cap never invents one', async () => {
  resetDoomedGoalLedger()
  const seen = {}
  const bot = {
    _waterRescue: false,
    pathfinder: {
      searchRadius: 32,
      thinkTimeout: 2000,
      goto () {
        seen.radius = bot.pathfinder.searchRadius
        seen.think = bot.pathfinder.thinkTimeout
        return Promise.resolve('done')
      },
      stop () {},
      setGoal () {}
    },
    waitForTicks: () => Promise.resolve()
  }
  // NaN, zero and negative are impossible caps - the walk runs at boot defaults
  // (a unique cell per iteration: the mock never arrives, so a shared cell
  // would ledger a doomed verdict and refuse the second probe)
  let idx = 0
  for (const junk of [NaN, 0, -5]) {
    await gotoSafe(bot, { x: 12, y: FLOOR + 7, z: 10 + idx }, { timeoutMs: 500, label: `junk burst ${idx}`, burstRadius: junk, burstThinkMs: 500 })
    assert.equal(seen.radius, 32, `junk radius ${junk} reads uncapped (the body-guard law)`)
    assert.equal(seen.think, 2000, `junk radius ${junk} never touches the think`)
    idx++
  }
  await gotoSafe(bot, { x: 13, y: FLOOR + 7, z: 40 }, { timeoutMs: 500, label: 'junk burst think', burstRadius: 24, burstThinkMs: NaN })
  assert.equal(seen.radius, 32, 'a junk think caps nothing (both knobs or none)')
  assert.equal(seen.think, 2000, 'a junk think reads the boot default')
})

test('THE ASSIST BURST CAP: the wiring pins (the call carries the knobs, the restore rides burstOn)', () => {
  // the dead-wire class: the knobs exist but are not passed is the failure shape
  const call = minerSrc.match(/gotoSafe\(bot, new goals\.GoalBlock\(recovery\.stepTop\.[\s\S]*?\)\)/)
  assert.match(call[0], /burstRadius:\s*ASSIST_BURST_SEARCH_RADIUS/, 'the burst radius rides the assist call')
  assert.match(call[0], /burstThinkMs:\s*ASSIST_BURST_THINK_TIMEOUT_MS/, 'the burst think rides the assist call')
  // the restore guard keys on the COMBINED cap (the far cap keeps precedence;
  // an explicit-only walk must restore too)
  assert.match(minerSrc, /from '\.\.\/lib\/jobqueue\.mjs'/)
  const jobSrc = readFileSync(new URL('../../src/lib/jobqueue.mjs', import.meta.url), 'utf8')
  assert.ok(jobSrc.includes("if (!burstOn || !pf) return"), 'the restore guard keys on the combined cap (the explicit-only walk restores too)')
  assert.match(jobSrc, /const burstRadiusEff = capThink \? FAR_GOAL_SEARCH_RADIUS : Math\.floor\(burstRadius\)/, 'the far cap keeps precedence over the caller hint')
  assert.ok(jobSrc.includes('THE ASSIST BURST CAP knobs'), 'the knobs carry their own doctrine comment')
})
