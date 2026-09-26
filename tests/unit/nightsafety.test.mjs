// Tests for the night-safety policy in src/lib/nightsafety.mjs.
// The fleet loses bots to NIGHT SURFACE WALKS and naked bootstraps (7 deaths
// measured on one churned world) - these tests pin when walking is forbidden,
// how many torches a coal/stick stock yields, and when a shaft needs lighting.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { NIGHT_WALK_START, NIGHT_WALK_END, TORCH_EVERY, walkForbidden, isNight, torchesFrom, torchDue, surfaceHoldVerdict, SURFACE_HOLD_PURPOSES, TICKS_PER_SEC, forecastForbidden } from '../../src/lib/nightsafety.mjs'

test('walkForbidden: vanilla clock boundaries (dusk margin 12400, dawn margin 23600)', () => {
  assert.equal(walkForbidden(0), false, 'sunrise is a walk time')
  assert.equal(walkForbidden(12399), false, 'the last safe walk tick')
  assert.equal(walkForbidden(NIGHT_WALK_START), true, '12400 = walks stop')
  assert.equal(walkForbidden(13000), true, 'mid-night')
  assert.equal(walkForbidden(23460), true, 'still inside the dawn margin')
  assert.equal(walkForbidden(NIGHT_WALK_END), false, '23600 = walks resume')
  assert.equal(walkForbidden(23999), false, 'late dawn is a walk time')
})

test('walkForbidden: junk clock never traps the bot underground', () => {
  for (const t of [undefined, null, NaN, '13000', {}, -5]) {
    assert.equal(walkForbidden(t), false, String(t))
  }
})

test('isNight: strict mob-spawn window (12610..23460) is tighter than the walk gate', () => {
  assert.equal(isNight(12609), false)
  assert.equal(isNight(12610), true)
  assert.equal(isNight(18000), true, 'midnight')
  assert.equal(isNight(23459), true)
  assert.equal(isNight(23460), false)
  assert.equal(isNight(12500), false, 'dusk margin is walk-forbidden but NOT night yet')
  assert.equal(isNight(NaN), false)
})

test('torchesFrom: vanilla 1 coal + 1 stick -> 4 torches, limiting stock wins', () => {
  assert.equal(torchesFrom({ coal: 1, sticks: 1 }), 4)
  assert.equal(torchesFrom({ coal: 3, sticks: 1 }), 4, 'sticks limit')
  assert.equal(torchesFrom({ coal: 1, sticks: 9 }), 4, 'coal limits')
  assert.equal(torchesFrom({ coal: 7, sticks: 5 }), 20)
  assert.equal(torchesFrom({ coal: 0, sticks: 9 }), 0)
  assert.equal(torchesFrom({ coal: 4 }), 0, 'no sticks - no torches')
  assert.equal(torchesFrom({}), 0)
  assert.equal(torchesFrom({ coal: NaN, sticks: 3 }), 0, 'junk never plans')
  assert.equal(torchesFrom({ coal: -2, sticks: 3 }), 0)
})

test('torchDue: lights every TORCH_EVERY blocks while torches are held', () => {
  assert.equal(TORCH_EVERY, 8, 'the pinned interval (5 torches per 40-block shaft)')
  assert.equal(torchDue({ torchesHeld: 0, blocksSinceTorch: 999 }), false, 'no torches - no light')
  assert.equal(torchDue({ torchesHeld: 2, blocksSinceTorch: 0 }), false)
  assert.equal(torchDue({ torchesHeld: 2, blocksSinceTorch: 7 }), false)
  assert.equal(torchDue({ torchesHeld: 2, blocksSinceTorch: 8 }), true)
  assert.equal(torchDue({ torchesHeld: 2, blocksSinceTorch: 64 }), true)
  assert.equal(torchDue({ torchesHeld: 1, blocksSinceTorch: NaN }), false, 'junk counter never fires')
  assert.equal(torchDue({ torchesHeld: 3, blocksSinceTorch: 1, torchEvery: 1 }), true, 'custom interval')
  assert.equal(torchDue({ torchesHeld: 3, blocksSinceTorch: 0, torchEvery: 0 }), true, 'disabled interval lights immediately')
})

// ---- v0.140.1 THE NIGHT HOLD - the two FORCED surface windows ----
// run554 (35974993311): five skeletons shot the END-PHASE final-bank wave
// (F2/F6/F12/F7/F10 at y 64-66, ~840 pocket units = the unaccounted spike)
// and two more shot the RESPAWNED empty pockets on their gatherWood line
// (F2, F14). The hold verdict defers exactly those two trips inside the
// walk-forbidden window; every other purpose and every daylight hour walks.

test('surfaceHoldVerdict: the measured kill-site purposes hold inside the night window', () => {
  assert.deepEqual([...SURFACE_HOLD_PURPOSES].sort(), ['final-bank', 'mid-bank', 'pre-position', 'respawn-bootstrap'], 'the pinned purposes (v0.185.0 grows the set to the two mid-run night lanes)')
  assert.equal(surfaceHoldVerdict({ timeOfDay: 15000, purpose: 'final-bank' }), 'hold', 'midnight final bank holds')
  assert.equal(surfaceHoldVerdict({ timeOfDay: 12400, purpose: 'final-bank' }), 'hold', 'the dusk margin already holds')
  assert.equal(surfaceHoldVerdict({ timeOfDay: 15000, purpose: 'respawn-bootstrap' }), 'hold', 'the naked respawn holds')
  assert.equal(surfaceHoldVerdict({ timeOfDay: 23599, purpose: 'respawn-bootstrap' }), 'hold', 'the dawn tail still holds')
})

// ---- v0.185.0 THE NIGHT LANE GATE - the mid-run lanes join the hold ----
// run182 (36167325733): 11 of the 17 deaths in the dusk tail (tod 12400+),
// x12 mob kills (zombie x6 all at y 64-66); the mid-run bank trip's own
// chain (climb + yard walk + the return) and the pre-position's last-90s
// window were the two surface lanes no gate covered, and the pre-positioned
// bot the final-bank hold then strands AT the dark yard (F18 [-70,65,419]).

test('surfaceHoldVerdict: the mid-run bank trip and the pre-position hold inside the night window (v0.185.0)', () => {
  assert.equal(surfaceHoldVerdict({ timeOfDay: 15000, purpose: 'mid-bank' }), 'hold', 'midnight bank trips hold')
  assert.equal(surfaceHoldVerdict({ timeOfDay: 12400, purpose: 'mid-bank' }), 'hold', 'the dusk margin already holds the bank trip')
  assert.equal(surfaceHoldVerdict({ timeOfDay: 23599, purpose: 'mid-bank' }), 'hold', 'the dawn tail still holds the bank trip')
  assert.equal(surfaceHoldVerdict({ timeOfDay: 15000, purpose: 'pre-position' }), 'hold', 'midnight pre-positions hold')
  assert.equal(surfaceHoldVerdict({ timeOfDay: 12400, purpose: 'pre-position' }), 'hold', 'the dusk margin already holds the pre-position')
  assert.equal(surfaceHoldVerdict({ timeOfDay: 23599, purpose: 'pre-position' }), 'hold', 'the dawn tail still holds the pre-position')
})

test('surfaceHoldVerdict: the mid-run lanes walk in daylight (the legacy shape by day)', () => {
  assert.equal(surfaceHoldVerdict({ timeOfDay: 0, purpose: 'mid-bank' }), 'go', 'sunrise banks')
  assert.equal(surfaceHoldVerdict({ timeOfDay: 12399, purpose: 'mid-bank' }), 'go', 'the last safe tick walks the trip')
  assert.equal(surfaceHoldVerdict({ timeOfDay: 0, purpose: 'pre-position' }), 'go', 'sunrise pre-positions')
  assert.equal(surfaceHoldVerdict({ timeOfDay: 12399, purpose: 'pre-position' }), 'go', 'the last safe tick pre-positions')
})

test('surfaceHoldVerdict: daylight and the dawn release walk', () => {
  assert.equal(surfaceHoldVerdict({ timeOfDay: 0, purpose: 'final-bank' }), 'go', 'sunrise banks')
  assert.equal(surfaceHoldVerdict({ timeOfDay: 12399, purpose: 'final-bank' }), 'go', 'the last safe tick walks')
  assert.equal(surfaceHoldVerdict({ timeOfDay: 23600, purpose: 'respawn-bootstrap' }), 'go', 'dawn releases the hold')
  assert.equal(surfaceHoldVerdict({ timeOfDay: 1000, purpose: 'respawn-bootstrap' }), 'go', 'morning bootstraps')
})

test('surfaceHoldVerdict: junk-safe - an unreadable clock or purpose never holds', () => {
  assert.equal(surfaceHoldVerdict({ timeOfDay: NaN, purpose: 'final-bank' }), 'go', 'junk clock walks (legacy)')
  assert.equal(surfaceHoldVerdict({ timeOfDay: undefined, purpose: 'final-bank' }), 'go')
  assert.equal(surfaceHoldVerdict({ timeOfDay: 15000, purpose: 'map-trip' }), 'go', 'ungated purposes walk (the trip lane has its own gate)')
  assert.equal(surfaceHoldVerdict({ timeOfDay: 15000, purpose: null }), 'go')
  assert.equal(surfaceHoldVerdict({}), 'go')
  // (v0.185.0) the new purposes inherit the junk contract byte for byte: an
  // unreadable clock NEVER holds the mid-run lanes (a missing read never
  // widens a refusal - the v0.181.0 doctrine)
  assert.equal(surfaceHoldVerdict({ timeOfDay: NaN, purpose: 'mid-bank' }), 'go', 'junk clock walks the bank trip (legacy)')
  assert.equal(surfaceHoldVerdict({ timeOfDay: undefined, purpose: 'pre-position' }), 'go', 'junk clock walks the pre-position (legacy)')
})

test('REGRESSION PIN: the v0.185.0 night lane gate rides the fleet source', () => {
  const fleetSrc = readFileSync(new URL('../../testbed/fleet19.mjs', import.meta.url), 'utf8')
  // the bank gate consults the hold on the mid-bank purpose and the refusal
  // names itself riding the 'bank ' key (the wood trip's 'deferred night'
  // line is the field-proven template)
  assert.match(fleetSrc, /surfaceHoldVerdict\(\{ timeOfDay: miner\.bot\.time\?\.timeOfDay, purpose: 'mid-bank' \}\) === 'hold'/, 'the bank gate consults the hold on the mid-bank purpose')
  assert.match(fleetSrc, /const bankViable = !bankNightHold && \(tripPlanned \|\| bankDusk \|\| needsBankingTripViable/, 'the night hold gates BOTH the planned and the pockets-full paths (v0.193.0 re-pin: the dusk lane joins the same guard)')
  assert.match(fleetSrc, /bank trip: deferred night \(tod=/, 'the hold names itself in the bank lane')
  assert.match(fleetSrc, /the yard walk rides out the dark alive/, 'the deferral names the doctrine')
  // the pre-position gate: the walk-forbidden read sits INSIDE the try, ahead
  // of prePositionDue (junk clock falls through to the legacy walk)
  assert.match(fleetSrc, /if \(walkForbidden\(miner\.bot\.time\?\.timeOfDay\)\) return false\n\s*return prePositionDue/, 'the pre-position holds underground when the clock forbids the walk')
})

test('REGRESSION PIN: the v0.140.1 night hold rides the fleet source', () => {
  const fleetSrc = readFileSync(new URL('../../testbed/fleet19.mjs', import.meta.url), 'utf8')
  assert.match(fleetSrc, /surfaceHoldVerdict\(\{ timeOfDay: miner\.bot\.time\?\.timeOfDay, purpose: 'final-bank' \}\)/, 'the final-bank wave consults the hold')
  assert.match(fleetSrc, /final bank deferred: night/, 'the hold names itself in the final-bank lane')
  assert.match(fleetSrc, /surfaceHoldVerdict\(\{ timeOfDay: miner\.bot\.time\?\.timeOfDay, purpose: 'respawn-bootstrap' \}\)/, 'the respawn bootstrap consults the hold')
  assert.match(fleetSrc, /respawn bootstrap deferred: night/, 'the hold names itself in the bootstrap lane')
  assert.match(fleetSrc, /miner\.climbOut\(\{ dir: direction, force: true, maxMs: 30000/, 'the hold climbs its starter shaft at dawn (the proven pillar-jump exit)')
})

// ---- (v0.193.0) THE TOD FORECAST - the vanilla clock, projected forward ----
// The run46 delivery hole (16/19 'final bank deferred: night') is a scheduling
// lie between two gates that never talk. The forecast is the arithmetic
// between them: tod + msAhead/1000 * TICKS_PER_SEC, then the walkForbidden
// verdict. These tests pin the projection and its junk-safe degradation.

test('TICKS_PER_SEC: the vanilla clock rate is 20 ticks per real second', () => {
  assert.equal(TICKS_PER_SEC, 20, '24000 ticks per 1200s day cycle')
})

test('forecastForbidden: the projection crosses dusk exactly at the known rate', () => {
  assert.equal(forecastForbidden({ timeOfDay: 12300, msAhead: 2000 }), false, '12300 + 40 ticks = 12340 - still light')
  assert.equal(forecastForbidden({ timeOfDay: 12300, msAhead: 10000 }), true, '12300 + 200 ticks = 12500 - the walk lands inside the window')
  assert.equal(forecastForbidden({ timeOfDay: 0, msAhead: 600000 }), false, 'a dawn run deadline (tod 12000) still banks in the light')
  assert.equal(forecastForbidden({ timeOfDay: 500, msAhead: 600000 }), true, 'the measured run46 geometry: dusk at ~tod 12500 at the deadline')
})

test('forecastForbidden: the window END unwinds (past 23600 walks resume)', () => {
  assert.equal(forecastForbidden({ timeOfDay: 13000, msAhead: 0 }), true, 'now is dark')
  assert.equal(forecastForbidden({ timeOfDay: 13000, msAhead: 600000 }), false, '13000 + 12000 ticks = 25000 - past the dawn margin')
})

test('forecastForbidden: junk degrades to the now-verdict, never widens a refusal', () => {
  for (const t of [undefined, null, NaN, '13000', {}]) {
    assert.equal(forecastForbidden({ timeOfDay: t, msAhead: 10000 }), false, `junk clock ${String(t)} -> false`)
  }
  assert.equal(forecastForbidden({ timeOfDay: 12000, msAhead: NaN }), false, 'junk horizon -> walkForbidden(12000) -> light')
  assert.equal(forecastForbidden({ timeOfDay: 13000, msAhead: NaN }), true, 'junk horizon -> walkForbidden(13000) -> the now-verdict holds')
  assert.equal(forecastForbidden({ timeOfDay: 12000, msAhead: -5000 }), false, 'a negative horizon collapses to now')
  assert.equal(forecastForbidden({ timeOfDay: 12000, msAhead: 10000, ticksPerSec: NaN }), false, 'junk rate -> the 20/s constant (12000 + 200 = 12200, light)')
})
