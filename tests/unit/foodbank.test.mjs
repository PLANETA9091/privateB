// THE FOOD COMMONS (v0.521.0): the ration's own commons - the withdraw side
// of the flesh economy. Pure policy (foodWithdrawPlan, pocketFood), the two
// shoulders' shared number (FOOD_WITHDRAW_CAP === FOOD_TITHE_BOUND), the
// tithe's own arithmetic (foodTitheOverage - the deposit-side mirror), and
// the full withdrawal walk (withdrawFoodCommons) - all driven with mock
// windows + a mock chest world, no server needed. The wire pins lock the
// fleet19 refill and the deposit tithe chain (the 0.511.0 wire-pin shape).
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { Vec3 } from 'vec3'
import { resetWalkGovernors } from '../../src/lib/jobqueue.mjs' // (v0.143.0) the resets drop the module-level fleet goal ceiling the wall-clock tests would otherwise burst
import {
  foodWithdrawPlan, pocketFood, withdrawFoodCommons, foodFamineDue,
  FOOD_WITHDRAW_CAP, FOOD_SWEEP_CHESTS, FOOD_COMMON_ORDER,
  FOOD_TRIP_EVERY_MS, FOOD_TRIP_MIN_REMAINING_MS, FOOD_FAMINE_HUNGER,
  newCommonsMemory, riderFoodAsk,
  MIDFIELD_HUNGRY_BAND, RIDER_FOOD_BUDGET_MS, RIDER_FOOD_MIN_MS
} from '../../src/lib/foodbank.mjs'
import { rememberEmptyChest, liveEmptyCells } from '../../src/lib/fuelbank.mjs' // the commons' own memory laws - item-agnostic, the food book rides them
import { foodTitheOverage, FOOD_TITHE_BOUND, KEEP } from '../../src/lib/deposit.mjs'
import { ROTTEN_FLESH, RATION_BANNED, RATION_MIN_HUNGER, REGEN_HUNGER_FLOOR } from '../../src/lib/ration.mjs'
import { WOOD_TRIP_EVERY_MS, WOOD_TRIP_MIN_REMAINING_MS } from '../../src/lib/woodplan.mjs' // the famine trip rides the wood famine's own envelope - the cross-lib pins hold the byte

// Unique stable numeric type per item name - window transfers match by type, and
// a mock where two items share a type moves the WRONG stack (the deposit.test
// lesson, now the fuelbank.test lesson too).
const TYPES = new Map()
function item (name, count = 1) {
  if (!TYPES.has(name)) TYPES.set(name, TYPES.size + 1)
  return { name, count, type: TYPES.get(name), stackSize: 64 }
}

// ------------------------------------------------------------- foodWithdrawPlan
test('foodWithdrawPlan: fills the plate to the cap, same-name rows merge into one entry', () => {
  assert.deepEqual(foodWithdrawPlan({ chestItems: [item(ROTTEN_FLESH, 30)], cap: 6 }), [{ name: ROTTEN_FLESH, count: 6 }])
  assert.deepEqual(foodWithdrawPlan({ chestItems: [item(ROTTEN_FLESH, 4), item(ROTTEN_FLESH, 10)], cap: 6 }), [{ name: ROTTEN_FLESH, count: 6 }], 'two stacks, ONE plan entry - a split entry would read as a double take')
  assert.deepEqual(foodWithdrawPlan({ chestItems: [item(ROTTEN_FLESH, 3)], cap: 6 }), [{ name: ROTTEN_FLESH, count: 3 }], 'a thin chest gives what it has')
})

test('foodWithdrawPlan: junk-safe end to end', () => {
  assert.equal(foodWithdrawPlan({ chestItems: null }), null)
  assert.equal(foodWithdrawPlan({ chestItems: 'junk' }), null)
  assert.equal(foodWithdrawPlan({ chestItems: [null, undefined, { name: ROTTEN_FLESH, count: 0 }, { name: 'cobblestone', count: 64 }], cap: 6 }), null, 'zero counts and stranger names are not food')
  assert.deepEqual(foodWithdrawPlan({ chestItems: [item(ROTTEN_FLESH, 30)], cap: 'junk' }), [{ name: ROTTEN_FLESH, count: FOOD_WITHDRAW_CAP }], 'a junk cap falls to the default bound')
  assert.equal(foodWithdrawPlan({}), null, 'a no-row ask is the honest null')
})

// ---------------------------------------------------------------- the two laws
test('FOOD_COMMON_ORDER: the staple only, and never the ration\'s bans', () => {
  assert.deepEqual(FOOD_COMMON_ORDER, [ROTTEN_FLESH], 'one name: the only food a lane supplies')
  for (const banned of RATION_BANNED) {
    assert.ok(!FOOD_COMMON_ORDER.includes(banned), `${banned} never rides the order - a commons that feeds poison defeats the doctrine it serves`)
  }
  assert.ok(!RATION_BANNED.includes(ROTTEN_FLESH), 'the staple stays un-banned (the 0.511.0 pricing holds)')
})

test('the two shoulders read ONE number: FOOD_WITHDRAW_CAP === FOOD_TITHE_BOUND', () => {
  assert.equal(FOOD_WITHDRAW_CAP, FOOD_TITHE_BOUND, 'the pocket keeps 6, the withdraw fills to 6 - the fuel tithe\'s own mirror shape')
  assert.equal(FOOD_TITHE_BOUND, 6)
  assert.equal(FOOD_SWEEP_CHESTS, 3, 'the first slice is the 0.98.0 modesty: three chests')
})

// ------------------------------------------------------------------ pocketFood
test('pocketFood: the plate read is staple-only and junk-safe', () => {
  const flesh = item(ROTTEN_FLESH, 3)
  const bot = { inventory: { items: () => [flesh, item('cobblestone', 64), item('bread', 2)] } }
  assert.equal(pocketFood(bot), 3, 'bread is a KEEP food but not an order name - the plate reads the staple only')
  assert.equal(pocketFood({ inventory: { items: () => [] } }), 0, 'the empty plate reads zero')
  assert.equal(pocketFood(null), 0)
  assert.equal(pocketFood(undefined), 0)
  assert.equal(pocketFood({}), 0, 'a bot without an inventory reads an empty plate - the gate never throws')
  assert.equal(pocketFood({ inventory: { items: () => { throw new Error('dead window') } } }), 0, 'a throwing read is an empty plate')
})

// -------------------------------------------------------- withdrawFoodCommons
// A mock chest world: findChest -> bot.findBlock, gotoSafe -> bot.pathfinder.goto,
// openChest -> a 27-slot chest window whose pocket rows ARE the bot inventory.
function mockChestWorld ({ chestItem = null, clickGhost = false, clickGhostTimes = 0, walkFails = false, openFails = false, botPos = null } = {}) {
  resetWalkGovernors() // the fleet goal ceiling is module state - fresh per test world
  let ghostClicks = 0 // the one-shot ghost: the first N button-0 packets die, the re-fire lands
  const chestSlots = Array.from({ length: 27 }, () => null)
  if (chestItem) chestSlots[0] = chestItem
  const pocket = Array.from({ length: 36 }, () => null)
  const slots = [...chestSlots, ...pocket]
  const chestBlock = { name: 'chest', position: new Vec3(3.5, 64, 3.5) }
  const bot = {
    username: 'FoodBot',
    entity: { position: botPos ?? new Vec3(0.5, 64, 0.5) },
    inventory: { items: () => slots.slice(27).filter(Boolean) },
    pathfinder: {
      goto: async goal => {
        if (walkFails) throw new Error('NoPath: no path')
        bot.entity.position = new Vec3(goal.x, goal.y, goal.z)
      }
    },
    findBlock: ({ matching }) => (chestItem || !openFails) && matching(chestBlock) ? chestBlock : null,
    openChest: async () => {
      if (openFails) throw new Error('window dead')
      return {
        slots,
        close () { this.closed = true }
      }
    },
    clickWindow: async (idx, button) => {
      if (clickGhost) return // the ghost-click lie: the packet dies quietly
      if (clickGhostTimes > 0 && button === 0 && ghostClicks < clickGhostTimes) { ghostClicks++; return }
      const s = slots[idx]
      if (button === 0) {
        if (s == null) { /* lift from empty: server refuses, view unchanged */ return }
        if (s.__cursor) return
        s.__cursor = true
        slots[idx] = null
        slots.__held = s
      } else if (button === 2) {
        const held = slots.__held
        if (held == null || held.count <= 0) return
        if (s && s.type === held.type && s.count < (s.stackSize ?? 64)) s.count += 1
        else if (s == null) slots[idx] = { ...held, count: 1 }
        else return
        held.count -= 1
      }
    }
  }
  // the cursor return click (button 0 onto the source slot while holding)
  const origClick = bot.clickWindow
  bot.clickWindow = async (idx, button) => {
    const held = slots.__held
    if (button === 0 && held != null) {
      if (slots[idx] == null) { slots[idx] = held; slots.__held = null; held.__cursor = false; return }
      if (slots[idx].type === held.type && slots[idx].count < (slots[idx].stackSize ?? 64)) {
        slots[idx].count = Math.min(slots[idx].stackSize ?? 64, slots[idx].count + held.count)
        slots.__held = null
        held.__cursor = false
        return
      }
      return // refusal: the held stack stays held (the diff reports it)
    }
    return origClick(idx, button)
  }
  return { bot, slots, chestBlock }
}

test('withdrawFoodCommons: a junk bot never touches the world', async () => {
  for (const junk of [null, undefined]) {
    const res = await withdrawFoodCommons(junk, { cap: 6 })
    assert.equal(res.taken, 0)
    assert.equal(res.reason, 'no bot')
  }
})

test('withdrawFoodCommons: walks the yard chest, fills the plate to the cap, the diff is the truth', async () => {
  const world = mockChestWorld({ chestItem: item(ROTTEN_FLESH, 30) })
  const res = await withdrawFoodCommons(world.bot, { budgetMs: 5000 })
  assert.equal(res.reason, 'ok')
  assert.equal(res.taken, 6, 'the plate fills to FOOD_WITHDRAW_CAP, no more')
  assert.deepEqual(res.plan, [{ name: ROTTEN_FLESH, count: 6 }])
  const inPocket = world.bot.inventory.items().reduce((a, i) => a + i.count, 0)
  assert.equal(inPocket, 6, 'the verified diff agrees with the plan')
  assert.equal(world.slots[0].count, 24, 'the chest kept the rest')
})

test('withdrawFoodCommons: an empty commons is named, not silently zero - and the memory earns its entry', async () => {
  const world = mockChestWorld({ chestItem: item('cobblestone', 30) })
  const memory = newCommonsMemory()
  const logs = []
  const res = await withdrawFoodCommons(world.bot, { memory, budgetMs: 5000, log: m => logs.push(m) })
  assert.equal(res.taken, 0)
  assert.equal(res.reason, 'commons empty')
  assert.equal(res.chestsVisited, 1, 'the chest WAS opened and read - the honest visit')
  assert.ok(logs.some(l => l === 'food commons: chest holds no food'), 'the empty read names itself')
  const cells = liveEmptyCells(memory, 'FoodBot', Date.now())
  assert.equal(cells.length, 1, 'ONLY a chest opened and read empty earns the memory entry')
})

test('withdrawFoodCommons: the remembered empty chest is pre-excluded - the repeat ask walks ONWARD', async () => {
  const world = mockChestWorld({ chestItem: item('cobblestone', 30) })
  const memory = newCommonsMemory()
  const first = await withdrawFoodCommons(world.bot, { memory, budgetMs: 5000 })
  assert.equal(first.chestsVisited, 1)
  const logs = []
  const second = await withdrawFoodCommons(world.bot, { memory, budgetMs: 5000, log: m => logs.push(m) })
  assert.equal(second.chestsVisited, 0, 'the known-empty chest is not re-walked')
  assert.equal(second.reason, 'no chest reached')
  assert.ok(logs.some(l => l === 'food commons: no yard chest in range'), 'the exhausted scan names itself')
})

test('withdrawFoodCommons: the vertical gate skips the doomed chest, one line per ask', async () => {
  const world = mockChestWorld({ chestItem: item(ROTTEN_FLESH, 30), botPos: new Vec3(0.5, 34, 0.5) })
  const logs = []
  const res = await withdrawFoodCommons(world.bot, { budgetMs: 5000, log: m => logs.push(m) })
  assert.equal(res.taken, 0)
  assert.equal(res.chestsVisited, 0, 'the doomed chest is never opened')
  const dooms = logs.filter(l => l.includes('the walk ladder cannot climb'))
  assert.equal(dooms.length, 1, 'ONE vertical-gate line per ask')
})

test('withdrawFoodCommons: the walk failure excludes and continues honestly', async () => {
  const world = mockChestWorld({ chestItem: item(ROTTEN_FLESH, 30), walkFails: true })
  const logs = []
  const res = await withdrawFoodCommons(world.bot, { budgetMs: 5000, log: m => logs.push(m) })
  assert.equal(res.taken, 0)
  assert.equal(res.reason, 'no chest reached')
  assert.ok(logs.some(l => l.startsWith('food commons: chest walk failed (')), 'the failed walk names itself')
})

test('withdrawFoodCommons: the open failure excludes (the cover dig is the fuel walk\'s scar, not this slice)', async () => {
  const world = mockChestWorld({ chestItem: item(ROTTEN_FLESH, 30), openFails: true })
  const logs = []
  const res = await withdrawFoodCommons(world.bot, { budgetMs: 5000, log: m => logs.push(m) })
  assert.equal(res.taken, 0)
  assert.equal(res.chestsVisited, 0)
  assert.ok(logs.some(l => l.startsWith('food commons: open failed (')), 'the failed open names itself')
})

test('withdrawFoodCommons: the ghost clicks lie twice and the diff stays king', async () => {
  const world = mockChestWorld({ chestItem: item(ROTTEN_FLESH, 30), clickGhost: true })
  const logs = []
  const res = await withdrawFoodCommons(world.bot, { budgetMs: 5000, log: m => logs.push(m) })
  assert.equal(res.taken, 0)
  assert.ok(logs.some(l => l === 'food commons: the clicks lied twice - nothing landed in the pocket (ghost clicks)'), 'the double lie names itself')
})

test('withdrawFoodCommons: the one-shot ghost ghosts the whole first fire, the re-fire lands (the v0.159.0 shape)', async () => {
  const world = mockChestWorld({ chestItem: item(ROTTEN_FLESH, 30), clickGhostTimes: 2 })
  const res = await withdrawFoodCommons(world.bot, { budgetMs: 5000 })
  assert.equal(res.reason, 'ok')
  assert.equal(res.taken, 6, 'the first fire ghosted whole (the lift AND the chest return), the re-fire landed the plate')
  const inPocket = world.bot.inventory.items().reduce((a, i) => a + i.count, 0)
  assert.equal(inPocket, 6, 'the pocket received exactly the verified plan')
})

// --------------------------------------------------- the tithe's own arithmetic
test('foodTitheOverage: the mirror of the fuel tithe - exact name, junk-safe, bound-honest', () => {
  assert.equal(foodTitheOverage({ name: ROTTEN_FLESH, pocketCount: 10 }), 4)
  assert.equal(foodTitheOverage({ name: ROTTEN_FLESH, pocketCount: 6 }), 0, 'at the bound nothing moves')
  assert.equal(foodTitheOverage({ name: ROTTEN_FLESH, pocketCount: 2 }), 0)
  assert.equal(foodTitheOverage({ name: 'coal', pocketCount: 38 }), 0, 'the fuel tithe owns the fuels')
  assert.equal(foodTitheOverage({ name: 'bread', pocketCount: 30 }), 0, 'the supplier-less food keeps stay absolute')
  assert.equal(foodTitheOverage({ name: 'rotten_flesh ', pocketCount: 38 }), 0, 'exact names only - no trim, no drift')
  assert.equal(foodTitheOverage({ name: ROTTEN_FLESH, pocketCount: 'junk' }), 0)
  assert.equal(foodTitheOverage({ name: null, pocketCount: 38 }), 0)
  assert.equal(foodTitheOverage({ name: ROTTEN_FLESH, pocketCount: 6.9 }), 0, 'a fractional pocket floors before the bound reads')
})

test('the FLESH KEEP rides: the staple stays in KEEP and the two law comments name the tithe', () => {
  assert.ok(KEEP.includes(ROTTEN_FLESH), 'the 0.516.0 never-banked law holds - the tithe bounds it, it does not repeal it')
})

// ------------------------------------------------------------------ wire pins
// The 0.511.0 wire-pin shape: the source stays the account of record - a
// future edit that unwires the commons fails here, not in the field.
const fleetSrc = readFileSync(new URL('../../testbed/fleet19.mjs', import.meta.url), 'utf8')
const depositSrc = readFileSync(new URL('../../src/lib/deposit.mjs', import.meta.url), 'utf8')
const foodbankSrc = readFileSync(new URL('../../src/lib/foodbank.mjs', import.meta.url), 'utf8')

test('fleet19 wire: the refill rides the bank trip\'s tail, gated on the empty plate and the slice', () => {
  assert.ok(fleetSrc.includes("import { withdrawFoodCommons, pocketFood, riderFoodAsk, MIDFIELD_HUNGRY_BAND, RIDER_FOOD_BUDGET_MS, foodFamineDue } from '../src/lib/foodbank.mjs'"), 'the food commons import rides')
  assert.ok(fleetSrc.includes('const foodCommonsMemory = newCommonsMemory()'), 'the food book is its own book')
  assert.ok(fleetSrc.includes('pocketFood(miner.bot) === 0'), 'the ask fires on the EMPTY plate - below-bound plates never churn')
  assert.ok(fleetSrc.includes('Math.min(15000, Math.floor(remaining() / 4))'), 'the slice mirrors the fuel anchor\'s clock shape')
  assert.ok(fleetSrc.includes('foodSliceMs >= 5000'), 'a chain too near its end skips the walk')
  assert.ok(fleetSrc.includes('withdrawFoodCommons(miner.bot, { yardCenter: yardGoal, memory: foodCommonsMemory'), 'the walk rides the food memory')
  assert.ok(fleetSrc.includes('the plate refills (${food.taken} units)'), 'the delivery names the doctrine\'s why')
  assert.ok(fleetSrc.includes('the plate stays empty (${food.reason}) - the next trip retries'), 'every non-delivery exit names itself (the 0.128.0 named-exits law)')
})

test('deposit wire: the tithe chain names the food arm and the log names the family', () => {
  assert.ok(depositSrc.includes("const foodTithe = item.name === 'rotten_flesh'"), 'the food tithe arm sits in the keep-matched chain')
  assert.ok(depositSrc.includes('foodTithe ? foodTitheOverage({ name: item.name, pocketCount: countOf(item.name) }) : 0'), 'the overage reads the tithe\'s own arithmetic')
  assert.ok(depositSrc.includes('`food tithe: banked ${titheMoved} x ${item.name} (pocket keeps ${FOOD_TITHE_BOUND})`'), 'the banked line names the family (the 0.101.0 observability law)')
  assert.ok(depositSrc.includes("food tithe: more firings ride the banked total"), 'the throttle line rides too')
})

test('foodbank walk: the commons grammar, the gate and the modesty stay pinned in the lib itself', () => {
  assert.ok(foodbankSrc.includes("import { ROTTEN_FLESH, REGEN_HUNGER_FLOOR } from './ration.mjs'"), 'the order reads the ration\'s own staple name - never a typo-shaped second constant')
  assert.ok(foodbankSrc.includes("log('food commons: no yard chest in range')"), 'the exhausted scan names itself')
  assert.ok(foodbankSrc.includes('the walk ladder cannot climb, the plate rides (the tithe owns the refill)'), 'the vertical gate speaks the food dialect of the commons law')
  assert.ok(foodbankSrc.includes("'food commons: chest holds no food'"), 'the empty read names itself')
  assert.ok(foodbankSrc.includes('re-firing the same plan once'), 'the ghost re-fire rides')
  assert.ok(foodbankSrc.includes("new goals.GoalNear(chest.position.x"), 'the walk uses the same goal machinery as the fuel commons')
  assert.ok(foodbankSrc.includes("import { gotoSafe, withTimeout } from './jobqueue.mjs'"), 'the walk rides the fleet\'s own governed walker')
})

// (v0.524.0) THE MIDFIELD FOOD RIDER - the mid-field hungry ask's first
// slice: the fuel ask's walk is ALREADY PAID when it delivers, the rider
// reads the plate for free at the paid chest. The gate is pure - the whole
// law battery runs on numbers, no mocks; the pins lock the wire and the
// quiet-refusal law in the lib and the fleet19 resupply chain.
test('rider gate: the whole law fires, every refusal names its why', () => {
  // the fired face: fuel delivered, plate empty, hunger inside the band, slice funded
  assert.deepEqual(riderFoodAsk({ plate: 0, hunger: 9, fuelTaken: 3, sliceMs: RIDER_FOOD_BUDGET_MS }), { fire: true })
  assert.deepEqual(riderFoodAsk({ plate: 0, hunger: MIDFIELD_HUNGRY_BAND, fuelTaken: 1, sliceMs: RIDER_FOOD_MIN_MS }), { fire: true }, 'the band edge is inside (<=)')
  // the dry fuel ask pays for nothing - the walk is not there to ride
  assert.deepEqual(riderFoodAsk({ plate: 0, hunger: 9, fuelTaken: 0, sliceMs: RIDER_FOOD_BUDGET_MS }), { fire: false, why: 'the fuel ask came up dry - the walk is not paid' })
  assert.equal(riderFoodAsk({ plate: 0, hunger: 9, fuelTaken: -2, sliceMs: RIDER_FOOD_BUDGET_MS }).why, 'the fuel ask came up dry - the walk is not paid', 'a junk verdict reads dry')
  // the plate holds - the bank trip tail owns below-bound, the rider stays quiet
  assert.deepEqual(riderFoodAsk({ plate: 2, hunger: 9, fuelTaken: 3, sliceMs: RIDER_FOOD_BUDGET_MS }), { fire: false, why: 'the plate holds' })
  // the hunger band: above 10 refuses, a dead read refuses
  assert.equal(riderFoodAsk({ plate: 0, hunger: 11, fuelTaken: 3, sliceMs: RIDER_FOOD_BUDGET_MS }).why, `the hunger is not critical (band ${MIDFIELD_HUNGRY_BAND})`)
  assert.equal(riderFoodAsk({ plate: 0, hunger: null, fuelTaken: 3, sliceMs: RIDER_FOOD_BUDGET_MS }).why, 'the hunger read is dead')
  assert.equal(riderFoodAsk({ plate: 0, hunger: undefined, fuelTaken: 3, sliceMs: RIDER_FOOD_BUDGET_MS }).why, 'the hunger read is dead')
  // the slice floor: thinner than the read and the open starves mid-click
  assert.equal(riderFoodAsk({ plate: 0, hunger: 9, fuelTaken: 3, sliceMs: RIDER_FOOD_MIN_MS - 1 }).why, 'the slice cannot fund the read')
  // junk arguments are honest refusals, never throws
  assert.deepEqual(riderFoodAsk({}), { fire: false, why: 'the fuel ask came up dry - the walk is not paid' })
  assert.deepEqual(riderFoodAsk(), { fire: false, why: 'the fuel ask came up dry - the walk is not paid' })
})

test('rider constants: the one-number laws stay named in the lib', () => {
  assert.equal(MIDFIELD_HUNGRY_BAND, 10, 'the critical band is half the bar - the 0.98.0 modesty fires rarely')
  assert.equal(RIDER_FOOD_BUDGET_MS, 8000, 'the rider slice is the read cap, never a walk budget')
  assert.equal(RIDER_FOOD_MIN_MS, 4000, 'the rider floor funds one honest chest open')
  assert.ok(RIDER_FOOD_BUDGET_MS > RIDER_FOOD_MIN_MS, 'the cap sits above the floor')
  assert.ok(MIDFIELD_HUNGRY_BAND < 17, 'the band sits INSIDE the ration eat threshold - an empty plate below 17 is the armed-starvation shape, the rider waits for the critical half')
})

test('rider wire: the fleet19 resupply chain rides the paid walk, refusals stay quiet', () => {
  const fleetSrc = readFileSync(new URL('../../testbed/fleet19.mjs', import.meta.url), 'utf8')
  assert.ok(fleetSrc.includes('riderFoodAsk({ plate: pocketFood(miner.bot), hunger: miner.bot?.food ?? null, fuelTaken: fuel?.taken ?? 0, sliceMs: RIDER_FOOD_BUDGET_MS })'), 'the gate reads the live pocket, the live hunger and the fuel verdict')
  assert.ok(fleetSrc.includes('the mid-field rider fires (the fuel ask paid the walk; the plate empty, the hunger'), 'the fired face names itself on the food commons lane')
  assert.ok(fleetSrc.includes('the rider read refills the plate ('), 'the result line rides')
  assert.ok(fleetSrc.includes('the rider read stays empty ('), 'the refusal line rides')
  assert.ok(fleetSrc.includes('the rider is best-effort - the fuel verdict above stays whole'), 'the rider can never kill the fuel ask it rides')
  assert.equal(fleetSrc.split('const rider = riderFoodAsk(').length - 1, 1, 'the gate fires once per resupply')
  const libSrc = readFileSync(new URL('../../src/lib/foodbank.mjs', import.meta.url), 'utf8')
  assert.ok(libSrc.includes('export function riderFoodAsk'), 'the gate lives in the food lib beside the commons it serves')
  assert.ok(libSrc.includes('a dry fuel ask pays for nothing') || libSrc.includes('A dry fuel ask pays for nothing'), 'the no-walk law is written where the gate lives')
  assert.ok(libSrc.includes('the healthy lean is silent') || libSrc.includes('the healthy lean is silent, the fuel\n// anchor\'s own law'), 'the quiet-refusal law is written in the lib')
})

// ------------------------------------------------------- foodFamineDue (v0.524.0)

test('foodFamineDue: the due verdict - empty plate, no-regen hunger, daylight, a funded clock', () => {
  assert.equal(foodFamineDue({ plateCount: 0, hunger: 17, hasPick: true, msSinceLast: FOOD_TRIP_EVERY_MS + 1, remainingMs: FOOD_TRIP_MIN_REMAINING_MS + 1, timeOfDay: 1000 }), 'due', 'the ration armed + the plate empty + hunger 17 = the no-regen slide - the trip is due')
})

test('foodFamineDue: the band gates - a biting plate rides, an above-floor hunger heals itself', () => {
  assert.equal(foodFamineDue({ plateCount: 1, hunger: 17, hasPick: true, msSinceLast: FOOD_TRIP_EVERY_MS + 1, remainingMs: FOOD_TRIP_MIN_REMAINING_MS + 1, timeOfDay: 1000 }), false, 'below-bound-but-biting: the ration eats, the bank trip refills - a trip here would churn')
  assert.equal(foodFamineDue({ plateCount: 0, hunger: 18, hasPick: true, msSinceLast: FOOD_TRIP_EVERY_MS + 1, remainingMs: FOOD_TRIP_MIN_REMAINING_MS + 1, timeOfDay: 1000 }), false, 'at the regen floor the bot heals itself - the ask waits')
  assert.equal(foodFamineDue({ plateCount: 0, hunger: 20, hasPick: true, msSinceLast: FOOD_TRIP_EVERY_MS + 1, remainingMs: FOOD_TRIP_MIN_REMAINING_MS + 1, timeOfDay: 1000 }), false, 'a full bar never arms the walk')
})

test('foodFamineDue: the wood famine\'s own gates - tool-less, cadence, budget', () => {
  assert.equal(foodFamineDue({ plateCount: 0, hunger: 17, hasPick: false, msSinceLast: FOOD_TRIP_EVERY_MS + 1, remainingMs: FOOD_TRIP_MIN_REMAINING_MS + 1, timeOfDay: 1000 }), false, 'the tool-less bot\'s clock stays the recovery lane\'s (the wood famine\'s own gate byte)')
  assert.equal(foodFamineDue({ plateCount: 0, hunger: 17, hasPick: true, msSinceLast: FOOD_TRIP_EVERY_MS, remainingMs: FOOD_TRIP_MIN_REMAINING_MS + 1, timeOfDay: 1000 }), false, 'one attempt per segment: msSinceLast must EXCEED the cooldown')
  assert.equal(foodFamineDue({ plateCount: 0, hunger: 17, hasPick: true, msSinceLast: FOOD_TRIP_EVERY_MS + 1, remainingMs: FOOD_TRIP_MIN_REMAINING_MS, timeOfDay: 1000 }), false, 'the trip must fit: climb + sweep + return (the wood trip\'s own envelope)')
})

test('foodFamineDue: the night hold defers and junk reads never arm the trip', () => {
  assert.equal(foodFamineDue({ plateCount: 0, hunger: 17, hasPick: true, msSinceLast: FOOD_TRIP_EVERY_MS + 1, remainingMs: FOOD_TRIP_MIN_REMAINING_MS + 1, timeOfDay: 13000 }), 'deferred-night', 'the night walk is the wood trip\'s own hold (12400..23600)')
  assert.equal(foodFamineDue({ plateCount: NaN, hunger: 17, hasPick: true, msSinceLast: FOOD_TRIP_EVERY_MS + 1, remainingMs: FOOD_TRIP_MIN_REMAINING_MS + 1, timeOfDay: 1000 }), false, 'a dead plate read never arms a trip')
  assert.equal(foodFamineDue({ plateCount: 0, hunger: null, hasPick: true, msSinceLast: FOOD_TRIP_EVERY_MS + 1, remainingMs: FOOD_TRIP_MIN_REMAINING_MS + 1, timeOfDay: 1000 }), false, 'a dead hunger read never arms a trip')
  assert.equal(foodFamineDue({ plateCount: 0, hunger: 17, hasPick: true, msSinceLast: NaN, remainingMs: FOOD_TRIP_MIN_REMAINING_MS + 1, timeOfDay: 1000 }), false, 'a dead clock never arms a trip')
})

test('the famine band IS the ration band - the two libs never drift', () => {
  assert.equal(FOOD_FAMINE_HUNGER, RATION_MIN_HUNGER, 'the famine fires where the ration would eat: ONE band')
  assert.equal(FOOD_FAMINE_HUNGER, REGEN_HUNGER_FLOOR, 'the band is the vanilla regen floor (18)')
  assert.equal(FOOD_TRIP_EVERY_MS, WOOD_TRIP_EVERY_MS, 'the cadence discipline is the wood famine\'s own byte')
  assert.equal(FOOD_TRIP_MIN_REMAINING_MS, WOOD_TRIP_MIN_REMAINING_MS, 'the trip envelope is the wood famine\'s own byte')
})

test('fleet19 famine wire: the loop trip rides the wood famine\'s shape and returns to the column', () => {
  assert.ok(fleetSrc.includes('foodFamineDue({'), 'the pure verdict drives the wire')
  assert.ok(fleetSrc.includes('plate: pocketFood(miner.bot), hunger: miner.bot.food ?? NaN'), 'the plate + hunger read is junk-safe at the wire')
  assert.ok(fleetSrc.includes("ensureSurface('food trip')"), 'the climb is the wood trip\'s own mechanic')
  assert.ok(fleetSrc.includes('food trip: famine (hunger '), 'the due line names the shape (the field\'s first read)')
  assert.ok(fleetSrc.includes('food trip: deferred night'), 'the night hold names itself once per night')
  assert.ok(fleetSrc.includes('lastFoodAt = Date.now()'), 'the cadence clock resets on EVERY attempt - a failed sweep must not retry-storm the loop')
  assert.ok(fleetSrc.includes('withdrawFoodCommons(miner.bot, { yardCenter: yardGoal, memory: foodCommonsMemory, budgetMs: 20000'), 'the walk rides the food book (the commons\' own memory)')
  assert.ok(fleetSrc.includes('food trip: 0 (climb refused)'), 'a refused climb names itself - the silent-exit class stays dead')
  assert.ok((fleetSrc.match(/return to column/g) || []).length >= 2, 'BOTH famine legs return to the dig column (wood + food)')
})
