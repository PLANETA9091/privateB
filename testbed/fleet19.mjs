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
import { pocketTotals, lootLedger, writeOffRow, bankedCraterDecode, unaccountedMassDecode, pocketAnatomyRow, surplusFaceRow, bankFlowRow, bankBudgetGapRow, bankAttributionRow, doomCensusRow, climbWhyClass, doomWhyRow } from '../src/lib/pocketline.mjs'
import { belowResidueRow } from '../src/lib/drops.mjs' // (v0.203.0) the sweep drop ledger's run-level row
import { createScout } from '../src/bots/scout.mjs'
import { WorldMap } from '../src/fleet/worldmap.mjs'
import { attachChatSync } from '../src/fleet/chatsync.mjs'
import { ClaimBoard, attachClaimSync, attachHazardSync } from '../src/fleet/claims.mjs'
import { HazardLedger } from '../src/lib/drowning.mjs'
import { WaterTableBoard } from '../src/lib/watertable.mjs'
import { attachMemoryGuard } from '../src/fleet/memory-guard.mjs'
import { APPROACH_THRESHOLD, approachWalk, yardApproachPlan } from '../src/lib/approach.mjs'
import { KEEP as DEPOSIT_KEEP, needsBanking, bankFallback, effectiveWalkBudget, inventoryLoad, bankTripDue, bankRefusalDue, fuelTripWanted, needsBankingTripViable, duskBankDue, midBankBudgetMs, finalBankBudgetMs, yardWalkBudgetMs, smeltClampSeconds, smeltChainReserve, bankRescueGate, YARD_CHEST_RADIUS, CHEST_DOOM_TTL_MS, walkRawToward } from '../src/lib/deposit.mjs'
import { finalBankDelayMs, hardKillDelayMs, endBankBudgetMs, prePositionDue, finalBankSchedule, climbRetryPlan, bankClimbRetry, finalBankDoomLatch, CLIMB_MIN_SLICE_MS, END_BANK_BUDGET_CAP_MS, FINAL_CLIMB_RESCUE_WAIT_MS, flowPriceClock } from '../src/lib/endphase.mjs'
import { mapTripTargets, oreSteerOrder, tierDeferOrder, planHave, planItemsOf } from '../src/fleet/materialplan.mjs'
import { pickOreTarget, rememberSkip } from '../src/fleet/oresteer.mjs'
import { ensureTools, ensureCampFurnace, campBuildTier, CAMP_BUILD_PUT_SECS, countItem, consolidateSurplus, craftPlanksFromLogs } from '../src/bots/tools.mjs'
import { sparePickCheck, craftSparePickaxe, bestPickTier, ORE_TIER_TABLE } from '../src/lib/toolupgrade.mjs'
import { standGoalNear, gotoSafe, pathThrottleStats, gotoSafeStats, walkRetryPlan, waitForWaterRescueClear, doomedGoalStats, walkGovernorStatsFor, goalBrakeStatsFor, setFleetGoalSweeper, withTimeout } from '../src/lib/jobqueue.mjs'
import { PATH_PRIO_BANK } from '../src/lib/pathsemaphore.mjs'
import { PILLAR_MAX_MS, verticalDoomPlan, quarryAscentPlan, steerFluidLock, sealCensus, sealPlan, sealCrossTarget, sealLanded, SEAL_PLACE_TIMEOUT_MS, SEAL_DIG_TIMEOUT_MS, walledCure, tunnelFluidName, routeRefusalLatch, wetShiftPlan, wetColumnMemoBlocked, WET_SHIFT_BLOCKS, WET_SHIFT_MIN_SLICE_MS, WET_SHIFT_TUNNEL_MAX_MS } from '../src/lib/surface.mjs'
import { recoveryDue, recoveryCooldownMs, tripDue, TRIP_WALK_MS, famineDue } from '../src/lib/woodplan.mjs'
import { smeltInventory, smeltablesIn, smeltZeroWhy, smeltFuelKeep, smeltInputKeep, sweepFinishedSmelts, sweepCensusLine, pickFuel } from '../src/lib/smelting.mjs'
import { withdrawFuelCommons, newCommonsMemory, deliverFuelTithe, fuelPocketOverage } from '../src/lib/fuelbank.mjs'
import { upgradeCheck, upgradeTools, keepForIron, PICK_TIERS, withdrawIronCommune, seedIronPool } from '../src/lib/toolupgrade.mjs'
import { swordCheck, craftSword } from '../src/lib/arms.mjs'
import { walkForbidden, surfaceHoldVerdict } from '../src/lib/nightsafety.mjs'
import { relootPlan, relootRetry, relootSurfaceY, relootSurfaceWhy, relootSurfaceRetry, relootRimDig, relootUnarmedVerdict, relootWriteoffLine, RELOOT_SURFACE_RISE_MAX, RELOOT_RETRY_RANGE, RELOOT_DESPAWN_MS } from '../src/lib/reloot.mjs'
import { wetChurnPlan, churnSwap, WET_CHURN_WINDOW_MS, WET_CHURN_COOLDOWN_MS } from '../src/lib/wetchurn.mjs' // (v0.223.0) the after-storm evacuation: the plan reads the bot's OWN rescue log, the swap prices the dry pass
import { dragonZoneAnchor, inDragonZone, dragonZoneExit, DRAGON_ZONE_EXIT_MS } from '../src/lib/dragonzone.mjs' // (v0.225.0) the kill zone: the anchor clusters the magic kills, the exit prices the walk out
import { duskBankPlan } from '../src/lib/duskbank.mjs' // (v0.229.0) the heavy pocket's priced dusk delivery: the plan landed v0.226.0, the wiring rides this lane
import { reconnectDelayMs } from '../src/lib/backoff.mjs'
import { snapshotStats, seedStats, sentryAttributionRow, rescueEconomyDecode, rescueHoleRow, stormDietRow, stormVerdictRow, airBarLedgerRow } from '../src/lib/statcarry.mjs'
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
// (v0.225.0) THE DRAGON DEATH REGISTRY - the fleet-shared log the death
// handlers ride into (the server verb + the corpse pos, capped by the
// module's DRAGON_DEATH_LOG_CAP). The zone is WORLD geography - the records
// must outlive every relog, so the array lives at the fleet scope and passes
// into each fresh miner by reference (the hazardLedger pattern).
const dragonDeaths = []
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
// (v0.330.0) THE DOOM CENSUS LEDGER: per-bot failed final-bank climb cycles,
// keyed by walker. The closure counter (v0.316.0) drives the latch in the
// moment but dies unread - this ledger lets the report read the strand's
// anatomy at the end (the doom census row).
const finalBankDoomByBot = new Map()
// (v0.336.0) THE DOOM-WHY LEDGER: the same failed cycles keyed by FAILURE
// CLASS (the census's WHY side - the walk-level WHO already lives above).
// Fed at the census's own increment site, printed by the doom-why row.
const finalBankDoomWhy = new Map()

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
  // be able to fire - the fuel read gates the reserve (only an explicit false
  // skips; a missing read keeps the legacy shape). The skip names itself once
  // here, riding the 'bank ' filter key - the next fleet sizes the class.
  // (v0.192.0) THE WOOD-FUEL GATE: the gate consults the furnace's OWN selector
  // (pickFuel, itemsNeeded 1 = the minimal-fire probe) instead of a coal-only
  // count. MEASURED (run46 = fleet 36195869446, the v0.190.0 union): 'smelt
  // hold skipped - no fuel in pocket (coal 0)' x3 (F10/F6/F8) while the same
  // bots' furnaces burned WOOD - F6: 'fuel clips the batch: 4 x oak_log
  // completes 6 of 33 x cobblestone' - and the leg died anyway (smelted 17 ->
  // 1; F8 'end-bank budget spent - smelt skipped' with raw_iron riding): the
  // gate was STRICTER than the furnace it prices. The probe inherits pickFuel's
  // reserve doctrine (planks 8 / logs 6 / sticks 2 - the tool-bootstrap wood is
  // never burned) and stays junk-safe: an unreadable pocket reads no plan ->
  // the skip (the v0.183.0 shape byte for byte).
  const fuelPlan = SMELT ? pickFuel(miner.bot, { itemsNeeded: 1 }) : null
  const pocketFuel = countItem(miner.bot, 'coal') + countItem(miner.bot, 'charcoal')
  const { reserveMs: smeltReserveMs, why: reserveWhy } = smeltChainReserve({ budgetMs, carriesSmeltables: carriesSmelt, hasFuel: fuelPlan != null, smeltBudgetSecs: SMELT_BUDGET })
  if (smeltReserveMs > 0) console.log(`${miner.username} bank: ${reserveWhy}`)
  else if (reserveWhy.startsWith('smelt hold skipped')) console.log(`${miner.username} bank: ${reserveWhy} (coal ${pocketFuel})`)
  const preSmeltRemaining = () => (smeltReserveMs > 0 ? Math.max(0, remaining() - smeltReserveMs) : remaining())
  const lootOpts = () => ({ keep: keep(true), budgetMs: preSmeltRemaining(), yardCenter: yardGoal, yardRadius: YARD_CHEST_RADIUS })
  // (v0.256.0) THE CHEST ASCENT EXECUTOR - the deposit hop loop's climb-before-skip
  // (the v0.255.0 ascent wired the 'bank:' walk form only; face 36346860061 F12's
  // CHEST SELECTION still refused every yard chest - 11x 'chest skip (vertical
  // doom: 27-29 levels up)' and a 219u death drop rode the deadline). The hook
  // rides the depositToChests opts: on a doomed chest it prices the climb with the
  // SAME quarryAscentPlan arithmetic (dy >= 8, the 45s slice + the 30s hop floor
  // funded by this chain's own clock), climbs toward the CHEST's level (climbOut -
  // the same machinery the final climb owns), and lets the gate re-evaluate from
  // the new altitude. Honest lines: 'chest ascent: <why> - climbing toward the
  // chest before the hop' / 'climbed +N levels (...) - the hop gets its route' /
  // 'refused (<why>) - the skip stands' / 'failed (<reason>) - the skip stands'.
  // Junk-safe: any unreadable shape returns false - the legacy skip byte for byte.
  const chestAscentHook = clockFn => async ({ chestPos, doom }) => {
    const cy = chestPos && Number.isFinite(chestPos.y) ? chestPos.y : null
    const plan = (() => {
      try {
        return quarryAscentPlan({ botY: miner.bot?.entity?.position?.y, yardY: cy, remainingMs: typeof clockFn === 'function' ? clockFn() : null })
      } catch { return { ascend: false, why: 'plan error' } }
    })()
    if (!plan.ascend) {
      console.log(`${miner.username} chest ascent: refused (${plan.why}) - the skip stands`)
      return false
    }
    // (v0.321.0) THE ROUTE REFUSAL LATCH: a route the memo has refused
    // ROUTE_REFUSAL_LATCH_CYCLES times is not asked again - the hook's
    // own climb is skipped and the legacy skip stands (fleet 36617588210:
    // F17 paid 21 instant refusals on one condemned column all run).
    const routeLatch = routeRefusalLatch({ refusedCycles: miner.bot?._routeRefusals })
    if (routeLatch.latched) {
      console.log(`${miner.username} chest ascent: route-latched after ${routeLatch.refused} refused climbs - the route is condemned, the skip stands`)
      return false
    }
    const dir = miner.bot?.entity && chestPos && Number.isFinite(chestPos.x) && Number.isFinite(chestPos.z)
      ? new Vec3(chestPos.x - miner.bot.entity.position.x, 0, chestPos.z - miner.bot.entity.position.z)
      : null
    const fenceAt = Date.now() + plan.climbMs
    console.log(`${miner.username} chest ascent: ${doom?.why ?? 'vertical doom'} - climbing toward the chest before the hop`)
    try {
      const cr = await miner.climbOut({ dir: dir || undefined, targetY: cy, force: true, maxMs: plan.climbMs, shouldStop: () => Date.now() > fenceAt })
      if (cr && !cr.ok && cr.memoRefusal) miner.bot._routeRefusals = (miner.bot._routeRefusals || 0) + 1 // (v0.321.0) one truth per bot: every memo-refused climb feeds the route latch
      if (cr && cr.ok) {
        console.log(`${miner.username} chest ascent: climbed +${cr.gained ?? '?'} levels (dug ${cr.dug ?? '?'}, ${cr.steps ?? '?'} steps) - the hop gets its route`)
        return true
      }
      console.log(`${miner.username} chest ascent: failed (${cr?.reason ?? 'no read'}) - the skip stands`)
      return false
    } catch (e) {
      console.log(`${miner.username} chest ascent: failed (${e?.message ?? 'error'}) - the skip stands`)
      return false
    }
  }
  // (v0.257.0) THE UPFRONT ASCENT EXECUTOR - the funding lever (face
  // 36350568199: the doom-time hook fired 3 honest refusals - 75s/29s of
  // leftover chain clock cannot fund the 45s climb + the 30s walk floor BY
  // DESIGN, the severance persisted with the arithmetic correct). The money
  // moves EARLIER: at deposit-leg start, with the leg's OWN clock at its
  // fattest, the SAME quarryAscentPlan arithmetic (dy >= 8 to the yard) prices
  // the climb INTO the leg's upfront budget - the hops then run from the
  // funded altitude where the strict doom gate reads lateral >= dy. The
  // v0.256.0 doom hook stays as the second line of defense (a partial upfront
  // climb composes: the doom hook re-prices from the new altitude with the
  // leftover). Silent on refusal (a shallow bot or a starved clock is the
  // COMMON shape - the fleet filter must not drown); the honest lines carry
  // the '(upfront)' tag and ride the existing 'chest ascent' filter key (the
  // tail doctrine - no new key). Junk-safe: any unreadable shape returns
  // false - the leg proceeds byte for byte.
  const chestAscentUpfront = clockFn => async ({ budgetMs } = {}) => {
    const yy = yardGoal && Number.isFinite(yardGoal.y) ? yardGoal.y : null
    const plan = (() => {
      try {
        return quarryAscentPlan({ botY: miner.bot?.entity?.position?.y, yardY: yy, remainingMs: typeof clockFn === 'function' ? clockFn() : null })
      } catch { return { ascend: false, why: 'plan error' } }
    })()
    if (!plan.ascend) return false
    // (v0.321.0) the route latch at the upfront leg: a condemned route is
    // never funded twice - the leg walks from here without asking.
    const routeLatch = routeRefusalLatch({ refusedCycles: miner.bot?._routeRefusals })
    if (routeLatch.latched) {
      console.log(`${miner.username} chest ascent (upfront): route-latched after ${routeLatch.refused} refused climbs - the route is condemned, the leg walks the whole route`)
      return false
    }
    console.log(`${miner.username} chest ascent (upfront): ${plan.why} - funding the climb before the leg's walks`)
    const dir = miner.bot?.entity && yardGoal
      ? new Vec3(yardGoal.x - miner.bot.entity.position.x, 0, yardGoal.z - miner.bot.entity.position.z)
      : null
    const fenceAt = Date.now() + plan.climbMs
    try {
      const cr = await miner.climbOut({ dir: dir || undefined, targetY: yy, force: true, maxMs: plan.climbMs, shouldStop: () => Date.now() > fenceAt })
      if (cr && !cr.ok && cr.memoRefusal) miner.bot._routeRefusals = (miner.bot._routeRefusals || 0) + 1 // (v0.321.0) the route latch's count
      if (cr && cr.ok) {
        console.log(`${miner.username} chest ascent (upfront): climbed +${cr.gained ?? '?'} levels (dug ${cr.dug ?? '?'}, ${cr.steps ?? '?'} steps) - the hop ladder is pre-funded`)
        return true
      }
      console.log(`${miner.username} chest ascent (upfront): failed (${cr?.reason ?? 'no read'}) - the leg walks from here`)
      return false
    } catch (e) {
      console.log(`${miner.username} chest ascent (upfront): failed (${e?.message ?? 'error'}) - the leg walks from here`)
      return false
    }
  }
  // cheap pre-deposit: a chest within 64 blocks banks instantly (early-run bots
  // dig near spawn); the verdict's reason also drives the yard-walk decision
  const pre = await miner.depositLoot({ ...lootOpts(), onVerticalDoom: chestAscentHook(preSmeltRemaining), preAscent: chestAscentUpfront(preSmeltRemaining) })
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
        // (v0.255.0) THE QUARRY ASCENT - the mid-run trip's own climb (the
        // final bank has owned its doom climb since v0.158.0; the mid-run trip
        // only logged the refusal while 1641u rode the deadline, face
        // 36340470441): when the yard stands mostly UP and the clock funds a
        // climb slice + the walk floor, climb TOWARD the yard's level first -
        // the legacy walk then runs from a level the ladder can route. A
        // refused/failed ascent keeps the legacy refusal line byte for byte.
        const ascent = (() => {
          try {
            return quarryAscentPlan({
              botY: miner.bot.entity?.position?.y,
              yardY: yardGoal?.y,
              remainingMs: preSmeltRemaining()
            })
          } catch { return { ascend: false, why: 'plan error' } }
        })()
        if (ascent.ascend) {
          // (v0.321.0) the route latch at the quarry ascent: a condemned
          // route is not climbed again - the walk owns the route (and dies
          // by its own gates, honestly named).
          const routeLatch = routeRefusalLatch({ refusedCycles: miner.bot?._routeRefusals })
          if (routeLatch.latched) {
            console.log(`${miner.username} quarry ascent: route-latched after ${routeLatch.refused} refused climbs - the route is condemned, the walk owns the route`)
          } else {
          const ascentDir = miner.bot?.entity && yardGoal
            ? new Vec3(yardGoal.x - miner.bot.entity.position.x, 0, yardGoal.z - miner.bot.entity.position.z)
            : null
          const fenceAt = Date.now() + ascent.climbMs
          console.log(`${miner.username} quarry ascent: ${ascent.why} - climbing toward the yard before the walk`)
          try {
            const cr = await miner.climbOut({ dir: ascentDir || direction, targetY: yardGoal.y, force: true, maxMs: ascent.climbMs, shouldStop: () => Date.now() > fenceAt })
            if (cr && !cr.ok && cr.memoRefusal) miner.bot._routeRefusals = (miner.bot._routeRefusals || 0) + 1 // (v0.321.0) the route latch's count
            if (cr && cr.ok) console.log(`${miner.username} quarry ascent: climbed +${cr.gained ?? '?'} levels (dug ${cr.dug ?? '?'}, ${cr.steps ?? '?'} steps) - the walk ladder gets its route`)
            else console.log(`${miner.username} quarry ascent: failed (${cr?.reason ?? 'no read'}) - the pocket rides the next window`)
          } catch (e) {
            console.log(`${miner.username} quarry ascent: failed (${e?.message ?? 'error'}) - the pocket rides the next window`)
          }
          }
        } else {
          console.log(`${miner.username} bank: ${doomAtWalk.why} - the walk ladder cannot climb, the pocket rides the next window`)
        }
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
        // (v0.193.0) THE FIRE-BATCH RUN-CLOCK CAP: the fire leg's batch never
        // exceeds what the RUN can complete + a 30s harvest margin - run82's
        // F8 fired 25 x raw_copper (~275s of burn) late in the run and the
        // sacred sweep rule kept every collector out while the input burned:
        // a guaranteed pocket loss. The cap keeps the remainder pocketed (the
        // honest partial); a non-fire leg reads no cap (null = the legacy shape).
        fireCapMs: fireLeg ? Math.max(0, RUN_KILL_AT - Date.now()) : null,
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
            allowRawOre: heldNow === 0, // (v0.239.0) THE FRAGMENT RELAY: only the recheck imports raw_iron (the pool keeps its stock; the next yard visit's smelt leg converts)
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
        }
        // (v0.197.0) THE CENSUS PRINTS ALWAYS - run82's blind spot #3: the
        // collected-only print buried every per-machine verdict (busy x2,
        // unreachable x1 - zero 'sweep:' rows for the whole run). The census
        // line keeps the v0.139.0 harvest shape byte for byte.
        console.log(sweepCensusLine(swept, { username: miner.username }))
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
  const res = await miner.depositLoot({ keep: keep(), budgetMs: remaining(), yardCenter: yardGoal, yardRadius: YARD_CHEST_RADIUS, onVerticalDoom: chestAscentHook(remaining), preAscent: chestAscentUpfront(remaining) })
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
  // (v0.203.0) THE DEATH CARRY - the re-loot record must survive the attempt
  // cycle the way the v0.18.9 stats carry does: run71 (fleet 36217424471,
  // the v0.202.0 debut) measured 12 deaths -> 2 evaluations -> 0 walks, and
  // F2 (t=546s) + F7 (t=568s) are the class why - died mid-run, the session
  // hit the end-phase gates, the retry rebuilt the miner, and the un-evaluated
  // record died with the old closure before the plan ever SAW the death.
  let deathCarry = null
  // (v0.316.0) THE SHAFT-BOTTOM DOOM LATCH: per-bot count of failed final-bank
  // climb cycles (the 'still underground' verdicts). From the 3rd entry the
  // chain is refused at the door - F9 printed the identical verdict 7x on face
  // 36592026195, each re-entry re-paying two fenced climbs on the same bottom.
  let finalBankDoomCycles = 0
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
        dragonDeaths, // (v0.225.0) shared dragon death registry: every fresh server verdict + corpse pos feeds the kill-zone anchor
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
        seedLastDeath: deathCarry, // (v0.203.0) the death carry rides the rebuild - the plan re-decides on the fresh pass
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
          // (v0.199.0) 'death drop' joins: the death-drop snapshot prints with
          // its own prefix - one keyword covers both shapes (the loss and the
          // honest empty read).
          // (v0.249.0) 'drown context' joins at the TAIL - the sequence pins
          // (drops.test, deposit-hop-doom.test) read the head band verbatim,
          // so the new key rides behind 'wood trip' and both pins stay whole.
          if (/combat|died|death drop|reloot|KICKED|error|climb|water|scan:|hop|chest skip|approach|swallowed|bank |deposit|torch|craft|smelt|fuel|vein sweep|wood trip|drown context|suffocate context|drowned-kill context|void context|steer tier defer|steer hazard|cobble tithe|quarry ascent|chest ascent|smelt tithe/.test(m)) console.log(`${name} ${m}`) // (v0.277.0) 'void context' joins the tail - the out-of-world class's first voice (two mute deaths: [117,-90,0], [118,-148,2])
        },
        // (v0.269.0) THE TORCH-COAL RESUPPLY - the pocket-closed torch economy's
        // cure (face 36374720492: 199 'no coal' skips while the tithe banked the
        // fleet's coal). The ask rides the SAME commons machinery as the smelt
        // leg's fuelResupply (yard walk, anchor-first, empty-chest memory) with
        // a TIGHTER budget: the ask fires mid-dig (the craft cadence), a 12s
        // slice keeps the dig loop's stall bounded, and cap 2 prices the
        // allowance exactly (2 coal = 8 torches). The ask line rides the
        // existing 'torch|craft' filter keys - no filter change.
        torchResupply: ({ itemsNeeded }) => withdrawFuelCommons(miner.bot, {
          itemsNeeded,
          yardCenter: yardGoal,
          memory: fuelCommonsMemory,
          budgetMs: 12000,
          cap: 2,
          log: m => console.log(`${miner.username} ${m}`)
        })
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
          // (v0.185.0) THE NIGHT LANE GATE: the pre-position IS a forced
          // surface walk (the climb + the 48+ block yard walk fire inside the
          // last 90s - run182's window overlapped the walk-forbidden clock),
          // and the v0.140.1 hold it ignored strands the pre-positioned bot
          // AT a dark yard when the final bank then holds: F18 died at
          // [-70,65,419] sheltering from a skeleton with a zombie@1.5 walking
          // in. Hold underground instead - the bot keeps digging to the last
          // second (bankableNow already says so) and the final-bank hold owns
          // the pocket. Junk clock walks (the legacy shape byte for byte).
          if (walkForbidden(miner.bot.time?.timeOfDay)) return false
          // (v0.304.0) THE DEEP PRE-POSITION WIRE: the vertical separation
          // rides the gate (prePositionDue's yardDy) - the shaft-bottom bot
          // standing under the yard reads a near straight-line dist while
          // its climb out costs the whole legacy window (7x 'final bank: 0
          // (still underground)' named the class). The night hold above
          // stays the owner in the dark; the junk position read falls
          // through to the legacy shallow shape byte for byte.
          const yardDy = Math.max(0, yardGoal.y - miner.bot.entity.position.y)
          return prePositionDue({
            remainingMs: deadline - Date.now(),
            yardDist: miner.bot.entity.position.distanceTo(yardGoal),
            yardDy
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
        if (!r.ok && r.memoRefusal) miner.bot._routeRefusals = (miner.bot._routeRefusals || 0) + 1 // (v0.321.0) the route latch's count (the door owns the gate)
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
        if (!r.ok && r.memoRefusal) miner.bot._routeRefusals = (miner.bot._routeRefusals || 0) + 1 // (v0.321.0) the route latch's count (the door owns the gate)
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
      let wetEvacUntil = 0 // (v0.223.0) the churn evacuation's exit clock - the plan owns it, the wiring only carries it (it survives relogs: the stance rides the runner, the cadence rides the client)
      let duskTripUntil = 0 // (v0.229.0) the dusk-bank plan's exit clock - the plan owns it, the wiring only carries it (the churn clock's shape)
      let lastBankTripMs = NaN // (v0.229.0) the wiring's MEASURED bank trip (the last DELIVERED chain's wall time) - the dusk plan prices with it; NaN = unmeasured, the plan reads no-time (it never prices a guess)
      let bankRescueAnnounced = false // (v0.295.0) the rescue-clock gate's announce edge - one deferral line per rescue window, the hold passes stay silent (the churn hold's shape)
      let churnHoldAnnounced = false // (v0.223.0) the arm/release story: one line each, the hold passes stay silent
      // (v0.293.0) THE CHURN INTRA-GOAL READ - the boundary consult's blind
      // spot closed. Face 36476752446: F3/F11/F13 took 12-17 rescues each in
      // the flooded quarry while ZERO 'evacuation armed' lines printed - the
      // drip strikes INSIDE one long digShaft (the water-table rotations
      // 'the caller rotates' keep the goal open for minutes), and the
      // goal-boundary consult never reads a full window. The dig loops read
      // the plan LIVE through their shouldStop hooks: the go verdict stops
      // the dig cooperatively, the loop's next pass consults the same plan
      // and arms the evacuation (the announce once, the cooldown owns the
      // exit, the rescue machinery untouched - the read is the pure plan's
      // own, no new state, no new constants; the carry-clock respected - a
      // holding evacuation reads .go=false, the dig never stops for churn
      // while an evacuation is already live).
      const churnDueNow = () => {
        try {
          const events = miner.wetRescueEvents?.() ?? []
          return wetChurnPlan({ rescueEvents: events, now: Date.now(), evacUntil: wetEvacUntil }).go === true
        } catch { return false }
      }
      let dragonEvacAnnounced = false // (v0.225.0) the zone-entry story: one line per entry, the flag resets when the bot reads out
      let lastWoodAt = 0 // (v0.179.0) stick-famine cadence: 0 = the whole run counts as elapsed (a starving pocket trips on the first daylight check)
      const veerSkipped = new Set() // (v0.18.8) ore positions this bot already steered at and did not reach
      const tierDeferSeen = new Set() // (v0.252.0) the tier-defer steer's memory: one verdict line per ore name per trip (the lastNightLog shape)
      const hazardDeferSeen = new Set() // (v0.253.0) the hazard-defer steer's memory: one verdict line per held/tail pos per trip
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
          steer = (() => {
            // (v0.252.0) THE TIER-DEFER STEER: the deficit order still elects, but ores
            // the current pick cannot HARVEST defer to the tail (the guard would refuse
            // their cells every pass - the wooden bot must not burn its walks on iron
            // the v0.251.0 guard keeps whole). The tail keeps the option: the upgrade
            // rung restores the lead, a lone deferred vein still gets a walk when
            // nothing harvestable is near. One verdict line per NEW deferred name per
            // trip names the class for the decode.
            const steerOrder = tierDeferOrder(
              oreSteerOrder({ progress: materialsProgress(), ores: STEER_ORES }),
              bestPickTier(miner.bot),
              ORE_TIER_TABLE
            )
            const fresh = steerOrder.deferred.filter(n => !tierDeferSeen.has(n))
            if (fresh.length) {
              fresh.forEach(n => tierDeferSeen.add(n))
              console.log(`${name} steer tier defer: ${fresh.join(', ')} deferred - the pick cannot harvest the drops (the tail keeps the option, the upgrade rung restores the lead)`)
            }
            return pickOreTarget({
              candidates: oreCands,
              from: { x: steerFrom.x, y: steerFrom.y, z: steerFrom.z },
              skip: veerSkipped,
              priorities: steerOrder.order,
              // (v0.253.0) THE HAZARD-DEFER STEER: the shared ledger's death spots
              // gate the APPROACH side (the flee/dig/wet-trip sides already honor
              // it) - a vein inside the killing band loses to every clean vein,
              // the tail keeps the option (nothing clean = the best near still
              // elects). One verdict line per NEW pos per trip names the class.
              hazardNear: pos => hazardLedger.near(pos)
            })
          })()
          // (v0.253.0) the hazard-defer verdicts, the lastNightLog anti-spam shape
          if (steer?.hzHeld) {
            const h = steer.hzHeld
            const key = `${h.name}@${Math.floor(h.pos.x)},${Math.floor(h.pos.y)},${Math.floor(h.pos.z)}`
            if (!hazardDeferSeen.has(key)) {
              hazardDeferSeen.add(key)
              console.log(`${name} steer hazard defer: ${key} held behind the ledger (d ${h.dist}) - the clean veins led (a death is a cost the deficit cannot repay, the tail keeps the option)`)
            }
          } else if (steer?.hz) {
            const key = `${steer.name}@${Math.floor(steer.pos.x)},${Math.floor(steer.pos.y)},${Math.floor(steer.pos.z)}`
            if (!hazardDeferSeen.has(key)) {
              hazardDeferSeen.add(key)
              console.log(`${name} steer hazard tail: ${key} walked past the ledger (d ${steer.dist}) - nothing clean within reach (the tail keeps the option)`)
            }
          }
        }
        // (v0.240.0) THE WATER-LOCK PREFLIGHT - run36310927991's famine root: 13
        // iron/copper steers were announced, every steered tunnel landed done=0
        // (the first cut IS the water-table break) and the veins burned in
        // veerSkipped with raw_iron=0 for the whole run. The step-1 cell along
        // the steer axis is readable BEFORE the tunnel burns: when it opens on
        // fluid the vein sits behind live water from this stance - stand off,
        // name the verdict, and hand the pass to the blind rotation (the tunnel's
        // first job is still MOVEMENT). The vein stays burned (the amnesia cap is
        // the relief valve) but the 0-block steered tunnel never runs - the
        // verdict line tells the next decode exactly which vein class drowned.
        const blindDirs = [new Vec3(1, 0, 0), new Vec3(0, 0, 1), new Vec3(-1, 0, 0), new Vec3(0, 0, -1)]
        if (steer) {
          const steerStep = new Vec3(steer.axis === 'x' ? steer.dir : 0, 0, steer.axis === 'z' ? steer.dir : 0)
          const steerFrom0 = miner.bot.entity.position.floored()
          const lockFeet = miner.bot.blockAt(steerFrom0.offset(steerStep.x, 0, steerStep.z))
          const lockHead = miner.bot.blockAt(steerFrom0.offset(steerStep.x, 1, steerStep.z))
          // (v0.242.0) THE FLUID NAME LAW: the 26.2 registry's water/lava carry
          // boundingBox "empty" (water id 35, lava id 36), so the v0.241.0
          // box-only preflight fired ZERO locks while the tunnels ate 23
          // '[names gate water]' zeros - run36314614666's exact blind spot. The
          // name is the second eye (isWaterName, the drowning family).
          if (steerFluidLock({ feetBox: lockFeet?.boundingBox ?? null, headBox: lockHead?.boundingBox ?? null, feetName: lockFeet?.name ?? null, headName: lockHead?.name ?? null })) {
            console.log(`${name} tunnel: steer ${steer.name} @ ${steer.dist}b is water-locked (fluid at step 1, cross ${steer.cross}) - the blind rotation owns this pass`)
            // (v0.244.0) THE SEAL CENSUS - run36317889503 named the seal-and-cross
            // frontier (the ore sits behind fluid at step 1, the famine three runs
            // straight); the relay canon says TELEMETRY BEFORE CURE: the field line
            // answers whether the standing bot even carries sealable stock when the
            // lock fires - blocks in pocket arms the placement cure, a bare pocket
            // moves the frontier to the bring-stock class (the torch-famine shape).
            const census = sealCensus({ fluidNames: [lockFeet?.name ?? null, lockHead?.name ?? null], pocket: (miner.bot.inventory?.items?.() ?? []) })
            console.log(`${name} tunnel: water-lock census: ${census.fluid ?? 'unclassified'} at step 1, ${census.blocks} sealable in pocket${census.top ? ` (top ${census.top})` : ''} - the seal-and-cross frontier is ${census.sealable ? 'ARMED' : 'bare'}`)
            // (v0.245.0) THE SEAL GEOMETRY - the census answered the canon's first
            // question (stock in pocket), the geometry answers the second: CAN the
            // standing bot place into the step-1 fluid cell from where it stands?
            // The ANCHOR is the face the placement clicks (the floor under the
            // fluid cell; a wet/air cell below offers none - the pillar-up class)
            // and the HEADROOM is the cell the bot's body needs after hopping the
            // seal (solid there makes the seal a WALL - the dig-around class).
            // Water only: the census already refused lava (the placement burns,
            // not seals) and the geometry is moot behind a refused seal. The eyes
            // follow the v0.242.0 law - box first, name second; a blind read
            // reports 'unknown' instead of inventing geometry.
            if (census.fluid === 'water') {
              const feetWet = (lockFeet?.boundingBox === 'fluid') || tunnelFluidName(lockFeet?.name ?? null) // the fluid cell sits at feet level
              const anchorB = feetWet ? miner.bot.blockAt(steerFrom0.offset(steerStep.x, -1, steerStep.z)) : lockFeet // head-level lock: the solid feet cell IS the anchor
              let headroomB = feetWet ? lockHead : miner.bot.blockAt(steerFrom0.offset(steerStep.x, 2, steerStep.z)) // head-level lock: the cell above it owns the body
              let plan = sealPlan({ anchorName: anchorB?.name ?? null, anchorBox: anchorB?.boundingBox ?? null, headroomName: headroomB?.name ?? null, headroomBox: headroomB?.boundingBox ?? null })
              console.log(`${name} tunnel: seal plan: anchor ${plan.anchor ? 'solid' : 'open'}, headroom ${plan.headroom ? 'clear' : 'solid'} - the seal-and-cross is ${plan.plan}`)
              // (v0.250.0) THE WALLED DIG-AROUND - the walled verdict (4 pooled
              // firings across two faces, every one kept the standoff and the
              // vein burned) is a BLOCKER, not a fate: the headroom cell is
              // ordinary gallery stone in every observed firing. The cure: dig
              // the headroom, re-plan, and the buildable seal may follow - the
              // same gate then owns BOTH paths (the direct buildable and the
              // post-dig buildable). The gates: the pure walledCure (the
              // two-eye law - a blind box digs nothing blind, a fluid name
              // vetoes), the pick gate (the reloot rim-dig house pattern - an
              // unarmed swing stays down), the 8s dig cap. Every refusal names
              // its why; the failed/uncured cases fall to the legacy standoff
              // byte for byte (the amnesia cap stays the relief valve).
              if (census.sealable && plan.plan === 'walled') {
                const cure = walledCure({ plan, headroomName: headroomB?.name ?? null, headroomBox: headroomB?.boundingBox ?? null })
                if (!cure.dig) {
                  console.log(`${name} tunnel: seal dig-around refused: ${cure.why} - the legacy standoff owns this pass`)
                } else if (!hasPickNow()) {
                  console.log(`${name} tunnel: seal dig-around skipped (unarmed - the swing stays down, the standoff owns this pass)`)
                } else {
                  try {
                    await withTimeout(miner.bot.dig(headroomB), SEAL_DIG_TIMEOUT_MS, 'seal dig-around')
                    console.log(`${name} tunnel: seal dig-around: dug the headroom ${headroomB?.name ?? '?'} - re-planning the seal`)
                    const anchorB2 = feetWet ? miner.bot.blockAt(steerFrom0.offset(steerStep.x, -1, steerStep.z)) : lockFeet
                    headroomB = feetWet ? miner.bot.blockAt(steerFrom0.offset(steerStep.x, 1, steerStep.z)) : miner.bot.blockAt(steerFrom0.offset(steerStep.x, 2, steerStep.z))
                    plan = sealPlan({ anchorName: anchorB2?.name ?? null, anchorBox: anchorB2?.boundingBox ?? null, headroomName: headroomB?.name ?? null, headroomBox: headroomB?.boundingBox ?? null })
                    console.log(`${name} tunnel: seal plan (post-dig): anchor ${plan.anchor ? 'solid' : 'open'}, headroom ${plan.headroom ? 'clear' : 'solid'} - the seal-and-cross is ${plan.plan}`)
                  } catch (e) {
                    console.log(`${name} tunnel: seal dig-around failed: ${e.message} - the legacy standoff owns this pass`)
                  }
                }
              }
              // (v0.247.0) THE CROSSING - the canon satisfied, the cure ships GATED:
              // census ARMED (the material rides, 16/16 in the census face) AND the
              // geometry buildable (this face's own verdict) - only then does the
              // bot place. The shelter's proven seal pattern (sealWaitUnseal):
              // equip, 5 ticks, place against the anchor's UP face, 10 ticks,
              // verify the cell went solid; two rounds with the pause between (the
              // entity-occupied-cell rejection, measured live by the shelter).
              // A LANDED SEAL KEEPS THE STEER ALIVE - the vein is reachable, the
              // stand-off never fires and the vein never burns (the whole famine
              // arc in one branch). Every refusal logs its reason for the decode.
              if (census.sealable && plan.plan === 'buildable') {
                let crossed = false
                const tgt = sealCrossTarget({ feetWet })
                const target = steerFrom0.offset(steerStep.x, tgt.targetDy, steerStep.z)
                const item = (miner.bot.inventory?.items?.() ?? []).find(i => i && i.name === census.top) // the richest sealable stack, the census's own pick
                if (item) {
                  for (let round = 0; round < 2 && !crossed; round++) {
                    if (round > 0) await miner.bot.waitForTicks(6)
                    try {
                      const anchor = miner.bot.blockAt(target.offset(0, -1, 0)) // the cell below the target - the face the placement clicks (anchorDy = targetDy - 1)
                      if (!anchor || anchor.boundingBox !== 'block') break // the geometry moved under us - the plan is stale, stand off
                      await miner.bot.equip(item, 'hand')
                      await miner.bot.waitForTicks(5)
                      await withTimeout(miner.bot.placeBlock(anchor, new Vec3(tgt.face.x, tgt.face.y, tgt.face.z)), SEAL_PLACE_TIMEOUT_MS, 'seal-cross place')
                      await miner.bot.waitForTicks(10)
                      const after = miner.bot.blockAt(target)
                      if (sealLanded({ afterName: after?.name ?? null, afterBox: after?.boundingBox ?? null })) crossed = true
                    } catch { /* the round's refusal - one more round, then the standoff */ }
                  }
                }
                if (crossed) {
                  console.log(`${name} tunnel: seal-and-cross CROSSED: ${census.top} sealed the step-1 fluid - the steered line resumes`)
                } else {
                  console.log(`${name} tunnel: seal-and-cross refused: ${item ? 'the seal did not land (2 rounds)' : `no ${census.top} in the pocket to place`} - the blind rotation owns this pass`)
                  rememberSkip(veerSkipped, `${steer.pos.x},${steer.pos.y},${steer.pos.z}`)
                  steer = null
                }
              } else {
                rememberSkip(veerSkipped, `${steer.pos.x},${steer.pos.y},${steer.pos.z}`)
                steer = null
              }
            } else {
              rememberSkip(veerSkipped, `${steer.pos.x},${steer.pos.y},${steer.pos.z}`)
              steer = null
            }
          }
        }
        const tdir = steer
          ? new Vec3(steer.axis === 'x' ? steer.dir : 0, 0, steer.axis === 'z' ? steer.dir : 0)
          : blindDirs[shaft % 4]
        if (steer) console.log(`${name} tunnel: steering ${steer.name} @ ${steer.dist}b (axis ${steer.axis}${steer.dir > 0 ? '+' : '-'}${steer.dir < 0 ? steer.dir : ''}, cross ${steer.cross}, ${reason})`)
        try {
          const tres = await miner.tunnel(tdir, { maxBlocks: 12, names: namesFor(true), shouldStop: () => Date.now() > deadline || churnDueNow() }) // (v0.293.0) the steered tunnel is the other wet-prone lane - the same live read
          console.log(`${name} tunnel: ${tres.done} blocks (branch mine at the floor${steer ? ', steered' : ''}, ${reason})${tres.done === 0 && tres.zeroWhy ? ` [${tres.zeroWhy}]` : ''}`)
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
        // (v0.201.0) THE RE-LOOT WALK - the death economy's field debut.
        // run63-mined (fleet 36212235363) measured ~227u of NAMED death drops
        // (the v0.199.0 line) SURVIVING PAST THE RUN'S END: the deaths landed
        // t-176s/t-131s, vanilla despawn is 300s, nobody walked back, the
        // stacks died with the world reset, and the ledger's unaccounted=0
        // hid the loss inside the conversion formula's slack. The cure is ONE
        // planned walk per death, decided by relootPlan's six named fences
        // (pure, src/lib/reloot.mjs - no-spot/attempted/expired/no-bot/
        // too-far/no-time). The runner adds the two fences the plan cannot
        // see: the walk is ARMED (a pick in hand - the v0.140.1 lesson: an
        // unarmed surface walk at dusk is the respawn-bootstrap class) and
        // DAYLIGHT (the v0.185.0 night-hold shape - a held re-loot rides out
        // the dark, the drops die, the bot lives; the despawn window is
        // shorter than the night, so a held walk is honestly dead). The walk
        // rides the loop's own serialization (no concurrent goal churn - the
        // goal-brake lesson), one gotoSafe with the plan's dist-scaled budget
        // and GoalNear range 2 (the v0.178.0 below-plane lesson: the drops
        // sit in the freed cell / down the fresh shaft). The arrival read
        // counts the item stacks in pickup reach - silence is never evidence.
        // (v0.203.0) THE RETRY-STORM LAW, REFINED: every TERMINAL verdict (a
        // plan refusal, the night hold, the walk itself) marks attempted
        // BEFORE it acts - one walk per death. The unarmed read is a DELAY,
        // not a verdict: run71's 2/2 debut evaluations read unarmed at
        // t+45s/t+61s (the respawn bootstrap owns the respawned bot's hands)
        // and the one-shot mark starved the walk forever - 12 deaths, 0
        // walks, ~1443u dropped. It flips nothing; the plan read re-arms next
        // pass and the plan's own clock fences (expired/no-time) terminate
        // the lane when the window runs out. A second death re-arms with the
        // fresh spot.
        const relootDeath = miner.lastDeath?.() ?? null
        if (relootDeath && !relootDeath.attempted) {
          let rp = null
          try {
            rp = relootPlan({
              spot: relootDeath.spot,
              deathAt: relootDeath.at,
              now: Date.now(),
              botPos: miner.bot.entity
                ? { x: miner.bot.entity.position.x, y: miner.bot.entity.position.y, z: miner.bot.entity.position.z }
                : null
            })
          } catch { rp = { go: false, why: 'no-spot' } }
          if (!rp.go) {
            relootDeath.attempted = true
            console.log(`${name} reloot: no walk (${rp.why})`)
          } else if (!hasPickNow() && relootUnarmedVerdict({ deathAt: relootDeath.at, now: Date.now() }).defer) {
            // (v0.203.0) THE DELAY CLASS - a delay, not a verdict: the read
            // re-arms for the next loop pass (the retry-storm law is
            // untouched - the WALK still fires at most once, attempted flips
            // before gotoSafe; the clock fences own the eventual expiry).
            // (v0.261.0) THE UNARMED GRACE bounds the delay: face 36359454749
            // attempt 1 caught F7 deferring x7 across t+2s..t+76s while every
            // recovery burned on the woodless pocket and the death kit
            // (planks 7-16, sticks 6, cobble 24-54) despawned unclaimed - the
            // reloot waited for arms, the arms waited for wood, the wood was
            // gone. The verdict defers through the bootstrap's first 90s
            // window; past it this branch falls through to the walk lane
            // (the night fence still owns the surface) and the salvage walk
            // re-arms from the death drops themselves.
            console.log(`${name} reloot: no walk (unarmed) - the empty pocket bootstraps first, the read re-arms (a delay, not a verdict)`)
          } else if (walkForbidden(miner.bot.time?.timeOfDay)) {
            relootDeath.attempted = true
            console.log(`${name} reloot: no walk (night) - the walk-forbidden window owns the surface, the drops ride out their clock`)
          } else {
            relootDeath.attempted = true
            // (v0.261.0) an unarmed stance here IS the escalation: the grace
            // expired with the pocket still empty, the walk re-arms from the
            // death drops (the marker rides the walking line for the census).
            const relootUnarmedEscalation = !hasPickNow()
            console.log(`${name} reloot: walking to the own death spot [${rp.goal.x},${rp.goal.y},${rp.goal.z}] (${Math.round(rp.dist)}b, budget ${(rp.budgetMs / 1000).toFixed(0)}s, window ${(rp.windowMs / 1000).toFixed(0)}s${relootUnarmedEscalation ? ', the unarmed escalation' : ''})`)
            const relootT0 = Date.now()
            try {
              await gotoSafe(miner.bot, standGoalNear(miner.bot, goals, rp.goal.x, rp.goal.y, rp.goal.z, { range: rp.range }), { timeoutMs: rp.budgetMs, label: 'reloot' })
              let stacks = 0
              try {
                const me = miner.bot.entity.position
                for (const e of Object.values(miner.bot.entities)) {
                  if (!e || e.name !== 'item' || !e.position || e.isValid === false) continue
                  if (e.position.distanceTo(me) <= 2.5) stacks++
                }
              } catch { /* a junk entity read reads zero stacks */ }
              console.log(`${name} reloot: arrived in ${((Date.now() - relootT0) / 1000).toFixed(0)}s - ${stacks} item stack(s) in reach${stacks ? '' : ' - nothing left (picked up or despawned)'}`)
            } catch (e) {
              // (v0.207.0) THE WET-COLUMN RETRY - run68's two debut walks (F4,
              // F10) both died 'No path to the goal!': the death spots sit in
              // the flooded-quarry wet columns and the dry pathfinder refuses
              // to aim a range-2 sphere INTO the water. The pure classifier
              // (relootRetry, src/lib/reloot.mjs) grants ONE widened retry for
              // the GEOMETRY-refusal class only - a walk-budget timeout is
              // saturation, a doomed-goal or water-rescue refusal is the
              // consult's own verdict, and neither answers differently for a
              // wider sphere. The retry re-issues ONCE with doomedRearm: the
              // no-path verdict LEDGERS the goal cell (the jobqueue's
              // dead-geometry record), so without the re-arm the consult
              // kills the retry for free before the A* ever thinks. The
              // arrival read widens WITH the range so the 0-stack verdict
              // stays honest: stacks inside the sphere but beyond the magnet
              // are the drops SURVIVING out of reach - the next cure's
              // evidence, not a pickup claim.
              const rr = relootRetry({
                message: e?.message,
                retries: 0,
                elapsedMs: Date.now() - relootT0,
                budgetMs: rp.budgetMs,
                windowMs: rp.windowMs
              })
              if (!rr.go) {
                console.log(`${name} reloot: walk failed (${e.message}) - the drops stay lost${rr.why === 'not-no-path' ? '' : ` (no retry: ${rr.why})`}`)
              } else {
                console.log(`${name} reloot: no-path retry at range ${rr.range} (budget ${(rr.budgetMs / 1000).toFixed(0)}s) - the dry rim inside the sphere counts as arrival`)
                const retryT0 = Date.now()
                try {
                  await gotoSafe(miner.bot, standGoalNear(miner.bot, goals, rp.goal.x, rp.goal.y, rp.goal.z, { range: rr.range }), { timeoutMs: rr.budgetMs, label: 'reloot retry', doomedRearm: true })
                  let stacks = 0
                  try {
                    const me = miner.bot.entity.position
                    for (const ent of Object.values(miner.bot.entities)) {
                      if (!ent || ent.name !== 'item' || !ent.position || ent.isValid === false) continue
                      if (ent.position.distanceTo(me) <= rr.range) stacks++
                    }
                  } catch { /* a junk entity read reads zero stacks */ }
                  console.log(`${name} reloot: retry arrived in ${((Date.now() - retryT0) / 1000).toFixed(0)}s - ${stacks} item stack(s) within ${rr.range}${stacks ? ' (in read reach - the magnet takes what it can)' : ' (none in read reach - gone, or floating beyond the sphere)'}`)
                } catch (e2) {
                  // (v0.211.0) THE SURFACE WIRING - the ladder's third leg,
                  // wired inside the wide retry's own catch (the field
                  // sequence is strict: walk -> wide retry -> surface, and
                  // the surface only fires when the wide retry ALSO died of
                  // GEOMETRY - a budget timeout means the sphere was
                  // converging and the gate refuses it honestly). run55
                  // named the shape: F17's spot sits at the flooded quarry
                  // bottom and the drops FLOAT - the reachable goal is the
                  // water SURFACE cell, not a wider sphere. The runner reads
                  // the death column bottom-up from the spot (bot.blockAt,
                  // capped RELOOT_SURFACE_RISE_MAX, {y, name} pairs), the
                  // scanner names the first air above the fluid, and the
                  // gate prices the walk on the surface cell with the SAME
                  // plan arithmetic (the 128 envelope, the despawn window,
                  // the margin). ONE gotoSafe rides it with doomedRearm:
                  // true - the wide retry LEDGERED the cell family too. A
                  // junk world read reads an empty column - the scanner
                  // refuses and the death stays terminal.
                  // (v0.221.0) the death column read rides OUTSIDE the gate's
                  // try: every block read is individually guarded, so the
                  // hoist is behavior-identical - and the SAME column now
                  // feeds both the scanner and the rim dig below (the
                  // coherence law: one read, two consumers, zero drift).
                  const column = []
                  for (let i = 0; i <= RELOOT_SURFACE_RISE_MAX; i++) {
                    let blockName = null
                    try {
                      const b = miner.bot.blockAt(new Vec3(rp.goal.x, rp.goal.y + i, rp.goal.z))
                      blockName = b?.name ?? null
                    } catch { blockName = null }
                    column.push({ y: rp.goal.y + i, name: blockName })
                  }
                  const rs = (() => {
                    try {
                      return relootSurfaceRetry({
                        message: e2?.message,
                        retries: 1,
                        surfaceY: relootSurfaceY({ column }),
                        surfaceWhy: relootSurfaceWhy({ column }),
                        spot: relootDeath.spot,
                        deathAt: relootDeath.at,
                        now: Date.now(),
                        botPos: miner.bot.entity
                          ? { x: miner.bot.entity.position.x, y: miner.bot.entity.position.y, z: miner.bot.entity.position.z }
                          : null
                      })
                    } catch { return { go: false, why: 'no-surface' } }
                  })()
                  if (!rs.go) {
                    console.log(`${name} reloot: retry failed (${e2.message}) - the drops stay lost${rs.why === 'not-no-path' ? '' : ` (no surface: ${rs.subWhy || rs.why})`}`)
                    if (!(rs.why === 'no-surface' && rs.subWhy === 'sealed')) {
                      // (v0.280.0) THE WRITE-OFF STAMP - the no-surface class's first voice: the
                      // stake (the death event's stored pocket read), the age vs the despawn
                      // window, and the full ladder trace on ONE line (the terminal log above
                      // stays byte-identical - the sequence law). The sealed class keeps its
                      // own per-leg logs - the rim dig owns its salvage below.
                      try {
                        console.log(relootWriteoffLine({
                          tag: name,
                          goal: rp.goal,
                          pocketU: relootDeath.pocketU,
                          ageMs: Date.now() - relootDeath.at,
                          despawnMs: RELOOT_DESPAWN_MS,
                          walkWhy: e?.message,
                          retryWhy: e2?.message,
                          surfaceWhy: rs.subWhy || rs.why
                        }))
                      } catch { /* the write-off must never break the ladder */ }
                    }
                    // (v0.221.0) THE RIM DIG WIRING - the ladder's fourth leg,
                    // wired inside the surface gate's own refusal (the field
                    // sequence is strict: walk -> wide retry -> surface scan
                    // -> THE DIG, and the dig only fires when the scan
                    // refused 'sealed' - the v0.213.0 census class this leg
                    // was priced for). MEASURED (run 36248025944, F13): the
                    // sealed pool's drops FLOAT under a solid cap, untouchable
                    // by every walk the ladder owns - the cure is a DIG, not a
                    // walk: the stance lands on the dry cap (pathfinder-legal
                    // by construction, the v0.207.0 wet-aim class cannot
                    // apply), the dig opens the seal, the water column rises,
                    // the floating stacks lift into pickup reach. THE STANCE
                    // GUARD IS THE LAW: the dig must never open the column
                    // the bot stands on - the guard verifies the stance's own
                    // column differs, re-stances ONE BLOCK OUT on the first
                    // standable neighbor when the walk landed on the cap (the
                    // common shape: GoalNear range 2's nearest standable IS
                    // the cap's top), and HOLDS (no swing, honest log) when no
                    // standable neighbor exists. The dig itself re-fences the
                    // despawn window at swing time (the walk spent its clock;
                    // a bare-hand dig on stone is ~8s and the float wait adds
                    // more) and checks the arm (the delay law does not
                    // re-enter here - the ladder lives inside this catch, so
                    // an unarmed read is honestly terminal, not a delay).
                    if (rs.why === 'no-surface' && rs.subWhy === 'sealed') {
                      const RELOOT_RIM_FLOAT_MS = 5000 // the opened cell fills and vanilla lifts the stacks in ~1-2s; 5s is the generous read
                      const RELOOT_RIM_DIG_MIN_MS = 20000 // the swing-time window fence: bare-hand dig ~8s + the float wait + the read
                      const RESTANCE_BUDGET_MS = 15000 // one block out - the walk-envelope law at its smallest
                      const rd = (() => {
                        try {
                          return relootRimDig({
                            column,
                            spot: relootDeath.spot,
                            deathAt: relootDeath.at,
                            now: Date.now(),
                            botPos: miner.bot.entity
                              ? { x: miner.bot.entity.position.x, y: miner.bot.entity.position.y, z: miner.bot.entity.position.z }
                              : null
                          })
                        } catch { return { go: false, why: 'no-column' } }
                      })()
                      if (!rd.go) {
                        console.log(`${name} reloot: rim dig refused (${rd.why}) - the drops stay lost`)
                      } else {
                        console.log(`${name} reloot: rim dig at [${rd.goal.x},${rd.goal.y},${rd.goal.z}] (cap y${rd.capY}, dig target [${rd.digTarget.x},${rd.digTarget.y},${rd.digTarget.z}], budget ${(rd.budgetMs / 1000).toFixed(0)}s, window ${(rd.windowMs / 1000).toFixed(0)}s) - the seal opens, the floats lift`)
                        const rimT0 = Date.now()
                        try {
                          await gotoSafe(miner.bot, standGoalNear(miner.bot, goals, rd.goal.x, rd.goal.y, rd.goal.z, { range: rd.range }), { timeoutMs: rd.budgetMs, label: 'reloot rim dig', doomedRearm: true })
                          // THE STANCE GUARD - verify, re-stance, or hold.
                          const solidCell = b => b && typeof b.name === 'string' && !/^(air|cave_air|void_air)$/.test(b.name) && !/water|lava|kelp|seagrass|bubble_column/.test(b.name)
                          const airyCell = b => b && typeof b.name === 'string' && /^(air|cave_air|void_air)$/.test(b.name)
                          const meDig = miner.bot.entity.position
                          let stanceOk = !(Math.floor(meDig.x) === rd.digTarget.x && Math.floor(meDig.z) === rd.digTarget.z)
                          if (!stanceOk) {
                            for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                              const nx = rd.digTarget.x + dx
                              const nz = rd.digTarget.z + dz
                              let ground = null; let feet = null; let head = null
                              try {
                                ground = miner.bot.blockAt(new Vec3(nx, rd.capY, nz))
                                feet = miner.bot.blockAt(new Vec3(nx, rd.capY + 1, nz))
                                head = miner.bot.blockAt(new Vec3(nx, rd.capY + 2, nz))
                              } catch { /* a junk read is not a stance */ }
                              if (!(solidCell(ground) && airyCell(feet) && airyCell(head))) continue
                              try {
                                await gotoSafe(miner.bot, standGoalNear(miner.bot, goals, nx, rd.capY + 1, nz, { range: 1 }), { timeoutMs: RESTANCE_BUDGET_MS, label: 'reloot rim stance', doomedRearm: true })
                                const me2 = miner.bot.entity.position
                                stanceOk = !(Math.floor(me2.x) === rd.digTarget.x && Math.floor(me2.z) === rd.digTarget.z)
                              } catch { stanceOk = false }
                              break
                            }
                          }
                          if (!stanceOk) {
                            console.log(`${name} reloot: rim dig held - the stance owns the dig column and no neighbor reads standable, no swing (the guard holds)`)
                          } else {
                            const windowLeft = (relootDeath.at + RELOOT_DESPAWN_MS) - Date.now()
                            if (windowLeft < RELOOT_RIM_DIG_MIN_MS) {
                              console.log(`${name} reloot: rim dig refused (no-time: ${(windowLeft / 1000).toFixed(0)}s left, the dig+float needs ${(RELOOT_RIM_DIG_MIN_MS / 1000).toFixed(0)}s)`)
                            } else if (!hasPickNow()) {
                              console.log(`${name} reloot: rim dig skipped (unarmed - the swing stays down, the drops ride out their clock)`)
                            } else {
                              let capBlock = null
                              try { capBlock = miner.bot.blockAt(new Vec3(rd.digTarget.x, rd.digTarget.y, rd.digTarget.z)) } catch { capBlock = null }
                              if (!capBlock) {
                                console.log(`${name} reloot: rim dig skipped (the cap block read null - the unloaded-chunk class)`)
                              } else {
                                await miner.bot.dig(capBlock)
                                console.log(`${name} reloot: rim dig opened the seal (cap ${capBlock.name} at [${rd.digTarget.x},${rd.digTarget.y},${rd.digTarget.z}]) - the float wait ${(RELOOT_RIM_FLOAT_MS / 1000).toFixed(0)}s`)
                                await new Promise(r => setTimeout(r, RELOOT_RIM_FLOAT_MS))
                                let stacks = 0
                                try {
                                  const me3 = miner.bot.entity.position
                                  for (const ent of Object.values(miner.bot.entities)) {
                                    if (!ent || ent.name !== 'item' || !ent.position || ent.isValid === false) continue
                                    if (ent.position.distanceTo(me3) <= RELOOT_RETRY_RANGE) stacks++
                                  }
                                } catch { /* a junk entity read reads zero stacks */ }
                                console.log(`${name} reloot: rim dig done in ${((Date.now() - rimT0) / 1000).toFixed(0)}s - ${stacks} item stack(s) within ${RELOOT_RETRY_RANGE}${stacks ? ' - the magnet takes what it can' : ' (none in read reach - the seal held nothing, or the pool kept them)'}`)
                              }
                            }
                          }
                        } catch (e4) {
                          console.log(`${name} reloot: rim dig failed (${e4.message}) - the drops stay lost`)
                        }
                      }
                    }
                  } else {
                    console.log(`${name} reloot: surface retry at [${rs.goal.x},${rs.goal.y},${rs.goal.z}] (budget ${(rs.budgetMs / 1000).toFixed(0)}s) - the floating stacks live at the water surface`)
                    const surfaceT0 = Date.now()
                    try {
                      await gotoSafe(miner.bot, standGoalNear(miner.bot, goals, rs.goal.x, rs.goal.y, rs.goal.z, { range: rs.range }), { timeoutMs: rs.budgetMs, label: 'reloot surface', doomedRearm: true })
                      let stacks = 0
                      try {
                        const me = miner.bot.entity.position
                        for (const ent of Object.values(miner.bot.entities)) {
                          if (!ent || ent.name !== 'item' || !ent.position || ent.isValid === false) continue
                          if (ent.position.distanceTo(me) <= rs.range) stacks++
                        }
                      } catch { /* a junk entity read reads zero stacks */ }
                      console.log(`${name} reloot: surface arrived in ${((Date.now() - surfaceT0) / 1000).toFixed(0)}s - ${stacks} item stack(s) within ${rs.range}${stacks ? ' - the magnet takes what it can' : ' - none in read reach (gone, or out of the surface cell)'}`)
                    } catch (e3) {
                      console.log(`${name} reloot: surface failed (${e3.message}) - the drops stay lost`)
                    }
                  }
                }
              }
            }
          }
        }
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
            // (v0.261.0) THE RECOVERY ASCENT: the bootstrap's wood leg ran WHERE
            // THE BOT STANDS - a pick-less bot stands in a shaft with stone above
            // in every direction: findBlocks(48) reads zero trunks, the map-target
            // walk digs at rock, the direction relocation tunnels stone - the leg
            // lands logs=0 and ensureTools follows with 'no planks recipe' (the
            // face 36359454749 census: 'no planks' x11 / 'no sticks' x10 / 'no
            // materials' x4 vs no-pickaxe x14 in attempt 1 - the fleet cannot
            // re-craft its picks; attempt 2 split the same shape: F13 'no table'
            // -> 'no planks recipe' dead underground while F15, already standing
            // at the woods' edge, recovered the SAME way). The famine trip
            // (v0.179.0) solved this exact shape for TOOLED bots with an
            // ensureSurface front; the recovery lane never got it. The wood leg
            // now climbs FIRST (the 'wood trip' single-shot shape): a bot that
            // reaches the sky gathers where trees actually grow; a bot whose
            // climb refuses keeps the byte-identical legacy underground attempt
            // (never worse than legacy - a cave wood once grew in is still worth
            // one scan, and the v0.52.0 brake still owns the retry cadence).
            if (await ensureSurface('tool recovery')) {
              console.log(`${name} tool recovery: surfaced - the wood leg gathers where trees grow`)
            } else {
              console.log(`${name} tool recovery: climb refused - the underground attempt stands`)
            }
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
        // (v0.225.0) THE DRAGON-ZONE WIRING - the kill anchor's field face.
        // The pure design (v0.220.0) clustered both era magic kills into the
        // fixed anchor ~[100,49,1]; this lane wires the evacuation: the death
        // registry (the server verb + the corpse pos, fleet-shared, capped)
        // feeds dragonZoneAnchor each pass, and a bot whose position reads
        // inDragonZone walks OUT of the ground shadow along the away ray
        // (dragonZoneExit - away from the anchor, never across it) with ONE
        // bounded gotoSafe. THE LAWS THIS WIRE OBEYS: the story is one line
        // per entry (the flag resets when the bot reads out - the
        // lastNightLog shape); the walk machinery owns the failure (the next
        // pass re-reads - no retry storm, no budget escalation); the zone
        // stays quiet-honest when the dragon rests (the anchor reads null
        // until a magic kill lands - the vacuous read is the design's own
        // gate, no avoidance on an unmeasured zone). The target-assignment
        // exclusion rides a later lane (the design names it a separate
        // candidate). The consult sits BEFORE the churn pricing: a safety
        // lane outranks the voluntary-goal stance.
        const dAnchor = (() => { try { return dragonZoneAnchor(dragonDeaths) } catch { return null } })()
        const inZone = !!(dAnchor && miner.bot.entity?.position && (() => {
          try {
            const me = miner.bot.entity.position
            return inDragonZone({ x: me.x, y: me.y, z: me.z }, dAnchor)
          } catch { return false }
        })())
        if (inZone) {
          const dGoal = (() => {
            try {
              const me = miner.bot.entity.position
              return dragonZoneExit({ x: me.x, y: me.y, z: me.z }, dAnchor)
            } catch { return null }
          })()
          if (dGoal) {
            if (!dragonEvacAnnounced) {
              dragonEvacAnnounced = true
              console.log(`${name} dragonzone: bot inside the kill zone (anchor [${dAnchor.x},${dAnchor.y},${dAnchor.z}] from ${dAnchor.count} magic kill(s)) - walking out to [${Math.round(dGoal.x)},${Math.round(dGoal.y)},${Math.round(dGoal.z)}]`)
            }
            try { await gotoSafe(miner.bot, standGoalNear(miner.bot, goals, dGoal.x, dGoal.y, dGoal.z, { range: 3 }), { timeoutMs: DRAGON_ZONE_EXIT_MS, label: 'dragonzone exit' }) } catch { /* the walk machinery owns the failure - the next pass re-reads */ }
          }
        } else {
          dragonEvacAnnounced = false
        }
        // (v0.223.0) THE WET CHURN WIRING - the governor's field face. The
        // pure plan (v0.222.0) priced the AFTER-STORM stance; this lane wires
        // it: the recorder (src/bots/miner.mjs) keeps the bot's OWN rescue
        // starts, the work loop consults wetChurnPlan on EVERY pass (the
        // wiring re-reads on each goal), and an evacuation holds the
        // wet-prone lanes (the shaft dig + the steered tunnels - the flooded
        // quarry's faces) while the bot spends the cooldown on dry ground:
        // daylight prices a bounded surface wood gather (the bootstrap lane's
        // own shape), night rests out the slice (the v0.140.1 hold owns the
        // dark surface). THE LAWS THIS WIRE OBEYS: the arm carries the plan's
        // OWN exit clock (the wiring never extends it, the re-read never
        // double-books - holding re-reads with the remaining time); the hold
        // passes stay SILENT (the arm + the release are the whole story, no
        // per-pass spam - the lastNightLog shape); the rescue machinery is
        // UNTOUCHABLE (the plan never gates the ladder - a rescue during an
        // evacuation still runs), and the bank lanes below keep their own
        // gates (the yard walk is dry ground - a valid evacuation lane).
        const churnEvents = (() => { try { return miner.wetRescueEvents?.() ?? [] } catch { return [] } })()
        const churnPlan = (() => {
          try {
            return wetChurnPlan({ rescueEvents: churnEvents, now: Date.now(), evacUntil: wetEvacUntil })
          } catch { return { go: false, why: 'no-history', count: 0 } }
        })()
        if (churnPlan.go) {
          wetEvacUntil = churnPlan.untilMs // the plan owns the exit clock - the wiring only carries it
          churnHoldAnnounced = true
          console.log(`${name} churn: evacuation armed (${churnPlan.count} rescues/${WET_CHURN_WINDOW_MS / 1000}s) - the wet lanes hold for ${WET_CHURN_COOLDOWN_MS / 1000}s (the rescue machinery untouched)`)
        } else if (churnPlan.why !== 'holding' && churnHoldAnnounced) {
          churnHoldAnnounced = false
          console.log(`${name} churn: evacuation released (${churnPlan.why}) - the cooldown owns the exit, the window re-reads honestly`)
        }
        const churnHolding = !!(churnPlan.go || churnPlan.why === 'holding')
        if (churnHolding) {
          const swap = churnSwap({ remainingMs: churnPlan.remainingMs ?? (wetEvacUntil - Date.now()), daylight: !walkForbidden(miner.bot.time?.timeOfDay) })
          if (swap.work === 'wood') {
            try {
              await miner.gatherWood({ want: 6, direction, shouldStop: () => Date.now() > deadline, maxSeconds: Math.max(5, Math.round(swap.maxMs / 1000)) })
            } catch { /* dry work with whatever the trip reached */ }
          } else {
            // the rest slice: bounded by the swap AND the run clock (the deadline owns everything)
            await new Promise(r => setTimeout(r, Math.max(0, Math.min(swap.maxMs, deadline - Date.now()))))
          }
        }
        if (!churnHolding) {
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
              if (churnDueNow()) { interrupted = true; return true } // (v0.293.0) the wet drip inside the dig - the plan's go stops the shaft, the next pass arms the evacuation (the seal counter never reads a churn stop as an empty shaft)
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
        // (v0.297.0) THE FUEL BANK TRIGGER - the tithe-worthy surplus is
        // trip-worthy stock the units gate cannot see. Face 36499444700: ONE
        // miner held 25 coal in its pocket all run while the anchor chest
        // stayed empty (the tithe call rides the bank trip's consolidation -
        // a coal-rich but LIGHT pocket never trips needsBanking nor the
        // 48-unit floor, so the tithe never armed) and the commons read
        // 'chest holds no fuel' 140 times while the smelt legs burned sticks.
        // The fuel trip rides the SAME cadence (everyMs 150s) and the SAME
        // end-phase fence (minRemainingMs) - the trigger cannot storm; the
        // class names itself on the trip line ('fuel-tithe').
        const fuelOverage = fuelPocketOverage(miner.bot)
        const fuelTrip = fuelTripWanted({ overage: fuelOverage })
        const tripPlanned = !!(load && bankTripDue({
          units: load.units,
          msSinceBank: Date.now() - lastBankAt,
          remainingMs: deadline - Date.now(),
          fuelTrip
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
        const bankYardDist = yardGoal ? miner.bot.entity.position.distanceTo(yardGoal) : 0
        // (v0.294.0) THE CLIMB-PRICED BANK - the vertical separation rides the
        // budget: the face 36484348043 trips armed 6x and delivered ZERO (the
        // flat 90s climb term vs the measured 4.2s/level x 20-31 levels), the
        // whole 1892u yield rode the pockets to t-0. The dy prices the honest
        // climb; junk goals read 0 (the legacy flat term).
        const bankYardDy = yardGoal ? Math.abs(miner.bot.entity.position.y - yardGoal.y) : 0
        // (v0.193.0) THE DUSK-FORECAST BANK ESCALATION: run46 measured 16/19
        // 'final bank deferred: night (tod 12400-13106)' - the skip gate hands
        // the pocket to the end-phase ('the end-phase owns the deadline
        // banking'), the end-phase final bank then reads the clock INSIDE the
        // walk-forbidden window and defers (the v0.140.1 hold), and the hard
        // kill eats the pocket. The vanilla clock advances at a known rate, so
        // the tod the end-phase will see is a FORECAST: when THIS bot's own
        // stagger slot lands dark and a REAL trip (the full dist-scaled chain
        // + the walk home) still completes BEFORE the window opens, bank NOW
        // instead of believing the skip gate. The fences live in duskBankDue:
        // it never fires in the dark (the v0.140.1 hold stays the owner there,
        // the pocket rides out the dark alive) and it keeps the cadence
        // refractory (lastBankAt below advances on every attempt - no retry
        // storm). The refusal line below keeps its byte-for-byte shape.
        // (v0.198.0) THE DUSK WIRE - the cadence clock rides the call. MEASURED
        // (run195, fleet 36206318405): 12 'final bank deferred: night' and ZERO
        // 'bank trip: dusk' rows - the call omitted msSinceBank, the fence (d)
        // default read 0, and `0 >= BANK_TRIP_EVERY_MS` refused EVERY arm for
        // the cure's whole field life (the tests passed the arg explicitly, the
        // wiring pin never named it - the regression pin now does).
        const bankDusk = !!(load && !tripPlanned && duskBankDue({
          timeOfDay: miner.bot.time?.timeOfDay,
          remainingMs: bankRemainingMs,
          units: load.units,
          yardDist: bankYardDist,
          msSinceBank: Date.now() - lastBankAt
        }))
        // (v0.229.0) THE DUSK-BANK WIRING - the heavy pocket's priced delivery.
        // The pure plan (v0.226.0) prices the dusk window (tod 10800..12400,
        // the measured deferral face's threshold); this lane wires it (the
        // churn shape): the work loop consults duskBankPlan on EVERY pass, a
        // GO spends the bot's next voluntary goal on the SAME proven bank
        // chain below (a delivery, not a rescue), and the plan's own exit
        // clock (untilMs) rides the wiring as duskTripUntil - holding
        // re-reads with the remaining time, never double-books, and a failed
        // arm waits the clock out (one priced trip per window, no
        // retry-storm; lastBankAt advances on every attempt as always). THE
        // INPUTS, each named: tod = the vanilla clock (bot.time.timeOfDay);
        // pocketUnits = load.units (the plan's 256u HEAVY floor - the legacy
        // 24u forecast lane above stays untouched); bankTripMs =
        // lastBankTripMs, the WIRING'S MEASURED trip (the last delivered
        // chain's wall time, taken at the landing below; an unmeasured bot
        // reads no-time - the honest refusal); tripUntil = duskTripUntil (the
        // wiring owns the field, the plan the clock). THE LAWS: the v0.140.1
        // night hold stays UNTOUCHABLE - the plan's own night threshold IS
        // the hold's NIGHT_WALK_START (12400 = 12400), so a held sky reads
        // 'night' at the plan itself; the arm folds into bankViable behind
        // !bankNightHold as the belt to the suspenders (a held arm lands in
        // the legacy 'deferred night' refusal - the line names the deferral,
        // lastBankAt refractories the window); the legacy family keeps
        // priority (planned/dusk/pockets-full own the pass, the plan only
        // spends a goal they declined); the arm's viability IS the plan's own
        // pricing (the measured trip + the safety fit the sky - the 150s
        // needsBankingTripViable gate is the full-chain emergency's check,
        // the plan arm's spend is bounded by the measurement instead); and
        // the wiring NEVER hardcodes the plan's clocks (the windows/margins
        // live in duskbank.mjs alone - the dead-wire doctrine's inverse).
        const duskPlan = (() => {
          try {
            return duskBankPlan({
              tod: miner.bot.time?.timeOfDay,
              pocketUnits: load ? load.units : NaN,
              bankTripMs: lastBankTripMs,
              now: Date.now(),
              tripUntil: duskTripUntil
            })
          } catch { return { go: false, why: 'unknown' } }
        })()
        // (v0.306.0) THE REFUSAL REFRACTORY: the needsBanking term joins the
        // cadence clock (bankRefusalDue) - the v0.181.0 promise ('the
        // pockets-full state re-checks in 150s, not every loop iteration')
        // becomes code. Face 36531522422 measured 13932 refusal lines (38 the
        // face before) off the idle full-pocket decide-loop spin; now the term
        // speaks once per window and both branch families (the pockets-full
        // skip + the night deferral) log at the cadence, not at the spin rate.
        // The planned/dusk arms keep their own fences byte for byte.
        const bankRefusalOpen = bankRefusalDue({ msSinceBank: Date.now() - lastBankAt })
        const bankWanted = !!((needsBanking(miner.bot) && bankRefusalOpen) || tripPlanned || bankDusk || duskPlan.go)
        // (v0.185.0) THE NIGHT LANE GATE: the mid-run bank trip joins the
        // v0.140.1 night hold. run182 (36167325733) measured 11 of 17 deaths in
        // the dusk tail (tod 12400+), x12 mob kills - the planned/pockets-full
        // trip's own chain (climb-out + yard walk + the return to the column)
        // is a night surface walk that no other gate covered (map/wood/final-
        // bank/respawn-bootstrap all gate; this lane did not). A held trip
        // keeps the bot MINING underground - the end-phase owns the deadline
        // banking exactly as the doomed gate's refusal says, and the DEATH is
        // the only real loss (the v0.140.1 doctrine). Junk clock walks (the
        // legacy shape byte for byte). Rides the 'bank ' filter key so the
        // next fleet sizes the held class.
        const bankNightHold = surfaceHoldVerdict({ timeOfDay: miner.bot.time?.timeOfDay, purpose: 'mid-bank' }) === 'hold'
        const bankViable = !bankNightHold && (tripPlanned || bankDusk || duskPlan.go || needsBankingTripViable({ remainingMs: bankRemainingMs })) // (v0.229.0) the plan arm rides beside the legacy reasons - the hold still owns the sky first
        // (v0.295.0) THE RESCUE-CLOCK BANK GATE: the arm respects the live
        // rescue ownership (bot._waterRescue - the same flag climbOwnerGate
        // refuses on). Face 36493264551: 3 of 4 armed trips died 'rescue owns
        // the bot' at climb ENTRY (armed inside the wet machinery's window),
        // each burn ate the 150s cadence clock - banked=0 a third face
        // running. The gate defers the arm while the rescue holds (the dig
        // loop re-consults next pass, the budget prices fresh on release),
        // announces once per window, and never fights the wet machinery for
        // the controls (the climb's own owner gate stays the second line).
        const bankDefer = bankRescueGate({
          rescueHeld: !!(load && bankWanted && bankViable && miner.bot._waterRescue === true),
          announced: bankRescueAnnounced
        })
        bankRescueAnnounced = bankDefer.announced
        if (bankDefer.announce) console.log(`${name} bank trip: deferred (rescue owns the bot - the arm waits for the release, the budget never burns)`) // rides the same 'bank ' filter key, the class sizes itself
        if (load && bankWanted && bankViable && !bankDefer.defer) {
          // (v0.321.0) THE ROUTE LATCH AT THE TRIP DOOR: a route the memo has
          // condemned is not armed, not consolidated, not climbed, not held -
          // the pocket mines on (F17's doomed trips burned arm + walk + a 45s
          // smelt-leg hold every cadence window). lastBankAt advances so the
          // cadence re-checks later, not every loop (the v0.181.0 shape).
          const tripRouteLatch = routeRefusalLatch({ refusedCycles: miner.bot?._routeRefusals })
          if (tripRouteLatch.latched) {
            lastBankAt = Date.now()
            console.log(`${name} bank trip: route-latched after ${tripRouteLatch.refused} refused climbs - the route is condemned, the pocket mines on`)
          } else {
          lastBankAt = Date.now()
          if (duskPlan.go) {
            duskTripUntil = duskPlan.untilMs // (v0.229.0) the plan owns the exit clock - the wiring only carries it (the failed arm waits it out, no re-arm storm)
          }
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
            yardDist: bankYardDist,
            yardDy: bankYardDy,
            remainingMs: deadline - Date.now(),
            floorMs: MID_BANK_BUDGET
          })
          // (v0.193.0) the dusk trip names itself ('dusk') - a third label on
          // the same 'bank ' filter key, so the next fleet sizes the class.
          console.log(`${name} bank trip: ${tripPlanned ? (fuelTrip ? 'fuel-tithe' : 'planned') : bankDusk ? 'dusk' : needsBanking(miner.bot) ? 'pockets full' : 'dusk-plan'} budget ${(bankBudgetMs / 1000).toFixed(0)}s`) // (v0.229.0) the 4th label: the plan's arm names itself, the class sizes in the same 'bank ' filter key; (v0.297.0) the 5th label: the fuel-tithe trip names itself (the trigger's own conversion census)
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
              // (v0.229.0) the wiring's measured trip: the DELIVERED chain's
              // wall time (arm -> landing) feeds the dusk plan's pricing - the
              // next dusk window prices THIS bot's real walk, never a model
              // guess (a failed chain measures nothing it didn't walk; the
              // safety margin eats the walk's own variance, not the daylight).
              lastBankTripMs = Date.now() - lastBankAt
            } else {
              // (v0.16.4) the reason MUST reach the log - the invisible 'no chest in
              // range' zero cost fleet #122 its whole banking chain (v0.16.1 lesson)
              console.log(`${name} bank: 0 (${res.reason})`)
            }
          } else {
            // (v0.299.0) THE BANK CLIMB'S HONEST TAIL: the ensureSurface-if had NO
            // else - a trip that armed and then died at the climb printed the arm
            // line and went SILENT. Face 36511867751 (the dual-v0.298.0 tree's first
            // field, banked=0 all face): F5 armed 'planned budget 173s', the climb
            // died 'failed - low-o2' + 'no retry (no retry for low-o2)' - and the
            // trip level named NOTHING (the low-o2 no-retry is CORRECT - the rescue
            // lane owned the bot's air; the silence is the gap); F8 armed 'planned
            // budget 155s', the climb stalled, the escalated retry 'retry failed -
            // timeout [stage 1]' - and the trip level named NOTHING. The census
            // reconstructed both deaths from the interleaved climb lines; the
            // 'bank ' filter key carried zero trip-level refusals all face. The
            // v0.179.0 wood-trip precedent owns the shape ('wood trip: 0 (climb
            // refused)'): the climb's own lines above name the exact reason, the
            // tail names the TRIP's outcome - the pocket rides the next cadence
            // window (lastBankAt already advanced at the arm, the 150s cadence
            // owns the re-arm; no retry storm - the gate never re-arms inside
            // this branch).
            console.log(`${name} bank trip: 0 (climb refused - the pocket rides the next cadence window)`)
          }
          }
        } else if (load && bankWanted) {
          // (v0.181.0) the gate's refusal names itself once per cadence window
          // (lastBankAt advances - the pockets-full state re-checks in 150s, not
          // every loop iteration) and the bot keeps MINING: the end-phase
          // pre-position + final bank own the deadline banking they already own.
          // (v0.185.0) the branch now carries TWO refusals and names whichever
          // fired: the night hold defers the yard walk ('bank trip: deferred
          // night', the v0.140.1 shape's own line family - the wood trip's
          // 'deferred night' line is the field-proven template), the doomed
          // clock keeps the v0.181.0 line byte for byte.
          lastBankAt = Date.now()
          if (bankNightHold) {
            console.log(`${name} bank trip: deferred night (tod=${Math.floor(miner.bot.time?.timeOfDay ?? -1)}) - the yard walk rides out the dark alive (the v0.140.1 night hold extends to the mid-run trips)`)
          } else {
            console.log(`${name} bank trip: skipped (pockets full, ${Math.max(0, Math.round(bankRemainingMs / 1000))}s left < 150s - the end-phase owns the deadline banking)`)
          }
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
      // (v0.316.0) THE SHAFT-BOTTOM DOOM LATCH: from the 3rd failed climb
      // cycle the chain is refused at the door - no stagger sleep, no climb
      // spend, the verdict names the latch and the clock goes back to the dig.
      // Gated on bankable (an empty pocket was never doomed, it was just
      // empty); the latch verdict outranks the night hold (the refusal is the
      // terminal truth - the deferral would only re-arm the doomed walk).
      const doomLatch = finalBankDoomLatch({ failedCycles: finalBankDoomCycles })
      if (bankable && doomLatch.latched) {
        console.log(`${name} final bank: 0 (dooms-latched after ${doomLatch.failed} failed shaft-bottom climb cycles - the chain is refused, the clock mines on)`)
      } else if (bankable && surfaceHoldVerdict({ timeOfDay: miner.bot.time?.timeOfDay, purpose: 'final-bank' }) === 'hold') {
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
        // (v0.345.0) THE FLOW-PRICED CLOCK - the static 248s floor priced the
        // HEALTHY flow it was measured on; face 36697238002 read '370s needed,
        // 248s budgeted - 122s short at 2.6u/s' (the gap row's own verdict).
        // The chain's entry now prices the LIVE fleet flow against THIS bot's
        // bankable pocket (the non-KEEP mass - the KEEP items never ride a
        // chest, pricing them would be a lie) and extends the floor by the
        // flow-implied need (+ the v0.334.0 4s margin). The kill-margin law is
        // untouched: the floor only feeds finalBankBudgetMs, whose
        // min(want, margin) construction cannot be outrun - the extension
        // moves the clock, never the kill. A covered pocket speaks nothing
        // (the leanness law); a clamped extension names the clamp.
        const endPocketUnits = miner.bot.inventory
          ? miner.bot.inventory.items()
              .filter(i => !DEPOSIT_KEEP.some(k => i.name.includes(k)))
              .reduce((a, i) => a + ((Number.isFinite(i?.count) && i.count > 0) ? i.count : 0), 0)
          : 0
        const flowClock = flowPriceClock({ samples: bankFlowSamples.slice(-BANK_FLOW_WINDOW), pocketUnits: endPocketUnits, baseMs: END_BANK_BUDGET })
        const chainBudgetMs = finalBankBudgetMs({
          yardDist,
          marginLeftMs: entryMarginMs,
          floorMs: flowClock.floorMs,
          capMs: END_BANK_BUDGET_CAP_MS
        })
        if (flowClock.extended) {
          const clamped = chainBudgetMs < flowClock.floorMs
          console.log(`${name} final bank budget: flow-priced ${(flowClock.floorMs / 1000).toFixed(0)}s (pocket ${endPocketUnits}u at ${flowClock.rate.toFixed(1)}u/s needs ${flowClock.needS}s) - the static ${(END_BANK_BUDGET / 1000).toFixed(0)}s covered only the fast flows${clamped ? ` - clamped to ${(chainBudgetMs / 1000).toFixed(0)}s (the kill margin)` : ''}`)
        }
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
            // (v0.296.0) THE FINAL CLIMB PATIENCE - the attempt waits out a live
            // water rescue instead of burning on the owner gate. MEASURED (face
            // 36499444700): 8 final climbs failed ('rescue owns the bot' x2,
            // 'low-o2' x1, 'stalled' x3, 'timeout' x2) and the 8 'still
            // underground' verdicts ate the end-phase pockets - banked=805 was
            // the FIRST delivery since the deep era began, ~1672u still rode
            // the pockets at t-0. The wet band (the water table y=60-62 under
            // the y=76 yard) owns the columns the final climb must pass; a
            // rescue held at climb start makes the attempt a BURN ('no retry'
            // for the ownership class). The v0.295.0 arm gate's doctrine
            // reaches the final phase: wait the bounded measured window, the
            // wet machinery keeps the controls the whole time, the owner gate
            // stays the second line, and the class names itself in the log.
            if (miner.bot?._waterRescue === true) {
              const waitStart = Date.now()
              const cleared = await waitForWaterRescueClear(miner.bot, { maxMs: FINAL_CLIMB_RESCUE_WAIT_MS })
              console.log(`${name} final climb: ${cleared ? `waited out the wet rescue (${Math.round((Date.now() - waitStart) / 1000)}s) - the attempt starts honest` : `the rescue held the whole ${Math.round(FINAL_CLIMB_RESCUE_WAIT_MS / 1000)}s wait - the attempt proceeds (the owner gate rules)`}`) // rides the 'final climb' filter key, the class sizes itself
            }
            const climbFenceMs = Math.min(PILLAR_MAX_MS, schedule.climbSliceMs)
            const climbFenceAt = Date.now() + climbFenceMs
            cr = await miner.climbOut({ dir: finalDoomDir || direction, targetY: finalDoom.doom ? yardGoal.y : null, force: true, maxMs: climbFenceMs, shouldStop: () => Date.now() > climbFenceAt })
            if (!cr.ok && cr.reason === 'timeout') cr.reason = `timeout (fenced at ${Math.round(climbFenceMs / 1000)}s - the chain keeps its reserve)`
            if (!cr.ok && cr.memoRefusal) miner.bot._routeRefusals = (miner.bot._routeRefusals || 0) + 1 // (v0.321.0) one truth per bot - the final bank's climbs count, the doom latch owns the gate
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
              // (v0.296.0) the patience rides the retry too - a rescue that
              // started after the first attempt failed (the wet band grabs
              // stalled climbers) must not burn attempt 2 the same way.
              if (miner.bot?._waterRescue === true) {
                const retryWaitStart = Date.now()
                const retryCleared = await waitForWaterRescueClear(miner.bot, { maxMs: FINAL_CLIMB_RESCUE_WAIT_MS })
                console.log(`${name} final climb: ${retryCleared ? `waited out the wet rescue (${Math.round((Date.now() - retryWaitStart) / 1000)}s) - the attempt starts honest` : `the rescue held the whole ${Math.round(FINAL_CLIMB_RESCUE_WAIT_MS / 1000)}s wait - the attempt proceeds (the owner gate rules)`}`)
              }
              const retryFenceAt = Date.now() + retryPlan.maxMs
              cr = await miner.climbOut({ dir: finalDoomDir || direction, targetY: finalDoom.doom ? yardGoal.y : null, force: true, maxMs: Math.min(PILLAR_MAX_MS, retryPlan.maxMs), shouldStop: () => Date.now() > retryFenceAt })
              if (!cr.ok && cr.memoRefusal) miner.bot._routeRefusals = (miner.bot._routeRefusals || 0) + 1 // (v0.321.0) one truth per bot - the retry counts too
              climbAttempts = 2
            } else if (!cr.ok && cr.reason === 'wet wall') {
              // (v0.327.0) THE WET-SHIFT FINAL CLIMB - the no-retry law is right
              // about the COLUMN (re-grinding it pays the same water twice; the
              // memo refuses the re-entry anyway) but says nothing about the
              // NEIGHBOR. The whale F12's 220u died exactly here (fleet
              // 36631612575: wet wall at y=60 -> 'no retry for wet wall' ->
              // 'still underground' -> the write-off row's top line). The wet
              // wall's own yield RETURNS the fence reserve to the chain - the
              // shift spends that reserve ONCE: a memo-clean cardinal column
              // (the yard's way preferred) gets the tunnel (the gallery machine,
              // its fluid/roof guards own the mover) and the fresh column gets
              // the fenced climb. The landed feet are the one truth (the
              // tunnel's z-normalization is diagonal - long-standing gallery
              // behavior): the landed column is re-checked against the memo and
              // a shift that never left the condemned column climbs nothing.
              const shiftPlan = wetShiftPlan(miner.bot?._wetColumnMemo ?? null, {
                x: miner.bot?.entity?.position?.x,
                z: miner.bot?.entity?.position?.z,
                y: miner.bot?.entity?.position?.y,
                preferX: yardGoal && miner.bot?.entity ? yardGoal.x - miner.bot.entity.position.x : null,
                preferZ: yardGoal && miner.bot?.entity ? yardGoal.z - miner.bot.entity.position.z : null
              })
              const shiftSliceMs = Math.max(0, schedule.climbSliceMs - (Date.now() - climbSliceStart))
              if (!shiftPlan.shift) {
                console.log(`${name} final climb: no retry (${retryPlan.why}) - wet shift refused: ${shiftPlan.why}`)
              } else if (shiftSliceMs < WET_SHIFT_MIN_SLICE_MS) {
                console.log(`${name} final climb: no retry (${retryPlan.why}) - wet shift refused: ${Math.round(shiftSliceMs / 1000)}s of slice cannot fund the tunnel and a fenced climb`)
              } else {
                console.log(`${name} final climb: wet shift - ${shiftPlan.why} (${Math.round(shiftSliceMs / 1000)}s of slice left)`)
                // (v0.341.0) THE SHIFT PRE-SEAL - the gate named itself (face
                // 36679076372 + face 36686530635: every observed shift stall
                // rode zeroWhy 'fluid ahead' - the v0.242.0 fluid law stops the
                // mover's FIRST cell while the slice burns) and the cure is
                // already proven one lane over: the mining tunnel's
                // seal-and-cross (v0.244-0.250.0 - the census, the geometry,
                // the two-round placement; face 36686530635 line: F19's
                // 'seal-and-cross CROSSED: cobblestone sealed the step-1 fluid
                // - the steered line resumes'). The shift gets the same cure
                // aimed at its first cell: fluid at step 1 along the bearing ->
                // census (water + stock) -> plan (anchor + headroom) -> place
                // -> verify. A landed seal turns the gate's fluid into a floor
                // and the tunnel walks; every refusal falls through byte for
                // byte (the honest zeroWhy stall line stays the account of
                // record). Lean first leg: one cell, no dig-around - the walled
                // class keeps the legacy fall-through until the field prices it.
                try {
                  const sealFrom = miner.bot.entity?.position?.floored?.() ?? null
                  const sCell = sealFrom ? sealFrom.offset(shiftPlan.bearing.x, 0, shiftPlan.bearing.z) : null
                  const sFeet = sCell ? miner.bot.blockAt(sCell) : null
                  const sHead = sCell ? miner.bot.blockAt(sCell.offset(0, 1, 0)) : null
                  if (steerFluidLock({ feetBox: sFeet?.boundingBox ?? null, headBox: sHead?.boundingBox ?? null, feetName: sFeet?.name ?? null, headName: sHead?.name ?? null })) {
                    const census = sealCensus({ fluidNames: [sFeet?.name ?? null, sHead?.name ?? null], pocket: (miner.bot.inventory?.items?.() ?? []) })
                    console.log(`${name} final climb: shift pre-seal census: ${census.fluid ?? 'unclassified'} at the bearing cell, ${census.blocks} sealable in pocket${census.top ? ` (top ${census.top})` : ''} - the pre-seal is ${census.fluid === 'water' && census.sealable ? 'ARMED' : 'bare'}`)
                    if (census.fluid === 'water' && census.sealable) {
                      const feetWet = (sFeet?.boundingBox === 'fluid') || tunnelFluidName(sFeet?.name ?? null)
                      const anchorB = feetWet ? miner.bot.blockAt(sCell.offset(0, -1, 0)) : sFeet
                      const headroomB = feetWet ? sHead : miner.bot.blockAt(sCell.offset(0, 2, 0))
                      const sPlan = sealPlan({ anchorName: anchorB?.name ?? null, anchorBox: anchorB?.boundingBox ?? null, headroomName: headroomB?.name ?? null, headroomBox: headroomB?.boundingBox ?? null })
                      console.log(`${name} final climb: shift pre-seal plan: anchor ${sPlan.anchor ? 'solid' : 'open'}, headroom ${sPlan.headroom ? 'clear' : 'solid'} - the seal is ${sPlan.plan}`)
                      if (sPlan.plan === 'buildable') {
                        const tgt = sealCrossTarget({ feetWet })
                        const target = sCell.offset(0, tgt.targetDy, 0)
                        const item = (miner.bot.inventory?.items?.() ?? []).find(i => i && i.name === census.top)
                        let sealed = false
                        if (item) {
                          for (let round = 0; round < 2 && !sealed; round++) {
                            if (round > 0) await miner.bot.waitForTicks(6)
                            try {
                              const anchor = miner.bot.blockAt(target.offset(0, -1, 0))
                              if (!anchor || anchor.boundingBox !== 'block') break // the geometry moved under us - the plan is stale
                              await miner.bot.equip(item, 'hand')
                              await miner.bot.waitForTicks(5)
                              await withTimeout(miner.bot.placeBlock(anchor, new Vec3(tgt.face.x, tgt.face.y, tgt.face.z)), SEAL_PLACE_TIMEOUT_MS, 'shift pre-seal place')
                              await miner.bot.waitForTicks(10)
                              const after = miner.bot.blockAt(target)
                              if (sealLanded({ afterName: after?.name ?? null, afterBox: after?.boundingBox ?? null })) sealed = true
                            } catch { /* the round's refusal - one more round, then the gate keeps the cell */ }
                          }
                        }
                        if (sealed) console.log(`${name} final climb: shift pre-seal LANDED: ${census.top} sealed the bearing fluid - the mover owns the walk`)
                        else console.log(`${name} final climb: shift pre-seal refused: ${item ? 'the seal did not land (2 rounds)' : `no ${census.top} in the pocket to place`} - the gate keeps the cell`)
                      }
                    }
                  }
                } catch (e) {
                  // (v0.344.0) THE PRE-SEAL SPEAKS - face 36697238002's hole:
                  // F13's pre-seal printed census ARMED + plan buildable and
                  // then went SILENT until the tunnel attempt ('wet shift
                  // tunnel: 0 blocks in 0s'). The LANDED/refused lines are
                  // unconditional inside the buildable branch, so only a
                  // throw reaching THIS catch can eat the account - and the
                  // freeze class owns exactly the waits this block sits on
                  // (ticking-flat 7/8 on the same face: the ticks the
                  // waitForTicks chain waits on are the ticks the freeze
                  // holds). The wrapper keeps its law: a junk stance never kills the shift -
                  // the attempt survives byte for byte - but the silence is
                  // dead: the swallow names itself and
                  // the tunnel attempt follows as the account of record.
                  console.log(`${name} final climb: shift pre-seal swallowed: ${e && e.message ? e.message : 'unknown throw'} - the gate keeps the cell, the account never sleeps`)
                }
                const feet0 = miner.bot.entity.position.floored()
                const shiftFenceAt = Date.now() + WET_SHIFT_TUNNEL_MAX_MS
                const shiftTunnelStart = Date.now()
                const tun = await miner.tunnel({ x: shiftPlan.bearing.x, z: shiftPlan.bearing.z }, { maxBlocks: WET_SHIFT_BLOCKS, maxMs: WET_SHIFT_TUNNEL_MAX_MS, shouldStop: () => Date.now() > shiftFenceAt })
                const shiftTunnelMs = Date.now() - shiftTunnelStart
                // (v0.338.0) THE SHIFT-TUNNEL PRICING - two faces refused the
                // shift at the slice floor (80s, 82s vs the 90s floor) and the
                // floor has no data to re-price itself with: no completed
                // shift-tunnel sample exists (the one attempt stalled at
                // done=0). The duration speaks at EVERY verdict now - the
                // floor's next pricing rides the tunnel's real distribution,
                // not a guess (the telemetry-first law: instrument, then price).
                console.log(`${name} final climb: wet shift tunnel: ${tun?.done ?? '?'} blocks in ${Math.round(shiftTunnelMs / 1000)}s${tun?.stopped ? ` (${tun.stopped})` : ''}`)
                const feet1 = miner.bot.entity ? miner.bot.entity.position.floored() : null
                if (!feet1 || (feet1.x === feet0.x && feet1.z === feet0.z)) {
                  // (v0.339.0) THE GATE NAMES ITSELF - the shift's stall is
                  // never the slice (face 36679076372: three attempts with
                  // 286s/267s/168s slices, all done=0): the mover's own
                  // first-cell gate refuses and the verdict rode invisible.
                  // zeroWhy (v0.240.0) rides the tunnel's return when done=0 -
                  // the stall line carries it so the next pricing is aimed.
                  console.log(`${name} final climb: wet shift stalled (tunnel done=${tun?.done ?? '?'}${tun?.stopped ? ` ${tun.stopped}` : ''}${tun?.zeroWhy ? ` - the gate: ${tun.zeroWhy}` : ''}) - the climb stays home (a re-entry would ride the memo's refusal)`)
                } else if (wetColumnMemoBlocked(miner.bot._wetColumnMemo, { x: feet1.x, z: feet1.z, y: feet1.y }).blocked) {
                  console.log(`${name} final climb: wet shift landed condemned (${feet1.x},${feet1.z}) - the fresh column was wet too, the attempt stays home`)
                } else {
                  const climbSliceLeft = Math.max(0, schedule.climbSliceMs - (Date.now() - climbSliceStart))
                  const shiftClimbFence = Math.min(PILLAR_MAX_MS, climbSliceLeft)
                  const shiftClimbAt = Date.now() + shiftClimbFence
                  cr = await miner.climbOut({ dir: finalDoomDir || direction, targetY: finalDoom.doom ? yardGoal.y : null, force: true, maxMs: shiftClimbFence, shouldStop: () => Date.now() > shiftClimbAt })
                  if (!cr.ok && cr.memoRefusal) miner.bot._routeRefusals = (miner.bot._routeRefusals || 0) + 1 // (v0.321.0) the shifted climb counts too
                  climbAttempts = 2
                }
              }
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
            // (v0.316.0) the failed cycle feeds the doom latch - the 3rd entry
            // refuses the chain at the door (finalBankDoomLatch above).
            finalBankDoomCycles++
            // (v0.330.0) the same cycle feeds the census ledger - the report's
            // read of WHY the walk never delivered.
            finalBankDoomByBot.set(name, (finalBankDoomByBot.get(name) || 0) + 1)
            // (v0.336.0) the same cycle feeds the WHY ledger - the census
            // names the walker, the why row names the failure class.
            const whyCls = climbWhyClass(cr.reason)
            finalBankDoomWhy.set(whyCls, (finalBankDoomWhy.get(whyCls) || 0) + 1)
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
    // (v0.203.0) THE DEATH CARRY READ: the old miner's un-attempted record
    // seeds the next attempt's miner (the run71 F2/F7 class - the record
    // died with the closure before ANY evaluation). A resolved (attempted)
    // record stays resolved; a failed LOGIN keeps the previous carry
    // honestly instead of inventing a no-death verdict.
    if (miner) {
      const prevDeath = miner.lastDeath?.() ?? null
      deathCarry = (prevDeath && !prevDeath.attempted) ? { spot: prevDeath.spot, at: prevDeath.at } : null
    }
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
// labels (pf:queue / pf:goal / pf:done / pf:spin / water:rescue / climb /
// report / mapsave) - the (v0.229.0) 'pf:spin <label>' is the spin breaker
// refusal's own ring form (the refusal previously lived nowhere: a dump
// read 'pf:goal <- pf:done <- pf:goal' with the hold invisible); when the
// worker sees mainLate >= 5s it dumps the newest entries - the LAST
// activity before the gap names the blocker.
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
  console.log(`[fleet] partial: alive=${alive} mined=${list.reduce((a, m) => a + (m.stats.mined ?? 0), 0)} banked=${banked} smelted=${smelted} climbs=${list.reduce((a, m) => a + (m.stats.climbs ?? 0), 0)} rescues=${list.reduce((a, m) => a + (m.stats.rescues ?? 0), 0)} pounces=${list.reduce((a, m) => a + (m.stats.pounces ?? 0), 0)} pounceLanded=${list.reduce((a, m) => a + (m.stats.pounceLanded ?? 0), 0)}`)
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
// (v0.323.0) THE BANK-FLOW CADENCE SERIES - one (t, banked) sample per
// reporter tick; the final report's bank-flow row prices the endgame tail
// (last BANK_FLOW_WINDOW samples) at its measured rate (fleet 36626921875:
// the pocket sat ~1639u through the endgame while banked crept 1117->1154 -
// a flow no line ever measured, so the crater's feasibility stayed unknown)
const bankFlowSamples = []
const BANK_FLOW_WINDOW = 20 // the last ~5min at the 15s tick = the endgame window
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
  // (v0.323.0) the cadence sample rides the tick (t in seconds, the row's window unit)
  bankFlowSamples.push({ t: Date.now() / 1000, banked })
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
console.log(`bots=${COUNT} spawned=${spawned} reconnects=${reconnects} kicks=${kicks} tools=${toolsOk} recovered=${toolsRecovered} reboots=${toolsReboot} upgraded=${toolsUpgraded} swords=${swordsCrafted} alive=${aliveCount()} climbs=${list.reduce((a, m) => a + (m.stats.climbs ?? 0), 0)} banked=${banked} smelted=${smelted} planted=${list.reduce((a, m) => a + (m.stats.planted ?? 0), 0)} torched=${list.reduce((a, m) => a + (m.stats.torched ?? 0), 0)} fights=${list.reduce((a, m) => a + (m.stats.fights ?? 0), 0)} kills=${list.reduce((a, m) => a + (m.stats.kills ?? 0), 0)} shelters=${list.reduce((a, m) => a + (m.stats.shelters ?? 0), 0)} rescues=${list.reduce((a, m) => a + (m.stats.rescues ?? 0), 0)} pounces=${list.reduce((a, m) => a + (m.stats.pounces ?? 0), 0)} pounceLanded=${list.reduce((a, m) => a + (m.stats.pounceLanded ?? 0), 0)} airGlitches=${list.reduce((a, m) => a + (m.stats.airGlitches ?? 0), 0)} claims=${list.reduce((a, m) => a + (m.stats.claims ?? 0), 0)} claimedHolds=${board.size()} wet=${hazardLedger.size} wt=${waterTableBoard.size}`)
// (v0.195.0) THE SENTRY ATTRIBUTION ROW - run190's blind spot #2 closes: the
// airGlitches counter read fleet-wide while the rate-limited log was
// per-instance, so 383 glitches surfaced as 16 lines from ONE bot and ~40
// were attributable to nothing. The row puts the per-bot truth (g=airGlitches,
// r=rescues) into the mined surface itself, next to the counter it
// attributes. ALWAYS printed - even all-zero (an absent line class is
// indistinguishable from a filter blind spot - the 05:00 ledger-skip lesson).
console.log(sentryAttributionRow(list.map(m => ({ name: m.username, stats: m.stats }))))
// (v0.342.0) THE STORM ROW - the face's bimodal class NAMED: STORM (at/above
// the 100-glitch grain floor: the per-minute rate, the top per-bot holder,
// the abandonment hands) or CALM. ALWAYS printed - a CALM face is a verdict
// (the 05:00 ledger-skip lesson), not a silence.
console.log(stormVerdictRow({
  airGlitches: list.reduce((a, m) => a + (m.stats?.airGlitches ?? 0), 0),
  secs,
  bots: list.map(m => ({ name: m.username, stats: m.stats })),
  abandons: list.reduce((a, m) => a + (m.stats?.glitchAbandons ?? 0), 0)
}))
// (v0.347.0) THE AIR-BAR LEDGER - the storm row named the holder; the ledger
// prices the lie's COST: every override hand believed the bar and paid a
// rescue (face 36700431959: two hands rode F18's 213 lied reads). A face of
// pure ignores prints nothing (the leanness law - the ignore class burns
// nothing). Sits right after the storm row it prices.
const airBarLedger = airBarLedgerRow(list)
if (airBarLedger) console.log(airBarLedger)
// (v0.325.0) THE RESCUE-ECONOMY DECODE - the sentry pair judged as an
// economy: fleet 36626921875 read 257 glitches/54 rescues (21.0%), fleet
// 36631612575 read 699/75 (10.7%) - the share halved unjudged. Below the
// floor the net is losing ground (the watch front's escalation reads
// years later); at/above it or on a small sample the decode stays silent
// (junk never invents an economy).
const rescueEconomy = rescueEconomyDecode({
  airGlitches: list.reduce((a, m) => a + (m.stats?.airGlitches ?? 0), 0),
  rescues: list.reduce((a, m) => a + (m.stats?.rescues ?? 0), 0)
})
if (rescueEconomy) {
  console.log(`rescue economy decode: ${rescueEconomy}`)
  // (v0.326.0) THE RESCUE-HOLE ROW rides the verdict: the economy decode names
  // the wound (the net is losing ground), the hole row names WHERE - a single
  // walk's reach (local) or a saturated net (spread). A healthy run prints
  // neither line.
  const rescueHole = rescueHoleRow(list.map(m => ({ name: m.username, stats: m.stats })))
  if (rescueHole) console.log(rescueHole)
  // (v0.329.0) THE STORM-DIET ROW reads the whales' mined diets (the carried
  // byName histogram): a beach-class share says the territory is wet - the
  // WHY the hole row's address implies. Silent without the storm class.
  const stormDiet = stormDietRow(list.map(m => ({ name: m.username, stats: m.stats })))
  if (stormDiet) console.log(stormDiet)
}
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
// (v0.201.0) surplus joins the line ALWAYS (the 05:00 ledger-skip lesson): the
// over-accounting slack used to hide behind the clamp - run63's 396u read as
// "unaccounted=0, the ledger balances" to one decoder and "hidden loss" to another
console.log(`loot ledger: mined=${ledger.mined} banked=${banked} smelted=${smelted} pocket=${endPk.units}u/${endPk.slots}s accounted=${ledger.accounted} unaccounted=${ledger.unaccounted} surplus=${ledger.surplus}u conversion=${ledger.conversion == null ? 'n/a' : (ledger.conversion * 100).toFixed(1) + '%'}`)
// (v0.317.0) THE BANKED-CRATER DECODE - the pair above never judges itself:
// fleet 36592026195 read banked=83 pocket=671u (11.0% bank share) with no
// verdict naming the crater. Same report-block class as the loot ledger line
// above (ALWAYS printed - the 05:00 ledger-skip lesson); silent when the
// share is healthy or nothing exists (junk never invents a crater).
const crater = bankedCraterDecode({ banked, pocket: endPk.units })
if (crater) console.log(`banked crater decode: ${crater}`)
// (v0.318.0) THE UNACCOUNTED-MASS DECODE - the ledger line's last column
// never judged itself: fleet 36592026195 read unaccounted=1948u of 2713
// mined (71.8%) with no verdict on the scale of the leak - the crater
// decode above judges the loot-that-exists pair, not the gap. Same
// report-block class (ALWAYS printed - the 05:00 ledger-skip lesson);
// silent when the gap sits under the floor or nothing exists (junk never
// invents a mass).
const mass = unaccountedMassDecode({ mined: s.mined, banked, smelted, pocket: endPk.units })
if (mass) console.log(`unaccounted mass decode: ${mass}`)
// (v0.302.0) THE WRITE-OFF'S FIRST LINE: fleet 36517770723 read pocket=1894u/265s
// with no per-bot echo - F9's five refused windows + the budget-exhausted trip
// stayed invisible behind the aggregate. The row names the holders desc by
// units, ALWAYS printed (the 05:00 ledger-skip lesson). Same report-block
// class as the loot ledger line above.
console.log(writeOffRow(list))
// (v0.324.0) THE BANK-ATTRIBUTION ROW - banked was a fleet number with no
// NAMES: fleet 36631612575 healed the crater but the anatomy row flipped to
// WHALE F12 (220u = 31.1%) - the same bot the no-chest front names. The row
// names the top depositors and the STRANDED holders (banked 0u with a live
// pocket at the deadline) - the whale-walk cure's exact target. Same
// report-block class (ALWAYS printed - the 05:00 ledger-skip lesson).
console.log(bankAttributionRow(list))
// (v0.330.0) THE FINAL-BANK DOOM CENSUS - the attribution row names the
// stranded, the census reads their WHY: the failed shaft-bottom climb cycles
// the doom latch counted, summed per walker. A strand without climb failures
// stays silent here (the census reads the doom class, not every strand); a
// healthy run prints nothing (the leanness law).
// (v0.336.0) THE SILENCE LAW - the census is nullable by design (a strand
// without climb failures stays silent) but the bare print said 'null' out
// loud on exactly those healthy runs. The guard is the law: the report
// never prints the word null again.
const doomCensus = doomCensusRow([...finalBankDoomByBot].map(([name, cycles]) => ({ name, cycles })))
if (doomCensus) console.log(doomCensus)
// (v0.336.0) THE DOOM-WHY ROW - the census's WHY side: the same failed
// cycles, summed by failure class (the census's grain floor and half
// boundary apply; silent under the same leanness law).
const doomWhy = doomWhyRow([...finalBankDoomWhy].map(([cls, cycles]) => ({ cls, cycles })))
if (doomWhy) console.log(doomWhy)
// (v0.320.0) THE POCKET-ANATOMY ROW - the write-off row named the holders but
// never judged their SHAPE: fleet 36606754498 read pocket=1349u across 8
// stakes (top 182u = 13.5%) and the cure differs by shape - a whale pocket is
// one walk from the yard, a spread pocket is the chains' failure. Same
// report-block class (ALWAYS printed - the 05:00 ledger-skip lesson).
console.log(pocketAnatomyRow(list, { total: endPk.units }))
// (v0.322.0) THE SURPLUS-FACE ROW - the ledger's surplus column never had a
// FACE: fleet 36617588210 (THE LANDMARK) read surplus=531u (the ledger's
// first balance) with the inflow hypothesized as crafted units the mined
// counter never tracks (the v0.201.0 note) - unmeasured by name. The row
// splits the deadline pocket by source class and names the top flows - the
// surplus's visible face. Same report-block class (ALWAYS printed - the
// 05:00 ledger-skip lesson).
console.log(surplusFaceRow(list, { surplus: ledger.surplus }))
// (v0.323.0) THE BANK-FLOW ROW - the crater's FEASIBILITY priced: the
// endgame tail of the cadence series at its measured rate, the ledger's own
// pocket read as the seconds the flow still owes. Separates a slow chain
// from a dead one (the endgame bank-cadence front). Same report-block class
// (ALWAYS printed - the 05:00 ledger-skip lesson).
// (v0.336.0) the silence law rides the flow row too (few samples or a
// stood-still tail is its silence - never the word null).
const bankFlow = bankFlowRow(bankFlowSamples.slice(-BANK_FLOW_WINDOW), { pocketUnits: endPk.units })
if (bankFlow) console.log(bankFlow)
// (v0.328.0) THE BANK-BUDGET GAP ROW prices the NEED above against the fleet's
// own end-bank clock: the flow row names the pocket's seconds, the gap row
// judges the budget that was granted - a covered pocket prints nothing (the
// leanness law), an outrun clock names the exact shortage.
// (v0.336.0) the silence law rides the gap row - a COVERED pocket prints
// nothing (the leanness law this row's own doctrine already claimed).
const bankGap = bankBudgetGapRow(bankFlowSamples.slice(-BANK_FLOW_WINDOW), { pocketUnits: endPk.units, budgetMs: END_BANK_BUDGET })
if (bankGap) console.log(bankGap)
// (v0.203.0) the sweep drop ledger: the run-level read of the sweep's drop-walk
// economics - the below-plane residue gets its day-scale trend row and the
// v0.187.0 unmeasured plane class splits from the below class. ALWAYS printed
// (the 05:00 ledger-skip lesson).
console.log(belowResidueRow(list.map(m => m.stats?.sweepDrops)))
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
