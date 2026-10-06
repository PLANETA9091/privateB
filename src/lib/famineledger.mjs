//
// famineledger.mjs - THE FAMINE ANATOMY (v0.687.0)
//
// The trip's own starvation census. The fleet's famine byte has ridden
// every face since the wood famine walks existed (fleet v0.177.0 era,
// the woodplan famineDue logic's own print):
//
//   'F10 wood trip: famine (sticks 5 planks 2 logs 0) - gathering'
//   'F11 food trip: famine (hunger 17, plate 0) - the commons walk'
//
// and the mining lens never carried it. The stick-drought front (12/13
// recovery mid-fails, the 23rd) and the wood chain's repeated famines
// demanded the read: WHICH SLOT starves. The wood line prices its own
// chain anatomy (sticks/planks/logs counts), the food line prices its
// own plate (hunger + plate count):
//
//   logs 0   -> the gather leg starved (the chain's head - no logs to
//               convert; the face-26 read: 3/3 wood famines sat here)
//   sticks 0 -> the conversion leg starved (planks exist, the craft
//               never ran - planks 0 too means the head already died)
//   plate 0  -> the bot carried no food at all (the hunger number is
//               then the reserve's own clock)
//
// census shape: famineCensus(lines) ->
//   { wood: {n, byBot, slots: {logsZero, planksZero, sticksZero}},
//     food: {n, byBot, plateZero, hunger: {min, median, max}|null} }
//
// Junk-safe: non-array / non-string-blob reads null (the smeltledger
// convention); a face with no famine lines reads the honest zero shape
// (both families n=0, hunger null - the calm face never invents a
// famine). Pure: reads, never mutates. Zero fleet wiring (mining-
// surface only, the v0.379/v0.403/v0.408/v0.421/v0.682.0/v0.685.0
// precedent) - the fleet's own famine byte is the filter-key, it
// already rides.
//

const medianOf = (xs) => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2
}

// the wood famine byte: the bot id rides the line head (no [F#] tag on
// this family - the trip voice's own skin), the tail names the lane's
// own response ('- gathering' etc., never matched)
const WOOD_FAMINE_RE = /^([A-Za-z]\d+) wood trip: famine \(sticks (\d+) planks (\d+) logs (\d+)\) - .+$/
// the food famine byte: hunger (the reserve's clock) + plate (the carry)
const FOOD_FAMINE_RE = /^([A-Za-z]\d+) food trip: famine \(hunger (\d+(?:\.\d+)?), plate (\d+)\) - .+$/

const bump = (m, k) => { m[k] = (m[k] || 0) + 1 }

/**
 * famineCensus(lines) - the trip famine's own anatomy.
 *
 * @param {string[]|string} [lines] the face log (array or raw blob)
 * @returns {null|{wood: {n: number, byBot: object,
 *   slots: {logsZero: number, planksZero: number, sticksZero: number}},
 *   food: {n: number, byBot: object, plateZero: number,
 *   hunger: {min, median, max}|null}}}
 */
export function famineCensus (lines) {
  const src = Array.isArray(lines)
    ? lines
    : (typeof lines === 'string' ? lines.split('\n') : null)
  if (!src) return null
  const wood = { n: 0, byBot: {}, slots: { logsZero: 0, planksZero: 0, sticksZero: 0 } }
  const food = { n: 0, byBot: {}, plateZero: 0, hunger: null }
  const hungers = []
  for (const line of src) {
    if (typeof line !== 'string') continue
    const wm = line.match(WOOD_FAMINE_RE)
    if (wm) {
      wood.n++
      bump(wood.byBot, wm[1])
      const sticks = Number(wm[2]); const planks = Number(wm[3]); const logs = Number(wm[4])
      if (logs === 0) wood.slots.logsZero++
      if (planks === 0) wood.slots.planksZero++
      if (sticks === 0) wood.slots.sticksZero++
      continue
    }
    const fm = line.match(FOOD_FAMINE_RE)
    if (fm) {
      food.n++
      bump(food.byBot, fm[1])
      const hunger = Number(fm[2]); const plate = Number(fm[3])
      if (plate === 0) food.plateZero++
      hungers.push(hunger)
    }
  }
  food.hunger = hungers.length
    ? { min: Math.min(...hungers), median: medianOf(hungers), max: Math.max(...hungers) }
    : null
  return { wood, food }
}
