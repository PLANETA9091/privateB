import mineflayer from 'mineflayer'
import { Vec3 } from 'vec3'
import { installFly } from '../src/lib/fly.mjs'
const bot = mineflayer.createBot({ host: '127.0.0.1', port: 25565, username: 'BotFly', version: '26.2', auth: 'offline' })
bot.on('error', e => console.log('ERR', e.message))
bot.on('kicked', r => console.log('KICKED', JSON.stringify(r)))
bot.once('spawn', async () => {
  installFly(bot, { speed: 1.0, antiKick: true, log: m => console.log('FLY', m) })
  const start = bot.entity.position.clone()
  console.log('start', start.floored(), 'physicsEnabled', bot.physicsEnabled)
  const iv = setInterval(() => {
    const p = bot.entity.position
    console.log(`pos ${p.x.toFixed(2)} ${p.y.toFixed(2)} ${p.z.toFixed(2)} target=${bot.flyState.target ? bot.flyState.target.floored() : 'none'} stuck=${bot.flyState.stuckTicks} block=${bot.blockAt(p)?.name}`)
  }, 300)
  try {
    await bot.flyTo(new Vec3(start.x, start.y - 12, start.z), { timeoutMs: 8000 })
    console.log('flyTo returned OK')
  } catch (e) { console.log('flyTo FAILED:', e.message) }
  clearInterval(iv)
  console.log('end', bot.entity.position.floored())
  bot.quit(); process.exit(0)
})
