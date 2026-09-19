#!/usr/bin/env node
// Probe: miner bot digs beach sand with fastDig; watch item entities + inventory.
import { createMiner } from '../src/bots/miner.mjs'

const log = m => console.log(`[sprobe] ${m}`)
const sleep = ms => new Promise(r => setTimeout(r, ms))
const inv = () => bot.inventory.items().map(i => `${i.name}x${i.count}`).join(' ') || '(empty)'
const items = () => Object.values(bot.entities).filter(e => e.name === 'item')
  .map(e => `${e.displayName ?? 'item'}@d${e.position.distanceTo(bot.entity.position).toFixed(1)}`).slice(0, 8).join(',') || 'none'

const miner = createMiner({ host: '127.0.0.1', port: 25565, username: 'SandProbe3', fly: false, mode: 'rage', log })
const bot = await miner.ready
log(`spawned at ${bot.entity.position.floored()}`)
await sleep(4000)

for (let i = 0; i < 4; i++) {
  const cands = bot.findBlocks({ matching: b => b.name === 'sand', maxDistance: 8, count: 12 })
    .map(p => bot.blockAt(p))
    .filter(b => b && b.name === 'sand')
    .filter(b => { const above = bot.blockAt(b.position.offset(0, 1, 0)); return above && above.boundingBox === 'empty' })
  log(`[${i}] dry sand candidates: ${cands.length}; first: ${cands[0]?.position.floored() ?? 'none'}`)
  if (!cands[0]) break
  const b = cands[0]
  try {
    await bot.fastDig(b)
    log(`  fastDig resolved`)
  } catch (e) { log(`  fastDig threw: ${e.message}`) }
  for (const wait of [300, 800, 1500]) {
    await sleep(wait)
    log(`  +${wait}ms pos=${bot.entity.position.floored().offset(0, 1, 0)} items=${items()} inv=${inv()}`)
  }
}
log(`FINAL inv=${inv()}`)
bot.quit()
process.exit(0)
