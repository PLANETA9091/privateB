// Deep climb persistence (v0.18.0) - the stage ladder across climbOut calls.
// Pure ledger maths, no bot, no server.
//
// Measured background (fleet 2026-09-20 17:05 + verification run, master
// v0.17.0): from the y=42 aquifer floor a climbOut meets MULTIPLE wet bands
// (~20 levels to the surface). One call opens at most 2 galleries and eats 4
// fails, so deep bots ended 'climb out: failed - stalled' REPEATEDLY - every
// call started fresh in the same wet mess and the fleet loop hammered
// climbOut on every bank/trip decision. These tests pin the policy:
// persistence escalates a stuck ladder, movement heals it, and an exhausted
// ladder refuses cheaply instead of burning the run.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  climbEntry, climbLedgerUpdate, climbStarted,
  CLIMB_STAGE_BUDGETS, CLIMB_EXHAUSTED_STAGE, CLIMB_EXHAUST_COOLDOWN_MS, CLIMB_RESCUE_MIN_GAIN,
  PILLAR_FAIL_LIMIT, TRAVERSE_MAX_ATTEMPTS
} from '../../src/lib/surface.mjs'

const T0 = 1_000_000 // fixed epoch: deterministic clock, no Date.now in policy maths

// ---------------------------------------------------------------- the ladder

test('ladder shape: strictly growing budgets, rotateBy = stage, exhausted sentinel excluded', () => {
  assert.equal(CLIMB_STAGE_BUDGETS.length, CLIMB_EXHAUSTED_STAGE)
  for (let s = 0; s < CLIMB_STAGE_BUDGETS.length; s++) {
    const b = CLIMB_STAGE_BUDGETS[s]
    assert.equal(b.rotateBy, s, `rotateBy of stage ${s}`)
    if (s > 0) {
      assert.ok(b.failLimit > CLIMB_STAGE_BUDGETS[s - 1].failLimit, `fails grow at stage ${s}`)
      assert.ok(b.wetAttempts > CLIMB_STAGE_BUDGETS[s - 1].wetAttempts, `galleries grow at stage ${s}`)
    }
  }
  // stage 0 IS the old one-call behaviour - the default must not regress
  assert.equal(CLIMB_STAGE_BUDGETS[0].failLimit, PILLAR_FAIL_LIMIT)
  assert.equal(CLIMB_STAGE_BUDGETS[0].wetAttempts, TRAVERSE_MAX_ATTEMPTS)
})

// ------------------------------------------------------------------- entry

test('entry: fresh bot (no ledger) climbs at stage 0 budgets', () => {
  const e = climbEntry(null, { now: T0, feetY: 42 })
  assert.equal(e.refused, false)
  assert.equal(e.stage, 0)
  assert.equal(e.failLimit, CLIMB_STAGE_BUDGETS[0].failLimit)
  assert.equal(e.wetAttempts, CLIMB_STAGE_BUDGETS[0].wetAttempts)
  assert.equal(e.rotateBy, 0)
})

test('entry: junk ledgers (non-object, missing fields) behave as fresh', () => {
  for (const junk of [undefined, null, 'stage', 42, {}]) {
    const e = climbEntry(junk, { now: T0, feetY: 42 })
    assert.equal(e.refused, false, String(junk))
    assert.equal(e.stage, 0, String(junk))
  }
})

test('entry: an escalated ledger grants its stage budgets', () => {
  for (let s = 1; s < CLIMB_EXHAUSTED_STAGE; s++) {
    const e = climbEntry({ stage: s, feetY: 50, at: T0 - 1000 }, { now: T0, feetY: 50 })
    assert.equal(e.refused, false, `stage ${s}`)
    assert.equal(e.stage, s, `stage ${s}`)
    assert.equal(e.failLimit, CLIMB_STAGE_BUDGETS[s].failLimit, `stage ${s}`)
    assert.equal(e.rotateBy, s, `stage ${s} starts on a rotated bearing`)
  }
})

test('entry: exhausted + cooldown running -> refused with the remaining wait, stage untouched', () => {
  const led = { stage: CLIMB_EXHAUSTED_STAGE, feetY: 42, at: T0 }
  const e = climbEntry(led, { now: T0 + 30_000, feetY: 42 })
  assert.equal(e.refused, true)
  assert.equal(e.waitMs, CLIMB_EXHAUST_COOLDOWN_MS - 30_000)
})

test('entry: exhausted + cooldown served -> ONE escalated retry (stage 1), not the full ladder', () => {
  const led = { stage: CLIMB_EXHAUSTED_STAGE, feetY: 42, at: T0 }
  const e = climbEntry(led, { now: T0 + CLIMB_EXHAUST_COOLDOWN_MS, feetY: 42 })
  assert.equal(e.refused, false)
  assert.equal(e.stage, 1)
  assert.equal(e.failLimit, CLIMB_STAGE_BUDGETS[1].failLimit)
  assert.equal(e.rotateBy, 1)
})

test('entry: exhausted but LIFTED from outside -> stage 0 even mid-cooldown', () => {
  const led = { stage: CLIMB_EXHAUSTED_STAGE, feetY: 42, at: T0 }
  const e = climbEntry(led, { now: T0 + 1000, feetY: 42 + CLIMB_RESCUE_MIN_GAIN })
  assert.equal(e.refused, false)
  assert.equal(e.stage, 0)
  assert.equal(e.rotateBy, 0)
})

test('entry: the rescue lift threshold is exactly CLIMB_RESCUE_MIN_GAIN', () => {
  const led = { stage: CLIMB_EXHAUSTED_STAGE, feetY: 42, at: T0 }
  const below = climbEntry(led, { now: T0 + 1000, feetY: 42 + CLIMB_RESCUE_MIN_GAIN - 1 })
  assert.equal(below.refused, true) // +1 level is climb jitter, not a rescue
  const at = climbEntry(led, { now: T0 + 1000, feetY: 42 + CLIMB_RESCUE_MIN_GAIN })
  assert.equal(at.refused, false)
})

test('entry: falling since the last call does NOT heal exhaustion', () => {
  const led = { stage: CLIMB_EXHAUSTED_STAGE, feetY: 42, at: T0 }
  const e = climbEntry(led, { now: T0 + 1000, feetY: 30 })
  assert.equal(e.refused, true)
})

test('entry: unknown current feetY + exhausted -> still refused (no proof of a lift)', () => {
  const led = { stage: CLIMB_EXHAUSTED_STAGE, feetY: 42, at: T0 }
  const e = climbEntry(led, { now: T0 + 1000, feetY: null })
  assert.equal(e.refused, true)
})

// ------------------------------------------------------------------ update

test('update: a fresh bot starts a stage-0 ledger', () => {
  const led = climbLedgerUpdate(null, { ok: false, gained: 0, traversed: 0, feetY: 42, now: T0 })
  assert.equal(led.stage, 1) // one dead call already: escalate
  assert.equal(led.feetY, 42)
  assert.equal(led.at, T0)
})

test('update: ok or levels gained heal the ladder to stage 0', () => {
  for (const outcome of [
    { ok: true, gained: 0, traversed: 0, feetY: 62 },
    { ok: false, gained: 5, traversed: 12, feetY: 47 }, // levels beat lateral work
    { ok: false, gained: 1, traversed: 0, feetY: 43 }
  ]) {
    const led = climbLedgerUpdate({ stage: 2, feetY: 42, at: T0 - 5000 }, { ...outcome, now: T0 })
    assert.equal(led.stage, 0, JSON.stringify(outcome))
    assert.equal(led.feetY, outcome.feetY)
    assert.equal(led.at, T0)
  }
})

test('update: an external lift of CLIMB_RESCUE_MIN_GAIN+ heals even a failed call', () => {
  // rescue won between the calls: end feetY far above the ledger's last feetY
  const led = climbLedgerUpdate({ stage: 2, feetY: 42, at: T0 - 5000 }, { ok: false, gained: 0, traversed: 0, feetY: 42 + CLIMB_RESCUE_MIN_GAIN, now: T0 })
  assert.equal(led.stage, 0)
})

test('update: a dead stall escalates by one, topping out at EXHAUSTED', () => {
  let led = { stage: 0, feetY: 42, at: T0 }
  for (let expected = 1; expected <= CLIMB_EXHAUSTED_STAGE; expected++) {
    led = climbLedgerUpdate(led, { ok: false, gained: 0, traversed: 0, feetY: 42, now: T0 + expected })
    assert.equal(led.stage, expected)
  }
  assert.equal(led.stage, CLIMB_EXHAUSTED_STAGE)
})

test('update: lateral-only escape work escalates but NEVER declares the bot hopeless', () => {
  let led = { stage: 0, feetY: 42, at: T0 }
  for (let i = 0; i < 50; i++) { // hammer lateral-only failures far past the ladder top
    led = climbLedgerUpdate(led, { ok: false, gained: 0, traversed: 7, feetY: 42, now: T0 + i })
  }
  assert.equal(led.stage, CLIMB_EXHAUSTED_STAGE - 1)
})

test('update: a post-cooldown exhausted retry that stalls again lands back at EXHAUSTED with a fresh clock', () => {
  // cooldown served -> stage 1 retry -> dead stall: back to exhausted, at=now
  const led = climbLedgerUpdate({ stage: 1, feetY: 42, at: T0 }, { ok: false, gained: 0, traversed: 0, feetY: 42, now: T0 + CLIMB_EXHAUST_COOLDOWN_MS })
  assert.equal(led.stage, 2)
  assert.equal(led.at, T0 + CLIMB_EXHAUST_COOLDOWN_MS)
})

test('update: junk outcomes degrade to a dead stall, feetY falls back to the ledger', () => {
  const led = climbLedgerUpdate({ stage: 0, feetY: 42, at: T0 - 1 }, { ok: false, gained: NaN, traversed: undefined, feetY: null, now: T0 })
  assert.equal(led.stage, 1)
  assert.equal(led.feetY, 42) // keep the last honest position for the lift check
})

test('update: junk ledgers start from stage 0', () => {
  for (const junk of [undefined, null, 'x', 7]) {
    const led = climbLedgerUpdate(junk, { ok: false, gained: 0, traversed: 0, feetY: 42, now: T0 })
    assert.equal(led.stage, 1, String(junk))
  }
})

// -------------------------------------------------- the hammered-wall cycle

test('contract: refusals never touch the ledger - a hammered exhausted bot cools down', () => {
  // THE v0.17.x bug in ledger form: a refusal that updated the ledger would
  // bump `at` on every hammer tick and the cooldown would never elapse.
  let led = { stage: CLIMB_EXHAUSTED_STAGE, feetY: 42, at: T0 }
  for (let t = 0; t < 200; t++) {
    const e = climbEntry(led, { now: T0 + t * 500, feetY: 42 })
    if (e.refused) continue // the caller must NOT call climbLedgerUpdate here
    // cooldown served: the retry stalls again -> fresh exhaustion clock
    led = climbLedgerUpdate(led, { ok: false, gained: 0, traversed: 0, feetY: 42, now: T0 + t * 500 })
  }
  // the duty cycle: refusals dominate, real attempts happen at most every cooldown
  assert.equal(led.stage, CLIMB_EXHAUSTED_STAGE)
})

test('contract: the deep-climb campaign - lateral stages then a healed exit', () => {
  // the y=42 story: stage 0 stalls -> stage 1 walks a gallery -> stage 2
  // campaign crosses the band -> a level gained -> healed, fresh budgets
  let led = null
  led = climbLedgerUpdate(led, { ok: false, gained: 0, traversed: 0, feetY: 42, now: T0 }) // stall
  assert.equal(led.stage, 1)
  let e = climbEntry(led, { now: T0 + 1, feetY: 42 })
  assert.equal(e.rotateBy, 1) // different bearing than the stalled attempt
  led = climbLedgerUpdate(led, { ok: false, gained: 0, traversed: 12, feetY: 42, now: T0 + 2 }) // gallery
  assert.equal(led.stage, 2)
  e = climbEntry(led, { now: T0 + 3, feetY: 42 })
  assert.equal(e.wetAttempts, CLIMB_STAGE_BUDGETS[2].wetAttempts) // campaign budget
  led = climbLedgerUpdate(led, { ok: false, gained: 3, traversed: 8, feetY: 45, now: T0 + 4 }) // a level!
  assert.equal(led.stage, 0)
  e = climbEntry(led, { now: T0 + 5, feetY: 45 })
  assert.equal(e.stage, 0)
  assert.equal(e.rotateBy, 0) // caller's bearing again
})

// ------------------------------------------------- the final-bank hatch (v0.21.0)

test('entry: force grants ONE stage-1 attempt mid-cooldown instead of the refusal', () => {
  const led = { stage: CLIMB_EXHAUSTED_STAGE, feetY: 42, at: T0 }
  const e = climbEntry(led, { now: T0 + 1000, feetY: 42, force: true })
  assert.equal(e.refused, false)
  assert.equal(e.forced, true)
  // the same budget the cooldown-served path grants: ONE escalated retry
  assert.equal(e.stage, 1)
  assert.equal(e.failLimit, CLIMB_STAGE_BUDGETS[1].failLimit)
  assert.equal(e.wetAttempts, CLIMB_STAGE_BUDGETS[1].wetAttempts)
  assert.equal(e.rotateBy, CLIMB_STAGE_BUDGETS[1].rotateBy)
})

test('entry: force without an exhausted ladder is inert - normal budgets, no forced flag', () => {
  for (const led of [null, { stage: 1, feetY: 42, at: T0 - 1000 }, { stage: 2, feetY: 42, at: T0 - 1000 }]) {
    const e = climbEntry(led, { now: T0, feetY: 42, force: true })
    assert.equal(e.refused, false, String(led))
    assert.equal(e.forced, undefined, String(led))
    assert.equal(e.stage, led ? led.stage : 0, String(led))
  }
})

test('entry: the rescue lift wins over force - a lifted bot restarts fresh at stage 0', () => {
  const led = { stage: CLIMB_EXHAUSTED_STAGE, feetY: 42, at: T0 }
  const e = climbEntry(led, { now: T0 + 1000, feetY: 42 + CLIMB_RESCUE_MIN_GAIN, force: true })
  assert.equal(e.refused, false)
  assert.equal(e.forced, undefined)
  assert.equal(e.stage, 0)
  assert.equal(e.rotateBy, 0)
})

test('climbStarted: the never-tried matrix - every zero means "no ledger touch"', () => {
  // the final-bank bug shape: shouldStop fired at entry, loop never ran once
  assert.equal(climbStarted({}), false)
  assert.equal(climbStarted({ steps: 0, dug: 0, fails: 0, traversed: 0, wetTries: 0 }), false)
  // junk and negative counters are zeros, not attempts
  assert.equal(climbStarted({ steps: -3, dug: NaN, fails: undefined }), false)
  assert.equal(climbStarted(null), false)
  // any real attempt marks the climb started
  assert.equal(climbStarted({ steps: 1 }), true)
  assert.equal(climbStarted({ dug: 2 }), true)
  assert.equal(climbStarted({ fails: 1 }), true) // a burned fail IS an attempt
  assert.equal(climbStarted({ traversed: 5 }), true)
  assert.equal(climbStarted({ wetTries: 1 }), true)
})
