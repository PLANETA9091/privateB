// (v0.720.0) THE DECIDE DOOR'S OWN BOOK - the decide starvation's WHO+WHERE
// read at the door leg.
//
// The door leg's decide rides were priced (the bankdocket's
// door.decideTimeouts subcount, the v0.703.0 law) and the doorstep's cure
// target MOVED: the 43rd's unreachable leg 41 rode decide 18 WITH the
// no-path lane silent (the v0.716.0 bill's fuel clean) - the budget owns
// the door now, not the geometry. But nobody reads WHO rode the starvation
// or WHICH CHEST the pathfinder could not decide TO: the door family's
// decide lines carry both tokens (the hop probe's skin 'F15 [F15] hop:
// chest at [-127,79,392] d=37 zero: chest unreachable (Took to long to
// decide path to goal!)' - the bot, the goal coordinate, the distance;
// the bank's skin 'F15 bank: chest unreachable (Took to long to decide
// path to goal!) (17 blocks from yard) - walking back' - the bot, no
// coordinate).
//
// decideBook(lines) folds the door family's decide rides per bot and per
// goal (the doorstepStormCensus signature law: parsed cells in, one shape
// out; the skin anchor is the bankdocket's own byte family - 'chest
// unreachable' + the decide tail - zero new skin grammar; the coordinate
// extraction is the hop probe's own token). The goal's own verdict names
// the SHARED dead chest (one coordinate many bots could not decide to -
// the goal-side cure; the v0.716.0 crowd law's decide twin); the bot's
// repeats name the rider (the v0.715.0 repeats law - the same bot the
// starvation keeps visiting). Unpositioned rides (the bank's skin) read
// byBot honestly and stay out of the goal book.
//
// A decide-free face reads the honest silence (null). The boundary is the
// bankdocket's own: the nudge family's decide rides ('chest walk failed
// after the nudge (Took to long...)') stay the askwhycensus/nopathbill
// family's subject - the book opens door.decideTimeouts' own anatomy only
// (the sum check: book.n === bd.door.decideTimeouts on any face).
//
// Pure: reads, never mutates. Zero fleet wiring (mining-surface only, the
// v0.379/.../v0.719.0 precedent).
//

// The door leg's decide skin: the bankdocket's door.decideTimeouts byte
// ('chest unreachable' + the decide tail), the bot token captured, the
// middle left to the family's own variants (the hop probe's, the bank's).
const DECIDE_DOOR_RE = /^(F\d+) .*chest unreachable \(Took to long to decide path to goal!\)/
// The hop probe's own goal token (the coordinate + the distance ride the
// same line when the probe walked it; the bank's skin has no coordinate).
const DECIDE_GOAL_RE = /chest at \[(-?\d+),(-?\d+),(-?\d+)\]/

const ZERO_BOOK = () => ({ n: 0, byBot: {}, repeats: {}, distinct: 0, byGoal: {}, goalRepeats: {}, distinctGoals: 0, unpositioned: 0 })

/**
 * decideBook(lines) - the door leg's decide rides, per bot and per goal.
 *
 * @param {string[]|string|null} lines the face log (array or raw blob)
 * @returns {null|{n: number,
 *   byBot: Object<string, number>, repeats: Object<string, number>, distinct: number,
 *   byGoal: Object<string, number>, goalRepeats: Object<string, number>, distinctGoals: number,
 *   unpositioned: number}}
 *   null when the face rode no decide door verdict (the honest silence).
 */
export function decideBook (lines) {
  const list = Array.isArray(lines)
    ? lines
    : (typeof lines === 'string' ? lines.split('\n') : null)
  if (!list) return null
  const book = ZERO_BOOK()
  for (const line of list) {
    if (typeof line !== 'string') continue
    const m = line.match(DECIDE_DOOR_RE)
    if (!m) continue
    const bot = m[1]
    book.n++
    book.byBot[bot] = (book.byBot[bot] || 0) + 1
    const g = line.match(DECIDE_GOAL_RE)
    if (g) {
      const goal = `${g[1]},${g[2]},${g[3]}`
      book.byGoal[goal] = (book.byGoal[goal] || 0) + 1
    } else {
      book.unpositioned++
    }
  }
  if (book.n === 0) return null
  book.distinct = Object.keys(book.byBot).length
  for (const [bot, count] of Object.entries(book.byBot)) {
    if (count >= 2) book.repeats[bot] = count
  }
  book.distinctGoals = Object.keys(book.byGoal).length
  for (const [goal, count] of Object.entries(book.byGoal)) {
    if (count >= 2) book.goalRepeats[goal] = count
  }
  return book
}
