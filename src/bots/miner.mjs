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
import { collectGain, depositToChests, inventoryLoad } from '../lib/deposit.mjs'
import { stalledButCraftable, TRIP_WALK_MS } from '../lib/woodplan.mjs'
import { isPlantableSapling, plantableCell, pickSapling } from '../lib/sapling.mjs'
import { torchDue, torchWallDirs, torchRestockWanted, countTorches } from '../lib/torch.mjs'
import {
  pillarTarget, climbableCeiling, isWetCell, traverseStep,
  climbEntry, climbLedgerUpdate, climbStarted, isWalkableSurface, climbOwnerGate,
  stepDigPlan, STEP_MAX_PASSES, climbDigWindow, riseRecoveryPlan, isDigLanded, digRefusalDetail,
  PILLAR_FAIL_LIMIT, PILLAR_MAX_MS, PILLAR_LEVEL_CAP, PILLAR_PLACE_TIMEOUT_MS,
  TRAVERSE_MAX_BLOCKS, TRAVERSE_MAX_MS, TRAVERSE_MAX_ATTEMPTS, TRAVERSE_STALL_LIMIT,
  TRAVERSE_ROTATE_LIMIT, CLIMB_ESCAPE_O2_FLOOR, veinDigRefusal,
  tunnelStopReason, TUNNEL_MAX_MS, climbTargetY,
  wetEscapeGate, wetEscapeAccount, WET_ESCAPE_WALK_CEILING,
  bridgePlan, BRIDGE_PLACE_MAX, BRIDGE_RECHECK_TICKS, bridgeFillLanded, bridgeRefusalDetail
} from '../lib/surface.mjs'
import { isHostileEntity, pickWeapon, pickMeleeWeapon, threatVerdict, effectiveHp, isPoisoned, witchFightStep, meleeFightStep, meleeReturnPlan, driftReturnPlan, cooldownTicksForWeapon, foughtEntityGone, FIGHT_DEADLINE_MS, MELEE_RETURN_WAIT_TICKS, DRIFT_RETURN_TICKS, DETECT_RANGE, fleeResponse, kiteHopTarget, RANGED_HOSTILES, RANGED_COOLDOWN_MS, rangedCooldownUntil, rangedCooldownLive } from '../lib/combat.mjs'
import { parseDeathMessage, inferenceVerdict } from '../lib/deathcause.mjs'
import { deathDropLine } from '../lib/statcarry.mjs'
import { isNight } from '../lib/nightsafety.mjs'
import { GRAVITY_ROOF_BLOCKS, GRAVITY_MAX_PASSES, gravityColumnOrder } from '../lib/gravityroof.mjs'
import { shelterDue, earnSealDue, pickSealItem, pickJunkToDrop, SHELTER_WALL_OK, SHELTER_ROUND_MS, SHELTER_MAX_MS, SHELTER_SAFE_DIST, EARN_SEAL_MAX_THREAT_DIST, RING_SIDE_NORMALS, RING_BLOCKS_NEEDED, ringFeasible, ringBlocksNeeded, ringSideOrder, ringSideBuildable, ringThreatSideIndex, ringRangedNeeded, ringRangedEnough, countSealBlocks, emptySlotCount, RING_PLACE_ROUNDS, RING_RETRY_TICKS, ringDigEarnSupply, RING_DIG_EARN_OK } from '../lib/shelter.mjs'
import {
  waterVerdict, airBarTrust, shoreDirection, isWaterName, SHAFT_FLUID_NAMES,
  oxygenInDomain, RESCUE_MAX_MS, RESCUE_COOLDOWN_MS, OXYGEN_CRITICAL_LEVEL, AIR_GLITCH_LOG_MS,
  OXYGEN_RESCUE_LEVEL, rescueDone, fleePlan, verifyShoreCell, HazardLedger,
  vettedFleeTargetAbs, AIR_GLITCH_STREAK_CAP, dryLandProof, DRY_PROOF_BACKOFF_MS, glitchStreakCap,
  drowningCorroborated, DROWN_CORROBORATION_HP, WITNESS_COMBAT_BAND, airGlitchLogLine,
  frozenWindowFor, WET_FROZEN_WINDOW,
  historyAdmissible, O2_HISTORY_CAP,
  surfaceRearmHolds, SURFACE_REARM_MS,
  transitBearing, TRANSIT_RESCAN_TICKS, LAND_PROXIES, TRANSIT_MAP_RANGE,
  openWaterRelease, physicsFrozen, transitStalled, frozenRelogDecision,
  frozenReturnGate, frozenReturnBypass,
  FROZEN_WINDOW, REPEAT_PAGE_WINDOW_MS, REPEAT_PAGE_ALLOW, STAND_DOWN_LOG_MS,
  STANDING_PROBE_BUDGET, RESCUE_READS_CAP, PASS_LOG_INTERVAL_MS, PASS_LOG_MAX_PER_RESCUE,
  airBarFalling, ascendStalled, ceilingCell, ASCEND_DIG_BUDGET, ASCEND_STALL_PASSES
} from '../lib/drowning.mjs'
import { suffocateRescueTargets, SUFFOCATE_WATCH_EVERY_TICKS, SUFFOCATE_DIG_MAX_TICKS } from '../lib/suffocate.mjs'
import { WaterTableBoard } from '../lib/watertable.mjs' // (v0.84.0) the aquifer ceiling memory
import { craftTorches, countItem } from './tools.mjs'
import { dropTargets, dropGoalRange, lipDigWanted, DROP_GOAL_BELOW, DROP_GOAL_BELOW_DY, DROP_GOAL_DEEP_DY, DROP_GOAL_SKIP, SWEEP_DROP_REACH, SWEEP_DROP_CAP, SWEEP_DROP_TIMEOUT_MS, SWEEP_DROP_TOTAL_MS } from '../lib/drops.mjs' // (v0.173.0) the sweep's drop walk; (v0.178.0) the below-plane goal range; (v0.182.0) the deep skip; (v0.187.0) the lip dig-down; (v0.189.0) the above-plane ledge goal + the dy-family dig gate
import { chooseTarget } from '../fleet/claims.mjs'
import { walkBudgetMs } from '../lib/tripplan.mjs'
import { noteGlobal } from '../lib/blackbox.mjs' // (v0.62.0) freeze forensics at the rescue/climb sites

// one entry per occupied inventory slot (same shape tools.mjs uses); the v0.9.x
// sapling replant path calls this from gatherWood - a missing definition threw
// ReferenceError on every replant attempt ("gatherWood failed: inventoryItems
// is not defined", measured live and in CI 064c13c)
const inventoryItems = bot => bot.inventory.items()

export const BOT_VERSION = '26.2'
export const HAND_DIGGABLE = ['dirt', 'grass_block', 'coarse_dirt', 'podzol', 'sand', 'gravel', 'clay', 'soul_sand', 'snow', 'oak_log', 'birch_log', 'spruce_log']

// (v0.119.0) THE FROZEN-RETURN GATE state - per-bot, process-wide (a relog
// rebuilds the createMiner closure but the bot KEEPS its name, so the Maps
// ride across reconnects; the fleet's 19 bots share one process). The streak
// counts consecutive frozen relogs (the ladder fuel), the gate holds the
// sentry's non-critical pages for frozenReturnGate(streak) after each relog.
const frozenRelogStreaks = new Map()
const frozenReturnGates = new Map()

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
  board = null, // ClaimBoard (src/fleet/claims.mjs): trip claims so bots do not all walk to the same cluster
  broadcastClaim = null, // (pos) => void - cross-process claim broadcast (PVB2 over chat), optional
  hazardLedger = null, // (v0.62.0) shared HazardLedger (src/lib/drowning.mjs): one bot's rescue immunizes the fleet
  broadcastHazard = null, // (pos) => void - cross-process hazard broadcast (PVB2|hazard over chat), optional
  waterTableBoard = null, // (v0.84.0) shared WaterTableBoard (src/lib/watertable.mjs): one bot's fluid strike ceilings every shaft in the region
  noPathLedger = null, // (v0.62.0) the fleet-wide 'No path' verdict array (one process = one shared array); null = the ledger is off
  fullChestLedger = null, // (v0.65.0) the fleet-wide 'chest full' verdict array (same ride); null = the ledger is off
  log = () => {}
} = {}) {
  const bot = mineflayer.createBot({ host, port, username, version, auth: 'offline' })
  bot.loadPlugin(pathfinder)
  bot.loadPlugin(toolPlugin)
  bot.loadPlugin(collectBlockPlugin) // ready-made: pathfind to block, pick tool, dig, collect drops
  bot.loadPlugin(autoeat)

  const stats = { mined: 0, failed: 0, skipped: 0, flyFails: 0, hookCalls: 0, hookFails: 0, mapTrips: 0, mapRecords: 0, banked: 0, planted: 0, torched: 0, fights: 0, kills: 0, climbs: 0, shaftEntryY: null, shelters: 0, rescues: 0, airGlitches: 0, claims: 0, byName: {}, startedAt: 0 }
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
  // (v0.62.0) the PRE-WALK hazard veto: digShaft's in-place guard refuses a wet
  // column only AFTER the walk is paid (run59: 42x 'refusing this column' = 42
  // walks to water the ledger already knew about). Filtering candidates at
  // SELECTION time keeps the walk in the pocket - and with the shared ledger
  // another bot's rescue vets the target for the whole fleet. This is a veto,
  // never a map prune: far/unloaded chunks must not lose their map entries here.
  const wetTrip = pos => waterHazards.near(pos) != null
  function mapTargetFor (names, { maxDistance = 96, verify = true } = {}) {
    if (!map) return null
    // verify=true deletes entries the current chunks can no longer confirm - good
    // for nearby mining targets, harmful for far ones (blockAt nulls unloaded
    // chunks, so a query with verify would WIPE the whole far bucket)
    const verifyWith = verify ? (p => bot.blockAt(p)) : null
    // (v0.15.0) claim-aware choice: with a fleet ClaimBoard, k candidates per name are
    // scored distance + penalty for positions another bot is already walking to - the
    // measured "19 bots -> one beach" convergence (38x unreachable, sand=0 @ sand=110).
    if (board) {
      return chooseTarget({
        map,
        names,
        from: bot.entity.position,
        board,
        owner: username,
        maxDistance,
        verifyWith,
        skip: pos => failedTrips.has(`${pos.x},${pos.y},${pos.z}`) || wetTrip(pos)
      })
    }
    let best = null
    for (const name of names) {
      const pos = map.nearest(name, bot.entity.position, { maxDistance, verifyWith })
      if (pos && failedTrips.has(`${pos.x},${pos.y},${pos.z}`)) continue
      if (pos && wetTrip(pos)) continue
      if (pos && (!best || pos.distanceTo(bot.entity.position) < best.pos.distanceTo(bot.entity.position))) best = { name, pos }
    }
    return best
  }

  // (v0.15.0) commit to a trip target: register the claim on the fleet board (shared
  // by reference inside this process) and optionally broadcast it to OTHER processes
  // (a scout in a second terminal). Claims are TTL-bound (CLAIM_TTL_MS), so a bot that
  // dies mid-trip never leaves a permanent hole - no explicit release anywhere.
  function claimTrip (target) {
    if (!board || !target?.pos) return
    board.claim(username, target.pos)
    stats.claims++
    if (broadcastClaim) {
      try { broadcastClaim(target.pos) } catch { /* chat must never kill the trip */ }
    }
  }

  bot.on('error', e => log(`${tag} error: ${e.message}`))
  // socket-level failures (EPIPE when the server closes the connection) must not kill the run
  bot._client?.on?.('error', e => log(`${tag} socket error: ${e.message}`))
  bot.on('kicked', r => log(`${tag} KICKED: ${typeof r === 'string' ? r : JSON.stringify(r)}`))
  bot.on('end', r => log(`${tag} disconnected (${r})`))
  // (v0.50.0) DEATH-CAUSE REPORTER: fleet 35610870878 measured 4 mining-accident
  // deaths with UNLOGGED causes (F1/F18/F11) - a dead bot's pocket scatters where
  // it fell, so the cause names the leak. Every hp drop primes lastHarm (the
  // nearest hostile in range, or drowning/fall/env when nothing hostile is near);
  // the death line prints the freshest harm within 6 s.
  let lastHarm = null
  let lastHp = 20
  // (v0.201.0) THE RE-LOOT STATE - run63-mined (fleet 36212235363) measured
  // ~227u of named death drops (the v0.199.0 line) SURVIVING PAST THE RUN'S
  // END (the deaths landed t-176s/t-131s, despawn is 300s) - nobody walked
  // back, the stacks died with the world reset, and the ledger's
  // unaccounted=0 hid the loss inside the conversion formula's slack. The
  // death handler records WHERE and WHEN (the same guarded read the
  // v0.84.0 death-spot memory uses), the runner's work loop turns the
  // record into ONE planned walk via relootPlan (src/lib/reloot.mjs - the
  // six named fences). Per-instance state: a reconnect rebuilds the miner
  // and the memory dies with the old bot object - the common death ->
  // respawn path (same bot object) is the class this state serves.
  let lastDeath = null
  // (v0.117.0) THE AUTHORITATIVE DEATH CAUSE - run102 (35889087936) mined
  // 'fall/env' x3 while the server told the truth: 'F3 drowned', 'F13
  // drowned', 'F18 suffocated in a wall'. The lastHarm inferrer below cannot
  // see suffocation (no hostile, dry air) and misses the drowning read when
  // the oxygen bar is stale at the killing tick - two runs of death maps were
  // mined on that polluted fallback. The server BROADCASTS every death as a
  // system chat line: this listener grabs OUR line (parseDeathMessage ignores
  // every other name) and the death handler prints it as 'server: <verb>' -
  // the inference stays alongside as the fallback, never silently trusted.
  let serverDeath = null
  bot.on('message', (msg) => {
    try {
      const text = typeof msg === 'string' ? msg : (msg?.toString?.() ?? null)
      const p = parseDeathMessage(text, bot.username ?? null)
      if (p) serverDeath = { ...p, at: Date.now() }
    } catch { /* a chat listener must never throw */ }
  })
  bot.on('health', () => {
    try {
      const hp = bot.health
      if (bot.entity && Number.isFinite(hp) && hp < lastHp) {
        const h = nearestHostile({ range: 16 })
        // (v0.64.0) oxygenInDomain gate: the -1 reset sentinel arrives right
        // after a rescue/respawn (run60, 395x) - a bot killed by fall/env in
        // that window was labeled 'drowning' (-1 <= 0) and skewed the death
        // map that drives the whole water program. Only a REAL bar 0 counts.
        const o2 = bot.oxygenLevel
        const drowning = oxygenInDomain(o2) && o2 <= 0
        lastHarm = {
          name: h ? h.name : (drowning ? 'drowning' : 'fall/env'),
          dist: h ? h.dist : 0,
          at: Date.now(),
          pos: bot.entity.position.floored()
        }
      }
      if (Number.isFinite(hp)) lastHp = hp
    } catch { /* the sentry must never throw */ }
  })
  bot.on('death', () => {
    const fresh = lastHarm && Date.now() - lastHarm.at < 6000
    const inferred = fresh
      ? `${lastHarm.name}${lastHarm.dist ? `@${lastHarm.dist.toFixed(1)}` : ''} (${Math.round((Date.now() - lastHarm.at) / 100) / 10}s before death at [${lastHarm.pos.x},${lastHarm.pos.y},${lastHarm.pos.z}])`
      : `unknown (no hp drop in the last 6s${bot.entity ? ` at [${bot.entity.position.floored().x},${bot.entity.position.floored().y},${bot.entity.position.floored().z}]` : ''})`
    // (v0.117.0) the server's own death line outranks the inference when it
    // arrived for THIS bot within 6s - the run102 lesson ('fall/env' x3 where
    // the server said drowned/drowned/suffocated). Both shapes print so the
    // next mine can still audit the inference against the truth.
    const authFresh = serverDeath && Date.now() - serverDeath.at < 6000
    // (v0.136.0) THE INFERENCE VERDICT: the annotation lie gets named in the
    // line - four mines re-adjudicated 'kind=drown | inferred: zombie@12.0'
    // by hand. The server kind stays the authority (v0.117.0); the verdict
    // only labels the relationship so the decode reads it, not re-derives it.
    const VERDICT_NOTE = {
      corroborates: 'corroborates the server verdict',
      contradicts: 'CONTRADICTS the server verdict - the nearest harm was not the killer (the server kind stays the authority)',
      blind: 'is blind to this kind - the hint is noise by construction (the server kind stays the authority)'
    }
    let cause = inferred
    if (authFresh) {
      const verdict = inferenceVerdict(serverDeath, lastHarm ? lastHarm.name : null)
      const note = VERDICT_NOTE[verdict]
      cause = `server: ${serverDeath.verb} [kind=${serverDeath.kind}${serverDeath.attacker ? ` by ${serverDeath.attacker}` : ''}] | inferred: ${inferred}`
      if (note) cause += ` [the inference ${note}]`
    }
    log(`${tag} died - respawning (cause: ${cause})`)
    stats.deaths = (stats.deaths ?? 0) + 1
    // (v0.199.0) THE DEATH-DROP SNAPSHOT: run84 (fleet 36207216784) measured
    // unaccounted=1479 with the fleet pocket falling 2453u -> 1509u across the
    // 6-death window - a death scatters the pocket, the death-spot memory
    // steers every bot away from the corpse, the stack despawns unattributed.
    // One read WHILE the inventory still lists, riding the 'death drop' filter
    // key. Guarded: the snapshot must never break the respawn path.
    try {
      const drop = deathDropLine({ tag, pos: bot.entity?.position, items: bot.inventory?.items?.() ?? null })
      if (drop) log(drop)
    } catch { /* the drop snapshot must never break a respawn */ }
    // (v0.84.0) THE DEATH-SPOT MEMORY: run77 measured >= 8 'fall/env' deaths
    // clustered in one flooded quarry - and every dead bot left NO memory
    // behind, so the next bot walked the same rim into the same pit. The
    // death spot joins the shared hazard ledger (the zones tier turns
    // clustered records into a walk-veto envelope fleet-wide), and it is
    // broadcast like a rescue cell. Guarded: a junk corpse position must
    // never break the respawn path.
    try {
      const dp = bot.entity?.position
      if (dp && Number.isFinite(dp.x) && Number.isFinite(dp.y) && Number.isFinite(dp.z)) {
        const live = waterHazards.record({ x: dp.x, y: dp.y, z: dp.z })
        log(`${tag} water: death spot memorized as a hazard at [${Math.floor(dp.x)},${Math.floor(dp.y)},${Math.floor(dp.z)}] (${live} live, fleet-wide)`)
        // (v0.201.0) the re-loot record rides the SAME guarded read: the
        // spot is honest (the entity position at death), the clock is the
        // death moment. The respawned bot's ONE walk back is the runner's
        // decision (relootPlan's fences), never this handler's - a death
        // handler must never walk.
        lastDeath = { spot: { x: dp.x, y: dp.y, z: dp.z }, at: Date.now(), attempted: false }
        if (broadcastHazard) { try { broadcastHazard({ x: dp.x, y: dp.y, z: dp.z }) } catch { /* chat never kills a respawn */ } }
      }
    } catch { /* a death handler must never throw */ }
    lastHarm = null
    lastHp = 20
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
  // (v0.51.0) THE WATER-FLEE CURE: fleet 35610870878 measured F13 dying to a
  // drowned flee-chase at hp 4.0 - the raw away-vector ran DEEPER into the
  // water column the drowned owns. Wet feet + an aquatic threat -> the hop
  // target is the nearest SHORE cell (on land the drowned walks at zombie
  // speed); a land threat keeps the away-vector (the shore may be behind it).
  async function runAway (threat, reason, { kite = false } = {}) {
    const deadline = Date.now() + 12000
    // (v0.94.0) THE FLEE-DRY VETO's ledger reader - the same fleet death memory
    // the wetTrip walk-veto and digShaft's guard read; defined per-call so the
    // closure resolves after the factory's full setup (the wetTrip precedent).
    const fleeHazardNear = pos => waterHazards.near(pos)
    for (let hop = 0; hop < 3 && bot.entity && Date.now() < deadline; hop++) {
      // (v0.59.0) YIELD TO THE RESCUE, every hop: the check at defendSelf entry
      // cannot see a rescue that STARTS mid-flee. Fleet 35657683920 measured the
      // exact interleave - F1's rescue fired at oxygen 0, the sentry's flee then
      // issued a pathfinder shore-hop INTO the drowning swim (two control owners:
      // the original drowning shape, "pathfinder goals fight every manual control
      // state"). The rescue's raw swim IS the escape - on shore the fight re-verdicts.
      if (swimming || bot._waterRescue) return
      let goal = null
      // (v0.94.0) hoisted above the try: the kite and radial branches judge
      // their hop targets through the same live-world reader.
      const here = bot.entity.position.floored()
      const sample = (x, y, z) => bot.blockAt(new Vec3(x, y, z))?.name ?? null
      try {
        const feetB = bot.blockAt(here)
        const headB = bot.blockAt(here.offset(0, 1, 0))
        const feetWet = feetB ? isWaterName(feetB.name) : false
        const headWet = headB ? isWaterName(headB.name) : false
        if (feetWet || headWet) {
          const shore = shoreDirection(sample, here)
          const plan = fleePlan({ threatName: threat.name, feetWet, headWet, shore })
          if (plan.kind === 'shore') {
            // (v0.59.0) verify the shore cell against the LIVE world before the
            // hop commits: the ring scan is one snapshot, and F1's '(0,2 step 1)'
            // hop died in place - the cell was gone (or never) a real shore. A
            // failed verification falls through to the away-vector below.
            const cell = { x: here.x + plan.dx, y: here.y + plan.step, z: here.z + plan.dz }
            if (verifyShoreCell(sample, cell)) {
              goal = new goals.GoalBlock(cell.x, cell.y, cell.z)
              log(`${tag} combat: flee toward shore (${plan.dx},${plan.dz} step ${plan.step}) vs ${threat.name} (${reason})`)
            }
          }
        }
      } catch { /* unreadable world -> the away-vector below */ }
      if (!goal && kite) {
        // (v0.77.0) THE KITE HOP: same hop machinery, different bearing - toward
        // the yard (the spawn-origin fleet hub) instead of radially away. A
        // same-speed chaser makes the radial criterion (dist > 14) unreachable;
        // kiting keeps the distance but moves the fight to the armed pack.
        // junk anchor / already-at-the-yard -> null -> the radial hop below.
        const yard = yardAnchor()
        const hopT = yard ? kiteHopTarget({ bx: bot.entity.position.x, bz: bot.entity.position.z, yx: yard.x, yz: yard.z }) : null
        if (hopT) {
          // (v0.94.0) THE FLEE-DRY VETO: the yard bearing crosses whatever lies
          // between - the flooded quarry included (run80's F5 was released
          // surface-safe and the flee verdict walked it in - drowned@7.9). The
          // hop target must be water-free by the live world AND outside the
          // hazard ledger; a blocked bearing rotates a quarter turn before the
          // original stands (a chasing mob beats a standstill).
          const v = vettedFleeTargetAbs({ sample, hazardNear: fleeHazardNear, ax: bot.entity.position.x, ay: here.y, az: bot.entity.position.z, tx: hopT.x, tz: hopT.z })
          const fx = v ? v.x : hopT.x
          const fz = v ? v.z : hopT.z
          if (v && v.turns) log(`${tag} combat: flee bearing rotated ${v.turns * 90}deg (water/hazard vetoes the yard target) vs ${threat.name} (${reason})`)
          goal = new goals.GoalXZ(fx, fz)
          log(`${tag} combat: flee kite hop toward the yard (${fx.toFixed(0)},${fz.toFixed(0)}) vs ${threat.name} (${reason})`)
        }
      }
      if (!goal) {
        const dx = bot.entity.position.x - threat.entity.position.x
        const dz = bot.entity.position.z - threat.entity.position.z
        const len = Math.hypot(dx, dz) || 1
        // (v0.94.0) the away-vector is judged too: the raw target must be
        // water-free by the live world AND outside the hazard ledger before
        // the hop commits; a blocked bearing rotates a quarter turn (order
        // 0/+90/-90/180) before the original stands.
        const raw = { x: bot.entity.position.x + (dx / len) * 12, z: bot.entity.position.z + (dz / len) * 12 }
        const v = vettedFleeTargetAbs({ sample, hazardNear: fleeHazardNear, ax: bot.entity.position.x, ay: here.y, az: bot.entity.position.z, tx: raw.x, tz: raw.z })
        if (v && v.turns) log(`${tag} combat: flee bearing rotated ${v.turns * 90}deg (water/hazard vetoes the away target) vs ${threat.name} (${reason})`)
        const fx = v ? v.x : raw.x
        const fz = v ? v.z : raw.z
        goal = new goals.GoalXZ(fx, fz)
      }
      try { await gotoSafe(bot, goal, { timeoutMs: 5000, label: 'combat flee' }) } catch { /* hop again from where we are */ }
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

  // (v0.137.0) THE WATER-MELEE LENS's live read: is the bot STANDING in water
  // right now (the feet cell)? The F11 lesson: the land flee line fired four
  // rounds too late inside a drowned trade. Junk-safe by the lens contract: an
  // unreadable block reads DRY - the lens must never lift the yield line on a
  // guess.
  function inWaterHere () {
    try {
      const b = bot.blockAt(bot.entity.position)
      return isWaterName(b && b.name) === true
    } catch { return false }
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
    // (v0.47.0) the MELEE gate: a pickaxe-only bot is naked for the shelter
    // policy - pickWeapon counts pickaxes/shovels/hoes as weapons, and fleet
    // 35599777909 measured 17 deaths with shelters=0 because every miner held
    // a pickaxe, so armed=true sealed this branch BY CONSTRUCTION. A 3-dmg
    // pickaxe loses the following fight the same way the measured 1-2 dmg
    // fists do; only a sword/axe (4-9 dmg) counts as armed here.
    const armed = !!pickMeleeWeapon(inventoryItems(bot))
    const night = isNight(bot.time?.timeOfDay)
    // (v0.106.0) the losing-fight inputs: the armed refusal keeps the v0.67.0
    // premise (the sword fight is the winner) only for fights that CAN be won.
    // run94 (35841864758) mined the end-phase zombie strip eating five armed
    // bots at hp 6-7 through this exact skip line; the wall beats the lost
    // fight (the policy + boundaries live in shelter.mjs losingFight). Junk
    // hp (bot.health unread) keeps the legacy refusal - never shelter on a
    // guess. countHostiles is the same read the fight verdict consumes.
    // (v0.112.0) THE POISON LENS: hpNow is the health the NEXT seconds still
    // own - a live poison effect (the run99 witch front) charges its expected
    // drain (POISON_HP_BUDGET) against the gate before the bar physically
    // sinks. Junk health passes through null: the lens never shelters on a
    // guess, and the skip line names the lens state so the mine reads it.
    const poisonLens = isPoisoned(bot)
    const hpNow = effectiveHp({ health: bot.health ?? null, poisoned: poisonLens })
    const crowd = countHostiles()
    if (!threat || !shelterDue({ night, armed, threatDist: threat ? threat.dist : Infinity, hp: hpNow, attackers: crowd })) {
      log(`${tag} combat: shelter skip (night=${night} armed=${armed} hp=${hpNow ?? '?'} attackers=${crowd} poison=${poisonLens ? 'on' : 'off'} threat=${threat ? `${threat.name}@${threat.dist.toFixed(1)}` : 'none'})`)
      return false
    }
    // no seal material: (v0.50.0) EARN one instead of skipping - the measured
    // 10x 'shelter skip (no seal material)' class (fleet 35619512737; F18 x7)
    // is the full-pocket miner that cannot pick up its own dig drops; F3 then
    // died at no-seal (skeleton chase, hp 4.0). Free ONE slot with the cheapest
    // junk: the wall dug below respawns its block as a drop INSIDE pickup range
    // and sealWaitUnseal re-reads the inventory, so the fresh block seals the hole.
    if (!pickSealItem(inventoryItems(bot))) {
      // (v0.68.0) THE DIG-EARN BYPASS: a FREE slot replaces the toss - the
      // wall niche dig drops land inside pickup range and sealWaitUnseal
      // re-reads the inventory. run64 measured the old order refusing
      // tool-only pockets 12x ('nothing expendable to drop'): those pockets
      // have SLOTS, not junk. The wall loop digs only after a diggable wall
      // passes, so an open-field bot pays nothing for the bypass, and the
      // ring's own stock gate still reads the inventory honestly.
      const freeSlots = emptySlotCount(bot.inventory.slots.slice(9, 45))
      const canEarn = !!threat && earnSealDue({ threatDist: threat.dist })
      if (freeSlots > 0) {
        log(`${tag} combat: shelter dig-earn: ${freeSlots} free slot(s), the dig supplies the seal`)
      } else if (!canEarn) {
        log(`${tag} combat: shelter skip (no seal material, ${threat ? `threat@${threat.dist.toFixed(1)} too close to earn` : 'no threat'})`)
        return false
      }
      const junk = pickJunkToDrop(inventoryItems(bot))
      if (!junk && freeSlots <= 0) {
        log(`${tag} combat: shelter skip (no seal material, nothing expendable to drop)`)
        return false
      }
      if (junk) try {
        const item = bot.inventory.items().find(i => i.name === junk.name)
        if (item) {
          await bot.toss(item.type, item.metadata ?? 0, 1)
          log(`${tag} combat: shelter earn: dropped 1 ${junk.name} for a seal slot`)
        } else {
          log(`${tag} combat: shelter skip (no seal material, ${junk.name} vanished)`) 
          return false
        }
      } catch (e) {
        log(`${tag} combat: shelter skip (no seal material, toss failed: ${e.message})`)
        return false
      }
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
    // pillar-up climbing, which this repo refuses on purpose.
    // (v0.59.0) The silent fall-through is gone: run58 (fleet 35657683920)
    // measured SIX 'shelter try' lines with NOTHING after them - the wall
    // loop found no diggable wall and the flee just took over. The open
    // field now names its verdict and tries variant 3: the RING.
    const threatStill = nearestHostile()
    log(`${tag} combat: shelter skip (open field: no diggable wall, ${threatStill ? `${threatStill.name}@${threatStill.dist.toFixed(1)}` : 'threat gone'})`)
    try { return await tryRingShelter(reason) } catch (e) {
      log(`${tag} combat: shelter skip (open field: ring failed: ${e.message})`)
      return false
    }
  }

  // variant 3 (v0.59.0): the OPEN-FIELD RING. Build a 2-high ring of blocks in
  // the four lateral cells around the bot's own cell, wait the threat out, dig
  // one column open and step out. Every placement has a solid face-neighbour
  // in open field: the ground below the foot cell (face up), then the fresh
  // foot block below the head cell (face up). The policy (pure, in
  // shelter.mjs) demands ALL four sides buildable before the first placement
  // (one gap is a walk-in door), the sides away from the threat first, and
  // never waits behind an incomplete ring. Best-effort: any failure falls
  // back to the flee (and a half-ring still slows the chase).
  async function tryRingShelter (reason) {
    const threat = nearestHostile()
    if (!threat || !bot.entity) return false
    const here = bot.entity.position.floored()
    // (v0.140.0) THE ARROW WALL MODE: a RANGED threat (skeleton/stray/bogged
    // class, the witch excluded - her splash band needs the melee, not a
    // wall) is refused by LOS, not by walking, so the full ring's all-4-sides
    // gate is the wrong contract here: run554 measured F2 dying behind
    // 'ring incomplete 4/8' and F6 behind 'ring not buildable [Bo -o -o -o]'
    // - uneven ground refused the cage and the shooter out-shot the flee.
    // In ranged mode the THREAT side's 2 cells (the arrow wall) are the only
    // gate; the other three sides build as bonus from leftover stock.
    const ranged = RANGED_HOSTILES.has(threat.name) && threat.name !== 'witch'
    const threatIdx = ranged ? ringThreatSideIndex({ threatDx: threat.entity.position.x - here.x, threatDz: threat.entity.position.z - here.z }) : -1
    // read the four lateral sides: foot/head cell class + the ground under
    // the foot cell (the foot placement's reference) + hostile occupancy
    const hostileIn = (x, y, z) => {
      for (const e of Object.values(bot.entities)) {
        if (!e || e === bot.entity || !isHostileEntity(e) || !e.position) continue
        const c = e.position.floored()
        if (c.x === x && c.y === y && c.z === z) return true
      }
      return false
    }
    const readClass = (x, y, z) => {
      if (hostileIn(x, y, z)) return 'blocked'
      try {
        const b = bot.blockAt(new Vec3(x, y, z))
        if (!b) return 'blocked'
        return b.boundingBox === 'empty' ? 'empty' : 'solid'
      } catch { return 'blocked' }
    }
    const sides = RING_SIDE_NORMALS.map(n => {
      const fx = here.x + n.dx
      const fz = here.z + n.dz
      let groundSolid = false
      try {
        const g = bot.blockAt(new Vec3(fx, here.y - 1, fz))
        groundSolid = !!(g && g.boundingBox !== 'empty')
      } catch { groundSolid = false }
      return {
        foot: readClass(fx, here.y, fz),
        head: readClass(fx, here.y + 1, fz),
        groundSolid,
        fx,
        fz
      }
    })
    if (!ringFeasible(sides)) {
      const mark = s => `${s.foot === 'solid' ? 'B' : s.foot === 'empty' ? (s.groundSolid ? 'o' : '-') : 'x'}${s.head === 'solid' ? 'B' : s.head === 'empty' ? 'o' : 'x'}`
      // (v0.140.0) ranged mode: the full cage may be refused, the ARROW WALL
      // still has to be buildable - otherwise the same honest skip line
      if (!ranged || !ringSideBuildable(sides[threatIdx])) {
        log(`${tag} combat: shelter skip (open field: ring not buildable [${sides.map(mark).join(' ')}]${ranged ? ', no arrow wall either' : ''} vs ${threat.name}@${threat.dist.toFixed(1)})`)
        return false
      }
      log(`${tag} combat: shelter ring ranged mode: the full ring is refused, the arrow wall owns it vs ${threat.name}@${threat.dist.toFixed(1)}`)
    }
    // (v0.91.0) THE HONEST STOCK GATE: compare the held blocks to the REAL
    // need - ringBlocksNeeded counts only the cells the terrain leaves empty,
    // every natural solid cell (a boulder, a trunk, a wall) is a free cell.
    // run80 measured the old worst-case gate refusing 'need 8 wall blocks,
    // have 4' BEFORE the terrain was read: a bot standing against terrain
    // that already supplies 4 cells could seal completely with its 4 blocks,
    // and the refusal sent it into the measured mob death instead.
    // (v0.140.0) ranged mode gates on the ARROW WALL's need (0..2 cells), not
    // the full ring's - the wall is what must stand, the bonus sides build
    // from whatever stock is left after it.
    const needed = ranged ? ringRangedNeeded(sides, threatIdx) : ringBlocksNeeded(sides)
    let stock = countSealBlocks(inventoryItems(bot))
    if (stock < needed) {
      // (v0.91.0) THE RING DIG-EARN: the wall variant has earned its seal
      // since v0.50.0 (the dig supplies the seal) - the ring earns the
      // deficit out of the grounds under ALREADY-SOLID foot cells. That side
      // stays closed at foot level no matter what its ground reads
      // (ringSideBuildable consults groundSolid only for empty feet), so the
      // dig can never break the ring it feeds; empty-foot grounds are never
      // touched (digging there removes the foot placement's own reference).
      const earnDue = threat.dist > 0 && threat.dist <= EARN_SEAL_MAX_THREAT_DIST
      if (!earnDue) {
        log(`${tag} combat: shelter skip (open field: ring stock ${stock}/${needed}, threat@${threat.dist.toFixed(1)} beyond the earn edge - the flee wins)`)
        return false
      }
      const solidFootSides = sides.filter(s => s.foot === 'solid')
      const diggableGrounds = solidFootSides.map(s => {
        try { const g = bot.blockAt(new Vec3(s.fx, here.y - 1, s.fz)); return g ? g.name : null } catch { return null }
      })
      const supply = ringDigEarnSupply({ stock, needed, diggableGrounds })
      if (supply <= 0) {
        log(`${tag} combat: shelter skip (open field: ring stock ${stock}/${needed}, ground earns nothing)`)
        return false
      }
      // the v0.68.0 free-slot lesson: a drop needs somewhere to land - a
      // free slot first, the cheapest junk toss second, the honest refusal last
      let freeSlots = emptySlotCount(bot.inventory.slots.slice(9, 45))
      if (freeSlots <= 0) {
        const junk = pickJunkToDrop(inventoryItems(bot))
        if (!junk) {
          log(`${tag} combat: shelter skip (open field: ring stock ${stock}/${needed}, no slot, nothing expendable)`)
          return false
        }
        try {
          const item = bot.inventory.items().find(i => i.name === junk.name)
          if (!item) throw new Error(`${junk.name} vanished`)
          await bot.toss(item.type, item.metadata ?? 0, 1)
          freeSlots = 1
        } catch (e) {
          log(`${tag} combat: shelter skip (open field: ring earn toss failed: ${e.message})`)
          return false
        }
      }
      let earned = 0
      for (const s of solidFootSides) {
        if (earned >= supply) break
        try {
          const g = bot.blockAt(new Vec3(s.fx, here.y - 1, s.fz))
          if (!g || !RING_DIG_EARN_OK.has(g.name)) continue
          await bot.fastDig(g)
          earned++
        } catch { continue }
      }
      stock = countSealBlocks(inventoryItems(bot))
      if (stock < needed) {
        log(`${tag} combat: shelter skip (open field: ring stock ${stock}/${needed} after digging ${earned})`)
        return false
      }
      log(`${tag} combat: shelter ring dig-earn: dug ${earned}, stock ${stock}/${needed}`)
    }
    const baseOrder = ringSideOrder({ threatDx: threat.entity.position.x - here.x, threatDz: threat.entity.position.z - here.z })
    // (v0.140.0) ranged mode: the THREAT side builds FIRST (the arrow wall
    // blocks the volley before the bonus sides spend stock or time on it);
    // melee keeps the away-first doctrine (the risky placements last).
    const order = ranged ? [threatIdx, ...baseOrder.filter(i => i !== threatIdx)] : baseOrder
    log(`${tag} combat: shelter ring try vs ${threat.name} (dist ${threat.dist.toFixed(1)}, ${order.map(i => ['+x', '-x', '+z', '-z'][i]).join('')} first, ${ranged ? 'arrow wall' : 'full ring'}, ${reason})`)
    // the build: per side, foot then head; re-pick the seal item each
    // placement (a stack that runs out mid-build hands over to the next
    // priority block); the only reference needed is the ground below the foot
    // cell, then the fresh foot block itself
    for (const si of order) {
      const s = sides[si]
      for (const y of [here.y, here.y + 1]) {
        if (readClass(s.fx, y, s.fz) === 'solid') continue // pre-walled cell
        const refY = y === here.y ? here.y - 1 : here.y
        const ref = bot.blockAt(new Vec3(s.fx, refY, s.fz))
        if (!ref || ref.boundingBox === 'empty') break // lost the reference
        // (v0.68.0) THE RING PATIENCE: the seal's own pacing (sealWaitUnseal:
        // 2 rounds x 6 ticks) replaces the single 4-tick retry - run64
        // measured a mob grazing the build zone for longer than 4 ticks
        // walking the build dead ('ring incomplete 0/8..2/8' x3). Each round
        // re-picks the seal item (stock handover) and verifies the block
        // actually landed before the cell counts as done.
        let placed = false
        for (let round = 0; round < RING_PLACE_ROUNDS && !placed; round++) {
          if (round > 0) await bot.waitForTicks(RING_RETRY_TICKS)
          const sealName = pickSealItem(inventoryItems(bot))?.name
          const item = sealName ? bot.inventory.items().find(i => i.name === sealName) : null
          if (!item) break // stock ran dry mid-build
          try {
            await bot.equip(item, 'hand')
            await bot.placeBlock(ref, new Vec3(0, 1, 0))
            await bot.waitForTicks(2)
            placed = readClass(s.fx, y, s.fz) === 'solid'
          } catch { /* next round: a grazing mob moves off */ }
        }
        if (!placed) break // the cell stays contested - an incomplete ring never waits
      }
    }
    // the verify: every one of the 8 cells must be solid - an incomplete ring
    // NEVER waits (a gap is a door). (v0.140.0) ranged mode verifies the
    // ARROW WALL only (both threat-side cells): the shooter is beaten by the
    // wall's line-of-sight break, not by a walk-proof cage.
    let solid = 0
    for (const s of sides) {
      for (const y of [here.y, here.y + 1]) {
        if (readClass(s.fx, y, s.fz) === 'solid') solid++
      }
    }
    if (ranged) {
      const ts = sides[threatIdx]
      const wallFoot = readClass(ts.fx, here.y, ts.fz)
      const wallHead = readClass(ts.fx, here.y + 1, ts.fz)
      if (!ringRangedEnough({ footClass: wallFoot, headClass: wallHead })) {
        log(`${tag} combat: shelter skip (open field: arrow wall incomplete [${wallFoot}/${wallHead}] vs ${threat.name}@${threat.dist.toFixed(1)})`)
        return false
      }
    } else if (solid < RING_BLOCKS_NEEDED) {
      log(`${tag} combat: shelter skip (open field: ring incomplete ${solid}/${RING_BLOCKS_NEEDED})`)
      return false
    }
    stats.shelters++
    log(`${tag} combat: sheltering from ${threat.name} (${ranged ? `arrow wall, cells ${solid}/${RING_BLOCKS_NEEDED}` : `ring ${solid}/${RING_BLOCKS_NEEDED}`}, ${reason})`)
    // the wait: the same round/cap the dig-in seal uses
    const started = Date.now()
    while (bot.entity && Date.now() - started < SHELTER_MAX_MS) {
      const cur = nearestHostile()
      if (!cur || cur.dist > SHELTER_SAFE_DIST) break
      await bot.waitForTicks(Math.max(1, Math.ceil(SHELTER_ROUND_MS / 50)))
    }
    // unseal: dig ONE column open (both cells - a 1-high gap does not pass a
    // 1.8-tall bot) and raw step out (the tunnel() lesson: one straight block
    // of movement needs no A*)
    const outSide = sides.find(s => readClass(s.fx, here.y, s.fz) === 'solid')
    if (outSide) {
      try {
        for (const y of [here.y, here.y + 1]) {
          if (readClass(outSide.fx, y, outSide.fz) !== 'solid') continue
          const b = bot.blockAt(new Vec3(outSide.fx, y, outSide.fz))
          if (b && b.type !== 0) await bot.fastDig(b)
        }
      } catch { /* the dig drop may seal us further - the step decides */ }
      try {
        await bot.lookAt(new Vec3(outSide.fx + 0.5, here.y + 0.5, outSide.fz + 0.5), true)
        bot.setControlState('forward', true)
        const outDeadline = Date.now() + 2000
        const door = new Vec3(outSide.fx, here.y, outSide.fz)
        while (bot.entity && bot.entity.position.floored().distanceTo(door) > 0.6 && Date.now() < outDeadline) {
          await bot.waitForTicks(2)
        }
        bot.setControlState('forward', false)
      } catch { /* boxed in is fine - the next dig continues the job */ }
    }
    return true
  }

  let defending = false
  // (v0.77.0) THE FLEE STALEMATE LEDGER: the threat distance at each flee
  // START (most recent last, capped). fleeResponse reads it: the last 3
  // samples within 1.5 blocks of each other prove the hops buy nothing ->
  // the kite. Cleared on a genuine escape (threat gone, or dist > 20 after
  // an episode) - the breaker never latches on a chase that was won.
  const fleeStartDists = []
  // (v0.140.0) THE RANGED-FIGHT COOLDOWN ledger: mob entity id -> the
  // wall-clock until-timestamp the mob's fight lane stays closed. Armed ONLY
  // by a chase-ceiling break vs a non-witch ranged threat (the skeleton
  // cascade - every reopen walked the bot back into the volley); consulted
  // by every threatVerdict call site through rangedCdLive. Entries expire
  // naturally; the map is pruned when it grows past 24 (19 bots x a handful
  // of shooters is the worst case, the cap just bounds a pathological run).
  const rangedCooldowns = new Map()
  function armRangedCooldown (entityId) {
    if (!Number.isFinite(entityId)) return
    const until = rangedCooldownUntil({ now: Date.now() })
    if (until == null) return
    rangedCooldowns.set(entityId, until)
    if (rangedCooldowns.size > 24) {
      for (const [k, v] of rangedCooldowns) {
        if (!rangedCooldownLive({ now: Date.now(), until: v })) rangedCooldowns.delete(k)
      }
    }
  }
  function rangedCdLive (entityId) {
    if (!Number.isFinite(entityId)) return false
    return rangedCooldownLive({ now: Date.now(), until: rangedCooldowns.get(entityId) })
  }
  // The yard anchor: the world spawn point (setup-yard.mjs builds the fleet
  // hub at the spawn origin). Junk-safe: a missing read returns null and the
  // kite dissolves into the plain radial flee.
  function yardAnchor () {
    try {
      const p = bot.game?.spawnPoint ?? bot.spawnPoint ?? null
      if (p && Number.isFinite(p.x) && Number.isFinite(p.z)) return { x: p.x, z: p.z }
    } catch { /* junk spawn read -> null */ }
    return null
  }
  async function defendSelf (reason = 'guard') {
    if (defending) return { action: 'busy' }
    if (swimming) return { action: 'busy' } // drowning outranks fighting: the rescue owns the controls
    const threat = nearestHostile()
    if (!threat) {
      fleeStartDists.length = 0 // the threat is gone: a fresh ledger for the next chase
      return { action: 'none' }
    }
    const armed = !!pickWeapon(inventoryItems(bot))
    const verdict = threatVerdict({ name: threat.name, dist: threat.dist, hp: bot.health ?? 20, attackers: countHostiles(), dark: isDarkHere(), armed, poisoned: isPoisoned(bot), inWater: inWaterHere(), cooldown: rangedCdLive(threat.entity?.id) })
    if (verdict === 'ignore') return { action: 'ignore', threat: threat.name }
    defending = true
    stats.fights++
    try {
      if (verdict === 'flee') {
        // UNARMED AT NIGHT: the chase is lost and the following fight is lost
        // too - seal in instead when the terrain allows (the 7-death streak)
        fleeStartDists.push(threat.dist)
        if (fleeStartDists.length > 6) fleeStartDists.shift()
        try {
          if (await tryShelter(reason)) return { action: 'shelter', threat: threat.name }
        } catch { /* shelter is best-effort - fall back to the flee */ }
        // (v0.77.0) THE STALEMATE SWITCH: stuck distances -> kite to the yard
        // (run73: F6 x65 + F18 x54 flee lines at dist ~4.0 - the radial hops
        // bought ZERO blocks for the whole run)
        const response = fleeResponse({ startDists: fleeStartDists })
        log(`${tag} combat: fleeing ${threat.name} (dist ${threat.dist.toFixed(1)}, hp ${(bot.health ?? 20).toFixed(1)}, ${countHostiles()} nearby, ${reason}${response === 'kite' ? ', kite' : ''})`)
        await runAway(threat, reason, { kite: response === 'kite' })
        await recover()
        // a genuine escape clears the ledger; a stuck chase keeps it armed
        const after = nearestHostile()
        if (!after || after.dist > 20) fleeStartDists.length = 0
        return { action: 'flee', threat: threat.name }
      }
      // (v0.68.0) THE PRE-FIGHT SHELTER: the FIGHT verdict never consulted
      // the shelter - run64 measured the melee-naked bot burning its 17-20 hp
      // window on the losing fist fight (v0.47.0: 17 hp -> 4.3 hp, zombie
      // alive) and re-verdicting into the shelter at hp 5 with the zombie at
      // 0.6-2.2, ranges the ring can never outbuild (ring 0/8, 2/8, 2/8
      // there). The wall variant WINS the close race (F10: sheltered at
      // 1.3). The shelter runs BEFORE the first swing for a bot without a
      // real melee weapon; armed bots skip it (the sword fight is the
      // winner, v0.67.0, and tryShelter refuses them anyway).
      if (!pickMeleeWeapon(inventoryItems(bot))) {
        try {
          if (await tryShelter(`${reason} pre-fight`)) return { action: 'shelter', threat: threat.name }
        } catch { /* best-effort - fight with what we hold */ }
      }
      log(`${tag} combat: fighting ${threat.name} (dist ${threat.dist.toFixed(1)}, hp ${(bot.health ?? 20).toFixed(1)}, ${countHostiles()} nearby, ${reason})`)
      const weapon = pickWeapon(inventoryItems(bot))
      if (weapon) { try { await bot.equip(weapon, 'hand') } catch { /* fists are still something */ } }
      // (v0.135.0) THE FIGHT EPISODE INSTRUMENT - run550's mob front (6 of 8
      // deaths) ends its losing fights SILENTLY: the decode sees the start
      // line and the death line but cannot answer armed-vs-naked (the v0.47.0
      // question), how much hp the fight traded, or how long it dragged. The
      // episode now ends NAMED; the flee exits keep their own verdict lines.
      const startHp = bot.health ?? 20
      let swings = 0
      let rounds = 0
      let exit = 'deadline'
      // (v0.169.0) THE FIGHT FINISH deadline: the melee episode runs to the
      // kill - run78's fights cut at swing 5-6 with the mob at 1-3 hp alive
      // (the 10s bar) and the re-engage finished the wounded bot later. The
      // witch keeps her v0.115.0 drain contract (10s - the lens owns the
      // bar, the melee through the splash band is a holding action).
      const deadline = Date.now() + (threat.name === 'witch' ? 10000 : FIGHT_DEADLINE_MS)
      // (v0.115.0) the witch lane's per-episode chase budget: the blocks the
      // follow steps ACTUALLY walk vs the witch. The close through the splash
      // band spends it too - the first close is the affordable one, the retreat
      // is what the ceiling exists to stop.
      let witchChased = 0
      // (v0.137.0) THE MELEE BUDGET's walked ledger for the general lane (the
      // witch's own ledger stays above - independent tunables).
      let meleeChased = 0
      // (v0.169.0) THE FIGHT FINISH ledgers: the return windows spent waiting
      // out the CURRENT knockback (reset by every swing - a fresh swing starts
      // a fresh knockback), and the fought entity's id for the kill ledger.
      let meleeReturnWindows = 0
      let lastTargetId = null
      // (v0.174.0) THE DRIFT RE-ENGAGE ledger: the drift windows spent waiting
      // out 'ignore' verdicts on a melee threat that is still inside the drift
      // band (reset by every swing - a swing means the mob was in reach again).
      let driftWindows = 0
      while (bot.entity && Date.now() < deadline) {
        // (v0.169.0) THE KILL LEDGER: the fought entity left bot.entities -
        // the swing landed. The episode ends NAMED ('mob down') and the kill
        // is counted: run78's ten fight-end lines carried ZERO kills and the
        // mine could not even ask whether the mobs ever died. (v0.171.0) the
        // read is foughtEntityGone - mineflayer's entity index is a PLAIN
        // OBJECT, the Map-style .has() call threw on the first acquired
        // target and run74's forty episodes died silently after one round.
        if (foughtEntityGone(bot.entities, lastTargetId)) {
          exit = 'mob down'
          stats.kills++
          break
        }
        const cur = nearestHostile()
        if (!cur) { exit = 'threat gone'; break } // the threat died or wandered off
        if (cur.entity && Number.isFinite(cur.entity.id)) lastTargetId = cur.entity.id
        // per-round re-verdict (the first live run measured a bot fighting down
        // to 5 hp and then just standing there): the policy owns the decision
        const v = threatVerdict({ name: cur.name, dist: cur.dist, hp: bot.health ?? 20, attackers: countHostiles(), dark: isDarkHere(), armed: !!pickWeapon(inventoryItems(bot)), poisoned: isPoisoned(bot), inWater: inWaterHere(), cooldown: rangedCdLive(cur.entity?.id) })
        if (v === 'flee') {
          log(`${tag} combat: verdict flipped to flee vs ${cur.name} (hp ${(bot.health ?? 20).toFixed(1)})`)
          try { if (await tryShelter(`${reason} re-verdict`)) return { action: 'shelter', threat: cur.name } } catch { /* fall through to run */ }
          await runAway(cur, `${reason} re-verdict`)
          await recover()
          return { action: 'flee', threat: cur.name }
        }
        if (v === 'ignore') {
          // (v0.174.0) THE DRIFT RE-ENGAGE: a melee-lane threat still visible
          // inside the drift band (<= 8b) never ends the episode - run81's
          // drowned fragments ('verdict ignore' after 1-2 swings, the bot
          // walks, the swimmer returns, the return hits kill) are the class.
          // The wait is bounded (3 windows), the swing resets the ledger, the
          // excluded lanes (shooters/witch/creeper) keep the legacy byte.
          const drift = driftReturnPlan({ name: cur.name, dist: cur.dist, windows: driftWindows })
          if (drift === 'wait') {
            if (driftWindows === 0) log(`${tag} combat: drift return wait vs ${cur.name} (@${cur.dist.toFixed(1)}) - the swimmer always comes back`)
            driftWindows++
            await bot.waitForTicks(DRIFT_RETURN_TICKS)
            continue
          }
          exit = 'verdict ignore'
          break
        }
        if (cur.dist > 3.2) {
          // (v0.169.0) THE STAND-GROUND: a melee-lane threat out of reach
          // after a swing is KNOCKED BACK and walking home - run78's chase
          // ceiling fired on the knockback pursuit ('chased 7.7b, zombie
          // @3.4') and broke the episode at swing 3 with the mob alive. The
          // return is waited out (bounded windows), the close ladder is
          // spent only on a threat that is NOT coming back (kiting/stuck).
          // The witch lane and the shooters keep their own contracts.
          if (cur.name !== 'witch' && !RANGED_HOSTILES.has(cur.name)) {
            const plan = meleeReturnPlan({ dist: cur.dist, windows: meleeReturnWindows, swung: swings > 0 })
            if (plan === 'wait') {
              meleeReturnWindows++
              await bot.waitForTicks(MELEE_RETURN_WAIT_TICKS)
              continue
            }
          }
          if (cur.name === 'witch') {
            // (v0.115.0) THE WITCH LANE: the moving GoalFollow re-paths toward
            // a retreating witch every round - F1 died AT witch@8.7 inside that
            // churn and F10's drain finished the drag. The close goes to the
            // witch's STANDING cell (a snapshot, not a moving goal), the
            // cumulative walked chase is capped at WITCH_CHASE_CEILING per
            // episode, and a spent budget breaks the episode: the next health
            // drop reopens it with a fresh budget, the lens owns the drained bar.
            const step = witchFightStep({ dist: cur.dist, chased: witchChased })
            if (step === 'hold') {
              log(`${tag} combat: witch chase ceiling held (chased ${witchChased.toFixed(1)}b, witch @${cur.dist.toFixed(1)}) - the episode breaks, the next drop reopens it`)
              exit = 'chase ceiling'
              break
            }
            const before = bot.entity.position.clone()
            try { await gotoSafe(bot, new goals.GoalXZ(cur.entity.position.x, cur.entity.position.z), { timeoutMs: 2500, label: 'closing witch' }) } catch { /* swing anyway when in reach */ }
            if (bot.entity) witchChased += before.distanceTo(bot.entity.position)
          } else {
            // (v0.137.0) THE MELEE BUDGET: the witch lane's snapshot+budget
            // shape on every non-witch melee. The moving GoalFollow re-pathed
            // every round - run551's F9 chased a kiting skeleton for the WHOLE
            // deadline: 17 swings, ZERO closes, hp flat. The close goes to the
            // threat's STANDING cell, the cumulative walked chase is capped
            // per episode, and a spent budget breaks the episode: the next
            // health drop reopens it with a fresh budget (the witch lane's
            // contract, measured on run99).
            const step = meleeFightStep({ dist: cur.dist, chased: meleeChased })
            if (step === 'hold') {
              log(`${tag} combat: melee chase ceiling held (chased ${meleeChased.toFixed(1)}b, ${cur.name} @${cur.dist.toFixed(1)}) - the episode breaks, the next drop reopens it`)
              exit = 'chase ceiling'
              // (v0.140.0) THE RANGED-FIGHT COOLDOWN: run554 measured the
              // reopen cascade - every chase-ceiling break vs a shooter was
              // re-opened by the next arrow, and each reopen walked the bot
              // back into the volley (F2/F6/F7/F10/F12/F14, surface night).
              // The budget's break is where the chase LOSES: arm the mob's
              // window so the next verdict yields 'flee' (the arrow wall / the
              // kite own it) instead of a fresh budget. The witch lane keeps
              // her v0.115.0 contract above - melee through the splash band.
              if (RANGED_HOSTILES.has(cur.name) && cur.name !== 'witch') {
                armRangedCooldown(cur.entity?.id)
                log(`${tag} combat: ranged cooldown armed vs ${cur.name} (${RANGED_COOLDOWN_MS / 1000}s) - the chase never wins the arrow trade`)
              }
              break
            }
            const before = bot.entity.position.clone()
            try {
              await gotoSafe(bot, new goals.GoalXZ(cur.entity.position.x, cur.entity.position.z), { timeoutMs: 2500, label: `closing ${cur.name}` })
            } catch { /* swing anyway when in reach */ }
            if (bot.entity) meleeChased += before.distanceTo(bot.entity.position)
          }
        }
        if (!bot.entity) { exit = 'bot down'; break }
        try {
          await bot.lookAt(cur.entity.position.offset(0, (cur.entity.height ?? 1.8) * 0.9, 0), true)
          swings++
          meleeReturnWindows = 0 // (v0.169.0) a fresh swing starts a fresh knockback ledger
          driftWindows = 0 // (v0.174.0) a fresh swing means the mob came back into reach
          bot.attack(cur.entity)
        } catch { /* swing again next round */ }
        rounds++
        await bot.waitForTicks(cooldownTicksForWeapon(weapon?.name)) // (v0.169.0) the full-charge pacing - a partial swing lands (p^2+2p)/3
      }
      log(`${tag} combat: fight ended vs ${threat.name} (${exit}, hp ${startHp.toFixed(1)} -> ${(bot.health ?? 0).toFixed(1)}, swings ${swings}, weapon ${weapon?.name ?? 'fists'}, ${rounds} rounds)`)
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

  // ---- (v0.140.0) THE SUFFOCATE WATCH (policy in src/lib/suffocate.mjs) ----
  // run554 named suffocation the TOP death class: SIX of 17 deaths read
  // 'suffocated in a wall', all inside digging ops, four clustered around
  // [-167,50,428] (two bots on the SAME cell class). The mechanics: a
  // rage-mode dig frees a cell under a gravity column or an unstable ceiling;
  // the falling block lands WHILE the bot walks in and the eye ends inside a
  // solid cube - vanilla drains the bar while every dig loop keeps looking
  // DOWN. The watch reads the eye + feet cells every SUFFOCATE_WATCH_EVERY_
  // TICKS physics ticks and digs the bury out (head first): the death
  // becomes a one-heart scratch plus a ~1s dig. The physicsTick emitter only
  // fires with physics enabled, a ready entity and a loaded chunk, so the
  // unspawned/unloaded shapes never even reach the guards below.
  let suffocateBusy = false
  let suffocateWatchTick = 0
  bot.on('physicsTick', () => {
    if (suffocateBusy || swimming || bot._waterRescue) return // the swim lane owns the controls (and wet digs are its class)
    if (++suffocateWatchTick % SUFFOCATE_WATCH_EVERY_TICKS !== 0) return
    const p = bot.entity?.position
    if (!p) return
    const fx = Math.floor(p.x)
    const fy = Math.floor(p.y)
    const fz = Math.floor(p.z)
    let headB = null
    let feetB = null
    try {
      headB = bot.blockAt(new Vec3(fx, fy + 1, fz))
      feetB = bot.blockAt(new Vec3(fx, fy, fz))
    } catch { return } // an unreadable cell never digs
    const targets = suffocateRescueTargets({ headBlock: headB, feetBlock: feetB })
    if (!targets.length) return
    suffocateBusy = true
    ;(async () => {
      try {
        for (const which of targets) {
          if (!bot.entity) return // died mid-rescue: the respawn owns the rest
          const y = fy + (which === 'head' ? 1 : 0)
          const b = bot.blockAt(new Vec3(fx, y, fz))
          if (!b || b.type === 0) continue // the first dig already cleared it (a falling column re-fills -> the next cadence re-plans)
          log(`${tag} suffocate watch: ${which} buried in ${b.name} at [${fx},${y},${fz}] - digging out`)
          try { await bot.fastDig(b, { maxTicks: SUFFOCATE_DIG_MAX_TICKS }) } catch { /* re-checked on the next cadence */ }
          try { await bot.waitForTicks(2) } catch { /* dead physics: the busy flag drops in finally */ }
        }
      } finally { suffocateBusy = false }
    })()
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
  let lastGlitchLogAt = 0
  let headWetSince = 0
  let dryGlitchStreak = 0 // (v0.95.0) consecutive critical-on-dry readings - the escalation ladder's fuel
  let noOpRescueGateUntil = 0 // (v0.104.0) the dry-land proof's re-fire gate (the glitch-class backoff)
  // (v0.117.0) THE CHRONIC-LIAR LADDER state: glitchConfirmed counts the
  // dry-land proofs of the GLITCH class (each one is a confirmed lie) and
  // raises the fresh-streak bar for the next override; rescuePageWasGlitch
  // carries the page class from the fire site to the completion handler (a
  // wet-lane page that happens to end dry must never ratchet the ladder).
  let glitchConfirmed = 0
  let rescuePageWasGlitch = false
  // (v0.130.0) THE DROWNING WITNESS state: the highest health seen during the
  // current critical-on-dry page class (null = no class running). A real
  // drain hurts; a sensor lie does not - run536's F8 died behind a ratcheted
  // ladder + the 20 s gate with the bar 'dry' at 0, while vanilla drowning
  // damage ticked the truth the block reads could not see.
  let criticalHealthSeen = null
  let lastWitnessLogAt = 0 // (v0.130.0) the witness line's rate limiter (the AIR_GLITCH_LOG_MS cadence)
  let lastWitnessVetoLogAt = 0 // (v0.147.0) the melee-veto line's rate limiter (the same cadence)
  // (v0.129.0) THE SURFACE-RELEASE RE-ARM state: the wall clock of the last
  // surface-safe release (0 = none) and the hold line's rate limiter.
  let surfaceReleaseAt = 0
  let lastSurfaceHoldLogAt = 0
  // (v0.82.0) THE STAND-DOWN STATE: run76's F9 (25 starts, one flooded pocket)
  // and F17 (14 starts, one frozen client) ate their runs in 25s slices - the
  // watch re-pages 3s (cooldown) + 5s (head-wet clock) after every still-wet
  // end and the rescue has nothing new to try. The ledger remembers the last
  // still-wet end; the entry gate below hands repeat pages to the walk
  // machinery instead of re-burning the budget. A drowning bar NEVER trips it.
  let lastStillWet = null // { x, y, z, at } - where the last still-wet rescue ended
  let repeatWetPages = 0 // consecutive gated repeats at the same cell
  let standDownLogAt = 0 // rate-limits the frozen/repeat stand-down lines
  // (v0.87.0) THE FROZEN-CLIENT RELOG counter: run79's F8 burned 93 stand-downs
  // in one wet pocket - the physics stalled with the socket ALIVE, so neither
  // the reconnect lane (EPIPE/timeout driven) nor the server guard (player-list
  // losses) ever claimed the bot. Consecutive frozen verdicts escalate to a
  // forced bot.end(): the session loop reconnects, the physics rebuild, the
  // mined stats ride the carry. Reset on any rescue that ends with living
  // physics; the per-bot closure dies with the session, so a relog restarts it.
  let frozenStandDowns = 0
  // (v0.59.0) the WATER MEMORY: every rescue records WHERE it happened; the dig
  // planner (digShaft) refuses to send the bot back into a live hazard cell.
  // Fleet 35657683920: F16 completed four rescues in a row and died in the
  // fifth cycle - the work loop had zero memory of the water it kept re-entering.
  // (v0.62.0) the memory left the per-bot scale: without a shared ledger the
  // other 18 bots walk into the same lake blind (run58 drowned SEVEN different
  // bots in one region; run59 paid 42 arrival-then-refuse walks). The ledger is
  // shared by reference like the ClaimBoard; a private one keeps solo runs honest.
  const waterHazards = hazardLedger ?? new HazardLedger()
  const waterTables = waterTableBoard ?? new WaterTableBoard() // (v0.84.0) fleet-shared aquifer ceiling
  function waterRead () {
    if (!bot.entity?.position) return { feet: null, head: null, oxygen: 20 }
    const base = bot.entity.position.floored()
    const feetB = bot.blockAt(base)
    const headB = bot.blockAt(base.offset(0, 1, 0))
    // (v0.104.0) the WATERLOG STATE rides with the read: a waterlogged
    // stair/slab reads its base name, not water - the blockstate flag is the
    // truth airBarTrust/waterVerdict/rescue all share now. Junk (missing
    // properties, unloaded chunk) reads false and judges nothing (legacy).
    return {
      feet: feetB?.name ?? null, head: headB?.name ?? null, oxygen: bot.oxygenLevel ?? 20,
      feetWaterlogged: feetB?.properties?.waterlogged === true,
      headWaterlogged: headB?.properties?.waterlogged === true
    }
  }

  async function rescueFromWater (verdict) {
    if (swimming || !bot.entity) return
    // (v0.82.0) THE STAND-DOWN GATE - before any state changes. A page that
    // repeats a JUST-FAILED rescue at the same cell with healthy air has
    // nothing new to try: the instant return keeps the walk machinery free
    // (no _waterRescue gate, no 25s budget, no second hazard record). One
    // full retry is still honoured (REPEAT_PAGE_ALLOW) - physics change, and
    // the transit may converge on its second pass at open water. A genuinely
    // drowning bot (o2 <= OXYGEN_RESCUE_LEVEL or a junk bar - the 26.2 sensor
    // lesson) NEVER stands down: better a wasted swim than a silent drown.
    const preO2raw = Number(bot.oxygenLevel)
    const o2Healthy = Number.isFinite(preO2raw) && oxygenInDomain(preO2raw) && preO2raw > OXYGEN_RESCUE_LEVEL
    if (o2Healthy && lastStillWet && bot.entity?.position) {
      const hp = bot.entity.position
      const sameCell = Math.abs(hp.x - lastStillWet.x) <= 1.5 &&
        Math.abs(hp.y - lastStillWet.y) <= 2.5 &&
        Math.abs(hp.z - lastStillWet.z) <= 1.5
      if (sameCell && Date.now() - lastStillWet.at < REPEAT_PAGE_WINDOW_MS) {
        repeatWetPages++
        if (repeatWetPages > REPEAT_PAGE_ALLOW) {
          if (Date.now() - standDownLogAt >= STAND_DOWN_LOG_MS) {
            standDownLogAt = Date.now()
            log(`${tag} water: repeat wet page at the same cell (o2 ${preO2raw}) - standing down, the walk machinery owns the exit`)
          }
          return
        }
      } else {
        repeatWetPages = 0 // a different cell (or a stale episode): full service again
      }
    }
    swimming = true
    bot._waterRescue = true // gotoSafe refuses new walk goals from now on
    lastRescueAt = Date.now()
    stats.rescues++
    noteGlobal('water:rescue') // (v0.62.0) run53's OOM and run60's 150s freeze both began mid-rescue - mark the site
    let standingWet = false // exited via the standing-in-shallow-water policy
    let sawWater = false // (v0.104.0) the dry-land proof's water-contact latch
    // (v0.80.0) THE OPEN-WATER TRANSIT state: the continuous-dry clock (reset
    // on every submerged read) and the surface-safe release flag.
    let headDrySince = null
    let releasedSafe = false
    // (v0.81.0) THE RESCUE BLACKBOX state: per-pass reads feed the stability
    // window and the rate-limited pass line. Run75 (35740810293) timed out 23
    // rescues with ZERO transit/release lines - which branch ate each 25s
    // budget was unanswerable from the log. One line per pass names it: the
    // y-trajectory (ascent vs snag vs frozen physics), the head pattern (the
    // bobbing treadmill), the shore/map verdicts, the probe spend.
    const rescueReads = []
    const passPoints = [] // (v0.82.0) per-pass positions feed the frozen-physics detector
    let standingProbes = 0
    let ascendDigs = 0 // (v0.125.0) the deep-pocket ascend ceiling-dig budget
    let passNo = 0
    let passLogAt = 0
    let passLogs = 0
    let mapMissLogged = false
    let transitPlan = null // (v0.82.0) the progress latch: { key, d0, atPass, logged }
    let transitStalledFlag = false // once the walls own the swim, the release owns the pass
    let frozenDown = false // (v0.82.0) the physics flatlined - the reconnect lane owns the bot
    let frozenDownWet = false // (v0.96.0) the flatline verdict arrived while HEAD-WET - the drowning clock owns it, the relog fires on the FIRST verdict
    // The fleet map knows land the raw 12-block shore scan cannot: a tree log
    // STANDS on land, sand/gravel LINE shores. One unit bearing to the nearest
    // known land cell, or null (no map / no entries / junk) - the caller then
    // falls through to the release policy.
    const landBearingFromMap = () => {
      if (!map || !bot.entity?.position) return null
      const here = bot.entity.position
      for (const name of LAND_PROXIES) {
        let p = null
        try { p = map.nearest(name, here, { maxDistance: TRANSIT_MAP_RANGE }) } catch { /* junk map read */ }
        if (!p) continue
        const b = transitBearing({ hx: here.x, hz: here.z, lx: p.x, lz: p.z })
        if (b) {
          log(`${tag} water: transit toward known land (${name}) at [${p.x},${p.z}] d=${b.dist.toFixed(0)}`)
          return { ...b, name, tx: p.x, tz: p.z }
        }
      }
      // (v0.81.0) the map-miss evidence, once per rescue: run75 could not tell
      // 'the transit never ran' from 'the map knows no land here' - this line
      // settles it for the next fleet read.
      if (!mapMissLogged) {
        mapMissLogged = true
        const counts = LAND_PROXIES.map(n => `${n}=${typeof map.size === 'function' ? map.size(n) : '?'}`).join(' ')
        log(`${tag} water: no map land within ${TRANSIT_MAP_RANGE} (proxies ${counts})`)
      }
      return null
    }
    // (v0.62.0) the HAZARD CELL is tracked from the start and refreshed only
    // while the bot is actually wet: the finally used to read
    // bot.entity.position, and a bot that DIED mid-rescue respawned before the
    // finally unblocked - run60 recorded three y=72-73 'hazard memorized' lines
    // at the WORLD SPAWN ([-144,73,399] / [-138,72,392] / [-128,72,411]), so the
    // ledger then vetoed legit spawn-area targets for a full TTL. The last live
    // wet cell is the true hazard; the spawn point is nobody's hazard.
    let hazardCell = bot.entity?.position
      ? { x: bot.entity.position.x, y: bot.entity.position.y, z: bot.entity.position.z }
      : null
    log(`${tag} water: drowning rescue start (${verdict}, oxygen ${bot.oxygenLevel ?? '?'})`)
    try {
      try { bot.pathfinder.setGoal(null) } catch { /* idle already */ }
      try { bot.clearControlStates() } catch { /* nothing held */ }
      const sample = (x, y, z) => { try { return bot.blockAt(new Vec3(x, y, z))?.name ?? null } catch { return null } }
      // (v0.62.0) race-bounded settle - the v0.24.0 climb lesson, applied to the
      // rescue at last: a dead connection stops physics ticks and a RAW
      // waitForTicks hangs the whole rescue. Run60 measured it twice:
      // 'rescue timeout (still wet) in 173.5s' and 'rescue complete in 159.8s'
      // (RESCUE_MAX_MS is 25!) - the finally fired only when the reconnect
      // unblocked the awaits, by which time the bot had died and respawned.
      const settle = async n => {
        try { await withTimeout(bot.waitForTicks(n), 2000, 'rescue settle') } catch { /* dead physics: the loop budget ends the rescue */ }
      }
      while (bot.entity && Date.now() - lastRescueAt < RESCUE_MAX_MS) {
        // (v0.62.0) a dead bot cannot swim: exit now. The tracked wet cell is
        // already the death spot - the hazard is exactly where the water won.
        if ((bot.health ?? 20) <= 0) break
        const read = waterRead()
        // (v0.104.0) waterlogged contact counts: a bot standing in a
        // waterlogged stair IS in water (the F17 class) - the rescue must swim
        // it out, not break out 0.0 s later and re-page forever. sawWater
        // feeds the dry-land proof at the finally: a rescue that never saw
        // contact proved the page false and records no hazard.
        const inWater = isWaterName(read.feet) || isWaterName(read.head) ||
          read.feetWaterlogged === true || read.headWaterlogged === true
        if (inWater && bot.entity?.position) {
          hazardCell = { x: bot.entity.position.x, y: bot.entity.position.y, z: bot.entity.position.z }
          sawWater = true
        }
        if (!inWater && bot.entity.onGround) break // out and standing: done
        const headWet = isWaterName(read.head)
        // (v0.81.0) the verdicts are computed BEFORE the pass line so the line
        // names the branch that owns this pass; the wet branch keeps its
        // headDrySince reset (a real submersion re-pages the dry clock).
        let dir = null
        let land = null
        if (!headWet) {
          // head in air: surface reached - swim for the nearest shore (the raw
          // tunnel/shelter lesson: no pathfinder while conditions are hostile)
          if (headDrySince == null) headDrySince = Date.now()
          dir = shoreDirection(sample, bot.entity.position.floored())
          if (!dir) land = landBearingFromMap()
        } else {
          headDrySince = null // submerged again: the dry clock restarts
        }
        // (v0.81.0) THE BLACKBOX PASS LINE - rate-limited to survive 19 bots.
        if (Date.now() - passLogAt >= PASS_LOG_INTERVAL_MS && passLogs < PASS_LOG_MAX_PER_RESCUE) {
          passLogAt = Date.now()
          passLogs++
          const p = bot.entity.position
          log(`${tag} water: pass ${passNo} head=${headWet ? 'wet' : 'dry'} shore=${dir ? `hit r=${dir.dist}` : 'none'} land=${land ? `${land.name} d=${land.dist.toFixed(0)}` : (headWet ? 'n/a' : 'none')} y=${p.y.toFixed(1)} o2=${read.oxygen} probes=${standingProbes} at=[${p.x.toFixed(0)},${p.y.toFixed(0)},${p.z.toFixed(0)}]`)
        }
        passNo++
        rescueReads.push({ wet: headWet, atMs: Date.now() })
        if (rescueReads.length > RESCUE_READS_CAP) rescueReads.shift()
        // (v0.82.0) THE FROZEN-PHYSICS DETECTOR: run76's F17 held a flat
        // [-100,42.2,377] for 90+ passes with jump held and a stale o2=20 -
        // mineflayer physics were not ticking, so no swim, transit or release
        // can ever fire. Name it and stand down; the reconnect lane owns a
        // dead client, the rescue owns living water.
        if (bot.entity?.position) {
          const pp = bot.entity.position
          passPoints.push({ x: pp.x, y: pp.y, z: pp.z })
          if (passPoints.length > RESCUE_READS_CAP) passPoints.shift()
          // (v0.132.0) THE WET-FROZEN FAST WINDOW - a head-wet bot at/under
          // critical air is on the vanilla drowning clock (~2 hp/s connected);
          // the 10-pass diagnosis donated ~10 hp per frozen-wet cycle (run538:
          // F8/F12/F17/F10 all died mid-ladder). 4 passes condemn a wedged
          // client ~3s sooner; a false positive costs one SAFE relog (air and
          // health freeze during the down window), a false negative costs hp.
          const frozenWindow = frozenWindowFor({ headWet, oxygen: read.oxygen })
          if (physicsFrozen({ points: passPoints, window: frozenWindow })) {
            if (Date.now() - standDownLogAt >= STAND_DOWN_LOG_MS) {
              standDownLogAt = Date.now()
              log(`${tag} water: frozen physics (${frozenWindow} flat passes at y=${pp.y.toFixed(1)}, o2=${read.oxygen}${headWet ? ', head WET' : ''}${frozenWindow !== FROZEN_WINDOW ? ' - the wet-critical fast window' : ''}) - standing down, the reconnect lane owns this`)
            }
            frozenDown = true
            frozenDownWet = headWet === true
            break
          }
        }
        if (!headWet) {
          if (dir) {
            bot.setControlState('jump', true) // stay at the surface while swimming
            try { await withTimeout(bot.lookAt(bot.entity.position.offset(dir.dx, 0, dir.dz), false), 2000, 'rescue look') } catch { /* keep the bearing */ }
            bot.setControlState('forward', true)
            await settle(8)
            bot.setControlState('forward', false)
          } else if (land && !transitStalledFlag) {
            // (v0.82.0) THE TRANSIT PROGRESS LATCH: run76's transits steered
            // at d=7-8 that NEVER shrank (the shaft walls own the swim) while
            // this branch shadowed the release below it. Patience runs out:
            // drop the plan for the rest of this rescue - the release policy
            // takes over this pass and every pass after.
            const tkey = `${land.name},${Math.round(land.tx)},${Math.round(land.tz)}`
            if (!transitPlan || transitPlan.key !== tkey) transitPlan = { key: tkey, d0: land.dist, atPass: passNo, logged: false }
            if (transitStalled({ d0: transitPlan.d0, d: land.dist, passes: passNo - transitPlan.atPass })) {
              if (!transitPlan.logged) {
                transitPlan.logged = true
                log(`${tag} water: transit stalled (d=${land.dist.toFixed(0)} after ${passNo - transitPlan.atPass} passes - the walls own this swim; the release takes over)`)
              }
              transitStalledFlag = true
            } else {
              bot.setControlState('jump', true) // stay at the surface while swimming
              try { await withTimeout(bot.lookAt(bot.entity.position.offset(land.dx, 0, land.dz), false), 2000, 'transit look') } catch { /* keep the bearing */ }
              bot.setControlState('forward', true)
              await settle(TRANSIT_RESCAN_TICKS) // each settle swims ~1-2 blocks; the shore scan re-runs next pass
              bot.setControlState('forward', false)
            }
          } else if (openWaterRelease({ headDryMs: Date.now() - headDrySince, oxygen: read.oxygen, shore: null, reads: rescueReads })) {
            // (v0.80.0) the continuous-clock release OR (v0.81.0) the stability
            // window - reachable now that the probe budget below stops the
            // loop's own sink from resetting the clock forever.
            releasedSafe = true
            break
          } else if (standingProbes < STANDING_PROBE_BUDGET) {
            // the shallow-water standing test: release the jump, settle, read
            // onGround. BUDGETED (v0.81.0): run75's open-water cycle probed
            // EVERY pass - each probe sank the bot and reset the dry clock,
            // which is exactly what starved the release above.
            standingProbes++
            bot.setControlState('jump', false)
            await settle(2) // onGround needs physics ticks to settle
            if (!bot.entity) break
            if (rescueDone({ headWet: false, shore: null, onGround: !!bot.entity.onGround })) {
              standingWet = true
              break
            }
            await settle(8) // floating in open water: tread and stay alive
          } else {
            // probe budget spent: HOLD THE SURFACE (v0.81.0). The head stays
            // at the air line, the reads go dry, the stability window fills,
            // and the release fires - instead of sinking against the clock
            // until RESCUE_MAX_MS.
            bot.setControlState('jump', true)
            await settle(TRANSIT_RESCAN_TICKS)
          }
        } else {
          bot.setControlState('jump', true) // submerged: ascending is everything
          // (v0.125.0) THE DEEP-POCKET ASCEND: the jump is producing nothing
          // (K flat passes on y) and the head is WET - a ceiling owns the
          // pocket (run108 F7/F11: y=54.2 flat pass over pass while o2 fell
          // 0 -> -1 - alive physics, no shore, no exit, dead bot). The human
          // playbook: surface to the ceiling and dig up. A failed/absent/
          // undiggable read keeps the jump-only shape byte for byte; the
          // frozen detector still owns the true freeze and RESCUE_MAX_MS
          // caps the lane.
          if (ascendDigs < ASCEND_DIG_BUDGET && ascendStalled({ points: passPoints })) {
            const cell = ceilingCell(bot.entity?.position)
            const ceil = cell
              ? (() => { try { return bot.blockAt(new Vec3(cell.x, cell.y, cell.z)) } catch { return null } })()
              : null
            if (ceil && ceil.diggable === true) {
              ascendDigs++
              try {
                await withTimeout(bot.dig(ceil), 6000, 'ascend dig')
                log(`${tag} water: deep-pocket ascend - dug the ceiling ${ceil.name} at [${cell.x},${cell.y},${cell.z}] (jump stalled ${ASCEND_STALL_PASSES}+ passes, o2 ${read.oxygen})`)
              } catch { /* the dig lost the race: the jump-only shape carries on */ }
            }
          }
          await settle(5)
        }
      }
      const done = !bot.entity
        ? 'aborted (bot gone)'
        : ((bot.health ?? 20) <= 0)
          ? 'aborted (dead - the hazard stays at the death spot)'
          : standingWet
            ? 'complete (standing wet - shallow water is not drowning)'
            : releasedSafe
              ? 'released (surface-safe, open water - no land known; the walk gate reopens)'
              : frozenDown
                ? 'standing down (frozen physics - the walk gate reopens, the reconnect lane owns a dead client)'
                : (!(isWaterName(waterRead().feet) || isWaterName(waterRead().head))
                  ? 'complete'
                  : `timeout (still wet, ${passNo} passes, ${standingProbes} probes, tail ${rescueReads.slice(-3).map(r => r.wet ? 'wet' : 'dry').join('/')})`)
      log(`${tag} water: rescue ${done} in ${((Date.now() - lastRescueAt) / 1000).toFixed(1)}s`)
      // (v0.129.0) a surface-safe release certifies the bot as FLOATING and
      // breathing - arm the sentry's re-arm pacing from here (the F15 class:
      // 39 starts / 36 releases on one open lake, every cycle a walk cancel
      // plus 2.5-5.3 s of rescue, re-paged by a bar hovering at the rescue
      // level 3 s after each release).
      if (releasedSafe) surfaceReleaseAt = Date.now()
      // (v0.87.0) THE FROZEN-CLIENT RELOG ESCALATION: the stand-down hands the
      // bot to "the reconnect lane", but a live-socket stall never pages that
      // lane (it waits for EPIPE/timeout) - run79 measured F8 at 93 stand-downs
      // with reconnects=3 fleet-wide. After FROZEN_RELOG_AFTER consecutive
      // frozen verdicts the rescue force-ends the session itself: the fleet
      // session loop reconnects with a fresh client and the physics rebuild.
      // A dead bot / no entity never escalates (the respawn owns those exits).
      if (frozenDown) {
        frozenStandDowns++
        const esc = frozenRelogDecision({ frozenStandDowns, hasEntity: !!bot.entity, health: bot.health ?? 20, headWet: frozenDownWet })
        if (esc.relog) {
          frozenStandDowns = 0
          // (v0.119.0) THE FROZEN-RETURN GATE arms here: run103's F14 relogged
          // 12 times into the SAME water column [-121,58-59,376] - the fresh
          // client re-paged within seconds and froze again before the work
          // loop could ever walk it out. The gate gives the promise the relog
          // makes ("the rescue swims the bot out") the time it assumed: the
          // sentry holds non-critical pages frozenReturnGate(streak) while
          // the hazard-ledgered walk gate moves the bot client-side. A
          // critical read bypasses (the death clock outranks the hold).
          const relogStreak = (frozenRelogStreaks.get(username) || 0) + 1
          frozenRelogStreaks.set(username, relogStreak)
          const hold = frozenReturnGate({ consecutiveRelogs: relogStreak })
          frozenReturnGates.set(username, Date.now() + hold)
          log(`${tag} water: frozen client relog (#${relogStreak} consecutive) (${esc.why}) - ending the session, the reconnect lane rebuilds the physics; the drowning sentry holds non-critical pages ${Math.round(hold / 1000)}s (the frozen-return gate)`)
          try { bot.end() } catch { /* the session loop owns the wreck */ }
        }
      } else {
        frozenStandDowns = 0 // living physics: the escalation restarts
        // (v0.119.0) an HONEST completion - the client lived through the whole
        // budget: the frozen-cycler ladder forgets the bot (the streak and the
        // armed hold both clear; the next freeze starts from rung one).
        if ((frozenRelogStreaks.get(username) || 0) > 0) {
          frozenRelogStreaks.set(username, 0)
          frozenReturnGates.delete(username)
          log(`${tag} water: frozen-return gate clears - the rescue completed with living physics`)
        }
      }
      // (v0.82.0) THE STAND-DOWN LEDGER: remember where this rescue ended
      // still wet (the frozen stand-down included - its reads are stale but
      // the cell is the truth); a healthy repeat page will stand down instead
      // of burning another budget. Any wet-free end clears the episode.
      try {
        if (bot.entity && (frozenDown || isWaterName(waterRead().feet) || isWaterName(waterRead().head))) {
          const ep = bot.entity.position
          lastStillWet = { x: ep.x, y: ep.y, z: ep.z, at: Date.now() }
        } else {
          lastStillWet = null
          repeatWetPages = 0
        }
      } catch { /* junk position: keep the old ledger */ }
    } catch (err) {
      // (v0.59.0) an honest exit: a thrown rescue used to vanish silently (no
      // completion line - the F1 fleet evidence had a start with no end) while
      // the flags still reset in the finally. Name the abort, keep the reset.
      log(`${tag} water: rescue aborted (${err?.message ?? 'error'})`)
    } finally {
      try { bot.clearControlStates() } catch { /* nothing held */ }
      // (v0.59.0 + v0.62.0) the WATER MEMORY write happens on EVERY exit path
      // (complete, timeout, abort, death) - but it records the TRACKED wet
      // cell, never the entity position at finally time (a dead-then-respawned
      // bot stands at the spawn point there). The digShaft guard and the
      // mapTargetFor pre-walk veto both read this ledger.
      // (v0.104.0) THE DRY-LAND PROOF gates the write: run93's F9/F15 stood
      // DRY on the quarry rim with a stuck-at-0 bar - each 0.0 s no-op rescue
      // recorded the DRY cell as a live hazard (the ledger filled with rim
      // cells vetoes legit mining columns fleet-wide for a full TTL and feeds
      // the relocation A*). A rescue that saw ZERO water contact inside
      // DRY_PROOF_MAX_MS records NOTHING, restarts the critical-on-dry
      // streak (the sustained-drain evidence is disproven for this moment)
      // and arms the sentry's DRY_PROOF_BACKOFF_MS re-fire gate. Wet exits
      // (a swim-out included) and long/frozen exits keep the legacy record.
      const proof = dryLandProof({ wetPasses: sawWater ? 1 : 0, elapsedMs: Date.now() - lastRescueAt })
      if (proof) {
        if (dryGlitchStreak > 0) {
          dryGlitchStreak = 0
          log(`${tag} water: dry-land proof (rescue saw no water in ${((Date.now() - lastRescueAt) / 1000).toFixed(1)}s) - the critical-on-dry streak restarts, the next glitch page waits ${Math.round(DRY_PROOF_BACKOFF_MS / 1000)}s`)
        }
        // (v0.117.0) THE RATCHET: a dry-land proof of the GLITCH class is a
        // confirmed lie - the next override needs a FRESH streak past a
        // laddered cap (8/16/24... bounded 40); the real-drain shape
        // (run84a F17's 675+ sustained reads) still outruns the ladder.
        if (rescuePageWasGlitch) {
          glitchConfirmed++
          log(`${tag} water: liar ladder ratchets - confirmed no-op glitch page #${glitchConfirmed}, the next override needs ${glitchStreakCap(glitchConfirmed)} fresh critical-on-dry reads`)
        }
        noOpRescueGateUntil = Date.now() + DRY_PROOF_BACKOFF_MS
      } else if (hazardCell) {
        const live = waterHazards.record(hazardCell)
        log(`${tag} water: hazard memorized at [${Math.floor(hazardCell.x)},${Math.floor(hazardCell.y)},${Math.floor(hazardCell.z)}] (${live} live, fleet-wide)`)
        if (broadcastHazard) { try { broadcastHazard(hazardCell) } catch { /* chat never kills a rescue */ } }
        // (v0.117.0) the legacy hazard record means the page was NOT disproven
        // (water contact or a long flail) - the real-drain shape keeps the
        // fast lane, the ladder forgets its confirmations.
        if (glitchConfirmed > 0) {
          glitchConfirmed = 0
          log(`${tag} water: liar ladder resets - the rescue kept its water/long record (the page was not disproven)`)
        }
      }
      rescuePageWasGlitch = false
      bot._waterRescue = false
      swimming = false
    }
  }

  // (v0.119.0) THE FALLING-BAR HISTORY: the recent in-domain oxygen readings
  // (oldest first, junk/-1 sentinel never pushed). The verdict's falling-bar
  // lane judges the TREND - a genuinely draining bar (fresh flood through a
  // dig, the head cell still reading stale air) pages the rescue from the
  // rescue level down, instead of waiting for the critical ladder that run104
  // proved arrives with no shore left to swim to.
  const o2History = []
  const drownTimer = setInterval(() => {
    try {
      // (v0.17.0) bot._climbEscape: the wet-escape traverse owns the controls -
      // it IS the escape (a purposeful 15s gallery beats the measured 25s
      // tread-water timeout), and a rescue mid-dig would undo its own way out
      if (!bot.entity || swimming || defending || bot._climbEscape) return
      if (Date.now() - lastRescueAt < RESCUE_COOLDOWN_MS) return // a bot treading a flooded shaft re-fires otherwise every 5 s
      const now = Date.now()
      const read = waterRead()
      const headWet = isWaterName(read.head)
      if (headWet) { if (!headWetSince) headWetSince = now } else headWetSince = 0
      // (v0.119.0) feed the falling-bar history - in-domain readings only
      // (the -1 reset sentinel and NaN never enter; the verdict's trend lane
      // needs an honest tail). Capped so the window stays recent.
      // (v0.127.0) THE HISTORY GUARD: a critical-on-DRY read never enters -
      // the glitch page (a respawned client's stuck 0 on dry land) is the liar
      // ladder's evidence, not a trend: run525's F14/F11/F15 drowned with
      // ZERO water lines because their history tails led with the glitch 0s,
      // so airBarFalling's first-last read NEGATIVE and the falling lane -
      // the one lane built for the stale-dry-blocks flood - never fired while
      // the streak lane sat behind its laddered cap. A critical read on WET
      // or UNKNOWN contact still enters (a real drain's slope). The trust
      // read ONCE here and reused below - same reads, one verdict.
      const contactTrust = airBarTrust(read)
      const o2Now = bot.oxygenLevel
      if (historyAdmissible(o2Now, contactTrust)) { o2History.push(o2Now); if (o2History.length > O2_HISTORY_CAP) o2History.shift() }
      // (v0.16.0) the 26.2 oxygen sensor can read ~0 on dry land - fleet #120
      // measured 140 rescue starts with zero real drownings, every one of them
      // cancelling a walk goal the work loop had just issued. A critical bar on
      // DEFINITE dry contact is a glitch: count it, log it rate-limited, do not
      // swim. waterVerdict applies the same gate, so this is pure telemetry.
      // (v0.64.0) the -1 RESET SENTINEL is no longer counted here: run60 proved
      // it arrives as a burst right after 'rescue complete' / respawn (395
      // fleet-wide, F2 x250+) and waterVerdict now reads it as FULL - counting
      // it made airGlitches a rescue-counter, not a sensor-anomaly counter.
      const o2raw = Number(read.oxygen)
      // (v0.95.0) the streak: consecutive critical-on-dry reads. The ignore is
      // no longer ABSOLUTE - run84a's F17 was ignored 675+ times across its
      // run and the server drowned it anyway: a SUSTAINED zero bar on 'dry
      // land' is a real air bar draining somewhere the block reads miss.
      const criticalOnDry = oxygenInDomain(o2raw) && o2raw <= OXYGEN_CRITICAL_LEVEL && contactTrust === 'dry'
      // (v0.117.0) the liar ladder resets on WET contact - a bot that touches
      // water is a new page class (the confirmations were about a DRY lie).
      if (contactTrust === 'wet' && glitchConfirmed > 0) {
        glitchConfirmed = 0
        log(`${tag} water: liar ladder resets - wet contact, the page class is new`)
      }
      // (v0.130.0) THE WITNESS BASELINE - the running health max of the
      // current critical-on-dry class. The snapshot opens with the class,
      // regeneration raises it (a healed bot owes a fresh decline), and the
      // class ending (bar off critical) clears it for the next one.
      if (criticalOnDry) {
        const hNow = Number.isFinite(bot.health) ? bot.health : null
        if (hNow !== null && (criticalHealthSeen === null || hNow > criticalHealthSeen)) criticalHealthSeen = hNow
        // (v0.117.0) the gate window HOLDS the streak: the dry-land proof
        // restarted it to 0, and the reads arriving while the no-op gate is
        // armed are the SAME disproven page - counting them let the stale
        // streak (~33 reads) re-fire the rescue the moment the 20 s gate
        // expired (run102 F3: 15 starts, 10 proofs, 4 relogs - a rescue every
        // ~25 s for the whole run). Fresh evidence only.
        if (Date.now() >= noOpRescueGateUntil) dryGlitchStreak++
        stats.airGlitches++
        if (now - lastGlitchLogAt >= AIR_GLITCH_LOG_MS) {
          lastGlitchLogAt = now
          // (v0.195.0) the map pin: the line names WHERE the sensor sat broken
          log(airGlitchLogLine({ tag, oxygen: o2raw, total: stats.airGlitches, pos: bot.entity?.position }))
        }
        const streakCap = glitchStreakCap(glitchConfirmed)
        if (dryGlitchStreak === streakCap) {
          // (v0.195.0) the map pin rides the override verdict too
          log(airGlitchLogLine({ kind: 'override', tag, streak: dryGlitchStreak, pos: bot.entity?.position }))
        }
      } else {
        dryGlitchStreak = 0
        criticalHealthSeen = null
      }
      // (v0.130.0) THE DROWNING WITNESS VERDICT - a critical-on-'dry' bar
      // corroborated by DROWN_CORROBORATION_HP of real health decline IS a
      // drowning: the witness outranks the block reads (the suspected liar),
      // the lie ladder, and every gate below. Without the decline the legacy
      // verdict machinery keeps its exact shape (the rim-glitch control).
      // (v0.147.0) THE MELEE VETO: a hostile inside WITNESS_COMBAT_BAND owns
      // the health decline (run33: F3 hit 20 -> 4 by a zombie while the bar
      // lay 0-on-'dry' - the witness fired, the rescue proved dry 0.0s, and
      // the loop re-fired 119 times). The vetoed class falls back to the
      // legacy verdict machinery - the lie ladder + the gates keep their say.
      const witnessHostile = nearestHostile({ range: WITNESS_COMBAT_BAND })
      const witnessed = drowningCorroborated({ criticalOnDry, healthNow: bot.health, healthSeenMax: criticalHealthSeen, hostileNear: !!witnessHostile })
      const verdict = witnessed
        ? 'drowning'
        : waterVerdict({ ...read, headWetMs: headWet ? now - headWetSince : 0, dryGlitchStreak, dryGlitchCap: glitchStreakCap(glitchConfirmed), airHistory: o2History.slice() })
      if (witnessed && now - lastWitnessLogAt >= AIR_GLITCH_LOG_MS) {
        lastWitnessLogAt = now
        log(`${tag} water: drowning witnessed by damage (health ${criticalHealthSeen} -> ${bot.health} on a 'dry' critical bar) - the witness outranks the ladder and the gate`)
      } else if (!witnessed && witnessHostile && drowningCorroborated({ criticalOnDry, healthNow: bot.health, healthSeenMax: criticalHealthSeen }) && now - lastWitnessVetoLogAt >= AIR_GLITCH_LOG_MS) {
        // the veto telemetry: the decline WOULD have corroborated, but the
        // band owns it - name the owner so the next mine can audit the band
        lastWitnessVetoLogAt = now
        log(`${tag} water: witness stands down - a ${witnessHostile.name} at ${witnessHostile.dist?.toFixed?.(1) ?? '?'}b owns the decline (combat, not a drain)`)
      }
      if (verdict === 'drowning') {
        // (v0.104.0) THE DRY-LAND BACKOFF - the glitch class only. A bot the
        // dry-land proof just cleared re-fires its critical-on-dry page
        // DRY_PROOF_BACKOFF_MS later, not every RESCUE_COOLDOWN_MS: run93's
        // 3 s-cadence no-op rescues (each a setGoal(null) walk cancel) were
        // the A* storm's pump. A WET page (head in water / waterlogged
        // contact) never waits on this gate - only the stuck-bar class does.
        if (criticalOnDry && Date.now() < noOpRescueGateUntil && !witnessed) return
        // (v0.129.0) THE SURFACE-RELEASE RE-ARM - the sentry side. A bot a
        // surface-safe release just certified as floating (head dry, open
        // water, no shore anywhere) re-fills its bar while the walk gate
        // walks it - a bar hovering at the rescue level is the float's own
        // shape, not a new drowning. The hold paces the re-page for
        // SURFACE_REARM_MS; a genuinely sinking bar (o2 at/under critical,
        // the ~35 s drain-to-death clock) bypasses and pages immediately.
        // Junk-bar reads judge nothing (a missing bar never breaks a hold).
        if (surfaceRearmHolds({ releasedAgoMs: surfaceReleaseAt ? now - surfaceReleaseAt : null, oxygen: o2raw })) {
          if (now - lastSurfaceHoldLogAt >= AIR_GLITCH_LOG_MS) {
            lastSurfaceHoldLogAt = now
            log(`${tag} water: surface re-arm holds the page (${Math.max(0, Math.round((surfaceReleaseAt + SURFACE_REARM_MS - now) / 1000))}s left) - the open-water float owns the pacing; a sinking bar still pages`)
          }
          return
        }
        // (v0.119.0) THE FROZEN-RETURN GATE - the sentry side: a page inside
        // the hold waits UNLESS the bar is genuinely critical (the ~35s
        // drain-to-death clock outranks any gate). The headWetMs/rescue-level
        // lanes (the frozen cycler's own page class) hold; the liar ladder's
        // class keeps pacing itself through the v0.117.0 machinery on top.
        const frozenGateUntil = frozenReturnGates.get(username) || 0
        if (Date.now() < frozenGateUntil && !frozenReturnBypass({ oxygen: o2raw })) {
          if (now - lastGlitchLogAt >= AIR_GLITCH_LOG_MS) {
            lastGlitchLogAt = now
            log(`${tag} water: frozen-return gate holds the page (${Math.round((frozenGateUntil - now) / 1000)}s left) - the fresh client walks the hazard-ledgered column out`)
          }
          return
        }
        rescuePageWasGlitch = criticalOnDry // (v0.117.0) the completion handler ratchets only on the glitch class
        rescueFromWater(verdict).catch(() => { /* next tick re-checks */ })
      }
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
      if (bot._climbEscape) return // (v0.17.0) the wet-escape traverse owns the controls
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

  // (v0.140.0) THE GRAVITY ROOF FENCE - the dig helper the three dig lanes
  // (mineBlock's tunnel/gallery face, veinSweep's ore cell, nukeAround's
  // candidate) consult before the first swing. run554 (35974993311, the
  // v0.139.0 fleet) buried SIX bots suffocated-in-a-wall (F4/F2/F15/F14/F5/F3,
  // the mine zone y 42-56, F5+F3 the same pocket five log lines apart): each
  // dug a block whose above-column held sand/gravel - the column collapsed
  // INTO the cleared cell and the tunnel's own step-in (or the vein detour's
  // walk-under) put a bot head inside the landed block. The v0.25.0 climb's
  // textbook applies verbatim: RE-SCAN and RE-DIG, TOP-DOWN. Each pass reads
  // the 3 cells above the target and digs the gravity ones highest-first (a
  // top-down dig can never drop a lower cell's load); a column taller than
  // the window settles one cell per pass and the next pass catches it; a
  // column that will not exhaust within GRAVITY_MAX_PASSES refuses THIS dig
  // (named, the lane moves on) instead of gambling a bot. Junk reads never
  // fence; the fence's own errors never fence (a cure must not stall the mine).
  // Returns { ok, cleared, why? } - ok=false means the caller skips the dig.
  async function gravityClearBefore (pos, { maxAbove = 3 } = {}) {
    try {
      let cleared = 0
      for (let pass = 0; pass < GRAVITY_MAX_PASSES; pass++) {
        const reads = []
        for (let k = 1; k <= maxAbove; k++) {
          let name = null
          try { name = bot.blockAt(pos.offset(0, k, 0))?.name ?? null } catch { name = null }
          reads.push(name)
        }
        const order = gravityColumnOrder(reads)
        if (!order.length) return { ok: true, cleared }
        let clearedThisPass = 0
        for (const k of order) {
          let blk = null
          try { blk = bot.blockAt(pos.offset(0, k, 0)) } catch { blk = null }
          if (!blk || blk.type === 0 || !GRAVITY_ROOF_BLOCKS.has(blk.name)) continue // settled/shifting
          try {
            if (await bot.fastDig(blk)) { cleared++; clearedThisPass++ }
          } catch { /* the pass verdict decides below */ }
        }
        if (!clearedThisPass) break // reads say gravity, digs refuse: re-plan next iteration
      }
      // final re-read: any surviving gravity above the target refuses the dig
      for (let k = 1; k <= maxAbove; k++) {
        let name = null
        try { name = bot.blockAt(pos.offset(0, k, 0))?.name ?? null } catch { name = null }
        if (typeof name === 'string' && GRAVITY_ROOF_BLOCKS.has(name)) {
          return { ok: false, cleared, why: `gravity roof: sand/gravel still rides this column at +${k} after ${GRAVITY_MAX_PASSES} pass(es) (cleared ${cleared}) - the dig waits` }
        }
      }
      return { ok: true, cleared }
    } catch { return { ok: true, cleared: 0 } }
  }

  // returns true (mined), false (failed), 'skip' (buried / nothing to stand on yet)
  async function mineBlock (pos) {
    const block = bot.blockAt(pos)
    if (!block || block.type === 0) return false

    const roof = await gravityClearBefore(pos)
    if (!roof.ok) {
      stats.gravityRefused = (stats.gravityRefused ?? 0) + 1
      if (stats.gravityRefused <= 2) log(`${tag} ${roof.why}`)
      return 'skip'
    }
    if (roof.cleared > 0) {
      stats.gravityCleared = (stats.gravityCleared ?? 0) + 1
      if (stats.gravityCleared <= 2) log(`${tag} gravity roof: cleared ${roof.cleared} cell(s) above a dig (top-down)`)
    }

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
        // (v0.140.0) the gravity roof fence before every candidate dig
        const roof = await gravityClearBefore(cand.pos)
        if (!roof.ok) {
          stats.gravityRefused = (stats.gravityRefused ?? 0) + 1
          if (stats.gravityRefused <= 2) log(`${tag} ${roof.why}`)
          continue
        }
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
  async function tunnel (dir, { maxBlocks = 12, names = null, shouldStop = null, maxMs = TUNNEL_MAX_MS } = {}) {
    enablePhysicsMode()
    configureGroundMovements()
    stats.startedAt = stats.startedAt || Date.now()
    const start = Date.now()
    const d = new Vec3(Math.sign(dir.x) || 1, 0, Math.sign(dir.z) || 0)
    let done = 0
    let stalls = 0
    let diglessIters = 0 // (v0.35.0) iterations since the last successful dig - mob shoving resets `stalls` but cannot reset this
    let stopped = null // (v0.35.0) why the loop ended before maxBlocks: 'budget' | 'digless' | 'stalled' | 'shouldStop' | 'no entity'
    // (v0.107.0) the tunnel-torch rhythm: the galleries this lane digs were the
    // fleet's dark kill zones (run94: zombie x5 + the creeper ambush pair while
    // the SHAFT lane already lit itself every TORCH_SPACING digs). Wall candidates
    // exclude the travel face ONCE (d never changes inside a call) - a torch on
    // the wall the next cut eats pops into an item and the wasted pickup costs
    // more than it lights. Stocking stays shaft-entry-owned (craftTorches at the
    // descent); a tunnel burns only what the pocket already carries.
    const tunnelTorchDirs = torchWallDirs({ d })
    let digsSinceTorch = 0
    try {
      while (true) {
        // (v0.35.0) the guard is the LOOP CONDITION now: fleet 35562867668 (F2) ran
        // ONE tunnel call for 390 s and dug 1 block - two skeletons reset the stall
        // counter by shoving, nothing diggable was ever in `names`, and the bank-trip
        // gate AFTER this call in the fleet loop never ran. `tunnelStopReason` ends
        // the call and NAMES the reason instead.
        const stop = tunnelStopReason({ done, maxBlocks, stalls, diglessIters, elapsedMs: Date.now() - start, maxMs, stopRequested: !!shouldStop?.(), alive: !!bot.entity })
        if (stop) {
          stopped = stop
          // (v0.16.4 lesson) the reason MUST reach the log - a silent abort is
          // exactly the 390 s hole this guard closes. shouldStop/no entity are
          // the caller's own machinery, not tunnel failures: stay silent there.
          if (stop !== 'shouldStop' && stop !== 'no entity') {
            log(`${tag} tunnel: stopping after ${((Date.now() - start) / 1000).toFixed(0)}s (${stop}, done=${done}) - the caller rotates`)
          }
          break
        }
        const from = bot.entity.position.floored()
        const feetCell = from.offset(d.x, 0, d.z)
        const feetB = bot.blockAt(feetCell)
        const headB = bot.blockAt(feetCell.offset(0, 1, 0))
        // lava/water ahead: stop this gallery, the caller rotates the direction
        if ((feetB && feetB.boundingBox === 'fluid') || (headB && headB.boundingBox === 'fluid')) break
        // (v0.140.0) THE GRAVITY ROOF FENCE - the gallery face is the suffocate
        // kill site (run554: six bots buried, F5+F3 in ONE pocket). The bot
        // STEPS INTO this column: any sand/gravel riding above the head cell
        // collapses onto the bot's own head the moment the step-in completes.
        // Clear the column top-down first; a column that will not exhaust
        // refuses this gallery's advance (the caller rotates) - named.
        const roof = await gravityClearBefore(feetCell)
        if (!roof.ok) {
          stats.gravityRefused = (stats.gravityRefused ?? 0) + 1
          if (stats.gravityRefused <= 2) log(`${tag} tunnel: ${roof.why}`)
          break
        }
        if (roof.cleared > 0) stats.gravityCleared = (stats.gravityCleared ?? 0) + 1
        // clear the feet cell first (one-type names gate honoured; a refused break
        // is NOT counted - see lesson 1)
        if (feetB && feetB.type !== 0) {
          if (names && !names.includes(feetB.name)) break
          if (await bot.fastDig(feetB)) {
            done++
            diglessIters = 0
            stats.mined++
            stats.byName[feetB.name] = (stats.byName[feetB.name] || 0) + 1
            map?.take(feetB.name, feetCell) // (v0.173.0) the cell is gone - the map must not steer at it
          }
        }
        if (headB && headB.type !== 0 && (!names || names.includes(headB.name))) {
          if (await bot.fastDig(headB)) {
            done++
            diglessIters = 0
            stats.mined++
            stats.byName[headB.name] = (stats.byName[headB.name] || 0) + 1
            map?.take(headB.name, feetCell.offset(0, 1, 0)) // (v0.173.0) same hygiene for the head cell
          }
        }
        // (v0.107.0) the torch rhythm rides the diglessIters reset: 0 here <=> this
        // cut dug something (either branch resets it, the step below only increments
        // it; the FIRST cut also reads 0 from the initialization - at worst the very
        // first rhythm lands one cut early, a rounding error the light gain keeps).
        // Same contract as the shaft lane: count every successful dig, place a wall
        // torch every TORCH_SPACING, silent on any failure - a dark gallery is
        // survivable, a broken loop is not.
        if (diglessIters === 0) {
          digsSinceTorch++
          if (torchDue({ digsSinceTorch })) {
            await restockTorchesHere()
            if (await placeTorchHere({ dirs: tunnelTorchDirs })) digsSinceTorch = 0
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
        diglessIters++ // a move is NOT progress - only a dig resets this (v0.35.0)
        await bot.waitForTicks(2) // gravity/step settle before the next cut
      }
    } catch { /* never break the caller's loop */ }
    const secs = (Date.now() - start) / 1000
    return { done, secs, rate: secs > 0 ? done / secs : 0, stopped }
  }

  // (v0.84.0) THE VEIN SWEEP: a straight 1x2 gallery digs the LINE, never the
  // wall beside it - run78 (dispatch 35755975607) fired 29 iron steers at cross
  // 0.3-3.3 (the vein sits BESIDE the axis, targets 2.1-5.2b away) and raw_iron
  // still read ZERO, so the whole smelt -> ingot -> pickaxe chain died at the
  // first link. After a tunnel stops, sweep the named ores within reach and
  // fastDig them: the gallery just exposed the wall faces, fastDig equips the
  // harvesting tool, and its false-resolve keeps the count honest (a sealed or
  // out-of-reach ore is simply not counted - the tunnel lesson 1). A second
  // sweep catches veins that hide behind the first dug ore. stats-mirroring
  // like the tunnel: every dig lands in stats.mined / stats.byName.
  async function veinSweep (names, { reach = 4.5, sweeps = 2, shouldStop = null } = {}) {
    if (!Array.isArray(names) || !names.length) return 0
    let dug = 0
    let refused = 0
    try {
      for (let sweep = 0; sweep < sweeps; sweep++) {
        const batch = bot.findBlocks({ matching: b => names.includes(b.name), maxDistance: reach, count: 12 })
        let progressed = false
        for (const pos of batch) {
          if (shouldStop?.()) return dug
          const blk = bot.blockAt(pos)
          if (!blk || blk.type === 0) continue
          // (v0.98.0) THE VEIN FALL FENCE: run87's F4 dug '8 ores beside the
          // gallery' then fell 20+ blocks to its death - this sweep dug cells
          // hanging over caves with no terrain check, while the shaft digger
          // itself sidesteps exactly these (dropAheadBelow >= 4). An ore is a
          // bonus, a 20-block fall is a funeral: the same dropAheadBelow the
          // descent uses now fences every sweep cell (blind reads refuse too).
          const airBelow = dropAheadBelow(pos)
          const refusal = veinDigRefusal({ airBelow })
          if (refusal) {
            refused++
            if (refused <= 2) log(`${tag} vein sweep: refused a cell - ${refusal}`)
            continue
          }
          // (v0.140.0) the gravity roof fence: an ore with sand/gravel above it
          // collapses into the cell (the detour walks the bot under the refill)
          const roof = await gravityClearBefore(pos)
          if (!roof.ok) {
            refused++
            if (refused <= 2) log(`${tag} vein sweep: refused a cell - ${roof.why}`)
            continue
          }
          if (await bot.fastDig(blk)) {
            dug++
            stats.mined++
            stats.byName[blk.name] = (stats.byName[blk.name] || 0) + 1
            map?.take(blk.name, pos) // (v0.173.0) mined away - the map must not steer the fleet at this cell again
            progressed = true
          }
        }
        if (!progressed) break
      }
      // (v0.173.0) THE SWEEP DROP HARVEST: run74's F13 logged '9 ores dug beside
      // the gallery' and its pocket read ZERO coal at every snapshot - the sweep
      // digs in place (reach 4.5) but the drop lands INSIDE the freed cell, 2-4
      // blocks away and often behind the dug face, and pickup only happens inside
      // ~1.5 blocks. The fleet ledger counted coal_ore=175 mined while the
      // pockets held ~23: the ore-detour's conversion died between the dig and
      // the pocket, and the fuel front starved at exactly that link. sweep() and
      // chopReachable already walk their drops - the underground sweep was the
      // only digger that never did. One bounded walk, pocket-delta counted: a
      // sealed drop is left for the despawn, never a clock burn.
      if (dug > 0) {
        // (v0.175.0) THE SWEEP DROP INSTRUMENT: run64 (36118883464, the union
        // fleet) measured the v0.173.0 drop walk firing ZERO '+Nu walked'
        // lines across 29 sweeps (2-14 ores dug each) while the pocket read
        // coal-zero at every snapshot - and the walk is silent BOTH when
        // dropTargets sees nothing AND when every gotoSafe refuses (the
        // doomed-goal consult, the stall governor, the water-rescue gate all
        // throw into the silent catch). The diag on the live testbed proved
        // the item entities ARE tracked and named ('item', type=other), so
        // the pick filter is fine - the missing piece is the VERDICT. Name
        // the count once per sweep, name the first walk failures with the
        // refusal message, name the zero-pickup end: the next fleet decodes
        // WHICH gate eats the drops without another blind run.
        const load0 = inventoryLoad(bot).units
        const targets = dropTargets(bot.entities, bot.entity?.position, { maxDistance: SWEEP_DROP_REACH, cap: SWEEP_DROP_CAP })
        log(`${tag} vein sweep: ${targets.length} drop(s) in reach (${dug} dug)`)
        const dropFence = Date.now() + SWEEP_DROP_TOTAL_MS
        let dropFails = 0
        let belowFails = 0
        let skipDeep = 0
        let lipDigs = 0
        for (const d of targets) {
          if (shouldStop?.() || !bot.entity || Date.now() > dropFence) break
          // (v0.178.0) THE BELOW-PLANE GOAL RANGE: a drop resting 1-2 BELOW the
          // walk plane (in the freed cell / down the fresh shaft) made GoalNear
          // range 1 a 3D sphere no standable cell enters - x33 'timeout after
          // 8000ms' in the v0.177.0 fleet (fleet 36131508220), the same cells
          // re-failing every sweep. The lip beside/above the drop is a legal
          // arrival at range 2; a flat drop keeps the legacy range 1.
          // (v0.182.0) THE DEEP SKIP: the planner's third verdict - a drop
          // resting deeper than the lip sphere reaches (dy < -2, 3D dist > 2
          // from every standable cell) walks NOTHING: the x10 named residue
          // ('the drop rests deeper than the lip') never converged once, so
          // the walk was 8s of guaranteed spiral buying zero pickups. The
          // batch fence gets the 8s back; a later sweep at a different stance
          // may reclassify the same drop into the lip sphere.
          // (v0.187.0) the converged BELOW arrival's last mile is the LIP
          // DIG-DOWN below - the dig-under that closes the magnet gap.
          const dyWalk = d.y - bot.entity.position.y
          const range = dropGoalRange({ dy: dyWalk })
          if (range === DROP_GOAL_SKIP) { skipDeep++; continue }
          let landed = false
          try {
            await gotoSafe(bot, new goals.GoalNear(d.x, d.y, d.z, range), { timeoutMs: SWEEP_DROP_TIMEOUT_MS, label: 'sweep drops' })
            landed = true
          } catch (e) {
            // (v0.187.0) the DY INSTRUMENT: the failed line names its dy family -
            // the v0.178.0 below-plane cure's residue names only x6 of the run's
            // x28 timeouts (fleet 36181152847); the rest are plane-range walks
            // whose failure family is UNMEASURED (water holes? above-plane
            // ledges? sealed cells?). The next decode splits the class by the
            // (dy, range) pair it rides and the next cure derives from
            // measurement, not speculation (the v0.178.0 above-plane stance).
            if (dropFails < 2) log(`${tag} vein sweep: the drop walk to [${Math.round(d.x)},${Math.round(d.y)},${Math.round(d.z)}] failed - ${e.message} (dy ${dyWalk.toFixed(1)}, range ${range})`)
            dropFails++
            if (range === DROP_GOAL_BELOW) belowFails++
          }
          // (v0.187.0) THE LIP DIG-DOWN: a BELOW-class walk that CONVERGED parks
          // the bot on the lip (3D dist ~1.8-2.0, the legal v0.178.0 arrival) -
          // but the pickup magnet reaches ~1.5, so the drop rides the despawn
          // outside reach (fleet 36181152847: x8 of the x11 zero-pickup sweeps
          // logged ZERO failed walks - the arrival happened, the pickup didn't).
          // Dig the ONE solid block under the lip stance: the bot drops 1-2 into
          // the hole, the drop is at its feet, the magnet sweeps it. Every guard
          // is a measured fence (src/lib/drops.mjs): the fall column reads 1..2
          // air cells, the column reads DRY, the drop sits inside the lip sphere;
          // junk anywhere refuses the dig (a missing read never arms an action).
          // (v0.189.0) the gate reads the BELOW DY FAMILY, not the range number:
          // the new ABOVE verdict shares the wide 2, and a ledge arrival must
          // never arm a dig-under (the drop is UP - the floor there is floor).
          if (landed && dyWalk < DROP_GOAL_BELOW_DY && dyWalk >= DROP_GOAL_DEEP_DY) {
            const dyLip = d.y - bot.entity.position.y
            const feet = bot.entity.position.floored()
            const airBelow = dropAheadBelow(feet, { depth: 3 })
            const strike = fluidStrikeBelow(feet, { depth: 3 })
            if (lipDigWanted({ range, airBelow, fluidBelow: strike !== null, dy: dyLip })) {
              const cover = bot.blockAt(feet.offset(0, -1, 0))
              if (cover && cover.boundingBox === 'block' && !SHAFT_FLUID_NAMES.has(cover.name)) {
                try { await bot.fastDig(cover); lipDigs++ } catch { /* the dig-down is a bonus - never a failure */ }
              }
            }
          }
        }
        const picked = Math.max(0, inventoryLoad(bot).units - load0)
        if (picked > 0) log(`${tag} vein sweep: +${picked}u walked from the drops (${dug} dug)`)
        else if (targets.length > 0) log(`${tag} vein sweep: the drop walks picked nothing (pocket delta 0, ${dropFails} failed walk(s))`)
        if (belowFails > 0) log(`${tag} vein sweep: ${belowFails} below-plane walk(s) still failed on the wide goal (range 2) - the drop rests deeper than the lip`)
        if (skipDeep > 0) log(`${tag} vein sweep: ${skipDeep} deep drop(s) skipped (dy < -2 - the lip sphere cannot reach, the walk was a guaranteed spiral)`)
        if (lipDigs > 0) log(`${tag} vein sweep: ${lipDigs} lip dig-down(s) - the range-2 arrival left the drop outside the magnet, the last mile dug`)
        // (v0.203.0) the sweep drop ledger: the counters ride stats so the fleet
        // RESULT can aggregate them - the per-sweep lines were the only read and
        // the below-plane residue had no day-scale trend (the v0.187.0 unmeasured
        // plane class splits from the below class here at last)
        try {
          const sd = stats.sweepDrops ?? (stats.sweepDrops = { sweeps: 0, picked: 0, failed: 0, below: 0, deepSkip: 0, lipDig: 0 })
          sd.sweeps++
          sd.picked += picked
          sd.failed += dropFails
          sd.below += belowFails
          sd.deepSkip += skipDeep
          sd.lipDig += lipDigs
        } catch { /* a torn stats view never kills the sweep */ }
      }
    } catch { /* a sweep is a bonus - never a failure */ }
    if (refused > 2) log(`${tag} vein sweep: ${refused} cell(s) refused by the fall fence`)
    return dug
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
          claimTrip(known) // (v0.15.0) the walk is ours - the fleet spreads to other clusters
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
          // (v0.110.0) THE COLLECT GAIN FLOOR: the delta can read negative when
          // anything consumes pocket items while the collect runs (a breaking
          // tool, food under mob pressure, the 26.2 stale-view flip) - run98's
          // F9 mined its way to -17. A loss is not a negative mine.
          const gained = collectGain(before, inventoryCount())
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
    let reads = 0
    for (let dy = 1; dy <= depth; dy++) {
      const b = bot.blockAt(new Vec3(fromPos.x, fromPos.y - dy, fromPos.z))
      if (!b) continue // unloaded chunk: not dangerous BY ITSELF, but counted below
      reads++
      if (DANGEROUS.has(b.name)) return true
      if (b.boundingBox !== 'empty') return false // solid ground seals the column
    }
    // (v0.86.0) THE STALE-WINDOW REFUSAL: run78 measured 13 deaths (8 fall/env)
    // in the flooded quarry while both probes were live - a window that answers
    // ZERO real reads is not "safe", it is BLIND (the v0.76.0 stale-read class).
    // A blind probe refuses the column (sidestep, bounded by SIDESTEP_CAP)
    // instead of digging into an unread floor. The bot STANDS in this chunk, so
    // a zero-read window is a server/stale-read event, not normal geography.
    return reads === 0
  }

  // (v0.84.0) The same scan, but it ANSWERS: the y and name of the first fluid
  // below the dig cell. lavaAheadBelow stays boolean for the guard; this one
  // feeds the water table - a strike is the one observation that makes the
  // regional ceiling real (the hazard ledger remembers WHERE a rescue
  // happened, the table remembers HOW DEEP the water sits BEFORE anyone drowns).
  function fluidStrikeBelow (fromPos, { depth = 4 } = {}) {
    for (let dy = 1; dy <= depth; dy++) {
      const b = bot.blockAt(new Vec3(fromPos.x, fromPos.y - dy, fromPos.z))
      if (!b) continue // unloaded chunk: no strike to claim
      if (DANGEROUS.has(b.name)) return { y: fromPos.y - dy, name: b.name }
      if (b.boundingBox !== 'empty') return null // solid ground seals the column
    }
    return null
  }

  // How many AIR blocks start directly below `fromPos` (which is ABOUT TO BE dug).
  // A 4+ block fall deals damage and a shaft that punches through a cave ceiling
  // drops the bot into a dark pit full of whatever lives there - measured live:
  // a bot dug 16 stone, fell into a cavern, took 20 -> 5 fall damage and DIED,
  // losing the whole inventory. Vanilla players never dig straight down for exactly
  // this reason; the bot must measure before it digs.
  function dropAheadBelow (fromPos, { depth = 5 } = {}) {
    let air = 0
    let reads = 0
    for (let dy = 1; dy <= depth; dy++) {
      const b = bot.blockAt(new Vec3(fromPos.x, fromPos.y - dy, fromPos.z))
      if (!b) break // (v0.86.0) a null read cannot count as AIR and cannot seal either - counted below
      reads++
      if (b.boundingBox === 'empty') air++
      else break
    }
    // (v0.86.0) THE STALE-WINDOW REFUSAL, drop tier: zero real reads = blind,
    // and blind digs are how 8 fall/env deaths happened in run78's quarry
    // (the guards were live the whole run). Report the WORST (a full-depth
    // drop) so the fall guard sidesteps; SIDESTEP_CAP keeps the cost bounded
    // and the caller rotates. The Number(null) lesson in probe form.
    return reads === 0 ? depth : air
  }

  // (v0.10.0) One wall torch at head level in the shaft we are standing in. Wall-
  // attached ON PURPOSE: a floor torch pops the moment digShaft eats the block
  // under it (place -> dig -> pop -> pickup loops forever). A torch has no
  // collision shape, so vanilla accepts it in the cell we are about to occupy;
  // with the next fall the torch ends up ABOVE our head, attached to the wall,
  // and lights the column we came down through. Bounded and silent: placement
  // must never break the dig loop.
  // (v0.107.0) optional `dirs` overrides the wall-candidate order: the tunnel lane
  // excludes its travel face (torchWallDirs({ d })) so the next cut cannot eat the
  // torch; the shaft lane (and any junk call) keeps the full v0.10.0 base set.
  // (v0.137.0) THE TORCH PLACEMENT LEDGER - run551 crafted ~16 torches and
  // placed FIVE (stats.torched=5): the v0.10.0 'bounded and silent' contract
  // left every failure class invisible, so the decode cannot tell pocket-dry
  // from no-free-cell from no-valid-wall from the placeBlock timeout. Each
  // class counts; the FIRST hit of each class per streak names itself once (a
  // landing re-arms the naming - one line per class per streak, not one per
  // dig; the counters stay on for the final-snapshot decode).
  const torchLedger = { dry: 0, cell: 0, wall: 0, place: 0, named: {} }
  function torchDidNotLand (cls) {
    torchLedger[cls] = (torchLedger[cls] ?? 0) + 1
    if (torchLedger.named[cls]) return
    torchLedger.named[cls] = true
    log(`${tag} torch: the placement did not land (${cls}) x${torchLedger[cls]} - the streak names itself once, a landing re-arms it`)
  }

  // (v0.137.0) THE DRY-POCKET RESTOCK - the craft half of the torch rhythm ran
  // only at shaft entry, and run551's entry ledger (405 skips: 'no spare
  // sticks' x252, 'no coal' x153) shows that single moment rarely funds BOTH
  // sides - the coal arrives from the ore the lane steers to MID-RUN. When the
  // placement rhythm fires on a dry pocket and the CURRENT snapshot funds a
  // batch, the craft re-attempts here (silent when nothing funds - the entry
  // lane owns the skip lines; the ledger's 'dry' class counts the remainder).
  async function restockTorchesHere () {
    const sticks = countItem(bot, 'stick')
    const coals = countItem(bot, 'coal') + countItem(bot, 'charcoal')
    if (!torchRestockWanted({ torches: countTorches(inventoryItems(bot)), sticks, coals })) return
    try { await craftTorches(bot, { log: msg => log(`${tag} ${msg}`) }) } catch { /* keep digging */ }
  }

  async function placeTorchHere ({ dirs = null } = {}) {
    try {
      const torch = inventoryItems(bot).find(i => i.name === 'torch')
      if (!torch) { torchDidNotLand('dry'); return false }
      const cell = bot.entity.position.floored().offset(0, 1, 0)
      const cellB = bot.blockAt(cell)
      if (!cellB || cellB.boundingBox !== 'empty') { torchDidNotLand('cell'); return false } // no free cell right now
      let faced = false
      for (const [dx, dz] of (Array.isArray(dirs) && dirs.length ? dirs : torchWallDirs({}))) {
        const wall = bot.blockAt(cell.offset(dx, 0, dz))
        if (!wall || wall.boundingBox !== 'block') continue // air / fluid / out of world
        faced = true
        await bot.equip(torch, 'hand')
        // vanilla drops right-clicks that arrive <4 ticks apart (the placeTable
        // lesson) - the dig rhythm around this call paces the attempts naturally
        await bot.waitForTicks(5)
        try {
          await withTimeout(bot.placeBlock(wall, new Vec3(-dx, 0, -dz)), 5000, 'shaft torch')
        } catch {
          // (v0.137.0) the timeout no longer aborts the remaining faces - the
          // next wall candidate still gets its try (the old outer catch ended
          // the whole loop on the first failed face)
          torchDidNotLand('place')
          continue
        }
        stats.torched++
        torchLedger.named = {} // a landing re-arms every class's naming
        return true
      }
      if (!faced) torchDidNotLand('wall')
      return false
    } catch { torchDidNotLand('place'); return false }
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
    let consecSidesteps = 0 // consecutive sidesteps without a successful dig - CI 35491904900 measured the carousel:
    // a water pocket below y=49 made the fluid guard sidestep the SAME spot every 40 s (3x in a row, 80 s burned),
    // then the smelt test ran out of budget. Sidestep is correct, unbounded sidestep is a hang - give up honestly.
    const SIDESTEP_CAP = 6
    while (done < maxBlocks && !shouldStop?.() && bot.entity && Date.now() - started <= maxMs) {
      // health guard: damaged bots defend FIRST (v0.11.0), then wait to regen.
      // The old code only waited - measured 2026-09-20: a zombie hit 20 -> 5.7 ->
      // dead in 9 s while the guard "paused descent" for 30 ticks at a time.
      const hp = bot.health ?? 20
      if (hp < lastHealth - 0.5) {
        log(`${tag} digShaft: health dropped ${lastHealth.toFixed(1)} -> ${hp.toFixed(1)}, pausing descent`)
        try { await defendSelf('digShaft') } catch { /* never let defense break the dig loop */ }
        try { await withTimeout(bot.waitForTicks(30), 2000, 'digShaft settle') } catch { /* dead physics: the budget ends the dig */ }
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
          try { await withTimeout(bot.waitForTicks(40), 2000, 'digShaft heal settle') } catch { /* dead physics: the budget ends the dig */ }
          break
        }
        continue
      }
      lastHealth = hp

      // (v0.62.0) a running rescue owns the controls: an in-flight shaft that
      // keeps digging while the rescue swims is the F1 dual-owner class - the
      // run60 F16 log shows a digShaft hazard refusal BETWEEN two rescue lines.
      // Break per-iteration; the caller's rotate logic redeploys us later.
      if (swimming || bot._waterRescue) break

      const pos = bot.entity.position.floored().offset(0, -1, 0)
      if (pos.y <= floor) break
      // (v0.59.0) the WATER MEMORY gate: a rescue just handed us back - if we
      // stand inside a live hazard cell (the flooded column the last rescue
      // escaped), continuing THIS descent re-dives the bot. Fleet 35657683920:
      // F16 rescued four times in a row (2.2-3.4s each) and died in the fifth
      // cycle, because nothing remembered the water. Give the shaft up - the
      // caller rotates/hops 24-32 blocks out, and the memory keeps the new
      // spot honest too. The record is the rescue's own position, so a bot
      // digging a DRY shaft 5+ blocks from the lake edge is unaffected.
      const hazard = waterHazards.near(bot.entity.position)
      if (hazard) {
        log(`${tag} digShaft: water hazard ${hazard.d.toFixed(1)}b away (live ${waterHazards.size}) - refusing this column, the caller rotates`)
        break
      }
      // (v0.84.0) THE WATER TABLE ceiling: a fluid strike recorded anywhere in
      // this region (by ANY bot, in ANY earlier shaft - the board is fleet-shared)
      // binds every later descent here. The shaft stops WT_MARGIN above the
      // strike and the tunnel doors (floor lock / ore detour) turn the stopped
      // shaft into horizontal mining at the dry level. MEASURED (run76): the
      // hazard ledger remembers WHERE a rescue happened but the aquifer is
      // REGIONAL - the next shaft 24-32 blocks away digs into the same lake
      // (53 still-wet timeouts, F6+F9 owned 19/26 hazard refusals in the same
      // y band). A strike at/above the entry is a LID, not a ceiling -
      // shaftCeiling returns null then and the fluid guard stays the backstop.
      const ceiling = waterTables.ceilingFor(pos, stats.shaftEntryY)
      if (ceiling != null && pos.y - 1 <= ceiling) {
        log(`${tag} digShaft: water table y=${ceiling} (region strike) - stopping above the aquifer, the tunnel owns this level (regions ${waterTables.size})`)
        break
      }
      // fluid guard: a column that opens into lava/water within 4 blocks is a death trap
      const strike = fluidStrikeBelow(pos)
      if (strike) {
        // (v0.84.0) record the strike BEFORE the sidestep: the world is
        // seed-constant, so this y is a regional truth - every later shaft in
        // this region stops above it instead of paying the flood + the rescue
        const regions = waterTables.record({ x: pos.x, y: strike.y, z: pos.z })
        log(`${tag} digShaft: ${strike.name} strike at y=${strike.y} -> water table (regions ${regions}); fluid below ${pos.floored()} - moving sideways`)
        const dir = [new Vec3(1, 0, 0), new Vec3(0, 0, 1), new Vec3(-1, 0, 0), new Vec3(0, 0, -1)][sidestepRounds % 4]
        sidestepRounds++
        if (++consecSidesteps >= SIDESTEP_CAP) {
          log(`${tag} digShaft: giving up this shaft (${consecSidesteps} fluid/drop sidesteps, no dig between) - the caller rotates`)
          break
        }
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
        const dir = [new Vec3(1, 0, 0), new Vec3(0, 0, 1), new Vec3(-1, 0, 0), new Vec3(0, 0, -1)][sidestepRounds % 4]
        sidestepRounds++
        if (++consecSidesteps >= SIDESTEP_CAP) {
          log(`${tag} digShaft: giving up this shaft (${consecSidesteps} fluid/drop sidesteps, no dig between) - the caller rotates`)
          break
        }
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
          consecSidesteps = 0 // a real dig: the carousel counter resets (sidesteps only matter between digs)
          stats.mined++
          stats.byName[block.name] = (stats.byName[block.name] || 0) + 1
          // torch rhythm (v0.10.0): a wall torch every TORCH_SPACING digs keeps the
          // whole column above the hostile-spawn light threshold; torchDue also
          // fires early when the bot can READ darkness. Silent on any failure.
          digsSinceTorch++
          if (torchDue({ digsSinceTorch })) {
            await restockTorchesHere()
            if (await placeTorchHere()) digsSinceTorch = 0
          }
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
          if (++consecSidesteps >= SIDESTEP_CAP) {
            log(`${tag} digShaft: giving up this shaft (${consecSidesteps} sidesteps, undiggable floor) - the caller rotates`)
            break
          }
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
  // STAIRCASE exit from the 1x1 dig shaft (v0.14.0). The pathfinder cannot
  // climb out of a shaft the bot dug straight down (no stairs, no ladder) - which
  // stranded every bot underground and made the whole surface economy dead:
  // fleet 35485296464 (600s) ended banked=0 smelted=0 sand=0 with sand=110 KNOWN
  // positions on the map and 38x 'map trip skipped: unreachable'.
  //
  // The first implementation pillar-jumped (leap + place a block beneath at the
  // apex). Three CI fleets killed it: the height poll reads a perfectly clear
  // 1.12-1.20 above the fill cell (fleet 112 diag) and the server STILL rejects
  // every placement - mineflayer's placeBlock waits for a block-update that
  // never comes, the timeout burns wall after wall, 0 climbs succeeded. Block
  // PLACEMENT is server-suspect; block DIGGING + raw movement are proven by
  // three fleets of tunnels (53 full tunnels in fleet 35485296464 alone).
  // So the climb is now a 45-degree DIG STAIRCASE: clear the step cells
  // diagonally up, then step onto them with forward+jump (vanilla movement,
  // always legal). ~2 digs + 1 jump per level, no placement anywhere.
  // Never throws: a failed climb costs the caller its trip/banking, not the bot.
  async function climbOut ({ dir = null, maxUp = PILLAR_LEVEL_CAP, maxMs = PILLAR_MAX_MS, shouldStop = null, force = false, targetY = null } = {}) {
    noteGlobal('climb') // (v0.62.0) the staircase digs are a per-level A*-free path, but the walkable-surface verdict follows climbs - mark the site
    enablePhysicsMode()
    configureGroundMovements()
    if (!bot.entity) return { ok: false, reason: 'no entity', gained: 0, dug: 0, steps: 0 }
    // (v0.70.0) THE CLIMB-RESCUE OWNERSHIP GATE. MEASURED (run67, dispatch
    // 35692049905): the blackbox freeze dump read 'climb @+0.0s <-
    // water:rescue @+-1.9s' - a climbOut started 1.9s INTO a live rescue, two
    // owners on one bot (the v0.62.0 digShaft dual-owner class, one level
    // up). A live rescue owns the controls; the staircase's digs and jumps
    // under it re-dive the bot into the column the rescue is leaving. The
    // mirror edge is already settled (v0.17.0): a wet-escape traverse
    // (_climbEscape) makes the SENTRY yield because the escape IS the way
    // out. The refusal reuses the 'exhausted' shape every caller handles.
    const owner = climbOwnerGate({ waterRescue: bot._waterRescue === true, climbEscape: bot._climbEscape === true })
    if (owner.refuse) {
      return { ok: false, reason: owner.reason, gained: 0, dug: 0, steps: 0 }
    }
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
    // (v0.158.0) THE YARD-RAISED TARGET: the caller (the bank chains) may raise
    // the surface reference to the YARD's level - the recorded shaft entry can
    // sit tens of levels BELOW the yard (the F6 class: bot at y=41, entry 44,
    // yard 80), and a climb that stops at the entry hands the walk ladder a
    // doomed vertical. climbTargetY only ever RAISES the target: a yard at or
    // below the entry and every legacy caller (targetY absent) keep the
    // entry-record shape byte for byte.
    const raisedTargetY = climbTargetY({ entryY, targetY })
    const plan = pillarTarget({ feetY: feet0.y, targetY: raisedTargetY, skyLitAt, maxUp })
    if (plan.levels <= 1) {
      // being out proves the climb problem solved: forget any stale exhaustion
      // (v0.18.0) so a later descent never inherits a dead wall's ledger
      bot._climbLedger = climbLedgerUpdate(bot._climbLedger, { ok: true, feetY: feet0.y, now: Date.now() })
      return { ok: true, reason: `already out (${plan.source})`, gained: 0, dug: 0, steps: 0 }
    }
    // (v0.18.0) DEEP CLIMB PERSISTENCE: the ladder lives on the bot across
    // calls. From the y=42 aquifer floor one call's budgets (4 fails, 2
    // galleries) cannot cross several wet bands - measured as endless
    // 'failed - stalled' repeats, every call fresh in the same wet mess.
    // Now an unhealed ladder escalates (2x/3x budgets + rotated bearing) and
    // an exhausted one refuses instantly for a cooldown instead of burning
    // the loop's time on a proven wall. A refusal must NOT touch the ledger:
    // a hammered refusal would restart the cooldown forever.
    // (v0.21.0) force = the final-bank escape hatch: an exhausted ledger still
    // gets ONE stage-1 attempt instead of the refusal (see climbEntry).
    const entry = climbEntry(bot._climbLedger, { now: Date.now(), feetY: feet0.y, force })
    if (entry.refused) {
      return { ok: false, reason: 'exhausted', waitSecs: Math.ceil(entry.waitMs / 1000), gained: 0, dug: 0, steps: 0, traversed: 0 }
    }
    const failLimit = entry.failLimit // stage ladder, replaces PILLAR_FAIL_LIMIT
    const wetAttempts = entry.wetAttempts // stage ladder, replaces TRAVERSE_MAX_ATTEMPTS
    // horizontal bearing for the staircase: the caller's deployment direction is
    // a fine default (it leads AWAY from the yard); snap it to a pure cardinal.
    // An escalated stage starts on a ROTATED bearing - repeated calls must not
    // re-dig into the same aquifer wall that refused stage 0.
    const raw = dir && (dir.x || dir.z) ? dir : new Vec3(1, 0, 0)
    let d = Math.abs(raw.x) >= Math.abs(raw.z)
      ? new Vec3(Math.sign(raw.x) || 1, 0, 0)
      : new Vec3(0, 0, Math.sign(raw.z) || 1)
    const rotate = () => { d = new Vec3(-d.z, 0, d.x) } // 90 degrees: a refused wall rotates away
    for (let i = 0; i < entry.rotateBy; i++) rotate()
    let dug = 0
    let steps = 0
    let fails = 0
    let wetTries = 0 // (v0.17.0) wet-escape galleries opened this climb
    let wetWalks = 0 // (v0.159.0) wet-escape galleries that MOVED the bot - the walked ladder
    let traversed = 0 // (v0.17.0) horizontal escape blocks walked
    let diagLevels = 0 // climb diag: log the first 3 failed levels per climb, not all 30
    let staleRecovered = 0 // (v0.76.0) stale-read recoveries this climb, first 3 logged
    let bridgePlaced = 0 // (v0.165.0) bridge fills this climb, bounded by BRIDGE_PLACE_MAX
    const start = Date.now()
    // One horizontal escape gallery under a wet ceiling (v0.17.0). The fleet
    // measured the trap (17:05 run): a shaft that turned into a water column
    // refuses every rotation with dug=0, the rescue times out 'still wet' (a
    // 1x1 down-flow beats swim-up), and the bot burns the whole run in the
    // climb<->rescue cycle. The escape digs a dry 1x2 gallery sideways out
    // from under the water with the PROVEN tunnel mechanics (fastDig + raw
    // forward steps), then hands back to the staircase loop - the gallery roof
    // is dry stone, exactly what the main loop digs. traverseStep guards every
    // step (waterfall above, gap below, wet/hard/unknown cells refuse).
    // _climbEscape makes the drown sentry yield: this IS the escape, and a
    // 25s tread-water rescue measured worse than 15s of purposeful digging.
    // (v0.24.0) settleTicks: every waitForTicks is race-bounded - a dead
    // connection stops physics ticks and an UNBOUNDED waitForTicks hangs the
    // climb (and the whole runner) forever; the loop budgets then end it.
    const settleTicks = async (n, label) => {
      try { await withTimeout(bot.waitForTicks(n), 2000, label) } catch { /* dead physics: the time/fail budgets end this climb */ }
    }
    const escapeTraverse = async ({ shouldStop }) => {
      const t0 = Date.now()
      let walked = 0
      let stalls = 0
      let rotations = 0 // (v0.29.0) refusals absorbed by rotating the bearing
      bot._climbEscape = true
      try {
        while (bot.entity && walked < TRAVERSE_MAX_BLOCKS && rotations < TRAVERSE_ROTATE_LIMIT && !shouldStop?.() && Date.now() - t0 < TRAVERSE_MAX_MS) {
          // (v0.85.0) THE LOW-O2 YIELD: the sentry yields to this escape, so an
          // escape that stalls under a wet ceiling drains the bar with nobody
          // watching (run77 F7 'drowned@0.8' AT SURFACE level inside an escape).
          // Below the floor the escape stops being the way out: return honestly,
          // the finally clears _climbEscape, and the sentry re-owns the bot.
          const o2Top = bot.oxygenLevel
          if (oxygenInDomain(o2Top) && o2Top <= CLIMB_ESCAPE_O2_FLOOR) {
            return { walked, resumed: false, reason: 'low-o2', o2: o2Top }
          }
          const feet = bot.entity.position.floored()
          const plan = traverseStep({ feet, d, read: cell => { try { return bot.blockAt(cell) } catch { return null } } })
          if (!plan.ok) {
            // (v0.29.0) ROTATE, NOT DIE: a traverseStep refusal is
            // BEARING-LOCAL (it reads only the cells along d), but the old
            // first-refusal return turned the escape into a single-bearing
            // probe - the fleet measured the cycle (F11: 'wet escape: 1 blocks
            // walked (gap)' -> staircase rotate -> wet again -> a fresh escape
            // into the SAME gap -> 'failed - stalled'), and each cycle fed the
            // rescue loop's 25s 'still wet' timeout (68 per 600s fleet). The
            // rotation is bounded by TRAVERSE_ROTATE_LIMIT (a full circle) and
            // the same walked/maxMs budgets - a genuinely sealed pocket gives
            // up honestly with 'sealed' and the staircase ladder escalates.
            // The dig-failure 'refused' below stays an immediate return: a
            // fastDig timeout is a block property, not a bearing property.
            rotations++
            rotate()
            await settleTicks(2, 'escape rotate settle')
            continue
          }
          for (const b of plan.digs) {
            // (v0.85.0) a submerged dig can burn ~200 ticks (~10s) - the bar
            // must be checked BETWEEN digs too, not only at the loop top
            const o2Mid = bot.oxygenLevel
            if (oxygenInDomain(o2Mid) && o2Mid <= CLIMB_ESCAPE_O2_FLOOR) {
              return { walked, resumed: false, reason: 'low-o2', o2: o2Mid }
            }
            let broke = false
            // maxTicks 200: a submerged dig needs ~115+ server ticks (5x
            // underwater penalty, no aqua affinity) - the plain 100-tick
            // window refuses exactly the digs the escape cannot fail on
            try { broke = await bot.fastDig(b, { maxTicks: 200 }) } catch { broke = false }
            if (!broke) return { walked, resumed: false, reason: 'refused' }
            dug++
            stats.mined++
            stats.byName[b.name] = (stats.byName[b.name] || 0) + 1
          }
          // raw forward step (the tunnel lesson: no pathfinder while conditions
          // are hostile); jump held like the staircase uses it - in shallow flow
          // it keeps the eyes above the water so digs run at full speed
          let moved = false
          try {
            await bot.lookAt(feet.offset(d.x, 1, d.z).offset(0.5, 0.5, 0.5), true)
            bot.setControlState('jump', true)
            bot.setControlState('forward', true)
            await settleTicks(10, 'escape move')
            bot.setControlState('forward', false)
            bot.setControlState('jump', false)
            const to = bot.entity.position.floored()
            moved = to.x !== feet.x || to.z !== feet.z
          } catch { /* stall accounting below */ }
          if (moved) stalls = 0
          else if (++stalls >= TRAVERSE_STALL_LIMIT) return { walked, resumed: false, reason: 'stalled' }
          walked++
          await settleTicks(2, 'escape settle') // gravity/water settle before the next cut
        }
        // (v0.29.0) the reason vocabulary changed: bearing refusals no longer
        // surface ('gap'/'wet'/'hard' were the old single-bearing returns) -
        // a sealed pocket (a full circle of refusals, walked=0) reports
        // 'sealed', everything else keeps the old 'budget'/'unknown' split.
        const reason = walked > 0 ? 'budget' : (rotations >= TRAVERSE_ROTATE_LIMIT ? 'sealed' : 'unknown')
        return { walked, resumed: walked > 0, reason }
      } finally {
        try { bot.clearControlStates() } catch { /* nothing held */ }
        bot._climbEscape = false
      }
    }
    while (bot.entity && !shouldStop?.() && fails < failLimit && steps < maxUp && Date.now() - start <= maxMs) {
      const feet = bot.entity.position.floored()
      if (feet.y >= plan.targetY) break
      // headroom for the step-up jump: the two cells above the feet. Inside the
      // shaft both are open (the bot dug them on the way down); a cave overhang
      // is dug through under the bounded ceiling budget. Fluids/bedrock stop.
      // (v0.25.0) GRAVITY PASSES: the old single bottom-up scan dug each step
      // once - into a sand/gravel column the upper block SANK into the cell
      // just cleared (fleet 35538062596: 'did not rise ... support=gravel
      // step=gravel' x10+ at the river beaches, 'climb out: failed - stalled'
      // at the final bank, banked=0 with full pockets). stepDigPlan re-plans
      // the four step cells until the column is exhausted: each pass eats the
      // sunk column's top off (beach bands run 2-4 blocks, STEP_MAX_PASSES=6
      // covers 12), and a genuinely wet/hard/unknown cell still refuses with
      // the old blocked/blockedWet flags so the wet-escape policy is untouched.
      let blocked = false
      let blockedWet = false // (v0.17.0) the refusal was water - a wet escape may exist
      let blockedRefusal = null // (v0.32.0) {cell, name, reason} of the refusing cell
      let digFailCell = null // (v0.37.0) {cell, name} of a fastDig that failed mid-pass
      // (v0.42.0) the flooded-dig context, read ONCE per step attempt: the eye
      // read matches mineflayer's digTime approximation, the feet read catches
      // the vanilla bounding-box rule (a bot standing in waist-deep water digs
      // x5 slower while its eye is still in air). A wet context takes the
      // flooded dig window AND routes a dig-failure to the wet escape - the
      // rotate-fail loop this class used to die in (6x 'final climb: failed -
      // stalled' in 35582520041) never reached the v0.17.0 policy because a
      // dig-fail did not set blockedWet.
      const readCell = cell => { try { return bot.blockAt(cell) } catch { return null } }
      const eyeWet = isWetCell(readCell(bot.entity.position.offset(0, 1.62, 0)))
      const feetWet = isWetCell(readCell(bot.entity.position.offset(0, 0.1, 0)))
      const wetContext = eyeWet || feetWet
      const digWindow = climbDigWindow({ eyeWet, feetWet })
      for (let pass = 0; pass < STEP_MAX_PASSES; pass++) {
        const plan = stepDigPlan({ feet, d, read: readCell, dug })
        if (plan.blocked) { blocked = true; blockedWet = plan.blockedWet; blockedRefusal = plan; break }
        if (plan.digs.length === 0) break // the step is clear - step onto it
        // (v0.39.0) the step digs take the PATIENT window (CLIMB_DIG_TICKS):
        // fleet 35572106504 measured 25+ 'dig failed at [,,] granite' refusals
        // from pick-less bots - a bare hand needs 150 ticks on stone-family,
        // over the plain 100-tick window, so the staircase could not cut one
        // cell and the climb burned its budget standing still. Slow mobility
        // beats a total stall; the plan's own `cell` names the failing cell
        // (the Block object carries no x/y/z - only .position - so the old
        // cellB.x read printed '[,,]').
        // (v0.42.0) the window is the WET-CONTEXT window (climbDigWindow): a
        // flooded shaft multiplies the server's validated dig time x5/x25 and
        // the dry window guarantees a false. A wet dig-failure now also sets
        // blockedWet - the wet escape fires for the hopeless stack instead of
        // the rotate-fail loop.
        for (const { cell: cellPos, block: cellB } of plan.digs) {
          let landed = false
          try { landed = await bot.fastDig(cellB, { maxTicks: digWindow }) } catch { landed = false }
          if (!landed) {
            // (v0.76.0) THE STALE-READ RECHECK. A fastDig false means either
            // 'the server never broke the block' (a genuine refusal) or 'the
            // server DID break it and the client world never applied the
            // delta' (a stale read - the run71/72 phantom-stone class: one
            // ceiling cell refusing the whole run while the bot held a pick).
            // Settle, re-read, and split the two: a GONE cell was dug - count
            // it and let the stair proceed; a still-solid cell refuses exactly
            // as before, now with the forensics suffix (held/ground/post) that
            // names the class in the fleet log.
            await settleTicks(12, 'climb dig stale recheck')
            let post = null
            try { post = readCell(cellPos) } catch { post = null }
            if (isDigLanded(post)) {
              dug++; stats.mined++; stats.byName[cellB.name] = (stats.byName[cellB.name] || 0) + 1
              if (staleRecovered++ < 3) log(`${tag} climb dig: stale read recovered at [${cellPos.x},${cellPos.y},${cellPos.z}] (${cellB.name}) - the server removed it, the client world lagged`)
              continue
            }
            digFailCell = {
              cell: [cellPos.x, cellPos.y, cellPos.z], name: cellB.name,
              detail: digRefusalDetail({
                heldName: (() => { try { return bot.heldItem?.name ?? null } catch { return null } })(),
                onGround: (() => { try { return bot.entity?.onGround ?? null } catch { return null } })(),
                postName: post && post.name ? post.name : null,
                postLanded: false
              })
            }
            blocked = true; blockedWet = wetContext
            break
          }
          dug++; stats.mined++; stats.byName[cellB.name] = (stats.byName[cellB.name] || 0) + 1
        }
        if (blocked) break
        // let the server's gravity updates land before the next scan: a sunk
        // block must be SEEN here, not discovered by a failed stepUp
        await settleTicks(4, 'climb gravity pass settle')
      }
      // the step needs solid ground at (feet + d) to land on - a cave gap there
      // is not a stair, rotate and try the next wall (read guarded: v0.24.0)
      let support = null
      try { support = bot.blockAt(feet.offset(d.x, 0, d.z)) } catch { support = null }
      if (!blocked && (!support || support.boundingBox !== 'block')) blocked = true
      if (blocked) {
        // (v0.17.0) WET ESCAPE: a wet refusal on a rotation-independent cell
        // (the ceiling above) is the flooded-shaft signature - rotation cannot
        // fix it and digging up floods the staircase. Dig sideways out from
        // under the water first; the staircase resumes from the dry gallery.
        if (blockedWet) {
          // (v0.159.0) THE WET-BAND LADDER: the gate + the account split the
          // two escape classes. Run15's anatomy: the legacy shape spent the
          // stage ladder's wetAttempts (2) on ESCAPES THAT MOVED THE BOT (F12:
          // 'wet escape: 2 blocks walked' then '5 blocks walked' - real
          // progress under the lake bed, counted as walls) and the staircase
          // then died the rotate-fail ladder in the next water column with
          // dug=32-48 on the clock. Now: a walked escape feeds the walked
          // ladder (ceiling 4), only a sealed pocket (walked=0) consumes the
          // stage ladder's sealed budget - the wet band gets crossed by
          // repeated galleries instead of one, and the maxMs + failLimit
          // fences bound everything exactly as before.
          const wetGate = wetEscapeGate({ wetTries, wetAttempts, wetWalks })
          if (wetGate.escape) {
            const esc = await escapeTraverse({ shouldStop })
            const acc = wetEscapeAccount({ walked: esc.walked, wetTries, wetWalks })
            wetTries = acc.wetTries
            wetWalks = acc.wetWalks
            traversed += esc.walked
            if (esc.walked > 0) log(`${tag} climb wet escape: ${esc.walked} blocks walked (${esc.reason}, walked ${wetWalks}/${WET_ESCAPE_WALK_CEILING})`)
            // (v0.85.0) THE LOW-O2 HANDOFF: the escape yielded at the air floor -
            // end the climb NOW (an honest 'exhausted'-shape return every caller
            // already handles) instead of looping into another wet gallery: the
            // finally has cleared _climbEscape, the drown sentry re-owns the bot
            // on its next tick and pages the rescue. The climb's own ledger must
            // NOT record a wall here: the escape did not fail, the air did.
            if (esc.reason === 'low-o2') {
              log(`${tag} climb wet escape: oxygen ${esc.o2} at the floor - the escape yields, the rescue lane owns the air`)
              return { ok: false, reason: 'low-o2', gained: 0, dug, steps, traversed }
            }
            if (esc.resumed) continue // fresh position - let the main loop re-judge
          }
        }
        // (v0.37.0) SURFACE HANDOFF on the blocked path. Fleet 35566494961 (the
        // first run whose bank trips finally fired): F2 climbed out, banked at
        // the surface, re-shafted, and the NEXT climb stalled at y=64 - 3x
        // 'blocked toward (dug=3..5)' across every bearing with the bot SKY-LIT
        // on solid ground. The support check demands a solid STEP cell (feet+d)
        // to keep rising, but flat open terrain has none in any direction: the
        // bot is already OUT and the raw loop cannot see it. The rise-failure
        // path has had the walkable-surface verdict since v0.23.0; the blocked
        // path never ran it ('cannot leave the shaft' 11x, map trips dead, the
        // climb half of every banking chain gated by a verdict that never
        // fires). Same probes, same skyLight gate - a bot standing at daylight
        // with 2+ walkable directions is out; the chest walk takes over.
        {
          // re-runs on every blocked event BY DESIGN: an early underground
          // refusal is dark (verdict false, free), the surface refusal that
          // matters comes later - the v0.23.0 shape. The verdict is a handful
          // of block reads gated by skyLight, not a walk.
          const feetBlocked = bot.entity.position.floored()
          let skyLitBlocked = false
          try { const fb = readCell(feetBlocked); skyLitBlocked = !!fb && (fb.skyLight ?? 0) >= 15 } catch { /* dark by default */ }
          const probesBlocked = (dx, dz) => {
            const stepC = readCell(feetBlocked.offset(dx, 1, dz))
            const floorC = readCell(feetBlocked.offset(dx, 0, dz))
            const belowC = readCell(feetBlocked.offset(dx, -1, dz))
            return {
              free: !!stepC && stepC.boundingBox === 'empty',
              solid: !!floorC && floorC.boundingBox === 'block',
              // (v0.37.0) the flat-ground direction: no wall at feet level, headroom
              // above it, ground BELOW it - the exact shape the support check just
              // refused (no step UP in open field)
              walkFlat: !!stepC && stepC.boundingBox === 'empty' && !!floorC && floorC.boundingBox === 'empty' && !!belowC && belowC.boundingBox === 'block'
            }
          }
          if (isWalkableSurface({ skyLit: skyLitBlocked, probes: probesBlocked })) {
            const gainedNow = feetBlocked.y - feet0.y
            stats.climbs = (stats.climbs ?? 0) + 1
            bot._climbLedger = climbLedgerUpdate(bot._climbLedger, { ok: true, gained: gainedNow, feetY: feetBlocked.y, now: Date.now() })
            log(`${tag} climb: walkable surface at y=${feetBlocked.y} (+${gainedNow} levels, dug=${dug}) - the walk takes over (blocked step)`)
            return { ok: true, reason: 'walkable surface', gained: gainedNow, dug, steps, traversed }
          }
        }
        // (v0.165.0) THE BRIDGE STEP: the support-less signature is exact - the
        // step cells read CLEAR (no blockedRefusal, no digFailCell) and only the
        // SUPPORT check set blocked (blockedWet stays false: it is only ever set
        // by a named stepDigPlan refusal or a wet dig fail). The run77/run74
        // fleets measured the class at the surface band (y=63-66: 42 + 13 diag
        // lines) - the bot stands on a one-cell lip, every neighbour floor is a
        // hole, and the rotate ladder burns its fail budget on the same four
        // holes. The bridge PLACES the missing floor with the pocket's cobble
        // (the camp build's standing-placement transport, never the airborne
        // pillar shape): a landed fill changes the geometry and the loop
        // re-judges WITHOUT a fail; a refused fill falls through to the honest
        // diag + rotate ladder. Budget: BRIDGE_PLACE_MAX fills per climb.
        if (!blockedWet && !blockedRefusal && !digFailCell) {
          const bp = bridgePlan({ feet, d, read: readCell, items: inventoryItems(bot), placed: bridgePlaced })
          if (bp.ok) {
            bridgePlaced = bp.placedNext
            let placedOk = false
            let lateRecovered = false
            let heldName = null
            let dist = null
            let refName = null
            let postB = null
            try {
              const countOf = n => inventoryItems(bot).filter(i => i.name === n).reduce((a, i) => a + i.count, 0)
              const before = countOf(bp.item.name)
              await withTimeout(bot.equip(bp.item, 'hand'), 5000, 'climb bridge equip')
              const refB = readCell(bp.refCell)
              refName = (() => { try { return refB && refB.name ? refB.name : null } catch { return null } })()
              dist = (() => { try { return bot.entity.position.distanceTo(bp.cell.offset(0.5, 0.5, 0.5)) } catch { return null } })()
              heldName = (() => { try { return bot.heldItem?.name ?? null } catch { return null } })()
              await withTimeout(bot.placeBlock(refB, new Vec3(bp.face.x, bp.face.y, bp.face.z)), PILLAR_PLACE_TIMEOUT_MS, 'climb bridge place')
              await settleTicks(10, 'climb bridge settle')
              let nowB = null
              try { nowB = readCell(bp.cell) } catch { nowB = null }
              placedOk = bridgeFillLanded({ postBlock: nowB, before, after: countOf(bp.item.name) })
              if (!placedOk) {
                // (v0.168.0) THE BRIDGE REFUSAL RETRY. run78 measured the
                // refusal class as TRANSIENT: 7 refusals, 7 distinct cells,
                // 4/7 riding a pit fill placed the tick before (the reference
                // IS the just-placed block), and the F16 cell [-113,64,384]
                // refused at ts~701s placed FINE on a later visit. The
                // v0.76.0 stale-recheck doctrine at the placement: settle,
                // re-verify once (a late block update converts honestly),
                // re-place ONCE (a lost packet converts), then the honest
                // refusal - the rotate ladder owns it as before.
                await settleTicks(BRIDGE_RECHECK_TICKS, 'climb bridge recheck settle')
                let post = null
                try { post = readCell(bp.cell) } catch { post = null }
                postB = post
                if (bridgeFillLanded({ postBlock: post, before, after: countOf(bp.item.name) })) {
                  placedOk = true
                  lateRecovered = true
                  if (diagLevels < 3) log(`${tag} climb bridge: the ${bp.kind} fill at [${bp.cell.x},${bp.cell.y},${bp.cell.z}] landed late (the settle raced the block update) - the step re-judges`)
                } else {
                  try {
                    const refB2 = readCell(bp.refCell)
                    await withTimeout(bot.placeBlock(refB2, new Vec3(bp.face.x, bp.face.y, bp.face.z)), PILLAR_PLACE_TIMEOUT_MS, 'climb bridge re-place')
                    await settleTicks(10, 'climb bridge re-place settle')
                    let nowB2 = null
                    try { nowB2 = readCell(bp.cell) } catch { nowB2 = null }
                    postB = nowB2
                    placedOk = bridgeFillLanded({ postBlock: nowB2, before, after: countOf(bp.item.name) })
                  } catch { placedOk = false }
                }
              }
            } catch { placedOk = false }
            if (placedOk) {
              if (diagLevels < 3 && !lateRecovered) log(`${tag} climb bridge: placed ${bp.item.name} at [${bp.cell.x},${bp.cell.y},${bp.cell.z}] (${bp.kind}) - the step re-judges`)
              continue
            }
            if (diagLevels < 3) log(`${tag} climb bridge: the server refused the ${bp.kind} fill at [${bp.cell.x},${bp.cell.y},${bp.cell.z}] - the rotate ladder owns it (${bridgeRefusalDetail({ heldName, dist, refName, postName: (() => { try { return postB && postB.name ? postB.name : null } catch { return null } })(), postLanded: (() => { try { return postB ? postB.boundingBox === 'block' : null } catch { return null } })() })})`)
          } else if (diagLevels < 3 && bridgePlaced === 0) {
            log(`${tag} climb bridge: unavailable (${bp.why})`)
          }
        }
        if (diagLevels++ < 3) {
          // (v0.32.0) the refusal names its cell: fleet 35555025482 showed four
          // bearings of 'blocked toward (dug=0)' with NO way to tell an unloaded
          // chunk read (null) from a fluid from bedrock - the diagnosis had to
          // guess. blockedRefusal.blockedCell/blockedName say it outright.
          // (v0.37.0) the fastDig-failure zero (dug>0 then a dig that never
          // landed) names its cell too - 62 unnamed 'blocked toward (dug=N)'
          // lines in 35566494961 could not say gravity-sunk block vs dig
          // timeout vs a freshly-placed obstruction.
          const refusal = blockedRefusal && blockedRefusal.blockedCell
            ? ` at [${blockedRefusal.blockedCell.join(',')}] ${blockedRefusal.blockedName} (${blockedRefusal.reason})`
            : (digFailCell ? ` dig failed at [${digFailCell.cell.join(',')}] ${digFailCell.name}${digFailCell.detail ? ` (${digFailCell.detail})` : ''}` : '')
          log(`${tag} climb diag: level at y=${feet.y} blocked toward ${d.x},${d.z} (dug=${dug}${blockedWet ? ', wet' : ''})${refusal}`)
        }
        fails++
        rotate()
        await settleTicks(4, 'climb rotate settle')
        continue
      }
      // the step: look at the diagonal cell, hold forward + jump - vanilla
      // movement onto a dug step, the exact mechanic the tunnels use sideways
      // (v0.19.0) stepUp reads FRESH feet and takes the hold length: the
      // fleet measured 'did not rise (yaw stuck?)' clusters (F5 y=63, F12
      // y=63, F8 y=51, F6 y=44 on v0.18.15) where the cells were just dug
      // free - a momentum/yaw transient, not geometry. One longer hold (24
      // ticks) on the SAME bearing fixes it; only then rotate (a rotation
      // re-digs 2+ cells per wall, the expensive path).
      const stepUp = async holdTicks => {
        const f = bot.entity.position.floored()
        await bot.lookAt(f.offset(d.x, 1, d.z).offset(0.5, 0.5, 0.5), true)
        bot.setControlState('forward', true)
        bot.setControlState('jump', true)
        await settleTicks(holdTicks, 'climb step hold')
        bot.setControlState('forward', false)
        bot.setControlState('jump', false)
        await settleTicks(4, 'climb step settle') // gravity settles us onto the step
        return bot.entity.position.floored().y > f.y
      }
      let rose = false
      try { rose = await stepUp(12) } catch { /* fail accounting below */ }
      if (!rose) {
        try { rose = await stepUp(24) } catch { /* rotate below */ }
      }
      if (rose) { steps++; fails = 0 } else {
        // (v0.23.0) WALKABLE SURFACE: the fleet measured bots burning their whole
        // fail budget ON the biome surface (F2: 'y=63 did not rise, dug=60, feet=air
        // support=grass_block step=air' - the stale entry target demanded levels the
        // terrain no longer owes). Daylight + 2 walkable directions cannot be a shaft
        // (walls) or a tunnel (no free dirs) - hand the bot to the chest walk.
        const feetNow = bot.entity.position.floored()
        let skyLit = false
        try { const fb = bot.blockAt(feetNow); skyLit = !!fb && (fb.skyLight ?? 0) >= 15 } catch { /* dark by default */ }
        const probes = (dx, dz) => {
          const stepC = bot.blockAt(feetNow.offset(dx, 1, dz))
          const floorC = bot.blockAt(feetNow.offset(dx, 0, dz))
          const belowC = bot.blockAt(feetNow.offset(dx, -1, dz))
          return {
            free: !!stepC && stepC.boundingBox === 'empty',
            solid: !!floorC && floorC.boundingBox === 'block',
            // (v0.37.0) flat-ground directions count too: a rise failure on level
            // open terrain is the same "already out" verdict as the terraced bank
            walkFlat: !!stepC && stepC.boundingBox === 'empty' && !!floorC && floorC.boundingBox === 'empty' && !!belowC && belowC.boundingBox === 'block'
          }
        }
        if (isWalkableSurface({ skyLit, probes })) {
          const gainedNow = feetNow.y - feet0.y
          stats.climbs = (stats.climbs ?? 0) + 1
          bot._climbLedger = climbLedgerUpdate(bot._climbLedger, { ok: true, gained: gainedNow, feetY: feetNow.y, now: Date.now() })
          log(`${tag} climb: walkable surface at y=${feetNow.y} (+${gainedNow} levels, dug=${dug}) - the walk takes over`)
          return { ok: true, reason: 'walkable surface', gained: gainedNow, dug, steps, traversed }
        }
        // (v0.27.0) RISE RECOVERY: two failed raw stepUps on geometry the dig
        // pass just verified clean is the fleet's 'did not rise (dug=0)' class
        // (F13 dry, F17 in-river) - the repro probe confirmed the raw mechanic
        // fails ~half the pressed-jump trials: flush against the step face the
        // collision zeroes horizontal velocity into the wall while the arc
        // needs it. The pathfinder takes the same step with a REAL jump-edge
        // computation (backs off, jumps with speed) - one bounded assist
        // before any rotate. In water the assist is flaky and an off-goal move
        // loses the bearing, so the wet variant gets one LONGER jump hold
        // instead (swim momentum while the eyes clear the bank lip).
        const recovery = riseRecoveryPlan({ feetWater: isWetCell(readCell(feetNow)), stepTop: feetNow.offset(d.x, 1, d.z) })
        let assistMoved = false
        let assistNote = null // (v0.32.0) the assist failure NAMES itself - silent catches hid the field cause
        if (recovery.kind === 'longHold') {
          try { rose = await stepUp(recovery.holdTicks) } catch (e) { assistNote = `longHold threw: ${e.message}` }
        } else if (recovery.kind === 'assist') {
          try {
            await gotoSafe(bot, new goals.GoalBlock(recovery.stepTop.x, recovery.stepTop.y, recovery.stepTop.z), { timeoutMs: recovery.timeoutMs, label: 'climb rise assist' })
            assistMoved = true
          } catch (e) { assistNote = `goto: ${e.message}` }
        }
        const feetAfter = bot.entity ? bot.entity.position.floored() : null
        if (rose || (feetAfter && feetAfter.y > feetNow.y)) { steps++; fails = 0; continue }
        if (assistMoved && feetAfter && (feetAfter.x !== feetNow.x || feetAfter.z !== feetNow.z)) {
          log(`${tag} climb rise assist: repositioned to ${feetAfter.x},${feetAfter.y},${feetAfter.z} - the loop re-judges`)
          continue // fresh position - let the main loop re-judge (the wet-escape resumed pattern)
        }
        // (v0.32.0) the assist that neither rose nor moved says WHY: NoPath,
        // thinkTimeout, queue-full or a goto timeout are different causes with
        // different cures, and 'did not rise' after a silent catch hid them all.
        // Capped like the diag lines - two notes per climb, not one per level.
        if (assistNote && diagLevels < 5) log(`${tag} climb rise assist: ${recovery.kind} did not complete (${assistNote})`)
        // (v0.52.0) DRY RUN-UP TRAVERSE: fleet 35639593200 (v0.51.0) measured
        // the class the goto assist cannot reach: F1/F14 'assist did not
        // complete (timeout)' + F13 '(No path to the goal!)', diag
        // 'feet=air support=diorite step=air' - a bot sealed in a 1x1 well
        // where the step cell is OPEN AIR yet every rise attempt fails. The
        // v0.27.0 repro explained it: pressed against the step face the
        // collision zeroes horizontal velocity while the jump arc needs it,
        // and the pathfinder needs the same 2-block run-up it cannot find
        // inside the well - NoPath and goto-timeouts are the SAME geometry
        // failure through two APIs. The wet escape already owns the cure:
        // dig a short horizontal gallery (traverseStep guards: waterfall
        // above, gap below, wet/hard cells refuse), walk in, and the well
        // becomes an L - the main loop re-judges from the gallery mouth with
        // real run-up space. Budget: two galleries per climb (fails < 2),
        // then the honest rotate ladder owns the level.
        if (!rose && recovery.kind === 'assist' && assistNote && fails < 2) {
          const plan = traverseStep({ feet: feetNow, d, read: cell => { try { return bot.blockAt(cell) } catch { return null } } })
          if (plan.ok) {
            let opened = true
            for (const b of plan.digs) {
              let broke = false
              try { broke = await bot.fastDig(b, { maxTicks: 200 }) } catch { broke = false }
              if (!broke) { opened = false; break }
              dug++
              stats.mined++
              stats.byName[b.name] = (stats.byName[b.name] || 0) + 1
            }
            if (opened) {
              let walkedIn = false
              try {
                await bot.lookAt(feetNow.offset(d.x, 1, d.z).offset(0.5, 0.5, 0.5), true)
                bot.setControlState('forward', true)
                await settleTicks(8, 'run-up walk')
                bot.setControlState('forward', false)
                const inCell = bot.entity ? bot.entity.position.floored() : feetNow
                walkedIn = inCell.x !== feetNow.x || inCell.z !== feetNow.z
              } catch { /* the re-judge below still runs from wherever we stand */ }
              if (walkedIn) {
                const feetGal = bot.entity ? bot.entity.position.floored() : feetNow
                if (feetGal.y > feetNow.y) { steps++; fails = 0; continue }
                log(`${tag} climb run-up: gallery opened toward ${d.x},${d.z} (digs ${plan.digs.length}) - the rise re-judges from the L-mouth`)
                // falls through to the rotate: the loop re-probes all bearings
                // from the gallery cell, where a jump finally has run-up space
              }
            }
          }
        }
        // (v0.19.1) the 24-tick same-bearing retry did NOT cure the rise
        // failures (fleet v0.19.0: 15 'did not rise', food=20) - momentum is
        // NOT the cause. Name the cells: a water film on the floor (from a
        // wet escape gallery) or a support/step name tells the structural
        // story without a new theory.
        // On v0.27.0+ this line also IMPLIES the rise recovery already ran and
        // failed (assist repositioned nothing, long hold gained nothing) - the
        // rotate here is a rotated-wall attempt, not a blind repeat.
        if (diagLevels++ < 3) {
          const at = cell => { try { const b = bot.blockAt(cell); return b ? b.name : 'null' } catch { return 'err' } }
          log(`${tag} climb diag: level at y=${feet.y} did not rise (food=${bot.food}, dug=${dug}) feet=${at(feet)} support=${at(feet.offset(d.x, 0, d.z))} step=${at(feet.offset(d.x, 1, d.z))} head=${at(feet.offset(0, 2, 0))}`)
        }
        fails++
        rotate()
        await settleTicks(4, 'climb rise settle')
      }
    }
    if (!bot.entity) return { ok: false, reason: 'no entity', gained: 0, dug, steps, traversed }
    // (v0.21.0) NEVER-TRIED STOP: shouldStop fired before the first loop
    // iteration (the fleet's final bank passed an already-expired deadline
    // shouldStop for v0.12.0..v0.20.2 - the climb silently no-op'd here). A
    // never-tried call must not touch the ledger: the ok=false gained=0 update
    // below would count as a dead stall and escalate the ladder for a wall the
    // bot never saw - the hammered-refusal class the v0.18.0 contract forbids.
    if (!climbStarted({ steps, dug, fails, traversed, wetTries })) {
      return { ok: false, reason: 'stopped', gained: 0, dug, steps, traversed, stage: entry.stage, secs: 0 }
    }
    const feetNow = bot.entity.position.floored()
    const ok = feetNow.y >= plan.targetY
    if (ok) stats.climbs = (stats.climbs ?? 0) + 1
    const timedOut = Date.now() - start > maxMs
    // (v0.18.0) persist the outcome on the bot: the NEXT call inherits the
    // ladder (escalated after stalls, healed by movement). A refused entry
    // (reason 'exhausted', waitSecs) never reaches this line - it must not
    // restart the cooldown.
    const gained = feetNow.y - feet0.y
    bot._climbLedger = climbLedgerUpdate(bot._climbLedger, {
      ok, gained, traversed, feetY: feetNow.y, now: Date.now()
    })
    return {
      ok,
      reason: ok ? 'out' : (timedOut ? 'timeout' : (fails >= failLimit ? 'stalled' : 'stopped')),
      gained,
      dug,
      steps,
      traversed,
      stage: entry.stage,
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
  async function mapTrip (findNames, { digNames = null, walkTimeoutMs = TRIP_WALK_MS, maxBlocks = 24, maxDistance = 128, harvestSeconds = 40, direction = null, shouldStop = null } = {}) {
    const target = mapTargetFor(findNames, { maxDistance, verify: false })
    // structured result: the fleet logs failures ('unreachable') - silent map trips
    // looked like the feature never fired (it never printed a line in 3 CI runs)
    if (!target) return { error: 'no-target' }
    claimTrip(target) // (v0.15.0) steer the rest of the fleet away from this cluster
    const key = `${target.pos.x},${target.pos.y},${target.pos.z}`
    stats.mapTrips++
    // (v0.17.0) the walk budget scales with distance: a flat 14s killed F4's
    // legitimate 100-block trips ('unreachable' with the climb already paid)
    // while the cap keeps the v0.11.2 A*-expansion OOM lesson honoured
    const tripDist = target.pos.distanceTo(bot.entity.position)
    const budget = walkBudgetMs({ dist: tripDist, base: walkTimeoutMs })
    try {
      await gotoSafe(bot, standGoalNear(bot, goals, target.pos.x, target.pos.y, target.pos.z, { range: 4 }), { timeoutMs: budget, label: `map trip ${target.name}` })
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
    // (v0.25.0) MULTI-CHEST continuation: yards are chest ROWS - a single full
    // chest used to eat the whole delivery (depositToChest returned 'nothing to
    // deposit' after every click was rejected and smeltThenBank reported bank: 0
    // with a full pocket - fleet 35538062596 F18). depositToChests excludes the
    // dead chest and scans again (maxChests bound) until the pockets drain.
    const res = await depositToChests(bot, { log, noPathLedger, fullChestLedger, ...opts })
    if (res.deposited > 0) stats.banked = (stats.banked ?? 0) + res.deposited
    const reason = res.deposited > 0
      ? 'ok'
      : (Array.isArray(res.chestReport) && res.chestReport.length ? res.chestReport[res.chestReport.length - 1] : 'no chest in range')
    return { deposited: res.deposited, reason, chestsUsed: res.chestsUsed ?? 0, chestReport: res.chestReport ?? [] }
  }

  return { bot, ready, stats, mineBox, nukeAround, bore, tunnel, veinSweep, climbOut, harvestSite, workOnGround, collectArea, digShaft, gatherWood, mapTrip, enablePhysicsMode, landHere, sweep, scanBox, flyTo, mineBlock, standSpotFor, setMode, recordToMap, mapTargetFor, depositLoot, inventoryLoad: () => inventoryLoad(bot), map, waterTables, username, lastDeath: () => lastDeath }
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
