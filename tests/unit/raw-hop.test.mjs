// The RAW HOP (v0.48.0): steer a short VISIBLE chest walk with raw controls -
// no pathfinder. Fleet 35610870878 (v0.47.1): 85x 'chest unreachable (Took to
// long to decide path to goal!)' on hops of d=7-12 WITH the v0.45.0 widened
// think window live - 19 node processes share the CI runner's cores, so the
// pathfinder thinkTimeout measures wall time and A* on an open platform
// explodes its frontier exactly when 19 bots think at once. A straight
// look-and-forward needs no decision at all.
import { test, beforeEach } from 'node:test'
import { resetDoomedGoalLedger } from '../../src/lib/jobqueue.mjs'
import assert from 'node:assert/strict'
import { Vec3 } from 'vec3'
import {
  RAW_HOP_DIST, RAW_HOP_MS, PROXIMATE_OPEN_DIST, HOP_SEARCH_RADIUS,
  rawHopDue, rawHopWalk, depositToChest
} from '../../src/lib/deposit.mjs'

const TYPES = new Map()
function item (name, count = 1) {
  if (!TYPES.has(name)) TYPES.set(name, TYPES.size + 1)
  return { name, count, type: TYPES.get(name) }
}

function makeChest (x = 6, y = 64, z = 0) {
  return { name: 'chest', position: new Vec3(x, y, z) }
}

// A mock bot whose physics CONVERGE on the chest: every waitForTicks call
// moves the entity ~1.2 blocks toward the chest (the raw loop's pacing).
function makeConvergingBot ({ chest, startX = 0.5, startZ = 0.5, y = 64 } = {}) {
  const bot = {
    username: 'RawHopBot',
    entity: { position: new Vec3(startX, y, startZ) },
    inventory: { items: () => bot._items },
    _items: [item('cobblestone', 40)],
    canSeeBlock: () => true,
    lookAt: async () => {},
    _controls: {},
    setControlState: (name, val) => { bot._controls[name] = val },
    _ticks: 0,
    waitForTicks: async n => {
      bot._ticks += n
      const dir = chest.position.clone().subtract(bot.entity.position)
      dir.y = 0
      const len = dir.norm() // mineflayer's vec3: norm() IS the length; there is no len()
      if (len > 0.01) {
        dir.scale(1 / len)
        bot.entity.position = bot.entity.position.add(dir.scale(Math.min(1.2, len)))
      }
    },
    findBlock: () => chest,
    gotoCalls: [],
    pathfinder: { goto: async goal => { bot.gotoCalls.push(goal) } },
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

test('rawHopDue: visible + close walks raw, everything else refuses', () => {
  assert.equal(rawHopDue({ dist: 7, visible: true }), true, 'the measured starved cell: a 7-block visible hop')
  assert.equal(rawHopDue({ dist: RAW_HOP_DIST, visible: true }), true, 'the boundary is inside')
  assert.equal(rawHopDue({ dist: RAW_HOP_DIST + 0.1, visible: true }), false, 'beyond the raw radius: pathfinder work')
  assert.equal(rawHopDue({ dist: 7, visible: false }), false, 'blind hops have walls between - pathfinder work')
  assert.equal(rawHopDue({ dist: 0, visible: true }), false, 'dist 0 is the proximate fast-path, not a walk')
  assert.equal(rawHopDue({ dist: -2, visible: true }), false)
  assert.equal(rawHopDue({ dist: NaN, visible: true }), false, 'unknown distance refuses')
  assert.equal(rawHopDue({ dist: Infinity, visible: true }), false)
  assert.equal(rawHopDue({ dist: 7 }), false, 'junk visibility refuses')
  assert.equal(rawHopDue({}), false)
})

test('raw hop constants stay in their lanes', () => {
  assert.ok(RAW_HOP_DIST <= HOP_SEARCH_RADIUS, 'a raw hop is a subset of the hop budget')
  assert.ok(RAW_HOP_DIST > PROXIMATE_OPEN_DIST, 'there is a gap between proximate-open and raw-walk, or the raw walk is dead code')
  assert.ok(RAW_HOP_MS >= 3000 && RAW_HOP_MS <= 8000, 'bounded: seconds of cost on a miss, never the attempt')
})

test('rawHopWalk: converging physics reach the window, controls always released', async () => {
  const chest = makeChest(7, 64, 0)
  const bot = makeConvergingBot({ chest })
  const ok = await rawHopWalk(bot, chest, { ms: 2000 })
  assert.equal(ok, true, 'a visible 7-block walk converges with raw controls')
  assert.equal(bot._controls.forward, false, 'forward released in the finally')
  assert.equal(bot._controls.sprint, false, 'sprint released')
  assert.equal(bot._controls.jump, false, 'jump released')
  assert.ok(bot.entity.position.distanceTo(chest.position) <= PROXIMATE_OPEN_DIST, 'the bot stands inside openChest reach')
})

test('rawHopWalk: a non-converging bot times out bounded and falls back', async () => {
  const chest = makeChest(7, 64, 0)
  const bot = makeConvergingBot({ chest })
  bot.waitForTicks = async () => { /* physics refuses to move us: a wall, a shove */ }
  const t0 = Date.now()
  const ok = await rawHopWalk(bot, chest, { ms: 60 })
  assert.equal(ok, false, 'no convergence -> false (the pathfinder attempt follows)')
  assert.ok(Date.now() - t0 < 1500, 'the miss is bounded by ms, not by the walk budget')
  assert.equal(bot._controls.forward, false, 'controls released even on the miss path')
})

test('rawHopWalk: a bare mock (throwing waitForTicks) never throws', async () => {
  const chest = makeChest(7, 64, 0)
  const bot = makeConvergingBot({ chest })
  bot.waitForTicks = async () => { throw new Error('no tick loop on mocks') }
  const ok = await rawHopWalk(bot, chest, { ms: 500 })
  assert.equal(ok, false)
  assert.equal(bot._controls.forward, false, 'the finally still releases')
})

test('INTEGRATION: a visible 7-block chest deposits with ZERO pathfinder calls', async () => {
  const chest = makeChest(7, 64, 0)
  const bot = makeConvergingBot({ chest })
  const logs = []
  const r = await depositToChest(bot, { chestBlock: chest, log: m => logs.push(m) })
  assert.equal(r.deposited, 40, 'the cobblestone landed (units, not stacks)')
  assert.equal(bot.gotoCalls.length, 0, 'the pathfinder was NEVER touched - the CPU-starved A* is out of the loop')
  assert.ok(logs.some(l => /raw walk in/.test(l)), 'the raw walk line is printed')
  assert.equal(bot.closed, true)
})

test('INTEGRATION: without canSeeBlock the legacy pathfinder path still owns the hop', async () => {
  const chest = makeChest(30, 64, 0)
  const bot = makeConvergingBot({ chest })
  delete bot.canSeeBlock
  const logs = []
  const r = await depositToChest(bot, { chestBlock: chest, log: m => logs.push(m) })
  assert.equal(r.deposited, 40, 'the deposit still lands (via the proximate/goal walk or the pathfinder)')
  assert.ok(bot.gotoCalls.length > 0, 'no visibility -> the raw hop must not fire, the pathfinder walks')
})

test('INTEGRATION: a water rescue owns the controls - no raw walk fires', async () => {
  const chest = makeChest(7, 64, 0)
  const bot = makeConvergingBot({ chest })
  bot._waterRescue = true // the rescue IS the walk
  // the rescue clears 100 ms in (the real rescue sets _waterRescue=false in
  // its finally) - the retry then walks via the rescue-aware pathfinder path
  bot._rescueTimer = setTimeout(() => { bot._waterRescue = false }, 100)
  const logs = []
  try {
    const r = await depositToChest(bot, { chestBlock: chest, log: m => logs.push(m) })
    assert.equal(r.deposited, 40, 'the deposit lands once the rescue clears')
    assert.ok(bot.gotoCalls.length > 0, 'the rescue-aware walkOnce path ran the goal')
    assert.ok(!logs.some(l => /raw walk in/.test(l)), 'the v0.48.0 raw hop NEVER fired under a rescue')
  } finally { clearTimeout(bot._rescueTimer) }
})
