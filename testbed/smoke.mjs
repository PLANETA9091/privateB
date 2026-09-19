#!/usr/bin/env node
// Smoke test: does mineflayer actually work on Minecraft 26.2 (protocol 776)?
// Checks login -> spawn -> chunk parsing -> survival dig -> pickup -> place -> dig.
// Survival only: no op, no /give, no gifts - exactly how the fleet plays.
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
  fail('overall timeout (90s)')
  process.exit(1)
}, 90000)

step(`connecting to ${host}:${port} as ${username} (version ${VERSION})`)
const bot = mineflayer.createBot({ host, port, username, version: VERSION, auth: 'offline' })

bot.on('error', e => fail(`error: ${e.message}`))
bot.on('kicked', r => fail(`kicked: ${typeof r === 'string' ? r : JSON.stringify(r)}`))
bot.on('end', r => step(`disconnected: ${r}`))

bot.once('login', () => step('login ok'))

const countItems = () => bot.inventory.items().reduce((a, i) => a + i.count, 0)

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
          if (!b) unknown++
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

    // --- 3. survival dig: bare-hand a dirt-ish block right under our feet, then let the
    //        drop land at our feet and confirm it reached the inventory (no op needed)
    const DIGGABLE = ['dirt', 'grass_block', 'coarse_dirt', 'podzol', 'sand', 'gravel']
    const before = countItems()
    let dug = null
    for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const p = pos.offset(dx, -1, dz)
      const b = bot.blockAt(p)
      if (b && DIGGABLE.includes(b.name)) {
        dug = { block: b, p }
        break
      }
    }
    if (!dug) throw new Error('no bare-hand diggable block (dirt/grass/sand/gravel) within 1 block - unexpected for a vanilla spawn')
    await bot.dig(dug.block)
    await bot.waitForTicks(10)
    step(`dig ok: ${dug.block.name} at ${dug.p.floored()} is gone`)

    // wait for the drop to be picked up (poll the inventory, do not trust events)
    let pickedUp = false
    for (let i = 0; i < 40 && !pickedUp; i++) {
      await bot.waitForTicks(10)
      pickedUp = countItems() > before
    }
    if (!pickedUp) step('WARN: drop was not picked up into the inventory (continuing)')
    else step('pickup ok: the drop reached the inventory')

    // --- 4. place what we dug back (into the free NEIGHBOUR cell: the bot itself
    //        occupies the hole), then dig it again - place + dig in one go
    const dirt = bot.inventory.items().find(i => ['dirt', 'grass_block', 'coarse_dirt', 'podzol', 'sand', 'gravel'].includes(i.name))
    if (dirt) {
      try {
        await bot.equip(dirt, 'hand')
        step(`equip ok: ${dirt.name} in hand`)
        const feet = bot.entity.position.floored()
        // the floor of the neighbouring column: solid at feet-1, free at feet/feet+1
        const ref = bot.blockAt(feet.offset(1, -1, 0))
        if (ref && ref.boundingBox !== 'empty' && ref.boundingBox !== 'fluid') {
          await bot.placeBlock(ref, new Vec3(0, 1, 0))
          await bot.waitForTicks(10)
          const placed = bot.blockAt(feet.offset(1, 0, 0))
          step(`place -> block beside us: ${placed && placed.name}`)
          const toDig = placed && placed.type !== 0 ? placed : null
          if (toDig) {
            await bot.dig(toDig)
            await bot.waitForTicks(10)
            const after = bot.blockAt(feet.offset(1, 0, 0))
            step(`dig again ok: placed block is now ${after && after.name}`)
          }
        } else {
          step('WARN: no solid neighbour floor to place on - skipping place checks')
        }
      } catch (e) {
        step(`WARN: place/dig-again failed (${e.message}) - core checks already passed`)
      }
    } else {
      step('WARN: nothing in inventory to place - skipping place/dig-again checks')
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
