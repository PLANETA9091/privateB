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
    byBot: {}
  }
  const bot = (id) => {
    if (!ledger.byBot[id]) ledger.byBot[id] = { batches: 0, announced: 0, fuel: 0, refusals: 0, clips: 0, collected: 0 }
    return ledger.byBot[id]
  }
  for (const line of lines) {
    if (typeof line !== 'string') continue
    const s = line.match(SMELT_START_RE)
    if (s) {
      const n = Number(s[2])
      const fuelN = Number(s[5])
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
      continue
    }
    const cc = line.match(SMELT_CLOCK_CLIP_RE)
    if (cc) {
      ledger.clockClips++
      ledger.clockClipCompleted += Number(cc[3])
      ledger.clockClipAsked += Number(cc[4])
      bot(cc[1]).clips++
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
  return ledger
}
