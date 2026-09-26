// (v0.228.0) THE SWEEP DEFER - the harvest sweep's walk refusals classify and
// the census defers instead of burning. Driven with a mock bot + mock furnace
// windows - no server needed.
//
// THE MEASURED ANATOMY (run68, 36273368339, the joint tree's field face):
//   F6 sweep: 0 collected - machine unreachable (goal brake: 6 goals in 5s -
//     walk to a machine (sweep) refused for 2s) x4, ... refused for 3s) x4,
//     ... refused for 1s) x2, ... refused for 4s) x2, ... refused for 0s) x1
//   F10 sweep: 0 collected - machine unreachable (goal brake ... refused for
//     4s) x4, machine unreachable (The goal was changed before it could be
//     completed!) x1
//   F11 sweep: 0 collected - machine unreachable (The goal was changed ...)
//     x4, machine unreachable (walk governor: bot churned 4 goals without
//     progress ... refused for 12s) x1, ... churned 5 goals ... refused for
//     12s) x1
// Thirteen brake clocks on F6 alone - every one a funnel refusal that never
// consumed a walk - and the census yielded 0 across four bots.
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { Vec3 } from 'vec3'
import { resetDoomedGoalLedger, resetWalkGovernors } from '../../src/lib/jobqueue.mjs'
import {
  sweepFinishedSmelts,
  sweepCensusLine,
  sweepRefusalClass,
  SWEEP_COOLDOWN_WAIT_CAP_MS,
  SWEEP_COOLDOWN_WAITS,
  SWEEP_COOLDOWN_MARGIN_MS,
  SWEEP_DEFER_REASON,
  SMELT_REACH_OPEN_DISTANCE
} from '../../src/lib/smelting.mjs'

const TYPES = new Map()
function item (name, count = 1) {
  if (!TYPES.has(name)) TYPES.set(name, TYPES.size + 1)
  return { name, count, type: TYPES.get(name) }
}

// ---------------------------------------------------------------- mock furnace
// Trimmed to the sweep's touch face: open read (slots + the three item reads),
// takeOutput/takeFuel, close. No burning (outputItem is a pure read here -
// the sweep never feeds a machine).
class MockFurnace {
  constructor ({ name = 'furnace', position = new Vec3(20.5, 64, 20.5), startFuel = null, startOutput = null } = {}) {
    this.name = name
    this.position = position
    this.type = `minecraft:${name}`
    this.id = 7
    this.inventoryStart = 3
    this.inventoryEnd = 39
    this.selectedItem = null
    this.slots = new Array(39).fill(null)
    this.slots[0] = null
    this.slots[1] = startFuel ? { ...startFuel } : null
    this.slots[2] = startOutput ? { ...startOutput } : null
    this.opened = 0
    this.closed = false
  }

  _syncRowsFromInventory (bot) {
    for (let i = 0; i < 36; i++) this.slots[this.inventoryStart + i] = bot._items[i] ? { ...bot._items[i], slot: this.inventoryStart + i } : null
  }

  _syncRowsToInventory (bot) {
    bot._items = this.slots.slice(this.inventoryStart, this.inventoryEnd).filter(Boolean).map(({ slot, ...rest }) => ({ ...rest }))
  }

  _toRows (it) {
    for (let i = this.inventoryStart; i < this.inventoryEnd; i++) {
      if (!this.slots[i]) { this.slots[i] = { ...it }; return }
    }
  }

  _takeBack (slotIdx) {
    if (!this.slots[slotIdx]) return
    this._toRows(this.slots[slotIdx])
    this.slots[slotIdx] = null
  }

  inputItem () { return this.slots[0] ? { ...this.slots[0], slot: 0 } : null }
  fuelItem () { return this.slots[1] ? { ...this.slots[1], slot: 1 } : null }
  outputItem () { return this.slots[2] ? { ...this.slots[2], slot: 2 } : null }

  async takeOutput () {
    assert.ok(this.slots[2], 'takeOutput with empty output slot (mineflayer would throw)')
    this._toRows(this.slots[2])
    this.slots[2] = null
  }

  async takeFuel () { await this._takeBack(1) }

  close () {
    if (this._bot) this._syncRowsToInventory(this._bot)
    this.closed = true
  }
}

// ------------------------------------------------------------------ mock bot
// gotoScript: one entry per pathfinder.goto call. A string throws that
// message; a missing entry SUCCEEDS and moves the bot to the goal (the
// v0.227.0 lesson: a non-moving success IS the famine fingerprint - the mock
// always displaces, the spin book never arms on these tests).
function makeSweepBot ({ machines = [], gotoScript = [] } = {}) {
  const bot = {
    username: 'F6',
    entity: { position: new Vec3(0.5, 64, 0.5) },
    inventory: { items: () => bot._items },
    _items: [],
    _gotoCalls: 0,
    pathfinder: {
      goto: async (goal) => {
        const step = gotoScript[bot._gotoCalls]
        bot._gotoCalls++
        if (typeof step === 'string') throw new Error(step)
        bot.entity.position = new Vec3(goal.x, goal.y, goal.z)
      }
    },
    findBlocks: ({ matching }) => machines.filter(m => matching(m)).map(m => m.position),
    blockAt: (p) => machines.find(m => m.position && m.position.distanceTo(p) < 0.01) ?? null,
    openFurnace: async (block) => {
      const m = machines.find(x => x.position.distanceTo(block.position) < 0.01)
      if (!m) throw new Error('not a furnace-like window')
      m.opened++
      m._bot = bot
      m._syncRowsFromInventory(bot)
      return m
    }
  }
  return bot
}

const FAR = new Vec3(50.5, 64, 50.5) // beyond SMELT_REACH_OPEN_DISTANCE - a walk
const NEAR = new Vec3(2.5, 64, 2.5) // within reach - no walk

beforeEach(() => {
  resetDoomedGoalLedger()
  resetWalkGovernors()
})

// ------------------------------------------------------------- the classifier
test('sweepRefusalClass: the run68 field anatomy classifies', () => {
  // the goal brake - the family, the field's dominant class (F6 x13, F10 x4)
  assert.deepEqual(
    sweepRefusalClass('goal brake: 6 goals in 5s - walk to a machine (sweep) refused for 4s'),
    { cls: 'waitable', waitMs: 4000 }
  )
  assert.deepEqual(
    sweepRefusalClass('goal brake: 6 goals in 5s - walk to a machine (sweep) refused for 0s'),
    { cls: 'waitable', waitMs: 0 }
  )
  // the walk governor - the family with an outliving clock (F11 x2)
  assert.deepEqual(
    sweepRefusalClass('walk governor: bot churned 4 goals without progress - walk to a machine (sweep) refused for 12s'),
    { cls: 'waitable', waitMs: 12000 }
  )
  // the fleet churn ceiling - the family
  assert.match(JSON.stringify(sweepRefusalClass('fleet churn ceiling: 9 zero-progress walks fleet-wide - walk to a machine (sweep) refused for 7s')), /"waitable"/)
  // OUTSIDE the family: the v0.146.0 die-fast law - never waited, deferred
  assert.deepEqual(
    sweepRefusalClass('fleet goal ceiling: 8 goals fleet-wide in 5s - walk to a machine (sweep) refused for 6s'),
    { cls: 'fleetwide', waitMs: 6000 }
  )
  assert.match(JSON.stringify(sweepRefusalClass('alloc valve: closed (storm 40MB/s at rss 900M) - walk to a machine (sweep) refused for 12s')), /"fleetwide"/)
  assert.match(JSON.stringify(sweepRefusalClass('spin breaker: walk to a machine (sweep) re-issued 2x inside the 10s window after its own pf:done - walk to a machine (sweep) refused for 9s (the sync re-issue breaker: the goal->done->goal churn starves the timers, the run53 alloc-storm class, hold live)')), /"fleetwide"/)
  // the storm duck names its pause differently
  assert.deepEqual(
    sweepRefusalClass('storm duck: fleet-wide pathfinder pause 8s left - walk to a machine (sweep) refused (a live storm verdict shut the near exemption; every walk waits out the wind-down)'),
    { cls: 'fleetwide', waitMs: 8000 }
  )
  // the geometry verdicts - the honest census entries, byte for byte
  for (const msg of [
    'No path to the goal!',
    'Took to long to decide path to goal!',
    'The goal was changed before it could be completed!',
    'doomed goal (ledgered 2s ago)',
    'walk to a machine (sweep): timeout after 15000ms',
    'Path was stopped before it could be completed!'
  ]) {
    assert.deepEqual(sweepRefusalClass(msg), { cls: 'geometry', waitMs: 0 }, msg)
  }
  // junk never throws, never waitable
  for (const junk of ['', 'some random failure', null, undefined, 42]) {
    assert.deepEqual(sweepRefusalClass(junk), { cls: 'geometry', waitMs: 0 }, String(junk))
  }
})

test('the constants carry the run68 calibration: the field brake waits, the governor defers', () => {
  assert.equal(SWEEP_COOLDOWN_WAIT_CAP_MS, 5000)
  assert.equal(SWEEP_COOLDOWN_WAITS, 1)
  assert.equal(SWEEP_COOLDOWN_MARGIN_MS, 1000)
  assert.equal(SWEEP_DEFER_REASON, 'sweep deferred (the lanes hold)')
  // the field clocks: the brake's 4s fits the cap, the governor's 12s and the
  // spin hold's 30s outlive it - the cap IS the class boundary the field drew
  assert.ok(4000 <= SWEEP_COOLDOWN_WAIT_CAP_MS, 'the field brake clock (0-4s) is waitable')
  assert.ok(SWEEP_COOLDOWN_WAIT_CAP_MS < 12000, 'the field governor clock (11-12s) defers')
  assert.ok(SWEEP_COOLDOWN_WAIT_CAP_MS < 30000, 'the spin hold (30s) defers')
  assert.ok(SMELT_REACH_OPEN_DISTANCE > 0)
})

// ------------------------------------------------------------------ the wiring
test('the wait-out converts the burn into a harvest: one brake clock, the same machine collects', async () => {
  // the F6 shape cured: the first walk refused by a 1s brake clock (inside the
  // cap), the sweep waits it out ONCE, the retry admits, the machine harvests.
  const nearF = new MockFurnace({ position: NEAR, startOutput: item('iron_ingot', 2) })
  const farF = new MockFurnace({ position: FAR, startOutput: item('stone', 3) })
  const bot = makeSweepBot({
    machines: [nearF, farF],
    gotoScript: ['goal brake: 6 goals in 5s - walk to a machine (sweep) refused for 1s']
  })
  const lines = []
  const res = await sweepFinishedSmelts(bot, { maxSeconds: 20, log: m => lines.push(m) })
  assert.equal(res.collected, 5, 'near + the waited-out far machine both harvest')
  assert.equal(res.attempts.length, 0, 'a waited-out cooldown is not a census failure - the walk completed')
  assert.equal(bot._gotoCalls, 2, 'the refused walk + the retry - no other machine walked')
  assert.ok(lines.some(l => /sweep walk refused by a 1s cooldown - waiting it out once on this machine/.test(l)), 'the wait-out is named')
  assert.ok(!lines.some(l => /sweep deferred/.test(l)), 'no deferral - the wait-out landed')
})

test('a hot brake after the wait-out defers the census: the untried machines keep their attempts', async () => {
  // the F6 burn, deferred: the retry still refused -> the census stops, B and C
  // are NEVER attempted (the old shape burned all 13 one-attempts).
  const a = new MockFurnace({ position: FAR, startOutput: item('stone', 1) })
  const b = new MockFurnace({ position: new Vec3(40.5, 64, 20.5), startOutput: item('stone', 1) })
  const c = new MockFurnace({ position: new Vec3(30.5, 64, 10.5), startOutput: item('stone', 1) })
  const bot = makeSweepBot({
    machines: [a, b, c],
    gotoScript: [
      'goal brake: 6 goals in 5s - walk to a machine (sweep) refused for 1s',
      'goal brake: 6 goals in 5s - walk to a machine (sweep) refused for 2s'
    ]
  })
  const lines = []
  const res = await sweepFinishedSmelts(bot, { maxSeconds: 20, log: m => lines.push(m) })
  assert.equal(res.collected, 0)
  assert.equal(bot._gotoCalls, 2, 'the refusal + the one retry - the census stopped')
  assert.equal(res.attempts.length, 2, 'the named refusal + the defer bucket')
  assert.match(res.attempts[0].reason, /machine unreachable \(goal brake/)
  assert.equal(res.attempts[1].reason, SWEEP_DEFER_REASON)
  for (const f of [a, b, c]) assert.equal(f.opened, 0, 'no machine opened - nothing was reachable')
  assert.ok(lines.some(l => /sweep deferred \(the lanes hold\) - the cooldown kept the walk after the wait-out \(2 machine\(s\) untried/.test(l)), 'the deferral names the untried count')
})

test('the cap: a 12s governor clock defers without a wait', async () => {
  // the F11 shape: 12s outlives the census clock - deferred immediately, no
  // wait, no retry (the test would take 12s+ if the sweep waited).
  const a = new MockFurnace({ position: FAR, startOutput: item('stone', 1) })
  const b = new MockFurnace({ position: new Vec3(40.5, 64, 20.5), startOutput: item('stone', 1) })
  const bot = makeSweepBot({
    machines: [a, b],
    gotoScript: ['walk governor: bot churned 4 goals without progress - walk to a machine (sweep) refused for 12s']
  })
  const lines = []
  const res = await sweepFinishedSmelts(bot, { maxSeconds: 20, log: m => lines.push(m) })
  assert.equal(res.collected, 0)
  assert.equal(bot._gotoCalls, 1, 'one refusal, no retry - a 12s clock is never waited')
  assert.equal(res.attempts.length, 2)
  assert.match(res.attempts[0].reason, /machine unreachable \(walk governor/)
  assert.equal(res.attempts[1].reason, SWEEP_DEFER_REASON)
  assert.ok(lines.some(l => /sweep deferred \(the lanes hold\) - the 12s cooldown outlives the census clock \(1 machine\(s\) untried/.test(l)), 'the cap branch is named')
})

test('the wait budget is one per sweep: the second family cooldown defers the rest', async () => {
  // breadth over depth holds (findMachineBlocks sorts nearest-first): the
  // budget spent on the nearest walk's wait-out, the next cooldown is NOT
  // waited - the farthest machine's harvest rides the NEXT pass (the census
  // is not a siege). All three machines sit beyond SMELT_REACH_OPEN_DISTANCE.
  const nearFar = new MockFurnace({ position: new Vec3(30.5, 64, 10.5), startOutput: item('stone', 2) }) // d=31.6 - the first walk
  const midFar = new MockFurnace({ position: new Vec3(40.5, 64, 20.5), startOutput: item('stone', 1) }) // d=44.7 - the second walk
  const farthest = new MockFurnace({ position: FAR, startOutput: item('iron_ingot', 4) }) // d=70.7 - untried
  const bot = makeSweepBot({
    machines: [farthest, midFar, nearFar],
    gotoScript: [
      'goal brake: 6 goals in 5s - walk to a machine (sweep) refused for 1s', // nearFar refused...
      undefined, // ...waited out, the retry admits (the budget is spent)
      'goal brake: 6 goals in 5s - walk to a machine (sweep) refused for 1s' // midFar refused - no budget left
    ]
  })
  const lines = []
  const res = await sweepFinishedSmelts(bot, { maxSeconds: 20, log: m => lines.push(m) })
  assert.equal(res.collected, 2, 'only nearFar harvests - the defer stopped the census before farthest')
  assert.equal(bot._gotoCalls, 3)
  const buckets = res.attempts.map(x => x.reason)
  assert.ok(buckets.some(r => /machine unreachable \(goal brake/.test(r)), 'midFar\'s refusal is named')
  assert.ok(buckets.includes(SWEEP_DEFER_REASON), 'the defer bucket rides')
  assert.ok(!midFar.opened && !farthest.opened, 'no machine past the defer opened')
  assert.ok(lines.some(l => /the wait-out budget is spent \(1 machine\(s\) untried/.test(l)), 'the budget branch is named')
})

test('a fleet-wide pause is never waited - the die-fast law defers the census', async () => {
  // the v0.146.0 exclusion rides: a fleet goal ceiling clock is not one bot's
  // clock. No wait, no retry - the census defers immediately.
  const a = new MockFurnace({ position: FAR, startOutput: item('stone', 1) })
  const b = new MockFurnace({ position: new Vec3(40.5, 64, 20.5), startOutput: item('stone', 1) })
  const bot = makeSweepBot({
    machines: [a, b],
    gotoScript: ['fleet goal ceiling: 8 goals fleet-wide in 5s - walk to a machine (sweep) refused for 6s']
  })
  const lines = []
  const res = await sweepFinishedSmelts(bot, { maxSeconds: 20, log: m => lines.push(m) })
  assert.equal(res.collected, 0)
  assert.equal(bot._gotoCalls, 1, 'one refusal - a fleet-wide pause is never waited')
  assert.equal(res.attempts[1].reason, SWEEP_DEFER_REASON)
  assert.ok(lines.some(l => /sweep deferred \(the lanes hold\) - a fleet-wide pause holds the lanes/.test(l)), 'the fleet-wide branch is named')
})

test('geometry keeps the census byte for byte: no wait, no defer, the sweep moves on', async () => {
  // the discriminator: geometry verdicts are honest failures - each machine
  // gets its named attempt, the sweep continues, nothing defers.
  const a = new MockFurnace({ position: FAR, startOutput: item('stone', 1) })
  const b = new MockFurnace({ position: new Vec3(40.5, 64, 20.5), startOutput: item('stone', 1) })
  const c = new MockFurnace({ position: NEAR, startOutput: item('iron_ingot', 4) })
  const bot = makeSweepBot({
    machines: [a, b, c],
    gotoScript: [
      'No path to the goal!',
      'The goal was changed before it could be completed!'
    ]
  })
  const lines = []
  const res = await sweepFinishedSmelts(bot, { maxSeconds: 20, log: m => lines.push(m) })
  assert.equal(res.collected, 4, 'the reachable machine still gets swept')
  assert.equal(res.attempts.length, 2, 'exactly the two named geometry failures - no defer bucket')
  assert.ok(!res.attempts.some(x => x.reason === SWEEP_DEFER_REASON), 'geometry never defers')
  assert.equal(bot._gotoCalls, 2)
  assert.ok(!lines.some(l => /sweep deferred/.test(l)), 'the census moved on silently, the v0.139.0 shape')
})

test('the sweep clock that cannot afford the wait defers (the honest boundary)', async () => {
  // maxSeconds 1, a 4s named clock: the wait would outrun the census - the
  // defer fires without spending the budget.
  const a = new MockFurnace({ position: FAR, startOutput: item('stone', 1) })
  const bot = makeSweepBot({
    machines: [a],
    gotoScript: ['goal brake: 6 goals in 5s - walk to a machine (sweep) refused for 4s']
  })
  const lines = []
  const res = await sweepFinishedSmelts(bot, { maxSeconds: 1, log: m => lines.push(m) })
  assert.equal(res.collected, 0)
  assert.equal(bot._gotoCalls, 1)
  assert.equal(res.attempts.length, 1, 'the last machine: the refusal named, no defer bucket (nothing untried)')
  assert.match(res.attempts[0].reason, /machine unreachable/)
  assert.ok(!res.attempts.some(x => x.reason === SWEEP_DEFER_REASON), 'untried=0 - the defer bucket stays out')
  assert.ok(lines.some(l => /the sweep clock cannot afford the wait/.test(l)), 'the clock branch is named')
})

// ------------------------------------------------------------- the census line
test('sweepCensusLine: the defer bucket rides the v0.197.0 histogram', () => {
  const line = sweepCensusLine({
    collected: 0,
    attempts: [
      { machine: 'furnace', reason: 'machine unreachable (goal brake: 6 goals in 5s - walk to a machine (sweep) refused for 4s)' },
      { machine: 'furnace', reason: SWEEP_DEFER_REASON }
    ],
    machines: 5
  }, { username: 'F6' })
  assert.ok(line.startsWith('F6 sweep: 0 collected - '), 'the histogram shape opens')
  assert.ok(line.includes('machine unreachable (goal brake: 6 goals in 5s - walk to a machine (sweep) refused for 4s) x1'), 'the refusal bucket rides verbatim')
  assert.ok(line.includes(', sweep deferred (the lanes hold) x1'), 'the defer bucket rides (name asc: m < s)')
})

test('sweepCensusLine: a harvest still reads the v0.139.0 shape (the defer lives in the log, not the harvest line)', () => {
  const line = sweepCensusLine({ collected: 3, outputs: { iron_ingot: 3 }, attempts: [{ machine: 'furnace', reason: SWEEP_DEFER_REASON }], machines: 4 }, { username: 'F8' })
  assert.equal(line, 'F8 sweep: collected 3 (iron_ingot:3)', 'byte for byte - the v0.139.0 comparability holds')
})

// ----------------------------------------------------------------- the source
test('REGRESSION PIN: the sweep defer rides the smelting source', () => {
  const src = readFileSync(new URL('../../src/lib/smelting.mjs', import.meta.url), 'utf8')
  assert.match(src, /export function sweepRefusalClass/, 'the classifier is a named export')
  assert.match(src, /WALK_REFUSAL_WAIT_RE\.test\(m\)/, 'the classifier reuses the v0.146.0 family law - no parallel doctrine')
  assert.match(src, /sweepRefusalClass\(e\.message\)/, 'the first refusal classifies')
  assert.match(src, /sweepRefusalClass\(e2\.message\)\.cls !== 'geometry'/, 'the retry\'s refusal classifies too')
  assert.match(src, /waitsLeft = SWEEP_COOLDOWN_WAITS/, 'the budget is the named constant')
  assert.match(src, /await sleep\(cls\.waitMs \+ SWEEP_COOLDOWN_MARGIN_MS\)/, 'the wait carries the margin')
  assert.match(src, /attempts\.push\(\{ machine: machineBlock\.name, reason: SWEEP_DEFER_REASON \}\)/, 'the defer rides the stable bucket')
  assert.match(src, /for \(const \[mi, machineBlock\] of machines\.entries\(\)\)/, 'the untried count needs the index')
})
