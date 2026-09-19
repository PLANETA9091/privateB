// Mining bot: flies to a spot it is allowed to stand in, fast-breaks an exposed block,
// then flies into the freed space to pick the drop up. No pathfinder, so no
// "place a block under yourself to climb" behaviour. No op, no items required.
import mineflayer from 'mineflayer'
import { plugin as toolPlugin } from 'mineflayer-tool'
import { plugin as collectBlockPlugin } from 'mineflayer-collectblock'
import { loader as autoeat } from 'mineflayer-auto-eat'
import pathfinderPkg from 'mineflayer-pathfinder'

const { pathfinder, Movements, goals } = pathfinderPkg
import { Vec3 } from 'vec3'
import { installFly } from '../lib/fly.mjs'
import { installRageFastBreak } from '../lib/fastdig.mjs'
import { MiningJobQueue, withTimeout, gotoSafe, inBox } from '../lib/jobqueue.mjs'

export const BOT_VERSION = '26.2'
export const HAND_DIGGABLE = ['dirt', 'grass_block', 'coarse_dirt', 'podzol', 'sand', 'gravel', 'clay', 'soul_sand', 'snow', 'oak_log', 'birch_log', 'spruce_log']

export function createMiner ({
  host = '127.0.0.1',
  port = 25565,
  username = 'Miner',
  version = BOT_VERSION,
  flySpeed = 0.6,
  reach = 4.0,
  antiKick = true,
  antiKickInterval = 70,
  antiKickDistance = 0.035,
  fly = false, // flight OFF by default: with allow-flight=false vanilla kicks hovering bots
  mode = 'rage', // 'rage' = FastBreak cheat, 'honest' = plain client dig time
  log = () => {}
} = {}) {
  const bot = mineflayer.createBot({ host, port, username, version, auth: 'offline' })
  bot.loadPlugin(toolPlugin)
  bot.loadPlugin(collectBlockPlugin) // ready-made: pathfind to block, pick tool, dig, collect drops
  bot.loadPlugin(autoeat)
  bot.loadPlugin(pathfinder)

  const stats = { mined: 0, failed: 0, skipped: 0, flyFails: 0, hookCalls: 0, hookFails: 0, byName: {}, startedAt: 0 }
  const dugByHook = new Set()
  const tag = `[${username}]`

  bot.on('error', e => log(`${tag} error: ${e.message}`))
  // socket-level failures (EPIPE when the server closes the connection) must not kill the run
  bot._client?.on?.('error', e => log(`${tag} socket error: ${e.message}`))
  bot.on('kicked', r => log(`${tag} KICKED: ${typeof r === 'string' ? r : JSON.stringify(r)}`))
  bot.on('end', r => log(`${tag} disconnected (${r})`))
  bot.on('death', () => {
    log(`${tag} died - respawning`)
    stats.deaths = (stats.deaths ?? 0) + 1
    setTimeout(() => { try { bot.respawn?.() } catch { /* server respawns us anyway */ } }, 1000)
  })

  const ready = new Promise((resolve, reject) => {
    bot.once('spawn', async () => {
      if (fly === true) {
        installFly(bot, {
          speed: flySpeed,
          antiKick,
          antiKickInterval,
          antiKickDistance,
          digThrough: false,
          log: m => log(`${tag} ${m}`)
        })
      } else {
        // no flight: mineflayer's own physics moves the bot (walking, falling off ledges)
        bot.physicsEnabled = true
        log(`${tag} flight disabled - ground mode (pathfinder + vanilla physics)`)
      }
      installRageFastBreak(bot, { log: m => log(`${tag} ${m}`) })
      // flight uses this to mine its way through terrain that blocks the path
      bot.flyDigHook = async (block) => {
        const key = `${block.position.x},${block.position.y},${block.position.z}`
        stats.hookCalls++
        let ok = false
        try {
          ok = await bot.fastDig(block)
        } catch {
          stats.hookFails++
          return false
        }
        if (ok) {
          dugByHook.add(key)
          stats.mined++
          stats.byName[block.name] = (stats.byName[block.name] || 0) + 1
        } else {
          stats.hookFails++
        }
        return ok
      }
      // 'spawn' fires before chunk data arrives - scanning the world too early yields
      // an empty result set, so wait until we can actually read blocks around us.
      try {
        await waitForWorld()
      } catch (e) {
        log(`${tag} world never loaded: ${e.message}`)
      }
      resolve(bot)
    })
    bot.once('error', reject)
  })

  async function waitForWorld (timeoutMs = 20000) {
    const started = Date.now()
    while (Date.now() - started < timeoutMs) {
      const p = bot.entity?.position
      if (p) {
        let known = 0
        for (let dx = -8; dx <= 8; dx += 2) {
          for (let dz = -8; dz <= 8; dz += 2) {
            for (let dy = -4; dy <= 4; dy += 4) {
              if (bot.blockAt(new Vec3(Math.floor(p.x) + dx, Math.floor(p.y) + dy, Math.floor(p.z) + dz))) known++
            }
          }
        }
        if (known >= 20) return true
      }
      await new Promise(r => setTimeout(r, 250))
    }
    throw new Error('timed out waiting for chunk data')
  }

  function setMode (m) {
    mode = m
    bot.digTime = () => 0 // rage: destroyDelay 0, raw packets do the work
  }
  setMode(mode)

  const blockCenter = pos => new Vec3(pos.x + 0.5, pos.y + 0.5, pos.z + 0.5)

  // Vanilla snaps a player back ("moved wrongly!") if the hitbox is inside a block,
  // so only ever fly to free spots: feet + head in empty blocks.
  function isFreeSpot (vec) {
    const x = Math.floor(vec.x)
    const y = Math.floor(vec.y)
    const z = Math.floor(vec.z)
    const feet = bot.blockAt(new Vec3(x, y, z))
    const head = bot.blockAt(new Vec3(x, y + 1, z))
    return !!feet && !!head && feet.boundingBox === 'empty' && head.boundingBox === 'empty'
  }

  // A free spot within digging reach of the target block, closest to us first.
  // Only neighbourhood positions are considered (the 26 face/edge/corner neighbours plus
  // a couple of 2-block hops): a mining bot that can stand anywhere is unrealistic anyway.
  function standSpotFor (pos) {
    const center = blockCenter(pos)
    const me = bot.entity?.position ?? center
    const cands = []
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
          if (dx === 0 && dy === 0 && dz === 0) continue
          cands.push(new Vec3(pos.x + dx + 0.5, pos.y + dy + 0.5, pos.z + dz + 0.5))
        }
      }
    }
    cands.push(new Vec3(pos.x + 0.5, pos.y + 2.5, pos.z + 0.5))
    for (const [dx, dz] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) {
      cands.push(new Vec3(pos.x + dx + 0.5, pos.y + 0.5, pos.z + dz + 0.5))
    }
    const spots = []
    for (const p of cands) {
      const toBlock = p.distanceTo(center)
      if (toBlock > reach || toBlock < 1.0) continue
      if (!isFreeSpot(p)) continue
      spots.push({ p, toMe: p.distanceTo(me) })
    }
    if (!spots.length) return null
    spots.sort((a, b) => a.toMe - b.toMe)
    return spots[0].p
  }

  async function flyTo (vec) {
    if (!bot.flyTo) return false // flight disabled: caller falls back to walking
    try {
      await bot.flyTo(vec)
      return true
    } catch (e) {
      stats.flyFails++
      log(`${tag} flyTo failed: ${e.message}`)
      return false
    }
  }

  // returns true (mined), false (failed), 'skip' (buried / nothing to stand on yet)
  async function mineBlock (pos) {
    const block = bot.blockAt(pos)
    if (!block || block.type === 0) return false

    const spot = standSpotFor(pos)
    if (!spot) return 'skip'
    if (bot.entity.position.distanceTo(spot) > 0.5) {
      if (!await flyTo(spot)) return false
    }
    const eye = bot.entity.position.offset(0, bot.entity.eyeHeight ?? 1.62, 0)
    if (eye.distanceTo(blockCenter(pos)) > reach + 0.5) return false

    const current = bot.blockAt(pos)
    if (!current || current.type === 0) return false

    let ok
    if (mode === 'honest') {
      bot.digTime = bot.realDigTime
      try {
        await bot.dig(current)
        ok = true
      } catch (e) {
        log(`${tag} dig failed on ${current.name}: ${e.message}`)
        ok = false
      }
    } else {
      try {
        ok = await bot.fastDig(current)
      } catch (e) {
        log(`${tag} fastDig failed on ${current.name}: ${e.message}`)
        ok = false
      }
    }
    if (!ok) {
      stats.failed++
      return false
    }

    const key = `${pos.x},${pos.y},${pos.z}`
    if (!dugByHook.delete(key)) {
      stats.mined++
      stats.byName[current.name] = (stats.byName[current.name] || 0) + 1
    }

    // the block is gone now, so its space is a legal spot: fly in and collect the drop
    if (isFreeSpot(blockCenter(pos))) await flyTo(blockCenter(pos))
    return true
  }

  function scanBox (from, to, names = null) {
    const out = []
    const x1 = Math.min(from.x, to.x); const x2 = Math.max(from.x, to.x)
    const y1 = Math.min(from.y, to.y); const y2 = Math.max(from.y, to.y)
    const z1 = Math.min(from.z, to.z); const z2 = Math.max(from.z, to.z)
    for (let y = y1; y <= y2; y++) {
      for (let x = x1; x <= x2; x++) {
        for (let z = z1; z <= z2; z++) {
          const pos = new Vec3(x, y, z)
          const block = bot.blockAt(pos)
          if (!block || block.type === 0) continue
          if (names && !names.includes(block.name)) continue
          out.push(pos)
        }
      }
    }
    return out
  }

  async function mineBox (from, to, { names = null, maxBlocks = Infinity, onProgress = null, shouldStop = null } = {}) {
    let targets = scanBox(from, to, names)
    log(`${tag} job: ${targets.length} blocks (${names ? names.join(',') : 'everything'})`)
    stats.startedAt = Date.now()
    let done = 0
    let failStreak = 0

    // Pass 0: only blocks the bot can actually stand next to right now.
    // Pass 1: retry -- mining a neighbour may have opened access to buried blocks.
    for (let pass = 0; pass < 2 && targets.length; pass++) {
      const deferred = []
      while (targets.length) {
        if (shouldStop?.()) { targets.length = 0; break }
        if (done >= maxBlocks) break

        const pick = pickReachable(targets)
        if (!pick) {
          // nothing in reach any more: leave the rest for the next pass
          deferred.push(...targets)
          targets.length = 0
          break
        }
        targets.splice(pick.index, 1)
        const res = await mineBlock(pick.pos)
        if (res === true) {
          done++
          failStreak = 0
          if (onProgress && done % 8 === 0) onProgress(done, stats)
        } else if (res === 'skip') {
          stats.skipped++
          deferred.push(pick.pos)
        } else {
          failStreak++
          if (failStreak > 15) {
            log(`${tag} giving up: 15 hard failures in a row`)
            targets.length = 0
            break
          }
        }
      }
      targets = deferred
    }

    const secs = (Date.now() - stats.startedAt) / 1000
    return { done, secs, rate: secs > 0 ? done / secs : 0 }
  }

  // Nearest-first among targets the bot can actually reach right now.
  // Exposed blocks (air above) come first: buried ones need their neighbour broken first.
  function pickReachable (targets) {
    const me = bot.entity?.position
    const exposed = pos => {
      const above = bot.blockAt(new Vec3(pos.x, pos.y + 1, pos.z))
      return !!above && above.boundingBox === 'empty'
    }
    const idx = targets
      .map((pos, i) => ({ i, d: me ? pos.distanceTo(me) : i, e: exposed(pos) ? 0 : 1 }))
      .sort((a, b) => (a.e - b.e) || (a.d - b.d))
    const limit = Math.min(idx.length, 60)
    for (let k = 0; k < limit; k++) {
      const { i } = idx[k]
      const block = bot.blockAt(targets[i])
      if (!block || block.type === 0) return { index: i, pos: targets[i] }
      const spot = standSpotFor(targets[i])
      // fly can dig through terrain, so a free stand cell is enough here
      if (spot) return { index: i, pos: targets[i] }
    }
    return null
  }

  // ---------------------------------------------------------------- nuker mode
  // Maximum throughput: break every block in reach without travelling, then sweep up
  // the drops by flying to the item entities themselves (guarantees no drops are left).
  async function sweep (dugSpots = null) {
    // Drops are item entities: fly straight to them. Also revisit the blocks we just
    // broke, because their drops can sit inside the hole where no entity is tracked yet.
    for (let round = 0; round < 2; round++) {
      const me = bot.entity.position
      const items = Object.values(bot.entities)
        .filter(e => e.name === 'item' && e.position.distanceTo(me) < 24 && e.isValid !== false)
        .sort((a, b) => a.position.distanceTo(me) - b.position.distanceTo(me))
      for (const it of items.slice(0, 6)) {
        try {
          await bot.flyTo(it.position, { tolerance: 0.5, timeoutMs: 1500, speed: 1.5 })
        } catch { /* item was probably just picked up */ }
      }
      if (dugSpots && dugSpots.length) {
        const spots = dugSpots.splice(0, 8)
        for (const s of spots) {
          try {
            await bot.flyTo(new Vec3(s.x + 0.5, s.y + 0.5, s.z + 0.5), { tolerance: 0.5, timeoutMs: 1200, speed: 1.5 })
          } catch { /* nothing to collect here */ }
        }
      }
      if (!items.length && !(dugSpots && dugSpots.length)) break
    }
  }

  function candidatesInReach (names, radius) {
    const eye = bot.entity.position.offset(0, bot.entity.eyeHeight ?? 1.62, 0)
    const c = bot.entity.position.floored()
    const R = Math.ceil(radius)
    const out = []
    for (let dx = -R; dx <= R; dx++) {
      for (let dy = -R; dy <= R; dy++) {
        for (let dz = -R; dz <= R; dz++) {
          const pos = new Vec3(c.x + dx, c.y + dy, c.z + dz)
          const b = bot.blockAt(pos)
          if (!b || b.type === 0) continue
          if (names && !names.includes(b.name)) continue
          const mid = new Vec3(pos.x + 0.5, pos.y + 0.5, pos.z + 0.5)
          const d = mid.distanceTo(eye)
          if (d > radius) continue
          out.push({ pos, d })
        }
      }
    }
    out.sort((a, b) => a.d - b.d)
    return out
  }

  // Move the bot so fresh blocks enter reach: fly to the closest reachable target.
  async function advance (names) {
    for (let r = 3; r <= 24; r += 3) {
      const list = candidatesInReach(names, r + 0.5)
      for (const cand of list.slice(0, 6)) {
        const spot = standSpotFor(cand.pos)
        if (!spot) continue
        if (bot.entity.position.distanceTo(spot) < 1.5) continue
        try {
          await bot.flyTo(spot, { timeoutMs: 4000 })
          return true
        } catch { /* try the next candidate */ }
      }
    }
    return false
  }

  async function nukeAround (radius, { names = null, maxBlocks = Infinity, sweepEvery = 16, shouldStop = null, onProgress = null } = {}) {
    stats.startedAt = Date.now()
    const start = Date.now()
    let done = 0
    let idle = 0
    const dugSpots = []
    while (done < maxBlocks && !shouldStop?.()) {
      const cands = candidatesInReach(names, radius)
      let dugThisBatch = 0
      for (const cand of cands) {
        if (done >= maxBlocks || shouldStop?.()) break
        if (dugThisBatch >= sweepEvery) break
        const blk = bot.blockAt(cand.pos)
        if (!blk || blk.type === 0) continue
        let ok = false
        try {
          ok = await bot.fastDig(blk)
        } catch { ok = false }
        if (!ok) continue
        done++
        dugThisBatch++
        stats.mined++
        stats.byName[blk.name] = (stats.byName[blk.name] || 0) + 1
        dugSpots.push(cand.pos)
        if (onProgress && done % 16 === 0) onProgress(done, stats)
      }
      await sweep(dugSpots)
      if (dugThisBatch === 0) {
        if (!await advance(names)) {
          if (++idle > 2) break
        } else idle = 0
      } else idle = 0
    }
    await sweep(dugSpots)
    const secs = (Date.now() - start) / 1000
    stats.secs = secs
    return { done, secs, rate: secs > 0 ? done / secs : 0 }
  }

  // Bore in a straight line (dir is one of up/down/north/...): dig the next cell,
  // step into it, dig again. No travel time and the drops land exactly where the bot
  // steps, so nothing can be lost. This is the max-throughput, zero-loss mode.
  async function bore (dir, { maxBlocks = Infinity, names = null, shouldStop = null, onProgress = null } = {}) {
    stats.startedAt = Date.now()
    const start = Date.now()
    const d = new Vec3(Math.sign(dir.x), Math.sign(dir.y), Math.sign(dir.z))
    let done = 0
    let stuck = 0
    while (done < maxBlocks && !shouldStop?.()) {
      const pos = bot.entity.position.floored().offset(d.x, d.y, d.z)
      const blk = bot.blockAt(pos)
      if (blk && blk.type !== 0) {
        if (names && !names.includes(blk.name)) break
        let ok = false
        try {
          ok = await bot.fastDig(blk)
        } catch { ok = false }
        if (!ok) {
          stats.failed++
          if (++stuck > 6) break
          continue
        }
        done++
        stats.mined++
        stats.byName[blk.name] = (stats.byName[blk.name] || 0) + 1
        if (onProgress && done % 16 === 0) onProgress(done, stats)
      }
      // step into the freed cell: the drop is right here, pickup is immediate
      const next = new Vec3(pos.x + 0.5, pos.y, pos.z + 0.5)
      if (!bot.flySnap(next)) {
        try {
          await bot.flyTo(next, { tolerance: 0.3, timeoutMs: 2000, speed: 1.0 })
        } catch { /* keep digging from where we are */ }
      } else {
        await bot.waitForTicks(1)
      }
      if (!bot.blockAt(pos.offset(d.x, d.y, d.z))) break
    }
    const secs = (Date.now() - start) / 1000
    stats.secs = secs
    return { done, secs, rate: secs > 0 ? done / secs : 0 }
  }

  // Real-world harvesting: find the resource ourselves, travel to it, mine it, sweep it up.
  // No prepared terrain: positions come from the shared map (scouts) or from our own scan,
  // and if nothing is known nearby the bot flies outward until it finds some.
  async function harvestSite (name, { want = 64, map = null, searchRadius = 64, maxSeconds = 240, onProgress = null } = {}) {
    const started = Date.now()
    const itemName = name.replace('minecraft:', '')
    const countItem = () => bot.inventory.items().filter(i => i.name === itemName).reduce((a, i) => a + i.count, 0)
    const before = countItem()
    const stats0 = { travelled: 0, hops: 0 }
    let found = 0

    // 1. go to the best site the fleet already knows about
    if (map) {
      const known = map.nearest(name, bot.entity.position, { maxDistance: 5000, verifyWith: p => bot.blockAt(p) })
      if (known) {
        const dist = bot.entity.position.distanceTo(known)
        log(`${tag} ${name}: map knows a site ${dist.toFixed(0)} blocks away at ${known.floored()}`)
        try {
          await travelTo(known.offset(0, 4, 0), { speed: 2.0, cruiseAbove: 30, timeoutMs: 90000 })
          await landHere()
          stats0.travelled += dist
        } catch (e) {
          log(`${tag} travel to site failed: ${e.message}`)
        }
      }
    }

    // 2. mine until the quota is in the inventory
    while (countItem() - before < want && (Date.now() - started) / 1000 < maxSeconds) {
      const block = bot.findBlock({ matching: b => b.name === name, maxDistance: searchRadius })
      if (!block) {
        // unknown here: fly outward and look again (this is the "find it yourself" part)
        if (stats0.hops++ > 12) break
        const dir = stats0.hops % 4
        const step = new Vec3(
          bot.entity.position.x + (dir === 0 ? 96 : dir === 1 ? -96 : 0),
          bot.entity.position.y + 30,
          bot.entity.position.z + (dir === 2 ? 96 : dir === 3 ? -96 : 0)
        )
        try {
          await travelTo(step, { speed: 2.0, cruiseAbove: 26, timeoutMs: 30000 })
          await landHere()
          stats0.travelled += 96
        } catch { /* keep searching */ }
        continue
      }
      found++
      // approach through a FREE cell only - flying into rock is what the server rejects with
      // "moved wrongly!" (bots looked like they were teleporting around)
      const spot = standSpotFor(block.position)
      if (!spot) {
        if (stats0.hops++ > 12) break
        const dir = stats0.hops % 4
        const step = new Vec3(
          bot.entity.position.x + (dir === 0 ? 48 : dir === 1 ? -48 : 0),
          bot.entity.position.y,
          bot.entity.position.z + (dir === 2 ? 48 : dir === 3 ? -48 : 0)
        )
        try {
          await travelTo(step, { speed: 2.0, cruiseAbove: 12, timeoutMs: 20000 })
          await landHere()
          stats0.travelled += 48
        } catch { /* keep searching */ }
        continue
      }
      if (bot.entity.position.distanceTo(spot) > 3) {
        try {
          await travelTo(spot, { speed: 2.0, cruiseAbove: 14, timeoutMs: 30000 })
          await landHere()
          stats0.travelled += 8
        } catch { /* mine from where we are */ }
      }
      await nukeAround(4.5, {
        names: [name],
        sweepEvery: 12,
        shouldStop: () => countItem() - before >= want || (Date.now() - started) / 1000 > maxSeconds
      })
      await sweep()
      if (onProgress) onProgress(countItem() - before, stats)
    }

    const got = countItem() - before
    const secs = (Date.now() - started) / 1000
    stats.sites = (stats.sites ?? 0) + found
    log(`${tag} ${name}: harvested ${got}/${want} in ${secs.toFixed(1)}s (${(got / secs).toFixed(2)}/s), travelled ${(stats0.travelled / 1000).toFixed(2)}k blocks`)
    return { got, want, secs, travelled: stats0.travelled, sites: found }
  }

  // ---------------------------------------------------------------- ground mode
  // Flying while digging in terrain is what the server rejects ("moved wrongly!") and then
  // kicks for floating. So work on foot: legal pathfinder movement, fly only for deployment.
  let movementsReady = false
  function configureGroundMovements () {
    if (movementsReady) return
    const moves = new Movements(bot, bot.registry)
    moves.canDig = true
    moves.allow1by1towers = false // never place blocks under ourselves to climb
    moves.allowParkour = false
    moves.allowFreeMotion = false
    moves.maxDropDown = 4
    moves.dontCreateFlow = true
    moves.scafoldingBlocks = []
    bot.pathfinder.setMovements(moves)
    movementsReady = true
  }

  // Descend onto solid ground in the current column (only meaningful with flight; without it
  // vanilla physics already keeps the bot on the ground).
  async function landHere () {
    if (!bot.flyTo) return false
    const p = bot.entity.position
    const x = Math.floor(p.x)
    const z = Math.floor(p.z)
    for (let y = Math.floor(p.y) + 4; y > bot.game.minY + 2; y--) {
      const below = bot.blockAt(new Vec3(x, y - 1, z))
      const feet = bot.blockAt(new Vec3(x, y, z))
      const head = bot.blockAt(new Vec3(x, y + 1, z))
      if (below && below.boundingBox !== 'empty' && feet?.boundingBox === 'empty' && head?.boundingBox === 'empty') {
        try {
          await bot.flyTo(new Vec3(x + 0.5, y, z + 0.5), { tolerance: 0.3, timeoutMs: 8000 })
          return true
        } catch { return false }
      }
    }
    return false
  }

  /**
   * Mine on foot: dig everything wanted within reach, walk into the freed cells so the drops
   * are actually collected, then walk hopDistance blocks along this bot's own direction (which
   * is what keeps 19 bots from piling onto the same spot).
   */
  async function workOnGround (names, { direction = new Vec3(1, 0, 0), hopDistance = 24, maxBlocks = Infinity, shouldStop = null, onProgress = null, exclude = null, minDistanceFrom = null } = {}) {
    configureGroundMovements()
    await landHere()
    // Bots can spawn on treetops (world spawn selection picks canopies): from up there
    // nothing within reach matches the target names and every hop wastes time. Dig
    // straight down through leaves/wood until real solid ground is under our feet.
    for (let guard = 0; guard < 40; guard++) {
      const under = bot.blockAt(bot.entity.position.floored().offset(0, -1, 0))
      if (!bot.entity) break
      if (under && under.type !== 0 && under.boundingBox !== 'empty' && !/leaves/.test(under.name)) break
      if (under && under.type !== 0) {
        try { await bot.fastDig(under) } catch { break } // undiggable below - work from here
      }
      await bot.waitForTicks(4) // let gravity settle us into the freed cell
    }
    const started = Date.now()
    let done = 0
    const inExcluded = pos => exclude != null &&
      pos.x >= exclude.min.x && pos.x <= exclude.max.x &&
      pos.y >= exclude.min.y && pos.y <= exclude.max.y &&
      pos.z >= exclude.min.z && pos.z <= exclude.max.z
    const tooClose = () => minDistanceFrom != null && bot.entity &&
      Math.hypot(bot.entity.position.x - minDistanceFrom.x, bot.entity.position.z - minDistanceFrom.z) < minDistanceFrom.r

    let leaveAttempts = 0
    while (done < maxBlocks && !shouldStop?.() && bot.entity) {
      // do not mine at spawn: walk out to our own patch first (bots used to chew the workshop
      // floor). If we cannot get away (water, cliffs, a platform in the air) we give up after
      // a few tries and mine anyway - the exclude box still protects the workshop.
      if (tooClose() && leaveAttempts < 6) {
        leaveAttempts++
        const here = bot.entity.position
        const out = new Vec3(here.x + direction.x * 32, here.y, here.z + direction.z * 32)
        try { await gotoSafe(bot, new goals.GoalNear(out.x, out.y, out.z, 3)) } catch { /* try a hop */ }
        if (tooClose()) {
          try {
            await bot.flyTravel(new Vec3(out.x, here.y + 3, out.z), { speed: 1.5, cruiseAbove: 8, timeoutMs: 8000 })
            await landHere()
          } catch { /* keep walking */ }
        }
        continue
      }

      // 1. BATTERY: mine everything in reach without moving a single step. Walking between
      //    blocks (a pathfinder call each time) was what made the bots look delayed.
      const batch = bot.findBlocks({ matching: b => names.includes(b.name), maxDistance: 4.5, count: 40 })
        .filter(pos => !inExcluded(pos))
      let dug = 0
      for (const pos of batch) {
        if (done >= maxBlocks || shouldStop?.() || !bot.entity) break
        const block = bot.blockAt(pos)
        if (!block || block.type === 0) continue
        try {
          await bot.fastDig(block)
        } catch { continue }
        done++
        dug++
        stats.mined++
        stats.byName[block.name] = (stats.byName[block.name] || 0) + 1
      }

      // 2. one single walk to collect the whole batch (the bot only moves once per batch)
      if (dug > 0) {
        const centre = batch.slice(0, Math.max(1, dug)).reduce((acc, p) => acc.add(p), new Vec3(0, 0, 0)).scale(1 / Math.max(1, dug))
        try {
          await gotoSafe(bot, new goals.GoalNear(centre.x, centre.y, centre.z, 2))
        } catch { /* whatever we could not reach is left behind */ }
      }
      const drops = Object.values(bot.entities)
        .filter(e => e.name === 'item' && e.position.distanceTo(bot.entity.position) < 14)
        .slice(0, 8)
      for (const drop of drops) {
        try { await gotoSafe(bot, new goals.GoalNear(drop.position.x, drop.position.y, drop.position.z, 1)) } catch { /* already picked up */ }
      }
      if (onProgress) onProgress(done, stats)
      const here = bot.entity.position
      const goal = new Vec3(here.x + direction.x * hopDistance, here.y, here.z + direction.z * hopDistance)
      try { await gotoSafe(bot, new goals.GoalNear(goal.x, goal.y, goal.z, 3)) } catch { /* keep working here */ }
    }
    const secs = (Date.now() - started) / 1000
    stats.secs = secs
    return { done, secs, rate: secs > 0 ? done / secs : 0 }
  }

  /**
   * Mining the ready-made way: mineflayer-collectblock's collect() does the pathfinding, the
   * tool swap, the digging and the drop pickup (that is the exact example code from
   * TheDudeFromCI/mineflayer-collectblock, examples/collector.js). We only decide *what* to
   * collect and walk on along our own direction when there is nothing left here.
   *
   * Since the job-queue refactor (src/lib/jobqueue.mjs) the flow is:
   *   find targets -> fill the queue -> pop only PATHFINDER-VERIFIED reachable ones ->
   *   collect() under a hard timeout -> blacklist the positions that fail.
   * collect() used to hang forever on unreachable targets (that is exactly why the bots
   * stood still); now it cannot - every call is fenced by the queue's timeout.
   */
  async function collectArea (names, { direction = new Vec3(1, 0, 0), hopDistance = 32, count = 16, shouldStop = null, exclude = null, onProgress = null, perBlockTimeoutMs = 15000, maxSeconds = Infinity } = {}) {
    configureGroundMovements()
    await landHere()
    const started = Date.now()
    const overBudget = () => (Date.now() - started) / 1000 > maxSeconds

    // Reachability test: a real pathfinder answer with a small CPU budget, not a guess.
    // A target counts as reachable when the pathfinder can produce a path to stand
    // next to it (within 3 blocks) in under 2.5s.
    const canPathTo = (pos) => {
      try {
        const goal = new goals.GoalNear(pos.x + 0.5, pos.y, pos.z + 0.5, 3)
        const path = bot.pathfinder.getPathTo(bot.pathfinder.movements, goal, 2500)
        return !!(path && path.status === 'success' && path.path && path.path.length > 0)
      } catch {
        return false
      }
    }

    let queue = null
    let areaStats = { mined: 0, byName: {} }
    let emptyHops = 0
    while (!shouldStop?.() && bot.entity && !overBudget()) {
      // 1. find candidates and fill a fresh queue (previous queue is either done or exhausted)
      const positions = bot.findBlocks({ matching: b => names.includes(b.name), maxDistance: 64, count: count * 3 })
        .filter(pos => !inBox(pos, exclude))
      if (!positions.length) {
        // nothing in sight: walk along our own direction and look again (gatherWood relies
        // on this to reach the next tree). A few empty hops in a row mean there is really
        // nothing out there - give up instead of wandering forever.
        if (emptyHops++ >= 4) break
        const far = bot.entity.position
        const goal = new Vec3(far.x + direction.x * hopDistance, far.y, far.z + direction.z * hopDistance)
        try {
          await gotoSafe(bot, new goals.GoalNear(goal.x, goal.y, goal.z, 4), { timeoutMs: 20000 })
        } catch { /* look again from here */ }
        continue
      }
      emptyHops = 0
      queue = new MiningJobQueue({
        canReach: async job => canPathTo(job.pos),
        execute: async (job) => {
          const block = bot.blockAt(new Vec3(job.pos.x, job.pos.y, job.pos.z))
          if (!block || block.type === 0) return true // nothing to do = done
          const before = inventoryCount()
          try {
            await bot.collectBlock.collect(block)
          } catch (e) {
            if (/timeout after/.test(e.message)) {
              // the collect() promise may hang forever - the queue timeout turned it into
              // an error, so stop the pathfinder now or it keeps walking to the old target
              try { bot.pathfinder.setGoal(null) } catch { /* already idle */ }
            }
            throw e
          }
          const gained = inventoryCount() - before
          areaStats.mined += gained
          areaStats.byName[block.name] = (areaStats.byName[block.name] || 0) + 1
          // the miner's main stats must see this too (fleetStats and the fleet reporter read it)
          stats.mined += gained
          stats.byName[block.name] = (stats.byName[block.name] || 0) + gained
          if (onProgress) onProgress(areaStats.mined, areaStats)
          return true
        },
        timeoutMs: perBlockTimeoutMs,
        blacklistMs: 60000,
        maxAttempts: 2,
        maxConsecutiveFails: 10,
        log: m => log(`${tag} ${m}`)
      })
      queue.addMany(positions.slice(0, count * 2))
      // 2. drain the queue: only pathfinder-verified targets, hard timeout on every collect
      await queue.run({ shouldStop: () => shouldStop?.() || !bot.entity || overBudget() })
      log(`${tag} batch done: done=${queue.stats.done} failed=${queue.stats.failed} left=${queue.size}`)
      // everything drained and targets remain in range -> refill immediately, no hop needed
      if (!queue.size && bot.findBlocks({ matching: b => names.includes(b.name), maxDistance: 64, count: 1 }).length) continue
      // nothing reachable here: walk along our own direction (keeps the fleet spread out)
      const here = bot.entity.position
      const goal = new Vec3(here.x + direction.x * hopDistance, here.y, here.z + direction.z * hopDistance)
      try {
        await gotoSafe(bot, new goals.GoalNear(goal.x, goal.y, goal.z, 4), { timeoutMs: 20000 })
      } catch {
        if (bot.flyTravel) {
          try {
            await bot.flyTravel(new Vec3(goal.x, here.y + 3, goal.z), { speed: 1.5, cruiseAbove: 8, timeoutMs: 8000 })
            await landHere()
          } catch { /* next round */ }
        }
      }
    }
    const secs = (Date.now() - started) / 1000
    const minedTotal = areaStats.mined
    return { mined: minedTotal, secs, rate: secs > 0 ? minedTotal / secs : 0 }
  }

  function inventoryCount () {
    return bot.inventory.items().reduce((a, i) => a + i.count, 0)
  }

  // ------------------------------------------- vanilla physics mode (no fly at all)
  // Flying in survival is what vanilla fights (floating kicks, "moved wrongly"). For actual
  // digging we hand movement back to mineflayer's own physics: the bot mines the block below
  // itself and simply falls into the hole, so every movement is legal and drops land underfoot.
  function enablePhysicsMode () {
    try { bot.flyStop?.() } catch { /* nothing flying */ }
    bot.physicsEnabled = true
  }

  /**
   * Shaft mining: dig the block below, fall in, repeat. Works with any tool the bot has and
   * needs no pathfinding at all, so 19 bots can do it simultaneously without stepping on
   * each other (each one has its own column).
   */
  async function digShaft (names, { maxBlocks = Infinity, shouldStop = null, minY = null, onProgress = null } = {}) {
    enablePhysicsMode()
    configureGroundMovements()
    const started = Date.now()
    let done = 0
    const floor = minY ?? bot.game.minY + 3
    while (done < maxBlocks && !shouldStop?.() && bot.entity) {
      const pos = bot.entity.position.floored().offset(0, -1, 0)
      if (pos.y <= floor) break
      const block = bot.blockAt(pos)
      if (block && block.type !== 0 && (names == null || names.includes(block.name))) {
        try {
          await bot.fastDig(block)
          done++
          stats.mined++
          stats.byName[block.name] = (stats.byName[block.name] || 0) + 1
          if (onProgress && done % 8 === 0) onProgress(done, stats)
        } catch {
          stats.failed++
          await bot.waitForTicks(4)
        }
      } else {
        // the cell is already free: let gravity move us down (no packets that vanilla dislikes)
        await bot.waitForTicks(3)
        const still = bot.entity.position.offset(0, -1, 0)
        const block2 = bot.blockAt(still)
        if (block2 && block2.type !== 0 && (names == null || names.includes(block2.name))) continue
        // move sideways if we landed on something we cannot mine
        if (block2 && block2.type !== 0) {
          const dir = [new Vec3(1, 0, 0), new Vec3(0, 0, 1), new Vec3(-1, 0, 0), new Vec3(0, 0, -1)][done % 4]
          try {
            await gotoSafe(bot, new goals.GoalNear(bot.entity.position.x + dir.x, bot.entity.position.y, bot.entity.position.z + dir.z, 1))
          } catch { /* keep digging where we are */ }
        }
      }
    }
    const secs = (Date.now() - started) / 1000
    return { done, secs, rate: secs > 0 ? done / secs : 0 }
  }

  // ---------------------------------------------------------------- wood run
  const LOG_NAMES = ['oak_log', 'birch_log', 'spruce_log', 'jungle_log', 'dark_oak_log', 'acacia_log', 'mangrove_log', 'cherry_log', 'pale_oak_log']
  const LEAF_NAMES = ['oak_leaves', 'birch_leaves', 'spruce_leaves', 'jungle_leaves', 'dark_oak_leaves', 'acacia_leaves', 'mangrove_leaves', 'azalea_leaves', 'flowering_azalea_leaves', 'cherry_leaves', 'pale_oak_leaves']
  const logCount = () => bot.inventory.items().filter(i => i.name.endsWith('_log')).reduce((a, i) => a + i.count, 0)

  // Ground chopping: dig every log within reach at the trunk base (lowest first), then
  // walk over the drops. A vertical shaft only works from the top of the tree (flight);
  // on foot the trunk must be eaten from the side, which reach 4.5 fully covers for the
  // usual 4-5 log trunk.
  async function chopReachable () {
    const batch = bot.findBlocks({ matching: b => LOG_NAMES.includes(b.name), maxDistance: 4.5, count: 40 })
      .sort((a, b) => a.y - b.y) // lowest first: the trunk bottom is what keeps the rest up
    let n = 0
    for (const pos of batch) {
      if (logCount() > 0 && n >= 6) break // enough for a full tool kit from one tree
      const block = bot.blockAt(pos)
      if (!block || block.type === 0) continue
      try {
        await bot.fastDig(block)
        n++
        stats.mined++
        stats.byName[block.name] = (stats.byName[block.name] || 0) + 1
      } catch { /* next log */ }
    }
    // pick up what fell: walk to the item entities (pickup radius is small)
    const drops = Object.values(bot.entities)
      .filter(e => e.name === 'item' && e.position.distanceTo(bot.entity.position) < 14)
      .slice(0, 8)
    for (const drop of drops) {
      try { await gotoSafe(bot, new goals.GoalNear(drop.position.x, drop.position.y, drop.position.z, 1)) } catch { /* already picked up */ }
    }
    return n
  }

  // Travel for ground mode: fly when the flight module is installed, otherwise walk
  // with the pathfinder under a hard timeout (harvestSite used to be fly-only and
  // silently did nothing without flight).
  async function travelTo (vec, { timeoutMs = 30000, speed = 2.0, cruiseAbove = 14 } = {}) {
    if (typeof bot.flyTravel === 'function') {
      await bot.flyTravel(vec, { speed, cruiseAbove, timeoutMs })
      return
    }
    await gotoSafe(bot, new goals.GoalNear(vec.x, vec.y, vec.z, 3), { timeoutMs, label: 'travel' })
  }

  /**
   * Spawn -> fly up -> fly to the nearest tree -> come down -> chop it, then look for the next
   * one. Simple and deterministic, and (unlike the pathfinder loops) it always makes progress.
   * On foot: walk to the lowest unseen trunk, eat the trunk from the side, walk on.
   */
  async function gatherWood ({ want = 8, direction = new Vec3(1, 0, 0), shouldStop = null, maxSeconds = 180 } = {}) {
    const started = Date.now()
    const visitedTrunks = new Set() // "x,z" of every trunk we already ate (floating tops stay behind)
    let idleChops = 0
    while (logCount() < want && !shouldStop?.() && bot.entity && (Date.now() - started) / 1000 < maxSeconds) {
      // lowest log first: that is a trunk base; a floating top of an eaten tree sorts higher
      // and is skipped by the visited-column check
      const cands = bot.findBlocks({ matching: b => LOG_NAMES.includes(b.name), maxDistance: 128, count: 24 })
        .sort((a, b) => (a.y - b.y) || (a.distanceTo(bot.entity.position) - b.distanceTo(bot.entity.position)))
      const base = cands.find(p => !visitedTrunks.has(`${p.x},${p.z}`))
      if (!base) {
        // only eaten trunks in view: move along our direction and look again
        const here = bot.entity.position
        const out = new Vec3(here.x + direction.x * 32, here.y, here.z + direction.z * 32)
        try {
          await gotoSafe(bot, new goals.GoalNear(out.x, out.y, out.z, 4))
        } catch { /* try again next round */ }
        continue
      }
      visitedTrunks.add(`${base.x},${base.z}`)
      // go to the tree: fly when flight is enabled, otherwise walk there
      if (bot.flyTravel) {
        try {
          await bot.flyTo(new Vec3(bot.entity.position.x, bot.entity.position.y + 25, bot.entity.position.z), { speed: 2.0, timeoutMs: 10000 })
          await bot.flyTravel(new Vec3(base.position.x, base.position.y + 5, base.position.z), { speed: 2.0, cruiseAbove: 10, timeoutMs: 30000 })
        } catch { /* chop from wherever we are */ }
      } else {
        try {
          await gotoSafe(bot, new goals.GoalNear(base.x, base.y, base.z, 2))
        } catch { /* try to chop what is in reach */ }
      }
      if (bot.flyTravel) {
        // chop: dig straight down through the canopy and the trunk. The bot arrives on top of the
        // tree, so a vertical shaft eats the leaves and then the whole trunk, and gravity carries
        // it down while the drops land at its feet.
        enablePhysicsMode()
        await digShaft([...LOG_NAMES, ...LEAF_NAMES], {
          maxBlocks: 40,
          shouldStop: () => logCount() >= want || shouldStop?.()
        })
      } else {
        const chopped = await chopReachable()
        idleChops = chopped > 0 ? 0 : idleChops + 1
        if (idleChops >= 3) {
          // three trees in a row yielded nothing (cliffs, water, fenced yards): relocate
          idleChops = 0
          const here = bot.entity.position
          try {
            await gotoSafe(bot, new goals.GoalNear(here.x + direction.x * 24, here.y, here.z + direction.z * 24, 4))
          } catch { /* keep looking */ }
        }
      }
    }
    return { logs: logCount(), secs: (Date.now() - started) / 1000 }
  }

  return { bot, ready, stats, mineBox, nukeAround, bore, harvestSite, workOnGround, collectArea, digShaft, gatherWood, enablePhysicsMode, landHere, sweep, scanBox, flyTo, mineBlock, standSpotFor, setMode, username }
}

// Spawn several miners (no op, no gear) working the same job split by X slabs.
export async function createFleet ({ count = 3, host = '127.0.0.1', port = 25565, namePrefix = 'BotM', log = () => {}, ...opts } = {}) {
  const miners = []
  for (let i = 1; i <= count; i++) miners.push(createMiner({ host, port, username: `${namePrefix}${i}`, log, ...opts }))
  await Promise.all(miners.map(m => m.ready))
  return miners
}

export function fleetStats (miners) {
  return miners.reduce((acc, m) => {
    acc.mined += m.stats.mined
    acc.failed += m.stats.failed
    acc.skipped += m.stats.skipped
    for (const [k, v] of Object.entries(m.stats.byName)) acc.byName[k] = (acc.byName[k] || 0) + v
    return acc
  }, { mined: 0, failed: 0, skipped: 0, byName: {} })
}
