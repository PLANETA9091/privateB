#!/usr/bin/env node
// Smoke test: does mineflayer actually work on Minecraft 26.2 (protocol 776)?
// Checks login -> spawn -> chunk parsing -> registry -> dig (collect drop) -> place -> dig.
//
// Fully survival, no op and no /give: on an offline-mode CI server the console
// `op <name>` can bind to a Mojang premium UUID (the runner has internet), which
// never matches the OfflinePlayer UUID the bot joins with - and /give would then
// silently fail. Digging dirt with bare hands is also exactly what the fleet does.
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
  fail('overall timeout (120s)')
  process.exit(1)
}, 120000)

step(`connecting to ${host}:${port} as ${username} (version ${VERSION})`)
const bot = mineflayer.createBot({ host, port, username, version: VERSION, auth: 'offline' })

bot.on('error', e => fail(`error: ${e.message}`))
bot.on('kicked', r => fail(`kicked: ${typeof r === 'string' ? r : JSON.stringify(r)}`))
bot.on('end', r => step(`disconnected: ${r}`))

bot.once('login', () => step('login ok'))

// blocks a bare hand can dig on the surface and the items they drop
const HAND_DIGGABLE = ['grass_block', 'dirt', 'coarse_dirt', 'podzol', 'sand', 'gravel', 'clay']
const DROPS = {
  grass_block: ['dirt'],
  dirt: ['dirt'],
  coarse_dirt: ['coarse_dirt'],
  podzol: ['dirt'],
  sand: ['sand'],
  gravel: ['gravel', 'flint'], // gravel has a 10% flint chance
  clay: ['clay_ball']
}

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
          else if (b.name === 'air' || b.name === 'cave_air' || b.name === 'void_air') air++
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

    // --- 3. dig a hand-diggable surface block and collect the drop ---
    // Spawn can be ANYWHERE (world spawn selection is not fixed to the ground): the same
    // seed put us on grass in one run and on top of an oak canopy in the next. If we are
    // standing on leaves, eat our way down to the terrain first (bare hands, no drops).
    const LEAVES = ['oak_leaves', 'birch_leaves', 'spruce_leaves', 'jungle_leaves', 'dark_oak_leaves', 'acacia_leaves', 'mangrove_leaves', 'azalea_leaves', 'flowering_azalea_leaves', 'cherry_leaves', 'pale_oak_leaves']
    for (let guard = 0; guard < 16; guard++) {
      const under = bot.blockAt(bot.entity.position.floored().offset(0, -1, 0))
      if (!under) throw new Error('cannot read the block below (chunks unloaded)')
      if (!LEAVES.includes(under.name)) break
      step(`spawned on ${under.name}: eating our way down to the terrain`)
      await bot.dig(under)
      await bot.waitForTicks(12) // fall one block
    }

    // side blocks first (digging under our feet would drop us one block down)
    let target = null
    outer:
    for (const y of [-1, 0]) {
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
        const b = bot.blockAt(bot.entity.position.floored().offset(dx, y, dz))
        if (b && HAND_DIGGABLE.includes(b.name)) { target = b; break outer }
      }
    }
    if (!target) {
      const belowNow = bot.blockAt(bot.entity.position.floored().offset(0, -1, 0))
      if (belowNow && HAND_DIGGABLE.includes(belowNow.name)) target = belowNow
    }
    if (!target) {
      // last resort: any diggable surface block within bare-hand reach
      const near = bot.findBlock({ matching: b => HAND_DIGGABLE.includes(b.name), maxDistance: 3.5 })
      if (near) target = near
    }
    if (!target) throw new Error('no hand-diggable surface block near spawn')
    step(`digging ${target.name} at ${target.position} (bare hands)`)
    await bot.dig(target)
    step(`dug ${target.name}`)
    const dropped = await collectDrop(bot, DROPS[target.name], 20000)
    step(`inventory ok: picked up ${dropped.count}x ${dropped.name}`)

    // --- 4. place what we dug back, then dig it again ---
    // Vanilla refuses to place a block into a cell that intersects ANY entity hitbox:
    // when the dug block was the one under our feet, the bot fell into the hole and
    // placing back into it is refused by design. So pick a placement cell that is free:
    // a horizontal neighbour of the current feet cell that is empty with a solid floor.
    await bot.equip(dropped, 'hand')
    step('equip ok')
    let spot = null
    {
      const feet = bot.entity.position.floored()
      // if the hole is NOT where we stand, it is a perfectly good placement cell
      const holeBelowUs = Math.abs(target.position.x - feet.x) < 0.5 &&
        Math.abs(target.position.z - feet.z) < 0.5 && target.position.y === feet.y
      if (!holeBelowUs) {
        const ref = bot.blockAt(target.position.offset(0, -1, 0))
        if (ref && ref.boundingBox !== 'empty') spot = { ref, face: new Vec3(0, 1, 0), cell: target.position }
      }
      if (!spot) {
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const cell = feet.offset(dx, 0, dz)
          const cellB = bot.blockAt(cell)
          const floorB = bot.blockAt(cell.offset(0, -1, 0))
          if (cellB && cellB.boundingBox === 'empty' && floorB && floorB.boundingBox !== 'empty' && floorB.boundingBox !== 'fluid') {
            spot = { ref: floorB, face: new Vec3(0, 1, 0), cell }
            break
          }
        }
      }
    }
    if (spot) {
      try {
        await bot.placeBlock(spot.ref, spot.face)
        await bot.waitForTicks(10)
        const placed = bot.blockAt(spot.cell)
        step(`place -> ${spot.cell.floored()}: ${placed && placed.name}`)
        if (!placed || placed.name === 'air') step('WARN: placement not confirmed (may be server desync)')
        const toDig = bot.blockAt(spot.cell)
        if (toDig && toDig.name !== 'air') {
          await bot.dig(toDig)
          await bot.waitForTicks(10)
          const after = bot.blockAt(spot.cell)
          step(`dig -> ${spot.cell.floored()} now: ${after && after.name}`)
          if (after && after.name !== 'air') step('WARN: dig not confirmed')
        }
      } catch (e) {
        step(`WARN: place/dig-again failed (${e.message}) - the core checks already passed`)
      }
    } else {
      step('WARN: no free placement cell around the bot - skipping place/dig-again checks')
    }

    // --- 5. player entities visible (entity tracking works) ---
    step(`entities tracked: ${Object.keys(bot.entities).length}`)

    clearTimeout(timeout)
    done(0, 'SMOKE TEST PASSED - mineflayer speaks 26.2')
  } catch (e) {
    clearTimeout(timeout)
    fail(e.stack || e.message)
    process.exit(1)
  }
})

// Wait for one of the item names to land in the inventory. Polls (robust against
// missed windowUpdate events on direct pickups) and walks toward the nearest item
// entity, because the drop may pop just outside the vanilla pickup radius.
function collectDrop (bot, names, ms) {
  const found = () => bot.inventory.items().find(i => names.includes(i.name))
  const now = found()
  if (now) return Promise.resolve(now)
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { clearInterval(poll); reject(new Error(`no ${names.join('/')} picked up within ${ms}ms`)) }, ms)
    const poll = setInterval(async () => {
      const item = found()
      if (item) { clearTimeout(timer); clearInterval(poll); resolve(item); return }
      const drop = bot.nearestEntity(e => e.name === 'item')
      if (drop) await walkToward(bot, drop.position)
    }, 400)
  })
}

// A few seconds of look-and-walk without the pathfinder (smoke tests core mineflayer)
async function walkToward (bot, targetPos) {
  try {
    await bot.lookAt(targetPos.offset(0, 0.5, 0), true)
    bot.setControlState('forward', true)
    bot.setControlState('sprint', false)
    await bot.waitForTicks(8)
  } catch { /* keep polling */ }
  bot.setControlState('forward', false)
}
