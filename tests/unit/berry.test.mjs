// THE HEDGE PANTRY (v0.528.0) - the scout's first survival legs.
// The gather leg (berry.mjs + the scout's createBerryStop) and the eating
// leg (the 0.511.0 ration bytes on the second bot) are driven here with a
// mock bot - no server, exactly the createScan/createPatrol contract.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { Vec3 } from 'vec3'
import { REGEN_HUNGER_FLOOR, RATION_OPTS } from '../../src/lib/ration.mjs'
import {
  BERRY_BUSH, BERRY_ITEM, SCOUT_HUNGER_BAND, BERRY_POCKET_CAP, BERRY_REACH, BERRY_COUNT, BERRY_PICKUP_MS,
  matureBush, pocketBerries, berryHarvestDue, pickBush
} from '../../src/lib/berry.mjs'
import { createBerryStop } from '../../src/bots/scout.mjs'

const bush = (x, y, z, age = 3) => ({ name: BERRY_BUSH, position: new Vec3(x, y, z), properties: { age: String(age) } })

function makeBerryBot ({ food = 12, items = [], blocks = [], flyTravel = null, activateThrows = null } = {}) {
  const bot = {
    food,
    entity: { position: new Vec3(0.5, 64, 0.5) },
    inventory: { items: () => items.concat(bot.pendingPickup ? [{ name: BERRY_ITEM, count: bot.pendingPickup }] : []) },
    flyTravel,
    findBlocksCalls: 0,
    findBlocks: ({ matching, count }) => {
      bot.findBlocksCalls++
      return blocks.filter(b => matching({ name: b.name })).slice(0, count ?? Infinity)
    },
    blockAt: p => blocks.find(b => b.position.x === p.x && b.position.y === p.y && b.position.z === p.z) ?? null,
    activateCalls: [],
    activateBlock: async block => {
      if (activateThrows) throw activateThrows
      bot.activateCalls.push(block.position)
      // the vanilla shape: a mature bush's drops land in the pocket
      const b = blocks.find(bb => bb.position === block.position)
      if (b && matureBush(b)) bot.pendingPickup = (bot.pendingPickup ?? 0) + 2
    },
    gotoCalls: 0,
    pathfinder: {
      goto: async goal => {
        bot.gotoCalls++
        // the walk completes: the bot stands at the bush
        bot.entity.position = new Vec3(goal.x ?? bot.entity.position.x, bot.entity.position.y, goal.z ?? bot.entity.position.z)
      }
    }
  }
  return bot
}

// a pocket the mock's own activateBlock can grow: the read is live each call
function pocketOf (bot) {
  return bot.pendingPickup ?? 0
}

// --- THE BAND LAW: one band with the ration and the famine trip ---

test('THE BAND LAW: the pantry\'s band IS the regen floor (one band, pinned cross-lib)', () => {
  assert.equal(SCOUT_HUNGER_BAND, REGEN_HUNGER_FLOOR)
  assert.equal(SCOUT_HUNGER_BAND, 18)
})

test('the band boundary: hunger 17 gathers (the ration eats there too), hunger 18 heals', () => {
  assert.equal(berryHarvestDue({ hunger: 17, pocket: 0 }).due, true)
  assert.equal(berryHarvestDue({ hunger: 18, pocket: 0 }).due, false)
  assert.match(berryHarvestDue({ hunger: 18, pocket: 0 }).why, /the scout heals/)
  assert.match(berryHarvestDue({ hunger: 20, pocket: 0 }).why, /the scout heals/)
})

// --- THE CAP LAW: the larder, not a strip mine ---

test('THE CAP LAW: the pocket cap is the flesh keep\'s own number (6), priced at the boundary', () => {
  assert.equal(BERRY_POCKET_CAP, 6)
  assert.equal(berryHarvestDue({ hunger: 12, pocket: 5 }).due, true)
  assert.equal(berryHarvestDue({ hunger: 12, pocket: 6 }).due, false)
  assert.match(berryHarvestDue({ hunger: 12, pocket: 6 }).why, /the pocket holds/)
})

// --- THE DEAD READS never arm (the Number(null) lesson) ---

test('the dead reads refuse and name why: hunger null/NaN/negative, pocket null', () => {
  for (const hunger of [null, undefined, NaN, -1]) {
    const v = berryHarvestDue({ hunger, pocket: 0 })
    assert.equal(v.due, false, `hunger ${hunger} must refuse`)
    assert.match(v.why, /the hunger read is dead/)
  }
  const v = berryHarvestDue({ hunger: 12, pocket: null })
  assert.equal(v.due, false)
  assert.match(v.why, /the pocket read is dead/)
})

// --- matureBush: the honest age read ---

test('matureBush: age 2 and 3 harvest, age 0 and 1 wait, the missing age is the honest unknown (null)', () => {
  assert.equal(matureBush(bush(0, 64, 0, 2)), true)
  assert.equal(matureBush(bush(0, 64, 0, 3)), true)
  assert.equal(matureBush(bush(0, 64, 0, 0)), false)
  assert.equal(matureBush(bush(0, 64, 0, 1)), false)
  assert.equal(matureBush({ name: BERRY_BUSH, position: new Vec3(0, 64, 0) }), null, 'no properties - never walked for')
  assert.equal(matureBush(null), null)
  assert.equal(matureBush({ name: 'stone', position: new Vec3(0, 64, 0), properties: { age: '3' } }), false)
})

// --- pocketBerries: the junk-safe pocket read ---

test('pocketBerries: stacks sum, the empty inventory reads 0 (the truth), the junk bot reads null (never a fake zero)', () => {
  const bot = makeBerryBot({ items: [{ name: BERRY_ITEM, count: 2 }, { name: 'rotten_flesh', count: 5 }, { name: BERRY_ITEM, count: 3 }] })
  assert.equal(pocketBerries(bot), 5)
  assert.equal(pocketBerries(makeBerryBot({ items: [] })), 0)
  assert.equal(pocketBerries({}), null)
  assert.equal(pocketBerries(null), null)
})

// --- pickBush: the nearest MATURE bush wins ---

test('pickBush: the nearest mature bush wins, the immature and the junk are skipped, the reach caps', () => {
  const from = new Vec3(0.5, 64, 0.5)
  const far = bush(20, 64, 0, 3)      // 20 blocks - inside the reach
  const near = bush(4, 64, 0, 3)      // 4 blocks - the winner
  const young = bush(2, 64, 0, 1)     // closer but not harvestable
  assert.equal(pickBush([far, young, near, null, { name: 'stone' }], from), near)
  assert.equal(pickBush([], from), null)
  assert.equal(pickBush(null, from), null)
  assert.equal(pickBush([near], null), null, 'a junk from reads null')
  assert.equal(pickBush([bush(30, 64, 0, 3)], from), null, 'beyond the reach - refused')
  assert.equal(pickBush([far, near], from, { maxDistance: 10 }), near)
})

// --- THE WIRE: createBerryStop with a mock bot ---

test('THE WIRE: the due stop walks, activates, and the pocket delta names the harvest', async () => {
  const bot = makeBerryBot({ food: 12, blocks: [bush(6, 64, 0, 3)] })
  bot.pendingPickup = 0
  const lines = []
  const stop = createBerryStop({ bot, log: m => lines.push(m) })
  const r = await stop()
  assert.equal(r.due, true)
  assert.equal(r.picked, 2)
  assert.equal(bot.gotoCalls, 1)
  assert.equal(bot.activateCalls.length, 1)
  assert.match(lines[0], /berry: picked 2 x sweet_berries/)
  assert.match(lines[0], /hunger 12/)
})

test('THE WIRE: the healthy lean is silent - hunger at the band reads no findBlocks, logs nothing', async () => {
  const bot = makeBerryBot({ food: 20, blocks: [bush(6, 64, 0, 3)] })
  const lines = []
  const stop = createBerryStop({ bot, log: m => lines.push(m) })
  const r = await stop()
  assert.equal(r.due, false)
  assert.equal(bot.findBlocksCalls, 0)
  assert.equal(lines.length, 0)
})

test('THE WIRE: no mature bush in reach stays quiet - no activate, no log, the lane keeps walking', async () => {
  const bot = makeBerryBot({ food: 12, blocks: [bush(6, 64, 0, 1)] }) // too young
  const lines = []
  const stop = createBerryStop({ bot, log: m => lines.push(m) })
  const r = await stop()
  assert.equal(r.due, false)
  assert.equal(bot.gotoCalls, 0)
  assert.equal(bot.activateCalls.length, 0)
  assert.equal(lines.length, 0)
})

test('THE WIRE: the fly scout skips the pantry (the production shape is ground)', async () => {
  const bot = makeBerryBot({ food: 12, blocks: [bush(6, 64, 0, 3)], flyTravel: async () => {} })
  const lines = []
  const stop = createBerryStop({ bot, log: m => lines.push(m) })
  const r = await stop()
  assert.equal(r.due, false)
  assert.match(r.why, /the fly scout skips the pantry/)
  assert.equal(bot.findBlocksCalls, 0)
})

test('THE WIRE: a failed harvest names itself (a walk was spent - the field reads the failure class)', async () => {
  const bot = makeBerryBot({ food: 12, blocks: [bush(6, 64, 0, 3)], activateThrows: new Error('server lag') })
  const lines = []
  const stop = createBerryStop({ bot, log: m => lines.push(m) })
  const r = await stop()
  assert.equal(r.due, false)
  assert.match(r.why, /failed/)
  assert.match(lines[0], /berry: failed/)
})

// --- THE EATING LEG: the 0.511.0 ration bytes on the second bot (source pins) ---

test('THE EATING LEG: the scout wires the SAME ration doctrine the miner wires (one policy object)', () => {
  const src = readFileSync(new URL('../../src/bots/scout.mjs', import.meta.url), 'utf8')
  assert.match(src, /import \{ loader as autoeat \} from 'mineflayer-auto-eat'/, 'the same plugin the miner loads')
  assert.match(src, /import \{ RATION_OPTS, rationVerdict \} from '\.\.\/lib\/ration\.mjs'/, 'the SAME policy object - one doctrine, two bots')
  assert.match(src, /bot\.loadPlugin\(autoeat\)/)
  assert.match(src, /bot\.autoEat\.setOpts\(RATION_OPTS\)/)
  assert.match(src, /bot\.on\('spawn', \(\) => \{ try \{ bot\.autoEat\.enableAuto\(\) \} catch \{ \/\* gone \*\/ \} \}\)/, 'enableAuto on EVERY spawn - the 0.511.0 bytes')
  assert.match(src, /ration: eating/, 'the eatStart line - the attempt is readable')
  assert.match(src, /ration: \$\{ok \? 'ate' : 'failed'\}/, 'the eatFinish honest read - the delta decides, never the hope')
  assert.match(src, /waitForTicks\(3\)/, 'the stats packet wait rides too')
})

test('THE PANTRY CROP IS EDIBLE: sweet_berries are NOT in the ration\'s banned list (the four real bans stand)', () => {
  assert.ok(Array.isArray(RATION_OPTS.bannedFood))
  assert.equal(RATION_OPTS.bannedFood.length, 4, 'pufferfish, chorus_fruit, poisonous_potato, spider_eye - and nothing else')
  assert.equal(RATION_OPTS.bannedFood.includes(BERRY_ITEM), false, 'the pantry\'s own crop must reach the eater')
  assert.equal(RATION_OPTS.minHunger, REGEN_HUNGER_FLOOR, 'the eater feeds at the same band the pantry gathers on')
})

// --- THE GATHER LEG's composition (source pins) ---

test('THE GATHER LEG: the stop rides the scan cadence, the harvest is a right-click, NOT a dig', () => {
  const src = readFileSync(new URL('../../src/bots/scout.mjs', import.meta.url), 'utf8')
  assert.match(src, /const berryStop = createBerryStop\(\{ bot, log: m => log\(`\$\{tag\} \$\{m\}`\) \}\)/)
  assert.match(src, /const scanWithBerry = async \(\) => \{/, 'the composed scan')
  assert.match(src, /await scanWithSync\(\)/, 'the scan\'s verdict comes FIRST')
  assert.match(src, /try \{ await berryStop\(\) \} catch \{ \/\* the pantry is best-effort - the scan above stays whole \*\/ \}/, 'best-effort by law')
  assert.match(src, /createPatrol\(\{ bot, map, scan: scanWithBerry, stats \}\)/, 'the patrol drives the composed scan')
  assert.match(src, /scan: scanWithBerry, patrol/, 'the external caller drives it too')
  assert.match(src, /bot\.activateBlock\(live\)/, 'the vanilla right-click - the bush survives')
  assert.match(src, /label: 'berry stop'/, 'the detour walk names itself in the gotoSafe book')
  assert.ok(!/\.dig\(/.test(src), 'a scout that digs is a miner with extra steps - the harvest never digs')
  assert.match(src, /moves\.canDig = false/, 'the no-dig law stands untouched')
})

test('THE GATHER LEG\'s constants: the reach is the leg\'s own step length, the candidates are priced, the delta waits', () => {
  assert.equal(BERRY_REACH, 24, "createPatrol's stepLen cap - a bush beyond this is off the lane")
  assert.equal(BERRY_COUNT, 8, 'the deeper-record lesson: several candidates priced, not one')
  assert.equal(BERRY_PICKUP_MS, 1000, "the drops' landing wait - the honest delta's granularity")
  const src = readFileSync(new URL('../../src/bots/scout.mjs', import.meta.url), 'utf8')
  assert.match(src, /BERRY_REACH, count: BERRY_COUNT/, 'the reach and the count drive the findBlocks')
})
