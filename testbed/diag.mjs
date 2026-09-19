import mineflayer from 'mineflayer'
const bot = mineflayer.createBot({ host: '127.0.0.1', port: 25565, username: 'BotDiag', version: '26.2', auth: 'offline' })
bot.on('error', e => console.log('ERR', e.message))
bot.once('spawn', async () => {
  await bot.waitForTicks(40)
  const p = bot.entity.position.floored()
  console.log('pos', p, 'dim', bot.game.dimension, 'minY', bot.game.minY)
  const names = new Map()
  for (let dy = -8; dy <= 3; dy++) {
    let row = []
    for (let dx = -3; dx <= 3; dx++) {
      const b = bot.blockAt(new (await import('vec3')).Vec3(p.x + dx, p.y + dy, p.z))
      const n = b ? b.name : 'NULL'
      row.push(n.slice(0, 12))
      names.set(n, (names.get(n) || 0) + 1)
    }
    console.log(`y=${p.y + dy}`, row.join(' | '))
  }
  console.log('sample names:', [...names.entries()].slice(0, 12))
  bot.quit(); process.exit(0)
})
