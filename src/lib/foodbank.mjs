//
// foodbank.mjs - THE FOOD COMMONS (v0.521.0)
// The ration's own commons - the withdraw side of the flesh economy.
//
// THE LAW: what one bot's defense drops, another bot's ration eats. The
// 0.511.0 ration armed the plugin, the 0.516.0 FLESH KEEP stopped the plate
// from banking away, and the 0.517.0 seal kept the flesh out of the junk
// drops - but the economy had ONE shoulder: a bot whose plate ran dry (a
// respawn's empty pocket, a fled night's burns, a zombie drought on its
// sector) had NO lane back, because the yard held zero food and the fuel
// commons' walk is fuel-only. The FOOD TITHE (deposit.mjs, v0.521.0) opens
// the supply shoulder - the staple's overage above FOOD_TITHE_BOUND banks
// into the yard chests - and this lib opens the demand shoulder: the empty
// plate withdraws the staple back.
//
// THE WIRE (fleet19's bank trip): the refill fires at the deposit trip's
// tail - the bot STANDS at the yard (the walk is sunk cost), the plate read
// is `pocketFood(bot) === 0` (the armed-ration starvation shape the 0.516.0
// comment named: the eater is on, the pocket reads nothing). The mid-field
// hungry ask (a recover() window walking the yard from a shaft) stays priced
// OUT of the recovery lane: an 8s window cannot fund a yard round trip (the
// fuel commons' own ledger: 60 sweeps, 0 deliveries, one body - the yard
// stands 20-37 levels over the asking digger). The bank trip is where the
// yard is already paid for. The ask found its FUNDED clock in the v0.524.0
// FOOD FAMINE TRIP below: the mining loop's own trip clock (the wood
// famine's shape - climb, sweep, return, one attempt per segment), which
// already pays the same envelope for sticks.
//
// THE MACHINERY (the fuel commons' own, reused byte for byte where the law
// is item-agnostic): the sweep memory (rememberEmptyChest/liveEmptyCells -
// known-empty chests are pre-excluded so a repeat ask walks ONWARD), the
// slot arithmetic (pickWithdrawSlots), the verified move
// (withdrawStackMove), and the ghost-click doctrine (the verified pocket
// diff is the only truth; ONE honest re-fire when the clicks lie). The
// walk's own scars (the nudge ladder, the cover dig, the climb fund, the
// anchor read, the dry-stance backoff) are the fuel walk's 400 versions of
// field tuition - this slice ships the 0.98.0 SHAPE instead (the fuel
// commons' own first slice: 3 chests, cap 6, nearest-first, budget-bounded);
// the field prices the rest, one face at a time.
//
// THE ORDER: one name - rotten_flesh. It is the only food a lane supplies
// (the zombie defense; no hunt, no crops). The KEEP's other food names
// (bread/apple/cooked_*) ride pockets only - nobody banks them, so an order
// entry for them is speculative surface. The ration's own bans
// (RATION_BANNED - pufferfish/chorus/potato/eye) are the commons' bans by
// construction: none of them is the staple, and the tests pin the order
// against the ban list cross-lane (a commons that feeds poison defeats the
// doctrine it serves).
//
// Mining-surface only: zero new modules loaded by the bot core, the walk
// rides the caller's own slice (the bank trip's remaining budget). Junk-safe
// end to end: a junk bot/cap/memory reads the honest zero.
//

import pathfinderPkg from 'mineflayer-pathfinder'
import { gotoSafe, withTimeout } from './jobqueue.mjs'
import { findChest, chestSlotCount, chestWalkBudgetMs, CHEST_DOOM_TTL_MS, YARD_CHEST_RADIUS } from './deposit.mjs'
import { countItem } from './smelting.mjs'
import { chestVerticalDoom } from './surface.mjs'
import { pickWithdrawSlots, withdrawStackMove, newCommonsMemory, rememberEmptyChest, liveEmptyCells } from './fuelbank.mjs'
import { ROTTEN_FLESH, REGEN_HUNGER_FLOOR } from './ration.mjs'
import { walkForbidden } from './nightsafety.mjs'

const { goals } = pathfinderPkg

/** The withdraw cap: the plate fills to the SAME bound the tithe keeps (FOOD_TITHE_BOUND = 6) - one number both shoulders read, the fuel tithe's own mirror shape. */
export const FOOD_WITHDRAW_CAP = 6

/** The first slice's sweep width - the 0.98.0 precedent (the fuel commons opened 3 chests its first night; the sweep widened to 8 only when run89's field read named the cobble row). */
export const FOOD_SWEEP_CHESTS = 3

/** The commons' own food order. One name: the only food a lane supplies. The ration's bans never enter (pinned cross-lane in tests). */
export const FOOD_COMMON_ORDER = [ROTTEN_FLESH]

// ---- (v0.524.0) THE FOOD FAMINE TRIP - the mid-field ask, on the loop's clock ----
//
// The 0.521.0 refill rides the bank trip (the yard already paid for); a bot
// BETWEEN trips whose plate ran dry had no lane back until its pocket
// filled. The famine trip answers with the wood famine's own shape: the
// MINING LOOP funds the walk (it already pays climb + gather + return for
// sticks), the verdict is pure, and the armed ration does the eating - the
// wire only lands the food, the plugin eats on the first tick the pocket
// holds it.

/** One food trip per segment max - a failed commons sweep must not storm the loop (the cadence discipline, the wood famine's own byte). */
export const FOOD_TRIP_EVERY_MS = 240000

/** Climb out (~45s) + the commons sweep (<=20s) + the return walk (~45s) must fit. */
export const FOOD_TRIP_MIN_REMAINING_MS = 150000

/** The trip's own justification: hunger below the regen floor the bot cannot heal (the ration's band and the famine's band are ONE band - pinned cross-lib in tests). */
export const FOOD_FAMINE_HUNGER = REGEN_HUNGER_FLOOR

/**
 * The food-famine verdict for one mining-loop iteration - the wood
 * famine's gate ladder with the plate and the hunger as the supply read.
 * @param {object} p
 * @param {number} p.plateCount commons food in the pocket (pocketFood) - the
 *   EMPTY plate is the trip's shape; a below-bound-but-biting plate rides
 *   (the ration eats, the bank trip refills, a trip here would churn)
 * @param {number} p.hunger the vanilla food stat (0-20) - at or above the
 *   regen floor the bot heals itself and the ask waits
 * @param {boolean} p.hasPick does the bot hold a pickaxe (the tool-less bot's
 *   clock stays the recovery lane's - the wood famine's own gate)
 * @param {number} p.msSinceLast ms since the last famine attempt (Date.now() - 0
 *   on a fresh bot = the whole run counts as elapsed)
 * @param {number} p.remainingMs ms left until the run's deadline
 * @param {number} p.timeOfDay bot.time.timeOfDay (the night hold reads it)
 * @returns {'due'|'deferred-night'|false} 'deferred-night' ONLY when the
 *   plate is starving but the surface walk is night-gated (the loop logs it
 *   once and keeps mining - the v0.140.1 hold shape); false = not starving
 *   or gated.
 */
export function foodFamineDue ({ plateCount, hunger, hasPick, msSinceLast, remainingMs, timeOfDay, cooldownMs = FOOD_TRIP_EVERY_MS, minRemainingMs = FOOD_TRIP_MIN_REMAINING_MS } = {}) {
  if (!hasPick) return false
  if (!Number.isFinite(msSinceLast) || msSinceLast <= cooldownMs) return false
  if (!Number.isFinite(remainingMs) || remainingMs <= minRemainingMs) return false
  if (!Number.isFinite(plateCount) || plateCount !== 0) return false
  if (!Number.isFinite(hunger) || hunger >= FOOD_FAMINE_HUNGER) return false
  // the starving plate's surface walk is night-gated LAST (the verdict must
  // still name the famine on the next daylight iteration - the night line is
  // the loop's deferral log, not a silent swallow)
  if (walkForbidden(timeOfDay)) return 'deferred-night'
  return 'due'
}

/**
 * Pure, junk-safe: what to withdraw from ONE chest view to fill the plate.
 * Returns [{ name, count }] (ordered by FOOD_COMMON_ORDER, totals <= cap) or
 * null when the chest holds nothing edible / the ask is junk. Same-name rows
 * merge into ONE entry - the caller verifies per TYPE via the pocket diff,
 * and a split entry would read as a double take.
 */
export function foodWithdrawPlan ({ chestItems = null, cap = FOOD_WITHDRAW_CAP } = {}) {
  const capN = Number(cap)
  const capSafe = Number.isFinite(capN) && capN > 0 ? Math.floor(capN) : FOOD_WITHDRAW_CAP
  if (!Array.isArray(chestItems)) return null
  const plan = []
  let left = capSafe
  for (const foodName of FOOD_COMMON_ORDER) {
    if (left <= 0) break
    for (const s of chestItems) {
      if (left <= 0) break
      if (!s || s.name !== foodName || !(s.count > 0)) continue
      const take = Math.min(left, Math.floor(s.count))
      if (take <= 0) continue
      const held = plan.find(p => p.name === foodName)
      if (held) held.count += take
      else plan.push({ name: foodName, count: take })
      left -= take
    }
  }
  return plan.length > 0 ? plan : null
}

/**
 * Pure, junk-safe: how much of the commons' order the pocket holds right
 * now. The wire's plate read - the ask fires at zero (the armed-ration
 * starvation shape), never at below-bound (every yard visit would churn).
 * The read never throws: the wire's best-effort catch is for the WALK, the
 * gate itself must stay silent on a dead or unreadable inventory.
 */
export function pocketFood (bot) {
  let total = 0
  for (const name of FOOD_COMMON_ORDER) {
    try { total += countItem(bot, name) } catch { /* a dead read is an empty plate - the walk prices it honestly */ }
  }
  return total
}

/**
 * Walk the nearest yard chests and withdraw a modest slice of the staple.
 * Never throws. Returns { taken, plan, chestsVisited, reason } - `taken`
 * counts UNITS that VERIFIABLY landed in the pocket (the diff, not the
 * clicks). Every log line carries the 'food commons' key (the fleet tail's
 * own instrument prefix - the vein-sweep lesson: the instrument's prefix is
 * the key, not the message's vocabulary).
 */
export async function withdrawFoodCommons (bot, {
  maxChests = FOOD_SWEEP_CHESTS,
  maxDistance = 48,
  yardCenter = null,
  yardRadius = YARD_CHEST_RADIUS,
  cap = FOOD_WITHDRAW_CAP,
  budgetMs = 20000,
  clickTimeoutMs = 5000,
  memory = null,
  log = () => {}
} = {}) {
  const capN = Number(cap)
  const wantTotal = Number.isFinite(capN) && capN > 0 ? Math.floor(capN) : FOOD_WITHDRAW_CAP
  if (!bot) return { taken: 0, plan: null, chestsVisited: 0, reason: 'no bot' }
  const started = Date.now()
  const remainingMs = () => budgetMs - (Date.now() - started)
  const exclude = []
  // (v0.99.0 law, the commons' own memory) known-empty chests are
  // pre-excluded so a repeat ask walks ONWARD instead of re-walking the same
  // cobble - and ONLY a chest that was opened and READ empty earns the entry
  // (a walk failure is transient, the weak-evidence lesson).
  const remembered = liveEmptyCells(memory, bot?.username, started)
  for (const cell of remembered) exclude.push(cell)
  let taken = 0
  let chestsVisited = 0
  let doomLogged = false // ONE vertical-gate line per ask (the v0.159.0 shape)
  const planAll = []
  for (let c = 0; c < maxChests; c++) {
    if (taken >= wantTotal) break
    if (remainingMs() <= 0) { log(`food commons: budget spent (${taken}/${wantTotal} units)`); break }
    const chest = findChest(bot, { maxDistance, exclude, yardCenter, yardRadius, log })
    if (!chest) { if (c === 0) log('food commons: no yard chest in range'); break }
    const dist = (() => { try { return Math.round(bot.entity.position.distanceTo(chest.position)) } catch { return null } })()
    // (v0.159.0) THE VERTICAL GATE (the commons' own law): a chest mostly
    // ABOVE the bot is doomed by arithmetic - the same strict shape the fuel
    // walk pays. One named line per ask, the exclude moves on.
    {
      const doom = chestVerticalDoom({ botPos: bot?.entity?.position ?? null, chestPos: chest.position })
      if (doom.doom) {
        if (!doomLogged) {
          doomLogged = true
          log(`food commons: chest at [${chest.position.x ?? '?'},${chest.position.y ?? '?'},${chest.position.z ?? '?'}] ${doom.why} - the walk ladder cannot climb, the plate rides (the tithe owns the refill)`)
        }
        exclude.push(chest.position.floored ? chest.position.floored() : chest.position)
        continue
      }
    }
    // the walk fits INSIDE the caller's slice (the bank trip's own clock) -
    // chestWalkBudgetMs scales with distance, the clamp takes what is left.
    // (v0.135.0) the re-arm rides the walk: the yard row must not starve to
    // a sibling bot's fresh failure (the fleet-wide doom verdict vs the
    // failed bot's own start geometry).
    try {
      await gotoSafe(bot, new goals.GoalNear(chest.position.x, chest.position.y, chest.position.z, 2), { timeoutMs: Math.min(chestWalkBudgetMs(dist ?? 8), remainingMs()), label: `food commons walk @${Math.round(chest.position.x)},${Math.round(chest.position.z)}`, doomedRearm: true, doomTtl: CHEST_DOOM_TTL_MS })
    } catch (e) {
      log(`food commons: chest walk failed (${e?.message || e})`)
      exclude.push(chest.position.floored ? chest.position.floored() : chest.position)
      continue
    }
    let window = null
    try {
      window = await withTimeout(bot.openChest(chest), 10000, 'open food chest')
    } catch (e) {
      // The cover dig is the fuel walk's scar (run557) - not this slice: the
      // open-fail exclude moves on, the next chest or the next trip retries.
      log(`food commons: open failed (${e?.message || e})`)
      exclude.push(chest.position.floored ? chest.position.floored() : chest.position)
      continue
    }
    chestsVisited++
    try {
      const chestSlots = chestSlotCount(window)
      const slots = Array.isArray(window?.slots) ? window.slots : (typeof window?.slots === 'function' ? window.slots() : null)
      const chestItems = Array.isArray(slots) && chestSlots > 0
        ? slots.slice(0, chestSlots).map(s => (s && s.count > 0) ? { name: s.name, count: s.count, type: s.type, stackSize: s.stackSize } : null).filter(Boolean)
        : []
      const plan = foodWithdrawPlan({ chestItems, cap: wantTotal - taken })
      if (!plan) {
        log('food commons: chest holds no food')
        const cell = chest.position.floored ? chest.position.floored() : chest.position
        exclude.push(cell)
        rememberEmptyChest(memory, bot?.username, cell, Date.now())
        continue
      }
      // per-TYPE pocket snapshots: the verified diff (not the clicks) is the
      // only truth - the ghost-click class has lied here before (deposit.mjs,
      // the v0.159.0 one-shot ghost). ONE honest re-fire while the window is
      // still open, then the diff stays king.
      let verified = 0
      for (let attempt = 0; attempt < 2 && verified === 0; attempt++) {
        const beforeOf = new Map(plan.map(p => [p.name, countItem(bot, p.name)]))
        for (const { name, count } of plan) {
          let moved = 0
          while (moved < count) {
            const slotsNow = Array.isArray(window?.slots) ? window.slots : (typeof window?.slots === 'function' ? window.slots() : null) || []
            const stack = slotsNow.slice(0, chestSlots).find(s => s && s.name === name && s.count > 0)
            if (!stack) break // this stack drained into pocket stacks mid-move
            const pair = pickWithdrawSlots({ window, itemType: stack.type, chestSlots })
            if (!pair) break // no pocket room left - the honest stop
            await withdrawStackMove(bot, window, { srcIdx: pair.srcIdx, dstIdx: pair.dstIdx, take: count - moved, stackCount: stack.count, clickTimeoutMs })
            moved += Math.min(count - moved, stack.count)
          }
        }
        for (const { name } of plan) {
          const got = Math.max(0, countItem(bot, name) - (beforeOf.get(name) ?? 0))
          if (got > 0) { planAll.push({ name, count: got }); verified += got }
        }
        if (verified === 0 && attempt === 0) log('food commons: the clicks lied (ghost clicks) - the window is still open, re-firing the same plan once')
      }
      if (verified > 0) {
        taken += verified
        log(`food commons: took ${verified} units (${planAll.map(p => `${p.count} x ${p.name}`).join(', ')}) from a yard chest`)
      } else {
        log('food commons: the clicks lied twice - nothing landed in the pocket (ghost clicks)')
      }
      if (taken >= wantTotal) break
      exclude.push(chest.position.floored ? chest.position.floored() : chest.position)
    } finally {
      try { window.close?.() } catch { /* already closed */ }
    }
  }
  const reason = taken > 0 ? 'ok' : (chestsVisited > 0 ? 'commons empty' : 'no chest reached')
  return { taken, plan: planAll.length > 0 ? planAll : null, chestsVisited, reason }
}

// the memory factory re-export: the wire builds ONE food memory beside the
// fuel memory (the same commons laws, a separate book - the fuel sweep's
// empty-chest facts must not stand in the food walk's way or vice versa).
export { newCommonsMemory }

// (v0.524.0) THE MIDFIELD FOOD RIDER - the mid-field hungry ask's first
// honest slice. THE LEDGER: the mid-field ask's own walk to the yard is
// priced out (the fuel commons' dead letter box: 60 sweeps, 0 deliveries,
// one body - the yard stands 20-37 levels over the asking digger, and an
// 8s recovery window cannot fund the round trip). But the FUEL ask's walk
// is ALREADY paid when it succeeds - the bot stands at a commons chest with
// the walk sunk. THE SLICE: when that paid moment arrives, a rider read
// checks the plate for free - the only walk the rider ever spends is the
// one the fuel ask already spent. An ask that never REACHED a chest pays for
// nothing: the rider never fires (the walk is not there to ride). The gate
// is pure - the wire feeds it the pocket read, the hunger read, the fuel
// verdict and the rider's own slice clock; every refusal names its why and
// stays QUIET in the field (the plate-holds and hunger-above-band cases fire
// at every fuel resupply - the healthy lean is silent, the fuel anchor's own
// law).
//
// (v0.526.0) THE VISITED-DRY RIDE - the rider's second point, priced by the
// gate's own law before any face: the v0.524.0 first law rode only a
// DELIVERED fuel ask, but the delivery was never what pays the walk - the
// REACH is. The fuel commons' own verdict shape already names it ('commons
// empty' vs 'no chest reached'): an ask that walked to a chest and OPENED it
// (chestsVisited > 0, the increment sits right after the successful open)
// has the walk AND the open sunk, whatever the take says - the bot stands at
// that chest, and the food read there is scan-and-open only. The widening
// stays modest: the critical-hunger + empty-plate band still gates the fire
// (a rare shape times a rare shape), the deferred/backoff and no-range and
// zero-budget asks still refuse (chestsVisited 0 - nothing was reached),
// and the refusal's why now tells the two drys apart: the ask that never
// reached a chest versus the laws below.

/** The critical hunger band: the ration eats at hunger <= 17 (its own law),
 *  so an EMPTY plate below 17 means the eater is armed with nothing to
 *  serve. The rider fires only INSIDE band 10 (half bar: regen dead, the
 *  flee clock at risk, sprint refused at 6) - the 0.98.0 modesty: the
 *  first slice fires rarely, the field prices the widening. */
export const MIDFIELD_HUNGRY_BAND = 10

/** The rider's own slice: the read rides the paid walk, so its budget is
 *  the scan+open cost, never a walk - 8s cap, 4s floor (thinner and the
 *  chest open itself would starve mid-click). */
export const RIDER_FOOD_MIN_MS = 4000
export const RIDER_FOOD_BUDGET_MS = 8000

/**
 * Pure, junk-safe: should the mid-field food rider fire on THIS fuel ask's
 * paid walk? Returns { fire: true } when every law holds, else
 * { fire: false, why } - the wire prints only the fired exits, the refusals
 * stay quiet (the healthy lean is silent). The laws, in order:
 * (1) the fuel ask REACHED a chest (fuelTaken > 0 OR chestsVisited > 0) -
 *     the walk and the open are sunk (the v0.526.0 visited-dry ride); an ask
 *     deferred, out of range or spent before any open leaves the rider
 *     nothing to ride;
 * (2) the plate is EMPTY (plate === 0) - the armed-ration starvation shape
 *     the 0.516.0 comment named; below-bound plates stay the bank trip's
 *     own tail slice (the field prices them on a face);
 * (3) the hunger read is INSIDE the critical band (hunger <= 10, finite) -
 *     a null/dead read refuses (the mock's honesty is the wire's);
 * (4) the slice funds the read (sliceMs >= RIDER_FOOD_MIN_MS).
 */
export function riderFoodAsk ({ plate = null, hunger = null, fuelTaken = 0, chestsVisited = 0, sliceMs = 0 } = {}) {
  const taken = Number(fuelTaken)
  const visited = Number(chestsVisited)
  const reached = (Number.isFinite(taken) && taken > 0) || (Number.isFinite(visited) && visited > 0)
  if (!reached) return { fire: false, why: 'the ask never reached a chest - the walk is not there to ride' }
  // the Number(null) strikes (the v0.516.0 lesson: a truthy default is not a
  // read) - a null/undefined read is DEAD, never zero, on both body laws.
  if (plate == null) return { fire: false, why: 'the plate read is dead' }
  const plateN = Number(plate)
  if (!Number.isFinite(plateN) || plateN !== 0) return { fire: false, why: 'the plate holds' }
  if (hunger == null) return { fire: false, why: 'the hunger read is dead' }
  const hungerN = Number(hunger)
  if (!Number.isFinite(hungerN) || hungerN < 0) return { fire: false, why: 'the hunger read is dead' }
  if (hungerN > MIDFIELD_HUNGRY_BAND) return { fire: false, why: `the hunger is not critical (band ${MIDFIELD_HUNGRY_BAND})` }
  const slice = Number(sliceMs)
  if (!Number.isFinite(slice) || slice < RIDER_FOOD_MIN_MS) return { fire: false, why: 'the slice cannot fund the read' }
  return { fire: true }
}
