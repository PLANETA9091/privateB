// Prospector bot: flies a pattern across the world and records whatever it can see.
// This is how the fleet learns where resources are - nothing is pre-placed.
import mineflayer from 'mineflayer'
import { Vec3 } from 'vec3'
import { installFly } from '../lib/fly.mjs'

// Blocks worth remembering while scanning (natural resources the build needs).
export const SCAN_TARGETS = [
  'sand', 'gravel', 'clay', 'oak_log', 'birch_log', 'spruce_log', 'dark_oak_log', 'jungle_log',
  'stone', 'deepslate', 'andesite', 'diorite', 'tuff', 'basalt', 'blackstone', 'coal_ore',
  'iron_ore', 'copper_ore', 'dirt', 'grass_block', 'soul_soil', 'obsidian', 'terracotta',
  'mangrove_roots', 'mud'
]

export function createScout ({
  host = '127.0.0.1',
  port = 25565,
  username = 'Scout',
  targets = SCAN_TARGETS,
  map,
  log = () => {}
} = {}) {
  const bot = mineflayer.createBot({ host, port, username, version: '26.2', auth: 'offline' })
  const tag = `[${username}]`
  const stats = { scans: 0, found: 0, travelled: 0 }

  bot.on('error', e => log(`${tag} error: ${e.message}`))
  bot.on('kicked', r => log(`${tag} KICKED: ${typeof r === 'string' ? r : JSON.stringify(r)}`))
  bot.on('end', r => log(`${tag} disconnected (${r})`))

  const ready = new Promise((resolve, reject) => {
    bot.once('spawn', async () => {
      installFly(bot, { speed: 2.0, antiKick: true, log: m => log(`${tag} ${m}`) })
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

  // One scan of everything currently loaded around the bot.
  // Kept small and yielding: a long synchronous scan starves the event loop and the
  // anti-kick stops firing, which gets the bot kicked for floating.
  async function scan () {
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
    return found.length
  }

  // Fly a lawnmower route and scan as we go. Returns stats.
  async function patrol ({ origin = null, heading = 'east', distance = 400, lanes = 4, laneGap = 48, altitude = 110, seconds = 120 } = {}) {
    const start = origin ? new Vec3(origin.x, origin.y, origin.z) : bot.entity.position.clone()
    const deadline = Date.now() + seconds * 1000
    const dirs = {
      east: [1, 0], west: [-1, 0], north: [0, -1], south: [0, 1]
    }
    const [dx, dz] = dirs[heading] ?? dirs.east
    let lane = 0
    for (; lane < lanes; lane++) {
      if (Date.now() > deadline) break
      const offX = dz === 0 ? 0 : lane * laneGap
      const offZ = dx === 0 ? 0 : lane * laneGap
      const back = lane % 2 === 1
      const a = new Vec3(start.x + offX + (back ? dx * distance : 0), altitude, start.z + offZ + (back ? dz * distance : 0))
      const b = new Vec3(start.x + offX + (back ? 0 : dx * distance), altitude, start.z + offZ + (back ? 0 : dz * distance))
      for (const leg of [a, b]) {
        while (Date.now() < deadline) {
          const here = bot.entity.position
          const remaining = here.distanceTo(leg)
          if (remaining < 24) break
          // hop in 64-block steps so we scan the whole lane instead of one long jump
          const step = new Vec3(
            here.x + (leg.x - here.x) / remaining * Math.min(64, remaining),
            altitude,
            here.z + (leg.z - here.z) / remaining * Math.min(64, remaining)
          )
          try {
            await bot.flyTravel(step, { speed: 2.0, cruiseAbove: 24, timeoutMs: 20000 })
            stats.travelled += 64
          } catch { /* keep scanning even if the hop failed */ }
          await scan()
          await new Promise(r => setTimeout(r, 200))
        }
      }
      // move one lane across
      const shift = new Vec3(bot.entity.position.x + (dz === 0 ? 0 : laneGap), altitude, bot.entity.position.z + (dx === 0 ? 0 : laneGap))
      try { await bot.flyTravel(shift, { speed: 2.0, cruiseAbove: 20, timeoutMs: 20000 }) } catch { /* ignore */ }
    }
    return { ...stats, map: map?.report() }
  }

  return { bot, ready, scan, patrol, stats, username }
}
