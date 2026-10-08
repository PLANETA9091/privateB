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
// v0.699.0 THE DOWNSTREAM SEAT - the unanimity break named. The face-31
// read (logs 4/5, NOT unanimous) begged the question the aggregate cannot
// answer: WHICH famine sat below the head. slots grows down: every wood
// famine that held logs > 0 rides {bot, sticks, planks, logs} in face
// order - the walk brought raw wood home (the gather leg held) yet the
// sticks famine fired: the starve sat BELOW the head (the conversion
// leg's own seat, not the drought's). The head-unanimous face (the 26th
// 3/3, the 32nd 3/3) reads down: [] - the honest silence (the drought
// needs no name, it starved everyone). Zero new regexes: the famine
// line's own captures were already in the census's hand.
//
// census shape: famineCensus(lines) ->
//   { wood: {n, byBot, slots: {logsZero, planksZero, sticksZero,
//     down: [{bot, sticks, planks, logs}]},
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

// v0.814.0 THE FAMINE'S OWN LANE - WHICH lane owns the starvation book.
// The census rows (v0.687.0) price the two lanes' own anatomies raw - the
// wood line's chain (logs/planks/sticks) and the food line's plate - but
// no row ever said whether the WOOD or the FOOD lane OWNS the face's
// famine book: the lane's own seat rode unnamed while the gather drought
// (the face-26 signature: logs 0/3, the head starved) and the carry
// drought (plate 0 - the bot carried no food at all, the face-92
// signature: 8/8) split the book face by face.
//
// The census's own cells only, zero re-parsing (the v0.802.0 orphan
// seat's own law, the v0.811.0 climb seat's own shape): the book is the
// two lanes' own n tallies. The strict-majority law: a lane owns only
// when it holds MORE than the rest of the book together - a tie owns
// nothing (the v0.784.0 kind-seat's own law; a two-lane book's only tie
// shape is the even split). The byte order decides the ranked tie -
// 'food' 0x66 sorts before 'wood' 0x77. The lone-lane face reads the
// seat at its own 100% (the singular arm's own precedent - the lane
// alone IS the owner); the riders are the pair measure-not-owner and only
// >= 2 kinds form a crowd (the v0.807.0 law). Junk never invents a lane:
// a non-object census, a non-finite or non-positive count, or a zero
// book reads the honest silence (null).
function famineLaneCells (fc) {
  if (!fc || typeof fc !== 'object') return null
  const cells = []
  const woodN = fc.wood && typeof fc.wood === 'object' ? fc.wood.n : null
  const foodN = fc.food && typeof fc.food === 'object' ? fc.food.n : null
  if (Number.isFinite(woodN) && woodN > 0) cells.push(['wood', woodN])
  if (Number.isFinite(foodN) && foodN > 0) cells.push(['food', foodN])
  if (cells.length === 0) return null
  const total = cells.reduce((s, [, n]) => s + n, 0)
  if (!(total > 0)) return null
  cells.sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
  return { cells, total }
}

// The famine's own seat - the strict-majority owner of the starvation
// book, or null when no lane holds more than the rest together (v0.814.0).
export function famineLaneSeat (fc) {
  const t = famineLaneCells(fc)
  if (!t) return null
  const [lane, topN] = t.cells[0]
  if (topN > t.total - topN) {
    return { lane, owns: topN, ofFamines: t.total, shareOfFamines: topN / t.total * 100 }
  }
  return null
}

// The famine's own riders - the top-two pair when the solo law refuses to
// seat (measure-not-owner; a lone lane is no crowd and reads null,
// v0.814.0 - a two-lane book's only crowd shape is the even split).
export function famineLaneRiders (fc) {
  const t = famineLaneCells(fc)
  if (!t || t.cells.length < 2) return null
  const [leader, leaderOwns] = t.cells[0]
  const [runner, runnerOwns] = t.cells[1]
  const pairOwns = leaderOwns + runnerOwns
  return {
    leader, leaderOwns, runner, runnerOwns,
    ofFamines: t.total, pairOwns,
    shareOfFamines: pairOwns / t.total * 100,
    duet: `${leader} x${leaderOwns} + ${runner} x${runnerOwns}`,
  }
}

// The lane seat row - the byte-exact read the decompose prints beside the
// famine census (the branch law: the owner case leaves the companion
// unprinted). Guarded end to end; junk reads null (v0.814.0).
export function famineLaneSeatRow (seat) {
  if (!seat || typeof seat !== 'object') return null
  const { lane, owns, ofFamines, shareOfFamines } = seat
  if (lane !== 'wood' && lane !== 'food') return null
  if (!Number.isFinite(owns) || owns <= 0) return null
  if (!Number.isFinite(ofFamines) || ofFamines <= 0) return null
  if (owns > ofFamines) return null
  if (!Number.isFinite(shareOfFamines)) return null
  const s = ofFamines === 1 ? 'famine' : 'famines'
  return `the famine's own lane (v0.814.0): ${lane} owns ${owns} of ${ofFamines} ${s} (${shareOfFamines.toFixed(1)}%) - THE FAMINE'S OWN SEAT: one lane's own starves own the book - the lane's own front prices the trip the raw split rode unnamed`
}

// The riders row - the byte-exact read for the no-owner faces (v0.814.0).
export function famineLaneRidersRow (r) {
  if (!r || typeof r !== 'object') return null
  const { leader, leaderOwns, runner, runnerOwns, ofFamines, pairOwns, shareOfFamines, duet } = r
  if (leader !== 'wood' && leader !== 'food') return null
  if (runner !== 'wood' && runner !== 'food') return null
  if (leader === runner) return null
  if (!Number.isFinite(leaderOwns) || leaderOwns <= 0) return null
  if (!Number.isFinite(runnerOwns) || runnerOwns <= 0) return null
  if (!Number.isFinite(ofFamines) || ofFamines <= 0) return null
  if (!Number.isFinite(pairOwns) || pairOwns <= 0) return null
  if (pairOwns > ofFamines) return null
  if (typeof duet !== 'string' || duet === '') return null
  if (!Number.isFinite(shareOfFamines)) return null
  const s = ofFamines === 1 ? 'famine' : 'famines'
  return `the famine's own riders (v0.814.0): no solo lane owns the majority - ${duet} own ${pairOwns} of ${ofFamines} ${s} (${shareOfFamines.toFixed(1)}%) - THE FAMINE'S OWN TIE: the seat's tie law held, the lanes' own crowd prices the starvation the solo law refused to name`
}

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
 *   slots: {logsZero: number, planksZero: number, sticksZero: number,
 *   down: {bot: string, sticks: number, planks: number, logs: number}[]},
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
  const wood = { n: 0, byBot: {}, slots: { logsZero: 0, planksZero: 0, sticksZero: 0, down: [] }, repeats: emptyRepeats() }
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
      else wood.slots.down.push({ bot: wm[1], sticks, planks, logs }) // the unanimity break: the starve sat below the head
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
