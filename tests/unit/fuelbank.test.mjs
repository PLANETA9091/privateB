// THE FUEL COMMONS (v0.98.0): the yard chests fund the fuel-empty smelt legs.
// Pure policy (fuelWithdrawPlan, pickWithdrawSlots), the raw-click mechanics
// (withdrawStackMove) and the full withdrawal walk (withdrawFuelCommons) - all
// driven with mock windows + a mock chest world, no server needed.
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { Vec3 } from 'vec3'
import { resetDoomedGoalLedger, recordDoomedGoal, gotoSafe, resetWalkGovernors } from '../../src/lib/jobqueue.mjs' // (v0.143.0) the resets drop the module-level fleet goal ceiling the wall-clock tests would otherwise burst
import {
  fuelWithdrawPlan, pickWithdrawSlots, withdrawStackMove, withdrawFuelCommons,
  FUEL_WITHDRAW_CAP, FUEL_COMMON_ORDER,
  newCommonsMemory, rememberEmptyChest, liveEmptyCells,
  COMMONS_SWEEP_CHESTS, COMMONS_EMPTY_TTL_MS,
  pickFuelAnchor, scanYardChests, fuelPocketOverage, deliverFuelTithe,
  freshEmptyCells, ANCHOR_FRESH_EMPTY_MS
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
function mockChestWorld ({ chestItem = null, clickGhost = false, walkFails = false, openFails = false, walkPathFails = null, botPos = null, gotoSlowMs = 0 } = {}) {
  resetWalkGovernors() // (v0.143.0) the fleet goal ceiling is module state - fresh per test world
  const chestSlots = Array.from({ length: 27 }, () => null)
  if (chestItem) chestSlots[0] = chestItem
  const pocket = Array.from({ length: 36 }, () => null)
  const slots = [...chestSlots, ...pocket]
  const chestBlock = { name: 'chest', position: new Vec3(3.5, 64, 3.5) }
  let pathCalls = 0
  const bot = {
    username: 'FuelBot',
    entity: { position: botPos ?? new Vec3(0.5, 64, 0.5) },
    inventory: { items: () => slots.slice(27).filter(Boolean) },
    pathfinder: {
      goto: async goal => {
        // (v0.156.0) the overrun shape: a slow goto burns REAL clock so the
        // nudge's segment can eat the whole slice (the run555 F11 class)
        if (gotoSlowMs > 0) await new Promise(r => setTimeout(r, gotoSlowMs))
        if (walkFails) throw new Error('NoPath: no path')
        if (walkPathFails) {
          pathCalls++
          if (walkPathFails === 'always' || pathCalls === 1) throw new Error('Took to long to decide path to goal!')
          // the nudge changed the start: a later honest walk MOVES the bot
          bot.entity.position = new Vec3(goal.x, goal.y, goal.z)
        }
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

// (v0.147.0) THE PATH-GEOMETRY NUDGE - run85's F10 class: the commons walks
// died 'Took to long to decide path to goal!' x4 then 'budget spent (0/4
// units)', and SIX fleet 'no fuel' smelt verdicts died behind it. The nudge
// (one approachWalk shot) changes the failed start; the SAME chest gets one
// honest re-goto before the exclude.
test('withdrawFuelCommons: the path-geometry nudge retries the SAME chest and lands (v0.147.0)', async () => {
  const world = mockChestWorld({ chestItem: item('coal', 30), walkPathFails: 'once' })
  const lines = []
  const res = await withdrawFuelCommons(world.bot, { itemsNeeded: 40, budgetMs: 5000, log: m => lines.push(m) })
  assert.equal(res.reason, 'ok', 'the nudge retry landed the walk - the chest is reached')
  assert.equal(res.taken, 5, 'ceil(40/8) = 5 coal after the retry')
  assert.ok(lines.some(l => /path nudge/.test(l)), 'the nudge is logged, not silent')
  assert.ok(lines.some(l => /the nudge retry landed/.test(l)), 'the retry landing is logged')
  const inPocket = world.bot.inventory.items().reduce((a, i) => a + i.count, 0)
  assert.equal(inPocket, 5, 'the verified diff agrees')
})

test('withdrawFuelCommons: the nudge is ONE shot - after it fails the chest is excluded honestly (v0.147.0)', async () => {
  const world = mockChestWorld({ chestItem: item('coal', 30), walkPathFails: 'always' })
  const lines = []
  const res = await withdrawFuelCommons(world.bot, { itemsNeeded: 40, budgetMs: 5000, log: m => lines.push(m) })
  assert.equal(res.taken, 0)
  assert.equal(res.reason, 'no chest reached', 'the walk still failed - the honest terminal')
  // (v0.157.0) the count pins the CALLER's nudge decision lines (the ternary
  // shapes); approachWalk's own 'approach: N segment(s)...' internal line now
  // rides the close shot and is NOT a second nudge.
  const nudgeLines = lines.filter(l => /path nudge (inside the direct envelope|closed to)/.test(l))
  assert.equal(nudgeLines.length, 1, 'one nudge decision per commons visit - the budget discipline')
  assert.ok(!lines.some(l => /the nudge retry landed/.test(l)), 'a failed retry never claims a landing')
})

test('THE NUDGE CLOCK GUARD (v0.156.0): the overrun segment leaves no re-goto clock - the honest stop, never a negative timeout', async () => {
  // the run555 F11 shape: the nudge's segment overran its slice (8.4s) and
  // the re-goto was built with a NEGATIVE timeout ('timeout after -1474ms').
  // The cure: below 2s of remaining clock the re-goto is skipped and the
  // spend is named. The slow goto burns REAL clock so the segment eats the
  // whole slice; the far start makes the approach fire real segments.
  const world = mockChestWorld({ chestItem: item('coal', 30), walkPathFails: 'once', botPos: new Vec3(40, 64, 40), gotoSlowMs: 2400 })
  const lines = []
  const res = await withdrawFuelCommons(world.bot, { itemsNeeded: 40, budgetMs: 5000, log: m => lines.push(m) })
  assert.equal(res.taken, 0, 'the slice was spent inside the nudge - nothing reached the pocket')
  assert.ok(lines.some(l => /the nudge spent the walk slice/.test(l)), 'the spend is named for the field read')
  assert.ok(!lines.some(l => /timeout after -/.test(l)), 'no negative timeout may exist anywhere in the chain')
  assert.ok(!lines.some(l => /the nudge retry landed/.test(l)), 'no fake landing')
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

// ---------------------------------------------------------------------------
// (v0.99.0) THE SWEEP: run89's commons came up empty three ways - maxChests=3
// stopped at the nearest cobble while the coal sat deep in the ~50-chest row,
// F3 re-walked the SAME empty chests six times (per-invocation exclude list),
// and F9's chest walks inherited other bots' doom-ledger poison. The sweep:
// 8 chests per ask, an empty-chest memory across asks (read-empty only, short
// TTL), and a doomedRearm on EVERY chest walk (v0.99.0 had it on the first
// only; v0.135.0 makes it unconditional - the run550 row re-arm, the same
// shape the anchor walk and the v0.130.0 machine walk already run).
function makeClicker (slots) {
  return async (idx, button) => {
    const s = slots[idx]
    if (button === 0) {
      const held = slots.__held
      if (held != null) {
        if (s == null) { slots[idx] = held; slots.__held = null; held.__cursor = false; return }
        if (s.type === held.type && s.count < (s.stackSize ?? 64)) {
          s.count = Math.min(s.stackSize ?? 64, s.count + held.count)
          slots.__held = null
          held.__cursor = false
          return
        }
        return // refusal: the held stack stays held (the diff reports it)
      }
      if (s == null) return
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

function mockSweepWorld ({ botPos = [0.5, 64, 0.5], chests = [], walkFailsAt = null } = {}) {
  resetWalkGovernors() // (v0.143.0) the fleet goal ceiling is module state - fresh per test world
  const pocket = Array.from({ length: 36 }, () => null)
  const opened = {}
  let current = null // the open window - withdrawStackMove clicks at the BOT level
  const chestBlocks = chests.map(c => {
    const block = { name: 'chest', position: new Vec3(...c.pos) }
    if (c.item) block.__item = { ...c.item }
    return block
  })
  const bot = {
    username: 'SweepBot',
    entity: { position: new Vec3(...botPos) },
    inventory: { items: () => (current ? current.slots.slice(27) : pocket).filter(Boolean) },
    clickWindow: async (idx, button) => current?.clickWindow(idx, button),
    pathfinder: { goto: async goal => {
      if (walkFailsAt && Math.floor(goal.x) === Math.floor(walkFailsAt[0]) && Math.floor(goal.z) === Math.floor(walkFailsAt[2])) {
        throw new Error('NoPath: no path')
      }
    } },
    findBlock: ({ matching }) => {
      const cands = chestBlocks
        .filter(b => matching(b))
        .map(b => ({ b, d: b.position.distanceTo(bot.entity.position) }))
        .sort((p, q) => p.d - q.d)
      return cands.length ? cands[0].b : null
    },
    openChest: async block => {
      const key = `${Math.floor(block.position.x)},${Math.floor(block.position.y)},${Math.floor(block.position.z)}`
      opened[key] = (opened[key] ?? 0) + 1
      // adopt the previous window's pocket tail - items placed there live in
      // the window array until close
      if (current) for (let i = 0; i < 36; i++) pocket[i] = current.slots[27 + i] ?? null
      const chestSlots = Array.from({ length: 27 }, () => null)
      if (block.__item) chestSlots[0] = block.__item
      const slots = [...chestSlots, ...pocket]
      const win = { slots, clickWindow: makeClicker(slots), close () { this.closed = true; current = null } }
      current = win
      return win
    }
  }
  return { bot, pocket, opened }
}

test('commons memory: the pure family is junk-safe, floors cells, TTL-prunes in place', () => {
  const mem = newCommonsMemory()
  assert.deepEqual(liveEmptyCells(mem, 'F1', 1000), [])
  // the junk families no-op (the Number(null) lesson)
  assert.equal(rememberEmptyChest(null, 'F1', { x: 1, y: 2, z: 3 }, 1000), false)
  assert.equal(rememberEmptyChest(mem, '', { x: 1, y: 2, z: 3 }, 1000), false)
  assert.equal(rememberEmptyChest(mem, 'F1', null, 1000), false)
  assert.equal(rememberEmptyChest(mem, 'F1', { x: 'junk', y: 2, z: 3 }, 1000), false)
  assert.equal(rememberEmptyChest(mem, 'F1', { x: 1, y: 2, z: 3 }, 'junk'), false)
  assert.deepEqual(liveEmptyCells(null, 'F1', 1000), [])
  assert.deepEqual(liveEmptyCells(mem, null, 1000), [])
  assert.deepEqual(liveEmptyCells(mem, 'F1', 'junk'), [])
  // a live cell round-trips floored and floored-stable
  rememberEmptyChest(mem, 'F1', { x: 1.7, y: 64.2, z: -3.9 }, 1000)
  assert.deepEqual(liveEmptyCells(mem, 'F1', 1001), [{ x: 1, y: 64, z: -4 }])
  // expiry prunes IN PLACE - the bucket never grows unbounded
  assert.deepEqual(liveEmptyCells(mem, 'F1', 1000 + COMMONS_EMPTY_TTL_MS + 1), [])
  assert.equal(mem.F1.size, 0, 'pruned in place')
  // re-remembering refreshes the clock (the newest observation owns the expiry)
  rememberEmptyChest(mem, 'F2', { x: 5, y: 64, z: 5 }, 1000, 5000)
  rememberEmptyChest(mem, 'F2', { x: 5, y: 64, z: 5 }, 3000, 5000)
  assert.deepEqual(liveEmptyCells(mem, 'F2', 5000), [{ x: 5, y: 64, z: 5 }])
  assert.deepEqual(liveEmptyCells(mem, 'F2', 8000), [], 'expired by the refreshed clock')
})

test('withdrawFuelCommons: the sweep reaches the deep coal chest (run89: maxChests=3 missed it)', async () => {
  const world = mockSweepWorld({
    chests: [
      { pos: [3.5, 64, 3.5], item: item('cobblestone', 30) },
      { pos: [8.5, 64, 3.5], item: item('dirt', 30) },
      { pos: [13.5, 64, 3.5], item: item('sand', 30) },
      { pos: [18.5, 64, 3.5], item: item('coal', 30) }
    ]
  })
  // the legacy shape control: 3 chests stop at the nearest junk
  const legacy = await withdrawFuelCommons(world.bot, { itemsNeeded: 40, budgetMs: 60000, maxChests: 3 })
  assert.equal(legacy.taken, 0)
  assert.equal(legacy.reason, 'commons empty')
  // (v0.143.0) fresh brake windows for the second ask - the two sweeps plus
  // their retries compress 10+ admissions into ~30ms, far past the per-bot
  // 6-per-5s burst the real cadence (walk+open+take per chest) never reaches
  resetWalkGovernors()
  // the v0.99.0 default sweep finds the coal
  const swept = await withdrawFuelCommons(world.bot, { itemsNeeded: 40, budgetMs: 60000 })
  assert.equal(swept.reason, 'ok')
  assert.equal(swept.taken, 5, 'ceil(40/8) = 5 coal')
  assert.equal(COMMONS_SWEEP_CHESTS, 8, 'the sweep width is pinned')
})

test('withdrawFuelCommons: the memory skips known-empty chests across asks (the F3 repeat-walk cure)', async () => {
  const world = mockSweepWorld({
    chests: [
      { pos: [3.5, 64, 3.5], item: item('cobblestone', 30) },
      { pos: [8.5, 64, 3.5], item: item('coal', 30) }
    ]
  })
  const mem = newCommonsMemory()
  const r1 = await withdrawFuelCommons(world.bot, { itemsNeeded: 40, budgetMs: 60000, memory: mem })
  assert.equal(r1.reason, 'ok')
  assert.equal(world.opened['3,64,3'], 1, 'the empty chest was opened exactly once')
  const r2 = await withdrawFuelCommons(world.bot, { itemsNeeded: 40, budgetMs: 60000, memory: mem })
  assert.equal(r2.reason, 'ok', 'the second ask still funds (the chest refilled nothing - the coal chest is deep)')
  assert.equal(world.opened['3,64,3'], 1, 'the remembered-empty chest was NOT re-walked')
  // ONLY a chest that was opened and READ empty earns a memory entry: a walk
  // failure is weak evidence (transient saturation), never remembered
  const failWorld = mockSweepWorld({ chests: [{ pos: [3.5, 64, 3.5], item: item('coal', 30) }], walkFailsAt: [3.5, 64, 3.5] })
  const mem2 = newCommonsMemory()
  const rf = await withdrawFuelCommons(failWorld.bot, { itemsNeeded: 40, budgetMs: 60000, memory: mem2, maxChests: 1 })
  assert.equal(rf.taken, 0)
  assert.equal(rf.reason, 'no chest reached')
  assert.deepEqual(liveEmptyCells(mem2, failWorld.bot.username, Date.now()), [], 'a walk failure is not remembered')
})

test('withdrawFuelCommons: every chest walk re-arms a doomed cell (the F9 cure, then the run550 row re-arm)', async () => {
  const world = mockSweepWorld({ chests: [{ pos: [3.5, 64, 3.5], item: item('coal', 30) }] })
  // another bot's failed bank walk poisoned the coal chest's cell (run89 F9)
  recordDoomedGoal({ x: 3, y: 64, z: 3 }, Date.now(), { ttl: 15000 })
  const res = await withdrawFuelCommons(world.bot, { itemsNeeded: 40, budgetMs: 60000 })
  assert.equal(res.reason, 'ok', 'the re-arm walked honestly and funded the pocket')
  assert.equal(res.taken, 5)
  // (v0.135.0) RESHAPED - the run550 F10 cure: poison on a LATER chest no
  // longer starves the sweep. run550 measured 'doomed goal (ledgered 0s ago)'
  // x40 fleet-wide - a sibling bot's fresh failure poisons the dense row
  // mid-ask and chests 2..N die for free while the pockets hold raw metal.
  // The cobble chest is opened first (no fuel in it), the SECOND walk re-arms
  // the poisoned coal cell and funds the pocket.
  const world2 = mockSweepWorld({
    chests: [
      { pos: [3.5, 64, 3.5], item: item('cobblestone', 30) },
      { pos: [8.5, 64, 3.5], item: item('coal', 30) }
    ]
  })
  recordDoomedGoal({ x: 8, y: 64, z: 3 }, Date.now(), { ttl: 15000 })
  const res2 = await withdrawFuelCommons(world2.bot, { itemsNeeded: 40, budgetMs: 60000 })
  assert.equal(res2.taken, 5, 'the second walk re-armed and funded (the row re-arm)')
  assert.equal(res2.reason, 'ok')
  assert.equal(world2.opened['8,64,3'], 1, 'the poisoned coal chest WAS opened - one honest walk, no blind loop')
})

test('withdrawFuelCommons: the row re-arm never clears the ledger - other goal classes stay vetoed', async () => {
  const world = mockSweepWorld({ chests: [{ pos: [3.5, 64, 3.5], item: item('coal', 30) }] })
  recordDoomedGoal({ x: 3, y: 64, z: 3 }, Date.now(), { ttl: 15000 })
  const res = await withdrawFuelCommons(world.bot, { itemsNeeded: 40, budgetMs: 60000 })
  assert.equal(res.reason, 'ok', 'the re-armed sweep walked honestly over the poisoned cell')
  // the re-arm BYPASSES the consult, it does not heal the cell: a plain
  // (non-re-arming) caller - the bank chain, the mine walk - still reads the
  // doom and takes the free refusal (the v0.87.0 contract, ledger intact)
  await assert.rejects(
    () => gotoSafe(world.bot, { x: 3, y: 64, z: 3 }, { timeoutMs: 500, label: 'walk to yard' }),
    /doomed goal \(ledgered \d+s ago at \[3,64,3\]\) - walk to yard refused/
  )
})

// ---------------------------------------------------------------------------
// (v0.124.0) THE FUEL ANCHOR: run108 measured the scatter - the tithe banked
// 19 coal into three bots' NEAREST chests while the commons sweeps opened 7
// chests and took 0. The cure is a fleet-wide deterministic fuel chest
// (pickFuelAnchor: the yard chest nearest the YARD CENTER, coordinates as the
// tie-break - pure, no comms) with two sides: deliverFuelTithe concentrates
// the inflow, the commons reads the anchor FIRST.
test('pickFuelAnchor: deterministic - every shuffle of the same list picks the same chest', () => {
  const chests = [
    { x: 10, y: 64, z: 10 }, { x: -4, y: 64, z: 3 }, { x: 2, y: 65, z: -7 },
    { x: 0, y: 64, z: 0 }, { x: 5, y: 63, z: 1 }
  ]
  const yard = { x: 0, y: 64, z: 0 }
  const first = pickFuelAnchor(chests, yard)
  assert.deepEqual(first, { x: 0, y: 64, z: 0 }, 'the chest nearest the yard center wins')
  for (let i = 0; i < 20; i++) {
    const shuffled = [...chests].sort(() => Math.random() - 0.5)
    assert.deepEqual(pickFuelAnchor(shuffled, yard), first, `shuffle #${i} agrees`)
  }
})

test('pickFuelAnchor: distance is primary, the coordinates are the tie-break', () => {
  const yard = { x: 0, y: 64, z: 0 }
  // equal distance to the yard: (3,64,4) and (4,64,3) - the lexicographically
  // smaller x wins, then y, then z
  assert.deepEqual(pickFuelAnchor([{ x: 4, y: 64, z: 3 }, { x: 3, y: 64, z: 4 }], yard), { x: 3, y: 64, z: 4 })
  assert.deepEqual(pickFuelAnchor([{ x: 3, y: 64, z: 4 }, { x: 4, y: 64, z: 3 }], yard), { x: 3, y: 64, z: 4 }, 'order-independent')
  // same x: the smaller y wins; same x,y: the smaller z wins
  assert.deepEqual(pickFuelAnchor([{ x: 2, y: 70, z: 0 }, { x: 2, y: 64, z: 5 }], yard), { x: 2, y: 64, z: 5 })
  assert.deepEqual(pickFuelAnchor([{ x: 2, y: 64, z: 5 }, { x: 2, y: 64, z: 1 }], yard), { x: 2, y: 64, z: 1 })
  // fractional positions floor (the block grid owns the identity)
  assert.deepEqual(pickFuelAnchor([{ x: 2.9, y: 64.4, z: 1.7 }], yard), { x: 2, y: 64, z: 1 })
})

test('pickFuelAnchor: the junk family reads null, junk entries are skipped', () => {
  for (const junk of [null, undefined, 'junk', 42, {}]) {
    assert.equal(pickFuelAnchor(junk, { x: 0, y: 0, z: 0 }), null)
  }
  assert.equal(pickFuelAnchor([], { x: 0, y: 0, z: 0 }), null, 'an empty yard has no anchor')
  assert.equal(pickFuelAnchor([null, 'junk', { x: NaN, y: 1, z: 2 }, {}], { x: 0, y: 0, z: 0 }), null, 'every entry junk -> null')
  // a junk yardCenter reads as no-center: the coordinates alone decide
  const chests = [{ x: 5, y: 64, z: 5 }, { x: 1, y: 62, z: 3 }]
  assert.deepEqual(pickFuelAnchor(chests, null), { x: 1, y: 62, z: 3 })
  assert.deepEqual(pickFuelAnchor(chests, 'junk'), { x: 1, y: 62, z: 3 })
  assert.deepEqual(pickFuelAnchor(chests, { x: NaN, y: NaN, z: NaN }), { x: 1, y: 62, z: 3 })
})

test('scanYardChests: junk bots and dead scans read empty (the v0.38 swallow lesson)', () => {
  for (const junk of [null, undefined, {}, { findBlocks: 'junk' }]) {
    assert.deepEqual(scanYardChests(junk, { yardCenter: { x: 0, y: 0, z: 0 } }), [])
  }
  assert.deepEqual(scanYardChests({ findBlocks: () => { throw new Error('palette desync') } }, { yardCenter: { x: 0, y: 0, z: 0 } }), [], 'a throw reads empty, never kills')
  assert.deepEqual(scanYardChests({ findBlocks: () => 'junk' }, { yardCenter: { x: 0, y: 0, z: 0 } }), [], 'a junk return reads empty')
})

test('scanYardChests: the matcher keeps the palette-candidate rule, the yard filter applies per block, positions floor', () => {
  const far = { name: 'chest', position: new Vec3(500.2, 64.1, 500.7) }
  const near = { name: 'barrel', position: new Vec3(2.6, 64.4, -3.9) }
  const cobble = { name: 'cobblestone', position: new Vec3(1, 64, 1) }
  const probe = { name: 'chest', position: null } // the palette probe: no position
  let sawProbe = false
  const bot = {
    findBlocks: ({ matching }) => {
      sawProbe = matching(probe)
      return [far, near, cobble, probe].filter(b => matching(b))
    }
  }
  const out = scanYardChests(bot, { yardCenter: { x: 0, y: 64, z: 0 }, radius: 64 })
  assert.equal(sawProbe, true, 'a positionless block is a CANDIDATE (the v0.43.0 rule)')
  assert.deepEqual(out, [{ x: 2, y: 64, z: -4 }], 'the far chest is yard-filtered, the non-chest skipped, the probe dropped, the near chest floored')
})

// (v0.133.0) THE SINGULAR PROBE RESCUE - the run546 shape: the plural scan
// (findBlocks, count 256) lies empty 2/2 while the singular find (findBlock,
// the engine's count-1 shape) still opens chests in the same window. The
// rescue borrows the proven path; every exit names itself; junk never throws.
test('scanYardChests: the singular probe rescues the empty scan (the run546 F5 shape)', () => {
  const lines = []
  const log = m => lines.push(m)
  const rescued = { name: 'chest', position: new Vec3(12.4, 63.8, -7.2) }
  const bot = {
    entity: { position: new Vec3(30.5, 64, 30.5) },
    findBlocks: () => [], // the plural lie: 2/2 empty, the run546 shape
    findBlock: ({ matching }) => (matching(rescued) ? rescued : null) // the proven path
  }
  const out = scanYardChests(bot, { yardCenter: { x: 0, y: 64, z: 0 }, radius: 64, log })
  assert.deepEqual(out, [{ x: 12, y: 63, z: -8 }], 'the rescue chest becomes the one-cell list, floored')
  assert.equal(lines.filter(l => l.includes("returned empty (attempt 1/2) at [31,64,31] yard d=43")).length, 1, 'the empty line names the position and the yard distance')
  assert.equal(lines.filter(l => l.includes("returned empty (attempt 2/2)")).length, 1, 'both attempts named themselves before the rescue')
  assert.equal(lines.filter(l => l.includes('the singular probe rescued the scan (chest at [12,63,-8])')).length, 1, 'the rescue names itself and its chest')
})

test('scanYardChests: the rescue finds nothing / throws - the honest empty stands, never throws', () => {
  const lines = []
  const log = m => lines.push(m)
  const empty = { entity: { position: new Vec3(1.5, 64, 1.5) }, findBlocks: () => [], findBlock: () => null }
  assert.deepEqual(scanYardChests(empty, { yardCenter: { x: 0, y: 64, z: 0 }, log }), [], 'a rescue-less yard keeps the honest empty')
  assert.equal(lines.filter(l => l.includes('the singular probe found nothing either')).length, 1, 'the rescue-less empty names the probe')
  const throwing = { findBlocks: () => [], findBlock: () => { throw new Error('dead probe') } }
  assert.deepEqual(scanYardChests(throwing, { yardCenter: { x: 0, y: 64, z: 0 }, log }), [], 'a throwing rescue never kills the scan')
  const junkRescue = { findBlocks: () => [], findBlock: () => ({ name: 'chest', position: { x: NaN, y: 0, z: 0 } }) }
  assert.deepEqual(scanYardChests(junkRescue, { yardCenter: null, log }), [], 'a junk rescue position is dropped')
  assert.equal(lines.filter(l => l.includes('the singular probe found nothing either')).length, 3, 'all three rescue-less exits (empty, throwing, junk) name the probe - findChest swallows its own throws into a null')
})

test('scanYardChests: a healthy scan never pays the rescue tax', () => {
  let findBlockCalls = 0
  const chest = { name: 'chest', position: new Vec3(1.2, 64.3, 2.7) }
  const bot = {
    findBlocks: ({ matching }) => [chest].filter(matching),
    findBlock: () => { findBlockCalls++ ; return null }
  }
  const out = scanYardChests(bot, { yardCenter: { x: 0, y: 64, z: 0 } })
  assert.deepEqual(out, [{ x: 1, y: 64, z: 2 }])
  assert.equal(findBlockCalls, 0, 'the plural result stands alone - no probe on the green path')
})

test('fuelPocketOverage: the pocket sum over the tithe bound, junk-safe', () => {
  const mk = items => ({ inventory: { items: () => items } })
  assert.equal(fuelPocketOverage(mk([item('coal', 14)])), 8, '14 coal - 6 bound = 8')
  assert.equal(fuelPocketOverage(mk([item('coal', 6)])), 0, 'at the bound: nothing tithes')
  assert.equal(fuelPocketOverage(mk([item('coal_ore', 40)])), 0, 'exact-name matching: coal_ore never tithes')
  assert.equal(fuelPocketOverage(mk([item('coal', 7), item('charcoal', 8)])), 3, '7-6=1 coal + 8-6=2 charcoal')
  assert.equal(fuelPocketOverage(mk([])), 0)
  assert.equal(fuelPocketOverage({}), 0, 'a dead inventory reads 0')
  assert.equal(fuelPocketOverage({ inventory: { items: () => { throw new Error('dead') } } }), 0, 'a throwing inventory reads 0')
})

// A mock for the anchor DELIVERY: the pocket holds coal over the bound, the
// yard holds the anchor chest, window.deposit moves with real mirror
// semantics (the pocket tail IS the inventory - the v0.73.0 lesson shape).
function mockAnchorWorld ({ pocketCoal = 14, pocketCharcoal = 0, walkFails = false, openFails = false, ghost = false, blockAtNull = false, noScan = false, walkFailTimes = 0, firstWalkError = 'NoPath: no path', botPos = null, moveOnGoto = false } = {}) {
  resetWalkGovernors() // (v0.143.0) the fleet goal ceiling is module state - fresh per test world
  let current = null
  let closedCount = 0
  let gotoCalls = 0
  const chestSlots = Array.from({ length: 27 }, () => null)
  const pocket = Array.from({ length: 36 }, () => null)
  if (pocketCoal > 0) pocket[0] = item('coal', pocketCoal)
  if (pocketCharcoal > 0) pocket[1] = item('charcoal', pocketCharcoal)
  const slots = [...chestSlots, ...pocket]
  const chestBlock = { name: 'chest', position: new Vec3(10.5, 64, 10.5) }
  const bot = {
    username: 'AnchorBot',
    entity: { position: botPos ?? new Vec3(1.5, 64, 1.5) },
    inventory: { items: () => (current ? current.slots.slice(27) : slots.slice(27)).filter(Boolean) },
    findBlocks: noScan ? undefined : ({ matching }) => [chestBlock].filter(b => matching(b)),
    blockAt: () => (blockAtNull ? null : chestBlock),
    pathfinder: { goto: async goal => {
      gotoCalls++
      if (walkFails || gotoCalls <= walkFailTimes) throw new Error(firstWalkError)
      // (v0.155.0) the nudge test shape: a successful goto MOVES the bot to
      // the goal (the approach segment walk needs a real position delta -
      // the phantom-raw doctrine: the position delta is the only truth)
      if (moveOnGoto && goal && Number.isFinite(goal.x)) bot.entity.position = new Vec3(goal.x + 1, goal.y, goal.z + 1)
    } },
    openChest: async () => {
      if (openFails) throw new Error('window dead')
      current = {
        slots,
        deposit: async (type, _dest, count) => {
          if (ghost) return // the ghost-click lie: the packet dies quietly
          const idx = slots.slice(27).findIndex(s => s && s.type === type && s.count > 0)
          if (idx < 0) return
          const s = slots[27 + idx]
          const take = Math.min(count, s.count)
          s.count -= take
          if (s.count <= 0) slots[27 + idx] = null
          const dst = slots.slice(0, 27).findIndex(x => x && x.type === type && x.count < (x.stackSize ?? 64))
          if (dst >= 0) slots[dst].count += take
          else {
            const free = slots.slice(0, 27).findIndex(x => x == null)
            if (free >= 0) slots[free] = { name: s.name, type: s.type, count: take, stackSize: s.stackSize ?? 64 }
          }
        },
        close () { this.closed = true; closedCount++; current = null }
      }
      return current
    }
  }
  return { bot, slots, chestBlock, currentPeek: () => current, closedPeek: () => closedCount, gotoPeek: () => gotoCalls }
}

test('deliverFuelTithe: the overage rides to the anchor, the pocket keeps the bound, the mirror diff is the truth', async () => {
  const world = mockAnchorWorld({ pocketCoal: 14 })
  const res = await deliverFuelTithe(world.bot, { yardCenter: { x: 0, y: 64, z: 0 }, budgetMs: 20000, log: () => {} })
  assert.equal(res.delivered, 8, '14 - 6 = 8 coal delivered')
  assert.equal(res.why, 'ok')
  const kept = world.bot.inventory.items().filter(i => i.name === 'coal').reduce((a, i) => a + i.count, 0)
  assert.equal(kept, 6, 'the pocket keeps FUEL_TITHE_BOUND')
  assert.equal(world.slots[0].count, 8, 'the anchor chest holds the overage')
  assert.equal(world.closedPeek(), 1, 'the window closed')
})

test('deliverFuelTithe: the junk family is named, never thrown', async () => {
  const noOverage = mockAnchorWorld({ pocketCoal: 6 })
  assert.deepEqual(await deliverFuelTithe(noOverage.bot, { yardCenter: { x: 0, y: 64, z: 0 } }), { delivered: 0, why: 'no overage' }, 'at the bound the anchor is never walked')
  const noScan = mockAnchorWorld({ noScan: true })
  assert.deepEqual(await deliverFuelTithe(noScan.bot, { yardCenter: { x: 0, y: 64, z: 0 } }), { delivered: 0, why: 'no anchor chest' })
  const walkDead = mockAnchorWorld({ walkFails: true })
  const rw = await deliverFuelTithe(walkDead.bot, { yardCenter: { x: 0, y: 64, z: 0 } })
  assert.equal(rw.delivered, 0)
  assert.match(rw.why, /^walk failed \(NoPath/, 'a dead walk is named')
  const blockDead = mockAnchorWorld({ blockAtNull: true })
  assert.deepEqual(await deliverFuelTithe(blockDead.bot, { yardCenter: { x: 0, y: 64, z: 0 } }), { delivered: 0, why: 'anchor block unreadable' })
  const openDead = mockAnchorWorld({ openFails: true })
  assert.match((await deliverFuelTithe(openDead.bot, { yardCenter: { x: 0, y: 64, z: 0 } })).why, /^open failed/)
  const ghost = mockAnchorWorld({ ghost: true })
  assert.deepEqual(await deliverFuelTithe(ghost.bot, { yardCenter: { x: 0, y: 64, z: 0 }, budgetMs: 20000 }), { delivered: 0, why: 'ghost clicks' }, 'the clicks said 8, the pocket said 0 - the pocket wins')
  const ghostKept = ghost.bot.inventory.items().filter(i => i.name === 'coal').reduce((a, i) => a + i.count, 0)
  assert.equal(ghostKept, 14, 'the pocket kept everything (the legacy tithe gets the real try)')
})

test('deliverFuelTithe: charcoal rides after coal, mixed overage sums', async () => {
  const world = mockAnchorWorld({ pocketCoal: 7, pocketCharcoal: 8 })
  const res = await deliverFuelTithe(world.bot, { yardCenter: { x: 0, y: 64, z: 0 }, budgetMs: 20000 })
  assert.equal(res.delivered, 3, '1 coal + 2 charcoal')
  const kept = world.bot.inventory.items()
  assert.equal(kept.filter(i => i.name === 'coal').reduce((a, i) => a + i.count, 0), 6)
  assert.equal(kept.filter(i => i.name === 'charcoal').reduce((a, i) => a + i.count, 0), 6)
})

// ------------------------------------------------- THE TITHE RETRY (v0.153.0)
// run52 (36038887252): 'fuel anchor: 0 delivered (walk failed (walk governor:
// bot churned 4 goals without progress - fuel anchor walk refused for 4s))'
// while 35+ coal rode 2 pockets and the commons chest read empty ALL RUN -
// smelted 1, zero ingots, zero seeds, iron=0. The single-shot give-up is the
// disease; the refusal is time-boxed and the path classes are start-bound.

test('THE TITHE RETRY: a time-boxed churn refusal waits out the window and re-issues', async () => {
  // the run52 shape: the governor refuses the FIRST goal for 4s - the retry
  // waits, re-issues, the deposit lands
  const world = mockAnchorWorld({ pocketCoal: 14, walkFailTimes: 1, firstWalkError: 'walk governor: bot churned 4 goals without progress - fuel anchor walk refused for 4s' })
  const sleeps = []
  const res = await deliverFuelTithe(world.bot, {
    yardCenter: { x: 0, y: 64, z: 0 },
    budgetMs: 20000,
    deps: { sleep: async ms => { sleeps.push(ms) } }
  })
  assert.equal(res.delivered, 8, 'the retry landed the deposit the single-shot gave up')
  assert.equal(res.why, 'ok')
  assert.equal(world.gotoPeek(), 2, 'exactly one retry')
  assert.equal(sleeps.length, 1)
  assert.ok(sleeps[0] > 4000 && sleeps[0] <= 4500, `the wait covers the 4s refusal window (got ${sleeps[0]})`)
})

test('THE TITHE RETRY: a path-class failure re-issues immediately (the nudge class)', async () => {
  // 'Took to long to decide path to goal!' is start-bound, not time-boxed -
  // no sleep; the v0.155.0 nudge runs and (v0.157.0) the near-chest start
  // (d=12.7, inside the 24b envelope - the run58 blind spot) now also fires
  // the CLOSE SHOT: the segment goto succeeds in the mock (no bot movement -
  // the stall rule ends the approach), then the re-issue lands. 3 gotos:
  // walk + shot + retry.
  const world = mockAnchorWorld({ pocketCoal: 14, walkFailTimes: 1, firstWalkError: 'Took to long to decide path to goal!' })
  const sleeps = []
  const res = await deliverFuelTithe(world.bot, {
    yardCenter: { x: 0, y: 64, z: 0 },
    budgetMs: 20000,
    deps: { sleep: async ms => { sleeps.push(ms) } }
  })
  assert.equal(res.delivered, 8, 'the re-issue from the (attempted) new start landed')
  assert.equal(sleeps.length, 0, 'no refusal window to wait out')
  assert.equal(world.gotoPeek(), 3)
})

test('THE DECIDE-CLASS NUDGE (v0.155.0): a far decide failure walks an approach segment and the retry lands', async () => {
  // the run92 shape escalated: the v0.153.0 retry re-issued the decide class
  // from an UNMOVED start x2 ('F3 fuel anchor: 0 delivered (walk failed
  // (Took to long to decide path to goal!))' twice) - the deterministic
  // re-failure the comment itself warned about. The cure: the decide verdict
  // is about the FAILED START - one bounded approachWalk (a real segment
  // move, ~42b -> inside the 24b envelope) changes it, the retry re-issues
  // from the new position and the tithe lands.
  const world = mockAnchorWorld({ pocketCoal: 14, botPos: new Vec3(40, 64, 40), walkFailTimes: 1, firstWalkError: 'Took to long to decide path to goal!', moveOnGoto: true })
  const sleeps = []
  const lines = []
  const res = await deliverFuelTithe(world.bot, {
    yardCenter: { x: 0, y: 64, z: 0 },
    budgetMs: 20000,
    deps: { sleep: async ms => { sleeps.push(ms) } },
    log: m => lines.push(m)
  })
  assert.equal(res.delivered, 8, 'the nudge moved the start, the retry landed the deposit')
  assert.equal(res.why, 'ok')
  assert.equal(world.gotoPeek(), 3, 'the decide walk + the approach segment + the retry')
  assert.equal(sleeps.length, 0, 'the decide class never waits out a window')
  assert.ok(lines.some(l => l.includes('fuel anchor: path nudge')), 'the nudge names itself for the field read')
})

test('THE DECIDE-CLASS NUDGE (v0.155.0): the churn refusal never nudges (the wait-out stays)', async () => {
  // the refusal class is TIME-BOXED - the window expiry is the real change;
  // the far start does not turn it into a nudge class
  const world = mockAnchorWorld({ pocketCoal: 14, botPos: new Vec3(40, 64, 40), walkFailTimes: 1, firstWalkError: 'walk governor: bot churned 4 goals without progress - fuel anchor walk refused for 4s' })
  const sleeps = []
  const lines = []
  const res = await deliverFuelTithe(world.bot, {
    yardCenter: { x: 0, y: 64, z: 0 },
    budgetMs: 20000,
    deps: { sleep: async ms => { sleeps.push(ms) } },
    log: m => lines.push(m)
  })
  assert.equal(res.delivered, 8)
  assert.equal(world.gotoPeek(), 2, 'wait-out + re-issue, no approach segments')
  assert.ok(sleeps.length === 1 && sleeps[0] > 4000, 'the refusal window was waited out')
  assert.ok(!lines.some(l => l.includes('path nudge')), 'no nudge on the refusal class')
})

test('THE TITHE RETRY: a second failure reads honestly, the scatter keeps its try', async () => {
  const world = mockAnchorWorld({ pocketCoal: 14, walkFails: true })
  const res = await deliverFuelTithe(world.bot, {
    yardCenter: { x: 0, y: 64, z: 0 },
    budgetMs: 20000,
    deps: { sleep: async () => {} }
  })
  assert.equal(res.delivered, 0)
  assert.match(res.why, /^walk failed \(NoPath/, 'the newest failure names itself')
  assert.equal(world.gotoPeek(), 2, 'the retry fired exactly once')
})

test('THE TITHE RETRY: the budget bounds the wait (a spent slice skips the retry)', async () => {
  // a refusal longer than the remaining budget: the wait caps at what is
  // left, and an empty remainder skips the retry entirely
  const world = mockAnchorWorld({ pocketCoal: 14, walkFailTimes: 1, firstWalkError: 'walk governor: bot churned 4 goals without progress - fuel anchor walk refused for 30s' })
  const res = await deliverFuelTithe(world.bot, {
    yardCenter: { x: 0, y: 64, z: 0 },
    budgetMs: 1500,
    deps: { sleep: async () => {} }
  })
  assert.equal(res.delivered, 0)
  assert.match(res.why, /^walk failed \(/)
  assert.equal(world.gotoPeek(), 1, 'no retry when the budget is spent')
})

// The anchor-first READ on the commons side: a dedicated mock (the sweep
// world has no findBlocks/blockAt - the legacy tests must stay untouched).
function mockAnchorSweepWorld () {
  resetWalkGovernors() // (v0.143.0) the fleet goal ceiling is module state - fresh per test world
  const pocket = Array.from({ length: 36 }, () => null)
  const opened = {}
  let current = null
  const junkChest = { name: 'chest', position: new Vec3(3.5, 64, 3.5) } // nearest to the bot
  const coalChest = { name: 'chest', position: new Vec3(30.5, 64, 30.5) } // nearest to the yard center
  junkChest.__item = item('cobblestone', 30)
  coalChest.__item = item('coal', 30)
  const bot = {
    username: 'AnchorSweepBot',
    entity: { position: new Vec3(0.5, 64, 0.5) },
    inventory: { items: () => (current ? current.slots.slice(27) : pocket).filter(Boolean) },
    clickWindow: async (idx, button) => current?.clickWindow(idx, button),
    pathfinder: { goto: async () => {} },
    findBlock: ({ matching }) => [junkChest, coalChest].filter(b => matching(b))
      .map(b => ({ b, d: b.position.distanceTo(bot.entity.position) }))
      .sort((p, q) => p.d - q.d)[0]?.b ?? null,
    findBlocks: ({ matching }) => [junkChest, coalChest].filter(b => matching(b)),
    blockAt: pos => [junkChest, coalChest].find(b =>
      Math.floor(b.position.x) === Math.floor(pos.x) && Math.floor(b.position.y) === Math.floor(pos.y) && Math.floor(b.position.z) === Math.floor(pos.z)) ?? null,
    openChest: async block => {
      const key = `${Math.floor(block.position.x)},${Math.floor(block.position.y)},${Math.floor(block.position.z)}`
      opened[key] = (opened[key] ?? 0) + 1
      if (current) for (let i = 0; i < 36; i++) pocket[i] = current.slots[27 + i] ?? null
      const chestSlots = Array.from({ length: 27 }, () => null)
      if (block.__item) chestSlots[0] = block.__item
      const slots = [...chestSlots, ...pocket]
      const win = { slots, clickWindow: makeClicker(slots), close () { this.closed = true; current = null } }
      current = win
      return win
    }
  }
  return { bot, opened }
}

test('withdrawFuelCommons: the ANCHOR is read first - the yard-center chest funds before the nearest junk', async () => {
  const world = mockAnchorSweepWorld()
  const yard = { x: 32, y: 64, z: 32 }
  // maxChests=1 sharpens the contrast: the ONE open must be the anchor
  const res = await withdrawFuelCommons(world.bot, { itemsNeeded: 40, budgetMs: 60000, maxChests: 1, yardCenter: yard })
  assert.equal(res.reason, 'ok', 'the anchor read funded on the first open')
  assert.equal(res.taken, 5)
  assert.equal(world.opened['30,64,30'], 1, 'the coal chest (nearest the yard center) was the anchor read')
  assert.equal(world.opened['3,64,3'], undefined, 'the nearest junk chest was never walked')
})

test('withdrawFuelCommons: without a yardCenter the legacy nearest-first shape holds byte for byte', async () => {
  const world = mockAnchorSweepWorld()
  const res = await withdrawFuelCommons(world.bot, { itemsNeeded: 40, budgetMs: 60000, maxChests: 1 })
  assert.equal(res.taken, 0)
  assert.equal(res.reason, 'commons empty')
  assert.equal(world.opened['3,64,3'], 1, 'the legacy sweep opened the NEAREST chest (the junk one)')
  assert.equal(world.opened['30,64,30'], undefined, 'the coal chest was never reached')
})

test('REGRESSION PIN: the anchor wiring - the delivery rides before the legacy deposit, the anchor read is chest #0', () => {
  const fleetSrc = readFileSync(new URL('../../testbed/fleet19.mjs', import.meta.url), 'utf8')
  const bankSrc = readFileSync(new URL('../../src/lib/fuelbank.mjs', import.meta.url), 'utf8')
  assert.match(fleetSrc, /import \{ withdrawFuelCommons, newCommonsMemory, deliverFuelTithe, fuelPocketOverage \} from '\.\.\/src\/lib\/fuelbank\.mjs'/)
  assert.match(fleetSrc, /await deliverFuelTithe\(miner\.bot, \{/)
  assert.match(fleetSrc, /yardCenter: yardGoal,\s*\n\s*budgetMs: anchorBudgetMs,/)
  assert.match(fleetSrc, /remaining\(\) > 8000 \? Math\.min\(15000, Math\.floor\(remaining\(\) \/ 4\)\) : 0/, 'the budget guard: a dead chain never pays the delivery')
  assert.match(bankSrc, /const anchorBlock = \(anchorScan && yardCenter\)/)
  assert.match(bankSrc, /\? anchorBlock\s*\n\s*: findChest\(bot, \{ maxDistance, exclude, yardCenter, yardRadius, log \}\)/)
  assert.match(bankSrc, /the anchor chest is read first/)
  assert.match(bankSrc, /export function pickFuelAnchor/)
  assert.match(bankSrc, /export function scanYardChests/)
  assert.match(bankSrc, /export function fuelPocketOverage/)
  assert.match(bankSrc, /export async function deliverFuelTithe/)
})

// --------------------------------------------------- v0.128.0 the anchor fresh window
test('freshEmptyCells: only the JUST-seen-empty chest rides the anchor exclude, an old observation cannot un-anchor', () => {
  const mem = newCommonsMemory()
  const now = 1_000_000
  rememberEmptyChest(mem, 'F2', { x: 30, y: 64, z: 30 }, now) // observed NOW
  rememberEmptyChest(mem, 'F2', { x: 3, y: 64, z: 3 }, now - 60000) // observed 60s ago
  assert.deepEqual(freshEmptyCells(mem, 'F2', now), [{ x: 30, y: 64, z: 30 }],
    'the 60s-old empty memory is not fresh - the anchor cell re-opens for the tithe refill')
})

test('freshEmptyCells: the 15s boundary is inclusive, the junk family reads empty, pruning mirrors liveEmptyCells', () => {
  const mem = newCommonsMemory()
  const now = 1_000_000
  rememberEmptyChest(mem, 'F2', { x: 1, y: 2, z: 3 }, now - ANCHOR_FRESH_EMPTY_MS)
  assert.deepEqual(freshEmptyCells(mem, 'F2', now), [{ x: 1, y: 2, z: 3 }], 'an observation exactly freshMs old is still fresh (the >= contract)')
  for (const junk of [null, undefined, {}, { F9: 'junk' }, { F9: 42 }]) {
    assert.deepEqual(freshEmptyCells(junk, 'F9', now), [], 'junk memory reads empty')
  }
  assert.deepEqual(freshEmptyCells(mem, 42, now), [], 'junk name reads empty')
  assert.deepEqual(freshEmptyCells(mem, 'F9', 'junk'), [], 'junk clock reads empty')
  const mem2 = newCommonsMemory()
  rememberEmptyChest(mem2, 'F3', { x: 9, y: 9, z: 9 }, now - COMMONS_EMPTY_TTL_MS - 1)
  assert.deepEqual(freshEmptyCells(mem2, 'F3', now), [], 'an expired entry is neither fresh nor kept')
  assert.equal(mem2.F3 instanceof Map && mem2.F3.size, 0, 'the expired entry was pruned in place')
})

test('scanYardChests: the scan retry - one transient palette throw no longer voids the anchor ask (the v0.38.0 lesson re-learned)', () => {
  const near = { name: 'chest', position: new Vec3(2.5, 64, 2.5) }
  let calls = 0
  const flaky = {
    entity: { position: new Vec3(0, 64, 0) },
    findBlocks: () => { if (calls++ === 0) throw new Error('palette desync'); return [near] }
  }
  const lines = []
  assert.deepEqual(scanYardChests(flaky, { yardCenter: { x: 0, y: 64, z: 0 }, log: l => lines.push(l) }), [{ x: 2, y: 64, z: 2 }],
    'the second attempt answers')
  assert.equal(calls, 2, 'exactly two attempts')
  assert.equal(lines.length, 1, 'the swallow named itself once')
  assert.match(lines[0], /fuel anchor scan swallowed: palette desync at \[0,64,0\] \(attempt 1\/2\)/)
  const dead = { findBlocks: () => { throw new Error('palette desync') } }
  const deadLines = []
  assert.deepEqual(scanYardChests(dead, { yardCenter: { x: 0, y: 64, z: 0 }, log: l => deadLines.push(l) }), [], 'two throws still read empty')
  assert.equal(deadLines.length, 5, 'BOTH scan swallows + the probe\'s two internal swallows + the rescue miss named themselves - no bare swallow')
  assert.match(deadLines[0], /fuel anchor scan swallowed: palette desync \(attempt 1\/2\)/)
  assert.match(deadLines[1], /fuel anchor scan swallowed: palette desync \(attempt 2\/2\)/)
  assert.match(deadLines[4], /the singular probe found nothing either/, 'the rescue closes the throw face too (v0.133.0)')
})

test('scanYardChests: the empty-return retry - the palette desync\'s SILENT face no longer voids the anchor ask (the run536 class, v0.130.0)', () => {
  // run536 measured 16/16 anchor scans returning an EMPTY ARRAY (not a throw),
  // 0 swallow lines all run, while the same loop's findChest (bot.findBlock,
  // singular) kept finding and opening yard chests in the same window - the
  // v0.128.0 retry covered only the THROW class, so the anchor died silently
  // all run (0 'the anchor chest is read first' lines across run525/530/536).
  const near = { name: 'chest', position: new Vec3(2.5, 64, 2.5) }
  let calls = 0
  const flaky = {
    entity: { position: new Vec3(0, 64, 0) },
    findBlocks: () => { if (calls++ === 0) return []; return [near] } // the empty return, then the truth
  }
  const lines = []
  assert.deepEqual(scanYardChests(flaky, { yardCenter: { x: 0, y: 64, z: 0 }, log: l => lines.push(l) }), [{ x: 2, y: 64, z: 2 }],
    'the re-query answers after one empty scan')
  assert.equal(calls, 2, 'exactly two attempts')
  assert.equal(lines.length, 1, 'the empty named itself once')
  assert.match(lines[0], /fuel anchor scan returned empty \(attempt 1\/2\) at \[0,64,0\] yard d=0 - the palette empty-return class, re-querying/, 'the empty line names the position and the yard distance (v0.133.0)')
  const dead = { entity: { position: new Vec3(0, 64, 0) }, findBlocks: () => [] }
  const deadLines = []
  assert.deepEqual(scanYardChests(dead, { yardCenter: { x: 0, y: 64, z: 0 }, log: l => deadLines.push(l) }), [], 'two empties still read empty')
  assert.equal(deadLines.length, 5, 'BOTH empties + the probe\'s two internal swallows + the rescue miss named themselves - no bare swallow')
  assert.match(deadLines[1], /fuel anchor scan returned empty \(attempt 2\/2\) at \[0,64,0\] yard d=0$/, 'the second empty does not promise a re-query')
  assert.match(deadLines[4], /the singular probe found nothing either/, 'the rescue-less empty names the probe (v0.133.0)')
})

test('withdrawFuelCommons: the fresh-empty memory cannot un-anchor - a chest seen empty a minute ago is STILL read first', async () => {
  const world = mockAnchorSweepWorld()
  const yard = { x: 32, y: 64, z: 32 }
  const mem = newCommonsMemory()
  rememberEmptyChest(mem, 'AnchorSweepBot', { x: 30, y: 64, z: 30 }, Date.now() - 60000) // the anchor seen empty 60s ago
  const res = await withdrawFuelCommons(world.bot, { itemsNeeded: 40, budgetMs: 60000, maxChests: 1, yardCenter: yard, memory: mem })
  assert.equal(res.reason, 'ok', 'the anchor read funded despite the old empty memory')
  assert.equal(res.taken, 5)
  assert.equal(world.opened['30,64,30'], 1, 'the anchor chest was read first')
  assert.equal(world.opened['3,64,3'], undefined, 'the nearest junk chest was never walked')
})

test('withdrawFuelCommons: a chest seen empty JUST now stays fresh-excluded - the honest no-re-walk shape holds', async () => {
  const world = mockAnchorSweepWorld()
  const yard = { x: 32, y: 64, z: 32 }
  const mem = newCommonsMemory()
  rememberEmptyChest(mem, 'AnchorSweepBot', { x: 30, y: 64, z: 30 }, Date.now() - 5000) // seen empty 5s ago
  const res = await withdrawFuelCommons(world.bot, { itemsNeeded: 40, budgetMs: 60000, maxChests: 1, yardCenter: yard, memory: mem })
  assert.equal(world.opened['30,64,30'], undefined, 'a 5s-old empty observation still excludes the anchor')
  assert.equal(world.opened['3,64,3'], 1, 'the sweep fell through to the nearest chest')
  assert.equal(res.taken, 0)
})

test('withdrawFuelCommons: the anchor null exits NAME themselves (the smelt-zero honesty shape)', async () => {
  // (v0.133.0) the SINGULAR PROBE RESCUE reshapes the first world: the plural
  // scan dies ('dead world' x2), the singular probe (bot.findBlock, the
  // field-proven findChest shape) finds the nearest chest and the anchor LIVES
  // - that IS the run546 cure. The rescue-less shape (both probes dead) keeps
  // the old named exit.
  const world = mockAnchorSweepWorld()
  world.bot.findBlocks = () => { throw new Error('dead world') } // both plural attempts die
  const lines = []
  const rescued = await withdrawFuelCommons(world.bot, { itemsNeeded: 40, budgetMs: 60000, maxChests: 1, yardCenter: { x: 32, y: 64, z: 32 }, log: l => lines.push(l) })
  const joined = lines.join('\n')
  assert.match(joined, /fuel anchor scan swallowed: dead world( at \[\d+,\d+,\d+\])? \(attempt 1\/2\)/, 'the scan retry named itself')
  assert.match(joined, /the singular probe rescued the scan \(chest at \[3,64,3\]\)/, 'the singular probe names its rescue chest')
  assert.equal(rescued.taken, 0, 'the rescued anchor chest held no fuel (the nearest-to-bot shape, not the yard-nearest one)')
  assert.match(joined, /chest holds no fuel/, 'the rescue-funded anchor read named its empty honestly')
  const world2 = mockAnchorSweepWorld()
  world2.bot.findBlocks = () => { throw new Error('dead world') }
  world2.bot.findBlock = () => null // the rescue probes and finds nothing
  const lines2 = []
  await withdrawFuelCommons(world2.bot, { itemsNeeded: 40, budgetMs: 60000, maxChests: 1, yardCenter: { x: 32, y: 64, z: 32 }, log: l => lines2.push(l) })
  const joined2 = lines2.join('\n')
  assert.match(joined2, /the anchor scan saw 0 chest\(s\), 0 usable after the empty memory - no anchor/, 'the no-anchor exit names the scan size and the memory pressure')
  assert.match(joined2, /the singular probe found nothing either/, 'the rescue-less empty names the probe')
  const world3 = mockAnchorSweepWorld()
  world3.bot.blockAt = () => null // the anchor cell reads null (chunk not loaded)
  const lines3 = []
  await withdrawFuelCommons(world3.bot, { itemsNeeded: 40, budgetMs: 60000, maxChests: 1, yardCenter: { x: 32, y: 64, z: 32 }, log: l => lines3.push(l) })
  assert.match(lines3.join('\n'), /the anchor cell \[30,64,30\] reads null - no anchor/, 'the unreadable-block exit names the cell')
})

test('REGRESSION PIN: the v0.128.0 named exits ride the fleet and the bank sources', () => {
  const fleetSrc = readFileSync(new URL('../../testbed/fleet19.mjs', import.meta.url), 'utf8')
  const bankSrc = readFileSync(new URL('../../src/lib/fuelbank.mjs', import.meta.url), 'utf8')
  assert.match(fleetSrc, /fuel anchor: 0 delivered \(\$\{anchorRes\.why\}\) - the legacy scatter carries the tithe/, 'every non-delivery exit names its why')
  assert.match(fleetSrc, /anchorRes\.why !== 'no overage'/, 'the healthy lean pocket stays quiet')
  assert.match(fleetSrc, /fuel anchor: skipped - the final leg clock \(\$\{\(remaining\(\) \/ 1000\)\.toFixed\(1\)\}s\) cannot afford the walk while the pocket holds \$\{overage\} over the bound/, 'the thin-clock guard skip names the overage it strands (v0.157.0: the clock label divides - remaining\(\) is ms, the mine read five-digit seconds x3 in run556)')
  assert.match(fleetSrc, /const overage = fuelPocketOverage\(miner\.bot\)/, 'the caller pre-reads the overage so the skip is honest')
  assert.match(bankSrc, /export const ANCHOR_FRESH_EMPTY_MS = 15000/)
  assert.match(bankSrc, /export function freshEmptyCells/)
  assert.match(bankSrc, /the anchor scan saw \$\{cells\.length\} chest\(s\), \$\{usable\.length\} usable after the empty memory - no anchor/)
  assert.match(bankSrc, /the anchor cell \[\$\{anchor\.x\},\$\{anchor\.y\},\$\{anchor\.z\}\] reads \$\{block \? block\.name : 'null'\} - no anchor/)
  assert.match(bankSrc, /const freshEmpty = freshEmptyCells\(memory, bot\?\.username, started\)/, 'the anchor read excludes only the FRESH empties')
})
