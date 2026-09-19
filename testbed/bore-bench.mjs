import { Vec3 } from 'vec3'
import { createMiner } from '../src/bots/miner.mjs'
const SECONDS = Number(process.argv[2] || 20)
const COUNT = Number(process.argv[3] || 1)
const DIR = process.argv[4] || 'down'
const dirs = { down: new Vec3(0, -1, 0), up: new Vec3(0, 1, 0), east: new Vec3(1, 0, 0), north: new Vec3(0, 0, -1) }
const miners = []
for (let i = 1; i <= COUNT; i++) {
  miners.push(createMiner({ host: '127.0.0.1', port: 25565, username: `BotB${i}`, mode: 'rage', log: () => {} }))
}
await Promise.all(miners.map(m => m.ready))
// spread the bots out so they do not share a shaft
await Promise.all(miners.map(async (m, i) => {
  if (i === 0) return
  try { await m.bot.flyTravel(new Vec3(m.bot.entity.position.x + i * 4, m.bot.entity.position.y + 25, m.bot.entity.position.z), { speed: 2, timeoutMs: 20000, cruiseAbove: 30 }) } catch {}
}))
const inv = m => m.bot.inventory.items().reduce((a, i) => a + i.count, 0)
const before = miners.map(inv)
console.log(`${COUNT} bot(s) boring ${DIR} for ${SECONDS}s (no op, no gear)`)
const deadline = Date.now() + SECONDS * 1000
const t0 = Date.now()
await Promise.all(miners.map(m => m.bore(dirs[DIR], { shouldStop: () => Date.now() > deadline })))
const secs = (Date.now() - t0) / 1000
const mined = miners.reduce((a, m) => a + m.stats.mined, 0)
const got = miners.reduce((a, m, i) => a + (inv(m) - before[i]), 0)
console.log('================ RESULT ================')
console.log(`bots=${COUNT} time=${secs.toFixed(1)}s mined=${mined} -> ${(mined / secs).toFixed(2)} blocks/s total`)
console.log(`per bot: ${miners.map(m => (m.stats.mined / secs).toFixed(2)).join(' / ')} blocks/s`)
console.log(`collected items=${got} per bot: ${miners.map((m, i) => inv(m) - before[i]).join(' / ')}`)
console.log(`drops kept: ${mined > 0 ? ((got / mined) * 100).toFixed(0) : 0}% (100% = nothing lost)`)
console.log(`materials: ${JSON.stringify(miners.map(m => m.stats.byName))}`)
console.log(`bot positions: ${miners.map(m => `${m.username}@${m.bot.entity.position.floored().y}`).join(' ')}`)
for (const m of miners) m.bot.quit()
process.exit(0)
