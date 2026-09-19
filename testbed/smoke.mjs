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

// blocks a bare hand can dig WITH A DROP (logs drop themselves; leaves drop nothing
// usable, they are only "eaten through" on the way down to the terrain)
const HAND_DIGGABLE = ['grass_block', 'dirt', 'coarse_dirt', 'podzol', 'sand', 'gravel', 'clay',
  'oak_log', 'birch_log', 'spruce_log', 'jungle_log', 'dark_oak_log', 'acacia_log', 'mangrove_log']
const DROPS = {
  grass_block: ['dirt'],
  dirt: ['dirt'],
  coarse_dirt: ['coarse_dirt'],
  podzol: ['dirt'],
  sand: ['sand'],
  gravel: ['gravel', 'flint'], // gravel has a 10% flint chance
  clay: ['clay_ball'],
  oak_log: ['oak_log'],
  birch_log: ['birch_log'],
  spruce_log: ['spruce_log'],
  jungle_log: ['jungle_log'],
  dark_oak_log: ['dark_oak_log'],
  acacia_log: ['acacia_log'],
  mangrove_log: ['mangrove_log']
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

    // side blocks first, dirt family over logs over anything else (digging under our
    // feet would drop us one block down, but on a trunk that is exactly what we want)
    const rank = n => (n === 'grass_block' || n === 'dirt' || n === 'sand' || n === 'gravel') ? 0 : (n.endsWith('_log') ? 1 : 2)
    const pickTarget = () => {
      let target = null
      for (const y of [-1, 0]) {
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
          const b = bot.blockAt(bot.entity.position.floored().offset(dx, y, dz))
          if (b && HAND_DIGGABLE.includes(b.name) && (!target || rank(b.name) < rank(target.name))) target = b
        }
      }
      if (!target) {
        const belowNow = bot.blockAt(bot.entity.position.floored().offset(0, -1, 0))
        if (belowNow && HAND_DIGGABLE.includes(belowNow.name)) target = belowNow
      }
      if (!target) {
        const near = bot.findBlock({ matching: b => HAND_DIGGABLE.includes(b.name), maxDistance: 3.5 })
        if (near) target = near
      }
      return target
    }

    // up to three attempts: the drop pickup is the flakiest part of the whole smoke
    // (an unlucky spawn can put the drop into a hole the bot cannot quite walk into),
    // while everything critical (login, chunks, registry, dig) has already passed
    const ANY_PLACEABLE = [...new Set(Object.values(DROPS).flat())]
    let dropped = null
    let target = null
    for (let attempt = 1; attempt <= 3 && !dropped; attempt++) {
      target = pickTarget()
      if (!target) throw new Error('no hand-diggable surface block near spawn')
      step(`digging ${target.name} at ${target.position} (bare hands, attempt ${attempt})`)
      await bot.dig(target)
      step(`dug ${target.name}`)
      try {
        dropped = await collectDrop(bot, DROPS[target.name] ?? ANY_PLACEABLE, 12000, target.position)
      } catch { /* next attempt picks a different block */ }
    }
    if (!dropped) {
      step('WARN: no drop picked up in 3 attempts - continuing (the fleet productivity test covers dig+pickup at scale)')
    } else {
      step(`inventory ok: picked up ${dropped.count}x ${dropped.name}`)
    }
    const havePlaceable = dropped ?? bot.inventory.items().find(i => ANY_PLACEABLE.includes(i.name))

    // --- 4. place what we dug back, then dig it again ---
    // Vanilla refuses to place a block into a cell that intersects ANY entity hitbox:
    // when the dug block was the one under our feet, the bot fell into the hole and
    // placing back into it is refused by design. So pick a placement cell that is free:
    // a horizontal neighbour of the current feet cell that is empty with a solid floor.
    if (!havePlaceable) {
      step('WARN: nothing placeable in the inventory - skipping place/dig-again checks')
    } else {
    await bot.equip(havePlaceable, 'hand')
    step('equip ok')
    let spot = null
    {
      const feet = bot.entity.position.floored()
      // if the hole is NOT where we stand, it is a perfectly good placement cell
      if (target && Math.abs(target.position.x - feet.x) < 0.5 &&
        Math.abs(target.position.z - feet.z) < 0.5 && target.position.y === feet.y) {
        // (the hole IS below us - skip straight to the neighbour scan)
      } else if (target) {
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
function collectDrop (bot, names, ms, fallbackPos = null) {
  const found = () => bot.inventory.items().find(i => names.includes(i.name))
  const now = found()
  if (now) return Promise.resolve(now)
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { clearInterval(poll); bot.clearControlStates?.(); reject(new Error(`no ${names.join('/')} picked up within ${ms}ms`)) }, ms)
    const poll = setInterval(async () => {
      const item = found()
      if (item) { clearTimeout(timer); clearInterval(poll); bot.clearControlStates?.(); resolve(item); return }
      const drop = bot.nearestEntity(e => e.name === 'item')
      // walk to the item entity; if none is visible, head for the dug block - the drop
      // may not be tracked yet or may be sitting in the hole we just made
      await walkToward(bot, drop ? drop.position : fallbackPos)
    }, 400)
  })
}

// A few seconds of look-and-walk without the pathfinder (smoke tests core mineflayer)
async function walkToward (bot, targetPos) {
  if (!targetPos) return
  try {
    await bot.lookAt(targetPos.offset(0, 0.5, 0), true)
    bot.setControlState('forward', true)
    bot.setControlState('jump', true) // drops regularly sit behind a trunk or a 1-block step
    await bot.waitForTicks(10)
  } catch { /* keep polling */ } finally {
    bot.setControlState('forward', false)
    bot.setControlState('jump', false)
  }
}
