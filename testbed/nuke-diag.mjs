import { Vec3 } from 'vec3'
import { createMiner, HAND_DIGGABLE } from '../src/bots/miner.mjs'
const m = createMiner({ host: '127.0.0.1', port: 25565, username: 'BotND', mode: 'rage', log: l => console.log('LOG', l) })
await m.ready
const b = m.bot
await new Promise(r => setTimeout(r, 1500))
const p = b.entity.position.floored()
console.log('pos', p, 'eye', b.entity.position.y + b.entity.eyeHeight)
// how many soft blocks exist within 6 blocks, and reachable within 4.2 of the eye
let soft = 0
const R = 6
for (let dx = -R; dx <= R; dx++) for (let dy = -R; dy <= R; dy++) for (let dz = -R; dz <= R; dz++) {
  const blk = b.blockAt(new Vec3(p.x + dx, p.y + dy, p.z + dz))
  if (blk && HAND_DIGGABLE.includes(blk.name)) soft++
}
console.log('soft blocks within 6:', soft)
const reach = m.nukeAround ? 'has nuke' : 'no nuke'
console.log(reach)
// try digging 5 nearest soft blocks with the raw rage dig, no travel
const eye = b.entity.position.offset(0, b.entity.eyeHeight, 0)
const cands = []
for (let dx = -4; dx <= 4; dx++) for (let dy = -4; dy <= 4; dy++) for (let dz = -4; dz <= 4; dz++) {
  const pos = new Vec3(p.x + dx, p.y + dy, p.z + dz)
  const blk = b.blockAt(pos)
  if (!blk || !HAND_DIGGABLE.includes(blk.name)) continue
  const d = new Vec3(pos.x + 0.5, pos.y + 0.5, pos.z + 0.5).distanceTo(eye)
  cands.push({ pos, d, name: blk.name })
}
cands.sort((a, c) => a.d - c.d)
console.log('in reach candidates:', cands.filter(c => c.d <= 4.2).length, '| nearest:', cands.slice(0, 3).map(c => `${c.name}@${c.d.toFixed(1)}`).join(' '))
for (const c of cands.slice(0, 5)) {
  const blk = b.blockAt(c.pos)
  if (!blk) continue
  const t = Date.now()
  let ok = false
  try { ok = await b.fastDig(blk) } catch (e) { console.log('throw', e.message) }
  console.log(`dig ${c.name} d=${c.d.toFixed(2)} -> ${ok} (${Date.now() - t}ms)`)
}
b.quit(); process.exit(0)
