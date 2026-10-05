//
// fueldiet.mjs - THE FUEL DIET'S OWN BILL (v0.666.0)
// The intent side's fuel economics, split by the window the emitter itself
// uses. smeltLedger (v0.461.0) counts the intent side whole ('fuel 81u:
// stick 56 coal 17' on face 37279622224) and furnacePut (v0.664.0) prints
// the put pairing whole - both laws print the pairing WITHOUT judgment.
// But the diet's COST is nobody's row: the metal windows burning kindling
// (the fire-1539/1600 faces watched the copper's coal share fall 16/17 ->
// 3/7 while the pockets were coal-dry - the still-dry asks own the
// delivery), and the junk windows touching coal above the floor.
//
// THE WINDOW SPLIT (one truth, no re-implementation): the emitter's own
// verdict is METAL_INPUTS.has(input) (src/lib/smelting.mjs pickFuel's
// metalWindow arg) - a metal window runs coal-first (solidPick ||
// woodPick), a junk window runs wood-first (woodPick || solidPick above
// the floor). So the split is the machine's own diet law read back, never
// the census's invention:
//   metal window: 'smelting N x raw_copper in a blast_furnace (fuel: ...)'
//     - the diet's kindling bill prices here: the fuel units burned, the
//       smelt capacity they carried (count x fuelYieldOf, the vanilla
//       table's own numbers - one truth again), and the coal units that
//       would carry the SAME capacity (capacity / fuelYieldOf('coal'),
//       ceiled - coal's 8:1 is the table's voice, not a made constant).
//   junk window: everything else - the coal touch names itself when the
//     junk side burned coal at all (the JUNK_COAL_FLOOR's own field read:
//     the commons smelting on the good fuel).
//
// THE MISMATCH GRAIN: a metal input in a plain furnace ('smelting 1 x
// raw_copper in a furnace') - the blast lane's speed lost to the machine
// pick. The emitter names the machine in every start line; the census
// counts the metal-in-furnace shape (metal-in-blast is the design, junk
// in either machine is the junk lane's own business).
//
// THE FIELD READ (face 37279622224, hand-traced against the raw log):
// 15 starts - metal 7 batches 23u raw_copper on fuel 50u (stick 44, coal
// 4, oak_log 2; capacity 57 smelts, coal's 8/u carries it on 8u) | junk 8
// batches 21u on fuel 31u (coal 13 - the cobblestone batch's own 13u coal
// touch - stick 12, oak_log 5, birch_log 1) | the metal sat in a plain
// furnace x1 (F14). The stick 44u is the wood the copper ate; the tools'
// stick-droughts (the recovery book's mid-fails, the armory's skips) are
// the other side of the same wood - the join is the next read's subject,
// the row carries the bill.
//
// THE ZERO LAW: no start lines -> the collector returns starts 0 and the
// decompose block prints nothing (the byte-stable silence). An unknown
// fuel name (fuelYieldOf 0) never invents capacity - the units still
// count (the fuel went somewhere) but the capacity arithmetic ignores
// what the vanilla table does not know.
//
import { SMELT_START_RE } from './smeltledger.mjs'
import { METAL_INPUTS, fuelYieldOf } from './smelting.mjs'

const emptyWindow = () => ({ batches: 0, items: {}, fuel: 0, fuelItems: {}, capacity: 0 })

export function fuelDiet (lines) {
  if (!Array.isArray(lines)) return null
  const diet = {
    starts: 0,
    metal: emptyWindow(),
    junk: emptyWindow(),
    metalMismatch: { count: 0, bots: {} }
  }
  for (const line of lines) {
    if (typeof line !== 'string') continue
    const s = line.match(SMELT_START_RE)
    if (!s) continue
    const botId = s[1]
    const count = Number(s[2])
    const inputName = s[3]
    const machine = s[4]
    const fuelN = Number(s[5])
    const fuelName = s[6]
    diet.starts++
    const win = METAL_INPUTS.has(inputName) ? diet.metal : diet.junk
    win.batches++
    win.items[inputName] = (win.items[inputName] || 0) + count
    win.fuel += fuelN
    win.fuelItems[fuelName] = (win.fuelItems[fuelName] || 0) + fuelN
    const yieldPer = fuelYieldOf(fuelName)
    if (yieldPer > 0) win.capacity += fuelN * yieldPer
    if (METAL_INPUTS.has(inputName) && machine === 'furnace') {
      diet.metalMismatch.count++
      diet.metalMismatch.bots[botId] = (diet.metalMismatch.bots[botId] || 0) + 1
    }
  }
  return diet
}

// The coal-equivalent bill: the coal units that carry the same smelt
// capacity (capacity / coal's yield, ceiled - a fractional tail never
// finishes an item, the ONE-ITEM FLOOR's own law). Zero capacity (an
// all-unknown-fuel face) reads 0 - never a division by the table's
// absence.
export function coalEquivalent (capacity) {
  const coalYield = fuelYieldOf('coal')
  if (!Number.isFinite(capacity) || capacity <= 0 || !(coalYield > 0)) return 0
  return Math.ceil(capacity / coalYield)
}
