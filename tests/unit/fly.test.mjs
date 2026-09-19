// Fly module physics against a tiny in-memory world (no Minecraft server needed).
// Covers the movement rules that keep the server from kicking the bot:
// collision-aware stepping, anti-kick dipping, arrival detection, landing.
//
// Every test registers t.after(() => disposeFly(bot)): the 20 Hz ticker interval
// keeps the event loop alive, and a skipped cleanup (an assertion failure) would
// otherwise make the node --test child process hang forever.
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

test('installFly wires the API and disables physics', t => {
  const bot = mockBot()
  installFly(bot, { log: () => {} })
  t.after(() => disposeFly(bot))
  assert.equal(bot.physicsEnabled, false)
  assert.equal(typeof bot.flyTo, 'function')
  assert.equal(typeof bot.flyTravel, 'function')
  assert.equal(typeof bot.flySnap, 'function')
  assert.equal(typeof bot.flyStop, 'function')
  assert.equal(typeof bot.waitForTicks, 'function')
  disposeFly(bot)
  assert.equal(bot._flyTimer, null, 'disposeFly must stop the ticker')
})

test('flyTo moves the bot to a free target and resolves', async t => {
  const bot = mockBot()
  installFly(bot, { speed: 2.0, antiKick: false, log: () => {} })
  t.after(() => disposeFly(bot))
  await bot.flyTo(new Vec3(8.5, 64, 6.5), { timeoutMs: 5000 })
  const p = bot.entity.position
  assert.deepEqual([p.x, p.y, p.z], [8.5, 64, 6.5])
})

test('flyTo refuses to end inside solid terrain (collision-aware)', async t => {
  // a 2-thick wall reaching the mock sky: the bot climbs 2 blocks PER TICK, so a wall
  // with a top (say y<=70) would simply be climbed over within a few ticks - it must
  // have no top at all for "no candidate works" to ever be true
  const extra = {}
  for (let y = 64; y <= 400; y++) {
    for (let z = -1; z <= 3; z++) extra[`5,${y},${z}`] = 'stone'
  }
  const bot = mockBot(extra)
  installFly(bot, { speed: 2.0, antiKick: false, digThrough: false, log: () => {} })
  t.after(() => disposeFly(bot))
  await assert.rejects(
    bot.flyTo(new Vec3(9.5, 64, 1.5), { timeoutMs: 700 }),
    /fly timeout|blocked|no progress/
  )
  // the bot must NOT have ended inside the wall
  const p = bot.entity.position
  const key = `${Math.floor(p.x)},${Math.floor(p.y)},${Math.floor(p.z)}`
  assert.ok(!extra[key], 'the bot ended up inside solid terrain')
})

test('flyTo climbs over a 2-block obstacle', async t => {
  // a single row of stone at y=64: the step candidates try [dx, max(dy,1)] and [dx, max(dy,2)]
  const extra = {}
  for (let z = -1; z <= 3; z++) extra[`4,64,${z}`] = 'stone'
  const bot = mockBot(extra)
  installFly(bot, { speed: 2.0, antiKick: false, digThrough: false, log: () => {} })
  t.after(() => disposeFly(bot))
  await bot.flyTo(new Vec3(8.5, 64, 1.5), { timeoutMs: 6000 })
  const p = bot.entity.position
  assert.deepEqual([p.x, p.y, p.z], [8.5, 64, 1.5])
})

test('flyTo with digThrough digs through the blocking wall (via flyDigHook)', async t => {
  const extra = {}
  // The wall at x=3 reaches the mock sky, so climbing is impossible. Two more details
  // force the dig hook to actually fire: stepFree slides along z ([0,0,dz] candidates)
  // and climbs 1 ([0,1,0] checks the HEAD cell), so the ceiling above OUR column blocks
  // the climb and walls at z=0/2 block the slide. Without them the bot never gets fully
  // stuck - it wanders sideways until the no-progress check gives up without digging.
  for (let y = 64; y <= 200; y++) {
    for (let z = 0; z <= 2; z++) extra[`3,${y},${z}`] = 'stone' // the wall to dig through
    extra[`2,${y},0`] = 'stone' // no sliding along z ...
    extra[`2,${y},2`] = 'stone' // ... on either level
  }
  for (let y = 66; y <= 200; y++) extra[`2,${y},1`] = 'stone' // ceiling: no climbing out
  const bot = mockBot(extra)
  let dug = 0
  bot.flyDigHook = async () => {
    dug++
    for (const k of Object.keys(extra)) {
      if (k.startsWith('3,')) delete extra[k] // digging opens the wall (walls/ceiling stay)
    }
    return true
  }
  installFly(bot, { speed: 0.5, antiKick: false, digThrough: true, log: () => {} })
  t.after(() => disposeFly(bot))
  await bot.flyTo(new Vec3(6.5, 64, 1.5), { timeoutMs: 10000 })
  assert.ok(dug >= 1, 'the dig hook should have been used for the wall')
})

test('anti-kick dips the position every antiKickInterval ticks', async t => {
  const bot = mockBot()
  installFly(bot, { speed: 1.0, antiKick: true, antiKickInterval: 4, antiKickDistance: 0.05, log: () => {} })
  t.after(() => disposeFly(bot))
  let sawDip = false
  for (let i = 0; i < 14; i++) {
    await sleep(TICK_MS)
    if (Math.abs(bot.entity.position.y - 64) > 0.01) sawDip = true
  }
  assert.ok(sawDip, 'anti-kick dip never moved the position')
})

test('onGround is reported true (NoFall) while flying', async t => {
  const bot = mockBot()
  installFly(bot, { antiKick: false, log: () => {} })
  t.after(() => disposeFly(bot))
  await sleep(3 * TICK_MS + 10)
  assert.equal(bot.entity.onGround, true)
})

test('flySnap only teleports into free space', t => {
  const bot = mockBot()
  installFly(bot, { log: () => {} })
  t.after(() => disposeFly(bot))
  assert.ok(bot.flySnap(new Vec3(2.5, 64, 2.5))) // free air above the ground
  assert.ok(!bot.flySnap(new Vec3(0.5, 63, 0.5))) // inside the ground
})

test('waitForTicks waits roughly tick-duration milliseconds', async t => {
  const bot = mockBot()
  installFly(bot, { log: () => {} })
  t.after(() => disposeFly(bot))
  const t0 = Date.now()
  await bot.waitForTicks(3)
  const dt = Date.now() - t0
  assert.ok(dt >= 140, `waitForTicks(3) returned after ${dt}ms`)
})

test('flyTravel climbs, cruises and lands on the target column', async t => {
  // a hill between the bot and the target, top at y=67; cruiseAbove 5 puts the cruise
  // lane at y=69, which clears the hill (the bot needs y=69 and y=70 free)
  const extra = {}
  for (let x = 8; x <= 12; x++) {
    for (let y = 64; y <= 67; y++) extra[`${x},${y},0`] = 'stone'
  }
  const bot = mockBot(extra)
  installFly(bot, { speed: 3.0, antiKick: false, log: () => {} })
  t.after(() => disposeFly(bot))
  await bot.flyTravel(new Vec3(20.5, 64, 0.5), { cruiseAbove: 5, timeoutMs: 10000 })
  const p = bot.entity.position
  assert.equal(Math.floor(p.x), 20)
  assert.equal(Math.floor(p.z), 0)
  assert.equal(Math.floor(p.y), 64, `must land on the ground, got y=${p.y}`)
})
