// Rage FastBreak against a mock bot: verifies the packet sequence and the
// "gone" detection that keeps fastDig from looping forever on unbreakable blocks.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Vec3 } from 'vec3'
import { installRageFastBreak, digFaceFor, FACE_TOP, FACE_BOTTOM } from '../../src/lib/fastdig.mjs'

function mockBot (options = {}) {
  const packets = []
  let swings = 0
  const bot = {
    _client: { write: (name, data) => packets.push({ name, data }) },
    digTime: () => 999,
    swingArm: () => { swings++ },
    lookAt: async () => {},
    waitForTicks: async () => {},
    blockAt (pos) {
      if (options.goneAfter != null && --options.ticksLeft <= 0) return null
      return { type: 1, name: 'stone', position: pos }
    }
  }
  // (v0.75.0) an optional entity position so the overhead-face tests can pin
  // the eye->block geometry through the real fastDig packet path
  if (options.entityY != null) bot.entity = { position: { x: 0, y: options.entityY, z: 0 } }
  return { bot, packets, swings: () => swings }
}

test('fastDig sends START then STOP_DESTROY_BLOCK spam and returns true when the block vanishes', async () => {
  const { bot, packets } = mockBot({ goneAfter: 2, ticksLeft: 3 })
  installRageFastBreak(bot, { log: () => {} })
  // real mineflayer blocks carry a Vec3 position (fastDig calls pos.offset)
  const ok = await bot.fastDig({ type: 1, name: 'stone', position: new Vec3(1, 2, 3) })
  assert.equal(ok, true)
  const digs = packets.filter(p => p.name === 'block_dig')
  assert.ok(digs.length >= 2, 'expected START + STOP packets')
  assert.equal(digs[0].data.status, 0, 'first packet must be START_DESTROY_BLOCK')
  assert.ok(digs.some(p => p.data.status === 2), 'STOP_DESTROY_BLOCK must be spammed')
  assert.equal(digs[0].data.location.x, 1)
})

test('fastDig returns true immediately for air (type 0)', async () => {
  const { bot, packets } = mockBot()
  installRageFastBreak(bot, { log: () => {} })
  const ok = await bot.fastDig({ type: 0, name: 'air', position: { x: 0, y: 0, z: 0 } })
  assert.equal(ok, true)
  assert.equal(packets.length, 0, 'no packets for air')
})

test('fastDig gives up after 100 ticks on an unbreakable block (bedrock)', async () => {
  const { bot } = mockBot() // block never disappears
  installRageFastBreak(bot, { log: () => {} })
  const ok = await bot.fastDig({ type: 1, name: 'bedrock', position: new Vec3(0, 4, 0) })
  assert.equal(ok, false)
})

test('fastDig zeroes bot.digTime (rage mode) and keeps the real one', () => {
  const { bot } = mockBot()
  installRageFastBreak(bot, { log: () => {} })
  assert.equal(bot.digTime(), 0)
  assert.equal(typeof bot.realDigTime, 'function')
  assert.equal(bot.realDigTime(), 999)
})

test('installing twice does not double-wrap fastDig', () => {
  const { bot } = mockBot()
  const first = installRageFastBreak(bot, { log: () => {} })
  const second = installRageFastBreak(bot, { log: () => {} })
  assert.equal(first, second)
})

// ---------------------------------------------------------------------------
// (v0.75.0) THE OVERHEAD FACE. Fleet 35715109688 (master 0f06bf5): 94 climb
// refusals, every one the ceiling cell at feet+2, one cell refusing the WHOLE
// run (F3 [-111,44,421] across all four bearings and every escalated retry)
// while the bot HELD a stone pickaxe - 12-46-tick digs cannot fail a 200-tick
// window, the dig never starts. fastDig hardcoded face=1 (top); a block above
// the eye has no reachable top face, so vanilla discards the dig.

test('digFaceFor: a block center above the eye gets the BOTTOM face (the run71 overhead class)', () => {
  // feet y=42, eye 43.62, ceiling block center 44.5 - the exact F3 geometry
  assert.equal(digFaceFor({ eyeY: 42 + 1.62, blockCenterY: 44 + 0.5 }), FACE_BOTTOM)
  // one tick above the eye is still overhead
  assert.equal(digFaceFor({ eyeY: 10, blockCenterY: 10.1 }), FACE_BOTTOM)
})

test('digFaceFor: floor and eye-level cells keep the historical TOP face', () => {
  // the floor dig (feet-1): mined 1325 blocks/run with face=1 - byte-identical
  assert.equal(digFaceFor({ eyeY: 42 + 1.62, blockCenterY: 41 + 0.5 }), FACE_TOP)
  // exactly at eye level: the top plane is at eye height, keep the legacy face
  assert.equal(digFaceFor({ eyeY: 10, blockCenterY: 10 }), FACE_TOP)
})

test('digFaceFor: junk reads fall back to the top face (mocks dig as before)', () => {
  assert.equal(digFaceFor({}), FACE_TOP)
  assert.equal(digFaceFor({ eyeY: null, blockCenterY: 44.5 }), FACE_TOP)
  assert.equal(digFaceFor({ eyeY: NaN, blockCenterY: NaN }), FACE_TOP)
  assert.equal(digFaceFor({ eyeY: 'junk', blockCenterY: {} }), FACE_TOP)
})

test('fastDig sends face=0 (bottom) for an overhead block through the real packet path', async () => {
  const { bot, packets } = mockBot({ entityY: 42, goneAfter: 1, ticksLeft: 2 })
  installRageFastBreak(bot, { log: () => {} })
  // ceiling block at y=44 - the stepDigPlan first-dig cell the whole run71 class died on
  await bot.fastDig({ type: 1, name: 'stone', position: new Vec3(-111, 44, 421) })
  const digs = packets.filter(p => p.name === 'block_dig')
  assert.ok(digs.length >= 1)
  assert.equal(digs[0].data.face, 0, 'the overhead dig must target the BOTTOM face')
})

test('fastDig keeps face=1 (top) for a floor dig and for entity-less mocks', async () => {
  // floor dig with a live entity: block center below the eye -> legacy top face
  const floor = mockBot({ entityY: 42, goneAfter: 1, ticksLeft: 2 })
  installRageFastBreak(floor.bot, { log: () => {} })
  await floor.bot.fastDig({ type: 1, name: 'dirt', position: new Vec3(0, 41, 0) })
  assert.equal(floor.packets[0].data.face, 1, 'floor digs keep the top face')

  // no entity at all (old mocks, headless callers): legacy top face
  const bare = mockBot({ goneAfter: 1, ticksLeft: 2 })
  installRageFastBreak(bare.bot, { log: () => {} })
  await bare.bot.fastDig({ type: 1, name: 'stone', position: new Vec3(3, 44, 3) })
  assert.equal(bare.packets[0].data.face, 1, 'entity-less mocks keep the legacy face')
})

// ---------------------------------------------------------------------------
// (v0.97.0) THE DIG TICK GUARD. run86 (35809634630) F14: `tunnel: 0 blocks`
// printed, then SILENCE - a dig's `await bot.waitForTicks(1)` never resolved
// (frozen client physics) and the bot hung past the deadline with no final
// bank, wedging the whole fleet into the hard kill behind it. The guard races
// every tick-wait against a wall clock; 3 consecutive fires = the client is
// frozen, fastDig returns gone() honestly instead of spinning forever.

test('fastDig returns honestly when the client physics freeze (waitForTicks never resolves, run86 F14 class)', async () => {
  const { bot, packets } = mockBot() // block never disappears, and no tick ever fires
  bot.waitForTicks = () => new Promise(() => {}) // the frozen client: an eternal await
  installRageFastBreak(bot, { log: () => {} })
  const t0 = Date.now()
  const ok = await bot.fastDig({ type: 1, name: 'stone', position: new Vec3(0, 4, 0) }, { tickGuardMs: 20 })
  assert.equal(ok, false, 'the frozen verdict is an honest gone() - best-effort after the STOP spam')
  const elapsed = Date.now() - t0
  assert.ok(elapsed < 3000, `3 guard fires x 20ms must resolve in well under a second, took ${elapsed}ms`)
  const digs = packets.filter(p => p.name === 'block_dig')
  assert.ok(digs.some(p => p.data.status === 0), 'START was still sent before the freeze verdict')
  assert.ok(digs.length >= 3, 'the STOP spam kept running during the guard window')
})

test('fastDig recovers when ticks resume after a lag spike (the guard resets on the first real tick)', async () => {
  let resolveTick = null
  const { bot } = mockBot({ goneAfter: 2, ticksLeft: 4 })
  bot.waitForTicks = () => new Promise(r => { resolveTick = r }) // ticks stall...
  installRageFastBreak(bot, { log: () => {} })
  const dig = bot.fastDig({ type: 1, name: 'stone', position: new Vec3(1, 2, 3) }, { tickGuardMs: 30 })
  let settled = false
  dig.then(() => { settled = true })
  await new Promise(r => setTimeout(r, 80)) // two guard fires (< 3 = not yet frozen)
  assert.equal(settled, false, 'harness sanity: the dig is still pending after 2 guard fires')
  bot.blockAt = () => null // the server removes the block the moment ticks resume
  resolveTick() // ...a tick arrives - the streak resets
  const ok = await dig
  assert.equal(ok, true, 'a resumed tick clears the frozen streak - the dig completes honestly')
})

test('fastDig junk tickGuardMs keeps the legacy unbounded wait (byte for byte)', async () => {
  const { bot } = mockBot({ goneAfter: 1, ticksLeft: 2 })
  installRageFastBreak(bot, { log: () => {} })
  const ok = await bot.fastDig({ type: 1, name: 'stone', position: new Vec3(0, 4, 0) }, { tickGuardMs: 0 })
  assert.equal(ok, true, 'a zero guard disables the race - the legacy shape for fast mocks')
})
