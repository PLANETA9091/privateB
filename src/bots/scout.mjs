// Prospector bot: patrols a pattern across the world and records whatever it can see.
// This is how the fleet learns where resources are - nothing is pre-placed.
// Ground mode (default): walks surface lanes with the pathfinder - exactly the mode the
// production fleet runs in (allow-flight=false would kick a flying bot).
// Fly mode (fly: true): the original airborne lawnmower, kept for worlds where flying is allowed.
import mineflayer from 'mineflayer'
import pathfinderPkg from 'mineflayer-pathfinder'
import { Vec3 } from 'vec3'
import { installFly } from '../lib/fly.mjs'
import { gotoSafe } from '../lib/jobqueue.mjs'
import { attachChatSync } from '../fleet/chatsync.mjs'

const { pathfinder, Movements, goals } = pathfinderPkg

// Blocks worth remembering while scanning (natural resources the build needs).
export const SCAN_TARGETS = [
  'sand', 'gravel', 'clay', 'oak_log', 'birch_log', 'spruce_log', 'dark_oak_log', 'jungle_log',
  'stone', 'deepslate', 'andesite', 'diorite', 'tuff', 'basalt', 'blackstone', 'coal_ore',
  'iron_ore', 'copper_ore', 'dirt', 'grass_block', 'soul_soil', 'obsidian', 'terracotta',
  'mangrove_roots', 'mud'
]

// One scan of everything currently loaded around the bot, recorded into the shared map.
// Kept small and yielding: a long synchronous scan starves the event loop, which got
// flying scouts kicked for floating (ground scouts just stutter, but still - yield).
// Exported separately so unit tests can drive it with a mock bot.
export function createScan ({ bot, map, targets = SCAN_TARGETS, stats = { scans: 0, found: 0 }, log = () => {} } = {}) {
  return async function scan () {
    const found = bot.findBlocks({
      matching: block => targets.includes(block.name),
      maxDistance: 48,
      count: 192
    })
    stats.scans++
    const here = bot.entity?.position?.floored() ?? { x: 0, z: 0 }
    map?.markScanned(here.x >> 4, here.z >> 4)
    let added = 0
    for (let i = 0; i < found.length; i++) {
      const block = bot.blockAt(found[i])
      if (!block) continue
      const before = map ? map.size(block.name) : 0
      map?.add(block.name, found[i])
      if (map && map.size(block.name) > before) added++
      if (i % 32 === 31) await new Promise(resolve => setImmediate(resolve))
    }
    stats.found += added
    if (added > 0 && log) log(`scan: +${added} new positions (total ${map?.total() ?? 0})`)
    return found.length
  }
}

export function createScout ({
  host = '127.0.0.1',
  port = 25565,
  username = 'Scout',
  targets = SCAN_TARGETS,
  map,
  fly = false, // ground patrol by default: allow-flight=false kicks hovering bots
  syncChat = false, // broadcast every NEW find over chat (PVB1) so bots in OTHER processes hear it
  log = () => {}
} = {}) {
  const bot = mineflayer.createBot({ host, port, username, version: '26.2', auth: 'offline' })
  bot.loadPlugin(pathfinder)
  const tag = `[${username}]`
  const stats = { scans: 0, found: 0, travelled: 0 }
  const sync = syncChat ? attachChatSync(bot, map, { flushEveryMs: 4000, maxPerFlush: 40, log: m => log(`${tag} ${m}`) }) : null

  bot.on('error', e => log(`${tag} error: ${e.message}`))
  bot.on('kicked', r => log(`${tag} KICKED: ${typeof r === 'string' ? r : JSON.stringify(r)}`))
  bot.on('end', r => log(`${tag} disconnected (${r})`))

  const ready = new Promise((resolve, reject) => {
    bot.once('spawn', async () => {
      if (fly === true) installFly(bot, { speed: 2.0, antiKick: true, log: m => log(`${tag} ${m}`) })
      else {
        bot.physicsEnabled = true
        // scout movements: WALK ONLY - a scout that digs is a miner with extra steps
        const moves = new Movements(bot, bot.registry)
        moves.canDig = false
        moves.allow1by1towers = false
        moves.allowParkour = false
        moves.allowFreeMotion = false
        moves.maxDropDown = 3
        moves.dontCreateFlow = true
        moves.scafoldingBlocks = []
        bot.pathfinder.setMovements(moves)
        log(`${tag} ground scout - walking patrol (no fly, no digging)`)
      }
      await waitForWorld()
      resolve(bot)
    })
    bot.once('error', reject)
  })

  async function waitForWorld (timeoutMs = 20000) {
    const started = Date.now()
    while (Date.now() - started < timeoutMs) {
      if (bot.entity?.position && bot.blockAt(bot.entity.position)) return true
      await new Promise(r => setTimeout(r, 250))
    }
    throw new Error('world never loaded')
  }

  const scan = createScan({ bot, map, targets, stats, log: m => log(`${tag} ${m}`) })
  // when chat sync is on, every NEW position goes on the air right after it is recorded
  const scanWithSync = sync
    ? async () => {
      const before = map ? map.total() : 0
      const r = await scan()
      if (map && map.total() > before) {
        // enqueue only what this scan just added: walk the newest bucket entries
        for (const [name, bucket] of map.found) {
          for (const entry of bucket.values()) {
            if (entry.seenAt > Date.now() - 6000) sync.enqueue(name, entry.pos)
          }
        }
      }
      return r
    }
    : scan
  const patrol = createPatrol({ bot, map, scan: scanWithSync, stats })

  return { bot, ready, scan: scanWithSync, patrol, stats, username, sync: sync ?? null }
}

// The lawnmower: fly mode rides altitude-110 lanes with flyTravel, ground mode walks
// surface lanes with the pathfinder (short legs - a single goto over 96 blocks of forest
// stalls on trees). Both scan at every leg and never overlap lane history.
// Exported separately so unit tests can drive it with a mock bot.
export function createPatrol ({ bot, map, scan, stats = { travelled: 0 } }) {
  return async function patrol ({ origin = null, heading = 'east', distance = 96, lanes = 4, laneGap = 24, altitude = 110, seconds = 300 } = {}) {
    const start = origin ? new Vec3(origin.x, origin.y, origin.z) : bot.entity.position.clone()
    const deadline = Date.now() + seconds * 1000
    const dirs = {
      east: [1, 0], west: [-1, 0], north: [0, -1], south: [0, 1]
    }
    const [dx, dz] = dirs[heading] ?? dirs.east
    const flying = typeof bot.flyTravel === 'function'
    let lane = 0
    for (; lane < lanes; lane++) {
      if (Date.now() > deadline) break
      const offX = dz === 0 ? 0 : lane * laneGap
      const offZ = dx === 0 ? 0 : lane * laneGap
      const back = lane % 2 === 1
      const a = new Vec3(start.x + offX + (back ? dx * distance : 0), flying ? altitude : start.y, start.z + offZ + (back ? dz * distance : 0))
      const b = new Vec3(start.x + offX + (back ? 0 : dx * distance), flying ? altitude : start.y, start.z + offZ + (back ? 0 : dz * distance))
      for (const leg of [a, b]) {
        while (Date.now() < deadline) {
          const here = bot.entity.position
          const remaining = here.distanceTo(leg)
          if (remaining < (flying ? 24 : 6)) break
          const stepLen = Math.min(flying ? 64 : 24, remaining)
          const step = new Vec3(
            here.x + (leg.x - here.x) / remaining * stepLen,
            flying ? altitude : leg.y,
            here.z + (leg.z - here.z) / remaining * stepLen
          )
          try {
            if (flying) {
              await bot.flyTravel(step, { speed: 2.0, cruiseAbove: 24, timeoutMs: 20000 })
              stats.travelled += 64
            } else {
              await gotoSafe(bot, new goals.GoalNear(step.x, step.y, step.z, 2), { timeoutMs: 15000, label: 'scout leg' })
              stats.travelled += stepLen
            }
          } catch { /* stuck (water, cliff): scan here, then try the next leg anyway */ }
          await scan()
          await new Promise(r => setTimeout(r, 200))
        }
      }
      // move one lane across
      const shift = new Vec3(bot.entity.position.x + (dz === 0 ? 0 : laneGap), bot.entity.position.y, bot.entity.position.z + (dx === 0 ? 0 : laneGap))
      try {
        if (flying) await bot.flyTravel(shift, { speed: 2.0, cruiseAbove: 20, timeoutMs: 20000 })
        else await gotoSafe(bot, new goals.GoalNear(shift.x, shift.y, shift.z, 2), { timeoutMs: 15000, label: 'scout lane shift' })
      } catch { /* ignore */ }
      await scan()
    }
    return { ...stats, map: map?.report() }
  }
}
