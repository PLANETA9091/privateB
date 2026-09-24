#!/usr/bin/env node
// THE PILLAR PROBE (v0.136.0-era evidence rig, the deep-pocket gambit's design note).
//
// THE QUESTION the open front needs answered before anyone codes the rescue lane:
// a physics-wedged client in a deep water pocket cannot swim, jump, or dig its way
// out (run550's F16/F12 chains: the ascend dug the ceiling, the client froze before
// it could swim into the hole, the relog lottery burned the air budget). But block
// PLACEMENT is a protocol action - no client physics required - and the relog lane
// already proves packets flow from a wedged client. So the gambit: can SERVER-SIDE
// block mechanics lift a bot out of a water column without any client physics?
//
// Three empirical answers, measured against a live vanilla 26.2 server:
//   Q1 - placeBlock INTO the bot's own occupied feet cell: accepted or rejected?
//        (expected: rejected - the vanilla placement entity-collision check)
//   Q2 - SAND dropped into the cell ABOVE the head (a falling block, no hitbox
//        intersection at placement time): does it fall through the water column,
//        land under the bot, and EJECT the bot upward (the vanilla push-out)?
//   Q3 - does repeating Q2 pillar the bot up toward the surface (the rescue lane)?
//
// Everything is console-built infrastructure (the setup-yard class) around the
// bot's own feet; the sand the bot places is DUG by the bot first (survival, no
// gifts, no op). Pure evidence: no assertions, exit 0 always, everything logged.
// Usage: node testbed/pillar-probe.mjs [host] [port] [username]
import mineflayer from 'mineflayer'
import { Vec3 } from 'vec3'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import pathfinderPkg from 'mineflayer-pathfinder'

const { pathfinder, Movements, goals } = pathfinderPkg

const host = process.argv[2] || '127.0.0.1'
const port = Number(process.argv[3] || 25565)
const username = process.argv[4] || 'PillarProbe'
const VERSION = '26.2'
const GRAVITY_BLOCKS = ['sand', 'gravel']
const NEED = 4

const t0 = Date.now()
const log = m => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] [pillar-probe] ${m}`)
const sleep = ms => new Promise(r => setTimeout(r, ms))

const timeout = setTimeout(() => { log('FAIL: overall timeout (240s)'); process.exit(0) }, 240000)

const CONSOLE = 'testbed/server/console.log'
const cmd = (...words) => {
  try { execFileSync('scripts/server.sh', ['cmd', words.join(' ')], { stdio: 'pipe', timeout: 15000 }) } catch (e) { log(`cmd ${words.join(' ')} failed: ${e.message}`) }
}

const bot = mineflayer.createBot({ host, port, username, version: VERSION, auth: 'offline' })
bot.loadPlugin(pathfinder)
bot.on('error', e => log(`error: ${e.message}`))
bot.on('kicked', r => log(`kicked: ${typeof r === 'string' ? r : JSON.stringify(r)}`))
bot.on('end', r => { log(`disconnected: ${r}`) })

const invCount = name => bot.inventory.items().filter(i => i.name === name).reduce((a, i) => a + i.count, 0)
const invSummary = () => bot.inventory.items().map(i => `${i.name}x${i.count}`).join(' ') || '(empty)'
const y3 = v => Number(v).toFixed(2)
const blockAt = (x, y, z) => { try { const b = bot.blockAt(new Vec3(x, y, z)); return b ? b.name : 'unloaded' } catch { return 'unreadable' } }
const colRead = (x, z, ys) => ys.map(y => `y${y}=${blockAt(x, y, z)}`).join(' ')

bot.once('spawn', async () => {
  try {
    log(`spawned at ${bot.entity.position.floored()}`)
    cmd('time', 'set', 'day')
    cmd('kill', '@e[type=zombie]')
    cmd('kill', '@e[type=skeleton]')
    cmd('kill', '@e[type=drowned]')
    cmd('gamerule', 'doMobSpawning', 'false')
    await bot.waitForTicks(40)

    const movements = new Movements(bot)
    movements.allow1by1towers = true
    movements.canSwim = true
    bot.pathfinder.setMovements(movements)

    // --- 1. dig the gravity blocks the probe places later (survival, no gifts)
    let got = 0
    let chosen = null
    for (const name of GRAVITY_BLOCKS) {
      if (invCount(name) >= NEED) { chosen = name; got = invCount(name); break }
      const found = bot.findBlocks({ matching: b => b && b.name === name, maxDistance: 64, count: NEED * 2 }) || []
      for (const pos of found) {
        if (invCount(name) >= NEED) break
        try {
          await bot.pathfinder.goto(new goals.GoalNear(pos.x, pos.y, pos.z, 2))
          const b = bot.blockAt(pos)
          if (!b || !GRAVITY_BLOCKS.includes(b.name)) continue
          await bot.dig(b)
          await sleep(600) // the drop lands
          await bot.pathfinder.goto(new goals.GoalNear(pos.x, pos.y, pos.z, 1))
        } catch (e) { log(`dig ${name} at ${pos.floored()} failed: ${e.message}`) }
      }
      if (invCount(name) >= NEED) { chosen = name; got = invCount(name); break }
    }
    if (!chosen) { log('RESULT: SKIP - no sand/gravel within 64 blocks, the falling-block question stays open (build the rig near a beach next time)'); return }
    log(`collected ${got}x ${chosen}; inventory: ${invSummary()}`)
    const equipGravity = async () => {
      const it = bot.inventory.items().find(i => i.name === chosen)
      if (!it) return false
      try { await bot.equip(it, 'hand'); return true } catch (e) { log(`equip failed: ${e.message}`); return false }
    }

    // --- 2. THE RIG: a 3-deep water column under the bot's own feet, a stone
    // reference pillar adjacent. Console-built (the setup-yard class) - the bot
    // falls in the moment the floor opens.
    const p = bot.entity.position.floored()
    const fx = p.x; const fy = p.y; const fz = p.z
    log(`rig site feet cell (${fx},${fy},${fz}), ground reads: ${colRead(fx, fz, [fy - 1, fy])}`)
    cmd('setblock', fx + 1, fy, fz, 'minecraft:stone')   // the head-level reference
    cmd('setblock', fx + 1, fy + 1, fz, 'minecraft:stone') // the sand-drop reference
    cmd('setblock', fx, fy, fz, 'minecraft:water')
    cmd('setblock', fx, fy - 1, fz, 'minecraft:water')
    cmd('setblock', fx, fy - 2, fz, 'minecraft:water')
    await sleep(3500) // the bot sinks; the client physics own the fall
    const pos = bot.entity.position
    const feetY = Math.floor(pos.y)
    log(`sank: feet at ${y3(pos.y)} (feet cell y=${feetY}), column now: ${colRead(fx, fz, [fy + 1, fy, fy - 1, fy - 2, fy - 3])}`)
    const waterFeet = blockAt(fx, feetY, fz)
    if (!waterFeet.includes('water')) log(`NOTE: the feet cell reads ${waterFeet} - the rig did not catch the bot; the measurements below still run`)

    // --- Q1: place INTO the bot's own occupied feet cell (the hitbox test)
    const refFeet = bot.blockAt(new Vec3(fx + 1, feetY, fz))
    if (refFeet) {
      log(`Q1: placing ${chosen} INTO the own feet cell (${fx},${feetY},${fz}) via ref (${fx + 1},${feetY},${fz}) face -x ...`)
      await equipGravity()
      try {
        await bot.placeBlock(refFeet, new Vec3(-1, 0, 0))
        await bot.waitForTicks(10)
        log(`Q1 RESULT: placeBlock RESOLVED into the own cell; cell now reads ${blockAt(fx, feetY, fz)}; feet y=${y3(bot.entity.position.y)}`)
      } catch (e) {
        log(`Q1 RESULT: placeBlock REJECTED (${e.message}); cell reads ${blockAt(fx, feetY, fz)}`)
      }
    } else { log('Q1 SKIPPED: the feet-level reference block never landed in the world view') }

    // --- Q2/Q3: the falling-block pillar - sand into the cell ABOVE the head
    for (let round = 1; round <= 3; round++) {
      const before = bot.entity.position.y
      const refTop = bot.blockAt(new Vec3(fx + 1, fy + 1, fz))
      if (!refTop) { log(`Q${round + 1} SKIPPED: the drop-level reference never landed`); break }
      log(`Q${round + 1}: dropping ${chosen} into (${fx},${fy + 1},${fz}) - the cell above the head; feet before=${y3(before)}`)
      if (!(await equipGravity())) { log('out of gravity blocks - the ladder ends'); break }
      try {
        await bot.placeBlock(refTop, new Vec3(-1, 0, 0))
        log(`Q${round + 1}: place RESOLVED (the packet was accepted at head+1)`)
      } catch (e) { log(`Q${round + 1}: place REJECTED (${e.message})`); continue }
      await sleep(5000) // the falling block sinks through the water column
      const after = bot.entity.position.y
      log(`Q${round + 1} RESULT: feet ${y3(before)} -> ${y3(after)} (delta ${(after - before).toFixed(2)}), column: ${colRead(fx, fz, [fy + 1, fy, fy - 1, fy - 2, fy - 3])}, inventory ${invSummary()}`)
    }

    // --- the verdict line the design note needs
    log('VERDICT: read the Q lines above - Q1 rejected + a positive Q2/Q3 y-delta = the falling-block pillar IS the wedge-cure candidate (protocol-only, no client physics); Q1 rejected + zero deltas = the gambit is vanilla-dead, the front closes and the deep-pocket lane needs a different door.')
  } catch (e) {
    log(`probe error: ${e.message}`)
  } finally {
    clearTimeout(timeout)
    try { bot.quit() } catch { /* already gone */ }
    setTimeout(() => process.exit(0), 500)
  }
})
