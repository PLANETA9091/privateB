// (v0.72.0) THE SLOT-DIRECT DEPOSIT. The probe chain (jobs 106643098859 ->
// 106648926397 -> 106659161800 -> 106666756364 -> 106670204727) finally named
// the banked=0 wall of ~130 fleets: the raw window_items packet, the mapped
// window view and the server NBT all agreed per slot, the withdraw clicks
// moved items server-side - and Chest.deposit still misrouted its put (8 of
// 9 withdrawn dirt landed on window slot 27, the FIRST PLAYER slot, one past
// the single-chest range [0,27)). These pins hold the cure: our own click
// arithmetic against the measured view.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Vec3 } from 'vec3'
import { chestSlotCount, pickDirectSlots, depositStackDirect, depositToChest } from '../../src/lib/deposit.mjs'

const TYPES = new Map()
function item (name, count = 1) {
  if (!TYPES.has(name)) TYPES.set(name, TYPES.size + 1)
  return { name, count, type: TYPES.get(name), stackSize: 64 }
}

const CHEST_SLOTS = 27
const TOTAL = 63

// A window whose slots array IS the state (mineflayer prediction modeled
// directly). The pocket mirror (slots 27..62) feeds bot.inventory.items().
function makeWindow ({ chest = [], pocket = [] } = {}) {
  const slots = new Array(TOTAL).fill(null)
  chest.forEach((it, i) => { slots[i] = it })
  pocket.forEach((it, i) => { slots[CHEST_SLOTS + i] = it })
  return {
    type: 'minecraft:generic_9x3',
    slots,
    items: () => slots.slice(0, CHEST_SLOTS).filter(s => s && s.count > 0)
  }
}

function makeBot ({ window, depositImpl = null } = {}) {
  const bot = {
    username: 'DirectBot',
    entity: { position: new Vec3(0.5, 64, 0.5) },
    inventory: { items: () => bot._pocket },
    _pocket: [],
    _cursor: null,
    clicks: [],
    findBlock: () => ({ name: 'chest', position: new Vec3(0, 64, 0) }),
    openChest: async () => window,
    // mineflayer prediction: left-click moves between the view and the cursor
    clickWindow: async (idx) => {
      bot.clicks.push(idx)
      const cur = bot._cursor
      const target = window.slots[idx]
      if (!cur) {
        if (!target) return
        bot._cursor = target
        window.slots[idx] = null
      } else {
        if (target && target.name === cur.name && target.count < (target.stackSize ?? 64)) {
          target.count += cur.count
        } else {
          window.slots[idx] = cur
        }
        bot._cursor = null
      }
      bot._pocket = window.slots.slice(CHEST_SLOTS).filter(s => s && s.count > 0)
    }
  }
  if (depositImpl) window.deposit = depositImpl
  bot._pocket = window.slots.slice(CHEST_SLOTS).filter(s => s && s.count > 0)
  return bot
}

test('chestSlotCount derives the chest range from the view, junk-safe', () => {
  assert.equal(chestSlotCount(makeWindow()), 27, 'generic_9x3: 63 - 36 = 27')
  assert.equal(chestSlotCount({ slots: () => makeWindow().slots }), 27, 'function-shaped views read too')
  assert.equal(chestSlotCount({ slots: new Array(46).fill(null) }), 0, 'a player-only view has no chest range')
  assert.equal(chestSlotCount({}), 0)
  assert.equal(chestSlotCount(null), 0)
})

test('pickDirectSlots: source from the pocket range only, dest in the chest range', () => {
  const cobble = item('cobblestone', 40)
  const dirt = item('dirt', 8)
  const w = makeWindow({ chest: [item('dirt', 64)], pocket: [dirt, cobble] })
  const pair = pickDirectSlots({ window: w, itemType: dirt.type, chestSlots: 27 })
  assert.equal(pair.srcIdx, 27, 'the first pocket stack of the type (slot 27), never the chest stack at 0')
  assert.equal(pair.dstIdx, 1, 'slot 0 is a FULL same-type stack - skipped; slot 1 (empty) accepts')
})

test('pickDirectSlots: a matching stack with room wins over nothing else, junk-safe', () => {
  const cobble = item('cobblestone', 40)
  const w = makeWindow({ chest: [null, item('cobblestone', 20)], pocket: [cobble] })
  const pair = pickDirectSlots({ window: w, itemType: cobble.type, chestSlots: 27 })
  assert.equal(pair.srcIdx, 27)
  assert.equal(pair.dstIdx, 0, 'the empty slot 0 comes first in index order')
  assert.equal(pickDirectSlots({ window: w, itemType: 999, chestSlots: 27 }), null, 'no such pocket stack')
  const full = makeWindow({ chest: [item('dirt', 64), item('stone', 64)], pocket: [item('dirt', 8)] })
  assert.equal(pickDirectSlots({ window: full, itemType: full.slots[27].type, chestSlots: 27 }), null, 'no accepting chest slot')
  assert.equal(pickDirectSlots({ window: null, itemType: 1, chestSlots: 27 }), null)
  assert.equal(pickDirectSlots({ window: w, itemType: null, chestSlots: 27 }), null)
})

test('depositStackDirect clicks source then dest, the prediction moves the stack', async () => {
  const dirt = item('dirt', 9)
  const w = makeWindow({ chest: [item('dirt', 24)], pocket: [dirt] })
  const bot = makeBot({ window: w })
  const pair = await depositStackDirect(bot, w, { itemType: dirt.type, chestSlots: 27 })
  assert.deepEqual(pair, { srcIdx: 27, dstIdx: 1 })
  assert.deepEqual(bot.clicks, [27, 1], 'pick up, then put down')
  assert.equal(w.slots[1].count, 33, 'the stack merged into the chest view')
  assert.equal(w.slots[27], null, 'the pocket slot emptied')
  assert.equal(bot._pocket.reduce((a, i) => a + i.count, 0), 0, 'the pocket is empty in the bot view')
})

test('depositStackDirect: a failing dest click returns the cursor home and rethrows', async () => {
  const dirt = item('dirt', 9)
  const w = makeWindow({ chest: [], pocket: [dirt] })
  const bot = makeBot({ window: w })
  const orig = bot.clickWindow
  bot.clickWindow = async (idx) => {
    if (idx === 0) throw new Error('chest slot refused')
    return orig(idx)
  }
  await assert.rejects(depositStackDirect(bot, w, { itemType: dirt.type, chestSlots: 27 }), /refused/)
  assert.deepEqual(bot.clicks, [27, 0, 27], 'pick up, refused put, return home')
  assert.equal(bot._pocket.reduce((a, i) => a + i.count, 0), 9, 'the stack is back in the pocket')
})

test('THE FLEET CURE: a misrouting Chest.deposit cannot starve the bank anymore', async () => {
  // the measured bug shape: Chest.deposit lands the stack on window slot 27
  // (the first PLAYER slot) - from the pocket's perspective a NO-OP, so the
  // verified diff read moved=0 across ~130 fleets. The direct pathway runs
  // first and delivers; the legacy never gets the stack.
  const cobble = item('cobblestone', 40)
  const w = makeWindow({ chest: [], pocket: [cobble] })
  w.deposit = async (type) => {
    const misroute = w.slots.find((s, i) => i >= CHEST_SLOTS && s && s.type === type)
    if (misroute) { misroute.count += 0 } // the put went into the player range: a no-op
    return // resolved, moved nothing
  }
  const bot = makeBot({ window: w })
  const r = await depositToChest(bot, { chestBlock: bot.findBlock(), depositClickTimeoutMs: 200 })
  assert.equal(r.deposited, 40, 'the direct pathway delivered the whole stack')
  assert.equal(r.reason, 'ok')
  assert.equal(w.slots[0] && w.slots[0].count, 40, 'the stack sits in CHEST slot 0, not slot 27')
})

test('a bot without clickWindow keeps the legacy pathway semantics', async () => {
  const cobble = item('cobblestone', 40)
  const w = makeWindow({ chest: [item('dirt', 64)], pocket: [cobble] })
  w.deposit = async () => { /* resolved, moved nothing - the misroute shape */ }
  const bot = makeBot({ window: w })
  delete bot.clickWindow
  const r = await depositToChest(bot, { chestBlock: bot.findBlock(), depositClickTimeoutMs: 200 })
  assert.equal(r.deposited, 0)
  assert.equal(r.reason, 'nothing to deposit (t=0,m0=1)', 'the legacy ghost click keeps its counters')
})
