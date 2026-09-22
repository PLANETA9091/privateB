// Smelting pipeline: the base plan needs GLASS (from 157k sand), iron ingots (2,275),
// popped chorus (4,142) and cooked food - none of those exist without a furnace run.
// The yard already holds a smelting bay (scripts/setup-yard.mjs: 8 furnaces, 4 blast
// furnaces, 4 smokers), so a bot with full pockets can turn its raw loot into finished
// materials BEFORE banking them.
//
// No op, no commands - vanilla furnace windows only, via mineflayer's furnace plugin
// (openFurnace -> putInput/putFuel/takeOutput, all THREE window types supported).
// Every transfer is VERIFIED like in deposit.mjs: the 26.2 stack silently drops some
// window clicks, so inventory counts before/after are the only truth.
import pathfinderPkg from 'mineflayer-pathfinder'
import { gotoSafe, withTimeout, waitForWaterRescueClear } from './jobqueue.mjs'

const { goals } = pathfinderPkg

// input -> output (vanilla 26.x smelting recipes that matter for the base plan)
export const SMELT_OUTPUT = {
  sand: 'glass',
  iron_ore: 'iron_ingot',
  deepslate_iron_ore: 'iron_ingot',
  raw_iron: 'iron_ingot',
  copper_ore: 'copper_ingot',
  deepslate_copper_ore: 'copper_ingot',
  raw_copper: 'copper_ingot',
  gold_ore: 'gold_ingot',
  deepslate_gold_ore: 'gold_ingot',
  raw_gold: 'gold_ingot',
  ancient_debris: 'netherite_scrap',
  cobblestone: 'stone',
  stone: 'smooth_stone',
  clay_ball: 'brick',
  netherrack: 'nether_brick',
  chorus_fruit: 'popped_chorus',
  beef: 'cooked_beef',
  porkchop: 'cooked_porkchop',
  chicken: 'cooked_chicken',
  mutton: 'cooked_mutton',
  rabbit: 'cooked_rabbit',
  cod: 'cooked_cod',
  salmon: 'cooked_salmon',
  potato: 'baked_potato',
  kelp: 'dried_kelp'
}

// which machine each input WANTS (furnace always works; blast furnace is 2x for
// metals, smoker 2x for food - but neither accepts anything else, so the fallback
// chain must never try a blast furnace for sand: the batch would sit there burning fuel)
export const FOOD_INPUTS = new Set(['beef', 'porkchop', 'chicken', 'mutton', 'rabbit', 'cod', 'salmon', 'potato', 'kelp'])
export const METAL_INPUTS = new Set(['iron_ore', 'deepslate_iron_ore', 'raw_iron', 'copper_ore', 'deepslate_copper_ore', 'raw_copper', 'gold_ore', 'deepslate_gold_ore', 'raw_gold', 'ancient_debris'])

export function machineFor (inputName) {
  if (FOOD_INPUTS.has(inputName)) return 'smoker'
  if (METAL_INPUTS.has(inputName)) return 'blast_furnace'
  return 'furnace'
}

export function machineChainFor (inputName) {
  const want = machineFor(inputName)
  return want === 'furnace' ? ['furnace'] : [want, 'furnace']
}

// (v0.89.0) THE HONEST SMELT LEG - run80 (dispatch 35773697160 on 2cb2088) held
// the smelt reserve (24 'holding ... for the smelt leg' lines), walked 6 bots to
// the yard, and still ended smelted=0 fleet-wide with ZERO 'walk to furnace'
// attempts visible: the furnace walk died silently on the yard's path sickness
// (the doomed ledger recorded on the bay's own cells, water-rescue interlocks,
// 'Took to long to decide' in the tight bay) AND smeltInventory threw every
// machine-loop failure away - the attempts array only ever recorded 'no fuel',
// and the fleet's smelt leg only logged smelted>0. A silent zero is a verdict
// nobody can mine. Three cures, all in this file:
//   1. THE REACH-OPEN: a machine within arm's reach needs no pathfinder at all.
//   2. THE SHARED-MACHINE WALK: doomedRearm (the bay is THE shared destination,
//      v0.87.0 semantics) + a goal ladder - the tight bay wants looser approach
//      cells on the retries (attempt 1 hugs the machine, the retries stand off).
//   3. THE HONEST ATTEMPTS: every machine-loop failure lands in the attempts
//      array (machine + reason), 'no machine in reach' included, and the fleet
//      leg prints the zero verdict verbatim.
export const SMELT_REACH_OPEN_DISTANCE = 4.5

/** Pure: the GoalNear reach for the furnace walk's nth attempt (1-based).
 * Attempt 1 hugs the machine (2); the retries stand off (6) - more candidate
 * approach cells defeat 'Took to long to decide' in a compact bay. Junk -> 6
 * (the looser goal is the safe default: a refused walk retries looser). */
export function smeltWalkReach (attempt) {
  return attempt === 1 ? 2 : 6
}

/** Pure predicate: may the bot open this machine WITHOUT a walk? Junk-safe:
 * a missing position on either side is a no (an unknown distance is a walk). */
export function machineWithinReach ({ from = null, pos = null, reach = SMELT_REACH_OPEN_DISTANCE } = {}) {
  if (!from || !pos) return false
  const r = Number.isFinite(reach) && reach > 0 ? reach : SMELT_REACH_OPEN_DISTANCE
  if (!Number.isFinite(from.x) || !Number.isFinite(from.y) || !Number.isFinite(from.z)) return false
  if (!Number.isFinite(pos.x) || !Number.isFinite(pos.y) || !Number.isFinite(pos.z)) return false
  const dx = pos.x - from.x
  const dy = pos.y - from.y
  const dz = pos.z - from.z
  return Math.sqrt(dx * dx + dy * dy + dz * dz) <= r
}

/** Pure: the fleet leg's zero-verdict line body from the attempts array -
 * 'iron_ore@blast_furnace: machine unreachable (...); cobblestone@-: no fuel'.
 * Empty/junk plans read 'nothing to smelt' (an honest plan-empty, not a failure). */
export function smeltZeroWhy (attempts) {
  if (!Array.isArray(attempts) || attempts.length === 0) return 'nothing to smelt'
  const parts = attempts
    .filter(a => a && typeof a === 'object')
    .map(a => `${a.name ?? '?'}@${a.machine ?? '-'}: ${a.reason ?? 'unknown'}`)
  return parts.length ? parts.join('; ') : 'nothing to smelt'
}

// (v0.92.0) THE MACHINE DOOM TTL - a machine cell's doomed verdict lives 15s,
// not the chest ledger's 45/90s. Run81 measured the cost of the long verdicts
// on machines: F4 tried FIFTEEN bay machines, every walk refused 'doomed goal
// (ledgered 1s ago)' (a self-sustaining refresh - each failed walk re-records
// the cell), and F14's ONE failed walk doom-ledgered the freshly built camp
// furnace for the rest of the run. A furnace is STATIC and known-good (the
// fleet built it minutes ago); its doom is CPU saturation ('Took to long'),
// not geometry, and saturation recovers in seconds. The machine walk keeps its
// own spiral bound (3 attempts per machine, smeltInventory's machine loop
// bounded by the scan), so a 15s verdict still breaks the re-issue spiral
// while the NEXT chain finds the bay walkable again.
export const MACHINE_DOOM_TTL_MS = 15000

// (v0.92.0) THE FUEL SLICE - the time-slice reserve (v0.88.0) held the smelt
// leg's CLOCK but not its FUEL: coal is not in the deposit KEEP list, so the
// pre-deposit banked it and the smelt leg arrived at the machine with
// smeltables and 'no fuel' (run81: F4/F3/F8 - the ninth silent-zero teacher).
// While the pocket carries smeltables the PRE-deposit keeps the solid fuels
// pickFuel burns first (coal/charcoal - planks/logs/sticks already ride KEEP
// with their own pickFuel reserves); the final deposit banks whatever the
// batch left. Pure: returns a FRESH array (the caller spreads it into a keep
// list - a shared const must never be mutated by a caller).
export const SMELT_FUEL_KEEP = ['coal', 'charcoal']

/** Pure, junk-safe: the keep-list extension that holds the smelt leg's fuel.
 * Plain param + body guard (the Number(null) strikes: a destructuring default
 * does NOT fire on null - the oreSteerOrder v0.81.0 lesson, tenth round). */
export function smeltFuelKeep (p) {
  const carries = !!(p && p.carriesSmeltables)
  return carries ? SMELT_FUEL_KEEP.slice() : []
}

/**
 * (v0.91.0) THE BATCH CLOCK - pure: how long one smeltBatch may poll for its
 * output. The batch estimate (batch * smeltSecondsPerItem) may FILL the
 * caller's visit budget but must never OVERRIDE it: run81 measured F19 sitting
 * 1155s in the poll loop (a 105-item batch) through the end phase -> the
 * fleet's hard kill, a smelted=0 measurement lie (6 stone WERE collected), and
 * the final deposit lost. Junk-safe: a junk maxSeconds reads 0 (no wait floor
 * from it), a junk batch reads 0 (the batch floor vanishes), a junk pollMs
 * reads the production default, and a junk/absent visitRemainingMs means the
 * legacy UNBOUNDED mid-run call (the legacy shape byte for byte).
 *
 * @param {object} [p]
 * @param {number} [p.maxSeconds] the caller's own smelt budget (seconds)
 * @param {number} [p.batch] items in this batch
 * @param {number} [p.smeltSecondsPerItem] the per-item estimate (default 11)
 * @param {number} [p.pollMs] the poll interval (default 1200)
 * @param {number|null} [p.visitRemainingMs] the visit budget's remaining wall
 *   clock at poll start - null/undefined = legacy unbounded
 * @returns {number} the poll wait in ms (never negative)
 */
export function smeltBatchWaitMs ({ maxSeconds = 90, batch = 1, smeltSecondsPerItem = 11, pollMs = 1200, visitRemainingMs = null } = {}) {
  const junk = v => (Number.isFinite(v) && v > 0 ? v : 0)
  const mx = junk(maxSeconds) * 1000
  const b = Math.floor(junk(batch))
  const per = junk(smeltSecondsPerItem)
  const pmRaw = junk(pollMs)
  const pm = pmRaw > 0 ? pmRaw : 1200
  const want = Math.max(mx, b * per * 1000) + pm * 3
  const cap = Number.isFinite(visitRemainingMs) && visitRemainingMs != null && visitRemainingMs > 0
    ? Math.floor(visitRemainingMs)
    : Infinity
  return Math.max(0, Math.min(want, cap))
}

// (v0.92.0) A vanilla furnace slot holds ONE stack - 64 max. MEASURED (run82,
// dispatch 35789963277 on 0b01214, F15): the put asked for 93 cobblestone into
// the fresh input slot and mineflayer threw 'destination full' - the row-delta
// still read "moved" (something DID leave the rows), the batch logged
// 'smelting 93 x cobblestone (fuel: 12 x coal)', and the poll waited out its
// whole budget on an output slot that stayed EMPTY to the last poll. Both
// batches died 'timeout' with zero collected - the ninth smelted=0, this time
// with the machine OPEN and the fuel IN. The put count is capped at the slot
// max so the click can never ask for more than one stack absorbs; the surplus
// stays pocketed and re-smelts on the next chain (the batch-clock rule: the
// estimate may fill the budget, the pocket keeps the rest).
export const FURNACE_SLOT_MAX = 64

/** Pure: the count one furnace-slot put may request. Junk-safe: a junk count
 * reads 0 (nothing to put - the caller's own verify loop refuses), a junk max
 * reads FURNACE_SLOT_MAX, a fractional count floors. Never negative. */
export function furnacePutCount (count, max = FURNACE_SLOT_MAX) {
  const c = Number(count)
  if (!Number.isFinite(c) || c <= 0) return 0
  const m = Number.isFinite(Number(max)) && Number(max) > 0 ? Math.floor(Number(max)) : FURNACE_SLOT_MAX
  return Math.min(Math.floor(c), m)
}

/** Pure: the NAMED verdict when the post-put slot read-back disagrees with the
 * put plan (null = the map is honest). MEASURED (run82, F15): both puts
 * "verified" by the row delta yet the furnace never smelted - the only way to
 * know WHERE the items landed is to read the machine's own slots back and NAME
 * the disagreement instead of polling an empty output for the whole budget.
 * Junk-safe: an unknown wantName is a no-check (null), an unread slot reads
 * 'empty' in the verdict text (a null read must not read as the wanted item). */
export function slotMismatchReason ({ wantName = null, slotInputName = null, slotFuelName = null } = {}) {
  if (typeof wantName !== 'string' || wantName.length === 0) return null
  const read = typeof slotInputName === 'string' && slotInputName.length > 0 ? slotInputName : 'empty'
  if (read === wantName) return null
  const f = typeof slotFuelName === 'string' && slotFuelName.length > 0 ? slotFuelName : 'empty'
  return `slot mismatch (input=${read}, fuel=${f}, want ${wantName})`
}

// smelts per fuel unit (vanilla): coal 8, planks/logs 1.5, stick 0.5 ...
export const FUEL_YIELD = {
  coal: 8,
  charcoal: 8,
  coal_block: 80,
  dried_kelp_block: 20,
  blaze_rod: 12,
  lava_bucket: 100,
  stick: 0.5
}

export const PLANK_SUFFIX = '_planks'
export const LOG_RE = /_(log|stem)$/

export function fuelYieldOf (fuelName) {
  if (FUEL_YIELD[fuelName] != null) return FUEL_YIELD[fuelName]
  if (fuelName.endsWith(PLANK_SUFFIX)) return 1.5
  if (LOG_RE.test(fuelName) || fuelName === 'bamboo_block') return 1.5
  return 0
}

export function fuelNeeded (fuelName, itemCount) {
  const yieldPer = fuelYieldOf(fuelName)
  if (yieldPer <= 0) return Infinity
  return Math.ceil(itemCount / yieldPer)
}

const inventoryItems = bot => bot.inventory.items()
export const countItem = (bot, name) => inventoryItems(bot).filter(i => i.name === name).reduce((a, i) => a + i.count, 0)
const countMatching = (bot, re) => inventoryItems(bot).filter(i => re.test(i.name)).reduce((a, i) => a + i.count, 0)
const largestStack = (bot, pred) => inventoryItems(bot).filter(pred).sort((a, b) => b.count - a.count)[0]

// Fuel picking policy (survival, no op):
//   1. coal / charcoal / coal_block / ... - no reserve, they have no other use
//   2. planks ONLY above the reserve (tool bootstrap needs 4+ of ONE plank type)
//   3. logs ONLY above the reserve (re-bootstrapping after death needs logs)
//   4. sticks above 2
// Returns { name, count } - the exact fuel plan - or null when nothing is spare.
export function pickFuel (bot, { itemsNeeded = 1, reservePlanks = 8, reserveLogs = 6, reserveSticks = 2 } = {}) {
  const solid = ['coal', 'charcoal', 'coal_block', 'dried_kelp_block', 'blaze_rod']
    .map(name => ({ name, count: countItem(bot, name) }))
    .filter(f => f.count > 0)
    .sort((a, b) => b.count - a.count)
  if (solid.length) {
    const f = solid[0]
    return { name: f.name, count: Math.min(f.count, fuelNeeded(f.name, itemsNeeded)) }
  }
  const plankTotal = countMatching(bot, /_planks$/)
  if (plankTotal > reservePlanks) {
    const spare = plankTotal - reservePlanks
    const stack = largestStack(bot, i => i.name.endsWith(PLANK_SUFFIX))
    return { name: stack.name, count: Math.min(stack.count, spare, fuelNeeded(stack.name, itemsNeeded)) }
  }
  const logTotal = countMatching(bot, LOG_RE)
  if (logTotal > reserveLogs) {
    const spare = logTotal - reserveLogs
    const stack = largestStack(bot, i => LOG_RE.test(i.name))
    return { name: stack.name, count: Math.min(stack.count, spare, fuelNeeded(stack.name, itemsNeeded)) }
  }
  const sticks = countItem(bot, 'stick')
  if (sticks > reserveSticks) {
    const spare = sticks - reserveSticks
    return { name: 'stick', count: Math.min(spare, fuelNeeded('stick', itemsNeeded)) }
  }
  return null
}

// What in this inventory is worth smelting (biggest piles first). Cobblestone is
// reserved: stone pickaxes need COBBLE, not stone - never smelt the tool stock away.
// log -> charcoal is deliberately excluded: it is a net fuel loss and logs are the
// tool-bootstrap lifeline.
export function smeltablesIn (bot, { reserveCobble = 8 } = {}) {
  const totals = new Map()
  for (const item of inventoryItems(bot)) {
    if (!SMELT_OUTPUT[item.name]) continue
    totals.set(item.name, (totals.get(item.name) ?? 0) + item.count)
  }
  const cobble = totals.get('cobblestone') ?? 0
  if (cobble > 0) {
    const spare = Math.max(0, cobble - reserveCobble)
    if (spare === 0) totals.delete('cobblestone')
    else totals.set('cobblestone', spare)
  }
  for (const name of [...totals.keys()]) {
    if (LOG_RE.test(name)) totals.delete(name)
  }
  return [...totals.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
}

// All smelting machines of the wanted kinds in reach, closest first, as REAL blocks
// (bot.blockAt results - the callers need .position for the walk and openFurnace).
//
// PALETTE TRAP (measured live): findBlocks' matcher is ALSO called with palette blocks
// that have NO position (isBlockInSection -> Block.fromStateId(stateId, 0)), and
// findBlocks itself returns plain Vec3s. A `b.position != null` term inside the matcher
// therefore makes every palette pre-check false and findBlocks returns NOTHING - sand
// at distance 13 was invisible to findBlock(32) because of exactly this guard. Match on
// the name only, then convert the Vec3 results through blockAt.
export function findMachineBlocks (bot, kinds, { maxDistance = 48, count = 16 } = {}) {
  try {
    if (!bot.entity?.position) return []
    const found = bot.findBlocks({ matching: b => kinds.includes(b.name), maxDistance, count })
    return found
      .map(p => bot.blockAt(p))
      .filter(b => b && kinds.includes(b.name))
      .sort((a, b) => bot.entity.position.distanceTo(a.position) - bot.entity.position.distanceTo(b.position))
  } catch {
    return []
  }
}

const sleep = ms => new Promise(r => setTimeout(r, ms))

/**
 * Smelt up to `count` of ONE input type in ONE machine block. Never throws.
 * Returns { smelted, rescued, reason }:
 *   smelted - VERIFIED output items that landed in the bot inventory
 *   rescued - abandoned output claimed from an idle machine (leftovers of an earlier
 *             visit whose owner died / disconnected - fleet property, nobody is coming)
 *   reason  - 'ok' | 'busy' | 'no fuel' | 'input transfer failed' | 'timeout' | ...
 */
export async function smeltBatch (bot, {
  machineBlock,
  inputName,
  count = 64,
  maxSeconds = 90,
  visitBudgetMs = null, // (v0.41.0) wall-clock cap on the WHOLE visit (walk + open) - the chain budget
  pollMs = 1200, // output poll interval (tests shrink it; production 1.2s)
  smeltSecondsPerItem = 11, // vanilla smelts one item in 10s + lag margin
  fuelReserve = null, // { reservePlanks, reserveLogs, reserveSticks } - null = defaults
  log = () => {}
} = {}) {
  if (!machineBlock?.position || !inputName || count <= 0) return { smelted: 0, rescued: 0, reason: 'nothing to do' }
  const tag = `[${bot.username ?? 'bot'}]`
  const invCount = name => countItem(bot, name)
  if (invCount(inputName) <= 0) return { smelted: 0, rescued: 0, reason: 'input not in inventory' }

  // (v0.41.0) THE VISIT BUDGET - the walk is part of the visit, not a freebie.
  // MEASURED (fleet 35582520041, v0.40.1, F3): the chain arrived at the yard
  // ('yard walk arrived in 32s'), the smelt leg then went SILENT for ~94s and
  // the final deposit died 'budget exhausted' with the loot still pocketed.
  // smeltBatch's clock only starts AFTER the walk, so the 3x20s machine walk
  // burned the chain's remaining budget unseen - the 30s deposit reserve was
  // void by construction. When the caller passes visitBudgetMs, every walk
  // attempt clamps into the visit's remaining wall clock and a retry that
  // cannot fit its minimum slice breaks out with a named reason instead of
  // spending budget the deposit needs. Null = legacy unbounded (mid-run calls).
  const visitDeadline = Number.isFinite(visitBudgetMs) && visitBudgetMs > 0 ? Date.now() + visitBudgetMs : null
  const walkSlice = () => {
    if (visitDeadline == null) return 20000
    const left = visitDeadline - Date.now()
    return left < 1000 ? 0 : Math.min(20000, left)
  }
  let lastWalkError = 'never attempted'
  let walked = false
  let rescueWaited = false // (v0.18.2) one bounded clear-wait per visit
  let governorWaited = false // (v0.79.0) one bounded churn-cooldown wait per visit
  // (v0.89.0) THE REACH-OPEN: run80's bots stood IN the bay with the furnace
  // 2-4 blocks away and still died on the walk (the yard paths were sick).
  // Reach needs no path - open directly, the open's own timeout still guards.
  if (machineWithinReach({ from: bot.entity?.position, pos: machineBlock.position })) {
    walked = true
    log(`${tag} ${machineBlock.name} within reach - opening without a walk`)
  }
  for (let attempt = 0; attempt < 3 && !walked && bot.entity; attempt++) {
    const ms = walkSlice()
    if (ms <= 0) { lastWalkError = 'visit budget spent (walk slice)'; break }
    try {
      // (v0.89.0) THE SHARED-MACHINE WALK: the bay is a SHARED destination -
      // one bot's failed approach ledgered the furnace cell and every later
      // bot's smelt walk died at the consult (run80's silent zeros). The
      // v0.87.0 yard semantics, bounded: exactly ONE honest re-issue (attempt 2)
      // - the doomed geometry is the failed bot's start, this bot's may be fine
      // - then the funnel closes again (the spiral breaker stays in charge).
      // + the goal ladder: attempt 1 hugs the machine, the retries stand off -
      // the tight bay needs looser approach cells to defeat the A* think wall.
      // (v0.92.0) + THE MACHINE DOOM TTL: a machine is static and known-good -
      // its doomed verdict lives 15s (MACHINE_DOOM_TTL_MS), not the chest
      // ledger's 45/90s (run81: 15 machines refused 'ledgered 1s ago', a fresh
      // camp furnace killed for the run by ONE failed walk).
      await gotoSafe(bot, new goals.GoalNear(machineBlock.position.x, machineBlock.position.y, machineBlock.position.z, smeltWalkReach(attempt + 1)), { timeoutMs: ms, label: 'walk to furnace', doomedRearm: attempt === 1, doomTtl: MACHINE_DOOM_TTL_MS })
      walked = true
    } catch (e) {
      lastWalkError = e.message
      // (v0.18.2) the 500 ms token pause cannot outlive a drowning rescue: CI
      // 35511474490 measured all 3 attempts refused inside the rescue's 25 s
      // window (furnace walk 2 s after 'rescue start (oxygen 14)') and the
      // visit aborted 'machine unreachable' while the rescue would have
      // cleared. The gate stays fail-fast; a retrying caller WAITS for it to
      // clear - once per visit, bounded by the rescue's own window + margin.
      if (!rescueWaited && /water rescue in progress/.test(e.message)) {
        rescueWaited = true
        const cleared = await waitForWaterRescueClear(bot)
        log(`${tag} walk refused by a water rescue - ${cleared ? 'rescue cleared, walking again' : 'wait timed out'}`)
      }
      // (v0.79.0) THE GOVERNOR WAIT - same shape as the rescue branch. The
      // churn governor's refusal ('bot churned 4 goals without progress -
      // refused for 11s') is a bounded cooldown, NOT a terminal verdict: the
      // bot may have escaped the stall via its raw-control rungs (measured
      // in the CI 35732767677 integration failure - the bot hauled itself 37
      // blocks out of a 'No path' pocket while its governor evidence was
      // still live, and the visit then died on the refusal instead of
      // walking one block to its own furnace). Wait the named cooldown out
      // (bounded by the visit's own slice), then let the loop retry.
      if (!governorWaited && /walk governor|fleet churn ceiling/.test(e.message)) {
        governorWaited = true
        const m = /refused for (\d+)s/.exec(e.message)
        const asked = (m ? Number(m[1]) : 5) * 1000 + 1000
        const slice = visitDeadline == null ? Math.min(asked, 13000) : Math.min(asked, 13000, Math.max(0, visitDeadline - Date.now()))
        if (slice > 0) {
          log(`${tag} walk refused by the churn governor - waiting ${Math.round(slice / 1000)}s out`)
          await new Promise(r => setTimeout(r, slice))
        }
      }
      await new Promise(r => setTimeout(r, 500)) // let the interrupting path/control settle
    }
  }
  if (!walked) {
    return { smelted: 0, rescued: 0, reason: `machine unreachable (${lastWalkError})` }
  }

  let furnace
  try {
    const openMs = visitDeadline == null ? 10000 : Math.min(10000, Math.max(1000, visitDeadline - Date.now()))
    furnace = await withTimeout(bot.openFurnace(machineBlock), openMs, 'open furnace')
  } catch (e) {
    return { smelted: 0, rescued: 0, reason: `cannot open (${e.message})` }
  }

  let smelted = 0
  let rescued = 0
  let reason = 'ok'
  const started = Date.now()
  // LIVE inventory truth: while a container window is open, bot.inventory is a FROZEN
  // pre-open snapshot (set_slot packets only update bot.currentWindow - measured live:
  // 4 sand left the inventory, sat in furnace slot 0, and bot.inventory still counted
  // 5). The player-row region of the OPEN window is the only live view, so every
  // verified transfer counts rows of the furnace window, not bot.inventory.
  const rowItems = () => (furnace.slots ?? []).slice(furnace.inventoryStart ?? 3, furnace.inventoryEnd ?? 39).filter(Boolean)
  const liveCount = name => rowItems().filter(i => i.name === name).reduce((a, i) => a + i.count, 0)
  try {
    // RESCUE: output in an idle machine (no input, no fuel) belongs to the fleet -
    // its owner is gone. Claim it, then this machine is free for OUR batch.
    // VERIFIED via the live rows (never "read the slot again": a furnace slot REFILLS
    // between two reads, the rows only grow by what WE took - deposit.mjs rule).
    const out0 = furnace.outputItem()
    if (out0 && !furnace.inputItem() && !furnace.fuelItem()) {
      const rowsBefore = liveCount(out0.name)
      try { await withTimeout(furnace.takeOutput(), 5000, 'rescue output') } catch { /* keep going */ }
      await sleep(200)
      rescued = liveCount(out0.name) - rowsBefore
      if (rescued > 0) log(`${tag} rescued ${rescued} x ${out0.name} from an idle ${machineBlock.name}`)
    }

    // BUSY: another bot's batch is inside (input or fuel present). Vanilla happily
    // lets several players view one furnace and race its slots - walking away is the
    // only safe move; the caller tries the next machine.
    if (furnace.inputItem() || furnace.fuelItem()) {
      return { smelted, rescued, reason: 'busy' }
    }

    const fuel = pickFuel(bot, { itemsNeeded: Math.min(count, invCount(inputName)), ...(fuelReserve ?? {}) })
    if (!fuel) return { smelted, rescued, reason: 'no fuel' }

    // VERIFIED input+fuel transfer: retry, then give up (the window is desynced).
    // Counted on the LIVE rows: putInput's click promises resolve on the client-side
    // click and bot.inventory stays stale while the window is open - only the row
    // delta proves the transfer (measured: the sand sat in furnace slot 0 while the
    // stale inventory count said nothing moved). Poll ~0.9s for the confirmation.
    const putVerified = async (fn, itemName, cnt) => {
      const stack = inventoryItems(bot).find(i => i.name === itemName)
      if (!stack) return false
      const before = liveCount(itemName)
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          await withTimeout(fn(stack.type, null, cnt), 5000, 'furnace put')
        } catch (e) {
          // surface the real transfer error - a silent retry loop hides the cause
          log(`${tag} furnace put ${itemName} attempt${attempt}: ${e.message}`)
        }
        for (const waitMs of [0, 300, 600, 900]) {
          await sleep(waitMs)
          if (liveCount(itemName) < before) return true
        }
      }
      return false
    }

    const batch = Math.min(count, invCount(inputName))
    // (v0.92.0) the put never asks for more than one slot absorbs (run82: a 93-cobble
    // batch threw 'destination full' and the poll still waited on an empty output)
    const putCount = furnacePutCount(batch)
    if (!await putVerified(furnace.putInput.bind(furnace), inputName, putCount)) {
      // permanent diagnostic: on a broken transfer, dump the window view so a slot-map
      // regression in the patched 26.2 stack is visible in CI logs
      try {
        const slotDump = (furnace.slots ?? [])
          .map((it, idx) => it ? `${idx}:${it.name}x${it.count}` : null)
          .filter(Boolean).join(' ') || 'empty'
        log(`${tag} transfer failed - cursor=${furnace.selectedItem ? `${furnace.selectedItem.name}x${furnace.selectedItem.count}` : 'empty'} window ${furnace.type} invStart=${furnace.inventoryStart} invEnd=${furnace.inventoryEnd} slots: ${slotDump} | inventory: ${inventoryItems(bot).map(i => `${i.name}x${i.count}`).slice(0, 10).join(' ')}`)
      } catch { /* diagnostics must never throw */ }
      return { smelted, rescued, reason: 'input transfer failed' }
    }
    if (!await putVerified(furnace.putFuel.bind(furnace), fuel.name, fuel.count)) {
      // input already went in - pull it back out, leave the machine clean
      try { await withTimeout(furnace.takeInput(), 5000, 'take input back') } catch { /* lost */ }
      return { smelted, rescued, reason: 'fuel transfer failed' }
    }
    // (v0.92.0) THE SLOT READ-BACK - the row delta proves something LEFT the
    // pocket, not WHERE it landed. Run82's F15 put 93+fuel into a fresh furnace
    // with both puts "verified" and the output stayed empty through the whole
    // poll: the only truth is the machine's own slots. Read them, log them,
    // and a disagreement (the slot-map lie class) is a NAMED verdict with the
    // items pulled back - never a silent budget burned on a furnace that
    // cannot smelt.
    const readBack = { input: null, fuel: null }
    try { readBack.input = furnace.inputItem()?.name ?? null } catch { /* dead window */ }
    try { readBack.fuel = furnace.fuelItem()?.name ?? null } catch { /* dead window */ }
    log(`${tag} furnace slots after put: input=${readBack.input ?? 'empty'} fuel=${readBack.fuel ?? 'empty'}${putCount < batch ? ` (pocket keeps ${batch - putCount})` : ''}`)
    const mismatch = slotMismatchReason({ wantName: inputName, slotInputName: readBack.input, slotFuelName: readBack.fuel })
    if (mismatch) {
      try { if (furnace.inputItem()) await withTimeout(furnace.takeInput(), 5000, 'take input back') } catch { /* lost */ }
      try { if (furnace.fuelItem()) await withTimeout(furnace.takeFuel(), 5000, 'take fuel back') } catch { /* lost */ }
      return { smelted, rescued, reason: mismatch }
    }
    log(`${tag} smelting ${putCount} x ${inputName} in a ${machineBlock.name} (fuel: ${fuel.count} x ${fuel.name})`)

    // WAIT for the output: ~10s smelt per item, poll, hard deadline.
    // (v0.91.0) THE BATCH CLOCK - run81 (dispatch 35782802480 on ab644e4): F19 held
    // 120 cobble, built a field furnace (the camp furnace ladder, 17s), reach-opened
    // it and put a 105-item batch - and the old deadline math
    // (max(maxSeconds, batch*smeltSecondsPerItem)) priced that batch at 1155s of
    // poll wait, OVERRIDING the visit/chain budget by twenty minutes. F19 sat in
    // this loop through the end phase (it HAD collected 6 stone - the 'took' lines
    // prove the machinery), never returned, so the fleet counter stayed smelted=0
    // (a measurement lie), the final deposit never ran (banked 965) and the run
    // ended HARD KILL 'end-phase hang'. The batch estimate may FILL the caller's
    // budget but must never OVERRIDE it: the visit budget (the walk-slice cap the
    // v0.41.0 rule set) is the hard ceiling, the batch floor is the wish. On the
    // clock the existing timeout path pulls OUR input+fuel back out (the machine
    // stays free for the fleet) and the collected count RETURNS - the un-smelted
    // pocket re-smelts on the next chain. Legacy mid-run calls (visitBudgetMs
    // null) keep the legacy unbounded shape byte for byte.
    const visitRemainingMs = visitDeadline == null ? null : Math.max(0, visitDeadline - Date.now())
    const deadline = started + smeltBatchWaitMs({ maxSeconds, batch: putCount, smeltSecondsPerItem, pollMs, visitRemainingMs })
    const expectOut = SMELT_OUTPUT[inputName]
    let remaining = putCount
    while (Date.now() < deadline && remaining > 0) {
      const out = furnace.outputItem()
      if (out && out.count > 0) {
        // VERIFIED take: the output lands in the live ROWS - the rows only grow by
        // what WE took, so the row delta is our truth (a slot read could double-count:
        // the furnace refills the output slot between two reads).
        const rowsBefore = liveCount(expectOut)
        try { await withTimeout(furnace.takeOutput(), 5000, 'take output') } catch { /* retry next poll */ }
        await sleep(200)
        const moved = liveCount(expectOut) - rowsBefore
        if (moved > 0) {
          remaining -= moved
          smelted += moved
          log(`${tag} took ${moved} x ${expectOut} (${smelted}/${batch})`)
        }
        continue
      }
      if (!furnace.inputItem()) break // batch fully consumed, no output pending
      await sleep(pollMs)
    }

    if (remaining > 0) {
      reason = 'timeout'
      // give up cleanly: pull OUR leftovers out so the machine stays free for the fleet
      try { if (furnace.inputItem()) await withTimeout(furnace.takeInput(), 5000, 'take input back') } catch { /* lost */ }
      try { if (furnace.fuelItem()) await withTimeout(furnace.takeFuel(), 5000, 'take fuel back') } catch { /* lost */ }
    } else {
      // (v0.92.0) the batch completed - pull OUR leftover fuel back: a fuel item
      // without input never burns (vanilla), so it would read 'busy' to every
      // later visitor and wall the machine off for the rest of the run
      try { if (furnace.fuelItem()) await withTimeout(furnace.takeFuel(), 5000, 'take leftover fuel') } catch { /* lost */ }
    }
  } catch (e) {
    reason = `error (${e.message})`
  } finally {
    try { furnace.close?.() } catch { /* already closed */ }
  }
  return { smelted, rescued, reason }
}

/**
 * Smelt everything smeltable the bot carries, machine by machine, within a time
 * budget. Never throws. Returns { smelted, rescued, outputs, attempts }.
 */
export async function smeltInventory (bot, {
  maxSeconds = 90,
  maxDistance = 48,
  reserveCobble = 8,
  pollMs = 1200,
  smeltSecondsPerItem = 11,
  fuelReserve = null, // passed to every pickFuel call (see smeltBatch)
  log = () => {}
} = {}) {
  const started = Date.now()
  const attempts = []
  let total = 0
  let rescued = 0
  const outputs = {}
  // per-INPUT produced counter (NOT per-output): iron_ore and raw_iron both yield
  // iron_ingot - a shared counter would wrongly cap the second input
  const produced = new Map()
  const plan = smeltablesIn(bot, { reserveCobble })
  for (const { name, count } of plan) {
    if (Date.now() - started > maxSeconds * 1000) break
    const left = () => Math.min(countItem(bot, name), count - (produced.get(name) ?? 0))
    if (left() <= 0) continue
    if (!pickFuel(bot, { itemsNeeded: left(), ...(fuelReserve ?? {}) })) { attempts.push({ name, machine: null, reason: 'no fuel' }); continue }
    // (v0.89.0) THE SILENT ZERO: seven runs (run74..run80) ended smelted=0 with no
    // line saying why - the machine loop below just fell through when
    // findMachineBlocks came back empty (a bot stranded in the quarry, the yard
    // bay unreachable). Name the miss per input; the fleet harness prints the
    // attempts when smelted=0. (Collision #39 union: the entry carries the
    // machine chain too, so the zero verdict names WHICH machines were scanned.)
    let kindsTried = 0
    let kindsWithBlocks = 0
    // (v0.93.0) THE SPENT-SLICE STOP: run82's F3 zero line refused EIGHT machines
    // 'visit budget spent (walk slice)' - the walk loop breaks per machine, but the
    // scan kept feeding machines into a visit whose walk clock was already dead.
    // The walk slice IS the visit's remaining wall clock: once it reads 0, no
    // machine can be WALKED to, and every further attempt is an identical refusal
    // (the instant kind - the walk loop dies at its own slice check before any
    // goto pays). Close the scan on the first spent refusal; the entry is recorded
    // (the honest attempts), the clock and the log stay clean.
    let sliceSpent = false
    for (const machineKind of machineChainFor(name)) {
      if (Date.now() - started > maxSeconds * 1000) break
      if (sliceSpent) break
      if (left() <= 0) break
      kindsTried++
      const blocks = findMachineBlocks(bot, [machineKind], { maxDistance })
      if (!blocks.length) continue
      kindsWithBlocks++
      for (const block of blocks) {
        if (Date.now() - started > maxSeconds * 1000) break
        // (v0.41.0) the visit budget: what the smeltInventory clock still has
        // is the hard cap for the batch's walk + open (smeltBatch's own
        // maxSeconds floor cannot overrun it from outside)
        const remainMs = maxSeconds * 1000 - (Date.now() - started)
        const res = await smeltBatch(bot, {
          machineBlock: block,
          inputName: name,
          count: left(),
          // never hand a batch a sub-second deadline in production (pollMs=1200 ->
          // floor 15s); the floor shrinks with pollMs so fast test mocks stay fast
          maxSeconds: Math.max(15 * (pollMs / 1200), maxSeconds - (Date.now() - started) / 1000),
          visitBudgetMs: remainMs,
          pollMs,
          smeltSecondsPerItem,
          fuelReserve,
          log
        })
        rescued += res.rescued
        if (res.smelted > 0) {
          total += res.smelted
          produced.set(name, (produced.get(name) ?? 0) + res.smelted)
          const out = SMELT_OUTPUT[name]
          outputs[out] = (outputs[out] ?? 0) + res.smelted
        } else if (res.reason && res.reason !== 'ok') {
          // (v0.89.0) THE HONEST ATTEMPTS: busy / unreachable / broken machines
          // used to vanish between smeltBatch and the fleet leg's log - recorded
          // now, so a zero verdict names every machine it lost to.
          attempts.push({ name, machine: machineKind, reason: res.reason })
          // (v0.93.0) the spent walk slice closes the scan (see the flag above)
          if (/visit budget spent \(walk slice\)/.test(res.reason)) { sliceSpent = true; break }
        }
        if (left() <= 0) break
        // busy / unreachable / broken machine: try the next one of this kind
      }
      if (sliceSpent) break
      if (left() <= 0) break
    }
    // every kind of this input's machine chain scanned, zero machines found: the
    // input never even reached a furnace - say so (the fleet harness prints
    // attempts when smelted=0; produced>0 must never be condemned)
    if (kindsTried > 0 && kindsWithBlocks === 0 && !(produced.get(name) > 0)) {
      attempts.push({ name, machine: machineChainFor(name).join('/'), reason: `no machine in reach (${machineChainFor(name).join('/')} within ${maxDistance}b)` })
    }
  }
  return { smelted: total, rescued, outputs, attempts }
}
