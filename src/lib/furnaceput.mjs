//
// furnaceput.mjs - THE FURNACE PUT'S OWN PAIR (v0.664.0)
// The furnace lane's physical act, counted. smeltLedger (v0.461.0) reads
// the lane's INTENT side ('smelting N x raw_copper in a blast_furnace
// (fuel: 1 x coal)') and smeltVerdict (v0.490.0) grades the yield - but
// the lane's own read-back lines, the ones that name what the machine
// ACTUALLY HOLDS after the put, had zero readers. The fire-1500 gap
// survey on face 37271081497: 'furnace within reach' at 24 rows, 'furnace
// slots after put' at 17 rows - both families silent in every census row.
//
// THE EMITTER (one module, two lines - src/lib/smelting.mjs):
//   the no-walk opener (line ~1080): '${machineBlock.name} within reach -
//   opening without a walk' - the bot already stands at the machine, the
//   pathfinder hop never spent (the deposit.mjs lesson's furnace twin);
//   the slot read-back (line ~1450, the v0.92.0 slot-map-lie law): 'furnace
//   slots after put: input=<name|empty> fuel=<name|empty>[ (pocket keeps
//   N)]' - the machine's own slots read back AFTER the put, the truth the
//   v0.92.0 run demanded. The input x fuel pairing IS the furnace's diet:
//   which smelt gets which fuel, the 'empty' name = the slot map lied
//   (or the window died) - the mismatch class's own field voice, and the
//   'pocket keeps N' tail = the batch the pocket could not afford whole.
//
// THE FIELD READ (face 37271081497, hand-traced): opens 24 (furnace 20 /
// blast_furnace 4), puts 17 - the pairing's own story: raw_copper burned
// coal x7 but sand/cobblestone/oak_log burned sticks and planks x10 (the
// kindling diet is REAL - the good coal sits with the copper while the
// commons smelt on wood), pocket-keeps zero, empty slots zero. The pairing
// print is the row's whole point - the diet named, never judged by the
// census itself.
//
// Pure parser, unit-pinned (the torchbook v0.500.0 shape); decompose is
// its field read. Mining-surface only: zero fleet wiring, zero new log
// lines - the v0.379.0 precedent. Junk-safe end to end: non-string rows
// skipped, a face with no furnace lines reads the honest zero.
//

// '[F16] furnace within reach - opening without a walk'
// '[F5] blast_furnace within reach - opening without a walk'
// (the smelting lane's tag carries the SINGLE bracket form - the
// torchbook's doubled 'F9 [F9]' shape is tools.mjs's own wrapper; the
// machine's own block name rides verbatim - the vocabulary is the
// registry's, only the two smelting machines match)
export const FURNACE_NOWALK_OPEN_RE =
  /^\[(\S+)\] (blast_furnace|furnace) within reach - opening without a walk$/

// '[F16] furnace slots after put: input=raw_copper fuel=coal'
// '[F16] furnace slots after put: input=sand fuel=stick (pocket keeps 2)'
// ('empty' is the emitter's own null-voice - the read-back names it verbatim)
export const FURNACE_PUT_RE =
  /^\[(\S+)\] furnace slots after put: input=(\S+) fuel=(\S+)(?: \(pocket keeps (\d+)\))?$/

function zeroBot () {
  return {
    opens: 0, opensFurnace: 0, opensBlast: 0,
    puts: 0, pocketKeeps: 0, pocketKept: 0,
    emptyInputs: 0, emptyFuels: 0,
    pairs: {},
    total: 0
  }
}

function zeroTotals () {
  const t = zeroBot()
  t.putBots = {}
  return t
}

/**
 * Read the furnace put's own pair book - the no-walk opens and the
 * input x fuel slot read-backs, the machine's diet counted per bot.
 * Pure census: no cross-line join, no opener required; every line
 * classifies independently.
 * @param {string[]} lines one fleet-log, all lines
 * @returns {{bots: Object<string, object>, totals: object}|null}
 *   null for a junk input (non-array); a face with no furnace lines
 *   reads the honest zero (empty bots, zeroed totals).
 */
export function furnacePut (lines) {
  if (!Array.isArray(lines)) return null
  const bots = {}
  const totals = zeroTotals()
  const bot = name => bots[name] ?? (bots[name] = zeroBot())
  for (const line of lines) {
    if (typeof line !== 'string') continue
    let m = FURNACE_NOWALK_OPEN_RE.exec(line)
    if (m) {
      const b = bot(m[1])
      b.opens++
      if (m[2] === 'blast_furnace') b.opensBlast++
      else b.opensFurnace++
      b.total++
      continue
    }
    m = FURNACE_PUT_RE.exec(line)
    if (m) {
      const b = bot(m[1])
      b.puts++
      if (m[2] === 'empty') b.emptyInputs++
      if (m[3] === 'empty') b.emptyFuels++
      const key = `input=${m[2]} fuel=${m[3]}`
      b.pairs[key] = (b.pairs[key] || 0) + 1
      if (m[4] != null) { b.pocketKeeps++; b.pocketKept += Number(m[4]) }
      b.total++
    }
  }
  for (const [name, b] of Object.entries(bots)) {
    for (const k of Object.keys(b)) {
      if (k === 'pairs' || k === 'total') continue
      totals[k] += b[k]
    }
    for (const [key, n] of Object.entries(b.pairs)) {
      totals.pairs[key] = (totals.pairs[key] || 0) + n
    }
    totals.total += b.total
    totals.putBots[name] = b.total
  }
  return { bots, totals }
}
