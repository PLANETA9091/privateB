// (v0.461.0) THE SMELT LEDGER - the furnace lane's own words, counted.
// THE QUESTION (the standing furnace/smelt front + face 40's field read):
// the pulse counters price the smelt sink (smelted +19 face 39, +0 face
// 40) but never name WHAT burned or WHERE the chain lost throughput -
// while the log's smelt lines carry the quantities verbatim (verified
// stable across faces 36..40). One parser per emitter, the shapes byte-
// verbatim from the live logs:
//
//   [F13] smelting 1 x raw_copper in a blast_furnace (fuel: 1 x coal)
//   [F8] smelting 6 x cobblestone in a furnace (fuel: 4 x oak_log)
//   [F8] fuel clips the batch: 5 x oak_log completes 7 of 14 x raw_copper
//        (the rest re-smelts on the next chain)
//   [F8] the clock clips the batch: the 21s window completes ~1 of
//        14 x raw_copper (the rest re-smelts on the next chain)
//   F2 smelt: 0 (nothing to smelt)          <- the refusal family
//   F2 smelt: 0 (cobblestone@-: no fuel)
//
// The lens counts: the batches announced (the START lines' N and fuel N),
// the clips (the chain's own throughput losses, fuel-side and clock-side,
// completed/asked split), the refusals by why. The clip lines are NOT
// batches (their asks already sat in a START line) - double-counting is
// the trap this split avoids. The counter cross-check (announced vs the
// pulse's smelted delta) is the decompose row's job - the lens returns
// the words' side only, the join stays outside (one joiner per number).
// Honest nulls: non-array input. Junk lines judge nothing.

// The batch start: '[F13] smelting 1 x raw_copper in a blast_furnace
// (fuel: 1 x coal)' - the article is always 'a' in the live logs (the
// furnace vocabulary: furnace / blast_furnace).
export const SMELT_START_RE = /^\[(F\d+)\] smelting (\d+) x ([a-z_]+) in a ([a-z_]+) \(fuel: (\d+) x ([a-z_]+)\)/

// The fuel clip: '[F8] fuel clips the batch: 5 x oak_log completes 7 of
// 14 x raw_copper' - the fuel ran out mid-batch.
export const SMELT_FUEL_CLIP_RE = /^\[(F\d+)\] fuel clips the batch: (\d+) x ([a-z_]+) completes (\d+) of (\d+) x ([a-z_]+)/

// The clock clip: '[F8] the clock clips the batch: the 21s window
// completes ~1 of 14 x raw_copper' - the run's clock ended mid-batch.
export const SMELT_CLOCK_CLIP_RE = /^\[(F\d+)\] the clock clips the batch: the (\d+)s window completes ~(\d+) of (\d+) x ([a-z_]+)/

// The refusal: 'F2 smelt: 0 (nothing to smelt)' / 'F2 smelt: 0
// (cobblestone@-: no fuel)' - the why rides in the parens, verbatim.
export const SMELT_REFUSAL_RE = /^(F\d+) smelt: 0 \(([^)]+)\)$/

// (v0.462.0) THE HARVEST LEG - the counter's own twin found. The smelted
// counter ticks when the OUTPUT is collected, and the collection has its
// own quantity-bearing line (smelting.mjs's harvest loop, byte-verbatim
// across faces 36..40: 9/2/2/19/0 lines):
//   [F2] took 1 x copper_ingot (1/3)
// The (k/batch) tail anchors the shape (the inventory lane's takes carry
// no progress tail). With the took side read, the join's BOTH halves sit
// on one row: the words' collected vs the counter's smelted delta - face
// 39's first live read: 19 lines of 1u = 19u collected vs the counter's
// +19u (the identity held); the fired batches whose harvest rode a later
// chain still land here (ANY bot's collect reads the machine).
export const SMELT_TOOK_RE = /^\[(F\d+)\] took (\d+) x ([a-z_]+) \((\d+)\/(\d+)\)$/

// (v0.744.0) THE CLIP'S OWN DEBT - the clip lines' captured numbers
// priced the ASK/COMPLETION split (fuelClipCompleted 16 of asked 33) but
// dropped the deficit itself: the units the chain left IN THE FURNACE
// ('the rest re-smelts on the next chain' - and the 55th face's chains
// never re-announced: 49 raw_copper units sat mid-smelt). The heal rides
// the SAME SMELT_FUEL_CLIP_RE / SMELT_CLOCK_CLIP_RE matches (one parser
// per shape): debt = asked - completed per clip -> clipDebt (sum),
// clipDebtFuel / clipDebtClock (the two classes), clipDebtItems (the
// item's own debt - fc[6]/cc[5] were captured and dropped before),
// byBot.clipDebt. clipDebtRow is the verdict (the furnace still owes
// the harvest); zero clips = the honest silence. The old fields stay
// byte-stable beside it.

// (v0.745.0) THE RE-SMELT SHADOW'S PAYBACK - the debt's own answer, read
// in the SAME walk (no new parsing, one parser per shape). The clip
// line's own promise - 'the rest re-smelts on the next chain' - stayed
// unverified: does a later chain EVER re-announce the clipped batch? A
// START line whose bot+item matches an outstanding clip debt IS the
// promised return: paybackChains (the answering STARTs), paybackUnits
// (the units they re-announced), clipDebtReannounced (the debt the
// return answered); the debt no START ever answered is the shadow's own
// remainder (clipDebtOpen). Invariant: clipDebt = clipDebtReannounced +
// clipDebtOpen. The match is per bot+item - each bot runs its own
// furnace loop, so another bot's chain (or another item's chain) never
// pays the debt (the cross-credit speculation this lens refuses). A
// START before any clip mints nothing (the order is the law). Honest
// silence: zero clips, no row.

// (v0.747.0) THE CLIP'S OWN DIET - the fuel side's own worth, priced at
// the clip moment. The fuel clip line carries its own fuel verbatim
// ('2 x coal completes 16 of 33 x raw_copper': fc[2] x fc[3] were matched
// and dropped before) - and the vanilla yield table (fuelYieldOf, the
// v0.666.0 law: never a made constant) prices what that fuel could ever
// complete: capacity = fuel-units x fuelYieldOf(item). The join prices
// the clip's own diet: delivered / capacity. At 100% the fuel died at
// its own capacity - the batch's ask was the constraint (the 55th's F4:
// 2 coal = capacity 16, delivered 16 - the plan underfueled the batch,
// the fuel was innocent). Below 100% the capacity's own tail went
// unpaid - the window (or the stall) took it while the fuel still had
// worth (the 53rd's F2: 3 stick = capacity 1.5, delivered 1). The read
// rides the SAME SMELT_FUEL_CLIP_RE match (one parser per shape), the
// clock side stays its own class. Honest silences: zero fuel clips, no
// row; an unknown fuel's capacity is the honest gap, never a guess.

// (v0.748.0) THE CLOCK'S OWN WINDOW - the clock side's own worth, priced
// from the line's own seconds. The clock clip line carries its own
// window verbatim ('the 83s window completes ~7 of 36 x raw_copper':
// cc[2] was matched and dropped before) - and the vanilla smelt speed
// (SMELT_SECONDS_PER_ITEM = 200 ticks / 20 tps, the never-a-made-constant
// law's own bar) prices what that window could ever complete: capacity =
// window-seconds / 10. The join prices the clock's own diet: delivered /
// capacity. Below 100% the furnace idled inside the window - the vanilla
// capacity went unpaid while the clock still ran (fuel/input gaps mid-
// window - the next read's subject; the 58th's six windows: 190s of
// window for 16 completed, capacity 19, paid 84%). At 100% the furnace
// kept the vanilla beat - the window was its own metronome, the debt is
// purely the window's own shrinkage against the batch's ask (short
// windows can also overshoot: a unit mid-flight at window open finishes
// inside it). The read rides the SAME SMELT_CLOCK_CLIP_RE match (one
// parser per shape) - the furnace book's fourth entry beside the debt
// (v0.744.0), the payback (v0.745.0) and the diet (v0.747.0). The window
// seconds accumulate INTEGER (the float drift of a sum-of-divisions is
// the trap); the division lives once at the row. Honest silence: zero
// clock clips, no row (the window is always numeric - no unknown gap
// class exists here).

// (v0.749.0) THE PLAN'S OWN MARGIN - THE RECORD'S OWN CORRECTION (the
// v0.745.0 precedent). The v0.748.0 read treated the clip line's ~C as
// 'completed unit(s)' and priced the shortfall against the vanilla bar
// as an unknown idle (fuel/input gaps mid-window - the next read's
// subject). The emitter's own words disagree: smelting.mjs prices the
// cap at PUT time (clockCapItems = max(1, floor(W / 11)), the 11s bar
// being 'vanilla 10s + lag margin') and logs the line BEFORE the put -
// the ~C is what the plan PUT, never what the furnace completed
// (verified: all six of the 58th's windows match floor(W/11) exactly,
// including the one-item floor's own 5s put). The idle is REAL but its
// cause is the plan's own design: the margin exists so the poll window
// finishes the batch AND harvests it (the v0.112.0 timeout path pulls
// un-smelted input back - the churn is the cost the margin buys off).
// The correction prices the margin in the machine's own seconds: per
// clip max(0, W - 10 x cap), the vanilla bar's own remainder. The two
// classes re-derive: idle > 0 = the 11s plan bar is the tax (the
// harvest's own margin) / idle = 0 = the plan's own puts outran the
// vanilla bar (the window's tail rides the next chain - the margin in
// reverse: the put outlives the window and the harvest lands late).

import { fuelYieldOf, SMELT_SECONDS_PER_ITEM } from './smelting.mjs' // (v0.747.0) the vanilla yield table's own voice - the diet row's capacity bar, never a made constant (the fueldiet.mjs precedent; smelting never imports smeltledger - no cycle); (v0.748.0) SMELT_SECONDS_PER_ITEM - the clock window's own vanilla bar (200 ticks / 20 tps)

/**
 * Read the smelt lane's own words into a ledger.
 * @param {string[]} lines one fleet-log, all lines
 * @returns {null|{batches: number, announced: number, items: Object<string,number>, furnaces: Object<string,number>, fuel: number, fuelItems: Object<string,number>, fuelClips: number, fuelClipCompleted: number, fuelClipAsked: number, clockClips: number, clockClipCompleted: number, clockClipAsked: number, refusals: number, refusalWhys: Object<string,number>, byBot: Object<string,{batches: number, announced: number, fuel: number, refusals: number, clips: number}>}}
 */
export function smeltLedger (lines) {
  if (!Array.isArray(lines)) return null
  const ledger = {
    batches: 0,
    announced: 0,
    items: {},
    furnaces: {},
    fuel: 0,
    fuelItems: {},
    fuelClips: 0,
    fuelClipCompleted: 0,
    fuelClipAsked: 0,
    clockClips: 0,
    clockClipCompleted: 0,
    clockClipAsked: 0,
    refusals: 0,
    refusalWhys: {},
    collected: 0,
    tookItems: {},
    tooks: 0,
    clipDebt: 0, // (v0.744.0) the clips' own deficit (asked - completed, both classes)
    clipDebtFuel: 0,
    clipDebtClock: 0,
    clipDebtItems: {},
    clipDebtReannounced: 0, // (v0.745.0) the debt a later chain re-announced (the same bot+item's START after the clip)
    clipDebtOpen: 0, // (v0.745.0) the debt no START ever answered - the shadow's own remainder
    paybackChains: 0, // (v0.745.0) the START lines that answered a clipped batch (bot+item)
    paybackUnits: 0, // (v0.745.0) the units the answering chains announced
    fuelClipFuel: 0, // (v0.747.0) the fuel units the fuel clip lines name (fc[2] - matched and dropped before)
    fuelClipFuelItems: {}, // (v0.747.0) the clip fuel by item (fc[3])
    fuelClipCapacity: 0, // (v0.747.0) the vanilla capacity that fuel carried (sum fc[2] x fuelYieldOf(fc[3]))
    clockClipWindowSec: 0, // (v0.748.0) the window seconds the clock clip lines carried verbatim (cc[2] - matched and dropped before); kept INTEGER here, the capacity's division lives once at the row (the accumulation's own float drift is the trap)
    clockClipIdleSec: 0, // (v0.749.0) the machine's own unpaid seconds inside the plan's windows (per clip max(0, W - 10 x cap); the plan's own 11s bar is the cause, never a fuel/input gap - the emitter caps the put at floor(W/11) BEFORE the put)
    byBot: {}
  }
  // (v0.745.0) the outstanding clip debt per bot|item, in walk order
  const openDebt = {}
  const bot = (id) => {
    if (!ledger.byBot[id]) ledger.byBot[id] = { batches: 0, announced: 0, fuel: 0, refusals: 0, clips: 0, collected: 0, clipDebt: 0 }
    return ledger.byBot[id]
  }
  for (const line of lines) {
    if (typeof line !== 'string') continue
    const s = line.match(SMELT_START_RE)
    if (s) {
      const n = Number(s[2])
      const fuelN = Number(s[5])
      // (v0.745.0) the re-smelt shadow's payback - a START whose bot+item
      // matches an outstanding clip debt IS the promised next chain
      const pk = `${s[1]}|${s[3]}`
      if (openDebt[pk] > 0) {
        ledger.clipDebtReannounced += openDebt[pk]
        openDebt[pk] = 0
        ledger.paybackChains++
        ledger.paybackUnits += n
      }
      ledger.batches++
      ledger.announced += n
      ledger.items[s[3]] = (ledger.items[s[3]] || 0) + n
      ledger.furnaces[s[4]] = (ledger.furnaces[s[4]] || 0) + 1
      ledger.fuel += fuelN
      ledger.fuelItems[s[6]] = (ledger.fuelItems[s[6]] || 0) + fuelN
      const b = bot(s[1])
      b.batches++
      b.announced += n
      b.fuel += fuelN
      continue
    }
    const fc = line.match(SMELT_FUEL_CLIP_RE)
    if (fc) {
      ledger.fuelClips++
      ledger.fuelClipCompleted += Number(fc[4])
      ledger.fuelClipAsked += Number(fc[5])
      bot(fc[1]).clips++
      // (v0.744.0) the clip's own debt - the units the chain left smelting
      const debt = Number(fc[5]) - Number(fc[4])
      ledger.clipDebt += debt
      ledger.clipDebtFuel += debt
      ledger.clipDebtItems[fc[6]] = (ledger.clipDebtItems[fc[6]] || 0) + debt
      bot(fc[1]).clipDebt += debt
      const ok = `${fc[1]}|${fc[6]}`
      openDebt[ok] = (openDebt[ok] || 0) + debt
      // (v0.747.0) the clip's own diet - the fuel side's own worth
      const fuelN = Number(fc[2])
      ledger.fuelClipFuel += fuelN
      ledger.fuelClipFuelItems[fc[3]] = (ledger.fuelClipFuelItems[fc[3]] || 0) + fuelN
      ledger.fuelClipCapacity += fuelN * fuelYieldOf(fc[3])
      continue
    }
    const cc = line.match(SMELT_CLOCK_CLIP_RE)
    if (cc) {
      ledger.clockClips++
      ledger.clockClipCompleted += Number(cc[3])
      ledger.clockClipAsked += Number(cc[4])
      // (v0.748.0) the clock's own window - the seconds the line carried
      // verbatim (cc[2]), the clock class's own worth leg
      ledger.clockClipWindowSec += Number(cc[2])
      // (v0.749.0) the plan's own margin - the emitter prices the cap at
      // PUT time (smelting.mjs: clockCapItems = max(1, floor(W / 11)), the
      // 11s bar being 'vanilla 10s + lag margin'), so the ~C is what the
      // plan PUT, never what the furnace completed; the machine's own
      // unpaid time inside the plan's window is the vanilla bar's own
      // remainder: max(0, W - 10 x cap), integer seconds
      ledger.clockClipIdleSec += Math.max(0, Number(cc[2]) - SMELT_SECONDS_PER_ITEM * Number(cc[3]))
      bot(cc[1]).clips++
      // (v0.744.0) the clip's own debt - the clock class's own deficit
      const debt = Number(cc[4]) - Number(cc[3])
      ledger.clipDebt += debt
      ledger.clipDebtClock += debt
      ledger.clipDebtItems[cc[5]] = (ledger.clipDebtItems[cc[5]] || 0) + debt
      bot(cc[1]).clipDebt += debt
      const ok = `${cc[1]}|${cc[5]}`
      openDebt[ok] = (openDebt[ok] || 0) + debt
      continue
    }
    const r = line.match(SMELT_REFUSAL_RE)
    if (r) {
      ledger.refusals++
      ledger.refusalWhys[r[2]] = (ledger.refusalWhys[r[2]] || 0) + 1
      bot(r[1]).refusals++
      continue
    }
    // (v0.462.0) the harvest leg - the machine's output collection, the
    // smelted counter's own emitter twin
    const t = line.match(SMELT_TOOK_RE)
    if (t) {
      const n = Number(t[2])
      ledger.tooks++
      ledger.collected += n
      ledger.tookItems[t[3]] = (ledger.tookItems[t[3]] || 0) + n
      bot(t[1]).collected += n
    }
  }
  // (v0.745.0) the shadow's own remainder - the debt no START ever answered
  for (const k in openDebt) ledger.clipDebtOpen += openDebt[k]
  return ledger
}

// (v0.744.0) ONE verdict line, only when the chains left a debt at all
// (zero clips = the honest silence - no row invented). The items' own
// tail names WHAT the furnace owes (the top two, weight-first).
export function clipDebtRow (ledger) {
  if (!ledger || !(ledger.clipDebt > 0)) return null
  const items = Object.entries(ledger.clipDebtItems || {}).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k, n]) => `${k} ${n}`).join(', ')
  return `the clip's own debt: the chains left ${ledger.clipDebt} unit(s) smelting (fuel ${ledger.clipDebtFuel} / clock ${ledger.clipDebtClock}${items ? `; ${items}` : ''}) - the furnace still owes the harvest`
}

// (v0.745.0) ONE verdict line, only when a debt stood at all (zero clips
// = the honest silence). Two classes, exclusive: a chain returned (the
// clip line's own promise kept) / none ever did (the IOU stands alone -
// the furnace's mid-smelt units are the face's own leak into the void).
export function clipPaybackRow (ledger) {
  if (!ledger || !(ledger.clipDebt > 0)) return null
  if (!(ledger.paybackChains > 0)) {
    return `the re-smelt shadow's payback: no chain ever returned for the ${ledger.clipDebt} unit(s) the clips left smelting - the IOU stands alone`
  }
  return `the re-smelt shadow's payback: ${ledger.paybackChains} chain(s) returned for the clipped batches (${ledger.paybackUnits} unit(s) re-announced of ${ledger.clipDebt} owed) - ${ledger.clipDebtOpen} still unanswered`
}

// (v0.747.0) ONE verdict line, only when a fuel clip stood at all (the
// diet is the fuel side's own read - clock-only faces read the honest
// silence). The join: delivered vs the vanilla capacity the clip fuel
// carried (fuelYieldOf's own table, never a made constant). Two classes,
// exclusive: paid in full (the fuel died at its own capacity - the ask's
// own price) / a tail unpaid (the window's own tax rode the same chain).
// An unknown fuel's capacity is the honest gap, never a guess.
export function clipDietRow (ledger) {
  if (!ledger || !(ledger.fuelClips > 0)) return null
  const items = Object.entries(ledger.fuelClipFuelItems || {}).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k, n]) => `${k} ${n}`).join(', ')
  if (!(ledger.fuelClipCapacity > 0)) {
    return `the clip's own diet: the fuel clips burned ${ledger.fuelClipFuel} fuel-unit(s) (${items}) for ${ledger.fuelClipCompleted} completed unit(s) - the vanilla capacity unreadable (unknown fuel) - the honest gap`
  }
  const pct = Math.round(100 * ledger.fuelClipCompleted / ledger.fuelClipCapacity)
  const verdict = pct >= 100
    ? 'the fuel died at its own capacity - the ask\'s own price'
    : 'the capacity\'s own tail unpaid - the window\'s own tax rode the same chain'
  return `the clip's own diet: the fuel clips burned ${ledger.fuelClipFuel} fuel-unit(s) (${items}) for ${ledger.fuelClipCompleted} completed unit(s) - the vanilla capacity ${ledger.fuelClipCapacity} paid ${pct}% (${verdict})`
}

// (v0.749.0) ONE verdict line, only when a clock clip stood at all (zero
// clock clips = the honest silence). THE CORRECTED READ (the record's own
// correction - the ~C is the plan's own put cap, floor(W/11) at the
// emitter, never the furnace's completed count): the row prices the
// plan's own margin in the machine's own seconds. Two classes,
// exclusive: idle > 0 = the 11s plan bar is the tax (the harvest's own
// margin) / idle = 0 = the plan's own puts outran the vanilla bar (the
// window's tail rides the next chain).
export function clockWindowRow (ledger) {
  if (!ledger || !(ledger.clockClips > 0)) return null
  const bar = ledger.clockClipWindowSec / SMELT_SECONDS_PER_ITEM
  const verdict = ledger.clockClipIdleSec > 0
    ? 'the plan\'s own 11s bar is the tax - the harvest\'s own margin'
    : 'the plan\'s own puts outran the vanilla bar - the window\'s tail rides the next chain'
  return `the clock's own window: the clock clips burned ${ledger.clockClipWindowSec}s of window for ${ledger.clockClipCompleted} unit(s) put (the plan's own cap) - the vanilla capacity ${bar} left ${ledger.clockClipIdleSec}s idle (${verdict})`
}

// (v0.749.0) THE CLOCK ASK'S OWN SCALE - the batch's own size, priced
// against the windows' whole vanilla worth. The v0.748.0 window row
// priced the furnace's own beat (completed vs capacity): the 58th idled
// to 84% - but a 3-unit idle shortfall cannot own a 121-unit clock debt.
// The ask's own side stayed unpriced: the windows' ENTIRE worth was 19
// units against 137 asked - the batch was never finishable, the debt was
// the plan's own scale before the furnace ever idled. ONE verdict line,
// only when a clock clip stood AND the windows' vanilla worth could not
// have paid the ask (capacity >= asked reads the honest silence - the
// metronome's own side owns that face, the v0.748.0 row already reads
// it). The join rides the v0.748.0 cells (clockClipWindowSec, the field;
// SMELT_SECONDS_PER_ITEM, the import) - one read, no re-parsing, the
// skywalk law.
export function clockAskRow (ledger) {
  if (!ledger || !(ledger.clockClips > 0)) return null
  const cap = ledger.clockClipWindowSec / SMELT_SECONDS_PER_ITEM
  if (!(cap < ledger.clockClipAsked)) return null
  const pct = Math.round(100 * cap / ledger.clockClipAsked)
  return `the clock ask's own scale: the windows' vanilla worth ${cap} = ${pct}% of the ${ledger.clockClipAsked} asked unit(s) - the batch's own size owned the debt (the windows could never have paid it)`
}
