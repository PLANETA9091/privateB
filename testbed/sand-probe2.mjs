#!/usr/bin/env node
// Probe: run the test's EXACT findBlock search from a fresh spawn and log what it sees.
import mineflayer from 'mineflayer'

const bot = mineflayer.createBot({ host: '127.0.0.1', port: 25565, username: 'SandProbe2', version: '26.2' })
bot.once('spawn', async () => {
  for (const wait of [2000, 6000, 12000]) {
    await new Promise(r => setTimeout(r, wait === 2000 ? wait : 4000))
    const me = bot.entity.position
    const r32 = bot.findBlock({ matching: b => b.name === 'sand' && b.position != null, maxDistance: 32 })
    const r64 = bot.findBlock({ matching: b => b.name === 'sand' && b.position != null, maxDistance: 64 })
    const r128 = bot.findBlock({ matching: b => b.name === 'sand' && b.position != null, maxDistance: 128 })
    // also: how many chunks does findBlock see?
    const all = bot.findBlocks({ matching: b => b.position != null, maxDistance: 4, count: 3 })
    console.log(`[probe] t+${wait}ms at ${me.floored()}: r32=${r32?.position.floored() ?? 'null'} r64=${r64?.position.floored() ?? 'null'} r128=${r128?.position.floored() ?? 'null'} loadedNearby=${all.length}`)
  }
  bot.quit()
  process.exit(0)
})
bot.on('error', e => { console.log(`err ${e.message}`); process.exit(1) })
setTimeout(() => process.exit(1), 60000)
