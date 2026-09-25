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
import v8 from 'node:v8'
import { createMiner, fleetStats } from '../src/bots/miner.mjs'
import { pocketTotals, lootLedger } from '../src/lib/pocketline.mjs'
import { createScout } from '../src/bots/scout.mjs'
import { WorldMap } from '../src/fleet/worldmap.mjs'
import { attachChatSync } from '../src/fleet/chatsync.mjs'
import { ClaimBoard, attachClaimSync, attachHazardSync } from '../src/fleet/claims.mjs'
import { HazardLedger } from '../src/lib/drowning.mjs'
import { WaterTableBoard } from '../src/lib/watertable.mjs'
import { attachMemoryGuard } from '../src/fleet/memory-guard.mjs'
import { APPROACH_THRESHOLD, approachWalk, yardApproachPlan } from '../src/lib/approach.mjs'
import { KEEP as DEPOSIT_KEEP, needsBanking, bankFallback, effectiveWalkBudget, inventoryLoad, bankTripDue, needsBankingTripViable, midBankBudgetMs, finalBankBudgetMs, yardWalkBudgetMs, smeltClampSeconds, smeltChainReserve, YARD_CHEST_RADIUS, CHEST_DOOM_TTL_MS, walkRawToward } from '../src/lib/deposit.mjs'
import { finalBankDelayMs, hardKillDelayMs, endBankBudgetMs, prePositionDue, finalBankSchedule, climbRetryPlan, bankClimbRetry, CLIMB_MIN_SLICE_MS, END_BANK_BUDGET_CAP_MS } from '../src/lib/endphase.mjs'
import { mapTripTargets, oreSteerOrder, planHave, planItemsOf } from '../src/fleet/materialplan.mjs'
import { pickOreTarget, rememberSkip } from '../src/fleet/oresteer.mjs'
import { ensureTools, ensureCampFurnace, campBuildTier, CAMP_BUILD_PUT_SECS, countItem, consolidateSurplus, craftPlanksFromLogs } from '../src/bots/tools.mjs'
import { sparePickCheck, craftSparePickaxe } from '../src/lib/toolupgrade.mjs'
import { standGoalNear, gotoSafe, pathThrottleStats, gotoSafeStats, walkRetryPlan, waitForWaterRescueClear, doomedGoalStats, walkGovernorStatsFor, goalBrakeStatsFor, setFleetGoalSweeper } from '../src/lib/jobqueue.mjs'
import { PATH_PRIO_BANK } from '../src/lib/pathsemaphore.mjs'
import { PILLAR_MAX_MS, verticalDoomPlan } from '../src/lib/surface.mjs'
import { recoveryDue, recoveryCooldownMs, tripDue, TRIP_WALK_MS, famineDue } from '../src/lib/woodplan.mjs'
import { smeltInventory, smeltablesIn, smeltZeroWhy, smeltFuelKeep, smeltInputKeep, sweepFinishedSmelts } from '../src/lib/smelting.mjs'
import { withdrawFuelCommons, newCommonsMemory, deliverFuelTithe, fuelPocketOverage } from '../src/lib/fuelbank.mjs'
import { upgradeCheck, upgradeTools, keepForIron, PICK_TIERS, withdrawIronCommune, seedIronPool } from '../src/lib/toolupgrade.mjs'
import { swordCheck, craftSword } from '../src/lib/arms.mjs'
import { walkForbidden, surfaceHoldVerdict } from '../src/lib/nightsafety.mjs'
import { reconnectDelayMs } from '../src/lib/backoff.mjs'
import { snapshotStats, seedStats } from '../src/lib/statcarry.mjs'
import { createServerGuard, isSocketLossLine, isTimeoutKickLine, probeServerPort, PROBE_INTERVAL_MS } from '../src/lib/serverguard.mjs'
import { resurrectPlan, RESURRECT_FLOOR_MS } from '../src/lib/resurrect.mjs'
import { startHeartbeat, stopHeartbeat, gapNote } from '../src/lib/heartbeat.mjs'
import { startFleetValveTicker, allocValveStatsFor, setFleetHazardNear, setFleetValveStormCell, setFunnelProbeLogger, setFleetDuckSweeper, armStormDuck, stormDuckArmLine } from '../src/lib/jobqueue.mjs' // (v0.104.0) the ticker feeds the SINGLETON it consults + the aquifer board; (v0.121.0) the funnel probe wiring; (v0.143.0) the storm duck wiring
import { createPulseSab, createLoopPulse } from '../src/lib/looppulse.mjs' // (v0.77.0) the freeze oscilloscope
import { STORM_CELL_MAGIC, stormCellApply } from '../src/lib/allocvalve.mjs' // (v0.104.0) the storm cell init; (v0.141.0) the lag-probe feeder applies the worker verdict
import { createSharedBlackBox, noteGlobal } from '../src/lib/blackbox.mjs' // (v0.62.0) the freeze black box
import { unfreezeTarget, unfreezeLine } from '../src/lib/unfreeze.mjs' // (v0.65.0) the zombie-goto kill
import { execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import pathfinderPkg from 'mineflayer-pathfinder'
import { Vec3 } from 'vec3'

const { goals } = pathfinderPkg

const COUNT = Number(process.argv[2] || 19)
const SECONDS = Number(process.argv[3] || 300)
const TARGETS = (process.argv[4] || 'sand,gravel,oak_log,birch_log,spruce_log').split(',')
const SCOUT = process.argv.includes('--scout') || process.env.SCOUT === '1'
const SYNC = process.env.FLEET_SYNC === '1' // cross-process chat sync (PVB1)
// Smelting pipeline (v0.7.0): before banking, a bot turns its raw loot (sand, ores,
// raw food) into finished materials (glass, ingots, cooked food) in the yard's
// furnace bay - the base plan needs GLASS and INGOTS, not sand and ore.
const SMELT = process.env.FLEET_SMELT !== '0'
const SMELT_BUDGET = Number(process.env.FLEET_SMELT_BUDGET || 90) // seconds per smelting visit
// (v0.27.0) the final-bank chain's wall clock (see endphase.mjs): the last
// unbounded loop in the fleet. 16/17 failed final climbs left every bot
// churning doomed chest walks silently for the WHOLE hard-kill margin - the
// full report never printed. With a 150s chain budget the worst end is
// deadline + stagger 120s + 150s = 270s < the 420s margin, so the process
// finishes naturally and printFinalReport always runs.
const END_BANK_BUDGET = endBankBudgetMs({ env: process.env.FLEET_END_BUDGET_MS })
// (v0.28.0) the MID-RUN bank chain gets its own (tighter) clock. MEASURED
// (dispatch 35547800726, 600s on 0871cb2): 17/19 final chains completed and
// reported, path=0a/0q (the v0.27.0 livelock is dead) - but the job still
// burned to the HARD KILL: F14's needsBanking branch fired just before the
// deadline, its 94s climb crossed t-0, and the UNBUDGETED mid-run
// smeltThenBank then ground through water-rescue-refused chest hops until
// the kill. A mid-run bank that cannot finish in 120s was not worth the
// mining time anyway - needsBanking stays true and the next iteration
// retries on a quieter queue.
const MID_BANK_BUDGET = endBankBudgetMs({ env: process.env.FLEET_BANK_BUDGET_MS, def: 120000 })
// (v0.14.2) the old all-at-once BATCH launch is gone: logins spread over
// JOIN_SPREAD_MS so the server's network thread never faces a 19-login burst

// The shared resource map: scouts fill it, miners read it. Persisted so a restarted
// fleet does not start from zero knowledge (data/worldmap.json is gitignored).
// (v0.18.4) worldKey = the fixed seed: a map file from a DIFFERENT world must not
// leak into this one (load refuses it, save overwrites instead of merging).
// Autosave (5 min): merge-on-save means a run killed by the OOM class keeps the
// knowledge gathered up to the last interval instead of losing the whole run.
let worldSeed = null
try { worldSeed = JSON.parse(fs.readFileSync('config/world.json', 'utf8')).seed } catch { /* merge-always legacy mode */ }
const map = new WorldMap({ file: 'data/worldmap.json', worldKey: worldSeed == null ? null : String(worldSeed) })
map.startAutosave({ everyMs: 300000, log: m => console.log(`[worldmap] ${m}`) })
// (v0.15.0) fleet-wide trip claims: when one bot commits to a map target, the others
// score that cluster as "already taken" (soft penalty) and pick a different one - the
// measured single-beach pile-up (38x 'map trip skipped: unreachable', sand=0 @ sand=110)
// is what this stops. Shared by reference exactly like the map; TTL-bound, death-safe.
const board = new ClaimBoard()
// (v0.62.0) the shared WATER HAZARD ledger: one bot's rescue immunizes the whole
// fleet (the pre-walk veto in mapTargetFor skips wet targets BEFORE the walk -
// run60 paid 42 arrival-then-refuse walks). Shared by reference like the board;
// cross-process hearing rides the same PVB2 chat line family.
const hazardLedger = new HazardLedger()
// (v0.104.0) THE AQUIFER BOARD for the alloc valve: the closed valve's near
// exemption reads the SAME shared ledger the digs and walks vetoes read - a
// near walk into live hazard water is refused while the valve is closed
// (run93: the storm returned through the near class across the flooded
// quarry). One ledger, one truth, no copied state.
setFleetHazardNear(pos => hazardLedger.near(pos))
// (v0.84.0) the shared WATER TABLE: one bot's fluid strike (water found at
// depth by the digShaft fluid guard) ceilings every shaft in that 64x64 region
// for the WHOLE fleet - the aquifer is regional, the old memory was cellular.
// Seed-constant world -> no TTL, only the LRU region cap bounds it.
const waterTableBoard = new WaterTableBoard()
const HEADINGS = ['east', 'south', 'west', 'north']

let need = {}
try {
  need = JSON.parse(fs.readFileSync('data/base-raw.json', 'utf8')).rawResources
} catch { /* plan is optional for the report */ }

const deadline = Date.now() + SECONDS * 1000
// (v0.151.0) THE POOL-FUNDED RECHECK ledger: the v0.150.0 seed arm creates
// the h=0 seeder class by construction (a bot that rode the chest holds 0);
// when the pool reaches 3 someone must TAKE it - once per bot per run, past
// the midpoint (the seeds need time to land).
const ironCommuneRechecked = new WeakSet()
// (v0.34.0) the wall clock the hard kill fires at, minus a safety slice for the
// final report + bot quits: no end-phase chain may budget past this line.
const RUN_KILL_AT = Date.now() + hardKillDelayMs({ runSeconds: SECONDS })
const END_PHASE_SAFETY_MS = 30000
const bots = new Map() // name -> { miner, target }
const guards = new Map() // name -> memory guard (see src/fleet/memory-guard.mjs)
let spawned = 0
let reconnects = 0
let kicks = 0 // (v0.16.3) server-side kicks/ECONNRESETs, counted ONCE (the old loop double-counted every kick: once in catch, once as a retry)
let toolsOk = 0
let toolsReboot = 0 // successful tool re-bootstraps after deaths
// (v0.99.0) the fuel commons' empty-chest memory: one fleet-wide map, keyed per
// bot - a chest opened and read empty is skipped by that bot's NEXT resupply
// ask (90s TTL - the commons refills continuously, the memory must not outlive
// the world it describes)
const fuelCommonsMemory = newCommonsMemory()
let toolsRecovered = 0 // successful in-loop tool recoveries (the v0.6.9 "bare-handed forever" fix)
let toolsUpgraded = 0 // successful tool upgrades: worn replaced + tier raises (v0.8.0/v0.7.5)
let swordsCrafted = 0 // (v0.67.0) swords landed by the arms chain - the fleet stopped fist-fighting
let banked = 0 // items deposited into the yard's chests
let smelted = 0 // items smelted fleet-wide (sand->glass, ore->ingot, food->cooked)

// Bank what the bot carries, smelting on the way. (v0.17.2) ORDER MATTERS: the
// furnaces AND the chest warehouse both live at the yard (spawn) - fleet #122's
// bots smelted at their shaft entries, 100-300 blocks from any furnace, and
// smelted=0 banked=0 came from that ONE root cause. So: cheap pre-deposit (bots
// near spawn already have chests in range), then the yard walk when bankFallback
// says so, then SMELT at the workshop furnaces, then the real deposit.
// Budget-capped and failure-tolerant - a stuck furnace or an unwalkable yard
// must never cost the bot its mining loop.
async function smeltThenBank (miner, { yardGoal = null, budgetMs = null } = {}) {
  // (v0.18.5) no flat timeoutMs pinning: depositToChest scales its walk budget with
  // the real distance now (fleet #128: the flat 30s killed every far-chest walk,
  // banked=0 with 77 attempts), and waits out one rescue window on refusal.
  // (v0.92.0) THE FUEL SLICE rides the same keep list: the time reserve holds
  // the smelt leg's CLOCK, the fuel hold keeps its FUEL - coal/charcoal stay
  // in the pocket through the PRE-deposit while the bot carries smeltables
  // (run81: the pre-deposit banked the coal, the smelt leg arrived at the
  // machine with smeltables and 'no fuel' - F4/F3/F8). The FINAL deposit
  // passes withFuel=false: the smelt leg has run (or was skipped), no further
  // smelt leg exists this run, so the leftover fuel drains to the chests.
  // (v0.96.0) THE INPUT SLICE rides it too: the pre-deposit also banked the
  // smeltables THEMSELVES (cobblestone/sand are not in the deposit KEEP list)
  // and the reserved leg arrived 'nothing to smelt' (run84b: F4/F8/F11/F13
  // held 45s each, 4x 'smelt: 0 (nothing to smelt)', smelted=0 fleet-wide).
  // The input hold keeps the smeltables the scan would plan; the final
  // deposit drains what the batch left.
  // carriesSmelt (defined below, TDZ-safe: keep() is first CALLED at
  // lootOpts()) is the chain-entry snapshot - the same snapshot the time
  // reserve reads.
  const keep = (withFuel = false) => [...DEPOSIT_KEEP, ...keepForIron(miner.bot), ...smeltFuelKeep({ carriesSmeltables: withFuel && carriesSmelt }), ...smeltInputKeep({ carriesSmeltables: withFuel && carriesSmelt })]
  // (v0.27.0) the chain budget: a finite budgetMs > 0 sets a deadline every
  // deposit/smelt step must fit (Infinity passes through the deposit chain
  // unchanged - junk-safe legacy behavior for the mid-run caller).
  const hasBudget = Number.isFinite(budgetMs)
  if (hasBudget && budgetMs <= 0) return { deposited: 0, reason: 'budget exhausted' }
  const deadline = hasBudget && budgetMs > 0 ? Date.now() + budgetMs : null
  const remaining = () => (deadline == null ? Infinity : deadline - Date.now())
  // (v0.87.0) THE SMELT RESERVE: a bot that carries smeltables holds a slice
  // of the chain budget for the smelt leg, and the PRE-SMELT legs (the
  // pre-deposit hops, the yard walk) budget from remaining-reserve. Run79
  // measured 5 bots with 'end-bank budget spent - smelt skipped' and
  // smelted=0 fleet-wide - the walks ate the clock and the iron_ore never
  // became an ingot (THE IRON WALL, 6 runs). The smelt leg itself reads
  // remaining() (unchanged code - the slice survives by construction) and
  // the final deposit sees the full clock again. Empty pockets: reserve 0,
  // the legacy shape byte for byte.
  const carriesSmelt = SMELT ? smeltablesIn(miner.bot, { reserveCobble: 8 }).length > 0 : false
  // (v0.183.0) THE FUEL GATE: the hold prices a smelt leg the pocket may not
  // be able to fire - no coal/charcoal means the furnace has nothing to burn.
  // The pocket's fuel count gates the reserve (only an explicit false skips;
  // a missing read keeps the legacy shape). The skip names itself once here,
  // riding the 'bank ' filter key - the next fleet sizes the class.
  const pocketFuel = countItem(miner.bot, 'coal') + countItem(miner.bot, 'charcoal')
  const { reserveMs: smeltReserveMs, why: reserveWhy } = smeltChainReserve({ budgetMs, carriesSmeltables: carriesSmelt, hasFuel: pocketFuel > 0, smeltBudgetSecs: SMELT_BUDGET })
  if (smeltReserveMs > 0) console.log(`${miner.username} bank: ${reserveWhy}`)
  else if (reserveWhy.startsWith('smelt hold skipped')) console.log(`${miner.username} bank: ${reserveWhy} (coal ${pocketFuel})`)
  const preSmeltRemaining = () => (smeltReserveMs > 0 ? Math.max(0, remaining() - smeltReserveMs) : remaining())
  const lootOpts = () => ({ keep: keep(true), budgetMs: preSmeltRemaining(), yardCenter: yardGoal, yardRadius: YARD_CHEST_RADIUS })
  // cheap pre-deposit: a chest within 64 blocks banks instantly (early-run bots
  // dig near spawn); the verdict's reason also drives the yard-walk decision
  const pre = await miner.depositLoot(lootOpts())
  if (pre.deposited === 0) {
    const yardDist = yardGoal ? miner.bot.entity.position.distanceTo(yardGoal) : null
    const decision = bankFallback({ deposited: 0, reason: pre.reason, yardDist })
    if (decision.action === 'walk') {
      // (v0.39.0) the line used to HARDCODE 'no chest in range' whatever the real
      // pre.reason was - the log could not tell a scan miss from a dead chest on
      // a walk decision. Print the honest reason.
      console.log(`${miner.username} bank: ${pre.reason || 'no chest in range'} (${decision.dist} blocks from yard) - walking back`)
      // (v0.158.0) THE VERTICAL DOOM GATE: the trip's climb already raised its
      // target to the yard's level (ensureSurface 'bank'); when the yard STILL
      // stands mostly UP from here, the walk ladder is doomed by arithmetic -
      // run556's F6 burned 25.5s of approach segments + a 43s walk timeout +
      // retries on a goal 39 levels up over 2 lateral, every zero-delta stall
      // CORRECT geometry (the straight line walks into the ceiling). The
      // honest move names the doom and keeps the slice: the smelt leg runs,
      // the pocket rides the next cadence window (or the final bank, whose
      // climb owns the vertical), and the bot keeps MINING instead of standing
      // still against stone.
      const doomAtWalk = (() => {
        try {
          return verticalDoomPlan({
            botY: miner.bot.entity?.position?.y,
            yardY: yardGoal?.y,
            lateral: miner.bot?.entity && yardGoal ? Math.hypot(miner.bot.entity.position.x - yardGoal.x, miner.bot.entity.position.z - yardGoal.z) : null
          })
        } catch { return { doom: false } }
      })()
      if (doomAtWalk.doom) {
        console.log(`${miner.username} bank: ${doomAtWalk.why} - the walk ladder cannot climb, the pocket rides the next window`)
      }
      const walkGoal = new goals.GoalNear(yardGoal.x, yardGoal.y, yardGoal.z, 24)
      let arrived = false
      // (v0.19.1) EVIDENCE HOOK: v0.19.0's retries fired 19 times, every walk
      // still died and the per-attempt errors were swallowed by the retry
      // loop - the fleet log could not say WHY the paths stopped ("Path was
      // stopped" is only the final attempt's error). Attach one-shot
      // path_reset/path_stop spies for the walk window: resetPath reasons
      // ('block_updated' = other bots' digs, 'chunk_loaded', 'goal_moved')
      // vs a raw path_stop (an explicit bot.pathfinder.stop() somewhere).
      const spy = reason => console.log(`${miner.username} bank walk path event: ${reason}`)
      const spyStop = () => spy('path_stop (explicit)')
      let walkStart = Date.now()
      let rearm = false // (v0.87.0) the doomed-goal re-arm: attempt 2/3 re-issue the yard goal with the ledger opt-in
      // (v0.124.0) THE YARD APPROACH: run107 (35915999513, NORMAL END but
      // banked=13 on 3485 mined, unaccounted 1284): the bank chains climbed out
      // (F2: +14 levels, 116s of a 162s budget) and the yard walk then died
      // 'chest unreachable (No path to the goal!) (51 blocks from yard)' -
      // 51 > searchRadius 48, a walk doomed BY CONSTRUCTION, x31 fleet-wide,
      // and each failure doom-ledgered the chest cells for 15s (1074 funnel
      // re-issues refused, 5x run106's 206) so the fuel commons and the final
      // banks starved behind them. The deposit chain has carried the approach
      // segment since v0.56.0 (the run51 F17 cure) - the yard walk never got
      // it. Before the direct ladder: when the yard stands beyond the
      // APPROACH_THRESHOLD and the pre-smelt clock affords one segment + the
      // walk floor, walk approach segments toward the yard FIRST (raw-first,
      // bounded), then re-clamp the walk slice from the new distance - the
      // ladder now routes a goal it can actually reach. Junk-safe: a failed
      // approach leaves the legacy shape byte for byte (the ladder runs from
      // wherever the approach reached).
      const yardApproach = async attempt => {
        const d0 = (() => { try { return miner.bot.entity?.position?.distanceTo?.(yardGoal) } catch { return null } })()
        const walkMsNow = effectiveWalkBudget({ distBudget: yardWalkBudgetMs({ yardDist: Number.isFinite(d0) ? d0 : decision.dist }), remainingMs: preSmeltRemaining() })
        const plan = yardApproachPlan({ yardDist: d0, remainingMs: preSmeltRemaining(), walkMs: walkMsNow })
        if (!plan.approach) {
          if (d0 != null && d0 > APPROACH_THRESHOLD) console.log(`${miner.username} yard approach: skipped (${plan.why})`)
          return { walked: false }
        }
        console.log(`${miner.username} yard approach: ${plan.why} (attempt ${attempt})`)
        try {
          const r = await approachWalk(miner.bot, yardGoal, {
            rawWalk: walkRawToward,
            segmentMs: plan.segmentMs,
            budgetMs: plan.budgetMs,
            log: m => console.log(`${miner.username} yard approach: ${m}`)
          })
          return r
        } catch (e) {
          console.log(`${miner.username} yard approach: failed (${e.message}) - the direct ladder runs from here`)
          return { walked: false }
        }
      }
      // (v0.158.0) the doom gate keeps the loop honest: a doomed vertical
      // never enters (the pocket rides; the climb owns the vertical), every
      // other shape runs the legacy ladder byte for byte.
      for (let attempt = 1; attempt <= 3 && !arrived && !doomAtWalk.doom; attempt++) {
        try {
          if (attempt > 1) console.log(`${miner.username} bank: yard walk retry ${attempt}/3${rearm ? ' (doomed re-arm - the ledger stays for every other goal)' : ''}`)
          // (v0.27.0) the walk fits INSIDE the chain budget: a retry may not
          // restart 120s the chain no longer has (the 35544781892 hang burned
          // 3x120s walks per bot while the margin had 420s for ALL 19 bots).
          // (v0.36.0) the yard walk budget SCALES with the distance: the flat
          // 120s pin could not carry a 150-300 block walk at the 500ms/block
          // rule (13x 'budget exhausted' in dispatch 35562867668 even with a
          // dist-scaled chain). effectiveWalkBudget still clamps it into the
          // chain's remaining wall clock, so the margin maths stand.
          // (v0.124.0) the approach rides BEFORE the slice is fixed: a far
          // yard (the run107 d=51 > radius 48 construction) gets its segments
          // first, then the slice re-clamps from the reached distance.
          if (attempt === 1) await yardApproach(attempt)
          else {
            const dR = (() => { try { return miner.bot.entity?.position?.distanceTo?.(yardGoal) } catch { return null } })()
            if (Number.isFinite(dR) && dR <= APPROACH_THRESHOLD) { /* inside - the ladder owns it */ }
            else await yardApproach(attempt)
          }
          const dApproach = (() => { try { return miner.bot.entity?.position?.distanceTo?.(yardGoal) } catch { return null } })()
          const walkMs = effectiveWalkBudget({ distBudget: yardWalkBudgetMs({ yardDist: Number.isFinite(dApproach) ? dApproach : decision.dist }), remainingMs: preSmeltRemaining() })
          if (walkMs <= 0) {
            console.log(`${miner.username} bank: end-bank budget spent - yard walk cancelled`)
            break
          }
          miner.bot.on('path_reset', spy)
          miner.bot.on('path_stop', spyStop)
          walkStart = Date.now()
          // (v0.113.0) the yard walk's doom rides the CHEST DOOM HALF-LIFE (15s):
          // run100's F8 proved 'No path' from d=46 and the verdict then starved
          // the NEXT chains' commons/hops/final-banks at 'ledgered 16-25s ago' -
          // the yard is a static known-good destination, the machine ttl semantics.
          await gotoSafe(miner.bot, walkGoal, { timeoutMs: walkMs, label: 'walk to yard', priority: PATH_PRIO_BANK, doomedRearm: rearm, doomTtl: CHEST_DOOM_TTL_MS })
          arrived = true
          console.log(`${miner.username} bank: yard walk arrived in ${((Date.now() - walkStart) / 1000).toFixed(0)}s (${attempt} attempt${attempt > 1 ? 's' : ''})`)
        } catch (e) {
          console.log(`${miner.username} bank: yard walk attempt ${attempt} failed: ${e.name ? `${e.name}: ` : ''}${e.message}`)
          const plan = walkRetryPlan({ error: e, attempt, maxAttempts: 3 })
          if (plan.action === 'wait-rescue') {
            const cleared = await waitForWaterRescueClear(miner.bot, { maxMs: plan.waitMs })
            console.log(`${miner.username} bank: yard walk waited out the rescue (cleared=${cleared})`)
            continue
          }
          if (plan.action === 'immediate' || plan.action === 'timeout-retry') continue
          // (v0.87.0) THE DOOMED-RETRY: the verdict is one bot's start geometry
          // recorded fleet-wide - THIS bot's start may have a perfectly fine
          // path. Re-issue once with the re-arm (the ledger stays for every
          // other goal); a second doomed verdict means the geometry is real
          // from here too and the ladder gives up honestly.
          if (plan.action === 'doomed-retry') {
            rearm = true
            continue
          }
          console.log(`${miner.username} bank: yard walk failed (${e.message}) - smelting locally if a furnace is near`)
          break
        } finally {
          miner.bot.removeListener('path_reset', spy)
          miner.bot.removeListener('path_stop', spyStop)
        }
      }
    } else if (decision.action === 'none') {
      // (v0.38.0) ALWAYS, not only when the why differs from pre.reason: the old
      // guard made the most common 'none' (why === pre.reason) INVISIBLE - the
      // F2 zero (fleet 35566494961) that never said why while a whole bank trip
      // burned. One line per failed chain, whatever the reason.
      console.log(`${miner.username} bank fallback: none (${decision.why || 'unknown'})`)
    }
  }
  if (SMELT) {
    // (v0.27.0) smelting is the chain's middle step: when the budget is already
    // gone the bot skips straight to the final deposit attempt (which the
    // budget will cut to a named reason) instead of compounding the overrun.
    // (v0.39.0) the smelt may only spend what remains AFTER the final-deposit
    // reserve: dispatch 35576122228 F9 arrived at the yard in 1s and the smelt
    // still ate the whole remainder - the final deposit entered at remaining<=0
    // and refused without a click ('bank: 0 (budget exhausted)' AT the yard,
    // 10 of 14 fallback zeros that run). smeltClampSeconds keeps the deposit
    // slice; smeltSecs <= 0 skips the leg entirely.
    const smeltSecs = smeltClampSeconds({ remainingMs: remaining(), budgetSecs: SMELT_BUDGET })
    if (smeltSecs <= 0) {
      console.log(`${miner.username} end-bank budget spent - smelt skipped`)
    } else try {
      // (v0.123.0) THE BUILD-FITS GATE - run106's F1 paid a 24s camp build out
      // of a thin end-phase leg ('F1 camp furnace: BUILT ... in 24s') and the
      // poll window died at the run deadline mid-wait ('F1 smelt: 0
      // (raw_iron@furnace: timeout)' one tick after the t-0 tally). A build
      // that cannot be followed by a REAL smelt slice is a clock fire, not a
      // cure: below 24s (the worst-case build F1 measured) + the 15s smelt
      // floor the build SKIPS honestly - the metal rides the pocket to the
      // next chain and the clock feeds the deposit legs instead. A fat leg
      // (>= 40s) builds exactly as before - byte for byte.
      // (v0.137.0) THE FIRED SMELT - run552 (35963112300, the v0.136.1 fleet)
      // starved the smelt economy with the gate itself: 7x build skips on a
      // 13-37s leg clock (the old 24s-build + 15s-floor arithmetic), 13x
      // 'machine unreachable', smelted 12 -> 3, F12's raw_iron x7 riding the
      // pocket to the bank un-smelted. But the furnace is ASYNCHRONOUS: the poll
      // is the only part that needs the bot's clock. A thin leg fires the batch
      // (verified puts, then walk away - the machine's own clock does the
      // burning) and the next chain (or ANY bot - the finished-harvest reads
      // output-with-empty-input) collects. The BUILD still needs its floor (a
      // 24s build in a 14s leg still dies mid-place), so the build gate drops
      // from 40s to 29s (build 24s + the put ~5s) and the poll floor only
      // applies to fat legs; a thin leg that cannot even BUILD still fires into
      // any machine already in reach (reach-open + put ~= 7s).
      const CAMP_BUILD_FIT_SECS = 40
      // (v0.165.0) THE TIERED BUILD FIT - the flat 29s floor priced EVERY build
      // at the full 24s ladder; run77 measured 10 skips on 1-20s legs while the
      // pockets held the materials for CHEAPER tiers (the run's own BUILT lines:
      // 8s and 13s vs the v0.123.0 full-ladder 24s). The gate now prices the
      // CHEAPEST build the pocket can actually reach (campBuildTier - the
      // read-only mirror of the executor's ladder) + the 5s put: a 15-20s leg
      // with a held furnace item (6s) or cobble + a table in reach (10s) builds
      // where the flat gate skipped, a leg too thin for its OWN tier still
      // skips honestly with the tier named, and 'none' (a machine near,
      // nothing to smelt) passes through to the executor's named verdict.
      const tier = campBuildTier(miner.bot)
      const fireLeg = smeltSecs < CAMP_BUILD_FIT_SECS
      const buildStart = Date.now()
      if (smeltSecs < tier.secs + CAMP_BUILD_PUT_SECS) {
        console.log(`${miner.username} camp furnace: build skipped - the leg clock (${smeltSecs}s) cannot afford a ${tier.secs}s ${tier.action} build + the ${CAMP_BUILD_PUT_SECS}s put (${tier.why})`)
      } else {
      // (v0.89.0) THE CAMP FURNACE: run80 (35773697160) held the reserve, carried
      // raw_iron (62 inventory dumps) - and ended smelted=0 with ZERO output lines:
      // the smelt leg ran WHERE THE BOT STOOD, nothing within 48 was a machine, the
      // yard bay unreachable behind 10 failed yard walks, and nothing in the
      // codebase ever crafted or placed a furnace ("smelting locally if a furnace
      // is near" has been a false promise since v0.19.0). Build the machine
      // camp-side first: 8 cobble + a table (4 planks) = a furnace ANYWHERE. The
      // build spends the smelt leg's own clock (the slice the v0.88.0 reserve
      // carved); smeltInventory's budget shrinks by the build time.
      try {
        const built = await ensureCampFurnace(miner.bot, { log: m => console.log(`${miner.username} camp furnace: ${m}`) })
        if (built.built) console.log(`${miner.username} camp furnace: BUILT (${built.why}) in ${((Date.now() - buildStart) / 1000).toFixed(0)}s`)
        else console.log(`${miner.username} camp furnace: no build (${built.why})`)
      } catch (e) {
        console.log(`${miner.username} camp furnace: error (kept alive): ${e.message}`)
      }
      }
      const buildSpent = (Date.now() - buildStart) / 1000
      // (v0.98.0) THE FUEL COMMONS: a fuel-empty pocket asks the yard chests
      // BEFORE the 'no fuel' verdict (run86: F5/F10/F8 stood at the machines
      // 'no fuel' while other bots' surplus coal sat banked - coal is not in
      // the deposit KEEP list, the commons exists in every real run). The
      // withdrawal is modest (cap 6 units) and budgeted inside the leg's own
      // slice; the leftover drains back at the final deposit (keep(false)).
      const res = await smeltInventory(miner.bot, {
        maxSeconds: Math.max(5, smeltSecs - buildSpent),
        fire: fireLeg,
        // (v0.147.0) THE YARD-SEEK: the empty 48b machine scan walks the
        // proven approach segments toward the yard center once - the
        // run85 F4 class (raw_copper:28 pocket, 'no machine in reach',
        // the visit ended there). A landed seek (inside the 24b direct
        // envelope of the yard) puts the machine cluster inside the scan
        // and the re-run reaches it. Bounded 20s; failure-tolerant.
        yardSeek: async () => {
          if (!yardGoal) return false
          try {
            const n = await approachWalk(miner.bot, yardGoal, { budgetMs: 20000, log: m => console.log(`${miner.username} yard seek: ${m}`) })
            return !!n.walked
          } catch { return false }
        },
        fuelResupply: ({ itemsNeeded }) => withdrawFuelCommons(miner.bot, {
          itemsNeeded,
          yardCenter: yardGoal,
          memory: fuelCommonsMemory,
          budgetMs: Math.min(30000, Math.max(8000, smeltSecs * 1000 / 3)),
          log: m => console.log(`${miner.username} ${m}`)
        }),
        log: m => console.log(m)
      })
      if (res.smelted > 0 || res.rescued > 0 || (res.fired ?? 0) > 0) {
        // (v0.140.2) THE COLLECTOR'S LEDGER: res.rescued counts too. run554
        // (35974993311, the v0.139.0 fleet) measured the gap: F11's visit
        // harvested '6 x stone from an idle furnace' (the v0.137.0 finished-
        // harvest reading output-over-empty-input as fleet property) but the
        // fleet tally printed smelted=7 while the legs' own lines summed to 7
        // WITH the rescue invisible - the harvest completed on F11's POCKET
        // and vanished from the fleet's books. The honest ledger's last leg
        // closes here: a rescued batch IS the fired batch's completion (fired
        // -> harvested -> smelted) and counts on the COLLECTOR's ledger -
        // exactly what the v0.139.0 sweep's collected already does below.
        smelted += res.smelted + (res.rescued ?? 0) // a fired batch is NOT counted until its output is harvested (the honest ledger)
        console.log(`${miner.username} smelted ${res.smelted} (${Object.entries(res.outputs).map(([k, v]) => `${k}:${v}`).join(' ')}) rescued=${res.rescued}${(res.fired ?? 0) > 0 ? ` fired=${res.fired}` : ''}`)
      } else {
        // (v0.89.0) THE HONEST ZERO: run80's smelt legs returned silent zeros
        // (24 reserves held, 6 yard arrivals, ZERO furnace walks visible) - the
        // machine failures died between smeltBatch and this log. The zero now
        // names every attempt: 'iron_ore@blast_furnace: machine unreachable (...)'.
        // (Collision #39 union: smeltZeroWhy reads BOTH entry shapes - theirs
        // {name, reason} and mine {name, machine, reason} - and the empty
        // attempts array reads 'nothing to smelt', the plan-empty case.)
        console.log(`${miner.username} smelt: 0 (${smeltZeroWhy(res.attempts)})`)
      }
      // (v0.146.0) THE IRON COMMUNE - run49 (36008932449, the v0.145.0
      // composite) smelted the fleet's first iron ingots (F18 1 + F3 2) and
      // still ended iron=0: thin veins split the output 1-2 per bot, the
      // chest pools the rest (iron is not KEEP), and no leg ever completed a
      // set. The moment is HERE: the bot stands yard-side, fresh ingots in
      // the pocket, the commune chests in reach. Withdraw (3 - pocket) from
      // a yard chest; a completed set crafts on the SPOT (the table is
      // yard-side too, and the final deposit's own reserve stays intact -
      // the commune's walk is budget-bounded, the craft only fires when the
      // set actually completed).
      try {
        const heldNow = countItem(miner.bot, 'iron_ingot')
        // (v0.151.0, the lane) THE COMPLETE-SET MOMENT: the guard drops the
        // `< 3` arm. run87 (36030165587) measured the blind spot - F8 smelted
        // 3 (iron_ingot:3) at ts~560s and the old guard skipped the block
        // (heldNow=3 is not < 3), leaving the craft to the loop cadence that
        // then starved on the stick gate (v0.151.0's stick rung cures the
        // gate; this guard cures the MOMENT): a bot standing yard-side with a
        // complete set must craft on the spot. heldNow=3 flows through
        // withdrawIronCommune's own guard ('nothing to commune',
        // pocketNow=3) and the craft fires below; heldNow=1-2 keeps the
        // v0.150.0 seed + withdraw sequence.
        // (v0.151.0 -> v0.152.0, the union) THE POOL-FUNDED RECHECK: an h=0
        // bot (the seeder class) re-checks the pool once per run, past the
        // midpoint - the seeds need time to land. The withdraw's own plan
        // math bounds the take (need = min(3 - pocket, chest)), so a short
        // pool costs one read; the funded pool pays the full set and the
        // craft fires on the spot - the pool's third fragment finally has a
        // taker. allowEmptyPocket stays FALSE for every heldNow > 0 call
        // (a seeder's own withdraw must stand down - the union-sequence pin).
        const midRun = Date.now() > deadline - (SECONDS * 1000) / 2
        const recheckDue = heldNow === 0 && !ironCommuneRechecked.has(miner.bot) && midRun
        if (heldNow > 0 || recheckDue) {
          if (recheckDue) ironCommuneRechecked.add(miner.bot)
          if (heldNow > 0) {
            // (v0.150.0) THE POOL SEED FIRST: run86 (36025029805) measured the
            // commune's 9 asks all reading 'chest holds 0 ingot(s)' - nothing
            // ever deposits iron_ingot (keepForIron pockets every fragment
            // until an iron pick exists; no bot ever had one), so the withdraw
            // asks an always-empty chest. The seed arm runs before the
            // withdraw: a pocket the pool CANNOT complete rides the chest (the
            // pool grows for the next bot's visit), a pocket the pool CAN
            // complete leaves the chest untouched for the withdraw below.
            await seedIronPool(miner.bot, {
              yardCenter: yardGoal,
              budgetMs: 12000,
              log: m => console.log(`${miner.username} iron commune: ${m}`)
            })
          }
          const comm = await withdrawIronCommune(miner.bot, {
            yardCenter: yardGoal,
            budgetMs: 15000,
            allowEmptyPocket: heldNow === 0, // (v0.151.0) only the h=0 recheck enters a funded pool - a seeder's own withdraw must stand down
            log: m => console.log(`${miner.username} iron commune: ${m}`)
          })
          if (comm.pocketNow >= 3) {
            console.log(`${miner.username} iron commune: the set is complete (${comm.pocketNow}/3) - crafting the pick on the spot`)
            const up = await upgradeTools(miner.bot, { maxSeconds: 20, log: m => console.log(`${miner.username} ${m}`) })
            if (up.ok) toolsUpgraded++
            console.log(`${miner.username} tool upgrade (commune): ${up.ok ? 'OK' : 'failed'} -> ${up.tier || 'none'} (${up.detail})`)
          }
        }
      } catch (e) {
        console.log(`${miner.username} iron commune: error (kept alive): ${e.message}`)
      }
      // (v0.139.0) THE HARVEST SWEEP - run553 (35970697452, the v0.137.0 fleet)
      // fired 30 items into machines (F5=10, F3=19, F2=1) and harvested ZERO:
      // the finished-harvest only runs inside a smelt visit that CARRIES AN
      // INPUT, and the empty-pocket legs ('nothing to smelt') never open a
      // machine at all. The sweep rides the leg's LEFTOVER slice (the 5s
      // deposit reserve stays reserved): every furnace/blast_furnace in reach
      // gets the fleet-property read - output over an EMPTY input is whoever
      // arrives' (the fired batch completes on the COLLECTOR's ledger:
      // fired -> harvested -> smelted) and the leftover fuel comes back so the
      // machine never reads busy to the fleet. A burning batch stays sacred.
      const sweepSecs = Math.min(20, smeltSecs - (Date.now() - buildStart) / 1000 - 5)
      if (sweepSecs >= 5) {
        const swept = await sweepFinishedSmelts(miner.bot, { maxSeconds: sweepSecs, maxDistance: 48, log: m => console.log(m) })
        if (swept.collected > 0) {
          smelted += swept.collected // the harvest completes the fired batch - NOW it counts
          console.log(`${miner.username} sweep: collected ${swept.collected} (${Object.entries(swept.outputs).map(([k, v]) => `${k}:${v}`).join(' ')})`)
        }
      }
    } catch (e) {
      console.log(`${miner.username} smelting failed (kept alive): ${e.message}`)
    }
  }
  // Iron reserve (toolupgrade.mjs): until the bot's OWN pickaxe is iron, ingots and
  // raw iron are TOOL MATERIALS, not bank stock. After the iron pickaxe exists the
  // surplus flows to the chests as base stock. keep is computed AFTER smelting: a
  // bot that just produced its first ingots keeps them for the iron pickaxe.
  // (v0.87.0) the final deposit budgets from the FULL remaining(): the smelt leg
  // above has run (or was skipped with its slice unspent) - the reserve is wall
  // clock again and must not starve the click sequence.
  // (v0.124.0) THE FUEL ANCHOR DELIVERY - the tithe's dedicated inflow: pocket
  // fuel over the FUEL_TITHE_BOUND rides to the fleet's ONE deterministic fuel
  // chest (pickFuelAnchor: the yard chest nearest the yard center, coordinates
  // as the tie-break) BEFORE the legacy deposit scatters it into the nearest
  // chest. Run108 measured the scatter: the tithe banked 19 coal into three
  // bots' nearest chests while the commons sweeps opened 7 chests and took 0
  // ('chest holds no fuel' x7, 8 'no fuel' verdicts starved smelt legs). The
  // anchor concentrates the inflow so the commons' first read pays. Junk-safe
  // and budget-safe: the slice is a quarter of what the chain still holds
  // (min 5s, capped 15s, skipped when the chain is nearly dead), and ANY
  // failure falls through to the EXACT legacy shape - the overage then rides
  // the legacy tithe into whatever chest the deposit opens (the scatter that
  // fed run108's sweeps is still the floor, never a regression).
  try {
    const overage = fuelPocketOverage(miner.bot)
    const anchorBudgetMs = remaining() > 8000 ? Math.min(15000, Math.floor(remaining() / 4)) : 0
    if (anchorBudgetMs >= 5000) {
      const anchorRes = await deliverFuelTithe(miner.bot, {
        yardCenter: yardGoal,
        budgetMs: anchorBudgetMs,
        log: m => console.log(`${miner.username} ${m}`)
      })
      if (anchorRes.delivered > 0) console.log(`${miner.username} fuel anchor: delivered ${anchorRes.delivered} fuel overage (${anchorRes.why})`)
      // (v0.128.0) THE NAMED EXITS: run525 proved 2 tithe deposits (17+13 coal
      // pockets) while the anchor logged ZERO lines - every non-delivery exit
      // (walk failed, open failed, unreadable block) was silent at BOTH the
      // function and the caller, so the mine could not tell skipped from
      // failed from never-tried. Every exit now names itself; 'no overage'
      // (the healthy lean pocket) stays quiet - it fires every chain.
      else if (anchorRes.why !== 'no overage') console.log(`${miner.username} fuel anchor: 0 delivered (${anchorRes.why}) - the legacy scatter carries the tithe`)
    } else if (overage > 0) {
      // (v0.157.0) THE CLOCK-LABEL FIX: remaining() returns MILLISECONDS (the
      // run556 reads 'the final leg clock (10075s)', '(12899s)', '(14837s)' on
      // a 600s run - the 02:54 lane flagged the shape, the field tripled it).
      // The clock was never miscomputed: 10075 ms is an honest 10.1s - too
      // thin for the anchor slice, the skip itself correct - but the label
      // printed raw ms with an 's' suffix and the mine read a five-digit
      // second count three times. The label now divides.
      console.log(`${miner.username} fuel anchor: skipped - the final leg clock (${(remaining() / 1000).toFixed(1)}s) cannot afford the walk while the pocket holds ${overage} over the bound`)
    }
  } catch { /* the legacy scatter is the fallback */ }
  const res = await miner.depositLoot({ keep: keep(), budgetMs: remaining(), yardCenter: yardGoal, yardRadius: YARD_CHEST_RADIUS })
  const deposited = pre.deposited + res.deposited
  if (deposited > 0) return { deposited, reason: 'ok' }
  return { deposited: 0, reason: res.reason || pre.reason }
}

const aliveCount = () => [...bots.values()].filter(e => e.miner?.bot?.entity).length

// Materials plan progress: for every resource the base needs, how much the fleet is
// holding right now (inventories) vs the required amount. This is what turns a
// "blocks/s" number into actual progress towards the build. The block->item DROP_OF
// mapping lives in src/fleet/materialplan.mjs (shared with the map-trip policy).
function materialsProgress () {
  const list = [...bots.values()].map(e => e.miner).filter(Boolean)
  const out = {}
  for (const [res, required] of Object.entries(need)) {
    if (!Number.isFinite(required) || required <= 0) continue
    // (v0.9.3) planHave counts the drop AND the one-step product (raw_iron toward
    // iron_ingot, any *_planks toward planks) - the old single-item count reported
    // have=0 for resources the fleet was actually making
    // (v0.157.0) THE RESPAWN-WINDOW GUARD: run556 (36055223458) caught the tick
    // dead live - "uncaught exception (kept alive): TypeError: Cannot read
    // properties of undefined (reading 'items') at materialsProgress" - a bot
    // mid-respawn/relogin owns a bot object whose inventory is not built yet
    // (the m.bot truthiness check races the spawn window). Each crash killed
    // the plan tick for that interval; the plan progress the build reports on
    // stayed starved (2/31 for an era). The optional chain reads the window
    // honestly: no inventory yet = 0 have from THIS bot, the tick lives.
    const have = list.reduce((a, m) => a + (m.bot?.inventory ? planHave(m.bot.inventory.items(), res) : 0), 0)
    out[res] = { required, have, item: planItemsOf(res).join('+'), pct: Math.min(100, (have / required) * 100) }
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

  // (v0.16.3) consecutive-failure streak: grows on every failed session, resets on
  // a successful login. A lone mid-run kick retries in ~2-4 s; a real ECONNRESET
  // storm backs off exponentially AND the per-bot phase spreads 19 reconnects
  // over a window instead of hitting the stalling server as one herd again.
  let failStreak = 0
  let lastWhy = '' // (v0.16.3) why the last session ended - printed on the retry line
  let yardGoal = null // (v0.16.4) first-login position = the yard (world spawn): the bank fallback target
  // (v0.18.9) per-bot stat survival: the old miner dies with its counters on every
  // reconnect, so two server-tick storms rewrote history (fleet #129: mined 854 ->
  // 620 -> 120, final report 0.26 b/s for a 3.6 b/s run). Carry = the totals so
  // far; seeded into each fresh miner, re-snapshotted when the attempt ends.
  let carry = {}
  for (let attempt = 0; attempt < 12 && Date.now() < deadline; attempt++) {
    let miner
    let claimSync = null // (v0.15.0) cross-process PVB2 claim hearing, attached after login
    let hazardSync = null // (v0.62.0) cross-process PVB2|hazard hearing, attached after login
    try {
      miner = createMiner({
        host: '127.0.0.1',
        port: 25565,
        username: name,
        mode: 'rage',
        fly: false, // flight is off: bots walk (see README)
        map, // shared scout -> miner resource map
        board, // shared trip-claim board (target distribution, v0.15.0)
        hazardLedger, // (v0.62.0) shared water-hazard ledger: one rescue vets targets for the fleet
        waterTableBoard, // (v0.84.0) shared aquifer ceiling: one strike stops every shaft above the water in the region
        noPathLedger, // (v0.62.0) shared fleet-wide 'No path' verdicts (one process = one array)
        // cross-process claims (a scout in a second terminal): broadcast our trips as
        // PVB2 chat lines; claimSync is attached right after the bot logs in
        broadcastClaim: SYNC ? pos => { try { claimSync?.broadcast(pos) } catch { /* chat never kills a trip */ } } : null,
        broadcastHazard: SYNC ? pos => { try { hazardSync?.broadcast(pos) } catch { /* chat never kills a rescue */ } } : null,
        // bot-level logs are too chatty for a fleet run, but COMBAT events are the
        // field evidence the next iteration needs (the v0.11.0 verification run
        // counted fights=2 while printing nothing - invisible, useless evidence);
        // 'climb' shows the pillar-jump shaft exits for the same reason;
        // 'water' shows the drowning rescue + the v0.16.0 air-bar glitch lines -
        // fleet #120 ended rescues=140 with zero visible water lines (the counter
        // contradicted the log, the diagnosis burned a whole session)
        // (v0.41.1) THE EVIDENCE CLASSES JOIN THE FILTER: the v0.38.0/v0.40.1/
        // v0.41.0 bank evidence ('scan: no chest within 64b', 'hop: chest at
        // [...] zero: ...', 'findChest swallowed: ...') is emitted through the
        // MINER's log - and this filter matched none of those patterns, so the
        // fleet log NEVER SAW THEM (measured: v0410 printed 17 'walking back'
        // lines - each one a proven scan miss - with ZERO 'scan:' lines; v0401's
        // hop log never landed either). Bounded by construction: 1 scan line per
        // deposit call, <= 8 hops per call, <= 2 swallows per scan.
        // (v0.52.0) the same hook feeds the SERVER-DEATH WATCHDOG: transport-
        // class errors and timeout kicks are fleet-health signals - no new
        // mineflayer event wiring, the lines already flow through here.
        log: m => {
          if (isSocketLossLine(m) || isTimeoutKickLine(m)) {
            serverGuard.recordLoss()
            if (serverGuard.suspect) startServerProbe()
            if (serverGuard.dead) onServerDeath(`transport losses fleet-wide (total ${serverGuard.totalLosses})`)
          }
          // (v0.56.0) 'hop failed' joins 'hop:' - run51 (35639593200) proved the
          // filter blind: every raw hop attempt failed on the quarried approach
          // ('raw hop failed: raw walk stalled...') and the filter's 'hop:' never
          // matched 'hop failed', so the artifact showed ONLY the pathfinder
          // results and the walk diagnostics were mined from nothing. 'approach'
          // brings the v0.56.0 segment walk's lines to the same visibility.
          // (v0.109.0) 'torch|craft|smelt|fuel' joins: run94's mine lost an hour
          // because 'craft torches' matched NOTHING (torched=0 while F11 carried
          // 12), and run108's iron-pickaxe watch needs the smelt/fuel verdicts
          // ('fuel clips the batch', 'smelt: 0 (...)' was only visible by luck).
          // Shelter lines already ride 'combat'.
          // (v0.176.0, the union of BOTH lanes' reads of fleet 36125422448)
          // 'vein sweep' joins: the v0.175.0 SWEEP DROP INSTRUMENT flew
          // filter-blind - 3 of its 4 line classes ('N drop(s) in reach',
          // '+Nu walked from the drops', 'the drop walks picked nothing')
          // matched NOTHING and never reached the artifact, while the failure
          // lines only rode the LUCK of 'water' sitting inside one refusal
          // message ('water rescue in progress (sweep drops refused)' x5, all
          // F14, all the water-rescue gate); the doomed-goal and the
          // stall-governor refusals would have stayed invisible - the same
          // shape as the v0.56.0 'hop failed' / v0.41.1 evidence-class
          // lessons, measured twice now. The instrument's own prefix is the
          // key, not the refusal message's vocabulary: every instrument line
          // opens with 'vein sweep' - one keyword covers all four shapes.
          if (/combat|died|KICKED|error|climb|water|scan:|hop|approach|swallowed|bank |deposit|torch|craft|smelt|fuel|vein sweep|wood trip/.test(m)) console.log(`${name} ${m}`)
        }
      })
      bots.set(name, { miner, target })
      seedStats(miner.stats, carry) // (v0.18.9) the reconnect must not erase what the bot already mined
      await miner.ready
      serverGuard.recordRelogin() // (v0.52.0) a fresh spawn is the server proving it lives - clears SUSPECT
      failStreak = 0 // logged in and alive: the next kick starts the streak from scratch
      if (!yardGoal) yardGoal = miner.bot.entity.position.floored() // a fresh bot logs in at world spawn - the yard

      // Bound the process memory: stale chunk columns (missed unload packets,
      // respawn dimension switches) pushed the first Big Fleet run into a 4 GB
      // heap OOM at t+210s. The guard evicts far columns + nudges the GC and its
      // stats are printed by the reporter below.
      const guard = attachMemoryGuard(miner.bot, { log: () => {} })
      guards.set(name, guard)

      // FLEET_SYNC=1: hear the OTHER processes' broadcasts (a scout in a second terminal)
      // and merge them into this process's shared map; also broadcast our own finds.
      const sync = SYNC ? attachChatSync(miner.bot, map, { flushEveryMs: 5000, maxPerFlush: 30, log: () => {} }) : null
      // (v0.15.0) same channel, claims half: other processes' PVB2 lines land on the board
      claimSync = SYNC ? attachClaimSync(miner.bot, board, { selfUsername: name, log: () => {} }) : null
      // (v0.62.0) same channel, hazards half: other processes' PVB2|hazard lines land in the ledger
      hazardSync = SYNC ? attachHazardSync(miner.bot, hazardLedger, { selfUsername: name, log: () => {} }) : null

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
      // lastBootstrap starts BEFORE the attempt: when the attempt fails, the cooldown
      // has already run during it and the first in-loop recovery fires immediately
      // instead of after another 45s of bare-handed digging.
      let lastBootstrap = Date.now()
      // the bare-handed dig list (v0.140.1: the night hold digs its starter shaft
      // with these; the dig-after-shaft names gate reuses the same list below)
      const soft = ['dirt', 'grass_block', 'sand', 'gravel', 'clay', 'snow', 'soul_sand', 'podzol', 'coarse_dirt']
      const namesFor = pick => pick
        ? [...soft, 'stone', 'andesite', 'diorite', 'tuff', 'deepslate', 'granite', 'coal_ore', 'iron_ore', 'copper_ore']
        : soft
      // (v0.52.0) the hopeless-loop brake: every CONSECUTIVE failed recovery (spare
      // craft AND full bootstrap both failed) stretches the next cooldown 45s -> 90s
      // -> 180s -> 300s. run51: F7 re-ran a doomed ~85s bootstrap every minute for
      // 350+s underground - 19 such loops is the CPU exhaustion that killed the link.
      let recoveryFailStreak = 0
      const needsTools = !miner.bot.inventory.items().some(i => i.name.includes('pickaxe'))
      if (attempt === 0 || needsTools) {
        // (v0.140.1) THE RESPAWN-BOOTSTRAP NIGHT HOLD - the empty pocket's first
        // move is a surface walk to the trees, and run554 measured where that walk
        // ends at night: F2 [-96,66,396] (respawned from its suffocate minutes
        // earlier) and F14 [-136,64,405] (its third death of the run) were both
        // shot on the respawned bot's own surface line, at the spawn/yard
        // elevation, 'ring stock 0/8' honest on an empty pocket, nothing to dig
        // a shelter from. A tool-less bot CAN still dig soft ground bare-handed
        // (the soft names list is the bare-handed dig list): dig a 6-block
        // starter shaft, wait out the walk-forbidden window inside it (arrow-safe:
        // the head sits below grade), then bootstrap at dawn like every other
        // deferred surface lane. The wait is bounded by the run deadline.
        if (attempt > 0 && surfaceHoldVerdict({ timeOfDay: miner.bot.time?.timeOfDay, purpose: 'respawn-bootstrap' }) === 'hold') {
          const holdTod = Math.floor(miner.bot.time.timeOfDay)
          console.log(`${name} respawn bootstrap deferred: night (tod=${holdTod}) - digging in until dawn (the v0.140.1 night hold)`)
          try {
            await miner.digShaft(namesFor(false), { maxBlocks: 6, shouldStop: () => Date.now() > deadline, maxMs: 45000 })
          } catch { /* the hold waits where the dig stopped */ }
          while (walkForbidden(miner.bot.time?.timeOfDay) && Date.now() < deadline) {
            await new Promise(r => setTimeout(r, 5000))
          }
          // dawn: the hold sits 6 deep - climb the starter shaft the same way
          // the final bank climbs a real one (the proven pillar-jump exit)
          try {
            await miner.climbOut({ dir: direction, force: true, maxMs: 30000, shouldStop: () => Date.now() > deadline })
          } catch { /* gatherWood's walk retries from wherever the climb stopped */ }
          console.log(`${name} respawn bootstrap resuming (tod=${Math.floor(miner.bot.time?.timeOfDay ?? -1)}) - dawn or deadline`)
        }
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

      // (the soft/namesFor lists moved above lastBootstrap - the v0.140.1 night
      // hold reads namesFor(false) inside the bootstrap block)

      // Shaft after shaft, on vanilla physics: no flight, no pathfinder stalls, and every bot
      // works its own column so 19 of them can dig at the same time.
      //
      // In-loop tool recovery: a bot whose bootstrap failed ONCE - or that died with its
      // kit on the ground - must not dig bare-handed for the rest of the run. The v0.7.0
      // fleet still ended with recovered=0: the check lived ONLY between shafts while
      // one digShaft descent runs ~90s, so the >80s-remaining guard never saw a due
      // recovery. Now the SAME predicate also stops digShaft from the inside
      // (interrupted -> continue), so a due recovery preempts the current shaft within
      // seconds. Deaths are covered too: a bot that drops its kit keeps hasPick=false.
      const hasPickNow = () => miner.bot.inventory.items().some(i => i.name.includes('pickaxe'))
      // (v0.36.0) PRE-POSITION helpers. bankableNow mirrors the end-phase's
      // bankable check; prePositionNow fires only when the run is inside the
      // window AND the pockets hold non-KEEP loot AND the bot is far enough
      // from the yard for the walk to matter (prePositionDue, endphase.mjs).
      const bankableNow = () => {
        try { return miner.bot.inventory.items().some(i => !DEPOSIT_KEEP.some(k => i.name.includes(k))) } catch { return false }
      }
      const prePositionNow = () => {
        if (!yardGoal || !miner.bot?.entity) return false
        if (!bankableNow()) return false // nothing to bank - keep digging to the last second
        try {
          return prePositionDue({
            remainingMs: deadline - Date.now(),
            yardDist: miner.bot.entity.position.distanceTo(yardGoal)
          })
        } catch { return false }
      }
      // (v0.12.0, v0.14.0) Shaft exit: digShaft strands every bot at the bottom of
      // a 1x1 hole and the pathfinder cannot climb out of what it did not dig stairs
      // into - fleet 35485296464 ended banked=0 smelted=0 sand=0 with sand=110 known
      // positions (38x 'map trip skipped: unreachable'). climbOut digs a 45-degree
      // staircase (proven fastDig + raw forward/jump movement) until the recorded
      // shaft entry level (or daylight) is reached, then surface goals path normally.
      const ensureSurface = async (reason, { chainLeftMs = 0 } = {}) => {
        const climbT0 = Date.now()
        // (v0.158.0) THE VERTICAL DOOM CLIMB: the recorded shaft entry can sit
        // tens of levels BELOW the yard (run556's F6: bot y=41, entry 44, yard
        // 80 - the climb 'OK +3 levels' was CORRECT and the walk ladder then
        // burned its whole slice on a goal 39 levels up over 2 lateral). When
        // the trip's yard is mostly UP (the strict verticalDoomPlan shape),
        // the climb raises its target to the yard's level (climbTargetY - only
        // ever raises) so the staircase digs TOWARD the bankable ground; the
        // v0.154.0 fences and the escalation ladder are untouched. 'trip' and
        // 'pre-position' keep the byte-identical legacy shape.
        let doom = { doom: false }
        if (reason === 'bank' && yardGoal && miner.bot?.entity) {
          try {
            doom = verticalDoomPlan({
              botY: miner.bot.entity.position.y,
              yardY: yardGoal.y,
              lateral: Math.hypot(miner.bot.entity.position.x - yardGoal.x, miner.bot.entity.position.z - yardGoal.z)
            })
          } catch { doom = { doom: false } }
          if (doom.doom) console.log(`${name} climb out (${reason}): ${doom.why} - the climb raises its target to the yard's level`)
        }
        let r = await miner.climbOut({ dir: direction, targetY: doom.doom ? yardGoal.y : null, shouldStop: () => Date.now() > deadline })
        if (r.ok && r.gained > 0) console.log(`${name} climb out (${reason}): OK +${r.gained} levels (${r.steps} steps, ${r.dug} dug${r.traversed ? `, ${r.traversed} traversed` : ''}, ${r.secs?.toFixed(0)}s)`)
        else if (!r.ok) console.log(`${name} climb out (${reason}): failed - ${r.reason}${r.waitSecs ? ` (wait ${r.waitSecs}s)` : ''}${r.traversed ? ` (traversed ${r.traversed})` : ''}${r.stage ? ` [stage ${r.stage}]` : ''}`)
        // (v0.154.0) THE BANK CLIMB RETRY: the mid-run bank trip's climb was
        // SINGLE-SHOT - 'climb out (bank): failed - stalled' x16 + 'timeout' x7
        // in the run108/run84a logs, F3's 3-of-4 bank trips dead at the climb in
        // run85 (~20x fleet-wide, the biggest trip killer the floor cannot
        // reach), each dead trip leaving the pockets riding to the next cadence
        // window. The escalation ladder is the built-in cure: the failed call
        // recorded stage+1 (climbLedgerUpdate), so THIS retry inherits 2x
        // budgets and a ROTATED bearing - the same mechanism the final bank's
        // retry has run since v0.50.0. The fence is the TRIP's remaining chain
        // clock (the budget the bank leg still expects), never the deadline;
        // 'rescue owns the bot'/'low-o2'/'exhausted'/'stopped' never retry (a
        // live lane owns the bot, the air owns the wet escape, the ledger
        // cooldown would refuse). Only the 'bank' caller passes a chain clock -
        // 'trip' and 'pre-position' keep the byte-identical single-shot shape.
        if (r.ok || !chainLeftMs) return r.ok
        const plan = bankClimbRetry({ chainLeftMs, spentMs: Date.now() - climbT0, reason: r.reason })
        if (!plan.retry) {
          console.log(`${name} climb out (${reason}): no retry (${plan.why})`)
          return r.ok
        }
        console.log(`${name} climb out (${reason}): retry (${plan.why})`)
        const retryFenceAt = Date.now() + plan.maxMs
        r = await miner.climbOut({ dir: direction, targetY: doom.doom ? yardGoal.y : null, force: true, maxMs: Math.min(PILLAR_MAX_MS, plan.maxMs), shouldStop: () => Date.now() > retryFenceAt })
        if (r.ok && r.gained > 0) console.log(`${name} climb out (${reason}): retry OK +${r.gained} levels (${r.steps} steps, ${r.dug} dug${r.traversed ? `, ${r.traversed} traversed` : ''}, ${r.secs?.toFixed(0)}s)`)
        else if (!r.ok) console.log(`${name} climb out (${reason}): retry failed - ${r.reason}${r.waitSecs ? ` (wait ${r.waitSecs}s)` : ''}${r.stage ? ` [stage ${r.stage}]` : ''}`)
        return r.ok
      }
      const recoveryDueNow = () => recoveryDue({ hasPick: hasPickNow(), msSinceLast: Date.now() - lastBootstrap, remainingMs: deadline - Date.now(), failStreak: recoveryFailStreak })
      // Tool upgrade chain (toolupgrade.mjs): proactive replacement of a WORN pickaxe
      // and tier raises (wooden->stone via the tools.mjs upgrade flow, stone->iron from
      // smelted ingots). A failed attempt gets a cooldown so a stuck table/craft cannot
      // burn the whole mining deadline in a retry loop.
      let lastUpgradeAttempt = 0
      const UPGRADE_RETRY_MS = 60000
      const upgradeDueNow = () => {
        if (Date.now() - lastUpgradeAttempt < UPGRADE_RETRY_MS) return null
        const c = upgradeCheck(miner.bot)
        return c.due ? c : null
      }
      let lastTrip = Date.now() // (v0.8.3) time-based map-trip cadence
      let shaft = 0
      let lastNightLog = 0 // one deferral line per night per bot, not one per loop
      let emptyShafts = 0 // (v0.10.1) consecutive digShaft calls with zero progress
      let zeroTunnels = 0 // (v0.18.1) consecutive zero-progress tunnels - the freeze budget
      let lastSpareAttempt = 0 // (v0.10.2) spare-pickaxe cooldown
      let lastSwordAttempt = 0 // (v0.67.0) sword-craft cooldown
      let lastBankAt = Date.now() // (v0.33.0) mining-trip cadence: bank EARLY while the walk back is affordable
      let lastWoodAt = 0 // (v0.179.0) stick-famine cadence: 0 = the whole run counts as elapsed (a starving pocket trips on the first daylight check)
      const veerSkipped = new Set() // (v0.18.8) ore positions this bot already steered at and did not reach
      let productiveShafts = 0 // (v0.81.0) ore-detour cadence counts PRODUCTIVE shafts (the floor lock counts empty ones)
      const STEER_ORES = ['iron_ore', 'copper_ore', 'coal_ore'] // the underground trio the tunnel names can collect
      // (v0.81.0) THE STEERED TUNNEL, once - the floor-lock block and the new ore
      // detour share one body: elect a plan-priority vein, dig a 12-block gallery
      // toward it, remember failures, back off on dead tunnels.
      const runSteeredTunnel = async reason => {
        // (v0.10.3) namesFor(TRUE) unconditionally: the tunnel's first job is
        // MOVEMENT - a pickless bot digging stone bare-handed gains no drops but
        // breaks the seal, keeps the map recording and can surface to re-tool.
        // Gating the tunnel names by hasPickNow() is what kept 0-pick bots churning
        // 'tunnel: 0 blocks' 21763 times in run 35481439229 (soft-only names vs
        // sealed stone = instant else-break). Pick-holders collect as before.
        // (v0.18.8) ORE-STEERED BRANCH MINING: aim the gallery at known ore.
        // Fleet #128 mined iron_ore=2 in 600s while the map held 84..126 iron
        // records (coal 575): the rotating direction walked PAST veins the fleet
        // already knows. The bot is already in the ore's Y band - it just has to
        // dig TOWARD the record. nearestK (no verify - a verify would erase far
        // buckets on unloaded chunks, mapTargetFor's lesson) feeds up to 4 nearest
        // positions per ore into the geometry filter; a steer that fails is
        // remembered (bounded amnesia) so the wall is never retried forever.
        // (v0.81.0) THE IRON PRIORITY: distance-only election let 660 known coal
        // records out-elect 98 iron records for the whole project (run75: 12 iron
        // steers, ONE iron_ore collected, plan 2/31, iron pickaxes=0). The plan's
        // own deficit order (oreSteerOrder) now leads the election - a known iron
        // vein within reach beats ANY nearer coal.
        const steerFrom = miner.bot.entity?.position
        let steer = null
        if (steerFrom && miner.map) {
          const oreCands = []
          for (const on of STEER_ORES) {
            try {
              for (const p of miner.map.nearestK(on, steerFrom, { maxDistance: 48, k: 4 })) oreCands.push({ name: on, pos: p })
            } catch { /* map read must never break the branch mine */ }
          }
          steer = pickOreTarget({
            candidates: oreCands,
            from: { x: steerFrom.x, y: steerFrom.y, z: steerFrom.z },
            skip: veerSkipped,
            priorities: oreSteerOrder({ progress: materialsProgress(), ores: STEER_ORES })
          })
        }
        const tdir = steer
          ? new Vec3(steer.axis === 'x' ? steer.dir : 0, 0, steer.axis === 'z' ? steer.dir : 0)
          : [new Vec3(1, 0, 0), new Vec3(0, 0, 1), new Vec3(-1, 0, 0), new Vec3(0, 0, -1)][shaft % 4]
        if (steer) console.log(`${name} tunnel: steering ${steer.name} @ ${steer.dist}b (axis ${steer.axis}${steer.dir > 0 ? '+' : '-'}${steer.dir < 0 ? steer.dir : ''}, cross ${steer.cross}, ${reason})`)
        try {
          const tres = await miner.tunnel(tdir, { maxBlocks: 12, names: namesFor(true), shouldStop: () => Date.now() > deadline })
          console.log(`${name} tunnel: ${tres.done} blocks (branch mine at the floor${steer ? ', steered' : ''}, ${reason})`)
          if (steer) rememberSkip(veerSkipped, `${steer.pos.x},${steer.pos.y},${steer.pos.z}`)
          // (v0.84.0) THE VEIN SWEEP: the gallery digs the LINE, the vein sits
          // BESIDE it (run78: 29 iron steers at cross 0.3-3.3, raw_iron ZERO -
          // the smelt/ingot/pickaxe chain starved at the first link). Eat every
          // steered ore exposed within reach before leaving the gallery.
          const veinDug = await miner.veinSweep(STEER_ORES, { shouldStop: () => Date.now() > deadline })
          if (veinDug > 0) console.log(`${name} vein sweep: ${veinDug} ores dug beside the gallery (${reason})`)
          // (v0.18.1) ZERO-PROGRESS BACKOFF - the fleet freeze, measured live
          // (run 2026-09-20 20:05): a bot sealed in wet stone made
          // (digShaft instant 0 -> tunnel instant 0 - the FLUID early-break
          // awaits nothing -> print) a ~97/s sync spin: 41,686 'tunnel: 0
          // blocks' lines in 430s, the 15s reporter starved the whole time
          // and all 8 bots froze with it (mined +19 in the last 7 minutes).
          // Three dead tunnels buy a REAL yield (setTimeout is a macrotask:
          // the event loop reaches its timers, other bots dig again).
          if ((tres.done ?? 0) > 0 || veinDug > 0) zeroTunnels = 0
          else if (++zeroTunnels >= 3) {
            zeroTunnels = 0
            console.log(`${name} tunnel: 0 blocks x3 - sealed or flooded, cooling down 15s`)
            await new Promise(r => setTimeout(r, 15000))
          }
        } catch (e) { console.log(`${name} tunnel failed: ${e.message}`) }
        // no continue: tunneling bots still need consolidation (pockets fill while
        // branch mining), recordToMap and the trip gate - the only thing that must
        // NOT run down here is the pathfinder (see the walk guard below)
      }
      while (!(Date.now() > deadline) && miner.bot.entity) {
        // (v0.36.0) PRE-POSITION: inside the last window a far bot walks home
        // on MINING time instead of digging loot it cannot deliver. MEASURED
        // (35562867668): 13x 'final bank: 0 (budget exhausted)' - the end
        // phase had to pay climb + smelt + a 100-300 block walk out of one
        // budget. Here the walk is already paid for; the bank below (or the
        // end-phase retry) starts near the yard. The chain budget is bounded
        // by the time left BEFORE the deadline - the end phase keeps its
        // whole hard-kill margin. After the attempt the bot stops digging: a
        // fresh shaft inside the last 90s mines less than the walk is worth,
        // and empty pockets let the end phase skip its chain entirely.
        if (prePositionNow()) {
          lastBankAt = Date.now()
          const distB = Math.round(miner.bot.entity.position.distanceTo(yardGoal))
          console.log(`${name} pre-position: ${distB}b from yard, t-${Math.round((deadline - Date.now()) / 1000)}s - walking home`)
          try { await consolidateSurplus(miner.bot, { log: m => console.log(`${name} ${m}`) }) } catch { /* keep going */ }
          if (await ensureSurface('pre-position')) {
            const preBudget = Math.max(0, deadline - Date.now())
            const res = await smeltThenBank(miner, { yardGoal, budgetMs: preBudget })
            if (res.deposited > 0) {
              banked += res.deposited
              console.log(`${name} pre-position bank: +${res.deposited}`)
            } else {
              console.log(`${name} pre-position bank: 0 (${res.reason})`)
            }
          }
          break // the run is over for this bot - the end phase finishes the rest
        }
        if (recoveryDueNow()) {
          lastBootstrap = Date.now()
          // (v0.16.2) CHEAP RECOVERY FIRST: the full bootstrap costs ~85 s
          // (gatherWood + ensureTools) and fails outright underground ('no planks
          // recipe' x22 in run 35478370438, F5 looped it for whole minutes in run
          // #121). A bot that lost its picks but holds cobble + sticks (or enough
          // planks) crafts a spare pickaxe in seconds - try that before the wood
          // trip, and only bootstrap when the pocket craft cannot land.
          console.log(`${name} tool recovery: no pickaxe - spare-pick craft first`)
          const sp = await craftSparePickaxe(miner.bot, { log: m => console.log(`${name} ${m}`) })
          if (sp.ok) {
            toolsRecovered++
            recoveryFailStreak = 0 // (v0.52.0) a landing craft resets the brake
            console.log(`${name} tool recovery: OK (spare craft ${sp.tier}, holds ${sp.picks})`)
          } else {
            console.log(`${name} tool recovery: spare craft failed (${sp.reason}) - re-running the bootstrap`)
            try {
              await miner.gatherWood({ want: 6, direction, shouldStop: () => Date.now() > deadline, maxSeconds: 40 })
            } catch { /* craft with whatever we have */ }
            const res = await ensureTools(miner.bot, { miner, log: () => {}, maxSeconds: 45 })
            if (res.ok) {
              toolsRecovered++
              recoveryFailStreak = 0
            } else {
              // (v0.52.0) BOTH the pocket craft and the full bootstrap failed -
              // the loop is hopeless (no wood underground, a broken table): the
              // next attempt waits 90s/180s/300s instead of burning CPU every minute
              recoveryFailStreak++
              console.log(`${name} recovery brake: ${recoveryFailStreak} consecutive failures - next attempt in ${Math.round(recoveryCooldownMs(recoveryFailStreak) / 1000)}s`)
            }
            console.log(`${name} tool recovery: ${res.ok ? 'OK' : 'failed'} (${res.kit || 'none'})`)
          }
        }
        const up = upgradeDueNow()
        if (up) {
          lastUpgradeAttempt = Date.now()
          console.log(`${name} tool upgrade due: ${up.reason} -> ${up.target}`)
          const res = await upgradeTools(miner.bot, { log: m => console.log(`${name} ${m}`) })
          if (res.ok) {
            toolsUpgraded++
            lastBootstrap = Date.now() // fresh tool: reset the recovery cooldown clock too
          }
          console.log(`${name} tool upgrade: ${res.ok ? 'OK' : 'failed'} -> ${res.tier || 'none'} (${res.detail})`)
        }
        // SPARE PICKAXE (v0.10.2): a pick that breaks underground used to cost the bot
        // an 85s bootstrap that fails without wood ('no planks recipe', 22x in run
        // 35478370438) and then idle-digged nothing. A bot holding TWO picks swaps
        // instantly instead. Cooldown keeps a stuck table/craft from burning budget.
        if (Date.now() - lastSpareAttempt > 60000) {
          const sp = sparePickCheck(miner.bot)
          if (sp.due) {
            lastSpareAttempt = Date.now()
            console.log(`${name} spare pick due: ${sp.reason}`)
            await craftSparePickaxe(miner.bot, { log: m => console.log(`${name} ${m}`) })
          }
        }
        // SWORD (v0.67.0, arms.mjs): the v0.66.0 fleet fist-fighted its way to 15
        // deaths (10 zombie bites at point-blank after doomed open-field shelters,
        // ZERO 'sword' lines in the whole log). 2 planks + 1 stick buy a wooden
        // sword - pickWeapon then equips it over every tool (rank 5) and the
        // pickMeleeWeapon shelter gate flips the armed bot to the fight it wins.
        // Cooldown mirrors the spare-pick rhythm so a stuck table cannot burn budget.
        if (Date.now() - lastSwordAttempt > 60000) {
          const sw = swordCheck(miner.bot)
          if (sw.due) {
            lastSwordAttempt = Date.now()
            console.log(`${name} sword due: ${sw.reason}`)
            const swr = await craftSword(miner.bot, { log: m => console.log(`${name} ${m}`) })
            if (swr.ok) swordsCrafted++
            if (swr.ok || swr.reason) console.log(`${name} sword: ${swr.ok ? 'OK' : 'failed'} (${swr.tier || swr.reason || 'none'})`)
          }
        }
        let interrupted = false
        const shaftRes = await miner.digShaft(namesFor(hasPickNow()), {
          // (v0.14.1) the floor moves UP from 24 to 42: the old bottom sat the fleet
          // inside the AQUIFER band - every shaft bottom was wet (fleet 114:
          // rescues=17, climb staircases refused their step cells as water, 'blocked
          // toward ...' x17, 0 climbs, banked=0). y=42 still holds the plan's
          // underground materials (iron/copper/coal/stone all spawn above the
          // deepslate band) but the dig columns stay dry: no swim physics, and the
          // staircase climb only meets stone it can dig.
          minY: 42,
          shouldStop: () => {
            if (Date.now() > deadline || !miner.bot.entity) return true
            if (recoveryDueNow()) { interrupted = true; return true }
            if (upgradeDueNow()) { interrupted = true; return true } // a worn pickaxe must not break mid-shaft
            if (prePositionNow()) { interrupted = true; return true } // (v0.36.0) the walk home preempts the shaft
            return false
          }
        })
        // FLOOR LOCK (v0.10.1, 600s fleet 35478370438): a bottomed-out bot's shaft
        // breaks instantly on minY, the "next column" walk targets sealed stone and
        // fails, and the bot froze for the rest of the run (mined frozen at 987 for
        // the last 222s - 37% of the run - with 19/19 alive). Two empty shafts in a
        // row mean we are sealed in at the floor: branch-mine sideways instead of
        // idling. The direction rotates each attempt so 19 bots spread their galleries.
        if (interrupted) continue
        const productiveShaft = (shaftRes.done ?? 0) > 0
        if (productiveShaft) {
          productiveShafts++
          emptyShafts = 0 // a productive shaft still resets the seal counter (the v0.10.1 semantics kept)
        } else emptyShafts++
        // (v0.81.0) TWO doors into the steered tunnel now:
        //  - the v0.10.1 FLOOR LOCK (two empty shafts = sealed in, branch-mine out);
        //  - THE ORE DETOUR (every 2nd PRODUCTIVE shaft): a productive shaft resets
        //    emptyShafts, so under the old shape a bot that never sealed NEVER
        //    tunneled - run75's 98 known iron veins got exactly 12 steered visits
        //    (yield: one iron_ore) because 660 coal records kept winning the
        //    distance election on the rare floor locks. The detour pays the visit
        //    the plan is starving for: the bot stands at its own shaft floor (the
        //    ore band), the gallery is 12 blocks toward the most-deficit vein, and
        //    the zeroTunnels backoff + the skip ledger keep it bounded.
        if (emptyShafts >= 2) {
          emptyShafts = 0
          await runSteeredTunnel('floor lock')
        } else if (productiveShafts % 2 === 0) {
          await runSteeredTunnel('ore detour')
        }
        if (Date.now() > deadline || !miner.bot.entity) break
        // pockets nearly full: merge fragmented planks into sticks (KEEP keeps planks,
        // so 12-type fragmentation is permanent otherwise), then smelt the raw loot
        // and bank the products in the yard's chest rows before digging on (a full
        // inventory turns every further dig into a wasted drop)
        // (v0.12.0) needsBanking fires on EITHER slots>=24 OR units>=128: the old
        // slots>=30 gate never fired because consolidation merges stacks (the 600s
        // fleet held 40-70 units in ~10-15 stacks - banked=0 forever). The banking
        // itself needs the SURFACE: climb out of the shaft first, then the chest
        // walk and the furnace bay are reachable at all.
        // (v0.33.0) MINING TRIPS: bank EARLY, while the walk back is still
        // affordable. needsBanking almost never fires at ~90 mined blocks/bot/run,
        // so pockets rode the whole 600s to the deadline and the final bank burned
        // its 150s budget on a 100-300 block walk (14x 'final bank: 0 (budget
        // exhausted)' in dispatch 35552013594). A planned TRIP fires every
        // BANK_TRIP_EVERY_MS when the pockets hold a stack of loot AND the run has
        // time to finish it (minRemainingMs gates the start); its chain budget
        // scales with the distance to the yard. lastBankAt resets on EVERY attempt
        // - a failed trip must not retry-storm every loop iteration.
        const load = (() => { try { return inventoryLoad(miner.bot) } catch { return null } })()
        const tripPlanned = !!(load && bankTripDue({
          units: load.units,
          msSinceBank: Date.now() - lastBankAt,
          remainingMs: deadline - Date.now()
        }))
        // (v0.181.0) THE DOOMED TRIP GATE: the needsBanking path fires at ANY
        // remaining clock (only the PLANNED path has minRemainingMs) - run180
        // (fleet 36148566518) measured 9 pockets-full trips at budgets
        // 120/61/45/17/13/9s, every one a doomed chain whose failed climb
        // exhausted the ledger that then refused the wood famine trips ('wood
        // trip: 0 (climb refused)' x3 - the sticks famine reopened, torched=1
        // with 104 crafted). Below NEEDS_BANKING_MIN_REMAINING_MS (150s) the
        // trip refuses: the end-phase pre-position + final bank own the
        // deadline banking, and the cadence clock still advances so the
        // refusal logs ONCE per window, never every loop iteration.
        const bankRemainingMs = deadline - Date.now()
        const bankWanted = !!(needsBanking(miner.bot) || tripPlanned)
        const bankViable = tripPlanned || needsBankingTripViable({ remainingMs: bankRemainingMs })
        if (load && bankWanted && bankViable) {
          lastBankAt = Date.now()
          // (v0.17.3) remember WHERE we work: after banking at the yard the bot
          // must return here, or it digs its next shaft next to spawn and
          // re-mines the already-hollowed yard area (emptyShafts spiral).
          const preBank = miner.bot.entity.position.clone()
          // a PLANNED trip (start-gated by minRemainingMs) may use the dist-scaled
          // budget; a needsBanking bank can fire right next to the deadline and
          // keeps the v0.28.0 120s cap that fits the hard-kill margin
          // (v0.68.0) ONE budget for BOTH paths: dist-scaled mid-run (climb +
          // deposit + there-and-back + the return home affordable), the flat
          // floor only near the deadline. MEASURED (run65, 35682159103): all 10
          // trips ran 'pockets full' on the flat 120s and 17/23 hops died
          // 'budget exhausted (walk floor)' - climb 90s + yard walk 90s+ left
          // nothing for the chest hops, and the dist-scaled planned trip never
          // fired once (needsBanking resets lastBankAt on every attempt).
          const bankBudgetMs = midBankBudgetMs({
            yardDist: yardGoal ? miner.bot.entity.position.distanceTo(yardGoal) : 0,
            remainingMs: deadline - Date.now(),
            floorMs: MID_BANK_BUDGET
          })
          console.log(`${name} bank trip: ${tripPlanned ? 'planned' : 'pockets full'} budget ${(bankBudgetMs / 1000).toFixed(0)}s`)
          try { await consolidateSurplus(miner.bot, { log: m => console.log(`${name} ${m}`) }) } catch { /* keep going */ }
          // (v0.154.0) the bank trip's climb retry fences against the trip's
          // OWN remaining chain clock: everything spent since lastBankAt
          // (consolidation included) plus the failed attempt's spend comes off
          // before the retry may arm (bankClimbRetry's 20s floor holds the
          // deposit walk's reserve).
          if (await ensureSurface('bank', { chainLeftMs: Math.max(0, bankBudgetMs - (Date.now() - lastBankAt)) })) {
            const res = await smeltThenBank(miner, { yardGoal, budgetMs: bankBudgetMs })
            if (res.deposited > 0) {
              banked += res.deposited
              console.log(`${name} bank: +${res.deposited}`)
              try {
                await gotoSafe(miner.bot, standGoalNear(miner.bot, goals, preBank.x, preBank.y, preBank.z, { range: 4 }), { timeoutMs: 90000, label: 'return to column' })
              } catch { /* dig from wherever the return walk reached */ }
            } else {
              // (v0.16.4) the reason MUST reach the log - the invisible 'no chest in
              // range' zero cost fleet #122 its whole banking chain (v0.16.1 lesson)
              console.log(`${name} bank: 0 (${res.reason})`)
            }
          }
        } else if (load && bankWanted) {
          // (v0.181.0) the gate's refusal names itself once per cadence window
          // (lastBankAt advances - the pockets-full state re-checks in 150s, not
          // every loop iteration) and the bot keeps MINING: the end-phase
          // pre-position + final bank own the deadline banking they already own.
          lastBankAt = Date.now()
          console.log(`${name} bank trip: skipped (pockets full, ${Math.max(0, Math.round(bankRemainingMs / 1000))}s left < 150s - the end-phase owns the deadline banking)`)
        }
        // (v0.179.0) THE STICK FAMINE TRIP - the wood re-supply lane for tooled bots.
        // run20 (36131508220) measured the famine class: 'no spare sticks: sticks 1
        // coals 0' x88 + 'sticks 0 coals 0' x30 (the torch cadence skipped ~118x,
        // torched=13), 'no fuel' x34 (the smelt leg starved, smelted=13), and the
        // zombie x3 deaths in DEEP dark shafts (F8 y=34, F4 y=49). recoveryDue only
        // owns PICKAXE-LESS bots - a bot holding its pickaxe but dry of wood had NO
        // wood lane for the whole run. The pocket reads stick-equivalents (sticks +
        // 2*planks + 8*logs, src/lib/woodplan.mjs): below the floor the loop climbs
        // out ONCE, gatherWood (map-targeted trunks, the proven mechanics), converts
        // logs -> planks -> sticks (ensureTools' chain), returns to the column. The
        // night hold defers the surface walk ('a deferred walk turns into more
        // shaft'); every line rides the 'wood trip' filter key (the v0.176.0 lesson).
        const woodPocket = (() => {
          try {
            const inv = miner.bot.inventory.items()
            const sum = re => inv.filter(i => re.test(i.name) && Number.isFinite(i.count)).reduce((a, i) => a + i.count, 0)
            return {
              sticks: sum(/^stick$/),
              planks: sum(/_planks$/),
              logs: sum(/_log$/),
              hasPick: inv.some(i => i.name.includes('pickaxe'))
            }
          } catch { return null }
        })()
        if (woodPocket) {
          const woodVerdict = famineDue({
            sticks: woodPocket.sticks,
            planks: woodPocket.planks,
            logs: woodPocket.logs,
            hasPick: woodPocket.hasPick,
            msSinceLast: Date.now() - lastWoodAt,
            remainingMs: deadline - Date.now(),
            timeOfDay: miner.bot.time?.timeOfDay
          })
          if (woodVerdict === 'deferred-night') {
            // one deferral line per night per bot (the lastNightLog discipline)
            if (Date.now() - lastNightLog > 60000) {
              lastNightLog = Date.now()
              console.log(`${name} wood trip: deferred night (tod=${Math.floor(miner.bot.time?.timeOfDay ?? -1)}, sticks ${woodPocket.sticks} planks ${woodPocket.planks} logs ${woodPocket.logs}) - gathering at dawn`)
            }
          } else if (woodVerdict === 'due') {
            lastWoodAt = Date.now() // resets on EVERY attempt - a failed forest must not retry-storm the loop
            console.log(`${name} wood trip: famine (sticks ${woodPocket.sticks} planks ${woodPocket.planks} logs ${woodPocket.logs}) - gathering`)
            const preWood = miner.bot.entity.position.clone()
            if (await ensureSurface('wood trip')) {
              try {
                await miner.gatherWood({ want: 8, direction, shouldStop: () => Date.now() > deadline, maxSeconds: 45 })
              } catch { /* craft with whatever the walk reached */ }
              // (v0.180.0) THE FULL CONVERSION CHAIN - run96 (36139056696) caught
              // the v0.179.0 trip HALF-BROKEN: F7 returned 'sticks 1 planks 21
              // logs 6' - ensureTools builds only the TOOL KIT, so the gathered
              // wood rode home as dead planks/logs while the torch cadence read
              // 'no spare sticks' (~160 skips, torched 13 -> 3). The bank trip
              // always ran consolidateSurplus; the famine trip now converts too:
              // logs -> planks (craftPlanksFromLogs, the bootstrap rung) ->
              // sticks (consolidateSurplus, the bank-trip rung), then the kit.
              // Both mechanics are field-proven; nothing new is invented here.
              try { await craftPlanksFromLogs(miner.bot, { need: 8, log: m => console.log(`${name} wood trip: ${m}`) }) } catch { /* planks stay logs */ }
              try { await consolidateSurplus(miner.bot, { log: m => console.log(`${name} wood trip: ${m}`), stickCap: 24 }) } catch { /* planks stay planks */ }
              try { await ensureTools(miner.bot, { miner, log: () => {}, maxSeconds: 30 }) } catch { /* keep going */ }
              const after = (() => {
                try {
                  const inv = miner.bot.inventory.items()
                  const sum = re => inv.filter(i => re.test(i.name) && Number.isFinite(i.count)).reduce((a, i) => a + i.count, 0)
                  return { sticks: sum(/^stick$/), planks: sum(/_planks$/), logs: sum(/_log$/) }
                } catch { return { sticks: -1, planks: -1, logs: -1 } }
              })()
              console.log(`${name} wood trip: gathered (sticks ${after.sticks} planks ${after.planks} logs ${after.logs})`)
              try {
                await gotoSafe(miner.bot, standGoalNear(miner.bot, goals, preWood.x, preWood.y, preWood.z, { range: 4 }), { timeoutMs: 60000, label: 'return to column' })
              } catch { /* dig from wherever the return walk reached */ }
            } else {
              console.log(`${name} wood trip: 0 (climb refused)`)
            }
          }
        }
        // underground the bot still SEES ores in the shaft walls - record them into the
        // shared map (fleet digs with digShaft, which never goes through workOnGround,
        // so without this hook the fleet's map stayed empty the whole first run)
        miner.recordToMap({ maxDistance: 24, count: 32 })
        // Need-based map routing (src/fleet/materialplan.mjs): every 3rd shaft a tooled
        // bot walks to a position the shared map KNOWS for the plan's most-deficient
        // resources and digs there. The v0.6.9 run collected ZERO sand while the map
        // held sand=194 - the map must feed the diggers, not just the report.
        shaft++
        // Time-based trip cadence (75s), NOT shaft-count: one digShaft descent runs
        // 60-120s, so "every 3rd shaft" meant most bots never tripped even once in a
        // 300s run (0 "map trip" lines in three CI fleets). Cheap when the map has
        // nothing nearby: no-target returns in microseconds.
        if (tripDue({ hasPick: hasPickNow(), emptyShafts, msSinceLast: Date.now() - lastTrip, remainingMs: deadline - Date.now() })) {
          // (v0.11.2) emptyShafts gate: every bottomed-out bot's map trip is a
          // sealed-stone A* toward a surface position - 38x 'unreachable' in three
          // runs and the same explosion class as the next-column walk. Underground
          // bots branch-mine; trips resume the moment a shaft produces again.
          // NIGHT WALK GATE (v0.10.0): the fleet loses bots to night SURFACE mobs
          // ("night mob kill streak - 7 deaths measured"), not to shafts. A deferred
          // trip becomes more shaft - the walk happens after dawn instead.
          // (v0.17.1) tripDue also refuses trips the run cannot FINISH: fleet #122
          // skipped all 23 trips - 9x 'unreachable' were walks the 14s budget could
          // never span (targets up to 128 blocks need 30s+ on foot).
          const tod = miner.bot.time?.timeOfDay
          if (walkForbidden(tod)) {
            if (Date.now() - lastNightLog > 120000) {
              lastNightLog = Date.now()
              console.log(`${name} map trip deferred: night (tod=${Math.floor(tod)})`)
            }
          } else {
            lastTrip = Date.now()
            const tripBlocks = mapTripTargets({ progress: materialsProgress(), mapCounts: map.counts(), maxTargets: 2 })
            if (tripBlocks.length) {
              // (v0.12.0) trip targets are surface positions (sand shores, log runs):
              // an underground bot must leave the shaft first or the walk below fails
              // with 'unreachable' 38 times per run
              if (!(await ensureSurface('trip'))) {
                console.log(`${name} map trip skipped: cannot leave the shaft`)
              } else try {
                // direction + shouldStop feed the surface-harvest mode (beaches are eaten
                // sideways, and the deadline always wins); digNames is the full stone list
                // for the ore/stone descent mode
                const trip = await miner.mapTrip(tripBlocks, { digNames: namesFor(true), direction, walkTimeoutMs: TRIP_WALK_MS, shouldStop: () => Date.now() > deadline })
                if (trip.name) console.log(`${name} map trip: ${trip.name}`)
                else if (trip.error === 'unreachable') console.log(`${name} map trip skipped: ${tripBlocks.join(',')} unreachable`)
              } catch (e) { console.log(`${name} map trip failed: ${e.message}`) }
            }
          }
        }
        // step to a fresh column and dig the next shaft. The walk target MUST be a
        // standable spot: a raw "here + direction*8" goal sits inside unexcavated stone
        // at shaft-bottom y, and 19 bots pathing toward sealed goals were the heap OOM
        // (v0.6.4 investigation). standGoalNear snaps the goal to a walkable surface.
        //
        // BOTTOMED-OUT GUARD (v0.11.2, OOM in 35484290848): standGoalNear's snap is a
        // scan, not a guarantee - a bot that just emptied two shafts stands at the
        // shaft-bottom y where EVERY side goal is sealed, and the 20s gotoSafe does
        // not stop the A* from EXPANDING into the whole sealed world: 3.4GB in ~30s,
        // process dead at t-470s. When the last shaft was empty we are bottomed out:
        // the tunnel IS the next column (raw controls, no pathfinder), so the walk is
        // skipped entirely until a shaft produces again.
        if (emptyShafts === 0) {
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
      }

      // FLEET_SYNC (v0.6.0): cross-process resource sync. The shared WorldMap works by
      // reference inside THIS process; chat (PVB1, src/fleet/chatsync.mjs) is the only
      // channel to OTHER processes - a scout in a second terminal merges our finds live.
      if (sync) sync.stop()
      if (claimSync) claimSync.stop()
      if (guard) { guard.stop(); guards.delete(name) }

      // end-of-run banking: after the deadline the pockets still hold loot that would
      // otherwise be lost when the bot quits - one final walk to the chests. Skipped
      // when only KEEP-list items remain (a pointless walk to the yard costs minutes).
      const bankable = miner.bot.entity &&
        miner.bot.inventory.items().some(i => !DEPOSIT_KEEP.some(k => i.name.includes(k)))
      // (v0.140.1) THE NIGHT HOLD - the final-bank wave is the surface kill site.
      // MEASURED (run554, 35974993311, the v0.139.0 fleet): FIVE bots were shot
      // by skeletons in the end-phase wave in rapid succession (F2 [-96,66,396],
      // F6 [-155,64,410], F12 [-147,64,411], F7 [-132,64,419], F10 [-140,64,398];
      // F14 [-136,64,405] followed at t-15) - every corpse at the surface yard
      // elevation y 64-66, every one on a bank/climb/hop line, the pockets they
      // carried (~840 units across the five) the single biggest slice of the
      // run's unaccounted=907 and the driver of conversion 76.3. The end phase
      // landed inside the night window: the fleet's own doctrine says surface
      // walks defer at night ("a deferred walk turns into more shaft") - but the
      // FINAL bank was exempt, and the exemption shot five bots. The pocket is
      // lost at the hard kill either way; the DEATH is the only real loss (the
      // re-bootstrap cascade, the fight episodes, the relogins). Hold: stay
      // underground, alive; the loot rides the respawn rules honestly.
      if (bankable && surfaceHoldVerdict({ timeOfDay: miner.bot.time?.timeOfDay, purpose: 'final-bank' }) === 'hold') {
        console.log(`${name} final bank deferred: night (tod=${Math.floor(miner.bot.time?.timeOfDay ?? -1)}) - the pocket rides out the dark alive (the v0.140.1 night hold)`)
      } else if (bankable) {
        // (v0.41.0) PRICE THE CHAIN AT ENTRY: the budget is computed from the
        // margin BEFORE the stagger and the climb spend any of it, and the
        // climb is bounded by what the chain does not need. MEASURED (fleet
        // 35580596054, v0.40.0): F1's climb stalled ~85s, then the chain -
        // priced AFTER the climb - burned ~195s more on doomed wilderness
        // hops and died 'budget exhausted' with a full pocket. The chain's
        // needs (the walk home + the deposit) now RESERVE their slice first;
        // the climb gets the remainder and the wall-clock re-clamp below
        // still cuts the chain into whatever is really left - the margin
        // cannot be outrun, same construction as v0.34.0.
        const entryMarginMs = Math.max(0, RUN_KILL_AT - END_PHASE_SAFETY_MS - Date.now())
        // (v0.44.0) null when unmeasurable (no yard/no entity yet): the stagger's
        // junk contract then keeps the legacy index order, and the budget maths
        // read the distance as 0 (the bankTripBudgetMs floor) - a 0 distance must
        // never be mistaken for 'standing at the yard' by the slot order.
        const yardDist = yardGoal && miner.bot.entity ? miner.bot.entity.position.distanceTo(yardGoal) : null
        const chainBudgetMs = finalBankBudgetMs({
          yardDist,
          marginLeftMs: entryMarginMs,
          floorMs: END_BANK_BUDGET,
          capMs: END_BANK_BUDGET_CAP_MS
        })
        // (v0.21.1) FINAL-BANK STAGGER: all 19 bots used to enter climbOut + the
        // yard walk in the same second (fleet #131: 14x 'final bank: 0' at t-0,
        // path throttle 6a/10q - every walk budget burned in the queue). Index-
        // spread slots give each climb + walk a quieter throttle and yard; the
        // reporter keeps printing (t-0s) and the process end shifts by the cap.
        // (v0.44.0) the slots order by DISTANCE now: fleet 35591877408 - 17
        // walkers started in boot order, the far walks (40-120s delays) crawled
        // into a saturated queue (F6: 67000ms for 37 blocks, then the retry was
        // budget-cancelled) while the same fleet's quiet mid-run walks took 0-5s.
        // The farthest bot takes the FIRST slot; near bots open last, when the
        // throttle is empty and their 0-5s walks churn instantly.
        const delayMs = finalBankDelayMs({ index, yardDist })
        // (v0.49.0) the schedule prices the STAGGER WINDOW first: the slice the
        // climb gets must never overlap the stagger sleep that runs before it
        // (F4, fleet 35605960761: entry margin 381s, chain 150s, slice 231s,
        // stagger +72s - the overlap ate the chain's reserve and the re-clamp
        // handed it ~19s, every hop 'budget exhausted (walk floor)').
        const schedule = finalBankSchedule({ entryMarginMs, chainBudgetMs, staggerDelayMs: delayMs })
        if (delayMs > 0 && Date.now() >= deadline) {
          console.log(`${name} final bank: staggered +${Math.round(delayMs / 1000)}s`)
          await new Promise(r => setTimeout(r, delayMs))
        }
        try {
          // (v0.12.0) the bot ends the run at the bottom of its last shaft: without
          // the climb this walk always failed and the final banked= stayed 0
          // (v0.21.0) REAL CLIMB WINDOW: this call used to pass
          // shouldStop: () => Date.now() > deadline - ALREADY TRUE here (the work
          // loop just exited on it), so since v0.12.0 the final-bank climb
          // silently no-op'd ('stopped', zero attempts, ledger escalated for a
          // wall never seen) and every yard walk started from the shaft bottom.
          // No shouldStop now: climbOut's own maxMs/failLimit budgets bound it.
          // force = even an exhausted ledger gets ONE stage-1 attempt - a refusal
          // here would guarantee the bank failure the climb exists to prevent.
          // (v0.41.0) ...and the climb now runs INSIDE its slice: maxMs =
          // min(the historical PILLAR_MAX_MS, what the chain spared). A thin
          // margin skips the climb entirely - the chain's walk home is worth
          // more than a doomed underground staircase.
          let cr
          let climbAttempts = 0
          const climbSliceStart = Date.now()
          // (v0.158.0) THE VERTICAL DOOM CLIMB (the final bank): run556's final
          // banks died 3-fold on the vertical (F6 y=41 vs yard 80 - 7 hops
          // 'chest unreachable' after 2 climb attempts; F10 'still underground
          // after 2 climb attempts - the chain from the shaft bottom is doomed
          // walks'; F17 the decide class at d=8). When the yard stands mostly
          // UP, the final climb's staircase digs TOWARD the yard (the bearing
          // points at it, not away) and its target raises to the yard's LEVEL
          // (climbTargetY) - the walk ladder cannot climb, the climb can. The
          // fences keep their slice discipline; only the direction and the
          // target change, both no-ops when the doom is absent.
          const finalDoom = (() => {
            if (!yardGoal || !miner.bot?.entity) return { doom: false }
            try {
              return verticalDoomPlan({
                botY: miner.bot.entity.position.y,
                yardY: yardGoal.y,
                lateral: Math.hypot(miner.bot.entity.position.x - yardGoal.x, miner.bot.entity.position.z - yardGoal.z)
              })
            } catch { return { doom: false } }
          })()
          const finalDoomDir = finalDoom.doom && miner.bot?.entity && yardGoal
            ? new Vec3(yardGoal.x - miner.bot.entity.position.x, 0, yardGoal.z - miner.bot.entity.position.z)
            : null
          if (finalDoom.doom) console.log(`${name} final climb: ${finalDoom.why} - climbing toward the yard's level (the walk ladder cannot)`)
          if (schedule.climbSkipped) {
            cr = { ok: false, reason: `climb skipped (slice ${Math.round(schedule.climbSliceMs / 1000)}s < min ${Math.round(CLIMB_MIN_SLICE_MS / 1000)}s - the chain keeps its budget)`, gained: 0, dug: 0, steps: 0 }
          } else {
            // (v0.49.0) THE FINAL-CLIMB FENCE: the escalation ladder multiplies
            // maxMs INTERNALLY (climbEntry 2x/3x), so a doomed underground climb
            // outran its granted slice and the wall-clock re-clamp then handed
            // the chain the crumbs (F4: slice 231s, maxMs 90s, escalated ~180s,
            // the climb ended at ts=941 of the 990s safety line - the chain got
            // ~19s, banked=0 with the bot 17 blocks from the yard, pockets
            // full). shouldStop fences the climb cooperatively at the wall
            // clock the schedule actually granted (the main loop checks it
            // every iteration; mid-run climbs keep their escalation - this is
            // the FINAL climb only, where the chain's reserve outranks a
            // deeper staircase attempt).
            const climbFenceMs = Math.min(PILLAR_MAX_MS, schedule.climbSliceMs)
            const climbFenceAt = Date.now() + climbFenceMs
            cr = await miner.climbOut({ dir: finalDoomDir || direction, targetY: finalDoom.doom ? yardGoal.y : null, force: true, maxMs: climbFenceMs, shouldStop: () => Date.now() > climbFenceAt })
            if (!cr.ok && cr.reason === 'timeout') cr.reason = `timeout (fenced at ${Math.round(climbFenceMs / 1000)}s - the chain keeps its reserve)`
            climbAttempts = 1
            // (v0.50.0) THE FINAL-CLIMB RETRY: fleet 35630279913 measured 13
            // fast 'stalled' climbs and then 13 underground chains burning
            // their whole 150s reserve on pre-deposit walks to chests that sit
            // 27 blocks away AT THE YARD SURFACE (a shaft-bottom bot cannot
            // walk there: raw walks stall into stone, the pathfinder cannot
            // route out) - 120s of silence per bot, 'smelt skipped', walk-floor
            // refusals, banked=0, and the process ground into the hard kill.
            // The escalation ladder (climbEntry) is the built-in cure: attempt
            // 2 inherits 2x budgets and a ROTATED bearing. The retry is fenced
            // by the slice the failed attempt left, so the chain's reserve
            // survives both attempts by construction; 'exhausted'/'stopped'
            // never retry (the ledger cooldown / no clock left).
            const retryPlan = climbRetryPlan({ attempts: climbAttempts, reason: cr.reason, sliceLeftMs: Math.max(0, schedule.climbSliceMs - (Date.now() - climbSliceStart)) })
            if (!cr.ok && retryPlan.retry) {
              console.log(`${name} final climb: retry (${retryPlan.why}, ${Math.round(retryPlan.maxMs / 1000)}s fence)`)
              const retryFenceAt = Date.now() + retryPlan.maxMs
              cr = await miner.climbOut({ dir: finalDoomDir || direction, targetY: finalDoom.doom ? yardGoal.y : null, force: true, maxMs: Math.min(PILLAR_MAX_MS, retryPlan.maxMs), shouldStop: () => Date.now() > retryFenceAt })
              climbAttempts = 2
            } else if (!cr.ok) {
              console.log(`${name} final climb: no retry (${retryPlan.why})`)
            }
          }
          if (cr.ok) console.log(`${name} final climb: OK +${cr.gained} levels (${cr.steps} steps, ${cr.dug} dug${cr.traversed ? `, ${cr.traversed} traversed` : ''}, ${cr.secs?.toFixed(0)}s)`)
          else console.log(`${name} final climb: failed - ${cr.reason}${cr.waitSecs ? ` (wait ${cr.waitSecs}s)` : ''}${cr.stage ? ` [stage ${cr.stage}]` : ''}`)
          // (v0.27.0) the chain runs under a wall-clock budget: doomed walks
          // give up with a named reason instead of churning the path queue
          // until the hard kill (dispatch 35544781892: 420s of silence).
          // (v0.34.0) the budget now SCALES with the walk back to the yard: the
          // flat 150s burned on a 100-300 block walk (14x 'final bank: 0 (budget
          // exhausted)' in dispatch 35560497949 with pockets FULL of loot) - and
          // it clamps into whatever hard-kill margin the bot has left, so a long
          // stagger + climb eats into the walk budget instead of the kill line.
          // (v0.41.0) the RESERVED slice from entry (chainBudgetMs) re-clamped
          // into the wall clock the stagger + climb actually left: the chain
          // never starts with less than the margin allows, and never outruns
          // the kill line.
          const finalBudget = Math.min(chainBudgetMs, Math.max(0, RUN_KILL_AT - END_PHASE_SAFETY_MS - Date.now()))
          // (v0.50.0) STILL UNDERGROUND: a bot whose every climb attempt failed
          // cannot reach the yard chests (they stand at the surface) and cannot
          // walk home - the chain from the shaft bottom is 150s of doomed walks
          // (fleet 35630279913: 120s of pre-deposit silence per bot, smelt
          // skipped, walk-floor refusals, banked=0, the hard kill at +420s).
          // The honest verdict ends the phase NOW and the reserve goes back to
          // the wall clock (the process ends early, the report prints).
          if (!cr.ok && climbAttempts > 0) {
            console.log(`${name} final bank: 0 (still underground after ${climbAttempts} climb attempt${climbAttempts > 1 ? 's' : ''} - the chain from the shaft bottom is doomed walks)`)
          } else {
            const res = await smeltThenBank(miner, { yardGoal, budgetMs: finalBudget })
            if (res.deposited > 0) {
              banked += res.deposited
              console.log(`${name} final bank: +${res.deposited}`)
            } else {
              console.log(`${name} final bank: 0 (${res.reason})`)
            }
          }
        } catch (e) {
          // (v0.24.0) this catch swallowed EVERYTHING in silence - fleet
          // 35536139524: 9 staggered climbs produced diag lines and then
          // NOTHING (no 'final climb', no 'final bank'), the report showed
          // banked=0 with zero evidence why. A climb that dies mid-air now
          // names its killer.
          console.log(`${name} final bank chain error: ${e && e.message ? e.message : e}`)
        }
      }
    } catch (e) {
      // (v0.16.3) count kicks ONCE here; the retry itself is counted below - the old
      // loop incremented `reconnects` in both places, so every kick was reported twice
      if (/kicked|end|disconnect/i.test(e.message)) { kicks++; lastWhy = 'kick/disconnect' }
      else lastWhy = String(e.message || 'unknown error').slice(0, 120)
    }
    // (v0.18.9) totals survive into the next attempt's miner; a failed LOGIN leaves
    // no stats object - keep the previous carry instead of resetting to zero
    const snap = snapshotStats(miner?.stats)
    if (Object.keys(snap).length) carry = snap
    if (Date.now() >= deadline) break
    failStreak++
    reconnects++
    // (v0.16.3) jittered exponential backoff with a per-bot phase: see src/lib/backoff.mjs
    const delay = reconnectDelayMs({ attempt: failStreak, index, rand: Math.random })
    console.log(`${name} retry #${failStreak} in ${(delay / 1000).toFixed(1)}s (${lastWhy})`)
    lastWhy = ''
    await new Promise(r => setTimeout(r, delay))
  }
}

process.on('unhandledRejection', e => console.log(`[fleet] unhandled rejection (kept alive): ${e?.stack || e}`))
process.on('uncaughtException', e => console.log(`[fleet] uncaught exception (kept alive): ${e?.stack || e}`))

console.log(`launching ${COUNT} bots for ${SECONDS}s -> targets ${TARGETS.join(', ')}${SCOUT ? ' (+1 ground scout)' : ''}`)
// (v0.18.15) WORKER HEARTBEAT: fleet #126 silenced the reporter for 380 s while the log
// kept growing - the log could not tell "main thread's timers starved" from "process
// frozen". The heartbeat worker ticks on its OWN thread and writeSync's straight to the
// real stdout fd, so [hb] lines land even mid-starvation: hb live + reporter silent =
// main-thread spin; hb dead too = process/machine freeze. Unref'd: it must never hold
// the process open (the OOM path included). 20s -> 30 lines per 600s run.
// (v0.62.0) THE FREEZE BLACK BOX rides the heartbeat: the ONE process hosting
// all 19 bots went ~150s without running its own timers in run60 (dispatch
// 35668657935, mainLate=150742ms) and the log could not name WHAT blocked -
// the server keepalive-timed-out every client at once, the run lost ~3
// minutes to the relogin crawl. The box is a shared-memory ring of activity
// labels (pf:queue / pf:goal / pf:done / water:rescue / climb / report /
// mapsave); when the worker sees mainLate >= 5s it dumps the newest entries -
// the LAST activity before the gap names the blocker.
const blackbox = createSharedBlackBox({})
// (v0.65.0) THE UNFREEZE SWEEP - the post-freeze edge of the zombie-goto
// cure. run63 (dispatch 35677752396) finally NAMED the freeze blocker: the
// black box printed 'main freeze ~51s; last: pf:goal deploy @+0.0s' - a goal
// the A* could never close re-spiralized on every physics tick, starved the
// main thread's timers for 51s (mainLate=51122ms), and the server
// keepalive-killed 39 transports behind it (32 relogins, 20 deaths, the end
// phase burned its whole 420s margin on rescue/combat chaos - HARD KILL).
// The lag probe below is the ONLY main-thread code that runs across a
// freeze; its first post-freeze fire carries the full drift, and THAT is
// when every goal still held across the freeze gets cleared - a legitimate
// mid-freeze walk rejects and its caller re-plans (one walk is the cheapest
// thing in a fleet that just lost a minute to a re-spiraling A*).
const onUnfreeze = lateMs => {
  let swept = 0
  let left = 0
  for (const [, entry] of bots) {
    const b = entry?.miner?.bot
    const verdict = unfreezeTarget(b, { lateMs })
    if (!verdict.sweep) { if (b?.pathfinder) left++; continue }
    try { b.pathfinder.setGoal(null) } catch { /* stop() below still bounds it */ }
    try { b.pathfinder.stop() } catch { /* already stopped */ }
    console.log(`${entry.miner.username ?? '?'} [unfreeze] goal cleared (${verdict.why})`)
    swept++
  }
  console.log(unfreezeLine({ lateMs, swept, skipped: left }))
}
// (v0.141.0) THE STORM GOAL SWEEP - the lag-probe feeder's teeth. The valve
// closing refuses NEW long walks, but the run 576 storm (fleet leg
// 35986122635) was allocated by the IN-FLIGHT recompute loops (the blackbox
// ring: pf notes 0.0s before the probe, then silence - every walk was inside
// its A*). setGoal(null) clears the goal slot the loops re-engage from (the
// v0.65.0 zombie-kill mechanics) - the allocation stops within one think
// window (~2s) instead of one walk-timeout cycle (~11s). One re-planned walk
// is the cheapest thing in a fleet that just kept its last 80-90s.
const stormSweepAllGoals = () => {
  let swept = 0
  for (const [, entry] of bots) {
    const b = entry?.miner?.bot
    if (!b?.pathfinder) continue
    try { b.pathfinder.setGoal(null) } catch { /* stop() below still bounds it */ }
    try { b.pathfinder.stop() } catch { /* already stopped */ }
    swept++
  }
  return swept
}
// (v0.141.0) THE LAG-PROBE VALVE FEEDER - the applier that survives the storm
// that starves its rivals. Fleet leg 35986122635 (the v0.140.0 union, mined
// 2026-09-24): the worker PROBED at rss 1213M (10:36:16) and published into
// the storm cell, but BOTH existing appliers were deaf - the 1s ticker's
// timer phase was starved and the funnel only probes BETWEEN walks (every
// walk was in flight, the 11.4s timeout class) - so the closure never landed
// and the second strike killed at 2164M five seconds later, 521/600s into a
// probable NORMAL END. The 250ms lag probe is the one main-thread cadence
// proven to keep firing inside a storm (mainLate 959ms at the probe: the
// event loop TURNING) - startHeartbeat forwards every probe fire here, and
// the FIRST fresh cell verdict is applied at this cadence: forceClose + the
// storm goal sweep above. One publish per process (the probe is spent) ->
// one feeder application; the seq guard keeps the ticker's and the funnel's
// own applications independent and idempotent.
let lagProbeSeq = 0
let lagProbeApplied = false
const onProbeFire = ({ drift } = {}) => {
  if (lagProbeApplied) return // one worker publish per process - one sweep
  let r
  try { r = stormCellApply({ cell: stormCell, lastSeq: lagProbeSeq, forceClose: a => allocValve.valve.forceClose(a) }) } catch { return }
  if (!r || !r.applied) return
  lagProbeSeq = r.seq
  lagProbeApplied = true
  const snap = r.snapshot || {}
  const swept = stormSweepAllGoals()
  // (v0.143.0) the same verdict arms the STORM DUCK at the proven cadence -
  // the funnel would arm it on its next consult, but inside run58's heavy
  // class that consult may never come (the loop stopped turning). Idempotent
  // per seq: if the funnel armed first this is a silent null (the sweeper
  // already ran there).
  try {
    const duck = armStormDuck({ source: 'lag probe', rate: snap.lastRate, rss: snap.lastRss, seq: r.seq })
    if (duck) console.log(stormDuckArmLine({ source: 'lag probe', rate: duck.rate, rss: duck.rss, swept: duck.swept, remainingMs: duck.remainingMs, tsS: Math.round(process.uptime()) }))
  } catch { /* the duck never kills the feeder */ }
  console.log(`[allocvalve] CLOSED (lag probe): the worker verdict rss ${Number.isFinite(snap.lastRss) ? snap.lastRss : 0}M (+${Number.isFinite(snap.lastRate) ? snap.lastRate : 0}MB/s) applied at the 250ms lag probe (drift ${Math.round(Number.isFinite(drift) ? drift : 0)}ms) - long walks refused ${Math.round(Number.isFinite(snap.remainingMs) ? snap.remainingMs : 0) / 1000}s AND ${swept} pathfinder goals swept (the in-flight recompute loops die at the source; strike ${Number.isFinite(snap.strikes) ? snap.strikes : 0}) ts=${Math.round(process.uptime())}s`)
}
const pulseSab = createPulseSab()
// (v0.104.0) THE STORM CELL - the worker->main verdict channel. The worker's
// stormguard (its own thread, never starved by the main thread's sync A*)
// publishes its first-strike probe verdict here; the fleet valve ticker
// applies it via forceClose on the first post-freeze tick. run93's FATAL
// caught the main thread FROZEN - the main sampler cannot be the only
// detector. The MAGIC is written HERE at creation (an uninitialized cell
// degrades the channel to a no-op, never to a false storm).
const stormCell = new SharedArrayBuffer(32)
new Int32Array(stormCell)[0] = STORM_CELL_MAGIC
const loopPulse = createLoopPulse({ sab: pulseSab, intervalMs: 250 })
loopPulse.start() // counters read by the heartbeat worker across any freeze
const heartbeat = startHeartbeat({ intervalMs: 20000, blackbox, pulse: { sab: pulseSab }, storm: { sab: stormCell }, onUnfreeze, onProbeFire })
// (v0.102.0) THE ALLOCATION VALVE - the main thread watches its OWN rss every
// 1s. The worker stormguard (floor 1200M, 5s, two-strike SIGTERM) amputates;
// the valve (floor 600M, 1s) CURES: on the storm signature gotoSafe refuses
// LONG walks (bot->goal > 24 blocks) at the funnel - the A* loses its fuel,
// GC drains the garbage, the valve reopens in 12-30s. run92 (35829873166):
// 375M for 441s, then +1.9GB in 10s while still ticking (mainLate 2006ms) -
// second strike, SIGTERM, a probable NORMAL END erased at 510/600s. The
// closure drops the growth, the worker's streak resets on the dip, and the
// kill never arms; if allocation continues anyway, the valve oscillates
// closed (escalated) and the worker still kills exactly as before.
// (v0.104.0) THE RUN93 FIX - ONE VALVE, TWO FEEDERS: run93 (35835942682)
// shipped TWO instances - this call built a PRIVATE valve (startAllocValve
// always created its own) while gotoSafe consulted jobqueue's never-sampled
// singleton: the cure could not refuse a single walk, zero [allocvalve]
// lines, and run92's OOM class killed the run again (worker second strike,
// rss 2626M, no FLEET RESULT). startFleetValveTicker feeds the SINGLETON
// itself, and the stormCell poll applies the worker probe's verdict when the
// main thread could not sample its own storm (the FATAL named it FROZEN).
const allocValve = startFleetValveTicker({ onLine: line => console.log(line), stormCell })
// (v0.143.0) THE SWEEP-ON-CLOSE WIRING - the replan loops die at the closure.
// Fleet leg 35994461858: the valve's appliers that DO survive (the funnel
// consults, the ticker in the turning phase) now sweep every pathfinder goal
// slot on every valve close - the library's block-update replan loops
// re-engage from the goal slot, so clearing the slots at the close starves
// the replan storm in the same breath the walk funnel stops feeding it (the
// lag-probe feeder alone was too late: its probe was dead with everything
// else). Every close sweeps once; the walks re-issue through the closed
// valve's rules (long refused, near admitted).
setFleetGoalSweeper(() => {
  const swept = stormSweepAllGoals()
  if (swept > 0) console.log(`[allocvalve] GOAL SWEEP: ${swept} pathfinder goal(s) swept at the valve close (the replan loops die at the closure, v0.143.0)`)
})
// (v0.121.0) THE FUNNEL PROBE WIRING - run105 (35903689995) died with the
// valve never closing: the worker's first-strike verdict was published into
// this cell at ts=415s but BOTH pollers (the 1s ticker + the cell poll inside
// it) live on the main thread's TIMER phase, and the storm starves exactly
// that phase (the funnel's pf notes marched through the kill window). The
// funnel now polls the cell ITSELF on every gotoSafe consult and carries its
// own rss storm verdict (floor 450M, bar 80MB/s over a 150ms+ gap) - the
// close lines ride the fleet log through the same console funnel.
setFleetValveStormCell(stormCell)
setFunnelProbeLogger(line => console.log(line))
// (v0.143.0) THE STORM DUCK WIRING - the duck lives in the funnel (jobqueue),
// but the bots live here: the arm sweeps through this callback (the same
// stormSweepAllGoals the lag-probe feeder uses). Registered BEFORE any bot
// can consult the funnel - an unregistered sweeper still arms the duck (the
// refusal is the cure, the sweep is the acceleration).
setFleetDuckSweeper(stormSweepAllGoals)
// (v0.62.0) THE FLEET NO-PATH LEDGER - one shared array reaches every bot
// (the fleet is one process): the first bot's 'No path' verdict for a chest
// skips the SAME doomed A* exhaustion for the other 18 (run60's end phase:
// 16x 'chest unreachable (No path to the goal!)', F4 alone tried 6 chests,
// several of them the SAME cells from different bots, each a ~4.5s sync
// think that froze everyone else's digs and walks). deposit.mjs records and
// reads; the report prints the count as the A*-storm evidence.
const noPathLedger = []
const fullChestLedger = [] // (v0.65.0) shared fleet-wide 'chest full' verdicts - one discovery spares the other 18 the walk
const names = Array.from({ length: COUNT }, (_, i) => `F${i + 1}`)
const runners = []

// (v0.52.0) SERVER-DEATH WATCHDOG - run49 (dispatch 35630279913) mined 2026-09-22:
// at ts~550s the vanilla server stopped answering and within ~30 s ALL 19 bot
// sockets broke (write EPIPE / write ECONNRESET, 6 explicit disconnect.timeout
// kicks) - while the fleet process kept executing end-phase chains against dead
// sockets for ~450 s (mineflayer never emitted 'end': zero `disconnected (`
// lines), the end phase hung past the deadline and the run died in a HARD KILL
// with banked=0. Detection: a fleet-wide BURST of socket-class errors is the
// server dying (one bot losing its link is a reconnect, half the fleet is a
// funeral). Response: end the run honestly - the same orderly shutdown the heap
// cliff uses - so the report lands and the CI job stops burning its budget.
const serverGuard = createServerGuard({ total: COUNT })
let serverDeathHandled = false
let serverProbeTimer = null
// (v0.56.0) the resurrection budget: how many JVM reboots this run has spent
let serverRestarts = 0
// the same control script the CI workflow uses - the reboot is the runner
// restarting ITS OWN server, not a second server (stop clears a zombie still
// holding the port; start blocks until "Done (" or its own 240s budget)
const SERVER_SH = fileURLToPath(new URL('../scripts/server.sh', import.meta.url))
function stopServerProbe () { if (serverProbeTimer) { clearInterval(serverProbeTimer); serverProbeTimer = null } }
// (v0.52.0) THE VERDICT LOOP - run51 taught the difference: a transport burst is
// only SUSPECT. While suspect, a bare TCP connect decides every 5 s: the JVM
// still accepts (tick-drowned, wave) -> clear and keep mining; refused/timeout
// -> the server is GONE -> honest shutdown instead of a 400s dead-socket hang.
function startServerProbe () {
  if (serverProbeTimer || serverDeathHandled) return
  console.log(`[fleet] server guard: SUSPECT - ${serverGuard.lossesInWindow} transport losses fleet-wide (threshold ${serverGuard.threshold}); probing 127.0.0.1:25565 every ${PROBE_INTERVAL_MS / 1000}s`)
  serverProbeTimer = setInterval(async () => {
    const answer = await probeServerPort({ port: 25565 })
    serverGuard.recordProbe(answer)
    const v = serverGuard.pollExpiry()
    if (v.dead) {
      stopServerProbe()
      onServerDeath(`transport losses fleet-wide, port probe ${serverGuard.lastProbe}`)
    } else if (!v.suspect) {
      stopServerProbe()
      console.log('[fleet] server guard: suspect CLEARED - a re-login or a live probe says the server breathes (the run51 wave class); the run continues')
    }
  }, PROBE_INTERVAL_MS)
  serverProbeTimer.unref?.()
}
function funeral (detail, why) {
  console.log(`[fleet] SERVER DEATH WATCHDOG: ${detail} - ${why}; ending the run honestly (the run49 400s end-phase hang class)`)
  for (const e of bots.values()) { try { e.bot?.quit?.('server death watchdog') } catch { /* going down */ } }
  // NOT unref'd - same contract as the heap cliff: quit() empties the event loop,
  // this timer must survive it to print the report.
  setTimeout(() => {
    printFinalReport(`server death watchdog - ${detail}`)
    process.exit(14)
  }, 3000)
}

function onServerDeath (detail) {
  if (serverDeathHandled) return
  serverDeathHandled = true
  // (v0.56.0) THE RESURRECTION: a dead JVM on a shared runner is usually infra,
  // not world death - the world dir survives a reboot and the bots' reconnect
  // backoff (12 attempts, ~34s apart, deadline-gated) already knows how to
  // re-enter a server that comes back. ONE boot attempt per run, only with real
  // runway (src/lib/resurrect.mjs); everything else takes the honest funeral.
  const plan = resurrectPlan({ remainingMs: deadline - Date.now(), restartsUsed: serverRestarts })
  if (plan.action !== 'restart') {
    funeral(detail, `no resurrection: ${plan.why}`)
    return
  }
  console.log(`[fleet] SERVER DEATH WATCHDOG: ${detail} - resurrection attempted (${Math.round(plan.remainingMs / 1000)}s of runway, boot floor ${Math.round(RESURRECT_FLOOR_MS / 1000)}s): rebooting the JVM, bots re-login through their own backoff`)
  const t0 = Date.now()
  execFile(SERVER_SH, ['stop'], { timeout: 30000 }, () => {
    execFile(SERVER_SH, ['start'], { timeout: 300000 }, (err, stdout) => {
      if (err) {
        funeral(detail, `resurrection failed: the JVM did not come back up in ${((Date.now() - t0) / 1000).toFixed(0)}s (${String(err.message).split('\n')[0].slice(0, 100)})`)
        return
      }
      serverRestarts++
      serverDeathHandled = false // a second death of the NEW JVM must still fire
      serverGuard.revive('jvm restart') // the old losses proved the OLD process dead - stale evidence now
      console.log(`[fleet] resurrection: ${String(stdout).trim().split('\n').pop() || 'server up'} in ${((Date.now() - t0) / 1000).toFixed(0)}s - the guard is re-armed, relogins clear any new suspect (restarts spent ${serverRestarts})`)
    })
  })
}

// (v0.26.0) HARD KILL - the run's last-resort exit guarantee. Dispatch
// 35541442371 (600s, e8f0ce1): every bot stalled inside the final bank chain
// at once (25+ minutes of NOTHING but heartbeat lines), FLEET RESULT never
// printed, the CI job burned its 40-minute budget and was cancelled BEFORE
// the artifact upload - the whole run's evidence lost. Past the deadline +
// this margin the process owes the CI nothing but its partial evidence:
// print the totals and exit so the job ends and fleet19.log lands.
// unref'd: a healthy early finish must not be held open by this timer.
setTimeout(() => {
  const list = [...bots.values()].map(e => e.miner).filter(Boolean)
  const alive = list.filter(m => m.bot?.entity).length
  console.log(`[fleet] HARD KILL: ${SECONDS}s run + end-phase margin exceeded (end-phase hang) - exiting with partial evidence`)
  console.log(`[fleet] partial: alive=${alive} mined=${list.reduce((a, m) => a + (m.stats.mined ?? 0), 0)} banked=${banked} smelted=${smelted} climbs=${list.reduce((a, m) => a + (m.stats.climbs ?? 0), 0)} rescues=${list.reduce((a, m) => a + (m.stats.rescues ?? 0), 0)}`)
  // (v0.31.0) the partial line above is not enough: the runs that NEED the hard kill
  // are exactly the runs whose evidence matters most (dispatch 35541442371 lost every
  // counter when its 25-minute end-phase hang hit the kill - FLEET RESULT never
  // printed, the report file was never written). printFinalReport is fully
  // synchronous (writeFileSync for fleet-report.json) and is the same code the
  // normal end and the heap cliff already use: the full FLEET RESULT block lands in
  // the log, the machine-readable report is written, and only then does the
  // process exit.
  try {
    printFinalReport('hard kill - deadline + margin exceeded (end-phase hang)')
  } catch (e) {
    console.log(`[fleet] hard-kill report failed: ${e?.message} - exiting with the partial line above`)
  }
  process.exit(0)
}, hardKillDelayMs({ runSeconds: SECONDS })).unref()

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

// JOIN SPREAD (v0.14.2): two consecutive fleet runs (#116, #117) died in
// ECONNRESET / disconnect.timeout storms during the simultaneous join of 19
// bots - the vanilla server's network thread stalls >30 s under a 19-login
// chunk-send burst on a slow hosted runner, every bot's bootstrap burns, and
// the whole run is garbage even though the process exits 0. Logins are now
// spread over JOIN_SPREAD_MS: the server settles each player before the next
// arrives, and early joiners bootstrap while late joiners connect (zero
// wall-clock cost, the deadline starts before the spread).
const JOIN_SPREAD_MS = Number(process.env.FLEET_JOIN_SPREAD_MS || 2500)
for (let i = 0; i < names.length; i++) {
  runners.push(runBot(names[i], TARGETS[i % TARGETS.length], i))
  spawned++
  await new Promise(r => setTimeout(r, JOIN_SPREAD_MS)) // one bot per spread slot
}

let lastReportAt = Date.now()
const reporter = setInterval(() => {
  // (v0.18.15) self-annotated gaps: one skipped tick is normal under load (2.5x
  // tolerance); past that the line carries the [hb] attribution matrix inline
  const nowTick = Date.now()
  const rn = gapNote(lastReportAt, nowTick, 15000)
  if (rn) console.log(rn)
  lastReportAt = nowTick
  const list = [...bots.values()].map(e => e.miner).filter(Boolean)
  const s = fleetStats(list)
  const per = TARGETS.map(t => `${t}=${list.reduce((a, m) => a + (m.bot?.inventory ? countItem(m.bot, t) : 0), 0)}`).join(' ')
  const mapRep = map.report()
  // (v0.54.0) the pocket pair joins the tick: mined vs pocket+banked per tick
  // is the loot-conversion trend (the 93% loss made visible BEFORE the run ends)
  const pk = pocketTotals(list)
  console.log(`t-${Math.max(0, (deadline - Date.now()) / 1000).toFixed(0)}s alive=${aliveCount()}/${COUNT} mined=${s.mined} map=${mapRep.positions}p/${mapRep.chunksScanned}ch banked=${banked} smelted=${smelted} pocket=${pk.units}u/${pk.slots}s | ${per}`)
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
  // (v0.55.0) run53's storm was 3.4GB of RETAINED V8 heap while rss grew - the
  // old/ext/ab split says WHICH pool: old_space = retained JS objects,
  // external/arrayBuffers = Buffers and TypedArrays (socket payloads live here)
  const hs = v8.getHeapSpaceStatistics()
  const sp = nm => { const s = hs.find(x => x.name === nm); return s ? Math.round(s.size_used / 1048576) : -1 }
  const gs = [...guards.values()].map(g => { try { return g.stats() } catch { return null } }).filter(Boolean)
  const cols = gs.reduce((a, s) => a + s.columns, 0)
  const ents = gs.reduce((a, s) => a + s.entities, 0)
  const evicted = gs.reduce((a, s) => a + s.evicted, 0)
  // (v0.17.4) path throttle visibility: fleet #124 starved invisibly - the next
  // freeze must show up as maxActive/queued in the log, not as a silent gap
  // (v0.20.0) stale= counts pre-cleared stopPathing flags - every unit is a walk
  // that would have died with 'Path was stopped' before the gotoSafe pre-clear
  const ps = pathThrottleStats()
  const gss = gotoSafeStats()
  console.log(`   mem: heap=${(mem.heapUsed / 1048576).toFixed(0)}M/${(mem.heapTotal / 1048576).toFixed(0)}M old=${sp('old_space')}M ext=${(mem.external / 1048576).toFixed(0)}M ab=${(mem.arrayBuffers / 1048576).toFixed(0)}M rss=${(mem.rss / 1048576).toFixed(0)}M cols=${cols} ents=${ents} evicted=${evicted} path=${ps.active}a/${ps.queued}q (max ${ps.maxActive}) stale=${gss.staleStopClears}`)
}, 15000)

// (v0.18.3) HEAP WATCHDOG: fleet #127 died at t-400s - heap 113M -> 3550 MB in
// ~35 s ("Ineffective mark-compacts", exit 134) and the FINAL REPORT WAS NEVER
// PRINTED: 891 mined blocks, 19/19 alive, every counter lost. The 15s reporter
// cannot see - let alone act on - a 90 MB/s allocation storm. Every 5s: sample
// the heap; growth above STORM_MB_S gets a gc() nudge and a log line; a storm
// that survives 3 strikes AND crosses the cliff gets an ORDERLY shutdown - the
// same final report the OOM erased, the map save, exit code 13 (distinct from
// 0 = deadline reached and 1 = test failure) so CI and the next agent can tell
// the deaths apart.
const WATCHDOG_MS = 5000
const STORM_MB_S = Number(process.env.FLEET_STORM_MB_S || 40)
const CLIFF_MB = Number(process.env.FLEET_HEAP_CLIFF_MB || 2900)
let wdLastHeap = process.memoryUsage().heapUsed
let wdLastTs = Date.now()
let wdStrikes = 0
let wdShuttingDown = false
const heapWatchdog = setInterval(() => {
  if (wdShuttingDown) return
  const now = Date.now()
  const used = process.memoryUsage().heapUsed
  const dt = (now - wdLastTs) / 1000
  const rate = dt > 0 ? ((used - wdLastHeap) / 1048576) / dt : 0 // MB/s
  wdLastHeap = used
  wdLastTs = now
  if (rate > STORM_MB_S) {
    wdStrikes++
    console.log(`heap watchdog: +${rate.toFixed(0)} MB/s, heap ${(used / 1048576).toFixed(0)}M (strike ${wdStrikes})`)
    if (typeof global.gc === 'function') { try { global.gc() } catch { /* best effort */ } }
    if (used / 1048576 > CLIFF_MB && wdStrikes >= 3) {
      wdShuttingDown = true
      clearInterval(heapWatchdog)
      console.log('heap watchdog: CLIFF REACHED - orderly shutdown so the report survives')
      for (const e of bots.values()) { try { e.bot?.quit?.('heap watchdog shutdown') } catch { /* going down */ } }
      setTimeout(() => {
        printFinalReport('heap watchdog cliff - the OOM report the old runs lost')
        process.exit(13)
      }, 3000) // NOT unref'd: the quit() below empties the loop, this timer must survive it
    }
  } else {
    wdStrikes = 0
  }
}, WATCHDOG_MS)

await Promise.all(runners)
clearInterval(reporter)
clearInterval(heapWatchdog)
printFinalReport(`normal end - deadline ${SECONDS}s reached`)
process.exit(0)

// ---- the final report, shared by the normal end and the watchdog cliff ----
function printFinalReport (reason) {
  stopHeartbeat(heartbeat) // no [hb] lines racing the report block; covers both call sites
  try { allocValve.stop() } catch { /* diagnostics never hold the teardown */ }
  try { loopPulse.stop() } catch { /* diagnostics never hold the teardown */ }
  const list = [...bots.values()].map(e => e.miner).filter(Boolean)
  const s = fleetStats(list)
  const secs = SECONDS
  console.log(`================ FLEET RESULT (${reason}) ================`)
console.log(`bots=${COUNT} spawned=${spawned} reconnects=${reconnects} kicks=${kicks} tools=${toolsOk} recovered=${toolsRecovered} reboots=${toolsReboot} upgraded=${toolsUpgraded} swords=${swordsCrafted} alive=${aliveCount()} climbs=${list.reduce((a, m) => a + (m.stats.climbs ?? 0), 0)} banked=${banked} smelted=${smelted} planted=${list.reduce((a, m) => a + (m.stats.planted ?? 0), 0)} torched=${list.reduce((a, m) => a + (m.stats.torched ?? 0), 0)} fights=${list.reduce((a, m) => a + (m.stats.fights ?? 0), 0)} kills=${list.reduce((a, m) => a + (m.stats.kills ?? 0), 0)} shelters=${list.reduce((a, m) => a + (m.stats.shelters ?? 0), 0)} rescues=${list.reduce((a, m) => a + (m.stats.rescues ?? 0), 0)} airGlitches=${list.reduce((a, m) => a + (m.stats.airGlitches ?? 0), 0)} claims=${list.reduce((a, m) => a + (m.stats.claims ?? 0), 0)} claimedHolds=${board.size()} wet=${hazardLedger.size} wt=${waterTableBoard.size}`)
// (v0.52.0) the server-death verdict joins the report: a run whose server died
// mid-way must be readable as such years later (run49's hang read as a
// pathfinder bug for a whole session before the socket burst was mined)
console.log(`server guard: losses=${serverGuard.totalLosses} (window ${serverGuard.lossesInWindow}/${serverGuard.threshold}) relogins=${serverGuard.relogins} probe=${serverGuard.lastProbe ?? 'n/a'} dead=${serverGuard.dead ? 'YES' : 'no'} revives=${serverGuard.revives} restarts=${serverRestarts}`)
console.log(`pickaxe tiers at end: ${PICK_TIERS.join(',')} -> ${PICK_TIERS.map(t => `${t.split('_')[0]}=${list.reduce((a, m) => a + (m.bot?.inventory ? countItem(m.bot, t) : 0), 0)}`).join(' ')}`)
console.log(`blocks mined: ${s.mined} in ~${secs}s = ${(s.mined / secs).toFixed(2)} blocks/s (${((s.mined / secs) * 60).toFixed(0)}/min)`)
// (v0.54.0) the loot ledger: where the yield ended up. unaccounted = the
// never-reached class (drops out of pickup range, tool consumption, consolidation)
// - fleet 35566494961 measured this as 93% of mined with no way to see it live.
const endPk = pocketTotals(list)
const ledger = lootLedger({ mined: s.mined, banked, smelted, pocket: endPk.units })
console.log(`loot ledger: mined=${ledger.mined} banked=${banked} smelted=${smelted} pocket=${endPk.units}u/${endPk.slots}s accounted=${ledger.accounted} unaccounted=${ledger.unaccounted} conversion=${ledger.conversion == null ? 'n/a' : (ledger.conversion * 100).toFixed(1) + '%'}`)
for (const t of TARGETS) {
  // report the DROP, not the block: "stone" arrives as cobblestone, "dirt" includes
  // grass_block drops (the first runs reported stone collected=0 while bots held
  // stacks of cobblestone - a reporting lie, not an empty inventory)
  // (v0.157.0) the SAME respawn-window guard as materialsProgress: this report
  // line rides the same shape and a crash HERE would kill the final report
  // print itself (the run's whole summary lost to a spawn race)
  const got = list.reduce((a, m) => a + (m.bot?.inventory ? planHave(m.bot.inventory.items(), t) : 0), 0)
  const required = need[t]
  console.log(`  ${t.padEnd(13)} collected ${String(got).padStart(7)}${required ? ` (${((got / required) * 100).toFixed(3)}% of ${required.toLocaleString()})` : ''}`)
}
console.log(`materials: ${JSON.stringify(s.byName)}`)
console.log(`kicks handled: ${kicks} (reconnect attempts: ${reconnects})`)
// (v0.62.0) the A*-storm evidence: how many chest cells ended the run with a
// live fleet-wide 'No path' verdict (each one was a sync A* exhaustion that
// blocked every bot; the skips the ledger bought are in the per-bot
// 'chest skip (no path cached ...)' lines).
console.log(`no-path ledger: ${noPathLedger.length} live verdict(s) at end phase`)
console.log(`full-chest ledger: ${fullChestLedger.length} live verdict(s) at end phase`)
const dgs = doomedGoalStats()
console.log(`doomed-goal ledger: ${dgs.records} recorded, ${dgs.refusals} re-issues refused at the funnel, ${dgs.absorbed} re-dooms absorbed (the v0.96.0 backoff - the storm can no longer out-pace the ttl), ${dgs.live} live at end phase (v0.72.0 spiral breaker)`)
const wgs = walkGovernorStatsFor()
console.log(`walk governor: ${wgs.opens} stall(s) opened, ${wgs.refusals} churn re-issues refused (v0.74.0 churn breaker - goals queued+done with zero progress during the run68-class storms)`)
console.log(`fleet churn ceiling: ${wgs.fleetOpens} open(s), ${wgs.fleetRefusals} aggregate re-issues refused (v0.77.0 - the per-bot limit leaves the fleet-wide burst unbounded)`)
const gbs = goalBrakeStatsFor()
console.log(`goal brake: ${gbs.opens} burst open(s), ${gbs.refusals} re-issues refused, ${gbs.fleetOpens} fleet-ceiling open(s), ${gbs.fleetRefusals} fleet refusals (v0.143.0 - the re-issue CADENCE is the storm's rate knob: run 35994461858's flood walkers progressed 1-3 blocks per walk so the progress-judged governors never fired, and their near goals flowed through the closed valve, while ~90MB searches marched at 2.5 goals/s per walker into a frozen main)`)
const avs = allocValveStatsFor()
console.log(`alloc valve: ${avs.closes} close(s) (${avs.workerCloses} by the worker probe, ${avs.queueCloses} by the queue-pressure arm, ${avs.funnelCloses + avs.funnelCellCloses} by the funnel probe, ${avs.funnelSlowCloses} by the slow envelope), ${avs.strikes} strike(s), ${avs.refusals} long walks refused, ${avs.nearPasses} short walks passed while closed, ${avs.hazardRefusals} aquifer-gate refusals (v0.105.0 one valve two feeders + the aquifer gate - the run93 fix: the ticker feeds the consulted singleton, the worker's probe verdict rides the storm cell for the freeze class, and while closed the near exemption refuses live-hazard goals - near is not cheap in a flooded region; v0.115.0 the queue-pressure arm closes on the SUSTAINED pathfinder saturation - run101's 8-12q wall warned 80s before the rss burst; v0.121.0 the funnel probe - run105's storm starved the timers that carried both feeders while the walk funnel itself marched through the kill window, so the funnel now carries its own verdict and applies the worker's cell inline; v0.144.0 the slow envelope - run80's ramp sawtoothed past the fast anchor's dip rule while the consults marched, the 5s slide is the dip-immune read)`)
console.log(`storm duck: ${avs.duckArms} arm(s), ${avs.duckRefusals} walk(s) refused fleet-wide while ducked (v0.143.0 - run58: the storm's next-column class is near BY CONSTRUCTION and rode the closed valve's near exemption to the 3000M ceiling; a live storm verdict now shuts EVERY goal for 15s and sweeps the in-flight goals, the A* starves within one think window, the worker's grace lands the cure instead of the ceiling landing the kill)`)
const finalMap = map.report()
noteGlobal('mapsave') // (v0.62.0) the worldmap save is one of the suspects for a main-thread freeze
console.log(`worldmap: ${finalMap.positions} positions, ${finalMap.chunksScanned} chunks scanned, top: ${finalMap.top.slice(0, 5).map(([n, c]) => `${n}=${c}`).join(' ')}`)
map.save() // (v0.18.4) merge-on-save: the union of this run's finds + anything on disk; next fleet starts with this knowledge
map.stopAutosave() // the final save above is the last word - no timer races after it

// Machine-readable report for the plan loop: what was produced, by whom, and how far
// the build's material plan got. Consumed by scripts and by the next session's agent.
const materials = materialsProgress()
const fleetReport = {
  finishedAt: new Date().toISOString(),
  seconds: SECONDS,
  bots: COUNT,
  spawned,
  reconnects,
  kicks,
  toolsOk,
  toolsRecovered,
  toolsUpgraded,
  toolsReboot,
  swordsCrafted,
  climbs: list.reduce((a, m) => a + (m.stats.climbs ?? 0), 0),
  torched: list.reduce((a, m) => a + (m.stats.torched ?? 0), 0),
  banked,
  smelted,
  mined: s.mined,
  blocksPerSecond: secs > 0 ? Number((s.mined / secs).toFixed(3)) : 0,
  perBot: list.map(m => ({
    name: m.username,
    mined: m.stats.mined,
    banked: m.stats.banked ?? 0,
    climbs: m.stats.climbs ?? 0,
    planted: m.stats.planted ?? 0,
    torched: m.stats.torched ?? 0,
    mapTrips: m.stats.mapTrips ?? 0,
    mapRecords: m.stats.mapRecords ?? 0,
    fights: m.stats.fights ?? 0,
    rescues: m.stats.rescues ?? 0,
    airGlitches: m.stats.airGlitches ?? 0,
    claims: m.stats.claims ?? 0,
    byName: m.stats.byName
  })),
  materials,
  worldmap: finalMap
}
try {
  noteGlobal('report:write') // (v0.62.0) the stringify+writeFileSync is a classic sync block - mark the site BEFORE it
  fs.writeFileSync('data/fleet-report.json', JSON.stringify(fleetReport, null, 2))
  console.log('report: data/fleet-report.json written')
} catch (e) {
  console.log(`report: could not write fleet-report.json (${e.message})`)
}
console.log(`plan progress: ${Object.values(materials).filter(m => m.pct >= 100).length}/${Object.keys(materials).length} resources complete`)

for (const m of list) { try { m.bot.quit() } catch { /* already gone */ } }
}
