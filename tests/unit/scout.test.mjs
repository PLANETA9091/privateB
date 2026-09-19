// Scout: the fleet's eyes. createScan records what the bot sees into the WorldMap,
// createPatrol walks (or flies) a lawnmower route and scans along the way.
// Both are driven here with a mock bot - no server needed, exactly the API the real
// mineflayer bot exposes (findBlocks / blockAt / entity.position / pathfinder.goto).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Vec3 } from 'vec3'
import { WorldMap } from '../../src/fleet/worldmap.mjs'
import { createScan, createPatrol } from '../../src/bots/scout.mjs'

// A tiny mock world: target blocks the scout can "see", positioned around the origin.
function makeMockBot ({ blocks = [], start = new Vec3(0.5, 64, 0.5), movePerGoto = 12 } = {}) {
  const bot = {
    entity: { position: start.clone() },
    findBlocks: ({ matching, count = Infinity }) => {
      const hits = blocks.filter(b => matching({ name: b.name })).map(b => new Vec3(b.x, b.y, b.z))
      return hits.slice(0, count)
    },
    blockAt: p => {
      const b = blocks.find(b => b.x === p.x && b.y === p.y && b.z === p.z)
      return b ? { name: b.name } : null
    },
    gotoCalls: 0,
    pathfinder: {
      goto: async goal => {
        bot.gotoCalls++
        const pos = bot.entity.position
        const dx = goal.x - pos.x
        const dz = goal.z - pos.z
        const dist = Math.hypot(dx, dz)
        if (dist > movePerGoto) {
          bot.entity.position = new Vec3(pos.x + dx / dist * movePerGoto, pos.y, pos.z + dz / dist * movePerGoto)
        } else {
          bot.entity.position = new Vec3(goal.x, pos.y, goal.z)
        }
      }
    },
    flyTravelCalls: 0,
    flyTravel: null
  }
  return bot
}

test('createScan records found blocks into the map and marks the chunk scanned', async () => {
  const map = new WorldMap()
  const bot = makeMockBot({
    blocks: [
      { name: 'sand', x: 2, y: 64, z: 2 },
      { name: 'sand', x: -3, y: 64, z: 1 },
      { name: 'coal_ore', x: 4, y: 60, z: 5 }
    ]
  })
  const stats = { scans: 0, found: 0 }
  const scan = createScan({ bot, map, stats })
  const seen = await scan()
  assert.equal(seen, 3)
  assert.equal(stats.scans, 1)
  assert.equal(stats.found, 3)
  assert.equal(map.size('sand'), 2)
  assert.equal(map.size('coal_ore'), 1)
  assert.ok(map.isScanned(0, 0), 'the chunk the bot stands in must be marked scanned')
})

test('createScan does not duplicate known positions (rescan is idempotent)', async () => {
  const map = new WorldMap()
  const bot = makeMockBot({ blocks: [{ name: 'gravel', x: 1, y: 64, z: 1 }] })
  const stats = { scans: 0, found: 0 }
  const scan = createScan({ bot, map, stats })
  await scan()
  await scan()
  await scan()
  assert.equal(map.size('gravel'), 1)
  assert.equal(stats.found, 1, 'only the first scan adds new entries')
  assert.equal(stats.scans, 3)
})

test('createScan survives blocks that vanish between findBlocks and blockAt', async () => {
  const map = new WorldMap()
  const bot = makeMockBot({ blocks: [{ name: 'clay', x: 0, y: 64, z: 0 }] })
  bot.blockAt = () => null // chunk unloaded mid-scan
  const scan = createScan({ bot, map })
  const seen = await scan()
  assert.equal(seen, 1)
  assert.equal(map.total(), 0)
})

test('createScan logs when new positions appear', async () => {
  const map = new WorldMap()
  const bot = makeMockBot({ blocks: [{ name: 'iron_ore', x: 3, y: 64, z: 3 }] })
  const lines = []
  const scan = createScan({ bot, map, log: m => lines.push(m) })
  await scan()
  assert.ok(lines.some(l => l.includes('+1')), `log must announce the new entry, got: ${lines.join(' | ')}`)
})

test('ground patrol walks lanes, scans along the way and feeds the map', async () => {
  const map = new WorldMap()
  // a sand pit straight east along lane 0
  const bot = makeMockBot({
    blocks: [
      { name: 'sand', x: 20, y: 64, z: 0 },
      { name: 'sand', x: 24, y: 64, z: 0 }
    ]
  })
  const stats = { scans: 0, found: 0, travelled: 0 }
  const scan = createScan({ bot, map, stats })
  const patrol = createPatrol({ bot, map, scan, stats })
  const res = await patrol({ heading: 'east', distance: 48, lanes: 2, laneGap: 16, seconds: 5 })
  assert.ok(stats.travelled > 0, 'ground scout must actually walk')
  assert.ok(map.size('sand') >= 1, 'the sand pit must be on the map')
  assert.ok(res.map.positions >= 1)
  assert.ok(bot.gotoCalls >= 4, `patrol must drive the pathfinder, got ${bot.gotoCalls} goto calls`)
  assert.ok(stats.scans >= 2, 'must scan at every leg')
  // the mock bot never falls behind: after lane 0 (z=0) and the shift, lane 1 sits at z=16
  assert.ok(Math.abs(bot.entity.position.z - 16) < 8 || bot.entity.position.z > 8,
    `lane shift must move across lanes, z=${bot.entity.position.z}`)
})

test('fly patrol uses flyTravel when the bot can fly (kept for no-allow-flight=false worlds)', async () => {
  const map = new WorldMap()
  const bot = makeMockBot({ blocks: [] })
  bot.flyTravel = async step => {
    bot.flyTravelCalls++
    bot.entity.position = new Vec3(step.x, step.y, step.z) // teleport like the real flyer
  }
  const scan = createScan({ bot, map })
  const stats = { scans: 0, found: 0, travelled: 0 }
  const patrol = createPatrol({ bot, map, scan, stats })
  await patrol({ heading: 'east', distance: 64, lanes: 1, laneGap: 8, seconds: 3 })
  assert.ok(bot.flyTravelCalls >= 2, 'fly mode must ride flyTravel')
  assert.equal(bot.gotoCalls, 0, 'fly mode must not touch the pathfinder')
  assert.equal(bot.entity.position.y, 110, 'fly lanes ride the configured altitude')
})

test('patrol respects the deadline even when the bot cannot move', async () => {
  const map = new WorldMap()
  const bot = makeMockBot({ blocks: [] })
  bot.pathfinder.goto = async () => { throw new Error('stuck') } // wedged against a cliff
  const scan = createScan({ bot, map })
  const stats = { scans: 0, found: 0, travelled: 0 }
  const patrol = createPatrol({ bot, map, scan, stats })
  const t0 = Date.now()
  await patrol({ heading: 'north', distance: 96, lanes: 8, laneGap: 24, seconds: 1 })
  const secs = (Date.now() - t0) / 1000
  assert.ok(secs < 5, `a stuck scout must give up at the deadline, took ${secs.toFixed(1)}s`)
  assert.ok(stats.scans >= 1, 'even a stuck scout scans where it stands')
})
