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
import { test, beforeEach } from 'node:test'
import { resetDoomedGoalLedger } from '../../src/lib/jobqueue.mjs'
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

// The doomed-goal ledger (v0.72.0) is a module-level singleton in jobqueue.mjs
// (one process = one fleet). A dead verdict recorded by one test's walk must
// not refuse the next test's walks (the mocks reuse chest/furnace positions),
// so every test here starts from an empty ledger.
beforeEach(() => resetDoomedGoalLedger())

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
  // (v0.72.0) honest geometry: the exclusion retry walks a DIFFERENT chest's
  // goal cell, far outside the doomed-goal consult radius (2) - the old stub
  // collapsed both chests into one cell, which the fleet's spiral breaker now
  // (correctly) refuses at the funnel for 0 cost.
  const chestA = { name: 'chest', position: new Vec3(30, 64, 30) }
  const chestB = { name: 'chest', position: new Vec3(130, 64, 130) }
  const bot = makeMockBot({ items: [item('cobblestone', 40)], chest: chestA, gotoScript: [new Error('No path to the goal!')] })
  let scans = 0
  bot.findBlock = () => (scans++ === 0 ? chestA : chestB)
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

// ---------------------------------------------------------------- (v0.56.0) the approach segment
// MEASURED (dispatch 35639593200, F17): surfaced d=33..43 from the chest rows,
// 7x 'No path to the goal!' under the widened hop budget (radius 48), then the
// walk floor ate the chain - banked=0 fleet-wide with 1118 units in pockets.
// The cure walks ONE segment toward the chest on a finite chain budget before
// the direct ladder runs. These tests pin the wiring, not just the planner.

// a mock whose goto MOVES the bot to the goal (the pathfinder "walked" case)
// and whose raw-look snaps to the chest (the raw walk "landed" case)
function makeMovingBot ({ items = [], chest, snapOnLook = false } = {}) {
  const bot = {
    username: 'F17Bot',
    entity: { position: new Vec3(0.5, 64, 0.5) },
    inventory: { items: () => bot._items },
    _items: items.slice(),
    findBlock: () => chest,
    gotoCalls: [],
    rawWalkCalls: 0,
    pathfinder: {
      goto: async goal => {
        bot.gotoCalls.push(goal)
        bot.entity.position = new Vec3(goal.x, goal.y, goal.z)
      },
      stop: () => {}
    },
    look: async () => {
      if (snapOnLook) bot.entity.position = chest.position.clone()
    },
    setControlState: () => {},
    canSeeBlock: () => false,
    waitForTicks: async () => {},
    depositCalls: [],
    closed: false,
    openChest: async () => ({
      deposit: async (type, meta, count) => {
        bot.depositCalls.push({ type, count })
        bot._items = []
      },
      close: () => { bot.closed = true }
    })
  }
  return bot
}

test('approach: the F17 cure - a far chest on a finite chain budget banks via the segments', async () => {
  const chest = { name: 'chest', position: new Vec3(30, 64, 30) } // d ~= 41.7 > 24
  const bot = makeMovingBot({ items: [item('cobblestone', 40)], chest, snapOnLook: true })
  const res = await depositToChest(bot, { chestBlock: chest, budgetMs: 60000 })
  assert.equal(res.deposited, 40, 'the whole pocket banks - the doomed far hop never repeats')
})

test('approach: a raw-stalled segment still banks through the pathfinder segment', async () => {
  const chest = { name: 'chest', position: new Vec3(30, 64, 30) }
  const bot = makeMovingBot({ items: [item('cobblestone', 40)], chest, snapOnLook: false })
  // no snapOnLook: the raw walk cannot move the static mock position -> stalls
  // (~2s real) -> the pathfinder segment moves the bot -> the direct ladder
  // (raw hop first, d <= 40 now) finishes the approach.
  const res = await depositToChest(bot, { chestBlock: chest, budgetMs: 120000 })
  assert.equal(res.deposited, 40, 'the segment walk lands the bot inside the direct envelope')
})

test('approach: the legacy unbounded mid-run call keeps byte-identical behavior', async () => {
  const chest = { name: 'chest', position: new Vec3(30, 64, 30) }
  const bot = makeMockBot({ items: [item('cobblestone', 5)], chest })
  bot._gotoScript = [new Error('no path')]
  bot.findBlock = ({ matching, maxDistance }) => {
    if (!matching(chest)) return null
    const d = bot.entity.position.distanceTo(chest.position)
    return d <= maxDistance ? chest : null
  }
  const res = await depositToChest(bot) // budgetMs null = unbounded legacy
  assert.equal(res.deposited, 0)
  assert.match(res.reason, /no path/)
  assert.equal(bot.gotoCalls.length, 1, 'no approach segment on the legacy path - exactly the old single walk')
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

// ---------------------------------------------------------------- smeltClampSeconds (v0.39.0)
// MEASURED (dispatch 35576122228, the first fleet where the walk branch works):
// F9 arrived at the yard (8 blocks, 1s) and the chain STILL died 'budget
// exhausted' - the smelt clamp let the smelt eat the whole remainder, so the
// final deposit entered at remaining() <= 0 and refused without a click. The
// reserve keeps the deposit its slice; these tests pin the arithmetic.
import { smeltClampSeconds, FINAL_DEPOSIT_RESERVE_MS } from '../../src/lib/deposit.mjs'

test('smeltClampSeconds: junk and spent clocks never smelt', () => {
  assert.equal(smeltClampSeconds({ remainingMs: 0 }), 0)
  assert.equal(smeltClampSeconds({ remainingMs: -5 }), 0)
  assert.equal(smeltClampSeconds({ remainingMs: NaN }), 0)
  assert.equal(smeltClampSeconds({ remainingMs: 'junk' }), 0)
  assert.equal(smeltClampSeconds({}), 90, 'unbounded legacy clock: the smelt budget stands')
})

test('smeltClampSeconds: the reserve is untouchable by the smelt', () => {
  assert.equal(smeltClampSeconds({ remainingMs: FINAL_DEPOSIT_RESERVE_MS }), 0, 'exactly the reserve left: smelt skipped, deposit keeps it all')
  assert.equal(smeltClampSeconds({ remainingMs: FINAL_DEPOSIT_RESERVE_MS - 1 }), 0)
  assert.equal(smeltClampSeconds({ remainingMs: FINAL_DEPOSIT_RESERVE_MS + 999 }), 0, 'less than a full usable second: no smelt')
  assert.equal(smeltClampSeconds({ remainingMs: FINAL_DEPOSIT_RESERVE_MS + 1000 }), 1)
  assert.equal(smeltClampSeconds({ remainingMs: FINAL_DEPOSIT_RESERVE_MS + 31000 }), 31)
})

test('smeltClampSeconds: a big clock still caps at the smelt budget', () => {
  assert.equal(smeltClampSeconds({ remainingMs: 600000, budgetSecs: 90 }), 90)
  assert.equal(smeltClampSeconds({ remainingMs: 600000, budgetSecs: 45 }), 45)
})

test('smeltClampSeconds invariant: smelt + reserve never outruns the clock', () => {
  for (const remaining of [31000, 60000, 120000, 121000, 300000]) {
    const secs = smeltClampSeconds({ remainingMs: remaining })
    if (secs === 0) continue
    assert.ok(secs * 1000 + FINAL_DEPOSIT_RESERVE_MS <= remaining, `remaining=${remaining}`)
  }
})
