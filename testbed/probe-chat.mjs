import mineflayer from 'mineflayer'
const bot = mineflayer.createBot({ host: '127.0.0.1', port: 25565, username: 'BotProbe', version: '26.2', auth: 'offline' })
bot.on('error', e => console.log('ERR', e.message))
bot.on('kicked', r => console.log('KICKED', JSON.stringify(r)))
bot.on('message', (m, pos) => console.log('MSG', pos, m.toString().slice(0, 160)))
bot.once('spawn', async () => {
  console.log('spawn')
  await bot.waitForTicks(40)
  try { bot.chat('hello from bot') ; console.log('sent chat') } catch (e) { console.log('chat threw', e.message) }
  await bot.waitForTicks(40)
  try { bot.chat('/give @s minecraft:dirt 64'); console.log('sent command') } catch (e) { console.log('cmd threw', e.message) }
  await bot.waitForTicks(60)
  console.log('inventory:', bot.inventory.items().map(i => `${i.name}x${i.count}`).join(', ') || '(empty)')
  console.log('protocolVersion:', bot.protocolVersion, '| registry version:', bot.registry.version.minecraftVersion)
  setTimeout(() => { bot.quit(); process.exit(0) }, 1500)
})
