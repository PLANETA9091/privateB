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
//   { wood: {n, byBot, slots: {logsZero, planksZero, sticksZero},
//     repeats: {n, byBot, span: {min, median, max}|null}},
//     food: {n, byBot, plateZero, hunger: {min, median, max}|null,
//     repeats: {n, byBot, span: {min, median, max}|null}} }
//
// v0.688.0 THE FAMINE REPEAT - the drought's persistence read. One
// famine is a hunger; the SAME bot famine-ing again in the same face
// prices the walk between the famines: it delivered nothing (the
// gather leg's own cure failed - the face-26 read: F8 famine'd at its
// line 294 and again at 2033, 1739 lines apart, the drought sat across
// a whole face segment). repeats: n (the 2nd+ famines), byBot (the
// drought's roster), span {min, median, max} in face lines between the
// repeat and its previous famine (null when no repeats - the honest
// silence). Junk-safe: non-array / non-string-blob reads null (the
// smeltledger convention); a face with no famine lines reads the
// honest zero shape (both families n=0, hunger null - the calm face
// never invents a famine). Pure: reads, never mutates. Zero fleet
// wiring (mining-surface only, the v0.379/.../v0.687.0 precedent) -
// the fleet's own famine byte is the filter-key, it already rides.
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
 *   slots: {logsZero: number, planksZero: number, sticksZero: number},
 *   repeats: {n: number, byBot: object, span: {min, median, max}|null}},
 *   food: {n: number, byBot: object, plateZero: number,
 *   hunger: {min, median, max}|null,
 *   repeats: {n: number, byBot: object, span: {min, median, max}|null}}}}
 */
export function famineCensus (lines) {
  const src = Array.isArray(lines)
    ? lines
    : (typeof lines === 'string' ? lines.split('\n') : null)
  if (!src) return null
  const emptyRepeats = () => ({ n: 0, byBot: {}, span: null })
  const wood = { n: 0, byBot: {}, slots: { logsZero: 0, planksZero: 0, sticksZero: 0 }, repeats: emptyRepeats() }
  const food = { n: 0, byBot: {}, plateZero: 0, hunger: null, repeats: emptyRepeats() }
  const hungers = []
  // the repeat trackers: per family, the bot's famine count and the last
  // famine's line index (the span input - the drought's own clock)
  const lastIdx = { wood: new Map(), food: new Map() }
  const counts = { wood: new Map(), food: new Map() }
  const spans = { wood: [], food: [] }
  const feed = (fam, lane, bot, idx) => {
    fam.n++
    bump(fam.byBot, bot)
    const c = (counts[lane].get(bot) || 0) + 1
    counts[lane].set(bot, c)
    if (c >= 2) {
      // the same bot again: the walk between the famines delivered nothing
      fam.repeats.n++
      bump(fam.repeats.byBot, bot)
      spans[lane].push(idx - lastIdx[lane].get(bot))
    }
    lastIdx[lane].set(bot, idx)
  }
  for (let i = 0; i < src.length; i++) {
    const line = src[i]
    if (typeof line !== 'string') continue
    const wm = line.match(WOOD_FAMINE_RE)
    if (wm) {
      feed(wood, 'wood', wm[1], i)
      const sticks = Number(wm[2]); const planks = Number(wm[3]); const logs = Number(wm[4])
      if (logs === 0) wood.slots.logsZero++
      if (planks === 0) wood.slots.planksZero++
      if (sticks === 0) wood.slots.sticksZero++
      continue
    }
    const fm = line.match(FOOD_FAMINE_RE)
    if (fm) {
      feed(food, 'food', fm[1], i)
      const hunger = Number(fm[2]); const plate = Number(fm[3])
      if (plate === 0) food.plateZero++
      hungers.push(hunger)
    }
  }
  wood.repeats.span = spans.wood.length
    ? { min: Math.min(...spans.wood), median: medianOf(spans.wood), max: Math.max(...spans.wood) }
    : null
  food.repeats.span = spans.food.length
    ? { min: Math.min(...spans.food), median: medianOf(spans.food), max: Math.max(...spans.food) }
    : null
  food.hunger = hungers.length
    ? { min: Math.min(...hungers), median: medianOf(hungers), max: Math.max(...hungers) }
    : null
  return { wood, food }
}
