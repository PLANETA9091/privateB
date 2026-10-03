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
  BERRY_WALK_CAP, BERRY_WALK_TIMEOUT_MS, BERRY_MEMORY_CAP,
  matureBush, pocketBerries, berryHarvestDue, pickBush, recordBush, famineWalkPlan
} from '../../src/lib/berry.mjs'
import { createBerryStop, createScan } from '../../src/bots/scout.mjs'

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
  assert.match(src, /const berryStop = createBerryStop\(\{ bot, log: m => log\(`\$\{tag\} \$\{m\}`\), bushMemory: bushBook, stats \}\)/, 'the stop rides the scan cadence (v0.534.0: the bush memory joined - the famine walk reads what the scan writes; v0.537.0: the pantry\'s book rides the scout\'s own stats; v0.538.0: the book rides the rebuild seat - bushBook is the injected-or-closure book)')
  assert.match(src, /const scanWithBerry = async \(\) => \{/, 'the composed scan')
  assert.match(src, /await scanWithSync\(\)/, 'the scan\'s verdict comes FIRST')
  assert.match(src, /try \{ await berryStop\(\) \} catch \{ \/\* the pantry is best-effort - the scan above stays whole \*\/ \}/, 'best-effort by law')
  assert.match(src, /createPatrol\(\{ bot, map, scan: scanWithBerry, stats, log: m => log\(`\$\{tag\} \$\{m\}`\) \}\)/, 'the patrol drives the composed scan (v0.532.0: the tagged log joined - the night hold names itself)')
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

// ---- (v0.534.0) THE FAMINE WALK - the pantry's second answer ----
// The reach is the lane itself: a scout below the regen floor with no mature
// bush in reach quietly refused and kept walking hungry - the hedge-less
// stretch starved it at the band's own arithmetic (the ration needs food IN
// POCKET, the pocket only fills from bushes). The scan's own eye records the
// bushes it passes into a PRIVATE memory; the stop's refusal upgrades to ONE
// bounded walk to the nearest remembered bush; the same honest delta names
// whatever the world gives.

test('THE FAMINE WALK: the memory knows a bush beyond the reach, the stop spends one bounded walk on it', async () => {
  const bot = makeBerryBot({ food: 12, blocks: [bush(30, 64, 0, 3)] }) // 30 blocks - beyond BERRY_REACH 24
  bot.pendingPickup = 0
  const bushMemory = new Map()
  recordBush(bushMemory, { x: 30, y: 64, z: 0 })
  const lines = []
  const stop = createBerryStop({ bot, log: m => lines.push(m), bushMemory })
  const r = await stop()
  assert.equal(r.due, true)
  assert.equal(r.picked, 2)
  assert.equal(r.walked, true, 'the walked shape names itself in the return')
  assert.equal(bot.gotoCalls, 1, 'ONE bounded goto - the walk is never a lane')
  assert.equal(bot.activateCalls.length, 1)
  assert.equal(bushMemory.size, 1, 'the bush lived - the record stays')
  assert.match(lines[0], /berry: famine walk - the reach is bare, the memory knows a bush at \[30,64,0\]/, 'the walk names itself BEFORE it is spent')
  assert.match(lines[1], /berry: famine walk picked 2 x sweet_berries/, 'the walked pick rides the honest delta with its own key')
})

test('THE FAMINE WALK: the nearest remembered bush wins (the plan is pure)', () => {
  const mem = new Map()
  mem.set('a', { pos: { x: 10, y: 64, z: 0 }, at: 1 })
  mem.set('b', { pos: { x: 30, y: 64, z: 0 }, at: 2 })
  const plan = famineWalkPlan({ memory: mem, here: { x: 0, y: 64, z: 0 } })
  assert.equal(plan.key, 'a')
  assert.deepEqual(plan.pos, { x: 10, y: 64, z: 0 })
  // the envelope: beyond BERRY_WALK_CAP the walk would serve hope, not knowledge
  assert.equal(famineWalkPlan({ memory: mem, here: { x: 0, y: 64, z: 0 }, cap: 5 }), null, 'beyond the cap - refused')
  // the ties keep the FIRST record (deterministic - the memory's own order)
  const tie = new Map()
  tie.set('first', { pos: { x: 12, y: 64, z: 0 }, at: 1 })
  tie.set('second', { pos: { x: 0, y: 64, z: 12 }, at: 2 })
  assert.equal(famineWalkPlan({ memory: tie, here: { x: 0, y: 64, z: 0 } }).key, 'first')
})

test('THE FAMINE WALK: the junk never arms the walk (the dead reads read null)', () => {
  assert.equal(famineWalkPlan({ memory: null, here: { x: 0, y: 64, z: 0 } }), null)
  assert.equal(famineWalkPlan({ memory: new Map(), here: { x: 0, y: 64, z: 0 } }), null, 'an empty book reads null')
  const junk = new Map()
  junk.set('x', { pos: null, at: 1 })
  junk.set('y', { pos: { x: NaN, y: 64, z: 0 }, at: 2 })
  assert.equal(famineWalkPlan({ memory: junk, here: { x: 0, y: 64, z: 0 } }), null, 'junk entries are skipped')
  const good = new Map()
  good.set('g', { pos: { x: 10, y: 64, z: 0 }, at: 1 })
  assert.equal(famineWalkPlan({ memory: good, here: null }), null, 'a junk here reads null')
  assert.equal(famineWalkPlan({ memory: good, here: { x: NaN, y: 64, z: 0 } }), null)
})

test('THE FAMINE WALK: the memory is a bounded book - dedupe by cell, the oldest record is forgotten', () => {
  const mem = new Map()
  recordBush(mem, { x: 1.2, y: 64.7, z: 3.9 }, { now: 100 })
  assert.equal(mem.size, 1)
  assert.deepEqual(mem.get('1,64,3').pos, { x: 1, y: 64, z: 3 }, 'the record is the FLOORED cell')
  recordBush(mem, { x: 1.5, y: 64.1, z: 3.1 }, { now: 200 }) // the same cell re-seen
  assert.equal(mem.size, 1, 'the dedupe: the same bush updates, never grows the book')
  assert.equal(mem.get('1,64,3').at, 200, 'the timestamp is the freshest sighting')
  recordBush(mem, { x: 5, y: 64, z: 5 }, { now: 300 })
  recordBush(mem, { x: 9, y: 64, z: 9 }, { now: 400, cap: 2 })
  assert.equal(mem.size, 2, 'the cap holds')
  assert.equal(mem.has('1,64,3'), false, 'the OLDEST record is the one forgotten')
  assert.equal(recordBush(null, { x: 1, y: 64, z: 1 }), null, 'junk memory is the no-op')
  const mem2 = new Map()
  recordBush(mem2, { x: NaN, y: 64, z: 0 })
  assert.equal(mem2.size, 0, 'a junk position is refused')
})

test('THE FAMINE WALK: the remembered bush is gone - the dead record is forgotten, the refusal stays quiet', async () => {
  const bot = makeBerryBot({ food: 12, blocks: [] }) // the world moved on
  const bushMemory = new Map()
  recordBush(bushMemory, { x: 30, y: 64, z: 0 })
  const lines = []
  const stop = createBerryStop({ bot, log: m => lines.push(m), bushMemory })
  const r = await stop()
  assert.equal(r.due, false)
  assert.equal(r.why, 'the remembered bush is gone')
  assert.equal(bushMemory.size, 0, 'dead knowledge must not steer twice')
  assert.equal(bot.activateCalls.length, 0, 'nothing was picked')
  assert.equal(lines.length, 1, 'the walk announced itself - the gone record stays quiet (the walk named the cost)')
  assert.match(lines[0], /berry: famine walk - the reach is bare/)
})

test('THE FAMINE WALK: a failed walk names itself (a walk was spent - the field reads the failure class)', async () => {
  const bot = makeBerryBot({ food: 12, blocks: [] })
  bot.pathfinder.goto = async () => { throw new Error('wedged in a cliff') }
  const bushMemory = new Map()
  recordBush(bushMemory, { x: 30, y: 64, z: 0 })
  const lines = []
  const stop = createBerryStop({ bot, log: m => lines.push(m), bushMemory })
  const r = await stop()
  assert.equal(r.due, false)
  assert.match(r.why, /the famine walk failed/)
  assert.match(lines[1], /berry: famine walk failed \(wedged in a cliff\)/, 'the walk failure has its own key - the field splits it from the pick failures')
})

// ---- (v0.537.0) THE PANTRY'S BOOK - the counters ride the scout's stats ----
// The stop's verdict was discarded by its only composer (the v0.535.0 lesson's
// exact shape, one pantry wide): the run's report could not say whether the
// pantry ever fired, what it bought, or what the famine walks cost. Two
// monotone integers, the carry's own class (SCOUT_CARRY_FIELDS grew to six).

test('THE PANTRY\'S BOOK: the reach pick pays berryPicked, spends no walk', async () => {
  const bot = makeBerryBot({ food: 12, blocks: [bush(6, 64, 0, 3)] })
  bot.pendingPickup = 0
  const stats = { berryPicked: 0, berryWalks: 0 }
  const stop = createBerryStop({ bot, log: () => {}, stats })
  const r = await stop()
  assert.deepEqual(r, { due: true, picked: 2, walked: false })
  assert.equal(stats.berryPicked, 2, 'the delta pays the book')
  assert.equal(stats.berryWalks, 0, 'the reach pick spends no walk')
})

test('THE PANTRY\'S BOOK: the paid famine walk spends one walk and pays its delta', async () => {
  const bot = makeBerryBot({ food: 12, blocks: [bush(30, 64, 0, 3)] }) // beyond BERRY_REACH 24
  bot.pendingPickup = 0
  const bushMemory = new Map()
  recordBush(bushMemory, { x: 30, y: 64, z: 0 })
  const stats = { berryPicked: 0, berryWalks: 0 }
  const stop = createBerryStop({ bot, log: () => {}, bushMemory, stats })
  const r = await stop()
  assert.deepEqual(r, { due: true, picked: 2, walked: true })
  assert.equal(stats.berryWalks, 1, 'ONE walk spent')
  assert.equal(stats.berryPicked, 2, 'the walked pick pays the same book')
})

test('THE PANTRY\'S BOOK: the failed walk spends the walk and pays nothing', async () => {
  const bot = makeBerryBot({ food: 12, blocks: [] })
  bot.pathfinder.goto = async () => { throw new Error('wedged in a cliff') }
  const bushMemory = new Map()
  recordBush(bushMemory, { x: 30, y: 64, z: 0 })
  const stats = { berryPicked: 7, berryWalks: 0 }
  const stop = createBerryStop({ bot, log: () => {}, bushMemory, stats })
  const r = await stop()
  assert.equal(r.due, false)
  assert.equal(stats.berryWalks, 1, 'the spend is the walk - the goto\'s outcome never prices it')
  assert.equal(stats.berryPicked, 7, 'the pay keeps its truth')
})

test('THE PANTRY\'S BOOK: the gone record spent its walk too (dead knowledge costs the goto)', async () => {
  const bot = makeBerryBot({ food: 12, blocks: [] }) // the world moved on
  const bushMemory = new Map()
  recordBush(bushMemory, { x: 30, y: 64, z: 0 })
  const stats = { berryPicked: 3, berryWalks: 0 }
  const stop = createBerryStop({ bot, log: () => {}, bushMemory, stats })
  const r = await stop()
  assert.equal(r.why, 'the remembered bush is gone')
  assert.equal(stats.berryWalks, 1, 'the walk was spent before the world said no')
  assert.equal(stats.berryPicked, 3)
  assert.equal(bushMemory.size, 0, 'the record is forgotten - the book\'s own law stands')
})

test('THE PANTRY\'S BOOK: the bare bush is a readable zero - the pay lands, the sum does not move', async () => {
  const bot = makeBerryBot({ food: 12, blocks: [bush(6, 64, 0, 3)] })
  bot.activateBlock = async () => { /* the world gives nothing */ }
  const stats = { berryPicked: 5, berryWalks: 0 }
  const stop = createBerryStop({ bot, log: () => {}, stats })
  const r = await stop()
  assert.deepEqual(r, { due: true, picked: 0, walked: false })
  assert.equal(stats.berryPicked, 5, 'the zero is readable - the sum keeps its truth')
})

test('THE PANTRY\'S BOOK: no stats injected stays junk-safe (the tests\' shape, no throw)', async () => {
  const bot = makeBerryBot({ food: 12, blocks: [bush(6, 64, 0, 3)] })
  bot.pendingPickup = 0
  const stop = createBerryStop({ bot, log: () => {} })
  const r = await stop()
  assert.deepEqual(r, { due: true, picked: 2, walked: false }, 'the verdict is unchanged without a book')
})

test('THE FAMINE WALK: no memory, no plan - the LEGACY quiet refusal stands byte for byte', async () => {
  const bot = makeBerryBot({ food: 12, blocks: [bush(6, 64, 0, 1)] }) // immature, and the book is empty
  const lines = []
  const stop = createBerryStop({ bot, log: m => lines.push(m), bushMemory: new Map() })
  const r = await stop()
  assert.deepEqual(r, { due: false, why: 'no mature bush in reach' }, 'the legacy byte the lane has always run')
  assert.equal(lines.length, 0)
})

test('THE FAMINE WALK: the scan\'s memory shoulder - the eye writes what it sees, the map stays the miners\'', async () => {
  // the mock honors the REAL findBlocks contract: it returns POSITIONS (Vec3),
  // exactly what a live mineflayer hands the scan
  const world = [{ name: 'sand', x: 2, y: 64, z: 2, position: new Vec3(2, 64, 2) }, { name: 'sweet_berry_bush', x: 30, y: 64, z: 0, position: new Vec3(30, 64, 0) }]
  const bot = {
    entity: { position: new Vec3(0, 64, 0) },
    findBlocks: ({ matching, count }) => world.filter(b => matching({ name: b.name })).map(b => new Vec3(b.x, b.y, b.z)).slice(0, count ?? Infinity),
    blockAt: p => world.find(b => b.position.x === p.x && b.position.y === p.y && b.position.z === p.z) ?? null
  }
  const stats = { scans: 0, found: 0 }
  const bushMemory = new Map()
  const scan = createScan({ bot, map: null, stats, bushMemory })
  const seen = await scan()
  assert.equal(seen, 1, 'the targets finder counts only the map\'s targets - the bush is not a mining resource')
  assert.equal(stats.found, 0, 'the map\'s find counter is untouched by the bush pass')
  assert.equal(bushMemory.size, 1, 'the memory shoulder wrote the bush it saw')
  assert.ok(bushMemory.has('30,64,0'))
})

test('THE FAMINE WALK: the envelope is the scan\'s own eye, the walk is one bounded goto, the laws are pinned', async () => {
  assert.equal(BERRY_WALK_CAP, 48, 'the scan\'s own knowledge radius - the memory never knows a bush the eye could not have seen')
  assert.equal(BERRY_WALK_TIMEOUT_MS, 15000, 'the scout leg\'s own timeout shape - one bounded goto')
  assert.equal(BERRY_MEMORY_CAP, 32, 'one bounded book, never an unbounded ledger')
  const src = readFileSync(new URL('../../src/bots/scout.mjs', import.meta.url), 'utf8')
  assert.match(src, /recordBush, famineWalkPlan \} from '\.\.\/lib\/berry\.mjs'/, 'the lib import is pinned')
  assert.match(src, /const bushBook = bushMemory \?\? new Map\(\)/, 'the book is private to this scout - or injected to survive the rebuild (v0.538.0)')
  assert.match(src, /createScan\(\{ bot, map, targets, stats, log: m => log\(`\$\{tag\} \$\{m\}`\), bushMemory: bushBook \}\)/, 'the scan\'s eye writes')
  assert.match(src, /if \(bushMemory\) \{[\s\S]*?recordBush\(bushMemory, b\)/, 'the record pass rides the scan, guarded')
  assert.match(src, /famineWalkPlan\(\{ memory: bushMemory, here: bot\.entity\?\.position \}\)/, 'the stop reads the book')
  assert.match(src, /bushMemory\.delete\(plan\.key\)/, 'the gone record is forgotten')
  assert.match(src, /label: 'berry famine walk'/, 'the walk names itself in the gotoSafe book')
  const legacy = src.match(/return \{ due: false, why: 'no mature bush in reach' \}/g) ?? []
  assert.equal(legacy.length, 1, 'the legacy byte stands exactly once - the famine walk sits AFTER it, never instead of it')
  const lib = readFileSync(new URL('../../src/lib/berry.mjs', import.meta.url), 'utf8')
  assert.match(lib, /the food walk stays armed even inside the night hold/, 'the food-walk law: starvation is the other death')
  assert.match(lib, /bushes are the pantry's knowledge,\s*\n\*? ?\/\/\s*never a mining target/, 'the private book law: the shared map stays the miners\'')
})
