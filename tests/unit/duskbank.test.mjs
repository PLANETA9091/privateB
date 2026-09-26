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
  DUSK_BANK_SAFETY_MS
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
