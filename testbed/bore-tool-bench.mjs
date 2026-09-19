import fs from 'node:fs'
import { Vec3 } from 'vec3'
import { createMiner } from '../src/bots/miner.mjs'
const SECONDS = Number(process.argv[2] || 20)
const FIFO = '/home/btw/mcbot-fleet/testbed/server/cmd.fifo'
const cmd = c => fs.appendFileSync(FIFO, `${c}\n`)
const m = createMiner({ host: '127.0.0.1', port: 25565, username: 'BotT1', mode: 'rage', log: l => console.log(l) })
await m.ready
await new Promise(r => setTimeout(r, 800))
// tooling for the measurement only
cmd('give BotT1 minecraft:netherite_pickaxe 1')
cmd('give BotT1 minecraft:netherite_shovel 1')
cmd('give BotT1 minecraft:netherite_axe 1')
await new Promise(r => setTimeout(r, 1500))
const inv = () => m.bot.inventory.items().reduce((a, i) => a + i.count, 0)
const items = m.bot.inventory.items().map(i => i.name).join(',')
console.log('inventory:', items || '(none)')
if (!items.includes('pickaxe')) { console.log('pickaxe not received, aborting'); m.bot.quit(); process.exit(1) }
const before = inv()
const deadline = Date.now() + SECONDS * 1000
const t0 = Date.now()
await m.bore(new Vec3(0, -1, 0), { shouldStop: () => Date.now() > deadline })
const secs = (Date.now() - t0) / 1000
console.log('================ RESULT ================')
console.log(`with netherite tools: mined=${m.stats.mined} in ${secs.toFixed(1)}s = ${(m.stats.mined / secs).toFixed(2)} blocks/s`)
console.log(`collected items=${inv() - before} (kept ${(((inv() - before) / Math.max(1, m.stats.mined)) * 100).toFixed(0)}%)`)
console.log(`materials: ${JSON.stringify(m.stats.byName)} depth reached: y=${m.bot.entity.position.floored().y}`)
m.bot.quit(); process.exit(0)
