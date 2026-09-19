#!/usr/bin/env node
// A/B bench on Minecraft 26.2 with NO op and NO items:
// two bare-handed bots mine the same kind of natural terrain, one with the honest
// client dig time (control) and one with rage FastBreak. Fly + Anti-Kick on both.
//
//   node testbed/mine-bench.mjs [seconds] [host] [port]
import { Vec3 } from 'vec3'
import { createMiner, HAND_DIGGABLE } from '../src/bots/miner.mjs'

const SECONDS = Number(process.argv[2] || 30)
const HOST = process.argv[3] || '127.0.0.1'
const PORT = Number(process.argv[4] || 25565)

const honest = createMiner({ host: HOST, port: PORT, username: 'BotHonest', mode: 'honest', log: m => console.log(m) })
const rage = createMiner({ host: HOST, port: PORT, username: 'BotRage', mode: 'rage', log: m => console.log(m) })
await Promise.all([honest.ready, rage.ready])
console.log('--- both bots ready (no op, no gear) ---')

const p = honest.bot.entity.position.floored()
const half = 20
const from = new Vec3(p.x - half, p.y - 10, p.z - half)
const to = new Vec3(p.x + half, p.y + 3, p.z + half)
const deadline = Date.now() + SECONDS * 1000
const shouldStop = () => Date.now() > deadline

const reporter = setInterval(() => {
  const left = Math.max(0, (deadline - Date.now()) / 1000)
  console.log(`t-${left.toFixed(0)}s honest=${honest.stats.mined} rage=${rage.stats.mined} (skip ${honest.stats.skipped}/${rage.stats.skipped}, flyFail ${honest.stats.flyFails}/${rage.stats.flyFails})`)
}, 5000)

const t0 = Date.now()
// both bots work the same box: nearest-first picking makes them spread out naturally
const [h, r] = await Promise.all([
  honest.mineBox(from, to, { names: HAND_DIGGABLE, shouldStop }),
  rage.mineBox(from, to, { names: HAND_DIGGABLE, shouldStop })
])
clearInterval(reporter)
const secs = (Date.now() - t0) / 1000

const inv = m => m.bot.inventory.items().map(i => `${i.name}x${i.count}`).join(', ') || '(none)'
console.log('================ RESULT ================')
console.log(`honest: ${h.done} blocks in ${secs.toFixed(1)}s = ${(h.done / secs).toFixed(2)} blocks/s | failed ${honest.stats.failed} | skipped ${honest.stats.skipped}`)
console.log(`rage:   ${r.done} blocks in ${secs.toFixed(1)}s = ${(r.done / secs).toFixed(2)} blocks/s | failed ${rage.stats.failed} | skipped ${rage.stats.skipped}`)
console.log(`speedup: ${(r.done / Math.max(1, h.done)).toFixed(2)}x`)
console.log(`honest inv: ${inv(honest)}`)
console.log(`rage   inv: ${inv(rage)}`)

for (const m of [honest, rage]) m.bot.quit()
process.exit(0)
