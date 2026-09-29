// Tests for the melee arms chain (src/lib/arms.mjs).
// The decision matrix is pure inventory math - no server needed. The craft flow
// is exercised through the deps seam (fake craftUntil/placeTable) so the test
// pins the ORDER (sticks first, then table, then the sword) without mocking
// mineflayer - the same shape the toolupgrade tests use.
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import {
  SWORD_TIERS, SWORD_STICKS, SWORD_MATERIAL_COST, COBBLE_RESERVE, INGOT_RESERVE, SWORD_TABLE_PLANKS,
  countSwords, swordCheck, craftSword, swordTablePlan
} from '../../src/lib/arms.mjs'

function it (name, count = 1) {
  return { name, count }
}

function fakeBot (items) {
  return { inventory: { items: () => items }, username: 'A1' }
}

test('constants: tier ladder, recipe costs, reserves agree', () => {
  assert.equal(SWORD_TIERS[0], 'iron_sword')
  assert.equal(SWORD_TIERS[2], 'wooden_sword')
  assert.equal(SWORD_STICKS, 1)
  for (const t of SWORD_TIERS) assert.equal(SWORD_MATERIAL_COST[t], 2, `${t} needs 2 material`)
  assert.ok(COBBLE_RESERVE >= 3, 'the spare stone pickaxe budget must survive the sword')
  assert.ok(INGOT_RESERVE >= 3, 'the iron pickaxe budget must survive the sword')
})

test('countSwords: sums every tier, ignores tools and materials', () => {
  const bot = fakeBot([it('wooden_sword'), it('stone_sword', 2), it('iron_pickaxe'), it('stick', 4)])
  assert.equal(countSwords(bot), 3)
  assert.equal(countSwords(fakeBot([it('iron_pickaxe')])), 0)
})

test('swordCheck: a bot holding a sword is not due', () => {
  const r = swordCheck(fakeBot([it('wooden_sword'), it('oak_planks', 8), it('stick', 2)]))
  assert.equal(r.due, false)
  assert.match(r.reason, /holds 1 sword/)
})

test('swordCheck: iron tier wins when ingots clear the pickaxe reserve', () => {
  const bot = fakeBot([it('iron_ingot', 2 + INGOT_RESERVE), it('stick', 2)])
  const r = swordCheck(bot)
  assert.equal(r.due, true)
  assert.equal(r.tier, 'iron_sword')
  // one ingot short of the reserve -> the pickaxe budget is untouchable
  const short = swordCheck(fakeBot([it('iron_ingot', 1 + INGOT_RESERVE), it('stick', 2)]))
  assert.equal(short.due, false)
})

test('swordCheck: stone tier when cobble clears the reserve, wooden below it', () => {
  const stone = swordCheck(fakeBot([it('cobblestone', 2 + COBBLE_RESERVE), it('stick', 2)]))
  assert.equal(stone.tier, 'stone_sword')
  // below the cobble reserve the pockets still hold the wooden path
  const wood = swordCheck(fakeBot([it('cobblestone', 2 + COBBLE_RESERVE - 1), it('oak_planks', 3), it('stick', 1)]))
  assert.equal(wood.due, true)
  assert.equal(wood.tier, 'wooden_sword')
})

test('swordCheck: wooden tier from one-type planks with a stick in pocket', () => {
  const r = swordCheck(fakeBot([it('oak_planks', 2), it('stick', 1)]))
  assert.equal(r.due, true)
  assert.equal(r.tier, 'wooden_sword')
  // summed plank types lie: 1 oak + 1 birch is NOT 2 of one type
  const mixed = swordCheck(fakeBot([it('oak_planks', 1), it('birch_planks', 1), it('stick', 1)]))
  assert.equal(mixed.due, false)
})

test('swordCheck: with zero sticks the wooden tier wants 2 planks MORE (stick craft)', () => {
  const r = swordCheck(fakeBot([it('oak_planks', 4)]))
  assert.equal(r.due, true)
  assert.equal(r.tier, 'wooden_sword')
  const short = swordCheck(fakeBot([it('oak_planks', 3)]))
  assert.equal(short.due, false)
  // but 3 planks + a stone tier budget still craft the STONE sword (sticks from planks)
  const stoneViaPlanks = swordCheck(fakeBot([it('cobblestone', 2 + COBBLE_RESERVE), it('oak_planks', 2)]))
  assert.equal(stoneViaPlanks.due, true)
  assert.equal(stoneViaPlanks.tier, 'stone_sword')
})

test('swordCheck: junk-safe (no inventory, detached bot, null items)', () => {
  assert.equal(swordCheck({}).due, false)
  assert.equal(swordCheck({ inventory: { items: () => null } }).due, false)
  assert.equal(swordCheck(null).due, false)
  assert.match(swordCheck({}).reason, /unreadable|no sword|no stick/)
})

test('craftSword: not due -> skip without touching the seam', () => {
  let calls = 0
  const deps = { craftUntil: async () => { calls++; return true }, placeTable: async () => ({}) }
  const r = craftSword(fakeBot([it('wooden_sword')]), { deps })
  return r.then(res => {
    assert.equal(res.ok, false)
    assert.match(res.reason, /holds 1 sword/)
    assert.equal(calls, 0)
  })
})

test('craftSword: the flow is sticks-when-missing -> table -> sword, count verified', async () => {
  const calls = []
  const inv = [it('oak_planks', 4)] // mutable: the fake craft mutates it like a real craft would
  const bot = { inventory: { items: () => inv }, username: 'A2' }
  const take = (name, n) => {
    const i = inv.find(x => x.name === name)
    if (!i || i.count < n) return false
    i.count -= n
    return true
  }
  const deps = {
    craftUntil: async (b, item) => {
      calls.push(item)
      if (item === 'stick') {
        if (!take('oak_planks', 2)) return false
        inv.push(it('stick', 4))
        return true
      }
      if (item === 'wooden_sword') {
        if (!take('oak_planks', 2) || !take('stick', 1)) return false
        inv.push(it('wooden_sword', 1))
        return true
      }
      return false
    },
    placeTable: async () => ({ placed: true })
  }
  const res = await craftSword(bot, { deps })
  assert.deepEqual(calls, ['stick', 'wooden_sword'])
  assert.equal(res.ok, true)
  assert.equal(res.tier, 'wooden_sword')
  assert.equal(res.swords, 1)
})

test('craftSword: table fail -> ok:false with the reason, no craft attempted', async () => {
  const calls = []
  const deps = {
    craftUntil: async (bot, item) => { calls.push(item); return true },
    placeTable: async () => null
  }
  // (v0.305.0 restate) the pocket now holds NO table item and only 2 planks
  // of one type - the table rung refuses (4 split/short planks craft nothing),
  // so the legacy verdict stands and the craft never runs. The rung's own
  // happy/sad paths ride the tests below.
  const bot = fakeBot([it('oak_planks', 2), it('stick', 2)])
  const res = await craftSword(bot, { deps })
  assert.equal(res.ok, false)
  assert.match(res.reason, /no table/)
  assert.equal(calls.length, 0)
})

test('craftSword: craft "landed" but the count did not rise (phantom) -> ok:false', async () => {
  const deps = {
    craftUntil: async () => true, // reports success, inventory never changes
    placeTable: async () => ({})
  }
  const bot = fakeBot([it('oak_planks', 4), it('stick', 2)])
  const res = await craftSword(bot, { deps })
  assert.equal(res.ok, false)
  assert.match(res.tier || '', /wooden_sword/) // the tier was attempted
})

test('craftSword: stick craft fails -> ok:false, sword never attempted', async () => {
  const calls = []
  const deps = {
    craftUntil: async (bot, item) => { calls.push(item); return false },
    placeTable: async () => ({})
  }
  const bot = fakeBot([it('oak_planks', 4)]) // 0 sticks -> the stick craft must run first
  const res = await craftSword(bot, { deps })
  assert.deepEqual(calls, ['stick'])
  assert.equal(res.ok, false)
  assert.match(res.reason, /sticks/)
})

test('craftSword: never throws on a junk bot', async () => {
  const res = await craftSword(null, { deps: { craftUntil: async () => true, placeTable: async () => null } })
  assert.equal(res.ok, false)
})

// ---------------------------------------------------------------------------
// (v0.305.0) THE SWORD'S TABLE RUNG - face 36525740882 (the v0.302.0 field)
// measured 6x 'sword: failed (no table)' (F2 x4, F9, F10, F11) while the
// check read 'cobble available'/'planks available': placeTable finds or
// places a table item, never crafts one, and the pocket that holds sword
// materials usually holds no TABLE item. F9's failure landed between its
// second death and the zombie that killed it - the kitless bot then fought
// the pickaxe fight it lost. The rung: 4 planks of ONE type craft the table
// in the 2x2 grid (no table needed), the proven craftUntil call crafts it,
// placeTable retries ONCE. The mixed-stack trap stays named (the v0.102.0
// camp lesson: 4 split planks craft nothing).

test('swordTablePlan: the F9 datum - cobble in pocket, no table item, planks of one type', () => {
  const plan = swordTablePlan({ tableItem: 0, maxSameTypePlanks: 6 })
  assert.equal(plan.craftTable, true)
  assert.match(plan.why, /6 planks of one type/)
})

test('swordTablePlan: the 4-plank boundary is exact (the vanilla 2x2 recipe)', () => {
  assert.equal(swordTablePlan({ tableItem: 0, maxSameTypePlanks: SWORD_TABLE_PLANKS }).craftTable, true)
  assert.equal(swordTablePlan({ tableItem: 0, maxSameTypePlanks: SWORD_TABLE_PLANKS - 1 }).craftTable, false)
  assert.equal(SWORD_TABLE_PLANKS, 4)
})

test('swordTablePlan: a held table item defers to placeTable (it owns find-or-place)', () => {
  const plan = swordTablePlan({ tableItem: 1, maxSameTypePlanks: 6 })
  assert.equal(plan.craftTable, false)
  assert.match(plan.why, /placeTable owns it/)
})

test('swordTablePlan: the mixed-stack trap and junk refuse honestly', () => {
  // 2+2 split across types crafts nothing - the v0.102.0 lesson byte for byte
  assert.equal(swordTablePlan({ tableItem: 0, maxSameTypePlanks: 2 }).craftTable, false)
  // junk/negative reads are 0 -> the honest refusal, never a fire
  assert.equal(swordTablePlan({ tableItem: NaN, maxSameTypePlanks: NaN }).craftTable, false)
  assert.equal(swordTablePlan({ tableItem: -1, maxSameTypePlanks: -4 }).craftTable, false)
  assert.equal(swordTablePlan({}).craftTable, false)
  assert.match(swordTablePlan({ tableItem: 0, maxSameTypePlanks: 3 }).why, /3\/4/)
})

test('craftSword: the table rung crafts the table and the sword lands (the F9 cure)', async () => {
  const calls = []
  const deps = {
    craftUntil: async (bot, what) => {
      calls.push(what)
      bot.inventory.items().push({ name: what, count: 1 }) // the craft DELIVERS (the count-rose verify)
      return true
    },
    placeTable: async (bot) => bot.inventory.items().some(i => i.name === 'crafting_table') ? { name: 'crafting_table' } : null
  }
  const bot = fakeBot([it('cobblestone', 8), it('stick', 3), it('oak_planks', 6)]) // the F9/F2 pocket: sword materials + table planks, no table item
  const res = await craftSword(bot, { deps })
  assert.deepEqual(calls, ['crafting_table', 'stone_sword'], 'the rung crafts the table, then the tier')
  assert.equal(res.ok, true)
  assert.equal(res.tier, 'stone_sword')
})

test('craftSword: a failed rung keeps the legacy no-table verdict', async () => {
  const calls = []
  const deps = {
    craftUntil: async (bot, what) => { calls.push(what); return what !== 'crafting_table' },
    placeTable: async () => null // never finds a table - the rung's craft fails too, the legacy verdict stands
  }
  const bot = fakeBot([it('cobblestone', 8), it('stick', 3), it('oak_planks', 6)])
  const res = await craftSword(bot, { deps })
  assert.deepEqual(calls, ['crafting_table'], 'the rung fired and failed - the tier craft never runs')
  assert.equal(res.ok, false)
  assert.equal(res.reason, 'no table')
})

test('craftSword: a refused rung keeps the legacy no-table verdict byte for byte', async () => {
  let craftCalls = 0
  const deps = {
    craftUntil: async () => { craftCalls++; return true },
    placeTable: async () => null
  }
  const bot = fakeBot([it('cobblestone', 8), it('stick', 3), it('oak_planks', 2)]) // planks 2 < 4 - the rung refuses
  const res = await craftSword(bot, { deps })
  assert.equal(craftCalls, 0, 'the rung never crafts from a split pocket')
  assert.equal(res.ok, false)
  assert.equal(res.reason, 'no table')
})

test('wiring pin: the rung rides between the null table and the legacy failure', () => {
  const src = readFileSync(new URL('../../src/lib/arms.mjs', import.meta.url), 'utf8')
  // the consult sits AFTER the first placeTable null and BEFORE the legacy line
  assert.match(src, /const table = await tableOf\(bot\)\n    if \(!table\) \{\n      \/\/ \(v0\.305\.0\) THE SWORD'S TABLE RUNG/, 'the rung opens where the table read fails')
  assert.match(src, /swordTablePlan\(\{ tableItem: tableItemCount\(bot\), maxSameTypePlanks: countMaxPlankType\(bot\) \}\)/, 'the plan reads the live pocket')
  assert.match(src, /craftUntilFn\(bot, 'crafting_table', \{ times: 1, want: 1, tries: 2, log: step \}\)/, 'the table craft rides the proven craftUntil shape')
  assert.match(src, /step\(`sword: table crafted from planks \(\$\{plan\.why\}\)`\)/, 'the landing names itself on the sword key')
  const rungAt = src.indexOf('THE SWORD\'S TABLE RUNG')
  const legacyAt = src.indexOf("step('sword: no table reachable or placeable')")
  assert.ok(rungAt > -1 && legacyAt > rungAt, 'the legacy failure stays after the rung')
})
