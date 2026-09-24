// Tests for the night-safety policy in src/lib/nightsafety.mjs.
// The fleet loses bots to NIGHT SURFACE WALKS and naked bootstraps (7 deaths
// measured on one churned world) - these tests pin when walking is forbidden,
// how many torches a coal/stick stock yields, and when a shaft needs lighting.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { NIGHT_WALK_START, NIGHT_WALK_END, TORCH_EVERY, walkForbidden, isNight, torchesFrom, torchDue, surfaceHoldVerdict, SURFACE_HOLD_PURPOSES } from '../../src/lib/nightsafety.mjs'

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
  assert.deepEqual([...SURFACE_HOLD_PURPOSES].sort(), ['final-bank', 'respawn-bootstrap'], 'the pinned purposes')
  assert.equal(surfaceHoldVerdict({ timeOfDay: 15000, purpose: 'final-bank' }), 'hold', 'midnight final bank holds')
  assert.equal(surfaceHoldVerdict({ timeOfDay: 12400, purpose: 'final-bank' }), 'hold', 'the dusk margin already holds')
  assert.equal(surfaceHoldVerdict({ timeOfDay: 15000, purpose: 'respawn-bootstrap' }), 'hold', 'the naked respawn holds')
  assert.equal(surfaceHoldVerdict({ timeOfDay: 23599, purpose: 'respawn-bootstrap' }), 'hold', 'the dawn tail still holds')
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
})

test('REGRESSION PIN: the v0.140.1 night hold rides the fleet source', () => {
  const fleetSrc = readFileSync(new URL('../../testbed/fleet19.mjs', import.meta.url), 'utf8')
  assert.match(fleetSrc, /surfaceHoldVerdict\(\{ timeOfDay: miner\.bot\.time\?\.timeOfDay, purpose: 'final-bank' \}\)/, 'the final-bank wave consults the hold')
  assert.match(fleetSrc, /final bank deferred: night/, 'the hold names itself in the final-bank lane')
  assert.match(fleetSrc, /surfaceHoldVerdict\(\{ timeOfDay: miner\.bot\.time\?\.timeOfDay, purpose: 'respawn-bootstrap' \}\)/, 'the respawn bootstrap consults the hold')
  assert.match(fleetSrc, /respawn bootstrap deferred: night/, 'the hold names itself in the bootstrap lane')
  assert.match(fleetSrc, /miner\.climbOut\(\{ dir: direction, force: true, maxMs: 30000/, 'the hold climbs its starter shaft at dawn (the proven pillar-jump exit)')
})
