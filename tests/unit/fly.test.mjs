// Fly module physics against a tiny in-memory world (no Minecraft server needed).
// Covers the movement rules that keep the server from kicking the bot:
// collision-aware stepping, anti-kick dipping, arrival detection, landing.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Vec3 } from 'vec3'
import { installFly, disposeFly } from '../../src/lib/fly.mjs'

const TICK_MS = 50
const sleep = ms => new Promise(r => setTimeout(r, ms))

// A flat world: solid ground at y<=63 ("grass_block"), everything above empty.
// Custom solid blocks can be placed through the `extra` map ("x,y,z" -> name).
function mockBot (extra = {}) {
  const bot = {
    entity: {
      position: new Vec3(0.5, 64, 0.5),
      velocity: new Vec3(0, 0, 0),
      onGround: false
    },
    blockAt (pos) {
      const key = `${Math.floor(pos.x)},${Math.floor(pos.y)},${Math.floor(pos.z)}`
      if (extra[key]) {
        return {
          name: extra[key], boundingBox: 'block', type: 1,
          position: new Vec3(Math.floor(pos.x), Math.floor(pos.y), Math.floor(pos.z))
        }
      }
      if (Math.floor(pos.y) <= 63) {
        return {
          name: 'grass_block', boundingBox: 'block', type: 1,
          position: new Vec3(Math.floor(pos.x), Math.floor(pos.y), Math.floor(pos.z))
        }
      }
      return {
        name: 'air', boundingBox: 'empty', type: 0,
        position: new Vec3(Math.floor(pos.x), Math.floor(pos.y), Math.floor(pos.z))
      }
    },
    listeners: {},
    once (ev, fn) { this.listeners[ev] = fn }
  }
  return bot
}

test('installFly wires the API and disables physics', () => {
  const bot = mockBot()
  installFly(bot, { log: () => {} })
  assert.equal(bot.physicsEnabled, false)
  assert.equal(typeof bot.flyTo, 'function')
  assert.equal(typeof bot.flyTravel, 'function')
  assert.equal(typeof bot.flySnap, 'function')
  assert.equal(typeof bot.flyStop, 'function')
  assert.equal(typeof bot.waitForTicks, 'function')
  disposeFly(bot)
  assert.equal(bot._flyTimer, null, 'disposeFly must stop the ticker')
})

test('flyTo moves the bot to a free target and resolves', async () => {
  const bot = mockBot()
  installFly(bot, { speed: 2.0, antiKick: false, log: () => {} })
  await bot.flyTo(new Vec3(8.5, 64, 6.5), { timeoutMs: 5000 })
  const p = bot.entity.position
  assert.deepEqual([p.x, p.y, p.z], [8.5, 64, 6.5])
  disposeFly(bot)
})

test('flyTo refuses to end inside solid terrain (collision-aware)', async () => {
  // A tall 2-thick wall reaching the mock sky: climbing over it is impossible (there is no
  // "above"), stepping around it only slides along z, and every other candidate is blocked,
  // so flyTo must give up with a no-progress error instead of ending inside blocks. The wall
  // is 2 thick on purpose: a single 1-thick wall could be skipped by one 2-block step.
  const extra = {}
  for (let y = 64; y <= 200; y++) {
    for (let z = -1; z <= 3; z++) {
      extra[`5,${y},${z}`] = 'stone'
      extra[`6,${y},${z}`] = 'stone'
    }
  }
  const bot = mockBot(extra)
  installFly(bot, { speed: 0.5, antiKick: false, digThrough: false, log: () => {} })
  await assert.rejects(
    bot.flyTo(new Vec3(9.5, 64, 1.5), { timeoutMs: 5000 }),
    /fly timeout|blocked|no progress/
  )
  // the bot must NOT have ended inside the wall
  const p = bot.entity.position
  const key = `${Math.floor(p.x)},${Math.floor(p.y)},${Math.floor(p.z)}`
  assert.ok(!extra[key], 'the bot ended up inside solid terrain')
  disposeFly(bot)
})

test('flyTo climbs over a 2-block obstacle', async () => {
  // a single row of stone at y=64: the step candidates try [dx, max(dy,1)] and [dx, max(dy,2)]
  const extra = {}
  for (let z = -1; z <= 3; z++) extra[`4,64,${z}`] = 'stone'
  const bot = mockBot(extra)
  installFly(bot, { speed: 2.0, antiKick: false, digThrough: false, log: () => {} })
  await bot.flyTo(new Vec3(8.5, 64, 1.5), { timeoutMs: 6000 })
  const p = bot.entity.position
  assert.deepEqual([p.x, p.y, p.z], [8.5, 64, 1.5])
  disposeFly(bot)
})

test('flyTo with digThrough digs through the blocking wall (via flyDigHook)', async () => {
  const extra = {}
  // wall x=3 from the ground up to the mock sky (climbing must not get around digging),
  // plus a ceiling above our own column so the [0,1,0] climb candidate is blocked too:
  // the dig hook only fires when stepFree has NO move left at all.
  for (let y = 64; y <= 200; y++) {
    for (let z = 0; z <= 2; z++) extra[`3,${y},${z}`] = 'stone'
  }
  for (let y = 66; y <= 200; y++) {
    for (let z = 0; z <= 3; z++) extra[`2,${y},${z}`] = 'stone'
  }
  const bot = mockBot(extra)
  let dug = 0
  bot.flyDigHook = async () => {
    dug++
    for (const k of Object.keys(extra)) {
      if (k.startsWith('3,')) delete extra[k] // digging opens the wall (the ceiling stays)
    }
    return true
  }
  // speed 0.5: a slower step must not skip over the 1-thick wall without touching it
  installFly(bot, { speed: 0.5, antiKick: false, digThrough: true, log: () => {} })
  await bot.flyTo(new Vec3(6.5, 64, 1.5), { timeoutMs: 10000 })
  assert.ok(dug >= 1, 'the dig hook should have been used for the wall')
  disposeFly(bot)
})

test('anti-kick dips the position every antiKickInterval ticks', async () => {
  const bot = mockBot()
  installFly(bot, { speed: 1.0, antiKick: true, antiKickInterval: 4, antiKickDistance: 0.05, log: () => {} })
  let sawDip = false
  for (let i = 0; i < 14; i++) {
    await sleep(TICK_MS)
    if (Math.abs(bot.entity.position.y - 64) > 0.01) sawDip = true
  }
  assert.ok(sawDip, 'anti-kick dip never moved the position')
  disposeFly(bot)
})

test('onGround is reported true (NoFall) while flying', async () => {
  const bot = mockBot()
  installFly(bot, { antiKick: false, log: () => {} })
  await sleep(3 * TICK_MS + 10)
  assert.equal(bot.entity.onGround, true)
  disposeFly(bot)
})

test('flySnap only teleports into free space', () => {
  const bot = mockBot()
  installFly(bot, { log: () => {} })
  assert.ok(bot.flySnap(new Vec3(2.5, 64, 2.5))) // free air above the ground
  assert.ok(!bot.flySnap(new Vec3(0.5, 63, 0.5))) // inside the ground
  disposeFly(bot)
})

test('waitForTicks waits roughly tick-duration milliseconds', async () => {
  const bot = mockBot()
  installFly(bot, { log: () => {} })
  const t0 = Date.now()
  await bot.waitForTicks(3)
  const dt = Date.now() - t0
  assert.ok(dt >= 140, `waitForTicks(3) returned after ${dt}ms`)
  disposeFly(bot)
})

test('flyTravel climbs, cruises and lands on the target column', async () => {
  // a hill between the bot and the target, top at y=67; cruiseAbove 5 puts the cruise
  // lane at y=69, which clears the hill (the bot needs y=69 and y=70 free)
  const extra = {}
  for (let x = 8; x <= 12; x++) {
    for (let y = 64; y <= 67; y++) extra[`${x},${y},0`] = 'stone'
  }
  const bot = mockBot(extra)
  installFly(bot, { speed: 3.0, antiKick: false, log: () => {} })
  await bot.flyTravel(new Vec3(20.5, 64, 0.5), { cruiseAbove: 5, timeoutMs: 10000 })
  const p = bot.entity.position
  assert.equal(Math.floor(p.x), 20)
  assert.equal(Math.floor(p.z), 0)
  assert.equal(Math.floor(p.y), 64, `must land on the ground, got y=${p.y}`)
  disposeFly(bot)
})
