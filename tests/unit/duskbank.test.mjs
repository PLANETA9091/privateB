// (v0.226.0) THE DUSK-BANK PLAN - the night-hold delivery gap's pricing.
// The measured face: run67 deferred 16 of 18 final banks AT the dusk
// threshold (tod=12438..12575, pocket 2111u riding the dark) - the plan
// prices the bounded trip BEFORE the hold owns the sky, and never competes
// with the hold itself.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  duskBankPlan,
  TICK_MS,
  DUSK_BANK_START_TICKS,
  DUSK_BANK_NIGHT_TICKS,
  DUSK_BANK_MIN_UNITS,
  DUSK_BANK_SAFETY_MS,
  DUSK_BANK_EARLY_MS
} from '../../src/lib/duskbank.mjs'

const NOW = 1_000_000

test('duskBankPlan: junk reads unknown (never guessed)', () => {
  assert.equal(duskBankPlan({}).why, 'unknown')
  assert.equal(duskBankPlan({ tod: NaN, pocketUnits: 100 }).why, 'unknown')
  assert.equal(duskBankPlan({ tod: 11000, pocketUnits: NaN }).why, 'unknown')
  // the vanilla tod domain is 0..23999 - 24000 wraps, -1 is junk
  assert.equal(duskBankPlan({ tod: 24000, pocketUnits: 500, bankTripMs: 1000 }).why, 'unknown')
  assert.equal(duskBankPlan({ tod: -1, pocketUnits: 500, bankTripMs: 1000 }).why, 'unknown')
  assert.equal(duskBankPlan({ tod: 11000, pocketUnits: Infinity }).why, 'unknown')
})

test('duskBankPlan: an active trip re-reads as holding (never double-booked)', () => {
  const r = duskBankPlan({ tod: 11000, pocketUnits: 500, bankTripMs: 10000, now: NOW, tripUntil: NOW + 30000 })
  assert.equal(r.why, 'holding')
  assert.equal(r.go, false)
  assert.equal(r.remainingMs, 30000)
  // an expired trip re-reads honestly (the trip's own clock owns the exit)
  assert.equal(duskBankPlan({ tod: 11000, pocketUnits: 500, bankTripMs: 10000, now: NOW, tripUntil: NOW - 1 }).why, 'dusk')
})

test('duskBankPlan: a light pocket rides the night (no-pocket)', () => {
  assert.equal(duskBankPlan({ tod: 11000, pocketUnits: DUSK_BANK_MIN_UNITS - 1 }).why, 'no-pocket')
  assert.equal(duskBankPlan({ tod: 11000, pocketUnits: 0 }).why, 'no-pocket')
})

test('duskBankPlan: the hold owns the sky (night, the measured face)', () => {
  // the threshold inclusive: never a trip AT the sky line
  assert.equal(duskBankPlan({ tod: DUSK_BANK_NIGHT_TICKS, pocketUnits: 5000, bankTripMs: 1 }).why, 'night')
  // the run67 forensic: the actual deferrals read night (tod=12438/12575)
  assert.equal(duskBankPlan({ tod: 12438, pocketUnits: 2111, bankTripMs: 10000 }).why, 'night')
  assert.equal(duskBankPlan({ tod: 12575, pocketUnits: 2111, bankTripMs: 10000 }).why, 'night')
  // the deep dark too
  assert.equal(duskBankPlan({ tod: 23999, pocketUnits: 5000, bankTripMs: 1 }).why, 'night')
})

test('duskBankPlan: the bright hours stay the regular cadence (daylight)', () => {
  assert.equal(duskBankPlan({ tod: 0, pocketUnits: 5000, bankTripMs: 1000 }).why, 'daylight')
  // the boundary exclusive: 10799 still reads the cadence
  assert.equal(duskBankPlan({ tod: DUSK_BANK_START_TICKS - 1, pocketUnits: 5000, bankTripMs: 1000 }).why, 'daylight')
})

test('duskBankPlan: the window open prices a fitting trip (go)', () => {
  const r = duskBankPlan({ tod: DUSK_BANK_START_TICKS, pocketUnits: 500, bankTripMs: 40000, now: NOW })
  assert.equal(r.why, 'dusk')
  assert.equal(r.go, true)
  // the daylight budget at the open: (12400-10800)*50 = 80000ms
  assert.equal(r.remainingMs, 80000)
  // the trip prices until trip + safety, never beyond
  assert.equal(r.untilMs, NOW + 40000 + DUSK_BANK_SAFETY_MS)
})

test('duskBankPlan: the safe edge is inclusive (equality lands SAFETY clear)', () => {
  const r = duskBankPlan({ tod: DUSK_BANK_START_TICKS, pocketUnits: 500, bankTripMs: 80000 - DUSK_BANK_SAFETY_MS, now: NOW })
  assert.equal(r.why, 'dusk')
  // one ms over the edge refuses
  const r2 = duskBankPlan({ tod: DUSK_BANK_START_TICKS, pocketUnits: 500, bankTripMs: 80000 - DUSK_BANK_SAFETY_MS + 1, now: NOW })
  assert.equal(r2.why, 'no-time')
  assert.equal(r2.remainingMs, 80000)
})

test('duskBankPlan: an overrunning trip refuses honestly (no-time)', () => {
  const r = duskBankPlan({ tod: 12000, pocketUnits: 2111, bankTripMs: 60000, now: NOW })
  assert.equal(r.why, 'no-time')
  assert.equal(r.go, false)
  assert.equal(r.remainingMs, 20000)
})

test('duskBankPlan: an unmeasured trip never prices (no-time, junk tripMs)', () => {
  assert.equal(duskBankPlan({ tod: 11000, pocketUnits: 2111 }).why, 'no-time')
  assert.equal(duskBankPlan({ tod: 11000, pocketUnits: 2111, bankTripMs: NaN }).why, 'no-time')
  assert.equal(duskBankPlan({ tod: 11000, pocketUnits: 2111, bankTripMs: -5 }).why, 'no-time')
})

test('duskBankPlan: the zero-trip edge (a bank on the doorstep still pays its margin)', () => {
  const r = duskBankPlan({ tod: 12300, pocketUnits: 2111, bankTripMs: 0, now: NOW })
  // remaining (12400-12300)*50 = 5000ms < the 15000 safety - the margin
  // owns the refusal even for a doorstep bank
  assert.equal(r.why, 'no-time')
  assert.equal(r.remainingMs, 5000)
})

test('duskBankPlan: the constants shape (the wiring lane pins these)', () => {
  assert.equal(TICK_MS, 50)
  assert.equal(DUSK_BANK_START_TICKS, 10800)
  assert.equal(DUSK_BANK_NIGHT_TICKS, 12400)
  assert.equal(DUSK_BANK_MIN_UNITS, 256)
  assert.equal(DUSK_BANK_SAFETY_MS, 15000)
  // the invariant the safety law needs: the window open outlives the margin
  assert.ok((DUSK_BANK_NIGHT_TICKS - DUSK_BANK_START_TICKS) * TICK_MS > DUSK_BANK_SAFETY_MS)
})

// ---------------------------------------------- v0.233.0 THE TRIP-FIT WINDOW
test('duskBankPlan: a trip that fits the fixed window keeps the fixed window byte for byte (the bright-hours bound never loosens)', () => {
  // a 65s trip (the fixed window's max priceable: 80s - 15s safety) arms at
  // exactly the fixed start - the v0.226 face unchanged
  const r = duskBankPlan({ tod: DUSK_BANK_START_TICKS - 1, pocketUnits: 500, bankTripMs: 80000 - DUSK_BANK_SAFETY_MS, now: NOW })
  assert.equal(r.why, 'daylight', 'one tick before the fixed start the cadence still owns the goal (the fitting trip never opens early)')
  const r2 = duskBankPlan({ tod: DUSK_BANK_START_TICKS, pocketUnits: 500, bankTripMs: 80000 - DUSK_BANK_SAFETY_MS, now: NOW })
  assert.equal(r2.why, 'dusk')
  assert.equal(r2.remainingMs, 80000)
})

test('duskBankPlan: a LONGER trip opens its window at the last-fit moment minus the consult-cadence margin (the 36286821015 face - the 156-184s chains could never arm)', () => {
  // a 300s measured trip (the field's arm-budget shape): last-fit = night -
  // (300s + 15s)/50ms = 12400 - 6300 = 6100; minus the 60s cadence margin
  // (1200 ticks) the window opens at 4900
  const tripMs = 300000
  const expectOpen = DUSK_BANK_NIGHT_TICKS -
    Math.ceil((tripMs + DUSK_BANK_SAFETY_MS) / TICK_MS) -
    Math.ceil(DUSK_BANK_EARLY_MS / TICK_MS)
  assert.equal(expectOpen, 4900, 'the arithmetic the field face demands (last-fit 6100 - 1200 cadence ticks)')
  assert.equal(duskBankPlan({ tod: expectOpen - 1, pocketUnits: 500, bankTripMs: tripMs, now: NOW }).why, 'daylight', 'before the trip-relative open the cadence owns the goal')
  const r = duskBankPlan({ tod: expectOpen, pocketUnits: 500, bankTripMs: tripMs, now: NOW })
  assert.equal(r.why, 'dusk')
  assert.equal(r.go, true)
  // the fit test stays the gate: remaining at the open covers trip + safety
  assert.equal(r.remainingMs, (DUSK_BANK_NIGHT_TICKS - expectOpen) * TICK_MS)
  assert.ok(r.remainingMs >= tripMs + DUSK_BANK_SAFETY_MS, 'the arm lands SAFETY clear of the hold threshold')
  // and the LANDING arithmetic: the trip ends (tripMs of ticks later) still
  // inside the daylight - the plan never walks a bot into the hold's sky
  const landingTod = expectOpen + Math.ceil(tripMs / TICK_MS)
  assert.ok(landingTod <= DUSK_BANK_NIGHT_TICKS - DUSK_BANK_SAFETY_MS / TICK_MS,
    'the delivery lands SAFETY clear of the threshold (the whole point of the plan)')
})

test('duskBankPlan: the fit test still refuses inside the trip-relative window (the arm is not a free pass)', () => {
  // the same 300s trip one cadence-gap later: the pass missed the window's
  // early reach, the remaining daylight no longer covers trip + safety
  const tripMs = 300000
  const late = DUSK_BANK_NIGHT_TICKS - Math.ceil((tripMs + DUSK_BANK_SAFETY_MS) / TICK_MS) + 1 // past the last fit
  const r = duskBankPlan({ tod: late, pocketUnits: 500, bankTripMs: tripMs, now: NOW })
  assert.equal(r.why, 'no-time', 'inside the window but the trip can no longer land SAFETY clear - the honest refusal owns it')
  assert.equal(r.go, false)
})

test('duskBankPlan: a trip the whole day cannot cover refuses at every tod (the honest edge)', () => {
  // a 500s measured trip: even from dawn the daylight is 620s - the trip
  // plus the safety just barely fits from the trip-relative window... a
  // 700s trip never fits anything and reads no-time wherever asked
  const tripMs = 700000
  assert.equal(duskBankPlan({ tod: 0, pocketUnits: 500, bankTripMs: tripMs, now: NOW }).why, 'no-time')
  assert.equal(duskBankPlan({ tod: 6000, pocketUnits: 500, bankTripMs: tripMs, now: NOW }).why, 'no-time')
  assert.equal(duskBankPlan({ tod: 11000, pocketUnits: 500, bankTripMs: tripMs, now: NOW }).why, 'no-time')
})

test('duskBankPlan: junk tripMs keeps the fixed window shape (an unmeasured trip never widens anything)', () => {
  // NaN trip: the window stays the fixed start; inside it the fit refuses
  assert.equal(duskBankPlan({ tod: DUSK_BANK_START_TICKS - 1, pocketUnits: 500, bankTripMs: NaN, now: NOW }).why, 'daylight')
  assert.equal(duskBankPlan({ tod: DUSK_BANK_START_TICKS, pocketUnits: 500, bankTripMs: NaN, now: NOW }).why, 'no-time')
})

test('duskBankPlan: the constants shape grows the cadence margin (the wiring lane pins these)', () => {
  assert.equal(TICK_MS, 50)
  assert.equal(DUSK_BANK_START_TICKS, 10800)
  assert.equal(DUSK_BANK_NIGHT_TICKS, 12400)
  assert.equal(DUSK_BANK_MIN_UNITS, 256)
  assert.equal(DUSK_BANK_SAFETY_MS, 15000)
  assert.equal(DUSK_BANK_EARLY_MS, 60000, 'one shaft-cadence of consult tolerance - the pass must be able to CATCH the window')
})
