import { decideSkin } from './askwhycensus.mjs'

// (v0.716.0) THE NOPATH DOOR'S OWN BOT BILL - the no-path spike's WHO read.
//
// The door lanes' no-path verdicts were priced (the bankdocket's fuel/iron
// cells v0.704.0/705.0, the ask ladder's by-side skins v0.653.0/655.0) but
// nobody reads WHO rode the verdict. The spike's anatomy question (face 40's
// fuel no-path 15, the era high) is COLUMN vs CROWD: one bot's dead approach
// reproducing (a single bot owning the rides - the relog lane's v0.715.0
// repeats law) vs the fleet-wide ride (many bots one ride each - the goal's
// own verdict, the approach side's honest residual for the coordinate lens).
//
// nopathBill(lines) folds the door family's no-path rides per bot per lane
// (the doorstepStormCensus signature law: parsed cells in, one shape out,
// zero new skin regexes - the no-path skin rides decideSkin()'s own class,
// the v0.653.0 grammar). The line grammar is the ask ladder's own byte
// (ASK_WHY_RE) extended by the bot token and the v0.705.0 iron double-prefix
// skin ('iron commune: iron commune: chest walk failed...' - the ask ladder
// is blind to it, the bill is not; the 40th's iron no-path ride wore it).
//
// A no-path-free face reads the honest silence (null); a one-lane face reads
// the other lanes' real zeros (the cells read honestly, the count is true).
// Pure: reads, never mutates. Zero fleet wiring (mining-surface only, the
// v0.379/.../v0.715.0 precedent).
//

// The door family's own byte: the ask ladder's grammar (ASK_WHY_RE) plus
// the bot token (the WHO read's join key) and the optional lane-echo prefix
// (the v0.705.0 double-prefix skin, the backreference keeps it lane-exact).
const NOPATH_DOOR_RE = /^(F\d+) ((?:fuel|food) commons|iron commune)(?:: \2)?: chest walk failed(?: after the nudge)? \((.+)\)$/

const ZERO_LANE = () => ({ n: 0, byBot: {}, repeats: {}, distinct: 0 })

/**
 * nopathBill(lines) - the door lanes' no-path verdicts, per bot.
 *
 * @param {string[]|string|null} lines the face log (array or raw blob)
 * @returns {null|{n: number,
 *   fuel: {n: number, byBot: Object<string, number>, repeats: Object<string, number>, distinct: number},
 *   food: {n: number, byBot: Object<string, number>, repeats: Object<string, number>, distinct: number},
 *   iron: {n: number, byBot: Object<string, number>, repeats: Object<string, number>, distinct: number}}}
 *   null when the face rode no no-path door verdict (the honest silence).
 */
export function nopathBill (lines) {
  const list = Array.isArray(lines)
    ? lines
    : (typeof lines === 'string' ? lines.split('\n') : null)
  if (!list) return null
  const bill = { n: 0, fuel: ZERO_LANE(), food: ZERO_LANE(), iron: ZERO_LANE() }
  for (const line of list) {
    if (typeof line !== 'string') continue
    const m = line.match(NOPATH_DOOR_RE)
    if (!m) continue
    if (decideSkin(m[3]) !== 'noPath') continue
    const lane = m[2] === 'iron commune'
      ? bill.iron
      : (m[2] === 'food commons' ? bill.food : bill.fuel)
    lane.n++
    lane.byBot[m[1]] = (lane.byBot[m[1]] || 0) + 1
    bill.n++
  }
  if (bill.n === 0) return null
  for (const lane of [bill.fuel, bill.food, bill.iron]) {
    lane.distinct = Object.keys(lane.byBot).length
    for (const [bot, count] of Object.entries(lane.byBot)) {
      if (count >= 2) lane.repeats[bot] = count
    }
  }
  return bill
}
