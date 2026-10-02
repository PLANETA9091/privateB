//
// smeltverdict.mjs - THE SMELT VERDICT (v0.490.0; SLOT COLLISION #15:
// 0.489.0 taken by fire-2238's THE SHIELD LADDER mid-fire - re-versioned)
// The furnace's own report card. The smelt ledger (v0.461.0/0.462.0)
// counts the batches, the clips and the refusals - the chain's INTENT
// side - and the took lens reads the collection. Nobody ever read the
// VERDICT line, the emitter's own yield report (byte-verbatim, stable
// across faces 42+43, 8 lines):
//
//   F17 smelted 2 (stone:2) rescued=0
//   F4  smelted 0 () rescued=0 fired=2     <- the in-flight batch
//
// THE WIRE: the clip lines are the batch's PRELUDE - the emitter
// announces the constraint ("fuel clips the batch: 5 x stick completes
// 2 of 22") BEFORE it fuels ("smelting 2 x cobblestone"), so each
// start consumes its bot's pending clips (a FIFO queue per bot) and
// the start's own batch size IS that min() arithmetic, byte-verbatim
// (9/9 on the stored faces). Each verdict closes ALL of its bot's open
// batches (the emitter reports the window's whole yield at once - F9's
// two sand batches land in one 'smelted 8 (glass:8)') and the open
// batches' own clip lines price the FORECAST: min(fuel-completes,
// clock-completes), or the full batch when no clip named a constraint.
// The one miss on the stored faces is the IN-FLIGHT class: F4's batch
// fired 2 and yielded 0 - the clock killed it AFTER fueling and no
// clip line exists for it (a clip prints only when something
// completed; a zero-completion batch has no clip at all) - only the
// verdict's own fired tail catches it. The binding split prices WHICH
// constraint set the batch: fuel completes < clock completes =
// fuel-bound, else clock-bound, no clips = none (the pocket-limited
// batch). The fuel census (clip lines only - a fuel that never clipped
// has no named completes) reads the emitter's own fuel-value table:
// 3 coal -> 24 completes, 12 sticks -> 5. The parsers are imported -
// one parser per shape, the REs never redefined here.
//
import { SMELT_START_RE, SMELT_FUEL_CLIP_RE, SMELT_CLOCK_CLIP_RE } from './smeltledger.mjs'

// The verdict: 'F17 smelted 2 (stone:2) rescued=0' / 'F4 smelted 0 ()
// rescued=0 fired=2' - the outputs ride the parens as item:n segments
// (empty parens = the zero yield), the rescued count is part of the
// skin, the fired tail appears only when the furnace STARTED items it
// never finished (the in-flight batch's own marker).
export const SMELT_VERDICT_RE = /^(F\d+) smelted (\d+) \(([^)]*)\) rescued=(\d+)(?: fired=(\d+))?$/

function parseOutputs (raw) {
  const out = {}
  if (!raw) return out
  for (const seg of raw.split(',')) {
    const m = /^([a-z_]+):(\d+)$/.exec(seg.trim())
    if (m) out[m[1]] = (out[m[1]] || 0) + Number(m[2])
  }
  return out
}

function batchPredicted (b) {
  const fuel = b.fuelCompletes
  const clock = b.clockCompletes
  if (fuel == null && clock == null) return b.batch
  if (fuel == null) return clock
  if (clock == null) return fuel
  return Math.min(fuel, clock)
}

function batchBinding (b) {
  const fuel = b.fuelCompletes
  const clock = b.clockCompletes
  if (fuel == null && clock == null) return 'none'
  if (fuel == null) return 'clock'
  if (clock == null) return 'fuel'
  if (fuel < clock) return 'fuel'
  if (clock < fuel) return 'clock'
  return 'tie'
}

/**
 * Read the smelt lane's verdict side into a ledger.
 * @param {string[]} lines one fleet-log, all lines
 * @returns {null|{verdicts: number, batches: number, orphanClips: number, openBatches: number, actualTotal: number, forecastTotal: number, exact: number, misses: Array, overs: Array, unforecast: number, firedTails: number, rescuedTotal: number, outputs: Object<string,number>, binding: Object<string,number>, minLaw: {checked: number, held: number}, fuelTable: Object<string,{n: number, completes: number}>, rows: Array}}
 */
export function smeltVerdict (lines) {
  if (!Array.isArray(lines)) return null
  const lanes = new Map()
  const rows = []
  const fuelTable = {}
  let batches = 0

  const lane = bot => {
    if (!lanes.has(bot)) lanes.set(bot, { open: [], pending: [] })
    return lanes.get(bot)
  }

  for (const line of lines) {
    if (typeof line !== 'string') continue
    let m = SMELT_START_RE.exec(line)
    if (m) {
      const l = lane(m[1])
      const b = {
        bot: m[1], item: m[3], batch: Number(m[2]), machine: m[4],
        fuelN: Number(m[5]), fuelItem: m[6],
        fuelCompletes: null, fuelAsked: null,
        clockCompletes: null, clockWindow: null, clockAsked: null
      }
      // The clips are the batch's prelude: the start consumes them.
      for (const p of l.pending.splice(0, l.pending.length)) {
        if (p.kind === 'fuel' && b.fuelCompletes == null) {
          b.fuelCompletes = p.completes
          b.fuelAsked = p.asked
        } else if (p.kind === 'clock' && b.clockCompletes == null) {
          b.clockCompletes = p.completes
          b.clockWindow = p.window
          b.clockAsked = p.asked
        }
      }
      l.open.push(b)
      batches++
      continue
    }
    m = SMELT_FUEL_CLIP_RE.exec(line)
    if (m) {
      lane(m[1]).pending.push({ kind: 'fuel', fuelN: Number(m[2]), fuelItem: m[3], completes: Number(m[4]), asked: Number(m[5]) })
      const t = fuelTable[m[3]] || (fuelTable[m[3]] = { n: 0, completes: 0 })
      t.n += Number(m[2])
      t.completes += Number(m[4])
      continue
    }
    m = SMELT_CLOCK_CLIP_RE.exec(line)
    if (m) {
      lane(m[1]).pending.push({ kind: 'clock', window: Number(m[2]), completes: Number(m[3]), asked: Number(m[4]) })
      continue
    }
    m = SMELT_VERDICT_RE.exec(line)
    if (m) {
      const l = lane(m[1])
      const open = l.open.splice(0, l.open.length)
      const perBatch = open.map(b => ({
        item: b.item, batch: b.batch, binding: batchBinding(b),
        predicted: batchPredicted(b),
        minLawHeld: (b.fuelCompletes != null || b.clockCompletes != null)
          ? b.batch === batchPredicted(b)
          : null
      }))
      const forecast = open.length ? perBatch.reduce((s, b) => s + b.predicted, 0) : null
      rows.push({
        bot: m[1],
        actual: Number(m[2]),
        outputs: parseOutputs(m[3]),
        rescued: Number(m[4]),
        fired: m[5] != null ? Number(m[5]) : null,
        forecast,
        batches: perBatch,
        exact: forecast != null && forecast === Number(m[2]),
        miss: forecast != null && forecast > Number(m[2])
          ? forecast - Number(m[2])
          : 0,
        over: forecast != null && forecast < Number(m[2])
          ? Number(m[2]) - forecast
          : 0
      })
    }
  }

  const binding = { fuel: 0, clock: 0, tie: 0, none: 0 }
  const minLaw = { checked: 0, held: 0 }
  const outputs = {}
  let actualTotal = 0
  let forecastTotal = 0
  let exact = 0
  let unforecast = 0
  let firedTails = 0
  let rescuedTotal = 0
  const misses = []
  const overs = []
  let openBatches = 0
  let orphanClips = 0
  for (const l of lanes.values()) {
    openBatches += l.open.length
    orphanClips += l.pending.length
  }
  for (const r of rows) {
    actualTotal += r.actual
    rescuedTotal += r.rescued
    for (const [k, n] of Object.entries(r.outputs)) outputs[k] = (outputs[k] || 0) + n
    if (r.fired != null) firedTails++
    if (r.forecast == null) { unforecast++; continue }
    forecastTotal += r.forecast
    if (r.exact) exact++
    if (r.miss > 0) misses.push(r)
    if (r.over > 0) overs.push(r)
    for (const b of r.batches) {
      binding[b.binding] = (binding[b.binding] || 0) + 1
      if (b.minLawHeld != null) {
        minLaw.checked++
        if (b.minLawHeld) minLaw.held++
      }
    }
  }

  return {
    verdicts: rows.length, batches, orphanClips, openBatches,
    actualTotal, forecastTotal, exact, misses, overs, unforecast,
    firedTails, rescuedTotal, outputs, binding, minLaw, fuelTable, rows
  }
}
