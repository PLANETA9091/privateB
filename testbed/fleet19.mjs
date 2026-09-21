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
import { ClaimBoard, attachClaimSync } from '../src/fleet/claims.mjs'
import { attachMemoryGuard } from '../src/fleet/memory-guard.mjs'
import { KEEP as DEPOSIT_KEEP, needsBanking, bankFallback, effectiveWalkBudget, inventoryLoad, bankTripDue, bankTripBudgetMs, finalBankBudgetMs, yardWalkBudgetMs, smeltClampSeconds, YARD_CHEST_RADIUS } from '../src/lib/deposit.mjs'
import { finalBankDelayMs, hardKillDelayMs, endBankBudgetMs, prePositionDue, finalBankSchedule, CLIMB_MIN_SLICE_MS, END_BANK_BUDGET_CAP_MS } from '../src/lib/endphase.mjs'
import { mapTripTargets, planHave, planItemsOf } from '../src/fleet/materialplan.mjs'
import { pickOreTarget, rememberSkip } from '../src/fleet/oresteer.mjs'
import { ensureTools, countItem, consolidateSurplus } from '../src/bots/tools.mjs'
import { sparePickCheck, craftSparePickaxe } from '../src/lib/toolupgrade.mjs'
import { standGoalNear, gotoSafe, pathThrottleStats, gotoSafeStats, walkRetryPlan, waitForWaterRescueClear } from '../src/lib/jobqueue.mjs'
import { PATH_PRIO_BANK } from '../src/lib/pathsemaphore.mjs'
import { PILLAR_MAX_MS } from '../src/lib/surface.mjs'
import { recoveryDue, tripDue, TRIP_WALK_MS } from '../src/lib/woodplan.mjs'
import { smeltInventory } from '../src/lib/smelting.mjs'
import { upgradeCheck, upgradeTools, keepForIron, PICK_TIERS } from '../src/lib/toolupgrade.mjs'
import { walkForbidden } from '../src/lib/nightsafety.mjs'
import { reconnectDelayMs } from '../src/lib/backoff.mjs'
import { snapshotStats, seedStats } from '../src/lib/statcarry.mjs'
import { startHeartbeat, stopHeartbeat, gapNote } from '../src/lib/heartbeat.mjs'
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
const HEADINGS = ['east', 'south', 'west', 'north']

let need = {}
try {
  need = JSON.parse(fs.readFileSync('data/base-raw.json', 'utf8')).rawResources
} catch { /* plan is optional for the report */ }

const deadline = Date.now() + SECONDS * 1000
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
let toolsRecovered = 0 // successful in-loop tool recoveries (the v0.6.9 "bare-handed forever" fix)
let toolsUpgraded = 0 // successful tool upgrades: worn replaced + tier raises (v0.8.0/v0.7.5)
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
  const keep = () => [...DEPOSIT_KEEP, ...keepForIron(miner.bot)]
  // (v0.27.0) the chain budget: a finite budgetMs > 0 sets a deadline every
  // deposit/smelt step must fit (Infinity passes through the deposit chain
  // unchanged - junk-safe legacy behavior for the mid-run caller).
  const hasBudget = Number.isFinite(budgetMs)
  if (hasBudget && budgetMs <= 0) return { deposited: 0, reason: 'budget exhausted' }
  const deadline = hasBudget && budgetMs > 0 ? Date.now() + budgetMs : null
  const remaining = () => (deadline == null ? Infinity : deadline - Date.now())
  const lootOpts = () => ({ keep: keep(), budgetMs: remaining(), yardCenter: yardGoal, yardRadius: YARD_CHEST_RADIUS })
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
      // (v0.19.0) the yard walk RETRIES: fleet on v0.18.15 measured 25 walks /
      // 0 arrivals with 3298 blocks stuck in pockets (banked=0) - 6 walks were
      // refused by the water-rescue interlock while the rescue still had >20s
      // of window (waitForWaterRescueClear waits it out), the rest died on
      // 'Path was stopped' settle-poisoning (a fresh goto re-issues cleanly).
      // walkRetryPlan owns the policy; runtime stays bounded (3 walk attempts,
      // wait-rescue grants no extra walks, a real timeout retries once).
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
      for (let attempt = 1; attempt <= 3 && !arrived; attempt++) {
        try {
          if (attempt > 1) console.log(`${miner.username} bank: yard walk retry ${attempt}/3`)
          // (v0.27.0) the walk fits INSIDE the chain budget: a retry may not
          // restart 120s the chain no longer has (the 35544781892 hang burned
          // 3x120s walks per bot while the margin had 420s for ALL 19 bots).
          // (v0.36.0) the yard walk budget SCALES with the distance: the flat
          // 120s pin could not carry a 150-300 block walk at the 500ms/block
          // rule (13x 'budget exhausted' in dispatch 35562867668 even with a
          // dist-scaled chain). effectiveWalkBudget still clamps it into the
          // chain's remaining wall clock, so the margin maths stand.
          const walkMs = effectiveWalkBudget({ distBudget: yardWalkBudgetMs({ yardDist: decision.dist }), remainingMs: remaining() })
          if (walkMs <= 0) {
            console.log(`${miner.username} bank: end-bank budget spent - yard walk cancelled`)
            break
          }
          miner.bot.on('path_reset', spy)
          miner.bot.on('path_stop', spyStop)
          walkStart = Date.now()
          await gotoSafe(miner.bot, walkGoal, { timeoutMs: walkMs, label: 'walk to yard', priority: PATH_PRIO_BANK })
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
      const res = await smeltInventory(miner.bot, { maxSeconds: smeltSecs, log: m => console.log(m) })
      if (res.smelted > 0 || res.rescued > 0) {
        smelted += res.smelted
        console.log(`${miner.username} smelted ${res.smelted} (${Object.entries(res.outputs).map(([k, v]) => `${k}:${v}`).join(' ')}) rescued=${res.rescued}`)
      }
    } catch (e) {
      console.log(`${miner.username} smelting failed (kept alive): ${e.message}`)
    }
  }
  // Iron reserve (toolupgrade.mjs): until the bot's OWN pickaxe is iron, ingots and
  // raw iron are TOOL MATERIALS, not bank stock. After the iron pickaxe exists the
  // surplus flows to the chests as base stock. keep is computed AFTER smelting: a
  // bot that just produced its first ingots keeps them for the iron pickaxe.
  const res = await miner.depositLoot(lootOpts())
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
    const have = list.reduce((a, m) => a + (m.bot ? planHave(m.bot.inventory.items(), res) : 0), 0)
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
    try {
      miner = createMiner({
        host: '127.0.0.1',
        port: 25565,
        username: name,
        mode: 'rage',
        fly: false, // flight is off: bots walk (see README)
        map, // shared scout -> miner resource map
        board, // shared trip-claim board (target distribution, v0.15.0)
        // cross-process claims (a scout in a second terminal): broadcast our trips as
        // PVB2 chat lines; claimSync is attached right after the bot logs in
        broadcastClaim: SYNC ? pos => { try { claimSync?.broadcast(pos) } catch { /* chat never kills a trip */ } } : null,
        // bot-level logs are too chatty for a fleet run, but COMBAT events are the
        // field evidence the next iteration needs (the v0.11.0 verification run
        // counted fights=2 while printing nothing - invisible, useless evidence);
        // 'climb' shows the pillar-jump shaft exits for the same reason;
        // 'water' shows the drowning rescue + the v0.16.0 air-bar glitch lines -
        // fleet #120 ended rescues=140 with zero visible water lines (the counter
        // contradicted the log, the diagnosis burned a whole session)
        log: m => { if (/combat|died|KICKED|error|climb|water/.test(m)) console.log(`${name} ${m}`) }
      })
      bots.set(name, { miner, target })
      seedStats(miner.stats, carry) // (v0.18.9) the reconnect must not erase what the bot already mined
      await miner.ready
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
      const ensureSurface = async reason => {
        const r = await miner.climbOut({ dir: direction, shouldStop: () => Date.now() > deadline })
        if (r.ok && r.gained > 0) console.log(`${name} climb out (${reason}): OK +${r.gained} levels (${r.steps} steps, ${r.dug} dug${r.traversed ? `, ${r.traversed} traversed` : ''}, ${r.secs?.toFixed(0)}s)`)
        else if (!r.ok) console.log(`${name} climb out (${reason}): failed - ${r.reason}${r.waitSecs ? ` (wait ${r.waitSecs}s)` : ''}${r.traversed ? ` (traversed ${r.traversed})` : ''}${r.stage ? ` [stage ${r.stage}]` : ''}`)
        return r.ok
      }
      const recoveryDueNow = () => recoveryDue({ hasPick: hasPickNow(), msSinceLast: Date.now() - lastBootstrap, remainingMs: deadline - Date.now() })
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
      let lastBankAt = Date.now() // (v0.33.0) mining-trip cadence: bank EARLY while the walk back is affordable
      const veerSkipped = new Set() // (v0.18.8) ore positions this bot already steered at and did not reach
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
            console.log(`${name} tool recovery: OK (spare craft ${sp.tier}, holds ${sp.picks})`)
          } else {
            console.log(`${name} tool recovery: spare craft failed (${sp.reason}) - re-running the bootstrap`)
            try {
              await miner.gatherWood({ want: 6, direction, shouldStop: () => Date.now() > deadline, maxSeconds: 40 })
            } catch { /* craft with whatever we have */ }
            const res = await ensureTools(miner.bot, { miner, log: () => {}, maxSeconds: 45 })
            if (res.ok) toolsRecovered++
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
        if ((shaftRes.done ?? 0) === 0) emptyShafts++
        else emptyShafts = 0
        if (emptyShafts >= 2) {
          emptyShafts = 0
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
          const steerFrom = miner.bot.entity?.position
          let steer = null
          if (steerFrom && miner.map) {
            const oreCands = []
            for (const on of ['iron_ore', 'copper_ore', 'coal_ore']) {
              try {
                for (const p of miner.map.nearestK(on, steerFrom, { maxDistance: 48, k: 4 })) oreCands.push({ name: on, pos: p })
              } catch { /* map read must never break the branch mine */ }
            }
            steer = pickOreTarget({
              candidates: oreCands,
              from: { x: steerFrom.x, y: steerFrom.y, z: steerFrom.z },
              skip: veerSkipped
            })
          }
          const tdir = steer
            ? new Vec3(steer.axis === 'x' ? steer.dir : 0, 0, steer.axis === 'z' ? steer.dir : 0)
            : [new Vec3(1, 0, 0), new Vec3(0, 0, 1), new Vec3(-1, 0, 0), new Vec3(0, 0, -1)][shaft % 4]
          if (steer) console.log(`${name} tunnel: steering ${steer.name} @ ${steer.dist}b (axis ${steer.axis}${steer.dir > 0 ? '+' : '-'}${steer.dir < 0 ? steer.dir : ''}, cross ${steer.cross})`)
          try {
            const tres = await miner.tunnel(tdir, { maxBlocks: 12, names: namesFor(true), shouldStop: () => Date.now() > deadline })
            console.log(`${name} tunnel: ${tres.done} blocks (branch mine at the floor${steer ? ', steered' : ''})`)
            if (steer) rememberSkip(veerSkipped, `${steer.pos.x},${steer.pos.y},${steer.pos.z}`)
            // (v0.18.1) ZERO-PROGRESS BACKOFF - the fleet freeze, measured live
            // (run 2026-09-20 20:05): a bot sealed in wet stone made
            // (digShaft instant 0 -> tunnel instant 0 - the FLUID early-break
            // awaits nothing -> print) a ~97/s sync spin: 41,686 'tunnel: 0
            // blocks' lines in 430s, the 15s reporter starved the whole time
            // and all 8 bots froze with it (mined +19 in the last 7 minutes).
            // Three dead tunnels buy a REAL yield (setTimeout is a macrotask:
            // the event loop reaches its timers, other bots dig again).
            if ((tres.done ?? 0) > 0) zeroTunnels = 0
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
        if (load && (needsBanking(miner.bot) || tripPlanned)) {
          lastBankAt = Date.now()
          // (v0.17.3) remember WHERE we work: after banking at the yard the bot
          // must return here, or it digs its next shaft next to spawn and
          // re-mines the already-hollowed yard area (emptyShafts spiral).
          const preBank = miner.bot.entity.position.clone()
          // a PLANNED trip (start-gated by minRemainingMs) may use the dist-scaled
          // budget; a needsBanking bank can fire right next to the deadline and
          // keeps the v0.28.0 120s cap that fits the hard-kill margin
          const bankBudgetMs = tripPlanned && !needsBanking(miner.bot)
            ? bankTripBudgetMs({ yardDist: yardGoal ? miner.bot.entity.position.distanceTo(yardGoal) : 0 })
            : MID_BANK_BUDGET
          console.log(`${name} bank trip: ${tripPlanned ? 'planned' : 'pockets full'} budget ${(bankBudgetMs / 1000).toFixed(0)}s`)
          try { await consolidateSurplus(miner.bot, { log: m => console.log(`${name} ${m}`) }) } catch { /* keep going */ }
          if (await ensureSurface('bank')) {
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
      if (bankable) {
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
        const chainBudgetMs = finalBankBudgetMs({
          yardDist: yardGoal && miner.bot.entity ? miner.bot.entity.position.distanceTo(yardGoal) : 0,
          marginLeftMs: entryMarginMs,
          floorMs: END_BANK_BUDGET,
          capMs: END_BANK_BUDGET_CAP_MS
        })
        const schedule = finalBankSchedule({ entryMarginMs, chainBudgetMs })
        // (v0.21.1) FINAL-BANK STAGGER: all 19 bots used to enter climbOut + the
        // yard walk in the same second (fleet #131: 14x 'final bank: 0' at t-0,
        // path throttle 6a/10q - every walk budget burned in the queue). Index-
        // spread slots give each climb + walk a quieter throttle and yard; the
        // reporter keeps printing (t-0s) and the process end shifts by the cap.
        const delayMs = finalBankDelayMs({ index })
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
          if (schedule.climbSkipped) {
            cr = { ok: false, reason: `climb skipped (slice ${Math.round(schedule.climbSliceMs / 1000)}s < min ${Math.round(CLIMB_MIN_SLICE_MS / 1000)}s - the chain keeps its budget)`, gained: 0, dug: 0, steps: 0 }
          } else {
            cr = await miner.climbOut({ dir: direction, force: true, maxMs: Math.min(PILLAR_MAX_MS, schedule.climbSliceMs) })
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
          const res = await smeltThenBank(miner, { yardGoal, budgetMs: finalBudget })
          if (res.deposited > 0) {
            banked += res.deposited
            console.log(`${name} final bank: +${res.deposited}`)
          } else {
            console.log(`${name} final bank: 0 (${res.reason})`)
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
const heartbeat = startHeartbeat({ intervalMs: 20000 })
const names = Array.from({ length: COUNT }, (_, i) => `F${i + 1}`)
const runners = []

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
  console.log(`t-${Math.max(0, (deadline - Date.now()) / 1000).toFixed(0)}s alive=${aliveCount()}/${COUNT} mined=${s.mined} map=${mapRep.positions}p/${mapRep.chunksScanned}ch banked=${banked} smelted=${smelted} | ${per}`)
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
  // (v0.17.4) path throttle visibility: fleet #124 starved invisibly - the next
  // freeze must show up as maxActive/queued in the log, not as a silent gap
  // (v0.20.0) stale= counts pre-cleared stopPathing flags - every unit is a walk
  // that would have died with 'Path was stopped' before the gotoSafe pre-clear
  const ps = pathThrottleStats()
  const gss = gotoSafeStats()
  console.log(`   mem: heap=${(mem.heapUsed / 1048576).toFixed(0)}M/${(mem.heapTotal / 1048576).toFixed(0)}M rss=${(mem.rss / 1048576).toFixed(0)}M cols=${cols} ents=${ents} evicted=${evicted} path=${ps.active}a/${ps.queued}q (max ${ps.maxActive}) stale=${gss.staleStopClears}`)
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
  const list = [...bots.values()].map(e => e.miner).filter(Boolean)
  const s = fleetStats(list)
  const secs = SECONDS
  console.log(`================ FLEET RESULT (${reason}) ================`)
console.log(`bots=${COUNT} spawned=${spawned} reconnects=${reconnects} kicks=${kicks} tools=${toolsOk} recovered=${toolsRecovered} reboots=${toolsReboot} upgraded=${toolsUpgraded} alive=${aliveCount()} climbs=${list.reduce((a, m) => a + (m.stats.climbs ?? 0), 0)} banked=${banked} smelted=${smelted} planted=${list.reduce((a, m) => a + (m.stats.planted ?? 0), 0)} torched=${list.reduce((a, m) => a + (m.stats.torched ?? 0), 0)} fights=${list.reduce((a, m) => a + (m.stats.fights ?? 0), 0)} shelters=${list.reduce((a, m) => a + (m.stats.shelters ?? 0), 0)} rescues=${list.reduce((a, m) => a + (m.stats.rescues ?? 0), 0)} airGlitches=${list.reduce((a, m) => a + (m.stats.airGlitches ?? 0), 0)} claims=${list.reduce((a, m) => a + (m.stats.claims ?? 0), 0)} claimedHolds=${board.size()}`)
console.log(`pickaxe tiers at end: ${PICK_TIERS.join(',')} -> ${PICK_TIERS.map(t => `${t.split('_')[0]}=${list.reduce((a, m) => a + (m.bot?.inventory ? countItem(m.bot, t) : 0), 0)}`).join(' ')}`)
console.log(`blocks mined: ${s.mined} in ~${secs}s = ${(s.mined / secs).toFixed(2)} blocks/s (${((s.mined / secs) * 60).toFixed(0)}/min)`)
for (const t of TARGETS) {
  // report the DROP, not the block: "stone" arrives as cobblestone, "dirt" includes
  // grass_block drops (the first runs reported stone collected=0 while bots held
  // stacks of cobblestone - a reporting lie, not an empty inventory)
  const got = list.reduce((a, m) => a + (m.bot ? planHave(m.bot.inventory.items(), t) : 0), 0)
  const required = need[t]
  console.log(`  ${t.padEnd(13)} collected ${String(got).padStart(7)}${required ? ` (${((got / required) * 100).toFixed(3)}% of ${required.toLocaleString()})` : ''}`)
}
console.log(`materials: ${JSON.stringify(s.byName)}`)
console.log(`kicks handled: ${kicks} (reconnect attempts: ${reconnects})`)
const finalMap = map.report()
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
  fs.writeFileSync('data/fleet-report.json', JSON.stringify(fleetReport, null, 2))
  console.log('report: data/fleet-report.json written')
} catch (e) {
  console.log(`report: could not write fleet-report.json (${e.message})`)
}
console.log(`plan progress: ${Object.values(materials).filter(m => m.pct >= 100).length}/${Object.keys(materials).length} resources complete`)

for (const m of list) { try { m.bot.quit() } catch { /* already gone */ } }
}
