// (v0.390.0) THE SHOOTER-BAND CENSUS - unit pins (the routecensus
// v0.388.0 test shape). Every anatomy constant is VERBATIM from the held
// artifacts: face 15 (36760275928) for the combat vocabulary, face 19
// (36802577873) for the honest zero baseline (a wet face with zero mob
// engagements reads zero, not null).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseCombatLine, shooterCensus } from '../../src/lib/shootercensus.mjs'

// face-15 verbatims (the ranged band + the verdict/shelter mechanics)
const RING_RANGED = 'F9 [F9] combat: shelter ring ranged mode: the full ring is refused, the arrow wall owns it vs skeleton@2.8'
const SHELTERING = 'F9 [F9] combat: sheltering from skeleton (arrow wall, cells 6/8, proximity re-verdict)'
const COOLDOWN = 'F1 [F1] combat: ranged cooldown armed vs skeleton (10s) - the chase never wins the arrow trade'
const VERDICT_FLIP = 'F12 [F12] combat: verdict flipped to flee vs zombie (hp 12.3)'
const SHELTER_TRY = 'F9 [F9] combat: shelter try vs skeleton (dist 2.8, proximity re-verdict)'
const SHELTER_SKIP_NO_WALL = 'F15 [F15] combat: shelter skip (open field: ring not buildable [-o -o -o -o], no arrow wall either vs drowned@6.9)'
const PAIR_PREEMPT = 'F9 [F9] combat: pair preempt (flip) vs skeleton (hp 20.0, 2 in reach) - the pair trade is never taken'
const YIELD = 'F11 [F11] combat: open-field yield vs spider (hp 10.5 < 14 in the dark) - the flee fired before the drain'
const FIGHTING = 'F9 [F9] combat: fighting drowned'
const FLEE_SHORE = 'F9 [F9] combat: flee toward shore (12,3 step 2) vs drowned (proximity)'

test('ring-ranged verbatim: verb, attacker, dist, ranged, arrow wall', () => {
  const e = parseCombatLine(RING_RANGED)
  assert.deepEqual(e, {
    bot: 'F9', verb: 'ring-ranged', attacker: 'skeleton', dist: 2.8, ranged: true
  })
})

test('sheltering with arrow wall: ranged even without @dist', () => {
  const e = parseCombatLine(SHELTERING)
  assert.equal(e.verb, 'sheltering')
  assert.equal(e.attacker, 'skeleton')
  assert.equal(e.dist, null)
  assert.equal(e.ranged, true)
})

test('ranged cooldown armed: the shooter class', () => {
  const e = parseCombatLine(COOLDOWN)
  assert.equal(e.verb, 'ranged-cooldown')
  assert.equal(e.attacker, 'skeleton')
  assert.equal(e.ranged, true)
})

test('verdict flip + (dist N.N) pricing form', () => {
  const flip = parseCombatLine(VERDICT_FLIP)
  assert.equal(flip.verb, 'verdict-flip')
  assert.equal(flip.attacker, 'zombie')
  const t = parseCombatLine(SHELTER_TRY)
  assert.equal(t.verb, 'shelter-try')
  assert.equal(t.dist, 2.8)
  assert.equal(t.ranged, false)
})

test('shelter skip with the no-arrow-wall prose stays UNRANGED', () => {
  const e = parseCombatLine(SHELTER_SKIP_NO_WALL)
  assert.equal(e.verb, 'shelter-skip')
  assert.equal(e.attacker, 'drowned')
  assert.equal(e.dist, 6.9)
  assert.equal(e.ranged, false, 'the negation prose (no arrow wall) is not a ranged event')
})

test('pair preempt + yield + fighting + flee-shore verb keys', () => {
  assert.equal(parseCombatLine(PAIR_PREEMPT).verb, 'pair-preempt')
  const y = parseCombatLine(YIELD)
  assert.equal(y.verb, 'open-field-yield')
  assert.equal(y.attacker, 'spider')
  assert.equal(parseCombatLine(FIGHTING).verb, 'fighting')
  assert.equal(parseCombatLine(FLEE_SHORE).verb, 'flee-shore')
})

test('the death line\'s shooter inference NEVER double-counts (deathsweep owns it)', () => {
  const death = 'F6 [F6] died - respawning (cause: server: drowned [kind=drown] | inferred: skeleton@14.7 (0s before death at [-127,52,411]) [the inference CONTRADICTS the server verdict - the nearest harm was not the killer (the server kind stays the authority)])'
  assert.equal(parseCombatLine(death), null)
})

test('junk battery: non-string, no marker, truncated body, unknown verb', () => {
  assert.equal(parseCombatLine(null), null)
  assert.equal(parseCombatLine(42), null)
  assert.equal(parseCombatLine('some other line'), null)
  // truncated mid-body (the FATAL face) still lands, honestly
  const trunc = parseCombatLine('F9 [F9] combat: shelter tr')
  assert.equal(trunc.verb, 'other')
  // an unknown verb lands in otherVerbs keyed by its own first token
  const c = shooterCensus(['F9 [F9] combat: gravity slide engaged vs slime@1.0'])
  assert.equal(c.total, 1)
  assert.deepEqual(c.otherVerbs, { gravity: 1 })
})

test('face-15 style aggregate: counts, ranged split, maxDist', () => {
  const c = shooterCensus([
    RING_RANGED, SHELTERING, COOLDOWN, VERDICT_FLIP, SHELTER_TRY,
    SHELTER_SKIP_NO_WALL, PAIR_PREEMPT, YIELD, FIGHTING, FLEE_SHORE
  ])
  assert.equal(c.total, 10)
  assert.deepEqual(c.byAttacker, { skeleton: 5, zombie: 1, drowned: 3, spider: 1 })
  assert.equal(c.ranged.events, 3, 'ring-ranged + sheltering(arrow wall) + cooldown')
  assert.equal(c.ranged.arrowWall, 2)
  assert.equal(c.ranged.ringRangedRefused, 1)
  assert.equal(c.ranged.cooldownArmed, 1)
  assert.deepEqual(c.ranged.byAttacker, { skeleton: 3 })
  assert.equal(c.verdictFlips, 1)
  assert.equal(c.shelter.tries, 1)
  assert.equal(c.shelter.skips, 1)
  assert.equal(c.withDist, 3)
  assert.equal(c.maxDist, 6.9)
  assert.deepEqual(c.otherVerbs, {})
  assert.deepEqual(c.byBot, { F9: 6, F1: 1, F12: 1, F15: 1, F11: 1 })
})

test('face-19 baseline: the wet zero face reads an honest ZERO', () => {
  const c = shooterCensus([
    'F1 [F1] water: shore pinned (r=1 after 8 passes - the shoreline owns this swim; the release takes over)',
    'F3 bank trip: deliverable (clamp) - fleet pocket 495u at 0.3u/s needs 1654s vs 300s the final bank can never grant - the surplus must ride now - the trip fires early'
  ])
  assert.equal(c.total, 0)
  assert.deepEqual(c.byAttacker, {})
  assert.equal(c.ranged.events, 0)
  assert.equal(c.maxDist, null)
})

test('raw text blob input and empty input both hold', () => {
  const blob = shooterCensus(`${FIGHTING}\n${COOLDOWN}\n`)
  assert.equal(blob.total, 2)
  const empty = shooterCensus([])
  assert.equal(empty.total, 0)
  assert.deepEqual(empty.shelter, { tries: 0, skips: 0, ringTries: 0 })
})
