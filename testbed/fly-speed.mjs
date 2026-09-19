import mineflayer from 'mineflayer'
import { Vec3 } from 'vec3'
import { installFly } from '../src/lib/fly.mjs'
const bot = mineflayer.createBot({ host: '127.0.0.1', port: 25565, username: 'BotSpeed', version: '26.2', auth: 'offline' })
bot.on('error', e => console.log('ERR', e.message))
bot.once('spawn', async () => {
  installFly(bot, { speed: 1.0, antiKick: true })
  await new Promise(r => setTimeout(r, 2000))
  const s = bot.entity.position.clone()
  // climb straight up into open air first
  const up = new Vec3(s.x, s.y + 12, s.z)
  let t = Date.now()
  await bot.flyTo(up, { timeoutMs: 15000 })
  console.log(`up 12 blocks: ${((Date.now() - t) / 1000).toFixed(2)}s -> ${bot.entity.position.floored()}`)
  const target = new Vec3(bot.entity.position.x + 20, bot.entity.position.y, bot.entity.position.z)
  t = Date.now()
  await bot.flyTo(target, { timeoutMs: 20000 })
  const d = bot.entity.position.distanceTo(target)
  console.log(`side 20 blocks: ${((Date.now() - t) / 1000).toFixed(2)}s, remaining ${d.toFixed(2)}`)
  console.log('moved from', s.floored(), 'to', bot.entity.position.floored())
  bot.quit(); process.exit(0)
})
