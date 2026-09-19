import mineflayer from 'mineflayer'
const bot = mineflayer.createBot({ host: '127.0.0.1', port: 25565, username: 'BotFly2', version: '26.2', auth: 'offline' })
bot.on('error', e => console.log('ERR', e.message))
bot.on('kicked', r => console.log('KICKED', JSON.stringify(r)))
bot.once('spawn', async () => {
  bot.physicsEnabled = false
  await bot.waitForTicks(20)
  const y0 = bot.entity.position.y
  bot.entity.position.y = y0 + 2
  console.log('after local move: y =', bot.entity.position.y)
  setTimeout(() => console.log('after 100ms:  y =', bot.entity.position.y), 100)
  setTimeout(() => console.log('after 500ms:  y =', bot.entity.position.y), 500)
  setTimeout(() => console.log('after 1500ms: y =', bot.entity.position.y), 1500)
  setTimeout(() => { bot.quit(); process.exit(0) }, 2500)
})
