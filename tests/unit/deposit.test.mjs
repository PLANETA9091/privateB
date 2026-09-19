// Chest deposits: bots bank their loot into the yard's chest rows and keep their kit.
// Driven with a mock bot/window - no server needed.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Vec3 } from 'vec3'
import { inventoryLoad, findChest, depositToChest } from '../../src/lib/deposit.mjs'

function item (name, count = 1) {
  // inventory.items() entries only need name/count/type for our code paths
  return { name, count, type: 1 }
}

function makeMockBot ({
  items = [],
  chest = null,
  gotoFails = false,
  openFails = false,
  fullFor = [] // item names the chest cannot accept
} = {}) {
  const bot = {
    username: 'MockBot',
    entity: { position: new Vec3(0.5, 64, 0.5) },
    inventory: { items: () => bot._items },
    _items: items.slice(),
    findBlock: () => chest,
    pathfinder: { goto: async () => { if (gotoFails) throw new Error('no path') } },
    depositCalls: [],
    closed: false,
    openChest: async () => {
      if (openFails) throw new Error('window dead')
      return {
        deposit: async (type, meta, count) => {
          const it = bot._items.find(i => i.type === type)
          if (it && fullFor.includes(it.name)) throw new Error('chest full')
          bot.depositCalls.push({ name: it?.name, count })
          bot._items = bot._items.filter(i => i.type !== type)
        },
        close: () => { bot.closed = true }
      }
    }
  }
  return bot
}

test('inventoryLoad reports slots and free space', () => {
  const bot = makeMockBot({ items: [item('dirt', 64), item('stone', 32)] })
  const load = inventoryLoad(bot)
  assert.equal(load.slots, 2)
  assert.equal(load.free, 34)
  assert.equal(load.units, 96)
})

test('findChest returns null quietly when nothing is loaded', () => {
  const bot = makeMockBot()
  bot.findBlock = () => { throw new Error('chunks unloaded') }
  assert.equal(findChest(bot), null)
})

test('deposit without a chest in range is a soft no-op', async () => {
  const bot = makeMockBot({ items: [item('cobblestone', 10)] })
  const res = await depositToChest(bot)
  assert.equal(res.deposited, 0)
  assert.match(res.reason, /no chest/)
  assert.equal(bot._items.length, 1, 'nothing may leave the inventory')
})

test('deposit banks loot and keeps the tool kit', async () => {
  const chest = { position: new Vec3(3, 64, 3) }
  const bot = makeMockBot({
    chest,
    items: [
      item('wooden_pickaxe', 1),
      item('wooden_shovel', 1),
      item('cobblestone', 64),
      item('dirt', 32),
      item('oak_log', 7) // a log: kept (bot may still want it for crafting)
    ]
  })
  const res = await depositToChest(bot)
  assert.equal(res.deposited, 96, 'cobblestone + dirt must be banked')
  assert.deepEqual(bot.depositCalls.map(c => c.name).sort(), ['cobblestone', 'dirt'])
  const left = bot._items.map(i => i.name).sort()
  assert.deepEqual(left, ['oak_log', 'wooden_pickaxe', 'wooden_shovel'])
  assert.ok(bot.closed, 'the chest window must be closed afterwards')
})

test('a full chest costs only the overflowing item type', async () => {
  const chest = { position: new Vec3(3, 64, 3) }
  const bot = makeMockBot({
    chest,
    fullFor: ['dirt'],
    items: [item('cobblestone', 20), item('dirt', 64), item('gravel', 5)]
  })
  const res = await depositToChest(bot)
  assert.equal(res.deposited, 25)
  assert.deepEqual(bot._items.map(i => i.name).sort(), ['dirt'])
})

test('an unreachable chest is reported, never thrown', async () => {
  const chest = { position: new Vec3(30, 64, 30) }
  const bot = makeMockBot({ chest, gotoFails: true, items: [item('cobblestone', 5)] })
  const res = await depositToChest(bot)
  assert.equal(res.deposited, 0)
  assert.match(res.reason, /unreachable/)
  assert.equal(bot._items.length, 1)
})

test('a chest that cannot be opened is reported, never thrown', async () => {
  const chest = { position: new Vec3(3, 64, 3) }
  const bot = makeMockBot({ chest, openFails: true, items: [item('cobblestone', 5)] })
  const res = await depositToChest(bot)
  assert.equal(res.deposited, 0)
  assert.match(res.reason, /cannot open/)
})
