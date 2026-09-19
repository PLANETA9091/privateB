// Tests for the tool durability watch + upgrade chain (src/lib/toolupgrade.mjs).
// The decision matrix is pure inventory math - no server needed. The craft flow is
// exercised through the deps seam (fake craftUntil/placeTable) so the test pins the
// ORDER (sticks first, then table, then the pickaxe) without mocking mineflayer.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  PICK_TIERS, PICK_MAX_DURABILITY, PICK_STICKS, IRON_PICK_INGOTS,
  pickTierOf, bestPickaxe, pickWear, upgradeCheck, upgradeTools, keepForIron
} from '../../src/lib/toolupgrade.mjs'

// A fake inventory item shaped like mineflayer's Item (name/count/maxDurability/
// durabilityUsed are all the decision code reads).
function it (name, count = 1, dur = {}) {
  return { name, count, maxDurability: dur.max, durabilityUsed: dur.used ?? 0 }
}

function fakeBot (items) {
  return { inventory: { items: () => items }, username: 'T1' }
}

test('tier ladder: the constants agree (every tier has a durability entry)', () => {
  for (const t of PICK_TIERS) assert.ok(PICK_MAX_DURABILITY[t] > 0, `${t} needs maxDurability`)
  assert.ok(PICK_TIERS.indexOf('wooden_pickaxe') < PICK_TIERS.indexOf('stone_pickaxe'))
  assert.ok(PICK_TIERS.indexOf('stone_pickaxe') < PICK_TIERS.indexOf('iron_pickaxe'))
})

test('pickTierOf: -1 for non-pickaxes, index for pickaxes', () => {
  assert.equal(pickTierOf('stone_pickaxe'), 1)
  assert.equal(pickTierOf('wooden_shovel'), -1)
  assert.equal(pickTierOf('iron_ingot'), -1)
})

test('bestPickaxe: picks the BEST tier among mixed picks and ignores other tools', () => {
  const bot = fakeBot([it('wooden_pickaxe', 1, { max: 59 }), it('stone_pickaxe', 1, { max: 131 }), it('iron_shovel')])
  const best = bestPickaxe(bot)
  assert.equal(best.tier, 1)
  assert.equal(best.item.name, 'stone_pickaxe')
})

test('bestPickaxe: null when there is no pickaxe', () => {
  assert.equal(bestPickaxe(fakeBot([it('iron_shovel'), it('oak_log', 3)])), null)
})

test('pickWear: left = max - used; null when durability data is missing', () => {
  const w = pickWear(fakeBot([it('stone_pickaxe', 1, { max: 131, used: 40 })]))
  assert.equal(w.left, 91)
  assert.equal(w.max, 131)
  // an item without maxDurability (e.g. a bare fake) -> no wear guess
  assert.equal(pickWear(fakeBot([{ name: 'stone_pickaxe', count: 1 }])), null)
})

test('upgradeCheck: healthy pickaxe + no materials -> not due', () => {
  const r = upgradeCheck(fakeBot([it('stone_pickaxe', 1, { max: 131, used: 0 })]))
  assert.equal(r.due, false)
})

test('upgradeCheck: a MISSING pickaxe is NOT ours - recovery/bootstrap owns it', () => {
  const r = upgradeCheck(fakeBot([it('cobblestone', 12), it('oak_planks', 8), it('stick', 4)]))
  assert.equal(r.due, false)
  assert.match(r.reason, /recovery/)
})

test('upgradeCheck: worn stone pick + cobble -> replace with stone (same tier counts)', () => {
  const bot = fakeBot([it('stone_pickaxe', 1, { max: 131, used: 125 }), it('cobblestone', 10), it('stick', 4)])
  const r = upgradeCheck(bot)
  assert.equal(r.due, true)
  assert.equal(r.worn, true)
  assert.equal(r.target, 'stone_pickaxe')
})

test('upgradeCheck: worn pick + NOTHING craftable -> honest not-due (no infinite retries)', () => {
  const bot = fakeBot([it('stone_pickaxe', 1, { max: 131, used: 130 })])
  const r = upgradeCheck(bot)
  assert.equal(r.due, false)
  assert.match(r.reason, /nothing to craft/)
})

test('upgradeCheck: iron opportunity - stone pick + 3 ingots -> craft iron', () => {
  const bot = fakeBot([it('stone_pickaxe', 1, { max: 131, used: 20 }), it('iron_ingot', IRON_PICK_INGOTS), it('stick', PICK_STICKS)])
  const r = upgradeCheck(bot)
  assert.equal(r.due, true)
  assert.equal(r.worn, false)
  assert.equal(r.target, 'iron_pickaxe')
})

test('upgradeCheck: worn wooden pick prefers the BEST craftable (cobble -> stone, not another wooden)', () => {
  const bot = fakeBot([it('wooden_pickaxe', 1, { max: 59, used: 55 }), it('cobblestone', 10), it('stick', 4)])
  const r = upgradeCheck(bot)
  assert.equal(r.due, true)
  assert.equal(r.target, 'stone_pickaxe')
})

test('upgradeCheck: healthy wooden pick + plenty cobble -> upgrade due (stone unlocks iron ore drops)', () => {
  const bot = fakeBot([it('wooden_pickaxe', 1, { max: 59, used: 5 }), it('cobblestone', 12), it('stick', 4)])
  const r = upgradeCheck(bot)
  assert.equal(r.due, true)
  assert.equal(r.target, 'stone_pickaxe')
})

test('upgradeCheck: cobble RESERVE - healthy wooden pick with only 3 cobble waits (furnace budget first)', () => {
  const bot = fakeBot([it('wooden_pickaxe', 1, { max: 59, used: 5 }), it('cobblestone', 3), it('stick', 4)])
  const r = upgradeCheck(bot)
  assert.equal(r.due, false)
  assert.match(r.reason, /cobble/)
})

test('upgradeCheck: sticks missing but planks present -> still due (sticks are craftable mid-flow)', () => {
  const bot = fakeBot([it('wooden_pickaxe', 1, { max: 59, used: 5 }), it('cobblestone', 12), it('oak_planks', 6)])
  const r = upgradeCheck(bot)
  assert.equal(r.due, true)
  assert.equal(r.target, 'stone_pickaxe')
})

test('upgradeCheck: no sticks and no planks -> not due (craft would burn the table trip)', () => {
  const bot = fakeBot([it('wooden_pickaxe', 1, { max: 59, used: 5 }), it('cobblestone', 12)])
  const r = upgradeCheck(bot)
  assert.equal(r.due, false)
})

test('upgradeCheck: iron pick healthy + ingots -> NOT due (iron is the top tier; surplus is bank stock)', () => {
  const bot = fakeBot([it('iron_pickaxe', 1, { max: 250, used: 30 }), it('iron_ingot', 6), it('stick', 4)])
  const r = upgradeCheck(bot)
  assert.equal(r.due, false)
})

test('upgradeCheck: worn iron pick without ingots falls back to cobble/stone replacement', () => {
  const bot = fakeBot([it('iron_pickaxe', 1, { max: 250, used: 245 }), it('cobblestone', 10), it('stick', 4)])
  const r = upgradeCheck(bot)
  assert.equal(r.due, true)
  assert.equal(r.target, 'stone_pickaxe')
})

test('upgradeTools flow: sticks crafted FIRST, then a spare table, then the target pickaxe', async () => {
  const calls = []
  const bot = fakeBot([
    it('wooden_pickaxe', 1, { max: 59, used: 55 }),
    it('cobblestone', 12),
    it('oak_planks', 6)
  ])
  const deps = {
    craftUntil: async (b, name, opts) => {
      calls.push(['craft', name, opts.table ? 'table' : 'no-table'])
      if (name === 'stick') bot.inventory.items().push(it('stick', 4))
      else if (name === 'crafting_table') bot.inventory.items().push(it('crafting_table', 1))
      else bot.inventory.items().push(it(name, 1, { max: 131 }))
      return true
    },
    placeTable: async b => { calls.push(['table']); return { name: 'crafting_table' } }
  }
  const res = await upgradeTools(bot, { deps })
  assert.equal(res.ok, true)
  assert.equal(res.tier, 'stone_pickaxe')
  // the SPARE TABLE: ensureTools leaves its table behind, so a mid-run bot crafts its
  // own (live diag: 'no crafting table placeable' with 12 planks in the pockets)
  assert.deepEqual(calls, [['craft', 'stick', 'no-table'], ['craft', 'crafting_table', 'no-table'], ['table'], ['craft', 'stone_pickaxe', 'table']])
})

test('upgradeTools flow: sticks already enough + table item held -> no 2x2 crafts, straight to table + pickaxe', async () => {
  const calls = []
  const bot = fakeBot([it('stone_pickaxe', 1, { max: 131, used: 20 }), it('iron_ingot', 3), it('stick', 2), it('crafting_table', 1)])
  const deps = {
    craftUntil: async (b, name, opts) => { calls.push(name); bot.inventory.items().push(it(name, 1, { max: 250 })); return true },
    placeTable: async b => { calls.push('table'); return { name: 'crafting_table' } }
  }
  const res = await upgradeTools(bot, { deps })
  assert.equal(res.ok, true)
  assert.equal(res.tier, 'iron_pickaxe')
  assert.deepEqual(calls, ['table', 'iron_pickaxe'])
})

test('upgradeTools flow: not due -> returns without touching a table', async () => {
  let touched = false
  const bot = fakeBot([it('stone_pickaxe', 1, { max: 131, used: 0 })])
  const res = await upgradeTools(bot, { deps: { placeTable: async () => { touched = true; return {} } } })
  assert.equal(res.ok, false)
  assert.match(res.detail, /not due/)
  assert.equal(touched, false)
})

test('upgradeTools flow: phantom craft (count never rises) -> ok:false, tier null', async () => {
  const bot = fakeBot([it('wooden_pickaxe', 1, { max: 59, used: 55 }), it('cobblestone', 12), it('stick', 4), it('crafting_table', 1)])
  const deps = {
    craftUntil: async () => true, // resolved but NOTHING landed in the inventory
    placeTable: async () => ({ name: 'crafting_table' })
  }
  const res = await upgradeTools(bot, { deps })
  assert.equal(res.ok, false)
  assert.equal(res.tier, null)
})

test('upgradeTools flow: no table item AND spare-table craft fails -> honest abort (no placeTable trip)', async () => {
  let placed = false
  const bot = fakeBot([it('wooden_pickaxe', 1, { max: 59, used: 55 }), it('cobblestone', 12), it('stick', 4), it('oak_planks', 2)])
  const res = await upgradeTools(bot, {
    deps: {
      craftUntil: async () => false,
      placeTable: async () => { placed = true; return {} }
    }
  })
  assert.equal(res.ok, false)
  assert.match(res.detail, /spare table/)
  assert.equal(placed, false)
})

test('upgradeTools flow: no table placeable (table item held) -> ok:false with detail', async () => {
  const bot = fakeBot([it('wooden_pickaxe', 1, { max: 59, used: 55 }), it('cobblestone', 12), it('stick', 4), it('crafting_table', 1)])
  const res = await upgradeTools(bot, { deps: { placeTable: async () => null } })
  assert.equal(res.ok, false)
  assert.match(res.detail, /table/)
})

test('upgradeTools flow: stick craft failed AND no sticks -> aborts before the table', async () => {
  let tableTouched = false
  const bot = fakeBot([it('wooden_pickaxe', 1, { max: 59, used: 55 }), it('cobblestone', 12), it('oak_planks', 6)])
  const res = await upgradeTools(bot, {
    deps: {
      craftUntil: async () => false,
      placeTable: async () => { tableTouched = true; return {} }
    }
  })
  assert.equal(res.ok, false)
  assert.match(res.detail, /sticks/)
  assert.equal(tableTouched, false)
})

test('keepForIron: raw iron/ingots kept until the iron pickaxe exists, banked after', () => {
  const holding = fakeBot([it('stone_pickaxe', 1, { max: 131 }), it('iron_ingot', 2)])
  assert.deepEqual(keepForIron(holding), ['iron_ingot', 'raw_iron'])
  const upgraded = fakeBot([it('iron_pickaxe', 1, { max: 250 }), it('iron_ingot', 5)])
  assert.deepEqual(keepForIron(upgraded), [])
})

test('upgradeTools DELEGATION: healthy wooden -> stone routes to the tools.mjs flow (shovel bonus, fragmented planks)', async () => {
  const bot = fakeBot([it('wooden_pickaxe', 1, { max: 59, used: 5 }), it('cobblestone', 12), it('stick', 4)])
  let delegated = false
  const res = await upgradeTools(bot, {
    deps: {
      toolsUpgrade: async (b, opts) => { delegated = true; return { ok: true, kit: 'stone_pickaxe,stone_shovel' } }
    }
  })
  assert.equal(delegated, true)
  assert.equal(res.ok, true)
  assert.equal(res.tier, 'stone_pickaxe')
  assert.match(res.detail, /stone_shovel/)
})

test('upgradeTools NO delegation for a WORN stone pick (their early "already stone+" return would skip it)', async () => {
  const bot = fakeBot([it('stone_pickaxe', 1, { max: 131, used: 125 }), it('cobblestone', 12), it('stick', 4), it('crafting_table', 1)])
  let delegated = false
  const res = await upgradeTools(bot, {
    deps: {
      toolsUpgrade: async () => { delegated = true; return { ok: true, kit: 'already stone+' } },
      craftUntil: async (b, name) => { bot.inventory.items().push(it(name, 1, { max: 131 })); return true },
      placeTable: async () => ({ name: 'crafting_table' })
    }
  })
  assert.equal(delegated, false)
  assert.equal(res.ok, true)
  assert.equal(res.tier, 'stone_pickaxe')
})
