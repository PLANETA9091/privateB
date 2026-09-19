import { Vec3 } from 'vec3'
import { createMiner, HAND_DIGGABLE, fleetStats } from '../src/bots/miner.mjs'
const SECONDS = Number(process.argv[2] || 25)
const COUNT = Number(process.argv[3] || 3)
const miners = []
for (let i = 1; i <= COUNT; i++) miners.push(createMiner({ host: '127.0.0.1', port: 25565, username: `BotF${i}`, mode: 'rage', log: l => console.log(l) }))
await Promise.all(miners.map(m => m.ready))
console.log(`--- ${COUNT} rage miners ready (no op, no gear) ---`)
const p = miners[0].bot.entity.position.floored()
const deadline = Date.now() + SECONDS * 1000
const iv = setInterval(() => {
  const s = fleetStats(miners)
  console.log(`t-${Math.max(0, (deadline - Date.now()) / 1000).toFixed(0)}s total=${s.mined} per-bot=[${miners.map(m => m.stats.mined).join(', ')}]`)
}, 5000)
// each bot works a sector around ITS OWN position: spawn points are far apart,
// so a shared box would send half the fleet into unloaded chunks
const t0 = Date.now()
await Promise.all(miners.map((m) => {
  const q = m.bot.entity.position.floored()
  const a = new Vec3(q.x - 20, q.y - 10, q.z - 20)
  const b = new Vec3(q.x + 20, q.y + 4, q.z + 20)
  return m.mineBox(a, b, { names: HAND_DIGGABLE, shouldStop: () => Date.now() > deadline })
}))
clearInterval(iv)
const secs = (Date.now() - t0) / 1000
const s = fleetStats(miners)
console.log('================ RESULT ================')
console.log(`bots=${COUNT} time=${secs.toFixed(1)}s mined=${s.mined} fleet=${(s.mined / secs).toFixed(2)} b/s per-bot=[${miners.map(m => (m.stats.mined / secs).toFixed(2)).join(', ')}] b/s`)
console.log(`inventories: ${miners.map(m => `${m.username}:${m.bot.inventory.items().reduce((a, i) => a + i.count, 0)}`).join(' ')}`)
console.log(`materials: ${JSON.stringify(s.byName)}`)
for (const m of miners) m.bot.quit()
process.exit(0)
