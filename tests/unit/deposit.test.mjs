// Chest deposits: bots bank their loot into the yard's chest rows and keep their kit.
// Driven with a mock bot/window - no server needed.
import { test, beforeEach } from 'node:test'
import { resetDoomedGoalLedger } from '../../src/lib/jobqueue.mjs'
import assert from 'node:assert/strict'
import { Vec3 } from 'vec3'
import { inventoryLoad, findChest, depositToChest, depositToChests, fuelTitheOverage, KEEP } from '../../src/lib/deposit.mjs'

// Unique stable numeric type per item name - the REAL code calls window.deposit(item.type),
// so a mock where every item shares type 1 would remove the WRONG item (that bug made
// these tests fail exactly when two item types were deposited in one run).
const TYPES = new Map()
function item (name, count = 1) {
  if (!TYPES.has(name)) TYPES.set(name, TYPES.size + 1)
  return { name, count, type: TYPES.get(name) }
}

function makeMockBot ({
  items = [],
  chest = null,
  gotoFails = false,
  openFails = false,
  fullFor = [], // item names the chest cannot accept
  silentFor = [] // item names where the deposit call resolves but moves nothing (26.2 ghost clicks)
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
          if (it && silentFor.includes(it.name)) return // resolved, nothing moved
          // (v0.100.0) count-aware: a partial deposit (the fuel tithe) takes
          // exactly `count` units from the FIRST matching stack - the real
          // window.deposit(type, meta, count) semantics
          const take = Number.isFinite(count) && count > 0 ? Math.min(count, it.count) : it.count
          bot.depositCalls.push({ name: it?.name, count: take })
          it.count -= take
          if (it.count <= 0) bot._items = bot._items.filter(i => i !== it)
        },
        close: () => { bot.closed = true }
      }
    }
  }
  return bot
}

// The doomed-goal ledger (v0.72.0) is a module-level singleton in jobqueue.mjs
// (one process = one fleet). A dead verdict recorded by one test's walk must
// not refuse the next test's walks (the mocks reuse chest/furnace positions),
// so every test here starts from an empty ledger.
beforeEach(() => resetDoomedGoalLedger())

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

// (v0.38.0) the swallow NAMES itself and retries once. Fleet 35569034780: F19
// stood 19 blocks from 50 verified chests and got null twice - the bare catch
// turned every findBlock throw into a quiet 'no chest in range' lie.
test('findChest: a swallowed scan names itself and retries once', () => {
  const bot = makeMockBot()
  const chest = { name: 'chest', position: new Vec3(1, 64, 1) }
  let calls = 0
  bot.findBlock = () => { if (++calls === 1) throw new Error('palette desync'); return chest }
  const lines = []
  assert.equal(findChest(bot, { log: m => lines.push(m) }), chest, 'the retry recovers the scan')
  assert.equal(calls, 2)
  assert.equal(lines.length, 1)
  assert.match(lines[0], /findChest swallowed: palette desync/)
  assert.match(lines[0], /attempt 1\/2/)
})

test('findChest: two throws stay null, both attempts named', () => {
  const bot = makeMockBot()
  let calls = 0
  bot.findBlock = () => { calls++; throw new Error('chunks unloaded') }
  const lines = []
  assert.equal(findChest(bot, { log: m => lines.push(m) }), null)
  assert.equal(calls, 2, 'exactly one retry - no throw storm')
  assert.equal(lines.length, 2)
  assert.match(lines[1], /attempt 2\/2/)
})

test('findChest: the swallow log carries the bot position', () => {
  const bot = makeMockBot()
  bot.findBlock = () => { throw new Error('boom') }
  const lines = []
  findChest(bot, { log: m => lines.push(m) })
  assert.match(lines[0], /at \[1,64,1\]/, 'mock bot stands at [1, 64, 1] (0.5 floored + round)')
})

test('an all-KEEP pocket is nothing to deposit, not a chest miss (v0.38.0)', async () => {
  const bot = makeMockBot({ items: [item('oak_planks', 32), item('stick', 10)] })
  let scans = 0
  const realScan = bot.findBlock
  bot.findBlock = (...a) => { scans++; return realScan(...a) }
  const res = await depositToChests(bot)
  assert.equal(res.deposited, 0)
  assert.deepEqual(res.chestReport, ['nothing to deposit'], 'the honest reason bankFallback can stay home on')
  assert.equal(scans, 0, 'no scan ran - the pocket truth precedes the world')
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

test('a ghost click (resolved call, nothing moved) is NOT counted as deposited', async () => {
  // the 26.2 stack sometimes resolves window.deposit while silently dropping the click -
  // counting the call instead of the inventory inflated the reports with phantom loot
  const chest = { position: new Vec3(3, 64, 3) }
  const bot = makeMockBot({
    chest,
    silentFor: ['cobblestone'],
    items: [item('cobblestone', 10), item('gravel', 4)]
  })
  const res = await depositToChest(bot)
  assert.equal(res.deposited, 4, 'only the gravel actually moved')
  assert.equal(bot._items.map(i => i.name).sort()[0], 'cobblestone', 'the ghosted stack stays with the bot')
})

// ------------------------------------------------------------------ v0.100.0
// THE FUEL TITHE - the count-bounded fuel keep. Run89 (35820546630, the fuel
// commons' first field test) measured the paradox: pockets 20-38 coal per bot,
// 'fuel commons: chest holds no fuel' x15, F3 'no fuel' - the NAME-based fuel
// keep (v0.92.0) pocket-locks every bot's whole coal pile while the commons'
// withdraw cap says 6 is the largest plan. The overage now banks.
test('the fuel tithe banks a keep-matched coal pile above the bound, keeping exactly 6', async () => {
  const chest = { position: new Vec3(3, 64, 3) }
  const bot = makeMockBot({ chest, items: [item('coal', 37), item('wooden_pickaxe', 1)] })
  const res = await depositToChest(bot, { keep: [...KEEP, 'coal'] }) // the smeltFuelKeep shape
  assert.equal(res.deposited, 31, '37 - 6 = 31 units banked')
  assert.deepEqual(bot.depositCalls, [{ name: 'coal', count: 31 }], 'one partial deposit of the overage')
  assert.deepEqual(bot._items.map(i => i.name).sort(), ['coal', 'wooden_pickaxe'], 'the reserve stays with the bot')
  assert.equal(bot._items.filter(i => i.name === 'coal')[0].count, 6)
})

test('the fuel tithe recomputes per stack: 20+18 deposits 32 and keeps 6', async () => {
  const chest = { position: new Vec3(3, 64, 3) }
  const bot = makeMockBot({ chest, items: [item('coal', 20), item('coal', 18), item('oak_planks', 8)] })
  const res = await depositToChest(bot, { keep: [...KEEP, 'coal'] })
  assert.equal(res.deposited, 32)
  assert.deepEqual(bot.depositCalls, [{ name: 'coal', count: 20 }, { name: 'coal', count: 12 }], '20 then the recomputed 12')
  const coal = bot._items.filter(i => i.name === 'coal').reduce((a, i) => a + i.count, 0)
  assert.equal(coal, 6, 'exactly the bound stays pocket-locked')
})

test('the fuel tithe never fires below the bound, on non-fuel keeps, or on coal_ore', async () => {
  const chest = { position: new Vec3(3, 64, 3) }
  // 4 coal: below the bound - the legacy absolute keep, nothing to deposit
  const bot1 = makeMockBot({ chest, items: [item('coal', 4)] })
  const res1 = await depositToChest(bot1, { keep: [...KEEP, 'coal'] })
  assert.equal(res1.deposited, 0)
  assert.deepEqual(bot1._items.map(i => i.name), ['coal'])
  // planks keep absolutely; coal_ore matches the 'coal' keep entry but is NOT tithe fuel
  const bot2 = makeMockBot({ chest, items: [item('oak_planks', 32), item('coal_ore', 12)] })
  const res2 = await depositToChest(bot2, { keep: [...KEEP, 'coal'] })
  assert.equal(res2.deposited, 0, 'non-fuel keeps and coal_ore stay absolute')
  assert.deepEqual(bot2._items.map(i => i.name).sort(), ['coal_ore', 'oak_planks'])
})

test('fuelTitheOverage is junk-safe and exact-name', () => {
  assert.equal(fuelTitheOverage({ name: 'coal', pocketCount: 38 }), 32)
  assert.equal(fuelTitheOverage({ name: 'charcoal', pocketCount: 9 }), 3)
  assert.equal(fuelTitheOverage({ name: 'coal', pocketCount: 6 }), 0, 'at the bound nothing moves')
  assert.equal(fuelTitheOverage({ name: 'coal', pocketCount: 2 }), 0)
  assert.equal(fuelTitheOverage({ name: 'coal', pocketCount: 'junk' }), 0)
  assert.equal(fuelTitheOverage({ name: null, pocketCount: 38 }), 0)
  assert.equal(fuelTitheOverage({ name: 'coal_ore', pocketCount: 38 }), 0, 'exact names only')
  assert.equal(fuelTitheOverage({ name: 'cobblestone', pocketCount: 64 }), 0)
})

// ------------------------------------------------------------------ v0.25.0
// Fleet 35538062596: F10 walked the whole way and died at 'cannot open chest
// (open chest: timeout after 10000ms)' while the server lagged 1.3s/event -
// ONE retry (re-look + re-open) is cheaper than a lost 60s walk.

test('a slow window open retries once and still banks', async () => {
  const chest = { name: 'chest', position: new Vec3(3, 64, 3) }
  const bot = makeMockBot({ chest, items: [item('cobblestone', 5)] })
  let attempts = 0
  const realOpen = bot.openChest
  bot.openChest = async (...args) => {
    attempts++
    if (attempts === 1) throw new Error('open chest: timeout after 10000ms')
    return realOpen(...args)
  }
  const res = await depositToChest(bot)
  assert.equal(attempts, 2, 'exactly one re-open attempt')
  assert.equal(res.deposited, 5, 'the retry delivers the loot')
})

test('both failed open attempts are still reported honestly', async () => {
  const chest = { position: new Vec3(3, 64, 3) }
  const bot = makeMockBot({ chest, openFails: true, items: [item('cobblestone', 5)] })
  const res = await depositToChest(bot)
  assert.equal(res.deposited, 0)
  assert.match(res.reason, /cannot open/)
})

test('a FULL chest is skipped for the next one (nothing-to-deposit hops too)', async () => {
  // fleet 35538062596 F18: the whole delivery died at 'bank: 0 (nothing to
  // deposit)' - every click rejected by a full chest - while chest #2 stood
  // empty beside it. A reached chest that moves NOTHING while bankable items
  // remain is dead for us: exclude it, scan again.
  const chests = [
    { name: 'chest', position: new Vec3(3, 64, 3) },
    { name: 'chest', position: new Vec3(6, 64, 6) }
  ]
  const bot = makeMockBot({ items: [item('cobblestone', 20)] })
  bot.findBlock = ({ matching }) => chests.find(c => { try { return matching(c) } catch { return false } })
  bot.openChest = async chest => {
    const idx = chests.indexOf(chest)
    return {
      // (fix) the real code calls window.deposit(type, null, count) - the mock
      // needs the same signature, a bare (type) left `count` undefined and the
      // ReferenceError swallowed every deposit (the hop was blameless)
      deposit: async (type, meta, count) => {
        const it = bot._items.find(i => i.type === type)
        if (idx === 0) throw new Error('chest full') // chest A rejects EVERYTHING
        bot.depositCalls.push({ name: it.name, count })
        bot._items = bot._items.filter(i => i.type !== type)
      },
      close: () => { bot.closed = true }
    }
  }
  const res = await depositToChests(bot, { maxChests: 3 })
  assert.equal(res.deposited, 20, 'chest B takes what chest A refused')
  assert.equal(res.chestsUsed, 1)
  assert.deepEqual(bot._items.map(i => i.name), [])
})

test('an unopenable chest is skipped for the next one', async () => {
  const chests = [
    { name: 'chest', position: new Vec3(3, 64, 3) },
    { name: 'chest', position: new Vec3(6, 64, 6) }
  ]
  const bot = makeMockBot({ items: [item('cobblestone', 20)] })
  bot.findBlock = ({ matching }) => chests.find(c => { try { return matching(c) } catch { return false } })
  bot.openChest = async chest => {
    if (chests.indexOf(chest) === 0) throw new Error('open chest: timeout after 10000ms')
    return {
      deposit: async (type, meta, count) => {
        const it = bot._items.find(i => i.type === type)
        bot.depositCalls.push({ name: it.name, count })
        bot._items = bot._items.filter(i => i.type !== type)
      },
      close: () => { bot.closed = true }
    }
  }
  const res = await depositToChests(bot, { maxChests: 3 })
  assert.equal(res.deposited, 20)
  assert.deepEqual(res.chestReport, ['cannot open chest (open chest: timeout after 10000ms)', 'ok'])
})

// (v0.39.1) THE SILENT HOP, named. Fleet 35576122228 F9: 139s between 'yard
// walk arrived in 1s' and 'bank: 0 (budget exhausted)' - up to maxChests walk
// failures printed NOTHING, so the log could not say what ate the window. A
// zero hop now logs WHICH chest refused and WHY before the exclusion retry.
test('a failed hop names its chest and reason before the exclusion retry', async () => {
  const chests = [
    { name: 'chest', position: new Vec3(6, 64, 3) }, // beyond PROXIMATE_OPEN_DIST: the walk branch runs
    { name: 'chest', position: new Vec3(6, 64, 6) }
  ]
  const bot = makeMockBot({ items: [item('cobblestone', 20)] })
  bot.findBlock = ({ matching }) => chests.find(c => { try { return matching(c) } catch { return false } })
  let gotoCalls = 0
  bot.pathfinder = { goto: async () => { if (++gotoCalls === 1) throw new Error('No path to the goal!') } }
  const lines = []
  const res = await depositToChests(bot, { maxChests: 3, log: m => lines.push(m) })
  assert.equal(res.deposited, 20, 'chest B takes what chest A refused to walk to')
  const hop = lines.find(l => l.includes('hop: chest at [6,64,3]'))
  assert.ok(hop, 'the failed hop names its chest coords')
  assert.match(hop, /chest unreachable \(No path to the goal!\)/, 'and its real reason')
})

test('depositToChests continues into the next chest while bankable items remain', async () => {
  // chest A accepts one deposit, then is full; chest B takes the rest
  const chests = [
    { position: new Vec3(3, 64, 3) },
    { position: new Vec3(6, 64, 6) }
  ]
  let call = 0
  const bot = makeMockBot({ items: [item('cobblestone', 20), item('gravel', 10)] })
  bot.findBlock = () => chests[Math.min(call++, chests.length - 1)]
  // first window: only accepts cobblestone, then reports full for everything else
  const windows = []
  bot.openChest = async () => {
    const idx = windows.length
    windows.push(true)
    return {
      deposit: async (type, meta, count) => {
        const it = bot._items.find(i => i.type === type)
        if (idx === 0 && it.name === 'gravel') throw new Error('chest A full for gravel')
        bot.depositCalls.push({ name: it.name, count })
        bot._items = bot._items.filter(i => i.type !== type)
      },
      close: () => { bot.closed = true }
    }
  }
  const res = await depositToChests(bot, { maxChests: 3 })
  assert.equal(res.deposited, 30, 'cobblestone went to chest A, gravel to chest B')
  assert.equal(res.chestsUsed, 2)
  assert.equal(bot._items.length, 0, 'everything bankable must be gone')
})

// ---------------------------------------------------------------- needsBanking (v0.12.0)
// The old mid-run gate `inventoryLoad().slots >= 30` NEVER fired in a real fleet:
// consolidation merges fragmented stacks, so 40-70 units sat in ~10-15 stacks -
// fleet 35485296464 ran 600s with banked=0 smelted=0. The gate now fires on EITHER
// slots >= BANK_SLOTS OR units >= BANK_UNITS.
import { needsBanking, BANK_SLOTS, BANK_UNITS } from '../../src/lib/deposit.mjs'

test('needsBanking: fires on raw unit mass even when stacks are few', () => {
  // 3 stacks of 64 = 192 units across only 3 slots - the old gate would sleep
  const bot = makeMockBot({ items: [item('cobblestone', 64), item('dirt', 64), item('gravel', 64)] })
  assert.equal(needsBanking(bot), true)
})

test('needsBanking: fires on slot fragmentation even when units are few', () => {
  // BANK_SLOTS distinct single-item stacks
  const names = Array.from({ length: BANK_SLOTS }, (_, i) => `junk_${i}`)
  const bot = makeMockBot({ items: names.map(n => item(n, 1)) })
  assert.equal(needsBanking(bot), true)
})

test('needsBanking: a light pocket stays underground (no wasted walk to the yard)', () => {
  const bot = makeMockBot({ items: [item('cobblestone', 64), item('stone_pickaxe', 1)] })
  assert.equal(needsBanking(bot), false)
})

test('needsBanking: the units threshold is exactly BANK_UNITS (boundary honest)', () => {
  const bot = makeMockBot({ items: [item('cobblestone', BANK_UNITS - 1)] })
  assert.equal(needsBanking(bot), false)
  bot._items = [item('cobblestone', BANK_UNITS)]
  assert.equal(needsBanking(bot), true)
})

test('needsBanking: an unreadable inventory must not throw the caller\'s loop', () => {
  const bot = { inventory: null }
  assert.equal(needsBanking(bot), false)
  assert.equal(needsBanking(undefined), false)
})
