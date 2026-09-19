#!/usr/bin/env node
// Full fleet run: launch COUNT bots (default 19, the server's player limit minus the owner),
// each one crafts its own tools, then they mine the build's materials non-stop. Kicked bots
// are respawned automatically, so the fleet keeps working.
//
// The fleet shares a WorldMap (src/fleet/worldmap.mjs): every walking miner records what it
// sees, and when a miner runs out of local targets it walks to a position the map knows.
// With SCOUT=1 (or the --scout flag) one bot slot becomes a dedicated ground scout that
// patrols and fills the map without digging.
//
//   node testbed/fleet19.mjs [bots] [seconds] [targets] [--scout]
//   SCOUT=1 node testbed/fleet19.mjs
import fs from 'node:fs'
import { createMiner, fleetStats } from '../src/bots/miner.mjs'
import { createScout } from '../src/bots/scout.mjs'
import { WorldMap } from '../src/fleet/worldmap.mjs'
import { attachChatSync } from '../src/fleet/chatsync.mjs'
import { attachMemoryGuard } from '../src/fleet/memory-guard.mjs'
import { KEEP as DEPOSIT_KEEP } from '../src/lib/deposit.mjs'
import { ensureTools, countItem } from '../src/bots/tools.mjs'
import { standGoalNear, gotoSafe } from '../src/lib/jobqueue.mjs'
import pathfinderPkg from 'mineflayer-pathfinder'
import { Vec3 } from 'vec3'

const { goals } = pathfinderPkg

const COUNT = Number(process.argv[2] || 19)
const SECONDS = Number(process.argv[3] || 300)
const TARGETS = (process.argv[4] || 'sand,gravel,oak_log,birch_log,spruce_log').split(',')
const SCOUT = process.argv.includes('--scout') || process.env.SCOUT === '1'
const SYNC = process.env.FLEET_SYNC === '1' // cross-process chat sync (PVB1)
const BATCH = COUNT // all bots at once (the user wants them working simultaneously)

// The shared resource map: scouts fill it, miners read it. Persisted so a restarted
// fleet does not start from zero knowledge (data/worldmap.json is gitignored).
const map = new WorldMap({ file: 'data/worldmap.json' })
const HEADINGS = ['east', 'south', 'west', 'north']

let need = {}
try {
  need = JSON.parse(fs.readFileSync('data/base-raw.json', 'utf8')).rawResources
} catch { /* plan is optional for the report */ }

const deadline = Date.now() + SECONDS * 1000
const bots = new Map() // name -> { miner, target }
const guards = new Map() // name -> memory guard (see src/fleet/memory-guard.mjs)
let spawned = 0
let reconnects = 0
let toolsOk = 0
let toolsReboot = 0 // successful tool re-bootstraps after deaths
let toolsRecovered = 0 // successful in-loop tool recoveries (the v0.6.9 "bare-handed forever" fix)
let banked = 0 // items deposited into the yard's chests

const aliveCount = () => [...bots.values()].filter(e => e.miner?.bot?.entity).length

// Materials plan progress: for every resource the base needs, how much the fleet is
// holding right now (inventories) vs the required amount. This is what turns a
// "blocks/s" number into actual progress towards the build.
// Vanilla DROPS, not the block, land in the inventory: stone mines to cobblestone,
// grass_block to dirt, deepslate to cobbled_deepslate - count those instead or every
// mined shaft shows as 0 collected (the first fleet run: stone 415 mined, 0 collected).
const DROP_OF = {
  stone: 'cobblestone',
  deepslate: 'cobbled_deepslate',
  grass_block: 'dirt'
}
function materialsProgress () {
  const list = [...bots.values()].map(e => e.miner).filter(Boolean)
  const out = {}
  for (const [res, required] of Object.entries(need)) {
    if (!Number.isFinite(required) || required <= 0) continue
    const item = DROP_OF[res] ?? res
    const have = list.reduce((a, m) => a + (m.bot?.inventory ? countItem(m.bot, item) : 0), 0)
    out[res] = { required, have, item, pct: Math.min(100, (have / required) * 100) }
  }
  return out
}

// The 5 resources we are furthest from finishing - what the fleet should focus on.
function topDeficits (n = 5) {
  return Object.values(materialsProgress())
    .sort((a, b) => (b.required - b.have) - (a.required - a.have))
    .slice(0, n)
    .map(m => `${m.required}/${m.have} (${m.pct.toFixed(1)}%)`)
    .join(' ')
}

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
        fly: false, // flight is off: bots walk (see README)
        map, // shared scout -> miner resource map
        log: () => {}
      })
      bots.set(name, { miner, target })
      await miner.ready

      // Bound the process memory: stale chunk columns (missed unload packets,
      // respawn dimension switches) pushed the first Big Fleet run into a 4 GB
      // heap OOM at t+210s. The guard evicts far columns + nudges the GC and its
      // stats are printed by the reporter below.
      const guard = attachMemoryGuard(miner.bot, { log: () => {} })
      guards.set(name, guard)

      // FLEET_SYNC=1: hear the OTHER processes' broadcasts (a scout in a second terminal)
      // and merge them into this process's shared map; also broadcast our own finds.
      const sync = SYNC ? attachChatSync(miner.bot, map, { flushEveryMs: 5000, maxPerFlush: 30, log: () => {} }) : null

      // Deploy on foot: with allow-flight=false vanilla kicks a bot that hovers for 80 ticks,
      // so sustained flight is not usable. The actual spreading happens while working: every
      // hop moves this bot 24 blocks along its own direction.
      const spawn = miner.bot.entity.position
      const goal = new Vec3(spawn.x + direction.x * deployDistance, spawn.y, spawn.z + direction.z * deployDistance)
      if (deployDistance > 2) {
        try {
          await gotoSafe(miner.bot, standGoalNear(miner.bot, goals, goal.x, goal.y, goal.z, { range: 3 }), { timeoutMs: 30000, label: 'deploy' })
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
      void spawnPoint // the workshop stays intact because its blocks (smooth_stone, stone_bricks) are never in the target list

      // Tool bootstrap: on the FIRST attempt AND after every death. A dead bot respawns
      // with an EMPTY inventory (everything was dropped where it died) - without the
      // re-bootstrap it would dig bare-handed for the rest of the run, which is exactly
      // the slow-bot pattern the rage-fastbreak benchmarks were built to avoid.
      const needsTools = !miner.bot.inventory.items().some(i => i.name.includes('pickaxe'))
      if (attempt === 0 || needsTools) {
        if (attempt > 0) console.log(`${name} respawned without tools - re-bootstrapping (attempt ${attempt})`)
        // spawn -> walk to a tree -> chop -> craft (no op, no gifts). 60s: the stall
        // escape (src/lib/woodplan.mjs) returns craftable bots early, and a bot that
        // finds NOTHING in 60s will not find it in 120s either - the v0.6.9 fleet had
        // 7 bots burn 120s on an empty forest and then never retry again
        try {
          await miner.gatherWood({ want: 8, direction, shouldStop: () => Date.now() > deadline, maxSeconds: 60 })
        } catch { /* go mine anyway */ }
        const res = await ensureTools(miner.bot, { miner, log: () => {} })
        if (res.ok && attempt === 0) toolsOk++
        if (res.ok && attempt > 0) toolsReboot++
        console.log(`${name} dir=(${direction.x.toFixed(2)},${direction.z.toFixed(2)}) logs=${miner.bot.inventory.items().filter(i => i.name.endsWith('_log')).reduce((a, i) => a + i.count, 0)} tools=${res.kit || 'none'}`)
      }

      const soft = ['dirt', 'grass_block', 'sand', 'gravel', 'clay', 'snow', 'soul_sand', 'podzol', 'coarse_dirt']
      const namesFor = pick => pick
        ? [...soft, 'stone', 'andesite', 'diorite', 'tuff', 'deepslate', 'granite', 'coal_ore', 'iron_ore', 'copper_ore']
        : soft

      // Shaft after shaft, on vanilla physics: no flight, no pathfinder stalls, and every bot
      // works its own column so 19 of them can dig at the same time.
      //
      // In-loop tool recovery: a bot whose bootstrap failed ONCE must not dig bare-handed
      // for the rest of the run. The v0.6.9 fleet ended with 8/19 bots pickaxe-less: 7
      // never found wood ("no planks recipe") and 1 never got a table, and all of them
      // spent the remaining minutes in dirt-only shafts. Every 45s without a pickaxe the
      // loop retries the whole chain - each retry sees the shared WorldMap that siblings
      // keep filling, so late retries actually find trees.
      let lastBootstrap = Date.now()
      let shaft = 0
      while (!(Date.now() > deadline) && miner.bot.entity) {
        const hasPick = miner.bot.inventory.items().some(i => i.name.includes('pickaxe'))
        if (!hasPick && Date.now() - lastBootstrap > 45000 && deadline - Date.now() > 80000) {
          lastBootstrap = Date.now()
          console.log(`${name} tool recovery: no pickaxe - re-running the bootstrap`)
          try {
            await miner.gatherWood({ want: 6, direction, shouldStop: () => Date.now() > deadline, maxSeconds: 40 })
          } catch { /* craft with whatever we have */ }
          const res = await ensureTools(miner.bot, { miner, log: () => {}, maxSeconds: 45 })
          if (res.ok) toolsRecovered++
          console.log(`${name} tool recovery: ${res.ok ? 'OK' : 'failed'} (${res.kit || 'none'})`)
        }
        await miner.digShaft(namesFor(hasPick), {
          minY: 24,
          shouldStop: () => Date.now() > deadline || !miner.bot.entity
        })
        if (Date.now() > deadline || !miner.bot.entity) break
        // pockets nearly full: bank the loot in the yard's chest rows before digging on
        // (a full inventory turns every further dig into a wasted drop)
        if (miner.inventoryLoad().slots >= 30) {
          const res = await miner.depositLoot()
          if (res.deposited > 0) banked += res.deposited
        }
        // underground the bot still SEES ores in the shaft walls - record them into the
        // shared map (fleet digs with digShaft, which never goes through workOnGround,
        // so without this hook the fleet's map stayed empty the whole first run)
        miner.recordToMap({ maxDistance: 24, count: 32 })
        // step to a fresh column and dig the next shaft. The walk target MUST be a
        // standable spot: a raw "here + direction*8" goal sits inside unexcavated stone
        // at shaft-bottom y, and 19 bots pathing toward sealed goals were the heap OOM
        // (v0.6.4 investigation). standGoalNear snaps the goal to a walkable surface.
        shaft++
        const here = miner.bot.entity.position
        const side = new Vec3(here.x + direction.x * 8, here.y, here.z + direction.z * 8)
        try {
          await gotoSafe(miner.bot, standGoalNear(miner.bot, goals, side.x, side.y, side.z, { range: 2 }), { timeoutMs: 20000, label: 'next column' })
        } catch {
          try {
            await gotoSafe(miner.bot, standGoalNear(miner.bot, goals, here.x + (shaft % 2 ? 6 : -6), here.y, here.z + (shaft % 3 ? 6 : -6), { range: 2 }), { timeoutMs: 20000, label: 'next column alt' })
          } catch { /* next shaft from here */ }
        }
      }

      // FLEET_SYNC (v0.6.0): cross-process resource sync. The shared WorldMap works by
      // reference inside THIS process; chat (PVB1, src/fleet/chatsync.mjs) is the only
      // channel to OTHER processes - a scout in a second terminal merges our finds live.
      if (sync) sync.stop()
      if (guard) { guard.stop(); guards.delete(name) }

      // end-of-run banking: after the deadline the pockets still hold loot that would
      // otherwise be lost when the bot quits - one final walk to the chests. Skipped
      // when only KEEP-list items remain (a pointless walk to the yard costs minutes).
      const bankable = miner.bot.entity &&
        miner.bot.inventory.items().some(i => !DEPOSIT_KEEP.some(k => i.name.includes(k)))
      if (bankable) {
        try {
          const res = await miner.depositLoot({ timeoutMs: 120000 })
          if (res.deposited > 0) banked += res.deposited
        } catch { /* report whatever was banked so far */ }
      }
    } catch (e) {
      if (/kicked|end|disconnect/i.test(e.message)) reconnects++
    }
    if (Date.now() >= deadline) break
    reconnects++
    await new Promise(r => setTimeout(r, 3000))
  }
}

process.on('unhandledRejection', e => console.log(`[fleet] unhandled rejection (kept alive): ${e?.stack || e}`))
process.on('uncaughtException', e => console.log(`[fleet] uncaught exception (kept alive): ${e?.stack || e}`))

console.log(`launching ${COUNT} bots for ${SECONDS}s -> targets ${TARGETS.join(', ')}${SCOUT ? ' (+1 ground scout)' : ''}`)
const names = Array.from({ length: COUNT }, (_, i) => `F${i + 1}`)
const runners = []

// The dedicated ground scout (optional): one of the bot slots patrols and fills the
// shared map instead of digging. It walks, it never flies, it never digs.
if (SCOUT) {
  runners.push((async () => {
    for (let attempt = 0; attempt < 6 && Date.now() < deadline; attempt++) {
      let scout
      try {
        scout = createScout({
          host: '127.0.0.1',
          port: 25565,
          username: 'FleetScout',
          map,
          fly: false, // ground patrol: allow-flight=false would kick a flying scout
          log: m => console.log(`[scout] ${m}`)
        })
        await scout.ready
        let heading = HEADINGS[attempt % HEADINGS.length]
        console.log(`[scout] patrolling ${heading} for ${Math.max(10, (deadline - Date.now()) / 1000 | 0)}s`)
        while (Date.now() < deadline && scout.bot.entity) {
          await scout.patrol({ heading, distance: 96, lanes: 4, laneGap: 24, seconds: Math.max(10, (deadline - Date.now()) / 1000) })
          // one full lawn cycles through the next compass direction
          heading = HEADINGS[(HEADINGS.indexOf(heading) + 1) % HEADINGS.length]
        }
        return
      } catch (e) {
        console.log(`[scout] attempt failed: ${e.message}`)
      }
      await new Promise(r => setTimeout(r, 3000))
    }
  })())
}

for (let i = 0; i < names.length; i += BATCH) {
  const slice = names.slice(i, i + BATCH)
  for (const name of slice) {
    const index = i + slice.indexOf(name)
    runners.push(runBot(name, TARGETS[index % TARGETS.length], index))
    spawned++
  }
  await new Promise(r => setTimeout(r, 300)) // tiny stagger so the joins do not collide
}

const reporter = setInterval(() => {
  const list = [...bots.values()].map(e => e.miner).filter(Boolean)
  const s = fleetStats(list)
  const per = TARGETS.map(t => `${t}=${list.reduce((a, m) => a + (m.bot?.inventory ? countItem(m.bot, t) : 0), 0)}`).join(' ')
  const mapRep = map.report()
  console.log(`t-${Math.max(0, (deadline - Date.now()) / 1000).toFixed(0)}s alive=${aliveCount()}/${COUNT} mined=${s.mined} map=${mapRep.positions}p/${mapRep.chunksScanned}ch banked=${banked} | ${per}`)
  if (Object.keys(need).length) console.log(`   deficits: ${topDeficits()}`)
  // per-bot line: what each bot actually has in its inventory right now
  const detail = list.map(m => {
    const inv = m.bot?.inventory ? m.bot.inventory.items().reduce((a, i) => { a[i.name] = (a[i.name] || 0) + i.count; return a }, {}) : {}
    const top = Object.entries(inv).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k}:${v}`).join(' ')
    return `${m.username}=${m.stats.mined}[${top || 'empty'}]`
  }).join(' | ')
  console.log(`   ${detail}`)
  // memory line: the OOM run had no visibility into heap growth at all
  const mem = process.memoryUsage()
  const gs = [...guards.values()].map(g => { try { return g.stats() } catch { return null } }).filter(Boolean)
  const cols = gs.reduce((a, s) => a + s.columns, 0)
  const ents = gs.reduce((a, s) => a + s.entities, 0)
  const evicted = gs.reduce((a, s) => a + s.evicted, 0)
  console.log(`   mem: heap=${(mem.heapUsed / 1048576).toFixed(0)}M/${(mem.heapTotal / 1048576).toFixed(0)}M rss=${(mem.rss / 1048576).toFixed(0)}M cols=${cols} ents=${ents} evicted=${evicted}`)
}, 15000)

await Promise.all(runners)
clearInterval(reporter)

const list = [...bots.values()].map(e => e.miner).filter(Boolean)
const s = fleetStats(list)
const secs = SECONDS
console.log('================ FLEET RESULT ================')
console.log(`bots=${COUNT} spawned=${spawned} reconnects=${reconnects} tools=${toolsOk} recovered=${toolsRecovered} reboots=${toolsReboot} alive=${aliveCount()} banked=${banked}`)
console.log(`blocks mined: ${s.mined} in ~${secs}s = ${(s.mined / secs).toFixed(2)} blocks/s (${((s.mined / secs) * 60).toFixed(0)}/min)`)
for (const t of TARGETS) {
  const got = list.reduce((a, m) => a + (m.bot?.inventory ? countItem(m.bot, t) : 0), 0)
  const required = need[t]
  console.log(`  ${t.padEnd(13)} collected ${String(got).padStart(7)}${required ? ` (${((got / required) * 100).toFixed(3)}% of ${required.toLocaleString()})` : ''}`)
}
console.log(`materials: ${JSON.stringify(s.byName)}`)
console.log(`kicks handled: ${reconnects}`)
const finalMap = map.report()
console.log(`worldmap: ${finalMap.positions} positions, ${finalMap.chunksScanned} chunks scanned, top: ${finalMap.top.slice(0, 5).map(([n, c]) => `${n}=${c}`).join(' ')}`)
map.save() // next fleet starts with this knowledge

// Machine-readable report for the plan loop: what was produced, by whom, and how far
// the build's material plan got. Consumed by scripts and by the next session's agent.
const materials = materialsProgress()
const fleetReport = {
  finishedAt: new Date().toISOString(),
  seconds: SECONDS,
  bots: COUNT,
  spawned,
  reconnects,
  toolsOk,
  toolsRecovered,
  toolsReboot,
  banked,
  mined: s.mined,
  blocksPerSecond: secs > 0 ? Number((s.mined / secs).toFixed(3)) : 0,
  perBot: list.map(m => ({
    name: m.username,
    mined: m.stats.mined,
    banked: m.stats.banked ?? 0,
    mapTrips: m.stats.mapTrips ?? 0,
    mapRecords: m.stats.mapRecords ?? 0,
    byName: m.stats.byName
  })),
  materials,
  worldmap: finalMap
}
try {
  fs.writeFileSync('data/fleet-report.json', JSON.stringify(fleetReport, null, 2))
  console.log('report: data/fleet-report.json written')
} catch (e) {
  console.log(`report: could not write fleet-report.json (${e.message})`)
}
console.log(`plan progress: ${Object.values(materials).filter(m => m.pct >= 100).length}/${Object.keys(materials).length} resources complete`)

for (const m of list) { try { m.bot.quit() } catch { /* already gone */ } }
process.exit(0)
