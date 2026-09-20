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
import { MiningJobQueue, withTimeout, gotoSafe, standGoalNear, inBox } from '../lib/jobqueue.mjs'
import { depositToChest, inventoryLoad } from '../lib/deposit.mjs'
import { stalledButCraftable } from '../lib/woodplan.mjs'
import { isPlantableSapling, plantableCell, pickSapling } from '../lib/sapling.mjs'
import { torchDue } from '../lib/torch.mjs'
import {
  pillarTarget, climbableCeiling, pickPillarBlock, pillarPlacement,
  PILLAR_FAIL_LIMIT, PILLAR_LAND_TICKS,
  PILLAR_PLACE_TIMEOUT_MS, PILLAR_MAX_MS, CEILING_DIG_LIMIT, PILLAR_LEVEL_CAP
} from '../lib/surface.mjs'
import { isHostileEntity, pickWeapon, threatVerdict, DETECT_RANGE } from '../lib/combat.mjs'
import { isNight } from '../lib/nightsafety.mjs'
import { shelterDue, pickSealItem, SHELTER_WALL_OK, SHELTER_ROUND_MS, SHELTER_MAX_MS, SHELTER_SAFE_DIST } from '../lib/shelter.mjs'
import {
  waterVerdict, shoreDirection, isWaterName, SHAFT_FLUID_NAMES,
  RESCUE_MAX_MS, RESCUE_COOLDOWN_MS
} from '../lib/drowning.mjs'
import { craftTorches } from './tools.mjs'

// one entry per occupied inventory slot (same shape tools.mjs uses); the v0.9.x
// sapling replant path calls this from gatherWood - a missing definition threw
// ReferenceError on every replant attempt ("gatherWood failed: inventoryItems
// is not defined", measured live and in CI 064c13c)
const inventoryItems = bot => bot.inventory.items()

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
  map = null, // WorldMap: scouts (and this bot itself) fill it, we consume it when the local scan is empty
  log = () => {}
} = {}) {
  const bot = mineflayer.createBot({ host, port, username, version, auth: 'offline' })
  bot.loadPlugin(pathfinder)
  bot.loadPlugin(toolPlugin)
  bot.loadPlugin(collectBlockPlugin) // ready-made: pathfind to block, pick tool, dig, collect drops
  bot.loadPlugin(autoeat)

  const stats = { mined: 0, failed: 0, skipped: 0, flyFails: 0, hookCalls: 0, hookFails: 0, mapTrips: 0, mapRecords: 0, banked: 0, planted: 0, torched: 0, fights: 0, climbs: 0, shaftEntryY: null, shelters: 0, rescues: 0, byName: {}, startedAt: 0 }
  const dugByHook = new Set()
  const tag = `[${username}]`

  // ---- scout -> miner integration (WorldMap) ----
  // Record what we can see right now into the shared map: every walking miner is a
  // passive scout, so the map fills up even when no dedicated scout is around.
  // Cheap: findBlocks on loaded chunks, dedup happens inside map.add.
  const mapTargets = new Set(['sand', 'gravel', 'clay', 'coal_ore', 'iron_ore', 'copper_ore', 'oak_log', 'birch_log', 'spruce_log', 'dark_oak_log', 'jungle_log', 'acacia_log', 'cherry_log', 'pale_oak_log', 'mangrove_log'])
  // shore minerals only make sense as map targets when a bot can STAND at them: the
  // 600s fleet stored sand=349 of which 21/22 trips were unreachable - underwater
  // positions flood the dig cell and the pathfinder has no dry route (24s walk burned
  // per attempt). Dry = air above; logs keep no filter (canopy leaves sit above trunks).
  const DRY_TARGETS = new Set(['sand', 'gravel', 'clay'])
  function recordToMap ({ maxDistance = 32, count = 64 } = {}) {
    if (!map) return 0
    try {
      const found = bot.findBlocks({ matching: b => mapTargets.has(b.name), maxDistance, count })
      const here = bot.entity.position.floored()
      map.markScanned(here.x >> 4, here.z >> 4)
      for (const pos of found) {
        const block = bot.blockAt(pos)
        if (!block) continue
        if (DRY_TARGETS.has(block.name)) {
          const above = bot.blockAt(pos.offset(0, 1, 0))
          if (!above || above.boundingBox !== 'empty') continue // underwater / buried: not a trip target
        }
        const before = map.size(block.name)
        map.add(block.name, pos)
        if (map.size(block.name) > before) stats.mapRecords++
      }
      return found.length
    } catch { /* chunk unloaded mid-scan - skip this round */ }
    return 0
  }

  // Where does the fleet KNOW a target is? Verify through blockAt so stale entries
  // (already mined by another bot) are dropped from the map as a side effect.
  const failedTrips = new Set() // "x,y,z" the pathfinder could not handle - do not retry forever
  function mapTargetFor (names, { maxDistance = 96, verify = true } = {}) {
    if (!map) return null
    let best = null
    for (const name of names) {
      const pos = map.nearest(name, bot.entity.position, {
        maxDistance,
        // verify=true deletes entries the current chunks can no longer confirm - good
        // for nearby mining targets, harmful for far ones (blockAt nulls unloaded
        // chunks, so a query with verify would WIPE the whole far bucket)
        verifyWith: verify ? (p => bot.blockAt(p)) : null
      })
      if (pos && failedTrips.has(`${pos.x},${pos.y},${pos.z}`)) continue
      if (pos && (!best || pos.distanceTo(bot.entity.position) < best.pos.distanceTo(bot.entity.position))) best = { name, pos }
    }
    return best
  }

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

  // ---- combat defense (v0.11.0, policy in src/lib/combat.mjs) ----
  // The smelt-test measured a midday death where the digShaft health guard just
  // "paused descent" while a zombie hit 20 -> 5.7 -> dead in 9 s: waiting heals
  // nothing when a mob keeps swinging. Every health drop therefore primes a
  // short sentry window; a hostile nearby inside it triggers defendSelf once.
  function nearestHostile ({ range = DETECT_RANGE } = {}) {
    if (!bot.entity) return null
    let best = null
    for (const e of Object.values(bot.entities)) {
      if (!e || e === bot.entity || !isHostileEntity(e) || !e.position) continue
      const d = e.position.distanceTo(bot.entity.position)
      if (d <= range && (!best || d < best.dist)) best = { entity: e, name: e.name, dist: d }
    }
    return best
  }

  function countHostiles () {
    if (!bot.entity) return 0
    let n = 0
    for (const e of Object.values(bot.entities)) {
      if (!e || e === bot.entity || !isHostileEntity(e) || !e.position) continue
      if (e.position.distanceTo(bot.entity.position) <= DETECT_RANGE) n++
    }
    return n
  }

  // Multi-hop escape: ONE 12-block hop does not outrun a persistent zombie (the
  // first live run measured flee-at-4hp -> caught -> dead), so we keep hopping
  // until the threat is beyond 14 blocks or the deadline burns.
  async function runAway (threat, reason) {
    const deadline = Date.now() + 12000
    for (let hop = 0; hop < 3 && bot.entity && Date.now() < deadline; hop++) {
      const dx = bot.entity.position.x - threat.entity.position.x
      const dz = bot.entity.position.z - threat.entity.position.z
      const len = Math.hypot(dx, dz) || 1
      const away = new goals.GoalXZ(bot.entity.position.x + (dx / len) * 12, bot.entity.position.z + (dz / len) * 12)
      try { await gotoSafe(bot, away, { timeoutMs: 5000, label: 'combat flee' }) } catch { /* hop again from where we are */ }
      const cur = nearestHostile()
      if (!cur || cur.dist > 14) return
    }
  }

  // Bounded regen window after a fight or a flee: autoeat + natural regen need
  // seconds. Without this the bot went straight back to mining at 3 hp (measured)
  // and the very next hit re-triggered the whole cycle.
  async function recover () {
    const deadline = Date.now() + 8000
    while (bot.entity && (bot.health ?? 20) < 14 && Date.now() < deadline) {
      await bot.waitForTicks(10)
    }
  }

  // Darkness decides spider neutrality (vanilla: hostile only at light <= 7):
  // night by the clock OR a solid roof 8 blocks above (cave). Cannot read the
  // world -> assume dark, the safe default (a wrongly feared spider costs a
  // moment, a wrongly ignored one costs the run).
  function isDarkHere () {
    try {
      if (isNight(bot.time?.timeOfDay)) return true
      const roof = bot.blockAt(bot.entity.position.floored().offset(0, 8, 0))
      return !(roof && roof.boundingBox === 'empty')
    } catch { return true }
  }

  // ---- shelter (v0.11.3, policy in src/lib/shelter.mjs) ----
  // Naked-at-night bots lose every chase (zombies pursue across the surface)
  // AND every fight (fists vs 20 hp - measured live). A sealed hole is
  // unbeatable by vanilla surface mobs: dig in, seal the entrance, wait the
  // mob out, unseal, continue. Two variants: a WALL dig-in (hillside) and the
  // PIT (dig 1 down, seal overhead) for open terrain - exactly 1 deep, the
  // repo avoids pillar-up climbing on purpose. Best-effort: any failure falls
  // back to the flee.
  async function sealWaitUnseal (sealCell, threatName, reason) {
    // seal: place into the cell we used to stand in, against any solid
    // neighbour face (the proven placeTable pacing: 5 ticks before the click,
    // 10 before the verify)
    let sealed = false
    try {
      const sealName = pickSealItem(inventoryItems(bot))?.name
      const item = sealName ? bot.inventory.items().find(i => i.name === sealName) : null
      if (item) {
        // two rounds: a mob following us into the entrance cell blocks EVERY
        // face (the server rejects placements into entity-occupied cells) - a
        // short pause then one more round, then give up and fall back
        for (let round = 0; round < 2 && !sealed; round++) {
          if (round > 0) await bot.waitForTicks(6)
          for (const off of [new Vec3(1, 0, 0), new Vec3(-1, 0, 0), new Vec3(0, 0, 1), new Vec3(0, 0, -1), new Vec3(0, 1, 0), new Vec3(0, -1, 0)]) {
            const ref = bot.blockAt(sealCell.offset(off.x, off.y, off.z))
            if (!ref || ref.boundingBox === 'empty') continue
            try {
              await bot.equip(item, 'hand')
              await bot.waitForTicks(5)
              await bot.placeBlock(ref, off.scaled(-1)) // the face of ref that touches sealCell
              await bot.waitForTicks(10)
              const placedB = bot.blockAt(sealCell)
              if (placedB && placedB.boundingBox !== 'empty') { sealed = true; break }
            } catch { /* next face */ }
          }
        }
      }
    } catch { sealed = false }
    // an unsealed hole is a death trap (mobs path straight into it): back out
    // and let the flee handle it
    if (!sealed) return false
    stats.shelters++
    log(`${tag} combat: sheltering from ${threatName} (seal ${pickSealItem(inventoryItems(bot))?.name ?? 'spent'}, ${reason})`)
    const started = Date.now()
    while (bot.entity && Date.now() - started < SHELTER_MAX_MS) {
      const cur = nearestHostile()
      if (!cur || cur.dist > SHELTER_SAFE_DIST) break
      await bot.waitForTicks(Math.max(1, Math.ceil(SHELTER_ROUND_MS / 50)))
    }
    // unseal - the next flee/fight/work decision owns what happens after
    try {
      const sealBlock = bot.blockAt(sealCell)
      if (sealBlock && sealBlock.type !== 0) await bot.fastDig(sealBlock)
    } catch { /* dig out on the next attempt */ }
    return true
  }

  async function tryShelter (reason) {
    const threat = nearestHostile()
    const armed = !!pickWeapon(inventoryItems(bot))
    const night = isNight(bot.time?.timeOfDay)
    if (!threat || !shelterDue({ night, armed, threatDist: threat ? threat.dist : Infinity })) {
      log(`${tag} combat: shelter skip (night=${night} armed=${armed} threat=${threat ? `${threat.name}@${threat.dist.toFixed(1)}` : 'none'})`)
      return false
    }
    // no seal material means no shelter (an open hole is a death trap)
    if (!pickSealItem(inventoryItems(bot))) {
      log(`${tag} combat: shelter skip (no seal material)`)
      return false
    }
    log(`${tag} combat: shelter try vs ${threat.name} (dist ${threat.dist.toFixed(1)}, ${reason})`)
    const sealCell = bot.entity.position.floored() // the cell we seal behind us
    // variant 1: horizontal WALL dig-in (hillside)
    for (const d of [new Vec3(1, 0, 0), new Vec3(0, 0, 1), new Vec3(-1, 0, 0), new Vec3(0, 0, -1)]) {
      const cellA = sealCell.offset(d.x, 0, d.z)
      const wall = bot.blockAt(cellA)
      if (!wall || !SHELTER_WALL_OK.has(wall.name)) continue // never dig into sand/gravel (gravity refill race, measured)
      const behind = bot.blockAt(cellA.offset(d.x, 0, d.z))
      if (!behind || behind.boundingBox === 'empty') continue // a window into a cave/lava is no shelter
      try {
        const feet = bot.blockAt(cellA)
        const head = bot.blockAt(cellA.offset(0, 1, 0))
        if (!feet || !head) { log(`${tag} combat: shelter skip (${d.x},${d.z}: unreadable cells)`); continue }
        if (feet.type !== 0) await bot.fastDig(feet)
        if (head.type !== 0) await bot.fastDig(head)
      } catch (e) { log(`${tag} combat: shelter skip (${d.x},${d.z}: dig failed: ${e.message})`); continue }
      // gravity refill / partial dig: verify both cells are actually free
      const feet2 = bot.blockAt(cellA)
      const head2 = bot.blockAt(cellA.offset(0, 1, 0))
      if (!feet2 || !head2 || feet2.boundingBox !== 'empty' || head2.boundingBox !== 'empty') { log(`${tag} combat: shelter skip (${d.x},${d.z}: cells not free)`); continue }
      const behind2 = bot.blockAt(cellA.offset(d.x, 0, d.z))
      if (!behind2 || behind2.boundingBox === 'empty') { log(`${tag} combat: shelter skip (${d.x},${d.z}: hollow behind)`); continue }
      // RAW step-in (the tunnel() lesson: the pathfinder recomputes while mobs
      // shove the bot - one straight block of forward movement needs no A*)
      try {
        await bot.lookAt(cellA.offset(0.5, 0, 0.5), true)
        bot.setControlState('forward', true)
        bot.setControlState('sprint', true)
        const stepDeadline = Date.now() + 2000
        while (bot.entity && bot.entity.position.floored().distanceTo(cellA) > 0.6 && Date.now() < stepDeadline) {
          await bot.waitForTicks(2)
        }
        bot.setControlState('forward', false)
        bot.setControlState('sprint', false)
      } catch (e) {
        log(`${tag} combat: shelter skip (${d.x},${d.z}: step failed: ${e.message})`)
        continue
      }
      if (!bot.entity || bot.entity.position.floored().distanceTo(cellA) > 0.6) { log(`${tag} combat: shelter skip (${d.x},${d.z}: step-in incomplete)`); continue }
      if (await sealWaitUnseal(sealCell, threat.name, reason)) {
        try { await gotoSafe(bot, new goals.GoalBlock(sealCell.x, sealCell.y, sealCell.z), { timeoutMs: 4000, label: 'shelter step out' }) } catch { /* already out or free */ }
        return true
      }
      try { await gotoSafe(bot, new goals.GoalBlock(sealCell.x, sealCell.y, sealCell.z), { timeoutMs: 4000, label: 'shelter abort out' }) } catch { /* fight from the hole */ }
      return false
    }
    // variant 2 (REMOVED): the open-terrain PIT cannot work in vanilla - at 1 deep
    // the seal cell IS the bot's head cell (placement rejected), at 2 deep C0 has NO
    // solid face-neighbour to place against (open field) and the exit needs
    // pillar-up climbing, which this repo refuses on purpose. Open terrain stays
    // with the flee until a verified ring/torch alternative exists.
    return false // no diggable wall around: the flee handles it
  }

  let defending = false
  async function defendSelf (reason = 'guard') {
    if (defending) return { action: 'busy' }
    if (swimming) return { action: 'busy' } // drowning outranks fighting: the rescue owns the controls
    const threat = nearestHostile()
    if (!threat) return { action: 'none' }
    const armed = !!pickWeapon(inventoryItems(bot))
    const verdict = threatVerdict({ name: threat.name, dist: threat.dist, hp: bot.health ?? 20, attackers: countHostiles(), dark: isDarkHere(), armed })
    if (verdict === 'ignore') return { action: 'ignore', threat: threat.name }
    defending = true
    stats.fights++
    try {
      if (verdict === 'flee') {
        // UNARMED AT NIGHT: the chase is lost and the following fight is lost
        // too - seal in instead when the terrain allows (the 7-death streak)
        try {
          if (await tryShelter(reason)) return { action: 'shelter', threat: threat.name }
        } catch { /* shelter is best-effort - fall back to the flee */ }
        log(`${tag} combat: fleeing ${threat.name} (dist ${threat.dist.toFixed(1)}, hp ${(bot.health ?? 20).toFixed(1)}, ${countHostiles()} nearby, ${reason})`)
        await runAway(threat, reason)
        await recover()
        return { action: 'flee', threat: threat.name }
      }
      log(`${tag} combat: fighting ${threat.name} (dist ${threat.dist.toFixed(1)}, hp ${(bot.health ?? 20).toFixed(1)}, ${countHostiles()} nearby, ${reason})`)
      const weapon = pickWeapon(inventoryItems(bot))
      if (weapon) { try { await bot.equip(weapon, 'hand') } catch { /* fists are still something */ } }
      const deadline = Date.now() + 10000
      while (bot.entity && Date.now() < deadline) {
        const cur = nearestHostile()
        if (!cur) break // the threat died or wandered off
        // per-round re-verdict (the first live run measured a bot fighting down
        // to 5 hp and then just standing there): the policy owns the decision
        const v = threatVerdict({ name: cur.name, dist: cur.dist, hp: bot.health ?? 20, attackers: countHostiles(), dark: isDarkHere(), armed: !!pickWeapon(inventoryItems(bot)) })
        if (v === 'flee') {
          log(`${tag} combat: verdict flipped to flee vs ${cur.name} (hp ${(bot.health ?? 20).toFixed(1)})`)
          try { if (await tryShelter(`${reason} re-verdict`)) return { action: 'shelter', threat: cur.name } } catch { /* fall through to run */ }
          await runAway(cur, `${reason} re-verdict`)
          await recover()
          return { action: 'flee', threat: cur.name }
        }
        if (v === 'ignore') break
        try {
          if (cur.dist > 3.2) {
            // shooters (skeleton at 10 blocks) cannot be hit from here: close the
            // distance first, bounded so a chase cannot drag us across the map
            await gotoSafe(bot, new goals.GoalFollow(cur.entity, 2), { timeoutMs: 2500, label: `closing ${cur.name}` })
          }
        } catch { /* swing anyway when in reach */ }
        if (!bot.entity) break
        try {
          await bot.lookAt(cur.entity.position.offset(0, (cur.entity.height ?? 1.8) * 0.9, 0), true)
          bot.attack(cur.entity)
        } catch { /* swing again next round */ }
        await bot.waitForTicks(10) // ~2 swings/s - vanilla cooldown eats DPS but kills all the same
      }
      await recover()
      return { action: 'fight', threat: threat.name }
    } finally { defending = false }
  }

  // Reactive sentry: mineflayer emits 'health' on every damage tick. A drop that
  // is NOT ours to fix by waiting (fall/lava/starvation) is a mob hit when a
  // hostile stands near - the dig guards handle the terrain damage themselves.
  let sentryHealth = bot.health ?? 20
  let sentryTimer = null
  bot.on('health', () => {
    const hp = bot.health ?? 20
    const dropped = hp < sentryHealth - 0.25
    sentryHealth = hp
    if (!dropped || sentryTimer) return
    sentryTimer = setTimeout(() => {
      sentryTimer = null
      if (!bot.entity) return // died between the hit and this timer
      const threat = nearestHostile({ range: DETECT_RANGE })
      if (!threat) return
      defendSelf('sentry').catch(() => { /* the next drop re-primes us */ })
    }, 400)
  })

  // ---- drowning rescue (v0.13.0, policy in src/lib/drowning.mjs) ----
  // Fleet 900 s run: F1 and F3 DROWNED. The shape every time: walk into water
  // (pathfinder liquidCost=1 - crossings were free), sink (vanilla physics has
  // no swim-up without a held jump), drown while the work loop keeps issuing
  // pathfinder goals that fight every manual control state. The sentry fires a
  // raw-controls swim BEFORE the air bar empties; gotoSafe refuses new goals
  // while it runs (bot._waterRescue is the cross-module gate).
  let swimming = false
  let lastRescueAt = 0
  let headWetSince = 0
  function waterRead () {
    if (!bot.entity?.position) return { feet: null, head: null, oxygen: 20 }
    const base = bot.entity.position.floored()
    const feetB = bot.blockAt(base)
    const headB = bot.blockAt(base.offset(0, 1, 0))
    return { feet: feetB?.name ?? null, head: headB?.name ?? null, oxygen: bot.oxygenLevel ?? 20 }
  }

  async function rescueFromWater (verdict) {
    if (swimming || !bot.entity) return
    swimming = true
    bot._waterRescue = true // gotoSafe refuses new walk goals from now on
    lastRescueAt = Date.now()
    stats.rescues++
    log(`${tag} water: drowning rescue start (${verdict}, oxygen ${bot.oxygenLevel ?? '?'})`)
    try {
      try { bot.pathfinder.setGoal(null) } catch { /* idle already */ }
      try { bot.clearControlStates() } catch { /* nothing held */ }
      const sample = (x, y, z) => { try { return bot.blockAt(new Vec3(x, y, z))?.name ?? null } catch { return null } }
      while (bot.entity && Date.now() - lastRescueAt < RESCUE_MAX_MS) {
        const read = waterRead()
        const inWater = isWaterName(read.feet) || isWaterName(read.head)
        if (!inWater && bot.entity.onGround) break // out and standing: done
        bot.setControlState('jump', true) // swim up / stay at the surface
        if (!isWaterName(read.head)) {
          // head in air: surface reached - swim for the nearest shore (the raw
          // tunnel/shelter lesson: no pathfinder while conditions are hostile)
          const dir = shoreDirection(sample, bot.entity.position.floored())
          if (dir) {
            try { await bot.lookAt(bot.entity.position.offset(dir.dx, 0, dir.dz), false) } catch { /* keep the bearing */ }
            bot.setControlState('forward', true)
            await bot.waitForTicks(8)
            bot.setControlState('forward', false)
          } else {
            await bot.waitForTicks(10) // no shore in sight: tread and stay alive
          }
        } else {
          await bot.waitForTicks(5) // submerged: ascending is everything
        }
      }
      const done = !bot.entity
        ? 'aborted (bot gone)'
        : (!(isWaterName(waterRead().feet) || isWaterName(waterRead().head)) ? 'complete' : 'timeout (still wet)')
      log(`${tag} water: rescue ${done} in ${((Date.now() - lastRescueAt) / 1000).toFixed(1)}s`)
    } finally {
      try { bot.clearControlStates() } catch { /* nothing held */ }
      bot._waterRescue = false
      swimming = false
    }
  }

  const drownTimer = setInterval(() => {
    try {
      if (!bot.entity || swimming || defending) return
      if (Date.now() - lastRescueAt < RESCUE_COOLDOWN_MS) return // a bot treading a flooded shaft re-fires otherwise every 5 s
      const now = Date.now()
      const read = waterRead()
      const headWet = isWaterName(read.head)
      if (headWet) { if (!headWetSince) headWetSince = now } else headWetSince = 0
      const verdict = waterVerdict({ ...read, headWetMs: headWet ? now - headWetSince : 0 })
      if (verdict === 'drowning') rescueFromWater(verdict).catch(() => { /* next tick re-checks */ })
    } catch { /* never kill the interval */ }
  }, 600)
  bot.on('end', () => { try { clearInterval(drownTimer) } catch { /* process teardown */ } })

  // PROXIMITY sentry for UNARMED bots (v0.11.3): the damage sentry fires when a
  // hit has ALREADY landed, and the measured e2e run showed what happens then -
  // the zombie at dist 0.4 follows the bot into the shelter entrance and the
  // seal placement lands into an OCCUPIED cell (server rejects it, bot dies in
  // the open). Detection must come BEFORE contact: an unarmed bot at night with
  // a hostile inside 7 blocks (~3 s of shamble) shelters while there is still
  // time. Armed bots keep the damage-driven behaviour.
  const proximityTimer = setInterval(() => {
    try {
      if (!bot.entity || defending) return
      if (swimming) return // the drowning rescue owns the controls
      if (isWaterName(waterRead().head)) return // no dig-in shelter while submerged - the water sentry owns it
      if (!isNight(bot.time?.timeOfDay)) return
      const threat = nearestHostile({ range: 7 })
      if (!threat) return
      defendSelf('proximity').catch(() => { /* re-checked next tick */ })
    } catch { /* never kill the interval */ }
  }, 1200)
  bot.on('end', () => { try { clearInterval(proximityTimer) } catch { /* process teardown */ } })

  const ready = new Promise((resolve, reject) => {
    bot.once('spawn', async () => {
      // Bound the A* search space (v0.6.5 Big Fleet OOM fix). searchRadius=-1 (the
      // library default) prunes NOTHING: a goal sealed in stone then explores the whole
      // reachable graph, retaining millions of nodes - 19 concurrent searches did that
      // simultaneously. searchRadius only bounds DETOURS beyond the straight-line
      // estimate, so normal and even long paths are unaffected. The pathfinder object
      // exists by spawn time (the plugin injects it during load), but stay defensive.
      if (bot.pathfinder) {
        bot.pathfinder.searchRadius = 32
        bot.pathfinder.thinkTimeout = 2000 // less CPU per search; dynamic pathing recomputes anyway
      }
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

  // (v0.10.4) Horizontal 1x2 branch gallery - the cure for the floor lock. digShaft
  // digs DOWN and breaks the moment pos.y <= floor; the caller's "next column" walk
  // at that depth targets sealed stone and fails, so a bottomed-out bot froze for the
  // rest of the run (600s fleet 35478370438: mined frozen at 987 for the last 222s).
  //
  // Two hard lessons from three 600s dispatches (35478370438, 35479849058,
  // 35482935239 - 9298/17198 'tunnel: 0 blocks' lines):
  // 1. fastDig resolves false when the server VALIDATES the vanilla dig time and the
  //    hand cannot harvest (bare hand on stone needs 150 ticks of break progress; the
  //    100-tick spam window expires first). A block that did not break must not be
  //    counted - done now grows only on fastDig === true, and repeated refusals trip
  //    the stall breaker instead of looping.
  // 2. gotoSafe/standGoalNear REFUSE exactly the cells a tunnel produces (cave lips,
  //    1-block ledges, unfloored openings): the walk failure was the freeze. The one-
  //    block step now uses raw CONTROLS - look at the cell, hold "forward" 10 ticks,
  //    let gravity handle the drop - which is what a real player does and it never
  //    refuses a walkable step. stalls (no position change) break the gallery early;
  //    the caller rotates the direction.
  async function tunnel (dir, { maxBlocks = 12, names = null, shouldStop = null } = {}) {
    enablePhysicsMode()
    configureGroundMovements()
    stats.startedAt = stats.startedAt || Date.now()
    const start = Date.now()
    const d = new Vec3(Math.sign(dir.x) || 1, 0, Math.sign(dir.z) || 0)
    let done = 0
    let stalls = 0
    try {
      while (done < maxBlocks && !shouldStop?.() && bot.entity && stalls < 4) {
        const from = bot.entity.position.floored()
        const feetCell = from.offset(d.x, 0, d.z)
        const feetB = bot.blockAt(feetCell)
        const headB = bot.blockAt(feetCell.offset(0, 1, 0))
        // lava/water ahead: stop this gallery, the caller rotates the direction
        if ((feetB && feetB.boundingBox === 'fluid') || (headB && headB.boundingBox === 'fluid')) break
        // clear the feet cell first (one-type names gate honoured; a refused break
        // is NOT counted - see lesson 1)
        if (feetB && feetB.type !== 0) {
          if (names && !names.includes(feetB.name)) break
          if (await bot.fastDig(feetB)) {
            done++
            stats.mined++
            stats.byName[feetB.name] = (stats.byName[feetB.name] || 0) + 1
          }
        }
        if (headB && headB.type !== 0 && (!names || names.includes(headB.name))) {
          if (await bot.fastDig(headB)) {
            done++
            stats.mined++
            stats.byName[headB.name] = (stats.byName[headB.name] || 0) + 1
          }
        }
        if (done >= maxBlocks || shouldStop?.() || !bot.entity) break
        // one-block step by raw CONTROLS (lesson 2): no pathfinder in the hot path
        let moved = false
        try {
          await bot.lookAt(feetCell.offset(0.5, 0.5, 0.5), true)
          bot.setControlState('forward', true)
          await bot.waitForTicks(10)
          bot.setControlState('forward', false)
          const to = bot.entity.position.floored()
          moved = to.x !== from.x || to.z !== from.z
        } catch { /* stall accounting below */ }
        if (moved) stalls = 0
        else stalls++
        await bot.waitForTicks(2) // gravity/step settle before the next cut
      }
    } catch { /* never break the caller's loop */ }
    const secs = (Date.now() - start) / 1000
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
    // (v0.13.0) drowning prevention: default liquidCost=1 made lake crossings
    // FREE for the pathfinder - bots walked into water and sank (fleet 900 s
    // run: F1 and F3 "drowned"). A real per-block cost makes A* prefer land
    // detours; the existing retry ladder absorbs the rare unreachable.
    moves.liquidCost = 8
    moves.scafoldingBlocks = []
    bot.pathfinder.setMovements(moves)
    // belt & braces: the spawn hook normally set these already
    bot.pathfinder.searchRadius = 32
    bot.pathfinder.thinkTimeout = 2000
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
    let idleLoops = 0 // consecutive loop iterations with NOTHING mined (the silent stall)
    let dirIndex = 0 // rotates when the current direction stopped yielding
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
        map?.take(block.name, pos) // mined away - no other bot should walk here for it
      }
      // record the chunk RIGHT HERE, before any walking: the bot is a passive scout
      // every iteration, not only when a hop completes. A window that ends mid-batch
      // (drop-chasing can eat the whole budget) still marks the chunk as scanned -
      // measured: a 45s forest window ended with chunksScanned=0 because both bots
      // never finished an iteration, which then failed the integration assertion.
      recordToMap()

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

      // 3. nothing in reach: ask the map where the fleet KNOWS a target is (scout data or
      //    what another miner recorded). A verified trip replaces a blind direction hop.
      //    STALL ESCALATION behind it (v0.4.0): when the map cannot help either, the old
      //    "hop and look again" loop spun forever on the same spot - each failed gotoSafe
      //    burned its whole 25s timeout and the bot produced nothing (+0, +0, +0 windows).
      //    Escalate: far hop -> 90 deg rotation -> guaranteed digShaft descent.
      if (dug === 0) {
        idleLoops++
        const known = mapTargetFor(names)
        if (known) {
          stats.mapTrips++
          try {
            await gotoSafe(bot, new goals.GoalNear(known.pos.x, known.pos.y, known.pos.z, 2), { timeoutMs: 25000, label: `map trip ${known.name}` })
          } catch {
            failedTrips.add(`${known.pos.x},${known.pos.y},${known.pos.z}`)
            if (failedTrips.size > 32) failedTrips.clear() // bounded amnesia
          }
          recordToMap()
          continue // re-scan at the new spot instead of also doing the direction hop
        }
        const cur = rot(dirIndex, direction)
        if (idleLoops === 2) {
          await hopDirection(bot, cur, 32) // twice nothing: try FURTHER out
        } else if (idleLoops === 4) {
          dirIndex++ // the direction itself is the problem (river / cliff wall)
          await hopDirection(bot, rot(dirIndex, direction), 24)
        } else if (idleLoops >= 6) {
          // guaranteed progress: descend into the terrain and mine our way forward
          log(`${tag} workOnGround idle x${idleLoops}: descending (digShaft fallback)`)
          await digShaft(names, { maxBlocks: Math.min(24, maxBlocks - done), shouldStop })
          idleLoops = 2 // keep us in the "far hop" regime afterwards
        } else {
          await hopDirection(bot, cur, hopDistance)
        }
        recordToMap()
        continue
      }
      idleLoops = 0

      const here = bot.entity.position
      const goal = new Vec3(here.x + direction.x * hopDistance, here.y, here.z + direction.z * hopDistance)
      try { await gotoSafe(bot, new goals.GoalNear(goal.x, goal.y, goal.z, 3)) } catch { /* keep working here */ }
      recordToMap() // every walking miner is a passive scout
    }
    const secs = (Date.now() - started) / 1000
    stats.secs = secs
    return { done, secs, rate: secs > 0 ? done / secs : 0 }
  }

  // direction rotated by 90 degrees * quarterTurns around Y (pure, unit-testable)
  function rot (quarterTurns, dir) {
    const q = ((quarterTurns % 4) + 4) % 4
    if (q === 0) return dir
    if (q === 1) return new Vec3(-dir.z, 0, dir.x)
    if (q === 2) return new Vec3(-dir.x, 0, -dir.z)
    return new Vec3(dir.z, 0, -dir.x)
  }

  // walk `dist` blocks along dir; on failure try a SHORT perpendicular hop so the bot
  // never spins in place against an obstacle (the old "hop failed -> same hop again" loop)
  async function hopDirection (bot, dir, dist) {
    const here = bot.entity.position
    const goal = new Vec3(here.x + dir.x * dist, here.y, here.z + dir.z * dist)
    try {
      await gotoSafe(bot, new goals.GoalNear(goal.x, goal.y, goal.z, 3))
      return true
    } catch {
      const side = new Vec3(here.x - dir.z * 8, here.y, here.z + dir.x * 8)
      try { await gotoSafe(bot, new goals.GoalNear(side.x, side.y, side.z, 2), { timeoutMs: 10000 }) } catch { /* give this round up */ }
      return false
    }
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
        // PATHFINDER A* IS SYNCHRONOUS: the budget is event-loop BLOCKED time, and the
        // server times a bot out after ~30s of unanswered keepalives. 24 probes x 2.5s
        // used to freeze the loop for a full minute (bots 'Timed out' mid-gather).
        // 600ms per probe is enough for a 3-block neighbourhood answer.
        const path = bot.pathfinder.getPathTo(bot.pathfinder.movements, goal, 600)
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
   *
   * SURVIVAL GUARDS (field log v0.4.0: one bot died FOUR times in a single 90s window on a
   * world that earlier runs had riddled with holes - every death drops the whole inventory):
   *   1. LAVA CHECK - never dig into a column that opens into lava within 4 blocks below.
   *   2. HEALTH CHECK - a bot that just took damage (fall, mob, lava) stops descending and
   *      waits to regenerate before digging deeper.
   */
  const DANGEROUS = SHAFT_FLUID_NAMES // lava kills, water drowns: a shaft punched into an aquifer floods into a 1x1 well with no shore and no climb
  function lavaAheadBelow (fromPos, { depth = 4 } = {}) {
    for (let dy = 1; dy <= depth; dy++) {
      const b = bot.blockAt(new Vec3(fromPos.x, fromPos.y - dy, fromPos.z))
      if (!b) continue // unloaded chunk: treat as unknown, not dangerous
      if (DANGEROUS.has(b.name)) return true
      if (b.boundingBox !== 'empty') return false // solid ground seals the column
    }
    return false
  }

  // How many AIR blocks start directly below `fromPos` (which is ABOUT TO BE dug).
  // A 4+ block fall deals damage and a shaft that punches through a cave ceiling
  // drops the bot into a dark pit full of whatever lives there - measured live:
  // a bot dug 16 stone, fell into a cavern, took 20 -> 5 fall damage and DIED,
  // losing the whole inventory. Vanilla players never dig straight down for exactly
  // this reason; the bot must measure before it digs.
  function dropAheadBelow (fromPos, { depth = 5 } = {}) {
    let air = 0
    for (let dy = 1; dy <= depth; dy++) {
      const b = bot.blockAt(new Vec3(fromPos.x, fromPos.y - dy, fromPos.z))
      if (!b) break // unloaded chunk below: assume the worst is behind the dug block
      if (b.boundingBox === 'empty') air++
      else break
    }
    return air
  }

  // (v0.10.0) One wall torch at head level in the shaft we are standing in. Wall-
  // attached ON PURPOSE: a floor torch pops the moment digShaft eats the block
  // under it (place -> dig -> pop -> pickup loops forever). A torch has no
  // collision shape, so vanilla accepts it in the cell we are about to occupy;
  // with the next fall the torch ends up ABOVE our head, attached to the wall,
  // and lights the column we came down through. Bounded and silent: placement
  // must never break the dig loop.
  async function placeTorchHere () {
    try {
      const torch = inventoryItems(bot).find(i => i.name === 'torch')
      if (!torch) return false
      const cell = bot.entity.position.floored().offset(0, 1, 0)
      const cellB = bot.blockAt(cell)
      if (!cellB || cellB.boundingBox !== 'empty') return false // no free cell right now
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const wall = bot.blockAt(cell.offset(dx, 0, dz))
        if (!wall || wall.boundingBox !== 'block') continue // air / fluid / out of world
        await bot.equip(torch, 'hand')
        // vanilla drops right-clicks that arrive <4 ticks apart (the placeTable
        // lesson) - the dig rhythm around this call paces the attempts naturally
        await bot.waitForTicks(5)
        await withTimeout(bot.placeBlock(wall, new Vec3(-dx, 0, -dz)), 5000, 'shaft torch')
        stats.torched++
        return true
      }
      return false
    } catch { return false }
  }

  async function digShaft (names, { maxBlocks = Infinity, shouldStop = null, minY = null, maxMs = Infinity, onProgress = null } = {}) {
    enablePhysicsMode()
    configureGroundMovements()
    // (v0.12.0) record where this descent started: climbOut (the pillar-jump shaft
    // exit) climbs back to exactly this level. Overwritten every shaft, so the
    // value is always the most recent descent's surface reference.
    stats.shaftEntryY = bot.entity?.position ? bot.entity.position.floored().y : null
    // Torch stocking (v0.10.0): surplus sticks + mined coal -> torches BEFORE the
    // descent. The kit phase passes here too (gatherWood digs through a tree) and
    // then holds no sticks, so torchCraftPlan's reserve makes it an honest no-op
    // there. Silent and bounded: a dark shaft is survivable, a broken loop is not.
    try { await craftTorches(bot, { log: msg => log(`${tag} ${msg}`) }) } catch { /* keep digging */ }
    // Treetop spawn / canopy end position: from up there the block below is leaves or
    // wood - not in the target names - and the loop would wander sideways forever
    // (measured: 90s, zero blocks). Dig straight down through leaves/wood until real
    // solid ground is under our feet, exactly like workOnGround's pre-descent.
    for (let guard = 0; guard < 40 && bot.entity; guard++) {
      const under = bot.blockAt(bot.entity.position.floored().offset(0, -1, 0))
      if (under && under.type !== 0 && under.boundingBox !== 'empty' && !/leaves/.test(under.name)) break
      if (under && under.type !== 0 && under.boundingBox !== 'empty') {
        try { await bot.fastDig(under) } catch { break } // undiggable below - work from here
      }
      await bot.waitForTicks(4) // let gravity settle us into the freed cell
    }
    const started = Date.now()
    let done = 0
    let digsSinceTorch = 0 // torch rhythm counter - reset on a successful placement
    const floor = minY ?? bot.game.minY + 3
    let lastHealth = bot.health ?? 20
    let sidestepRounds = 0 // independent rotation: "done" never grows while stuck, done%4 always picked east
    while (done < maxBlocks && !shouldStop?.() && bot.entity && Date.now() - started <= maxMs) {
      // health guard: damaged bots defend FIRST (v0.11.0), then wait to regen.
      // The old code only waited - measured 2026-09-20: a zombie hit 20 -> 5.7 ->
      // dead in 9 s while the guard "paused descent" for 30 ticks at a time.
      const hp = bot.health ?? 20
      if (hp < lastHealth - 0.5) {
        log(`${tag} digShaft: health dropped ${lastHealth.toFixed(1)} -> ${hp.toFixed(1)}, pausing descent`)
        try { await defendSelf('digShaft') } catch { /* never let defense break the dig loop */ }
        await bot.waitForTicks(30)
        lastHealth = bot.health ?? 20
        if (hp < 6) {
          // badly hurt: STOP this shaft entirely. Climbing out mid-shaft used to
          // continue the same descent right after the retreat - and the next fall
          // finished the job (measured: 20 -> 5 -> dead, inventory lost). The caller
          // redeploys us somewhere else instead.
          try {
            const g = standGoalNear(bot, goals, bot.entity.position.x + 6, bot.entity.position.y, bot.entity.position.z + 6, { range: 2 })
            await gotoSafe(bot, g, { timeoutMs: 12000, label: 'hurt retreat' })
          } catch { /* stay and heal here instead */ }
          await bot.waitForTicks(40)
          break
        }
        continue
      }
      lastHealth = hp

      const pos = bot.entity.position.floored().offset(0, -1, 0)
      if (pos.y <= floor) break
      // fluid guard: a column that opens into lava/water within 4 blocks is a death trap
      if (lavaAheadBelow(pos)) {
        log(`${tag} digShaft: fluid below ${pos.floored()} - moving sideways`)
        const dir = [new Vec3(1, 0, 0), new Vec3(0, 0, 1), new Vec3(-1, 0, 0), new Vec3(0, 0, -1)][sidestepRounds % 4]
        sidestepRounds++
        try {
          const g = standGoalNear(bot, goals, bot.entity.position.x + dir.x * 3, bot.entity.position.y, bot.entity.position.z + dir.z * 3, { range: 1 })
          await gotoSafe(bot, g, { timeoutMs: 10000, label: 'lava sidestep' })
        } catch { /* cannot move: stop this shaft */ break }
        continue
      }
      // fall guard: digging into a cave ceiling drops the bot 4+ blocks (fall damage,
      // then whatever waits at the bottom). Sidestep instead of descending.
      if (dropAheadBelow(pos) >= 4) {
        log(`${tag} digShaft: drop of 4+ below ${pos.floored()} (cave?) - moving sideways`)
        const dir = [new Vec3(1, 0, 0), new Vec3(0, 0, 1), new Vec3(-1, 0, 0), new Vec3(0, 0, -1)][(done + 2) % 4]
        try {
          await gotoSafe(bot, new goals.GoalNear(bot.entity.position.x + dir.x * 3, bot.entity.position.y, bot.entity.position.z + dir.z * 3, 1), { timeoutMs: 10000, label: 'fall sidestep' })
        } catch { /* cannot move: stop this shaft */ break }
        continue
      }
      const block = bot.blockAt(pos)
      if (block && block.type !== 0 && (names == null || names.includes(block.name))) {
        try {
          await bot.fastDig(block)
          done++
          stats.mined++
          stats.byName[block.name] = (stats.byName[block.name] || 0) + 1
          // torch rhythm (v0.10.0): a wall torch every TORCH_SPACING digs keeps the
          // whole column above the hostile-spawn light threshold; torchDue also
          // fires early when the bot can READ darkness. Silent on any failure.
          digsSinceTorch++
          if (torchDue({ digsSinceTorch }) && await placeTorchHere()) digsSinceTorch = 0
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
          const dir = [new Vec3(1, 0, 0), new Vec3(0, 0, 1), new Vec3(-1, 0, 0), new Vec3(0, 0, -1)][sidestepRounds % 4]
          sidestepRounds++
          try {
            const g = standGoalNear(bot, goals, bot.entity.position.x + dir.x, bot.entity.position.y, bot.entity.position.z + dir.z, { range: 1 })
            await gotoSafe(bot, g)
          } catch { /* keep digging where we are */ }
        }
      }
    }
    const secs = (Date.now() - started) / 1000
    return { done, secs, rate: secs > 0 ? done / secs : 0, torched: stats.torched ?? 0 }
  }

  // ---------------------------------------------------------------- climb out
  // PILLAR-JUMP exit from the 1x1 dig shaft (v0.12.0). The pathfinder cannot
  // climb out of a shaft the bot dug straight down (no stairs, no ladder) - which
  // stranded every bot underground and made the whole surface economy dead:
  // fleet 35485296464 (600s) ended banked=0 smelted=0 sand=0 with sand=110 KNOWN
  // positions on the map and 38x 'map trip skipped: unreachable'. The shaft above
  // the bot is open (the bot dug it), so the climb is the classic survival move:
  // leap, place a block beneath us at the apex, land on it, repeat - one level per
  // jump. Cave overhangs and tunnel ceilings on the way are dug through (bounded);
  // fluids and undiggable blocks stop the climb honestly instead of drowning it.
  // Never throws: a failed climb costs the caller its trip/banking, not the bot.
  async function climbOut ({ dir = null, maxUp = PILLAR_LEVEL_CAP, maxMs = PILLAR_MAX_MS, shouldStop = null } = {}) {
    enablePhysicsMode()
    configureGroundMovements()
    if (!bot.entity) return { ok: false, reason: 'no entity', gained: 0, placed: 0, dug: 0 }
    const feet0 = bot.entity.position.floored()
    const blockAtDy = dy => {
      try { return bot.blockAt(feet0.offset(0, dy, 0)) } catch { return null }
    }
    // target: the recorded shaft entry level wins (digShaft just stored it); with
    // no record, daylight (skyLight 15, exists only above ground) marks the surface
    const skyLitAt = dy => {
      const b = blockAtDy(dy)
      if (!b) return null // chunk data missing - unknown
      return (b.skyLight ?? 0) >= 15
    }
    const entryY = Number.isFinite(stats.shaftEntryY) ? stats.shaftEntryY : null
    const plan = pillarTarget({ feetY: feet0.y, targetY: entryY, skyLitAt, maxUp })
    if (plan.levels <= 1) return { ok: true, reason: `already out (${plan.source})`, gained: 0, placed: 0, dug: 0 }
    // dir = the way the caller is headed (deployment direction / yard bearing):
    // only used to pick the wall for the one-block bootstrap dig, so any cardinal
    // sign of it is good enough
    const d = new Vec3(Math.sign(dir?.x ?? 1) || 1, 0, Math.sign(dir?.z ?? 0) || 0)
    let placed = 0
    let dug = 0
    let fails = 0
    let equipped = null
    let diagLevels = 0 // climb diag: log the first 3 failed levels per climb, not all 30
    const start = Date.now()
    const done = () => ({ ok: !bot.entity ? false : bot.entity.position.floored().y >= plan.targetY, reason: 'done', gained: (bot.entity ? bot.entity.position.floored().y : feet0.y) - feet0.y, placed, dug, secs: (Date.now() - start) / 1000 })
    while (bot.entity && !shouldStop?.() && fails < PILLAR_FAIL_LIMIT && placed < maxUp && Date.now() - start <= maxMs) {
      const feet = bot.entity.position.floored()
      if (feet.y >= plan.targetY) return { ...done(), reason: 'out' }
      // headroom: the jump needs the two cells above the feet free. Solid ones are
      // dug through (bounded by CEILING_DIG_LIMIT); fluids/undiggable stop the climb.
      let blocked = false
      for (const dy of [1, 2]) {
        const cellB = bot.blockAt(feet.offset(0, dy, 0))
        const verdict = climbableCeiling(cellB)
        if (verdict === 'free') continue
        if (verdict !== 'dig' || dug >= CEILING_DIG_LIMIT) { blocked = true; break }
        try {
          if (await bot.fastDig(cellB)) { dug++; stats.mined++; stats.byName[cellB.name] = (stats.byName[cellB.name] || 0) + 1 }
          else { blocked = true; break }
        } catch { blocked = true; break }
      }
      if (blocked) { fails++; await bot.waitForTicks(10); continue }
      // pillar stock: pockets first, then a ONE-block wall dig as bootstrap (stone
      // walls refuse bare hands - the dig is honest, a refusal just fails the climb)
      let item = pickPillarBlock(inventoryItems(bot))
      if (!item) {
        const wall = bot.blockAt(feet.offset(d.x, 0, d.z))
        if (!wall || wall.type === 0) break
        try { await bot.fastDig(wall) } catch { break }
        item = pickPillarBlock(inventoryItems(bot))
        if (!item) break // dug, but nothing dropped (bare-handed stone): cannot pillar
      }
      try {
        if (equipped !== item.name) { await bot.equip(item, 'hand'); equipped = item.name }
      } catch { break }
      // the jump: look straight down, leap, and place the block into the cell the
      // feet are leaving AS SOON AS the feet actually clear it - by measurement,
      // not by a fixed tick count. mineflayer's jump height does not exactly match
      // vanilla's 1.25 (physics integration differs by version/patching), so tick-5
      // and tick-8 placements both produced server rejections (fleet 35488918930:
      // 6 climbs OK, fleet after the tick-8 'fix': 0/15). The height poll below is
      // self-timing: place the moment the AABB is provably clear (>= 1.02 above
      // the fill cell), no matter how the physics integrate the impulse.
      let okPlace = false
      let placeHeight = 0
      try {
        await bot.look(bot.entity.yaw, Math.PI / 2, false)
        bot.setControlState('jump', true)
        const fill = feet // the cell we are jumping out of
        let cleared = false
        for (let t = 0; t < 16 && bot.entity; t++) {
          await bot.waitForTicks(1)
          placeHeight = bot.entity.position.y - fill.y
          if (placeHeight >= 1.02) { cleared = true; break }
        }
        if (cleared) {
          for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const ref = bot.blockAt(fill.offset(dx, 0, dz))
            if (!ref || ref.boundingBox !== 'block') continue
            try {
              await withTimeout(bot.placeBlock(ref, new Vec3(-dx, 0, -dz)), PILLAR_PLACE_TIMEOUT_MS, 'pillar place')
              okPlace = true
              break
            } catch { /* next wall */ }
          }
        }
      } catch { /* fail accounting below */ }
      bot.setControlState('jump', false)
      await bot.waitForTicks(PILLAR_LAND_TICKS) // land on the fresh block (or the floor)
      const now = bot.entity.position.floored()
      if (!okPlace && diagLevels++ < 3) log(`${tag} climb diag: level at y=${feet.y} no place (height ${placeHeight.toFixed(2)}, cleared=${placeHeight >= 1.02})`)
      // a y-jump of more than 3 levels without a placement is not climbing - it is
      // a respawn/teleport (fleet 35488918930: a bot that died mid-climb respawned
      // at the surface and the climb reported +31 gained with 0 placed, 4 s). Stop
      // honestly instead of crediting the teleport to the climb.
      if (now.y - feet.y > 3) return { ok: false, reason: 'teleport', gained: now.y - feet0.y, placed, dug }
      if (okPlace && now.y > feet.y) { placed++; fails = 0 } else { fails++ }
      await bot.waitForTicks(2)
    }
    if (!bot.entity) return { ok: false, reason: 'no entity', gained: 0, placed, dug }
    const feetNow = bot.entity.position.floored()
    const ok = feetNow.y >= plan.targetY
    if (ok) stats.climbs = (stats.climbs ?? 0) + 1
    const timedOut = Date.now() - start > maxMs
    return {
      ok,
      reason: ok ? 'out' : (timedOut ? 'timeout' : (placed + dug === 0 ? 'nothing to climb with' : 'stalled')),
      gained: feetNow.y - feet0.y,
      placed,
      dug,
      secs: (Date.now() - start) / 1000
    }
  }

  // ---------------------------------------------------------------- wood run
  const LOG_NAMES = ['oak_log', 'birch_log', 'spruce_log', 'jungle_log', 'dark_oak_log', 'acacia_log', 'mangrove_log', 'cherry_log', 'pale_oak_log']
  const LEAF_NAMES = ['oak_leaves', 'birch_leaves', 'spruce_leaves', 'jungle_leaves', 'dark_oak_leaves', 'acacia_leaves', 'mangrove_leaves', 'azalea_leaves', 'flowering_azalea_leaves', 'cherry_leaves', 'pale_oak_leaves']
  const logCount = () => bot.inventory.items().filter(i => i.name.endsWith('_log')).reduce((a, i) => a + i.count, 0)

  // (v0.9.0) Replant at the stump right after the chop. This is the cheapest legal
  // spot there is: the cell is freshly emptied, the dirt-family floor is still intact
  // (chopReachable eats only logs), and the bot stands within reach RIGHT NOW. Canopy
  // decay over the next seconds drops the saplings the sweep below already picks up,
  // so a chopped trunk becomes the NEXT bot's tree - the vanilla-ticks cure for the
  // v0.8.4 death spiral (recovery bots starve once the spawn forest is eaten: 25
  // recovery attempts / 3 OK in 600s). Bounded and silent: planting must never break
  // the chop loop.
  async function replantStump (stumpPos) {
    if (!stumpPos) return false
    try {
      const item = pickSapling(inventoryItems(bot))
      if (!item) return false // no saplings yet (canopy drops not picked up) - nothing to do
      // stump cell first (the true spot), then the 4 horizontal neighbours: a stump
      // over a cave hole / dug-out floor still leaves the neighbours plantable
      const cells = [stumpPos, stumpPos.offset(1, 0, 0), stumpPos.offset(-1, 0, 0), stumpPos.offset(0, 0, 1), stumpPos.offset(0, 0, -1)]
      for (const cell of cells) {
        const cellB = bot.blockAt(cell)
        const floorB = bot.blockAt(cell.offset(0, -1, 0))
        const verdict = plantableCell(cellB, floorB)
        if (!verdict.ok) continue
        await bot.equip(item, 'hand')
        // vanilla drops right-clicks that arrive <4 ticks apart (the placeTable lesson)
        await bot.waitForTicks(5)
        await withTimeout(bot.placeBlock(floorB, new Vec3(0, 1, 0)), 5000, 'sapling placement')
        const now = bot.blockAt(cell)
        if (now && now.name === item.name) {
          stats.planted++
          log(`${tag} sapling planted: ${item.name} at ${cell.floored()} (${verdict.reason})`)
          return true
        }
      }
    } catch { /* replanting is opportunistic - never break the chop loop */ }
    return false
  }

  // Ground chopping: dig every log within reach at the trunk base (lowest first), then
  // walk over the drops. A vertical shaft only works from the top of the tree (flight);
  // on foot the trunk must be eaten from the side, which reach 4.5 fully covers for the
  // usual 4-5 log trunk.
  async function chopReachable () {
    const batch = bot.findBlocks({ matching: b => LOG_NAMES.includes(b.name), maxDistance: 4.5, count: 40 })
      .sort((a, b) => a.y - b.y) // lowest first: the trunk bottom is what keeps the rest up
    let n = 0
    let lowestDug = null
    for (const pos of batch) {
      if (logCount() > 0 && n >= 6) break // enough for a full tool kit from one tree
      const block = bot.blockAt(pos)
      if (!block || block.type === 0) continue
      try {
        await bot.fastDig(block)
        n++
        if (!lowestDug || pos.y < lowestDug.y) lowestDug = pos.floored()
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
    if (n > 0 && inventoryItems(bot).some(i => isPlantableSapling(i.name))) {
      await replantStump(lowestDug)
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
  async function gatherWood ({ want = 8, goodEnough = 4, stallSeconds = 25, direction = new Vec3(1, 0, 0), shouldStop = null, maxSeconds = 180 } = {}) {
    const started = Date.now()
    const visitedTrunks = new Set() // "x,z" of every trunk we already ate (floating tops stay behind)
    let idleChops = 0
    // stall escape (src/lib/woodplan.mjs): a bot holding enough logs for the tool kit
    // must go CRAFT instead of burning its whole budget on the last log of a eaten-out
    // forest (v0.6.9 fleet: a bot with 7/8 logs idled ~110s and only then crafted)
    let lastGain = started
    let prevLogs = logCount()
    while (logCount() < want && !shouldStop?.() && bot.entity && (Date.now() - started) / 1000 < maxSeconds) {
      const nowTs = Date.now()
      if (logCount() > prevLogs) { lastGain = nowTs; prevLogs = logCount() }
      const stalled = () => stalledButCraftable({ logs: prevLogs, goodEnough, msSinceGain: nowTs - lastGain, stallMs: stallSeconds * 1000 })
      // every walking bot is a passive scout: record the trees/sand/gravel it sees into
      // the shared map so wood-starved siblings can query real positions instead of
      // blind-walking into a depleted forest (11/19 bots ended the v0.6.8 fleet run
      // with logs=0 that way)
      recordToMap({ maxDistance: 48, count: 32 })
      // lowest log first: that is a trunk base; a floating top of an eaten tree sorts higher
      // and is skipped by the visited-column check
      const cands = bot.findBlocks({ matching: b => LOG_NAMES.includes(b.name), maxDistance: 48, count: 24 })
        .sort((a, b) => (a.y - b.y) || (a.distanceTo(bot.entity.position) - b.distanceTo(bot.entity.position)))
      const base = cands.find(p => !visitedTrunks.has(`${p.x},${p.z}`))
      if (!base) {
        // local scan empty AND we already hold a craftable amount: a FAILED wood trip
        // lands here on the next round - stop and craft instead of trip-failing forever
        if (stalled()) break
        // local scan empty: ask the shared map for a tree another bot recorded.
        // verify=false - far entries sit in unloaded chunks and blockAt-nulling them
        // would wipe the bucket; chopReachable re-checks locally on arrival.
        const known = mapTargetFor(LOG_NAMES, { maxDistance: 256, verify: false })
        if (known) {
          visitedTrunks.add(`${known.pos.x},${known.pos.z}`) // never loop on the same entry
          try {
            await gotoSafe(bot, standGoalNear(bot, goals, known.pos.x, known.pos.y, known.pos.z, { range: 4 }), { timeoutMs: 24000, label: 'wood trip' })
          } catch { /* chop whatever is in reach now */ }
          continue
        }
        // nothing known anywhere either: move along our direction and look again
        if (stalled()) break
        const here = bot.entity.position
        const out = new Vec3(here.x + direction.x * 32, here.y, here.z + direction.z * 32)
        try {
          await gotoSafe(bot, standGoalNear(bot, goals, out.x, out.y, out.z, { range: 4 }), { timeoutMs: 15000, label: 'wood relocate' })
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
          await gotoSafe(bot, standGoalNear(bot, goals, base.x, base.y, base.z, { range: 2 }))
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
          // three trees in a row yielded nothing (cliffs, water, fenced yards): with a
          // craftable amount in the pocket, craft NOW; otherwise relocate and keep looking
          if (stalled()) break
          idleChops = 0
          const here = bot.entity.position
          try {
            await gotoSafe(bot, standGoalNear(bot, goals, here.x + direction.x * 24, here.y, here.z + direction.z * 24, { range: 4 }))
          } catch { /* keep looking */ }
        }
      }
    }
    return { logs: logCount(), secs: (Date.now() - started) / 1000 }
  }

  // Proactive map-driven trip: walk to a position the shared map KNOWS for one of
  // `findNames`, then harvest/dig there. This is how the fleet turns scout/map
  // knowledge into actual collection of the plan's top resources (v0.6.9: sand
  // collected=0 while the map held 194 sand positions). Returns the found block
  // name, or null when the map had nothing reachable. Failed destinations land in
  // failedTrips so the fleet never re-bounces on them.
  const SURFACE_NAMES = new Set(['sand', 'gravel', 'clay', 'dirt', 'grass_block'])
  async function mapTrip (findNames, { digNames = null, walkTimeoutMs = 14000, maxBlocks = 24, maxDistance = 128, harvestSeconds = 40, direction = null, shouldStop = null } = {}) {
    const target = mapTargetFor(findNames, { maxDistance, verify: false })
    // structured result: the fleet logs failures ('unreachable') - silent map trips
    // looked like the feature never fired (it never printed a line in 3 CI runs)
    if (!target) return { error: 'no-target' }
    const key = `${target.pos.x},${target.pos.y},${target.pos.z}`
    stats.mapTrips++
    try {
      await gotoSafe(bot, standGoalNear(bot, goals, target.pos.x, target.pos.y, target.pos.z, { range: 4 }), { timeoutMs: walkTimeoutMs, label: `map trip ${target.name}` })
    } catch {
      failedTrips.add(key)
      // bounded amnesia, same as workOnGround - but drop the OLDEST half, not all:
      // a full clear made bots re-walk the same unreachable shores every few trips
      if (failedTrips.size > 32) for (const k of [...failedTrips].slice(0, 16)) failedTrips.delete(k)
      return { error: 'unreachable' }
    }
    recordToMap({ maxDistance: 32, count: 32 })
    if (findNames.every(n => SURFACE_NAMES.has(n))) {
      // Beach-type targets sit in a thin HORIZONTAL layer (shorelines): the v0.7.1
      // fleet sent 20 sand trips and collected 1 sand - a vertical shaft digs 2-3
      // sand blocks and then burns the rest of the budget on the stone underneath.
      // collectArea-style harvesting walks the beach and eats the layer sideways
      // (collectBlock also picks the drops up - surface drops bounce and scatter).
      await collectArea(findNames, {
        count: 24,
        hopDistance: 10,
        perBlockTimeoutMs: 8000,
        maxSeconds: harvestSeconds,
        direction: direction ?? new Vec3(1, 0, 0),
        shouldStop: shouldStop ?? (() => false)
      })
      return { name: target.name }
    }
    // eat what we came for: a short descent at the arrival point collects the target
    // block plus whatever sits underneath (a sand column ends in stone - which the
    // plan wants anyway). digNames must be the bot's FULL minable list: a sand-only
    // list would make digShaft sidestep forever once the column turns to stone.
    await digShaft(digNames ?? findNames, { maxBlocks })
    return { name: target.name }
  }

  // Walk to the nearest chest and bank everything but the tool kit. Soft no-op when no
  // chest is in range (CI worlds have none) - a full inventory must never kill a bot.
  async function depositLoot (opts = {}) {
    const res = await depositToChest(bot, { log, ...opts })
    if (res.deposited > 0) stats.banked = (stats.banked ?? 0) + res.deposited
    return res
  }

  return { bot, ready, stats, mineBox, nukeAround, bore, tunnel, climbOut, harvestSite, workOnGround, collectArea, digShaft, gatherWood, mapTrip, enablePhysicsMode, landHere, sweep, scanBox, flyTo, mineBlock, standSpotFor, setMode, recordToMap, mapTargetFor, depositLoot, inventoryLoad: () => inventoryLoad(bot), map, username }
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
