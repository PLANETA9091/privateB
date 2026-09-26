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
import { approachWalk, PATH_GEOMETRY_RE } from './approach.mjs'
import { walkRawToward } from './deposit.mjs' // (v0.167.0) the nudge's approach gains the raw segment + the stall side-step (no cycle: deposit never imports smelting)
import { chestVerticalDoom } from './surface.mjs' // (v0.170.0) the machine walk gains the chest walks' vertical gate (no cycle: surface imports nothing)

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
// (v0.134.0) THE LADDER METALS - the iron_ingot producers, the pickaxe ladder's
// third rung (keepForIron holds them as TOOL MATERIALS until the upgrade lands).
// Inside smeltablesIn's metal class they outrank copper/gold regardless of count.
export const LADDER_METALS = new Set(['iron_ore', 'deepslate_iron_ore', 'raw_iron'])

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

// (v0.146.0) THE GOVERNORED-WALK REFUSAL FAMILY - the bounded-wait verdicts a
// machine walk may WAIT OUT instead of dying on. MEASURED (run49, 36008932449,
// the v0.145.0 composite): F14's smelt ladder tripped the goal brake on its OWN
// retry cadence - 13 machine candidates in one visit burst past the brake's
// 6-goals/5s window, and every candidate after the 7th died refused ('goal
// brake: 6 goals in 5s - walk to furnace refused for 3s') - the visit aborted,
// the raw metal rode home unsmelted, the next visit repeated the dance. The
// churn governor and the fleet ceiling already had this branch (the CI
// 35732767677 lesson: the bot hauled itself out of the pocket while its
// evidence was still live, and the visit died on the refusal anyway); the
// goal brake's refusal is the same named-clock shape ('refused for Ns') and
// joins the family. The FLEET goal ceiling deliberately stays OUT: its
// cooldown is the fleet-wide storm pause (escalating to 20s) - a visit that
// waits it out holds the bot hostage to the whole fleet's weather; dying fast
// is the honest verdict there.
export const WALK_REFUSAL_WAIT_RE = /walk governor|fleet churn ceiling|goal brake/

// (v0.99.0) THE YARD-ADJACENT RE-ARM - run88 (35817410592) named the inverse of
// the re-doom backoff: F17 stood IN the yard ('camp furnace: no build (machine
// near)' seconds earlier) with cobblestone in the pocket, and the smelt visit
// read 'smelt: 0' with SEVEN machines refused 'doomed goal (ledgered 1-2s ago)'
// - the storm-time failed walks of OTHER bots doom-ledgered every yard machine,
// and F17's one honest re-issue (attempt 2) failed into the same storm and
// re-doomed the cell itself. The bot that stands next to the machine is not the
// geometry the doomed verdict described: adjacency (<= SMELT_YARD_NEAR_DISTANCE
// of the TARGET machine) re-arms the consult for EVERY attempt of this machine
// - bounded exactly as before (3 attempts, the walk's own timeout, a failed
// honest attempt still re-records the doom). A bot far from the machine keeps
// the v0.89.0 shape byte for byte (refuse, one re-arm on attempt 2, refuse).
export const SMELT_YARD_NEAR_DISTANCE = 10

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

// (v0.96.0) THE INPUT SLICE - the fuel slice (v0.92.0) held the smelt leg's
// FUEL, but the pre-deposit still banked the smeltables THEMSELVES: cobblestone
// and sand are not in the deposit KEEP list (tools/food/wood only), so the bot
// held its reserve clock (45s of chain budget), arrived at the machine with an
// empty smeltable scan, and the slice drained standing. Run84b (dispatch
// 35801476714, the v0.94.0 tree): FOUR bots (F4/F8/F11/F13) logged 'holding
// 45s of ~120-180s for the smelt leg' followed by 'smelt: 0 (nothing to
// smelt)' - the same silent starvation the fuel slice cured, one layer up.
// While the pocket carries smeltables the PRE-deposit keeps the smeltable
// inputs too (the substring matcher makes the ore entries cover their
// deepslate variants and 'raw_' covers every raw metal); the final deposit
// (keep(false)) drains whatever the batch left. Deliberately NOT here: logs
// (smeltablesIn excludes them - the tool-bootstrap lifeline) and the raw
// meats beef/porkchop (already ride the deposit KEEP).
export const SMELT_INPUT_KEEP = [
  'cobblestone', 'stone', 'sand',
  'iron_ore', 'copper_ore', 'gold_ore', 'raw_',
  'clay_ball', 'netherrack', 'chorus_fruit', 'ancient_debris',
  'chicken', 'mutton', 'rabbit', 'cod', 'salmon', 'kelp'
]

/** Pure, junk-safe: the keep-list extension that holds the smelt leg's INPUTS.
 * Same contract as smeltFuelKeep - plain param + body guard (the Number(null)
 * strikes: a destructuring default does NOT fire on null), fresh array per
 * call (a shared const must never be mutated by a caller). */
export function smeltInputKeep (p) {
  const carries = !!(p && p.carriesSmeltables)
  return carries ? SMELT_INPUT_KEEP.slice() : []
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
  // (v0.97.0) THE SPENT-VISIT BATCH STOP: any FINITE visitRemainingMs is the hard
  // cap - INCLUDING 0 and negatives. run86 (35809634630) F7: the machine walk +
  // open + put spent the visit slice, the poll-start remaining read exactly 0,
  // and the old `> 0` guard DISCARDED the cap - the batch degraded to the legacy
  // unbounded clock (64 x 11s = 704s+), the bot never left the smelt, its work
  // loop never reached the final bank, and 17 banked bots hung into the hard
  // kill behind it (2 bots held the whole fleet past the 420s margin). A spent
  // visit must read as "no wait - pull OUR input+fuel back out" (the timeout
  // path already does that honestly and the pocket re-smelts on the next
  // chain). null/undefined/non-finite = the legacy unbounded call, byte for byte.
  const cap = visitRemainingMs != null && Number.isFinite(visitRemainingMs)
    ? Math.max(0, Math.floor(visitRemainingMs))
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

// (v0.109.0) COMPLETE items a fuel plan can produce. Vanilla yields are the truth
// (FUEL_YIELD; a fractional tail never finishes an item - a stick burns 0.5 of
// one smelt, so ONE stick completes ZERO items). Junk-safe: a nameless/unknown
// fuel, a non-finite or sub-1 count all read as capacity 0 - a plan that cannot
// complete one item is not a fuel plan (the ONE-ITEM FLOOR below).
export function fuelCapacity (fuel) {
  if (!fuel || typeof fuel.name !== 'string' || !Number.isFinite(fuel.count)) return 0
  const n = Math.floor(fuel.count)
  if (n < 1) return 0
  const y = fuelYieldOf(fuel.name)
  if (!(y > 0)) return 0
  return Math.floor(n * y)
}

// (v0.112.0) THE CLOCK CAP - run99 (35869329042, the v0.111.0 fleet) named the
// third over-commit: F3 walked to a furnace, put 64 x cobblestone with 9 x coal
// (the fuel was REAL, the fuel-aware batch had nothing to clip) - and 64 items
// need 640s of smelting while the poll clock is 90s. The window died
// 'smelt: 0 (cobblestone@furnace: timeout)', the pull-back churn re-put the
// same monster next chain, and smelted=1 fleet-wide (only the copper window
// landed 1/10 before its clock cut it). The fuel clamp sizes the batch to what
// the fuel completes; the CLOCK CAP sizes it to what the WINDOW can finish:
// floor(waitSeconds / smeltSecondsPerItem). A finite visit budget bounds the
// wait (the v0.91.0/v0.97.0 caps); mid-run calls bound it with maxSeconds -
// which also retires the v0.91.0 F19-class wait stretch (batch*per can no
// longer exceed maxSeconds because the put itself never exceeds the cap).
// The remainder stays pocketed and re-smelts on the next chain - the same
// honest partial the fuel clamp already names. Junk-safe: non-finite max
// seconds with no visit reads Infinity (the legacy unbounded shape).
export function clockCapItems ({ maxSeconds = 90, smeltSecondsPerItem = 11, visitRemainingMs = null } = {}) {
  const per = Number.isFinite(smeltSecondsPerItem) && smeltSecondsPerItem > 0 ? smeltSecondsPerItem : 11
  const mx = Number.isFinite(maxSeconds) && maxSeconds > 0 ? maxSeconds : null
  const vr = visitRemainingMs == null
    ? null
    : (Number.isFinite(visitRemainingMs) ? Math.max(0, visitRemainingMs) : null)
  const waitSecs = vr == null
    ? (mx == null ? Infinity : mx)
    : (mx == null ? vr / 1000 : Math.min(mx, vr / 1000))
  if (!Number.isFinite(waitSecs)) return Infinity
  return Math.max(1, Math.floor(waitSecs / per))
}

// (v0.193.0) THE FIRE-BATCH RUN-CLOCK CAP - the fourth belt. The fire leg puts
// the batch and walks away (the v0.137.0 thin-leg cure): the machine's own
// clock does the burning, and a collector sweep only takes output over an
// EMPTY input (a burning batch stays sacred - the v0.139.0 fleet-property
// read). MEASURED (run82 = fleet 36201371882, the v0.192.0 union): F8 fired
// 25 x raw_copper (~275s of burn) late in the run - the input slot stayed
// non-empty to the hard kill, no sweep could ever touch the machine, and the
// 25 left the pocket for the furnace forever (F18/F17 fired 1 each, same
// shadow). A batch bigger than the run's remaining clock can COMPLETE is a
// guaranteed pocket loss. The cap prices the burn + a harvest margin and the
// remainder stays pocketed (the honest partial - the fuelCap/clockCap
// doctrine's shape). Junk/unknown remainingMs reads NO cap (the legacy fire
// shape byte for byte - a missing run clock never trims).
export function fireBatchCapItems ({ remainingMs = null, smeltSecondsPerItem = 11, harvestMarginMs = 30000 } = {}) {
  const per = Number.isFinite(smeltSecondsPerItem) && smeltSecondsPerItem > 0 ? smeltSecondsPerItem : 11
  const margin = Number.isFinite(harvestMarginMs) && harvestMarginMs > 0 ? harvestMarginMs : 0
  if (remainingMs == null || !Number.isFinite(remainingMs) || remainingMs <= 0) return Infinity
  return Math.max(0, Math.floor((remainingMs - margin) / (per * 1000)))
}

// (v0.110.0, merged) THE JUNK COAL FLOOR - the junk lane's coal last resort
// gains the tithe bound. Run98 (35859636312) measured the hole in the
// wood-first pick: a pocket WITHOUT wood (the late-run majority - logs got
// crafted, planks got burned) fell through to the unbounded solid pick and
// F4's coal:22 burned to nothing on cobblestone windows BEFORE any chest
// contact (units 173->178 - burned, not banked) - the tithe never had an
// overage and the fuel-less bots (F16 raw_copper:5, F18 raw_copper:19) stayed
// 'no fuel' x22. The floor keeps FUEL_TITHE_BOUND coal in every pocket -
// exactly one commons withdrawal (min(6, fuelNeeded)) - so a metal window in
// the SAME pocket is always funded. A METAL window keeps the solid pick
// UNBOUNDED (the ladder outranks the floor). Kept equal to deposit.mjs's
// FUEL_TITHE_BOUND; a test pins the pair.
export const JUNK_COAL_FLOOR = 6

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
//
// (v0.109.0) THE JUNK-WINDOW WOOD-FIRST PICK - the window class reorders the
// same candidates. Run97 (35853190562, the v0.108.0 fleet) measured the
// misallocation exactly: junk windows (6-7 x 64 cobblestone + sand) burned the
// pocket coal (8 coal per 64 cobble) down to <= 6 BEFORE any chest contact, so
// the tithe never had an overage to bank (0 tithe lines), the yard chests
// stayed fuel-empty ('chest holds no fuel' x22), the commons could not feed the
// fuel-poor bots, and the METAL windows - the ladder the whole plan waits on -
// burned 'fuel: 1 x stick' (0.5 smelts: F13's raw_iron x6 window never landed,
// the pocket still held raw_iron:6 at end). Wood is renewable (the plank rung
// converts logs at the starving tool step; the reserves below protect exactly
// that lane), coal is not. So a NON-metal window burns spare wood FIRST and
// touches coal only when the pocket has no spare wood (the honest last resort -
// the legacy tail); a METAL window keeps the legacy coal-first order byte for
// byte (the ladder is the plan's priority and coal smelts 8:1). The transport
// chain closes: junk windows stop eating the coal -> coal survives to the next
// deposit -> the tithe/bank lands it in chests -> the commons finally has a
// supply for the F13s.
//
// (v0.109.0, the fuel-aware batch line) THE ONE-ITEM FLOOR wraps EVERY branch:
// a plan that cannot COMPLETE one item (the clipped { stick, 1 } spare - yield
// 0.5) is not a fuel plan. It reads as NO fuel: the ladder falls through to the
// next candidate class, and the smeltInventory gate asks the fuel commons
// BEFORE any machine walk (run108's F13 needed exactly that - the fleet held
// surplus coal that day). The smeltBatch that follows never exceeds the plan's
// real capacity (fuelCapacity + the batch clamp).
export function pickFuel (bot, { itemsNeeded = 1, reservePlanks = 8, reserveLogs = 6, reserveSticks = 2, metalWindow = false } = {}) {
  const usable = plan => (fuelCapacity(plan) >= 1 ? plan : null)
  const woodPick = () => {
    const plankTotal = countMatching(bot, /_planks$/)
    if (plankTotal > reservePlanks) {
      const spare = plankTotal - reservePlanks
      const stack = largestStack(bot, i => i.name.endsWith(PLANK_SUFFIX))
      return usable({ name: stack.name, count: Math.min(stack.count, spare, fuelNeeded(stack.name, itemsNeeded)) })
    }
    const logTotal = countMatching(bot, LOG_RE)
    if (logTotal > reserveLogs) {
      const spare = logTotal - reserveLogs
      const stack = largestStack(bot, i => LOG_RE.test(i.name))
      return usable({ name: stack.name, count: Math.min(stack.count, spare, fuelNeeded(stack.name, itemsNeeded)) })
    }
    const sticks = countItem(bot, 'stick')
    if (sticks > reserveSticks) {
      const spare = sticks - reserveSticks
      return usable({ name: 'stick', count: Math.min(spare, fuelNeeded('stick', itemsNeeded)) })
    }
    return null
  }
  const solidPick = (reserve = 0) => {
    const r = Number.isFinite(reserve) && reserve > 0 ? Math.floor(reserve) : 0
    const solid = ['coal', 'charcoal', 'coal_block', 'dried_kelp_block', 'blaze_rod']
      .map(name => ({ name, count: countItem(bot, name) }))
      .filter(f => f.count > r)
      .sort((a, b) => b.count - a.count)
    if (!solid.length) return null
    const f = solid[0]
    return usable({ name: f.name, count: Math.min(f.count - r, fuelNeeded(f.name, itemsNeeded)) })
  }
  // junk window: wood first, coal last AND only above the floor (the v0.109.0
  // reorder + the v0.110.0 floor); metal window: the legacy coal-first order
  // stands byte for byte (reserve 0 = the legacy unbounded solid pick).
  // STRICT true: only the METAL_INPUTS.has() verdict may open the metal lane -
  // junk truthiness judges nothing (the Number(null) strikes: a truthy string
  // is not a plan).
  return metalWindow === true ? (solidPick() || woodPick()) : (woodPick() || solidPick(JUNK_COAL_FLOOR))
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
  // (v0.106.0) THE METAL PRECEDENCE: run94 (35841864758) measured the ladder
  // starvation exactly - 7 smelt calls fleet-wide, 5 of them cobblestone (239u),
  // 1 sand, ZERO metal, while pockets carried raw_copper:17 next to
  // cobblestone:79 (the count-only sort lets junk dwarfs eat the coal first) and
  // the run ended iron=0 with plan progress 1/31. The plan's iron ingots (2,275
  // needed) can never exist while every furnace window goes to stone. Metals as a
  // CLASS rank above everything else; within a class the legacy count-desc order
  // stands byte for byte (a metal-less pocket sorts exactly as before).
  //
  // (v0.134.0) THE IRON LADDER PRECEDENCE: run550 (35950649305) measured the next
  // starvation tier - the fleet smelted 26 units of which 17 COPPER ingots, while
  // iron_ore mined=25 and the pickaxe tiers ended wooden=17 stone=7 IRON=0 (the
  // all-history wall). The toolupgrade ladder (keepForIron) wants iron_ingot /
  // raw_iron held as TOOL MATERIALS, and the plan's iron line can never land while
  // every metal window goes to copper (raw_copper:31 count-dwarfs raw_iron:6).
  // Within the metal class the LADDER METALS (the iron_ingot producers) now lead;
  // count-desc keeps the copper/gold relative order byte for byte behind them.
  return [...totals.entries()]
    .map(([name, count]) => ({ name, count, metal: METAL_INPUTS.has(name) ? 0 : 1, ladder: LADDER_METALS.has(name) ? 0 : 1 }))
    .sort((a, b) => (a.metal - b.metal) || (a.ladder - b.ladder) || (b.count - a.count))
    .map(({ name, count }) => ({ name, count }))
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
  fire = false, // (v0.137.0) fire-and-forget: put input+fuel and WALK AWAY - no poll, no pull-back; the batch smelts on the machine's own clock and the finished-harvest reads the output later
  fireCapMs = null, // (v0.193.0) the run clock left when firing - the batch never exceeds what the run can COMPLETE (fireBatchCapItems); null/junk = no cap (the legacy fire shape)
  log = () => {}
} = {}) {
  if (!machineBlock?.position || !inputName || count <= 0) return { smelted: 0, rescued: 0, fired: 0, reason: 'nothing to do' }
  const tag = `[${bot.username ?? 'bot'}]`
  // (v0.193.0) THE FIRE-BATCH RUN-CLOCK CAP, before any put: a batch the run
  // cannot finish burning is a guaranteed pocket loss (the sweep's sacred
  // rule keeps every collector out while the input is non-empty). The cap
  // prices burn + a 30s harvest margin; a 0 cap skips the fire honestly and
  // the pocket keeps everything; a junk read never caps (legacy shape).
  const runClockCap = fire ? fireBatchCapItems({ remainingMs: fireCapMs, smeltSecondsPerItem }) : Infinity
  if (fire && runClockCap <= 0) {
    log(`${tag} smelt fire skipped - the run clock cannot finish a batch (the pocket keeps ${count} x ${inputName})`)
    return { smelted: 0, rescued: 0, fired: 0, reason: 'run clock too thin to fire' }
  }
  const invCount = name => countItem(bot, name)
  if (invCount(inputName) <= 0) return { smelted: 0, rescued: 0, fired: 0, reason: 'input not in inventory' }

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
  let nudgeUsed = false // (v0.147.0) ONE path-geometry nudge per visit (the budget discipline)
  // (v0.89.0) THE REACH-OPEN: run80's bots stood IN the bay with the furnace
  // 2-4 blocks away and still died on the walk (the yard paths were sick).
  // Reach needs no path - open directly, the open's own timeout still guards.
  if (machineWithinReach({ from: bot.entity?.position, pos: machineBlock.position })) {
    walked = true
    log(`${tag} ${machineBlock.name} within reach - opening without a walk`)
  }
  // (v0.170.0) THE MACHINE VERTICAL GATE. run60 (36098615960, the v0.168.0
  // fleet @ the honest 600s) measured the last machine-walk doom: 5 'visit
  // budget spent (walk slice)' verdicts - 4 of them the METAL ladders
  // (F11 raw_iron@blast_furnace, F19 raw_copper x2, F17 raw_copper) while
  // iron_ingot stayed 0 for the SIXTH run. The anatomy: the bots live 28-29
  // levels UNDERGROUND (y=42-44), the yard's machines sit at y=71 - the
  // machine scan's 48b envelope SEES them across the vertical (dy 28 over
  // 5-7b lateral), every walk attempt is a doomed mostly-vertical climb that
  // pays its full slice ('the walk ladder cannot climb' - the run556
  // arithmetic the chest walks have gated since v0.159.0), and the v0.147.0
  // nudge then burns the rest ('walk nudge: approach: 2 segment(s) walked in
  // 13.6s, goal now d=37.4 - retrying the machine from the new start' straight
  // into 'visit budget spent'). The chest walks' chestVerticalDoom predicate
  // (the SAME strict shape: dy >= 20 and lateral < dy - a hillside keeps the
  // legacy ladder) now gates the machine walk too: the batch returns the
  // honest instant verdict, the visit's clock returns to the caller (the bank
  // leg can spend it on the climb + the bank instead of a doomed walk), and
  // the log decodes the class by name. Junk-safe: any unreadable position is
  // no doom - the legacy walk attempt runs byte for byte.
  if (!walked) {
    const doom = chestVerticalDoom({ botPos: bot?.entity?.position ?? null, chestPos: machineBlock.position })
    if (doom.doom) {
      return { smelted: 0, rescued: 0, fired: 0, reason: `machine unreachable (${doom.why} - the walk ladder cannot climb)` }
    }
  }
  // (v0.130.0) THE MACHINE WALK NEVER TAKES THE FREE REFUSAL: the doomed
  // consult re-arms for EVERY attempt of EVERY machine walk (the v0.99.0
  // yard-adjacent semantics, unconditional). run536 measured the old
  // refuse→re-arm→refuse shape starve the smelt economy fleet-wide: the yard
  // furnace row [-125..-137,71,385] became a dense doom field (every failed
  // honest walk re-dooms its cell, 15s TTL, the v0.96.0 absorb keeps the FIRST
  // failure's clock alive), F13 and F11 each burned 6 machines on consult
  // refusals 'ledgered 1-5s ago' then died 'visit budget spent', 27 'machine
  // unreachable' visits all run and smelted=1 (run530: 18). The doctrine is
  // v0.92.0's: a machine is static and known-good - the doomed geometry is the
  // FAILED bot's start (v0.87.0), not the destination's. The storm breakers
  // stay: 3 attempts x walkSlice, the visit deadline, the governor, the fleet
  // ceiling; a failed honest walk still re-dooms the cell (the v0.99.0 note -
  // the storm evidence stays recorded for every NON-machine consult).
  for (let attempt = 0; attempt < 3 && !walked && bot.entity; attempt++) {
    const ms = walkSlice()
    if (ms <= 0) { lastWalkError = 'visit budget spent (walk slice)'; break }
    try {
      // (v0.89.0) THE SHARED-MACHINE WALK: the bay is a SHARED destination -
      // one bot's failed approach ledgered the furnace cell and every later
      // bot's smelt walk died at the consult (run80's silent zeros). The
      // v0.87.0 yard semantics, bounded: the doomed geometry is the failed
      // bot's start, this bot's may be fine.
      // (v0.92.0) + THE MACHINE DOOM TTL: a machine is static and known-good -
      //   its doomed verdict lives 15s (MACHINE_DOOM_TTL_MS), not the chest
      // ledger's 45/90s (run81: 15 machines refused 'ledgered 1s ago', a fresh
      // camp furnace killed for the run by ONE failed walk).
      // (v0.99.0) doomedRearm on attempt 2 (the shared-bay re-issue) + EVERY
      // attempt when the bot is yard-adjacent to this very machine.
      // (v0.130.0) doomedRearm UNCONDITIONAL - the machine goal never takes the
      // free doomed refusal (run536: the refuse-armed attempt 0 starved the
      // whole row while the bot stood 10 blocks from it; see the block comment
      // above). A failed honest attempt still re-dooms the cell.
      await gotoSafe(bot, new goals.GoalNear(machineBlock.position.x, machineBlock.position.y, machineBlock.position.z, smeltWalkReach(attempt + 1)), { timeoutMs: ms, label: 'walk to furnace', doomedRearm: true, doomTtl: MACHINE_DOOM_TTL_MS })
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
      if (!governorWaited && WALK_REFUSAL_WAIT_RE.test(e.message)) {
        governorWaited = true
        const m = /refused for (\d+)s/.exec(e.message)
        const asked = (m ? Number(m[1]) : 5) * 1000 + 1000
        const slice = visitDeadline == null ? Math.min(asked, 13000) : Math.min(asked, 13000, Math.max(0, visitDeadline - Date.now()))
        if (slice > 0) {
          log(`${tag} walk refused by the churn governor - waiting ${Math.round(slice / 1000)}s out`)
          await new Promise(r => setTimeout(r, slice))
        }
      }
      // (v0.147.0) THE PATH-GEOMETRY NUDGE - run85 (dispatch 36016062585, the
      // v0.146.0 commune's first field test) decomposed the smelt collapse
      // into a PATH-dominated class: 'Took to long to decide path to goal!'
      // x3 on machine walks + the 6 'no fuel' verdicts whose commons walks
      // died the same way + 1 'No path to the goal!'. Both strings are the
      // pathfinder's own verdicts about the FAILED START - the identical
      // retry from the identical position is a deterministic re-failure
      // (run85: the walk loop burned all 3 attempts on the same geometry).
      // ONE bounded approachWalk per visit changes the start (the v0.87.0
      // doctrine: the doomed geometry is the failed bot's start, not the
      // destination), and the loop's next attempt re-gotos from a position
      // the A* may actually route. Bounded by the walk slice; the budget
      // discipline keeps it one shot per visit.
      if (!nudgeUsed && PATH_GEOMETRY_RE.test(e.message)) {
        nudgeUsed = true
        const ms = walkSlice()
        if (ms > 1000) {
          try {
            // (v0.160.0) THE MACHINE CLOSE SHOT - run558 (dispatch 36068771258,
            // the v0.159.0 fleet) measured the last legacy surrender class:
            // 'F7 walk nudge: inside the direct envelope' x6 in ONE run - six
            // nudge firings, six ZERO-SEGMENT surrenders (the failed bot stood
            // inside the 24b envelope, approachTargetPos returned null, and
            // without the close shot the nudge emitted nothing, the start
            // NEVER changed) - and the visit died with raw_iron in the pocket
            // ('raw_iron@blast_furnace: machine unreachable' x4 + 'raw_iron@
            // furnace: machine unreachable' x3). Fleet-wide the run logged 8
            // 'walk nudge' verdicts, ALL 'inside the direct envelope'. The
            // yard walks have carried the cure since v0.157.0 (the run58
            // verdict); the machine walk is the last walk site still naked.
            // closeShot is a FALLBACK: the far-decide segments keep their
            // v0.147.0 shape byte for byte, only the inside-the-envelope null
            // gains one straight-at-goal segment (stop 2 short).
            // (v0.167.0) + THE RAW WALK: run563 (fleet 36086024448, the v0.165.0
            // fleet) measured the nudge's OWN approach stalling - '[F13] walk
            // nudge: approach: 3 segment(s) walked in 6.7s, goal now d=24.2
            // (still outside - a segment stalled)' feeding the raw_copper@
            // blast_furnace composites (F11/F13, 'machine unreachable (Took to
            // long to decide path to goal!)' x2+ each) while the iron_ingot
            // ledger stayed 0 for the FIFTH run. The nudge's approachWalk was
            // the last approach site without the injected raw walker - the
            // pathfinder-only segments could neither close the last blocks nor
            // take the stall side-step. rawWalk: walkRawToward gives the nudge
            // the SAME machinery the yard walk has carried since v0.56.0: the
            // raw-first segment (no A* slot spent on open ground) and the
            // v0.167.0 side-step rung when a segment wedges.
            const n = await approachWalk(bot, machineBlock.position, { budgetMs: Math.min(ms, 20000), closeShot: true, rawWalk: walkRawToward, log: m => log(`${tag} walk nudge: ${m}`) })
            log(`${tag} walk nudge: ${n.walked ? 'inside the direct envelope' : `closed to d=${Number.isFinite(n.d) ? n.d.toFixed(1) : '?'} - retrying the machine from the new start`}`)
          } catch { /* the nudge never kills the chain - the loop owns the verdict */ }
        }
      }
      await new Promise(r => setTimeout(r, 500)) // let the interrupting path/control settle
    }
  }
  if (!walked) {
    return { smelted: 0, rescued: 0, fired: 0, reason: `machine unreachable (${lastWalkError})` }
  }

  let furnace
  try {
    const openMs = visitDeadline == null ? 10000 : Math.min(10000, Math.max(1000, visitDeadline - Date.now()))
    furnace = await withTimeout(bot.openFurnace(machineBlock), openMs, 'open furnace')
  } catch (e) {
    return { smelted: 0, rescued: 0, fired: 0, reason: `cannot open (${e.message})` }
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
    // RESCUE + (v0.137.0) THE FINISHED-HARVEST: output with an EMPTY input slot
    // belongs to the fleet - either the owner is gone (the legacy idle rescue) or
    // the batch FINISHED and only a fuel leftover remains (the fired-batch shape:
    // input burned down to nothing while the owner walked away). Claim the output,
    // then pull the leftover fuel back to the pocket - a fuel item without input
    // never burns (vanilla) and would read 'busy' to every later visitor, walling
    // the machine off for the rest of the run. A LIVE input slot stays UNTOUCHED -
    // taking another bot's burning batch would reset its progress; that shape is
    // the caller's busy verdict below. VERIFIED via the live rows (never "read the
    // slot again": a furnace slot REFILLS between two reads, the rows only grow by
    // what WE took - deposit.mjs rule).
    const out0 = furnace.outputItem()
    if (out0 && !furnace.inputItem()) {
      const rowsBefore = liveCount(out0.name)
      try { await withTimeout(furnace.takeOutput(), 5000, 'rescue output') } catch { /* keep going */ }
      await sleep(200)
      rescued = liveCount(out0.name) - rowsBefore
      if (rescued > 0) {
        const finished = furnace.fuelItem() ? 'a finished fired batch' : 'an idle'
        log(`${tag} rescued ${rescued} x ${out0.name} from ${finished} ${machineBlock.name}`)
      }
      // the leftover fuel on a finished batch: back to the pocket, the machine reads idle
      if (furnace.fuelItem()) {
        try { await withTimeout(furnace.takeFuel(), 5000, 'harvest leftover fuel') } catch { /* lost - the busy gate keeps the machine honest */ }
      }
    }

    // BUSY: another bot's batch is inside (input or fuel present). Vanilla happily
    // lets several players view one furnace and race its slots - walking away is the
    // only safe move; the caller tries the next machine.
    if (furnace.inputItem() || furnace.fuelItem()) {
      return { smelted, rescued, fired: 0, reason: 'busy' }
    }

    // (v0.109.0) the window class rides EVERY pickFuel call: metal inputs keep the
    // legacy coal-first order (the ladder), junk inputs burn spare wood first (the
    // run97 misallocation: junk windows ate the pocket coal below the tithe bound
    // before any chest contact, the metal windows got sticks)
    const batch0 = Math.min(count, invCount(inputName))
    const fuel = pickFuel(bot, { itemsNeeded: batch0, metalWindow: METAL_INPUTS.has(inputName), ...(fuelReserve ?? {}) })
    if (!fuel) return { smelted, rescued, reason: 'no fuel' }
    // (v0.109.0) THE FUEL-AWARE BATCH: the batch never exceeds what the fuel
    // plan actually COMPLETES. pickFuel's ONE-ITEM FLOOR already refuses
    // capacity-0 plans (the commons resupply fires upstream, before any walk);
    // this clamp is the second belt for the clipped-but-completing plans
    // (2 spare planks = 3 complete items - the honest partial beats the
    // guaranteed zero, and the uncovered remainder re-smelts on the next chain
    // exactly like the putCount slot clip already does).
    const fuelCap = fuelCapacity(fuel)
    if (fuelCap < 1) return { smelted, rescued, fired: 0, reason: 'no fuel' }
    if (fuelCap < batch0) log(`${tag} fuel clips the batch: ${fuel.count} x ${fuel.name} completes ${fuelCap} of ${batch0} x ${inputName} (the rest re-smelts on the next chain)`)
    // (v0.112.0) THE CLOCK CAP - the third belt: the batch never exceeds what
    // the poll WINDOW can finish (run99 F3: 64 x cobblestone on a 90s clock =
    // a guaranteed timeout-zero, the pull-back churn re-put the monster next
    // chain). The wait the poll will actually spend bounds the put; the
    // remainder stays pocketed for the next chain, same honest partial.
    // (v0.137.0) fire batches skip this belt: nothing polls - the machine's own
    // clock does the burning, so the poll window cannot strand anything.
    const visitRemainingAtPut = visitDeadline == null ? null : Math.max(0, visitDeadline - Date.now())
    const clockCap = fire ? Infinity : clockCapItems({ maxSeconds, smeltSecondsPerItem, visitRemainingMs: visitRemainingAtPut })
    if (!fire && clockCap < batch0) {
      const waitSecs = Math.round(visitRemainingAtPut == null ? maxSeconds : Math.min(maxSeconds, visitRemainingAtPut / 1000))
      log(`${tag} the clock clips the batch: the ${waitSecs}s window completes ~${clockCap} of ${batch0} x ${inputName} (the rest re-smelts on the next chain)`)
    }
    if (fire && Number.isFinite(runClockCap) && runClockCap < batch0) {
      log(`${tag} the run clock caps the fired batch: ${runClockCap} of ${batch0} x ${inputName} (the rest re-smelts on the next chain)`)
    }
    const batch = Math.min(batch0, fuelCap, clockCap, runClockCap)

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
      return { smelted, rescued, fired: 0, reason: 'input transfer failed' }
    }
    if (!await putVerified(furnace.putFuel.bind(furnace), fuel.name, fuel.count)) {
      // input already went in - pull it back out, leave the machine clean
      try { await withTimeout(furnace.takeInput(), 5000, 'take input back') } catch { /* lost */ }
      return { smelted, rescued, fired: 0, reason: 'fuel transfer failed' }
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
      return { smelted, rescued, fired: 0, reason: mismatch }
    }
    log(`${tag} smelting ${putCount} x ${inputName} in a ${machineBlock.name} (fuel: ${fuel.count} x ${fuel.name})`)

    // (v0.137.0) THE FIRED SMELT: the puts are verified (the slot read-back is the
    // truth), so the batch WILL smelt - on the machine's own clock, not ours. A
    // thin leg cannot afford the poll floor (run552: 7x 'build skipped - the leg
    // clock cannot afford a 24s build + the 15s smelt floor' while raw_iron rode
    // the pocket to the bank un-smelted), but it CAN afford the put (~5s). Fire,
    // close the window, walk away: the next chain (or ANY bot - the harvest reads
    // output-with-empty-input) collects. No pull-back on this path - the batch is
    // the machine's now; the pocket keeps whatever the slot clip left.
    if (fire) {
      return { smelted, rescued, fired: putCount, reason: 'fired' }
    }

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
  return { smelted, rescued, fired: 0, reason }
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
  fuelResupply = null, // (v0.98.0) async ({ itemsNeeded }) => void - the FUEL COMMONS: called ONCE when the pocket is fuel-empty, BEFORE the 'no fuel' verdict (fleet19 wires withdrawFuelCommons); undefined/null = the legacy shape byte for byte
  yardSeek = null, // (v0.147.0) async () => boolean - THE YARD-SEEK: called ONCE per visit when an input's machine scan ends EMPTY (the bot mines beyond the 48b envelope of the yard's machine cluster - run85's F4 held raw_copper:28 all run and its visit read 'no machine in reach'); a landed seek re-runs that input's scan. fleet19 wires the proven approachWalk toward the yard center; null = the legacy shape byte for byte
  fire = false, // (v0.137.0) fire-and-forget batches: the put is the whole visit, the machine's own clock does the burning, the finished-harvest collects - the thin-leg cure (run552's 7x build-skips + the unreachable walks starved the smelt economy)
  fireCapMs = null, // (v0.193.0) the run clock left when firing - rides every smeltBatch call (the fire-batch run-clock cap); null = no cap (the legacy shape)
  log = () => {}
} = {}) {
  const started = Date.now()
  const tag = `[${bot.username ?? 'bot'}]` // (v0.147.0) the seek log names the bot (smeltBatch's tag is out of scope here)
  const attempts = []
  let total = 0
  let rescued = 0
  let firedTotal = 0
  const outputs = {}
  // per-INPUT produced counter (NOT per-output): iron_ore and raw_iron both yield
  // iron_ingot - a shared counter would wrongly cap the second input
  const produced = new Map()
  const plan = smeltablesIn(bot, { reserveCobble })
  let seekUsed = false // (v0.147.0) ONE yard-seek per visit (the budget discipline)
  for (const { name, count } of plan) {
    if (Date.now() - started > maxSeconds * 1000) break
    const left = () => Math.min(countItem(bot, name), count - (produced.get(name) ?? 0))
    if (left() <= 0) continue
    // (v0.110.0, merged) the probe is honest by construction: pickFuel's
    // ONE-ITEM FLOOR (the usable() wrapper) already refuses capacity-0 plans
    // (1 x stick against any batch reads as no fuel) - the walk is not spent
    if (!pickFuel(bot, { itemsNeeded: left(), metalWindow: METAL_INPUTS.has(name), ...(fuelReserve ?? {}) })) {
      // (v0.98.0) THE FUEL COMMONS: run86's zeros named the class 3x - bots stood
      // AT the machines with smeltables and an empty fuel pocket while OTHER bots'
      // surplus coal sat in the yard chests (coal/charcoal are not in the deposit
      // KEEP list, the commons exists in every real run). One bounded resupply
      // attempt before the verdict: a throw or a still-empty pocket falls
      // through to the EXACT legacy shape (attempt entry, continue) - the
      // no-callback runs are byte for byte.
      let resupplied = false
      if (typeof fuelResupply === 'function') {
        try { await fuelResupply({ itemsNeeded: left() }) } catch { /* a dead commons never kills the chain */ }
        resupplied = !!pickFuel(bot, { itemsNeeded: left(), metalWindow: METAL_INPUTS.has(name), ...(fuelReserve ?? {}) })
      }
      if (!resupplied) { attempts.push({ name, machine: null, reason: 'no fuel' }); continue }
    }
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
    // (v0.147.0) the kind loop is a closure so THE YARD-SEEK can re-run it:
    // run85 (dispatch 36016062585, the v0.146.0 commune's first field test)
    // measured the empty-scan class live - F4's first smelt visit read
    // 'no machine in reach (blast_furnace/furnace within 48b)' while its
    // pocket held raw_copper:28, and the visit ended there. The scan is the
    // bot's LOCAL 48b envelope; a bot mining beyond it can never see the
    // yard's machine cluster without MOVING toward it first.
    const runKindLoop = async () => {
      let kindsTried = 0
      let kindsWithBlocks = 0
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
          fire,
          fireCapMs,
          log
        })
        rescued += res.rescued
        firedTotal += (res.fired ?? 0)
        if (res.smelted > 0) {
          total += res.smelted
          produced.set(name, (produced.get(name) ?? 0) + res.smelted)
          const out = SMELT_OUTPUT[name]
          outputs[out] = (outputs[out] ?? 0) + res.smelted
        } else if (res.reason && res.reason !== 'ok' && res.reason !== 'fired') {
          // (v0.89.0) THE HONEST ATTEMPTS: busy / unreachable / broken machines
          // used to vanish between smeltBatch and the fleet leg's log - recorded
          // now, so a zero verdict names every machine it lost to.
          // (v0.137.0) 'fired' is a SUCCESS shape, not a loss - the batch is in
          // the machine and the harvest reads it later.
          attempts.push({ name, machine: machineKind, reason: res.reason })
          // (v0.93.0) the spent walk slice closes the scan (see the flag above)
          if (/visit budget spent \(walk slice\)/.test(res.reason)) { sliceSpent = true; break }
        }
        if (left() <= 0) break
        // (v0.137.0) a fired visit put the plan's batch - one visit, done; the
        // pocket keeps the slot-clip remainder for the next chain
        if (fire && (res.fired ?? 0) > 0) break
        // busy / unreachable / broken machine: try the next one of this kind
      }
      if (sliceSpent) break
      if (left() <= 0) break
      }
      return { kindsTried, kindsWithBlocks }
    }
    let kinds = await runKindLoop()
    // (v0.147.0) THE YARD-SEEK: the empty-scan trigger. One seek per visit,
    // only when the input produced nothing and the walk clock is alive (a
    // spent slice makes the re-run an identical refusal - the v0.93.0
    // stop governs). A landed seek puts the yard's machine cluster inside
    // the scan envelope and the re-run walks it; the seek never throws
    // into the visit (fleet19's wiring is failure-tolerant, this guard is
    // the second belt).
    if (kinds.kindsTried > 0 && kinds.kindsWithBlocks === 0 && !(produced.get(name) > 0) && !sliceSpent && !seekUsed && typeof yardSeek === 'function') {
      seekUsed = true
      try {
        const seeked = await yardSeek()
        log(`${tag} yard seek: ${seeked ? 'arrived yard-side - rescanning the machines' : 'did not land - the empty scan stands'}`)
        if (seeked) kinds = await runKindLoop()
      } catch { /* a dead seek never kills the chain */ }
    }
    // every kind of this input's machine chain scanned, zero machines found: the
    // input never even reached a furnace - say so (the fleet harness prints
    // attempts when smelted=0; produced>0 must never be condemned)
    if (kinds.kindsTried > 0 && kinds.kindsWithBlocks === 0 && !(produced.get(name) > 0)) {
      attempts.push({ name, machine: machineChainFor(name).join('/'), reason: `no machine in reach (${machineChainFor(name).join('/')} within ${maxDistance}b)` })
    }
  }
  return { smelted: total, rescued, fired: firedTotal, outputs, attempts }
}

/**
 * (v0.139.0) THE HARVEST SWEEP - run553 (35970697452, the v0.137.0 fleet) fired
 * 30 items into machines (F5=10, F3=19, F2=1) and harvested ZERO: the
 * finished-harvest only runs inside a smelt visit that CARRIES AN INPUT, and a
 * bot whose pocket is empty (the 'nothing to smelt' legs) never opens a machine
 * at all. The fired-smelt cure moved the starvation from the put to the
 * collection leg - this sweep IS the collection leg. It opens every
 * furnace/blast_furnace in reach and applies the fleet-property read: an output
 * over an EMPTY input slot belongs to whoever arrives (the fired batch's
 * leftover fuel comes back to the pocket too - a fuel item without input never
 * burns and would read 'busy' to every later visitor, walling the machine).
 * A LIVE input slot stays UNTOUCHED (a burning batch is sacred - taking its
 * output mid-burn would steal, vanilla would race). One walk attempt per
 * machine (breadth over depth - a sweep is a census, not a siege), a hard
 * total-clock, and never throws. The COLLECTOR's ledger counts the harvest:
 * fired -> harvested -> smelted (the honest ledger completes here).
 * Returns { collected, outputs, attempts } - never throws.
 */
export async function sweepFinishedSmelts (bot, {
  maxSeconds = 20,
  maxDistance = 48,
  log = () => {}
} = {}) {
  const started = Date.now()
  const tag = `[${bot.username ?? 'bot'}]`
  const attempts = []
  const outputs = {}
  let collected = 0
  const machines = findMachineBlocks(bot, ['furnace', 'blast_furnace'], { maxDistance })
  for (const machineBlock of machines) {
    if (maxSeconds * 1000 - (Date.now() - started) <= 0) break // the sweep's own clock is hard
    if (!bot.entity) break // died mid-sweep - the pocket rides the respawn rules
    // ONE walk attempt per machine: a failed approach is a named attempt and the
    // census moves on (the smelt visit's 3-attempt siege is for a batch WE carry;
    // a sweep's targets belong to whoever reaches them first)
    if (!machineWithinReach({ from: bot.entity.position, pos: machineBlock.position })) {
      try {
        const leftMs = maxSeconds * 1000 - (Date.now() - started)
        await gotoSafe(bot, new goals.GoalNear(machineBlock.position.x, machineBlock.position.y, machineBlock.position.z, smeltWalkReach(1)), { timeoutMs: Math.min(leftMs, 15000), label: 'walk to a machine (sweep)', doomedRearm: true, doomTtl: MACHINE_DOOM_TTL_MS })
      } catch (e) {
        attempts.push({ machine: machineBlock.name, reason: `machine unreachable (${e.message})` })
        continue
      }
    }
    let furnace
    try {
      const openMs = Math.min(5000, Math.max(1000, maxSeconds * 1000 - (Date.now() - started)))
      furnace = await withTimeout(bot.openFurnace(machineBlock), openMs, 'open furnace (sweep)')
    } catch (e) {
      attempts.push({ machine: machineBlock.name, reason: `cannot open (${e.message})` })
      continue
    }
    // LIVE rows truth (the deposit rule): while a container window is open,
    // bot.inventory is a frozen pre-open snapshot - the window's player rows are
    // the only view that grows by what WE take.
    const rowItems = () => (furnace.slots ?? []).slice(furnace.inventoryStart ?? 3, furnace.inventoryEnd ?? 39).filter(Boolean)
    const liveCount = name => rowItems().filter(i => i.name === name).reduce((a, i) => a + i.count, 0)
    try {
      const out = furnace.outputItem()
      const hasInput = !!furnace.inputItem()
      if (out && !hasInput) {
        // output over an EMPTY input: the fleet-property shape (the fired batch
        // burned out, or an older visit's owner is gone). VERIFIED take on the
        // rows - the rows only grow by what WE took.
        const rowsBefore = liveCount(out.name)
        try { await withTimeout(furnace.takeOutput(), 5000, 'sweep output') } catch { /* keep going */ }
        await sleep(200)
        const moved = liveCount(out.name) - rowsBefore
        if (moved > 0) {
          collected += moved
          outputs[out.name] = (outputs[out.name] ?? 0) + moved
          const finished = furnace.fuelItem() ? 'a finished fired batch' : 'an idle'
          log(`${tag} swept ${moved} x ${out.name} from ${finished} ${machineBlock.name}`)
        }
      } else if (hasInput) {
        // a LIVE burning batch is sacred (the honest attempts name the verdict -
        // the sweep's census records it like every other machine shape)
        attempts.push({ machine: machineBlock.name, reason: 'busy' })
      }
      // the leftover fuel on an input-free machine: back to the pocket, the
      // machine reads idle (the v0.137.0 wall-off rule, now on the sweep too)
      if (!furnace.inputItem() && furnace.fuelItem()) {
        try { await withTimeout(furnace.takeFuel(), 5000, 'sweep leftover fuel') } catch { /* lost - the busy gate keeps the machine honest */ }
      }
    } catch (e) {
      attempts.push({ machine: machineBlock.name, reason: `error (${e.message})` })
    } finally {
      try { furnace.close?.() } catch { /* already closed */ }
    }
  }
  return { collected, outputs, attempts }
}
