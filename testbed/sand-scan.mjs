#!/usr/bin/env node
// Scan: where is sand around spawn? Log counts of sand/gravel/water in loaded chunks.
import mineflayer from 'mineflayer'
import Vec3 from 'vec3'

const bot = mineflayer.createBot({ host: '127.0.0.1', port: 25565, username: 'SandScan', version: '26.2' })
bot.once('spawn', async () => {
  await new Promise(r => setTimeout(r, 6000)) // let chunks load
  const counts = {}
  let nearestSand = null
  const me = bot.entity.position
  for (let dx = -128; dx <= 128; dx += 2) {
    for (let dz = -128; dz <= 128; dz += 2) {
      for (let dy = 50; dy <= 72; dy += 2) {
        try {
          const b = bot.blockAt(new Vec3(me.x + dx, dy, me.z + dz))
          if (!b || b.type === 0) continue
          counts[b.name] = (counts[b.name] ?? 0) + 1
          if (b.name === 'sand' && (!nearestSand || me.distanceTo(b.position) < me.distanceTo(nearestSand))) nearestSand = b.position
        } catch { /* unloaded */ }
      }
    }
  }
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 12)
  console.log(`bot at ${me.floored()}`)
  console.log(top.map(([n, c]) => `${n}:${c}`).join(' '))
  console.log(`nearestSand: ${nearestSand ? `${nearestSand.floored()} d=${me.distanceTo(nearestSand).toFixed(0)}` : 'NONE in scanned range'}`)
  bot.quit()
  process.exit(0)
})
bot.on('error', e => { console.log(`err ${e.message}`); process.exit(1) })
setTimeout(() => process.exit(1), 60000)
