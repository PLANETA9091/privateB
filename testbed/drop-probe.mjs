#!/usr/bin/env node
// Probe: where do digShaft drops go? Dig 3 blocks below with fastDig, after each one
// log item entities near the bot + inventory + position. No assertions, pure evidence.
import mineflayer from 'mineflayer'

const bot = mineflayer.createBot({
  host: '127.0.0.1',
  port: 25565,
  username: 'DropProbe',
  version: '26.2' // patched stack
})

const log = m => console.log(`[probe] ${m}`)
const sleep = ms => new Promise(r => setTimeout(r, ms))
const inv = () => bot.inventory.items().map(i => `${i.name}x${i.count}`).join(' ') || '(empty)'

bot.once('spawn', async () => {
  await sleep(1500)
  log(`spawned at ${bot.entity.position.floored()}`)
  // make sure the world is loaded around us
  await sleep(4000)
  for (let n = 0; n < 4; n++) {
    const pos = bot.entity.position.floored().offset(0, -1, 0)
    const block = bot.blockAt(pos)
    log(`[${n}] digging ${block?.name} at ${pos.floored()}`)
    if (!block || block.type === 0) { log('  nothing to dig'); await sleep(1500); continue }
    try {
      await bot.fastDig(block)
    } catch (e) {
      log(`  fastDig failed: ${e.message}; trying bot.dig`)
      try { await bot.dig(block) } catch (e2) { log(`  dig also failed: ${e2.message}`) }
    }
    // watch the fall and the pickups
    for (const wait of [500, 1000, 2000]) {
      await sleep(wait)
      const items = Object.values(bot.entities)
        .filter(e => e.name === 'item')
        .map(e => `${e.displayName ?? e.metadata?.[8] ?? 'item'}@d${e.position.distanceTo(bot.entity.position).toFixed(1)}`)
      log(`  +${wait}ms pos=${bot.entity.position.floored().offset(0, 1, 0)} items=${items.slice(0, 6).join(',') || 'none'} inv=${inv()}`)
    }
  }
  log(`FINAL inv=${inv()}`)
  bot.quit()
  process.exit(0)
})

bot.on('error', e => { log(`error: ${e.message}`) })
bot.on('kicked', r => { log(`kicked: ${r}`); process.exit(1) })
setTimeout(() => { log('probe timeout'); process.exit(1) }, 120000)
