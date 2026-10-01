// (v0.396.0) THE SEAL RESERVE - the deposit-side count-bounded keep for the
// shelter family (the tithe pattern's third ride). MEASURED root: face 15
// (36760275928) read 40 of 43 ring-stock skips at stock ZERO - the final
// bank's withFuel=false keep empties the smelt-input keep (cobblestone banks
// fully) and dirt was NEVER keep-matched, so every chain's last deposit left
// a seal-ZERO pocket walking to the next site. The reserve keeps one full
// ring (8 = RING_BLOCKS_NEEDED) in SEAL_PRIORITY order; the overage banks.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Vec3 } from 'vec3'
import { SEAL_RESERVE_BOUND, sealReserveKept, sealReserveOverage, depositToChest, depositToChests, KEEP } from '../../src/lib/deposit.mjs'
import { RING_BLOCKS_NEEDED } from '../../src/lib/shelter.mjs'

// Unique stable numeric type per item name (the deposit.test.mjs law: a mock
// where every item shares one type removes the WRONG item).
const TYPES = new Map()
function item (name, count = 1) {
  if (!TYPES.has(name)) TYPES.set(name, TYPES.size + 1)
  return { name, count, type: TYPES.get(name) }
}

test('the bound is the ring\'s own constant - the two arithmetics must not drift', () => {
  assert.equal(SEAL_RESERVE_BOUND, 8)
  assert.equal(SEAL_RESERVE_BOUND, RING_BLOCKS_NEEDED)
})

test('the priority fill: dirt-first overage banks, the floor stays', () => {
  // dirt 20: keep 8 (the full floor), bank 12
  assert.equal(sealReserveOverage({ name: 'dirt', items: [item('dirt', 20)] }), 12)
  assert.equal(sealReserveKept([item('dirt', 20)]), 8)
  // below the bound: everything stays (the whale's fix - never bank the floor)
  assert.equal(sealReserveOverage({ name: 'dirt', items: [item('dirt', 4)] }), 0)
  assert.equal(sealReserveKept([item('dirt', 4)]), 4)
  // exactly at the bound: the floor holds, nothing banks
  assert.equal(sealReserveOverage({ name: 'dirt', items: [item('dirt', 8)] }), 0)
})

test('the family law: the floor fills in SEAL_PRIORITY order, the surplus banks', () => {
  // dirt 2 + cobblestone 20: dirt fills 2, cobblestone fills 6, cobblestone banks 14
  const pocket = [item('dirt', 2), item('cobblestone', 20)]
  assert.equal(sealReserveOverage({ name: 'dirt', items: pocket }), 0)
  assert.equal(sealReserveOverage({ name: 'cobblestone', items: pocket }), 14)
  assert.equal(sealReserveKept(pocket), 8)
  // the mirror shape: cobblestone 20 + dirt 2 built in the other order - the
  // allocation is order-independent by construction (the live recompute)
  const pocket2 = [item('cobblestone', 20), item('dirt', 2)]
  assert.equal(sealReserveOverage({ name: 'cobblestone', items: pocket2 }), 14)
  assert.equal(sealReserveOverage({ name: 'dirt', items: pocket2 }), 0)
})

test('a seal name the floor did not need banks fully (no over-keep)', () => {
  // cobblestone 50 + stone 2: the floor fills cobblestone (rank above stone);
  // the stone stack carries NO kept slice - it banks whole
  const pocket = [item('cobblestone', 50), item('stone', 2)]
  assert.equal(sealReserveOverage({ name: 'cobblestone', items: pocket }), 42)
  assert.equal(sealReserveOverage({ name: 'stone', items: pocket }), 2)
  assert.equal(sealReserveKept(pocket), 8)
})

test('exact-name family membership: the near-family reads its own opinion', () => {
  // 'cobbled_deepslate' is its own SEAL_PRIORITY entry, not a cobblestone ride
  const pocket = [item('cobbled_deepslate', 30)]
  assert.equal(sealReserveOverage({ name: 'cobbled_deepslate', items: pocket }), 22)
  // a seal name the pocket does not hold: held 0 -> overage 0 (the caller
  // would skip an empty stack - no phantom banking)
  assert.equal(sealReserveOverage({ name: 'stone', items: [item('cobblestone', 50)] }), 0)
})

test('no opinion (null) for non-seal names and junk - the legacy path owns them', () => {
  assert.equal(sealReserveOverage({ name: 'raw_iron', items: [item('raw_iron', 50)] }), null)
  assert.equal(sealReserveOverage({ name: 'gravel', items: [item('gravel', 9)] }), null)
  assert.equal(sealReserveOverage({ name: 'oak_planks', items: [item('oak_planks', 12)] }), 4, 'the pure family is complete (planks rank last in SEAL_PRIORITY); the WIRING filter - not this function - keeps the DEPOSIT_KEEP-matched planks out of the slice')
  assert.equal(sealReserveOverage({ name: null, items: [] }), null)
  assert.equal(sealReserveOverage({ name: 42, items: [item('dirt', 1)] }), null)
  assert.equal(sealReserveOverage(null), null)
  assert.equal(sealReserveOverage({ name: 'dirt' }), null, 'junk items -> null: never block a real stack on an unreadable pocket')
  assert.equal(sealReserveOverage({ name: 'dirt', items: 'junk' }), null)
})

test('junk entries inside a valid array undercount - the safe direction (bank more)', () => {
  const pocket = [null, undefined, { count: 5 }, { name: 42, count: 5 }, item('dirt', 20), 'junk']
  assert.equal(sealReserveOverage({ name: 'dirt', items: pocket }), 12, 'the junk entries read nothing, the real stack still prices')
  // fractional counts floor (the tithe's own convention)
  assert.equal(sealReserveOverage({ name: 'dirt', items: [{ name: 'dirt', count: 10.9 }] }), 2)
})

test('sealReserveKept junk safety: a non-array slice keeps nothing', () => {
  assert.equal(sealReserveKept(null), 0)
  assert.equal(sealReserveKept('junk'), 0)
  assert.equal(sealReserveKept([item('dirt', 2), item('cobblestone', 2)]), 4, 'the floor caps at the family total')
})

function makeMockBot ({
  items = [],
  chest = null,
  gotoFails = false,
  openFails = false,
  fullFor = [],
  silentFor = []
} = {}) {
  const bot = {
    username: 'SealMock',
    entity: { position: new Vec3(0.5, 64, 0.5) },
    inventory: { items: () => bot._items },
    _items: items.slice(),
    findBlock: () => chest,
    pathfinder: { goto: async () => { if (gotoFails) throw new Error('no path') } },
    depositCalls: [],
    scans: 0,
    closed: false,
    openChest: async () => {
      bot.scans++
      if (openFails) throw new Error('window dead')
      return {
        deposit: async (type, meta, count) => {
          const it = bot._items.find(i => i.type === type)
          if (it && fullFor.includes(it.name)) throw new Error('chest full')
          if (it && silentFor.includes(it.name)) return
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

test('END-TO-END the whale\'s shape: a post-final-bank cobble pocket keeps its ring floor', async () => {
  const chest = { position: new Vec3(3, 64, 3) }
  const bot = makeMockBot({ chest, items: [item('cobblestone', 20)] })
  const res = await depositToChest(bot)
  assert.equal(res.deposited, 12, 'the overage above the 8 floor banks')
  assert.equal(bot._items[0].name, 'cobblestone')
  assert.equal(bot._items[0].count, 8, 'the pocket walks out holding ONE FULL RING - the stock-0 fight dies here')
  assert.ok(bot.closed)
})

test('END-TO-END the mixed pocket: the floor fills dirt-first, the smelt leg\'s cobble survives', async () => {
  const chest = { position: new Vec3(3, 64, 3) }
  const bot = makeMockBot({
    chest,
    items: [item('wooden_pickaxe', 1), item('cobblestone', 64), item('dirt', 32), item('oak_log', 7)]
  })
  const res = await depositToChest(bot)
  assert.equal(res.deposited, 88, 'cobblestone banks whole (the floor spent on dirt), dirt banks its 24 overage')
  const left = Object.fromEntries(bot._items.map(i => [i.name, i.count]))
  assert.equal(left.dirt, 8, 'the floor rides the dirt (what pickSealItem spends first)')
  assert.equal(left.oak_log, 7)
  assert.equal(left.cobblestone, undefined, 'the whole cobble stack banks - the pre-smelt tithe owns the cobble keep, not the reserve')
  const lines = []
  await depositToChest(makeMockBot({ chest, items: [item('cobblestone', 20)] }), { log: m => lines.push(m) })
  assert.ok(lines.some(l => /seal reserve: banked 12 x cobblestone \(pocket keeps 8 seal units\)/.test(l)), 'the cure names itself for the mining tool')
})

test('END-TO-END the below-reserve pocket buys no walk (the honest bankable zero)', async () => {
  const chest = { position: new Vec3(3, 64, 3) }
  const bot = makeMockBot({ chest, items: [item('dirt', 8)] })
  const res = await depositToChests(bot)
  assert.deepEqual(res.chestReport, ['nothing to deposit'], 'the pocket whose bankable units are all reserve floor refuses BEFORE the walk')
  assert.equal(bot.scans, 0, 'the pocket truth precedes the world - no chest window ever opened')
})

test('WIRING PIN: the reserve gate rides the deposit loop before the full-bank path', async () => {
  const fs = await import('node:fs')
  const src = fs.readFileSync(new URL('../../src/lib/deposit.mjs', import.meta.url), 'utf8')
  // the gate consults the NON-KEEP slice (keep-matched seals are the tithe's
  // domain) and sits between the keep branch and the verified-transfer path
  const gate = src.match(/const sealSlice = pocketItems\(\)\.filter\(i => i && !keep\.some\(k => i\.name\.includes\(k\)\)\)[\s\S]{0,400}?sealReserveOverage/)
  assert.ok(gate, 'the slice filter matches the keep branch\'s own matcher (one matcher both sides)')
  // the bankable pre-check discounts the kept slice (the walk-killer prevention)
  assert.ok(/units - sealReserveKept\(nonKeep\)/.test(src), 'a pocket whose bankable units are all reserve floor never buys the walk')
  // the bound is co-derived, never drifted
  assert.ok(/SEAL_RESERVE_BOUND = 8/.test(src))
})
