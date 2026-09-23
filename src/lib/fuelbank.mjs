// THE FUEL COMMONS (v0.98.0) - the yard chests fund the smelt legs.
//
// Run86's zero lines named the class three times: bots (F5/F10/F8) stood AT the
// machines with smeltables in the pocket and 'no fuel' - while OTHER bots banked
// their surplus coal into the same yard chests (coal and charcoal are NOT in the
// deposit KEEP list, so the commons exists in every real fleet run; the fleet
// mined 660 coal in run75's era). Nothing ever withdrew from it: deposit.mjs is
// deposit-only, and the smelt leg's pickFuel reads the POCKET only.
//
// THE SLICE: when smeltInventory's pickFuel comes up empty, the leg asks the
// commons BEFORE declaring 'no fuel' - the fuelResupply callback (wired in
// fleet19) walks the nearest yard chests and withdraws a MODEST slice of
// coal/charcoal (cap 6 units, coal preferred, charcoal second - both burn 8
// smelts). The leftover rides the pocket through the leg and the FINAL deposit
// (keep(false)) drains it back to the chests: bank -> withdraw -> burn-or-return
// is a self-healing loop, not a leak.
//
// The window clicks mirror deposit.mjs's hard-won lesson (Chest.deposit/withdraw
// misroute destinations on 26.2's generic_9x3: 8 of 9 moved items landed one past
// the chest range) - every move is our OWN slot arithmetic against the measured
// window view, and the verified inventory diff stays the only truth.

import pathfinderPkg from 'mineflayer-pathfinder'
import { gotoSafe, withTimeout } from './jobqueue.mjs'
import { findChest, chestSlotCount, chestWalkBudgetMs, YARD_CHEST_RADIUS } from './deposit.mjs'
import { fuelNeeded, countItem } from './smelting.mjs'

const { goals } = pathfinderPkg

// Modesty cap: one withdrawal never strips the commons. fuelNeeded('coal', 48)
// = 6 - the largest smelt plan a 600s run realistically carries.
export const FUEL_WITHDRAW_CAP = 6

// Burn priority: both yield 8 smelts/unit; coal is the deeper stock (mined),
// charcoal the renewable one (a future dedicated leg). Order is policy, not
// physics - tests pin it.
export const FUEL_COMMON_ORDER = ['coal', 'charcoal']

/**
 * Pure, junk-safe: what to withdraw from ONE chest view to fuel `itemsNeeded`
 * smeltables. Returns [{ name, count }] (ordered, totals <= cap) or null when
 * the chest holds nothing useful / the ask is junk. The Number(null) family
 * lesson rides here: every numeric input is body-guarded, a junk ask yields
 * null (NOT Infinity, NOT a partial plan).
 */
export function fuelWithdrawPlan ({ itemsNeeded = 0, chestItems = null, cap = FUEL_WITHDRAW_CAP } = {}) {
  const need = Number(itemsNeeded)
  if (!Number.isFinite(need) || need <= 0) return null
  const capN = Number(cap)
  const capSafe = Number.isFinite(capN) && capN > 0 ? Math.floor(capN) : FUEL_WITHDRAW_CAP
  if (!Array.isArray(chestItems)) return null
  const want = Math.min(capSafe, fuelNeeded('coal', Math.ceil(need)))
  if (!(want > 0) || !Number.isFinite(want)) return null
  const plan = []
  let left = want
  for (const fuelName of FUEL_COMMON_ORDER) {
    if (left <= 0) break
    for (const s of chestItems) {
      if (left <= 0) break
      if (!s || s.name !== fuelName || !(s.count > 0)) continue
      const take = Math.min(left, Math.floor(s.count))
      if (take <= 0) continue
      // same-name rows merge into ONE entry - the caller verifies per TYPE via
      // the pocket diff, and a split entry would read as a double take
      const held = plan.find(p => p.name === fuelName)
      if (held) held.count += take
      else plan.push({ name: fuelName, count: take })
      left -= take
    }
  }
  return plan.length > 0 ? plan : null
}

/**
 * Pure, junk-safe: the click pair to move `itemType` from a chest slot (indices
 * < chestSlots) into the POCKET (indices >= chestSlots) - the mirror of
 * deposit.mjs's pickDirectSlots. An unreadable view yields null (the legacy
 * pathway keeps its semantics).
 */
export function pickWithdrawSlots ({ window, itemType, chestSlots } = {}) {
  const slots = Array.isArray(window?.slots)
    ? window.slots
    : (typeof window?.slots === 'function' ? window.slots() : null)
  if (!Array.isArray(slots) || !Number.isFinite(chestSlots) || chestSlots <= 0 || chestSlots >= slots.length) return null
  if (!Number.isFinite(itemType)) return null
  let srcIdx = -1
  for (let i = 0; i < chestSlots; i++) {
    const s = slots[i]
    if (s && s.type === itemType && s.count > 0) { srcIdx = i; break }
  }
  if (srcIdx < 0) return null
  let dstIdx = -1
  for (let i = chestSlots; i < slots.length; i++) {
    const s = slots[i]
    if (!s || s.count <= 0) { dstIdx = i; break } // an empty pocket slot
    if (s.type === itemType && s.count < (s.stackSize ?? 64)) { dstIdx = i; break } // matching pocket stack with room
  }
  if (dstIdx < 0) return null
  return { srcIdx, dstIdx }
}

/**
 * ONE fuel move by raw window clicks: lift the chest stack, drop `take` into
 * the pocket (whole stack when take >= stack count, else right-click singles),
 * return the leftover to the chest slot. Throws on any refusal - the caller's
 * verified inventory diff stays the only truth (the ghost-click doctrine).
 */
export async function withdrawStackMove (bot, window, { srcIdx, dstIdx, take, stackCount, clickTimeoutMs = 5000 } = {}) {
  const n = Number(take)
  const have = Number(stackCount)
  if (!Number.isFinite(n) || n <= 0 || !Number.isFinite(have) || have <= 0) throw new Error('junk take/stackCount')
  const click = async (idx, button, what) => {
    await withTimeout(Promise.resolve(bot.clickWindow(idx, button, 0)), clickTimeoutMs, `click ${what} slot ${idx}`)
  }
  await click(srcIdx, 0, 'chest source') // lift the whole chest stack onto the cursor
  try {
    if (n >= have) {
      await click(dstIdx, 0, 'pocket dest') // drop everything into the pocket
    } else {
      for (let i = 0; i < n; i++) await click(dstIdx, 2, 'pocket single') // right-click drops ONE per click
      await click(srcIdx, 0, 'chest return') // the leftover goes back home
    }
  } catch (e) {
    try { await click(srcIdx, 0, 'return') } catch { /* the diff reports honestly */ }
    throw e
  }
  return { moved: Math.min(n, have) }
}

/**
 * Walk the nearest yard chests and withdraw a modest fuel slice. Never throws.
 * Returns { taken, plan, chestsVisited, reason } - `taken` counts UNITS that
 * VERIFIABLY landed in the pocket (the diff, not the clicks).
 */
export async function withdrawFuelCommons (bot, {
  itemsNeeded = 0,
  maxChests = 3,
  maxDistance = 48,
  yardCenter = null,
  yardRadius = YARD_CHEST_RADIUS,
  cap = FUEL_WITHDRAW_CAP,
  budgetMs = 30000,
  clickTimeoutMs = 5000,
  log = () => {}
} = {}) {
  const ask = Number(itemsNeeded)
  if (!Number.isFinite(ask) || ask <= 0) return { taken: 0, plan: null, chestsVisited: 0, reason: 'nothing to fuel' }
  const started = Date.now()
  const remainingMs = () => budgetMs - (Date.now() - started)
  const wantTotal = Math.min(Number(cap) > 0 ? Math.floor(Number(cap)) : FUEL_WITHDRAW_CAP, fuelNeeded('coal', Math.ceil(ask)))
  const exclude = []
  let taken = 0
  let chestsVisited = 0
  const planAll = []
  for (let c = 0; c < maxChests; c++) {
    if (taken >= wantTotal) break
    if (remainingMs() <= 0) { log(`fuel commons: budget spent (${taken}/${wantTotal} units)`); break }
    const chest = findChest(bot, { maxDistance, exclude, yardCenter, yardRadius, log })
    if (!chest) { if (c === 0) log('fuel commons: no yard chest in range'); break }
    const dist = (() => { try { return Math.round(bot.entity.position.distanceTo(chest.position)) } catch { return null } })()
    // the walk fits INSIDE the resupply slice (the smelt leg's own clock) -
    // chestWalkBudgetMs scales with distance, effectiveWalkBudget clamps into
    // what is actually left
    try {
      await gotoSafe(bot, new goals.GoalNear(chest.position.x, chest.position.y, chest.position.z, 2), { timeoutMs: Math.min(chestWalkBudgetMs(dist ?? 8), remainingMs()), label: 'fuel commons walk' })
    } catch (e) {
      log(`fuel commons: chest walk failed (${e?.message || e})`)
      exclude.push(chest.position.floored ? chest.position.floored() : chest.position)
      continue
    }
    let window = null
    try {
      window = await withTimeout(bot.openChest(chest), 10000, 'open fuel chest')
    } catch (e) {
      log(`fuel commons: open failed (${e?.message || e})`)
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
      const plan = fuelWithdrawPlan({ itemsNeeded: ask - taken, chestItems, cap: wantTotal - taken })
      if (!plan) {
        log('fuel commons: chest holds no fuel')
        exclude.push(chest.position.floored ? chest.position.floored() : chest.position)
        continue
      }
      // per-TYPE pocket snapshots: the verified diff (not the clicks) is the
      // only truth - the ghost-click class has lied here before (deposit.mjs)
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
      let verified = 0
      for (const { name } of plan) {
        const got = Math.max(0, countItem(bot, name) - (beforeOf.get(name) ?? 0))
        if (got > 0) { planAll.push({ name, count: got }); verified += got }
      }
      if (verified > 0) {
        taken += verified
        log(`fuel commons: took ${verified} units (${planAll.map(p => `${p.count} x ${p.name}`).join(', ')}) from a yard chest`)
      } else {
        log('fuel commons: the clicks lied - nothing landed in the pocket (ghost clicks)')
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
