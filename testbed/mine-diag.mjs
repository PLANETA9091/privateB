import { Vec3 } from 'vec3'
import { createMiner, HAND_DIGGABLE } from '../src/bots/miner.mjs'
const m = createMiner({ host: '127.0.0.1', port: 25565, username: 'BotMD', mode: 'rage', log: l => console.log('LOG', l) })
await m.ready
const bot = m.bot
await new Promise(r => setTimeout(r, 1500))
const p = bot.entity.position.floored()
const from = new Vec3(p.x - 10, p.y - 8, p.z - 10)
const to = new Vec3(p.x + 10, p.y + 3, p.z + 10)
const targets = m.scanBox(from, to, HAND_DIGGABLE).slice(0, 8)
console.log('spawn', p, 'targets', targets.length)
for (const pos of targets) {
  const t0 = Date.now()
  const spot = m.standSpotFor(pos)
  const tSpot = Date.now()
  if (!spot) { console.log(`${pos} NO SPOT (block=${bot.blockAt(pos)?.name})`); continue }
  let flew = 'n/a'
  if (bot.entity.position.distanceTo(spot) > 0.5) {
    flew = await m.flyTo(spot) ? 'ok' : 'FAIL'
  }
  const tFly = Date.now()
  const blk = bot.blockAt(pos)
  const before = bot.entity.position.distanceTo(new Vec3(pos.x + 0.5, pos.y + 0.5, pos.z + 0.5))
  const ok = blk ? await bot.fastDig(blk) : false
  const tDig = Date.now()
  console.log(`${pos} ${blk?.name} spot=${spot ? spot.floored() : '-'} dist=${before.toFixed(2)} spotMs=${tSpot - t0} fly=${flew}(${tFly - tSpot}ms) dig=${ok}(${tDig - tFly}ms)`)
}
bot.quit(); process.exit(0)
