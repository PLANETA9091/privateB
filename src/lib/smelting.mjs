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
  pollMs = 1200, // output poll interval (tests shrink it; production 1.2s)
  smeltSecondsPerItem = 11, // vanilla smelts one item in 10s + lag margin
  fuelReserve = null, // { reservePlanks, reserveLogs, reserveSticks } - null = defaults
  log = () => {}
} = {}) {
  if (!machineBlock?.position || !inputName || count <= 0) return { smelted: 0, rescued: 0, reason: 'nothing to do' }
  const tag = `[${bot.username ?? 'bot'}]`
  const invCount = name => countItem(bot, name)
  if (invCount(inputName) <= 0) return { smelted: 0, rescued: 0, reason: 'input not in inventory' }

  // walk to the machine first - openBlock out of reach throws or hangs.
  // (v0.13.1) RETRY x3: the walk to a machine at a dark shaft bottom gets
  // interrupted by everything the world throws at the bot - a mob shove engages
  // the combat flee (its own pathfinder goal stops ours: 'Path was stopped'),
  // a shelter dig-in, a hurt-sentry pause. One interruption used to waste the
  // whole smelt visit AND fail the integration test (CI run 109); a bot that
  // still stands simply walks again. Bounded: 3 attempts, settle pause between.
  let lastWalkError = 'never attempted'
  let walked = false
  let rescueWaited = false // (v0.18.2) one bounded clear-wait per visit
  for (let attempt = 0; attempt < 3 && !walked && bot.entity; attempt++) {
    try {
      await gotoSafe(bot, new goals.GoalNear(machineBlock.position.x, machineBlock.position.y, machineBlock.position.z, 2), { timeoutMs: 20000, label: 'walk to furnace' })
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
      await new Promise(r => setTimeout(r, 500)) // let the interrupting path/control settle
    }
  }
  if (!walked) {
    return { smelted: 0, rescued: 0, reason: `machine unreachable (${lastWalkError})` }
  }

  let furnace
  try {
    furnace = await withTimeout(bot.openFurnace(machineBlock), 10000, 'open furnace')
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
    if (!await putVerified(furnace.putInput.bind(furnace), inputName, batch)) {
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
    log(`${tag} smelting ${batch} x ${inputName} in a ${machineBlock.name} (fuel: ${fuel.count} x ${fuel.name})`)

    // WAIT for the output: ~10s smelt per item, poll, hard deadline. The per-item
    // estimate is the floor (a 64-batch needs ~11 minutes - no maxSeconds below that
    // can pretend otherwise); maxSeconds only matters for SMALL batches.
    const deadline = started + Math.max(maxSeconds * 1000, batch * smeltSecondsPerItem * 1000) + pollMs * 3
    const expectOut = SMELT_OUTPUT[inputName]
    let remaining = batch
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
    if (!pickFuel(bot, { itemsNeeded: left(), ...(fuelReserve ?? {}) })) { attempts.push({ name, reason: 'no fuel' }); continue }
    for (const machineKind of machineChainFor(name)) {
      if (Date.now() - started > maxSeconds * 1000) break
      if (left() <= 0) break
      for (const block of findMachineBlocks(bot, [machineKind], { maxDistance })) {
        if (Date.now() - started > maxSeconds * 1000) break
        const res = await smeltBatch(bot, {
          machineBlock: block,
          inputName: name,
          count: left(),
          // never hand a batch a sub-second deadline in production (pollMs=1200 ->
          // floor 15s); the floor shrinks with pollMs so fast test mocks stay fast
          maxSeconds: Math.max(15 * (pollMs / 1200), maxSeconds - (Date.now() - started) / 1000),
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
        }
        if (left() <= 0) break
        // busy / unreachable / broken machine: try the next one of this kind
      }
      if (left() <= 0) break
    }
  }
  return { smelted: total, rescued, outputs, attempts }
}
