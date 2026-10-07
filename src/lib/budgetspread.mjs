//
// budgetspread.mjs - THE BUDGET SPREAD (v0.473.0)
//
// The budget-zero family's per-bot half. The trip flows print one verdict
// per exhausted budget: '<bot> fuel commons: budget spent (0/1 units)' and
// the commune variant '<bot> iron commune: budget spent (0/3 units)' - the
// trip kind rides the line (two emitters, one shape, the VERDICT_RE
// precedent). The face-level budget-floor verdict (v0.441.0) phases the
// hop-zero class; the sizing question ("the budget sizing is the lever" -
// the fire-1338 handoff) needs the SPREAD: does the zero-delivery budget
// bite ONE bot (a local defect - the bot's own route or chest) or SPREAD
// across the lane (the fleet-wide sizing lever)? Face 42's own read: 19 of
// 19 bots burned at least one zero-delivery budget - the spread is the
// answer, the lens names it.
//
// One parser per shape: BUDGET_SPENT_RE owns the '<bot> <trip>: budget
// spent (D/G units)' shape with the trip kind captured (fuel commons |
// iron commune); the end-bank variant ('end-bank budget spent - smelt
// skipped', no units parens, no trip colon) and the bank-trip grant lines
// ('bank trip: planned budget 243s') can never masquerade - the anchor
// law. Junk-safe: non-lines skipped, non-array -> null. Pure: reads,
// never mutates.
export const BUDGET_SPENT_RE = /^(F\d+) (fuel commons|iron commune): budget spent \((\d+)\/(\d+) units\)$/i

// budgetSpread(lines) ->
//   { zeros, byKind: { fuel, commune }, delivered, goal, spreadBots,
//     topBot, topN, perBot } | null
//   zeros      total budget-spent verdicts (the family's mass)
//   byKind     { fuel: N, commune: N } - the two trip emitters split
//   delivered  the delivered-units sum (the honest read - zero here is
//              the class's own name, but the law reads it, never assumes)
//   goal       the goal-units sum (the sizing lever's mass)
//   spreadBots distinct bots with >= 1 budget zero (the spread's width)
//   topBot     the bot with the most zeros (line-order tie: the first)
//   topN       its zero count
//   perBot     { F19: { zeros, delivered, goal }, ... }
export function budgetSpread (lines) {
  if (!Array.isArray(lines)) return null
  const perBot = {}
  let zeros = 0
  let delivered = 0
  let goal = 0
  const byKind = { fuel: 0, commune: 0 }
  let topBot = null
  let topN = 0
  for (const line of lines) {
    if (typeof line !== 'string') continue
    const m = BUDGET_SPENT_RE.exec(line)
    if (!m) continue
    zeros++
    byKind[m[2].toLowerCase() === 'iron commune' ? 'commune' : 'fuel']++
    const d = Number(m[3])
    const g = Number(m[4])
    delivered += d
    goal += g
    const bot = m[1]
    const row = perBot[bot] || (perBot[bot] = { zeros: 0, delivered: 0, goal: 0 })
    row.zeros++
    row.delivered += d
    row.goal += g
    if (row.zeros > topN) {
      topN = row.zeros
      topBot = bot
    }
  }
  return { zeros, byKind, delivered, goal, spreadBots: Object.keys(perBot).length, topBot, topN, perBot }
}

//
// (v0.475.0) THE GOAL SPLIT - the sizing lever's goal-size half. Face 42's
// sharpest edge: 'the fuel-commons 1u goal spent to zero 24 times - the
// goal itself may be the miscalibration'. Face 43 repeats it (25 of 34).
// The question the lens exists for: do the zero-delivery budgets ride TINY
// goals (the goal itself is the miscalibration - raise the floor) or do
// they spread across goal sizes (the chain, not the goal, is the lever)?
//
// One parser per shape: reuses BUDGET_SPENT_RE - no new emitter, no new
// shape claimed. Only the ZERO-DELIVERY class feeds the buckets (d === 0,
// the class's own name); a budget-spent line that delivered units is the
// family's other story, not this lens's. Bucket law: goal 1 -> one,
// goal 2..3 -> small, goal >= 4 -> wide (a hypothetical 0-goal line still
// counts in zeros but bucket into none - read, never assumed).
//
// budgetGoalSplit(lines) ->
//   { zeros, one: { zeros, goal }, small: { zeros, goal },
//     wide: { zeros, goal }, oneShare } | null
//   zeros    total zero-delivery budget lines (the family's mass)
//   one      the 1u-goal bucket (the miscalibration candidate)
//   small    the 2-3u bucket
//   wide     the 4+u bucket
//   oneShare one.zeros / zeros (0 when zeros 0 - the honest zero)
export function budgetGoalSplit (lines) {
  if (!Array.isArray(lines)) return null
  const one = { zeros: 0, goal: 0 }
  const small = { zeros: 0, goal: 0 }
  const wide = { zeros: 0, goal: 0 }
  let zeros = 0
  for (const line of lines) {
    if (typeof line !== 'string') continue
    const m = BUDGET_SPENT_RE.exec(line)
    if (!m) continue
    const d = Number(m[3])
    const g = Number(m[4])
    if (d !== 0) continue // the zero-delivery class only - the class's own name
    zeros++
    if (g === 1) { one.zeros++; one.goal += g } else if (g >= 2 && g <= 3) { small.zeros++; small.goal += g } else if (g >= 4) { wide.zeros++; wide.goal += g }
  }
  return { zeros, one, small, wide, oneShare: zeros > 0 ? one.zeros / zeros : 0 }
}

//
// (v0.787.0) THE BUDGET ZERO'S OWN LANE - WHICH trip lane owns the zero
// book. The raw split named the lanes' counts ('fuel 26, commune 3' - face
// 79's own read: 29 zero-delivery budgets, the fuel lane 89.7%) while the
// WHO rode raw: no row ever said WHICH lane's own budgets own the zero
// book. THE SEAT LAW (the census's own byKind cell only, zero re-parsing -
// the v0.784.0 kind-seat precedent): the strict-majority law - a solo lane
// owns the zero book only above half (a tie owns nothing - the v0.784.0
// seat law); junk never invents a lane (a missing or non-object byKind
// cell, a non-finite or non-positive zeros total, or no counted lane reads
// the honest silence). Pure: reads the spread, never mutates.
//
// budgetZeroSeat(spread) ->
//   { lane, owns, ofZeros, share } | null
export function budgetZeroSeat (spread) {
  if (!spread || typeof spread !== 'object') return null
  const byKind = spread.byKind
  if (!byKind || typeof byKind !== 'object' || Array.isArray(byKind)) return null
  const total = spread.zeros
  if (!Number.isFinite(total) || total <= 0) return null
  const lanes = Object.entries(byKind)
    .filter(([lane, n]) => typeof lane === 'string' && lane !== '' && Number.isFinite(n) && n > 0)
  if (!lanes.length) return null
  lanes.sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
  const [lane, owns] = lanes[0]
  // the tie law - a tie owns nothing (the v0.784.0 seat law)
  if (lanes.length > 1 && lanes[1][1] === owns) return null
  // the strict-majority law - only above half
  if (owns * 2 <= total) return null
  return { lane, owns, ofZeros: total, share: +(owns / total).toFixed(3) }
}

// (v0.787.0) the lane seat's own row - THE ZERO'S OWN LANE: the seat names
// WHICH trip lane owns the zero book; the lane's own front prices the cure
// (the budget sizing is the lever - the fire-1338 handoff's own question).
// Junk never prints a seat (the honest silence's own row law).
export function budgetZeroSeatRow (seat) {
  if (!seat || typeof seat !== 'object') return null
  const { lane, owns, ofZeros, share } = seat
  if (typeof lane !== 'string' || !lane ||
      !Number.isFinite(owns) || owns <= 0 ||
      !Number.isFinite(ofZeros) || ofZeros <= 0 || owns > ofZeros ||
      !Number.isFinite(share)) return null
  return `the budget zero's own lane (v0.787.0): ${lane} owns ${owns} of ${ofZeros} zero-delivery budget(s) (${(share * 100).toFixed(1)}%) - THE ZERO'S OWN LANE: one lane's own budgets own the zero book - the lane's own front prices the walks the raw split rode unnamed`
}

// (v0.787.0) THE BUDGET ZERO'S OWN RIDERS - the lane seat's own silence's
// companion. The seat names the solo lane under the strict-majority law; a
// no-majority zero mix rode raw with no row naming the shape. THE RIDER LAW
// (the census's own byKind cell only, zero re-parsing - the seat's own
// precedent): a MEASURE, never a verdict-owner - the top two lanes'
// concentration prices the shape the solo law refused to name (the seat's
// owner case leaves the companion unprinted - the decompose's own branch
// law). Junk never invents a shape: a missing or non-object byKind cell, a
// non-finite or non-positive zeros total, or fewer than two counted lanes
// reads the honest silence (null). The order is deterministic (count desc,
// then the lane's own byte asc: 'commune' < 'fuel').
export function budgetZeroRiders (spread) {
  if (!spread || typeof spread !== 'object') return null
  const byKind = spread.byKind
  if (!byKind || typeof byKind !== 'object' || Array.isArray(byKind)) return null
  const total = spread.zeros
  if (!Number.isFinite(total) || total <= 0) return null
  const lanes = Object.entries(byKind)
    .filter(([lane, n]) => typeof lane === 'string' && lane !== '' && Number.isFinite(n) && n > 0)
  if (lanes.length < 2) return null
  lanes.sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
  const [leader, leaderOwns] = lanes[0]
  const [runner, runnerOwns] = lanes[1]
  const pairOwns = leaderOwns + runnerOwns
  return { leader, leaderOwns, runner, runnerOwns, ofZeros: total, pairOwns, share: +(pairOwns / total).toFixed(3), duet: leaderOwns === runnerOwns }
}

// (v0.787.0) the lane riders' own row - THE ZERO'S OWN MIX: a measure of
// the shape, never a named owner (the seat's tie law holds); the pair
// prices the concentration the solo law refused to seat. Junk never prints
// a shape (the honest silence's own row law).
export function budgetZeroRidersRow (r) {
  if (!r || typeof r !== 'object') return null
  const { leader, leaderOwns, runner, runnerOwns, ofZeros, pairOwns, share } = r
  if (typeof leader !== 'string' || !leader || typeof runner !== 'string' || !runner ||
      !Number.isFinite(leaderOwns) || leaderOwns <= 0 || !Number.isFinite(runnerOwns) || runnerOwns <= 0 ||
      !Number.isFinite(ofZeros) || ofZeros <= 0 || !Number.isFinite(pairOwns) || pairOwns > ofZeros ||
      !Number.isFinite(share)) return null
  return `the budget zero's own lane riders (v0.787.0): no solo lane owns the majority - ${leader} x${leaderOwns} + ${runner} x${runnerOwns} own ${pairOwns} of ${ofZeros} zero-delivery budget(s) (${(share * 100).toFixed(1)}%) - THE ZERO'S OWN MIX: the seat's tie law held, the mix is the shape - the zeros' own spread prices the walks the solo law refused to name`
}
