#!/usr/bin/env node
// Measures what rage FastBreak actually does on this server, with NO op and NO items:
// one bare-handed bot mines hand-breakable blocks, first with the honest client
// dig time (control), then with STOP_DESTROY_BLOCK spam (the cheat).
//
//   node testbed/rage-bench.mjs [blocksPerPhase] [host] [port]
import mineflayer from 'mineflayer'
import { Vec3 } from 'vec3'
import { installFly } from '../src/lib/fly.mjs'
import { installRageFastBreak } from '../src/lib/fastdig.mjs'

const N = Number(process.argv[2] || 15)
const HOST = process.argv[3] || '127.0.0.1'
const PORT = Number(process.argv[4] || 25565)
const SOFT = ['dirt', 'grass_block', 'coarse_dirt', 'podzol', 'sand', 'gravel', 'clay', 'soul_sand']

const bot = mineflayer.createBot({ host: HOST, port: PORT, username: 'BotRage', version: '26.2', auth: 'offline' })
bot.on('error', e => { console.error('FAIL error:', e.message); process.exit(1) })
bot.on('kicked', r => { console.error('FAIL kicked:', JSON.stringify(r)); process.exit(1) })

bot.once('spawn', async () => {
  installFly(bot, { speed: 1.0, antiKick: true })
  installRageFastBreak(bot)
  console.log(`spawn at ${bot.entity.position.floored()} - no op, no items, bare hands`)
  await descendToGround()
  console.log(`on the ground at ${bot.entity.position.floored()}`)

  const control = await phase('control (honest client dig time)', false)
  const rage = await phase('rage fastbreak (STOP spam)', true)

  console.log('================ RESULT ================')
  console.log(`control: ${control.mined} blocks / ${control.secs.toFixed(1)}s = ${control.rate.toFixed(2)} blocks/s`)
  console.log(`rage:    ${rage.mined} blocks / ${rage.secs.toFixed(1)}s = ${rage.rate.toFixed(2)} blocks/s`)
  console.log(`speedup: ${(rage.rate / control.rate).toFixed(2)}x`)
  console.log(`drops in inventory: ${bot.inventory.items().map(i => `${i.name}x${i.count}`).join(', ') || '(none)'}`)
  bot.quit()
  process.exit(0)
})

async function phase (label, useRage) {
  const targets = scanSoft(N)
  console.log(`--- ${label}: ${targets.length} targets ---`)
  let mined = 0
  const t0 = Date.now()
  for (const pos of targets) {
    const block = bot.blockAt(pos)
    if (!block || !SOFT.includes(block.name)) continue
    const center = new Vec3(pos.x + 0.5, pos.y + 0.5, pos.z + 0.5)
    try {
      await bot.flyTo(center)
    } catch {
      continue
    }
    const cur = bot.blockAt(pos)
    if (!cur || cur.type === 0) continue
    if (useRage) {
      if (await bot.fastDig(cur)) mined++
    } else {
      bot.digTime = bot.realDigTime
      try {
        await bot.dig(cur)
        mined++
      } catch { /* ignore */ }
    }
  }
  const secs = (Date.now() - t0) / 1000
  return { mined, secs, rate: secs > 0 ? mined / secs : 0 }
}

// Scan a volume around the bot for hand-breakable blocks, nearest first.
function scanSoft (want) {  const p = bot.entity.position.floored()
  const found = []
  for (let dy = -6; dy <= 4; dy++) {
    for (let dx = -14; dx <= 14; dx++) {
      for (let dz = -14; dz <= 14; dz++) {
        const pos = new Vec3(p.x + dx, p.y + dy, p.z + dz)
        const b = bot.blockAt(pos)
        if (b && SOFT.includes(b.name)) found.push(pos)
      }
    }
  }
  found.sort((a, b) => a.distanceTo(bot.entity.position) - b.distanceTo(bot.entity.position))
  return found.slice(0, want)
}

// Fly straight down until solid ground, so a bot that spawned on a cliff still finds blocks.
async function descendToGround () {
  const p = bot.entity.position
  const x = Math.floor(p.x)
  const z = Math.floor(p.z)
  for (let y = Math.floor(p.y); y > bot.game.minY + 1; y--) {
    const b = bot.blockAt(new Vec3(x, y, z))
    if (b && b.type !== 0) {
      try {
        await bot.flyTo(new Vec3(x + 0.5, y + 1.2, z + 0.5))
      } catch { /* keep going */ }
      return y
    }
  }
  return null
}
