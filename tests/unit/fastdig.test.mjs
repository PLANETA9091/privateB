// Rage FastBreak against a mock bot: verifies the packet sequence and the
// "gone" detection that keeps fastDig from looping forever on unbreakable blocks.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Vec3 } from 'vec3'
import { installRageFastBreak } from '../../src/lib/fastdig.mjs'

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
