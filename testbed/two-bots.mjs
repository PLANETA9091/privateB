import mineflayer from 'mineflayer'
import { Vec3 } from 'vec3'
const mk = n => mineflayer.createBot({ host: '127.0.0.1', port: 25565, username: n, version: '26.2', auth: 'offline' })
const a = mk('BotA1'); const b = mk('BotB1')
a.on('error', e => console.log('A ERR', e.message)); b.on('error', e => console.log('B ERR', e.message))
b.on('kicked', r => console.log('B KICK', JSON.stringify(r)))
await Promise.all([new Promise(r => a.once('spawn', r)), new Promise(r => b.once('spawn', r))])
await new Promise(r => setTimeout(r, 4000))
const count = (bot) => {
  const p = bot.entity.position.floored()
  let nn = 0, nz = 0
  for (let dx = -8; dx <= 8; dx++) for (let dy = -8; dy <= 8; dy++) for (let dz = -8; dz <= 8; dz++) {
    const blk = bot.blockAt(new Vec3(p.x + dx, p.y + dy, p.z + dz))
    if (blk === null) nn++; else nz++
  }
  return { pos: p, nulls: nn, blocks: nz }
}
console.log('A', JSON.stringify(count(a)))
console.log('B', JSON.stringify(count(b)))
console.log('A entity', a.entity.position, 'B entity', b.entity.position)
a.quit(); b.quit(); process.exit(0)
