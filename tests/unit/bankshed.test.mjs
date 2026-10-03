// (v0.558.0) THE WEIGHT SHED - the bank-budget gap's cure, pure. The
// measured face: fleet 37125612065 (the second all-green fleet) read
// 'bank budget gap: 680s needed, 300s budgeted - 380s short at 1.1u/s'
// - a whale pocket reached the endphase and the budgeted tail could not
// drain it. The plan prices the mid-run shed trip against the RUN clock
// (the deadline), the dusk-bank plan's twin (which prices against the
// vanilla tod, the sky); the night hold stays untouchable.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { shedPlan, SHED_SAFETY_MS, SHED_SLACK_MS } from '../../src/lib/bankshed.mjs'
import { DUSK_BANK_SAFETY_MS } from '../../src/lib/duskbank.mjs'

const NOW = 1_000_000

test('shedPlan: junk reads unknown (never guessed)', () => {
  assert.equal(shedPlan({}).why, 'unknown')
  assert.equal(shedPlan({ pocketUnits: NaN, rate: 1, remainingMs: 1000, budgetMs: 1000 }).why, 'unknown')
  assert.equal(shedPlan({ pocketUnits: 500, rate: NaN, remainingMs: 1000, budgetMs: 1000 }).why, 'unknown')
  // a measured rate of zero (or negative) cannot price a need
  assert.equal(shedPlan({ pocketUnits: 500, rate: 0, remainingMs: 1000, budgetMs: 1000 }).why, 'unknown')
  assert.equal(shedPlan({ pocketUnits: 500, rate: -1, remainingMs: 1000, budgetMs: 1000 }).why, 'unknown')
  assert.equal(shedPlan({ pocketUnits: 500, rate: Infinity, remainingMs: 1000, budgetMs: 1000 }).why, 'unknown')
  // the run clock is a measured input - junk never prices a trip
  assert.equal(shedPlan({ pocketUnits: 500, rate: 1, remainingMs: NaN, budgetMs: 1000 }).why, 'unknown')
  assert.equal(shedPlan({ pocketUnits: 500, rate: 1, remainingMs: -1, budgetMs: 1000 }).why, 'unknown')
  // the budget is config - zero is impossible (the end bank always has one)
  assert.equal(shedPlan({ pocketUnits: 500, rate: 1, remainingMs: 1000, budgetMs: 0 }).why, 'unknown')
  assert.equal(shedPlan({ pocketUnits: 500, rate: 1, remainingMs: 1000, budgetMs: NaN }).why, 'unknown')
  assert.equal(shedPlan({ pocketUnits: Infinity, rate: 1, remainingMs: 1000, budgetMs: 1000 }).why, 'unknown')
})

test('shedPlan: an active trip re-reads as holding (never double-booked)', () => {
  const r = shedPlan({ pocketUnits: 748, rate: 1.1, tripMs: 120000, remainingMs: 400000, budgetMs: 300000, now: NOW, tripUntil: NOW + 30000 })
  assert.equal(r.why, 'holding')
  assert.equal(r.go, false)
  assert.equal(r.remainingMs, 30000)
  // an expired trip re-prices honestly (the trip's own clock owns the exit)
  const r2 = shedPlan({ pocketUnits: 748, rate: 1.1, tripMs: 120000, remainingMs: 400000, budgetMs: 300000, now: NOW, tripUntil: NOW - 1 })
  assert.equal(r2.why, 'shed')
  // junk tripUntil is no trip at all
  const r3 = shedPlan({ pocketUnits: 748, rate: 1.1, tripMs: 120000, remainingMs: 400000, budgetMs: 300000, now: NOW, tripUntil: NaN })
  assert.equal(r3.why, 'shed')
})

test('shedPlan: a covered pocket reads light (the leanness law - silence is healthy)', () => {
  // no pocket, no shed
  assert.equal(shedPlan({ pocketUnits: 0, rate: 1.1, remainingMs: 400000, budgetMs: 300000 }).why, 'light')
  assert.equal(shedPlan({ pocketUnits: -5, rate: 1.1, remainingMs: 400000, budgetMs: 300000 }).why, 'light')
  // 200u at 1.1u/s = 182s need, the 300s budget covers it
  const r = shedPlan({ pocketUnits: 200, rate: 1.1, remainingMs: 400000, budgetMs: 300000 })
  assert.equal(r.why, 'light')
  assert.equal(r.needS, 182)
  // the <= law parity with bankBudgetGapRow: need == budget is still light
  // (330u at 1.1u/s = 300s exactly)
  assert.equal(shedPlan({ pocketUnits: 330, rate: 1.1, remainingMs: 400000, budgetMs: 300000 }).why, 'light')
})

test('shedPlan: THE MEASURED FACE - the whale pocket sheds (fleet 37125612065)', () => {
  // 748u at 1.1u/s = 680s need vs the 300s budget - the field's own
  // '380s short'; the run clock still covers a 120s trip with margins
  const r = shedPlan({ pocketUnits: 748, rate: 1.1, tripMs: 120000, remainingMs: 400000, budgetMs: 300000, now: NOW })
  assert.equal(r.go, true)
  assert.equal(r.why, 'shed')
  assert.equal(r.needS, 680)
  assert.equal(r.gapS, 380)
  // priced until now + trip + safety (the walk's variance eats the margin)
  assert.equal(r.untilMs, NOW + 120000 + SHED_SAFETY_MS)
})

test('shedPlan: the fit boundary - trip + safety + slack against the run clock', () => {
  const p = { pocketUnits: 748, rate: 1.1, tripMs: 120000, budgetMs: 300000, now: NOW }
  // 120 + 15 + 30 = 165s: the exact fit sheds
  assert.equal(shedPlan({ ...p, remainingMs: 165000 }).why, 'shed')
  // one ms short reads late (the boundary exclusive)
  const r = shedPlan({ ...p, remainingMs: 164999 })
  assert.equal(r.why, 'late')
  assert.equal(r.go, false)
  assert.equal(r.remainingMs, 164999)
  assert.equal(r.needS, 680)
  // an unmeasured trip is never priced (junk tripMs reads late, not go)
  assert.equal(shedPlan({ ...p, tripMs: NaN, remainingMs: 400000 }).why, 'late')
  assert.equal(shedPlan({ ...p, tripMs: -1, remainingMs: 400000 }).why, 'late')
})

test('shedPlan: the floor law - the pocket floors before the need prices', () => {
  // 748.9u floors to 748 -> ceil(748/1.1) = 680 (the same floor the gap
  // row speaks - the two faces must never disagree about the arithmetic)
  const r = shedPlan({ pocketUnits: 748.9, rate: 1.1, tripMs: 120000, remainingMs: 400000, budgetMs: 300000, now: NOW })
  assert.equal(r.needS, 680)
  assert.equal(r.gapS, 380)
})

test('shedPlan: constants - the safety parity and the slack floor', () => {
  // the same walk physics as the dusk plan: one margin, one shape
  assert.equal(SHED_SAFETY_MS, DUSK_BANK_SAFETY_MS)
  assert.equal(SHED_SAFETY_MS, 15000)
  assert.equal(SHED_SLACK_MS, 30000)
})

// (v0.561.0) THE SHED PRICER - the wiring's tripMs, priced purely. The
// composite at the measured shape (30 blocks out, 20 levels up) must land
// inside the delivered band (fleet 36286821015: 156-184s at the arm).
import { shedTripMs, SHED_CHAIN_OVERHEAD_MS } from '../../src/lib/bankshed.mjs'
import { walkBudgetMs, WALK_BASE_MS } from '../../src/lib/tripplan.mjs'
import { DEEP_CLIMB_MS_PER_LEVEL } from '../../src/lib/endphase.mjs'

test('shedTripMs: the composite arithmetic - out+back walk, climb, chain', () => {
  // 30 blocks: walkBudgetMs(30) = 30*250+5000 = 12500 -> the 14s base floor
  const trip = shedTripMs({ dist: 30, climbLevels: 20 })
  assert.equal(trip, 2 * WALK_BASE_MS + 20 * DEEP_CLIMB_MS_PER_LEVEL + SHED_CHAIN_OVERHEAD_MS)
  assert.equal(trip, 28000 + 84000 + 60000)
})

test('shedTripMs: THE MEASURED BAND - the composite at the field shape lands mid-band', () => {
  const trip = shedTripMs({ dist: 30, climbLevels: 20 })
  const s = trip / 1000
  assert.ok(s >= 156 && s <= 184, `the priced trip ${s}s must sit inside the measured 156-184s band`)
  assert.equal(s, 172)
})

test('shedTripMs: junk floors - no distance, no climb, no lie', () => {
  // a surface bot at the yard: the walk floor x2 + the chain
  assert.equal(shedTripMs({}), 2 * walkBudgetMs({ dist: 0 }) + SHED_CHAIN_OVERHEAD_MS)
  // junk inputs floor to 0 - the trip is never below the walk floor x2 + chain
  assert.equal(shedTripMs({ dist: NaN, climbLevels: -5 }), 2 * walkBudgetMs({ dist: 0 }) + SHED_CHAIN_OVERHEAD_MS)
  assert.equal(shedTripMs({ dist: Infinity }), 2 * walkBudgetMs({ dist: 0 }) + SHED_CHAIN_OVERHEAD_MS)
})

test('shedTripMs: a far yard rides the walk cap (the OOM lesson holds)', () => {
  // 128 blocks: the walk leg caps at 32000 - the return prices the same yard
  const trip = shedTripMs({ dist: 128, climbLevels: 0 })
  assert.equal(trip, 2 * 32000 + SHED_CHAIN_OVERHEAD_MS)
})

test('THE COMPOSITION PIN - shedPlan fed by shedTripMs arms the whale at the field shape', () => {
  const trip = shedTripMs({ dist: 30, climbLevels: 20 }) // 172s, the measured shape
  const r = shedPlan({ pocketUnits: 748, rate: 1.1, tripMs: trip, remainingMs: 300000, budgetMs: 248000, now: NOW })
  assert.equal(r.go, true)
  assert.equal(r.why, 'shed')
  assert.equal(r.needS, 680)
  assert.equal(r.gapS, 680 - 248)
  assert.equal(r.untilMs, NOW + trip + SHED_SAFETY_MS)
  // the same whale with NO run clock to spare reads late (the fit holds)
  const late = shedPlan({ pocketUnits: 748, rate: 1.1, tripMs: trip, remainingMs: trip + SHED_SAFETY_MS + SHED_SLACK_MS - 1, budgetMs: 248000, now: NOW })
  assert.equal(late.why, 'late')
})

// (v0.564.0) THE SHED GATE - the gap-driven sibling of bankTripDue. The
// legacy trigger's flat 240s fence refused fitting trips and gave a doomed
// whale the same 1-2 checks a light pocket gets (fleet 37134090209: F6's
// 277u whale rode a timeout strand, the decode read 11.7%).
import { shedTripDue, SHED_RETRY_MS } from '../../src/lib/bankshed.mjs'
import { BANK_TRIP_EVERY_MS } from '../../src/lib/deposit.mjs'

const FIELD = { pocketUnits: 748, rate: 1.1, dist: 30, climbLevels: 20, budgetMs: 248000, now: NOW }
// the field-shape trip prices 172s; the fit needs 172+15+30 = 217s

test('shedTripDue: junk reads not-due (never decides on garbage)', () => {
  assert.equal(shedTripDue({}).due, false)
  assert.equal(shedTripDue({ ...FIELD, remainingMs: NaN }).why, 'unknown')
  assert.equal(shedTripDue({ ...FIELD, rate: 0 }).why, 'unknown')
  assert.equal(shedTripDue({ ...FIELD, budgetMs: 0 }).why, 'unknown')
})

test('shedTripDue: a covered pocket never sheds (the leanness law rides)', () => {
  // 200u at 1.1 = 182s need < the 248s budget - the end bank covers it
  const r = shedTripDue({ ...FIELD, pocketUnits: 200, remainingMs: 400000 })
  assert.equal(r.due, false)
  assert.equal(r.why, 'light')
  assert.equal(r.needS, 182)
})

test('shedTripDue: THE WIDENED WINDOW - the field-shape whale sheds at 220s remaining', () => {
  // the legacy fence (240s flat) refuses here; the priced fit (217s) arms
  const r = shedTripDue({ ...FIELD, remainingMs: 220000, msSinceBank: 150000 })
  assert.equal(r.due, true)
  assert.equal(r.why, 'shed')
  assert.equal(r.tripMs, 172000)
  assert.equal(r.needS, 680)
  assert.equal(r.gapS, 680 - 248)
  assert.equal(r.untilMs, NOW + 172000 + SHED_SAFETY_MS)
})

test('shedTripDue: the priced fit holds at the boundary (one ms short reads late)', () => {
  assert.equal(shedTripDue({ ...FIELD, remainingMs: 217000, msSinceBank: 150000 }).due, true)
  const r = shedTripDue({ ...FIELD, remainingMs: 216999, msSinceBank: 150000 })
  assert.equal(r.due, false)
  assert.equal(r.why, 'late')
})

test('shedTripDue: the refractory - the churn law is a family law', () => {
  // 149999ms since the last attempt: silent (the legacy silencer's clock)
  const r = shedTripDue({ ...FIELD, remainingMs: 300000, msSinceBank: SHED_RETRY_MS - 1 })
  assert.equal(r.due, false)
  assert.equal(r.why, 'refractory')
  assert.equal(r.tripMs, 172000) // the pricing rides even a refusal (the wiring logs it)
  // at the cadence the shed speaks
  assert.equal(shedTripDue({ ...FIELD, remainingMs: 300000, msSinceBank: SHED_RETRY_MS }).due, true)
  // junk since reads 0 - never arms (the family junk law)
  assert.equal(shedTripDue({ ...FIELD, remainingMs: 300000, msSinceBank: NaN }).why, 'refractory')
})

test('shedTripDue: an active trip re-reads holding (never double-booked)', () => {
  const r = shedTripDue({ ...FIELD, remainingMs: 300000, msSinceBank: 150000, tripUntil: NOW + 30000 })
  assert.equal(r.due, false)
  assert.equal(r.why, 'holding')
})

test('shedTripDue: constants - the cadence parity', () => {
  assert.equal(SHED_RETRY_MS, BANK_TRIP_EVERY_MS)
  assert.equal(SHED_RETRY_MS, 150000)
})

// (v0.566.0) THE SHED CONSULT SEAT - the whale cure's fourth leg, wired. The
// plan (v0.558.0), the pricer (v0.561.0) and the gate (v0.564.0) were pure;
// the seat (testbed/fleet19.mjs) consults shedTripDue as the arming ladder's
// LAST rung - the legacy family keeps its pass byte for byte, the shed only
// spends a pass they all declined.
import { readFileSync } from 'node:fs'

const FLEET_SRC = readFileSync(new URL('../../testbed/fleet19.mjs', import.meta.url), 'utf8')

test('THE CONSULT SEAT PIN - the shed joins the arming ladder as the last rung', () => {
  assert.match(FLEET_SRC, /import \{ shedTripDue \} from '\.\.\/src\/lib\/bankshed\.mjs'/,
    'the fleet imports the gate from bankshed.mjs (no re-export, no wrapper)')
  // the carry-clock twin: the plan owns the exit clock, the wiring carries it
  assert.match(FLEET_SRC, /let shedTripUntil = 0/,
    "the carry-clock is declared (duskTripUntil's twin)")
  assert.match(FLEET_SRC, /if \(shedArm\.due\) \{\s*shedTripUntil = shedArm\.untilMs/,
    "the arm's untilMs rides the carry (the failed arm waits it out, no re-arm storm)")
  // the seat: ONE consult, the ladder's last rung (the legacy family keeps priority)
  const consults = FLEET_SRC.match(/shedTripDue\(\{/g) || []
  assert.equal(consults.length, 1, 'exactly one consult - the seat, not a storm')
  const seat = FLEET_SRC.match(/const shedArm = \(\(\) => \{[\s\S]*?\}\)\(\)/)
  assert.ok(seat, 'the seat IIFE exists')
  assert.match(seat[0], /!tripPlanned && !bankDusk && !duskPlan\.go && !deliverableArm\.go && !!load/,
    'the shed only spends a pass the legacy family ALL declined (the ladder keeps its order)')
  // the inputs, each named (the wiring contract's own list)
  assert.match(seat[0], /pocketUnits: ownPk\.bankable/,
    'the BANKABLE sum prices the need (the KEEP kit can never ride, the v0.390.0 law)')
  assert.match(seat[0], /rate: flow\.rate/,
    'the MEASURED flow prices the pace (never a guess, the dead-flow law)')
  assert.match(seat[0], /dist: bankYardDist/, "the seat's own dist rides")
  assert.match(seat[0], /climbLevels: bankYardDy/, "the seat's own climb rides (the priced vertical)")
  assert.match(seat[0], /remainingMs: bankRemainingMs/,
    "the fence's own contract: the clock left BEFORE the pre-position owns the goal")
  assert.match(seat[0], /budgetMs: finalBankBudgetMs\(/,
    'the granted read is the SAME arithmetic the deliverable arm makes (one arithmetic)')
  assert.match(seat[0], /tripUntil: shedTripUntil/, "the wiring's carry-clock feeds the holding gate")
  assert.match(seat[0], /msSinceBank: Date\.now\(\) - lastBankAt/,
    'one clock, both families (the refusal branch already advances lastBankAt)')
})

test('THE CONSULT SEAT PIN - the ladder, the viability and the label read the shed', () => {
  assert.match(FLEET_SRC, /\|\| deliverableArm\.go \|\| shedArm\.due\)/,
    'bankWanted reads the shed (the last trigger)')
  assert.match(FLEET_SRC, /const bankViable = !bankNightHold && \(tripPlanned \|\| bankDusk \|\| duskPlan\.go \|\| shedArm\.due \|\| needsBankingTripViable/,
    'bankViable reads the shed BESIDE the night hold - the hold owns the sky first (the v0.140.1 doctrine stands)')
  assert.match(FLEET_SRC, /: deliverableArm\.go \? 'deliverable' : shedArm\.due \? 'shed' : 'dusk-plan'/,
    "the arm names itself ('shed' - the 7th label on the 'bank ' filter key)")
  assert.match(FLEET_SRC, /bank trip: shed - the pocket needs /,
    "the cause line names the gap it is curing (the gate's own contract)")
})
