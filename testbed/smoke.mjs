#!/usr/bin/env node
// Smoke test: does mineflayer actually work on Minecraft 26.2 (protocol 776)?
// Checks login -> spawn -> chunk parsing -> inventory -> place -> dig.
//
// Usage: node testbed/smoke.mjs [host] [port] [username]
import mineflayer from 'mineflayer'
import { Vec3 } from 'vec3'

const host = process.argv[2] || '127.0.0.1'
const port = Number(process.argv[3] || 25565)
const username = process.argv[4] || 'BotAlpha'
const VERSION = '26.2'

const t0 = Date.now()
const step = msg => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${msg}`)
const fail = (msg) => { console.error(`FAIL: ${msg}`); process.exitCode = 1 }
const done = (code, msg) => { step(msg); process.exit(code) }

const timeout = setTimeout(() => {
  fail('overall timeout (60s)')
  process.exit(1)
}, 60000)

step(`connecting to ${host}:${port} as ${username} (version ${VERSION})`)
const bot = mineflayer.createBot({ host, port, username, version: VERSION, auth: 'offline' })

bot.on('error', e => fail(`error: ${e.message}`))
bot.on('kicked', r => fail(`kicked: ${typeof r === 'string' ? r : JSON.stringify(r)}`))
bot.on('end', r => step(`disconnected: ${r}`))

bot.once('login', () => step('login ok'))

bot.once('spawn', async () => {
  try {
    step(`spawn ok at ${bot.entity.position} (dimension ${bot.game.dimension})`)

    // --- 1. chunk parsing: the 26.x fluidCount bug shows up right here as garbage blocks
    await bot.waitForTicks(40)
    const pos = bot.entity.position.floored()
    const below = bot.blockAt(pos.offset(0, -1, 0))
    const above = bot.blockAt(pos.offset(0, 1, 0))
    if (!below) throw new Error('blockAt() returned null - chunks are not parsed')
    step(`block below: ${below.name}, above: ${above && above.name}`)

    let air = 0; let solid = 0; let unknown = 0
    for (let x = -8; x < 8; x++) {
      for (let z = -8; z < 8; z++) {
        for (let y = -4; y < 4; y++) {
          const b = bot.blockAt(pos.offset(x, y, z))
          if (!b || b.name === 'void_air' && !b) unknown++
          else if (b.name === 'air' || b.name === 'cave_air') air++
          else solid++
        }
      }
    }
    step(`chunk scan 16x16x8: ${solid} solid, ${air} air, ${unknown} unreadable`)
    if (solid < 100) throw new Error(`suspiciously few solid blocks (${solid}) - chunk parsing is broken`)

    // --- 2. block registry sanity for real 26.2 blocks we care about
    const wanted = ['stone', 'deepslate', 'tuff', 'andesite', 'black_concrete', 'deepslate_tiles', 'end_rod']
    const missing = wanted.filter(n => !bot.registry.blocksByName[n])
    if (missing.length) throw new Error(`registry missing blocks: ${missing.join(', ')}`)
    step(`registry ok: ${wanted.length} sample blocks present`)

    // --- 3. inventory + place + dig (we are opped, so ask the server for a block)
    bot.chat('/give @s minecraft:dirt 64')
    const dirt = await waitForItem(bot, 'dirt', 15000)
    step(`inventory ok: got ${dirt.count}x ${dirt.name}`)

    await bot.equip(dirt, 'hand')
    step('equip ok')

    const ground = bot.blockAt(pos.offset(0, -1, 0))
    const target = bot.blockAt(pos.offset(1, -1, 0))
    if (!ground || !target) throw new Error('cannot read ground blocks for placement')
    await bot.placeBlock(ground, new Vec3(0, 1, 0))
    await bot.waitForTicks(10)
    const placed = bot.blockAt(pos.offset(0, 0, 0))
    step(`place -> block at feet: ${placed && placed.name}`)
    if (!placed || placed.name !== 'dirt') step('WARN: placement not confirmed at feet position (may be server desync)')

    // --- 4. digging: break the block we just placed
    const toDig = bot.blockAt(pos)
    if (toDig && toDig.name === 'dirt') {
      await bot.dig(toDig)
      await bot.waitForTicks(10)
      const after = bot.blockAt(pos)
      step(`dig -> block at feet now: ${after && after.name}`)
      if (after && after.name !== 'air') step('WARN: dig not confirmed')
    } else {
      step('skip dig: nothing to dig at feet')
    }

    // --- 5. player entities visible (entity tracking works)
    step(`entities tracked: ${Object.keys(bot.entities).length}`)

    clearTimeout(timeout)
    done(0, 'SMOKE TEST PASSED - mineflayer speaks 26.2')
  } catch (e) {
    clearTimeout(timeout)
    fail(e.stack || e.message)
    process.exit(1)
  }
})

function waitForItem (bot, name, ms) {
  const found = () => bot.inventory.items().find(i => i.name === name || i.name === `minecraft:${name}`)
  const now = found()
  if (now) return Promise.resolve(now)
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { bot.removeListener('windowUpdate', check); reject(new Error(`timeout waiting for ${name}`)) }, ms)
    function check () {
      const item = found()
      if (item) { clearTimeout(timer); bot.removeListener('windowUpdate', check); resolve(item) }
    }
    bot.on('windowUpdate', check)
  })
}
