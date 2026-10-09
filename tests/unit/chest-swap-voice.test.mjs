import fs from 'node:fs'
import { test, beforeEach } from 'node:test'
import { resetDoomedGoalLedger } from '../../src/lib/jobqueue.mjs'
import assert from 'node:assert/strict'
import { Vec3 } from 'vec3'
import { depositToChest } from '../../src/lib/deposit.mjs'

// ---- (v0.853.0) THE SWAP'S OWN VOICE - the v0.23.1 next-chest hop speaks ----
// The v0.23.1 resilience hop flew silent for 830 versions: a saved deposit
// printed as a NORMAL success, a doubled refusal printed only the FIRST
// chest's reason. The voice names the swap's cause leg once per firing; the
// outcome legs keep their bytes (the receipts / the primary-failure zero).
// The mocks ride the deposit-walk.test.mjs precedent (the faithful nearest-
// first findBlock + the position-keyed goto script).

const TYPES = new Map()
function item (name, count = 1) {
  if (!TYPES.has(name)) TYPES.set(name, TYPES.size + 1)
  return { name, count, type: TYPES.get(name) }
}

function makeMockBot ({ items = [], gotoScript = [] } = {}) {
  const bot = {
    username: 'SwapMock',
    entity: { position: new Vec3(0.5, 64, 0.5) },
    inventory: { items: () => bot._items },
    _items: items.slice(),
    gotoCalls: [],
    _gotoScript: gotoScript, // Error-instances throw, 'ok' walks; the LAST entry repeats
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
        if (!it) return
        const take = Number.isFinite(count) && count > 0 ? Math.min(count, it.count) : it.count
        bot.depositCalls.push({ name: it.name, count: take })
        it.count -= take
        if (it.count <= 0) bot._items = bot._items.filter(i => i.type !== type)
      },
      close: () => { bot.closed = true }
    })
  }
  return bot
}

// the faithful scanner: the NEAREST chest passing the caller's predicate
// (mineflayer's findBlock shape) - the v0.23.1 exclude list filters through it
function nearestScanner (bot, chests) {
  return ({ matching, maxDistance }) => {
    let best = null
    let bestD = Infinity
    for (const b of chests) {
      if (!matching(b)) continue
      const d = bot.entity.position.distanceTo(b.position)
      if (d <= maxDistance && d < bestD) { best = b; bestD = d }
    }
    return best
  }
}

beforeEach(() => resetDoomedGoalLedger())

test('THE SWAP VOICE: the saved deposit names its dead first chest and its rescue', async () => {
  const chestA = { name: 'chest', position: new Vec3(4, 64, 4) } // nearest, walk dead-ends
  const chestB = { name: 'chest', position: new Vec3(10, 64, 10) } // next nearest, reachable
  const bot = makeMockBot({ items: [item('cobblestone', 14)], gotoScript: [new Error('No path to the goal!'), 'ok'] })
  bot.findBlock = nearestScanner(bot, [chestA, chestB])
  const lines = []
  const res = await depositToChest(bot, { log: m => lines.push(m) })
  assert.equal(res.deposited, 6, 'the second chest banks what the first refused (the 8 seal floor rides the walk)')
  assert.ok(bot.closed, 'the used window must be closed')
  const voice = lines.find(l => /the v0\.23\.1 swap's own voice/.test(l))
  assert.ok(voice, 'the swap speaks when it fires')
  assert.match(voice, /\[SwapMock\] deposit: the nearest chest \[4,64,4\] refused \(No path to the goal!\)/)
  assert.match(voice, /the next chest in the ring takes the walk/)
})

test('THE SWAP VOICE: a doubled refusal keeps the primary-failure zero byte and still names the swap', async () => {
  const chestA = { name: 'chest', position: new Vec3(4, 64, 4) }
  const chestB = { name: 'chest', position: new Vec3(10, 64, 10) }
  const dead = new Error('No path to the goal!')
  const bot = makeMockBot({ items: [item('cobblestone', 14)], gotoScript: [dead, dead] })
  bot.findBlock = nearestScanner(bot, [chestA, chestB])
  const lines = []
  const res = await depositToChest(bot, { log: m => lines.push(m) })
  assert.equal(res.deposited, 0)
  assert.equal(res.reason, 'chest unreachable (No path to the goal!)', 'the primary failure keeps its byte (the v0.23.1 contract)')
  const voices = lines.filter(l => /the v0\.23\.1 swap's own voice/.test(l))
  assert.equal(voices.length, 1, 'the voice speaks once per fired swap (the recursive call has no second candidate to name)')
})

test('THE SWAP VOICE: a first-chest success never speaks (the voice rides the swap branch only)', async () => {
  const chestA = { name: 'chest', position: new Vec3(6, 64, 6) } // beyond PROXIMATE_OPEN_DIST: the walk branch runs
  const bot = makeMockBot({ items: [item('cobblestone', 20)], gotoScript: ['ok'] })
  bot.findBlock = nearestScanner(bot, [chestA])
  const lines = []
  const res = await depositToChest(bot, { log: m => lines.push(m) })
  assert.equal(res.deposited, 12)
  assert.equal(lines.filter(l => /the v0\.23\.1 swap's own voice/.test(l)).length, 0, 'no swap, no voice')
})

test('WIRING PIN: the voice line rides the swap branch before the recursive second candidate', () => {
  const src = fs.readFileSync(new URL('../../src/lib/deposit.mjs', import.meta.url), 'utf8')
  const swap = src.indexOf('the next chest in the ring takes the walk')
  const second = src.indexOf('const second = await depositToChest(bot, { keep, maxDistance, log, timeoutMs')
  assert.ok(swap > 0, 'the voice line exists in deposit.mjs')
  assert.ok(second > swap, 'the voice prints BEFORE the second walk (the cause leg precedes the outcome legs)')
  const branch = src.slice(src.indexOf("if (!chestBlock && exclude.length === 0 && isDeadChestVerdict(lastMsg).dead"), second)
  assert.match(branch, /deposit: the nearest chest \[\$\{dead\.x\},\$\{dead\.y\},\$\{dead\.z\}\] refused \(\$\{lastMsg\}\)/, 'the voice rides the v0.23.1 branch, not the open/walk retries')
})
