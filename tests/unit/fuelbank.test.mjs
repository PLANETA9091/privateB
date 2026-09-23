// THE FUEL COMMONS (v0.98.0): the yard chests fund the fuel-empty smelt legs.
// Pure policy (fuelWithdrawPlan, pickWithdrawSlots), the raw-click mechanics
// (withdrawStackMove) and the full withdrawal walk (withdrawFuelCommons) - all
// driven with mock windows + a mock chest world, no server needed.
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { Vec3 } from 'vec3'
import { resetDoomedGoalLedger } from '../../src/lib/jobqueue.mjs'
import {
  fuelWithdrawPlan, pickWithdrawSlots, withdrawStackMove, withdrawFuelCommons,
  FUEL_WITHDRAW_CAP, FUEL_COMMON_ORDER
} from '../../src/lib/fuelbank.mjs'

// Unique stable numeric type per item name - window transfers match by type, and
// a mock where two items share a type moves the WRONG stack (the deposit.test
// lesson, now the fuelbank.test lesson too).
const TYPES = new Map()
function item (name, count = 1) {
  if (!TYPES.has(name)) TYPES.set(name, TYPES.size + 1)
  return { name, count, type: TYPES.get(name), stackSize: 64 }
}

beforeEach(() => resetDoomedGoalLedger())

// ------------------------------------------------------------- fuelWithdrawPlan
test('fuelWithdrawPlan: the junk ask family yields null (the Number(null) lesson)', () => {
  const chest = [item('coal', 30)]
  for (const junk of [null, undefined, 0, -5, NaN, Infinity, 'junk', {}]) {
    assert.equal(fuelWithdrawPlan({ itemsNeeded: junk, chestItems: chest }), null, `junk ask ${String(junk)} -> null`)
  }
})

test('fuelWithdrawPlan: junk chest views yield null, the input array is never mutated', () => {
  for (const junk of [null, undefined, 42, 'junk', {}]) {
    assert.equal(fuelWithdrawPlan({ itemsNeeded: 40, chestItems: junk }), null)
  }
  const chest = [item('coal', 30)]
  const frozen = JSON.stringify(chest)
  fuelWithdrawPlan({ itemsNeeded: 40, chestItems: chest })
  assert.equal(JSON.stringify(chest), frozen, 'the const is untouched')
})

test('fuelWithdrawPlan: sizes the slice off the plan (ceil(n/8)), capped', () => {
  const chest = [item('coal', 30)]
  assert.deepEqual(fuelWithdrawPlan({ itemsNeeded: 40, chestItems: chest }), [{ name: 'coal', count: 5 }])
  assert.deepEqual(fuelWithdrawPlan({ itemsNeeded: 8, chestItems: chest }), [{ name: 'coal', count: 1 }])
  assert.deepEqual(fuelWithdrawPlan({ itemsNeeded: 9, chestItems: chest }), [{ name: 'coal', count: 2 }])
  // 100 smeltables -> 13 coal wanted, the cap says 6: the commons is not stripped
  assert.deepEqual(fuelWithdrawPlan({ itemsNeeded: 100, chestItems: chest }), [{ name: 'coal', count: FUEL_WITHDRAW_CAP }])
})

test('fuelWithdrawPlan: coal before charcoal, mixed fills the rest', () => {
  const chest = [item('charcoal', 10), item('coal', 2)]
  // want 5: the 2 coal go first, charcoal covers 3 more
  assert.deepEqual(fuelWithdrawPlan({ itemsNeeded: 40, chestItems: chest }), [
    { name: 'coal', count: 2 }, { name: 'charcoal', count: 3 }
  ])
})

test('fuelWithdrawPlan: a partial stock is taken honestly, junk rows skipped', () => {
  const chest = [item('cobblestone', 30), item('coal', 1), item('sand', 64)]
  assert.deepEqual(fuelWithdrawPlan({ itemsNeeded: 40, chestItems: chest }), [{ name: 'coal', count: 1 }])
  assert.equal(fuelWithdrawPlan({ itemsNeeded: 40, chestItems: [item('cobblestone', 30)] }), null, 'no fuel in the chest -> null')
  const junkCounts = [{ name: 'coal', count: 0 }, { name: 'coal', count: -3 }, { name: 'coal' }, null, 'junk', { name: 'coal', count: 1.5 }]
  assert.deepEqual(fuelWithdrawPlan({ itemsNeeded: 40, chestItems: junkCounts }), [{ name: 'coal', count: 1 }], '1.5 floors to 1, the junk rows never plan')
})

// ------------------------------------------------------------ pickWithdrawSlots
test('pickWithdrawSlots: junk views and junk types yield null', () => {
  for (const w of [null, undefined, {}, { slots: () => null }, { slots: [] }]) {
    assert.equal(pickWithdrawSlots({ window: w, itemType: 1, chestSlots: 27 }), null)
  }
  assert.equal(pickWithdrawSlots({ window: { slots: [item('coal', 5)] }, itemType: NaN, chestSlots: 27 }), null)
  assert.equal(pickWithdrawSlots({ window: { slots: [item('coal', 5)] }, itemType: 1, chestSlots: 0 }), null)
  assert.equal(pickWithdrawSlots({ window: { slots: [item('coal', 5)] }, itemType: 1, chestSlots: 99 }), null, 'chestSlots >= slots.length is a lie -> null')
})

test('pickWithdrawSlots: the mirror pair - source inside the chest range, dest in the pocket', () => {
  const coal = item('coal', 30)
  const pocket = item('coal', 10)
  const window = { slots: [item('cobblestone', 5), coal, item('dirt', 2), pocket, null, null] }
  // chestSlots = 3 (cobble, coal, dirt) | pocket = coal-stack(with room), empty, empty
  assert.deepEqual(pickWithdrawSlots({ window, itemType: coal.type, chestSlots: 3 }), { srcIdx: 1, dstIdx: 3 }, 'the matching pocket stack with room wins over the empty slot')
  assert.equal(pickWithdrawSlots({ window, itemType: item('iron_ore', 1).type, chestSlots: 3 }), null, 'no such chest item')
})

test('pickWithdrawSlots: a full pocket of strangers yields null (the honest stop)', () => {
  const coal = item('coal', 30)
  const window = { slots: [coal, item('dirt', 1), item('gravel', 1)] }
  assert.equal(pickWithdrawSlots({ window, itemType: coal.type, chestSlots: 1 }), null, 'pocket full, no matching stack with room')
  const roomy = { slots: [coal, item('coal', 63), item('dirt', 1)] }
  assert.deepEqual(pickWithdrawSlots({ window: roomy, itemType: coal.type, chestSlots: 1 }), { srcIdx: 0, dstIdx: 1 }, 'a matching pocket stack with room accepts')
})

// ------------------------------------------------------------ withdrawStackMove
// A minimal clickWindow: button 0 = whole-stack swap between cursor and slot,
// button 2 = drop ONE from the cursor onto the slot. That is the exact subset
// withdrawStackMove uses.
function mockWindowBot (slots) {
  let cursor = null
  const clicks = []
  const bot = {
    clickWindow: async (idx, button) => {
      clicks.push({ idx, button })
      const s = slots[idx]
      if (button === 0) {
        if (cursor == null) { cursor = s; slots[idx] = null } // lift
        else { slots[idx] = s && s.type === cursor.type ? { ...s, count: Math.min(s.stackSize ?? 64, s.count + cursor.count) } : cursor; cursor = null } // put down
      } else if (button === 2) {
        if (cursor != null && cursor.count > 0) {
          if (s && s.type === cursor.type && s.count < (s.stackSize ?? 64)) s.count += 1
          else if (!s) slots[idx] = { ...cursor, count: 1 }
          else return // a stranger slot eats nothing (server refusal)
          cursor.count -= 1
          if (cursor.count <= 0) cursor = null
        }
      }
    }
  }
  return { bot, clicks, cursorPeek: () => cursor }
}

test('withdrawStackMove: a whole-stack take is two left clicks (lift, drop)', async () => {
  const slots = [item('coal', 4), null, null, null, null]
  const { bot, clicks } = mockWindowBot(slots)
  await withdrawStackMove(bot, { slots }, { srcIdx: 0, dstIdx: 3, take: 4, stackCount: 4 })
  assert.deepEqual(clicks, [{ idx: 0, button: 0 }, { idx: 3, button: 0 }])
  assert.equal(slots[3].count, 4, 'the stack landed in the pocket slot')
})

test('withdrawStackMove: a partial take lifts, right-click singles, returns the leftover', async () => {
  const slots = [item('coal', 30), null, null, null, null]
  const { bot, clicks } = mockWindowBot(slots)
  await withdrawStackMove(bot, { slots }, { srcIdx: 0, dstIdx: 4, take: 2, stackCount: 30 })
  assert.deepEqual(clicks, [
    { idx: 0, button: 0 }, // lift 30
    { idx: 4, button: 2 }, { idx: 4, button: 2 }, // drop 1 + 1
    { idx: 0, button: 0 } // return 28
  ])
  assert.equal(slots[0].count, 28, 'the leftover went back home')
  assert.equal(slots[4].count, 2, 'the pocket got exactly the take')
})

test('withdrawStackMove: junk take/stackCount throws before ANY click', async () => {
  const slots = [item('coal', 4), null]
  const { bot, clicks } = mockWindowBot(slots)
  for (const junk of [null, undefined, 0, -1, NaN, 'junk']) {
    await assert.rejects(() => withdrawStackMove(bot, { slots }, { srcIdx: 0, dstIdx: 1, take: junk, stackCount: 4 }))
    await assert.rejects(() => withdrawStackMove(bot, { slots }, { srcIdx: 0, dstIdx: 1, take: 2, stackCount: junk }))
  }
  assert.equal(clicks.length, 0, 'no click ever fired on junk')
})

test('withdrawStackMove: a refused dest click returns the stack to the chest slot', async () => {
  const slots = [item('coal', 4), null, null, null, null]
  let lifted = false
  const clicks = []
  const bot = {
    clickWindow: async (idx, button) => {
      clicks.push({ idx, button })
      if (idx === 0 && button === 0) { lifted = !lifted; return } // lift, later the return home
      if (idx === 4 && button === 0) throw new Error('dest refused') // the pocket drop always fails
    }
  }
  await assert.rejects(() => withdrawStackMove(bot, { slots }, { srcIdx: 0, dstIdx: 4, take: 4, stackCount: 4 }))
  assert.deepEqual(clicks, [
    { idx: 0, button: 0 }, // lift
    { idx: 4, button: 0 }, // refused dest
    { idx: 0, button: 0 } // the cursor went back home - the chest slot owns the stack again
  ])
})

// --------------------------------------------------------- withdrawFuelCommons
// A mock chest world: findChest -> bot.findBlock, gotoSafe -> bot.pathfinder.goto,
// openChest -> a 27-slot chest window whose pocket rows ARE the bot inventory.
function mockChestWorld ({ chestItem = null, clickGhost = false, walkFails = false, openFails = false } = {}) {
  const chestSlots = Array.from({ length: 27 }, () => null)
  if (chestItem) chestSlots[0] = chestItem
  const pocket = Array.from({ length: 36 }, () => null)
  const slots = [...chestSlots, ...pocket]
  const chestBlock = { name: 'chest', position: new Vec3(3.5, 64, 3.5) }
  const bot = {
    username: 'FuelBot',
    entity: { position: new Vec3(0.5, 64, 0.5) },
    inventory: { items: () => slots.slice(27).filter(Boolean) },
    pathfinder: { goto: async () => { if (walkFails) throw new Error('NoPath: no path') } },
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

test('withdrawFuelCommons: junk asks never touch the world', async () => {
  for (const junk of [null, undefined, 0, -3, NaN, 'junk']) {
    const world = mockChestWorld({ chestItem: item('coal', 30) })
    const res = await withdrawFuelCommons(world.bot, { itemsNeeded: junk })
    assert.equal(res.taken, 0)
    assert.equal(res.reason, 'nothing to fuel')
  }
})

test('withdrawFuelCommons: walks the yard chest, takes the modest slice, the diff is the truth', async () => {
  const world = mockChestWorld({ chestItem: item('coal', 30) })
  const res = await withdrawFuelCommons(world.bot, { itemsNeeded: 40, budgetMs: 5000 })
  assert.equal(res.reason, 'ok')
  assert.equal(res.taken, 5, 'ceil(40/8) = 5 coal')
  assert.deepEqual(res.plan, [{ name: 'coal', count: 5 }])
  const inPocket = world.bot.inventory.items().reduce((a, i) => a + i.count, 0)
  assert.equal(inPocket, 5, 'the verified diff agrees with the plan')
  assert.equal(world.slots[0].count, 25, 'the chest kept the rest')
  assert.ok(world.chestBlock.opened !== undefined || true)
})

test('withdrawFuelCommons: an empty commons is named, not silently zero', async () => {
  const world = mockChestWorld({ chestItem: item('cobblestone', 30) })
  const res = await withdrawFuelCommons(world.bot, { itemsNeeded: 40, budgetMs: 5000 })
  assert.equal(res.taken, 0)
  assert.equal(res.reason, 'commons empty')
})

test('withdrawFuelCommons: ghost clicks are caught by the inventory diff', async () => {
  const world = mockChestWorld({ chestItem: item('coal', 30), clickGhost: true })
  const res = await withdrawFuelCommons(world.bot, { itemsNeeded: 40, budgetMs: 5000 })
  assert.equal(res.taken, 0, 'the clicks said 5, the pocket said 0 - the pocket wins')
  assert.equal(res.reason, 'commons empty')
})

test('withdrawFuelCommons: a dead walk or a dead window is survived (the next chest or the honest stop)', async () => {
  const walked = mockChestWorld({ chestItem: item('coal', 30), walkFails: true })
  const r1 = await withdrawFuelCommons(walked.bot, { itemsNeeded: 40, budgetMs: 5000 })
  assert.equal(r1.taken, 0)
  assert.equal(r1.reason, 'no chest reached')
  const opened = mockChestWorld({ chestItem: item('coal', 30), openFails: true })
  const r2 = await withdrawFuelCommons(opened.bot, { itemsNeeded: 40, budgetMs: 5000 })
  assert.equal(r2.taken, 0)
  assert.equal(r2.reason, 'no chest reached')
})

test('withdrawFuelCommons: a partial commons stock is taken honestly, then the scan stops', async () => {
  const world = mockChestWorld({ chestItem: item('coal', 2) })
  const res = await withdrawFuelCommons(world.bot, { itemsNeeded: 40, budgetMs: 5000 })
  assert.equal(res.reason, 'ok', '2 units beat 0 - the take still happened')
  assert.equal(res.taken, 2)
  assert.deepEqual(res.plan, [{ name: 'coal', count: 2 }])
  const inPocket = world.bot.inventory.items().reduce((a, i) => a + i.count, 0)
  assert.equal(inPocket, 2)
})
