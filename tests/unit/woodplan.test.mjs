// Tests for the wood-gathering policy in src/lib/woodplan.mjs.
// The v0.6.9 Big Fleet wasted bots two ways: a bot holding 7/8 logs idled ~110s
// hunting the last log of an eaten-out forest (the kit needs only 3 logs), and
// 7 bots with logs=0 dug dirt bare-handed for the whole run because nothing ever
// retried their failed bootstrap. The stall-escape decision is pinned here; the
// re-bootstrap loop lives in testbed/fleet19.mjs and is exercised by the CI fleet.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { stalledButCraftable, recoveryDue, recoveryCooldownMs, famineDue, stickSupply, STICK_FAMINE_FLOOR, WOOD_TRIP_EVERY_MS, WOOD_TRIP_MIN_REMAINING_MS } from '../../src/lib/woodplan.mjs'
import { NIGHT_WALK_START, NIGHT_WALK_END } from '../../src/lib/nightsafety.mjs'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

test('stall escape: below goodEnough logs the bot keeps gathering (never crafts a kit from 3 logs)', () => {
  assert.equal(stalledButCraftable({ logs: 0, goodEnough: 4, msSinceGain: 999999, stallMs: 25000 }), false)
  assert.equal(stalledButCraftable({ logs: 3, goodEnough: 4, msSinceGain: 999999, stallMs: 25000 }), false)
})

test('stall escape: enough logs AND stalled -> stop gathering and go craft', () => {
  assert.equal(stalledButCraftable({ logs: 7, goodEnough: 4, msSinceGain: 26000, stallMs: 25000 }), true)
  assert.equal(stalledButCraftable({ logs: 4, goodEnough: 4, msSinceGain: 30000, stallMs: 25000 }), true)
})

test('stall escape: enough logs but progress is fresh -> keep going', () => {
  assert.equal(stalledButCraftable({ logs: 7, goodEnough: 4, msSinceGain: 0, stallMs: 25000 }), false)
  assert.equal(stalledButCraftable({ logs: 7, goodEnough: 4, msSinceGain: 24999, stallMs: 25000 }), false)
})

test('stall escape: boundary equality fires (>= semantics on both checks)', () => {
  assert.equal(stalledButCraftable({ logs: 4, goodEnough: 4, msSinceGain: 25000, stallMs: 25000 }), true)
})

test('stall escape: goodEnough null disables the escape entirely (exact old behaviour)', () => {
  assert.equal(stalledButCraftable({ logs: 8, goodEnough: null, msSinceGain: 999999, stallMs: 25000 }), false)
})

test('stall escape: non-finite inputs are defensive-false (never a crash in the hot loop)', () => {
  assert.equal(stalledButCraftable({ logs: NaN, goodEnough: 4, msSinceGain: 999999, stallMs: 25000 }), false)
  assert.equal(stalledButCraftable({ logs: 7, goodEnough: 4, msSinceGain: NaN, stallMs: 25000 }), false)
  assert.equal(stalledButCraftable({ logs: undefined, goodEnough: 4, msSinceGain: 999999, stallMs: 25000 }), false)
})

test('gatherWood loop accounting: lastGain resets exactly when the log count rises', () => {
  // Mirrors the loop bookkeeping in miner.mjs gatherWood: a chop that produces logs
  // must reset the stall clock, otherwise bots would quit mid-forest.
  let logs = 0
  let lastGain = 1000
  let prevLogs = logs
  const chop = (newLogs, now) => { logs = newLogs; if (logs > prevLogs) { lastGain = now; prevLogs = logs } }
  const stalled = now => stalledButCraftable({ logs: prevLogs, goodEnough: 4, msSinceGain: now - lastGain, stallMs: 25000 })

  chop(7, 2000) // one trunk eaten: 7 logs
  assert.equal(stalled(26000), false, 'fresh progress 24s ago - keep hunting')
  assert.equal(stalled(27001), true, 'stalled >25s with 7 logs - escape fires')
  chop(8, 27002) // the 8th log lands exactly then
  assert.equal(stalled(51000), false, 'the gain reset the clock - escape must not fire')
})

test('recoveryDue: no pickaxe + cooldown elapsed + enough runway -> recover', () => {
  assert.equal(recoveryDue({ hasPick: false, msSinceLast: 46000, remainingMs: 120000 }), true)
})

test('recoveryDue: a bot holding a pickaxe never needs recovery', () => {
  assert.equal(recoveryDue({ hasPick: true, msSinceLast: 999999, remainingMs: 120000 }), false)
})

test('recoveryDue: cooldown not yet elapsed -> keep digging', () => {
  assert.equal(recoveryDue({ hasPick: false, msSinceLast: 45000, remainingMs: 120000 }), false, 'boundary: <= cooldown')
  assert.equal(recoveryDue({ hasPick: false, msSinceLast: 1000, remainingMs: 120000 }), false)
})

test('recoveryDue: too close to the deadline -> never start a ~85s bootstrap', () => {
  assert.equal(recoveryDue({ hasPick: false, msSinceLast: 46000, remainingMs: 80000 }), false, 'boundary: <= minRemaining')
  assert.equal(recoveryDue({ hasPick: false, msSinceLast: 46000, remainingMs: 10000 }), false)
})

test('recoveryDue: the v0.7.0 failure mode is now covered (due mid-shaft, 135s left)', () => {
  // v0.7.0: the initial bootstrap burned ~115s, the first between-shaft check ran at
  // ~65s remaining and the guard blocked it -> recovered=0 forever. Mid-shaft checks
  // with the same clock now fire while there is still runway.
  assert.equal(recoveryDue({ hasPick: false, msSinceLast: 160000, remainingMs: 135000 }), true)
})

// NOTE (v0.9.1): woodplan.upgradeDue was removed - the fleet's mid-run upgrade path
// went through toolupgrade.mjs upgradeCheck (testbed/fleet19.mjs upgradeDueNow) since
// v0.7.5, and the old predicate had no production caller left. The tier logic it
// described lives on in tests/unit/toolupgrade.test.mjs.

// (v0.52.0) THE HOPELESS-LOOP BRAKE - run51 (fleet 35639593200): F7 underground,
// no sticks, no planks, re-ran the ~85s bootstrap every ~60-80s for 350+s. The
// brake stretches the cooldown on every consecutive failure.
test('recoveryCooldownMs: first attempts keep the 45s cadence', () => {
  assert.equal(recoveryCooldownMs(0), 45000)
  assert.equal(recoveryCooldownMs(1), 45000)
})

test('recoveryCooldownMs: consecutive failures stretch 90s -> 180s -> cap ~300s', () => {
  assert.equal(recoveryCooldownMs(2), 90000)
  assert.equal(recoveryCooldownMs(3), 180000)
  assert.ok(recoveryCooldownMs(4) > 300000, 'streak 4 doubles past 300 - capped next')
  assert.equal(recoveryCooldownMs(9), 300150, 'the cap holds (45000 * 6.67)')
})

test('recoveryDue with failStreak: a hopeless bot waits out the stretched cooldown', () => {
  // streak 2 -> 90s cooldown: at 60s since the last attempt the recovery refuses
  assert.equal(recoveryDue({ hasPick: false, msSinceLast: 60000, remainingMs: 120000, failStreak: 2 }), false)
  assert.equal(recoveryDue({ hasPick: false, msSinceLast: 91000, remainingMs: 120000, failStreak: 2 }), true)
  // streak 0 keeps the historical 45s boundary intact
  assert.equal(recoveryDue({ hasPick: false, msSinceLast: 46000, remainingMs: 120000, failStreak: 0 }), true)
})

test('recoveryCooldownMs: junk streaks fall back to the base cadence', () => {
  assert.equal(recoveryCooldownMs(undefined), 45000)
  assert.equal(recoveryCooldownMs(NaN), 45000)
  assert.equal(recoveryCooldownMs(-3), 45000)
})

// ---- v0.179.0: THE STICK FAMINE TRIP - the wood re-supply lane for tooled bots.
// run20 (fleet 36131508220, the v0.177.0 fleet) measured the famine class:
// 'no spare sticks: sticks 1 coals 0' x88 + 'sticks 0 coals 0' x30, 'no fuel' x34,
// torched=13, and the zombie x3 deaths in deep dark shafts. recoveryDue only owns
// PICKAXE-LESS bots - a pickaxed bot with a dry wood pocket had no wood lane at all.

test('stickSupply: the stick-equivalent arithmetic (sticks + 2*planks + 8*logs)', () => {
  assert.equal(stickSupply({ sticks: 1, planks: 0, logs: 0 }), 1, 'run20 famine class: sticks 1 coals 0 planks 0')
  assert.equal(stickSupply({ sticks: 0, planks: 0, logs: 0 }), 0)
  assert.equal(stickSupply({ sticks: 2, planks: 12, logs: 0 }), 26, 'a healthy bootstrap pocket')
  assert.equal(stickSupply({ sticks: 0, planks: 5, logs: 1 }), 18, 'odd planks floor() then 2x, logs 8x')
  assert.equal(stickSupply({}), 0, 'no args is a dry pocket')
})

test('stickSupply: junk inputs count as zero (hostile telemetry never poisons the plan)', () => {
  assert.equal(stickSupply({ sticks: NaN, planks: -5, logs: Infinity }), 0)
  assert.equal(stickSupply({ sticks: '12', planks: null, logs: undefined }), 0)
  assert.equal(stickSupply({ sticks: 2.7 }), 2, 'floors, never rounds up')
})

test('famineDue: the run20 famine class trips (sticks 1 planks 0 logs 0, pickaxe held, overdue, daylight, time to spare)', () => {
  assert.equal(famineDue({
    sticks: 1, planks: 0, logs: 0, hasPick: true,
    msSinceLast: WOOD_TRIP_EVERY_MS + 1000, remainingMs: 300000,
    timeOfDay: 1000
  }), 'due')
})

test('famineDue: a healthy pocket never trips', () => {
  assert.equal(famineDue({
    sticks: 2, planks: 12, logs: 0, hasPick: true,
    msSinceLast: WOOD_TRIP_EVERY_MS + 1000, remainingMs: 300000, timeOfDay: 1000
  }), false)
})

test('famineDue: floor boundary - supply 11 trips, supply 12 does not', () => {
  const args = { hasPick: true, msSinceLast: WOOD_TRIP_EVERY_MS + 1000, remainingMs: 300000, timeOfDay: 1000 }
  assert.equal(STICK_FAMINE_FLOOR, 12)
  assert.equal(famineDue({ ...args, sticks: 1, planks: 5, logs: 0 }), 'due', '1 + 2*5 = 11 < 12')
  assert.equal(famineDue({ ...args, sticks: 2, planks: 5, logs: 0 }), false, '2 + 2*5 = 12 = floor: not starving')
})

test('famineDue: a tool-less bot stays with the recovery lane (its bootstrap gathers wood)', () => {
  assert.equal(famineDue({
    sticks: 0, planks: 0, logs: 0, hasPick: false,
    msSinceLast: WOOD_TRIP_EVERY_MS + 1000, remainingMs: 300000, timeOfDay: 1000
  }), false)
})

test('famineDue: the cadence brake - one trip per WOOD_TRIP_EVERY_MS (a failed forest must not storm the loop)', () => {
  assert.equal(famineDue({
    sticks: 1, planks: 0, logs: 0, hasPick: true,
    msSinceLast: WOOD_TRIP_EVERY_MS, remainingMs: 300000, timeOfDay: 1000
  }), false, 'exactly the cooldown: not due (the bank-trip boundary semantics)')
  assert.equal(famineDue({
    sticks: 1, planks: 0, logs: 0, hasPick: true,
    msSinceLast: WOOD_TRIP_EVERY_MS - 1, remainingMs: 300000, timeOfDay: 1000
  }), false)
})

test('famineDue: the deadline guard - climb + gather + return must fit', () => {
  assert.equal(famineDue({
    sticks: 1, planks: 0, logs: 0, hasPick: true,
    msSinceLast: WOOD_TRIP_EVERY_MS + 1000, remainingMs: WOOD_TRIP_MIN_REMAINING_MS, timeOfDay: 1000
  }), false, 'exactly the floor: refuse')
  assert.equal(famineDue({
    sticks: 1, planks: 0, logs: 0, hasPick: true,
    msSinceLast: WOOD_TRIP_EVERY_MS + 1000, remainingMs: WOOD_TRIP_MIN_REMAINING_MS - 1, timeOfDay: 1000
  }), false)
})

test('famineDue: the night hold - a starving pocket INSIDE the walk-forbidden window defers (the measured kill site)', () => {
  assert.equal(famineDue({
    sticks: 1, planks: 0, logs: 0, hasPick: true,
    msSinceLast: WOOD_TRIP_EVERY_MS + 1000, remainingMs: 300000, timeOfDay: NIGHT_WALK_START + 1
  }), 'deferred-night')
  assert.equal(famineDue({
    sticks: 1, planks: 0, logs: 0, hasPick: true,
    msSinceLast: WOOD_TRIP_EVERY_MS + 1000, remainingMs: 300000, timeOfDay: NIGHT_WALK_END - 1
  }), 'deferred-night', 'the window end is exclusive')
  assert.equal(famineDue({
    sticks: 1, planks: 0, logs: 0, hasPick: true,
    msSinceLast: WOOD_TRIP_EVERY_MS + 1000, remainingMs: 300000, timeOfDay: NIGHT_WALK_START - 1
  }), 'due', 'dusk margin not yet: walk')
})

test('famineDue: junk clocks never trip and never defer (the legacy byte for byte)', () => {
  assert.equal(famineDue({
    sticks: 1, planks: 0, logs: 0, hasPick: true,
    msSinceLast: NaN, remainingMs: 300000, timeOfDay: 1000
  }), false, 'junk cadence clock: not due')
  assert.equal(famineDue({
    sticks: 1, planks: 0, logs: 0, hasPick: true,
    msSinceLast: WOOD_TRIP_EVERY_MS + 1000, remainingMs: NaN, timeOfDay: 1000
  }), false, 'junk remaining: not due')
})

test('REGRESSION PIN: the fleet log filter carries the wood trip key + the famine lines ride it (the v0.176.0 filter-blind lesson)', () => {
  const fleetSrc = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'testbed', 'fleet19.mjs'), 'utf8')
  assert.ok(/combat\\|died\|KICKED\|error\\|climb\|water\\|scan:\\|hop\\|approach\\|swallowed\\|bank \\|deposit\\|torch\\|craft\\|smelt\\|fuel\\|vein sweep\|wood trip/.test(fleetSrc),
    "the miner log filter includes 'wood trip' - the famine lines must reach the artifact")
  for (const shape of [
    'wood trip: famine (sticks ${woodPocket.sticks} planks ${woodPocket.planks} logs ${woodPocket.logs}) - gathering',
    'wood trip: deferred night (tod=',
    'wood trip: gathered (sticks ${after.sticks} planks ${after.planks} logs ${after.logs})',
    'wood trip: 0 (climb refused)'
  ]) {
    assert.ok(fleetSrc.includes(shape), `the fleet emits the line shape: ${shape.slice(0, 40)}...`)
  }
  // the wiring shape: the famine gate reads famineDue and feeds the proven chain
  assert.ok(fleetSrc.includes('famineDue({'), 'the loop calls famineDue')
  assert.ok(fleetSrc.includes("await miner.gatherWood({ want: 8, direction, shouldStop: () => Date.now() > deadline, maxSeconds: 45 })"),
    'the trip gathers wood with the bounded budget')
  assert.ok(fleetSrc.includes("await ensureTools(miner.bot, { miner, log: () => {}, maxSeconds: 30 })"),
    'the trip converts logs -> planks -> sticks through the proven ensureTools chain')
  assert.ok(fleetSrc.includes("await ensureSurface('wood trip')"),
    'the trip climbs out through the shared ensureSurface gate')
  assert.ok(fleetSrc.includes("label: 'return to column'") || fleetSrc.includes("'return to column'"),
    'the trip returns the bot to its column')
})
