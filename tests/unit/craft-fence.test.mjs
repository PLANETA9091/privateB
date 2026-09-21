// (v0.30.0) The craft/tool path fences: inventory clicks (putAway), equips, block
// placements and physics waits all talk to the SERVER, and on a stalled/dead socket
// those promises NEVER settle - that is how F13 hung inside sweepGridItems after
// 'error: write ECONNRESET' (the craft-catch recovery ran on the corpse of the
// connection) and how F8 hung in the placeTable pacing loop (fleet 35550036529).
// These tests pin the cure: every server-touching await in tools.mjs resolves or
// rejects inside a wall-clock fence, and a timed-out putAway stops burning retry
// attempts on a socket that will never land another click.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sweepGridItems, tickWait } from '../../src/bots/tools.mjs'

const TYPES = new Map()
function item (name, count = 1) {
  if (!TYPES.has(name)) TYPES.set(name, TYPES.size + 1)
  return { name, count, type: TYPES.get(name) }
}

test('sweepGridItems: healthy clicks sweep and VERIFY the slot emptied', async () => {
  const w = { type: 'minecraft:inventory', slots: new Map([[1, item('oak_planks', 2)]]) }
  const bot = {
    currentWindow: w,
    inventory: { items: () => [] },
    putAway: async slot => { w.slots.delete(slot) }
  }
  assert.equal(await sweepGridItems(bot), 1)
  assert.equal(w.slots.size, 0)
})

test('sweepGridItems: non-grid slots are left alone', async () => {
  const w = { type: 'minecraft:inventory', slots: new Map([[0, item('oak_planks', 2)], [5, item('stick', 4)]]) }
  let calls = 0
  const bot = {
    currentWindow: w,
    inventory: { items: () => [] },
    putAway: async () => { calls++ }
  }
  assert.equal(await sweepGridItems(bot), 0)
  assert.equal(calls, 0, 'slot 0 and slot 5 are outside the 1..4 grid of the inventory window')
})

test('sweepGridItems: silent window drops retry up to 3x then give up on the slot', async () => {
  const w = { type: 'minecraft:inventory', slots: new Map([[2, item('birch_planks', 4)]]) }
  let calls = 0
  const bot = {
    currentWindow: w,
    inventory: { items: () => [] },
    putAway: async () => { calls++ } // resolves but the stack drops the click: slot stays
  }
  assert.equal(await sweepGridItems(bot), 0)
  assert.equal(calls, 3)
})

test('sweepGridItems: a putAway that never settles (dead socket) cannot hang the sweep', async () => {
  const w = { type: 'minecraft:inventory', slots: new Map([[3, item('spruce_planks', 1)]]) }
  let calls = 0
  const bot = {
    currentWindow: w,
    inventory: { items: () => [] },
    putAway: () => { calls++; return new Promise(() => {}) } // F13: ECONNRESET corpse
  }
  const t0 = Date.now()
  const moved = await sweepGridItems(bot)
  const dt = Date.now() - t0
  assert.equal(moved, 0)
  assert.equal(calls, 1, 'the first fence timeout must stop the retry loop (no click can ever land)')
  assert.ok(dt >= 2900 && dt < 10000, `bounded by the 3000ms fence, took ${dt}ms`)
})

test('tickWait: a bot without waitForTicks has nothing to wait on (resolves at once)', async () => {
  const t0 = Date.now()
  await tickWait({}, 10)
  assert.ok(Date.now() - t0 < 500)
})

test('tickWait: physics that never tick (dead socket) reject inside the 3000ms fence', async () => {
  const bot = { waitForTicks: () => new Promise(() => {}) }
  const t0 = Date.now()
  await assert.rejects(tickWait(bot, 15, 'placeTable fall'), /timeout after 3000ms/)
  assert.ok(Date.now() - t0 < 8000, `bounded by the fence, took ${Date.now() - t0}ms`)
})
