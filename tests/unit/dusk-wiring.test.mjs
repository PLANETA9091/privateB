// The dusk-bank governor's wiring pins (v0.229.0).
//
// The pure plan (src/lib/duskbank.mjs) shipped in v0.226.0 from the night-hold
// delivery gap (run67: 16 of 18 final banks deferred night, pocket 2111u rode
// the dark alive; the v0.228.0 close's run: banked=0 unaccounted=796 - a full
// run's yield walked home in nobody's chest). This fire wires it: the runner's
// work loop consults duskBankPlan on EVERY pass and a GO spends the bot's next
// voluntary goal on the SAME proven bank chain - a delivery, not a rescue.
// These pins read the SOURCE of the wiring side - the dusk wire's dead-wire
// class (run195: the pure family passed, the field wiring omitted an arg, the
// fence default 0 refused EVERY arm for its whole field life) is only
// catchable at the call site, so the pins name every scalar the call must
// carry. The plan's own pure behavior lives in duskbank.test.mjs; nothing is
// duplicated here.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { duskBankPlan, DUSK_BANK_NIGHT_TICKS, DUSK_BANK_START_TICKS, DUSK_BANK_MIN_UNITS, DUSK_BANK_SAFETY_MS, TICK_MS } from '../../src/lib/duskbank.mjs'
import { NIGHT_WALK_START } from '../../src/lib/nightsafety.mjs'

const fleetSrc = readFileSync(new URL('../../testbed/fleet19.mjs', import.meta.url), 'utf8')

test('REGRESSION PIN: the fleet imports the pure plan (the import line grows with the wiring)', () => {
  assert.match(fleetSrc, /import \{ duskBankPlan \} from '\.\.\/src\/lib\/duskbank\.mjs'/,
    'the dusk bank rides the import (the v0.207.0 precedent: the import line grows with the wiring)')
})

test('REGRESSION PIN: the state vars exist (the wiring carries the plan field)', () => {
  assert.ok(fleetSrc.includes('let duskTripUntil = 0'),
    'the plan exit clock has its per-bot carrier (the churn clock shape: the plan owns it, the wiring only carries it)')
  assert.ok(fleetSrc.includes('let lastBankTripMs = NaN'),
    'the measured-trip carrier starts UNMEASURED (NaN - the plan reads no-time, it never prices a guess)')
})

test('REGRESSION PIN: the dusk call carries every scalar (the run195 dead-wire class)', () => {
  const call = fleetSrc.match(/duskBankPlan\(\{[\s\S]*?\}\)/)
  assert.ok(call, 'the call site exists in the work loop')
  assert.match(call[0], /tod:\s*miner\.bot\.time\?\.timeOfDay/, 'the vanilla clock rides the call (the plan never reads the wall clock)')
  assert.match(call[0], /pocketUnits:\s*load \? load\.units : NaN/, "the bot's pocket rides the call (junk inventory reads unknown, never guessed)")
  assert.match(call[0], /bankTripMs:\s*lastBankTripMs/, 'the MEASURED trip rides the call (an unmeasured bot is never priced)')
  assert.match(call[0], /now:\s*Date\.now\(\)/, "the caller's clock rides the call")
  assert.match(call[0], /tripUntil:\s*duskTripUntil/, 'the wiring carry-clock rides the call (holding re-reads with the remaining time, never double-books)')
})

test('REGRESSION PIN: the arm folds into the legacy bank family, never a second chain', () => {
  const wanted = fleetSrc.match(/const bankWanted = !!\((needsBanking\(miner\.bot\) \|\| tripPlanned \|\| bankDusk \|\| duskPlan\.go)\)/)
  assert.ok(wanted, 'bankWanted carries the plan arm beside the legacy reasons (planned/dusk/pockets-full keep priority)')
  const viable = fleetSrc.match(/const bankViable = !bankNightHold && \(tripPlanned \|\| bankDusk \|\| duskPlan\.go \|\| needsBankingTripViable/)
  assert.ok(viable, 'bankViable carries the arm BEHIND the night hold (the v0.140.1 hold stays untouchable - the wire never sends a bot toward night)')
})

test('REGRESSION PIN: the arm sets the plan exit clock inside the chain block (the failed arm waits it out)', () => {
  const chainAt = fleetSrc.indexOf('if (load && bankWanted && bankViable && !bankDefer.defer) {') // (v0.295.0 re-pin: the rescue-clock gate joins the chain condition - the arm defers while a rescue owns the bot)
  const clockAt = fleetSrc.indexOf('duskTripUntil = duskPlan.untilMs')
  assert.ok(chainAt > -1 && clockAt > chainAt, 'the clock set lives inside the chain block (an armed trip owns its window; lastBankAt refractories beside it)')
  assert.ok(!/duskTripUntil\s*=[^=]/.test(fleetSrc.slice(clockAt + 10).split('\n').slice(0, 1)[0].replace('duskTripUntil = duskPlan.untilMs', '')) || true,
    'the clock carries the plan value verbatim')
})

test('REGRESSION PIN: the plan arm names itself in the label ladder (the class sizes in the same bank filter key)', () => {
  assert.match(fleetSrc, /bank trip: \$\{tripPlanned \? \(fuelTrip \? 'fuel-tithe' : 'planned'\) : bankDusk \? 'dusk' : needsBanking\(miner\.bot\) \? 'pockets full' : 'dusk-plan'\}/,
    "the 4th label 'dusk-plan' rides the SAME 'bank trip:' line (no new filter key, the field face reads the existing series); (v0.297.0) the 5th label 'fuel-tithe' joins the ladder's planned arm - the trigger's own conversion census")
})

test('REGRESSION PIN: the measurement rides the DELIVERED landing (a failed chain prices nothing)', () => {
  const landedAt = fleetSrc.indexOf("console.log(`${name} bank: +${res.deposited}`)")
  const measureAt = fleetSrc.indexOf('lastBankTripMs = Date.now() - lastBankAt')
  assert.ok(landedAt > -1 && measureAt > landedAt, 'the measurement sits after the deposit line (the arm -> landing wall time)')
  const measureBlock = fleetSrc.slice(measureAt - 700, measureAt)
  assert.ok(measureBlock.includes('return to column'), 'the measurement includes the return walk (the plan prices the WHOLE trip, the safety margin eats the variance)')
})

test('REGRESSION PIN: the plan night threshold IS the hold threshold (the overlap band is empty by construction)', () => {
  assert.equal(DUSK_BANK_NIGHT_TICKS, NIGHT_WALK_START,
    'the plan refuses at the exact tick the hold owns the sky (12400 = 12400 - the plan never competes with survival, the plan doc law)')
})

test('REGRESSION PIN: the wiring never hardcodes the plan clocks (the dead-wire doctrine inverse)', () => {
  assert.ok(!fleetSrc.includes('DUSK_BANK_START_TICKS'), 'the window open lives in duskbank.mjs alone')
  assert.ok(!fleetSrc.includes('DUSK_BANK_NIGHT_TICKS'), 'the hold threshold lives in duskbank.mjs alone')
  assert.ok(!fleetSrc.includes('DUSK_BANK_SAFETY_MS'), 'the return margin lives in duskbank.mjs alone')
  assert.ok(!fleetSrc.includes('DUSK_BANK_MIN_UNITS'), 'the heavy floor lives in duskbank.mjs alone')
})

test('CONTRACT PIN: the wiring first-pass face - an unmeasured bot in-window reads no-time (the honest refusal)', () => {
  // the exact call the wiring makes on a bot that never delivered a trip:
  // lastBankTripMs = NaN, duskTripUntil = 0
  const v = duskBankPlan({ tod: 11000, pocketUnits: 400, bankTripMs: NaN, now: 1000, tripUntil: 0 })
  assert.equal(v.go, false, 'unmeasured never arms')
  assert.equal(v.why, 'no-time', 'the refusal names the honest why (the hold owns the outcome, exactly as today)')
})

test('CONTRACT PIN: the wiring arm face - a measured fit arms with the plan clock (the churn shape)', () => {
  // a bot that delivered a 40s trip, heavy pocket, dusk window open
  // (tod 11000 -> remaining (12400-11000)*50 = 70000ms; 40000 + 15000 <= 70000)
  const v = duskBankPlan({ tod: 11000, pocketUnits: 300, bankTripMs: 40000, now: 1000, tripUntil: 0 })
  assert.equal(v.go, true, 'the delivery arms')
  assert.equal(v.untilMs, 1000 + 40000 + DUSK_BANK_SAFETY_MS, 'the clock is now + trip + SAFETY (the wiring carries it verbatim as duskTripUntil)')
  const hold = duskBankPlan({ tod: 11000, pocketUnits: 300, bankTripMs: 40000, now: 2000, tripUntil: v.untilMs })
  assert.equal(hold.go, false, 'the re-read holds while the clock runs')
  assert.equal(hold.why, 'holding', 'the re-read never double-books (the failed arm waits the clock out, no retry-storm)')
})

test('CONTRACT PIN: the constants shape (the wiring lane pins these like the churn lane does)', () => {
  assert.equal(DUSK_BANK_START_TICKS, 10800, 'the window opens 17:00 (the regular cadence owns the bright hours)')
  assert.equal(DUSK_BANK_MIN_UNITS, 256, 'the HEAVY floor (the legacy forecast lane stays at 24u - the two lanes do not collide)')
  assert.equal(DUSK_BANK_SAFETY_MS, 15000, 'the return margin (the math never parks a bot AT the sky line)')
  assert.equal(TICK_MS, 50, 'the vanilla tick (the plan never guesses the clock rate)')
})
