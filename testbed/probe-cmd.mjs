import mineflayer from 'mineflayer'
const bot = mineflayer.createBot({ host: '127.0.0.1', port: 25565, username: 'BotCmd', version: '26.2', auth: 'offline' })
bot.on('error', e => console.log('ERR', e.message))
bot.on('kicked', r => console.log('KICKED', JSON.stringify(r)))
bot.on('message', m => console.log('MSG', m.toString().slice(0, 200)))
bot.once('spawn', async () => {
  await bot.waitForTicks(40)
  const cmds = ['/give @s minecraft:dirt 4', '/give @s minecraft:netherite_pickaxe 1', '/fill 40 70 130 41 70 130 minecraft:stone', '/time set day']
  for (const c of cmds) {
    console.log('>>', c)
    bot.chat(c)
    await bot.waitForTicks(25)
  }
  console.log('inventory:', bot.inventory.items().map(i => `${i.name}x${i.count}`).join(', ') || '(empty)')
  await bot.waitForTicks(20)
  console.log('inventory later:', bot.inventory.items().map(i => `${i.name}x${i.count}`).join(', ') || '(empty)')
  bot.quit(); process.exit(0)
})
