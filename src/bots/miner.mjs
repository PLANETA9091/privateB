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
import { MiningJobQueue, withTimeout, gotoSafe, standGoalNear, inBox, unreachableBatchVerdict, UNREACHABLE_FENCE_BATCHES, ASSIST_BURST_SEARCH_RADIUS, ASSIST_BURST_THINK_TIMEOUT_MS, resetWalkGovernorFor, releaseWalkGoal } from '../lib/jobqueue.mjs'
import { walkoutWindowMs, walkoutDisplacement, walkoutVerdict, walkoutEscalation, walkoutStallLine } from '../lib/relogwalkout.mjs' // (v0.425.0) the frozen-after-relog witness - the walk-out promise gets enforced
import { collectGain, depositToChests, inventoryLoad } from '../lib/deposit.mjs'
import { stalledButCraftable, TRIP_WALK_MS } from '../lib/woodplan.mjs'
import { isPlantableSapling, plantableCell, pickSapling } from '../lib/sapling.mjs'
import { torchDue, torchWallDirs, torchRestockWanted, countTorches } from '../lib/torch.mjs'
import {
  pillarTarget, climbableCeiling, isWetCell, traverseStep,
  climbEntry, climbLedgerUpdate, climbStarted, isWalkableSurface, climbOwnerGate,
  climbSurfaceShort, // (v0.610.0) the altitude-demand guard - the surface verdict never lands below a demanded altitude
  stepDigPlan, STEP_MAX_PASSES, climbDigWindow, climbRearmTicks, CLIMB_REARM_TICKS, riseRecoveryPlan, isDigLanded, digRefusalDetail,
  climbPouncePlan, CLIMB_POUNCE_BACK_TICKS, CLIMB_POUNCE_JUMP_TICKS, // (v0.311.0) the well pounce
  wetWallYield, WET_WALL_YIELD_ROTATIONS, // (v0.312.0) the wet-wall yield
  wetColumnMemoCondemn, wetColumnMemoBlocked, // (v0.319.0) the wet-column doom memo
  PILLAR_FAIL_LIMIT, PILLAR_MAX_MS, PILLAR_LEVEL_CAP, PILLAR_PLACE_TIMEOUT_MS,
  TRAVERSE_MAX_BLOCKS, TRAVERSE_MAX_MS, TRAVERSE_MAX_ATTEMPTS, TRAVERSE_STALL_LIMIT,
  TRAVERSE_ROTATE_LIMIT, veinDigRefusal,
  climbO2Watch, // (v0.379.0) the wet-sentinel watch - the escape's o2 arms as one gate
  tunnelStepRefusal, // (v0.429.0) THE TUNNEL STEP FENCE - the raw step's vertical truth
  tunnelStopReason, TUNNEL_MAX_MS, climbTargetY,
  tunnelZeroWhy, // (v0.240.0) the silent-break verdict - the steered 0-block class names its gate
  wetEscapeGate, wetEscapeAccount, WET_ESCAPE_WALK_CEILING,
  wetCeilingAscendGate, WET_CEILING_DIG_BUDGET, // (v0.300.0) the wet-ceiling ascend
  bridgePlan, BRIDGE_PLACE_MAX, BRIDGE_RECHECK_TICKS, bridgeFillLanded, bridgeRefusalDetail, fillCollidesEntity, // (v0.638.0) THE SHADOW GATE rides the bridge imports
  interactiveRefName, // (v0.641.0) THE INTERACTIVE REFERENCE LAW - a use-on an interactive block opens its UI, the place needs the sneak
  PLANT_CLEAR_FAMILY, // (v0.627.0) THE PLANT CLEAR - the confessed groundcover digs before the fill
  SEAL_PLACE_TIMEOUT_MS // (v0.544.0) THE SEAL PLACE FENCE - the PILLAR lesson reaches the miner's own seal legs
} from '../lib/surface.mjs'
import { isHostileEntity, pickWeapon, pickMeleeWeapon, threatVerdict, threatVerdictLane, effectiveHp, isPoisoned, witchFightStep, meleeFightStep, meleeReturnPlan, driftReturnPlan, cooldownTicksForWeapon, foughtEntityGone, FIGHT_DEADLINE_MS, MELEE_RETURN_WAIT_TICKS, DRIFT_RETURN_TICKS, DETECT_RANGE, ENGAGE_RANGE, FLEE_HP, fleeResponse, kiteHopTarget, RANGED_HOSTILES, RANGED_COOLDOWN_MS, rangedCooldownUntil, rangedCooldownLive, MELEE_COOLDOWN_MS, meleeCooldownUntil, meleeCooldownLive, fightDeathVerdict, ringRangedClass, OPEN_FIELD_FLEE_HP, LENS_FOE_RANGE } from '../lib/combat.mjs'
import { parseDeathMessage, inferenceVerdict } from '../lib/deathcause.mjs'
import { deathDropLine, deathDropTotal, drownContextLine, drownedKillContextLine, suffocateContextLine, voidContextLine, wetRescueWindowLive } from '../lib/statcarry.mjs' // (v0.357.0) the wet-rescue window classifier - the storm verdict's exclusion feed
import { bestPickaxe, bestPickTier, oreTierGuardLine, oreTierRequired, tierDebtOf } from '../lib/toolupgrade.mjs' // (v0.251.0) the ore-tier guard: the pocket's best pick decides which ores may break; (v0.503.0) the tier debt rides the verdict
import { isNight } from '../lib/nightsafety.mjs'
import { RATION_OPTS, rationVerdict, createRationGate } from '../lib/ration.mjs' // (v0.511.0) THE FLESH RATION - the autoeat plugin's own policy, finally fed and finally enabled; (v0.513.0) the fight table rides the same import
import { GRAVITY_ROOF_BLOCKS, GRAVITY_MAX_PASSES, gravityColumnOrder } from '../lib/gravityroof.mjs'
import { shelterDue, earnSealDue, pickSealItem, pickJunkToDrop, SHELTER_WALL_OK, SHELTER_ROUND_MS, SHELTER_MAX_MS, SHELTER_SAFE_DIST, EARN_SEAL_MAX_THREAT_DIST, RING_SIDE_NORMALS, RING_BLOCKS_NEEDED, ringFeasible, ringBlocksNeeded, ringSideOrder, ringSideBuildable, ringSillDue, ringThreatSideIndex, ringRangedNeeded, ringRangedEnough, countSealBlocks, emptySlotCount, RING_PLACE_ROUNDS, RING_RETRY_TICKS, ringDigEarnSupply, RING_DIG_EARN_OK } from '../lib/shelter.mjs'
import { sealSnapshot, sealDeclareLine, sealRespawnLine } from '../lib/sealwatch.mjs' // (v0.421.0) the seal watch: the pre-risk declare + the respawn accounting, the same SEAL_PRIORITY list all four seal arithmetics spend
import {
  waterVerdict, airBarTrust, shoreDirection, isWaterName, SHAFT_FLUID_NAMES,
  oxygenInDomain, RESCUE_MAX_MS, RESCUE_COOLDOWN_MS, OXYGEN_CRITICAL_LEVEL, AIR_GLITCH_LOG_MS,
  OXYGEN_RESCUE_LEVEL, rescueDone, fleePlan, verifyShoreCell, HazardLedger,
  shoreCandidates, firstVerifiedShore, AQUATIC_SHORE_CANDIDATES,
  RE_FLEE_ROTATE_AFTER, RE_FLEE_MEMORY_MS,
  vettedFleeTargetAbs, AIR_GLITCH_STREAK_CAP, dryLandProof, DRY_PROOF_BACKOFF_MS, glitchStreakCap,
  glitchAbandoned, GLITCH_ABANDON_PAGES,
  drowningCorroborated, DROWN_CORROBORATION_HP, WITNESS_COMBAT_BAND, airGlitchLogLine,
  frozenWindowFor, WET_FROZEN_WINDOW,
  historyAdmissible, O2_HISTORY_CAP,
  surfaceRearmHolds, SURFACE_REARM_MS,
  transitBearing, TRANSIT_RESCAN_TICKS, LAND_PROXIES, TRANSIT_MAP_RANGE,
  openWaterRelease, physicsFrozen, transitStalled, shorePinned, frozenRelogDecision, freezeClass, apexRestExempt,
  bearingSectorKey,
  frozenReturnGate, frozenReturnBypass, frozenBypassEcho, breathMirror, o2SensorLabel, rescueEndVerdict,
  FROZEN_WINDOW, REPEAT_PAGE_WINDOW_MS, REPEAT_PAGE_ALLOW, STAND_DOWN_LOG_MS,
  STANDING_PROBE_BUDGET, RESCUE_READS_CAP, PASS_LOG_INTERVAL_MS, PASS_LOG_MAX_PER_RESCUE,
  airBarFalling, ascendStalled, ascendGraceWanted, ceilingCell, ASCEND_DIG_BUDGET, ASCEND_STALL_PASSES,
  lidScanPlan, ASCEND_LID_SCAN, // (v0.343.0) the lid scan - dig the roof, never the fluid
  dryTailTimeoutProof, DRY_TAIL_PROOF_DEPTH,
  rescueBlindness, RESCUE_BLIND_FLOOR_PASSES, // (v0.314.0) the blind rescue decode
  WATER_DEATH_TTL_MS
} from '../lib/drowning.mjs'
import { noteTransitStall, rearmVerdict } from '../lib/rearm.mjs' // (v0.443.0) THE SAME-TARGET RE-ARM BRAKE - the zero-gain loop's cross-episode gate
import { suffocateRescueTargets, SUFFOCATE_WATCH_EVERY_TICKS, SUFFOCATE_DIG_MAX_TICKS } from '../lib/suffocate.mjs'
import { WET_CHURN_LOG_CAP } from '../lib/wetchurn.mjs' // (v0.223.0) the churn recorder's memory cap (the plan's own constant)
import { DRAGON_DEATH_LOG_CAP } from '../lib/dragonzone.mjs' // (v0.225.0) the dragon death registry's memory cap (the zone's own constant)
import { WaterTableBoard } from '../lib/watertable.mjs' // (v0.84.0) the aquifer ceiling memory
import { craftTorches, countItem } from './tools.mjs'
import { dropTargets, dropGoalRange, dropWalkSkipped, dropGoalAdmission, DROP_ADMISSION_WHY, aboveBandOf, lipDigWanted, lipDigRefusal, supportDigWanted, supportDigRefusal, highLedgeStanceWanted, sealedColumnDepth, sealReachBucket, sealCutClass, ledgeCutWanted, ledgeCutRefusal, stanceStepBlocks, stepWalkProgress, stanceStepRawWalk, stancePinRead, STANCE_STEP_WALK_MS, DROP_GOAL_BELOW, DROP_GOAL_BELOW_DY, DROP_GOAL_DEEP_DY, DROP_GOAL_ABOVE_DY, DROP_GOAL_SKIP, SWEEP_DROP_REACH, SWEEP_DROP_CAP, SWEEP_DROP_TIMEOUT_MS, SWEEP_DROP_TOTAL_MS } from '../lib/drops.mjs' // (v0.173.0) the sweep's drop walk; (v0.178.0) the below-plane goal range; (v0.182.0) the deep skip; (v0.187.0) the lip dig-down; (v0.189.0) the above-plane ledge goal + the dy-family dig gate; (v0.206.0) the lip refusal instrument; (v0.260.0) the already-there fast path; (v0.263.0) the support dig-down; (v0.267.0) the seal depth read; (v0.273.0) the seal reach split; (v0.275.0) the ledge cut; (v0.277.0) the cut target split; (v0.288.0) the step walk's measured budget; (v0.291.0) the raw stance step; (v0.292.0) the stance pin read; (v0.294.0) the above height split; (v0.296.0) the high ledge stance; (v0.431.0) the goal admission
import { chooseTarget } from '../fleet/claims.mjs'
import { firstUsableRecord } from '../fleet/worldmap.mjs' // (v0.512.0) the fallback's deeper-record law
import { walkBudgetMs } from '../lib/tripplan.mjs'
import { noteGlobal } from '../lib/blackbox.mjs' // (v0.62.0) freeze forensics at the rescue/climb sites
import { createLoginReady } from '../lib/loginfence.mjs' // (v0.546.0) THE LOGIN FENCE - the rebuild's login leg settles on every branch

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
// (v0.425.0) THE RELOG WALK-OUT STATE - the gate's promise gets a witness.
// Face 36864564525's F10 relogged THREE times into the same water column
// (o2=20 every time) and nobody ever checked the walk-out the relog line
// promises ('the fresh client walks the hazard-ledgered column out'). The
// state rides the module scope like the streak/gate maps - it survives the
// miner rebuild the reconnect lane performs: the relog position, the window
// the gate armed (walkoutWindowMs = the gate's own ladder), and the stalled
// window stage the escalation ladder ratchets on (reset -> goal release ->
// the named shift exit). Deleted on the honest completion and on a proven
// walk-out - forgiveness rides evidence, never the clock.
const frozenRelogWalkouts = new Map()

// (v0.343.0) THE LID SCAN'S MECHANICAL READ - the column above the head,
// the legacy probe (floor(y)+2) first, then ASCEND_LID_SCAN lid cells up.
// Each read carries what the pure plan needs and nothing else: the fluid
// law (isWaterName) and the data's own diggable. A lost read rides null -
// the plan refuses it honestly (a lost reading never arms a dig).
const lidReads = (bot, cell) => {
  if (!cell) return []
  const reads = []
  for (let i = 0; i <= ASCEND_LID_SCAN; i++) {
    let b = null
    try { b = bot.blockAt(new Vec3(cell.x, cell.y + i, cell.z)) } catch { b = null }
    reads.push(b == null ? null : { diggable: b.diggable === true, isWater: isWaterName(b.name) === true })
  }
  return reads
}

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
  seedLastDeath = null, // (v0.203.0) the PREVIOUS attempt's un-attempted death record (the runner's death carry) - a relog must not bury the re-loot plan
  dragonDeaths = null, // (v0.225.0) the fleet-shared dragon death registry (server verb + corpse pos records) - the zone anchor's input; null = a private log (solo honest)
  torchResupply = null, // (v0.269.0) async ({ itemsNeeded }) => void - the torch-coal commons ask (the pocket-closed torch economy's cure); null = the legacy shape byte for byte
  log = () => {}
} = {}) {
  const bot = mineflayer.createBot({ host, port, username, version, auth: 'offline' })
  bot.loadPlugin(pathfinder)
  bot.loadPlugin(toolPlugin)
  bot.loadPlugin(collectBlockPlugin) // ready-made: pathfind to block, pick tool, dig, collect drops
  bot.loadPlugin(autoeat)

  const stats = { mined: 0, failed: 0, skipped: 0, flyFails: 0, hookCalls: 0, hookFails: 0, mapTrips: 0, mapRecords: 0, banked: 0, planted: 0, torched: 0, fights: 0, kills: 0, climbs: 0, shaftEntryY: null, shelters: 0, rescues: 0, airGlitches: 0, wetRescueGlitches: 0, glitchAbandons: 0, airBarOverrides: 0, claims: 0, byName: {}, startedAt: 0 }
  const dugByHook = new Set()
  const tag = `[${username}]`

  // ---- (v0.511.0) THE FLESH RATION - the recover() doctrine's heal leg becomes real ----
  // recover() (below) waits on 'autoeat + natural regen' - but the autoeat plugin
  // loaded here was inert three layers deep: enableAuto() never called (5.0.3's
  // loader builds the util and stops - statusCheck stayed unbound, nothing ever
  // ate), the default bannedFood opened with rotten_flesh (the ONLY food the fleet
  // owns - zombie defense drops; no hunt lane exists), and the default minHunger
  // 15 strict-< fed at hunger <= 14, under the vanilla regen floor 18. The wire:
  // the ration policy (src/lib/ration.mjs) over the plugin's own config surface,
  // the eater actually enabled, and the attempts made readable with the honest
  // before/after read (the plugin's eatFinish fires in finally even for failed
  // eats - the hunger/health delta decides the verdict, never the hope).
  bot.on('spawn', () => { try { bot.autoEat.enableAuto() } catch { /* gone */ } })
  // (v0.513.0) THE FIGHT TABLE's sync: the gate counts, the plugin follows. One
  // reader - every hold/release site calls rationSync and the eater's enabled
  // state is always the gate's truth (the 5.0.3 enable/disable are idempotent:
  // the _enabled guard makes a double enable and a double disable both no-ops).
  const rationGate = createRationGate()
  const rationSync = () => { try { if (rationGate.armed) bot.autoEat.enableAuto(); else bot.autoEat.disableAuto() } catch { /* gone */ } }
  let rationAttempt = null
  // ---- (v0.548.0) THE BOOT WIRE - the ration's plugin touches ride 'inject_allowed' ----
  // THE MEASURED FAILURE (CI run 37109465432, job 111166246759, tree f448cb7, both
  // integration files): createMiner died at the naked boot-level setOpts with
  // "Cannot read properties of undefined (reading 'setOpts')" - mineflayer's
  // plugin loader QUEUES every loadPlugin until 'inject_allowed' (plugin_loader.js:
  // loadPlugin pushes to pluginList and invokes plugin(bot) only `if (loaded)`;
  // loader.js:134 emits inject_allowed via setTimeout(0)), so in the createBot tick
  // bot.autoEat does not exist yet. The v0.511.0 wire touched the config surface in
  // that same tick - and since the v0.503.0 green face (the wall ate every
  // integration run since) no suite ever executed a real boot again: the crash rode
  // master invisible to the mocked unit battery (the wiring pins read source bytes,
  // not mineflayer). The wire: all three plugin touches ride
  // bot.once('inject_allowed') - mineflayer's own onInjectAllowed listener is
  // registered inside createBot, so listener order guarantees the queued plugins
  // were already invoked when ours fires: bot.autoEat exists, deterministically.
  // The spawn enableAuto stays event-deferred and try-guarded (spawn always
  // follows inject_allowed - the opts land first); the gate and rationSync keep
  // their guarded reads (junk-safe).
  bot.once('inject_allowed', () => {
    bot.autoEat.setOpts(RATION_OPTS)
    bot.autoEat.on('eatStart', opts => {
      try {
        rationAttempt = { item: opts?.food?.name ?? 'unknown', f0: Number.isFinite(bot.food) ? bot.food : null, h0: Number.isFinite(bot.health) ? bot.health : null }
        log(`${tag} ration: eating ${rationAttempt.item} (hunger ${rationAttempt.f0 ?? '?'}, hp ${rationAttempt.h0 ?? '?'}, ${rationVerdict({ food: bot.food, health: bot.health }).reason})`)
      } catch { rationAttempt = null }
    })
    bot.autoEat.on('eatFinish', async () => {
      const a = rationAttempt
      rationAttempt = null
      if (!a) return
      try { await bot.waitForTicks(3) } catch { return } // the client's own stats packet lands a tick or two late - the read waits for it
      try {
        const f1 = Number.isFinite(bot.food) ? bot.food : null
        const h1 = Number.isFinite(bot.health) ? bot.health : null
        const ok = (f1 !== null && a.f0 !== null && f1 > a.f0) || (h1 !== null && a.h0 !== null && h1 > a.h0)
        log(`${tag} ration: ${ok ? 'ate' : 'failed'} ${a.item} (hunger ${a.f0 ?? '?'} -> ${f1 ?? '?'}, hp ${a.h0 ?? '?'} -> ${h1 ?? '?'})`)
      } catch { /* gone */ }
    })
  })

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
    // (v0.512.0) THE DEEPER RECORD: the fallback reads k=4 per name and takes the
    // first record the failedTrips/wetTrip blocker doesn't refuse - one failed
    // cell no longer starves a name the map holds dozens of records for (the
    // claims path's own per-candidate law, now on the board-less road too). The
    // across-names nearest law is untouched: nearestK returns nearest-first, the
    // first usable record IS the name's best.
    for (const name of names) {
      const records = map.nearestK(name, bot.entity.position, { maxDistance, k: 4, verifyWith })
      const pos = firstUsableRecord(records, { isBlocked: p => failedTrips.has(`${p.x},${p.y},${p.z}`) || wetTrip(p) })
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
  // (v0.203.0) the seed: the runner carries the PREVIOUS attempt's
  // un-attempted death record across the relog (the run71 class: F2/F7 died
  // mid-run, their sessions hit the end-phase gates, and the retry rebuilt
  // the miner - the record died with the old closure before ANY evaluation).
  // Guarded like every record: a junk seed reads as no-record, never as a
  // walk; the seed is CLONED (the old closure's object is never aliased).
  let lastDeath = null
  if (seedLastDeath && Number.isFinite(seedLastDeath.at) && seedLastDeath.spot &&
    Number.isFinite(seedLastDeath.spot.x) && Number.isFinite(seedLastDeath.spot.y) && Number.isFinite(seedLastDeath.spot.z)) {
    // (v0.649.0) THE DEATH CARRY STAKE: the seed keeps the pocket stake too -
    // the v0.484.0 pile arm reads lastDeath.pocketU, and a seed that dropped
    // it armed every post-rebuild big pile as an empty pocket (the silent
    // class's rebuild face). A junk stake reads null - the pile arm's own
    // junk law judges it not-bypass, the write-off line says 'unknown'.
    lastDeath = {
      spot: { x: seedLastDeath.spot.x, y: seedLastDeath.spot.y, z: seedLastDeath.spot.z },
      at: seedLastDeath.at,
      attempted: !!seedLastDeath.attempted,
      pocketU: Number.isFinite(seedLastDeath.pocketU) && seedLastDeath.pocketU > 0
        ? Math.floor(seedLastDeath.pocketU)
        : null
    }
  }
  // (v0.421.0) THE SEAL WATCH STATE - the death stake the last death erased
  // and the flag that says a respawn read is owed. The seal death ledger
  // priced the drain (face 26: F14 drowned carrying a 100u seal stake nobody
  // had named; face 27: F14's empty-pocket re-death) and the respawn half
  // stayed silent - the bot respawns into an empty vanilla pocket and
  // NOTHING reads again. The death handler snapshots the stake while the
  // inventory still lists (the v0.199.0 drop snapshot's own read), the
  // 'spawn' listener below spends it once at the first post-death spawn.
  // Per-instance like lastDeath: a reconnect rebuilds the miner, the flag
  // dies with the old bot object - the death -> respawn (same bot object)
  // path is the class this state serves.
  let sealDeathStake = null // the sealSnapshot at death (null = the death pocket never read)
  let sealRespawnOwed = false // set at death, spent at the first post-death spawn
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
  // (v0.225.0) THE DRAGON DEATH REGISTRY: the zone anchor's input - each
  // FRESH server death verdict (the v0.117.0 authority) rides with the
  // corpse position into a capped fleet-shared log. The zone is WORLD
  // geography (both era kills sit ~2 blocks apart at y=49), so the record
  // must outlive the relog: the array rides by reference from the runner
  // (the hazardLedger pattern), a solo default keeps a private log honest.
  // The cluster filters the magic-kill class itself (non-magic causes ride
  // harmlessly - a future fixed-anchor class may reuse them).
  const dragonLog = dragonDeaths ?? []
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
      blind: 'is blind to this kind - the hint is noise by construction (the server kind stays the authority)',
      // (v0.224.0) THE BYSTANDER VERDICT (deathcause.mjs): the wrong-name twin
      // of the blindness - a SECOND hostile near the blast is who the
      // nearest-harm scan read, because the exploder removed itself at
      // detonation. Named once so the decode reads the class, not the
      // argument again (run63 F14 zombie / F12 spider, both 'blown up by
      // Creeper').
      bystander: 'names a BYSTANDER - the exploder removed itself at detonation, the nearest-harm scan read the next-nearest hostile (a real witness, not the killer; the server killer stays the authority)'
    }
    let cause = inferred
    if (authFresh) {
      const verdict = inferenceVerdict(serverDeath, lastHarm ? lastHarm.name : null)
      const note = VERDICT_NOTE[verdict]
      cause = `server: ${serverDeath.verb} [kind=${serverDeath.kind}${serverDeath.attacker ? ` by ${serverDeath.attacker}` : ''}] | inferred: ${inferred}`
      if (note) cause += ` [the inference ${note}]`
      // (v0.225.0) THE REGISTRY RECORD: only a FRESH server line records
      // (the inference is noise for every cluster class - the v0.117.0
      // doctrine); the verb carries the magic-kill signature the zone
      // clusters on. Guarded like every record: a junk corpse position
      // must never break the respawn path.
      try {
        const dpos = bot.entity?.position
        if (dpos && Number.isFinite(dpos.x) && Number.isFinite(dpos.y) && Number.isFinite(dpos.z)) {
          dragonLog.push({ cause: serverDeath.verb, pos: { x: dpos.x, y: dpos.y, z: dpos.z }, at: Date.now() })
          if (dragonLog.length > DRAGON_DEATH_LOG_CAP) dragonLog.splice(0, dragonLog.length - DRAGON_DEATH_LOG_CAP)
        }
      } catch { /* the registry must never break a respawn */ }
    }
    log(`${tag} died - respawning (cause: ${cause})`)
    // (v0.248.0) THE BREATH MIRROR - the Drowned-class return (the geometry
    // face's 4/6) drowned OUTSIDE the combat-flee context and the log could
    // not answer why the rescue lane stood down: every hold (the controls
    // owner, the cooldown, the dry-land backoff, the surface re-arm, the
    // frozen gate) is a silent return. The mirror reads the sentry's LIVE
    // gate state at the killing tick and names the hold - telemetry before
    // cure, the canon law. A drowning shape only (the server kind or the
    // inference); every other kind keeps the log byte for byte. Guarded: a
    // mirror must never break the respawn path.
    try {
      const drownDeath = (authFresh && serverDeath?.kind === 'drown') || /\bdrowning\b/.test(inferred)
      if (drownDeath) {
        const now = Date.now()
        const frGate = frozenReturnGates.get(bot.username) || 0
        const mirror = breathMirror({
          deathKind: (authFresh && serverDeath?.kind === 'drown') ? 'drown' : 'drowning',
          owner: bot._climbEscape ? 'climb' : (swimming ? 'swim' : (defending ? 'defend' : null)),
          rescueAgeMs: lastRescueAt > 0 ? now - lastRescueAt : null,
          noOpGateLeftMs: Math.max(0, noOpRescueGateUntil - now),
          surfaceHoldLeftMs: surfaceReleaseAt > 0 ? Math.max(0, surfaceReleaseAt + SURFACE_REARM_MS - now) : 0,
          frozenGateLeftMs: frozenReturnBypass({ oxygen: Number(bot.oxygenLevel) }) ? 0 : Math.max(0, frGate - now),
          criticalOnDry: sentryLast ? !!sentryLast.criticalOnDry : null,
          witnessed: sentryLast ? !!sentryLast.witnessed : null,
          sentryVerdict: sentryLast?.verdict ?? null,
          sentryAgeMs: sentryLast ? now - sentryLast.at : null
        })
        // (v0.264.0) the -1 reset sentinel renders NAMED (o2SensorLabel) - the
        // mirror's snapshot rides the same renderer as the death lines
        const o2Read = o2SensorLabel(sentryLast ? sentryLast.o2 : null)
        const sAge = sentryLast ? `${Math.max(0, Math.round((now - sentryLast.at) / 100) / 10)}s old` : 'none'
        log(`${tag} water: breath mirror [${mirror.why}]${mirror.note ? ` - ${mirror.note}` : ''} (o2 ${o2Read}, ${sentryLast?.headWet ? 'head WET' : 'head dry/unknown'}, snapshot ${sAge})`)
      }
    } catch { /* a death handler must never throw */ }
    stats.deaths = (stats.deaths ?? 0) + 1
    // (v0.199.0) THE DEATH-DROP SNAPSHOT: run84 (fleet 36207216784) measured
    // unaccounted=1479 with the fleet pocket falling 2453u -> 1509u across the
    // 6-death window - a death scatters the pocket, the death-spot memory
    // steers every bot away from the corpse, the stack despawns unattributed.
    // One read WHILE the inventory still lists, riding the 'death drop' filter
    // key. Guarded: the snapshot must never break the respawn path.
    let dropPocketU = null // (v0.280.0) the write-off's stake - read while the inventory still lists
    sealRespawnOwed = true // (v0.421.0) a respawn read is now owed - the spawn listener pays it
    try {
      const dropItems = bot.inventory?.items?.() ?? null
      const drop = deathDropLine({ tag, pos: bot.entity?.position, items: dropItems })
      dropPocketU = deathDropTotal(dropItems)
      sealDeathStake = sealSnapshot(dropItems) // (v0.421.0) the seal stake rides the SAME guarded read - null when the pocket never read, the honest unread
      if (drop) log(drop)
    } catch { /* the drop snapshot must never break a respawn */ }
    // (v0.249.0) THE DROWN-DEATH CONTEXT: run36325553310 measured the
    // Drowned-class as the RETURNED death leader (4/6) with the shore law at
    // ZERO firings and ZERO rescue lines for those deaths - the drown class
    // died outside every water instrument's context. ONE snapshot line for
    // every env-drown death (kind=drown, the mob-Drowned killers keep the
    // combat verdict): the o2 bar as read at death, the feet/head block
    // names with their waterlogged flags (the waterRead truth), and the
    // rescue relation (active / Ns ago / never). The next decode splits the
    // class by context BEFORE any cure (the canon: telemetry before cure).
    // Rides the 'drown context' filter key. Guarded like the drop snapshot:
    // a junk world read must never break the respawn path.
    if (authFresh && serverDeath && serverDeath.kind === 'drown') {
      try {
        const wr = waterRead()
        const ctx = drownContextLine({
          tag,
          oxygen: wr.oxygen,
          feet: wr.feet,
          head: wr.head,
          feetWaterlogged: wr.feetWaterlogged,
          headWaterlogged: wr.headWaterlogged,
          rescueActive: bot._waterRescue === true,
          lastRescueAt,
          headWetSince, // (v0.275.0) the wet window - the head-wet exposure the trip took before the drown
          lastWetMs: headWetLastMs, // (v0.279.0) the last-episode fallback - the reset eats the live read at the drown tick (face 36397191054: 'wet unknown' x2)
          now: Date.now(),
          leg: bot._gotoSafeLabel ?? null // (v0.270.0) the trip leg stamp - which walk owned the death
        })
        if (ctx) log(ctx)
      } catch { /* the drown context must never break a respawn */ }
    }
    // (v0.274.0) THE SUFFOCATE DEATH CONTEXT: face 36384223490's F1 died
    // 'suffocated in a wall' with a 153u pocket (gravel 39) and ZERO context
    // lines - the class reads undecodable (what filled the head cell?). ONE
    // snapshot per kind=suffocate death: the head block name (a falling
    // gravel/sand column reads straight off the line), its waterlogged flag,
    // the o2 bar, and the unconditional leg stamp (the v0.270.0 law). Rides
    // the 'suffocate context' filter key. Guarded like every death read.
    if (authFresh && serverDeath && serverDeath.kind === 'suffocate') {
      try {
        const wr = waterRead()
        const sline = suffocateContextLine({
          tag,
          head: wr.head,
          headWaterlogged: wr.headWaterlogged,
          oxygen: wr.oxygen,
          leg: bot._gotoSafeLabel ?? null // the trip leg stamp - which walk owned the death
        })
        if (sline) log(sline)
      } catch { /* the suffocate context must never break a respawn */ }
    }
    // (v0.262.0) THE DROWNED-KILL SHORE CONTEXT: face 36359454749 attempt 2
    // moved the killer channel ashore - Drowned x10 at y~64 - and the v0.249.0
    // context line above stays SILENT for the mob class by design. The same
    // telemetry doctrine now reads the MOB-Drowned kill: the shore class
    // (in-water / waterline / dry-shore), the death cell's y, the feet/head
    // truth, and the horizontal water bearings - the next decode splits the
    // class BEFORE any cure. Rides the 'drowned-kill context' filter key.
    // Guarded like every death-handler read: a junk world never breaks a
    // respawn.
    if (authFresh && serverDeath && serverDeath.kind === 'mob' && /^drowned$/i.test(serverDeath.attacker ?? '')) {
      try {
        const base = bot.entity?.position ? bot.entity.position.floored() : null
        const neighbors = base
          ? [[1, 0, 'e'], [-1, 0, 'w'], [0, 1, 's'], [0, -1, 'n']]
            .map(([dx, dz, d]) => ({ name: bot.blockAt(base.offset(dx, 0, dz))?.name ?? null, d }))
          : null
        const wr = waterRead()
        const ctx = drownedKillContextLine({
          tag,
          attacker: serverDeath.attacker,
          feet: wr.feet,
          head: wr.head,
          feetWaterlogged: wr.feetWaterlogged,
          headWaterlogged: wr.headWaterlogged,
          neighbors,
          feetY: base ? base.y : null
        })
        if (ctx) log(ctx)
      } catch { /* the drowned-kill context must never break a respawn */ }
    }
    // (v0.277.0) THE VOID DEATH CONTEXT: TWO out-of-world deaths stand in the
    // fleet's history, both mute - the rim-dig era's F12 at [117,-90,0] and
    // face 36392745638's F3 at [118,-148,2] (84 blocks BELOW the floor, 22u
    // lost, ZERO telemetry lead). The server kind stays 'other' (the v0.117.0
    // law - the kind is never rewritten), so the branch gates on the VERB the
    // server itself printed ('fell out of the world'). ONE snapshot per
    // out-of-world death: the death cell (the recurrence signature - the
    // ~17-block east-of-anchor column is the decode lead), the depth below
    // the world floor, and the unconditional leg stamp (the v0.270.0 law).
    // Rides the 'void context' filter key. Guarded like every death read:
    // a junk world never breaks a respawn.
    if (authFresh && serverDeath && serverDeath.kind === 'other' && /fell out of the world/i.test(serverDeath.verb ?? '')) {
      try {
        const dp = bot.entity?.position ? bot.entity.position.floored() : null
        const vline = voidContextLine({
          tag,
          pos: dp ? { x: dp.x, y: dp.y, z: dp.z } : null,
          leg: bot._gotoSafeLabel ?? null // the trip leg stamp - which walk owned the death
        })
        if (vline) log(vline)
      } catch { /* the void context must never break a respawn */ }
    }
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
        // (v0.209.0) THE DEATH SPOT TENURE: run55 (fleet 36226589855) measured
        // the EXACT repeat - F16 fell at [-117,42,406], the next fall death
        // (F17) landed on the SAME cell, and both records read "4 live" -
        // which reads one way: F16's record had ALREADY expired (a live one
        // would have made it 5). The 120s rescue TTL is shorter than the
        // reloot return window (189s measured): the trap legally unprotected
        // while the bot walks back to it. A death spot outlives the window -
        // the record is stamped with WATER_DEATH_TTL_MS (240s); rescue
        // records keep the 120s transient law untouched.
        const live = waterHazards.record({ x: dp.x, y: dp.y, z: dp.z }, { ttlMs: WATER_DEATH_TTL_MS })
        log(`${tag} water: death spot memorized as a hazard at [${Math.floor(dp.x)},${Math.floor(dp.y)},${Math.floor(dp.z)}] (${live} live, fleet-wide)`)
        // (v0.201.0) the re-loot record rides the SAME guarded read: the
        // spot is honest (the entity position at death), the clock is the
        // death moment. The respawned bot's ONE walk back is the runner's
        // decision (relootPlan's fences), never this handler's - a death
        // handler must never walk.
        // (v0.280.0) the pocket stake rides the record - the write-off line names WHAT was at stake
        lastDeath = { spot: { x: dp.x, y: dp.y, z: dp.z }, at: Date.now(), attempted: false, pocketU: dropPocketU }
        if (broadcastHazard) { try { broadcastHazard({ x: dp.x, y: dp.y, z: dp.z }) } catch { /* chat never kills a respawn */ } }
      }
    } catch { /* a death handler must never throw */ }
    lastHarm = null
    lastHp = 20
    setTimeout(() => { try { bot.respawn?.() } catch { /* server respawns us anyway */ } }, 1000)
  })

  // (v0.421.0) THE SEAL RESPAWN ACCOUNTING - the silent half of the seal
  // death cure. The seal death ledger reads the drop lines (the death leg,
  // the v0.403.0 surface); the respawn leg printed NOTHING - the bot respawned
  // into an empty vanilla pocket and the 'respawn-empty reset' the ledger
  // named (face 23's F14 arrived 0/8 six times) was invisible in the log.
  // ONE line per death, at the first 'spawn' after the death flag: the death
  // stake against the fresh pocket, the loss as the honest floor
  // (sealwatch.mjs sealRespawnLine). The delayed read: the inventory syncs
  // after the respawn packet - an early read would print a pocket the server
  // had not filled yet. mineflayer fires 'spawn' on login and dimension
  // changes too - the flag gates those out (no death, no accounting).
  // Guarded like every death-path read: the accounting must never break a
  // respawn.
  bot.on('spawn', () => {
    try {
      if (!sealRespawnOwed) return
      sealRespawnOwed = false
      const stake = sealDeathStake
      sealDeathStake = null
      setTimeout(() => {
        try {
          const line = sealRespawnLine({ tag, death: stake, items: bot.inventory?.items?.() ?? null })
          if (line) log(line)
        } catch { /* a respawn read must never throw */ }
      }, 3000)
    } catch { /* the accounting must never break a respawn */ }
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

  // (v0.236.0) the range is a parameter: the legacy census reads DETECT_RANGE
  // (bare calls unchanged) and the pair line's reach-weighted census reads
  // ENGAGE_RANGE - the mobs that can actually hit while the bot stands.
  function countHostiles (range = DETECT_RANGE) {
    if (!bot.entity) return 0
    let n = 0
    for (const e of Object.values(bot.entities)) {
      if (!e || e === bot.entity || !isHostileEntity(e) || !e.position) continue
      if (e.position.distanceTo(bot.entity.position) <= range) n++
    }
    return n
  }

  // (v0.307.0) THE SECOND-HOSTILE CENSUS for the flee vetting: the OTHER
  // hostiles inside range (the threat itself excluded) as bare {x,z} cells.
  // Face 36535536162 (the delivery era's first field): 12 mob deaths in the
  // surface band, the sampled anatomy one signature - the bot mid-EVASION of
  // mob A killed by mob B (F13 fled a skeleton, a zombie landed the kill;
  // F18's water-vetoed 180 rotation walked into the zombie's arc). The flee
  // ladder's vetting read the second mob NOWHERE - the census feeds the lens.
  // Junk entity reads are skipped; an empty list reads the legacy vetting.
  function otherHostiles (threatEntity, range = DETECT_RANGE) {
    const foes = []
    if (!bot.entity) return foes
    for (const e of Object.values(bot.entities)) {
      if (!e || e === bot.entity || e === threatEntity || !isHostileEntity(e) || !e.position) continue
      if (e.position.distanceTo(bot.entity.position) <= range) foes.push({ x: e.position.x, z: e.position.z })
    }
    return foes
  }

  // (v0.238.0) THE CRITICAL-BAR READ for the flee sites. MEASURED
  // (run36301385048, the v0.237.0 tree's field day, 7 deaths): the F19
  // anatomy - the verdict flipped to flee at hp 5.0, the flee spent its
  // last margin on the shelter scan + the ring try while the Drowned
  // closed 5.9 -> 1.4, and the bot died at the half-built ring; the F11
  // shape - 'fleeing drowned (hp 3.0)' TWICE around shelter skips, dead.
  // shelters=0 all run - no save was EVER bought at this bar. The read:
  // the FRESH bar (the verdict's captured hp is already stale - the drain
  // kept running while the verdict formed), the same one-bar law the
  // verdicts ride (the poison lens spends the seen bar). Junk-safe: an
  // unreadable bar reads false - the shelter try fires (the legacy byte).
  function criticalBarNow () {
    const h = bot.health
    if (!Number.isFinite(h)) return false
    return effectiveHp({ health: h, poisoned: isPoisoned(bot) }) < FLEE_HP
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
            // hop died in place - the cell was gone (or never) a real shore.
            // (v0.243.0) THE AQUATIC-FLEE SHORE LAW - run36310927991's F10 named
            // the cornered-flee class: the verify refused the nearest shore and
            // the code fell through to the away-vector, whose bearings were all
            // water - the flee rotated 270deg into a swim arc the faster swimmer
            // won (slain by Drowned @0.8 mid-arc). THE LAW: an aquatic flee
            // stays SHORE-BOUND - the candidates walk nearest-first and the
            // first cell that verifies serves; when NONE verifies the nearest
            // candidate's raw cell STILL serves (a bearing toward land beats an
            // arc through the pond - gotoSafe's guards own the walk, the next
            // hop re-scans). The away-vector below never serves a wet-aquatic
            // flee while a shore exists; it keeps the deep-water no-shore case
            // (fleePlan 'away') and every dry/land-threat byte for byte.
            // (v0.848.0) THE RE-FLEE ROTATION: the shore law's own stall guard.
            // Face 367844310847's whale (F14, 299 combat lines) walked the SAME
            // verified nearest-shore bearing (1,1) x37 into the Drowned's own
            // water - the flee never gained ground and the faster swimmer ate
            // it (killed @0.7). Three consecutive picks of one bearing and the
            // next pick must differ: the run's bearing loses its seat (verified
            // walk AND raw fallback) while another shore exists. The memory is
            // factory-scope (runAway hops at most 3x per call) and decays after
            // RE_FLEE_MEMORY_MS; a hop that leaves the shore plan (no
            // candidates, the kite/away vectors) resets the run below.
            const rotated = shoreFleeRun >= RE_FLEE_ROTATE_AFTER && shoreFleeKey !== null &&
              Date.now() - shoreFleeAt <= RE_FLEE_MEMORY_MS
            if (Date.now() - shoreFleeAt > RE_FLEE_MEMORY_MS) { shoreFleeRun = 0; shoreFleeKey = null }
            const pick = firstVerifiedShore({ candidates: shoreCandidates(sample, here, { count: AQUATIC_SHORE_CANDIDATES }), sample, here, repeats: shoreFleeRun, skipKey: shoreFleeKey })
            if (pick) {
              goal = new goals.GoalBlock(pick.x, pick.y, pick.z)
              const pickKey = `${pick.dx},${pick.dz}`
              if (rotated && pickKey !== shoreFleeKey) {
                log(`${tag} combat: flee shore rotation: the (${shoreFleeKey}) bearing ran ${shoreFleeRun} hops without landing - the next shore bears (${pick.dx},${pick.dz}) vs ${threat.name} (${reason})`)
              }
              if (pick.verified) {
                log(`${tag} combat: flee toward shore (${pick.dx},${pick.dz} step ${pick.step}) vs ${threat.name} (${reason})`)
              } else if (rotated && pickKey !== shoreFleeKey) {
                log(`${tag} combat: aquatic flee: no verified shore cell - the rotation bears (${pick.dx},${pick.dz}) vs ${threat.name} (${reason})`)
              } else {
                log(`${tag} combat: aquatic flee: no verified shore cell - bearing the nearest shore (${pick.dx},${pick.dz}) vs ${threat.name} (${reason})`)
              }
              if (pickKey === shoreFleeKey) shoreFleeRun++
              else { shoreFleeRun = 1; shoreFleeKey = pickKey }
              shoreFleeAt = Date.now()
            }
          }
        }
      } catch { /* unreadable world -> the away-vector below */ }
      // (v0.848.0) the rotation's memory is shore-only: a hop that left the
      // shore plan (no candidates, unreadable world, the kite/away vectors)
      // resets the run - the guard counts CONSECUTIVE same-bearing shore hops.
      if (!goal) { shoreFleeRun = 0; shoreFleeKey = null }
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
          // (v0.298.0) the threat's live coords ride the vetting: the ladder
          // turns distance-aware (run36507990221's twin creeper kills ate the
          // tangent arc - a dry rotation is not a gaining rotation).
          const v = vettedFleeTargetAbs({ sample, hazardNear: fleeHazardNear, ax: bot.entity.position.x, ay: here.y, az: bot.entity.position.z, tx: hopT.x, tz: hopT.z, threatX: threat.entity.position.x, threatZ: threat.entity.position.z, foes: otherHostiles(threat.entity, LENS_FOE_RANGE) })
          const fx = v ? v.x : hopT.x
          const fz = v ? v.z : hopT.z
          if (v && v.overrode) log(`${tag} combat: flee ladder ${v.firstTurns * 90}deg -> ${v.turns * 90}deg (the threat reads the yard rotation) vs ${threat.name} (${reason})`)
          else if (v && v.foesVetoed) log(`${tag} combat: flee bearing rotated ${v.turns * 90}deg (the second hostile vetoes the yard target) vs ${threat.name} (${reason})`)
          else if (v && v.turns) log(`${tag} combat: flee bearing rotated ${v.turns * 90}deg (water/hazard vetoes the yard target) vs ${threat.name} (${reason})`)
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
        // (v0.298.0) the threat coords ride this vetting too: on the away
        // axis the 0-turn candidate scores exactly d+12 from the threat -
        // geometrically unbeatable - so the ladder only re-rotates when the
        // first dry bearing was NOT the away bearing (the tangent classes).
        const raw = { x: bot.entity.position.x + (dx / len) * 12, z: bot.entity.position.z + (dz / len) * 12 }
        const v = vettedFleeTargetAbs({ sample, hazardNear: fleeHazardNear, ax: bot.entity.position.x, ay: here.y, az: bot.entity.position.z, tx: raw.x, tz: raw.z, threatX: threat.entity.position.x, threatZ: threat.entity.position.z, foes: otherHostiles(threat.entity, LENS_FOE_RANGE) })
        if (v && v.overrode) log(`${tag} combat: flee ladder ${v.firstTurns * 90}deg -> ${v.turns * 90}deg (the threat reads the away rotation) vs ${threat.name} (${reason})`)
        else if (v && v.foesVetoed) log(`${tag} combat: flee bearing rotated ${v.turns * 90}deg (the second hostile vetoes the away target) vs ${threat.name} (${reason})`)
        else if (v && v.turns) log(`${tag} combat: flee bearing rotated ${v.turns * 90}deg (water/hazard vetoes the away target) vs ${threat.name} (${reason})`)
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
    // (v0.513.0) THE FIGHT TABLE's re-arm: the regen window IS the eat window -
    // recover() waits on 'autoeat + natural regen', so the bite must be able to
    // fire HERE, not after the finally. A flee's recover reads release-at-zero
    // (no hold was taken - the clamp makes it a no-op) and re-syncs armed.
    rationGate.release()
    rationSync()
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
              // (v0.544.0) THE SEAL PLACE FENCE - this was the miner's last naked
              // placeBlock. THE SEAM: mineflayer's placeBlock waits for a
              // block-update event that never comes (the PILLAR lesson, the
              // SEAL_PLACE law in surface.mjs) - a dead socket OR a stalled
              // server (the v0.43.0 craft-storm class) left this promise
              // UNSETTLED inside the quiet per-face catch: the catch never
              // fires (it only hears settled rejections), the for-of never
              // advances, sealWaitUnseal never returns, the shift iteration
              // never ends - the 0.541.0 loop-top probe cannot read again, the
              // deadline exit never fires, the attempt rides to the run's end
              // as a frozen book. THE WIRE: the seal's OWN 3s cap (the
              // SEAL_PLACE constant - the same machine, the same law) turns the
              // hang into a caught timeout: the next face walks, the loop
              // returns, the probe reads, the rebuild owns the rest. The equip
              // and the verify waits stay outside the fence (the tools.mjs
              // shape - equip resolves or dies on its own, waitForTicks
              // self-times-out at ticks*50+5000ms, measured in physics.js).
              await withTimeout(bot.placeBlock(ref, off.scaled(-1)), SEAL_PLACE_TIMEOUT_MS, 'seal face place') // the face of ref that touches sealCell
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
    // (v0.421.0) THE PRE-RISK SEAL DECLARE - the risk is confirmed (the gate
    // above fired), the seal stake is named BEFORE the ring/wall spends it or
    // the death buries it. Face 26's F14 drowned holding a 100u seal stake
    // (cobblestone 89) that no line had ever named as a stake; the declare
    // makes the pocket's seal mass visible at every confirmed risk, once per
    // shelter episode (naturally bounded - one line per try). The same
    // shelterDue semantics re-read inside (the co-derivation law) - the
    // declare cannot fire where the shelter refused. Guarded: a declare must
    // never break the shelter path.
    try {
      const dl = sealDeclareLine({ tag, items: inventoryItems(bot), hp: hpNow, threatDist: threat.dist, night, armed, attackers: crowd })
      if (dl) log(dl)
    } catch { /* the declare must never break the shelter */ }
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
    // (v0.212.0) THE OPEN-FIELD FLAG: every ACTUAL terrain scan re-derives
    // the verdict from scratch - assumed sheltered until the scan proves
    // otherwise (the wall loop below), so a stale open-field read from a
    // previous episode can never outlive its scan. The shelterDue refusal
    // path returns ABOVE this line: no scan ran, the flag keeps its value,
    // and the lens only matters at hp < OPEN_FIELD_FLEE_HP where the
    // shelter policy (the v0.47.0 losing-fight law) sends the scan out
    // anyway.
    openFieldNight = false
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
    // (v0.212.0) THE OPEN-FIELD VERDICT, WRITTEN: the wall scan completed
    // with nothing diggable - the terrain cannot shelter the bot. The ring
    // below is the last resort; until it SEALS, the bot stands in the open
    // and the threatVerdict calls (both sites) read sheltered: false - the
    // yield line lifts to OPEN_FIELD_FLEE_HP in the dark (the run60 killing
    // sequence: the trade the bot cannot win it should not stand for).
    // (v0.394.0) THE HONEST WALL MISS: this line is a ROUTE MARKER, not a
    // skip - the ring attempt follows it and may SUCCEED (face 15 read 150
    // 'skips' over 76 tries ~= 2 lines per attempt because every wall miss
    // was named a skip). The verb is 'shelter wall miss'; the ring's own
    // verdict (built / its own skip line) is the attempt's honest outcome.
    openFieldNight = true
    log(`${tag} combat: shelter wall miss (open field: no diggable wall, ring next, ${threatStill ? `${threatStill.name}@${threatStill.dist.toFixed(1)}` : 'threat gone'})`)
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
    // (v0.234.0) the mode reads the combat layer's ringRangedClass - the
    // trident drowned joins the ranged mode in the STANDOFF band (dist > 5,
    // the run36289053811 gallery: F2 4/8 -> dead @7.8, F8 3/8 -> dead @9.1,
    // F14 not buildable -> dead @9.3), the close band keeps the full ring
    // (the swimmer walks in through a gap), the fight verdict stays byte
    // for byte (the v0.215.0 hybrid is untouched - the drowned is still NOT
    // in RANGED_HOSTILES).
    const ranged = ringRangedClass({ name: threat.name, dist: threat.dist })
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
    // (v0.849.0) THE SILL PLAN: the '-' side (empty foot, NO solid ground
    // under it) is the measured refusal - face 123's book priced 10 of 12
    // 'ring not buildable' marks as [-o ...] uneven ground and ZERO a mob in
    // a cell. The ground cell itself is seatable: for side (dx,dz) it is the
    // direct lateral neighbour of the block the bot stands on, so one block
    // placed against the under-bot block's lateral face lands IN the ground
    // cell and the side's foot placement gains its reference. The plan is
    // read-only here - the placement happens after the stock gate prices it
    // (the v0.91.0 honest gate counts the REAL need, sills included).
    const underBotBlock = (() => {
      try {
        const b = bot.blockAt(new Vec3(here.x, here.y - 1, here.z))
        return b && b.boundingBox !== 'empty' ? b : null
      } catch { return null }
    })()
    const sillDue = s => ringSillDue(s, {
      groundFree: !hostileIn(s.fx, here.y - 1, s.fz),
      underBotSolid: !!underBotBlock
    })
    const sillSides = ranged ? [] : sides.filter(sillDue)
    if (!ringFeasible(sides)) {
      const mark = s => `${s.foot === 'solid' ? 'B' : s.foot === 'empty' ? (s.groundSolid ? 'o' : '-') : 'x'}${s.head === 'solid' ? 'B' : s.head === 'empty' ? 'o' : 'x'}`
      // (v0.849.0) THE SILL CARRY: the all-4 law still refuses a ring whose
      // dead side can neither close nor seat - but a '-' side the sill can
      // seat is not a refusal yet. The carry demands EVERY dead side
      // sill-fixable AND closable once seated (a blocked head cell never
      // closes - the refusal stays honest there), and the ranged lane keeps
      // its own contract untouched (the arrow wall's buildable check
      // decides). A single unbuilt gap stays a walk-in door - the v0.59.0
      // law keeps its byte.
      const deadSides = sides.filter(s => !ringSideBuildable(s))
      const sillCarries = !ranged && deadSides.length > 0 && deadSides.every(s => sillDue(s) && ringSideBuildable({ ...s, groundSolid: true }))
      // (v0.140.0) ranged mode: the full cage may be refused, the ARROW WALL
      // still has to be buildable - otherwise the same honest skip line
      if ((!ranged || !ringSideBuildable(sides[threatIdx])) && !sillCarries) {
        log(`${tag} combat: shelter skip (open field: ring not buildable [${sides.map(mark).join(' ')}]${ranged ? ', no arrow wall either' : ''} vs ${threat.name}@${threat.dist.toFixed(1)})`)
        return false
      }
      if (!sillCarries) {
        log(`${tag} combat: shelter ring ranged mode: the full ring is refused, the arrow wall owns it vs ${threat.name}@${threat.dist.toFixed(1)}`)
      }
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
    let needed = ranged ? ringRangedNeeded(sides, threatIdx) : ringBlocksNeeded(sides)
    // (v0.849.0) the sill's honest price: every carried ground seat spends
    // one block of the same seal stock - counted BEFORE the first placement
    // (the v0.91.0 gate reads the REAL need, the earn path inherits it)
    if (sillSides.length > 0) needed += sillSides.length
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
    // (v0.849.0) THE SILL PASS: seat every carried ground before the build -
    // one block placed INTO the ground cell itself, against the under-bot
    // block's lateral face (the ring's own reference geometry, one level
    // down). A sill that fails to land leaves its side dead - the build
    // loop's lost-reference break and the verify's incomplete verdict stay
    // the honest outcomes (the carry never waits behind a gap). The leg
    // rides the same SEAL_PLACE fence (the v0.544.0 law: every leg fenced).
    let sillPlaced = 0
    for (const si of order) {
      const s = sides[si]
      if (!sillDue(s)) continue
      try {
        const sealName = pickSealItem(inventoryItems(bot))?.name
        const item = sealName ? bot.inventory.items().find(i => i.name === sealName) : null
        if (!item) break // stock ran dry mid-seat - the rest stay dead
        await bot.equip(item, 'hand')
        await withTimeout(bot.placeBlock(underBotBlock, new Vec3(s.fx - here.x, 0, s.fz - here.z)), SEAL_PLACE_TIMEOUT_MS, 'seal sill place')
        await bot.waitForTicks(2)
        const seated = bot.blockAt(new Vec3(s.fx, here.y - 1, s.fz))
        if (seated && seated.boundingBox !== 'empty') sillPlaced++
      } catch { /* the sill refuses - the side stays honest */ }
    }
    if (sillPlaced > 0) {
      log(`${tag} combat: shelter ring sill: ${sillPlaced} ground seat(s) placed, the build continues`)
    }
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
            // (v0.544.0) the ring leg fenced by the same SEAL_PLACE law (the
            // naked pair's second seat) - a hung placement lands in the
            // round's catch, the ring's own patience owns the retry, the
            // verify reads only after a SETTLED leg
            await withTimeout(bot.placeBlock(ref, new Vec3(0, 1, 0)), SEAL_PLACE_TIMEOUT_MS, 'seal ring place')
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
  // (v0.212.0) THE OPEN-FIELD FLAG: the miner's OWN terrain verdict, written
  // by tryShelter's scan (cleared at the scan start, set when the wall loop
  // finds nothing diggable) and read by both threatVerdict call sites as
  // sheltered: !openFieldNight. Junk-safe by construction: the flag starts
  // sheltered (the legacy verdicts), only an actual open-field scan result
  // lifts the yield line, and every new scan re-derives it.
  let openFieldNight = false
  // (v0.848.0) THE RE-FLEE ROTATION's memory (factory scope - the flee calls
  // hop at most 3x per runAway, and face 367844310847's whale repeated the
  // (1,1) bearing x37 ACROSS calls): shoreFleeRun counts consecutive picks of
  // one shore bearing, shoreFleeKey names it, shoreFleeAt decays the memory
  // (RE_FLEE_MEMORY_MS) so a stale chase never taxes a fresh flee.
  let shoreFleeRun = 0
  let shoreFleeKey = null
  let shoreFleeAt = 0
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
  // (v0.272.0) THE MELEE-FIGHT COOLDOWN ledger - the ranged ledger's twin
  // (same shape, same prune, the same never-guess-a-timestamp law): armed
  // ONLY by a chase-ceiling break vs a non-ranged melee threat (the F18
  // shape - the bot stood idle vs a closing drowned and died @1.2 seven
  // seconds after the break), consulted by every threatVerdict call site
  // through meleeCdLive. The witch never arms it (her lane breaks above).
  const meleeCooldowns = new Map()
  function armMeleeCooldown (entityId) {
    if (!Number.isFinite(entityId)) return
    const until = meleeCooldownUntil({ now: Date.now() })
    if (until == null) return
    meleeCooldowns.set(entityId, until)
    if (meleeCooldowns.size > 24) {
      for (const [k, v] of meleeCooldowns) {
        if (!meleeCooldownLive({ now: Date.now(), until: v })) meleeCooldowns.delete(k)
      }
    }
  }
  function meleeCdLive (entityId) {
    if (!Number.isFinite(entityId)) return false
    return meleeCooldownLive({ now: Date.now(), until: meleeCooldowns.get(entityId) })
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
    // (v0.214.0) THE VERDICT-TIME CAPTURE: the lens answer and the bar are
    // read in the same synchronous instant as the verdict - the tryShelter
    // await below can take seconds and a hit, and the run48 leak printed the
    // POST-shelter hp. The predicate is the SAME function the verdict used
    // (single source of truth) - a flee from any other lane (the unarmed
    // yield, the ranged cooldown - run48's hp 19.0/20.0 markers) reads false
    // and stays unmarked.
    const hpAtVerdict = bot.health ?? 20
    // (v0.216.0) THE FIRST-LANE CAPTURE: the lane-order mirror rides the SAME
    // argument shape as the verdict, in the SAME synchronous instant (before
    // any await) - the marker prints only when the LENS is the first firing
    // lane (run44's residual: hp 4.5 < FLEE_HP 8 is the legacy land-flee's
    // flee, the marker stays silent for it).
    const lensLane = threatVerdictLane({ name: threat.name, dist: threat.dist, hp: hpAtVerdict, attackers: countHostiles(), attackersClose: countHostiles(ENGAGE_RANGE), dark: isDarkHere(), armed, poisoned: isPoisoned(bot), inWater: inWaterHere(), sheltered: !openFieldNight, cooldown: rangedCdLive(threat.entity?.id), meleeCooldown: meleeCdLive(threat.entity?.id) })
    const verdict = threatVerdict({ name: threat.name, dist: threat.dist, hp: hpAtVerdict, attackers: countHostiles(), attackersClose: countHostiles(ENGAGE_RANGE), dark: isDarkHere(), armed, poisoned: isPoisoned(bot), inWater: inWaterHere(), sheltered: !openFieldNight, cooldown: rangedCdLive(threat.entity?.id), meleeCooldown: meleeCdLive(threat.entity?.id) })
    if (verdict === 'ignore') return { action: 'ignore', threat: threat.name }
    defending = true
    stats.fights++
    try {
      if (verdict === 'flee') {
        // UNARMED AT NIGHT: the chase is lost and the following fight is lost
        // too - seal in instead when the terrain allows (the 7-death streak)
        fleeStartDists.push(threat.dist)
        if (fleeStartDists.length > 6) fleeStartDists.shift()
        // (v0.238.0) THE CRITICAL-BAR FLEE: the shelter scan is a luxury
        // only an EARLY flee can afford - below the land line the drain
        // outruns the scan (the F19/F11 faces; shelters=0 all run). The
        // flee at seen < FLEE_HP runs NOW; the scan keeps its historical
        // seal-in saves at every bar with margin.
        if (criticalBarNow()) {
          log(`${tag} combat: critical bar (seen < ${FLEE_HP}) - the shelter scan is refused, the drain outruns it`)
        } else {
          try {
            if (await tryShelter(reason)) return { action: 'shelter', threat: threat.name }
          } catch { /* shelter is best-effort - fall back to the flee */ }
        }
        // (v0.77.0) THE STALEMATE SWITCH: stuck distances -> kite to the yard
        // (run73: F6 x65 + F18 x54 flee lines at dist ~4.0 - the radial hops
        // bought ZERO blocks for the whole run)
        const response = fleeResponse({ startDists: fleeStartDists })
        log(`${tag} combat: fleeing ${threat.name} (dist ${threat.dist.toFixed(1)}, hp ${(bot.health ?? 20).toFixed(1)}, ${countHostiles()} nearby, ${reason}${response === 'kite' ? ', kite' : ''})`)
        // (v0.212.0) THE YIELD MARKER: the decode must see WHICH flee came
        // from the lifted line - the open field's flees are the cure's
        // volume (the legacy flees print the line above verbatim; this
        // marker rides beside it, never instead of it).
        // (v0.214.0) THE HONEST MARKER: gated on the VERDICT-TIME lens
        // answer, not the terrain flag - run48's print leak (x4 markers at
        // hp 19.0/20.0/16.8, all from OTHER flee lanes) cannot repeat, and
        // the printed hp is the bar the lens actually judged.
        // (v0.216.0) THE FIRST-LANE ATTRIBUTION: gated on the lane mirror -
        // run44 printed 'open-field yield vs zombie (hp 4.5 < 14)' where the
        // land-flee lane owned the flee (4.5 < 8); the marker now means THE
        // LENS WAS THE FIRST FIRING LANE (the residual class stays unmarked).
        if (lensLane === 'open-field-lens') log(`${tag} combat: open-field yield vs ${threat.name} (hp ${hpAtVerdict.toFixed(1)} < ${OPEN_FIELD_FLEE_HP} in the dark) - the flee fired before the drain`)
        // (v0.237.0) THE PAIR PREEMPT MARKER: the decode must see the
        // preempt's volume AND the bar it fired at (the v0.236.0 window
        // never opened in the field - this marker is the line's first
        // honest census: how many pairs are being refused, at what hp).
        if (lensLane === 'pair-preempt') log(`${tag} combat: pair preempt vs ${threat.name} (hp ${hpAtVerdict.toFixed(1)}, ${countHostiles(ENGAGE_RANGE)} in reach) - the pair trade is never taken`)
        await runAway(threat, reason, { kite: response === 'kite' })
        await recover()
        // a genuine escape clears the ledger; a stuck chase keeps it armed
        const after = nearestHostile()
        if (!after || after.dist > 20) fleeStartDists.length = 0
        return { action: 'flee', threat: threat.name }
      }
      // (v0.513.0) THE FIGHT TABLE: the melee section AND the pre-fight shelter
      // below share the one hand - a bite opened here lands the next swings with
      // food in it (fist damage), wrestles the re-equip flow, and interrupts a
      // ring build's block equips. The ration leaves the table: hold from before
      // the shelter to the section's exit (the flee branch never holds - the run
      // and the recover window are the eat's own lanes, movement needs no weapon
      // hand; recover() itself is the re-arm point).
      rationGate.hold()
      rationSync()
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
      // (v0.303.0) THE MID-FIGHT DEATH STAMP: the stamp read when the fight
      // armed - a move AFTER the arm is a death DURING the episode (F15,
      // fleet 36511867751: the Drowned's kill outlived the deadline's whole
      // budget - the entity survives the respawn so the loop's own
      // bot-entity check never fired). The verdict rides the fight-end line's
      // exit slot (no new filter key).
      const deathStampAtArm = deathStamp
      while (bot.entity && Date.now() < deadline) {
        // (v0.303.0) the death guard reads FIRST - a dead bot's rounds are
        // the F15 poison (the deadline outliving the death)
        const deathVerdict = fightDeathVerdict({ stampAtArm: deathStampAtArm, stampNow: deathStamp, hpNow: bot.health })
        if (deathVerdict.broke) { exit = deathVerdict.exit; break }
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
        // (v0.214.0) one bar, one truth - the verdict, the flip line and the
        // marker read the SAME captured hp, and the marker rides the SAME
        // predicate the verdict used (the run48 flag-gate leak is dead at
        // this site too - the cooldown/unarmed flips stay unmarked).
        const hpNow = bot.health ?? 20
        const v = threatVerdict({ name: cur.name, dist: cur.dist, hp: hpNow, attackers: countHostiles(), attackersClose: countHostiles(ENGAGE_RANGE), dark: isDarkHere(), armed: !!pickWeapon(inventoryItems(bot)), poisoned: isPoisoned(bot), inWater: inWaterHere(), sheltered: !openFieldNight, cooldown: rangedCdLive(cur.entity?.id) })
        if (v === 'flee') {
          log(`${tag} combat: verdict flipped to flee vs ${cur.name} (hp ${hpNow.toFixed(1)})`)
          // (v0.212.0) the re-verdict's own yield marker (the flip site is
          // where the legacy drain showed - the decode counts both)
          // (v0.214.0) gated on the lens predicate (verdict time = print
          // time here: no await between them), never the terrain flag alone
          // (v0.216.0) gated on the lane mirror - the first firing lane owns
          // the attribution here too (the creeper@0.3 class names creeper-band,
          // not the lens; the args mirror the re-verdict's call verbatim)
          // (v0.237.0) the lane captured ONCE and marked for BOTH the lens
          // and the pair preempt (the flip site is where the pair drain
          // showed in the v0.236.0 run - the preempt's flip face must be
          // counted beside the open-field's)
          const flipLane = threatVerdictLane({ name: cur.name, dist: cur.dist, hp: hpNow, attackers: countHostiles(), attackersClose: countHostiles(ENGAGE_RANGE), dark: isDarkHere(), armed: !!pickWeapon(inventoryItems(bot)), poisoned: isPoisoned(bot), inWater: inWaterHere(), sheltered: !openFieldNight, cooldown: rangedCdLive(cur.entity?.id) })
          if (flipLane === 'open-field-lens') log(`${tag} combat: open-field yield vs ${cur.name} (hp ${hpNow.toFixed(1)} < ${OPEN_FIELD_FLEE_HP} in the dark) - the flee fired before the drain`)
          if (flipLane === 'pair-preempt') log(`${tag} combat: pair preempt (flip) vs ${cur.name} (hp ${hpNow.toFixed(1)}, ${countHostiles(ENGAGE_RANGE)} in reach) - the pair trade is never taken`)
          // (v0.238.0) the flip site rides the SAME critical-bar read - the
          // F19 face died HERE (the flip at 5.0 spent the margin on the ring)
          if (criticalBarNow()) log(`${tag} combat: critical bar (seen < ${FLEE_HP}) - the shelter scan is refused, the drain outruns it`)
          else { try { if (await tryShelter(`${reason} re-verdict`)) return { action: 'shelter', threat: cur.name } } catch { /* fall through to run */ } }
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
              } else if (!RANGED_HOSTILES.has(cur.name)) {
                // (v0.272.0) THE MELEE-FIGHT COOLDOWN: the same break vs a
                // MELEE threat used to leave the bot idling ('the next drop
                // reopens it') while the killer closed 4.2m -> 1.2m and
                // collected the wounded bot (the F18 shape, face 36378053182).
                // Arm the mob's window: the next verdict yields 'flee' - the
                // wounded bot RETREATS instead of waiting to be hit. On expiry
                // the fight re-opens honestly (the return wait + the finish
                // own the re-engagement).
                armMeleeCooldown(cur.entity?.id)
                log(`${tag} combat: melee cooldown armed vs ${cur.name} (${MELEE_COOLDOWN_MS / 1000}s) - the ceiling break never idles vs a closing killer`)
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
    } finally {
      defending = false
      // (v0.513.0) THE FIGHT TABLE's insurance: an exit that skipped recover
      // (a throw, a death guard) must never leave the ration off - the count
      // clamp makes the double release a no-op and the sync re-arms armed.
      rationGate.release()
      rationSync()
    }
  }

  // ---- (v0.303.0) THE PER-BOT DEATH STAMP ----
  // mineflayer emits 'death' exactly once per death. The counter feeds the
  // fight loop's death guard (the F15 class: the Drowned fight's deadline
  // outlived the death because the entity SURVIVES the respawn - only the
  // event names it deterministically). A death BEFORE the fight's arm read
  // is baseline history, never a false break.
  let deathStamp = 0
  bot.on('death', () => { deathStamp++ })

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
  // (v0.340.0) THE FREEZE TRACKER - the tick age is the one gate the
  // mineflayer source does not expose (shouldUsePhysics is a closure var),
  // so the frozen verdict infers the lane's state from the loop's own
  // heartbeat: silent >= FREEZE_TICK_SILENT_MS with every gate open means
  // the forced-move re-arm never came. One field write per tick - cheaper
  // than the verdict it feeds.
  bot._lastPhysicsTickAt = Date.now()
  bot.on('physicsTick', () => { bot._lastPhysicsTickAt = Date.now() })

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
  // (v0.223.0) THE CHURN RECORDER: the bot's OWN rescue-start timestamps -
  // the wet churn governor's per-bot input (the storm read was never a fleet
  // total: F9 g653/r19 + F19 g598/r17 while F11 read the same fleet calm).
  // A capped sliding log, not a lifetime list: the plan's window is 180s and
  // the worst measured client printed 25 starts in a whole 600s run, so the
  // cap (the module's WET_CHURN_LOG_CAP) is storm-proof headroom. The record
  // rides the ARMED section of rescueFromWater - the stand-down gate returns
  // BEFORE it, so a gated repeat page never reads as a rescue (the honest
  // per-bot cadence is the plan's whole premise).
  const wetRescueLog = []
  let swimming = false
  let lastRescueAt = 0
  // (v0.443.0) THE SAME-TARGET RE-ARM BRAKE's ledger: target key -> the last
  // transit stall's epoch ms. PER-BOT and CROSS-EPISODE (this closure outlives
  // every rescue) - the v0.82.0 latch condemns a swim for the rest of its
  // EPISODE, this ledger carries the verdict to the NEXT one (face 30's F8
  // launched 26 times at one [-143,430] oak_log, ground gained 0..0 - every
  // episode paid the same wall from its first pass). The gate lives in
  // landBearingFromMap; the record rides the land branch's stall verdict.
  const rearmStalls = new Map()
  let lastGlitchLogAt = 0
  let lastBypassEchoAt = 0 // (v0.265.0) the bypass echo's rate limiter (the AIR_GLITCH_LOG_MS cadence)
  let headWetSince = 0
  let headWetLastMs = 0 // (v0.279.0) the most recent COMPLETED wet episode's duration - the death context's fallback when the live tracker reads reset
  let headWetEndedAt = 0 // (v0.357.0) the epoch ms that episode ended - the wet-rescue window's tail anchor
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
    wetRescueLog.push(Date.now()) // (v0.223.0) the churn recorder - a rescue START (the stand-downs never reach this line)
    if (wetRescueLog.length > WET_CHURN_LOG_CAP) wetRescueLog.splice(0, wetRescueLog.length - WET_CHURN_LOG_CAP)
    noteGlobal('water:rescue') // (v0.62.0) run53's OOM and run60's 150s freeze both began mid-rescue - mark the site
    let standingWet = false // exited via the standing-in-shallow-water policy
    let sawWater = false // (v0.104.0) the dry-land proof's water-contact latch
    let sawHeadWater = false // (v0.300.0) the dry-tail proof's HEAD-contact latch (the lungs' truth: the eye submerged is the only thing that drains oxygen)
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
    let shoreHits = 0 // (v0.314.0) shore scans that returned a bearing - the ground-truth ledger
    let blindLiveSeen = false // (v0.315.0) the live blind line's one-shot latch - one line per rescue, its own budget
    let ascendDigs = 0 // (v0.125.0) the deep-pocket ascend ceiling-dig budget
    let passNo = 0
    let passLogAt = 0
    let passLogs = 0
    let mapMissLogged = false
    let rearmBrakeLogged = false // (v0.443.0) the brake line's once-per-rescue latch (the mapMissLogged shape)
    let transitPlan = null // (v0.82.0) the progress latch: { key, d0, atPass, logged }
    let transitStalledFlag = false // once the walls own the swim, the release owns the pass
    // (v0.367.0) the shore-bearing latch: the same shape the land branch runs
    // (key = the bearing octant, d0 = the ring radius at first sight) - face
    // 36750791170's F10/F14 swam a bearing the walls owned for the WHOLE
    // budget because this branch had no stall test and the release sat one
    // branch below, unreachable while a bearing existed.
    let dirPlan = null // { key, d0, atPass, logged }
    let shorePin = null // (v0.377.0) the shoreline pin: { d0, passes, logged } - reads the RESCUE, never resets on the bearing's rotation
    let frozenDown = false // (v0.82.0) the physics flatlined - the reconnect lane owns the bot
    let frozenDownWet = false // (v0.96.0) the flatline verdict arrived while HEAD-WET - the drowning clock owns it, the relog fires on the FIRST verdict
    let frozenDownO2 = null // (v0.265.0) the bar at the verdict - the bypass echo's read (the loop fuel)
    let frozenDownWindow = null // (v0.265.0) which window condemned: the wet-critical fast one or the legacy ten-pass
    let apexRestLogged = false // (v0.381.0) the apex-rest exemption's one-shot line - the rest re-verdicts every pass, the log must not
    // (v0.374.0) THE DEATH LATCH: the death EVENT fires at the death moment,
    // before any respawn - the finally's health read races the respawn (face
    // 36760275928's F11 died to a hound mid-rescue and closed 'rescue
    // complete in 25.1s' on the respawned health). The latch outranks every
    // legacy branch in the verdict below.
    let diedMidRescue = false
    // The fleet map knows land the raw 12-block shore scan cannot: a tree log
    // STANDS on land, sand/gravel LINE shores. One unit bearing to the nearest
    // known land cell, or null (no map / no entries / junk) - the caller then
    // falls through to the release policy.
    const landBearingFromMap = () => {
      if (!map || !bot.entity?.position) return null
      const here = bot.entity.position
      // (v0.443.0) THE SAME-TARGET RE-ARM BRAKE: a nearest land whose key sits
      // in its stall cooldown is SKIPPED - the next LAND_PROXY is the different
      // approach cell; no proxy left = null = the release/probes/hold branches
      // own the pass (the cooldown leg the episode machinery already built).
      // Junk/absence reads verdict-null - the legacy launch byte-identical.
      let braked = null // the refused target's evidence ({ name, x, z, ageMs }) - one line per rescue
      for (const name of LAND_PROXIES) {
        let p = null
        try { p = map.nearest(name, here, { maxDistance: TRANSIT_MAP_RANGE }) } catch { /* junk map read */ }
        if (!p) continue
        const b = transitBearing({ hx: here.x, hz: here.z, lx: p.x, lz: p.z })
        if (b) {
          // the key is the stall ledger's own (the land branch's tkey shape -
          // name + the rounded planar target - same source cell, same string)
          const rkey = `${name},${Math.round(p.x)},${Math.round(p.z)}`
          const brakedV = rearmVerdict(rearmStalls, { key: rkey, now: Date.now() })
          if (brakedV) {
            if (!braked) braked = { name, x: p.x, z: p.z, ageMs: brakedV.ageMs }
            continue // THE BRAKE: the next proxy (a different approach cell) or the release owns this swim
          }
          log(`${tag} water: transit toward known land (${name}) at [${p.x},${p.z}] d=${b.dist.toFixed(0)}`)
          return { ...b, name, tx: p.x, tz: p.z }
        }
      }
      if (braked && !rearmBrakeLogged) {
        rearmBrakeLogged = true
        log(`${tag} water: same-target re-arm braked (${braked.name} at [${braked.x},${braked.z}] stalled ${(braked.ageMs / 1000).toFixed(0)}s ago - the next proxy or the release owns this swim)`)
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
    const onRescueDeath = () => { diedMidRescue = true }
    try { bot.on('death', onRescueDeath) } catch { /* a client this dead never fires or removes it */ }
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
        // (v0.374.0) the death latch breaks too: a respawned client reads
        // health 20 and the loop would swim ON posthumously otherwise.
        if (diedMidRescue || (bot.health ?? 20) <= 0) break
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
          // (v0.300.0) the head latch: a feet-wet shallow-dip flail (the F15
          // face class) latches sawWater and keeps the legacy hazard record
          // forever - the lungs' truth needs its own latch to disprove it.
          if (isWaterName(read.head) || read.headWaterlogged === true) sawHeadWater = true
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
          if (dir) shoreHits++ // (v0.314.0) the rescue SAW a shore at least once
          if (!dir) land = landBearingFromMap()
        } else {
          headDrySince = null // submerged again: the dry clock restarts
        }
        // (v0.81.0) THE BLACKBOX PASS LINE - rate-limited to survive 19 bots.
        if (Date.now() - passLogAt >= PASS_LOG_INTERVAL_MS && passLogs < PASS_LOG_MAX_PER_RESCUE) {
          passLogAt = Date.now()
          passLogs++
          const p = bot.entity.position
          // (v0.268.0) the tithe: the pass line's o2 joins the one renderer
          // (o2SensorLabel) - the raw -1 sentinel prints NAMED like every
          // other site (the 1030 census: the pass lines were the last raw site).
          log(`${tag} water: pass ${passNo} head=${headWet ? 'wet' : 'dry'} shore=${dir ? `hit r=${dir.dist}` : 'none'} land=${land ? `${land.name} d=${land.dist.toFixed(0)}` : (headWet ? 'n/a' : 'none')} y=${p.y.toFixed(1)} o2=${o2SensorLabel(read.oxygen)} probes=${standingProbes} at=[${p.x.toFixed(0)},${p.y.toFixed(0)},${p.z.toFixed(0)}]`)
        }
        // (v0.315.0) THE LIVE BLIND LINE - the v0.314.0 decode names the
        // blindness at the END line, but F10's climb died mid-climb with the
        // verdict still unspoken: the only live evidence was the per-pass
        // lines, and those are rate-limited (PASS_LOG_INTERVAL_MS / cap) -
        // the shared-cap starvation lesson the pounce probe taught. This
        // line speaks ONCE per rescue while the blind climb still flies,
        // naming the air budget it burns (the F10 shape: pass 0 o2=3 ->
        // pass 5 o2=0). The dry branch is exempt (headWet gate): it gathers
        // shore truth, the blind class would lie there. Rides the existing
        // 'water' filter key in fleet19.mjs - no new filter key.
        if (!blindLiveSeen && headWet && rescueBlindness({ passes: passNo + 1, probes: standingProbes, shoreHits })) {
          blindLiveSeen = true
          log(`${tag} water: rescue blind live (pass ${passNo + 1}, air=${o2SensorLabel(read.oxygen)}, no ground truth yet - the climb flies on buoyancy alone)`)
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
            // (v0.271.0) THE ASCEND GRACE - the condemned pass goes to the
            // ceiling dig when the grace's precondition holds (head wet,
            // budget left, the stall armed at the SAME point count the fast
            // freeze needs - the tie the old K=4 lost by exactly one pass;
            // face 36378053182: F1's six finite-critical cycles relogged
            // #1..#7 and never dug). A dug ceiling moves the y and the freeze
            // never re-verdicts; a failed/absent/undiggable read falls
            // through to the break byte for byte - the detector still owns
            // the true freeze, one pass later at most.
            if (ascendGraceWanted({ headWet, ascendDigs, points: passPoints })) {
              // (v0.343.0) THE LID SCAN at the grace: the column read plans
              // the dig (water cells are the lid, never the target; the
              // first diggable non-water cell is the ceiling) - the legacy
              // probe accepted the fluid itself (water reads diggable:true,
              // hardness 100) and burned the 6s inside the silent catch.
              const gcell = ceilingCell(bot.entity?.position)
              const gplan = lidScanPlan({ reads: lidReads(bot, gcell) })
              const gtgt = gplan.offset >= 0 && gcell
                ? { x: gcell.x, y: gcell.y + gplan.offset, z: gcell.z }
                : null
              const gceil = gtgt
                ? (() => { try { return bot.blockAt(new Vec3(gtgt.x, gtgt.y, gtgt.z)) } catch { return null } })()
                : null
              if (gceil && gceil.diggable === true && isWaterName(gceil.name) !== true) {
                ascendDigs++
                try {
                  await withTimeout(bot.dig(gceil), 6000, 'ascend grace dig')
                  log(`${tag} water: ascend grace - dug the ceiling ${gceil.name} at [${gtgt.x},${gtgt.y},${gtgt.z}]${gplan.offset > 0 ? ` through a ${gplan.offset}-cell lid` : ''} on the frozen verdict's pass (o2 ${o2SensorLabel(read.oxygen)}; the freeze re-verdicts next pass if the dig buys nothing)`)
                  continue // the pass is spent on the dig - the loop re-reads fresh
                } catch { /* the dig lost the race: the break below owns it */ }
              }
            }
            // (v0.381.0) THE APEX-REST EXEMPTION - the frozen verdict must
            // respect the rescue's own entry-gate law (v0.82.0: a bot at or
            // below the rescue line, or on a junk bar, NEVER stands down).
            // Face 36796588698's F12: the bob apex rest (head DRY, y flat)
            // at o2 0 -> reset(-1) was condemned 'frozen physics', the
            // stand-down handed the air line to the reconnect lane, and the
            // re-page cycle re-climbed three stacked rescues in 19s - the
            // drowning clock collected the bot in a wet dip. A flat
            // dry-headed bot at/below the rescue line or on a lost read is
            // the release's own window - the exemption skips the stand-down
            // (no frozenDown, no break), the pass falls through to the
            // branch ladder below: the shore pin condemns the wall swim and
            // the release takes over. The wedged classes it exists for keep
            // their windows byte for byte: head WET (the v0.132.0 fast
            // window) and healthy air above the rescue line (run76's F17
            // legacy window) both read exempt=false.
            if (apexRestExempt({ headWet, oxygen: read.oxygen })) {
              if (!apexRestLogged) {
                apexRestLogged = true
                log(`${tag} water: apex rest held (${frozenWindow} flat passes at y=${pp.y.toFixed(1)}, o2=${o2SensorLabel(read.oxygen)}, head dry - the lungs own the clock, the release window owns the rest)`)
              }
            } else {
            if (Date.now() - standDownLogAt >= STAND_DOWN_LOG_MS) {
              standDownLogAt = Date.now()
              log(`${tag} water: frozen physics (${frozenWindow} flat passes at y=${pp.y.toFixed(1)}, o2=${o2SensorLabel(read.oxygen)}${headWet ? ', head WET' : ''}${frozenWindow !== FROZEN_WINDOW ? ' - the wet-critical fast window' : ''}) - standing down, the reconnect lane owns this`)
              // (v0.340.0) THE FREEZE NAMES ITSELF - the verdict above
              // condemns, this line diagnoses: the gates read the
              // mineflayer source's own skip order (state -> entity ->
              // chunk -> enabled -> the lane's tick age). Junk-safe: an
              // unreadable gate passes as null and the classifier refuses
              // to name what it cannot prove ('unproven'). The relog
              // decision below keeps its byte-for-byte shape.
              const frz = freezeClass({
                clientState: (() => { try { return bot._client?.state ?? null } catch { return null } })(),
                hasFiniteEntity: (() => { try { const p = bot.entity?.position; return !!p && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z) } catch { return null } })(),
                chunkLoaded: (() => { try { const p = bot.entity?.position; return p ? bot.blockAt(p) != null : null } catch { return null } })(),
                physicsEnabled: (() => { try { return bot.physicsEnabled === true } catch { return null } })(),
                tickAgeMs: (() => { try { const t = bot._lastPhysicsTickAt; return Number.isFinite(t) ? Date.now() - t : null } catch { return null } })()
              })
              log(`${tag} water: freeze named ${frz.cls} - ${frz.why}`)
            }
            frozenDown = true
            frozenDownWet = headWet === true
            frozenDownO2 = read.oxygen
            frozenDownWindow = frozenWindow !== FROZEN_WINDOW ? 'wet-critical fast' : 'legacy'
            break
            }
          }
        }
        if (!headWet) {
          // (v0.377.0) THE SHORE-PIN BREAK: the shoreline patrol rotates the
          // bearing every pass - face 36792489622's F1 walked NINE blocks
          // along the wall (x -133 -> -142) with r pinned at 1-2 the whole
          // way, every rotation resetting dirPlan's per-bearing key, the
          // 15-pass patience never filling, the release starving below (0
          // probes, 'still wet ... tail dry/dry/dry'). The pin reads the
          // RESCUE, not the bearing: the first sight's radius and a dry-pass
          // counter that never resets. At the shore (r <= SHORE_PIN_RADIUS)
          // or making no margin progress for SHORE_PIN_PASSES, the swim is
          // condemned for the rest of the rescue - one flag, one policy:
          // this branch skips, the release and the probes take over, and
          // the F1 class pays ~8 passes instead of the whole budget. A
          // closing deep swim (>= the margin, outside the radius) never
          // arms - the healthy path keeps the settle(8) swim byte for byte.
          if (dir && !transitStalledFlag) {
            if (!shorePin) shorePin = { d0: dir.dist, passes: 0, logged: false }
            shorePin.passes++
            if (shorePinned({ d0: shorePin.d0, d: dir.dist, passes: shorePin.passes })) {
              if (!shorePin.logged) {
                shorePin.logged = true
                log(`${tag} water: shore pinned (r=${dir.dist.toFixed(0)} after ${shorePin.passes} passes - the shoreline owns this swim; the release takes over)`)
              }
              transitStalledFlag = true
            }
          }
          if (dir && !transitStalledFlag) {
            // (v0.367.0) THE SHORE-STALL YIELD: the land branch has owned the
            // progress latch since v0.82.0 (run76's F9 steered at d=7 that
            // never shrank) - the shore-bearing branch never did. Face
            // 36750791170's F10/F14 paid the gap: 'rescue blind live' then a
            // full-budget timeout ('still wet, 14/44 passes, 0 probes, tail
            // dry/dry/dry') swimming a bearing the walls owned, while the
            // release sat one branch below - unreachable while a bearing
            // existed. The same latch, the same patience (transitStalled):
            // track the bearing's ring radius from first sight, condemn the
            // plan when the radius stops shrinking, and the release/probe
            // branches below take over this pass and every pass after (one
            // flag, one policy - the land branch's latch is the same latch).
            // (v0.378.0): the latch keys the bearing's
            // SECTOR (the wobble-tolerant key - faces 12/15/16 paid 11/11
            // zero-probe timeouts while exact-pair resets starved the clock)
            // and the patience gains TIME (a slow-cadence rescue dies at 13
            // passes - under the pass patience - with the whole budget spent
            // on one bearing; 10s without margin progress is the same wall at
            // any cadence). The land branch keeps its byte-identical call.
            const dkey = bearingSectorKey({ dx: dir.dx, dz: dir.dz }) ?? `${dir.dx},${dir.dz}`
            if (!dirPlan || dirPlan.key !== dkey) dirPlan = { key: dkey, d0: dir.dist, atPass: passNo, atMs: Date.now(), logged: false }
            if (transitStalled({ d0: dirPlan.d0, d: dir.dist, passes: passNo - dirPlan.atPass, ms: Date.now() - dirPlan.atMs })) {
              if (!dirPlan.logged) {
                dirPlan.logged = true
                log(`${tag} water: shore transit stalled (r=${dir.dist.toFixed(0)} after ${passNo - dirPlan.atPass} passes - the walls own this swim; the release takes over)`)
              }
              transitStalledFlag = true
            } else {
              bot.setControlState('jump', true) // stay at the surface while swimming
              try { await withTimeout(bot.lookAt(bot.entity.position.offset(dir.dx, 0, dir.dz), false), 2000, 'rescue look') } catch { /* keep the bearing */ }
              bot.setControlState('forward', true)
              await settle(8)
              bot.setControlState('forward', false)
            }
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
                // (v0.443.0) THE BRAKE'S FUEL: the stall verdict enters the
                // cross-episode ledger - the NEXT rescue episode's
                // landBearingFromMap reads it and skips this target's
                // cooldown (the same-target re-arm the three held faces
                // paid for never re-arms free).
                noteTransitStall(rearmStalls, { key: tkey, now: Date.now() })
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
            // (v0.343.0) THE LID SCAN at the pass loop: the column read plans
            // the dig - water cells are the lid (skipped; the old probe aimed
            // at the column's own water, whose diggable:true burned the 6s
            // timeout in the silent catch), the first diggable non-water cell
            // is the ceiling, every refusal keeps the jump-only shape.
            const cell = ceilingCell(bot.entity?.position)
            const plan = lidScanPlan({ reads: lidReads(bot, cell) })
            const tgt = plan.offset >= 0 && cell
              ? { x: cell.x, y: cell.y + plan.offset, z: cell.z }
              : null
            const ceil = tgt
              ? (() => { try { return bot.blockAt(new Vec3(tgt.x, tgt.y, tgt.z)) } catch { return null } })()
              : null
            if (ceil && ceil.diggable === true && isWaterName(ceil.name) !== true) {
              ascendDigs++
              try {
                await withTimeout(bot.dig(ceil), 6000, 'ascend dig')
                log(`${tag} water: deep-pocket ascend - dug the ceiling ${ceil.name} at [${tgt.x},${tgt.y},${tgt.z}]${plan.offset > 0 ? ` through a ${plan.offset}-cell lid` : ''} (jump stalled ${ASCEND_STALL_PASSES}+ passes${plan.offset > 0 ? `; ${plan.why}` : ''}, o2 ${o2SensorLabel(read.oxygen)})`)
              } catch { /* the dig lost the race: the jump-only shape carries on */ }
            }
          }
          await settle(5)
        }
      }
      // (v0.374.0) THE DEATH LATCH reads FIRST (the pure gate: the respawned
      // health read cannot launder a mid-rescue death into a completion) -
      // the ladder below the latch is the field's byte-identical history.
      const endWet = diedMidRescue || !bot.entity || (bot.health ?? 20) <= 0 || standingWet || releasedSafe || frozenDown
        ? { feetWet: false, headWet: false }
        : { feetWet: isWaterName(waterRead().feet), headWet: isWaterName(waterRead().head) }
      const done = rescueEndVerdict({
        diedMidRescue,
        hasEntity: !!bot.entity,
        health: bot.health ?? 20,
        standingWet,
        releasedSafe,
        frozenDown,
        ...endWet,
        passNo,
        standingProbes,
        tail: rescueReads.slice(-3).map(r => r.wet ? 'wet' : 'dry').join('/')
      })
      // (v0.314.0) THE BLIND RESCUE DECODE - the bracket rides the existing end
      // line: a rescue that ran >= RESCUE_BLIND_FLOOR_PASSES passes with zero
      // shore scans hit and zero standing probes flew on buoyancy alone (the F10
      // class: o2 3 -> 0 over a head-wet climb, every pass 'shore=none probes=0').
      const blindness = rescueBlindness({ passes: passNo, probes: standingProbes, shoreHits })
      log(`${tag} water: rescue ${done}${blindness ? ` [${blindness}: ${passNo} passes, ${shoreHits} shore scans hit, ${standingProbes} standing probes - no ground truth ever gathered]` : ''} in ${((Date.now() - lastRescueAt) / 1000).toFixed(1)}s`)
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
        // (v0.361.0) the decision reads the bot's frozen-relog streak: the
        // wet first-verdict saver stands down once the loop is proven (the
        // F6 ladder - six consecutive wet relogs, every armed hold voided
        // on arrival, the bar sank o2 4 -> 1 -> 0 across the bypass echoes)
        // and the transient stall gets its grace; the legacy threshold
        // still owns the next relog if the freeze persists.
        const esc = frozenRelogDecision({ frozenStandDowns, hasEntity: !!bot.entity, health: bot.health ?? 20, headWet: frozenDownWet, oxygen: frozenDownO2, consecutiveRelogs: frozenRelogStreaks.get(username) || 0 })
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
          // (v0.425.0) THE WALK-OUT STATE ARMS with the gate - the promise now
          // has a witness. The frozen client's position IS the relog position
          // (the server respawns the fresh client into the same column - the
          // F10 lane's own shape), the window is the gate's own ladder, and
          // the stage inherits so the escalation rungs ratchet across relogs
          // (window 1 stalled -> gates; window 2 -> + goal release; window 3
          // -> the named shift exit). A junk position arms nothing measurable
          // - the verdict reads 'unmeasured' and no rung spends (the
          // gates-decide convention).
          const prevWalkout = frozenRelogWalkouts.get(username)
          try {
            const ep = bot.entity?.position
            frozenRelogWalkouts.set(username, {
              x: ep?.x, y: ep?.y, z: ep?.z,
              until: Date.now() + hold,
              windowMs: hold,
              stage: prevWalkout?.stage ?? 0,
              done: false
            })
          } catch { /* a junk witness arms nothing - the sentry owns what follows */ }
          // (v0.265.0) THE BYPASS ECHO rides the line's tail (the identity-extends
          // precedent): the verdict's full read - the labeled bar, the health, the
          // condemning window - and, when the bar is critical, the named void: the
          // hold this line arms is the hold the NEXT page bypasses (the F1 loop's
          // fuel, finally visible at the moment it is armed).
          const bypassEcho = frozenBypassEcho({ oxygen: frozenDownO2, headWet: frozenDownWet, underHold: true })
          log(`${tag} water: frozen client relog (#${relogStreak} consecutive) (${esc.why}) - ending the session, the reconnect lane rebuilds the physics; the drowning sentry holds non-critical pages ${Math.round(hold / 1000)}s (the frozen-return gate) - o2=${o2SensorLabel(frozenDownO2)} health=${bot.health ?? '?'} window=${frozenDownWindow ?? '?'}${bypassEcho ? ` - ${bypassEcho}` : ''}`)
          try { bot.end() } catch { /* the session loop owns the wreck */ }
        } else if (esc.loopBreak === true) {
          // (v0.361.0) THE LOOP-BREAK LINE - the refusal used to fall
          // through SILENTLY (the relog branch printed, the refusal never
          // did - the v0.265.0 echo lesson, one lane deeper). The line
          // names the proven loop, the grace's owner and the backstop.
          // No throttle: the completion handler runs once per rescue end.
          // Worded to stay OUT of the decompose.mjs relog counter's lane
          // (it counts /frozen client relog/ - this is not one).
          log(`${tag} water: frozen-relog loop break (#${frozenRelogStreaks.get(username) || 0} consecutive) (${esc.why}) - the session rides the freeze, the sentry re-pages and the rescue re-verdicts`)
        }
      } else {
        frozenStandDowns = 0 // living physics: the escalation restarts
        // (v0.119.0) an HONEST completion - the client lived through the whole
        // budget: the frozen-cycler ladder forgets the bot (the streak and the
        // armed hold both clear; the next freeze starts from rung one).
        if ((frozenRelogStreaks.get(username) || 0) > 0) {
          frozenRelogStreaks.set(username, 0)
          frozenReturnGates.delete(username)
          frozenRelogWalkouts.delete(username) // (v0.425.0) the walk-out witness forgives with the ladder - the next freeze starts from rung one
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
      try { bot.off('death', onRescueDeath) } catch { /* the listener never fires twice - the teardown stays honest */ }
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
          // (v0.337.0) the abandonment hand: the exact page that crosses
          // GLITCH_ABANDON_PAGES names the stand-down once - the class is
          // retired until wet contact or a wet rescue re-arms it.
          if (glitchConfirmed === GLITCH_ABANDON_PAGES) {
            // (v0.342.0) the hand counter rides the hand log - the storm row
            // names the abandonment's leg without re-reading rate-limited lines.
            stats.glitchAbandons = (stats.glitchAbandons ?? 0) + 1
            log(`${tag} water: liar ladder abandons the glitch class - ${glitchConfirmed} confirmed no-op pages, the streak lane stands down (wet contact or a wet rescue re-arms)`)
          }
        }
        noOpRescueGateUntil = Date.now() + DRY_PROOF_BACKOFF_MS
      } else if (dryTailTimeoutProof({
        headWetPasses: sawHeadWater ? 1 : 0,
        tailWet: rescueReads.length
          ? rescueReads.slice(-DRY_TAIL_PROOF_DEPTH).filter(r => r && r.wet).length
          : 0,
        tailReads: Math.min(rescueReads.length, DRY_TAIL_PROOF_DEPTH)
      })) {
        // (v0.300.0) THE DRY-TAIL PROOF: the feet-wet shallow-dip flail (face
        // 36511867751 F15 x17: 25s budget, 50 passes, head dry all passes,
        // 'tail dry/dry/dry', the same shore cell re-memorized each timeout)
        // - the lungs' truth outranks the bar: oxygen drains only while the
        // EYE is submerged, so a dry head across the whole flail disproves
        // the drowning the bar claimed. The SAME cure as the fast band (no
        // hazard write, the streak restarts, the backoff, the ratchet) - the
        // frozen/stall exits (0-2 reads) keep the legacy record (the full
        // tail window is the band's own gate).
        if (dryGlitchStreak > 0) {
          dryGlitchStreak = 0
          log(`${tag} water: dry-tail proof (the ${passNo}-pass flail never wet the head in ${((Date.now() - lastRescueAt) / 1000).toFixed(1)}s, the tail read dry) - the critical-on-dry streak restarts, the next glitch page waits ${Math.round(DRY_PROOF_BACKOFF_MS / 1000)}s`)
        }
        if (rescuePageWasGlitch) {
          glitchConfirmed++
          log(`${tag} water: liar ladder ratchets - confirmed no-op glitch page #${glitchConfirmed}, the next override needs ${glitchStreakCap(glitchConfirmed)} fresh critical-on-dry reads`)
          // (v0.337.0) the abandonment hand: the exact page that crosses
          // GLITCH_ABANDON_PAGES names the stand-down once - the class is
          // retired until wet contact or a wet rescue re-arms it.
          if (glitchConfirmed === GLITCH_ABANDON_PAGES) {
            // (v0.342.0) the hand counter rides the hand log - the storm row
            // names the abandonment's leg without re-reading rate-limited lines.
            stats.glitchAbandons = (stats.glitchAbandons ?? 0) + 1
            log(`${tag} water: liar ladder abandons the glitch class - ${glitchConfirmed} confirmed no-op pages, the streak lane stands down (wet contact or a wet rescue re-arms)`)
          }
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
  // (v0.248.0) THE SENTRY MIRROR STATE - the death handler's breath mirror
  // reads this snapshot (the last computed verdict + the bar shape) when a
  // drowning death needs its WHY. Updated every pageable tick; the sentry's
  // early returns (the controls owner, the cooldown) never reach this line -
  // those gates are LIVE-checkable at death and the mirror reads them live.
  let sentryLast = null
  const drownTimer = setInterval(() => {
    try {
      // (v0.17.0) bot._climbEscape: the wet-escape traverse owns the controls -
      // it IS the escape (a purposeful 15s gallery beats the measured 25s
      // tread-water timeout), and a rescue mid-dig would undo its own way out
      if (!bot.entity || swimming || defending || bot._climbEscape) return
      if (Date.now() - lastRescueAt < RESCUE_COOLDOWN_MS) return // a bot treading a flooded shaft re-fires otherwise every 5 s
      const now = Date.now()
      // (v0.425.0) THE RELOG WALK-OUT ENFORCEMENT - the frozen-after-relog
      // detector. The gate hold promises a walk-out ('the fresh client walks
      // the hazard-ledgered column out') and expires silently; face
      // 36864564525's F10 rode that silence through THREE consecutive frozen
      // relogs (o2=20 every time - not a drowning, a wedged fresh client on
      // the same column). When the armed window expires (the gate ladder's
      // own budget, never a new constant) the displacement from the relog
      // position is judged against the walk layer's progress bar
      // (RELOG_WALKOUT_MIN_PROGRESS = STALL_MIN_PROGRESS): below it the
      // walk-out stalled and the ladder runs - rung 1 resets the bot's walk
      // gates/stalls, rung 2 releases the wedged goal slot so the plan
      // re-decides, rung 3 names the honest shift exit (the escape hatch
      // stays visible; the session loop owns the call). One verdict per
      // window (done latches); a proven walk-out deletes the witness, the
      // honest completion already does. Unmeasured positions escalate
      // nothing - a lost read never spends a rung.
      try {
        const wo = frozenRelogWalkouts.get(username)
        if (wo && !wo.done && now >= wo.until) {
          wo.done = true
          const displacement = walkoutDisplacement(wo, bot.entity?.position)
          const verdict = walkoutVerdict({ displacement })
          if (verdict === 'stalled') {
            wo.stage = (Number.isFinite(wo.stage) ? wo.stage : 0) + 1
            const esc = walkoutEscalation({ stage: wo.stage })
            if (esc.resetGates) { try { resetWalkGovernorFor(bot) } catch { /* the reset never kills the sentry */ } }
            if (esc.releaseGoal) { try { releaseWalkGoal(bot) } catch { /* the release never kills the sentry */ } }
            log(walkoutStallLine({ tag, displacement, windowMs: wo.windowMs, why: esc.why }))
          } else if (verdict === 'walked-out') {
            frozenRelogWalkouts.delete(username) // the promise held - the witness stands down
          }
        }
      } catch { /* a witness must never kill the sentry */ }
      const read = waterRead()
      const headWet = isWaterName(read.head)
      // (v0.279.0) the completed-episode capture: a dry sample ends the wet
      // episode - its DURATION survives in headWetLastMs so the death context
      // can render the previous wetting '@last' when the live tracker reads
      // reset (the surface-bob + rescue-gate freeze the field read proved)
      if (headWet) { if (!headWetSince) headWetSince = now } else { if (headWetSince) { headWetLastMs = now - headWetSince; headWetEndedAt = now } headWetSince = 0 }
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
        // (v0.357.0) THE WET-RESCUE CLASSIFICATION - face 36733939481 read a
        // 600-glitch storm that decomposed to ONE bot's ONE wet rescue: the
        // rescue's surface-bob reads dry block contact while the bar is
        // genuinely low, and every such read counted as an ambient glitch.
        // A read inside the wet window (head wet NOW, or within the 45s tail
        // after the episode ended or a rescue fired) counts BOTH counters -
        // the total keeps its meaning for the economy and the diet (no
        // cascade), the wet share is the storm verdict's exclusion feed.
        if (wetRescueWindowLive({ headWetNow: headWetSince > 0, lastWetEndAt: headWetEndedAt, lastRescueAt, now })) stats.wetRescueGlitches = (stats.wetRescueGlitches ?? 0) + 1
        stats.airGlitches++
        if (now - lastGlitchLogAt >= AIR_GLITCH_LOG_MS) {
          lastGlitchLogAt = now
          // (v0.195.0) the map pin: the line names WHERE the sensor sat broken
          log(airGlitchLogLine({ tag, oxygen: o2raw, total: stats.airGlitches, pos: bot.entity?.position }))
        }
        const streakCap = glitchStreakCap(glitchConfirmed)
        if (dryGlitchStreak === streakCap) {
          // (v0.347.0) the air-bar ledger's counter: this hand BELIEVED the
          // bar and pays a rescue - the face-level row prices the hands (the
          // v0.346.0 lesson: the counter rides CARRY_FIELDS from birth, a
          // relog after the hand must not orphan it)
          stats.airBarOverrides = (stats.airBarOverrides ?? 0) + 1
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
      // (v0.337.0) THE GLITCH ABANDONMENT - after GLITCH_ABANDON_PAGES
      // confirmed no-op pages the UNCORROBORATED critical-on-dry class stands
      // down (the ladder paced the chronic liar but never retired it; face
      // 36669231548's F14 looped the whole run - 276 glitches, the rescue hole
      // 100% F14, the chains stood still). The guards: the witness outranks
      // the abandonment (a corroborated drain still pages), wet pages never
      // ride this lane, and the v0.117.0 resets (wet contact, a wet rescue)
      // re-arm the class. The telemetry above keeps counting - the storm
      // metric stays honest, only the page dies.
      const abandoned = !witnessed && criticalOnDry && glitchAbandoned(glitchConfirmed)
      const verdict = witnessed
        ? 'drowning'
        : abandoned
          ? 'none'
          : waterVerdict({ ...read, headWetMs: headWet ? now - headWetSince : 0, dryGlitchStreak, dryGlitchCap: glitchStreakCap(glitchConfirmed), airHistory: o2History.slice() })
      sentryLast = { at: now, verdict, criticalOnDry, witnessed, o2: o2raw, headWet } // (v0.248.0) the mirror's snapshot
      // (v0.356.0) THE HONEST HOLE - the ignored reads counter. The glitch
      // counter counts EVERY critical-on-dry read, but the reads whose
      // verdict is NOT a rescue page are the class the net DISPROVED (the
      // gate-held, the ladder-held, the abandoned - the ignore class burns
      // nothing, the v0.347.0 law). Counting them as unrescued mass let the
      // hole row aim the cure at a sensor ghost: face 36733939481's F12 read
      // g600/r5 -> 'rescue hole: local - F12 holds 595u (100%)' while the net
      // actually HELD (4 override hands, 6 starts, the ladder ratcheted 3x).
      // The honest hole = raw - disproved - rescued. Monotone, integer, and
      // it rides CARRY_FIELDS from birth (the v0.346.0 lesson, third strike).
      if (criticalOnDry && verdict !== 'drowning') stats.airGlitchIgnored = (stats.airGlitchIgnored ?? 0) + 1
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
        const frozenHoldLive = Date.now() < frozenGateUntil
        // (v0.266.0) the bypass reads the page's own class now: head WET + the
        // armed hold + a junked bar (the reset sentinel) is the F9 evidence -
        // the drowning clock outranks the hold even when the bar cannot say so.
        if (frozenHoldLive && !frozenReturnBypass({ oxygen: o2raw, headWet, underHold: frozenHoldLive })) {
          if (now - lastGlitchLogAt >= AIR_GLITCH_LOG_MS) {
            lastGlitchLogAt = now
            log(`${tag} water: frozen-return gate holds the page (${Math.round((frozenGateUntil - now) / 1000)}s left) - the fresh client walks the hazard-ledgered column out`)
          }
          return
        }
        // (v0.265.0) THE BYPASS ECHO - the gate side: a page crossing an ARMED
        // hold through the critical bypass used to fall through SILENTLY (the
        // hold branch printed, the bypass branch never did) - the F1 loop's
        // other half was invisible on the reconnect side too. The echo names
        // the void and the streak: a critical page while a hold is armed AND a
        // relog streak is riding is the loop's own signature in one line.
        if (frozenHoldLive && frozenRelogStreaks.get(username) > 0 && now - lastBypassEchoAt >= AIR_GLITCH_LOG_MS && !oxygenInDomain(Number(o2raw))) {
          lastBypassEchoAt = now
          log(`${tag} water: frozen-return gate bypassed (wet cycler o2=${o2SensorLabel(o2raw)} - the sentinel is not safety evidence, the drowning clock outranks the hold) - the rescue owns the clock (relog streak ${frozenRelogStreaks.get(username)})`)
        } else if (frozenHoldLive && frozenRelogStreaks.get(username) > 0 && now - lastBypassEchoAt >= AIR_GLITCH_LOG_MS) {
          lastBypassEchoAt = now
          log(`${tag} water: frozen-return gate bypassed (critical read o2=${o2SensorLabel(o2raw)}) - the armed hold voids on arrival, the rescue owns the clock (relog streak ${frozenRelogStreaks.get(username)})`)
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

  // (v0.546.0) THE LOGIN FENCE - the ready promise rides the shared machine
  // (src/lib/loginfence.mjs): spawn+boot resolves (the bootstrap below, unchanged),
  // a login-phase 'end' rejects (the clean-close class: endSocket emits 'end',
  // never 'error', on socket close/timeout and kick-during-login - the old
  // executor never heard it and await miner.ready hung the 12-attempt loop above
  // its own deadline check), 'error' rejects as before, and the wall-clock fence
  // bounds the silent login (TCP accepted, nothing ever fires). Settle-once: the
  // first leg wins, the fence clears on every settle, a late 'end' after a
  // resolved login is consumed quietly.
  const ready = createLoginReady(bot, {
    boot: async () => {
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
      return bot
    }
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
    let zeroWhy = null // (v0.240.0) the silent-break verdict - run36310927991's 13 steered tunnels all landed done=0 and the gate was INVISIBLE (all three first-cut breaks are silent)
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
        // (v0.242.0) THE FLUID NAME LAW: the 26.2 registry's water/lava carry
        // boundingBox "empty" (water id 35, lava id 36), so the box check alone
        // is blind - run36314614666 measured 23 water feet cells reaching the
        // names gate as '[names gate water]' while the fluid break slept. The
        // name is the second eye (isWaterName - the drowning family).
        const fluidAhead = (feetB && (feetB.boundingBox === 'fluid' || isWaterName(feetB.name))) ||
          (headB && (headB.boundingBox === 'fluid' || isWaterName(headB.name)))
        if (fluidAhead) {
          zeroWhy = tunnelZeroWhy({ feetBox: feetB?.boundingBox ?? null, headBox: headB?.boundingBox ?? null, feetName: feetB?.name ?? null, headName: headB?.name ?? null }) // (v0.240.0) the water-table band's verdict
          break
        }
        // (v0.429.0) THE TUNNEL STEP FENCE - the walking lane's own vertical
        // truth, probed BEFORE any dig of the step cell. The fleet fences
        // every other motion primitive against the 4+ drop (the shaft digger
        // sidesteps it, the vein sweep fences its cells, the support/lip dig
        // probe theirs, the wet-escape's traverseStep has the GAP GUARD) - the
        // raw one-block step was the LAST unfenced motion: dig the step cell
        // ahead, hold forward, 'let gravity handle the drop' at ANY depth.
        // THE FIELD WITNESS (face 27, 36870593766): F14 'fell from a high
        // place' [kind=fall] at [-132,45,405] - the ONLY fall death across
        // faces 26+27. A 4+ drop under the step cell (fall damage begins at
        // 4 - the shaft's own threshold), a fluid strike under it, or a blind
        // read (dropAheadBelow's depth-return on zero reads - the v0.86.0
        // stale-window law) refuses the iteration and the caller rotates -
        // the fluidAhead break's own shape. The verdict rides zeroWhy when
        // the gallery reads zero (the v0.240.0 silent-break law) and the
        // fence names itself in the log (the v0.35.0 lesson - a silent abort
        // is the hole the guards close).
        const stepAirBelow = dropAheadBelow(feetCell)
        const stepFluidBelow = fluidStrikeBelow(feetCell, { depth: 3 })
        const stepFence = tunnelStepRefusal({ airBelow: stepAirBelow, fluidBelow: stepFluidBelow !== null })
        if (stepFence) {
          stats.stepFenceRefused = (stats.stepFenceRefused ?? 0) + 1
          log(`${tag} tunnel: step fence - ${stepFence} at ${feetCell.x},${feetCell.y},${feetCell.z} - the caller rotates`)
          zeroWhy = `step fence: ${stepFence}`
          break
        }
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
          zeroWhy = tunnelZeroWhy({ roofOk: roof.ok, roofWhy: roof.why }) // (v0.240.0) the roof verdict rides the return even when the log cap ate the line
          break
        }
        if (roof.cleared > 0) stats.gravityCleared = (stats.gravityCleared ?? 0) + 1
        // clear the feet cell first (one-type names gate honoured; a refused break
        // is NOT counted - see lesson 1)
        if (feetB && feetB.type !== 0) {
          if (names && !names.includes(feetB.name)) {
            zeroWhy = tunnelZeroWhy({ feetName: feetB.name, names }) // (v0.240.0) the soft-cell verdict - a gold_ore/calcite wall is a legal stop, now a NAMED one
            break
          }
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
    return { done, secs, rate: secs > 0 ? done / secs : 0, stopped, zeroWhy: done === 0 ? zeroWhy : null }
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
    // (v0.251.0) THE ORE-TIER GUARD: the pocket's best pick decides which ores may
    // break. Below the table's minimum tier the block still breaks but drops NOTHING
    // (vanilla 26.2) - run36332307784 measured the class: iron_ore 9 mined, raw_iron
    // 0 all run, end picks wooden=23/stone=7/iron=0. The guard leaves the cell whole:
    // the vein stays on the map (take() never fires for an undug cell), the tier
    // upgrade (the cobble>=6 stone rung) comes back for it. One line per call names
    // the blocked volume - the decode reads the class size, not per-cell spam.
    const guardTier = bestPickTier(bot)
    const guardPickName = bestPickaxe(bot)?.item?.name || null
    const tierBlocked = {}
    try {
      for (let sweep = 0; sweep < sweeps; sweep++) {
        const batch = bot.findBlocks({ matching: b => names.includes(b.name), maxDistance: reach, count: 12 })
        let progressed = false
        for (const pos of batch) {
          if (shouldStop?.()) return dug
          const blk = bot.blockAt(pos)
          if (!blk || blk.type === 0) continue
          const oreNeed = oreTierRequired(blk.name)
          if (oreNeed !== null && guardTier < oreNeed) {
            tierBlocked[blk.name] = (tierBlocked[blk.name] || 0) + 1
            continue
          }
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
      // (v0.251.0) the guard's verdict line: zero blocked cells reads silence (the
      // honest zero - no line when the sweep had nothing to leave behind)
      if (Object.keys(tierBlocked).length) {
        const guardLine = oreTierGuardLine({ tag, blocked: tierBlocked, pickTier: guardTier, pickName: guardPickName })
        if (guardLine) log(guardLine)
      }
      // (v0.503.0) THE TIER DEBT STASH: the sweep's blocked volume above the pick tier
      // rides the bot (the _stash channel, the route-latch's shape) - the upgrade ladder
      // reads it as the debt that yields the cobble reserve. Unconditional write: a
      // clean sweep zeroes the debt (the verdict is always the LATEST sweep's truth).
      bot._tierDebt = tierDebtOf(tierBlocked, guardTier)
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
        let aboveFails = 0
        // (v0.294.0) the above family's own height bands - the residue the
        // support dig-down's verdict still leaves unpriced (the magnet's
        // reach line divides the path class from the walk-then-shake class)
        let above1Fails = 0
        let aboveHighFails = 0
        let skipDeep = 0
        let skipWalks = 0
        let admitRefusals = 0 // (v0.431.0) the goal admission's own count - the goals refused BEFORE the goto
        let lipDigs = 0
        let lipRefusals = 0
        let supportDigs = 0
        let supportRefusals = 0
        let cutRefusals = 0 // (v0.280.0) the cut refusal line's cap - the support refusals' own law
        let seal1 = 0 // (v0.267.0) the seal depth histogram - the sealed refusals by measured depth
        let seal2 = 0
        let seal3 = 0
        let sealNear = 0 // (v0.273.0) the reach split - the sealed candidates the dig family can even own
        let sealFar = 0
        let cutDigs = 0 // (v0.275.0) the ledge cut - the sealed class's first conversions
        let stanceSteps = 0 // (v0.283.0) the stance step's one-per-sweep cap - the sweep must not orbit (the row's step= census counts the armed walks)
        let sealCutTargets = 0 // (v0.277.0) the cut target split - the near THICK seals the ledge cut owns
        let sealNearThin = 0 // (v0.277.0) the near THIN seals - the dig family's own missed candidates
        let sealCutGap = 0 // (v0.281.0) the reach gap - thick near seals the cut's 1.5 fence refuses, the stance side owns them
        let stanceCuts = 0 // (v0.283.0) the cuts the step bought - the band's first field proof (the row's stepcut=)
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
          // (v0.260.0) THE ALREADY-THERE FAST PATH: the walk only issues when
          // the bot stands OUTSIDE the goal's own arrival test (GoalNear.isEnd -
          // the pathfinder's own verdict). A vein's drops sit in each other's
          // goal spheres - one landed walk parks the bot inside the NEXT
          // targets' isEnd, and those walks completed instantly with ZERO
          // displacement: two of them opened the v0.227.0 spin breaker's 30s
          // hold on the whole 'sweep drops' label (face 36344554956 named x16
          // breaker refusals vs x22 honest timeouts - a rich vein booked as
          // churn, the remaining cluster refused while the drops despawned).
          // The skip is honest work - no funnel slot, no think window, no A*
          // plan, no spin book entry - and the walks that DO issue now start
          // outside their arrival test, so a landed walk displaces (the
          // evidence the breaker's discriminator wants). Junk isEnd or a junk
          // position never skips a walk - the legacy issue byte for byte.
          const goal = new goals.GoalNear(d.x, d.y, d.z, range)
          if (dropWalkSkipped((p) => goal.isEnd(p), bot.entity.position)) {
            landed = true
            skipWalks++
          } else {
            // (v0.418.0) THE WALKED CAPTURE: the fail line's third field. The
            // walk layer's own verdict never says WHERE the budget burned -
            // the decide loop and the physically blocked walk die with the
            // SAME message ('timeout after Nms'), and the budget-edge
            // invariant (every timeout at exactly the budget) proves the
            // class is systemic, so the cure must READ the anatomy first.
            // The displacement can split it: walked ~0 = the bot never moved
            // (the stuck class - an unstandable goal's decide loop or a
            // starved physics tick), walked >= 1 = the bot moved but never
            // arrived (the route class - a path exists, geometry blocks it
            // mid-way). Measured HERE at the call site (the dy instrument's
            // own v0.187.0 pattern, zero funnel wiring); a junk position
            // leaves the tail two-field - the legacy shape byte for byte.
            let posBefore = null
            try {
              const p = bot.entity && bot.entity.position
              if (p && typeof p.clone === 'function') posBefore = p.clone()
            } catch { /* the tail stays two-field */ }
            try {
              // (v0.431.0) THE GOAL ADMISSION - the standability gate every
              // other funnel caller gets from standGoalNear and this lane
              // never had: the goal above is the DROP's own position (the
              // item entity's coords - no standing cell was ever consulted),
              // so a drop sealed under the gallery floor or hovering over a
              // shaft aims the A* at an isEnd ball with NO arrival node -
              // the proven burn the budget-edge invariant kept measuring
              // (every timeout at exactly the budget: 12/12 face 26, 40/40
              // run68, 6/6 face 27). The gate enumerates the goal's own ball
              // and refuses BEFORE the goto when no cell in it can hold the
              // bot (a swim cell or a stand cell - the standGoalNear shape).
              // The throw rides THIS catch, so the fail line, the dy
              // instrument, the walked tail, the family counters and the
              // above-family support dig keep their semantics - only the why
              // is new ('admission' in the dropwalk census, additive).
              // Junk reads, unloaded chunks and throwing readers never refuse
              // a walk - the legacy issue byte for byte.
              const admit = dropGoalAdmission({
                x: goal.x,
                y: goal.y,
                z: goal.z,
                range,
                blockAt: (v) => bot.blockAt(new Vec3(v.x, v.y, v.z))
              })
              if (!admit.walk) throw new Error(admit.why)
              await gotoSafe(bot, goal, { timeoutMs: SWEEP_DROP_TIMEOUT_MS, label: 'sweep drops' })
              landed = true
            } catch (e) {
              // the walked instrument: displacement over the try, honest '' on
              // any junk (the v0.157.0 optional-chain law - never invent)
              let walkedTail = ''
              try {
                const pAfter = bot.entity && bot.entity.position
                if (posBefore && pAfter && typeof posBefore.distanceTo === 'function') {
                  const w = posBefore.distanceTo(pAfter)
                  if (Number.isFinite(w)) walkedTail = `, walked ${w.toFixed(1)}`
                }
              } catch { /* the tail stays two-field */ }
              // (v0.187.0) the DY INSTRUMENT: the failed line names its dy family -
              // the v0.178.0 below-plane cure's residue names only x6 of the run's
              // x28 timeouts (fleet 36181152847); the rest are plane-range walks
              // whose failure family is UNMEASURED (water holes? above-plane
              // ledges? sealed cells?). The next decode splits the class by the
              // (dy, range) pair it rides and the next cure derives from
              // measurement, not speculation (the v0.178.0 above-plane stance).
              if (dropFails < 2) log(`${tag} vein sweep: the drop walk to [${Math.round(d.x)},${Math.round(d.y)},${Math.round(d.z)}] failed - ${e.message} (dy ${dyWalk.toFixed(1)}, range ${range}${walkedTail})`)
              dropFails++
              // (v0.431.0) the admission's own count - the refusal fired
              // before the goto, so the walk never had a chance to move
              if (e && e.message === DROP_ADMISSION_WHY) admitRefusals++
              // (v0.205.0) THE LEDGER TRIAGE - the wide-2 family splits by the
              // walk's own dy sign. run68 (fleet 36221189568, the row's day 2)
              // exposed the pollution: DROP_GOAL_ABOVE and DROP_GOAL_BELOW are
              // the SAME NUMBER (both the wide range 2), so this gate counted
              // the ABOVE-family timeouts into the below bucket - the row
              // claimed 'below x82' while its own dy instrument's printed
              // sample read ABOVE-heavy (dy +1..+3 timeouts x19 vs below x5).
              // Negative dy = the below family, positive = the above family; no
              // range-2 walk can sit between -0.5 and 0 (the PLANE fence's
              // land), so the sign is the family here.
              if (range === DROP_GOAL_BELOW) {
                if (dyWalk < DROP_GOAL_BELOW_DY) belowFails++
                else aboveFails++
              }
              // (v0.294.0) THE ABOVE HEIGHT SPLIT - the above family's own
              // height bands ride the same failure site: a timeout the ~1.5
              // pickup magnet should have covered ON ARRIVAL (dy <= 1.5) is
              // the PATH class (the ledge floor never converges), a taller
              // one the walk-then-shake class. The lib's band read nulls the
              // below/plane families and a junk dy (a missing read never
              // splits a family it cannot name) - the belowFails++ branch
              // above never reaches here with a split verdict.
              const aboveBand = aboveBandOf(dyWalk)
              if (aboveBand === 'one') above1Fails++
              else if (aboveBand === 'high') aboveHighFails++
              // (v0.263.0) THE SUPPORT DIG-DOWN: the ABOVE-family failure's last
              // mile - the lip dig-down mirrored up. The face 36359454749 ledger
              // read 'failed=94 (below x28, plane x30, above x36) lipDig=0': the
              // above walk that times out buys ZERO and the drop rides the despawn
              // on its ledge, while the lip dig can never fire (it arms only on a
              // CONVERGED below arrival - the below family failed x28). THE SHAKE:
              // dig the ONE solid block the DROP rests on - the drop falls 1-2 down
              // its own column, passes the bot's plane, the ~1.5 magnet sweeps it
              // mid-fall or it lands at the stance where the plane/below families
              // converge on the next pass (the v0.182.0 re-classify doctrine) -
              // either way strictly better than the ledge despawn. The family gate
              // reads the CURRENT stance (the walk failed - the bot digs from where
              // it stands, not from where it started); dy >= 1 pins the support at
              // the feet level or ABOVE, so the dig never opens the bot's own
              // footing. Junk discipline: an unreadable, non-solid or fluid support
              // leaves the probes null -> the gate refuses (a missing read never
              // arms an action), and the refusal line names the support class.
              if (dyWalk > DROP_GOAL_ABOVE_DY) {
                const dyNow = d.y - bot.entity.position.y
                const distXZ = Math.hypot(d.x - bot.entity.position.x, d.z - bot.entity.position.z)
                const supportCell = new Vec3(Math.floor(d.x), Math.floor(d.y) - 1, Math.floor(d.z))
                const support = bot.blockAt(supportCell)
                const supportSolid = !!(support && support.boundingBox === 'block' && !SHAFT_FLUID_NAMES.has(support.name))
                const airSupport = supportSolid ? dropAheadBelow(supportCell, { depth: 3 }) : null
                const strikeSupport = supportSolid ? fluidStrikeBelow(supportCell, { depth: 3 }) : null
                const digParams = { dy: dyNow, supportSolid, airBelow: airSupport, fluidBelow: strikeSupport !== null, distXZ }
                if (supportDigWanted(digParams)) {
                  try { await bot.fastDig(support); supportDigs++ } catch { /* the shake is a bonus - never a failure */ }
                } else {
                  const why = !support ? 'no support read'
                    : support.boundingBox !== 'block' ? 'the support reads air'
                    : SHAFT_FLUID_NAMES.has(support.name) ? 'the support reads fluid'
                    : supportDigRefusal(digParams)
                  if (why) {
                    supportRefusals++
                    // (v0.267.0) THE SEAL DEPTH READ: the sealed pocket is the
                    // world's dominant refusal shape (face 36369215771: ALL 30
                    // refusals read air=0) - measure HOW deep the seal runs
                    // before any deep-shake variant can be fenced. The probe
                    // fires ONLY on the sealed class (three reads, capped); a
                    // measured depth rides the line AND the ledger histogram
                    // (seal1/seal2/seal3 - the uncapped aggregate); junk reads
                    // 'seal ?' - a lost read claims no depth.
                    let sealTail = ''
                    if (why === 'sealed under the ledge') {
                      const verdicts = []
                      for (let sd = 1; sd <= 3; sd++) {
                        const sb = bot.blockAt(new Vec3(supportCell.x, supportCell.y - sd, supportCell.z))
                        verdicts.push(!sb ? null
                          : sb.boundingBox === 'block' && !SHAFT_FLUID_NAMES.has(sb.name) ? 'solid'
                          : sb.boundingBox === 'empty' && !SHAFT_FLUID_NAMES.has(sb.name) ? 'air' : 'fluid')
                      }
                      const sealN = sealedColumnDepth(verdicts)
                      if (sealN === 1) seal1++
                      else if (sealN === 2) seal2++
                      else if (sealN === 3) seal3++
                      // (v0.273.0) the reach split: the refusal names the seal BEFORE
                      // the stand-off, so the probe counts candidates outside the dig's
                      // reach too (the field's own row: 'air 0, dist 3.0, seal 3'). A NEAR
                      // seal is the ledge-cut's candidate; a FAR one needs a stance
                      // change first - the brief must not mistake one for the other.
                      // (v0.277.0) the cut target split: the near bucket divides by
                      // depth - thick (>=2) is the cut's target, thin (1) is the dig
                      // family's own missed candidate (a junk depth claims neither).
                      const cutClass = sealCutClass(distXZ, sealN)
                      if (cutClass === 'cut') sealCutTargets++
                      else if (cutClass === 'gap') sealCutGap++ // (v0.281.0) the cut's own fence refuses - the band keeps its name
                      else if (cutClass === 'thin') sealNearThin++
                      if (sealReachBucket(distXZ) === 'near') sealNear++
                      else if (sealReachBucket(distXZ) === 'far') sealFar++
                      // (v0.275.0) THE LEDGE CUT: the near bucket's first behavior
                      // cure - dig the seal column's top dy-1 cells + the support,
                      // the drop lands ON THE BOT'S LAYER (the magnet owns it). The
                      // fence (src/lib/drops.mjs): the seal floor S-dy reads solid
                      // (sealDepth >= dy - an unmeasured landing never cuts), the
                      // column stays dry, the stance stays INSIDE the lip-dig's
                      // measured magnet radius (1.5 < the v0.263.0 stand-off). A
                      // null is an honest refusal - the telemetry above keeps the
                      // class visible either way; a contested dig falls back to
                      // the refusal ledger, never a failure.
                      const cut = ledgeCutWanted({ dy: dyNow, distXZ, sealDepth: sealN, fluidBelow: strikeSupport !== null })
                      if (cut !== null) {
                        try {
                          for (let cd = 1; cd <= cut; cd++) {
                            const cb = bot.blockAt(new Vec3(supportCell.x, supportCell.y - cd, supportCell.z))
                            if (!cb || cb.type === 0) break // a lost mid-read stops the column honestly
                            await bot.fastDig(cb)
                          }
                          await bot.fastDig(support) // the shake: the drop falls the cut column to my layer
                          cutDigs++
                          log(`${tag} vein sweep: ledge cut - dug ${cut} seal cell(s) + the support, the drop falls to my layer (seal ${sealN}, dy ${dyNow})`)
                        } catch { /* a contested dig falls back to the refusal ledger - never a failure */ }
                      } else {
                        const cutRefusal = ledgeCutRefusal({ dy: dyNow, distXZ, sealDepth: sealN, fluidBelow: strikeSupport !== null })
                        if (cutRefusals <= 2) {
                          cutRefusals++
                          // (v0.280.0) THE CUT REFUSAL LINE - the refusal form the
                          // face 36402553113 decode needed (nthick=3 + cut=0 + ZERO
                          // cut lines: the fences refused in silence between the two
                          // counters). ONE named refusal per candidate, capped like
                          // the support refusals - the sweep must not storm; the
                          // line rides the 'vein sweep' band (the existing key).
                          log(`${tag} vein sweep: ledge cut refused - ${cutRefusal} (seal ${sealN ?? '?'}, dy ${dyNow}, dist ${distXZ.toFixed(1)})`)
                        }
                        // (v0.283.0) THE STANCE STEP - the gap band's first behavior
                        // cure. The step fires ONLY on the stand-off class (the other
                        // fences are things no walk can cure), ONE per sweep (the cap
                        // law), and only when ONE block closes the band (the probe's
                        // near bucket caps 2.0 - a longer walk is the far front's own
                        // business). The walk targets the fall column at GoalNear
                        // range 1 (< the magnet 1.5); the re-read reuses the cut's
                        // own probe shape - a lost read never arms a cut.
                        if (cutRefusal === 'the stand-off exceeds the magnet' && stanceSteps < 1 && stanceStepBlocks(distXZ) === 1) {
                          stanceSteps++
                          log(`${tag} vein sweep: stance step armed - the stand-off exceeds the magnet (dist ${distXZ.toFixed(1)}, closing 1)`)
                          let stepFrom = null // (v0.287.0) the walk's own start - the progress read lives past the catch
                          try {
                            stepFrom = { x: bot.entity.position.x, z: bot.entity.position.z }
                            // (v0.286.0) THE STEP RE-ARM - face 36431514130 read the
                            // doomed ledger poisoning the step directly: 'the walk
                            // contested (doomed goal (ledgered 3s ago at [-142,43...'
                            // with the ledger CLUSTERED ([-113,41,427] [-114,41,428]
                            // [-115,41,427] all ledgered within 12s of each other) -
                            // another bot's failed walk from ANOTHER start dooms the
                            // support cell fleet-wide, and the step's honest attempt
                            // dies at the consult for free (the v0.87.0 yard lesson
                            // verbatim: the doomed geometry is the FAILED BOT'S
                            // START, not the cell itself). doomedRearm gives the
                            // step ONE honest bounded-A* attempt from THIS bot's
                            // start per sweep (the cap law still holds: one step
                            // per sweep, the re-arm cannot orbit); a proven-dead
                            // verdict re-records the cell with a fresh TTL for the
                            // rest of the fleet - the poisoning self-heals.
                            // (v0.288.0) THE STEP BUDGET - face 36446143946 (the
                            // progress instrument's first field read) named the
                            // anatomy: `timeout after 4000ms, walked 1.2` (F6,
                            // armed dist 2.5) - the SLOW class, the walk moves and
                            // the budget bit mid-stride at the measured ~0.3 b/s.
                            // The budget rides the measured constant (8000ms
                            // covers the far edge's ~2-block walk with margin);
                            // the cap law is unchanged - one bounded walk per
                            // sweep, the worst case stays priced.
                            // (v0.291.0) THE RAW STANCE STEP - face 36459280773
                            // named the STUCK class: 3x `timeout after 8000ms,
                            // walked 0.0` - the doubled budget bought ZERO
                            // movement. Under the fleet's CPU saturation the A*
                            // think never STARTS (the v0.48.0 yard lesson
                            // verbatim: a straight 1-2 block line needs ZERO A*).
                            // The raw hop walks FIRST - raw controls, no
                            // pathfinder, XZ success at the cell - and the
                            // bounded-A* attempt only fires when the raw walk did
                            // NOT land (the deposit caller's proven two-stage
                            // shape: the hop is best-effort, the pathfinder keeps
                            // the obstacle routing). The cap law is unchanged
                            // (one step per sweep): the worst case is priced raw
                            // 2500 + bounded 8000, not an orbit.
                            const rawLanded = await stanceStepRawWalk(bot, supportCell)
                            if (!rawLanded) {
                              await gotoSafe(bot, new goals.GoalNear(supportCell.x, bot.entity.position.y, supportCell.z, 1), { timeoutMs: STANCE_STEP_WALK_MS, label: 'stance step', doomedRearm: true })
                            }
                            const dist2 = Math.hypot(d.x - bot.entity.position.x, d.z - bot.entity.position.z)
                            const recut = ledgeCutWanted({ dy: dyNow, distXZ: dist2, sealDepth: sealN, fluidBelow: strikeSupport !== null })
                            if (recut !== null) {
                              for (let cd = 1; cd <= recut; cd++) {
                                const cb = bot.blockAt(new Vec3(supportCell.x, supportCell.y - cd, supportCell.z))
                                if (!cb || cb.type === 0) break // a lost mid-read stops the column honestly
                                await bot.fastDig(cb)
                              }
                              await bot.fastDig(support) // the shake: the drop falls the cut column to my layer
                              cutDigs++
                              stanceCuts++ // (v0.283.0) the row's stepcut= - the step bought THIS cut (the cure's own conversion census)
                              log(`${tag} vein sweep: stance step landed - dist ${dist2.toFixed(1)}, the cut took the column (dug ${recut} seal cell(s) + the support)`)
                            } else {
                              // (v0.289.0) THE LANDED-SHORT READ - face 36446143946
                              // named the class: F14's step LANDED (no contest) but
                              // the cut still refused at dist 1.6 - the SAME dist
                              // the arm measured. Two anatomies fit and the cure
                              // picks a side: the GoalNear range-1 slack landed the
                              // bot SHORT of the cell (a range 1->0 tightening
                              // cures) OR the support cell itself sits geometrically
                              // outside the magnet (only a better cell cures - a
                              // range change is a no-op there). The contested line
                              // has measured its walk since v0.287.0; the
                              // landed-refuses line was blind. The same junk-safe
                              // progress read rides THIS line's tail (the
                              // tail-append law, the byte-true prefix keeps the
                              // band pin): a near-zero walked says the bot was
                              // already AT the cell (the cell geometry is the
                              // bottleneck), a real distance says the slack ate
                              // the gain (the range cure). The landed-TOOK line
                              // stays bare - a cut that converted has nothing to
                              // explain.
                              log(`${tag} vein sweep: stance step landed - dist ${dist2.toFixed(1)}, the cut still refuses - ${ledgeCutRefusal({ dy: dyNow, distXZ: dist2, sealDepth: sealN, fluidBelow: strikeSupport !== null })}${(() => { const walked = stepWalkProgress(stepFrom, bot.entity && bot.entity.position); if (walked == null) return ''; let tail = `, walked ${walked.toFixed(1)}`; if (walked <= 0.3) { const pin = stancePinRead(bot.entity && bot.entity.position, supportCell, (x, y, z) => bot.blockAt(new Vec3(x, y, z))); if (pin) tail += `, pinned ${pin.name}@${`[${pin.x},${pin.y},${pin.z}]`}` } return tail })()}`)
                            }
                          } catch (e) {
                            // (v0.285.0) THE WALK CONTEST NAME - the contest's
                            // first decode lead. Face 36423614693 (the composed
                            // tree's first field flight) read the step's debut:
                            // step=5 stepcut=2 (the cure CONVERTS - F4 1.7->1.0
                            // and F10 2.2->1.4 both bought their cut through the
                            // step), but 3 of the 5 walks CONTESTED and the line
                            // could not say WHY - gotoSafe's refusal messages
                            // already name the family (the water-rescue gate,
                            // the spin breaker, the doomed-goal ledger, the
                            // walk governor's timeout), the line swallowed them
                            // and the step's own bottleneck stayed blind. The
                            // name rides the SAME line (the byte-true prefix
                            // keeps the band pin), the message capped at 40
                            // chars (the write-off ladder trace's own cap - a
                            // junk message cannot flood the row).
                            log(`${tag} vein sweep: stance step refused - the walk contested (${String(e?.message ?? 'no error read').slice(0, 40)}${(() => { const walked = stepWalkProgress(stepFrom, bot.entity && bot.entity.position); if (walked == null) return ''; let tail = `, walked ${walked.toFixed(1)}`; if (walked <= 0.3) { const pin = stancePinRead(bot.entity && bot.entity.position, supportCell, (x, y, z) => bot.blockAt(new Vec3(x, y, z))); if (pin) tail += `, pinned ${pin.name}@${`[${pin.x},${pin.y},${pin.z}]`}` } return tail })()})`)
                          }
                        }
                      }
                      sealTail = `, seal ${sealN ?? '?'}`
                    } else if (why === 'the ledge reads too high' && stanceSteps < 1 && highLedgeStanceWanted({ dy: dyNow, supportSolid, distXZ })) {
                      // (v0.296.0) THE HIGH-LEDGE STANCE - the too-high class's
                      // first behavior cure. Face 36493264551: the HIGH band
                      // dominates the above residue (aboveHigh 23/27,
                      // supportDig=0) and SIX 'the ledge reads too high'
                      // refusals (dist 1.5-2.4) had NO cure path at all - the
                      // sealed branch's own machinery (the seal probe, the
                      // ledge cut, the stance step) consults only inside
                      // 'sealed under the ledge', so a high ledge abandons its
                      // candidate whole. THE CURE prices the STANCE, not the
                      // climb: ONE bounded step to the fall column (the
                      // v0.291.0 two-stage walk verbatim - the raw hop first,
                      // the bounded-A* attempt only when the raw walk did not
                      // land), then the dig RE-CONSULTS from the column - the
                      // dy cap guards the MEASURED FALL, and the stance under
                      // the column is the stance that measurement needs (the
                      // rising terrain shrinks the dy into the class; a shelf
                      // over flat ground refuses again, named). The fences are
                      // the band's own (highLedgeStanceWanted): the class
                      // identity, the solid support read, the ONE-block close.
                      // The cap law holds - the step rides the SAME
                      // stanceSteps counter (one per sweep across BOTH
                      // classes); the row carries the cure inside the existing
                      // fields (step=, supportDig=), the lines name the class.
                      stanceSteps++
                      log(`${tag} vein sweep: stance step armed - the ledge reads too high (dy ${dyNow}, dist ${distXZ.toFixed(1)} - closing to the column)`)
                      let stepFrom = null // the walk's own start - the progress read lives past the catch (the v0.287.0 shape)
                      try {
                        stepFrom = { x: bot.entity.position.x, z: bot.entity.position.z }
                        const rawLanded = await stanceStepRawWalk(bot, supportCell)
                        if (!rawLanded) {
                          await gotoSafe(bot, new goals.GoalNear(supportCell.x, bot.entity.position.y, supportCell.z, 1), { timeoutMs: STANCE_STEP_WALK_MS, label: 'stance step', doomedRearm: true })
                        }
                        const dyAfter = d.y - bot.entity.position.y
                        const distAfter = Math.hypot(d.x - bot.entity.position.x, d.z - bot.entity.position.z)
                        const reParams = { dy: dyAfter, supportSolid, airBelow: airSupport, fluidBelow: strikeSupport !== null, distXZ: distAfter }
                        if (supportDigWanted(reParams)) {
                          try {
                            await bot.fastDig(support)
                            supportDigs++
                            log(`${tag} vein sweep: high ledge stance landed - the dig takes it from the column (dy ${dyAfter}, dist ${distAfter.toFixed(1)})`)
                          } catch { /* the shake is a bonus - never a failure */ }
                        } else {
                          const residual = supportDigRefusal(reParams)
                          if (residual) log(`${tag} vein sweep: high ledge stance landed - dist ${distAfter.toFixed(1)}, the dig still refuses - ${residual}${(() => { const walked = stepWalkProgress(stepFrom, bot.entity && bot.entity.position); if (walked == null) return ''; let tail = `, walked ${walked.toFixed(1)}`; if (walked <= 0.3) { const pin = stancePinRead(bot.entity && bot.entity.position, supportCell, (x, y, z) => bot.blockAt(new Vec3(x, y, z))); if (pin) tail += `, pinned ${pin.name}@${`[${pin.x},${pin.y},${pin.z}]`}` } return tail })()}`)
                        }
                      } catch (e) {
                        log(`${tag} vein sweep: stance step refused - the walk contested (${String(e?.message ?? 'no error read').slice(0, 40)}${(() => { const walked = stepWalkProgress(stepFrom, bot.entity && bot.entity.position); if (walked == null) return ''; let tail = `, walked ${walked.toFixed(1)}`; if (walked <= 0.3) { const pin = stancePinRead(bot.entity && bot.entity.position, supportCell, (x, y, z) => bot.blockAt(new Vec3(x, y, z))); if (pin) tail += `, pinned ${pin.name}@${`[${pin.x},${pin.y},${pin.z}]`}` } return tail })()})`)
                      }
                    }
                    if (supportRefusals <= 2) log(`${tag} vein sweep: support dig refused - ${why} (air ${airSupport}, dist ${distXZ.toFixed(1)}${sealTail})`)
                  }
                }
              }
            }
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
            // (v0.259.0) THE COVER ANCHOR - the probes measure the column the dig
            // would OPEN (the cover cell at feet-1 and below - dropAheadBelow's own
            // contract reads 'the cell ABOUT TO BE dug'), not the column under a
            // STANDING bot's feet. The v0.206 anatomy proved the feet anchor
            // tautological (a standing bot always reads solid at feet-1 -> air 0 ->
            // 'sealed floor' forever) and the field confirmed: run68's ledger row
            // carries below x82 with lipDig=0 - the below family (89% of the drop-walk
            // failures) starved at exactly the link the dig-down exists to close,
            // while the coal famine held (coal_ore dug, fuel never materialized).
            // The cover read moves BEFORE the gate (the probes derive from it);
            // every fence value is UNTOUCHED (LIP_DIG_MAX_AIR 2, the dry guard, the
            // dy family, the deep fence) - the anchor change only lets the honest
            // geometry reach the honest gate. Junk discipline: an unreadable,
            // non-solid or fluid cover leaves airBelow null -> lipDigWanted refuses
            // (a missing read never arms a dig), and the refusal line names the
            // cover class instead of a fake geometry.
            const coverCell = feet.offset(0, -1, 0)
            const cover = bot.blockAt(coverCell)
            const coverSolid = !!(cover && cover.boundingBox === 'block' && !SHAFT_FLUID_NAMES.has(cover.name))
            const airBelow = coverSolid ? dropAheadBelow(coverCell, { depth: 3 }) : null
            const strike = coverSolid ? fluidStrikeBelow(coverCell, { depth: 3 }) : null
            const lipParams = { range, airBelow, fluidBelow: strike !== null, dy: dyLip }
            if (lipDigWanted(lipParams)) {
              try { await bot.fastDig(cover); lipDigs++ } catch { /* the dig-down is a bonus - never a failure */ }
            } else {
              // (v0.206.0) THE LIP REFUSAL INSTRUMENT: the dig said no - name the
              // guard. The refusal rides the 'vein sweep' key, capped at 2 like the
              // fail lines; the ABSENCE of refusal lines across a whole run reads as
              // the OTHER starvation (no below-family convergences at all - the block
              // never entered). (v0.259.0) the cover states name themselves BEFORE
              // the legacy classes ('no cover read' / 'the cover reads air' / 'the
              // cover reads fluid' - the three pre-gate reads the old anchor could
              // never distinguish); a SOLID cover falls through to lipDigRefusal,
              // whose 'sealed floor' now means what it always claimed (the hole
              // under the COVER is sealed - a real geometry, no longer the
              // tautological every-arrival verdict).
              const why = !cover ? 'no cover read'
                : cover.boundingBox !== 'block' ? 'the cover reads air'
                : SHAFT_FLUID_NAMES.has(cover.name) ? 'the cover reads fluid'
                : lipDigRefusal(lipParams)
              if (why) {
                lipRefusals++
                if (lipRefusals <= 2) log(`${tag} vein sweep: lip dig refused - ${why} (air ${airBelow}, dy ${dyLip.toFixed(1)})`)
              }
            }
          }
        }
        const picked = Math.max(0, inventoryLoad(bot).units - load0)
        if (picked > 0) log(`${tag} vein sweep: +${picked}u walked from the drops (${dug} dug)`)
        else if (targets.length > 0) log(`${tag} vein sweep: the drop walks picked nothing (pocket delta 0, ${dropFails} failed walk(s))`)
        if (belowFails > 0) log(`${tag} vein sweep: ${belowFails} below-plane walk(s) still failed on the wide goal (range 2) - the drop rests deeper than the lip`)
        if (aboveFails > 0) log(`${tag} vein sweep: ${aboveFails} above-plane walk(s) timed out on the wide goal (range 2) - the ledge family (the v0.189.0 class, the triage names it)`)
        if (skipDeep > 0) log(`${tag} vein sweep: ${skipDeep} deep drop(s) skipped (dy < -2 - the lip sphere cannot reach, the walk was a guaranteed spiral)`)
        // (v0.431.0) the goal admission's per-sweep read - the unstandable
        // goals the lane never burned on (the per-fail lines carry the
        // 'admission' why; this row is the sweep-scale view)
        if (admitRefusals > 0) log(`${tag} vein sweep: ${admitRefusals} drop goal(s) refused before the goto (no standable cell in the arrival sphere - the walk was a proven burn)`)
        if (skipWalks > 0) log(`${tag} vein sweep: ${skipWalks} drop(s) already inside the goal - the zero-displacement walk spared (the instant done the spin book reads as churn)`)
        if (lipDigs > 0) log(`${tag} vein sweep: ${lipDigs} lip dig-down(s) - the range-2 arrival left the drop outside the magnet, the last mile dug`)
        if (supportDigs > 0) log(`${tag} vein sweep: ${supportDigs} support dig-down(s) - the failed ledge walk shook the drop loose, the fall carries it to the magnet`)
        // (v0.203.0) the sweep drop ledger: the counters ride stats so the fleet
        // RESULT can aggregate them - the per-sweep lines were the only read and
        // the below-plane residue had no day-scale trend (the v0.187.0 unmeasured
        // plane class splits from the below class here at last)
        try {
          const sd = stats.sweepDrops ?? (stats.sweepDrops = { sweeps: 0, picked: 0, failed: 0, below: 0, above: 0, above1: 0, aboveHigh: 0, deepSkip: 0, lipDig: 0, supportDig: 0, seal1: 0, seal2: 0, seal3: 0, sealNear: 0, sealFar: 0, ledgeCut: 0, sealCutTargets: 0, sealNearThin: 0, sealCutGap: 0, stanceStep: 0, stanceCut: 0 })
          sd.sweeps++
          sd.picked += picked
          sd.failed += dropFails
          sd.below += belowFails
          sd.above += aboveFails
          // (v0.294.0) the height bands ride the same ledger - the row
          // carries the above family's own divide at the run level
          sd.above1 += above1Fails
          sd.aboveHigh += aboveHighFails
          sd.deepSkip += skipDeep
          sd.lipDig += lipDigs
          sd.supportDig += supportDigs
          sd.seal1 += seal1
          sd.seal2 += seal2
          sd.seal3 += seal3
          sd.sealNear += sealNear
          sd.sealFar += sealFar
          sd.ledgeCut += cutDigs
          sd.sealCutTargets += sealCutTargets
          sd.sealNearThin += sealNearThin
          sd.sealCutGap += sealCutGap
          sd.stanceStep += stanceSteps
          sd.stanceCut += stanceCuts
          // (v0.431.0) the admission's run-level read stays OUT of the ledger
          // row on purpose - its shape is pinned byte for byte by the field's
          // own tests (drops/sealdepth/supportdig/dropwalk); the per-sweep
          // line above and the dropwalk census's 'admission' family carry it
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
    let unreachableBatches = 0 // (v0.352.0) the unreachable-spin guard's streak
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
      // (v0.352.0) THE UNREACHABLE-SPIN GUARD: a zero-yield batch whose probes
      // ALL answered unreachable would re-fill the SAME targets and re-probe at
      // ~30ms cadence until the phase's own deadline spoke (face 36721007616:
      // ~4700 cycles in 150s, zero progress). Three in a row mean the area is
      // genuinely fenced - name it and hand the clock back to the caller.
      const spinVerdict = unreachableBatchVerdict(queue.stats, unreachableBatches)
      if (spinVerdict === 'fenced') {
        log(`${tag} collectArea: ${UNREACHABLE_FENCE_BATCHES} unreachable batches in a row - the area is fenced (water or a wall), the caller's clock owns the rest`)
        break
      }
      unreachableBatches = spinVerdict === 'count' ? unreachableBatches + 1 : 0
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
    try { await craftTorches(bot, { log: msg => log(`${tag} ${msg}`), resupply: torchResupply }) } catch { /* keep digging */ }
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
    try { await craftTorches(bot, { log: msg => log(`${tag} ${msg}`), resupply: torchResupply }) } catch { /* keep digging */ }
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
      // (v0.640.0) THE ALREADY-OUT ZERO: the last secs-less ok return books its
      // honest clock - the climb never started, so the climb's cost is 0s (the
      // 'stopped' gate's own precedent below). MEASURED (fleet 37230426426, the
      // v0.637.0 face): 4 final climbs (F3/F8/F17/F19) printed the literal
      // 'undefineds' - 'OK +0 levels (0 steps, 0 dug, undefineds)' - the
      // emitter's optional-chained secs reading the absent key; the v0.625.0
      // law priced the walkable-surface pair, this return slipped it. The
      // `start` clock lives below the plan gate (TDZ), and an already-out
      // climb spent zero climb time - the constant 0 is the honest book.
      return { ok: true, reason: `already out (${plan.source})`, gained: 0, dug: 0, steps: 0, secs: 0 }
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
    // (v0.319.0) THE WET-COLUMN DOOM MEMO: a column a previous climb's
    // wet-wall yield condemned is not re-judged - the refusal is instant
    // and borrows the SAME 'wet wall' reason every retry gate already
    // handles. MEASURED (fleet 36606754498): F15's final-bank ladder
    // re-probed the y=57 water its own pre-position climb had condemned
    // seconds earlier - 4 more wet rotations for the identical verdict
    // (F18 y=45 the same shape twice). force keeps its v0.21.0 meaning
    // (the exhausted-LEDGER escape hatch); a memoed water column is not
    // ledger state - refusing it under force is the honest fast path, the
    // walk and relocation lanes own the movement from here.
    const memoVerdict = wetColumnMemoBlocked(bot._wetColumnMemo, { x: feet0.x, z: feet0.z, y: feet0.y })
    if (memoVerdict.blocked) {
      log(`${tag} climb wet memo: column ${feet0.x},${feet0.z} already yielded (${memoVerdict.record.wet} wet rotations at y=${memoVerdict.record.y}) - refusing without the grind`)
      return { ok: false, reason: 'wet wall', gained: 0, dug: 0, steps: 0, traversed: 0, memoRefusal: true }
    }
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
    let wetAscendDigs = 0 // (v0.300.0) ceiling digs this climb - the wet column's vertical answer
    let wetRotLevel = 0 // (v0.312.0) wet-blocked rotations at the current level, reset on every rise
    let dryRotLevel = 0 // (v0.312.0) dry-blocked rotations at the current level - one dry wall keeps the ladder working
    let stillThereRearmFails = 0 // (v0.309.0) re-arms the flooded window could not carry, first 2 logged
    let traversed = 0 // (v0.17.0) horizontal escape blocks walked
    let diagLevels = 0 // climb diag: log the first 3 failed levels per climb, not all 30
    let staleRecovered = 0 // (v0.76.0) stale-read recoveries this climb, first 3 logged
    let stillThereRearms = 0 // (v0.309.0) still-there re-arms this climb, first 3 landed / 2 failed logged
    let wellPounces = 0 // (v0.311.0) well pounces this climb, first 2 landed / 2 failed logged
    let pounceFails = 0 // (v0.313.0) the pounce's OWN evidence budget - the diagLevels cap must never starve it again
    let pounceProbes = 0 // (v0.313.0) one decline-naming probe per climb - the field mystery needs the guard's voice
    let bridgePlaced = 0 // (v0.165.0) bridge fills this climb, bounded by BRIDGE_PLACE_MAX
    let bridgeDonors = 0 // (v0.621.0) pit donor digs this climb, bounded by PIT_DONOR_MAX
    let bridgePlantClears = 0 // (v0.627.0) plant clears this climb, bounded by PLANT_CLEAR_MAX
    let bridgeStepDigs = 0 // (v0.667.0) step digs this climb (the scalar fallback bound)
    const bridgeStepDigCleared = new Set() // (v0.667.0) the step-dig's per-cell one-attempt marks
    // (v0.633.0) the per-cell attempt marks ('x,y,z' keys): the set GOVERNS
    // the plant clear - one attempt per cell per climb, no scalar ceiling
    // above it (each clear serves exactly one priced fill, BRIDGE_PLACE_MAX
    // bounds the fills), and an attempted cell never re-rides - the loop
    // guard the success-only scalar could not give (a failing dig never
    // incremented anything). F9's pit fill at [-101,64,378] rode 'refused
    // twice' on fleet 37216259817 while the climb's two scalar clears were
    // spent on OTHER cells - this set gives the unattempted cell its shot.
    // The scalar stays as the no-set callers' cap and the executor's count.
    const bridgePlantCleared = new Set()
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
    // (v0.618.0) THE UNDERFOOT GATE's physics reads - the executor owns the
    // bot, the library owns the verdict (grounded:false -> the waitGround
    // shape). bridgeWaitGround polls bounded: a 1-3 block fall lands within
    // ~0.7s, so 12 ticks cover it; a bot still afloat past the bound (the wet
    // face) skips honestly to the rotate ladder.
    const bridgeGrounded = () => { try { return bot.entity?.onGround === true } catch { return false } }
    const bridgeWaitGround = async () => {
      for (let i = 0; i < 12; i++) {
        if (bridgeGrounded()) return true
        await settleTicks(1, 'climb bridge ground wait')
      }
      return bridgeGrounded()
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
          // (v0.379.0) THE WET-SENTINEL WATCH: the watch rides the pure gate -
          // the in-domain floor arm byte-identical, the sentinel arm new. F16
          // (36799188224) drowned inside a running escape on a -1 bar: the
          // sentinel disarmed the in-domain check, the sentry's climb gate froze
          // the wet clock ('rescue never', 'wet 0s@last'), the lungs burned
          // unwatched. An out-of-domain bar at a WITNESSED wet head is not air -
          // the escape yields 'wet-sentinel', the sentry re-owns, its headWetMs
          // clock pages the rescue within HEAD_SUBMERGED_RESCUE_MS. A DRY burst
          // (the v0.64.0 post-respawn class) keeps riding: no witness, no yield.
          const wTop = climbO2Watch({ oxygen: bot.oxygenLevel, headWet: (() => { try { return isWaterName(waterRead().head) } catch { return false } })() })
          if (wTop.yield) {
            return { walked, resumed: false, reason: wTop.reason, o2: wTop.o2 }
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
            // (v0.379.0) the same gate between digs - a sentinel burst over a
            // witnessed flood ends the dig blind window exactly as the loop top
            const wMid = climbO2Watch({ oxygen: bot.oxygenLevel, headWet: (() => { try { return isWaterName(waterRead().head) } catch { return false } })() })
            if (wMid.yield) {
              return { walked, resumed: false, reason: wMid.reason, o2: wMid.o2 }
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
            // (v0.309.0) THE STILL-THERE RE-ARM: the stale recheck just said
            // 'the server never broke it' (postLanded === false). If the dig
            // ran the DRY window, the eye/feet wet read may have mispriced
            // the server's own dig price (the F1 class: a relogged client's
            // air-pocket read took 200t while the server's wet x5 + airborne
            // x5 stack needed ~562t) - the spam could never cover the price.
            // ONE re-arm at the flooded window (800t) gives the server its
            // honest budget; a wet-window dig that still reads STILL THERE
            // is a genuine verdict and re-arms nowhere (the v0.42.0
            // wet-escape route stays the wet failure's owner).
            const rearmTicks = climbRearmTicks({ digWindow, postLanded: false, rearmTicks: CLIMB_REARM_TICKS })
            if (rearmTicks > 0) {
              let rearmLanded = false
              try { rearmLanded = await bot.fastDig(cellB, { maxTicks: rearmTicks }) } catch { rearmLanded = false }
              if (rearmLanded) {
                dug++; stats.mined++; stats.byName[cellB.name] = (stats.byName[cellB.name] || 0) + 1
                if (stillThereRearms++ < 3) log(`${tag} climb dig: still-there re-arm landed at [${cellPos.x},${cellPos.y},${cellPos.z}] (${cellB.name}) - the dry window mispriced the server's own dig price, the flooded window carried it`)
                continue
              }
              if (++stillThereRearmFails <= 2) log(`${tag} climb dig: still-there re-arm failed at [${cellPos.x},${cellPos.y},${cellPos.z}] (${cellB.name}) - the flooded window could not price the refusal either, the server verdict stands`)
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
            // (v0.379.0) THE WET-SENTINEL HANDOFF: the escape yielded on an
            // unreadable bar over a witnessed flood - the same honest end as
            // 'low-o2' (no retry: climbRetryPlan's default refuses unknown
            // reasons), the finally has cleared _climbEscape, and the sentry
            // re-owns the bot with its wet clock RUNNING (the climb gate no
            // longer freezes it) - the headWetMs ladder pages the rescue.
            if (esc.reason === 'wet-sentinel') {
              log(`${tag} climb wet escape: oxygen unreadable (reset sentinel) at a wet head - the escape flies blind, the rescue lane owns the air`)
              return { ok: false, reason: 'wet-sentinel', gained: 0, dug, steps, traversed }
            }
            if (esc.resumed) continue // fresh position - let the main loop re-judge
          }
          // (v0.300.0) THE WET-CEILING ASCEND: the escape ladders ran and the
          // pass still stands wet-blocked (the gate spent, or the gallery
          // walked into the NEXT water column, or a sealed pocket refused) -
          // the rescue lane's v0.125.0 deep-pocket shape, ported: dig the
          // ceiling (feet+2) and rise into the fresh cell. Face 36517770723's
          // anatomy: every sampled climb diag read 'blocked toward X (dug=0,
          // wet) water (stop)' at EVERY bearing - the staircase climbed INTO
          // the flooded band and the rotate ladder burned its fails standing
          // in the same column. One vertical dig re-judges the whole column;
          // the per-climb budget (WET_CEILING_DIG_BUDGET) bounds the digs so
          // a pathological ceiling stack still ends the climb honestly. A
          // failed/absent/undiggable read falls through to the surface
          // handoff and the rotate ladder byte for byte.
          const ascGate = wetCeilingAscendGate({ ascendDigs: wetAscendDigs })
          if (ascGate.dig) {
            const acell = ceilingCell(bot.entity?.position)
            const aceil = acell
              ? (() => { try { return bot.blockAt(new Vec3(acell.x, acell.y, acell.z)) } catch { return null } })()
              : null
            // (v0.846.0) THE WASTE CURE: the deep-pocket lane's own guard,
            // ported (the v0.343.0 lid-scan precedent's `isWaterName(ceil.name)
            // !== true`): a WATER ceiling is refused before the dig. The lens
            // priced the class on four faces (the v0.845.0 row's own book: 14
            // of 15 climbwet digs rode water across faces 112/113/114/115) -
            // the server cannot break water, the dig resolves into nothing,
            // the bot sinks back and the budget tick burns (the wasted dig's
            // own shape). The refuse falls through to the surface handoff and
            // the rotate ladder byte for byte (a refused dig owns a failed
            // dig's honest shape); the budget increments only past the guard -
            // a refused water ceiling consumes no room (the budget bounds REAL
            // digs). No refuse line: the deep-pocket precedent's own law (the
            // refuse whys never dig, so they never log) - the v0.845.0 row's
            // calm verdict (0 water) is the cure's own success signature.
            if (aceil && aceil.diggable === true && isWaterName(aceil.name) !== true) {
              wetAscendDigs++
              try {
                await withTimeout(bot.dig(aceil), 6000, 'wet ceiling ascend dig')
                log(`${tag} climb wet ascend: dug the ceiling ${aceil.name} at [${acell.x},${acell.y},${acell.z}] (the water column owns every bearing - the vertical digs instead, ${wetAscendDigs}/${WET_CEILING_DIG_BUDGET})`)
                bot.setControlState('jump', true) // rise into the fresh column
                await settleTicks(10, 'wet ceiling ascend rise')
                bot.setControlState('jump', false)
                continue // the pass is spent on the dig - the main loop re-judges fresh
              } catch { /* the dig lost the race: the rotate ladder owns it */ }
            }
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
          // (v0.610.0) THE ALTITUDE-DEMAND GUARD: a caller-demanded altitude
          // (the yard's level on the ascent legs) that still stands above a
          // bot that rose NOTHING makes the surface verdict a fake landing -
          // fleet 37188370162's F1: funded at 15 levels up, '+0 (dug 0,
          // 0 steps)' 0.4ms later, the pit floor IS open sky. Plain climbs
          // (targetY null) and any climb that rose keep the verdict byte for
          // byte; a short one keeps digging toward the demand (or fails
          // honestly on its own budgets).
          if (isWalkableSurface({ skyLit: skyLitBlocked, probes: probesBlocked }) && !climbSurfaceShort({ targetY, feetY: feetBlocked.y, gained: feetBlocked.y - feet0.y })) {
            const gainedNow = feetBlocked.y - feet0.y
            stats.climbs = (stats.climbs ?? 0) + 1
            bot._climbLedger = climbLedgerUpdate(bot._climbLedger, { ok: true, gained: gainedNow, feetY: feetBlocked.y, now: Date.now() })
            log(`${tag} climb: walkable surface at y=${feetBlocked.y} (+${gainedNow} levels, dug=${dug}) - the walk takes over (blocked step)`)
            // (v0.625.0) THE HONEST SECS - the OK verdict carries the climb's own
            // clock: the emitter prints `${r.secs?.toFixed(0)}s` and a secs-less
            // return interpolated the literal 'undefineds' (fleet 37212035127's
            // F16 face: 'OK +11 levels (14 steps, 27 dug, undefineds)') - the
            // climb counted, its price never joined the lens's secs pricing
            // (climbout.mjs reads secs null and keeps it out of the sum). The
            // start clock is this function's own (line ~5104); the main return
            // below has priced itself this way since v0.21.0.
            return { ok: true, reason: 'walkable surface', gained: gainedNow, dug, steps, traversed, secs: (Date.now() - start) / 1000 }
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
          // (v0.618.0) THE UNDERFOOT GATE: the self fill's target sits DIRECTLY
          // BELOW the feet - a falling bot's AABB dips into the target cell by
          // packet time and the server keeps the block for entity collision
          // (fleet 37200930827: self 9 of 22 (41%) vs support 30 of 40 (75%) -
          // the gap is the fall). The ungrounded bot gets the waitGround
          // verdict, lands (bounded poll), and the plan re-reads from the
          // LANDED feet - the landed ownFloor often reads solid (the hole
          // self-solves) or the fill rides the grounded standing transport.
          let bp = bridgePlan({ feet, d, read: readCell, items: inventoryItems(bot), placed: bridgePlaced, grounded: bridgeGrounded(), donors: bridgeDonors, plantClears: bridgePlantClears, plantClearCells: bridgePlantCleared })
          if (!bp.ok && bp.waitGround) {
            const grounded = await bridgeWaitGround()
            const feetNow = (() => { try { return bot.entity?.position ? bot.entity.position.floored() : feet } catch { return feet } })()
            bp = bridgePlan({ feet: feetNow, d, read: readCell, items: inventoryItems(bot), placed: bridgePlaced, grounded, donors: bridgeDonors, plantClears: bridgePlantClears, plantClearCells: bridgePlantCleared, replan: true, stepDigs: bridgeStepDigs, stepDigCells: bridgeStepDigCleared })
            if (diagLevels < 3 && (bp.ok || !bp.waitGround)) log(`${tag} climb bridge: the self fill waited ${grounded ? 'and grounded' : 'and stayed afloat'} - the re-plan ${bp.ok ? `reads the ${bp.kind} fill` : `refuses (${bp.why})`}`)
          }
          if (bp.ok) {
            if (bp.kind === 'plant-clear') {
              // (v0.627.0) THE PLANT CLEAR's executor half: the confession
              // priced the plant front at 7 of 26 refusals (27%) - the
              // groundcover rides no collision (the plan reads the cell
              // clear) but the SERVER keeps the cell for its plant and the
              // placement dies into it twice. Dig the confessed plant
              // bare-hand (zero hardness - no tool, no drop guarantee),
              // settle for the block update, and let the loop re-judge into
              // the fill that was priced. A failed dig logs the honest
              // refusal and falls to the ladder; the cap (PLANT_CLEAR_MAX)
              // lives plan-side.
              let dugOk = false
              try { bridgePlantCleared.add(`${bp.cell.x},${bp.cell.y},${bp.cell.z}`) } catch { }
              try {
                const plantB = readCell(bp.cell)
                if (plantB && plantB.name && PLANT_CLEAR_FAMILY.includes(plantB.name)) {
                  dugOk = await bot.fastDig(plantB, { maxTicks: digWindow })
                }
              } catch { dugOk = false }
              if (dugOk) {
                bridgePlantClears++
                await settleTicks(2, 'climb bridge plant clear settle')
                if (diagLevels < 3) log(`${tag} climb bridge: the ${bp.fillKind} fill's cell holds a ${bp.plantName} at [${bp.cell.x},${bp.cell.y},${bp.cell.z}] - the plant clears first`)
                continue
              }
              if (diagLevels < 3) log(`${tag} climb bridge: the plant clear refused at [${bp.cell.x},${bp.cell.y},${bp.cell.z}] (${bp.plantName ?? 'unknown'}) - the ladder owns it`)
              continue
            }
            if (bp.kind === 'step-dig') {
              // (v0.667.0) THE STEP-DIG's executor half: the re-plan's landed
              // feet read step cells the staircase never scanned (the
              // v0.618.0 bounce's own shadow - fleet 37288570972's F13/F8/F12
              // rode the refusal into a burned rotate cycle each, dug=0).
              // Dig the ONE solid blocker the plan picked (the lower cell
              // leads - the staircase's own bottom-up law), settle, and let
              // the loop re-judge: the cleared cell re-plans into the fill or
              // the next dig. A failed dig logs the honest refusal and falls
              // to the ladder; the per-cell set bounds the churn (the
              // v0.633.0 law).
              let dugOk = false
              try { bridgeStepDigCleared.add(`${bp.cell.x},${bp.cell.y},${bp.cell.z}`) } catch { }
              try {
                const stepB = readCell(bp.cell)
                if (stepB && stepB.boundingBox === 'block') dugOk = await bot.fastDig(stepB, { maxTicks: digWindow })
              } catch { dugOk = false }
              if (dugOk) {
                bridgeStepDigs++
                await settleTicks(2, 'climb bridge step dig settle')
                if (diagLevels < 3) log(`${tag} climb bridge: the step cell holds a ${bp.stepName} at [${bp.cell.x},${bp.cell.y},${bp.cell.z}] - the step digs first`)
                continue
              }
              if (diagLevels < 3) log(`${tag} climb bridge: the step dig refused at [${bp.cell.x},${bp.cell.y},${bp.cell.z}] (${bp.stepName ?? 'unknown'}) - the ladder owns it`)
              continue
            }
            if (bp.kind === 'donor') {
              // (v0.621.0) THE PIT DONOR's executor half: the pocket class
              // owned 113 of 117 bridge refusals (97%) on fleet 37205134738 -
              // the climbs arrive empty-handed while the bot stands IN THE PIT
              // IT DUG. Dig ONE matrix cell beside (the plan picked it: never
              // the step bearing, dirt-family without a pick - the granite
              // lesson), let the drop auto-collect, and re-judge: the pocket
              // now holds the fill. A dig that fails falls to the ladder
              // honestly; the donor cap (PIT_DONOR_MAX) lives plan-side.
              let dugOk = false
              let donorBlockName = null
              try {
                const donorB = readCell(bp.cell)
                donorBlockName = (() => { try { return donorB && donorB.name ? donorB.name : null } catch { return null } })()
                if (donorB) dugOk = await bot.fastDig(donorB, { maxTicks: digWindow })
              } catch { dugOk = false }
              if (dugOk) {
                bridgeDonors++
                if (donorBlockName) {
                  stats.mined++
                  stats.byName[donorBlockName] = (stats.byName[donorBlockName] || 0) + 1
                }
                await settleTicks(6, 'climb bridge donor settle')
                if (diagLevels < 3) log(`${tag} climb bridge: the pocket is empty - the pit donates a ${bp.donorName} at [${bp.cell.x},${bp.cell.y},${bp.cell.z}] - the fill refunds it`)
                continue
              }
              if (diagLevels < 3) log(`${tag} climb bridge: the pit donor refused at [${bp.cell.x},${bp.cell.y},${bp.cell.z}] (${bp.donorName ?? 'unknown'}) - the ladder owns it`)
            } else if (fillCollidesEntity({ pos: bot.entity.position, cell: bp.cell })) {
              // (v0.638.0) THE SHADOW GATE defer - the entity-collision law's
              // own pre-flight. The ref-after split (fleet 37228589272)
              // decided the air-post class 7/7 for geometry/entity: every
              // reference SURVIVED the confess-time re-read, so the server's
              // refusal of a valid, in-reach placement is the vanilla rule -
              // a block may not land in a cell any entity's box intersects,
              // and the bot's own box leans into the target (the support
              // lead-in, the self dip). A real penetration defers the packet
              // (the waitGround shape: no packet, the walk/settle moves the
              // box, the loop re-plans, the ladder owns what stays); a
              // boundary kiss flies as today - the gate never costs a fill
              // that would have landed.
              if (diagLevels < 3) log(`${tag} climb bridge: the ${bp.kind} fill at [${bp.cell.x},${bp.cell.y},${bp.cell.z}] defers - the bot's own box holds the cell (the entity-collision law)`)
            } else {
              bridgePlaced = bp.placedNext
            let placedOk = false
            let lateRecovered = false
            let heldName = null
            let dist = null
            let refName = null
            let postB = null
            // (v0.622.0) the count's truth lives OUTSIDE the place try now -
            // the fresh post read (below) re-judges with it after the catch:
            // the packet's truth is the ITEM LEAVING THE INVENTORY (the
            // v0.76.0 doctrine), so the conversion check needs the same
            // before/after pair the first judge used.
            const countOf = n => inventoryItems(bot).filter(i => i.name === n).reduce((a, i) => a + i.count, 0)
            // (v0.641.0) THE INTERACTIVE REFERENCE LAW: a use-on an interactive
            // block (the fleet's own crafting tables and furnaces serving as
            // fill references) opens its UI and never places - the bot sneaks
            // for the place packet (the vanilla sneak bypasses the UI) and the
            // finally releases on EVERY path: a stuck sneak would pin the
            // climb's own edge physics. A non-interactive reference stays byte
            // for byte. The re-place below rides the same law.
            const sneakPlace = async (refN, place) => {
              if (!interactiveRefName(refN)) return place()
              let sneaked = false
              try { bot.setControlState('sneak', true); sneaked = true } catch { }
              try { return await place() } finally { if (sneaked) { try { bot.setControlState('sneak', false) } catch { } } }
            }
            let before = null
            try {
              before = countOf(bp.item.name)
              await withTimeout(bot.equip(bp.item, 'hand'), 5000, 'climb bridge equip')
              const refB = readCell(bp.refCell)
              refName = (() => { try { return refB && refB.name ? refB.name : null } catch { return null } })()
              dist = (() => { try { return bot.entity.position.distanceTo(bp.cell.offset(0.5, 0.5, 0.5)) } catch { return null } })()
              heldName = (() => { try { return bot.heldItem?.name ?? null } catch { return null } })()
              await sneakPlace(refName, () => withTimeout(bot.placeBlock(refB, new Vec3(bp.face.x, bp.face.y, bp.face.z)), PILLAR_PLACE_TIMEOUT_MS, 'climb bridge place'))
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
                    const refName2 = (() => { try { return refB2 && refB2.name ? refB2.name : null } catch { return null } })()
                    await sneakPlace(refName2, () => withTimeout(bot.placeBlock(refB2, new Vec3(bp.face.x, bp.face.y, bp.face.z)), PILLAR_PLACE_TIMEOUT_MS, 'climb bridge re-place'))
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
            // (v0.622.0) THE FRESH POST READ - the blind mass's wiring cure.
            // Three field faces (37200930827 / 37203144265 / 37205134738) read
            // the refused family 112/112 'post=? (re-read failed)' with ZERO
            // 'STILL OPEN' and ZERO 'landed late': when the place path throws
            // into the outer catch the v0.168.0 recheck ladder never runs and
            // postB dies null - the row names a blind leg instead of a
            // verdict. The named cure is FORCE THE FRESH READ (never skip it
            // - the recheck ladder stays whole): ONE settle + ONE read when
            // postB is still null, then the SAME judge re-decides - a solid
            // read or a dropped item converts the phantom refusal honestly,
            // an open read prints the REAL 'STILL OPEN' face, only a null
            // read keeps the blind form. Junk-safe end to end.
            if (!postB) {
              await settleTicks(BRIDGE_RECHECK_TICKS, 'climb bridge fresh post settle')
              try { postB = readCell(bp.cell) } catch { postB = null }
              if (bridgeFillLanded({ postBlock: postB, before, after: countOf(bp.item.name) })) {
                if (diagLevels < 3) log(`${tag} climb bridge: the ${bp.kind} fill at [${bp.cell.x},${bp.cell.y},${bp.cell.z}] landed late (the fresh read caught the update) - the step re-judges`)
                continue
              }
            }
            // (v0.636.0) THE REFERENCE RE-READ - one junk-safe read of the
            // ref cell at confess time. The air-post class owns the refusal
            // front (9 of 10 on the v0.632.0 face, 31 of 37 on the v0.634.0
            // face - every ref a named solid at d 0.5-1.5b, post=air STILL
            // OPEN twice); ref-after splits the stale reference (the client
            // placed against a ghost - the ref reads air/different after)
            // from the geometry/entity class (the ref survives) in the next
            // face. Surviving refusals only - one read per confessed fill.
            const refAfterName = (() => { try { const b = readCell(bp.refCell); return b && b.name ? b.name : null } catch { return null } })()
            if (diagLevels < 3) log(`${tag} climb bridge: the server refused the ${bp.kind} fill at [${bp.cell.x},${bp.cell.y},${bp.cell.z}] - the rotate ladder owns it (${bridgeRefusalDetail({ heldName, dist, refName, postName: (() => { try { return postB && postB.name ? postB.name : null } catch { return null } })(), postLanded: (() => { try { return postB ? postB.boundingBox === 'block' : null } catch { return null } })(), refAfterName })})`)
            }
          } else if (bp.waitGround) {
            // still afloat past the bounded wait (the wet face) - the honest
            // skip: no packet was sent, the rotate ladder owns the level
            if (diagLevels < 3) log(`${tag} climb bridge: the self fill still waits for ground - the ladder owns it`)
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
        if (blockedWet) wetRotLevel++; else dryRotLevel++
        // (v0.312.0) THE WET-WALL YIELD - after the wet machinery had its
        // chance (the gallery ladder, the ascend budget), a full bearing
        // sweep that read wet with ZERO dry walls is rotation-proof: water
        // is rotation-independent, the rotate ladder can only grind the
        // fence to its timeout (fleet 36566021862: F6 y=48 x12, F4 y=51 x12,
        // F12 y=57 x9 wet diags, each level dying 'failed - timeout' with
        // the chain's reserve unspent). Yield honestly - the v0.85.0
        // low-o2 shape, an ok=false reason every caller already handles.
        const wallYield = wetWallYield({ wetRotations: wetRotLevel, dryRotations: dryRotLevel })
        if (wallYield.yield) {
          // (v0.319.0) condemn the column: the NEXT climb that starts here
          // refuses on the memo instead of grinding the same water again.
          if (!bot._wetColumnMemo) bot._wetColumnMemo = new Map()
          wetColumnMemoCondemn(bot._wetColumnMemo, { x: feet.x, z: feet.z, y: feet.y, wetRotations: wetRotLevel, dryRotations: dryRotLevel })
          log(`${tag} climb wet-wall yield: ${wetRotLevel} wet rotations vs ${dryRotLevel} dry at y=${feet.y} - no dry bearing owns this column, the fence reserve returns to the chain`)
          return { ok: false, reason: wallYield.reason, gained: 0, dug, steps, traversed }
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
      if (rose) { steps++; fails = 0; wetRotLevel = 0; dryRotLevel = 0 } else {
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
        // (v0.610.0) THE ALTITUDE-DEMAND GUARD (the rise-failure path's
        // mirror of the blocked-step guard above): the probe proves 'not
        // stuck in a hole', never 'at the demanded yard' - a zero-gain
        // handover below the caller's targetY is skipped, the funded budgets
        // keep climbing toward the demand. targetY null and gained > 0 keep
        // the v0.23.0/v0.37.0 verdicts byte for byte.
        if (isWalkableSurface({ skyLit, probes }) && !climbSurfaceShort({ targetY, feetY: feetNow.y, gained: feetNow.y - feet0.y })) {
          const gainedNow = feetNow.y - feet0.y
          stats.climbs = (stats.climbs ?? 0) + 1
          bot._climbLedger = climbLedgerUpdate(bot._climbLedger, { ok: true, gained: gainedNow, feetY: feetNow.y, now: Date.now() })
          log(`${tag} climb: walkable surface at y=${feetNow.y} (+${gainedNow} levels, dug=${dug}) - the walk takes over`)
          // (v0.625.0) THE HONEST SECS - the rise-failure path's mirror of the
          // blocked-step fix above: the same emitter, the same 'undefineds'
          // face, the same start clock. Both walkable-surface verdicts now
          // price themselves; the lens's undefineds tolerance stays for the
          // held history (the old faces must keep parsing byte for byte).
          return { ok: true, reason: 'walkable surface', gained: gainedNow, dug, steps, traversed, secs: (Date.now() - start) / 1000 }
        }
        // (v0.311.0) THE WELL POUNCE - before the ladder spends its A* and its
        // digs, the 8/10 well signature (fleet 36566021862: support=solid
        // step=air head=air, 'did not rise' dug=1..30) gets the pathfinder's
        // own jump-edge trick by hand: back off the face press, then forward+
        // jump the long hold at the same bearing. One bounded attempt per
        // level's first fail (climb-scoped cap 2), DRY feet only - the wet
        // levels keep the longHold lane. Failure falls into the ladder below
        // unchanged - the pounce widens nothing.
        if (!rose && wellPounces < 2 && !isWetCell(readCell(feetNow))) {
          const supportB = readCell(feetNow.offset(d.x, 0, d.z))
          const stepB = readCell(feetNow.offset(d.x, 1, d.z))
          const headB = readCell(feetNow.offset(0, 2, 0))
          const pounce = climbPouncePlan({
            supportSolid: !!supportB && supportB.boundingBox === 'block',
            stepOpen: !!stepB && stepB.boundingBox === 'empty',
            headOpen: !!headB && headB.boundingBox === 'empty'
          })
          if (pounce) {
            wellPounces++
            stats.pounces = (stats.pounces ?? 0) + 1
            try {
              await bot.lookAt(feetNow.offset(d.x, 1, d.z).offset(0.5, 0.5, 0.5), true)
              bot.setControlState('forward', false)
              bot.setControlState('backward', true)
              await settleTicks(pounce.back, 'climb pounce back')
              bot.setControlState('backward', false)
              bot.setControlState('forward', true)
              bot.setControlState('jump', true)
              await settleTicks(pounce.jump, 'climb pounce jump')
              bot.setControlState('forward', false)
              bot.setControlState('jump', false)
            } catch { /* the ladder below owns it */ }
            const feetPounce = bot.entity ? bot.entity.position.floored() : feetNow
            if (feetPounce.y > feetNow.y) {
              steps++; fails = 0; wetRotLevel = 0; dryRotLevel = 0
              stats.pounceLanded = (stats.pounceLanded ?? 0) + 1
              log(`${tag} climb pounce: landed y=${feetPounce.y} (back ${pounce.back}t + jump ${pounce.jump}t toward ${d.x},${d.z}) - the well geometry broken`)
              continue
            }
            // (v0.313.0) the failed pounce logs on its OWN budget: the first
            // field face (36578367034) showed 5 well-signature diags and ZERO
            // pounce lines while the shared diagLevels cap burned on the
            // blocked path first - the evidence starvation suspicion. The
            // count speaks in the FLEET RESULT regardless.
            if (pounceFails <= 2) {
              pounceFails++
              log(`${tag} climb pounce: did not rise (back ${pounce.back}t + jump ${pounce.jump}t toward ${d.x},${d.z}) - the assist ladder owns it`)
            }
          } else if (pounceProbes++ < 1) {
            const pname = b => (b && b.name) ? b.name : 'null'
            log(`${tag} climb pounce probe: the signature declined (support=${pname(supportB)}, step=${pname(stepB)}, head=${pname(headB)}) - the well census continues`)
          }
        } else if (!rose && pounceProbes++ < 1) {
          log(`${tag} climb pounce probe: the guard declined (${wellPounces >= 2 ? 'the cap spent' : 'wet feet'}) - the ladder owns the level`)
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
            // (v0.232.0) THE CLIMB RE-ARM - the assist walks with doomedRearm:
            // the ledger's doomed verdict is a WALK's start geometry recorded
            // on the goal cell (run78's yard-poisoning class), but this goal
            // is the step cell the climb's OWN dig pass just verified clean -
            // fresh ground truth the ledger cannot have. MEASURED (fleet
            // 36284626465, the 0.231.0 field face, banked=0 with pockets
            // 3000u+ stranded underground): F14 mid-climb at y=53-54 (dug=7,
            // the staircase moving) read 'climb rise assist: assist did not
            // complete (goto: doomed goal (ledgered 5s ago at [-114,53,406])
            // - climb rise assist refused)' - a DOOMED_GOAL_RADIUS=2 verdict
            // on a cell 1-2 blocks from the bot broke the climb's momentum
            // and the bank chain died at the shaft bottom (climb out:
            // failed - stalled). The re-arm costs one bounded A* think inside
            // the assist's own timeoutMs, the doomedStats.rearms counter
            // names the frequency in the FLEET RESULT, and a genuinely dead
            // cell still fails honestly (NoPath/timeout) into the existing
            // rotate ladder - the flag widens nothing (the radius, the ttl
            // and the record rules are untouched).
            // (v0.358.0) THE ASSIST BURST CAP - the assist's step cell sits
            // 1-2 blocks out, so the v0.144.0 far-goal cap (distance-keyed)
            // never applied and the boot 32/2000 burst ran on whatever the
            // geometry held - face 13 (36740244530, exit 143) held OPEN
            // WATER: the swimmable frontier exploded, rss 425M -> 1753M in
            // one burst, the main locked 5s, the stormguard FATAL'd (the
            // run53 OOM class). The assist rides the caller-explicit burst
            // knobs (the far-cap's PROVEN 24/500 pair) - radius 24 is an
            // order of magnitude past any legal 1-2 block jump plan, so the
            // cap only kills the pathological flood-fill, and the swap
            // restores in gotoSafe's finally (the deposit.mjs law).
            await gotoSafe(bot, new goals.GoalBlock(recovery.stepTop.x, recovery.stepTop.y, recovery.stepTop.z), { timeoutMs: recovery.timeoutMs, label: 'climb rise assist', doomedRearm: true, burstRadius: ASSIST_BURST_SEARCH_RADIUS, burstThinkMs: ASSIST_BURST_THINK_TIMEOUT_MS })
            assistMoved = true
          } catch (e) { assistNote = `goto: ${e.message}` }
        }
        const feetAfter = bot.entity ? bot.entity.position.floored() : null
        if (rose || (feetAfter && feetAfter.y > feetNow.y)) { steps++; fails = 0; wetRotLevel = 0; dryRotLevel = 0; continue }
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
                if (feetGal.y > feetNow.y) { steps++; fails = 0; wetRotLevel = 0; dryRotLevel = 0; continue }
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
          // (v0.261.0) THE MAP-TARGET WALK LAW: this walk priced a 256-block
          // license with a 24s budget - the exact class woodplan.mjs named
          // "mathematically impossible" when the map trips priced 128 blocks
          // with 14s (a walkable-but-slow shore was remembered in failedTrips -
          // a self-inflicted blacklist). The face 36359454749 census caught the
          // shape live: F13's famine trip climbed +4 levels in 17s and still
          // gathered ZERO (sticks 4 -> sticks 4) while the shared map held the
          // forest - the far trunk's 24s walk died, the visitedTrunks mark
          // buried the target ("never loop on the same entry"), and the bot
          // relocated blind. The walk now prices with TRIP_WALK_MS - the SAME
          // proven constant mapTrip runs (45s spans the licensed range with
          // headroom for one detour); the caller's own maxSeconds clock still
          // caps the leg, and the stall escape still exits when the pocket is
          // craftable - a far tree costs one honest walk, not the whole budget.
          try {
            await gotoSafe(bot, standGoalNear(bot, goals, known.pos.x, known.pos.y, known.pos.z, { range: 4 }), { timeoutMs: TRIP_WALK_MS, label: 'wood trip' })
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

  return { bot, ready, stats, mineBox, nukeAround, bore, tunnel, veinSweep, climbOut, harvestSite, workOnGround, collectArea, digShaft, gatherWood, mapTrip, enablePhysicsMode, landHere, sweep, scanBox, flyTo, mineBlock, standSpotFor, setMode, recordToMap, mapTargetFor, depositLoot, inventoryLoad: () => inventoryLoad(bot), map, waterTables, username, lastDeath: () => lastDeath, wetRescueEvents: () => wetRescueLog.slice() }
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
