// (v0.70.0) THE ZERO HOP NAMES ITS MECHANISM. run68 (the first 600s fleet,
// dispatch 35692049905): planned bank trips fired, bots REACHED chests (hops
// at d=8-24 opened windows with free slots) and the click loop still delivered
// ZERO - every run ended 'nothing to deposit' with the skip reasons swallowed,
// so a 5s deposit timeout (server lag) and the 26.2 ghost click (resolved,
// moved nothing) were indistinguishable. Two different cures. The reason now
// carries the counters - '(t=N,m0=M)' - while the chestDead regex still
// matches the prefix, so the fleet skip/exclude semantics are untouched.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Vec3 } from 'vec3'
import { depositToChest } from '../../src/lib/deposit.mjs'

const TYPES = new Map()
function item (name, count = 1) {
  if (!TYPES.has(name)) TYPES.set(name, TYPES.size + 1)
  return { name, count, type: TYPES.get(name) }
}

// A bot STANDING on the chest (dist 0 = the proximate fast path - no walking
// machinery needed) with an openChest returning the given window.
function makeAtChestBot ({ items, window }) {
  const bot = {
    username: 'SkipBot',
    entity: { position: new Vec3(0.5, 64, 0.5) },
    inventory: { items: () => bot._items },
    _items: items.slice(),
    findBlock: () => ({ name: 'chest', position: new Vec3(0, 64, 0) }),
    openChest: async () => window
  }
  return bot
}

test('a hanging deposit names itself: timeout counters ride the reason', async () => {
  const window = {
    items: () => [],
    deposit: () => new Promise(() => {}), // the 5s wall, never resolves
    close: () => {}
  }
  const bot = makeAtChestBot({ items: [item('dirt', 21), item('sand', 12)], window })
  const r = await depositToChest(bot, { depositClickTimeoutMs: 40 })
  assert.equal(r.deposited, 0)
  assert.equal(r.reason, 'nothing to deposit (t=2,m0=0)', 'two items, both timed out')
  assert.match(r.reason, /^nothing to deposit/, 'the chestDead regex prefix survives')
})

test('a ghost click names itself: moved0 counters ride the reason', async () => {
  const window = {
    items: () => [], // free slots - NOT the full-chest verdict
    deposit: async () => { /* resolved, nothing moved - the 26.2 ghost click */ },
    close: () => {}
  }
  const bot = makeAtChestBot({ items: [item('cobblestone', 116), item('dirt', 21)], window })
  const r = await depositToChest(bot, { depositClickTimeoutMs: 100 })
  assert.equal(r.deposited, 0)
  assert.equal(r.reason, 'nothing to deposit (t=0,m0=2)', 'two items, both resolved to moved=0')
})

test('a mixed zero (one timeout, one ghost) shows both counters', async () => {
  let calls = 0
  const window = {
    items: () => [],
    deposit: async () => { if (++calls === 1) return /* ghost */; await new Promise(() => {}) /* hang */ },
    close: () => {}
  }
  const bot = makeAtChestBot({ items: [item('dirt', 8), item('gravel', 5)], window })
  const r = await depositToChest(bot, { depositClickTimeoutMs: 40 })
  assert.equal(r.deposited, 0)
  assert.equal(r.reason, 'nothing to deposit (t=1,m0=1)')
})

test('a working chest still returns plain ok (no suffix noise)', async () => {
  const bot = makeAtChestBot({
    items: [item('dirt', 21)],
    window: {
      items: () => [],
      deposit: async (type, meta, count) => { bot._items = bot._items.filter(i => i.type !== type) },
      close: () => {}
    }
  })
  const r = await depositToChest(bot, { depositClickTimeoutMs: 100 })
  assert.equal(r.deposited, 21)
  assert.equal(r.reason, 'ok')
})

test('the chestDead skip semantics survive the suffixed reason', async () => {
  // the scan loop's dead-chest test, pinned against the NEW string shape
  const dead = /nothing to deposit|cannot open chest|chest unreachable|chest full/i
  assert.ok(dead.test('nothing to deposit (t=3,m0=1)'), 'timeout-dominated zero still excludes the chest')
  assert.ok(dead.test('nothing to deposit (t=0,m0=2)'), 'ghost-click zero still excludes the chest')
})
