// Smelting pipeline: furnace claiming, verified transfers, fuel policy, machine
// selection. Driven with a mock bot + mock furnace windows - no server needed.
//
// The mock furnace converts input -> output LAZILY: every outputItem() call turns
// ONE input item into output (when fuel remains). That makes the production poll
// loop advance deterministically with zero timers - each poll sees one more item
// ready, exactly like a real furnace at ~1 item per 10s, just a million times faster.
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { Vec3 } from 'vec3'
import { resetDoomedGoalLedger } from '../../src/lib/jobqueue.mjs'
import {
  SMELT_OUTPUT, machineFor, machineChainFor, fuelYieldOf, fuelNeeded,
  pickFuel, smeltablesIn, findMachineBlocks, smeltBatch, smeltInventory,
  smeltWalkReach, machineWithinReach, smeltZeroWhy, smeltBatchWaitMs, SMELT_REACH_OPEN_DISTANCE,
  smeltFuelKeep, SMELT_FUEL_KEEP, MACHINE_DOOM_TTL_MS,
  furnacePutCount, slotMismatchReason, FURNACE_SLOT_MAX
} from '../../src/lib/smelting.mjs'

// Unique stable numeric type per item name - window transfers match by type, and a
// mock where two items share type 1 moves the WRONG stack (the deposit.test lesson).
const TYPES = new Map()
function item (name, count = 1) {
  if (!TYPES.has(name)) TYPES.set(name, TYPES.size + 1)
  return { name, count, type: TYPES.get(name) }
}

const FAST = { pollMs: 5, smeltSecondsPerItem: 0.02 } // no real furnace time in tests

// ---------------------------------------------------------------- mock furnace
class MockFurnace {
  constructor ({
    name = 'furnace',
    position = new Vec3(10.5, 64, 10.5),
    mode = 'normal',          // normal | never (output never appears) | ghostInput | ghostFuel
    startInput = null,        // another bot's batch already inside
    startFuel = null,
    startOutput = null,
    fuelUnitsPer = 8          // conversions one fuel unit buys (coal-like)
  } = {}) {
    this.name = name
    this.position = position
    this.mode = mode
    this.type = `minecraft:${name}`
    this.id = 7
    this.inventoryStart = 3
    this.inventoryEnd = 39
    this.selectedItem = null
    // slots: 0 = input, 1 = fuel, 2 = output, 3..38 = the player rows (like vanilla)
    this.slots = new Array(39).fill(null)
    this.slots[0] = startInput ? { ...startInput } : null
    this.slots[1] = startFuel ? { ...startFuel } : null
    this.slots[2] = startOutput ? { ...startOutput } : null
    this.fuelUnitsPer = fuelUnitsPer
    this.fuelUnitsLeft = startFuel ? startFuel.count * fuelUnitsPer : 0
    this.opened = 0
    this.closed = false
  }

  // production: the server sends the whole window content on open - the player rows
  // mirror the bot inventory AT OPEN TIME and freeze until the trailing sync on close
  _syncRowsFromInventory (bot) {
    for (let i = 0; i < 36; i++) this.slots[this.inventoryStart + i] = bot._items[i] ? { ...bot._items[i], slot: this.inventoryStart + i } : null
  }

  _syncRowsToInventory (bot) {
    // production: closing triggers the "trailing sync" that applies the rows to
    // bot.inventory - this is the moment stale counts become true again
    bot._items = this.slots.slice(this.inventoryStart, this.inventoryEnd).filter(Boolean).map(({ slot, ...rest }) => ({ ...rest }))
  }

  _absorb (slotName, itemName, count) {
    const slotIdx = slotName === 'input' ? 0 : 1
    if ((slotName === 'input' && this.mode === 'ghostInput') || (slotName === 'fuel' && this.mode === 'ghostFuel')) {
      return true // 26.2 ghost click: resolves, nothing moves
    }
    const rows = this.slots.slice(this.inventoryStart, this.inventoryEnd)
    const stack = rows.find(it => it && it.name === itemName)
    if (!stack) return false
    const take = Math.min(count, stack.count)
    stack.count -= take
    if (stack.count <= 0) this.slots[this.slots.indexOf(stack)] = null
    const dest = this.slots[slotIdx]
    if (dest && dest.name === itemName) dest.count = Math.min(64, dest.count + take)
    else this.slots[slotIdx] = { ...stack, count: take }
    if (slotName === 'fuel') this.fuelUnitsLeft = this.slots[1].count * this.fuelUnitsPer
    return true
  }

  async putInput (type, meta, count) {
    const entry = [...TYPES.entries()].find(([, t]) => t === type)
    this._absorb('input', entry?.[0], count)
  }

  async putFuel (type, meta, count) {
    const entry = [...TYPES.entries()].find(([, t]) => t === type)
    this._absorb('fuel', entry?.[0], count)
  }

  _convertOne () {
    if (!this.slots[0] || !this.slots[1] || this.fuelUnitsLeft <= 0) return
    const outName = SMELT_OUTPUT[this.slots[0].name]
    if (!outName) return
    this.slots[0].count -= 1
    if (this.slots[0].count <= 0) this.slots[0] = null
    if (this.slots[2] && this.slots[2].name === outName) this.slots[2].count += 1
    else this.slots[2] = item(outName, 1)
    this.fuelUnitsLeft -= 1
    if (this.fuelUnitsLeft <= 0) { this.slots[1] = null; this.fuelUnitsLeft = 0 }
  }

  inputItem () { return this.slots[0] ? { ...this.slots[0], slot: 0 } : null }
  fuelItem () { return this.slots[1] ? { ...this.slots[1], slot: 1 } : null }
  outputItem () {
    if (this.mode === 'never') return null
    this._convertOne() // lazy: every poll advances the smelt by one item
    return this.slots[2] ? { ...this.slots[2], slot: 2 } : null
  }

  async takeOutput () {
    assert.ok(this.slots[2], 'takeOutput with empty output slot (mineflayer would throw)')
    this._toRows(this.slots[2])
    this.slots[2] = null
  }

  _toRows (it) {
    for (let i = this.inventoryStart; i < this.inventoryEnd; i++) {
      if (!this.slots[i]) { this.slots[i] = { ...it }; return }
    }
  }

  async _takeBack (slotIdx) {
    if (!this.slots[slotIdx]) return
    this._toRows(this.slots[slotIdx])
    this.slots[slotIdx] = null
  }

  async takeInput () { await this._takeBack(0) }
  async takeFuel () { await this._takeBack(1) }

  close () {
    // production: the close triggers the trailing sync that applies the live rows
    // (frozen-during-open changes) back onto bot.inventory
    if (this._bot) this._syncRowsToInventory(this._bot)
    this.closed = true
  }
}

// ------------------------------------------------------------------- mock bot
function makeMockBot ({ items = [], machines = [], gotoFails = false, openThrows = false } = {}) {
  const bot = {
    username: 'SmeltBot',
    entity: { position: new Vec3(0.5, 64, 0.5) },
    inventory: { items: () => bot._items },
    _items: items.slice(),
    pathfinder: { goto: async () => { if (gotoFails) throw new Error('no path') } },
    findBlocks: ({ matching }) => machines.filter(m => matching(m)).map(m => m.position),
    // production findMachineBlocks converts findBlocks' Vec3 results via blockAt
    blockAt: (p) => machines.find(m => m.position && m.position.distanceTo(p) < 0.01) ?? null,
    openFurnace: async (block) => {
      if (openThrows) throw new Error('window dead')
      const m = machines.find(x => x.position.distanceTo(block.position) < 0.01)
      if (!m) throw new Error('not a furnace-like window')
      m.opened++
      m._bot = bot
      m._syncRowsFromInventory(bot) // the open snapshot (frozen while the window stays open)
      return m
    }
  }
  return bot
}

// ------------------------------------------------------------------ mappings
// the doomed-goal ledger (v0.72.0) is a module-level singleton in jobqueue.mjs -
// one process = one fleet. Walk-verdict records from one test must not refuse
// the walks of the next (the mocks reuse furnace positions), so every test
// starts from an empty ledger.
beforeEach(() => resetDoomedGoalLedger())

test('SMELT_OUTPUT covers the base-plan recipes', () => {
  assert.equal(SMELT_OUTPUT.sand, 'glass')
  assert.equal(SMELT_OUTPUT.iron_ore, 'iron_ingot')
  assert.equal(SMELT_OUTPUT.raw_iron, 'iron_ingot')
  assert.equal(SMELT_OUTPUT.deepslate_iron_ore, 'iron_ingot')
  assert.equal(SMELT_OUTPUT.cobblestone, 'stone')
  assert.equal(SMELT_OUTPUT.stone, 'smooth_stone')
  assert.equal(SMELT_OUTPUT.chorus_fruit, 'popped_chorus')
  assert.equal(SMELT_OUTPUT.beef, 'cooked_beef')
  assert.equal(SMELT_OUTPUT.potato, 'baked_potato')
})

test('machineFor / machineChainFor route by category', () => {
  assert.equal(machineFor('beef'), 'smoker')
  assert.deepEqual(machineChainFor('beef'), ['smoker', 'furnace'])
  assert.equal(machineFor('iron_ore'), 'blast_furnace')
  assert.deepEqual(machineChainFor('iron_ore'), ['blast_furnace', 'furnace'])
  assert.equal(machineFor('sand'), 'furnace')
  // the critical routing rule: a blast furnace must NEVER be offered to sand
  assert.ok(!machineChainFor('sand').includes('blast_furnace'))
  assert.ok(!machineChainFor('sand').includes('smoker'))
})

// ---------------------------------------------------------------------- fuel
test('fuelYieldOf / fuelNeeded follow vanilla values', () => {
  assert.equal(fuelYieldOf('coal'), 8)
  assert.equal(fuelYieldOf('charcoal'), 8)
  assert.equal(fuelYieldOf('coal_block'), 80)
  assert.equal(fuelYieldOf('oak_planks'), 1.5)
  assert.equal(fuelYieldOf('oak_log'), 1.5)
  assert.equal(fuelYieldOf('crimson_stem'), 1.5)
  assert.equal(fuelYieldOf('stick'), 0.5)
  assert.equal(fuelYieldOf('stone'), 0)
  assert.equal(fuelNeeded('coal', 20), 3)
  assert.equal(fuelNeeded('coal', 8), 1)
  assert.equal(fuelNeeded('stick', 1), 2)
  assert.equal(fuelNeeded('stone', 5), Infinity)
})

test('pickFuel prefers coal and respects wood reserves', () => {
  const bot = makeMockBot({ items: [item('coal', 2), item('oak_planks', 10), item('oak_log', 3)] })
  const fuel = pickFuel(bot, { itemsNeeded: 20 })
  assert.equal(fuel.name, 'coal')
  assert.equal(fuel.count, 2) // ceil(20/8)=3 wanted, but only 2 coal are held
  // planks: only the amount ABOVE the 8 reserve is burnable
  const bot2 = makeMockBot({ items: [item('oak_planks', 10)] })
  const fuel2 = pickFuel(bot2, { itemsNeeded: 20 })
  assert.equal(fuel2.name, 'oak_planks')
  assert.equal(fuel2.count, 2)
  // at-or-below the reserve nothing is offered
  const bot3 = makeMockBot({ items: [item('oak_planks', 8), item('stick', 2)] })
  assert.equal(pickFuel(bot3, { itemsNeeded: 5 }), null)
  // logs above reserve are used when planks are not spare
  const bot4 = makeMockBot({ items: [item('birch_log', 8)] })
  const fuel4 = pickFuel(bot4, { itemsNeeded: 20, reserveLogs: 6 })
  assert.equal(fuel4.name, 'birch_log')
  assert.equal(fuel4.count, 2)
})

// ---------------------------------------------------------------- smeltables
test('smeltablesIn lists piles biggest-first, reserves cobble, drops logs', () => {
  const bot = makeMockBot({
    items: [item('sand', 30), item('cobblestone', 12), item('oak_log', 20), item('iron_ore', 5), item('dirt', 64)]
  })
  const plan = smeltablesIn(bot)
  const names = plan.map(p => p.name)
  // logs never smelt (tool lifeline + net fuel loss), dirt is not smeltable at all
  assert.ok(!names.includes('oak_log'))
  assert.ok(!names.includes('dirt'))
  // cobble reserve (8) leaves 4 smeltable
  assert.equal(plan.find(p => p.name === 'cobblestone').count, 4)
  // biggest pile first
  assert.equal(names[0], 'sand')
  assert.ok(names.indexOf('iron_ore') < names.indexOf('cobblestone'), 'iron 5 sorts above cobble 4')
})

test('findMachineBlocks filters by kind, sorts by distance, returns real blocks', () => {
  const near = { name: 'furnace', position: new Vec3(3, 64, 3) }
  const far = { name: 'furnace', position: new Vec3(30, 64, 30) }
  const blast = { name: 'blast_furnace', position: new Vec3(2, 64, 2) }
  const smoker = { name: 'smoker', position: new Vec3(1, 64, 1) } // wrong kind: filtered
  const bot = makeMockBot({ machines: [far, smoker, near, blast] })
  const furnaces = findMachineBlocks(bot, ['furnace'], { maxDistance: 48 })
  assert.deepEqual(furnaces, [near, far]) // closest first, other kinds dropped
  const both = findMachineBlocks(bot, ['blast_furnace', 'furnace'], { maxDistance: 48 })
  assert.deepEqual(both, [blast, near, far])
  // every result must be a block-like object with a position (callers walk + open it)
  for (const b of both) assert.ok(b.position, 'results carry positions')
})

// ---------------------------------------------------------------- smeltBatch
test('smeltBatch happy path: verified input, fuel and output', async () => {
  const furnace = new MockFurnace({})
  const bot = makeMockBot({ machines: [furnace], items: [item('sand', 10), item('coal', 1), item('stick', 4)] })
  const res = await smeltBatch(bot, { machineBlock: furnace, inputName: 'sand', count: 8, ...FAST })
  assert.equal(res.smelted, 8)
  assert.equal(res.reason, 'ok')
  assert.ok(furnace.closed, 'window must be closed afterwards')
  const counts = n => bot.inventory.items().filter(i => i.name === n).reduce((a, i) => a + i.count, 0)
  assert.equal(counts('glass'), 8, 'output must be IN the inventory (verified)')
  assert.equal(counts('sand'), 2, 'only the batch left the inventory')
  assert.equal(counts('coal'), 0, 'fuel was consumed')
})

test('smeltBatch refuses a busy machine without losing items', async () => {
  const furnace = new MockFurnace({ startInput: item('gravel', 20), startFuel: item('coal', 2) })
  const bot = makeMockBot({ machines: [furnace], items: [item('sand', 10), item('coal', 1)] })
  const res = await smeltBatch(bot, { machineBlock: furnace, inputName: 'sand', count: 8, ...FAST })
  assert.equal(res.smelted, 0)
  assert.equal(res.reason, 'busy')
  const counts = n => bot.inventory.items().filter(i => i.name === n).reduce((a, i) => a + i.count, 0)
  assert.equal(counts('sand'), 10, 'our input stayed with us')
  assert.equal(counts('coal'), 1)
  assert.ok(furnace.closed)
})

test('smeltBatch rescues abandoned output from an idle machine first', async () => {
  const furnace = new MockFurnace({ startOutput: item('glass', 5) })
  const bot = makeMockBot({ machines: [furnace], items: [item('sand', 4), item('coal', 1)] })
  const res = await smeltBatch(bot, { machineBlock: furnace, inputName: 'sand', count: 4, ...FAST })
  assert.equal(res.rescued, 5, 'the 5 abandoned glass are fleet property')
  assert.equal(res.smelted, 4, 'and our own batch still smelted')
  const counts = n => bot.inventory.items().filter(i => i.name === n).reduce((a, i) => a + i.count, 0)
  assert.equal(counts('glass'), 9)
})

test('smeltBatch timeout gives input and fuel back, machine left clean', async () => {
  const furnace = new MockFurnace({ mode: 'never' }) // output never appears
  const bot = makeMockBot({ machines: [furnace], items: [item('sand', 6), item('coal', 1)] })
  const res = await smeltBatch(bot, { machineBlock: furnace, inputName: 'sand', count: 6, maxSeconds: 0.15, ...FAST })
  assert.equal(res.smelted, 0)
  assert.equal(res.reason, 'timeout')
  const counts = n => bot.inventory.items().filter(i => i.name === n).reduce((a, i) => a + i.count, 0)
  assert.equal(counts('sand'), 6, 'input pulled back out')
  assert.equal(counts('coal'), 1, 'unburned fuel pulled back out')
  assert.ok(furnace.closed)
})

test('smeltBatch detects ghost input transfers (26.2 desync)', async () => {
  const furnace = new MockFurnace({ mode: 'ghostInput' })
  const bot = makeMockBot({ machines: [furnace], items: [item('sand', 6), item('coal', 1)] })
  const res = await smeltBatch(bot, { machineBlock: furnace, inputName: 'sand', count: 6, ...FAST })
  assert.equal(res.smelted, 0)
  assert.equal(res.reason, 'input transfer failed')
  const counts = n => bot.inventory.items().filter(i => i.name === n).reduce((a, i) => a + i.count, 0)
  assert.equal(counts('sand'), 6, 'nothing was lost to the desync')
})

test('smeltBatch without fuel leaves the inventory untouched', async () => {
  const furnace = new MockFurnace({})
  const bot = makeMockBot({ machines: [furnace], items: [item('sand', 6)] }) // no fuel at all
  const res = await smeltBatch(bot, { machineBlock: furnace, inputName: 'sand', count: 6, ...FAST })
  assert.equal(res.reason, 'no fuel')
  assert.equal(res.smelted, 0)
  const counts = n => bot.inventory.items().filter(i => i.name === n).reduce((a, i) => a + i.count, 0)
  assert.equal(counts('sand'), 6)
  assert.ok(furnace.closed)
})

test('smeltBatch survives a dead window and an unreachable machine', async () => {
  const dead = new MockFurnace({})
  const far = new MockFurnace({ position: new Vec3(50, 64, 50) })
  const bot = makeMockBot({ machines: [dead], items: [item('sand', 4), item('coal', 1)], openThrows: true })
  const res = await smeltBatch(bot, { machineBlock: dead, inputName: 'sand', count: 4, ...FAST })
  assert.equal(res.reason, 'cannot open (window dead)')
  const bot2 = makeMockBot({ machines: [far], items: [item('sand', 4), item('coal', 1)], gotoFails: true })
  const res2 = await smeltBatch(bot2, { machineBlock: far, inputName: 'sand', count: 4, ...FAST })
  assert.match(res2.reason, /machine unreachable/)
})

// ------------------------------------------------------------- smeltInventory
test('smeltInventory smelts several input types and skips busy machines', async () => {
  const busy = new MockFurnace({ position: new Vec3(2, 64, 2), startInput: item('gravel', 10), startFuel: item('coal', 2) })
  const free = new MockFurnace({ position: new Vec3(6, 64, 6) })
  const blast = new MockFurnace({ name: 'blast_furnace', position: new Vec3(4, 64, 4) })
  const bot = makeMockBot({
    machines: [busy, blast, free],
    items: [item('sand', 8), item('iron_ore', 4), item('coal', 2)]
  })
  const res = await smeltInventory(bot, { ...FAST })
  assert.equal(res.smelted, 12)
  assert.equal(res.outputs.glass, 8)
  assert.equal(res.outputs.iron_ingot, 4)
  assert.ok(busy.opened > 0, 'the closest (busy) machine was tried first')
  assert.ok(free.opened > 0, 'and the fleet moved on to the free one')
})

test('smeltInventory routes food to a smoker before plain furnaces', async () => {
  const smoker = new MockFurnace({ name: 'smoker', position: new Vec3(2, 64, 2) })
  const furnace = new MockFurnace({ position: new Vec3(8, 64, 8) })
  const bot = makeMockBot({ machines: [smoker, furnace], items: [item('beef', 3), item('coal', 1)] })
  const res = await smeltInventory(bot, { ...FAST })
  assert.equal(res.outputs.cooked_beef, 3)
  assert.ok(smoker.opened > 0)
  assert.equal(furnace.opened, 0, 'the smoker was available - no fallback needed')
})

test('smeltInventory with no fuel records the attempt and never throws', async () => {
  const furnace = new MockFurnace({})
  const bot = makeMockBot({ machines: [furnace], items: [item('sand', 8)] })
  const res = await smeltInventory(bot, { ...FAST })
  assert.equal(res.smelted, 0)
  assert.ok(res.attempts.some(a => a.reason === 'no fuel'))
})

test('smeltInventory stops instantly with a negative time budget', async () => {
  const furnace = new MockFurnace({})
  const bot = makeMockBot({ machines: [furnace], items: [item('sand', 8), item('coal', 1)] })
  const res = await smeltInventory(bot, { ...FAST, maxSeconds: -1 })
  assert.equal(res.smelted, 0, 'no budget -> no smelting, no crash')
})

// ---------------------------------------------------------------------------
// (v0.41.0) THE VISIT BUDGET - the machine walk is part of the visit. Fleet
// 35582520041 F3: the chain reached the yard, the smelt leg went silent ~94s
// (3x20s machine walk, unseen by every budget) and the final deposit died
// 'budget exhausted' with the loot still pocketed. The visit budget clamps
// every walk attempt into the caller's remaining wall clock.
test('smeltBatch: a visit budget stops the walk retries when the clock is out', async () => {
  const far = new MockFurnace({ position: new Vec3(50, 64, 50) })
  const bot = makeMockBot({ machines: [far], items: [item('sand', 4), item('coal', 1)], gotoFails: true })
  const slices = []
  // a slow-failing walk: each attempt burns ~1.6s of the visit's wall clock
  bot.pathfinder.goto = async goal => {
    slices.push(goal)
    await new Promise(r => setTimeout(r, 1600))
    throw new Error('walk to furnace: timeout after Nms')
  }
  const t0 = Date.now()
  const res = await smeltBatch(bot, { machineBlock: far, inputName: 'sand', count: 4, ...FAST, visitBudgetMs: 3000 })
  const elapsed = Date.now() - t0
  assert.match(res.reason, /machine unreachable/)
  assert.match(res.reason, /visit budget spent|timeout/, 'the last walk error names why it gave up')
  assert.ok(slices.length < 3, `a 3s visit budget must not fund 3 x 1.6s walks + pauses (got ${slices.length})`)
  assert.ok(elapsed < 8000, `the visit stays inside its budget wall (elapsed ${elapsed}ms)`)
})

test('smeltBatch: no visit budget keeps the legacy 3 walk attempts for TRANSIENT failures', async () => {
  const far = new MockFurnace({ position: new Vec3(50, 64, 50) })
  const bot = makeMockBot({ machines: [far], items: [item('sand', 4), item('coal', 1)], gotoFails: true })
  let calls = 0
  // (v0.72.0) the legacy 3-attempt loop applies to TRANSIENT walk failures
  // (saturation timeouts, interrupted walks) - a dead-geometry verdict ('no
  // path') now ledgered the cell at attempt 1 and the funnel refuses the
  // re-issues (the next test pins that), because the retry spiral feeding the
  // run68 freezes was exactly this loop re-paying the same A*.
  bot.pathfinder.goto = async () => { calls++ ; throw new Error('walk to furnace: timeout after Nms') }
  const res = await smeltBatch(bot, { machineBlock: far, inputName: 'sand', count: 4, ...FAST })
  assert.equal(calls, 3, 'legacy behavior: 3 bounded walk attempts on transient errors')
  assert.match(res.reason, /machine unreachable/)
})

test('smeltBatch: a dead-geometry verdict gets ONE shared-bay re-arm, then the funnel closes (v0.72.0 + v0.89.0)', async () => {
  const far = new MockFurnace({ position: new Vec3(50, 64, 50) })
  const bot = makeMockBot({ machines: [far], items: [item('sand', 4), item('coal', 1)], gotoFails: true })
  let calls = 0
  bot.pathfinder.goto = async () => { calls++ ; throw new Error('No path to the goal!') }
  const res = await smeltBatch(bot, { machineBlock: far, inputName: 'sand', count: 4, ...FAST })
  assert.equal(calls, 2, 'attempt 1 pays the A* verdict; attempt 2 re-arms ONCE (the bay is shared); attempt 3 dies at the consult again')
  assert.match(res.reason, /machine unreachable/)
  assert.match(res.reason, /doomed goal/, 'the final refusal names the ledger')
})

test('smeltInventory: the visit budget threads into every batch it starts', async () => {
  const far = new MockFurnace({ position: new Vec3(50, 64, 50) })
  const bot = makeMockBot({ machines: [far], items: [item('sand', 4), item('coal', 1)] })
  const seen = []
  bot.pathfinder.goto = async goal => {
    seen.push(goal)
    await new Promise(r => setTimeout(r, 1500))
    throw new Error('walk to furnace: timeout after Nms')
  }
  const t0 = Date.now()
  // maxSeconds 3: the smeltInventory clock must stop the SLOW walk before it
  // can burn multiples of its budget (the F3 shape: the walk ate ~3x the clock)
  const res = await smeltInventory(bot, { ...FAST, maxSeconds: 3 })
  const elapsed = Date.now() - t0
  assert.equal(res.smelted, 0)
  assert.ok(elapsed < 9000, `the smelt leg respects its wall clock (elapsed ${elapsed}ms)`)
  assert.ok(seen.length <= 2, `the visit budget cut the walk retries (got ${seen.length})`)
})

// --------------------------------------------------- v0.89.0 THE HONEST SMELT LEG

test('SMELT_REACH_OPEN_DISTANCE is the arm\'s reach the reach-open trusts', () => {
  assert.equal(SMELT_REACH_OPEN_DISTANCE, 4.5)
})

test('smeltWalkReach: attempt 1 hugs the machine, the retries stand off, junk is loose', () => {
  assert.equal(smeltWalkReach(1), 2)
  assert.equal(smeltWalkReach(2), 6)
  assert.equal(smeltWalkReach(3), 6)
  assert.equal(smeltWalkReach(0), 6, '0 is not a 1-based attempt - the loose default')
  assert.equal(smeltWalkReach(undefined), 6)
  assert.equal(smeltWalkReach(null), 6)
  assert.equal(smeltWalkReach('junk'), 6)
})

test('machineWithinReach: the reach-open predicate is junk-safe', () => {
  const from = { x: 0, y: 64, z: 0 }
  assert.equal(machineWithinReach({ from, pos: { x: 3, y: 64, z: 3 } }), true, '~4.24 <= 4.5')
  assert.equal(machineWithinReach({ from, pos: { x: 5, y: 64, z: 5 } }), false, '~7.07 > 4.5')
  assert.equal(machineWithinReach({ from: null, pos: { x: 1, y: 1, z: 1 } }), false)
  assert.equal(machineWithinReach({ from, pos: null }), false)
  assert.equal(machineWithinReach({}), false)
  assert.equal(machineWithinReach({ from: { x: NaN, y: 64, z: 0 }, pos: { x: 1, y: 64, z: 1 } }), false)
  assert.equal(machineWithinReach({ from, pos: { x: 1, y: 64, z: 1 }, reach: Number.NaN }), true, 'junk reach -> the 4.5 default; 1.41 away')
  assert.equal(machineWithinReach({ from, pos: { x: 3, y: 64, z: 3 }, reach: 4 }), false, 'a real reach is honored (4.24 > 4)')
})

test('smeltZeroWhy: the zero verdict names every attempt, junk-safe', () => {
  assert.equal(smeltZeroWhy([]), 'nothing to smelt')
  assert.equal(smeltZeroWhy(null), 'nothing to smelt')
  assert.equal(smeltZeroWhy(undefined), 'nothing to smelt')
  assert.equal(smeltZeroWhy('junk'), 'nothing to smelt')
  assert.equal(
    smeltZeroWhy([
      { name: 'iron_ore', machine: 'blast_furnace', reason: 'machine unreachable (NoPath: No path to the goal!)' },
      { name: 'cobblestone', machine: null, reason: 'no fuel' }
    ]),
    'iron_ore@blast_furnace: machine unreachable (NoPath: No path to the goal!); cobblestone@-: no fuel'
  )
  assert.equal(smeltZeroWhy([{ name: 'sand', machine: 'furnace', reason: 'no machine in reach' }]),
    'sand@furnace: no machine in reach')
  assert.equal(smeltZeroWhy([null, 42, { machine: 'furnace' }]), '?@furnace: unknown', 'junk entries degrade, they never crash the verdict')
})

test('smeltInventory: a zero records WHY per machine - the honest attempts (v0.89.0)', async () => {
  const far = new MockFurnace({ position: new Vec3(50, 64, 50) })
  const bot = makeMockBot({ machines: [far], items: [item('sand', 4), item('coal', 1)], gotoFails: true })
  bot.pathfinder.goto = async () => { throw new Error('No path to the goal!') }
  const res = await smeltInventory(bot, { ...FAST, maxSeconds: 30 })
  assert.equal(res.smelted, 0)
  assert.ok(res.attempts.length >= 1, 'the machine failure is recorded, not discarded')
  const a = res.attempts[0]
  assert.equal(a.name, 'sand')
  assert.equal(a.machine, 'furnace')
  assert.match(a.reason, /machine unreachable/)
})

test('smeltInventory: an empty machine scan is a verdict - no machine in reach (collision #39 union shape)', async () => {
  const bot = makeMockBot({ machines: [], items: [item('sand', 4), item('coal', 1)] })
  const res = await smeltInventory(bot, { ...FAST, maxSeconds: 30 })
  assert.equal(res.smelted, 0)
  assert.deepEqual(res.attempts, [{ name: 'sand', machine: 'furnace', reason: 'no machine in reach (furnace within 48b)' }])
})

test('smeltBatch: the reach-open skips the walk entirely - sick yard paths cannot starve the bay', async () => {
  const near = new MockFurnace({ position: new Vec3(3.5, 64, 3.5) }) // ~4.24 from the bot
  const bot = makeMockBot({ machines: [near], items: [item('sand', 4), item('coal', 1)], gotoFails: true })
  let gotoCalls = 0
  bot.pathfinder.goto = async () => { gotoCalls++; throw new Error('No path to the goal!') }
  const res = await smeltBatch(bot, { machineBlock: near, inputName: 'sand', count: 4, ...FAST })
  assert.equal(gotoCalls, 0, 'a machine within 4.5 needs no pathfinder')
  assert.equal(res.smelted, 4, 'the batch smelted via the reach-open')
  assert.equal(res.reason, 'ok')
})

test('smeltBatch: the walk ladder hugs on attempt 1 and stands off on the retries', async () => {
  const far = new MockFurnace({ position: new Vec3(50, 64, 50) })
  const bot = makeMockBot({ machines: [far], items: [item('sand', 4), item('coal', 1)] })
  const reaches = []
  bot.pathfinder.goto = async goal => { reaches.push(Math.sqrt(goal.rangeSq)); throw new Error('walk to furnace: timeout after Nms') }
  await smeltBatch(bot, { machineBlock: far, inputName: 'sand', count: 4, ...FAST })
  assert.deepEqual(reaches, [2, 6, 6], 'attempt 1 hugs (2), the retries stand off (6)')
})

test('smeltBatchWaitMs: the batch estimate FILLS the visit budget, never OVERRIDES it (run81 hard kill)', () => {
  // run81: F19's 105-item batch priced 1155s of poll wait THROUGH the end phase -
  // the hard kill, a smelted=0 measurement lie (6 stone WERE collected), banked lost
  assert.equal(smeltBatchWaitMs({ maxSeconds: 28, batch: 105, smeltSecondsPerItem: 11, pollMs: 1200, visitRemainingMs: 45000 }),
    45000, 'the visit budget is the hard ceiling - a 19-minute batch waits 45s')
  // a batch that fits keeps the legacy floor (batch estimate + the take margin)
  assert.equal(smeltBatchWaitMs({ maxSeconds: 10, batch: 3, smeltSecondsPerItem: 11, pollMs: 1200, visitRemainingMs: 600000 }),
    3 * 11 * 1000 + 1200 * 3, 'a small batch keeps its full estimate inside a fat budget')
  // the maxSeconds floor matters when the batch estimate is smaller
  assert.equal(smeltBatchWaitMs({ maxSeconds: 90, batch: 2, smeltSecondsPerItem: 11, pollMs: 1200, visitRemainingMs: 600000 }),
    90 * 1000 + 1200 * 3, 'maxSeconds fills a lean batch')
})

test('smeltBatchWaitMs: the legacy unbounded call keeps its shape byte for byte', () => {
  // visitBudgetMs null = the legacy mid-run call: unbounded, the old math verbatim
  assert.equal(smeltBatchWaitMs({ maxSeconds: 45, batch: 105, smeltSecondsPerItem: 11, pollMs: 1200, visitRemainingMs: null }),
    Math.max(45 * 1000, 105 * 11 * 1000) + 1200 * 3)
  assert.equal(smeltBatchWaitMs({ maxSeconds: 45, batch: 105, smeltSecondsPerItem: 11, pollMs: 1200 }),
    Math.max(45 * 1000, 105 * 11 * 1000) + 1200 * 3, 'the parameter omitted = the legacy call')
})

test('smeltBatchWaitMs: junk is capped, not fatal (Number(null) ninth strike)', () => {
  // a junk batch/maxSeconds never stretches the wait - the floors vanish and the
  // wait is the take margin only (a cap cannot STRETCH a wait, only bound it)
  assert.equal(smeltBatchWaitMs({ maxSeconds: NaN, batch: NaN, smeltSecondsPerItem: 11, pollMs: 1200, visitRemainingMs: 45000 }),
    1200 * 3, 'all-junk floors = the take margin only, inside the cap')
  assert.equal(smeltBatchWaitMs({ maxSeconds: 30, batch: null, smeltSecondsPerItem: null, pollMs: null, visitRemainingMs: null }),
    30 * 1000 + 1200 * 3, 'junk batch/per vanish, junk pollMs reads the production default')
  assert.equal(smeltBatchWaitMs({ maxSeconds: 30, batch: 105, smeltSecondsPerItem: 11, pollMs: 1200, visitRemainingMs: -5 }),
    Math.max(30 * 1000, 105 * 11 * 1000) + 1200 * 3, 'a junk-negative visit budget = the legacy unbounded shape (no cap)')
  assert.equal(smeltBatchWaitMs({ maxSeconds: 30, batch: 3, smeltSecondsPerItem: 11, pollMs: 1200, visitRemainingMs: 0.4 }),
    0, 'a sub-second cap floors to zero (honest - the loop exits and pulls back)')
  assert.equal(smeltBatchWaitMs({}), 90 * 1000 + 1200 * 3, 'the bare call = the production defaults')
})

// ------------------------------------------------------- v0.92.0 the fuel slice
test('smeltFuelKeep: a smeltable pocket holds its fuel through the pre-deposit (run81: F4/F3/F8 arrived no fuel)', () => {
  // the v0.88.0 reserve held the smelt leg's CLOCK; the pre-deposit still banked
  // its FUEL (coal is not in the deposit KEEP list) - the bot arrived at the
  // machine with smeltables and 'no fuel'. The keep-list extension fixes the
  // pocket, not the clock.
  assert.deepEqual(smeltFuelKeep({ carriesSmeltables: true }), ['coal', 'charcoal'])
  // a pocket without smeltables banks the coal as before - the base stock drains
  assert.deepEqual(smeltFuelKeep({ carriesSmeltables: false }), [])
  assert.deepEqual(smeltFuelKeep({}), [], 'the flag omitted = the legacy keep list')
  assert.deepEqual(smeltFuelKeep(null), [], 'junk opts are safe (the destructuring default)')
  // fresh arrays: a caller mutating its keep list must never poison the const
  const a = smeltFuelKeep({ carriesSmeltables: true })
  a.push('dirt')
  assert.deepEqual(SMELT_FUEL_KEEP, ['coal', 'charcoal'], 'the shared const stays untouched')
  // charcoal contains the substring 'coal' - the deposit matcher (includes)
  // would keep it anyway; the explicit list is belt and braces, and pickFuel
  // burns charcoal first-class (8 smelts per unit, same as coal)
  assert.ok('charcoal'.includes('coal'))
  assert.equal(MACHINE_DOOM_TTL_MS, 15000, 'the machine doom TTL is 15s (run81: one failed walk killed a fresh camp furnace for the run)')
})

// ------------------------------------------------------------------- v0.92.0
// run82 (dispatch 35789963277 on 0b01214): F15 reach-opened its own fresh furnace,
// put 93 cobble + 12 coal with both puts "verified" by the row delta - and the
// output stayed EMPTY through the whole poll (mineflayer threw 'destination full'
// on the 93-count put; something left the rows, the machine never smelted). Two
// cures: the put count caps at the vanilla slot max, and the machine's own slots
// are read back + NAMED after the puts (a disagreement is a verdict, not a wait).
test('furnacePutCount: the put never asks for more than one slot absorbs (run82 F15 destination full)', () => {
  assert.equal(FURNACE_SLOT_MAX, 64, 'the vanilla furnace slot max is pinned')
  assert.equal(furnacePutCount(93), 64, 'a 93-cobble batch puts 64 - the surplus stays pocketed')
  assert.equal(furnacePutCount(64), 64, 'an exact stack fills the slot')
  assert.equal(furnacePutCount(10), 10, 'a small batch is untouched')
  assert.equal(furnacePutCount(0), 0, 'a zero batch puts nothing')
  assert.equal(furnacePutCount(-5), 0, 'a negative batch puts nothing')
  assert.equal(furnacePutCount(NaN), 0, 'junk puts nothing (the Number(null) family, tenth strike)')
  assert.equal(furnacePutCount(null), 0, 'null puts nothing')
  assert.equal(furnacePutCount(93.9), 64, 'a fractional count floors, then caps at the slot max')
  assert.equal(furnacePutCount(100, 16), 16, 'a caller-pinned max caps tighter')
  assert.equal(furnacePutCount(100, NaN), 64, 'a junk max reads the vanilla slot max')
  assert.equal(furnacePutCount(100, -3), 64, 'a junk-negative max reads the vanilla slot max')
})

test('slotMismatchReason: the read-back disagreement is a NAMED verdict (null = honest)', () => {
  assert.equal(slotMismatchReason({ wantName: 'cobblestone', slotInputName: 'cobblestone', slotFuelName: 'coal' }),
    null, 'an honest put reads null')
  assert.equal(slotMismatchReason({ wantName: 'cobblestone', slotInputName: 'coal', slotFuelName: 'cobblestone' }),
    'slot mismatch (input=coal, fuel=cobblestone, want cobblestone)', 'the swapped-put class names both slots')
  assert.match(slotMismatchReason({ wantName: 'sand', slotInputName: null, slotFuelName: 'coal' }),
    /input=empty/, 'an unread input slot reads empty, never the wanted name')
  assert.match(slotMismatchReason({ wantName: 'sand', slotInputName: null, slotFuelName: null }),
    /fuel=empty/, 'unread fuel reads empty too')
  assert.equal(slotMismatchReason({ wantName: null, slotInputName: 'coal' }), null, 'no want = no check')
  assert.equal(slotMismatchReason({ wantName: '', slotInputName: 'coal' }), null, 'an empty want = no check')
  assert.equal(slotMismatchReason({}), null, 'the bare call is a no-check')
})

test('smeltBatch: a 93-cobble batch puts 64 and the pocket keeps the surplus (the cap spy)', async () => {
  const f = new MockFurnace({ position: new Vec3(1.5, 64, 0.5) })
  const puts = []
  const origPut = f.putInput.bind(f)
  f.putInput = async (type, meta, count) => { puts.push(count); await origPut(type, meta, count) }
  const bot = makeMockBot({ machines: [f], items: [item('cobblestone', 93), item('coal', 12)] })
  await smeltBatch(bot, { machineBlock: f, inputName: 'cobblestone', count: 93, ...FAST })
  assert.deepEqual(puts, [64], 'the put asked for 64, never 93 (the destination-full class)')
  // the mock's window rows take ONE item per slot (36 rows), so a full 64-take
  // cannot land there - the pocket-surplus pin is the honest half of this spy:
  // the surplus stayed pocketed exactly as the cap promises
  assert.ok(bot._items.some(i => i.name === 'cobblestone' && i.count === 29), 'the pocket keeps the 29 surplus')
})

test('smeltBatch: a capped put smelts end to end (30 cobble, inside the mock row space)', async () => {
  const f = new MockFurnace({ position: new Vec3(1.5, 64, 0.5) })
  const bot = makeMockBot({ machines: [f], items: [item('cobblestone', 30), item('coal', 4)] })
  const res = await smeltBatch(bot, { machineBlock: f, inputName: 'cobblestone', count: 30, ...FAST })
  assert.equal(res.smelted, 30, 'the whole capped batch smelted and returned')
  assert.equal(res.reason, 'ok')
  assert.equal(f.slots[1], null, 'the leftover fuel left the slot - the machine reads free')
})

test('smeltBatch: the swapped-put lie is a named slot-mismatch verdict with the items pulled back', async () => {
  const f = new MockFurnace({ position: new Vec3(1.5, 64, 0.5) })
  // simulate the slot-map lie: the input put lands in the FUEL slot, the fuel put in the INPUT slot
  f.putInput = async (type) => { const e = [...TYPES.entries()].find(([, t]) => t === type); f._absorb('fuel', e?.[0], 20) }
  f.putFuel = async (type) => { const e = [...TYPES.entries()].find(([, t]) => t === type); f._absorb('input', e?.[0], 3) }
  const bot = makeMockBot({ machines: [f], items: [item('cobblestone', 20), item('coal', 3)] })
  const res = await smeltBatch(bot, { machineBlock: f, inputName: 'cobblestone', count: 20, ...FAST })
  assert.equal(res.smelted, 0, 'the lie never collects')
  assert.equal(res.reason, 'slot mismatch (input=coal, fuel=cobblestone, want cobblestone)', 'the verdict names the disagreement')
  assert.ok(bot._items.some(i => i.name === 'coal' && i.count >= 3), 'the coal rode back to the pocket')
  assert.ok(bot._items.some(i => i.name === 'cobblestone' && i.count >= 20), 'the cobble rode back too')
  assert.equal(f.slots[0], null, 'the input slot is clean for the fleet')
  assert.equal(f.slots[1], null, 'the fuel slot is clean for the fleet')
})

test('smeltBatch: a completed batch pulls the leftover fuel back (the machine reads free, never busy)', async () => {
  const f = new MockFurnace({ position: new Vec3(1.5, 64, 0.5), fuelUnitsPer: 100 })
  const bot = makeMockBot({ machines: [f], items: [item('sand', 8), item('coal', 1)] })
  const res = await smeltBatch(bot, { machineBlock: f, inputName: 'sand', count: 8, ...FAST })
  assert.equal(res.smelted, 8, 'the batch completed')
  assert.equal(res.reason, 'ok')
  assert.equal(f.slots[1], null, 'the unburnable leftover fuel left the slot - no busy-wall for the next visitor')
  assert.ok(bot._items.some(i => i.name === 'coal' && i.count >= 1), 'the leftover coal rides the pocket again')
})
