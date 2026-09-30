// (v0.366.0) THE FLOODED-ALCOVE WIDENING reaches the camp furnace - placeItemBlock's
// scan now offers ring 2 (the v0.363.0 lib's RING2_OFFSETS) when ring 1 produced ZERO
// attempts, BEFORE the legacy dig-below escape. The safety shape this pins: on a
// flooded camp site the legacy next step ate the block BELOW and dropped the bot into
// the very water it was failing to place around - the wide scan finds the dry cell one
// block past the pond's edge instead. Pure stub world, no server, no timing.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { placeItemBlock } from '../../src/bots/tools.mjs'

const pos = (x, y, z) => ({
  x, y, z,
  floored () { return this },
  offset (dx, dy, dz) { return pos(x + dx, y + dy, z + dz) }
})
const key = (x, y, z) => `${x},${y},${z}`
const air = p => ({ name: 'air', boundingBox: 'empty', type: 0, position: p })
const sand = p => ({ name: 'sand', boundingBox: 'block', type: 1, position: p })
const water = p => ({ name: 'water', boundingBox: 'empty', type: 9, position: p })

// seed: dry feet on solid sand, every ring-1 cell water over sand floors; ring-1/ring-2
// overrides land after (later wins) so each test shapes its own scan
function seedWorld (world, ring2 = {}, ring1 = {}) {
  world.set(key(0, 64, 0), air(pos(0, 64, 0)))
  world.set(key(0, 65, 0), air(pos(0, 65, 0)))
  world.set(key(0, 63, 0), sand(pos(0, 63, 0)))
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
    const [name, box] = ring1[`${dx},${dz}`] ?? ['water', 'empty']
    world.set(key(dx, 64, dz), name === 'water' ? water(pos(dx, 64, dz)) : { name, boundingBox: box, type: 0, position: pos(dx, 64, dz) })
    world.set(key(dx, 63, dz), sand(pos(dx, 63, dz)))
  }
  for (const [dx, dz] of [[2, 0], [-2, 0], [0, 2], [0, -2], [2, 2], [-2, -2], [2, -2], [-2, 2], [2, 1], [2, -1], [-2, 1], [-2, -1], [1, 2], [-1, 2], [1, -2], [-1, -2]]) {
    const [name, box] = ring2[`${dx},${dz}`] ?? ['water', 'empty']
    world.set(key(dx, 64, dz), name === 'water' ? water(pos(dx, 64, dz)) : { name, boundingBox: box, type: 0, position: pos(dx, 64, dz) })
    world.set(key(dx, 63, dz), sand(pos(dx, 63, dz)))
  }
}

function mkBot (world, { placeThrowsAtX = null, rounds = 8 } = {}) {
  const calls = { place: [], digs: 0 }
  let equipped = null
  const inv = [{ name: 'furnace', count: 1, type: 99 }]
  const bot = {
    entity: { position: pos(0, 64, 0) },
    inventory: { items: () => inv },
    blockAt: c => world.get(key(c.x, c.y, c.z)) ?? null,
    findBlock: () => null,
    equip: async item => { calls.equip = (calls.equip ?? 0) + 1; equipped = item },
    placeBlock: async floorB => {
      if (placeThrowsAtX !== null && floorB.position.x === placeThrowsAtX) {
        throw new Error('Server refused to place furnace: the block is still water')
      }
      calls.place.push(floorB.position)
      world.set(key(floorB.position.x, floorB.position.y + 1, floorB.position.z),
        { name: equipped?.name ?? 'furnace', boundingBox: 'block', type: 1 })
    },
    fastDig: async () => { calls.digs++ }
  }
  return { bot, calls, inv, opts: { rounds } }
}

test('the widened scan places the furnace on the dry ring-2 cell BEFORE the dig-below', async () => {
  const world = new Map()
  seedWorld(world, { '2,0': ['air', 'empty'] }) // all ring-1 wet; [2,0] dry
  const { bot, calls } = mkBot(world)
  const out = await placeItemBlock(bot, 'furnace', { rounds: 8 })
  assert.ok(out, 'the wide scan takes the dry cell one block past the pond')
  assert.equal(out.name, 'furnace')
  assert.equal(calls.place.length, 1)
  assert.equal(calls.place[0].x, 2, 'the attempt rode the ring-2 dry floor at (2,0)')
  assert.equal(calls.digs, 0, 'the dig-below never fired - the widening owns the flooded site')
})

test('the dry-cell law rides the wide scan: a wet ring-2 cell is passed over', async () => {
  const world = new Map()
  seedWorld(world, { '2,0': ['water', 'empty'], '-2,0': ['air', 'empty'] }) // [2,0] wet, [-2,0] dry
  const { bot, calls } = mkBot(world)
  const out = await placeItemBlock(bot, 'furnace', { rounds: 8 })
  assert.ok(out)
  assert.equal(calls.place.length, 1)
  assert.equal(calls.place[0].x, -2, 'the wet wide cell cost nothing - the dry one takes the furnace')
})

test('all-wet both rings: zero placements, the honest give-up (no refused feeds)', async () => {
  const world = new Map()
  seedWorld(world) // everything wet
  const { bot, calls, inv } = mkBot(world)
  const out = await placeItemBlock(bot, 'furnace', { rounds: 2 })
  assert.equal(out, null)
  assert.equal(calls.place.length, 0, 'the furnace never rides water, ring 1 or ring 2')
  assert.equal(inv[0].count, 1, 'the item survives the flooded site')
  assert.ok(calls.digs >= 1, 'the legacy dig-below escape still owns the fully-drowned site')
})

test('a rejected attempt in ring 1 never widens (the refusal class stays narrow)', async () => {
  const world = new Map()
  // [1,0] is DRY but its placement is refused (the server refusal class); a tempting
  // dry ring-2 cell exists at [-2,0] - the trigger must never offer it
  seedWorld(world, { '-2,0': ['air', 'empty'] }, { '1,0': ['air', 'empty'] })
  const { bot, calls } = mkBot(world, { placeThrowsAtX: 1 })
  const out = await placeItemBlock(bot, 'furnace', { rounds: 2 })
  assert.equal(out, null)
  assert.equal(calls.place.length, 0, 'the refused attempts never land')
  assert.ok(calls.equip >= 2, 'both rounds retried the ring-1 refusal')
  // the widening trigger saw rejected > 0 - the tempting [-2,0] cell was never offered
  const wideTried = calls.place.some(p => Math.max(Math.abs(p.x), Math.abs(p.z)) === 2)
  assert.equal(wideTried, false, 'a refusal is the rounds ladder\'s class - no wide scan fires')
})
