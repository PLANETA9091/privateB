// Trip walk budget (v0.17.0) - distance-scaled map-trip timeouts.
//
// Measured background (fleet 2026-09-20 17:05): F4 climbed out OK, then the
// walk to a KNOWN sand cluster died 'unreachable' with the flat 14s timeout
// - 100+ block targets at pathfinder ground speed need 30s. The claim for
// the target was already registered, so the TTL kept other bots away from a
// trip nobody completed. The budget must scale with distance and stay
// capped (the v0.11.2 A*-expansion OOM lesson forbids open-ended walks).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  walkBudgetMs, WALK_BASE_MS, WALK_PER_BLOCK_MS, WALK_CAP_MS, WALK_OVERHEAD_MS
} from '../../src/lib/tripplan.mjs'

test('near targets keep the historical flat budget', () => {
  assert.equal(walkBudgetMs({ dist: 0 }), WALK_BASE_MS)
  assert.equal(walkBudgetMs({ dist: 10 }), WALK_BASE_MS)
  assert.equal(walkBudgetMs({ dist: 36 }), WALK_BASE_MS) // 36*250+5000 = 14000 exactly
})

test('the budget grows with distance', () => {
  assert.equal(walkBudgetMs({ dist: 60 }), 20000) // 60*250+5000
  assert.equal(walkBudgetMs({ dist: 80 }), 25000) // 80*250+5000
})

test('far targets hit the cap (OOM safety beats reach)', () => {
  assert.equal(walkBudgetMs({ dist: 128 }), WALK_CAP_MS) // 128*250+5000 = 37000 -> capped
  assert.equal(walkBudgetMs({ dist: 5000 }), WALK_CAP_MS)
  assert.ok(WALK_CAP_MS > WALK_BASE_MS, 'a cap at or below the base would ignore distance entirely')
})

test('the walk cap covers the trip radius the map promises', () => {
  // mapTrip maxDistance default is 128 blocks: the cap must let a full-range
  // target actually be reached at pathfinder ground speed (>= 4 b/s)
  assert.ok(WALK_CAP_MS / 1000 * 4 >= 128, 'cap too small for maxDistance 128')
})

test('junk inputs degrade to the base budget, never to zero or NaN', () => {
  assert.equal(walkBudgetMs({ dist: NaN }), WALK_BASE_MS)
  assert.equal(walkBudgetMs({ dist: -50 }), WALK_BASE_MS)
  assert.equal(walkBudgetMs({}), WALK_BASE_MS)
  // Infinity is JUNK (a bot that cannot measure the distance gets the
  // conservative base), not "give it the biggest window we have"
  assert.equal(walkBudgetMs({ dist: Infinity }), WALK_BASE_MS)
})

test('junk parameters never produce a nonsense budget', () => {
  assert.equal(walkBudgetMs({ dist: 60, base: NaN }), 20000) // base falls back to 0, distance math stands
  assert.equal(walkBudgetMs({ dist: 60, perBlock: 'junk' }), WALK_BASE_MS)
  assert.equal(walkBudgetMs({ dist: 60, cap: 100 }), WALK_BASE_MS) // cap below base: base wins (a lie)
  assert.equal(walkBudgetMs({ dist: 60, base: -5 }), 20000) // negative base -> 0 -> overhead+distance stands
  assert.ok(walkBudgetMs({ dist: 60, overhead: -1 }) >= 2000, 'the 2s floor always holds')
})

test('the budget is monotonic in distance', () => {
  let prev = 0
  for (const d of [0, 16, 32, 64, 96, 128, 256]) {
    const b = walkBudgetMs({ dist: d })
    assert.ok(b >= prev, `budget must not shrink as distance grows (${d})`)
    prev = b
  }
})

test('a caller-passed base is honoured (mapTrip forwards walkTimeoutMs)', () => {
  assert.equal(walkBudgetMs({ dist: 0, base: 20000 }), 20000)
  assert.equal(walkBudgetMs({ dist: 60, base: 20000 }), 20000) // max(20000, 20000)
  assert.equal(walkBudgetMs({ dist: 80, base: 20000 }), 25000) // distance still grows past it
})
