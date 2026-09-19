#!/usr/bin/env node
// Fleet test on Minecraft 26.2: N bots flying + fast-breaking a quarry in parallel.
//
//   node testbed/fleet-test.mjs [bots] [seconds] [host] [port]
import fs from 'node:fs'
import { Vec3 } from 'vec3'
import { createFleet, fleetStats } from '../src/bots/miner.mjs'

const COUNT = Number(process.argv[2] || 3)
const SECONDS = Number(process.argv[3] || 45)
const HOST = process.argv[4] || '127.0.0.1'
const PORT = Number(process.argv[5] || 25565)
const FIFO = process.env.MC_FIFO || '/home/btw/mcbot-fleet/testbed/server/cmd.fifo'

const consoleCmd = cmd => fs.appendFileSync(FIFO, `${cmd}\n`)
const sleep = ms => new Promise(r => setTimeout(r, ms))

const miners = await createFleet({ count: COUNT, host: HOST, port: PORT, flySpeed: 1.0, digDelayMs: 55 })
console.log(`--- ${COUNT} bots ready ---`)

// op them from the console while they are connected (offline-name lookups break case-sensitive op)
for (const m of miners) consoleCmd(`op ${m.username}`)
await sleep(600)

// kit: best tool + haste so the server-side break time is ~1 tick (that is the real ceiling)
for (const m of miners) {
  consoleCmd(`give ${m.username} minecraft:netherite_pickaxe 1`)
  consoleCmd(`give ${m.username} minecraft:netherite_shovel 1`)
  consoleCmd(`give ${m.username} minecraft:netherite_axe 1`)
  consoleCmd(`enchant ${m.username} minecraft:efficiency 5`)
  consoleCmd(`gamemode survival ${m.username}`)
}
await sleep(1200)

// deterministic quarry next to the first bot: mixed materials
const p = miners[0].bot.entity.position.floored()
const from = new Vec3(p.x + 3, p.y + 1, p.z - 4)
const to = new Vec3(p.x + 14, p.y + 6, p.z + 7)
console.log(`--- quarry ${from} -> ${to} ---`)
consoleCmd(`fill ${from.x} ${from.y} ${from.z} ${to.x} ${from.y + 1} ${to.z} minecraft:stone`)
consoleCmd(`fill ${from.x} ${from.y + 2} ${from.z} ${to.x} ${from.y + 3} ${to.z} minecraft:andesite`)
consoleCmd(`fill ${from.x} ${from.y + 4} ${from.z} ${to.x} ${from.y + 5} ${to.z} minecraft:tuff`)
consoleCmd(`fill ${from.x} ${from.y + 6} ${from.z} ${to.x} ${from.y + 6} ${to.z} minecraft:deepslate`)
await sleep(1200)

const totalBlocks = (to.x - from.x + 1) * (to.y - from.y + 1) * (to.z - from.z + 1)
console.log(`--- quarry holds ${totalBlocks} blocks, ${SECONDS}s deadline ---`)

// split into COUNT vertical slabs along X so the bots do not fight over the same blocks
const width = to.x - from.x + 1
const slab = Math.ceil(width / COUNT)
const deadline = Date.now() + SECONDS * 1000
const shouldStop = () => Date.now() > deadline

const reporter = setInterval(() => {
  const s = fleetStats(miners)
  const left = Math.max(0, (deadline - Date.now()) / 1000)
  console.log(`t-${left.toFixed(0)}s total=${s.mined} per-bot=[${miners.map(m => m.stats.mined).join(', ')}] ${JSON.stringify(s.byName)}`)
}, 5000)

const started = Date.now()
await Promise.all(miners.map((m, i) => {
  const slabFrom = new Vec3(from.x + i * slab, from.y, from.z)
  const slabTo = new Vec3(Math.min(to.x, from.x + (i + 1) * slab - 1), to.y, to.z)
  if (slabFrom.x > slabTo.x) return Promise.resolve(null)
  return m.mineBox(slabFrom, slabTo, { shouldStop })
}))
clearInterval(reporter)

const secs = (Date.now() - started) / 1000
const s = fleetStats(miners)
const inv = miners.map(m => {
  const cobble = m.bot.inventory.items().filter(i => i.name === 'cobblestone').reduce((a, i) => a + i.count, 0)
  const all = m.bot.inventory.items().reduce((a, i) => a + i.count, 0)
  return `${m.username}: cobble=${cobble} items=${all}`
})

console.log('================ RESULT ================')
console.log(`bots:            ${COUNT}`)
console.log(`wall time:       ${secs.toFixed(1)}s`)
console.log(`blocks mined:    ${s.mined} (failed ${s.failed})`)
console.log(`fleet rate:      ${(s.mined / secs).toFixed(2)} blocks/s`)
console.log(`per bot:         ${miners.map(m => (m.stats.mined / secs).toFixed(2)).join(' / ')} blocks/s`)
console.log(`materials:       ${JSON.stringify(s.byName)}`)
console.log(`inventories:     ${inv.join(' | ')}`)
console.log(`pickaxes held:   ${miners.map(m => m.bot.inventory.items().some(i => i.name.includes('pickaxe'))).join(', ')}`)

const ok = s.mined > 20 && inv.some(i => !i.endsWith('items=0'))
console.log(ok ? 'FLEET TEST PASSED' : 'FLEET TEST FAILED')
for (const m of miners) m.bot.quit()
process.exit(ok ? 0 : 1)
