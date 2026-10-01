// (v0.416.0) THE MID-VISIT GUARD - the summary-line mystery's mechanism cure.
//
// THE MYSTERY (open since face 22/24): the per-visit 'banked N items ... kept:'
// summary line proved INTERMITTENT (face 24: 0 of 10 deposits printed it; face
// 22: 11 of 25) while the IN-LOOP tithe/seal lines all landed - byte-identical
// code both trees, tee capturing all stdout. The mechanism, found by reading the
// emitter: the pocket read inside the visit fell back to bot.inventory.items()
// UNGUARDED, so a bot disconnected mid-respawn (the v0.157.0 respawn-window
// class) threw AFTER the tithe lines but BEFORE the summary - the visit's own
// finally closed the window and the throw escaped, killing the chain AND every
// counter with it (stats.banked never saw the units the visit had already moved
// server-side). Arm 1 guards the fallback read (honest zeros); arm 2 nets the
// chain's per-chest call (the death names itself through the 'hop:' family).
// These pins freeze both arms against the exact dying-inventory shapes.
import { test, beforeEach } from 'node:test'
import { resetDoomedGoalLedger } from '../../src/lib/jobqueue.mjs'
import assert from 'node:assert/strict'
import { Vec3 } from 'vec3'
import { depositToChest, depositToChests } from '../../src/lib/deposit.mjs'

const TYPES = new Map()
function item (name, count = 1) {
  if (!TYPES.has(name)) TYPES.set(name, TYPES.size + 1)
  return { name, count, type: TYPES.get(name) }
}

beforeEach(() => resetDoomedGoalLedger())

test('arm 1: the inventory dying ON the tithe click completes the visit - the summary line prints', async () => {
  const chest = { name: 'chest', position: new Vec3(2, 64, 2) }
  const bot = {
    username: 'MidVisitBot',
    entity: { position: new Vec3(0.5, 64, 0.5) },
    inventory: { items: () => bot._items },
    _items: [item('coal', 30), item('cobblestone', 5)],
    depositCalls: [],
    closed: 0,
    openChest: async () => ({
      items: () => [],
      deposit: async (type, meta, count) => {
        // THE RACE: the disconnect lands between the click's dispatch and the
        // verified diff read - the inventory object is gone mid-visit.
        if (!bot.died) { bot.died = true; delete bot.inventory }
        const it = bot._items.find(i => i.type === type)
        const take = Number.isFinite(count) && count > 0 ? Math.min(count, it.count) : it.count
        bot.depositCalls.push({ name: it?.name, count: take })
        it.count -= take
        if (it.count <= 0) bot._items = bot._items.filter(i => i.type !== type)
      },
      close: () => { bot.closed++ }
    })
  }
  const logLines = []
  const res = await depositToChest(bot, { chestBlock: chest, keep: ['coal'], log: m => logLines.push(m) })
  // hand-count: the tithe clicks min(30-6, 30)=24 units; the verified diff then
  // reads the UNREADABLE pocket - before 30, after honest-zero [] -> titheMoved
  // 30 (the pre-read's word, the documented one-stack upper bound). The visit
  // COMPLETES: the summary line prints, the reason is ok, the window closed.
  assert.strictEqual(res.deposited, 30)
  assert.strictEqual(res.reason, 'ok')
  assert.ok(logLines.some(l => /fuel tithe: banked 30 x coal/.test(l)), 'the in-loop tithe line landed (the mystery\'s surviving half)')
  assert.ok(logLines.some(l => /banked 30 items at .*kept:/.test(l)), 'THE MYSTERY\'S LINE: the per-visit summary now prints despite the mid-visit death')
  assert.strictEqual(bot.closed, 1, 'the window was closed cleanly by the visit\'s own finally')
})

test('arm 2: a THROWING inventory read cannot kill the chain - the death names itself through the hop lane', async () => {
  const chest = { name: 'chest', position: new Vec3(2, 64, 2) }
  let reads = 0
  const bot = {
    username: 'ChainNetBot',
    entity: { position: new Vec3(0.5, 64, 0.5) },
    // readable for the bankable gate + the loop head, THROWING once the visit
    // reads it - the shape arm 1's guard cannot absorb (items() throws, it does
    // not merely miss); the readable reads return the REAL array (an
    // undefined-returning mock would die in bankableItems' own catch instead)
    inventory: { items: () => { reads++; if (reads > 2) throw new Error('inventory torn down'); return bot._items } },
    // raw_iron: NOT in SEAL_PRIORITY (cobblestone is - the ring's fill family
    // keeps it all and the bankable gate would honestly refuse the visit)
    _items: [item('raw_iron', 5)],
    findBlock: () => chest,
    pathfinder: { goto: async () => {} },
    closed: 0,
    openChest: async () => ({ deposit: async () => {}, close: () => { bot.closed++ } })
  }
  const logLines = []
  const res = await depositToChests(bot, { keep: [], log: m => logLines.push(m) })
  // hand-count: bankable reads 1-2 ok (5u) -> the visit runs -> pocketItems()
  // throws (read 3) -> arm 2 nets it -> the hop line names the death -> tried
  // excludes the chest -> the loop head's bankable re-read throws (read 4) ->
  // the catch reads 0 -> the chain ends honestly. NO exception escapes.
  assert.strictEqual(res.deposited, 0)
  assert.ok(logLines.some(l => /hop: chest at \[2,64,2\] .*zero: visit died mid-visit \(inventory torn down\) - the chain excludes it/.test(l)), 'the chain net names the death through the hop lane (the filter-key\'s own family)')
  assert.ok(!logLines.some(l => /banked .* items/.test(l)), 'nothing banked - the visit died before any click')
})

test('arm 1, the pre-visit shape: a fully dead inventory reads bankable 0 - the chain refuses without a walk', async () => {
  const bot = {
    username: 'GhostBot',
    entity: { position: new Vec3(0.5, 64, 0.5) },
    inventory: undefined,
    findBlock: () => { throw new Error('the world was never consulted') },
    closed: 0,
    openChest: async () => { throw new Error('never opened') }
  }
  const res = await depositToChests(bot, { keep: [], log: () => {} })
  assert.strictEqual(res.deposited, 0)
  assert.strictEqual(res.chestsUsed, 0)
  assert.strictEqual(res.chestReport[0], 'nothing to deposit', 'the honest early return - no walk, no open, no throw')
})
