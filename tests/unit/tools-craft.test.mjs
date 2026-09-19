// Tests for the craft-window helpers in src/bots/tools.mjs.
// The 26.2 craft stack poisons its own 2x2/3x3 grid with ghost items; v0.6.8 made
// the sweep PROACTIVE (before every craft attempt) after the v0.6.7 CI run showed
// a table craft failing "missing ingredient" on attempt0 from plank ghosts.
// These tests pin the sweep/recover behavior with fake windows - no server needed.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sweepGridItems, recoverCraftWindow } from '../../src/bots/tools.mjs'

function fakeItem (name) { return { name, count: 1 } }

function fakeBotWithWindow ({ type = 'minecraft:inventory', slots = [], currentWindow = true } = {}) {
  const w = { type, slots }
  const putAwayCalls = []
  const bot = {
    putAway: async slot => { putAwayCalls.push(slot) },
    closeWindow: () => { bot.closed = (bot.closed || 0) + 1 }
  }
  if (currentWindow) bot.currentWindow = w
  else bot.inventory = null // nothing open at all
  return { bot, w, putAwayCalls }
}

test('sweepGridItems: moves ONLY grid slots (inventory window: 1..4) back into the inventory', async () => {
  const { bot, putAwayCalls } = fakeBotWithWindow({
    type: 'minecraft:inventory',
    slots: [fakeItem('result'), fakeItem('oak_planks'), null, fakeItem('oak_planks'), fakeItem('stick'), fakeItem('should_stay')]
  })
  const swept = await sweepGridItems(bot)
  // grid slots 1..4 swept (slot 2 is empty); slot 0 (result) and slot 5 (main inventory) untouched
  assert.equal(swept, 3)
  assert.deepEqual(putAwayCalls, [1, 3, 4])
})

test('sweepGridItems: table window sweeps slots 1..9', async () => {
  const { bot, putAwayCalls } = fakeBotWithWindow({
    type: 'minecraft:crafting',
    slots: new Array(12).fill(null).map((_, i) => (i >= 1 && i <= 9 ? fakeItem('oak_planks') : null))
  })
  const swept = await sweepGridItems(bot)
  assert.equal(swept, 9)
  assert.deepEqual(putAwayCalls, [1, 2, 3, 4, 5, 6, 7, 8, 9])
})

test('sweepGridItems: an empty grid is a no-op (safe before every craft attempt)', async () => {
  const { bot, putAwayCalls } = fakeBotWithWindow({ type: 'minecraft:inventory', slots: [] })
  const swept = await sweepGridItems(bot)
  assert.equal(swept, 0)
  assert.deepEqual(putAwayCalls, [])
})

test('sweepGridItems: putAway failures never throw - the stuck slot just stays', async () => {
  const { bot } = fakeBotWithWindow({
    type: 'minecraft:inventory',
    slots: [null, fakeItem('a'), fakeItem('b')]
  })
  bot.putAway = async slot => { if (slot === 1) throw new Error('stuck') }
  const swept = await sweepGridItems(bot)
  assert.equal(swept, 1) // slot 2 swept, slot 1 stayed
})

test('sweepGridItems: no window open at all returns 0', async () => {
  const { bot } = fakeBotWithWindow({ currentWindow: false })
  assert.equal(await sweepGridItems(bot), 0)
})

test('recoverCraftWindow: closes the current window once', () => {
  const { bot } = fakeBotWithWindow({ type: 'minecraft:crafting' })
  assert.equal(recoverCraftWindow(bot), true)
  assert.equal(bot.closed, 1)
})

test('recoverCraftWindow: falls back to bot.inventory when no window is open', () => {
  const bot = {
    currentWindow: null,
    inventory: { type: 'minecraft:inventory' },
    closeWindow: () => { bot.closed = (bot.closed || 0) + 1 }
  }
  assert.equal(recoverCraftWindow(bot), true)
  assert.equal(bot.closed, 1)
})

test('recoverCraftWindow: nothing open -> false, never throws', () => {
  const bot = { currentWindow: null, inventory: null }
  assert.equal(recoverCraftWindow(bot), false)
})
