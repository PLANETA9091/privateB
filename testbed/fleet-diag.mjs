import { Vec3 } from 'vec3'
import { createMiner, HAND_DIGGABLE } from '../src/bots/miner.mjs'
const ms = []
for (let i = 1; i <= 3; i++) ms.push(createMiner({ host: '127.0.0.1', port: 25565, username: `BotD${i}`, mode: 'rage', log: () => {} }))
await Promise.all(ms.map(m => m.ready))
await new Promise(r => setTimeout(r, 2000))
const p = ms[0].bot.entity.position.floored()
const box = [new Vec3(p.x - 20, p.y - 10, p.z - 20), new Vec3(p.x + 20, p.y + 4, p.z + 20)]
for (const m of ms) {
  const b = m.bot
  const targets = m.scanBox(box[0], box[1], HAND_DIGGABLE)
  const exposed = targets.filter(t => { const a = b.blockAt(t.offset(0, 1, 0)); return a && a.boundingBox === 'empty' })
  let withSpot = 0, withPath = 0
  for (const t of exposed.slice(0, 20)) {
    const s = m.standSpotFor(t)
    if (s) { withSpot++; if (b.flyPathFree(s)) withPath++ }
  }
  console.log(`${m.username} pos=${b.entity.position.floored()} alive=${b.isAlive} physics=${b.physicsEnabled} targets=${targets.length} exposed=${exposed.length} of20: spot=${withSpot} path=${withPath}`)
}
console.log('--- one mineBlock attempt per bot (exposed nearest) ---')
for (const m of ms) {
  const b = m.bot
  const targets = m.scanBox(box[0], box[1], HAND_DIGGABLE).filter(t => { const a = b.blockAt(t.offset(0, 1, 0)); return a && a.boundingBox === 'empty' })
  targets.sort((x, y) => x.distanceTo(b.entity.position) - y.distanceTo(b.entity.position))
  const t = targets[0]
  if (!t) { console.log(`${m.username}: no exposed target`); continue }
  const t0 = Date.now()
  const r = await m.mineBlock(t)
  console.log(`${m.username}: mineBlock(${t} ${b.blockAt(t)?.name}) -> ${r} in ${Date.now() - t0}ms`)
}
for (const m of ms) m.bot.quit()
process.exit(0)
