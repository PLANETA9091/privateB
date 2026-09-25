// Diag: does mineflayer see dropped-item entities in bot.entities on this
// server build (26.2)? The v0.173.0 drop walk read 0 items across 29 sweeps
// in run64 - either dropTargets' name filter misses or the entities never
// arrive. Login, dig one block, dump every entity name+type for 3s.
import mineflayer from 'mineflayer'
import { pathfinder } from 'mineflayer-pathfinder'

const bot = mineflayer.createBot({
  host: 'localhost',
  port: 25565,
  username: 'DiagItem',
  auth: 'offline'
})
bot.loadPlugin(pathfinder)

const seen = new Map()
bot.on('entitySpawn', e => {
  seen.set(e.id, `${e.name ?? '?'} | type=${e.type} | kind=${e.kind ?? '?'} | id=${e.id}`)
})

bot.once('spawn', async () => {
  console.log('[diag] spawned; entity registry size at spawn:', Object.keys(bot.entities).length)
  await bot.waitForTicks(30)
  // dig the block right below-forward (dirt/grass - always diggable by hand)
  const target = bot.blockAt(bot.entity.position.offset(1, -1, 0))
  if (!target) { console.log('[diag] no target block'); bot.quit(); return }
  console.log('[diag] digging', target.name, 'at', target.position.floored())
  try { await bot.dig(target) } catch (e) { console.log('[diag] dig failed:', e.message) }
  // watch the entity registry for 3s
  for (let i = 0; i < 6; i++) {
    await bot.waitForTicks(10)
    const items = Object.values(bot.entities).filter(e => e.name && e.name !== 'player')
    console.log(`[diag] t+${(i + 1) * 0.5}s entities:`, items.map(e => `${e.name}(id${e.id})`).join(', ') || 'NONE')
  }
  console.log('[diag] entitySpawn log:', [...seen.values()].join(' ; ') || 'NO SPAWN EVENTS')
  bot.quit()
  process.exit(0)
})

bot.on('error', e => { console.log('[diag] error:', e.message); process.exit(1) })
setTimeout(() => { console.log('[diag] timeout'); process.exit(1) }, 30000)
