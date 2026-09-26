// Tests for the dusk-forecast bank escalation (v0.193.0) in src/lib/deposit.mjs.
//
// MEASURED (run46, fleet 36195869446): 16/19 bots ended 'final bank deferred:
// night (tod 12400-13106)' - the skip gate handed the pockets to the end-phase,
// the end-phase read the clock inside the walk-forbidden window and deferred,
// and the hard kill ate the pockets. duskBankDue is the arithmetic between the
// two gates: it fires ONLY when (a) the bot's OWN end-phase stagger slot lands
// inside the forbidden window, (b) the full dist-scaled chain + the walk home
// fit the remaining clock (the v0.181.0 doomed class stays refused), (c) the
// whole chain completes BEFORE the window opens (the v0.185.0 dusk-start death
// arithmetic: a trip that crosses the kill window is the measured x12 class),
// and (d) the cadence refractory holds (no retry storm). In the dark the
// escalation NEVER fires - the v0.140.1 hold stays the owner byte for byte.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { duskBankDue, DUSK_BANK_MIN_UNITS, DUSK_BANK_MARGIN_MS } from '../../src/lib/deposit.mjs'
import { NIGHT_WALK_START, TICKS_PER_SEC } from '../../src/lib/nightsafety.mjs'
import { BANK_TRIP_EVERY_MS } from '../../src/lib/deposit.mjs'

// The due fixture, walked gate by gate (d=60: want 195s, own stagger slot 32s):
// (a) forecast 6000 + (300+32)*20 = 12640 -> inside [12400, 23600)
// (b) 300s >= 195s + 90s
// (c) (12400-6000)*50ms = 320s >= 195s + 30s
// (d) 200s >= 150s
const DUE = { timeOfDay: 6000, remainingMs: 300000, units: 30, yardDist: 60, msSinceBank: 200000 }

test('duskBankDue: the measured dusk geometry arms the escalation', () => {
  assert.equal(duskBankDue(DUE), true, 'a dark end-phase forecast + a real trip that fits the light = bank NOW')
})

test('duskBankDue: the units floor relaxes 48 -> 24 but no further', () => {
  assert.equal(duskBankDue({ ...DUE, units: 24 }), true, 'exactly the floor arms')
  assert.equal(duskBankDue({ ...DUE, units: 23 }), false, 'one below the floor stays refused')
  assert.equal(duskBankDue({ ...DUE, units: 48 }), true, 'a full planned-size pocket arms too (the labels differ in the caller)')
})

test('duskBankDue: the light-forecast refusal - the end-phase will actually bank', () => {
  // tod 0 + (600s + 16s stagger for d=70) * 20 = 12320 < 12400: the end-phase
  // reads light, the skip gate's claim is TRUE, the legacy gates own the bot
  assert.equal(duskBankDue({ timeOfDay: 0, remainingMs: 600000, units: 30, yardDist: 70, msSinceBank: 400000 }), false, 'a dawn-run end-phase lands light - no escalation')
})

test('duskBankDue: the dark-now refusal - the night hold stays the owner', () => {
  assert.equal(duskBankDue({ ...DUE, timeOfDay: 12400 }), false, 'at the window start no trip may start')
  assert.equal(duskBankDue({ ...DUE, timeOfDay: 13000 }), false, 'deep in the window the pocket rides out the dark (the v0.140.1 doctrine)')
})

test('duskBankDue: the real-trip fence - a doomed chain stays refused (the v0.181.0 class)', () => {
  // d=200: raw want = 335s -> capped at BANK_TRIP_CAP_MS 300s. 300s remaining
  // < 300s + 90s walk home (the explicit 120s stagger keeps fence (a) passing
  // so THIS fence is the one that refuses)
  assert.equal(duskBankDue({ timeOfDay: 6000, remainingMs: 300000, units: 30, yardDist: 200, msSinceBank: 200000, staggerMs: 120000 }), false, 'a chain that cannot afford itself never fires')
  // d=150: want 285s uncapped. 370s remaining < 285s + 90s - the same refusal
  // with the cap out of play (the forecast is dark: 5500+370*20 = 12900)
  assert.equal(duskBankDue({ timeOfDay: 5500, remainingMs: 370000, units: 30, yardDist: 150, msSinceBank: 200000 }), false, 'the fence is arithmetic, not mood - the uncapped want refuses too')
  // 500s remaining >= 300s + 90s AND the dusk is 370s out (>= 300s + 30s):
  // the same far bot arms once every fence reconciles
  assert.equal(duskBankDue({ timeOfDay: 5000, remainingMs: 500000, units: 30, yardDist: 200, msSinceBank: 200000 }), true, 'all four fences pass at a feasible tod')
})

test('duskBankDue: the light-fit fence - the chain completes BEFORE the window opens', () => {
  // d=150: want = 285s. tod 6200: msUntilDark = (12400-6200)*50 = 310s
  //   < 285s + 30s margin -> the trip would cross the kill window (the
  //   v0.185.0 x12-death class) - refused even though (a) and (b) pass.
  assert.equal(duskBankDue({ timeOfDay: 6200, remainingMs: 380000, units: 30, yardDist: 150, msSinceBank: 400000 }), false, 'a chain that outruns the dusk is the measured death class')
  // tod 5500: msUntilDark = 345s >= 315s AND forecast 5500+(380+0)*20 = 13100 dark
  //   AND 380s >= 285s + 90s -> the same far bot arms earlier in the day
  assert.equal(duskBankDue({ timeOfDay: 5500, remainingMs: 380000, units: 30, yardDist: 150, msSinceBank: 400000 }), true, 'the same trip fits while the light holds')
})

test('duskBankDue: the cadence refractory - no retry storm (the v0.181.0 lesson)', () => {
  assert.equal(duskBankDue({ ...DUE, msSinceBank: 100000 }), false, 'inside the refractory window the gate stays silent')
  assert.equal(duskBankDue({ ...DUE, msSinceBank: 0 }), false, 'a junk/zero since reads 0 -> refused (lastBankAt advances on every attempt in the caller)')
  assert.equal(duskBankDue({ ...DUE, msSinceBank: BANK_TRIP_EVERY_MS }), true, 'exactly one cadence window arms the re-check')
})

test('duskBankDue: the own-stagger forecast - near bots escalate, far bots bank light', () => {
  // The slot arithmetic: a bot AT the yard takes the LAST slot (120s), a bot
  // at refDist+ takes slot 0 (0s). The forecast prices the bot's OWN end-phase.
  assert.equal(duskBankDue({ timeOfDay: 6000, remainingMs: 300000, units: 30, yardDist: 0, msSinceBank: 200000 }), true, 'a yard-side bot banks last (120s slot) - its end-phase is deep dark: escalate')
  // tod 0 + (600s + 16s stagger for d=70)*20 = 12320 < 12400: the far bot's
  // end-phase reads LIGHT, the skip gate's claim is true, the legacy gates own it
  assert.equal(duskBankDue({ timeOfDay: 0, remainingMs: 600000, units: 30, yardDist: 70, msSinceBank: 400000 }), false, 'a far bot in a dawn run banks first (slot 0-2) - its end-phase is light: no escalation')
})

test('duskBankDue: an explicit staggerMs overrides the derived slot', () => {
  assert.equal(duskBankDue({ timeOfDay: 6000, remainingMs: 300000, units: 30, yardDist: 0, msSinceBank: 200000, staggerMs: 0 }), false, 'stagger 0 = the earliest bank: tod 12000 at the deadline - light, no escalation')
  assert.equal(duskBankDue({ timeOfDay: 6000, remainingMs: 250000, units: 30, yardDist: 0, msSinceBank: 200000, staggerMs: 120000 }), true, 'the stagger cap (the worst-case slot) widens the forecast honestly: 13400 at deadline+120s')
})

test('duskBankDue: junk never widens (the legacy gates own a garbage read)', () => {
  for (const t of [undefined, null, NaN, '6000', {}]) {
    assert.equal(duskBankDue({ ...DUE, timeOfDay: t }), false, `junk tod ${String(t)}`)
  }
  for (const r of [undefined, null, NaN, -1, 0]) {
    assert.equal(duskBankDue({ ...DUE, remainingMs: r }), false, `junk remaining ${String(r)}`)
  }
  for (const u of [undefined, null, NaN, '30', {}]) {
    assert.equal(duskBankDue({ ...DUE, units: u }), false, `junk units ${String(u)}`)
  }
  assert.equal(duskBankDue({ timeOfDay: 6000, remainingMs: 300000, units: 30, msSinceBank: 200000, yardDist: NaN }), false, 'junk yardDist -> the legacy slot-0 forecast -> tod 12000 light -> refused')
})

test('duskBankDue: the constants pin', () => {
  assert.equal(DUSK_BANK_MIN_UNITS, 24, 'half the planned floor - the dying pockets measured 40-67u')
  assert.equal(DUSK_BANK_MARGIN_MS, 30000, 'one walk-floor slice of overrun margin')
  assert.equal(TICKS_PER_SEC, 20, 'the vanilla clock rate')
  assert.equal(NIGHT_WALK_START, 12400, 'the fence the escalation must finish before')
})

test('REGRESSION PIN: the dusk escalation rides the deposit module shape', () => {
  const src = readFileSync(new URL('../../src/lib/deposit.mjs', import.meta.url), 'utf8')
  assert.ok(src.includes('export function duskBankDue'), 'the gate is exported')
  assert.ok(src.includes('finalBankDelayMs({ yardDist: d })'), 'the derived forecast prices the bot OWN stagger slot')
  assert.ok(src.includes('forecastForbidden({ timeOfDay, msAhead: remainingMs + stag, ticksPerSec })'), 'the forecast rides the nightsafety projection (one clock arithmetic, no forks)')
  assert.ok(src.includes('if (msUntilDark < want + marg) return false'), 'the light-fit fence is the want, not the floor')
  assert.ok(src.includes('if (remainingMs < want + ret) return false'), 'the real-trip fence prices the walk home')
  assert.ok(src.includes("import { NIGHT_WALK_START, TICKS_PER_SEC, forecastForbidden } from './nightsafety.mjs'"), 'deposit reads the clock from nightsafety (no cycle: nightsafety imports nothing)')
})

test('REGRESSION PIN: the fleet wires the dusk lane with its own label', () => {
  const fleetSrc = readFileSync(new URL('../../testbed/fleet19.mjs', import.meta.url), 'utf8')
  assert.ok(fleetSrc.includes('duskBankDue'), 'the fleet imports the escalation gate')
  assert.ok(fleetSrc.includes('const bankDusk = !!(load && !tripPlanned && duskBankDue({'), 'the dusk gate arms only where the planned gate did not (the labels stay distinct)')
  assert.ok(fleetSrc.includes('needsBanking(miner.bot) || tripPlanned || bankDusk'), 'a dusk trip is a WANTED trip')
  assert.ok(fleetSrc.includes("bank trip: ${tripPlanned ? 'planned' : bankDusk ? 'dusk' : 'pockets full'}"), "the dusk trip names itself - a third label on the 'bank ' filter key")
  assert.ok(fleetSrc.includes('yardDist: bankYardDist'), 'the dusk gate reads the SAME yard distance the budget prices (one read, one truth)')
})
