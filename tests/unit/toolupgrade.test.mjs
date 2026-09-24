// Tests for the tool durability watch + upgrade chain (src/lib/toolupgrade.mjs).
// The decision matrix is pure inventory math - no server needed. The craft flow is
// exercised through the deps seam (fake craftUntil/placeTable) so the test pins the
// ORDER (sticks first, then table, then the pickaxe) without mocking mineflayer.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import Vec3 from 'vec3'
import {
  PICK_TIERS, PICK_MAX_DURABILITY, PICK_STICKS, IRON_PICK_INGOTS,
  pickTierOf, bestPickaxe, pickWear, upgradeCheck, upgradeTools, keepForIron,
  ironCommunePlan, withdrawIronCommune
} from '../../src/lib/toolupgrade.mjs'

// The commune's mock chest world - the fuel commons' proven shape
// (tests/unit/fuelbank.test.mjs mockChestWorld) retargeted at iron_ingot:
// findChest -> bot.findBlock, gotoSafe -> bot.pathfinder.goto, openChest ->
// a 27-slot chest window whose pocket rows ARE the bot inventory.
function ironItem (count = 1) {
  return { name: 'iron_ingot', count, type: 251, stackSize: 64 }
}

function mockCommuneWorld ({ chestItem = null, clickGhost = false, walkFails = false } = {}) {
  const chestSlots = Array.from({ length: 27 }, () => null)
  if (chestItem) chestSlots[0] = { ...chestItem }
  const pocket = Array.from({ length: 36 }, () => null)
  const slots = [...chestSlots, ...pocket]
  const chestBlock = { name: 'chest', position: new Vec3(3.5, 64, 3.5) }
  const world = {
    opened: 0,
    setPocket (n) {
      // slots (not pocket) is the live view: slots was SPREAD-built once, so
      // the pocket rows the bot inventory reads live at slots[27..]
      slots[27] = n > 0 ? ironItem(n) : null
    }
  }
  world.bot = {
    username: 'CommuneBot',
    entity: { position: { distanceTo: () => 4 } },
    inventory: { items: () => slots.slice(27).filter(Boolean) },
    pathfinder: { goto: async () => { if (walkFails) throw new Error('NoPath: no path') } },
    findBlock: ({ matching }) => chestItem || !walkFails ? (matching(chestBlock) ? chestBlock : null) : null,
    openChest: async () => {
      world.opened++
      return {
        slots,
        close () { this.closed = true }
      }
    },
    clickWindow: async (idx, button) => {
      if (clickGhost) return // the ghost-click lie: the packet dies quietly
      const s = slots[idx]
      if (button === 0) {
        if (s == null) { /* lift from empty: server refuses, view unchanged */ return }
        if (s.__cursor) return
        s.__cursor = true
        slots[idx] = null
        slots.__held = s
      } else if (button === 2) {
        const held = slots.__held
        if (held == null || held.count <= 0) return
        if (s && s.type === held.type && s.count < (s.stackSize ?? 64)) s.count += 1
        else if (s == null) slots[idx] = { ...held, count: 1 }
        else return
        held.count -= 1
      }
    }
  }
  // the cursor return click (button 0 onto the source slot while holding)
  const origClick = world.bot.clickWindow
  world.bot.clickWindow = async (idx, button) => {
    const held = slots.__held
    if (button === 0 && held != null) {
      if (slots[idx] == null) { slots[idx] = held; slots.__held = null; held.__cursor = false; return }
      if (slots[idx].type === held.type && slots[idx].count < (slots[idx].stackSize ?? 64)) {
        slots[idx].count = Math.min(slots[idx].stackSize ?? 64, slots[idx].count + held.count)
        slots.__held = null
        held.__cursor = false
        return
      }
      return // refusal: the held stack stays held (the diff reports it)
    }
    return origClick(idx, button)
  }
  return world
}

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

// ---- spare pickaxe policy (v0.10.2) ----
import { sparePickCheck, craftSparePickaxe } from '../../src/lib/toolupgrade.mjs'

test('sparePickCheck: due for a single-pick bot with shaft-waste materials', () => {
  const bot = fakeBot([
    it('stone_pickaxe', 1, { max: 131, used: 100 }),
    it('cobblestone', 5),
    it('stick', 2),
    it('crafting_table', 1)
  ])
  const chk = sparePickCheck(bot)
  assert.equal(chk.due, true)
  assert.equal(chk.tier, 'stone_pickaxe')
})

test('sparePickCheck: never fires when the bot already holds two picks', () => {
  const bot = fakeBot([
    it('stone_pickaxe', 1, { max: 131 }),
    it('wooden_pickaxe', 1, { max: 59 }),
    it('cobblestone', 30),
    it('stick', 8)
  ])
  const chk = sparePickCheck(bot)
  assert.equal(chk.due, false)
  assert.match(chk.reason, /holds 2/)
})

test('sparePickCheck: not due without materials - honest reason, no crash', () => {
  const bare = sparePickCheck(fakeBot([it('stone_pickaxe', 1, { max: 131 })]))
  assert.equal(bare.due, false)
  // sticks are checked first in craftablePickTier: a bot with neither sticks nor
  // planks reports the stick shortage before the pickaxe-material shortage
  assert.match(bare.reason, /no sticks and no planks/)

  const noSticks = sparePickCheck(fakeBot([it('stone_pickaxe', 1, { max: 131 }), it('cobblestone', 9)]))
  assert.equal(noSticks.due, false)
  assert.match(noSticks.reason, /no sticks and no planks/)

  const junk = sparePickCheck(fakeBot(null))
  assert.equal(junk.due, false)
})

test('sparePickCheck: wooden tier when cobble is out but planks of one type exist', () => {
  const bot = fakeBot([
    it('stone_pickaxe', 1, { max: 131 }),
    it('oak_planks', 6),
    it('stick', 4),
    it('crafting_table', 1)
  ])
  const chk = sparePickCheck(bot)
  assert.equal(chk.due, true)
  assert.equal(chk.tier, 'wooden_pickaxe')
})

test('sparePickCheck: plank materials need ONE type - the 12-type sum lies (v0.10.3)', () => {
  // 3 singles across 3 tree types: the all-types sum says 3, the recipe says no
  const fragmented = fakeBot([
    it('stone_pickaxe', 1, { max: 131 }),
    it('oak_planks', 1), it('birch_planks', 1), it('spruce_planks', 1),
    it('stick', 4), it('crafting_table', 1)
  ])
  const chk = sparePickCheck(fragmented)
  assert.equal(chk.due, false)
  assert.match(chk.reason, /ONE type|no pickaxe materials/)
  // 3 planks of the same tree: the recipe is craftable
  const solid = fakeBot([
    it('stone_pickaxe', 1, { max: 131 }),
    it('oak_planks', 3),
    it('stick', 4), it('crafting_table', 1)
  ])
  const ok = sparePickCheck(solid)
  assert.equal(ok.due, true)
  assert.equal(ok.tier, 'wooden_pickaxe')
  // sticks from planks also need one type: 2 singles cannot make the 2 sticks
  const stickless = fakeBot([
    it('stone_pickaxe', 1, { max: 131 }),
    it('oak_planks', 1), it('birch_planks', 1),
    it('crafting_table', 1)
  ])
  const noStickPath = sparePickCheck(stickless)
  assert.equal(noStickPath.due, false)
})

// ---- craftSparePickaxe mechanics (v0.16.2: sticks top-up from planks) ----

test('craftSparePickaxe: zero sticks -> sticks crafted first, then the pick (v0.16.2)', async () => {
  // fleet #121: F6 held 12 oak planks and 0 sticks - 'spare pick due: spare
  // (planks available)' went straight into 'no craftable recipe variant'
  const items = [
    it('stone_pickaxe', 1, { max: 131 }),
    it('cobblestone', 9),
    it('oak_planks', 6)
  ]
  const calls = []
  const res = await craftSparePickaxe(fakeBot(items), {
    log: () => {},
    deps: {
      craftUntil: async (bot, item) => {
        calls.push(item)
        if (item === 'stick') { items.push(it('stick', 4)); return true }
        if (item === 'stone_pickaxe') { items.push(it('stone_pickaxe', 1, { max: 131 })); return true }
        return false
      },
      placeTable: async () => ({ name: 'crafting_table' })
    }
  })
  assert.deepEqual(calls, ['stick', 'stone_pickaxe'], 'the stick top-up must precede the pick craft')
  assert.equal(res.ok, true)
  assert.equal(res.tier, 'stone_pickaxe')
  assert.equal(res.picks, 2)
})

test('craftSparePickaxe: a failed stick top-up aborts BEFORE the table is placed', async () => {
  const items = [
    it('stone_pickaxe', 1, { max: 131 }),
    it('cobblestone', 9),
    it('oak_planks', 6)
  ]
  let tablePlaced = false
  const res = await craftSparePickaxe(fakeBot(items), {
    log: () => {},
    deps: {
      craftUntil: async () => false, // phantom/stuck craft: nothing lands
      placeTable: async () => { tablePlaced = true; return null }
    }
  })
  assert.equal(tablePlaced, false, 'no table may be placed when the sticks never land')
  assert.equal(res.ok, false)
  assert.match(res.reason, /no sticks and no planks/)
})

test('craftSparePickaxe: a wooden spare needs 5 one-type planks when sticks are zero', async () => {
  // 2 planks convert into the 2 sticks, the recipe eats 3 more: 4 of one type
  // cannot unlock both, so the plan must refuse BEFORE burning anything
  const items = [
    it('stone_pickaxe', 1, { max: 131 }),
    it('oak_planks', 4)
  ]
  const calls = []
  let tablePlaced = false
  const res = await craftSparePickaxe(fakeBot(items), {
    log: () => {},
    deps: {
      craftUntil: async (bot, item) => { calls.push(item); return true },
      placeTable: async () => { tablePlaced = true; return { name: 'crafting_table' } }
    }
  })
  assert.deepEqual(calls, [], 'the stick conversion must be refused before any craft')
  assert.equal(tablePlaced, false)
  assert.equal(res.ok, false)
  assert.match(res.reason, /not enough planks to make sticks/)
})

test('craftSparePickaxe: sticks in the pocket skip the top-up entirely', async () => {
  const items = [
    it('stone_pickaxe', 1, { max: 131 }),
    it('cobblestone', 5),
    it('stick', 2)
  ]
  const calls = []
  const res = await craftSparePickaxe(fakeBot(items), {
    log: () => {},
    deps: {
      craftUntil: async (bot, item) => {
        calls.push(item)
        if (item === 'stone_pickaxe') { items.push(it('stone_pickaxe', 1, { max: 131 })); return true }
        return false
      },
      placeTable: async () => ({ name: 'crafting_table' })
    }
  })
  assert.deepEqual(calls, ['stone_pickaxe'], 'no stick craft may run when 2 sticks are already held')
  assert.equal(res.ok, true)
})


// ------------------------------------------- (v0.106.0) THE PLANK RUNG
// run94 (35841864758) killed the tool lane 8 times with 'no craftable recipe
// variant' while the pockets held LOGS (F1 oak_log:5, F10 logs=3): every
// stick/table/pick recipe consumes PLANKS and the mid-run lanes never converted.
import { craftPlanksFromLogs } from '../../src/bots/tools.mjs'

test('plank rung: converts the DOMINANT log type until the need is met', async () => {
  const items = [it('oak_log', 5), it('birch_log', 2)]
  const bot = fakeBot(items)
  const calls = []
  const res = await craftPlanksFromLogs(bot, {
    need: 4,
    log: () => {},
    deps: {
      craftUntil: async (b, name) => {
        calls.push(name)
        items.push(it('oak_planks', 4))
        return true
      }
    }
  })
  assert.equal(res.ok, true)
  assert.equal(res.plankName, 'oak_planks', 'oak 5 > birch 2 - the dominant type converts')
  assert.equal(calls.length, 1, 'one craft = 4 planks: 0 -> 4 meets need 4 immediately')
  assert.equal(res.made, 4)
})

test('plank rung: planks already sufficient is an honest ok with zero crafts', async () => {
  const bot = fakeBot([it('oak_log', 5), it('oak_planks', 4)])
  const calls = []
  const res = await craftPlanksFromLogs(bot, {
    need: 4,
    deps: { craftUntil: async (b, name) => { calls.push(name); return true } }
  })
  assert.equal(res.ok, true)
  assert.equal(res.made, 0)
  assert.deepEqual(calls, [])
})

test('plank rung: no logs is a named false, nothing is attempted', async () => {
  const bot = fakeBot([it('cobblestone', 9)])
  const calls = []
  const res = await craftPlanksFromLogs(bot, {
    need: 4,
    deps: { craftUntil: async (b, name) => { calls.push(name); return true } }
  })
  assert.equal(res.ok, false)
  assert.match(res.why, /no logs/)
  assert.deepEqual(calls, [])
})

test('plank rung: a failed conversion craft reads the REAL pocket (fell short)', async () => {
  const items = [it('oak_log', 1)]
  const bot = fakeBot(items)
  const res = await craftPlanksFromLogs(bot, {
    need: 8,
    deps: { craftUntil: async () => false }
  })
  assert.equal(res.ok, false)
  assert.match(res.why, /fell short/)
})

test('plank rung: junk inventory shapes never throw', async () => {
  const res = await craftPlanksFromLogs(null, { need: 4 })
  assert.equal(res.ok, false)
  assert.match(res.why, /error|no logs/)
})

test('upgradeTools: the plank rung converts logs and the upgrade lands (run94 F1 class)', async () => {
  // F1's real shape: the check fired honestly ('cobble available' - the pocket
  // read 2 one-type planks at check time), but the REAL craft path found no
  // craftable pocket (the 26.2 stale-mirror divergence) and starved - with
  // oak_log:5 still in the pocket. The mock array models the CHECK read; the
  // craft mock models the real craft path. The rung converts and cures.
  const items = [it('wooden_pickaxe', 1, { max: 59, used: 50 }), it('cobblestone', 10), it('oak_planks', 2), it('oak_log', 5)]
  const bot = fakeBot(items)
  const calls = []
  let stickFailed = false
  const res = await upgradeTools(bot, {
    log: () => {},
    deps: {
      craftUntil: async (b, name, opts = {}) => {
        calls.push(name)
        if (name === 'stick') {
          if (!stickFailed) { stickFailed = true; return false }
          items.push(it('stick', 4))
          return true
        }
        if (name === 'crafting_table') { items.push(it('crafting_table', 1)); return true }
        if (name === 'stone_pickaxe') { items.push(it('stone_pickaxe', 1, { max: 131 })); return true }
        return false
      },
      planksFrom: async (b, { need }) => {
        calls.push(`planksFrom(${need})`)
        items.push(it('oak_planks', 4))
        return { ok: true, plankName: 'oak_planks', made: 4, why: 'converted' }
      },
      placeTable: async () => ({ name: 'crafting_table' })
    }
  })
  assert.equal(res.ok, true, `detail: ${res.detail}`)
  assert.equal(res.tier, 'stone_pickaxe')
  // the order IS the cure: stick craft starves -> rung converts -> stick retries -> table -> pick
  // (the table craft succeeds on the first try here, so the table rung never consults)
  assert.deepEqual(calls, ['stick', 'planksFrom(2)', 'stick', 'crafting_table', 'stone_pickaxe'])
})

test('upgradeTools: the table rung converts when the spare-table craft starves (run94 F2 class)', async () => {
  // F2: 'craft crafting_table: no craftable recipe variant' -> 'spare table:
  // FAILED' -> 'tool upgrade: failed -> none (no table material)'. Logs convert,
  // the table craft retries once, the upgrade completes.
  const items = [it('wooden_pickaxe', 1, { max: 59, used: 50 }), it('cobblestone', 10), it('stick', 4), it('oak_log', 2)]
  const bot = fakeBot(items)
  const calls = []
  let tableFailed = false
  const res = await upgradeTools(bot, {
    log: () => {},
    deps: {
      craftUntil: async (b, name) => {
        calls.push(name)
        if (name === 'crafting_table') {
          if (!tableFailed) { tableFailed = true; return false }
          items.push(it('crafting_table', 1))
          return true
        }
        if (name === 'stone_pickaxe') { items.push(it('stone_pickaxe', 1, { max: 131 })); return true }
        return false
      },
      planksFrom: async (b, { need }) => {
        calls.push(`planksFrom(${need})`)
        items.push(it('oak_planks', 4))
        return { ok: true, plankName: 'oak_planks', made: 4, why: 'converted' }
      },
      placeTable: async () => ({ name: 'crafting_table' })
    }
  })
  assert.equal(res.ok, true, `detail: ${res.detail}`)
  assert.equal(res.tier, 'stone_pickaxe')
  assert.deepEqual(calls, ['crafting_table', 'planksFrom(4)', 'crafting_table', 'stone_pickaxe'])
})

test('upgradeTools: a failed rung keeps the legacy honest verdict (no planks for sticks, no logs)', async () => {
  // the check fires honestly (2 one-type planks unlock sticks, cobble >= 3),
  // the stick craft starves, the rung finds no logs - the legacy verdict stands.
  const items = [it('wooden_pickaxe', 1, { max: 59, used: 50 }), it('cobblestone', 10), it('oak_planks', 2)]
  const bot = fakeBot(items)
  const calls = []
  const res = await upgradeTools(bot, {
    log: () => {},
    deps: {
      craftUntil: async (b, name) => { calls.push(name); return false },
      planksFrom: async () => ({ ok: false, plankName: null, made: 0, why: 'no logs' }),
      placeTable: async () => ({ name: 'crafting_table' })
    }
  })
  assert.equal(res.ok, false)
  assert.match(res.detail, /cannot make sticks/)
  assert.deepEqual(calls, ['stick'], 'exactly one stick attempt, no table or pick crafts after it')
})

test('craftSparePickaxe: the rung unlocks the spare when one-type planks fall short (run94 F10 class)', async () => {
  // F10: main pick healthy, 3 one-type planks (check read 'planks available'),
  // zero sticks, logs in the pocket. Wooden spare needs 5 one-type planks.
  const items = [it('stone_pickaxe', 1, { max: 131 }), it('oak_planks', 3), it('oak_log', 3)]
  const bot = fakeBot(items)
  const calls = []
  const res = await craftSparePickaxe(bot, {
    log: () => {},
    deps: {
      craftUntil: async (b, name) => {
        calls.push(name)
        if (name === 'stick') { items.push(it('stick', 4)); return true }
        if (name === 'wooden_pickaxe') { items.push(it('wooden_pickaxe', 1, { max: 59 })); return true }
        return false
      },
      planksFrom: async (b, { need }) => {
        calls.push(`planksFrom(${need})`)
        items.push(it('oak_planks', 2))
        return { ok: true, plankName: 'oak_planks', made: 2, why: 'converted' }
      },
      placeTable: async () => ({ name: 'crafting_table' })
    }
  })
  assert.equal(res.ok, true, `reason: ${res.reason}`)
  assert.equal(res.tier, 'wooden_pickaxe')
  assert.deepEqual(calls, ['planksFrom(5)', 'stick', 'wooden_pickaxe'])
})

test('craftSparePickaxe: a failed rung keeps the legacy skip verdict byte for byte', async () => {
  const items = [it('stone_pickaxe', 1, { max: 131 }), it('oak_planks', 3)]
  const bot = fakeBot(items)
  const calls = []
  const res = await craftSparePickaxe(bot, {
    log: () => {},
    deps: {
      craftUntil: async (b, name) => { calls.push(name); return true },
      planksFrom: async () => ({ ok: false, plankName: null, made: 0, why: 'no logs' }),
      placeTable: async () => ({ name: 'crafting_table' })
    }
  })
  assert.equal(res.ok, false)
  assert.match(res.reason, /not enough planks to make sticks/)
  assert.deepEqual(calls, [], 'no craft may run when the conversion fails and the guard refuses')
})

// ------------------------------------------------------- THE IRON COMMUNE
// (v0.146.0) run49 (36008932449) smelted the fleet's first iron ingots (F18 1
// + F3 2) and still ended iron=0 - the thin veins split the output 1-2 per
// bot, the chest pools the rest, and no leg ever completed a set. The commune
// plan is pure inventory math; the withdraw walk rides the fuel commons'
// proven machinery shape through a mock chest world.

test('ironCommunePlan: the set-completion matrix', () => {
  const p = ironCommunePlan
  assert.equal(p({ pocketCount: 0, chestCount: 3 }).need, 3, 'empty pocket, full chest: the whole set')
  assert.equal(p({ pocketCount: 1, chestCount: 10 }).need, 2, '1 held, chest surplus: take 2')
  assert.equal(p({ pocketCount: 2, chestCount: 2 }).need, 1, '2 held, chest 2: take 1 (the run49 F3 shape)')
  assert.equal(p({ pocketCount: 2, chestCount: 1 }).need, 1, 'a partial chest funds a partial withdraw')
  assert.equal(p({ pocketCount: 2, chestCount: 1 }).need, 1, 'never overdraw past the goal')
  assert.equal(p({ pocketCount: 0, chestCount: 2 }).need, 2, 'chest short of the goal still funds what it has')
  assert.equal(p({ pocketCount: 3, chestCount: 10 }).need, 0, 'the set is complete - craft, do not withdraw')
  assert.equal(p({ pocketCount: 5, chestCount: 1 }).need, 0, 'over-complete reads 0')
  assert.equal(p({ pocketCount: 2, chestCount: 0 }).need, 0, 'an empty chest funds nothing')
  assert.equal(p({ pocketCount: 1, chestCount: -3 }).need, 0, 'junk chest reads 0')
  assert.equal(p({ pocketCount: -1, chestCount: 3 }).need, 0, 'junk pocket reads 0')
  assert.equal(p({ pocketCount: NaN, chestCount: 3 }).need, 0, 'NaN pocket reads 0')
  assert.equal(p({ pocketCount: 1, chestCount: 'junk' }).need, 0, 'string chest reads 0')
  assert.equal(p({ pocketCount: 1, chestCount: 3, target: 0 }).need, 0, 'junk target reads 0')
  assert.equal(p({ pocketCount: 1, chestCount: 3, target: NaN }).need, 0, 'NaN target reads 0')
  assert.equal(p({ pocketCount: 4, chestCount: 6, target: 4 }).need, 0, 'a custom target respects the completion rule')
  assert.equal(p({ pocketCount: 2, chestCount: 6, target: 4 }).need, 2, 'a custom target scales the gap')
  assert.equal(p({ pocketCount: 2.5, chestCount: 6 }).need, 1, 'fractional pockets floor the gap')
})

test('withdrawIronCommune: junk bots never touch the world', async () => {
  const world = mockCommuneWorld({ chestItem: ironItem(8) })
  for (const held of [0, 3, 5]) {
    world.setPocket(held)
    const res = await withdrawIronCommune(world.bot, {})
    assert.equal(res.taken, 0)
    assert.equal(world.opened, 0, `pocket ${held}: no chest window ever opened`)
  }
})

test('withdrawIronCommune: the run49 F3 shape - 2 held, chest 1, the set completes', async () => {
  const world = mockCommuneWorld({ chestItem: ironItem(1) })
  world.setPocket(2)
  const res = await withdrawIronCommune(world.bot, {})
  assert.equal(res.taken, 1)
  assert.equal(res.pocketNow, 3)
  assert.equal(res.reason, 'ok')
  assert.equal(world.opened, 1)
})

test('withdrawIronCommune: an empty chest is excluded and reported honestly', async () => {
  const world = mockCommuneWorld({ chestItem: null })
  world.setPocket(1)
  const res = await withdrawIronCommune(world.bot, {})
  assert.equal(res.taken, 0)
  assert.equal(res.reason, 'no ingot reached the pocket')
})

test('withdrawIronCommune: ghost clicks report the lie, never throw', async () => {
  const world = mockCommuneWorld({ chestItem: ironItem(8), clickGhost: true })
  world.setPocket(1)
  const res = await withdrawIronCommune(world.bot, {})
  assert.equal(res.taken, 0)
  assert.equal(res.reason, 'no ingot reached the pocket')
})

test('withdrawIronCommune: a walk failure tries the next chest, the verdict stays honest', async () => {
  const world = mockCommuneWorld({ chestItem: ironItem(8), walkFails: true })
  world.setPocket(1)
  const res = await withdrawIronCommune(world.bot, {})
  assert.equal(res.taken, 0)
  assert.equal(world.opened, 0, 'a refused walk never opens a window')
})
