#!/usr/bin/env node
// Full fleet run: launch COUNT bots (default 19, the server's player limit minus the owner),
// each one crafts its own tools, then they mine the build's materials non-stop. Kicked bots
// are respawned automatically, so the fleet keeps working.
//
//   node testbed/fleet19.mjs [bots] [seconds] [targets]
import fs from 'node:fs'
import { createMiner, fleetStats } from '../src/bots/miner.mjs'
import { ensureTools, countItem } from '../src/bots/tools.mjs'
import pathfinderPkg from 'mineflayer-pathfinder'
import { Vec3 } from 'vec3'

const { goals } = pathfinderPkg

const COUNT = Number(process.argv[2] || 19)
const SECONDS = Number(process.argv[3] || 300)
const TARGETS = (process.argv[4] || 'sand,gravel,oak_log,birch_log,spruce_log').split(',')
const BATCH = 4

let need = {}
try {
  need = JSON.parse(fs.readFileSync('data/base-raw.json', 'utf8')).rawResources
} catch { /* plan is optional for the report */ }

const deadline = Date.now() + SECONDS * 1000
const bots = new Map() // name -> { miner, target }
let spawned = 0
let reconnects = 0
let toolsOk = 0

const aliveCount = () => [...bots.values()].filter(e => e.miner?.bot?.entity).length

async function runBot (name, target, index) {
  // Each bot gets its own compass direction and deployment distance: that is what stops all
  // 19 of them from mining the same spot and stealing each other's drops.
  const angle = (index / COUNT) * Math.PI * 2
  const direction = new Vec3(Math.cos(angle), 0, Math.sin(angle))
  const deployDistance = (index % 4) * 8 // just enough to not stand inside each other

  for (let attempt = 0; attempt < 12 && Date.now() < deadline; attempt++) {
    let miner
    try {
      miner = createMiner({
        host: '127.0.0.1',
        port: 25565,
        username: name,
        mode: 'rage',
        flySpeed: 1.5,
        antiKickInterval: 20,
        log: () => {}
      })
      bots.set(name, { miner, target })
      await miner.ready

      // Deploy on foot: with allow-flight=false vanilla kicks a bot that hovers for 80 ticks,
      // so sustained flight is not usable. The actual spreading happens while working: every
      // hop moves this bot 24 blocks along its own direction.
      const spawn = miner.bot.entity.position
      const goal = new Vec3(spawn.x + direction.x * deployDistance, spawn.y, spawn.z + direction.z * deployDistance)
      if (deployDistance > 2) {
        try {
          await miner.bot.pathfinder.goto(new goals.GoalNear(goal.x, goal.y, goal.z, 3))
        } catch {
          for (let hop = 0; hop < 4; hop++) {
            const here = miner.bot.entity.position
            try {
              await miner.bot.flyTravel(new Vec3(here.x + direction.x * 12, here.y + 3, here.z + direction.z * 12), { speed: 1.5, cruiseAbove: 6, timeoutMs: 6000 })
              await miner.landHere()
            } catch { /* keep going */ }
          }
        }
      }

      // the workshop must not be eaten: forbid mining inside it and force every bot to walk
      // at least 48 blocks away from spawn before it starts digging
      const spawnPoint = miner.bot.entity.position.floored()
      const exclude = {
        min: new Vec3(spawnPoint.x - 30, spawnPoint.y - 10, spawnPoint.z - 20),
        max: new Vec3(spawnPoint.x + 30, spawnPoint.y + 14, spawnPoint.z + 20)
      }

      if (attempt === 0) {
        // first wood on foot (ready-made collect), then craft the kit
        await miner.collectArea(['oak_log', 'birch_log', 'spruce_log', 'jungle_log', 'dark_oak_log', 'acacia_log', 'mangrove_log'], {
          direction, count: 4, hopDistance: 20, exclude, shouldStop: () => Date.now() > deadline
        })
        const res = await ensureTools(miner.bot, { miner, log: () => {} })
        if (res.ok) toolsOk++
        console.log(`${name} dir=(${direction.x.toFixed(2)},${direction.z.toFixed(2)}) tools=${res.kit || 'none'}`)
      }

      const hasPick = miner.bot.inventory.items().some(i => i.name.includes('pickaxe'))
      const names = hasPick
        ? ['sand', 'gravel', 'dirt', 'grass_block', 'clay', 'stone', 'cobblestone', 'andesite', 'diorite', 'tuff', 'deepslate', 'coal_ore', 'iron_ore', 'granite', 'oak_log', 'birch_log', 'spruce_log']
        : ['sand', 'gravel', 'dirt', 'grass_block', 'clay', 'oak_log', 'birch_log', 'spruce_log']

      // mine the ready-made way: collectblock handles pathfinding, tool swap, digging, pickup
      await miner.collectArea(names, {
        direction,
        count: 16,
        hopDistance: 32,
        exclude,
        shouldStop: () => Date.now() > deadline || !miner.bot.entity
      })
    } catch (e) {
      if (/kicked|end|disconnect/i.test(e.message)) reconnects++
    }
    if (Date.now() >= deadline) break
    reconnects++
    await new Promise(r => setTimeout(r, 3000))
  }
}

console.log(`launching ${COUNT} bots for ${SECONDS}s -> targets ${TARGETS.join(', ')}`)
const names = Array.from({ length: COUNT }, (_, i) => `F${i + 1}`)
const runners = []
for (let i = 0; i < names.length; i += BATCH) {
  const slice = names.slice(i, i + BATCH)
  for (const name of slice) {
    const index = i + slice.indexOf(name)
    runners.push(runBot(name, TARGETS[index % TARGETS.length], index))
    spawned++
  }
  await new Promise(r => setTimeout(r, 2500)) // staggered joins
}

const reporter = setInterval(() => {
  const list = [...bots.values()].map(e => e.miner).filter(Boolean)
  const s = fleetStats(list)
  const per = TARGETS.map(t => `${t}=${list.reduce((a, m) => a + (m.bot?.inventory ? countItem(m.bot, t) : 0), 0)}`).join(' ')
  console.log(`t-${Math.max(0, (deadline - Date.now()) / 1000).toFixed(0)}s alive=${aliveCount()}/${COUNT} mined=${s.mined} | ${per}`)
  // per-bot line: what each bot actually has in its inventory right now
  const detail = list.map(m => {
    const inv = m.bot?.inventory ? m.bot.inventory.items().reduce((a, i) => { a[i.name] = (a[i.name] || 0) + i.count; return a }, {}) : {}
    const top = Object.entries(inv).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k}:${v}`).join(' ')
    return `${m.username}=${m.stats.mined}[${top || 'empty'}]`
  }).join(' | ')
  console.log(`   ${detail}`)
}, 15000)

await Promise.all(runners)
clearInterval(reporter)

const list = [...bots.values()].map(e => e.miner).filter(Boolean)
const s = fleetStats(list)
const secs = SECONDS
console.log('================ FLEET RESULT ================')
console.log(`bots=${COUNT} spawned=${spawned} reconnects=${reconnects} tools=${toolsOk} alive=${aliveCount()}`)
console.log(`blocks mined: ${s.mined} in ~${secs}s = ${(s.mined / secs).toFixed(2)} blocks/s (${((s.mined / secs) * 60).toFixed(0)}/min)`)
for (const t of TARGETS) {
  const got = list.reduce((a, m) => a + (m.bot?.inventory ? countItem(m.bot, t) : 0), 0)
  const required = need[t]
  console.log(`  ${t.padEnd(13)} collected ${String(got).padStart(7)}${required ? ` (${((got / required) * 100).toFixed(3)}% of ${required.toLocaleString()})` : ''}`)
}
console.log(`materials: ${JSON.stringify(s.byName)}`)
console.log(`kicks handled: ${reconnects}`)
for (const m of list) { try { m.bot.quit() } catch { /* already gone */ } }
process.exit(0)
