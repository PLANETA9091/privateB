// Tests for the melee arms chain (src/lib/arms.mjs).
// The decision matrix is pure inventory math - no server needed. The craft flow
// is exercised through the deps seam (fake craftUntil/placeTable) so the test
// pins the ORDER (sticks first, then table, then the sword) without mocking
// mineflayer - the same shape the toolupgrade tests use.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  SWORD_TIERS, SWORD_STICKS, SWORD_MATERIAL_COST, COBBLE_RESERVE, INGOT_RESERVE,
  countSwords, swordCheck, craftSword
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
  const bot = fakeBot([it('oak_planks', 4), it('stick', 2)])
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
