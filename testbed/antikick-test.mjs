import mineflayer from 'mineflayer'
import { Vec3 } from 'vec3'
import { installFly } from '../src/lib/fly.mjs'
const antiKick = process.argv[2] !== 'off'
const name = antiKick ? 'BotAK' : 'BotNoAK'
const bot = mineflayer.createBot({ host: '127.0.0.1', port: 25565, username: name, version: '26.2', auth: 'offline' })
let kicked = null
bot.on('error', e => { console.log(`${name} ERR ${e.message}`); process.exit(0) })
bot.on('kicked', r => { kicked = typeof r === 'string' ? r : JSON.stringify(r); console.log(`${name} KICKED: ${kicked}`); process.exit(0) })
bot.once('spawn', async () => {
  installFly(bot, { speed: 1.0, antiKick, antiKickInterval: 70, antiKickDistance: 0.035 })
  await new Promise(r => setTimeout(r, 2500))
  try { await bot.flyTo(new Vec3(bot.entity.position.x, bot.entity.position.y + 25, bot.entity.position.z), { timeoutMs: 8000 }) } catch {}
  console.log(`${name} hovering at ${bot.entity.position.floored()} (antiKick=${antiKick})`)
  const t0 = Date.now()
  const iv = setInterval(() => {
    const alive = bot.entity && bot.isAlive !== false
    console.log(`${name} t=${((Date.now() - t0) / 1000).toFixed(1)}s pos=${bot.entity?.position.floored()} alive=${alive}`)
    if (Date.now() - t0 > 15000) {
      clearInterval(iv)
      console.log(`${name} SURVIVED 15s hovering (antiKick=${antiKick})`)
      bot.quit(); process.exit(0)
    }
  }, 3000)
})
