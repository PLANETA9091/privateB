// Free flight for mineflayer bots: no gravity, no pathfinder, no pillar-placing.
// The bot's own physics are switched off and its position is driven directly, which is
// what a "fly" cheat does. Works on servers that accept it (allow-flight, no strict AC).
import { Vec3 } from 'vec3'

const TICK_MS = 50 // one server tick

export function installFly (bot, { speed = 1.0, antiKick = true, antiKickInterval = 20, antiKickDistance = 0.035, digThrough = false, log = () => {} } = {}) {
  if (bot.flyTo) return bot.flyTo

  const state = {
    speed, // blocks per tick (1.0 = 20 blocks/s)
    target: null,
    tolerance: 0.6,
    waiter: null,
    stuckTicks: 0,
    bestDist: Infinity,
    noProgressTicks: 0,
    stalledDigs: 0,
    antiKick,
    digThrough, // dig through terrain that blocks the flight path (mining bots need this)
    // Vanilla kicks a player who never touches the ground ("Flying is not enabled on
    // this server") after ~80 ticks of hovering. Wurst's Flight beats it with a tiny
    // down/up dip every N ticks; the downward motion resets the server's floating counter.
    antiKickInterval,
    antiKickDistance,
    tickCounter: 0,
    dipTicks: 0
  }
  bot.flyState = state
  bot.physicsEnabled = false // no gravity simulation at all

  function settle (err) {
    const w = state.waiter
    state.waiter = null
    state.target = null
    if (w) {
      clearTimeout(w.timer)
      if (err) w.reject(err)
      else w.resolve()
    }
  }

  // A position is usable when the player hitbox (feet + head) is not inside a block.
  // Vanilla snaps us back with "moved wrongly!" otherwise.
  function freeAt (x, y, z) {
    const feet = bot.blockAt(new Vec3(Math.floor(x), Math.floor(y), Math.floor(z)))
    if (!feet || feet.boundingBox !== 'empty') return false
    const head = bot.blockAt(new Vec3(Math.floor(x), Math.floor(y + 1), Math.floor(z)))
    return !!head && head.boundingBox === 'empty'
  }

  // Collision-aware step: a real client never walks through terrain, and the server
  // rejects it. Try the direct step, then climb over, then slide along one axis.
  function stepFree (pos, dx, dy, dz) {
    const candidates = [
      [dx, dy, dz],
      [dx, Math.max(dy, 1), dz],
      [dx, Math.max(dy, 2), dz],
      [dx, 0, 0],
      [0, 0, dz],
      [0, 1, 0],
      [0, 2, 0],
      [0, -1, 0]
    ]
    for (const [sx, sy, sz] of candidates) {
      if (sx === 0 && sy === 0 && sz === 0) continue
      const x = pos.x + sx
      const y = pos.y + sy
      const z = pos.z + sz
      if (freeAt(x, y, z)) return [x, y, z]
    }
    return null
  }

  // First solid cell (feet- or head-level) on the direct line towards the target,
  // i.e. the block a stuck bot would have to dig out. Returns null for open air.
  function blockerAhead (pos, target, dist) {
    const step = Math.min(state.speed, dist)
    const nx = pos.x + ((target.x - pos.x) / dist) * step
    const ny = pos.y + ((target.y - pos.y) / dist) * step
    const nz = pos.z + ((target.z - pos.z) / dist) * step
    const feet = bot.blockAt(new Vec3(Math.floor(nx), Math.floor(ny), Math.floor(nz)))
    if (feet && feet.boundingBox !== 'empty') return feet
    const head = bot.blockAt(new Vec3(Math.floor(nx), Math.floor(ny + 1), Math.floor(nz)))
    if (head && head.boundingBox !== 'empty') return head
    return null
  }

  function tick () {
    const pos = bot.entity?.position
    if (!pos || !Number.isFinite(pos.x)) return
    // NoFall + anti-kick in one: vanilla resets both fall distance and the "floating too
    // long" counter whenever the client reports ground contact, so we claim it every tick.
    // (The old code reported false, which is what made bots take fall damage and get kicked.)
    bot.entity.onGround = true
    bot.entity.velocity.set(0, 0, 0)
    // The ticker can be starved by a long synchronous scan; the anti-kick ground-touch below
    // is what keeps the server happy, so run it before any early return.
    applyAntiKick(bot.entity.position)

    const target = state.target
    if (!target) { applyAntiKick(pos); return }
    // never move into unloaded chunks - that is what makes flying bots fall
    if (bot.blockAt(pos) == null) {
      applyAntiKick(pos)
      if (++state.stuckTicks > 100) settle(new Error('stuck: chunks never loaded'))
      return
    }
    state.stuckTicks = 0

    const dxRaw = target.x - pos.x
    const dyRaw = target.y - pos.y
    const dzRaw = target.z - pos.z
    const dist = Math.sqrt(dxRaw * dxRaw + dyRaw * dyRaw + dzRaw * dzRaw)
    if (dist <= state.tolerance) {
      pos.set(target.x, target.y, target.z)
      settle(null)
      applyAntiKick(pos)
      return
    }
    // If the destination is not loaded yet, just wait: counting these ticks as
    // "no progress" made bots give up while a chunk was still streaming in.
    if (bot.blockAt(target) == null) {
      applyAntiKick(pos)
      return
    }
    // The server snaps us back ("moved wrongly") when a position is not valid for us.
    // If we stop making progress, fail fast instead of hanging on the full timeout.
    if (dist < state.bestDist - 0.05) {
      state.bestDist = dist
      state.noProgressTicks = 0
      state.stalledDigs = 0
    } else if (!state.digging && ++state.noProgressTicks > 60) {
      // No meaningful progress for 60 ticks. Two ways out: dig through the blocker that
      // sits on the DIRECT line to the target (digThrough mode), or give up. The dig is
      // essential: a bot that only slides along walls (z-creep) makes micro-progress
      // forever, so the "stepFree found nothing" branch below never runs and the bot
      // would starve in front of a wall it was explicitly allowed to dig through.
      applyAntiKick(pos)
      const blocker = state.digThrough && bot.flyDigHook ? blockerAhead(pos, target, dist) : null
      if (blocker && state.stalledDigs < 3) {
        state.stalledDigs++
        state.noProgressTicks = 0
        state.digging = true
        const p = blocker.position.clone()
        Promise.resolve(bot.flyDigHook(blocker))
          .catch(() => {})
          .finally(() => {
            state.digging = false
            if (bot.blockAt(p) && bot.blockAt(p).type === 0) state.bestDist = Infinity
          })
        return
      }
      if (state.stalledDigs >= 3) {
        settle(new Error(`blocked (3 digs did not open the way) at ${pos.floored()} -> ${target.floored()}`))
        return
      }
      const here = pos.floored()
      const dest = target.floored()
      settle(new Error(`blocked at ${here} (${bot.blockAt(pos)?.name}) -> ${dest} (${bot.blockAt(target)?.name})`))
      return
    }
    const step = Math.min(state.speed, dist)
    const stepX = (dxRaw / dist) * step
    const stepY = (dyRaw / dist) * step
    const stepZ = (dzRaw / dist) * step
    const moved = stepFree(pos, stepX, stepY, stepZ)
    if (moved) {
      pos.set(moved[0], moved[1], moved[2])
    } else if (state.digThrough && bot.flyDigHook && !state.digging) {
      // Path blocked by terrain: a mining bot digs its way through instead of giving up.
      const nx = pos.x + stepX
      const ny = pos.y + stepY
      const nz = pos.z + stepZ
      const feet = bot.blockAt(new Vec3(Math.floor(nx), Math.floor(ny), Math.floor(nz)))
      const head = bot.blockAt(new Vec3(Math.floor(nx), Math.floor(ny + 1), Math.floor(nz)))
      let blocker = null
      if (feet && feet.boundingBox !== 'empty') blocker = feet
      else if (head && head.boundingBox !== 'empty') blocker = head
      if (blocker) {
        state.digging = true
        const p = blocker.position.clone()
        Promise.resolve(bot.flyDigHook(blocker))
          .catch(() => {})
          .finally(() => {
            state.digging = false
            state.noProgressTicks = 0
            if (bot.blockAt(p) && bot.blockAt(p).type === 0) state.bestDist = Infinity
          })
      }
    }
    // Wurst runs the anti-kick dip on every tick, including while moving: a long
    // flight (>80 ticks airborne) otherwise trips the server's floating counter.
    applyAntiKick(pos)
  }

  // Wurst's Anti-Kick: two ticks of a tiny vertical dip every antiKickInterval ticks.
  // A pure hover makes the server count "floating" ticks and kick us at ~80.
  // We also report onGround=true for those two ticks: vanilla resets its floating counter
  // when the client claims ground contact, which makes the bot survive event-loop stalls
  // (a long synchronous findBlock() used to starve the ticker and get bots kicked).
  function applyAntiKick (pos) {
    if (!state.antiKick) return
    if (state.dipTicks > 0) {
      state.dipTicks--
      pos.y += state.dipTicks === 1 ? -state.antiKickDistance : state.antiKickDistance
      bot.entity.onGround = true
      return
    }
    state.tickCounter++
    if (state.tickCounter >= state.antiKickInterval) {
      state.tickCounter = 0
      state.dipTicks = 2
      pos.y -= state.antiKickDistance
      bot.entity.onGround = true
    }
  }

  const timer = setInterval(tick, TICK_MS)
  bot._flyTimer = timer // exposed so tests/disposeFly can stop the ticker
  bot.once('end', () => clearInterval(timer))

  // With physics disabled mineflayer stops emitting physicsTick, so its own
  // waitForTicks() would hang until it times out. Provide a timer-based equivalent.
  bot.waitForTicks = ticks => new Promise(resolve => {
    const t = Math.max(1, Math.round(ticks))
    const started = Date.now()
    const step = () => {
      if (Date.now() - started >= t * TICK_MS) resolve()
      else setTimeout(step, Math.min(TICK_MS, started + t * TICK_MS - Date.now()))
    }
    setTimeout(step, TICK_MS)
  })

  bot.flyTo = (target, { speed: s, tolerance = 0.6, timeoutMs = 20000 } = {}) => {
    const vec = target instanceof Vec3 ? target : new Vec3(target.x, target.y, target.z)
    if (state.waiter) settle(new Error('superseded by a newer flyTo'))
    if (s != null) state.speed = s
    state.tolerance = tolerance
    state.target = vec
    state.stuckTicks = 0
    state.bestDist = Infinity
    state.noProgressTicks = 0
    return new Promise((resolve, reject) => {
      const hard = setTimeout(() => settle(new Error(`fly timeout after ${timeoutMs}ms`)), timeoutMs)
      state.waiter = { resolve, reject, timer: hard }
    })
  }

  bot.flyPathFree = (to, { step = 1.0 } = {}) => {
    let cur = bot.entity.position.clone()
    for (let i = 0; i < 240; i++) {
      const d = to.clone().subtract(cur)
      const dist = d.norm()
      if (dist <= 1.0) return true
      const l = Math.min(step, dist)
      const nx = cur.x + (d.x / dist) * l
      const ny = cur.y + (d.y / dist) * l
      const nz = cur.z + (d.z / dist) * l
      if (freeAt(nx, ny, nz)) {
        cur = new Vec3(nx, ny, nz)
      } else if (freeAt(nx, ny + 1, nz)) {
        cur = new Vec3(nx, ny + 1, nz)
      } else if (freeAt(nx, ny + 2, nz)) {
        cur = new Vec3(nx, ny + 2, nz)
      } else {
        return false
      }
    }
    return false
  }

  bot.flyStop = () => settle(null)
  // Instant position move for tight loops (boring/digging): no promise, no waiting.
  // The tick timer still sends the packet; this just removes the await overhead.
  bot.flySnap = (vec) => {
    const t = vec instanceof Vec3 ? vec : new Vec3(vec.x, vec.y, vec.z)
    if (!freeAt(t.x, t.y, t.z)) return false
    settle(null)
    bot.entity.position.set(t.x, t.y, t.z)
    bot.entity.onGround = false
    bot.entity.velocity.set(0, 0, 0)
    applyAntiKick(bot.entity.position)
    return true
  }
  // Long-range travel: climb above the terrain, cruise in open air (no collision
  // stepping, no chunk-load stalls), then descend onto the target. This is how
  // flight cheats move fast - the per-tick collision walk is only for short hops.
  bot.flyTravel = async (vec, { cruiseAbove = 24, speed = null, timeoutMs = 30000 } = {}) => {
    const start = bot.entity.position
    const cruiseY = Math.max(start.y, vec.y) + cruiseAbove
    await bot.flyTo(new Vec3(start.x, cruiseY, start.z), { speed, timeoutMs })
    await bot.flyTo(new Vec3(vec.x, cruiseY, vec.z), { speed, timeoutMs })
    // descend onto the target: walk down until the cell is free and the one BELOW it is
    // solid, i.e. the bot actually stands on the ground. The old version stopped at the
    // first free cell (6+ blocks up in the air), so the bot hung in the air and the next
    // ground-mode step started from a floating position (looked like teleporting).
    let landing = vec.y
    for (let y = Math.floor(vec.y) + 6; y >= Math.floor(vec.y) - 8; y--) {
      if (freeAt(vec.x, y, vec.z) && !freeAt(vec.x, y - 1, vec.z)) { landing = y; break }
    }
    await bot.flyTo(new Vec3(vec.x, landing, vec.z), { speed, timeoutMs })
  }
  bot.flyBlockAt = pos => bot.blockAt(pos)
  // Is this position a place the server will accept us standing/flying in?
  // Vanilla snaps us back ("moved wrongly") if our hitbox intersects a block.
  bot.isFreeSpot = (vec) => {
    const x = Math.floor(vec.x)
    const y = Math.floor(vec.y)
    const z = Math.floor(vec.z)
    const feet = bot.blockAt(new Vec3(x, y, z))
    const head = bot.blockAt(new Vec3(x, y + 1, z))
    return !!feet && !!head && feet.boundingBox === 'empty' && head.boundingBox === 'empty'
  }
  log(`fly installed (speed ${speed} block/tick = ${(speed * 20).toFixed(0)} blocks/s)`)
  return bot.flyTo
}

export function disposeFly (bot) {
  if (bot.flyState) bot.flyStop?.()
  bot.flyState = null
  // stop the ticker: the interval keeps the event loop alive (unit tests hang forever
  // without this - the node --test child process never exits) and real bots leak one
  // 20 Hz timer per installFly call
  if (bot._flyTimer) { clearInterval(bot._flyTimer); bot._flyTimer = null }
}
