// (v0.65.0) THE FULL-CHEST LEDGER: a chest whose window reads 0 free slots
// must cost the fleet ONE discovery, not 19. run61 (dispatch 35677752396)
// mined: every chest hop landed on full/stale y=69 lake-bottom chests left by
// earlier runs - 4x 'nothing to deposit' (window opened, all clicks rejected)
// and 4x 'No path to the goal!' - while the empty yard row was never reached:
// the nearest-first scan re-walked every bot to the same dead chests, the
// chain clock died, banked=0, and 1345u of 2067 mined evaporated as despawned
// drops. These pins freeze the verdict path: the window-full read BEFORE the
// click loop, the fleet ledger record, and the skip-before-walk.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Vec3 } from 'vec3'
import { recordNoPath, nearNoPath, NOPATH_TTL_MS } from '../../src/lib/nopath.mjs'
import {
  chestFreeSlots, depositToChest, depositToChests,
  CHEST_SLOTS, FULL_CHEST_TTL_MS, FULL_CHEST_CAP, FULL_CHEST_RADIUS, FULL_CHEST_DY
} from '../../src/lib/deposit.mjs'

const TYPES = new Map()
function item (name, count = 1) {
  if (!TYPES.has(name)) TYPES.set(name, TYPES.size + 1)
  return { name, count, type: TYPES.get(name) }
}

test('full-chest constants: 27 slots, 180s ttl, cap 24, TIGHT radius - and NOT the no-path ttl', () => {
  assert.strictEqual(CHEST_SLOTS, 27)
  assert.strictEqual(FULL_CHEST_TTL_MS, 180000)
  assert.strictEqual(FULL_CHEST_CAP, 24)
  assert.strictEqual(FULL_CHEST_RADIUS, 1, 'the verdict is about THIS chest - yard rows pack chests 2 blocks apart, a wide radius would skip the neighbors')
  assert.strictEqual(FULL_CHEST_DY, 2)
  assert.notStrictEqual(FULL_CHEST_TTL_MS, NOPATH_TTL_MS, 'a full chest outlives a no-path verdict: different knobs')
})

test('chestFreeSlots: the window read and the junk policy', () => {
  assert.strictEqual(chestFreeSlots(new Array(27).fill(item('junk'))), 0, 'a 27-stack single chest is FULL')
  assert.strictEqual(chestFreeSlots(new Array(54).fill(item('junk'))), 0, 'a full double chest reads 0 too')
  assert.strictEqual(chestFreeSlots(new Array(54).fill(item('junk'))), 0, 'a double chest with 28-53 stacks ALSO reads 0 - conservative by design (never re-walk a chest that rejected clicks; the yard holds more candidates)')
  assert.strictEqual(chestFreeSlots(new Array(26).fill(item('junk'))), 1, 'one free slot is not full - the click loop runs')
  assert.strictEqual(chestFreeSlots([]), CHEST_SLOTS, 'an empty chest has every slot free')
  assert.strictEqual(chestFreeSlots(null), CHEST_SLOTS, 'junk window read = cannot call it full')
  assert.strictEqual(chestFreeSlots(undefined), CHEST_SLOTS)
  assert.strictEqual(chestFreeSlots('junk'), CHEST_SLOTS)
  assert.strictEqual(chestFreeSlots(new Array(3).fill(item('junk')), 4), 1, 'custom capacity rides the argument (barrels stay supported)')
})

function makeMockBot ({ pocketItems, windowItems, position = new Vec3(0.5, 64, 0.5) } = {}) {
  const bot = {
    username: 'MockBot',
    entity: { position },
    inventory: { items: () => bot._items },
    _items: (pocketItems || []).slice(),
    depositCalls: [],
    closed: 0,
    openChest: async () => ({
      // the window read: one entry per OCCUPIED chest slot (mineflayer chest.items())
      items: () => (windowItems || []).map(w => ({ ...w })),
      deposit: async (type) => {
        const it = bot._items.find(i => i.type === type)
        if (!it) throw new Error('chest full')
        bot.depositCalls.push({ name: it.name, count: it.count })
        bot._items = bot._items.filter(i => i.type !== type)
      },
      close: () => { bot.closed++ }
    })
  }
  return bot
}

test('depositToChest: a full window is named, recorded for the fleet, and costs ZERO clicks', async () => {
  const ledger = []
  const chest = { name: 'chest', position: new Vec3(2, 64, 2) }
  const bot = makeMockBot({
    pocketItems: [item('cobblestone', 30), item('raw_iron', 7)],
    windowItems: new Array(27).fill(item('old_junk'))
  })
  const logLines = []
  const res = await depositToChest(bot, { chestBlock: chest, log: m => logLines.push(m), fullChestLedger: ledger })
  assert.strictEqual(res.deposited, 0)
  assert.match(res.reason, /chest full/, 'the verdict names the fullness, not a vague nothing')
  assert.strictEqual(bot.depositCalls.length, 0, 'no doomed 5s clicks were paid')
  assert.strictEqual(bot.closed, 1, 'the window was closed cleanly')
  assert.strictEqual(ledger.length, 1, 'the fleet ledger holds the verdict')
  assert.strictEqual(ledger[0].x, 2)
  assert.strictEqual(ledger[0].y, 64)
  assert.strictEqual(ledger[0].z, 2, 'the cell is the floored chest position')
  assert.ok(logLines.some(l => /full-chest ledger.*cached for the fleet/.test(l)), 'the record line names the chest and the fleet scope')
})

test('depositToChest: no ledger argument still returns the honest verdict (null = ledger off)', async () => {
  const chest = { name: 'chest', position: new Vec3(2, 64, 2) }
  const bot = makeMockBot({ pocketItems: [item('cobblestone', 5)], windowItems: new Array(27).fill(item('old_junk')) })
  const res = await depositToChest(bot, { chestBlock: chest, log: () => {} })
  assert.match(res.reason, /chest full/)
})

test('depositToChest: a window with a free slot deposits normally (no false full)', async () => {
  const chest = { name: 'chest', position: new Vec3(2, 64, 2) }
  const bot = makeMockBot({ pocketItems: [item('cobblestone', 30)], windowItems: new Array(26).fill(item('old_junk')) })
  const res = await depositToChest(bot, { chestBlock: chest, log: () => {} })
  assert.strictEqual(res.deposited, 30, '26/27 taken: the click loop runs and lands the pocket')
  assert.strictEqual(res.reason, 'ok')
})

test('the ledger skips the full chest for OTHER bots: depositToChests falls through to the next candidate', async () => {
  const ledger = []
  const fullChest = { name: 'chest', position: new Vec3(2, 64, 2) }
  const goodChest = { name: 'chest', position: new Vec3(4, 64, 1) }
  const candidates = [fullChest, goodChest]
  const bot = {
    username: 'MockBot',
    entity: { position: new Vec3(0.5, 64, 0.5) },
    inventory: { items: () => bot._items },
    _items: [item('cobblestone', 12)],
    depositCalls: [],
    pathfinder: { goto: async () => {} },
    // the WINDOW is per-chest: the lake-bottom leftover is full, the next
    // candidate is empty - exactly the run61 shape (full strays, an empty row)
    openChest: async chest => ({
      items: () => (chest === fullChest ? new Array(27).fill({ name: 'old_junk', type: 999 }) : []),
      deposit: async type => {
        const it = bot._items.find(i => i.type === type)
        if (!it) throw new Error('chest full')
        bot.depositCalls.push({ name: it.name, count: it.count })
        bot._items = bot._items.filter(i => i.type !== type)
      },
      close: () => { bot.closed = (bot.closed ?? 0) + 1 }
    }),
    // emulate the live scan: findChest's matcher runs per candidate; the
    // exclude list (the tried chest) kills the full chest after the discovery
    findBlock: opts => {
      for (const cand of candidates) {
        try { if (opts.matching(cand)) return cand } catch { /* not a match */ }
      }
      return null
    }
  }
  const logLines = []
  const res = await depositToChests(bot, { log: m => logLines.push(m), fullChestLedger: ledger, maxChests: 3 })
  assert.strictEqual(res.deposited, 12, 'the pocket drained into the SECOND chest')
  assert.strictEqual(res.chestsUsed, 1)
  assert.ok(ledger.some(e => e.x === 2 && e.y === 64 && e.z === 2), 'the full chest joined the ledger')
  assert.ok(logLines.some(l => /chest full/.test(l)), 'the first hop named the fullness')
  assert.ok(logLines.some(l => /banked 12 items/.test(l)), 'the delivery line exists')
})

test('the full verdict expires on the FULL ttl (not the no-path ttl) and keeps the newest under the cap', () => {
  const ledger = recordNoPath([], { x: 2, y: 64, z: 2 }, 1000, { ttl: FULL_CHEST_TTL_MS, cap: FULL_CHEST_CAP })
  const hitOpts = { ttl: FULL_CHEST_TTL_MS, radius: FULL_CHEST_RADIUS, dy: FULL_CHEST_DY }
  assert.strictEqual(nearNoPath(ledger, { x: 2, y: 64, z: 2 }, 2000, hitOpts).hit, true)
  assert.strictEqual(
    nearNoPath(ledger, { x: 2, y: 64, z: 2 }, 1000 + FULL_CHEST_TTL_MS - 1, hitOpts).hit,
    true, 'live at ttl-1'
  )
  assert.strictEqual(
    nearNoPath(ledger, { x: 2, y: 64, z: 2 }, 1000 + FULL_CHEST_TTL_MS + 1, hitOpts).hit,
    false, 'expired past the full ttl - a chest that got space is reachable again'
  )
  // THE TIGHT GEOMETRY (measured live with radius 4 before this pin): the
  // yard's NEXT chest 2b away must NOT be skipped (rows pack 2 apart). Radius 1
  // still covers the ADJACENT block - deliberate: adjacent chest blocks share a
  // double-chest inventory, skipping the second half of a full double is right.
  assert.strictEqual(nearNoPath(ledger, { x: 3, y: 64, z: 2 }, 2000, hitOpts).hit, true, 'the adjacent block (a double-chest partner) is covered')
  assert.strictEqual(nearNoPath(ledger, { x: 4, y: 64, z: 2 }, 2000, hitOpts).hit, false, 'the next chest in the row (2b spacing) stays reachable')
  assert.strictEqual(nearNoPath(ledger, { x: 3, y: 64, z: 1 }, 2000, hitOpts).hit, false, 'a chest 1.41b diagonal away stays reachable')
  // the cap keeps the newest: 25 verdicts -> 24, the OLDEST dropped
  let many = []
  for (let i = 0; i < FULL_CHEST_CAP + 1; i++) {
    many = recordNoPath(many, { x: i, y: 64, z: 0 }, 1000 + i, { ttl: FULL_CHEST_TTL_MS, cap: FULL_CHEST_CAP })
  }
  assert.strictEqual(many.length, FULL_CHEST_CAP)
  assert.strictEqual(many[0].x, 1, 'the oldest verdict was dropped first')
})
