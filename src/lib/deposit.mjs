// Inventory overflow: when a bot's pockets fill up it walks to the nearest chest and
// banks everything except its working kit. The yard (scripts/setup-yard.mjs) keeps
// input rows of chests at spawn, so the walk-back is short for fleet bots working
// around the origin. No op, no commands - vanilla chest windows only.
import pathfinderPkg from 'mineflayer-pathfinder'
import { gotoSafe, withTimeout, waitForWaterRescueClear, walkRetryPlan } from './jobqueue.mjs'
import { PATH_PRIO_BANK } from './pathsemaphore.mjs'
import { walkBudgetMs } from './tripplan.mjs'
import { approachWalk, APPROACH_THRESHOLD, APPROACH_SEGMENT_MS } from './approach.mjs'
import { recordNoPath, nearNoPath, isDeadChestVerdict, NOPATH_TIMEOUT_TTL_MS } from './nopath.mjs' // (v0.62.0) the fleet no-path ledger (v0.65.0: reused for the full-chest ledger; v0.70.0: the timeout verdict joins the ledger)

// ---------------------------------------------------------------------------
// (v0.45.0) THE HOP SEARCH BUDGET - the wall behind 304 unreachable chests.
//
// MEASURED (dispatch 35599777909, v0.43.0+v0.44.0, NORMAL END, mined=3919 best
// ever): the palette rule opened the warehouse - 304 'hop:' lines, banked=0
// anyway. Every hop failed: 159x 'Took to long to decide path to goal!' and
// 102x 'No path to the goal!' while F2 hopped chests from 40 blocks out. The
// miner's global pathfinder budget (searchRadius=32, thinkTimeout=2000 - the
// v0.6.5 OOM fix / v0.17.4 CPU cliff) is tuned for TUNNEL walks: short, walled,
// self-pruning. A yard hop is the opposite - open smooth_stone platform, the
// A* frontier explodes, and under 19-bot CPU starvation 2000ms buys only a
// fraction of the search. Worse: the warehouse spans +-26 blocks of the yard
// origin, so a bot walking back to the yard EDGE stands up to 40+ blocks from
// the far chest row - the goal sits OUTSIDE a 32-block search box and 'No
// path' is guaranteed BY CONSTRUCTION, 8 doomed hops per deposit call.
//
// The cure, two layers + an honest line:
//   (1) a chest beyond HOP_SEARCH_RADIUS is not hopped - findChest returns the
//       NEAREST chest first, so the first out-of-reach chest means ALL of them
//       are; the loop breaks with a named line and the caller's bankFallback
//       walks the bot home (the yard walk works - 14 arrivals this fleet),
//       where every chest is within ~26 blocks;
//   (2) the hop walk itself runs under a TEMPORARY wider budget (radius 48,
//       think 4500ms), restored in a finally - the bank walk holds a
//       PATH_PRIO_BANK throttle slot, so the wider search cannot herd (the
//       OOM lesson was UNBOUNDED searches; 48 is bounded).
export const HOP_SEARCH_RADIUS = 48
export const HOP_THINK_TIMEOUT_MS = 4500

// (v0.46.0) THE PROXIMITY + STALE-VIEW CONSTANTS (their 19:53 sketch items 1+4,
// fleet 35599777909). PROXIMATE_OPEN_DIST: a chest within this distance needs
// no pathfinder hop - openChest's ~4.5 reach governs. STALE_VIEW_MIN_UNITS: a
// raw pocket this full reading bankable 0 is a desynced window view, not an
// honest empty pocket (KEEP holds a handful of items; 10/19 bots refused with
// 43-337 units in pocket). STALE_VIEW_SETTLE_MS: the window-0 resync lands
// right after the close - half a second absorbs the packet flight, the same
// settle the craft path has used since 3fd2e8a.
export const PROXIMATE_OPEN_DIST = 4
export const STALE_VIEW_MIN_UNITS = 24
export const STALE_VIEW_SETTLE_MS = 500
export const STALE_VIEW_WINDOW_MS = 90000
// (v0.65.0) THE FULL-CHEST LEDGER. run61 (dispatch 35677752396, the v0.64.0
// fleet) mined: EVERY chest hop in the run landed on the y=69 lake-bottom
// chests left by earlier runs and delivered ZERO - 4x 'nothing to deposit'
// (the window opened, every click rejected: FULL chests) + 4x 'No path to the
// goal!' (the pathfinder cannot stand next to a water-bottom chest), while the
// empty yard row at y=72 was NEVER reached: nearest-first scan walks every bot
// to the same dead chests, the chain clock dies, banked=0 and 1345u of 2067
// mined (65%) evaporated as despawned drops from full pockets. The 'No path'
// verdicts already have their fleet ledger (v0.62.0); a FULL chest had none -
// each bot re-discovered it with a paid walk + open + doomed clicks. This
// ledger is the same arithmetic (nopath.mjs's pure cell+TTL functions) under
// different constants: a full chest is remembered fleet-wide for one window so
// the scan falls through to the NEXT candidate WITHOUT paying the walk again.
export const CHEST_SLOTS = 27 // single-chest capacity (stacks occupy one slot each)
export const FULL_CHEST_TTL_MS = 180000 // chests do not empty mid-run; 3 min covers any chain pattern
export const FULL_CHEST_CAP = 24 // cap parity with the no-path ledger
// (v0.65.0) TIGHT hit geometry: the full verdict is about THIS chest's CAPACITY,
// not the terrain around it (a no-path verdict wants radius 4 - the walkable
// ring is impassable too). Yard rows pack chests 2 blocks apart: a radius-4
// hit measured live would skip the 8 NEIGHBORS of one full chest ('chest skip
// (full cached 0s ago at [3,64,1])' for a chest 1.41b away - the first probe
// of this ledger caught exactly that). Radius 1 = the same block (findChest
// may hand back the cell with float noise); dy 2 covers a bot reading the row
// from a step above/below.
export const FULL_CHEST_RADIUS = 1
export const FULL_CHEST_DY = 2
/** Free slots in a chest window, pure. `chestItems` is the window's item list
 * (one entry per OCCUPIED slot - mineflayer's chest.items()); a 27-stack single
 * chest or a 54-stack double reads 0 free. A double chest with 28-53 stacks
 * reads 0 too - conservative (the scan skips a chest that may have space)
 * and DELIBERATE: the alternative is another paid walk onto a chest that has
 * rejected clicks before, and the yard always holds more candidates. Junk
 * reads as full capacity (never skip on garbage - the skip costs a deposit). */
export function chestFreeSlots (chestItems = null, capacity = CHEST_SLOTS) {
  const cap = Number.isFinite(capacity) && capacity > 0 ? Math.floor(capacity) : CHEST_SLOTS
  if (!Array.isArray(chestItems)) return cap
  return Math.max(0, cap - chestItems.length)
}

// (v0.48.0) THE RAW HOP. Fleet 35610870878 (v0.47.1): 85x 'chest unreachable
// (Took to long to decide path to goal!)' on hops of d=7-12 - WITH the v0.45.0
// widened think window (4500 ms) already live. A 7-block walk failing to
// decide in 4.5 s is CPU starvation: 19 node processes share the CI runner's
// cores, the pathfinder thinkTimeout measures wall time, and A* on an open
// platform explodes its frontier exactly when 19 bots think at once. The cure
// skips A* entirely for short VISIBLE hops: the repo's proven raw-controls
// pattern (the shelter step-in, the wet-escape traverse) - lookAt the chest,
// forward, hop the step when not converging, stop inside openChest's reach.
// The pathfinder stays for long legs and blind hops (walls between).
export const RAW_HOP_DIST = 10
export const RAW_HOP_MS = 6000

/** Pure: is a chest close enough AND visible enough to walk in raw (no A*)?
 * Junk-safe: invisible, unknown or zero/negative distances all refuse (the
 * pathfinder attempt follows as before). */
export function rawHopDue ({ dist = Infinity, visible = false } = {}) {
  if (visible !== true) return false
  const d = Number(dist)
  if (!Number.isFinite(d) || d <= 0) return false
  if (d > RAW_HOP_DIST) return false
  return true
}

/** Pure: may the pathfinder plausibly reach a chest at this straight-line
 * distance? Junk-safe - a null/NaN distance is "unknown", which passes (the
 * walk attempt then decides, as it always has). */
export function hopReachable (dist, radius = HOP_SEARCH_RADIUS) {
  const d = Number(dist)
  if (!Number.isFinite(d)) return true
  const r = Number.isFinite(radius) && radius > 0 ? radius : HOP_SEARCH_RADIUS
  return d <= r
}

/** Run `runFn` with the bot's pathfinder temporarily widened to the hop
 * budget, restored in a finally (resolve AND reject paths). A bot without a
 * pathfinder (mocks) or junk fields runs as-is. One bot walks one goal at a
 * time, so the mutation cannot race a concurrent walk of the SAME bot. */
export async function withHopPathfinder (bot, runFn) {
  const pf = bot?.pathfinder
  const prevRadius = pf ? pf.searchRadius : undefined
  const prevThink = pf ? pf.thinkTimeout : undefined
  if (pf) {
    try { pf.searchRadius = HOP_SEARCH_RADIUS; pf.thinkTimeout = HOP_THINK_TIMEOUT_MS } catch { /* bare mocks */ }
  }
  try {
    return await runFn()
  } finally {
    if (pf) {
      try { pf.searchRadius = prevRadius } catch { /* mocks */ }
      try { pf.thinkTimeout = prevThink } catch { /* mocks */ }
    }
  }
}

/** (v0.48.0) The raw hop walk: steer the bot INTO the chest's reach with raw
 * controls - no pathfinder, no throttle slot, no think budget. Best-effort by
 * construction: any surprise (waitForTicks on a bare mock, a bot that stops
 * existing) returns false and the caller falls through to the pathfinder
 * attempt. Never throws. */
export async function rawHopWalk (bot, chest, { ms = RAW_HOP_MS, reach = PROXIMATE_OPEN_DIST, log = () => {} } = {}) {
  const distTo = () => {
    try {
      const d = bot?.entity?.position?.distanceTo?.(chest.position)
      return Number.isFinite(d) ? d : Infinity
    } catch { return Infinity }
  }
  if (distTo() <= reach) return true
  const target = (() => { try { return chest.position.offset(0.5, 0.5, 0.5) } catch { return null } })()
  if (!target) return false
  const deadline = Date.now() + (Number.isFinite(ms) && ms > 0 ? ms : RAW_HOP_MS)
  let lastD = distTo()
  try { await bot.lookAt(target, true) } catch { /* steer on the initial bearing */ }
  try { bot.setControlState('forward', true); bot.setControlState('sprint', true) } catch { return false }
  try {
    while (bot.entity && Date.now() < deadline) {
      const d = distTo()
      if (!Number.isFinite(d)) return false
      if (d <= reach) return true
      if (d > lastD - 0.05) {
        // not converging: re-acquire the bearing and hop the step (the
        // shelter step-in's nudge, minus the sprint toggling)
        try { await bot.lookAt(target, true) } catch { /* keep the bearing */ }
        try { bot.setControlState('jump', true) } catch { /* physics will drag us */ }
        try { await bot.waitForTicks(3) } catch { return false }
        try { bot.setControlState('jump', false) } catch { /* already clear */ }
      }
      lastD = d
      try { await bot.waitForTicks(4) } catch { return false }
    }
  } finally {
    try { bot.setControlState('forward', false); bot.setControlState('sprint', false); bot.setControlState('jump', false) } catch { /* nothing held */ }
  }
  return false
}

const { goals } = pathfinderPkg

// (v0.48.0) THE RAW HOP WALK - the end-phase A* saturation, measured and killed
// at its source. Dispatch 35605960761 (56a19b5 = v0.45.0+v0.46.0 first joint
// fleet): NORMAL END but banked=0 again, and the attribution matrix finally
// names the machine-level cause. The heartbeat worker stayed healthy (b] lines
// every 20s, late<=809ms) while the MAIN thread's reporter starved TWICE - a
// 50s window at t~205 (all 19 bots then keepalive-kicked 'Timed out' by the
// server, 13s spread) and a 209s window across the whole end phase (9 more
// bots kicked at its start; 28 mid-run disconnects total; mined rate collapsed
// to 1.81 b/s vs the 6.53 best). The one thread was drowned in pathfinder A*:
// every bot's end-phase bank chain hops warehouse chests with the v0.45.0
// widened search (radius 48 x think 4500ms on an OPEN platform - the v0.6.5
// OOM-class frontier explosion, re-measured as CPU saturation), plus 19 bots'
// mining/trip paths on 2 CI cores shared with the JVM. Under saturation the
// keepalive answers lag past the server's 30s deadline and WALK TIMEOUTS
// CANNOT EVEN FIRE ON TIME (F3: 'timeout after 27527ms' for a 41-block walk).
// THE YARD IS A BUILT FLAT PLATFORM (scripts/setup-yard.mjs): walking a
// straight line on it needs ZERO A*. The hop therefore walks RAW CONTROLS
// FIRST (look + forward + step-jump - the tunnel/shelter/wet-escape lesson
// applied to open flat ground), and only a failed/stalled raw walk falls back
// to the pathfinder hop, which keeps every existing retry/No-path semantic.
export const RAW_HOP_MAX_DIST = 40
export const RAW_HOP_REACH = 3.2
export const RAW_HOP_TICK_MS = 250
export const RAW_HOP_STALL_MS = 2000
export const RAW_HOP_TIMEOUT_MS = 20000

/** Pure: may this hop try the raw walk? Junk-safe - unknown distance passes
 * (the raw walk itself decides with live positions), a water-rescue owner
 * never touches raw controls (the rescue owns them; waitForWaterRescueClear
 * runs before walkOnce, but the flag can re-set mid-chain). */
export function rawHopEligible ({ dist, waterRescue = false } = {}) {
  if (waterRescue) return false
  const d = Number(dist)
  if (!Number.isFinite(d)) return true
  return d <= RAW_HOP_MAX_DIST
}

/** Walk a straight line to `targetPos` with raw controls - NO pathfinder, NO
 * path-queue slot, NO A* CPU. The flat-platform hop: look at the target,
 * hold forward, jump when the walk stops making progress (the platform's
 * steps / a shoved bot). Progress = position delta over the tick window; a
 * stall longer than stallMs fails honestly (the pathfinder fallback then
 * handles whatever the straight line could not: a furnace wall, a crowd).
 * Controls are ALWAYS cleared in the finally - a leaked forward key would
 * walk the bot into the sea after the deposit. */
export async function walkRawToward (bot, targetPos, {
  reach = RAW_HOP_REACH, timeoutMs = RAW_HOP_TIMEOUT_MS,
  tickMs = RAW_HOP_TICK_MS, stallMs = RAW_HOP_STALL_MS, log = () => {}
} = {}) {
  if (!bot?.entity?.position?.distanceTo || !targetPos) throw new Error('raw walk: no position')
  const sleep = ms => new Promise(r => setTimeout(r, ms))
  const started = Date.now()
  let lastPos = null
  let lastProgressAt = started
  let jumpUntil = 0
  try {
    while (true) { // eslint-disable-line no-constant-condition
      const now = Date.now()
      const d = bot.entity.position.distanceTo(targetPos)
      if (Number.isFinite(d) && d <= reach) return { walked: true, ms: now - started, d }
      if (now - started > timeoutMs) throw new Error(`raw walk timeout after ${now - started}ms (d=${Number(d).toFixed(1)})`)
      const moved = lastPos ? bot.entity.position.distanceTo(lastPos) : Infinity
      if (Number.isFinite(moved) && moved < 0.35) {
        if (now - lastProgressAt > stallMs) throw new Error(`raw walk stalled after ${now - lastProgressAt}ms (d=${Number(d).toFixed(1)})`)
        if (now >= jumpUntil) {
          // the step-block case: the platform rows and machine bays sit 1 up
          jumpUntil = now + tickMs * 2
          try { bot.setControlState('jump', true) } catch { /* mocks */ }
          setTimeout(() => { try { bot.setControlState('jump', false) } catch { /* gone */ } }, tickMs)
        }
      } else {
        lastProgressAt = now
      }
      lastPos = bot.entity.position.clone ? bot.entity.position.clone() : bot.entity.position
      const dx = targetPos.x - bot.entity.position.x
      const dz = targetPos.z - bot.entity.position.z
      // mineflayer yaw: 0 faces +z; the yaw that faces the target is atan2(-dx, -dz)
      try { await bot.look(Math.atan2(-dx, -dz), 0, true) } catch { /* mocks / force unsupported */ }
      try { bot.setControlState('forward', true) } catch { /* mocks */ }
      try { bot.setControlState('sneak', false) } catch { /* mocks */ }
      await sleep(tickMs)
    }
  } finally {
    for (const c of ['forward', 'jump', 'sneak', 'sprint']) {
      try { bot.setControlState(c, false) } catch { /* mocks */ }
    }
  }
}

export const CHEST_NAMES = ['chest', 'trapped_chest', 'barrel', 'ender_chest']

// Never banked: the bot needs these to keep working (and to survive the night).
// (v0.9.0) sapling is replant stock: banking it made every bot chop its next tree
// into a bare stump with nothing to plant back - the regrow loop needs the sapling
// to stay in the pocket until it is planted at a stump.
export const KEEP = [
  'pickaxe', 'shovel', 'axe', 'sword', 'hoe', 'crafting_table', 'furnace',
  'stick', 'planks', 'log', 'torch', 'bread', 'apple', 'porkchop', 'beef',
  'carrot', 'potato', 'cooked_', 'sapling'
]

// Rough fullness metric: 36 slots total (27 main + 9 hotbar); stack size 64 makes
// empty slots carry 64 units of headroom.
export function inventoryLoad (bot) {
  const items = bot.inventory.items()
  const used = items.length
  const units = items.reduce((a, i) => a + i.count, 0)
  return { slots: used, free: Math.max(0, 36 - used), units }
}

// (v0.12.0) The mid-run bank gate. The old `slots >= 30` NEVER fired in a real
// fleet: inventoryLoad().slots counts OCCUPIED STACKS, and consolidation merges
// fragmented stacks back together - the 600s fleet (35485296464) ended with
// 40-70 UNITS per bot across ~10-15 stacks, so banked=0 and smelted=0 forever.
// The gate now fires on EITHER signal: pockets fragmenting (24+ stacks) or raw
// loot mass (128 units = two full stacks of cobblestone).
export const BANK_SLOTS = 24
export const BANK_UNITS = 128

export function needsBanking (bot) {
  try {
    const load = inventoryLoad(bot)
    return load.slots >= BANK_SLOTS || load.units >= BANK_UNITS
  } catch {
    return false // an unreadable inventory must not kill the mining loop
  }
}

// (v0.33.0) MINING TRIPS - the banked=0 front.
//
// MEASURED (dispatch 35552013594, 600s on c292cf0): 14x 'final bank: 0 (budget
// exhausted)' - bots dig 100-300 blocks out and only attempt a bank at the
// deadline, when the 150s end-bank budget can never cover the walk back.
// needsBanking (slots>=24 OR units>=128) almost never fires at ~90 mined
// blocks/bot/run, so the whole loot pile rides the pockets for 600s and is
// then lost to the budget wall. The cure is the classic mining-trip cadence:
// bank EARLY, while the walk back is still affordable. Pure policy here (the
// cadence gate + the trip budget); the mechanics live in fleet19's banking
// branch, which already climbs out, walks to the yard and returns to the
// remembered column.
export const BANK_TRIP_EVERY_MS = 150000 // a planned bank trip at most every 2.5 min of digging
export const BANK_TRIP_MIN_UNITS = 48 // ...but only when the pockets hold real loot (measured: ~67 units/bot/600s)
export const BANK_TRIP_MIN_REMAINING_MS = 330000 // never START a trip inside the last 5.5 min
export const BANK_TRIP_FLOOR_MS = 120000 // (v0.28.0) a late bank keeps the 120s mid-run cap as the floor
export const BANK_TRIP_CAP_MS = 300000 // hard ceiling - the 420s hard-kill margin is sacred

/**
 * Should this bot START a planned bank trip now? True when the pockets hold
 * enough loot (units, non-KEEP), enough digging time passed since the last
 * attempt, and the run has enough time LEFT to finish the whole trip without
 * colliding with the end-phase (trip budget <= 300s + the 90s return walk fits
 * inside minRemainingMs). Junk input = no trip (the mining loop must decide
 * fast and never on garbage).
 */
export function bankTripDue ({ units = 0, msSinceBank = 0, remainingMs = Infinity, everyMs = BANK_TRIP_EVERY_MS, minUnits = BANK_TRIP_MIN_UNITS, minRemainingMs = BANK_TRIP_MIN_REMAINING_MS } = {}) {
  const u = Number.isFinite(units) && units > 0 ? units : 0
  if (u < minUnits) return false // nothing worth the walk
  if (!Number.isFinite(remainingMs) || remainingMs < minRemainingMs) return false // too late for a full trip
  const every = Number.isFinite(everyMs) && everyMs > 0 ? everyMs : BANK_TRIP_EVERY_MS
  const since = Number.isFinite(msSinceBank) && msSinceBank > 0 ? msSinceBank : 0
  return since >= every
}

/**
 * The chain budget a planned bank trip may use. The walk there AND back is
 * dist-scaled (2x the straight distance at CHEST_WALK_PER_BLOCK_MS is the
 * measured rule - fleet #128), plus the climb out (~90s measured across
 * v0.26-v0.29 fleets) and the deposit itself (~45s for the chest hops).
 * Clamped to [floor, cap] so arithmetic on junk input can never overrun the
 * hard-kill margin.
 */
export function bankTripBudgetMs ({ yardDist = 0, floorMs = BANK_TRIP_FLOOR_MS, capMs = BANK_TRIP_CAP_MS } = {}) {
  const d = Number.isFinite(yardDist) && yardDist > 0 ? yardDist : 0
  const raw = 90000 + 45000 + 2 * d * CHEST_WALK_PER_BLOCK_MS // climb + deposit + there-and-back
  const floor = Number.isFinite(floorMs) && floorMs > 0 ? floorMs : BANK_TRIP_FLOOR_MS
  const cap = Number.isFinite(capMs) && capMs > floor ? capMs : BANK_TRIP_CAP_MS
  return Math.min(Math.max(raw, floor), cap)
}

// (v0.68.0) THE MID-BANK BUDGET - one arithmetic for BOTH trip paths.
//
// MEASURED (run65, dispatch 35682159103, the second v0.66.0 fleet, NORMAL END):
// mined=2263 at 3.77 b/s (the best rate on record), deaths down to 4, conversion
// 97.1% - the pockets held 2197u at t-0 - and STILL banked=0. Every one of the
// 10 bank trips printed 'pockets full budget 120s' (the needsBanking path) and
// 17/23 chest hops died 'budget exhausted (walk floor)': the climb out (~90s)
// plus the yard walk (90-98s TIMEOUTS for 60-68 block walks, water rescues
// interleaving) consumed the flat 120s chain before the first chest hop. The
// dist-scaled PLANNED trip (up to 300s) never fired once - needsBanking resets
// lastBankAt on every attempt, so the 150s cadence never accumulates while the
// pockets are full. The flat cap was built (v0.28.0) for a bank "right next to
// the deadline"; a mid-run bank 200 blocks out is a different animal and it
// starves by construction.
//
// THE CURE: both paths take the dist-scaled trip budget whenever the run can
// still afford it (the chain + the return-home margin fit inside remainingMs);
// near the deadline the flat floor semantics stay (the hard-kill margin is
// sacred). Pure policy; the caller keeps printing the budget it got.
export const MID_BANK_RETURN_MARGIN_MS = 90000 // the walk home after the deposit (the measured yard-walk scale)

export function midBankBudgetMs ({
  yardDist = 0,
  remainingMs = Infinity,
  floorMs = BANK_TRIP_FLOOR_MS,
  capMs = BANK_TRIP_CAP_MS,
  returnMs = MID_BANK_RETURN_MARGIN_MS
} = {}) {
  const floor = Number.isFinite(floorMs) && floorMs > 0 ? floorMs : BANK_TRIP_FLOOR_MS
  const want = bankTripBudgetMs({ yardDist, floorMs: floor, capMs })
  const left = Number.isFinite(remainingMs) ? remainingMs : Infinity
  if (!Number.isFinite(left)) return want // no deadline in play - the dist-scaled budget
  if (left <= 0) return 0
  // Near the deadline the run cannot spend a bigger chain: keep the flat floor
  // (clamped by what is left - the walk floor would refuse a doomed chain anyway).
  const guard = floor + (Number.isFinite(returnMs) && returnMs > 0 ? returnMs : MID_BANK_RETURN_MARGIN_MS)
  if (left <= guard) return Math.min(floor, left)
  // Mid-run: the dist-scaled budget, never eating the return-home margin
  // (chain + returnMs <= left  =>  B <= left - returnMs; the floor still applies).
  return Math.max(floor, Math.min(want, left - guard + floor))
}

// (v0.34.0) THE FINAL bank chain budget: distance-scaled, margin-aware.
//
// MEASURED (dispatch 35560497949, 600s on 4c7802b): mined=1274, every bot's
// pockets at t-0 held 50-121 units of real loot (cobblestone/dirt/andesite) -
// and 14x 'final bank: 0 (budget exhausted)' STILL fired: the flat 150s chain
// budget cannot cover a 100-300 block walk back to the yard. The budget must
// scale with the distance (the same maths as the mining-trip budget), and it
// must also respect the hard-kill margin: whatever wall clock the bot has
// left past the deadline (margin minus the stagger and the climb already
// spent, minus a safety slice for the report) caps it. Near-yard bots keep
// the historical floor; nobody outruns the kill - by construction.
export function finalBankBudgetMs ({ yardDist = 0, marginLeftMs = Infinity, floorMs = 150000, capMs = 280000 } = {}) {
  if (!Number.isFinite(marginLeftMs) || marginLeftMs <= 0) return 0 // no margin left - refuse fast
  const want = bankTripBudgetMs({ yardDist, floorMs, capMs })
  return Math.min(want, marginLeftMs)
}

// (v0.41.0) THE YARD FILTER - natural-chest worldgen must never hijack a bank
// chain. MEASURED (fleet 35580596054, v0.40.0, the first NORMAL END): the bots
// dug ~400-450 blocks from the yard (dig-fail cells at x=-100..-145, z=388..425
// vs the yard at the spawn origin) - yet ZERO 'scan: no chest within 64b' lines
// printed and ZERO 'walking back' lines fired, while 14/14 fallback whys were
// 'budget exhausted' and F1 burned ~195s INSIDE the pre-deposit in silence.
// The only chests findChest can have found are VANILLA WORLDGEN chests
// (mineshaft/cave/dungeon loot chests at the y=40-60 dig band - CHEST_NAMES
// matches the plain 'chest' block). Every pre-deposit hopped doomed walks to a
// wilderness chest until the chain's clock died, and the yard walk - the only
// delivery that means anything for the materials plan - never fired (the
// v0.38.0 table maps 'budget exhausted' -> none, correctly). Even a SUCCESSFUL
// hop would BANK THE LOOT INTO A WILDERNESS CHEST - lost to the plan anyway.
//
// THE CURE: when the caller knows the yard, a chest only qualifies as a bank
// target if it sits within YARD_CHEST_RADIUS of the yard center. In the
// wilderness the scan then returns null honestly ('scan: no chest within 64b')
// and bankFallback walks the bot HOME - the exact flow v0.36.0's pre-position
// and v0.19.0's yard-walk retries were built for. At the yard the warehouse
// chests all pass the filter and the deposit proceeds unchanged. Junk-tolerant:
// no yard known (null center) = no filter (legacy), a chest with an unreadable
// position is SKIPPED while a filter is active (a blind walk is not a delivery).
export const YARD_CHEST_RADIUS = 64

/** Pure predicate: may this chest position serve as a bank target for a bot
 * banking toward `yardCenter`? Plain-values only (positions stay in the
 * caller), junk-safe: a filter with an unreadable chest position rejects -
 * the fleet cannot deliver to a chest it cannot locate. */
export function chestNearYard ({ chestPos = null, yardCenter = null, radius = YARD_CHEST_RADIUS } = {}) {
  if (!yardCenter) return true // no yard known - no filter (legacy behavior)
  const r = Number.isFinite(radius) && radius > 0 ? radius : YARD_CHEST_RADIUS
  const p = chestPos
  if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) return false
  const y = yardCenter
  if (!Number.isFinite(y.x) || !Number.isFinite(y.y) || !Number.isFinite(y.z)) return true // junk yard - cannot filter
  const dx = p.x - y.x
  const dy = p.y - y.y
  const dz = p.z - y.z
  return Math.sqrt(dx * dx + dy * dy + dz * dz) <= r
}

export function findChest (bot, { maxDistance = 64, exclude = [], log, yardCenter = null, yardRadius = YARD_CHEST_RADIUS } = {}) {
  // (v0.38.0) FLEET EVIDENCE (dispatch 35569034780): F19 stood 19 blocks from the
  // yard's 50 VERIFIED chests (the [yard] survey counted them seconds earlier) and
  // findChest(64) returned null TWICE - pre-deposit and again after the yard walk
  // arrived in 1s ('final bank: 0 (no chest in range)' at walking distance). The
  // bare `catch { return null }` turned EVERY findBlock throw (the v0.9 two-bot
  // palette-crash class, a chunk/palette desync under 19-bot load) into a quiet
  // 'no chest in range' lie. The swallow now NAMES itself (bot position included,
  // so the log can tell an at-the-yard miss from a mid-wilderness one), and ONE
  // retry absorbs the transient throws: a single bad palette tick must not void a
  // bank walk that just cost the bot 100+ blocks of real walking.
  const scan = () => bot.findBlock({
    matching: b => {
      if (!(CHEST_NAMES.includes(b.name) || /_chest$/.test(b.name))) return false
      // (v0.43.0) THE PALETTE CANDIDATE RULE - the fix that reopens the warehouse.
      // MEASURED TWICE: (a) tools.mjs reachableTable (v0.6.7): a position-dependent
      // matcher made every palette section test false, findBlock returned null with
      // the target 3 blocks away; (b) THIS run (dispatch 35591877408, v0.42.1):
      // F10 stood 13 blocks from the 50 verified warehouse chests and the v0.41.0
      // yard filter answered chestNearYard({chestPos: null}) = false for every
      // PALETTE block - mineflayer's fast-path probes the matcher with
      // Block.fromStateId(stateId, 0), which has NO position (blocks.js
      // isBlockInSection) - so every chest section was skipped and findChest
      // returned null: 24x 'scan: no chest within 64b (bankable 126)', banked=0.
      // A palette block is a CANDIDATE, not a target: pass it so the section gets
      // scanned; the real per-block scan re-runs this matcher with true positions
      // and the yard filter applies there (a real far chest is still rejected).
      if (!b.position) return true
      // (v0.23.1) a chest the bot already failed to reach ('No path') is skipped:
      // the yard holds dozens of chests, one unreachable slot must not strand
      // the whole delivery
      if (exclude.length > 0) {
        const p = typeof b.position.floored === 'function' ? b.position.floored() : b.position
        const hit = exclude.some(e => e && e.x === p.x && e.y === p.y && e.z === p.z)
        if (hit) return false
      }
      // (v0.41.0) the yard filter: a chest far from the yard is worldgen loot
      // (or another bot's stray) - hopping it burns the chain's clock and the
      // loot would land nowhere near the warehouse either way
      if (!chestNearYard({ chestPos: b.position, yardCenter, radius: yardRadius })) return false
      return true
    },
    maxDistance
  })
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      return scan()
    } catch (e) {
      const at = (() => {
        try {
          const p = bot.entity?.position
          return p && Number.isFinite(p.x) ? ` at [${Math.round(p.x)},${Math.round(p.y)},${Math.round(p.z)}]` : ''
        } catch { return '' }
      })()
      try { log?.(`findChest swallowed: ${e?.message || e}${at} (attempt ${attempt}/2)`) } catch { /* log never kills a scan */ }
    }
  }
  return null
}

// (v0.39.0) THE FINAL-DEPOSIT RESERVE - the chain's last silent starvation,
// closed. MEASURED (dispatch 35576122228, v0.38.0, first fleet where the walk
// branch WORKS - 5 'walking back', 3 'yard walk arrived'): F9 stood 8 BLOCKS
// from the yard, arrived in 1s, and the chain still died 'budget exhausted' -
// the smelt clamp (min(SMELT_BUDGET, remaining)) had let the smelt eat the
// whole remainder, so the final deposit - the actual point of the chain -
// entered with remaining() <= 0 and refused without a single click. Ten of
// fourteen fallback zeros that run were 'budget exhausted'. The cure: the
// smelt may only spend what remains AFTER a fixed slice reserved for the
// final deposit (walk to the chest is short at the yard, the click sequence
// is seconds). Pure arithmetic, CI-testable.
export const FINAL_DEPOSIT_RESERVE_MS = 30000
export function smeltClampSeconds ({ remainingMs = Infinity, budgetSecs = 90, reserveMs = FINAL_DEPOSIT_RESERVE_MS } = {}) {
  const ms = Number(remainingMs)
  if (Number.isNaN(ms) || ms <= 0) return 0
  if (!Number.isFinite(ms)) return Math.max(0, Math.floor(budgetSecs)) // unbounded legacy clock: full smelt budget
  const usable = ms - reserveMs
  if (usable <= 0) return 0
  return Math.min(budgetSecs, Math.floor(usable / 1000))
}

// (v0.18.5) The chest walk budget, dist-scaled like mapTrip's (tripplan.walkBudgetMs).
// FLEET #128 EVIDENCE (19 bots, 600s, the first fully healthy run): 77 bank attempts,
// banked=0 - the flat timeoutMs=30000 killed every walk to a chest beyond ~25 blocks
// ('chest unreachable (Path was stopped before it could be completed!)'): the walk is
// not the straight line the distance suggests, it is shaft-mouth escape + terrain
// detours (2x the straight distance is the rule, not the exception), and the timeout
// then poisons the RETRY too (the stop races the next goto). The budget scales at
// 500 ms/block (2x the pathfinder ground speed = detour allowance), keeps the
// historical 30s floor for near chests and caps at 60s - still bounded, the
// v0.11.2/v0.6.4 OOM lesson (no open-ended walk windows) stays honoured.
export const CHEST_WALK_BASE_MS = 30000
export const CHEST_WALK_PER_BLOCK_MS = 500
export const CHEST_WALK_CAP_MS = 60000

// (v0.27.0) END-PHASE WALL CLOCK - the fleet's last unbounded loop, closed.
//
// MEASURED (dispatch 35544781892, 600s on 504f744): 17 staggered final climbs
// - 1 OK, 16 'stalled'/'timeout' - and then EVERY bot entered smeltThenBank at
// once. Inside it the deposit chain is combinatorial: depositToChests hops up
// to maxChests=8 chests, each hop walks up to 2x the dist-scaled budget, the
// yard walk retries 3x120s, and the whole chain runs twice (pre-deposit + the
// final deposit). Worst case per bot: tens of minutes - all of it SILENT (a
// failed hop only returns a reason string, nothing prints). 19 bots x doomed
// walks also re-saturated the path throttle (path=6a/6q, stale +3-5/15s), so
// every walk additionally waited 100-150s for a slot that another doomed walk
// held. Nothing finished, FLEET RESULT never printed, HARD KILL (v0.26.0) had
// to take the evidence.
//
// THE CURE is a wall-clock budget threaded down the chain: a caller with a
// deadline passes budgetMs, every hop clamps its walk into the remaining
// time, and a hop that cannot fit its floor gives up immediately with a named
// reason. Bounded chain -> Promise.all(runners) resolves -> printFinalReport
// prints with FULL evidence (fleet-report.json + worldmap save) instead of
// the hard kill's partials. floorMs: a walk with less than this left cannot
// even cross a yard - returning 'budget exhausted' beats burning it on a
// guaranteed timeout.
export const BUDGET_WALK_FLOOR_MS = 5000

/**
 * Pure clamp: the walk budget this attempt may actually use.
 * Junk-tolerant: non-finite remainingMs means UNBOUNDED (no deadline in play)
 * -> the walk's own budget passes through untouched.
 * @param {object} [p]
 * @param {number} [p.distBudget] the walk's own budget (dist-scaled or pinned)
 * @param {number} [p.remainingMs] wall clock left on the caller's budget
 * @param {number} [p.floorMs] below this the walk cannot usefully start (default BUDGET_WALK_FLOOR_MS)
 * @returns {number} ms for this walk; 0 = do not walk (report 'budget exhausted')
 */
export function effectiveWalkBudget ({ distBudget = CHEST_WALK_BASE_MS, remainingMs = Infinity, floorMs = BUDGET_WALK_FLOOR_MS } = {}) {
  const d = Number.isFinite(distBudget) && distBudget > 0 ? distBudget : CHEST_WALK_BASE_MS
  if (!Number.isFinite(remainingMs)) return d // no deadline in play - legacy behavior
  const left = remainingMs
  if (!Number.isFinite(left) || left <= 0) return 0
  const floor = Number.isFinite(floorMs) && floorMs > 0 ? floorMs : BUDGET_WALK_FLOOR_MS
  if (left < floor) return 0 // cannot usefully start - say so instead of timing out
  return Math.min(d, left)
}

// (v0.56.0) see chestWalkBudgetMs - the short-hop class constants
export const CHEST_WALK_SHORT_DIST = 16
export const CHEST_WALK_SHORT_MS = 15000

export function chestWalkBudgetMs (dist) {
  // (v0.56.0) THE SHORT-HOP PIN (the run51 F2 class): F2 stood d=10..11 from the
  // chest rows and its 2 walks ate 30s each ('walk to chest (retry): timeout
  // after 30000ms' - a crowd-crushed stall, not a distance problem), then the
  // walk floor refused the 3rd chest. A d<=16 walk physically needs ~8s; a
  // 30s+ budget per attempt lets ONE stuck walk starve the whole hop loop.
  // Pin the short class to 15s: 3 short hops still fit the chain clock, and a
  // genuinely blocked short walk fails fast enough to try the NEXT chest.
  const d = Number.isFinite(dist) && dist > 0 ? dist : 0
  if (d <= CHEST_WALK_SHORT_DIST) {
    return Math.min(CHEST_WALK_SHORT_MS, walkBudgetMs({
      dist,
      base: CHEST_WALK_BASE_MS,
      perBlock: CHEST_WALK_PER_BLOCK_MS,
      cap: CHEST_WALK_CAP_MS,
      overhead: 5000
    }))
  }
  return walkBudgetMs({
    dist,
    base: CHEST_WALK_BASE_MS,
    perBlock: CHEST_WALK_PER_BLOCK_MS,
    cap: CHEST_WALK_CAP_MS,
    overhead: 5000
  })
}

// (v0.36.0) The YARD walk budget, dist-scaled at last. MEASURED (dispatch
// 35562867668): 13x 'final bank: 0 (budget exhausted)' fired even with the
// v0.34.0 dist-scaled chain budget - the CHAIN grew, but the yard walk inside
// it kept the flat 120s distBudget (the v0.19.0 pin), and a 150-300 block
// walk physically cannot fit 120s at the 500ms/block rule: how much the chain
// received, the hop still could not spend. The budget now scales with the
// SAME 2x-detour maths as the chest walks, caps at 180s (a chain that cannot
// afford 180s of walking has no business starting one), and is still clamped
// by the caller's remaining chain budget through effectiveWalkBudget - the
// hard-kill margin stays untouched by construction.
export const YARD_WALK_CAP_MS = 180000

export function yardWalkBudgetMs ({ yardDist = 0, floorMs = CHEST_WALK_BASE_MS, capMs = YARD_WALK_CAP_MS } = {}) {
  const d = Number.isFinite(yardDist) && yardDist > 0 ? yardDist : 0
  const raw = CHEST_WALK_BASE_MS + 2 * d * CHEST_WALK_PER_BLOCK_MS
  const floor = Number.isFinite(floorMs) && floorMs > 0 ? floorMs : CHEST_WALK_BASE_MS
  const cap = Number.isFinite(capMs) && capMs >= floor ? capMs : YARD_WALK_CAP_MS
  return Math.min(Math.max(raw, floor), cap)
}

// (v0.72.0) THE SLOT-DIRECT DEPOSIT MACHINERY. The probe finally named the
// wall: mineflayer's Chest.deposit misroutes its destination for 26.2's
// generic_9x3 (8 of 9 withdrawn dirt landed on window slot 27 - the first
// PLAYER slot, one past the chest range). The transport and the window view
// are PROVEN truthful (the raw packet, the slot map and the server NBT
// agreed per slot), so the cure clicks with our own arithmetic against the
// measured view: chest range = total slots - 36 player slots.
export function chestSlotCount (window) {
  const slots = Array.isArray(window?.slots)
    ? window.slots
    : (typeof window?.slots === 'function' ? window.slots() : null)
  const len = Array.isArray(slots) ? slots.length : 0
  if (!len || len <= 36) return 0 // a player-only view has no chest range
  return len - 36
}

/** Pure: the click pair for ONE whole-stack move - the first pocket stack of
 * `itemType` (indices >= chestSlots) and the first chest slot (indices < chestSlots)
 * that accepts it (empty, or a matching stack with room). Junk-safe: an
 * unreadable view yields null (the legacy pathway keeps its semantics). */
export function pickDirectSlots ({ window, itemType, chestSlots }) {
  const slots = Array.isArray(window?.slots)
    ? window.slots
    : (typeof window?.slots === 'function' ? window.slots() : null)
  if (!Array.isArray(slots) || !Number.isFinite(chestSlots) || chestSlots <= 0 || chestSlots >= slots.length) return null
  if (!Number.isFinite(itemType)) return null
  let srcIdx = -1
  for (let i = chestSlots; i < slots.length; i++) {
    const s = slots[i]
    if (s && s.type === itemType && s.count > 0) { srcIdx = i; break }
  }
  if (srcIdx < 0) return null
  let dstIdx = -1
  for (let i = 0; i < chestSlots; i++) {
    const s = slots[i]
    if (!s || s.count <= 0) { dstIdx = i; break } // an empty chest slot
    if (s.type === itemType && s.count < (s.stackSize ?? 64)) { dstIdx = i; break } // matching stack with room
  }
  if (dstIdx < 0) return null
  return { srcIdx, dstIdx }
}

/** ONE whole-stack move by raw window clicks - both indices come from the
 * measured window view, the cursor returns home if the put fails. Throws on
 * any refusal; the caller's verified inventory diff stays the only truth. */
export async function depositStackDirect (bot, window, { itemType, chestSlots, clickTimeoutMs = 5000 } = {}) {
  const pair = pickDirectSlots({ window, itemType, chestSlots })
  if (!pair) throw new Error('no direct pair (no source stack or no accepting chest slot)')
  const click = async (idx, what) => {
    await withTimeout(Promise.resolve(bot.clickWindow(idx, 0, 0)), clickTimeoutMs, `click ${what} slot ${idx}`)
  }
  await click(pair.srcIdx, 'source') // pick up the whole pocket stack
  try {
    await click(pair.dstIdx, 'dest') // put it down in the chest slot
  } catch (e) {
    try { await click(pair.srcIdx, 'return') } catch { /* the diff reports honestly */ }
    throw e
  }
  return pair
}

/**
 * Deposit everything non-essential into a chest. Steps: pick a chest (the nearest one
 * unless given), walk to it on foot, open the window, deposit item by item (a full or
 * desynced chest only costs us that one item type), close it. Never throws - the return
 * value tells the caller what happened, because a failed deposit must not kill a bot.
 *
 * (v0.18.5) The walk is rescue-aware: a bot mid-drowning used to lose the attempt
 * INSTANTLY ('chest unreachable (water rescue in progress (walk to chest refused))' -
 * fleet #128 line class) because the fail-fast gate refuses goals while the rescue
 * owns the controls. Now: the first refusal waits out ONE bounded rescue window
 * (waitForWaterRescueClear, the same treatment smeltBatch got in v0.18.2) and retries
 * once with the same budget - the rescue's 25s window is cheaper than the walk's
 * whole deposit being lost.
 */
export async function depositToChest (bot, {
  chestBlock = null,
  keep = KEEP,
  maxDistance = 64,
  log = () => {},
  timeoutMs = null, // null = dist-scaled auto budget (chestWalkBudgetMs); a number pins it (tests)
  budgetMs = null, // (v0.27.0) wall-clock cap on the WHOLE attempt (walk retries incl.) - the end-phase chain budget
  exclude = [], // (v0.23.1) chest positions already dead-ended ('No path') - skipped in the scan
  noPathLedger = null, // (v0.62.0) a SHARED array across the fleet: 'No path' verdicts skip the A* for everyone
  fullChestLedger = null, // (v0.65.0) a SHARED array across the fleet: 'chest full' verdicts skip the paid walk
  depositClickTimeoutMs = 5000 // (v0.70.0) per-click wall; tests inject a small value instead of sleeping 5s
} = {}) {
  const chest = chestBlock ?? findChest(bot, { maxDistance, exclude, log })
  if (!chest) return { deposited: 0, reason: 'no chest in range' }
  const tag = `[${bot.username ?? 'bot'}]`

  // (v0.27.0) the chain budget: a finite budgetMs > 0 sets a deadline every
  // walk must fit; an explicit <= 0 means the caller already knows the clock
  // is spent (skip without walking); junk/null = unbounded (legacy mid-run).
  const hasBudget = Number.isFinite(budgetMs)
  if (hasBudget && budgetMs <= 0) return { deposited: 0, reason: 'budget exhausted' }
  const deadline = hasBudget && budgetMs > 0 ? Date.now() + budgetMs : null
  const remaining = () => (deadline == null ? Infinity : deadline - Date.now())

  let budget = CHEST_WALK_BASE_MS
  if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
    budget = timeoutMs // explicit caller choice wins
  } else if (bot.entity?.position?.distanceTo && chest.position) {
    try { budget = chestWalkBudgetMs(bot.entity.position.distanceTo(chest.position)) } catch { /* floor stays */ }
  }

  // (v0.21.0) bank walks jump the fleet queue: a banked walk is the only one that
  // turns mined blocks into stock - under path saturation it must not wait behind
  // next-column walks (fleet v0.19.2: path=6a/10q at final-bank time, banked=0).
  // (v0.27.0) each attempt re-clamps into the remaining wall clock - a retry may
  // not restart the full budget after the first attempt already ate most of it.
  const walkOnce = async label => {
    let ms = effectiveWalkBudget({ distBudget: budget, remainingMs: remaining() })
    if (ms <= 0) throw new Error('budget exhausted (walk floor)')
    // (v0.56.0) THE APPROACH SEGMENT - the run51 F17 cure. F17 surfaced d=33..43
    // from the chest rows and 7x 'No path to the goal!' fired under the WIDENED
    // hop budget (radius 48): a direct goal across quarried terrain needs a path
    // longer than the search envelope BY CONSTRUCTION, so every retry repeated
    // the identical doomed geometry until the walk floor ate the chain. When the
    // chest is beyond APPROACH_THRESHOLD, first walk ONE raw/pathfinder segment
    // (max 20 blocks, always inside the searchRadius 32 envelope) toward it -
    // the direct ladder below then routes a goal it can actually reach. The
    // segment spends the same wall clock; the slice re-clamps afterwards so the
    // walk floor stays honest.
    const d0 = (() => { try { return bot.entity?.position?.distanceTo?.(chest.position) } catch { return null } })()
    // AFFORDABILITY + SCOPE: the approach exists for the END-PHASE chain (the
    // run51 F17 evidence is a finite-budget final bank), so a finite chain
    // clock is required - the legacy unbounded mid-run calls (budgetMs null)
    // keep byte-identical behavior, and an approach the clock cannot pay for
    // (one segment + the walk floor) is a doomed hop with extra steps anyway.
    const chainLeft = remaining()
    if (Number.isFinite(d0) && d0 > APPROACH_THRESHOLD && Number.isFinite(chainLeft) && chainLeft >= APPROACH_SEGMENT_MS + BUDGET_WALK_FLOOR_MS) {
      await approachWalk(bot, chest.position, {
        rawWalk: walkRawToward,
        segmentMs: Math.min(ms, APPROACH_SEGMENT_MS),
        // (v0.61.0) THE BUDGET LOOP: the approach may spend the whole chain
        // clock except the direct-ladder floor. Run58 measured the old cap of
        // 2 segments doomed BY ARITHMETIC on chests d=60-75 ('2 segment(s)
        // walked, goal now d=34.1 (still outside)') - the loop now closes
        // while the chain clock (distance-scaled since v0.34.0, so it sized
        // for exactly this walk) and per-segment progress last.
        budgetMs: Math.max(0, chainLeft - BUDGET_WALK_FLOOR_MS),
        log: m => log?.(`${tag} ${m}`)
      })
      ms = effectiveWalkBudget({ distBudget: budget, remainingMs: remaining() })
      if (ms <= 0) throw new Error('budget exhausted (walk floor)')
    }
    // (v0.48.0) RAW FIRST: the flat yard platform needs no A* - 19 concurrent
    // radius-48 hops saturated the one node thread for 209s (dispatch
    // 35605960761) and the server keepalive-kicked every bot mid-walk. The raw
    // walk costs no path slot and near-zero CPU; a stall/timeout falls through
    // to the pathfinder hop below, which keeps every retry/No-path semantic.
    // The proximate case never gets here (walked=true at entry); a water-rescue
    // owner keeps the pathfinder path too (raw controls are ITS controls).
    if (rawHopEligible({ dist: (() => { try { return bot.entity?.position?.distanceTo?.(chest.position) } catch { return null } })(), waterRescue: bot._waterRescue === true })) {
      try {
        return await walkRawToward(bot, chest.position, { timeoutMs: Math.min(ms, RAW_HOP_TIMEOUT_MS), log })
      } catch (e) {
        log?.(`${tag} raw hop failed: ${e.message} - pathfinder retry`)
      }
    }
    // (v0.45.0) the hop runs under the widened hop budget (radius 48, think
    // 4500ms) and restores the tunnel tuning in a finally - the global 32/2000
    // pair made every open-platform hop 'No path' or 'Took to long' (304x,
    // dispatch 35599777909). (v0.46.0) range 2 -> 3 (their 19:53 sketch item 2):
    // at a PACKED chest row the within-2 standable cells are scarce (102x 'No
    // path'); range 3 quadruples the goal-cell candidates while openChest's
    // ~4.5 reach still holds from any of them. (v0.48.0) this is now the
    // FALLBACK: the raw walk owns the flat platform, the pathfinder owns
    // whatever a straight line cannot cross.
    return withHopPathfinder(bot, () =>
      gotoSafe(bot, new goals.GoalNear(chest.position.x, chest.position.y, chest.position.z, 3), { timeoutMs: ms, label, priority: PATH_PRIO_BANK }))
  }
  // (v0.46.0) THE PROXIMITY FAST-PATH (their 19:53 sketch item 1): a bot that
  // ALREADY stands within reach of the chest must not spend a pathfinder hop
  // (and its throttle slot + think budget) re-deciding what a straight look can
  // settle - openChest's own reach check governs, exactly like the smelt visit.
  // MEASURED: 12-64b yard walks arrived and the hop STILL burned the decision
  // clock on a 3-6 block walk; F6 hopped 8 distinct warehouse chests, all refused.
  const proximate = (() => {
    try {
      const d = bot.entity?.position?.distanceTo?.(chest.position)
      return Number.isFinite(d) && d <= PROXIMATE_OPEN_DIST
    } catch { return false }
  })()
  let walked = proximate
  // (v0.48.0) THE RAW HOP: a short VISIBLE chest is walked in with raw
  // controls - the 19-bot pathfinder cannot decide a 7-block open-platform
  // walk inside its think window (85x 'Took to long' on v0.47.1), and a
  // straight look-and-forward needs no decision at all. Guards: no raw walk
  // while a water rescue owns the controls (it IS the walk) and no raw walk
  // when the chest is not visible (walls between - that is pathfinder work).
  // Bounded: RAW_HOP_MS max, then the pathfinder attempt runs exactly as
  // before - the raw miss costs seconds, never the attempt.
  if (!walked && bot._waterRescue !== true) {
    let visible = false
    try { visible = typeof bot.canSeeBlock === 'function' && !!chest.position && bot.canSeeBlock(chest) === true } catch { visible = false }
    let d0 = Infinity
    try { d0 = bot.entity?.position?.distanceTo?.(chest.position) } catch { /* unknown -> refuse */ }
    if (rawHopDue({ dist: d0, visible })) {
      const t0 = Date.now()
      walked = await rawHopWalk(bot, chest, { log })
      if (walked) log(`${tag} hop: raw walk in (d=${d0.toFixed(1)} visible, ${(Date.now() - t0)}ms - no pathfinder: the CPU-starved A* cannot decide a short walk in time)`)
      else log(`${tag} hop: raw walk missed the reach window (d=${d0.toFixed(1)}) - the pathfinder attempt follows`)
    }
  }
  // (v0.20.1) ONE retry policy for every walk-failure class: walkRetryPlan is the
  // single source of truth (the yard walk in fleet19.mjs has run it since v0.19.0).
  //   water rescue -> wait out the rescue window, then the retry (v0.18.5 behavior)
  //   Path stopped -> immediate retry - the stale-flag settle transient that fleet
  //     #128 measured 77x (banked=0, 3298 blocks stuck in pockets); the v0.20.0
  //     gotoSafe pre-clear defuses the poison at the SOURCE, this retry is the
  //     belt-and-braces layer for whatever else stops a path mid-walk
  //   timeout -> one retry (the first budget may have burned on a poisoned/stuck
  //     walk, not on real distance); still bounded: max 2 walks x 60s cap
  //   everything else (no path, ...) -> give up, the geometry is real
  let lastError = null
  for (let attempt = 1; attempt <= 2 && !walked; attempt++) {
    try {
      await walkOnce(attempt === 1 ? 'walk to chest' : 'walk to chest (retry)')
      walked = true
    } catch (e) {
      lastError = e
      const plan = walkRetryPlan({ error: e, attempt, maxAttempts: 2 })
      if (plan.action === 'wait-rescue') {
        const cleared = await waitForWaterRescueClear(bot, { maxMs: plan.waitMs })
        if (!cleared) break // the rescue owns the bot longer than its own window - a stuck sentry
        continue
      }
      if (plan.action === 'immediate' || plan.action === 'timeout-retry') continue
      break // give-up: real geometry or the attempt budget is spent
    }
  }
  if (!walked) {
    const lastMsg = lastError && lastError.message ? lastError.message : 'walk failed'
    // (v0.62.0) THE FLEET LEDGER RECORD: a 'No path' verdict is paid for by the
    // WHOLE process (a sync A* exhaustion blocks all 19 bots). Cache it so the
    // other bots' hops for the same chest skip the search entirely.
    // (v0.70.0) THE TIMEOUT VERDICT JOINS THE LEDGER: run67 (dispatch
    // 35692049905) measured 24x 'chest unreachable (Took to long to decide
    // path to goal!)' on the SAME y=69-72 lake-bottom chests while the ledger
    // only matched /No path/i - every bot re-paid the walk + the full A*
    // exhaustion, and that exhaustion storm is the fuel of the run's one 44s
    // main-thread freeze. isDeadChestVerdict routes BOTH dead shapes here;
    // the timeout shape (weak evidence) rides the shorter NOPATH_TIMEOUT_TTL_MS.
    if (Array.isArray(noPathLedger) && chest.position) {
      const verdict = isDeadChestVerdict(lastMsg)
      if (verdict.dead) {
        const deadCell = typeof chest.position.floored === 'function' ? chest.position.floored() : chest.position
        if (deadCell && Number.isFinite(deadCell.x)) {
          const fresh = recordNoPath(noPathLedger, deadCell, Date.now(), verdict.timeout ? { ttl: NOPATH_TIMEOUT_TTL_MS } : {})
          noPathLedger.length = 0
          for (const e of fresh) noPathLedger.push(e)
          log(`${tag} no-path ledger: chest at [${deadCell.x ?? '?'},${deadCell.y ?? '?'},${deadCell.z ?? '?'}] cached for the fleet (${noPathLedger.length} live${verdict.timeout ? ', timeout verdict' : ''})`)
        }
      }
    }
    // (v0.23.1) ONE CHEST MUST NOT STRAND THE DELIVERY. FLEET EVIDENCE (3e21d58,
    // final bank): 5x 'chest unreachable (No path to the goal!)' - the NEAREST
    // chest's walk dead-ends (a pond between, a terrain rim, unloaded chunks) and
    // the whole deposit died with the loot still in pockets while the yard held
    // dozens of other chests. When the caller let US pick the chest (chestBlock
    // null) and the failure is the pathfinder's 'No path' (not a timeout, not a
    // rescue), exclude exactly that chest and scan again - once (exclude.length
    // guard): two dead chests mean the terrain is the problem, not the slot.
    // A caller who pinned chestBlock gets their failure back: their choice is final.
    if (!chestBlock && exclude.length === 0 && isDeadChestVerdict(lastMsg).dead && chest.position) {
      const dead = typeof chest.position.floored === 'function' ? chest.position.floored() : chest.position
      if (dead && Number.isFinite(dead.x)) {
        // the hop is a resilience attempt: report the PRIMARY failure ('No path to
        // the nearest chest') when the second candidate also fails, and the second
        // candidate's success when it does not
        // (v0.27.0) the hop inherits the SAME wall clock, not a fresh budget
        const second = await depositToChest(bot, { keep, maxDistance, log, timeoutMs, budgetMs: remaining(), exclude: [dead], noPathLedger })
        if (second.deposited > 0) return second
        return { deposited: 0, reason: `chest unreachable (${lastMsg})` }
      }
    }
    return { deposited: 0, reason: `chest unreachable (${lastMsg})` }
  }

  // (v0.25.0) TWO open attempts: fleet 35538062596 F10 walked the whole way and
  // died here - 'cannot open chest (open chest: timeout after 10000ms)' - while
  // the server lagged 1.3s per event (late=1324ms under 19 bots): a slow window
  // open must not void a 60s walk. One re-look + one retry costs seconds; a lost
  // deposit costs the whole pocket.
  let window = null
  let openErr = null
  for (let attempt = 1; attempt <= 2 && !window; attempt++) {
    try {
      window = await withTimeout(bot.openChest(chest), 10000, 'open chest')
    } catch (e) {
      openErr = e
      if (attempt === 1) {
        try { await bot.lookAt(chest.position.offset(0.5, 0.5, 0.5), true) } catch { /* retry anyway */ }
      }
    }
  }
  if (!window) {
    return { deposited: 0, reason: `cannot open chest (${openErr && openErr.message ? openErr.message : 'unknown'})` }
  }
  // (v0.65.0) THE FULL-CHEST VERDICT, read BEFORE the click loop: the window's
  // item list (one entry per occupied slot) at capacity means every click below
  // is a doomed 5s timeout - run61 paid walk+open+27 timeouts per bot per chest
  // for chests an earlier run had filled. Record the verdict for the FLEET (the
  // same shared-array ride as noPathLedger) and let the caller's scan fall
  // through to the next candidate. window.items() is defensive: the mock
  // windows in tests (and any odd wrapper) may not expose it - junk reads as
  // not-full, the click loop keeps its original semantics.
  const chestItems = typeof window.items === 'function' ? (() => { try { return window.items() } catch { return null } })() : null
  const freeSlots = chestFreeSlots(chestItems)
  if (Array.isArray(chestItems) && freeSlots <= 0) {
    if (Array.isArray(fullChestLedger) && chest.position) {
      const fullCell = typeof chest.position.floored === 'function' ? chest.position.floored() : chest.position
      if (fullCell && Number.isFinite(fullCell.x)) {
        const fresh = recordNoPath(fullChestLedger, fullCell, Date.now(), { ttl: FULL_CHEST_TTL_MS, cap: FULL_CHEST_CAP })
        fullChestLedger.length = 0
        for (const e of fresh) fullChestLedger.push(e)
        log(`${tag} full-chest ledger: chest at [${fullCell.x ?? '?'},${fullCell.y ?? '?'},${fullCell.z ?? '?'}] cached for the fleet (${fullChestLedger.length} live, ttl ${Math.round(FULL_CHEST_TTL_MS / 1000)}s)`)
      }
    }
    try { window.close?.() } catch { /* already closed */ }
    return { deposited: 0, reason: `chest full (${CHEST_SLOTS}/${CHEST_SLOTS} slots taken)` }
  }

  let deposited = 0
  const skipped = []
  let timeoutSkips = 0
  let moved0Skips = 0
  let directMoves = 0
  let directFalls = 0
  // (v0.72.0) THE SLOT-DIRECT CURE: the probe (run e0fbe24/32131a4, job
  // 106670204727) finally named the banked=0 wall of ~130 fleets. Transport
  // (the raw window_items packet) MATCHED the server truth exactly, the
  // mapped window.slots MATCHED the packet, the withdraw clicks moved items
  // server-side - and Chest.deposit STILL misrouted its put: 8 of 9 withdrawn
  // dirt landed on WINDOW SLOT 27, the FIRST PLAYER-INVENTORY slot, one past
  // the single-chest range [0,27). mineflayer's Chest destination arithmetic
  // is off for 26.2's generic_9x3, so every fleet deposit either stacked one
  // item or landed in the bot's own pocket - and the verified diff read
  // moved=0 forever. The cure routes the put DIRECTLY: both click indices
  // come from the MEASURED window view (proven truthful), the chest range is
  // derived from the view (total slots - 36 player slots), and the inventory
  // diff keeps the verified-transfer semantics.
  const chestSlots = chestSlotCount(window)
  if (chestSlots > 0) log(`${tag} direct deposit: ${chestSlots} chest slots derived from the ${(() => { const s = Array.isArray(window.slots) ? window.slots.length : (typeof window.slots === 'function' ? window.slots().length : 0); return s })()}-slot view`)
  const countOf = name => bot.inventory.items().filter(i => i.name === name).reduce((a, i) => a + i.count, 0)
  try {
    for (const item of bot.inventory.items()) {
      if (keep.some(k => item.name.includes(k))) { skipped.push(item.name); continue }
      // VERIFIED TRANSFER (the 26.2 stack silently drops some window clicks): the only
      // truth is the inventory afterwards, so count before/after instead of trusting
      // the deposit call's resolution.
      const before = countOf(item.name)
      let done = false
      if (chestSlots > 0 && typeof bot.clickWindow === 'function') {
        try {
          await withTimeout(depositStackDirect(bot, window, { itemType: item.type, chestSlots, clickTimeoutMs: depositClickTimeoutMs }), depositClickTimeoutMs * 2, `direct deposit ${item.name}`)
          done = true
        } catch { directFalls++ /* the legacy pathway gets the stack */ }
      }
      if (!done) {
        try {
          await withTimeout(window.deposit(item.type, null, item.count), depositClickTimeoutMs, `deposit ${item.name}`)
        } catch {
          timeoutSkips++
          skipped.push(`${item.name}(timeout)`) // the 5s wall: server lag or a dead window
          continue
        }
      } else directMoves++
      const moved = before - countOf(item.name)
      if (moved > 0) deposited += moved
      else { moved0Skips++; skipped.push(`${item.name}(moved0)`) } // resolved, moved nothing: the ghost click
    }
  } finally {
    try { window.close?.() } catch { /* already closed */ }
  }
  if (deposited > 0) log(`${tag} banked ${deposited} items at ${chest.position.floored()} (direct=${directMoves} fallback=${directFalls} kept: ${skipped.slice(0, 4).join(', ') || 'nothing'})`)
  // (v0.70.0) the zero hop NAMES ITS MECHANISM: run68 (the first 600s fleet)
  // ended every reached chest with 'nothing to deposit' and the swallowed skip
  // reasons could not separate a lag timeout from the 26.2 ghost click - two
  // different cures. The detail rides the reason (the chestDead regex still
  // matches the prefix) and the caller's hop line prints it for free.
  const detail = (timeoutSkips || moved0Skips) ? ` (t=${timeoutSkips},m0=${moved0Skips})` : ''
  return { deposited, reason: deposited > 0 ? 'ok' : `nothing to deposit${detail}` }
}

/**
 * Multi-chest continuation: keep walking to the nearest UNUSED chest while bankable
 * items remain. A single full chest then costs a walk, not the whole delivery.
 * Returns { deposited, chestsUsed, chestReport } - never throws.
 */
export async function depositToChests (bot, { maxChests = 8, findRadius = 64, keep = KEEP, log = () => {}, budgetMs = null, yardCenter = null, yardRadius = YARD_CHEST_RADIUS, noPathLedger = null, fullChestLedger = null } = {}) {
  let total = 0
  let chestsUsed = 0
  const reports = []
  const tried = [] // (v0.23.1) chest positions that refused a walk ('No path')
  // (v0.27.0) chain budget: finite > 0 = deadline for the WHOLE hop loop; <= 0 =
  // already spent (no hop at all); junk/null = unbounded (legacy mid-run calls).
  const hasBudget = Number.isFinite(budgetMs)
  if (hasBudget && budgetMs <= 0) return { deposited: 0, chestsUsed: 0, chestReport: ['budget exhausted'] }
  const deadline = hasBudget && budgetMs > 0 ? Date.now() + budgetMs : null
  const remaining = () => (deadline == null ? Infinity : deadline - Date.now())
  const bankableItems = () => {
    try {
      return bot.inventory.items().filter(i => !keep.some(k => i.name.includes(k))).reduce((a, i) => a + i.count, 0)
    } catch { return 0 }
  }
  // (v0.38.0) HONEST REASONS: bankable=0 and scan-miss are different zeros and
  // used to collapse into the same 'no chest in range' (depositLoot's default
  // when chestReport is empty) - which made the fallback WALK a bot whose pocket
  // held nothing bankable (fleet evidence: F1's log+planks+sapling KEEP pocket
  // burned a trip on a walk that could never deliver). The early return speaks
  // the truth and lets bankFallback stay home.
  //
  // (v0.46.0) THE STALE-VIEW GUARD (their 19:53 sketch item 4, fleet 35599777909):
  // 10/19 bots ended 'nothing to deposit' while their pockets held 43-337 units
  // SERVER-SIDE - the 26.2 window desync ERASED the items from the client view
  // (the '[empty]' flip), so bankable computes 0 from the same stale read the
  // reporter used and the chain refuses without a single click. The client
  // CANNOT distinguish an honest empty from a stale empty on the read alone -
  // but it can REMEMBER: the memo carries the last good bankable count and its
  // timestamp (a full pocket seen moments ago + no deposit since = the view is
  // the suspect, not the pocket). A chest within arm's reach then gets ONE
  // open+close probe - the vanilla close reconciles window 0 - and the re-count
  // decides: an honest zero still refuses, a re-synced pocket deposits.
  const bankable = bankableItems()
  if (bankable > 0) bot._bankableMemo = { units: bankable, at: Date.now() }
  if (bankable <= 0) {
    const memo = bot._bankableMemo
    const stale = !!memo && memo.units >= STALE_VIEW_MIN_UNITS && (Date.now() - memo.at) <= STALE_VIEW_WINDOW_MS
    if (stale) {
      const probeChest = findChest(bot, { maxDistance: PROXIMATE_OPEN_DIST, exclude: [], log, yardCenter, yardRadius })
      if (probeChest) {
        try {
          const w = await withTimeout(bot.openChest(probeChest), 10000, 'stale-view probe open')
          try { w.close?.() } catch { /* the close is the point: vanilla re-syncs window 0 */ }
          await new Promise(resolve => setTimeout(resolve, STALE_VIEW_SETTLE_MS))
          log(`[${bot.username ?? 'bot'}] stale-view probe: bankable read 0 but a pocket of ${memo.units} was seen ${Math.round((Date.now() - memo.at) / 1000)}s ago - window resynced, re-counting`)
        } catch (e) {
          log(`[${bot.username ?? 'bot'}] stale-view probe failed: ${e?.message || e}`)
        }
      }
    }
    if (bankableItems() <= 0) return { deposited: 0, chestsUsed: 0, chestReport: ['nothing to deposit'] }
  }
  for (let n = 0; n < maxChests && bankableItems() > 0; n++) {
    if (deadline != null && remaining() <= 0) { reports.push('budget exhausted'); break }
    const chest = findChest(bot, { maxDistance: findRadius, exclude: tried, log, yardCenter, yardRadius })
    if (!chest) {
      // (v0.38.0) the scan-miss names itself: 'no chest in range' has been proven
      // a lie twice (F19: null at 19 blocks from 50 verified chests) - this line
      // pins WHERE the scan gave up and how much loot was left standing, so the
      // next dispatch can tell a real wilderness miss from an at-the-yard one.
      log(`[${bot.username ?? 'bot'}] scan: no chest within ${findRadius}b (bankable ${bankableItems()})`)
      break
    }
    // (v0.45.0) THE FAR-CHEST SKIP: a chest beyond HOP_SEARCH_RADIUS cannot be
    // hopped - the goal sits outside the pathfinder's search box and 'No path'
    // is guaranteed BY CONSTRUCTION (102x, dispatch 35599777909; F2 hopped from
    // 40 blocks out). findChest returns the NEAREST chest first, so the first
    // out-of-reach chest means ALL of them are - break with a named line and
    // let the caller's bankFallback walk the bot home (the yard walk works:
    // 14 arrivals this fleet), where every chest is within ~26 blocks. The
    // distance is also pinned onto EVERY hop line (d=) so the next mining
    // round can separate doomed far hops from at-the-yard ones.
    const hopDist = (() => { try { const d = bot.entity?.position?.distanceTo?.(chest.position); return Number.isFinite(d) ? Math.round(d) : null } catch { return null } })()
    if (hopDist != null && !hopReachable(hopDist)) {
      log(`[${bot.username ?? 'bot'}] hop: chest at [${chest.position?.x ?? '?'},${chest.position?.y ?? '?'},${chest.position?.z ?? '?'}] d=${hopDist} zero: chest beyond the hop search radius ${HOP_SEARCH_RADIUS} - walking home instead`)
      break
    }
    // (v0.62.0) THE FLEET LEDGER SKIP: another bot's 'No path' verdict for THIS
    // chest is live - the A* exhaustion that produced it blocked all 19 bots
    // (run60: F4 tried 6 chests, F5 tried 5, several of the SAME chests; 16x
    // 'No path' at d=21-31 in the end phase). Skip the doomed hop, exclude the
    // chest, let the scan pick the next nearest.
    if (Array.isArray(noPathLedger) && chest.position) {
      const skipCell = typeof chest.position.floored === 'function' ? chest.position.floored() : chest.position
      const np = skipCell && Number.isFinite(skipCell.x) ? nearNoPath(noPathLedger, skipCell, Date.now()) : null
      if (np?.hit) {
        log(`[${bot.username ?? 'bot'}] chest skip (no path cached ${Math.round(np.ageMs / 1000)}s ago at [${skipCell.x},${skipCell.y},${skipCell.z}])`)
        tried.push(skipCell)
        continue
      }
    }
    // (v0.65.0) THE FULL-CHEST LEDGER SKIP: another bot opened THIS chest and
    // read 0 free slots (run61: 4x 'nothing to deposit' on the y=69 chests, each
    // discovery a paid walk + open; 19 bots = 19 re-discoveries of the same
    // dead chest). Skip BEFORE the walk - the whole point of a verdict paid for
    // by someone else - and let the scan pick the next nearest.
    if (Array.isArray(fullChestLedger) && chest.position) {
      const skipCell = typeof chest.position.floored === 'function' ? chest.position.floored() : chest.position
      const fc = skipCell && Number.isFinite(skipCell.x) ? nearNoPath(fullChestLedger, skipCell, Date.now(), { ttl: FULL_CHEST_TTL_MS, radius: FULL_CHEST_RADIUS, dy: FULL_CHEST_DY }) : null
      if (fc?.hit) {
        log(`[${bot.username ?? 'bot'}] chest skip (full cached ${Math.round(fc.ageMs / 1000)}s ago at [${skipCell.x},${skipCell.y},${skipCell.z}])`)
        tried.push(skipCell)
        continue
      }
    }
    const res = await depositToChest(bot, { chestBlock: chest, keep, log, budgetMs: remaining(), noPathLedger, fullChestLedger })
    reports.push(res.reason)
    if (res.deposited > 0) { total += res.deposited; chestsUsed++ } else {
      // (v0.39.1) THE FAILED HOP NAMES ITSELF: a zero hop used to vanish into a
      // reason string only the CALLER's last-entry saw - fleet 35576122228 F9
      // spent 139s between 'yard walk arrived in 1s' and 'bank: 0 (budget
      // exhausted)' with up to maxChests silent walk failures in between, and
      // the log could not say a single thing that happened in that window
      // ('walk to chest' goto events carry no chest identity or reason). One
      // line per failed hop: WHICH chest refused and WHY - bounded by maxChests.
      // (v0.45.0) d= joins the line (the 304-hop fleet could not separate a
      // doomed 40-block hop from an at-the-yard one).
      log(`[${bot.username ?? 'bot'}] hop: chest at [${chest.position?.x ?? '?'},${chest.position?.y ?? '?'},${chest.position?.z ?? '?'}]${hopDist != null ? ` d=${hopDist}` : ''} zero: ${res.reason || 'unknown'}`)
      // (v0.23.1) FLEET EVIDENCE (3e21d58): 5x 'chest unreachable (No path to the
      // goal!)' at final bank - the NEAREST chest's walk dead-ends (a pond, a rim,
      // unloaded chunks) and the whole deposit died with the loot still in pockets.
      // (v0.25.0) THE FULL CHEST JOINS THE EXCLUSION LIST: fleet 35538062596 F18
      // walked to the yard, every click was rejected by a full chest
      // ('bank: 0 (nothing to deposit)') and the delivery died with 200+ units
      // still in the pocket while chest #2 stood empty beside it. ANY zero at a
      // reached chest with bankable items left means THIS chest is dead for us
      // (full, ghost-click desync, unopenable window) - exclude it and try the
      // next nearest, still bounded by maxChests. 'no chest in range' stays a
      // plain break: there is nothing to hop from.
      const r = String(res.reason || '')
      const chestDead = /nothing to deposit|cannot open chest|chest unreachable|chest full/i.test(r)
      if (chestDead && chest.position) {
        tried.push(chest.position.floored())
        continue
      }
      break
    }
  }
  return { deposited: total, chestsUsed, chestReport: reports }
}

// (v0.16.4) The banking chain's invisible zero, made decidable. Fleet #122 climbed
// out for 'bank' 15+ times and banked=0 forever: depositToChest returned
// 'no chest in range' (the chest warehouse sits at the yard/spawn while a 600s bot
// digs 100-300 blocks out, way beyond findChest's 64-block scan) and the caller
// swallowed the reason. This pure predicate turns a failed deposit into an action:
//   done  - the deposit worked, nothing to add
//   walk  - a chain zero the walk CAN fix (scan miss, dead chest, dead window,
//           unknown junk): the yard is where the chests are (v0.38.0)
//   none  - walking cannot fix it (budget out, nothing deliverable, no yard
//           known, yard beyond the walk cap) - the caller logs the why either way
// Pure arithmetic on plain values (positions stay in the caller) so CI can test
// every branch without a server.
export function bankFallback ({ deposited = 0, reason = '', yardDist = null, maxWalkBlocks = 400 } = {}) {
  if (deposited > 0) return { action: 'done' }
  // (v0.38.0) CONTRACT CHANGE - evidence-driven. The v0.16.4 table made 'no chest
  // in range' the ONLY walk trigger and left every other zero in 'none' - and the
  // fleet19 caller logged 'none' only when its why differed from the chain
  // reason, so the common case printed NOTHING. Fleet 35566494961 F2 proved the
  // cost: a bot ~250 blocks from the yard burned a whole bank trip on a zero
  // that never said why (0 walk lines, 0 fallback lines in the whole log). And
  // dispatch 35569034780 F19 walked home CORRECTLY on 'no chest in range' while
  // the real killer was findChest swallowing findBlock throws at 19 blocks from
  // 50 verified chests. New table: the yard is where the chests ARE (50
  // verified), the walk is budget-clamped and retry-bounded, so EVERY chain zero
  // walks - EXCEPT the two walking cannot fix: the clock is out ('budget
  // exhausted') and the pocket holds nothing deliverable ('nothing to deposit',
  // now an honest early return from depositToChests). An unknown junk reason is
  // a walk too: an unexplained zero must not strand the delivery again, and the
  // fleet caller now logs the verdict either way.
  const r = String(reason || '')
  if (/budget exhausted|nothing to deposit/i.test(r)) return { action: 'none', why: r }
  if (yardDist == null || !Number.isFinite(yardDist)) return { action: 'none', why: 'no yard position known' }
  if (yardDist >= maxWalkBlocks) return { action: 'none', why: `yard is ${Math.round(yardDist)} blocks away (walk cap ${maxWalkBlocks})` }
  return { action: 'walk', dist: Math.round(yardDist) }
}
