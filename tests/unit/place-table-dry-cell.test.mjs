// (v0.365.0) THE DRY-CELL LAW REACHES THE FLEET - placeTable and placeItemBlock
// (src/bots/tools.mjs) shared the hole CI 36752156115 fed the integration
// placeMachine: fluids read boundingBox 'empty', so the box filter alone let a
// water cell through to placeBlock ('Server refused to place ...: the block is
// still water') - burning the 5-tick pre-click pacing + the refused packet + the
// 10-tick verify on a placement vanilla ALWAYS refuses, while the wet relocation
// above only dries the bot's OWN feet. These tests pin the cure: a fluid cell is
// skipped BEFORE any attempt, the scan reaches the dry neighbour, and a nameless
// block keeps the legacy attempt (junk never invents a skip - the body-guard law).
// Pure stub world - no server, no timing (tickWait resolves at once without
// bot.waitForTicks, the craft-fence pattern).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { placeTable, placeItemBlock } from '../../src/bots/tools.mjs'

const pos = (x, y, z) => ({
  x, y, z,
  floored () { return this },
  offset (dx, dy, dz) { return pos(x + dx, y + dy, z + dz) }
})
const key = (x, y, z) => `${x},${y},${z}`
const air = p => ({ name: 'air', boundingBox: 'empty', type: 0, position: p })
const sand = p => ({ name: 'sand', boundingBox: 'block', type: 1, position: p })
const water = p => ({ name: 'water', boundingBox: 'empty', type: 9, position: p })
const lava = p => ({ name: 'lava', boundingBox: 'empty', type: 11, position: p })

// a stub bot standing at (0,64,0) on solid sand: dry feet, dry head, solid floor
// (isWetOrFloating reads feet/head/below and must stay false - the relocation
// lane is not under test here, the NEIGHBOUR cells are)
function mkBot (world, itemName) {
  const calls = { equip: 0, place: [] }
  let equipped = null
  const inv = [{ name: itemName, count: 1, type: 99 }]
  const bot = {
    entity: { position: pos(0, 64, 0) },
    inventory: { items: () => inv },
    blockAt: c => world.get(key(c.x, c.y, c.z)) ?? null,
    findBlock: () => null, // no existing table/furnace within reach
    equip: async item => { calls.equip++; equipped = item },
    placeBlock: async floorB => {
      calls.place.push(floorB.position)
      // the server lands the block: the cell above the floor reads the item
      world.set(key(floorB.position.x, floorB.position.y + 1, floorB.position.z),
        { name: equipped?.name ?? itemName, boundingBox: 'block', type: 1 })
    },
    fastDig: async () => { /* the dig lane resolves, the world stays as seeded */ }
  }
  return { bot, calls, inv }
}

// seed the 8 neighbour cells + floors: fluidName null means dry air cells
function seedRing (world, fluidName, { dryAt = null, namelessAt = null } = {}) {
  world.set(key(0, 64, 0), air(pos(0, 64, 0)))
  world.set(key(0, 65, 0), air(pos(0, 65, 0)))
  world.set(key(0, 63, 0), sand(pos(0, 63, 0)))
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
    const cell = pos(dx, 64, dz)
    const floor = sand(pos(dx, 63, dz))
    world.set(key(dx, 63, dz), floor)
    if (dryAt && dx === dryAt[0] && dz === dryAt[1]) world.set(key(dx, 64, dz), air(cell))
    else if (namelessAt && dx === namelessAt[0] && dz === namelessAt[1]) {
      world.set(key(dx, 64, dz), { name: undefined, boundingBox: 'empty', type: 0, position: cell })
    } else if (fluidName) world.set(key(dx, 64, dz), fluidName === 'lava' ? lava(cell) : water(cell))
    else world.set(key(dx, 64, dz), air(cell))
  }
}

test('placeTable: an all-water ring never reaches placeBlock (the dry-cell law)', async () => {
  for (const fluidName of ['water', 'lava']) {
    const world = new Map()
    seedRing(world, fluidName)
    const { bot, calls, inv } = mkBot(world, 'crafting_table')
    const out = await placeTable(bot)
    assert.equal(out, null, `${fluidName}: nowhere dry to place`)
    assert.equal(calls.place.length, 0, `${fluidName}: the refused-placement class must burn ZERO placeBlock calls`)
    assert.ok(calls.equip >= 1, `${fluidName}: the bot still tried - the skip lives in the scan, not an early return`)
    assert.equal(inv[0].count, 1, `${fluidName}: the table item is never fed to a refused placement`)
  }
})

test('placeTable: the scan passes the wet cell over and places on the dry one', async () => {
  const world = new Map()
  seedRing(world, 'water', { dryAt: [-1, 0] }) // [1,0] is water, [-1,0] is dry air
  const { bot, calls } = mkBot(world, 'crafting_table')
  const out = await placeTable(bot)
  assert.ok(out, 'the dry neighbour takes the table')
  assert.equal(out.name, 'crafting_table')
  assert.equal(calls.place.length, 1, 'exactly one placement attempt fired - the wet cell cost nothing')
  assert.equal(calls.place[0].x, -1, 'the attempt rode the DRY floor, not the water cell')
})

test('placeTable: a nameless empty cell keeps the legacy attempt (junk never invents a skip)', async () => {
  const world = new Map()
  seedRing(world, 'water', { namelessAt: [1, 0] }) // 7 wet cells + 1 nameless 'empty'
  const { bot, calls } = mkBot(world, 'crafting_table')
  const out = await placeTable(bot)
  assert.ok(out, 'the nameless cell is attempted like the pre-law code did')
  assert.equal(calls.place[0].x, 1, 'the attempt rode the nameless cell - the law never guesses from the box alone')
})

test('placeItemBlock shares the law: the furnace never rides water', async () => {
  const wet = new Map()
  seedRing(wet, 'water')
  const a = mkBot(wet, 'furnace')
  assert.equal(await placeItemBlock(a.bot, 'furnace'), null, 'all-water ring: no placement')
  assert.equal(a.calls.place.length, 0, 'all-water ring: zero placeBlock calls')

  const dry = new Map()
  seedRing(dry, 'water', { dryAt: [0, 1] })
  const b = mkBot(dry, 'furnace')
  const out = await placeItemBlock(b.bot, 'furnace')
  assert.ok(out, 'the dry neighbour takes the furnace')
  assert.equal(out.name, 'furnace')
  assert.equal(b.calls.place.length, 1)
  assert.equal(b.calls.place[0].z, 1, 'the attempt rode the DRY floor at (0,1)')
})
