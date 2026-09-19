import { Vec3 } from 'vec3'
import { createMiner, HAND_DIGGABLE } from '../src/bots/miner.mjs'
const SECONDS = Number(process.argv[2] || 20)
const COUNT = Number(process.argv[3] || 1)
const RADIUS = Number(process.argv[4] || 4.2)
const miners = []
for (let i = 1; i <= COUNT; i++) miners.push(createMiner({ host: '127.0.0.1', port: 25565, username: `BotN${i}`, mode: 'rage', log: () => {} }))
await Promise.all(miners.map(m => m.ready))
// relocate to fresh terrain: the area around spawn has been strip-mined by earlier runs
const DIST = Number(process.argv[5] || 400)
await Promise.all(miners.map(async (m, i) => {
  const b = m.bot
  const p = b.entity.position
  const dir = i % 2 === 0 ? 1 : -1
  const goal = new Vec3(p.x + dir * DIST, p.y + 30, p.z + (i - 1) * 60)
  try { await b.flyTravel(goal, { speed: 2.0, timeoutMs: 30000, cruiseAbove: 30 }) } catch (e) { console.log(`${m.username} relocate: ${e.message}`) }
  // sink to the surface
  for (let y = Math.floor(b.entity.position.y); y > b.game.minY + 2; y--) {
    const blk = b.blockAt(new Vec3(Math.floor(b.entity.position.x), y, Math.floor(b.entity.position.z)))
    if (blk && blk.type !== 0) {
      try { await b.flyTo(new Vec3(Math.floor(b.entity.position.x) + 0.5, y + 1.2, Math.floor(b.entity.position.z) + 0.5), { timeoutMs: 5000 }) } catch {}
      break
    }
  }
  console.log(`${m.username} at ${b.entity.position.floored()}`)
}))
await new Promise(r => setTimeout(r, 1000))
console.log(`${COUNT} nuker bot(s) ready, radius ${RADIUS}, ${SECONDS}s`)
const inv = m => m.bot.inventory.items().reduce((a, i) => a + i.count, 0)
const before = miners.map(inv)
const deadline = Date.now() + SECONDS * 1000
const t0 = Date.now()
await Promise.all(miners.map(m => m.nukeAround(RADIUS, { names: HAND_DIGGABLE, shouldStop: () => Date.now() > deadline })))
const secs = (Date.now() - t0) / 1000
const mined = miners.reduce((a, m) => a + m.stats.mined, 0)
const got = miners.reduce((a, m, i) => a + (inv(m) - before[i]), 0)
console.log('================ RESULT ================')
console.log(`bots=${COUNT} time=${secs.toFixed(1)}s mined=${mined} = ${(mined / secs).toFixed(2)} blocks/s`)
console.log(`per bot: ${miners.map(m => (m.stats.mined / secs).toFixed(2)).join(' / ')} blocks/s`)
console.log(`collected items=${got} | per bot: ${miners.map((m, i) => inv(m) - before[i]).join(' / ')}`)
console.log(`loss estimate: mined ${mined} vs collected ${got} -> ${mined - got} (dirt/gravel drop 1:1, grass_block drops dirt)`)
console.log(`materials: ${JSON.stringify(miners.map(m => m.stats.byName))}`)
for (const m of miners) m.bot.quit()
process.exit(0)
