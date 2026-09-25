// Smelting pipeline: furnace claiming, verified transfers, fuel policy, machine
// selection. Driven with a mock bot + mock furnace windows - no server needed.
//
// The mock furnace converts input -> output LAZILY: every outputItem() call turns
// ONE input item into output (when fuel remains). That makes the production poll
// loop advance deterministically with zero timers - each poll sees one more item
// ready, exactly like a real furnace at ~1 item per 10s, just a million times faster.
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { Vec3 } from 'vec3'
import { resetDoomedGoalLedger, recordDoomedGoal, doomedGoalStats, nearDoomedGoal } from '../../src/lib/jobqueue.mjs'
import { KEEP } from '../../src/lib/deposit.mjs'
import {
  SMELT_OUTPUT, machineFor, machineChainFor, fuelYieldOf, fuelNeeded,
  pickFuel, smeltablesIn, findMachineBlocks, smeltBatch, smeltInventory,
  sweepFinishedSmelts,
  smeltWalkReach, machineWithinReach, smeltZeroWhy, smeltBatchWaitMs, SMELT_REACH_OPEN_DISTANCE,
  smeltFuelKeep, SMELT_FUEL_KEEP, MACHINE_DOOM_TTL_MS, SMELT_YARD_NEAR_DISTANCE,
  smeltInputKeep, SMELT_INPUT_KEEP,
  furnacePutCount, slotMismatchReason, FURNACE_SLOT_MAX,
  fuelCapacity, clockCapItems, JUNK_COAL_FLOOR, WALK_REFUSAL_WAIT_RE,
} from '../../src/lib/smelting.mjs'
import { FUEL_TITHE_BOUND } from '../../src/lib/deposit.mjs'

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

test('pickFuel METAL window keeps the legacy coal-first order byte for byte', () => {
  // (v0.109.0) the metal lane is the plan's priority - coal smelts 8:1 and the
  // raw_iron window must never see a stick while coal exists (the run97 F13 pin)
  const bot = makeMockBot({ items: [item('coal', 2), item('oak_planks', 10), item('oak_log', 3)] })
  const fuel = pickFuel(bot, { itemsNeeded: 20, metalWindow: true })
  assert.equal(fuel.name, 'coal')
  assert.equal(fuel.count, 2) // ceil(20/8)=3 wanted, but only 2 coal are held
  // a metal window with NO coal falls to wood exactly like the legacy tail
  const botNoCoal = makeMockBot({ items: [item('oak_planks', 10)] })
  const fuel2 = pickFuel(botNoCoal, { itemsNeeded: 20, metalWindow: true })
  assert.equal(fuel2.name, 'oak_planks')
  assert.equal(fuel2.count, 2)
})

test('pickFuel JUNK window (default) burns spare wood FIRST - the run97 misallocation cure', () => {
  // the same pocket the legacy order sent to coal: the junk window now takes
  // the renewable planks above the reserve and the coal survives for the metal
  // windows and the tithe/bank chain
  const bot = makeMockBot({ items: [item('coal', 2), item('oak_planks', 10), item('oak_log', 3)] })
  const fuel = pickFuel(bot, { itemsNeeded: 20 })
  assert.equal(fuel.name, 'oak_planks')
  assert.equal(fuel.count, 2) // only the amount ABOVE the 8 reserve is burnable
})

test('pickFuel itemsNeeded 1 = the minimal-fire probe the smelt hold gates on (v0.192.0)', () => {
  // run46's F10/F6/F8 class: the bank-block's fuel gate counted coal only and
  // skipped the smelt hold ('no fuel in pocket (coal 0)' x3) while the SAME
  // bots' furnaces burned wood - F6: 'fuel clips the batch: 4 x oak_log
  // completes 6 of 33'. The gate now asks the furnace's own selector the
  // minimal question: can this pocket fire ONE item?
  // a wood-only pocket above the reserves = fireable (the run46 skip was a lie)
  const woody = makeMockBot({ items: [item('oak_log', 10)] })
  const plan = pickFuel(woody, { itemsNeeded: 1 })
  assert.equal(plan.name, 'oak_log')
  assert.equal(plan.count, 1) // one log unit proves the fire (fuelNeeded ceil(1/1.5)=1)
  // the reserve doctrine holds in the probe: logs AT the reserve are not fuel
  const atReserve = makeMockBot({ items: [item('oak_log', 6)] })
  assert.equal(pickFuel(atReserve, { itemsNeeded: 1 }), null)
  // sticks above the 2 reserve complete one item (2 sticks = 1 smelt)
  const stickBot = makeMockBot({ items: [item('stick', 5)] })
  const stickPlan = pickFuel(stickBot, { itemsNeeded: 1 })
  assert.equal(stickPlan.name, 'stick')
  assert.equal(stickPlan.count, 2)
  // the JUNK-window order survives the probe: renewable wood burns FIRST and
  // the coal survives for the metal windows (the run97 cure the leg re-uses;
  // the gate probes the default window - the input name is unknown at chain entry)
  const mixed = makeMockBot({ items: [item('coal', 2), item('oak_log', 10)] })
  assert.equal(pickFuel(mixed, { itemsNeeded: 1 }).name, 'oak_log')
  // a junk/empty pocket reads no plan - the v0.183.0 skip shape byte for byte
  assert.equal(pickFuel(makeMockBot({ items: [] }), { itemsNeeded: 1 }), null)
})

test('pickFuel JUNK window: coal AT the floor is the honest skip (the v0.110.0 floor)', () => {
  // run98's F4 class: a wood-less pocket burned its coal to nothing on junk
  // windows BEFORE any chest contact - the tithe never had an overage and the
  // fuel-less bots stayed unfunded. The floor keeps the tithe bound in every
  // pocket; a junk window with only floor-level coal now skips honestly.
  const bot = makeMockBot({ items: [item('coal', JUNK_COAL_FLOOR)] })
  assert.equal(pickFuel(bot, { itemsNeeded: 20 }), null)
  const below = makeMockBot({ items: [item('coal', 2)] })
  assert.equal(pickFuel(below, { itemsNeeded: 20 }), null)
})

test('pickFuel JUNK window: coal ABOVE the floor burns only the above-floor amount', () => {
  // the overage above the floor is the tithe's rightful prey - a junk window
  // may burn it, but never the floor itself; the amount also stays bounded by
  // the batch's real fuel need (the legacy fuelNeeded min)
  const bot = makeMockBot({ items: [item('coal', 22)] })
  const fuel = pickFuel(bot, { itemsNeeded: 64 }) // 64 cobble need 8 coal
  assert.equal(fuel.name, 'coal')
  assert.equal(fuel.count, 8) // min(22-6, 8)
  const big = makeMockBot({ items: [item('coal', 22)] })
  const fuelBig = pickFuel(big, { itemsNeeded: 400 }) // a huge batch may take ALL the overage
  assert.equal(fuelBig.count, 16)
})

test('pickFuel junk-window truthiness is judged STRICTLY (only ===true opens the metal lane)', () => {
  // the Number(null) strikes: a truthy junk value is not a plan - only the
  // METAL_INPUTS.has() boolean verdict may reorder the pick
  const bot = makeMockBot({ items: [item('coal', 2), item('oak_planks', 10)] })
  const junk = pickFuel(bot, { itemsNeeded: 20, metalWindow: 'junk' })
  assert.equal(junk.name, 'oak_planks')
  const junkNull = pickFuel(bot, { itemsNeeded: 20, metalWindow: null })
  assert.equal(junkNull.name, 'oak_planks')
})

test('pickFuel METAL window: the floor does NOT bind - the ladder outranks it', () => {
  // the metal lane keeps the legacy UNBOUNDED solid pick: a pocket with only
  // floor-level coal still funds its raw_copper window (the F16 rescue - the
  // pocket's own coal is the metal ladder's first funder)
  const bot = makeMockBot({ items: [item('coal', JUNK_COAL_FLOOR)] })
  const fuel = pickFuel(bot, { itemsNeeded: 20, metalWindow: true })
  assert.equal(fuel.name, 'coal')
  assert.equal(fuel.count, Math.ceil(20 / 8))
})

test('pickFuel METAL window: reserves and the at-or-below pin stand unchanged', () => {
  // the v0.109.0 reorder must not touch the reserve arithmetic in either lane
  const bot3 = makeMockBot({ items: [item('oak_planks', 8), item('stick', 2)] })
  assert.equal(pickFuel(bot3, { itemsNeeded: 5, metalWindow: true }), null)
  const bot4 = makeMockBot({ items: [item('birch_log', 8)] })
  const fuel4 = pickFuel(bot4, { itemsNeeded: 20, reserveLogs: 6, metalWindow: true })
  assert.equal(fuel4.name, 'birch_log')
  assert.equal(fuel4.count, 2)
})

// (v0.110.0) THE JUNK COAL FLOOR - the pair pin
 test('JUNK_COAL_FLOOR is the tithe bound - the two cures share one number', () => {
  assert.equal(JUNK_COAL_FLOOR, FUEL_TITHE_BOUND)
  assert.equal(JUNK_COAL_FLOOR, 6)
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
  // (v0.106.0) THE METAL PRECEDENCE: iron_ore is a metal and leads the plan
  assert.equal(names[0], 'iron_ore')
  // the non-metals keep the legacy count-desc order behind the metal class
  assert.ok(names.indexOf('sand') < names.indexOf('cobblestone'), 'sand 30 sorts above cobble 4')
})

// (v0.106.0) THE METAL PRECEDENCE - run94 (35841864758) measured the ladder
// starvation: 7 smelt calls fleet-wide, 5 cobblestone (239u), 1 sand, ZERO metal,
// pockets carrying raw_copper:17 next to cobblestone:79, iron=0 at end, plan
// progress 1/31. The count-only sort lets junk dwarfs eat the coal first; metals
// as a CLASS now rank above everything else.
// (v0.134.0) re-pinned by THE IRON LADDER PRECEDENCE: within the metal class the
// ladder metals (the iron_ingot producers) lead regardless of count - run550
// (35950649305) measured the fleet smelting 17 copper ingots to iron=0 with
// raw_copper:31 count-dwarfing raw_iron:6 in the same pockets.
test('smeltablesIn METAL PRECEDENCE: junk dwarfs cannot eat the coal first (run94)', () => {
  const bot = makeMockBot({
    items: [item('cobblestone', 79), item('raw_copper', 17), item('sand', 10), item('raw_iron', 3)]
  })
  const plan = smeltablesIn(bot)
  const names = plan.map(p => p.name)
  // v0.134.0: the ladder metal leads the metal class, the count-dwarf copper follows
  assert.deepEqual(names.slice(0, 2), ['raw_iron', 'raw_copper'], 'ladder metal leads, copper follows despite the count dwarf')
  // the non-metals keep count-desc: cobble 71 (79 - 8 reserve) > sand 10
  assert.equal(names[2], 'cobblestone')
  assert.equal(names[3], 'sand')
  assert.equal(plan.find(p => p.name === 'cobblestone').count, 71, 'the cobble reserve still applies')
})

// (v0.134.0) THE IRON LADDER PRECEDENCE - run550 (35950649305) measured the next
// starvation tier: smelted=26 of which 17 copper_ingot, iron_ore mined=25, pickaxe
// tiers wooden=17 stone=7 iron=0 (the all-history wall). The count-desc order let
// the copper piles eat every metal window; the ladder's iron line can never land
// that way. The ladder metals (iron_ore / deepslate_iron_ore / raw_iron) now lead
// the metal class regardless of pile size.
test('smeltablesIn IRON LADDER PRECEDENCE: a count-dwarf raw_iron outranks the copper mountain (run550)', () => {
  const bot = makeMockBot({
    items: [item('raw_copper', 31), item('raw_iron', 6), item('copper_ore', 12)]
  })
  const plan = smeltablesIn(bot)
  const names = plan.map(p => p.name)
  assert.deepEqual(names, ['raw_iron', 'raw_copper', 'copper_ore'], 'the ladder metal leads; copper keeps count-desc behind it')
})

test('smeltablesIn IRON LADDER PRECEDENCE: iron_ore and raw_iron both lead, junk-safe and legacy-safe', () => {
  // both iron producers lead; the copper/gold relative order is byte for byte legacy
  const bot = makeMockBot({
    items: [item('raw_gold', 40), item('iron_ore', 4), item('raw_copper', 20), item('raw_iron', 9), item('sand', 55)]
  })
  const plan = smeltablesIn(bot)
  const names = plan.map(p => p.name)
  assert.deepEqual(names.slice(0, 2), ['raw_iron', 'iron_ore'], 'the two ladder metals lead, count-desc between them')
  assert.deepEqual(names.slice(2, 4), ['raw_gold', 'raw_copper'], 'gold/copper keep the legacy count-desc order behind the ladder')
  assert.equal(names[4], 'sand', 'the non-metals stay behind the whole metal class')
  // a pocket with NO ladder metal sorts exactly as v0.106.0 (count-desc in-class)
  const botNoIron = makeMockBot({ items: [item('raw_copper', 31), item('raw_gold', 5)] })
  assert.deepEqual(
    smeltablesIn(botNoIron).map(p => p.name),
    ['raw_copper', 'raw_gold'],
    'an iron-less pocket sorts byte for byte as the v0.106.0 tree'
  )
})

test('smeltablesIn METAL PRECEDENCE: a metal-less pocket sorts exactly as before (the legacy pin)', () => {
  const bot = makeMockBot({ items: [item('sand', 30), item('cobblestone', 12), item('clay_ball', 5)] })
  const plan = smeltablesIn(bot)
  // the reserve drops cobble to 4 -> the legacy count-desc order: sand, clay, cobble
  assert.deepEqual(plan.map(p => p.name), ['sand', 'clay_ball', 'cobblestone'])
  assert.deepEqual(plan.map(p => p.count), [30, 5, 4])
})

test('smeltablesIn METAL PRECEDENCE: junk-safe - unknown names never rank as metals', () => {
  const bot = makeMockBot({ items: [item('mystery_ball', 9), item('raw_gold', 2), item('sand', 40)] })
  const plan = smeltablesIn(bot)
  const names = plan.map(p => p.name)
  assert.ok(!names.includes('mystery_ball'), 'not smeltable at all')
  assert.equal(names[0], 'raw_gold', 'the metal leads even with 2 units')
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
  // Collision #40 merge (both v0.109.0 lines): the pocket wood is 16 planks, not
  // 4 sticks - the wood-first junk pick takes the spare planks (spare 8 above the
  // reserve) whose REAL vanilla capacity (floor(6 x 1.5) = 9) covers the whole
  // 8-batch, so the machinery test stays full-size AND vanilla-honest. The old
  // stick pocket would now honestly clamp to 1 (2 sticks complete ONE item - the
  // exact F13 class the fuel-aware batch cures; the mock is coal-quantized and
  // would have pretended 8).
  const bot = makeMockBot({ machines: [furnace], items: [item('sand', 10), item('coal', 1), item('oak_planks', 16)] })
  const res = await smeltBatch(bot, { machineBlock: furnace, inputName: 'sand', count: 8, ...FAST })
  assert.equal(res.smelted, 8)
  assert.equal(res.reason, 'ok')
  assert.ok(furnace.closed, 'window must be closed afterwards')
  const counts = n => bot.inventory.items().filter(i => i.name === n).reduce((a, i) => a + i.count, 0)
  assert.equal(counts('glass'), 8, 'output must be IN the inventory (verified)')
  assert.equal(counts('sand'), 2, 'only the batch left the inventory')
  // (v0.109.0) the JUNK-window wood-first pick: sand is not a metal, so the
  // fuel pick chose the spare planks (woodPick first) and the COAL SURVIVES for
  // the metal windows and the tithe/bank chain (the run97 F13 cure). The mock
  // is coal-quantized (fuelUnitsPer=8) and pulls the whole leftover fuel stack
  // back at the end, so the planks read 16 again - the observable here is the
  // COAL that never left the pocket (the legacy order would have consumed it 0).
  assert.equal(counts('coal'), 1, 'coal survived - the junk window must not eat it')
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
  const bot = makeMockBot({ machines: [furnace], items: [item('sand', 4), item('coal', 7)] })
  const res = await smeltBatch(bot, { machineBlock: furnace, inputName: 'sand', count: 4, ...FAST })
  assert.equal(res.rescued, 5, 'the 5 abandoned glass are fleet property')
  assert.equal(res.smelted, 4, 'and our own batch still smelted')
  const counts = n => bot.inventory.items().filter(i => i.name === n).reduce((a, i) => a + i.count, 0)
  assert.equal(counts('glass'), 9)
})

test('smeltBatch timeout gives input and fuel back, machine left clean', async () => {
  const furnace = new MockFurnace({ mode: 'never' }) // output never appears
  const bot = makeMockBot({ machines: [furnace], items: [item('sand', 6), item('coal', 7)] })
  const res = await smeltBatch(bot, { machineBlock: furnace, inputName: 'sand', count: 6, maxSeconds: 0.15, ...FAST })
  assert.equal(res.smelted, 0)
  assert.equal(res.reason, 'timeout')
  const counts = n => bot.inventory.items().filter(i => i.name === n).reduce((a, i) => a + i.count, 0)
  assert.equal(counts('sand'), 6, 'input pulled back out')
  assert.equal(counts('coal'), 7, 'unburned fuel pulled back out')
  assert.ok(furnace.closed)
})

test('smeltBatch detects ghost input transfers (26.2 desync)', async () => {
  const furnace = new MockFurnace({ mode: 'ghostInput' })
  const bot = makeMockBot({ machines: [furnace], items: [item('sand', 6), item('coal', 7)] })
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
  const bot = makeMockBot({ machines: [dead], items: [item('sand', 4), item('coal', 7)], openThrows: true })
  const res = await smeltBatch(bot, { machineBlock: dead, inputName: 'sand', count: 4, ...FAST })
  assert.equal(res.reason, 'cannot open (window dead)')
  const bot2 = makeMockBot({ machines: [far], items: [item('sand', 4), item('coal', 7)], gotoFails: true })
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
    items: [item('sand', 8), item('iron_ore', 4), item('coal', 8)]
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
  const bot = makeMockBot({ machines: [smoker, furnace], items: [item('beef', 3), item('coal', 7)] })
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

// (v0.98.0) THE FUEL COMMONS - the resupply hook between the empty pickFuel and
// the 'no fuel' verdict.
test('smeltInventory asks the fuelResupply hook before the no-fuel verdict, and a funded pocket smelts', async () => {
  const furnace = new MockFurnace({})
  const bot = makeMockBot({ machines: [furnace], items: [item('sand', 8)] }) // fuel-empty pocket
  const asks = []
  const res = await smeltInventory(bot, {
    ...FAST,
    fuelResupply: ({ itemsNeeded }) => {
      asks.push(itemsNeeded)
      bot._items.push(item('coal', 7)) // the commons answers (above the junk floor)
    }
  })
  assert.deepEqual(asks, [8], 'the hook read the live plan count')
  assert.equal(res.smelted, 8, 'the withdrawn fuel burned the batch')
  assert.ok(!res.attempts.some(a => a.reason === 'no fuel'), 'no false verdict')
})

test('smeltInventory survives a throwing fuelResupply (the legacy no-fuel shape stands)', async () => {
  const furnace = new MockFurnace({})
  const bot = makeMockBot({ machines: [furnace], items: [item('sand', 8)] })
  const res = await smeltInventory(bot, {
    ...FAST,
    fuelResupply: () => { throw new Error('commons dead') }
  })
  assert.equal(res.smelted, 0)
  assert.ok(res.attempts.some(a => a.reason === 'no fuel'), 'the honest verdict, byte for byte')
})

test('smeltInventory: a resupply that lands nothing still reads no fuel', async () => {
  const furnace = new MockFurnace({})
  const bot = makeMockBot({ machines: [furnace], items: [item('sand', 8)] })
  let calls = 0
  const res = await smeltInventory(bot, { ...FAST, fuelResupply: () => { calls++ } })
  assert.equal(calls, 1, 'exactly one resupply attempt per starved input')
  assert.equal(res.smelted, 0)
  assert.ok(res.attempts.some(a => a.reason === 'no fuel'))
})

test('smeltInventory stops instantly with a negative time budget', async () => {
  const furnace = new MockFurnace({})
  const bot = makeMockBot({ machines: [furnace], items: [item('sand', 8), item('coal', 7)] })
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
  const bot = makeMockBot({ machines: [far], items: [item('sand', 4), item('coal', 7)], gotoFails: true })
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
  const bot = makeMockBot({ machines: [far], items: [item('sand', 4), item('coal', 7)], gotoFails: true })
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

test('smeltBatch: a dead-geometry verdict pays 3 honest walks - the machine goal never takes the free refusal (v0.130.0)', async () => {
  const far = new MockFurnace({ position: new Vec3(50, 64, 50) })
  const bot = makeMockBot({ machines: [far], items: [item('sand', 4), item('coal', 7)], gotoFails: true })
  let calls = 0
  bot.pathfinder.goto = async () => { calls++ ; throw new Error('No path to the goal!') }
  const res = await smeltBatch(bot, { machineBlock: far, inputName: 'sand', count: 4, ...FAST })
  // (v0.147.0) 3 honest machine walks + THE ONE PATH-GEOMETRY NUDGE shot (an
  // approach segment toward the machine, its own goto inside the count) - the
  // nudge is the start-change the geometry class needs; it is ONE per visit.
  assert.equal(calls, 4, 'all three attempts walk honestly AND the nudge pays one segment goto')
  assert.match(res.reason, /machine unreachable/)
  assert.match(res.reason, /No path to the goal/, 'the final error is the honest A* verdict, not a consult refusal')
  assert.ok(nearDoomedGoal({ x: 50, y: 64, z: 50 }, Date.now(), {}).hit, 'the failed honest walks still re-doom the cell - the storm evidence stays for non-machine consults')
})

// ------------------------------------------------------- (v0.99.0) the yard-adjacent re-arm
// run88's F17: the bot stood IN the yard ('camp furnace: no build (machine near)')
// while seven machines refused 'doomed goal (ledgered 1-2s ago)' - other bots'
// storm-time failed walks ledgered the cells, F17's single attempt-2 re-arm failed
// into the same storm and re-doomed them, and the visit read 'smelt: 0'. A bot
// ADJACENT to the target machine is not the geometry the doomed verdict described:
// every attempt of this machine re-arms (bounded: 3 attempts, the walk's timeout,
// a failed honest attempt still re-records).
test('smeltBatch: a yard-adjacent bot re-arms the doomed consult on EVERY attempt (the F17 cure, v0.99.0)', async () => {
  // dist((0.5,64,0.5) -> (6,64,6)) = 7.78 <= 10 (adjacent), > 4.5 (no reach-open)
  const yard = new MockFurnace({ position: new Vec3(6, 64, 6) })
  const bot = makeMockBot({ machines: [yard], items: [item('sand', 4), item('coal', 7)] })
  assert.ok(SMELT_YARD_NEAR_DISTANCE === 10)
  recordDoomedGoal({ x: 6, y: 64, z: 6 }, Date.now(), { ttl: MACHINE_DOOM_TTL_MS }) // another bot's storm verdict
  let calls = 0
  bot.pathfinder.goto = async goal => { // the storm hits attempt 1, then clears (the bot moves, like the field)
    if (++calls === 1) throw new Error('No path to the goal!')
    bot.entity.position = new Vec3(goal.x, goal.y, goal.z)
  }
  const res = await smeltBatch(bot, { machineBlock: yard, inputName: 'sand', count: 4, ...FAST })
  assert.equal(res.smelted, 4, 'the honest attempt-2 walk lands the batch')
  // (v0.160.0) THREE gotos now: attempt 1 paid the storm, the close shot's
  // segment rode between (d=7.78 is inside the 24b envelope - the shot walks
  // the bot toward the machine), attempt 2 walked. No consult auto-refuse in
  // between - the count is the contract, the segment is the cure's own leg.
  assert.equal(calls, 3, 'attempt 1 paid the storm, the close shot moved the start, attempt 2 walked')
  assert.equal(doomedGoalStats().refusals, 0, 'a PRESENT bot is never auto-refused: every consult re-armed')
  assert.ok(doomedGoalStats().rearms >= 2, `both consults re-armed (got ${doomedGoalStats().rearms})`)
})

test('smeltBatch: a FAR bot on a doomed cell walks honestly from the FIRST attempt (v0.130.0)', async () => {
  const far = new MockFurnace({ position: new Vec3(50, 64, 50) })
  const bot = makeMockBot({ machines: [far], items: [item('sand', 4), item('coal', 7)] })
  recordDoomedGoal({ x: 50, y: 64, z: 50 }, Date.now(), { ttl: MACHINE_DOOM_TTL_MS })
  let calls = 0
  bot.pathfinder.goto = async () => { calls++; return undefined } // the storm cleared: the honest walk SUCCEEDS
  const res = await smeltBatch(bot, { machineBlock: far, inputName: 'sand', count: 4, ...FAST })
  assert.equal(res.smelted, 4, 'the honest walk lands the batch')
  assert.equal(calls, 1, 'attempt 0 walked - no consult auto-refuse before it')
  assert.equal(doomedGoalStats().refusals, 0, 'a machine goal is never auto-refused: the consult re-armed')
  assert.equal(doomedGoalStats().rearms, 1, 'exactly one re-arm (attempt 0)')
})

test('smeltBatch: a junk-position bot on a doomed cell walks honestly too - the re-arm is unconditional (v0.130.0)', async () => {
  const yard = new MockFurnace({ position: new Vec3(6, 64, 6) })
  const bot = makeMockBot({ machines: [yard], items: [item('sand', 4), item('coal', 7)] })
  bot.entity.position = new Vec3(NaN, 64, NaN) // an unknown position
  recordDoomedGoal({ x: 6, y: 64, z: 6 }, Date.now(), { ttl: MACHINE_DOOM_TTL_MS })
  let calls = 0
  bot.pathfinder.goto = async () => { calls++; return undefined }
  const res = await smeltBatch(bot, { machineBlock: yard, inputName: 'sand', count: 4, ...FAST })
  assert.equal(res.smelted, 4, 'the honest walk lands regardless of the bot position')
  assert.equal(doomedGoalStats().refusals, 0, 'no consult auto-refuse for machine goals, junk position included')
  assert.equal(doomedGoalStats().rearms, 1)
})

test('smeltInventory: the visit budget threads into every batch it starts', async () => {
  const far = new MockFurnace({ position: new Vec3(50, 64, 50) })
  const bot = makeMockBot({ machines: [far], items: [item('sand', 4), item('coal', 7)] })
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

test('smeltInventory: a spent walk slice closes the machine scan (run82: 8 x visit budget spent)', async () => {
  // run82's F3 zero line refused EIGHT machines 'visit budget spent (walk slice)'
  // - the walk loop breaks per machine but the scan kept feeding machines into a
  // dead visit. One slow goto burns the visit clock below the 1s walk-slice floor:
  // machine 1 pays the goto, its attempt 2 reads slice 0 and refuses - machines
  // 2..4 must NEVER re-refuse (the v0.93.0 spent-slice stop closes the scan).
  const machines = [0, 1, 2, 3].map(i => new MockFurnace({ position: new Vec3(40 + i, 64, 40 + i) }))
  const bot = makeMockBot({ machines, items: [item('sand', 6), item('coal', 7)] })
  bot.pathfinder.goto = async () => { await new Promise(r => setTimeout(r, 2100)); throw new Error('walk to furnace: timeout after Nms') }
  const res = await smeltInventory(bot, { ...FAST, maxSeconds: 3 })
  assert.equal(res.smelted, 0)
  assert.equal(res.attempts.length, 1, `the scan closes on the first spent slice (got ${res.attempts.length}: ${JSON.stringify(res.attempts)})`)
  assert.match(res.attempts[0].reason, /visit budget spent \(walk slice\)/)
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
  const bot = makeMockBot({ machines: [far], items: [item('sand', 4), item('coal', 7)], gotoFails: true })
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
  const bot = makeMockBot({ machines: [], items: [item('sand', 4), item('coal', 7)] })
  const res = await smeltInventory(bot, { ...FAST, maxSeconds: 30 })
  assert.equal(res.smelted, 0)
  assert.deepEqual(res.attempts, [{ name: 'sand', machine: 'furnace', reason: 'no machine in reach (furnace within 48b)' }])
})

// ----------------------------------------------------------------- v0.147.0
// THE PATH-GEOMETRY NUDGE + THE YARD-SEEK - run85 (dispatch 36016062585, the
// v0.146.0 commune's first field test): the smelt economy collapsed to
// smelted=1 (run49: 25) on a PATH-dominated failure class - machine walks and
// commons walks died 'Took to long to decide path to goal!' from starts the
// A* could not route, and F4 held raw_copper:28 all run behind one 'no
// machine in reach (48b)'.
test('smeltBatch: the path-geometry nudge changes the start and the retry lands (v0.147.0)', async () => {
  const far = new MockFurnace({ position: new Vec3(40.5, 64, 0.5) }) // 40b: a segment exists, the reach-open cannot
  const bot = makeMockBot({ machines: [far], items: [item('sand', 4), item('coal', 7)] })
  const lines = []
  let calls = 0
  bot.pathfinder.goto = async goal => {
    calls++
    if (calls === 1) throw new Error('Took to long to decide path to goal!')
    // the nudge changed the start: a later honest walk MOVES the bot
    bot.entity.position = new Vec3(goal.x, goal.y, goal.z)
  }
  const res = await smeltBatch(bot, { machineBlock: far, inputName: 'sand', count: 4, ...FAST, log: m => lines.push(m) })
  assert.equal(res.smelted, 4, 'the nudge landed - the batch smelted')
  assert.ok(lines.some(l => /walk nudge/.test(l)), 'the nudge is logged, not silent')
})

test('smeltBatch: the nudge is ONE shot per visit (v0.147.0)', async () => {
  const far = new MockFurnace({ position: new Vec3(40.5, 64, 0.5) })
  const bot = makeMockBot({ machines: [far], items: [item('sand', 4), item('coal', 7)] })
  const lines = []
  bot.pathfinder.goto = async () => { throw new Error('Took to long to decide path to goal!') }
  const res = await smeltBatch(bot, { machineBlock: far, inputName: 'sand', count: 4, ...FAST, log: m => lines.push(m) })
  assert.equal(res.smelted, 0)
  assert.match(res.reason, /machine unreachable.*Took to long/)
  const verdicts = lines.filter(l => /walk nudge: (inside the direct envelope|closed to d=)/.test(l))
  assert.equal(verdicts.length, 1, 'one nudge verdict per visit - the budget discipline')
})

test('smeltInventory: the yard-seek rescans after the empty scan and lands the smelt (v0.147.0)', async () => {
  const machines = [] // the seek's "arrival" populates the scan world
  const bot = makeMockBot({ machines, items: [item('sand', 4), item('coal', 7)] })
  const lines = []
  let seeks = 0
  const res = await smeltInventory(bot, {
    ...FAST, maxSeconds: 30,
    yardSeek: async () => { seeks++; machines.push(new MockFurnace({ position: new Vec3(10.5, 64, 10.5) })); return true },
    log: m => lines.push(m)
  })
  assert.equal(seeks, 1)
  assert.equal(res.smelted, 4, 'the seek put the machine inside the scan - the smelt followed')
  assert.ok(lines.some(l => /yard seek: arrived yard-side - rescanning the machines/.test(l)))
})

test('smeltInventory: the yard-seek is ONE shot and its failure leaves the honest verdict (v0.147.0)', async () => {
  const bot = makeMockBot({ machines: [], items: [item('sand', 4), item('beef', 2), item('coal', 7)] })
  const lines = []
  let seeks = 0
  const res = await smeltInventory(bot, {
    ...FAST, maxSeconds: 30,
    yardSeek: async () => { seeks++; return false },
    log: m => lines.push(m)
  })
  assert.equal(res.smelted, 0)
  assert.equal(seeks, 1, 'one seek per visit - two empty inputs never seek twice')
  assert.equal(res.attempts.filter(a => /no machine in reach/.test(a.reason)).length, 2, 'both inputs keep the honest empty-scan verdict')
  assert.equal(lines.filter(l => /yard seek: did not land/.test(l)).length, 1)
})

test('smeltInventory: machines in reach never trigger the seek (v0.147.0)', async () => {
  const far = new MockFurnace({ position: new Vec3(50, 64, 50) })
  const bot = makeMockBot({ machines: [far], items: [item('sand', 4), item('coal', 7)] })
  let seeks = 0
  bot.pathfinder.goto = async () => { throw new Error('No path to the goal!') }
  const res = await smeltInventory(bot, { ...FAST, maxSeconds: 30, yardSeek: async () => { seeks++; return true } })
  assert.equal(res.smelted, 0)
  assert.equal(seeks, 0, 'machines WERE scanned (the walk failed) - the seek is not the cure for that class')
  assert.match(res.attempts[0].reason, /machine unreachable/)
})

test('smeltBatch: the reach-open skips the walk entirely - sick yard paths cannot starve the bay', async () => {
  const near = new MockFurnace({ position: new Vec3(3.5, 64, 3.5) }) // ~4.24 from the bot
  const bot = makeMockBot({ machines: [near], items: [item('sand', 4), item('coal', 7)], gotoFails: true })
  let gotoCalls = 0
  bot.pathfinder.goto = async () => { gotoCalls++; throw new Error('No path to the goal!') }
  const res = await smeltBatch(bot, { machineBlock: near, inputName: 'sand', count: 4, ...FAST })
  assert.equal(gotoCalls, 0, 'a machine within 4.5 needs no pathfinder')
  assert.equal(res.smelted, 4, 'the batch smelted via the reach-open')
  assert.equal(res.reason, 'ok')
})

// (v0.170.0) THE MACHINE VERTICAL GATE - run60 (36098615960, the v0.168.0
// fleet) measured 5 'visit budget spent (walk slice)' verdicts, 4 of them the
// METAL ladders (raw_iron / raw_copper@blast_furnace) from bots 28-29 levels
// under the yard: the machine scan's 48b envelope sees the yard machines
// ACROSS the vertical (dy 28 over 5-7b lateral), every walk is a doomed
// mostly-vertical climb that pays its full slice, and the nudge burns the
// rest. The chest walks' chestVerticalDoom arithmetic now gates the machine
// walk - the same strict shape (dy >= 20 AND lateral < dy).
test('smeltBatch: the machine vertical gate refuses the shaft-top shape before the walk pays', async () => {
  const yard = new MockFurnace({ position: new Vec3(5.5, 71, 2.5) }) // dy 28, lateral ~5.4 from the deep bot
  const bot = makeMockBot({ machines: [yard], items: [item('raw_iron', 4), item('coal', 7)] })
  bot.entity.position = new Vec3(0.5, 43, 0.5) // the run60 shape: y=43 under the yard at y=71
  let gotoCalls = 0
  bot.pathfinder.goto = async () => { gotoCalls++; throw new Error('no path') }
  const res = await smeltBatch(bot, { machineBlock: yard, inputName: 'raw_iron', count: 4, ...FAST })
  assert.equal(gotoCalls, 0, 'a doomed vertical walk never pays the pathfinder')
  assert.equal(res.smelted, 0)
  assert.equal(res.reason, 'machine unreachable (the yard stands 28 levels up over 5b lateral - the walk ladder cannot climb)')
})

test('smeltBatch: a machine inside the walkable band keeps the legacy ladder (dy < 20)', async () => {
  const low = new MockFurnace({ position: new Vec3(50.5, 71, 50.5) }) // dy 7 from the default y=64 bot
  const bot = makeMockBot({ machines: [low], items: [item('sand', 4), item('coal', 7)] })
  let gotoCalls = 0
  bot.pathfinder.goto = async () => { gotoCalls++; throw new Error('no path') }
  const res = await smeltBatch(bot, { machineBlock: low, inputName: 'sand', count: 4, ...FAST })
  assert.ok(gotoCalls >= 1, 'the walkable band still walks')
  assert.match(res.reason, /machine unreachable \(no path\)/)
})

test('smeltBatch: a hillside machine keeps the legacy ladder (lateral >= dy)', async () => {
  const hill = new MockFurnace({ position: new Vec3(35.5, 71, 0.5) }) // dy 28, lateral 35 - A* may route a staircase
  const bot = makeMockBot({ machines: [hill], items: [item('raw_iron', 4), item('coal', 7)] })
  bot.entity.position = new Vec3(0.5, 43, 0.5)
  let gotoCalls = 0
  bot.pathfinder.goto = async () => { gotoCalls++; throw new Error('no path') }
  await smeltBatch(bot, { machineBlock: hill, inputName: 'raw_iron', count: 4, ...FAST })
  assert.ok(gotoCalls >= 1, 'a hillside machine (lateral >= dy) still walks')
})

test('smeltBatch: a junk position read is no doom - the legacy walk runs byte for byte', async () => {
  const far = new MockFurnace({ position: new Vec3(50.5, 71, 50.5) })
  const bot = makeMockBot({ machines: [far], items: [item('sand', 4), item('coal', 7)] })
  bot.entity.position = null
  let gotoCalls = 0
  bot.pathfinder.goto = async () => { gotoCalls++; throw new Error('no path') }
  await smeltBatch(bot, { machineBlock: far, inputName: 'sand', count: 4, ...FAST })
  assert.ok(gotoCalls >= 1, 'no position read means no doom and a real walk attempt')
})

test('smeltBatch: the walk ladder hugs on attempt 1 and stands off on the retries', async () => {
  const far = new MockFurnace({ position: new Vec3(50, 64, 50) })
  const bot = makeMockBot({ machines: [far], items: [item('sand', 4), item('coal', 7)] })
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
  assert.equal(smeltBatchWaitMs({ maxSeconds: 30, batch: 3, smeltSecondsPerItem: 11, pollMs: 1200, visitRemainingMs: 0.4 }),
    0, 'a sub-second cap floors to zero (honest - the loop exits and pulls back)')
  assert.equal(smeltBatchWaitMs({}), 90 * 1000 + 1200 * 3, 'the bare call = the production defaults')
})

// ------------------------------------------------- v0.97.0 the spent-visit batch stop
test('smeltBatchWaitMs: a SPENT visit (remaining 0) reads as zero wait, never the legacy unbounded clock (run86 F7 hard kill)', () => {
  // run86 (35809634630) F7: the machine walk + open + put spent the visit slice,
  // the poll-start remaining read exactly 0, and the old `> 0` guard DISCARDED the
  // cap - the batch degraded to the legacy unbounded clock (64 x 11s = 704s+), the
  // bot never reached its final bank, 17 banked bots hung into the hard kill.
  assert.equal(smeltBatchWaitMs({ maxSeconds: 45, batch: 76, smeltSecondsPerItem: 11, pollMs: 1200, visitRemainingMs: 0 }),
    0, 'the run86 regression: a spent visit must exit immediately (the timeout path pulls the input+fuel back)')
  assert.equal(smeltBatchWaitMs({ maxSeconds: 45, batch: 76, smeltSecondsPerItem: 11, pollMs: 1200, visitRemainingMs: -5 }),
    0, 'a negative remaining is spent too - a debt cannot mean "unbounded"')
  // one tick of budget left: the cap floors and bounds - the wait is the cap
  assert.equal(smeltBatchWaitMs({ maxSeconds: 45, batch: 76, smeltSecondsPerItem: 11, pollMs: 1200, visitRemainingMs: 2500 }),
    2500, 'a finite remaining always wins over the batch estimate, however small')
  // the LEGACY shape stays byte for byte: null, undefined and non-finite = no cap
  assert.equal(smeltBatchWaitMs({ maxSeconds: 45, batch: 76, smeltSecondsPerItem: 11, pollMs: 1200, visitRemainingMs: null }),
    Math.max(45 * 1000, 76 * 11 * 1000) + 1200 * 3, 'null = the legacy unbounded call')
  assert.equal(smeltBatchWaitMs({ maxSeconds: 45, batch: 76, smeltSecondsPerItem: 11, pollMs: 1200, visitRemainingMs: NaN }),
    Math.max(45 * 1000, 76 * 11 * 1000) + 1200 * 3, 'NaN = no budget was measurable - the legacy shape, not zero')
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

// ------------------------------------------------------ v0.96.0 the input slice
test('smeltInputKeep: a smeltable pocket holds its INPUTS through the pre-deposit (run84b: F4/F8/F11/F13 held 45s and arrived nothing to smelt)', () => {
  // the v0.92.0 fuel slice held the smelt leg's FUEL; the pre-deposit still
  // banked the smeltables THEMSELVES (cobblestone/sand are not in the deposit
  // KEEP list) - the bot held the reserve clock, arrived at the machine with
  // an empty smeltable scan, and the slice drained standing. Run84b measured
  // the shape end to end: 4 reserves held, 4x 'smelt: 0 (nothing to smelt)',
  // smelted=0 fleet-wide. The keep-list extension fixes the pocket one layer
  // up from the fuel slice - same contract, same junk-safety.
  assert.deepEqual(smeltInputKeep({ carriesSmeltables: true }), SMELT_INPUT_KEEP)
  // a pocket without smeltables banks everything as before - the legacy shape
  assert.deepEqual(smeltInputKeep({ carriesSmeltables: false }), [])
  assert.deepEqual(smeltInputKeep({}), [], 'the flag omitted = the legacy keep list')
  assert.deepEqual(smeltInputKeep(null), [], 'junk opts are safe (the body-guard, not the destructuring default)')
  assert.deepEqual(smeltInputKeep(undefined), [])
  assert.deepEqual(smeltInputKeep(42), [])
  assert.deepEqual(smeltInputKeep('junk'), [])
  // fresh arrays: a caller mutating its keep list must never poison the const
  const a = smeltInputKeep({ carriesSmeltables: true })
  a.push('dirt')
  assert.ok(SMELT_INPUT_KEEP.includes('cobblestone'), 'spare cobblestone (the run84b dominant smeltable) rides the hold')
  assert.ok(SMELT_INPUT_KEEP.includes('sand'), 'sand (the glass lane input) rides the hold')
  assert.ok(!SMELT_INPUT_KEEP.includes('log'), 'logs stay out: smeltablesIn excludes them, the tool-bootstrap lifeline')
})

test('smeltInputKeep: every SMELT_OUTPUT input survives the combined pre-deposit keep list', () => {
  // the combined keep the pre-deposit rides: the deposit KEEP + the iron keep
  // (keepForIron keeps raw_iron until the pickaxe - the smelt leg may run
  // after it, so the input slice must carry raw_ itself) + the fuel slice +
  // the input slice. Every input the smelt scan could plan must survive the
  // deposit matcher (keep.some(k => name.includes(k))) - one miss re-creates
  // the run84b starvation for that input exactly.
  const combined = [...KEEP, ...['iron_ingot', 'raw_iron'], ...SMELT_FUEL_KEEP, ...SMELT_INPUT_KEEP]
  const misses = Object.keys(SMELT_OUTPUT).filter(name => !combined.some(k => name.includes(k)))
  assert.deepEqual(misses, [], 'every smeltable input must ride the combined keep list')
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
  const bot = makeMockBot({ machines: [f], items: [item('cobblestone', 93), item('coal', 18)] })
  await smeltBatch(bot, { machineBlock: f, inputName: 'cobblestone', count: 93, ...FAST })
  assert.deepEqual(puts, [64], 'the put asked for 64, never 93 (the destination-full class)')
  // the mock's window rows take ONE item per slot (36 rows), so a full 64-take
  // cannot land there - the pocket-surplus pin is the honest half of this spy:
  // the surplus stayed pocketed exactly as the cap promises
  assert.ok(bot._items.some(i => i.name === 'cobblestone' && i.count === 29), 'the pocket keeps the 29 surplus')
})

test('smeltBatch: a capped put smelts end to end (30 cobble, inside the mock row space)', async () => {
  const f = new MockFurnace({ position: new Vec3(1.5, 64, 0.5) })
  const bot = makeMockBot({ machines: [f], items: [item('cobblestone', 30), item('coal', 10)] })
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
  const bot = makeMockBot({ machines: [f], items: [item('cobblestone', 20), item('coal', 9)] })
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
  const bot = makeMockBot({ machines: [f], items: [item('sand', 8), item('coal', 7)] })
  const res = await smeltBatch(bot, { machineBlock: f, inputName: 'sand', count: 8, ...FAST })
  assert.equal(res.smelted, 8, 'the batch completed')
  assert.equal(res.reason, 'ok')
  assert.equal(f.slots[1], null, 'the unburnable leftover fuel left the slot - no busy-wall for the next visitor')
  assert.ok(bot._items.some(i => i.name === 'coal' && i.count >= 1), 'the leftover coal rides the pocket again')
})

// ------------------------------------------------------------ fuel-aware batch
// run108 (35853190562): F13 put 6 x raw_iron into a blast_furnace with
// 'fuel: 1 x stick' - a guaranteed zero (yield 0.5) that burned the whole visit
// budget on a timeout, and the fleet ended iron_pickaxe=0 on 2 total ingots
// while 41 iron_ore rode pockets.

test('fuelCapacity: complete items a plan can produce, junk-safe', () => {
  assert.equal(fuelCapacity({ name: 'coal', count: 1 }), 8)
  assert.equal(fuelCapacity({ name: 'oak_planks', count: 3 }), 4, '4.5 floors to 4')
  assert.equal(fuelCapacity({ name: 'stick', count: 1 }), 0, '0.5 completes nothing')
  assert.equal(fuelCapacity({ name: 'stick', count: 2 }), 1)
  assert.equal(fuelCapacity({ name: 'stick', count: 5 }), 2, '2.5 floors to 2')
  assert.equal(fuelCapacity({ name: 'unobtainium', count: 9 }), 0, 'unknown fuel')
  assert.equal(fuelCapacity(null), 0)
  assert.equal(fuelCapacity(undefined), 0)
  assert.equal(fuelCapacity({ name: 'coal', count: NaN }), 0)
  assert.equal(fuelCapacity({ name: 'coal', count: 0 }), 0)
  assert.equal(fuelCapacity({ name: 'coal', count: 0.5 }), 0)
  assert.equal(fuelCapacity({ count: 5 }), 0, 'nameless fuel')
})

test('pickFuel ONE-ITEM FLOOR: a capacity-0 plan is not a fuel plan (run108 F13)', () => {
  // 3 sticks = spare 1 over the reserve -> the old shape returned { stick, 1 }
  // (a guaranteed zero); null now, so the commons resupply is asked BEFORE any
  // machine walk.
  const bot = makeMockBot({ items: [item('stick', 3)] })
  assert.equal(pickFuel(bot, { itemsNeeded: 6 }), null, 'the exact run108 F13 pocket')
  assert.equal(pickFuel(bot, { itemsNeeded: 1 }), null, 'even one item cannot complete')
  const bot4 = makeMockBot({ items: [item('stick', 4)] })
  assert.deepEqual(pickFuel(bot4, { itemsNeeded: 1 }), { name: 'stick', count: 2 }, '2 sticks complete 1 item')
  const botPlanks = makeMockBot({ items: [item('oak_planks', 10)] })
  assert.deepEqual(pickFuel(botPlanks, { itemsNeeded: 6 }), { name: 'oak_planks', count: 2 }, 'the clipped-but-completing plank shape stands (cap 3)')
  const botCoal = makeMockBot({ items: [item('coal', 1), item('sand', 6)] })
  assert.deepEqual(pickFuel(botCoal, { itemsNeeded: 6, metalWindow: true }), { name: 'coal', count: 1 }, 'one coal covers 8 - the METAL lane keeps the legacy solid shape byte for byte (the floor never binds the ladder)')
  // (v0.110.0, merged) the JUNK COAL FLOOR: a wood-less JUNK window with only
  // sub-floor coal is the honest skip - the floor's 6 stay for the metal
  // windows and the tithe/bank chain (run98 F4: coal:22 burned to nothing on
  // cobblestone BEFORE any chest contact). The commons' job is the ladder -
  // a resupply of coal:1 funds a METAL window, never a junk one.
  assert.equal(pickFuel(botCoal, { itemsNeeded: 6 }), null, 'sub-floor coal in a junk window is the honest skip')
})

// (v0.112.0) THE CLOCK CAP - the third belt (run99 F3: 64 x cobblestone on a
// 90s clock = a guaranteed timeout-zero)
test('clockCapItems: the poll window bounds the put, junk-safe', () => {
  // production shape: 90s at 11s/item = 8 items per window
  assert.equal(clockCapItems({ maxSeconds: 90, smeltSecondsPerItem: 11 }), 8)
  // a finite visit bounds it harder: 45s left = 4 items
  assert.equal(clockCapItems({ maxSeconds: 90, smeltSecondsPerItem: 11, visitRemainingMs: 45000 }), 4)
  // a spent visit still gets ONE attempt (the v0.97.0 shape handles the rest)
  assert.equal(clockCapItems({ maxSeconds: 90, smeltSecondsPerItem: 11, visitRemainingMs: 0 }), 1)
  assert.equal(clockCapItems({ maxSeconds: 90, smeltSecondsPerItem: 11, visitRemainingMs: -5 }), 1)
  // the visit can be LONGER than maxSeconds - maxSeconds wins
  assert.equal(clockCapItems({ maxSeconds: 30, smeltSecondsPerItem: 11, visitRemainingMs: 600000 }), 2)
  // junk shapes: no maxSeconds and no visit = the legacy unbounded shape
  assert.equal(clockCapItems({ maxSeconds: 0 }), Infinity)
  assert.equal(clockCapItems({ maxSeconds: NaN }), Infinity)
  assert.equal(clockCapItems({}), 8, 'the production defaults ride (90/11)')
  assert.equal(clockCapItems({ maxSeconds: 90, smeltSecondsPerItem: 0 }), 8, 'junk per reads the 11 default')
})

test('smeltBatch: the clock clips the batch to what the window can finish (run99 F3)', async () => {
  const furnace = new MockFurnace({})
  const puts = []
  const origPut = furnace.putInput.bind(furnace)
  furnace.putInput = async (type, meta, count) => { puts.push(count); await origPut(type, meta, count) }
  const bot = makeMockBot({ machines: [furnace], items: [item('cobblestone', 64), item('coal', 8)] })
  const lines = []
  // the mock's verified take settles 200ms per item, so the clock funds a cap
  // of 4 via 2.2s at 0.5s/item - the put must ASK FOR 4, never 64 (the run99
  // monster shape), and the poll must END fully consumed
  const res = await smeltBatch(bot, { machineBlock: furnace, inputName: 'cobblestone', count: 64, maxSeconds: 2.2, smeltSecondsPerItem: 0.5, pollMs: 5, log: m => lines.push(m) })
  assert.deepEqual(puts, [4], 'the put asked for the clock-funded 4, never 64')
  assert.equal(res.smelted, 4, 'the whole clock-funded batch completed')
  assert.equal(res.reason, 'ok')
  assert.ok(!furnace.inputItem(), 'the machine reads free (no half-batch left in the slot)')
  assert.ok(lines.some(l => /the clock clips the batch: the 2s window completes ~4 of 64 x cobblestone/.test(l)), 'the mine reads the clock clip from the log')
  const counts = n => bot.inventory.items().filter(i => i.name === n).reduce((a, i) => a + i.count, 0)
  assert.equal(counts('cobblestone'), 60, 'the remainder stays pocketed for the next chain')
  assert.equal(counts('stone'), 4)
})

test('smeltBatch: the fuel clips the batch to what actually completes', async () => {
  const furnace = new MockFurnace({})
  const bot = makeMockBot({ machines: [furnace], items: [item('sand', 6), item('oak_planks', 10)] })
  const lines = []
  const res = await smeltBatch(bot, { machineBlock: furnace, inputName: 'sand', count: 6, ...FAST, log: m => lines.push(m) })
  assert.equal(res.smelted, 3, '2 spare planks complete exactly 3 items')
  assert.equal(res.reason, 'ok')
  assert.ok(!furnace.inputItem(), 'the clipped batch fully consumed (the clip shows in the pocket remainder, not the slot)')
  assert.ok(lines.some(l => /fuel clips the batch: 2 x oak_planks completes 3 of 6 x sand/.test(l)), 'the mine reads the clip from the log')
  const counts = n => bot.inventory.items().filter(i => i.name === n).reduce((a, i) => a + i.count, 0)
  assert.equal(counts('sand'), 3, 'the uncovered remainder stayed in the pocket')
  assert.equal(counts('glass'), 3)
})

test('smeltBatch: a stick-only pocket is an honest no-fuel verdict, nothing enters the machine', async () => {
  const furnace = new MockFurnace({})
  const bot = makeMockBot({ machines: [furnace], items: [item('sand', 6), item('stick', 3)] })
  const res = await smeltBatch(bot, { machineBlock: furnace, inputName: 'sand', count: 6, ...FAST })
  assert.equal(res.smelted, 0)
  assert.equal(res.reason, 'no fuel')
  assert.ok(!furnace.inputItem() && !furnace.fuelItem(), 'the machine slots stay clean')
  const counts = n => bot.inventory.items().filter(i => i.name === n).reduce((a, i) => a + i.count, 0)
  assert.equal(counts('sand'), 6, 'the ore stays for the next funded chain')
})

test('smeltInventory: a starved pocket asks the commons and the withdrawn coal smelts (run108 F13 cure)', async () => {
  // (v0.110.0, merged) the input is a METAL - the commons exists to fund the
  // ladder (run108's F13 was a raw_iron window), and the junk coal floor must
  // not starve it: a metal window rides the UNBOUNDED solid pick, so the
  // withdrawn coal:1 funds it fully.
  const furnace = new MockFurnace({})
  const bot = makeMockBot({ machines: [furnace], items: [item('iron_ore', 6), item('stick', 3)] })
  const asks = []
  const res = await smeltInventory(bot, {
    ...FAST,
    fuelResupply: ({ itemsNeeded }) => { asks.push(itemsNeeded); bot._items.push(item('coal', 1)) }
  })
  assert.deepEqual(asks, [6], 'the starved gate asked with the live plan count, before any walk')
  assert.equal(res.smelted, 6, 'the withdrawn coal covers the whole batch')
  assert.ok(!res.attempts.some(a => a.reason === 'no fuel'), 'no false verdict')
})

// ---------------------------------------------------- (v0.137.0) THE FIRED SMELT
test('smeltBatch fire mode: the verified puts are the whole visit, the batch stays in the machine', async () => {
  const furnace = new MockFurnace({})
  // junk window (sand): no wood in the pocket -> the coal pick runs ABOVE the
  // floor (7 > 6) and the one spare unit completes 8 items (fuelUnitsPer 8) -
  // the fuel-aware batch clamps 10 -> 8 honestly, fire or not.
  const bot = makeMockBot({ machines: [furnace], items: [item('sand', 10), item('coal', 7)] })
  const res = await smeltBatch(bot, { machineBlock: furnace, inputName: 'sand', count: 10, fire: true, ...FAST })
  assert.equal(res.reason, 'fired', 'the fired visit names itself')
  assert.equal(res.fired, 8, 'the fired count is the batch the machine took (fuel-clipped)')
  assert.equal(res.smelted, 0, 'no output was polled - nothing counted yet (the honest ledger)')
  assert.equal(furnace.slots[0]?.count, 8, 'the input rides the machine now')
  assert.ok(furnace.slots[1], 'the fuel rides the machine too')
  const counts = n => bot.inventory.items().filter(i => i.name === n).reduce((a, i) => a + i.count, 0)
  assert.equal(counts('sand'), 2, 'the pocket keeps the clip remainder (the next chain re-smelts it)')
  assert.equal(counts('coal'), 6, 'the junk floor kept 6; the spare unit rode the batch')
  assert.ok(furnace.closed, 'the window closed - the bot walked away')
})

test('smeltBatch fire mode skips the clock cap: a thin window still funds the full batch', async () => {
  // (v0.137.0) the poll window cannot strand a fired batch - nothing polls. The
  // clock cap's guaranteed-timeout-zero protection is poll-only by construction.
  // METAL window (raw_iron): the unbounded coal pick funds the whole 20-batch
  // from 4 coal (3 x 8 capacity >= 20) - the ladder's fuel arithmetic.
  const furnace = new MockFurnace({})
  const bot = makeMockBot({ machines: [furnace], items: [item('raw_iron', 20), item('coal', 4)] })
  const res = await smeltBatch(bot, { machineBlock: furnace, inputName: 'raw_iron', count: 20, maxSeconds: 0.001, fire: true, ...FAST })
  assert.equal(res.reason, 'fired')
  assert.equal(res.fired, 20, 'no clock clip on a fired batch - the machine burns at its own pace')
})

test('THE FINISHED-HARVEST: output + leftover fuel (the fired batch, burned out) is harvested, not busy', async () => {
  // run552's design flaw caught pre-deployment: the legacy BUSY gate reads
  // fuel-present as busy, so a fired batch's output would be walled in forever
  // by its own leftover fuel. The finished-harvest reads output-with-empty-input
  // as fleet property and pulls the leftover fuel back to the pocket.
  const furnace = new MockFurnace({ startOutput: item('iron_ingot', 3), startFuel: item('coal', 1) })
  const bot = makeMockBot({ machines: [furnace], items: [item('raw_iron', 4), item('coal', 2)] })
  const res = await smeltBatch(bot, { machineBlock: furnace, inputName: 'raw_iron', count: 4, ...FAST })
  assert.equal(res.rescued, 3, 'the finished fired batch\'s output is fleet property')
  const counts = n => bot.inventory.items().filter(i => i.name === n).reduce((a, i) => a + i.count, 0)
  assert.equal(counts('coal'), 3, '2 held + 1 harvested leftover - 1 charged into OUR batch + 1 unburned pulled back (the mock is coal-quantized)')
  assert.ok(!furnace.fuelItem() && !furnace.inputItem(), 'the machine reads idle after the harvest')
  assert.ok(res.smelted >= 1, 'and our own batch still went in after the harvest')
})

test('a LIVE burning batch stays sacred: output + input present is still busy, output untouched', async () => {
  // the finished-harvest's guard rail: input-present means the batch is still
  // burning - taking the output mid-burn would steal (and vanilla would race).
  const furnace = new MockFurnace({ startInput: item('gravel', 20), startFuel: item('coal', 2), startOutput: item('glass', 2) })
  const bot = makeMockBot({ machines: [furnace], items: [item('sand', 6), item('coal', 5)] })
  const res = await smeltBatch(bot, { machineBlock: furnace, inputName: 'sand', count: 6, ...FAST })
  assert.equal(res.reason, 'busy')
  assert.equal(res.rescued, 0, 'a burning batch\'s output is NOT rescued')
  assert.equal(furnace.slots[2]?.count, 2, 'the burning batch\'s output stays in the machine')
  assert.equal(furnace.slots[1]?.count, 2, 'the burning batch\'s fuel stays in the machine')
})

test('smeltInventory fire mode: fired batches accumulate, never enter smelted, never condenm the attempts', async () => {
  const furnace = new MockFurnace({})
  const bot = makeMockBot({ machines: [furnace], items: [item('iron_ore', 6), item('coal', 7)] })
  const res = await smeltInventory(bot, { ...FAST, fire: true })
  assert.equal(res.fired, 6, 'the fired count rides the inventory verdict')
  assert.equal(res.smelted, 0, 'fired is not smelted until the harvest')
  assert.equal(res.attempts.length, 0, "'fired' is a success shape, not a loss - no attempt condemnations")
  assert.equal(furnace.slots[0]?.count, 6, 'the whole plan fired into the machine')
})

test('smeltInventory fire mode: one fired visit ends the input\'s machine loop (the pocket keeps the slot clip)', async () => {
  // fire mode puts the batch and walks - a second machine visit would only
  // re-walk. The remainder (over the 64 slot cap is impossible here, but the
  // batch/plan delta in general) waits for the next chain, exactly like the
  // legacy clock-clip remainder.
  const furnace = new MockFurnace({})
  const bot = makeMockBot({ machines: [furnace], items: [item('sand', 200), item('coal', 70)] })
  const res = await smeltInventory(bot, { ...FAST, fire: true })
  assert.equal(res.fired, 64, 'one slot-capped fired batch')
  assert.ok(furnace.opened <= 1, 'the machine loop closed after the fired visit')
})

test('REGRESSION PIN: the v0.137.0 fired-smelt gate rides the fleet source', () => {
  const fleetSrc = readFileSync(new URL('../../testbed/fleet19.mjs', import.meta.url), 'utf8')
  assert.match(fleetSrc, /const fireLeg = smeltSecs < CAMP_BUILD_FIT_SECS/, 'thin legs fire, fat legs poll')
  assert.match(fleetSrc, /const tier = campBuildTier\(miner\.bot\)/, 'the build gate consults the read-only tier mirror (v0.165.0 - the flat 29s floor priced every build at the full 24s ladder)')
  assert.match(fleetSrc, /fire: fireLeg/, 'the smelt leg wires the fire verdict through')
  assert.match(fleetSrc, /fired=\$\{res\.fired\}/, 'the fired count is named in the leg\'s own line')
  assert.match(fleetSrc, /cannot afford a \$\{tier\.secs\}s \$\{tier\.action\} build \+ the \$\{CAMP_BUILD_PUT_SECS\}s put/, 'the skip line names the TIER arithmetic (run77: 10 skips on 1-20s legs while the pockets held the cheaper tiers)')
  assert.doesNotMatch(fleetSrc, /cannot afford a 24s build \+ the 5s put/, 'the flat 24s-build line is retired (the tier names its own price)')
  assert.doesNotMatch(fleetSrc, /cannot afford a 24s build \+ the 15s smelt floor/, 'the stale 15s-floor line is retired')
})

// ---------------------------------------------------- (v0.139.0) THE HARVEST SWEEP
test('sweepFinishedSmelts: an idle machine\'s finished batch is fleet property - collected, counted, fuel pulled', async () => {
  // run553's gap: 30 fired items sat in machines to the end because no leg
  // without an input ever opened one. The sweep opens them - the fired batch
  // completes on the COLLECTOR's ledger.
  const furnace = new MockFurnace({ startOutput: item('iron_ingot', 3), startFuel: item('coal', 1) })
  const bot = makeMockBot({ machines: [furnace] })
  const lines = []
  const res = await sweepFinishedSmelts(bot, { maxSeconds: 5, log: m => lines.push(m) })
  assert.equal(res.collected, 3, 'the fired batch\'s output lands in the pocket')
  assert.deepEqual(res.outputs, { iron_ingot: 3 })
  const counts = n => bot.inventory.items().filter(i => i.name === n).reduce((a, i) => a + i.count, 0)
  assert.equal(counts('iron_ingot'), 3, 'the harvest rode the close-sync into the inventory')
  assert.equal(counts('coal'), 1, 'the leftover fuel comes back - it would read busy forever otherwise')
  assert.ok(!furnace.fuelItem() && !furnace.inputItem(), 'the machine reads idle after the sweep')
  assert.ok(furnace.closed, 'the window closed')
  assert.ok(lines.some(l => /swept 3 x iron_ingot from a finished fired batch furnace/.test(l)), 'the sweep line names the fired-batch shape')
})

test('sweepFinishedSmelts: a burning batch (input present) stays sacred - nothing taken, nothing pulled', async () => {
  // gravel is NOT in SMELT_OUTPUT - the mock\'s lazy outputItem() is a pure read
  // here, so the slot counts are exact.
  const furnace = new MockFurnace({ startInput: item('gravel', 8), startFuel: item('coal', 2), startOutput: item('copper_ingot', 2) })
  const bot = makeMockBot({ machines: [furnace] })
  const res = await sweepFinishedSmelts(bot, { maxSeconds: 5 })
  assert.equal(res.collected, 0, 'a burning batch\'s output is NOT swept')
  assert.equal(furnace.slots[0]?.count, 8, 'the input stays')
  assert.equal(furnace.slots[1]?.count, 2, 'the fuel stays (taking it would kill the burn)')
  assert.equal(furnace.slots[2]?.count, 2, 'the output stays')
  assert.ok(res.attempts.some(a => a.reason === 'busy'), 'the busy verdict is named in the attempts')
})

test('sweepFinishedSmelts: a fuel leftover with no input never walls the machine - the machine reads idle', async () => {
  const furnace = new MockFurnace({ startFuel: item('coal', 3) })
  const bot = makeMockBot({ machines: [furnace] })
  const res = await sweepFinishedSmelts(bot, { maxSeconds: 5 })
  assert.equal(res.collected, 0, 'nothing to collect - only the fuel pull')
  assert.ok(!furnace.fuelItem(), 'the leftover fuel is pulled')
  const counts = n => bot.inventory.items().filter(i => i.name === n).reduce((a, i) => a + i.count, 0)
  assert.equal(counts('coal'), 3, 'the fuel rode back to the pocket')
})

test('sweepFinishedSmelts: an unreachable machine is a named attempt and the census continues', async () => {
  const far = new MockFurnace({ name: 'blast_furnace', position: new Vec3(50.5, 64, 50.5) })
  const near = new MockFurnace({ position: new Vec3(2.5, 64, 2.5), startOutput: item('stone', 4) })
  const bot = makeMockBot({ machines: [far, near], gotoFails: true })
  const res = await sweepFinishedSmelts(bot, { maxSeconds: 10 })
  assert.equal(res.collected, 4, 'the reachable machine still gets swept')
  assert.equal(res.attempts.length, 1, 'exactly one named failure')
  assert.match(res.attempts[0].reason, /machine unreachable/)
  assert.equal(res.attempts[0].machine, 'blast_furnace')
})

test('sweepFinishedSmelts: a spent deadline sweeps nothing and never throws; dead windows are named attempts', async () => {
  const a = new MockFurnace({ startOutput: item('stone', 2) })
  const botA = makeMockBot({ machines: [a] })
  const zero = await sweepFinishedSmelts(botA, { maxSeconds: 0 })
  assert.equal(zero.collected, 0, 'a zero slice sweeps nothing')
  const b = new MockFurnace({ startOutput: item('iron_ingot', 1) })
  const botB = makeMockBot({ machines: [b], openThrows: true })
  const dead = await sweepFinishedSmelts(botB, { maxSeconds: 5 })
  assert.equal(dead.collected, 0)
  assert.match(dead.attempts[0].reason, /cannot open/, 'a dead window is a named attempt, not a crash')
})

test('REGRESSION PIN: the v0.139.0 harvest sweep rides the fleet source', () => {
  const fleetSrc = readFileSync(new URL('../../testbed/fleet19.mjs', import.meta.url), 'utf8')
  assert.match(fleetSrc, /sweepFinishedSmelts\(miner\.bot/, 'the sweep rides the smelt leg\'s leftover slice')
  assert.match(fleetSrc, /sweep: collected/, 'the sweep\'s harvest is named in the leg\'s own line')
  assert.match(fleetSrc, /smelted \+= swept\.collected/, 'the collector\'s ledger completes the fired batch (the honest ledger)')
  const src = readFileSync(new URL('../../src/lib/smelting.mjs', import.meta.url), 'utf8')
  assert.match(src, /export async function sweepFinishedSmelts/, 'the sweep is a named export')
  assert.match(src, /if \(!furnace\.inputItem\(\) && furnace\.fuelItem\(\)\)/, 'the leftover-fuel pull is input-guarded (a burning batch keeps its fuel)')
})

// ------------------------------------------------- THE GOVERNORED-WALK FAMILY
// (v0.167.0) THE NUDGE WALKS RAW - run563 (fleet 36086024448, the v0.165.0 fleet)
// measured the nudge's OWN approach stalling ('[F13] walk nudge: approach:
// 3 segment(s) walked ... d=24.2 (still outside - a segment stalled)') feeding
// the raw_copper@blast_furnace composites while iron_ingot stayed 0 for the
// FIFTH run. The nudge's approachWalk was the last approach site without the
// injected raw walker - now it carries walkRawToward (the raw-first segment +
// the v0.167.0 stall side-step), the same machinery the yard walk has had
// since v0.56.0. No import cycle: deposit.mjs never imports smelting.mjs.
test('WIRING PIN: the machine nudge walks RAW (the v0.167.0 side-step machinery reaches the machine class)', () => {
  const src = readFileSync(new URL('../../src/lib/smelting.mjs', import.meta.url), 'utf8')
  assert.match(src, /import \{ walkRawToward \} from '\.\/deposit\.mjs'/, 'the raw walker is imported')
  assert.match(src, /closeShot: true, rawWalk: walkRawToward/, 'the nudge approach carries the raw walker next to the close shot')
  assert.match(src, /THE RAW WALK: run563/, 'the evidence comment names the fleet')
})

test('REGRESSION PIN: the v0.140.2 collector\'s ledger counts the rescue', () => {
  const fleetSrc = readFileSync(new URL('../../testbed/fleet19.mjs', import.meta.url), 'utf8')
  assert.match(fleetSrc, /smelted \+= res\.smelted \+ \(res\.rescued \?\? 0\)/, 'the harvested rescue completes the fired batch on the COLLECTOR\'s ledger (fired -> harvested -> smelted)')
  assert.match(fleetSrc, /THE COLLECTOR'S LEDGER/, 'the ledger fix names its evidence')
})

// ------------------------------------------------- THE GOVERNORED-WALK FAMILY
// (v0.146.0) run49 (36008932449): F14's smelt ladder tripped the goal brake on
// its OWN retry cadence (13 machine candidates in one visit) and every candidate
// after the 7th died refused - the visit aborted with the raw metal unsmelted.
// The machine walk's bounded-wait branch now reads the goal brake's named clock
// (the governor/ceiling branch it already had). The regex IS the contract.
test('WALK_REFUSAL_WAIT_RE: the bounded-wait family - governor, fleet ceiling, goal brake', () => {
  const re = WALK_REFUSAL_WAIT_RE
  assert.ok(re.test('walk governor: bot churned 4 goals without progress - walk to furnace refused for 12s'), 'the governor refusal waits')
  assert.ok(re.test('fleet churn ceiling: 9 zero-progress walks fleet-wide - walk to furnace refused for 6s'), 'the fleet ceiling refusal waits')
  assert.ok(re.test('goal brake: 6 goals in 5s - walk to furnace refused for 3s'), 'the goal brake refusal waits (the run49 F14 shape)')
  assert.ok(!re.test('NoPath: No path to the goal!'), 'a terminal NoPath never waits')
  assert.ok(!re.test('The goal was changed before it could be completed!'), 'a goal replacement never waits')
  assert.ok(!re.test('water rescue in progress'), 'the rescue gate keeps its own branch')
  assert.ok(!re.test('fleet goal ceiling: 31 goals fleet-wide in 5s - walk refused for 20s'), 'the FLEET goal ceiling stays terminal - the fleet-wide storm pause is not a visit hostage clock')
})

test('WALK_REFUSAL_WAIT_RE: the named-clock extraction feeds the wait slice', () => {
  const msg = 'goal brake: 6 goals in 5s - walk to furnace refused for 3s'
  const m = /refused for (\d+)s/.exec(msg)
  assert.ok(m, 'the brake refusal carries the wait clock')
  assert.equal(Number(m[1]), 3)
  const g = /refused for (\d+)s/.exec('walk governor: bot churned 4 goals without progress - walk to furnace refused for 12s')
  assert.equal(Number(g[1]), 12, 'the governor shape still extracts')
})

// ---------------------------------------------------------------------------
// (v0.160.0) THE MACHINE CLOSE SHOT - run558 (dispatch 36068771258, the
// v0.159.0 fleet): 'F7 walk nudge: inside the direct envelope' x6 in ONE run -
// six firings, six ZERO-SEGMENT surrenders (the failed bot stood inside the
// 24b envelope, the nudge emitted nothing, the start never changed) - and the
// visit died 'raw_iron@blast_furnace: machine unreachable' x4 + 'raw_iron@
// furnace: machine unreachable' x3 with the raw metal in the pocket.
// Fleet-wide: 8 'walk nudge' verdicts, ALL 'inside the direct envelope'. The
// machine walk is the LAST walk site without the v0.157.0 close shot.
test('smeltBatch: the nudge INSIDE the envelope fires the close shot - the segment walks and the retry lands (v0.160.0, the F7 cure)', async () => {
  const near = new MockFurnace({ position: new Vec3(12.5, 64, 0.5) }) // d=12: inside the 24b envelope, outside the 4.5b reach-open
  const bot = makeMockBot({ machines: [near], items: [item('sand', 4), item('coal', 7)] })
  const lines = []
  let calls = 0
  bot.pathfinder.goto = async goal => {
    calls++
    if (calls === 1) throw new Error('Took to long to decide path to goal!')
    // the close shot's segment (or the retry) moves the bot honestly
    bot.entity.position = new Vec3(goal.x, goal.y, goal.z)
  }
  const res = await smeltBatch(bot, { machineBlock: near, inputName: 'sand', count: 4, ...FAST, log: m => lines.push(m) })
  assert.equal(res.smelted, 4, 'the close shot moved the start - the retry landed')
  assert.ok(lines.some(l => /approach: 1 segment\(s\) walked/.test(l)),
    'the close shot emitted ONE segment (the discriminator: without closeShot the in-envelope nudge logs NO approach line at all)')
  assert.ok(lines.some(l => /walk nudge/.test(l)), 'the nudge decision stays logged')
})

test('smeltBatch: the close shot is ONE segment per visit - a stalled shot breaks, the budget discipline holds (v0.160.0)', async () => {
  const near = new MockFurnace({ position: new Vec3(12.5, 64, 0.5) })
  const bot = makeMockBot({ machines: [near], items: [item('sand', 4), item('coal', 7)] })
  const lines = []
  bot.pathfinder.goto = async () => { throw new Error('Took to long to decide path to goal!') }
  const res = await smeltBatch(bot, { machineBlock: near, inputName: 'sand', count: 4, ...FAST, log: m => lines.push(m) })
  assert.equal(res.smelted, 0)
  assert.match(res.reason, /machine unreachable.*Took to long/)
  const decisions = lines.filter(l => /walk nudge: (inside the direct envelope|closed to d=)/.test(l))
  assert.equal(decisions.length, 1, 'one nudge decision per visit')
  const shots = lines.filter(l => /approach: \d+ segment\(s\) walked/.test(l))
  assert.equal(shots.length, 1, 'ONE close-shot segment per visit - a stalled shot ends the approach (no anti-spin violation)')
  assert.ok(!lines.some(l => /timeout after -/.test(l)), 'no negative timeout anywhere')
})

// ---------------------------------------------------------------------------
// (v0.164.0) THE WALK TIMEOUT NUDGE - run559 (dispatch 36073741918) F19 + run560
// (dispatch 36077394764, the v0.162.0 fleet) F2: 'walk to furnace: timeout after
// 20000ms' -> the nudge never fired (the v0.147.0 pin called it 'the caller's own
// timeout') and the visit died 'machine unreachable' with the raw metal in the
// pocket - the withTimeout belt firing past the A*'s WHOLE clock IS a failed-START
// geometry verdict. The re-goto from the identical start re-fails deterministically.
test('smeltBatch: the walk DECISION TIMEOUT fires the nudge - the close shot moves the start, the retry lands (v0.164.0, the F2/F19 cure)', async () => {
  const near = new MockFurnace({ position: new Vec3(12.5, 64, 0.5) })
  const bot = makeMockBot({ machines: [near], items: [item('sand', 4), item('coal', 7)] })
  const lines = []
  let calls = 0
  bot.pathfinder.goto = async goal => {
    calls++
    if (calls === 1) throw new Error('walk to furnace: timeout after 20000ms')
    // the close shot's segment (or the retry) moves the bot honestly
    bot.entity.position = new Vec3(goal.x, goal.y, goal.z)
  }
  const res = await smeltBatch(bot, { machineBlock: near, inputName: 'sand', count: 4, ...FAST, log: m => lines.push(m) })
  assert.equal(res.smelted, 4, 'the timeout nudge moved the start - the retry landed (was: machine unreachable, raw metal stranded)')
  assert.ok(lines.some(l => /walk nudge/.test(l)), 'the nudge decision is logged (the discriminator: without the v0.164.0 class the timeout fired NO nudge at all)')
  assert.ok(lines.some(l => /approach: 1 segment\(s\) walked/.test(l)), 'the close shot emitted ONE segment - the start changed')
  assert.equal(calls, 3, 'attempt 1 paid the clock, the close shot walked, attempt 2 landed')
})

test('smeltBatch: the RAW-walk abort shape never nudges - the colon-anchored class keeps the deposit doctrine (v0.164.0)', async () => {
  const near = new MockFurnace({ position: new Vec3(12.5, 64, 0.5) })
  const bot = makeMockBot({ machines: [near], items: [item('sand', 4), item('coal', 7)] })
  const lines = []
  bot.pathfinder.goto = async () => { throw new Error('raw walk timeout after 8000ms (d=8.0)') }
  const res = await smeltBatch(bot, { machineBlock: near, inputName: 'sand', count: 4, ...FAST, log: m => lines.push(m) })
  assert.equal(res.smelted, 0)
  assert.match(res.reason, /machine unreachable.*raw walk timeout/)
  assert.ok(!lines.some(l => /walk nudge/.test(l)), 'NO nudge for the raw-hop abort - deposit.mjs: the raw walk\'s own verdict matches NEITHER retry class')
})
