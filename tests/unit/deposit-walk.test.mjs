// The chest WALK (v0.18.5): dist-scaled budget + one rescue-aware retry.
//
// FLEET #128 (the first fully healthy 19-bot run, 600s): 77 bank attempts, banked=0.
// Every attempt died on the walk: 'chest unreachable (Path was stopped ...)' - the
// flat 30s budget cannot cover a far chest behind shaft-mouth escape + terrain
// detours - and 'chest unreachable (water rescue in progress (walk to chest refused))'
// - the fail-fast rescue gate burned the attempt while the bot was still swimming.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Vec3 } from 'vec3'
import { depositToChest, chestWalkBudgetMs, CHEST_WALK_BASE_MS, CHEST_WALK_CAP_MS, CHEST_WALK_SHORT_MS, findChest } from '../../src/lib/deposit.mjs'

const TYPES = new Map()
function item (name, count = 1) {
  if (!TYPES.has(name)) TYPES.set(name, TYPES.size + 1)
  return { name, count, type: TYPES.get(name) }
}

function makeMockBot ({ items = [], chest = null, gotoScript = [] } = {}) {
  const bot = {
    username: 'WalkBot',
    entity: { position: new Vec3(0.5, 64, 0.5) },
    inventory: { items: () => bot._items },
    _items: items.slice(),
    findBlock: () => chest,
    gotoCalls: [],
    _gotoScript: gotoScript, // array of either Error-instances (throw) or 'ok' strings, consumed in order; the LAST entry repeats
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

test('chestWalkBudgetMs: short-hop pin 15s (d<=16), floor knee, 500 ms/block, cap at 60s', () => {
  // (v0.56.0) THE SHORT-HOP PIN: F2 (run51/35639593200) stood d=10..11 from the
  // chest rows and 2 crowd-crushed walks ate 30s each, then the walk floor
  // refused the 3rd chest. d<=16 walks now cap at 15s: one stuck walk cannot
  // starve the hop loop, and 3 short hops still fit the chain clock.
  assert.equal(chestWalkBudgetMs(0), CHEST_WALK_SHORT_MS, 'a near chest walks in seconds - the 30s floor only fed stalls')
  assert.equal(chestWalkBudgetMs(-5), CHEST_WALK_SHORT_MS, 'nonsense distance -> the short class')
  assert.equal(chestWalkBudgetMs(10), CHEST_WALK_SHORT_MS, 'the F2 case: 35s of stall budget becomes 15s')
  assert.equal(chestWalkBudgetMs(16), CHEST_WALK_SHORT_MS, 'the pin covers the whole short class')
  assert.equal(chestWalkBudgetMs(17), CHEST_WALK_BASE_MS, 'past the pin the historical 30s floor resumes (the curve floors at 30s until d~50)')
  assert.equal(chestWalkBudgetMs(64), 64 * 500 + 5000, '64 blocks = detour-allowed 37s, NOT the old flat 30s')
  assert.equal(chestWalkBudgetMs(200), CHEST_WALK_CAP_MS, 'an absurd distance hits the cap - the walk stays bounded')
  const a = chestWalkBudgetMs(50) // the knee: 50*500+5000 = the 30s floor exactly
  const b = chestWalkBudgetMs(64) // past the knee the budget scales again
  assert.ok(a < b, 'monotonic in distance (above the floor knee)')
  assert.ok(chestWalkBudgetMs(64) > 30000, 'the fleet #128 case (far chest) must get MORE than the old flat budget')
})

test('the walk budget scales with the real straight-line distance (auto mode)', async () => {
  // chest 64 blocks away: the goto must receive the dist-scaled budget, not 30s
  const chest = { position: new Vec3(0.5, 64, 64.5) } // ~64 blocks from the spawn point
  const bot = makeMockBot({ chest, gotoScript: ['ok'], items: [item('cobblestone', 3)] })
  const res = await depositToChest(bot)
  assert.equal(res.deposited, 3)
  assert.equal(bot.gotoCalls.length, 1)
  const budget = chestWalkBudgetMs(bot.entity.position.distanceTo(chest.position))
  assert.ok(budget > CHEST_WALK_BASE_MS, 'a 64-block chest is a far chest by this geometry')
})

test('an explicit timeoutMs still works (backwards compatible pinning)', async () => {
  // the pinned path must behave exactly like the old flat-budget code: the mock walk
  // succeeds, the deposit lands - a caller who pins a budget keeps today's semantics
  const chest = { position: new Vec3(0.5, 64, 64.5) }
  const bot = makeMockBot({ chest, gotoScript: ['ok'], items: [item('cobblestone', 3)] })
  const res = await depositToChest(bot, { timeoutMs: 30000 })
  assert.equal(res.deposited, 3)
  assert.equal(bot.gotoCalls.length, 1)
})

test('a water-rescue refusal waits out the window and retries ONCE', async () => {
  const chest = { position: new Vec3(6, 64, 6) } // beyond PROXIMATE_OPEN_DIST: the walk branch must actually run
  const bot = makeMockBot({
    chest,
    items: [item('cobblestone', 5)],
    gotoScript: [new Error('water rescue in progress (walk to chest refused)'), 'ok']
  })
  bot._waterRescue = false // the rescue is over by the time the retry polls
  const res = await depositToChest(bot)
  assert.equal(res.deposited, 5, 'the retry after the cleared rescue must bank')
  assert.equal(bot.gotoCalls.length, 2, 'exactly one retry - no open-ended loop')
  assert.ok(bot.closed)
})

test('a rescue returning mid-retry still cannot loop the walk open-ended', async () => {
  const chest = { position: new Vec3(6, 64, 6) } // beyond PROXIMATE_OPEN_DIST: the walk branch must actually run
  const bot = makeMockBot({
    chest,
    items: [item('cobblestone', 5)],
    // BOTH attempts refused: the rescue cleared, the retry hit it again (a pond on the
    // way) - the walk must give up after the retry, never loop
    gotoScript: [new Error('water rescue in progress (walk to chest refused)'), new Error('water rescue in progress (walk to chest refused)')]
  })
  bot._waterRescue = false // cleared between the attempts (the poll sees it immediately)
  const res = await depositToChest(bot)
  assert.equal(res.deposited, 0)
  assert.match(res.reason, /chest unreachable/)
  assert.equal(bot.gotoCalls.length, 2, 'at most ONE retry - bounded, whatever the world does')
})

test('a NON-rescue walk failure returns immediately (no pointless retry)', async () => {
  const chest = { name: 'chest', position: new Vec3(30, 64, 30) } // name: the real matching predicate needs it
  const bot = makeMockBot({ items: [item('cobblestone', 5)] })
  bot._gotoScript = [new Error('no path')]
  // a FAITHFUL scanner: the real findChest matching predicate (with the v0.23.1
  // exclude list) runs against the world - the only chest gets excluded after its
  // No-path hop attempt, the re-scan finds nothing, no second walk ever starts
  bot.findBlock = ({ matching, maxDistance }) => {
    if (!matching(chest)) return null
    const d = bot.entity.position.distanceTo(chest.position)
    return d <= maxDistance ? chest : null
  }
  const res = await depositToChest(bot)
  assert.equal(res.deposited, 0)
  assert.match(res.reason, /no path/)
  assert.equal(bot.gotoCalls.length, 1)
})

// (v0.20.1) The fleet #128 headline class: 'chest unreachable (Path was stopped...)'.
// walkRetryPlan classifies it as retryable-immediate; depositToChest must honor that.
test('a Path-was-stopped walk gets exactly ONE immediate retry and banks', async () => {
  const chest = { position: new Vec3(6, 64, 6) } // beyond PROXIMATE_OPEN_DIST: the walk branch must actually run
  const bot = makeMockBot({
    chest,
    items: [item('cobblestone', 7)],
    gotoScript: [new Error('Path was stopped before it could be completed! Thus, the desired goal was not reached.'), 'ok']
  })
  const res = await depositToChest(bot)
  assert.equal(res.deposited, 7, 'the retry walk must reach the chest and bank the loot')
  assert.equal(bot.gotoCalls.length, 2, 'exactly one retry - bounded')
  assert.ok(bot.closed)
})

test('Path-was-stopped on BOTH attempts gives up (never loops the walk open-ended)', async () => {
  const chest = { position: new Vec3(6, 64, 6) } // beyond PROXIMATE_OPEN_DIST: the walk branch must actually run
  const stopped = new Error('Path was stopped before it could be completed! Thus, the desired goal was not reached.')
  const bot = makeMockBot({
    chest,
    items: [item('cobblestone', 5)],
    gotoScript: [stopped, stopped]
  })
  const res = await depositToChest(bot)
  assert.equal(res.deposited, 0)
  assert.match(res.reason, /chest unreachable/)
  assert.match(res.reason, /Path was stopped/)
  assert.equal(bot.gotoCalls.length, 2, 'at most TWO walks total - the runtime bound stays hard')
})

test('a walk timeout retries once (the first budget may burn on a poisoned walk), then gives up', async () => {
  const chest = { position: new Vec3(6, 64, 6) } // beyond PROXIMATE_OPEN_DIST: the walk branch must actually run
  const timeout = new Error('walk to chest: timeout after 30000ms')
  const recovered = makeMockBot({ chest, items: [item('cobblestone', 4)], gotoScript: [timeout, 'ok'] })
  const ok = await depositToChest(recovered, { timeoutMs: 30000 })
  assert.equal(ok.deposited, 4, 'timeout then success -> the loot banks')
  assert.equal(recovered.gotoCalls.length, 2)

  const stuck = makeMockBot({ chest, items: [item('cobblestone', 4)], gotoScript: [timeout, timeout] })
  const bad = await depositToChest(stuck, { timeoutMs: 30000 })
  assert.equal(bad.deposited, 0)
  assert.match(bad.reason, /timeout after/)
  assert.equal(stuck.gotoCalls.length, 2, 'a real-distance timeout never gets a third walk')
})

// (v0.23.1) ONE chest must not strand the delivery: the fleet measured 5x
// 'chest unreachable (No path to the goal!)' at final bank while the yard held
// dozens of chests. The auto-picked nearest chest that No-paths is excluded and
// the next nearest gets the walk; a caller-pinned chest stays final.
test('a No-path nearest chest hops to the NEXT nearest chest and banks there', async () => {
  const chestA = { name: 'chest', position: new Vec3(4, 64, 4) } // nearest, but its walk dead-ends
  const chestB = { name: 'chest', position: new Vec3(10, 64, 10) } // next nearest, reachable
  const bot = makeMockBot({ items: [item('cobblestone', 6)] })
  // emulate mineflayer's findBlock: the NEAREST chest passing the caller's predicate
  bot.findBlock = ({ matching, maxDistance }) => {
    let best = null
    let bestD = Infinity
    for (const b of [chestA, chestB]) {
      if (!matching(b)) continue
      const d = bot.entity.position.distanceTo(b.position)
      if (d <= maxDistance && d < bestD) { best = b; bestD = d }
    }
    return best
  }
  // the walk toward chest A dead-ends with the pathfinder's No path; chest B walks
  bot.pathfinder.goto = async g => {
    if (Math.abs(g.x - 4) < 3 && Math.abs(g.z - 4) < 3) throw new Error('No path to the goal!')
  }
  const res = await depositToChest(bot)
  assert.equal(res.deposited, 6, 'the second chest banks what the first refused')
  assert.ok(bot.closed, 'the used window must be closed')
})

test('an explicitly chosen chest that No-paths is NOT replaced (caller choice is final)', async () => {
  const chest = { position: new Vec3(6, 64, 6) } // beyond PROXIMATE_OPEN_DIST: the walk branch must actually run
  const stopped = new Error('No path to the goal!')
  const bot = makeMockBot({ chest, items: [item('cobblestone', 5)], gotoScript: [stopped] })
  const res = await depositToChest(bot, { chestBlock: chest })
  assert.equal(res.deposited, 0)
  assert.match(res.reason, /No path/)
  assert.equal(bot.gotoCalls.length, 1, "walkRetryPlan gives up on 'No path' (one walk), and there is no chest hop")
})

test('findChest: the exclude list skips exactly the dead positions', () => {
  const A = { name: 'chest', position: new Vec3(3, 64, 3) }
  const B = { name: 'chest', position: new Vec3(8, 64, 8) }
  const bot = { findBlock: ({ matching }) => [A, B].filter(matching)[0] || null }
  assert.equal(findChest(bot), A, 'nearest first when nothing is excluded')
  assert.equal(findChest(bot, { exclude: [A.position.floored()] }), B, 'excluded A -> B')
  assert.equal(findChest(bot, { exclude: [A.position.floored(), B.position.floored()] }), null, 'all excluded -> null')
  assert.equal(findChest(bot, { exclude: [null, undefined] }), A, 'junk exclude entries change nothing')
  const decoy = { name: 'chest_minecart', position: new Vec3(1, 64, 1) }
  const bot2 = { findBlock: ({ matching }) => [decoy, A].filter(matching)[0] || null }
  assert.equal(findChest(bot2), A, "a chest-shaped name that fails both predicate branches ('chest_minecart' ends in 'minecart', not '_chest') cannot shadow the real chest")
})

// ---------------------------------------------------------------------------
// (v0.41.0) THE YARD FILTER - natural worldgen chests must never hijack a bank
// chain. Fleet 35580596054 evidence: bots dug ~400-450 blocks from the yard,
// ZERO scan-miss lines fired (findChest found worldgen chests at the y=40-60
// band), 14/14 fallback whys were 'budget exhausted' and F1 burned ~195s on
// doomed wilderness hops. With a yard known, only near-yard chests qualify.
test('findChest: the yard filter accepts a chest inside the yard radius', () => {
  const yard = new Vec3(0, 64, 0)
  const chest = { name: 'chest', position: new Vec3(50, 66, 20) } // ~54 blocks from the yard
  const bot = { findBlock: ({ matching }) => (matching(chest) ? chest : null) }
  assert.equal(findChest(bot, { yardCenter: yard }), chest, 'a warehouse chest passes the filter')
})

test('findChest: the yard filter rejects a wilderness worldgen chest', () => {
  const yard = new Vec3(0, 64, 0)
  const wild = { name: 'chest', position: new Vec3(-106, 51, 420) } // ~433 blocks out - the F1 case
  const bot = { findBlock: ({ matching }) => (matching(wild) ? wild : null) }
  assert.equal(findChest(bot, { yardCenter: yard }), null, 'a mineshaft chest 400+ blocks out is NOT a bank target')
})

test('findChest: the yard radius boundary and the legacy no-yard behavior', () => {
  const yard = new Vec3(0, 64, 0)
  const edge = { name: 'chest', position: new Vec3(64, 64, 0) } // exactly at the radius
  const beyond = { name: 'chest', position: new Vec3(65, 64, 0) }
  const bot = { findBlock: ({ matching }) => [edge, beyond].filter(matching)[0] || null }
  assert.equal(findChest(bot, { yardCenter: yard }), edge, 'exactly at the radius passes (<=)')
  assert.equal(findChest(bot, { yardCenter: yard, yardRadius: 10 }), null, 'a custom radius shrinks the filter')
  assert.equal(findChest(bot), edge, 'no yardCenter = legacy behavior, no filter')
  assert.equal(findChest(bot, { yardCenter: null }), edge, 'an explicit null yard = no filter')
})

test('findChest: palette candidates pass, REAL junk positions still reject', () => {
  // (v0.43.0) CONTRACT UPDATE - the palette lesson. mineflayer probes the matcher
  // with Block.fromStateId blocks that have NO position (blocks.js
  // isBlockInSection); rejecting them inside the matcher skipped every chest
  // section and findChest returned null with the warehouse in range (measured:
  // dispatch 35591877408 F10, 13 blocks from 50 verified chests, banked=0). A
  // position-less block is a CANDIDATE (the real scan re-runs the matcher with
  // true positions), while a REAL block with a junk position (NaN coords) is a
  // blind-walk hazard and still rejects.
  const yard = new Vec3(0, 64, 0)
  const palette = { name: 'chest', position: null }
  const junk = { name: 'chest', position: { x: 10, y: NaN, z: 0 } }
  const bot = { findBlock: ({ matching }) => (matching(palette) ? palette : (matching(junk) ? junk : null)) }
  assert.equal(findChest(bot, { yardCenter: yard }), palette, 'position-less = palette candidate - the section must be scanned')
  assert.equal(findChest(bot, { yardCenter: yard, yardRadius: 64 }), palette)
  const junkBot = { findBlock: ({ matching }) => (matching(junk) ? junk : null) }
  assert.equal(findChest(junkBot, { yardCenter: yard }), null, 'a real junk position is still a blind walk - reject')
})

test('chestNearYard: junk-tolerant pure predicate', async () => {
  const { chestNearYard } = await import('../../src/lib/deposit.mjs')
  const yard = { x: 0, y: 64, z: 0 }
  assert.equal(chestNearYard({ chestPos: { x: 3, y: 64, z: 3 }, yardCenter: yard }), true)
  assert.equal(chestNearYard({ chestPos: { x: 400, y: 64, z: 0 }, yardCenter: yard }), false)
  assert.equal(chestNearYard({ chestPos: null, yardCenter: yard }), false, 'no position - no filter pass')
  assert.equal(chestNearYard({ chestPos: { x: NaN, y: 1, z: 2 }, yardCenter: yard }), false, 'junk position rejected')
  assert.equal(chestNearYard({ chestPos: { x: 9999, y: 1, z: 2 }, yardCenter: null }), true, 'no yard known - legacy pass')
  assert.equal(chestNearYard({ chestPos: { x: 9999, y: 1, z: 2 }, yardCenter: { x: NaN, y: 0, z: 0 } }), true, 'junk yard cannot filter')
  assert.equal(chestNearYard({ chestPos: { x: 40, y: 0, z: 0 }, yardCenter: yard, radius: NaN }), false, 'junk radius -> the default 64 still applies')
})
