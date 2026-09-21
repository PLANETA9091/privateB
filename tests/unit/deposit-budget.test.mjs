// (v0.27.0) The end-phase wall clock: the final bank chain's budget threaded
// down depositToChests -> depositToChest -> each walk attempt.
//
// MEASURED (dispatch 35544781892, 600s on 504f744): 16/17 final climbs failed,
// every bot entered smeltThenBank, and the deposit chain - 8 chest hops x walk
// retries x a 3x120s yard walk x 2 deposit passes, all individually budgeted
// but the CHAIN unbounded - churned silently for the whole 420s hard-kill
// margin. mined froze at 1258, zero 'final bank' lines, the full report never
// printed. These tests pin the cure: a finite budgetMs caps every hop, a walk
// that cannot fit its floor refuses with a named reason, junk = legacy
// unbounded behavior.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Vec3 } from 'vec3'
import { depositToChest, depositToChests, effectiveWalkBudget, CHEST_WALK_BASE_MS, BUDGET_WALK_FLOOR_MS } from '../../src/lib/deposit.mjs'
import { endBankBudgetMs, END_BANK_BUDGET_MS } from '../../src/lib/endphase.mjs'

const TYPES = new Map()
function item (name, count = 1) {
  if (!TYPES.has(name)) TYPES.set(name, TYPES.size + 1)
  return { name, count, type: TYPES.get(name) }
}

function makeMockBot ({ items = [], chest = null, gotoScript = [] } = {}) {
  const bot = {
    username: 'BudgetBot',
    entity: { position: new Vec3(0.5, 64, 0.5) },
    inventory: { items: () => bot._items },
    _items: items.slice(),
    findBlock: () => chest,
    gotoCalls: [],
    _gotoScript: gotoScript, // Error instances throw; 'ok' resolves; the LAST entry repeats
    pathfinder: {
      goto: async goal => {
        const step = bot.gotoCalls.length < bot._gotoScript.length
          ? bot._gotoScript[bot.gotoCalls.length]
          : bot._gotoScript[bot._gotoScript.length - 1]
        bot.gotoCalls.push(goal)
        if (step instanceof Error) throw step
      }
    },
    depositCalls: [],
    closed: false,
    openChest: async () => ({
      deposit: async (type, meta, count) => {
        const it = bot._items.find(i => i.type === type)
        bot.depositCalls.push({ name: it?.name, count })
        bot._items = bot._items.filter(i => i.type !== type)
      },
      close: () => { bot.closed = true }
    })
  }
  return bot
}

test('effectiveWalkBudget: pass-through when no deadline is in play', () => {
  assert.equal(effectiveWalkBudget({ distBudget: 60000, remainingMs: Infinity }), 60000)
  assert.equal(effectiveWalkBudget({ distBudget: CHEST_WALK_BASE_MS, remainingMs: 'junk' }), CHEST_WALK_BASE_MS, 'junk remaining = unbounded (legacy)')
  assert.equal(effectiveWalkBudget({}), CHEST_WALK_BASE_MS, 'bare call = the base budget')
})

test('effectiveWalkBudget: clamps into the remaining wall clock', () => {
  assert.equal(effectiveWalkBudget({ distBudget: 60000, remainingMs: 25000 }), 25000)
  assert.equal(effectiveWalkBudget({ distBudget: 10000, remainingMs: 25000 }), 10000, 'the smaller budget wins')
})

test('effectiveWalkBudget: below the floor = 0 (do not start a doomed walk)', () => {
  assert.equal(effectiveWalkBudget({ distBudget: 60000, remainingMs: BUDGET_WALK_FLOOR_MS - 1 }), 0)
  assert.equal(effectiveWalkBudget({ distBudget: 60000, remainingMs: 0 }), 0)
  assert.equal(effectiveWalkBudget({ distBudget: 60000, remainingMs: -5 }), 0)
  assert.equal(effectiveWalkBudget({ distBudget: 60000, remainingMs: BUDGET_WALK_FLOOR_MS }), BUDGET_WALK_FLOOR_MS, 'exactly the floor may walk')
})

test('effectiveWalkBudget: junk distBudget falls back to the base', () => {
  assert.equal(effectiveWalkBudget({ distBudget: NaN, remainingMs: Infinity }), CHEST_WALK_BASE_MS)
  assert.equal(effectiveWalkBudget({ distBudget: -1, remainingMs: 999999 }), CHEST_WALK_BASE_MS)
})

test('depositToChests: budgetMs = 0 refuses without a single walk', async () => {
  const chest = { name: 'chest', position: new Vec3(3, 64, 3) }
  const bot = makeMockBot({ items: [item('cobblestone', 40)], chest })
  const res = await depositToChests(bot, { budgetMs: 0 })
  assert.equal(res.deposited, 0)
  assert.deepEqual(res.chestReport, ['budget exhausted'])
  assert.equal(bot.gotoCalls.length, 0, 'no walk may start on a spent budget')
})

test('depositToChests: a tiny budget cannot start a walk (floor guard)', async () => {
  const chest = { name: 'chest', position: new Vec3(30, 64, 30) }
  const bot = makeMockBot({ items: [item('cobblestone', 40)], chest })
  const res = await depositToChests(bot, { budgetMs: 1 })
  assert.equal(res.deposited, 0)
  assert.equal(bot.gotoCalls.length, 0, 'a walk with < floor ms left must refuse, not time out')
  assert.ok(res.chestReport.some(r => /budget exhausted/i.test(r)), `the report must name the budget: ${res.chestReport}`)
})

test('depositToChests: a generous budget deposits exactly like the legacy path', async () => {
  const chest = { name: 'chest', position: new Vec3(3, 64, 3) }
  const bot = makeMockBot({ items: [item('cobblestone', 40), item('dirt', 10)], chest, gotoScript: ['ok'] })
  const res = await depositToChests(bot, { budgetMs: 60000 })
  assert.equal(res.deposited, 50, 'the whole pocket banks under a healthy budget')
  assert.equal(res.chestsUsed, 1)
  assert.equal(bot.closed, true, 'the window closes')
})

test('depositToChests: junk budgetMs (null/NaN) = unbounded legacy behavior', async () => {
  const chest = { name: 'chest', position: new Vec3(3, 64, 3) }
  for (const junk of [null, undefined, NaN, 'junk']) {
    const bot = makeMockBot({ items: [item('cobblestone', 40)], chest, gotoScript: ['ok'] })
    const res = await depositToChests(bot, { budgetMs: junk })
    assert.equal(res.deposited, 40, `junk budget (${String(junk)}) keeps the legacy unbounded path`)
  }
})

test('depositToChest: budgetMs = 0 refuses without walking', async () => {
  const chest = { name: 'chest', position: new Vec3(3, 64, 3) }
  const bot = makeMockBot({ items: [item('cobblestone', 40)], chest })
  const res = await depositToChest(bot, { chestBlock: chest, budgetMs: 0 })
  assert.equal(res.deposited, 0)
  assert.match(res.reason, /budget exhausted/)
  assert.equal(bot.gotoCalls.length, 0)
})

test('depositToChest: the walk fits inside the remaining budget', async () => {
  const chest = { name: 'chest', position: new Vec3(3, 64, 3) }
  const bot = makeMockBot({ items: [item('cobblestone', 40)], chest, gotoScript: ['ok'] })
  const res = await depositToChest(bot, { chestBlock: chest, budgetMs: 60000 })
  assert.equal(res.deposited, 40, 'a healthy budget must not change the happy path')
})

test('depositToChest: the No-path hop inherits the same wall clock', async () => {
  const chest = { name: 'chest', position: new Vec3(30, 64, 30) }
  const bot = makeMockBot({ items: [item('cobblestone', 40)], chest, gotoScript: [new Error('No path to the goal!')] })
  // 6000ms: above the 5000ms floor (a smaller budget refuses BEFORE any walk -
  // that is the floor-guard test's job), below two full walks - the hop gets
  // the leftover, not a fresh budget.
  const t0 = Date.now()
  const res = await depositToChest(bot, { budgetMs: 6000 })
  assert.equal(res.deposited, 0)
  assert.ok(bot.gotoCalls.length >= 2, `the first walk AND the No-path hop walk (got ${bot.gotoCalls.length})`)
  assert.ok(Date.now() - t0 < 5000, 'the whole attempt stays inside the budget wall clock')
  assert.match(res.reason, /chest unreachable.*No path/i, `named reason: ${res.reason}`)
})

test('endBankBudgetMs: default, env parse, junk tolerance', () => {
  assert.equal(endBankBudgetMs(), END_BANK_BUDGET_MS)
  assert.equal(END_BANK_BUDGET_MS, 150000, 'the default: deadline 600s + stagger 120s + 150s < the 420s kill margin')
  assert.equal(endBankBudgetMs({ env: '200000' }), 200000, 'a valid env wins')
  assert.equal(endBankBudgetMs({ env: 'junk' }), END_BANK_BUDGET_MS)
  assert.equal(endBankBudgetMs({ env: '0' }), END_BANK_BUDGET_MS, '0 reads as unset - a finite <= 0 budget would kill every final bank')
  assert.equal(endBankBudgetMs({ env: '-50' }), END_BANK_BUDGET_MS)
  assert.equal(endBankBudgetMs({ env: '' }), END_BANK_BUDGET_MS)
  assert.equal(endBankBudgetMs({ env: undefined }), END_BANK_BUDGET_MS)
  assert.equal(endBankBudgetMs({ env: '90000', def: 120000 }), 90000, 'a valid env wins over a custom def (the mid-run bank clock)')
  assert.equal(endBankBudgetMs({ env: 'junk', def: 120000 }), 120000, 'junk falls to the custom def, not the final-bank default')
})
